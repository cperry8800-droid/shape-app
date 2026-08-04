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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'mobile-asset-refs.mjs');

function run() {
  try {
    return { code: 0, out: execFileSync(process.execPath, [SCRIPT, '--verbose'], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

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
