// Texture loading + procedural textures for bodies without a photographic map.
import * as THREE from 'three';

export const TEXTURE_PATH = 'textures/';

export function createLoader(manager) {
  const loader = new THREE.TextureLoader(manager);
  return (file, { srgb = true } = {}) => {
    const tex = loader.load(TEXTURE_PATH + file);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  };
}

// Small deterministic PRNG (mulberry32)
function rng(seed) {
  let a = seed * 2654435761;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise on a lattice (wraps horizontally for equirectangular maps).
function makeNoise(rand, cells) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x, y) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  const fade = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

const hex = (h) => new THREE.Color(h);

/** Generate an equirectangular rocky/icy texture from a palette. */
export function proceduralTexture({ base, dark, light, seed = 1, cracks = false, hazy = false }) {
  const W = 512, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const rand = rng(seed);
  const octaves = [4, 8, 16, 32, 64].map((c) => makeNoise(rand, c));
  const cBase = hex(base), cDark = hex(dark), cLight = hex(light);
  const tmp = new THREE.Color();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      let n = 0, amp = 1, norm = 0;
      for (const o of octaves) {
        n += o(u, v) * amp; norm += amp; amp *= hazy ? 0.35 : 0.55;
      }
      n /= norm;
      if (hazy) n = 0.5 + (n - 0.5) * 0.5 + 0.08 * Math.sin(v * Math.PI * 6);
      if (n < 0.5) tmp.copy(cDark).lerp(cBase, n * 2);
      else tmp.copy(cBase).lerp(cLight, (n - 0.5) * 2);
      const i = (y * W + x) * 4;
      img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (!hazy) {
    // Craters
    const count = cracks ? 15 : 140;
    for (let k = 0; k < count; k++) {
      const x = rand() * W, y = H * (0.1 + 0.8 * rand()), r = Math.pow(rand(), 3) * 14 + 1.5;
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.25)');
      g.addColorStop(0.8, 'rgba(0,0,0,0.12)');
      g.addColorStop(0.92, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (cracks) {
    // Europa-like reddish lineae
    ctx.strokeStyle = 'rgba(140,70,40,0.45)';
    for (let k = 0; k < 70; k++) {
      ctx.lineWidth = 0.5 + rand() * 1.5;
      ctx.beginPath();
      let x = rand() * W, y = rand() * H;
      ctx.moveTo(x, y);
      const ang = rand() * Math.PI;
      for (let s = 0; s < 8; s++) {
        x += Math.cos(ang + (rand() - 0.5) * 0.6) * 20;
        y += Math.sin(ang + (rand() - 0.5) * 0.6) * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Radial glow sprite texture (white core fading out). */
export function glowTexture(stops = [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,230,180,0.6)'], [0.5, 'rgba(255,160,60,0.15)'], [1, 'rgba(255,120,0,0)']]) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
