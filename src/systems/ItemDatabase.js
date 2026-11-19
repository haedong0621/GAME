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

  get(id) {
    const item = this.items[id];
    if (!item) throw new Error(`알 수 없는 아이템 id: ${id}`);
    return item;
  }
}
