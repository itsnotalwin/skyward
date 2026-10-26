// main.js — Skyward: scene, game loop, day/night, state machine
import * as THREE from 'three';
import { Terrain, Water, Clouds, terrainHeight, WATER_Y } from './terrain.js';
import { Player, SKINS } from './player.js';
import { Controls } from './controls.js';
import { Discoveries } from './discoveries.js';
import { UI } from './ui.js';
import { AudioSys } from './audio.js';
import { Save } from './save.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.5, 2600);
scene.fog = new THREE.Fog(0xcfe8f7, 350, 1000);

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3c5a3a, 0.9);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
scene.add(hemi, sun);

// gradient sky dome (fog-free so it never washes out)
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x5e97d8) }, hor: { value: new THREE.Color(0xbcd8f2) } },
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 hor;' +
    'void main(){ float h=normalize(vP).y; float m=smoothstep(-0.05,0.25,h); gl_FragColor=vec4(mix(hor,top,m),1.0); }'
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 16, 12), skyMat);
scene.add(sky);

// stars (visible at night)
const starGeo = new THREE.BufferGeometry();
{
  const pts = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.5, r = 1950;
    pts[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pts[i * 3 + 1] = Math.sin(e) * r + 50;
    pts[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// sun glow
const glowTex = (() => {
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
})();
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0xffe8b0, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false
}));
sunSprite.scale.set(420, 420, 1);
scene.add(sunSprite);

// glider vapor trail
const TRAIL_N = 70;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL_N * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.45, fog: false
}));
trail.frustumCulled = false;
scene.add(trail);
let trailInit = false;
function updateTrail() {
  const p = player.pos;
  if (!trailInit) {
    for (let i = 0; i < TRAIL_N; i++) { trailPos[i * 3] = p.x; trailPos[i * 3 + 1] = p.y; trailPos[i * 3 + 2] = p.z; }
    trailInit = true;
  }
  trailPos.copyWithin(3, 0, (TRAIL_N - 1) * 3);
  trailPos[0] = p.x; trailPos[1] = p.y; trailPos[2] = p.z;
  trailGeo.attributes.position.needsUpdate = true;
}

// ---------- world ----------
const terrain = new Terrain(scene);
const water = new Water(scene);
const clouds = new Clouds(scene);
const player = new Player(scene);
player.applySkin(SKINS.find(s => s.id === Save.data.skin) || SKINS[0]);
const controls = new Controls();
controls.invertY = Save.data.invertY;
const discoveries = new Discoveries(scene);
const ui = new UI();
const audio = new AudioSys();

const camPos = camera.position.clone();
let state = 'loading';
let menuAngle = 0;

// ---------- day / night ----------
const SKY_STOPS = [
  [0.00, 0x0e1738, 0x223055, 0.18, 0.30],
  [0.23, 0x0e1738, 0x223055, 0.18, 0.30],
  [0.30, 0x3d5a8e, 0xffa468, 0.90, 0.55],
  [0.40, 0x3d7dd6, 0xcfe8f7, 2.40, 1.00],
  [0.60, 0x3d7dd6, 0xcfe8f7, 2.40, 1.00],
  [0.70, 0x4a4a80, 0xff8a55, 0.95, 0.55],
  [0.77, 0x101a40, 0x243158, 0.22, 0.32],
  [1.00, 0x0e1738, 0x223055, 0.18, 0.30]
];
const dayTime = { t: 0.45 };
const cA = new THREE.Color(), cB = new THREE.Color();

function updateDayNight(dt) {
  dayTime.t = (dayTime.t + dt / 480) % 1;
  const t = dayTime.t;
  let i = 0;
  while (i < SKY_STOPS.length - 2 && SKY_STOPS[i + 1][0] < t) i++;
  const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
  const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  skyMat.uniforms.top.value.copy(cA.setHex(a[1]).lerp(cB.setHex(b[1]), f));
  skyMat.uniforms.hor.value.copy(cA.setHex(a[2]).lerp(cB.setHex(b[2]), f));
  scene.fog.color.copy(skyMat.uniforms.hor.value);
  sun.intensity = a[3] + (b[3] - a[3]) * f;
  hemi.intensity = a[4] + (b[4] - a[4]) * f;
  const ang = (t - 0.25) * Math.PI * 2;
  sun.position.set(Math.cos(ang) * 1000, Math.sin(ang) * 1000, 300);
  sunSprite.position.copy(sun.position).normalize().multiplyScalar(1700).add(camera.position);
  const elev = Math.sin(ang);
  starMat.opacity = Math.min(0.9, Math.max(0, -elev * 3 + 0.15));
}

// ---------- game events ----------
function checkUnlocks() {
  for (const s of SKINS) {
    if (Save.data.totalOrbs >= s.req && !Save.data.unlocked.includes(s.id)) {
      Save.data.unlocked.push(s.id);
      ui.toast(`🛩️ Glider unlocked: ${s.name}!`, { big: true, dur: 3800 });
    }
  }
  Save.flush();
}

function onGameEvent(ev) {
  if (ev.type === 'orb') {
    ui.toast('✦ +1');
    audio.chime();
    navigator.vibrate && navigator.vibrate(15);
    checkUnlocks();
  } else if (ev.type === 'discover') {
    ui.toast(`${ev.icon} Discovered: ${ev.name}`, { big: true, dur: 3600 });
    audio.fanfare();
    navigator.vibrate && navigator.vibrate([30, 40, 30]);
  } else if (ev.type === 'ring') {
    ui.toast('⚡ Ring boost!');
    audio.ring();
    player.boostT = 3;
  }
}

// ---------- ui wiring ----------
ui.onStart = () => {
  ui.hideMenu();
  state = 'playing';
  controls.enabled = true;
  audio.init();
  audio.resume();
  camPos.copy(camera.position);
  if (!Save.data.seenTut) {
    ui.toast('👈 Drag left side to steer', { dur: 3000 });
    setTimeout(() => ui.toast('👉 Hold right side to boost', { dur: 3000 }), 3200);
    setTimeout(() => ui.toast('Follow the light beams ✨', { dur: 3200 }), 6400);
    Save.data.seenTut = true;
    Save.flush();
  }
};
ui.onPause = () => {
  if (state !== 'playing') return;
  state = 'paused';
  controls.enabled = false;
  audio.setWind(0, 1);
  ui.showPause();
};
ui.onResume = () => { state = 'playing'; controls.enabled = true; ui.hidePause(); };
ui.onRespawn = () => { player.reset(); ui.hidePause(); state = 'playing'; controls.enabled = true; };
ui.onQuit = () => {
  state = 'menu';
  controls.enabled = false;
  audio.setWind(0, 1);
  ui.hidePause();
  ui.showMenu();
};
ui.onSkin = id => {
  const s = SKINS.find(s => s.id === id) || SKINS[0];
  player.applySkin(s);
  trail.material.color.setHex(s.color);
};
ui.onPhoto = () => {
  ui.el.hud.classList.add('hidden');
  renderer.render(scene, camera);
  canvas.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'skyward.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    ui.el.hud.classList.remove('hidden');
  }, 'image/png');
  ui.toast('📸 Photo saved');
};
ui.onSound = v => { audio.setEnabled(v); if (v) { audio.init(); audio.resume(); } };
ui.onInvert = v => { controls.invertY = v; };
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
    if (state === 'playing') ui.onPause();
    else if (state === 'paused') ui.onResume();
  }
});

// persist on leave
function flushStats() {
  Save.data.bestDist = Math.max(Save.data.bestDist, player.dist);
  Save.data.bestAlt = Math.max(Save.data.bestAlt, player.pos.y);
  Save.flush();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushStats();
    if (state === 'playing') ui.onPause();
  }
});
window.addEventListener('pagehide', flushStats);

// ---------- resize ----------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- loop ----------
const clock = new THREE.Clock();
const LOAD_TARGET = 25; // 5x5 chunks before the menu opens

function followCamera(dt) {
  const back = player.fw.clone().multiplyScalar(-13);
  back.y += 4.5;
  camPos.lerp(player.pos.clone().add(back), 1 - Math.exp(-5 * dt));
  const floor = Math.max(terrainHeight(camPos.x, camPos.z), WATER_Y) + 2;
  if (camPos.y < floor) camPos.y = floor;
  camera.position.copy(camPos);
  const look = player.pos.clone().addScaledVector(player.fw, 14);
  look.y += 1.5;
  camera.lookAt(look);
  camera.rotateZ(player.roll * 0.3);
  const targetFov = player.boosting ? 78 : 66;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

function menuCamera(dt) {
  menuAngle += dt * 0.05;
  const cx = player.pos.x + Math.cos(menuAngle) * 110;
  const cz = player.pos.z + Math.sin(menuAngle) * 110;
  const cy = Math.max(terrainHeight(cx, cz), WATER_Y) + 60;
  camera.position.set(cx, cy, cz);
  camera.lookAt(player.pos.x, player.pos.y - 12, player.pos.z);
  if (camera.fov !== 66) { camera.fov = 66; camera.updateProjectionMatrix(); }
  camPos.copy(camera.position);
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state === 'loading') {
    terrain.update(player.pos.x, player.pos.z, 4, 2);
    const pct = Math.min(99, Math.round(terrain.count / LOAD_TARGET * 100));
    ui.setPlayEnabled(false, `Shaping world… ${pct}%`);
    if (terrain.count >= LOAD_TARGET) {
      state = 'menu';
      ui.setPlayEnabled(true, 'Take Flight');
      ui.showMenu();
    }
  } else {
    terrain.update(player.pos.x, player.pos.z, 1);
  }
  clouds.update(player.pos.x, player.pos.z);

  if (state === 'playing') {
    controls.update();
    player.update(dt, controls.input, controls.boostActive);

    const floor = Math.max(terrainHeight(player.pos.x, player.pos.z), WATER_Y);
    if (player.pos.y < floor + 1.5) {
      player.pos.y = floor + 1.5;
      if (player.speed > 26) {
        ui.flash();
        audio.crash();
        navigator.vibrate && navigator.vibrate(60);
      }
      player.pitch = Math.max(player.pitch, 0.25);
      player.speed *= 0.55;
    }
    if (player.pos.y > 620) { player.pos.y = 620; player.pitch = Math.min(player.pitch, -0.05); }

    discoveries.update(player.pos, dt, onGameEvent);
    followCamera(dt);
    updateTrail();
    audio.setWind(player.speed / 100 * (player.boosting ? 1.3 : 1), dt);
    ui.updateHud(player.speed, player.pos.y, player.dist / 1000, Save.data.totalOrbs);
    ui.drawMinimap(player.pos.x, player.pos.z, player.yaw, discoveries);
    Save.data.bestDist = Math.max(Save.data.bestDist, player.dist);
    Save.data.bestAlt = Math.max(Save.data.bestAlt, player.pos.y);
  } else if (state === 'menu') {
    menuCamera(dt);
  }

  updateDayNight(dt);
  sky.position.copy(camera.position);
  water.update(t, player.pos.x, player.pos.z);
  renderer.render(scene, camera);
}

ui.setPlayEnabled(false, 'Shaping world… 0%');
tick();

// ---------- service worker ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
}
