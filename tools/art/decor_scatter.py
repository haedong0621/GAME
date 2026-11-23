"""
지역별 소품 자동 깔기 — 맵의 region 레이어와 굽기 결과(maps/world_terrain.json)를 보고
지역마다 어울리는 소품(type=decor, kind=…)을 흩뿌린다. 이 도구가 놓은 것은 name='auto'로 표시해 두고,
다시 돌리면 지우고 새로 깐다 (손으로 놓은 소품은 그대로).
실행: python3 tools/art/decor_scatter.py   (pixel_world.py --remap 끝에 자동으로 부름)
"""
import json, os, random, math

ROOT = os.path.dirname(os.path.abspath(__file__))
MAP = os.path.join(ROOT, '..', '..', 'maps', 'world.tmj')
TERRAIN = os.path.join(ROOT, '..', '..', 'maps', 'world_terrain.json')

# 지역 번호 → [(소품, 칸당 확률)]
DENSITY = {
    1: [('tallgrass', 0.07), ('bones', 0.008)],             # 마른 들판
    2: [('reeds', 0.06), ('mushrooms', 0.02)],              # 늪지
    3: [('mushrooms', 0.05)],                               # 어두운 숲
    4: [('bones', 0.02), ('tallgrass', 0.025)],             # 사냥꾼의 들판
}

def scatter():
    m = json.load(open(MAP))
    t = json.load(open(TERRAIN))
    Wt, Ht = m['width'], m['height']
    layer = next(l for l in m['layers'] if l['type'] == 'objectgroup')
    layer['objects'] = [o for o in layer['objects'] if not (o['type'] == 'decor' and o.get('name') == 'auto')]
    gl = next(l for l in m['layers'] if l['name'] == 'ground')['data']
    regions = t['regions']
    cell, grid = t['cell'], t['grid']
    occupied = [(o['x'], o['y']) for o in layer['objects'] if o.get('point')]
    nid = max(o['id'] for o in layer['objects']) + 1
    rnd = random.Random(77)
    added = 0
    for ty in range(Ht):
        for tx in range(Wt):
            r = int(regions[ty][tx])
            gid = gl[ty * Wt + tx]
            if 5 <= gid <= 36: continue                       # 흙길·물 위엔 안 깜
            for kind, p in DENSITY.get(r, []):
                if rnd.random() >= p: continue
                x, y = tx * 32 + rnd.uniform(4, 28), ty * 32 + rnd.uniform(8, 30)
                c = grid[int(y // cell)][int(x // cell)] if int(y // cell) < len(grid) else '.'
                if c not in '.^': continue                    # 절벽·경계·계단 위엔 안 깜
                if any(math.hypot(x - ox, y - oy) < 26 for ox, oy in occupied): continue
                layer['objects'].append({'id': nid, 'name': 'auto', 'type': 'decor', 'x': round(x), 'y': round(y), 'point': True,
                                         'rotation': 0, 'visible': True, 'width': 0, 'height': 0,
                                         'properties': [{'name': 'kind', 'type': 'string', 'value': kind}]})
                occupied.append((x, y)); nid += 1; added += 1
    m['nextobjectid'] = nid
    json.dump(m, open(MAP, 'w'), indent=1)
    print('decor scattered', added)

if __name__ == '__main__':
    scatter()
