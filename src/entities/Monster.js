import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { StatusEffects } from '../systems/StatusEffects.js';

/**
 * 몬스터(현재는 AI 없는 연습용 허수아비만). 수치는 data/monsters.json.
 * (x, y) = 발밑. 발밑 작은 박스는 길을 막고, 몸 전체 크기의 hurtbox는 공격을 맞는 범위.
 * Godot: Monster.tscn = Sprite2D + StaticBody2D(발밑) + Area2D(Hurtbox) + Stats.
 */
export class Monster {
  constructor(scene, x, y, id, data) {
    this.scene = scene;
    this.id = id;
    this.data = data;
    this.stats = new Stats(data);
    this.status = new StatusEffects(this);
    this.x = x;
    this.y = y;

    this.sprite = scene.add.image(x, y, data.texture).setOrigin(0.5, 1);
    applyYSort(this.sprite);

    const f = data.feetCollider;
    this.feet = scene.add.zone(x, y - f.height / 2, f.width, f.height);

    this.hpBar = scene.add.graphics().setDepth(this.sprite.depth + 1);
    this.drawHpBar();
  }

  get isHittable() {
    return !this.stats.isDead;
  }

  getHurtbox() {
    const h = this.data.hurtbox;
    return { x: this.x - h.width / 2, y: this.y - h.height, width: h.width, height: h.height };
  }

  update(dt) {
    this.status.update(dt);
  }

  /** @returns {number} 실제로 들어간 데미지 */
  takeDamage(amount, opts = {}) {
    if (this.stats.isDead) return 0;
    this.stats.takeDamage(amount);
    this.drawHpBar();

    // 맞은 연출: 하얗게 번쩍 + 흔들림
    const s = this.sprite;
    s.setTintFill(opts.fromStatus ? 0x9adf5a : 0xffffff);
    this.scene.time.delayedCall(70, () => s.clearTint());
    if (!opts.fromStatus) {
      this.scene.tweens.add({ targets: s, x: this.x + 2, duration: 40, yoyo: true, repeat: 1, onComplete: () => { s.x = this.x; } });
    }

    if (this.stats.isDead) this.die();
    return amount;
  }

  die() {
    this.status.clear();
    this.sprite.setAlpha(0.35);
    if (this.data.respawnMs) {
      this.scene.time.delayedCall(this.data.respawnMs, () => {
        this.stats.reset();
        this.sprite.setAlpha(1);
        this.drawHpBar();
      });
    }
  }

  drawHpBar() {
    const g = this.hpBar;
    g.clear();
    const w = 24, x = this.x - w / 2, y = this.y - this.data.hurtbox.height - 8;
    g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, 5);
    g.fillStyle(0xb23a2e).fillRect(x, y, w * (this.stats.hp / this.stats.maxHp), 3);
  }
}
