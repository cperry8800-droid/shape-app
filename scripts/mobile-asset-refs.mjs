#!/usr/bin/env node
// Fail the build when the emitted mobile bundle requests an asset that is not in dist/.
//
// WHY THIS EXISTS
// Deleting a file from mobile-app/public/ passes EVERY other gate. Measured: with
// shape-logo.png moved out, `VITE_BASE=/m/ npm run build` exits 0 without naming it, the
// emitted bundle still requests /m/shape-logo.png?v=2 three times, and dist/ does not
// contain it. tsc, next build, gitleaks and the test suite are all blind to it. The first
// sign is a broken image in the running app.
//
// WHY IT CHECKS THE ARTIFACT AND NOT THE SOURCE
// A previous attempt scanned source and was CUT before merge (783 insertions, pinned at tag
// parked/asset-refs-checker). It decided code-vs-comment with a line-local regex -- a lexing
// problem a regex cannot solve -- and shipped two FALSE ALARM classes: a commented-out
// reference read as live, and a commented-out composition sitting above a live one. Red CI on
// a correct tree teaches --no-verify, which also disables the mount tests.
// Scanning dist/ makes both classes structurally impossible: the bundler strips comments and
// tree-shakes dead code BEFORE we look, so a reference that survives into the artifact is by
// definition a live reference. (Proven incidentally: the dead BSLogoMask asset and styles.css's
// radio-bg.png are both tree-shaken out, so this never sees them -- the source checker needed a
// hand-written exemption for one of them.)
// dist/ is also the chokepoint all four consumers copy from -- `npx cap sync` into android/ and
// ios/, and build-m.sh into public/m -- so checking it covers all four. Same reasoning that put
// the sourcemap strip in vite.config.ts rather than in one consumer's script.
//
// SCOPE, STATED HONESTLY
// This checks REFERENCES THAT SURVIVE AS ROOTED LITERALS -- 7 of the 33 files in
// mobile-app/public/, including shape-logo.png, the case that motivated the gate.
// It does NOT catch:
//   - faces/*.jpg (13) -- the filename is computed (`${BS_FACE_BASE}${slug}.jpg`) and appears
//     nowhere in the artifact as a literal.
//   - demo/*.webp (8) and shape-radio-logo{,-lt}.png (2) -- the basename is present but the base
//     is composed at RUNTIME, so there is no rooted literal to anchor on. Pairing a stray
//     "/m/demo/" literal with a bare "wall-03.webp" is exactly the composition-guessing that
//     produced the parked checker's false alarms. Do not add it.
//   - orphaned files (the reverse direction) -- deliberately out of scope; that is what needed
//     the parked checker's three declared maps and their staleness machinery.
// A flat "these files must exist" list is the honest way to cover the other 10, as its own change.
//
// No dependencies -- node builtins only. In particular NOT @babel/parser, which is in neither
// manifest and whose install would regenerate mobile-app/package-lock.json, the lockfile
// codemagic.yaml consumes to build the iOS TestFlight IPA on every push to main.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const DIST = process.argv[2] || join('mobile-app', 'dist');
const ASSET_EXT =
  'png|jpe?g|webp|gif|svg|ico|avif|bmp|vrm|glb|gltf|mp3|mp4|webm|ogg|wav|woff2?|ttf|otf|eot|pdf';
const SCAN_EXT = /\.(js|mjs|cjs|css|html)$/i;

function fail(msg) {
  console.error(`\n✗ asset-refs: ${msg}\n`);
  process.exit(1);
}

/**
 * Read the base off the emitted entry tag rather than off VITE_BASE, so the gate is never told
 * which build it is inspecting. `/m/` for the hosted web build, `./` for the native build.
 */
function detectBase() {
  const indexPath = join(DIST, 'index.html');
  if (!existsSync(indexPath)) fail(`no index.html in ${DIST} — build first`);
  const html = readFileSync(indexPath, 'utf8');
  const m = html.match(/<script[^>]+src="([^"]*assets\/[^"]+)"/);
  if (!m) fail(`could not find the entry <script> tag in ${indexPath}`);
  return m[1].slice(0, m[1].indexOf('assets/'));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(name)) out.push(p);
  }
  return out;
}

/**
 * Map a reference back to a path under dist/.
 * ⚠ CSS is the trap, and it cost a prototype 26 false alarms on a CLEAN native build: under the
 * relative `./` base a url() in dist/assets/x.css resolves against the STYLESHEET's directory,
 * while the same literal in JS/HTML resolves against the DOCUMENT (dist root). Absolute bases
 * are unambiguous. Do not re-derive this.
 */
function toDistPath(ref, fromFile, base, isCss) {
  const clean = ref.split(/[?#]/)[0];
  if (base.startsWith('/')) return clean.slice(base.length);
  const bare = clean.replace(/^\.\//, '');
  if (!isCss) return bare;
  const dir = relative(DIST, dirname(fromFile));
  return dir ? `${dir.split(sep).join('/')}/${bare}` : bare;
}

const base = detectBase();
const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const refRe = new RegExp(`${escaped}[A-Za-z0-9_\\-./]+?\\.(?:${ASSET_EXT})(?:\\?[A-Za-z0-9_=&.\\-]*)?`, 'gi');

const missing = new Map(); // ref -> Set(requesting files)
let checked = 0;

for (const file of walk(DIST)) {
  const isCss = /\.css$/i.test(file);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(refRe)) {
    const ref = match[0];
    checked++;
    const target = join(DIST, toDistPath(ref, file, base, isCss));
    if (existsSync(target)) continue;
    const where = relative(DIST, file).split(sep).join('/');
    if (!missing.has(ref)) missing.set(ref, new Set());
    missing.get(ref).add(where);
  }
}

if (missing.size > 0) {
  console.error(`\n✗ asset-refs: ${missing.size} asset reference(s) in the built bundle do not resolve in ${DIST}\n`);
  for (const [ref, files] of missing) {
    console.error(`   ${ref}`);
    for (const f of files) console.error(`      requested by ${f}`);
  }
  console.error(
    '\n   The bundle asks for a file the build did not emit. Either:\n' +
      '     • restore the missing file under mobile-app/public/, or\n' +
      '     • update the reference in mobile-app/src/ to point at a file that exists.\n' +
      '   A reference that survives into the bundle is live code — this is not a false alarm\n' +
      '   from a comment or a dead branch; the bundler removed those before this ran.\n'
  );
  process.exit(1);
}

console.log(`✓ asset-refs: ${checked} rooted asset reference(s) resolve in ${DIST} (base "${base}")`);
