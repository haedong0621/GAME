import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { findHits } from '../systems/Combat.js';
import { spawnFloatingLabel } from '../systems/Effects.js';
import { StatusEffects } from '../systems/StatusEffects.js';

/** 보스 행동 상태 (Godot: enum State) */
const State = {
  IDLE: 'idle',         // 제자리 (경계: 모름)
  ROAR: 'roar',         // 발견 직후 포효 (경계: 발견)
  CHASE: 'chase',       // 쫓아감
  WINDUP: 'windup',     // 공격 예고 동작 — 바닥에 위험 범위 표시
  ACTIVE: 'active',     // 공격 판정
  RECOVERY: 'recovery', // 공격 후 빈틈 — 때릴 기회
  RETURN: 'return',     // 놓쳐서 집으로 돌아감 (경계: 의심)
  DEAD: 'dead',
};

/**
 * 경계 단계 (스닉 시스템 대비). 지금은 거리만 보고 판단하지만,
 * M4에서 시야(부채꼴)·소리·풀숲/어둠 판정을 senses()에 넣으면 된다.
 */
const Awareness = { UNAWARE: 'unaware', SUSPICIOUS: 'suspicious', ALERT: 'alert' };

const CHEST = 18; // 보스 몸 중심 높이

/**
 * 보스 몬스터. 수치·패턴은 data/monsters.json (ai: "boss").
 * (x, y) = 발밑. 물리 몸체는 발밑 박스(밀리지 않음), 겉모습은 별도 이미지.
 * Godot: Boss.tscn = CharacterBody2D + Sprite2D + Hurtbox(Area2D) + 공격 Area2D들 + 상태 머신 + Stats.
 */
export class Boss extends window.Phaser.Physics.Arcade.Sprite {
  /**
   * @param {() => import('./Player.js').Player} getPlayer
   * @param {(boss: Boss) => void} onDefeated
   */
  constructor(scene, x, y, id, data, getPlayer, onDefeated) {
    super(scene, x, y, data.texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setVisible(false);

    this.id = id;
    this.data_ = data;
    this.getPlayer = getPlayer;
    this.onDefeated = onDefeated;
    this.stats = new Stats(data);
    this.status = new StatusEffects(this);
    this.home = { x, y };

    const f = data.feetCollider;
    this.setOrigin(0.5, 1);
    this.body.setSize(f.width, f.height, false);
    this.body.setOffset((this.width - f.width) / 2, this.height - f.height);
    this.body.setImmovable(true);
    this.setCollideWorldBounds(true);

    this.visual = scene.add.image(x, y, data.texture).setOrigin(0.5, 1);
    this.telegraph = scene.add.graphics();
    this.hpBarSmall = scene.add.graphics();

    this.state = State.IDLE;
    this.awareness = Awareness.UNAWARE;
    this.stateTime = 0;
    this.cooldown = 0;
    this.facing = { x: -1, y: 0 };
    this.attack = null;
    this.attackDir = { x: -1, y: 0 };
    this.hitPlayerThisAttack = false;

    applyYSort(this);
  }

  // ---------- 다른 객체가 쓰는 인터페이스 (Monster와 같음) ----------
  get isHittable() { return this.state !== State.DEAD; }
  get isAlert() { return this.awareness === Awareness.ALERT && this.state !== State.DEAD; }
  get displayName() { return this.data_.name; }

  getHurtbox() {
    const h = this.data_.hurtbox;
    return { x: this.x - h.width / 2, y: this.y - h.height, width: h.width, height: h.height };
  }

  /** @returns {number} 실제로 들어간 데미지 */
  takeDamage(amount, opts = {}) {
    if (this.state === State.DEAD) return 0;
    let dealt = amount;
    if (this.awareness !== Awareness.ALERT && !opts.fromStatus) {
      // 기습: 눈치채기 전에 맞으면 배율 (스닉 시스템의 기초)
      dealt = Math.round(amount * this.data_.sneakAttackMultiplier);
      spawnFloatingLabel(this.scene, this.x, this.y - this.data_.hurtbox.height - 18, '기습!');
      this.becomeAlert(false);
    }
    this.stats.takeDamage(dealt);

    const v = this.visual;
    v.setTintFill(opts.fromStatus ? 0x9adf5a : 0xffffff);
    this.scene.time.delayedCall(70, () => { if (this.state !== State.DEAD) this.applyTint(); });

    if (this.stats.isDead) this.die();
    return dealt;
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    if (this.state === State.DEAD) { this.syncVisual(); return; }
    this.status.update(dt);
    if (this.state === State.DEAD) return; // 독으로 쓰러졌을 수 있음
    this.stateTime -= dt;
    this.cooldown -= dt;

    const p = this.getPlayer();
    const dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 1 };
    const phase = this.currentPhase();

    switch (this.state) {
      case State.IDLE:
        this.setVelocity(0, 0);
        if (this.senses(p, dist)) this.becomeAlert(true);
        break;

      case State.ROAR:
        this.setVelocity(0, 0);
        this.face(toPlayer);
        if (this.stateTime <= 0) this.enter(State.CHASE);
        break;

      case State.CHASE: {
        if (p.isDead || dist > this.data_.leashRadius) { this.loseTrack(); break; }
        this.face(toPlayer);
        if (this.cooldown <= 0) {
          const atk = this.pickAttack(dist);
          if (atk) { this.startAttack(atk, toPlayer); break; }
        }
        const speed = this.data_.speed * phase.speedMultiplier;
        if (dist > this.data_.chaseStopDistance) this.setVelocity(toPlayer.x * speed, toPlayer.y * speed);
        else this.setVelocity(0, 0);
        break;
      }

      case State.WINDUP: {
        this.setVelocity(0, 0);
        const a = this.attack;
        const t = 1 - this.stateTime / this.windupTotal;
        // 돌진은 예고 동작 초반엔 플레이어를 따라 조준하다가, aimLockAt 이후 방향 고정
        if (a.type === 'charge' && t < (a.aimLockAt ?? 0)) { this.attackDir = toPlayer; this.face(toPlayer); }
        if (this.stateTime <= 0) this.enter(State.ACTIVE);
        break;
      }

      case State.ACTIVE: {
        const a = this.attack;
        if (a.type === 'charge') {
          this.setVelocity(this.attackDir.x * a.speed, this.attackDir.y * a.speed);
          this.checkHit({ x: this.x, y: this.y - CHEST, radius: a.width / 2 });
          if (!this.body.blocked.none) this.stateTime = 0; // 나무 등에 부딪히면 멈춤
        } else {
          const lunge = this.stateTime > a.activeMs / 2 ? a.lunge : 0;
          this.setVelocity(this.attackDir.x * lunge, this.attackDir.y * lunge);
          this.checkHit(this.circleArea(a));
        }
        if (this.stateTime <= 0) this.enter(State.RECOVERY);
        break;
      }

      case State.RECOVERY:
        this.setVelocity(0, 0);
        if (this.stateTime <= 0) {
          this.cooldown = this.data_.attackCooldownMs;
          this.enter(State.CHASE);
        }
        break;

      case State.RETURN: {
        if (this.senses(p, dist)) { this.becomeAlert(true); break; }
        const hx = this.home.x - this.x, hy = this.home.y - this.y;
        const hd = Math.hypot(hx, hy);
        if (hd < 6) {
          this.stats.reset();
          this.awareness = Awareness.UNAWARE;
          this.enter(State.IDLE);
        } else {
          this.face({ x: hx / hd, y: hy / hd });
          this.setVelocity((hx / hd) * this.data_.speed, (hy / hd) * this.data_.speed);
        }
        break;
      }
    }

    this.syncVisual();
  }

  /** 플레이어를 알아챘는가? (M4 스닉: 시야각·소리·은신 판정을 여기에) */
  senses(player, dist) {
    return !player.isDead && dist < this.data_.detectRadius;
  }

  becomeAlert(roar) {
    this.awareness = Awareness.ALERT;
    if (roar) {
      this.enter(State.ROAR);
      this.scene.cameras.main.shake(400, 0.004);
    } else if (this.state === State.IDLE || this.state === State.RETURN) {
      this.enter(State.CHASE);
    }
  }

  loseTrack() {
    this.awareness = Awareness.SUSPICIOUS;
    this.enter(State.RETURN);
  }

  /** 플레이어가 쓰러졌을 때 등: 집으로 즉시 돌려보내고 초기화 (몬스터 헌터의 "수레" 후 상황) */
  resetToHome() {
    if (this.state === State.DEAD) return;
    this.status.clear();
    this.body.reset(this.home.x, this.home.y);
    this.stats.reset();
    this.awareness = Awareness.UNAWARE;
    this.cooldown = 0;
    this.enter(State.IDLE);
  }

  currentPhase() {
    const ratio = this.stats.hp / this.stats.maxHp;
    const phases = (this.data_.phases ?? []).filter((ph) => ratio < ph.hpBelow);
    const ph = phases[phases.length - 1];
    return { speedMultiplier: ph?.speedMultiplier ?? 1, windupMultiplier: ph?.windupMultiplier ?? 1, name: ph?.name };
  }

  /** 거리에 맞는 공격 중 가중치(weight)로 무작위 선택 */
  pickAttack(dist) {
    const options = this.data_.attacks.filter((a) => dist >= a.minRange && dist <= a.maxRange);
    if (options.length === 0) return null;
    let r = Math.random() * options.reduce((s, a) => s + a.weight, 0);
    for (const a of options) { r -= a.weight; if (r <= 0) return a; }
    return options[options.length - 1];
  }

  startAttack(atk, dir) {
    this.attack = atk;
    this.attackDir = { ...dir };
    this.hitPlayerThisAttack = false;
    this.enter(State.WINDUP);
  }

  circleArea(a) {
    return {
      x: this.x + this.attackDir.x * a.offset,
      y: this.y - CHEST + this.attackDir.y * a.offset * 0.8,
      radius: a.radius,
    };
  }

  checkHit(circle) {
    if (this.hitPlayerThisAttack) return;
    const p = this.getPlayer();
    if (findHits(circle, [p]).length === 0) return;
    const result = p.receiveHit(this.attack.damage, this.x, this.y - CHEST);
    if (result !== 'ignored') this.hitPlayerThisAttack = true; // 회피했어도 이번 공격은 끝
  }

  enter(state) {
    this.state = state;
    const a = this.attack;
    switch (state) {
      case State.ROAR: this.stateTime = this.data_.roarMs; break;
      case State.WINDUP:
        this.windupTotal = a.windupMs * this.currentPhase().windupMultiplier;
        this.stateTime = this.windupTotal;
        break;
      case State.ACTIVE: this.stateTime = a.activeMs; break;
      case State.RECOVERY: this.stateTime = a.recoveryMs; break;
      default: this.stateTime = 0;
    }
    this.applyTint();
  }

  die() {
    this.state = State.DEAD;
    this.status.clear();
    this.setVelocity(0, 0);
    this.body.enable = false;
    this.telegraph.clear();
    this.visual.clearTint().setTint(0x555555);
    this.scene.tweens.add({ targets: this.visual, alpha: 0.35, angle: this.facing.x < 0 ? -80 : 80, duration: 600, ease: 'Quad.out' });
    this.scene.cameras.main.shake(500, 0.008);
    this.onDefeated(this);

    if (this.data_.respawnMs) {
      this.scene.time.delayedCall(this.data_.respawnMs, () => {
        this.body.enable = true;
        this.body.reset(this.home.x, this.home.y);
        this.visual.setAlpha(1).setAngle(0);
        this.stats.reset();
        this.awareness = Awareness.UNAWARE;
        this.enter(State.IDLE);
      });
    }
  }

  face(dir) {
    this.facing = dir;
  }

  // ---------- 겉모습 ----------
  applyTint() {
    const v = this.visual;
    v.clearTint();
    if (this.state === State.WINDUP) v.setTint(0xffa080);
    else if (this.state === State.RECOVERY) v.setTint(0xb0b8c0); // 빈틈: 살짝 창백
    else if (this.currentPhase().name) v.setTint(0xffc8b8);   // 분노 단계
  }

  syncVisual() {
    applyYSort(this);
    const v = this.visual;
    v.setPosition(this.x, this.y).setDepth(this.depth);
    if (this.state !== State.DEAD && this.facing.x !== 0) v.setFlipX(this.facing.x < 0);

    // 몸 연출: 예고 동작 중 웅크렸다가, 공격 때 펴짐
    let sy = 1;
    if (this.state === State.WINDUP) sy = 1 - 0.12 * (1 - this.stateTime / this.windupTotal);
    else if (this.state === State.ACTIVE) sy = 1.08;
    else if (this.state === State.ROAR) sy = 1.05 + Math.sin(this.stateTime / 40) * 0.04;
    if (this.state !== State.DEAD) v.setScale(1 / Math.sqrt(sy), sy);

    this.drawTelegraph();
    this.drawSmallHpBar();
  }

  /** 바닥의 위험 범위 표시: 예고 동작 중 점점 진해지고, 판정 순간 번쩍 */
  drawTelegraph() {
    const g = this.telegraph;
    g.clear();
    if (this.state !== State.WINDUP && this.state !== State.ACTIVE) return;
    const a = this.attack;
    const t = this.state === State.WINDUP ? 1 - this.stateTime / this.windupTotal : 1;
    const alpha = this.state === State.ACTIVE ? 0.55 : 0.12 + 0.3 * t;
    g.setDepth(-0.5); // 바닥 바로 위 (모든 물체보다 뒤)

    if (a.type === 'charge') {
      const len = (a.speed * a.activeMs) / 1000;
      const d = this.attackDir, px = -d.y, py = d.x, w = a.width / 2;
      const x0 = this.x, y0 = this.y - 4;
      const pts = [
        { x: x0 + px * w, y: y0 + py * w },
        { x: x0 + d.x * len + px * w, y: y0 + d.y * len + py * w },
        { x: x0 + d.x * len - px * w, y: y0 + d.y * len - py * w },
        { x: x0 - px * w, y: y0 - py * w },
      ];
      g.fillStyle(0xd03020, alpha).fillPoints(pts, true);
      g.lineStyle(1, 0xff6040, 0.6).strokePoints(pts, true);
    } else {
      const c = this.circleArea(a);
      const groundY = c.y + CHEST * 0.6; // 바닥에 그려지도록 살짝 아래로
      g.fillStyle(0xd03020, alpha).fillEllipse(c.x, groundY, c.radius * 2, c.radius * 1.4);
      g.lineStyle(1, 0xff6040, 0.7).strokeEllipse(c.x, groundY, c.radius * 2, c.radius * 1.4);
      // 진행 정도를 보여 주는 안쪽 원 (다 차면 공격)
      g.fillStyle(0xff5030, alpha * 0.8).fillEllipse(c.x, groundY, c.radius * 2 * t, c.radius * 1.4 * t);
    }
  }

  drawSmallHpBar() {
    const g = this.hpBarSmall;
    g.clear();
    if (this.state === State.DEAD || this.awareness === Awareness.UNAWARE) return;
    g.setDepth(this.depth + 1);
    const w = 40, x = this.x - w / 2, y = this.y - this.data_.hurtbox.height - 10;
    g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, 5);
    g.fillStyle(0xb23a2e).fillRect(x, y, w * (this.stats.hp / this.stats.maxHp), 3);
  }
}
