/**
 * 풀숲. 길을 막지 않는다. 안에 들어가면 적에게 잘 안 보인다 (웅크리면 거의 안 보임).
 * (x, y) = 밑동. 플레이어보다 살짝 앞에 그려서 몸이 가려지게 한다.
 * Godot: Bush.tscn = Sprite2D + Area2D(숨기 범위).
 */
export class Bush {
  constructor(scene, x, y) {
    this.x = x;
    this.y = y;
    this.sprite = scene.add.image(x, y + 3, 'bush').setOrigin(0.5, 1).setDepth(y + 6);
  }

  /** 안에 누가 숨어 있으면 살짝 흔들리고 반투명하게 */
  setOccupied(on) {
    if (on === this.occupied) return;
    this.occupied = on;
    this.sprite.setAlpha(on ? 0.8 : 1);
  }
}
