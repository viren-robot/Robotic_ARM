// The app's state and logic, kept outside React so the 20 Hz command loop and the 60 fps map never wait for a render.
// React components subscribe with subscribe() and read `app` directly.
import { loadSettings, saveSettings } from './settings.js';
import { SimCar } from './sim.js';
import { mix, unwire, vmaxOf, wrapPi, clamp, D2R } from './kinematics.js';
import { SerialLink, portLabel } from './link.js';
import { TRACK } from './track.js';

export const app = {
  cfg: loadSettings(),
  board: { mode: 'manual', state: 'idle', l: null, r: null, s: null, at: 0 },
  fw: null,                 // last hello from the real car
  ports: [],                // { port, key, label }
  connecting: false, connected: false, rtt: null,
  v: 0, w: 0, src: '', armed: false,
  keys: new Set(), stick: { x: 0, y: 0, on: false },
  est: { x: 0, y: 0, th: 0 }, trail: [],
  go: null, goText: '', goEnable: false,
  modeChangedAt: 0,
  flashing: false,
  logs: [],                 // { t, text, cls }
  version: 0,
};
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
let notifyT = 0;
export function notify() { app.version++; for (const fn of subs) fn(); }
function notifySoon() { const now = performance.now(); if (now - notifyT > 90) { notifyT = now; notify(); } }

export function log(text, cls = '') {
  app.logs.push({ t: new Date().toLocaleTimeString(), text, cls });
  if (app.logs.length > 400) app.logs.splice(0, app.logs.length - 400);
  notify();
}
export const clearLog = () => { app.logs = []; notify(); };
export const canReverse = () => app.cfg.target === 'sim' ? !!app.cfg.simReverse : !!(app.fw && app.fw.reverse);
export const isSim = () => app.cfg.target === 'sim';
export const isMoving = () => app.armed && (app.v !== 0 || app.w !== 0 || Math.abs(app.board.l || 0) > 1 || Math.abs(app.board.r || 0) > 1);

/* ---------- settings ---------- */
export function setSetting(k, v) {
  app.cfg[k] = v; saveSettings(app.cfg);
  if (['track', 'slew', 'base', 'kp', 'lost', 'search', 'invL', 'invR', 'swap', 'irHigh'].includes(k)) sendCfgSoon();
  if (k === 'simReverse') { app.board = { ...app.board }; }
  notify();
}
const cfgPacket = () => { const c = app.cfg; return { t: 'cfg', track: c.track, slew: c.slew, base: c.base, kp: c.kp, lost: c.lost, search: c.search, invL: c.invL, invR: c.invR, swap: c.swap, irHigh: c.irHigh }; };
let cfgT = 0;
const sendCfgSoon = () => { clearTimeout(cfgT); cfgT = setTimeout(() => send(cfgPacket(), true), 150); };

/* ---------- the simulator and the real car ---------- */
const sim = new SimCar(obj => setTimeout(() => onCarMessage(obj), 0));
export const simPose = () => sim.pose;
export const simSensors = () => sim.sensors();
export const simTrack = () => TRACK;

const pingSent = new Map();
const link = new SerialLink({
  onConnected: port => {
    app.connecting = false; app.connected = true; app.fw = null; app.cfg.port = portKeyOf(port); saveSettings(app.cfg);
    log(`USB port open (${portLabel(port)}). Waiting for the car to say hello…`, 'rx');
    link.write({ t: 'hello' });
    setTimeout(() => { if (app.connected && !app.fw) link.write({ t: 'hello' }); }, 1200);
    setTimeout(() => { if (app.connected && !app.fw) log('No hello from the car yet. Is the STEAM_CAR firmware installed? (Flash tab)', 'wa'); }, 4000);
    refreshPorts(); notify();
  },
  onClosed: byUser => {
    app.connected = false; app.connecting = false; app.fw = null; app.board = { ...app.board, l: null, r: null, s: null };
    if (!byUser) { stopAll('USB disconnected'); }
    log(byUser ? 'Disconnected' : 'USB connection lost', byUser ? '' : 'er');
    notify();
  },
  onLine: m => onCarMessage(m),
  onLog: (text, cls) => log(text, cls),
});
export const serialSupported = () => link.supported();
export const linkState = () => link;

function portKeyOf(p) { const i = p.getInfo(); return `${i.usbVendorId}:${i.usbProductId}`; }
export async function refreshPorts() {
  if (!link.supported()) return;
  const list = await navigator.serial.getPorts();
  app.ports = list.map(p => ({ port: p, key: portKeyOf(p), label: portLabel(p) }));
  notify();
}
export function selectedPort() {
  return app.ports.find(p => p.key === app.cfg.port)?.port || (app.ports.length === 1 ? app.ports[0].port : null);
}
export async function connectUsb(port = null, { askIfNone = true } = {}) {
  if (link.connected || link.connecting) return;
  app.connecting = true; notify();
  const ok = await link.open(port || selectedPort() || (askIfNone ? null : undefined));
  if (!ok) { app.connecting = false; notify(); }
  refreshPorts();
}
export async function disconnectUsb() { await link.close(true); }
export async function reconnectUsb() {
  stopAll('reconnect'); await link.close(false);
  await new Promise(r => setTimeout(r, 600));
  const p = selectedPort(); if (p) await connectUsb(p);
}

export function send(obj, quiet = false) {
  let ok;
  if (isSim()) { sim.handle(obj, canReverse()); ok = true; }
  else ok = link.write(obj);
  if (ok && !quiet) log('→ ' + JSON.stringify(obj), 'tx');
  return ok;
}
export const sendRaw = obj => send(obj, false);

/* ---------- messages from the car (real or virtual) ---------- */
function onCarMessage(m) {
  if (m.t === 'hello') {
    app.fw = m; log(`← hello  ${m.fw} ${m.ver}`, 'rx');
    send(cfgPacket(), true);                                 // the car may have just restarted: give it our settings
    if (app.cfg.mode === 'line' && !isSim()) send({ t: 'mode', m: 'line' });
  } else if (m.t === 'ack' && m.what === 'ping') {
    const s = pingSent.get(m.id); if (s != null) app.rtt = Math.round(performance.now() - s); pingSent.delete(m.id);
  } else if (m.t === 'ack' && m.what === 'mode' && m.ok === false) {
    app.cfg.mode = 'manual'; saveSettings(app.cfg);
    log('The car cannot line-follow: its IR sensor pins are not set in the firmware.', 'er');
  } else if (m.t === 'status') {
    const now = performance.now(), prev = app.board;
    deadReckon(m, prev.at ? (now - prev.at) / 1000 : 0);
    app.board = { mode: m.mode, state: m.state, l: m.l, r: m.r, s: m.s, at: now };
    if (m.mode !== app.cfg.mode && now - app.modeChangedAt > 800) {   // the car changed mode by itself
      app.cfg.mode = m.mode; saveSettings(app.cfg);
      if (m.state === 'timeout') log('The car stopped: lost contact.', 'wa');
    }
  } else if (m.t === 'log') {
    log('car: ' + m.msg, 'wa');
  } else if (m.t !== 'ack') {
    log('← ' + JSON.stringify(m));
  }
  notifySoon();
}
setInterval(() => {
  if (!isSim() && !link.connected) return;
  const id = Math.floor(performance.now());
  pingSent.set(id, performance.now());
  if (pingSent.size > 20) pingSent.delete(pingSent.keys().next().value);
  send({ t: 'ping', id }, true);
}, 500);

/* ---------- dead reckoning (approximate: no encoders) ---------- */
function deadReckon(m, dt) {
  if (m.l == null || dt <= 0 || dt > 1) return;
  const w = unwire(m.l, m.r, app.cfg), vm = vmaxOf(app.cfg), e = app.est;
  const vl = w.l / 100 * vm, vr = w.r / 100 * vm, v = (vl + vr) / 2, om = (vr - vl) / app.cfg.track;
  e.th = wrapPi(e.th + om * dt); e.x += v * Math.cos(e.th) * dt; e.y += v * Math.sin(e.th) * dt;
  const t = app.trail[app.trail.length - 1];
  if (!t || Math.hypot(e.x - t[0], e.y - t[1]) > 8) { app.trail.push([e.x, e.y]); if (app.trail.length > 600) app.trail.shift(); }
}
export const poseNow = () => isSim() ? sim.pose : app.est;

/* ---------- safety and modes ---------- */
export function stopAll(why = '') {
  app.v = app.w = 0; app.armed = false; app.keys.clear(); app.stick = { x: 0, y: 0, on: false }; app.go = null; app.goText = '';
  send({ t: 'stop' });
  if (why) log('STOP (' + why + ')', 'wa');
  notify();
}
export function setMode(m) {
  if (m === app.cfg.mode) return;
  stopAll('mode change');
  app.cfg.mode = m; app.modeChangedAt = performance.now(); saveSettings(app.cfg);
  send(cfgPacket(), true); send({ t: 'mode', m });
  notify();
}
export function setTarget(t) {
  if (t === app.cfg.target) return;
  stopAll('target change');
  app.cfg.target = t; app.cfg.mode = 'manual'; app.modeChangedAt = performance.now(); saveSettings(app.cfg);
  app.board = { mode: 'manual', state: 'idle', l: null, r: null, s: null, at: 0 };
  app.est = { x: 0, y: 0, th: 0 }; app.trail = [];
  if (t === 'sim') { app.fw = null; sim.reset(); send({ t: 'hello' }, true); }
  else if (!link.connected) log('Click “Connect USB” to talk to the car.', 'wa');
  notify();
}
export function resetPose() {
  stopAll('reset car');
  sim.reset(); app.est = { x: 0, y: 0, th: 0 }; app.trail = []; notify();
}

/* ---------- manual input ---------- */
const KEYMAP = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
export function keyDown(key) {
  const k = KEYMAP[key.toLowerCase()]; if (!k) return false;
  if (app.cfg.mode !== 'manual') return true;
  app.keys.add(k); app.armed = true; app.go = null; notify(); return true;
}
export function keyUp(key) { const k = KEYMAP[key.toLowerCase()]; if (k) app.keys.delete(k); }
export function clearKeys() { app.keys.clear(); }
export function setStick(x, y, on) { app.stick = { x, y, on }; if (on) { app.armed = true; app.go = null; } notify(); }

export function goTo(x, y) {
  app.go = { x, y, t0: performance.now() }; app.armed = true; app.keys.clear(); notify();
}
export function setGoEnable(v) { app.goEnable = v; if (!v) { app.go = null; app.goText = ''; } notify(); }
export function cancelGo() { app.go = null; app.goText = 'Cancelled'; notify(); }
function goControl() {                                       // proportional heading controller on the estimate
  const g = app.go, p = app.est, c = app.cfg;
  if (performance.now() - g.t0 > 60000) { app.go = null; app.goText = 'Gave up after 60 s'; return { v: 0, w: 0 }; }
  const dx = g.x - p.x, dy = g.y - p.y, dist = Math.hypot(dx, dy), err = wrapPi(Math.atan2(dy, dx) - p.th);
  if (dist < 25) { app.go = null; app.goText = 'Arrived (estimated position)'; return { v: 0, w: 0 }; }
  const w = clamp(err * 70, -c.wMax, c.wMax);
  const v = Math.abs(err) > 1.0 ? 0 : Math.min(c.vMax * 0.7, 20 + dist * 0.3) * Math.max(0, Math.cos(err));
  app.goText = `Going to (${Math.round(g.x)}, ${Math.round(g.y)}) mm · ${Math.round(dist)} mm to go · heading error ${Math.round(err / D2R)}° (estimated)`;
  return { v, w };
}
function command() {
  const c = app.cfg;
  if (app.go) return { ...goControl(), src: 'go' };
  if (app.keys.size) return { v: ((app.keys.has('f') ? 1 : 0) - (app.keys.has('b') ? 1 : 0)) * c.vMax, w: ((app.keys.has('l') ? 1 : 0) - (app.keys.has('r') ? 1 : 0)) * c.wMax, src: 'keys' };
  if (app.stick.on) return { v: app.stick.y * c.vMax, w: -app.stick.x * c.wMax, src: 'stick' };   // stick right = turn right = w < 0
  return { v: 0, w: 0, src: '' };
}

/* ---------- loops ---------- */
let started = false;
export function start() {
  if (started) return; started = true;
  // 20 Hz: the one place drive commands are sent
  setInterval(() => {
    if (app.cfg.mode !== 'manual') { app.v = app.w = 0; app.src = ''; return; }
    const c = command(); app.v = Math.round(c.v); app.w = Math.round(c.w); app.src = c.src;
    if (app.armed && (isSim() || link.connected)) send({ t: 'drive', v: app.v, w: app.w }, true);
    if (!c.src) app.armed = false;                          // nothing held: the stop was the last command
    notifySoon();
  }, 50);
  // frame loop: the virtual car
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (isSim()) sim.step(dt, now, canReverse());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // a hidden tab stops the car
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll('tab hidden'); });
  addEventListener('pagehide', () => { try { stopAll('page closed'); } catch (e) {} });
  addEventListener('blur', () => clearKeys());
  if (isSim()) send({ t: 'hello' }, true);
  refreshPorts();
  if (link.supported()) navigator.serial.addEventListener('disconnect', e => { if (link.port && e.target === link.port && link.connected) link.close(false); refreshPorts(); });
  log(`STEAM_CAR ready. Target: ${isSim() ? 'Simulator' : 'Real car (USB)'}. Mode: ${app.cfg.mode.toUpperCase()}.`);
}
export { mix };
