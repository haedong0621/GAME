/**
 * 스닉(잠입) 공용 시스템: 소리, 환경(풀숲·어둠), 시야 판정, 경계 수치.
 * 화면 그리기와 분리된 순수 규칙. 몬스터·보스가 같은 규칙을 쓴다.
 * Godot: Stealth.gd (Autoload) + 몬스터마다 Perception 노드(RayCast2D 시야, Area2D 청각).
 */

/** 소리: 플레이어 행동이 이번 프레임에 낸 소리 목록. 몬스터가 읽은 뒤 프레임 끝에 비운다. */
export class NoiseBus {
  constructor() {
    this.list = [];
  }

  /** @param {'walk'|'sneak'|'roll'|'attack'|'hit'} kind */
  emit(x, y, radius, kind) {
    this.list.push({ x, y, radius, kind, loud: kind === 'attack' || kind === 'hit' || kind === 'roll' });
  }

  clear() {
    this.list.length = 0;
  }
}

/** 환경: 풀숲(숨기)과 어두운 구역(시야 감소) */
export class StealthEnv {
  /**
   * @param {{x:number,y:number}[]} bushes 풀숲 밑동 좌표
   * @param {{x:number,y:number,width:number,height:number}[]} darkZones
   */
  constructor(bushes, darkZones) {
    this.bushes = bushes;
    this.darkZones = darkZones;
  }

  /** 발밑이 풀숲 안인가 */
  isInBush(x, y) {
    return this.bushes.some((b) => Math.abs(x - b.x) < 15 && y > b.y - 14 && y < b.y + 5);
  }

  isDark(x, y) {
    return this.darkZones.some((z) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height);
  }
}

/**
 * 관찰자가 대상을 얼마나 잘 보는가 (0 = 안 보임, 1 = 아주 잘 보임).
 * 시야 거리·부채꼴 각도, 가까울수록 잘 보임, 웅크림·풀숲·어둠이면 덜 보임.
 * @param {{x:number,y:number,facing:{x:number,y:number}}} observer
 * @param {object} perception data의 perception (visionRange, visionAngleDeg, closeSenseRadius)
 * @param {object} target 플레이어 (x, y, isDead, isSneaking)
 * @param {StealthEnv} env
 * @param {object} stealth data/player.json의 stealth
 */
export function visibility(observer, perception, target, env, stealth) {
  if (target.isDead) return 0;
  const dx = target.x - observer.x, dy = target.y - observer.y;
  const d = Math.hypot(dx, dy);
  const range = perception.visionRange * (env.isDark(target.x, target.y) ? stealth.darkVisionMultiplier : 1);
  if (d > range) return 0;

  // 바로 옆(closeSenseRadius 안)은 등 뒤라도 느낀다. 그 밖은 시야 부채꼴 안이어야 보인다.
  if (d > perception.closeSenseRadius) {
    const f = observer.facing;
    const cos = (f.x * dx + f.y * dy) / (Math.hypot(f.x, f.y) * d || 1);
    if (cos < Math.cos(((perception.visionAngleDeg / 2) * Math.PI) / 180)) return 0;
  }

  const distFactor = 1 - (d / range) * 0.7; // 멀면 0.3, 가까우면 1
  const inBush = env.isInBush(target.x, target.y);
  const mul = inBush
    ? (target.isSneaking ? stealth.bushSneakVisibility : stealth.bushVisibility)
    : (target.isSneaking ? stealth.sneakVisibility : 1);
  return distFactor * mul;
}

export const Level = { UNAWARE: 'unaware', SUSPICIOUS: 'suspicious', ALERT: 'alert' };
const SUSPICIOUS_AT = 0.35;
/** 경계가 식는 속도(초당). detectPerSec × 보임 정도가 이보다 작으면 들키지 않는다 */
const DECAY_PER_SEC = 0.2;

/**
 * 경계 수치(0~1): 보이면 차오르고, 안 보이면 천천히 내려간다. 소리를 들으면 의심 이상으로 오른다.
 * 0.35 이상 = 의심(?), 1 = 발견(!).
 */
export class AwarenessMeter {
  constructor(perception) {
    this.p = perception;
    this.value = 0;
    this.lastSeen = null;  // 마지막으로 본 위치
    this.lastHeard = null; // 마지막으로 들은 위치
    this.seeing = false;
  }

  get level() {
    if (this.value >= 1) return Level.ALERT;
    if (this.value >= SUSPICIOUS_AT) return Level.SUSPICIOUS;
    return Level.UNAWARE;
  }

  /**
   * @returns {{heard: {x:number,y:number}|null}}
   */
  update(dt, observer, target, env, noises, stealth) {
    const vis = visibility(observer, this.p, target, env, stealth);
    this.seeing = vis > 0;
    // 경계는 항상 조금씩 식고(발견 상태 제외), 보이는 만큼 차오른다.
    // → 아주 희미하게 보이면(풀숲+웅크림, 먼 거리) 식는 쪽이 커서 들키지 않는다.
    const sec = dt / 1000;
    if (this.value < 1) this.value -= DECAY_PER_SEC * sec;
    if (this.seeing) {
      this.value += this.p.detectPerSec * vis * sec;
      this.lastSeen = { x: target.x, y: target.y };
    }
    this.value = Math.max(0, Math.min(1, this.value));

    let heard = null;
    for (const n of noises) {
      const d = Math.hypot(n.x - observer.x, n.y - observer.y);
      const r = n.radius * (this.p.hearingMultiplier ?? 1);
      if (d > r) continue;
      heard = { x: n.x, y: n.y };
      // 가까이서 큰 소리(공격·구르기·타격) → 바로 발견, 그 외 → 의심
      if (n.loud && d < r * 0.5) this.value = 1;
      else this.value = Math.max(this.value, 0.5);
    }
    if (heard) this.lastHeard = heard;
    return { heard };
  }

  reset() {
    this.value = 0;
    this.lastSeen = null;
    this.lastHeard = null;
  }
}
