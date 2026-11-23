/**
 * 가방·장비창 (UI 씬 위, I키 / 휴대폰 [가방]). 열려 있는 동안 월드는 멈춘다.
 * 왼쪽: 장비 8칸 + 지금 입은 모습 / 오른쪽: 가방(탭: 전체·장비·재료·음식) + 설명 + 버튼(장착·해제·먹기·단축칸 1·2·3)
 * 조작: 클릭 고르기 · 우클릭 바로 장착/해제/먹기 · 끌어다 놓기(가방 → 장비칸 = 장착, 장비칸 → 가방 = 해제, 손 → 다른 손)
 *       · 휠 가방 스크롤 · ←↑→↓ 고르기 · Enter 장착/먹기 · 1·2·3 무기 단축칸 · Tab 탭 · Esc/I 닫기
 * 규칙은 Equipment.js(장비)·Inventory.js(가방), 여기는 보여 주기와 입력만.
 * Godot: InventoryPanel.tscn (Control) — GridContainer + TextureRect 칸 + RichTextLabel.
 */
import { SLOTS, SLOT_NAMES } from './Equipment.js';

const W = 800, H = 460, CELL = 50, GAP = 6, COLS = 7, ROWS = 4;
const COL = { bg: 0x16130f, panel: 0x241e17, line: 0x5a4a32, sel: 0xc8a860, text: '#efe4cc', dim: '#a89a80', gold: '#e8c860', ok: '#9adf5a', blue: '#9fdcff' };
const TABS = [['all', '전체'], ['gear', '장비'], ['material', '재료'], ['food', '음식']];
// 장비칸 배치: 왼쪽 열(방어구) · 오른쪽 열(손·장신구)
const SLOT_POS = { head: [0, 0], body: [0, 1], arms: [0, 2], legs: [0, 3], right: [1, 0], left: [1, 1], ring: [1, 2], necklace: [1, 3] };

export class InventoryPanel {
  /** @param {{player, inventory, items, weapons, gear, skills, heroPx, onClose:Function, onChanged:Function}} ctx */
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.tab = 'all';
    this.sel = { kind: 'bag', index: 0 };
    this.scroll = 0;
    const cx = scene.scale.width / 2, cy = scene.scale.height / 2;
    this.x0 = cx - W / 2; this.y0 = cy - H / 2;
    this.makeIcons();

    this.root = scene.add.container(0, 0).setDepth(100);
    const dim = scene.add.rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x000000, 0.55).setInteractive();
    this.root.add([dim, scene.add.rectangle(cx, cy, W, H, COL.bg, 0.97).setStrokeStyle(2, COL.line)]);
    this.root.add(scene.add.text(this.x0 + 18, this.y0 + 12, '가방 · 장비', { fontFamily: 'serif', fontSize: '22px', fontStyle: 'bold', color: COL.gold }));
    this.root.add(scene.add.text(this.x0 + W - 18, this.y0 + 18, '우클릭 바로 장착·해제·먹기 · 끌어다 장비칸에 놓기 · Esc / I 닫기', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.dim }).setOrigin(1, 0));

    // ---- 장비칸 + 모습
    this.slotCells = {};
    const ex = this.x0 + 18, ey = this.y0 + 56;
    for (const s of SLOTS) {
      const [c, r] = SLOT_POS[s];
      const x = ex + c * 200, y = ey + r * 66;
      this.slotCells[s] = this.cell(x, y, (p) => {
        const id = this.ctx.player.equipment.slots[s];
        if (p.rightButtonDown()) { if (id) { this.ctx.player.unequipSlot(s === 'left' && this.ctx.player.equipment.twoHanded ? 'right' : s); this.changed(); } return; }
        this.sel = { kind: 'slot', slot: s }; this.render();
        if (id) this.dragStart = { from: 'slot', slot: s, id, x: p.x, y: p.y };
      });
      this.root.add(scene.add.text(x + CELL / 2, y + CELL + 1, SLOT_NAMES[s], { fontFamily: 'sans-serif', fontSize: '11px', color: COL.dim }).setOrigin(0.5, 0));
    }
    this.doll = scene.add.container(ex + 125, ey + 200);
    this.root.add(scene.add.rectangle(ex + 125, ey + 120, 120, 250, COL.panel).setStrokeStyle(1, COL.line));
    this.root.add(this.doll);
    this.statText = scene.add.text(ex, ey + 272, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.text, lineSpacing: 3, wordWrap: { width: 250 } });
    this.root.add(this.statText);

    // ---- 탭 + 가방 칸
    const bx = this.x0 + 290, by = this.y0 + 50;
    this.tabTexts = TABS.map(([key, label], i) => {
      const t = scene.add.text(bx + i * 64, by, label, { fontFamily: 'sans-serif', fontSize: '14px', color: COL.dim, backgroundColor: '#2a2219', padding: { x: 10, y: 4 } })
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { this.tab = key; this.sel = { kind: 'bag', index: 0 }; this.scroll = 0; this.render(); });
      this.root.add(t);
      return [key, t];
    });
    this.bagCells = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = bx + (i % COLS) * (CELL + GAP), y = by + 34 + Math.floor(i / COLS) * (CELL + GAP);
      this.bagCells.push(this.cell(x, y, (p) => {
        const idx = this.scroll * COLS + i, it = this.list()[idx];
        if (p.rightButtonDown()) { if (it) this.quickUse(it.id); return; }
        this.sel = { kind: 'bag', index: idx }; this.render();
        if (it && this.ctx.player.equipment.def(it.id)) this.dragStart = { from: 'bag', id: it.id, x: p.x, y: p.y };
      }));
    }
    this.bagArea = { x: bx, y: by + 34, w: COLS * (CELL + GAP), h: ROWS * (CELL + GAP) };
    this.scrollText = scene.add.text(bx + COLS * (CELL + GAP) - GAP, by + 4, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COL.dim }).setOrigin(1, 0);
    this.root.add(this.scrollText);

    // ---- 설명 + 버튼
    this.detail = scene.add.text(bx, by + 34 + ROWS * (CELL + GAP) + 4, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: COL.text, lineSpacing: 3, wordWrap: { width: W - 310 },
    });
    this.root.add(this.detail);
    this.buttons = [];
    for (let i = 0; i < 5; i++) this.buttons.push(this.button(bx + i * 96, this.y0 + H - 42, 88));

    this.onKey = (e) => {
      const list = this.list();
      if (['Escape', 'KeyI'].includes(e.code)) { e.preventDefault(); this.close(); return; }
      if (e.code === 'Tab') { e.preventDefault(); const i = TABS.findIndex((t) => t[0] === this.tab); this.tab = TABS[(i + 1) % TABS.length][0]; this.sel = { kind: 'bag', index: 0 }; this.scroll = 0; this.render(); return; }
      const dirs = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -COLS, KeyW: -COLS, ArrowDown: COLS, KeyS: COLS };
      if (dirs[e.code] !== undefined && list.length) {
        const cur = this.sel.kind === 'bag' ? this.sel.index : 0;
        this.sel = { kind: 'bag', index: Math.max(0, Math.min(list.length - 1, cur + dirs[e.code])) };
        this.render(); return;
      }
      if (['Enter', 'Space', 'KeyJ'].includes(e.code)) { e.preventDefault(); this.actions()[0]?.fn(); return; }
      const q = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (q !== undefined) { const id = this.selectedId(); if (id && this.isWeapon(id)) this.setQuick(id, q); }
    };
    this.keyTimer = setTimeout(() => window.addEventListener('keydown', this.onKey), 0);

    // 끌어다 놓기
    this.onMove = (p) => {
      const d = this.dragStart;
      if (!d || !p.isDown) return;
      if (!this.ghost && Math.hypot(p.x - d.x, p.y - d.y) > 6) {
        this.ghost = scene.add.container(p.x, p.y).setDepth(120).setAlpha(0.85);
        this.drawIcon(this.ghost, d.id);
        this.root.add(this.ghost);
      }
      this.ghost?.setPosition(p.x, p.y);
    };
    this.onUp = (p) => {
      const d = this.dragStart;
      this.dragStart = null;
      if (!this.ghost) return;
      this.ghost.destroy(); this.ghost = null;
      const pl = this.ctx.player;
      const target = SLOTS.find((s) => this.slotCells[s].bg.getBounds().contains(p.x, p.y));
      const a = this.bagArea;
      const overBag = p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;
      if (target) {
        if (d.from === 'slot' && d.slot === target) return;
        if (!pl.equipment.slotsFor(d.id).includes(target)) { this.flash(`${SLOT_NAMES[target]} 칸에는 넣을 수 없어요`); return; }
        pl.equipItem(d.id, target);
        this.sel = { kind: 'slot', slot: target };
        this.changed();
      } else if (overBag && d.from === 'slot') {
        pl.unequipSlot(d.slot);
        this.changed();
      }
    };
    // 휠: 가방 위에서 스크롤
    this.onWheel = (p, _o, _dx, dy) => {
      const a = this.bagArea;
      if (p.x < a.x || p.x > a.x + a.w || p.y < a.y || p.y > a.y + a.h) return;
      const maxScroll = Math.max(0, Math.ceil(this.list().length / COLS) - ROWS);
      this.scroll = Math.max(0, Math.min(maxScroll, this.scroll + Math.sign(dy)));
      this.render(false);
    };
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('wheel', this.onWheel);
    this.render();
  }

  /** 우클릭: 장비 = 착용(이미 입었으면 해제), 음식 = 먹기 */
  quickUse(id) {
    const pl = this.ctx.player, e = pl.equipment;
    if (e.def(id)) {
      const where = Object.entries(e.slots).find(([, v]) => v === id)?.[0];
      if (where) pl.unequipSlot(where);
      else pl.equipItem(id, this.isWeapon(id) ? 'right' : null);
    } else if (this.ctx.items.get(id)?.heal) this.ctx.eat(id);
    this.changed();
  }

  changed() { this.ctx.onChanged?.(); this.render(); }

  /** 짧은 안내 글 (설명 칸 위에 잠깐) */
  flash(text) {
    const t = this.scene.add.text(this.bagArea.x + this.bagArea.w / 2, this.bagArea.y + this.bagArea.h / 2, text, {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#ffd0a0', backgroundColor: '#000000cc', padding: { x: 10, y: 5 } }).setOrigin(0.5).setDepth(130);
    this.root.add(t);
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 300, onComplete: () => t.destroy() });
  }

  // ---------- 그리기 도구 ----------
  cell(x, y, onDown) {
    const s = this.scene;
    const bg = s.add.rectangle(x + CELL / 2, y + CELL / 2, CELL, CELL, COL.panel).setStrokeStyle(1, COL.line).setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (p) => onDown(p));
    const icon = s.add.container(x + CELL / 2, y + CELL / 2);
    const count = s.add.text(x + CELL - 3, y + CELL - 2, '', { fontFamily: 'sans-serif', fontSize: '11px', color: COL.text, stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1);
    const tag = s.add.text(x + 3, y + 2, '', { fontFamily: 'sans-serif', fontSize: '10px', color: COL.ok, stroke: '#000', strokeThickness: 3 });
    this.root.add([bg, icon, count, tag]);
    return { bg, icon, count, tag };
  }

  button(x, y, w) {
    const r = this.scene.add.rectangle(x + w / 2, y + 15, w, 30, 0x4a3a22).setStrokeStyle(1, 0xc8a860).setInteractive({ useHandCursor: true });
    const t = this.scene.add.text(x + w / 2, y + 15, '', { fontFamily: 'sans-serif', fontSize: '13px', color: COL.text }).setOrigin(0.5);
    const b = { r, t, fn: null };
    r.on('pointerdown', () => b.fn?.());
    this.root.add([r, t]);
    return b;
  }

  /** 반지·목걸이 아이콘 (임시 그림, 한 번만 만듦) */
  makeIcons() {
    const s = this.scene;
    if (s.textures.exists('icon-ring')) return;
    const g = s.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xd8dce4).strokeCircle(12, 14, 7); g.fillStyle(0x9adfff).fillCircle(12, 6, 3);
    g.generateTexture('icon-ring', 24, 24); g.clear();
    g.lineStyle(2, 0xb09070).beginPath(); g.arc(12, 6, 9, 0.2, Math.PI - 0.2); g.strokePath();
    g.fillStyle(0xe8dcb8); for (const [x, y] of [[5, 12], [9, 15], [12, 17], [15, 15], [19, 12]]) g.fillTriangle(x - 2, y, x + 2, y, x, y + 5);
    g.generateTexture('icon-necklace', 24, 24);
    g.destroy();
  }

  /** 아이콘: 재료·음식 = item-<id>, 무기 = blade-<id>, 방어구 = 주인공 층 그림의 해당 부위, 장신구 = 그린 아이콘 */
  drawIcon(container, id, ghost = false) {
    container.removeAll(true);
    if (!id) return;
    const s = this.scene, { gear, heroPx } = this.ctx;
    let img;
    if (this.isWeapon(id)) {
      img = s.add.image(0, 0, s.textures.exists(`blade-${id}`) ? `blade-${id}` : '__DEFAULT').setAngle(-45).setScale(1.1);
    } else if (gear[id]) {
      const g = gear[id];
      if (g.slot === 'ring' || g.slot === 'necklace') img = s.add.image(0, 0, `icon-${g.slot}`).setScale(1.4);
      else {
        const layer = { head: 'head', body: 'body', arms: 'armsF', legs: 'legs' }[g.slot];
        const key = heroPx.parts[g.slot][g.outfit ?? 'rags'].sword[layer];
        const cls = heroPx.classes.sword;
        const oy = { head: 0.32, body: 0.5, arms: 0.5, legs: 0.72 }[g.slot];
        img = s.add.image(0, 0, key, cls.anims.idle.row * cls.columns).setOrigin(0.5, oy).setScale(1.5);
        if (g.slot === 'arms') {
          const kb = heroPx.parts.arms[g.outfit ?? 'rags'].sword.armsB;
          container.add(s.add.image(0, 0, kb, cls.anims.idle.row * cls.columns).setOrigin(0.5, oy).setScale(1.5));
        }
      }
    } else if (s.textures.exists(`item-${id}`)) img = s.add.image(0, 0, `item-${id}`).setScale(2);
    if (img) container.add(img);
    if (ghost) container.setAlpha(0.35); else container.setAlpha(1);
  }

  // ---------- 데이터 ----------
  isWeapon(id) { return this.ctx.player.equipment.isWeapon(id); }

  /** 지금 탭의 가방 목록: {id, count, equipped} */
  list() {
    const { player, inventory, items } = this.ctx;
    const e = player.equipment;
    const gearList = e.owned.map((id) => ({ id, count: 1, equipped: Object.values(e.slots).includes(id), gear: true }));
    const stuff = inventory.entries().map(([id, n]) => ({ id, count: n, food: !!items.get(id)?.heal }));
    if (this.tab === 'gear') return gearList;
    if (this.tab === 'material') return stuff.filter((x) => !x.food);
    if (this.tab === 'food') return stuff.filter((x) => x.food);
    return [...gearList, ...stuff];
  }

  selectedId() {
    if (this.sel.kind === 'slot') return this.ctx.player.equipment.slots[this.sel.slot];
    return this.list()[this.sel.index]?.id ?? null;
  }

  def(id) { return this.ctx.weapons[id] ?? this.ctx.gear[id] ?? this.ctx.items.get(id) ?? null; }

  /** 고른 것에 할 수 있는 일 (버튼) */
  actions() {
    const { player, items } = this.ctx;
    const e = player.equipment, id = this.selectedId();
    const out = [];
    if (!id) return out;
    const changed = (msg) => { this.ctx.onChanged?.(msg); this.render(); };
    if (e.def(id)) {
      const where = Object.entries(e.slots).find(([, v]) => v === id)?.[0];
      if (where) out.push({ label: '해제', fn: () => { player.unequipSlot(where); changed(); } });
      if (this.isWeapon(id)) {
        if (e.weapons[id].hands === 'two') { if (!where) out.push({ label: '들기 (양손)', fn: () => { player.equipItem(id, 'right'); changed(); } }); }
        else {
          if (where !== 'right') out.push({ label: '오른손에', fn: () => { player.equipItem(id, 'right'); changed(); } });
          if (where !== 'left') out.push({ label: '왼손에', fn: () => { player.equipItem(id, 'left'); changed(); } });
        }
        for (let q = 0; q < 3; q++) out.push({ label: e.quick[q] === id ? `단축 ${q + 1} ✔` : `단축 ${q + 1}`, fn: () => this.setQuick(id, q) });
      } else if (!where) out.push({ label: '장착', fn: () => { player.equipItem(id); changed(); } });
    } else if (items.get(id)?.heal) {
      out.push({ label: '먹기', fn: () => { this.ctx.eat(id); changed(); } });
    }
    return out;
  }

  setQuick(id, q) {
    const e = this.ctx.player.equipment;
    const old = e.quick.indexOf(id);
    if (old >= 0) e.quick[old] = null;
    e.quick[q] = id;
    this.ctx.onChanged?.();
    this.render();
  }

  // ---------- 화면 갱신 ----------
  /** @param {boolean} follow 고른 칸이 보이게 스크롤을 맞출지 (휠로 움직일 땐 false) */
  render(follow = true) {
    const { player, skills, items } = this.ctx;
    const e = player.equipment;
    const list = this.list();
    // 탭
    for (const [key, t] of this.tabTexts) t.setColor(key === this.tab ? COL.gold : COL.dim).setBackgroundColor(key === this.tab ? '#3e3222' : '#2a2219');
    // 장비칸
    const left = e.leftView();
    for (const s of SLOTS) {
      const c = this.slotCells[s];
      const ghost = s === 'left' && left && typeof left === 'object';
      this.drawIcon(c.icon, ghost ? left.ghost ?? null : e.slots[s], ghost);
      c.count.setText(s === 'left' && left?.quiver ? '화살통' : '');
      c.tag.setText('');
      c.bg.setStrokeStyle(this.sel.kind === 'slot' && this.sel.slot === s ? 2 : 1, this.sel.kind === 'slot' && this.sel.slot === s ? COL.sel : COL.line);
    }
    // 가방 (선택이 보이게 스크롤)
    if (this.sel.kind === 'bag' && follow) {
      const row = Math.floor(this.sel.index / COLS);
      if (row < this.scroll) this.scroll = row;
      if (row >= this.scroll + ROWS) this.scroll = row - ROWS + 1;
    }
    const maxScroll = Math.max(0, Math.ceil(list.length / COLS) - ROWS);
    this.scroll = Math.min(this.scroll, maxScroll);
    this.scrollText.setText(maxScroll ? `${this.scroll + 1}/${maxScroll + 1}줄 ↕` : `${list.length}개`);
    this.bagCells.forEach((c, i) => {
      const it = list[this.scroll * COLS + i];
      this.drawIcon(c.icon, it?.id ?? null);
      c.count.setText(it && !it.gear && it.count > 1 ? `${it.count}` : '');
      const q = it && this.isWeapon(it.id) ? e.quick.indexOf(it.id) : -1;
      const rare = it && items.get(it.id)?.grade === 'rare';
      c.tag.setText(it?.equipped ? 'E' : q >= 0 ? `${q + 1}` : rare ? '특' : '').setColor(it?.equipped ? COL.ok : rare && q < 0 ? '#6ab4ff' : COL.blue);
      if (rare) c.bg.setFillStyle(0x1e2a3a); else c.bg.setFillStyle(COL.panel);
      const selected = this.sel.kind === 'bag' && this.sel.index === this.scroll * COLS + i && it;
      c.bg.setStrokeStyle(selected ? 2 : 1, selected ? COL.sel : COL.line);
    });
    // 모습
    this.renderDoll();
    // 능력치 요약
    const sets = e.setStatus().map((st) => `${st.name} ${st.pieces}부위${st.active.length ? ' ✔' : st.next ? ` (${st.next.pieces}부위에 보너스)` : ''}`);
    this.statText.setText([
      `체력 ${Math.round(player.stats.hp)} / ${player.stats.maxHp}   무기: ${player.weapon.name}`,
      sets.length ? `세트: ${sets.join(', ')}` : '세트: 없음',
      `스킬: ${player.skills.map((x) => x.name).join(', ') || '없음'}`,
    ].join('\n'));
    // 설명
    const id = this.selectedId();
    const d = id ? this.def(id) : null;
    const lines = [];
    if (!id) lines.push(this.sel.kind === 'slot' ? `${SLOT_NAMES[this.sel.slot]} 칸이 비어 있어요. 가방에서 장비를 골라 장착하세요.` : '');
    else if (d) {
      const kind = this.isWeapon(id) ? (d.hands === 'two' ? '양손 무기' : '한손 무기') : e.gear[id] ? SLOT_NAMES[d.slot] : (items.get(id)?.heal ? '음식' : items.get(id)?.grade === 'rare' ? '특수 소재' : '일반 소재');
      lines.push(`${d.name}  ·  ${kind}`);
      if (d.description) lines.push(d.description);
      if (d.combo) lines.push(`콤보 데미지 ${d.combo.map((m) => m.damage).join(' / ')}`);
      if (d.maxHpBonus) lines.push(`최대 체력 +${d.maxHpBonus}`);
      if (d.heal) lines.push(`체력 +${d.heal} 회복 (R: 빠른 먹기)`);
      for (const sid of d.skills ?? []) if (skills[sid]) lines.push(`「${skills[sid].name}」 ${skills[sid].description}`);
      if (d.set) {
        const st = e.gear._sets?.[d.set];
        const have = e.setStatus().find((x) => x.set === d.set)?.pieces ?? 0;
        if (st) lines.push(`세트 ${st.name} (${have}부위 착용): ${st.bonuses.map((b) => `${b.pieces}부위 → ${b.skills.map((x) => skills[x]?.name).join(', ')}`).join(' / ')}`);
      }
    }
    this.detail.setText(lines.join('\n'));
    // 버튼
    const acts = this.actions();
    this.buttons.forEach((b, i) => {
      const a = acts[i];
      b.fn = a?.fn ?? null;
      b.t.setText(a?.label ?? '');
      b.r.setVisible(!!a); b.t.setVisible(!!a);
    });
  }

  /** 지금 입은 모습 (주인공 층 그림을 크게, 아래 방향 대기 자세) */
  renderDoll() {
    const s = this.scene, meta = this.ctx.heroPx;
    this.doll.removeAll(true);
    if (!meta) return;
    const look = this.ctx.player.heroLook();
    const cls = meta.classes[look.cls];
    const frame = cls.anims.idle.row * cls.columns;
    for (const k of meta.layerOrder.down) {
      const key = look.keys[k];
      if (key) this.doll.add(s.add.image(0, 0, key, frame).setOrigin(meta.origin.x, meta.origin.y).setScale(3));
    }
  }

  close() {
    clearTimeout(this.keyTimer);
    window.removeEventListener('keydown', this.onKey);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.input.off('wheel', this.onWheel);
    this.root.destroy(true);
    this.ctx.onClose?.();
  }
}
