"""3D 캐릭터 → 8방향 도트 스프라이트 원본 렌더 (Blender, Cycles CPU, 투명 배경, 안티앨리어싱 최소)
사용: python bl_render.py <model.glb> <out_dir> <frame_px> <ortho_scale> <elev_deg> <yaw_offset_deg> <spec>
spec 예: "idle:Idle:4,walk:Walking_A:8"   (게임 이름:3D 동작 이름:뽑을 프레임 수)
"""
import bpy, sys, math, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

model, out, px, oscale, elev, yaw_off, spec = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), sys.argv[7]
dirs_only = os.environ.get('DIRS')  # 예: "0,2" 로 일부 방향만
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=model)
HIDE = set(os.environ.get('HIDE', '1H_Crossbow,2H_Crossbow,Throwable,Icosphere,Knife_Offhand').split(','))
for o in bpy.data.objects:
    if o.name in HIDE:
        o.hide_render = True
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
root = rig

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 12
sc.cycles.use_denoising = False
sc.cycles.pixel_filter_type = 'BOX'
sc.cycles.filter_width = 0.01           # 안티앨리어싱 거의 없이 → 픽셀이 또렷
sc.render.film_transparent = True
sc.render.resolution_x = px
sc.render.resolution_y = px
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'

# 조명: 왼쪽 위에서 오는 해 + 약한 주변광
world = bpy.data.worlds.new('W'); sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 3.2
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
sc.collection.objects.link(sun)

# 카메라: 원근 없음(정사영), 화면 아래쪽(-Y)에서 elev도로 내려다봄
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = oscale
e = math.radians(elev)
target = Vector((0, 0, 0.9))
dist = 20
cam.location = target + Vector((0, -math.cos(e) * dist, math.sin(e) * dist))
cam.rotation_euler = (math.pi / 2 - e, 0, 0)
sc.collection.objects.link(cam)
sc.camera = cam

sc.render.threads_mode = 'FIXED'
sc.render.threads = int(os.environ.get('THREADS', '1'))
bpy.context.view_layer.update()  # 카메라 행렬 갱신 후 투영
# 발밑(원점)이 화면 어디에 찍히는지 → 게임 origin
co = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
meta = {'frame': px, 'footX': round(co.x * px, 2), 'footY': round((1 - co.y) * px, 2), 'elev': elev, 'orthoScale': oscale, 'anims': {}}

ad = rig.animation_data or rig.animation_data_create()
# 화면 방향 8개: 0=아래(카메라 쪽), 1=오른쪽아래, 2=오른쪽, 3=오른쪽위, 4=위, 5=왼쪽위, 6=왼쪽, 7=왼쪽아래  (게임 각도 기준: 아래=90°)
DIR_NAMES = ['down', 'downright', 'right', 'upright', 'up', 'upleft', 'left', 'downleft']
dir_list = [int(d) for d in dirs_only.split(',')] if dirs_only else range(8)
for item in spec.split(','):
    name, act_name, n = item.split(':'); n = int(n)
    act = bpy.data.actions[act_name]
    ad.action = act
    try:
        if hasattr(ad, 'action_slot') and act.slots:
            ad.action_slot = act.slots[0]
    except Exception as ex:
        print('slot warn', ex)
    f0, f1 = act.frame_range
    loop = name in ('idle', 'walk', 'run')
    frames = [f0 + (f1 - f0) * (i / n if loop else i / max(1, n - 1)) for i in range(n)]
    meta['anims'][name] = {'source': act_name, 'frames': n, 'loop': loop}
    for d in dir_list:
        # 캐릭터 기본 정면 = 카메라 쪽(아래). 방향 d는 화면에서 시계방향 45°씩
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (root.rotation_euler.x, root.rotation_euler.y, math.radians(d * 45 + yaw_off))
        for i, f in enumerate(frames):
            sc.frame_set(int(f), subframe=f - int(f))
            sc.render.filepath = os.path.join(out, f'{name}_{DIR_NAMES[d]}_{i:02d}.png')
            bpy.ops.render.render(write_still=True)
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
print('DONE', json.dumps(meta))
