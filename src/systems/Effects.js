/**
 * 연출 전용 (게임 규칙에 영향 없음): 데미지 숫자 등.
 * Godot: 짧게 떠오르는 Label + Tween.
 */

/**
 * 베기 궤적: from → to 방향으로 호(arc)를 그렸다가 빠르게 사라진다. 각도는 라디안(절대값).
 * from > to 면 반시계 방향으로 휘두른 것.
 */
export function spawnSlash(scene, x, y, from, to, radius, depth, thickness = 4) {
  const g = scene.add.graphics().setDepth(depth);
  const ccw = to < from;
  g.lineStyle(thickness + 1, 0xfff4d6, 0.95);
  g.beginPath();
  g.arc(x, y, radius, from, to, ccw);
  g.strokePath();
  g.lineStyle(Math.max(1, thickness - 2), 0xffc070, 0.8);
  g.beginPath();
  g.arc(x, y, radius - thickness - 1, from + (to - from) * 0.2, to, ccw);
  g.strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: 240, ease: 'Quad.in', onComplete: () => g.destroy() });
}

/** 머리 위에 잠깐 뜨는 안내 글씨 (무기 교체 등) */
export function spawnFloatingLabel(scene, x, y, text) {
  const t = scene.add.text(x, y, text, {
    fontFamily: 'sans-serif', fontSize: '8px', color: '#f2e6c8', resolution: 2,
  }).setOrigin(0.5, 1).setStroke('#1b1410', 3).setDepth(100000);
  scene.tweens.add({ targets: t, y: y - 10, alpha: 0, delay: 500, duration: 500, onComplete: () => t.destroy() });
}

export function spawnDamageNumber(scene, x, y, amount, color = '#ffe08a') {
  const t = scene.add.text(x, y, String(amount), {
    fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold', color, resolution: 2,
  }).setOrigin(0.5, 1).setStroke('#2a1a10', 3).setDepth(100000);
  scene.tweens.add({
    targets: t, y: y - 16, alpha: 0, duration: 600, ease: 'Cubic.out',
    onComplete: () => t.destroy(),
  });
}
