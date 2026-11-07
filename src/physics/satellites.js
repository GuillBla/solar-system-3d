// Planetary satellites on precessing Keplerian ellipses.
//
// Elements (data/moons.json) are referred to a reference plane given by its
// pole (RA/Dec, ICRF): the local Laplace plane or the planet's equator.
// Longitudes (node) are counted from the ascending node of that plane on the
// ICRF equator, as in the JPL satellite mean-element tables.
//   i, node(t) = node + nodeRate·d, ω(t) = peri + periRate·d,
//   u(t) = ω + M = u + uRate·d   (d = days since epoch)
// Pure math (no three.js) so it can be tested with node.

import { DEG, orbitBasis, solveKepler } from './kepler.js';

const OBL = 23.4392911 * DEG;
const cosO = Math.cos(OBL), sinO = Math.sin(OBL);

/** Basis of a reference plane: node direction N, B = P × N, pole P (ICRF). */
function planeBasis(pole) {
  const ra = pole[0] * DEG, dec = pole[1] * DEG;
  const P = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const N = [-Math.sin(ra), Math.cos(ra), 0];
  const B = [P[1] * N[2] - P[2] * N[1], P[2] * N[0] - P[0] * N[2], P[0] * N[1] - P[1] * N[0]];
  return { P, N, B };
}
const cache = new WeakMap();

/** Offset of a satellite from its planet, ecliptic J2000, km. */
export function satelliteOffset(o, jd) {
  let basis = cache.get(o);
  if (!basis) cache.set(o, (basis = planeBasis(o.pole)));
  const d = jd - o.epoch;
  const node = (o.node + o.nodeRate * d) * DEG;
  const peri = (o.peri + o.periRate * d) * DEG;
  const u = (o.u + o.uRate * d) * DEG;
  const { P: pp, Q } = orbitBasis(o.i * DEG, node, peri);
  const E = solveKepler(u - peri, o.e);
  const xp = o.a * (Math.cos(E) - o.e), yp = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const l0 = xp * pp[0] + yp * Q[0], l1 = xp * pp[1] + yp * Q[1], l2 = xp * pp[2] + yp * Q[2];
  const { N, B, P } = basis;
  const x = l0 * N[0] + l1 * B[0] + l2 * P[0];
  const y = l0 * N[1] + l1 * B[1] + l2 * P[1];
  const z = l0 * N[2] + l1 * B[2] + l2 * P[2];
  return [x, y * cosO + z * sinO, -y * sinO + z * cosO];
}
