/**
 * 제작 화면 (UI 씬 위). 열려 있는 동안 월드는 멈춘다.
 * 조작: ↑↓/W S 선택 · Enter/Space/J 또는 [제작] 버튼 = 제작 · Esc/E 또는 [닫기] = 닫기 · 마우스/터치로 목록 선택
 * 규칙(재료 확인·소모)은 Crafting.js, 여기는 보여 주기와 입력만.
 * Godot: CraftingPanel.tscn (Control) — ItemList + RichTextLabel + Button.
 */
import { SLOT_NAMES } from './Equipment.js';
const W = 680, H = 400;
const COL = { bg: 0x16130f, panel: 0x241e17, line: 0x5a4a32, sel: 0x3e3222, ok: '#9adf5a', no: '#d06050', text: '#efe4cc', dim: '#a89a80', gold: '#e8c860' };

export class CraftingPanel {
  /**
   * @param {Phaser.Scene} scene UI 씬
   * @param {{crafting, inventory, player, items, skills, onClose:Function, onCrafted:Function}} ctx
   */
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.sel = 0;
    const cx = scene.scale.width / 2, cy = scene.scale.height / 2;
    this.x0 = cx - W / 2;
    this.y0 = cy - H / 2;

    this.root = scene.add.container(0, 0).setDepth(100);
    const dim = scene.add.rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x000000, 0.55).setInteractive();
    const bg = scene.add.rectangle(cx, cy, W, H, COL.bg, 0.97).setStrokeStyle(2, COL.line);
    this.root.add([dim, bg]);
    this.root.add(scene.add.text(this.x0 + 20, this.y0 + 14, '제작대', { fontFamily: 'serif', fontSize: '24px', fontStyle: 'bold', color: COL.gold }));

    // 목록 (왼쪽)
    this.rows = ctx.crafting.recipes.map((r, i) => {
      const y = this.y0 + 64 + i * 58;
      const rect = scene.add.rectangle(this.x0 + 20 + 115, y + 24, 230, 52, COL.panel).setStrokeStyle(1, COL.line).setInteractive({ useHandCursor: true });
      const title = scene.add.text(this.x0 + 32, y + 8, '', { fontFamily: 'sans-serif', fontSize: '15px', color: COL.text });
      const sub = scene.add.text(this.x0 + 32, y + 28, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.dim });
      rect.on('pointerdown', () => { this.sel = i; this.render(); });
      this.root.add([rect, title, sub]);
      return { recipe: r, rect, title, sub };
    });

    // 상세 (오른쪽)
    this.detail = scene.add.text(this.x0 + 272, this.y0 + 60, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: COL.text, lineSpacing: 5, wordWrap: { width: W - 300 },
    });
    this.root.add(this.detail);

    // 버튼
    this.craftBtn = this.button(this.x0 + W - 210, this.y0 + H - 46, 110, '제작', () => this.craft());
    this.closeBtn = this.button(this.x0 + W - 90, this.y0 + H - 46, 70, '닫기', () => this.close());
    // 처음부터 다시 (저장 삭제) — 실수로 누르지 않게 확인 창
    const ng = scene.add.text(this.x0 + W - 20, this.y0 + 18, '처음부터 다시', { fontFamily: 'sans-serif', fontSize: '12px', color: '#8a7a64' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    ng.on('pointerdown', () => { if (window.confirm('저장을 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) ctx.onNewGame?.(); });
    this.root.add(ng);
    this.root.add(scene.add.text(this.x0 + 130, this.y0 + 22, '거점 — 수동 저장됨 · 쓰러지면 최근 저장(수동·자동)으로 돌아옴', { fontFamily: 'sans-serif', fontSize: '12px', color: '#9adf5a' }));
    this.root.add(scene.add.text(this.x0 + 20, this.y0 + H - 34, '↑↓ 선택 · Enter 제작 · Esc 닫기', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.dim }));

    this.onKey = (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) { this.sel = (this.sel + this.rows.length - 1) % this.rows.length; this.render(); }
      else if (['ArrowDown', 'KeyS'].includes(e.code)) { this.sel = (this.sel + 1) % this.rows.length; this.render(); }
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

  get recipe() {
    return this.rows[this.sel].recipe;
  }

  render() {
    const { crafting, inventory, player, items, skills } = this.ctx;
    // 목록이 길면 5줄씩 보이고 고른 줄이 보이게 스크롤
    const VIS = 5;
    this.scroll = Math.max(0, Math.min(this.scroll ?? 0, this.rows.length - VIS));
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + VIS) this.scroll = this.sel - VIS + 1;
    this.rows.forEach((row, i) => {
      const k = i - this.scroll, vis = k >= 0 && k < VIS;
      for (const o of [row.rect, row.title, row.sub]) o.setVisible(vis);
      if (vis) {
        const y = this.y0 + 64 + k * 58;
        row.rect.setY(y + 24); row.title.setY(y + 8); row.sub.setY(y + 28);
      }
      const info = crafting.resultInfo(row.recipe);
      const owned = crafting.isOwned(row.recipe, player);
      const can = crafting.canCraft(row.recipe, inventory, player);
      row.rect.setFillStyle(i === this.sel ? COL.sel : COL.panel).setStrokeStyle(i === this.sel ? 2 : 1, i === this.sel ? 0xc8a860 : COL.line);
      row.title.setText(info.name);
      row.sub.setText(owned ? '보유 중' : can ? '제작 가능' : '재료 부족').setColor(owned ? COL.dim : can ? COL.ok : COL.no);
    });

    const r = this.recipe;
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
    this.craftBtn.t.setText(owned ? '보유 중' : '제작');
    this.craftBtn.r.setAlpha(can ? 1 : 0.4);
    this.craftBtn.t.setAlpha(can ? 1 : 0.5);
  }

  craft() {
    const { crafting, inventory, player } = this.ctx;
    const r = this.recipe;
    if (!crafting.craft(r, inventory, player)) return;
    this.ctx.onCrafted?.(crafting.resultInfo(r));
    this.render();
  }

  close() {
    clearTimeout(this.keyTimer);
    window.removeEventListener('keydown', this.onKey);
    this.root.destroy();
    this.ctx.onClose?.();
  }
}
