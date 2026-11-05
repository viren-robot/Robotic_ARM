// Inverse kinematics for the two-wheel car. The same maths as steam_car.ino.
//   left = v - w*T/2     right = v + w*T/2     (T = track width, mm)
// If either wheel would pass 100 %, both are scaled by the same factor.

export const HALF_REF = 50; // mm: 1 % of w changes each wheel by 1 % per 50 mm of half-track

export function mix(v, w, track) {
  const k = (track / 2) / HALF_REF;
  const l = v - w * k, r = v + w * k;
  const m = Math.max(Math.abs(l), Math.abs(r));
  const scale = m > 100 ? 100 / m : 1;
  return { l: l * scale, r: r * scale, scale };
}

// logical left/right -> physical motor outputs (swap first, then invert)
export function wiring(l, r, c, canReverse) {
  if (c.swap) [l, r] = [r, l];
  if (c.invL) l = -l;
  if (c.invR) r = -r;
  if (!canReverse) { l = Math.max(l, 0); r = Math.max(r, 0); }
  return { l, r };
}

// physical motor outputs -> what the wheels really do
export function unwire(pl, pr, c) {
  const a = c.invL ? -pl : pl, b = c.invR ? -pr : pr;
  return c.swap ? { l: b, r: a } : { l: a, r: b };
}

// mm/s for 100 %
export const vmaxOf = c => (c.maxRpm / 60) * Math.PI * c.wheelD;
export const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const D2R = Math.PI / 180;
