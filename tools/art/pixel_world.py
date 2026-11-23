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

  44~55 절벽 벽면(윗줄·아랫줄·낮은 턱 × 끝 4종, collides), 56~58 돌계단, 59~74 고지대 가장자리 덧그림, 75 절벽 밑 그늘
맵(maps/world.tmj)의 바닥은 --remap 으로 "풀/흙/물" 종류와 height 레이어(1 절벽 고지대, 2 낮은 턱 고지대, 3 오르막)를 읽어
알맞은 타일 번호(경계·벽면·계단)와 cliff_rim 덧그림 레이어를 만든다.
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

def height_marks():
    """Tiled에서 높이를 칠할 때 보는 표시 타일 (게임에선 안 그림): 1=절벽 고지대, 2=낮은 턱 고지대, 3=오르막"""
    img = Image.new('RGBA', (3 * T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, c in enumerate(((200, 80, 60, 110), (220, 180, 60, 110), (80, 160, 220, 130))):
        d.rectangle([i * T, 0, i * T + T - 1, T - 1], fill=c, outline=c[:3] + (220,))
    img.save(os.path.join(TILES_DIR, 'height_marks.png'))

def heights_of(m):
    """맵의 height 레이어 → 2차원 높이값 (0 낮은 땅, 1 절벽 고지대, 2 낮은 턱 고지대, 3 오르막)"""
    Wm, Hm = m['width'], m['height']
    hl = next((l for l in m['layers'] if l['name'] == 'height'), None)
    hts = next((t for t in m['tilesets'] if t['name'] == 'height_marks'), None)
    if not hl or not hts: return [[0] * Wm for _ in range(Hm)]
    f = hts['firstgid']
    return [[(hl['data'][y * Wm + x] - f + 1) if hl['data'][y * Wm + x] >= f else 0 for x in range(Wm)] for y in range(Hm)]

def remap():
    m = json.load(open(MAP))
    layer = next(l for l in m['layers'] if l['name'] == 'ground')
    Wm, Hm = m['width'], m['height']
    data = layer['data']
    kinds = [[kind_of(data[y * Wm + x]) for x in range(Wm)] for y in range(Hm)]
    H = heights_of(m)
    high = lambda x, y: 0 <= x < Wm and 0 <= y < Hm and H[y][x] in (1, 2)
    # 벽면 자리: 고지대 남쪽 가장자리 아래 (절벽 2칸, 낮은 턱 1칸). 오르막(3)이면 계단
    face = {}
    for y in range(Hm):
        for x in range(Wm):
            if not high(x, y) or high(x, y + 1): continue
            rows = ('top', 'bot') if H[y][x] == 1 else ('ledge',)
            for k, kind in enumerate(rows):
                Y = y + 1 + k
                if Y >= Hm or high(x, Y): break
                face[(x, Y)] = ('ramp_' + kind) if H[Y][x] == 3 else kind
    rnd = random.Random(42)
    new, rim = [], []
    for y in range(Hm):
        for x in range(Wm):
            f = face.get((x, y))
            if f:
                if f.startswith('ramp_'): idx = {'ramp_top': RAMP_TOP, 'ramp_bot': RAMP_BOT, 'ramp_ledge': RAMP_LEDGE}[f]
                else:
                    conn = (1 if face.get((x - 1, y)) == f else 0) | (2 if face.get((x + 1, y)) == f else 0)
                    idx = {'top': CLIFF_TOP, 'bot': CLIFF_BOT, 'ledge': LEDGE}[f] + conn
                new.append(idx + 1); rim.append(0)
                continue
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
            # 덧그림: 고지대 가장자리 선 / 절벽 밑 그늘
            if high(x, y):
                mk = sum(b for b, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0)))
                         if 0 <= x + dx < Wm and 0 <= y + dy < Hm and not high(x + dx, y + dy))
                rim.append(RIM + mk + 1)
            elif face.get((x, y - 1)) in ('bot', 'ledge'):
                rim.append(BASE_SHADOW + 1)
            else:
                rim.append(0)
    layer['data'] = new
    n, cols = 76, 8
    size = (cols * T, math.ceil(n / cols) * T)
    collide = list(range(20, 36)) + list(range(CLIFF_TOP, LEDGE + 4))   # 물 + 벽면 (계단은 지나감)
    hts = next((t for t in m['tilesets'] if t['name'] == 'height_marks'), None)
    hl = next((l for l in m['layers'] if l['name'] == 'height'), None)
    m['tilesets'] = [{
        'firstgid': 1, 'name': 'world_tiles', 'image': '../assets/tiles/world_tiles.png',
        'imagewidth': size[0], 'imageheight': size[1], 'tilewidth': T, 'tileheight': T,
        'tilecount': n, 'columns': cols, 'margin': 0, 'spacing': 0,
        'tiles': [{'id': i, 'properties': [{'name': 'collides', 'type': 'bool', 'value': True}]} for i in collide],
    }, {
        'firstgid': n + 1, 'name': 'height_marks', 'image': '../assets/tiles/height_marks.png',
        'imagewidth': 3 * T, 'imageheight': T, 'tilewidth': T, 'tileheight': T,
        'tilecount': 3, 'columns': 3, 'margin': 0, 'spacing': 0,
    }]
    # height 레이어: 예전 firstgid 기준 값을 새 firstgid로 옮김
    if hl and hts:
        hl['data'] = [(g - hts['firstgid'] + n + 1) if g >= hts['firstgid'] else 0 for g in hl['data']]
    # 덧그림 레이어 (ground 바로 위)
    rl = next((l for l in m['layers'] if l['name'] == 'cliff_rim'), None)
    if not rl:
        rl = {'id': max(l['id'] for l in m['layers']) + 1, 'name': 'cliff_rim', 'type': 'tilelayer', 'width': Wm, 'height': Hm,
              'x': 0, 'y': 0, 'opacity': 1, 'visible': True}
        gi = next(i for i, l in enumerate(m['layers']) if l['name'] == 'ground')
        m['layers'].insert(gi + 1, rl)
    rl['data'] = rim
    m['nextlayerid'] = max(l['id'] for l in m['layers']) + 1
    json.dump(m, open(MAP, 'w'), indent=1)
    print('map remapped', Wm, Hm, 'faces', len(face))

if __name__ == '__main__':
    print('tiles', tileset())
    props()
    gatherables()
    vines().save(os.path.join(TILES_DIR, 'vines.png'))
    height_marks()
    if '--remap' in sys.argv: remap()
