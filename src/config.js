// 공용 상수. 콘텐츠(아이템, 수치 밸런스)는 여기가 아니라 data/*.json에 둔다.

/** 타일 한 칸 크기(px). 이식 규칙상 고정값. */
export const TILE_SIZE = 32;

/** 게임 캔버스 해상도(px). 창 크기에 맞춰 늘어난다. UI 글씨는 이 해상도로 선명하게 그린다. */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;

/** 월드 카메라 확대 배율. 픽셀아트를 크게 보여 준다 (화면에 가로 15칸 × 세로 약 8.4칸). */
export const WORLD_ZOOM = 2;

/** 주소에 ?debug=1 이 있으면 충돌 박스를 그린다. */
export const DEBUG = new URLSearchParams(window.location.search).has('debug');

/** 터치 조작판 표시: 터치 화면이면 자동, 주소에 ?touch=1 이면 강제로 켬 */
/**
 * 3D → 도트 캐릭터 시험 (비주얼 방향 검증): 주소에 ?hero=s (작게, 프레임 64px) 또는 ?hero=l (크게, 96px).
 * 없으면 기존 임시 그래픽.
 */
const heroParam = new URLSearchParams(window.location.search).get('hero');
export const HERO_STYLE = heroParam === 's' || heroParam === 'l' ? heroParam : null;
export const HERO_FRAME = { s: 64, l: 96 };

export const FORCE_TOUCH = new URLSearchParams(window.location.search).has('touch');

/** 미리 불러올 파일 경로 (index.html 기준 상대 경로 — GitHub Pages 호환). */
export const PATHS = {
  items: 'data/items.json',
  player: 'data/player.json',
  weapons: 'data/weapons.json',
  monsters: 'data/monsters.json',
  armors: 'data/armors.json',
  skills: 'data/skills.json',
  recipes: 'data/recipes.json',
  worldMap: 'maps/world.tmj',
  placeholderTiles: 'assets/tiles/placeholder_tiles.png',
};
