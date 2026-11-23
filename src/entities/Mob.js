import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { findHits } from '../systems/Combat.js';
import { spawnFloatingLabel } from '../systems/Effects.js';
import { StatusEffects } from '../systems/StatusEffects.js';
import { AwarenessMeter, Level } from '../systems/Stealth.js';

const State = {
  IDLE: 'idle',               // 집 근처 어슬렁 (모름)
  INVESTIGATE: 'investigate', // 소리·흔적 확인하러 감 (의심)
  CHASE: 'chase',             // 추격 (발견)
  WINDUP: 'windup',
  ACTIVE: 'active',
  RECOVERY: 'recovery',
  HURT: 'hurt',
  RETURN: 'return',           // 포기하고 집으로
  STAGGER: 'stagger',         // 완벽한 회피를 당해 휘청 (?!)
  DEAD: 'dead',
};

const CHEST = 8;

/**
 * 잡몹(소형 몬스터). 수치는 data/monsters.json (ai: "mob").
 * 플레이어와 같은 충돌 판정(발밑 박스, 서로 밀어냄). 시야·청각으로 플레이어를 알아챈다.
 * Godot: Mob.tscn = CharacterBody2D + Sprite2D + Hurtbox + Perception + 상태 머신.
 */
export class Mob extends window.Phaser.Physics.Arcade.Sprite {
  /** @param {(mob: Mob) => void} onDefeated */
  constructor(scene, x, y, id, data, onDefeated) {
    super(scene, x, y, data.texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setVisible(false);

    this.id = id;
    this.data_ = data;
    this.onDefeated = onDefeated;
    this.stats = new Stats(data);
    this.status = new StatusEffects(this);
    this.meter = new AwarenessMeter(data.perception);
    this.home = { x, y };

    const f = data.feetCollider;
    this.setOrigin(0.5, 1);
    this.body.setSize(f.width, f.height, false);
    this.body.setOffset((this.width - f.width) / 2, this.height - f.height);
    this.setCollideWorldBounds(true);

    this.visual = scene.add.image(x, y, data.texture).setOrigin(0.5, 1);
    this.icon = scene.add.text(x, y, '', { fontFamily: 'sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#ffe060', resolution: 2 })
      .setOrigin(0.5, 1).setStroke('#1b1410', 3);
    this.gfx = scene.add.graphics(); // 경계 막대, 시야 부채꼴, 공격 예고

    this.state = State.IDLE;
    this.stateTime = 0;
    this.facing = { x: Math.random() < 0.5 ? -1 : 1, y: 0 };
    this.target = null;   // 이동 목표 (어슬렁·수색·귀가)
    this.cooldown = 0;
    this.notSeenMs = 0;
    this.attackDir = { x: 1, y: 0 };
    this.hitPlayer = false;
    this.knock = { x: 0, y: 0, speed: 0 };
    this.wanderTimer = 1000 + Math.random() * 2000;

    applyYSort(this);
  }

  // ---------- 인터페이스 (Monster·Boss와 같음) ----------
  get isHittable() { return this.state !== State.DEAD; }
  get isDeadState() { return this.state === State.DEAD; }
  get awareness() { return this.meter.level; }

  getHurtbox() {
    const h = this.data_.hurtbox;
    return { x: this.x - h.width / 2, y: this.y - h.height, width: h.width, height: h.height };
  }

  /** 플레이어 공격 등으로 피해. @returns {number} 실제 피해 */
  takeDamage(amount, opts = {}) {
    if (this.state === State.DEAD) return 0;
    let dealt = amount;
    if (this.meter.level !== Level.ALERT && !opts.fromStatus) {
      dealt = Math.round(amount * this.data_.sneakAttackMultiplier);
      spawnFloatingLabel(this.scene, this.x, this.y - 28, '기습!');
    }
    this.stats.takeDamage(dealt);
    this.visual.setTintFill(opts.fromStatus ? 0x9adf5a : 0xffffff);
    this.scene.time.delayedCall(70, () => this.visual.clearTint());

    if (this.stats.isDead) { this.die(); return dealt; }
    if (!opts.fromStatus) {
      this.alert(true);
      if (opts.fromX !== undefined) this.knockFrom(opts.fromX, opts.fromY, this.data_.knockbackSpeed);
    }
    return dealt;
  }

  /** 보스 돌진 등 다른 몬스터에게 맞음: 피해 + 크게 밀려남 */
  receiveHit(damage, fromX, fromY, knockbackSpeed) {
    if (this.state === State.DEAD) return;
    this.stats.takeDamage(damage);
    this.visual.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.visual.clearTint());
    if (this.stats.isDead) { this.die(); return; }
    this.knockFrom(fromX, fromY, knockbackSpeed);
  }

  knockFrom(fromX, fromY, speed) {
    const dx = this.x - fromX, dy = this.y - fromY, d = Math.hypot(dx, dy) || 1;
    this.knock = { x: dx / d, y: dy / d, speed };
    this.enter(State.HURT);
  }

  /** 발견 상태로. pack이면 다음 프레임에 근처 무리도 같이 깨운다 */
  alert(pack) {
    const wasAlert = this.meter.level === Level.ALERT;
    this.meter.value = 1;
    this.notSeenMs = 0;
    if (!wasAlert && (this.state === State.IDLE || this.state === State.INVESTIGATE || this.state === State.RETURN)) {
      this.enter(State.CHASE);
    }
    if (pack && !wasAlert) this.pendingPackAlert = true;
  }

  // ---------- 매 프레임 ----------
  /** @param {{player, env, noises, mobs, stealth, showCones:boolean}} ctx */
  update(dt, ctx) {
    if (this.state === State.DEAD) { this.syncVisual(ctx); return; }
    this.status.update(dt);
    if (this.state === State.DEAD) return;
    this.stateTime -= dt;
    this.cooldown -= dt;

    const p = ctx.player;
    const before = this.meter.level;
    const { heard } = this.meter.update(dt, this, p, ctx.env, ctx.noises, ctx.stealth);
    const level = this.meter.level;
    if (this.pendingPackAlert || (level === Level.ALERT && before !== Level.ALERT)) {
      this.pendingPackAlert = false;
      for (const m of ctx.mobs) {
        if (m !== this && m.isHittable && Math.hypot(m.x - this.x, m.y - this.y) < this.data_.packAlertRadius) m.alert(false);
      }
    }

    const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy) || 1;
    const toPlayer = { x: dx / dist, y: dy / dist };

    switch (this.state) {
      case State.IDLE:
      case State.RETURN:
      case State.INVESTIGATE: {
        if (level === Level.ALERT && !p.isDead) { this.enter(State.CHASE); break; }
        if (level === Level.SUSPICIOUS) {
          // 들은 곳 > 지금 보이는 곳 > (처음 의심할 때) 마지막 흔적
          const spot = heard ?? (this.meter.seeing ? this.meter.lastSeen : null)
            ?? (this.state !== State.INVESTIGATE ? (this.meter.lastSeen ?? this.meter.lastHeard) : null);
          if (spot) {
            this.target = spot;
            if (this.state !== State.INVESTIGATE) this.enter(State.INVESTIGATE);
            else { this.stateTime = 0; this.lookStep = 0; }
          }
        }
        this.updateCalm(dt);
        break;
      }
      case State.CHASE: {
        if (p.isDead || Math.hypot(this.x - this.home.x, this.y - this.home.y) > this.data_.leashRadius) { this.giveUp(); break; }
        this.notSeenMs = this.meter.seeing ? 0 : this.notSeenMs + dt;
        if (this.notSeenMs > this.data_.loseSightMs) {
          // 놓침 → 마지막 본 곳을 수색 (의심)
          this.meter.value = 0.6;
          this.target = this.meter.lastSeen;
          this.enter(State.INVESTIGATE);
          break;
        }
        this.face(toPlayer);
        const a = this.data_.attack;
        if (dist <= a.range && this.cooldown <= 0) {
          this.attackDir = toPlayer;
          this.hitPlayer = false;
          this.enter(State.WINDUP);
          break;
        }
        this.moveToward(p.x, p.y, this.data_.speed, 12);
        break;
      }
      case State.WINDUP:
        this.setVelocity(0, 0);
        if (this.stateTime <= 0) this.enter(State.ACTIVE);
        break;
      case State.ACTIVE: {
        const a = this.data_.attack;
        this.setVelocity(this.attackDir.x * a.lungeSpeed, this.attackDir.y * a.lungeSpeed);
        if (!this.hitPlayer) {
          const c = { x: this.x + this.attackDir.x * 12, y: this.y - CHEST + this.attackDir.y * 8, radius: a.radius };
          if (findHits(c, [p]).length) {
            const r = p.receiveHit(a.damage, this.x, this.y - CHEST, { knockdown: !!a.knockdown, source: this });
            if (r !== 'ignored') this.hitPlayer = true;
          }
        }
        if (this.stateTime <= 0) this.enter(State.RECOVERY);
        break;
      }
      case State.RECOVERY:
        this.setVelocity(0, 0);
        if (this.stateTime <= 0) { this.cooldown = this.data_.attack.cooldownMs; this.enter(State.CHASE); }
        break;
      case State.STAGGER:
        this.setVelocity(0, 0);
        if (this.stateTime <= 0) { this.cooldown = this.data_.attack.cooldownMs; this.enter(State.CHASE); }
        break;
      case State.HURT: {
        const k = Math.max(0, this.stateTime / this.data_.hurtMs) * this.knock.speed;
        this.setVelocity(this.knock.x * k, this.knock.y * k);
        if (this.stateTime <= 0) this.enter(this.meter.level === Level.ALERT ? State.CHASE : State.INVESTIGATE);
        break;
      }
    }

    this.syncVisual(ctx);
  }

  /** 어슬렁·수색·귀가 이동 */
  updateCalm(dt) {
    if (this.state === State.INVESTIGATE) {
      if (!this.target || this.moveToward(this.target.x, this.target.y, this.data_.wanderSpeed * 1.6, 8)) {
        // 도착: 0.6초마다 두리번(방향 바꾸기), 2초 지나거나 의심이 풀리면 귀가
        this.setVelocity(0, 0);
        const t = -this.stateTime; // 도착 후 지난 시간 (stateTime은 매 프레임 줄어듦)
        const step = Math.floor(t / 600);
        if (step !== this.lookStep) { this.lookStep = step; if (step > 0) this.face({ x: -this.facing.x, y: -this.facing.y * 0.5 }); }
        if (t > 2000 || this.meter.level === Level.UNAWARE) this.giveUp();
      } else {
        this.stateTime = 0;
        this.lookStep = 0;
      }
      return;
    }
    if (this.state === State.RETURN) {
      if (this.moveToward(this.home.x, this.home.y, this.data_.wanderSpeed * 1.4, 6)) this.enter(State.IDLE);
      return;
    }
    // IDLE: 가끔 집 근처 아무 곳으로 어슬렁
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.data_.wanderRadius;
      this.target = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r };
      this.wanderTimer = 2500 + Math.random() * 3000;
    }
    if (this.target && this.moveToward(this.target.x, this.target.y, this.data_.wanderSpeed, 5)) this.target = null;
    if (!this.target) this.setVelocity(0, 0);
    // 벽에 막혀 못 가면 목표 포기
    if (!this.body.blocked.none) this.target = null;
  }

  /** 목표로 이동. 도착하면 true */
  moveToward(x, y, speed, arriveDist) {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d <= arriveDist) { this.setVelocity(0, 0); return true; }
    this.face({ x: dx / d, y: dy / d });
    this.setVelocity((dx / d) * speed, (dy / d) * speed);
    return false;
  }

  giveUp() {
    this.target = null;
    this.enter(State.RETURN);
  }

  face(dir) {
    this.facing = { x: dir.x, y: dir.y };
  }

  /** 완벽한 회피를 당함: 공격을 끊고 잠깐 휘청 (?!) */
  stagger(ms = this.data_.staggerMs ?? 700) {
    if (this.state === State.DEAD) return;
    this.enter(State.STAGGER);
    this.stateTime = ms;
  }

  enter(state) {
    this.state = state;
    const a = this.data_.attack;
    switch (state) {
      case State.WINDUP: this.stateTime = a.windupMs; break;
      case State.ACTIVE: this.stateTime = a.activeMs; break;
      case State.RECOVERY: this.stateTime = a.recoveryMs; break;
      case State.HURT: this.stateTime = this.data_.hurtMs; break;
      default: this.stateTime = 0;
    }
  }

  die() {
    this.state = State.DEAD;
    this.status.clear();
    this.setVelocity(0, 0);
    this.body.enable = false;
    this.gfx.clear();
    this.icon.setText('');
    this.visual.setTint(0x555555);
    this.scene.tweens.add({ targets: this.visual, alpha: 0, angle: this.facing.x < 0 ? -90 : 90, duration: 700, delay: 300 });
    this.onDefeated(this);
    if (this.data_.respawnMs) {
      this.respawnTimer = this.scene.time.delayedCall(this.data_.respawnMs, () => this.revive());
    }
  }

  revive() {
    this.respawnTimer?.remove();
    this.scene.tweens.killTweensOf(this.visual);
    this.body.enable = true;
    this.body.reset(this.home.x, this.home.y);
    this.visual.setAlpha(1).setAngle(0).clearTint();
    this.stats.reset();
    this.meter.reset();
    this.enter(State.IDLE);
  }

  /** 경계 해제 (플레이어가 쓰러졌을 때 등) */
  calmDown() {
    if (this.state === State.DEAD) return;
    this.meter.reset();
    this.giveUp();
  }

  // ---------- 겉모습 ----------
  syncVisual(ctx) {
    applyYSort(this);
    const v = this.visual;
    v.setPosition(this.x, this.y).setDepth(this.depth);
    if (this.state === State.DEAD) return;
    if (Math.abs(this.facing.x) > 0.2) v.setFlipX(this.facing.x < 0);
    v.setScale(1, this.state === State.WINDUP ? 0.85 : this.state === State.ACTIVE ? 1.08 : 1);
    if (this.state === State.WINDUP) v.setTint(0xffa080);
    else if (this.state !== State.HURT) v.clearTint();

    // 머리 위 표시: ? (의심) / ! (발견)
    const level = this.meter.level;
    const top = this.y - this.data_.hurtbox.height - 4;
    this.icon.setPosition(this.x, top).setDepth(this.depth + 2)
      .setText(this.state === State.STAGGER ? '?!' : level === Level.ALERT ? '!' : level === Level.SUSPICIOUS ? '?' : '')
      .setColor(this.state === State.STAGGER ? '#9fdcff' : level === Level.ALERT ? '#ff6040' : '#ffe060');

    const g = this.gfx;
    g.clear();
    // 경계 막대 (차오르는 중일 때만)
    if (level !== Level.ALERT && this.meter.value > 0.02) {
      g.setDepth(this.depth + 1);
      g.fillStyle(0x000000, 0.6).fillRect(this.x - 10, top - 14, 20, 3);
      g.fillStyle(level === Level.SUSPICIOUS ? 0xffe060 : 0xc8c8c8).fillRect(this.x - 10, top - 14, 20 * this.meter.value, 3);
    }
    // 공격 예고: 물어뜯을 자리
    if (this.state === State.WINDUP) {
      const a = this.data_.attack;
      g.fillStyle(0xd03020, 0.35).fillEllipse(this.x + this.attackDir.x * 16, this.y + this.attackDir.y * 10 - 2, a.radius * 2.2, a.radius * 1.5);
    }
    // 웅크리는 동안: 시야 부채꼴을 희미하게 보여 줌 (몰래 다니기 쉬우라고)
    if (ctx?.showCones && level !== Level.ALERT) {
      const pr = this.data_.perception;
      const range = pr.visionRange * (ctx.env.isDark(this.x, this.y) ? ctx.stealth.darkVisionMultiplier : 1);
      const ang = Math.atan2(this.facing.y, this.facing.x), half = (pr.visionAngleDeg / 2) * Math.PI / 180;
      const gc = ctx.coneGfx;
      gc.fillStyle(level === Level.SUSPICIOUS ? 0xffd040 : 0xffffff, 0.07);
      gc.slice(this.x, this.y - 4, range, ang - half, ang + half, false).fillPath();
    }
  }
}
