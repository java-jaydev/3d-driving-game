import * as THREE from 'three';
import * as CANNON from 'cannon-es';
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
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 150, 400);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.5, 500
);

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

  renderer.render(scene, camera);
}

animate();

// 리사이즈
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
