// Flashing from the browser with esptool-js 0.7.0 (vendored in public/vendor). Classic ESP32 only.
// Firmware images are merged .bin files written at offset 0x0; the page checks size and SHA-256 first.

const VENDOR = 'vendor/esptool-js-0.7.0/esptool-js.bundle.js';
let lib = null;
async function esptool() {
  if (!lib) lib = await import(/* @vite-ignore */ new URL(VENDOR, document.baseURI).href);
  return lib;
}

export async function loadManifest() {
  const r = await fetch(new URL('firmware/manifest.json', document.baseURI), { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// terminal for esptool-js: its log lines go to the Flash tab's log
function terminal(log) {
  return { clean() {}, write: s => log(s, false), writeLine: s => log(s, true) };
}

// Opens the port, resets the board into its bootloader and checks the chip. Returns { transport, loader, chip, mac }.
export async function detectChip(port, baud, log) {
  const { Transport, ESPLoader } = await esptool();
  const transport = new Transport(port, false);
  const loader = new ESPLoader({ transport, baudrate: baud, romBaudrate: 115200, terminal: terminal(log) });
  try {
    await loader.main('default_reset');
    const chip = loader.chip.CHIP_NAME;
    const mac = await loader.chip.readMac(loader);
    return { transport, loader, chip, mac };
  } catch (e) {
    try { await transport.disconnect(); } catch (x) {}
    throw e;
  }
}

// Verifies the bytes against the manifest, writes them, resets the board.
export async function writeFirmware({ session, fw, bytes, eraseAll, onProgress, log }) {
  const hash = await sha256Hex(bytes);
  if (bytes.length !== fw.size || hash !== fw.sha256) {
    throw new Error(`hash check failed (got ${hash.slice(0, 12)}…, manifest ${fw.sha256.slice(0, 12)}…). Nothing was written. Reload the page and try again.`);
  }
  log(`Checked ${fw.name}: ${bytes.length} bytes, SHA-256 matches the manifest.`, true);
  await session.loader.writeFlash({
    fileArray: [{ data: bytes, address: fw.flash_offset }],
    flashMode: 'dio', flashFreq: '40m', flashSize: 'detect',
    eraseAll, compress: true,
    reportProgress: (i, written, total) => onProgress(Math.round(written / total * 100)),
  });
  await session.loader.after('hard_reset');
}
