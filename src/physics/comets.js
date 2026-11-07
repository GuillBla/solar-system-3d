// Comet positions: heliocentric Kepler orbits from osculating element sets
// (data/comets.json). The set whose epoch is closest to the date is used, so
// the perturbations by the planets between apparitions are accounted for.
import { DEG, GAUSS_K, GM_SUN, orbitBasis, solveKepler } from './kepler.js';

/** Classical elements at jd: {a, e, q, i, node, peri, M, n, epoch} (radians, AU). */
export function cometElements(comet, jd) {
  const sets = comet.sets;
  // Sets are sorted by epoch: binary search for the closest one.
  let lo = 0, hi = sets.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sets[mid][0] <= jd) lo = mid; else hi = mid;
  }
  const best = Math.abs(sets[hi][0] - jd) < Math.abs(sets[lo][0] - jd) ? sets[hi] : sets[lo];
  const [epoch, e, q, i, node, peri, tp] = best;
  const a = q / (1 - e);
  const n = GAUSS_K / Math.pow(a, 1.5); // rad/day
  return { a, e, q, i: i * DEG, node: node * DEG, peri: peri * DEG, M: n * (jd - tp), n, epoch, tp };
}

/** Heliocentric ecliptic position/velocity (AU, AU/day). */
export function cometState(comet, jd) {
  const k = cometElements(comet, jd);
  const E = solveKepler(k.M, k.e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = Math.sqrt(1 - k.e * k.e);
  const xp = k.a * (cE - k.e), yp = k.a * b * sE;
  const Edot = k.n / (1 - k.e * cE);
  const vxp = -k.a * sE * Edot, vyp = k.a * b * cE * Edot;
  const { P, Q } = orbitBasis(k.i, k.node, k.peri);
  return {
    pos: [xp * P[0] + yp * Q[0], xp * P[1] + yp * Q[1], xp * P[2] + yp * Q[2]],
    vel: [vxp * P[0] + vyp * Q[0], vxp * P[1] + vyp * Q[1], vxp * P[2] + vyp * Q[2]],
    elements: k,
  };
}

/** Orbital period (days) of the element set in use at jd. */
export function cometPeriod(comet, jd) {
  const { a } = cometElements(comet, jd);
  return 2 * Math.PI * Math.sqrt((a * a * a) / GM_SUN);
}
