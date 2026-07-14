// Precompile public/newdesign JSX at deploy time (PR: newdesign-precompile).
//
// The website pages ship `<script type="text/babel">` tags (external .jsx and
// inline blocks) that @babel/standalone compiles IN THE BROWSER on every page
// load — ~1s of main-thread work per navigation on a fast desktop. This script
// runs in the Vercel buildCommand (same precedent as public/m, #1470): it
// compiles every text/babel script to plain JS under public/newdesign/nd/ and
// rewrites the HTML IN PLACE in the build checkout to load the compiled files
// with `defer`. Nothing it writes is ever committed — the repo keeps the
// in-browser-Babel workflow so pages still work when served raw in local dev.
//
// Semantics preserved:
// - Compiled scripts stay CLASSIC scripts (not modules): the .jsx files share
//   top-level consts and window globals across files, which requires the
//   shared global lexical environment classic scripts get.
// - `defer` executes them in document order after parse — the same relative
//   order @babel/standalone uses (it runs text/babel tags in DOM order at
//   DOMContentLoaded).
// - JSX is the only transform (preset-react, classic runtime): matches the
//   `data-presets="react"` tags, and the no-preset tags only rely on the JSX
//   transform in practice (the site targets modern browsers).
//
// Usage: node scripts/build-newdesign.mjs [--check]
//   --check  compile everything but do not touch the HTML (CI compile gate).

import { transformSync } from '@babel/core';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ND = path.join(ROOT, 'public', 'newdesign');
const OUT = path.join(ND, 'nd');
const CHECK = process.argv.includes('--check');

const BABEL_OPTS = {
  presets: [['@babel/preset-react', { runtime: 'classic' }]],
  compact: true,
  comments: false,
  babelrc: false,
  configFile: false,
};

const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

function compile(source, filename) {
  const { code } = transformSync(source, { ...BABEL_OPTS, filename });
  return code;
}

if (!CHECK) fs.mkdirSync(OUT, { recursive: true });

// Compile each external .jsx once (several pages share pageShell/chatWidget).
const compiledExternal = new Map(); // basename.jsx -> { out, v }
function compileExternal(srcName) {
  if (compiledExternal.has(srcName)) return compiledExternal.get(srcName);
  const abs = path.join(ND, srcName);
  if (!fs.existsSync(abs)) throw new Error(`referenced jsx missing: ${srcName}`);
  const code = compile(fs.readFileSync(abs, 'utf8'), srcName);
  const outName = srcName.replace(/\.jsx$/, '.js');
  const entry = { out: `nd/${outName}`, v: hash8(code) };
  if (!CHECK) fs.writeFileSync(path.join(OUT, outName), code);
  compiledExternal.set(srcName, entry);
  return entry;
}

const BABEL_TAG = /<script\s+type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g;
const STANDALONE_TAG = /[ \t]*<script[^>]*@babel\/standalone[^>]*><\/script>\r?\n?/g;

const pages = fs.readdirSync(ND).filter((f) => f.endsWith('.html'));
let pagesTouched = 0, inlineBlocks = 0, externalTags = 0;

// Pass 1: compile every externally-referenced .jsx up front, so the manifest
// injected below is COMPLETE on every page (not just files seen so far).
for (const page of pages) {
  const html = fs.readFileSync(path.join(ND, page), 'utf8');
  BABEL_TAG.lastIndex = 0;
  for (const m of html.matchAll(BABEL_TAG)) {
    const src = /src="([^"?]+)(?:\?[^"]*)?"/.exec(m[1]);
    if (src) compileExternal(src[1]);
  }
}

// Pass 2: rewrite the pages.
for (const page of pages) {
  const abs = path.join(ND, page);
  const html = fs.readFileSync(abs, 'utf8');
  // Also visit pages that load the standalone compiler without any text/babel
  // tags (dead weight) — the strip below removes it for them too.
  if (!html.includes('text/babel') && !html.includes('@babel/standalone')) continue;
  BABEL_TAG.lastIndex = 0;
  const crlf = html.includes('\r\n');
  let i = 0;
  let next = html.replace(BABEL_TAG, (m, attrs, body) => {
    const src = /src="([^"?]+)(?:\?[^"]*)?"/.exec(attrs);
    if (src) {
      externalTags++;
      const { out, v } = compileExternal(src[1]);
      return `<script defer src="${out}?v=${v}"></script>`;
    }
    inlineBlocks++;
    const code = compile(body, `${page}.inline${i}`);
    const outName = `${page.replace(/\.html$/, '')}-in${i++}.js`;
    if (!CHECK) fs.writeFileSync(path.join(OUT, outName), code);
    return `<script defer src="nd/${outName}?v=${hash8(code)}"></script>`;
  });
  // No text/babel left on the page — the standalone compiler can go.
  next = next.replace(STANDALONE_TAG, '');
  // Lazy loaders (globalChatButton's rich-chat boot) inject .jsx at runtime
  // and previously relied on window.Babel. Publish the compiled-file map so
  // they can load the precompiled equivalents instead (they fall back to the
  // Babel path when this manifest is absent, i.e. in local dev).
  const manifest = JSON.stringify(Object.fromEntries(
    [...compiledExternal].map(([jsx, e]) => [jsx, `/newdesign/${e.out}?v=${e.v}`])
  ));
  next = next.replace(/<script defer src="nd\//, `<script>window.__ndCompiled=${manifest};</script>\n<script defer src="nd/`);
  if (crlf) next = next.replace(/(?<!\r)\n/g, '\r\n'); // 17 pages are CRLF; keep them whole
  if (!CHECK) fs.writeFileSync(abs, next);
  pagesTouched++;
}

console.log(
  `newdesign precompile${CHECK ? ' (check only)' : ''}: ${pagesTouched} pages, ` +
  `${compiledExternal.size} shared jsx, ${inlineBlocks} inline blocks, ${externalTags} external tags`
);
