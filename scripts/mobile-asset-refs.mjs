#!/usr/bin/env node
// Check that every asset reference in mobile-app/src resolves to a real file in
// mobile-app/public, and that every file in mobile-app/public is accounted for.
//
// WHY THIS EXISTS: nothing else in this repo can see these references at all.
// Vite copies publicDir VERBATIM and never resolves a runtime template string,
// so `${import.meta.env.BASE_URL}shape-logo.png` is, to the bundler, just text.
// Deleting mobile-app/public/shape-logo.png — loaded three times by
// iosAppBroadsheetMain.jsx — leaves `VITE_BASE=/m/ npm run build` exiting 0 with
// the missing file mentioned nowhere in its output. Measured, not assumed.
// The pre-commit hook, the test suite and all four CI jobs are equally blind:
// the only referenced-file-exists check in the repo is build-newdesign.mjs:111,
// and it covers website .jsx script tags. So a commit could delete a live asset
// and every gate would report success.
//
// HOW IT WORKS, AND WHY IT IGNORES COMPOSITION. Assets are reached six different
// ways here — a direct `${BASE_URL}x.png`, a `|| '/'` fallback, a prefix constant
// (`${BS_DEMO_MEDIA}wall-03.webp`), a ternary of two literals interpolated a line
// later, a root-absolute CSS url(), and a fully runtime-composed slug. Parsing
// those compositions would be the fragile part, so this does not parse them: in
// five of the six the LEAF FILENAME is still a literal in the source text, so we
// extract leaves and let resolution do the rest.
//
// ⚠ THE SIXTH FORM CANNOT BE CHECKED, AND THIS IS NOT A GAP THAT CAN BE CLOSED
// BY TRYING HARDER. iosAppBroadsheetClient.jsx:10373 builds face URLs as
// `${BS_FACE_BASE}${slug}.jpg`, where the slug comes from a hash-modulo over an
// array. The string "member-07.jpg" does not exist anywhere in mobile-app/src,
// and "maya.jpg" does not exist anywhere IN THE REPO. A grep-for-basename
// validator is not merely incomplete here, it is WRONG IN BOTH DIRECTIONS:
//   - faces/maya.jpg      -> zero hits -> "unreferenced, safe to delete".
//                            It is referenced ('Maya Okafor': 'maya') and renders
//                            a live avatar. A FALSE CLEAR on a shipped asset.
//   - faces/member-07.jpg -> "referenced" only because the WEBSITE's separate
//                            public/newdesign/faces/member-07.jpg shares a
//                            basename. Right answer, wrong file, no real coverage.
// One line apart in the same object literal. So instead of pretending, the
// reverse pass exempts only an OPAQUE prefix directory — one where not a single
// member was resolved by a literal, which today is `faces/` and not `demo/` — and
// the residual, deleting one member of it, is written down here as undetectable
// rather than papered over with a check that returns noise.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The two env overrides exist so the rules below can be tested against a fixture
// tree instead of asserted by grepping this file's source. Every rule here was
// wrong on its first draft in a way only BEHAVIOUR revealed — a source-shaped
// assertion would have passed on all three.
const SRC = process.env.SHAPE_ASSET_SRC || path.join(ROOT, 'mobile-app', 'src');
const PUBLIC = process.env.SHAPE_ASSET_PUBLIC || path.join(ROOT, 'mobile-app', 'public');

// ⚠ THIS EXTENSION LIST RUNS IN THE RECOGNITION DIRECTION, WHICH IS WHY IT IS
// SAFE WHERE THE HOOK'S OLD ALLOWLISTS WERE NOT. Those lists decided which
// CHANGES DESERVE A GATE, so anything omitted silently skipped its checks. This
// one decides which STRINGS LOOK LIKE AN ASSET REFERENCE: omitting an extension
// means fewer references are verified, never that a broken one we found gets
// waved through. And the omission is not silent either — an asset type we fail
// to recognise has nothing pointing at it, so the reverse pass reports it as
// unaccounted and this script fails until the list is fixed.
const ASSET_EXT = 'png|jpe?g|webp|gif|svg|avif|ico|vrm|mp4|webm|m4a|mp3|woff2?|ttf';
const ASSET_RE = new RegExp(String.raw`[A-Za-z0-9_@][A-Za-z0-9_./-]*\.(?:${ASSET_EXT})\b`, 'g');
// `const BS_DEMO_MEDIA = ${BASE_URL}demo/` — captures the constant NAME and the dir.
const PREFIX_RE =
  /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*`\$\{[^}]*BASE_URL[^}]*\}([A-Za-z0-9_-]+)\/`/g;
// `${BASE_URL}${file}` — a served URL composed from a VARIABLE. The radio logo's
// ternary reaches the DOM this way, a line after it is written.
const INDIRECT_VAR_RE = /BASE_URL[^}]*\}\s*\$\{\s*([A-Za-z0-9_$]+)\s*\}/g;
const SCANNABLE = /\.(mjs|cjs|js|jsx|ts|tsx|css|html)$/;

// ⚠ THIS IS SCOPED TO THE COMPOSED VARIABLE, NOT THE FILE, AND THE FIRST VERSION
// WASN'T — WHICH MADE IT THE LOOSEST RULE HERE. It promoted every asset-shaped
// token in any file containing one `${BASE_URL}${var}`, so adding an unrelated
// upload filename or a comment mentioning `recording.webm` to
// iosAppBroadsheetRadio.jsx failed CI on a string never served from publicDir.
// Reproduced before fixing. That is a failure a developer cannot fix except by
// editing this script — the "cries wolf, gets bypassed" shape the whole file is
// written against. Now only literals assigned to the interpolated variable count.
function indirectLiterals(src) {
  const vars = new Set();
  INDIRECT_VAR_RE.lastIndex = 0;
  let m;
  while ((m = INDIRECT_VAR_RE.exec(src))) vars.add(m[1]);

  const out = new Set();
  for (const v of vars) {
    const assign = new RegExp(String.raw`(?:(?:const|let|var)\s+)?\b${v}\s*=([^;\n]*)`, 'g');
    let a;
    while ((a = assign.exec(src))) {
      const expr = a[1] || '';
      const tok = new RegExp(ASSET_RE.source, 'g');
      let t;
      while ((t = tok.exec(expr))) out.add(t[0].replace(/^\.?\//, ''));
    }
  }
  return out;
}

// ⚠ ONLY *ANCHORED* REFERENCES ARE CHECKED, AND THE FIRST DRAFT OF THIS FILE
// PROVED WHY. Treating every string that ends in an asset extension as a
// reference produced 36 failures on a clean working tree, 35 of them false:
// `fd.append('audio', blob, 'note.webm')` is an UPLOAD filename, `.mp4/.mov/.webm`
// was prose in a comment, and 27 were `url(./assets/fonts/font-01.woff2)`, which
// Vite resolves at build time — so the build already fails if one goes missing.
// A check that cries wolf 35 times gets disabled, which is the same end state as
// a check that never fires.
const DECLARED_UNREFERENCED = {
  'radio-bg.jpg': 'superseded by club-shape-bg.jpg; zero hits repo-wide',
  'shape-wordmark-tight.png': 'zero hits in any source; survives only in old .superpowers diff blobs',
  'assets/shape-logo-triangles-transparent.png':
    'referenced by iosAppBroadsheet.jsx BSLogoMask as ROOT-ABSOLUTE url("/assets/...") — ' +
    'the app is served at /m/, so that never resolves. Currently harmless because ' +
    'BSLogoMask is defined and never rendered. Registered, not fixed here: a ' +
    'root-absolute rule is a different defect class (wrong base) from a missing file.',
};

const norm = (p) => p.split(path.sep).join('/');

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// --- Every file that ships in publicDir -------------------------------------
const publicFiles = walk(PUBLIC).map((f) => norm(path.relative(PUBLIC, f)));
const publicSet = new Set(publicFiles);

const sources = walk(SRC).filter((f) => SCANNABLE.test(f));

// --- Pass 0: the `${BASE_URL}<dir>/` constants ------------------------------
// Collected across EVERY file before any reference is judged: a constant defined
// in one file and used in another would otherwise depend on walk() order.
const prefixByName = new Map(); // constant name -> the directory it prefixes
for (const file of sources) {
  const src = fs.readFileSync(file, 'utf8');
  PREFIX_RE.lastIndex = 0;
  let m;
  while ((m = PREFIX_RE.exec(src))) {
    prefixByName.set(m[1], m[2]);
  }
}

// --- Pass 1: every anchored asset reference must resolve ---------------------
const missing = [];
const resolved = new Set();
let refCount = 0;

for (const file of sources) {
  const src = fs.readFileSync(file, 'utf8');
  const where = norm(path.relative(ROOT, file));
  const indirectVals = indirectLiterals(src);

  ASSET_RE.lastIndex = 0;
  let m;
  while ((m = ASSET_RE.exec(src))) {
    const raw = m[0];
    if (/^(https?|data|blob)/.test(raw)) continue;

    const before = src.slice(Math.max(0, m.index - 60), m.index);
    if (/(?:https?:)?\/\/[^\s'"`)]*$/.test(before)) continue; // inside a URL

    const clean = raw.replace(/^\.?\//, '');
    // A leaf lifted out of `${BS_DEMO_MEDIA}wall-03.webp` has lost its directory
    // on the way here; a direct `${BASE_URL}nora/placeholder.vrm` has not.
    let prefixDir = null;
    for (const [n, d] of prefixByName) {
      if (new RegExp(String.raw`\$\{${n}\}\s*$`).test(before)) { prefixDir = d; break; }
    }
    const anchored =
      prefixDir !== null || indirectVals.has(clean) || /BASE_URL[^}]*\}\s*$/.test(before);
    if (!anchored) continue;

    // Vite resolves a specifier relative to the importing file at BUILD time, so
    // a missing one already breaks `npm run build`. Not this check's problem.
    if (fs.existsSync(path.resolve(path.dirname(file), raw))) continue;

    // ⚠ THERE IS NO BASENAME FALLBACK ANY MORE. Every reference resolves to the
    // EXACT path its URL will request. Two review rounds went into narrowing a
    // fallback that should never have existed: first it cleared
    // nora/placeholder.vrm after that file moved to demo/, then — with
    // path-bearing refs fixed — it STILL cleared a direct
    // `${BASE_URL}shape-logo.png` after that file moved into demo/, because a
    // bare leaf matched any basename anywhere while /m/shape-logo.png 404'd.
    // Both reproduced before fixing. A leaf lifted out of a prefix constant is
    // the only reference with a genuinely unstated directory, and that directory
    // is known — it is the one the constant declares. Resolve it there, nowhere
    // else, and record the FULL path so the orphan pass below cannot be exempted
    // by a bare basename either.
    const target = prefixDir ? `${prefixDir}/${clean}` : clean;
    refCount++;
    if (resolved.has(target) || missing.some((x) => x.ref === target)) continue;
    if (publicSet.has(target)) resolved.add(target);
    else missing.push({ ref: target, where, line: src.slice(0, m.index).split('\n').length });
  }
}

// --- Pass 2: every shipped file must be accounted for ------------------------
//
// ⚠ ONLY *OPAQUE* PREFIX DIRECTORIES ARE EXEMPT, AND THE FIRST VERSION EXEMPTED
// ALL OF THEM — which quietly gutted this pass for `demo/`. Both directories are
// declared through a `${BASE_URL}<dir>/` constant, but only `faces/` composes its
// filenames at runtime; every one of `demo/`'s eight leaves is spelled out at its
// call site (`${BS_DEMO_MEDIA}wall-03.webp`). So `demo/` is enumerable, and
// exempting it meant adding mobile-app/public/demo/orphan.webp still printed OK.
// Reproduced before fixing. A directory is opaque only when NOTHING in it was
// resolved by a literal — if you can name one member you can name them all.
const prefixDirs = new Set(prefixByName.values());
const opaqueDirs = new Set(
  [...prefixDirs].filter(
    (d) => !publicFiles.some((rel) => rel.startsWith(`${d}/`) && resolved.has(rel)),
  ),
);

// `resolved` now holds full publicDir paths, so a bare basename can no longer
// exempt a nested file from this pass — the other half of the fallback defect.
const unaccounted = publicFiles.filter((rel) => {
  const dir = rel.includes('/') ? rel.split('/')[0] : '';
  if (resolved.has(rel)) return false;
  if (dir && opaqueDirs.has(dir)) return false; // runtime-composed; see header
  return !DECLARED_UNREFERENCED[rel];
});

// --- Pass 3: a prefix directory must still exist and hold files --------------
const emptyPrefix = [...prefixDirs].filter((d) => {
  const abs = path.join(PUBLIC, d);
  return !fs.existsSync(abs) || walk(abs).length === 0;
});

// --- Report ------------------------------------------------------------------
if (process.argv.includes('--verbose')) {
  console.log(`${refCount} anchored references, ${publicFiles.length} public files`);
  console.log(`prefix dirs: ${[...prefixDirs].join(', ') || '(none)'} | opaque (unenumerable): ${[...opaqueDirs].join(', ') || '(none)'}`);
  console.log(`resolved: ${[...resolved].sort().join(', ')}`);
}

let bad = 0;
if (missing.length) {
  bad = 1;
  console.error('\nBROKEN ASSET REFERENCES — the source points at a file that is not in mobile-app/public:');
  for (const x of missing) console.error(`  ${x.ref}\n      referenced at ${x.where}:${x.line}`);
}
if (unaccounted.length) {
  bad = 1;
  console.error('\nUNACCOUNTED PUBLIC FILES — shipped, but nothing in mobile-app/src reaches them:');
  for (const u of unaccounted) console.error(`  ${u}`);
  console.error('  Either reference it, or add it to DECLARED_UNREFERENCED in this script with a reason.');
}
if (emptyPrefix.length) {
  bad = 1;
  console.error('\nEMPTY PREFIX DIRECTORY — a `${BASE_URL}<dir>/` constant points at nothing:');
  for (const d of emptyPrefix) console.error(`  ${d}/`);
}

if (bad) {
  console.error(
    `\nNote: this check CANNOT see individual members of a runtime-composed directory ` +
      `(${[...opaqueDirs].join(', ') || 'none'}) — those filenames never appear as literals ` +
      `in the source, so nothing can verify them. See the header.`,
  );
  process.exit(1);
}
if (process.argv.includes('--verbose')) console.log('OK');
