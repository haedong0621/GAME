"""
2D 도트 주인공 생성기 v3 — 3/4 탑뷰, 8방향(그리는 건 5방향, 나머지는 좌우 뒤집기), 칼을 그림에 포함, 관절(뼈대) 팔다리.

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

# ---------------- 팔다리 색 (갑옷별) — 팔다리는 관절 뼈대로 그린다 ----------------
LIMB = {
 'rags':  {'upper': 'T', 'fore': 't', 'hand': 'S', 'thigh': 'P', 'shin': 'p', 'boot': 'B', 'bootDark': 'b', 'plate': None, 'claw': None},
 'swamp': {'upper': 'W', 'fore': 'w', 'hand': 'S', 'thigh': 'W', 'shin': 'w', 'boot': 'b', 'bootDark': 'v', 'plate': 'N', 'claw': 'N'},
}

# ---------------- 무기 (규칙으로 그림) ----------------
WEAPONS = {
 'rusty_sword':    {'cls': 'sword',      'len': 13, 'w': 2, 'blade': (185, 179, 165), 'dark': (120, 116, 108), 'hilt': (90, 58, 34), 'guard': (42, 36, 32)},
 'fang_sword':     {'cls': 'sword',      'len': 14, 'w': 2, 'blade': (216, 204, 166), 'dark': (150, 140, 110), 'hilt': (58, 69, 41), 'guard': (42, 36, 32), 'fang': True, 'glow': (154, 223, 90)},
 'old_greatsword': {'cls': 'greatsword', 'len': 21, 'w': 3, 'blade': (143, 138, 128), 'dark': (96, 92, 86), 'hilt': (63, 42, 26), 'guard': (42, 36, 32)},
}

# ---------------- 뼈대 ----------------
# 몸 공간 좌표: x = 캐릭터 오른쪽, y = 앞, z = 위 (발바닥 z=0)
HIP_Z = 9            # 골반 높이
SHOULDER_Z = 19      # 어깨 높이 (몸통 그림 윗줄)
HIP_X = 2            # 다리 간격
SHOULDER_X = 5       # 어깨 간격
THIGH, SHIN = 5.2, 5.2
UPPER, FORE = 5.0, 4.6

def P(**k):
    base = dict(bob=0, crouch=0, lunge=0, lean=0, twist=0, head=0,
                fl=(0, 0, 0), fr=(0, 0, 0),          # 왼발·오른발 위치 조정 (x, y앞, z위)
                off=(0, 0, 0),                        # 왼손(빈손) 위치 조정
                w=dict(a=40, e=-55, r=3, z=0),        # 칼: 바라보는 방향 기준 각도 a, 위로 든 각도 e, 어깨에서 손까지 r, 손 높이 z
                smear=None, weapon=True, rot=0, tuck=False,
                tumble=(False, 1.0), bounce=0, dust=0)            # 구르기: 앞뒤로 고꾸라짐(뒤집기, 세로 납작), 튀기, 흙먼지 크기
    base.update(k)
    return base

def W(a, e, r, z=0): return dict(a=a, e=e, r=r, z=z)
REST = W(40, -55, 3)

# ---------------- 동작 ----------------
COMMON = {
 'idle': [P(), P(bob=1, off=(0, 0, -1))],
 # 걷기: 발을 앞뒤로 내딛고(무릎 자동 굽힘), 팔은 반대로 흔듦, 발 지날 때 몸이 살짝 올라감
 'walk': [P(fl=(0, 3, 0), fr=(0, -3, 0), off=(0, -3, 0), w=W(30, -55, 3)),
          P(fl=(0, 0, 0), fr=(0, 0, 2), bob=-1),
          P(fl=(0, -3, 0), fr=(0, 3, 0), off=(0, 3, 0), w=W(55, -50, 3)),
          P(fl=(0, 0, 2), fr=(0, 0, 0), bob=-1)],
 # 웅크려 걷기: 무릎 굽히고 상체 숙임, 보폭 작게, 칼은 낮게
 'sneak_idle': [P(crouch=3, lean=22, head=1, off=(0, 3, 1), w=W(55, -35, 4)),
                P(crouch=3, lean=24, head=1, bob=1, off=(0, 3, 1), w=W(55, -35, 4))],
 'sneak': [P(crouch=3, lean=22, head=1, fl=(0, 2, 0), fr=(0, -2, 0), off=(0, 2, 1), w=W(50, -35, 4)),
           P(crouch=3, lean=22, head=1, fl=(0, 0, 0), fr=(0, 0, 1), bob=-1, off=(0, 3, 1), w=W(55, -35, 4)),
           P(crouch=3, lean=22, head=1, fl=(0, -2, 0), fr=(0, 2, 0), off=(0, 4, 1), w=W(60, -35, 4)),
           P(crouch=3, lean=22, head=1, fl=(0, 0, 1), fr=(0, 0, 0), bob=-1, off=(0, 3, 1), w=W(55, -35, 4))],
 # 구르기: 숙임 → 공처럼 말아 넣고 실제로 한 바퀴 회전 → 펴며 일어남
 'roll': [P(crouch=3, lean=30, head=2, fl=(0, 2, 0), off=(0, 4, 2), w=W(30, -60, 2)),
          P(tuck=True, rot=60, tumble=(False, 0.85), bounce=0, dust=1, weapon=False),
          P(tuck=True, rot=150, tumble=(False, 0.45), bounce=1, dust=2, weapon=False),
          P(tuck=True, rot=240, tumble=(True, 0.85), bounce=0, dust=3, weapon=False),
          P(tuck=True, rot=320, tumble=(True, 0.45), bounce=1, dust=2, weapon=False),
          P(crouch=2, lean=15, head=1, fr=(0, 2, 0), off=(0, 2, 0), w=W(40, -55, 3))],
 # 피격: 머리·상체가 뒤로 확 젖혀지고 팔이 튕김 → 뒷걸음 → 버팀
 'hurt': [P(lean=-30, head=-2, lunge=-1, fr=(0, -2, 0), off=(-3, -2, 6), w=W(120, 30, 4, 3)),      # 충격: 고개·상체 확 젖힘, 팔 튕김
          P(lean=-34, head=-2, lunge=-3, crouch=1, fl=(0, -3, 0), off=(-3, -3, 5), w=W(125, 25, 4, 2)), # 밀려남
          P(lean=-22, crouch=3, lunge=-4, fl=(0, -4, 0), fr=(0, -1, 0), off=(-2, -1, 2), w=W(100, 5, 4)), # 휘청 (무릎 꺾임)
          P(lean=-8, crouch=2, lunge=-3, fl=(0, -3, 0), off=(-1, 1, 0), w=W(70, -25, 3)),           # 버팀
          P(lean=-2, crouch=1, lunge=-2, w=W(50, -45, 3))],                                          # 자세 회복
 # 쓰러짐: 휘청 → 무릎 꿇음 → 칼 떨굼 → 앞으로 쓰러짐 → 누움
 'death': [P(lean=-15, head=-1, lunge=-1, w=W(70, -30, 3)),
           P(crouch=6, lean=10, head=1, fl=(0, -4, 0), fr=(0, 2, 0), w=W(90, -60, 3)),
           P(crouch=7, lean=28, head=2, fl=(0, -4, 0), fr=(0, 2, 0), off=(0, 4, -2), w=W(100, -85, 2)),
           P(crouch=7, lean=40, head=2, rot=45, weapon=False),
           P(rot=90, weapon=False)],
}
# 한손검 3연타: 가로 베기 → 올려 베기 → 내려찍기 (몸 비틀기·발 내딛기·숙이기 포함)
SWORD = {
 'atk1': [P(crouch=2, lunge=-1, lean=-8, twist=25, fr=(0, -2, 0), off=(0, 2, 1), w=W(120, 10, 4, 2)),
          P(lunge=2, lean=12, twist=-5, fr=(0, 3, 0), off=(0, -2, 0), w=W(-20, 5, 7), smear=(W(115, 10, 5, 2), W(-20, 5, 7))),
          P(lunge=3, lean=18, twist=-25, crouch=1, fr=(0, 4, 0), fl=(0, -2, 0), off=(0, -3, 0), w=W(-60, 0, 8)),
          P(lunge=2, lean=10, twist=-20, fr=(0, 3, 0), off=(0, -2, 0), w=W(-95, -10, 6)),
          P(lunge=1, lean=3, w=REST)],
 'atk2': [P(crouch=2, lunge=-1, lean=-5, twist=-25, fl=(0, -2, 0), off=(0, -2, 0), w=W(-120, -20, 4)),
          P(lunge=2, lean=10, twist=5, fl=(0, 3, 0), w=W(20, 20, 7), smear=(W(-115, -15, 5), W(20, 20, 7))),
          P(lunge=3, lean=14, twist=25, fl=(0, 4, 0), fr=(0, -2, 0), off=(0, 2, 2), w=W(70, 35, 7)),
          P(lunge=2, lean=8, twist=20, fl=(0, 3, 0), w=W(100, 30, 5)),
          P(lunge=1, lean=3, w=REST)],
 'atk3': [P(crouch=3, lunge=-2, lean=-15, head=1, fr=(0, -2, 0), off=(0, 1, 6), w=W(10, 110, 2, 9)),
          P(lunge=3, lean=15, fr=(0, 3, 0), off=(0, 3, 3), w=W(0, 30, 6, 5), smear=(W(5, 100, 3, 9), W(0, 25, 6, 4))),
          P(crouch=3, lunge=5, lean=32, head=2, fr=(0, 5, 0), fl=(0, -3, 0), off=(0, 4, -1), w=W(0, -25, 9)),
          P(crouch=3, lunge=5, lean=30, head=2, fr=(0, 5, 0), fl=(0, -3, 0), off=(0, 4, -1), w=W(0, -30, 9)),
          P(lunge=2, lean=5, w=REST)],
}
# 대검 2연타: 크게 휘두르기 → 내려찍기 (예비동작 2장, 더 크게 비틀고 깊게 내딛음)
GREAT = {
 'gs1': [P(crouch=2, lunge=-2, lean=-8, twist=30, fr=(0, -3, 0), off=(1, 2, 2), w=W(140, 0, 3)),
         P(crouch=3, lunge=-3, lean=-12, twist=40, fr=(0, -3, 0), off=(1, 2, 2), w=W(155, 5, 3, 1)),
         P(lunge=3, lean=12, twist=-5, fr=(0, 4, 0), off=(0, 0, 1), w=W(-10, 0, 8), smear=(W(150, 5, 3, 1), W(-10, 0, 8))),
         P(crouch=2, lunge=4, lean=20, twist=-30, fr=(0, 5, 0), fl=(0, -3, 0), off=(0, -2, 0), w=W(-70, -5, 9)),
         P(crouch=1, lunge=3, lean=12, twist=-25, fr=(0, 4, 0), w=W(-110, -15, 7)),
         P(lunge=1, lean=3, w=REST)],
 'gs2': [P(crouch=3, lunge=-2, lean=-15, head=1, fr=(0, -2, 0), off=(0, 1, 7), w=W(0, 120, 2, 10)),
         P(crouch=4, lunge=-3, lean=-20, head=1, fr=(0, -3, 0), off=(0, 1, 8), w=W(0, 125, 1, 11)),
         P(lunge=3, lean=15, fr=(0, 3, 0), off=(0, 3, 4), w=W(0, 20, 7, 4), smear=(W(0, 115, 2, 10), W(0, 15, 7, 3))),
         P(crouch=4, lunge=6, lean=35, head=2, fr=(0, 6, 0), fl=(0, -3, 0), off=(0, 5, -1), w=W(0, -30, 11)),
         P(crouch=4, lunge=6, lean=34, head=2, fr=(0, 6, 0), fl=(0, -3, 0), off=(0, 5, -1), w=W(0, -32, 11)),
         P(lunge=2, lean=5, w=REST)],
}
CLASS_ANIMS = {'sword': {**COMMON, **SWORD}, 'greatsword': {**COMMON, **GREAT}}

# ---------------- 수학 ----------------
def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_len(a): return math.sqrt(v_dot(a, a))
def v_norm(a):
    l = v_len(a) or 1
    return v_mul(a, 1 / l)

def ik(root, target, l1, l2, pole):
    """2관절 IK: root→target 사이 중간 관절(무릎·팔꿈치) 위치. pole 쪽으로 굽힘"""
    d = v_sub(target, root)
    dist = min(v_len(d), l1 + l2 - 0.05)
    dist = max(dist, abs(l1 - l2) + 0.05)
    dn = v_norm(d)
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0, l1 * l1 - a * a))
    pp = v_sub(pole, v_mul(dn, v_dot(pole, dn)))
    pn = v_norm(pp) if v_len(pp) > 1e-6 else (0, 1, 0)
    joint = v_add(v_add(root, v_mul(dn, a)), v_mul(pn, h))
    end = v_add(root, v_mul(dn, dist))
    return joint, end

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
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(n + 1):
        t = i / max(1, n)
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for dx in range(w):
            for dy in range(w):
                plot(img, x + dx - (w - 1) / 2, y + dy - (w - 1) / 2, c)

def shade_c(ch, k):
    r, g, b = PAL[ch]
    return (int(r * k), int(g * k), int(b * k))

class View:
    """한 화면 방향의 투영: 몸 공간 점 → 화면 좌표"""
    def __init__(self, view, pose):
        self.view = view
        self.F = FACE[view]
        self.R = (-self.F[1], self.F[0])
        self.pose = pose
        self.base_y = FOOT_Y + pose['bob']

    def ground(self, p):  # 몸 공간 (x, y) → 화면 바닥 방향
        return (self.R[0] * p[0] + self.F[0] * p[1], self.R[1] * p[0] + self.F[1] * p[1])

    def scr(self, p):
        g = self.ground(p)
        return (CX + g[0], self.base_y + g[1] * SQUASH - p[2])

    def depth(self, p):  # 화면 아래쪽(카메라 쪽)일수록 큼
        return self.ground(p)[1]

def upper_body(p, pose, hip):
    """상체 점에 숙이기(lean)·비틀기(twist) 적용 (골반 기준)"""
    x, y, z = p
    t = math.radians(pose['twist'])
    x, y = x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t)
    l = math.radians(pose['lean'])
    rz = z - hip[2]
    y, z = y + rz * math.sin(l), hip[2] + rz * math.cos(l)
    return (x + hip[0], y + hip[1], z)

def blade_dir(wp):
    a, e = math.radians(wp['a']), math.radians(wp['e'])
    return (math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e))

def draw_blade(img, V, hand_s, bdir, wd, smear=False, t=1.0):
    g = V.ground(bdir)
    vec = (g[0], g[1] * SQUASH - bdir[2])
    L = wd['len']
    tip = (hand_s[0] + vec[0] * L, hand_s[1] + vec[1] * L)
    if smear:
        mid = (hand_s[0] + vec[0] * L * 0.55, hand_s[1] + vec[1] * L * 0.55)
        out = (hand_s[0] + vec[0] * L * 0.78, hand_s[1] + vec[1] * L * 0.78)
        line(img, mid[0], mid[1], out[0], out[1], SMEAR_EDGE, 1)
        line(img, out[0], out[1], tip[0], tip[1], SMEAR, 1 + (1 if t > 0.5 else 0))
        return
    line(img, hand_s[0] - vec[0] * 3, hand_s[1] - vec[1] * 3, hand_s[0], hand_s[1], wd['hilt'], 1)
    px, py = -vec[1], vec[0]
    nrm = math.hypot(px, py) or 1
    px, py = px / nrm, py / nrm
    line(img, hand_s[0] - px * 2, hand_s[1] - py * 2, hand_s[0] + px * 2, hand_s[1] + py * 2, wd['guard'], 1)
    base = (hand_s[0] + vec[0] * 1.5, hand_s[1] + vec[1] * 1.5)
    line(img, base[0], base[1], tip[0], tip[1], wd['dark'], wd['w'])
    line(img, base[0] - px * 0.5, base[1] - py * 0.5, tip[0] - px * 0.5, tip[1] - py * 0.5, wd['blade'], max(1, wd['w'] - 1))
    if wd.get('fang'):
        for i in range(3, L - 2, 3):
            plot(img, base[0] + vec[0] * i + px * 1.6, base[1] + vec[1] * i + py * 1.6, wd['blade'])
        line(img, base[0] - px, base[1] - py, tip[0] - px, tip[1] - py, wd['glow'], 1)

def rig(pose):
    """자세 → 관절 위치 (몸 공간)"""
    hip = (0, pose['lunge'], HIP_Z - pose['crouch'])
    J = {'hip': hip}
    J['neck'] = upper_body((0, 0, SHOULDER_Z + 1), pose, hip)
    J['chest'] = upper_body((0, 0, HIP_Z + 5), pose, hip)
    J['top'] = upper_body((0, 0, SHOULDER_Z), pose, hip)
    J['shR'] = upper_body((SHOULDER_X, 0, SHOULDER_Z - 1), pose, hip)
    J['shL'] = upper_body((-SHOULDER_X, 0, SHOULDER_Z - 1), pose, hip)
    # 다리: 골반 양쪽 → 발 목표, 무릎은 앞으로 굽힘
    for side, sx, f in (('L', -HIP_X, pose['fl']), ('R', HIP_X, pose['fr'])):
        h = (hip[0] + sx, hip[1], hip[2])
        foot = (sx + f[0], pose['lunge'] * 0.6 + f[1], f[2])
        knee, foot = ik(h, foot, THIGH, SHIN, (0, 1, 0.2))
        J['hip' + side], J['knee' + side], J['foot' + side] = h, knee, foot
    # 칼 쥔 오른손: 칼 자세에서 손 목표 → 팔꿈치는 바깥·아래로 굽힘
    wp = pose['w']
    a = math.radians(wp['a'])
    handR = v_add(J['shR'], (math.sin(a) * wp['r'], math.cos(a) * wp['r'], -3 + wp['z']))
    J['elbR'], J['handR'] = ik(J['shR'], handR, UPPER, FORE, (1, -0.6, -0.8))
    # 빈손(왼손): 기본은 옆에 늘어뜨림 + 조정
    o = pose['off']
    handL = v_add(J['shL'], (-0.5 + o[0], 0.5 + o[1], -8.5 + o[2]))
    J['elbL'], J['handL'] = ik(J['shL'], handL, UPPER, FORE, (-1, -0.6, -0.3))
    if pose['tuck']:
        # 공처럼 말기: 무릎을 가슴으로, 손은 무릎을 감쌈 (회전은 나중에 이미지로)
        hip = (0, 0, 7)
        J['hip'] = hip
        for side, sx in (('L', -HIP_X), ('R', HIP_X)):
            J['hip' + side] = (sx, 0, 7)
            J['knee' + side] = (sx, 4, 10)
            J['foot' + side] = (sx, 1, 5)
        for k in ('neck', 'chest', 'top', 'shR', 'shL'):
            x, y, z = J[k]
            J[k] = (x, (z - 7) * 0.9, 7 + (z - 7) * 0.45)
        J['handR'] = (HIP_X + 1, 4, 9); J['elbR'] = (SHOULDER_X, 2, 10)
        J['handL'] = (-HIP_X - 1, 4, 9); J['elbL'] = (-SHOULDER_X, 2, 10)
    return J

def draw(outfit_key, weapon_key, view, pose):
    o, wd, lc = OUTFITS[outfit_key], WEAPONS[weapon_key], LIMB[outfit_key]
    V = View(view, pose)
    J = rig(pose)
    img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    S = {k: V.scr(v) for k, v in J.items()}
    chest_d = V.depth(J['chest'])
    items = []  # (깊이, 몸통 앞/뒤, 그리기 함수)

    def leg(side):
        hip_s, knee_s, foot_s = S['hip' + side], S['knee' + side], S['foot' + side]
        far = V.depth(J['knee' + side]) < chest_d - 0.6
        k = 0.78 if far else 1.0
        def fn():
            line(img, *hip_s, *knee_s, shade_c(lc['thigh'], k), 3)
            line(img, *knee_s, *foot_s, shade_c(lc['shin'], k), 3)
            fx, fy = foot_s
            g = V.ground((0, 1, 0)); toe = (g[0] * 1.5, g[1] * SQUASH * 1.5)
            line(img, fx - 1, fy - 1, fx + toe[0], fy + toe[1], shade_c(lc['boot'], k), 3)
            plot(img, fx + toe[0], fy + toe[1] + 1, shade_c(lc['bootDark'], k))
            if lc['claw']: plot(img, fx + toe[0] + (1 if toe[0] >= 0 else -1), fy + toe[1] + 1, shade_c(lc['claw'], k))
        items.append((V.depth(J['foot' + side]) - 2, 'leg', fn))

    def arm(side):
        sh, el, hd = S['sh' + side], S['elb' + side], S['hand' + side]
        d = V.depth(J['elb' + side]) * 0.5 + V.depth(J['hand' + side]) * 0.5
        behind = d < chest_d - 0.6
        k = 0.78 if behind else 1.0
        def fn():
            line(img, *sh, *el, shade_c(lc['upper'], k), 3)
            line(img, *el, *hd, shade_c(lc['fore'], k), 2)
            line(img, hd[0] - 0.5, hd[1] - 0.5, hd[0] + 0.5, hd[1] + 0.5, shade_c(lc['hand'], k), 2)
            if lc['plate']:
                line(img, sh[0] - 1, sh[1] - 1, sh[0] + 1, sh[1] - 1, shade_c(lc['plate'], k), 2)
        items.append((d, 'behind' if behind else 'front', fn))
        return behind

    def weapon():
        if not pose['weapon']: return
        hand_s = S['handR']
        if pose['smear']:
            steps = 48
            w0, w1 = pose['smear']
            for i in range(steps + 1):
                t = i / steps
                wp = {k: w0[k] + (w1[k] - w0[k]) * t for k in w0}
                a = math.radians(wp['a'])
                hb = v_add(J['shR'], (math.sin(a) * wp['r'], math.cos(a) * wp['r'], -3 + wp['z']))
                draw_blade(img, V, V.scr(hb), blade_dir(wp), wd, smear=True, t=t)
        draw_blade(img, V, hand_s, blade_dir(pose['w']), wd)

    leg('L'); leg('R')
    armR_behind = arm('R'); arm('L')
    # 칼은 손이 몸 뒤에 있거나, 칼날이 위(먼 쪽)로 향하면 몸 뒤에
    bd = blade_dir(pose['w'])
    blade_far = V.ground(bd)[1] < -0.35 or (bd[2] > 0.5 and V.depth(J['handR']) < chest_d + 0.5)
    w_behind = armR_behind or blade_far

    torso = o['torso'][view]; head = (o['head'] or HEAD)[view]
    top_s, neck_s, chest_s = S['top'], S['neck'], S['chest']
    if pose['tuck']:
        # 공처럼 말기: 몸통을 절반 높이로 접고, 머리를 몸통에 파묻음
        torso = torso[::2]
        tuck_top = round(chest_s[1] - len(torso) / 2)
        def torso_fn(): stamp(img, torso, round(chest_s[0] - len(torso[0]) / 2), tuck_top)
        def head_fn(): stamp(img, head[:9], round(chest_s[0] - 6), tuck_top - 6)
    else:
        def torso_fn(): stamp(img, torso, round(chest_s[0] - len(torso[0]) / 2), round(top_s[1]))
        def head_fn(): stamp(img, head, round(neck_s[0] - 6), round(neck_s[1] - 10 + pose['head']))

    # 그리는 순서: 뒤쪽 것들 → 몸통·머리 → 앞쪽 것들
    back = sorted([i for i in items if i[1] in ('behind',)], key=lambda i: i[0])
    legs = sorted([i for i in items if i[1] == 'leg'], key=lambda i: i[0])
    front = sorted([i for i in items if i[1] == 'front'], key=lambda i: i[0])
    if w_behind: weapon()
    for _, _, fn in back: fn()
    for _, _, fn in legs: fn()
    if view in ('up', 'upside'):
        torso_fn(); head_fn()
    else:
        head_fn(); torso_fn()
    for _, _, fn in front: fn()
    if not w_behind: weapon()

    if pose['tuck']:
        # 구르기 공: 옆·대각선은 화면 안에서 회전, 아래·위는 앞으로 고꾸라짐(뒤집기 + 세로 납작). 항상 바닥에 붙임
        if view in ('down', 'up'):
            bb = img.getbbox()
            ball = img.crop(bb)
            flip, sc = pose['tumble']
            if flip: ball = ball.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            ball = ball.resize((ball.width, max(3, round(ball.height * sc))), Image.NEAREST)
        else:
            r = rotsprite(img, pose['rot'], (CX, FOOT_Y - 8))
            ball = r.crop(r.getbbox())
        img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
        img.alpha_composite(ball, (CX - ball.width // 2, FOOT_Y + 1 - ball.height - pose['bounce']))
        if pose['dust']:
            # 흙먼지: 구르는 반대쪽(뒤) 바닥에
            back = V.ground((0, -1, 0))
            for i in range(pose['dust'] + 1):
                dx = CX + back[0] * (6 + i * 3)
                dy = FOOT_Y - 1 + back[1] * SQUASH * (6 + i * 3) - (i % 2)
                c = (150, 138, 116, 230) if i < pose['dust'] else (120, 110, 94, 160)
                for ox, oy in ((0, 0), (1, 0), (0, -1)) if i < 2 else ((0, 0),):
                    X, Y = int(dx + ox), int(dy + oy)
                    if 0 <= X < F and 0 <= Y < F and img.getpixel((X, Y))[3] == 0: img.putpixel((X, Y), c)
    elif pose['rot']:
        img = rotsprite(img, pose['rot'] if view not in ('up', 'upside') else -pose['rot'], (CX, FOOT_Y - 2))
        if pose['rot'] >= 90:
            # 누운 몸은 바닥에 붙이기
            bb = img.getbbox()
            if bb:
                body = img.crop(bb); img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
                img.alpha_composite(body, (CX - body.width // 2, FOOT_Y + 1 - body.height))
    return finish(img)

def rotsprite(img, deg, center):
    """도트가 덜 깨지게 회전: 4배 키움 → 회전 → 4x4 칸마다 가장 많은 색으로 줄임"""
    K = 4
    big = img.resize((F * K, F * K), Image.NEAREST)
    big = big.rotate(-deg, resample=Image.NEAREST, center=(center[0] * K, center[1] * K))
    out = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    bp, op = big.load(), out.load()
    for y in range(F):
        for x in range(F):
            counts = {}
            for dy in range(K):
                for dx in range(K):
                    c = bp[x * K + dx, y * K + dy]
                    if c[3] == 0: c = (0, 0, 0, 0)
                    counts[c] = counts.get(c, 0) + 1
            c = max(counts.items(), key=lambda kv: kv[1])[0]
            if c[3] and counts.get((0, 0, 0, 0), 0) > K * K * 0.6: c = (0, 0, 0, 0)
            op[x, y] = c
    return out

def finish(img):
    px = img.load(); res = img.copy(); rp = res.load()
    for y in range(F):
        for x in range(F):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < F and 0 <= Y < F and px[X, Y][3]:
                        c = px[X, Y]
                        if c[:3] in (SMEAR, SMEAR_EDGE): continue
                        rp[x, y] = PAL['O'] + (255,)
                        break
    sh = Image.new('RGBA', (F, F), (0, 0, 0, 0)); sp = sh.load()
    for x in range(CX - 6, CX + 6):
        sp[x, FOOT_Y + 1] = (0, 0, 0, 70)
        if CX - 4 <= x < CX + 4: sp[x, FOOT_Y + 2] = (0, 0, 0, 70)
    sh.alpha_composite(res)
    return sh

def build():
    meta = {
        'frameWidth': F, 'frameHeight': F,
        'origin': {'x': CX / F, 'y': round((FOOT_Y + 2) / F, 4)},
        'views': VIEWS,
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
