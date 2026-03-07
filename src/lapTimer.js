export function createLapTimer(checkpoints, finishLine) {
  let currentTime = 0;
  let bestLapTime = Infinity;
  let lapCount = 0;
  let passedCheckpoints = new Set();
  let prevX = null;
  let lastLapTime = null;

  const totalCheckpoints = checkpoints.length;

  function update(chassisBody, delta) {
    currentTime += delta;

    const pos = chassisBody.position;
    const curX = pos.x;
    const curZ = pos.z;

    // 체크포인트 통과 확인 (원형 영역)
    for (let i = 0; i < checkpoints.length; i++) {
      if (passedCheckpoints.has(i)) continue;
      const cp = checkpoints[i];
      const dx = curX - cp.x;
      const dz = curZ - cp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < cp.radius) {
        passedCheckpoints.add(i);
      }
    }

    // 결승선 교차 감지 (라인 교차 방식)
    if (prevX !== null) {
      const fl = finishLine;
      // prevX < fl.x → curX >= fl.x (한 방향으로만)
      if (prevX < fl.x && curX >= fl.x) {
        // z 범위 확인
        if (curZ >= fl.zMin && curZ <= fl.zMax) {
          // 모든 체크포인트 통과 확인
          if (passedCheckpoints.size >= totalCheckpoints) {
            // 첫 교차는 시작으로 간주 (lapCount === 0)
            if (lapCount > 0) {
              lastLapTime = currentTime;
              if (currentTime < bestLapTime) {
                bestLapTime = currentTime;
              }
            }
            lapCount++;
            currentTime = 0;
            passedCheckpoints.clear();
          }
        }
      }
    }

    prevX = curX;
  }

  function reset() {
    currentTime = 0;
    bestLapTime = Infinity;
    lapCount = 0;
    passedCheckpoints = new Set();
    prevX = null;
    lastLapTime = null;
  }

  function formatTime(seconds) {
    if (seconds === Infinity || seconds === null) return '-:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const wholeSecs = Math.floor(secs);
    const ms = Math.floor((secs - wholeSecs) * 1000);
    return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function getState() {
    return {
      currentTime,
      currentTimeFormatted: formatTime(currentTime),
      bestLapTime,
      bestLapTimeFormatted: formatTime(bestLapTime),
      lapCount,
      lastLapTime,
      lastLapTimeFormatted: formatTime(lastLapTime),
      passedCheckpoints: passedCheckpoints.size,
      totalCheckpoints,
    };
  }

  return { update, reset, getState };
}
