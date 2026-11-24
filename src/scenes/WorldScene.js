import { Player } from '../entities/Player.js';
import { Gatherable } from '../entities/Gatherable.js';
import { ItemPickup } from '../entities/ItemPickup.js';
import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { Workbench } from '../entities/Workbench.js';
import { FrameRecorder } from '../systems/FrameRecorder.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { Mob } from '../entities/Mob.js';
import { Bush } from '../entities/Bush.js';
import { NoiseBus, StealthEnv, Level } from '../systems/Stealth.js';
import { spawnFloatingLabel } from '../systems/Effects.js';
import { Terrain } from '../systems/Terrain.js';
import { GameClock } from '../systems/GameClock.js';
import { Needs } from '../systems/Needs.js';
import { WorldMap } from '../systems/WorldMap.js';
import { InputSystem } from '../systems/InputSystem.js';
import { getProperty } from '../systems/TiledUtil.js';
import { GROUND_DEPTH, applyYSort } from '../systems/YSort.js';
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
    // ---- 게임 시계·생존 게이지 (다시 자라기·재등장 타이머도 이 시계로)
    const rules = this.registry.get('worldRules');
    this.rules = rules;
    this.clock = new GameClock(rules.time);
    this.needs = new Needs(rules.needs);
    this.registry.set('clock', this.clock);
    this.registry.set('needs', this.needs);

    // ---- 맵과 바닥
    const map = this.make.tilemap({ key: 'world' });
    const tileset = map.addTilesetImage('world_tiles', 'world_tiles');
    const ground = map.createLayer('ground', tileset, 0, 0);
    this.groundLayer = ground;
    ground.setDepth(GROUND_DEPTH);
    ground.setCollisionByProperty({ collides: true }); // 물 등 막힌 타일
    ground.setVisible(false); // 그림은 굽기 도구가 만든 바닥 한 장(지역별 바닥 + 흙길·물 + 절벽)이 대신함 — 타일은 충돌용
    // 바닥 그림: terrain_bake.py가 구운 조각 (지역별 바닥 + 흙길·물 + 절벽), 모든 물체보다 뒤
    const terrainData = this.cache.json.get('worldTerrain');
    this.terrain = new Terrain(terrainData);
    for (const c of terrainData?.chunks ?? []) this.add.image(c.x, c.y, c.key).setOrigin(0, 0).setDepth(GROUND_DEPTH + 0.05);

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
    this.gatherables = [];   // 나무·바위·약초 (data/gatherables.json)
    const gatherDefs = this.registry.get('gatherables');
    // 저장 데이터 (없으면 새 게임)
    const slot = this.registry.get('loadSlot');
    const save = slot ? SaveSystem.load(slot) : null;
    this.autosaveZones = [];
    // 맵 아이템은 이제 주운 뒤 시간이 지나면 다시 생긴다 (채집 단계 규칙) → 저장에 "주웠음"을 남기지 않음
    this.collectedPickups = new Set();
    this.playTimeMs = save?.playTimeMs ?? 0;
    this.mobs = [];
    const bushes = [];
    const darkZones = [];
    this.noiseBus = new NoiseBus();
    let spawn = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 };
    const places = []; // 지도에 표시할 장소

    for (const obj of objects) {
      switch (obj.type) {
        case 'spawn':
          spawn = { x: obj.x, y: obj.y };
          break;
        case 'workbench': {
          const wb = new Workbench(this, obj.x, obj.y, obj.name && obj.name !== 'workbench' ? obj.name : '거점');
          blockers.add(wb.blocker);
          this.interactables.push(wb);
          break;
        }
        case 'building': {
          // 건물·큰 소품 (집, 우물, 물레방앗간, 감시탑, 제단): 발밑(blockW×blockH)만 막고 그림은 세워서 Y정렬
          const img = this.add.image(obj.x, obj.y, getProperty(obj, 'sprite')).setOrigin(0.5, 1);
          applyYSort(img);
          const bw = getProperty(obj, 'blockW', 40), bh = getProperty(obj, 'blockH', 14);
          blockers.add(this.add.zone(obj.x, obj.y - bh / 2 - 4, bw, bh));
          break;
        }
        case 'flat':
          // 바닥에 깔리는 큰 그림 (다리, 쓰러진 거대 나무): 위로 걸어 다님 — 지나갈 수 있는지는 바닥·높이가 정함
          this.add.image(obj.x, obj.y, getProperty(obj, 'sprite')).setOrigin(0.5, 1).setDepth(GROUND_DEPTH + 0.2);
          break;
        case 'decor': {
          // 깔기만 하는 소품 (지역별: 마른 풀, 갈대, 버섯, 뼈, 모닥불 자리, 천막, 울타리…). 천막은 막음
          const kind = getProperty(obj, 'kind');
          const img = this.add.image(obj.x, obj.y, this.textures.exists(`decor_${kind}`) ? `decor_${kind}` : kind).setOrigin(0.5, 1);
          applyYSort(img);
          if (kind === 'tent') blockers.add(this.add.zone(obj.x, obj.y - 6, 34, 12));
          break;
        }
        case 'place':
          places.push({ name: obj.name, x: obj.x, y: obj.y, kind: getProperty(obj, 'kind', 'area') });
          break;
        case 'climb':
          break; // 덩굴: 그림은 절벽 굽기에 포함, 오를 수 있는 범위는 terrain 격자 파일에 있음
        case 'autosave':
          // 자동 저장 구역: 들어가면 자동 슬롯에 저장 (지역 경계: 보스 터 앞, 지역 입구 등)
          this.autosaveZones.push({ x: obj.x, y: obj.y, width: obj.width, height: obj.height, name: obj.name || '어딘가', inside: false });
          break;
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
        case 'tree': case 'rock': case 'herb_patch': {
          // 채집 대상: 나무·바위는 무기로, 약초는 E(줍기 모션)로
          const g = new Gatherable(this, obj.x, obj.y, obj.type, gatherDefs[obj.type], (x, y, drops) => this.spawnDrops(x, y, drops), this.terrain.regionAt(obj.x, obj.y));
          if (g.blocker) blockers.add(g.blocker);
          this.gatherables.push(g);
          break;
        }
        case 'item': {
          const itemId = getProperty(obj, 'itemId');
          if (!items.has(itemId)) {
            console.warn(`[World] 맵에 알 수 없는 아이템 id: ${itemId}`);
            break;
          }
          const pk = new ItemPickup(this, obj.x, obj.y, itemId, getProperty(obj, 'amount', 1), obj.id);
          pk.respawnMs = getProperty(obj, 'respawnMs', 180000); // 주운 뒤 다시 생기는 시간 (기본 3분)
          pickups.add(pk);
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
    // 지도 (미니맵·큰 지도, 가 본 곳만 밝혀짐)
    this.worldMap = new WorldMap(this, terrainData, map.width, map.height, map.tileWidth, places);
    this.registry.set('worldMap', this.worldMap);

    // 높낮이: 절벽 벽면·고지대 경계를 막는 사각형 (격자에서 합쳐 만듦)
    for (const w of this.terrain.solidRects()) blockers.add(this.add.zone(w.x + w.width / 2, w.y + w.height / 2, w.width, w.height));

    const playerData = this.registry.get('playerData');
    this.inputSystem = new InputSystem(this, () => this.registry.get('touch'));
    this.registry.set('inputSystem', this.inputSystem); // 입력 진단 화면용
    this.events.on('resume', () => this.inputSystem.clearPressed()); // 창을 닫으며 누른 키가 다시 처리되지 않게
    this.recorder = new FrameRecorder(this); // F8: 직전 10초 기록 저장
    const db = { weapons: this.registry.get('weapons'), gear: this.registry.get('gear'), skills: this.registry.get('skills') };
    this.player = new Player(this, spawn.x, spawn.y, playerData, db, () => this.monsters);
    this.player.getGatherTargets = () => this.gatherables;
    this.player.terrain = this.terrain; // 뛰어내리기·덩굴 오르기 판단용
    this.player.needs = this.needs;     // 생존 게이지 효과 (배율) // 칼로 나무·바위를 칠 수 있음 (조준·락온 대상은 아님)
    this.registry.set('player', this.player); // HUD가 체력·스태미나를 읽음

    this.spawnPoint = spawn; // 저장소를 못 쓰는 환경에서만 쓰는 부활 지점
    if (save) this.applySave(save);
    this.player.onDeath = () => this.onPlayerDeath();
    this.player.onPerfectDodge = (source) => this.onPerfectDodge(source);

    // 슬로모션: 이 씬의 시간 배율. 물리(화면 박자 방식)에 넘기는 시간도 같이 줄인다
    this.timeScale = 1;
    const world = this.physics.world;
    const physicsUpdate = world.update.bind(world);
    world.update = (t, d) => physicsUpdate(t, d * this.timeScale);
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
    // 아이템은 닿기만 해서는 안 주워진다: E(줍기) → 쪼그려 집는 모션 (pickUpNear)

    // ---- 카메라: 부드럽게 따라가고 맵 밖은 안 보이게
    const cam = this.cameras.main;
    cam.setZoom(WORLD_ZOOM);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.12, 0.12);
  }

  // ---------- 저장 ----------
  /**
   * 지금 상태를 저장
   * @param {'manual'|'auto'} slot @param {string} location 저장 화면에 보일 장소 이름
   */
  saveGame(slot = 'manual', location = this.lastBaseName ?? '거점') {
    const snap = SaveSystem.snapshot({
      player: this.player,
      inventory: this.registry.get('inventory'),
      collectedPickups: this.collectedPickups,
      playTimeMs: this.playTimeMs,
      location,
    });
    snap.world.clock = this.clock.toJSON();   // 날짜·시각
    snap.player.needs = this.needs.toJSON();  // 배고픔·목마름·피로
    snap.world.explored = this.worldMap.toJSON(); // 지도에서 가 본 곳
    const ok = SaveSystem.save(slot, snap);
    const label = slot === 'auto' ? `자동 저장 — ${location}` : '저장됨';
    this.banner(ok ? label : '저장 실패 (브라우저 저장소를 쓸 수 없음)', ok ? '#9adf5a' : '#d06050');
    return ok;
  }

  /** 자동 저장 구역: 밖에서 안으로 들어온 순간에만 저장 (머무는 동안 반복 저장 안 함) */
  checkAutosave() {
    const { x, y } = this.player;
    for (const z of this.autosaveZones) {
      const inside = x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height;
      if (inside && !z.inside && !this.player.isDead) this.saveGame('auto', z.name);
      z.inside = inside;
    }
  }

  /** 저장 데이터를 게임에 적용 (위치, 장비, 가방) */
  applySave(save) {
    const p = this.player;
    const sp = save.player ?? {};
    if (Number.isFinite(sp.x) && Number.isFinite(sp.y)) p.body.reset(sp.x, sp.y);
    this.clock.load(save.world?.clock);
    this.worldMap.load(save.world?.explored);
    this.needs.load(sp.needs);
    if (sp.equipment) p.equipment.load(sp.equipment);
    else this.migrateOldGear(sp); // 예전 저장(무기 목록 + 갑옷 한 벌)
    p.refreshEquipment(false);
    p.stats.hp = p.stats.maxHp;
    const inv = this.registry.get('inventory');
    for (const [id, n] of save.inventory ?? []) if (this.registry.get('items').has(id)) inv.add(id, n);
    const when = save.savedAt ? new Date(save.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    if (save.slot === 'manual' && save.location) this.lastBaseName = save.location;
    // 저장한 자리가 자동 저장 구역 안이면, 시작하자마자 또 저장되지 않게 "이미 안에 있음"으로 표시
    for (const z of this.autosaveZones) {
      z.inside = p.x >= z.x && p.x <= z.x + z.width && p.y >= z.y && p.y <= z.y + z.height;
    }
    const notice = SaveSystem.takeNotice();
    const kind = save.slot === 'auto' ? '자동 저장' : '수동 저장';
    this.time.delayedCall(300, () => this.banner(notice ?? `${kind} 불러옴 — ${save.location ?? ''}${when ? ` (${when})` : ''}`, '#c8d8b0'));
  }

  /** 저장을 모두 지우고 처음부터 */
  newGame() {
    SaveSystem.clearAll();
    SaveSystem.reloadInto('new', '처음부터 시작');
  }

  /** 완벽한 회피: 잠깐 슬로모션 + 번쩍 + 카메라 살짝 당김, 공격한 몬스터는 휘청(?!) */
  onPerfectDodge(source) {
    const pd = this.player.data_.perfectDodge;
    source?.stagger?.();
    this.setSlowMotion(pd.slowFactor);
    const cam = this.cameras.main;
    cam.flash(120, 210, 235, 255, false);
    this.tweens.add({ targets: cam, zoom: cam.zoom * 1.06, duration: 90, yoyo: true, ease: 'Quad.out' });
    window.setTimeout(() => this.setSlowMotion(1), pd.slowRealMs); // 실제 시간 기준으로 복귀
  }

  setSlowMotion(factor) {
    this.timeScale = factor;
    this.time.timeScale = factor;
    this.tweens.timeScale = factor;
  }

  update(_time, realDelta) {
    this.playTimeMs += realDelta;
    const delta = realDelta * this.timeScale; // 게임 속 시간 (슬로모션 반영)
    // 게임 시계·생존 게이지·밤 정도
    const before = this.clock.minutes;
    this.clock.update(delta);
    this.needs.tick(this.clock.minutes - before);
    this.env.nightFactor = this.clock.nightFactor;
    this.env.nightVisionMultiplier = this.rules.night.visionMultiplier;
    const cmd = this.inputSystem.getCommand();

    // 상호작용: 가장 가까운 대상이 범위 안이면 안내 표시, 누르면 열기
    const near = this.nearestInteractable();
    this.registry.set('interactPrompt', near && !this.player.isDead ? near.label : null);
    if (cmd.useItem) this.eatBestFood();
    if (cmd.openInventory && this.player.stateName === 'free') { this.openPanel('inventory'); return; }
    if (cmd.openMap && !this.player.isDead) { this.openPanel('map'); return; }
    this.worldMap.update(this.player.x, this.player.y);
    if (cmd.interact && near && this.player.stateName === 'free') {
      if (near.isDrink) {
        // 물가에서 마시기: 쪼그려 떠 마시는 모션 (줍기 모션 재사용)
        this.player.startGather(near, () => { this.needs.drink(); spawnFloatingLabel(this, this.player.x, this.player.y - 34, '꿀꺽꿀꺽 — 목마름 해소'); });
        return;
      }
      if (near.isPickup || near.isGatherable) {
        // 줍기·채집: 쪼그려 집는 모션 중간에 손에 들어옴 (주변 아이템은 한 번에)
        this.player.startGather(near, () => (near.isGatherable ? near.gatherInteract() : this.pickUpNear()));
        return;
      }
      if (near.isSavePoint) { this.lastBaseName = near.locationName; this.saveGame('manual', near.locationName); } // 거점에 들르면 수동 저장
      this.openPanel(near.action);
      return;
    }

    this.player.update(cmd, delta);
    this.checkAutosave();
    this.checkRegion();

    // 몬스터: 플레이어가 이번 프레임에 낸 소리와 환경을 보고 판단
    this.coneGfx.clear();
    const ctx = {
      player: this.player, env: this.env, noises: this.noiseBus.list, mobs: this.mobs,
      stealth: this.player.data_.stealth, showCones: this.player.isSneaking, coneGfx: this.coneGfx,
      summon: (id, x, y) => this.summonMob(id, x, y),
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

  /**
   * 보스가 불러낸 잡몹 (예: 뒤엉킨 사냥꾼의 울부짖기 → 들개). 바로 플레이어를 쫓고, 죽어도 다시 나타나지 않는다.
   * Godot: 보스가 signal summon(id, pos) → 월드가 Mob.tscn 인스턴스를 add_child.
   */
  summonMob(id, x, y) {
    const data = this.registry.get('monsters')?.[id];
    if (!data) return null;
    const mob = new Mob(this, x, y, id, { ...data, respawnMs: 0 }, (m) => this.onMobDefeated(m));
    mob.summoned = true;
    this.mobs.push(mob);
    this.monsters.push(mob);
    mob.alert(false);
    return mob;
  }

  /** 플레이어와 가장 가까운 보스 (테스트 도구용) */
  nearestBoss() {
    let best = null, bd = Infinity;
    for (const b of this.bosses) {
      const d = Math.hypot(b.home.x - this.player.x, b.home.y - this.player.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------- 테스트 모드(?dev=1) 동작 ----------
  /** 누를 때마다 다음 보스 앞으로 (보스가 여럿이면 번갈아) */
  devTeleportToBoss() {
    if (!this.bosses.length) return;
    this.devBossIdx = ((this.devBossIdx ?? -1) + 1) % this.bosses.length;
    const b = this.bosses[this.devBossIdx];
    this.player.body.reset(b.home.x - 110, b.home.y + 10);
    this.banner(b.displayName, '#e8c860');
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
    const b = this.nearestBoss();
    if (b && !b.isDeadState) b.stats.hp = Math.max(1, Math.round(b.stats.maxHp * ratio));
  }

  devReviveBoss() {
    const b = this.nearestBoss();
    if (b && b.isDeadState) b.revive();
  }

  devGiveMaterials() {
    const inv = this.registry.get('inventory');
    inv.add('beast_hide', 4);
    inv.add('beast_fang', 3);
    inv.add('wood', 2);
    inv.add('tangled_pelt', 4);
    inv.add('hunter_silver', 2);
    inv.add('hound_pelt', 6);
    inv.add('beast_hide', 6);
    inv.add('stone', 2);
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

  devNewGame() {
    this.newGame();
  }

  /** 예전 저장 형식 → 부위별 장비 (갑옷 한 벌은 같은 세트 네 부위로) */
  migrateOldGear(sp) {
    const e = this.player.equipment;
    const OLD = { swamp_hide_armor: ['swamp_hood', 'swamp_hide_armor', 'swamp_bracers', 'swamp_greaves'],
                  hunter_coat: ['hunter_hood', 'hunter_coat', 'hunter_gloves', 'hunter_boots'] };
    for (const id of sp.ownedWeapons ?? []) if (e.isWeapon(id)) { e.obtain(id); const i = e.quick.indexOf(null); if (i >= 0 && !e.quick.includes(id)) e.quick[i] = id; }
    for (const a of sp.ownedArmors ?? []) for (const id of OLD[a] ?? []) e.obtain(id);
    if (sp.weapon && e.has(sp.weapon)) e.equip(sp.weapon, 'right');
    for (const id of OLD[sp.armor] ?? []) e.equip(id);
  }

  devResetGear() {
    const p = this.player;
    p.resetGear();
    this.banner('장비 초기화', '#9adf5a');
  }

  /** 플레이어 발밑 근처(22px)의 물 칸 (물 마시기용) */
  waterNear() {
    const layer = this.groundLayer;
    for (const [dx, dy] of [[0, 14], [0, -14], [14, 0], [-14, 0], [0, 22], [0, -22], [22, 0], [-22, 0]]) {
      const t = layer.getTileAtWorldXY(this.player.x + dx, this.player.y + dy);
      if (t && t.properties?.collides) return { x: this.player.x + dx, y: this.player.y + dy };
    }
    return null;
  }

  /** 밤에는 몬스터가 더 아프게 때림 (data/world.json night) */
  monsterDamageMultiplier() {
    return 1 + (this.rules.night.monsterDamageMultiplier - 1) * this.clock.nightFactor;
  }

  /** 거점에서 아침까지 쉬기: 화면이 어두워졌다 밝아지며 시간이 흐름 (배고픔·목마름은 조금 줄고, 피로는 가득, 체력·기력 회복) */
  restUntilMorning(onDone) {
    const cam = this.cameras.main;
    cam.fadeOut(500, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      const mins = this.clock.minutesUntil(this.rules.needs.wakeHour);
      this.needs.tick(mins, true);
      this.clock.advance(mins);
      this.needs.sleep();
      const pl = this.player;
      pl.refreshEquipment(false);
      pl.applyNeeds();
      pl.stats.hp = pl.stats.maxHp; pl.stats.stamina = pl.stats.maxStamina;
      cam.fadeIn(700, 0, 0, 0);
      this.banner(`아침이 밝았다 — ${this.clock.day}일째 (푹 잠)`, '#ffe8a0');
      this.saveGame('manual', this.lastBaseName ?? '거점');
      onDone?.();
    });
  }

  /** 다른 지역에 들어서면 이름을 띄운다 (data/regions.json). 경계에서 왔다 갔다 해도 2.5초에 한 번만 */
  checkRegion() {
    const r = this.terrain.regionAt(this.player.x, this.player.y);
    if (this.currentRegion === undefined) { this.currentRegion = r; return; }
    if (r === this.currentRegion) return;
    this.currentRegion = r;
    const now = this.time.now;
    if (now - (this.regionShownAt ?? -9999) < 2500 && r === this.lastShownRegion) return;
    const info = this.registry.get('regionsData')?.[r];
    if (!info) return;
    this.regionShownAt = now; this.lastShownRegion = r;
    this.banner(info.name, info.color);
  }

  /** 가까운 상호작용 대상: 제작대, 캘 수 있는 약초, 바닥 아이템 중 가장 가까운 것 */
  nearestInteractable() {
    let best = null, bestD = Infinity;
    const R = this.player.data_.gather.pickupRadius;
    const consider = (it, r) => {
      const d = Math.hypot(it.x - this.player.x, it.y - this.player.y);
      if (d <= r && d < bestD) { best = it; bestD = d; }
    };
    for (const it of this.interactables) consider(it, it.interactRadius);
    for (const g of this.gatherables) if (g.canInteract) consider(g, g.interactRadius);
    for (const p of this.pickups.getChildren()) if (p.active && p.body?.enable) consider(p, R);
    // 아무것도 없고 물가 바로 옆이면: 물 마시기 (목마를 때만 안내)
    if (!best && this.needs.thirst < 95) {
      const spot = this.waterNear();
      if (spot) best = { ...spot, isDrink: true, label: '물 마시기' };
    }
    if (best?.isPickup) {
      const n = this.pickupsNear().length;
      const nm = this.player.equipment.def(best.itemId)?.name ?? this.registry.get('items').get(best.itemId)?.name ?? best.itemId;
      best.label = `줍기: ${nm} ×${best.amount}${n > 1 ? ` 외 ${n - 1}개` : ''}`;
    }
    return best;
  }

  pickupsNear() {
    const R = this.player.data_.gather.pickupRadius + 6;
    return this.pickups.getChildren().filter((p) => p.active && p.body?.enable && Math.hypot(p.x - this.player.x, p.y - this.player.y) <= R);
  }

  /** 줍기 모션이 손에 닿는 순간: 주변 아이템을 한 번에 가방으로. 맵에 놓인 것은 시간이 지나면 다시 생김 */
  pickUpNear() {
    const inv = this.registry.get('inventory');
    const items = this.registry.get('items');
    let i = 0;
    const eq = this.player.equipment;
    for (const p of this.pickupsNear()) {
      const gear = eq.def(p.itemId);
      if (gear) { this.player.obtain(p.itemId, false); this.banner(`${gear.name} 획득! (I: 장착)`, '#ffd070'); }
      else inv.add(p.itemId, p.amount);
      spawnFloatingLabel(this, this.player.x, this.player.y - 34 - i * 9, `+${gear?.name ?? items.get(p.itemId)?.name ?? p.itemId}${gear ? '' : ` ${p.amount}`}`);
      i++;
      if (p.mapId !== null) {
        const { x, homeY, itemId, amount, mapId, respawnMs } = p;
        this.clock.after(respawnMs ?? 180000, () => {
          const n = new ItemPickup(this, x, homeY, itemId, amount, mapId);
          n.respawnMs = respawnMs;
          this.pickups.add(n);
        });
      }
      p.collect();
    }
  }

  /**
   * 드랍 굴리기: chance(확률, 없으면 1)로 떨굴지 정하고, amount가 [최소, 최대]면 그 사이 개수.
   * 장비(장신구 완제품 등)는 이미 가지고 있으면 안 떨굼.
   */
  rollDrops(drops) {
    const out = [];
    for (const d of drops ?? []) {
      if (Math.random() >= (d.chance ?? 1)) continue;
      const n = Array.isArray(d.amount) ? d.amount[0] + Math.floor(Math.random() * (d.amount[1] - d.amount[0] + 1)) : (d.amount ?? 1);
      if (this.player.equipment.def(d.itemId) && this.player.equipment.has(d.itemId)) continue;
      if (n > 0) out.push({ itemId: d.itemId, amount: n });
    }
    return out;
  }

  /** 떨어지는 것들 (채집·몬스터): 굴린 결과를 조금씩 흩어 놓는다 (재료·음식·장비) */
  spawnDrops(x, y, drops, spread = 9) {
    const items = this.registry.get('items');
    const list = this.rollDrops(drops).filter((d) => items.has(d.itemId) || this.player.equipment.def(d.itemId));
    list.forEach((d, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + Math.random() * 0.6;
      const r = list.length > 1 ? spread : 0;
      this.pickups.add(new ItemPickup(this, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, d.itemId, d.amount));
    });
  }

  /** R: 회복 음식 먹기 (체력이 가득이면 안 먹음). 회복량이 작은 것부터 → 아까운 것은 아껴 둠 */
  eatBestFood() {
    const pl = this.player;
    if (pl.isDead) return;
    const s = pl.stats;
    if (s.hp >= s.maxHp && this.needs.hunger >= 95) { spawnFloatingLabel(this, pl.x, pl.y - 34, '배부름'); return; }
    const items = this.registry.get('items');
    const inv = this.registry.get('inventory');
    const foods = items.ids().map((id) => ({ id, ...items.get(id) })).filter((it) => it.heal && inv.count(it.id) > 0).sort((a, b) => a.heal - b.heal);
    if (!foods.length) { spawnFloatingLabel(this, pl.x, pl.y - 34, '먹을 게 없다'); return; }
    this.eatFood(foods[0].id);
  }

  /** 음식 하나 먹기 (가방 창에서도 씀) */
  eatFood(id) {
    const pl = this.player, inv = this.registry.get('inventory'), f = this.registry.get('items').get(id);
    if (!f?.heal || inv.count(id) <= 0) return false;
    inv.remove(id, 1);
    const healed = pl.stats.heal(f.heal);
    if (f.food) this.needs.eat(f.food);
    spawnFloatingLabel(this, pl.x, pl.y - 34, `${f.name} +${healed}`);
    return true;
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
    this.spawnDrops(mob.x, mob.y + 2, mob.data_.drops);
  }

  onPlayerDeath() {
    this.banner('쓰러졌다…', '#d06050');
    // 마지막 저장 시점으로 되돌아간다 (저장이 없으면 처음부터). 페이지를 새로 불러와 깨끗하게 시작.
    if (SaveSystem.available()) {
      this.time.delayedCall(this.player.data_.respawnDelayMs, () => {
        // 수동·자동 중 더 최근 저장을 불러온다
        const latest = SaveSystem.latest();
        if (latest) SaveSystem.reloadInto(latest.slot, `${latest.slot === 'auto' ? '자동' : '수동'} 저장 시점으로 돌아왔다 — ${latest.location ?? ''}`);
        else SaveSystem.reloadInto('new', '저장이 없어 처음부터 다시 시작');
      });
      return;
    }
    // 저장소를 못 쓰는 환경(비공개 창 등): 예전처럼 시작 지점에서 부활
    this.time.delayedCall(this.player.data_.respawnDelayMs, () => {
      this.player.respawn(this.spawnPoint.x, this.spawnPoint.y);
      for (const b of this.bosses) b.resetToHome();
      for (const m of this.mobs) m.calmDown();
    });
  }

  onBossDefeated(boss) {
    this.banner(`${boss.displayName} 토벌!`, '#e8c860');
    // 보상: 쓰러진 자리 주변에 재료를 떨군다 (data/monsters.json 의 drops)
    this.spawnDrops(boss.x, boss.y, boss.data_.drops, 22);
  }
}
