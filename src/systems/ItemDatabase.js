/**
 * data/items.json 을 id로 조회하는 읽기 전용 저장소.
 * Godot: Autoload ItemDB.gd (Dictionary id → 정보).
 */
export class ItemDatabase {
  /** @param {Record<string, object>} json */
  constructor(json) {
    this.items = json ?? {};
  }

  get count() {
    return Object.keys(this.items).length;
  }

  ids() {
    return Object.keys(this.items);
  }

  has(id) {
    return Object.hasOwn(this.items, id);
  }

  /** 아이템이면 그 정보, 아니면 null (장비 id가 섞인 목록에서 씀 — get은 모르는 id면 오류) */
  find(id) {
    return this.has(id) ? this.items[id] : null;
  }

  get(id) {
    const item = this.items[id];
    if (!item) throw new Error(`알 수 없는 아이템 id: ${id}`);
    return item;
  }
}
