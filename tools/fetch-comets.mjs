// Comet orbits: SBDB (identity, physical data, reference osculating elements)
// + Horizons heliocentric osculating elements every 2 years 1800–2100, so that
// planetary perturbations between apparitions are taken into account (the app
// propagates the element set closest in time with a Kepler orbit).
// Output: data/comets.json. Run: node tools/fetch-comets.mjs
import { writeFileSync } from 'node:fs';
import { sbdb, sleep } from './lib/horizons.mjs';

const COMETS = [
  { id: 'halley', sstr: '1P', horizons: 'DES=1P;CAP<2062;NOFRAG' },
  { id: 'encke', sstr: '2P', horizons: 'DES=2P;CAP;NOFRAG' },
  { id: 'cg67p', sstr: '67P', horizons: 'DES=67P;CAP;NOFRAG' },
  { id: 'halebopp', sstr: 'C/1995 O1', horizons: 'DES=C/1995 O1;CAP;NOFRAG' },
  { id: 'swifttuttle', sstr: '109P', horizons: 'DES=109P;CAP;NOFRAG' },
];

async function elements(command, start, stop) {
  const q = (v) => `'${v}'`;
  const p = new URLSearchParams({
    format: 'json', COMMAND: q(command), EPHEM_TYPE: q('ELEMENTS'), CENTER: q('500@10'),
    REF_PLANE: q('ECLIPTIC'), REF_SYSTEM: q('J2000'), OUT_UNITS: q('AU-D'), CSV_FORMAT: q('YES'), OBJ_DATA: q('NO'),
    START_TIME: q(start), STOP_TIME: q(stop), STEP_SIZE: q('730 d'),
  });
  const json = await (await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${p}`)).json();
  const t = json.result;
  const a = t.indexOf('$$SOE'), b = t.indexOf('$$EOE');
  if (a < 0) throw new Error(t.slice(0, 2000));
  // JDTDB, Cal, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
  return t.slice(a + 5, b).trim().split('\n').map((l) => {
    const f = l.split(',').map((s) => s.trim());
    const n = (k) => Number(f[k]);
    return [n(0), n(2), n(3), n(4), n(5), n(6), n(7)]; // epoch, e, q, i, Ω, ω, Tp
  });
}

const out = { source: 'NASA/JPL SBDB API + JPL Horizons osculating heliocentric elements (ecliptic J2000).', format: 'sets: [epochJD, e, q (AU), i, node, peri (deg), Tp (JD TDB)]', comets: {} };
for (const c of COMETS) {
  const s = await sbdb(c.sstr);
  const el = Object.fromEntries(s.orbit.elements.map((x) => [x.name, Number(x.value)]));
  const phys = Object.fromEntries((s.phys_par || []).map((x) => [x.name, Number(x.value)]));
  let sets = [];
  // Horizons limits the span of some comet solutions: fetch by chunks, skip failures.
  for (const [start, stop] of [['1800-01-01', '1900-01-01'], ['1900-01-02', '2000-01-01'], ['2000-01-02', '2100-01-01']]) {
    try { sets.push(...(await elements(c.horizons, start, stop))); } catch (e) { console.warn(c.id, start, 'unavailable'); }
    await sleep(400);
  }
  const r = (v, d) => +v.toFixed(d);
  sets = sets.map(([ep, e, q, i, node, w, tp]) => [r(ep, 1), r(e, 8), r(q, 8), r(i, 6), r(node, 6), r(w, 6), r(tp, 5)]);
  out.comets[c.id] = {
    designation: s.object.fullname,
    sbdb: { epoch: Number(s.orbit.epoch), e: el.e, q: el.q, i: el.i, node: el.om, peri: el.w, tp: el.tp, periodDays: el.per || null },
    diameterKm: phys.diameter || null,
    sets,
  };
  console.log(c.id, s.object.fullname, sets.length, 'element sets', sets[0]?.[0], '→', sets.at(-1)?.[0]);
}
writeFileSync(new URL('../data/comets.json', import.meta.url), JSON.stringify(out));
