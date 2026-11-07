// Minimal client for the JPL Horizons API (https://ssd-api.jpl.nasa.gov/doc/horizons.html).
// Node >= 18 (global fetch). Used only by the data-generation scripts in tools/.

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const q = (v) => `'${v}'`;

/**
 * Fetch geometric state vectors (ecliptic J2000).
 * opts: { command, center, start, stop, step } or { command, center, tlist: [jd...] }
 *       units: 'AU-D' (default) | 'KM-S'
 * Returns rows [jd, x, y, z, vx, vy, vz] (TDB Julian dates unless timeType 'UT').
 */
export async function vectors({ command, center, start, stop, step, tlist, units = 'AU-D', timeType = 'TDB', velocities = true }) {
  const p = new URLSearchParams({
    format: 'json',
    COMMAND: q(command),
    EPHEM_TYPE: q('VECTORS'),
    CENTER: q(center),
    REF_PLANE: q('ECLIPTIC'),
    REF_SYSTEM: q('J2000'),
    OUT_UNITS: q(units),
    VEC_TABLE: q(velocities ? '2' : '1'),
    CSV_FORMAT: q('YES'),
    OBJ_DATA: q('NO'),
    TIME_TYPE: q(timeType),
  });
  if (tlist) p.set('TLIST', tlist.map((t) => q(t.toFixed(9))).join(','));
  else {
    p.set('START_TIME', q(start));
    p.set('STOP_TIME', q(stop));
    p.set('STEP_SIZE', q(step));
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}?${p}`);
    if (res.status === 503 || res.status === 429) { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); continue; }
    const json = await res.json();
    const text = json.result || '';
    const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
    if (a < 0 || b < 0) throw new Error(`Horizons: no data for ${command} @ ${center}\n${text.slice(0, 1500)}`);
    return text.slice(a + 5, b).trim().split('\n').map((line) => {
      const f = line.split(',').map((s) => s.trim());
      const nums = [f[0], ...f.slice(2)].filter((s) => s !== '').map(Number);
      return nums;
    });
  }
  throw new Error('Horizons: too many retries');
}

/** Osculating heliocentric ecliptic elements of a small body at given epochs. */
export async function sbdb(sstr) {
  const res = await fetch(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(sstr)}&full-prec=1&phys-par=1`);
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
