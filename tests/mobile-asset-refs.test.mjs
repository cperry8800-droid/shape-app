// scripts/mobile-asset-refs.mjs is the ONLY thing in this repo that can see a
// deleted mobile publicDir asset. Vite copies publicDir verbatim and never
// resolves a runtime template string, so `VITE_BASE=/m/ npm run build` exits 0
// with mobile-app/public/shape-logo.png removed and never mentions it; the hook,
// the suite and all four CI jobs are equally blind.
//
// WHICH MAKES ITS SILENT FAILURE MODE THE DANGEROUS ONE — the same shape as the
// deriver these tests already guard. If the anchoring regexes stop matching, the
// checker finds ZERO references, every one of them trivially resolves, and it
// exits 0 forever: a green check that verifies nothing, indistinguishable from a
// clean run. So these tests pin the anchors rather than the exit code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'mobile-asset-refs.mjs');

function run(env = {}) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--verbose'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

// Build a throwaway src/ + public/ pair and run the real checker against it. Each
// of the three rules below was WRONG on its first draft in a way only behaviour
// exposed — a source-shaped assertion would have passed on all three.
function fixture({ src = {}, pub = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'shape-assets-'));
  const write = (root, files) => {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
  };
  write(join(dir, 'src'), src);
  write(join(dir, 'public'), pub);
  const res = run({ SHAPE_ASSET_SRC: join(dir, 'src'), SHAPE_ASSET_PUBLIC: join(dir, 'public') });
  rmSync(dir, { recursive: true, force: true });
  return res;
}

const BASE = '${import.meta.env.BASE_URL}';

test('the working tree passes — every asset reference resolves', () => {
  const { code, out } = run();
  assert.equal(code, 0, `mobile-asset-refs failed on a clean tree:\n${out}`);
});

test('the three anchoring forms all still resolve', () => {
  // Each of these reaches publicDir a DIFFERENT way, and each way is a separate
  // regex that can break on its own. Pinning one anchor per form means a broken
  // matcher turns the suite red instead of quietly shrinking the checked set.
  const { out } = run();
  const anchors = {
    'shape-logo.png': 'direct `${import.meta.env.BASE_URL}x.png` interpolation',
    'nora/placeholder.vrm': 'direct interpolation carrying a subdirectory',
    'wall-03.webp': 'prefix constant (`${BS_DEMO_MEDIA}wall-03.webp`) — the PREFIX_RE path',
    'shape-radio-logo.png': 'indirect `${BASE_URL}${file}` composition — the INDIRECT_RE path',
  };
  for (const [ref, how] of Object.entries(anchors)) {
    assert.ok(
      out.includes(ref),
      `${ref} is no longer resolved by the checker (${how}). Its matcher broke, so every ` +
        'reference of that form is now unverified — and an unverified reference is exactly ' +
        'what this script exists to catch.',
    );
  }
});

test('the checker is not finding a trivially small reference set', () => {
  // Belt and braces on the same failure: a matcher can degrade without dropping
  // one of the four pinned anchors. The real tree carries ~23 anchored
  // references; a floor well under that still catches a collapse to near-zero.
  const { out } = run();
  const m = out.match(/^(\d+) anchored references/m);
  assert.ok(m, `the checker did not report its reference count:\n${out}`);
  assert.ok(
    Number(m[1]) >= 15,
    `only ${m[1]} anchored references found (expected 15+). The extraction is degrading — ` +
      'every reference it stops recognising is one it silently stops verifying.',
  );
});

test('the checker is enforced by CI, not only by the bypassable hook', () => {
  // The pre-commit hook is skippable (SKIP_VERIFY=1) and only armed on a machine
  // that ran the SessionStart hook. A check nothing enforces is not a gate — the
  // same reason the mount tests sat unenforced until a CI job ran them.
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(
    ci,
    /scripts\/mobile-asset-refs\.mjs/,
    'ci.yml must run mobile-asset-refs.mjs — the mobile build alone cannot see a deleted ' +
      'publicDir asset, so without this step CI reports success on a missing live asset',
  );
  const hook = readFileSync(join(ROOT, 'scripts', 'verify-staged.sh'), 'utf8');
  assert.match(
    hook,
    /scripts\/mobile-asset-refs\.mjs/,
    'verify-staged.sh must run mobile-asset-refs.mjs when the mobile build runs',
  );
});

test('a deleted asset that the source still points at FAILS', () => {
  // The whole reason this script exists: `vite build` exits 0 on exactly this.
  const src = { 'a.jsx': 'const u = `' + BASE + 'logo.png`;' };
  assert.equal(fixture({ src, pub: { 'logo.png': 'x' } }).code, 0, 'present asset should pass');
  assert.equal(fixture({ src, pub: {} }).code, 1, 'a reference with no file must fail');
});

test('indirect anchoring is scoped to the composed VARIABLE, not the whole file', () => {
  // ⚠ The first draft promoted every asset-shaped token in any file containing
  // one `${BASE_URL}${var}`, so an unrelated upload filename failed CI on a
  // string never served from publicDir — a failure a developer cannot fix except
  // by editing the checker, which is how a check earns a permanent --no-verify.
  const src = {
    'r.jsx':
      "const file = t.light ? 'lt.png' : 'dk.png';\n" +
      'const url = `' + BASE + '${file}`;\n' +
      "fd.append('audio', blob, 'recording.webm');\n",
  };
  const res = fixture({ src, pub: { 'lt.png': 'x', 'dk.png': 'x' } });
  assert.equal(
    res.code,
    0,
    `an upload filename in the same file must not be treated as a public asset:\n${res.out}`,
  );
  // ...but the literals that DO flow into the composition are still verified.
  assert.equal(
    fixture({ src, pub: { 'lt.png': 'x' } }).code,
    1,
    'a literal assigned to the interpolated variable must still be checked',
  );
});

test('every reference resolves to the EXACT path its URL requests', () => {
  // ⚠ TWO ROUNDS OF REVIEW WENT INTO KILLING A BASENAME FALLBACK THAT SHOULD
  // NEVER HAVE EXISTED, so both halves are pinned here.
  //
  // Round 1: a path-bearing ref was cleared after the file moved directory —
  // /m/nora/thing.vrm broken, check green, because some file had that basename.
  const pathBearing = { 'a.jsx': 'const u = `' + BASE + 'nora/thing.vrm`;' };
  assert.equal(fixture({ src: pathBearing, pub: { 'nora/thing.vrm': 'x' } }).code, 0);
  assert.equal(
    fixture({ src: pathBearing, pub: { 'other/thing.vrm': 'x' } }).code,
    1,
    'a reference that states its directory must match THAT directory',
  );

  // Round 2: fixing that left the root case open — a bare leaf still matched any
  // basename anywhere, so moving a root asset into a subdirectory kept the check
  // green while /m/logo.png 404'd. A direct root reference needs a root match.
  const rootRef = { 'a.jsx': 'const u = `' + BASE + 'logo.png`;' };
  assert.equal(fixture({ src: rootRef, pub: { 'logo.png': 'x' } }).code, 0);
  assert.equal(
    fixture({ src: rootRef, pub: { 'demo/logo.png': 'x' } }).code,
    1,
    'a root reference must not be satisfied by a nested file of the same name',
  );

  // The one genuinely unstated directory — a leaf lifted out of a prefix
  // constant — resolves against the directory that constant declares, and only
  // that one.
  const prefixLeaf = { 'a.jsx': 'const P = `' + BASE + 'demo/`;\nconst u = `${P}wall.webp`;' };
  assert.equal(fixture({ src: prefixLeaf, pub: { 'demo/wall.webp': 'x' } }).code, 0);
  assert.equal(
    fixture({ src: prefixLeaf, pub: { 'wall.webp': 'x' } }).code,
    1,
    "a prefix leaf must resolve inside its prefix's directory, not at the root",
  );
});

test('only an UNENUMERABLE prefix directory is exempt from the orphan check', () => {
  // ⚠ The first draft exempted every `${BASE_URL}<dir>/` directory, which gutted
  // the reverse pass for `demo/` — whose leaves are all spelled out at their call
  // sites. A directory is opaque only when NOTHING in it resolved by a literal.
  const enumerable = {
    'a.jsx': 'const P = `' + BASE + 'demo/`;\nconst u = `${P}wall.webp`;',
  };
  assert.equal(
    fixture({ src: enumerable, pub: { 'demo/wall.webp': 'x' } }).code,
    0,
    'a fully-referenced prefix directory should pass',
  );
  assert.equal(
    fixture({ src: enumerable, pub: { 'demo/wall.webp': 'x', 'demo/orphan.webp': 'x' } }).code,
    1,
    'an orphan in an ENUMERABLE prefix directory must be reported',
  );

  // The genuinely runtime-composed shape stays exempt — that is the honest gap.
  const opaque = { 'a.jsx': 'const P = `' + BASE + 'faces/`;\nconst u = `${P}${slug}.jpg`;' };
  assert.equal(
    fixture({ src: opaque, pub: { 'faces/a.jpg': 'x', 'faces/b.jpg': 'x' } }).code,
    0,
    'a directory whose filenames are composed at runtime cannot be enumerated, ' +
      'so its members must not be reported as orphans',
  );
});

test('every declared-unreferenced asset carries a reason', () => {
  // The escape hatch has to cost something. An entry with an empty reason is how
  // a dead-asset list becomes a place to silence the check.
  const src = readFileSync(SCRIPT, 'utf8');
  const block = src.match(/const DECLARED_UNREFERENCED = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'could not locate DECLARED_UNREFERENCED');
  const entries = block[1].match(/'[^']+':\s*(?:'[^']*'|\n?\s*'[\s\S]*?')/g) || [];
  assert.ok(entries.length > 0, 'DECLARED_UNREFERENCED should list the known-dead assets');
  for (const entry of entries) {
    const reason = entry.slice(entry.indexOf(':') + 1).replace(/['\s+]/g, '');
    assert.ok(
      reason.length > 20,
      `a declared-unreferenced asset needs a real reason, got: ${entry.slice(0, 80)}`,
    );
  }
});
