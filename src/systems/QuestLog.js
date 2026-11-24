/**
 * 퀘스트 진행 (화면과 분리된 순수 로직). 내용은 data/quests.json.
 *   상태: none(안 받음) / active(진행 중) / ready(지금 단계 목표를 채움 — 보고하면 넘어감) / done(끝)
 *   목표: have(아이템 가짐) · kill(받은 뒤 잡은 수) · reach(장소 근처) · talk(대화로 넘김)
 *   turnIn이 없는 단계는 목표를 채우면 자동으로 다음 단계.
 * Godot: QuestLog.gd (Autoload) — 같은 표, signal quest_changed.
 */
export class QuestLog {
  /**
   * @param {object} quests data/quests.json
   * @param {{inventory, onEvent:(type:string, quest:object, extra?:any)=>void}} hooks
   */
  constructor(quests, hooks) {
    this.defs = quests;
    this.hooks = hooks;
    /** id → {stage, kills:{monsterId:n}, reached:bool, talked:bool, done} */
    this.state = {};
    this.flags = {};
  }

  def(id) { return this.defs[id]; }
  stageDef(id) { const s = this.state[id]; return s && !s.done ? this.defs[id].stages[s.stage] : null; }

  status(id) {
    const s = this.state[id];
    if (!s) return 'none';
    if (s.done) return 'done';
    return this.goalsMet(id) ? 'ready' : 'active';
  }

  /** 목표별 진행 [{text, cur, need, ok}] */
  progress(id) {
    const st = this.stageDef(id), s = this.state[id];
    if (!st) return [];
    return st.goals.map((g) => {
      if (g.type === 'have') { const cur = Math.min(g.count, this.hooks.inventory.count(g.item)); return { cur, need: g.count, ok: cur >= g.count }; }
      if (g.type === 'kill') { const cur = Math.min(g.count, s.kills[g.monster] ?? 0); return { cur, need: g.count, ok: cur >= g.count }; }
      if (g.type === 'reach') return { ok: !!s.reached };
      if (g.type === 'talk') return { ok: true };            // 대화하면 넘어감 (보고 단계)
      return { ok: false };
    });
  }

  goalsMet(id) { return this.progress(id).every((p) => p.ok); }

  start(id) {
    if (this.state[id]) return;
    this.state[id] = { stage: 0, kills: {}, reached: false, done: false };
    this.hooks.onEvent('started', this.defs[id]);
    this.enterStage(id);
  }

  enterStage(id) {
    const st = this.stageDef(id);
    const s = this.state[id];
    s.kills = {}; s.reached = false;
    for (const a of st?.onStart ?? []) this.hooks.onEvent('stageAction', this.defs[id], a);
    this.autoAdvance(id);
  }

  /** 보고(대화)로 다음 단계 — 마지막이면 끝 + 보상 */
  advance(id) {
    const s = this.state[id];
    if (!s || s.done || !this.goalsMet(id)) return false;
    const def = this.defs[id];
    if (s.stage + 1 >= def.stages.length) {
      s.done = true;
      this.hooks.onEvent('completed', def);
    } else {
      s.stage++;
      this.hooks.onEvent('stage', def);
      this.enterStage(id);
    }
    return true;
  }

  /** turnIn이 없는 단계는 목표를 채우면 바로 넘김 */
  autoAdvance(id) {
    const st = this.stageDef(id);
    if (st && !st.turnIn && this.goalsMet(id)) this.advance(id);
  }

  onKill(monsterId) {
    for (const [id, s] of Object.entries(this.state)) {
      const st = this.stageDef(id);
      if (!st?.goals.some((g) => g.type === 'kill' && g.monster === monsterId)) continue;
      s.kills[monsterId] = (s.kills[monsterId] ?? 0) + 1;
      this.hooks.onEvent('progress', this.defs[id]);
      this.autoAdvance(id);
    }
  }

  /** 장소 근처에 왔는지 (월드가 가끔 부름) */
  checkReach(x, y, places) {
    for (const [id, s] of Object.entries(this.state)) {
      const st = this.stageDef(id);
      const g = st?.goals.find((q) => q.type === 'reach');
      if (!g || s.reached) continue;
      const p = places.find((q) => q.name === g.place);
      if (p && Math.hypot(p.x - x, p.y - y) <= (g.radius ?? 64)) { s.reached = true; this.hooks.onEvent('progress', this.defs[id]); this.autoAdvance(id); }
    }
  }

  /** 진행 중인 퀘스트 (HUD 표시용) */
  active() { return Object.keys(this.state).filter((id) => !this.state[id].done); }

  toJSON() { return { state: this.state, flags: this.flags }; }
  load(d) { if (!d) return; this.state = d.state ?? {}; this.flags = d.flags ?? {}; }
}
