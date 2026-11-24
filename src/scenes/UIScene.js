import { DEBUG, FORCE_TOUCH } from '../config.js';
import { TouchControls } from '../systems/TouchControls.js';
import { InputDebugPanel } from '../systems/InputDebugPanel.js';
import { InventoryPanel } from '../systems/InventoryPanel.js';
import { MapPanel } from '../systems/MapPanel.js';
import { MAP_SCALE } from '../systems/WorldMap.js';
import { CraftingPanel } from '../systems/CraftingPanel.js';
import { DevTools } from '../systems/DevTools.js';
import { PauseMenu } from '../systems/PauseMenu.js';

const BAR_W = 160;
const BAR_H = 10;

/**
 * HUD 씬: 월드 위에 겹쳐 그리는 화면 고정 UI.
 * Godot: CanvasLayer + ProgressBar/Label, Stats·Inventory 시그널에 연결.
 */
export class UIScene extends window.Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    const items = this.registry.get('items');
    const inventory = this.registry.get('inventory');
    const style = { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff' };
    const small = { ...style, fontSize: '13px' };
    const isTouch = FORCE_TOUCH || this.sys.game.device.input.touch;

    // 낮밤 색: 화면 전체에 곱하기(MULTIPLY)로 덮음 — HUD보다 아래 (월드만 물듦)
    this.dayNight = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff).setOrigin(0, 0).setDepth(-100)
      .setBlendMode(window.Phaser.BlendModes.MULTIPLY);
    // 시계 (오른쪽 위)
    this.clockText = this.add.text(this.scale.width - 12, isTouch ? 84 : 40, '', { ...small, color: '#e8dcc0', backgroundColor: '#00000066', padding: { x: 6, y: 2 } })
      .setOrigin(1, 0);
    // 미니맵 (오른쪽 위, 시계 아래): 지도 그림·안개를 잘라 보여 줌. 누르면 큰 지도
    this.mini = { w: 150, h: 100, x: this.scale.width - 162, y: (isTouch ? 84 : 40) + 24, scale: 1.25 };
    this.miniFrame = this.add.rectangle(this.mini.x + this.mini.w / 2, this.mini.y + this.mini.h / 2, this.mini.w + 4, this.mini.h + 4, 0x16130f, 0.9)
      .setStrokeStyle(1, 0x8a7450).setInteractive({ useHandCursor: true });
    this.miniFrame.on('pointerdown', () => { if (!this.panel) this.scene.get('World').openPanel('map'); });
    this.miniDot = this.add.graphics();
    this.add.text(this.mini.x + this.mini.w, this.mini.y + this.mini.h + 3, 'M 지도', { fontFamily: 'sans-serif', fontSize: '11px', color: '#a89a80' }).setOrigin(1, 0);

    // 생존 게이지 (체력·기력 바 오른쪽): 배고픔·목마름·피로 + 걸린 상태
    this.needText = this.add.text(222, 8, '', { ...small, fontSize: '12px', lineSpacing: 1 }).setShadow(1, 1, '#000', 0);

    // 체력·기력 바
    this.add.text(12, 10, '체력', small).setShadow(1, 1, '#000', 0);
    this.add.text(12, 28, '기력', small).setShadow(1, 1, '#000', 0);
    this.bars = this.add.graphics();

    // 장비(무기 + 콤보 단계, 갑옷)와 스킬
    this.weaponText = this.add.text(12, 48, '', small).setShadow(1, 1, '#000', 0);
    this.armorText = this.add.text(12, 66, '', small).setShadow(1, 1, '#000', 0);
    this.skillText = this.add.text(12, 84, '', { ...small, color: '#b8e08a' }).setShadow(1, 1, '#000', 0);

    this.invText = this.add.text(12, 108, '', style).setShadow(2, 2, '#000', 0);
    const refresh = () => {
      const lines = inventory.entries().map(([id, n]) => `· ${items.get(id).name} ×${n}`);
      this.invText.setText(['가방', ...(lines.length ? lines : ['  (비어 있음)'])].join('\n'));
    };
    refresh();
    inventory.onChange(refresh);

    // 보스 체력 바 (화면 아래 가운데, 보스가 나를 발견했을 때만)
    this.bossBar = this.add.graphics();
    this.bossName = this.add.text(this.scale.width / 2, this.scale.height - 62, '', small)
      .setOrigin(0.5, 1).setShadow(1, 1, '#000', 0);

    // 큰 알림 글씨 ("토벌!", "쓰러졌다…")
    this.bannerText = this.add.text(this.scale.width / 2, this.scale.height * 0.38, '', {
      fontFamily: 'serif', fontSize: '40px', fontStyle: 'bold', color: '#e8c860',
    }).setOrigin(0.5).setStroke('#140c08', 6).setAlpha(0).setDepth(200);
    this.registry.events.on('changedata-banner', (_parent, b) => { if (b) this.showBanner(b.text, b.color); });

    const params = new URLSearchParams(window.location.search);
    this.inputDebug = new InputDebugPanel(this, DEBUG || params.has('input'));
    if (params.has('dev')) this.devTools = new DevTools(this);

    // 은신 상태 (화면 위 가운데): 발각! / 의심… / 숨는 중
    this.stealthText = this.add.text(this.scale.width / 2, 12, '', {
      fontFamily: 'sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 0);

    // 상호작용 안내 ("E  제작대 열기")
    this.promptText = this.add.text(this.scale.width / 2, this.scale.height * 0.66, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f2e6c8', backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5);
    this.isTouch = isTouch;

    // 월드가 패널 열기를 요청하면 (월드는 이미 멈춘 상태)
    this.registry.events.on('changedata-openPanel', (_p, req) => {
      if (!req || this.panel) return;
      if (req.type === 'map') {
        this.registry.set('panelOpen', true);
        this.panel = new MapPanel(this, {
          map: this.registry.get('worldMap'), player: this.registry.get('player'),
          onClose: () => { this.panel = null; this.registry.set('panelOpen', false); this.scene.resume('World'); },
        });
        return;
      }
      if (req.type === 'inventory') {
        this.registry.set('panelOpen', true);
        const world = this.scene.get('World');
        this.panel = new InventoryPanel(this, {
          player: this.registry.get('player'), inventory, items,
          weapons: this.registry.get('weapons'), gear: this.registry.get('gear'), skills: this.registry.get('skills'),
          heroPx: this.registry.get('heroPx'),
          eat: (id) => world.eatFood(id),
          onClose: () => { this.panel = null; this.registry.set('panelOpen', false); this.scene.resume('World'); },
        });
        return;
      }
      if (req.type !== 'crafting') return;
      this.registry.set('panelOpen', true);
      this.panel = new CraftingPanel(this, {
        crafting: this.registry.get('crafting'),
        inventory,
        player: this.registry.get('player'),
        items,
        skills: this.registry.get('skills'),
        onCrafted: (info) => {
          this.scene.get('World').saveGame(); // 제작하면 바로 저장
          this.showBanner(`${info.name} 제작!`, '#e8c860');
        },
        onNewGame: () => this.scene.get('World').newGame(),
        onRest: () => this.scene.get('World').restUntilMorning(),
        onClose: () => { this.panel = null; this.registry.set('panelOpen', false); this.scene.resume('World'); },
      });
    });

    // 게임 중 메뉴: Esc 또는 오른쪽 위 [메뉴] 버튼 (제작 화면이 열려 있을 땐 Esc는 제작 화면 닫기)
    const menuBtn = this.add.text(this.scale.width - 12, isTouch ? 56 : 12, '메뉴 (Esc)', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#d8ccb0', backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerdown', (p) => { this.registry.set('uiClickAt', p.downTime); this.openPauseMenu(); });
    this.onEsc = (e) => { if (e.code === 'Escape' && !this.panel && !this.pauseMenu) this.openPauseMenu(); };
    window.addEventListener('keydown', this.onEsc);
    this.events.once('shutdown', () => window.removeEventListener('keydown', this.onEsc));

    if (isTouch) {
      this.registry.set('touch', new TouchControls(this));
    } else {
      this.add.text(12, this.scale.height - 8,
        'WASD/TFGH 이동 · Shift 질주 · C 웅크림 · 마우스 조준 · 왼쪽 클릭/J 공격(연타로 콤보) · Space 구르기 · 오른쪽 클릭/Tab 대상 고정 · 1/2 무기 · E 줍기 · R 먹기 · I 가방 · M 지도 · ` 입력 진단' + (DEBUG ? '   [debug]' : ''),
        { ...small, color: '#c9ced4' }).setOrigin(0, 1).setShadow(1, 1, '#000', 0);
    }
  }

  update(_time, delta) {
    this.inputDebug.update(delta);
    const player = this.registry.get('player');
    if (!player) return;
    const s = player.stats;
    const g = this.bars;
    g.clear();
    this.drawBar(g, 50, 13, s.hp / s.maxHp, 0xb23a2e);
    this.drawBar(g, 50, 31, s.stamina / s.maxStamina, s.regenCooldown > 0 ? 0x8f8a4a : 0xd9c25a);

    this.updateMinimap(player);

    // 낮밤 색 · 시계 · 생존 게이지
    const clock = this.registry.get('clock'), needs = this.registry.get('needs');
    if (clock) {
      const c = clock.tint();
      this.dayNight.setFillStyle((c.r << 16) | (c.g << 8) | c.b);
      this.clockText.setText(clock.label());
    }
    if (needs) {
      const mini = (x, y, v, col) => { g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, 52, 6); g.fillStyle(v <= 25 ? 0xd06050 : col).fillRect(x, y, 50 * v / 100, 4); };
      mini(262, 12, needs.hunger, 0xc8925a); mini(262, 26, needs.thirst, 0x5aa8d8); mini(262, 40, needs.rest, 0x9a8ad0);
      const conds = needs.conditions().map((x) => (x.good ? `+${x.name}` : `!${x.name}`)).join(' ');
      this.needText.setText(`배\n목\n잠`);
      this.condText ??= this.add.text(318, 8, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffd0a0' }).setShadow(1, 1, '#000', 0);
      this.condText.setText(conds);
    }

    this.drawBossBar(this.registry.get('activeBoss'));

    const w = player.weapon;
    const attacking = player.stateName !== 'free' && player.stateName !== 'roll';
    const step = attacking ? `  ${player.comboIndex + 1}/${w.combo.length} ${player.currentMove.name}` : '';
    this.weaponText.setText(`무기: ${w.name}${step}`);
    const worn = player.equipment.wornGear().filter((id) => !id.startsWith('rags_')).length;
    const sets = player.equipment.setStatus().map((s) => `${s.name} ${s.pieces}부위`);
    this.armorText.setText(`방어구: ${worn}개${sets.length ? ` · ${sets.join(', ')}` : ''}`);
    const skills = player.skills.map((sk) => sk.name);
    this.skillText.setText(skills.length ? `스킬: ${skills.join(', ')}` : '');

    const st = this.registry.get('stealth');
    let stealthLabel = '', stealthColor = '#ffffff';
    if (st?.level === 'alert') { stealthLabel = '👁 발각!'; stealthColor = '#ff6a50'; }
    else if (st?.level === 'suspicious') { stealthLabel = '? 의심받는 중'; stealthColor = '#ffe060'; }
    else if (st?.inBush && st?.sneaking) { stealthLabel = '풀숲에 숨음 (웅크림)'; stealthColor = '#9adf5a'; }
    else if (st?.inBush) { stealthLabel = '풀숲'; stealthColor = '#b8d8a0'; }
    else if (st?.sneaking) { stealthLabel = '웅크림'; stealthColor = '#c8d0e0'; }
    this.stealthText.setText(stealthLabel).setColor(stealthColor).setVisible(!!stealthLabel);

    const prompt = this.panel || this.pauseMenu ? null : this.registry.get('interactPrompt');
    this.promptText.setText(prompt ? `${this.isTouch ? '[열기]' : '[E]'}  ${prompt}` : '').setVisible(!!prompt);
    this.registry.get('touch')?.refresh();
  }

  openPauseMenu() {
    if (this.panel || this.pauseMenu) return;
    this.registry.set('panelOpen', true);
    this.scene.pause('World');
    this.pauseMenu = new PauseMenu(this, () => {
      this.pauseMenu = null;
      this.registry.set('panelOpen', false);
      this.scene.resume('World');
    });
  }

  showBanner(text, color) {
    this.bannerText.setText(text).setColor(color ?? '#e8c860').setAlpha(1).setScale(1.15);
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({ targets: this.bannerText, scale: 1, duration: 250, ease: 'Back.out' });
    this.tweens.add({ targets: this.bannerText, alpha: 0, delay: 1800, duration: 600 });
  }

  drawBossBar(boss) {
    const g = this.bossBar;
    g.clear();
    if (!boss) { this.bossName.setText(''); return; }
    const w = 420, h = 12, x = (this.scale.width - w) / 2, y = this.scale.height - 56;
    const phase = boss.currentPhase().name;
    this.bossName.setText(boss.displayName + (phase ? `  — ${phase}` : ''));
    g.fillStyle(0x000000, 0.65).fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle(0x2a2a2a).fillRect(x, y, w, h);
    g.fillStyle(phase ? 0xd04a2a : 0x9a2e24).fillRect(x, y, w * (boss.stats.hp / boss.stats.maxHp), h);
  }

  /** 미니맵: 내 주변(지도 그림의 일부)을 잘라 보여 주고 가운데에 내 위치·방향 */
  updateMinimap(player) {
    const m = this.mini;
    if (!this.textures.exists('map-land')) return;
    if (!this.miniLand) {
      this.miniLand = this.add.image(0, 0, 'map-land').setOrigin(0, 0).setScale(m.scale);
      this.miniFog = this.add.image(0, 0, 'map-fog').setOrigin(0, 0).setScale(m.scale);
      this.miniDot.setDepth(1);
    }
    const tw = m.w / m.scale, th = m.h / m.scale;                       // 지도 그림에서 잘라 낼 크기
    const lw = this.miniLand.width, lh = this.miniLand.height;
    const cx = Math.max(0, Math.min(lw - tw, player.x * MAP_SCALE - tw / 2));
    const cy = Math.max(0, Math.min(lh - th, player.y * MAP_SCALE - th / 2));
    for (const img of [this.miniLand, this.miniFog]) {
      img.setCrop(cx, cy, tw, th).setPosition(m.x - cx * m.scale, m.y - cy * m.scale);
    }
    const px = m.x + (player.x * MAP_SCALE - cx) * m.scale, py = m.y + (player.y * MAP_SCALE - cy) * m.scale;
    const a = player.facingAngle ?? 0, g = this.miniDot;
    g.clear().fillStyle(0x6ec8ff, 1).lineStyle(1, 0x0a1a2a, 1);
    const pts = [[0, 6], [2.5, 4], [-2.5, 4]].map(([k, r], i) => ({ x: px + Math.cos(a + (i ? k : 0)) * (i ? r : 6), y: py + Math.sin(a + (i ? k : 0)) * (i ? r : 6) }));
    g.fillPoints(pts, true).strokePoints(pts, true);
  }

  drawBar(g, x, y, ratio, color) {
    g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, BAR_W + 4, BAR_H + 4);
    g.fillStyle(0x2a2a2a).fillRect(x, y, BAR_W, BAR_H);
    g.fillStyle(color).fillRect(x, y, BAR_W * Math.max(0, ratio), BAR_H);
  }
}
