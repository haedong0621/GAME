import { testCondition } from './Conditions.js';

/**
 * 대화 진행기 (화면과 분리된 순수 로직). 내용은 data/dialogues.json.
 *   시작 노드: entries에서 조건(if)이 맞는 첫 것. 노드 = lines(줄들) → choices(선택지) 또는 next(다음 노드), do(할 일).
 *   random 노드는 여러 대사 묶음 중 하나만.
 * 화면(DialoguePanel)은 current()로 지금 보여 줄 것을 받고, next()/choose(i)로 진행한다.
 * Godot: Dialogue.gd — 같은 JSON을 읽어 같은 규칙 (또는 Dialogic 등 플러그인으로 옮김).
 */
export class Dialogue {
  /**
   * @param {object} script dialogues.json[npc]
   * @param {{quests:import('./QuestLog.js').QuestLog, inventory, act:(action:object)=>void, companion?:()=>string}} ctx
   */
  constructor(script, ctx) {
    this.script = script;
    this.ctx = ctx;
    const entry = script.entries.find((e) => !e.if || this.test(e.if));
    this.goto(entry?.node);
  }

  test(c) { return testCondition(c, this.ctx); }

  goto(nodeId) {
    this.node = nodeId ? this.script.nodes[nodeId] : null;
    this.line = 0;
    if (!this.node) { this.lines = []; return; }
    const r = this.node.random;
    this.lines = r ? r[Math.floor(Math.random() * r.length)] : (this.node.lines ?? []);
    this.didActions = false;
  }

  get finished() { return !this.node; }

  /** 지금 보여 줄 것: {speaker, text, choices?} */
  current() {
    if (!this.node) return null;
    const [speaker, text] = this.lines[this.line] ?? ['', ''];
    const last = this.line >= this.lines.length - 1;
    const choices = last ? (this.node.choices ?? []).filter((c) => this.test(c.if)) : [];
    return { speaker, text, choices };
  }

  runActions() {
    if (this.didActions) return;
    this.didActions = true;
    for (const a of this.node.do ?? []) this.ctx.act(a);
  }

  /** 다음 줄 (선택지가 있는 마지막 줄이면 안 넘어감) */
  next() {
    if (!this.node) return;
    if (this.line < this.lines.length - 1) { this.line++; return; }
    if ((this.current().choices ?? []).length) return;
    this.runActions();
    this.goto(this.node.next);
  }

  choose(i) {
    const cur = this.current();
    const c = cur?.choices[i];
    if (!c) return;
    this.runActions();
    this.goto(c.goto);
  }
}
