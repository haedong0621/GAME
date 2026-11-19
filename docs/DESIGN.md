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
- **입력** (`systems/InputSystem.js`) — 매 프레임 "명령" `{move, attack, roll}` 반환; WASD 이동, J/마우스 왼쪽 공격, Space/K 구르기; 공격·구르기는 keydown 이벤트를 다음 프레임까지 보관(짧은 탭 유실 방지) → Godot Input Map(`move_*`, `attack`, `roll`) + `Input.get_vector()`, 행동은 `_unhandled_input`에서 플래그로 보관
- **플레이어 이동** (`entities/Player.js`) — 방향 × `data/player.json`의 `speed` 로 속도 설정, 충돌은 발밑 작은 박스(16×10), 마지막 이동 방향 = 바라보는 방향(`facing`) → Godot `CharacterBody2D` + `move_and_slide()`, CollisionShape2D(16×10)를 발밑에
- **플레이어 상태 머신** (`entities/Player.js`) — `free → windup → active → recovery → free`, `free → roll → free`; windup/active/recovery 중엔 이동·취소 불가, recovery 중 입력은 다음 행동으로 예약(버퍼) → Godot `enum State` + `match state` (또는 상태별 노드)
- **무기 공격** (`entities/Player.js`, `data/weapons.json`) — 시간(windup/active/recovery ms), 데미지, 기력 소모, 전진 속도(lunge), 판정 원(가슴 높이에서 `hitDistance` 앞, 반경 `hitRadius`); 한 번 휘두를 때 같은 대상은 1회만 타격 → Godot AnimationPlayer로 타이밍, 공격 판정은 Area2D(CircleShape2D)를 active 구간에만 `monitoring = true`
- **구르기** (`entities/Player.js`, `data/player.json` `roll`) — 굴러가는 방향 = 입력 방향(없으면 바라보는 방향), 속도·시간·무적 시간(시작부터 `invincibleMs`)·기력 소모 → Godot 같은 상태 머신, 무적은 Hurtbox `monitorable = false`
- **체력·기력** (`systems/Stats.js`) — hp/stamina, 기력은 행동 후 `staminaRegenDelayMs` 지나고 `free` 상태에서만 초당 `staminaRegenPerSec` 회복, 부족하면 행동 불가 → Godot `Stats.gd` + `signal changed`
- **전투 판정** (`systems/Combat.js`) — 원(공격) vs 사각형(대상 hurtbox) 겹침 검사 → Godot Area2D 겹침 (`area_entered`)
- **몬스터** (`entities/Monster.js`, `data/monsters.json`) — 맵의 `type=monster`(속성 `monsterId`), 발밑 충돌(길 막음) + 몸 전체 hurtbox(맞는 범위), 맞으면 흰색 번쩍·흔들림, hp 0이면 `respawnMs` 후 부활(허수아비용), 머리 위 체력 바; AI는 아직 없음(`ai: none`) → Godot `Monster.tscn` = Sprite2D + StaticBody2D + Hurtbox(Area2D) + Stats
- **타격 연출** (`systems/Effects.js`) — 베기 궤적(220ms 페이드), 데미지 숫자(위로 떠오름), 타격 시 카메라 미세 흔들림 → Godot Tween + `Camera2D` 오프셋 흔들기
- **카메라** (`scenes/WorldScene.js`) — 캔버스 960×540, 월드만 2배 확대(`WORLD_ZOOM`), 플레이어를 부드럽게 따라감(lerp 0.12), 맵 경계에서 멈춤 → Godot `Camera2D`(`zoom = 2`)를 플레이어 자식으로, `position_smoothing_enabled`, `limit_*`를 맵 크기로; 뷰포트 960×540, stretch mode `canvas_items`
- **나무** (`entities/Tree.js`) — 맵의 `type=tree` 점 위치(발밑)에 생성, 줄기에만 고정 충돌 박스(14×10), 잎은 통과·가림 → Godot `Tree.tscn` = Sprite2D + StaticBody2D(줄기 CollisionShape2D)
- **지형 충돌** (`scenes/WorldScene.js`) — 타일 속성 `collides=true`(물)인 타일은 막힘 → Godot TileSet 물리 레이어에 해당 타일만 충돌 폴리곤
- **아이템 DB** (`systems/ItemDatabase.js`) — `data/items.json`을 id로 조회 → Godot Autoload `ItemDB.gd` (Dictionary id→정보) 또는 Resource
- **아이템 줍기** (`entities/ItemPickup.js`) — 맵의 `type=item`(속성 `itemId`, `amount`) 위치에 놓이고 닿으면 인벤토리에 추가 → Godot `Area2D` + `body_entered` 시그널
- **인벤토리** (`systems/Inventory.js`) — id→개수 맵, 바뀌면 리스너 호출 → Godot Autoload `Inventory.gd` + `signal changed`
- **HUD** (`scenes/UIScene.js`) — 월드 위에 겹친 별도 씬; 체력·기력 바(기력 회복 대기 중엔 어두운 색), 가방 목록, 조작 안내 → Godot `CanvasLayer` + ProgressBar + Label
- **임시 그래픽** (`systems/PlaceholderArt.js`) — 에셋이 없을 때 코드로 텍스처 생성 → Godot에서는 이식 대상 아님(진짜 에셋 사용)
- **디버그** — 주소에 `?debug=1`이면 충돌 박스와 공격 판정 원 표시 → Godot 에디터 *Debug → Visible Collision Shapes*

## 결정된 방향 (아직 미구현)
- **저장** — 클라우드 저장(Supabase 무료 플랜 + 구글 로그인) 주 사용, 브라우저 localStorage는 오프라인·비로그인 보조; 저장 데이터는 JSON 한 덩어리(플레이어·인벤토리·세계 변화) → Godot `user://` JSON 파일 + 같은 백엔드 HTTP API
- **협동** — 2~4명 협동, 무료 방식(P2P 또는 Supabase Realtime), 싱글 재미 검증 후 착수 → Godot `MultiplayerAPI`(WebSocket/WebRTC)로 재구현
- **협동 대비 원칙** — 게임 상태는 렌더링과 분리해 한곳에 모으고, 입력은 "명령"으로 변환해 처리 (지금부터 모든 기능에 적용)
