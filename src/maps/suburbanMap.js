import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  createTracker,
  generateRoundabout,
  createTree,
  createBoundaryWalls,
  createGround,
} from './mapUtils.js';

const HALF = 300; // 600×600 맵
const ROAD_WIDTH = 12;
const ROAD_MAT = new THREE.MeshLambertMaterial({ color: 0x333333 });
const YELLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xFFCC00 });
const WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
const GUARDRAIL_MAT = new THREE.MeshLambertMaterial({ color: 0x888888 });

export function createSuburbanMap(scene, world) {
  const tracker = createTracker(scene, world);
  const bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

  // 잔디 바닥
  createGround(tracker, HALF * 2 + 100, HALF * 2 + 100, 0x4a7c4f);

  // ── 메인 루프 도로 (맵 순환) ──
  const mainLoop = [
    { x: -200, z: -200 },
    { x: -100, z: -250 },
    { x: 50,   z: -230 },
    { x: 180,  z: -200 },
    { x: 240,  z: -120 },
    { x: 250,  z: 0 },
    { x: 220,  z: 120 },
    { x: 150,  z: 200 },
    { x: 50,   z: 240 },
    { x: -80,  z: 220 },
    { x: -180, z: 160 },
    { x: -240, z: 60 },
    { x: -250, z: -60 },
    { x: -230, z: -150 },
    { x: -200, z: -200 }, // 닫기
  ];

  // CatmullRom 보간으로 부드러운 곡선
  const curve = new THREE.CatmullRomCurve3(
    mainLoop.map(p => new THREE.Vector3(p.x, 0, p.z)),
    true // 닫힌 곡선
  );
  const smoothPoints = curve.getPoints(200);

  // 메인 루프 도로 생성
  buildRoadFromPoints(tracker, smoothPoints, ROAD_WIDTH);

  // ── 회전교차로 (중심) ──
  const rbRadius = 25;
  const rbOuterR = rbRadius + ROAD_WIDTH / 2; // 31
  generateRoundabout(tracker, 0, 0, rbRadius, ROAD_WIDTH);

  // 회전교차로 4방향 진입부 채우기 (ring과 직선 도로 사이 갭 메꿈)
  const entryDirs = [
    { x: 0, z: -1 }, // 북
    { x: 0, z: 1 },  // 남
    { x: 1, z: 0 },  // 동
    { x: -1, z: 0 }, // 서
  ];
  for (const dir of entryDirs) {
    // ring 바깥에서부터 좀 더 먼 곳까지 직선 도로 패치
    const patchLen = ROAD_WIDTH;
    const cx = dir.x * (rbOuterR + patchLen / 2 - 2);
    const cz = dir.z * (rbOuterR + patchLen / 2 - 2);
    const isVertical = dir.x === 0;
    const w = isVertical ? ROAD_WIDTH : patchLen + 4;
    const h = isVertical ? patchLen + 4 : ROAD_WIDTH;
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, ROAD_MAT);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.01, cz);
    mesh.receiveShadow = true;
    tracker.addMesh(mesh);

    // 물리
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 0.1, h / 2)));
    body.position.set(cx, -0.1, cz);
    tracker.addBody(body);
  }

  // 회전교차로에 나무 장식
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    createTree(tracker, Math.cos(a) * 10, Math.sin(a) * 10, 1.2);
  }

  // ── 회전교차로 연결 도로 (4방향) ──
  // 진입부 패치 끝점에서 시작
  const connectStart = rbOuterR + ROAD_WIDTH - 2; // ~41
  const connectRoads = [
    // 북쪽: 회전교차로 → 메인 루프 상단
    [{ x: 0, z: -connectStart }, { x: 0, z: -100 }, { x: -30, z: -170 }, { x: -100, z: -230 }],
    // 남쪽: 회전교차로 → 메인 루프 하단
    [{ x: 0, z: connectStart }, { x: 0, z: 100 }, { x: -20, z: 180 }, { x: -80, z: 220 }],
    // 동쪽: 회전교차로 → 메인 루프 우측
    [{ x: connectStart, z: 0 }, { x: 100, z: 0 }, { x: 180, z: -40 }, { x: 240, z: -120 }],
    // 서쪽: 회전교차로 → 메인 루프 좌측
    [{ x: -connectStart, z: 0 }, { x: -120, z: 10 }, { x: -200, z: 40 }, { x: -240, z: 60 }],
  ];

  let eastCurvePoints = null;
  for (let ri = 0; ri < connectRoads.length; ri++) {
    const road = connectRoads[ri];
    const c = new THREE.CatmullRomCurve3(
      road.map(p => new THREE.Vector3(p.x, 0, p.z))
    );
    const pts = c.getPoints(40);
    buildRoadFromPoints(tracker, pts, ROAD_WIDTH);
    if (ri === 2) eastCurvePoints = pts; // 동쪽 도로
  }

  // ── 분기 도로 ──
  const branchRoad = [
    { x: 150, z: 200 },
    { x: 180, z: 160 },
    { x: 200, z: 100 },
    { x: 180, z: 50 },
    { x: 150, z: 0 },
  ];
  const branchCurve = new THREE.CatmullRomCurve3(
    branchRoad.map(p => new THREE.Vector3(p.x, 0, p.z))
  );
  buildRoadFromPoints(tracker, branchCurve.getPoints(40), 10);

  // ── 터널 (동쪽 도로의 실제 곡선 구간 사용) ──
  // 동쪽 도로 포인트 중 x가 80~200 범위인 구간 추출
  const tunnelPoints = eastCurvePoints.filter(p => p.x >= 80 && p.x <= 200);
  const tunnelCeilH = 5; // 터널 천장 높이
  if (tunnelPoints.length >= 2) {
    buildTunnel(tracker, tunnelPoints, ROAD_WIDTH, tunnelCeilH);
  }

  // ── 나무 배치 (도로 양쪽) ──
  for (let i = 0; i < 100; i++) {
    const x = (Math.random() - 0.5) * HALF * 2;
    const z = (Math.random() - 0.5) * HALF * 2;
    // 도로 위에 나무가 생기지 않도록 중심 및 회전교차로 근처 제외
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < 45) continue;

    // 도로 위인지 대략 확인 (곡선의 가장 가까운 점과의 거리)
    const closestT = curve.getUtoTmapping(0, 0);
    const testPoint = new THREE.Vector3(x, 0, z);
    let tooClose = false;
    for (let t = 0; t < 1; t += 0.02) {
      const p = curve.getPoint(t);
      if (p.distanceTo(testPoint) < 15) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const scale = 0.8 + Math.random() * 0.8;
    createTree(tracker, x, z, scale);
  }

  // ── 가드레일 (일부 구간) ──
  addGuardrails(tracker, smoothPoints, ROAD_WIDTH);

  // ── 경계벽 ──
  createBoundaryWalls(tracker, bounds);

  return {
    cleanup: () => tracker.cleanup(),
    spawnPosition: { x: 0, y: 2, z: 50 },
    spawnRotation: Math.PI,
    bounds,
    update(delta, chassisBody) {
      // 터널 안에 있는지 확인 → 천장 높이 반환
      const cx = chassisBody.position.x;
      const cz = chassisBody.position.z;
      for (const p of tunnelPoints) {
        const dx = cx - p.x;
        const dz = cz - p.z;
        if (dx * dx + dz * dz < (ROAD_WIDTH + 2) * (ROAD_WIDTH + 2)) {
          return { ceilingHeight: tunnelCeilH };
        }
      }
      return null;
    },
    renderMinimapBackground(bgCtx, mapPx) {
      // 초록 배경
      bgCtx.fillStyle = '#3a5c3f';
      bgCtx.fillRect(0, 0, mapPx, mapPx);

      const toMap = (wx, wz) => [
        ((wx + HALF) / (HALF * 2)) * mapPx,
        ((wz + HALF) / (HALF * 2)) * mapPx,
      ];

      // 메인 루프 도로
      bgCtx.strokeStyle = '#666';
      bgCtx.lineWidth = 3;
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

      // 연결 도로
      bgCtx.lineWidth = 2;
      for (const road of connectRoads) {
        const c = new THREE.CatmullRomCurve3(
          road.map(p => new THREE.Vector3(p.x, 0, p.z))
        );
        const pts = c.getPoints(20);
        bgCtx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const [mx, mz] = toMap(pts[i].x, pts[i].z);
          if (i === 0) bgCtx.moveTo(mx, mz);
          else bgCtx.lineTo(mx, mz);
        }
        bgCtx.stroke();
      }

      // 회전교차로
      const [rcx, rcz] = toMap(0, 0);
      const rr = (25 / (HALF * 2)) * mapPx;
      bgCtx.beginPath();
      bgCtx.arc(rcx, rcz, rr, 0, Math.PI * 2);
      bgCtx.stroke();

      // 회전교차로 중앙 섬
      bgCtx.fillStyle = '#4a8c5f';
      bgCtx.beginPath();
      bgCtx.arc(rcx, rcz, rr * 0.5, 0, Math.PI * 2);
      bgCtx.fill();

      // 터널 구간 (어두운 색)
      const [tx1, tz1] = toMap(100, 0);
      const [tx2, tz2] = toMap(180, -40);
      bgCtx.strokeStyle = '#333';
      bgCtx.lineWidth = 4;
      bgCtx.beginPath();
      bgCtx.moveTo(tx1, tz1);
      bgCtx.lineTo(tx2, tz2);
      bgCtx.stroke();
    },
  };
}

// ── 도로 생성 (점 배열 → 세그먼트) ──
function buildRoadFromPoints(tracker, points, width) {
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

    // 도로 면
    const geo = new THREE.PlaneGeometry(width, length + 0.5); // 약간 겹침
    const mesh = new THREE.Mesh(geo, ROAD_MAT);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle;
    mesh.position.set(cx, 0.01, cz);
    mesh.receiveShadow = true;
    tracker.addMesh(mesh);

    // 중앙선 (노란 점선)
    if (i % 3 === 0) {
      const lineGeo = new THREE.PlaneGeometry(0.2, Math.min(length * 0.6, 3));
      const lineMesh = new THREE.Mesh(lineGeo, YELLOW_MAT);
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.rotation.z = angle;
      lineMesh.position.set(cx, 0.02, cz);
      tracker.addMesh(lineMesh);
    }

    // 도로 물리
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.1, length / 2 + 0.25)));
    body.position.set(cx, -0.1, cz);
    body.quaternion.setFromEuler(0, angle, 0);
    tracker.addBody(body);
  }
}

// ── 터널 (곡선 포인트 배열을 따라 생성) ──
function buildTunnel(tracker, points, width, wallH = 5) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const wallDist = width / 2 + 0.25;

  // 각 세그먼트마다 벽 + 천장 생성
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.1) continue;

    const angle = Math.atan2(dx, dz);
    const cx = (p.x + next.x) / 2;
    const cz = (p.z + next.z) / 2;

    // 수직 방향 (도로 좌우)
    const perpX = -dz / segLen;
    const perpZ = dx / segLen;

    // 양쪽 벽
    for (const side of [-1, 1]) {
      const wallGeo = new THREE.BoxGeometry(0.5, wallH, segLen + 0.3);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.castShadow = true;
      wall.receiveShadow = true;

      const ox = cx + perpX * wallDist * side;
      const oz = cz + perpZ * wallDist * side;
      wall.position.set(ox, wallH / 2, oz);
      wall.rotation.y = angle;
      tracker.addMesh(wall);

      // 벽 물리
      const wallBody = new CANNON.Body({ mass: 0 });
      wallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.25, wallH / 2, segLen / 2 + 0.15)));
      wallBody.position.set(ox, wallH / 2, oz);
      wallBody.quaternion.setFromEuler(0, angle, 0);
      tracker.addBody(wallBody);
    }

    // 천장
    const ceilGeo = new THREE.BoxGeometry(width + 1, 0.5, segLen + 0.3);
    const ceil = new THREE.Mesh(ceilGeo, wallMat);
    ceil.position.set(cx, wallH, cz);
    ceil.rotation.y = angle;
    ceil.receiveShadow = true;
    tracker.addMesh(ceil);
  }

  // 내부 조명 (주황색 포인트라이트)
  const lightCount = 4;
  for (let i = 0; i < lightCount; i++) {
    const idx = Math.floor((i + 0.5) / lightCount * (points.length - 1));
    const p = points[idx];
    const light = new THREE.PointLight(0xFF8800, 2, 20);
    light.position.set(p.x, wallH - 0.5, p.z);
    tracker.addMesh(light);
  }

  // 입구 프레임 (양쪽 — 기둥 + 상단 빔, 도로 개구부 유지)
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const ends = [
    { p: points[0], next: points[1] },
    { p: points[points.length - 1], next: points[points.length - 2] },
  ];
  for (const { p, next } of ends) {
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const perpX = -dz / len;
    const perpZ = dx / len;
    const angle = Math.atan2(dx, dz);

    // 양쪽 기둥
    const poleGeo = new THREE.BoxGeometry(1, wallH + 1, 1);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, frameMat);
      pole.position.set(
        p.x + perpX * (width / 2 + 0.5) * side,
        (wallH + 1) / 2,
        p.z + perpZ * (width / 2 + 0.5) * side
      );
      pole.rotation.y = angle;
      pole.castShadow = true;
      tracker.addMesh(pole);
    }

    // 상단 빔
    const beamGeo = new THREE.BoxGeometry(width + 2, 1.2, 1);
    const beam = new THREE.Mesh(beamGeo, frameMat);
    beam.position.set(p.x, wallH + 0.5, p.z);
    beam.rotation.y = angle;
    beam.castShadow = true;
    tracker.addMesh(beam);
  }
}

// ── 가드레일 ──
function addGuardrails(tracker, points, roadWidth) {
  // 매 10번째 포인트마다 가드레일 기둥
  for (let i = 0; i < points.length - 1; i += 5) {
    const p = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) continue;

    const perpX = -dz / len;
    const perpZ = dx / len;

    // 일부 구간만 (50% 확률)
    if (Math.sin(i * 0.7) < 0) continue;

    for (const side of [-1, 1]) {
      const postGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
      const post = new THREE.Mesh(postGeo, GUARDRAIL_MAT);
      const ox = p.x + perpX * (roadWidth / 2 + 0.5) * side;
      const oz = p.z + perpZ * (roadWidth / 2 + 0.5) * side;
      post.position.set(ox, 0.4, oz);
      post.castShadow = true;
      tracker.addMesh(post);
    }
  }
}
