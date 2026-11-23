# ASSETS — 에셋 규격과 Gemini 이미지 생성 팁

에셋(그림·소리)을 구하거나 만들 때 참고하는 문서입니다.
새 에셋을 넣으면 **반드시 `assets/LICENSES.md`에 출처와 라이선스를 적습니다.**

## 1. 공통 규격
| 항목 | 규격 |
|---|---|
| 격자 | **32×32px** (모든 타일·스프라이트는 32의 배수 크기) |
| 시점 | 탑뷰 + 약간 비스듬히 내려다보는 3/4 시점 (Drova, Core Keeper 느낌) |
| 파일 형식 | PNG, **배경 투명** |
| 스타일 | 픽셀아트, 외곽선 1px, 안티앨리어싱(번짐) 없음 |
| 확대 | 게임이 픽셀을 그대로 키우므로 *작게 그린 원본*을 그대로 씀 |

### 종류별 크기
| 종류 | 폴더 | 크기 | 비고 |
|---|---|---|---|
| 바닥 타일 | `assets/tiles/` | 32×32 한 칸씩, 한 장의 타일셋 이미지로 나열 | 이음새 없이 이어져야 함 |
| 캐릭터 | `assets/characters/` | 한 프레임 32×32 (또는 32×48) | 발이 프레임 맨 아래 가운데에 오도록 |
| 나무/큰 물체 | `assets/tiles/` | 64×64, 64×96 등 | 줄기 밑동이 이미지 맨 아래 가운데 |
| UI | `assets/ui/` | 자유 | |
| 소리 | `assets/audio/` | `.ogg` 우선, `.mp3` 보조 | |

### 캐릭터 시트 배치 (애니메이션)
- 한 줄 = 한 방향: **아래, 왼쪽, 오른쪽, 위** 순서
- 한 줄에 걷기 4프레임 (가로 4칸)
- 예: 32×32 프레임이면 시트 크기 128×128

## 2. Gemini로 이미지 만들 때 팁

### 기본 프롬프트 틀 (영어가 더 잘 됩니다)
```
pixel art, top-down 3/4 view RPG sprite, [대상 설명],
dark gritty low fantasy, muted desaturated earthy palette,
32x32 pixel grid, limited color palette, 1px dark outline,
no anti-aliasing, flat shading, transparent background,
centered, full body visible, game asset
```

### 톤 가이드 (docs/CONCEPT.md의 세계관 방향)
- **분위기:** 어둡고 거친 판타지 (Drova 느낌). 밝고 귀여운 표현은 피합니다.
- **색:** 탁한 흙색·이끼색·녹슨 금속색 위주. 채도 낮게. 강조색(마법, 보스의 약점, 피)만 선명하게.
- **피하고 싶을 때 붙이는 말:** `not cute, not chibi, no bright saturated colors`
- **보스·몬스터:** 위협적이고 기괴하게. 공격 부위(발톱, 꼬리, 뿔)가 *실루엣만 봐도* 보이도록 — 전투에서 예고 동작을 읽기 쉬워집니다.

### 대상별 예시
- **주인공:** `a weathered wanderer in a worn hooded cloak and patched leather armor, rusty short sword, grim expression`
- **나무:** `a single gnarled old tree, twisted trunk, dark mossy crown, visible trunk base, fits 64x96 pixels`
- **바닥 타일:** `seamless tileable dark mossy forest floor texture, 32x32, top-down, muted green and brown` (가장자리가 이어지는지 꼭 확인)
- **보스:** `a hulking swamp beast with bone plates and a long spiked tail, hunched, menacing, fits 96x96 pixels`
- **몬스터:** `a feral ghoul with long claws, gaunt grey skin, crouching`

### 보스 테마 장비 (중요)
보스 소재로 만든 장비는 **그 보스의 특징이 은근히 녹아 있어야** 합니다 (docs/CONCEPT.md "또 잡고 싶다"의 기준).
- 보스 그림을 먼저 확정하고, 장비를 뽑을 때 **보스 그림을 같이 첨부**하세요.
- 프롬프트 예: `same pixel art style, the wanderer wearing armor crafted from the attached swamp beast: mossy green hide, bone plates on the shoulders taken from its spine, a hood with small bone spikes, faint yellow-green eye glow, subtle not costume-like`
- 무기 예: `a short sword made from the attached beast's fang, serrated bone-colored blade, faint green venom glow along the edge, leather-wrapped hilt`
- 핵심 단어: **subtle(은근히)**, **crafted from(~로 만든)**, 보스의 색 2개 + 부위 1~2개(뼈판, 송곳니, 가죽 무늬)만 가져오기.

### 잘 뽑는 요령
1. **한 장에 하나만.** 여러 개를 한 번에 그리게 하면 크기와 시점이 제각각이 됩니다.
2. **스타일 문구를 매번 똑같이 붙이기.** 위 "기본 프롬프트 틀"을 고정해 두면 그림체가 통일됩니다.
3. **참고 이미지를 같이 주기.** 처음에 마음에 든 결과물을 다음 생성 때 첨부하고 `same style as the attached image` 라고 쓰면 일관성이 올라갑니다.
4. **배경 투명이 안 될 때:** `on a plain solid magenta (#FF00FF) background` 로 받은 뒤 그 색을 지우면 깔끔합니다. (지우는 작업은 Claude에게 맡기면 됩니다)
5. **크기는 결국 다시 맞춰야 합니다.** Gemini는 큰 이미지를 주므로, 받은 그림을 Claude에게 주면 32px 격자에 맞게 줄이고 정리합니다.
6. **방향별 그림(걷기 시트)은 어렵습니다.** 정면 한 장을 먼저 확정하고, 그다음 `same character, facing left / back view` 로 하나씩 뽑으세요.

### 넘겨주는 방법
뽑은 이미지를 저장소에 올리거나 대화에 첨부하고 "이거 주인공으로 써줘"라고 말하면 됩니다.
Claude가 규격에 맞게 다듬고 `assets/LICENSES.md`에 기록합니다.

## 3. 무료 에셋을 쓸 때
- 추천 출처: [itch.io 무료 에셋](https://itch.io/game-assets/free), [OpenGameArt](https://opengameart.org/), [Kenney](https://kenney.nl/assets)
- **라이선스 확인:** CC0(마음대로 사용 가능)가 제일 편합니다. CC-BY는 작가 이름 표기가 필요하고, "비상업적 사용만" 같은 조건도 꼭 기록합니다.
- 받은 페이지 주소, 작가, 라이선스를 `assets/LICENSES.md`에 적습니다.

## 4. 3D → 도트 방식 (검증 중)
부드러운 모션 + 보스 장비 외형 교체 + 8방향을 한 번에 해결하기 위한 방식 (Dead Cells처럼).
- 3D 캐릭터(지금은 무료 CC0 KayKit 모델로 시험) → Blender로 8방향 × 동작별 렌더 → 색 줄이기·외곽선 → 스프라이트 시트
- 도구와 방법: `tools/art/README.md`
- 게임에서 보기: 주소에 `?hero=s`(작게, 캐릭터 약 44px) 또는 `?hero=l`(크게, 약 64px)
- 갑옷·무기를 바꾸면 3D 부품만 바꿔 다시 렌더하면 된다 (아직 미적용: 시험 캐릭터는 갑옷 겉모습이 안 바뀜)

## 5. 2D 도트 방식 — 채택 (기본 캐릭터)
3D → 도트가 "너무 3D 같다"는 판단으로 순수 2D 도트로. 모션은 제노니아·영웅서기처럼 크게, 색감은 Drova처럼 어둡게.
- **시점:** 3/4 탑뷰. **8방향** — 그리는 건 5방향(아래·아래대각·옆·위대각·위), 왼쪽 계열은 좌우 뒤집기
- **칼을 그림에 포함:** 몸과 칼이 함께 움직임. 공격 방향은 8방향으로 맞춰짐 (이동·조준은 자유)
- **부위별 겹치기 + 관절 뼈대:** 머리·몸통은 방향별 도트 그림, **팔다리는 관절 뼈대**(어깨→팔꿈치→손, 골반→무릎→발)로 그림. 자세는 손·발 목표 위치로 주고 팔꿈치·무릎은 자동으로 굽힘(IK). 상체 숙이기·비틀기, 3D 뼈대를 방향별로 투영해 8방향이 같은 자세 데이터로 나옴. 갑옷은 머리·몸통 그림 + 팔다리 색(`LIMB`)만 갈아 끼움
- **무기는 규칙으로 그림:** 손 위치 + 칼 각도(바라보는 방향 기준 a, 들어 올린 각도 e) + 길이·굵기·색 → 어느 방향에서도 같은 공격 자세 데이터로 그려짐. 무기 추가 = `WEAPONS`에 한 줄
- **공격 키프레임:** 예비동작(웅크리고 젖힘, 대검은 2장) → **잔상 1장**(칼끝 초승달) → 타격(내딛고 길게 유지) → 마무리 → 제자리. 잔상은 휘두르는 순간에만
- **콤보:** 한손검 가로 베기 → 올려 베기 → 내려찍기 / 대검 크게 휘두르기 → 내려찍기
- **크기:** 프레임 64×64(공격 궤적 여유), 캐릭터 키 약 30px(몸통·팔·다리 줄 복제로 키움), 발밑 y=52
- **결과:** `assets/characters/hero_<갑옷>_<무기>.png` + `hero_px.json` — 실행 `python3 tools/art/pixel_hero.py`
- 게임 기본 캐릭터. 예전 임시 캐릭터는 주소에 `?hero=old`
- 모션: 대기·걷기(무릎 굽힘)·웅크려 대기/걷기·공격(무기별, 몸 비틀기·내딛기)·구르기 6(공처럼 말아 바닥에 붙여 굴림: 옆·대각선은 회전, 아래·위는 고꾸라짐, 살짝 튐, 흙먼지)·피격 5(충격·밀려남·휘청·버팀·회복)·쓰러짐 5

## 6. 몬스터 도트 (네 발 짐승)
- 생성기: `tools/art/pixel_monsters.py` — 등뼈(엉덩이→어깨)·목·머리(턱)·꼬리·다리 4개(관절 2개, 발 목표 → 무릎 자동) 뼈대, 몸은 등뼈를 따라 원을 이어 그림(아래 어둡게·위 밝게)
- 종류별 설정(`SPECS`): 크기·다리 길이·몸 반지름·색, 장식(늪지 짐승: 등뼈 판·꼬리 가시·송곳니·노란 눈 / 들개: 귀·갈비)
- 자세(`ANIMS`): 몸 낮추기, 앞 들기(뒷발 서기), 내딛기, 머리 숙이기, 턱 벌리기, 발 위치, 꼬리
- **보스 예고 동작이 그림으로 보이게:** 할퀴기 = 앞발 들어 젖힘, 몸통 내려찍기 = 뒷발로 일어섬, 돌진 = 웅크려 땅 긁기
- 결과: `assets/characters/mon_<종류>.png` + `mon_px.json` (5방향 + 뒤집기, 프레임: 들개 48px / 늪지 짐승 128px)

## 7. 배경 도트
- 생성기: `tools/art/pixel_world.py` (`--remap`이면 맵 바닥 번호도 다시 매김)
- 타일셋 `assets/tiles/world_tiles.png` (32px, 8열): 0~3 풀(기본·풀포기·들꽃·자갈), 4~19 흙길, 20~35 물(모두 `collides`), 36~43 풀 추가 변형(반복 무늬 줄이기). 흙길·물은 **이웃 4방향 마스크**(N=1, E=2, S=4, W=8)로 고른 경계 타일 — 가장자리가 울퉁불퉁하게 이어지고 물가는 거품·진흙 테두리
- **3/4 시점 입체감**: 빛은 왼쪽 위 앞(캐릭터와 같음). 흙길·물은 풀밭보다 한 단 파인 땅 → 북쪽 가장자리에 흙벽 면이 보이고 그 밑에 그림자, 남쪽 풀 턱은 밝은 윗선. 풀포기·돌멩이도 밑동 그림자 + 밝은 끝
- 소품: 나무 3종(`tree0~2`, 56×80, 위치로 모양 결정), 풀숲, 제작대(윗면+앞면+다리), 허수아비 — 잎은 작은 공 덩어리들, 줄기·기둥은 원기둥으로 보고 면마다 빛을 계산해 칠함
- 색감: 탁하고 어두운 숲 톤 (Drova 방향)
- Tiled에서 직접 그릴 때: 지금은 경계 타일을 자동으로 못 고르므로, 종류(풀/흙/물)만 칠하고 `--remap`을 돌리면 된다. 나중에 Tiled Terrain(지형) 세트로 바꿀 수 있음
- 채집 그림: 바위 2종 + 부스러기, 그루터기(나무와 같은 크기·밑동), 약초(하늘빛 봉오리) + 뜯긴 모습 — 디더 없는 3~4단 셀 셰이딩(덜 3D스럽게)
- 절벽(높이 2단): **굽기 방식** — Tiled `height` 레이어에 높이 표시 타일(빨강 1 절벽 고지대 / 노랑 2 낮은 턱 고지대 / 파랑 3 계단 자리 / 초록 4 비탈 고지대)을 칸 단위로 칠하고 오브젝트 `climb` 사각형으로 덩굴 자리를 표시 → `python3 tools/art/pixel_world.py --remap`(또는 `terrain_bake.py`)이 칸을 흐리게+노이즈로 구불구불한 경계를 만들고, 경계 아래로 벽면을 "밀어내려" 그려 `assets/maps/world_cliffs_*.png`(1024px 조각) + `maps/world_terrain.json`(8px 충돌 격자)을 만든다. 계단처럼 칠한 칸은 대각선이 되고 모서리는 둥글어짐. 벽면 높이는 절벽↔낮은 턱 사이에서 서서히 바뀜. (예전 칸 단위 벽면 타일 44~75는 타일셋에 남아 있지만 안 씀)
