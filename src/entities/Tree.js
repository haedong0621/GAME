import { applyYSort } from '../systems/YSort.js';

/**
 * 나무. (x, y) = 줄기 밑동. 그림은 통과(가림)되고 줄기만 막힌다.
 * Godot: Tree.tscn = Sprite2D + StaticBody2D(CollisionShape2D 14×10, 밑동).
 */
export class Tree {
  constructor(scene, x, y) {
    const variant = Math.abs(Math.round(x * 7 + y * 13)) % 3; // 위치로 정해지는 나무 모양 (항상 같은 나무는 같은 모양)
    this.sprite = scene.add.image(x, y, `tree${variant}`).setOrigin(0.5, 1);
    applyYSort(this.sprite); // 움직이지 않으니 한 번만

    /** 줄기 충돌 영역 (static group에 넣으면 고정 물리 몸체가 된다) */
    this.trunk = scene.add.zone(x, y - 5, 14, 10);
  }
}
