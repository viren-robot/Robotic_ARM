import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Flexbox, Segmented, Tag } from '@lobehub/ui';
import { useApp } from '../hooks.js';
import { app, stopAll, isMoving, connectUsb, selectedPort, linkState, notify } from '../lib/controller.js';
import { loadManifest, detectChip, writeFirmware } from '../lib/flash.js';

const BAUDS = [115200, 460800, 921600];
const runtime = { session: null };   // the esptool session while the Flash tab holds the port

export function FlashPanel() {
  const a = useApp();
  const [manifest, setManifest] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [fwIndex, setFwIndex] = useState(0);
  const [step, setStep] = useState(1);
  const [chip, setChip] = useState(null);           // { chip, mac }
  const [baud, setBaud] = useState(460800);
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ text: '', cls: '' });
  const [flog, setFlog] = useState([]);
  const flogRef = useRef(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch(e => setLoadErr(`Could not load firmware/manifest.json (${e.message}). Flashing is disabled until it loads.`));
    return () => { runtime.session?.transport?.disconnect?.().catch(() => {}); };
  }, []);
  useEffect(() => { if (flogRef.current) flogRef.current.scrollTop = flogRef.current.scrollHeight; }, [flog]);

  const addLog = (text, nl = true) => setFlog(l => [...l.slice(-400), (nl ? text + '\n' : text)]);
  const fw = manifest?.firmware?.[fwIndex] || null;

  async function detect() {
    if (!linkState().supported()) { setStatus({ text: 'Flashing needs Chrome or Edge on a computer.', cls: 'err' }); return; }
    setBusy(true); setChip(null); setProgress(0);
    setStatus({ text: 'Stopping the car and closing the control connection…', cls: '' });
    setFlog([]);
    stopAll('flashing');
    if (app.connected || app.connecting) await linkState().close(true);
    app.flashing = true; notify();
    try {
      const port = selectedPort() || await navigator.serial.requestPort();
      addLog('Connecting (auto-reset with DTR/RTS)…');
      const session = await detectChip(port, baud, (s, nl) => addLog(s, nl));
      runtime.session = session;
      setChip({ chip: session.chip, mac: session.mac });
      if (session.chip !== 'ESP32') {
        await session.transport.disconnect(); runtime.session = null; setChip(null);
        setStatus({ text: `This board is a ${session.chip}, not a classic ESP32. Nothing was written. The STEAM_CAR firmware is only for the classic ESP32 (the STEMpedia Quarky).`, cls: 'err' });
        setStep(1); return;
      }
      setStep(2);
      setStatus({ text: 'Classic ESP32 detected. Choose the firmware and click “Flash firmware”.', cls: 'ok' });
    } catch (e) {
      addLog('ERROR: ' + e.message);
      setStatus({ text: 'Could not detect the chip: ' + e.message + ' See Troubleshooting below.', cls: 'err' });
      setStep(1);
    } finally { setBusy(false); app.flashing = false; notify(); }
  }

  async function flash() {
    if (!fw || !runtime.session) return;
    if (isMoving()) { setStatus({ text: 'The car is moving. Stop it first.', cls: 'err' }); return; }
    if (erase && !confirm('Erase ALL flash on the Quarky? This deletes everything stored on it, not just the car firmware. Continue?')) return;
    setBusy(true); app.flashing = true; notify();
    try {
      setStatus({ text: `Downloading ${fw.name}…`, cls: '' });
      const r = await fetch(new URL('firmware/' + fw.file, document.baseURI), { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${fw.file}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      await writeFirmware({ session: runtime.session, fw, bytes, eraseAll: erase, log: addLog,
        onProgress: p => { setProgress(p); setStatus({ text: `Writing… ${p} %`, cls: '' }); } });
      await runtime.session.transport.disconnect(); runtime.session = null; setChip(null);
      setProgress(100); setStep(3);
      setStatus({ text: `${fw.name} ${fw.version} installed. Reconnecting the control session…`, cls: 'ok' });
      addLog('Done. Board reset.');
      await new Promise(res => setTimeout(res, 1500));
      await connectUsb(await portFromSession());
    } catch (e) {
      addLog('ERROR: ' + e.message);
      setStatus({ text: 'Flash failed: ' + e.message, cls: 'err' });
      setStep(2);
    } finally {
      try { await runtime.session?.transport?.disconnect(); } catch (x) {}
      runtime.session = null; setChip(null);
      setBusy(false); app.flashing = false; notify();
    }
  }
  async function release() {
    try { await runtime.session?.transport?.disconnect(); } catch (e) {}
    runtime.session = null; setChip(null); setStep(1); setStatus({ text: 'Port released.', cls: '' });
  }

  return (
    <div className="stack">
      <section className="card">
        <Flexbox justify="space-between" align="center" gap={8} wrap="wrap">
          <h3>Firmware to install</h3>
          {manifest ? <Tag color="green">build {manifest.build_time.slice(0, 16).replace('T', ' ')} UTC</Tag> : <Tag color={loadErr ? 'red' : 'default'}>{loadErr ? 'not available' : 'loading…'}</Tag>}
        </Flexbox>
        {loadErr && <Alert type="error" title="Firmware list not available" description={loadErr} style={{ marginTop: 8 }} />}
        {manifest && (
          <>
            <div style={{ marginTop: 10 }}>
              <Segmented block value={fwIndex} onChange={setFwIndex}
                options={manifest.firmware.map((f, i) => ({ value: i, label: f.id === 'steam_car' ? 'Car firmware' : 'IR sensor finder' }))} />
            </div>
            {fw && (
              <div className="small" style={{ marginTop: 8 }}>
                <div>{fw.description}</div>
                <div className="mono muted" style={{ wordBreak: 'break-all' }}>{fw.name} {fw.version} · {fw.size} bytes · SHA-256 {fw.sha256} · written at offset 0x{fw.flash_offset.toString(16)}</div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h3>Flash from the browser</h3>
        <ol className="steps" style={{ marginTop: 10 }}>
          <li className={step === 1 ? 'cur' : step > 1 ? 'done' : ''}>
            <b>Choose the port and detect the chip</b>
            <div className="small muted">Closes the control connection and stops the motors. Pick the Quarky's port in the browser's window.</div>
            <Flexbox gap={8} align="center" wrap="wrap" style={{ marginTop: 6 }}>
              <Button type="primary" onClick={detect} loading={busy && step === 1} disabled={busy || !manifest}>Choose port &amp; detect chip</Button>
              <label className="field inline">Speed
                <select value={baud} onChange={e => setBaud(+e.target.value)} disabled={busy}>{BAUDS.map(b => <option key={b} value={b}>{b}</option>)}</select>
              </label>
            </Flexbox>
            {chip && <div className="small mono" style={{ marginTop: 6 }}>Chip: <b>{chip.chip}</b> · MAC {chip.mac}</div>}
          </li>
          <li className={step === 2 ? 'cur' : step > 2 ? 'done' : ''}>
            <b>Write the firmware</b>
            <div className="small muted">The file's SHA-256 is checked against the manifest first. Then it is written, and the board is reset.</div>
            <div style={{ marginTop: 6 }}>
              <label className="chk"><input type="checkbox" checked={erase} onChange={e => setErase(e.target.checked)} disabled={busy} /> <span>Erase all flash first</span></label>
              {erase && <Alert type="warning" title="Leave this unticked unless the board misbehaves" description="Erasing the whole flash also deletes everything else stored on the Quarky: saved settings, Wi-Fi data and any other program." style={{ marginTop: 6 }} />}
            </div>
            <Flexbox gap={8} wrap="wrap" style={{ marginTop: 8 }}>
              <Button type="primary" onClick={flash} disabled={busy || !chip || !fw} loading={busy && step === 2}>Flash firmware</Button>
              <Button onClick={release} disabled={busy || !chip}>Cancel / release port</Button>
            </Flexbox>
            <div className="progress" style={{ marginTop: 8 }}><div style={{ width: progress + '%' }} /></div>
            <div className={'small ' + status.cls} style={{ marginTop: 6 }}>{status.text}</div>
          </li>
          <li className={step === 3 ? 'cur' : ''}>
            <b>Reconnect</b>
            <div className="small muted">After the reset the page reconnects by itself and waits for the car to say hello.</div>
          </li>
        </ol>
        {!status.text && <div className="small muted">Start with step 1.</div>}
        <div className="console small" ref={flogRef} style={{ height: 150, marginTop: 8 }}>{flog.join('')}</div>
      </section>

      <section className="card">
        <h3>Troubleshooting</h3>
        <details open><summary>The chip isn't detected (“Failed to connect”)</summary>
          <ol>
            <li>Unplug the USB cable, hold the board's <b>BOOT</b> (IO0 / FLASH) button, plug the cable in and keep holding for about 2 seconds. Click <b>Choose port &amp; detect chip</b>.</li>
            <li>Or with the cable plugged in: hold <b>BOOT</b>, tap <b>RST / EN</b> once, then release <b>BOOT</b>.</li>
            <li>After flashing, press <b>RST / EN</b> (or replug) if the board doesn't restart by itself.</li>
            <li>If there is no BOOT button, try another USB cable (some are charge-only) and 115200.</li>
          </ol>
        </details>
        <details><summary>The port is busy</summary>
          <ul>
            <li>Only one program can use a serial port at a time. Close the Arduino IDE (and its Serial Monitor), Thonny, PuTTY and any other tab using a serial page.</li>
            <li>Unplug and replug the cable, then choose the port again.</li>
            <li>Linux: add your user to <code>dialout</code> (<code>sudo usermod -aG dialout $USER</code>, then log out and in). Windows: install the CH340 or CP210x driver if the port is missing.</li>
          </ul>
        </details>
        <details><summary>A flash failed or stopped half-way</summary>
          <ul>
            <li>Just flash again. The built-in bootloader stays intact, so the board can always be flashed again.</li>
            <li>Try 115200, a better cable, and a USB port directly on the computer.</li>
            <li>If it still fails, enter the bootloader by hand, tick <b>Erase all flash first</b> and flash again.</li>
            <li>If the hash check fails, reload the page with Ctrl+F5.</li>
          </ul>
        </details>
        <details><summary>After flashing, the page can't talk to the car</summary>
          <ul>
            <li>Wait a few seconds, then use <b>Reconnect</b> in the header.</li>
            <li>The console should show a <code>hello</code> from <code>steam-car</code>. The IR sensor finder prints readings instead: flash the car firmware again.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}

// after the reset the browser still knows the port the user picked
async function portFromSession() { return selectedPort() || (await navigator.serial.getPorts())[0] || null; }

