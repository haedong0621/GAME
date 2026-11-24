import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { findHits, groundShapeContains, groundShapePoints, GROUND_SQUASH } from '../systems/Combat.js';
import { DEBUG } from '../config.js';
import { spawnFloatingLabel } from '../systems/Effects.js';
import { StatusEffects } from '../systems/StatusEffects.js';
import { AwarenessMeter, Level } from '../systems/Stealth.js';
import { MonsterSprite } from '../systems/MonsterSprite.js';

/** 보스 행동 상태 (Godot: enum State) */
const State = {
  IDLE: 'idle',         // 제자리 (경계: 모름)
  ROAR: 'roar',         // 발견 직후 포효 (경계: 발견)
  CHASE: 'chase',       // 쫓아감
  WINDUP: 'windup',     // 공격 예고 동작 — 바닥에 위험 범위 표시
  ACTIVE: 'active',     // 공격 판정
  RECOVERY: 'recovery', // 공격 후 빈틈 — 때릴 기회
  RETURN: 'return',     // 놓쳐서 집으로 돌아감 (경계: 의심)
  STAGGER: 'stagger',   // 완벽한 회피를 당해 휘청 (?!) — 큰 빈틈
  DEAD: 'dead',
};

/**
 * 경계 단계 (스닉 시스템 대비). 지금은 거리만 보고 판단하지만,
 * 시야(부채꼴)·소리·풀숲/어둠 판정은 systems/Stealth.js의 AwarenessMeter가 한다 (updateSenses).
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
    if (data.startHpRatio) this.stats.hp = Math.round(this.stats.maxHp * data.startHpRatio); // 이미 다친 채로 등장 (프롤로그 멧돼지)
    this.status = new StatusEffects(this);
    this.meter = new AwarenessMeter(data.perception); // 시야·청각 (스닉 시스템)
    this.home = { x, y };

    const f = data.feetCollider;
    this.setOrigin(0.5, 1);
    this.body.setSize(f.width, f.height, false);
    this.body.setOffset((this.width - f.width) / 2, this.height - f.height);
    this.body.setImmovable(true);
    this.setCollideWorldBounds(true);

    this.visual = scene.add.image(x, y, data.texture).setOrigin(0.5, 1);
    const monPx = scene.registry.get('monPx');
    /** 도트 시트 (없으면 임시 그래픽) */
    this.sprite = data.pixelKind && monPx?.kinds[data.pixelKind] ? new MonsterSprite(this.visual, monPx, data.pixelKind) : null;
    this.animClock = 0;
    this.telegraph = scene.add.graphics();
    this.hpBarSmall = scene.add.graphics();
    this.icon = scene.add.text(x, y, '', { fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ffe060', resolution: 2 })
      .setOrigin(0.5, 1).setStroke('#1b1410', 3);

    this.state = State.IDLE;
    this.awareness = Awareness.UNAWARE;
    this.stateTime = 0;
    this.cooldown = 0;
    this.facing = { x: -1, y: 0 };
    this.attack = null;
    this.attackDir = { x: -1, y: 0 };
    this.hitPlayerThisAttack = false;
    /** 공격별 개별 쿨타임 (울부짖기처럼 자주 쓰면 안 되는 기술) */
    this.attackCd = {};
    /** 울부짖어 불러낸 들개들 */
    this.summons = [];
    /** 도약 중 공중 높이 (그림만 위로) */
    this.airZ = 0;

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
    if (this.data_.invulnerable) {
      // 이길 수 없는 적 (강제 패배 연출): 맞아도 꿈쩍 않음
      spawnFloatingLabel(this.scene, this.x + (Math.random() - 0.5) * 20, this.y - this.data_.hurtbox.height - 10, '……');
      this.visual.setTintFill(0xffffff);
      this.scene.time.delayedCall(50, () => { if (this.state !== State.DEAD) this.applyTint(); });
      if (this.awareness !== Awareness.ALERT) this.becomeAlert(false);
      return 0;
    }
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
  /** @param {{player, env, noises, mobs, stealth}} ctx */
  update(dt, ctx) {
    this.ctx = ctx;
    this.dt = dt;
    if (this.state === State.DEAD) { this.syncVisual(); return; }
    this.status.update(dt);
    if (this.state === State.DEAD) return; // 독으로 쓰러졌을 수 있음
    this.stateTime -= dt;
    this.cooldown -= dt;
    for (const k in this.attackCd) this.attackCd[k] -= dt;

    const p = this.getPlayer();
    const dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 1 };
    const phase = this.currentPhase();

    switch (this.state) {
      case State.IDLE:
        this.setVelocity(0, 0);
        this.updateSenses(dt, ctx);
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
        if ((a.type === 'charge' || a.type === 'leap') && t < (a.aimLockAt ?? 0)) {
          this.attackDir = toPlayer; this.face(toPlayer);
          if (a.type === 'leap') {
            const d = Math.min(dist, a.maxRange);
            this.leapTarget = { x: this.x + toPlayer.x * d, y: this.y + toPlayer.y * d };
          }
        }
        if (this.stateTime <= 0) this.enter(State.ACTIVE);
        break;
      }

      case State.ACTIVE: {
        const a = this.attack;
        if (a.type === 'combo') { this.updateCombo(dt, p); break; }
        if (a.type === 'leap') { this.updateLeap(); break; }
        if (a.type === 'summon') { this.setVelocity(0, 0); if (this.stateTime <= 0) this.enter(State.RECOVERY); break; }
        if (a.type === 'charge') {
          this.setVelocity(this.attackDir.x * a.speed, this.attackDir.y * a.speed);
          this.checkHit({ kind: 'ellipse', x: this.x, y: this.y, r: a.width / 2, sq: 1 }); // 지나가는 몸 (경로 직사각형 폭과 같음)
          this.chaseThroughMobs(ctx, a);
          if (!this.body.blocked.none) this.stateTime = 0; // 나무 등에 부딪히면 멈춤
        } else {
          const lunge = this.stateTime > a.activeMs / 2 ? a.lunge : 0;
          this.setVelocity(this.attackDir.x * lunge, this.attackDir.y * lunge);
          this.checkHit(this.groundShape(a));
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

      case State.STAGGER:
        this.setVelocity(0, 0);
        if (this.stateTime <= 0) { this.cooldown = this.data_.attackCooldownMs; this.enter(State.CHASE); }
        break;

      case State.RETURN: {
        if (this.updateSenses(dt, ctx)) break;
        const hx = this.home.x - this.x, hy = this.home.y - this.y;
        const hd = Math.hypot(hx, hy);
        if (hd < 6) {
          this.stats.reset();
          this.meter.reset();
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

  /**
   * 시야·청각으로 경계 수치를 갱신. 발견하면 포효(true 반환), 의심이면 그쪽을 돌아본다.
   */
  updateSenses(dt, ctx) {
    const { heard } = this.meter.update(dt, this, ctx.player, ctx.env, ctx.noises, ctx.stealth);
    const level = this.meter.level;
    if (level === Level.ALERT && !ctx.player.isDead) { this.becomeAlert(true); return true; }
    if (level === Level.SUSPICIOUS) {
      this.awareness = Awareness.SUSPICIOUS;
      const spot = heard ?? (this.meter.seeing ? this.meter.lastSeen : null);
      if (spot) {
        const dx = spot.x - this.x, dy = spot.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.face({ x: dx / d, y: dy / d });
      }
    } else if (this.state === State.IDLE) {
      this.awareness = Awareness.UNAWARE;
    }
    return false;
  }

  /** 중형 보스 규칙: 돌진 중 잡몹과 부딪히면 치면서 밀어내고 돌진 계속 */
  chaseThroughMobs(ctx, a) {
    const c = { x: this.x, y: this.y - CHEST, radius: a.width / 2 + 4 };
    for (const m of findHits(c, ctx.mobs)) {
      if (this.mobsHitThisCharge.has(m)) continue;
      this.mobsHitThisCharge.add(m);
      m.receiveHit(this.data_.mobChargeDamage ?? 20, this.x, this.y, 340);
    }
  }

  becomeAlert(roar) {
    this.awareness = Awareness.ALERT;
    this.meter.value = 1;
    if (roar) {
      this.enter(State.ROAR);
      this.scene.cameras.main.shake(400, 0.004);
    } else if (this.state === State.IDLE || this.state === State.RETURN) {
      this.enter(State.CHASE);
    }
  }

  loseTrack() {
    this.awareness = Awareness.SUSPICIOUS;
    this.meter.value = 0.5;
    this.enter(State.RETURN);
  }

  /** 플레이어가 쓰러졌을 때 등: 집으로 즉시 돌려보내고 초기화 (몬스터 헌터의 "수레" 후 상황) */
  resetToHome() {
    if (this.state === State.DEAD) return;
    this.status.clear();
    this.body.reset(this.home.x, this.home.y);
    this.stats.reset();
    this.awareness = Awareness.UNAWARE;
    this.meter.reset();
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
    const options = this.data_.attacks.filter((a) => dist >= a.minRange && dist <= a.maxRange
      && !((this.attackCd[a.id] ?? 0) > 0)
      && !(a.type === 'summon' && this.summons.filter((m) => m.isHittable).length >= (a.maxAlive ?? 3)));
    if (options.length === 0) return null;
    let r = Math.random() * options.reduce((s, a) => s + a.weight, 0);
    for (const a of options) { r -= a.weight; if (r <= 0) return a; }
    return options[options.length - 1];
  }

  startAttack(atk, dir) {
    this.attack = atk;
    if (atk.cooldownMs) this.attackCd[atk.id] = atk.cooldownMs;
    if (atk.type === 'leap') this.leapTarget = { x: this.x + dir.x * 120, y: this.y + dir.y * 120 };
    this.attackDir = { ...dir };
    this.hitPlayerThisAttack = false;
    this.mobsHitThisCharge = new Set();
    this.mobsHit = new Set();
    this.enter(State.WINDUP);
    this.ctx?.onTelegraph?.(this, atk); // 공격 예고 시작 (프롤로그 회피 안내 등)
  }

  /**
   * 공격 범위 (바닥 모양). 그리기와 판정이 이 값을 같이 쓴다.
   * shape: "fan"(부채꼴: reach 길이, arcDeg 각도, 보스 발밑에서) | 기본 원(offset만큼 앞, radius)
   */
  groundShape(a) {
    const d = this.attackDir;
    if (a.shape === 'fan') {
      return { kind: 'fan', x: this.x, y: this.y, r: a.reach, angle: Math.atan2(d.y / GROUND_SQUASH, d.x), half: (a.arcDeg / 2) * Math.PI / 180 };
    }
    return { kind: 'ellipse', x: this.x + d.x * a.offset, y: this.y + d.y * a.offset * GROUND_SQUASH, r: a.radius };
  }

  /** 돌진 경로 (보스 발밑에서 공격 방향으로 속도×시간) */
  chargeShape(a) {
    const d = this.attackDir;
    const o = this.state === State.ACTIVE && this.chargeFrom ? this.chargeFrom : this;
    return { kind: 'rect', x: o.x, y: o.y, dx: d.x, dy: d.y, len: (a.speed * a.activeMs) / 1000, w: a.width / 2 };
  }

  /**
   * 범위 안의 잡몹도 맞는다 (같은 발밑 기준). 자기가 불러낸 들개도 예외 없음 → 보스 공격 쪽으로 잡몹을 끌고 가 정리시키는 전략.
   * 한 번의 공격(연속 베기는 한 타)마다 같은 잡몹은 한 번만.
   */
  hitMobsIn(shape, spec) {
    for (const m of this.ctx?.mobs ?? []) {
      if (!m.isHittable || this.mobsHit.has(m) || !groundShapeContains(shape, m.x, m.y)) continue;
      this.mobsHit.add(m);
      m.receiveHit(spec.mobDamage ?? spec.damage, this.x, this.y, spec.knockdown ? 340 : 240);
    }
  }

  /** 플레이어 발밑이 바닥 범위 안이면 맞음 */
  checkHit(shape, spec = this.attack) {
    this.lastHitShape = shape;
    if (spec.type !== 'charge') this.hitMobsIn(shape, spec); // 돌진은 chaseThroughMobs가 따로 처리
    if (this.hitPlayerThisAttack) return;
    const p = this.getPlayer();
    if (p.isDead || !groundShapeContains(shape, p.x, p.y)) return;
    const dmg = Math.round(spec.damage * (this.scene.monsterDamageMultiplier?.() ?? 1)); // 밤엔 더 사나움
    const result = p.receiveHit(dmg, this.x, this.y - CHEST, { knockdown: !!spec.knockdown, source: this });
    if (result !== 'ignored') this.hitPlayerThisAttack = true; // 회피했어도 이번 공격은 끝
  }

  /**
   * 연속 베기(type: combo): hits 목록을 차례로. 각 타는 gapMs(다음 타 예고 — 그 사이 플레이어 쪽으로 다시 조준) 후 activeMs 동안 판정.
   * 한 타를 피해도 다음 타가 따라온다 → 구르기 타이밍을 여러 번 맞춰야 함.
   */
  startComboHit(i) {
    this.comboIdx = i;
    this.curHit = this.attack.hits[i];
    this.comboGap = this.curHit.gapMs;
    this.comboActive = this.curHit.activeMs;
    this.hitPlayerThisAttack = false;
    this.mobsHit = new Set();
  }

  updateCombo(dt, p) {
    const h = this.curHit;
    if (this.comboGap > 0) {
      this.comboGap -= dt;
      this.setVelocity(0, 0);
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (this.comboGap > h.gapMs * 0.4) { this.attackDir = { x: dx / d, y: dy / d }; this.face(this.attackDir); } // 앞쪽 60% 동안만 따라 돌아봄
      return;
    }
    this.comboActive -= dt;
    const lunge = this.comboActive > h.activeMs / 2 ? h.lunge : 0;
    this.setVelocity(this.attackDir.x * lunge, this.attackDir.y * lunge);
    this.checkHit(this.groundShape(h), h);
    if (this.comboActive > 0) return;
    if (this.comboIdx + 1 < this.attack.hits.length) this.startComboHit(this.comboIdx + 1);
    else this.enter(State.RECOVERY);
  }

  /** 도약 덮치기(type: leap): 정해 둔 착지점으로 날아감 (나무·물 위로 넘어감), 착지 순간 원형 판정 + 넘어뜨림 */
  updateLeap() {
    const a = this.attack;
    const t = 1 - Math.max(0, this.stateTime) / a.activeMs;
    const tx = this.leapFrom.x + (this.leapTarget.x - this.leapFrom.x) * t;
    const ty = this.leapFrom.y + (this.leapTarget.y - this.leapFrom.y) * t;
    this.body.reset(tx, ty);
    this.airZ = a.height * 4 * t * (1 - t);
    if (this.stateTime > 0) return;
    this.airZ = 0;
    this.scene.cameras.main.shake(220, 0.008);
    this.checkHit({ kind: 'ellipse', x: this.leapTarget.x, y: this.leapTarget.y, r: a.radius });
    this.enter(State.RECOVERY);
  }

  /** 울부짖기(type: summon): 주변에 들개를 불러낸다. 불러낸 들개는 바로 플레이어를 쫓는다 */
  doSummon() {
    const a = this.attack;
    this.scene.cameras.main.shake(500, 0.005);
    spawnFloatingLabel(this.scene, this.x, this.y - this.data_.hurtbox.height - 18, '아우우우—');
    const alive = this.summons.filter((m) => m.isHittable).length;
    const n = Math.min(a.count, (a.maxAlive ?? 3) - alive);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const m = this.ctx?.summon?.(a.summonId, this.x + Math.cos(ang) * 70, this.y + Math.sin(ang) * 50);
      if (m) this.summons.push(m);
    }
    this.summons = this.summons.filter((m) => m.isHittable);
  }

  /** 완벽한 회피를 당함: 하던 공격을 끊고 잠깐 휘청 (?!) */
  stagger(ms = this.data_.staggerMs ?? 800) {
    if (this.state === State.DEAD) return;
    this.enter(State.STAGGER);
    this.stateTime = ms;
    this.telegraph.clear();
  }

  enter(state) {
    // 도약 중이었다면 착지 처리 (휘청 등으로 끊겨도 충돌을 되돌림)
    if (this.leaping) { this.leaping = false; this.airZ = 0; this.body.checkCollision.none = false; }
    this.state = state;
    const a = this.attack;
    switch (state) {
      case State.ROAR: this.stateTime = this.data_.roarMs; break;
      case State.WINDUP:
        this.windupTotal = a.windupMs * this.currentPhase().windupMultiplier;
        this.stateTime = this.windupTotal;
        break;
      case State.ACTIVE:
        this.stateTime = a.activeMs ?? 0;
        if (a.type === 'combo') this.startComboHit(0);
        if (a.type === 'charge') this.chargeFrom = { x: this.x, y: this.y };
        if (a.type === 'leap') { this.leaping = true; this.leapFrom = { x: this.x, y: this.y }; this.body.checkCollision.none = true; }
        if (a.type === 'summon') this.doSummon();
        break;
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
    if (this.sprite) { this.deathClock = 0; this.scene.tweens.add({ targets: this.visual, alpha: 0.55, delay: 500, duration: 600 }); }
    else this.scene.tweens.add({ targets: this.visual, alpha: 0.35, angle: this.facing.x < 0 ? -80 : 80, duration: 600, ease: 'Quad.out' });
    this.scene.cameras.main.shake(500, 0.008);
    this.onDefeated(this);

    if (this.data_.respawnMs) {
      this.respawnTimer = this.scene.clock.after(this.data_.respawnMs, () => this.revive()); // 게임 시계 기준 (자면 그만큼 지남)
    }
  }

  /** 다시 나타남 (집에서, 체력 가득, 경계 해제) */
  revive() {
    this.respawnTimer?.remove();
    this.respawnTimer = null;
    this.scene.tweens.killTweensOf(this.visual);
    this.body.enable = true;
    this.body.reset(this.home.x, this.home.y);
    this.visual.setAlpha(1).setAngle(0).clearTint();
    this.stats.reset();
    this.awareness = Awareness.UNAWARE;
    this.meter.reset();
    this.enter(State.IDLE);
  }

  get isDeadState() { return this.state === State.DEAD; }

  face(dir) {
    this.facing = dir;
  }

  // ---------- 겉모습 ----------
  applyTint() {
    const v = this.visual;
    v.clearTint();
    if (this.state === State.WINDUP) v.setTint(0xffa080);
    else if (this.state === State.RECOVERY || this.state === State.STAGGER) v.setTint(0xb0b8c0); // 빈틈: 살짝 창백
    else if (this.currentPhase().name) v.setTint(0xffc8b8);   // 분노 단계
  }

  syncVisual() {
    applyYSort(this);
    const v = this.visual;
    v.setPosition(this.x, this.y - this.airZ).setDepth(this.depth);
    if (this.sprite) {
      this.updatePixelFrame();
    } else {
      if (this.state !== State.DEAD && this.facing.x !== 0) v.setFlipX(this.facing.x < 0);
      // 몸 연출: 예고 동작 중 웅크렸다가, 공격 때 펴짐
      let sy = 1;
      if (this.state === State.WINDUP) sy = 1 - 0.12 * (1 - this.stateTime / this.windupTotal);
      else if (this.state === State.ACTIVE) sy = 1.08;
      else if (this.state === State.ROAR) sy = 1.05 + Math.sin(this.stateTime / 40) * 0.04;
      if (this.state !== State.DEAD) v.setScale(1 / Math.sqrt(sy), sy);
    }

    this.drawTelegraph();
    this.drawSmallHpBar();
    this.drawSenses();
  }

  /**
   * 바닥의 위험 범위 표시: 바깥 모양(= 실제 판정 범위) + 안쪽에서 차오르는 진행도(다 차면 공격). 판정 순간엔 번쩍.
   * 돌진은 직사각형이 보스 쪽에서 끝까지 차오르고, 방향이 고정되는 순간 테두리가 하얗게 번쩍, 화살표가 진행 방향을 가리킨다.
   */
  drawTelegraph() {
    const g = this.telegraph;
    g.clear();
    g.setDepth(-0.5); // 바닥 바로 위 (모든 물체보다 뒤)
    this.drawDebugHit(g);
    if (this.state !== State.WINDUP && this.state !== State.ACTIVE) return;
    const a = this.attack;
    if (a.type === 'summon') return;
    const t = this.state === State.WINDUP ? 1 - this.stateTime / this.windupTotal : 1;

    let shape, prog, hot;
    if (a.type === 'leap') {
      shape = { kind: 'ellipse', x: this.leapTarget?.x ?? this.x, y: this.leapTarget?.y ?? this.y, r: a.radius };
      prog = this.state === State.ACTIVE ? 1 - Math.max(0, this.stateTime) / a.activeMs : t * 0.6;
      hot = this.state === State.ACTIVE && this.stateTime < 90;
    } else if (a.type === 'combo') {
      // 지금(또는 다음) 타의 범위. 예고 중엔 첫 타, 타 사이엔 다음 타가 차오름
      const h = this.state === State.WINDUP ? a.hits[0] : this.curHit;
      const inGap = this.state === State.ACTIVE && this.comboGap > 0;
      shape = this.groundShape(h);
      prog = this.state === State.WINDUP ? t : inGap ? 1 - this.comboGap / h.gapMs : 1;
      hot = this.state === State.ACTIVE && !inGap;
    } else if (a.type === 'charge') {
      this.drawCharge(g, a, t);
      return;
    } else {
      shape = this.groundShape(a);
      prog = t;
      hot = this.state === State.ACTIVE;
    }
    const base = hot ? 0.55 : 0.14 + 0.22 * prog;
    g.fillStyle(0xd03020, base).fillPoints(groundShapePoints(shape), true);
    g.fillStyle(0xff5030, hot ? 0.35 : 0.3 + 0.25 * prog).fillPoints(groundShapePoints(shape, Math.max(0.02, prog)), true);
    g.lineStyle(hot ? 2 : 1, hot ? 0xffe0c0 : 0xff6040, 0.85).strokePoints(groundShapePoints(shape), true);
  }

  /** 돌진 예고: 경로가 보스 쪽에서부터 차오름 + 화살표 + 조준 고정 순간 번쩍 */
  drawCharge(g, a, t) {
    const shape = this.chargeShape(a);
    const active = this.state === State.ACTIVE;
    const lockT = a.aimLockAt ?? 0;
    const locked = active || t >= lockT;
    const flash = !active && t >= lockT && t < lockT + 0.08;
    g.fillStyle(0xd03020, active ? 0.4 : 0.2 + 0.15 * t).fillPoints(groundShapePoints(shape), true);
    g.fillStyle(0xff4020, active ? 0.35 : 0.5).fillPoints(groundShapePoints(shape, active ? 1 : Math.max(0.02, t)), true);
    g.lineStyle(flash ? 3 : 2, flash ? 0xffffff : locked ? 0xffc080 : 0xff6040, flash ? 1 : 0.9).strokePoints(groundShapePoints(shape), true);
    // 진행 방향 화살표 (안쪽에서 흐르듯 움직임)
    const d = { x: shape.dx, y: shape.dy }, px = -d.y, py = d.x, w = shape.w * 0.55;
    const flow = (this.animClock / 6) % 26;
    g.lineStyle(2, 0xffe0b0, locked ? 0.85 : 0.5);
    for (let s = 14 + flow; s < shape.len - 6; s += 26) {
      const cx = shape.x + d.x * s, cy = shape.y + d.y * s;
      g.beginPath();
      g.moveTo(cx - d.x * 7 + px * w, cy - d.y * 7 + py * w);
      g.lineTo(cx, cy);
      g.lineTo(cx - d.x * 7 - px * w, cy - d.y * 7 - py * w);
      g.strokePath();
    }
  }

  /** ?debug=1: 실제 판정 모양(하늘색)과 플레이어 발밑 점 */
  drawDebugHit(g) {
    if (!DEBUG || this.state === State.DEAD) return;
    const p = this.getPlayer();
    g.fillStyle(0x40e0ff, 1).fillRect(p.x - 1, p.y - 1, 3, 3);
    if (this.state === State.ACTIVE && this.lastHitShape) {
      g.lineStyle(1, 0x40e0ff, 1).strokePoints(groundShapePoints(this.lastHitShape), true);
    }
  }

  /**
   * 도트 시트 프레임: 상태·공격 종류·진행도에 맞춰 고름. 공격 중엔 공격 방향을 바라봄.
   * 공격 그림: swipe/slam = [예고0, 예고1, 판정, 회복], charge = [예고0, 예고1, 질주×4, 멈춤]
   */
  updatePixelFrame() {
    const sp = this.sprite;
    const dt = this.dt ?? 16;
    this.animClock += dt;
    const prog = (total) => Math.min(0.999, Math.max(0, 1 - this.stateTime / total));
    const moving = Math.hypot(this.body.velocity.x, this.body.velocity.y) > 8;
    let anim = 'idle', frame = Math.floor(this.animClock / 600) % 2, face = this.facing;
    const atk = this.attack?.anim ?? this.attack?.id;
    const type = this.attack?.type;
    switch (this.state) {
      case State.CHASE: case State.RETURN:
        if (moving) { anim = 'walk'; frame = Math.floor(this.animClock / 170) % sp.frames('walk'); }
        break;
      case State.ROAR: anim = 'roar'; frame = Math.floor(this.animClock / 150) % 2; break;
      case State.WINDUP: anim = atk; frame = prog(this.windupTotal) < 0.5 ? 0 : 1; face = this.attackDir; break;
      case State.ACTIVE:
        anim = atk; face = this.attackDir;
        if (type === 'charge') frame = 2 + Math.floor(this.animClock / 70) % 4;
        else if (type === 'combo') frame = 2 + this.comboIdx - (this.comboGap > 0 && this.comboIdx > 0 ? 1 : 0); // [예고0, 예고1, 1타, 2타, 3타, 회복]
        else if (type === 'leap') frame = 2;                                                                   // [예고0, 예고1, 공중, 착지, 회복]
        else if (type === 'summon') frame = Math.floor(this.animClock / 150) % 2;
        else frame = 2;
        break;
      case State.RECOVERY: {
        anim = atk; face = this.attackDir;
        const n = sp.frames(atk);
        if (type === 'leap') frame = prog(this.attack.recoveryMs) < 0.5 ? 3 : 4;
        else if (type === 'summon') frame = Math.floor(this.animClock / 150) % 2;
        else frame = n - 1;
        break;
      }
      case State.STAGGER: anim = 'stagger'; frame = Math.floor(this.animClock / 120) % 2; break;
      case State.DEAD: anim = 'death'; this.deathClock = (this.deathClock ?? 0) + dt; frame = Math.floor(this.deathClock / 220); break;
    }
    sp.show(anim, frame, face);
  }

  /** 경계 표시(? / 경계 막대)와, 웅크린 동안 바닥에 보이는 시야 부채꼴 (잡몹과 같은 규칙) */
  drawSenses() {
    const ctx = this.ctx;
    const level = this.meter.level;
    const dead = this.state === State.DEAD;
    const top = this.y - this.data_.hurtbox.height - 6;
    this.icon.setPosition(this.x, top - (this.awareness === Awareness.UNAWARE ? 0 : 8)).setDepth(this.depth + 2)
      .setText(dead ? '' : this.state === State.STAGGER ? '?!' : this.awareness === Awareness.SUSPICIOUS ? '?' : '')
      .setColor(this.state === State.STAGGER ? '#9fdcff' : '#ffe060');
    const g = this.hpBarSmall;
    if (!dead && this.awareness !== Awareness.ALERT && this.meter.value > 0.02) {
      g.setDepth(this.depth + 1);
      g.fillStyle(0x000000, 0.6).fillRect(this.x - 14, top - 16, 28, 3);
      g.fillStyle(level === Level.SUSPICIOUS ? 0xffe060 : 0xc8c8c8).fillRect(this.x - 14, top - 16, 28 * this.meter.value, 3);
    }
    if (dead || !ctx?.showCones || this.awareness === Awareness.ALERT) return;
    const pr = this.data_.perception;
    const range = pr.visionRange * ctx.env.visionMultiplier(this.x, this.y, ctx.stealth);
    const ang = Math.atan2(this.facing.y, this.facing.x), half = (pr.visionAngleDeg / 2) * Math.PI / 180;
    const gc = ctx.coneGfx;
    gc.fillStyle(level === Level.SUSPICIOUS ? 0xffb040 : 0xff8060, 0.09);
    gc.slice(this.x, this.y - 6, range, ang - half, ang + half, false).fillPath();
    gc.lineStyle(1, 0xff8060, 0.18).strokeCircle(this.x, this.y - 6, pr.closeSenseRadius); // 바로 옆은 등 뒤도 느낌
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
