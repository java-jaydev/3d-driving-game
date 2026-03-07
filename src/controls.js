export function createControls() {
  const keys = {};

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  return {
    update(vehicleData) {
      const { vehicle, params } = vehicleData;
      const { maxForce, maxSteer } = params;

      let engineForce = 0;
      let steer = 0;
      let brake = 0;

      if (keys['ArrowUp'] || keys['KeyW']) {
        engineForce = -maxForce;
      } else if (keys['ArrowDown'] || keys['KeyS']) {
        engineForce = maxForce * 0.5;
      } else {
        brake = 5;
      }

      if (keys['ArrowLeft'] || keys['KeyA']) {
        steer = maxSteer;
      } else if (keys['ArrowRight'] || keys['KeyD']) {
        steer = -maxSteer;
      }

      // Space: 리셋
      if (keys['Space']) {
        vehicleData.reset();
        keys['Space'] = false;
      }

      // 뒷바퀴 구동
      vehicle.applyEngineForce(engineForce, 2);
      vehicle.applyEngineForce(engineForce, 3);

      // 앞바퀴 조향
      vehicle.setSteeringValue(steer, 0);
      vehicle.setSteeringValue(steer, 1);

      // 브레이크 (4륜 모두)
      for (let i = 0; i < 4; i++) {
        vehicle.setBrake(brake, i);
      }

      // 속도 제한 (100 km/h)
      const maxSpeed = 100 / 3.6;
      const v = vehicleData.chassisBody.velocity;
      const speed = Math.sqrt(v.x * v.x + v.z * v.z);
      if (speed > maxSpeed) {
        const factor = maxSpeed / speed;
        v.x *= factor;
        v.z *= factor;
      }
    },
  };
}
