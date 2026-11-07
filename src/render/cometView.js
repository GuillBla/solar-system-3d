// Comet: nucleus + coma + two particle tails.
//  - ion (plasma) tail: straight, bluish, pointing away from the Sun;
//  - dust tail: yellowish, curved, lagging behind along the orbit.
// Tails are built in heliocentric AU then mapped through the scale mapper, so
// they keep a physical length in "Réaliste" scale. They grow as the comet gets
// closer to the Sun and vanish beyond ~5 AU.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { proceduralTexture } from './textures.js';

const PARTICLES = 1000;
const SPHERE = new THREE.SphereGeometry(1, 32, 16);

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Activity 0..1 vs heliocentric distance (AU). */
export function cometActivity(r) {
  if (r >= 5) return 0;
  const fade = r > 3 ? (5 - r) / 2 : 1;
  return fade * fade * Math.min(1, 1 / (r * r));
}

export class CometView {
  constructor(body) {
    this.body = body;
    this.group = new THREE.Group(); // nucleus, positioned/scaled like a body
    this.group.name = body.id;
    const map = proceduralTexture({ base: '#4a4440', dark: '#221e1b', light: '#7d746b', seed: body.id.length * 7 });
    this.mesh = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ map, roughness: 1 }));
    this.mesh.scale.set(1, 0.75, 0.85); // irregular-looking nucleus
    this.mesh.userData.bodyId = body.id;
    this.group.add(this.mesh);

    // Tails + coma live in world (display) coordinates.
    const n = PARTICLES * 2;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.tails = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tails.frustumCulled = false;
    this.tails.raycast = () => {};

    const comaGeo = new THREE.BufferGeometry();
    comaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.coma = new THREE.Points(comaGeo, new THREE.PointsMaterial({
      size: 10, sizeAttenuation: false, color: new THREE.Color(body.color), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, map: comaSprite(),
    }));
    this.coma.frustumCulled = false;
    this.coma.raycast = () => {};

    // Fixed random layout of the particles.
    const rand = rng(body.id.split('').reduce((a, c) => a + c.charCodeAt(0), 1) * 97);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
    this.s = new Float32Array(n);
    this.lat = new Float32Array(n * 2);
    this.lag = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      this.s[k] = Math.pow(rand(), 1.6);
      this.lat[k * 2] = gauss();
      this.lat[k * 2 + 1] = gauss();
      this.lag[k] = 0.6 + 0.8 * rand();
    }

    const el = document.createElement('div');
    el.className = 'label label-comet';
    el.innerHTML = `<span class="dot" style="--c:${body.color}"></span><span class="name">${body.shortName || body.name}</span>`;
    el.dataset.bodyId = body.id;
    this.labelEl = el;
    this.label = new CSS2DObject(el);
    this.label.center.set(-0.05, 1.05);
    this.label.position.set(0, 1.02, 0);
    this.group.add(this.label);
    this.activity = 0;
  }

  /**
   * @param helio  heliocentric position (AU), vel: velocity (AU/day)
   * @param mapper ScaleMapper, sunDisp: display position of the Sun
   */
  updateTails(helio, vel, mapper, sunDisp, visible) {
    const r = Math.hypot(...helio);
    const act = cometActivity(r) * (this.body.tailScale || 1);
    this.activity = act;
    this.tails.visible = visible && act > 0.03;
    this.coma.visible = visible;
    const cp = this.coma.geometry.attributes.position;
    cp.setXYZ(0, this.group.position.x, this.group.position.y, this.group.position.z);
    cp.needsUpdate = true;
    // Faint, short tails would pile up additively into a blob: fade them in.
    const vis = Math.min(1, Math.max(0, (act - 0.03) / 0.5));
    const visEased = vis * vis * (3 - 2 * vis);
    this.coma.material.size = 4 + 16 * visEased;
    this.coma.material.opacity = 0.3 + 0.7 * visEased;
    if (!this.tails.visible) return;

    const anti = helio.map((v) => v / r); // away from the Sun
    const vlen = Math.hypot(...vel) || 1;
    const vdir = vel.map((v) => v / vlen);
    // Perpendicular basis for the tail width.
    let ex = [anti[1] * vdir[2] - anti[2] * vdir[1], anti[2] * vdir[0] - anti[0] * vdir[2], anti[0] * vdir[1] - anti[1] * vdir[0]];
    const el = Math.hypot(...ex) || 1;
    ex = ex.map((v) => v / el);
    const ey = [anti[1] * ex[2] - anti[2] * ex[1], anti[2] * ex[0] - anti[0] * ex[2], anti[0] * ex[1] - anti[1] * ex[0]];
    const Lion = Math.min(1.2, 0.2 * act);
    const Ldust = Lion * 0.55;
    const bright = 0.3 * visEased;
    const p = [0, 0, 0];
    const out = new THREE.Vector3();
    for (let k = 0; k < PARTICLES * 2; k++) {
      const ion = k < PARTICLES;
      const s = this.s[k];
      const gx = this.lat[k * 2], gy = this.lat[k * 2 + 1];
      let fade;
      if (ion) {
        const w = Lion * (0.006 + 0.025 * s);
        for (let c = 0; c < 3; c++) p[c] = helio[c] + anti[c] * s * Lion + (ex[c] * gx + ey[c] * gy) * w;
        fade = Math.pow(1 - s, 1.3) * bright;
        mapper.position(p, out).add(sunDisp);
        this.colors[k * 3] = 0.35 * fade; this.colors[k * 3 + 1] = 0.6 * fade; this.colors[k * 3 + 2] = 1.0 * fade;
      } else {
        const L = Ldust * this.lag[k];
        const w = L * (0.01 + 0.09 * s);
        for (let c = 0; c < 3; c++) p[c] = helio[c] + anti[c] * s * L - vdir[c] * s * s * L * 0.9 + (ex[c] * gx * 0.4 + ey[c] * gy) * w;
        fade = Math.pow(1 - s, 1.6) * bright * 0.9;
        mapper.position(p, out).add(sunDisp);
        this.colors[k * 3] = 1.0 * fade; this.colors[k * 3 + 1] = 0.82 * fade; this.colors[k * 3 + 2] = 0.55 * fade;
      }
      this.positions[k * 3] = out.x; this.positions[k * 3 + 1] = out.y; this.positions[k * 3 + 2] = out.z;
    }
    const g = this.tails.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
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

let comaTex = null;
function comaSprite() {
  if (comaTex) return comaTex;
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  comaTex = new THREE.CanvasTexture(c);
  return comaTex;
}
