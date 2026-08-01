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
let pagesTouched = 0, inlineBlocks = 0, externalTags = 0, sentryPages = 0;

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

// Lazy loaders (globalChatButton's rich-chat boot) inject .jsx at runtime and
// previously relied on window.Babel. Publish the compiled-file map so they can
// load the precompiled equivalents (they fall back to the Babel path when the
// manifest is absent, i.e. in local dev). Built once — pass 1 made it complete.
const ND_MANIFEST = `<script>window.__ndCompiled=${JSON.stringify(Object.fromEntries(
  [...compiledExternal].map(([jsx, e]) => [jsx, `/newdesign/${e.out}?v=${e.v}`])
))};</script>`;

// ── Error-tracking bootstrap (Sentry, static website) ────────────────────────
// This surface has no bundler, so there is no `process.env` to read at runtime
// and no import graph an SDK could be installed into. The deploy IS the only
// build step it has — so the DSN is injected here, at deploy time, exactly like
// the compiled-script rewrite above.
//
// ⚠ THIS REPLACED A `window.SHAPE_SENTRY_DSN` ASSIGNMENT IN pageShell.jsx, and
// the reason is worth keeping: nothing in the repo ever set that global, so the
// static site would have stayed unmonitored FOREVER after the owner set every
// documented env var and redeployed. The runbook promised activation-by-env-var
// while the code required a source edit — the failure mode being fixed was the
// records and the code disagreeing, not a missing feature.
//
// Injected into every page this script rewrites (see the `continue` guard
// below) rather than into one shared file, which also fixes the second half of
// that gap: pageShell.jsx is loaded by 69 of the 76 pages, so hooking it left
// GetApp / consultation / ClientPlaylists — all live, linked flows — with no
// error tracking at all. The two pure-redirect stubs (TrainerPublic /
// NutritionistPublic, whose entire body is a `location.replace`) are the only
// pages still excluded: they navigate away immediately, so fetching a ~90 KB
// CDN bundle there would cost every visitor bandwidth for a page that is gone
// before the SDK could install.
//
// Unset DSN => injects NOTHING, so the output is byte-identical to a build
// without this block. That is the state every deploy is in until the owner
// creates the project, and it keeps `--check` honest.
const SITE_DSN = process.env.SHAPE_SITE_SENTRY_DSN || '';
const SENTRY_TAG = SITE_DSN
  ? `<script>window.SHAPE_SENTRY_DSN=${JSON.stringify(SITE_DSN)};</script>`
    + `<script defer src="/newdesign/sentryInit.js"></script>`
  : '';

// Pass 2: rewrite the pages.
for (const page of pages) {
  const abs = path.join(ND, page);
  const html = fs.readFileSync(abs, 'utf8');
  // Visit pages that load the standalone compiler without any text/babel tags
  // (dead weight — the strip below removes it), and pages that only carry the
  // chat button (they still need the manifest for the rich-chat lazy boot).
  if (!html.includes('text/babel') && !html.includes('@babel/standalone') && !html.includes('globalChatButton.js')) continue;
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
  // Manifest: before the first compiled script, or into <head> on pages that
  // carry only the chat button (GetApp, consultation) so the rich-chat boot
  // can find the compiled bundles there too.
  if (next.includes('<script defer src="nd/')) {
    next = next.replace(/<script defer src="nd\//, `${ND_MANIFEST}\n<script defer src="nd/`);
  } else if (next.includes('globalChatButton.js')) {
    next = next.replace(/<\/head>/, `${ND_MANIFEST}</head>`);
  }
  // Sentry: the inline tag runs during head parse (so the global is set before
  // any deferred script executes), the loader is deferred like every compiled
  // script above. Empty string when no DSN is configured — see SENTRY_TAG.
  if (SENTRY_TAG && next.includes('</head>')) {
    next = next.replace('</head>', `${SENTRY_TAG}</head>`);
    sentryPages++;
  }
  if (crlf) next = next.replace(/(?<!\r)\n/g, '\r\n'); // 17 pages are CRLF; keep them whole
  if (!CHECK) fs.writeFileSync(abs, next);
  pagesTouched++;
}

console.log(
  `newdesign precompile${CHECK ? ' (check only)' : ''}: ${pagesTouched} pages, ` +
  `${compiledExternal.size} shared jsx, ${inlineBlocks} inline blocks, ${externalTags} external tags`
);
// Say out loud which pages error tracking reaches and which it does not. A
// coverage number nobody prints reads as "everything is covered" the moment
// someone adds a page that this script's `continue` guard skips.
console.log(
  SITE_DSN
    ? `newdesign sentry: injected on ${sentryPages}/${pages.length} pages` +
      `${sentryPages < pages.length ? ` (${pages.length - sentryPages} skipped — no script machinery, e.g. pure-redirect stubs)` : ''}`
    : `newdesign sentry: SHAPE_SITE_SENTRY_DSN unset — no DSN injected, static-site error tracking inert on all ${pages.length} pages`
);
