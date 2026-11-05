import { useRef, useState } from 'react';
import { Alert, Button, Flexbox, Segmented, Slider, Tag } from '@lobehub/ui';
import { app, setSetting, setMode, setGoEnable, cancelGo, canReverse, setStick } from '../lib/controller.js';
import { useApp } from '../hooks.js';
import { vmaxOf, mix } from '../lib/kinematics.js';
import { ikGeometry } from '../lib/ik.js';

/* ---------- small pieces ---------- */
export function Bar({ label, value, text }) {
  const v = value == null ? null : Math.max(-100, Math.min(100, value));
  const f = v == null ? 0 : v / 100;
  return (
    <div className="barrow">
      <span>{label}</span>
      <div className="bar">
        {v != null && <i style={{ left: f >= 0 ? '50%' : `${50 + f * 50}%`, width: `${Math.abs(f) * 50}%`, background: v < 0 ? 'var(--blue)' : 'var(--accent)' }} />}
        <b />
      </div>
      <span className="num">{v == null ? '–' : (text ?? Math.round(v))}</span>
    </div>
  );
}
export function Check({ k, label, value, onChange }) {
  return (
    <label className="chk">
      <input type="checkbox" checked={!!value} onChange={e => onChange ? onChange(e.target.checked) : setSetting(k, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
export function Num({ k, label, min, max, step = 1, value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) setSetting(k, n); }} />
    </label>
  );
}

/* ---------- Drive ---------- */
export function DrivePanel() {
  const a = useApp(), c = a.cfg;
  const reverse = canReverse();
  return (
    <div className="stack">
      <section className="card">
        <Flexbox justify="space-between" align="center" gap={8} wrap="wrap" style={{ marginBottom: 10 }}>
          <h3>Manual drive</h3>
          <Tag color={a.armed ? 'green' : 'default'}>{a.armed ? 'sending 20 Hz' : 'idle'}</Tag>
        </Flexbox>
        <div className="drive-top">
          <Joystick />
          <div className="grow">
            <Bar label="v" value={a.v} text={`${a.v} %`} />
            <Bar label="w" value={a.w} text={`${a.w} %`} />
            <h4>Inverse kinematics</h4>
            <IKCard />
          </div>
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Max speed: {c.vMax} %</span>
            <Slider min={10} max={100} step={1} value={c.vMax} onChange={v => setSetting('vMax', v)} />
          </label>
          <label className="field">
            <span>Max turn rate: {c.wMax} %</span>
            <Slider min={10} max={100} step={1} value={c.wMax} onChange={v => setSetting('wMax', v)} />
          </label>
        </div>
        <p className="small muted">
          Keys: <kbd>W</kbd>/<kbd>↑</kbd> forward · <kbd>S</kbd>/<kbd>↓</kbd> back · <kbd>A</kbd>/<kbd>←</kbd> turn left · <kbd>D</kbd>/<kbd>→</kbd> turn right · <kbd>Space</kbd> or <kbd>Esc</kbd> STOP.
          Commands go out 20 times a second; the car stops by itself if they stop arriving for 0.4 s.
        </p>
        {!reverse && <Alert type="info" title="This car cannot reverse" description="Its motors have one PWM pin each (no direction pins in the firmware): backward speeds and the inner wheel of a sharp turn are limited to 0." />}
      </section>
      <section className="card">
        <Flexbox justify="space-between" align="center" gap={8} wrap="wrap">
          <h3>Click to go <Tag>approximate</Tag></h3>
          {a.go && <Button size="small" onClick={cancelGo}>Cancel</Button>}
        </Flexbox>
        <label className="chk" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={a.goEnable} onChange={e => setGoEnable(e.target.checked)} />
          <span>Click a point on the map and the car drives there</span>
        </label>
        <p className="small muted">Position is estimated by dead reckoning from the wheel commands: there are no encoders, so it drifts. A proportional heading controller steers; the car stops within 25 mm of the estimate.</p>
        {a.goText && <div className="small mono">{a.goText}</div>}
      </section>
    </div>
  );
}

// Inverse kinematics: the formulas with your numbers, and a diagram of the same geometry
function IKCard() {
  const a = useApp(), c = a.cfg, b = a.board;
  const g = ikGeometry(a.v, a.w, c.track);
  const k = c.track / 2 / 50;
  const f = n => (Math.round(n * 10) / 10).toFixed(1).replace('-0.0', '0.0');
  return (
    <div className="ik">
      <IKDiagram g={g} track={c.track} />
      <div className="ik-row"><span>half-track factor</span><code>T/2 ÷ 50 = {c.track / 2} ÷ 50 = {k.toFixed(2)}</code></div>
      <div className="ik-row"><span>left</span><code>v − w·k = {a.v} − ({a.w})·{k.toFixed(2)} = {f(a.v - a.w * k)} %</code></div>
      <div className="ik-row"><span>right</span><code>v + w·k = {a.v} + ({a.w})·{k.toFixed(2)} = {f(a.v + a.w * k)} %</code></div>
      {g.scale < 1 && <div className="ik-row warn"><span>over 100 %</span><code>both × {g.scale.toFixed(2)} → left {f(g.vl)} %, right {f(g.vr)} %</code></div>}
      <div className="ik-row"><span>turn</span><code>{g.kind === 'arc' ? `radius ${Math.round(Math.abs(g.R))} mm, centre on the ${g.R > 0 ? 'left' : 'right'}` : g.kind === 'spin' ? 'on the spot (centre fixed)' : g.kind === 'straight' ? 'straight' : 'stopped'}</code></div>
      <div className="ik-out">
        <div><span className="muted small">Left wheel</span><b>{Math.round(g.vl)} %</b></div>
        <div><span className="muted small">Right wheel</span><b>{Math.round(g.vr)} %</b></div>
      </div>
      <Bar label="Left" value={g.vl} />
      <Bar label="Right" value={g.vr} />
      <h4>Motor output reported by the car</h4>
      <Bar label="Motor L" value={b.l} />
      <Bar label="Motor R" value={b.r} />
    </div>
  );
}

// Top-down diagram: forward is up. Wheel arrows show speed and direction, the dashed line is the path, the dot is the turning centre.
export function IKDiagram({ g, track }) {
  const W = 300, H = 220, cx = W / 2, cy = H / 2 + 20, s = 0.42;    // px per mm
  const P = ([lx, ly]) => [cx - ly * s, cy - lx * s];
  const path = g.path.map(P).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const body = { w: track * s, l: 130 * s };
  const arrow = (wy, speed) => {
    const [x0, y0] = P([0, wy]), len = Math.abs(speed) * 0.9 * (track > 0 ? 1 : 1), dir = speed >= 0 ? -1 : 1;
    const x1 = x0, y1 = y0 + dir * len;
    const col = Math.abs(speed) < 1 ? 'var(--muted)' : speed > 0 ? 'var(--accent)' : 'var(--blue)';
    return (
      <g key={wy}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={col} strokeWidth="4" strokeLinecap="round" />
        {Math.abs(speed) >= 1 && <polygon points={`${x1},${y1} ${x1 - 6},${y1 + (dir < 0 ? 9 : -9)} ${x1 + 6},${y1 + (dir < 0 ? 9 : -9)}`} fill={col} />}
      </g>
    );
  };
  const icc = g.icc ? P(g.icc) : null;
  const [bx, by] = P([0, 0]);
  return (
    <svg className="ikdiag" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wheel speeds: left ${Math.round(g.vl)} %, right ${Math.round(g.vr)} %`}>
      <rect x="0" y="0" width={W} height={H} rx="10" className="ikbg" />
      {icc && Math.abs(icc[0] - bx) < W * 3 && Math.abs(icc[1] - by) < H * 3 && <line x1={bx} y1={by} x2={icc[0]} y2={icc[1]} className="ikspoke" />}
      {g.path.length > 1 && <polyline points={path} className="ikpath" />}
      {icc && icc[0] > -W && icc[0] < 2 * W && icc[1] > -H && icc[1] < 2 * H && <circle cx={icc[0]} cy={icc[1]} r="4" className="ikicc" />}
      <rect x={bx - body.l / 2} y={by - body.w / 2} width={body.l} height={body.w} rx="6" className="ikbody" />
      <polygon points={`${bx},${by - body.l * 0.62} ${bx - 6},${by - body.l * 0.5} ${bx + 6},${by - body.l * 0.5}`} className="ikbody-nose" />
      {g.wheels.map(w => arrow(w.y, w.speed))}
      <text x={cx} y={H - 8} textAnchor="middle" className="iklabel">forward ↑ · turning centre ●</text>
    </svg>
  );
}

function Joystick() {
  const ref = useRef(null), [knob, setKnob] = useState({ x: 0, y: 0 });
  const move = e => {
    const r = ref.current.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / (R - 20), y = -(e.clientY - r.top - R) / (R - 20);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    setKnob({ x, y }); setStick(x, y, true);
  };
  const up = () => { setKnob({ x: 0, y: 0 }); setStick(0, 0, false); };
  return (
    <div className="joy-wrap">
      <div className="joy" ref={ref}
        onPointerDown={e => { if (app.cfg.mode !== 'manual') return; ref.current.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={e => { if (app.stick.on) move(e); }}
        onPointerUp={up} onPointerCancel={up} role="slider" aria-label="Drive joystick: up forward, right turns right"
        aria-valuetext={`v ${Math.round(knob.y * 100)} %, w ${Math.round(-knob.x * 100)} %`}>
        <div className="knob" style={{ left: `calc(50% + ${knob.x * 62}px - 30px)`, top: `calc(50% - ${knob.y * 62}px - 30px)` }} />
      </div>
      <div className="small muted center">drag · up = forward · right = turn right</div>
    </div>
  );
}

/* ---------- Line follow ---------- */
export function LinePanel() {
  const a = useApp(), c = a.cfg, f = a.fw, s = a.board.s;
  const noSensors = c.target === 'car' && f && !f.line;
  const running = c.mode === 'line';
  return (
    <div className="stack">
      <section className="card">
        <Flexbox justify="space-between" align="center" gap={8} wrap="wrap">
          <h3>Line follow</h3>
          <Button type={running ? 'default' : 'primary'} danger={running} disabled={noSensors}
            onClick={() => setMode(running ? 'manual' : 'line')}>{running ? 'Stop line follow' : 'Start line follow'}</Button>
        </Flexbox>
        <div className="sensors">
          <span className={'led' + (s && s[0] ? ' on' : '')} /> Left sensor
          <span className={'led' + (s && s[1] ? ' on' : '')} style={{ marginLeft: 18 }} /> Right sensor
        </div>
        <div className="small">Status: <b>{running ? a.board.state : (a.board.state === 'stopped' ? 'stopped' : 'not running')}</b>
          {!s && <span className="muted"> (no sensor data{c.target === 'car' ? ': pins not set or not connected' : ''})</span>}</div>
        {noSensors && <Alert type="warning" title="No IR sensor pins in this firmware" description="IR_LEFT_PIN / IR_RIGHT_PIN are −1, so line follow is off. Flash the IR sensor finder, read the pins, set them in steam_car.ino and flash again." />}
        <p className="small muted">Line following runs on the car, so it keeps going whatever the USB link does. The page must keep talking to the car: if it goes quiet for 2 s, the car stops.</p>
      </section>
      <section className="card">
        <h3>Line follow settings</h3>
        <div className="grid2" style={{ marginTop: 10 }}>
          <label className="field"><span>Base speed: {c.base} %</span><Slider min={10} max={100} step={1} value={c.base} onChange={v => setSetting('base', v)} /></label>
          <label className="field"><span>Kp (turn gain): {c.kp}</span><Slider min={0} max={150} step={1} value={c.kp} onChange={v => setSetting('kp', v)} /></label>
          <label className="field"><span>Search speed: {c.search} %</span><Slider min={10} max={80} step={1} value={c.search} onChange={v => setSetting('search', v)} /></label>
          <label className="field"><span>When the line is lost</span>
            <Segmented block value={c.lost} onChange={v => setSetting('lost', v)} options={[{ value: 'stop', label: 'Stop' }, { value: 'search', label: 'Search' }]} />
          </label>
        </div>
        <div style={{ marginTop: 10 }}><Check k="irHigh" label="Sensor reads 1 (HIGH) when it is over the line" value={c.irHigh} /></div>
        <p className="small muted">Two sensors give three cases: line on the left → steer left, on the right → steer right, both or centred → straight. Search turns towards where the line was last seen.</p>
      </section>
    </div>
  );
}

/* ---------- Settings ---------- */
export function SettingsPanel() {
  const a = useApp(), c = a.cfg, f = a.fw;
  const pin = n => n >= 0 ? `GPIO ${n}` : <b>not set</b>;
  return (
    <div className="stack">
      <section className="card">
        <h3>Car geometry (inverse kinematics)</h3>
        <div className="grid2" style={{ marginTop: 10 }}>
          <Num k="track" label="Track width (mm)" min={20} max={500} value={c.track} />
          <Num k="wheelD" label="Wheel diameter (mm)" min={10} max={200} value={c.wheelD} />
          <Num k="maxRpm" label="Max wheel speed (rpm), for the map" min={10} max={600} step={5} value={c.maxRpm} />
          <Num k="slew" label="Speed change limit (% per second)" min={20} max={5000} step={10} value={c.slew} />
        </div>
        <div className="note"><code>left = v − w·T/2</code> &nbsp; <code>right = v + w·T/2</code><br />
          <span className="small">v = forward %, w = turn rate % (positive = turn left), T = track width. If a wheel would pass 100 %, both are scaled by the same factor.</span></div>
      </section>
      <section className="card">
        <h3>Wiring corrections</h3>
        <div className="row" style={{ gap: 18, marginTop: 8 }}>
          <Check k="invL" label="Invert left motor" value={c.invL} />
          <Check k="invR" label="Invert right motor" value={c.invR} />
          <Check k="swap" label="Swap left / right" value={c.swap} />
        </div>
        <p className="small muted">If the car turns the wrong way, fix it here. Swap is applied first, then the inversions. They are sent to the car, so line follow uses them too.</p>
      </section>
      <section className="card">
        <h3>Simulator</h3>
        <div style={{ marginTop: 8 }}><Check k="simReverse" label="The virtual car can reverse (the real car reports whether it can)" value={c.simReverse} /></div>
        <p className="small muted">Without direction pins the real car cannot reverse, so the Simulator behaves the same unless you tick this.</p>
      </section>
      <section className="card">
        <h3>Car firmware</h3>
        {f ? (
          <div className="small" style={{ marginTop: 8 }}>
            {f.fw} {f.ver}<br />
            Motor L PWM: GPIO {f.pins?.lp} · Motor R PWM: GPIO {f.pins?.rp}<br />
            Direction pins: {pin(f.pins?.ld)} / {pin(f.pins?.rd)} → reverse <b>{f.reverse ? 'available' : 'not available'}</b><br />
            IR sensor pins: {pin(f.pins?.il)} / {pin(f.pins?.ir)} → line follow <b>{f.line ? 'available' : 'not available'}</b>
          </div>
        ) : <p className="small muted">{c.target === 'sim' ? 'Simulator: no firmware.' : 'Connect the car to see its firmware, pins and abilities.'}</p>}
      </section>
    </div>
  );
}
