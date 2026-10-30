#!/usr/bin/env node
// Builds the ready-made armctl firmware that the page uploads to the Arduino Uno ("Upload to Arduino" in Settings).
//
// The page can't compile C++, so this compiles the sketch template in index.html twice (NeoPixels off / on) with
// placeholder settings, finds where those settings sit in the flash image, and stores both images in index.html
// (<script id="fwImages">). When uploading, the page writes your pins, limits and LED settings over the placeholder.
//
// Needs avr-gcc + avr-libc, the Arduino AVR core, and the Servo and Adafruit NeoPixel libraries:
//   Ubuntu/Debian: apt install gcc-avr avr-libc arduino-core-avr
//   git clone --branch 1.2.2 https://github.com/arduino-libraries/Servo
//   git clone --branch 1.12.3 https://github.com/adafruit/Adafruit_NeoPixel
// Usage: node tools/build-firmware.js --servo <Servo dir> --neopixel <Adafruit_NeoPixel dir> [--core <avr core dir>] [--keep <dir>]
// Run it again whenever the sketch template in index.html changes (the page warns in its console when it's stale).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const CORE = arg('core') || '/usr/share/arduino/hardware/arduino/avr';
const SERVO = arg('servo'), NEO = arg('neopixel'), KEEP = arg('keep');   // --keep: also save the .elf files there
if (!SERVO || !NEO) { console.error('usage: node tools/build-firmware.js --servo <dir> --neopixel <dir> [--core <dir>]'); process.exit(1); }
const HTML = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const template = html.match(/<script type="text\/plain" id="fwTemplate">\n([\s\S]*?)<\/script>/)[1];

// Same layout as `struct Config` in the sketch (AVR: no padding, little-endian) and as fwConfigBytes() in the page.
// Placeholder values are chosen so the 52 bytes can't appear anywhere else in the image.
const placeholder = {
  magic: 0xA7F3, timeout: 0x5EB1,
  servos: [0, 1, 2, 3].map(i => ({ pin: 0xF1 + i, min: 0x9A10 + i, max: 0xB7C0 + i, slew: 0xD3E0 + i })),
  ledPin: 0xE9, ledCount: 0xE8, ledBpp: 0xE7, ledKhz800: 0xE6, order: 'QZXJ', fx: [...Array(11).keys()].map(i => 0xC1 + i * 3),
};
function configBytes(c) {
  const b = [], u16 = v => b.push(v & 255, v >> 8 & 255);
  u16(c.magic); u16(c.timeout);
  for (const s of c.servos) { b.push(s.pin); u16(s.min); u16(s.max); u16(s.slew); }
  b.push(c.ledPin, c.ledCount, c.ledBpp, c.ledKhz800);
  for (let i = 0; i < 5; i++) b.push(i < 4 ? c.order.charCodeAt(i) || 0 : 0);
  b.push(...c.fx);
  return Buffer.from(b);
}
const c = placeholder;
const cfgInit = `{ ${c.magic}, ${c.timeout}, { ${c.servos.map(s => `{${s.pin}, ${s.min}, ${s.max}, ${s.slew}}`).join(', ')} }, ` +
  `${c.ledPin}, ${c.ledCount}, ${c.ledBpp}, ${c.ledKhz800}, "${c.order}", { ${c.fx.join(', ')} } }`;

const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h.toString(16).padStart(8, '0'); };

const flags = ['-mmcu=atmega328p', '-DF_CPU=16000000L', '-DARDUINO=10819', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR', '-Os', '-g',
  '-ffunction-sections', '-fdata-sections', '-flto', '-w'];
const inc = [`${CORE}/cores/arduino`, `${CORE}/variants/standard`, `${CORE}/libraries/EEPROM/src`, `${SERVO}/src`, NEO].map(d => '-I' + d);
const cc = (src, out) => {
  const cpp = /\.(cpp|ino)$/.test(src);
  execFileSync('avr-gcc', ['-c', ...flags, ...(cpp ? ['-x', 'c++', '-std=gnu++11', '-fpermissive', '-fno-exceptions', '-fno-threadsafe-statics']
    : /\.S$/.test(src) ? ['-x', 'assembler-with-cpp'] : ['-std=gnu11']), ...inc, src, '-o', out], { stdio: 'inherit' });
};

function build(neopixel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'armctl-')), objs = [];
  const sketch = path.join(dir, 'armctl.cpp');
  fs.writeFileSync(sketch, '#include <Arduino.h>\n#line 1 "armctl.ino"\n' + template.replace('{{USE_NEOPIXEL}}', neopixel ? '1' : '0').replace('{{CFG}}', cfgInit));
  const srcs = [sketch,
    ...fs.readdirSync(`${CORE}/cores/arduino`).filter(f => /\.(c|cpp|S)$/.test(f)).map(f => `${CORE}/cores/arduino/${f}`),
    `${SERVO}/src/avr/Servo.cpp`, ...(neopixel ? [`${NEO}/Adafruit_NeoPixel.cpp`] : [])];
  srcs.forEach((s, i) => { const o = path.join(dir, i + '.o'); cc(s, o); objs.push(o); });
  const elf = path.join(dir, 'armctl.elf'), bin = path.join(dir, 'armctl.bin');
  execFileSync('avr-gcc', ['-mmcu=atmega328p', '-Os', '-flto', '-fuse-linker-plugin', '-Wl,--gc-sections', '-w', '-o', elf, ...objs, '-lm'], { stdio: 'inherit' });
  execFileSync('avr-objcopy', ['-O', 'binary', '-R', '.eeprom', elf, bin]);
  const img = fs.readFileSync(bin), pat = configBytes(placeholder);
  const at = img.indexOf(pat);
  if (at < 0 || img.indexOf(pat, at + 1) >= 0) throw new Error('placeholder settings not found exactly once in the image');
  if (img.length > 32256) throw new Error('image too big for the Uno (' + img.length + ' bytes)');
  const ram = execFileSync('avr-size', ['-A', elf]).toString();
  const sec = n => +((ram.match(new RegExp('^\\' + n + '\\s+(\\d+)', 'm')) || [])[1] || 0);
  console.log(`NeoPixel ${neopixel ? 'on ' : 'off'}: ${img.length} bytes flash, ${sec('.data') + sec('.bss')} bytes RAM, settings at 0x${at.toString(16)}`);
  if (KEEP) { fs.mkdirSync(KEEP, { recursive: true }); fs.copyFileSync(elf, path.join(KEEP, `armctl-neopixel${+neopixel}.elf`)); }
  fs.rmSync(dir, { recursive: true });
  return { size: img.length, cfgAt: at, data: img.toString('base64') };
}

const fw = (template.match(/#define FW "([^"]+)"/) || [])[1];
const out = { fw, src: hash(template), built: new Date().toISOString().slice(0, 10), neopixel: { 0: build(false), 1: build(true) } };
const json = JSON.stringify(out);
const re = /(<script type="application\/json" id="fwImages">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) throw new Error('no <script id="fwImages"> in index.html');
fs.writeFileSync(HTML, html.replace(re, (_, a, b) => a + json + b));
console.log(`index.html updated (${fw}, template ${out.src})`);
