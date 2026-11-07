// Sanity checks of the physics modules: run with `npm test` (node >= 18).
import assert from 'node:assert/strict';
import { planetState, GM_SUN, AU_KM, periodDays } from '../src/physics/kepler.js';
import { NBodySystem } from '../src/physics/nbody.js';
import { moonOffset, earthFromBarycenter, bodyOrientation } from '../src/physics/orientation.js';
import { PLANETS, MOONS, SUN, SUN_MASS_KG } from '../src/data/bodies.js';
import { dateToJD } from '../src/time.js';
import { readFileSync } from 'node:fs';
import { applyMoonOrbits } from '../src/data/loader.js';
import { moonPosition } from '../src/physics/moon.js';
import { cometState } from '../src/physics/comets.js';
import { COMETS } from '../src/data/comets.js';
import { Trajectory } from '../src/physics/spacecraft.js';
import { Simulation } from '../src/simulation.js';
import { shadowAxisHit, sunOcclusion, earthShadowAtMoon } from '../src/physics/eclipse.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
applyMoonOrbits(load('../data/moons.json'));
const REF = load('./reference.json');
const COMET_DATA = load('../data/comets.json');
const CRAFT = load('../data/spacecraft.json');
const comets = COMETS.map((c) => ({ ...c, ...COMET_DATA.comets[c.id] }));

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

// ---------- Moon & satellites vs JPL Horizons ----------
const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angDeg = (a, b) => (Math.acos(Math.min(1, dotp(a, b) / (norm(a) * norm(b)))) * 180) / Math.PI;
const MOON_BY_ID = Object.fromEntries(MOONS.map((m) => [m.id, m]));

check('Moon (ELP-2000/Meeus) within 60 km of Horizons at 6 dates', () => {
  let maxKm = 0, maxAs = 0;
  for (const [t, x, y, z] of REF.bodies.moon) {
    const p = moonPosition(t).pos;
    maxKm = Math.max(maxKm, norm(sub(p, [x, y, z])));
    maxAs = Math.max(maxAs, angDeg(p, [x, y, z]) * 3600);
  }
  console.log(`      max error ${maxKm.toFixed(1)} km, ${maxAs.toFixed(1)}"`);
  assert.ok(maxKm < 60, `max error ${maxKm} km`);
});
for (const id of ['io', 'europa', 'ganymede', 'callisto', 'titan', 'triton', 'charon']) {
  check(`${MOON_BY_ID[id].name}: fitted mean elements within 0.3° of Horizons`, () => {
    const m = MOON_BY_ID[id];
    let maxDeg = 0, maxKm = 0;
    for (const [t, x, y, z] of REF.bodies[id]) {
      const p = moonOffset(m, P[m.parent], t).offsetKm;
      maxDeg = Math.max(maxDeg, angDeg(p, [x, y, z]));
      maxKm = Math.max(maxKm, norm(sub(p, [x, y, z])));
    }
    console.log(`      max error ${maxDeg.toFixed(3)}° (${maxKm.toFixed(0)} km)`);
    assert.ok(maxDeg < 0.3, `max error ${maxDeg}°`);
  });
}

// ---------- Eclipses ----------
const R_EARTH = 6371, R_SUN = 695700, R_MOON = 1737.4;
const RAD = Math.PI / 180;
function geocentric(t) {
  const sim = new Simulation();
  sim.setDate(t);
  const e = sim.helio.get('earth'), m = sim.helio.get('moon');
  return { sun: e.map((v) => -v * AU_KM), moon: sub(m, e).map((v) => v * AU_KM) };
}
function latLon(p, t) {
  const o = bodyOrientation(P.earth.pole, t);
  const X = o.meridian, Z = o.pole;
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  return [Math.asin(dotp(p, Z) / norm(p)) / RAD, Math.atan2(dotp(p, Y), dotp(p, X)) / RAD];
}
const greatCircleKm = (la1, lo1, la2, lo2) => 6371 * Math.acos(Math.min(1, Math.sin(la1 * RAD) * Math.sin(la2 * RAD) + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.cos((lo1 - lo2) * RAD)));
for (const [label, when, lat0, lon0] of [
  ['2024-04-08 18:17 UTC total solar eclipse (greatest: 25.3°N 104.1°W, Mexico)', '2024-04-08T18:17:16Z', 25.29, -104.13],
  ['2026-08-12 17:46 UTC total solar eclipse (greatest: 65.2°N 25.2°W, off Iceland)', '2026-08-12T17:46:06Z', 65.22, -25.24],
]) {
  check(`Moon shadow axis: ${label}`, () => {
    const t = jd(when);
    const { sun, moon } = geocentric(t);
    const hit = shadowAxisHit(sun, moon, R_EARTH);
    assert.ok(hit, 'shadow axis misses the Earth');
    const [lat, lon] = latLon(hit, t);
    const occ = sunOcclusion(hit, sun, R_SUN, moon, R_MOON);
    const dKm = greatCircleKm(lat, lon, lat0, lon0);
    console.log(`      axis at ${lat.toFixed(2)}°, ${lon.toFixed(2)}° (${dKm.toFixed(0)} km from the published point), Sun hidden: ${(occ * 100).toFixed(1)} %`);
    assert.ok(dKm < 150, `${dKm} km away`);
    assert.ok(occ > 0.999, `occlusion ${occ}`);
  });
}
check('2025-03-14 06:59 UTC total lunar eclipse: Moon inside the umbra', () => {
  const { sun, moon } = geocentric(jd('2025-03-14T06:58:43Z'));
  const s = earthShadowAtMoon(sun, moon, R_SUN, R_EARTH);
  const magnitude = (s.umbra - s.distance + R_MOON) / (2 * R_MOON);
  console.log(`      Moon ${s.distance.toFixed(0)} km from the axis, umbra radius ${s.umbra.toFixed(0)} km, umbral magnitude ${magnitude.toFixed(3)} (published 1.178)`);
  assert.ok(s.distance + R_MOON < s.umbra, 'not total');
  assert.ok(Math.abs(magnitude - 1.178) < 0.03, `magnitude ${magnitude}`);
});
check('No eclipse at an ordinary new moon (2024-03-10 09:00 UTC)', () => {
  const { sun, moon } = geocentric(jd('2024-03-10T09:00Z'));
  assert.equal(shadowAxisHit(sun, moon, R_EARTH), null);
});

// ---------- Comets vs Horizons ----------
for (const c of comets) {
  check(`Comet ${c.name}: element sets within 0.005 AU of Horizons`, () => {
    let max = 0;
    for (const [t, x, y, z] of REF.comets[c.id]) max = Math.max(max, norm(sub(cometState(c, t).pos, [x, y, z])));
    console.log(`      max error ${max.toExponential(2)} AU (${(max * AU_KM).toFixed(0)} km)`);
    assert.ok(max < 0.005, `${max} AU`);
  });
}
check('Halley perihelion 1986-02-09 and return 2061-07-28 (±3 days)', () => {
  const halley = comets.find((c) => c.id === 'halley');
  for (const date of ['1986-02-09', '2061-07-28']) {
    const t0 = jd(date + 'T12:00Z');
    let best = null;
    for (let d = -30; d <= 30; d += 0.05) {
      const r = norm(cometState(halley, t0 + d).pos);
      if (!best || r < best.r) best = { r, d };
    }
    console.log(`      ${date}: perihelion found at ${best.d >= 0 ? '+' : ''}${best.d.toFixed(2)} d, q = ${best.r.toFixed(4)} AU`);
    assert.ok(Math.abs(best.d) < 3, `${best.d} days off`);
  }
});

// ---------- Spacecraft ----------
check('Voyager 2 flies past Neptune at its true distance from the drawn planet', () => {
  const traj = new Trajectory(CRAFT.probes.voyager2);
  const sim = new Simulation();
  sim.setProbes([{ body: { id: 'voyager2' }, traj }]);
  const tc = jd('1989-08-25T03:56Z');
  let model = Infinity, truth = Infinity;
  for (let d = -0.1; d <= 0.1; d += 1 / 1440) {
    sim.setDate(tc + d);
    model = Math.min(model, norm(sub(sim.helio.get('voyager2'), sim.helio.get('neptune'))) * AU_KM);
    truth = Math.min(truth, norm(traj.relativeTo('neptune', tc + d)) * AU_KM);
  }
  console.log(`      closest approach: ${model.toFixed(0)} km from the drawn Neptune (Horizons: ${truth.toFixed(0)} km)`);
  assert.ok(Math.abs(model - truth) < 20, `${model} vs ${truth}`);
  // Horizons (planetocentric, center 899): 29 240 km at 03:56 UTC.
  assert.ok(Math.abs(model - 29240) < 50, `closest approach ${model} km`);
});
check('New Horizons is hidden before launch and passes Pluto on 2015-07-14', () => {
  const traj = new Trajectory(CRAFT.probes.newhorizons);
  assert.equal(traj.state(jd('2005-01-01T00:00Z')), null);
  const sim = new Simulation();
  sim.setProbes([{ body: { id: 'newhorizons' }, traj }]);
  sim.setDate(jd('2015-07-14T11:49Z'));
  const d = norm(sub(sim.helio.get('newhorizons'), sim.helio.get('pluto'))) * AU_KM;
  console.log(`      distance to the drawn Pluto at closest approach: ${d.toFixed(0)} km`);
  // Published: 12 500 km above the surface, i.e. ~13 700 km from the center.
  assert.ok(Math.abs(d - 13690) < 300, `${d} km`);
});
check('N-body: comets are massless test particles perturbed by Jupiter', () => {
  const sim = new Simulation();
  sim.setComets(comets);
  sim.setDate(jd('2025-01-01T00:00Z'));
  sim.setMode('nbody');
  sim.setMultiplier('jupiter', 1000);
  sim.speed = 365.25;
  for (let k = 0; k < 20; k++) sim.update(0.25);
  const dev = sim.deviationKm('encke');
  console.log(`      Encke after 5 years with Jupiter ×1000: ${(dev / AU_KM).toFixed(2)} AU from its normal position`);
  assert.ok(dev > 1e6);
});

console.log(failures ? `\n${failures} test(s) failed` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
