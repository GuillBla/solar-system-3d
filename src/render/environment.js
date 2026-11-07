// Background sky, asteroid belt and Kuiper belt.
import * as THREE from 'three';
import { DEG, solveKepler, orbitBasis, GAUSS_K } from '../physics/kepler.js';
import { daysSinceJ2000 } from '../time.js';
import { OBLIQUITY } from '../physics/orientation.js';

/** Milky Way panorama on a huge sphere that follows the camera. */
export function createSky(loadTex) {
  const tex = loadTex('2k_stars_milky_way.jpg');
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, color: new THREE.Color(0.55, 0.55, 0.6) });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  sky.scale.setScalar(50000);
  // Decorative backdrop: tilted by the obliquity as if the panorama were in
  // equatorial coordinates. Its exact alignment with the real sky is not
  // guaranteed (approximation).
  sky.rotation.x = -OBLIQUITY;
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.raycast = () => {};
  return sky;
}

/**
 * A swarm of massless bodies on Keplerian orbits (heliocentric ecliptic).
 * Positions are recomputed on the CPU each frame through the scale mapper.
 */
export class Belt {
  constructor({ count, aMin, aMax, eMax, iMaxDeg, seed = 1, size = 1.6, color = '#a59a8c', opacity = 0.7, gaps = [] }) {
    this.count = count;
    this.a = new Float64Array(count);
    this.e = new Float64Array(count);
    this.M0 = new Float64Array(count);
    this.n = new Float64Array(count);
    this.P = new Float64Array(count * 3);
    this.Q = new Float64Array(count * 3);
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    for (let k = 0; k < count; k++) {
      let a;
      // Rejection sampling to carve Kirkwood gaps (mean-motion resonances with Jupiter)
      do { a = aMin + (aMax - aMin) * rand(); } while (gaps.some(([c, w]) => Math.abs(a - c) < w * rand()));
      this.a[k] = a;
      this.e[k] = Math.min(Math.abs(gauss()) * eMax * 0.5, eMax);
      const i = Math.min(Math.abs(gauss()) * iMaxDeg * 0.45, iMaxDeg) * DEG;
      const node = rand() * 2 * Math.PI, peri = rand() * 2 * Math.PI;
      this.M0[k] = rand() * 2 * Math.PI;
      this.n[k] = GAUSS_K / Math.pow(a, 1.5);
      const { P, Q } = orbitBasis(i, node, peri);
      this.P.set(P, k * 3); this.Q.set(Q, k * 3);
    }
    this.positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
    this.tmp = [0, 0, 0];
    this.v = new THREE.Vector3();
  }

  update(jd, mapper) {
    const d = daysSinceJ2000(jd);
    const { a, e, M0, n, P, Q, positions, tmp, v } = this;
    for (let k = 0; k < this.count; k++) {
      const E = solveKepler(M0[k] + n[k] * d, e[k]);
      const xp = a[k] * (Math.cos(E) - e[k]);
      const yp = a[k] * Math.sqrt(1 - e[k] * e[k]) * Math.sin(E);
      const j = k * 3;
      tmp[0] = xp * P[j] + yp * Q[j];
      tmp[1] = xp * P[j + 1] + yp * Q[j + 1];
      tmp[2] = xp * P[j + 2] + yp * Q[j + 2];
      mapper.position(tmp, v);
      positions[j] = v.x; positions[j + 1] = v.y; positions[j + 2] = v.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
