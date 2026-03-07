import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCityMap } from './maps/cityMap.js';
import { createSuburbanMap } from './maps/suburbanMap.js';
import { createCircuitMap } from './maps/circuitMap.js';
import { createVehicle } from './vehicle.js';
import { createControls } from './controls.js';
import { createChaseCamera } from './camera.js';
import { createMinimap } from './minimap.js';

// 로그인
const loginScreen = document.getElementById('login-screen');
const loginBtn = document.getElementById('login-btn');
const loginId = document.getElementById('login-id');
const loginPw = document.getElementById('login-pw');
const loginError = document.getElementById('login-error');

async function hashCredentials(id, pw) {
  const data = new TextEncoder().encode(`${id}:${pw}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleLogin() {
  const hash = await hashCredentials(loginId.value, loginPw.value);
  if (hash === __AUTH_HASH__) {
    loginScreen.style.display = 'none';
    document.getElementById('map-select').style.display = 'flex';
  } else {
    loginError.textContent = '아이디 또는 비밀번호가 틀렸어요!';
  }
}

loginBtn.addEventListener('click', handleLogin);
loginPw.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });

// Three.js 기본 설정
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc8ddf2, 150, 400);

// Sky 셰이더
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 2;
skyUniforms['rayleigh'].value = 1;
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.8;

const sunPosition = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(90 - 45);
const theta = THREE.MathUtils.degToRad(180);
sunPosition.setFromSphericalCoords(1, phi, theta);
skyUniforms['sunPosition'].value.copy(sunPosition);

// PMREMGenerator로 환경맵 생성 (차량 반사용)
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const envRenderTarget = pmremGenerator.fromScene(scene);
scene.environment = envRenderTarget.texture;
scene.background = envRenderTarget.texture;
pmremGenerator.dispose();

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.5, 500
);

// 포스트프로세싱
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(
    Math.floor(window.innerWidth / 2),
    Math.floor(window.innerHeight / 2)
  ),
  0.15,  // strength
  0.3,   // radius
  0.95   // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// 조명
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(50, 80, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 200;
scene.add(dirLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Cannon-es 물리 월드
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.3;
world.defaultContactMaterial.restitution = 0.1;

// 맵 생성 함수 매핑
const MAP_CREATORS = {
  city: createCityMap,
  suburban: createSuburbanMap,
  circuit: createCircuitMap,
};

// 게임 상태
let currentMap = null;
let currentMapId = null;
let vehicleData = null;
let chaseCamera = null;
const controls = createControls();
const clock = new THREE.Clock();
let gameRunning = false;
const minimap = createMinimap();

// UI 요소
const mapSelectUI = document.getElementById('map-select');
const vehicleSelectUI = document.getElementById('vehicle-select');
const hud = document.getElementById('hud');
const controlsHint = document.getElementById('controls-hint');
const speedValue = document.getElementById('speed-value');
const hudVehicleName = document.getElementById('hud-vehicle-name');
const topButtons = document.getElementById('top-buttons');

// 맵 선택
function selectMap(mapId) {
  // 기존 맵 cleanup
  if (currentMap) {
    currentMap.cleanup();
    currentMap = null;
  }

  // 기존 차량 cleanup
  if (vehicleData) {
    scene.remove(vehicleData.model);
    vehicleData.vehicle.removeFromWorld(world);
    vehicleData = null;
  }

  // 맵 생성
  currentMap = MAP_CREATORS[mapId](scene, world);
  currentMapId = mapId;

  // 미니맵 설정
  minimap.setMap(currentMap);

  // UI 전환: 맵 선택 → 차량 선택
  mapSelectUI.style.display = 'none';
  vehicleSelectUI.style.display = 'flex';
}

// 게임 시작
async function startGame(vehicleId) {
  vehicleSelectUI.style.display = 'none';

  // 이전 차량 제거
  if (vehicleData) {
    scene.remove(vehicleData.model);
    vehicleData.vehicle.removeFromWorld(world);
  }

  vehicleData = await createVehicle(scene, world, vehicleId, currentMap.spawnPosition, currentMap.spawnRotation);
  chaseCamera = createChaseCamera(camera);
  hudVehicleName.textContent = vehicleData.params.name;
  hud.style.display = 'block';
  controlsHint.style.display = 'block';
  topButtons.style.display = 'flex';
  minimap.show();
  gameRunning = true;
  clock.getDelta();
}

// 맵 카드 클릭
document.querySelectorAll('.map-card').forEach((card) => {
  card.addEventListener('click', () => selectMap(card.dataset.map));
});

// 차량 카드 클릭
document.querySelectorAll('.vehicle-card').forEach((card) => {
  card.addEventListener('click', () => startGame(card.dataset.vehicle));
});

// 차량 변경 버튼
document.getElementById('btn-change').addEventListener('click', () => {
  gameRunning = false;
  hud.style.display = 'none';
  controlsHint.style.display = 'none';
  topButtons.style.display = 'none';
  minimap.hide();
  vehicleSelectUI.style.display = 'flex';
});

// 맵 변경 버튼
document.getElementById('btn-change-map').addEventListener('click', () => {
  gameRunning = false;
  hud.style.display = 'none';
  controlsHint.style.display = 'none';
  topButtons.style.display = 'none';
  minimap.hide();

  // 차량 cleanup
  if (vehicleData) {
    scene.remove(vehicleData.model);
    vehicleData.vehicle.removeFromWorld(world);
    vehicleData = null;
  }

  // 맵 cleanup
  if (currentMap) {
    currentMap.cleanup();
    currentMap = null;
    currentMapId = null;
  }

  mapSelectUI.style.display = 'flex';
});

// 게임 루프
function animate() {
  requestAnimationFrame(animate);

  if (gameRunning && vehicleData) {
    const delta = clock.getDelta();

    controls.update(vehicleData);
    world.step(1 / 60, delta, 3);
    vehicleData.sync();

    // 맵 update (선택적) — 천장 높이 등 반환
    const mapInfo = currentMap?.update?.(delta, vehicleData.chassisBody);
    chaseCamera.update(vehicleData.chassisBody, mapInfo?.ceilingHeight);

    // HUD 업데이트
    speedValue.textContent = Math.round(vehicleData.getSpeed());
    minimap.update(vehicleData.chassisBody);

    // 섀도우 라이트를 차량 따라가게
    dirLight.position.set(
      vehicleData.chassisBody.position.x + 50,
      80,
      vehicleData.chassisBody.position.z + 50
    );
    dirLight.target.position.set(
      vehicleData.chassisBody.position.x,
      0,
      vehicleData.chassisBody.position.z
    );
    dirLight.target.updateMatrixWorld();
  }

  composer.render();
}

animate();

// 리사이즈
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(
    Math.floor(window.innerWidth / 2),
    Math.floor(window.innerHeight / 2)
  );
});
