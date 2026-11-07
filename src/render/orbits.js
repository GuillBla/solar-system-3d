// Orbit ellipses (ephemeris mode) and fading trails (N-body mode).
import * as THREE from 'three';

/** A polyline whose points are rewritten every frame. */
export class OrbitLine {
  constructor(segments, color, opacity = 0.35) {
    this.segments = segments;
    this.positions = new Float32Array((segments + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    this.line.frustumCulled = false;
    this.line.raycast = () => {};
  }

  /** `pointAt(s, out)` writes the s-th point (0..segments) into out (Vector3). */
  update(pointAt) {
    const v = new THREE.Vector3();
    for (let s = 0; s <= this.segments; s++) {
      pointAt(s, v);
      this.positions[s * 3] = v.x; this.positions[s * 3 + 1] = v.y; this.positions[s * 3 + 2] = v.z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * History of heliocentric positions (AU) for N-body mode, drawn with a color
 * fading to black (additive blending -> fades to transparent).
 */
export class Trail {
  constructor(color, maxPoints = 700) {
    this.max = maxPoints;
    this.points = []; // [x,y,z] AU, oldest first
    this.lastJd = null;
    this.positions = new Float32Array(maxPoints * 3);
    this.colors = new Float32Array(maxPoints * 3);
    this.color = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.line.frustumCulled = false;
    this.line.raycast = () => {};
  }

  clear() {
    this.points.length = 0;
    this.lastJd = null;
  }

  /** Record a sample if at least `interval` days passed (either direction). */
  sample(jd, pos, interval) {
    if (this.lastJd !== null && Math.abs(jd - this.lastJd) < interval) return;
    this.lastJd = jd;
    this.points.push(pos.slice());
    if (this.points.length > this.max) this.points.shift();
  }

  /** Map to scene units; `head` is the live current position appended last. */
  update(mapper, head) {
    const v = new THREE.Vector3();
    const pts = head ? [...this.points, head] : this.points;
    const n = Math.min(pts.length, this.max);
    const start = pts.length - n;
    for (let k = 0; k < n; k++) {
      mapper.position(pts[start + k], v);
      this.positions[k * 3] = v.x; this.positions[k * 3 + 1] = v.y; this.positions[k * 3 + 2] = v.z;
      const f = Math.pow((k + 1) / n, 1.6) * 0.8;
      this.colors[k * 3] = this.color.r * f; this.colors[k * 3 + 1] = this.color.g * f; this.colors[k * 3 + 2] = this.color.b * f;
    }
    const g = this.line.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}
