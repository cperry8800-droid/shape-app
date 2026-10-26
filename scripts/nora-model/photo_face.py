# photo_face.py — Nora's face from a photograph, baked into her skin texture (makehuman_nora.py).
#
# MakeHuman's skin textures are painted, and up close a painted face reads as CG (owner,
# 2026-10-26: "her face still doesnt look natural"). This puts a real photograph's skin, brows and
# lips on her instead, without changing the mesh, so the rig, the 52 face shapes and the eyes still
# work:
#   1. The head is drawn front-on and flat (each part's own texture, no lighting) by an orthographic
#      camera.
#   2. photo_warp.py (its own Python: MediaPipe) finds the same 468 landmarks on that render and on
#      the photo, and warps the photo onto the render piece by piece, so the photo's eyes, nose and
#      mouth land on the head's own; plus a soft mask of the face's outline.
#   3. The warped photo is projected onto the body from that same camera and baked into the skin's
#      own UV layout (Cycles, emission), with the mask faded where the skin turns away from the
#      camera (the sides of the face keep the painted skin).
#   4. The rest of the skin is shifted to the photo's skin tone, and the two are blended through the
#      mask.
# The photo must be front-on and evenly lit: its light is baked in.
import json
import os
import subprocess
import urllib.request

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def _emission(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    build(nt, em)
    return m


def _texture(obj):
    for n in obj.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            return n.image
    raise SystemExit('no texture on ' + obj.name)


def _camera(centre, scale):
    cd = bpy.data.cameras.new('faceCam')
    cd.type = 'ORTHO'
    cd.ortho_scale = scale
    cam = bpy.data.objects.new('faceCam', cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (centre.x, centre.y - 1.0, centre.z)
    cam.rotation_euler = (np.pi / 2, 0, 0)   # looking along +Y, at her face; +Z up
    return cam


def render_front(objs, centre, scale, size, path):
    """The head front-on, each part flat in its own texture."""
    sc = bpy.context.scene
    saved = {o: list(o.data.materials) for o in objs}
    hidden = [o for o in sc.objects if o.type == 'MESH' and o not in objs and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    for o in objs:
        img = _texture(o)

        def build(nt, em, img=img):
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = img
            nt.links.new(t.outputs['Color'], em.inputs['Color'])
        m = _emission('flat.' + o.name, build)
        o.data.materials.clear()
        o.data.materials.append(m)
    cam = _camera(centre, scale)
    prev = (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y, sc.view_settings.view_transform, sc.world)
    sc.camera = cam
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 8
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('faceWorld')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.35, 1)
    sc.world = w
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y, sc.view_settings.view_transform, sc.world = prev
    bpy.data.objects.remove(cam)
    for o, mats in saved.items():
        o.data.materials.clear()
        for m in mats:
            o.data.materials.append(m)
    for o in hidden:
        o.hide_render = False


def _bake(body, size, build, name, data=False):
    """Emission-bake a material built by `build` into a new image on the skin's UV layout. data: the
    image holds numbers (a mask), not colour, so no sRGB curve is put on them."""
    target = bpy.data.images.new(name, size, size, alpha=False)
    if data:
        target.colorspace_settings.name = 'Non-Color'

    def full(nt, em):
        build(nt, em)
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = target
        nt.nodes.active = t
    m = _emission('bake.' + name, full)
    saved = list(body.data.materials)
    body.data.materials.clear()
    body.data.materials.append(m)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    body.data.materials.clear()
    for mm in saved:
        body.data.materials.append(mm)
    return np.array(target.pixels[:], dtype=np.float32).reshape(size, size, 4)


def enlarge_face_uv(body, share=0.6, group='head', log=print):
    """Give the face more of the skin texture. MakeHuman's layout spends most of it on the body and
    leaves the face about 200 px across on a 2048 texture: a photo baked there blurs (measured: soft
    brows). The face's UV island is moved, as it is, into the left `share` of the texture and scaled
    up to fill it; every other island keeps its place relative to the rest, scaled into the right
    part. The skin's texture is re-baked into the new layout, so nothing else changes."""
    import bmesh
    me = body.data
    old = me.uv_layers.active.name
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv[old]
    dl = bm.verts.layers.deform.active
    gi = body.vertex_groups[group].index
    bm.faces.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for e in bm.edges:
        if len(e.link_loops) != 2:
            continue
        a, b = e.link_loops
        if (a[uv].uv - b.link_loop_next[uv].uv).length < 1e-6 and (a.link_loop_next[uv].uv - b[uv].uv).length < 1e-6:
            parent[find(a.face.index)] = find(b.face.index)
    islands = {}
    for f in bm.faces:
        islands.setdefault(find(f.index), []).append(f)
    # the face's island: the one with the most faces the head bone carries (MakeHuman unwraps the
    # face and the front of the scalp as one piece; the head's other pieces sit all over the sheet,
    # so moving them all would shrink, not grow, the face)
    def head_faces(fs):
        return sum(1 for f in fs if sum(v[dl].get(gi, 0.0) for v in f.verts) / len(f.verts) >= 0.5)
    face = max(islands, key=lambda r: head_faces(islands[r]))
    headish = {r: r == face for r in islands}

    def bbox(head):
        us = [l[uv].uv for r, fs in islands.items() if headish[r] == head for f in fs for l in f.loops]
        return (min(p.x for p in us), min(p.y for p in us), max(p.x for p in us), max(p.y for p in us))
    boxes = {True: bbox(True), False: bbox(False)}
    regions = {True: (0.0, share), False: (share, 1.0)}
    fits = {}
    for head, (u0, v0, u1, v1) in boxes.items():
        x0, x1 = regions[head]
        k = min((x1 - x0) * 0.98 / max(u1 - u0, 1e-6), 0.98 / max(v1 - v0, 1e-6))
        fits[head] = (k, u0, v0, x0 + ((x1 - x0) - (u1 - u0) * k) / 2, (1 - (v1 - v0) * k) / 2)
    new = bm.loops.layers.uv.new('skinUV2')
    for r, fs in islands.items():
        k, u0, v0, ox, oy = fits[headish[r]]
        for f in fs:
            for l in f.loops:
                p = l[uv].uv
                l[new].uv = (ox + (p.x - u0) * k, oy + (p.y - v0) * k)
    bm.to_mesh(me)
    bm.free()
    # the skin's texture, re-baked into the new layout
    skin = _texture(body)
    size = skin.size[0]

    def from_old(nt, em):
        m = nt.nodes.new('ShaderNodeUVMap')
        m.uv_map = old
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = skin
        nt.links.new(m.outputs['UV'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], em.inputs['Color'])
    me.uv_layers.active = me.uv_layers['skinUV2']
    px = _bake(body, size, from_old, 'skinRelaid')
    me.uv_layers.remove(me.uv_layers[old])
    me.uv_layers['skinUV2'].name = old
    me.uv_layers.active = me.uv_layers[old]
    me.uv_layers[old].active_render = True
    skin.scale(size, size)
    skin.pixels[:] = px.ravel()
    skin.pack()
    log('skin texture re-laid: the face', round(fits[True][0], 2), 'x as wide, the rest', round(fits[False][0], 2), 'x')


def apply_face_photo(body, render_objs, eye_centre, spec, work, face_py, model, log=print):
    os.makedirs(work, exist_ok=True)
    photo = os.path.join(work, 'photo' + os.path.splitext(spec['url'])[1])
    if not os.path.exists(photo):
        urllib.request.urlretrieve(spec['url'], photo)
    # the face from the hairline to the chin, centred a little under the eyes
    centre = Vector((0.0, eye_centre.y, eye_centre.z - 0.02))
    scale = spec.get('frame', 0.3)
    render = os.path.join(work, 'render.png')
    render_front(render_objs, centre, scale, 1024, render)
    subprocess.run([face_py, os.path.join(HERE, 'photo_warp.py'), photo, render, model, work], check=True)
    warped = bpy.data.images.load(os.path.join(work, 'warped.png'))
    mask = bpy.data.images.load(os.path.join(work, 'mask.png'))
    mask.colorspace_settings.name = 'Non-Color'

    enlarge_face_uv(body, spec.get('head_share', 0.6), log=log)
    me = body.data
    skin_uv = me.uv_layers.active.name
    proj = me.uv_layers.new(name='faceProj')
    mw = body.matrix_world
    for lp in me.loops:
        co = mw @ me.vertices[lp.vertex_index].co
        proj.data[lp.index].uv = ((co.x - centre.x) / scale + 0.5, (co.z - centre.z) / scale + 0.5)
    me.uv_layers.active = me.uv_layers[skin_uv]
    # how squarely each vertex faces the camera: the photo fades out round the sides of the face
    att = me.color_attributes.new('faceFacing', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        f = min(1.0, max(0.0, (-v.normal.y - 0.35) / 0.45))
        att.data[v.index].color = (f, f, f, 1.0)

    def warped_mat(nt, em):
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'faceProj'
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = warped
        t.extension = 'EXTEND'
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], em.inputs['Color'])

    def mask_mat(nt, em):
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'faceProj'
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = mask
        t.extension = 'CLIP'
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = 'faceFacing'
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        nt.links.new(t.outputs['Color'], mul.inputs[0])
        nt.links.new(a.outputs['Fac'], mul.inputs[1])
        nt.links.new(mul.outputs[0], em.inputs['Color'])

    skin = _texture(body)
    size = skin.size[0]
    col = _bake(body, size, warped_mat, 'facePhoto')
    m = _bake(body, size, mask_mat, 'faceMask', data=True)[..., 0:1]
    me.uv_layers.remove(me.uv_layers['faceProj'])
    me.color_attributes.remove(me.color_attributes['faceFacing'])

    orig = np.array(skin.pixels[:], dtype=np.float32).reshape(skin.size[1], skin.size[0], 4)
    core = m[..., 0] > 0.85
    if core.sum() < 100:
        raise SystemExit('the photo covered almost none of the face: check the frame and the landmarks')
    # the rest of the skin takes the photo's tone, so the neck and the body meet the face
    ratio = np.clip(col[core, :3].mean(0) / np.maximum(orig[core, :3].mean(0), 1e-4), 0.6, 1.6)
    out = orig.copy()
    out[..., :3] = orig[..., :3] * ratio * (1 - m) + col[..., :3] * m
    skin.pixels[:] = np.clip(out, 0, 1).ravel()
    skin.pack()
    log('face photo baked: coverage', round(float(core.mean()), 4), 'tone ratio', [round(float(x), 3) for x in ratio])
    return render
