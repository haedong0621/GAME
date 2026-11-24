import { WORLD_ZOOM } from '../config.js';

/**
 * 연출 감독: Cutscene의 동사를 월드(카메라·NPC·보스·퀘스트)와 화면(CinemaOverlay)에 옮긴다.
 * 진행 중엔 world.cutscene이 설정되어 플레이어 조작이 막히고, 몬스터는 멈춘다 (live에 든 것만 움직임).
 * Godot: CutsceneDirector.gd (Autoload) — 같은 동사 함수.
 */
const realWait = (ms) => new Promise((r) => window.setTimeout(r, ms));

export class CutsceneDirector {
  /** @param {import('../scenes/WorldScene.js').WorldScene} world */
  constructor(world) {
    this.world = world;
  }

  get ui() { return this.world.scene.get('UI').cinema; }
  get cam() { return this.world.cameras.main; }

  begin(cs) {
    const w = this.world;
    w.cutscene = cs;
    w.cutsceneLive = new Set();
    w.player.setVelocity(0, 0);
    if (!cs.def.repeat) w.questLog.setFlag(`cs_${cs.id}`);
    if (cs.def.bars !== false) this.ui.bars(true);
  }

  end(cs) {
    const w = this.world;
    if (cs.def.bars !== false) this.ui.bars(false);
    this.cam.startFollow(w.player, true, 0.12, 0.12);
    w.cutscene = null;
    w.inputSystem.clearPressed();
    w.onCutsceneEnd?.(cs);
  }

  /** 'player' | 'marker:이름' | 'npc:이름' | 'boss:이름' | 'corpse:이름' | {x, y} → 좌표 */
  where(t) {
    const w = this.world;
    if (!t || t === 'player') return { x: w.player.x, y: w.player.y - 16 };
    if (typeof t === 'object') return t;
    const [kind, name] = t.split(':');
    if (kind === 'marker') return w.markers[name];
    if (kind === 'npc') { const n = w.npcs.find((q) => q.id === name); return n && { x: n.x, y: n.y - 16 }; }
    if (kind === 'corpse') { const n = w.corpses.find((q) => q.name === name); return n && { x: n.x, y: n.y - 6 }; }
    if (kind === 'boss') { const b = w.bosses.find((q) => q.id === name && q.isHittable); return b && { x: b.x, y: b.y - 24 }; }
    return null;
  }

  // ---------- 동사 ----------
  say([who, text], step) {
    const npcs = this.world.registry.get('npcs');
    const def = npcs[who];
    const name = who === '나' ? '나' : def?.name ?? who;
    const color = who === '나' ? '#9fdcff' : def?.color ?? '#e8c860';
    return this.ui.say(name, color, text, step.ms);
  }
  card(lines, step) { return this.ui.card(Array.isArray(lines) ? lines : [lines], step.ms); }
  wait(ms) { return realWait(ms); }
  fade(dir, step) { return this.ui.fade(dir, step.ms ?? 800, step.color); }
  camera(target, step) {
    const p = this.where(target);
    if (!p) { console.warn('[Cutscene] 카메라 대상 없음', target); return null; }
    const ms = step.ms ?? 1000;
    this.cam.stopFollow();
    return new Promise((r) => {
      this.cam.pan(p.x, p.y, ms, 'Sine.easeInOut', true, (_c, t) => { if (t >= 1) r(); });
    }).then(() => { if (target === 'player') this.cam.startFollow(this.world.player, true, 0.12, 0.12); });
  }
  zoom(z, step) { this.cam.zoomTo(WORLD_ZOOM * z, step.ms ?? 800, 'Sine.easeInOut', true); return step.wait ? realWait(step.ms ?? 800) : null; }
  shake(ms, step) { this.cam.shake(ms, step.intensity ?? 0.008); return null; }
  flash(ms, step) { const c = window.Phaser.Display.Color.HexStringToColor(step.color ?? '#ffffff'); this.cam.flash(ms, c.red, c.green, c.blue); return null; }
  slowmo(factor, step) {
    this.world.setSlowMotion(factor);
    if (step.ms) window.setTimeout(() => this.world.setSlowMotion(1), step.ms);
    return null;
  }
  tint(color, step) { this.ui.tint(color, step.alpha, step.ms); return null; }
  do(action) { (Array.isArray(action) ? action : [action]).forEach((a) => this.world.dialogueAction(a)); return null; }
  run(name, step) {
    const fn = this.world.cutsceneActions[name];
    if (!fn) { console.warn('[Cutscene] 모르는 동작', name); return null; }
    return fn(step);
  }
  hint(text, step) { this.ui.hint(text, step.ms); return null; }
  banner(text, step) { this.world.banner(text, step.color ?? '#e8c860'); return null; }
  /** NPC와 대화를 열고 닫힐 때까지 기다림 */
  async talk(npcId) {
    const w = this.world;
    const npc = w.npcs.find((n) => n.id === npcId);
    if (!npc) return;
    this.ui.bars(false);
    w.openDialogue(npc);
    await realWait(200);
    while (w.registry.get('panelOpen')) await realWait(100);
  }
}
