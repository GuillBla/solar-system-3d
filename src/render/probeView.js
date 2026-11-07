// Spacecraft: a small procedural model (true size: a few metres), a marker
// that stays visible from afar, a label, and the trajectory (travelled part
// bright, future part faint).
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
const gold = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.35, metalness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.4 });

/** Model in "dish radii" (dish radius = 1). The high-gain antenna looks along +Z. */
function buildModel(kind) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  // Parabolic dish: a shallow spherical cap.
  const dish = new THREE.SphereGeometry(1.6, 32, 8, 0, Math.PI * 2, 0, 0.68);
  add(dish, white, 0, 0, -1.25, -Math.PI / 2);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), dark, 0, 0, 0.3, Math.PI / 2);
  if (kind === 'newhorizons') {
    add(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 3), gold, 0, 0, -0.75, Math.PI / 2); // triangular bus
    add(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 10), dark, 0.9, -0.3, -0.9, 0, 0, Math.PI / 2); // RTG
  } else {
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.45, 10), gold, 0, 0, -0.55, Math.PI / 2); // decagonal bus
    add(new THREE.CylinderGeometry(0.012, 0.012, kind === 'voyager' ? 7 : 3.5, 4), dark, kind === 'voyager' ? -3.6 : -1.9, 0, -0.6, 0, 0, Math.PI / 2); // magnetometer boom
    add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), dark, 1.3, 0.35, -0.7, 0, 0, -Math.PI / 2.6); // RTG boom
    for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 8), dark, 1.6 + k * 0.3, 0.55 + k * 0.12, -0.7, 0, 0, Math.PI / 2.6);
  }
  g.scale.setScalar(0.5); // overall span ~ 2 "radii"
  return g;
}

export class ProbeView {
  constructor(body) {
    this.body = body;
    this.group = new THREE.Group();
    this.group.name = body.id;
    this.model = buildModel(body.model);
    this.group.add(this.model);
    this.mesh = this.model.children[1];
    this.mesh.userData.bodyId = body.id;

    const markerGeo = new THREE.BufferGeometry();
    markerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.marker = new THREE.Points(markerGeo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, color: new THREE.Color(body.color), transparent: true, opacity: 0.95, depthWrite: false }));
    this.marker.frustumCulled = false;
    this.marker.raycast = () => {};
    this.group.add(this.marker);

    const el = document.createElement('div');
    el.className = 'label label-probe';
    el.innerHTML = `<span class="dot" style="--c:${body.color}"></span><span class="name">${body.name}</span>`;
    el.dataset.bodyId = body.id;
    this.labelEl = el;
    this.label = new CSS2DObject(el);
    this.label.center.set(-0.08, 0.5);
    this.group.add(this.label);
  }

  /** Point the high-gain antenna at the Earth (world display position). */
  pointAt(target) {
    const m = new THREE.Matrix4().lookAt(target, this.group.position, new THREE.Vector3(0, 1, 0));
    this.model.quaternion.setFromRotationMatrix(m);
  }

  setLabelVisible(v) {
    this.label.visible = v;
    this.labelEl.style.display = v ? '' : 'none';
  }

  updateLighting() {}

  dispose() {
    this.labelEl.remove();
  }
}

/**
 * Trajectory polyline. The physical samples (heliocentric AU + optional
 * planet-relative data near flybys) are precomputed once; only the mapping to
 * the display is redone when the scale changes.
 */
export class ProbePath {
  constructor(samples, color) {
    this.samples = samples; // [{ jd, helio, local: {planetHelio, offsetKm, distanceKm, weight, planet} | null }]
    this.times = samples.map((s) => s.jd);
    const n = samples.length;
    this.positions = new Float32Array(n * 3);
    // Two geometries sharing one attribute, so each line has its own draw range.
    this.attr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const geoPast = new THREE.BufferGeometry().setAttribute('position', this.attr);
    const geoFuture = new THREE.BufferGeometry().setAttribute('position', this.attr);
    const c = new THREE.Color(color);
    this.past = new THREE.Line(geoPast, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false }));
    this.future = new THREE.Line(geoFuture, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.12, depthWrite: false }));
    this.group = new THREE.Group();
    for (const l of [this.past, this.future]) {
      l.frustumCulled = false;
      l.raycast = () => {};
      this.group.add(l);
    }
    this.mappedT = null;
  }

  /**
   * Re-map all points when the scale or the active flyby changed.
   * `place(sample, out)` writes the display position.
   */
  remap(key, place) {
    if (this.mappedT === key) return;
    this.mappedT = key;
    const v = new THREE.Vector3();
    this.samples.forEach((s, k) => {
      place(s, v);
      this.positions[k * 3] = v.x; this.positions[k * 3 + 1] = v.y; this.positions[k * 3 + 2] = v.z;
    });
    this.attr.needsUpdate = true;
  }

  /** Split bright/faint at the current date. */
  setTime(jd) {
    let lo = 0, hi = this.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] <= jd) lo = mid + 1; else hi = mid;
    }
    const k = lo; // number of samples in the past
    this.past.geometry.setDrawRange(0, k);
    const start = Math.max(0, k - 1);
    this.future.geometry.setDrawRange(start, this.times.length - start);
  }
}
