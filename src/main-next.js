import * as THREE from 'three/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import { Sky } from 'three/addons/objects/Sky.js';
import './style.css';

const $ = (s) => document.querySelector(s);
const app = $('#game'), title = $('#title'), start = $('#startButton'), hud = $('#hud');
const toast = $('#toast'), objective = $('#questObjective'), hpFill = $('#healthFill'), timeText = $('#timeText');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x667681);
scene.fog = new THREE.FogExp2(0x667681, 0.0031);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);

let renderer;
try {
  renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  app.appendChild(renderer.domElement);
} catch (e) {
  document.body.innerHTML = '<main style="padding:40px;color:#fff;background:#05070a;font:16px system-ui">This build needs a browser with WebGPU or WebGL2 support.</main>';
  throw e;
}

const world = new THREE.Group(); scene.add(world);
const clock = new THREE.Clock();
const up = new THREE.Vector3(0,1,0);
const keys = {};
let started=false, locked=false, yaw=Math.PI, pitch=-0.14;
let health=100, stamina=100, energy=0, timeOfDay=7.1;
let attackCooldown=0, attackTime=0, combo=0, dodgeTime=0, dodgeCooldown=0;
let quest=0, bossSpawned=false, bossDefeated=false;
const enemies=[];
const particles=[];

const hemi = new THREE.HemisphereLight(0xcfe3ed, 0x172018, 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4bd, 4.5); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-180; sun.shadow.camera.right=180; sun.shadow.camera.top=180; sun.shadow.camera.bottom=-180; scene.add(sun);
const moon = new THREE.DirectionalLight(0x6d86c7, 0.0); moon.position.set(100,100,-80); scene.add(moon);
const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
sky.material.uniforms.turbidity.value=7; sky.material.uniforms.rayleigh.value=1.7; sky.material.uniforms.mieCoefficient.value=.003; sky.material.uniforms.mieDirectionalG.value=.8;

function noise(x,z){ return Math.sin(x*.013+z*.017)*.5 + Math.sin(x*.031-z*.021+2.7)*.25 + Math.cos(x*.067+z*.054)*.11 + Math.sin((x+z)*.14)*.035; }
function height(x,z){
  const ridge=Math.max(0,(Math.sin(x*.008)+Math.cos(z*.01)+2)/4);
  const valley=Math.exp(-(x*x+z*z)/9000)*-8;
  return noise(x,z)*8 + ridge*ridge*24 + valley - 5;
}
const terrainGeo=new THREE.PlaneGeometry(1100,1100,220,220); terrainGeo.rotateX(-Math.PI/2);
const tp=terrainGeo.attributes.position; for(let i=0;i<tp.count;i++){ const x=tp.getX(i),z=tp.getZ(i); tp.setY(i,height(x,z)); } terrainGeo.computeVertexNormals();
const terrainMat=new THREE.MeshStandardNodeMaterial({color:0x304536,roughness:.96}); const terrain=new THREE.Mesh(terrainGeo,terrainMat); terrain.receiveShadow=true; world.add(terrain);

const trunkMat=new THREE.MeshStandardNodeMaterial({color:0x2d2118,roughness:1});
const leafMat=new THREE.MeshStandardNodeMaterial({color:0x1d3b29,roughness:.95});
const rockMat=new THREE.MeshStandardNodeMaterial({color:0x4e514e,roughness:.94});
const stoneMat=new THREE.MeshStandardNodeMaterial({color:0x686960,roughness:.98});
const metalMat=new THREE.MeshStandardNodeMaterial({color:0x9a7336,roughness:.28,metalness:.75});
const fireMat=new THREE.MeshBasicNodeMaterial({color:0xff8b2e});

const foliage=new THREE.Group(); world.add(foliage);
const treeTrunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.35,4.5,7),trunkMat,700);
const treeLeaf=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.55,1),leafMat,700);
const dummy=new THREE.Object3D(); let ti=0;
for(let i=0;i<700;i++){
  const x=(Math.random()-.5)*980,z=(Math.random()-.5)*980;
  if(Math.hypot(x,z)<55) continue; const y=height(x,z); if(y<-1||y>27) continue;
  const s=.65+Math.random()*1.5; dummy.position.set(x,y+2.2*s,z); dummy.scale.set(s,s,s); dummy.rotation.y=Math.random()*6.28; dummy.updateMatrix(); treeTrunk.setMatrixAt(ti,dummy.matrix);
  dummy.position.y=y+4.7*s; dummy.scale.set(s*1.25,s*1.4,s*1.25); dummy.updateMatrix(); treeLeaf.setMatrixAt(ti,dummy.matrix); ti++;
}
treeTrunk.count=ti; treeLeaf.count=ti; foliage.add(treeTrunk,treeLeaf); treeTrunk.castShadow=treeLeaf.castShadow=true;

const rocks=new THREE.Group(); world.add(rocks);
for(let i=0;i<180;i++){const x=(Math.random()-.5)*1000,z=(Math.random()-.5)*1000,y=height(x,z); if(y<-2)continue; const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.8+Math.random()*2.2,1),rockMat); r.position.set(x,y+.7,z); r.scale.y=.5+Math.random()*.7; r.rotation.set(Math.random(),Math.random(),Math.random()); r.castShadow=true; rocks.add(r);}

function ruin(x,z,r=16){
  const g=new THREE.Group(); g.position.set(x,height(x,z),z);
  for(let i=0;i<14;i++){const h=4+Math.random()*6,a=i/14*Math.PI*2; const p=new THREE.Mesh(new THREE.BoxGeometry(2.4,h,2.4),stoneMat); p.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r); p.rotation.y=a; p.castShadow=true; g.add(p);}
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(r,r,1,32),stoneMat); floor.position.y=.5; floor.castShadow=true; g.add(floor); world.add(g); return g;
}
ruin(-80,-55,17); ruin(105,115,20);

const riverGeo=new THREE.PlaneGeometry(520,150,100,30); riverGeo.rotateX(-Math.PI/2);
const water=new THREE.Mesh(riverGeo,new THREE.MeshPhysicalNodeMaterial({color:0x2b6070,roughness:.08,metalness:.18,transmission:.06,transparent:true,opacity:.82})); water.position.set(20,-2.7,-170); world.add(water);

const player=new THREE.Group(); player.position.set(0,height(0,0)+1.25,0); world.add(player);
const body=new THREE.Mesh(new THREE.CapsuleGeometry(.5,1.15,8,16),new THREE.MeshStandardNodeMaterial({color:0x20262b,roughness:.68})); body.position.y=.9; body.castShadow=true; player.add(body);
const cloak=new THREE.Mesh(new THREE.ConeGeometry(.72,1.8,8,1,true),new THREE.MeshStandardNodeMaterial({color:0x3b171c,roughness:.8,side:THREE.DoubleSide})); cloak.position.set(0,.8,-.15); cloak.rotation.x=Math.PI; cloak.castShadow=true; player.add(cloak);
const head=new THREE.Mesh(new THREE.SphereGeometry(.35,18,12),new THREE.MeshStandardNodeMaterial({color:0x8d6048,roughness:.86})); head.position.y=1.95; head.castShadow=true; player.add(head);
const swordPivot=new THREE.Group(); swordPivot.position.set(.55,1.15,0); player.add(swordPivot);
const sword=new THREE.Mesh(new THREE.BoxGeometry(.11,2.15,.2),metalMat); sword.position.y=.75; sword.rotation.z=-.4; sword.castShadow=true; swordPivot.add(sword);

function makeEnemy(x,z,elite=false,boss=false){
  const g=new THREE.Group(); g.position.set(x,height(x,z)+1,z); const scale=boss?2.2:elite?1.25:1;
  const mat=new THREE.MeshStandardNodeMaterial({color:boss?0x17141b:elite?0x63272e:0x493034,roughness:.82,metalness:boss?.3:0});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.45*scale,1*scale,7,12),mat); torso.position.y=.9*scale; torso.castShadow=true; g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.33*scale,14,10),new THREE.MeshStandardNodeMaterial({color:0x6b493c,roughness:.9})); head.position.y=1.85*scale; head.castShadow=true; g.add(head);
  if(boss){const horn=new THREE.Mesh(new THREE.ConeGeometry(.14,.8,7),metalMat); horn.position.set(.3,2.65,-.05); horn.rotation.z=-.35; g.add(horn); const horn2=horn.clone(); horn2.position.x=-.3; horn2.rotation.z=.35; g.add(horn2);}
  const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.3*scale,.07),new THREE.MeshBasicNodeMaterial({color:0xd34b52})); bar.position.y=2.55*scale; bar.rotation.y=Math.PI; g.add(bar); world.add(g);
  enemies.push({g,hp:boss?22:elite?5:3,max:boss?22:elite?5:3,attack:Math.random(),elite,boss,bar,state:'idle'});
}
for(let i=0;i<12;i++) makeEnemy(45+Math.random()*125,-30+Math.random()*150,i===11);

const sparks=new THREE.Group(); world.add(sparks);
function burst(pos,color=0xff9b42,count=12){ for(let i=0;i<count;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.05,6,6),new THREE.MeshBasicNodeMaterial({color})); p.position.copy(pos); p.userData.v=new THREE.Vector3((Math.random()-.5)*5,Math.random()*5,(Math.random()-.5)*5); p.userData.life=.4+Math.random()*.6; sparks.add(p); particles.push(p);} }

const keysDown={}; addEventListener('keydown',e=>{keysDown[e.code]=true; if(e.code==='KeyE') interact(); if(e.code==='Space') dodge();}); addEventListener('keyup',e=>keysDown[e.code]=false);
renderer.domElement.addEventListener('click',()=>{if(started)renderer.domElement.requestPointerLock();});
document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===renderer.domElement);
document.addEventListener('mousemove',e=>{if(!locked)return; yaw-=e.movementX*.0022; pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0018,-.7,.3);});
addEventListener('mousedown',e=>{if(started&&e.button===0)attack();});

function msg(t){toast.textContent=t;toast.classList.add('show');clearTimeout(msg.t);msg.t=setTimeout(()=>toast.classList.remove('show'),2400);}
function dodge(){if(dodgeCooldown>0||stamina<28)return; stamina-=28; dodgeTime=.24; dodgeCooldown=.75; burst(player.position,0xb8d9ff,7);}
function attack(){if(attackCooldown>0||dodgeTime>0)return; attackCooldown=.34; attackTime=.2; combo=(combo+1)%3; swordPivot.rotation.z=-1.1+combo*.75; const f=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)); let hit=false;
  for(const e of enemies){if(e.hp<=0)continue;const d=e.g.position.distanceTo(player.position),dir=e.g.position.clone().sub(player.position).setY(0).normalize();if(d<3.7+(e.boss?1.4:0)&&dir.dot(f)>.05){e.hp--; e.g.position.addScaledVector(dir,e.boss?.35:.9); burst(e.g.position,e.boss?0xd6b15c:0xff6b4a,10); hit=true; if(e.hp<=0){e.g.visible=false; energy+=e.boss?100:e.elite?18:7; msg(e.boss?'THE WARDEN FALLS':'ENEMY DEFEATED');} else msg(combo===2?'HEAVY STRIKE':'HIT');}}
  if(hit&&quest===2&&enemies.filter(e=>e.hp>0&&!e.boss).length===0)finishGuardians();
}
function interact(){const altar=new THREE.Vector3(-80,height(-80,-55)+1,-55);const d=player.position.distanceTo(altar); if(d<24&&quest===0){quest=1;objective.textContent='Follow the old road to the watchtower';msg('The sigil remembers your blood.');} else if(d<24&&quest===1){quest=2;objective.textContent='Defeat the guardians';for(let i=0;i<5;i++)makeEnemy(-105+Math.random()*45,-80+Math.random()*45,i===4);msg('The dead rise from the valley.');}}
function finishGuardians(){quest=3;objective.textContent='Find the Warden beyond the eastern ruins';msg('A deeper presence wakes in the east.');}

const vel=new THREE.Vector3(), desired=new THREE.Vector3(), target=new THREE.Vector3();
function updatePlayer(dt){
  const input=new THREE.Vector3((keysDown.KeyD?1:0)-(keysDown.KeyA?1:0),0,(keysDown.KeyS?1:0)-(keysDown.KeyW?1:0)); if(input.lengthSq())input.normalize();
  const move=input.clone().applyAxisAngle(up,yaw), sprint=keysDown.ShiftLeft||keysDown.ShiftRight; const speed=sprint&&stamina>0?12.5:7.2;
  if(sprint&&input.lengthSq())stamina=Math.max(0,stamina-dt*18);else stamina=Math.min(100,stamina+dt*22);
  if(dodgeTime>0){dodgeTime-=dt;vel.lerp(move.clone().multiplyScalar(24),1-Math.pow(.0001,dt));}else{vel.x=THREE.MathUtils.damp(vel.x,move.x*speed,9,dt);vel.z=THREE.MathUtils.damp(vel.z,move.z*speed,9,dt);}
  player.position.addScaledVector(vel,dt); player.position.x=THREE.MathUtils.clamp(player.position.x,-520,520);player.position.z=THREE.MathUtils.clamp(player.position.z,-520,520);player.position.y=THREE.MathUtils.damp(player.position.y,height(player.position.x,player.position.z)+1.25,15,dt);
  if(input.lengthSq()>.01)player.rotation.y=THREE.MathUtils.lerp(player.rotation.y,Math.atan2(move.x,move.z),1-Math.pow(.0001,dt));
  attackCooldown=Math.max(0,attackCooldown-dt);dodgeCooldown=Math.max(0,dodgeCooldown-dt); if(attackTime>0)attackTime-=dt;else swordPivot.rotation.z=THREE.MathUtils.damp(swordPivot.rotation.z,0,15,dt);
}
function updateEnemies(dt){
  for(const e of enemies){if(e.hp<=0)continue;const flat=player.position.clone().sub(e.g.position);flat.y=0;const d=flat.length();if(d>32)continue;const dir=flat.normalize();
    if(d>2.5)e.g.position.addScaledVector(dir,(e.boss?2.8:e.elite?2.3:2.6)*dt); else {e.attack-=dt;if(e.attack<=0){e.attack=e.boss?.8:e.elite?1.05:1.35;if(dodgeTime<=0){health=Math.max(0,health-(e.boss?16:e.elite?10:7));hpFill.style.width=health+'%';burst(player.position,0xff3e3e,5);if(health===0){health=100;player.position.set(0,height(0,0)+1.25,0);msg('The valley takes you. You awaken at the old road.');}}}}
    e.g.position.y=height(e.g.position.x,e.g.position.z)+1; e.g.rotation.y=Math.atan2(dir.x,dir.z); const ratio=Math.max(0,e.hp/e.max);e.bar.scale.x=ratio;
  }
  if(quest===3&&!bossSpawned&&player.position.x>55){bossSpawned=true;makeEnemy(125,115,false,true);objective.textContent='Defeat the Warden of Ash';msg('THE WARDEN OF ASH HAS AWAKENED');}
  if(bossSpawned&&!bossDefeated){const b=enemies.find(e=>e.boss);if(b&&b.hp<=0){bossDefeated=true;quest=4;objective.textContent='Stand at the fallen throne';msg('THE FIRST KINGDOM HAS FALLEN.');}}
}
function updateSky(dt){timeOfDay=(timeOfDay+dt*.028)%24;const a=timeOfDay/24*Math.PI*2-Math.PI/2;const daylight=THREE.MathUtils.clamp(Math.sin(a)*.7+.35,.05,1);sun.position.set(Math.cos(a)*220,Math.sin(a)*220,80);sun.intensity=.45+daylight*4.2;moon.intensity=(1-daylight)*1.2;hemi.intensity=.45+daylight*1.25;scene.fog.density=.0027+(1-daylight)*.0032;sky.material.uniforms.sunPosition.value.copy(sun.position);const h=Math.floor(timeOfDay).toString().padStart(2,'0'),m=Math.floor(timeOfDay%1*60).toString().padStart(2,'0');timeText.textContent=h+':'+m;}
function updateCamera(dt){const off=new THREE.Vector3(Math.sin(yaw)*7.7,3.1+pitch*3,Math.cos(yaw)*7.7);desired.copy(player.position).add(off);camera.position.lerp(desired,1-Math.pow(.0007,dt));target.copy(player.position).add(new THREE.Vector3(0,1.25,0));camera.lookAt(target);}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.userData.life-=dt;if(p.userData.life<=0){sparks.remove(p);particles.splice(i,1);continue;}p.userData.v.y-=12*dt;p.position.addScaledVector(p.userData.v,dt);p.scale.setScalar(Math.max(.1,p.userData.life));}}
function updateWorld(t){water.position.y=-2.7+Math.sin(t*.0006)*.06;const wind=Math.sin(t*.00025)*.012;foliage.rotation.z=wind;}

start.addEventListener('click',()=>{started=true;title.classList.add('hide');hud.classList.remove('hidden');msg('Find the ancient altar in the western ruins.');});
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05),t=performance.now();if(started){updatePlayer(dt);updateEnemies(dt);updateSky(dt);updateCamera(dt);updateParticles(dt);updateWorld(t);}renderer.render(scene,camera);});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
