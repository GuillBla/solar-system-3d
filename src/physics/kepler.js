// Keplerian orbit maths.
// Planet positions use the JPL "Approximate Positions of the Planets"
// (E. M. Standish), Table 1: mean elements at J2000 + linear rates per
// century, valid 1800–2050 AD (degrades gracefully outside).
// Frame: heliocentric ecliptic J2000, units AU and days.

import { centuriesSinceJ2000 } from '../time.js';

export const DEG = Math.PI / 180;
export const GAUSS_K = 0.01720209895; // rad/day, sqrt(GM_sun) in AU^1.5/day
export const GM_SUN = GAUSS_K * GAUSS_K; // AU^3/day^2
export const AU_KM = 149597870.7;

const TWO_PI = Math.PI * 2;

/** Normalize an angle to [-PI, PI). */
export function wrapPi(a) {
  a = (a + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

/** Solve Kepler's equation M = E - e sin E (radians) by Newton iteration. */
export function solveKepler(M, e) {
  M = wrapPi(M);
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - M;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Osculating-like classical elements of a planet at a Julian date.
 * Returns a (AU), e, i, node Ω, argument of perihelion ω, mean anomaly M (radians).
 */
export function planetElements(el, jd) {
  const T = centuriesSinceJ2000(jd);
  const [a0, e0, i0, L0, w0, O0] = el.elements;
  const [ar, er, ir, Lr, wr, Or] = el.rates;
  const a = a0 + ar * T;
  const e = e0 + er * T;
  const i = (i0 + ir * T) * DEG;
  const L = (L0 + Lr * T) * DEG;
  const varpi = (w0 + wr * T) * DEG; // longitude of perihelion
  const node = (O0 + Or * T) * DEG;
  return { a, e, i, node, peri: varpi - node, M: wrapPi(L - varpi) };
}

/**
 * Perifocal unit vectors P (toward periapsis) and Q (90° ahead in the orbit),
 * expressed in the reference frame of the elements.
 */
export function orbitBasis(i, node, peri) {
  const cO = Math.cos(node), sO = Math.sin(node);
  const cw = Math.cos(peri), sw = Math.sin(peri);
  const ci = Math.cos(i), si = Math.sin(i);
  return {
    P: [cw * cO - sw * sO * ci, cw * sO + sw * cO * ci, sw * si],
    Q: [-sw * cO - cw * sO * ci, -sw * sO + cw * cO * ci, cw * si],
  };
}

/**
 * Position (and velocity) on a Keplerian orbit.
 * @param {object} k  {a, e, i, node, peri, M}
 * @param {number} mu gravitational parameter (AU^3/day^2) for the velocity; if
 *                    omitted, velocity is not computed.
 */
export function stateFromElements(k, mu) {
  const E = solveKepler(k.M, k.e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = Math.sqrt(1 - k.e * k.e);
  const xp = k.a * (cE - k.e);
  const yp = k.a * b * sE;
  const { P, Q } = orbitBasis(k.i, k.node, k.peri);
  const pos = [
    xp * P[0] + yp * Q[0],
    xp * P[1] + yp * Q[1],
    xp * P[2] + yp * Q[2],
  ];
  let vel = null;
  if (mu) {
    const n = Math.sqrt(mu / (k.a * k.a * k.a)); // mean motion rad/day
    const Edot = n / (1 - k.e * cE);
    const vxp = -k.a * sE * Edot;
    const vyp = k.a * b * cE * Edot;
    vel = [
      vxp * P[0] + vyp * Q[0],
      vxp * P[1] + vyp * Q[1],
      vxp * P[2] + vyp * Q[2],
    ];
  }
  return { pos, vel, E };
}

/** Heliocentric ecliptic position/velocity (AU, AU/day) of a planet at jd. */
export function planetState(el, jd, withVelocity = false) {
  const k = planetElements(el, jd);
  return stateFromElements(k, withVelocity ? GM_SUN : 0);
}

/** Sample the full ellipse of the current elements (ecliptic AU) as a flat array. */
export function sampleOrbit(k, segments = 256) {
  const { P, Q } = orbitBasis(k.i, k.node, k.peri);
  const b = Math.sqrt(1 - k.e * k.e);
  const out = new Float64Array((segments + 1) * 3);
  for (let s = 0; s <= segments; s++) {
    // Sample in eccentric anomaly: denser near periapsis for eccentric orbits.
    const E = (s / segments) * TWO_PI;
    const xp = k.a * (Math.cos(E) - k.e);
    const yp = k.a * b * Math.sin(E);
    out[s * 3] = xp * P[0] + yp * Q[0];
    out[s * 3 + 1] = xp * P[1] + yp * Q[1];
    out[s * 3 + 2] = xp * P[2] + yp * Q[2];
  }
  return out;
}

/** Orbital period in days for semi-major axis a (AU) around the Sun. */
export function periodDays(a) {
  return TWO_PI * Math.sqrt((a * a * a) / GM_SUN);
}
