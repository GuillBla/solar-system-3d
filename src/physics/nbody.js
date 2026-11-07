// Direct-summation N-body integrator.
// Units: AU, days, solar masses  ->  G = k^2 (Gaussian gravitational constant).
// Scheme: leapfrog kick-drift-kick (symplectic & time-reversible), so energy
// does not drift secularly and running time backwards retraces the motion.

export const G = 2.959122082855911e-4; // AU^3 / (Msun * day^2)

export class NBodySystem {
  constructor() {
    this.ids = [];
    this.mass = []; // solar masses (current, after multipliers)
    this.baseMass = [];
    this.pos = []; // [x,y,z] arrays, AU
    this.vel = []; // AU/day
    this.acc = [];
    this.softening2 = 1e-10; // AU^2, avoids singularities on close encounters
    this.initialEnergy = 0;
  }

  get count() {
    return this.ids.length;
  }

  add(id, mass, pos, vel) {
    this.ids.push(id);
    this.mass.push(mass);
    this.baseMass.push(mass);
    this.pos.push(pos.slice());
    this.vel.push(vel.slice());
    this.acc.push([0, 0, 0]);
    this.computeAccelerations();
    return this.ids.length - 1;
  }

  remove(index) {
    for (const arr of [this.ids, this.mass, this.baseMass, this.pos, this.vel, this.acc]) {
      arr.splice(index, 1);
    }
    this.computeAccelerations();
  }

  indexOf(id) {
    return this.ids.indexOf(id);
  }

  /** Shift velocities so that the total momentum is zero (barycentric frame). */
  zeroMomentum() {
    let px = 0, py = 0, pz = 0, m = 0;
    for (let i = 0; i < this.count; i++) {
      px += this.mass[i] * this.vel[i][0];
      py += this.mass[i] * this.vel[i][1];
      pz += this.mass[i] * this.vel[i][2];
      m += this.mass[i];
    }
    for (let i = 0; i < this.count; i++) {
      this.vel[i][0] -= px / m;
      this.vel[i][1] -= py / m;
      this.vel[i][2] -= pz / m;
    }
  }

  computeAccelerations() {
    const n = this.count;
    const { pos, mass, acc } = this;
    for (let i = 0; i < n; i++) acc[i][0] = acc[i][1] = acc[i][2] = 0;
    for (let i = 0; i < n; i++) {
      const pi = pos[i];
      for (let j = i + 1; j < n; j++) {
        const pj = pos[j];
        const dx = pj[0] - pi[0];
        const dy = pj[1] - pi[1];
        const dz = pj[2] - pi[2];
        const r2 = dx * dx + dy * dy + dz * dz + this.softening2;
        const inv = 1 / (r2 * Math.sqrt(r2)); // 1/r^3
        const fi = G * mass[j] * inv;
        const fj = G * mass[i] * inv;
        acc[i][0] += fi * dx; acc[i][1] += fi * dy; acc[i][2] += fi * dz;
        acc[j][0] -= fj * dx; acc[j][1] -= fj * dy; acc[j][2] -= fj * dz;
      }
    }
  }

  /** One leapfrog KDK step of dt days (dt may be negative). */
  step(dt) {
    const n = this.count;
    const { pos, vel, acc } = this;
    const h = dt * 0.5;
    for (let i = 0; i < n; i++) {
      vel[i][0] += acc[i][0] * h; vel[i][1] += acc[i][1] * h; vel[i][2] += acc[i][2] * h;
      pos[i][0] += vel[i][0] * dt; pos[i][1] += vel[i][1] * dt; pos[i][2] += vel[i][2] * dt;
    }
    this.computeAccelerations();
    for (let i = 0; i < n; i++) {
      vel[i][0] += acc[i][0] * h; vel[i][1] += acc[i][1] * h; vel[i][2] += acc[i][2] * h;
    }
  }

  /**
   * Advance by `days` using fixed sub-steps of at most `maxDt`, capped at
   * `maxSteps` per call (beyond that the step grows: accuracy is traded for
   * keeping the frame rate). Returns the dt actually used.
   */
  advance(days, maxDt = 0.5, maxSteps = 4000) {
    if (days === 0) return 0;
    let steps = Math.ceil(Math.abs(days) / maxDt);
    steps = Math.min(Math.max(steps, 1), maxSteps);
    const dt = days / steps;
    for (let s = 0; s < steps; s++) this.step(dt);
    return dt;
  }

  /** Total energy (kinetic + potential), in Msun AU^2/day^2. */
  energy() {
    const n = this.count;
    let ke = 0, pe = 0;
    for (let i = 0; i < n; i++) {
      const v = this.vel[i];
      ke += 0.5 * this.mass[i] * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      for (let j = i + 1; j < n; j++) {
        const dx = this.pos[j][0] - this.pos[i][0];
        const dy = this.pos[j][1] - this.pos[i][1];
        const dz = this.pos[j][2] - this.pos[i][2];
        pe -= (G * this.mass[i] * this.mass[j]) / Math.sqrt(dx * dx + dy * dy + dz * dz + this.softening2);
      }
    }
    return ke + pe;
  }

  markEnergyReference() {
    this.initialEnergy = this.energy();
  }

  relativeEnergyDrift() {
    if (!this.initialEnergy) return 0;
    return (this.energy() - this.initialEnergy) / Math.abs(this.initialEnergy);
  }

  setMassMultiplier(id, factor) {
    const i = this.indexOf(id);
    if (i < 0) return;
    this.mass[i] = this.baseMass[i] * factor;
    this.computeAccelerations();
  }
}
