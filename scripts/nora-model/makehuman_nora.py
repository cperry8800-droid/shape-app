# makehuman_nora.py — Nora as a MakeHuman person (CC0 assets) exported as the VRM 1.0 the booth loads.
#
#   <bpy python> makehuman_nora.py -- <nora.json> <out.vrm> <vrm-addon-src-dir> [--render out.png]
#
# The MetaHuman route (mh_to_vrm.py, docs/BUILD-2026-10-09-metahuman-nora.md) needs Unreal on the
# owner's machine; this one runs here, in Blender's Python module with MPFB2 (MakeHuman for Blender)
# installed as an extension and the MakeHuman asset packs in its library (see README.md). In order:
#   1. The body from nora.json's macro sliders and face targets, baked into the mesh.
#   2. The game_engine rig (UE mannequin bone names, the ones maps.json's humanoid map already uses),
#      skin, eyes, brows, lashes, hair and clothes, each fitted by MPFB.
#   3. The 52 ARKit face units (MakeHuman's faceunits01 pack, CC0) as shape keys on the body,
#      carried onto the brows and lashes, so maps.json's expression binds (blink, happy, relaxed,
#      the visemes) work unchanged.
#   4. The skin MakeHuman hides under the clothes is deleted, not masked: a mask modifier cannot be
#      applied to a mesh with shape keys, and the exporter ignores it.
#   5. Two eye bones under the head, at the eyeballs' centres, each eyeball weighted to its bone:
#      the rig has none, and the booth's look-at turns the eyes as bones.
#   6. Plain materials the exporter understands: the diffuse texture (nora.json's tints multiplied
#      in), alpha-clipped for hair, brows and lashes; textures no larger than the budget.
#   7. VRM data (humanoid, expressions, look-at, meta) and the export, as mh_to_vrm.py writes them.
# Then compress.mjs and check-vrm.mjs, as for the MetaHuman route.
import importlib
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mh_to_vrm import enable_addons, select_only, limit_and_normalise, setup_vrm  # noqa: E402

a = sys.argv[sys.argv.index('--') + 1:]
SPEC_PATH, OUT, VRM_SRC = a[0], a[1], a[2]
RENDER = a[a.index('--render') + 1] if '--render' in a else None
SPEC = json.load(open(SPEC_PATH))
MAPS = json.load(open(os.path.join(HERE, 'maps.json')))

# The MakeHuman game_engine rig has three spine bones (the MetaHuman five) and no eye bones; the rest
# of maps.json's humanoid map is the same UE mannequin naming.
HUMANOID = dict(MAPS['humanoid'], spine='spine_01', chest='spine_02', upperChest='spine_03', leftEye='eye_l', rightEye='eye_r')
TEX_MAX = {'SKIN': MAPS['budget']['maxTexturePx']}   # the face needs the detail; the rest 1024


def log(*x):
    print('[makehuman_nora]', *x, flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
enable_addons(VRM_SRC)
pkg = 'bl_ext.user_default.mpfb'
import addon_utils  # noqa: E402
addon_utils.enable(pkg, default_set=True)
HS = importlib.import_module(pkg + '.services.humanservice').HumanService
TS = importlib.import_module(pkg + '.services.targetservice').TargetService
FS = importlib.import_module(pkg + '.services.faceservice').FaceService
LS = importlib.import_module(pkg + '.services.locationservice').LocationService
DATA = LS.get_user_data()


def find_mhclo(kind, name):
    d = os.path.join(DATA, kind, name)
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f.endswith('.mhclo'):
            return os.path.join(d, f)
    raise SystemExit(f'{kind}/{name}: not in the MPFB asset library (README.md lists the packs)')


# ── 1-2. body, rig, assets ──────────────────────────────────────────────────
macro = TS.get_default_macro_info_dict()
for k, v in SPEC['macro'].items():
    if k == 'race':
        macro['race'].update(v)
    else:
        macro[k] = v
body = HS.create_human(macro_detail_dict=macro)
for name, w in SPEC.get('face', {}).items():
    path = TS.target_full_path(name)
    if not path:
        raise SystemExit('no MakeHuman target ' + name)
    TS.load_target(body, path, weight=w)
TS.bake_targets(body)
rig = HS.add_builtin_rig(body, 'game_engine')
HS.set_character_skin(os.path.join(DATA, 'skins', SPEC['skin'], SPEC['skin'] + '.mhmat'), body, skin_type='GAMEENGINE')
parts = [(body, 'body', 'SKIN')]
add = lambda kind, name, atype: HS.add_mhclo_asset(find_mhclo(kind, name), body, asset_type=atype, subdiv_levels=0, material_type='MAKESKIN')
parts.append((add('eyes', SPEC['eyes'], 'Eyes'), SPEC['eyes'], 'EYES'))
parts.append((add('eyebrows', SPEC['eyebrows'], 'Eyebrows'), SPEC['eyebrows'], 'CARD'))
parts.append((add('eyelashes', SPEC['eyelashes'], 'Eyelashes'), SPEC['eyelashes'], 'CARD'))
parts.append((add('hair', SPEC['hair'], 'Hair'), SPEC['hair'], 'CARD'))
for c in SPEC['clothes']:
    parts.append((add('clothes', c, 'Clothes'), c, 'CLOTH'))
log('built', [(o.name, len(o.data.polygons)) for o, _, _ in parts])

# ── 3. ARKit face units ─────────────────────────────────────────────────────
if not FS.is_faceunits01_installed(force_recheck=True):
    raise SystemExit('the faceunits01 pack is not installed (README.md)')
FS.load_targets(body, load_microsoft_visemes=False, load_meta_visemes=False, load_arkit_faceunits=True)
FS.interpolate_targets(body)
for o, _, _ in parts:
    keys = o.data.shape_keys
    if keys:
        for kb in keys.key_blocks:
            bare = TS.shapekey_name_to_expression_name(kb.name)
            if bare:
                kb.name = bare
log('face units on the body', len(body.data.shape_keys.key_blocks) - 1 if body.data.shape_keys else 0)


# ── 4. delete what the masks hide ───────────────────────────────────────────
def delete_masked(obj):
    gone = 0
    for m in [m for m in obj.modifiers if m.type == 'MASK']:
        g = obj.vertex_groups.get(m.vertex_group)
        if g is not None:
            gi = g.index
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            dl = bm.verts.layers.deform.active
            # the mask SHOWS the group, or (inverted) hides it
            drop = [v for v in bm.verts if ((dl is not None and v[dl].get(gi, 0.0) > 0.5) == m.invert_vertex_group)]
            bmesh.ops.delete(bm, geom=drop, context='VERTS')
            bm.to_mesh(obj.data)
            bm.free()
            gone += len(drop)
        obj.modifiers.remove(m)
    return gone


log('hidden skin deleted', delete_masked(body))


def cover_skin(skin, garments, reach=0.03, poke=0.012, deep=0.012, shallow=0.003, opening=0.04):
    """The skin under the clothes, pulled back beneath them. MakeHuman's masks remove what is deep
    under the clothes; nearer the fabric the skin pokes through, at rest (an armpit, a seam) and more
    once she moves, since skin and cloth bend with different weights. Cutting that skin away left
    holes instead: as the fabric shifted with her arms, the cut showed through as black patches
    (measured in the booth, both with a tee and a camisole). So nothing is deleted. Each skin vertex
    under a garment (or through it by less than `poke`) is moved to sit `deep` beneath the fabric,
    tapering to `shallow` within `opening` of a garment's edge (a neckline, a strap, a hem), where a
    deep step would show. Shape keys move with it."""
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    verts, polys, edges = [], [], []
    for g in garments:
        base = len(verts)
        verts += [g.matrix_world @ v.co for v in g.data.vertices]
        polys += [[base + i for i in p.vertices] for p in g.data.polygons]
        gb = bmesh.new()
        gb.from_mesh(g.data)
        edges += [g.matrix_world @ ((e.verts[0].co + e.verts[1].co) / 2) for e in gb.edges if len(e.link_faces) == 1]
        edges += [g.matrix_world @ v.co for v in gb.verts if any(len(e.link_faces) == 1 for e in v.link_edges)]
        gb.free()
    tree = BVHTree.FromPolygons(verts, polys)
    kd = KDTree(max(1, len(edges)))
    for i, c in enumerate(edges):
        kd.insert(c, i)
    kd.balance()
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    mw = skin.matrix_world
    imw = mw.inverted()
    shapes = list(bm.verts.layers.shape.values())
    moved = 0
    for v in bm.verts:
        p = mw @ v.co
        loc, gn, _, dist = tree.find_nearest(p, reach)
        if loc is None:
            continue
        side = (p - loc).dot(gn)   # < 0: under the fabric
        # only where the fabric lies over the vertex, not off its edge, where the nearest point is the
        # edge itself
        if dist > 1e-5 and abs(side) < 0.7 * dist:
            continue
        if side >= poke:
            continue
        t = min(1.0, max(0.0, (kd.find(p)[2] - 0.01) / (opening - 0.01))) if edges else 1.0
        clear = shallow + (deep - shallow) * t * t * (3 - 2 * t)
        if side > -clear:
            d = (imw @ (loc - gn * clear)) - v.co
            v.co += d
            for sl in shapes:
                v[sl] += d
            moved += 1
    bm.to_mesh(skin.data)
    bm.free()
    return moved


log('skin pulled back under the clothes (vertices)', cover_skin(body, [o for o, _, k in parts if k == 'CLOTH']))

# ── 5. eye bones ────────────────────────────────────────────────────────────
eyes = parts[1][0]
select_only(rig)
bpy.ops.object.mode_set(mode='EDIT')
centres = {}
for side, sgn in (('l', 1), ('r', -1)):
    pts = [eyes.matrix_world @ v.co for v in eyes.data.vertices if v.co.x * sgn > 0]
    c = sum(pts, Vector()) / len(pts)
    centres[side] = c
    eb = rig.data.edit_bones.new('eye_' + side)
    local = rig.matrix_world.inverted() @ c
    eb.head = local
    eb.tail = local + Vector((0, -0.025, 0))   # pointing out of the face (she faces −Y)
    eb.parent = rig.data.edit_bones['head']
bpy.ops.object.mode_set(mode='OBJECT')
for g in list(eyes.vertex_groups):
    eyes.vertex_groups.remove(g)
for side, sgn in (('l', 1), ('r', -1)):
    g = eyes.vertex_groups.new(name='eye_' + side)
    g.add([v.index for v in eyes.data.vertices if v.co.x * sgn > 0], 1.0, 'REPLACE')
log('eye bones', {k: tuple(round(x, 3) for x in v) for k, v in centres.items()})


# ── 6. materials ────────────────────────────────────────────────────────────
def diffuse_path(obj):
    for m in obj.data.materials:
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.name.lower() == 'diffusetexture' and n.image:
                    return bpy.path.abspath(n.image.filepath_from_user())
    raise SystemExit('no diffuse texture on ' + obj.name)


def plain_material(obj, name, kind):
    img = bpy.data.images.load(diffuse_path(obj), check_existing=False)
    img.name = name
    limit = TEX_MAX.get(kind, 1024)
    if max(img.size) > limit:
        s = limit / max(img.size)
        img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))
    tint = SPEC.get('tints', {}).get(name)
    if tint or kind == 'CARD':
        px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
        if tint:
            # the pixels are linear here (Blender converts on load); the tint is given in sRGB
            lin = np.where(np.array(tint) <= 0.04045, np.array(tint) / 12.92, ((np.array(tint) + 0.055) / 1.055) ** 2.4)
            px[:, :3] *= lin[None, :].astype(np.float32)
        if kind == 'CARD':
            # A card's coverage is soft: clipped at 0.5 as drawn, the hair thinned to a bald scalp in the
            # booth (measured). Scaled ×2.5, the clip falls at 0.2 of the original coverage. The brows
            # and lashes less (×1.3): at ×2.5 the brows read heavy and drawn on.
            px[:, 3] = np.minimum(px[:, 3] * (2.5 if name == SPEC['hair'] else 1.3), 1.0)
        img.pixels[:] = px.ravel()
    img.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    # the eyes not glossy: at 0.15 they mirrored the booth's key light and bloomed into two orange lamps
    bsdf.inputs['Roughness'].default_value = {'SKIN': 0.55, 'EYES': 0.45, 'CARD': 0.5}.get(kind, 0.85)
    if kind in ('CARD', 'EYES'):
        # alpha clipped at 0.5 (glTF MASK: three.js alpha-tests instead of sorting). The eyeball's
        # outer shell (the cornea) is clear in the texture's alpha; opaque, it painted the eyes black.
        rnd = nt.nodes.new('ShaderNodeMath')
        rnd.operation = 'ROUND'
        nt.links.new(tex.outputs['Alpha'], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], bsdf.inputs['Alpha'])
        m.blend_method = 'CLIP'
    obj.data.materials.clear()
    obj.data.materials.append(m)


for o, name, kind in parts:
    plain_material(o, name, kind)


def hair_underlayer(hair, name, inset=0.0015):
    """A copy of the hair, opaque, a little inside the cards. Alpha-clipped, MakeHuman's hair cards
    are sparse where they lie flat on the head, and the bare scalp showed through as a bald cap in the
    booth. Under them, this solid layer in the hair's middle shade reads as hair (its darkest showed as a black stripe down a centre parting); the cards on
    top keep the soft edges."""
    under = hair.copy()
    under.data = hair.data.copy()
    under.name = hair.name + '.under'
    bpy.context.scene.collection.objects.link(under)
    me = under.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    shapes = list(bm.verts.layers.shape.values())
    for v in bm.verts:
        d = -v.normal * inset
        v.co += d
        for sl in shapes:
            v[sl] += d
    bm.to_mesh(me)
    bm.free()
    img = hair.data.materials[0].node_tree.nodes['Image Texture'].image
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    a = px[:, 3] > 0.5
    col = np.percentile(px[a, :3], 50, axis=0) if a.any() else np.array([0.02, 0.014, 0.01])
    m = bpy.data.materials.new(name + '.under')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*col.tolist(), 1.0)
    bsdf.inputs['Roughness'].default_value = 0.6
    me.materials.clear()
    me.materials.append(m)
    return under


hair_obj, hair_name = next((o, n) for o, n, k in parts if k == 'CARD' and n == SPEC['hair'])
parts.append((hair_underlayer(hair_obj, hair_name), hair_name + '.under', 'HAIR_UNDER'))

# ── 7. skin binding, influences, VRM ────────────────────────────────────────
meshes = [o for o, _, _ in parts]
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = rig
    o.matrix_world = mw
    if not any(m.type == 'ARMATURE' for m in o.modifiers):
        o.modifiers.new('Armature', 'ARMATURE').object = rig
    limit_and_normalise(o, MAPS['budget']['influences'])
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
log('triangles', tris, 'materials', len(bpy.data.materials))

if RENDER:
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 64
    sc.render.resolution_x, sc.render.resolution_y = 900, 1100
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.exposure = -0.6
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.012, 0.012, 0.016, 1)
    sc.world = w
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
    cam.location = (0.35, -1.6, 1.55); cd.lens = 70
    cam.rotation_euler = (Vector((0, 0, 1.5)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    for nm, loc, e, col in (('key', (1.2, -2.2, 2.4), 260, (1, 0.94, 0.88)), ('fill', (-2, -1.5, 1.4), 70, (0.8, 0.88, 1)),
                            ('rimM', (-1.6, 1.8, 2.0), 300, (1, 0.3, 0.7)), ('rimT', (1.6, 1.8, 2.0), 300, (0.2, 0.85, 0.8))):
        ld = bpy.data.lights.new(nm, 'AREA'); ld.energy = e; ld.size = 1.2; ld.color = col
        lo = bpy.data.objects.new(nm, ld); lo.location = loc; sc.collection.objects.link(lo)
        lo.rotation_euler = (Vector((0, 0, 1.45)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = RENDER
    bpy.ops.render.render(write_still=True)
    log('rendered', RENDER)

rig.name = 'Armature'
maps = dict(MAPS, humanoid=HUMANOID)
bound = setup_vrm(rig, maps, meshes)
ext = rig.data.vrm_addon_extension.vrm1
meta = ext.meta
# Built from CC0 assets (MakeHuman's), so no third-party licence binds the model; it is Shape's
# character, so the VRM meta allows no redistribution or modification by others.
meta.other_license_url = 'https://creativecommons.org/publicdomain/zero/1.0/'
meta.authors.clear()
meta.authors.add().value = 'Shape (MakeHuman CC0 assets)'
# look-at from the midpoint of the eye bones, in world space (as mh_to_vrm.py)
mw = rig.matrix_world
mid = (mw @ rig.data.bones['eye_l'].head_local + mw @ rig.data.bones['eye_r'].head_local) / 2
off = mid - mw @ rig.data.bones['head'].head_local
ext.look_at.offset_from_head_bone = (off.x, off.y, off.z)
log('expressions bound', json.dumps(bound))
select_only(rig)
res = bpy.ops.export_scene.vrm(filepath=OUT)
log('export', res, os.path.getsize(OUT) if os.path.exists(OUT) else 'missing')
sys.stdout.flush()
# Blender's module build can segfault tearing down after an export (see mh_to_vrm.py)
os._exit(0 if 'FINISHED' in res and os.path.exists(OUT) else 1)
