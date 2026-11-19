# DESIGN — 시스템 설계 요약 (Godot 4 이식용 지시서)

> 규칙: 시스템을 만들거나 바꿀 때마다 **해당 줄을 한 줄로** 추가·수정한다.
> 형식: `시스템 — 지금(Phaser)은 어떻게 동작하는가 → Godot에서는 무엇으로 만든다`

## 공통 규약
- **타일 크기** — 32px 고정 (`src/config.js` `TILE_SIZE`) → Godot TileSet `tile_size = 32x32`
- **좌표/정렬** — 세워진 물체의 위치 = 발밑 좌표, origin (0.5, 1) → Godot Sprite2D `offset.y = -높이/2`(또는 `centered=false`+offset)로 노드 위치를 발밑에 맞춤
- **Y-sort** — 매 프레임 `depth = 발밑 y`, 바닥 타일은 depth -1 → Godot `y_sort_enabled = true`인 부모 노드 아래에 캐릭터·나무를 둠, 바닥 TileMapLayer는 그 밖(아래)에
- **데이터** — 콘텐츠는 `data/*.json`, 시작 시 한 번 읽어 캐시 → Godot Autoload `GameData.gd`가 `FileAccess` + `JSON.parse_string`으로 읽음
- **맵** — Tiled `.tmj`, 타일셋 임베드, 오브젝트는 Object Layer `objects`에 `type`+속성 → Godot에서는 YATI(Tiled 임포터) 애드온으로 가져오거나 TileMapLayer로 다시 그림; 오브젝트는 `type`별로 씬 인스턴스 생성

## 시스템 목록
- **부팅/로딩** (`scenes/BootScene.js`) — JSON·맵·타일셋을 미리 로드하고 임시 그래픽 생성 후 World+UI 씬 시작 → Godot 메인 씬 `_ready()`에서 Autoload 초기화 후 `World.tscn` 로드
- **입력** (`systems/InputSystem.js`) — WASD를 읽어 정규화된 방향 벡터(-1~1) 반환 → Godot Input Map에 `move_up/down/left/right` 등록 후 `Input.get_vector()`
- **플레이어 이동** (`entities/Player.js`) — 방향 × `data/player.json`의 `speed` 로 속도 설정, 충돌은 발밑 작은 박스(16×10) → Godot `CharacterBody2D` + `move_and_slide()`, CollisionShape2D(16×10)를 발밑에
- **카메라** (`scenes/WorldScene.js`) — 플레이어를 부드럽게 따라감(lerp 0.12), 맵 경계에서 멈춤 → Godot `Camera2D`를 플레이어 자식으로, `position_smoothing_enabled`, `limit_*`를 맵 크기로
- **나무** (`entities/Tree.js`) — 맵의 `type=tree` 점 위치(발밑)에 생성, 줄기에만 고정 충돌 박스(14×10), 잎은 통과·가림 → Godot `Tree.tscn` = Sprite2D + StaticBody2D(줄기 CollisionShape2D)
- **지형 충돌** (`scenes/WorldScene.js`) — 타일 속성 `collides=true`(물)인 타일은 막힘 → Godot TileSet 물리 레이어에 해당 타일만 충돌 폴리곤
- **아이템 DB** (`systems/ItemDatabase.js`) — `data/items.json`을 id로 조회 → Godot Autoload `ItemDB.gd` (Dictionary id→정보) 또는 Resource
- **아이템 줍기** (`entities/ItemPickup.js`) — 맵의 `type=item`(속성 `itemId`, `amount`) 위치에 놓이고 닿으면 인벤토리에 추가 → Godot `Area2D` + `body_entered` 시그널
- **인벤토리** (`systems/Inventory.js`) — id→개수 맵, 바뀌면 리스너 호출 → Godot Autoload `Inventory.gd` + `signal changed`
- **HUD** (`scenes/UIScene.js`) — 월드 위에 겹친 별도 씬, 인벤토리 변경을 받아 텍스트 갱신 → Godot `CanvasLayer` + Label
- **임시 그래픽** (`systems/PlaceholderArt.js`) — 에셋이 없을 때 코드로 텍스처 생성 → Godot에서는 이식 대상 아님(진짜 에셋 사용)
- **디버그** — 주소에 `?debug=1`이면 충돌 박스 표시 → Godot 에디터 *Debug → Visible Collision Shapes*
