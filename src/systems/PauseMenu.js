import { SaveSystem } from './SaveSystem.js';
import { MenuList } from './MenuList.js';

/**
 * 게임 중 메뉴 (Esc / 화면 오른쪽 위 [메뉴]): 계속하기 · 수동 저장 불러오기 · 자동 저장 불러오기 · 처음부터 다시.
 * 열려 있는 동안 월드는 멈춘다. 불러오기는 페이지를 새로 불러와 그 슬롯으로 시작.
 * Godot: PauseMenu.tscn (CanvasLayer, process_mode = ALWAYS) + get_tree().paused
 */
export class PauseMenu {
  /** @param {Phaser.Scene} ui UI 씬 @param {Function} onClose */
  constructor(ui, onClose) {
    this.ui = ui;
    this.onClose = onClose;
    const W = ui.scale.width, H = ui.scale.height;
    this.dim = ui.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setDepth(250).setInteractive(); // 알림 글씨(200)보다 위
    this.title = ui.add.text(W / 2, 96, '메뉴', { fontFamily: 'serif', fontSize: '30px', fontStyle: 'bold', color: '#e8c860' })
      .setOrigin(0.5).setDepth(251).setStroke('#000', 5);
    const weapons = ui.registry.get('weapons');
    const manual = SaveSystem.load('manual'), auto = SaveSystem.load('auto');
    const load = (slot) => SaveSystem.reloadInto(slot, `${slot === 'auto' ? '자동' : '수동'} 저장 불러옴`);
    this.menu = new MenuList(ui, W / 2, 140, [
      { label: '계속하기', onSelect: () => this.close() },
      { label: '수동 저장 불러오기 (거점)', sub: SaveSystem.describe(manual, weapons), enabled: !!manual, onSelect: () => load('manual') },
      { label: '자동 저장 불러오기 (지역 이동)', sub: SaveSystem.describe(auto, weapons), enabled: !!auto, onSelect: () => load('auto') },
      { label: '처음부터 다시', onSelect: () => {
        if (window.confirm('저장을 모두 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) { SaveSystem.clearAll(); SaveSystem.reloadInto('new', '처음부터 시작'); }
      } },
    ], { width: 560, depth: 252, onBack: () => this.close() });
  }

  close() {
    this.menu.destroy();
    this.dim.destroy();
    this.title.destroy();
    this.onClose?.();
  }
}
