/**
 * 모바일 가로 화면용 터치 조작판 (UI 씬 위에 그린다).
 * - 화면 왼쪽 아무 곳이나 누르고 끌면: 가상 조이스틱 (누른 자리가 중심)
 * - 오른쪽 아래 버튼: 공격(큰 버튼), 구르기, 무기 교체
 * 결과는 InputSystem이 consume()으로 가져가 키보드 입력과 합친다.
 * Godot: CanvasLayer + TouchScreenButton(action = attack/roll) + 가상 조이스틱 씬.
 */
const STICK_RADIUS = 70;   // 조이스틱이 최대로 기울어지는 거리 (게임 화면 px)
const DEADZONE = 0.25;

export class TouchControls {
  /** @param {Phaser.Scene} scene UI 씬 */
  constructor(scene) {
    this.scene = scene;
    scene.input.addPointer(2); // 동시에 3개 손가락까지

    const W = scene.scale.width, H = scene.scale.height;
    this.buttons = [
      { action: 'attack', label: '공격', x: W - 110, y: H - 110, r: 62, color: 0x9a3a2a },
      { action: 'roll',   label: '구르기', x: W - 235, y: H - 70, r: 46, color: 0x3a5a7a },
      { action: 'switchWeapon', label: '무기', x: W - 70, y: H - 245, r: 36, color: 0x5a5040 },
      { action: 'lockToggle', label: '고정', x: W - 215, y: H - 205, r: 38, color: 0x7a6a30 },
      { action: 'sneakToggle', label: '웅크림', x: W - 360, y: H - 52, r: 34, color: 0x3a3a5a },
      { action: 'interact', label: '줍기·열기', x: W - 345, y: H - 150, r: 40, color: 0x4a7a4a, onlyWhen: 'interactPrompt' },
      { action: 'useItem', label: '먹기', x: W - 330, y: H - 255, r: 30, color: 0x6a4a3a },
      { action: 'openInventory', label: '가방', x: W - 400, y: H - 300, r: 28, color: 0x4a4a3a },
    ];

    this.stick = { pointerId: null, baseX: 0, baseY: 0, x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.pressed = { attack: false, roll: false, switchWeapon: null, lockToggle: false, interact: false, useItem: false, openInventory: false };
    this.held = new Map(); // pointerId → 버튼 (눌린 모양 표시용)

    this.g = scene.add.graphics().setDepth(10);
    this.labels = this.buttons.map((b) => scene.add.text(b.x, b.y, b.label, {
      fontFamily: 'sans-serif', fontSize: b.r > 50 ? '20px' : '16px', color: '#f2e6c8',
    }).setOrigin(0.5).setDepth(11).setAlpha(0.9));

    scene.input.on('pointerdown', (p) => this.onDown(p));
    scene.input.on('pointermove', (p) => this.onMove(p));
    scene.input.on('pointerup', (p) => this.onUp(p));
    scene.input.on('pointerupoutside', (p) => this.onUp(p));

    this.draw();
  }

  onDown(p) {
    if (this.scene.registry.get('panelOpen')) return; // 제작 화면 등이 열려 있으면 조작판은 쉼
    const btn = this.buttons.find((b) => this.isShown(b) && Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 10);
    if (btn && btn.action === 'sneakToggle') {
      this.sneakOn = !this.sneakOn; // 웅크림은 켜고 끄는 방식
      this.held.set(p.id, btn);
    } else if (btn) {
      this.pressed[btn.action] = btn.action === 'switchWeapon' ? 'next' : true;
      this.held.set(p.id, btn);
    } else if (p.x < this.scene.scale.width * 0.5 && this.stick.pointerId === null) {
      Object.assign(this.stick, { pointerId: p.id, baseX: p.x, baseY: p.y, x: p.x, y: p.y });
    }
    this.draw();
  }

  onMove(p) {
    if (p.id !== this.stick.pointerId) return;
    const s = this.stick;
    let dx = p.x - s.baseX, dy = p.y - s.baseY;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) { dx *= STICK_RADIUS / d; dy *= STICK_RADIUS / d; }
    s.x = s.baseX + dx;
    s.y = s.baseY + dy;
    const mag = Math.min(1, d / STICK_RADIUS);
    this.move = mag < DEADZONE ? { x: 0, y: 0 } : { x: dx / (mag * STICK_RADIUS), y: dy / (mag * STICK_RADIUS) };
    this.draw();
  }

  onUp(p) {
    if (p.id === this.stick.pointerId) {
      this.stick.pointerId = null;
      this.move = { x: 0, y: 0 };
    }
    this.held.delete(p.id);
    this.draw();
  }

  /** InputSystem이 매 프레임 호출. 버튼 누름은 한 번 가져가면 지워진다. */
  consume() {
    const rollHeld = [...this.held.values()].some((b) => b.action === 'roll'); // 구르기 버튼을 누르고 있음 → 전력질주
    const out = { move: { ...this.move }, ...this.pressed, sneak: !!this.sneakOn, rollHeld };
    this.pressed = { attack: false, roll: false, switchWeapon: null, lockToggle: false, interact: false, useItem: false, openInventory: false };
    return out;
  }

  /** 조건부 버튼(예: 상호작용)은 해당 상황일 때만 보이고 눌린다 */
  isShown(b) {
    return !b.onlyWhen || !!this.scene.registry.get(b.onlyWhen);
  }

  /** UI 씬 update에서 매 프레임 호출 (조건부 버튼 표시 갱신) */
  refresh() {
    const sig = this.buttons.map((b) => this.isShown(b)).join();
    if (sig !== this.lastSig) { this.lastSig = sig; this.draw(); }
  }

  draw() {
    const g = this.g;
    g.clear();
    // 조이스틱 (누르고 있을 때만)
    const s = this.stick;
    if (s.pointerId !== null) {
      g.fillStyle(0x000000, 0.25).fillCircle(s.baseX, s.baseY, STICK_RADIUS);
      g.lineStyle(2, 0xf2e6c8, 0.35).strokeCircle(s.baseX, s.baseY, STICK_RADIUS);
      g.fillStyle(0xf2e6c8, 0.5).fillCircle(s.x, s.y, 28);
    }
    // 버튼
    const heldButtons = new Set(this.held.values());
    this.buttons.forEach((b, i) => this.labels[i].setVisible(this.isShown(b)));
    for (const b of this.buttons) {
      if (!this.isShown(b)) continue;
      const down = heldButtons.has(b) || (b.action === 'sneakToggle' && this.sneakOn);
      g.fillStyle(b.color, down ? 0.75 : 0.4).fillCircle(b.x, b.y, b.r);
      g.lineStyle(3, 0xf2e6c8, down ? 0.8 : 0.35).strokeCircle(b.x, b.y, b.r);
    }
  }
}
