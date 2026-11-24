"""
프롤로그의 트롤 같은 괴물 (솔밭골을 쑥대밭으로 만든 놈 — 소년의 오랜 복수 목표) 도트 생성기.
pixel_hunter.py의 공·관 렌더러를 빌려 씀. 소년 키의 약 2.5배: 구부정한 거대한 몸, 땅에 닿을 듯 긴 팔과 큰 주먹,
어깨 사이에 파묻힌 작은 머리, 아래턱 엄니, 잿빛 바위 같은 피부에 이끼, 등의 혹을 뚫고 솟은 뼈(뒤틀림), 불씨 같은 주황 눈.
동작 (Boss 이름 규칙): idle 2, walk 4, roar 2, smash 4(두 주먹 내려찍기: 예고0·예고1·판정·회복), sweep 4(팔 휘두르기), stagger 2, death 3
결과: assets/characters/mon_troll.png + mon_px.json 의 kinds.troll
실행: python3 tools/art/pixel_troll.py
"""
import json, math, os
import pixel_hunter as ph
from PIL import Image

F = 232
ph.F, ph.CX, ph.FOOT_Y, ph.K = F, 116, 180, 1.32
ph.MAT.update({
    'skin':  [(54, 58, 56), (86, 92, 86), (118, 124, 112), (150, 154, 138)],     # 잿빛 바위 같은 피부
    'moss':  [(38, 54, 30), (58, 80, 40), (82, 108, 52), (110, 136, 66)],
    'cloth': [(40, 30, 24), (64, 48, 36), (88, 66, 46), (108, 84, 58)],          # 짐승 가죽 허리 두르개
    'tusk':  [(150, 138, 108), (196, 184, 150), (226, 216, 186), (244, 238, 214)],
})
EYE = (255, 150, 40)
EYE_HOT = (255, 226, 140)

def P(**k):
    base = dict(bob=0, crouch=0, lean=0, step=0, head=0, jaw=0,
                hl=(-6, 10, -36), hr=(6, 10, -36),     # 손 위치: 어깨 기준 (x 오른쪽, y 앞, z 위)
                fall=0, hurt=False, rot=0)
    base.update(k)
    return base

UP = dict(hl=(-4, 4, 26), hr=(4, 4, 26))               # 두 팔 머리 위로
ANIMS = {
    'idle': [P(), P(bob=1, crouch=1, head=1, hl=(-6, 11, -37), hr=(6, 11, -37))],
    'walk': [P(step=1, hl=(-6, -4, -34), hr=(6, 16, -32), lean=4),
             P(step=0, bob=-2, lean=6),
             P(step=-1, hl=(-6, 16, -32), hr=(6, -4, -34), lean=4),
             P(step=0, bob=-2, lean=6)],
    'roar': [P(lean=-10, head=-6, jaw=1, hl=(-24, 6, 10), hr=(24, 6, 10)),
             P(lean=-12, head=-7, jaw=1, bob=-1, hl=(-26, 4, 14), hr=(26, 4, 14))],
    # 두 주먹 내려찍기: 머리 위로 → 더 젖힘 → 쾅 (앞 바닥) → 웅크린 채 회복
    'smash': [P(lean=-6, head=-2, **UP),
              P(lean=-14, head=-4, jaw=1, bob=-2, hl=(-6, -2, 32), hr=(6, -2, 32)),
              P(lean=22, crouch=6, head=4, jaw=1, hl=(-8, 34, -44), hr=(8, 34, -44)),
              P(lean=16, crouch=4, head=3, hl=(-8, 30, -44), hr=(8, 30, -44))],
    # 팔 휘두르기 (오른팔): 왼쪽 뒤로 감음 → 더 감음 → 오른쪽 앞으로 크게 → 회복
    'sweep': [P(rot=-15, hr=(-16, 6, -4), hl=(-8, 8, -30)),
              P(rot=-25, lean=4, hr=(-24, 0, 0), hl=(-10, 6, -30)),
              P(rot=25, lean=10, jaw=1, hr=(30, 22, -12), hl=(-6, 4, -32)),
              P(rot=15, lean=8, hr=(24, 18, -26), hl=(-6, 8, -34))],
    'stagger': [P(lean=-12, head=-3, jaw=1, hl=(-14, -2, -24), hr=(14, -2, -24), bob=1),
                P(lean=-6, head=-1, hl=(-10, 2, -30), hr=(10, 2, -30))],
    'death': [P(lean=-14, head=-4, jaw=1, hl=(-14, 0, -20), hr=(14, 0, -20)), P(lean=24, crouch=10, fall=0.5), P(fall=1)],
}

def rotz(v, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2])

def body(pose):
    S = []
    def ball(c, r, m): S.append(('s', c, r, m))
    def tube(a, b, ra, rb, m, step=0.8):
        d = ph.sub(b, a); L = math.sqrt(ph.dot(d, d)); n = max(1, int(L / step))
        for i in range(n + 1):
            t = i / n; ball(ph.add(a, ph.mul(d, t)), ra + (rb - ra) * t, m)
    def dotc(c, col, size=1): S.append(('p', c, col, size))
    cr = pose['crouch']; ln = math.radians(pose['lean'])
    hip_z = 28 - cr + pose['bob'] * 0.5
    R = lambda v: rotz(v, pose['rot'])                   # 윗몸 비틀기 (휘두르기)
    # 다리: 짧고 굵게, 번갈아 내딛음
    for sx, k in ((-11, 1), (11, -1)):
        st = pose['step'] * k * 8
        hip = (sx, 0, hip_z)
        foot = (sx * 1.1, st, 0)
        knee, foot = ph.ik(hip, foot, 15, 15, (0, 1, 0.2))
        tube(hip, knee, 8, 7, 'skin'); tube(knee, foot, 7, 6, 'skin')
        ball(ph.add(foot, (0, 4, 2)), 6.5, 'skin')
        for dx in (-3, 0, 3): ball(ph.add(foot, (dx, 9, 1)), 1.8, 'tusk')             # 발톱
    # 허리 두르개 + 골반
    ball((0, 0, hip_z + 2), 14, 'skin')
    tube((-13, 2, hip_z), (13, 2, hip_z), 6, 6, 'cloth')
    # 윗몸: 앞으로 구부정 (lean)
    up = (0, math.sin(ln + 0.35), math.cos(ln + 0.35))
    def at(t, side=0, fwd=0):  # 허리에서 위로 t만큼, 옆 side, 앞 fwd
        return ph.add((side, fwd, hip_z + 4), ph.mul(up, t))
    ball(R(at(12, 0, 3)), 17, 'skin')                    # 배
    ball(R(at(26, 0, 4)), 21, 'skin')                    # 가슴
    hump = R(at(32, 0, -8))
    ball(hump, 17, 'skin')                               # 등 혹
    ball(ph.add(hump, (0, -2, 9)), 10, 'moss')           # 혹 위 이끼
    for bx, by, bz, h in ((-6, -10, 8, 15), (4, -12, 6, 19), (10, -6, 4, 11), (-12, -4, 2, 10)):   # 뼈 가시 (뒤틀림)
        root = ph.add(hump, (bx, by, bz))
        tube(root, ph.add(root, (bx * 0.3, -6, h)), 3.2, 0.8, 'tusk', 0.5)
    # 어깨·팔 (길고 굵음, 큰 주먹)
    hands = {}
    for side, key in ((-1, 'hl'), (1, 'hr')):
        sh = R(at(30, side * 23, 6))
        ball(sh, 10, 'skin')
        ball(ph.add(sh, (0, -2, 6)), 6, 'moss') if side < 0 else None
        tgt = ph.add(sh, R(pose[key]))
        elbow, hand = ph.ik(sh, tgt, 22, 22, (side * 1, -1, -0.2))
        tube(sh, elbow, 8.5, 7, 'skin'); tube(elbow, hand, 7.5, 9.5, 'skin')
        ball(hand, 10.5, 'skin')
        for dx in (-4, 0, 4): ball(ph.add(hand, (dx, 7, -3)), 3.2, 'skin')             # 손가락 마디
        hands[key] = hand
    # 머리: 어깨 사이 낮게, 앞으로
    hd = R(ph.add(at(34, 0, 18), (0, 0, -6 + pose['head'])))
    ball(hd, 10.5, 'skin')
    ball(ph.add(hd, (0, 3, 5)), 7, 'skin')               # 눈두덩
    ball(ph.add(hd, (0, -3, 9)), 5, 'moss')
    jaw = ph.add(hd, (0, 6, -6 - pose['jaw'] * 4))
    ball(jaw, 8.5, 'skin')
    if pose['jaw']: ball(ph.add(jaw, (0, 4, 3)), 4.5, 'flesh')                          # 벌린 입
    for sx in (-1, 1):                                                                   # 아래턱 엄니
        b0 = ph.add(jaw, (sx * 5, 6, 1))
        tube(b0, ph.add(b0, (sx * 1.5, 2, 8)), 2.4, 1.0, 'tusk', 0.5)
        dotc(ph.add(hd, (sx * 4.2, 9.5, 3)), EYE, 2)                                     # 불씨 같은 눈
        dotc(ph.add(hd, (sx * 4.0, 10, 3.5)), EYE_HOT, 1)
    return S

def draw(view, pose):
    V = ph.View(view, {'bob': 0})
    img = ph.render(body(pose), V, None, {'smear': None}, (0, 0, 0))
    if pose['hurt']:
        px = img.load()
        for y in range(F):
            for x in range(F):
                if px[x, y][3]: px[x, y] = tuple(min(255, int(v * 1.25 + 30)) for v in px[x, y][:3]) + (255,)
    if pose['fall']:
        bb = img.getbbox(); b = img.crop(bb)
        if view in ('side', 'downside', 'upside'): b = b.rotate(-80 * pose['fall'], expand=True, resample=Image.NEAREST)
        else: b = b.resize((b.width + 6, max(10, int(b.height * (1 - 0.55 * pose['fall'])))), Image.NEAREST)
        img = Image.new('RGBA', (F, F), (0, 0, 0, 0)); img.alpha_composite(b, (ph.CX - b.width // 2, ph.FOOT_Y + 2 - b.height))
    return ph.finish(img)

def build():
    views = ph.VIEWS
    cols = max(len(v) for v in ANIMS.values())
    sheet = Image.new('RGBA', (cols * F, len(ANIMS) * len(views) * F), (0, 0, 0, 0))
    for ai, (n, frames) in enumerate(ANIMS.items()):
        for vi, v in enumerate(views):
            for fi, pose in enumerate(frames):
                sheet.alpha_composite(draw(v, pose), (fi * F, (ai * len(views) + vi) * F))
    sheet.save(os.path.join(ph.OUT_DIR, 'mon_troll.png'), optimize=True)
    mp = os.path.join(ph.OUT_DIR, 'mon_px.json')
    meta = json.load(open(mp))
    meta['kinds']['troll'] = {'key': 'mon_troll', 'frameWidth': F, 'frameHeight': F, 'columns': cols,
                              'origin': {'x': 0.5, 'y': round((ph.FOOT_Y + 2) / F, 4)},
                              'anims': {n: {'row': i * len(views), 'frames': len(ANIMS[n])} for i, n in enumerate(ANIMS)}}
    json.dump(meta, open(mp, 'w'), indent=1, ensure_ascii=False)
    print('ok troll', sheet.size)

if __name__ == '__main__':
    build()
