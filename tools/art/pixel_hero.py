"""
2D 도트 주인공 생성기 v2 — 3/4 탑뷰, 8방향(그리는 건 5방향, 나머지는 좌우 뒤집기), 칼을 그림에 포함.

구조 (Core Keeper식 겹치기 + 제노니아식 공격 모션):
- 몸 부위(머리·몸통·팔·다리)를 방향별 작은 도트 그림으로 정의, 갑옷(outfit)은 부위 그림을 갈아 끼움.
- 무기는 그림이 아니라 "규칙"으로 그린다: 손 위치 + 칼 방향(바라보는 방향 기준 각도 a, 위로 든 각도 e) + 길이.
  → 어느 방향(8방향)에서도 같은 공격 자세 데이터로 칼이 그려진다.
- 공격 키프레임: 예비동작(웅크리고 젖힘) → 잔상(휘두르는 궤적을 한 장에) → 타격(내딛고 길게 유지) → 마무리 → 제자리.
- 결과: assets/characters/hero_<outfit>_<weapon>.png + hero_px.json (모든 시트 공통 메타)

실행: python3 tools/art/pixel_hero.py
Godot: 같은 시트를 SpriteFrames로 ("동작_방향" + flip_h).
"""
from PIL import Image
import json, math, os

F = 64                     # 프레임 크기 (정사각형)
CX = 32                    # 몸 중심 x
FOOT_Y = 52                # 발밑 y
SQUASH = 0.7               # 3/4 시점: 바닥 방향의 세로 길이는 70%로 보임
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, '..', '..', 'assets', 'characters')

PAL = {
    'O': (26, 20, 24),
    'S': (224, 180, 140), 's': (176, 128, 100), 'E': (30, 22, 26),
    'H': (98, 70, 50), 'h': (62, 44, 34),
    'T': (110, 120, 82), 't': (80, 90, 62),
    'C': (112, 86, 62), 'c': (78, 58, 46),
    'L': (130, 102, 64), 'l': (190, 160, 100),
    'P': (74, 68, 88), 'p': (52, 48, 64),
    'B': (66, 48, 38), 'b': (42, 30, 26),
    'W': (76, 90, 52), 'w': (58, 70, 40), 'v': (40, 48, 28),
    'N': (214, 202, 166), 'n': (160, 148, 118),
    'G': (216, 228, 106),
}
SMEAR = (236, 228, 204)
SMEAR_EDGE = (190, 182, 158)

def bm(s): return s.strip('\n').split('\n')

VIEWS = ['down', 'downside', 'side', 'upside', 'up']
# 각 화면 방향에서 캐릭터가 바라보는 바닥 방향 (오른쪽 계열; 왼쪽은 뒤집기)
FACE = {'down': (0, 1), 'downside': (0.7071, 0.7071), 'side': (1, 0), 'upside': (0.7071, -0.7071), 'up': (0, -1)}

# ---------------- 몸 부위 ----------------
HEAD = {
 'down': bm("""
...hHHHHh...
..hHHHHHHh..
.hHHHHHHHHh.
.hHHHHHHHHh.
.HSSHHHHSSH.
.SSSSSSSSSS.
.SSESSSSESS.
.sSSSSSSSSs.
..sSSssSSs..
...sSSSSs...
....ssss...."""),
 'downside': bm("""
...hHHHHh...
..hHHHHHHh..
.hHHHHHHHHh.
.hHHHHHHHHH.
.hHHHSSSHSS.
.hHSSSSSSSS.
.hHSSESSSES.
.hsSSSSSSSs.
..hsSSssSs..
...sSSSSs...
....ssss...."""),
 'side': bm("""
...hHHHHh...
..hHHHHHHHh.
.hHHHHHHHHH.
.hHHHHHHSSS.
.hHHHHHSSSS.
.hhHHHSSSES.
.hhHHSSSSSS.
..hhhSSSSs..
...hhsSSSs..
....sSSSs...
.....sss...."""),
 'upside': bm("""
...hHHHHh...
..hHHHHHHh..
.hHHHHHHHHh.
.hHHHHHHHHh.
.hHHHHHHHHh.
.hHHHHHHHHS.
.hhHHHHHHHS.
.shhhhhhhhs.
..shhhhhhs..
...sSSSSs...
....ssss...."""),
 'up': bm("""
...hHHHHh...
..hHHHHHHh..
.hHHHHHHHHh.
.hHHHHHHHHh.
.hHHHHHHHHh.
.hHHHHHHHHh.
.hhHHHHHHhh.
.shhhhhhhhs.
..shhhhhhs..
...sSSSSs...
....ssss...."""),
}

OUTFITS = {
 'rags': {
  'name': '누더기 옷', 'sleeve': 'T', 'sleeveDark': 't',
  'head': None,
  'torso': {
   'down': bm("""
..cTTTTTTc..
.cTTTTTTTTc.
.cTtTTTTtTc.
.cTTTTTTTTc.
.cTTTTTTTTc.
.cLLLLlLLLc.
.cTTTTTTTTc.
.cTtTTTTtTc.
..ct....tc.."""),
   'downside': bm("""
.cTTTTTTc.
cCTTTTTTTc
cCTtTTTtTc
cCTTTTTTTc
cCTTTTTTTc
cCLLLLlLLc
cCTTTTTTTc
cCTtTTTtTc
.cc....tc."""),
   'side': bm("""
.cTTTTT.
cCTTTTTT
cCTtTTTT
cCTTTTTT
cCTTTTTT
cCLLLlLL
cCTTTTTT
cCTtTTTT
.cc..tt."""),
   'upside': bm("""
.cCCCCCCc.
cCCCCCCCCc
cCCCCCCCCT
cCcCCCCCCT
cCCCCCCCCT
cLLLLLLLLc
cCcCCCCCCT
cCCCCCCCCT
.cc....cc."""),
   'up': bm("""
..cCCCCCCc..
.cCCCCCCCCc.
.cCCCCCCCCc.
.cCcCCCCcCc.
.cCCCCCCCCc.
.cLLLLLLLLc.
.cCcCCCCcCc.
.cCCCCCCCCc.
..cc....cc.."""),
  },
  'arm': bm("""
cTc
TTT
TtT
TTT
TTT
tTt
.S.
SSS
sSs"""),
  'leg': bm("""
PPPP
PPPP
PpPP
PPPP
bBBb
BBBB
bbbb"""),
 },
 'swamp': {
  'name': '늪짐승 가죽 갑옷', 'sleeve': 'W', 'sleeveDark': 'v',
  'head': {
   'down': bm("""
....NnnN....
...NWWWWN...
..vWWWWWWv..
.vWWWWWWWWv.
.vWWwwwwWWv.
.vWwSSSSwWv.
.vWSGSSGSWv.
.vWsSSSSsWv.
..vwSssSwv..
...vwwwwv...
....vvvv...."""),
   'downside': bm("""
....NnnN....
...NWWWWN...
..vWWWWWWv..
.vWWWWWWWWv.
.vWWWwwwwWW.
.vWWwSSSSSw.
.vWWSGSSSGS.
.vWWsSSSSSs.
..vwwSssSs..
...vwwwwv...
....vvvv...."""),
   'side': bm("""
....NnN.....
...NWWWWN...
..vWWWWWWW..
.vWWWWWWwSS.
.vWWWWWwSSS.
.vWWWWWwSGS.
.vWWWWWwSSS.
..vWWWWwSs..
...vWWWws...
....vwwws...
.....vvv...."""),
   'upside': bm("""
....NnnN....
...NWWWWN...
..vWWWWWWv..
.vWWWWWWWWv.
.vWWWNNWWWv.
.vWWWWWWWWW.
.vWWWNNWWWw.
.vWWWWWWWWs.
..vWWWWWWv..
...vwwwwv...
....vvvv...."""),
   'up': bm("""
....NnnN....
...NWWWWN...
..vWWWWWWv..
.vWWWWWWWWv.
.vWWWNNWWWv.
.vWWWWWWWWv.
.vWWWNNWWWv.
.vWWWWWWWWv.
..vWWWWWWv..
...vwwwwv...
....vvvv...."""),
  },
  'torso': {
   'down': bm("""
NNWWWWWWWWNN
nNWWWWWWWWNn
.vWwWWWWwWv.
.vWWWWWWWWv.
.vWWWWWWWWv.
.vvvvwvvvvv.
.vWWWWWWWWv.
.vWwWWWWwWv.
..vw....wv.."""),
   'downside': bm("""
NNWWWWWWNN
nNWWWWWWWN
vvWwWWWwWv
vWWWWWWWWv
vWWWWWWWWv
vvvvvwvvvv
vWWWWWWWWv
vWWwWWWwWv
.vv....wv."""),
   'side': bm("""
.NNWWWW.
NnWWWWWW
vNWwWWWW
vWWWWWWW
vWWWWWWW
vvvvwvvv
vWWWWWWW
vWWwWWWW
.vv..ww."""),
   'upside': bm("""
NNWWWWWWNN
nNWNNNNWWN
vWWWNNWWWv
vWWWWWWWWv
vWWWNNWWWv
vvvvvvvvvv
vWWWNNWWWv
vWWWWWWWWv
.vv....vv."""),
   'up': bm("""
NNWWWWWWWWNN
nNWWNNNNWWNn
.vWWWNNWWWv.
.vWWWWWWWWv.
.vWWWNNWWWv.
.vvvvvvvvvv.
.vWWWNNWWWv.
.vWWWWWWWWv.
..vv....vv.."""),
  },
  'arm': bm("""
NNN
nWn
WwW
WWW
WWW
vWv
.S.
SSS
sSs"""),
  'leg': bm("""
WWWW
WWWW
WwWW
WWWW
vvvv
bBBb
NbbN"""),
 },
}

# ---------------- 키 키우기: 몸통·팔·다리에 줄을 복제해 늘림 (도트가 뭉개지지 않음) ----------------
def grow(grid, rows):
    out = []
    for i, r in enumerate(grid):
        out.append(r)
        if i in rows: out.append(r)
    return out

for _o in OUTFITS.values():
    _o['torso'] = {k: grow(v, (3, 6)) for k, v in _o['torso'].items()}   # 몸통 9 → 11줄
    _o['arm'] = grow(_o['arm'], (2, 4))                                    # 팔 9 → 11줄
    _o['leg'] = grow(_o['leg'], (1, 3))                                    # 다리 7 → 9줄

# ---------------- 무기 (규칙으로 그림) ----------------
WEAPONS = {
 'rusty_sword':    {'cls': 'sword',      'len': 13, 'w': 2, 'blade': (185, 179, 165), 'dark': (120, 116, 108), 'hilt': (90, 58, 34), 'guard': (42, 36, 32)},
 'fang_sword':     {'cls': 'sword',      'len': 14, 'w': 2, 'blade': (216, 204, 166), 'dark': (150, 140, 110), 'hilt': (58, 69, 41), 'guard': (42, 36, 32), 'fang': True, 'glow': (154, 223, 90)},
 'old_greatsword': {'cls': 'greatsword', 'len': 21, 'w': 3, 'blade': (143, 138, 128), 'dark': (96, 92, 86), 'hilt': (63, 42, 26), 'guard': (42, 36, 32)},
}

# ---------------- 자세 ----------------
def P(**k):
    base = dict(bob=0, head=0, lunge=0, crouch=0, legL=(0, 0), legR=(0, 0), off=(0, 0), rot=0,
                w=dict(a=40, e=-55, r=2, z=0), smear=None, weapon=True)
    base.update(k)
    return base

def W(a, e, r, z=0): return dict(a=a, e=e, r=r, z=z)
REST = W(40, -55, 2)

TUCK = W(20, -80, 0)
COMMON = {
 'idle': [P(), P(bob=1)],
 'walk': [P(legL=(0, -1), legR=(0, 1), off=(0, 1)), P(bob=-1), P(legL=(0, 1), legR=(0, -1), off=(0, -1)), P(bob=-1)],
 # 웅크려 걷기(스닉): 몸을 낮추고 앞으로 숙임, 칼은 낮게, 보폭 작게
 'sneak_idle': [P(crouch=3, bob=2, head=1, lunge=1, w=W(60, -35, 2)), P(crouch=3, bob=3, head=1, lunge=1, w=W(60, -35, 2))],
 'sneak': [P(crouch=3, bob=2, head=1, lunge=1, legL=(0, -1), legR=(0, 1), off=(0, 1), w=W(60, -35, 2)),
           P(crouch=3, bob=1, head=1, lunge=1, w=W(60, -35, 2)),
           P(crouch=3, bob=2, head=1, lunge=1, legL=(0, 1), legR=(0, -1), off=(0, -1), w=W(60, -35, 2)),
           P(crouch=3, bob=1, head=1, lunge=1, w=W(60, -35, 2))],
 # 구르기: 몸 숙임 → 말아 넣음 → 공처럼 굴러감 → 펴며 일어남
 'roll': [P(crouch=2, bob=2, head=2, w=W(30, -70, 0)),
          P(crouch=4, bob=4, head=5, lunge=1, off=(0, 2), w=TUCK),
          P(crouch=6, bob=6, head=8, lunge=2, off=(0, 3), w=TUCK),
          P(crouch=6, bob=5, head=8, lunge=3, off=(0, 3), w=TUCK),
          P(crouch=4, bob=3, head=4, lunge=3, off=(0, 1), w=W(30, -70, 1)),
          P(crouch=1, bob=1, head=1, lunge=2, w=REST)],
 # 피격: 움찔 → 밀려남(칼 젖혀짐) → 버팀
 'hurt': [P(lunge=-1, head=1, off=(0, -1), w=W(60, -10, 3)),
          P(crouch=1, lunge=-3, head=2, off=(0, -2), w=W(105, 10, 3, 2)),
          P(crouch=1, lunge=-2, head=1, w=W(70, -30, 2))],
 # 쓰러짐: 휘청 → 무릎 꿇음 → 칼 떨굼 → 앞으로 쓰러짐 → 누움
 'death': [P(lunge=-1, head=1, w=W(70, -30, 3)),
           P(crouch=3, bob=2, head=2, lunge=-1, w=W(90, -60, 2)),
           P(crouch=5, bob=4, head=3, lunge=0, w=W(100, -85, 1)),
           P(crouch=5, bob=4, head=4, rot=90, weapon=False),
           P(rot=90, weapon=False)],
}
# 한손검 3연타: 가로 베기(오른쪽→왼쪽) → 올려 베기(왼쪽→오른쪽) → 내려찍기
SWORD = {
 'atk1': [P(crouch=1, lunge=-1, w=W(120, 10, 4, 2)),
          P(lunge=2, w=W(-20, 5, 7), smear=(W(115, 10, 5, 2), W(-20, 5, 7))),
          P(lunge=3, w=W(-60, 0, 8)),
          P(lunge=2, w=W(-95, -10, 6)),
          P(lunge=1, w=REST)],
 'atk2': [P(crouch=1, lunge=-1, w=W(-120, -20, 4)),
          P(lunge=2, w=W(20, 20, 7), smear=(W(-115, -15, 5), W(20, 20, 7))),
          P(lunge=3, w=W(70, 35, 7)),
          P(lunge=2, w=W(100, 30, 5)),
          P(lunge=1, w=REST)],
 'atk3': [P(crouch=2, lunge=-2, head=1, w=W(10, 110, 2, 9)),
          P(lunge=3, w=W(0, 30, 6, 5), smear=(W(5, 100, 3, 9), W(0, 25, 6, 4))),
          P(crouch=1, lunge=5, w=W(0, -25, 9)),
          P(crouch=1, lunge=5, w=W(0, -30, 9)),
          P(lunge=2, w=REST)],
}
# 대검 2연타: 크게 휘두르기 → 내려찍기 (예비동작 2장으로 더 무겁게)
GREAT = {
 'gs1': [P(crouch=1, lunge=-2, w=W(140, 0, 3)),
         P(crouch=2, lunge=-3, w=W(155, 5, 3, 1)),
         P(lunge=3, w=W(-10, 0, 8), smear=(W(150, 5, 3, 1), W(-10, 0, 8))),
         P(lunge=4, w=W(-70, -5, 9)),
         P(lunge=3, w=W(-110, -15, 7)),
         P(lunge=1, w=REST)],
 'gs2': [P(crouch=2, lunge=-2, head=1, w=W(0, 120, 2, 10)),
         P(crouch=3, lunge=-3, head=2, w=W(0, 125, 1, 11)),
         P(lunge=3, w=W(0, 20, 7, 4), smear=(W(0, 115, 2, 10), W(0, 15, 7, 3))),
         P(crouch=2, lunge=6, w=W(0, -30, 11)),
         P(crouch=2, lunge=6, w=W(0, -32, 11)),
         P(lunge=2, w=REST)],
}
CLASS_ANIMS = {'sword': {**COMMON, **SWORD}, 'greatsword': {**COMMON, **GREAT}}

# ---------------- 그리기 ----------------
def stamp(img, grid, x, y, shade=1.0):
    px = img.load()
    for j, row in enumerate(grid):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            r, g, b = PAL[ch]
            X, Y = int(x) + i, int(y) + j
            if 0 <= X < F and 0 <= Y < F:
                px[X, Y] = (int(r * shade), int(g * shade), int(b * shade), 255)

def plot(img, x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < F and 0 <= y < F:
        img.load()[x, y] = c + (255,) if len(c) == 3 else c

def line(img, x0, y0, x1, y1, c, w=1):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / max(1, n)
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for k in range(w):
            for dx, dy in ((0, 0), (k, 0), (0, k)):
                plot(img, x + dx - (w - 1) / 2, y + dy - (w - 1) / 2, c)

def rot(v, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)

def blade_vec(face, wp):
    g = rot(face, wp['a'])
    e = math.radians(wp['e'])
    return (g[0] * math.cos(e), g[1] * math.cos(e) * SQUASH - math.sin(e))

def hand_pos(face, shoulder, wp):
    g = rot(face, wp['a'])
    return (shoulder[0] + g[0] * wp['r'], shoulder[1] + g[1] * wp['r'] * SQUASH + 2 - wp['z'])

def draw_blade(img, hand, vec, wd, smear=False, t=1.0):
    L = wd['len']
    tip = (hand[0] + vec[0] * L, hand[1] + vec[1] * L)
    if smear:
        # 잔상은 칼끝 쪽만 (초승달): 바깥 띠는 밝게, 안쪽 띠는 옅게. 궤적 끝(t→1)으로 갈수록 두껍게
        mid = (hand[0] + vec[0] * L * 0.55, hand[1] + vec[1] * L * 0.55)
        out = (hand[0] + vec[0] * L * 0.78, hand[1] + vec[1] * L * 0.78)
        line(img, mid[0], mid[1], out[0], out[1], SMEAR_EDGE, 1)
        line(img, out[0], out[1], tip[0], tip[1], SMEAR, 1 + (1 if t > 0.5 else 0))
        return
    # 손잡이(손 뒤로) → 코등이 → 칼날(어두운 아래쪽 + 밝은 날)
    line(img, hand[0] - vec[0] * 3, hand[1] - vec[1] * 3, hand[0], hand[1], wd['hilt'], 1)
    px, py = -vec[1], vec[0]
    nrm = math.hypot(px, py) or 1
    px, py = px / nrm, py / nrm
    line(img, hand[0] - px * 2, hand[1] - py * 2, hand[0] + px * 2, hand[1] + py * 2, wd['guard'], 1)
    base = (hand[0] + vec[0] * 1.5, hand[1] + vec[1] * 1.5)
    line(img, base[0], base[1], tip[0], tip[1], wd['dark'], wd['w'])
    line(img, base[0] - px * 0.5, base[1] - py * 0.5, tip[0] - px * 0.5, tip[1] - py * 0.5, wd['blade'], max(1, wd['w'] - 1))
    if wd.get('fang'):
        for i in range(3, L - 2, 3):
            plot(img, base[0] + vec[0] * i + px * 1.6, base[1] + vec[1] * i + py * 1.6, wd['blade'])
        line(img, base[0] - px, base[1] - py, tip[0] - px, tip[1] - py, wd['glow'], 1)

def draw_smear(img, face, shoulder, wd, w0, w1):
    """휘두른 궤적: 시작 자세→끝 자세 사이를 여러 칼 그림으로 채워 한 장의 잔상으로"""
    steps = 48
    for i in range(steps + 1):
        t = i / steps
        wp = {k: w0[k] + (w1[k] - w0[k]) * t for k in w0}
        h = hand_pos(face, shoulder, wp)
        draw_blade(img, h, blade_vec(face, wp), wd, smear=True, t=t)

def draw(outfit_key, weapon_key, view, pose):
    o, wd = OUTFITS[outfit_key], WEAPONS[weapon_key]
    face = FACE[view]
    img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    leg = o['leg']
    cr = min(pose['crouch'], len(leg) - 3)
    legs = leg[cr:]
    lx = round(face[0] * pose['lunge']); ly = round(face[1] * pose['lunge'] * SQUASH)
    legTop = FOOT_Y - len(legs) + 1 + ly
    torsoY = legTop - len(o['torso'][view]) + pose['bob']
    headY = torsoY - 10 + pose['head']
    head = (o['head'] or HEAD)[view]
    torso = o['torso'][view]
    tw = len(torso[0])
    tx = CX - tw // 2 + lx
    hx = CX - 6 + lx
    # 오른손(무기 손) 어깨 위치: 몸 중심에서 캐릭터 오른쪽으로
    right = (-face[1], face[0])
    shoulder = (CX + lx + right[0] * 4, torsoY + 2 + right[1] * 4 * SQUASH)
    wp = pose['w']
    hand = hand_pos(face, shoulder, wp)
    vec = blade_vec(face, wp)
    behind = (hand[1] < shoulder[1] - 1) or (view in ('up', 'upside') and vec[1] < 0.2)

    def weapon_layer():
        if not pose['weapon']: return
        if pose['smear']: draw_smear(img, face, shoulder, wd, *pose['smear'])
        # 팔(어깨→손) + 손 + 칼
        line(img, shoulder[0], shoulder[1], hand[0], hand[1], PAL[o['sleeve']], 2)
        plot(img, hand[0], hand[1], PAL['S']); plot(img, hand[0] + 1, hand[1], PAL['s'])
        draw_blade(img, hand, vec, wd)

    # 반대손 팔 위치 (캐릭터 왼쪽)
    offx = {'down': 38, 'downside': 36, 'side': 28, 'upside': 23, 'up': 23}[view] + lx + pose['off'][0]
    offy = torsoY + 1 + pose['off'][1]
    legx = (28, 32) if view != 'side' else (29, 32)

    if behind: weapon_layer()
    if view == 'side':
        stamp(img, legs, legx[0] + lx + pose['legL'][0], legTop + pose['legL'][1], 0.72)
        stamp(img, o['arm'], offx, offy, 0.72)
        stamp(img, torso, tx, torsoY)
        stamp(img, head, hx, headY)
        stamp(img, legs, legx[1] + lx + pose['legR'][0], legTop + pose['legR'][1])
    elif view in ('up', 'upside'):
        stamp(img, legs, legx[0] + lx, legTop + pose['legL'][1])
        stamp(img, legs, legx[1] + lx, legTop + pose['legR'][1])
        stamp(img, o['arm'], offx, offy)
        stamp(img, torso, tx, torsoY)
        stamp(img, head, hx, headY)
    else:
        stamp(img, legs, legx[0] + lx, legTop + pose['legL'][1])
        stamp(img, legs, legx[1] + lx, legTop + pose['legR'][1])
        stamp(img, head, hx, headY)
        stamp(img, torso, tx, torsoY)
        stamp(img, o['arm'], offx, offy)
    if not behind: weapon_layer()

    if pose['rot']:
        body = img.crop((12, FOOT_Y - 40, 52, FOOT_Y + 2))
        for _ in range(pose['rot'] // 90):
            body = body.transpose(Image.Transpose.ROTATE_270)
        img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
        img.alpha_composite(body, ((F - body.width) // 2, FOOT_Y + 1 - body.height))
    return finish(img)

def finish(img):
    px = img.load(); res = img.copy(); rp = res.load()
    for y in range(F):
        for x in range(F):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < F and 0 <= Y < F and px[X, Y][3]:
                        c = px[X, Y]
                        # 잔상에는 외곽선을 두르지 않음 (가볍게 보이도록)
                        if c[:3] in (SMEAR, SMEAR_EDGE): continue
                        rp[x, y] = PAL['O'] + (255,)
                        break
    sh = Image.new('RGBA', (F, F), (0, 0, 0, 0)); sp = sh.load()
    for x in range(CX - 6, CX + 6):
        sp[x, FOOT_Y] = (0, 0, 0, 70)
        if CX - 4 <= x < CX + 4: sp[x, FOOT_Y + 1] = (0, 0, 0, 70)
    sh.alpha_composite(res)
    return sh

def build():
    meta = {
        'frameWidth': F, 'frameHeight': F,
        'origin': {'x': CX / F, 'y': round((FOOT_Y + 1) / F, 4)},
        'views': VIEWS,
        # 게임 8방향 → (그린 방향, 뒤집기)
        'dirs': {'down': ['down', False], 'downright': ['downside', False], 'right': ['side', False], 'upright': ['upside', False],
                 'up': ['up', False], 'upleft': ['upside', True], 'left': ['side', True], 'downleft': ['downside', True]},
        'classes': {}, 'sheets': {},
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    for cls, anims in CLASS_ANIMS.items():
        cols = max(len(v) for v in anims.values())
        meta['classes'][cls] = {'columns': cols,
                                'anims': {n: {'row': i * len(VIEWS), 'frames': len(anims[n])} for i, n in enumerate(anims)}}
    for ok in OUTFITS:
        meta['sheets'][ok] = {}
        for wk, wd in WEAPONS.items():
            anims = CLASS_ANIMS[wd['cls']]
            cols = meta['classes'][wd['cls']]['columns']
            sheet = Image.new('RGBA', (cols * F, len(anims) * len(VIEWS) * F), (0, 0, 0, 0))
            for ai, (n, frames) in enumerate(anims.items()):
                for vi, v in enumerate(VIEWS):
                    for fi, pose in enumerate(frames):
                        sheet.alpha_composite(draw(ok, wk, v, pose), (fi * F, (ai * len(VIEWS) + vi) * F))
            key = f'hero_{ok}_{wk}'
            sheet.save(os.path.join(OUT_DIR, key + '.png'), optimize=True)
            meta['sheets'][ok][wk] = {'key': key, 'class': wd['cls']}
    json.dump(meta, open(os.path.join(OUT_DIR, 'hero_px.json'), 'w'), indent=1, ensure_ascii=False)
    print('ok', {k: list(v) for k, v in meta['sheets'].items()})

if __name__ == '__main__':
    build()
