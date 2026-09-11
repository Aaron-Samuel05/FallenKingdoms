import * as THREE from 'three/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import { Sky } from 'three/addons/objects/Sky.js';
import { pass, bloom, vignette } from 'three/tsl';
import './style.css';

const $ = (s) => document.querySelector(s);
const app = $('#game');
const title = $('#title');
const startButton = $('#startButton');
const hud = $('#hud');
const toast = $('#toast');
const objective = $('#questObjective');
const hpFill = $('#healthFill');
const timeText = $('#timeText');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8195a0);
scene.fog = new THREE.FogExp2(0x8195a0, 0.0022);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 3200);

const renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
await renderer.init();
app.appendChild(renderer.domElement);

const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const bloomPass = bloom(scenePass, 0.28, 0.55, 0.82);
pipeline.outputNode = vignette(bloomPass, 0.24, 0.72);

const world = new THREE.Group();
scene.add(world);
const clock = new THREE.Clock();
const UP = new THREE.Vector3(0, 1, 0);
const keys = Object.create(null);
const enemies = [];
const particles = [];
const fireflies = [];
let started = false;
let locked = false;
let yaw = Math.PI * 0.82;
let pitch = -0.16;
let health = 100;
let stamina = 100;
let timeOfDay = 7.35;
let attackCooldown = 0;
let attackTimer = 0;
let combo = 0;
let dodgeTimer = 0;
let dodgeCooldown = 0;
let blocking = false;
let quest = 0;
let bossSpawned = false;
let bossDefeated = false;

const hemi = new THREE.HemisphereLight(0xd6e7ef, 0x172016, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd8a3, 4.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -240;
sun.shadow.camera.right = 240;
sun.shadow.camera.top = 240;
sun.shadow.camera.bottom = -240;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 800;
scene.add(sun);
const moon = new THREE.DirectionalLight(0x6f86bd, 0);
moon.position.set(-180, 160, -100);
scene.add(moon);

const sky = new Sky();
sky.scale.setScalar(5000);
scene.add(sky);
sky.material.uniforms.turbidity.value = 5.5;
sky.material.uniforms.rayleigh.value = 1.7;
sky.material.uniforms.mieCoefficient.value = 0.0035;
sky.material.uniforms.mieDirectionalG.value = 0.82;

function noise(x, z) {
  return Math.sin(x * 0.010 + z * 0.015) * 0.48 +
    Math.sin(x * 0.024 - z * 0.018 + 1.4) * 0.24 +
    Math.cos(x * 0.052 + z * 0.043) * 0.12 +
    Math.sin((x - z) * 0.11) * 0.045;
}
function terrainHeight(x, z) {
  const broad = Math.sin(x * 0.0045) * 7 + Math.cos(z * 0.0052) * 6;
  const ridge = Math.pow(Math.max(0, Math.sin(x * 0.006) + Math.cos(z * 0.007) + 1.1), 2) * 3.2;
  const valley = -Math.exp(-(x * x + z * z) / 15000) * 9;
  const lakeBasin = -Math.exp(-((x - 80) ** 2 + (z + 175) ** 2) / 26000) * 8;
  return noise(x, z) * 8 + broad + ridge + valley + lakeBasin - 1;
}

function terrainColor(h, slope) {
  if (h > 20) return [0.25, 0.27, 0.25];
  if (h > 12) return [0.32, 0.34, 0.29];
  if (slope > 0.55) return [0.25, 0.28, 0.25];
  if (h < -4) return [0.17, 0.25, 0.18];
  const t = THREE.MathUtils.clamp((h + 5) / 20, 0, 1);
  return [0.17 + t * 0.10, 0.27 + t * 0.09, 0.18 + t * 0.06];
}

const terrainGeo = new THREE.PlaneGeometry(1400, 1400, 260, 260);
terrainGeo.rotateX(-Math.PI / 2);
const positions = terrainGeo.attributes.position;
const colors = new Float32Array(positions.count * 3);
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const z = positions.getZ(i);
  const h = terrainHeight(x, z);
  positions.setY(i, h);
  const e = 0.7;
  const slope = Math.min(1, Math.abs(terrainHeight(x + e, z) - terrainHeight(x - e, z)) + Math.abs(terrainHeight(x, z + e) - terrainHeight(x, z - e)));
  const c = terrainColor(h, slope);
  colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
}
terrainGeo.computeVertexNormals();
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const terrainMat = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0.02, vertexColors: true });
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
world.add(terrain);

// Distant mountain wall: gives the valley a sense of scale instead of a flat horizon.
const mountains = new THREE.Group();
for (let i = 0; i < 28; i++) {
  const angle = (i / 28) * Math.PI * 2;
  const radius = 650 + Math.random() * 180;
  const h = 90 + Math.random() * 150;
  const w = 80 + Math.random() * 130;
  const g = new THREE.ConeGeometry(w, h, 7, 2);
  const m = new THREE.MeshStandardNodeMaterial({ color: 0x28363a, roughness: 1 });
  const mountain = new THREE.Mesh(g, m);
  mountain.position.set(Math.cos(angle) * radius, h * 0.48 - 8, Math.sin(angle) * radius);
  mountain.scale.y = 0.75 + Math.random() * 0.6;
  mountain.rotation.y = Math.random() * 6.28;
  mountains.add(mountain);
}
world.add(mountains);

const trunkMat = new THREE.MeshStandardNodeMaterial({ color: 0x34241a, roughness: 1 });
const leafMat = new THREE.MeshStandardNodeMaterial({ color: 0x203a28, roughness: 0.92 });
const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x555650, roughness: 0.96 });
const stoneMat = new THREE.MeshStandardNodeMaterial({ color: 0x77776c, roughness: 0.9 });
const darkStoneMat = new THREE.MeshStandardNodeMaterial({ color: 0x353b39, roughness: 0.94 });
const goldMat = new THREE.MeshStandardNodeMaterial({ color: 0xb18a43, roughness: 0.22, metalness: 0.82 });
const emberMat = new THREE.MeshBasicNodeMaterial({ color: 0xff8a32 });

// Dense forest with instancing, plus a second sparse layer for depth.
const forest = new THREE.Group();
world.add(forest);
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 4.8, 8);
const crownGeo = new THREE.IcosahedronGeometry(1.7, 1);
const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, 1150);
const crownMesh = new THREE.InstancedMesh(crownGeo, leafMat, 1150);
const dummy = new THREE.Object3D();
let treeCount = 0;
for (let i = 0; i < 1450; i++) {
  const x = (Math.random() - 0.5) * 1280;
  const z = (Math.random() - 0.5) * 1280;
  if (Math.hypot(x, z) < 48) continue;
  const y = terrainHeight(x, z);
  if (y < 1 || y > 25) continue;
  const s = 0.62 + Math.random() * 1.45;
  dummy.position.set(x, y + 2.25 * s, z);
  dummy.scale.set(s, s * (0.8 + Math.random() * 0.45), s);
  dummy.rotation.y = Math.random() * Math.PI * 2;
  dummy.updateMatrix();
  trunkMesh.setMatrixAt(treeCount, dummy.matrix);
  dummy.position.y = y + 4.5 * s;
  dummy.scale.set(s * 1.2, s * 1.35, s * 1.2);
  dummy.updateMatrix();
  crownMesh.setMatrixAt(treeCount, dummy.matrix);
  treeCount++;
  if (treeCount >= 1150) break;
}
trunkMesh.count = treeCount; crownMesh.count = treeCount;
trunkMesh.castShadow = true; crownMesh.castShadow = true;
forest.add(trunkMesh, crownMesh);

for (let i = 0; i < 220; i++) {
  const x = (Math.random() - 0.5) * 1260;
  const z = (Math.random() - 0.5) * 1260;
  const y = terrainHeight(x, z);
  if (y < -2) continue;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + Math.random() * 2.8, 1), rockMat);
  rock.position.set(x, y + 0.7, z);
  rock.scale.y = 0.45 + Math.random() * 0.8;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  world.add(rock);
}

function createRuin(x, z, radius = 18, tower = false) {
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const h = tower ? 8 + Math.random() * 10 : 4 + Math.random() * 5;
    const piece = new THREE.Mesh(new THREE.BoxGeometry(2.5, h, 2.5), i % 4 === 0 ? darkStoneMat : stoneMat);
    piece.position.set(Math.cos(a) * radius, h / 2, Math.sin(a) * radius);
    piece.rotation.y = a + (Math.random() - 0.5) * 0.25;
    piece.castShadow = true;
    group.add(piece);
  }
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, 1.2, 32), darkStoneMat);
  floor.position.y = 0.6;
  floor.receiveShadow = true;
  group.add(floor);
  const altar = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1, 5.5), goldMat);
  altar.position.y = 1.25;
  altar.castShadow = true;
  group.add(altar);
  const flame = new THREE.PointLight(0xff8a36, 7, 26, 2);
  flame.position.y = 4;
  group.add(flame);
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), emberMat);
  fire.position.y = 3.6;
  group.add(fire);
  world.add(group);
  return group;
}
const altar = createRuin(-92, -65, 19, true);
createRuin(160, 125, 23, false);
createRuin(-250, 210, 17, true);

// River and shoreline.
const riverGeo = new THREE.PlaneGeometry(620, 170, 100, 28);
riverGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(riverGeo, new THREE.MeshPhysicalNodeMaterial({ color: 0x1e5869, roughness: 0.06, metalness: 0.22, transmission: 0.1, transparent: true, opacity: 0.82 }));
water.position.set(40, -7.2, -220);
water.receiveShadow = true;
world.add(water);

function addBridge(x, z) {
  const bridge = new THREE.Group();
  bridge.position.set(x, terrainHeight(x, z) + 2.5, z);
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x4a3321, roughness: 0.85 });
  for (let i = -5; i <= 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 2.1), wood);
    plank.position.set(i * 4.2, Math.sin(i * 0.5) * 0.12, 0);
    plank.rotation.z = Math.sin(i * 0.7) * 0.03;
    plank.castShadow = true;
    bridge.add(plank);
  }
  for (const side of [-1, 1]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 46, 6), wood);
    rope.rotation.z = Math.PI / 2;
    rope.position.y = 2.2;
    bridge.add(rope);
    rope.position.z = side * 2.1;
  }
  world.add(bridge);
}
addBridge(20, -220);

// Player: intentionally more human-shaped than the previous capsule.
const player = new THREE.Group();
player.position.set(0, terrainHeight(0, 0) + 1.25, 0);
world.add(player);
const armorMat = new THREE.MeshStandardNodeMaterial({ color: 0x242b31, roughness: 0.55, metalness: 0.25 });
const leatherMat = new THREE.MeshStandardNodeMaterial({ color: 0x513528, roughness: 0.78 });
const skinMat = new THREE.MeshStandardNodeMaterial({ color: 0x8b5e46, roughness: 0.86 });
const cloakMat = new THREE.MeshStandardNodeMaterial({ color: 0x28131a, roughness: 0.9, side: THREE.DoubleSide });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.72, 8, 16), armorMat);
body.position.y = 1.35; body.scale.set(1, 1.25, 0.75); body.castShadow = true; player.add(body);
const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 0.48), armorMat);
chest.position.set(0, 1.55, 0); chest.rotation.x = 0.08; chest.castShadow = true; player.add(chest);
for (const side of [-1, 1]) {
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.72, 6, 10), leatherMat);
  leg.position.set(side * 0.22, 0.62, 0); leg.castShadow = true; player.add(leg);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.65, 6, 10), armorMat);
  arm.position.set(side * 0.58, 1.48, 0); arm.rotation.z = side * 0.16; arm.castShadow = true; player.add(arm);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), armorMat);
  shoulder.position.set(side * 0.55, 1.78, 0); shoulder.castShadow = true; player.add(shoulder);
}
const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), skinMat);
head.position.y = 2.25; head.castShadow = true; player.add(head);
const hood = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloakMat);
hood.position.set(0, 2.3, 0); hood.castShadow = true; player.add(hood);
const cape = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.9, 10, 1, true), cloakMat);
cape.position.set(0, 1.12, -0.25); cape.rotation.x = Math.PI; cape.castShadow = true; player.add(cape);
const swordPivot = new THREE.Group();
swordPivot.position.set(0.68, 1.45, 0); player.add(swordPivot);
const guard = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.11), goldMat); guard.position.y = 0.05; guard.rotation.z = Math.PI / 2; swordPivot.add(guard);
const sword = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.2, 0.18), metalMat); sword.position.y = 1.0; sword.rotation.z = -0.32; sword.castShadow = true; swordPivot.add(sword);

function createEnemy(x, z, elite = false, boss = false) {
  const g = new THREE.Group();
  const scale = boss ? 1.9 : elite ? 1.25 : 1;
  g.position.set(x, terrainHeight(x, z) + 0.8 * scale, z);
  const mat = new THREE.MeshStandardNodeMaterial({ color: boss ? 0x15131a : elite ? 0x622a32 : 0x3e3031, roughness: 0.72, metalness: boss ? 0.35 : 0.05 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.43 * scale, 0.85 * scale, 7, 12), mat);
  torso.position.y = 0.95 * scale; torso.castShadow = true; g.add(torso);
  const ehead = new THREE.Mesh(new THREE.SphereGeometry(0.31 * scale, 16, 12), skinMat);
  ehead.position.y = 1.9 * scale; ehead.castShadow = true; g.add(ehead);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.38 * scale, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
  helm.position.y = 2.05 * scale; g.add(helm);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * scale, 0.65 * scale, 6, 10), mat);
    arm.position.set(side * 0.55 * scale, 1.35 * scale, 0); arm.rotation.z = side * 0.12; arm.castShadow = true; g.add(arm);
  }
  if (boss) {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 8), goldMat);
      horn.position.set(side * 0.3, 2.72, 0); horn.rotation.z = side * 0.4; g.add(horn);
    }
  }
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.35 * scale, 0.075), new THREE.MeshBasicNodeMaterial({ color: boss ? 0xff9b38 : 0xd14b52 }));
  bar.position.y = 2.75 * scale; bar.rotation.y = Math.PI; g.add(bar);
  world.add(g);
  enemies.push({ g, hp: boss ? 30 : elite ? 6 : 3, max: boss ? 30 : elite ? 6 : 3, attack: Math.random(), elite, boss, bar, phase: Math.random() * 6 });
}
for (let i = 0; i < 15; i++) createEnemy(70 + Math.random() * 210, -60 + Math.random() * 220, i === 14);

const particleGroup = new THREE.Group();
world.add(particleGroup);
function burst(position, color = 0xff8b42, count = 14, power = 5) {
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.065, 6, 6), new THREE.MeshBasicNodeMaterial({ color }));
    p.position.copy(position);
    p.userData.v = new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power, (Math.random() - 0.5) * power);
    p.userData.life = 0.35 + Math.random() * 0.65;
    particleGroup.add(p); particles.push(p);
  }
}
for (let i = 0; i < 80; i++) {
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 5), new THREE.MeshBasicNodeMaterial({ color: 0xf4d27b }));
  p.position.set((Math.random() - 0.5) * 900, 2 + Math.random() * 20, (Math.random() - 0.5) * 900);
  p.userData.base = p.position.clone(); p.userData.phase = Math.random() * 6.28; p.userData.speed = 0.4 + Math.random() * 1.2;
  particleGroup.add(p); fireflies.push(p);
}

addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') { e.preventDefault(); dodge(); } if (e.code === 'KeyE') interact(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('click', () => { if (started) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; });
document.addEventListener('mousemove', (e) => { if (!locked) return; yaw -= e.movementX * 0.0021; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0018, -0.68, 0.28); });
addEventListener('mousedown', (e) => { if (!started) return; if (e.button === 0) attack(); if (e.button === 2) blocking = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) blocking = false; });

function message(text) { toast.textContent = text; toast.classList.add('show'); clearTimeout(message.t); message.t = setTimeout(() => toast.classList.remove('show'), 2300); }
function dodge() { if (!started || dodgeCooldown > 0 || stamina < 30) return; stamina -= 30; dodgeTimer = 0.24; dodgeCooldown = 0.72; burst(player.position, 0x9cc8ff, 10, 4); }
function attack() {
  if (attackCooldown > 0 || dodgeTimer > 0) return;
  attackCooldown = 0.3; attackTimer = 0.22; combo = (combo + 1) % 3;
  swordPivot.rotation.z = -1.05 + combo * 0.72;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  let hit = false;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const offset = enemy.g.position.clone().sub(player.position); const distance = offset.length(); offset.y = 0;
    const direction = offset.normalize();
    if (distance < 3.8 + (enemy.boss ? 1.2 : 0) && direction.dot(forward) > 0.02) {
      enemy.hp -= combo === 2 ? 2 : 1;
      enemy.g.position.addScaledVector(direction, enemy.boss ? 0.25 : 0.8);
      burst(enemy.g.position, enemy.boss ? 0xffb33d : 0xff6245, enemy.boss ? 20 : 11, 5);
      hit = true;
      if (enemy.hp <= 0) {
        enemy.g.visible = false;
        message(enemy.boss ? 'THE WARDEN OF ASH FALLS' : enemy.elite ? 'ELITE DEFEATED' : 'ENEMY DEFEATED');
        if (enemy.boss) { bossDefeated = true; quest = 5; objective.textContent = 'Return to the ancient altar'; }
      } else message(combo === 2 ? 'HEAVY STRIKE' : 'HIT');
    }
  }
  if (hit && quest === 2 && enemies.filter(e => e.hp > 0 && !e.boss).length === 0) {
    quest = 3; objective.textContent = 'Travel east to the Warden\'s fortress'; message('The valley falls silent. Something answers from the east.');
  }
}
function interact() {
  const altarPos = new THREE.Vector3(-92, terrainHeight(-92, -65) + 1, -65);
  if (player.position.distanceTo(altarPos) < 27 && quest === 0) { quest = 1; objective.textContent = 'Investigate the ancient altar'; message('A forgotten sigil wakes beneath your hand.'); }
  else if (player.position.distanceTo(altarPos) < 27 && quest === 1) { quest = 2; objective.textContent = 'Defeat the guardians'; for (let i = 0; i < 6; i++) createEnemy(-125 + Math.random() * 60, -105 + Math.random() * 65, i === 5); message('The dead remember the crown.'); }
  else if (bossDefeated && player.position.distanceTo(altarPos) < 27) { quest = 6; objective.textContent = 'The first kingdom has fallen'; message('CHAPTER I COMPLETE'); }
}

const velocity = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
function updatePlayer(dt) {
  const input = new THREE.Vector3((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), 0, (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0));
  if (input.lengthSq() > 0) input.normalize();
  const move = input.clone().applyAxisAngle(UP, yaw);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  if (sprint && input.lengthSq() > 0 && stamina > 0) stamina = Math.max(0, stamina - dt * 17);
  else stamina = Math.min(100, stamina + dt * 25);
  const speed = sprint && stamina > 0 ? 12.8 : 7.4;
  if (dodgeTimer > 0) { dodgeTimer -= dt; velocity.lerp(move.clone().multiplyScalar(25), 1 - Math.pow(0.0001, dt)); }
  else { velocity.x = THREE.MathUtils.damp(velocity.x, move.x * speed, 9, dt); velocity.z = THREE.MathUtils.damp(velocity.z, move.z * speed, 9, dt); }
  player.position.addScaledVector(velocity, dt);
  player.position.x = THREE.MathUtils.clamp(player.position.x, -620, 620);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -620, 620);
  player.position.y = THREE.MathUtils.damp(player.position.y, terrainHeight(player.position.x, player.position.z) + 1.3, 16, dt);
  if (input.lengthSq() > 0.01) player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, Math.atan2(move.x, move.z), 1 - Math.pow(0.0001, dt));
  if (attackTimer > 0) attackTimer -= dt; else swordPivot.rotation.z = THREE.MathUtils.damp(swordPivot.rotation.z, 0, 16, dt);
  attackCooldown = Math.max(0, attackCooldown - dt); dodgeCooldown = Math.max(0, dodgeCooldown - dt);
  const walking = input.lengthSq() > 0.01 && dodgeTimer <= 0;
  const bob = walking ? Math.sin(performance.now() * 0.012 * (sprint ? 1.35 : 1)) * 0.035 : 0;
  body.position.y = 1.35 + bob; chest.position.y = 1.55 + bob; head.position.y = 2.25 + bob;
  cloak.rotation.z = walking ? Math.sin(performance.now() * 0.009) * 0.035 : 0;
  hpFill.style.width = `${health}%`;
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const flat = player.position.clone().sub(e.g.position); flat.y = 0;
    const distance = flat.length();
    if (distance > 34) continue;
    const dir = flat.normalize();
    if (e.boss && distance < 8 && Math.sin(performance.now() * 0.002 + e.phase) > 0.72) {
      e.g.position.addScaledVector(dir, -5 * dt);
    } else if (distance > (e.boss ? 3.4 : 2.5)) {
      e.g.position.addScaledVector(dir, (e.boss ? 3.0 : e.elite ? 2.5 : 2.8) * dt);
    } else {
      e.attack -= dt;
      if (e.attack <= 0) {
        e.attack = e.boss ? 0.8 : e.elite ? 1.0 : 1.35;
        if (!dodgeTimer) { health = Math.max(0, health - (blocking ? (e.boss ? 4 : 2) : (e.boss ? 16 : e.elite ? 10 : 7))); burst(player.position, 0xff3d3d, 6, 3); }
        if (health <= 0) { health = 100; stamina = 100; player.position.set(0, terrainHeight(0, 0) + 1.3, 0); message('The old road remembers you.'); }
      }
    }
    e.g.position.y = THREE.MathUtils.damp(e.g.position.y, terrainHeight(e.g.position.x, e.g.position.z) + 0.8, 18, dt);
    e.g.rotation.y = Math.atan2(dir.x, dir.z);
    e.bar.scale.x = Math.max(0, e.hp / e.max);
  }
  if (quest === 3 && !bossSpawned && player.position.x > 120) { bossSpawned = true; quest = 4; objective.textContent = 'Defeat the Warden of Ash'; createEnemy(185, 155, false, true); message('THE WARDEN OF ASH HAS FOUND YOU'); }
}
function updateSky(dt) {
  timeOfDay = (timeOfDay + dt * 0.028) % 24;
  const angle = timeOfDay / 24 * Math.PI * 2 - Math.PI / 2;
  const daylight = THREE.MathUtils.clamp(Math.sin(angle) * 0.8 + 0.18, 0.035, 1);
  sun.position.set(Math.cos(angle) * 260, Math.sin(angle) * 260, 120);
  sun.intensity = 0.45 + daylight * 4.2;
  moon.position.set(-Math.cos(angle) * 230, Math.max(20, -Math.sin(angle) * 230), -120);
  moon.intensity = (1 - daylight) * 0.85;
  hemi.intensity = 0.42 + daylight * 0.95;
  const skyColor = new THREE.Color().setHSL(0.56, 0.16, 0.34 + daylight * 0.22);
  scene.background.lerp(skyColor, 0.035);
  scene.fog.color.lerp(skyColor, 0.035);
  scene.fog.density = 0.0018 + (1 - daylight) * 0.0024;
  const hour = Math.floor(timeOfDay).toString().padStart(2, '0');
  const minute = Math.floor((timeOfDay % 1) * 60).toString().padStart(2, '0');
  timeText.textContent = `${hour}:${minute}`;
}
function updateCamera(dt) {
  const distance = 8.2;
  const offset = new THREE.Vector3(Math.sin(yaw) * distance, 3.2 + pitch * 3.2, Math.cos(yaw) * distance);
  desiredCamera.copy(player.position).add(offset);
  camera.position.lerp(desiredCamera, 1 - Math.pow(0.0007, dt));
  cameraTarget.copy(player.position).add(new THREE.Vector3(0, 1.45, 0));
  camera.lookAt(cameraTarget);
  camera.fov = THREE.MathUtils.damp(camera.fov, (keys.ShiftLeft || keys.ShiftRight) ? 64 : 58, 5, dt);
  camera.updateProjectionMatrix();
}
function updateParticles(dt, t) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.userData.life -= dt; p.position.addScaledVector(p.userData.v, dt); p.userData.v.y -= 8 * dt;
    if (p.userData.life <= 0) { particleGroup.remove(p); particles.splice(i, 1); }
  }
  for (const p of fireflies) { p.position.y = p.userData.base.y + Math.sin(t * 0.001 * p.userData.speed + p.userData.phase) * 1.2; p.position.x = p.userData.base.x + Math.sin(t * 0.0004 + p.userData.phase) * 2; p.position.z = p.userData.base.z + Math.cos(t * 0.0005 + p.userData.phase) * 2; p.visible = timeOfDay > 18 || timeOfDay < 5.5; }
  water.position.y = -7.2 + Math.sin(t * 0.0007) * 0.08;
}

function startGame() { started = true; title.classList.add('hide'); hud.classList.remove('hidden'); message('The old road leads east. Find the fallen watchtower.'); }
startButton.addEventListener('click', startGame);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now();
  if (started) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateSky(dt);
    updateCamera(dt);
    updateParticles(dt, t);
  }
  pipeline.render();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
