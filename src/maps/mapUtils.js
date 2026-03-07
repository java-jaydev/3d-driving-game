import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * scene/world에 추가된 mesh/body를 추적하고 일괄 제거하는 유틸
 */
export function createTracker(scene, world) {
  const meshes = [];
  const bodies = [];

  return {
    addMesh(mesh) {
      scene.add(mesh);
      meshes.push(mesh);
      return mesh;
    },
    addBody(body) {
      world.addBody(body);
      bodies.push(body);
      return body;
    },
    cleanup() {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      }
      for (const body of bodies) {
        world.removeBody(body);
      }
      meshes.length = 0;
      bodies.length = 0;
    },
  };
}

// ── 도로 생성 헬퍼 ──

const ROAD_MAT = new THREE.MeshLambertMaterial({ color: 0x333333 });
const GRASS_MAT = new THREE.MeshLambertMaterial({ color: 0x4a7c4f });

/**
 * 두 점 사이에 도로 면 + 물리 바디 생성
 */
export function generateRoadSegment(tracker, from, to, width) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (from.x + to.x) / 2;
  const cz = (from.z + to.z) / 2;

  // 도로 면
  const geo = new THREE.PlaneGeometry(width, length);
  const mesh = new THREE.Mesh(geo, ROAD_MAT);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = angle;
  mesh.position.set(cx, 0.01, cz);
  mesh.receiveShadow = true;
  tracker.addMesh(mesh);

  // 물리 바디
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.1, length / 2)));
  body.position.set(cx, -0.1, cz);
  body.quaternion.setFromEuler(0, angle, 0);
  tracker.addBody(body);

  return { mesh, body, angle, length };
}

/**
 * waypoint 배열을 따라 연속 도로 생성
 * waypoints: [{x, z}, ...]
 */
export function generateCurvedRoad(tracker, waypoints, width) {
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = generateRoadSegment(
      tracker,
      waypoints[i],
      waypoints[i + 1],
      width
    );
    segments.push(seg);
  }
  return segments;
}

/**
 * 원형 교차로 생성
 */
export function generateRoundabout(tracker, cx, cz, radius, width, segments = 32) {
  // 원형 도로 면
  const outerR = radius + width / 2;
  const innerR = radius - width / 2;
  const ringGeo = new THREE.RingGeometry(innerR, outerR, segments);
  const ringMesh = new THREE.Mesh(ringGeo, ROAD_MAT);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(cx, 0.01, cz);
  ringMesh.receiveShadow = true;
  tracker.addMesh(ringMesh);

  // 원형 물리 (여러 box로 근사)
  const physSegments = 16;
  for (let i = 0; i < physSegments; i++) {
    const a1 = (i / physSegments) * Math.PI * 2;
    const a2 = ((i + 1) / physSegments) * Math.PI * 2;
    const mx = cx + Math.cos((a1 + a2) / 2) * radius;
    const mz = cz + Math.sin((a1 + a2) / 2) * radius;
    const segLen = 2 * radius * Math.sin(Math.PI / physSegments);

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.1, segLen / 2)));
    body.position.set(mx, -0.1, mz);
    body.quaternion.setFromEuler(0, -(a1 + a2) / 2 + Math.PI / 2, 0);
    tracker.addBody(body);
  }

  // 중앙 섬 (잔디)
  const islandGeo = new THREE.CircleGeometry(innerR - 1, segments);
  const islandMesh = new THREE.Mesh(islandGeo, GRASS_MAT);
  islandMesh.rotation.x = -Math.PI / 2;
  islandMesh.position.set(cx, 0.02, cz);
  islandMesh.receiveShadow = true;
  tracker.addMesh(islandMesh);

  // 중앙 섬 물리 (차가 들어가지 못하게)
  const islandBody = new CANNON.Body({ mass: 0 });
  islandBody.addShape(new CANNON.Cylinder(innerR - 1, innerR - 1, 0.5, segments));
  islandBody.position.set(cx, 0.25, cz);
  tracker.addBody(islandBody);

  return { ringMesh, islandMesh };
}

/**
 * 간단한 나무 생성 (원뿔 + 원기둥)
 */
export function createTree(tracker, x, z, scale = 1) {
  const group = new THREE.Group();

  // 줄기
  const trunkGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 1.5 * scale, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.75 * scale;
  trunk.castShadow = true;
  group.add(trunk);

  // 잎
  const leafGeo = new THREE.ConeGeometry(1.2 * scale, 2.5 * scale, 8);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d8a4e });
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.y = 2.5 * scale;
  leaf.castShadow = true;
  group.add(leaf);

  group.position.set(x, 0, z);
  tracker.addMesh(group);

  return group;
}

/**
 * 경계벽 생성 (보이지 않는 물리 벽)
 */
export function createBoundaryWalls(tracker, bounds) {
  const wallH = 20;
  const wallT = 2;
  const margin = 25;
  const width = bounds.maxX - bounds.minX + margin * 2;
  const depth = bounds.maxZ - bounds.minZ + margin * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  const sides = [
    { x: cx, z: bounds.minZ - margin, w: width, d: wallT },
    { x: cx, z: bounds.maxZ + margin, w: width, d: wallT },
    { x: bounds.minX - margin, z: cz, w: wallT, d: depth },
    { x: bounds.maxX + margin, z: cz, w: wallT, d: depth },
  ];

  for (const s of sides) {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(s.w / 2, wallH / 2, s.d / 2)));
    body.position.set(s.x, wallH / 2, s.z);
    tracker.addBody(body);
  }
}

/**
 * 바닥면(잔디) 생성
 */
export function createGround(tracker, sizeX, sizeZ, color = 0x4a7c4f) {
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  tracker.addMesh(mesh);

  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Plane());
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  tracker.addBody(body);

  return mesh;
}
