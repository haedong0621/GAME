"""
절벽 굽기(bake) — 맵의 height 레이어(칸 단위)를 부드러운 지형으로 바꿔 큰 그림 + 충돌 격자로 만든다.

왜: 칸 단위 절벽 타일은 반듯한 네모(마인크래프트 느낌)가 된다. 스타크래프트·드로바처럼 구불구불한 언덕을 위해
  1) 고지대 칸을 픽셀 단위로 흐리게(blur) 한 뒤 노이즈를 섞어 경계를 만든다 → 모서리는 둥글게, 계단 모양으로 칠한 칸은 대각선으로
  2) 3/4 시점 "아래로 밀어내기": 고지대 경계 바로 아래 픽셀들을 벽면으로 칠한다 (높이는 위치마다 조금씩 다름)
     → 어떤 곡선이든 남쪽은 벽면이 보이고, 동·서 경사면은 옆면이 얇게 보임
  3) 벽면 윗턱(늘어진 풀), 지층·금·박힌 돌, 밑동 돌무더기·그늘, 계단, 덩굴을 그림에 함께 굽는다
  4) 8px 격자로 "어디가 막혔는지"를 기록 → 게임은 이 격자로 충돌·뛰어내리기·덩굴 오르기를 판단

입력: maps/world.tmj  (height 레이어: 1 절벽 고지대, 2 낮은 턱 고지대, 3 계단 자리 / climb 오브젝트 = 덩굴)
출력: assets/maps/<맵>_cliffs_<x>_<y>.png (1024px 조각, 투명 바탕), maps/<맵>_terrain.json (격자·조각 목록)
실행: python3 tools/art/terrain_bake.py   (pixel_world.py --remap 이 끝에 자동으로 부름)
Godot: 같은 그림 조각을 Sprite2D로, 격자에서 CollisionPolygon2D(또는 TileMap 충돌 레이어)를 만든다.
"""
from PIL import Image, ImageFilter
import numpy as np
import json, math, os, random

ROOT = os.path.dirname(os.path.abspath(__file__))
MAP = os.path.join(ROOT, '..', '..', 'maps', 'world.tmj')
OUT_IMG = os.path.join(ROOT, '..', '..', 'assets', 'maps')
T = 32
CELL = 8          # 충돌 격자 크기 (px)
CHUNK = 1024      # 그림 조각 크기

FACE = np.array([(40, 34, 30), (58, 48, 40), (78, 64, 50), (102, 84, 64), (128, 108, 82)], dtype=np.float32)
GRASS = {'tuft': (98, 132, 72), 'base': (64, 92, 52), 'dark': (50, 74, 42), 'deep': (34, 52, 32)}
FACE_H = {1: 50, 2: 20}       # 벽면 높이 (절벽 / 낮은 턱)

def value_noise(w, h, scale, seed, octaves=2):
    """부드러운 노이즈 (-1~1): 작은 무작위 격자를 키워서 겹침"""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), dtype=np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(2, int(scale / (2 ** o)))
        gw, gh = w // s + 2, h // s + 2
        g = Image.fromarray(((rng.random((gh, gw)) * 255).astype(np.uint8)), 'L')
        g = g.resize((gw * s, gh * s), Image.BICUBIC).crop((0, 0, w, h))
        out += (np.asarray(g, dtype=np.float32) / 127.5 - 1) * amp
        tot += amp; amp *= 0.5
    return out / tot

def load():
    m = json.load(open(MAP))
    Wt, Ht = m['width'], m['height']
    hl = next((l for l in m['layers'] if l['name'] == 'height'), None)
    hts = next((t for t in m['tilesets'] if t['name'] == 'height_marks'), None)
    H = np.zeros((Ht, Wt), dtype=np.int32)
    if hl and hts:
        d = np.array(hl['data'], dtype=np.int32).reshape(Ht, Wt)
        H = np.where(d >= hts['firstgid'], d - hts['firstgid'] + 1, 0)
    climbs = [o for l in m['layers'] if l['type'] == 'objectgroup' for o in l['objects'] if o['type'] == 'climb']
    return m, H, climbs

def bake():
    m, H, climbs = load()
    Ht, Wt = H.shape
    W, Hp = Wt * T, Ht * T
    rnd = random.Random(7)
    high_t = ((H == 1) | (H == 2)).astype(np.uint8) * 255
    # 1) 부드러운 고지대 모양
    field = Image.fromarray(high_t, 'L').resize((W, Hp), Image.NEAREST).filter(ImageFilter.GaussianBlur(9))
    f = np.asarray(field, dtype=np.float32) / 255
    f = f + value_noise(W, Hp, 40, 11) * 0.16 + value_noise(W, Hp, 10, 12, 1) * 0.05
    M = f > 0.5
    # 절벽 ↔ 낮은 턱 비율 (부드럽게 섞음 → 벽면 높이가 서서히 바뀜): 1 = 절벽, 0 = 낮은 턱
    def blur_of(mask, r):
        im = Image.fromarray(mask.astype(np.uint8) * 255, 'L').resize((W, Hp), Image.NEAREST).filter(ImageFilter.GaussianBlur(r))
        return np.asarray(im, dtype=np.float32) / 255
    cw = blur_of(H == 1, 22); lw = blur_of(H == 2, 22)
    cliffw = cw / (cw + lw + 1e-4)
    ramp = np.asarray(Image.fromarray((H == 3).astype(np.uint8) * 255, 'L').resize((W, Hp), Image.NEAREST)) > 0

    # 2) 벽면: 각 열에서 고지대가 끝나는 곳부터 아래로 h픽셀
    hnoise = value_noise(W, 1, 30, 21, 2)[0]
    F = np.zeros((Hp, W), dtype=np.float32)       # 0 = 벽면 아님, 그 외 = 벽면 안의 깊이 비율(0~1]
    Fk = np.zeros((Hp, W), dtype=np.uint8)        # 벽면 종류 1 절벽 / 2 낮은 턱
    Fstart = np.zeros((Hp, W), dtype=np.int32)
    gx = np.gradient(f, axis=1)
    for x in range(W):
        col = M[:, x]
        ys = np.where(col[:-1] & ~col[1:])[0] + 1          # 고지대 → 낮은 땅으로 바뀌는 곳
        for y0 in ys:
            w = cliffw[max(0, y0 - 4), x]
            k = 1 if w >= 0.5 else 2
            h = int(FACE_H[2] + (FACE_H[1] - FACE_H[2]) * np.clip((w - 0.3) / 0.4, 0, 1) + hnoise[x] * (2 + 4 * w))
            for d in range(h):
                y = y0 + d
                if y >= Hp or M[y, x]: break
                F[y, x] = (d + 1) / h
                Fk[y, x] = k
                Fstart[y, x] = y0

    img = np.zeros((Hp, W, 4), dtype=np.float32)
    # 3-1) 고지대 윗면: 살짝 밝게 + 경계 테두리(북·동·서)
    img[M] = (226, 240, 176, 26)
    edge_out = (~M) & (F == 0) & (np.roll(M, 1, 0) | np.roll(M, -1, 0) | np.roll(M, 1, 1) | np.roll(M, -1, 1))
    img[edge_out] = (28, 40, 26, 230)
    edge_in = M & (~np.roll(M, -1, 1) | ~np.roll(M, 1, 1) | ~np.roll(M, 1, 0))
    img[edge_in & (F[np.clip(np.arange(Hp) + 1, 0, Hp - 1)][:, :] == 0)] = (120, 150, 86, 200)

    # 3-2) 벽면 색: 위 밝고 아래 어두움, 지층, 옆면 명암(경사 방향), 금
    strata = value_noise(W, Hp, 6, 31, 1)
    crack = value_noise(W, Hp, 3, 32, 1)
    yy = np.arange(Hp)[:, None].repeat(W, 1)
    face = F > 0
    depth = F
    shade = 3.2 - depth * 2.4                               # 3.2(밝음) → 0.8(어두움)
    shade += np.where(((yy + (strata * 4).astype(int)) % 9) == 0, -0.9, 0)
    shade += np.where(((yy + (strata * 4).astype(int)) % 9) == 1, 0.5, 0)
    shade += np.clip(gx * -40, -1.0, 1.0) * 0.8             # 동쪽으로 꺾인 면은 밝게, 서쪽은 어둡게
    shade += np.where(crack > 0.62, -1.2, 0)
    si = np.clip(np.round(shade), 0, 4).astype(int)
    img[face, :3] = FACE[si[face]]
    img[face, 3] = 255
    # 윗턱: 늘어진 풀 (들쭉날쭉)
    lipn = value_noise(W, 1, 3, 41, 1)[0]
    for x in range(W):
        lip = int(3 + max(0, lipn[x]) * 6)
        ys = np.where(face[:, x] & (yy[:, x] - Fstart[:, x] < lip))[0]
        for y in ys:
            d = y - Fstart[y, x]
            img[y, x] = (*(GRASS['tuft'] if d == 0 else GRASS['base'] if d < lip - 1 else GRASS['dark']), 255)
    # 밑동: 아래 땅에 그늘
    below = (~face) & (~M) & np.roll(face, 1, 0)
    for d in range(1, 8):
        sh = np.roll(face, d, 0) & (~face) & (~M)
        a = 120 * (1 - d / 8)
        sel = sh & (img[..., 3] < a)
        img[sel] = (10, 16, 10, a)

    # 3-3) 계단: 계단 칸 안의 벽면은 디딤돌로 (지나갈 수 있음)
    rz = face & ramp
    tread = ((yy - Fstart) % 7)
    ci = np.where(tread < 2, 4, np.where(tread < 4, 3, np.where(tread < 6, 2, 1)))
    img[rz, :3] = FACE[ci[rz]]
    xx = np.arange(W)[None, :].repeat(Hp, 0)
    for side in (-1, 1):  # 계단 양옆 돌턱
        border = rz & ~np.roll(ramp, side * 3, 1)
        img[border, :3] = FACE[1]

    # 3-4) 덩굴 (climb 사각형 안의 벽면)
    vine = [(30, 52, 30), (44, 76, 40), (64, 104, 54), (92, 132, 70)]
    for c in climbs:
        x0, x1 = int(c['x']), int(c['x'] + c['width'])
        y0, y1 = int(c['y']), int(c['y'] + c['height'])
        for k, vx in enumerate(range(x0 + 3, x1 - 2, 6)):
            vx += rnd.randint(-1, 1)
            for y in range(y0, y1):
                xx_ = vx + int(1.5 * math.sin(y * 0.25 + k))
                if not (0 <= xx_ < W - 2 and 0 <= y < Hp) or not face[y, xx_]: continue
                img[y, xx_] = (*vine[0], 255); img[y, xx_ + 1] = (*vine[1], 255)
                if y % 5 == k % 5:
                    for dx, c_ in ((2, 2), (3, 3), (-1, 2), (-2, 1)):
                        if 0 <= xx_ + dx < W: img[y, xx_ + dx] = (*vine[c_], 255)

    # 3-5) 밑동 돌무더기 (벽면 아래 경계를 따라 띄엄띄엄)
    bottoms = [(x, y) for x in range(0, W, 3) for y in np.where(face[:-1, x] & ~face[1:, x] & ~M[1:, x])[0]]
    rnd.shuffle(bottoms)
    for x, y in bottoms[: len(bottoms) // 9]:
        r = rnd.choice((1.5, 2, 2.5, 3))
        cx, cy = x + rnd.uniform(-2, 2), y + rnd.uniform(0, 2)
        for py in range(int(cy - r), int(cy + r) + 1):
            for px in range(int(cx - r - 1), int(cx + r + 2)):
                if not (0 <= px < W and 0 <= py < Hp) or ramp[py, px]: continue
                dx, dy = (px - cx) / (r + 1), (py - cy) / r
                if dx * dx + dy * dy > 1: continue
                l = -dx * 0.6 - dy * 0.8
                img[py, px] = (*FACE[3 if l > 0.3 else 2 if l > -0.2 else 1], 255)

    # 3-6) 외곽선: 벽면·고지대 바깥 경계에 어두운 선 (캐릭터 도트와 같은 느낌)
    solid_vis = img[..., 3] > 200
    out = (~solid_vis) & (np.roll(face, -1, 1) | np.roll(face, 1, 1) | np.roll(face, -1, 0))
    img[out & ~M] = (22, 20, 18, 255)

    # 4) 충돌 격자 (8px): '.' 낮은 땅, '^' 고지대, 'C' 절벽 벽면, 'L' 낮은 턱 벽면, '#' 경계띠, 'R' 계단
    gw, gh = W // CELL, Hp // CELL
    rows = []
    for cy in range(gh):
        row = []
        for cx in range(gw):
            sl = (slice(cy * CELL, (cy + 1) * CELL), slice(cx * CELL, (cx + 1) * CELL))
            fm, mm, rr = face[sl], M[sl], ramp[sl]
            if rr.any() and (fm.any() or (mm.any() and not mm.all())): row.append('R')
            elif fm.mean() >= 0.25: row.append('L' if (Fk[sl][fm] == 2).mean() > 0.5 else 'C')
            elif mm.any() and not mm.all(): row.append('#')
            elif mm.mean() > 0.5: row.append('^')
            else: row.append('.')
        rows.append(''.join(row))

    # 덩굴 칸 표시 (격자 기준, 벽면 칸만)
    vines = []
    for c in climbs:
        vines.append({'x': c['x'], 'y': c['y'], 'width': c['width'], 'height': c['height']})

    # 그림 조각 저장
    os.makedirs(OUT_IMG, exist_ok=True)
    name = os.path.splitext(os.path.basename(MAP))[0]
    for fn in os.listdir(OUT_IMG):
        if fn.startswith(f'{name}_cliffs_'): os.remove(os.path.join(OUT_IMG, fn))
    rgba = np.clip(img, 0, 255).astype(np.uint8)
    chunks = []
    for y in range(0, Hp, CHUNK):
        for x in range(0, W, CHUNK):
            part = rgba[y:y + CHUNK, x:x + CHUNK]
            if part[..., 3].max() == 0: continue
            key = f'{name}_cliffs_{x // CHUNK}_{y // CHUNK}'
            Image.fromarray(part, 'RGBA').save(os.path.join(OUT_IMG, key + '.png'), optimize=True)
            chunks.append({'key': key, 'x': x, 'y': y, 'path': f'assets/maps/{key}.png'})
    out_json = os.path.join(os.path.dirname(MAP), f'{name}_terrain.json')
    json.dump({'_설명': 'tools/art/terrain_bake.py가 만든 파일 (직접 고치지 말 것). cell px 격자: . 낮은 땅 ^ 고지대 C 절벽 벽면 L 낮은 턱 벽면 # 경계띠 R 계단',
               'cell': CELL, 'cols': gw, 'rows': gh, 'grid': rows, 'climb': vines, 'chunks': chunks},
              open(out_json, 'w'), ensure_ascii=False, indent=0)
    print('terrain baked', W, Hp, 'chunks', len(chunks), 'solid cells', sum(r.count('C') + r.count('L') + r.count('#') for r in rows))

if __name__ == '__main__':
    bake()
