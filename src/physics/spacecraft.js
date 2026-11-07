// Spacecraft trajectories: cubic Hermite interpolation of Horizons states
// (positions + velocities), see tools/fetch-spacecraft.mjs.

const STRIDE = 7; // jd, x, y, z, vx, vy, vz

/** Interpolate a flat record array at jd. Returns null outside its span. */
function hermite(rec, jd, out) {
  const n = rec.length / STRIDE;
  if (n === 0 || jd < rec[0] || jd > rec[(n - 1) * STRIDE]) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rec[mid * STRIDE] <= jd) lo = mid; else hi = mid;
  }
  const a = lo * STRIDE, b = hi * STRIDE;
  const h = rec[b] - rec[a] || 1e-9;
  const s = Math.min(1, Math.max(0, (jd - rec[a]) / h));
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  for (let k = 0; k < 3; k++) {
    const p0 = rec[a + 1 + k], v0 = rec[a + 4 + k], p1 = rec[b + 1 + k], v1 = rec[b + 4 + k];
    out.pos[k] = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
    out.vel[k] = (d00 * p0 + d10 * h * v0 + d01 * p1 + d11 * h * v1) / h;
  }
  return out;
}

/** Weight of the "re-attach to the drawn planet" correction around a flyby. */
export function flybyWeight(dtDays) {
  const x = Math.abs(dtDays);
  if (x <= 30) return 1;
  if (x >= 60) return 0;
  const t = (60 - x) / 30;
  return t * t * (3 - 2 * t);
}

export class Trajectory {
  constructor(data) {
    this.rec = Float64Array.from(data.records);
    this.count = this.rec.length / STRIDE;
    this.start = this.rec[0];
    this.end = this.rec[(this.count - 1) * STRIDE];
    // Planetocentric states of the probe around each flyby.
    this.flybys = data.flybys.map((f) => ({ planet: f.planet, jd: f.jd, rel: Float64Array.from(f.relative) }));
  }

  /** True heliocentric state (AU, AU/day), or null before launch. Linear extrapolation after the data end. */
  state(jd) {
    if (jd < this.start) return null;
    const out = { pos: [0, 0, 0], vel: [0, 0, 0], extrapolated: false };
    if (jd <= this.end) return hermite(this.rec, jd, out);
    const b = (this.count - 1) * STRIDE, dt = jd - this.end;
    for (let k = 0; k < 3; k++) {
      out.vel[k] = this.rec[b + 4 + k];
      out.pos[k] = this.rec[b + 1 + k] + out.vel[k] * dt;
    }
    out.extrapolated = true;
    return out;
  }

  /**
   * Shift (AU) to apply near flybys so that the probe passes at its true
   * planetocentric position relative to the planet *as drawn by the app*
   * (whose analytic ephemeris can be off by 10^5–10^6 km for the giants).
   * `planetPos(id)` returns the app's heliocentric position of a planet,
   * `probePos` the probe's true heliocentric position at jd.
   */
  correction(jd, planetPos, probePos) {
    const c = [0, 0, 0];
    const tmp = { pos: [0, 0, 0], vel: [0, 0, 0] };
    for (const f of this.flybys) {
      const w = flybyWeight(jd - f.jd);
      if (w === 0) continue;
      const rel = hermite(f.rel, jd, tmp);
      const model = planetPos(f.planet);
      if (!rel || !model) continue;
      for (let k = 0; k < 3; k++) c[k] += w * (model[k] + rel.pos[k] - probePos[k]);
    }
    return c;
  }

  /** True (Horizons) planetocentric position of the probe during a flyby (AU), or null. */
  relativeTo(planet, jd) {
    for (const f of this.flybys) {
      if (f.planet !== planet) continue;
      const st = hermite(f.rel, jd, { pos: [0, 0, 0], vel: [0, 0, 0] });
      if (st) return st.pos;
    }
    return null;
  }

  /** Sample times (JD) for drawing the whole path (at most one per `minStep` days, but all flyby samples). */
  pathTimes(minStep = 4) {
    const t = [];
    let last = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const jd = this.rec[i * STRIDE];
      const nearFlyby = this.flybys.some((f) => Math.abs(jd - f.jd) < 3);
      if (jd - last >= minStep || nearFlyby || i === this.count - 1) { t.push(jd); last = jd; }
    }
    return t;
  }
}
