/**
 * 키 입력 → 이동 방향 벡터.
 * Godot: Input Map(move_up/down/left/right) + Input.get_vector().
 */
export class InputSystem {
  constructor(scene) {
    this.keys = scene.input.keyboard.addKeys('W,A,S,D');
  }

  /** 정규화된 방향 (대각선도 길이 1) */
  getMoveVector() {
    const k = this.keys;
    let x = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    let y = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }
}
