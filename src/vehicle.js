import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VEHICLE_PARAMS = {
  Bike:       { mass: 80,  maxForce: 600,  maxSteer: 0.6,  name: '오토바이' },
  Car_2:      { mass: 150, maxForce: 800,  maxSteer: 0.5,  name: '승용차' },
  Porter_01:  { mass: 180, maxForce: 850,  maxSteer: 0.45, name: '포터' },
  HY_Truck_1: { mass: 200, maxForce: 900,  maxSteer: 0.4,  name: '트럭' },
  Bus_mid:    { mass: 250, maxForce: 1000, maxSteer: 0.4,  name: '중형 버스' },
  Bus_big:    { mass: 300, maxForce: 1200, maxSteer: 0.35, name: '대형 버스' },
  Trailer_1:  { mass: 350, maxForce: 1300, maxSteer: 0.3,  name: '트레일러', flipModel: false },
};

export async function createVehicle(scene, world, vehicleId, spawnPos = { x: 0, y: 2, z: 0 }, spawnRotation = 0) {
  const params = VEHICLE_PARAMS[vehicleId];

  // GLB 로딩
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}glb/${vehicleId}.glb`);
  const model = gltf.scene;

  // 바운딩 박스로 크기 계산
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // 크기 정규화 (약 4m 길이 기준)
  const targetLength = 4;
  const scaleFactor = targetLength / Math.max(size.x, size.z);
  model.scale.multiplyScalar(scaleFactor);

  // 스케일 후 다시 측정
  box.setFromObject(model);
  box.getSize(size);
  box.getCenter(center);

  // 모델 중심 보정 + 전후 방향 반전 (GLB 모델 기본 방향 보정)
  model.position.sub(center);
  if (params.flipModel !== false) {
    model.rotation.y = Math.PI;
  }

  const modelContainer = new THREE.Group();
  modelContainer.add(model);
  scene.add(modelContainer);

  // 섀도우 설정
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // 차량 물리 바디
  const chassisH = Math.min(size.y / 2, 1.0);
  const chassisW = Math.max(size.x / 2, 1.0);
  const halfExtents = new CANNON.Vec3(chassisW, chassisH, size.z / 2);
  const chassisShape = new CANNON.Box(halfExtents);
  const chassisBody = new CANNON.Body({ mass: params.mass });
  chassisBody.addShape(chassisShape, new CANNON.Vec3(0, -chassisH * 0.3, 0));
  chassisBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  if (spawnRotation) {
    chassisBody.quaternion.setFromEuler(0, spawnRotation, 0);
  }
  chassisBody.angularDamping = 0.8;
  chassisBody.linearDamping = 0.1;

  // RaycastVehicle
  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  });

  const wheelRadius = Math.min(size.y * 0.18, 0.4);
  const wheelOptions = {
    radius: wheelRadius,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 30,
    suspensionRestLength: 0.3,
    frictionSlip: 2.5,
    dampingRelaxation: 2.3,
    dampingCompression: 4.4,
    maxSuspensionForce: 100000,
    rollInfluence: 0.01,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new CANNON.Vec3(),
    maxSuspensionTravel: 0.3,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
  };

  const wX = Math.max(halfExtents.x * 0.8, 0.8);
  const wZ = halfExtents.z * 0.7;
  const wY = -chassisH + 0.1;

  // 앞바퀴
  wheelOptions.chassisConnectionPointLocal.set(wX, wY, wZ);
  vehicle.addWheel({ ...wheelOptions });
  wheelOptions.chassisConnectionPointLocal.set(-wX, wY, wZ);
  vehicle.addWheel({ ...wheelOptions });

  // 뒷바퀴
  wheelOptions.chassisConnectionPointLocal.set(wX, wY, -wZ);
  vehicle.addWheel({ ...wheelOptions });
  wheelOptions.chassisConnectionPointLocal.set(-wX, wY, -wZ);
  vehicle.addWheel({ ...wheelOptions });

  vehicle.addToWorld(world);

  // 휠 바디
  const wheelBodies = [];
  for (let i = 0; i < vehicle.wheelInfos.length; i++) {
    const wheelBody = new CANNON.Body({ mass: 0, collisionFilterGroup: 0 });
    wheelBody.addShape(new CANNON.Sphere(wheelOptions.radius));
    world.addBody(wheelBody);
    wheelBodies.push(wheelBody);
  }

  return {
    model: modelContainer,
    chassisBody,
    vehicle,
    wheelBodies,
    params,
    halfExtents,
    sync() {
      modelContainer.position.copy(chassisBody.position);
      modelContainer.quaternion.copy(chassisBody.quaternion);
      modelContainer.position.y -= size.y * 0.1;

      for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        const t = vehicle.wheelInfos[i].worldTransform;
        wheelBodies[i].position.copy(t.position);
        wheelBodies[i].quaternion.copy(t.quaternion);
      }
    },
    reset() {
      chassisBody.position.set(spawnPos.x, spawnPos.y + 1, spawnPos.z);
      if (spawnRotation) {
        chassisBody.quaternion.setFromEuler(0, spawnRotation, 0);
      } else {
        chassisBody.quaternion.set(0, 0, 0, 1);
      }
      chassisBody.velocity.setZero();
      chassisBody.angularVelocity.setZero();
    },
    getSpeed() {
      const v = chassisBody.velocity;
      return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3.6;
    },
  };
}
