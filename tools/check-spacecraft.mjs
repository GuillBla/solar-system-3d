// Validate the interpolated spacecraft trajectories against Horizons samples
// taken at times that are NOT in data/spacecraft.json. Run: node tools/check-spacecraft.mjs
import { readFileSync } from 'node:fs';
import { vectors, sleep } from './lib/horizons.mjs';
import { Trajectory } from '../src/physics/spacecraft.js';
import { AU_KM } from '../src/physics/kepler.js';

const data = JSON.parse(readFileSync(new URL('../data/spacecraft.json', import.meta.url)));
const CHECKS = [
  ['voyager2', '-32', '1989-08-25 01:00', '1989-08-25 07:00', '7 m', 'Neptune flyby'],
  ['voyager1', '-31', '1979-03-05 06:00', '1979-03-05 18:00', '13 m', 'Jupiter flyby'],
  ['newhorizons', '-98', '2015-07-14 08:00', '2015-07-14 16:00', '11 m', 'Pluto flyby'],
  ['voyager1', '-31', '1985-01-01', '2030-01-01', '97 d', 'cruise'],
  ['pioneer10', '-23', '1972-03-03 03:00', '1972-03-04 03:00', '17 m', 'Earth departure'],
];
for (const [id, cmd, a, b, step, label] of CHECKS) {
  const tr = new Trajectory(data.probes[id]);
  const rows = await vectors({ command: cmd, center: '500@10', start: a, stop: b, step, timeType: 'UT' });
  await sleep(300);
  let max = 0;
  for (const r of rows) {
    const s = tr.state(r[0]);
    max = Math.max(max, Math.hypot(s.pos[0] - r[1], s.pos[1] - r[2], s.pos[2] - r[3]) * AU_KM);
  }
  console.log(`${id.padEnd(12)} ${label.padEnd(16)} ${rows.length} samples, max error ${max.toFixed(2)} km`);
}
