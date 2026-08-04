#!/usr/bin/env node
// Print every file OUTSIDE mobile-app/ that the mobile bundle actually pulls in,
// one repo-relative path per line.
//
// WHY THIS EXISTS: scripts/verify-staged.sh decides whether to run the mobile
// build by matching staged paths against `mobile-app/...` prefixes. But Vite's
// input set is the IMPORT GRAPH, not a directory. mobile-app/src reaches out of
// its own tree 15 times today — iosAppBroadsheetRadio.jsx imports
// ../../../public/newdesign/noraStage.mjs, sentry.mjs imports
// ../../../src/lib/sentry-context.mjs, and so on. Staging only one of those
// files set code_changed (so the parser and the suite ran) but never set
// mobile_changed, so the one check that would catch a renamed export or a
// deleted module was skipped, and the hook printed "all checks passed".
//
// Why derive instead of widening the case arm to the directories: public/newdesign
// holds 306 tracked files and is one of the hottest trees in the repo, while only
// 13 of them are reachable from mobile. A directory arm would put a full mobile
// build on the critical path of nearly every commit — and a hook that is slow
// enough to resent is a hook that gets --no-verify'd, which is how the mount
// tests got disabled in the first place.
//
// ⚠ THIS IS AN APPROXIMATION OF VITE'S RESOLVER, AND IT UNDER-APPROXIMATES.
// It follows static and dynamic specifiers that are string literals, and it
// resolves extensions and index files the way Vite's defaults do. It does NOT
// know about tsconfig path aliases, package `exports` maps, or any specifier
// built at runtime. Every one of those makes it report FEWER files than the real
// bundle uses — the same "silently under-triggers" direction as the bug it fixes.
// tests/mobile-bundle-inputs.test.mjs is the backstop: it fails if this script
// returns nothing, and it pins the anchors below so a refactor that quietly
// empties the graph turns the suite red instead of turning the check off.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = path.join(ROOT, 'mobile-app');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'ios', 'android', '.git', 'coverage']);
const EXTS = ['', '.mjs', '.js', '.jsx', '.ts', '.tsx', '.cjs', '.json'];
const SCANNABLE = /\.(mjs|cjs|js|jsx|ts|tsx|html)$/;

const norm = (p) => p.split(path.sep).join('/');

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCANNABLE.test(e.name)) out.push(p);
  }
  return out;
}

// Resolve a relative specifier the way Vite's defaults do: exact file, then
// bare-name + extension, then directory/index + extension.
function resolve(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of EXTS) {
    const c = base + ext;
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  for (const ext of EXTS.slice(1)) {
    const c = path.join(base, 'index' + ext);
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// `from '...'`, `import('...')`, `import '...'`, and `export ... from '...'`.
// Only relative specifiers can leave the tree, so bare package names are skipped
// by the pattern itself.
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'](\.\.?\/[^"']*)["']/g;

const seen = new Set();
const external = new Set();
const queue = walk(path.join(MOBILE, 'src'));
for (const html of walk(MOBILE).filter((f) => f.endsWith('.html') && !norm(f).includes('/src/'))) {
  queue.push(html);
}

while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);

  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  SPEC_RE.lastIndex = 0;
  let m;
  while ((m = SPEC_RE.exec(src))) {
    const target = resolve(file, m[1]);
    if (!target) continue;
    const rel = norm(path.relative(ROOT, target));
    if (rel.startsWith('..')) continue; // outside the repo entirely
    const inMobile = rel.startsWith('mobile-app/');
    if (!inMobile) external.add(rel);
    // Follow it either way: a file in public/newdesign can import another one,
    // and that transitive node is in the bundle just as much as the first hop.
    if (SCANNABLE.test(target) && !seen.has(target)) queue.push(target);
  }
}

for (const f of [...external].sort()) console.log(f);
