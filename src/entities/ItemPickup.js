import { applyYSort } from '../systems/YSort.js';

/**
 * 바닥에 떨어진 아이템. 플레이어가 닿으면 주워진다.
 * Godot: Area2D + Sprite2D, body_entered 시그널에서 Inventory.add().
 */
export class ItemPickup extends window.Phaser.Physics.Arcade.Image {
  /** @param {number|null} mapId 맵(Tiled) 오브젝트 id — 저장 시 "주웠음" 기록용. 몬스터 드롭은 null */
  constructor(scene, x, y, itemId, amount = 1, mapId = null) {
    super(scene, x, y, `item-${itemId}`);
    scene.add.existing(this);
    this.mapId = mapId;
    this.itemId = itemId;
    this.amount = amount;
    this.setOrigin(0.5, 1);
    applyYSort(this);

    // 살짝 떠다니는 연출
    scene.tweens.add({ targets: this, y: y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  collect() {
    this.body.enable = false;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this, y: this.y - 12, alpha: 0, duration: 200,
      onComplete: () => this.destroy(),
    });
  }
}
