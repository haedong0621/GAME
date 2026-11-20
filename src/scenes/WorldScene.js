import { Player } from '../entities/Player.js';
import { Tree } from '../entities/Tree.js';
import { ItemPickup } from '../entities/ItemPickup.js';
import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { Workbench } from '../entities/Workbench.js';
import { FrameRecorder } from '../systems/FrameRecorder.js';
import { Mob } from '../entities/Mob.js';
import { Bush } from '../entities/Bush.js';
import { NoiseBus, StealthEnv, Level } from '../systems/Stealth.js';
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
    this.mobs = [];
    const bushes = [];
    const darkZones = [];
    this.noiseBus = new NoiseBus();
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
        case 'bush':
          bushes.push(new Bush(this, obj.x, obj.y));
          break;
        case 'dark': {
          // 어두운 구역: 위에 어둠을 덮고, 적의 시야가 짧아진다
          const z = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
          darkZones.push(z);
          this.add.rectangle(z.x, z.y, z.width, z.height, 0x05080a, 0.38).setOrigin(0, 0).setDepth(90000);
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
          if (data.ai === 'mob') {
            const mob = new Mob(this, obj.x, obj.y, monsterId, data, (m) => this.onMobDefeated(m));
            this.mobs.push(mob);
            this.monsters.push(mob);
          } else if (data.ai === 'boss') {
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

    this.bushes = bushes;
    this.env = new StealthEnv(bushes.map((b) => ({ x: b.x, y: b.y })), darkZones);
    this.coneGfx = this.add.graphics().setDepth(-0.4); // 웅크릴 때 보이는 적 시야 (바닥 위)

    // ---- 플레이어
    const playerData = this.registry.get('playerData');
    this.inputSystem = new InputSystem(this, () => this.registry.get('touch'));
    this.registry.set('inputSystem', this.inputSystem); // 입력 진단 화면용
    this.recorder = new FrameRecorder(this); // F8: 직전 10초 기록 저장
    const db = { weapons: this.registry.get('weapons'), armors: this.registry.get('armors'), skills: this.registry.get('skills') };
    this.player = new Player(this, spawn.x, spawn.y, playerData, db, () => this.monsters);
    this.registry.set('player', this.player); // HUD가 체력·스태미나를 읽음

    this.spawnPoint = spawn;
    this.player.onDeath = () => this.onPlayerDeath();
    this.player.noiseBus = this.noiseBus;

    this.physics.add.collider(this.player, blockers);
    this.physics.add.collider(this.player, ground);
    for (const b of this.bosses) {
      this.physics.add.collider(this.player, b);
      this.physics.add.collider(b, blockers);
      this.physics.add.collider(b, ground);
      this.physics.add.collider(b, this.mobs); // 보스는 밀리지 않고 잡몹을 밀어냄
    }
    // 잡몹: 플레이어와 같은 판정 (막히고, 서로 밀어냄)
    this.physics.add.collider(this.mobs, blockers);
    this.physics.add.collider(this.mobs, ground);
    this.physics.add.collider(this.mobs, this.mobs);
    this.physics.add.collider(this.player, this.mobs);
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

    // 몬스터: 플레이어가 이번 프레임에 낸 소리와 환경을 보고 판단
    this.coneGfx.clear();
    const ctx = {
      player: this.player, env: this.env, noises: this.noiseBus.list, mobs: this.mobs,
      stealth: this.player.data_.stealth, showCones: this.player.isSneaking, coneGfx: this.coneGfx,
    };
    for (const m of this.monsters) m.update?.(delta, ctx); // 보스·잡몹 AI, 상태 이상(독) 등
    this.noiseBus.clear();

    // 풀숲 표시와 HUD용 은신 상태
    const inBush = this.env.isInBush(this.player.x, this.player.y);
    for (const b of this.bushes) b.setOccupied(inBush && Math.abs(b.x - this.player.x) < 15 && Math.abs(b.y - this.player.y) < 14);
    this.registry.set('stealth', { level: this.nearestThreat(), sneaking: this.player.isSneaking, inBush });
    this.recorder.record(delta, cmd, this.player, this.inputSystem);
    // HUD에 보여 줄 보스: 플레이어를 발견한 보스
    this.registry.set('activeBoss', this.bosses.find((b) => b.isAlert) ?? null);
  }

  // ---------- 테스트 모드(?dev=1) 동작 ----------
  devTeleportToBoss() {
    const b = this.bosses[0];
    if (b) this.player.body.reset(b.x - 110, b.y + 10);
  }

  devTeleportToHounds() {
    const m = this.mobs.find((x) => x.isHittable);
    if (m) this.player.body.reset(m.home.x - 170, m.home.y + 10);
  }

  devCalmAll() {
    for (const m of this.mobs) m.calmDown();
    for (const b of this.bosses) b.resetToHome();
    this.banner('적 경계 해제', '#9adf5a');
  }

  devBossHp(ratio) {
    const b = this.bosses[0];
    if (b && !b.isDeadState) b.stats.hp = Math.max(1, Math.round(b.stats.maxHp * ratio));
  }

  devReviveBoss() {
    const b = this.bosses[0];
    if (b && b.isDeadState) b.revive();
  }

  devGiveMaterials() {
    const inv = this.registry.get('inventory');
    inv.add('beast_hide', 4);
    inv.add('beast_fang', 3);
    inv.add('wood', 2);
    this.banner('재료 받음', '#9adf5a');
  }

  devToggleGod() {
    this.player.godMode = !this.player.godMode;
    this.banner(this.player.godMode ? '무적 켜짐' : '무적 꺼짐', '#9adf5a');
  }

  devHeal() {
    this.player.stats.hp = this.player.stats.maxHp;
    this.player.stats.stamina = this.player.stats.maxStamina;
  }

  devResetGear() {
    const p = this.player;
    p.ownedWeapons = [...p.data_.weaponSlots];
    p.ownedArmors = [p.data_.startArmor];
    p.equip(0, false);
    p.equipArmor(p.data_.startArmor, false);
    this.banner('장비 초기화', '#9adf5a');
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

  /** HUD용: 근처(360px) 적 중 가장 높은 경계 단계 */
  nearestThreat() {
    let level = Level.UNAWARE;
    for (const m of this.monsters) {
      if (!m.meter || !m.isHittable) continue;
      if (Math.hypot(m.x - this.player.x, m.y - this.player.y) > 360) continue;
      const l = m.meter.level;
      if (l === Level.ALERT) return Level.ALERT;
      if (l === Level.SUSPICIOUS) level = Level.SUSPICIOUS;
    }
    return level;
  }

  onMobDefeated(mob) {
    const items = this.registry.get('items');
    for (const d of mob.data_.drops ?? []) {
      if (items.has(d.itemId)) this.pickups.add(new ItemPickup(this, mob.x, mob.y + 2, d.itemId, d.amount));
    }
  }

  onPlayerDeath() {
    this.banner('쓰러졌다…', '#d06050');
    this.time.delayedCall(this.player.data_.respawnDelayMs, () => {
      this.player.respawn(this.spawnPoint.x, this.spawnPoint.y);
      for (const b of this.bosses) b.resetToHome();
      for (const m of this.mobs) m.calmDown();
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
