/**
 * 장비 (화면과 분리된 순수 로직): 8칸 + 가진 장비 목록 + 무기 단축칸(1·2·3).
 *   칸: right(오른손) left(왼손) head(머리) body(몸) arms(팔) legs(다리) ring(반지) necklace(목걸이)
 *   손 규칙: 한손 무기(hands:"one")는 왼손·오른손 아무 데나. 양손 무기(hands:"two")는 오른손에 들고 왼손을 차지.
 *            주무기 = 오른손 무기 (비었으면 왼손 한손 무기), 둘 다 없으면 맨손(unarmed).
 *   세트: 같은 set 부위를 N개 이상 입으면 gear.json _sets의 보너스 스킬.
 * Godot: Equipment.gd (Resource/Node) — 같은 칸 이름·규칙, 저장은 to_dict/from_dict.
 */
export const SLOTS = ['right', 'left', 'head', 'body', 'arms', 'legs', 'ring', 'necklace'];
export const SLOT_NAMES = { right: '오른손', left: '왼손', head: '머리', body: '몸', arms: '팔', legs: '다리', ring: '반지', necklace: '목걸이' };

export class Equipment {
  /** @param {{weapons:object, gear:object}} db */
  constructor(db) {
    this.weapons = db.weapons;
    this.gear = db.gear;
    /** 가진 장비 (무기·방어구·장신구 id) */
    this.owned = [];
    /** 칸 → 장비 id (없으면 null) */
    this.slots = Object.fromEntries(SLOTS.map((s) => [s, null]));
    /** 무기 단축칸 (1·2·3번 키) */
    this.quick = [null, null, null];
  }

  isWeapon(id) { return !!this.weapons[id] && id !== 'unarmed'; }
  def(id) { return this.weapons[id] ?? this.gear[id] ?? null; }

  /** 이 장비가 들어갈 수 있는 칸들 */
  slotsFor(id) {
    if (this.isWeapon(id)) return this.weapons[id].hands === 'two' ? ['right'] : ['right', 'left'];
    const g = this.gear[id];
    return g?.slot ? [g.slot] : [];
  }

  obtain(id) { if (!this.owned.includes(id)) this.owned.push(id); }
  has(id) { return this.owned.includes(id); }

  /** 양손 무기를 들고 있는가 (왼손이 막힘) */
  get twoHanded() { const r = this.slots.right; return !!r && this.weapons[r]?.hands === 'two'; }

  /** 장착. slot을 안 주면 들어갈 수 있는 첫 칸 (한손 무기는 오른손 우선, 오른손이 차 있고 왼손이 비면 왼손) */
  equip(id, slot = null) {
    if (!this.has(id)) return false;
    const can = this.slotsFor(id);
    if (!can.length) return false;
    if (!slot) {
      slot = can[0];
      if (can.includes('left') && this.slots.right && !this.twoHanded && this.slots.right !== id && !this.slots.left) slot = 'left';
    }
    if (!can.includes(slot)) return false;
    // 같은 장비가 다른 칸에 있으면 뺌 (한 개만 있으니까)
    for (const s of SLOTS) if (this.slots[s] === id) this.slots[s] = null;
    if (slot === 'left' && this.twoHanded) this.slots.right = null;       // 왼손에 들면 양손 무기를 내려놓음
    if (this.isWeapon(id) && this.weapons[id].hands === 'two') this.slots.left = null; // 양손 무기는 왼손을 비움
    this.slots[slot] = id;
    return true;
  }

  unequip(slot) {
    if (slot === 'left' && this.twoHanded) slot = 'right'; // 양손 무기의 그림자 칸을 빼면 무기 자체를 뺌
    this.slots[slot] = null;
  }

  /** 공격에 쓰는 무기 id */
  mainWeapon() {
    if (this.slots.right) return this.slots.right;
    if (this.slots.left && this.isWeapon(this.slots.left)) return this.slots.left;
    return 'unarmed';
  }

  /** 왼손 칸에 보여 줄 것: 장비 id / 양손 무기면 {ghost: id} (활·석궁이면 화살통 {quiver:true}) */
  leftView() {
    if (this.twoHanded) {
      const w = this.weapons[this.slots.right];
      return w.type === 'bow' || w.type === 'crossbow' ? { quiver: true } : { ghost: this.slots.right };
    }
    return this.slots.left;
  }

  /** 겉모습 부위 → 갑옷 그림 이름 (빈 칸은 기본 누더기) */
  look() {
    const o = {};
    for (const part of ['head', 'body', 'arms', 'legs']) o[part] = this.gear[this.slots[part]]?.outfit ?? 'rags';
    return o;
  }

  /** 입은 방어구·장신구 목록 */
  wornGear() { return ['head', 'body', 'arms', 'legs', 'ring', 'necklace'].map((s) => this.slots[s]).filter(Boolean); }

  /** 세트별 입은 부위 수와 켜진 보너스 */
  setStatus() {
    const counts = {};
    for (const id of this.wornGear()) { const s = this.gear[id]?.set; if (s) counts[s] = (counts[s] ?? 0) + 1; }
    const sets = this.gear._sets ?? {};
    return Object.entries(counts).map(([set, n]) => ({
      set, name: sets[set]?.name ?? set, pieces: n,
      active: (sets[set]?.bonuses ?? []).filter((b) => n >= b.pieces),
      next: (sets[set]?.bonuses ?? []).find((b) => n < b.pieces) ?? null,
    }));
  }

  /** 지금 켜진 스킬 id (주무기 + 방어구·장신구 + 세트 보너스) */
  skillIds() {
    const ids = [...(this.weapons[this.mainWeapon()]?.skills ?? [])];
    for (const id of this.wornGear()) ids.push(...(this.gear[id]?.skills ?? []));
    for (const s of this.setStatus()) for (const b of s.active) ids.push(...b.skills);
    return [...new Set(ids)];
  }

  maxHpBonus() { return this.wornGear().reduce((a, id) => a + (this.gear[id]?.maxHpBonus ?? 0), 0); }

  // ---------- 저장 ----------
  toJSON() { return { owned: [...this.owned], slots: { ...this.slots }, quick: [...this.quick] }; }

  load(d) {
    if (!d) return;
    this.owned = (d.owned ?? []).filter((id) => this.def(id));
    for (const s of SLOTS) this.slots[s] = null;
    for (const s of SLOTS) { const id = d.slots?.[s]; if (id && this.has(id)) this.equip(id, s); }
    this.quick = (d.quick ?? []).slice(0, 3).map((id) => (id && this.has(id) ? id : null));
    while (this.quick.length < 3) this.quick.push(null);
  }
}
