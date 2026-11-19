/**
 * 입력(키보드·마우스·터치) → "명령(command)".
 * 엔티티는 입력 장치를 직접 보지 않고 명령만 받는다 → 나중에 협동 플레이에서 명령을 네트워크로 주고받기 쉽다.
 * Godot: Input Map(move_*, attack, roll, weapon_1/2) + Input.get_vector(), 터치는 TouchScreenButton/가상 조이스틱이 같은 액션을 발생.
 *
 * 조작: WASD 이동 / J 또는 마우스 왼쪽 = 공격 / Space 또는 K = 구르기 / 1·2 = 무기 선택, Q = 다음 무기
 *
 * 공격·구르기·무기 교체는 "눌렀다" 이벤트를 받아 다음 프레임까지 보관한다.
 * (한 프레임 안에 눌렀다 뗀 아주 짧은 입력도 놓치지 않기 위해 — Phaser의 JustDown은 이걸 놓친다)
 */
const ACTION_KEYS = {
  attack: ['J'],
  roll: ['SPACE', 'K'],
};
const WEAPON_KEYS = { ONE: 0, TWO: 1, Q: 'next' };

export class InputSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {() => (import('./TouchControls.js').TouchControls|undefined)} getTouch 터치 조작판 (UI 씬이 만든다)
   */
  constructor(scene, getTouch) {
    const kb = scene.input.keyboard;
    this.getTouch = getTouch;
    this.keys = kb.addKeys('W,A,S,D');
    this.pressed = { attack: false, roll: false, switchWeapon: null };

    for (const [action, keys] of Object.entries(ACTION_KEYS)) {
      for (const key of keys) {
        kb.addCapture(key); // Space로 페이지가 스크롤되지 않게
        kb.on(`keydown-${key}`, (e) => { if (!e.repeat) this.pressed[action] = true; });
      }
    }
    for (const [key, slot] of Object.entries(WEAPON_KEYS)) {
      kb.on(`keydown-${key}`, () => { this.pressed.switchWeapon = slot; });
    }
    // 마우스 클릭만 공격 (터치는 TouchControls가 따로 처리)
    scene.input.on('pointerdown', (p) => { if (!p.wasTouch && p.leftButtonDown()) this.pressed.attack = true; });
  }

  /** @returns {{move:{x:number,y:number}, attack:boolean, roll:boolean, switchWeapon:number|'next'|null}} */
  getCommand() {
    const k = this.keys;
    let x = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    let y = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);

    const touch = this.getTouch();
    const t = touch ? touch.consume() : null;
    if (t && (t.move.x !== 0 || t.move.y !== 0)) {
      x = t.move.x;
      y = t.move.y;
    }

    // 방향 정규화 (대각선도 길이 1)
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }

    const cmd = {
      move: { x, y },
      attack: this.pressed.attack || !!t?.attack,
      roll: this.pressed.roll || !!t?.roll,
      switchWeapon: this.pressed.switchWeapon ?? t?.switchWeapon ?? null,
    };
    this.pressed.attack = false;
    this.pressed.roll = false;
    this.pressed.switchWeapon = null;
    return cmd;
  }
}
