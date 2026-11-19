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
    arcade: { gravity: { x: 0, y: 0 }, debug: DEBUG },
  },
  scene: [BootScene, WorldScene, UIScene],
});
