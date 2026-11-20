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

  count(itemId) {
    return this.counts.get(itemId) ?? 0;
  }

  /** 개수가 충분하면 빼고 true, 아니면 아무것도 안 하고 false */
  remove(itemId, amount = 1) {
    const have = this.count(itemId);
    if (have < amount) return false;
    if (have === amount) this.counts.delete(itemId);
    else this.counts.set(itemId, have - amount);
    this.listeners.forEach((fn) => fn());
    return true;
  }

  /** @returns {[string, number][]} */
  entries() {
    return [...this.counts.entries()];
  }

  onChange(fn) {
    this.listeners.push(fn);
  }
}
