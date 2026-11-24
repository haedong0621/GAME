/**
 * 생존 게이지 (강도 B: 가벼운 불이익, 죽지는 않음). 수치는 data/world.json의 needs.
 *   배고픔 hunger · 목마름 thirst · 피로 rest — 100 = 가득(배부름·목 안 마름·푹 쉼), 게임 시간 1시간마다 줄어듦.
 *   낮으면 불이익, 높으면 보너스. Player.modifier()와 같은 방식으로 배율을 돌려준다.
 * Godot: Needs.gd (RefCounted) — 게임 시계에서 분 단위로 깎음.
 */
export const NEED_NAMES = { hunger: '배고픔', thirst: '목마름', rest: '피로' };

export class Needs {
  /** @param {object} cfg data/world.json의 needs */
  constructor(cfg) {
    this.cfg = cfg;
    this.hunger = 100;
    this.thirst = 100;
    this.rest = 100;
    /** 「푹 잠」 남은 게임 분 */
    this.wellRestedMin = 0;
  }

  /** 게임 시간 gameMinutes만큼 지남 (잠자는 중이면 피로는 안 줄고 배고픔·목마름은 천천히) */
  tick(gameMinutes, sleeping = false) {
    const h = gameMinutes / 60, d = this.cfg.decayPerHour;
    const slow = sleeping ? this.cfg.sleepDecayMultiplier : 1;
    this.hunger = Math.max(0, this.hunger - d.hunger * h * slow);
    this.thirst = Math.max(0, this.thirst - d.thirst * h * slow);
    if (!sleeping) this.rest = Math.max(0, this.rest - d.rest * h);
    if (this.wellRestedMin > 0) this.wellRestedMin = Math.max(0, this.wellRestedMin - gameMinutes);
  }

  eat(amount) { this.hunger = Math.min(100, this.hunger + amount); }
  drink(amount = 100) { this.thirst = Math.min(100, this.thirst + amount); }
  sleep() { this.rest = 100; this.wellRestedMin = this.cfg.wellRestedHours * 60; }

  /** 지금 걸린 상태 (HUD·설명용): [{key, name, good}] */
  conditions() {
    const c = this.cfg.effects, out = [];
    if (this.hunger <= c.hungry.below) out.push({ key: 'hungry', name: '배고픔', good: false });
    else if (this.hunger >= c.wellFed.above) out.push({ key: 'wellFed', name: '배부름', good: true });
    if (this.thirst <= c.thirsty.below) out.push({ key: 'thirsty', name: '목마름', good: false });
    if (this.rest <= c.tired.below) out.push({ key: 'tired', name: '피로', good: false });
    if (this.wellRestedMin > 0) out.push({ key: 'wellRested', name: '푹 잠', good: true });
    return out;
  }

  /** 배율 (Player.modifier에서 곱함): staminaRegenMultiplier, maxStaminaMultiplier, maxHpMultiplier, rollStaminaMultiplier */
  modifier(key) {
    let m = 1;
    for (const c of this.conditions()) m *= this.cfg.effects[c.key][key] ?? 1;
    return m;
  }

  toJSON() { return { hunger: Math.round(this.hunger), thirst: Math.round(this.thirst), rest: Math.round(this.rest), wellRestedMin: Math.round(this.wellRestedMin) }; }
  load(d) { if (!d) return; for (const k of ['hunger', 'thirst', 'rest', 'wellRestedMin']) if (Number.isFinite(d[k])) this[k] = d[k]; }
}
