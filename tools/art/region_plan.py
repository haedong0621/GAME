"""
첫 지역 설계도 (그림) — docs/maps/region1_plan.png
기획 단계용 개략도: 지역 배치·길·물길·높낮이·이야기 지점. 실제 맵(Tiled)은 이걸 보고 칠한다.
실행: python3 tools/art/region_plan.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os, random

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '..', '..', 'docs', 'maps', 'region1_plan.png')
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
TW, TH, S = 100, 70, 9           # 맵 100×70칸 (지금 맵의 약 3배), 1칸 = 9px
W, H = TW * S, TH * S
LEG = 330
f_big = ImageFont.truetype(FONT, 15); f_mid = ImageFont.truetype(FONT, 12); f_sm = ImageFont.truetype(FONT, 11)
rnd = random.Random(4)

img = Image.new('RGB', (W + LEG, H + 40), (24, 22, 20))
d = ImageDraw.Draw(img)

def blob(cx, cy, rx, ry, seed, n=28, wob=0.22):
    r = random.Random(seed)
    k = [r.uniform(0, 6.28) for _ in range(3)]
    pts = []
    for i in range(n):
        a = i / n * math.tau
        w = 1 + wob * (math.sin(a * 2 + k[0]) * 0.6 + math.sin(a * 3 + k[1]) * 0.4)
        pts.append(((cx + math.cos(a) * rx * w) * S, (cy + math.sin(a) * ry * w) * S))
    return pts

# 바탕: 들머리 풀밭
d.rectangle([0, 0, W, H], fill=(70, 98, 56))
REG = {  # 지역 (지역 번호: 1 마른 들판 2 늪지 3 숲 4 사냥꾼의 들판 5 바위 언덕)
    'forest': ((16, 36, 16, 16), (42, 60, 40), '늙은참나무 숲'),
    'hunter': ((34, 11, 20, 10), (92, 108, 62), '사냥꾼의 들판'),
    'rocky_n': ((60, 8, 12, 7), (110, 108, 96), '바위 언덕'),
    'dry': ((76, 30, 18, 12), (122, 118, 70), '마른 들판'),
    'swamp': ((84, 58, 16, 12), (66, 72, 50), '늪지'),
    'rocky_w': ((9, 9, 8, 7), (108, 106, 94), ''),
}
for i, (k, ((cx, cy, rx, ry), col, _)) in enumerate(REG.items()):
    d.polygon(blob(cx, cy, rx, ry, i + 1), fill=col)
img = img.filter(ImageFilter.GaussianBlur(1.2)); d = ImageDraw.Draw(img)

# 물길: 북동에서 내려와 남쪽으로 (갈대나루에서 건넘)
river = [(64, 0), (63, 8), (66, 16), (68, 24), (64, 32), (56, 40), (52, 48), (55, 56), (60, 64), (62, 70)]
d.line([(x * S, y * S) for x, y in river], fill=(56, 92, 120), width=int(2.4 * S), joint='curve')
d.line([(x * S, y * S) for x, y in river], fill=(90, 130, 150), width=int(0.6 * S), joint='curve')
# 연못 (늪)
d.polygon(blob(88, 62, 6, 4, 9), fill=(52, 76, 84))

# 높낮이: 절벽(굵은 갈색) / 비탈(점선 연두)
def cliff(pts, col=(92, 64, 40)):
    d.line([(x * S, y * S) for x, y in pts], fill=col, width=5, joint='curve')
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):   # 아래쪽 벽면 표시 (빗금)
        n = int(math.hypot(x1 - x0, y1 - y0) * 1.5)
        for t in range(n):
            px, py = (x0 + (x1 - x0) * t / n) * S, (y0 + (y1 - y0) * t / n) * S
            d.line([px, py, px - 2, py + 7], fill=(60, 44, 30), width=1)
def slope(pts):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = int(math.hypot(x1 - x0, y1 - y0))
        for t in range(0, n, 2):
            a = (x0 + (x1 - x0) * t / n) * S, (y0 + (y1 - y0) * t / n) * S
            b = (x0 + (x1 - x0) * (t + 1) / n) * S, (y0 + (y1 - y0) * (t + 1) / n) * S
            d.line([a, b], fill=(170, 200, 120), width=3)
# 북쪽 사냥터 고원: 남쪽은 절벽(협곡), 동쪽은 비탈
cliff([(14, 20), (22, 22), (30, 21), (40, 23), (48, 21)])
slope([(48, 21), (53, 17), (54, 11)])
# 협곡 위 쓰러진 거대 나무 다리
d.line([(29 * S, 19 * S), (31 * S, 26 * S)], fill=(120, 84, 50), width=7); d.line([(29 * S, 19 * S), (31 * S, 26 * S)], fill=(150, 110, 70), width=2)
# 북서 바위 절벽 위 무너진 제단 (덩굴로만)
cliff([(3, 14), (9, 16), (15, 14)])
d.line([(8 * S, 16 * S), (8 * S, 18 * S)], fill=(80, 140, 60), width=4)
# 토브의 베이스캠프 고원 (강가, 남쪽 비탈로 오름, 북쪽 절벽)
d.polygon(blob(44, 46, 6, 4, 21, wob=0.12), fill=(96, 118, 70))
cliff([(38, 43), (44, 41), (50, 43)])
slope([(39, 50), (44, 51), (49, 50)])
# 감시탑 언덕
slope([(52, 12), (56, 14), (64, 13)])

# 길 (흙길)
ROADS = [
    [(14, 58), (20, 52), (22, 44), (18, 36), (12, 32)],                 # 고향 마을 → 숲 깊은 곳
    [(14, 58), (26, 60), (36, 56), (42, 52), (44, 48)],                 # 고향 마을 → 베이스캠프 (비탈)
    [(44, 48), (50, 49), (56, 49), (62, 40), (66, 32), (70, 26)],       # 베이스캠프 → 다리 → 갈대나루 (강 동쪽 따라)
    [(70, 26), (66, 16), (60, 10)],                                     # 갈대나루 → 감시탑
    [(70, 26), (80, 36), (84, 48), (84, 54)],                           # 갈대나루 → 늪
    [(46, 38), (48, 30), (52, 22)],                                     # 베이스캠프 북쪽 → 사냥터 비탈 (강 서쪽)
    [(70, 26), (84, 18), (90, 12)],                                     # 갈대나루 → 도적 캠프
]
for r in ROADS:
    d.line([(x * S, y * S) for x, y in r], fill=(132, 108, 76), width=6, joint='curve')
    d.line([(x * S, y * S) for x, y in r], fill=(156, 130, 92), width=2, joint='curve')
# 다리: 갈대나루 다리, 물레방앗간 앞 다리
d.rectangle([66 * S, 25 * S, 71 * S, 27 * S], fill=(110, 80, 52), outline=(60, 44, 30))
d.rectangle([51 * S, 48 * S, 55 * S, 50 * S], fill=(110, 80, 52), outline=(60, 44, 30))

# 지점 (이야기 순서 번호 / 장소)
POI = [
    (14, 58, '①', '솔밭골 (고향 마을)', (230, 200, 120), '시작 · 나중엔 잿더미 (트롤 습격 ④)'),
    (20, 46, '②', '숲길', (200, 230, 150), '나무 패기·줍기 튜토리얼'),
    (11, 32, '③', '숲 깊은 곳', (240, 120, 100), '아버지 · 다친 뒤틀린 멧돼지 (회피 튜토리얼)'),
    (44, 46, '⑤', '버려진 물레방앗간', (255, 220, 120), '토브의 베이스캠프 = 거점 (저장·제작·쉬기·모닥불 대화)'),
    (70, 26, '⑥', '갈대나루 (피난민 마을)', (255, 220, 120), '퀘스트 2~3 · 상인 · ⑧ 마지막에 불탐'),
    (36, 10, 'B', '뒤엉킨 사냥꾼', (240, 120, 100), '보스 (사냥꾼의 들판)'),
    (24, 30, 'B', '뒤틀린 멧돼지 (성체)', (240, 120, 100), '보스 (숲 서식지 — 프롤로그의 그 종류)'),
    (86, 60, 'B', '늪지 짐승', (240, 120, 100), '보스 (선택 · 지금 보스 재활용)'),
    (8, 10, '?', '무너진 제단', (200, 160, 255), '광신도 흔적 — 덩굴 절벽으로만 (숨은 곳)'),
    (60, 9, '▲', '무너진 감시탑', (220, 220, 220), '랜드마크 · 지역이 한눈에 보이는 언덕'),
    (30, 22, '=', '쓰러진 거대 나무', (220, 220, 220), '협곡을 건너는 다리 (랜드마크)'),
    (90, 12, 'X', '도적 캠프', (255, 150, 120), '선택 퀘스트 (사람 적 — 시스템은 나중에)'),
]
for x, y, mark, name, col, _ in POI:
    cx, cy = x * S, y * S
    d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(20, 18, 16), outline=col, width=2)
    d.text((cx, cy), mark, font=f_mid, fill=col, anchor='mm')
    d.text((cx + 12, cy - 8), name, font=f_sm, fill=(245, 238, 220), stroke_width=2, stroke_fill=(20, 18, 16))
# 지역 이름
for k, ((cx, cy, rx, ry), col, nm) in REG.items():
    if nm: d.text((cx * S, (cy + ry * 0.55) * S), nm, font=f_mid, fill=(255, 255, 240, 160), anchor='mm', stroke_width=2, stroke_fill=(30, 30, 26))
d.text((30 * S, 64 * S), '들머리 풀밭', font=f_mid, fill=(240, 240, 220), anchor='mm', stroke_width=2, stroke_fill=(30, 30, 26))

# 테두리·제목
d.rectangle([0, 0, W - 1, H - 1], outline=(160, 140, 100), width=2)
d.text((8, H + 10), '첫 지역 설계도 (개략) — 100×70칸 (지금 맵의 약 3배), 1칸 = 32px', font=f_mid, fill=(220, 210, 180))

# 범례·이야기 흐름 (오른쪽)
x0 = W + 16; y = 12
d.text((x0, y), '이야기 흐름', font=f_big, fill=(232, 200, 96)); y += 26
for line in ['① 솔밭골에서 시작 (이동·대화)', '② 숲길: 나무 패기·줍기', '③ 숲 깊은 곳: 아버지, 다친 멧돼지', '    → 회피·완벽한 회피 → 유품(도끼)',
             '④ 솔밭골로 질주 → 트롤 습격 · 강제 패배', '⑤ 토브가 물레방앗간 캠프로 데려감 (거점)',
             '⑥ 갈대나루: 퀘스트 2~3, 들판·보스 사냥', '    토브와 동료로 다니며 정 쌓기',
             '⑦ 광신도 흔적 발견 (무너진 제단 등)', '⑧ 갈대나루가 불탐 — 광신도가 트롤을 몰고 옴', '    → 토브가 막아섬 · "살아라" → 1막 끝']:
    d.text((x0, y), line, font=f_sm, fill=(230, 224, 206)); y += 17
y += 10
d.text((x0, y), '범례', font=f_big, fill=(232, 200, 96)); y += 24
legend = [((132, 108, 76), '길'), ((56, 92, 120), '물길·연못'), ((92, 64, 40), '절벽 (막힘)'), ((170, 200, 120), '비탈 (어디로든 오르내림)'),
          ((80, 140, 60), '덩굴 (절벽 오르기)'), ((255, 220, 120), '마을·거점'), ((240, 120, 100), '보스·위험'), ((200, 160, 255), '숨은 곳·이야기 실마리')]
for col, nm in legend:
    d.rectangle([x0, y + 2, x0 + 14, y + 12], fill=col); d.text((x0 + 22, y), nm, font=f_sm, fill=(230, 224, 206)); y += 18
y += 10
d.text((x0, y), '지역 구성 (지역 번호)', font=f_big, fill=(232, 200, 96)); y += 24
for line in ['0 들머리 풀밭 — 가운데 들판, 채집', '3 늙은참나무 숲 — 서쪽, 침엽수·버섯', '4 사냥꾼의 들판 — 북쪽 고원 (협곡 절벽)',
             '5 바위 언덕 — 감시탑·제단, 채광', '1 마른 들판 — 갈대나루 둘레, 들개', '2 늪지 — 남동쪽, 선택 보스']:
    d.text((x0, y), line, font=f_sm, fill=(230, 224, 206)); y += 17
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print('saved', OUT, img.size)
