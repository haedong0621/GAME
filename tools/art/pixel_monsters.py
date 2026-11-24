"""
몬스터 도트 생성기 — 네 발 짐승 관절 뼈대 (3/4 탑뷰, 5방향 그림 + 뒤집기 = 8방향).

- 등뼈(엉덩이→어깨) + 목·머리(턱) + 꼬리 + 다리 4개(관절 2개, 발 목표 → 무릎 자동 굽힘).
- 몸통은 등뼈를 따라 크기가 다른 원을 이어 그림 (아래 어둡게, 위 밝게), 머리는 원 + 주둥이.
- 종류별 장식: 늪지 짐승 = 등뼈 판, 꼬리 가시, 송곳니, 노란 눈 / 들개 = 뾰족 귀, 앙상한 갈비.
- 자세 = 몸 낮추기·앞 들기(뒷발 서기)·내딛기·머리 숙이기·턱 벌리기·발 위치·꼬리.
- 결과: assets/characters/mon_<종류>.png + mon_px.json

실행: python3 tools/art/pixel_monsters.py
Godot: AnimatedSprite2D + SpriteFrames("동작_방향") + flip_h.
"""
from PIL import Image, ImageDraw
import json, math, os

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, '..', '..', 'assets', 'characters')
SQUASH = 0.7
VIEWS = ['down', 'downside', 'side', 'upside', 'up']
FACE = {'down': (0, 1), 'downside': (0.7071, 0.7071), 'side': (1, 0), 'upside': (0.7071, -0.7071), 'up': (0, -1)}
OUTLINE = (24, 20, 18)

# ---------------- 종류 ----------------
SPECS = {
 'hound': {
  'frame': 48, 'footY': 38,
  'spine': 11, 'hipZ': 7, 'shZ': 8, 'legX': 2.5, 'leg': (3.6, 3.8), 'legW': 2,
  'body': [(3.0, 0.0), (3.4, 0.35), (3.8, 0.7), (3.4, 1.0)],     # (반지름, 엉덩이→어깨 비율)
  'neck': (2.5, 1.5), 'head': 2.8, 'snout': (3.4, 1.4), 'tail': 7, 'tailW': 2,
  'col': {'base': (100, 78, 58), 'dark': (68, 52, 40), 'light': (134, 108, 80), 'leg': (82, 64, 48),
          'eye': (226, 196, 80), 'teeth': (230, 222, 200), 'mouth': (90, 30, 28)},
  'ears': True, 'ribs': True,
 },
 'swamp': {
  'frame': 128, 'footY': 100,
  'spine': 36, 'hipZ': 17, 'shZ': 20, 'legX': 9, 'leg': (9.5, 10.0), 'legW': 7,
  'body': [(12.0, 0.0), (14.0, 0.3), (15.5, 0.62), (14.0, 0.95)],
  'neck': (6.5, 4.5), 'head': 8.5, 'snout': (9.5, 4.8), 'tail': 24, 'tailW': 7,
  'col': {'base': (60, 72, 42), 'dark': (40, 49, 28), 'light': (84, 99, 58), 'leg': (48, 58, 33),
          'eye': (216, 228, 106), 'teeth': (232, 220, 184), 'mouth': (92, 34, 30), 'bone': (201, 189, 152), 'boneDark': (150, 140, 110)},
  'plates': True, 'fangs': True, 'tailSpikes': True, 'poseScale': 1.45,
 },
 # 프롤로그 보스: 아버지와 싸워 크게 다친 뒤틀린 멧돼지 — 앞이 솟은 등(혹), 짧은 다리, 휘어 오른 엄니, 등갈기,
 # 어깨를 뚫고 나온 뼈 가시(뒤틀림), 붉은 눈, 피 흘리는 상처, 옆구리에 박힌 아버지의 도끼
 'boar': {
  'frame': 112, 'footY': 88,
  'spine': 31, 'hipZ': 13, 'shZ': 19, 'legX': 7.5, 'leg': (7.2, 7.2), 'legW': 5,
  'body': [(10.5, 0.0), (12.5, 0.35), (15.0, 0.72), (13.0, 0.98)],
  'neck': (4.0, 0.8), 'head': 9.2, 'snout': (8.6, 4.2), 'tail': 8, 'tailW': 3,
  'col': {'base': (88, 66, 54), 'dark': (58, 42, 36), 'light': (122, 94, 74), 'leg': (66, 50, 40),
          'eye': (240, 70, 50), 'teeth': (236, 226, 200), 'mouth': (100, 30, 28), 'bone': (214, 200, 164), 'boneDark': (156, 142, 110),
          'blood': (142, 26, 26), 'bloodL': (190, 48, 40), 'wood': (104, 70, 40), 'iron': (196, 194, 186)},
  'bristles': True, 'tusks': True, 'spurs': True, 'wounds': True, 'axeStuck': True, 'poseScale': 1.5,
 },
}

def P(**k):
    base = dict(crouch=0, pitch=0, lunge=0, head=0, jaw=0, tail=0, bob=0,
                fl=(0, 0, 0), fr=(0, 0, 0), bl=(0, 0, 0), br=(0, 0, 0), roll=0, flat=False)
    base.update(k)
    return base

RUN = [P(fl=(0, 3, 1), fr=(0, 1, 0), bl=(0, -1, 0), br=(0, -3, 1), bob=0, tail=-10),
       P(fl=(0, 1, 0), fr=(0, 3, 1), bl=(0, -3, 1), br=(0, -1, 0), bob=-1, tail=0),
       P(fl=(0, -2, 1), fr=(0, -1, 0), bl=(0, 2, 0), br=(0, 3, 1), bob=0, tail=10),
       P(fl=(0, -1, 0), fr=(0, -2, 1), bl=(0, 3, 1), br=(0, 2, 0), bob=-1, tail=0)]

ANIMS = {
 'hound': {
  'idle': [P(tail=-8), P(bob=1, head=1, tail=8)],
  'run': RUN,
  # 물기: 웅크려 노림 → 더 낮게 → 덮치며 입 벌림 → 회복
  'bite': [P(crouch=2, head=2, lunge=-1, tail=20, fl=(0, -1, 0), fr=(0, -1, 0)),
           P(crouch=3, head=3, lunge=-2, tail=25, fl=(0, -1, 0), fr=(0, -1, 0)),
           P(pitch=12, lunge=4, jaw=1, tail=-15, fl=(0, 4, 2), fr=(0, 4, 2), bl=(0, -2, 0), br=(0, -2, 0)),
           P(crouch=1, lunge=2, head=1, tail=0)],
  'hurt': [P(pitch=8, lunge=-2, head=-1, tail=30), P(crouch=1, lunge=-1, tail=15)],
  'stagger': [P(crouch=1, head=2, roll=8, tail=25), P(crouch=1, head=2, roll=-8, tail=-25)],
  'death': [P(crouch=2, head=2, roll=15), P(crouch=4, head=3, roll=40), P(flat=True)],
 },
 'boar': {
  # 다친 몸: 숨을 몰아쉬며 고개를 숙임
  'idle': [P(head=1, tail=-6), P(bob=1, head=2, crouch=1, tail=6)],
  'walk': [P(fl=(0, 3, 2), br=(0, -2, 0), bl=(0, 1, 0), fr=(0, -1, 0), head=1, tail=-8),
           P(fl=(0, 1, 0), fr=(0, 0, 1), bob=-1, head=1, tail=0),
           P(fr=(0, 3, 2), bl=(0, -2, 0), br=(0, 1, 0), fl=(0, -1, 0), head=1, tail=8),
           P(fr=(0, 1, 0), fl=(0, 0, 1), bob=-1, head=1, tail=0)],
  'roar': [P(pitch=8, head=-3, jaw=2, tail=20), P(pitch=10, head=-4, jaw=2, bob=-1, tail=-20)],
  # 엄니 휘두르기: 고개 낮춰 옆으로 비틂 → 쳐올림 → 회복
  'gore': [P(crouch=2, head=4, lunge=-1, roll=-6, tail=15),
           P(crouch=3, head=5, lunge=-2, roll=-10, tail=20),
           P(pitch=10, head=-3, lunge=4, roll=10, jaw=1, fl=(0, 3, 2), tail=-15),
           P(lunge=2, head=1, tail=0)],
  # 돌진: 앞발로 땅 긁기 → 질주 → 미끄러지며 멈춤
  'charge': [P(crouch=2, head=4, lunge=-2, fr=(0, -3, 2), tail=30),
             P(crouch=3, head=5, lunge=-3, fr=(0, -4, 0), fl=(0, 1, 1), tail=35)]
            + [dict(r, lunge=2, head=4, crouch=1) for r in RUN]
            + [P(pitch=6, lunge=1, crouch=2, head=2, fl=(0, 3, 0), fr=(0, 3, 0), tail=-10)],
  'stagger': [P(crouch=3, head=4, roll=10, jaw=1, tail=25), P(crouch=3, head=4, roll=-10, jaw=1, tail=-25)],
  'death': [P(crouch=3, head=4, jaw=1, roll=12), P(crouch=6, head=5, jaw=2, roll=35), P(flat=True, jaw=1)],
 },
 'swamp': {
  'idle': [P(tail=-6), P(bob=1, head=1, tail=6)],
  'walk': [P(fl=(0, 4, 2), br=(0, -3, 0), bl=(0, 1, 0), fr=(0, -1, 0), tail=-8),
           P(fl=(0, 2, 0), fr=(0, 0, 1), bob=-1, tail=0),
           P(fr=(0, 4, 2), bl=(0, -3, 0), br=(0, 1, 0), fl=(0, -1, 0), tail=8),
           P(fr=(0, 2, 0), fl=(0, 0, 1), bob=-1, tail=0)],
  # 포효: 머리 들고 입 크게
  'roar': [P(pitch=10, head=-3, jaw=2, tail=20), P(pitch=12, head=-4, jaw=2, bob=-1, tail=-20)],
  # 할퀴기: 앞발 들어 뒤로 젖힘 → 할퀴며 내딛음 → 회복
  'swipe': [P(pitch=10, lunge=-2, head=-1, fr=(2, 1, 8), tail=15),
            P(pitch=14, lunge=-3, head=-1, fr=(3, -1, 10), tail=20),
            P(pitch=-4, lunge=4, jaw=1, head=2, fr=(-1, 8, 1), tail=-15),
            P(lunge=2, head=1, fr=(0, 5, 0), tail=0)],
  # 몸통 내려찍기: 뒷발로 일어섬 → 최고점 → 쾅 → 웅크린 채 회복 (예고가 크게 보이도록)
  'slam': [P(pitch=22, lunge=-2, head=-2, jaw=1, fl=(0, 3, 6), fr=(0, 3, 6), tail=25),
           P(pitch=38, lunge=-3, head=-3, jaw=2, fl=(0, 3, 12), fr=(0, 3, 12), bob=-2, tail=35),
           P(pitch=-6, crouch=3, lunge=3, head=3, jaw=1, fl=(-1, 6, 0), fr=(1, 6, 0), tail=-20),
           P(crouch=2, lunge=2, head=2, fl=(0, 5, 0), fr=(0, 5, 0), tail=-5)],
  # 돌진: 웅크려 땅 긁기 → 질주 → 미끄러지며 멈춤
  'charge': [P(crouch=3, head=3, lunge=-2, jaw=1, fr=(0, -2, 1), tail=30),
             P(crouch=4, head=4, lunge=-3, jaw=1, fr=(0, -4, 0), fl=(0, 1, 1), tail=35)]
            + [dict(r, lunge=2, head=2, crouch=1, jaw=1) for r in RUN]
            + [P(pitch=8, lunge=1, crouch=2, head=1, fl=(0, 4, 0), fr=(0, 4, 0), bl=(0, 1, 0), br=(0, 1, 0), tail=-10)],
  'stagger': [P(crouch=2, head=3, roll=6, jaw=1, tail=25), P(crouch=2, head=3, roll=-6, jaw=1, tail=-25)],
  'death': [P(crouch=2, head=3, jaw=1, roll=10), P(crouch=6, head=4, jaw=2, roll=30), P(flat=True, jaw=1)],
 },
}

# ---------------- 수학·그리기 ----------------
def rot2(v, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)

def ik(root, target, l1, l2, pole):
    d = [target[i] - root[i] for i in range(3)]
    L = math.sqrt(sum(x * x for x in d)) or 1e-6
    dist = max(abs(l1 - l2) + 0.05, min(L, l1 + l2 - 0.05))
    dn = [x / L for x in d]
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0, l1 * l1 - a * a))
    dot = sum(pole[i] * dn[i] for i in range(3))
    pp = [pole[i] - dn[i] * dot for i in range(3)]
    pl = math.sqrt(sum(x * x for x in pp)) or 1
    pn = [x / pl for x in pp]
    joint = tuple(root[i] + dn[i] * a + pn[i] * h for i in range(3))
    end = tuple(root[i] + dn[i] * dist for i in range(3))
    return joint, end

class Canvas:
    def __init__(self, F):
        self.F = F
        self.img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def circle(self, x, y, r, c):
        r = max(0.6, r)
        self.d.ellipse([round(x - r), round(y - r * 0.9), round(x + r), round(y + r * 0.9)], fill=c + (255,))

    def line(self, x0, y0, x1, y1, c, w):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            self.circle(x, y, w / 2, c)

    def tri(self, pts, c):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=c + (255,))

    def px(self, x, y, c):
        x, y = round(x), round(y)
        if 0 <= x < self.F and 0 <= y < self.F:
            self.img.putpixel((x, y), c + (255,))

def shade(c, k): return tuple(max(0, min(255, int(v * k))) for v in c)

def scale_pose(pose, k):
    if k == 1: return pose
    q = dict(pose)
    for key in ('crouch', 'lunge', 'head', 'bob'):
        q[key] = pose[key] * k
    for key in ('fl', 'fr', 'bl', 'br'):
        q[key] = tuple(v * k for v in pose[key])
    return q

def draw(kind, view, pose):
    S = SPECS[kind]; C = S['col']; F = S['frame']; CX = F // 2; FY = S['footY']
    pose = scale_pose(pose, S.get('poseScale', 1))
    cv = Canvas(F)
    Fv = FACE[view]; R = (-Fv[1], Fv[0])
    def ground(x, y): return (R[0] * x + Fv[0] * y, R[1] * x + Fv[1] * y)
    def scr(p):
        g = ground(p[0], p[1])
        return (CX + g[0], FY + pose['bob'] + g[1] * SQUASH - p[2])
    def depth(p): return ground(p[0], p[1])[1]

    L = S['spine']
    hip = (0, -L / 2 + pose['lunge'], S['hipZ'] - pose['crouch'])
    # 앞 들기(pitch): 엉덩이를 축으로 어깨를 위로
    pr = math.radians(pose['pitch'])
    sh = (0, hip[1] + L * math.cos(pr), S['hipZ'] - pose['crouch'] + (S['shZ'] - S['hipZ']) + L * math.sin(pr))
    def spine(t):  # 엉덩이(0) → 어깨(1)
        return (0, hip[1] + (sh[1] - hip[1]) * t, hip[2] + (sh[2] - hip[2]) * t)
    roll = math.radians(pose['roll'])
    nk_len, nk_up = S['neck']
    head = (0, sh[1] + nk_len, sh[2] + nk_up - pose['head'])
    hd_dir = (0, 1, -0.15 - pose['head'] * 0.08)
    sn_len, sn_r = S['snout']
    snout = (0, head[1] + sn_len * 0.8, head[2] - 0.6 - pose['head'] * 0.3)
    tail_base = spine(-0.05)
    ta = math.radians(pose['tail'])
    tail_tip = (math.sin(ta) * S['tail'], tail_base[1] - math.cos(ta) * S['tail'] * 0.8, tail_base[2] + 2)

    prims = []  # (깊이, 함수)
    lx = S['legX']
    legs = []
    for name, side, base, off in (('fl', -1, sh, pose['fl']), ('fr', 1, sh, pose['fr']), ('bl', -1, hip, pose['bl']), ('br', 1, hip, pose['br'])):
        root = (side * lx, base[1], base[2] - 1)
        foot = (side * lx + off[0], base[1] + off[1], off[2])
        front = name[0] == 'f'
        knee, foot = ik(root, foot, S['leg'][0], S['leg'][1], (0, -1 if front else 1, 0.3))
        legs.append((name, root, knee, foot))
    body_d = depth(spine(0.5))
    for name, root, knee, foot in legs:
        far = depth(knee) < body_d - 0.3 if view not in ('down', 'up') else (name[1] == 'l' if view == 'down' else name[1] == 'r')
        k = 0.78 if far else 1.0
        r_s, k_s, f_s = scr(root), scr(knee), scr(foot)
        def fn(r_s=r_s, k_s=k_s, f_s=f_s, k=k):
            cv.line(*r_s, *k_s, shade(C['leg'], k), S['legW'] + 1)
            cv.line(*k_s, *f_s, shade(C['leg'], k * 0.9), S['legW'])
            cv.circle(f_s[0], f_s[1], S['legW'] * 0.6, shade(C['dark'], k))
        prims.append((depth(foot) + (-50 if far else 50), fn))

    # 몸통: 원들을 이음 (어두운 아래 → 기본 → 밝은 등)
    def body_fn():
        pts = [(scr(spine(t)), r) for r, t in S['body']]
        for (x, y), r in pts: cv.circle(x, y + 1.2, r, C['dark'])
        for i in range(len(pts) - 1):
            (x0, y0), r0 = pts[i]; (x1, y1), r1 = pts[i + 1]
            for j in range(5):
                u = j / 5
                cv.circle(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, r0 + (r1 - r0) * u, C['base'])
        cv.circle(*pts[-1][0], pts[-1][1], C['base'])
        for (x, y), r in pts: cv.circle(x - r * 0.15, y - r * 0.45, r * 0.55, C['light'])
        if S.get('ribs') and view not in ('up',):
            mx, my = scr(spine(0.55))
            for i in range(-1, 2): cv.px(mx + i * 1.5, my + 1, shade(C['light'], 1.1))
        if S.get('plates'):
            k = S['spine'] / 24
            for t, h in ((0.2, 5 * k), (0.45, 7 * k), (0.7, 6 * k), (0.9, 4 * k)):
                x, y = scr(spine(t)); r = [rr for rr, tt in S['body']][1]
                top = y - r * 0.75
                cv.tri([(x - 2.5 * k, top + 1), (x + 0.5, top - h), (x + 2.5 * k, top + 1)], C['bone'])
                cv.px(x + 0.5, top - h + 2, C['boneDark'])
        if S.get('bristles'):
            # 등갈기: 어깨 혹 쪽으로 갈수록 길고 뻣뻣한 털
            k = S['spine'] / 22
            for i in range(12):
                t = 0.12 + i * 0.075
                x, y = scr(spine(min(t, 1.0))); r = [rr for rr, tt in S['body']][2]
                h = (2 + 3.5 * t) * k
                top = y - r * 0.8
                cv.tri([(x - 1.5 * k, top + 1), (x + 0.5 - t * 2, top - h), (x + 1.5 * k, top + 1)], C['dark'])
        if S.get('spurs'):
            # 뒤틀림: 어깨 혹을 뚫고 나온 뼈 가시 셋
            k = S['spine'] / 22
            for t, dx, h in ((0.74, -4, 6), (0.84, 3, 8), (0.62, 5, 4)):
                x, y = scr(spine(t)); r = [rr for rr, tt in S['body']][2]
                top = y - r * 0.55
                dx, h = dx * k, h * k
                cv.tri([(x + dx - 1.5 * k, top + 1), (x + dx + 1.5, top - h), (x + dx + 1.5 * k, top + 1)], C['bone'])
                cv.px(x + dx + 0.5, top - h + 3, C['boneDark'])
        if S.get('wounds') and view != 'up':
            # 아버지와 싸운 상처: 피 흘리는 베인 자국
            k = S['spine'] / 22
            for t, ox, oy, ln in ((0.3, -3, 1, 4), (0.55, 2, -1, 5), (0.8, -1, 2, 3)):
                x, y = scr(spine(t)); ox, oy, ln = ox * k, oy * k, ln * k
                cv.line(x + ox, y + oy, x + ox + ln, y + oy - ln * 0.4, C['blood'], 2)
                cv.px(x + ox + 1, y + oy, C['bloodL'])
                cv.line(x + ox + 1, y + oy + 1, x + ox + 1, y + oy + 3, C['blood'], 1)   # 흘러내림
    prims.append((body_d, body_fn))
    if S.get('axeStuck'):
        # 옆구리(오른쪽)에 박힌 도끼: 자루가 밖으로 비스듬히 위로
        r = [rr for rr, tt in S['body']][1]
        base3 = spine(0.42); base3 = (r * 0.75, base3[1], base3[2])
        end3 = (base3[0] + 9, base3[1] - 4, base3[2] + 11)
        def axe_fn(b=scr(base3), e=scr(end3)):
            cv.line(*b, *e, C['wood'], 3)
            cv.px(e[0], e[1], shade(C['wood'], 1.3))
            cv.line(b[0] - 2, b[1] + 1, b[0] + 2, b[1] - 1, C['iron'], 1)          # 살 속에 묻힌 날 끝
            cv.px(b[0] - 1, b[1] + 2, C['blood']); cv.px(b[0] + 1, b[1] + 2, C['blood'])
        prims.append((depth(base3) + 0.5 if depth(base3) > body_d - 0.5 else body_d - 1, axe_fn))

    # 꼬리
    tb, tt = scr(tail_base), scr(tail_tip)
    def tail_fn():
        cv.line(*tb, *tt, C['dark'], S['tailW'])
        cv.line(tb[0], tb[1] - 0.5, (tb[0] + tt[0]) / 2, (tb[1] + tt[1]) / 2 - 0.5, C['base'], max(1, S['tailW'] - 1))
        if S.get('tailSpikes'):
            for u in (0.35, 0.65, 0.9):
                x, y = tb[0] + (tt[0] - tb[0]) * u, tb[1] + (tt[1] - tb[1]) * u
                cv.tri([(x - 2, y), (x, y - 6), (x + 2, y)], C['bone'])
    prims.append((depth(tail_tip) * 0.5 + depth(tail_base) * 0.5 - 0.2, tail_fn))

    # 목·머리·주둥이
    sh_s, hd_s, sn_s = scr(sh), scr(head), scr(snout)
    def head_fn():
        cv.line(*sh_s, *hd_s, C['base'], nk_len * 0.9 + 1)
        cv.circle(hd_s[0], hd_s[1] + 1, S['head'], C['dark'])
        cv.circle(*hd_s, S['head'], C['base'])
        cv.circle(hd_s[0] - S['head'] * 0.2, hd_s[1] - S['head'] * 0.4, S['head'] * 0.5, C['light'])
        if S.get('ears'):
            g = ground(1, 0)
            for s in (-1, 1):
                ex, ey = hd_s[0] + g[0] * s * 1.6, hd_s[1] - S['head'] * 0.6 + g[1] * s * 1.2
                cv.tri([(ex - 1, ey + 1), (ex, ey - 3), (ex + 1, ey + 1)], C['dark'])
        if view != 'up':
            # 주둥이 (턱 벌림)
            cv.line(*hd_s, *sn_s, C['base'], sn_r * 2)
            cv.circle(sn_s[0], sn_s[1], sn_r * 0.7, C['light'])
            if pose['jaw']:
                jw = pose['jaw'] * (1 if S['frame'] < 60 else 1.6)
                cv.line(hd_s[0], hd_s[1] + 1, sn_s[0], sn_s[1] + 1 + jw, C['mouth'], max(1, sn_r))
                cv.line(hd_s[0], hd_s[1] + 2 + jw * 0.5, sn_s[0], sn_s[1] + 2 + jw, C['dark'], max(1, sn_r * 0.8))
            # 이빨
            g = ground(1, 0)
            for s in (-1, 1):
                tx, ty = sn_s[0] + g[0] * s * sn_r * 0.6, sn_s[1] + 1
                if S.get('tusks'):
                    # 휘어 오른 엄니: 주둥이 옆에서 위로
                    cv.line(tx + g[0] * s, ty, tx + g[0] * s * 3, ty - 5, C['teeth'], 2)
                    cv.line(tx + g[0] * s * 3, ty - 5, tx + g[0] * s * 3.4, ty - 7, C['teeth'], 1)
                elif S.get('fangs'): cv.tri([(tx - 1, ty), (tx + 1, ty), (tx, ty + 3 + pose['jaw'])], C['teeth'])
                else: cv.px(tx, ty + 1, C['teeth'])
            # 눈
            for s in (-1, 1):
                ex = hd_s[0] + g[0] * s * S['head'] * 0.45 + (sn_s[0] - hd_s[0]) * 0.15
                ey = hd_s[1] - S['head'] * 0.15 + g[1] * s * S['head'] * 0.3
                if view in ('side',) and s == -1: continue
                cv.px(ex, ey, C['eye'])
                if S['frame'] > 60: cv.px(ex + 1, ey, C['eye'])
    head_d = depth(head) + (100 if view in ('down', 'downside', 'side') else -100)
    prims.append((head_d, head_fn))

    for _, fn in sorted(prims, key=lambda p: p[0]):
        fn()

    img = cv.img
    if pose['flat']:
        # 쓰러짐: 옆으로 누운 몸 (세로로 납작하게 + 아래로 붙임)
        bb = img.getbbox()
        if bb:
            b = img.crop(bb); b = b.resize((b.width + 2, max(4, int(b.height * 0.55))), Image.NEAREST)
            img = Image.new('RGBA', (F, F), (0, 0, 0, 0)); img.alpha_composite(b, (CX - b.width // 2, FY + 1 - b.height))
    elif pose['roll']:
        img = img.rotate(-pose['roll'], resample=Image.NEAREST, center=(CX, FY))
    return finish(img, F, CX, FY, S)

def finish(img, F, CX, FY, S):
    px = img.load(); res = img.copy(); rp = res.load()
    for y in range(F):
        for x in range(F):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < F and 0 <= Y < F and px[X, Y][3]:
                        rp[x, y] = OUTLINE + (255,); break
    sh = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    w = S['spine'] * 0.9 + 4
    d.ellipse([CX - w, FY - 1, CX + w, FY + 3], fill=(0, 0, 0, 70))
    sh.alpha_composite(res)
    return sh

def build():
    meta = {'dirs': {'down': ['down', False], 'downright': ['downside', False], 'right': ['side', False], 'upright': ['upside', False],
                     'up': ['up', False], 'upleft': ['upside', True], 'left': ['side', True], 'downleft': ['downside', True]},
            'views': VIEWS, 'kinds': {}}
    # 다른 생성기가 만든 종류(예: pixel_hunter.py의 hunter)는 그대로 둔다
    mp = os.path.join(OUT_DIR, 'mon_px.json')
    if os.path.exists(mp): meta['kinds'] = json.load(open(mp)).get('kinds', {})
    for kind, anims in ANIMS.items():
        S = SPECS[kind]; F = S['frame']
        cols = max(len(v) for v in anims.values())
        sheet = Image.new('RGBA', (cols * F, len(anims) * len(VIEWS) * F), (0, 0, 0, 0))
        for ai, (n, frames) in enumerate(anims.items()):
            for vi, v in enumerate(VIEWS):
                for fi, pose in enumerate(frames):
                    sheet.alpha_composite(draw(kind, v, pose), (fi * F, (ai * len(VIEWS) + vi) * F))
        key = f'mon_{kind}'
        sheet.save(os.path.join(OUT_DIR, key + '.png'), optimize=True)
        meta['kinds'][kind] = {'key': key, 'frameWidth': F, 'frameHeight': F, 'columns': cols,
                               'origin': {'x': 0.5, 'y': round((S['footY'] + 2) / F, 4)},
                               'anims': {n: {'row': i * len(VIEWS), 'frames': len(anims[n])} for i, n in enumerate(anims)}}
    json.dump(meta, open(os.path.join(OUT_DIR, 'mon_px.json'), 'w'), indent=1, ensure_ascii=False)
    print('ok', list(meta['kinds']))

if __name__ == '__main__':
    build()
