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

// ── Error-tracking config (Sentry, static website) ───────────────────────────
// Declared up here because it gates the COMPILER options below, not just the
// HTML rewrite. See the long note above pass 2 for why the DSN is injected at
// deploy time rather than living in a source file.
const SITE_DSN = process.env.SHAPE_SITE_SENTRY_DSN || '';
// The deploy's git SHA, so static-site errors correlate with the same release
// the Next.js app and the mobile bundle stamp. Absent => no release key is set
// and sentryInit.js degrades to "no release" — honestly absent, never faked.
const SITE_RELEASE = process.env.VERCEL_GIT_COMMIT_SHA || '';
// production | preview | development. ⚠ Without this the browser SDK defaults
// unlabelled events to production, and THIS REPO SHARES PRODUCTION ENV VARS WITH
// PREVIEW DEPLOYS — so a PR preview of the static site would file its errors as
// live ones, making staging failures indistinguishable from production and
// defeating any production-only alert filter. Matches sentry.server.config.ts /
// instrumentation-client.ts, which already read VERCEL_ENV. Absent => no
// environment key is set, and the SDK's own default applies.
const SITE_ENV = process.env.VERCEL_ENV || '';
// Errors-only CDN bundle, pinned to the exact version + SRI hash Sentry
// publishes. ⚠ These live HERE, not in sentryInit.js, because the tag has to be
// part of the document's ordered defer chain — see SENTRY_TAG below.
const SENTRY_CDN_URL = 'https://browser.sentry-cdn.com/10.69.0/bundle.min.js';
const SENTRY_CDN_SRI = 'sha384-3CEt/dsT99DjKC3MgiUAiordZm0hoZjYMn6ioBvRKm+9A98CLWAUsQsk5XaPpjfU';

const BABEL_OPTS = {
  presets: [['@babel/preset-react', { runtime: 'classic' }]],
  compact: true,
  comments: false,
  babelrc: false,
  configFile: false,
};

const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

// ⚠ `compact: true` puts every compiled file on ONE line. Without a source map
// a Sentry stack trace for this surface reads `nd/pageShell.js:1:45231` — the
// function names survive (nothing is mangled) but the location is useless, so
// the runbook's "arrives symbolicated, not minified" check could never pass.
// Maps are emitted only when a DSN is configured, so an unconfigured build
// stays byte-identical and `--check` stays honest.
//
// Publishing the maps costs nothing here: this surface serves its `.jsx`
// sources as PLAIN FILES already (75 of them are public under
// /newdesign/*.jsx), so `sourcesContent` exposes nothing that isn't a fetch
// away. That is what makes hosted maps the right call on THIS surface and the
// wrong one on /m/, where build-m.sh strips every .map for exactly that reason.
function compile(source, filename) {
  const opts = { ...BABEL_OPTS, filename };
  if (SITE_DSN) {
    opts.sourceMaps = true;
    opts.sourceFileName = filename;
  }
  const { code, map } = transformSync(source, opts);
  if (!SITE_DSN) return { code, map: null };
  // Inline the original text so resolving a frame never needs a second fetch.
  if (map && !map.sourcesContent) map.sourcesContent = [source];
  return { code, map };
}

// Attach a map to a compiled file: writes `<out>.map` beside it and appends the
// pragma that points at it. Returns the final code (what gets hashed + served).
function withSourceMap(code, map, outName) {
  if (!map) return code;
  const final = `${code}\n//# sourceMappingURL=${outName}.map\n`;
  if (!CHECK) fs.writeFileSync(path.join(OUT, `${outName}.map`), JSON.stringify(map));
  return final;
}

if (!CHECK) fs.mkdirSync(OUT, { recursive: true });

// Compile each external .jsx once (several pages share pageShell/chatWidget).
const compiledExternal = new Map(); // basename.jsx -> { out, v }
function compileExternal(srcName) {
  if (compiledExternal.has(srcName)) return compiledExternal.get(srcName);
  const abs = path.join(ND, srcName);
  if (!fs.existsSync(abs)) throw new Error(`referenced jsx missing: ${srcName}`);
  const outName = srcName.replace(/\.jsx$/, '.js');
  const { code, map } = compile(fs.readFileSync(abs, 'utf8'), srcName);
  const final = withSourceMap(code, map, outName);
  const entry = { out: `nd/${outName}`, v: hash8(final) };
  if (!CHECK) fs.writeFileSync(path.join(OUT, outName), final);
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
// pages still excluded — but the REASON is the `continue` guard below, not a
// bandwidth judgement: they carry no `text/babel`, no `@babel/standalone` and
// no `globalChatButton.js`, so the precompile has nothing to do on them and
// skips them entirely. ⚠ Do not read the exclusion list as principled: 36 OTHER
// pages also `location.replace` out of a synchronous `<head>` script (every
// Client*/Trainer*/Nutritionist* alias stub) and they all DO receive the tag,
// because they happen to carry a babel block. Bandwidth-wise they are the same
// case; the guard just cannot see it.
//
// Unset DSN => injects NOTHING, so the output is byte-identical to a build
// without this block. That is the state every deploy is in until the owner
// creates the project, and it keeps `--check` honest.
//
// ⚠ THE CDN TAG IS PART OF THE DEFER CHAIN, NOT APPENDED AT RUNTIME, and that
// ordering is the whole point. sentryInit.js used to `document.head.appendChild`
// the bundle, but a dynamically-inserted script is ASYNC by default — so it
// raced the page's own deferred `nd/*.js`, which mount the app. Those scripts
// could throw before `Sentry.init` had installed its global handlers, and a
// page-startup crash — the single most valuable error this surface can report —
// was lost every cold load. Deferred scripts execute in DOCUMENT ORDER, and
// every compiled `nd/*.js` on these pages sits after `</head>`, so injecting
// the pair here guarantees: CDN bundle -> init -> APPLICATION CODE.
//
// ⚠ THAT GUARANTEE IS ABOUT `nd/*.js` ONLY — it is NOT "nothing runs first".
// An earlier version of this comment said "every compiled script ... sits after
// `</head>`, so injecting the pair here guarantees" the order outright, which
// overstated it. A DEFERRED script cannot precede a SYNCHRONOUS one no matter
// where its tag sits, so these still execute before Sentry installs:
//   • synchronous external `<script src>` in `<head>` — 26 pages (the React /
//     ReactDOM / Babel UMD tags on all of them, plus `/vendor/supabase-js` and
//     `/supabase.js` on index, ClientProfile, Login and the three Signup pages);
//   • classic inline `<script>` blocks — 17 across 10 pages (index alone has 7).
// Moving this injection earlier in `<head>` would NOT fix that (still deferred);
// closing it needs an early-error queue, which is its own change. Uncaught
// throws in that pre-init window are out of Sentry's reach today — a known,
// pre-existing gap, deliberately not papered over here.
// ⚠ sentryInit.js carries a content-hash `?v=` like every other script this file
// emits (see the `?v=${e.v}` and `?v=${hash8(final)}` sites). It was injected as a
// bare path, so an edit to it would have been served stale from cache until the
// entry expired — on the one file whose job is to install error tracking.
const SENTRY_INIT_V = SITE_DSN
  ? hash8(fs.readFileSync(path.join(ND, 'sentryInit.js'), 'utf8'))
  : '';
const SENTRY_TAG = SITE_DSN
  ? `<script>window.SHAPE_SENTRY_DSN=${JSON.stringify(SITE_DSN)};`
    + (SITE_RELEASE ? `window.SHAPE_RELEASE=${JSON.stringify(SITE_RELEASE)};` : '')
    + (SITE_ENV ? `window.SHAPE_ENV=${JSON.stringify(SITE_ENV)};` : '')
    + `</script>`
    + `<script defer src="${SENTRY_CDN_URL}" crossorigin="anonymous"`
    + ` integrity="${SENTRY_CDN_SRI}"></script>`
    + `<script defer src="/newdesign/sentryInit.js?v=${SENTRY_INIT_V}"></script>`
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
    const blockNo = i++;
    const outName = `${page.replace(/\.html$/, '')}-in${blockNo}.js`;
    const { code, map } = compile(body, `${page} (inline block ${blockNo})`);
    const final = withSourceMap(code, map, outName);
    if (!CHECK) fs.writeFileSync(path.join(OUT, outName), final);
    return `<script defer src="nd/${outName}?v=${hash8(final)}"></script>`;
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
  // Sentry: the inline tag runs during head parse (so the globals are set
  // before any deferred script executes); the CDN bundle and the initializer
  // are deferred, and land here — ahead of every compiled script, which all sit
  // after </head> — so init is guaranteed to run before the app mounts. Empty
  // string when no DSN is configured — see SENTRY_TAG.
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
// Symbolication + release are the two things that decide whether a captured
// error is READABLE. Both are silent when they fail, so say them out loud.
if (SITE_DSN) {
  console.log(
    `newdesign sentry: source maps emitted for ${compiledExternal.size + inlineBlocks} compiled files` +
    ` (publicly served beside the .jsx sources this surface already exposes)`
  );
  console.log(
    SITE_RELEASE
      ? `newdesign sentry: release stamped ${SITE_RELEASE.slice(0, 9)}`
      : `newdesign sentry: VERCEL_GIT_COMMIT_SHA unset — no release stamped (errors will not correlate with a deploy)`
  );
}
