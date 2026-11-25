/**
 * 누구를 노릴까 (몬스터 하나마다 하나): 플레이어와 동료 중 고른다.
 *   위협(threat) = 나를 때린 만큼 쌓이고 1초에 decayPerSec 비율로 식는다.
 *   점수 = 위협 + 가까움(가까울수록 큼) + 플레이어 기본 점수(아무 일 없으면 플레이어).
 *   쓰러진 동료·숨은 동료는 못 고름. 1초마다 다시 고르고, 지금 대상이 쓰러지면 바로 다시 고른다.
 * Godot: Aggro.gd (몬스터 노드에 붙는 RefCounted) — 같은 규칙.
 */
export class Aggro {
  constructor({ decayPerSec = 0.15, playerBias = 6, nearWeight = 400 } = {}) {
    this.threat = new Map();
    this.decay = decayPerSec;
    this.playerBias = playerBias;
    this.nearWeight = nearWeight;
    this.foe = null;
    this.retargetMs = 0;
  }

  /** 맞음 (who = 때린 쪽, 없으면 플레이어로 침) */
  add(who, amount) {
    if (!who) return;
    this.threat.set(who, (this.threat.get(who) ?? 0) + amount);
    if (who !== this.foe) this.retargetMs = Math.min(this.retargetMs, 150); // 곧 다시 생각
  }

  /**
   * @param {{x:number,y:number}} self 몬스터
   * @param {{player, allies?:Array}} ctx allies = 동료 (isTargetable, x, y, receiveHit…)
   * @param {number} dt
   */
  pick(self, ctx, dt) {
    const p = ctx.player;
    const allies = (ctx.allies ?? []).filter((a) => a.isTargetable);
    for (const [k, v] of this.threat) this.threat.set(k, v * Math.max(0, 1 - this.decay * dt / 1000));
    this.retargetMs -= dt;
    const valid = (t) => t === p || allies.includes(t);
    if (this.foe && valid(this.foe) && !this.foe.isDead && this.retargetMs > 0) return this.foe;
    this.retargetMs = 1000;
    const score = (t, bias) => (this.threat.get(t) ?? 0) + bias + this.nearWeight / Math.max(30, Math.hypot(t.x - self.x, t.y - self.y));
    let best = p, bestScore = p.isDead ? -Infinity : score(p, this.playerBias);
    for (const a of allies) {
      const s = score(a, 0);
      if (s > bestScore) { best = a; bestScore = s; }
    }
    this.foe = best;
    return best;
  }

  /** 지금 노리는 게 플레이어가 아닌가 */
  isOnAlly(ctx) { return this.foe && this.foe !== ctx.player; }
}
