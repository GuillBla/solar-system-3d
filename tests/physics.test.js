// Sanity checks of the physics modules: run with `npm test` (node >= 18).
import assert from 'node:assert/strict';
import { planetState, GM_SUN, AU_KM, periodDays } from '../src/physics/kepler.js';
import { NBodySystem } from '../src/physics/nbody.js';
import { moonOffset, earthFromBarycenter, bodyOrientation } from '../src/physics/orientation.js';
import { PLANETS, MOONS, SUN, SUN_MASS_KG } from '../src/data/bodies.js';
import { dateToJD } from '../src/time.js';

const P = Object.fromEntries(PLANETS.map((p) => [p.id, p]));
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const jd = (s) => dateToJD(new Date(s));
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('ok  ', name); } catch (e) { failures++; console.log('FAIL', name, '\n     ', e.message); }
}

check('Earth perihelion early January (~0.9833 AU)', () => {
  const r = norm(planetState(P.earth, jd('2024-01-03T00:00Z')).pos);
  assert.ok(Math.abs(r - 0.9833) < 0.0005, `r = ${r}`);
});
check('Earth aphelion early July (~1.0167 AU)', () => {
  const r = norm(planetState(P.earth, jd('2024-07-05T00:00Z')).pos);
  assert.ok(Math.abs(r - 1.0167) < 0.0005, `r = ${r}`);
});
check('Mars closest approach 2003-08-27 (~0.3727 AU)', () => {
  const t = jd('2003-08-27T10:00Z');
  const d = norm(sub(planetState(P.mars, t).pos, planetState(P.earth, t).pos));
  assert.ok(Math.abs(d - 0.3727) < 0.003, `d = ${d}`);
});
check('Jupiter opposition 2023-11-03: Sun–Earth–Jupiter aligned', () => {
  const t = jd('2023-11-03T05:00Z');
  const e = planetState(P.earth, t).pos, j = planetState(P.jupiter, t).pos;
  const lonE = Math.atan2(e[1], e[0]), lonJ = Math.atan2(j[1], j[0]);
  const diff = Math.abs(((lonE - lonJ + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
  assert.ok(diff < 1.5, `longitude difference = ${diff.toFixed(2)}°`);
});
check('Kepler 3rd law: Earth period ≈ 365.25 days', () => {
  const T = periodDays(1.00000261);
  assert.ok(Math.abs(T - 365.256) < 0.05, `T = ${T}`);
});
check('Full moon 2024-01-25 17:54 UTC: Moon opposite the Sun', () => {
  const t = jd('2024-01-25T17:54Z');
  const moon = MOONS.find((m) => m.id === 'moon');
  const off = moonOffset(moon, P.earth, t).offsetKm;
  const emb = planetState(P.earth, t).pos;
  const earth = emb.map((v, k) => v + earthFromBarycenter(off, P.earth.massKg, moon.massKg)[k]);
  const sunDir = earth.map((v) => -v);
  const cos = (off[0] * sunDir[0] + off[1] * sunDir[1] + off[2] * sunDir[2]) / (norm(off) * norm(sunDir));
  const elong = Math.acos(cos) * 180 / Math.PI;
  assert.ok(elong > 172, `elongation = ${elong.toFixed(1)}° (expected ~180°)`);
});
check('Earth orientation: pole tilted 23.44° from ecliptic pole', () => {
  const o = bodyOrientation(P.earth.pole, jd('2024-01-01T00:00Z'));
  const tilt = Math.acos(o.pole[2]) * 180 / Math.PI;
  assert.ok(Math.abs(tilt - 23.44) < 0.01, `tilt = ${tilt}`);
});
check('Uranus is tipped over (obliquity ~98° to its orbit)', () => {
  const o = bodyOrientation(P.uranus.pole, jd('2024-01-01T00:00Z'));
  // IAU "north" pole is 82° from the ecliptic pole and rotation is retrograde
  // (Wd < 0): equivalent to a prograde spin around an axis tilted by 98°.
  const tilt = Math.acos(o.pole[2]) * 180 / Math.PI;
  const obliquity = P.uranus.pole.Wd < 0 ? 180 - tilt : tilt;
  assert.ok(obliquity > 96 && obliquity < 100, `obliquity = ${obliquity}`);
});

function buildSystem(t) {
  const sys = new NBodySystem();
  sys.add('sun', 1, [0, 0, 0], [0, 0, 0]);
  for (const p of PLANETS) {
    let m = p.massKg / SUN_MASS_KG;
    if (p.id === 'earth') m += MOONS[0].massKg / SUN_MASS_KG;
    const s = planetState(p, t, true);
    sys.add(p.id, m, s.pos, s.vel);
  }
  sys.zeroMomentum();
  sys.markEnergyReference();
  return sys;
}

check('N-body: energy drift < 1e-6 over 100 years (dt = 0.5 d)', () => {
  const sys = buildSystem(jd('2025-01-01T00:00Z'));
  for (let y = 0; y < 100; y++) sys.advance(365.25, 0.5);
  const drift = Math.abs(sys.relativeEnergyDrift());
  console.log('      relative energy drift after 100 yr:', drift.toExponential(2));
  assert.ok(drift < 1e-6, `drift = ${drift}`);
});
check('N-body: Earth after 1 year stays within 0.005 AU of ephemeris', () => {
  const t0 = jd('2025-01-01T00:00Z');
  const sys = buildSystem(t0);
  sys.advance(365.25, 0.25);
  const i = sys.indexOf('earth'), s = sys.indexOf('sun');
  const helio = sub(sys.pos[i], sys.pos[s]);
  const d = norm(sub(helio, planetState(P.earth, t0 + 365.25).pos));
  console.log('      deviation:', (d * AU_KM).toFixed(0), 'km');
  assert.ok(d < 0.005, `d = ${d} AU`);
});
check('N-body: time reversibility (10 yr forward then back)', () => {
  const sys = buildSystem(jd('2025-01-01T00:00Z'));
  const start = sys.pos[3].slice();
  sys.advance(3652.5, 0.5);
  sys.advance(-3652.5, 0.5);
  const d = norm(sub(sys.pos[3], start));
  assert.ok(d < 1e-8, `d = ${d}`);
});

console.log(failures ? `\n${failures} test(s) failed` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
