import { Player } from '../entities/Player.js';
import { Tree } from '../entities/Tree.js';
import { ItemPickup } from '../entities/ItemPickup.js';
import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { Workbench } from '../entities/Workbench.js';
import { FrameRecorder } from '../systems/FrameRecorder.js';
import { SaveSystem } from '../systems/SaveSystem.js';
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
    const tileset = map.addTilesetImage('world_tiles', 'world_tiles');
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
    // 저장 데이터 (없으면 새 게임)
    const slot = this.registry.get('loadSlot');
    const save = slot ? SaveSystem.load(slot) : null;
    this.autosaveZones = [];
    this.collectedPickups = new Set(save?.world?.collectedPickups ?? []);
    this.playTimeMs = save?.playTimeMs ?? 0;
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
          const wb = new Workbench(this, obj.x, obj.y, obj.name && obj.name !== 'workbench' ? obj.name : '거점');
          blockers.add(wb.blocker);
          this.interactables.push(wb);
          break;
        }
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
        case 'tree':
          blockers.add(new Tree(this, obj.x, obj.y).trunk);
          break;
        case 'item': {
          const itemId = getProperty(obj, 'itemId');
          if (!items.has(itemId)) {
            console.warn(`[World] 맵에 알 수 없는 아이템 id: ${itemId}`);
            break;
          }
          if (this.collectedPickups.has(obj.id)) break; // 이미 주운 것 (저장 기록)
          pickups.add(new ItemPickup(this, obj.x, obj.y, itemId, getProperty(obj, 'amount', 1), obj.id));
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
    this.physics.add.overlap(this.player, pickups, (_player, pickup) => {
      this.registry.get('inventory').add(pickup.itemId, pickup.amount);
      if (pickup.mapId !== null) this.collectedPickups.add(pickup.mapId);
      pickup.collect();
    });

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
    const ok = SaveSystem.save(slot, SaveSystem.snapshot({
      player: this.player,
      inventory: this.registry.get('inventory'),
      collectedPickups: this.collectedPickups,
      playTimeMs: this.playTimeMs,
      location,
    }));
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
    const weapons = this.registry.get('weapons'), armors = this.registry.get('armors');
    const ownedW = (sp.ownedWeapons ?? []).filter((id) => weapons[id]?.combo);
    if (ownedW.length) p.ownedWeapons = ownedW;
    const ownedA = (sp.ownedArmors ?? []).filter((id) => armors[id]);
    if (ownedA.length) p.ownedArmors = ownedA;
    const wi = p.ownedWeapons.indexOf(sp.weapon);
    p.equip(wi >= 0 ? wi : 0, false);
    p.equipArmor(armors[sp.armor] ? sp.armor : p.ownedArmors[0], false);
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
    const cmd = this.inputSystem.getCommand();

    // 상호작용: 가장 가까운 대상이 범위 안이면 안내 표시, 누르면 열기
    const near = this.nearestInteractable();
    this.registry.set('interactPrompt', near && !this.player.isDead ? near.label : null);
    if (cmd.interact && near && this.player.stateName === 'free') {
      if (near.isSavePoint) { this.lastBaseName = near.locationName; this.saveGame('manual', near.locationName); } // 거점에 들르면 수동 저장
      this.openPanel(near.action);
      return;
    }

    this.player.update(cmd, delta);
    this.checkAutosave();

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
    inv.add('hound_pelt', 3);
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
    const items = this.registry.get('items');
    (boss.data_.drops ?? []).forEach((d, i, all) => {
      if (!items.has(d.itemId)) return;
      const a = (i / all.length) * Math.PI * 2;
      this.pickups.add(new ItemPickup(this, boss.x + Math.cos(a) * 22, boss.y + Math.sin(a) * 14, d.itemId, d.amount));
    });
  }
}
