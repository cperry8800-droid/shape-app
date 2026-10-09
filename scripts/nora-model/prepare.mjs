// prepare.mjs — decode the pipeline's Draco-compressed GLB so Blender can read it.
//
//   node scripts/nora-model/prepare.mjs <nora.glb> <nora-raw.glb>
//
// ⚠ The Blender Python module (`bpy` on PyPI) ships without the Draco library its glTF importer
// loads, so it cannot open the pipeline's GLB directly (measured: "libextern_draco.so: cannot open
// shared object file"). glTF-Transform decodes it here instead.
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { makeIO } from './gltf.mjs';

const [, , inp, out] = process.argv;
if (!inp || !out) {
  console.error('usage: node prepare.mjs <in.glb> <out.glb>');
  process.exit(2);
}
const io = await makeIO();
const doc = await io.read(inp);
for (const e of doc.getRoot().listExtensionsUsed()) {
  if (e.extensionName === KHRDracoMeshCompression.EXTENSION_NAME) e.dispose();
}
await io.write(out, doc);
console.log(`prepare: wrote ${out}`);
