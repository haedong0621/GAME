"""
배경 도트 생성기 — 바닥 타일(경계 자동 타일 포함)과 소품(나무·풀숲·제작대·허수아비).

타일셋 assets/tiles/world_tiles.png (32px, 8열):
  0~3   풀 (기본·풀포기·들꽃·자갈)
  4~19  흙길 16종: 4 + 이웃 마스크(N=1, E=2, S=4, W=8 — 그 방향도 흙길이면 1)
  20~35 물 16종:   20 + 이웃 마스크 (물가 거품·진흙 테두리), 모두 collides=true
소품: assets/tiles/tree0~2.png(48×72), bush.png(34×22), workbench.png(40×30), dummy.png(32×40)

맵(maps/world.tmj)의 바닥은 --remap 으로 "풀/흙/물" 종류를 읽어 이웃을 보고 알맞은 타일 번호로 바꾼다.
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

def grass(variant, seed):
    img = Image.new('RGB', (T, T))
    noise_fill(img, (0, 0, T, T), G['base'], [(G['dark'], 70), (G['light'], 40), (G['deep'], 20)], seed)
    rnd = random.Random(seed + 7)
    # 풀포기 (가장자리에 안 걸치게 → 이어 붙여도 이음새 없음)
    for _ in range(6 if variant == 1 else 3):
        x, y = rnd.randrange(3, T - 4), rnd.randrange(4, T - 2)
        for dx, dy in ((0, 0), (-1, -1), (1, -1), (0, -2)):
            img.putpixel((x + dx, y + dy), G['tuft'] if dy < 0 else G['dark'])
    if variant == 2:  # 들꽃
        for c in ((196, 176, 96), (172, 96, 104), (204, 204, 190)):
            x, y = rnd.randrange(3, T - 3), rnd.randrange(3, T - 3)
            img.putpixel((x, y), c); img.putpixel((x, y + 1), G['dark'])
    if variant == 3:  # 자갈
        for _ in range(3):
            x, y = rnd.randrange(3, T - 4), rnd.randrange(3, T - 3)
            img.putpixel((x, y), D['pebble']); img.putpixel((x + 1, y), D['light']); img.putpixel((x, y + 1), D['edge'])
    return img

def wobble(i, side, amp=1.6, base=4):
    """경계가 들어가는 깊이 (가장자리 좌표 i에 따라 울퉁불퉁, 방향마다 다른 무늬)"""
    k = {'N': 0.0, 'E': 1.7, 'S': 3.1, 'W': 4.6}[side]
    return base + round(amp * math.sin(i * 0.55 + k) + 0.8 * math.sin(i * 1.3 + k * 2))

def inside(x, y, mask, base=4):
    """마스크(이웃 연결)에 따라 이 픽셀이 흙/물 영역 안인가"""
    n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8
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
    img = grass(0, seed)
    fill = Image.new('RGB', (T, T))
    if kind == 'dirt':
        noise_fill(fill, (0, 0, T, T), D['base'], [(D['dark'], 90), (D['light'], 50), (D['pebble'], 6)], seed + 1)
        edge_c, rim_c = D['edge'], G['deep']
    else:
        noise_fill(fill, (0, 0, T, T), W['base'], [(W['deep'], 120), (W['light'], 18)], seed + 2)
        d = ImageDraw.Draw(fill)
        rnd = random.Random(seed + 3)
        for _ in range(3):  # 잔물결
            x, y = rnd.randrange(4, T - 8), rnd.randrange(4, T - 4)
            d.line([x, y, x + 4, y], fill=W['light'])
        edge_c, rim_c = W['foam'], W['mud']
    base = 4 if kind == 'dirt' else 5
    px, fp = img.load(), fill.load()
    inn = [[inside(x, y, mask, base) for x in range(T)] for y in range(T)]
    for y in range(T):
        for x in range(T):
            if inn[y][x]:
                px[x, y] = fp[x, y]
                # 경계 바로 안쪽: 흙은 어두운 테두리, 물은 하얀 거품
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < T and 0 <= Y < T and not inn[Y][X]:
                        px[x, y] = edge_c; break
            else:
                # 경계 바로 바깥: 짙은 풀/진흙 테두리
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < T and 0 <= Y < T and inn[Y][X]:
                        px[x, y] = rim_c; break
    return img

def tileset():
    tiles = [grass(v, 100 + v) for v in range(4)]
    tiles += [terrain('dirt', m, 200 + m) for m in range(16)]
    tiles += [terrain('water', m, 300 + m) for m in range(16)]
    cols = 8
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new('RGBA', (cols * T, rows * T), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * T, (i // cols) * T))
    sheet.save(os.path.join(TILES_DIR, 'world_tiles.png'))
    return len(tiles), cols, sheet.size

# ---------------- 소품 ----------------
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

def shadow(img, cx, cy, rx, ry):
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(0, 0, 0, 80))
    sh.alpha_composite(img)
    return sh

def tree(seed):
    rnd = random.Random(seed)
    img = Image.new('RGBA', (48, 72), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    bark, barkD, barkL = (74, 54, 38), (52, 38, 28), (96, 72, 50)
    # 줄기 (살짝 비틀림) + 뿌리
    lean = rnd.choice((-2, -1, 1, 2))
    for y in range(40, 69):
        t = (y - 40) / 28
        x = 24 + lean * (1 - t) * 1.5
        wdt = 4 + t * 2
        d.line([x - wdt, y, x + wdt, y], fill=bark)
        img.putpixel((int(x - wdt + 1), y), barkD); img.putpixel((int(x + wdt - 1), y), barkD)
        if y % 4 == rnd.randint(0, 3): img.putpixel((int(x - 1), y), barkL)
    for s in (-1, 1):  # 뿌리
        d.line([24, 66, 24 + s * 9, 69], fill=barkD, width=2)
    # 잎: 덩어리 원들 (어두움 → 기본 → 밝음 → 하이라이트)
    leafD, leaf, leafL, leafH = (34, 58, 36), (46, 78, 44), (62, 98, 54), (84, 120, 66)
    blobs = [(24 + rnd.randint(-3, 3), 26, 18), (14, 30, 11), (34, 30, 11), (20, 17, 11), (30, 16, 10), (24, 36, 12)]
    for x, y, r in blobs: d.ellipse([x - r, y - r + 2, x + r, y + r + 2], fill=leafD)
    for x, y, r in blobs: d.ellipse([x - r + 1, y - r, x + r - 1, y + r - 2], fill=leaf)
    for x, y, r in blobs: d.ellipse([x - r * 0.6 - 2, y - r * 0.7 - 1, x + r * 0.4, y + r * 0.2 - 2], fill=leafL)
    for x, y, r in blobs[:4]:
        d.ellipse([x - r * 0.3 - 3, y - r * 0.6 - 1, x - r * 0.3, y - r * 0.6 + 1], fill=leafH)
    # 잎 사이 점 (질감)
    for _ in range(70):
        x, y = rnd.randrange(4, 44), rnd.randrange(4, 48)
        c = img.getpixel((x, y))
        if c[3] and c[:3] in (leaf, leafL): img.putpixel((x, y), leafD + (255,) if rnd.random() < 0.5 else leafL + (255,))
    return shadow(outline(img), 24, 68, 15, 3)

def bush(seed):
    rnd = random.Random(seed)
    img = Image.new('RGBA', (34, 22), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    cD, c, cL = (32, 56, 34), (44, 74, 42), (62, 96, 54)
    blobs = [(10, 14, 7), (24, 14, 7), (17, 10, 8), (8, 9, 5), (26, 9, 5)]
    for x, y, r in blobs: d.ellipse([x - r, y - r + 1, x + r, y + r + 1], fill=cD)
    for x, y, r in blobs: d.ellipse([x - r + 1, y - r, x + r - 1, y + r - 1], fill=c)
    for x, y, r in blobs: d.ellipse([x - r * 0.6, y - r * 0.7, x + r * 0.2, y], fill=cL)
    for _ in range(25):
        x, y = rnd.randrange(2, 32), rnd.randrange(2, 20)
        if img.getpixel((x, y))[3]: img.putpixel((x, y), cD + (255,))
    for x in (6, 14, 22, 29):  # 잎 끝 뾰족
        img.putpixel((x, 1 + (x % 3)), c + (255,))
    return shadow(outline(img), 17, 20, 14, 2)

def workbench():
    img = Image.new('RGBA', (40, 30), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    wood, woodD, woodL = (110, 80, 52), (78, 56, 38), (140, 106, 70)
    d.rectangle([4, 16, 7, 28], fill=woodD); d.rectangle([32, 16, 35, 28], fill=woodD)   # 다리
    d.rectangle([2, 11, 37, 17], fill=wood)                                             # 상판
    for x in range(2, 38, 7): d.line([x, 11, x, 17], fill=woodD)                       # 판자 이음
    d.line([2, 11, 37, 11], fill=woodL)
    d.rectangle([22, 5, 33, 10], fill=(84, 88, 94)); d.rectangle([25, 3, 31, 5], fill=(110, 114, 120))  # 모루
    d.line([22, 5, 33, 5], fill=(140, 144, 150))
    d.line([8, 4, 8, 11], fill=woodD, width=2); d.rectangle([5, 3, 11, 5], fill=(150, 150, 156))         # 망치
    d.rectangle([14, 8, 18, 10], fill=(160, 120, 70))                                   # 가죽 조각
    return shadow(outline(img), 20, 28, 17, 2)

def dummy():
    img = Image.new('RGBA', (32, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    pole, straw, strawD, strawL = (84, 62, 42), (150, 124, 72), (112, 92, 52), (184, 158, 100)
    d.rectangle([14, 16, 17, 38], fill=pole)
    d.rectangle([3, 16, 28, 18], fill=pole)
    d.rounded_rectangle([8, 12, 23, 28], radius=3, fill=straw)
    for y in range(13, 28, 3): d.line([9, y, 22, y], fill=strawD)
    d.line([8, 20, 23, 20], fill=(96, 70, 44), width=2)  # 끈
    d.ellipse([10, 1, 21, 12], fill=straw); d.ellipse([12, 2, 17, 6], fill=strawL)
    d.rectangle([13, 6, 14, 7], fill=(40, 30, 24)); d.rectangle([17, 6, 18, 7], fill=(40, 30, 24))
    for x in (4, 27): d.line([x, 15, x, 19], fill=strawD)  # 팔 끝 짚
    return shadow(outline(img), 16, 38, 9, 2)

def props():
    for i in range(3): tree(10 + i * 7).save(os.path.join(TILES_DIR, f'tree{i}.png'))
    bush(5).save(os.path.join(TILES_DIR, 'bush.png'))
    workbench().save(os.path.join(TILES_DIR, 'workbench.png'))
    dummy().save(os.path.join(TILES_DIR, 'dummy.png'))

# ---------------- 맵 바닥 다시 매기기 ----------------
def kind_of(gid):
    """타일 번호 → 종류 (예전 임시 타일셋 1~4와 새 타일셋 둘 다 이해)"""
    if gid in (3,): return 'dirt'
    if gid in (4,): return 'water'
    if 5 <= gid <= 20: return 'dirt'
    if 21 <= gid <= 36: return 'water'
    return 'grass'

def remap():
    m = json.load(open(MAP))
    layer = next(l for l in m['layers'] if l['name'] == 'ground')
    Wm, Hm = m['width'], m['height']
    data = layer['data']
    # 이미 새 타일셋이면 종류는 그대로 읽힘 (1~4 = 풀)
    old_ts = m['tilesets'][0].get('name') == 'placeholder_tiles'
    kinds = [[('dirt' if data[y * Wm + x] == 3 else 'water' if data[y * Wm + x] == 4 else 'grass') if old_ts else kind_of(data[y * Wm + x])
              for x in range(Wm)] for y in range(Hm)]
    rnd = random.Random(42)
    new = []
    for y in range(Hm):
        for x in range(Wm):
            k = kinds[y][x]
            if k == 'grass':
                r = rnd.random()
                idx = 2 if r < 0.05 else 3 if r < 0.09 else 1 if r < 0.35 else 0
            else:
                mask = 0
                for bit, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0))):
                    X, Y = x + dx, y + dy
                    same = (0 <= X < Wm and 0 <= Y < Hm and kinds[Y][X] == k) or not (0 <= X < Wm and 0 <= Y < Hm)
                    if same: mask |= bit
                idx = (4 if k == 'dirt' else 20) + mask
            new.append(idx + 1)  # firstgid 1
    layer['data'] = new
    n, cols, size = 36, 8, (8 * T, 5 * T)
    m['tilesets'] = [{
        'firstgid': 1, 'name': 'world_tiles', 'image': '../assets/tiles/world_tiles.png',
        'imagewidth': size[0], 'imageheight': size[1], 'tilewidth': T, 'tileheight': T,
        'tilecount': n, 'columns': cols, 'margin': 0, 'spacing': 0,
        'tiles': [{'id': i, 'properties': [{'name': 'collides', 'type': 'bool', 'value': True}]} for i in range(20, 36)],
    }]
    json.dump(m, open(MAP, 'w'), indent=1)
    print('map remapped', Wm, Hm)

if __name__ == '__main__':
    print('tiles', tileset())
    props()
    if '--remap' in sys.argv: remap()
