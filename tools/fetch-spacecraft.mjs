// Spacecraft trajectories from JPL Horizons: heliocentric ecliptic J2000
// position + velocity, sampled adaptively (minutes around planetary flybys,
// days in cruise) for cubic Hermite interpolation in the app.
// For each flyby, the probe's planetocentric trajectory (center = the planet)
// is also stored, so the app can re-attach the probe to the (approximate)
// planet it draws. Note: differencing Horizons' heliocentric states of the
// probe and of the planet is NOT reliable at the 10^3 km level (e.g. 34 558 km
// instead of 29 240 km for Voyager 2 at Neptune): always use planetocentric
// vectors for encounter geometry.
// Output: data/spacecraft.json. Run: node tools/fetch-spacecraft.mjs
import { writeFileSync } from 'node:fs';
import { vectors, sleep } from './lib/horizons.mjs';
import { dateToJD } from '../src/time.js';

const jd = (s) => dateToJD(new Date(s));
const PLANET_ID = { earth: '399', jupiter: '599', saturn: '699', uranus: '799', neptune: '899', pluto: '999' };

export const PROBES = [
  { id: 'voyager1', cmd: '-31', start: '1977-09-05T14:00:30Z', end: '2099-12-31T00:00Z', lateStep: 60,
    flybys: [['jupiter', '1979-03-05T12:05Z'], ['saturn', '1980-11-12T23:46Z']] },
  { id: 'voyager2', cmd: '-32', start: '1977-08-20T15:33:40Z', end: '2099-12-31T00:00Z', lateStep: 60,
    flybys: [['jupiter', '1979-07-09T22:29Z'], ['saturn', '1981-08-26T03:24Z'], ['uranus', '1986-01-24T17:59Z'], ['neptune', '1989-08-25T03:56Z']] },
  { id: 'pioneer10', cmd: '-23', start: '1972-03-03T02:06Z', end: '2049-12-30T00:00Z', lateStep: 60,
    flybys: [['jupiter', '1973-12-04T02:26Z']] },
  { id: 'pioneer11', cmd: '-24', start: '1973-04-06T02:27Z', end: '2049-12-30T00:00Z', lateStep: 60,
    flybys: [['jupiter', '1974-12-03T05:22Z'], ['saturn', '1979-09-01T16:31Z']] },
  { id: 'newhorizons', cmd: '-98', start: '2006-01-19T19:53Z', end: '2049-12-30T00:00Z', lateStep: 30,
    flybys: [['jupiter', '2007-02-28T05:43Z'], ['pluto', '2015-07-14T11:49Z']] },
];

const fmt = (d) => new Date((d - 2440587.5) * 86400000).toISOString().replace('T', ' ').slice(0, 19);
async function range(cmd, center, a, b, stepMin) {
  const rows = await vectors({ command: cmd, center, start: fmt(a), stop: fmt(b), step: `${Math.round(stepMin)} m`, timeType: 'UT' });
  await sleep(250);
  return rows;
}

/** Fetch nested tiers [a, b, stepMinutes] (finest first) and merge them. */
async function tiered(cmd, center, tiers, t0, t1) {
  const recs = new Map();
  const covered = [];
  for (const [a0, b0, step] of tiers) {
    const a = Math.max(a0, t0), b = Math.min(b0, t1);
    const rows = await range(cmd, center, a, b, step);
    for (const r of rows) {
      // Skip coarse samples inside an already-sampled finer interval (keeps boundaries).
      if (covered.some(([ca, cb]) => r[0] > ca + 1e-6 && r[0] < cb - 1e-6)) continue;
      recs.set(r[0].toFixed(6), r);
    }
    covered.push([a, b]);
  }
  return [...recs.values()].sort((u, v) => u[0] - v[0]);
}

const R = (v, d) => +v.toFixed(d);
const flatten = (rows) => rows.flatMap((r) => [R(r[0], 6), ...r.slice(1, 4).map((v) => R(v, 9)), ...r.slice(4, 7).map((v) => R(v, 10))]);

const out = { source: 'JPL Horizons (geometric heliocentric states, ecliptic J2000, AU and AU/day, UT epochs).', format: 'records: flat [jd, x, y, z, vx, vy, vz, ...]', probes: {} };
for (const p of PROBES) {
  const t0 = jd(p.start), t1 = jd(p.end);
  const tiers = []; // [a, b, stepMinutes]  (finest tiers listed first win)
  const lastFlyby = Math.max(...p.flybys.map(([, t]) => jd(t)));
  tiers.push([t0, t0 + 0.5, 10], [t0, t0 + 5, 120], [t0, t0 + 60, 1440]);
  for (const [, t] of p.flybys) {
    const tc = jd(t);
    tiers.push([tc - 0.5, tc + 0.5, 10], [tc - 5, tc + 5, 120], [tc - 60, tc + 60, 2880]);
  }
  tiers.push([t0, lastFlyby + 365, 14400], [lastFlyby + 365, t1, p.lateStep * 1440]);
  const sorted = await tiered(p.cmd, '500@10', tiers, t0, t1);
  const flybys = [];
  for (const [planet, t] of p.flybys) {
    const tc = jd(t);
    const rel = await tiered(p.cmd, '500@' + PLANET_ID[planet], [[tc - 0.5, tc + 0.5, 10], [tc - 5, tc + 5, 120], [tc - 62, tc + 62, 2880]], t0, t1);
    flybys.push({ planet, jd: R(tc, 5), relative: flatten(rel) });
  }
  out.probes[p.id] = { start: t0, end: sorted.at(-1)[0], records: flatten(sorted), flybys };
  console.log(p.id, sorted.length, 'records,', flybys.map((f) => f.relative.length / 7).join(' + '), 'planetocentric');
}
writeFileSync(new URL('../data/spacecraft.json', import.meta.url), JSON.stringify(out));
