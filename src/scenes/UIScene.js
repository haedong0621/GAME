import { DEBUG } from '../config.js';

/**
 * HUD 씬: 월드 위에 겹쳐 그리는 화면 고정 UI.
 * Godot: CanvasLayer + Label, Inventory.changed 시그널에 연결.
 */
export class UIScene extends window.Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    const items = this.registry.get('items');
    const inventory = this.registry.get('inventory');
    const style = { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff' };

    this.add.text(12, 8, 'WASD: 이동' + (DEBUG ? '   [debug]' : ''), style)
      .setShadow(2, 2, '#000', 0);

    this.invText = this.add.text(12, 34, '', style).setShadow(2, 2, '#000', 0);

    const refresh = () => {
      const lines = inventory.entries().map(([id, n]) => `· ${items.get(id).name} ×${n}`);
      this.invText.setText(['가방', ...(lines.length ? lines : ['  (비어 있음)'])].join('\n'));
    };
    refresh();
    inventory.onChange(refresh);

    this.add.text(this.scale.width - 12, this.scale.height - 8,
      `아이템 데이터 ${items.count}종 로드됨`, { ...style, color: '#9aa4ae' })
      .setOrigin(1, 1);
  }
}
