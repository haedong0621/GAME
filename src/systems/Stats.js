/**
 * 체력·스태미나 상태. 화면과 분리된 순수 데이터 + 규칙 (저장·협동 시 이 값만 주고받으면 된다).
 * Godot: Stats.gd (RefCounted 또는 Node), signal hp_changed / stamina_changed.
 */
export class Stats {
  /** @param {{maxHp:number, maxStamina?:number, staminaRegenPerSec?:number, staminaRegenDelayMs?:number}} data */
  constructor(data) {
    this.maxHp = data.maxHp;
    this.hp = data.maxHp;
    this.maxStamina = data.maxStamina ?? 0;
    this.stamina = this.maxStamina;
    this.regenPerSec = data.staminaRegenPerSec ?? 0;
    this.regenDelayMs = data.staminaRegenDelayMs ?? 0;
    this.regenCooldown = 0;
  }

  get isDead() {
    return this.hp <= 0;
  }

  /** 스태미나가 충분하면 쓰고 true, 부족하면 false (행동 불가) */
  spendStamina(amount) {
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    this.regenCooldown = this.regenDelayMs;
    return true;
  }

  /** 회복 (최대 체력까지). @returns 실제로 찬 양 */
  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  reset() {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
  }

  /** @param {number} dtMs @param {boolean} canRegen 행동 중에는 회복하지 않음 */
  update(dtMs, canRegen) {
    if (this.regenCooldown > 0) {
      this.regenCooldown -= dtMs;
      return;
    }
    if (canRegen) {
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.regenPerSec * dtMs) / 1000);
    }
  }
}
