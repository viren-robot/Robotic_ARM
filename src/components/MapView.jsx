import { useEffect, useRef } from 'react';
import { app, poseNow, simSensors, simTrack, isSim, goTo } from '../lib/controller.js';
import { mix, vmaxOf, D2R, clamp } from '../lib/kinematics.js';
import Scene3D from './Scene3D.jsx';

const PALETTE = {
  light: { bg: '#e9edf2', grid: '#cfd6df', grid2: '#b9c2ce', text: '#5d6b7b', car: '#4a515c', wheel: '#16202b', accent: '#f26b1d', blue: '#2f7cf6', ok: '#1f9d55', track: '#f26b1d' },
  dark: { bg: '#12161c', grid: '#262d36', grid2: '#3a4452', text: '#8b96a5', car: '#4a515c', wheel: '#0b0e12', accent: '#ff7d33', blue: '#5b9cff', ok: '#3cc97a', track: '#ff7d33' },
};

// Top-down map of the car: pose, wheels, sensors, turning arc, the virtual track and the click-to-go target.
export default function MapView({ theme, view3d }) {
  if (view3d) return <div className="mapwrap"><Scene3D theme={theme} /><MapSensors /></div>;
  return <Map2D theme={theme} />;
}

function Map2D({ theme }) {
  const ref = useRef(null);
  const view = useRef({ s: 0.7, x: 0, y: 0, drag: null });

  useEffect(() => {
    const cv = ref.current, cx = cv.getContext('2d');
    let raf = 0;
    const size = () => {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
      return { W: r.width, H: r.height, d };
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { W, H, d } = size(); if (!W) return;
      const C = PALETTE[theme] || PALETTE.light, v = view.current;
      cx.setTransform(d, 0, 0, d, 0, 0); cx.fillStyle = C.bg; cx.fillRect(0, 0, W, H);
      const p = poseNow(); v.x += (p.x - v.x) * 0.15; v.y += (p.y - v.y) * 0.15;
      const s = v.s, X = x => W / 2 + (x - v.x) * s, Y = y => H / 2 - (y - v.y) * s;
      const x0 = v.x - W / 2 / s, x1 = v.x + W / 2 / s, y0 = v.y - H / 2 / s, y1 = v.y + H / 2 / s;
      cx.lineWidth = 1;
      for (let gx = Math.floor(x0 / 100) * 100; gx <= x1; gx += 100) { cx.strokeStyle = gx % 500 === 0 ? C.grid2 : C.grid; cx.beginPath(); cx.moveTo(X(gx), 0); cx.lineTo(X(gx), H); cx.stroke(); }
      for (let gy = Math.floor(y0 / 100) * 100; gy <= y1; gy += 100) { cx.strokeStyle = gy % 500 === 0 ? C.grid2 : C.grid; cx.beginPath(); cx.moveTo(0, Y(gy)); cx.lineTo(W, Y(gy)); cx.stroke(); }
      cx.fillStyle = C.text; cx.font = '10px ui-monospace, monospace'; cx.fillText('grid 100 mm', 8, H - 8);
      if (isSim()) {
        cx.strokeStyle = C.track; cx.lineWidth = Math.max(3, 20 * s); cx.lineJoin = 'round'; cx.beginPath();
        simTrack().forEach(([tx, ty], i) => i ? cx.lineTo(X(tx), Y(ty)) : cx.moveTo(X(tx), Y(ty)));
        cx.closePath(); cx.stroke();
      }
      if (app.trail.length > 1) {
        cx.strokeStyle = C.blue; cx.globalAlpha = .5; cx.lineWidth = 2; cx.beginPath();
        app.trail.forEach(([tx, ty], i) => i ? cx.lineTo(X(tx), Y(ty)) : cx.moveTo(X(tx), Y(ty)));
        cx.stroke(); cx.globalAlpha = 1;
      }
      if (app.go) {
        const gx = X(app.go.x), gy = Y(app.go.y);
        cx.strokeStyle = C.ok; cx.lineWidth = 2; cx.beginPath(); cx.arc(gx, gy, 12, 0, 7);
        cx.moveTo(gx - 16, gy); cx.lineTo(gx + 16, gy); cx.moveTo(gx, gy - 16); cx.lineTo(gx, gy + 16); cx.stroke();
      }
      const m = mix(app.v, app.w, app.cfg.track);
      drawArc(cx, X, Y, s, p, m.l, m.r, C, app.cfg.track);
      drawCar(cx, X, Y, s, p, 1, C, false, app.cfg);
      if (isSim() && (app.go || Math.hypot(app.est.x - p.x, app.est.y - p.y) > 4)) drawCar(cx, X, Y, s, app.est, .35, C, true, app.cfg);
    };
    draw();
    const wheel = e => { e.preventDefault(); view.current.s = clamp(view.current.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.15, 3); };
    const click = e => {
      if (app.cfg.mode !== 'manual') return;
      const r = cv.getBoundingClientRect(), v = view.current;
      if (!app.goEnable) return;
      goTo(v.x + (e.clientX - r.left - r.width / 2) / v.s, v.y - (e.clientY - r.top - r.height / 2) / v.s);
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('click', click);
    return () => { cancelAnimationFrame(raf); cv.removeEventListener('wheel', wheel); cv.removeEventListener('click', click); };
  }, [theme]);

  const zoom = f => { view.current.s = clamp(view.current.s * f, 0.15, 3); };
  return (
    <div className="mapwrap">
      <canvas ref={ref} className="map" aria-label="Top-down map of the car" />
      <div className="map-tools">
        <button type="button" className="chipbtn" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
        <button type="button" className="chipbtn" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out">−</button>
      </div>
      <MapSensors />
    </div>
  );
}

function MapSensors() {
  const s = isSim() ? simSensors() : (app.board.s || [0, 0]);
  return (
    <div className="map-sens">
      <span className={'led' + (s[0] ? ' on' : '')} title="Left sensor" /> <span className="muted small">L</span>
      <span className={'led' + (s[1] ? ' on' : '')} title="Right sensor" /> <span className="muted small">R</span>
    </div>
  );
}

function carPt(p, lx, ly) { const cs = Math.cos(p.th), sn = Math.sin(p.th); return [p.x + lx * cs - ly * sn, p.y + lx * sn + ly * cs]; }
function drawCar(cx, X, Y, s, p, alpha, C, ghost, cfg) {
  const T = cfg.track, L = Math.max(T * 1.25, cfg.wheelD * 1.6), ww = 10, D = cfg.wheelD;
  const poly = (pts, fill) => {
    cx.beginPath(); pts.forEach(([lx, ly], i) => { const [x, y] = carPt(p, lx, ly); i ? cx.lineTo(X(x), Y(y)) : cx.moveTo(X(x), Y(y)); }); cx.closePath();
    if (fill) { cx.fillStyle = fill; cx.fill(); }
  };
  cx.globalAlpha = alpha;
  poly([[-L * .4, -T / 2 + ww], [L * .6, -T / 2 + ww], [L * .6, T / 2 - ww], [-L * .4, T / 2 - ww]], ghost ? null : C.car);
  cx.strokeStyle = '#8b96a5'; cx.lineWidth = 2; cx.stroke();
  for (const side of [1, -1]) poly([[-D / 2, side * T / 2 - ww / 2], [D / 2, side * T / 2 - ww / 2], [D / 2, side * T / 2 + ww / 2], [-D / 2, side * T / 2 + ww / 2]], C.wheel);
  const [hx, hy] = carPt(p, L * .6, 0), [bx, by] = carPt(p, L * .15, 0);
  cx.strokeStyle = C.accent; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(X(bx), Y(by)); cx.lineTo(X(hx), Y(hy)); cx.stroke();
  if (!ghost && isSim()) {
    const sens = simSensors();
    [[0, 8], [1, -8]].forEach(([i, side]) => { const [sx, sy] = carPt(p, 45, side); cx.fillStyle = sens[i] ? C.ok : '#444'; cx.beginPath(); cx.arc(X(sx), Y(sy), Math.max(3, 6 * s), 0, 7); cx.fill(); });
  }
  cx.globalAlpha = 1;
}
function drawArc(cx, X, Y, s, p, vl, vr, C, T) {
  if (Math.abs(vl) < 1 && Math.abs(vr) < 1) return;
  const dir = (vl + vr) >= 0 ? 1 : -1, len = 380, dv = vr - vl;
  cx.strokeStyle = C.blue; cx.lineWidth = 3; cx.setLineDash([8, 6]); cx.beginPath();
  if (Math.abs(dv) < 0.5) { const [ax, ay] = carPt(p, 0, 0), [bx, by] = carPt(p, dir * len, 0); cx.moveTo(X(ax), Y(ay)); cx.lineTo(X(bx), Y(by)); }
  else if (Math.abs(vl + vr) < 0.5) { const [ax, ay] = carPt(p, 0, 0); cx.arc(X(ax), Y(ay), (T / 2) * s, 0, 7); }
  else {
    const R = (T / 2) * (vr + vl) / dv, sweep = Math.min(len / Math.abs(R), Math.PI * 1.5);
    for (let i = 0; i <= 40; i++) {
      const th = dir * (i / 40) * sweep * Math.sign(dv);
      const lx = R * Math.sin(th), ly = R * (1 - Math.cos(th));
      const [wx, wy] = carPt(p, lx, ly); i ? cx.lineTo(X(wx), Y(wy)) : cx.moveTo(X(wx), Y(wy));
    }
  }
  cx.stroke(); cx.setLineDash([]);
}
