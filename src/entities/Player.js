import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { findHits } from '../systems/Combat.js';
import { spawnDamageNumber, spawnSlash, spawnFloatingLabel } from '../systems/Effects.js';
import { WeaponView } from './WeaponView.js';

/** 플레이어 상태 이름 (Godot에서는 enum State) */
const State = {
  FREE: 'free',         // 서 있거나 걷기
  WINDUP: 'windup',     // 공격 예비 동작 (취소 불가)
  ACTIVE: 'active',     // 공격 판정 중
  RECOVERY: 'recovery', // 후딜레이 (chainAfterMs 이후에만 다음 타·구르기로 연결 가능)
  ROLL: 'roll',         // 구르기
  HURT: 'hurt',         // 맞고 밀려남 (행동 불가)
  DEAD: 'dead',         // 쓰러짐 → 잠시 뒤 부활
};

/** 가슴 높이: 공격 판정 중심은 발밑이 아니라 몸 가운데 */
const CHEST_OFFSET = 12;
const DEG = Math.PI / 180;

/**
 * 플레이어. 위치(x, y) = 발밑 좌표. 충돌은 발밑의 작은 박스만.
 * 매 프레임 "명령"을 받아 상태 머신으로 행동한다.
 * 공격은 무기 데이터의 combo 목록을 차례로 실행한다 (1타 → 2타 → 3타 …).
 * Godot: CharacterBody2D + 상태 머신(enum + match), move_and_slide().
 */
export class Player extends window.Phaser.Physics.Arcade.Sprite {
  /**
   * @param {object} data data/player.json
   * @param {Record<string, object>} weapons data/weapons.json
   * @param {() => Array} getTargets 공격 가능한 대상 목록
   */
  constructor(scene, x, y, data, weapons, getTargets) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.data_ = data;
    this.weapons = weapons;
    this.getTargets = getTargets;
    this.stats = new Stats(data);

    this.state = State.FREE;
    this.stateTime = 0;           // 현재 상태에서 남은 시간(ms)
    this.facing = { x: 0, y: 1 }; // 바라보는 방향 (공격 방향)
    this.rollDir = { x: 0, y: 1 };
    this.queued = null;           // 공격 중 예약된 다음 행동 ('attack' | 'roll')
    this.comboIndex = 0;          // 지금(또는 다음) 실행할 콤보 타 번호
    this.hitThisSwing = new Set();
    this.hitstopMs = 0;           // 맞힌 순간 잠깐 멈추는 시간
    this.invulnMs = 0;            // 맞은 직후 잠깐 무적 (연속으로 맞지 않게)
    this.knock = { x: 0, y: 0 };
    /** 쓰러졌을 때 씬이 등록하는 콜백 */
    this.onDeath = null;

    this.setOrigin(0.5, 1);
    this.body.setSize(16, 10, false);
    this.body.setOffset(8, 22);
    this.setCollideWorldBounds(true);

    // 겉모습은 별도 그림으로 (몸을 기울이거나 웅크려도 물리 충돌 크기는 그대로 유지)
    // Godot: CharacterBody2D 아래 Sprite2D를 따로 두는 것과 같음
    this.setVisible(false);
    this.visual = scene.add.image(x, y, 'player').setOrigin(0.5, 1);

    this.weaponView = new WeaponView(scene);
    this.fx = scene.add.graphics(); // 바라보는 방향 표시 등
    this.equip(0, false);

    applyYSort(this);
  }

  // ---------- 조회용 (HUD·테스트·WeaponView) ----------
  get stateName() { return this.state; }
  get inHitstop() { return this.hitstopMs > 0; }
  get currentMove() { return this.weapon.combo[this.comboIndex]; }
  get isDead() { return this.state === State.DEAD; }

  /** 맞는 범위 (발밑 위로 몸통 크기) */
  getHurtbox() {
    const h = this.data_.hurtbox;
    return { x: this.x - h.width / 2, y: this.y - h.height, width: h.width, height: h.height };
  }

  get isHittable() { return !this.isDead; }

  /**
   * 적의 공격을 받는다.
   * @returns {'hit'|'dodged'|'ignored'} 맞음 / 구르기 무적으로 피함 / 무시(이미 쓰러짐·피격 무적)
   */
  receiveHit(damage, fromX, fromY) {
    if (this.isDead || this.invulnMs > 0) return 'ignored';
    if (this.isInvincible) {
      spawnFloatingLabel(this.scene, this.x, this.y - 30, '회피!');
      return 'dodged';
    }
    this.stats.takeDamage(damage);
    this.invulnMs = this.data_.hitInvulnMs;
    this.hitstopMs = 0;
    this.queued = null;
    const dx = this.x - fromX, dy = this.y - fromY, d = Math.hypot(dx, dy) || 1;
    this.knock = { x: dx / d, y: dy / d };
    spawnDamageNumber(this.scene, this.x, this.y - 30, damage, '#ff8a7a');
    this.scene.cameras.main.shake(180, 0.006);
    this.visual.setTintFill(0xff4030);
    this.scene.time.delayedCall(90, () => this.visual.clearTint());

    if (this.stats.isDead) {
      this.enter(State.DEAD);
      this.onDeath?.();
    } else {
      this.enter(State.HURT);
    }
    return 'hit';
  }

  /** 부활: 위치·체력·상태 초기화 */
  respawn(x, y) {
    this.body.reset(x, y);
    this.stats.reset();
    this.invulnMs = this.data_.hitInvulnMs;
    this.visual.setAngle(0).setAlpha(1);
    this.enter(State.FREE);
  }

  get isInvincible() {
    return this.state === State.ROLL
      && this.stateTime > this.data_.roll.durationMs - this.data_.roll.invincibleMs;
  }

  // ---------- 무기 ----------
  /** @param {number} slot data/player.json weaponSlots 의 번호 */
  equip(slot, announce = true) {
    const id = this.data_.weaponSlots[slot];
    if (!id || !this.weapons[id]) return;
    this.weaponSlot = slot;
    this.weaponId = id;
    this.weapon = this.weapons[id];
    this.comboIndex = 0;
    this.weaponView.setWeapon(id);
    if (announce) spawnFloatingLabel(this.scene, this.x, this.y - 34, this.weapon.name);
  }

  // ---------- 매 프레임 ----------
  /** @param {{move:{x,y}, attack:boolean, roll:boolean, switchWeapon:number|null}} cmd @param {number} dt ms */
  update(cmd, dt) {
    this.stats.update(dt, this.state === State.FREE);
    if (this.invulnMs > 0) this.invulnMs -= dt;

    if (this.hitstopMs > 0) {
      // 멈칫: 시간이 흐르지 않는다. 입력만 예약해 둔다.
      this.hitstopMs -= dt;
      this.setVelocity(0, 0);
      this.bufferInput(cmd);
      this.finishFrame();
      return;
    }

    this.stateTime -= dt;

    switch (this.state) {
      case State.FREE:
        this.updateFree(cmd);
        break;
      case State.WINDUP:
        this.setVelocity(0, 0);
        this.bufferInput(cmd);
        if (this.stateTime <= 0) this.enter(State.ACTIVE);
        break;
      case State.ACTIVE: {
        const m = this.currentMove;
        this.setVelocity(this.facing.x * m.lungeSpeed, this.facing.y * m.lungeSpeed);
        this.bufferInput(cmd);
        this.applyHits();
        if (this.stateTime <= 0) this.enter(State.RECOVERY);
        break;
      }
      case State.RECOVERY:
        this.setVelocity(0, 0);
        this.bufferInput(cmd);
        this.updateRecovery(cmd);
        break;
      case State.ROLL:
        this.setVelocity(this.rollDir.x * this.data_.roll.speed, this.rollDir.y * this.data_.roll.speed);
        if (this.stateTime <= 0) this.enter(State.FREE);
        break;
      case State.HURT: {
        const k = Math.max(0, this.stateTime / this.data_.hurtMs) * this.data_.knockbackSpeed;
        this.setVelocity(this.knock.x * k, this.knock.y * k);
        if (this.stateTime <= 0) this.enter(State.FREE);
        break;
      }
      case State.DEAD:
        this.setVelocity(0, 0);
        break;
    }

    this.finishFrame();
  }

  finishFrame() {
    applyYSort(this);
    this.updatePose();
    this.weaponView.update(this);
    this.drawFx();
  }

  bufferInput(cmd) {
    if (cmd.attack) this.queued = 'attack';
    if (cmd.roll) this.queued = 'roll';
  }

  updateFree(cmd) {
    const { move } = cmd;
    const moving = move.x !== 0 || move.y !== 0;
    if (moving) this.facing = { x: move.x, y: move.y };

    if (cmd.switchWeapon !== null && cmd.switchWeapon !== undefined) {
      const slot = cmd.switchWeapon === 'next'
        ? (this.weaponSlot + 1) % this.data_.weaponSlots.length
        : cmd.switchWeapon;
      if (slot !== this.weaponSlot) this.equip(slot);
    }

    if (cmd.roll && this.tryRoll(move)) return;
    if (cmd.attack && this.tryAttack(0)) return;

    const speed = this.data_.speed * (this.weapon.moveSpeedMultiplier ?? 1);
    this.setVelocity(move.x * speed, move.y * speed);
  }

  updateRecovery(cmd) {
    const m = this.currentMove;
    const elapsed = m.recoveryMs - this.stateTime;
    const canChain = elapsed >= m.chainAfterMs;
    const hasNext = this.comboIndex + 1 < this.weapon.combo.length;

    if (canChain && this.queued === 'roll') {
      // 구르기로 후딜 끊기 (기력이 없으면 예약 유지)
      if (this.tryRoll(cmd.move)) { this.queued = null; return; }
    }
    if (canChain && this.queued === 'attack' && hasNext) {
      if (this.tryAttack(this.comboIndex + 1)) { this.queued = null; return; }
    }
    if (this.stateTime <= 0) {
      // 콤보 끝 (또는 입력 없음) → 자유 상태. 마지막 타 뒤의 공격 예약은 1타부터 다시.
      const next = this.queued;
      this.queued = null;
      this.enter(State.FREE);
      if (next === 'roll') this.tryRoll(cmd.move);
      else if (next === 'attack') this.tryAttack(0);
    }
  }

  /** @param {number} index 실행할 콤보 타 번호 */
  tryAttack(index) {
    const move = this.weapon.combo[index];
    if (!move || !this.stats.spendStamina(move.staminaCost)) return false;
    this.comboIndex = index;
    this.weaponView.beginWindup();
    this.enter(State.WINDUP);
    return true;
  }

  tryRoll(move) {
    if (!this.stats.spendStamina(this.data_.roll.staminaCost)) return false;
    const moving = move.x !== 0 || move.y !== 0;
    this.rollDir = moving ? { ...move } : { ...this.facing };
    this.facing = { ...this.rollDir };
    this.comboIndex = 0;
    this.enter(State.ROLL);
    return true;
  }

  enter(state) {
    this.state = state;
    const m = this.currentMove;
    switch (state) {
      case State.WINDUP: this.stateTime = m.windupMs; break;
      case State.ACTIVE:
        this.stateTime = m.activeMs;
        this.hitThisSwing.clear();
        this.spawnSlashFx(m);
        break;
      case State.RECOVERY: this.stateTime = m.recoveryMs; break;
      case State.ROLL: this.stateTime = this.data_.roll.durationMs; break;
      case State.HURT: this.stateTime = this.data_.hurtMs; this.comboIndex = 0; break;
      case State.DEAD: this.stateTime = 0; this.comboIndex = 0; break;
      default:
        this.stateTime = 0;
        this.comboIndex = 0;
    }
    this.visual.setAlpha(state === State.ROLL ? 0.55 : 1);
  }

  // ---------- 공격 판정 ----------
  /** 공격 판정 원 (가슴 높이에서 바라보는 방향으로 hitDistance 만큼) */
  getHitCircle() {
    const m = this.currentMove;
    return {
      x: this.x + this.facing.x * m.hitDistance,
      y: this.y - CHEST_OFFSET + this.facing.y * m.hitDistance,
      radius: m.hitRadius,
    };
  }

  applyHits() {
    const m = this.currentMove;
    const hits = findHits(this.getHitCircle(), this.getTargets());
    let landed = false;
    for (const target of hits) {
      if (this.hitThisSwing.has(target)) continue; // 한 번 휘두를 때 같은 대상은 한 번만
      this.hitThisSwing.add(target);
      const dealt = target.takeDamage(m.damage);
      spawnDamageNumber(this.scene, target.x, target.getHurtbox().y - 10, dealt);
      landed = true;
    }
    if (landed) {
      this.hitstopMs = m.hitstopMs;
      this.scene.cameras.main.shake(80 + m.hitstopMs, m.shake);
    }
  }

  // ---------- 겉모습 (임시 그래픽용 몸 움직임) ----------
  /** 상태에 따라 몸을 기울이고 웅크린다. 진짜 애니메이션이 들어오면 이 부분을 대체. */
  updatePose() {
    const v = this.visual;
    v.setPosition(this.x, this.y).setDepth(this.depth);
    if (this.facing.x !== 0) v.setFlipX(this.facing.x < 0);
    const dir = Math.sign(this.facing.x) || 0;
    const m = this.currentMove;
    let lean = 0, squash = 1;

    if (this.state === State.WINDUP) {
      const t = 1 - this.stateTime / m.windupMs;
      lean = -dir * m.lean * 0.6 * t;            // 뒤로 젖히기
      squash = 1 - (1 - m.crouch) * t;            // 웅크리기
    } else if (this.state === State.ACTIVE) {
      lean = dir * m.lean;                        // 앞으로 쏠리기
      squash = 1 + (1 - m.crouch) * 0.6 + 0.04;   // 펴기
    } else if (this.state === State.RECOVERY) {
      const t = Math.min(1, (1 - this.stateTime / m.recoveryMs) * 1.6);
      lean = dir * m.lean * (1 - t);
      squash = 1 + ((1 - m.crouch) * 0.6 + 0.04) * (1 - t);
    } else if (this.state === State.ROLL) {
      squash = 0.8;
    } else if (this.state === State.HURT) {
      lean = -dir * 12;
    }
    if (this.state === State.DEAD) {
      v.setAngle(90).setAlpha(0.6).setScale(1);
      return;
    }
    if (!this.inHitstop) {
      v.setAngle(lean);
      v.setScale(1 / Math.sqrt(squash), squash);
    }
    if (this.state === State.WINDUP) v.setTint(0xffd9a0);
    else if (this.state !== State.HURT) v.clearTint();
    // 맞은 직후 무적: 깜빡임
    if (this.state !== State.ROLL) v.setAlpha(this.invulnMs > 0 && Math.floor(this.invulnMs / 80) % 2 === 0 ? 0.45 : 1);
  }

  spawnSlashFx(m) {
    const base = Math.atan2(this.facing.y, this.facing.x);
    const big = m.hitRadius >= 22;
    spawnSlash(this.scene, this.x, this.y - CHEST_OFFSET, base + m.from * DEG * 0.85, base + m.to * DEG * 0.85,
      m.hitDistance + m.hitRadius * 0.5, this.depth + 1, big ? 7 : 4);
  }

  drawFx() {
    const g = this.fx;
    g.clear();
    g.setDepth(this.depth - 0.1);

    // 바라보는 방향 표시 (발밑 앞쪽의 작은 삼각형)
    const fx = this.facing.x, fy = this.facing.y;
    const tipX = this.x + fx * 14, tipY = this.y - 3 + fy * 9;
    const px = -fy, py = fx; // 수직 방향
    g.fillStyle(0xe8dcc0, 0.6);
    g.fillTriangle(tipX, tipY, tipX - fx * 5 + px * 4, tipY - fy * 4 + py * 3, tipX - fx * 5 - px * 4, tipY - fy * 4 - py * 3);

    // 공격 판정 범위 (디버그 모드에서만)
    if (this.scene.physics.world.drawDebug && this.state === State.ACTIVE) {
      const c = this.getHitCircle();
      g.setDepth(100000);
      g.lineStyle(1, 0xff3030, 1).strokeCircle(c.x, c.y, c.radius);
    }
  }
}
