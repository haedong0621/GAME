/**
 * 제작 화면 (UI 씬 위). 열려 있는 동안 월드는 멈춘다.
 * 왼쪽: 분류 탭(전체·무기·방어구·장신구) + [제작 가능만] 필터 + 목록(마우스 휠·스크롤 막대·↑↓로 스크롤)
 * 오른쪽: 고른 것의 설명·필요한 재료 + [제작] [닫기]
 * 조작: ↑↓/W S 선택 · ←→/Tab 분류 · F 제작 가능만 · Enter/Space/J 제작 · Esc/E 닫기 · 마우스/터치
 * 규칙(재료 확인·소모)은 Crafting.js, 여기는 보여 주기와 입력만.
 * Godot: CraftingPanel.tscn (Control) — TabBar + CheckBox + ItemList(스크롤) + RichTextLabel + Button.
 */
import { SLOT_NAMES } from './Equipment.js';
const W = 720, H = 430, VIS = 5, ROW_H = 54;
const COL = { bg: 0x16130f, panel: 0x241e17, line: 0x5a4a32, sel: 0x3e3222, ok: '#9adf5a', no: '#d06050', text: '#efe4cc', dim: '#a89a80', gold: '#e8c860' };
const TABS = [['all', '전체'], ['weapon', '무기'], ['armor', '방어구'], ['accessory', '장신구']];

export class CraftingPanel {
  /**
   * @param {Phaser.Scene} scene UI 씬
   * @param {{crafting, inventory, player, items, skills, onClose:Function, onCrafted:Function, onNewGame:Function}} ctx
   */
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.tab = 'all';
    this.onlyCraftable = false;
    this.sel = 0;
    this.scroll = 0;
    const cx = scene.scale.width / 2, cy = scene.scale.height / 2;
    this.x0 = cx - W / 2;
    this.y0 = cy - H / 2;

    this.root = scene.add.container(0, 0).setDepth(100);
    const dim = scene.add.rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x000000, 0.55).setInteractive();
    const bg = scene.add.rectangle(cx, cy, W, H, COL.bg, 0.97).setStrokeStyle(2, COL.line);
    this.root.add([dim, bg]);
    this.root.add(scene.add.text(this.x0 + 20, this.y0 + 12, '제작대', { fontFamily: 'serif', fontSize: '24px', fontStyle: 'bold', color: COL.gold }));
    this.root.add(scene.add.text(this.x0 + 120, this.y0 + 20, '거점 — 수동 저장됨 · 쓰러지면 최근 저장으로 돌아옴', { fontFamily: 'sans-serif', fontSize: '12px', color: '#9adf5a' }));

    // 분류 탭 + 제작 가능 필터
    const lx = this.x0 + 18, ly = this.y0 + 50;
    this.lx = lx;
    this.tabTexts = TABS.map(([key, label], i) => {
      const t = scene.add.text(lx + i * 62, ly, label, { fontFamily: 'sans-serif', fontSize: '13px', color: COL.dim, backgroundColor: '#2a2219', padding: { x: 8, y: 4 } })
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.setTab(key));
      this.root.add(t);
      return [key, t];
    });
    this.filterText = scene.add.text(lx, ly + 30, '', { fontFamily: 'sans-serif', fontSize: '13px', color: COL.text }).setInteractive({ useHandCursor: true });
    this.filterText.on('pointerdown', () => this.toggleFilter());
    this.countText = scene.add.text(lx + 248, ly + 31, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.dim }).setOrigin(1, 0);
    this.root.add([this.filterText, this.countText]);

    // 목록 (보이는 줄만 만들어 두고 내용을 바꿔 끼움)
    this.listTop = ly + 56;
    this.rows = [];
    for (let k = 0; k < VIS; k++) {
      const y = this.listTop + k * ROW_H;
      const rect = scene.add.rectangle(lx + 117, y + ROW_H / 2 - 2, 234, ROW_H - 6, COL.panel).setStrokeStyle(1, COL.line).setInteractive({ useHandCursor: true });
      const title = scene.add.text(lx + 12, y + 6, '', { fontFamily: 'sans-serif', fontSize: '15px', color: COL.text });
      const sub = scene.add.text(lx + 12, y + 27, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.dim });
      rect.on('pointerdown', () => { if (this.scroll + k < this.list.length) { this.sel = this.scroll + k; this.render(); } });
      this.root.add([rect, title, sub]);
      this.rows.push({ rect, title, sub });
    }
    // 스크롤 막대 (눌러서 그 위치로)
    this.barBg = scene.add.rectangle(lx + 244, this.listTop + (VIS * ROW_H) / 2 - 3, 6, VIS * ROW_H - 6, 0x2a2219).setInteractive({ useHandCursor: true });
    this.bar = scene.add.rectangle(lx + 244, this.listTop, 6, 20, 0x8a7450);
    this.barBg.on('pointerdown', (p) => {
      const t = Math.max(0, Math.min(1, (p.y - this.listTop) / (VIS * ROW_H)));
      this.scroll = Math.round(t * Math.max(0, this.list.length - VIS));
      this.keepSelVisible();
      this.render(false);
    });
    this.root.add([this.barBg, this.bar]);
    // 마우스 휠 (목록 위에서)
    this.onWheel = (pointer, _objs, _dx, dy) => {
      if (pointer.x > lx + 262) return;
      this.scroll = Math.max(0, Math.min(Math.max(0, this.list.length - VIS), this.scroll + Math.sign(dy)));
      this.keepSelVisible();
      this.render(false);
    };
    scene.input.on('wheel', this.onWheel);

    // 상세 (오른쪽)
    this.detail = scene.add.text(this.x0 + 290, this.y0 + 56, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: COL.text, lineSpacing: 5, wordWrap: { width: W - 310 },
    });
    this.root.add(this.detail);

    // 버튼
    this.craftBtn = this.button(this.x0 + W - 210, this.y0 + H - 50, 110, '제작', () => this.craft());
    this.closeBtn = this.button(this.x0 + W - 90, this.y0 + H - 50, 70, '닫기', () => this.close());
    const ng = scene.add.text(this.x0 + W - 20, this.y0 + 18, '처음부터 다시', { fontFamily: 'sans-serif', fontSize: '12px', color: '#8a7a64' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    ng.on('pointerdown', () => { if (window.confirm('저장을 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) ctx.onNewGame?.(); });
    this.root.add(ng);
    this.root.add(scene.add.text(this.x0 + 20, this.y0 + H - 22, '↑↓ 선택 · ←→ 분류 · F 제작 가능만 · Enter 제작 · Esc 닫기 · 휠 스크롤', { fontFamily: 'sans-serif', fontSize: '11px', color: COL.dim }));

    this.onKey = (e) => {
      const n = this.list.length;
      if (['ArrowUp', 'KeyW'].includes(e.code) && n) { this.sel = (this.sel + n - 1) % n; this.render(); }
      else if (['ArrowDown', 'KeyS'].includes(e.code) && n) { this.sel = (this.sel + 1) % n; this.render(); }
      else if (['ArrowLeft', 'KeyA'].includes(e.code)) this.shiftTab(-1);
      else if (['ArrowRight', 'KeyD', 'Tab'].includes(e.code)) { e.preventDefault(); this.shiftTab(1); }
      else if (e.code === 'KeyF') this.toggleFilter();
      else if (['Enter', 'Space', 'KeyJ'].includes(e.code)) { e.preventDefault(); this.craft(); }
      else if (['Escape', 'KeyE'].includes(e.code)) { e.preventDefault(); this.close(); }
    };
    // 여는 키(E)가 바로 닫기로 처리되지 않도록 한 박자 뒤에 연결
    this.keyTimer = setTimeout(() => window.addEventListener('keydown', this.onKey), 0);

    this.render();
  }

  button(x, y, w, label, fn) {
    const r = this.scene.add.rectangle(x + w / 2, y + 16, w, 32, 0x4a3a22).setStrokeStyle(1, 0xc8a860).setInteractive({ useHandCursor: true });
    const t = this.scene.add.text(x + w / 2, y + 16, label, { fontFamily: 'sans-serif', fontSize: '15px', color: COL.text }).setOrigin(0.5);
    r.on('pointerdown', fn);
    this.root.add([r, t]);
    return { r, t };
  }

  /** 레시피 분류: 무기 / 방어구(머리·몸·팔·다리) / 장신구(반지·목걸이) */
  category(r) {
    if (r.result.kind === 'weapon') return 'weapon';
    const slot = this.ctx.crafting.resultInfo(r)?.slot;
    return slot === 'ring' || slot === 'necklace' ? 'accessory' : 'armor';
  }

  /** 지금 보이는 목록 (분류 + 필터) */
  get list() {
    const { crafting, inventory, player } = this.ctx;
    return crafting.recipes.filter((r) => (this.tab === 'all' || this.category(r) === this.tab)
      && (!this.onlyCraftable || crafting.canCraft(r, inventory, player)));
  }

  get recipe() { return this.list[this.sel] ?? null; }

  setTab(key) { this.tab = key; this.sel = 0; this.scroll = 0; this.render(); }
  shiftTab(d) { const i = TABS.findIndex((t) => t[0] === this.tab); this.setTab(TABS[(i + d + TABS.length) % TABS.length][0]); }
  toggleFilter() { this.onlyCraftable = !this.onlyCraftable; this.sel = 0; this.scroll = 0; this.render(); }
  keepSelVisible() { this.sel = Math.min(this.list.length - 1, Math.max(this.scroll, Math.min(this.sel, this.scroll + VIS - 1))); }

  /** @param {boolean} follow 고른 줄이 보이게 스크롤을 맞출지 (휠·막대로 움직일 땐 false) */
  render(follow = true) {
    const { crafting, inventory, player, items, skills } = this.ctx;
    const list = this.list;
    this.sel = Math.max(0, Math.min(this.sel, list.length - 1));
    const maxScroll = Math.max(0, list.length - VIS);
    if (follow) {
      if (this.sel < this.scroll) this.scroll = this.sel;
      if (this.sel >= this.scroll + VIS) this.scroll = this.sel - VIS + 1;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));

    for (const [key, t] of this.tabTexts) t.setColor(key === this.tab ? COL.gold : COL.dim).setBackgroundColor(key === this.tab ? '#3e3222' : '#2a2219');
    this.filterText.setText(`${this.onlyCraftable ? '☑' : '☐'} 제작 가능만 (F)`).setColor(this.onlyCraftable ? COL.ok : COL.text);
    const craftableN = crafting.recipes.filter((r) => crafting.canCraft(r, inventory, player)).length;
    this.countText.setText(`${list.length}개 · 제작 가능 ${craftableN}`);

    this.rows.forEach((row, k) => {
      const i = this.scroll + k, r = list[i];
      for (const o of [row.rect, row.title, row.sub]) o.setVisible(!!r);
      if (!r) return;
      const info = crafting.resultInfo(r);
      const owned = crafting.isOwned(r, player);
      const can = crafting.canCraft(r, inventory, player);
      row.rect.setFillStyle(i === this.sel ? COL.sel : COL.panel).setStrokeStyle(i === this.sel ? 2 : 1, i === this.sel ? 0xc8a860 : COL.line);
      row.title.setText(info.name);
      const kind = r.result.kind === 'weapon' ? (info.hands === 'two' ? '양손 무기' : '한손 무기') : SLOT_NAMES[info.slot] ?? '';
      row.sub.setText(`${kind} · ${owned ? '보유 중' : can ? '제작 가능' : '재료 부족'}`).setColor(owned ? COL.dim : can ? COL.ok : COL.no);
    });
    // 스크롤 막대
    const trackH = VIS * ROW_H - 6;
    const barH = Math.max(16, trackH * VIS / Math.max(VIS, list.length));
    this.bar.setSize(6, barH).setVisible(maxScroll > 0);
    this.bar.setY(this.listTop + (maxScroll ? (this.scroll / maxScroll) * (trackH - barH) : 0) + barH / 2);
    this.barBg.setVisible(maxScroll > 0);

    const r = this.recipe;
    if (!r) {
      this.detail.setText(this.onlyCraftable ? '지금 재료로 만들 수 있는 게 없어요.\n(F로 필터 끄기)' : '목록이 비어 있어요.');
      this.craftBtn.r.setAlpha(0.4); this.craftBtn.t.setAlpha(0.4);
      return;
    }
    const info = crafting.resultInfo(r);
    const owned = crafting.isOwned(r, player);
    const kindName = r.result.kind === 'weapon' ? (info.hands === 'two' ? '양손 무기' : '한손 무기') : (SLOT_NAMES[info.slot] ?? '장비');
    const lines = [`${kindName} · ${info.name}`, info.description, ''];
    if (info.maxHpBonus) lines.push(`최대 체력 +${info.maxHpBonus}`);
    if (info.set) { const st = crafting.gear._sets?.[info.set]; if (st) lines.push(`세트: ${st.name} — ${st.bonuses.map((b) => `${b.pieces}부위: ${b.skills.map((id) => skills[id]?.name).join(', ')}`).join(' / ')}`); }
    if (r.result.kind === 'weapon') {
      lines.push(`콤보 데미지: ${info.combo.map((m) => m.damage).join(' / ')}`);
      lines.push(`  (지금 든 ${player.weapon.name}: ${player.weapon.combo.map((m) => m.damage).join(' / ')})`);
    }
    for (const sid of info.skills ?? []) {
      const s = skills[sid];
      if (s) lines.push(`스킬 「${s.name}」 — ${s.description}`);
    }
    if (owned) {
      lines.push('', '✔ 이미 가지고 있어요. (I: 가방·장비창에서 장착 / 무기는 1·2·3 / Q)');
    } else {
      lines.push('', '필요한 재료');
      for (const m of r.materials) {
        const have = inventory.count(m.itemId);
        lines.push(`${have >= m.amount ? '✔' : '✘'} ${items.get(m.itemId).name}  ${have} / ${m.amount}`);
      }
    }
    this.detail.setText(lines.join('\n'));
    const can = crafting.canCraft(r, inventory, player);
    this.craftBtn.r.setAlpha(can ? 1 : 0.4);
    this.craftBtn.t.setAlpha(can ? 1 : 0.4);
  }

  craft() {
    const { crafting, inventory, player } = this.ctx;
    const r = this.recipe;
    if (!r || !crafting.craft(r, inventory, player)) return;
    this.ctx.onCrafted?.(crafting.resultInfo(r));
    this.render();
  }

  close() {
    clearTimeout(this.keyTimer);
    window.removeEventListener('keydown', this.onKey);
    this.scene.input.off('wheel', this.onWheel);
    this.root.destroy();
    this.ctx.onClose?.();
  }
}
