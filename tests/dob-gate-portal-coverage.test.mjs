// Every portal page a member lands on must carry the date-of-birth gate.
//
// ⚠ THE TAG IS NOT IN THE COMMITTED HTML. scripts/build-newdesign.mjs injects it
// at deploy, the same rail sentryInit.js rides — so this file asserts the RULE
// that produces the coverage, not the artifact. Scanning the pages for a literal
// `dobGate.js` would report zero on a perfectly correct tree.
//
// Why the rule rather than a hand-added tag: a per-page list is one the next page
// silently fails to join, and it turns a one-line change into a 73-file diff (big
// enough that the review gate skips it entirely). Injected at the chokepoint,
// coverage is a property of the build.
//
// globalChatButton.js is the anchor because it is the portal's de-facto signed-in
// global — the closest available proxy for "a page a member actually lands on".
// It is a proxy, not a definition, which is why the pages that fall outside it are
// named individually below rather than pattern-matched away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'newdesign');
const BUILD = readFileSync(join(ROOT, 'scripts', 'build-newdesign.mjs'), 'utf8');

// Pages with no chat-button anchor, each for a stated reason. Anything that falls
// outside the rule has to be added here deliberately.
const EXEMPT = new Set([
  'NutritionistPublic.html', // ~1KB public-profile redirect stub, no member session
  'TrainerPublic.html',      // ~1KB public-profile redirect stub, no member session
  'chatPopout.html',         // popout child window; its opener already carries the gate
]);

const pages = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const hasAnchor = (p) => readFileSync(join(DIR, p), 'utf8').includes('globalChatButton.js');

test('the corpus is real — this test cannot pass vacuously', () => {
  // A glob that silently returned nothing would make every assertion below true.
  assert.ok(pages.length > 50, `expected the full portal, found ${pages.length} pages`);
  assert.ok(pages.filter(hasAnchor).length > 50, 'expected most pages to carry the anchor');
});

test('the precompile injects the gate, anchored on the chat button', () => {
  const src = stripComments(BUILD);
  assert.match(src, /dobGate\.js/, 'the precompile must emit the gate script tag');
  assert.match(
    src,
    /includes\('globalChatButton\.js'\)[\s\S]{0,80}?includes\('<\/head>'\)/,
    'injection must be gated on the chat-button anchor and a <head> to inject into'
  );
  // Content-hashed like every other script this file emits, or an edit to the
  // gate is served stale from a cache entry that outlives it.
  assert.match(src, /dobGate\.js\?v=\$\{DOB_GATE_V\}/, 'the tag must carry a content hash');
});

test('the gate installs AFTER error tracking, never before', () => {
  // If the gate threw during its own setup ahead of Sentry, the failure would be
  // invisible — on the one screen standing between a member and the product.
  const sentryAt = BUILD.indexOf("next.replace('</head>', `${SENTRY_TAG}</head>`)");
  const gateAt = BUILD.indexOf("next.replace('</head>', `${DOB_GATE_TAG}</head>`)");
  assert.ok(sentryAt > 0 && gateAt > 0, 'both injection sites must exist');
  assert.ok(gateAt > sentryAt, 'the gate must be injected after the Sentry tags');
});

test('every page without the anchor is a NAMED exemption', () => {
  const unexplained = pages.filter((p) => !hasAnchor(p) && !EXEMPT.has(p));
  assert.deepEqual(
    unexplained,
    [],
    `pages a member could land on with no gate and no stated reason: ${unexplained.join(', ')}`
  );
});

// ⚠ THE ANCHOR IS NOT THE WHOLE CONDITION, AND THIS TEST USED TO ACT AS IF IT
// WERE. Injection also needs a literal `</head>`, so an anchored member page
// without one received NO gate while the build printed a lower number and this
// suite still counted it as covered — two independent signals both reading
// "fine" about a page that ships ungated. The build now refuses such a page;
// this asserts the same property from the tree, so the rule holds even for
// someone reading the tests rather than running the build.
test('every anchored page actually has somewhere to inject the gate', () => {
  const noTarget = pages.filter((p) => hasAnchor(p) && !readFileSync(join(DIR, p), 'utf8').includes('</head>'));
  assert.deepEqual(noTarget, [],
    `these pages carry the anchor but have no </head>, so they would ship WITHOUT the `
    + `age-collection prompt while the coverage count merely looked lower: ${noTarget.join(', ')}`);
});

test('the build refuses an eligible page it cannot inject', () => {
  // The counterpart to the rule above, asserted on the build SOURCE: eligibility
  // and injection are counted separately and a gap throws. Without this, someone
  // could restore the old single folded condition and the tree-level test above
  // would still pass on today's pages.
  const src = stripComments(BUILD);
  assert.match(src, /dobGateEligible\+\+/, 'eligibility must be counted separately from injection');
  assert.match(src, /dobGateUninjectable\.push\(/, 'an eligible page with no target must be recorded');
  assert.match(src, /if\s*\(dobGateUninjectable\.length\)\s*\{[\s\S]{0,300}?throw new Error\(/,
    'and must STOP the build rather than lower a count nobody can interpret');
});

test('the exemption list has no dead entries', () => {
  // A stale exemption is how a page quietly loses coverage: it gains the anchor,
  // nobody removes it from here, and the next page with that name inherits a pass
  // it never earned.
  const dead = [...EXEMPT].filter((f) => !pages.includes(f) || hasAnchor(f));
  assert.deepEqual(dead, [], `exemptions no longer needed: ${dead.join(', ')}`);
});

test('a missing gate file FAILS the build rather than deploying without it', () => {
  // This used to fall through to an empty tag: delete dobGate.js and every portal
  // page shipped with no age-collection prompt, the only trace being a console
  // line. A log is not a gate.
  //
  // ⚠ ASSERTED ON THE SOURCE, AND THAT LIMIT IS REAL. Proving it by running the
  // script with the file absent means spawning it somewhere it also cannot find
  // the 76 pages, so a non-zero exit would prove nothing about THIS rule — it
  // would pass for the wrong reason. Two spelling assertions instead: the refusal
  // exists, and the tag has no empty fallback left for it to fall through to.
  const src = stripComments(BUILD);
  assert.match(
    src,
    /if\s*\(!DOB_GATE_V\)\s*\{[\s\S]{0,400}?throw new Error\(/,
    'the build must refuse to run without the gate, not emit an empty tag'
  );
  assert.doesNotMatch(
    src,
    /DOB_GATE_TAG\s*=\s*DOB_GATE_V[\s\S]{0,200}?:\s*''/,
    'no empty-string fallback may remain — that is the silent path being closed'
  );
});

test('the precompile reports its own coverage out loud', () => {
  // A coverage number nobody prints reads as "everything is covered" the moment a
  // page stops matching the anchor. The Sentry line above it exists for the same
  // reason and is the precedent being followed.
  assert.match(stripComments(BUILD), /newdesign dob gate: injected on/);
});

test('the gate script is present and self-contained', () => {
  // ⚠ COMMENTS STRIPPED FIRST. The file's own header explains WHY it avoids
  // window.shapeDb, so asserting over raw text fires on the rationale rather than
  // the code — a guard that fails on its own explanation.
  const src = stripComments(readFileSync(join(DIR, 'dobGate.js'), 'utf8'));
  // It runs on 52 pages that never load /supabase.js, so a shapeDb dependency
  // would make it dead code across most of the portal.
  assert.doesNotMatch(src, /window\.shapeDb/, 'the gate must not depend on supabase.js');
  // It must delegate sign-out rather than reimplement the shared-device scrub.
  assert.match(src, /window\.shapePortalSignOut/);
  assert.match(
    readFileSync(join(DIR, 'pageShell.jsx'), 'utf8'),
    /window\.shapePortalSignOut\s*=/,
    'pageShell must expose the sign-out the gate delegates to'
  );
});
