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

// RUNTIME_COMPOSED names files the real repo must ship, and the checker now
// REQUIRES them — so every fixture seeds them or each one fails for a reason
// unrelated to what it is testing. Derived from the script rather than hardcoded
// here, so the two cannot drift apart.
function requiredComposed() {
  const src = readFileSync(SCRIPT, 'utf8');
  const block = src.match(/const RUNTIME_COMPOSED = \{([\s\S]*?)\n\};/);
  return (block?.[1].match(/^\s*'([^']+)':/gm) || []).map((l) => l.match(/'([^']+)'/)[1]);
}

// Build a throwaway src/ + public/ pair and run the real checker against it. Every
// rule these exercise was WRONG on a first draft in a way only behaviour exposed —
// a source-shaped assertion would have passed on all of them.
function fixture({ src = {}, pub = {}, seedComposed = true }) {
  const dir = mkdtempSync(join(tmpdir(), 'shape-assets-'));
  const write = (root, files) => {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
  };
  write(join(dir, 'src'), src);
  const seeded = seedComposed
    ? Object.fromEntries(requiredComposed().map((r) => [r, 'x']))
    : {};
  write(join(dir, 'public'), { ...seeded, ...pub });
  const res = run({ SHAPE_ASSET_SRC: join(dir, 'src'), SHAPE_ASSET_PUBLIC: join(dir, 'public') });
  rmSync(dir, { recursive: true, force: true });
  return res;
}

const BASE = '${import.meta.env.BASE_URL}';

test('the working tree passes — every asset reference resolves', () => {
  const { code, out } = run();
  assert.equal(code, 0, `mobile-asset-refs failed on a clean tree:\n${out}`);
});

test('both anchoring forms still resolve', () => {
  // Each reaches publicDir a DIFFERENT way through a separate matcher that can
  // break on its own. Pinning one anchor per form means a broken matcher turns
  // the suite red instead of quietly shrinking the checked set.
  const { out } = run();
  const anchors = {
    'shape-logo.png': 'direct `${import.meta.env.BASE_URL}x.png` interpolation',
    'nora/placeholder.vrm': 'direct interpolation carrying a subdirectory',
    'demo/wall-03.webp': 'prefix constant (`${BS_DEMO_MEDIA}wall-03.webp`) — the PREFIX_RE path',
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

test('a `${BASE_URL}${var}` composition raises no false alarm', () => {
  // ⚠ TWO ATTEMPTS AT FORWARD-CHECKING THIS FORM BOTH FAILED THE SAME WAY. The
  // first anchored every asset-shaped token in any file containing one such
  // composition; the second narrowed to literals assigned to the interpolated
  // NAME, which still had no notion of scope — so an unrelated `const file` in
  // ANOTHER FUNCTION of the same module failed CI on a string never served from
  // publicDir. Both reproduced. Resolving it properly needs binding analysis and
  // this script runs on node builtins by design, so the form is not checked and
  // its two real files are named in RUNTIME_COMPOSED instead.
  //
  // What must never regress is the false ALARM: a developer cannot fix a failure
  // that lives inside the checker, so they bypass the hook instead.
  const src = {
    'r.jsx':
      'function Wordmark(t) {\n' +
      "  const file = t.light ? 'lt.png' : 'dk.png';\n" +
      '  return `' + BASE + '${file}`;\n' +
      '}\n' +
      'function upload(blob) {\n' +
      "  const file = 'recording.webm';\n" +
      '  fd.append("audio", blob, file);\n' +
      '}\n',
  };
  const res = fixture({ src, pub: {} });
  assert.equal(
    res.code,
    0,
    `a runtime-composed reference must not be reported as a missing public asset:\n${res.out}`,
  );
});

test('a file next to the source cannot satisfy a publicDir URL', () => {
  // ⚠ A relative-resolve escape used to skip any anchored reference whose name
  // matched a file beside the source module. It was written for build-time
  // specifiers Vite resolves itself, but those are never BASE_URL-anchored — so
  // it could only ever fire where it must not: `${BASE_URL}logo.png` with a
  // src/logo.png and no public/logo.png reported "0 anchored references" and
  // exited 0 while /m/logo.png 404'd. Reproduced.
  const res = fixture({
    src: { 'a.jsx': 'const u = `' + BASE + 'logo.png`;', 'logo.png': 'not the public one' },
    pub: {},
  });
  assert.equal(
    res.code,
    1,
    `a source-local file must not satisfy a publicDir URL:\n${res.out}`,
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

test('every exempted asset carries a reason', () => {
  // Both escape hatches have to cost something. An entry with an empty reason is
  // how an exemption list becomes a place to silence the check, and there are now
  // three of them: files nothing reaches, files reached by a composition this
  // script deliberately does not parse, and directories whose members are
  // composed at runtime.
  const src = readFileSync(SCRIPT, 'utf8');
  for (const name of ['DECLARED_UNREFERENCED', 'RUNTIME_COMPOSED', 'OPAQUE_DIRS']) {
    const block = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
    assert.ok(block, `could not locate ${name}`);
    const entries = block[1].match(/'[^']+':\s*(?:'[^']*'|\n?\s*'[\s\S]*?')/g) || [];
    assert.ok(entries.length > 0, `${name} should list its exempted assets`);
    for (const entry of entries) {
      const reason = entry.slice(entry.indexOf(':') + 1).replace(/['\s+]/g, '');
      assert.ok(
        reason.length > 20,
        `an exempted asset in ${name} needs a real reason, got: ${entry.slice(0, 80)}`,
      );
    }
  }
});

test('a declared runtime-composed asset must still EXIST', () => {
  // ⚠ THIS WAS A REGRESSION, NOT A GAP. Naming these files as unverifiable
  // removed them from the forward scan AND exempted them from the reverse pass,
  // so deleting shape-radio-logo.png left neither pass looking at it and the
  // checker exited 0 while BSRadioLogo still requested the URL — strictly worse
  // than the scope-blind scan it replaced. The map enumerates exact paths, so
  // asserting them needs no analysis at all.
  assert.equal(fixture({ src: {}, pub: {} }).code, 0, 'seeded manifest should pass');
  const res = fixture({ src: {}, pub: {}, seedComposed: false });
  assert.equal(res.code, 1, `a missing declared asset must fail:\n${res.out}`);
  assert.match(res.out, /MISSING RUNTIME-COMPOSED ASSET/, 'and must say so by name');
});

test('opacity is DECLARED, so a directory cannot flip itself exempt', () => {
  // ⚠ Deriving opacity from "nothing in it resolved" described the current
  // snapshot, not how filenames are composed. Removing the last literal
  // `${BS_DEMO_MEDIA}...` reference while leaving demo/ and its files in place
  // reclassified the directory as opaque and exempted every newly-orphaned
  // asset while exiting 0 — the pass switching itself off exactly when its
  // subject appears.
  const noLiterals = { 'a.jsx': 'const P = `' + BASE + 'demo/`;' };
  const res = fixture({ src: noLiterals, pub: { 'demo/wall.webp': 'x', 'demo/orphan.webp': 'x' } });
  assert.equal(res.code, 1, `an undeclared directory must not become exempt:\n${res.out}`);

  // The declared one stays exempt on the same shape, because it earned it.
  const declared = { 'a.jsx': 'const P = `' + BASE + 'faces/`;\nconst u = `${P}${slug}.jpg`;' };
  assert.equal(
    fixture({ src: declared, pub: { 'faces/a.jpg': 'x', 'faces/b.jpg': 'x' } }).code,
    0,
    'a declared runtime-composed directory must stay exempt',
  );
});

test('the hook classifies an ADDED public asset, not only a deleted one', () => {
  // ⚠ Staging only `mobile-app/public/demo/orphan.webp` used to print
  // "no code staged (docs/config only) — OK": the deletion arm covers removals,
  // but an ADDED asset matched none of the mobile-input patterns, so the local
  // verifier gave a false pass on exactly the addition the orphan pass exists to
  // catch. CI rejected it; the hook did not, which is the gap that teaches people
  // to trust the hook.
  const hook = readFileSync(join(ROOT, 'scripts', 'verify-staged.sh'), 'utf8');
  const arm = hook.match(/mobile-app\/src\/\*[\s\S]*?\)\n/);
  assert.ok(arm, 'could not locate the mobile-input case arm');
  assert.match(
    arm[0],
    /mobile-app\/public\/\*/,
    'mobile-app/public/* must set mobile_changed so an added asset reaches the reference check',
  );
});
