/**
 * 불길·연기 (맵 오브젝트 type=fire, kind=fire|smoke, size 배율). 코드로 만든 부드러운 점 그림 + 입자.
 * 불: 주황·노랑 입자가 위로 타오르고, 바닥에 붉은 빛 + 위로 연기 / 연기: 잿빛 입자가 천천히 크게 피어오름 (불탄 뒤의 잔불)
 * 보이기·숨기기는 깃발(showIf/hideIf)로 월드가 정함.
 * Godot: Fire.tscn = GPUParticles2D 둘(불·연기) + PointLight2D.
 */
function ensureTexture(scene) {
  if (scene.textures.exists('fx_soft')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let r = 8; r >= 1; r--) { g.fillStyle(0xffffff, 0.12 + (8 - r) * 0.1); g.fillCircle(8, 8, r); }
  g.generateTexture('fx_soft', 16, 16);
  g.destroy();
}

export class Fire {
  constructor(scene, x, y, kind = 'fire', size = 1) {
    ensureTexture(scene);
    this.scene = scene;
    this.x = x; this.y = y;
    this.kind = kind;
    this.parts = [];
    const s = size;
    if (kind === 'fire') {
      this.glow = scene.add.ellipse(x, y - 2, 56 * s, 20 * s, 0xff5018, 0.16).setBlendMode('ADD').setDepth(y - 1);
      scene.tweens.add({ targets: this.glow, alpha: 0.08, scaleX: 0.9, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.parts.push(this.glow);
      this.parts.push(scene.add.particles(x, y - 4, 'fx_soft', {
        x: { min: -16 * s, max: 16 * s }, speedY: { min: -60 * s, max: -30 * s }, speedX: { min: -8, max: 8 },
        lifespan: { min: 450, max: 800 }, scale: { start: 1.15 * s, end: 0.15 }, alpha: { start: 0.8, end: 0 },
        tint: [0xffb040, 0xff7a24, 0xe0481a, 0xc03014], frequency: 34 / s, quantity: 1,
      }).setDepth(y + 30));
      this.parts.push(scene.add.particles(x, y - 30 * s, 'fx_soft', {
        x: { min: -10 * s, max: 10 * s }, speedY: { min: -30, max: -18 }, speedX: { min: 4, max: 14 },
        lifespan: { min: 1800, max: 2600 }, scale: { start: 1.4 * s, end: 4 * s }, alpha: { start: 0.4, end: 0 },
        tint: [0x302824, 0x483e38], frequency: 140 / s,
      }).setDepth(y + 200));
    } else {
      this.parts.push(scene.add.particles(x, y - 6, 'fx_soft', {
        x: { min: -8 * s, max: 8 * s }, speedY: { min: -24, max: -12 }, speedX: { min: 2, max: 10 },
        lifespan: { min: 2400, max: 3600 }, scale: { start: 1.2 * s, end: 3.6 * s }, alpha: { start: 0.32, end: 0 },
        tint: [0x5a5450, 0x787068], frequency: 260 / s,
      }).setDepth(y + 200));
    }
  }

  setShown(on) {
    for (const p of this.parts) {
      p.setVisible(on);
      if (p.emitting !== undefined) { if (on) p.start(); else p.stop(); }
    }
  }
}
