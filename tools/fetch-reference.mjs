// Fetch ground-truth satellite positions from JPL Horizons for the unit tests.
// Writes tests/reference.json. Run: node tools/fetch-reference.mjs
import { writeFileSync } from 'node:fs';
import { vectors, sleep } from './lib/horizons.mjs';

const DATES = {
  '1979-03-05T12:00Z': 2443938.0,
  '1989-08-25T04:00Z': 2447763.6666667,
  '2000-01-01T12:00Z': 2451545.0,
  '2015-07-14T12:00Z': 2457218.0,
  '2024-04-08T18:17Z': 2460409.2618056,
  '2026-08-12T17:46Z': 2461265.2402778,
};
const TARGETS = [
  ['moon', '301', '500@399'],
  ['io', '501', '500@599'], ['europa', '502', '500@599'], ['ganymede', '503', '500@599'], ['callisto', '504', '500@599'],
  ['titan', '606', '500@699'],
  ['triton', '801', '500@899'],
  ['charon', '901', '500@999'],
];

const out = { note: 'Geometric planetocentric vectors, ecliptic J2000, km. Source: JPL Horizons (UT epochs).', dates: DATES, bodies: {} };
for (const [id, cmd, center] of TARGETS) {
  const rows = await vectors({ command: cmd, center, tlist: Object.values(DATES), units: 'KM-S', timeType: 'UT', velocities: false });
  out.bodies[id] = rows.map((r) => [r[0], ...r.slice(1, 4).map((v) => Math.round(v * 10) / 10)]);
  console.log(id, rows.length);
  await sleep(300);
}
// Comets: heliocentric positions (AU) at notable dates.
const COMET_DATES = {
  halley: ['DES=1P;CAP<2062;NOFRAG', ['1910-04-20T12:00Z', '1986-02-09T12:00Z', '1986-03-14T00:00Z', '2061-07-28T12:00Z']],
  encke: ['DES=2P;CAP;NOFRAG', ['2023-10-22T12:00Z', '2027-02-10T00:00Z']],
  cg67p: ['DES=67P;CAP;NOFRAG', ['2014-08-06T12:00Z', '2015-08-13T00:00Z']],
  halebopp: ['DES=C/1995 O1;CAP;NOFRAG', ['1997-04-01T12:00Z', '1996-01-01T00:00Z']],
  swifttuttle: ['DES=109P;CAP;NOFRAG', ['1992-12-12T00:00Z', '1862-08-23T00:00Z']],
};
out.comets = {};
for (const [id, [cmd, dates]] of Object.entries(COMET_DATES)) {
  const tl = dates.map((d) => new Date(d).getTime() / 86400000 + 2440587.5);
  const rows = await vectors({ command: cmd, center: '500@10', tlist: tl, units: 'AU-D', timeType: 'UT', velocities: false });
  out.comets[id] = rows.map((r) => [r[0], ...r.slice(1, 4).map((v) => Math.round(v * 1e7) / 1e7)]);
  console.log(id, rows.length);
  await sleep(300);
}
writeFileSync(new URL('../tests/reference.json', import.meta.url), JSON.stringify(out, null, 1));
