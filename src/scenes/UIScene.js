import { DEBUG, FORCE_TOUCH } from '../config.js';
import { TouchControls } from '../systems/TouchControls.js';

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

    // 들고 있는 무기 + 콤보 단계
    this.weaponText = this.add.text(12, 48, '', small).setShadow(1, 1, '#000', 0);

    this.invText = this.add.text(12, 72, '', style).setShadow(2, 2, '#000', 0);
    const refresh = () => {
      const lines = inventory.entries().map(([id, n]) => `· ${items.get(id).name} ×${n}`);
      this.invText.setText(['가방', ...(lines.length ? lines : ['  (비어 있음)'])].join('\n'));
    };
    refresh();
    inventory.onChange(refresh);

    if (isTouch) {
      this.registry.set('touch', new TouchControls(this));
    } else {
      this.add.text(12, this.scale.height - 8,
        'WASD 이동 · J/마우스 왼쪽 공격(연타로 콤보) · Space/K 구르기 · 1/2 무기' + (DEBUG ? '   [debug]' : ''),
        { ...small, color: '#c9ced4' }).setOrigin(0, 1).setShadow(1, 1, '#000', 0);
    }
  }

  update() {
    const player = this.registry.get('player');
    if (!player) return;
    const s = player.stats;
    const g = this.bars;
    g.clear();
    this.drawBar(g, 50, 13, s.hp / s.maxHp, 0xb23a2e);
    this.drawBar(g, 50, 31, s.stamina / s.maxStamina, s.regenCooldown > 0 ? 0x8f8a4a : 0xd9c25a);

    const w = player.weapon;
    const attacking = player.stateName !== 'free' && player.stateName !== 'roll';
    const step = attacking ? `  ${player.comboIndex + 1}/${w.combo.length} ${player.currentMove.name}` : '';
    this.weaponText.setText(`무기: ${w.name}${step}`);
  }

  drawBar(g, x, y, ratio, color) {
    g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, BAR_W + 4, BAR_H + 4);
    g.fillStyle(0x2a2a2a).fillRect(x, y, BAR_W, BAR_H);
    g.fillStyle(color).fillRect(x, y, BAR_W * Math.max(0, ratio), BAR_H);
  }
}
