/**
 * 키 입력 → "명령(command)".
 * 엔티티는 키보드를 직접 보지 않고 명령만 받는다 → 나중에 협동 플레이에서 명령을 네트워크로 주고받기 쉽다.
 * Godot: Input Map(move_*, attack, roll) + Input.get_vector() / _unhandled_input()의 is_action_pressed().
 *
 * 조작: WASD 이동 / J 또는 마우스 왼쪽 = 공격 / Space 또는 K = 구르기
 *
 * 공격·구르기는 "눌렀다" 이벤트를 받아 다음 프레임까지 보관한다.
 * (한 프레임 안에 눌렀다 뗀 아주 짧은 입력도 놓치지 않기 위해 — Phaser의 JustDown은 이걸 놓친다)
 */
const ACTION_KEYS = {
  attack: ['J'],
  roll: ['SPACE', 'K'],
};

export class InputSystem {
  constructor(scene) {
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys('W,A,S,D');
    this.pressed = { attack: false, roll: false };

    for (const [action, keys] of Object.entries(ACTION_KEYS)) {
      for (const key of keys) {
        kb.addCapture(key); // Space로 페이지가 스크롤되지 않게
        kb.on(`keydown-${key}`, (e) => { if (!e.repeat) this.pressed[action] = true; });
      }
    }
    scene.input.on('pointerdown', (p) => { if (p.leftButtonDown()) this.pressed.attack = true; });
  }

  /** @returns {{move:{x:number,y:number}, attack:boolean, roll:boolean}} 이번 프레임의 명령 */
  getCommand() {
    const k = this.keys;
    let x = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    let y = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    const cmd = { move: { x, y }, attack: this.pressed.attack, roll: this.pressed.roll };
    this.pressed.attack = false;
    this.pressed.roll = false;
    return cmd;
  }
}
