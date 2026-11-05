// Settings saved in this browser (localStorage). Read and written with try/catch: storage can be blocked.
export const DEFAULTS = {
  target: 'sim', mode: 'manual', theme: 'auto',
  track: 100, wheelD: 65, maxRpm: 120, slew: 400, invL: false, invR: false, swap: false,
  vMax: 60, wMax: 60, base: 45, kp: 40, lost: 'stop', search: 35, irHigh: true,
  simReverse: false, autoReconnect: true, port: '',
};
const KEY = 'steamcar.cfg';
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
let t = 0;
export function saveSettings(cfg) {
  clearTimeout(t);
  t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }, 250);
}
