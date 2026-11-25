import { spawnDust, spawnDamageNumber } from '../systems/Effects.js';

/**
 * 동료 (스카이림식, 장비 바꿔 주기 없음). 어떤 NPC(Npc)에 붙는 "머리" — 지금은 토브.
 * 설정은 data/npcs.json의 companion, 혼잣말은 data/dialogues.json의 banter 대본.
 *   mode: 'home'(거점에 있음) · 'follow'(따라옴) · 'wait'(그 자리에서 기다림) — 대화로 바꿈
 *   따라오기: 멀어지면 걷다가 뛰고, 싸움이 나면 플레이어 뒤(적 반대편)로 물러나 있음, 적이 붙으면 도망.
 *             너무 멀거나 막혀서 못 오면 플레이어 근처로 순간이동 ("헉헉, 기다려!").
 *   치료: 플레이어 체력이 낮으면 잠깐 주문을 외워 회복 (쿨타임).
 *   싸움(스카이림식): 불꽃 주문(맞음·픽 꺼짐·제 얼굴에 터짐 — 반쪽짜리 마법사), 적이 바로 옆이면 주먹질.
 *   적도 동료를 노린다(Aggro: 때린 만큼·가까운 만큼). 체력이 다 닳으면 쓰러졌다가, 싸움이 끝나면(또는 한참 뒤) 일어남 — 죽지 않음.
 *   혼잣말: 밤·아침·배고픔·목마름·피로·위험·보스 처치·지역 도착·가끔 심심할 때 말풍선.
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
    // 싸움
    this.combat = cfg.combat;
    this.maxHp = this.combat.maxHp;
    this.hp = this.maxHp;
    this.downed = false;
    this.spellCd = 1500;
    this.bonkCd = 0;
    this.invulnMs = 0;
    this.lastHurtMs = 1e9;
    this.action = null;        // {kind: 'cast'|'bonk', t, dur, target}
    this.knock = null;
    this.hpGfx = scene.add.graphics();
  }

  // ---------- 몬스터가 보는 모습 (Aggro·공격 판정) ----------
  get x() { return this.npc.x; }
  get y() { return this.npc.y; }
  get isDead() { return this.downed; }
  get isTargetable() { return this.mode === 'follow' && !this.downed && !this.npc.hidden; }
  get isHittable() { return this.isTargetable; }
  getHurtbox() { return { x: this.npc.x - 7, y: this.npc.y - 24, width: 14, height: 24 }; }

  /** 몬스터에게 맞음 → 'hit' | 'ignored' */
  receiveHit(damage, fromX, fromY) {
    if (!this.isTargetable || this.invulnMs > 0) return 'ignored';
    this.hp -= damage;
    this.invulnMs = 450;
    this.lastHurtMs = 0;
    spawnDamageNumber(this.scene, this.npc.x, this.npc.y - 30, damage, '#ff8a7a');
    for (const img of Object.values(this.npc.layers)) img.setTintFill(0xff4030);
    this.scene.time.delayedCall(90, () => { for (const img of Object.values(this.npc.layers)) img.clearTint(); });
    const dx = this.npc.x - fromX, dy = this.npc.y - fromY, d = Math.hypot(dx, dy) || 1;
    this.knock = { x: dx / d, y: dy / d, ms: 180 };
    this.cancelActions();
    if (this.hp <= 0) this.goDown();
    else this.say('hurt');
    return 'hit';
  }

  cancelActions() {
    this.action = null;
    this.npc.frameOverride = null;
    if (this.cast) { this.cast.glow.destroy(); this.cast = null; this.healCd = Math.max(this.healCd, 3000); }
  }

  goDown() {
    this.hp = 0;
    this.downed = true;
    this.downMs = 0;
    this.quietMs = 0;
    this.npc.downed = true;
    this.feet.body.setVelocity(0, 0);
    this.say('downed', true);
  }

  getUp() {
    this.downed = false;
    this.npc.downed = false;
    this.hp = Math.round(this.maxHp * this.combat.down.getUpRatio);
    this.invulnMs = 1200;
    this.say('getUp', true);
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
    this.invulnMs -= dt;
    this.lastHurtMs += dt;
    this.spellCd -= dt;
    this.bonkCd -= dt;
    this.drawHp();
    if (this.downed) { body.setVelocity(0, 0); npc.moving = true; this.updateDowned(dt, ctx); return; }
    if (this.knock) {
      // 맞고 밀려남
      this.knock.ms -= dt;
      body.setVelocity(this.knock.x * 140, this.knock.y * 140);
      if (this.knock.ms <= 0) this.knock = null;
      return;
    }
    // 싸움 밖에선 천천히 회복
    const rg = this.combat.regen;
    if (!this.inFight && this.lastHurtMs > rg.delayMs) this.hp = Math.min(this.maxHp, this.hp + rg.perSec * dt / 1000);
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
      } else if (this.cast || this.action) {
        // 주문 외우는 중·주먹질 중: 멈춤
      } else if (enemy) {
        // 플레이어 쪽(적 반대편)으로, 적에게서 combatDist 떨어져 주문 거리 유지
        const ax = p.x - enemy.x, ay = p.y - enemy.y, al = Math.hypot(ax, ay) || 1;
        const tx = enemy.x + (ax / al) * c.combatDist, ty = enemy.y + (ay / al) * c.combatDist;
        const dt_ = Math.hypot(tx - npc.x, ty - npc.y);
        if (dt_ > 18) { vx = tx - npc.x; vy = ty - npc.y; speed = dt_ > c.runAt ? c.runSpeed : c.walkSpeed * 1.4; }
      } else {
        if (dp > c.followDist) this.walking = true;
        if (dp < c.stopDist) this.walking = false;
        if (this.walking) { vx = p.x - npc.x; vy = p.y - npc.y; speed = dp > c.runAt ? c.runSpeed : c.walkSpeed; }
      }
      if (enemy || this.action) this.updateCombat(dt, ctx);
      // 겁쟁이: 몬스터가 바로 옆이면 반대로 달아남
      if (!this.cast && !this.action) {
        for (const m of ctx.monsters) {
          if (!m.isHittable || m.awareness !== 'alert') continue;
          const fx = npc.x - m.x, fy = npc.y - m.y, fd = Math.hypot(fx, fy);
          if (fd < c.fleeRadius && fd > 0) {
            const l = Math.hypot(vx, vy) || 1;
            // 적 반대쪽 + 플레이어 쪽으로 (소년 뒤로 숨기) — 들개보다 조금 느려서 결국 붙잡히면 주먹질
            const pd = Math.max(1, dp);
            vx = vx / l + (fx / fd) * 2 + ((p.x - npc.x) / pd) * 1.2; vy = vy / l + (fy / fd) * 2 + ((p.y - npc.y) / pd) * 1.2; speed = c.fleeSpeed;
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
      npc.moving = !!this.cast || !!this.action;
      if (this.cast) npc.facing = Math.atan2(p.y - npc.y, p.x - npc.x);
      if (this.action?.target) npc.facing = Math.atan2(this.action.target.y - npc.y, this.action.target.x - npc.x);
      npc.anim = this.action?.kind === 'bonk' ? 'pn1' : 'idle';
      this.stuckMs = 0;
    }
    this.lastX = this.feet.x; this.lastY = this.feet.y;
  }

  /** 싸움: 주먹질(바로 옆) · 불꽃 주문(사거리 안) — 하나씩, 쿨타임 */
  updateCombat(dt, ctx) {
    const cb = this.combat, npc = this.npc;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      if (a.kind === 'bonk') {
        npc.anim = 'pn1';
        npc.frameOverride = Math.min(4, Math.floor(a.t / a.dur * 5));
        if (!a.done && a.t >= a.dur * 0.45) {
          a.done = true;
          if (a.target.isHittable) a.target.takeDamage(cb.bonk.damage, { fromX: npc.x, fromY: npc.y, source: this });
        }
      } else if (a.kind === 'cast') {
        a.glow.setPosition(npc.x + Math.cos(npc.facing) * 8, npc.y - 18 + Math.sin(npc.facing) * 4).setDepth(npc.y + 1);
      }
      if (a.t >= a.dur) {
        if (a.kind === 'cast') this.finishSpell(a);
        npc.frameOverride = null;
        this.action = null;
      }
      return;
    }
    if (this.cast) return;
    const alive = ctx.monsters.filter((m) => m.isHittable && m.awareness === 'alert');
    const near = (r) => alive.map((m) => [m, Math.hypot(m.x - npc.x, m.y - npc.y)]).filter(([, d]) => d <= r).sort((a, b) => a[1] - b[1])[0]?.[0];
    const close = near(cb.bonk.range);
    if (close && this.bonkCd <= 0) {
      this.bonkCd = cb.bonk.cooldownMs;
      this.action = { kind: 'bonk', t: 0, dur: cb.bonk.durationMs, target: close };
      if (Math.random() < 0.4) this.say('bonk');
      return;
    }
    const sp = cb.spell;
    const tgt = near(sp.range);
    if (tgt && this.spellCd <= 0) {
      this.spellCd = sp.cooldownMs * (0.8 + Math.random() * 0.4);
      const glow = this.scene.add.circle(npc.x, npc.y - 18, 4, 0xffa040, 0.9).setBlendMode('ADD');
      this.scene.tweens.add({ targets: glow, scale: { from: 0.6, to: 1.6 }, duration: 180, yoyo: true, repeat: -1 });
      this.action = { kind: 'cast', t: 0, dur: sp.castMs, target: tgt, glow };
    }
  }

  /** 주문 결과: 맞음 / 픽 꺼짐 / 제 얼굴에 터짐 (반쪽짜리 마법사) */
  finishSpell(a) {
    a.glow.destroy();
    const sp = this.combat.spell, npc = this.npc, scene = this.scene;
    const o = sp.outcomes, r = Math.random() * (o.hit + o.fizzle + o.backfire);
    const hx = npc.x + Math.cos(npc.facing) * 8, hy = npc.y - 18;
    if (r < o.hit && a.target.isHittable) {
      // 불꽃이 날아감
      const t = a.target, ball = scene.add.circle(hx, hy, 3.5, 0xffb040, 1).setBlendMode('ADD').setDepth(npc.y + 50);
      const dist = Math.hypot(t.x - hx, t.y - 14 - hy);
      scene.tweens.add({ targets: ball, x: t.x, y: t.y - 14, duration: dist / sp.speed * 1000, ease: 'Linear', onComplete: () => {
        ball.destroy();
        spawnDust(scene, t.x, t.y - 10, { x: 0, y: 0 }, 3);
        if (t.isHittable) {
          const [lo, hi] = sp.damage;
          t.takeDamage(Math.round(lo + Math.random() * (hi - lo)), { fromX: npc.x, fromY: npc.y, source: this });
        }
        if (Math.random() < 0.25) this.say('spellHit');
      } });
    } else if (r < o.hit + o.fizzle) {
      // 픽…: 회색 연기만
      for (let i = 0; i < 4; i++) {
        const puff = scene.add.circle(hx + (Math.random() - 0.5) * 6, hy, 2 + Math.random() * 2, 0x8a8480, 0.8).setDepth(npc.y + 50);
        scene.tweens.add({ targets: puff, y: hy - 10 - Math.random() * 6, alpha: 0, scale: 2, duration: 500 + Math.random() * 300, onComplete: () => puff.destroy() });
      }
      this.say('fizzle', Math.random() < 0.6);
    } else {
      // 펑: 제 얼굴에 터짐 (자기만 조금 다침, 수염 그을림)
      const boom = scene.add.circle(hx, hy, 6, 0xff8030, 0.9).setBlendMode('ADD').setDepth(npc.y + 50);
      scene.tweens.add({ targets: boom, scale: 3, alpha: 0, duration: 300, onComplete: () => boom.destroy() });
      this.hp = Math.max(1, this.hp - sp.backfireSelfDamage);
      spawnDamageNumber(scene, npc.x, npc.y - 30, sp.backfireSelfDamage, '#ffb060');
      this.say('backfire', true);
    }
  }

  /** 쓰러져 있음: 근처에 싸우는 적이 없으면 quietMs 뒤, 아니어도 maxMs 뒤 일어남 */
  updateDowned(dt, ctx) {
    const d = this.combat.down;
    this.downMs += dt;
    const danger = ctx.monsters.some((m) => m.isHittable && m.awareness === 'alert' && Math.hypot(m.x - this.npc.x, m.y - this.npc.y) < this.cfg.dangerRadius);
    this.quietMs = danger ? 0 : this.quietMs + dt;
    if (this.quietMs >= d.quietMs || this.downMs >= d.maxMs) this.getUp();
  }

  /** 머리 위 작은 체력 바 (다쳤을 때만) */
  drawHp() {
    const g = this.hpGfx, npc = this.npc;
    g.clear();
    if (npc.hidden || this.mode !== 'follow' || (this.hp >= this.maxHp && !this.downed)) return;
    const w = 24, x = npc.x - w / 2, y = npc.y - (this.downed ? 16 : 37);
    g.setDepth(npc.y + 2);
    g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, 4);
    g.fillStyle(this.downed ? 0x6a6a6a : 0x7ad06a).fillRect(x, y, w * Math.max(0, this.hp) / this.maxHp, 2);
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
    if (this.healCd > 0 || dp > h.range || p.isDead || this.action) return;
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
