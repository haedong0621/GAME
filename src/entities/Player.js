import { applyYSort } from '../systems/YSort.js';

/**
 * 플레이어. 위치(x, y) = 발밑 좌표. 충돌은 발밑의 작은 박스만.
 * Godot: CharacterBody2D + Sprite2D + CollisionShape2D(16×10, 발밑), move_and_slide().
 */
export class Player extends window.Phaser.Physics.Arcade.Sprite {
  /** @param {{speed:number}} data data/player.json */
  constructor(scene, x, y, data) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.speed = data.speed;
    this.setOrigin(0.5, 1);

    // 텍스처 32×32 기준, 발밑 16×10 박스
    this.body.setSize(16, 10, false);
    this.body.setOffset(8, 22);
    this.setCollideWorldBounds(true);

    applyYSort(this);
  }

  /** @param {{x:number, y:number}} dir 길이 0~1의 이동 방향 */
  update(dir) {
    this.setVelocity(dir.x * this.speed, dir.y * this.speed);
    if (dir.x !== 0) this.setFlipX(dir.x < 0);
    applyYSort(this);
  }
}
