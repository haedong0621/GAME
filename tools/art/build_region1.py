"""
첫 지역 맵 만들기 — 설계도(docs/maps/region1_plan.png, tools/art/region_plan.py)의 좌표 그대로 maps/world.tmj를 새로 만든다.
  100×70칸: 바닥(풀·흙길·물), 높이(절벽·낮은 턱·비탈·계단), 지역, 오브젝트(마을·거점·랜드마크·보스·들개·나무·채집…).
  만든 뒤 pixel_world.py --remap 으로 경계 타일·굽기(바닥 그림·절벽·충돌 격자)·소품 깔기까지 한다.
실행: python3 tools/art/build_region1.py   (Tiled에서 손으로 고치면 이 도구는 다시 돌리지 말 것 — 덮어씀)
"""
import json, math, os, random, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MAP = os.path.join(ROOT, '..', '..', 'maps', 'world.tmj')
T = 32
W, H = 100, 70
rnd = random.Random(2026)

def noise(x, y, s=0.0):
    return math.sin(x * 0.37 + s) * 0.5 + math.sin(y * 0.29 + s * 1.7) * 0.5 + math.sin((x + y) * 0.13 + s * 0.7) * 0.4

def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def dist_line(px, py, pts):
    return min(dist_seg(px, py, *a, *b) for a, b in zip(pts, pts[1:]))

def in_blob(x, y, cx, cy, rx, ry, seed, wob=0.2):
    a = math.atan2((y - cy) / ry, (x - cx) / rx)
    r = math.hypot((x - cx) / rx, (y - cy) / ry)
    w = 1 + wob * (math.sin(a * 2 + seed) * 0.6 + math.sin(a * 3 + seed * 2) * 0.4)
    return r < w

# ---------------- 설계 좌표 (칸) ----------------
RIVER = [(64, -1), (63, 8), (66, 16), (68, 24), (64, 32), (56, 40), (52, 48), (55, 56), (60, 64), (62, 71)]
ROADS = [
    [(14, 58), (20, 52), (22, 44), (18, 36), (12, 32)],                                  # 솔밭골 → 숲 깊은 곳
    [(14, 58), (26, 60), (36, 56), (42, 52), (44, 49)],                                  # 솔밭골 → 물레방앗간 (남쪽 비탈)
    [(44, 49), (50, 49), (58, 49), (62, 41), (68, 33), (72, 28), (76, 25)],              # 물레방앗간 → 다리 → 갈대나루
    [(76, 25), (73, 22), (62, 21), (54, 18)],                                            # 갈대나루 → 다리 → 사냥터 동쪽 비탈
    [(76, 25), (74, 16), (72, 11)],                                                      # 갈대나루 → 감시탑
    [(76, 25), (80, 36), (84, 48), (84, 54)],                                            # 갈대나루 → 늪
    [(76, 25), (84, 18), (90, 13)],                                                      # 갈대나루 → 도적 캠프
    [(36, 56), (34, 44), (40, 34), (50, 24)],                                            # 들판 가운데 → 사냥터 비탈
]
BRIDGES = [(54, 49), (66, 21)]                     # 강 건너는 곳 (가로 다리 가운데)
VILLAGES = {'solbat': (15, 58, 5), 'galdae': (78, 24, 6)}
REGIONS = [  # (번호, cx, cy, rx, ry, seed) 나중 것이 위에 칠해짐
    (3, 15, 37, 16, 15, 1.0), (4, 33, 11, 21, 10, 2.0), (5, 73, 9, 10, 6, 3.0), (5, 9, 10, 8, 7, 4.0),
    (1, 79, 30, 17, 12, 5.0), (2, 85, 59, 16, 12, 6.0),
]
# 높이: (값, 칸 판정 함수)  1 절벽 고지대 / 2 낮은 턱 / 4 비탈 고지대 / 3 계단(벽면 자리)
def height_at(x, y):
    # 북쪽 사냥터 고원: 남쪽은 협곡 절벽, 동쪽은 비탈
    if in_blob(x, y, 32, 9, 19, 11, 1.3, 0.12) and y <= 20 - (1 if (x * 7) % 5 == 0 else 0):
        return 4 if x >= 45 else 1
    # 북서 바위 절벽 위 제단
    if in_blob(x, y, 8, 9, 6, 5, 2.1, 0.15): return 1
    # 물레방앗간 고원 (북쪽 절벽, 남쪽 비탈)
    if in_blob(x, y, 44, 45, 6, 4, 0.7, 0.1): return 1 if y < 45 else 4
    # 감시탑 언덕 (사방 비탈)
    if in_blob(x, y, 73, 9, 5, 3.5, 3.3, 0.15): return 4
    # 들판의 낮은 턱 (뛰어내리기 지름길)
    if in_blob(x, y, 28, 46, 5, 2.2, 0.4, 0.15): return 2
    # 마른 들판 작은 비탈 언덕
    if in_blob(x, y, 88, 32, 5, 4, 1.9, 0.2): return 4
    return 0

def build():
    kinds = [['grass'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            # 강 (폭이 조금씩 달라짐), 늪 연못
            if dist_line(x + 0.5, y + 0.5, RIVER) < 1.4 + 0.5 * noise(x, y, 1): kinds[y][x] = 'water'
            if in_blob(x, y, 88, 62, 6, 4, 9, 0.25) or in_blob(x, y, 80, 66, 3, 2, 7, 0.3): kinds[y][x] = 'water'
    for r in ROADS:
        for y in range(H):
            for x in range(W):
                if dist_line(x + 0.5, y + 0.5, r) < 1.0 + 0.25 * noise(x, y, 3):
                    kinds[y][x] = 'dirt'                     # 강을 지나는 곳은 다리 밑 (지나갈 수 있음)
    for name, (cx, cy, r) in VILLAGES.items():              # 마을 광장 (흙)
        for y in range(H):
            for x in range(W):
                if math.hypot(x - cx, (y - cy) * 1.3) < r * 0.55 and kinds[y][x] != 'water': kinds[y][x] = 'dirt'
    Hgt = [[height_at(x, y) for x in range(W)] for y in range(H)]
    # 높은 곳 위에는 물·길 대신 풀 (길은 비탈로 올라감)
    for y in range(H):
        for x in range(W):
            if Hgt[y][x] and kinds[y][x] == 'water': kinds[y][x] = 'grass'
    # 쓰러진 거대 나무 = 협곡 절벽의 계단 자리 (30~31열, 절벽 아래 두 줄)
    for x in (30, 31):
        top = max(y for y in range(H) if Hgt[y][x] == 1)
        for y in (top + 1, top + 2): Hgt[y][x] = 3
    REG = [[0] * W for _ in range(H)]
    for v, cx, cy, rx, ry, sd in REGIONS:
        for y in range(H):
            for x in range(W):
                if in_blob(x, y, cx, cy, rx, ry, sd, 0.22): REG[y][x] = v

    # ---------------- 오브젝트 ----------------
    objs = []
    nid = [1]
    def add(type_, x, y, name=None, props=None, w=0, h=0, point=True):
        o = {'id': nid[0], 'name': name or type_, 'type': type_, 'x': round(x), 'y': round(y), 'rotation': 0, 'visible': True,
             'width': w, 'height': h}
        if point: o['point'] = True
        if props: o['properties'] = [{'name': k, 'type': 'int' if isinstance(v, int) and not isinstance(v, bool) else 'bool' if isinstance(v, bool) else 'string', 'value': v} for k, v in props.items()]
        objs.append(o); nid[0] += 1
        return o
    occupied = []           # (x, y, r) px — 나무 등 깔 때 피할 곳
    def occupy(x, y, r): occupied.append((x, y, r))
    def free(x, y, r=22):
        return all(math.hypot(x - ox, y - oy) >= r + orr for ox, oy, orr in occupied)
    tx = lambda v: v * T

    # 시작 지점: 솔밭골 광장
    add('spawn', tx(15.5), tx(60))
    # 건물 (building: sprite, 막는 발밑 크기)
    def building(sprite, x, y, bw, bh, name=None):
        add('building', x, y, name or sprite, {'sprite': sprite, 'blockW': bw, 'blockH': bh}); occupy(x, y - 30, 64)
    # 솔밭골: 집 4채 + 우물 + 울타리
    for i, (x, y) in enumerate([(9.5, 55), (20.5, 55), (10.5, 63.5), (19.5, 64)]):
        building(f'house{i % 2}', tx(x), tx(y), 76, 30, '솔밭골 집')
    building('well', tx(15), tx(57.2), 26, 12)
    for k in range(5): add('decor', tx(4 + k * 1.06), tx(66.5), 'fence', {'kind': 'fence_h'})
    # 갈대나루: 집 6채 + 우물 + 울타리
    for i, (x, y) in enumerate([(72.5, 20), (79, 18.5), (85.5, 20.5), (73.5, 29.5), (84, 29), (89.5, 25)]):
        building(f'house{(i + 1) % 2}', tx(x), tx(y), 76, 30, '갈대나루 집')
    building('well', tx(78.5), tx(25.2), 26, 12)
    for k in range(6): add('decor', tx(68 + k * 1.06), tx(32.5), 'fence', {'kind': 'fence_h'})
    # 물레방앗간 (토브의 베이스캠프 = 거점: 제작대 + 연습용 허수아비)
    building('watermill', tx(44.5), tx(44.6), 84, 26, '버려진 물레방앗간')
    add('workbench', tx(42.5), tx(47.3), '버려진 물레방앗간'); occupy(tx(42.5), tx(47), 40)
    add('decor', tx(47), tx(47.6), 'campfire', {'kind': 'campfire'}); occupy(tx(47), tx(47.5), 24)
    for x in (40, 48.5): add('monster', tx(x), tx(48.6), 'dummy', {'monsterId': 'training_dummy'}); occupy(tx(x), tx(48.5), 24)
    # 랜드마크
    building('ruin_tower', tx(73), tx(9.5), 40, 18, '무너진 감시탑')
    building('ruin_altar', tx(8), tx(9.5), 50, 14, '무너진 제단')
    for bx, by in BRIDGES:
        add('flat', tx(bx), tx(by + 0.5), '나무다리', {'sprite': 'bridge_h'})
    add('flat', tx(31), tx(19.5 + 3.3), '쓰러진 거대 나무', {'sprite': 'fallen_tree'})
    # 도적 캠프 (사람 적은 나중에 — 지금은 천막·모닥불·뼈만)
    for (x, y, k) in [(88, 11, 'tent'), (92.5, 12, 'tent'), (90, 14, 'campfire'), (93.5, 15, 'bones'), (87.5, 15.5, 'tent')]:
        add('decor', tx(x), tx(y), '도적 캠프', {'kind': k}); occupy(tx(x), tx(y), 30)
    # 덩굴: 제단 절벽 남쪽 벽면
    add('climb', tx(6.5), tx(14), '덩굴', None, 2 * T, 3 * T, point=False)
    # 보스
    add('monster', tx(33), tx(9), '뒤엉킨 사냥꾼', {'monsterId': 'mangled_hunter'}); occupy(tx(33), tx(9), 90)
    add('monster', tx(84), tx(57), '늪지 짐승', {'monsterId': 'swamp_brute'}); occupy(tx(84), tx(57), 90)
    # 들개 무리
    for cx, cy, n in [(82, 36, 3), (30, 52, 2), (25, 7, 3), (64, 56, 3)]:
        for k in range(n):
            x, y = tx(cx) + rnd.uniform(-40, 40), tx(cy) + rnd.uniform(-30, 30)
            add('monster', x, y, 'hound', {'monsterId': 'feral_hound'}); occupy(x, y, 20)
    # 자동 저장 구역 (지역 들어가는 길목)
    for name, (x, y, w_, h_) in {'버려진 물레방앗간 앞': (40, 50.5, 8, 1.2), '갈대나루 입구': (70, 26, 1.2, 6),
                                 '사냥꾼의 들판 비탈': (49, 21, 5, 1.2), '쓰러진 거대 나무 앞': (29, 25, 4, 1.2),
                                 '늪지 입구': (81, 47, 6, 1.2), '늙은참나무 숲 입구': (19, 47, 6, 1.2)}.items():
        add('autosave', tx(x), tx(y), name, None, tx(w_), tx(h_), point=False)
    # 어두운 숲 (적 시야 짧음 + 화면 어둡게)
    add('dark', tx(2), tx(26), 'dark_forest', None, tx(19), tx(18), point=False)

    # 막히는 곳·높은 곳 근처 판정 (나무 등을 피해서 깔기)
    def blocked(x, y):
        X, Y = int(x // T), int(y // T)
        if not (1 <= X < W - 1 and 1 <= Y < H - 1): return True
        if kinds[Y][X] != 'grass': return True
        for dy in range(-1, 4):                               # 절벽 벽면·가장자리 근처
            yy = Y - dy
            if 0 <= yy < H and Hgt[yy][X] in (1, 2, 3) and Hgt[Y][X] == 0: return True
        if Hgt[Y][X] and any(not Hgt[Y + a][X + b] for a in (-1, 0, 1) for b in (-1, 0, 1)): return True
        for r in ROADS:
            if dist_line(x / T, y / T, r) < 1.8: return True
        for name, (cx, cy, rr) in VILLAGES.items():
            if math.hypot(x / T - cx, (y / T - cy)) < rr + 1.5: return True
        return False
    DENS = {0: {'tree': 0.05, 'bush': 0.025, 'rock': 0.006}, 3: {'tree': 0.30, 'bush': 0.05, 'herb_patch': 0.012},
            4: {'tree': 0.06, 'bush': 0.03, 'rock': 0.015}, 5: {'tree': 0.015, 'rock': 0.06}, 1: {'tree': 0.03, 'bush': 0.02, 'rock': 0.008},
            2: {'tree': 0.09, 'bush': 0.02, 'herb_patch': 0.02}}
    for y in range(H):
        for x in range(W):
            r = REG[y][x]
            for kind, p in DENS[r].items():
                if rnd.random() >= p: continue
                px, py = tx(x) + rnd.uniform(6, 26), tx(y) + rnd.uniform(10, 30)
                if blocked(px, py) or not free(px, py, 26 if kind == 'tree' else 18): continue
                add(kind, px, py); occupy(px, py, 14 if kind == 'tree' else 10)
                break
    # 물가 약초, 사과 몇 개
    for _ in range(400):
        x, y = rnd.uniform(2, W - 2), rnd.uniform(2, H - 2)
        d = dist_line(x, y, RIVER)
        if 2.2 < d < 4 and not blocked(x * T, y * T) and free(x * T, y * T, 40):
            add('herb_patch', x * T, y * T); occupy(x * T, y * T, 12)
            if sum(1 for o in objs if o['type'] == 'herb_patch') > 26: break
    for _ in range(10):
        for _try in range(50):
            x, y = rnd.uniform(4, W - 4), rnd.uniform(30, H - 4)
            if not blocked(x * T, y * T) and free(x * T, y * T, 20):
                add('item', x * T, y * T, 'apple', {'itemId': 'apple', 'amount': 1}); occupy(x * T, y * T, 10); break

    # ---------------- 저장 (Tiled .tmj) ----------------
    gid = {'grass': 1, 'dirt': 5 + 15, 'water': 21 + 15}       # 종류만 맞으면 됨 (--remap이 경계 번호를 다시 매김)
    ground = [gid[kinds[y][x]] for y in range(H) for x in range(W)]
    HM, RM = 77, 81
    height = [(HM + v - 1) if v else 0 for row in Hgt for v in row]
    region = [(RM + v - 1) if v else 0 for row in REG for v in row]
    m = {
        'compressionlevel': -1, 'infinite': False, 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.10.2', 'type': 'map', 'version': '1.10', 'width': W, 'height': H, 'tilewidth': T, 'tileheight': T,
        'nextlayerid': 6, 'nextobjectid': nid[0],
        'layers': [
            {'id': 1, 'name': 'ground', 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': ground},
            {'id': 2, 'name': 'region', 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 0.5, 'visible': False, 'data': region},
            {'id': 3, 'name': 'height', 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 0.5, 'visible': False, 'data': height},
            {'id': 4, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'objects': objs},
        ],
        'tilesets': [
            {'firstgid': 1, 'name': 'world_tiles', 'image': '../assets/tiles/world_tiles.png', 'imagewidth': 256, 'imageheight': 320, 'tilewidth': T, 'tileheight': T, 'tilecount': 76, 'columns': 8, 'margin': 0, 'spacing': 0},
            {'firstgid': HM, 'name': 'height_marks', 'image': '../assets/tiles/height_marks.png', 'imagewidth': 4 * T, 'imageheight': T, 'tilewidth': T, 'tileheight': T, 'tilecount': 4, 'columns': 4, 'margin': 0, 'spacing': 0},
            {'firstgid': RM, 'name': 'region_marks', 'image': '../assets/tiles/region_marks.png', 'imagewidth': 5 * T, 'imageheight': T, 'tilewidth': T, 'tileheight': T, 'tilecount': 5, 'columns': 5, 'margin': 0, 'spacing': 0},
        ],
    }
    json.dump(m, open(MAP, 'w'), indent=1)
    print('map built', W, H, 'objects', len(objs), {k: sum(1 for o in objs if o['type'] == k) for k in ('tree', 'bush', 'rock', 'herb_patch', 'monster', 'building')})

if __name__ == '__main__':
    build()
    if '--no-remap' not in sys.argv:
        subprocess.run([sys.executable, os.path.join(ROOT, 'pixel_world.py'), '--remap'], check=True, cwd=ROOT)
