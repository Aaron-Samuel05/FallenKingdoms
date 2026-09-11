import * as THREE from 'three/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import { Sky } from 'three/addons/objects/Sky.js';
import './style.css';

const app = document.querySelector('#game');
const title = document.querySelector('#title');
const startButton = document.querySelector('#startButton');
const hud = document.querySelector('#hud');
const toast = document.querySelector('#toast');
const questObjective = document.querySelector('#questObjective');
const timeText = document.querySelector('#timeText');
const healthFill = document.querySelector('#healthFill');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x778a91, 0.0042);
scene.background = new THREE.Color(0x778a91);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2400);
camera.position.set(0, 5, 10);

let renderer;
try {
  renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  app.appendChild(renderer.domElement);
} catch (err) {
  document.body.innerHTML = '<div style="padding:40px;color:white;background:#05070a;font-family:system-ui">WebGPU could not be initialized in this browser.</div>';
  throw err;
}

const hemi = new THREE.HemisphereLight(0xbfd7e4, 0x1b211d, 1.65);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b5, 4.2);
sun.position.set(-120, 180, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
scene.add(sun);

const sky = new Sky();
sky.scale.setScalar(4500);
scene.add(sky);
sky.material.uniforms.turbidity.value = 8;
sky.material.uniforms.rayleigh.value = 1.6;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.82;

const world = new THREE.Group();
scene.add(world);

function noise(x, z) {
  const a = Math.sin(x * 0.013 + z * 0.017) * 0.5;
  const b = Math.sin(x * 0.031 - z * 0.021 + 2.7) * 0.25;
  const c = Math.cos(x * 0.067 + z * 0.054) * 0.11;
  const d = Math.sin((x + z) * 0.14) * 0.035;
  return a + b + c + d;
}
function terrainHeight(x, z) {
  const mountains = Math.max(0, (Math.sin(x * 0.009) + Math.cos(z * 0.011) + 2) / 4);
  return noise(x, z) * 9 + mountains * mountains * 18 - 7;
}

const terrainGeo = new THREE.PlaneGeometry(900, 900, 180, 180);
terrainGeo.rotateX(-Math.PI / 2);
const pos = terrainGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  pos.setY(i, terrainHeight(x, z));
}
terrainGeo.computeVertexNormals();
const terrainMat = new THREE.MeshStandardNodeMaterial({ color: 0x35493a, roughness: 0.95, metalness: 0.02 });
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
world.add(terrain);

const waterGeo = new THREE.PlaneGeometry(420, 120, 80, 24);
waterGeo.rotateX(-Math.PI / 2);
const waterMat = new THREE.MeshPhysicalNodeMaterial({ color: 0x315f70, roughness: 0.08, metalness: 0.08, transmission: 0.08, transparent: true, opacity: 0.78 });
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.set(35, -1.8, -110);
world.add(water);

const props = new THREE.Group();
world.add(props);
const trunkMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a281b, roughness: 1 });
const leafMat = new THREE.MeshStandardNodeMaterial({ color: 0x233c2c, roughness: 0.95 });
const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x4c514e, roughness: 0.92 });
const goldMat = new THREE.MeshStandardNodeMaterial({ color: 0x9c7842, roughness: 0.32, metalness: 0.6 });

function addTree(x, z, s = 1) {
  const y = terrainHeight(x, z);
  if (y < -2 || y > 23) return;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .38, 4.2, 7), trunkMat);
  trunk.position.y = 2.1;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55 - i * .22, 1), leafMat);
    crown.position.set((i - 1) * .45, 4.2 + i * 1.0, (i % 2) * .35);
    crown.scale.y = 1.15;
    crown.castShadow = true;
    g.add(crown);
  }
  props.add(g);
}
function addRock(x, z, s = 1) {
  const y = terrainHeight(x, z);
  if (y < -2) return;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 * s, 1), rockMat);
  rock.position.set(x, y + .7 * s, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.scale.y = .65 + Math.random() * .55;
  rock.castShadow = true;
  rock.receiveShadow = true;
  props.add(rock);
}
for (let i = 0; i < 280; i++) {
  const x = (Math.random() - .5) * 820;
  const z = (Math.random() - .5) * 820;
  if (Math.hypot(x, z) < 42) continue;
  addTree(x, z, .65 + Math.random() * 1.25);
}
for (let i = 0; i < 120; i++) {
  const x = (Math.random() - .5) * 760;
  const z = (Math.random() - .5) * 760;
  addRock(x, z, .5 + Math.random() * 1.8);
}

function addRuins() {
  const ruin = new THREE.Group();
  ruin.position.set(-62, terrainHeight(-62, -42), -42);
  const stone = new THREE.MeshStandardNodeMaterial({ color: 0x6b6b61, roughness: .96 });
  for (let i = 0; i < 12; i++) {
    const h = 5 + Math.random() * 5;
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.1, h, 2.1), stone);
    const a = (i / 12) * Math.PI * 2;
    p.position.set(Math.cos(a) * 15, h / 2, Math.sin(a) * 15);
    p.rotation.y = a;
    p.castShadow = true;
    ruin.add(p);
  }
  const altar = new THREE.Mesh(new THREE.BoxGeometry(5, .8, 5), goldMat);
  altar.position.y = .4;
  ruin.add(altar);
  world.add(ruin);
}
addRuins();

const player = new THREE.Group();
player.position.set(0, terrainHeight(0, 0) + 1.25, 0);
world.add(player);
const bodyMat = new THREE.MeshStandardNodeMaterial({ color: 0x252a2f, roughness: .72 });
const skinMat = new THREE.MeshStandardNodeMaterial({ color: 0x8f6046, roughness: .85 });
const coat = new THREE.Mesh(new THREE.CapsuleGeometry(.48, 1.15, 8, 16), bodyMat);
coat.position.y = .9;
coat.castShadow = true;
player.add(coat);
const head = new THREE.Mesh(new THREE.SphereGeometry(.36, 18, 12), skinMat);
head.position.y = 1.95;
head.castShadow = true;
player.add(head);
const sword = new THREE.Mesh(new THREE.BoxGeometry(.09, 1.8, .18), goldMat);
sword.position.set(.7, 1.1, .1);
sword.rotation.z = -.42;
sword.castShadow = true;
player.add(sword);

const enemies = [];
function makeEnemy(x, z, elite = false) {
  const g = new THREE.Group();
  const y = terrainHeight(x, z);
  g.position.set(x, y + 1, z);
  const mat = new THREE.MeshStandardNodeMaterial({ color: elite ? 0x5b2630 : 0x4a3030, roughness: .84 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .95, 7, 12), mat);
  torso.position.y = .85;
  torso.castShadow = true;
  g.add(torso);
  const ehead = new THREE.Mesh(new THREE.SphereGeometry(.32, 14, 10), skinMat);
  ehead.position.y = 1.82;
  g.add(ehead);
  const hp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .08), new THREE.MeshBasicNodeMaterial({ color: 0xb84d4d }));
  hp.position.y = 2.45;
  hp.rotation.y = Math.PI;
  g.add(hp);
  world.add(g);
  enemies.push({ group:g, hp:elite?3:2, max:elite?3:2, attack:0, state:'idle', elite });
}
for (let i = 0; i < 9; i++) makeEnemy(30 + Math.random()*90, -20 + Math.random()*100, i === 8);

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyE') interact(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let pointerLocked = false;
let yaw = Math.PI;
let pitch = -0.18;
let health = 100;
let attackTimer = 0;
let attackCooldown = 0;
let gameStarted = false;
let worldTime = 6.67;
let objectiveState = 0;

renderer.domElement.addEventListener('click', () => { if (gameStarted) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === renderer.domElement; });
document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  yaw -= e.movementX * .0022;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0018, -0.72, .35);
});
addEventListener('mousedown', e => { if (gameStarted && e.button === 0) attack(); });

function attack() {
  if (attackCooldown > 0) return;
  attackCooldown = .42;
  attackTimer = .18;
  sword.rotation.z = -.42 - .9;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = e.group.position.distanceTo(player.position);
    const dir = e.group.position.clone().sub(player.position).setY(0).normalize();
    if (d < 3.4 && dir.dot(forward) > .2) {
      e.hp -= 1;
      e.group.position.addScaledVector(dir, .7);
      showToast(e.hp > 0 ? 'HIT' : 'ENEMY DEFEATED');
    }
  }
}
function interact() {
  const d = player.position.distanceTo(new THREE.Vector3(-62, player.position.y, -42));
  if (d < 18 && objectiveState === 0) {
    objectiveState = 1;
    questObjective.textContent = 'Investigate the ancient altar';
    showToast('A forgotten sigil awakens beneath your hand.');
  } else if (objectiveState === 1 && d < 12) {
    objectiveState = 2;
    questObjective.textContent = 'Survive the guardians';
    showToast('THE FALLEN KINGDOMS ARE NOT EMPTY.');
    for (let i = 0; i < 4; i++) makeEnemy(-35 + Math.random()*30, -25 + Math.random()*30, i === 3);
  }
}
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove('show'), 2200);
}

const clock = new THREE.Clock();
const desiredCamera = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const velocity = new THREE.Vector3();

function updatePlayer(dt) {
  const input = new THREE.Vector3((keys.KeyD?1:0)-(keys.KeyA?1:0), 0, (keys.KeyS?1:0)-(keys.KeyW?1:0));
  if (input.lengthSq() > 0) input.normalize();
  const speed = keys.ShiftLeft || keys.ShiftRight ? 13 : 7.2;
  const move = new THREE.Vector3(input.x, 0, input.z).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
  velocity.x = THREE.MathUtils.damp(velocity.x, move.x * speed, 9, dt);
  velocity.z = THREE.MathUtils.damp(velocity.z, move.z * speed, 9, dt);
  player.position.x += velocity.x * dt;
  player.position.z += velocity.z * dt;
  player.position.x = THREE.MathUtils.clamp(player.position.x, -425, 425);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -425, 425);
  const ground = terrainHeight(player.position.x, player.position.z) + 1.25;
  player.position.y = THREE.MathUtils.damp(player.position.y, ground, 15, dt);
  if (input.lengthSq() > 0.01) player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, Math.atan2(move.x, move.z), 1 - Math.pow(.0001, dt));
  if (attackTimer > 0) attackTimer -= dt; else sword.rotation.z = THREE.MathUtils.damp(sword.rotation.z, -.42, 16, dt);
  attackCooldown = Math.max(0, attackCooldown - dt);
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.hp <= 0) { e.group.visible = false; continue; }
    const flat = player.position.clone().sub(e.group.position); flat.y = 0;
    const d = flat.length();
    if (d < 24) {
      const dir = flat.normalize();
      e.group.position.addScaledVector(dir, (e.elite?2.2:2.7) * dt);
      e.group.position.y = terrainHeight(e.group.position.x, e.group.position.z) + 1;
      e.group.rotation.y = Math.atan2(dir.x, dir.z);
      if (d < 2.1) {
        e.attack -= dt;
        if (e.attack <= 0) {
          e.attack = e.elite ? 1.0 : 1.35;
          health = Math.max(0, health - (e.elite ? 12 : 7));
          healthFill.style.width = health + '%';
          if (health === 0) { health = 100; healthFill.style.width = '100%'; player.position.set(0, terrainHeight(0,0)+1.25,0); showToast('You awaken beside the old road.'); }
        }
      }
    }
  }
}
function updateSky(dt) {
  worldTime = (worldTime + dt * .035) % 24;
  const angle = (worldTime / 24) * Math.PI * 2 - Math.PI/2;
  sun.position.set(Math.cos(angle)*180, Math.sin(angle)*180, 70);
  const daylight = THREE.MathUtils.clamp(Math.sin(angle)*.7+.45, .08, 1);
  sun.intensity = 0.8 + daylight * 3.5;
  hemi.intensity = .55 + daylight * 1.25;
  scene.fog.density = .0034 + (1-daylight)*.002;
  const h = Math.floor(worldTime).toString().padStart(2,'0');
  const m = Math.floor((worldTime%1)*60).toString().padStart(2,'0');
  timeText.textContent = `${h}:${m}`;
}
function updateCamera(dt) {
  const horizontal = 7.5;
  const vertical = 3.0;
  const offset = new THREE.Vector3(Math.sin(yaw)*horizontal, vertical + pitch*3, Math.cos(yaw)*horizontal);
  desiredCamera.copy(player.position).add(offset);
  camera.position.lerp(desiredCamera, 1 - Math.pow(.0008, dt));
  cameraTarget.copy(player.position).add(new THREE.Vector3(0,1.15,0));
  camera.lookAt(cameraTarget);
}
function animateWorld(t) {
  water.position.y = -1.8 + Math.sin(t * .0007) * .07;
  props.children.forEach((o, i) => { if (o.type === 'Group' && i % 7 === 0) o.rotation.z = Math.sin(t*.0003+i)*.012; });
}

function startGame() {
  gameStarted = true;
  title.classList.add('hide');
  hud.classList.remove('hidden');
  showToast('The old road leads east. Find the fallen watchtower.');
}
startButton.addEventListener('click', startGame);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05);
  const t = performance.now();
  if (gameStarted) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateSky(dt);
    updateCamera(dt);
    animateWorld(t);
  }
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
