import { useEffect, useState } from 'react';
import { Button, Segmented } from '@lobehub/ui';
import { useApp } from './hooks.js';
import { setMode, setTarget, stopAll, connectUsb, disconnectUsb, reconnectUsb, setSetting, selectedPort, keyDown, keyUp, serialSupported, resetPose, start, refreshPorts, poseNow } from './lib/controller.js';
import { mix } from './lib/kinematics.js';
import MapView from './components/MapView.jsx';
import { DrivePanel, LinePanel, SettingsPanel } from './components/Panels.jsx';
import { FlashPanel } from './components/FlashPanel.jsx';
import { Console } from './components/Console.jsx';

const TABS = [
  { value: 'drive', label: 'Drive' },
  { value: 'line', label: 'Line follow' },
  { value: 'settings', label: 'Settings' },
  { value: 'flash', label: 'Flash firmware' },
];

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const a = useApp();
  const [tab, setTab] = useState('drive');
  const [verbose, setVerbose] = useState(false);
  const [view3d, setView3d] = useState(true);
  const theme = resolveTheme(a.cfg.theme);
  const stopped = a.board.state === 'stopped' && a.cfg.mode === 'manual' && !a.armed;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { start(); }, []);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); stopAll('Esc'); return; }
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) stopAll('Space'); return; }
      if (keyDown(e.key)) e.preventDefault();
    };
    const onUp = e => keyUp(e.key);
    addEventListener('keydown', onKey); addEventListener('keyup', onUp);
    return () => { removeEventListener('keydown', onKey); removeEventListener('keyup', onUp); };
  }, []);

  const connected = a.connected, busy = a.flashing || a.connecting;
  const connText = a.cfg.target === 'sim' ? 'Simulator (no USB needed)'
    : a.connecting ? 'Connecting…'
    : connected ? `${a.ports.find(p => p.key === a.cfg.port)?.label || 'USB'} · ${a.fw ? `${a.fw.fw} ${a.fw.ver}` : 'waiting for hello'}${a.rtt != null ? ` · ${a.rtt} ms` : ''}`
    : 'Not connected';
  const dot = a.cfg.target === 'sim' ? 'dot' : connected ? (a.fw ? 'dot ok' : 'dot warn') : a.connecting ? 'dot warn' : 'dot err';

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 64 64" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"><rect x="10" y="22" width="44" height="22" rx="6" /><circle cx="20" cy="48" r="7" /><circle cx="44" cy="48" r="7" /></svg>
          </div>
          <div><h1>STEAM_CAR</h1><span className="muted small">Quarky 2-wheel car</span></div>
        </div>
        <Segmented value={a.cfg.target} onChange={t => setTarget(t)} title="Simulator never touches the real car"
          options={[{ value: 'sim', label: 'Simulator' }, { value: 'car', label: 'Real car (USB)' }]} />
        <Segmented value={a.cfg.mode} onChange={m => setMode(m)} title="Control mode"
          options={[{ value: 'manual', label: 'MANUAL' }, { value: 'line', label: 'LINE FOLLOW' }]} />
        <span className="pill"><span className={dot} /><span>{connText}</span></span>
        {a.cfg.target === 'car' && (
          <>
            <select className="portsel" aria-label="USB port" value={a.cfg.port}
              onChange={async e => { if (e.target.value === '__add') { const p = await navigator.serial.requestPort().catch(() => null); if (p) { await refreshPorts(); setSetting('port', a.ports.find(x => x.port === p)?.key || ''); } return; } setSetting('port', e.target.value); }}
              disabled={!serialSupported() || busy}>
              {a.ports.length === 0 && <option value="">No port chosen</option>}
              {a.ports.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="__add">Choose another port…</option>
            </select>
            <Button onClick={() => (connected || a.connecting) ? disconnectUsb() : connectUsb(selectedPort())} disabled={busy}>{connected || a.connecting ? 'Disconnect' : 'Connect USB'}</Button>
            <Button onClick={reconnectUsb} disabled={!connected || busy}>Reconnect</Button>
          </>
        )}
        <Segmented value={a.cfg.theme} onChange={t => setSetting('theme', t)} title="Colour theme"
          options={[{ value: 'light', label: '☀ Light' }, { value: 'auto', label: '◐ Auto' }, { value: 'dark', label: '☾ Dark' }]} />
        <button type="button" className="stop" onClick={() => stopAll('STOP button')} title="Stop the motors (Space)">STOP</button>
      </header>

      <main className="layout">
        <section className="viewer card">
          <MapView theme={theme} view3d={view3d} />
          <div className="overlay tl">
            <span className={'badge ' + (stopped ? 'stopped' : a.cfg.mode)}>{stopped ? 'STOPPED' : a.cfg.mode === 'line' ? 'LINE FOLLOW' : 'MANUAL'}</span>
            <span className={'badge ' + (a.cfg.target === 'sim' ? 'sim' : 'car')}>{a.cfg.target === 'sim' ? 'SIMULATOR' : 'REAL CAR'}</span>
          </div>
          <Readout />
          <div className="overlay bl small muted">
            {a.cfg.target === 'sim' ? 'Simulator: the orange line is a virtual track for LINE FOLLOW. ' : 'Pose is estimated by dead reckoning (no encoders): it drifts. '}
            Mouse wheel zooms the map.
          </div>
          <div className="overlay tr row">
            <Segmented value={view3d ? '3d' : '2d'} onChange={v => setView3d(v === '3d')} size="small"
              options={[{ value: '2d', label: '2D map' }, { value: '3d', label: '3D view' }]} />
            <Button size="small" onClick={resetPose}>Reset car</Button>
          </div>
        </section>

        <section className="side">
          <nav className="tabs-nav">
            <Segmented block value={tab} onChange={setTab} options={TABS} />
          </nav>
          {tab === 'drive' && <DrivePanel />}
          {tab === 'line' && <LinePanel />}
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'flash' && <FlashPanel />}
        </section>
      </main>

      <div className="bottom">
        <Console verbose={verbose} setVerbose={setVerbose} />
      </div>
    </div>
  );
}

function Readout() {
  const a = useApp();
  const p = poseNow();
  const x = mix(a.v, a.w, a.cfg.track);
  return (
    <div className="readout mono">
      x {Math.round(p.x)} mm  y {Math.round(p.y)} mm  θ {Math.round(p.th / (Math.PI / 180))}° {a.cfg.target === 'sim' ? '(simulated)' : '(estimated)'}<br />
      v {a.v} %  w {a.w} %  L {Math.round(x.l)}  R {Math.round(x.r)}
    </div>
  );
}
