// Eclipse geometry, in km. The same formulas run in the shaders
// (render/shadows.js); this JS version is used by the tests and the UI.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Overlap area of two discs (radius 1 and r, centers d apart) divided by π:
 * the fraction of the unit disc (the Sun) hidden by the other one.
 */
export function discOverlap(r, d) {
  if (d >= 1 + r) return 0;
  if (d <= Math.abs(1 - r)) return r < 1 ? r * r : 1;
  const a = Math.acos(Math.min(1, Math.max(-1, (d * d + 1 - r * r) / (2 * d))));
  const b = Math.acos(Math.min(1, Math.max(-1, (d * d + r * r - 1) / (2 * d * r))));
  const k = 0.5 * Math.sqrt(Math.max(0, (-d + 1 + r) * (d + 1 - r) * (d - 1 + r) * (d + 1 + r)));
  return (a + r * r * b - k) / Math.PI;
}

/**
 * Fraction of the solar disc hidden by a sphere, seen from point P.
 * S, O: centers of Sun and occulting body; Rs, Ro: radii (same units).
 */
export function sunOcclusion(P, S, Rs, O, Ro) {
  const toS = sub(S, P), toO = sub(O, P);
  const dS = len(toS), dO = len(toO);
  if (dO >= dS || dot(toS, toO) <= 0) return 0;
  const aS = Math.asin(Math.min(1, Rs / dS)), aO = Math.asin(Math.min(1, Ro / dO));
  const sep = Math.atan2(len(cross(toS, toO)), dot(toS, toO));
  return discOverlap(aO / aS, sep / aS);
}

/**
 * Where the shadow axis (Sun center → Moon center) hits a sphere of radius R
 * centered at the origin. Returns the point (km) or null if it misses.
 */
export function shadowAxisHit(sun, moon, R) {
  const d = sub(moon, sun);
  const L = len(d);
  const u = [d[0] / L, d[1] / L, d[2] / L];
  const b = dot(moon, u);
  const c = dot(moon, moon) - R * R;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  return [moon[0] + u[0] * t, moon[1] + u[1] * t, moon[2] + u[2] * t];
}

/**
 * Lunar eclipse geometry (geocentric km): distance of the Moon's center from
 * the shadow axis, and the radii of the umbra and penumbra at the Moon's
 * distance (Earth radius enlarged by 2 % for the atmosphere, as is customary).
 */
export function earthShadowAtMoon(sun, moon, Rsun, Rearth) {
  const dS = len(sun);
  const axis = [-sun[0] / dS, -sun[1] / dS, -sun[2] / dS];
  const along = dot(moon, axis);
  const perp = len(sub(moon, axis.map((v) => v * along)));
  const Re = Rearth * 1.02;
  const umbra = Re - (along * (Rsun - Re)) / dS;
  const penumbra = Re + (along * (Rsun + Re)) / dS;
  return { distance: perp, umbra, penumbra, along };
}
