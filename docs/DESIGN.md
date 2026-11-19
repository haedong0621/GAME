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
- **입력** (`systems/InputSystem.js`) — 매 프레임 "명령" `{move, attack, roll, switchWeapon}` 반환; 키보드(WASD, J/마우스 왼쪽, Space/K, 1·2·Q)와 터치 조작판 결과를 합침; 버튼류는 이벤트를 다음 프레임까지 보관(짧은 탭 유실 방지) → Godot Input Map(`move_*`, `attack`, `roll`, `weapon_*`) + `Input.get_vector()`
- **플레이어 이동** (`entities/Player.js`) — 방향 × `data/player.json`의 `speed` 로 속도 설정, 충돌은 발밑 작은 박스(16×10), 마지막 이동 방향 = 바라보는 방향(`facing`) → Godot `CharacterBody2D` + `move_and_slide()`, CollisionShape2D(16×10)를 발밑에
- **플레이어 상태 머신** (`entities/Player.js`) — `free → windup → active → recovery → (다음 타 windup | roll | free)`; windup/active/recovery 중 입력은 예약(버퍼), recovery 시작 후 `chainAfterMs`가 지나야 다음 타·구르기로 연결; 마지막 타 뒤 예약은 1타부터 → Godot `enum State` + `match state`
- **무기·콤보** (`entities/Player.js`, `data/weapons.json`) — 무기마다 `combo` 배열(타마다 휘두르기 각도 from/to, windup/active/recovery/chainAfter ms, 데미지, 기력, 전진 속도, 판정 원, 화면 흔들림, 히트스톱, 몸 기울기·웅크림)과 이동속도 배율; 무기 슬롯은 `data/player.json` `weaponSlots`, free 상태에서만 교체 → Godot 무기 Resource(`WeaponData.tres`, `Array[AttackMove]`), 판정은 Area2D를 active 구간에만 켬
- **히트스톱** (`entities/Player.js`) — 공격이 맞으면 `hitstopMs` 동안 플레이어 시간 정지(이동 0, 상태 타이머 멈춤, 입력은 예약) → Godot 플레이어 노드 `process_mode` 잠시 정지 또는 AnimationPlayer `speed_scale = 0`
- **무기 겉모습** (`entities/WeaponView.js`) — 손(가슴 높이)에 무기 그림, 상태별 각도: 대기=`restAngle`, windup=이전 각도→from, active=from→to(easeOutCubic), recovery=55% 유지 후 대기로; 칼끝이 위면 몸 뒤, 아래면 몸 앞 → Godot 손 Node2D + Sprite2D, AnimationPlayer rotation 트랙
- **몸 연출** (`entities/Player.js` `updatePose`) — 물리 몸체와 분리된 겉모습 이미지(`visual`)를 기울이고(lean) 웅크림/펴기(scale), windup 중 밝은 색 → Godot Sprite2D를 CharacterBody2D와 별도 노드로, 진짜 애니메이션으로 대체 예정
- **구르기** (`entities/Player.js`, `data/player.json` `roll`) — 굴러가는 방향 = 입력 방향(없으면 바라보는 방향), 속도·시간·무적 시간(시작부터 `invincibleMs`)·기력 소모 → Godot 같은 상태 머신, 무적은 Hurtbox `monitorable = false`
- **체력·기력** (`systems/Stats.js`) — hp/stamina, 기력은 행동 후 `staminaRegenDelayMs` 지나고 `free` 상태에서만 초당 `staminaRegenPerSec` 회복, 부족하면 행동 불가 → Godot `Stats.gd` + `signal changed`
- **전투 판정** (`systems/Combat.js`) — 원(공격) vs 사각형(대상 hurtbox) 겹침 검사 → Godot Area2D 겹침 (`area_entered`)
- **몬스터** (`entities/Monster.js`, `data/monsters.json`) — 맵의 `type=monster`(속성 `monsterId`), 발밑 충돌(길 막음) + 몸 전체 hurtbox(맞는 범위), 맞으면 흰색 번쩍·흔들림, hp 0이면 `respawnMs` 후 부활(허수아비용), 머리 위 체력 바; AI는 아직 없음(`ai: none`) → Godot `Monster.tscn` = Sprite2D + StaticBody2D + Hurtbox(Area2D) + Stats
- **보스** (`entities/Boss.js`, `data/monsters.json` `ai: "boss"`) — 상태 머신 `idle → roar → chase → windup → active → recovery → chase`, 놓치면(`leashRadius`) `return`(집으로, 도착하면 체력 회복) ; 거리에 맞는 공격을 `weight`로 무작위 선택, 공격 사이 `attackCooldownMs`; 체력 비율 `phases`(예: 50% 미만 분노 — 이동·예고 속도 배율); 물리 몸체는 발밑 박스(밀리지 않음), 겉모습은 별도 이미지 → Godot `Boss.tscn` CharacterBody2D + 상태 머신, 공격 데이터는 Resource 배열
- **보스 공격 패턴** (`data/monsters.json` `attacks`) — `circle`형(앞 `offset` 거리에 반경 `radius` 원, 판정 중 짧은 전진 `lunge`), `charge`형(예고 중 `aimLockAt` 비율까지 플레이어 조준 후 방향 고정, `speed`로 돌진, 몸 원 판정, 벽에 막히면 정지); 한 공격은 플레이어에게 최대 1회 → Godot 공격별 Area2D + AnimationPlayer
- **예고 표시(텔레그래프)** (`entities/Boss.js` `drawTelegraph`) — 예고 동작 중 바닥에 빨간 범위(원은 타원, 돌진은 직사각형 경로)가 점점 진해지고 안쪽 원이 차오름, 판정 순간 진하게; 보스 몸은 웅크림+붉은 색, 빈틈(recovery)은 창백한 색 → Godot 바닥 레이어의 Polygon2D/Sprite2D + Tween
- **경계 단계** (`entities/Boss.js` `senses`, `Awareness`) — `unaware → alert`(발견: 포효), 놓치면 `suspicious`(귀가), 지금은 거리(`detectRadius`)만 판정; 눈치채기 전 피격 시 `sneakAttackMultiplier` 배율(기습) → M4 스닉에서 `senses()`에 시야각·소리·은신 추가; Godot 같은 enum + RayCast2D 시야
- **플레이어 피격** (`entities/Player.js` `receiveHit`) — 구르기 무적 중이면 '회피!'(데미지 없음), 아니면 체력 감소 + `hurt` 상태(밀려남 `knockbackSpeed`, `hurtMs`, 콤보·예약 취소) + `hitInvulnMs` 동안 무적(깜빡임); 결과 `hit/dodged/ignored` 반환 → Godot Hurtbox Area2D + 같은 규칙
- **쓰러짐·부활** (`scenes/WorldScene.js` `onPlayerDeath`) — 체력 0이면 `dead`, `respawnDelayMs` 후 시작 지점에서 체력 가득 부활, 보스는 집으로 돌아가 체력 회복 → Godot 같은 흐름 (GameState 싱글톤에서 처리)
- **보스 처치 보상** (`scenes/WorldScene.js` `onBossDefeated`) — `drops` 목록의 재료를 쓰러진 자리 주변에 떨굼(주워야 획득), '토벌!' 알림, `respawnMs` 후 보스 재등장(반복 사냥용) → Godot 같은 흐름, 드롭 테이블은 Resource
- **타격 연출** (`systems/Effects.js`) — 베기 궤적(from→to 방향 호, 240ms 페이드, 굵기는 무기 크기에 따라), 데미지 숫자, 무기 이름 라벨, 맞힐 때 카메라 흔들림(타마다 세기 다름) → Godot Tween + `Camera2D` 오프셋 흔들기
- **카메라** (`scenes/WorldScene.js`) — 캔버스 960×540, 월드만 2배 확대(`WORLD_ZOOM`), 플레이어를 부드럽게 따라감(lerp 0.12), 맵 경계에서 멈춤 → Godot `Camera2D`(`zoom = 2`)를 플레이어 자식으로, `position_smoothing_enabled`, `limit_*`를 맵 크기로; 뷰포트 960×540, stretch mode `canvas_items`
- **나무** (`entities/Tree.js`) — 맵의 `type=tree` 점 위치(발밑)에 생성, 줄기에만 고정 충돌 박스(14×10), 잎은 통과·가림 → Godot `Tree.tscn` = Sprite2D + StaticBody2D(줄기 CollisionShape2D)
- **지형 충돌** (`scenes/WorldScene.js`) — 타일 속성 `collides=true`(물)인 타일은 막힘 → Godot TileSet 물리 레이어에 해당 타일만 충돌 폴리곤
- **아이템 DB** (`systems/ItemDatabase.js`) — `data/items.json`을 id로 조회 → Godot Autoload `ItemDB.gd` (Dictionary id→정보) 또는 Resource
- **아이템 줍기** (`entities/ItemPickup.js`) — 맵의 `type=item`(속성 `itemId`, `amount`) 위치에 놓이고 닿으면 인벤토리에 추가 → Godot `Area2D` + `body_entered` 시그널
- **인벤토리** (`systems/Inventory.js`) — id→개수 맵, 바뀌면 리스너 호출 → Godot Autoload `Inventory.gd` + `signal changed`
- **HUD** (`scenes/UIScene.js`) — 월드 위에 겹친 별도 씬; 체력·기력 바, 무기 이름 + 콤보 단계(예: 2/3 되베기), 보스 체력 바(화면 아래 가운데, 발견했을 때만, 분노 단계 표시), 큰 알림 글씨(registry `banner` 변경 이벤트), 가방 목록, 조작 안내(키보드일 때) → Godot `CanvasLayer` + ProgressBar + Label
- **터치 조작** (`systems/TouchControls.js`) — 터치 기기(또는 `?touch=1`)에서 표시; 화면 왼쪽 절반 누른 자리 중심의 가상 조이스틱(반경 70, 데드존 0.25), 오른쪽 아래 공격·구르기·무기 버튼, 멀티터치 3개 → Godot CanvasLayer + 가상 조이스틱 + TouchScreenButton(action 지정)
- **모바일 페이지** (`index.html`) — 확대 금지, 세로로 들면 "가로로 돌려 주세요" 안내, 터치 기기에 전체 화면 버튼(지원 브라우저는 가로 고정) → Godot 웹 내보내기 시 같은 HTML 셸 설정 / 모바일 앱은 프로젝트 설정 `orientation = landscape`
- **임시 그래픽** (`systems/PlaceholderArt.js`) — 에셋이 없을 때 코드로 텍스처 생성 → Godot에서는 이식 대상 아님(진짜 에셋 사용)
- **디버그** — 주소에 `?debug=1`이면 충돌 박스와 공격 판정 원 표시 → Godot 에디터 *Debug → Visible Collision Shapes*

## 결정된 방향 (아직 미구현)
- **저장** — 클라우드 저장(Supabase 무료 플랜 + 구글 로그인) 주 사용, 브라우저 localStorage는 오프라인·비로그인 보조; 저장 데이터는 JSON 한 덩어리(플레이어·인벤토리·세계 변화) → Godot `user://` JSON 파일 + 같은 백엔드 HTTP API
- **협동** — 2~4명 협동, 무료 방식(P2P 또는 Supabase Realtime), 싱글 재미 검증 후 착수 → Godot `MultiplayerAPI`(WebSocket/WebRTC)로 재구현
- **협동 대비 원칙** — 게임 상태는 렌더링과 분리해 한곳에 모으고, 입력은 "명령"으로 변환해 처리 (지금부터 모든 기능에 적용)
