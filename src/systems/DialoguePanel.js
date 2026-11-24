/**
 * 대화창 (UI 씬 아래쪽). 열려 있는 동안 월드는 멈춘다.
 * 이름(색) + 대사(한 글자씩 나옴) + 선택지. 조작: E·Space·Enter·클릭 = 다음(글자가 나오는 중이면 한 번에 다 보이기) · 1~4 또는 클릭 = 선택 · Esc = 끝내기(선택지 없을 때)
 * Godot: DialoguePanel.tscn (Control) — RichTextLabel(visible_characters) + 버튼 목록.
 */
const W = 860, H = 150;

export class DialoguePanel {
  /** @param {{dialogue:import('./Dialogue.js').Dialogue, npc:{name:string,title:string,color:string}, onClose:Function}} ctx */
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    const sw = scene.scale.width, sh = scene.scale.height;
    this.x0 = (sw - W) / 2; this.y0 = sh - H - 16;
    this.root = scene.add.container(0, 0).setDepth(140);
    const catcher = scene.add.rectangle(sw / 2, sh / 2, sw, sh, 0x000000, 0.25).setInteractive();
    catcher.on('pointerdown', () => this.advance());
    this.root.add(catcher);
    this.root.add(scene.add.rectangle(sw / 2, this.y0 + H / 2, W, H, 0x14110d, 0.95).setStrokeStyle(2, 0x8a7450));
    this.nameText = scene.add.text(this.x0 + 18, this.y0 + 12, '', { fontFamily: 'sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#e8c860' });
    this.body = scene.add.text(this.x0 + 18, this.y0 + 40, '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#efe4cc', lineSpacing: 6, wordWrap: { width: W - 36 } });
    this.hint = scene.add.text(this.x0 + W - 14, this.y0 + H - 22, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#a89a80' }).setOrigin(1, 0);
    this.root.add([this.nameText, this.body, this.hint]);
    this.choiceTexts = [];
    this.onKey = (e) => {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
      if (n !== undefined) { this.pick(n); return; }
      if (['KeyE', 'Space', 'Enter', 'KeyJ'].includes(e.code)) { e.preventDefault(); this.advance(); }
      if (e.code === 'Escape' && !(this.ctx.dialogue.current()?.choices.length)) { e.preventDefault(); this.close(); }
    };
    this.keyTimer = setTimeout(() => window.addEventListener('keydown', this.onKey), 0);
    this.show();
  }

  /** 지금 줄 보여 주기 (한 글자씩) */
  show() {
    const cur = this.ctx.dialogue.current();
    if (!cur) { this.close(); return; }
    const me = cur.speaker === '나';
    this.nameText.setText(me ? '나' : cur.speaker).setColor(me ? '#9fdcff' : this.ctx.npc.color ?? '#e8c860');
    this.full = cur.text;
    this.shown = 0;
    this.body.setText('');
    for (const t of this.choiceTexts) t.destroy();
    this.choiceTexts = [];
    this.typing?.remove();
    this.typing = this.scene.time.addEvent({ delay: 22, loop: true, callback: () => {
      this.shown++;
      this.body.setText(this.full.slice(0, this.shown));
      if (this.shown >= this.full.length) this.finishTyping();
    } });
    this.hint.setText('');
  }

  finishTyping() {
    this.typing?.remove(); this.typing = null;
    this.body.setText(this.full);
    const cur = this.ctx.dialogue.current();
    if (cur.choices.length) {
      cur.choices.forEach((c, i) => {
        const t = this.scene.add.text(this.x0 + 40, this.y0 + 76 + i * 22, `${i + 1}. ${c.text}`, { fontFamily: 'sans-serif', fontSize: '15px', color: '#9fdcff' })
          .setInteractive({ useHandCursor: true });
        t.on('pointerover', () => t.setColor('#ffffff')); t.on('pointerout', () => t.setColor('#9fdcff'));
        t.on('pointerdown', (p) => { p.event?.stopPropagation?.(); this.pick(i); });
        this.root.add(t);
        this.choiceTexts.push(t);
      });
      this.hint.setText('1~4 또는 클릭으로 고르기');
    } else this.hint.setText('E / Space / 클릭 ▶');
  }

  advance() {
    if (this.typing) { this.finishTyping(); return; }
    const cur = this.ctx.dialogue.current();
    if (cur?.choices.length) return;
    this.ctx.dialogue.next();
    if (this.ctx.dialogue.finished) this.close(); else this.show();
  }

  pick(i) {
    if (this.typing) return;
    const cur = this.ctx.dialogue.current();
    if (!cur?.choices[i]) return;
    this.ctx.dialogue.choose(i);
    if (this.ctx.dialogue.finished) this.close(); else this.show();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.keyTimer);
    window.removeEventListener('keydown', this.onKey);
    this.typing?.remove();
    this.root.destroy(true);
    this.ctx.onClose?.();
  }
}
