import { Player } from '../entities/Player.js';
import { Tree } from '../entities/Tree.js';
import { ItemPickup } from '../entities/ItemPickup.js';
import { Monster } from '../entities/Monster.js';
import { InputSystem } from '../systems/InputSystem.js';
import { getProperty } from '../systems/TiledUtil.js';
import { GROUND_DEPTH } from '../systems/YSort.js';
import { WORLD_ZOOM } from '../config.js';

/**
 * 월드 씬: Tiled 맵을 읽어 바닥·나무·아이템·몬스터·플레이어를 배치하고 카메라를 붙인다.
 * 씬은 "조립"만 하고, 동작은 각 엔티티/시스템이 맡는다.
 */
export class WorldScene extends window.Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    // ---- 맵과 바닥
    const map = this.make.tilemap({ key: 'world' });
    const tileset = map.addTilesetImage('placeholder_tiles', 'placeholder_tiles');
    const ground = map.createLayer('ground', tileset, 0, 0);
    ground.setDepth(GROUND_DEPTH);
    ground.setCollisionByProperty({ collides: true }); // 물 등 막힌 타일

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // ---- 맵 오브젝트 → 엔티티
    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const blockers = this.physics.add.staticGroup(); // 나무 줄기, 몬스터 발밑 등 길을 막는 것
    const pickups = this.physics.add.group({ allowGravity: false, immovable: true });
    const items = this.registry.get('items');
    const monsterData = this.registry.get('monsters');
    this.monsters = [];
    let spawn = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 };

    for (const obj of objects) {
      switch (obj.type) {
        case 'spawn':
          spawn = { x: obj.x, y: obj.y };
          break;
        case 'tree':
          blockers.add(new Tree(this, obj.x, obj.y).trunk);
          break;
        case 'item': {
          const itemId = getProperty(obj, 'itemId');
          if (!items.has(itemId)) {
            console.warn(`[World] 맵에 알 수 없는 아이템 id: ${itemId}`);
            break;
          }
          pickups.add(new ItemPickup(this, obj.x, obj.y, itemId, getProperty(obj, 'amount', 1)));
          break;
        }
        case 'monster': {
          const monsterId = getProperty(obj, 'monsterId');
          const data = monsterData[monsterId];
          if (!data) {
            console.warn(`[World] 맵에 알 수 없는 몬스터 id: ${monsterId}`);
            break;
          }
          const m = new Monster(this, obj.x, obj.y, monsterId, data);
          blockers.add(m.feet);
          this.monsters.push(m);
          break;
        }
        default:
          console.warn(`[World] 처리하지 않는 오브젝트 type: ${obj.type}`);
      }
    }

    // ---- 플레이어
    const playerData = this.registry.get('playerData');
    const weapon = this.registry.get('weapons')[playerData.startWeapon];
    this.inputSystem = new InputSystem(this);
    this.player = new Player(this, spawn.x, spawn.y, playerData, weapon, () => this.monsters);
    this.registry.set('player', this.player); // HUD가 체력·스태미나를 읽음

    this.physics.add.collider(this.player, blockers);
    this.physics.add.collider(this.player, ground);
    this.physics.add.overlap(this.player, pickups, (_player, pickup) => {
      this.registry.get('inventory').add(pickup.itemId, pickup.amount);
      pickup.collect();
    });

    // ---- 카메라: 부드럽게 따라가고 맵 밖은 안 보이게
    const cam = this.cameras.main;
    cam.setZoom(WORLD_ZOOM);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.12, 0.12);
  }

  update(_time, delta) {
    this.player.update(this.inputSystem.getCommand(), delta);
  }
}
