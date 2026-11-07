// Simulation state: clock + the two physics modes.
//  - 'ephemeris': analytic Keplerian positions (JPL elements) at the current date
//  - 'nbody'    : numerical integration of mutual gravity, seeded from the ephemeris

import { planetState, AU_KM, GM_SUN } from './physics/kepler.js';
import { NBodySystem } from './physics/nbody.js';
import { moonOffset, earthFromBarycenter } from './physics/orientation.js';
import { PLANETS, MOONS, SUN, SUN_MASS_KG, BODY_BY_ID } from './data/bodies.js';
import { dateToJD } from './time.js';

const MOON = MOONS.find((m) => m.id === 'moon');

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
    }
    // Moons (kinematic), and Earth offset from the Earth–Moon barycenter.
    this.moonOffsets = new Map();
    for (const m of MOONS) {
      const parent = BODY_BY_ID[m.parent];
      const off = moonOffset(m, parent, this.jd);
      this.moonOffsets.set(m.id, off);
    }
    const emb = helio.get('earth');
    const earthShift = earthFromBarycenter(this.moonOffsets.get('moon').offsetKm, BODY_BY_ID.earth.massKg, MOON.massKg);
    helio.set('earth', emb.map((v, k) => v + earthShift[k]));
    for (const m of MOONS) {
      const pp = helio.get(m.parent);
      const off = this.moonOffsets.get(m.id).offsetKm;
      helio.set(m.id, pp.map((v, k) => v + off[k] / AU_KM));
      helioVel.set(m.id, helioVel.get(m.parent));
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
    if (!planet) return null;
    const i = this.nbody.indexOf(id);
    if (i < 0) return null;
    const p = this.nbody.pos[i], s = this.nbody.pos[0];
    const k = planetState(planet, this.jd).pos;
    return Math.hypot(p[0] - s[0] - k[0], p[1] - s[1] - k[1], p[2] - s[2] - k[2]) * AU_KM;
  }

  get gmSun() {
    return GM_SUN * (this.nbody ? this.multipliers.sun : 1);
  }
}

export { SUN };
