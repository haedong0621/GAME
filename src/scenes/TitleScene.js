import { SaveSystem } from '../systems/SaveSystem.js';
import { MenuList } from '../systems/MenuList.js';

/**
 * 시작 화면: 이어하기(최근 저장) / 불러오기(슬롯 선택) / 새로 시작.
 * 불러오기 요청이 이미 있으면(쓰러져서 다시 불러오기 등) 화면 없이 바로 시작한다.
 * Godot: Title.tscn (Control) → 선택에 따라 World.tscn 로드.
 */
export class TitleScene extends window.Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    SaveSystem.migrate();
    const pending = SaveSystem.takePending();
    if (pending) { this.startGame(pending === 'new' ? null : pending); return; }
    // 개발·테스트용: 주소에 ?dev=1 또는 ?play=1 이면 시작 화면 없이 최근 저장(없으면 새 게임)으로 바로 시작
    const q = new URLSearchParams(window.location.search);
    if (q.has('dev') || q.has('play')) { this.startGame(SaveSystem.latest()?.slot ?? null); return; }

    const W = this.scale.width, H = this.scale.height;
    this.add.rectangle(0, 0, W, H, 0x0e0c0a).setOrigin(0);
    this.add.text(W / 2, 92, 'GAME', { fontFamily: 'serif', fontSize: '44px', fontStyle: 'bold', color: '#d8c89a' })
      .setOrigin(0.5).setStroke('#000', 6);
    this.add.text(W / 2, 140, '2D 탑뷰 오픈월드 RPG · 프로토타입', { fontFamily: 'sans-serif', fontSize: '14px', color: '#8a7a64' }).setOrigin(0.5);

    this.showMain();
  }

  showMain() {
    this.menu?.destroy();
    const latest = SaveSystem.latest();
    const weapons = this.registry.get('weapons');
    const items = [];
    if (latest) {
      items.push({ label: '이어하기', sub: `${latest.slot === 'auto' ? '자동' : '수동'} 저장 — ${SaveSystem.describe(latest, weapons)}`, onSelect: () => this.startGame(latest.slot) });
      items.push({ label: '불러오기', onSelect: () => this.showLoad() });
    }
    items.push({ label: '새로 시작', onSelect: () => this.confirmNew(!!latest) });
    this.menu = new MenuList(this, this.scale.width / 2, 200, items, { width: 520 });
  }

  showLoad() {
    this.menu?.destroy();
    const weapons = this.registry.get('weapons');
    const manual = SaveSystem.load('manual'), auto = SaveSystem.load('auto');
    this.menu = new MenuList(this, this.scale.width / 2, 200, [
      { label: '수동 저장 (거점)', sub: SaveSystem.describe(manual, weapons), enabled: !!manual, onSelect: () => this.startGame('manual') },
      { label: '자동 저장 (지역 이동)', sub: SaveSystem.describe(auto, weapons), enabled: !!auto, onSelect: () => this.startGame('auto') },
      { label: '뒤로', onSelect: () => this.showMain() },
    ], { width: 560, onBack: () => this.showMain() });
  }

  confirmNew(hasSave) {
    if (hasSave && !window.confirm('저장을 모두 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) return;
    SaveSystem.clearAll();
    this.startGame(null);
  }

  /** @param {'manual'|'auto'|null} slot null이면 새 게임 */
  startGame(slot) {
    this.menu?.destroy();
    this.registry.set('loadSlot', slot);
    this.scene.start('World');
    this.scene.launch('UI');
  }
}
