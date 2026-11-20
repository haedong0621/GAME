import { applyYSort } from '../systems/YSort.js';

/**
 * 제작대. 가까이 가서 상호작용(E / 휴대폰 "열기")하면 제작 화면이 열린다.
 * (x, y) = 발밑. 몸체는 길을 막는다.
 * Godot: Workbench.tscn = Sprite2D + StaticBody2D + Area2D(상호작용 범위) → body_entered로 안내 표시.
 */
export class Workbench {
  constructor(scene, x, y) {
    this.x = x;
    this.y = y;
    this.label = '제작대 (저장 · 제작)';
    this.action = 'crafting';
    /** 거점: 들르면 저장된다. 마을 등 다른 거점도 이 표시만 있으면 같은 규칙 */
    this.isSavePoint = true;
    this.interactRadius = 44;
    this.sprite = scene.add.image(x, y, 'workbench').setOrigin(0.5, 1);
    applyYSort(this.sprite);
    this.blocker = scene.add.zone(x, y - 6, 34, 12);
  }
}
