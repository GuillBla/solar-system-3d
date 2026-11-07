// Entry point: scene setup, per-frame update and camera focus logic.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SUN, PLANETS, MOONS, BODY_BY_ID } from './data/bodies.js';
import { planetElements, sampleOrbit, periodDays } from './physics/kepler.js';
import { bodyOrientation, moonOffset } from './physics/orientation.js';
import { Simulation, ROGUE_STAR } from './simulation.js';
import { ScaleMapper, UNITS_PER_AU } from './render/scale.js';
import { createLoader } from './render/textures.js';
import { BodyView } from './render/bodyView.js';
import { OrbitLine, Trail } from './render/orbits.js';
import { createSky, Belt } from './render/environment.js';
import { UI } from './ui.js';
import { dateToJD } from './time.js';

const container = document.getElementById('scene');
const ecl = (v) => new THREE.Vector3(v[0], v[2], -v[1]); // ecliptic -> three
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class App {
  constructor() {
    this.sim = new Simulation();
    this.mapper = new ScaleMapper();
    this.showOrbits = true;
    this.showLabels = true;
    this.focusId = 'sun';
    this.focusPoint = new THREE.Vector3();
    this.transition = null; // camera/focus animation
    this.scaleKeep = null; // camera distance preservation during scale blends
    this.display = new Map(); // id -> Vector3 (scene units, before origin shift)
    this.views = new Map();

    this.initRenderer();
    this.initScene();
    this.ui = new UI(this);
    this.ui.syncMode(this.sim.mode);
    this.ui.setActiveBody(this.focusId);
    document.getElementById('info-panel').hidden = true; // show on first selection
    this.sim.on((e) => this.onSimEvent(e));
    this.sim.onSubstep = (jd, sys) => this.sampleTrails(jd, sys);
    this.bindPicking();
    this.applyUrlParams();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);
    this.renderer = r;

    const lr = new CSS2DRenderer();
    lr.setSize(window.innerWidth, window.innerHeight);
    Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    container.appendChild(lr.domElement);
    this.labelRenderer = lr;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 2e5);
    this.camera.position.set(0, 75, 135);

    const c = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false; // the focus is controlled by selecting bodies
    c.zoomSpeed = 1.4;
    c.rotateSpeed = 0.6;
    c.maxDistance = 20000;
    this.controls = c;

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      r.setSize(w, h);
      lr.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  initScene() {
    const manager = new THREE.LoadingManager();
    const bar = document.getElementById('loading-bar');
    const hide = () => document.getElementById('loading').classList.add('done');
    manager.onProgress = (_url, loaded, total) => (bar.style.width = `${(100 * loaded) / total}%`);
    manager.onLoad = hide;
    manager.onError = (url) => console.warn('Texture introuvable :', url);
    setTimeout(hide, 12000); // never block on a slow texture
    const loadTex = createLoader(manager);
    this.loadTex = loadTex;

    this.world = new THREE.Group(); // shifted so that the focused body is at the origin
    this.scene.add(this.world);

    this.sky = createSky(loadTex);
    this.scene.add(this.sky);

    this.sunLight = new THREE.PointLight(0xffffff, 3.3, 0, 0);
    this.world.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.045));

    for (const body of [SUN, ...PLANETS, ...MOONS]) this.addView(body);

    this.orbitLines = new Map();
    for (const p of PLANETS) {
      const l = new OrbitLine(256, p.color, 0.32);
      this.orbitLines.set(p.id, l);
      this.world.add(l.line);
    }
    this.moonLines = new Map();
    for (const m of MOONS) {
      const l = new OrbitLine(96, m.color, 0.28);
      this.moonLines.set(m.id, l);
      this.world.add(l.line);
    }
    this.trails = new Map();

    this.belts = [
      new Belt({ count: 3000, aMin: 2.1, aMax: 3.3, eMax: 0.25, iMaxDeg: 20, seed: 42, gaps: [[2.5, 0.035], [2.82, 0.025], [2.95, 0.02], [3.27, 0.02]] }),
      new Belt({ count: 2500, aMin: 39, aMax: 48, eMax: 0.2, iMaxDeg: 25, seed: 7, color: '#8fa3c8', opacity: 0.45, size: 1.3 }),
    ];
    for (const b of this.belts) this.world.add(b.points);
  }

  addView(body) {
    const v = new BodyView(body, this.loadTex);
    v.labelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.focus(body.id);
    });
    this.world.add(v.group);
    this.views.set(body.id, v);
    return v;
  }

  removeView(id) {
    const v = this.views.get(id);
    if (!v) return;
    this.world.remove(v.group);
    v.dispose();
    this.views.delete(id);
    const t = this.trails.get(id);
    if (t) { this.world.remove(t.line); this.trails.delete(id); }
    if (this.focusId === id) this.focus('sun', true);
  }

  /** Optional deep-link parameters: ?date=1969-07-20&focus=moon&mode=nbody&scale=real&speed=0 */
  applyUrlParams() {
    const q = new URLSearchParams(window.location.search);
    if (q.get('date')) {
      const d = new Date(q.get('date') + (q.get('date').length <= 10 ? 'T12:00:00Z' : ''));
      if (!isNaN(d)) this.sim.setDate(dateToJD(d));
    }
    if (q.get('mode') === 'nbody') this.setMode('nbody');
    if (q.get('scale') === 'real') {
      this.mapper.setReadable(false);
      this.mapper.t = 0;
      this.ui.syncScale(false);
    }
    if (q.get('speed') !== null) this.ui.setSpeedIndex(+q.get('speed'));
    if (q.get('rogue') !== null && this.sim.nbody) this.sim.launchRogueStar();
    const f = q.get('focus');
    if (f && this.views.has(f)) {
      this.computeDisplay();
      this.focus(f);
      this.transition.duration = 0.01;
      this.camera.position.set(0.35, 0.3, 1).setLength(this.transition.toDist);
      this.transition.fromDist = this.transition.toDist;
    }
  }

  // ---------- Simulation events ----------
  onSimEvent(e) {
    if (e.type === 'mode') {
      this.ui.syncMode(e.mode);
      this.clearTrails();
      if (e.mode === 'ephemeris') this.removeView('rogue');
      this.ui.renderStats(this.focusId);
    } else if (e.type === 'jump' || e.type === 'nbody-reset') {
      this.clearTrails();
      if (!this.sim.hasBody('rogue')) this.removeView('rogue');
    } else if (e.type === 'rogue') {
      if (e.present) {
        this.removeView('rogue');
        this.addView(ROGUE_STAR);
      } else this.removeView('rogue');
    }
  }

  /** Called by the simulation after each integration chunk (N-body mode). */
  sampleTrails(jd, sys) {
    const s = sys.pos[0];
    for (let i = 1; i < sys.count; i++) {
      const id = sys.ids[i];
      let trail = this.trails.get(id);
      if (!trail) {
        trail = new Trail(this.bodyData(id).color);
        this.trails.set(id, trail);
        this.world.add(trail.line);
      }
      const body = BODY_BY_ID[id];
      const interval = body?.elements ? periodDays(body.elements[0]) / 450 : 2;
      const p = sys.pos[i];
      trail.sample(jd, [p[0] - s[0], p[1] - s[1], p[2] - s[2]], interval);
    }
  }

  clearTrails() {
    for (const t of this.trails.values()) t.clear();
  }

  setMode(mode) {
    this.sim.setMode(mode);
  }

  jumpTo(jd) {
    this.sim.setDate(jd);
  }

  resetNBody() {
    this.sim.initNBody();
    this.sim.compute();
  }

  setBelts(on) {
    for (const b of this.belts) b.points.visible = on;
  }

  setReadable(readable) {
    if (readable === this.mapper.readable) return;
    // Remember what the camera is looking at so the view stays coherent while
    // the scale morphs: either a close-up (distance in body radii) or an
    // overview (distance expressed as an equivalent heliocentric distance).
    const dist = this.camera.position.length();
    const r = this.mapper.radius(this.bodyData(this.focusId));
    if (dist / r < 80) this.scaleKeep = { type: 'radius', ratio: dist / r };
    else this.scaleKeep = { type: 'au', au: this.invertDistance(dist) };
    this.mapper.setReadable(readable);
    this.ui.syncScale(readable);
  }

  invertDistance(d) {
    let lo = 1e-6, hi = 1e5;
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(lo * hi);
      if (this.mapper.distance(mid) < d) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  }

  bodyData(id) {
    return BODY_BY_ID[id] || (id === 'rogue' ? ROGUE_STAR : SUN);
  }

  // ---------- Focus / camera ----------
  focus(id, overview = false) {
    if (!this.views.has(id)) return;
    const body = this.bodyData(id);
    const r = this.mapper.radius(body);
    let target;
    if (overview) target = this.mapper.distance(6) * 2.6;
    else if (id === 'sun') target = r * 7;
    else if (body.rings) target = r * 9;
    else target = r * 6.5;
    this.transition = {
      fromId: this.focusId,
      fromPoint: this.focusPoint.clone(),
      t: 0,
      duration: 1.6,
      fromDist: this.camera.position.length(),
      toDist: target,
    };
    this.views.get(this.focusId)?.labelEl.classList.remove('selected');
    this.focusId = id;
    this.views.get(id).labelEl.classList.add('selected');
    this.ui.setActiveBody(id);
  }

  bindPicking() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const meshes = [...this.views.values()].map((v) => v.mesh);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) this.focus(hit.object.userData.bodyId);
    });
  }

  // ---------- Positions ----------
  computeDisplay() {
    const { sim, mapper, display } = this;
    const sunDisp = ecl(sim.sunAbs).multiplyScalar(UNITS_PER_AU);
    const get = (id) => {
      let v = display.get(id);
      if (!v) display.set(id, (v = new THREE.Vector3()));
      return v;
    };
    get('sun').copy(sunDisp);
    for (const [id, helio] of sim.helio) {
      if (id === 'sun' || BODY_BY_ID[id]?.parent) continue;
      mapper.position(helio, get(id)).add(sunDisp);
    }
    for (const m of MOONS) {
      const parent = BODY_BY_ID[m.parent];
      const off = sim.moonOffsets.get(m.id);
      const dir = ecl(off.offsetKm).normalize();
      get(m.id).copy(display.get(m.parent)).addScaledVector(dir, mapper.moonDistance(off.distanceKm, parent));
    }
    for (const id of [...display.keys()]) if (!sim.helio.has(id) && id !== 'sun') display.delete(id);
  }

  updateBodies() {
    const jd = this.sim.jd;
    const tmpX = new THREE.Vector3(), tmpY = new THREE.Vector3(), tmpZ = new THREE.Vector3();
    for (const [id, view] of this.views) {
      const pos = this.display.get(id);
      if (!pos) { view.group.visible = false; view.setLabelVisible(false); continue; }
      view.group.visible = true;
      view.group.position.copy(pos);
      view.group.scale.setScalar(this.mapper.radius(view.body));
      const body = view.body;
      if (body.pole) {
        const o = bodyOrientation(body.pole, jd);
        tmpX.copy(ecl(o.meridian)); tmpZ.copy(ecl(o.pole));
        tmpY.crossVectors(tmpZ, tmpX);
        view.setBasis(tmpX, tmpY, tmpZ);
      } else if (body.parent) {
        // Tidally locked moon: prime meridian faces the parent.
        const parent = BODY_BY_ID[body.parent];
        tmpZ.copy(ecl(bodyOrientation(parent.pole, jd).pole));
        tmpX.copy(this.display.get(body.parent)).sub(pos).normalize();
        tmpY.crossVectors(tmpZ, tmpX).normalize();
        tmpX.crossVectors(tmpY, tmpZ);
        view.setBasis(tmpX, tmpY, tmpZ);
      }
      if (view.clouds) view.clouds.rotation.y = (jd * 0.08) % (Math.PI * 2); // slow drift of the cloud layer
    }
    this.sunLight.position.copy(this.display.get('sun'));
  }

  updateOrbits() {
    const { sim, mapper } = this;
    const nbody = sim.mode === 'nbody';
    const sunDisp = this.display.get('sun');
    const v = new THREE.Vector3();
    for (const p of PLANETS) {
      const line = this.orbitLines.get(p.id);
      line.line.visible = this.showOrbits && !nbody;
      if (!line.line.visible) continue;
      const pts = sampleOrbit(planetElements(p, sim.jd), line.segments);
      line.update((s, out) => {
        mapper.position([pts[s * 3], pts[s * 3 + 1], pts[s * 3 + 2]], out).add(sunDisp);
      });
    }
    for (const [id, trail] of this.trails) {
      trail.line.visible = this.showOrbits && nbody && sim.helio.has(id);
      if (!trail.line.visible) continue;
      trail.update(mapper, sim.helio.get(id));
      trail.line.position.copy(sunDisp);
    }
    // Moon orbits: only shown when the camera is close to the planet.
    const camWorld = this.camera.position;
    for (const m of MOONS) {
      const line = this.moonLines.get(m.id);
      const parent = BODY_BY_ID[m.parent];
      const parentPos = this.display.get(m.parent);
      const dMoon = mapper.moonDistance(m.distanceKm, parent);
      v.copy(parentPos).add(this.world.position);
      const near = camWorld.distanceTo(v) < dMoon * 18;
      line.line.visible = this.showOrbits && near;
      const view = this.views.get(m.id);
      view.setLabelVisible(this.showLabels && (near || this.focusId === m.id));
      if (!line.line.visible) continue;
      const P = Math.abs(m.periodDays);
      line.update((s, out) => {
        const off = moonOffset(m, parent, sim.jd + (s / line.segments) * P);
        out.copy(ecl(off.offsetKm).normalize().multiplyScalar(mapper.moonDistance(off.distanceKm, parent))).add(parentPos);
      });
    }
    for (const [id, view] of this.views) if (!view.body.parent) view.setLabelVisible(this.showLabels && view.group.visible);
  }

  updateCamera(dt) {
    const target = this.display.get(this.focusId) || this.display.get('sun');
    const cam = this.camera;
    const tr = this.transition;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      const k = ease(tr.t);
      const from = this.display.get(tr.fromId) || tr.fromPoint;
      this.focusPoint.lerpVectors(from, target, k);
      const d = Math.exp(Math.log(tr.fromDist) + (Math.log(tr.toDist) - Math.log(tr.fromDist)) * k);
      cam.position.setLength(d);
      if (tr.t >= 1) this.transition = null;
    } else {
      this.focusPoint.copy(target);
    }
    // Keep a coherent framing while the scale morphs.
    if (this.scaleKeep && !tr) {
      const ks = this.scaleKeep;
      const d = ks.type === 'radius' ? ks.ratio * this.mapper.radius(this.bodyData(this.focusId)) : this.mapper.distance(ks.au);
      cam.position.setLength(d);
      if (this.mapper.t === this.mapper.target) this.scaleKeep = null;
    }
    this.world.position.copy(this.focusPoint).negate();

    const r = this.mapper.radius(this.bodyData(this.focusId));
    this.controls.minDistance = r * 1.25;
    this.controls.update();
    const dist = cam.position.length();
    cam.near = Math.max(1e-7, Math.min(dist * 0.002, r * 0.2));
    cam.far = 2e5;
    cam.updateProjectionMatrix();
    this.sky.position.copy(cam.position);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.sim.update(dt);
    this.mapper.update(dt);
    this.computeDisplay();
    this.updateBodies();
    this.updateCamera(dt);
    this.updateOrbits();
    if (this.belts[0].points.visible) for (const b of this.belts) b.update(this.sim.jd, this.mapper);

    const sunWorld = new THREE.Vector3();
    this.views.get('sun').group.getWorldPosition(sunWorld);
    this.camera.updateMatrixWorld();
    for (const v of this.views.values()) v.updateLighting(sunWorld, this.camera);

    this.ui.update(dt);
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}

try {
  window.app = new App();
} catch (err) {
  console.error(err);
  document.getElementById('loading').innerHTML = `<p style="color:#ff8a65;padding:24px">Impossible de démarrer la 3D (WebGL indisponible ?)<br><small>${err.message}</small></p>`;
}
