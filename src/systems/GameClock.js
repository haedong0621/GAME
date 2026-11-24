/**
 * 게임 시계·달력. 수치는 data/world.json의 time.
 *   기본: 현실 1초 = 게임 1분 → 하루 = 현실 24분. 시간은 "게임 분" 하나로 센다 (0 = 1일째 00:00).
 *   낮밤 색: 시각별 열쇠 색을 이어 붙여 섞음. 밤 정도(nightFactor 0~1)로 시야·몬스터 사나움을 조절.
 *   시계 타이머(after): 다시 자라기·재등장 등. 자고 일어나 시간을 건너뛰면 그만큼 지난 것으로 처리된다.
 * Godot: GameClock.gd (Autoload) — _process에서 분을 더하고, 타이머는 정렬된 배열, CanvasModulate로 낮밤 색.
 */
const DAY = 24 * 60;

export class GameClock {
  /** @param {{minutesPerRealSecond:number, startDay:number, startHour:number, colors:Array}} t data/world.json의 time */
  constructor(t) {
    this.cfg = t;
    this.minutes = (t.startDay - 1) * DAY + t.startHour * 60;
    this.timers = [];
  }

  get day() { return Math.floor(this.minutes / DAY) + 1; }
  get hour() { return Math.floor((this.minutes % DAY) / 60); }
  get minute() { return Math.floor(this.minutes % 60); }
  /** 하루 중 시각 (0~24, 소수) */
  get hourF() { return (this.minutes % DAY) / 60; }

  /** 시간대 이름 */
  get phase() {
    const h = this.hourF;
    if (h >= 5 && h < 7) return '새벽';
    if (h >= 7 && h < 17) return '낮';
    if (h >= 17 && h < 19.5) return '노을';
    return '밤';
  }

  /** 밤 정도 0(한낮) ~ 1(한밤): 시야·몬스터 사나움에 씀 */
  get nightFactor() {
    const h = this.hourF;
    if (h >= 7 && h < 17) return 0;
    if (h >= 21 || h < 4) return 1;
    if (h >= 17 && h < 21) return (h - 17) / 4;   // 노을에 점점
    return 1 - (h - 4) / 3;                         // 새벽에 점점 밝아짐 (4~7시)
  }

  /** 지금 화면에 곱할 색 {r,g,b} (0~255) — 열쇠 색 사이를 섞음 */
  tint() {
    const keys = this.cfg.colors; // [[시각, 0xRRGGBB], ...] 시각 순
    const h = this.hourF;
    let a = keys[keys.length - 1], b = keys[0];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] > h) { b = keys[i]; a = keys[(i - 1 + keys.length) % keys.length]; break; }
      if (i === keys.length - 1) { a = keys[i]; b = keys[0]; }
    }
    const span = ((b[0] - a[0]) + 24) % 24 || 24;
    const t = (((h - a[0]) + 24) % 24) / span;
    const num = (c) => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c);
    const ca = num(a[1]), cb = num(b[1]);
    const mix = (s) => Math.round(((ca >> s) & 255) * (1 - t) + ((cb >> s) & 255) * t);
    return { r: mix(16), g: mix(8), b: mix(0) };
  }

  /** 시각 글 "3일째 07:05 · 낮" */
  label() {
    const p = (n) => String(n).padStart(2, '0');
    return `${this.day}일째 ${p(this.hour)}:${p(this.minute)} · ${this.phase}`;
  }

  /** 현실 시간만큼 흐름 (dtMs = 게임 속 경과, 슬로모션 반영된 값) */
  update(dtMs) {
    this.advance((dtMs / 1000) * this.cfg.minutesPerRealSecond);
  }

  /** 시간을 건너뜀 (잠 등). 그 사이 끝나는 타이머는 모두 실행 */
  advance(gameMinutes) {
    this.minutes += gameMinutes;
    if (!this.timers.length) return;
    const due = this.timers.filter((t) => t.at <= this.minutes);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.minutes);
    for (const t of due) t.fn();
  }

  /**
   * 시계 타이머: 보통 속도 기준 realMs 뒤 (= 게임 시간으로 환산). 잠으로 건너뛰면 그만큼 당겨짐.
   * @returns {{remove:Function}}
   */
  after(realMs, fn) {
    const t = { at: this.minutes + (realMs / 1000) * this.cfg.minutesPerRealSecond, fn };
    this.timers.push(t);
    return { remove: () => { this.timers = this.timers.filter((x) => x !== t); } };
  }

  /** 다음 hour시까지 남은 게임 분 */
  minutesUntil(hour) {
    const now = this.minutes % DAY;
    let d = hour * 60 - now;
    if (d <= 0) d += DAY;
    return d;
  }

  toJSON() { return { minutes: Math.round(this.minutes) }; }
  load(d) { if (Number.isFinite(d?.minutes)) this.minutes = d.minutes; }
}
