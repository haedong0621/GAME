/**
 * 제작 규칙 (화면과 분리된 순수 로직). data/recipes.json 을 읽고, 재료 확인·소모·결과 지급.
 * Godot: Crafting.gd (Autoload) — recipes는 Resource 배열.
 */
export class Crafting {
  /**
   * @param {{recipes: Array}} recipesJson data/recipes.json
   * @param {object} weapons data/weapons.json
   * @param {object} gear data/gear.json (방어구·장신구)
   */
  constructor(recipesJson, weapons, gear) {
    this.recipes = recipesJson.recipes;
    this.weapons = weapons;
    this.gear = gear;
  }

  /** 결과물 정보 (이름, 설명, 스킬 id 목록) */
  resultInfo(recipe) {
    const src = recipe.result.kind === 'weapon' ? this.weapons : this.gear;
    return src[recipe.result.id];
  }

  /** 이미 가지고 있는가 */
  isOwned(recipe, player) {
    return player.equipment.has(recipe.result.id);
  }

  canCraft(recipe, inventory, player) {
    if (this.isOwned(recipe, player)) return false;
    return recipe.materials.every((m) => inventory.count(m.itemId) >= m.amount);
  }

  /** 재료를 쓰고 장비를 지급·장착. 성공하면 true */
  craft(recipe, inventory, player) {
    if (!this.canCraft(recipe, inventory, player)) return false;
    for (const m of recipe.materials) inventory.remove(m.itemId, m.amount);
    player.obtain(recipe.result.id, true);
    return true;
  }
}
