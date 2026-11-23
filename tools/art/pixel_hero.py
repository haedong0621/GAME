"""
2D 도트 주인공 생성기 (Core Keeper식: 3/4 탑뷰, 4방향(옆은 뒤집기), 부위별 그림을 겹쳐 그리기).

- 부위(머리·몸통·팔·다리)마다 방향별 작은 도트 그림을 글자로 정의한다.
- 갑옷(outfit)은 부위 그림을 갈아 끼운다 → 같은 자세(pose)로 모든 동작이 나온다.
- 자세는 부위 위치를 픽셀 단위로 옮겨서 만든다 (걷기: 다리 교차·몸 들썩, 공격: 웅크림→내딛기 …).
- 결과: assets/characters/hero_<outfit>.png (+ hero_px.json 메타, 모든 갑옷 공통 배치)

실행: python3 tools/art/pixel_hero.py
Godot: 같은 시트를 SpriteFrames로. 부위 겹치기를 런타임에 하고 싶으면 부위별 시트로 나눠 Sprite2D 여러 장을 겹치면 된다.
"""
from PIL import Image
import json, os

FW, FH = 32, 40          # 한 프레임 크기
FOOT_Y = 38              # 발밑 y (게임 origin)
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, '..', '..', 'assets', 'characters')

# ---- 팔레트 (어두운 판타지: 탁하고 낮은 채도, 그림자는 살짝 푸른빛)
PAL = {
    'O': (26, 20, 24),     # 외곽선
    'S': (224, 180, 140), 's': (176, 128, 100), 'E': (30, 22, 26),          # 피부, 피부 그림자, 눈
    'H': (98, 70, 50), 'h': (62, 44, 34),                                   # 머리카락
    'T': (110, 120, 82), 't': (80, 90, 62), 'u': (58, 66, 48),              # 누더기 튜닉
    'C': (112, 86, 62), 'c': (78, 58, 46),                                  # 망토(갈색)
    'L': (130, 102, 64), 'l': (190, 160, 100),                              # 허리띠, 버클
    'P': (74, 68, 88), 'p': (52, 48, 64),                                   # 바지
    'B': (66, 48, 38), 'b': (42, 30, 26),                                   # 장화
    'W': (76, 90, 52), 'w': (58, 70, 40), 'v': (40, 48, 28),                # 늪짐승 가죽
    'N': (214, 202, 166), 'n': (160, 148, 118),                             # 뼈판
    'G': (216, 228, 106),                                                   # 노란 눈빛
}

def bm(s):
    return [row for row in s.strip('\n').split('\n')]

# ---------------- 부위 그림: 기본 몸 ----------------
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
}

# ---------------- 갑옷(겉모습)별 부위 그림 ----------------
OUTFITS = {
 'rags': {
  'name': '누더기 옷',
  'head': None,  # 머리 덮개 없음 (머리카락 그대로)
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
  'name': '늪짐승 가죽 갑옷',
  'head': {  # 두건이 머리를 덮음
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

# ---------------- 자세 ----------------
def P(**k):
    base = dict(bob=0, lean=0, head=0, legL=(0, 0), legR=(0, 0), armB=(0, 0), armF=(0, 0), crouch=0, rot=0, tint=None)
    base.update(k)
    return base

# 동작별 프레임 (방향 공통 자세 값; 옆 방향은 legL=뒷다리, legR=앞다리, armB=뒷팔, armF=앞팔)
ANIMS = {
 'idle':  [P(), P(bob=1, head=0)],
 'walk':  [P(legL=(0, -1), legR=(0, 1), armB=(0, 1), armF=(0, -1), bob=0),
           P(bob=-1),
           P(legL=(0, 1), legR=(0, -1), armB=(0, -1), armF=(0, 1), bob=0),
           P(bob=-1)],
 'attack': [P(bob=1, lean=-1, armF=(0, -3), armB=(0, -1), crouch=1),            # 들어 올림 (웅크림)
            P(bob=-1, lean=2, armF=(2, 1), armB=(1, 0), legR=(1, 0)),           # 내리침 (내딛기)
            P(bob=0, lean=1, armF=(1, 0))],                                      # 회복
 'roll':  [P(crouch=2, bob=2, head=2, armF=(0, 1), armB=(0, 1)),                 # 웅크림
           P(crouch=4, bob=5, head=4, lean=1, armF=(-1, 0), armB=(1, 0)),        # 몸을 맒 (머리 숙임)
           P(crouch=4, bob=6, head=5, lean=2, armF=(-1, -1), armB=(1, -1)),
           P(crouch=2, bob=2, head=1, lean=1)],                                   # 일어나며
 'hurt':  [P(lean=-2, head=1, armF=(0, -2), armB=(0, -2))],
 'death': [P(crouch=1, bob=1, lean=-1), P(crouch=3, bob=3, lean=-2), P(rot=90, bob=0)],
}
DIRS = ['down', 'up', 'side']

def stamp(img, grid, x, y, shade=1.0, flip=False):
    px = img.load()
    for j, row in enumerate(grid):
        for i, ch in enumerate(row if not flip else row[::-1]):
            if ch == '.' or ch == ' ':
                continue
            r, g, b = PAL[ch]
            if shade != 1.0:
                r, g, b = int(r * shade), int(g * shade), int(b * shade)
            X, Y = x + i, y + j
            if 0 <= X < img.width and 0 <= Y < img.height:
                px[X, Y] = (r, g, b, 255)

def crop_rows(grid, n):
    """다리를 위에서부터 n줄 줄여 웅크린 모양"""
    return grid[n:] if n > 0 else grid

def draw(outfit_key, d, pose):
    o = OUTFITS[outfit_key]
    img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    b, lean, cr = pose['bob'], pose['lean'], pose['crouch']
    leg = o['leg']
    legs = crop_rows(leg, min(cr, len(leg) - 3))
    legH = len(legs)
    legTop = FOOT_Y - legH + 1
    torsoY = legTop - 9 + b if cr == 0 else legTop - 9 + b - 0
    headY = torsoY - 10 + pose['head']
    head = (o['head'] or HEAD)[d]
    torso = o['torso'][d]
    arm = o['arm']

    if d == 'side':
        # 뒷다리 → 뒷팔 → 몸통 → 머리 → 앞다리 → 앞팔
        stamp(img, legs, 13 + pose['legL'][0], legTop + pose['legL'][1], shade=0.72)
        stamp(img, arm, 12 + lean + pose['armB'][0], torsoY + 1 + pose['armB'][1], shade=0.72)
        stamp(img, torso, 12 + lean, torsoY)
        stamp(img, head, 10 + lean, headY)
        stamp(img, legs, 16 + pose['legR'][0], legTop + pose['legR'][1])
        stamp(img, arm, 15 + lean + pose['armF'][0], torsoY + 1 + pose['armF'][1])
    else:
        up = d == 'up'
        ly = lean if not up else -lean  # 앞뒤로 기울기 = 위아래로 1~2px
        if up:  # 등을 보일 땐: 다리·팔 → 몸통 → 머리(뒤통수)
            stamp(img, legs, 12, legTop + pose['legL'][1])
            stamp(img, legs, 16, legTop + pose['legR'][1])
            stamp(img, arm, 7, torsoY + 1 + pose['armB'][1] + ly)
            stamp(img, arm, 22, torsoY + 1 + pose['armF'][1] + ly)
            stamp(img, torso, 10, torsoY + ly)
            stamp(img, head, 10, headY + ly)
        else:   # 앞모습: 다리 → 머리 → 몸통(목 가림) → 팔
            stamp(img, legs, 12, legTop + pose['legL'][1])
            stamp(img, legs, 16, legTop + pose['legR'][1])
            stamp(img, head, 10, headY + ly)
            stamp(img, torso, 10, torsoY + ly)
            stamp(img, arm, 7, torsoY + 1 + pose['armB'][1] + ly)
            stamp(img, arm, 22, torsoY + 1 + pose['armF'][1] + ly)

    if pose['rot']:
        # 구르기·쓰러짐: 몸 전체를 발밑 근처를 중심으로 회전 (90° 단위라 픽셀이 깨지지 않음)
        k = pose['rot'] // 90
        body = img.crop((4, FOOT_Y - 30, 28, FOOT_Y + 2))
        for _ in range(k):
            body = body.transpose(Image.Transpose.ROTATE_270)
        img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        img.alpha_composite(body, ((FW - body.width) // 2, FOOT_Y + 1 - body.height))
    if pose['tint']:
        tr, tg, tb = pose['tint']
        px = img.load()
        for y in range(FH):
            for x in range(FW):
                r, g, bb, a = px[x, y]
                if a: px[x, y] = ((r + tr) // 2, (g + tg) // 2, (bb + tb) // 2, a)
    return outline(img)

def outline(img):
    px = img.load(); res = img.copy(); rp = res.load()
    for y in range(FH):
        for x in range(FW):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < FW and 0 <= Y < FH and px[X, Y][3]:
                        rp[x, y] = PAL['O'] + (255,); break
    # 발밑 그림자
    sh = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); sp = sh.load()
    for x in range(10, 22):
        for y in (FOOT_Y, FOOT_Y + 1):
            if not (y == FOOT_Y + 1 and (x < 12 or x > 19)):
                sp[x, y] = (0, 0, 0, 70)
    sh.alpha_composite(res)
    return sh

def build():
    cols = max(len(v) for v in ANIMS.values())
    names = list(ANIMS.keys())
    meta = {
        'frameWidth': FW, 'frameHeight': FH, 'columns': cols,
        'origin': {'x': 0.5, 'y': round((FOOT_Y + 1) / FH, 4)},
        'directions': DIRS, 'flipLeft': True,
        'anims': {n: {'row': i * len(DIRS), 'frames': len(ANIMS[n])} for i, n in enumerate(names)},
        'outfits': {k: {'name': v['name'], 'texture': f'hero_{k}'} for k, v in OUTFITS.items()},
        'hand': {'down': [22, 30], 'up': [9, 30], 'side': [17, 31]},
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    for key in OUTFITS:
        sheet = Image.new('RGBA', (cols * FW, len(names) * len(DIRS) * FH), (0, 0, 0, 0))
        for ai, n in enumerate(names):
            for di, d in enumerate(DIRS):
                for fi, pose in enumerate(ANIMS[n]):
                    sheet.alpha_composite(draw(key, d, pose), (fi * FW, (ai * len(DIRS) + di) * FH))
        sheet.save(os.path.join(OUT_DIR, f'hero_{key}.png'))
    json.dump(meta, open(os.path.join(OUT_DIR, 'hero_px.json'), 'w'), indent=1, ensure_ascii=False)
    print('ok', list(OUTFITS), cols, 'cols')

if __name__ == '__main__':
    build()
