"""렌더 원본 → 도트 스프라이트 시트 (색 톤 조정, 알파 정리, 1px 외곽선, 공통 팔레트) + 메타 JSON
사용: python3 sprite_post.py <raw_dir> <out_png> <out_json> <colors>
"""
import sys, json, os
from PIL import Image, ImageEnhance

raw, out_png, out_json, ncol = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
meta = json.load(open(os.path.join(raw, 'meta.json')))
F = meta['frame']
DIRS = ['down', 'downright', 'right', 'upright', 'up', 'upleft', 'left', 'downleft']
OUTLINE = (26, 20, 15, 255)

def tone(im):
    rgb = im.convert('RGB'); a = im.getchannel('A')
    rgb = ImageEnhance.Color(rgb).enhance(0.62)       # 채도 낮춤 (탁한 어두운 판타지)
    rgb = ImageEnhance.Brightness(rgb).enhance(0.86)  # 살짝 어둡게
    rgb = ImageEnhance.Contrast(rgb).enhance(1.18)    # 명암 또렷하게
    out = rgb.convert('RGBA'); out.putalpha(a.point(lambda v: 255 if v >= 110 else 0))  # 반투명 가장자리 제거
    return out

def outline(im):
    px = im.load(); w, h = im.size
    res = im.copy(); rp = res.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0:
                        rp[x, y] = OUTLINE; break
    return res

anims = list(meta['anims'].keys())
cols = max(a['frames'] for a in meta['anims'].values())
rows = []  # (anim, dir)
for a in anims:
    for d in DIRS: rows.append((a, d))
sheet = Image.new('RGBA', (cols * F, len(rows) * F), (0, 0, 0, 0))
frames = {}
for r, (a, d) in enumerate(rows):
    for i in range(meta['anims'][a]['frames']):
        im = tone(Image.open(os.path.join(raw, f'{a}_{d}_{i:02d}.png')).convert('RGBA'))
        sheet.alpha_composite(im, (i * F, r * F))
# 공통 팔레트로 색 줄이기 (투명은 따로 보존)
alpha = sheet.getchannel('A')
q = sheet.convert('RGB').quantize(colors=ncol, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
q.putalpha(alpha)
# 외곽선은 프레임별로 (옆 프레임과 붙지 않게)
final = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
for r in range(len(rows)):
    for c in range(cols):
        box = (c*F, r*F, (c+1)*F, (r+1)*F)
        final.alpha_composite(outline(q.crop(box)), (c*F, r*F))
final.save(out_png, optimize=True)
info = {
    'source': 'KayKit Adventurers (CC0) Rogue_Hooded — tools: Blender 렌더 → sprite_post.py',
    'frameWidth': F, 'frameHeight': F, 'columns': cols,
    'origin': {'x': round(meta['footX'] / F, 4), 'y': round(meta['footY'] / F, 4)},
    'directions': DIRS,
    'anims': {a: {'row': anims.index(a) * len(DIRS), 'frames': meta['anims'][a]['frames'], 'loop': meta['anims'][a]['loop'], 'source': meta['anims'][a]['source']} for a in anims},
}
json.dump(info, open(out_json, 'w'), indent=1, ensure_ascii=False)
print('sheet', final.size, 'rows', len(rows), 'cols', cols)
