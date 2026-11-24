/**
 * 연출(컷신) 진행기 — 내용은 data/cutscenes.json. 화면·월드와는 "감독"(CutsceneDirector)을 통해서만 이야기한다.
 *   연출 = { if: 조건, repeat?: 다시 볼 수 있음, bars?: false(검은 띠 없음), steps: [ 단계… ] }
 *   단계 = 동사 하나 + 옵션. 예) {"say": ["나", "아버지…?"]}, {"camera": "marker:boar_spot", "ms": 1500}, {"wait": 600}
 *   동사: say(대사, 키로 넘김) · card(검은 화면 글) · wait · fade(out|in) · camera(player|marker:이름|npc:이름|boss:이름|{x,y}) ·
 *         zoom · shake · flash · slowmo · tint(붉은 화면 등, null이면 끔) · do(대화의 "할 일"과 같음) · run(월드의 이름 붙은 동작) ·
 *         hint(조작 안내) · banner(큰 글씨) · talk(NPC와 대화 열고 끝날 때까지)
 *   단계는 하나씩 차례로 기다린다 (Promise). 진행 중엔 플레이어 조작이 막히고 몬스터는 멈춘다(감독이 정함).
 * Godot: Cutscene.gd — 같은 JSON을 읽어 await로 차례 실행 (또는 AnimationPlayer 타임라인).
 */
export const VERBS = ['say', 'card', 'wait', 'fade', 'camera', 'zoom', 'shake', 'flash', 'slowmo', 'tint', 'do', 'run', 'hint', 'banner', 'talk'];

export class Cutscene {
  /** @param {string} id @param {object} def cutscenes.json[id] @param {object} director 동사 이름의 메서드를 가진 감독 */
  constructor(id, def, director) {
    this.id = id;
    this.def = def;
    this.director = director;
    this.done = false;
  }

  async play() {
    this.director.begin(this);
    try {
      for (const step of this.def.steps) {
        const verb = VERBS.find((v) => v in step);
        if (!verb) { console.warn(`[Cutscene ${this.id}] 모르는 단계`, step); continue; }
        await this.director[verb](step[verb], step);
      }
    } catch (e) {
      console.error(`[Cutscene ${this.id}]`, e);
    }
    this.done = true;
    this.director.end(this);
  }
}
