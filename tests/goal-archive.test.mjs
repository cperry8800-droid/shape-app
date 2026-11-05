// Goal's "Archive" (coach review, 2026-11-04, a High bug): it saved an empty goal list at once, with
// no question and nothing kept, on both coach Goal pages. Now it asks, keeps the quarter's goals in
// `archived` in the same saved document, and an empty page offers them back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGES = ['public/newdesign/trainerGoalPage.jsx', 'public/newdesign/nutritionistGoalPage.jsx'];
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

for (const p of PAGES) {
  test(`${p}: Archive asks first, keeps the goals, and can give them back`, () => {
    const src = read(p);
    assert.doesNotMatch(src, /persist\(\{ \.\.\.state, goals: \[\] \}\)/, 'a button saves an empty goal list again');
    const fn = src.slice(src.indexOf('async function archiveGoals()'), src.indexOf('function restoreGoals()'));
    const ask = fn.indexOf('await window.ShapeConfirm.open(');
    const save = fn.indexOf('persist({ ...state, goals: [], archived })');
    assert.ok(ask > 0 && save > ask, 'archiving no longer asks before it saves');
    assert.match(fn, /goals: current \}\];/, 'the archived copy no longer holds the goals');
    assert.match(src, /data-goal-archive onClick=\{archiveGoals\}/);
    assert.match(src, /!\(state\.goals \|\| \[\]\)\.length && lastArchive\(state\) && <button data-goal-restore onClick=\{restoreGoals\}/,
      'an empty page no longer offers the archived goals back');
  });
}

test('the restore offers the newest archived quarter that holds goals', () => {
  const src = read(PAGES[0]);
  const body = src.slice(src.indexOf('function lastArchive(state) {'), src.indexOf('function TrainerGoalPage() {'));
  const lastArchive = new Function(body + '; return lastArchive;')();
  assert.equal(lastArchive({}), null);
  assert.equal(lastArchive({ archived: [] }), null);
  assert.equal(lastArchive({ archived: [{ goals: [] }] }), null);
  const a = { at: '2026-11-05', goals: [{ id: 'g1' }] };
  const b = { at: '2026-11-06', goals: [{ id: 'g2' }] };
  assert.equal(lastArchive({ archived: [a, b] }), b);
});

for (const p of PAGES) {
  test(`${p}: every save is bound to the account the page loaded (Codex on #2626)`, () => {
    const src = read(p);
    assert.match(src, /ownerId\.current = user\.id;/, 'the page no longer remembers whose goals it loaded');
    assert.match(src, /saveUserGoals\("(trainer|nutritionist)", next, ownerId\.current \? \{ expectedUserId: ownerId\.current \} : undefined\)/,
      'a save writes to whoever is signed in at save time again');
    assert.equal((src.match(/saveUserGoals\(/g) || []).length, 1, 'a second save path skips the account binding');
    assert.match(src, /res\.error\.message === "Account changed" \? "Not saved: another account is signed in now\. Reload this page\."/);
  });
}

test('saveUserGoals refuses a save for an account that is no longer signed in', () => {
  const src = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  assert.match(src, /if \(options && options\.expectedUserId && u\.id !== options\.expectedUserId\) return \{ error: \{ message: 'Account changed' \} \};/);
});
