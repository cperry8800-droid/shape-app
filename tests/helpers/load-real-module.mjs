// tests/helpers/load-real-module.mjs
//
// Compile a REAL shipping module (JSX/TSX, Vite-style ESM) to CJS in memory and
// evaluate it with its imports resolved from a registry — the pattern proven in
// broadsheet-render.test.mjs, generalized: TSX support, bare-specifier
// resolution via createRequire from the SOURCE file's location (so
// mobile-app/node_modules wins for mobile sources), and caller-supplied
// registry overrides. No source file is written or copied — what runs here is
// the shipping code.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const presetTs = require_('next/dist/compiled/babel/preset-typescript');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');

// The chain of modules being compiled on THIS import path. A relative import that lands on
// one of its own ancestors is an IMPORT CYCLE, and without the check the loader recurses
// forever: A imports B, B imports A, and each level re-compiles A from scratch (measured on
// the client module: ~5 s of Babel per level, no error, no end).
// ⚠ THE CHAIN TRAVELS WITH THE CALL (`ancestors`), NOT IN A MODULE-LEVEL SET. A global set of
// "modules compiling right now" read two CONCURRENT loads of the same file — or a diamond
// whose two arms load in parallel — as a cycle, because one load's marker was still up when
// the other arrived (and the client module's 5 s synchronous compile made that easy to hit).
// A harness that compiles the root module itself (broadsheet-mount.mjs) passes
// `ancestors: [root]` to the loads it starts, so a sibling that imports the root back fails
// at once instead of after re-compiling all 38k lines of it.
export async function loadRealModule(srcPath, { registry = new Map(), appendExports = '', typescript = false, ancestors = [] } = {}) {
  if (ancestors.includes(srcPath)) throw new Error(`import cycle: ${[...ancestors, srcPath].join(' -> ')}`);
  return loadRealModuleInner(srcPath, { registry, appendExports, typescript, ancestors: [...ancestors, srcPath] });
}

async function loadRealModuleInner(srcPath, { registry, appendExports, typescript, ancestors }) {
  const dir = dirname(srcPath);
  const srcRequire = createRequire(pathToFileURL(srcPath));
  // import.meta.env is Vite's build-time injection; substitute like the bundler.
  const source = `${readFileSync(srcPath, 'utf8').replace(/import\.meta\.env/g, '__VITE_ENV__')}\n${appendExports}\n`;
  // Classic website scripts get their shared video components from shapeVideo.js.
  // Reproduce that script dependency when mounting the actual JSX in Node.
  if (srcPath.replace(/\\/g, '/').includes('/public/newdesign/') && /<ShapeVideo/.test(source)) {
    const api = require_('../../public/newdesign/shapeVideo.js');
    Object.assign(globalThis, api.createComponents(registry.get('react') || require_('react')));
    globalThis.ShapeVideo = api;
  }
  const { code } = babel.transformSync(source, {
    presets: typescript ? [[presetTs, { isTSX: true, allExtensions: true }], presetReact] : [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: srcPath,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    if (spec.startsWith('.') || spec.startsWith('/')) {
      // Shipping components may compose other JSX modules. Compile those too;
      // share bare dependency overrides (not relative paths, whose base moved).
      registry.set(spec, /\.[jt]sx$/.test(spec)
        ? await loadRealModule(join(dir, spec), { registry: new Map([...registry].filter(([name]) => !name.startsWith('.') && !name.startsWith('/'))), typescript: /\.tsx$/.test(spec), ancestors })
        : await import(pathToFileURL(join(dir, spec)).href));
    } else {
      // Bare specifier: resolve as CJS from the source file's node_modules.
      registry.set(spec, srcRequire(spec));
    }
  }
  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    return registry.get(spec);
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}
