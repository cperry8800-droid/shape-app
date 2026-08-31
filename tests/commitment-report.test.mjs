// BSCommitmentCard — the weekly points STAKE on the Score page.
//
// This guard exists because the ratchet cannot see either half of what cut 17
// closed. It counts walk-visible JSX strings, so it never saw the six failure
// sentences (plain JS, they never reach JSX) or the two stepper labels (a LOCAL
// ARRAY LITERAL the walk does not attribute) — and it has nothing at all to say
// about whether a failed write is REPORTED.
//
// The defect: window.__bsToast is a live no-op (iosAppBroadsheet.jsx keeps the
// global as `() => {}` — toasts were switched off app-wide by #938), and both
// writers are fully try/caught in the data layer, so every failure resolves to
// {ok:false} / {accepted:false} rather than rejecting. A member staked 5-50
// points, tapped "Lock it in", watched the button flip back, and was told
// nothing; accept() had no failure branch at all.
//
// A source guard rather than a mount: BSCommitmentCard lives inside a ~32k-line
// window-globals module and reads window.ShapeCommit / window.bsAskConfirm, so
// the honest instrument here is the shipped text — read through the canonical
// stripper, because the rationale comments at each site quote the very calls
// these assertions ban.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const raw = stripComments(fs.readFileSync(SRC, 'utf8'));

// Slice the component by its own declaration and the NEXT top-level function —
// a bare-name marker would run to the end of the file and every assertion after
// it would be about somebody else's code.
function slice(name) {
  const start = raw.indexOf(`\nfunction ${name}(`);
  assert.ok(start > 0, `${name} not found in ${SRC}`);
  const next = raw.indexOf('\nfunction ', start + 1);
  assert.ok(next > start, `no following top-level function after ${name}`);
  return raw.slice(start, next);
}
const CARD = slice('BSCommitmentCard');

test('guard-the-guard: the slice is the card and only the card', () => {
  assert.ok(CARD.length > 3000 && CARD.length < 30000, `slice length ${CARD.length} is implausible`);
  assert.match(CARD, /window\.ShapeCommit/, 'slice does not contain the commitment data layer');
  assert.doesNotMatch(CARD, /function BSScoreStandingChart/, 'slice ran past the component');
});

test('a failed set is REPORTED — three branches, all through notice()', () => {
  const save = CARD.slice(CARD.indexOf('const save ='), CARD.indexOf('const accept ='));
  assert.ok(save.length > 200, 'save() not isolated');
  // ⚠ THE TWO FAILURE BRANCHES ARE SLICED, NOT LAZY-SPANNED. The obvious
  // /reason === 'no_targets'[\s\S]*?notice\(/ passes with the no-targets notice
  // DELETED: the unbounded span simply runs on into the `} else {` below and finds
  // the GENERIC branch's notice(. Mutation-proven — that exact mutant survived.
  // Each branch is bounded to its own block instead.
  const noTargets = save.slice(save.indexOf("reason === 'no_targets'"), save.indexOf('} else {'));
  assert.ok(noTargets.length > 40, 'the no-targets branch did not isolate');
  assert.match(noTargets, /notice\([\s\S]*?errNoTargets/, 'the no-targets branch does not report');
  const generic = save.slice(save.indexOf('} else {'));
  assert.ok(generic.length > 40, 'the generic branch did not isolate');
  assert.match(generic, /notice\([\s\S]*?errSetFailed/, 'the generic failure branch does not report');
  // ...and the success branch must NOT: notice mode is for transient failures,
  // never for success confirmations (that is the popup noise #938 removed).
  const ok = save.slice(save.indexOf('if (r && r.ok)'), save.indexOf('else if'));
  assert.match(ok, /__bsToast/, 'the success path stopped using the toast');
  assert.doesNotMatch(ok, /notice\(/, 'a SUCCESS is being reported through notice mode');
});

test('a failed accept is REPORTED — the branch that did not exist at all', () => {
  const acc = CARD.slice(CARD.indexOf('const accept ='), CARD.indexOf('if (commit === undefined)'));
  assert.ok(acc.length > 150, 'accept() not isolated');
  // brace style is not the invariant — an `else` reaching notice() with the accept
  // copy is. (The first cut required `} else {` and failed on correct code.)
  assert.match(acc, /\belse\b[\s\S]*?notice\([\s\S]*?errAcceptFailed/, 'accept() has no failure branch');
  const ok = acc.slice(acc.indexOf('if (r && r.accepted)'), acc.indexOf('else'));
  assert.doesNotMatch(ok, /notice\(/, 'a SUCCESS is being reported through notice mode');
});

test('notice() prefers bsAskConfirm notice mode and only then the (no-op) toast', () => {
  const fn = CARD.slice(CARD.indexOf('const notice ='), CARD.indexOf('const save ='));
  assert.match(fn, /window\.bsAskConfirm/, 'notice() does not reach for bsAskConfirm');
  assert.match(fn, /notice:\s*true/, 'notice() does not request notice mode');
  assert.ok(
    fn.indexOf('bsAskConfirm') < fn.indexOf('__bsToast'),
    'the no-op toast is tried BEFORE the notice — the report would vanish again',
  );
  assert.match(fn, /\.catch\(\(\) => \{\}\)/, 'the fire-and-forget notice can reject unhandled');
});

test('the stored status token is never interpolated as copy', () => {
  // c.status is the row's key ('met' | 'missed' | 'proposed' | active) and is
  // compared with === ; a single {status} frame renders the raw English id in
  // twelve locales.
  assert.doesNotMatch(CARD, /\{status\}/, 'the status token is being interpolated into copy');
  for (const k of ['statusMet', 'statusMissed', 'statusProposed', 'statusActive']) {
    assert.match(CARD, new RegExp(`score:commit\\.${k}`), `score:commit.${k} is not rendered`);
  }
  for (const s of ['met', 'missed', 'proposed']) {
    assert.match(CARD, new RegExp(`c\\.status === '${s}'`), `the '${s}' row is no longer selected by its token`);
  }
});

test('the two stepper labels are keyed, not literals in a local array', () => {
  assert.match(CARD, /\['score:commit\.fieldWorkouts', 'Workouts'/, 'the Workouts label left the catalog');
  assert.match(CARD, /\['score:commit\.fieldHabits', 'Habit check-offs'/, 'the Habits label left the catalog');
  // the aria labels take the RESOLVED label, so a locale never announces English
  assert.match(CARD, /decreaseAria[\s\S]{0,120}field: label/, 'decrease aria does not carry the resolved label');
  assert.match(CARD, /increaseAria[\s\S]{0,120}field: label/, 'increase aria does not carry the resolved label');
});

test('every split-accent slot is a real word in all thirteen — an empty one renders the raw key', () => {
  const locales = fs.readdirSync('mobile-app/src/i18n/catalogs');
  assert.ok(locales.length >= 13, `only ${locales.length} catalogs found`);
  for (const loc of locales) {
    const cat = JSON.parse(fs.readFileSync(`mobile-app/src/i18n/catalogs/${loc}/score.json`, 'utf8'));
    for (const k of ['commit.sheetTitlePre', 'commit.sheetTitleAccent', 'commit.sheetTitlePost']) {
      assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}/score:${k} is empty — renders the raw key`);
    }
  }
});
