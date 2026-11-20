import { PATHS } from '../config.js';
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
    this.load.json('armors', PATHS.armors);
    this.load.json('skills', PATHS.skills);
    this.load.json('recipes', PATHS.recipes);
    this.load.tilemapTiledJSON('world', PATHS.worldMap);
    this.load.image('placeholder_tiles', PATHS.placeholderTiles);
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
    this.registry.set('armors', this.cache.json.get('armors'));
    this.registry.set('skills', this.cache.json.get('skills'));
    this.registry.set('crafting', new Crafting(this.cache.json.get('recipes'), this.cache.json.get('weapons'), this.cache.json.get('armors')));

    // 알림용 값은 미리 만들어 둔다: Phaser registry는 "처음" 저장할 때는 changedata 이벤트를 보내지 않음
    this.registry.set('banner', null);
    this.registry.set('openPanel', null);
    this.registry.set('panelOpen', false);
    this.registry.set('interactPrompt', null);
    this.registry.set('uiClickAt', -1);
    this.registry.set('stealth', null);

    this.registry.set('loadSlot', null);

    this.scene.start('Title'); // 시작 화면 → 이어하기/불러오기/새로 시작 → World + UI
  }
}
