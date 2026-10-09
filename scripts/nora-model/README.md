# Nora's model: MetaHuman → VRM

Turns a MetaHuman export into the VRM 1.0 file Nora's booth loads (`public/newdesign/booth/`). The owner's side, creating her in Unreal and exporting her, is in [`docs/BUILD-2026-10-09-metahuman-nora.md`](../../docs/BUILD-2026-10-09-metahuman-nora.md).

```
scripts/nora-model/convert.sh <character-folder> <out.vrm> [--tris 80000] [--outfit '#1c1d21'] [--hair '#2a1a12']
```

`<character-folder>` is what the metahuman-to-glb pipeline's stage 04 writes: `<id>.glb`, `textures/` and `mh_materials.json`.

## What it needs

- **Blender 4.2+.** Either `blender` on the PATH (or `BLENDER=…`), or the `bpy` module: `pip install bpy==4.2.0` in a venv, then `BLENDER_PY=<venv>/bin/python`.
- **The VRM add-on's source:** `git clone https://github.com/saturday06/VRM-Addon-for-Blender`, then `VRM_ADDON_SRC=<clone>/src`. Measured with 4.9.1.
- **Node dependencies:** `npm install` in this folder. They are pinned in `package.json` and installed here only, never into the app.

## The steps, and what each was measured to fix

The development sample was a pipeline export: **168k triangles, 875 bones across three skeletons, 13 materials, 41.5 MB**. It came out at **87k triangles, 58 bones, 10 materials, 3.98 MB**, and passed `check-vrm.mjs`.

1. **`prepare.mjs`** decodes the GLB's Draco geometry. The `bpy` wheel ships without the Draco library, so Blender cannot open the GLB as delivered.
2. **`mh_to_vrm.py`** (Blender):
   - **One skeleton.** It keeps the body's, the only one with every limb, and adds the two eye bones from the face skeleton.
   - **Bones folded away.** The rest of the 875 go, and their skin weights move to the nearest kept ancestor. The face moves through its 51 ARKit shapes instead.
   - **Hair and eyebrow cards bound to the head.** The pipeline pins them to the skeleton object, so they would not follow her head.
   - **Hidden and overlay geometry dropped** (`maps.json` `dropMaterials`).
   - **Card transparency baked.** The GLB's card textures carry no alpha; the coverage is in `textures/`. Without it, a sample's eyebrows rendered as black blocks. The cut-offs are low because coverage is soft (`mh_rules.py` `CARD_CUTOFF`).
   - **Outfit tinted** (`--outfit`). The pipeline loses the clothing colour, and a sample's shirt came out white and glowing.
   - **Triangles cut by part** (`--tris`). The shapes carry across, and the lips, lids, eyes, teeth, lashes and hands are protected from the cut.
   - **VRM data written:** the humanoid map and ARKit-to-expression binds from `maps.json`, the eye-bone look-at (computed in world space, with real eye ranges), and a meta naming the MetaHuman licence. It exports VRM 1.0, and the add-on bakes the T-pose.
3. **`compress.mjs`** drops the shapes' normals, stores the shapes sparse, quantises the geometry, compresses it with meshopt and turns the textures into WebP. On the sample this took 52 MB down to 4 MB. The VRM extensions are passed through unchanged (`gltf.mjs`), and no step touches the node or morph-target order they index.
4. **`check-vrm.mjs`** checks the result against what the booth needs:
   - every bone the performer drives
   - the expressions it sets, bound to real shapes
   - a look-at that can work
   - the budget in `maps.json`

## Licence and hosting

- A MetaHuman is governed by Epic's licence (https://www.metahuman.com/license), not a VRM licence. The VRM meta records that.
- **The converted model is not committed to this public repository.** It is hosted outside it.
- Neither the development sample nor any MetaHuman file is in the repo.
