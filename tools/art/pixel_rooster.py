"""
뒤틀린 거대 수탉 (촌장의 수탉 퀘스트) 도트 생성기 — pixel_hunter.py의 공·관 렌더러를 빌려 씀.
갈대나루 촌장이 애지중지하던 수탉 「알렉산더」가 뒤틀려 사람만 한 크기가 됨: 부풀어 오른 몸, 찢어진 볏, 붉은 눈 셋, 쇠갈퀴 같은 발톱.
동작 (잡몹 Mob과 같은 이름): idle 2, run 4, bite 4(쪼기), hurt 2, stagger 2, death 3
결과: assets/characters/mon_rooster.png + mon_px.json 의 kinds.rooster
실행: python3 tools/art/pixel_rooster.py
"""
import json, math, os
import pixel_hunter as ph
from PIL import Image

F = 96
ph.F, ph.CX, ph.FOOT_Y, ph.K = F, 48, 82, 1.0
ph.MAT.update({
    'feather':  [(84, 52, 36), (130, 76, 44), (176, 104, 56), (214, 142, 78)],     # 적갈색 깃털
    'tailf':    [(18, 34, 32), (30, 60, 52), (44, 92, 74), (70, 128, 96)],         # 검푸른 꼬리깃
    'comb':     [(120, 20, 24), (176, 34, 36), (214, 62, 56), (240, 110, 96)],     # 볏
    'beak':     [(150, 118, 40), (204, 166, 60), (232, 202, 96), (250, 230, 150)],
    'leg':      [(120, 96, 40), (170, 136, 58), (206, 172, 86), (230, 204, 120)],
})
EYE = (255, 60, 50)

def P(**k):
    base = dict(bob=0, lean=0, neck=0, peck=0, step=0, wing=0, fall=0, hurt=False)
    base.update(k); return base

ANIMS = {
    'idle': [P(), P(bob=1, neck=-1)],
    'run': [P(step=1, lean=10, wing=0.3), P(step=0, lean=12, bob=-2), P(step=-1, lean=10, wing=0.3), P(step=0, lean=12, bob=-2)],
    'bite': [P(neck=-4, lean=-8, wing=0.6), P(neck=-6, lean=-12, wing=1), P(peck=1, lean=24, neck=6), P(peck=0.5, lean=16, neck=3)],
    'hurt': [P(lean=-14, neck=-3, wing=1, hurt=True), P(lean=-6, wing=0.5)],
    'stagger': [P(lean=-10, neck=-5, wing=1, bob=1), P(lean=-4, neck=-2, wing=0.6)],
    'death': [P(lean=-10, neck=-4, wing=1), P(lean=20, neck=4, fall=0.5), P(fall=1)],
}

def body(pose):
    S = []
    def ball(c, r, m): S.append(('s', c, r, m))
    def tube(a, b, ra, rb, m, step=0.7):
        d = ph.sub(b, a); L = math.sqrt(ph.dot(d, d)); n = max(1, int(L / step))
        for i in range(n + 1):
            t = i / n; ball(ph.add(a, ph.mul(d, t)), ra + (rb - ra) * t, m)
    def dotc(c, col): S.append(('p', c, col, 1))
    lean = math.radians(pose['lean'])
    hip_z = 16 + pose['bob'] * 0.5
    # 다리 (번갈아 내딛음)
    for sx, k in ((-4, 1), (4, -1)):
        st = pose['step'] * k * 5
        hip = (sx, 0, hip_z)
        foot = (sx, st, 0)
        knee = (sx, st * 0.5 - 3, 8)
        tube(hip, knee, 2.4, 1.8, 'leg'); tube(knee, foot, 1.8, 1.5, 'leg')
        for dx in (-2, 0, 2): tube(foot, ph.add(foot, (dx, 4, 0)), 1.0, 0.6, 'bone', 0.5)   # 쇠갈퀴 발톱
        tube(foot, ph.add(foot, (0, -3, 1)), 0.9, 0.5, 'bone', 0.5)
    # 몸통: 부풀어 오른 큰 공
    by = math.sin(lean) * 4
    ball((0, by, hip_z + 8), 13, 'feather')
    ball((0, by + 5, hip_z + 11), 9, 'feather')                       # 가슴
    for sx in (-1, 1):                                                 # 날개 (펼침 정도)
        wsp = pose['wing']
        tube((sx * 10, by - 2, hip_z + 12), (sx * (14 + wsp * 8), by - 6, hip_z + 6 + wsp * 8), 4.5, 2.0, 'feather')
    # 꼬리깃: 뒤로 높이 솟은 검푸른 깃털 몇 가닥
    for i, a in enumerate((-30, -10, 10, 30)):
        ar = math.radians(a)
        root = (0, by - 10, hip_z + 12)
        tip = (math.sin(ar) * 9, by - 22, hip_z + 30 - abs(a) * 0.25)
        mid = (math.sin(ar) * 5, by - 20, hip_z + 30)
        tube(root, mid, 2.6, 2.0, 'tailf'); tube(mid, tip, 2.0, 0.8, 'tailf')
    # 목·머리: 앞으로 (쪼기면 쭉 뻗음)
    nk = pose['neck'] + pose['peck'] * 6
    neck0 = (0, by + 9, hip_z + 15)
    head = (0, by + 13 + nk, hip_z + 26 - pose['peck'] * 10 - max(0, -pose['neck']) * 0)
    tube(neck0, head, 5.0, 4.0, 'feather')
    ball(head, 5.2, 'feather')
    tube(ph.add(head, (0, 4, 0)), ph.add(head, (0, 9 + pose['peck'] * 2, -1)), 1.8, 0.6, 'beak', 0.5)   # 부리
    tube(ph.add(head, (0, 3, -3)), ph.add(head, (0, 5, -7)), 1.6, 1.0, 'comb', 0.5)                    # 턱볏
    for i in range(4):                                                                                  # 찢어진 볏
        tube(ph.add(head, (0, 2 - i * 2.2, 4)), ph.add(head, (0, 2.5 - i * 2.2, 8 + (i % 2) * 2)), 1.6, 1.1, 'comb', 0.5)
    for ex in (-2.4, 0, 2.4):                                                                           # 붉은 눈 셋 (뒤틀림)
        dotc(ph.add(head, (ex, 4.2, 1.5 + (1 if ex == 0 else 0))), EYE)
    ball(ph.add(head, (-3.5, 0, -2)), 1.6, 'flesh'); ball((5, by + 2, hip_z + 14), 2.4, 'flesh')       # 뒤틀린 상처
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
        if view in ('side', 'downside', 'upside'): b = b.rotate(-75 * pose['fall'], expand=True, resample=Image.NEAREST)
        else: b = b.resize((b.width + 4, max(8, int(b.height * (1 - 0.5 * pose['fall'])))), Image.NEAREST)
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
    sheet.save(os.path.join(ph.OUT_DIR, 'mon_rooster.png'), optimize=True)
    mp = os.path.join(ph.OUT_DIR, 'mon_px.json')
    meta = json.load(open(mp))
    meta['kinds']['rooster'] = {'key': 'mon_rooster', 'frameWidth': F, 'frameHeight': F, 'columns': cols,
                                'origin': {'x': 0.5, 'y': round((ph.FOOT_Y + 2) / F, 4)},
                                'anims': {n: {'row': i * len(views), 'frames': len(ANIMS[n])} for i, n in enumerate(ANIMS)}}
    json.dump(meta, open(mp, 'w'), indent=1, ensure_ascii=False)
    print('ok rooster', sheet.size)

if __name__ == '__main__':
    build()
