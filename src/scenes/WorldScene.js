import { Player } from '../entities/Player.js';
import { Tree } from '../entities/Tree.js';
import { ItemPickup } from '../entities/ItemPickup.js';
import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { Workbench } from '../entities/Workbench.js';
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
    this.pickups = pickups;
    const items = this.registry.get('items');
    const monsterData = this.registry.get('monsters');
    this.monsters = [];
    this.bosses = [];
    this.interactables = []; // 제작대 등 상호작용 가능한 것
    let spawn = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 };

    for (const obj of objects) {
      switch (obj.type) {
        case 'spawn':
          spawn = { x: obj.x, y: obj.y };
          break;
        case 'workbench': {
          const wb = new Workbench(this, obj.x, obj.y);
          blockers.add(wb.blocker);
          this.interactables.push(wb);
          break;
        }
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
          if (data.ai === 'boss') {
            const b = new Boss(this, obj.x, obj.y, monsterId, data, () => this.player, (boss) => this.onBossDefeated(boss));
            this.bosses.push(b);
            this.monsters.push(b);
          } else {
            const m = new Monster(this, obj.x, obj.y, monsterId, data);
            blockers.add(m.feet);
            this.monsters.push(m);
          }
          break;
        }
        default:
          console.warn(`[World] 처리하지 않는 오브젝트 type: ${obj.type}`);
      }
    }

    // ---- 플레이어
    const playerData = this.registry.get('playerData');
    this.inputSystem = new InputSystem(this, () => this.registry.get('touch'));
    this.registry.set('inputSystem', this.inputSystem); // 입력 진단 화면용
    const db = { weapons: this.registry.get('weapons'), armors: this.registry.get('armors'), skills: this.registry.get('skills') };
    this.player = new Player(this, spawn.x, spawn.y, playerData, db, () => this.monsters);
    this.registry.set('player', this.player); // HUD가 체력·스태미나를 읽음

    this.spawnPoint = spawn;
    this.player.onDeath = () => this.onPlayerDeath();

    this.physics.add.collider(this.player, blockers);
    this.physics.add.collider(this.player, ground);
    for (const b of this.bosses) {
      this.physics.add.collider(this.player, b);
      this.physics.add.collider(b, blockers);
      this.physics.add.collider(b, ground);
    }
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
    const cmd = this.inputSystem.getCommand();

    // 상호작용: 가장 가까운 대상이 범위 안이면 안내 표시, 누르면 열기
    const near = this.nearestInteractable();
    this.registry.set('interactPrompt', near && !this.player.isDead ? near.label : null);
    if (cmd.interact && near && this.player.stateName === 'free') {
      this.openPanel(near.action);
      return;
    }

    this.player.update(cmd, delta);
    for (const m of this.monsters) m.update?.(delta); // 보스 AI, 상태 이상(독) 등
    // HUD에 보여 줄 보스: 플레이어를 발견한 보스
    this.registry.set('activeBoss', this.bosses.find((b) => b.isAlert) ?? null);
  }

  nearestInteractable() {
    let best = null, bestD = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(it.x - this.player.x, it.y - this.player.y);
      if (d <= it.interactRadius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  /** 제작 화면 등 열기: 월드를 멈추고 UI 씬에 알린다 (닫히면 UI 씬이 월드를 다시 움직임) */
  openPanel(type) {
    this.player.setVelocity(0, 0);
    this.registry.set('openPanel', { type, at: this.time.now });
    this.scene.pause();
  }

  /** HUD 가운데 큰 글씨 알림 (Godot: signal banner(text)) */
  banner(text, color) {
    this.registry.set('banner', { text, color, at: this.time.now });
  }

  onPlayerDeath() {
    this.banner('쓰러졌다…', '#d06050');
    this.time.delayedCall(this.player.data_.respawnDelayMs, () => {
      this.player.respawn(this.spawnPoint.x, this.spawnPoint.y);
      for (const b of this.bosses) b.resetToHome();
    });
  }

  onBossDefeated(boss) {
    this.banner(`${boss.displayName} 토벌!`, '#e8c860');
    // 보상: 쓰러진 자리 주변에 재료를 떨군다 (data/monsters.json 의 drops)
    const items = this.registry.get('items');
    (boss.data_.drops ?? []).forEach((d, i, all) => {
      if (!items.has(d.itemId)) return;
      const a = (i / all.length) * Math.PI * 2;
      this.pickups.add(new ItemPickup(this, boss.x + Math.cos(a) * 22, boss.y + Math.sin(a) * 14, d.itemId, d.amount));
    });
  }
}
