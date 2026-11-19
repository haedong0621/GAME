/**
 * 연출 전용 (게임 규칙에 영향 없음): 데미지 숫자 등.
 * Godot: 짧게 떠오르는 Label + Tween.
 */
/** 베기 궤적: 호(arc)를 그렸다가 빠르게 사라진다. angle은 라디안. */
export function spawnSlash(scene, x, y, angle, radius, depth) {
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(5, 0xfff4d6, 0.95);
  g.beginPath();
  g.arc(x, y, radius, angle - 1.1, angle + 1.1);
  g.strokePath();
  g.lineStyle(2, 0xffc070, 0.8);
  g.beginPath();
  g.arc(x, y, radius - 5, angle - 0.8, angle + 0.8);
  g.strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: 220, ease: 'Quad.in', onComplete: () => g.destroy() });
}

export function spawnDamageNumber(scene, x, y, amount) {
  const t = scene.add.text(x, y, String(amount), {
    fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#ffe08a', resolution: 2,
  }).setOrigin(0.5, 1).setStroke('#2a1a10', 3).setDepth(100000);
  scene.tweens.add({
    targets: t, y: y - 16, alpha: 0, duration: 600, ease: 'Cubic.out',
    onComplete: () => t.destroy(),
  });
}
