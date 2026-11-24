/**
 * 조건 검사 (대화 시작·선택지, 연출(컷신), 맵 표시 등이 같은 규칙을 씀).
 *   {quest, is: none|active|ready|done|stageN, ready?} — 퀘스트 상태 / 지금 단계
 *   {flag} — 이 깃발이 서 있음 · {notFlag} — 이 깃발이 안 서 있음
 *   {has: [아이템, 개수]} — 가방에 가짐 · {companion: home|follow|wait} — 동료 상태
 * Godot: Conditions.gd (static func test(cond, ctx) -> bool)
 * @param {object|undefined} c
 * @param {{quests:import('./QuestLog.js').QuestLog, inventory?, companion?:()=>string}} ctx
 */
export function testCondition(c, ctx) {
  if (!c) return true;
  const q = ctx.quests;
  if (c.quest) {
    const st = q.status(c.quest);
    if (c.is?.startsWith('stage')) {
      const s = q.state[c.quest];
      if (!s || s.done || s.stage !== Number(c.is.slice(5))) return false;
      if (c.ready !== undefined && c.ready !== (st === 'ready')) return false;
    } else if (c.is && c.is !== st) return false;
  }
  if (c.flag && !q.flags[c.flag]) return false;
  if (c.notFlag && q.flags[c.notFlag]) return false;
  if (c.has && (ctx.inventory?.count(c.has[0]) ?? 0) < c.has[1]) return false;
  if (c.companion && ctx.companion?.() !== c.companion) return false;
  return true;
}
