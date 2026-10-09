// gltf.mjs — the glTF-Transform setup the MetaHuman tools share: every Khronos extension, the Draco
// decoder, the meshopt encoder and decoder, and a pass-through for the VRM extensions.
//
// ⚠ GLTF-TRANSFORM DROPS EXTENSIONS IT DOES NOT KNOW. A VRM is a glTF whose humanoid, expressions and
// look-at live in the root `VRMC_vrm` extension, so a plain read-and-write would hand back a model
// three-vrm can no longer drive. The pass-through keeps each VRM extension's JSON as it was read.
// That JSON names nodes and morph targets by INDEX, so a step that adds, removes or reorders nodes or
// targets would leave it pointing at the wrong ones; compress.mjs applies none. (check-vrm.mjs then
// checks that each index the extension holds exists and is in range, not that it names the same node
// as before; tests/nora-model-tools.test.mjs holds compress.mjs to the transforms that keep order.)
import { NodeIO, Extension } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export const VRM_EXTENSIONS = ['VRMC_vrm', 'VRMC_springBone', 'VRMC_node_constraint', 'VRMC_materials_mtoon'];

function passThrough(name) {
  return class extends Extension {
    static EXTENSION_NAME = name;
    extensionName = name;
    raw = null;
    read(context) {
      const ext = context.jsonDoc.json.extensions;
      this.raw = ext && ext[name] !== undefined ? JSON.parse(JSON.stringify(ext[name])) : null;
      return this;
    }
    write(context) {
      if (this.raw == null) return this;
      const json = context.jsonDoc.json;
      json.extensions = json.extensions || {};
      json.extensions[name] = this.raw;
      return this;
    }
  };
}

export const VRM_PASS_THROUGH = VRM_EXTENSIONS.map(passThrough);

export async function makeIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions([...ALL_EXTENSIONS, ...VRM_PASS_THROUGH])
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}
