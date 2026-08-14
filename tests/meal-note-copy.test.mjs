// The meal-note dispatch may speak ONLY for the note — never for the meal log.
//
// WHY THIS FILE EXISTS: PR #1876 added an honest failure notice to `sendMealNote`
// and, in the same breath, made it assert something it never checks. `doLog()` fires
// the coach-note dispatch and the macro write as two independent unawaited requests;
// `logMealMacros` resolves to null on every failure with no queue and no retry
// (shapeBackend.js:4979-5005), so one offline moment — or one 402 from the
// `requireMembership` gate that fronts BOTH /api/nutrition/meal-note and
// /api/nutrition/meal-log — takes down both legs. The notice then told the member
// "Your meal log is saved", which was the one thing that had not happened, in wording
// chosen to stop them re-logging. Codex caught one instance; there were two.
//
// ⚠ THE RULE IS TWO-SIDED, and the second half is the one that looks wrong at a
// glance. This path must not warn that the log FAILED either: a null from
// `ShapeMealLog.log` means "failed" OR "never attempted" (it returns null before
// issuing a request when signed out, shapeBackend.js:4980, and the global may be
// absent), so a warning keyed on it would fire on the signed-out preview — the same
// never-attempted class as the `no_coach` branch. And `add_meal_macros` is an
// accumulating upsert with no idempotency key, so nudging a re-log double-counts the
// day. The correct scope is: report the note, say nothing about the log.
//
// Honest limit: this is a SOURCE-TEXT guard, not a behavioural one. The copy lives as
// inline string literals inside a ~9.7k-line component with no seam to mount, so this
// asserts the text rather than driving the render. It is mutation-checked below
// against a sample carrying the original defect, so it cannot be decoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');
const RAW = readFileSync(SRC, 'utf8');

// The dispatch runs from its declaration to the start of doLog, which is the next
// declaration in the component. Slicing rather than regexing the whole file keeps the
// guard from firing on unrelated copy elsewhere in a very large file.
function sendMealNoteBody(source) {
  const start = source.indexOf('const sendMealNote = () => {');
  assert.notEqual(start, -1, 'sendMealNote must still exist — update this guard if it is renamed');
  const end = source.indexOf('const doLog = () => {', start);
  assert.notEqual(end, -1, 'doLog must still follow sendMealNote — update this guard if the order changes');
  return source.slice(start, end);
}

// Only the notice STRINGS matter; the surrounding prose comments explain the rule and
// necessarily quote the banned phrasing to do so. Strip comments before asserting, or
// the guard fires on its own rationale — the "a comment keeps a deleted rule alive"
// trap this repo has hit before.
function noticeCopy(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

// Asserts persistence one way or the other. Both directions are defects here.
const CLAIMS_SAVED = /(meal )?log (is|was) (saved|kept)|log itself was kept/i;
const CLAIMS_NOT_SAVED = /(couldn['’]t|could not|didn['’]t|did not|failed to) save|wasn['’]t saved|not( been)? saved/i;

test('the meal-note notice never claims the meal log was saved', () => {
  const copy = noticeCopy(sendMealNoteBody(RAW));
  const hit = copy.match(CLAIMS_SAVED);
  assert.equal(
    hit, null,
    `sendMealNote asserts the log persisted (${hit && hit[0]}) — it fires on a path where the `
    + 'macro write may have failed, and it never checks. Report the note only.',
  );
});

test('the meal-note notice never claims the meal log FAILED either', () => {
  // Not symmetry for its own sake: a null from ShapeMealLog.log cannot distinguish
  // "failed" from "never attempted", so a warning here fires on the signed-out
  // preview, and copy that nudges a re-log double-counts an accumulating upsert.
  const copy = noticeCopy(sendMealNoteBody(RAW));
  const hit = copy.match(CLAIMS_NOT_SAVED);
  assert.equal(
    hit, null,
    `sendMealNote asserts the log did NOT persist (${hit && hit[0]}) — null from `
    + 'ShapeMealLog.log also means "never attempted". Report the note only.',
  );
});

test('the two deliberately-silent paths are still guarded', () => {
  // Removing either recreates the class this notice was built to avoid: firing on a
  // path where nothing was attempted. The attachment guard is why a plain offline log
  // shows no notice at all; the no_coach guard is why having no coach stays quiet.
  const body = sendMealNoteBody(RAW);
  assert.ok(
    /if \(!hasNote && !hasMemo && !hasPhoto\) return;/.test(body),
    'the dispatch must return before notifying when nothing was attached',
  );
  assert.ok(
    /d\.reason === 'no_coach'/.test(body),
    'having no coach must stay quiet — it is not a delivery failure',
  );
});

test('the guard fires on the exact copy that shipped (mutation check)', () => {
  // Proves these assertions are not decoration: the pre-fix strings must be caught.
  const shipped = "'Your meal log is saved — only the note didn’t send. Try again from your chat.'";
  const partial = '`Your meal log is saved and the note went out, but ${bits.join(\' and \')}.`';
  assert.match(shipped, CLAIMS_SAVED, 'the noteFailed copy that shipped must be rejected');
  assert.match(partial, CLAIMS_SAVED, 'the partial-delivery copy that shipped must be rejected');
  // And the over-correction I nearly shipped instead must be rejected too.
  assert.match("'We couldn’t save this meal — log it again.'", CLAIMS_NOT_SAVED);
  // A clean notice passes both.
  const fixed = "'Your note didn’t send. Try again from your chat, or send it to them directly.'";
  assert.doesNotMatch(fixed, CLAIMS_SAVED);
  assert.doesNotMatch(fixed, CLAIMS_NOT_SAVED);
});
