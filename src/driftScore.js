import * as CANNON from 'cannon-es';

export function createDriftScore() {
  let currentScore = 0;
  let totalScore = 0;
  let combo = 1;
  let driftTime = 0;
  let graceTimer = 0;
  let isDrifting = false;
  let lastAngle = 0;

  const DRIFT_ANGLE_MIN = 15 * (Math.PI / 180); // 15도
  const DRIFT_SPEED_MIN = 30; // km/h
  const GRACE_PERIOD = 0.5; // 초
  const COMBO_INTERVAL = 2; // 초
  const MAX_COMBO = 5;

  function update(chassisBody, delta) {
    // 속도 계산 (km/h)
    const vel = chassisBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z) * 3.6;

    // 차량 전방 벡터 (로컬 -z → 월드)
    const forward = new CANNON.Vec3(0, 0, -1);
    chassisBody.quaternion.vmult(forward, forward);

    // xz 평면에서 각도 계산
    const velXZ = { x: vel.x, z: vel.z };
    const velLen = Math.sqrt(velXZ.x * velXZ.x + velXZ.z * velXZ.z);

    if (velLen < 0.5) {
      // 거의 정지 상태
      handleDriftEnd(delta);
      lastAngle = 0;
      return;
    }

    // 정규화된 속도 방향
    const velDir = { x: velXZ.x / velLen, z: velXZ.z / velLen };
    const fwdDir = { x: forward.x, z: forward.z };
    const fwdLen = Math.sqrt(fwdDir.x * fwdDir.x + fwdDir.z * fwdDir.z);
    if (fwdLen < 0.01) {
      handleDriftEnd(delta);
      return;
    }
    fwdDir.x /= fwdLen;
    fwdDir.z /= fwdLen;

    // cross와 dot으로 각도 계산
    const cross = fwdDir.x * velDir.z - fwdDir.z * velDir.x;
    const dot = fwdDir.x * velDir.x + fwdDir.z * velDir.z;
    const angle = Math.atan2(Math.abs(cross), dot);
    lastAngle = angle;

    // 드리프트 판정
    if (angle > DRIFT_ANGLE_MIN && speed > DRIFT_SPEED_MIN) {
      isDrifting = true;
      graceTimer = 0;

      // 점수 계산: (angleBonus * 50 + speedBonus * 50) * delta
      const angleBonus = Math.min(angle / (Math.PI / 2), 1); // 0~1 (90도에서 max)
      const speedBonus = Math.min((speed - DRIFT_SPEED_MIN) / 70, 1); // 0~1 (100km/h에서 max)
      const scoreThisTick = (angleBonus * 50 + speedBonus * 50) * delta * combo;
      currentScore += scoreThisTick;

      // 콤보: 연속 드리프트 2초마다 멀티플라이어 +1
      driftTime += delta;
      const newCombo = 1 + Math.floor(driftTime / COMBO_INTERVAL);
      combo = Math.min(newCombo, MAX_COMBO);
    } else {
      handleDriftEnd(delta);
    }
  }

  function handleDriftEnd(delta) {
    if (!isDrifting) return;

    graceTimer += delta;
    if (graceTimer >= GRACE_PERIOD) {
      // 드리프트 종료: 총점에 합산
      totalScore += Math.floor(currentScore);
      currentScore = 0;
      combo = 1;
      driftTime = 0;
      isDrifting = false;
      graceTimer = 0;
    }
  }

  function reset() {
    currentScore = 0;
    totalScore = 0;
    combo = 1;
    driftTime = 0;
    graceTimer = 0;
    isDrifting = false;
    lastAngle = 0;
  }

  function getState() {
    return {
      currentScore: Math.floor(currentScore),
      totalScore,
      combo,
      isDrifting,
      angle: lastAngle * (180 / Math.PI),
    };
  }

  return { update, reset, getState };
}
