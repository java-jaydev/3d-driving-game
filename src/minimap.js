const MAP_PX = 180;

export function createMinimap() {
  const canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  canvas.width = MAP_PX;
  canvas.height = MAP_PX;
  canvas.style.cssText =
    'position:fixed;top:1rem;right:1rem;width:180px;height:180px;' +
    'border-radius:12px;border:2px solid rgba(255,255,255,0.4);' +
    'background:rgba(0,0,0,0.5);z-index:50;display:none;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // 현재 맵 데이터
  let bounds = null;
  let toMap = null;

  // 정적 배경 (맵별로 생성)
  const bg = document.createElement('canvas');
  bg.width = MAP_PX;
  bg.height = MAP_PX;
  const bgCtx = bg.getContext('2d');

  return {
    setMap(mapData) {
      bounds = mapData.bounds;
      const rangeX = bounds.maxX - bounds.minX;
      const rangeZ = bounds.maxZ - bounds.minZ;

      toMap = (wx, wz) => [
        ((wx - bounds.minX) / rangeX) * MAP_PX,
        ((wz - bounds.minZ) / rangeZ) * MAP_PX,
      ];

      // 배경 다시 그리기
      bgCtx.clearRect(0, 0, MAP_PX, MAP_PX);
      mapData.renderMinimapBackground(bgCtx, MAP_PX);
    },
    show() {
      canvas.style.display = 'block';
    },
    hide() {
      canvas.style.display = 'none';
    },
    update(chassisBody) {
      if (!toMap) return;

      const px = chassisBody.position.x;
      const pz = chassisBody.position.z;

      // 차량 yaw
      const q = chassisBody.quaternion;
      const yaw = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.y * q.y + q.z * q.z)
      );

      ctx.clearRect(0, 0, MAP_PX, MAP_PX);
      ctx.drawImage(bg, 0, 0);

      // 차량 마커
      const [mx, mz] = toMap(px, pz);
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(-yaw);

      ctx.fillStyle = '#FF3333';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-3.5, 4);
      ctx.lineTo(3.5, 4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    },
  };
}
