// The mobile bundle's SHARED INPUTS — the files outside mobile-app/ that Vite
// still bundles into the app.
//
// WHY THIS FILE EXISTS: scripts/verify-staged.sh used to decide "does this
// change need a mobile build?" by matching path prefixes, but the bundle's real
// input set is the import graph. mobile-app/src reaches out of its own tree 18
// times. Staging only one of those files ran the parser and the suite and
// skipped the mobile build — the one check that catches a renamed export or a
// deleted module — and the hook still printed "all checks passed".
//
// scripts/mobile-bundle-inputs.mjs closes that by DERIVING the set. But a
// deriver is itself a check that can fail silently: if it stops resolving and
// returns nothing, every staged file trivially "isn't a shared input", the
// mobile build is skipped for all of them, and the hook goes back to reporting
// success on unverified code — with no error anywhere. An empty result is
// indistinguishable from a clean one.
//
// So these tests exist to make EMPTY LOUD. They pin anchors that must remain in
// the graph, including a second-hop one, so that a refactor which quietly breaks
// resolution turns the suite red instead of turning the check off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'mobile-bundle-inputs.mjs');

function derive() {
  const out = execFileSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

test('the shared-input set is non-empty', () => {
  const inputs = derive();
  assert.ok(
    inputs.length > 0,
    'the deriver returned NOTHING. Mobile has imported out of its own tree since the ' +
      'Broadsheet split, so an empty set means resolution broke — not that the coupling ' +
      'went away. Left unchecked this silently disables the mobile-build trigger in ' +
      'scripts/verify-staged.sh for every file.',
  );
});

test('first-hop imports are found', () => {
  const inputs = derive();
  // Both are imported directly by a mobile source with an explicit ../../../
  // specifier, so losing either means the walker stopped following plain
  // static imports.
  for (const anchor of ['public/newdesign/noraStage.mjs', 'src/lib/sentry-context.mjs']) {
    assert.ok(
      inputs.includes(anchor),
      `${anchor} is imported directly by a mobile source but is missing from the derived set`,
    );
  }
});

test('TRANSITIVE imports are found, not just the first hop', () => {
  const inputs = derive();
  // public/newdesign/spotlightGeom.mjs is NOT imported by any mobile source.
  // It is reached only via public/newdesign/spotlightTour.js, which two mobile
  // files import. If the walker ever stops recursing, this is the assertion
  // that notices — a one-hop scan of mobile-app/src finds 15 files, the real
  // closure is 18, and the 3 it misses are exactly this shape.
  assert.ok(
    inputs.includes('public/newdesign/spotlightGeom.mjs'),
    'spotlightGeom.mjs is a SECOND-HOP dependency (mobile -> spotlightTour.js -> spotlightGeom.mjs). ' +
      'Its absence means the deriver stopped following the graph past the first hop, so any ' +
      'change to a transitively-bundled module would skip the mobile build.',
  );
});

test('every derived path actually exists', () => {
  for (const rel of derive()) {
    assert.ok(existsSync(join(ROOT, rel)), `derived a path that is not on disk: ${rel}`);
  }
});

test('nothing inside mobile-app/ leaks into the set', () => {
  // The set feeds a branch that only runs when the mobile-app/ arms did NOT
  // match. A mobile-app/ path in here would be dead weight at best and, if the
  // arms ever change, a confusing second source of truth.
  for (const rel of derive()) {
    assert.ok(!rel.startsWith('mobile-app/'), `mobile-app path leaked into the shared set: ${rel}`);
  }
});

test('the hook consults the deriver and refuses to treat failure as "none"', () => {
  // Source-level, because the two files can drift independently: the deriver
  // could be perfect while the hook quietly stops calling it, or calls it and
  // swallows the error. Either way the trigger is off and nothing says so.
  const hook = readFileSync(join(ROOT, 'scripts', 'verify-staged.sh'), 'utf8');
  assert.match(
    hook,
    /scripts\/mobile-bundle-inputs\.mjs/,
    'verify-staged.sh must call the deriver — path-prefix arms alone miss shared bundle inputs',
  );
  assert.match(
    hook,
    /shared-input set came back EMPTY/,
    'verify-staged.sh must FAIL on an empty derived set. Treating empty as "no shared inputs" ' +
      'turns the check off in a way that looks exactly like a clean run.',
  );
  assert.match(
    hook,
    /could not derive the mobile bundle's shared inputs/,
    'verify-staged.sh must FAIL when the deriver exits non-zero, rather than falling back to empty',
  );
});

test('the hook classifies what a commit DELETES, not only what it adds', () => {
  // A deleted file is invisible to the deriver by construction — it walks the
  // WORKING TREE, where the now-broken import resolves to nothing. So deletions
  // need their own arm, and this test exists because both halves of that were
  // wrong at once: `--diff-filter=ACM` dropped deletions entirely, so a
  // deletion-only commit ran NOTHING (no tsc, no suite, no build) and exited 0,
  // and a mixed commit that removed a shared module skipped the mobile build
  // that would have caught the unresolved import.
  const hook = readFileSync(join(ROOT, 'scripts', 'verify-staged.sh'), 'utf8');
  assert.match(
    hook,
    /--diff-filter=D/,
    'verify-staged.sh must collect deleted paths — a deletion-only commit otherwise exits having run nothing',
  );
  assert.match(
    hook,
    /--no-renames/,
    "--no-renames decomposes a rename into delete+add so the OLD path is seen; " +
      "with rename detection on, --name-only prints only the new path and the removal is invisible",
  );
  // The early-exit must require BOTH lists empty. `#STAGED -eq 0 && exit 0`
  // alone is exactly the deletion-only hole.
  assert.match(
    hook,
    /\[ "\$\{#STAGED\[@\]\}" -eq 0 \]\s*&&\s*\[ "\$\{#DELETED\[@\]\}" -eq 0 \]\s*&&\s*exit 0/,
    'the early exit must require BOTH the added/modified AND the deleted list to be empty',
  );
});
