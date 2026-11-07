// Simulation state: clock + the two physics modes.
//  - 'ephemeris': analytic Keplerian positions (JPL elements) at the current date
//  - 'nbody'    : numerical integration of mutual gravity, seeded from the ephemeris

import { planetState, AU_KM, GM_SUN } from './physics/kepler.js';
import { NBodySystem } from './physics/nbody.js';
import { moonOffset } from './physics/orientation.js';
import { cometState } from './physics/comets.js';
import { PLANETS, MOONS, SUN, SUN_MASS_KG, BODY_BY_ID } from './data/bodies.js';
import { dateToJD } from './time.js';

const MOON = MOONS.find((m) => m.id === 'moon');

// Sphere of influence of the planets visited by spacecraft (km): inside it, a
// probe is drawn relative to the planet (see App.computeDisplay).
export const SOI_KM = { earth: 9.25e5, jupiter: 4.82e7, saturn: 5.48e7, uranus: 5.18e7, neptune: 8.66e7, pluto: 3.1e6 };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Planet a spacecraft at `pos` (AU) should be drawn relative to, if any:
 * {planet, offsetKm, distanceKm, weight}, weight fading from 1 (deep inside the
 * sphere of influence) to 0 (outside). `planetPos(id)` gives planet positions.
 */
export function probeLocalFrame(pos, planetPos) {
  let best = null;
  for (const [pid, soi] of Object.entries(SOI_KM)) {
    const pp = planetPos(pid);
    if (!pp) continue;
    const off = [(pos[0] - pp[0]) * AU_KM, (pos[1] - pp[1]) * AU_KM, (pos[2] - pp[2]) * AU_KM];
    const d = Math.hypot(off[0], off[1], off[2]);
    const weight = 1 - smooth(0.1 * soi, 0.3 * soi, d);
    if (weight > 0 && (!best || weight > best.weight)) best = { planet: pid, offsetKm: off, distanceKm: d, weight, planetHelio: pp };
  }
  return best;
}

export const ROGUE_STAR = {
  id: 'rogue',
  name: 'Étoile vagabonde',
  type: 'Étoile de passage (bac à sable)',
  radiusKm: 500000,
  isStar: true,
  color: '#ff9e6b',
  description:
    "Une étoile errante qui traverse le Système solaire. Ce genre de rencontre rapprochée est rare mais arrive : l'étoile de Scholz est passée à moins d'une année-lumière du Soleil il y a 70 000 ans. Observez comment elle perturbe (ou éjecte !) les planètes.",
};

export class Simulation {
  constructor() {
    this.jd = dateToJD(new Date());
    this.speed = 7; // simulated days per real second
    this.mode = 'ephemeris';
    this.nbody = null;
    this.multipliers = { sun: 1, jupiter: 1 };
    this.rogueMassSolar = 0.6;
    this.listeners = new Set();
    // Per-frame results, ecliptic AU relative to the Sun, AU/day
    this.helio = new Map();
    this.helioVel = new Map();
    this.sunAbs = [0, 0, 0];
    this.comets = []; // comet definitions with their element sets
    this.probes = []; // [{ body, traj }]
    this.probeLocal = new Map(); // probe id -> { planet, offsetKm, weight }
    this.compute();
  }

  /** Register comets (data/comets.json merged with metadata). */
  setComets(list) {
    this.comets = list;
    if (this.nbody) this.initNBody();
    this.compute();
  }

  /** Register spacecraft trajectories (loaded asynchronously). */
  setProbes(list) {
    this.probes = list;
    this.compute();
  }

  on(fn) { this.listeners.add(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt); }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'nbody') this.initNBody();
    else this.nbody = null;
    this.compute();
    this.emit({ type: 'mode', mode });
  }

  setDate(jd) {
    this.jd = jd;
    if (this.mode === 'nbody') this.initNBody();
    this.compute();
    this.emit({ type: 'jump' });
  }

  /** Seed the N-body system from the ephemeris at the current date. */
  initNBody() {
    const sys = new NBodySystem();
    sys.add('sun', 1, [0, 0, 0], [0, 0, 0]);
    for (const p of PLANETS) {
      let m = p.massKg / SUN_MASS_KG;
      if (p.id === 'earth') m += MOON.massKg / SUN_MASS_KG; // Earth–Moon barycenter
      const s = planetState(p, this.jd, true);
      sys.add(p.id, m, s.pos, s.vel);
    }
    // Comets are massless test particles: they feel the planets (a heavier
    // Jupiter deflects them) but do not pull on anything.
    for (const c of this.comets) {
      const s = cometState(c, this.jd);
      sys.add(c.id, 0, s.pos, s.vel);
    }
    // Sandbox multipliers apply on top of the real masses (velocities stay the
    // real ones, so a heavier Sun immediately tightens all orbits).
    sys.setMassMultiplier('sun', this.multipliers.sun);
    sys.setMassMultiplier('jupiter', this.multipliers.jupiter);
    sys.zeroMomentum();
    sys.markEnergyReference();
    this.nbody = sys;
    this.emit({ type: 'nbody-reset' });
  }

  setMultiplier(id, factor) {
    this.multipliers[id] = factor;
    if (this.nbody) {
      this.nbody.setMassMultiplier(id, factor);
      this.nbody.markEnergyReference();
    }
  }

  launchRogueStar() {
    if (!this.nbody) return;
    const sys = this.nbody;
    const existing = sys.indexOf('rogue');
    if (existing >= 0) sys.remove(existing);
    // Start 80 AU away in a random direction, aimed to miss the Sun by 3–12 AU,
    // at 15–30 km/s, slightly inclined.
    const ang = Math.random() * Math.PI * 2;
    const dir = [Math.cos(ang), Math.sin(ang), (Math.random() - 0.5) * 0.3];
    const start = dir.map((v) => v * 80);
    const miss = 3 + Math.random() * 9;
    const side = [-Math.sin(ang), Math.cos(ang), 0];
    const aim = side.map((v) => v * miss);
    const toward = aim.map((v, k) => v - start[k]);
    const len = Math.hypot(...toward);
    const speedKmS = 15 + Math.random() * 15;
    const speed = (speedKmS * 86400) / AU_KM;
    const vel = toward.map((v) => (v / len) * speed);
    const sunPos = sys.pos[0];
    sys.add('rogue', this.rogueMassSolar, start.map((v, k) => v + sunPos[k]), vel);
    sys.markEnergyReference();
    this.compute();
    this.emit({ type: 'rogue', present: true });
  }

  /** Advance the clock by `realDt` seconds of wall time. */
  update(realDt) {
    const days = this.speed * realDt;
    if (days === 0) return;
    const next = this.jd + days;
    // Stay within a sane range: JD 0 (4713 BC) to ~100 000 AD.
    if (next < 0 || next > 40000000) return;
    if (this.nbody) {
      // Integrate in chunks of <= 1 day so that trails can be sampled smoothly
      // even when a single frame covers weeks of simulated time.
      const chunks = Math.min(Math.ceil(Math.abs(days)), 2000);
      const chunk = days / chunks;
      for (let c = 0; c < chunks; c++) {
        this.nbody.advance(chunk, 0.5, 6000);
        this.jd += chunk;
        this.onSubstep?.(this.jd, this.nbody);
      }
      this.jd = next;
      // Drop the rogue star once it is far away.
      const i = this.nbody.indexOf('rogue');
      if (i >= 0) {
        const p = this.nbody.pos[i], s = this.nbody.pos[0];
        if (Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]) > 400) {
          this.nbody.remove(i);
          this.nbody.markEnergyReference();
          this.emit({ type: 'rogue', present: false });
        }
      }
    } else {
      this.jd = next;
    }
    this.compute();
  }

  /** Fill `helio`/`helioVel` for all bodies (planets + moons + rogue). */
  compute() {
    const { helio, helioVel } = this;
    helio.clear(); helioVel.clear();
    helio.set('sun', [0, 0, 0]);
    helioVel.set('sun', [0, 0, 0]);
    if (this.nbody) {
      const sys = this.nbody;
      const s = sys.pos[0], sv = sys.vel[0];
      this.sunAbs = s.slice();
      for (let i = 1; i < sys.count; i++) {
        const p = sys.pos[i], v = sys.vel[i];
        helio.set(sys.ids[i], [p[0] - s[0], p[1] - s[1], p[2] - s[2]]);
        helioVel.set(sys.ids[i], [v[0] - sv[0], v[1] - sv[1], v[2] - sv[2]]);
      }
    } else {
      this.sunAbs = [0, 0, 0];
      for (const p of PLANETS) {
        const st = planetState(p, this.jd, true);
        helio.set(p.id, st.pos);
        helioVel.set(p.id, st.vel);
      }
      for (const c of this.comets) {
        const st = cometState(c, this.jd);
        helio.set(c.id, st.pos);
        helioVel.set(c.id, st.vel);
      }
    }
    // Moons (kinematic). The planet ephemerides give the barycenter of each
    // planet + moons system: shift the planet by -Σ μ·offset (matters for the
    // Earth–Moon and Pluto–Charon pairs).
    this.moonOffsets = new Map();
    const shift = new Map();
    for (const m of MOONS) {
      const parent = BODY_BY_ID[m.parent];
      const off = moonOffset(m, parent, this.jd);
      this.moonOffsets.set(m.id, off);
      const mu = m.massKg / (parent.massKg + m.massKg);
      const sh = shift.get(m.parent) || [0, 0, 0];
      for (let k = 0; k < 3; k++) sh[k] -= (off.offsetKm[k] * mu) / AU_KM;
      shift.set(m.parent, sh);
    }
    for (const [id, sh] of shift) {
      const p = helio.get(id);
      helio.set(id, [p[0] + sh[0], p[1] + sh[1], p[2] + sh[2]]);
    }
    for (const m of MOONS) {
      const pp = helio.get(m.parent);
      const off = this.moonOffsets.get(m.id).offsetKm;
      helio.set(m.id, pp.map((v, k) => v + off[k] / AU_KM));
      helioVel.set(m.id, helioVel.get(m.parent));
    }
    this.computeProbes();
  }

  /** Spacecraft: interpolated true trajectory, re-attached to the drawn planets near flybys. */
  computeProbes() {
    const { helio, helioVel } = this;
    this.probeLocal.clear();
    this.probeExtrapolated = new Map();
    for (const { body, traj } of this.probes) {
      const st = traj.state(this.jd);
      if (!st) continue;
      const corr = traj.correction(this.jd, (id) => helio.get(id), st.pos);
      const pos = [st.pos[0] + corr[0], st.pos[1] + corr[1], st.pos[2] + corr[2]];
      helio.set(body.id, pos);
      helioVel.set(body.id, st.vel);
      const local = probeLocalFrame(pos, (id) => helio.get(id));
      if (local) this.probeLocal.set(body.id, local);
      this.probeExtrapolated.set(body.id, st.extrapolated);
    }
  }

  hasBody(id) {
    return this.helio.has(id);
  }

  /** Heliocentric distance (AU) and speed relative to the Sun (km/s). */
  kinematics(id) {
    const p = this.helio.get(id), v = this.helioVel.get(id);
    if (!p) return null;
    const body = BODY_BY_ID[id];
    let speed = Math.hypot(...v) * AU_KM / 86400;
    let orbitalSpeed = null;
    if (body && body.parent) {
      orbitalSpeed = (2 * Math.PI * body.distanceKm) / (Math.abs(body.periodDays) * 86400);
    }
    return { distanceAU: Math.hypot(...p), speedKmS: speed, orbitalSpeed };
  }

  /** N-body only: distance (km) between the integrated and ephemeris positions. */
  deviationKm(id) {
    if (!this.nbody) return null;
    const planet = PLANETS.find((p) => p.id === id);
    const comet = this.comets.find((c) => c.id === id);
    if (!planet && !comet) return null;
    const i = this.nbody.indexOf(id);
    if (i < 0) return null;
    const p = this.nbody.pos[i], s = this.nbody.pos[0];
    const k = planet ? planetState(planet, this.jd).pos : cometState(comet, this.jd).pos;
    return Math.hypot(p[0] - s[0] - k[0], p[1] - s[1] - k[1], p[2] - s[2] - k[2]) * AU_KM;
  }

  get gmSun() {
    return GM_SUN * (this.nbody ? this.multipliers.sun : 1);
  }
}

export { SUN };
