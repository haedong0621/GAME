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
