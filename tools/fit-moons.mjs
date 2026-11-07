// Fit mean orbital elements of the major moons to JPL Horizons positions.
//
// Starting point: JPL "Planetary Satellite Mean Elements"
// (https://ssd.jpl.nasa.gov/sats/elem/): elements referred to the local
// Laplace plane (Galilean moons, Titan) or to the planet's equator (Triton,
// Charon), angles measured from the ascending node of that plane on the ICRF
// equator. The tabulated angles/rates are then refined by a Levenberg–Marquardt
// least-squares fit against Horizons vectors sampled 1975–2035, so that the
// simple precessing-ellipse model stays within a fraction of a degree.
//
// Output: data/moons.json. Run: node tools/fit-moons.mjs
import { writeFileSync } from 'node:fs';
import { vectors, sleep } from './lib/horizons.mjs';
import { satelliteOffset } from '../src/physics/satellites.js';

// id: [Horizons id, center, frame pole RA/Dec (deg), a km, e, ω, M, i, Ω, P days, P apsis yr, P node yr]
const TABLE = {
  io: ['501', '500@599', [268.1, 64.5], 421800, 0.004, 49.1, 330.9, 0.0, 0.0, 1.762732, -1.333, 0],
  europa: ['502', '500@599', [268.1, 64.5], 671100, 0.009, 45.0, 345.4, 0.5, 184.0, 3.525463, -1.394, -30.202],
  ganymede: ['503', '500@599', [268.2, 64.6], 1070400, 0.001, 198.3, 324.8, 0.2, 58.5, 7.155588, 68.301, -137.812],
  callisto: ['504', '500@599', [268.7, 64.8], 1882700, 0.007, 43.8, 87.4, 0.3, 309.1, 16.69044, 277.921, -577.264],
  titan: ['606', '500@699', [36.4, 84.0], 1221900, 0.029, 78.3, 11.7, 0.3, 78.6, 15.945448, 346.68, -687.37],
  // Triton: the tabulated period (5.8792 d) drifts too fast; start from the
  // sidereal period 5.876854 d and let the fit find the slow nodal precession.
  triton: ['801', '500@899', [299.36, 43.46], 354800, 0.0, 0.0, 63.0, 157.3, 177.7, 5.876854, 0, 0],
  charon: ['901', '500@999', [132.993, -6.163], 19600, 0.0, 0.0, 304.1, 0.0, 0.0, 6.387222, 0, 0],
};
const PARAMS = ['a', 'e', 'i', 'node', 'nodeRate', 'peri', 'periRate', 'u', 'uRate'];

function toOrbit(p, pole) {
  return { pole, epoch: 2451545.0, a: p[0], e: Math.abs(p[1]), i: p[2], node: p[3], nodeRate: p[4], peri: p[5], periRate: p[6], u: p[7], uRate: p[8] };
}

function residuals(p, pole, rows) {
  const o = toOrbit(p, pole);
  const r = [];
  for (const [jd, x, y, z] of rows) {
    const s = satelliteOffset(o, jd);
    r.push(s[0] - x, s[1] - y, s[2] - z);
  }
  return r;
}
const cost = (r) => r.reduce((s, v) => s + v * v, 0);

// Solve (A + λ diag A) x = b by Gaussian elimination.
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-30) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-30 ? 0 : row[n] / row[i]));
}

function fit(p0, pole, rows) {
  let p = p0.slice(), r = residuals(p, pole, rows), c = cost(r), lambda = 1e-3;
  const steps = [1, 1e-5, 1e-4, 1e-3, 1e-7, 1e-3, 1e-7, 1e-3, 1e-8];
  for (let it = 0; it < 200; it++) {
    const J = steps.map((h, k) => {
      const q = p.slice(); q[k] += h;
      const rq = residuals(q, pole, rows);
      return rq.map((v, j) => (v - r[j]) / h);
    });
    const n = p.length;
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, v, j) => s + v * J[b][j], 0)));
    const g = Array.from({ length: n }, (_, a) => -J[a].reduce((s, v, j) => s + v * r[j], 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const Ad = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const dx = solve(Ad, g);
      const q = p.map((v, k) => v + dx[k]);
      const rq = residuals(q, pole, rows), cq = cost(rq);
      if (cq < c) { p = q; r = rq; const rel = (c - cq) / c; c = cq; lambda = Math.max(lambda / 5, 1e-9); improved = true; if (rel < 1e-10) it = 1e9; break; }
      lambda *= 8;
    }
    if (!improved) break;
  }
  return { p, rms: Math.sqrt(c / (r.length / 3)) };
}

const out = { source: 'Mean elements fitted to JPL Horizons (1975–2035), initialized from JPL Planetary Satellite Mean Elements. Angles in deg, rates in deg/day, epoch JD 2451545.0 TDB, a in km.', moons: {} };
for (const [id, [cmd, center, pole, a, e, w, M, i, node, P, Pw, Pn]] of Object.entries(TABLE)) {
  const rows = await vectors({ command: cmd, center, start: '1975-01-01', stop: '2035-01-01', step: '61 d', units: 'KM-S', timeType: 'UT', velocities: false });
  await sleep(300);
  const periRate = Pw ? 360 / (Pw * 365.25) : 0;
  const nodeRate = Pn ? 360 / (Pn * 365.25) : 0;
  const uRate = 360 / P + periRate;
  // Scan the starting argument of latitude and node (some tabulated angles use
  // other conventions), keep the best, then refine everything.
  let best = null;
  const nodeRates = nodeRate ? [nodeRate] : [0, 360 / (688 * 365.25), -360 / (688 * 365.25)];
  for (let du = 0; du < 360; du += 10) for (let dn = 0; dn < 360; dn += 30) for (const nr of nodeRates) {
    const p0 = [a, e, i, node + dn, nr, w, periRate, w + M + du, uRate];
    const c = cost(residuals(p0, pole, rows));
    if (!best || c < best.c) best = { c, p0 };
  }
  const { p, rms } = fit(best.p0, pole, rows);
  const o = toOrbit(p, pole);
  // Angular error statistics
  let maxDeg = 0;
  for (const [jd, x, y, z] of rows) {
    const s = satelliteOffset(o, jd);
    const cosA = (s[0] * x + s[1] * y + s[2] * z) / Math.hypot(...s) / Math.hypot(x, y, z);
    maxDeg = Math.max(maxDeg, (Math.acos(Math.min(1, cosA)) * 180) / Math.PI);
  }
  const round = (v, d) => +v.toFixed(d);
  out.moons[id] = {
    pole: o.pole, epoch: o.epoch, a: round(o.a, 1), e: round(o.e, 6), i: round(o.i, 5),
    node: round(((o.node % 360) + 360) % 360, 5), nodeRate: round(o.nodeRate, 9),
    peri: round(((o.peri % 360) + 360) % 360, 5), periRate: round(o.periRate, 9),
    u: round(((o.u % 360) + 360) % 360, 5), uRate: round(o.uRate, 9),
    fit: { samples: rows.length, rmsKm: Math.round(rms), maxErrDeg: round(maxDeg, 3) },
  };
  console.log(id, out.moons[id].fit);
}
writeFileSync(new URL('../data/moons.json', import.meta.url), JSON.stringify(out, null, 1));
