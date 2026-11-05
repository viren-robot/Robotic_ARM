// The virtual car: the firmware's logic in JavaScript. It answers the same JSON messages as steam_car.ino.
import { mix, wiring, vmaxOf, wrapPi, clamp, D2R } from './kinematics.js';
import { distToLine } from './track.js';

export const SENSOR_AHEAD = 45, SENSOR_SIDE = 8, LINE_HALF = 11;   // mm

export class SimCar {
  constructor(emit) { this.emit = emit; this.reset(); }
  reset() {
    this.pose = { x: 0, y: 0, th: 0 };
    this.c = { track: 100, slew: 400, base: 45, kp: 40, lostSearch: false, search: 35, invL: false, invR: false, swap: false, irHigh: true };
    this.mode = 'manual'; this.state = 'idle';
    this.tgtL = this.tgtR = this.curL = this.curR = 0; this.dv = this.dw = 0;
    this.lastDrive = 0; this.lastRx = performance.now(); this.timedOut = false; this.lostSince = 0; this.lastSide = 0; this.lastStatus = 0;
  }
  sensors() {
    const p = this.pose, cs = Math.cos(p.th), sn = Math.sin(p.th);
    return [SENSOR_SIDE, -SENSOR_SIDE].map(side => {
      const x = p.x + SENSOR_AHEAD * cs - side * sn, y = p.y + SENSOR_AHEAD * sn + side * cs;
      return distToLine(x, y) < LINE_HALF ? 1 : 0;
    });
  }
  setWheels(l, r, canReverse) { const o = wiring(l, r, this.c, canReverse); this.tgtL = o.l; this.tgtR = o.r; }
  stopNow() { this.tgtL = this.tgtR = this.curL = this.curR = 0; this.dv = this.dw = 0; }

  handle(m, canReverse, now = performance.now()) {
    this.lastRx = now;
    const c = this.c;
    switch (m.t) {
      case 'hello':
        this.emit({ t: 'hello', fw: 'steam-car', ver: 'simulator', reverse: !!canReverse, line: true,
          pins: { lp: 16, rp: 17, ld: canReverse ? 0 : -1, rd: canReverse ? 0 : -1, il: 0, ir: 0 } });
        break;
      case 'cfg':
        if (m.track >= 20 && m.track <= 500) c.track = m.track;
        if (m.slew >= 20 && m.slew <= 5000) c.slew = m.slew;
        if ('base' in m) c.base = clamp(m.base, 0, 100);
        if ('kp' in m) c.kp = clamp(m.kp, 0, 300);
        if ('search' in m) c.search = clamp(m.search, 0, 100);
        if ('lost' in m) c.lostSearch = m.lost === 'search';
        for (const k of ['invL', 'invR', 'swap', 'irHigh']) if (k in m) c[k] = !!m[k];
        if (this.mode === 'manual') { const x = mix(this.dv, this.dw, c.track); this.setWheels(x.l, x.r, canReverse); }
        this.emit({ t: 'ack', what: 'cfg', ok: true }); break;
      case 'drive': {
        if (this.mode !== 'manual') break;
        this.dv = clamp(m.v || 0, -100, 100); this.dw = clamp(m.w || 0, -100, 100);
        const x = mix(this.dv, this.dw, c.track);
        this.setWheels(x.l, x.r, canReverse);
        this.state = x.l === 0 && x.r === 0 ? 'idle' : 'driving';
        this.lastDrive = now; this.timedOut = false; break;
      }
      case 'stop': this.stopNow(); this.mode = 'manual'; this.state = 'stopped'; this.emit({ t: 'ack', what: 'stop', ok: true }); break;
      case 'mode':
        this.stopNow(); this.mode = m.m === 'line' ? 'line' : 'manual'; this.lostSince = 0; this.timedOut = false;
        this.state = this.mode === 'line' ? 'following' : 'idle';
        this.emit({ t: 'ack', what: 'mode', ok: true }); break;
      case 'ping': this.emit({ t: 'ack', what: 'ping', id: m.id }); break;
    }
  }

  followLine(canReverse) {
    const [l, r] = this.sensors(), c = this.c;
    let o;
    if (l || r) {
      this.lostSince = 0;
      const e = r - l; if (e) this.lastSide = e;
      o = mix(c.base, -c.kp * e, c.track);
      this.state = e === 0 ? 'following' : e > 0 ? 'steer-right' : 'steer-left';
    } else {
      if (!this.lostSince) this.lostSince = performance.now();
      if (c.lostSearch && performance.now() - this.lostSince < 5000) {
        const dir = this.lastSide >= 0 ? 1 : -1;
        o = mix(0, -dir * c.search * 50 / (c.track / 2), c.track); this.state = 'searching';
      } else { o = { l: 0, r: 0 }; this.state = 'lost'; }
    }
    this.setWheels(o.l, o.r, canReverse);
  }

  step(dt, now, canReverse) {
    if (this.mode === 'manual' && this.lastDrive && !this.timedOut && now - this.lastDrive > 400) {
      this.timedOut = true; this.stopNow(); this.state = 'timeout';
      this.emit({ t: 'log', msg: 'no drive command for 400 ms - stopped' });
    }
    if (this.mode === 'line') {
      if (now - this.lastRx > 2000) { this.stopNow(); this.mode = 'manual'; this.state = 'timeout'; this.emit({ t: 'log', msg: 'lost contact with the page - stopped' }); }
      else this.followLine(canReverse);
    }
    const d = this.c.slew * dt;
    this.curL += clamp(this.tgtL - this.curL, -d, d); this.curR += clamp(this.tgtR - this.curR, -d, d);
    // a simulated car: the right wheel is 1.5 % weaker, so a straight line drifts a little, like a real car
    const vm = vmaxOf({ maxRpm: 120, wheelD: 65 }), vl = this.curL / 100 * vm, vr = this.curR / 100 * vm * 0.985, p = this.pose;
    const v = (vl + vr) / 2, om = (vr - vl) / this.c.track;
    p.th = wrapPi(p.th + om * dt); p.x += v * Math.cos(p.th) * dt; p.y += v * Math.sin(p.th) * dt;
    if (now - this.lastStatus >= 100) {
      this.lastStatus = now;
      this.emit({ t: 'status', mode: this.mode, state: this.state, l: Math.round(this.curL), r: Math.round(this.curR), s: this.sensors() });
    }
  }
}
