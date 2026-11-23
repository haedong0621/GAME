"""
두 번째 보스 "뒤엉킨 사냥꾼" 도트 생성기 — 들개 떼에게 물어뜯겨 죽으며 들개들과 뒤섞여 버린 늑대인간 사냥꾼.
두 발로 선 구부정한 늑대 머리 사냥꾼(챙 넓은 모자·누더기 코트·은빛 도축칼) + 어깨·옆구리에서 튀어나온 들개 머리 둘 + 등에 매달린 들개 앞발.

그리는 방식 (주인공 v3와 같은 3/4 시점·8방향·빛 방향):
- 몸을 공(구)·관(캡슐) 덩어리로 3D 공간에 놓고, 화면에 투영하면서 z버퍼로 앞뒤를 가린다.
- 명암은 3~4단 "셀 셰이딩"(경계 디더 없음) → 주인공·몬스터 도트와 같은 납작한 느낌.
- 칼날은 평평한 판(점들)으로, 휘두르는 궤적(잔상)은 따로 그린다.
결과: assets/characters/mon_hunter.png + mon_px.json 의 kinds.hunter (다른 종류는 그대로 둠)
실행: python3 tools/art/pixel_hunter.py
"""
from PIL import Image, ImageDraw
import json, math, os

F = 128
CX, FOOT_Y = 64, 108
K = 1.3                    # 몸 전체 크기 배율 (중형 보스: 주인공의 약 2배 키)
SQUASH = 0.7
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, '..', '..', 'assets', 'characters')
VIEWS = ['down', 'downside', 'side', 'upside', 'up']
FACE = {'down': (0, 1), 'downside': (0.7071, 0.7071), 'side': (1, 0), 'upside': (0.7071, -0.7071), 'up': (0, -1)}
OUTLINE = (22, 18, 18)
LIGHT = (-0.5, -0.62, 0.6)

MAT = {  # 어두움 → 밝음
    'fur':    [(58, 56, 60), (98, 94, 96), (138, 132, 128), (178, 170, 160)],  # 늑대인간 털 (잿빛)
    'hound':  [(64, 44, 30), (104, 74, 50), (138, 102, 68), (166, 128, 88)],   # 들개 털 (들개와 같은 갈색)
    'coat':   [(30, 26, 30), (50, 40, 44), (72, 58, 58), (94, 76, 72)],        # 사냥꾼 코트 (검붉은 가죽)
    'hat':    [(28, 24, 24), (46, 40, 38), (66, 58, 52), (84, 74, 66)],
    'flesh':  [(96, 24, 30), (150, 44, 46), (192, 76, 70), (214, 110, 98)],   # 물어뜯긴 상처
    'bone':   [(132, 122, 98), (176, 166, 138), (214, 204, 176), (232, 224, 200)],
    'strap':  [(52, 36, 26), (80, 56, 38), (108, 80, 54), (130, 100, 70)],
    'silver': [(84, 88, 98), (140, 146, 158), (192, 198, 210), (232, 236, 242)],
}
EYE = (236, 206, 84)
SMEAR = (236, 228, 204)
SMEAR_EDGE = (190, 182, 158)

# ---------------- 수학 ----------------
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def norm(a):
    l = math.sqrt(dot(a, a)) or 1
    return mul(a, 1 / l)

def ik(root, target, l1, l2, pole):
    d = sub(target, root)
    dist = max(min(math.sqrt(dot(d, d)), l1 + l2 - 0.05), abs(l1 - l2) + 0.05)
    dn = norm(d)
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0, l1 * l1 - a * a))
    pp = sub(pole, mul(dn, dot(pole, dn)))
    pn = norm(pp) if dot(pp, pp) > 1e-9 else (0, 1, 0)
    return add(add(root, mul(dn, a)), mul(pn, h)), add(root, mul(dn, dist))

# ---------------- 자세 ----------------
def P(**k):
    base = dict(bob=0, crouch=0, lunge=0, lean=28, twist=0, head=0, jaw=0,
                fl=(0, 0, 0), fr=(0, 0, 0),
                w=dict(a=60, e=-60, r=8, z=0),        # 칼 든 오른손: 바라보는 방향 기준 각도 a, 칼날이 위로 든 각도 e, 어깨→손 거리 r, 손 높이 z
                cl=(0, 4, -14),                       # 왼손(발톱) 위치: 왼어깨 기준
                hounds=0,                             # 들개 머리: 0 = 으르렁, 1 = 앞으로 물어뜯기, -1 = 위로 울부짖기
                smear=None, blade=True, rot=0, fall=0)
    base.update(k)
    return base

def W(a, e, r=8, z=0): return dict(a=a, e=e, r=r, z=z)

HIP_Z, SPINE, HIP_X, SHOULDER_X = 22, 20, 6, 11
THIGH, SHIN, UPPER, FORE = 11, 11, 11, 11

ANIMS = {
 'idle': [P(), P(bob=1, crouch=1, hounds=0.3, cl=(0, 4, -15))],
 'walk': [P(fl=(0, 6, 0), fr=(0, -6, 0), cl=(0, -4, -13), w=W(45, -60)),
          P(fl=(0, 0, 0), fr=(0, 0, 4), bob=-1, w=W(55, -60)),
          P(fl=(0, -6, 0), fr=(0, 6, 0), cl=(0, 8, -13), w=W(70, -55)),
          P(fl=(0, 0, 4), fr=(0, 0, 0), bob=-1, w=W(55, -60))],
 # 울부짖기: 머리를 젖히고 팔을 벌림, 들개 머리도 하늘로
 'roar': [P(lean=-5, head=-35, jaw=1, hounds=-1, cl=(-6, 2, -6), w=W(110, -30, 9, 4)),
          P(lean=-8, head=-40, jaw=1, hounds=-1, bob=-1, cl=(-7, 2, -5), w=W(115, -25, 9, 5))],
 # 들개 머리 물기: 뒤로 젖혔다가 몸째 앞으로 들이밀며 셋 다 덥석
 'bite': [P(lean=14, lunge=-3, head=-10, hounds=0.2, fr=(0, -4, 0)),
          P(lean=8, lunge=-5, head=-15, jaw=1, hounds=-0.3, fr=(0, -5, 0), cl=(-2, 0, -12)),
          P(lean=46, lunge=6, head=10, jaw=1, hounds=1, fr=(0, 8, 0), fl=(0, -4, 0), cl=(0, 10, -10)),
          P(lean=36, lunge=3, head=5, hounds=0.5, fr=(0, 5, 0))],
 # 연속 베기: 예고(칼을 뒤로) → 1타 가로 베기 → 2타 왼손 발톱 할퀴기 → 3타 칼 내려찍기 → 숨 고르기
 'rend': [P(lean=20, twist=30, crouch=2, fr=(0, -4, 0), w=W(140, 10, 9, 4)),
          P(lean=18, twist=38, crouch=3, fr=(0, -5, 0), w=W(150, 15, 9, 5)),
          P(lean=34, twist=-25, lunge=4, fr=(0, 7, 0), w=W(-40, 0, 11), smear=(W(145, 10, 9, 4), W(-40, 0, 11))),
          P(lean=38, twist=25, lunge=6, fl=(0, 7, 0), w=W(-80, -20, 8), cl=(4, 16, -2), smear='claw'),
          P(lean=48, lunge=8, crouch=4, head=8, fr=(0, 9, 0), fl=(0, -4, 0), w=W(0, -40, 12, -4), smear=(W(5, 100, 6, 14), W(0, -40, 12, -4))),
          P(lean=44, lunge=6, crouch=4, head=8, fr=(0, 8, 0), fl=(0, -4, 0), hounds=0.4, w=W(5, -55, 11, -4))],
 # 도약 덮치기: 깊게 웅크림 → 더 깊게 → 공중(몸을 길게 뻗음) → 착지(발톱·칼로 땅을 찍음) → 일어남
 'pounce': [P(lean=40, crouch=7, fl=(0, -3, 0), fr=(0, -3, 0), cl=(0, 2, -8), w=W(120, 0, 8)),
            P(lean=50, crouch=9, fl=(0, -5, 0), fr=(0, -5, 0), cl=(-2, -2, -6), hounds=-0.3, w=W(135, 10, 8, 2)),
            P(lean=62, crouch=0, head=-10, jaw=1, hounds=1, fl=(0, -10, 6), fr=(0, -12, 4), cl=(0, 14, 2), w=W(20, 20, 12, 6)),
            P(lean=58, crouch=8, head=10, jaw=1, hounds=1, fl=(0, -4, 0), fr=(0, 5, 0), cl=(0, 15, -14), w=W(10, -60, 12, -8)),
            P(lean=40, crouch=4, hounds=0.4, fr=(0, 3, 0), w=W(40, -60, 9))],
 'stagger': [P(lean=-10, head=-20, lunge=-3, jaw=1, hounds=-0.5, fl=(0, -4, 0), cl=(-6, -2, -4), w=W(120, 20, 9, 4)),
             P(lean=-4, head=-12, lunge=-4, crouch=2, hounds=-0.2, fl=(0, -5, 0), cl=(-5, -2, -6), w=W(110, 10, 9, 2))],
 'death': [P(lean=10, head=-20, crouch=4, jaw=1, hounds=-1, fl=(0, -4, 0), w=W(100, -20, 8)),
           P(lean=55, crouch=12, head=10, fl=(0, -6, 0), fr=(0, 4, 0), cl=(0, 12, -12), w=W(60, -80, 10, -6), blade=True),
           P(lean=55, crouch=12, head=10, fall=1, blade=False)],
}

# ---------------- 투영 ----------------
class View:
    def __init__(self, view, pose):
        self.F = FACE[view]
        self.R = (-self.F[1], self.F[0])
        self.base_y = FOOT_Y + pose['bob']
    def ground(self, p):
        return (self.R[0] * p[0] + self.F[0] * p[1], self.R[1] * p[0] + self.F[1] * p[1])
    def scr(self, p):
        g = self.ground(p)
        return (CX + g[0] * K, self.base_y + (g[1] * SQUASH - p[2]) * K)
    def depth(self, p):  # 카메라(남쪽 위) 쪽일수록 큼
        g = self.ground(p)
        return g[1] * 0.82 + p[2] * 0.57

def body_pt(p, pose, hip):
    """상체 점: 골반 기준으로 비틀기(twist) → 앞으로 숙이기(lean)"""
    x, y, z = p
    t = math.radians(pose['twist'])
    x, y = x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t)
    l = math.radians(pose['lean'])
    rz = z
    y, z = y * math.cos(l) + rz * math.sin(l), -y * math.sin(l) + rz * math.cos(l)
    return (hip[0] + x, hip[1] + y, hip[2] + z)

def head_pt(p, pose, base):
    """머리 점: 목 기준으로 들기/숙이기(head, 음수 = 위로 젖힘)"""
    x, y, z = p
    l = math.radians(pose['head'])
    y, z = y * math.cos(l) - z * math.sin(l), y * math.sin(l) + z * math.cos(l)
    return (base[0] + x, base[1] + y, base[2] + z)

def blade_dir(wp):
    a, e = math.radians(wp['a']), math.radians(wp['e'])
    return (math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e))

# ---------------- 몸 조립 ----------------
def build_body(pose):
    S = []   # ('s', 중심, 반지름, 재질) 공 / ('p', 점, 색, 크기) 색 점(눈·버클)
    def ball(c, r, m): S.append(('s', c, r, m))
    def tube(a, b, ra, rb, m, step=0.7):
        d = sub(b, a); L = math.sqrt(dot(d, d)); n = max(1, int(L / step))
        for i in range(n + 1):
            t = i / n
            ball(add(a, mul(d, t)), ra + (rb - ra) * t, m)
    def dotc(c, col, size=1): S.append(('p', c, col, size))

    hip = (0, pose['lunge'], HIP_Z - pose['crouch'])
    bp = lambda p: body_pt(p, pose, hip)
    chest = bp((0, 0, SPINE * 0.6)); top = bp((0, 0, SPINE))
    shR, shL = bp((SHOULDER_X, 0, SPINE - 2)), bp((-SHOULDER_X, 0, SPINE - 2))

    # 다리 (뒷발꿈치를 든 짐승 다리): 골반 → 무릎(앞) → 발목(뒤로 들림) → 발
    for side, sx, f in (('L', -HIP_X, pose['fl']), ('R', HIP_X, pose['fr'])):
        h = (hip[0] + sx, hip[1], hip[2])
        foot = (sx * 1.2 + f[0], pose['lunge'] * 0.5 + f[1] + 2, f[2])
        ankle_t = add(foot, (0, -4, 6))
        knee, ankle = ik(h, ankle_t, THIGH, SHIN - 3, (0, 1, 0.3))
        tube(h, knee, 5.5, 4.2, 'fur')
        tube(knee, ankle, 4.0, 2.8, 'fur')
        tube(ankle, foot, 2.8, 3.0, 'fur')
        for k in (-1.6, 0, 1.6):
            dotc(add(foot, (k, 3.5, 0.4)), MAT['bone'][2], 1)      # 발톱

    # 누더기 코트 자락: 골반 뒤쪽 반원에서 아래로 늘어진 조각들 (길이 들쭉날쭉)
    for i, ang in enumerate(range(-150, -20, 18)):
        a = math.radians(ang)
        root = bp((math.cos(a) * 8, math.sin(a) * 6 - 1, 3))
        L = [13, 17, 12, 18, 15, 11, 16, 14][i % 8]
        tip = (root[0] + math.cos(a) * 4, root[1] + math.sin(a) * 3 - 1, max(3, root[2] - L))
        tube(root, tip, 3.6, 2.4, 'coat')

    # 몸통: 골반 → 가슴 → 굽은 등(크게)
    tube(hip, chest, 8.5, 11.5, 'coat')
    ball(bp((0, -2, SPINE * 0.75)), 11.5, 'fur')                  # 굽은 등 털
    ball(bp((0, 2.5, SPINE * 0.55)), 9.5, 'coat')                  # 코트 앞섶
    dotc(bp((0, 11.5, SPINE * 0.62)), MAT['silver'][3], 1)         # 은 버클
    dotc(bp((-1, 11.0, SPINE * 0.45)), MAT['silver'][2], 1)
    tube(bp((-9, 6, SPINE * 0.85)), bp((8, 8, SPINE * 0.2)), 1.6, 1.6, 'strap')   # 어깨띠
    ball(bp((3, 6, SPINE * 0.35)), 3.2, 'flesh')                   # 물어뜯긴 옆구리
    ball(bp((-7, 4, SPINE * 0.9)), 3.0, 'flesh')

    # 늑대 머리 + 사냥꾼 모자
    neck = bp((0, 5, SPINE + 2))
    hp = lambda p: head_pt(p, pose, neck)
    tube(top, neck, 6.5, 5.5, 'fur')
    head = hp((0, 3, 3)); ball(head, 6.8, 'fur')
    tube(hp((0, 6, 2)), hp((0, 15, 0 - pose['jaw'] * 0.5)), 4.0, 2.4, 'fur')          # 주둥이
    if pose['jaw']: tube(hp((0, 6, -1.5)), hp((0, 13.5, -4.5)), 2.6, 1.8, 'flesh')     # 벌린 입
    dotc(hp((0, 16.6, 0.2)), (24, 20, 20), 1)                                          # 코
    for s in (-1, 1):
        dotc(hp((s * 2.6, 9.5, 3.8)), EYE, 1)                                          # 노란 눈
        tube(hp((s * 4.5, 1, 7)), hp((s * 6.5, -1, 11)), 2.0, 0.9, 'fur')             # 귀 (모자 옆으로)
    # 모자: 납작한 챙(작은 공을 원판으로) + 구겨진 꼭대기
    hc = hp((0, 2, 8.5))
    for rr in (2, 4.5, 7, 8.5):
        n = max(6, int(rr * 5))
        for i in range(n):
            a = 2 * math.pi * i / n
            ball(hp((math.cos(a) * rr, 2 + math.sin(a) * rr * 0.95, 7.8 + (0.6 if math.sin(a) > 0.6 else 0))), 1.9, 'hat')
    tube(hc, hp((0.8, 0.5, 13.5)), 5.0, 3.6, 'hat')
    tube(hp((-4.5, 2.5, 9.5)), hp((4.5, 2.5, 9.5)), 1.0, 1.0, 'strap')                # 모자 띠

    # 들개 머리 1: 왼어깨에서 튀어나옴 / 2: 오른 옆구리에서 / 다리: 등 뒤에 매달림
    hd = pose['hounds']
    def hound_head(root, out, fwd, r):
        """root에서 out 쪽으로 목, 머리는 fwd 방향을 봄. hd>0이면 앞으로 뻗어 물기, hd<0이면 위로 울부짖기"""
        up = max(0, -hd)
        f = norm(add(fwd, (0, 0, up * 1.6 - max(0, hd) * 0.2)))
        reach = 1 + max(0, hd) * 0.6
        nb = add(root, mul(out, 5 * reach))
        tube(root, nb, r * 0.8, r * 0.7, 'hound')
        hc_ = add(nb, mul(f, r * 0.6)); ball(hc_, r, 'hound')
        jaw = 1 if (hd > 0.5 or hd < -0.5) else 0.3
        sn = add(hc_, mul(f, r * 1.6))
        tube(add(hc_, mul(f, r * 0.6)), sn, r * 0.6, r * 0.42, 'hound')
        if jaw: tube(add(hc_, add(mul(f, r * 0.5), (0, 0, -r * 0.6))), add(sn, (0, 0, -r * 0.55 * jaw - 0.5)), r * 0.4, r * 0.3, 'flesh')
        side = norm((f[1], -f[0], 0)) if abs(f[2]) < 0.95 else (1, 0, 0)
        for s in (-1, 1):
            dotc(add(add(hc_, mul(f, r * 0.7)), add(mul(side, s * r * 0.5), (0, 0, r * 0.45))), EYE, 1)
            tube(add(hc_, add(mul(side, s * r * 0.55), (0, 0, r * 0.5))), add(hc_, add(mul(side, s * r * 0.8), add(mul(f, -r * 0.4), (0, 0, r * 1.5)))), 1.4, 0.6, 'hound')
        ball(root, r * 0.7, 'flesh')                                        # 붙은 자리 (상처)
    hound_head(bp((-SHOULDER_X - 1, 2, SPINE - 1)), norm((-0.8, 0.4, 0.5)), norm((-0.3, 1, 0.1)), 5.4)
    hound_head(bp((8, 5, SPINE * 0.35)), norm((0.7, 0.6, -0.1)), norm((0.4, 1, -0.1)), 4.8)
    leg_root = bp((-5, -9, SPINE * 0.7))
    knee_ = add(leg_root, (-5, -3, -7)); paw = add(knee_, (-1, 2, -7))
    tube(leg_root, knee_, 2.6, 2.2, 'hound'); tube(knee_, paw, 2.1, 1.8, 'hound'); ball(paw, 2.6, 'hound')
    ball(leg_root, 2.8, 'flesh')

    # 오른팔(칼): 어깨 → 손 목표 (팔꿈치 바깥·아래로)
    wp = pose['w']; a = math.radians(wp['a'])
    handR_t = add(shR, (math.sin(a) * wp['r'], math.cos(a) * wp['r'], -6 + wp['z']))
    elR, handR = ik(shR, handR_t, UPPER, FORE, (1, -0.5, -0.8))
    tube(shR, elR, 4.6, 3.8, 'coat'); tube(elR, handR, 3.6, 3.0, 'fur'); ball(handR, 3.2, 'fur')
    # 왼팔(긴 짐승 팔 + 발톱)
    cl = pose['cl']
    handL_t = add(shL, cl)
    elL, handL = ik(shL, handL_t, UPPER, FORE + 2, (-1, -0.6, -0.4))
    tube(shL, elL, 4.6, 3.8, 'coat'); tube(elL, handL, 3.6, 3.0, 'fur'); ball(handL, 3.4, 'fur')
    dl = norm(sub(handL, elL))
    for k in (-1.8, 0, 1.8):
        side = norm((dl[1], -dl[0], 0)) if abs(dl[2]) < 0.95 else (1, 0, 0)
        b0 = add(handL, add(mul(dl, 2.5), mul(side, k)))
        tube(b0, add(b0, mul(dl, 4)), 0.9, 0.5, 'bone', 0.5)

    blade = None
    if pose['blade']:
        blade = (handR, blade_dir(wp), elR)
    return S, blade, handR, shR

def render(S, V, blade, pose, shR):
    img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    px = img.load()
    zb = [[-1e9] * F for _ in range(F)]
    for it in S:
        if it[0] == 's':
            _, c, r, m = it
            sx, sy = V.scr(c); dc = V.depth(c) * K; ramp = MAT[m]; r = r * K
            for y in range(max(0, int(sy - r - 1)), min(F, int(sy + r + 2))):
                for x in range(max(0, int(sx - r - 1)), min(F, int(sx + r + 2))):
                    dx, dy = x + 0.5 - sx, y + 0.5 - sy
                    d2 = dx * dx + dy * dy
                    if d2 > r * r: continue
                    dz = math.sqrt(r * r - d2)
                    z = dc + dz
                    if z <= zb[y][x]: continue
                    zb[y][x] = z
                    l = (dx * LIGHT[0] + dy * LIGHT[1] + dz * LIGHT[2]) / r
                    i = 3 if l > 0.8 else 2 if l > 0.42 else 1 if l > 0.02 else 0
                    if m in ('fur', 'hound') and i > 0 and (x * 3 + y * 5) % 7 == 0: i -= 1   # 털결
                    if m == 'coat' and i > 0 and (x + y * 2) % 9 == 0: i -= 1                 # 해진 천
                    px[x, y] = ramp[i] + (255,)
    # 칼: 넓적한 도축칼 (판 + 날 하이라이트 + 톱니)
    if blade:
        hand, bd, _ = blade
        g = V.ground(bd); vec = (g[0], g[1] * SQUASH - bd[2])
        hs = V.scr(hand); hd = V.depth(hand) * K
        L, Wd = 30, 4.0
        pxv, pyv = -vec[1], vec[0]; nn = math.hypot(pxv, pyv) or 1; pxv, pyv = pxv / nn, pyv / nn
        bdepth = hd + (g[1] * 0.82 + bd[2] * 0.57) * 6
        def bplot(x, y, col, dep):
            x, y = int(round(x)), int(round(y))
            if 0 <= x < F and 0 <= y < F and dep >= zb[y][x] - 3:
                px[x, y] = col + (255,); zb[y][x] = max(zb[y][x], dep)
        for i in range(-4, 1):                                                     # 손잡이
            bplot(hs[0] + vec[0] * i * 0.9, hs[1] + vec[1] * i * 0.9, MAT['strap'][1], hd + 2)
        for t in range(2, L * 2):
            tt = t / 2
            cx_, cy_ = hs[0] + vec[0] * tt, hs[1] + vec[1] * tt
            dep = hd + (bdepth - hd) * tt / L + 1
            wv = Wd * (1 if tt < L - 4 else (L - tt) / 4 + 0.3)
            for s in range(-int(wv * 2), int(wv * 2) + 1):
                ss = s / 2
                col = MAT['silver'][1] if ss < wv - 1 else MAT['silver'][0]
                if ss < -wv + 1.2: col = MAT['silver'][3]                           # 날 (밝은 선)
                if ss > wv - 1 and int(tt) % 3 == 0: continue                      # 등쪽 톱니
                bplot(cx_ + pxv * ss, cy_ + pyv * ss, col, dep)
            if int(tt) % 5 == 2: bplot(cx_ + pxv * 0.5, cy_ + pyv * 0.5, (110, 40, 40), dep + 0.1)   # 피 얼룩
    # 잔상 (몸 뒤 빈칸에만)
    if pose['smear'] == 'claw':
        hs = V.scr(add(shR, (0, 0, 0)))
    elif pose['smear']:
        w0, w1 = pose['smear']
        for i in range(60):
            t = i / 59
            wp = {k: w0[k] + (w1[k] - w0[k]) * t for k in w0}
            a = math.radians(wp['a'])
            hand = add(shR, (math.sin(a) * wp['r'], math.cos(a) * wp['r'], -6 + wp['z']))
            bd = blade_dir(wp); g = V.ground(bd); vec = (g[0], g[1] * SQUASH - bd[2])
            hs = V.scr(hand)
            for tt in range(15, 34):
                x, y = int(round(hs[0] + vec[0] * tt)), int(round(hs[1] + vec[1] * tt))
                if 0 <= x < F and 0 <= y < F and px[x, y][3] == 0:
                    px[x, y] = (SMEAR if tt > 21 else SMEAR_EDGE) + (255,)
    for it in S:
        if it[0] == 'p':
            _, c, col, size = it
            sx, sy = V.scr(c); dep = V.depth(c) * K + 2.6
            x, y = int(sx), int(sy)
            if 0 <= x < F and 0 <= y < F and dep >= zb[y][x]: px[x, y] = col + (255,)
    return img

def claw_smear(img, V, pose, shL_hint):
    """2타 발톱 할퀴기: 왼손 앞쪽에 세 줄 궤적"""
    px = img.load()
    for k in range(3):
        for i in range(26):
            t = i / 25
            a = math.radians(-70 + 150 * t)
            p = (shL_hint[0] + math.sin(a) * (17 + k * 1.6), shL_hint[1] + math.cos(a) * (17 + k * 1.6), shL_hint[2] - 6)
            x, y = (int(round(v)) for v in V.scr(p))
            if 0 <= x < F and 0 <= y < F and px[x, y][3] == 0: px[x, y] = (SMEAR if t > 0.4 else SMEAR_EDGE) + (255,)

def finish(img):
    px = img.load(); res = img.copy(); rp = res.load()
    for y in range(F):
        for x in range(F):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < F and 0 <= Y < F and px[X, Y][3] and px[X, Y][:3] not in (SMEAR, SMEAR_EDGE):
                        rp[x, y] = OUTLINE + (255,); break
    sh = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([CX - 24, FOOT_Y - 4, CX + 24, FOOT_Y + 4], fill=(0, 0, 0, 80))
    sh.alpha_composite(res)
    return sh

def draw(view, pose):
    V = View(view, pose)
    S, blade, handR, shR = build_body(pose)
    img = render(S, V, blade, pose, shR)
    if pose['smear'] == 'claw':
        hip = (0, pose['lunge'], HIP_Z - pose['crouch'])
        claw_smear(img, V, pose, body_pt((-SHOULDER_X, 0, SPINE - 2), pose, hip))
    if pose['fall']:
        # 쓰러짐: 앞으로 엎어져 바닥에 붙음 (옆·대각선은 눕히고, 위·아래는 세로로 납작하게)
        bb = img.getbbox(); body = img.crop(bb)
        if view in ('side', 'downside', 'upside'): body = body.rotate(-80, expand=True, resample=Image.NEAREST)
        else: body = body.resize((body.width + 6, max(8, body.height // 2)), Image.NEAREST)
        img = Image.new('RGBA', (F, F), (0, 0, 0, 0))
        img.alpha_composite(body, (CX - body.width // 2, FOOT_Y + 2 - body.height))
    return finish(img)

def build():
    cols = max(len(v) for v in ANIMS.values())
    sheet = Image.new('RGBA', (cols * F, len(ANIMS) * len(VIEWS) * F), (0, 0, 0, 0))
    for ai, (n, frames) in enumerate(ANIMS.items()):
        for vi, v in enumerate(VIEWS):
            for fi, pose in enumerate(frames):
                sheet.alpha_composite(draw(v, pose), (fi * F, (ai * len(VIEWS) + vi) * F))
    sheet.save(os.path.join(OUT_DIR, 'mon_hunter.png'), optimize=True)
    mp = os.path.join(OUT_DIR, 'mon_px.json')
    meta = json.load(open(mp))
    meta['kinds']['hunter'] = {'key': 'mon_hunter', 'frameWidth': F, 'frameHeight': F, 'columns': cols,
                               'origin': {'x': 0.5, 'y': round((FOOT_Y + 2) / F, 4)},
                               'anims': {n: {'row': i * len(VIEWS), 'frames': len(ANIMS[n])} for i, n in enumerate(ANIMS)}}
    json.dump(meta, open(mp, 'w'), indent=1, ensure_ascii=False)
    print('ok hunter', sheet.size)

if __name__ == '__main__':
    build()
