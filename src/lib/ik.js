// One place for the inverse-kinematics geometry, shared by the IK diagram, the 2D map and the 3D view.
// Robot frame: x forward, y left, mm. Wheel speeds are percentages of full speed.
import { mix } from './kinematics.js';

export function ikGeometry(v, w, track, len = 380) {
  const m = mix(v, w, track);
  const vl = m.l, vr = m.r, sum = vl + vr, dv = vr - vl;
  const wheels = [
    { name: 'left', y: track / 2, speed: vl },
    { name: 'right', y: -track / 2, speed: vr },
  ];
  let kind, R = null, icc = null, path = [];
  if (Math.abs(sum) < 0.5 && Math.abs(dv) < 0.5) {
    kind = 'stop';
  } else if (Math.abs(dv) < 0.5) {
    kind = 'straight';
    const dir = Math.sign(sum);
    for (let i = 0; i <= 40; i++) path.push([dir * len * i / 40, 0]);
  } else if (Math.abs(sum) < 0.5) {
    kind = 'spin';                                   // turning on the spot: the centre stays put
    R = 0; icc = [0, 0];
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; path.push([track / 2 * Math.cos(a), track / 2 * Math.sin(a)]); }
  } else {
    kind = 'arc';
    R = (track / 2) * sum / dv;                      // radius to the turning centre; + = centre on the left
    icc = [0, R];
    const sweep = Math.sign(dv) * Math.min(len / Math.abs(R), 1.5 * Math.PI);
    for (let i = 0; i <= 40; i++) {
      const th = (i / 40) * sweep;
      path.push([R * Math.sin(th), R * (1 - Math.cos(th))]);
    }
  }
  return { vl, vr, sum, dv, kind, R, icc, path, wheels, scale: m.scale };
}
