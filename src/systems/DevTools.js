/**
 * 테스트 모드 (개발용): 주소에 ?dev=1 이면 화면 오른쪽에 버튼이 생긴다. 마우스·터치 모두 가능.
 * 보스를 매번 처음부터 잡지 않고 원하는 상황을 바로 만들어 보기 위한 도구. Godot 이식 대상 아님.
 */
export class DevTools {
  /** @param {Phaser.Scene} ui UI 씬 */
  constructor(ui) {
    this.ui = ui;
    const world = () => ui.scene.get('World');
    const actions = [
      ['보스 앞으로 (번갈아)', () => world().devTeleportToBoss()],
      ['들개 근처로', () => world().devTeleportToHounds()],
      ['적 경계 해제', () => world().devCalmAll()],
      ['보스 체력 20%', () => world().devBossHp(0.2)],
      ['보스 즉시 부활', () => world().devReviveBoss()],
      ['재료 받기', () => world().devGiveMaterials()],
      ['무적 켜기/끄기', () => world().devToggleGod()],
      ['체력·기력 회복', () => world().devHeal()],
      ['장비 초기화', () => world().devResetGear()],
      ['새로 시작 (저장 삭제)', () => world().devNewGame()],
      ['기록 저장 (F8)', () => world().recorder.download()],
    ];
    const x = 12, y0 = ui.scale.height - 40 - actions.length * 34; // 왼쪽 아래 (진단 화면과 안 겹치게)
    ui.add.text(x, y0 - 24, '테스트 모드', { fontFamily: 'sans-serif', fontSize: '13px', color: '#9adf5a' }).setDepth(60);
    actions.forEach(([label, fn], i) => {
      const y = y0 + i * 34;
      const r = ui.add.rectangle(x + 66, y + 13, 132, 28, 0x1e2a1a, 0.85).setStrokeStyle(1, 0x5a8a4a)
        .setInteractive({ useHandCursor: true }).setDepth(60);
      ui.add.text(x + 66, y + 13, label, { fontFamily: 'sans-serif', fontSize: '13px', color: '#dfe8d8' }).setOrigin(0.5).setDepth(61);
      r.on('pointerdown', (p) => { ui.registry.set('uiClickAt', p.downTime); fn(); r.setFillStyle(0x3a5a2a, 0.95); ui.time.delayedCall(120, () => r.setFillStyle(0x1e2a1a, 0.85)); });
    });
  }
}
