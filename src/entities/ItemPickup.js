import { applyYSort } from '../systems/YSort.js';

/** 빛기둥 색: 일반 소재·음식 = 흰빛, 특수 소재 = 파란빛, 장비(장신구 완제품 등) = 금빛 */
const BEAM = { common: { color: 0xf0ecd8, h: 28, a: 0.32 }, rare: { color: 0x5aa8ff, h: 50, a: 0.6 }, gear: { color: 0xffc850, h: 64, a: 0.7 } };

/**
 * 바닥에 떨어진 아이템(재료·음식·장비). 가까이서 E(줍기)를 누르면 쪼그려 집는 모션과 함께 주워진다.
 * 위로 빛기둥이 서서 멀리서도 보인다 (등급별 색·높이).
 * Godot: Area2D + Sprite2D + 빛기둥(GPUParticles2D 또는 그라데이션 Sprite), 상호작용 시 Inventory.add().
 */
export class ItemPickup extends window.Phaser.Physics.Arcade.Image {
  /** @param {number|null} mapId 맵(Tiled) 오브젝트 id — 저장 시 "주웠음" 기록용. 몬스터 드롭은 null */
  constructor(scene, x, y, itemId, amount = 1, mapId = null) {
    const gear = scene.registry.get('gear')?.[itemId];
    const weapon = scene.registry.get('weapons')?.[itemId];
    const tex = gear?.slot === 'ring' || gear?.slot === 'necklace' ? `icon-${gear.slot}` : weapon ? `blade-${itemId}` : gear ? 'icon-gear' : `item-${itemId}`;
    super(scene, x, y, scene.textures.exists(tex) ? tex : 'icon-gear');
    scene.add.existing(this);
    if (weapon) this.setAngle(-45).setScale(0.8);
    this.mapId = mapId;
    this.itemId = itemId;
    this.amount = amount;
    this.isPickup = true;   // 상호작용(E) 대상: 줍기 모션으로 줍는다
    this.homeY = y;         // 떠다니기 전 자리 (다시 생길 때)
    this.setOrigin(0.5, 1);
    applyYSort(this);

    // 살짝 떠다니는 연출
    scene.tweens.add({ targets: this, y: y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 빛기둥 (바닥에서 위로 옅어지는 기둥 + 밑동 빛 고리, 천천히 깜빡임)
    this.grade = gear || weapon ? 'gear' : scene.registry.get('items')?.get(itemId)?.grade === 'rare' ? 'rare' : 'common';
    const b = BEAM[this.grade];
    const g = scene.add.graphics().setDepth(this.depth - 0.01).setBlendMode(window.Phaser.BlendModes.ADD);
    g.fillGradientStyle(b.color, b.color, b.color, b.color, 0, 0, b.a, b.a).fillRect(-3, -b.h, 6, b.h);
    g.fillGradientStyle(b.color, b.color, b.color, b.color, 0, 0, b.a * 0.5, b.a * 0.5).fillRect(-7, -b.h * 0.7, 14, b.h * 0.7);
    g.fillGradientStyle(0xffffff, 0xffffff, b.color, b.color, 0, 0, b.a, b.a).fillRect(-1, -b.h * 0.85, 2, b.h * 0.85); // 가운데 밝은 심
    g.fillStyle(b.color, b.a * 0.9).fillEllipse(0, 0, 18, 6);
    g.setPosition(x, y);
    scene.tweens.add({ targets: g, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.beam = g;
  }

  collect() {
    this.body.enable = false;
    this.scene.tweens.killTweensOf(this.beam);
    this.beam?.destroy();
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this, y: this.y - 12, alpha: 0, duration: 200,
      onComplete: () => this.destroy(),
    });
  }
}
