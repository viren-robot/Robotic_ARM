// The virtual track for the Simulator: a loop of straights and half circles (mm, x forward, y left).
import { clamp, D2R } from './kinematics.js';

export const TRACK = (() => {
  const pts = [], R = 250;
  for (let x = -100; x <= 500; x += 20) pts.push([x, 0]);
  for (let a = -90; a <= 90; a += 6) pts.push([500 + R * Math.cos(a * D2R), R + R * Math.sin(a * D2R)]);
  for (let x = 500; x >= -100; x -= 20) pts.push([x, 2 * R]);
  for (let a = 90; a <= 270; a += 6) pts.push([-100 + R * Math.cos(a * D2R), R + R * Math.sin(a * D2R)]);
  return pts;
})();

export function distToLine(x, y) {
  let best = Infinity;
  for (let i = 0; i < TRACK.length; i++) {
    const [ax, ay] = TRACK[i], [bx, by] = TRACK[(i + 1) % TRACK.length];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;                              // repeated point where a straight meets an arc
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
