import { useRef, useState } from 'react';
import { Alert, Button, Flexbox, Segmented, Slider, Tag } from '@lobehub/ui';
import { app, setSetting, setMode, setGoEnable, cancelGo, canReverse, setStick } from '../lib/controller.js';
import { useApp } from '../hooks.js';
import { vmaxOf, mix } from '../lib/kinematics.js';

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

// Inverse kinematics, with the numbers substituted so you can follow them
function IKCard() {
  const a = useApp(), c = a.cfg;
  const k = c.track / 2 / 50;
  const x = mix(a.v, a.w, c.track), b = a.board;
  const rawL = a.v - a.w * k, rawR = a.v + a.w * k;
  const f = n => (Math.round(n * 10) / 10).toFixed(1).replace('-0.0', '0.0');
  return (
    <div className="ik">
      <div className="ik-row"><span>half-track factor</span><code>T/2 ÷ 50 = {c.track / 2} ÷ 50 = {k.toFixed(2)}</code></div>
      <div className="ik-row"><span>left</span><code>v − w·k = {a.v} − ({a.w})·{k.toFixed(2)} = {f(rawL)} %</code></div>
      <div className="ik-row"><span>right</span><code>v + w·k = {a.v} + ({a.w})·{k.toFixed(2)} = {f(rawR)} %</code></div>
      {x.scale < 1 && <div className="ik-row warn"><span>over 100 %</span><code>both × {x.scale.toFixed(2)} → left {f(x.l)} %, right {f(x.r)} %</code></div>}
      <div className="ik-out">
        <div><span className="muted small">Left wheel</span><b>{Math.round(x.l)} %</b></div>
        <div><span className="muted small">Right wheel</span><b>{Math.round(x.r)} %</b></div>
      </div>
      <Bar label="Left" value={x.l} />
      <Bar label="Right" value={x.r} />
      <h4>Motor output reported by the car</h4>
      <Bar label="Motor L" value={b.l} />
      <Bar label="Motor R" value={b.r} />
    </div>
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
