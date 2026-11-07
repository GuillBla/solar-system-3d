// Analytic eclipse shadows (no shadow maps).
//
// For every fragment of a shaded body we rebuild its position in REAL
// kilometres relative to the body center (unit-sphere normal × true radius),
// then compute which fraction of the solar disc is hidden by nearby spheres
// (moons, planet), using the apparent angular radii: this naturally gives the
// soft penumbra and the sharp umbra, in both display scales, because the
// geometry never uses the (inflated) display positions.
// Saturn also gets the shadow of its rings on the globe, and the rings the
// shadow of the globe.
import * as THREE from 'three';

export const MAX_OCCLUDERS = 4;

const GLSL_COMMON = /* glsl */ `
uniform float uEclR;
uniform vec3 uSunPos;
uniform float uSunR;
uniform vec4 uOcc[${MAX_OCCLUDERS}];
uniform vec3 uOccTint[${MAX_OCCLUDERS}];
uniform int uOccN;
varying vec3 vEclN;
#ifdef ECL_RING
uniform vec3 uRingSun;
uniform float uRingInner;
uniform float uRingOuter;
uniform sampler2D uRingTex;
varying vec3 vOrientPos;
#endif

// Fraction of a unit disc hidden by a disc of radius r at distance d.
float eclDiscOverlap(float r, float d) {
  if (d >= 1.0 + r) return 0.0;
  if (d <= abs(1.0 - r)) return r < 1.0 ? r * r : 1.0;
  float a = acos(clamp((d * d + 1.0 - r * r) / (2.0 * d), -1.0, 1.0));
  float b = acos(clamp((d * d + r * r - 1.0) / (2.0 * d * r), -1.0, 1.0));
  float k = 0.5 * sqrt(max(0.0, (-d + 1.0 + r) * (d + 1.0 - r) * (d - 1.0 + r) * (d + 1.0 + r)));
  return (a + r * r * b - k) / PI;
}

// Fraction of the Sun hidden by sphere (O, Ro) as seen from P.
float eclSunOcclusion(vec3 P, vec3 S, float Rs, vec3 O, float Ro) {
  vec3 toS = S - P, toO = O - P;
  float dS = length(toS), dO = length(toO);
  if (dO >= dS || dot(toS, toO) <= 0.0) return 0.0;
  float aS = asin(min(1.0, Rs / dS));
  float aO = asin(min(1.0, Ro / dO));
  float sep = atan(length(cross(toS, toO)), dot(toS, toO));
  return eclDiscOverlap(aO / aS, sep / aS);
}

vec3 eclipseFactor() {
  vec3 P = normalize(vEclN) * uEclR;
  float lit = 1.0;
  vec3 tint = vec3(0.0);
  for (int k = 0; k < ${MAX_OCCLUDERS}; k++) {
    if (k >= uOccN) break;
    float f = eclSunOcclusion(P, uSunPos, uSunR, uOcc[k].xyz, uOcc[k].w);
    lit *= 1.0 - f;
    tint += f * uOccTint[k];
  }
#ifdef ECL_RING
  // Ring shadow on the globe: march toward the Sun up to the ring plane.
  vec3 L = normalize(uRingSun);
  vec3 Q = normalize(vOrientPos);
  if (abs(L.z) > 1e-4) {
    float t = -Q.z / L.z;
    if (t > 0.0) {
      float r = length((Q + t * L).xy);
      if (r > uRingInner && r < uRingOuter) {
        float a = texture2D(uRingTex, vec2((r - uRingInner) / (uRingOuter - uRingInner), 0.5)).a;
        lit *= 1.0 - 0.92 * a;
      }
    }
  }
#endif
  return vec3(lit) + tint;
}
`;

/**
 * Patch a MeshStandardMaterial so that direct sunlight is attenuated by
 * eclipses. Returns the uniforms to update every frame.
 * opts.ring: { inner, outer (planet radii), texture } for Saturn's globe.
 * opts.key: string making the shader program unique for this variant.
 */
export function addEclipseShadows(material, { ring = null, key = 'body' } = {}) {
  const uniforms = {
    uEclR: { value: 1 },
    uSunPos: { value: new THREE.Vector3(1e8, 0, 0) },
    uSunR: { value: 695700 },
    uOcc: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4()) },
    uOccTint: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector3()) },
    uOccN: { value: 0 },
    uRingSun: { value: new THREE.Vector3(0, 0, 1) },
    uRingInner: { value: ring ? ring.inner : 0 },
    uRingOuter: { value: ring ? ring.outer : 0 },
    uRingTex: { value: ring ? ring.texture : null },
  };
  if (ring) material.defines = { ...(material.defines || {}), ECL_RING: '' };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEclN;\n#ifdef ECL_RING\nvarying vec3 vOrientPos;\n#endif')
      .replace(
        '#include <begin_vertex>',
        // The sphere mesh is rotated by +90° about X inside the body frame.
        '#include <begin_vertex>\nvEclN = mat3(modelMatrix) * position;\n#ifdef ECL_RING\nvOrientPos = vec3(position.x, -position.z, position.y);\n#endif',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nvec3 eclF = eclipseFactor();\nreflectedLight.directDiffuse *= eclF;\nreflectedLight.directSpecular *= eclF;',
      );
  };
  material.customProgramCacheKey = () => `eclipse-${key}${ring ? '-ring' : ''}`;
  return uniforms;
}

/** Shadow of the globe on the rings (ring geometry in planet radii, XY plane). */
export function addRingPlanetShadow(material) {
  const uniforms = { uRingSun: { value: new THREE.Vector3(0, 0, 1) } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRingPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRingPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRingSun;\nvarying vec3 vRingPos;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 L = normalize(uRingSun);
          float b = dot(vRingPos, L);
          float shade = 1.0;
          if (b < 0.0) {
            float dmin = sqrt(max(0.0, dot(vRingPos, vRingPos) - b * b));
            shade = smoothstep(0.985, 1.015, dmin);
          }
          reflectedLight.directDiffuse *= shade;
          reflectedLight.directSpecular *= shade;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'ring-planet-shadow';
  return uniforms;
}
