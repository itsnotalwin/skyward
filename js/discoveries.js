// discoveries.js — landmarks, orbs, ring boosts, persistence
import * as THREE from 'three';
import { CHUNK_SIZE, WATER_Y, terrainHeight, moisture, chunkRng } from './terrain.js';
import { Save } from './save.js';

const ADJ = ['Whispering', 'Amber', 'Frozen', 'Sunken', 'Gilded', 'Silent', 'Wandering', 'Shattered', 'Verdant', 'Obsidian', 'Hollow', 'Radiant', 'Drifting', 'Sunlit', 'Mossy'];
const NOUNS = {
  crystal: ['Spire', 'Monolith', 'Shard'],
  ring: ['Gateway', 'Beacon', 'Arch'],
  ruin: ['Ruins', 'Sanctum', 'Temple'],
  tree: ['Grove', 'Elder', 'Canopy'],
  isle: ['Isle', 'Hollow', 'Refuge']
};
export const TYPE_ICON = { crystal: '💎', ring: '🌀', ruin: '🏛️', tree: '🌳', isle: '🏝️' };
const BEAM_COLOR = { crystal: 0x9a6cff, ring: 0x59d8ff, ruin: 0xffd24a, tree: 0x6fdc7c, isle: 0xff9a5c };

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Discoveries {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map();
    this.time = 0;

    // shared geometry & materials
    this.geo = {
      crystal: new THREE.OctahedronGeometry(4, 0),
      ring: new THREE.TorusGeometry(16, 1.6, 8, 28),
      column: new THREE.CylinderGeometry(1.1, 1.4, 1, 7),
      trunk: new THREE.CylinderGeometry(1.4, 2.2, 16, 7),
      cone: new THREE.ConeGeometry(8, 12, 7),
      isleTop: new THREE.CylinderGeometry(13, 15, 3, 8),
      isleRock: new THREE.ConeGeometry(13, 16, 8),
      orb: new THREE.IcosahedronGeometry(1.6, 0),
      beam: new THREE.CylinderGeometry(1.1, 1.1, 240, 6, 1, true)
    };
    const glow = makeGlowTexture();
    this.mat = {
      crystal: new THREE.MeshStandardMaterial({ color: 0x6a44c8, emissive: 0x9a6cff, emissiveIntensity: 0.85, flatShading: true }),
      ring: new THREE.MeshBasicMaterial({ color: 0x59d8ff }),
      stone: new THREE.MeshStandardMaterial({ color: 0x8d8a83, flatShading: true, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true, roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x2f7a3d, flatShading: true, roughness: 0.9 }),
      isleGrass: new THREE.MeshStandardMaterial({ color: 0x3f8a4a, flatShading: true }),
      isleRock: new THREE.MeshStandardMaterial({ color: 0x6a625a, flatShading: true }),
      orb: new THREE.MeshBasicMaterial({ color: 0xffd24a })
    };
    this.glow = {
      gold: new THREE.SpriteMaterial({ map: glow, color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      violet: new THREE.SpriteMaterial({ map: glow, color: 0x9a6cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      cyan: new THREE.SpriteMaterial({ map: glow, color: 0x59d8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    };
    this.beam = {};
    for (const [type, col] of Object.entries(BEAM_COLOR)) {
      this.beam[type] = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    }
  }

  makeName(rng, type) {
    return ADJ[Math.floor(rng() * ADJ.length)] + ' ' + NOUNS[type][Math.floor(rng() * NOUNS[type].length)];
  }

  genChunk(cx, cz) {
    const rng = chunkRng(cx, cz, 0x51ab);
    const ent = { cx, cz, landmark: null, orbs: [] };

    if (rng() < 0.16) {
      for (let t = 0; t < 3 && !ent.landmark; t++) {
        const lx = (cx + 0.15 + rng() * 0.7) * CHUNK_SIZE;
        const lz = (cz + 0.15 + rng() * 0.7) * CHUNK_SIZE;
        const h = terrainHeight(lx, lz), m = moisture(lx, lz);
        const r = rng();
        let type = null;
        if (h <= WATER_Y + 1) type = r < 0.8 ? 'isle' : 'ring';
        else if (h > WATER_Y + 30 && h < 78 && r < 0.35) type = 'crystal';
        else if (m > 0.55 && h > WATER_Y + 4 && h < 55 && r < 0.55) type = 'tree';
        else if (h > WATER_Y + 3 && h < 42) type = r < 0.75 ? 'ruin' : 'ring';
        if (type) {
          const id = `L${cx}_${cz}`;
          ent.landmark = {
            id, type, name: this.makeName(rng, type),
            x: lx, z: lz, y: Math.max(h, WATER_Y),
            cy: type === 'ring' ? Math.max(h, WATER_Y) + 42 : type === 'isle' ? Math.max(h, WATER_Y) + 80 : Math.max(h, WATER_Y),
            found: !!Save.data.found[id], cd: 0, mesh: null
          };
        }
      }
    }

    let oi = 0;
    const pushOrb = (x, z, off) => {
      const id = `O${cx}_${cz}_${oi++}`;
      ent.orbs.push({
        id, x, y: Math.max(terrainHeight(x, z), WATER_Y) + off, z,
        taken: !!Save.data.orbs[id], mesh: null, phase: rng() * 6.28
      });
    };
    if (ent.landmark) {
      const L = ent.landmark;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, r = 26 + (i % 2) * 7;
        pushOrb(L.x + Math.cos(a) * r, L.z + Math.sin(a) * r, 10 + 6 * Math.sin(i * 2.1));
      }
    }
    if (rng() < 0.5) {
      const horiz = rng() < 0.5, t0 = 0.2 + rng() * 0.6;
      for (let i = 0; i < 10; i++) {
        const u = (i + 0.5) / 10;
        pushOrb(cx * CHUNK_SIZE + (horiz ? u : t0) * CHUNK_SIZE,
                cz * CHUNK_SIZE + (horiz ? t0 : u) * CHUNK_SIZE,
                14 + 10 * Math.sin(u * Math.PI));
      }
    }

    for (const o of ent.orbs) {
      if (o.taken) continue;
      o.mesh = this.makeOrb();
      o.mesh.position.set(o.x, o.y, o.z);
      this.scene.add(o.mesh);
    }
    if (ent.landmark) {
      const L = ent.landmark;
      L.mesh = this.makeLandmark(L, chunkRng(cx, cz, 0xbeef));
      this.scene.add(L.mesh);
    }
    return ent;
  }

  makeOrb() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.geo.orb, this.mat.orb));
    const s = new THREE.Sprite(this.glow.gold);
    s.scale.set(7, 7, 1);
    g.add(s);
    return g;
  }

  makeLandmark(L, rng) {
    const g = new THREE.Group();
    g.position.set(L.x, L.y, L.z);

    if (L.type === 'crystal') {
      const sizes = [1, 0.65, 0.4];
      const offs = [[0, 7, 0], [5, 4, 3], [-4, 3, -4]];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(this.geo.crystal, this.mat.crystal);
        m.position.set(...offs[i]);
        m.scale.set(sizes[i], sizes[i] * 2.2, sizes[i]);
        m.rotation.set(rng() * 0.3, rng() * 3, rng() * 0.3);
        g.add(m);
      }
      const s = new THREE.Sprite(this.glow.violet);
      s.scale.set(30, 30, 1); s.position.y = 8;
      g.add(s);
    } else if (L.type === 'ring') {
      const m = new THREE.Mesh(this.geo.ring, this.mat.ring);
      m.position.y = 42;
      g.add(m);
      const s = new THREE.Sprite(this.glow.cyan);
      s.scale.set(46, 46, 1); s.position.y = 42;
      g.add(s);
      g.rotation.y = rng() * Math.PI;
    } else if (L.type === 'ruin') {
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const h = 7 + rng() * 9;
        const col = new THREE.Mesh(this.geo.column, this.mat.stone);
        col.position.set(Math.cos(a) * 11, h / 2, Math.sin(a) * 11);
        col.scale.y = h;
        g.add(col);
      }
    } else if (L.type === 'tree') {
      const trunk = new THREE.Mesh(this.geo.trunk, this.mat.wood);
      trunk.position.y = 8; trunk.scale.setScalar(1.6);
      g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(this.geo.cone, this.mat.leaf);
        c.position.set(0, 20 + i * 8, 0);
        c.scale.setScalar(1.7 - i * 0.45);
        g.add(c);
      }
    } else if (L.type === 'isle') {
      const top = new THREE.Mesh(this.geo.isleTop, this.mat.isleGrass);
      top.position.y = 1.5;
      const rock = new THREE.Mesh(this.geo.isleRock, this.mat.isleRock);
      rock.rotation.x = Math.PI; rock.position.y = -9;
      g.add(top, rock);
      const c = new THREE.Mesh(this.geo.crystal, this.mat.crystal);
      c.position.y = 6; c.scale.set(0.8, 1.8, 0.8);
      g.add(c);
      g.position.y = L.y + 80;
    }

    const beam = new THREE.Mesh(this.geo.beam, this.beam[L.type]);
    beam.position.y = 120;
    g.add(beam);
    return g;
  }

  dropEntity(ent) {
    for (const o of ent.orbs) if (o.mesh) this.scene.remove(o.mesh);
    if (ent.landmark && ent.landmark.mesh) this.scene.remove(ent.landmark.mesh);
    this.entities.delete(ent.cx + ',' + ent.cz);
  }

  update(p, dt, emit) {
    this.time += dt;
    const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);

    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = (pcx + dx) + ',' + (pcz + dz);
        if (!this.entities.has(k)) this.entities.set(k, this.genChunk(pcx + dx, pcz + dz));
      }

    for (const ent of this.entities.values()) {
      if (Math.max(Math.abs(ent.cx - pcx), Math.abs(ent.cz - pcz)) > 2) this.dropEntity(ent);
    }

    for (const ent of this.entities.values()) {
      for (const o of ent.orbs) {
        if (o.taken || !o.mesh) continue;
        o.mesh.rotation.y += dt * 2;
        o.mesh.position.y = o.y + Math.sin(this.time * 2 + o.phase) * 0.9;
        const dx = p.x - o.x, dy = p.y - o.mesh.position.y, dz = p.z - o.z;
        if (dx * dx + dy * dy + dz * dz < 100) {
          o.taken = true;
          this.scene.remove(o.mesh);
          Save.data.orbs[o.id] = 1;
          Save.data.totalOrbs++;
          Save.flush();
          emit({ type: 'orb', total: Save.data.totalOrbs });
        }
      }
      const L = ent.landmark;
      if (!L) continue;
      if (L.cd > 0) L.cd -= dt;
      const dx = p.x - L.x, dz = p.z - L.z;
      const dy = (p.y - L.cy) * 0.5;
      if (!L.found && dx * dx + dz * dz + dy * dy < 4900) {
        L.found = true;
        Save.data.found[L.id] = { n: L.name, t: L.type, ts: Date.now() };
        Save.flush();
        emit({ type: 'discover', name: L.name, icon: TYPE_ICON[L.type] });
      }
      if (L.type === 'ring' && L.cd <= 0) {
        const dyF = p.y - L.cy;
        if (dx * dx + dz * dz + dyF * dyF < 289) {
          L.cd = 8;
          emit({ type: 'ring' });
        }
      }
    }
  }
}
