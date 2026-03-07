import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTracker } from './mapUtils.js';

const GRID_SIZE = 10;
const BLOCK_SIZE = 30;
const ROAD_WIDTH = 10;
const CELL = BLOCK_SIZE + ROAD_WIDTH;
const TOTAL_SIZE = GRID_SIZE * CELL;
const HALF = TOTAL_SIZE / 2;

const PASTEL_COLORS = [
  0xFFB3BA, 0xFFDFBA, 0xFFFFBA, 0xBAFFC9,
  0xBAE1FF, 0xE8BAFF, 0xFFBAE8, 0xC9FFBA,
  0xBAFFFF, 0xFFE8BA, 0xD4BAFF, 0xBAFFD4,
];

const WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
const YELLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xFFCC00 });
const MARK_Y = 0.025;

function isParkingLot(row, col) {
  const hash = (row * 31 + col * 17 + 7) % 20;
  return hash < 3;
}

export function createCityMap(scene, world) {
  const tracker = createTracker(scene, world);

  // 바닥 (잔디)
  const groundGeo = new THREE.PlaneGeometry(TOTAL_SIZE + 100, TOTAL_SIZE + 100);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a7c4f });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  tracker.addMesh(ground);

  // 바닥 물리
  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  tracker.addBody(groundBody);

  // 도로 재질
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

  // 그리드별 도로 + 건물
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const bx = col * CELL - HALF + ROAD_WIDTH / 2;
      const bz = row * CELL - HALF + ROAD_WIDTH / 2;

      // 가로 도로
      const hRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL, ROAD_WIDTH),
        roadMat
      );
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(bx + BLOCK_SIZE / 2, 0.01, bz - ROAD_WIDTH / 2);
      hRoad.receiveShadow = true;
      tracker.addMesh(hRoad);

      // 세로 도로
      const vRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_WIDTH, CELL),
        roadMat
      );
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(bx - ROAD_WIDTH / 2, 0.01, bz + BLOCK_SIZE / 2);
      vRoad.receiveShadow = true;
      tracker.addMesh(vRoad);

      // 차선 + 횡단보도 + 화살표
      addLaneMarkings(tracker, bx, bz);
      addCrosswalk(tracker, bx, bz);
      if ((row + col) % 3 === 0) {
        addArrow(tracker, bx, bz);
      }

      // 일부 블록은 주차장, 나머지는 건물
      if (isParkingLot(row, col)) {
        createParkingLot(tracker, bx, bz);
      } else {
        const buildingCount = 1 + Math.floor(Math.random() * 4);
        placeBuildings(tracker, bx, bz, buildingCount);
      }
    }
  }

  // 외곽 벽
  createBoundaryWalls(tracker, HALF);

  return {
    cleanup: () => tracker.cleanup(),
    spawnPosition: { x: 0, y: 2, z: 0 },
    spawnRotation: 0,
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    gridInfo: { GRID_SIZE, CELL, HALF },
    renderMinimapBackground(bgCtx, mapPx) {
      // 잔디 배경
      bgCtx.fillStyle = '#3a5c3f';
      bgCtx.fillRect(0, 0, mapPx, mapPx);

      const toMap = (wx, wz) => [
        ((wx - (-HALF)) / TOTAL_SIZE) * mapPx,
        ((wz - (-HALF)) / TOTAL_SIZE) * mapPx,
      ];

      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const bx = col * CELL - HALF + ROAD_WIDTH / 2;
          const bz = row * CELL - HALF + ROAD_WIDTH / 2;

          // 가로 도로
          const [hx, hz] = toMap(bx - ROAD_WIDTH / 2, bz - ROAD_WIDTH);
          const hW = (CELL / TOTAL_SIZE) * mapPx;
          const hH = (ROAD_WIDTH / TOTAL_SIZE) * mapPx;
          bgCtx.fillStyle = '#555';
          bgCtx.fillRect(hx, hz, hW, hH);

          // 세로 도로
          const [vx, vz] = toMap(bx - ROAD_WIDTH, bz - ROAD_WIDTH / 2);
          const vW = (ROAD_WIDTH / TOTAL_SIZE) * mapPx;
          const vH = (CELL / TOTAL_SIZE) * mapPx;
          bgCtx.fillStyle = '#555';
          bgCtx.fillRect(vx, vz, vW, vH);

          // 블록 (건물 or 주차장)
          const [blkX, blkZ] = toMap(bx, bz);
          const blkW = (BLOCK_SIZE / TOTAL_SIZE) * mapPx;
          bgCtx.fillStyle = isParkingLot(row, col) ? '#777' : '#aa8899';
          bgCtx.fillRect(blkX, blkZ, blkW, blkW);
        }
      }
    },
  };
}

// ── 바닥 평면 헬퍼 ──
function makePlane(w, h, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ── 중앙 점선 + 가장자리 실선 ──
function addLaneMarkings(tracker, bx, bz) {
  const dashLen = 2;
  const gapLen = 2.5;
  const lineW = 0.15;
  const margin = 4;

  // 가로 도로
  const hZ = bz - ROAD_WIDTH / 2;
  for (let d = margin; d < BLOCK_SIZE - margin; d += dashLen + gapLen) {
    const len = Math.min(dashLen, BLOCK_SIZE - margin - d);
    const m = makePlane(len, lineW, YELLOW_MAT);
    m.position.set(bx + d + len / 2, MARK_Y, hZ);
    tracker.addMesh(m);
  }
  for (const side of [-1, 1]) {
    const m = makePlane(BLOCK_SIZE, lineW, WHITE_MAT);
    m.position.set(bx + BLOCK_SIZE / 2, MARK_Y, hZ + side * (ROAD_WIDTH / 2 - 0.4));
    tracker.addMesh(m);
  }

  // 세로 도로
  const vX = bx - ROAD_WIDTH / 2;
  for (let d = margin; d < BLOCK_SIZE - margin; d += dashLen + gapLen) {
    const len = Math.min(dashLen, BLOCK_SIZE - margin - d);
    const m = makePlane(lineW, len, YELLOW_MAT);
    m.position.set(vX, MARK_Y, bz + d + len / 2);
    tracker.addMesh(m);
  }
  for (const side of [-1, 1]) {
    const m = makePlane(lineW, BLOCK_SIZE, WHITE_MAT);
    m.position.set(vX + side * (ROAD_WIDTH / 2 - 0.4), MARK_Y, bz + BLOCK_SIZE / 2);
    tracker.addMesh(m);
  }
}

// ── 교차로 횡단보도 ──
function addCrosswalk(tracker, bx, bz) {
  const intX = bx - ROAD_WIDTH / 2;
  const intZ = bz - ROAD_WIDTH / 2;
  const stripeW = 0.9;
  const stripeGap = 0.5;
  const stripeLen = ROAD_WIDTH * 0.4;
  const count = 5;
  const totalW = count * stripeW + (count - 1) * stripeGap;
  const start = -totalW / 2 + stripeW / 2;

  // 남쪽 횡단보도
  for (let i = 0; i < count; i++) {
    const m = makePlane(stripeW, stripeLen, WHITE_MAT);
    const offset = start + i * (stripeW + stripeGap);
    m.position.set(intX + offset, MARK_Y, intZ + ROAD_WIDTH / 2 + 0.5);
    tracker.addMesh(m);
  }

  // 서쪽 횡단보도
  for (let i = 0; i < count; i++) {
    const m = makePlane(stripeLen, stripeW, WHITE_MAT);
    const offset = start + i * (stripeW + stripeGap);
    m.position.set(intX + ROAD_WIDTH / 2 + 0.5, MARK_Y, intZ + offset);
    tracker.addMesh(m);
  }

  // 방지턱
  const bumpOffset = totalW / 2 + 1.2;
  addSpeedBump(tracker, intX, intZ + ROAD_WIDTH / 2 + 0.5 + bumpOffset, ROAD_WIDTH - 2, false);
  addSpeedBump(tracker, intX + ROAD_WIDTH / 2 + 0.5 + bumpOffset, intZ, ROAD_WIDTH - 2, true);
}

function addSpeedBump(tracker, x, z, length, rotated) {
  const BUMP_MAT = new THREE.MeshBasicMaterial({ color: 0xFFCC00 });
  const DARK_MAT = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const stripCount = Math.floor(length / 1.0);

  for (let i = 0; i < stripCount; i++) {
    const pos = -length / 2 + 0.5 + i * 1.0;
    const mat = (i % 2 === 0) ? BUMP_MAT : DARK_MAT;
    const sw = rotated ? 0.6 : 0.4;
    const sd = rotated ? 0.4 : 0.6;
    const stripe = makePlane(sw, sd, mat);
    stripe.position.set(
      x + (rotated ? 0 : pos),
      MARK_Y + 0.005,
      z + (rotated ? pos : 0)
    );
    tracker.addMesh(stripe);
  }
}

// ── 바닥 방향 화살표 ──
function addArrow(tracker, bx, bz) {
  const group = new THREE.Group();

  const body = makePlane(0.3, 2.0, WHITE_MAT);
  body.position.set(0, 0, -0.05);
  group.add(body);

  const headShape = new THREE.Shape();
  headShape.moveTo(0, 0);
  headShape.lineTo(-0.7, -1.2);
  headShape.lineTo(0.7, -1.2);
  headShape.closePath();
  const headGeo = new THREE.ShapeGeometry(headShape);
  const head = new THREE.Mesh(headGeo, WHITE_MAT);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -1.5);
  group.add(head);

  // 가로 도로 화살표
  const hArrow = group.clone();
  hArrow.rotation.y = -Math.PI / 2;
  hArrow.position.set(bx + BLOCK_SIZE * 0.5, MARK_Y, bz - ROAD_WIDTH / 2 - 2);
  tracker.addMesh(hArrow);

  // 세로 도로 화살표
  const vArrow = group.clone();
  vArrow.position.set(bx - ROAD_WIDTH / 2 + 2, MARK_Y, bz + BLOCK_SIZE * 0.5);
  tracker.addMesh(vArrow);
}

function placeBuildings(tracker, bx, bz, count) {
  const margin = 2;
  const available = BLOCK_SIZE - margin * 2;

  if (count === 1) {
    const w = available * 0.6 + Math.random() * available * 0.3;
    const d = available * 0.6 + Math.random() * available * 0.3;
    const h = 3 + Math.random() * 5;
    const cx = bx + BLOCK_SIZE / 2;
    const cz = bz + BLOCK_SIZE / 2;
    addBuilding(tracker, cx, cz, w, h, d);
  } else {
    const halfBlock = available / 2;
    const positions = [
      [bx + margin + halfBlock * 0.5, bz + margin + halfBlock * 0.5],
      [bx + margin + halfBlock * 1.5, bz + margin + halfBlock * 0.5],
      [bx + margin + halfBlock * 0.5, bz + margin + halfBlock * 1.5],
      [bx + margin + halfBlock * 1.5, bz + margin + halfBlock * 1.5],
    ];
    for (let i = 0; i < count && i < 4; i++) {
      const w = halfBlock * 0.5 + Math.random() * halfBlock * 0.4;
      const d = halfBlock * 0.5 + Math.random() * halfBlock * 0.4;
      const h = 3 + Math.random() * 4;
      addBuilding(tracker, positions[i][0], positions[i][1], w, h, d);
    }
  }
}

function addBuilding(tracker, x, z, w, h, d) {
  const color = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];

  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tracker.addMesh(mesh);

  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
  body.position.set(x, h / 2, z);
  tracker.addBody(body);
}

const PARKED_CAR_COLORS = [
  0xCC3333, 0x3366CC, 0xFFCC00, 0x33AA33,
  0xFFFFFF, 0x222222, 0xFF6600, 0x9933CC,
];

function createParkingLot(tracker, bx, bz) {
  const lotW = BLOCK_SIZE;
  const lotD = BLOCK_SIZE;
  const cx = bx + lotW / 2;
  const cz = bz + lotD / 2;

  // 주차장 바닥
  const floorGeo = new THREE.PlaneGeometry(lotW, lotD);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.02, cz);
  floor.receiveShadow = true;
  tracker.addMesh(floor);

  // 주차 라인
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const slotW = 3;
  const slotD = 5.5;
  const gap = 0.8;
  const rows = 2;
  const slotsPerRow = Math.floor((lotW - 4) / (slotW + gap));
  const startX = bx + (lotW - slotsPerRow * (slotW + gap)) / 2 + slotW / 2;

  for (let r = 0; r < rows; r++) {
    const zPos = (r === 0) ? bz + 4 + slotD / 2 : bz + lotD - 4 - slotD / 2;

    for (let s = 0; s < slotsPerRow; s++) {
      const xPos = startX + s * (slotW + gap);

      for (let side = -1; side <= 1; side += 2) {
        const lineGeo = new THREE.PlaneGeometry(0.15, slotD);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(xPos + side * slotW / 2, 0.03, zPos);
        tracker.addMesh(line);
      }

      const frontLineGeo = new THREE.PlaneGeometry(slotW, 0.15);
      const frontLine = new THREE.Mesh(frontLineGeo, lineMat);
      frontLine.rotation.x = -Math.PI / 2;
      const frontZ = (r === 0) ? zPos - slotD / 2 : zPos + slotD / 2;
      frontLine.position.set(xPos, 0.03, frontZ);
      tracker.addMesh(frontLine);

      if (Math.random() < 0.6) {
        addParkedCar(tracker, xPos, zPos);
      }
    }
  }

  // 주차장 표시 기둥
  const postH = 1.5;
  const postR = 0.2;
  const postGeo = new THREE.CylinderGeometry(postR, postR, postH, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xFFAA00 });
  const corners = [
    [bx + 0.5, bz + 0.5], [bx + lotW - 0.5, bz + 0.5],
    [bx + 0.5, bz + lotD - 0.5], [bx + lotW - 0.5, bz + lotD - 0.5],
  ];
  for (const [px, pz] of corners) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(px, postH / 2, pz);
    post.castShadow = true;
    tracker.addMesh(post);

    const postBody = new CANNON.Body({ mass: 0 });
    postBody.addShape(new CANNON.Cylinder(postR, postR, postH, 6));
    postBody.position.set(px, postH / 2, pz);
    tracker.addBody(postBody);
  }
}

function addParkedCar(tracker, x, z) {
  const color = PARKED_CAR_COLORS[Math.floor(Math.random() * PARKED_CAR_COLORS.length)];
  const carW = 2;
  const carH = 1.2;
  const carD = 4;

  const bodyGeo = new THREE.BoxGeometry(carW, carH, carD);
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const carMesh = new THREE.Mesh(bodyGeo, bodyMat);
  carMesh.position.set(x, carH / 2, z);
  carMesh.castShadow = true;
  carMesh.receiveShadow = true;
  tracker.addMesh(carMesh);

  const roofW = carW * 0.85;
  const roofH = 0.8;
  const roofD = carD * 0.5;
  const roofGeo = new THREE.BoxGeometry(roofW, roofH, roofD);
  const roofMat = new THREE.MeshLambertMaterial({ color });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(x, carH + roofH / 2, z - carD * 0.05);
  roof.castShadow = true;
  tracker.addMesh(roof);

  const body = new CANNON.Body({ mass: 0 });
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(carW / 2, (carH + roofH) / 2, carD / 2)),
    new CANNON.Vec3(0, 0, 0)
  );
  body.position.set(x, (carH + roofH) / 2, z);
  tracker.addBody(body);
}

function createBoundaryWalls(tracker, half) {
  const wallH = 20;
  const wallT = 2;
  const len = half * 2 + 50;

  const sides = [
    { x: 0, z: -half - 25, w: len, d: wallT },
    { x: 0, z: half + 25, w: len, d: wallT },
    { x: -half - 25, z: 0, w: wallT, d: len },
    { x: half + 25, z: 0, w: wallT, d: len },
  ];

  for (const s of sides) {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(s.w / 2, wallH / 2, s.d / 2)));
    body.position.set(s.x, wallH / 2, s.z);
    tracker.addBody(body);
  }
}
