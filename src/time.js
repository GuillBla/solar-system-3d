// Time utilities. The simulation clock is a Julian Date (days, UTC ~ TT, the
// ~70 s difference is irrelevant at this level of accuracy).

export const J2000 = 2451545.0; // 2000-01-01 12:00 TT
export const DAYS_PER_CENTURY = 36525;

export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/** Days since J2000.0 */
export function daysSinceJ2000(jd) {
  return jd - J2000;
}

/** Julian centuries since J2000.0 */
export function centuriesSinceJ2000(jd) {
  return (jd - J2000) / DAYS_PER_CENTURY;
}

/**
 * ΔT = TT − UT in seconds (Espenak & Meeus polynomials, simplified).
 * Only the Moon needs it here: it moves by its own diameter in ~1 hour, so
 * the ~70 s offset shifts an eclipse shadow by ~40 km.
 */
export function deltaT(jd) {
  const y = 2000 + (jd - J2000) / 365.25;
  let t;
  if (y >= 2015 && y < 2050) return 68 + 0.1 * (y - 2015);
  if (y >= 2005 && y < 2015) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y >= 1986 && y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y >= 1961 && y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (y >= 1941 && y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
  if (y >= 1920 && y < 1941) { t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t * t + 0.0020936 * t ** 3; }
  if (y >= 1900 && y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y >= 1860 && y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  const u = (y - 1820) / 100;
  if (y >= 2050 && y < 2150) return -20 + 32 * u * u - 0.5628 * (2150 - y);
  return -20 + 32 * u * u;
}

/** Terrestrial Time Julian date from a UT Julian date. */
export function ttFromUT(jd) {
  return jd + deltaT(jd) / 86400;
}

const pad = (n) => String(n).padStart(2, '0');

export function formatDateUTC(jd) {
  const d = jdToDate(jd);
  if (isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const yStr = y < 0 ? `${-y + 1} av. J.-C.` : String(y);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${yStr}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Simulation speed presets, in simulated days per real second. */
export const SPEED_PRESETS = [
  { label: '−1 an/s', value: -365.25 },
  { label: '−1 mois/s', value: -30.44 },
  { label: '−1 j/s', value: -1 },
  { label: 'Pause', value: 0 },
  { label: 'Temps réel', value: 1 / 86400 },
  { label: '10 min/s', value: 1 / 144 },
  { label: '1 h/s', value: 1 / 24 },
  { label: '1 j/s', value: 1 },
  { label: '1 sem/s', value: 7 },
  { label: '1 mois/s', value: 30.44 },
  { label: '1 an/s', value: 365.25 },
  { label: '10 ans/s', value: 3652.5 },
];
