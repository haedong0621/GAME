import { PATHS, HERO_STYLE, HERO_FRAME, HERO_PX } from '../config.js';
import { createPlaceholderArt } from '../systems/PlaceholderArt.js';
import { ItemDatabase } from '../systems/ItemDatabase.js';
import { Inventory } from '../systems/Inventory.js';
import { Crafting } from '../systems/Crafting.js';

/**
 * 부팅 씬: 데이터·맵·그림을 미리 읽고, 공용 시스템을 만든 뒤 월드를 시작한다.
 * Godot: 메인 씬 _ready()에서 Autoload 초기화 후 World.tscn 로드.
 */
export class BootScene extends window.Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.json('items', PATHS.items);
    this.load.json('player', PATHS.player);
    this.load.json('weapons', PATHS.weapons);
    this.load.json('monsters', PATHS.monsters);
    this.load.json('gear', PATHS.gear);
    this.load.json('skills', PATHS.skills);
    this.load.json('recipes', PATHS.recipes);
    this.load.json('gatherables', PATHS.gatherables);
    this.load.json('regions', PATHS.regions);
    this.load.json('worldRules', PATHS.world);
    this.load.json('npcs', PATHS.npcs);
    this.load.json('dialogues', PATHS.dialogues);
    this.load.json('quests', PATHS.quests);
    this.load.tilemapTiledJSON('world', PATHS.worldMap);
    // 절벽 굽기 결과 (tools/art/terrain_bake.py): 충돌 격자 + 그림 조각
    this.load.json('worldTerrain', PATHS.worldTerrain);
    this.load.once('filecomplete-json-worldTerrain', (_k, _t, data) => {
      for (const c of data.chunks ?? []) this.load.image(c.key, c.path);
    });
    // 몬스터 도트 시트 (tools/art/pixel_monsters.py)
    this.load.json('monPxMeta', 'assets/characters/mon_px.json');
    this.load.once('filecomplete-json-monPxMeta', (_k, _t, meta) => {
      for (const k of Object.values(meta.kinds)) this.load.spritesheet(k.key, `assets/characters/${k.key}.png`, { frameWidth: k.frameWidth, frameHeight: k.frameHeight });
    });
    if (HERO_PX) {
      // 2D 도트 주인공: 갑옷(outfit)마다 같은 배치의 시트 (tools/art/pixel_hero.py)
      this.load.json('heroPxMeta', 'assets/characters/hero_px.json');
      // 시트 목록은 메타 JSON에 있으므로, JSON이 로드되면 이어서 시트들을 불러온다
      this.load.once('filecomplete-json-heroPxMeta', (_k, _t, meta) => {
        // 부위별 층 시트 (머리·몸·팔 앞뒤·다리 × 갑옷 × 무기 종류) + 무기 층 시트
        const keys = new Set();
        for (const byOutfit of Object.values(meta.parts)) for (const byCls of Object.values(byOutfit)) for (const layers of Object.values(byCls)) for (const k of Object.values(layers)) keys.add(k);
        for (const w of Object.values(meta.weapons)) { keys.add(w.wpnB); keys.add(w.wpnF); }
        for (const key of keys) this.load.spritesheet(key, `assets/characters/${key}.png`, { frameWidth: meta.frameWidth, frameHeight: meta.frameHeight });
      });
    }
    if (HERO_STYLE) {
      // 3D 렌더 → 도트 스프라이트 시트 (시험)
      this.load.json('hero3dMeta', `assets/characters/hero3d_${HERO_STYLE}.json`);
      const f = HERO_FRAME[HERO_STYLE];
      this.load.spritesheet('hero3d', `assets/characters/hero3d_${HERO_STYLE}.png`, { frameWidth: f, frameHeight: f });
    }
    this.load.image('world_tiles', PATHS.worldTiles);
    // 배경 소품 도트 (tools/art/pixel_world.py)
    for (const k of ['tree0', 'tree1', 'tree2', 'bush', 'workbench', 'dummy', 'stump', 'rock0', 'rock1', 'rock_rubble', 'herb', 'herb_picked', 'pine0', 'pine1', 'deadtree0',
      'decor_mushrooms', 'decor_tallgrass', 'decor_reeds', 'decor_bones', 'decor_campfire', 'decor_tent',
      'house0', 'house1', 'house_burned0', 'house_burned1', 'well', 'fence_h', 'fence_v', 'watermill', 'ruin_tower', 'ruin_altar', 'fallen_tree', 'bridge_h']) this.load.image(k, `assets/tiles/${k}.png`);
  }

  create() {
    const items = new ItemDatabase(this.cache.json.get('items'));
    console.log(`[Boot] 아이템 데이터 ${items.count}종 로드:`, items.ids().join(', '));

    createPlaceholderArt(this, items, this.cache.json.get('weapons'));

    // 씬끼리 공유하는 시스템은 registry에 둔다 (Godot의 Autoload 역할).
    this.registry.set('items', items);
    this.registry.set('inventory', new Inventory());
    this.registry.set('playerData', this.cache.json.get('player'));
    this.registry.set('weapons', this.cache.json.get('weapons'));
    this.registry.set('monsters', this.cache.json.get('monsters'));
    this.registry.set('gear', this.cache.json.get('gear'));
    this.registry.set('skills', this.cache.json.get('skills'));
    this.registry.set('gatherables', this.cache.json.get('gatherables'));
    this.registry.set('regionsData', this.cache.json.get('regions'));
    this.registry.set('worldRules', this.cache.json.get('worldRules'));
    for (const k of ['npcs', 'dialogues', 'quests']) this.registry.set(k, this.cache.json.get(k));
    this.registry.set('crafting', new Crafting(this.cache.json.get('recipes'), this.cache.json.get('weapons'), this.cache.json.get('gear')));

    // 알림용 값은 미리 만들어 둔다: Phaser registry는 "처음" 저장할 때는 changedata 이벤트를 보내지 않음
    this.registry.set('banner', null);
    this.registry.set('openPanel', null);
    this.registry.set('panelOpen', false);
    this.registry.set('interactPrompt', null);
    this.registry.set('uiClickAt', -1);
    this.registry.set('stealth', null);

    this.registry.set('loadSlot', null);
    this.registry.set('hero3d', HERO_STYLE ? this.cache.json.get('hero3dMeta') : null);
    this.registry.set('heroPx', HERO_PX ? this.cache.json.get('heroPxMeta') : null);
    this.registry.set('monPx', this.cache.json.get('monPxMeta'));

    this.scene.start('Title'); // 시작 화면 → 이어하기/불러오기/새로 시작 → World + UI
  }
}
