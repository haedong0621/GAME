/**
 * 인벤토리: 아이템 id → 개수. 바뀌면 등록된 리스너를 부른다.
 * Godot: Autoload Inventory.gd + signal changed.
 */
export class Inventory {
  constructor() {
    this.counts = new Map();
    this.listeners = [];
  }

  add(itemId, amount = 1) {
    this.counts.set(itemId, (this.counts.get(itemId) ?? 0) + amount);
    this.listeners.forEach((fn) => fn());
  }

  /** @returns {[string, number][]} */
  entries() {
    return [...this.counts.entries()];
  }

  onChange(fn) {
    this.listeners.push(fn);
  }
}
