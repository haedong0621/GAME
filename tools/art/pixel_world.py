"""
배경 도트 생성기 — 바닥 타일(경계 자동 타일 포함)과 소품(나무·풀숲·제작대·허수아비).

타일셋 assets/tiles/world_tiles.png (32px, 8열):
  0~3   풀 (기본·풀포기·들꽃·자갈)
  4~19  흙길 16종: 4 + 이웃 마스크(N=1, E=2, S=4, W=8 — 그 방향도 흙길이면 1)
  20~35 물 16종:   20 + 이웃 마스크 (물가 거품·진흙 테두리), 모두 collides=true
  36~43 풀 추가 변형 (같은 무늬 반복이 덜 보이게 섞어 깐다)
소품: assets/tiles/tree0~2.png(56×80), bush.png(36×28), workbench.png(44×38), dummy.png(32×44)
채집: rock0~1.png·rock_rubble.png(34×28), stump.png(56×80, 나무와 같은 밑동), herb.png·herb_picked.png(22×20)
3/4 시점 입체: 흙길·물은 한 단 파인 땅(북쪽 흙벽이 보임), 소품은 공·원기둥·상자 면에 왼쪽 위 빛으로 명암 계산

  44~75 (예전 칸 단위 절벽 타일 — 지금은 안 씀. 절벽은 terrain_bake.py가 맵 전체를 부드럽게 구워 그림으로 만든다)
맵(maps/world.tmj)의 바닥은 --remap 으로 "풀/흙/물" 종류를 읽어 경계 타일 번호를 매기고,
height 레이어(1 절벽 고지대, 2 낮은 턱 고지대, 3 계단 자리)로 terrain_bake.py를 불러 절벽 그림·충돌 격자를 굽는다.
실행: python3 tools/art/pixel_world.py [--remap]
Godot: TileSet + Terrain(지형) 세트로 같은 자동 경계를 만들 수 있다.
"""
from PIL import Image, ImageDraw
import json, math, os, random, sys

T = 32
ROOT = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(ROOT, '..', '..', 'assets', 'tiles')
MAP = os.path.join(ROOT, '..', '..', 'maps', 'world.tmj')
OUTLINE = (22, 20, 18)

G = {'base': (64, 92, 52), 'dark': (50, 74, 42), 'deep': (40, 60, 36), 'light': (84, 114, 64), 'tuft': (98, 132, 72)}
D = {'base': (112, 90, 64), 'dark': (88, 70, 50), 'light': (136, 112, 82), 'edge': (70, 56, 42), 'pebble': (150, 140, 120)}
W = {'deep': (34, 58, 78), 'base': (46, 80, 102), 'light': (84, 122, 140), 'foam': (170, 196, 196), 'mud': (58, 66, 46)}

def noise_fill(img, box, base, dots, seed):
    rnd = random.Random(seed)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=base)
    for c, n in dots:
        for _ in range(n):
            x, y = rnd.randrange(x0, x1), rnd.randrange(y0, y1)
            img.putpixel((x, y), c)

# 빛은 왼쪽 위 앞쪽에서 온다 (주인공·몬스터 도트와 같은 방향)
LIGHT = (-0.45, -0.62, 0.64)

def put(img, x, y, c):
    if 0 <= x < img.size[0] and 0 <= y < img.size[1]: img.putpixel((x, y), c)

def blade_tuft(img, x, y, rnd, tall=4):
    """풀포기: 밑동은 그림자, 잎은 위로 서고 끝이 밝다 → 바닥에서 솟은 높이감"""
    put(img, x - 1, y + 1, G['deep']); put(img, x, y + 1, G['deep']); put(img, x + 1, y + 1, G['deep'])
    for bx, lean in ((-1, -1), (0, 0), (1, 1), (0, 1) if rnd.random() < 0.5 else (0, -1)):
        h = tall - abs(bx) - rnd.randint(0, 1)
        for k in range(h):
            px_ = x + bx + (lean if k >= h - 1 else 0)
            c = G['dark'] if k == 0 else G['tuft'] if k == h - 1 else G['light']
            put(img, px_, y - k, c)

def pebble(img, x, y, big=False):
    """돌멩이: 윗면 밝고 아랫면 어둡고 아래에 그림자"""
    w = 3 if big else 2
    for i in range(w): put(img, x + i, y + 1, D['edge']); put(img, x + i, y + 2, (40, 50, 34))
    for i in range(w): put(img, x + i, y, D['pebble'])
    put(img, x, y, (186, 178, 158))
    if big:
        put(img, x + 1, y - 1, D['pebble']); put(img, x + 1, y + 1, D['light'])

def grass(variant, seed):
    img = Image.new('RGB', (T, T))
    noise_fill(img, (0, 0, T, T), G['base'], [(G['dark'], 60), (G['light'], 30), (G['deep'], 16)], seed)
    px = img.load()
    rnd = random.Random(seed + 7)
    # 가는 풀잎 (세로 2px, 끝 밝음)
    for _ in range(14):
        x, y = rnd.randrange(1, T - 1), rnd.randrange(2, T - 1)
        put(img, x, y, G['dark']); put(img, x, y - 1, G['light'])
    for _ in range(5 if variant == 1 else rnd.randint(0, 2)):
        blade_tuft(img, rnd.randrange(4, T - 4), rnd.randrange(7, T - 3), rnd, 5 if variant == 1 else 4)
    if variant == 2:  # 들꽃 (줄기 + 꽃 + 그림자)
        for c in ((206, 184, 98), (180, 100, 108), (214, 214, 198)):
            x, y = rnd.randrange(4, T - 4), rnd.randrange(6, T - 3)
            put(img, x, y + 1, G['deep']); put(img, x, y, G['dark']); put(img, x, y - 1, G['dark'])
            put(img, x, y - 2, c); put(img, x - 1, y - 2, tuple(int(v * 0.8) for v in c)); put(img, x + 1, y - 2, tuple(int(v * 0.8) for v in c)); put(img, x, y - 3, c)
    if variant == 3:  # 자갈
        for i in range(3):
            pebble(img, rnd.randrange(3, T - 6), rnd.randrange(4, T - 5), big=(i == 0))
    return img

def wobble(i, side, amp=1.6, base=4):
    """경계가 들어가는 깊이 (가장자리 좌표 i에 따라 울퉁불퉁, 방향마다 다른 무늬)"""
    k = {'N': 0.0, 'E': 1.7, 'S': 3.1, 'W': 4.6}[side]
    return base + round(amp * math.sin(i * 0.55 + k) + 0.8 * math.sin(i * 1.3 + k * 2))

def inside(x, y, mask, base=4):
    """마스크(이웃 연결)에 따라 이 픽셀이 흙/물 영역 안인가. 칸 밖 좌표는 이웃이 같은 종류인지로 판단"""
    n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8
    if y < 0: return bool(n) and 0 <= x < T or (bool(n) and inside(min(max(x, 0), T - 1), 0, mask, base))
    if y >= T: return bool(s) and inside(min(max(x, 0), T - 1), T - 1, mask, base)
    if x < 0: return bool(w) and inside(0, y, mask, base)
    if x >= T: return bool(e) and inside(T - 1, y, mask, base)
    if not n and y < wobble(x, 'N', base=base): return False
    if not s and y > T - 1 - wobble(x, 'S', base=base): return False
    if not w and x < wobble(y, 'W', base=base): return False
    if not e and x > T - 1 - wobble(y, 'E', base=base): return False
    # 두 방향이 열린 모서리는 둥글게
    r = base + 4
    for cx, cy, a, b in ((0, 0, n, w), (T - 1, 0, n, e), (0, T - 1, s, w), (T - 1, T - 1, s, e)):
        if not a and not b and abs(x - cx) < r + base and abs(y - cy) < r + base:
            ox = cx + (r + base if cx == 0 else -(r + base)); oy = cy + (r + base if cy == 0 else -(r + base))
            if (x - ox) ** 2 + (y - oy) ** 2 > (r + 1) ** 2 and ((x < ox) == (cx == 0)) and ((y < oy) == (cy == 0)):
                return False
    return True

def terrain(kind, mask, seed):
    """흙길·물은 풀밭보다 한 단 낮게 파인 땅으로 그린다 (3/4 시점).
    북쪽 가장자리: 풀 턱 아래로 흙벽(정면을 향한 면)이 보이고, 그 밑에 그림자.
    남쪽 가장자리: 풀 턱 윗선이 빛을 받아 밝다(벽은 안 보임). 서쪽: 그림자, 동쪽: 밝은 가장자리."""
    img = grass(0, seed)
    px = img.load()
    rnd = random.Random(seed + 5)
    wall_h = 3 if kind == 'dirt' else 5
    base = 4 if kind == 'dirt' else 5
    inn = lambda x, y: inside(x, y, mask, base)
    wallC = [(96, 74, 52), (82, 62, 44), (70, 52, 38), (58, 44, 32), (50, 40, 30)] if kind == 'dirt' else \
            [(86, 70, 50), (72, 58, 42), (60, 48, 36), (48, 40, 32), (36, 40, 36)]
    def dist_edge(x, y, lim=6):
        for r in range(1, lim + 1):
            for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r), (r, r), (-r, -r), (r, -r), (-r, r)):
                if not inn(x + dx, y + dy): return r
        return lim + 1
    for y in range(T):
        for x in range(T):
            if not inn(x, y):
                # 파인 곳 위쪽 턱(남쪽 가장자리의 풀): 윗선이 빛을 받음
                if inn(x, y - 1): px[x, y] = G['tuft']
                elif inn(x, y + 1): px[x, y] = G['deep']           # 북쪽 턱: 풀이 벽 위로 살짝 그늘
                elif inn(x + 1, y) or inn(x - 1, y): px[x, y] = G['dark']
                continue
            # 벽: 위로 wall_h 안에 바깥(풀)이 있으면 그 높이만큼 벽면
            k = next((k for k in range(1, wall_h + 1) if not inn(x, y - k)), 0)
            if k:
                c = wallC[min(k - 1, len(wallC) - 1)]
                if k == 1 and rnd.random() < 0.3: c = G['dark']    # 벽 위로 늘어진 풀뿌리
                elif (x * 3 + k) % 7 == 0: c = wallC[min(k, len(wallC) - 1)]  # 흙층 무늬
                px[x, y] = c
                continue
            de = dist_edge(x, y)
            shade_w = not inn(x - 1, y) or not inn(x - 2, y)       # 서쪽 벽 그늘
            under_wall = any(not inn(x, y - j) for j in range(wall_h + 1, wall_h + 3))  # 북쪽 벽 바로 밑 그림자
            lit_e = not inn(x + 1, y)
            if kind == 'dirt':
                c = D['base']
                r = rnd.random()
                if r < 0.18: c = D['dark']
                elif r < 0.27: c = D['light']
                if under_wall or shade_w: c = D['edge'] if r < 0.6 else D['dark']
                elif lit_e: c = D['light']
                px[x, y] = c
            else:
                # 물: 가장자리는 얕아서 밝고(진흙 비침), 안쪽일수록 깊고 어둡다
                if under_wall: c = W['mud'] if de <= 1 else (26, 44, 60)  # 벽 밑 수면 그림자
                elif not inn(x, y + 1) or lit_e or shade_w and de <= 1: c = W['foam']
                elif de <= 2: c = (70, 100, 104)
                elif de <= 4: c = W['base']
                else: c = (36, 62, 82) if rnd.random() < 0.97 else W['base']
                px[x, y] = c
    if kind == 'dirt':
        # 바퀴 자국(살짝 파인 홈: 위 어둡고 아래 밝게)과 돌멩이
        for _ in range(2):
            x, y = rnd.randrange(6, T - 8), rnd.randrange(8, T - 6)
            if all(inn(x + i, y + j) and not any(not inn(x + i, y + j - q) for q in range(1, 6)) for i in range(-1, 7) for j in range(-1, 3)):
                for i in range(5):
                    px[x + i, y] = D['edge']; px[x + i, y + 1] = D['light']
        for _ in range(3):
            x, y = rnd.randrange(4, T - 6), rnd.randrange(6, T - 5)
            if all(inn(x + i, y + j) and not any(not inn(x + i, y + j - q) for q in range(1, 6)) for i in range(-1, 4) for j in range(-1, 3)):
                pebble(img, x, y, big=rnd.random() < 0.3)
    else:
        for _ in range(3):  # 잔물결 (밝은 위선 + 어두운 아래선)
            x, y = rnd.randrange(5, T - 10), rnd.randrange(9, T - 6)
            if all(inn(x + i, y + j) and dist_edge(x + i, y + j) > 3 for i in range(5) for j in range(2)):
                for i in range(4): px[x + i, y] = W['light']
                for i in range(1, 5): px[x + i, y + 1] = W['deep']
    return img

# ---------------- 절벽 (높이 2단: 땅 / 고지대) ----------------
# 3/4 시점 규칙: 고지대 윗면은 제 칸에 그대로, 남쪽 가장자리 "아래 칸"에 절벽 벽면을 그린다 (스타듀밸리·드로바식).
#   절벽(높이값 1): 벽면 2칸 (윗줄: 풀이 늘어진 턱, 아랫줄: 밑동 그림자) — 못 지나감, 덩굴(climb)로만 오름
#   낮은 턱(높이값 2): 벽면 1칸 — 위에서 아래로 뛰어내릴 수 있음
#   오르막(높이값 3): 벽면 자리에 돌계단 — 오르내릴 수 있음
# 벽면 끝: 왼쪽·오른쪽이 이어지는지(L=1, R=2)로 4종 — 끝이면 둥글게 깎이고 옆면이 보임
FACE = [(44, 38, 32), (62, 52, 42), (84, 70, 54), (108, 90, 68), (132, 112, 84)]
CLIFF_TOP, CLIFF_BOT, LEDGE, RAMP_TOP, RAMP_BOT, RAMP_LEDGE, RIM, BASE_SHADOW = 44, 48, 52, 56, 57, 58, 59, 75

def face_tile(kind, conn, seed):
    """kind: 'top' | 'bot' | 'ledge', conn: L=1 R=2 (옆 칸도 벽면이면 이어짐)"""
    rnd = random.Random(seed)
    img = grass(0, seed)                # 벽이 깎인 바깥은 풀 (끝 부분)
    px = img.load()
    Lc, Rc = conn & 1, conn & 2
    lip = 5 if kind in ('top', 'ledge') else 0
    bottom = T if kind == 'top' else T - 6 if kind == 'bot' else T - 8
    def inside(x, y):
        # 끝(이어지지 않은 쪽)은 아래로 갈수록 둥글게 안쪽으로 깎임
        if not Lc and x < 3 + (2 if y > bottom - 8 and kind != 'top' else 0): return False
        if not Rc and x > T - 4 - (2 if y > bottom - 8 and kind != 'top' else 0): return False
        return y < bottom
    for y in range(T):
        for x in range(T):
            if not inside(x, y): continue
            # 흙·바위 층: 가로 지층 + 위에서 빛 (위 밝고 아래 어두움)
            depth = (y + (0 if kind != 'bot' else T)) / (2 * T if kind != 'ledge' else T)
            i = 3 if depth < 0.2 else 2 if depth < 0.55 else 1
            strata = (y + int(2 * math.sin(x * 0.4 + seed))) % 9
            if strata == 0: i = max(0, i - 1)
            elif strata == 1 and i < 4: i += 1
            if (x * 7 + y * 3 + seed) % 23 == 0: i = max(0, i - 1)
            if not Lc and x < 5: i = max(0, i - 1)          # 옆면(끝) 그늘
            if not Rc and x > T - 6: i = min(4, i + 1)       # 오른쪽 끝은 빛 받는 쪽
            px[x, y] = FACE[i]
    # 세로 금
    for _ in range(2):
        x = rnd.randrange(6, T - 6); y0 = rnd.randrange(lip + 2, max(lip + 3, bottom - 8))
        for k in range(rnd.randint(4, 8)):
            X, Y = x + (k // 3) * rnd.choice((-1, 1)), y0 + k
            if 0 <= X < T and Y < bottom and inside(X, Y): px[X, Y] = FACE[0]
    # 박힌 돌
    for _ in range(2):
        x, y = rnd.randrange(5, T - 7), rnd.randrange(lip + 3, max(lip + 4, bottom - 5))
        if inside(x, y) and inside(x + 2, y + 1):
            for dx, dy, c in ((0, 0, 4), (1, 0, 4), (2, 0, 3), (0, 1, 2), (1, 1, 2), (2, 1, 1)):
                px[x + dx, y + dy] = FACE[c]
    # 윗턱: 풀이 벽 위로 늘어짐 (들쭉날쭉)
    if lip:
        for x in range(T):
            if not inside(x, lip + 1) and not inside(x, 0): continue
            h = lip + (1 if (x * 5 + seed) % 4 == 0 else 0) + (2 if (x * 3 + seed) % 7 == 0 else 0)
            for y in range(h):
                px[x, y] = G['tuft'] if y == 0 else G['base'] if y < h - 2 else G['dark']
            px[x, h] = G['deep']
    # 밑동: 아래쪽 땅과 만나는 곳에 부스러기·그늘
    if kind in ('bot', 'ledge'):
        for x in range(T):
            if inside(x, bottom - 1):
                for y in range(bottom, min(T, bottom + 4)):
                    c = px[x, y]
                    px[x, y] = tuple(int(v * (0.55 + 0.1 * (y - bottom))) for v in c)
        for _ in range(3):
            x = rnd.randrange(4, T - 6)
            if inside(x, bottom - 1):
                px[x, bottom] = FACE[2]; px[x + 1, bottom] = FACE[3]; px[x, bottom + 1] = FACE[1]
    return img

def ramp_tile(kind, seed):
    """돌계단: 디딤돌(밝은 윗면 + 어두운 앞면)이 줄지어. 양옆은 낮은 돌턱"""
    img = Image.new('RGB', (T, T), FACE[1])
    px = img.load()
    step = 8
    off = 0 if kind != 'bot' else 4
    for y in range(T):
        k = (y + off) % step
        for x in range(T):
            c = FACE[3] if k < 3 else FACE[2] if k < 5 else FACE[1]
            if k == 2: c = FACE[4] if (x + y) % 5 else FACE[3]
            if x < 4 or x > T - 5: c = FACE[1] if x in (3, T - 4) else FACE[2] if k < 4 else FACE[0]   # 옆 돌턱
            px[x, y] = c
    if kind in ('top', 'ledge'):
        for x in range(T):
            px[x, 0] = G['tuft']; px[x, 1] = G['base']; px[x, 2] = G['dark']
    if kind in ('bot', 'ledge'):
        for x in range(T):
            for y in range(T - 3, T): px[x, y] = tuple(int(v * 0.7) for v in px[x, y])
    return img

def rim_tile(mask):
    """고지대 윗면 가장자리 덧그림 (투명 바탕). mask: 그 방향 이웃이 낮은 땅이면 N=1 E=2 S=4 W=8"""
    img = Image.new('RGBA', (T, T), (220, 236, 170, 26))   # 고지대 윗면은 살짝 밝게 (빛을 더 받음)
    px = img.load()
    dark, light = (30, 44, 28, 255), (120, 150, 86, 255)
    for i in range(T):
        if mask & 1: px[i, 0] = dark; px[i, 1] = light                     # 뒤쪽 가장자리
        if mask & 4: px[i, T - 1] = light                                   # 앞 가장자리 (벽면 위 턱)
        if mask & 8: px[0, i] = dark; px[1, i] = (40, 58, 36, 200)          # 왼쪽 낭떠러지
        if mask & 2: px[T - 1, i] = dark; px[T - 2, i] = light              # 오른쪽 낭떠러지 (빛 받음)
    return img

def base_shadow():
    """절벽 바로 아래 땅에 드리우는 그늘 (투명 바탕)"""
    img = Image.new('RGBA', (T, T), (0, 0, 0, 0))
    px = img.load()
    for y in range(7):
        for x in range(T):
            px[x, y] = (8, 14, 8, int(110 * (1 - y / 7)))
    return img

def cliff_tiles():
    t = [face_tile('top', c, 500 + c) for c in range(4)]
    t += [face_tile('bot', c, 510 + c) for c in range(4)]
    t += [face_tile('ledge', c, 520 + c) for c in range(4)]
    t += [ramp_tile('top', 1), ramp_tile('bot', 2), ramp_tile('ledge', 3)]
    t += [rim_tile(m) for m in range(16)]
    t += [base_shadow()]
    return t

def vines():
    """덩굴: 절벽 벽면(2칸) 위에 덮는 그림 32×64. 이게 있는 곳만 기어오를 수 있다"""
    rnd = random.Random(9)
    img = Image.new('RGBA', (T, 2 * T), (0, 0, 0, 0))
    px = img.load()
    V = [(30, 52, 30), (44, 76, 40), (64, 104, 54), (92, 132, 70)]
    for k in range(4):
        x = 4 + k * 7 + rnd.randint(-1, 1)
        for y in range(2, 2 * T - 4 - rnd.randint(0, 8)):
            xx = x + int(1.5 * math.sin(y * 0.25 + k))
            put(img, xx, y, V[0] + (255,)); put(img, xx + 1, y, V[1] + (255,))
            if y % 5 == k % 5:                                            # 잎
                for dx, dy, c in ((2, 0, 2), (3, 0, 3), (2, 1, 1), (-1, 0, 2), (-2, 1, 1)):
                    put(img, xx + dx, y + dy, V[c] + (255,))
    return outline(img)

def tileset():
    tiles = [grass(v, 100 + v) for v in range(4)]
    tiles += [terrain('dirt', m, 200 + m) for m in range(16)]
    tiles += [terrain('water', m, 300 + m) for m in range(16)]
    tiles += [grass(0 if v < 5 else 1 if v < 7 else 2, 400 + v) for v in range(8)]  # 36~43: 풀 추가 변형 (반복 무늬 줄이기)
    tiles += cliff_tiles()                                                              # 44~75: 절벽·계단·가장자리
    cols = 8
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new('RGBA', (cols * T, rows * T), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * T, (i // cols) * T))
    sheet.save(os.path.join(TILES_DIR, 'world_tiles.png'))
    return len(tiles), cols, sheet.size

# ---------------- 소품 (3/4 시점 입체: 공·원기둥·상자 면에 빛을 계산해 칠한다) ----------------
def outline(img):
    px = img.load(); w, h = img.size; res = img.copy(); rp = res.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < w and 0 <= Y < h and px[X, Y][3] > 200:
                        rp[x, y] = OUTLINE + (255,); break
    return res

def shadow(img, cx, cy, rx, ry, alpha=90):
    """바닥 그림자 (빛이 왼쪽 위라 오른쪽 아래로 살짝 밀림)"""
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - rx + 2, cy - ry, cx + rx + 2, cy + ry], fill=(10, 16, 10, alpha))
    sh.alpha_composite(img)
    return sh

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

def shade_idx(n, ramp_len, x, y, ao=0.0, dither=True):
    """법선 → 빛 세기 → 색 단계 (dither면 경계를 바이어 디더로 부드럽게, 아니면 딱 끊긴 셀 셰이딩)"""
    l = max(0.0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
    v = 0.18 + 0.95 * l - ao
    v = min(max(v, 0), 0.999) * ramp_len
    i = int(v)
    if dither and v - i > (BAYER[y % 4][x % 4] + 0.5) / 16 and i < ramp_len - 1: i += 1
    return i

def render_spheres(img, spheres, ramp, rnd=None, floor_y=None, dither=True, squash=1.0):
    """공 덩어리들을 z버퍼로 그린다. spheres: (cx, cy, cz, r, ramp?) 화면좌표. 앞쪽(z 큰) 픽셀이 이긴다"""
    w, h = img.size
    zb = [[-1e9] * w for _ in range(h)]
    px = img.load()
    for s in spheres:
        cx, cy, cz, r = s[:4]
        rp = s[4] if len(s) > 4 else ramp
        for y in range(max(0, int(cy - r * squash - 1)), min(h, int(cy + r * squash + 2))):
            for x in range(max(0, int(cx - r - 1)), min(w, int(cx + r + 2))):
                dx, dy = x + 0.5 - cx, (y + 0.5 - cy) / squash
                d2 = dx * dx + dy * dy
                if d2 > r * r: continue
                dz = math.sqrt(r * r - d2)
                z = cz + dz
                if z <= zb[y][x]: continue
                zb[y][x] = z
                n = (dx / r, dy / r, dz / r)
                ao = 0.25 * max(0, (y - (floor_y if floor_y is not None else h)) / 10 + 1) if floor_y is not None else 0
                # 덩어리 사이 틈(뒤에 있는 공 테두리)은 어둡게
                ao += 0.18 * (1 - dz / r) ** 2
                px[x, y] = rp[shade_idx(n, len(rp), x, y, ao, dither)] + (255,)
    return zb

def cylinder(img, cx, y0, y1, r0, r1, ramp, rnd, grooves=True):
    """세로 원기둥(줄기·기둥): 왼쪽 밝고 오른쪽 어둡다. y0(위)→y1(아래)로 반지름 r0→r1"""
    px = img.load()
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        r = r0 + (r1 - r0) * t
        c = cx(y) if callable(cx) else cx
        for x in range(int(c - r), int(c + r) + 1):
            dx = (x + 0.5 - c) / max(r, 0.5)
            if abs(dx) > 1: continue
            n = (dx, 0.15, math.sqrt(max(0, 1 - dx * dx)))
            i = shade_idx(n, len(ramp), x, y)
            if grooves and rnd and (x * 5 + (y // 3) * 3) % 6 == 0 and i > 0: i -= 1  # 나무껍질 세로 결
            px[x, y] = ramp[i] + (255,)

LEAF = [(20, 34, 26), (30, 50, 32), (40, 68, 40), (54, 88, 48), (72, 110, 58), (96, 134, 72)]
BARK = [(38, 28, 22), (54, 40, 30), (72, 54, 38), (94, 72, 50), (116, 92, 64)]

def leaf_clumps(cx, cy, rx, ry, n, rnd, rmin, rmax):
    """큰 타원 덩어리 표면에 작은 잎뭉치 공들을 붙인다 → 뭉게뭉게한 입체 잎"""
    out = []
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        rr = math.sqrt(rnd.uniform(0.15, 1.0))
        x, y = cx + math.cos(a) * rx * rr, cy + math.sin(a) * ry * rr
        z = math.sqrt(max(0, 1 - rr * rr)) * min(rx, ry) * 0.9
        out.append((x, y, z, rnd.uniform(rmin, rmax)))
    return out

def tree(seed):
    rnd = random.Random(seed)
    Wd, Ht = 56, 80
    img = Image.new('RGBA', (Wd, Ht), (0, 0, 0, 0))
    cx = Wd // 2
    lean = rnd.choice((-2, -1, 1, 2))
    # 줄기: 원기둥 + 밑동이 넓게 퍼짐(뿌리)
    cylinder(img, lambda y: cx + lean * (1 - (y - 44) / 32) * 1.2, 44, 75, 3.5, 5.5, BARK, rnd)
    for s in (-1, 1):  # 뿌리 (원기둥 조각)
        for k in range(8):
            x = cx + s * (4 + k); y = 74 + k // 3
            for yy in range(y - 2 + k // 4, y + 1):
                put(img, int(x), yy, (BARK[3] if s < 0 else BARK[1]) + (255,))
    # 잎 덩어리: 큰 덩어리 셋 + 표면 잎뭉치
    sph = []
    main = [(cx + rnd.randint(-2, 2), 30, 0, 19), (cx - 11, 36, -4, 12), (cx + 11, 36, -4, 12), (cx - 4, 18, -2, 12), (cx + 7, 17, -3, 11)]
    for b in main:
        sph.append(b)
        sph += leaf_clumps(b[0], b[1], b[3] * 0.85, b[3] * 0.85, int(b[3] * 1.6), rnd, 3.2, 5.0)
    zb = render_spheres(img, sph, LEAF)
    # 잎이 줄기 위에 드리운 그림자
    px = img.load()
    for y in range(44, 52):
        for x in range(cx - 7, cx + 8):
            p = px[x, y]
            if p[3] and p[:3] in BARK: px[x, y] = BARK[0] + (255,)
    # 반짝이는 잎끝 몇 점 (빛 받는 쪽)
    for _ in range(18):
        x, y = rnd.randrange(8, Wd - 8), rnd.randrange(4, 40)
        p = px[x, y]
        if p[3] and p[:3] == LEAF[4]: px[x, y] = LEAF[5] + (255,)
    return shadow(outline(img), cx, 75, 18, 4)

def bush(seed):
    rnd = random.Random(seed)
    img = Image.new('RGBA', (36, 28), (0, 0, 0, 0))
    sph = []
    for b in [(18, 16, 0, 10), (9, 19, -2, 7), (27, 19, -2, 7), (13, 11, -3, 6), (23, 11, -3, 6)]:
        sph.append(b)
        sph += leaf_clumps(b[0], b[1], b[3] * 0.8, b[3] * 0.8, int(b[3] * 1.4), rnd, 2.4, 3.6)
    render_spheres(img, sph, LEAF)
    # 바닥에 닿는 부분은 어둡게 (접지)
    px = img.load()
    for y in range(22, 28):
        for x in range(36):
            p = px[x, y]
            if p[3] and p[:3] in LEAF:
                i = LEAF.index(p[:3]); px[x, y] = LEAF[max(0, i - 2)] + (255,)
    return shadow(outline(img), 18, 25, 15, 3)

def box(img, x0, y0, w, depth, h, top, front, edge=None):
    """3/4 시점 상자: 윗면(depth px, 밝음) + 앞면(h px, 어두움)"""
    d = ImageDraw.Draw(img)
    d.rectangle([x0, y0, x0 + w - 1, y0 + depth - 1], fill=top)
    d.rectangle([x0, y0 + depth, x0 + w - 1, y0 + depth + h - 1], fill=front)
    if edge: d.line([x0, y0 + depth, x0 + w - 1, y0 + depth], fill=edge)  # 모서리 하이라이트

def workbench():
    img = Image.new('RGBA', (44, 38), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    woodT, woodTL, woodTD = (128, 96, 62), (150, 116, 76), (100, 74, 48)
    woodF, woodFD, legC, legD = (84, 60, 40), (64, 46, 32), (72, 52, 36), (50, 36, 26)
    # 뒷다리 (상판 뒤로 살짝 보임) → 앞다리
    d.rectangle([6, 24, 8, 30], fill=legD); d.rectangle([35, 24, 37, 30], fill=legD)
    d.rectangle([3, 27, 6, 36], fill=legC); d.rectangle([37, 27, 40, 36], fill=legC)
    d.line([3, 27, 3, 36], fill=woodTL); d.line([40, 27, 40, 36], fill=legD)
    d.rectangle([7, 31, 36, 32], fill=legD)                             # 아래 가로대
    # 상판: 윗면(판자 결) + 앞면 두께
    box(img, 2, 12, 40, 13, 4, woodT, woodF, woodTL)
    for x in range(2, 42, 8): d.line([x, 12, x, 24], fill=woodTD)
    for x in range(5, 42, 8): put(img, x, 15, woodTL + (255,)); put(img, x + 2, 20, woodTD + (255,))
    d.line([2, 12, 41, 12], fill=woodTD)                                 # 뒷모서리
    d.line([2, 29, 41, 29], fill=woodFD)                                 # 앞면 아래 그늘
    # 상판 위 물건들은 상판에 그림자를 떨군다
    d.rectangle([25, 17, 38, 20], fill=woodTD)                           # 모루 그림자
    # 모루: 윗면 + 앞면 + 받침
    met, metL, metD, metF = (100, 104, 112), (150, 154, 162), (60, 62, 70), (76, 78, 86)
    d.rectangle([28, 12, 33, 18], fill=metD)                             # 받침(앞면)
    d.rectangle([23, 5, 37, 9], fill=met); d.line([23, 5, 37, 5], fill=metL)  # 윗면
    d.polygon([(19, 6), (23, 5), (23, 9)], fill=met)                     # 뿔
    d.rectangle([23, 10, 37, 12], fill=metF)                             # 앞면
    d.line([24, 6, 30, 6], fill=metL)
    # 망치 (자루 + 머리, 그림자)
    d.line([9, 19, 16, 15], fill=woodTD, width=1)
    d.line([8, 17, 15, 13], fill=(120, 84, 52)); d.line([8, 18, 15, 14], fill=(92, 64, 40))
    d.rectangle([5, 14, 9, 17], fill=metF); d.rectangle([5, 14, 9, 15], fill=metL)
    # 가죽 조각 (윗면 놓임)
    d.polygon([(14, 20), (20, 19), (21, 23), (15, 23)], fill=(150, 108, 66)); d.line([14, 20, 20, 19], fill=(180, 138, 90))
    return shadow(outline(img), 22, 35, 19, 3)

def dummy():
    img = Image.new('RGBA', (32, 44), (0, 0, 0, 0))
    rnd = random.Random(3)
    POLE = [(40, 30, 22), (58, 44, 30), (80, 60, 42), (102, 78, 54)]
    STRAW = [(84, 66, 36), (112, 92, 52), (146, 120, 70), (176, 150, 96), (204, 182, 128)]
    cylinder(img, 16, 18, 42, 2.2, 2.6, POLE, rnd, grooves=False)          # 기둥
    cylinder(img, 16, 13, 30, 7.5, 6.5, STRAW, rnd)                        # 짚 몸통
    px = img.load()
    for y in range(15, 30, 3):                                             # 짚 묶음 결
        for x in range(9, 24):
            if px[x, y][3] and (x + y) % 3: px[x, y] = STRAW[max(0, STRAW.index(px[x, y][:3]) - 1)] + (255,) if px[x, y][:3] in STRAW else px[x, y]
    for y in (21, 22):                                                     # 끈
        for x in range(9, 24):
            if px[x, y][3]: px[x, y] = ((110, 76, 46) if y == 21 else (78, 52, 32)) + (255,)
    # 팔(가로 막대: 위 밝고 아래 어둡게)
    for x in range(3, 29):
        if not (9 <= x <= 23): put(img, x, 17, POLE[3] + (255,)); put(img, x, 18, POLE[1] + (255,))
    for x in (3, 4, 27, 28):
        for y in (15, 16, 19, 20): put(img, x, y, STRAW[2] + (255,))
    render_spheres(img, [(16, 8, 0, 6.5)], STRAW)                         # 머리
    for x, y in ((14, 8), (18, 8)): put(img, x, y, (40, 30, 24, 255)); put(img, x, y + 1, (60, 46, 32, 255))
    return shadow(outline(img), 16, 42, 9, 2)

def props():
    for i in range(3): tree(10 + i * 7).save(os.path.join(TILES_DIR, f'tree{i}.png'))
    bush(5).save(os.path.join(TILES_DIR, 'bush.png'))
    workbench().save(os.path.join(TILES_DIR, 'workbench.png'))
    dummy().save(os.path.join(TILES_DIR, 'dummy.png'))


# ---------------- 채집 대상 (셀 셰이딩: 디더 없이 3~4단 → 덜 3D스럽게) ----------------
ROCK = [(62, 62, 66), (96, 96, 98), (130, 128, 124), (162, 158, 148)]

def rock(seed):
    rnd = random.Random(seed)
    img = Image.new('RGBA', (34, 28), (0, 0, 0, 0))
    sph = [(17, 17, 0, 11), (10, 19, -2, 7), (24, 19, -2, 8), (15, 12, -1, 7)]
    sph += [(rnd.uniform(8, 26), rnd.uniform(12, 20), -1, rnd.uniform(4, 6)) for _ in range(3)]
    render_spheres(img, sph, ROCK, dither=False, squash=0.82)
    px = img.load()
    # 금 (어두운 선 + 아래 밝은 점) 과 이끼
    for _ in range(3):
        x, y = rnd.randrange(8, 26), rnd.randrange(9, 20)
        for k in range(rnd.randint(3, 5)):
            X, Y = x + k, y + (k // 2) * (1 if seed % 2 else -1)
            if 0 <= X < 34 and 0 <= Y < 28 and px[X, Y][3]:
                px[X, Y] = ROCK[0] + (255,)
                if Y + 1 < 28 and px[X, Y + 1][3]: px[X, Y + 1] = ROCK[2] + (255,)
    for _ in range(10):
        x, y = rnd.randrange(6, 28), rnd.randrange(5, 14)
        if px[x, y][3] and px[x, y][:3] in (ROCK[2], ROCK[3]): px[x, y] = (84, 112, 62, 255)
    return shadow(outline(img), 17, 26, 14, 2)

def rubble(seed):
    """다 캐낸 바위: 납작한 돌 부스러기"""
    rnd = random.Random(seed)
    img = Image.new('RGBA', (34, 28), (0, 0, 0, 0))
    sph = [(rnd.uniform(7, 27), rnd.uniform(20, 24), 0, rnd.uniform(2.5, 4.5)) for _ in range(6)]
    render_spheres(img, sph, ROCK, dither=False, squash=0.7)
    return shadow(outline(img), 17, 26, 12, 2, alpha=60)

def stump(seed):
    """벤 나무: 나이테가 보이는 그루터기 (나무 그림과 같은 크기·같은 밑동 위치)"""
    rnd = random.Random(seed)
    Wd, Ht = 56, 80
    img = Image.new('RGBA', (Wd, Ht), (0, 0, 0, 0))
    cx = Wd // 2
    cylinder(img, cx, 66, 75, 5.5, 6.0, BARK, rnd)
    for s in (-1, 1):
        for k in range(8):
            x = cx + s * (5 + k); y = 74 + k // 3
            for yy in range(y - 2 + k // 4, y + 1):
                put(img, int(x), yy, (BARK[3] if s < 0 else BARK[1]) + (255,))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - 6, 63, cx + 6, 69], fill=(176, 140, 96))      # 잘린 면
    d.ellipse([cx - 4, 64, cx + 4, 68], outline=(140, 104, 70))   # 나이테
    put(img, cx, 66, (120, 90, 60, 255))
    for _ in range(5):                                             # 나뭇조각
        x, y = rnd.randrange(cx - 14, cx + 14), rnd.randrange(74, 78)
        put(img, x, y, (176, 140, 96, 255)); put(img, x + 1, y, (140, 104, 70, 255))
    return shadow(outline(img), cx, 75, 12, 3)

HERB = [(38, 70, 44), (58, 104, 56), (88, 140, 72), (128, 176, 96)]

def herb(picked=False):
    rnd = random.Random(7)
    img = Image.new('RGBA', (22, 20), (0, 0, 0, 0))
    px = img.load()
    leaves = 9 if not picked else 0
    for i in range(leaves):
        a = -math.pi / 2 + (i - 4) * 0.36
        L = 7 + (i % 3)
        for k in range(L):
            x = 11 + math.cos(a) * k * 1.1; y = 17 + math.sin(a) * k * 0.9
            c = HERB[1] if k < L * 0.4 else HERB[2] if k < L * 0.8 else HERB[3]
            if i % 2: c = HERB[min(3, HERB.index(c) + 1)] if c != HERB[3] else c
            put(img, int(x), int(y), c + (255,)); put(img, int(x) + 1, int(y), HERB[0] + (255,))
    if not picked:
        for x, y in ((7, 7), (14, 6), (11, 4)):                    # 하늘빛 꽃봉오리 (약초 표시) + 줄기
            for yy in range(y + 1, 16): put(img, x, yy, HERB[1] + (255,))
            put(img, x, y, (150, 200, 220, 255)); put(img, x + 1, y, (110, 160, 190, 255)); put(img, x, y - 1, (210, 236, 240, 255))
    else:
        for x in (8, 10, 12, 14):                                  # 뜯긴 줄기
            put(img, x, 17, HERB[1] + (255,)); put(img, x, 16, HERB[2] + (255,))
    return shadow(outline(img), 11, 18, 8, 2, alpha=60)

def gatherables():
    for i in range(2): rock(30 + i * 11).save(os.path.join(TILES_DIR, f'rock{i}.png'))
    rubble(3).save(os.path.join(TILES_DIR, 'rock_rubble.png'))
    stump(4).save(os.path.join(TILES_DIR, 'stump.png'))
    herb().save(os.path.join(TILES_DIR, 'herb.png'))
    herb(True).save(os.path.join(TILES_DIR, 'herb_picked.png'))

# ---------------- 맵 바닥 다시 매기기 ----------------
def kind_of(gid):
    """새 타일셋 번호(firstgid 1) → 종류"""
    if 5 <= gid <= 20: return 'dirt'
    if 21 <= gid <= 36: return 'water'
    return 'grass'

# ---------------- 지역(바이옴)별 바닥 ----------------
# 지역 번호: 0 들머리 풀밭(기본) 1 마른 들판 2 늪지 3 어두운 숲 4 사냥꾼의 들판 5 바위 언덕
BIOME_G = {
    0: dict(G),
    1: {'base': (108, 106, 60), 'dark': (88, 86, 48), 'deep': (70, 68, 40), 'light': (132, 126, 74), 'tuft': (156, 146, 86)},
    2: {'base': (60, 66, 44), 'dark': (48, 54, 36), 'deep': (38, 42, 30), 'light': (74, 82, 54), 'tuft': (90, 104, 62)},
    3: {'base': (46, 56, 38), 'dark': (36, 44, 30), 'deep': (28, 34, 24), 'light': (58, 70, 44), 'tuft': (72, 88, 52)},
    4: {'base': (74, 90, 52), 'dark': (60, 74, 44), 'deep': (46, 58, 36), 'light': (92, 108, 62), 'tuft': (112, 126, 72)},
    5: {'base': (98, 96, 84), 'dark': (80, 78, 68), 'deep': (62, 60, 54), 'light': (120, 116, 102), 'tuft': (88, 108, 62)},
}
BIOME_NAMES = ['meadow', 'dry', 'swamp', 'forest', 'hunter', 'rocky']

def use_biome(b):
    G.clear(); G.update(BIOME_G[b])

def biome_tile(b, v, seed):
    """지역 b의 바닥 한 칸 (변형 v). 기본 풀 그림에 지역별 무늬를 얹는다"""
    use_biome(b)
    rnd = random.Random(seed * 31 + b)
    if b == 5:
        img = Image.new('RGB', (T, T)); noise_fill(img, (0, 0, T, T), G['base'], [(G['dark'], 90), (G['light'], 50), (G['deep'], 30)], seed)
        for i in range(4 + v % 3): pebble(img, rnd.randrange(2, T - 5), rnd.randrange(3, T - 4), big=rnd.random() < 0.35)
        if v % 3 == 0:                                                  # 바위 틈 풀포기
            use_biome(5); blade_tuft(img, rnd.randrange(5, T - 5), rnd.randrange(8, T - 3), rnd, 3)
    else:
        img = grass(1 if v in (1, 5) else 0, seed)
    px = img.load()
    if b == 1:                                                          # 마른 들판: 맨흙 자국 + 마른 풀
        if v % 2 == 0:
            cx, cy, r = rnd.randrange(8, 24), rnd.randrange(8, 24), rnd.randrange(3, 6)
            for y in range(T):
                for x in range(T):
                    if (x - cx) ** 2 + ((y - cy) * 1.4) ** 2 < r * r + rnd.random() * 6: px[x, y] = D['base'] if rnd.random() < 0.7 else D['dark']
        for _ in range(4): blade_tuft(img, rnd.randrange(4, T - 4), rnd.randrange(7, T - 3), rnd, 5)
    elif b == 2:                                                        # 늪지: 진흙 웅덩이·물기
        if v % 3 == 0:
            cx, cy, r = rnd.randrange(9, 23), rnd.randrange(10, 22), rnd.randrange(4, 7)
            for y in range(T):
                for x in range(T):
                    d = (x - cx) ** 2 + ((y - cy) * 1.6) ** 2
                    if d < r * r: px[x, y] = (40, 46, 38) if d < (r - 2) ** 2 else (66, 60, 42)
            for k in range(3): px[cx - 2 + k, cy - 1] = (96, 112, 104)          # 물빛 반짝
        for _ in range(10): px[rnd.randrange(T), rnd.randrange(T)] = (70, 62, 42)
    elif b == 3:                                                        # 숲 바닥: 낙엽·잔가지·이끼
        for _ in range(18):
            x, y = rnd.randrange(1, T - 2), rnd.randrange(1, T - 1)
            c = rnd.choice(((106, 78, 46), (128, 96, 56), (84, 60, 36), (96, 70, 40)))
            px[x, y] = c; px[x + 1, y] = tuple(int(q * 0.8) for q in c)
        if v % 4 == 1:
            x, y = rnd.randrange(4, T - 10), rnd.randrange(6, T - 6)
            for k in range(7): put(img, x + k, y + (k // 3), (70, 52, 34))
        if v % 5 == 2:                                                  # 작은 버섯
            x, y = rnd.randrange(5, T - 5), rnd.randrange(8, T - 4)
            put(img, x, y, (220, 210, 190)); put(img, x - 1, y - 1, (170, 60, 50)); put(img, x, y - 1, (200, 80, 60)); put(img, x + 1, y - 1, (150, 50, 44))
    elif b == 4:                                                        # 사냥꾼의 들판: 짓밟힌 풀·발자국 흙·뼛조각
        if v % 2 == 1:
            for k in range(rnd.randint(3, 5)):
                x, y = rnd.randrange(3, T - 4), rnd.randrange(3, T - 3)
                for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)): put(img, x + dx, y + dy, D['dark'])
        if v % 5 == 3:
            x, y = rnd.randrange(5, T - 8), rnd.randrange(6, T - 5)
            for k in range(5): put(img, x + k, y, (214, 206, 182))
            put(img, x, y - 1, (214, 206, 182)); put(img, x + 4, y + 1, (214, 206, 182)); put(img, x + 2, y + 1, (150, 144, 128))
    use_biome(0)
    return img

def biome_terrain(b, kind, mask, seed):
    """흙길·물 칸: 바깥 풀 부분을 그 지역 바닥색으로"""
    use_biome(b)
    img = terrain(kind, mask, seed)
    use_biome(0)
    return img

# ---------------- 지역별 소품 (셀 셰이딩, 덜 3D스럽게) ----------------
PINE = [(22, 38, 30), (32, 54, 40), (46, 72, 50), (64, 94, 62)]

def pine(seed):
    """침엽수: 층층이 쌓인 삼각 잎 (왼쪽 밝게), 좁고 길게"""
    rnd = random.Random(seed)
    Wd, Ht = 44, 84
    img = Image.new('RGBA', (Wd, Ht), (0, 0, 0, 0))
    cx = Wd // 2
    cylinder(img, cx, 62, 80, 2.5, 3.5, BARK, rnd, grooves=False)
    tiers = [(8, 9), (18, 13), (30, 16), (44, 19), (58, 21)]
    for i, (ty, hw) in enumerate(tiers):
        hw += rnd.randint(-1, 1)
        for y in range(ty - 2, ty + 14):
            t = (y - (ty - 2)) / 16
            half = hw * t
            for x in range(int(cx - half), int(cx + half) + 1):
                jag = (x * 7 + y * 3 + seed) % 5 == 0 and y > ty + 10
                if jag: continue
                rel = (x - (cx - half)) / max(1, 2 * half)
                c = PINE[3] if rel < 0.22 and t > 0.3 else PINE[2] if rel < 0.55 else PINE[1]
                if y > ty + 11: c = PINE[0] if rel > 0.4 else PINE[1]       # 층 밑단 그늘
                put(img, x, y, c + (255,))
    put(img, cx, 5, PINE[2] + (255,)); put(img, cx, 6, PINE[2] + (255,))
    return shadow(outline(img), cx, 80, 13, 3)

def dead_tree(seed):
    """늪의 죽은 나무: 잎 없이 꺾인 가지"""
    rnd = random.Random(seed)
    Wd, Ht = 52, 78
    img = Image.new('RGBA', (Wd, Ht), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    DT = [(44, 40, 36), (68, 62, 54), (92, 86, 74), (116, 108, 92)]
    cx = Wd // 2
    cylinder(img, lambda y: cx + (74 - y) * 0.08, 26, 74, 3.0, 5.0, DT, rnd)
    def branch(x, y, ang, L, w):
        if L < 4: return
        x2, y2 = x + math.cos(ang) * L, y + math.sin(ang) * L
        d.line([x, y, x2, y2], fill=DT[1], width=w); d.line([x - 1, y, x2 - 1, y2], fill=DT[3], width=1)
        branch(x2, y2, ang + rnd.uniform(-0.6, -0.2), L * 0.6, max(1, w - 1))
        if rnd.random() < 0.7: branch(x2, y2, ang + rnd.uniform(0.2, 0.6), L * 0.55, max(1, w - 1))
    branch(cx + 1, 30, -math.pi / 2 - 0.3, 14, 3); branch(cx, 40, -math.pi / 2 + 0.9, 12, 2); branch(cx, 46, -math.pi / 2 - 1.0, 10, 2)
    for _ in range(6):                                              # 늘어진 이끼
        x, y = rnd.randrange(10, Wd - 10), rnd.randrange(14, 40)
        if img.getpixel((x, y))[3]:
            for k in range(rnd.randint(2, 5)): put(img, x, y + k, (70, 92, 54, 255))
    return shadow(outline(img), cx, 74, 12, 3)

def decor(kind):
    """깔기만 하는 소품 (막지 않음)"""
    rnd = random.Random(hash(kind) % 1000)
    if kind == 'mushrooms':
        img = Image.new('RGBA', (18, 14), (0, 0, 0, 0))
        for x, y, r in ((5, 8, 3), (11, 6, 4), (14, 10, 2)):
            for k in range(y, 13): put(img, x, k, (220, 210, 190, 255))
            for dx in range(-r, r + 1):
                put(img, x + dx, y, ((200, 80, 60) if dx < r // 2 else (150, 50, 44)) + (255,))
                if abs(dx) < r: put(img, x + dx, y - 1, ((220, 110, 80) if dx < 0 else (180, 64, 52)) + (255,))
            put(img, x - 1, y - 1, (240, 220, 200, 255))
        return shadow(outline(img), 9, 13, 7, 1, alpha=60)
    if kind == 'tallgrass':
        img = Image.new('RGBA', (26, 22), (0, 0, 0, 0))
        C = [(88, 86, 48), (132, 126, 74), (168, 158, 94)]
        for i in range(11):
            x = 3 + i * 2 + rnd.randint(-1, 1); h = rnd.randint(10, 19); lean = rnd.choice((-1, 0, 1))
            for k in range(h): put(img, x + (lean if k > h * 0.6 else 0), 20 - k, (C[0] if k < 4 else C[1] if k < h - 3 else C[2]) + (255,))
        return shadow(outline(img), 13, 20, 11, 2, alpha=60)
    if kind == 'reeds':
        img = Image.new('RGBA', (22, 28), (0, 0, 0, 0))
        for i in range(7):
            x = 3 + i * 2 + rnd.randint(-1, 1); h = rnd.randint(14, 24)
            for k in range(h): put(img, x, 26 - k, ((54, 74, 44) if k < h - 5 else (84, 108, 60)) + (255,))
            if i % 2 == 0:
                for k in range(4): put(img, x, 26 - h + k, (110, 78, 48, 255)); put(img, x + 1, 26 - h + k, (86, 60, 38, 255))
        return shadow(outline(img), 11, 26, 9, 2, alpha=60)
    if kind == 'bones':
        img = Image.new('RGBA', (26, 14), (0, 0, 0, 0))
        B = [(150, 144, 126), (200, 194, 172), (230, 224, 204)]
        d = ImageDraw.Draw(img)
        d.ellipse([3, 3, 10, 9], fill=B[1]); d.ellipse([4, 3, 8, 6], fill=B[2])      # 머리뼈
        put(img, 5, 6, (40, 34, 30, 255)); put(img, 8, 6, (40, 34, 30, 255))
        d.line([12, 8, 22, 5], fill=B[1], width=2); d.line([12, 7, 22, 4], fill=B[2])
        d.line([14, 11, 21, 11], fill=B[0], width=1)
        for x in (12, 22): d.ellipse([x - 1, 3 + (x == 22) * -0, x + 1, 9], fill=B[1])
        return shadow(outline(img), 13, 12, 11, 2, alpha=60)
    if kind == 'campfire':
        img = Image.new('RGBA', (30, 20), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        for i in range(8):                                          # 돌 둘레
            a = i / 8 * math.pi * 2
            x, y = 15 + math.cos(a) * 11, 11 + math.sin(a) * 6
            d.ellipse([x - 2, y - 2, x + 2, y + 1], fill=(120, 116, 106)); put(img, int(x - 1), int(y - 2), (160, 156, 144, 255))
        d.ellipse([8, 7, 22, 15], fill=(36, 30, 28))                  # 재
        d.line([9, 12, 21, 9], fill=(70, 46, 30), width=2); d.line([10, 9, 20, 13], fill=(56, 38, 26), width=2)  # 탄 장작
        for x, y in ((14, 10), (17, 11)): put(img, x, y, (190, 90, 40, 255))
        return shadow(outline(img), 15, 17, 12, 2, alpha=60)
    if kind == 'tent':
        img = Image.new('RGBA', (52, 42), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        d.line([8, 38, 26, 6], fill=(70, 50, 34), width=2); d.line([44, 38, 26, 6], fill=(56, 40, 28), width=2)   # 장대
        d.polygon([(26, 8), (8, 38), (24, 38)], fill=(122, 98, 70))                  # 가죽 (왼쪽 밝음)
        d.polygon([(26, 8), (24, 38), (40, 38), (34, 22)], fill=(92, 72, 52))        # 찢어져 늘어진 쪽
        d.polygon([(34, 22), (40, 38), (46, 36)], fill=(76, 58, 42))
        for y in range(12, 38, 5): d.line([20 - (y - 12) // 3, y, 25, y], fill=(104, 82, 58))   # 꿰맨 자국
        d.polygon([(24, 38), (30, 38), (27, 24)], fill=(30, 24, 22))                 # 입구 어둠
        return shadow(outline(img), 26, 38, 20, 3)
    raise ValueError(kind)

# ---------------- 마을·장소 건물 (3/4 시점: 지붕 윗면 + 앞벽, 셀 셰이딩) ----------------
WOOD = [(52, 38, 28), (78, 58, 40), (104, 80, 54), (130, 102, 70)]
THATCH = [(92, 74, 40), (124, 102, 56), (156, 132, 74), (186, 162, 96)]
STONE = [(70, 68, 66), (98, 96, 92), (126, 122, 116), (156, 150, 140)]

def planks(d, x0, y0, x1, y1, ramp, vertical=True, step=5):
    d.rectangle([x0, y0, x1, y1], fill=ramp[1])
    if vertical:
        for x in range(x0, x1, step): d.line([x, y0, x, y1], fill=ramp[0])
        for x in range(x0 + 2, x1, step * 3): d.line([x, y0 + 2, x, y0 + 6], fill=ramp[2])
    else:
        for y in range(y0, y1, step): d.line([x0, y, x1, y], fill=ramp[0])

def house(seed, burned=False):
    """초가집 96×92: 돌 밑단 + 나무 앞벽(문·창) + 초가 지붕(앞으로 기운 면이 크게 보임). burned = 지붕 없이 그을린 뼈대"""
    rnd = random.Random(seed)
    Wd, Ht = 96, 92
    img = Image.new('RGBA', (Wd, Ht), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    wx0, wx1, wy0, wy1 = 10, 86, 46, 86                       # 앞벽
    char = (lambda c: tuple(int(v * 0.35) for v in c)) if burned else (lambda c: c)
    d.rectangle([wx0, wy1 - 6, wx1, wy1], fill=char(STONE[1]))    # 돌 밑단
    for x in range(wx0, wx1, 7): d.line([x, wy1 - 6, x + 3, wy1], fill=char(STONE[0]))
    planks(d, wx0, wy0, wx1, wy1 - 7, [char(c) for c in WOOD])
    d.line([wx0, wy0, wx0, wy1], fill=char(WOOD[0]), width=3); d.line([wx1, wy0, wx1, wy1], fill=char(WOOD[0]), width=3)  # 기둥
    dx = 30 + rnd.randint(-6, 6)
    d.rectangle([dx, 62, dx + 14, wy1 - 6], fill=(28, 22, 20))  # 문 (어둠)
    if not burned:
        d.rectangle([dx + 2, 64, dx + 12, wy1 - 7], fill=WOOD[1]); d.line([dx + 7, 64, dx + 7, wy1 - 7], fill=WOOD[0])
        for wx in (60, 72):                                       # 창 (불빛 없는 창)
            d.rectangle([wx, 58, wx + 8, 66], fill=(40, 36, 34)); d.line([wx + 4, 58, wx + 4, 66], fill=WOOD[2]); d.rectangle([wx - 1, 57, wx + 9, 67], outline=WOOD[0])
        # 초가 지붕: 앞으로 기운 큰 면 + 용마루 + 처마 그늘
        roof = [(2, 50), (94, 50), (80, 12), (16, 12)]
        d.polygon(roof, fill=THATCH[1])
        for y in range(14, 50, 4):
            t = (y - 12) / 38
            xa, xb = 16 - 14 * t, 80 + 14 * t
            d.line([xa, y, xb, y], fill=THATCH[0] if y % 8 else THATCH[2])
        for _ in range(70):
            y = rnd.randrange(14, 48); t = (y - 12) / 38
            x = rnd.uniform(16 - 14 * t, 80 + 14 * t)
            put(img, int(x), y, THATCH[3] + (255,) if rnd.random() < 0.5 else THATCH[0] + (255,))
        d.polygon([(16, 12), (80, 12), (76, 6), (20, 6)], fill=THATCH[2])  # 용마루 윗면
        d.line([20, 6, 76, 6], fill=THATCH[3])
        d.line([2, 50, 94, 50], fill=THATCH[0], width=2)
        d.rectangle([wx0, 52, wx1, 54], fill=(30, 24, 20))       # 처마 그늘
        d.rectangle([66, 2, 72, 12], fill=STONE[1]); d.line([66, 2, 72, 2], fill=STONE[3])   # 굴뚝
    else:
        # 불탄 집: 지붕 없음, 부러진 서까래, 그을음
        for x0, x1 in ((14, 40), (50, 82)):
            d.line([x0, 46, x1, 20 + rnd.randint(0, 14)], fill=(30, 24, 20), width=3)
        d.line([10, 46, 86, 46], fill=(26, 20, 18), width=3)
        for _ in range(40):
            x, y = rnd.randrange(wx0, wx1), rnd.randrange(wy0 - 4, wy1)
            put(img, x, y, (20, 16, 14, 255))
        for _ in range(6):                                        # 남은 불씨
            put(img, rnd.randrange(14, 82), rnd.randrange(70, 86), (200, 90, 40, 255))
        # 윗부분 무너짐: 벽 위쪽을 들쭉날쭉 지움
        px = img.load()
        for x in range(Wd):
            cut = 46 + int(abs(math.sin(x * 0.3 + seed)) * 14)
            for y in range(0, cut):
                if px[x, y][3] and y > 18 and not (px[x, y][:3] == (30, 24, 20) or px[x, y][:3] == (26, 20, 18)): px[x, y] = (0, 0, 0, 0)
    return shadow(outline(img), 48, 86, 44, 4)

def well():
    img = Image.new('RGBA', (40, 46), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.ellipse([6, 22, 34, 34], fill=STONE[1]); d.ellipse([10, 24, 30, 31], fill=(30, 40, 48))   # 돌 테두리·물
    d.rectangle([6, 28, 34, 40], fill=STONE[1]); d.ellipse([6, 34, 34, 44], fill=STONE[0])
    for x in range(8, 34, 6): d.line([x, 30, x, 40], fill=STONE[0])
    d.line([8, 28, 8, 6], fill=WOOD[1], width=2); d.line([32, 28, 32, 6], fill=WOOD[0], width=2)
    d.polygon([(4, 8), (36, 8), (30, 2), (10, 2)], fill=THATCH[1]); d.line([10, 2, 30, 2], fill=THATCH[3])
    d.line([20, 8, 20, 22], fill=(160, 150, 120)); d.rectangle([17, 18, 23, 23], fill=WOOD[2])  # 두레박
    return shadow(outline(img), 20, 42, 16, 3)

def fence(vertical=False):
    if vertical:
        img = Image.new('RGBA', (12, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        d.rectangle([4, 4, 7, 38], fill=WOOD[1]); d.line([4, 4, 4, 38], fill=WOOD[2])
        for y in (10, 26): d.rectangle([2, y, 9, y + 3], fill=WOOD[2])
        return outline(img)
    img = Image.new('RGBA', (34, 24), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for x in (3, 29): d.rectangle([x, 4, x + 3, 22], fill=WOOD[1]); d.line([x, 4, x, 22], fill=WOOD[2])
    for y in (8, 15): d.rectangle([0, y, 33, y + 3], fill=WOOD[2]); d.line([0, y + 3, 33, y + 3], fill=WOOD[0])
    return shadow(outline(img), 17, 22, 15, 2, alpha=60)

def watermill():
    """버려진 물레방앗간 (토브의 베이스캠프): 돌 벽 + 기운 지붕 + 옆의 큰 물레바퀴"""
    rnd = random.Random(3)
    img = Image.new('RGBA', (128, 104), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([8, 50, 88, 98], fill=STONE[1])
    for y in range(52, 98, 6):
        off = (y // 6) % 2 * 5
        for x in range(8 + off, 88, 10): d.rectangle([x, y, x + 8, y + 4], outline=STONE[0])
    d.rectangle([36, 70, 54, 98], fill=(28, 22, 20)); d.rectangle([38, 72, 52, 98], fill=WOOD[1])
    d.rectangle([64, 62, 76, 72], fill=(220, 170, 90))                         # 불 켜진 창 (사람이 산다)
    d.line([70, 62, 70, 72], fill=WOOD[0]); d.rectangle([63, 61, 77, 73], outline=WOOD[0])
    roof = [(2, 54), (94, 54), (84, 14), (12, 18)]
    d.polygon(roof, fill=(84, 72, 66)); 
    for y in range(18, 54, 5): d.line([12 - (y - 18) * 0.28, y, 84 + (y - 14) * 0.25, y], fill=(64, 54, 50))
    d.polygon([(30, 22), (46, 22), (44, 34), (32, 34)], fill=(40, 34, 32))      # 지붕 구멍 (버려짐)
    d.line([2, 54, 94, 54], fill=(50, 42, 40), width=2)
    # 물레바퀴
    cx, cy, R = 104, 72, 22
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=WOOD[0], width=4)
    d.ellipse([cx - R + 3, cy - R + 3, cx + R - 3, cy + R - 3], outline=WOOD[2], width=1)
    for k in range(10):
        a = k / 10 * math.tau
        d.line([cx, cy, cx + math.cos(a) * R, cy + math.sin(a) * R], fill=WOOD[1], width=2)
        bx, by = cx + math.cos(a) * R, cy + math.sin(a) * R
        d.rectangle([bx - 2, by - 2, bx + 2, by + 2], fill=WOOD[2])
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=WOOD[0])
    return shadow(outline(img), 64, 98, 56, 5)

def ruin_tower():
    """무너진 감시탑 (랜드마크): 높은 돌탑, 윗부분이 부서짐"""
    rnd = random.Random(8)
    img = Image.new('RGBA', (60, 128), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for y in range(20, 122):
        w = 20 + (y - 20) * 0.06
        top = 20 + int(abs(math.sin(y * 0.9)) * 0)
        for x in range(int(30 - w), int(30 + w)):
            rel = (x - (30 - w)) / (2 * w)
            c = STONE[3] if rel < 0.25 else STONE[2] if rel < 0.6 else STONE[1]
            if (y // 7 + (x // 9)) % 5 == 0: c = STONE[0]
            put(img, x, y, c + (255,))
    px = img.load()
    for x in range(60):                                           # 부서진 윗단
        cut = 20 + int(abs(math.sin(x * 0.5)) * 14 + (x % 7))
        for y in range(0, cut): px[x, y] = (0, 0, 0, 0)
    d.rectangle([26, 70, 34, 84], fill=(24, 20, 18))              # 창 구멍
    d.rectangle([24, 102, 36, 122], fill=(24, 20, 18))            # 입구
    for _ in range(8):
        x, y = rnd.randrange(4, 56), rnd.randrange(118, 126)
        d.ellipse([x - 3, y - 2, x + 3, y + 2], fill=STONE[1])
    return shadow(outline(img), 30, 122, 26, 4)

def ruin_altar():
    """무너진 제단 (광신도 흔적): 갈라진 돌판 + 붉은 문양 + 기울어진 비석"""
    img = Image.new('RGBA', (64, 52), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.polygon([(6, 34), (58, 34), (52, 46), (12, 46)], fill=STONE[1]); d.polygon([(6, 34), (58, 34), (54, 28), (10, 28)], fill=STONE[2])
    d.line([30, 28, 34, 46], fill=STONE[0], width=1)
    for a in range(0, 360, 30):                                    # 붉은 원 문양 (윗면)
        r = math.radians(a)
        put(img, int(32 + math.cos(r) * 12), int(31 + math.sin(r) * 2.5), (150, 30, 40, 255))
    d.line([26, 31, 38, 31], fill=(150, 30, 40)); d.line([32, 29, 32, 33], fill=(150, 30, 40))
    d.polygon([(40, 28), (50, 28), (54, 4), (44, 6)], fill=STONE[2]); d.line([44, 6, 54, 4], fill=STONE[3])   # 기울어진 비석
    d.line([46, 12, 50, 22], fill=(150, 30, 40)); d.line([50, 12, 46, 22], fill=(150, 30, 40))
    for x in (14, 20): d.rectangle([x, 22, x + 3, 28], fill=(200, 190, 160)); put(img, x + 1, 21, (240, 200, 90, 255))  # 촛농 초
    return shadow(outline(img), 32, 46, 26, 3)

def fallen_tree():
    """쓰러진 거대 나무 (협곡 다리): 세로로 누운 굵은 통나무 — 위가 북쪽"""
    img = Image.new('RGBA', (44, 236), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for y in range(8, 228):
        for x in range(6, 38):
            rel = (x - 6) / 32
            c = BARK[3] if rel < 0.2 else BARK[2] if rel < 0.55 else BARK[1] if rel < 0.85 else BARK[0]
            if (y * 3 + x) % 17 == 0: c = BARK[0]
            put(img, x, y, c + (255,))
    d.ellipse([6, 222, 38, 234], fill=(176, 140, 96)); d.ellipse([12, 225, 32, 231], outline=(140, 104, 70))   # 잘린 면 (남쪽 끝)
    for y in (40, 110, 170):                                        # 부러진 가지
        d.line([36, y, 43, y - 8], fill=BARK[1], width=3)
    for y in range(12, 220, 14): d.line([8, y, 36, y + 2], fill=(70, 100, 54))   # 이끼
    return outline(img)

def bridge(length_tiles=4):
    """나무다리 (가로, 강 위): 바닥 판자 + 난간. 바닥 깊이로 그림 (위로 걸어 다님)"""
    Wd = length_tiles * 32
    img = Image.new('RGBA', (Wd, 44), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    planks(d, 0, 12, Wd - 1, 36, WOOD, vertical=True, step=6)
    d.line([0, 12, Wd, 12], fill=WOOD[3]); d.line([0, 36, Wd, 36], fill=WOOD[0], width=2)
    for x in range(2, Wd, 30):
        d.rectangle([x, 2, x + 3, 14], fill=WOOD[1]); d.rectangle([x, 34, x + 3, 42], fill=WOOD[0])
    d.line([0, 4, Wd, 4], fill=WOOD[2], width=2)
    return outline(img)

def village_props():
    for i in range(2): house(40 + i * 13).save(os.path.join(TILES_DIR, f'house{i}.png'))
    for i in range(2): house(70 + i * 7, burned=True).save(os.path.join(TILES_DIR, f'house_burned{i}.png'))
    well().save(os.path.join(TILES_DIR, 'well.png'))
    fence().save(os.path.join(TILES_DIR, 'fence_h.png')); fence(True).save(os.path.join(TILES_DIR, 'fence_v.png'))
    watermill().save(os.path.join(TILES_DIR, 'watermill.png'))
    ruin_tower().save(os.path.join(TILES_DIR, 'ruin_tower.png'))
    ruin_altar().save(os.path.join(TILES_DIR, 'ruin_altar.png'))
    fallen_tree().save(os.path.join(TILES_DIR, 'fallen_tree.png'))
    bridge(4).save(os.path.join(TILES_DIR, 'bridge_h.png'))


def biome_props():
    for i in range(2): pine(60 + i * 9).save(os.path.join(TILES_DIR, f'pine{i}.png'))
    dead_tree(5).save(os.path.join(TILES_DIR, 'deadtree0.png'))
    for k in ('mushrooms', 'tallgrass', 'reeds', 'bones', 'campfire', 'tent'):
        decor(k).save(os.path.join(TILES_DIR, f'decor_{k}.png'))


def height_marks():
    """Tiled에서 높이를 칠할 때 보는 표시 타일 (게임에선 안 그림): 1=절벽 고지대, 2=낮은 턱 고지대, 3=계단 자리, 4=비탈 고지대"""
    img = Image.new('RGBA', (4 * T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, c in enumerate(((200, 80, 60, 110), (220, 180, 60, 110), (80, 160, 220, 130), (90, 200, 90, 110))):
        d.rectangle([i * T, 0, i * T + T - 1, T - 1], fill=c, outline=c[:3] + (220,))
    img.save(os.path.join(TILES_DIR, 'height_marks.png'))

def region_marks():
    """Tiled에서 지역을 칠할 때 보는 표시 타일 (게임에선 안 그림): 1 마른 들판 2 늪지 3 어두운 숲 4 사냥꾼의 들판 5 바위 언덕 (안 칠하면 0 들머리 풀밭)"""
    img = Image.new('RGBA', (5 * T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, c in enumerate(((210, 190, 90, 90), (90, 120, 70, 110), (40, 70, 50, 130), (170, 110, 70, 100), (150, 150, 150, 110))):
        d.rectangle([i * T, 0, i * T + T - 1, T - 1], fill=c, outline=c[:3] + (220,))
        d.text((i * T + 12, 10), str(i + 1), fill=(255, 255, 255, 230))
    img.save(os.path.join(TILES_DIR, 'region_marks.png'))

def heights_of(m):
    """맵의 height 레이어 → 2차원 높이값 (0 낮은 땅, 1 절벽 고지대, 2 낮은 턱 고지대, 3 오르막)"""
    Wm, Hm = m['width'], m['height']
    hl = next((l for l in m['layers'] if l['name'] == 'height'), None)
    hts = next((t for t in m['tilesets'] if t['name'] == 'height_marks'), None)
    if not hl or not hts: return [[0] * Wm for _ in range(Hm)]
    f = hts['firstgid']
    return [[(hl['data'][y * Wm + x] - f + 1) if hl['data'][y * Wm + x] >= f else 0 for x in range(Wm)] for y in range(Hm)]

def remap():
    """바닥 타일(풀·흙길·물 경계)을 다시 매기고, 절벽은 terrain_bake.py로 구워 낸다 (칸 단위 벽면 타일은 이제 안 씀)"""
    m = json.load(open(MAP))
    layer = next(l for l in m['layers'] if l['name'] == 'ground')
    Wm, Hm = m['width'], m['height']
    data = layer['data']
    kinds = [[kind_of(data[y * Wm + x]) for x in range(Wm)] for y in range(Hm)]
    rnd = random.Random(42)
    new = []
    for y in range(Hm):
        for x in range(Wm):
            k = kinds[y][x]
            if k == 'grass':
                r = rnd.random()
                idx = 2 if r < 0.04 else 3 if r < 0.08 else 1 if r < 0.2 else rnd.choice((0, 36, 37, 38, 39, 40, 41, 42, 43))
            else:
                mask = 0
                for bit, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0))):
                    X, Y = x + dx, y + dy
                    same = (0 <= X < Wm and 0 <= Y < Hm and kinds[Y][X] == k) or not (0 <= X < Wm and 0 <= Y < Hm)
                    if same: mask |= bit
                idx = (4 if k == 'dirt' else 20) + mask
            new.append(idx + 1)  # firstgid 1
    layer['data'] = new
    n, cols = 76, 8
    size = (cols * T, math.ceil(n / cols) * T)
    old_ts = m['tilesets']
    hts = next((t for t in m['tilesets'] if t['name'] == 'height_marks'), None)
    hl = next((l for l in m['layers'] if l['name'] == 'height'), None)
    m['tilesets'] = [{
        'firstgid': 1, 'name': 'world_tiles', 'image': '../assets/tiles/world_tiles.png',
        'imagewidth': size[0], 'imageheight': size[1], 'tilewidth': T, 'tileheight': T,
        'tilecount': n, 'columns': cols, 'margin': 0, 'spacing': 0,
        'tiles': [{'id': i, 'properties': [{'name': 'collides', 'type': 'bool', 'value': True}]} for i in range(20, 36)],
    }, {
        'firstgid': n + 1, 'name': 'height_marks', 'image': '../assets/tiles/height_marks.png',
        'imagewidth': 4 * T, 'imageheight': T, 'tilewidth': T, 'tileheight': T,
        'tilecount': 4, 'columns': 4, 'margin': 0, 'spacing': 0,
    }]
    if hl and hts:
        hl['data'] = [(g - hts['firstgid'] + n + 1) if g >= hts['firstgid'] else 0 for g in hl['data']]
    # 지역 레이어 + 표시 타일셋 (높이 표시 다음 번호)
    rts = next((t for t in old_ts if t['name'] == 'region_marks'), None)
    rl = next((l for l in m['layers'] if l['name'] == 'region'), None)
    rfirst = n + 1 + 4
    m['tilesets'].append({'firstgid': rfirst, 'name': 'region_marks', 'image': '../assets/tiles/region_marks.png',
                          'imagewidth': 5 * T, 'imageheight': T, 'tilewidth': T, 'tileheight': T,
                          'tilecount': 5, 'columns': 5, 'margin': 0, 'spacing': 0})
    if not rl:
        rl = {'id': max(l['id'] for l in m['layers']) + 1, 'name': 'region', 'type': 'tilelayer', 'width': Wm, 'height': Hm,
              'x': 0, 'y': 0, 'opacity': 0.5, 'visible': False, 'data': [0] * (Wm * Hm)}
        m['layers'].insert(1, rl)
    elif rts:
        rl['data'] = [(g - rts['firstgid'] + rfirst) if g >= rts['firstgid'] else 0 for g in rl['data']]
    m['layers'] = [l for l in m['layers'] if l['name'] != 'cliff_rim']   # 예전 칸 단위 덧그림 레이어 제거
    json.dump(m, open(MAP, 'w'), indent=1)
    print('map remapped', Wm, Hm)
    import terrain_bake
    terrain_bake.bake()
    import decor_scatter
    decor_scatter.scatter()

if __name__ == '__main__':
    print('tiles', tileset())
    props()
    gatherables()
    biome_props()
    village_props()
    height_marks()
    region_marks()
    if '--remap' in sys.argv: remap()
