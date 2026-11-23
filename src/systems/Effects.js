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

/**
 * 흙먼지 구름: 바닥에서 동그란 먼지가 몇 개 퍼지며 사라진다 (구르기·착지 등).
 * @param {{x:number,y:number}} dir 움직이는 방향 (먼지는 뒤쪽으로 퍼짐)
 */
export function spawnDust(scene, x, y, dir = { x: 0, y: 0 }, count = 4) {
  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics().setDepth(y - 1);
    const r = 2 + Math.random() * 2.5;
    g.fillStyle(0xc8b896, 0.85).fillCircle(0, 0, r);
    g.fillStyle(0xe8dcc0, 0.6).fillCircle(-r * 0.3, -r * 0.3, r * 0.5);
    const ox = (Math.random() - 0.5) * 8, oy = (Math.random() - 0.5) * 3;
    g.setPosition(x + ox - dir.x * 4, y + oy - dir.y * 2);
    scene.tweens.add({
      targets: g,
      x: g.x - dir.x * (8 + Math.random() * 6) + (Math.random() - 0.5) * 6,
      y: g.y - dir.y * (4 + Math.random() * 3) - 3 - Math.random() * 3,
      scale: 1.8 + Math.random() * 0.6, alpha: 0,
      duration: 420 + Math.random() * 200, ease: 'Quad.out',
      onComplete: () => g.destroy(),
    });
  }
}

/** 잔상: 지금 모습을 하얗게 복사해 남겼다가 흐려짐 (완벽한 회피 등) */
export function spawnAfterimage(scene, sprite) {
  const img = scene.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
    .setOrigin(sprite.originX, sprite.originY).setFlipX(sprite.flipX).setDepth(sprite.depth - 0.5)
    .setTintFill(0xd8f0ff).setAlpha(0.75);
  scene.tweens.add({ targets: img, alpha: 0, scale: 1.15, duration: 500, ease: 'Quad.out', onComplete: () => img.destroy() });
}

/** 큰 글씨 라벨 (완벽한 회피!, ?! 등) */
export function spawnBigLabel(scene, x, y, text, color = '#e8f6ff') {
  const t = scene.add.text(x, y, text, {
    fontFamily: 'sans-serif', fontSize: '11px', fontStyle: 'bold', color, resolution: 2,
  }).setOrigin(0.5, 1).setStroke('#101820', 4).setDepth(100001).setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' });
  scene.tweens.add({ targets: t, y: y - 12, alpha: 0, delay: 600, duration: 400, onComplete: () => t.destroy() });
}

/** 채집 부스러기: 나무는 갈색 나뭇조각, 돌은 회색 돌가루 + 불똥. 위로 튀었다 떨어짐 */
export function spawnChips(scene, x, y, kind = 'wood', count = 5) {
  const colors = kind === 'stone' ? [0xb0aca4, 0x8a8680, 0xffe0a0] : [0xb08a5c, 0x8a6440, 0xd8b884];
  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics().setDepth(y + 5);
    const c = colors[i % colors.length];
    g.fillStyle(c, 1).fillRect(-1, -1, i % 3 === 2 && kind === 'stone' ? 1 : 2, 2);
    g.setPosition(x + (Math.random() - 0.5) * 6, y);
    const vx = (Math.random() - 0.5) * 34, up = 10 + Math.random() * 10;
    scene.tweens.add({ targets: g, x: g.x + vx, duration: 380, ease: 'Linear' });
    scene.tweens.add({ targets: g, y: y - up, duration: 160, ease: 'Quad.out', yoyo: true,
      onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() }) });
  }
}
