import { applyYSort } from '../systems/YSort.js';
import { spawnChips, spawnFloatingLabel } from '../systems/Effects.js';

/**
 * 채집 대상: 나무·바위(무기로 때려서) / 약초(상호작용 E로 줍기). 수치·그림은 data/gatherables.json.
 * 다 캐면 그루터기·부스러기로 바뀌고, respawnMs 뒤 다시 자란다. (x, y) = 밑동.
 * Godot: Gatherable.tscn = Sprite2D + StaticBody2D(막는 몸) + Hurtbox(Area2D) + Timer(다시 자람).
 */
export class Gatherable {
  /**
   * @param {string} kind 'tree' | 'rock' | 'herb_patch'
   * @param {(x:number, y:number, drops:Array) => void} dropItems 떨어뜨릴 아이템을 월드에 만든다
   */
  constructor(scene, x, y, kind, def, dropItems) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.def = def;
    this.dropItems = dropItems;
    this.isGatherable = true;
    this.hp = def.hits ?? 1;
    this.depleted = false;
    // 위치로 모양 결정 (같은 자리는 항상 같은 모양)
    const tex = def.textures;
    this.texture = tex[Math.abs(Math.round(x * 7 + y * 13)) % tex.length];
    this.sprite = scene.add.image(x, y, this.texture).setOrigin(0.5, 1);
    applyYSort(this.sprite);

    /** 막는 몸: 나무는 줄기(그루터기도 그대로 막음), 바위는 몸통 */
    if (kind === 'tree') this.blocker = scene.add.zone(x, y - 5, 14, 10);
    else if (def.blocker) this.blocker = scene.add.zone(x, y - def.blocker.height / 2, def.blocker.width, def.blocker.height);

    /** 약초처럼 E로 캐는 것: 상호작용 목록용 */
    this.interactRadius = 26;
    this.label = `${def.name} 캐기`;
  }

  /** 무기로 때릴 수 있는가 (몬스터 목록과 같은 인터페이스) */
  get isHittable() { return !this.depleted && this.def.tool === 'hit'; }
  get canInteract() { return !this.depleted && this.def.tool === 'interact'; }

  getHurtbox() {
    const h = this.def.hurtbox ?? { width: 16, height: 16 };
    return { x: this.x - h.width / 2, y: this.y - h.height, width: h.width, height: h.height };
  }

  /** 무기에 맞음. power = 한 번에 깎이는 양 (무기 gatherPower) */
  gatherHit(power, fromX) {
    if (!this.isHittable) return;
    this.hp -= power;
    spawnChips(this.scene, this.x + (fromX < this.x ? -6 : 6), this.y - 10, this.def.fx, 5);
    // 흔들림 (그림만)
    const s = this.sprite;
    this.scene.tweens.killTweensOf(s);
    s.x = this.x;
    this.scene.tweens.add({ targets: s, x: this.x + (fromX < this.x ? 2 : -2), duration: 45, yoyo: true, repeat: 1, onComplete: () => { s.x = this.x; } });
    if (this.hp <= 0) this.deplete(fromX);
  }

  /** 약초 등: 줍기 모션이 끝나는 순간 호출 */
  gatherInteract() {
    if (!this.canInteract) return;
    this.deplete(this.x);
  }

  deplete(fromX) {
    this.depleted = true;
    this.sprite.setTexture(this.def.depleted);
    if (this.kind === 'tree') {
      spawnChips(this.scene, this.x, this.y - 20, 'wood', 10);
      this.scene.cameras.main.shake(120, 0.003);
    }
    const drops = [...this.def.drops];
    for (const b of this.def.bonusDrops ?? []) if (Math.random() < b.chance) drops.push(b);
    // 떨어지는 자리: 때린 반대쪽 (나무가 넘어간 쪽)
    const side = fromX < this.x ? 1 : -1;
    this.dropItems(this.x + side * 14, this.y + 6, drops);
    const word = { tree: '쿵!', rock: '와르르' }[this.kind];
    if (word) spawnFloatingLabel(this.scene, this.x, this.y - 30, word);
    this.respawnTimer = this.scene.time.delayedCall(this.def.respawnMs, () => this.regrow());
  }

  regrow() {
    this.depleted = false;
    this.hp = this.def.hits ?? 1;
    this.sprite.setTexture(this.texture).setAlpha(0);
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 800 });
  }
}
