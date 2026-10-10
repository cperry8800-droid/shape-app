// compress.mjs — the converted VRM, made small enough for a phone, with its VRM data intact.
//
//   node scripts/nora-model/compress.mjs <in.vrm> <out.vrm> [--tex 1024]
//
// Measured on a converted sample (95k triangles): 52 MB, of which the face's 51 ARKit shapes were
// 32 MB (every vertex, with normals, in every shape), the textures 15.6 MB (21 PNGs) and the
// geometry 4.6 MB. In order:
//   1. Shape normals go. A face shape moves skin a few millimetres; three.js lights the moved skin
//      with the base normals, which at booth distances is indistinguishable, and it halves the shapes.
//   2. Shapes are stored sparse: each one keeps only the vertices it moves (a blink touches the lids).
//   3. Geometry is reordered, quantised and meshopt-compressed (EXT_meshopt_compression); the booth
//      registers the meshopt decoder. Quantising gives each skinned mesh its own skin (same joints,
//      inverse binds adjusted to the quantised positions); the node list is untouched.
//   4. Textures become WebP at no more than --tex pixels.
// No step adds, removes or reorders nodes or morph targets, so the VRM extensions' indices hold
// (gltf.mjs).
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { reorder, quantize, sparse, textureCompress } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { makeIO } from './gltf.mjs';

const argv = process.argv.slice(2);
const [inp, out] = argv;
const texAt = argv.indexOf('--tex');
const TEX = texAt >= 0 ? Number(argv[texAt + 1]) : 1024;
if (!inp || !out || !(TEX > 0)) {
  console.error('usage: node compress.mjs <in.vrm> <out.vrm> [--tex PX]');
  process.exit(2);
}

const io = await makeIO();
const doc = await io.read(inp);

let dropped = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const target of prim.listTargets()) {
      const n = target.getAttribute('NORMAL');
      if (n) { target.setAttribute('NORMAL', null); if (!n.listParents().some((p) => p !== doc.getRoot())) n.dispose(); dropped++; }
      const t = target.getAttribute('TANGENT');
      if (t) { target.setAttribute('TANGENT', null); if (!t.listParents().some((p) => p !== doc.getRoot())) t.dispose(); }
    }
  }
}

await doc.transform(
  sparse({ ratio: 1 / 3 }),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 82 }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

// ⚠ BINARY, WHATEVER THE NAME: NodeIO.write picks the format from the extension, and `.vrm` is not
// `.glb`, so it wrote JSON with the buffers and textures as side files beside it.
const bytes = await io.writeBinary(doc);
writeFileSync(out, bytes);
console.log(`compress: dropped ${dropped} shape normal sets; wrote ${out} (${bytes.byteLength} bytes)`);
