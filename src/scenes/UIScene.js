import { DEBUG, FORCE_TOUCH } from '../config.js';
import { TouchControls } from '../systems/TouchControls.js';
import { InputDebugPanel } from '../systems/InputDebugPanel.js';
import { CraftingPanel } from '../systems/CraftingPanel.js';
import { DevTools } from '../systems/DevTools.js';

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
      if (!req || req.type !== 'crafting' || this.panel) return;
      this.registry.set('panelOpen', true);
      this.panel = new CraftingPanel(this, {
        crafting: this.registry.get('crafting'),
        inventory,
        player: this.registry.get('player'),
        items,
        skills: this.registry.get('skills'),
        onCrafted: (info) => this.showBanner(`${info.name} 제작!`, '#e8c860'),
        onClose: () => { this.panel = null; this.registry.set('panelOpen', false); this.scene.resume('World'); },
      });
    });

    if (isTouch) {
      this.registry.set('touch', new TouchControls(this));
    } else {
      this.add.text(12, this.scale.height - 8,
        'WASD/TFGH 이동 · Shift 웅크림 · 마우스 조준 · 왼쪽 클릭/J 공격(연타로 콤보) · Space 구르기 · 오른쪽 클릭/Tab 대상 고정 · 1/2 무기 · ` 입력 진단' + (DEBUG ? '   [debug]' : ''),
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

    this.drawBossBar(this.registry.get('activeBoss'));

    const w = player.weapon;
    const attacking = player.stateName !== 'free' && player.stateName !== 'roll';
    const step = attacking ? `  ${player.comboIndex + 1}/${w.combo.length} ${player.currentMove.name}` : '';
    this.weaponText.setText(`무기: ${w.name}${step}`);
    this.armorText.setText(`갑옷: ${player.armor.name}`);
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

    const prompt = this.panel ? null : this.registry.get('interactPrompt');
    this.promptText.setText(prompt ? `${this.isTouch ? '[열기]' : '[E]'}  ${prompt}` : '').setVisible(!!prompt);
    this.registry.get('touch')?.refresh();
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

  drawBar(g, x, y, ratio, color) {
    g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, BAR_W + 4, BAR_H + 4);
    g.fillStyle(0x2a2a2a).fillRect(x, y, BAR_W, BAR_H);
    g.fillStyle(color).fillRect(x, y, BAR_W * Math.max(0, ratio), BAR_H);
  }
}
