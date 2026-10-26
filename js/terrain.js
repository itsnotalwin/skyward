// terrain.js — seeded noise, heightfield, chunk streaming, water
import * as THREE from 'three';

export const WORLD_SEED = 1337;
export const WATER_Y = 8;
export const CHUNK_SIZE = 240;
export const CHUNK_SEG = 40;
export const VIEW_RADIUS = 4;

// ---------- deterministic hashing / noise ----------
function hash2(ix, iz, seed) {
  let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x, z, octaves, seed) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const lerp = (a, b, t) => a + (b - a) * t;

// mulberry32 seeded by chunk coords — one RNG per chunk
export function chunkRng(cx, cz, salt = 0) {
  let h = (WORLD_SEED + salt) ^ Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  let a = (h ^ (h >>> 16)) >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- heightfield ----------
export function terrainHeight(x, z) {
  const continent = fbm(x * 0.0011, z * 0.0011, 3, WORLD_SEED);
  const mountains = fbm(x * 0.0042 + 37, z * 0.0042 - 71, 4, WORLD_SEED + 7);
  const detail = fbm(x * 0.02, z * 0.02, 2, WORLD_SEED + 13);
  const land = smoothstep(0.34, 0.62, continent);
  const ridge = Math.pow(mountains, 2.4) * smoothstep(0.45, 0.75, continent);
  return (continent - 0.40) * 70 + ridge * 110 + detail * 6 * land;
}

export function moisture(x, z) {
  return fbm(x * 0.0016 + 500, z * 0.0016 + 500, 3, WORLD_SEED + 29);
}

// ---------- biome coloring ----------
const C_SAND = [0.85, 0.77, 0.55];
const C_ROCK = [0.50, 0.46, 0.44];
const C_SNOW = [0.97, 0.98, 1.0];
const C_GRASS_DRY = [0.64, 0.61, 0.32];
const C_GRASS = [0.22, 0.58, 0.28];
const C_DESERT = [0.88, 0.73, 0.45];

function biomeColor(x, z, h, slope, out) {
  const m = moisture(x, z);
  let r, g, b;
  if (h < WATER_Y + 3) {                     // beaches & sea floor
    r = C_SAND[0]; g = C_SAND[1]; b = C_SAND[2];
    if (h < WATER_Y - 6) { r *= 0.45; g *= 0.62; b *= 0.72; } // deeper = teal depth
  } else if (h > 72 || (h > 58 && slope > 0.55)) {   // snow caps
    r = C_SNOW[0]; g = C_SNOW[1]; b = C_SNOW[2];
  } else if (slope > 0.75) {                 // cliffs
    r = C_ROCK[0]; g = C_ROCK[1]; b = C_ROCK[2];
  } else {
    let dry = lerp(C_GRASS_DRY[0], C_GRASS[0], smoothstep(0.35, 0.65, m));
    let dg = lerp(C_GRASS_DRY[1], C_GRASS[1], smoothstep(0.35, 0.65, m));
    let db = lerp(C_GRASS_DRY[2], C_GRASS[2], smoothstep(0.35, 0.65, m));
    if (m < 0.3) { // desert blend
      const t = smoothstep(0.3, 0.16, m);
      dry = lerp(dry, C_DESERT[0], t); dg = lerp(dg, C_DESERT[1], t); db = lerp(db, C_DESERT[2], t);
    }
    const hi = smoothstep(38, 55, h);        // fade to rock at altitude
    r = lerp(dry, C_ROCK[0], hi); g = lerp(dg, C_ROCK[1], hi); b = lerp(db, C_ROCK[2], hi);
  }
  const j = (valueNoise(x * 0.15, z * 0.15, WORLD_SEED + 3) - 0.5) * 0.07;
  out[0] = Math.min(1, Math.max(0, r + j));
  out[1] = Math.min(1, Math.max(0, g + j));
  out[2] = Math.min(1, Math.max(0, b + j));
}

// ---------- chunk streaming ----------
const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0
});

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
  }

  update(px, pz, budget = 1, radius = VIEW_RADIUS) {
    const ccx = Math.floor(px / CHUNK_SIZE), ccz = Math.floor(pz / CHUNK_SIZE);
    for (const [k, ch] of this.chunks) {
      if (Math.max(Math.abs(ch.cx - ccx), Math.abs(ch.cz - ccz)) > radius + 1) {
        this.scene.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        this.chunks.delete(k);
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = ccx + dx, cz = ccz + dz, k = cx + ',' + cz;
        if (!this.chunks.has(k) && !this.queue.some(q => q.k === k)) this.queue.push({ cx, cz, k });
      }
    }
    this.queue.sort((a, b) =>
      (Math.abs(a.cx - ccx) + Math.abs(a.cz - ccz)) - (Math.abs(b.cx - ccx) + Math.abs(b.cz - ccz)));
    let n = 0;
    while (this.queue.length && n < budget) {
      const job = this.queue.shift();
      if (Math.max(Math.abs(job.cx - ccx), Math.abs(job.cz - ccz)) > radius) continue;
      this.build(job.cx, job.cz);
      n++;
    }
  }

  build(cx, cz) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEG, CHUNK_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = [0, 0, 0];
    const step = CHUNK_SIZE / CHUNK_SEG;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + ox, wz = pos.getZ(i) + oz;
      const h = terrainHeight(wx, wz);
      pos.setY(i, h);
      const hx = terrainHeight(wx + step, wz) - h;
      const hz = terrainHeight(wx, wz + step) - h;
      const slope = Math.hypot(hx, hz) / step;
      biomeColor(wx, wz, h, slope, c);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.position.set(ox, 0, oz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.chunks.set(this.key(cx, cz), { cx, cz, mesh });
  }

  key(cx, cz) { return cx + ',' + cz; }
  get count() { return this.chunks.size; }
}

export class Water {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE * (VIEW_RADIUS + 1) * 2.4, CHUNK_SIZE * (VIEW_RADIUS + 1) * 2.4);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x2e7fb8, transparent: true, opacity: 0.78, roughness: 0.35, metalness: 0.25
    }));
    scene.add(this.mesh);
  }
  update(t, px, pz) {
    this.mesh.position.set(px, WATER_Y + Math.sin(t * 0.5) * 0.35, pz);
  }
}

// puffy low-poly clouds, streamed per chunk like terrain
export class Clouds {
  constructor(scene) {
    this.scene = scene;
    this.groups = new Map();
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xf4f8ff, flatShading: true, roughness: 1,
      transparent: true, opacity: 0.88
    });
    this.geo = new THREE.DodecahedronGeometry(1, 0);
  }

  update(px, pz) {
    const R = 3;
    const ccx = Math.floor(px / CHUNK_SIZE), ccz = Math.floor(pz / CHUNK_SIZE);
    for (const [k, g] of this.groups) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > R + 1) {
        this.scene.remove(g);
        this.groups.delete(k);
      }
    }
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx, cz = ccz + dz, k = cx + ',' + cz;
        if (this.groups.has(k)) continue;
        const rng = chunkRng(cx, cz, 0xc10d);
        const g = new THREE.Group();
        const n = rng() < 0.75 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(this.geo, this.mat);
          m.position.set((rng() - 0.5) * CHUNK_SIZE * 0.9, 130 + rng() * 90, (rng() - 0.5) * CHUNK_SIZE * 0.9);
          m.scale.set(18 + rng() * 22, 7 + rng() * 6, 14 + rng() * 16);
          m.rotation.y = rng() * Math.PI;
          g.add(m);
        }
        g.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        this.scene.add(g);
        this.groups.set(k, g);
      }
    }
  }
}
