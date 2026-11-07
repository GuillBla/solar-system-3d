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
  { label: '1 h/s', value: 1 / 24 },
  { label: '1 j/s', value: 1 },
  { label: '1 sem/s', value: 7 },
  { label: '1 mois/s', value: 30.44 },
  { label: '1 an/s', value: 365.25 },
  { label: '10 ans/s', value: 3652.5 },
];
