/**
 * Y-sort: 발밑 y좌표가 클수록(화면 아래쪽일수록) 앞에 그린다.
 * 전제: 세워진 물체는 origin (0.5, 1) 이라서 obj.y 가 곧 발밑이다.
 * Godot: y_sort_enabled 인 부모 노드 아래에 두면 자동.
 */

/** 바닥 타일 레이어 depth (모든 물체보다 뒤) */
export const GROUND_DEPTH = -1;

export function applyYSort(obj) {
  obj.setDepth(obj.y);
}
