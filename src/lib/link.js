// USB link over Web Serial (Chrome / Edge). JSON lines at 115200 baud.
export const BAUD = 115200;
const hex4 = v => v == null ? '----' : v.toString(16).toUpperCase().padStart(4, '0');

export function portLabel(p) {
  const i = p.getInfo();
  return `USB ${hex4(i.usbVendorId)}:${hex4(i.usbProductId)}`;
}

export class SerialLink {
  // handlers: { onLine(obj), onConnected(), onClosed(byUser), onLog(text, cls) }
  constructor(handlers) {
    this.h = handlers; this.port = null; this.writer = null; this.reader = null;
    this.connected = false; this.connecting = false; this.wantOpen = false;
  }
  supported() { return 'serial' in navigator; }
  async open(port) {
    if (this.connected || this.connecting) return false;
    if (!this.supported()) { this.h.onLog('Web Serial is not supported in this browser: use Chrome or Edge.', 'er'); return false; }
    this.connecting = true;
    try {
      port ||= await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD });
      try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) {}  // don't reset the board
      this.port = port; this.wantOpen = true;
      this.writer = port.writable.getWriter();
      this.connected = true; this.connecting = false;
      this.h.onConnected(port);
      this.readLoop();
      return true;
    } catch (e) {
      this.connecting = false;
      if (e.name !== 'NotFoundError') this.h.onLog('Connect failed: ' + e.message + (e.name === 'NetworkError' || e.name === 'InvalidStateError' ? ' (is another program using the port? See Flash → Troubleshooting.)' : ''), 'er');
      return false;
    }
  }
  async readLoop() {
    const dec = new TextDecoder(); let buf = '';
    try {
      this.reader = this.port.readable.getReader();
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch (e) { this.h.onLog('« ' + line); continue; }
          this.h.onLine(m);
        }
        if (buf.length > 8192) buf = '';
      }
    } catch (e) { if (this.connected) this.h.onLog('USB error: ' + e.message, 'er'); }
    finally { try { this.reader.releaseLock(); } catch (e) {} }
    if (this.connected) this.close(false);
  }
  async close(byUser = true) {
    if (byUser) this.wantOpen = false;
    const was = this.connected, p = this.port;
    this.connected = false; this.connecting = false; this.port = null;
    if (p) {
      try { await this.reader?.cancel(); } catch (e) {}
      try { this.writer?.releaseLock(); } catch (e) {}
      try { await p.close(); } catch (e) {}
    }
    this.writer = null;
    if (was) this.h.onClosed(byUser);
  }
  write(obj) {
    if (!this.connected || !this.writer) return false;
    this.writer.write(new TextEncoder().encode(JSON.stringify(obj) + '\n')).catch(() => {});
    return true;
  }
}
