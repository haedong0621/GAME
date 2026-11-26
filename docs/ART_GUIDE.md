# 그림 가이드 (초안) — AI로 뽑고, 픽셀 툴로 다듬기

결정(2026-11): 시점은 **3/4 탑뷰**(Drova·스타듀밸리처럼 위에서 비스듬히), 그림은 **AI로 뽑고 사용자가 픽셀 툴로 다듬기**.
목표 수준: **Drova·펀치클럽** — 휴대폰에서도 표정·몸짓·몸 상태가 보이는 디테일.
역할: 프롬프트(그림 주문 문구)·크기 규칙·게임에 넣기 = Claude / AI로 뽑기·고르기·픽셀 수정 = 사용자.

## 1. 크기 규칙 (첫 시험 뒤 확정)
| 대상 | 그림 크기 | 한 장면(프레임) 캔버스 | 비고 |
|---|---|---|---|
| 사람(소년·NPC) | 키 약 **64px** (지금의 2배) | 96×96 | 발밑이 캔버스 아래 가운데(위에서 88px 줄) |
| 바닥 타일 | **64×64** (지금 32px의 2배) | 64×64 | 이어 붙여도 이음새가 안 보이게 |
| 중형 짐승(들개) | 몸길이 약 70px | 128×128 | 발밑이 아래 가운데 |
| 보스 | 사람 키의 2~3배 | 192~256 | |

- 방향: **5방향만 그림** — 앞(아래), 앞옆, 옆(오른쪽 보기), 뒤옆, 뒤(위). 왼쪽은 게임이 좌우 뒤집어 씀.
- 빛: **왼쪽 위**에서. 그림자는 발밑 타원(게임이 따로 그려도 됨).

## 2. 색·선 규칙
- 어둡고 거친 판타지, **채도 낮은 흙빛·이끼빛**(Drova 느낌). 원색 금지.
- 색 수 적게(한 캐릭터 16~24색), **안티에일리어싱(번짐) 없음**, 배경 **투명**.
- 외곽선: 1px **아주 어두운 갈색**(완전 검정 X).

## 3. 파일로 주기 (게임에 넣는 형식)
- PNG, 배경 투명, 위 캔버스 크기 그대로.
- **한 줄 = 한 방향, 한 칸 = 한 장면.** 줄 순서: 앞 → 앞옆 → 옆 → 뒤옆 → 뒤.
- 첫 시험 파일 이름: `test_boy.png`, `test_grass.png`, `test_hound.png` → 대화창에 올리면 Claude가 시험 화면에 넣음.

## 4. 프롬프트 쓰는 요령
- AI 도구는 **영어 프롬프트**가 더 잘 알아들음. 아래 **[공통 스타일]** 문장을 매번 맨 뒤에 붙여야 그림끼리 느낌이 맞음.
- 일반 AI(ChatGPT 이미지 등)는 "가짜 픽셀"(크기가 들쭉날쭉한 점)로 그리기 쉬움 → 크게 뽑은 뒤 픽셀 툴에서 목표 크기로 줄이고(최근접 이웃 방식) 색 수를 줄여 정리.
- 픽셀 전용 AI(PixelLab, Retro Diffusion 등)는 크기·방향을 직접 정할 수 있어 더 편함.
- 마음에 드는 그림이 나오면 그 그림을 **참고 이미지로 같이 넣고** 다음 그림(다른 방향·동작)을 뽑으면 얼굴·옷이 덜 바뀜.

### [공통 스타일]
```
pixel art game sprite, 3/4 top-down view like Stardew Valley and Drova, dark gritty medieval fantasy, muted desaturated earthy palette, soft light from the top-left, 1px very dark brown outline, crisp pixels, no anti-aliasing, transparent background
```

## 5. 첫 시험 프롬프트 (소년 · 바닥 · 들개)

### ① 소년 (주인공) — 서 있기 3방향 → 걷기
```
A 14-year-old boy from a poor frontier village, thin, messy short brown hair, tired but stubborn eyes, worn moss-green wool tunic with a rope belt, patched dark brown trousers, scuffed leather boots, holding a small woodcutter's hatchet in his right hand. Character turnaround sheet: front view, side view facing right, back view, standing idle pose, full body, about 64 pixels tall, evenly spaced on one row.
+ [공통 스타일]
```
걷기(서 있기가 마음에 들면, 그 그림을 참고로 넣고):
```
Same boy as the reference image. 4-frame walk cycle, side view facing right, one row, same size and colors.
+ [공통 스타일]
```

### ② 바닥 타일
```
Seamless tileable ground texture seen from above, 64x64 pixels, dark grass at the edge of an old forest, a few small dirt patches, tiny pebbles and dry grass blades, uneven natural tones, no lighting gradient, no border, must tile perfectly on all four sides.
+ pixel art, dark gritty medieval fantasy, muted desaturated earthy palette, crisp pixels, no anti-aliasing
```

### ③ 들개 (뒤틀린 들짐승)
```
A starving feral hound slowly twisted by a dark corruption: matted patchy brown fur, visible ribs, one torn ear, cloudy yellow eyes, bared yellowed teeth, thin scarred legs. Side view facing right, two poses on one row: standing idle, and mid-run. Body about 70 pixels long.
+ [공통 스타일]
```

## 6. 앞으로 필요한 동작 목록 (초안 — 시험 뒤 늘림)
- 소년: 서 있기·걷기·뛰기·전력질주·웅크림·구르기·공격(한손·양손)·맞음·넘어짐·쓰러짐·줍기·**연출용**(웃기·울기·토하기·무릎 꿇기·끌려가기·장난스러운 춤)
- 얼굴(대화창용): 보통·웃음·화남·슬픔·놀람·겁먹음
