// Visual representation of one body: sphere + optional rings, clouds,
// atmosphere, glow, and its CSS label.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { proceduralTexture, glowTexture } from './textures.js';
import { addEclipseShadows, addRingPlanetShadow, MAX_OCCLUDERS } from './shadows.js';

// Bodies whose surface receives eclipse shadows (see App.updateShadows).
export const SHADOWED = new Set(['earth', 'moon', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'titan']);

const SPHERE = new THREE.SphereGeometry(1, 96, 48);
const SPHERE_LOW = new THREE.SphereGeometry(1, 48, 24);
let sharedGlow = null;

// Atmosphere rim: fresnel glow lit only on the day side. Includes the log-depth
// chunks because the renderer uses a logarithmic depth buffer.
function atmosphereMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uStrength: { value: strength },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      uniform vec3 uSunDir;
      uniform float uStrength;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = 1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
        float fres = pow(rim, 2.2);
        float day = smoothstep(-0.35, 0.45, dot(normalize(vNormal), uSunDir));
        gl_FragColor = vec4(uColor * fres * day * uStrength, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

const ATMOSPHERES = {
  earth: { color: '#6fb2ff', strength: 1.6, scale: 1.035 },
  venus: { color: '#ffdca0', strength: 1.0, scale: 1.04 },
  mars: { color: '#ff9a6a', strength: 0.45, scale: 1.02 },
  uranus: { color: '#b8f4ff', strength: 0.6, scale: 1.03 },
  neptune: { color: '#7aa0ff', strength: 0.7, scale: 1.03 },
  titan: { color: '#ffb35a', strength: 1.0, scale: 1.08 },
};

export class BodyView {
  /**
   * @param {object} body  data from bodies.js
   * @param {function} loadTex  texture loader
   */
  constructor(body, loadTex) {
    this.body = body;
    this.group = new THREE.Group(); // positioned & scaled by display radius
    this.group.name = body.id;
    this.orient = new THREE.Group(); // body-fixed frame (spins with the body)
    this.group.add(this.orient);
    this.uniformsToUpdate = [];
    this.sunDirView = new THREE.Vector3();

    const isStar = body.id === 'sun' || body.isStar;
    let material;
    if (isStar) {
      const hdr = new THREE.Color(body.color || '#ffffff').multiplyScalar(body.id === 'sun' ? 1 : 1.5);
      material = new THREE.MeshBasicMaterial({ color: hdr });
      if (body.texture) {
        material.map = loadTex(body.texture);
        material.color.setScalar(1.9); // HDR > 1 so the bloom pass picks it up
      }
    } else {
      const map = body.texture ? loadTex(body.texture) : proceduralTexture(body.procedural || { base: '#888', dark: '#444', light: '#ccc' });
      material = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
      if (body.id === 'earth') this.setupEarth(material, loadTex);
      if (['jupiter', 'saturn', 'uranus', 'neptune', 'venus'].includes(body.id)) material.roughness = 1;
      if (body.rings) this.ringTex = loadTex(body.rings.texture);
      if (SHADOWED.has(body.id)) {
        const ring = body.rings ? { inner: body.rings.inner / body.radiusKm, outer: body.rings.outer / body.radiusKm, texture: this.ringTex } : null;
        this.eclipse = [addEclipseShadows(material, { key: body.id, ring })];
        this.eclipse[0].uEclR.value = body.radiusKm;
        if (this.clouds) {
          const u = addEclipseShadows(this.clouds.material, { key: 'clouds' });
          u.uEclR.value = body.radiusKm * 1.008;
          this.eclipse.push(u);
        }
      }
    }
    const geo = body.parent ? SPHERE_LOW : SPHERE;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.rotation.x = Math.PI / 2; // sphere poles (Y) -> body pole (Z)
    this.mesh.userData.bodyId = body.id;
    this.orient.add(this.mesh);

    if (isStar) {
      sharedGlow ??= glowTexture();
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: sharedGlow,
          color: new THREE.Color(body.id === 'sun' ? '#ffd9a0' : body.color).multiplyScalar(0.9),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      sprite.scale.setScalar(body.id === 'sun' ? 5 : 6);
      this.group.add(sprite);
      this.glow = sprite;
    }

    const atm = ATMOSPHERES[body.id];
    if (atm) {
      const m = atmosphereMaterial(atm.color, atm.strength);
      const shell = new THREE.Mesh(SPHERE_LOW, m);
      shell.scale.setScalar(atm.scale);
      shell.raycast = () => {};
      this.group.add(shell);
      this.uniformsToUpdate.push(m.uniforms.uSunDir);
    }

    if (body.rings) this.addRings(body, loadTex);

    // Label
    const el = document.createElement('div');
    el.className = 'label' + (body.parent ? ' label-moon' : '') + (isStar ? ' label-star' : '');
    el.innerHTML = `<span class="dot" style="--c:${body.color}"></span><span class="name">${body.name}</span>`;
    el.dataset.bodyId = body.id;
    this.labelEl = el;
    this.label = new CSS2DObject(el);
    this.label.center.set(-0.05, 1.05);
    this.label.position.set(0, 1.02, 0); // just above the north limb (scaled by radius)
    this.group.add(this.label);
  }

  setupEarth(material, loadTex) {
    // Night-side city lights: inject an emissive term masked by the Sun direction.
    const night = loadTex('2k_earth_nightmap.jpg');
    const uniforms = { uNight: { value: night }, uSunDir: { value: new THREE.Vector3(1, 0, 0) } };
    this.uniformsToUpdate.push(uniforms.uSunDir);
    material.roughness = 0.75;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uNight;\nuniform vec3 uSunDir;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float sunDot = dot(normalize(vNormal), uSunDir);
          float nightMask = 1.0 - smoothstep(-0.15, 0.1, sunDot);
          totalEmissiveRadiance += texture2D(uNight, vMapUv).rgb * nightMask * 1.4;`,
        );
    };
    // Clouds
    const clouds = new THREE.Mesh(
      SPHERE,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        alphaMap: loadTex('2k_earth_clouds.jpg', { srgb: false }),
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    clouds.scale.setScalar(1.008);
    clouds.rotation.x = Math.PI / 2;
    clouds.raycast = () => {};
    this.orient.add(clouds);
    this.clouds = clouds;
  }

  addRings(body, loadTex) {
    const r = body.rings;
    const inner = r.inner / body.radiusKm, outer = r.outer / body.radiusKm;
    const geo = new THREE.RingGeometry(inner, outer, 180, 1);
    // Remap UVs so the texture's x axis runs radially from inner to outer edge.
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (d - inner) / (outer - inner), 0.5);
    }
    const mat = new THREE.MeshStandardMaterial({
      map: this.ringTex,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 1,
      depthWrite: false,
      opacity: 0.95,
    });
    this.ringShadow = addRingPlanetShadow(mat);
    const ring = new THREE.Mesh(geo, mat);
    ring.raycast = () => {};
    this.orient.add(ring); // ring lies in the body's equatorial (XY) plane
  }

  /**
   * Eclipse inputs, all relative to this body's center in real km (three.js
   * axes): the Sun, and up to MAX_OCCLUDERS spheres {pos, radius, tint}.
   */
  setEclipse(sunPos, occluders) {
    if (!this.eclipse) return;
    for (const u of this.eclipse) {
      u.uSunPos.value.copy(sunPos);
      const n = Math.min(occluders.length, MAX_OCCLUDERS);
      for (let k = 0; k < n; k++) {
        const o = occluders[k];
        u.uOcc.value[k].set(o.pos.x, o.pos.y, o.pos.z, o.radius);
        u.uOccTint.value[k].copy(o.tint);
      }
      u.uOccN.value = n;
    }
    if (this.body.rings) {
      // Sun direction in the body frame (rings lie in its XY plane).
      const q = this.orient.quaternion.clone().invert();
      const dir = sunPos.clone().normalize().applyQuaternion(q);
      this.eclipse[0].uRingSun.value.copy(dir);
      this.ringShadow.uRingSun.value.copy(dir);
    }
  }

  /** Set the body-fixed frame from three.js basis vectors. */
  setBasis(x, y, z) {
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    this.orient.quaternion.setFromRotationMatrix(m);
  }

  /** Per-frame update of view-dependent uniforms. */
  updateLighting(sunWorld, camera) {
    if (!this.uniformsToUpdate.length) return;
    const p = new THREE.Vector3();
    this.group.getWorldPosition(p);
    this.sunDirView.copy(sunWorld).sub(p).normalize().transformDirection(camera.matrixWorldInverse);
    for (const u of this.uniformsToUpdate) u.value.copy(this.sunDirView);
  }

  setLabelVisible(v) {
    this.label.visible = v;
    this.labelEl.style.display = v ? '' : 'none';
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.material) o.material.dispose?.();
    });
    this.labelEl.remove();
  }
}
