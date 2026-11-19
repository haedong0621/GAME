/**
 * 손에 든 무기의 "겉모습"만 담당 (판정·규칙은 Player가 한다).
 * 무기 그림을 손 위치에 두고, 플레이어 상태에 따라 각도를 바꿔 휘두르는 것처럼 보이게 한다.
 * Godot: 플레이어 자식 Node2D(손) + Sprite2D(무기), AnimationPlayer로 rotation 키프레임.
 */
const DEG = Math.PI / 180;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** 각도 a → b 보간 (라디안, 짧은 쪽으로 돌지 않고 그대로 — 휘두르는 방향 유지) */
const lerp = (a, b, t) => a + (b - a) * t;

export class WeaponView {
  constructor(scene) {
    this.image = scene.add.image(0, 0, '__DEFAULT');
    this.angle = 0;          // 현재 그려지는 각도 (라디안, 절대값)
    this.windupStart = 0;    // 예비 동작이 시작될 때의 각도
  }

  setWeapon(weaponId) {
    this.image.setTexture(`blade-${weaponId}`);
    // 회전 중심 = 손잡이 (텍스처 왼쪽 끝에서 2px)
    this.image.setOrigin(2 / this.image.width, 0.5);
  }

  /** 지금 각도를 예비 동작의 출발점으로 기억 (콤보 연결 시 이전 타의 끝 각도에서 이어짐) */
  beginWindup() {
    this.windupStart = this.angle;
  }

  /**
   * @param {object} p  플레이어 (x, y, depth, facing, state, stateTime, weapon, currentMove)
   */
  update(p) {
    const base = Math.atan2(p.facing.y, p.facing.x);
    const rest = base + p.weapon.view.restAngle * DEG;
    const move = p.currentMove;
    let angle = rest;

    switch (p.state) {
      case 'windup': {
        const t = clamp01(1 - p.stateTime / move.windupMs);
        angle = lerp(this.windupStart, base + move.from * DEG, easeOutCubic(t));
        break;
      }
      case 'active': {
        const t = clamp01(1 - p.stateTime / move.activeMs);
        angle = lerp(base + move.from * DEG, base + move.to * DEG, easeOutCubic(t));
        break;
      }
      case 'recovery': {
        const t = clamp01(1 - p.stateTime / move.recoveryMs);
        const back = clamp01((t - 0.55) / 0.45); // 앞 55%는 휘두른 자세 유지, 그 뒤 제자리로
        angle = lerp(base + move.to * DEG, rest, easeInOut(back));
        break;
      }
      default:
        angle = rest;
    }
    if (!p.inHitstop) this.angle = angle;

    // 손 위치: 가슴 높이, 바라보는 방향으로 살짝 앞
    const hx = p.x + p.facing.x * 3;
    const hy = p.y - 11 + p.facing.y * 2;
    this.image.setPosition(hx, hy).setRotation(this.angle);
    this.image.setAlpha(p.state === 'roll' ? 0.4 : 1);

    // 칼끝이 손보다 위(화면 위쪽)면 몸 뒤에, 아래면 몸 앞에
    const tipBelow = Math.sin(this.angle) > -0.2;
    this.image.setDepth(p.depth + (tipBelow ? 0.5 : -0.5));
  }
}
