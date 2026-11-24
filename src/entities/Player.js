import { applyYSort } from '../systems/YSort.js';
import { Stats } from '../systems/Stats.js';
import { findHits } from '../systems/Combat.js';
import { spawnDamageNumber, spawnSlash, spawnFloatingLabel, spawnDust, spawnAfterimage, spawnBigLabel } from '../systems/Effects.js';
import { WeaponView } from './WeaponView.js';
import { Equipment } from '../systems/Equipment.js';

/** 플레이어 상태 이름 (Godot에서는 enum State) */
const State = {
  FREE: 'free',         // 서 있거나 걷기
  WINDUP: 'windup',     // 공격 예비 동작 (취소 불가)
  ACTIVE: 'active',     // 공격 판정 중
  RECOVERY: 'recovery', // 후딜레이 (chainAfterMs 이후에만 다음 타·구르기로 연결 가능)
  ROLL: 'roll',         // 구르기
  HURT: 'hurt',         // 맞고 밀려남 (행동 불가) — 약한 공격
  KNOCKDOWN: 'knockdown', // 날아가 넘어졌다 일어남 (무적, 행동 불가) — 강한 공격
  GATHER: 'gather',     // 줍기·채집 모션 (쪼그려 집음). 구르기로 끊을 수 있음
  JUMP: 'jump',         // 낮은 턱에서 아래로 뛰어내림 (충돌 끔, 포물선)
  CLIMB: 'climb',       // 덩굴 타고 절벽 오르내리기 (기력 소모, 공격·구르기 불가, 맞으면 떨어짐)
  DEAD: 'dead',         // 쓰러짐 → 잠시 뒤 부활
};

/** 가슴 높이: 공격 판정 중심은 발밑이 아니라 몸 가운데 */
const CHEST_OFFSET = 12;
const DEG = Math.PI / 180;

/** 각도 a를 b 쪽으로 최대 step(라디안)만큼 돌린다 (짧은 쪽으로) */
function turnToward(a, b, step) {
  let d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}
const unit = (x, y) => { const l = Math.hypot(x, y); return l > 0 ? { x: x / l, y: y / l } : null; };

/**
 * 플레이어. 위치(x, y) = 발밑 좌표. 충돌은 발밑의 작은 박스만.
 * 매 프레임 "명령"을 받아 상태 머신으로 행동한다.
 * 공격은 무기 데이터의 combo 목록을 차례로 실행한다 (1타 → 2타 → 3타 …).
 * Godot: CharacterBody2D + 상태 머신(enum + match), move_and_slide().
 */
export class Player extends window.Phaser.Physics.Arcade.Sprite {
  /**
   * @param {object} data data/player.json
   * @param {{weapons:object, gear:object, skills:object}} db data/weapons.json, gear.json, skills.json
   * @param {() => Array} getTargets 공격 가능한 대상 목록
   */
  constructor(scene, x, y, data, db, getTargets) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.data_ = data;
    this.weapons = db.weapons;
    this.gear = db.gear;
    this.skillDb = db.skills;
    /** 장비 8칸·가진 장비·무기 단축칸 (systems/Equipment.js) */
    this.equipment = new Equipment({ weapons: db.weapons, gear: db.gear });
    this.getTargets = getTargets;
    this.stats = new Stats(data);

    this.state = State.FREE;
    this.stateTime = 0;           // 현재 상태에서 남은 시간(ms)
    this.facingAngle = Math.PI / 2; // 바라보는 방향(라디안, 0=오른쪽, 시계방향+) — 360도 자유
    this.facing = { x: 0, y: 1 };   // 같은 방향의 단위 벡터 (공격 방향)
    this.lockTarget = null;         // 락온(대상 고정) 중인 적
    this.rollDir = { x: 0, y: 1 };
    this.queued = null;           // 공격 중 예약된 다음 행동 ('attack' | 'roll')
    this.comboIndex = 0;          // 지금(또는 다음) 실행할 콤보 타 번호
    this.hitThisSwing = new Set();
    this.hitstopMs = 0;           // 맞힌 순간 잠깐 멈추는 시간
    this.invulnMs = 0;            // 맞은 직후 잠깐 무적 (연속으로 맞지 않게)
    this.knock = { x: 0, y: 0 };
    /** 쓰러졌을 때 씬이 등록하는 콜백 */
    this.onDeath = null;
    this.isSneaking = false;      // 웅크려 걷는 중 (조용하고 덜 보임)
    this.walkNoiseMs = 0;
    /** 소리를 내보낼 곳 (WorldScene이 연결) */
    this.noiseBus = null;

    this.setOrigin(0.5, 1);
    this.body.setSize(16, 10, false);
    this.body.setOffset(8, 22);
    this.setCollideWorldBounds(true);

    // 겉모습은 별도 그림으로 (몸을 기울이거나 웅크려도 물리 충돌 크기는 그대로 유지)
    // Godot: CharacterBody2D 아래 Sprite2D를 따로 두는 것과 같음
    this.setVisible(false);
    this.visual = scene.add.image(x, y, 'player').setOrigin(0.5, 1);
    /** 3D → 도트 시트 사용 시 메타 (없으면 임시 그래픽) */
    this.hero3d = scene.registry.get('hero3d');
    this.animClock = 0; // 걷기·대기 프레임 진행용
    if (this.hero3d) this.visual.setTexture('hero3d', 0).setOrigin(this.hero3d.origin.x, this.hero3d.origin.y);
    /** 2D 도트 주인공 메타 (Core Keeper식 4방향, 갑옷별 시트) */
    this.heroPx = scene.registry.get('heroPx');
    if (this.heroPx) this.visual.setOrigin(this.heroPx.origin.x, this.heroPx.origin.y);

    this.weaponView = new WeaponView(scene);
    this.fx = scene.add.graphics(); // 바라보는 방향 표시 등
    this.resetGear();

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
   * @returns {'hit'|'dodged'|'blocked'|'ignored'} 맞음 / 구르기 무적으로 피함 / 테스트 무적 / 무시(이미 쓰러짐·피격 무적)
   */
  receiveHit(damage, fromX, fromY, opts = {}) {
    if (this.isDead || this.invulnMs > 0 || this.state === State.KNOCKDOWN) return 'ignored';
    if (this.godMode) { spawnFloatingLabel(this.scene, this.x, this.y - 30, '무적'); return 'blocked'; } // 'ignored'가 아니면 그 공격은 한 번만 판정
    if (this.isInvincible) {
      // 구르기 시작 직후(perfectWindowMs 안)에 피하면 완벽한 회피
      const rolled = this.data_.roll.durationMs - this.stateTime;
      if (rolled <= (this.data_.roll.perfectWindowMs ?? 0) * this.modifier('perfectWindowMultiplier')) {
        for (const sp of this.heroSprites) spawnAfterimage(this.scene, sp);
        spawnBigLabel(this.scene, this.x, this.y - 34, '완벽한 회피!');
        const pd = this.data_.perfectDodge;
        this.rollBrake = pd.rollBrake;          // 그 자리에서 멈춤 (몬스터 바로 옆)
        this.stateTime = Math.min(this.stateTime, pd.settleMs); // 남은 구르기를 짧게 끝내고 착지
        this.setVelocity(0, 0);
        this.invulnMs = pd.invulnMs;            // 구르기가 일찍 끝나도 잠깐 무적
        this.counterMs = pd.counterWindowMs;    // 반격 기회: 이 시간 안의 첫 공격은 구르기를 끊고 나가며 강해짐
        this.onPerfectDodge?.(opts.source);
      } else {
        spawnFloatingLabel(this.scene, this.x, this.y - 30, '회피!');
      }
      return 'dodged';
    }
    this.stats.takeDamage(damage);
    this.invulnMs = this.data_.hitInvulnMs;
    this.hitstopMs = this.data_.hurtFreezeMs ?? 0; // 맞는 순간 잠깐 멈칫 (충격이 눈에 들어오게)
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
    } else if (opts.knockdown) {
      // 강한 공격: 공격한 쪽을 바라본 채 뒤로 날아가 넘어짐
      this.setFacingAngle(Math.atan2(-this.knock.y, -this.knock.x));
      this.enter(State.KNOCKDOWN);
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
  // ---------- 장비 ----------
  /** 처음 장비: 시작 무기(단축칸 1·2) + 누더기 옷 */
  resetGear() {
    const e = this.equipment;
    e.owned = []; e.quick = [null, null, null];
    for (const k of Object.keys(e.slots)) e.slots[k] = null;
    this.data_.weaponSlots.forEach((id, i) => { e.obtain(id); if (i < 3) e.quick[i] = id; });
    for (const id of this.data_.startGear ?? []) { e.obtain(id); e.equip(id); }
    if (e.quick[0]) e.equip(e.quick[0], 'right');
    this.refreshEquipment(false);
  }

  /** 장비가 바뀐 뒤: 주무기·겉모습·최대 체력 다시 계산 */
  refreshEquipment(announce = true) {
    const e = this.equipment;
    const prevWeapon = this.weaponId;
    this.weaponId = e.mainWeapon();
    this.weapon = this.weapons[this.weaponId];
    this.look = e.look();
    if (prevWeapon !== this.weaponId) {
      this.comboIndex = 0;
      if (this.weapon.view) this.weaponView.setWeapon(this.weaponId);
      if (announce) spawnFloatingLabel(this.scene, this.x, this.y - 34, this.weapon.name);
    }
    const oldMax = this.stats.maxHp;
    this.stats.maxHp = this.data_.maxHp + e.maxHpBonus();
    this.stats.hp = Math.max(1, Math.min(this.stats.maxHp, this.stats.hp + Math.max(0, this.stats.maxHp - oldMax)));
  }

  /** 무기 단축칸(1·2·3)의 무기를 오른손에. 'next'면 다음 칸 */
  equipQuick(slot) {
    const e = this.equipment;
    if (slot === 'next') {
      const cur = e.quick.indexOf(e.slots.right);
      for (let k = 1; k <= 3; k++) { const i = (cur + k + 3) % 3; if (e.quick[i]) { slot = i; break; } }
      if (slot === 'next') return;
    }
    const id = e.quick[slot];
    if (!id || e.slots.right === id) return;
    e.equip(id, 'right');
    this.refreshEquipment();
  }

  /** 장비 칸에 장착 (장비창에서). slot 없으면 알맞은 칸 */
  equipItem(id, slot = null) {
    if (!this.equipment.equip(id, slot)) return false;
    this.refreshEquipment();
    return true;
  }

  unequipSlot(slot) {
    this.equipment.unequip(slot);
    this.refreshEquipment();
  }

  /** 새 장비를 얻는다 (제작 등). equipNow면 바로 장착, 무기는 빈 단축칸에도 넣음 */
  obtain(id, equipNow) {
    const e = this.equipment;
    e.obtain(id);
    if (e.isWeapon(id) && !e.quick.includes(id)) { const i = e.quick.indexOf(null); if (i >= 0) e.quick[i] = id; }
    if (equipNow) this.equipItem(id, e.isWeapon(id) ? 'right' : null);
  }

  /** 지금 장비(주무기 + 방어구·장신구 + 세트 보너스)가 주는 스킬 목록 */
  get skills() {
    return this.equipment.skillIds().map((id) => ({ id, ...this.skillDb[id] })).filter((s) => s.name);
  }

  /** 패시브 스킬 배율의 곱 (예: knockbackMultiplier) */
  modifier(key) {
    return this.skills.reduce((acc, s) => acc * (s[key] ?? 1), 1) * (this.needs?.modifier(key) ?? 1);
  }

  /** 생존 게이지 효과를 최대 체력·기력에 반영 (배고프면 기력 최대치↓, 피곤하면 체력 최대치↓) */
  applyNeeds() {
    const s = this.stats;
    s.maxStamina = Math.round(this.data_.maxStamina * this.modifier('maxStaminaMultiplier'));
    s.maxHp = Math.round((this.data_.maxHp + this.equipment.maxHpBonus()) * this.modifier('maxHpMultiplier'));
    s.stamina = Math.min(s.stamina, s.maxStamina);
    s.hp = Math.min(s.hp, s.maxHp);
  }

  // ---------- 매 프레임 ----------
  /** @param {{move:{x,y}, attack:boolean, roll:boolean, switchWeapon:number|null}} cmd @param {number} dt ms */
  update(cmd, dt) {
    // 웅크림: 웅크린 채 움직이면 기력이 천천히 줄고(회복도 멈춤), 바닥나면 자동으로 일어선다
    const moving = cmd.move.x !== 0 || cmd.move.y !== 0;
    const wantSneak = !!cmd.sneak && this.state === State.FREE;
    if (wantSneak && this.stats.stamina <= 0.5) {
      if (!this.outOfBreath) spawnFloatingLabel(this.scene, this.x, this.y - 30, '숨이 차다');
      this.outOfBreath = true;
    } else if (!wantSneak || this.stats.stamina > 15) {
      this.outOfBreath = false; // 웅크림을 풀었거나 기력이 어느 정도 돌아오면 다시 웅크릴 수 있음
    }
    this.isSneaking = wantSneak && !this.outOfBreath;
    const sneakMoving = this.isSneaking && moving;
    if (sneakMoving) this.stats.stamina = Math.max(0, this.stats.stamina - this.data_.stealth.sneakStaminaPerSec * (dt / 1000));

    this.applyNeeds();
    this.stats.update(dt, this.state === State.FREE && !sneakMoving, this.modifier('staminaRegenMultiplier'));
    if (this.invulnMs > 0) this.invulnMs -= dt;
    if (this.counterMs > 0) this.counterMs -= dt;
    this.dt = dt;
    this.updateLock(cmd);
    // 진단용: 이동 입력이 있는데 못 움직이는 이유 (HUD 입력 진단 화면에 표시)
    const wantsMove = cmd.move.x !== 0 || cmd.move.y !== 0;
    this.moveBlockedBy = !wantsMove ? null
      : this.hitstopMs > 0 ? '히트스톱'
      : ({ windup: '공격 예비동작', active: '공격 중', recovery: '공격 후딜', roll: '구르기', hurt: '피격', knockdown: '넘어짐', dead: '쓰러짐' })[this.state] ?? null;

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
      case State.WINDUP: {
        this.setVelocity(0, 0);
        this.bufferInput(cmd);
        // 예비 동작 중에는 조준 방향으로 조금씩 틀 수 있다 (몬스터 헌터식 미세 조정)
        const want = this.desiredDir(cmd);
        if (want) {
          this.turnTo(Math.atan2(want.y, want.x), this.data_.attackSteerDegPerSec);
          this.setFacingAngle(this.snapAttack(this.facingAngle));
        }
        if (this.stateTime <= 0) this.enter(State.ACTIVE);
        break;
      }
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
      case State.ROLL: {
        // 완벽한 회피 직후: 공격을 누르면 구르기를 끊고 바로 반격
        if (cmd.attack && this.counterMs > 0 && this.tryAttack(0, cmd)) break;
        const rs = this.data_.roll.speed * (this.rollBrake ?? 1);
        this.setVelocity(this.rollDir.x * rs, this.rollDir.y * rs);
        this.dustMs -= dt;
        if (this.dustMs <= 0) { this.dustMs = 90; spawnDust(this.scene, this.x, this.y, this.rollDir, 2); }
        if (this.stateTime <= 0) { this.setVelocity(0, 0); this.enter(State.FREE); } // 구르기가 끝나면 미끄러지지 않고 그 자리에
        break;
      }
      case State.HURT: {
        const k = Math.max(0, this.stateTime / this.data_.hurtMs) * this.data_.knockbackSpeed * this.modifier('knockbackMultiplier');
        this.setVelocity(this.knock.x * k, this.knock.y * k);
        // 맞고 밀려나는 동작 후반(40%)에 누른 구르기·공격만 예약 → 끝나자마자 실행 (맞는 순간의 늦은 입력은 버림)
        if (this.stateTime <= this.data_.hurtMs * 0.4) this.bufferInput(cmd);
        if (this.stateTime <= 0) {
          const next = this.queued;
          this.queued = null;
          this.enter(State.FREE);
          if (next === 'roll') this.tryRoll(cmd);
          else if (next === 'attack') this.tryAttack(0, cmd);
        }
        break;
      }
      case State.KNOCKDOWN: {
        const kd = this.data_.knockdown;
        const t = this.knockdownTotal - this.stateTime; // 넘어진 뒤 지난 시간
        const air = Math.max(0, 1 - t / kd.airMs);
        this.setVelocity(this.knock.x * kd.launchSpeed * air, this.knock.y * kd.launchSpeed * air);
        if (!this.landed && t >= kd.airMs) { this.landed = true; spawnDust(this.scene, this.x, this.y, this.knock, 6); this.scene.cameras.main.shake(120, 0.004); }
        // 입력 예약은 일어나는 동작 후반부에 누른 것만 (맞을 때·넘어진 동안 누른 늦은 입력이 기상 직후 튀어나오지 않게)
        if (t >= kd.airMs + kd.downMs + kd.getUpMs * 0.5) this.bufferInput(cmd);
        if (this.stateTime <= 0) {
          const next = this.queued;
          this.queued = null;
          this.invulnMs = 250; // 일어난 직후 잠깐 무적
          this.enter(State.FREE);
          if (next === 'roll') this.tryRoll(cmd);
          else if (next === 'attack') this.tryAttack(0, cmd);
        }
        break;
      }
      case State.JUMP: {
        const j = this.data_.terrain;
        const k = 1 - Math.max(0, this.stateTime) / j.jumpMs;
        this.body.reset(this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * k, this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * k);
        this.airZ = Math.sin(Math.PI * k) * j.jumpHeight + (1 - k) * 6;
        if (this.stateTime <= 0) {
          this.endTerrainMove(true);
          spawnDust(this.scene, this.x, this.y, { x: 0, y: 0 }, 5);
          this.scene.cameras.main.shake(90, 0.003);
          this.makeNoise('roll');
          this.enter(State.FREE);
        }
        break;
      }
      case State.CLIMB: {
        const tr = this.data_.terrain;
        // 기력 소모: 바닥나면 미끄러져 떨어짐
        if (!this.stats.spendStamina(tr.climbStaminaPerSec * this.dt / 1000)) {
          spawnFloatingLabel(this.scene, this.x, this.y - 34, '미끄러졌다!');
          this.lastTerrainState = State.CLIMB;
          this.endTerrainMove(false);
          this.stats.takeDamage(tr.fallDamage);
          this.knock = { x: 0, y: this.climbDir < 0 ? 1 : -1 };
          this.enter(State.HURT);
          break;
        }
        // 이동 입력이 있을 때만 움직임 (멈추면 매달려 있음, 반대로 누르면 되돌아감)
        const m = cmd.move.y * this.climbDir; // 1 = 가던 방향, -1 = 반대
        const dirNow = Math.abs(cmd.move.y) > 0.3 ? Math.sign(m) : 0;
        const target = dirNow >= 0 ? this.moveTo : this.moveFrom;
        const dy = target.y - this.y;
        const step = tr.climbSpeed * this.dt / 1000 * (dirNow === 0 ? 0 : 1);
        this.body.reset(this.x, this.y + Math.sign(dy) * Math.min(Math.abs(dy), step));
        this.climbAnim = (this.climbAnim ?? 0) + step;
        if (Math.abs(target.y - this.y) < 0.5 && dirNow !== 0) {
          this.endTerrainMove(true);
          this.enter(State.FREE);
        }
        break;
      }
      case State.GATHER: {
        this.setVelocity(0, 0);
        const g = this.data_.gather;
        if (cmd.roll && this.tryRoll(cmd)) { this.gatherCb = null; break; } // 위험하면 구르기로 끊기
        if (this.gatherCb && this.stateTime <= g.durationMs * (1 - g.collectAt)) { const cb = this.gatherCb; this.gatherCb = null; cb(); }
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
    if (this.hero3d || this.heroPx) this.weaponView.image.setVisible(false); // 무기가 캐릭터 그림에 포함됨
    else this.weaponView.update(this);
    this.drawFx();
  }

  bufferInput(cmd) {
    if (cmd.attack) this.queued = 'attack';
    if (cmd.roll) this.queued = 'roll';
  }

  /** 소리 내기: 근처 몬스터가 듣는다 (data/player.json stealth.noise 반경) */
  makeNoise(kind) {
    this.noiseBus?.emit(this.x, this.y, this.data_.stealth.noise[kind], kind);
  }

  /** 도트 주인공은 공격이 8방향 그림이므로 공격 방향을 45° 단위로 맞춘다 (판정도 그림과 일치) */
  snapAttack(angle) {
    if (!this.heroPx) return angle;
    const step = Math.PI / 4;
    return Math.round(angle / step) * step;
  }

  // ---------- 조준·회전 ----------
  setFacingAngle(a) {
    this.facingAngle = Math.atan2(Math.sin(a), Math.cos(a));
    this.facing = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) };
  }

  /** 초당 degPerSec 속도로 목표 각도 쪽으로 회전 */
  turnTo(angle, degPerSec) {
    this.setFacingAngle(turnToward(this.facingAngle, angle, degPerSec * DEG * (this.dt / 1000)));
  }

  /**
   * 지금 바라보고 싶은 방향: 락온 대상 > 마우스 조준 > 이동 방향
   * @returns {{x:number,y:number}|null}
   */
  desiredDir(cmd) {
    if (this.lockTarget) return unit(this.lockTarget.x - this.x, this.lockTarget.y - this.y);
    if (cmd.aim) return unit(cmd.aim.x - this.x, cmd.aim.y - (this.y - CHEST_OFFSET));
    const { move } = cmd;
    if (move.x !== 0 || move.y !== 0) return move;
    return null;
  }

  /** 공격을 시작할 때의 방향: 원하는 방향, 없으면(터치) 가까운 적 자동 조준, 그래도 없으면 지금 방향 */
  attackDir(cmd) {
    if (this.lockTarget) return this.desiredDir(cmd);
    if (cmd.aim) return this.desiredDir(cmd);
    if (cmd.autoAim) {
      const t = this.nearestTarget(this.data_.autoAimRange);
      if (t) return unit(t.x - this.x, t.y - this.y);
    }
    return this.desiredDir(cmd) ?? this.facing;
  }

  nearestTarget(range) {
    let best = null, bestD = range;
    for (const t of this.getTargets()) {
      if (!t.isHittable) continue;
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  /** 락온 켜기/끄기, 대상이 죽거나 멀어지면 해제 */
  updateLock(cmd) {
    if (cmd.lockToggle) {
      const was = this.lockTarget;
      this.lockTarget = was ? null : this.nearestTarget(this.data_.lockOnRange);
      if (!this.lockTarget) spawnFloatingLabel(this.scene, this.x, this.y - 34, was ? '고정 해제' : '대상 없음');
    }
    const t = this.lockTarget;
    if (t && (!t.isHittable || this.isDead || Math.hypot(t.x - this.x, t.y - this.y) > this.data_.lockOnRange * 1.6)) {
      this.lockTarget = null;
    }
  }

  updateFree(cmd) {
    const { move } = cmd;
    const moving = move.x !== 0 || move.y !== 0;
    const want = this.desiredDir(cmd);
    if (want) this.turnTo(Math.atan2(want.y, want.x), this.data_.turnSpeedDegPerSec);

    if (cmd.switchWeapon !== null && cmd.switchWeapon !== undefined) {
      this.equipQuick(cmd.switchWeapon);
    }

    if (cmd.roll && this.tryRoll(cmd)) return;
    if (cmd.attack && this.tryAttack(0, cmd)) return;
    if (this.checkTerrainMoves(cmd)) return;

    // 전력질주: Shift를 누른 채 움직이면 (휴대폰은 구르기 버튼 꾹). 기력 소모, 발소리 큼, 웅크림은 풀림
    const sp = this.data_.sprint;
    const wantSprint = moving && cmd.sprint && !this.isSneaking && !this.sprintTired;
    if (wantSprint && !this.stats.spendStamina(sp.staminaPerSec * this.modifier('sprintStaminaMultiplier') * this.dt / 1000)) {
      this.sprintTired = true;
      spawnFloatingLabel(this.scene, this.x, this.y - 30, '숨이 차다');
    }
    if (this.sprintTired && (!cmd.sprint || this.stats.stamina >= sp.recoverAt)) this.sprintTired = false;
    this.isSprinting = wantSprint && !this.sprintTired;

    // 목표 속도: 바라보는 반대쪽으로 움직이면(뒷걸음질) 느려짐, 웅크리면 느려짐
    let speed = this.data_.speed * (this.weapon.moveSpeedMultiplier ?? 1);
    if (this.isSneaking) speed *= this.data_.stealth.sneakSpeedMultiplier;
    if (this.isSprinting) {
      speed *= sp.speedMultiplier;
      // 질주 중엔 달리는 쪽을 바라봄 (조준 방향 무시) + 흙먼지
      this.turnTo(Math.atan2(move.y, move.x), sp.turnDegPerSec);
      this.sprintDustMs = (this.sprintDustMs ?? 0) - this.dt;
      if (this.sprintDustMs <= 0) { this.sprintDustMs = 170; spawnDust(this.scene, this.x, this.y, move, 1); }
    }
    // 걷는 소리: 일정 간격으로 (웅크리면 아주 작게)
    if (moving) {
      this.walkNoiseMs -= this.dt;
      if (this.walkNoiseMs <= 0) {
        this.walkNoiseMs = this.data_.stealth.walkNoiseIntervalMs;
        this.makeNoise(this.isSneaking ? 'sneak' : this.isSprinting ? 'sprint' : 'walk');
      }
    }
    if (moving) {
      const dot = move.x * this.facing.x + move.y * this.facing.y; // 1=앞, -1=뒤
      if (dot < 0) speed *= 1 + (this.data_.backpedalSpeedMultiplier - 1) * -dot;
    }
    // 가속·감속: 지금 속도에서 목표 속도로 부드럽게 (8방향 꺾임 완화)
    const v = this.body.velocity;
    const tx = move.x * speed, ty = move.y * speed;
    // 반대 방향으로 꺾을 때는 더 빠르게 전환 (방향 전환이 굼떠서 키가 씹힌 느낌이 들지 않게)
    const reversing = moving && (v.x * tx + v.y * ty) < 0;
    const accel = moving ? this.data_.accel * (reversing ? this.data_.reverseAccelMultiplier : 1) : this.data_.decel;
    const rate = accel * (this.dt / 1000);
    const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
    if (d <= rate) this.setVelocity(tx, ty);
    else this.setVelocity(v.x + (dx / d) * rate, v.y + (dy / d) * rate);
  }

  updateRecovery(cmd) {
    const m = this.currentMove;
    const elapsed = m.recoveryMs - this.stateTime;
    const canChain = elapsed >= m.chainAfterMs;
    const hasNext = this.comboIndex + 1 < this.weapon.combo.length;

    if (canChain && this.queued === 'roll') {
      // 구르기로 후딜 끊기 (기력이 없으면 예약 유지)
      if (this.tryRoll(cmd)) { this.queued = null; return; }
    }
    if (canChain && this.queued === 'attack' && hasNext) {
      if (this.tryAttack(this.comboIndex + 1, cmd)) { this.queued = null; return; }
    }
    // 후딜 후반: 이동 입력으로 끊고 바로 움직이기 (예약된 행동이 없을 때)
    const moving = cmd.move.x !== 0 || cmd.move.y !== 0;
    if (moving && !this.queued && elapsed >= (m.moveCancelAfterMs ?? m.recoveryMs)) {
      this.enter(State.FREE);
      this.updateFree(cmd);
      return;
    }
    if (this.stateTime <= 0) {
      // 콤보 끝 (또는 입력 없음) → 자유 상태. 마지막 타 뒤의 공격 예약은 1타부터 다시.
      const next = this.queued;
      this.queued = null;
      this.enter(State.FREE);
      if (next === 'roll') this.tryRoll(cmd);
      else if (next === 'attack') this.tryAttack(0, cmd);
    }
  }

  /** @param {number} index 실행할 콤보 타 번호 */
  tryAttack(index, cmd) {
    const move = this.weapon.combo[index];
    if (!move || !this.stats.spendStamina(move.staminaCost)) return false;
    const dir = this.attackDir(cmd);
    this.setFacingAngle(this.snapAttack(Math.atan2(dir.y, dir.x))); // 공격은 조준한 쪽으로 즉시 돌아서 시작
    // 반격 기회 안의 첫 공격은 "반격"
    this.counterSwing = index === 0 && this.counterMs > 0;
    if (this.counterSwing) this.counterMs = 0;
    this.comboIndex = index;
    this.weaponView.beginWindup();
    this.enter(State.WINDUP);
    return true;
  }

  tryRoll(cmd) {
    if (!this.stats.spendStamina(this.data_.roll.staminaCost * this.modifier('rollStaminaMultiplier'))) return false;
    const { move } = cmd;
    const moving = move.x !== 0 || move.y !== 0;
    this.rollDir = moving ? { ...move } : { ...this.facing };
    // 조준(마우스·락온) 중이면 시선 유지 → 뒤로 구르기(백스텝) 가능. 아니면 구르는 쪽을 봄
    if (!this.lockTarget && !cmd.aim) this.setFacingAngle(Math.atan2(this.rollDir.y, this.rollDir.x));
    this.comboIndex = 0;
    this.enter(State.ROLL);
    this.makeNoise('roll');
    return true;
  }

  /**
   * 높낮이: 벽에 막힌 채 같은 방향으로 잠깐(pushMs) 밀면 —
   *  낮은 턱 위에서 아래(남쪽)로 → 뛰어내리기 / 덩굴 덮인 절벽에 위로(북쪽) 또는 위에서 아래로 → 기어오르기
   */
  checkTerrainMoves(cmd) {
    const t = this.terrain, tr = this.data_.terrain;
    if (!t) return false;
    const { move } = cmd;
    const b = this.body.blocked, touch = this.body.touching;
    let want = null;
    if (move.y > 0.6 && (b.down || touch.down)) {
      if (t.ledgeLanding(this.x, this.y - 3)) want = 'jump';
      else if ([-6, 0, 6].some((dx) => t.climbableAt(this.x + dx, this.y + 6)) && t.isHigh(this.x, this.y - 3)) want = 'climbDown';
    } else if (move.y < -0.6 && (b.up || touch.up) && [-6, 0, 6].some((dx) => t.climbableAt(this.x + dx, this.y - 14))) {
      want = 'climbUp';
    }
    if (!want || want !== this.pushWant) { this.pushWant = want; this.pushMs = 0; return false; }
    this.pushMs += this.dt;
    if (this.pushMs < tr.pushMs) return false;
    this.pushWant = null; this.pushMs = 0;
    if (want === 'jump') {
      const to = t.ledgeLanding(this.x, this.y - 3);
      this.moveFrom = { x: this.x, y: this.y }; this.moveTo = to;
      this.enter(State.JUMP);
      return true;
    }
    const dir = want === 'climbUp' ? -1 : 1;
    const to = t.climbTarget(this.x, want === 'climbUp' ? this.y - 14 : this.y - 3, dir);
    if (!to || this.stats.stamina < tr.climbMinStamina) {
      if (!to) return false;
      spawnFloatingLabel(this.scene, this.x, this.y - 34, '기력이 부족하다');
      return false;
    }
    this.moveFrom = { x: this.x, y: this.y }; this.moveTo = to; this.climbDir = dir;
    this.enter(State.CLIMB);
    return true;
  }

  /** 뛰어내리기·기어오르기 중엔 충돌을 끄고 위치를 직접 옮긴다. 끝나거나 끊기면 충돌을 되돌림 */
  endTerrainMove(arrived) {
    if (!this.terrainMove) return;
    this.terrainMove = false;
    this.body.checkCollision.none = false;
    this.airZ = 0;
    if (!arrived) {
      // 중간에 끊김(맞음·기력 바닥): 기어오르기는 출발한 쪽으로 미끄러져 떨어짐, 뛰어내리기는 착지점으로
      const p = this.state === State.JUMP || this.lastTerrainState === State.JUMP ? this.moveTo : this.moveFrom;
      this.body.reset(p.x, p.y);
    }
  }

  /**
   * 줍기·채집 모션 시작. 모션 중간(collectAt)에 onCollect 호출 (아이템이 손에 들어오는 순간).
   * @param {{x:number,y:number}} at 바라볼 곳
   */
  startGather(at, onCollect) {
    if (this.state !== State.FREE) return false;
    const dx = at.x - this.x, dy = at.y - this.y;
    if (Math.hypot(dx, dy) > 1) this.setFacingAngle(Math.atan2(dy, dx));
    this.gatherCb = onCollect;
    this.enter(State.GATHER);
    return true;
  }

  enter(state) {
    if (state !== State.FREE) this.isSprinting = false;
    if (this.terrainMove && state !== State.JUMP && state !== State.CLIMB) { this.lastTerrainState = this.state; this.endTerrainMove(false); }
    this.state = state;
    const m = this.currentMove;
    switch (state) {
      case State.WINDUP: this.stateTime = m.windupMs; break;
      case State.ACTIVE:
        this.stateTime = m.activeMs;
        this.hitThisSwing.clear();
        this.spawnSlashFx(m);
        break;
      case State.RECOVERY:
        this.stateTime = m.recoveryMs;
        this.counterSwing = false;
        this.makeNoise('attack'); // 휘두르는 소리는 칼이 지나간 뒤에 퍼진다 (기습 데미지가 먼저 들어가도록)
        break;
      case State.ROLL: this.stateTime = this.data_.roll.durationMs; this.dustMs = 0; this.rollBrake = 1; spawnDust(this.scene, this.x, this.y, this.rollDir, 3); break;
      case State.KNOCKDOWN: {
        const kd = this.data_.knockdown;
        this.knockdownTotal = kd.airMs + kd.downMs + kd.getUpMs;
        this.stateTime = this.knockdownTotal; this.comboIndex = 0; this.landed = false;
        break;
      }
      case State.HURT: this.stateTime = this.data_.hurtMs; this.comboIndex = 0; break;
      case State.DEAD: this.stateTime = 0; this.comboIndex = 0; break;
      case State.GATHER: this.stateTime = this.data_.gather.durationMs; this.comboIndex = 0; break;
      case State.JUMP: case State.CLIMB:
        this.stateTime = state === State.JUMP ? this.data_.terrain.jumpMs : 0;
        this.terrainMove = true;
        this.body.checkCollision.none = true;
        this.setVelocity(0, 0);
        this.comboIndex = 0;
        if (state === State.CLIMB) this.setFacingAngle(-Math.PI / 2); // 벽을 마주봄 (뒷모습)
        break;
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
    const circle = this.getHitCircle();
    let landed = false;
    // 채집 대상(나무·바위): 피해 숫자 대신 부스러기, 무기 gatherPower만큼 깎임. 칼이 한 번 지날 때 한 번만
    for (const g of findHits(circle, this.getGatherTargets?.() ?? [])) {
      if (this.hitThisSwing.has(g)) continue;
      this.hitThisSwing.add(g);
      g.gatherHit(this.weapon.gatherPower ?? 1, this.x);
      landed = true;
    }
    const hits = findHits(circle, this.getTargets());
    for (const target of hits) {
      if (this.hitThisSwing.has(target)) continue; // 한 번 휘두를 때 같은 대상은 한 번만
      this.hitThisSwing.add(target);
      // 스킬: 무리 사냥(comboRamp) = 연속기 n타째 +perStep×n, 사냥꾼의 감 = 반격 피해 배율
      const ramp = this.skills.reduce((acc, sk) => acc + (sk.type === 'comboRamp' ? sk.perStep * this.comboIndex : 0), 0);
      const base = m.damage * (1 + ramp);
      const dmg = Math.round(this.counterSwing ? base * this.data_.perfectDodge.counterDamageMultiplier * this.modifier('counterDamageMultiplier') : base);
      const dealt = target.takeDamage(dmg, { fromX: this.x, fromY: this.y });
      spawnDamageNumber(this.scene, target.x, target.getHurtbox().y - 10, dealt, this.counterSwing ? '#9fdcff' : undefined);
      if (this.counterSwing) spawnBigLabel(this.scene, target.x, target.getHurtbox().y - 18, '반격!', '#9fdcff');
      // 적중 시 발동 스킬 (예: 독니 → 독)
      for (const s of this.skills) {
        if (s.type === 'onHitPoison' && target.status && target.isHittable) target.status.applyPoison(s);
      }
      landed = true;
    }
    if (landed) {
      this.makeNoise('hit');
      this.hitstopMs = m.hitstopMs;
      this.scene.cameras.main.shake(80 + m.hitstopMs, m.shake);
    }
  }

  // ---------- 겉모습 (임시 그래픽용 몸 움직임) ----------
  /** 상태에 따라 몸을 기울이고 웅크린다. 진짜 애니메이션이 들어오면 이 부분을 대체. */
  /**
   * 3D → 도트 시트에서 지금 보여 줄 프레임 고르기.
   * 방향: 바라보는 각도에 가장 가까운 8방향. 동작: 상태에 맞춰, 공격은 예비동작/판정/후딜 진행도에 맞춰 프레임을 고른다.
   * Godot: AnimatedSprite2D + SpriteFrames("동작_방향"), 공격은 AnimationPlayer로 상태 시간에 맞춤.
   */
  updateHero3d() {
    const meta = this.hero3d;
    const v = this.visual;
    const deg = this.facingAngle * 180 / Math.PI;           // 0=오른쪽, 90=아래
    const dir = (((Math.round((90 - deg) / 45)) % 8) + 8) % 8; // 0=아래, 1=오른쪽아래, 2=오른쪽 … (시트 순서)
    const dt = this.inHitstop ? 0 : this.dt;
    const prog = (total) => Math.min(0.999, Math.max(0, 1 - this.stateTime / total));
    let anim = 'idle', t = 0;
    switch (this.state) {
      case State.FREE: {
        const sp = Math.hypot(this.body.velocity.x, this.body.velocity.y);
        anim = sp > 15 ? 'walk' : 'idle';
        this.animClock += dt * (anim === 'walk' ? Math.max(0.6, sp / 140) : 0.6);
        const a = meta.anims[anim];
        t = ((this.animClock / 100) % a.frames) / a.frames; // 걷기 약 10프레임/초
        break;
      }
      case State.WINDUP: case State.ACTIVE: case State.RECOVERY: {
        const n = this.weapon.combo.length, i = this.comboIndex;
        anim = i === n - 1 && n > 1 ? 'atk3' : `atk${(i % 2) + 1}`; // 마지막 타는 내려찍기
        const m = this.currentMove;
        if (this.state === State.WINDUP) t = prog(m.windupMs) * 0.4;
        else if (this.state === State.ACTIVE) t = 0.4 + prog(m.activeMs) * 0.25;
        else t = 0.65 + prog(m.recoveryMs) * 0.35;
        break;
      }
      case State.ROLL: anim = 'roll'; t = prog(this.data_.roll.durationMs); break;
      case State.HURT: anim = 'hurt'; t = prog(this.data_.hurtMs); break;
      case State.DEAD: anim = 'death'; this.deathClock = (this.deathClock ?? 0) + dt; t = Math.min(0.999, this.deathClock / 600); break;
    }
    if (this.state !== State.DEAD) this.deathClock = 0;
    const a = meta.anims[anim];
    const frame = Math.min(a.frames - 1, Math.floor(t * a.frames));
    v.setFrame((a.row + dir) * meta.columns + frame);
    v.setPosition(this.x, this.y).setDepth(this.depth).setAngle(0).setScale(1).setFlipX(false);
    if (this.state === State.WINDUP) v.setTint(0xffd9a0);
    else if (this.state !== State.HURT) v.clearTint();
    if (this.state !== State.ROLL && this.state !== State.DEAD) v.setAlpha(this.invulnMs > 0 && Math.floor(this.invulnMs / 80) % 2 === 0 ? 0.45 : 1);
  }

  /**
   * 2D 도트 주인공 겉모습: 부위별 층(머리·몸·팔 앞뒤·다리·무기 앞뒤)의 시트 이름.
   * 무기 종류(검·대검·맨손)에 따라 모션 세트가 달라 층 시트도 그 종류용을 쓴다.
   * @returns {{cls:string, keys:Object<string,string>}}
   */
  heroLook() {
    const meta = this.heroPx;
    const cls = this.weapon && meta.weapons[this.weaponId] ? meta.weapons[this.weaponId].class : 'fist';
    const look = this.look ?? {};
    const keys = {};
    for (const part of ['head', 'body', 'arms', 'legs']) {
      const byOutfit = meta.parts[part][look[part] ?? 'rags'] ?? meta.parts[part].rags;
      Object.assign(keys, byOutfit[cls] ?? meta.parts[part].rags[cls]); // 그 무기 종류용 그림이 없으면 기본 옷
    }
    if (cls !== 'fist') { keys.wpnB = meta.weapons[this.weaponId].wpnB; keys.wpnF = meta.weapons[this.weaponId].wpnF; }
    return { cls, keys };
  }

  /** 층 이미지들 (다리 층 = this.visual, 나머지는 여기서 만들어 같이 움직임) */
  heroLayerImage(k) {
    if (k === 'legs') return this.visual;
    this.heroLayers ??= {};
    this.heroLayers[k] ??= this.scene.add.image(this.x, this.y, '__DEFAULT').setOrigin(this.heroPx.origin.x, this.heroPx.origin.y).setVisible(false);
    return this.heroLayers[k];
  }

  /** 지금 보이는 모든 층 (잔상 등 효과용) */
  get heroSprites() {
    if (!this.heroPx) return [this.visual];
    return [this.visual, ...Object.values(this.heroLayers ?? {}).filter((i) => i.visible)];
  }

  /**
   * 2D 도트 주인공 (3/4 탑뷰 8방향 — 그린 건 5방향, 왼쪽 계열은 뒤집기, 칼이 그림에 포함).
   * 공격 프레임: [예비동작…] → 잔상 → 타격(길게 유지) → 마무리 → 제자리. 상태 시간에 맞춰 고른다.
   * Godot: AnimatedSprite2D + SpriteFrames("동작_방향") + flip_h, 공격은 AnimationPlayer로 상태 시간에 맞춤.
   */
  updateHeroPx() {
    const meta = this.heroPx;
    const v = this.visual;
    const look = this.heroLook();
    const cls = meta.classes[look.cls];
    const deg = this.facingAngle * 180 / Math.PI; // 0=오른쪽, 90=아래
    const DIR8 = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
    const [view, flip] = meta.dirs[DIR8[((Math.round(deg / 45) % 8) + 8) % 8]];
    const vi = meta.views.indexOf(view);
    const dt = this.inHitstop ? 0 : this.dt;
    const prog = (total) => Math.min(0.999, Math.max(0, 1 - this.stateTime / total));
    let anim = 'idle', frame = 0;
    switch (this.state) {
      case State.FREE: {
        const sp = Math.hypot(this.body.velocity.x, this.body.velocity.y);
        const moving = sp > 15;
        // 이동 모션: 웅크림 / 전력질주 / 뒷걸음질·느린 걸음 = 걷기 / 보통 = 뛰기
        const back = moving && (this.body.velocity.x * this.facing.x + this.body.velocity.y * this.facing.y) < 0;
        const runAnim = cls.anims.run ? (this.isSprinting && cls.anims.sprint ? 'sprint' : back || sp < 90 ? 'walk' : 'run') : 'walk';
        anim = this.isSneaking ? (moving ? 'sneak' : 'sneak_idle') : (moving ? runAnim : 'idle');
        this.animClock += dt * (moving ? Math.max(0.6, sp / (anim === 'sprint' ? 217 : 140)) : 1);
        const per = { walk: 130, run: 105, sprint: 90, sneak: 110, idle: 450, sneak_idle: 600 }[anim]; // 웅크려 걷기는 느린 속도에 맞춰 보폭 자주
        frame = Math.floor(this.animClock / per) % cls.anims[anim].frames;
        break;
      }
      case State.WINDUP: case State.ACTIVE: case State.RECOVERY: {
        const names = Object.keys(cls.anims).filter((n) => n.startsWith('atk') || n.startsWith('gs') || n.startsWith('pn'));
        anim = names[Math.min(this.comboIndex, names.length - 1)];
        const n = cls.anims[anim].frames;
        const antic = n - 4, smear = n - 4, impact = n - 3, follow = n - 2, rest = n - 1;
        const m = this.currentMove;
        if (this.state === State.WINDUP) frame = Math.min(antic - 1, Math.floor(prog(m.windupMs) * antic));
        else if (this.state === State.ACTIVE) frame = prog(m.activeMs) < 0.5 ? smear : impact;
        else { const t = prog(m.recoveryMs); frame = t < 0.4 ? impact : t < 0.75 ? follow : rest; }
        break;
      }
      case State.ROLL: anim = 'roll'; frame = Math.floor(prog(this.data_.roll.durationMs) * cls.anims.roll.frames); break;
      case State.JUMP: anim = 'walk'; frame = 1; break;
      case State.CLIMB: anim = 'walk'; frame = Math.floor((this.climbAnim ?? 0) / 6) % cls.anims.walk.frames; break;
      case State.GATHER: anim = cls.anims.gather ? 'gather' : 'idle'; frame = Math.floor(prog(this.data_.gather.durationMs) * (cls.anims.gather?.frames ?? 1)); break;
      case State.HURT: anim = 'hurt'; frame = Math.floor(prog(this.data_.hurtMs) * cls.anims.hurt.frames); break;
      case State.KNOCKDOWN: {
        // 공중(0~1) → 떨어져 누움(2~3) → 일어남(4~5)
        const kd = this.data_.knockdown, t = this.knockdownTotal - this.stateTime;
        anim = 'knockdown';
        if (t < kd.airMs) frame = t < kd.airMs * 0.5 ? 0 : 1;
        else if (t < kd.airMs + kd.downMs) frame = t < kd.airMs + 120 ? 2 : 3;
        else frame = t < kd.airMs + kd.downMs + kd.getUpMs * 0.55 ? 4 : 5;
        break;
      }
      case State.DEAD:
        anim = 'death';
        this.deathClock = (this.deathClock ?? 0) + dt;
        frame = Math.floor(this.deathClock / 170);
        break;
    }
    if (this.state !== State.DEAD) this.deathClock = 0;
    const a = cls.anims[anim] ?? cls.anims.idle;
    const fi = (a.row + vi) * cls.columns + Math.min(frame, a.frames - 1);
    if (this.state === State.WINDUP) v.setTint(0xffe0b0);
    else if (this.state !== State.HURT) v.clearTint();
    if (this.state !== State.ROLL && this.state !== State.DEAD) v.setAlpha(this.invulnMs > 0 && Math.floor(this.invulnMs / 80) % 2 === 0 ? 0.45 : 1);
    // 층을 방향별 순서대로 겹침 (다리 층의 색·투명도를 나머지 층이 따라감)
    const order = meta.layerOrder[view];
    for (let i = 0; i < order.length; i++) {
      const k = order[i], key = look.keys[k];
      const img = this.heroLayerImage(k);
      if (!key) { img.setVisible(false); continue; }
      if (img.texture.key !== key) img.setTexture(key);
      img.setFrame(fi).setVisible(true).setPosition(this.x, this.y - (this.airZ ?? 0)).setDepth(this.depth + i * 0.001)
        .setAngle(0).setScale(1).setFlipX(flip);
      if (img === v) continue;
      img.setAlpha(v.alpha);
      if (v.isTinted) { if (v.tintFill) img.setTintFill(v.tintTopLeft); else img.setTint(v.tintTopLeft); } else img.clearTint();
    }
  }

  updatePose() {
    if (this.heroPx) { this.updateHeroPx(); return; }
    if (this.hero3d) { this.updateHero3d(); return; }
    const v = this.visual;
    v.setPosition(this.x, this.y).setDepth(this.depth);
    if (Math.abs(this.facing.x) > 0.25) v.setFlipX(this.facing.x < 0); // 위/아래를 볼 땐 좌우 뒤집기 유지
    const dir = this.facing.x; // 옆을 볼수록 크게 기울고, 위/아래를 볼 땐 거의 안 기움
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
    } else if (this.state === State.HURT || this.state === State.KNOCKDOWN) {
      lean = -dir * (this.state === State.KNOCKDOWN ? 70 : 12);
    } else if (this.isSneaking) {
      squash = 0.8; // 웅크림
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
    if (this.heroPx) return; // 도트 주인공은 그림 안의 잔상으로 대신함
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

    // 락온 표시: 대상 발밑에 테두리 + 머리 위 화살표
    const t = this.lockTarget;
    if (t) {
      const hb = t.getHurtbox();
      g.lineStyle(2, 0xf2d27a, 0.9).strokeEllipse(t.x, t.y - 2, hb.width + 10, 12);
      g.fillStyle(0xf2d27a, 0.95).fillTriangle(t.x - 5, hb.y - 14, t.x + 5, hb.y - 14, t.x, hb.y - 7);
      g.setDepth(100000);
    }

    // 공격 판정 범위 (디버그 모드에서만)
    if (this.scene.physics.world.drawDebug && this.state === State.ACTIVE) {
      const c = this.getHitCircle();
      g.setDepth(100000);
      g.lineStyle(1, 0xff3030, 1).strokeCircle(c.x, c.y, c.radius);
    }
  }
}
