/**
 * 전투 판정 공용 함수. 화면 그리기와 무관한 순수 계산.
 * Godot: 공격 판정은 Area2D(CircleShape2D) + get_overlapping_areas(), 피격 범위는 Hurtbox용 Area2D.
 */

/**
 * 원형 공격 판정과 겹치는 대상들을 돌려준다.
 * @param {{x:number,y:number,radius:number}} circle
 * @param {Array<{getHurtbox():{x:number,y:number,width:number,height:number}, isHittable:boolean}>} targets
 */
export function findHits(circle, targets) {
  const { Geom } = window.Phaser;
  const c = new Geom.Circle(circle.x, circle.y, circle.radius);
  return targets.filter((t) => {
    if (!t.isHittable) return false;
    const r = t.getHurtbox();
    return Geom.Intersects.CircleToRectangle(c, new Geom.Rectangle(r.x, r.y, r.width, r.height));
  });
}

/**
 * 바닥 위험 범위 (몬스터 공격). 그려지는 모양과 맞는 판정이 같은 계산을 쓴다 → "그림 밖에 있었는데 맞음"이 없다.
 * 판정 기준점 = 플레이어 발밑(x, y). 바닥 원은 3/4 시점이라 세로가 GROUND_SQUASH 배.
 * 모양:
 *  - ellipse {x, y, r, sq?}       바닥 원 (sq = 세로 비율, 기본 GROUND_SQUASH)
 *  - fan     {x, y, r, angle, half} 부채꼴 (횡베기). angle·half는 세로를 편 공간의 각도(라디안)
 *  - rect    {x, y, dx, dy, len, w} 직사각형 (돌진 경로). (dx, dy) 방향으로 len, 폭의 절반 w
 * Godot: 같은 모양의 CollisionPolygon2D를 바닥 Area2D로 만들고, 같은 점 목록을 Polygon2D로 그린다.
 */
export const GROUND_SQUASH = 0.7;

export function groundShapeContains(s, px, py) {
  const dx = px - s.x;
  if (s.kind === 'ellipse') {
    const sq = s.sq ?? GROUND_SQUASH;
    const nx = dx / s.r, ny = (py - s.y) / (s.r * sq);
    return nx * nx + ny * ny <= 1;
  }
  if (s.kind === 'fan') {
    const dy = (py - s.y) / GROUND_SQUASH;
    const d = Math.hypot(dx, dy);
    if (d > s.r) return false;
    if (d < 4) return true;
    const da = Math.atan2(Math.sin(Math.atan2(dy, dx) - s.angle), Math.cos(Math.atan2(dy, dx) - s.angle));
    return Math.abs(da) <= s.half;
  }
  if (s.kind === 'rect') {
    const dy = py - s.y;
    const along = dx * s.dx + dy * s.dy, across = -dx * s.dy + dy * s.dx;
    return along >= 0 && along <= s.len && Math.abs(across) <= s.w;
  }
  return false;
}

/** 모양의 외곽 점들 (그리기용). k = 크기 비율 (0~1, 예고 진행도 표시에 씀) */
export function groundShapePoints(s, k = 1) {
  const pts = [];
  if (s.kind === 'ellipse') {
    const sq = s.sq ?? GROUND_SQUASH;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push({ x: s.x + Math.cos(a) * s.r * k, y: s.y + Math.sin(a) * s.r * sq * k });
    }
  } else if (s.kind === 'fan') {
    pts.push({ x: s.x, y: s.y });
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = s.angle - s.half + (2 * s.half * i) / n;
      pts.push({ x: s.x + Math.cos(a) * s.r * k, y: s.y + Math.sin(a) * s.r * GROUND_SQUASH * k });
    }
  } else if (s.kind === 'rect') {
    const px = -s.dy * s.w, py = s.dx * s.w, L = s.len * k;
    pts.push({ x: s.x + px, y: s.y + py }, { x: s.x + s.dx * L + px, y: s.y + s.dy * L + py },
      { x: s.x + s.dx * L - px, y: s.y + s.dy * L - py }, { x: s.x - px, y: s.y - py });
  }
  return pts;
}
