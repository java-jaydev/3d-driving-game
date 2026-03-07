import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTracker, createTree, createBoundaryWalls, createGround } from './mapUtils.js';

const HALF_X = 250; // 500 × 300
const HALF_Z = 150;
const TRACK_WIDTH = 16;
const TRACK_MAT = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
const RED_MAT = new THREE.MeshLambertMaterial({ color: 0xCC0000 });
const KERB_RED = new THREE.MeshBasicMaterial({ color: 0xCC0000 });
const KERB_WHITE = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

export function createCircuitMap(scene, world) {
  const tracker = createTracker(scene, world);
  const bounds = { minX: -HALF_X, maxX: HALF_X, minZ: -HALF_Z, maxZ: HALF_Z };

  // 잔디 바닥
  createGround(tracker, HALF_X * 2 + 100, HALF_Z * 2 + 100, 0x4a7c4f);

  // ── 서킷 레이아웃 (시계방향) ──
  const trackPoints = [
    // 1. 메인 스트레이트 출발 (왼쪽 → 오른쪽)
    { x: -80, z: -80 },
    { x: 0, z: -80 },
    { x: 70, z: -80 },
    // 2. 90도 우코너 (헤어핀)
    { x: 120, z: -80 },
    { x: 150, z: -60 },
    { x: 160, z: -30 },
    // 3. 중간 직선
    { x: 160, z: 0 },
    { x: 155, z: 40 },
    // 4. S자 커브
    { x: 130, z: 60 },
    { x: 100, z: 50 },
    { x: 80, z: 70 },
    { x: 60, z: 90 },
    // 5. 긴 커브
    { x: 20, z: 100 },
    { x: -30, z: 95 },
    { x: -70, z: 80 },
    // 6. 백스트레이트
    { x: -120, z: 60 },
    { x: -160, z: 30 },
    // 7. 시케인 (좌-우-좌)
    { x: -180, z: 0 },
    { x: -170, z: -20 },
    { x: -180, z: -40 },
    { x: -160, z: -60 },
    // 8. 마지막 코너 → 메인 스트레이트 복귀
    { x: -130, z: -75 },
    { x: -80, z: -80 },
  ];

  // CatmullRom 보간
  const curve = new THREE.CatmullRomCurve3(
    trackPoints.map(p => new THREE.Vector3(p.x, 0, p.z)),
    true
  );
  const smoothPoints = curve.getPoints(300);

  // 트랙 도로 생성
  buildTrack(tracker, smoothPoints, TRACK_WIDTH);

  // ── 출발/결승선 ──
  buildStartFinishLine(tracker, { x: -30, z: -80 }, { x: -30, z: -80 }, smoothPoints);

  // ── 연석 (코너에 빨강-흰 줄무늬) ──
  buildKerbs(tracker, smoothPoints, TRACK_WIDTH);

  // ── 관중석 (메인 스트레이트 양쪽) ──
  buildGrandstand(tracker, -60, -110, 120, true);  // 남쪽
  buildGrandstand(tracker, -60, -50, 120, false);   // 북쪽
  buildGrandstand(tracker, 80, 50, 40, false);      // S자 커브 옆

  // ── 타이어 배리어 (코너 바깥쪽) ──
  buildTireBarriers(tracker, smoothPoints, TRACK_WIDTH);

  // ── 피트레인 ──
  buildPitLane(tracker);

  // ── 자갈 런오프 (일부 코너) ──
  buildGravelTraps(tracker);

  // ── 배경 나무 ──
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * HALF_X * 1.8;
    const z = (Math.random() - 0.5) * HALF_Z * 1.8;
    // 트랙 근처 제외
    let tooClose = false;
    for (let t = 0; t < 1; t += 0.03) {
      const p = curve.getPoint(t);
      if (Math.abs(p.x - x) < 25 && Math.abs(p.z - z) < 25) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    createTree(tracker, x, z, 0.7 + Math.random() * 0.5);
  }

  // ── 경계벽 ──
  createBoundaryWalls(tracker, bounds);

  return {
    cleanup: () => tracker.cleanup(),
    spawnPosition: { x: -40, y: 2, z: -80 },
    spawnRotation: -Math.PI / 2,
    bounds,
    renderMinimapBackground(bgCtx, mapPx) {
      // 잔디 배경
      bgCtx.fillStyle = '#3a6c3f';
      bgCtx.fillRect(0, 0, mapPx, mapPx);

      const scaleX = mapPx / (HALF_X * 2);
      const scaleZ = mapPx / (HALF_Z * 2);
      const toMap = (wx, wz) => [
        (wx + HALF_X) * scaleX,
        (wz + HALF_Z) * scaleZ,
      ];

      // 서킷 경로
      bgCtx.strokeStyle = '#666';
      bgCtx.lineWidth = 4;
      bgCtx.lineCap = 'round';
      bgCtx.lineJoin = 'round';
      bgCtx.beginPath();
      for (let i = 0; i < smoothPoints.length; i++) {
        const [mx, mz] = toMap(smoothPoints[i].x, smoothPoints[i].z);
        if (i === 0) bgCtx.moveTo(mx, mz);
        else bgCtx.lineTo(mx, mz);
      }
      bgCtx.closePath();
      bgCtx.stroke();

      // 출발선 (흰색)
      const [sx, sz] = toMap(-30, -80);
      bgCtx.strokeStyle = '#fff';
      bgCtx.lineWidth = 2;
      bgCtx.beginPath();
      bgCtx.moveTo(sx, sz - 6);
      bgCtx.lineTo(sx, sz + 6);
      bgCtx.stroke();

      // 피트레인 (얇은 회색)
      bgCtx.strokeStyle = '#555';
      bgCtx.lineWidth = 1.5;
      bgCtx.beginPath();
      const pitPts = [
        toMap(-80, -100), toMap(-40, -105),
        toMap(30, -105), toMap(70, -100),
      ];
      bgCtx.moveTo(pitPts[0][0], pitPts[0][1]);
      for (let i = 1; i < pitPts.length; i++) {
        bgCtx.lineTo(pitPts[i][0], pitPts[i][1]);
      }
      bgCtx.stroke();
    },
  };
}

// ── 트랙 도로 생성 ──
function buildTrack(tracker, points, width) {
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.1) continue;

    const angle = Math.atan2(dx, dz);
    const cx = (from.x + to.x) / 2;
    const cz = (from.z + to.z) / 2;

    const geo = new THREE.PlaneGeometry(width, length + 0.5);
    const mesh = new THREE.Mesh(geo, TRACK_MAT);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle;
    mesh.position.set(cx, 0.01, cz);
    mesh.receiveShadow = true;
    tracker.addMesh(mesh);

    // 물리
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.1, length / 2 + 0.25)));
    body.position.set(cx, -0.1, cz);
    body.quaternion.setFromEuler(0, angle, 0);
    tracker.addBody(body);
  }

  // 가장자리 백색 라인
  addTrackEdgeLines(tracker, points, width);
}

// ── 트랙 가장자리 라인 ──
function addTrackEdgeLines(tracker, points, width) {
  for (let i = 0; i < points.length - 1; i += 3) {
    const p = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) continue;

    const angle = Math.atan2(dx, dz);
    const perpX = -dz / len;
    const perpZ = dx / len;

    for (const side of [-1, 1]) {
      const lineGeo = new THREE.PlaneGeometry(0.3, len + 0.2);
      const line = new THREE.Mesh(lineGeo, WHITE_MAT);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = angle;
      const ox = p.x + perpX * (width / 2 - 0.3) * side;
      const oz = p.z + perpZ * (width / 2 - 0.3) * side;
      line.position.set(ox, 0.02, oz);
      tracker.addMesh(line);
    }
  }
}

// ── 출발/결승선 ──
function buildStartFinishLine(tracker, pos) {
  const x = pos.x;
  const z = pos.z;

  // 체크무늬 (흰-검 교차)
  const checkSize = 1.5;
  const rows = 2;
  const cols = Math.ceil(TRACK_WIDTH / checkSize);
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mat = (r + c) % 2 === 0 ? WHITE_MAT : blackMat;
      const geo = new THREE.PlaneGeometry(checkSize, checkSize);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        x + (r - 0.5) * checkSize,
        0.025,
        z - TRACK_WIDTH / 2 + c * checkSize + checkSize / 2
      );
      tracker.addMesh(mesh);
    }
  }

  // 게이트 구조물
  const gateMat = new THREE.MeshLambertMaterial({ color: 0xDDDDDD });
  const poleH = 8;
  const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, poleH, 8);

  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, gateMat);
    pole.position.set(x, poleH / 2, z + side * (TRACK_WIDTH / 2 + 1));
    pole.castShadow = true;
    tracker.addMesh(pole);
  }

  // 상단 빔
  const beamGeo = new THREE.BoxGeometry(1.5, 1, TRACK_WIDTH + 3);
  const beam = new THREE.Mesh(beamGeo, gateMat);
  beam.position.set(x, poleH - 0.5, z);
  beam.castShadow = true;
  tracker.addMesh(beam);
}

// ── 연석 (빨강-흰 줄무늬) ──
function buildKerbs(tracker, points, width) {
  const kerbWidth = 1.2;
  const kerbH = 0.05;

  // 곡률이 높은 구간 (코너)에만 연석 배치
  for (let i = 2; i < points.length - 2; i += 2) {
    const prev = points[i - 2];
    const curr = points[i];
    const next = points[i + 2];

    // 곡률 계산
    const v1x = curr.x - prev.x;
    const v1z = curr.z - prev.z;
    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const cross = v1x * v2z - v1z * v2x;
    const curvature = Math.abs(cross);

    if (curvature < 5) continue; // 직선 구간 스킵

    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) continue;

    const perpX = -dz / len;
    const perpZ = dx / len;
    const angle = Math.atan2(dx, dz);

    // 곡선 안쪽과 바깥쪽 결정
    const kerbSide = cross > 0 ? 1 : -1;

    const kerbMat = (i % 4 < 2) ? KERB_RED : KERB_WHITE;
    const kerbGeo = new THREE.BoxGeometry(kerbWidth, kerbH, 2);
    const kerb = new THREE.Mesh(kerbGeo, kerbMat);
    const ox = curr.x + perpX * (width / 2 + kerbWidth / 2 - 0.5) * kerbSide;
    const oz = curr.z + perpZ * (width / 2 + kerbWidth / 2 - 0.5) * kerbSide;
    kerb.position.set(ox, kerbH / 2, oz);
    kerb.rotation.y = angle;
    tracker.addMesh(kerb);
  }
}

// ── 관중석 ──
function buildGrandstand(tracker, startX, z, length, facingNorth) {
  const standMat = new THREE.MeshLambertMaterial({ color: 0x4488CC });
  const seatMat = new THREE.MeshLambertMaterial({ color: 0xCC4444 });
  const rows = 5;
  const rowDepth = 2;
  const rowH = 1.5;

  for (let r = 0; r < rows; r++) {
    const depth = rowDepth;
    const height = (r + 1) * rowH;
    const zOffset = facingNorth ? z + r * rowDepth : z - r * rowDepth;

    const geo = new THREE.BoxGeometry(length, height, depth);
    const mat = r % 2 === 0 ? standMat : seatMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(startX + length / 2, height / 2, zOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tracker.addMesh(mesh);

    // 물리
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, height / 2, depth / 2)));
    body.position.set(startX + length / 2, height / 2, zOffset);
    tracker.addBody(body);
  }
}

// ── 타이어 배리어 ──
function buildTireBarriers(tracker, points, width) {
  const tireMat = new THREE.MeshLambertMaterial({ color: 0xCC0000 });
  const tireWhiteMat = new THREE.MeshLambertMaterial({ color: 0xEEEEEE });
  const barrierH = 1.0;
  const barrierW = 0.8;

  for (let i = 2; i < points.length - 2; i += 4) {
    const prev = points[i - 2];
    const curr = points[i];
    const next = points[i + 2];

    const v1x = curr.x - prev.x;
    const v1z = curr.z - prev.z;
    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const cross = v1x * v2z - v1z * v2x;
    const curvature = Math.abs(cross);

    if (curvature < 8) continue;

    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) continue;

    const perpX = -dz / len;
    const perpZ = dx / len;
    const angle = Math.atan2(dx, dz);

    // 코너 바깥쪽
    const side = cross > 0 ? 1 : -1;
    const mat = (i % 8 < 4) ? tireMat : tireWhiteMat;
    const geo = new THREE.BoxGeometry(barrierW, barrierH, 2);
    const mesh = new THREE.Mesh(geo, mat);
    const ox = curr.x + perpX * (width / 2 + 3) * side;
    const oz = curr.z + perpZ * (width / 2 + 3) * side;
    mesh.position.set(ox, barrierH / 2, oz);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    tracker.addMesh(mesh);

    // 타이어 배리어 물리
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(barrierW / 2, barrierH / 2, 1)));
    body.position.set(ox, barrierH / 2, oz);
    body.quaternion.setFromEuler(0, angle, 0);
    tracker.addBody(body);
  }
}

// ── 피트레인 ──
function buildPitLane(tracker) {
  const pitMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const pitWidth = 8;

  // 메인 스트레이트 아래쪽에 평행 피트레인
  const pitPoints = [
    new THREE.Vector3(-80, 0, -100),
    new THREE.Vector3(-40, 0, -105),
    new THREE.Vector3(0, 0, -105),
    new THREE.Vector3(30, 0, -105),
    new THREE.Vector3(70, 0, -100),
  ];

  const pitCurve = new THREE.CatmullRomCurve3(pitPoints);
  const pitSmooth = pitCurve.getPoints(40);

  for (let i = 0; i < pitSmooth.length - 1; i++) {
    const from = pitSmooth[i];
    const to = pitSmooth[i + 1];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.1) continue;

    const angle = Math.atan2(dx, dz);
    const cx = (from.x + to.x) / 2;
    const cz = (from.z + to.z) / 2;

    const geo = new THREE.PlaneGeometry(pitWidth, length + 0.5);
    const mesh = new THREE.Mesh(geo, pitMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle;
    mesh.position.set(cx, 0.01, cz);
    mesh.receiveShadow = true;
    tracker.addMesh(mesh);

    // 물리
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(pitWidth / 2, 0.1, length / 2 + 0.25)));
    body.position.set(cx, -0.1, cz);
    body.quaternion.setFromEuler(0, angle, 0);
    tracker.addBody(body);
  }

  // 피트 벽 (낮은 벽)
  const wallH = 0.8;
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x777777 });

  for (let i = 0; i < pitSmooth.length - 1; i += 3) {
    const p = pitSmooth[i];
    const next = pitSmooth[Math.min(i + 1, pitSmooth.length - 1)];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) continue;

    const angle = Math.atan2(dx, dz);
    const perpX = -dz / len;
    const perpZ = dx / len;

    // 아래쪽 벽만
    const wallGeo = new THREE.BoxGeometry(0.3, wallH, len + 0.2);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    const ox = p.x + perpX * (pitWidth / 2 + 0.15) * 1;
    const oz = p.z + perpZ * (pitWidth / 2 + 0.15) * 1;
    wall.position.set(ox, wallH / 2, oz);
    wall.rotation.y = angle;
    tracker.addMesh(wall);

    const wallBody = new CANNON.Body({ mass: 0 });
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.15, wallH / 2, len / 2 + 0.1)));
    wallBody.position.set(ox, wallH / 2, oz);
    wallBody.quaternion.setFromEuler(0, angle, 0);
    tracker.addBody(wallBody);
  }
}

// ── 자갈 런오프 ──
function buildGravelTraps(tracker) {
  const gravelMat = new THREE.MeshLambertMaterial({ color: 0xC4A55A });
  const traps = [
    { x: 155, z: -45, w: 20, d: 30 },  // 헤어핀 바깥
    { x: -185, z: -20, w: 15, d: 25 },  // 시케인 바깥
    { x: 75, z: 85, w: 20, d: 20 },     // S자 커브 바깥
  ];

  for (const trap of traps) {
    const geo = new THREE.PlaneGeometry(trap.w, trap.d);
    const mesh = new THREE.Mesh(geo, gravelMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(trap.x, 0.005, trap.z);
    mesh.receiveShadow = true;
    tracker.addMesh(mesh);
  }
}
