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

export async function loadRealModule(srcPath, { registry = new Map(), appendExports = '', typescript = false } = {}) {
  const dir = dirname(srcPath);
  const srcRequire = createRequire(pathToFileURL(srcPath));
  // import.meta.env is Vite's build-time injection; substitute like the bundler.
  const source = `${readFileSync(srcPath, 'utf8').replace(/import\.meta\.env/g, '__VITE_ENV__')}\n${appendExports}\n`;
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
      registry.set(spec, await import(pathToFileURL(join(dir, spec)).href));
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
