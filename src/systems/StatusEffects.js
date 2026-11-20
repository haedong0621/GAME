import { spawnDamageNumber } from './Effects.js';

/**
 * 상태 이상(지금은 독만). 몬스터·보스가 하나씩 갖고 매 프레임 update.
 * 독: tickMs마다 damagePerTick 피해, durationMs 동안. 다시 걸리면 시간만 초기화(중첩 없음).
 * Godot: StatusEffects.gd (Node) — Timer 또는 _process에서 누적 시간으로 틱.
 */
export class StatusEffects {
  /** @param {{takeDamage:Function, getHurtbox:Function, x:number, y:number, scene:Phaser.Scene}} owner */
  constructor(owner) {
    this.owner = owner;
    this.poison = null; // { damagePerTick, tickMs, remainingMs, tickTimer }
  }

  get isPoisoned() {
    return !!this.poison;
  }

  applyPoison(spec) {
    if (this.poison) {
      this.poison.remainingMs = spec.durationMs;
      return;
    }
    this.poison = { damagePerTick: spec.damagePerTick, tickMs: spec.tickMs, remainingMs: spec.durationMs, tickTimer: spec.tickMs };
  }

  update(dt) {
    const p = this.poison;
    if (!p) return;
    p.remainingMs -= dt;
    p.tickTimer -= dt;
    if (p.tickTimer <= 0) {
      p.tickTimer += p.tickMs;
      const o = this.owner;
      const dealt = o.takeDamage(p.damagePerTick, { fromStatus: true });
      if (dealt > 0) spawnDamageNumber(o.scene, o.x + 6, o.getHurtbox().y - 2, dealt, '#9adf5a');
    }
    if (p.remainingMs <= 0) this.poison = null;
  }

  clear() {
    this.poison = null;
  }
}
