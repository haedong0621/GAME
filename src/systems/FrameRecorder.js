/**
 * 블랙박스 기록 (개발용): 최근 10초 동안 매 프레임의 상태를 계속 기억하다가,
 * F8(또는 테스트 모드의 [기록 저장] 버튼)을 누르면 JSON 파일로 내려받는다.
 * "가끔 끊긴다"처럼 재현이 어려운 문제를 분석하기 위한 도구. 파일을 Claude에게 주면 분석한다.
 * Godot 이식 대상 아님.
 */
const KEEP_MS = 10000;

export class FrameRecorder {
  /** @param {Phaser.Scene} scene 월드 씬 */
  constructor(scene) {
    this.scene = scene;
    this.frames = [];
    this.marks = [];
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F8') { e.preventDefault(); this.download(); }
    });
  }

  /** 월드 씬 update 끝에서 매 프레임 호출 */
  record(dt, cmd, player, input) {
    const now = performance.now();
    const cam = this.scene.cameras.main;
    this.frames.push({
      t: Math.round(now),
      dt: +dt.toFixed(2),
      keys: [...(input.rawHeld ?? [])].join('+'),
      mv: [+cmd.move.x.toFixed(2), +cmd.move.y.toFixed(2)],
      act: [cmd.attack && 'atk', cmd.roll && 'roll', cmd.lockToggle && 'lock', cmd.interact && 'use'].filter(Boolean).join(','),
      st: player.stateName,
      hs: player.hitstopMs > 0 ? 1 : 0,
      blk: player.moveBlockedBy ?? '',
      x: +player.x.toFixed(2),
      y: +player.y.toFixed(2),
      vx: Math.round(player.body.velocity.x),
      vy: Math.round(player.body.velocity.y),
      wall: player.body.blocked.none && player.body.touching.none ? 0 : 1,
      cam: [+cam.scrollX.toFixed(1), +cam.scrollY.toFixed(1)],
      fps: Math.round(this.scene.game.loop.actualFps),
    });
    while (this.frames.length && now - this.frames[0].t > KEEP_MS) this.frames.shift();
  }

  download() {
    const data = {
      what: 'GAME 블랙박스 기록 (최근 10초, 매 프레임)',
      savedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio },
      legend: 'dt=프레임 간격ms, keys=눌린 키, mv=이동 입력, act=버튼 입력, st=상태, hs=히트스톱, blk=이동 막힘 이유, x/y=위치, vx/vy=속도, wall=벽 닿음, cam=카메라',
      frames: this.frames,
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `game-record-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.scene.registry.set('banner', { text: '기록 저장됨 (F8)', color: '#9adf5a', at: performance.now() });
  }
}
