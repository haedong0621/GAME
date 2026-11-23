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

## 5. 2D 도트 방식 (Core Keeper식) — 시험 중, 유력
3D → 도트가 "너무 3D 같다"는 판단으로 순수 2D 도트를 시험.
- **시점:** 3/4 탑뷰 그대로. **방향 4개**(아래·위·옆, 왼쪽은 뒤집기) → 실제로 그리는 방향 3개
- **부위별 겹치기(종이 인형):** 머리·몸통·팔·다리를 부위 그림으로 정의, 갑옷은 부위 그림만 갈아 끼움 → 같은 자세로 모든 동작이 나옴 (`tools/art/pixel_hero.py`)
- **무기는 따로:** 몸은 4방향, 무기는 별도 그림을 코드로 360도 회전 (지금 구조 그대로)
- **크기:** 프레임 32×40, 캐릭터 키 약 26px, 발밑 y=38
- **동작:** 대기 2, 걷기 4, 공격 3(들기·내리침·회복), 구르기 4, 피격 1, 쓰러짐 3 — 부드러움은 장수보다 타이밍·잔상·히트스톱으로
- **팔레트:** 스크립트 안 `PAL` (탁한 어두운 판타지, 그림자 살짝 푸른빛), 외곽선 1px
- 게임에서 보기: 주소에 `?hero=px`

