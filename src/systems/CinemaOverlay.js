/**
 * 연출용 화면 (UI 씬): 위아래 검은 띠 · 아래 띠 안 대사 · 검은 화면 글(card) · 어두워지기/밝아지기 · 화면 물들이기(붉은 분노) · 조작 안내(hint).
 * 대사·글은 E / Space / Enter / 클릭으로 넘김 (글자가 다 나오기 전이면 한 번에 보이기).
 * Godot: Cinema.tscn (CanvasLayer) — ColorRect 띠·막 + Label + Tween.
 */
const BAR = 54;

export class CinemaOverlay {
  constructor(scene) {
    this.scene = scene;
    const w = scene.scale.width, h = scene.scale.height;
    this.w = w; this.h = h;
    // 물들이기 (월드 위, HUD 아래)
    this.tintRect = scene.add.rectangle(0, 0, w, h, 0xff0000, 0).setOrigin(0, 0).setDepth(-90);
    // 막 (검은 화면: 어두워지기·card)
    this.curtain = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0, 0).setDepth(184);
    // 위아래 띠
    this.barTop = scene.add.rectangle(0, -BAR, w, BAR, 0x000000, 1).setOrigin(0, 0).setDepth(185);
    this.barBot = scene.add.rectangle(0, h, w, BAR, 0x000000, 1).setOrigin(0, 0).setDepth(185);
    this.name = scene.add.text(w / 2, h - BAR + 6, '', { fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#e8c860' })
      .setOrigin(0.5, 0).setDepth(187);
    this.line = scene.add.text(w / 2, h - BAR + 24, '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#efe4cc', align: 'center', wordWrap: { width: w - 120 } })
      .setOrigin(0.5, 0).setDepth(187);
    this.cardText = scene.add.text(w / 2, h / 2, '', { fontFamily: 'serif', fontSize: '22px', color: '#e8dcc0', align: 'center', lineSpacing: 14 })
      .setOrigin(0.5).setDepth(188).setAlpha(0);
    this.more = scene.add.text(w - 18, h - 18, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#8a7f6a' }).setOrigin(1, 1).setDepth(188);
    // 조작 안내 (화면 위쪽 가운데, 잠시 보였다 사라짐)
    this.hintBox = scene.add.text(w / 2, 46, '', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#ffe8a8', backgroundColor: '#1a140ee6', padding: { x: 14, y: 8 }, align: 'center',
    }).setOrigin(0.5, 0).setDepth(183).setAlpha(0);
    this.waiter = null;
    this.onKey = (e) => {
      if (!this.waiter) return;
      if (['KeyE', 'Space', 'Enter', 'KeyJ'].includes(e.code)) { e.preventDefault(); this.advance(); }
    };
    window.addEventListener('keydown', this.onKey);
    scene.input.on('pointerdown', () => this.advance());
    scene.events.once('shutdown', () => window.removeEventListener('keydown', this.onKey));
  }

  /** 넘김 키 눌림: 글자 나오는 중이면 다 보이기, 아니면 다음 */
  advance() {
    const w = this.waiter;
    if (!w || this.scene.time.now - w.at < 180) return;
    if (w.typing) { w.finish(); return; }
    this.waiter = null;
    w.resolve();
  }

  /** 키를 기다리는 약속 (autoMs가 있으면 그 뒤 저절로) */
  waitKey(autoMs, typing) {
    return new Promise((resolve) => {
      const w = { resolve, at: this.scene.time.now, typing: null, finish: null };
      this.waiter = w;
      if (typing) Object.assign(w, typing(w));
      if (autoMs) window.setTimeout(() => { if (this.waiter === w) { this.waiter = null; resolve(); } }, autoMs);
    });
  }

  bars(on) {
    const t = this.scene.tweens;
    t.add({ targets: this.barTop, y: on ? 0 : -BAR, duration: 350, ease: 'Quad.out' });
    t.add({ targets: this.barBot, y: on ? this.h - BAR : this.h, duration: 350, ease: 'Quad.out' });
    if (!on) { this.name.setText(''); this.line.setText(''); this.more.setText(''); }
  }

  /** 대사 한 줄 (아래 띠 안) */
  say(name, color, text, autoMs) {
    this.name.setText(name ?? '').setColor(color ?? '#e8c860');
    this.more.setText('E / Space ▶');
    return this.waitKey(autoMs, (w) => this.typewriter(this.line, text, w)).then(() => { this.line.setText(''); this.name.setText(''); this.more.setText(''); });
  }

  /** 한 글자씩 */
  typewriter(target, text, w) {
    let n = 0;
    const ev = this.scene.time.addEvent({ delay: 24, loop: true, callback: () => {
      n++; target.setText(text.slice(0, n));
      if (n >= text.length) done();
    } });
    const done = () => { ev.remove(); target.setText(text); w.typing = false; };
    target.setText('');
    return { typing: true, finish: done };
  }

  /** 검은 화면에 글 (줄마다 키로 넘김). 끝나도 화면은 검은 채 — 다음에 fade in */
  async card(lines, autoMs) {
    this.scene.tweens.killTweensOf(this.curtain);
    this.curtain.setFillStyle(0x000000).setAlpha(1);
    this.more.setText('E / Space ▶');
    for (const text of lines) {
      this.cardText.setText(text).setAlpha(0);
      this.scene.tweens.add({ targets: this.cardText, alpha: 1, duration: 500 });
      await this.waitKey(autoMs);
      await new Promise((r) => this.scene.tweens.add({ targets: this.cardText, alpha: 0, duration: 300, onComplete: r }));
    }
    this.more.setText('');
  }

  fade(dir, ms = 800, color = '#000000') {
    this.scene.tweens.killTweensOf(this.curtain);
    this.curtain.setFillStyle(window.Phaser.Display.Color.HexStringToColor(color).color);
    return new Promise((r) => this.scene.tweens.add({ targets: this.curtain, alpha: dir === 'out' ? 1 : 0, duration: ms, onComplete: r }));
  }

  /** 화면 물들이기 (분노 = 붉게). color null이면 끔 */
  tint(color, alpha = 0.22, ms = 600) {
    if (color) this.tintRect.setFillStyle(window.Phaser.Display.Color.HexStringToColor(color).color);
    this.scene.tweens.killTweensOf(this.tintRect);
    this.scene.tweens.add({ targets: this.tintRect, fillAlpha: color ? alpha : 0, duration: ms });
  }

  /** 조작 안내 (ms 동안) */
  hint(text, ms = 5000) {
    const b = this.hintBox;
    this.scene.tweens.killTweensOf(b);
    b.setText(text).setAlpha(0).setY(36);
    this.scene.tweens.add({ targets: b, alpha: 1, y: 46, duration: 250, ease: 'Quad.out' });
    this.scene.tweens.add({ targets: b, alpha: 0, delay: ms, duration: 500 });
  }
}
