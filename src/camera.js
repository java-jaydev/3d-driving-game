import * as THREE from 'three';

export function createChaseCamera(camera) {
  const baseDistance = 12;
  const baseHeight = 6;
  const currentPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  // 마우스 시점 조작
  let yaw = 0;   // 좌우 회전 (차량 기준 추가 각도)
  let pitch = 0;  // 상하 회전
  let dragging = false;

  const onMouseDown = (e) => {
    if (e.button === 0 || e.button === 2) dragging = true;
  };
  const onMouseUp = () => { dragging = false; };
  const onMouseMove = (e) => {
    if (!dragging) return;
    yaw -= e.movementX * 0.005;
    pitch -= e.movementY * 0.005;
    pitch = Math.max(-0.5, Math.min(0.8, pitch));
  };
  const onContextMenu = (e) => e.preventDefault();

  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('contextmenu', onContextMenu);

  // 마우스를 놓으면 서서히 원래 각도로 복귀
  let returnTimer = 0;

  return {
    update(chassisBody, ceilingHeight) {
      const carPos = new THREE.Vector3(
        chassisBody.position.x,
        chassisBody.position.y,
        chassisBody.position.z
      );
      const carQuat = new THREE.Quaternion(
        chassisBody.quaternion.x,
        chassisBody.quaternion.y,
        chassisBody.quaternion.z,
        chassisBody.quaternion.w
      );

      // 드래그 안 하면 서서히 복귀
      if (!dragging) {
        yaw *= 0.95;
        pitch *= 0.95;
      }

      // 카메라 오프셋 계산 (거리 + 마우스 각도)
      const dist = baseDistance;
      const height = baseHeight + Math.sin(pitch) * 6;
      const horizontalDist = dist * Math.cos(pitch);

      const offset = new THREE.Vector3(
        -Math.sin(yaw) * horizontalDist,
        height,
        -Math.cos(yaw) * horizontalDist
      );

      // 차량 방향에 따라 오프셋 회전
      const desiredPos = offset.applyQuaternion(carQuat).add(carPos);

      // 천장이 있으면 카메라를 천장 아래로 제한
      if (ceilingHeight !== undefined && ceilingHeight > 0) {
        desiredPos.y = Math.min(desiredPos.y, ceilingHeight - 0.5);
      }
      desiredPos.y = Math.max(desiredPos.y, 2);

      // lerp 부드러운 추적
      currentPos.lerp(desiredPos, 0.08);
      camera.position.copy(currentPos);

      // 차량 약간 위를 바라봄
      lookTarget.copy(carPos);
      lookTarget.y += 1.5;
      camera.lookAt(lookTarget);
    },
  };
}
