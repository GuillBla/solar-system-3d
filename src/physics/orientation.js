// Body orientation (IAU model) and kinematic moon positions.
// Pure math, no three.js, so it can be unit-tested with node.

import { DEG, AU_KM } from './kepler.js';
import { moonPosition } from './moon.js';
import { satelliteOffset } from './satellites.js';
import { daysSinceJ2000 } from '../time.js';

export const OBLIQUITY = 23.4392911 * DEG; // mean obliquity of the ecliptic at J2000

/** ICRF equatorial vector -> ecliptic J2000 vector. */
export function eqToEcl([x, y, z]) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return [x, y * c + z * s, -y * s + z * c];
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Orientation of a body at jd from its IAU pole.
 * Returns ecliptic unit vectors: pole (body +Z), node (equator ascending node on
 * the ICRF equator), meridian (body +X, the prime meridian) and the angle W (rad).
 */
export function bodyOrientation(pole, jd) {
  const a = pole.ra * DEG, d = pole.dec * DEG;
  const P = eqToEcl([Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]);
  const nRa = a + Math.PI / 2;
  const N = eqToEcl([Math.cos(nRa), Math.sin(nRa), 0]);
  const B = cross(P, N);
  const W = (pole.W0 + pole.Wd * daysSinceJ2000(jd)) * DEG;
  const cW = Math.cos(W), sW = Math.sin(W);
  const X = [cW * N[0] + sW * B[0], cW * N[1] + sW * B[1], cW * N[2] + sW * B[2]];
  return { pole: P, node: N, meridian: X, W };
}

/**
 * Position of a moon relative to its parent, ecliptic frame, in km.
 * The Moon uses the truncated ELP-2000 theory; the other moons use their
 * fitted mean elements (`moon.orbit`, from data/moons.json). Without them
 * (data not loaded) a circular equatorial orbit is used as a fallback.
 * Returns {offsetKm:[x,y,z], distanceKm}.
 */
export function moonOffset(moon, parent, jd) {
  let pos;
  if (moon.id === 'moon') pos = moonPosition(jd).pos;
  else if (moon.orbit) pos = satelliteOffset(moon.orbit, jd);
  else {
    const o = bodyOrientation(parent.pole, jd);
    const B = cross(o.pole, o.node);
    const lambda = (2 * Math.PI * daysSinceJ2000(jd)) / moon.periodDays;
    const c = Math.cos(lambda) * moon.distanceKm, s = Math.sin(lambda) * moon.distanceKm;
    pos = [c * o.node[0] + s * B[0], c * o.node[1] + s * B[1], c * o.node[2] + s * B[2]];
  }
  return { offsetKm: pos, distanceKm: Math.hypot(pos[0], pos[1], pos[2]) };
}

/** Offset of the Earth from the Earth–Moon barycenter (AU, ecliptic). */
export function earthFromBarycenter(moonOffsetKm, earthMass, moonMass) {
  const mu = moonMass / (earthMass + moonMass);
  return moonOffsetKm.map((v) => (-v * mu) / AU_KM);
}
