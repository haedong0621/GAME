import { VIEW_WIDTH, VIEW_HEIGHT, DEBUG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { UIScene } from './scenes/UIScene.js';

// Phaser는 index.html에서 CDN으로 불러온 전역 객체다.
const { Phaser } = window;

// window.__game: 브라우저 콘솔·자동 테스트에서 게임 상태를 들여다보기 위한 핸들
window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  backgroundColor: '#1b1f24',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    // fixedStep: false — 물리를 화면이 그려지는 박자에 맞춰 계산한다.
    // (기본값 true는 1/60초 고정이라, 120Hz 모니터나 프레임 박자가 흔들릴 때 "안 움직이는 프레임"이 끼어 끊겨 보였다)
    arcade: { gravity: { x: 0, y: 0 }, debug: DEBUG, fixedStep: false },
  },
  scene: [BootScene, WorldScene, UIScene],
});
