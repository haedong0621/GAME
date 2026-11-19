import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { findHits } from '../systems/Combat.js';
import { spawnDamageNumber, spawnSlash } from '../systems/Effects.js';

/** 플레이어 상태 이름 (Godot에서는 enum State) */
const State = {
  FREE: 'free',         // 서 있거나 걷기
  WINDUP: 'windup',     // 공격 예비 동작 (취소 불가)
  ACTIVE: 'active',     // 공격 판정 중
  RECOVERY: 'recovery', // 후딜레이 (취소 불가, 다음 행동은 예약만)
  ROLL: 'roll',         // 구르기
};

/** 가슴 높이: 공격 판정 중심은 발밑이 아니라 몸 가운데 */
const CHEST_OFFSET = 12;

/**
 * 플레이어. 위치(x, y) = 발밑 좌표. 충돌은 발밑의 작은 박스만.
 * 매 프레임 "명령"을 받아 상태 머신으로 행동한다.
 * Godot: CharacterBody2D + 상태 머신(enum + match), move_and_slide().
 */
export class Player extends window.Phaser.Physics.Arcade.Sprite {
  /**
   * @param {object} data data/player.json
   * @param {object} weapon data/weapons.json 의 항목 하나
   * @param {() => Array} getTargets 공격 가능한 대상 목록
   */
  constructor(scene, x, y, data, weapon, getTargets) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.data_ = data;
    this.weapon = weapon;
    this.getTargets = getTargets;
    this.stats = new Stats(data);

    this.state = State.FREE;
    this.stateTime = 0;          // 현재 상태에서 남은 시간(ms)
    this.facing = { x: 0, y: 1 }; // 바라보는 방향 (공격 방향)
    this.rollDir = { x: 0, y: 1 };
    this.queued = null;           // 후딜 중 예약된 다음 행동 ('attack' | 'roll')
    this.hitThisSwing = new Set();

    this.setOrigin(0.5, 1);
    this.body.setSize(16, 10, false);
    this.body.setOffset(8, 22);
    this.setCollideWorldBounds(true);

    // 연출용 그래픽: 바라보는 방향 표시 + 베기 궤적
    this.fx = scene.add.graphics();

    applyYSort(this);
  }

  get isInvincible() {
    return this.state === State.ROLL
      && this.stateTime > this.data_.roll.durationMs - this.data_.roll.invincibleMs;
  }

  /** 디버그·테스트·HUD용 */
  get stateName() {
    return this.state;
  }

  /** @param {{move:{x,y}, attack:boolean, roll:boolean}} cmd @param {number} dt ms */
  update(cmd, dt) {
    this.stats.update(dt, this.state === State.FREE);
    this.stateTime -= dt;

    switch (this.state) {
      case State.FREE:
        this.updateFree(cmd);
        break;
      case State.WINDUP:
        this.setVelocity(0, 0);
        if (this.stateTime <= 0) this.enter(State.ACTIVE);
        break;
      case State.ACTIVE:
        this.setVelocity(this.facing.x * this.weapon.lungeSpeed, this.facing.y * this.weapon.lungeSpeed);
        this.applyHits();
        if (this.stateTime <= 0) this.enter(State.RECOVERY);
        break;
      case State.RECOVERY:
        this.setVelocity(0, 0);
        if (cmd.attack) this.queued = 'attack';
        if (cmd.roll) this.queued = 'roll';
        if (this.stateTime <= 0) this.finishRecovery(cmd);
        break;
      case State.ROLL:
        this.setVelocity(this.rollDir.x * this.data_.roll.speed, this.rollDir.y * this.data_.roll.speed);
        if (this.stateTime <= 0) this.enter(State.FREE);
        break;
    }

    applyYSort(this);
    this.drawFx();
  }

  updateFree(cmd) {
    const { move } = cmd;
    const moving = move.x !== 0 || move.y !== 0;
    if (moving) this.facing = { x: move.x, y: move.y };

    if (cmd.roll && this.tryRoll(move)) return;
    if (cmd.attack && this.tryAttack()) return;

    this.setVelocity(move.x * this.data_.speed, move.y * this.data_.speed);
    if (move.x !== 0) this.setFlipX(move.x < 0);
  }

  tryAttack() {
    if (!this.stats.spendStamina(this.weapon.staminaCost)) return false;
    this.enter(State.WINDUP);
    return true;
  }

  tryRoll(move) {
    if (!this.stats.spendStamina(this.data_.roll.staminaCost)) return false;
    const moving = move.x !== 0 || move.y !== 0;
    this.rollDir = moving ? { ...move } : { ...this.facing };
    this.facing = { ...this.rollDir };
    this.enter(State.ROLL);
    return true;
  }

  finishRecovery(cmd) {
    const next = this.queued;
    this.queued = null;
    this.enter(State.FREE);
    if (next === 'roll') this.tryRoll(cmd.move);
    else if (next === 'attack') this.tryAttack();
  }

  enter(state) {
    this.state = state;
    const w = this.weapon;
    switch (state) {
      case State.WINDUP: this.stateTime = w.windupMs; break;
      case State.ACTIVE:
        this.stateTime = w.activeMs;
        this.hitThisSwing.clear();
        spawnSlash(this.scene, this.x, this.y - CHEST_OFFSET, Math.atan2(this.facing.y, this.facing.x),
          w.hitDistance + w.hitRadius * 0.6, this.depth + 1);
        break;
      case State.RECOVERY: this.stateTime = w.recoveryMs; break;
      case State.ROLL: this.stateTime = this.data_.roll.durationMs; break;
      default: this.stateTime = 0;
    }
    // 상태별 겉모습 (임시 그래픽용)
    this.clearTint();
    this.setAlpha(state === State.ROLL ? 0.55 : 1);
    if (state === State.WINDUP) this.setTint(0xffc070);
  }

  /** 공격 판정 원 (가슴 높이에서 바라보는 방향으로 hitDistance 만큼) */
  getHitCircle() {
    return {
      x: this.x + this.facing.x * this.weapon.hitDistance,
      y: this.y - CHEST_OFFSET + this.facing.y * this.weapon.hitDistance,
      radius: this.weapon.hitRadius,
    };
  }

  applyHits() {
    const hits = findHits(this.getHitCircle(), this.getTargets());
    for (const target of hits) {
      if (this.hitThisSwing.has(target)) continue; // 한 번 휘두를 때 같은 대상은 한 번만
      this.hitThisSwing.add(target);
      target.takeDamage(this.weapon.damage);
      spawnDamageNumber(this.scene, target.x, target.y - target.data.hurtbox.height - 10, this.weapon.damage);
      this.scene.cameras.main.shake(60, 0.002);
    }
  }

  drawFx() {
    const g = this.fx;
    g.clear();
    g.setDepth(this.depth + 1);

    // 바라보는 방향 표시 (발밑 앞쪽의 작은 삼각형)
    const fx = this.facing.x, fy = this.facing.y;
    const tipX = this.x + fx * 14, tipY = this.y - 3 + fy * 9;
    const px = -fy, py = fx; // 수직 방향
    g.fillStyle(0xe8dcc0, 0.7);
    g.fillTriangle(tipX, tipY, tipX - fx * 5 + px * 4, tipY - fy * 4 + py * 3, tipX - fx * 5 - px * 4, tipY - fy * 4 - py * 3);

    // 공격 판정 범위 (디버그 모드에서만)
    if (this.scene.physics.world.drawDebug && this.state === State.ACTIVE) {
      const c = this.getHitCircle();
      g.lineStyle(1, 0xff3030, 1).strokeCircle(c.x, c.y, c.radius);
    }
  }
}
