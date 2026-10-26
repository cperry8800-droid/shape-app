# Bake the club's crowd from MakeHuman people (CC0 assets) into a crowd pack (v3) that
# public/newdesign/booth/crowdPeople.mjs draws.
#
# Each person in people.json is built with MPFB2 (MakeHuman for Blender): body, skin, eyes, brows,
# hair, clothes and the game_engine rig. Then, for each pose (standing, with the arms hanging and
# the head up at the stage; seated, for the booths), the rig is posed, every mesh is evaluated with
# its modifiers (the body's masks drop the skin under the clothes), and the result is simplified by
# Blender's edge-collapse decimator into the levels of detail the club draws:
#   near  the front of the floor     far   the back of the floor
#   tiny  the back of the room past ≈15 m      seat  the seated pose, at the tiny budget
# A level's triangles go to each part by its surface area (the skin counts 1.5×, for the face), so a
# pair of 22 k-triangle boots doesn't eat the budget.
#
# Textures: each person's diffuse maps (skin, eyes, hair, every garment) are scaled into one square
# tile of a shared atlas (people.json's `bake` colours multiplied in), and the UVs are remapped into
# it. Hair and brows keep their alpha (the crowd shader alpha-tests them, and draws their backs: the
# bake doubles their triangles with the normal flipped); everything else is opaque. Past the near
# level hair is solid, coloured with the hair's own mean colour (alpha-tested cards decimate into
# holes).
#
# Every vertex carries a part (crowdPeople.mjs PART) and two arm weights (the summed skin weights
# of each arm's bones), so the crowd shader can recolour garments per person and raise the arms on
# the drop, as the old crowd did.
#
# Run (see README.md for the one-time set-up):
#   <venv>/bin/python bake_people.py -- --people people.json --out ../pub/crowd-people [--tile 1024]
#     [--only 0,2] [--budget near=5600,far=1400,tiny=460,seat=600]
# Writes <out>.bin.txt (base64 of the packed binary) and <out>.webp (the atlas).
import os, sys, json, math, importlib, argparse, struct, base64
import bpy, bmesh, mathutils
from mathutils.bvhtree import BVHTree
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--people', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--tile', type=int, default=1024)
ap.add_argument('--only', default='')
ap.add_argument('--budget', default='near=5600,far=1400,tiny=460,seat=600')
ap.add_argument('--quality', type=int, default=82)
A = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])
HERE = os.path.dirname(os.path.abspath(A.people))
CFG = json.load(open(A.people))
BUDGET = {k: int(v) for k, v in (kv.split('=') for kv in A.budget.split(','))}
LODS = [l for l in ('near', 'far', 'tiny', 'seat') if l in BUDGET]

# ⚠ Kept in step with crowdPeople.mjs PART.
PART = {'TOP': 0, 'SKIN': 1, 'HAIR': 2, 'EYE': 3, 'BOTTOM': 5, 'SHOES': 6, 'ACC': 7, 'HAIRSOLID': 8}
# where every seated figure's thighs sit, above its feet as baked (see the seat level below)
SEAT_Y = 0.75
# the head's share of the skin's triangles, per level of detail
HEAD_SHARE = {'near': 0.42, 'far': 0.3, 'tiny': 0.22, 'seat': 0.22}
ARM_BONES = ('upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')

pkg = 'bl_ext.user_default.mpfb'
if pkg not in bpy.context.preferences.addons:
    import addon_utils
    addon_utils.enable(pkg, default_set=True)
HS = importlib.import_module(pkg + '.services.humanservice').HumanService
TS = importlib.import_module(pkg + '.services.targetservice').TargetService
LS = importlib.import_module(pkg + '.services.locationservice').LocationService
DATA = LS.get_user_data()


def find_mhclo(kind, name):
    d = os.path.join(DATA, kind, name)
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith('.mhclo'):
                return os.path.join(d, f)
    raise FileNotFoundError(f'{kind}/{name}: not in the MPFB asset library (README.md lists the packs)')


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for x in list(coll):
            if x.users == 0:
                coll.remove(x)


# ── build one person ───────────────────────────────────────────────────────────────
def build(spec):
    macro = TS.get_default_macro_info_dict()
    for k, v in spec['macro'].items():
        if k == 'race':
            macro['race'].update(v)
        else:
            macro[k] = v
    body = HS.create_human(macro_detail_dict=macro)
    rig = HS.add_builtin_rig(body, 'game_engine')
    HS.set_character_skin(os.path.join(DATA, 'skins', spec['skin'], spec['skin'] + '.mhmat'), body, skin_type='GAMEENGINE')
    items = [{'obj': body, 'name': 'body', 'part': 'SKIN', 'tint': False}]
    add = lambda kind, name, atype: HS.add_mhclo_asset(find_mhclo(kind, name), body, asset_type=atype, subdiv_levels=0, material_type='MAKESKIN')
    items.append({'obj': add('eyes', spec.get('eyes', 'low-poly'), 'Eyes'), 'name': 'eyes', 'part': 'EYE', 'tint': False})
    items.append({'obj': add('eyebrows', spec['eyebrows'], 'Eyebrows'), 'name': spec['eyebrows'], 'part': 'HAIR', 'tint': False, 'brows': True})
    items.append({'obj': add('hair', spec['hair'], 'Hair'), 'name': spec['hair'], 'part': 'HAIR', 'tint': False})
    for c in spec['clothes']:
        meta = CFG['clothes'][c]
        items.append({'obj': add('clothes', c, 'Clothes'), 'name': c, 'part': meta['part'], 'tint': meta['tint']})
    return body, rig, items


# ── poses ──────────────────────────────────────────────────────────────────────────
def aim(b, t):
    """Rotate pose bone b about its head so it points along t (armature space)."""
    head = b.head.copy()
    q = (b.tail - b.head).normalized().rotation_difference(mathutils.Vector(t).normalized())
    b.matrix = mathutils.Matrix.Translation(head) @ q.to_matrix().to_4x4() @ mathutils.Matrix.Translation(-head) @ b.matrix
    bpy.context.view_layer.update()


def turn(b, deg, axis):
    head = b.head.copy()
    R = mathutils.Matrix.Rotation(math.radians(deg), 4, mathutils.Vector(axis))
    b.matrix = mathutils.Matrix.Translation(head) @ R @ mathutils.Matrix.Translation(-head) @ b.matrix
    bpy.context.view_layer.update()


def pose(rig, kind, k):
    """Blender space: the person faces −Y, their left is +X. k ∈ [0,1) varies the stance a little."""
    pb = rig.pose.bones
    for b in pb:
        b.matrix_basis = mathutils.Matrix.Identity(4)
    bpy.context.view_layer.update()
    side = {'l': 1, 'r': -1}
    if kind == 'stand':
        for s in 'lr':
            aim(pb['upperarm_' + s], (side[s] * (0.17 + 0.06 * k), 0.02, -1))
            aim(pb['lowerarm_' + s], (side[s] * 0.1, -0.2 - 0.1 * k, -1))
        # looking up at the stage
        turn(pb['neck_01'], -4, (1, 0, 0))
        turn(pb['head'], -6, (1, 0, 0))
    else:
        for s in 'lr':
            aim(pb['thigh_' + s], (side[s] * 0.1, -1, -0.04))
            aim(pb['calf_' + s], (side[s] * 0.02, 0.06, -1))
            aim(pb['upperarm_' + s], (side[s] * 0.14, -0.35, -1))
            aim(pb['lowerarm_' + s], (side[s] * 0.05, -1, -0.3))


# ── geometry ───────────────────────────────────────────────────────────────────────
def evaluated_mesh(obj):
    """obj with its modifiers (armature, masks) applied, as posed now; a new mesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)


def split_uv_seams(me):
    """Cut the mesh along its UV seams. The edge-collapse decimator keeps a boundary in place but
    happily collapses across a seam, and a triangle whose corners land on two UV islands draws a
    smear of whatever lies between them in the atlas."""
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    if uv is not None:
        seams = []
        for e in bm.edges:
            if len(e.link_loops) != 2:
                continue
            a, b = e.link_loops
            # the two faces walk the edge in opposite directions: a's start is b's end
            if (a[uv].uv - b.link_loop_next[uv].uv).length > 1e-5 or (a.link_loop_next[uv].uv - b[uv].uv).length > 1e-5:
                seams.append(e)
        if seams:
            bmesh.ops.split_edges(bm, edges=seams)
    bm.to_mesh(me)
    bm.free()
    return me


def decimated(me, ratio):
    """A decimated copy of me, its UV seams cut first."""
    src = split_uv_seams(me.copy())
    if ratio >= 0.999:
        return src
    tmp = bpy.data.objects.new('bakeTmp', src)
    bpy.context.scene.collection.objects.link(tmp)
    dec = tmp.modifiers.new('bakeDecimate', 'DECIMATE')
    dec.ratio = max(0.002, ratio)
    dec.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    bpy.data.objects.remove(tmp)
    bpy.data.meshes.remove(src)
    return out


def cover_skin(body, garments, reach=0.04, poke=0.012, under=0.004):
    """The skin under the clothes. MakeHuman's masks only remove what is deep under them; once both
    are simplified, the skin nearer the fabric (an armpit, a sleeve's seam) pokes through in patches.
    Each skin vertex is tested against the nearest garment surface: inside it within `reach`, or
    outside it by less than `poke` (pushed through), it is covered. A face whose corners are all
    covered is deleted (an open neckline or a sleeve's end keeps its skin); a covered corner that is
    kept is pushed to `under` beneath the fabric."""
    verts, polys = [], []
    for g in garments:
        base = len(verts)
        verts += [v.co.copy() for v in g.vertices]
        polys += [[base + i for i in p.vertices] for p in g.polygons]
    if not polys:
        return
    tree = BVHTree.FromPolygons(verts, polys)
    bm = bmesh.new()
    bm.from_mesh(body)
    move = {}   # BMVert -> the push that puts it under the fabric (None: already deep enough)
    for v in bm.verts:
        loc, gn, _, dist = tree.find_nearest(v.co, reach)
        if loc is None:
            continue
        off = v.co - loc
        side = off.dot(gn)   # < 0: under the fabric
        # only where the fabric lies over the vertex, not off its edge (a neckline, a hem): there the
        # nearest point is the edge itself, and a push would pull the skin into a gap
        if dist > 1e-5 and abs(side) < 0.7 * dist:
            continue
        if (side < 0 and dist < reach) or (side >= 0 and dist < poke):
            move[v] = (loc - gn * under) - v.co if side > -under else None
    drop = [f for f in bm.faces if all(v in move for v in f.verts)]
    for v, d in move.items():
        if d is not None:
            v.co += d
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(body)
    bm.free()


def split_by_group(me, obj, group):
    """Two copies of me: the faces mostly in `group` (weight ≥ 0.5 on average) and the rest. The head
    is simplified on its own budget so the face keeps its shape (Blender's vertex-group weighting of
    the decimator stalls it instead). The cut is a boundary in both halves, which the decimator holds
    in place, so they still meet."""
    gi = obj.vertex_groups[group].index
    halves = []
    for inside in (True, False):
        m = me.copy()
        bm = bmesh.new()
        bm.from_mesh(m)
        dl = bm.verts.layers.deform.active
        drop = [f for f in bm.faces if ((sum(v[dl].get(gi, 0.0) for v in f.verts) / len(f.verts)) >= 0.5) != inside]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(m)
        bm.free()
        halves.append(m)
    return halves


def area(me):
    return sum(p.area for p in me.polygons)


def tris(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def to_three(v):
    return (v[0], v[2], -v[1])


def extract(me, obj, item, part, tile, two_sided=False):
    """Triangles of `me` (an evaluated mesh of obj) as packed arrays, UVs remapped into the atlas tile."""
    me.calc_loop_triangles()
    names = {g.index: g.name for g in obj.vertex_groups}
    armSide = {}
    for gi, n in names.items():
        base, _, s = n.rpartition('_')
        if s in ('l', 'r') and base.split('_')[0] in ARM_BONES:
            armSide[gi] = s
    uvl = me.uv_layers.active.data if me.uv_layers.active else None
    tx, ty, tw, th, AW, AH = tile
    verts, index, key = [], [], {}
    for t in me.loop_triangles:
        tri = []
        for li, vi in zip(t.loops, t.vertices):
            u, v = (uvl[li].uv if uvl else (0.5, 0.5))
            k = (vi, round(u, 5), round(v, 5))
            if k not in key:
                vx = me.vertices[vi]
                wl = wr = 0.0
                for g in vx.groups:
                    s = armSide.get(g.group)
                    if s == 'l':
                        wl += g.weight
                    elif s == 'r':
                        wr += g.weight
                u = min(max(u, 0.0), 1.0); v = min(max(v, 0.0), 1.0)
                # atlas UV, GL convention (v up from the image's bottom row)
                U = (tx + u * tw) / AW
                V = 1.0 - (ty + (1.0 - v) * th) / AH
                key[k] = len(verts)
                verts.append((to_three(vx.co), to_three(vx.normal), min(wl, 1.0), min(wr, 1.0), U, V))
            tri.append(key[k])
        index.append(tri)
    if two_sided:
        n0 = len(verts)
        for p, nrm, wl, wr, U, V in verts[:n0]:
            verts.append((p, (-nrm[0], -nrm[1], -nrm[2]), wl, wr, U, V))
        index += [[a + n0, c + n0, b + n0] for a, b, c in index]
    return verts, index, part


def merge(chunks):
    pos, nrm, prt, arm, uv, idx = [], [], [], [], [], []
    for verts, index, part in chunks:
        base = len(pos)
        for p, n, wl, wr, U, V in verts:
            pos.append(p); nrm.append(n); prt.append(part); arm.append((wl, wr)); uv.append((U, V))
        idx += [base + i for t in index for i in t]
    assert len(pos) < 65536, f'{len(pos)} vertices: over uint16'
    return {'pos': np.array(pos, np.float64), 'nrm': np.array(nrm, np.float64), 'part': np.array(prt, np.uint8),
            'arm': np.array(arm, np.float64), 'uv': np.array(uv, np.float64), 'index': np.array(idx, np.uint32)}


# ── atlas ──────────────────────────────────────────────────────────────────────────
def diffuse_image(obj):
    for m in obj.data.materials:
        if not (m and m.use_nodes):
            continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.name.lower() == 'diffusetexture' and n.image:
                return bpy.path.abspath(n.image.filepath_from_user())
    return None


def srgb_to_linear(c):
    c = np.asarray(c, np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def tile_sizes(items, T):
    """Square power-of-two tiles inside a T×T person tile: the skin gets half the width, the
    garments by their area, the small parts what they need. Halves the biggest until they fit."""
    want = []
    for it in items:
        if it['part'] == 'SKIN':
            s = T // 2
        elif it['part'] == 'EYE' or it.get('brows'):
            s = T // 16
        elif it['part'] == 'ACC':
            s = T // 32
        elif it['part'] == 'SHOES':
            s = T // 8
        elif it['part'] == 'HAIR':
            s = T // 4
        else:
            s = T // 2 if it['area'] > 0.9 else T // 4
        want.append(s)
    while sum(s * s for s in want) > T * T:
        i = max(range(len(want)), key=lambda j: (want[j], items[j]['part'] != 'SKIN'))
        want[i] //= 2
    # then spend what is left: garments first (the biggest surfaces after the skin), then the hair
    grow = sorted((j for j in range(len(items)) if items[j]['part'] in ('TOP', 'BOTTOM', 'HAIR') and not items[j].get('brows')),
                  key=lambda j: (items[j]['part'] == 'HAIR', -items[j]['area']))
    for j in grow:
        while want[j] < T // 2 and sum(s * s for s in want) + 3 * want[j] ** 2 <= T * T:
            want[j] *= 2
    return want


def pack_quads(sizes, T):
    """Buddy-allocate squares (powers of two) in a T×T square; returns [(x, y)] top-left, in order."""
    free = [(0, 0, T)]
    out = [None] * len(sizes)
    for i in sorted(range(len(sizes)), key=lambda j: -sizes[j]):
        s = sizes[i]
        free.sort(key=lambda f: (f[2], f[1], f[0]))
        j = next(j for j, f in enumerate(free) if f[2] >= s)
        x, y, fs = free.pop(j)
        while fs > s:
            fs //= 2
            free += [(x + fs, y, fs), (x, y + fs, fs), (x + fs, y + fs, fs)]
        out[i] = (x, y)
    return out


def mean_colour(img, me, alpha_weighted):
    """Mean linear colour of the texture where the mesh's UVs land (not the whole sheet, whose
    background is often black)."""
    a = np.asarray(img, np.float64) / 255.0
    h, w = a.shape[:2]
    uvl = me.uv_layers.active.data
    uv = np.array([d.uv[:] for d in uvl])
    if not len(uv):
        return [0.5, 0.5, 0.5]
    px = np.clip((uv[:, 0] * (w - 1)).astype(int), 0, w - 1)
    py = np.clip(((1 - uv[:, 1]) * (h - 1)).astype(int), 0, h - 1)
    s = a[py, px]
    wts = s[:, 3] if alpha_weighted else np.ones(len(s))
    rgb = (srgb_to_linear(s[:, :3]) * wts[:, None]).sum(0) / max(wts.sum(), 1e-6)
    return [round(float(x), 5) for x in rgb]


# ── main ───────────────────────────────────────────────────────────────────────────
people = CFG['people']
only = [int(x) for x in A.only.split(',')] if A.only else list(range(len(people)))
T = A.tile
cols = 4 if len(only) > 8 else 2 if len(only) > 1 else 1   # 12 people: 4 × 3 tiles, inside 4096
rows = (len(only) + cols - 1) // cols
AW, AH = cols * T, rows * T
atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 255))
bodies, geos = [], []

for bi, pi in enumerate(only):
    spec = people[pi]
    clear_scene()
    body, rig, items = build(spec)
    k = (pi * 0.37) % 1.0
    ox, oy = (bi % cols) * T, (bi // cols) * T

    # textures into this person's tile
    pose(rig, 'stand', k)
    full = {}
    for it in items:
        me = evaluated_mesh(it['obj'])
        full[it['name']] = me
        it['area'] = area(me)
    sizes = tile_sizes(items, T)
    spots = pack_quads(sizes, T)
    means = {}
    for it, s, (x, y) in zip(items, sizes, spots):
        path = diffuse_image(it['obj'])
        img = Image.open(path).convert('RGBA') if path else Image.new('RGBA', (8, 8), (128, 128, 128, 255))
        bake = spec.get('bake', {}).get(it['name'])
        if bake:
            arr = np.asarray(img, np.float64)
            arr[..., :3] *= np.array(bake)[None, None, :]
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        hairy = it['part'] == 'HAIR'
        # The eyes keep their alpha too: the eyeball's outer shell (the cornea) is clear in it, and the
        # shader drops it (opaque, it paints the eyes black). Everything else is opaque.
        if it['part'] not in ('HAIR', 'EYE'):
            img.putalpha(255)
        elif hairy:
            # the clear texels take the hair's own colour, so filtering never mixes a pale fringe in
            arr = np.asarray(img, np.float64)
            a = arr[..., 3:4] / 255.0
            fill = (arr[..., :3] * a).sum((0, 1)) / max(a.sum(), 1e-6)
            arr[..., :3] = arr[..., :3] * a + fill[None, None, :] * (1 - a)
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        if it['part'] in ('TOP', 'BOTTOM', 'SHOES', 'HAIR') and not it.get('brows'):
            means[it['part']] = mean_colour(img, full[it['name']], hairy)
        atlas.paste(img.resize((s, s), Image.LANCZOS), (ox + x, oy + y))
        it['tile'] = (ox + x, oy + y, s, s, AW, AH)

    # pivots: the shoulders (the upper arms' heads), three space
    bpy.context.view_layer.update()
    pb = rig.pose.bones
    rm = rig.matrix_world
    pivot = {S: [round(c, 5) for c in to_three(rm @ pb['upperarm_' + s].head)] for S, s in (('L', 'l'), ('R', 'r'))}

    for lod in LODS:
        if lod == 'seat':
            pose(rig, 'seat', k)
        meshes = {it['name']: evaluated_mesh(it['obj']) for it in items}
        cover_skin(meshes['body'], [meshes[it['name']] for it in items if it['part'] in ('TOP', 'BOTTOM', 'SHOES')])
        keep = [it for it in items if not (it.get('brows') and lod != 'near')]
        # The hair and the brows first: the hair's cards need a few hundred triangles to read as hair
        # at all (both sides drawn, so each counts twice), the brows all of theirs (≈150); then the
        # rest of the level's budget by surface area, the skin counting 1.5× (the face).
        fixed = {}
        for it in keep:
            n0 = tris(meshes[it['name']])
            if it.get('brows'):
                fixed[it['name']] = n0
            elif it['part'] == 'HAIR':
                fixed[it['name']] = min(n0, max(22, round(BUDGET[lod] * {'near': 0.093, 'far': 0.043, 'tiny': 0.048, 'seat': 0.037}[lod])))
            elif it['part'] == 'EYE':
                fixed[it['name']] = n0 if lod in ('near', 'far') else 12   # decimated, an eye collapses into a slit
        rest_budget = max(BUDGET[lod] - sum(v * (2 if (lod == 'near' and k != 'eyes') else 1) for k, v in fixed.items()), BUDGET[lod] // 3)
        wt = {it['name']: area(meshes[it['name']]) * (1.5 if it['part'] == 'SKIN' else 1.0) for it in keep if it['name'] not in fixed}
        tot = sum(wt.values())
        chunks = []
        for it in keep:
            n0 = tris(meshes[it['name']])
            want = fixed[it['name']] if it['name'] in fixed else max(12, rest_budget * wt[it['name']] / tot)
            if it['part'] == 'SKIN' and 'head' in it['obj'].vertex_groups:
                # the face: a fixed share of the skin's budget, simplified on its own
                head, rest = split_by_group(meshes[it['name']], it['obj'], 'head')
                share = HEAD_SHARE[lod]
                pieces = [decimated(head, min(1.0, want * share / max(tris(head), 1))), decimated(rest, min(1.0, want * (1 - share) / max(tris(rest), 1)))]
                bpy.data.meshes.remove(head); bpy.data.meshes.remove(rest)
            else:
                pieces = [decimated(meshes[it['name']], min(1.0, want / max(n0, 1)))]
            if os.environ.get('BAKE_DEBUG'):
                print(f'  {lod} {it["name"]}: {n0} -> want {int(want)} -> {sum(tris(m) for m in pieces)}', flush=True)
            part = it['part']
            if part == 'HAIR' and lod != 'near':
                part = 'HAIRSOLID'
            for me in pieces:
                chunks.append(extract(me, it['obj'], it, PART[part], it['tile'], two_sided=(part == 'HAIR')))
                bpy.data.meshes.remove(me)
        for me in meshes.values():
            bpy.data.meshes.remove(me)
        g = merge(chunks)
        g['name'] = f'{bi}:{lod}'
        geos.append(g)
        if lod == 'near':
            height = float(g['pos'][:, 1].max())
        if lod == 'seat':
            # Where the thighs meet the seat: the underside of the thighs, now level. Searched only
            # between the hip joint and 20 cm below it, in front of the hips: lower down, the same
            # band holds the shins, which hang back under the knees.
            hip = to_three(rig.matrix_world @ rig.pose.bones['thigh_l'].head)[1]
            p = g['pos']
            band = (p[:, 2] > 0.12) & (p[:, 2] < 0.35) & (np.abs(p[:, 0]) < 0.2) & (p[:, 1] > hip - 0.2) & (p[:, 1] < hip)
            seatY = float(p[band, 1].min()) if band.any() else hip - 0.1
            # Everyone sits on the same seat (the venue lowers every seated figure by one seatY), so
            # each seated figure is moved to put its thighs at SEAT_Y: a short person's feet dangle a
            # little, a tall one's reach the floor. Measured, the thighs were 0.58 to 0.88 m up.
            p[:, 1] += SEAT_Y - seatY
            seatY = SEAT_Y
        print(f'BAKED {spec["name"]} {lod}: {len(g["pos"])} verts, {len(g["index"]) // 3} tris', flush=True)
    for me in full.values():
        bpy.data.meshes.remove(me)

    bodies.append({
        'name': spec['name'], 'sex': spec['sex'], 'weight': spec.get('weight', 1), 'height': round(height, 4), 'pivot': pivot,
        'seatY': round(seatY, 4) if 'seat' in LODS else None,
        'tile': [ox, oy, T, T],
        'mean': {str(PART[p]): c for p, c in means.items()},
        'tint': {str(PART[it['part']]): bool(it['tint']) for it in items if it['part'] in ('TOP', 'BOTTOM', 'SHOES')},
    })

# ── write ──────────────────────────────────────────────────────────────────────────
out = os.path.abspath(A.out)
atlas_file = os.path.basename(out) + '.webp'
atlas.save(out + '.webp', 'WEBP', quality=A.quality, method=6)
header = {
    'v': 3, 'lods': LODS, 'parts': PART, 'bodies': bodies,
    'height': round(sum(b['height'] for b in bodies) / len(bodies), 4),
    'seat': {'name': 'seat', 'seatY': round(sum(b['seatY'] for b in bodies) / len(bodies), 4), 'headShift': 0} if 'seat' in LODS else None,
    'atlas': {'file': atlas_file, 'w': AW, 'h': AH},
    'geos': [{'name': g['name'], 'nv': int(len(g['pos'])), 'ni': int(len(g['index']))} for g in geos],
}
hb = json.dumps(header, separators=(',', ':')).encode()
buf = bytearray(struct.pack('<I', len(hb)) + hb)
pad = lambda: buf.extend(b'\0' * ((4 - len(buf) % 4) % 4))
pad()
for g in geos:
    buf += np.round(g['pos'] * 1000).astype('<i2').tobytes(); pad()
    n = g['nrm'] / np.maximum(np.linalg.norm(g['nrm'], axis=1, keepdims=True), 1e-9)
    buf += np.round(n * 127).astype('i1').tobytes(); pad()
    buf += g['part'].astype('u1').tobytes(); pad()
    buf += np.round(np.clip(g['arm'], 0, 1) * 255).astype('u1').tobytes(); pad()
    buf += np.round(np.clip(g['uv'], 0, 1) * 65535).astype('<u2').tobytes(); pad()
    buf += g['index'].astype('<u2').tobytes(); pad()
with open(out + '.bin.txt', 'w') as f:
    f.write(base64.b64encode(bytes(buf)).decode())
print('WROTE', out + '.bin.txt', len(buf), 'bytes;', out + '.webp', os.path.getsize(out + '.webp'), 'bytes;', AW, 'x', AH)
