/**
 * 세로 메뉴 목록 (시작 화면·일시정지 메뉴 공용). 키보드(↑↓/W S, Enter/Space), 마우스·터치 모두.
 * Godot: VBoxContainer + Button들 (focus 이동).
 */
export class MenuList {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x 가운데 x
   * @param {number} y 첫 항목 y
   * @param {{label:string, sub?:string, enabled?:boolean, onSelect:Function}[]} items
   * @param {{width?:number, depth?:number, onBack?:Function}} opts onBack: Esc
   */
  constructor(scene, x, y, items, opts = {}) {
    this.scene = scene;
    this.items = items;
    this.opts = opts;
    const w = opts.width ?? 420;
    const depth = opts.depth ?? 100;
    this.sel = Math.max(0, items.findIndex((it) => it.enabled !== false));
    this.objs = [];
    this.rows = items.map((it, i) => {
      const h = it.sub ? 56 : 42;
      const yy = y + items.slice(0, i).reduce((s, p) => s + (p.sub ? 56 : 42) + 8, 0);
      const r = scene.add.rectangle(x, yy + h / 2, w, h, 0x241e17, 0.95).setStrokeStyle(1, 0x5a4a32).setDepth(depth)
        .setInteractive({ useHandCursor: true });
      const t = scene.add.text(x - w / 2 + 18, yy + (it.sub ? 9 : 11), it.label, { fontFamily: 'sans-serif', fontSize: '17px', color: '#efe4cc' }).setDepth(depth + 1);
      const s = it.sub ? scene.add.text(x - w / 2 + 18, yy + 32, it.sub, { fontFamily: 'sans-serif', fontSize: '12px', color: '#a89a80' }).setDepth(depth + 1) : null;
      r.on('pointerover', () => { if (it.enabled !== false) { this.sel = i; this.render(); } });
      r.on('pointerdown', () => { if (it.enabled !== false) { this.sel = i; this.choose(); } });
      this.objs.push(r, t, s);
      return { r, t, s, it };
    });
    this.onKey = (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) this.move(-1);
      else if (['ArrowDown', 'KeyS'].includes(e.code)) this.move(1);
      else if (['Enter', 'Space', 'KeyJ'].includes(e.code)) { e.preventDefault(); this.choose(); }
      else if (e.code === 'Escape' && this.opts.onBack) { e.preventDefault(); this.opts.onBack(); }
    };
    // 메뉴를 연 키가 바로 선택으로 처리되지 않도록 한 박자 뒤에 연결
    this.timer = setTimeout(() => window.addEventListener('keydown', this.onKey), 0);
    this.render();
  }

  move(d) {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.sel + d * k + n * k) % n;
      if (this.items[i].enabled !== false) { this.sel = i; break; }
    }
    this.render();
  }

  choose() {
    const it = this.items[this.sel];
    if (it && it.enabled !== false) it.onSelect();
  }

  render() {
    this.rows.forEach(({ r, t, s, it }, i) => {
      const on = i === this.sel;
      const enabled = it.enabled !== false;
      r.setFillStyle(on ? 0x3e3222 : 0x241e17, 0.95).setStrokeStyle(on ? 2 : 1, on ? 0xc8a860 : 0x5a4a32);
      t.setColor(enabled ? (on ? '#ffe9b8' : '#efe4cc') : '#6a6050');
      s?.setColor(enabled ? '#a89a80' : '#5a5040');
    });
  }

  destroy() {
    clearTimeout(this.timer);
    window.removeEventListener('keydown', this.onKey);
    this.objs.forEach((o) => o?.destroy());
  }
}
