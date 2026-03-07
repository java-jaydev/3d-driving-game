import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const NPC_COUNT = 12;
const NPC_COLORS = [
  0xCC3333, 0x3366CC, 0xFFCC00, 0x33AA33,
  0xFFFFFF, 0x444444, 0xFF6600, 0x9933CC,
  0x33CCCC, 0xCC33CC, 0x66CC33, 0xCC6633,
];

export function createNPCTraffic(scene, world, gridInfo) {
  const npcs = [];
  const { GRID_SIZE, CELL, HALF } = gridInfo;

  // 교차점 좌표 계산 (11x11)
  function intersectionPos(row, col) {
    return {
      x: col * CELL - HALF,
      z: row * CELL - HALF,
    };
  }

  // 방향 벡터 (상하좌우)
  const DIRS = [
    { dr: -1, dc: 0 },  // 북
    { dr: 1, dc: 0 },   // 남
    { dr: 0, dc: -1 },  // 서
    { dr: 0, dc: 1 },   // 동
  ];

  function oppositeDir(dir) {
    if (dir.dr === -1 && dir.dc === 0) return { dr: 1, dc: 0 };
    if (dir.dr === 1 && dir.dc === 0) return { dr: -1, dc: 0 };
    if (dir.dr === 0 && dir.dc === -1) return { dr: 0, dc: 1 };
    return { dr: 0, dc: -1 };
  }

  function createNPC(index) {
    const color = NPC_COLORS[index % NPC_COLORS.length];

    // 차체 메시
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(2, 1.2, 4);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.6;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // 지붕
    const roofGeo = new THREE.BoxGeometry(1.7, 0.8, 2);
    const roofMat = new THREE.MeshLambertMaterial({ color });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.y = 1.6;
    roofMesh.position.z = -0.2;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    scene.add(group);

    // Kinematic 물리 바디
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 2)));
    world.addBody(body);

    // 랜덤 시작 위치 (교차점)
    const startRow = Math.floor(Math.random() * (GRID_SIZE + 1));
    const startCol = Math.floor(Math.random() * (GRID_SIZE + 1));
    const startPos = intersectionPos(startRow, startCol);

    // 랜덤 방향 (U턴 아닌 것)
    const dir = DIRS[Math.floor(Math.random() * 4)];

    const speed = 8 + Math.random() * 3; // 8~11 m/s

    body.position.set(startPos.x, 0.6, startPos.z);
    group.position.copy(body.position);

    return {
      group,
      body,
      row: startRow,
      col: startCol,
      targetRow: startRow + dir.dr,
      targetCol: startCol + dir.dc,
      dir,
      speed,
      atIntersection: false,
    };
  }

  // NPC 생성
  for (let i = 0; i < NPC_COUNT; i++) {
    npcs.push(createNPC(i));
  }

  function chooseNextDir(npc) {
    const opp = oppositeDir(npc.dir);
    // 가능한 방향 중 U턴 제외
    const candidates = DIRS.filter(d => !(d.dr === opp.dr && d.dc === opp.dc));

    // 직진 50%, 좌/우회전 각 25%
    const rand = Math.random();
    const straight = npc.dir;
    if (rand < 0.5) {
      // 직진 가능한지 확인
      const nextRow = npc.targetRow + straight.dr;
      const nextCol = npc.targetCol + straight.dc;
      if (nextRow >= 0 && nextRow <= GRID_SIZE && nextCol >= 0 && nextCol <= GRID_SIZE) {
        return straight;
      }
    }
    // 그 외 랜덤
    const valid = candidates.filter(d => {
      const nr = npc.targetRow + d.dr;
      const nc = npc.targetCol + d.dc;
      return nr >= 0 && nr <= GRID_SIZE && nc >= 0 && nc <= GRID_SIZE;
    });
    if (valid.length === 0) return oppositeDir(npc.dir); // 막다른 길이면 U턴
    return valid[Math.floor(Math.random() * valid.length)];
  }

  function update(delta, playerPosition) {
    for (const npc of npcs) {
      const target = intersectionPos(npc.targetRow, npc.targetCol);
      const dx = target.x - npc.body.position.x;
      const dz = target.z - npc.body.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 1.0) {
        // 교차점 도달 → 다음 방향 결정
        npc.row = npc.targetRow;
        npc.col = npc.targetCol;
        npc.body.position.set(target.x, 0.6, target.z);

        const nextDir = chooseNextDir(npc);
        npc.dir = nextDir;
        npc.targetRow = npc.row + nextDir.dr;
        npc.targetCol = npc.col + nextDir.dc;
      } else {
        // 타겟 방향으로 이동
        const moveX = (dx / dist) * npc.speed * delta;
        const moveZ = (dz / dist) * npc.speed * delta;
        npc.body.position.x += moveX;
        npc.body.position.z += moveZ;

        // 회전 (이동 방향)
        const angle = Math.atan2(dx, dz);
        npc.body.quaternion.setFromEuler(0, angle, 0);
      }

      // 메시 동기화
      npc.group.position.copy(npc.body.position);
      npc.group.quaternion.copy(npc.body.quaternion);

      // 플레이어로부터 200유닛 이상 멀어지면 재배치
      if (playerPosition) {
        const px = playerPosition.x - npc.body.position.x;
        const pz = playerPosition.z - npc.body.position.z;
        const playerDist = Math.sqrt(px * px + pz * pz);
        if (playerDist > 200) {
          respawnNear(npc, playerPosition);
        }
      }
    }
  }

  function respawnNear(npc, playerPos) {
    // 플레이어 근처 교차점으로 재배치 (50~100 유닛 거리)
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 50;
    const tx = playerPos.x + Math.cos(angle) * dist;
    const tz = playerPos.z + Math.sin(angle) * dist;

    // 가장 가까운 교차점 찾기
    let bestRow = 0, bestCol = 0, bestDist = Infinity;
    for (let r = 0; r <= GRID_SIZE; r++) {
      for (let c = 0; c <= GRID_SIZE; c++) {
        const ip = intersectionPos(r, c);
        const d = Math.abs(ip.x - tx) + Math.abs(ip.z - tz);
        if (d < bestDist) {
          bestDist = d;
          bestRow = r;
          bestCol = c;
        }
      }
    }

    const pos = intersectionPos(bestRow, bestCol);
    npc.body.position.set(pos.x, 0.6, pos.z);
    npc.row = bestRow;
    npc.col = bestCol;
    const dir = DIRS[Math.floor(Math.random() * 4)];
    npc.dir = dir;
    npc.targetRow = Math.max(0, Math.min(GRID_SIZE, bestRow + dir.dr));
    npc.targetCol = Math.max(0, Math.min(GRID_SIZE, bestCol + dir.dc));
  }

  function cleanup() {
    for (const npc of npcs) {
      scene.remove(npc.group);
      world.removeBody(npc.body);
    }
    npcs.length = 0;
  }

  return { update, cleanup };
}
