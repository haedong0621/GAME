/**
 * 입력(키보드·마우스·터치) → "명령(command)".
 * 엔티티는 입력 장치를 직접 보지 않고 명령만 받는다 → 나중에 협동 플레이에서 명령을 네트워크로 주고받기 쉽다.
 * Godot: Input Map(move_*, attack, roll, weapon_1/2) + Input.get_vector() — Godot은 물리 키(physical_keycode) 기준으로 매핑.
 *
 * 조작: WASD·TFGH(보조)·방향키 이동 / 마우스 커서 = 조준 / J 또는 마우스 왼쪽 = 공격 / Space 또는 K = 구르기
 *       Shift(누르는 동안) = 전력질주 / C = 웅크리기 켜기·끄기 / Tab·L·마우스 오른쪽 = 대상 고정(락온) / E = 상호작용(제작대 등) / 1·2·3 = 무기 선택, Q = 다음 무기
 * 조준: 마우스가 게임 화면 위에 있으면 커서 쪽, 아니면(키보드만·터치) 공격 때 가까운 적 자동 조준
 *
 * 키는 event.code(키보드의 "물리적 위치")로 읽는다.
 * → 한글 입력 상태(ㅁ, ㅈ …)에서도 똑같이 동작한다. Phaser 기본 키 처리는 한글 조합 중 신호(keyCode 229)를
 *   놓쳐서 키가 씹히거나 눌린 채로 남는 문제가 있었다.
 * 버튼류(공격·구르기·무기)는 "눌렀다" 이벤트를 다음 프레임까지 보관한다 (아주 짧은 탭도 놓치지 않게).
 */
const MOVE_CODES = {
  KeyW: 'up', ArrowUp: 'up', KeyT: 'up',
  KeyS: 'down', ArrowDown: 'down', KeyG: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyF: 'left',
  KeyD: 'right', ArrowRight: 'right', KeyH: 'right',
};
const BUTTON_CODES = {
  KeyJ: ['attack', true],
  Space: ['roll', true], KeyK: ['roll', true],
  Tab: ['lockToggle', true], KeyL: ['lockToggle', true],
  KeyE: ['interact', true],
  KeyR: ['useItem', true],
  KeyC: ['sneakToggle', true],
  KeyI: ['openInventory', true],
  Digit1: ['switchWeapon', 0], Digit2: ['switchWeapon', 1], Digit3: ['switchWeapon', 2], KeyQ: ['switchWeapon', 'next'],
};
/** 브라우저 기본 동작(스크롤 등)을 막을 키 */
const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class InputSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {() => (import('./TouchControls.js').TouchControls|undefined)} getTouch 터치 조작판 (UI 씬이 만든다)
   */
  constructor(scene, getTouch) {
    this.getTouch = getTouch;
    this.held = new Set(); // 지금 누르고 있는 이동 방향
    this.pressed = { attack: false, roll: false, switchWeapon: null, lockToggle: false, interact: false, useItem: false, sneakToggle: false, openInventory: false };
    this.sneakOn = false;
    this.scene = scene;
    this.mouseActive = false; // 마우스가 화면 위에서 움직였으면 조준 모드

    /** 진단용: 브라우저가 실제로 받은 키 이벤트 최근 기록 */
    this.log = [];
    const record = (type, e) => {
      this.log.push({ type, code: e.code, key: e.key, at: performance.now(), composing: e.isComposing || e.keyCode === 229 });
      if (this.log.length > 10) this.log.shift();
    };
    this.rawHeld = new Set(); // 진단 화면용: 지금 눌려 있는 모든 키

    const onDown = (e) => {
      if (!e.repeat) record('down', e);
      this.rawHeld.add(e.code);
      if (PREVENT.has(e.code)) e.preventDefault();
      const dir = MOVE_CODES[e.code];
      if (dir) this.held.add(e.code);
      const btn = BUTTON_CODES[e.code];
      if (btn && !e.repeat) this.pressed[btn[0]] = btn[1];
    };
    const onUp = (e) => {
      record('up', e);
      this.rawHeld.delete(e.code);
      this.held.delete(e.code);
    };
    // 창을 벗어나면(알트탭, 다른 탭) 눌린 키를 모두 놓은 것으로 — 키가 눌린 채로 남는 문제 방지
    const releaseAll = () => { if (this.held.size) this.log.push({ type: 'release-all', code: '창 이탈', at: performance.now() }); this.held.clear(); this.rawHeld.clear(); };

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

    // 마우스: 움직이면 조준 모드, 왼쪽 = 공격, 오른쪽 = 락온 (터치는 TouchControls가 따로 처리)
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', (p) => { if (!p.wasTouch) this.mouseActive = true; });
    scene.input.on('gameout', () => { this.mouseActive = false; });
    scene.input.on('pointerdown', (p) => {
      if (p.wasTouch) { this.mouseActive = false; return; }
      if (scene.registry.get('uiClickAt') === p.downTime) return; // 화면 버튼(테스트 모드 등)을 누른 클릭은 공격 아님
      this.mouseActive = true;
      if (p.rightButtonDown()) { this.pressed.lockToggle = true; this.log.push({ type: 'down', code: '마우스 오른쪽', at: performance.now() }); }
      else if (p.leftButtonDown()) { this.pressed.attack = true; this.log.push({ type: 'down', code: '마우스 왼쪽(공격)', at: performance.now() }); }
      if (this.log.length > 10) this.log.shift();
    });
  }

  isHeld(dir) {
    for (const code of this.held) if (MOVE_CODES[code] === dir) return true;
    return false;
  }

  /** 마우스 커서의 월드 좌표 (카메라가 움직이므로 매 프레임 계산) */
  aimPoint() {
    if (!this.mouseActive) return null;
    const p = this.scene.input.activePointer;
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: wp.x, y: wp.y };
  }

  /**
   * @returns {{move:{x:number,y:number}, aim:{x:number,y:number}|null, autoAim:boolean,
   *            attack:boolean, roll:boolean, lockToggle:boolean, switchWeapon:number|'next'|null}}
   */
  getCommand() {
    let x = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    let y = (this.isHeld('down') ? 1 : 0) - (this.isHeld('up') ? 1 : 0);

    this.lastMove = { x, y };
    const touch = this.getTouch();
    const t = touch ? touch.consume() : null;
    if (t && (t.move.x !== 0 || t.move.y !== 0)) {
      x = t.move.x;
      y = t.move.y;
    }

    // 방향 정규화 (대각선도 길이 1)
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }

    const aim = this.aimPoint();
    if (this.pressed.sneakToggle) { this.sneakOn = !this.sneakOn; this.pressed.sneakToggle = false; }
    const sprinting = (this.rawHeld.has('ShiftLeft') || this.rawHeld.has('ShiftRight') || !!t?.rollHeld) && (x !== 0 || y !== 0);
    if (sprinting && this.sneakOn) this.sneakOn = false;            // 달리면 웅크림이 풀림
    if (sprinting && touch?.sneakOn) touch.sneakOn = false;
    const cmd = {
      move: { x, y },
      sneak: this.sneakOn || (!!t?.sneak && !sprinting), // C(또는 휴대폰 웅크림 버튼)로 켜고 끔
      aim,                 // 조준 지점(월드 좌표). 협동 시에도 그대로 전송 가능
      autoAim: !aim,       // 조준 지점이 없으면 가까운 적 자동 조준
      lockToggle: this.pressed.lockToggle || !!t?.lockToggle,
      interact: this.pressed.interact || !!t?.interact,
      useItem: this.pressed.useItem || !!t?.useItem,
      openInventory: this.pressed.openInventory || !!t?.openInventory,
      attack: this.pressed.attack || !!t?.attack,
      roll: this.pressed.roll || !!t?.roll,
      sprint: this.rawHeld.has('ShiftLeft') || this.rawHeld.has('ShiftRight') || !!t?.rollHeld, // Shift 누르는 동안 전력질주 (휴대폰: 구르기 버튼 꾹)
      switchWeapon: this.pressed.switchWeapon ?? t?.switchWeapon ?? null,
    };
    this.pressed.attack = false;
    this.pressed.roll = false;
    this.pressed.switchWeapon = null;
    this.pressed.lockToggle = false;
    this.pressed.interact = false;
    this.pressed.useItem = false;
    this.pressed.openInventory = false;
    return cmd;
  }
}
