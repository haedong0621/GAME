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
32x32 pixel grid, limited color palette, 1px dark outline,
no anti-aliasing, flat shading, transparent background,
centered, full body visible, game asset
```

### 대상별 예시
- **주인공:** `a wandering adventurer with a hooded cloak and a small backpack, earthy brown and green colors`
- **나무:** `a single oak tree, round leafy crown, visible trunk base, fits 64x96 pixels`
- **바닥 타일:** `seamless tileable grass ground texture, 32x32, top-down, muted green` (가장자리가 이어지는지 꼭 확인)
- **몬스터:** `a small cave slime monster, glowing teal, cute but slightly creepy`

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
