// Mapping from physical space (ecliptic AU, km) to scene units.
//
// Two scales, blended by `t` (0 = realistic, 1 = readable):
//  - realistic: 1 AU = 30 units, true radii -> planets are sub-pixel dots
//  - readable : distances 30·sqrt(r) (compresses the outer system),
//               radii 0.01·sqrt(R_km), moon orbits spaced logarithmically.

import { AU_KM } from '../physics/kepler.js';

export const UNITS_PER_AU = 30;
const SUN_READABLE_RADIUS = 5;

const lerp = (a, b, t) => a + (b - a) * t;
const logLerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));

/** Ecliptic (x, y, z) -> three.js (x, z, -y): ecliptic north becomes +Y (up). */
export function eclToThree(v, out) {
  out.set(v[0], v[2], -v[1]);
  return out;
}

export class ScaleMapper {
  constructor() {
    this.t = 1; // current blend
    this.target = 1;
  }

  setReadable(readable) {
    this.target = readable ? 1 : 0;
  }

  get readable() {
    return this.target === 1;
  }

  /** Animate the blend; returns true while it changes. */
  update(dt) {
    if (this.t === this.target) return false;
    const speed = 0.8; // full transition in ~1.25 s
    const step = Math.sign(this.target - this.t) * dt * speed;
    this.t = Math.abs(this.target - this.t) <= Math.abs(step) ? this.target : this.t + step;
    return true;
  }

  /** Smoothstep-eased blend used everywhere for a nicer transition. */
  get k() {
    const t = this.t;
    return t * t * (3 - 2 * t);
  }

  /** Radial distance mapping: AU -> scene units. */
  distance(rAU) {
    if (rAU <= 0) return 0;
    const real = rAU * UNITS_PER_AU;
    const readable = Math.sqrt(rAU) * UNITS_PER_AU;
    return lerp(real, readable, this.k);
  }

  /**
   * Map a heliocentric ecliptic vector (AU) to a three.js position relative to
   * the Sun's display position. Writes into `out` (THREE.Vector3).
   */
  position(v, out) {
    const r = Math.hypot(v[0], v[1], v[2]);
    const f = r > 0 ? this.distance(r) / r : 0;
    out.set(v[0] * f, v[2] * f, -v[1] * f);
    return out;
  }

  /** Displayed radius of a body (scene units). */
  radius(body) {
    const real = (body.radiusKm / AU_KM) * UNITS_PER_AU;
    let readable = 0.01 * Math.sqrt(body.radiusKm);
    if (body.id === 'sun') readable = SUN_READABLE_RADIUS;
    if (body.isStar && body.id !== 'sun') readable = SUN_READABLE_RADIUS * 0.7;
    return logLerp(real, readable, this.k);
  }

  /** Displayed distance of a moon from its parent's center (scene units). */
  moonDistance(distanceKm, parent) {
    const real = (distanceKm / AU_KM) * UNITS_PER_AU;
    const ratio = distanceKm / parent.radiusKm;
    const parentR = 0.01 * Math.sqrt(parent.radiusKm);
    const readable = parentR * (1.4 + 0.75 * Math.log(ratio));
    return logLerp(real, readable, this.k);
  }
}
