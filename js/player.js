// player.js — glider flight model + mesh
import * as THREE from 'three';
import { terrainHeight, WATER_Y } from './terrain.js';

export const SKINS = [
  { id: 'delta',  name: 'Delta',  color: 0x37b6a0, req: 0,   speed: 1.0,  boost: 1.0 },
  { id: 'falcon', name: 'Falcon', color: 0xe08a2e, req: 25,  speed: 1.15, boost: 1.05 },
  { id: 'comet',  name: 'Comet',  color: 0xc658d6, req: 60,  speed: 1.3,  boost: 1.15 },
  { id: 'aurora', name: 'Aurora', color: 0x59e06b, req: 100, speed: 1.45, boost: 1.3 }
];

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.fw = new THREE.Vector3(0, 0, 1);
    this.boostT = 0;
    this.boosting = false;

    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';

    const mat = new THREE.MeshStandardMaterial({ color: SKINS[0].color, flatShading: true, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2430, flatShading: true, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 3.4), mat);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), dark);
    canopy.scale.set(1, 0.7, 1.6); canopy.position.set(0, 0.32, 0.5);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 1.4), mat);
    wingL.position.set(-1.25, 0, -0.35); wingL.rotation.y = 0.42;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 1.4), mat);
    wingR.position.set(1.25, 0, -0.35); wingR.rotation.y = -0.42;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 1.0), mat);
    fin.position.set(0, 0.5, -1.35);

    this.paint = mat;
    this.group.add(body, canopy, wingL, wingR, fin);
    scene.add(this.group);

    this.skin = SKINS[0];
    this.base = 42;
    this.reset();
  }

  applySkin(s) {
    this.skin = s;
    this.paint.color.setHex(s.color);
  }

  reset() {
    // find dry land near origin for spawn
    let x = 0, z = 0, h = terrainHeight(0, 0);
    for (let i = 1; i < 60 && h < WATER_Y + 6; i++) {
      x = i * 60; h = terrainHeight(x, z);
    }
    this.pos = new THREE.Vector3(x, Math.max(h, WATER_Y) + 55, z);
    this.yaw = Math.PI * 0.25;
    this.pitch = 0;
    this.roll = 0;
    this.speed = this.base;
    this.dist = 0;
    this.boostT = 0;
    this.syncMesh();
  }

  update(dt, input, boostHeld) {
    const s = this.skin;
    this.boosting = boostHeld || this.boostT > 0;
    if (this.boostT > 0) this.boostT -= dt;

    this.roll += (-input.x * 0.85 - this.roll) * (1 - Math.exp(-5 * dt));
    this.yaw += input.x * 1.5 * (1 - 0.4 * Math.abs(this.pitch)) * dt;
    this.pitch += (input.y * 0.6 - this.pitch) * (1 - Math.exp(-2.5 * dt));
    this.pitch = Math.max(-0.95, Math.min(0.95, this.pitch));

    const target = this.base * s.speed * (this.boosting ? s.boost * 1.8 : 1) * (1 - this.pitch * 0.8);
    this.speed += (target - this.speed) * (1 - Math.exp(-1.3 * dt));
    this.speed = Math.max(18, this.speed);

    const cp = Math.cos(this.pitch);
    this.fw.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    const px = this.pos.x, pz = this.pos.z;
    this.pos.addScaledVector(this.fw, this.speed * dt);
    this.dist += Math.hypot(this.pos.x - px, this.pos.z - pz);

    this.syncMesh();
  }

  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.rotation.x = -this.pitch;
    this.group.rotation.z = this.roll;
  }

  get altitude() { return this.pos.y; }
}
