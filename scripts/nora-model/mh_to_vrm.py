# mh_to_vrm.py — a MetaHuman GLB (from the metahuman-to-glb pipeline, Draco already decoded by
# prepare.mjs) into the VRM 1.0 the booth loads. Run by Blender:
#
#   blender -b -P scripts/nora-model/mh_to_vrm.py -- <in.glb> <out.vrm> <vrm-addon-src-dir>
#       [--materials mh_materials.json] [--tris N] [--tex PX] [--outfit #rrggbb] [--hair #rrggbb]
#
# or with the `bpy` Python module (`python mh_to_vrm.py -- …`). The rules (bone map, kept bones,
# dropped materials, expressions) are in maps.json beside this file, which the Node tests also read.
#
# What it does, in order, and why (measured on a pipeline export: 168k triangles, 875 bones across
# three skeletons, 13 materials, 41.5 MB):
#   1. Removes the pipeline's leftovers (unmaterialled helper spheres).
#   2. Makes ONE skeleton: the body's (it alone has every limb), plus the two eye bones from the
#      face skeleton so her eyes turn as bones. The face and outfit meshes are re-bound to it.
#   3. Folds every bone that is not kept into its nearest kept ancestor (skin weights summed), then
#      deletes it: the 800-odd face-rig bones go (the face moves through its ARKit shapes), and so do
#      the twist / corrective / finger-pad helpers. Then at most 4 influences a vertex, normalised.
#   4. Binds the hair and eyebrow cards to the head. The pipeline leaves them parented to the
#      skeleton OBJECT, so they would not follow her head at all.
#   5. Deletes face geometry that does not ship (maps.json dropMaterials).
#   5b. Bakes the hair, eyebrow and eyelash cards' transparency. ⚠ The pipeline's GLB carries those
#      cards' colour textures with NO alpha (measured: RGB PNGs); their coverage is in separate
#      textures that its stage 04 writes beside mh_materials.json. Without them the eyebrows render
#      as solid black blocks. Each card material gets one RGBA texture: its hair colour, and the
#      coverage as alpha, cut at 0.5 (glTF MASK, so three.js alpha-tests instead of sorting).
#   5c. Tints the outfit (--outfit). The pipeline loses the clothing colour (its issue #12): a
#      sample's shirt came out white and glowed under the stage lights.
#   6. Optionally cuts triangles (--tris) keeping the shape keys (see decimate_keep_shapes).
#   7. Shrinks textures larger than --tex.
#   8. Maps the skeleton to the VRM humanoid, the ARKit shapes to VRM expressions, sets the eyes as
#      the look-at, writes the meta, and exports VRM 1.0 (the add-on bakes the T-pose on export).
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mh_rules import (  # noqa: E402  (the pure rules, tested without Blender)
    hex_rgb, srgb_to_linear, nearest_kept, part_budgets, card_cutoff, card_alpha, importance, vrm_attr,
    barycentric as _barycentric,
)


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {'inp': a[0], 'out': a[1], 'addon': a[2], 'tris': 0, 'tex': 1024, 'materials': None, 'outfit': None, 'hair': None}
    i = 3
    while i < len(a):
        k = a[i]
        if k == '--tris':
            out['tris'] = int(a[i + 1])
        elif k == '--tex':
            out['tex'] = int(a[i + 1])
        elif k == '--materials':
            out['materials'] = a[i + 1]
        elif k == '--outfit':
            out['outfit'] = hex_rgb(a[i + 1])   # ValueError on a malformed colour
        elif k == '--hair':
            out['hair'] = hex_rgb(a[i + 1])
        else:
            raise SystemExit('unknown argument ' + k)
        i += 2
    return out


def log(*x):
    print('[mh_to_vrm]', *x, flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def scene_tris():
    return sum(tri_count(o) for o in bpy.data.objects if o.type == 'MESH')


# ── 1. import and tidy ──────────────────────────────────────────────────────
def enable_addons(vrm_src):
    """glTF ships with Blender; the VRM add-on is installed from its source tree (a factory reset
    unregisters anything loaded by hand, and the add-on needs its preferences registered)."""
    import addon_utils
    import shutil
    addon_utils.enable('io_scene_gltf2', default_set=True)
    dest_root = bpy.utils.user_resource('SCRIPTS', path='addons', create=True)
    dest = os.path.join(dest_root, 'io_scene_vrm')
    if not os.path.isdir(dest):
        shutil.copytree(os.path.join(vrm_src, 'io_scene_vrm'), dest)
    addon_utils.modules(refresh=True)   # a freshly copied add-on is not seen without this
    if not addon_utils.enable('io_scene_vrm', default_set=True) or not hasattr(bpy.types.Armature, 'vrm_addon_extension'):
        raise SystemExit('the VRM add-on did not register')


def import_glb(path, vrm_src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    enable_addons(vrm_src)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and not o.data.materials and not o.vertex_groups:
            log('drop helper', o.name)
            bpy.data.objects.remove(o, do_unlink=True)


def armatures():
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    # ⚠ BY THE MESH IT DRIVES, NOT BY ITS BONES: the outfit's skeleton is a full copy of the body's
    # (the same 342 bones), so "has a hand" picked the outfit on the sample and the outfit tint then
    # landed on her skin.
    def drives(a, pat):
        return any(pat in m.name for m in meshes_of(a)) or pat in a.name
    limbs = [a for a in arms if 'lowerarm_l' in a.data.bones and 'hand_l' in a.data.bones]
    body = next((a for a in limbs if drives(a, 'BodyMesh')), None) or next((a for a in limbs if not drives(a, 'Outfit')), None) or (limbs[0] if limbs else None)
    face = next((a for a in arms if 'FACIAL_L_Eye' in a.data.bones), None)
    if not body:
        raise SystemExit('no body skeleton (an armature with lowerarm_l and hand_l)')
    return body, face, [a for a in arms if a not in (body, face)]


def meshes_of(arm):
    return [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)]


def select_only(obj):
    for o in bpy.context.scene.objects:
        if o is not None:
            o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ── 2. one skeleton ─────────────────────────────────────────────────────────
def adopt_eye_bones(body, face, names):
    """Copy the named bones from the face skeleton into the body skeleton, under `head`."""
    if not face:
        return []
    src = {n: (face.matrix_world @ face.data.bones[n].head_local, face.matrix_world @ face.data.bones[n].tail_local, face.data.bones[n].matrix_local.copy())
           for n in names if n in face.data.bones}
    select_only(body)
    bpy.ops.object.mode_set(mode='EDIT')
    inv = body.matrix_world.inverted()
    eb = body.data.edit_bones
    made = []
    for n, (h, t, ml) in src.items():
        if n in eb:
            continue
        b = eb.new(n)
        b.head = inv @ h
        b.tail = inv @ t
        # keep the bone's roll from the face skeleton (the eye's local axes)
        b.matrix = inv @ face.matrix_world @ ml
        b.parent = eb['head']
        b.use_deform = True
        made.append(n)
    bpy.ops.object.mode_set(mode='OBJECT')
    return made


def rebind(mesh, arm):
    for m in mesh.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
    mw = mesh.matrix_world.copy()
    mesh.parent = arm
    mesh.matrix_world = mw


# ── 3. fold bones ───────────────────────────────────────────────────────────
def keep_set(maps):
    return set(maps['humanoid'].values()) | set(maps['keepExtra'])


def fold_weights(mesh, parents, keep, fallback='head'):
    """Every vertex group whose bone is not kept is added into its nearest kept ancestor's group."""
    vg = mesh.vertex_groups
    target_of = {}
    for g in list(vg):
        if g.name in keep:
            continue
        t = nearest_kept(g.name, parents, keep) or fallback
        target_of[g.index] = t
    if not target_of:
        return 0
    targets = {t: (vg.get(t) or vg.new(name=t)) for t in set(target_of.values())}
    me = mesh.data
    moved = 0
    for v in me.vertices:
        add = {}
        for ge in v.groups:
            t = target_of.get(ge.group)
            if t is not None and ge.weight > 0:
                add[t] = add.get(t, 0.0) + ge.weight
        for t, w in add.items():
            targets[t].add([v.index], w, 'ADD')
            moved += 1
    # remove by name (indices shift as groups go)
    for g in list(vg):
        if g.name not in keep:
            vg.remove(g)
    return moved


def limit_and_normalise(mesh, limit):
    select_only(mesh)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=limit)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)


def delete_bones(arm, keep):
    select_only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    gone = 0
    for b in list(eb):
        if b.name not in keep:
            # children of a removed bone move up to its parent before it goes
            for c in b.children:
                c.parent = b.parent
            eb.remove(b)
            gone += 1
    bpy.ops.object.mode_set(mode='OBJECT')
    return gone


# ── 4. cards to the head ───────────────────────────────────────────────────
def bind_to_bone(mesh, arm, bone):
    mw = mesh.matrix_world.copy()
    mesh.parent = arm
    mesh.matrix_world = mw
    g = mesh.vertex_groups.get(bone) or mesh.vertex_groups.new(name=bone)
    g.add(list(range(len(mesh.data.vertices))), 1.0, 'REPLACE')
    if not any(m.type == 'ARMATURE' for m in mesh.modifiers):
        m = mesh.modifiers.new('Armature', 'ARMATURE')
        m.object = arm


# ── 5. drop materials ───────────────────────────────────────────────────────
def drop_material_faces(mesh, names):
    me = mesh.data
    idx = [i for i, m in enumerate(me.materials) if m and any(m.name == n or m.name.startswith(n + '.') or m.name.startswith(n) for n in names)]
    if not idx:
        return 0
    bm = bmesh.new()
    bm.from_mesh(me)
    faces = [f for f in bm.faces if f.material_index in idx]
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    # drop the now-unused material slots (highest first)
    select_only(mesh)
    for i in sorted(idx, reverse=True):
        mesh.active_material_index = i
        bpy.ops.object.material_slot_remove()
    return len(faces)


# ── 5b. card transparency ───────────────────────────────────────────────────
def coverage_channel(px, declared):
    """The channel that holds coverage: the declared one, or the one that varies most."""
    import numpy as np
    if declared:
        return 'rgba'.index(declared.lower()[0])
    var = [float(np.var(px[c::4])) for c in range(4)]
    return int(max(range(4), key=lambda c: var[c]))


def bake_card(mat, rgb_srgb, alpha_path, channel, size, roughness, cutoff=0.5):
    import numpy as np
    src = bpy.data.images.load(alpha_path)
    src.colorspace_settings.name = 'Non-Color'   # coverage is data, never colour-managed
    w, h = src.size
    if max(w, h) > size:
        src.scale(size, max(1, int(h * size / w)))
        w, h = src.size
    px = np.empty(w * h * 4, np.float32)
    src.pixels.foreach_get(px)
    ch = coverage_channel(px, channel)
    out = bpy.data.images.new(mat.name + '_card', w, h, alpha=True)
    rgba = np.empty(w * h * 4, np.float32)
    rgba[0::4], rgba[1::4], rgba[2::4] = rgb_srgb[0], rgb_srgb[1], rgb_srgb[2]
    # The exporter writes MASK at 0.5 (a ROUND node), so coverage is scaled to put `cutoff` at 0.5.
    rgba[3::4] = np.clip(px[ch::4] * (0.5 / max(1e-3, cutoff)), 0.0, 1.0)   # mh_rules.card_alpha, vectorised
    out.pixels.foreach_set(rgba)
    out.alpha_mode = 'STRAIGHT'
    out.file_format = 'PNG'
    out.pack()
    bpy.data.images.remove(src)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for sock in ('Base Color', 'Alpha'):
        for l in list(bsdf.inputs[sock].links):
            nt.links.remove(l)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = out
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    rnd = nt.nodes.new('ShaderNodeMath')
    rnd.operation = 'ROUND'          # the glTF exporter reads ROUND as alphaMode MASK, cutoff 0.5
    nt.links.new(tex.outputs['Alpha'], rnd.inputs[0])
    nt.links.new(rnd.outputs[0], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = roughness
    mat.use_backface_culling = False
    return 'rgba'[ch]


def apply_card_materials(spec_path, hair_override, size):
    """mh_materials.json (the pipeline's stage 04): which materials are cards, their colour, and
    which texture and channel hold their coverage."""
    if not spec_path:
        return []
    with open(spec_path) as f:
        spec = json.load(f)
    base = os.path.dirname(os.path.abspath(spec_path))
    done = []
    for m in spec.get('materials', []):
        p = m.get('params', {})
        mat = bpy.data.materials.get(m.get('material_name'))
        if not mat or not mat.use_nodes:
            continue
        alpha = (m.get('textures') or {}).get('alpha')
        if not alpha and p.get('alpha_stem'):
            alpha = os.path.join('textures', p['alpha_stem'] + '.png')
        if not alpha:
            continue
        path = os.path.join(base, alpha)
        if not os.path.exists(path):
            raise SystemExit('coverage texture missing: ' + path)
        rgb = (hair_override if (hair_override and m.get('kind') == 'hair') else (p.get('base_color') or [0.05, 0.035, 0.03])[:3])
        ch = bake_card(mat, rgb, path, p.get('alpha_channel'), size, float(p.get('roughness', 0.55)),
                       card_cutoff(m.get('kind'), mat.name))
        done.append((mat.name, ch))
    return done


# ── 5c. outfit tint ─────────────────────────────────────────────────────────
def tint_materials(objs, rgb_srgb):
    """Multiply the base colour of every material on `objs` by a colour (glTF baseColorFactor)."""
    lin = [srgb_to_linear(c) for c in rgb_srgb]
    seen = set()
    for o in objs:
        for mat in o.data.materials:
            if not mat or mat.name in seen or not mat.use_nodes:
                continue
            seen.add(mat.name)
            nt = mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf:
                continue
            links = list(bsdf.inputs['Base Color'].links)
            if not links:
                bsdf.inputs['Base Color'].default_value = (*lin, 1.0)
                continue
            src = links[0].from_socket
            nt.links.remove(links[0])
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(src, mix.inputs[6])            # A (colour)
            mix.inputs[7].default_value = (*lin, 1.0)   # B (colour)
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    return sorted(seen)


# ── 6. fewer triangles, same shapes ─────────────────────────────────────────
def shape_deltas(me):
    """{key name: list of Vector deltas per vertex} for every non-basis shape key."""
    kb = me.shape_keys.key_blocks
    base = [p.co.copy() for p in kb[0].data]
    return {k.name: [k.data[i].co - base[i] for i in range(len(base))] for k in kb[1:]}


def decimate_keep_shapes(mesh, ratio, extra_protect=None):
    """Collapse-decimate a mesh that carries shape keys, and carry every shape key across.

    Blender's Decimate cannot apply to a mesh with shape keys, so: copy the full mesh, strip the
    keys from the working mesh, decimate it, then for every new vertex find the nearest point on the
    full mesh's surface and interpolate each key's displacement there (barycentric over that
    triangle). The vertices a shape moves most (lips, lids) are protected from the collapse first, so
    the mouth and eyes keep their detail and the lips do not fuse.
    """
    me = mesh.data
    if ratio >= 0.999 or len(me.polygons) == 0:
        return
    keyed = bool(me.shape_keys and len(me.shape_keys.key_blocks) > 1)
    deltas = shape_deltas(me) if keyed else {}
    order = [k.name for k in me.shape_keys.key_blocks[1:]] if keyed else []
    # the full mesh as triangles, for the transfer
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    tri_v = [[v.index for v in f.verts] for f in bm.faces]
    bvh = BVHTree.FromBMesh(bm)
    base_co = [v.co.copy() for v in bm.verts]
    # protection: how far any shape moves each vertex, 0..1
    prot = None
    if keyed:
        mx = [0.0] * len(base_co)
        for d in deltas.values():
            for i, dv in enumerate(d):
                l = dv.length
                if l > mx[i]:
                    mx[i] = l
        top = max(mx) or 1.0
        prot = [min(1.0, (m / top) * 4.0) for m in mx]
    if extra_protect is not None:
        prot = [max(a, b) for a, b in zip(prot or [0.0] * len(extra_protect), extra_protect)]
    # strip keys, protect, decimate
    if keyed:
        mesh.shape_key_clear()   # the operator's poll fails in background mode
    vg_name = None
    if prot:
        g = mesh.vertex_groups.new(name='__decimate_protect')
        vg_name = g.name
        for i, w in enumerate(prot):
            g.add([i], 1.0 - w, 'REPLACE')   # the modifier collapses where the group is HIGH
    mod = mesh.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    if vg_name:
        mod.vertex_group = vg_name
        mod.vertex_group_factor = 1.0
    select_only(mesh)
    # the decimate modifier must be applied before any armature modifier evaluates
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if vg_name:
        mesh.vertex_groups.remove(mesh.vertex_groups[vg_name])
    if not keyed:
        bm.free()
        return
    # carry the keys across
    me = mesh.data
    mesh.shape_key_add(name='Basis', from_mix=False)
    new_co = [v.co.copy() for v in me.vertices]
    bary = []
    for co in new_co:
        loc, nrm, fi, dist = bvh.find_nearest(co)
        a, b, c = (base_co[i] for i in tri_v[fi])
        w = _barycentric(tuple(loc), tuple(a), tuple(b), tuple(c))
        bary.append((tri_v[fi], w))
    for name in order:
        d = deltas[name]
        k = mesh.shape_key_add(name=name, from_mix=False)
        for vi, (tv, w) in enumerate(bary):
            k.data[vi].co = new_co[vi] + d[tv[0]] * w[0] + d[tv[1]] * w[1] + d[tv[2]] * w[2]
    bm.free()


HAND_BONES = ('hand_', 'thumb_', 'index_', 'middle_', 'ring_', 'pinky_')


def protect_weights(obj):
    """1 for vertices to keep: anything not on the mesh's first (skin) material (eyes, teeth,
    lashes are small separate pieces a collapse would shred), and the hands."""
    me = obj.data
    prot = [0.0] * len(me.vertices)
    # Only the face (the mesh with shape keys) carries small separate pieces on its other materials;
    # an outfit's second material is a whole garment, and protecting it froze the shorts on the sample.
    if len(me.materials) > 1 and me.shape_keys:
        for p in me.polygons:
            if p.material_index != 0:
                for vi in p.vertices:
                    prot[vi] = 1.0
    hand_groups = {g.index for g in obj.vertex_groups if g.name.startswith(HAND_BONES)}
    if hand_groups:
        for v in me.vertices:
            w = sum(ge.weight for ge in v.groups if ge.group in hand_groups)
            if w > 0.2:
                prot[v.index] = 1.0
    return prot


def decimate_to(target, outfit_names):
    """Cut the scene's triangles to about `target`, spending them where they show."""
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    counts = [tri_count(o) for o in meshes]
    if not target or sum(counts) <= target:
        return
    weights = [importance(o.name, o.name in outfit_names) for o in meshes]
    budgets = part_budgets(counts, weights, target)
    for o, c, b in zip(meshes, counts, budgets):
        if b < c:
            log('decimate', o.name, c, '->', b)
            decimate_keep_shapes(o, b / c, protect_weights(o))


# ── 7. textures ─────────────────────────────────────────────────────────────
def shrink_textures(max_px):
    n = 0
    for img in bpy.data.images:
        w, h = img.size
        if max(w, h) > max_px:
            s = max_px / max(w, h)
            img.scale(max(1, int(w * s)), max(1, int(h * s)))
            n += 1
    return n


# ── 8. VRM ──────────────────────────────────────────────────────────────────
def setup_vrm(arm, maps, mesh_objs):
    ext = arm.data.vrm_addon_extension
    ext.spec_version = '1.0'
    vrm1 = ext.vrm1
    meta = vrm1.meta
    meta.vrm_name = 'Nora'
    meta.authors.clear()
    meta.authors.add().value = 'Shape'
    meta.version = '1'
    # The MetaHuman licence (the Unreal Engine EULA) governs this model, not a VRM licence. The
    # VRM meta records it as "other" and allows no redistribution or modification by third parties.
    meta.license_url = 'https://vrm.dev/licenses/1.0/'
    meta.other_license_url = 'https://www.metahuman.com/license'
    meta.allow_redistribution = False
    meta.modification = 'prohibited'
    meta.commercial_usage = 'corporation'
    hb = vrm1.humanoid.human_bones
    for vrm_name, ue in maps['humanoid'].items():
        attr = vrm_attr(vrm_name)
        prop = getattr(hb, attr, None)
        if prop is None:
            raise SystemExit('the add-on has no humanoid bone ' + vrm_name)
        if ue in arm.data.bones:
            prop.node.bone_name = ue
        else:
            log('missing bone for', vrm_name, ue)
    # look at: the eyes are bones
    vrm1.look_at.type = 'bone'
    mw = arm.matrix_world
    head = arm.data.bones['head']
    eyes = [arm.data.bones[n] for n in ('FACIAL_L_Eye', 'FACIAL_R_Eye') if n in arm.data.bones]
    if eyes:
        # ⚠ IN WORLD SPACE: the bones' own (armature-local) axes are UE's, and the first run put the
        # look origin 9 cm to her side.
        mid = sum((mw @ e.head_local for e in eyes), Vector()) / len(eyes)
        off = mid - mw @ head.head_local
        vrm1.look_at.offset_from_head_bone = (off.x, off.y, off.z)
    # Real eyes turn about 30° side to side and 25° up or down before the head takes over; the
    # add-on's default maps a 90° target to a 10° turn, which leaves the eyes all but still.
    la = vrm1.look_at
    for rm, deg in ((la.range_map_horizontal_inner, 30.0), (la.range_map_horizontal_outer, 30.0),
                    (la.range_map_vertical_down, 25.0), (la.range_map_vertical_up, 25.0)):
        rm.input_max_value = deg
        rm.output_scale = deg
    # expressions
    preset = vrm1.expressions.preset
    names = {'blinkLeft': 'blink_left', 'blinkRight': 'blink_right'}
    bound = {}
    for expr, shapes in maps['expressions'].items():
        e = getattr(preset, names.get(expr, expr))
        e.morph_target_binds.clear()
        for mesh in mesh_objs:
            keys = mesh.data.shape_keys
            if not keys:
                continue
            for shape, w in shapes.items():
                if shape in keys.key_blocks:
                    b = e.morph_target_binds.add()
                    b.node.mesh_object_name = mesh.name
                    b.index = shape
                    b.weight = float(w)
                    bound[expr] = bound.get(expr, 0) + 1
    return bound


def main():
    a = args()
    with open(os.path.join(HERE, 'maps.json')) as f:
        maps = json.load(f)
    import_glb(a['inp'], a['addon'])
    log('imported: tris', scene_tris(), 'objects', len(bpy.data.objects))
    body, face, others = armatures()
    keep = keep_set(maps)
    made = adopt_eye_bones(body, face, ['FACIAL_L_Eye', 'FACIAL_R_Eye'])
    log('eye bones adopted', made)

    # parent links of every bone in every skeleton, for folding
    parents = {}
    for arm in [body, face] + others:
        if arm:
            for b in arm.data.bones:
                parents.setdefault(b.name, b.parent.name if b.parent else None)

    outfit_names = {m.name for arm in others for m in meshes_of(arm) if 'Outfit' in arm.name or 'Outfit' in m.name}
    skinned = []
    for arm in [body, face] + others:
        if not arm:
            continue
        for m in meshes_of(arm):
            if arm is not body:
                rebind(m, body)
            skinned.append(m)
    for m in skinned:
        n = fold_weights(m, parents, keep)
        log('folded weights', m.name, n)

    # cards: anything left unbound is pinned to the head
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o not in skinned]:
        bind_to_bone(o, body, 'head')
        log('bound to head', o.name)

    for arm in [face] + others:
        if arm:
            bpy.data.objects.remove(arm, do_unlink=True)
    log('bones removed', delete_bones(body, keep), 'kept', len(body.data.bones))

    for m in [o for o in bpy.data.objects if o.type == 'MESH']:
        n = drop_material_faces(m, maps['dropMaterials'])
        if n:
            log('dropped faces', m.name, n)

    log('cards baked', apply_card_materials(a['materials'], a['hair'], a['tex']))
    if a['outfit']:
        outfit_objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.name in outfit_names]
        log('outfit tinted', tint_materials(outfit_objs, a['outfit']))

    if a['tris']:
        decimate_to(a['tris'], outfit_names)
        log('decimated: tris', scene_tris())

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for m in meshes:
        limit_and_normalise(m, maps['budget']['influences'])
    log('textures shrunk', shrink_textures(a['tex']))

    body.name = 'Armature'
    bound = setup_vrm(body, maps, meshes)
    log('expressions bound', json.dumps(bound))
    select_only(body)
    res = bpy.ops.export_scene.vrm(filepath=a['out'])
    log('export', res, os.path.getsize(a['out']) if os.path.exists(a['out']) else 'missing')


if __name__ == '__main__':
    main()
    # Blender's module build segfaults while tearing down after a successful export; the file is
    # already written and closed, so leave without the teardown.
    sys.stdout.flush()
    os._exit(0)
