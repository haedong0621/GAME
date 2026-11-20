/**
 * 입력(키보드·마우스·터치) → "명령(command)".
 * 엔티티는 입력 장치를 직접 보지 않고 명령만 받는다 → 나중에 협동 플레이에서 명령을 네트워크로 주고받기 쉽다.
 * Godot: Input Map(move_*, attack, roll, weapon_1/2) + Input.get_vector() — Godot은 물리 키(physical_keycode) 기준으로 매핑.
 *
 * 조작: WASD 또는 방향키 이동 / J 또는 마우스 왼쪽 = 공격 / Space 또는 K = 구르기 / 1·2 = 무기 선택, Q = 다음 무기
 *
 * 키는 event.code(키보드의 "물리적 위치")로 읽는다.
 * → 한글 입력 상태(ㅁ, ㅈ …)에서도 똑같이 동작한다. Phaser 기본 키 처리는 한글 조합 중 신호(keyCode 229)를
 *   놓쳐서 키가 씹히거나 눌린 채로 남는 문제가 있었다.
 * 버튼류(공격·구르기·무기)는 "눌렀다" 이벤트를 다음 프레임까지 보관한다 (아주 짧은 탭도 놓치지 않게).
 */
const MOVE_CODES = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};
const BUTTON_CODES = {
  KeyJ: ['attack', true],
  Space: ['roll', true], KeyK: ['roll', true],
  Digit1: ['switchWeapon', 0], Digit2: ['switchWeapon', 1], KeyQ: ['switchWeapon', 'next'],
};
/** 브라우저 기본 동작(스크롤 등)을 막을 키 */
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class InputSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {() => (import('./TouchControls.js').TouchControls|undefined)} getTouch 터치 조작판 (UI 씬이 만든다)
   */
  constructor(scene, getTouch) {
    this.getTouch = getTouch;
    this.held = new Set(); // 지금 누르고 있는 이동 방향
    this.pressed = { attack: false, roll: false, switchWeapon: null };

    const onDown = (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      const dir = MOVE_CODES[e.code];
      if (dir) this.held.add(e.code);
      const btn = BUTTON_CODES[e.code];
      if (btn && !e.repeat) this.pressed[btn[0]] = btn[1];
    };
    const onUp = (e) => {
      this.held.delete(e.code);
    };
    // 창을 벗어나면(알트탭, 다른 탭) 눌린 키를 모두 놓은 것으로 — 키가 눌린 채로 남는 문제 방지
    const releaseAll = () => this.held.clear();

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    scene.events.once('shutdown', () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
    });

    // 마우스 클릭만 공격 (터치는 TouchControls가 따로 처리)
    scene.input.on('pointerdown', (p) => { if (!p.wasTouch && p.leftButtonDown()) this.pressed.attack = true; });
  }

  isHeld(dir) {
    for (const code of this.held) if (MOVE_CODES[code] === dir) return true;
    return false;
  }

  /** @returns {{move:{x:number,y:number}, attack:boolean, roll:boolean, switchWeapon:number|'next'|null}} */
  getCommand() {
    let x = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    let y = (this.isHeld('down') ? 1 : 0) - (this.isHeld('up') ? 1 : 0);

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
