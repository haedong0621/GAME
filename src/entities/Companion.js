import { spawnDust } from '../systems/Effects.js';

/**
 * 동료 (스카이림식, 장비 바꿔 주기 없음). 어떤 NPC(Npc)에 붙는 "머리" — 지금은 토브.
 * 설정은 data/npcs.json의 companion, 혼잣말은 data/dialogues.json의 banter 대본.
 *   mode: 'home'(거점에 있음) · 'follow'(따라옴) · 'wait'(그 자리에서 기다림) — 대화로 바꿈
 *   따라오기: 멀어지면 걷다가 뛰고, 싸움이 나면 플레이어 뒤(적 반대편)로 물러나 있음, 적이 붙으면 도망.
 *             너무 멀거나 막혀서 못 오면 플레이어 근처로 순간이동 ("헉헉, 기다려!").
 *   치료: 플레이어 체력이 낮으면 잠깐 주문을 외워 회복 (쿨타임).
 *   혼잣말: 밤·아침·배고픔·목마름·피로·위험·보스 처치·지역 도착·가끔 심심할 때 말풍선.
 * 적은 동료를 노리지 않는다 (죽지 않는 동료).
 * Godot: Companion.gd (NPC 씬에 붙는 노드) — 같은 상태 3개 + NavigationAgent2D로 따라오기.
 */
export class Companion {
  /**
   * @param {import('./Npc.js').Npc} npc
   * @param {object} cfg npcs.json[id].companion
   * @param {object} banter dialogues.json[cfg.banter.script]
   * @param {Phaser.GameObjects.Zone} feet 물리 몸 (발밑)
   */
  constructor(scene, npc, cfg, banter, feet) {
    this.scene = scene;
    this.npc = npc;
    this.cfg = cfg;
    this.banter = banter ?? {};
    this.feet = feet;
    this.home = { x: npc.x, y: npc.y };
    this.mode = 'home';
    this.healCd = 0;
    this.cast = null;
    this.banterCd = 6000;
    this.idleIn = this.randIdle();
    this.stuckMs = 0;
    this.walking = false;
    this.said = {};            // 한 번 말하고 나면 조건이 풀릴 때까지 다시 안 하는 혼잣말
    this.npc.isCompanion = true;
  }

  get following() { return this.mode === 'follow'; }
  randIdle() { const [a, b] = this.cfg.banter.idleEveryMs; return a + Math.random() * (b - a); }

  setMode(mode) {
    this.mode = mode;
    this.walking = false;
    this.feet.body.setVelocity(0, 0);
  }

  /** 혼잣말 (force = 말 간격 무시) */
  say(key, force = false) {
    const lines = this.banter[key];
    if (!lines?.length || (!force && this.banterCd > 0)) return false;
    this.npc.say(lines[Math.floor(Math.random() * lines.length)], this.cfg.banter.showMs);
    this.banterCd = this.cfg.banter.gapMs;
    return true;
  }

  /** 월드에서 일어난 일 (kill · bossDown · region:<이름> …) */
  onEvent(key) {
    if (!this.following) return;
    if (key === 'kill' && Math.random() > 0.3) return;
    this.say(key, key === 'bossDown');
  }

  setFeet(x, y) {
    this.feet.body.reset(x, y - 4);
    this.npc.moveTo(x, y);
  }

  /** 플레이어 근처의 걸을 수 있는 자리로 순간이동 (뒤쪽부터 찾음) */
  catchUp(ctx, away) {
    const p = ctx.player;
    const base = away ?? (p.facingAngle ?? 0) + Math.PI;
    for (const r of [40, 56, 28]) {
      for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
        const x = p.x + Math.cos(base + da) * r, y = p.y + Math.sin(base + da) * r * 0.8;
        if (ctx.walkable(x, y, p.x, p.y)) {
          spawnDust(this.scene, this.npc.x, this.npc.y, { x: 0, y: 0 }, 4);
          this.setFeet(x, y);
          spawnDust(this.scene, x, y, { x: 0, y: 0 }, 5);
          this.stuckMs = 0;
          this.say('catchUp');
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @param {number} dt
   * @param {{player, monsters:object[], night:number, needs, onScreen:(x,y)=>boolean, walkable:(x,y,fromX,fromY)=>boolean}} ctx
   */
  update(dt, ctx) {
    const npc = this.npc, p = ctx.player, c = this.cfg, body = this.feet.body;
    this.banterCd -= dt;
    this.healCd -= dt;
    // 물리 몸 → 그림 위치
    npc.moveTo(this.feet.x, this.feet.y + 4);
    let vx = 0, vy = 0, speed = 0;

    if (this.mode === 'home') {
      const dh = Math.hypot(this.home.x - npc.x, this.home.y - npc.y);
      if (dh > 24) {
        if (!ctx.onScreen(npc.x, npc.y) && !ctx.onScreen(this.home.x, this.home.y)) this.setFeet(this.home.x, this.home.y);
        else { vx = this.home.x - npc.x; vy = this.home.y - npc.y; speed = c.walkSpeed; }
      }
    } else if (this.mode === 'follow' && !p.isDead) {
      const dp = Math.hypot(p.x - npc.x, p.y - npc.y);
      // 싸움: 플레이어를 노리는 적 중 가장 가까운 것
      let enemy = null, ed = c.dangerRadius;
      for (const m of ctx.monsters) {
        if (!m.isHittable || m.awareness !== 'alert') continue;
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d < ed) { ed = d; enemy = m; }
      }
      if (enemy && !this.inFight) this.say(enemy.isBoss ? 'bossSpotted' : 'danger', !!enemy.isBoss);
      this.inFight = !!enemy;

      if (dp > c.teleportDist || (this.stuckMs > c.stuckMs && dp > 90)) {
        this.catchUp(ctx, enemy ? Math.atan2(p.y - enemy.y, p.x - enemy.x) : undefined);
      } else if (this.cast) {
        // 주문 외우는 중: 멈춰서 플레이어를 봄
      } else if (enemy) {
        // 플레이어 뒤쪽(적 반대편)으로 물러나 있음
        const ax = p.x - enemy.x, ay = p.y - enemy.y, al = Math.hypot(ax, ay) || 1;
        const tx = p.x + (ax / al) * c.combatDist, ty = p.y + (ay / al) * c.combatDist;
        const dt_ = Math.hypot(tx - npc.x, ty - npc.y);
        if (dt_ > 18) { vx = tx - npc.x; vy = ty - npc.y; speed = dt_ > c.runAt ? c.runSpeed : c.walkSpeed * 1.4; }
      } else {
        if (dp > c.followDist) this.walking = true;
        if (dp < c.stopDist) this.walking = false;
        if (this.walking) { vx = p.x - npc.x; vy = p.y - npc.y; speed = dp > c.runAt ? c.runSpeed : c.walkSpeed; }
      }
      // 겁쟁이: 몬스터가 바로 옆이면 반대로 달아남
      if (!this.cast) {
        for (const m of ctx.monsters) {
          if (!m.isHittable || m.awareness !== 'alert') continue;
          const fx = npc.x - m.x, fy = npc.y - m.y, fd = Math.hypot(fx, fy);
          if (fd < c.fleeRadius && fd > 0) {
            const l = Math.hypot(vx, vy) || 1;
            vx = vx / l + (fx / fd) * 2; vy = vy / l + (fy / fd) * 2; speed = c.runSpeed * 0.85;
            if (!this.said.flee) { this.said.flee = true; this.say('flee', true); }
          }
        }
        if (!enemy) this.said.flee = false;
      }
      this.updateHeal(dt, ctx, dp);
      this.updateBanter(dt, ctx);
    }

    // 움직이기 + 막힘 감지
    const len = Math.hypot(vx, vy);
    if (speed > 0 && len > 0) {
      body.setVelocity((vx / len) * speed, (vy / len) * speed);
      npc.facing = Math.atan2(vy, vx);
      npc.moving = true;
      npc.anim = speed > c.walkSpeed * 1.5 ? 'run' : 'walk';
      const moved = Math.hypot(this.feet.x - (this.lastX ?? this.feet.x), this.feet.y - (this.lastY ?? this.feet.y));
      if (moved < (speed * dt / 1000) * 0.25) this.stuckMs += dt; else this.stuckMs = Math.max(0, this.stuckMs - dt * 2);
    } else {
      body.setVelocity(0, 0);
      npc.moving = !!this.cast;
      if (this.cast) npc.facing = Math.atan2(p.y - npc.y, p.x - npc.x);
      npc.anim = 'idle';
      this.stuckMs = 0;
    }
    this.lastX = this.feet.x; this.lastY = this.feet.y;
  }

  /** 체력이 낮으면 주문을 외워 회복 */
  updateHeal(dt, ctx, dp) {
    const h = this.cfg.heal, p = ctx.player;
    if (this.cast) {
      this.cast.t += dt;
      this.cast.glow.setPosition(this.npc.x, this.npc.y - 14).setDepth(this.npc.y + 0.01);
      if (this.cast.t >= h.castMs) {
        this.cast.glow.destroy();
        this.cast = null;
        if (!p.isDead) ctx.healPlayer(h.amount);
        this.say('heal', true);
      }
      return;
    }
    if (this.healCd > 0 || dp > h.range || p.isDead) return;
    if (p.stats.hp / p.stats.maxHp >= h.belowRatio) return;
    this.healCd = h.cooldownMs;
    const glow = this.scene.add.graphics();
    glow.fillStyle(0x8af0a0, 0.35).fillCircle(0, 0, 14);
    glow.lineStyle(1.5, 0xc8ffd0, 0.9).strokeCircle(0, 0, 14);
    this.scene.tweens.add({ targets: glow, scale: { from: 0.4, to: 1.2 }, alpha: { from: 1, to: 0.5 }, duration: 300, yoyo: true, repeat: -1 });
    this.cast = { t: 0, glow };
    this.say('casting', true);
  }

  /** 상황에 맞는 혼잣말 */
  updateBanter(dt, ctx) {
    const s = this.said, n = ctx.needs;
    const once = (key, cond, reset) => {
      if (cond && !s[key]) { if (this.say(key)) s[key] = true; }
      else if (reset) s[key] = false;
    };
    once('night', ctx.night > 0.6, ctx.night < 0.2);
    once('morning', ctx.night < 0.1 && s.night, false);
    if (s.morning && ctx.night < 0.1) { s.night = false; s.morning = false; }
    once('hungry', n.hunger < 25, n.hunger > 50);
    once('thirsty', n.thirst < 25, n.thirst > 50);
    once('tired', n.rest < 25, n.rest > 50);
    once('lowHp', ctx.player.stats.hp / ctx.player.stats.maxHp < 0.3 && this.healCd > 0, ctx.player.stats.hp / ctx.player.stats.maxHp > 0.6);
    if (!this.inFight) {
      this.idleIn -= dt;
      if (this.idleIn <= 0) { this.idleIn = this.randIdle(); this.say(ctx.night > 0.5 ? 'idleNight' : 'idle'); }
    }
  }

  toJSON() { return { mode: this.mode, x: Math.round(this.npc.x), y: Math.round(this.npc.y) }; }
  load(d) {
    if (!d) return;
    this.setMode(d.mode ?? 'home');
    if (Number.isFinite(d.x) && d.mode !== 'home') this.setFeet(d.x, d.y);
  }
}
