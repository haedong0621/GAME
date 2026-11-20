/**
 * 입력 진단 화면 (개발용). ` 키 또는 F2로 켜고 끈다. 주소에 ?debug=1 또는 ?input=1 이면 처음부터 켜짐.
 * "키가 씹힌다"의 원인을 가르기 위한 도구:
 *  - 키를 눌렀는데 아래 [브라우저가 받은 키]에 ↓ 기록이 안 생기면 → 키보드/OS 문제 (동시 입력 제한 등)
 *  - 기록은 생겼는데 캐릭터가 안 움직이면 → [이동 막힘] 이유 확인 (공격 후딜, 구르기 …)
 *  - [원인불명 정지]가 올라가면 → 프로그램 버그 (알려 주세요)
 * Godot 이식 대상 아님 (Godot은 에디터 디버거 사용).
 */
const KEYS = [
  ['KeyW', 'W'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'],
  ['Space', 'Spc'], ['KeyJ', 'J'],
];
const ARROW = (x, y) => {
  if (!x && !y) return '없음';
  const a = Math.round((Math.atan2(y, x) * 180) / Math.PI);
  return ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((Math.round(a / 45) % 8) + 8) % 8] + ` (${a}°)`;
};

export class InputDebugPanel {
  constructor(scene, startVisible) {
    this.scene = scene;
    this.visible = startVisible;
    this.g = scene.add.graphics().setDepth(50);
    this.text = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#e8eef2', lineSpacing: 2,
    }).setDepth(51);
    this.spikes = 0;
    this.unexplainedStops = 0;
    this.stopTimer = 0;
    this.blockCounts = {};
    this.lastBlock = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F2') { e.preventDefault(); this.visible = !this.visible; }
    });
  }

  update(dt) {
    const input = this.scene.registry.get('inputSystem');
    const player = this.scene.registry.get('player');
    if (dt > 50) this.spikes += 1;
    if (!input || !player) return;

    // 원인불명 정지 감지: 이동 입력 O, 막힌 이유 없음, 그런데 속도가 거의 0인 상태가 150ms 이상
    const mv = input.lastMove ?? { x: 0, y: 0 };
    const wants = mv.x !== 0 || mv.y !== 0;
    const v = player.body.velocity;
    const along = v.x * mv.x + v.y * mv.y;
    const blockedByWall = !player.body.blocked.none || !player.body.touching.none;
    if (wants && !player.moveBlockedBy && along < 15 && !blockedByWall) {
      this.stopTimer += dt;
      if (this.stopTimer > 150 && this.stopTimer - dt <= 150) this.unexplainedStops += 1;
    } else {
      this.stopTimer = 0;
    }
    if (player.moveBlockedBy && player.moveBlockedBy !== this.lastBlock) {
      this.blockCounts[player.moveBlockedBy] = (this.blockCounts[player.moveBlockedBy] ?? 0) + 1;
    }
    this.lastBlock = player.moveBlockedBy;

    this.g.clear();
    this.text.setVisible(this.visible);
    if (!this.visible) return;

    const W = this.scene.scale.width;
    const x0 = W - 330, y0 = 50;
    this.g.fillStyle(0x000000, 0.72).fillRect(x0 - 10, y0 - 8, 330, 372);

    // 키 상자
    KEYS.forEach(([code, label], i) => {
      const on = input.rawHeld.has(code);
      const bx = x0 + i * 44, by = y0;
      this.g.fillStyle(on ? 0x5ad06a : 0x333a40).fillRoundedRect(bx, by, 40, 26, 4);
    });
    const keyLabels = KEYS.map(([, l]) => ` ${l}`.padEnd(4)).join('  ');

    const now = performance.now();
    const log = [...input.log].reverse().slice(0, 8).map((e) => {
      const ago = ((now - e.at) / 1000).toFixed(1).padStart(4);
      const arrow = e.type === 'down' ? '↓' : e.type === 'up' ? '↑' : '⚠';
      const extra = e.composing ? ' [한글조합]' : '';
      return `${ago}s ${arrow} ${e.code}${e.key && e.key.length === 1 ? ` (${e.key})` : ''}${extra}`;
    });
    const blocks = Object.entries(this.blockCounts).map(([k, n]) => `${k} ${n}`).join(', ') || '-';

    this.text.setPosition(x0, y0 + 6).setText([
      keyLabels,
      '',
      `동시에 눌린 키: ${input.rawHeld.size}개`,
      `이동 입력: ${ARROW(mv.x, mv.y)}`,
      `캐릭터 상태: ${player.stateName}`,
      `이동 막힘: ${player.moveBlockedBy ?? '-'}`,
      `  누적: ${blocks}`,
      `벽/물체에 닿음: ${blockedByWall ? '예' : '아니오'}`,
      `원인불명 정지: ${this.unexplainedStops}회`,
      `프레임 끊김(50ms+): ${this.spikes}회   FPS ${Math.round(this.scene.game.loop.actualFps)}`,
      '',
      '[브라우저가 받은 키] (최근 8개)',
      ...log,
      '',
      '` 또는 F2: 진단 화면 끄기',
    ].join('\n'));
  }
}
