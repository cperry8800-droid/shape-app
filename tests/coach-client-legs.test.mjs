// The per-client overview legs (review 2026-09-09, R4) — every rule driven
// with synthetic rows: a leg is scoped to the CALLER's own provider id (RLS
// hands a coach every linked coach's rows), the program week counts from the
// assignment and is capped at the template's length, a paused block reports no
// week, a day is logged when it carries calories (the get_client_stats
// definition), and a leg the caller cannot read stays null rather than "never".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsProgramLeg, bsLogsLeg, bsNutritionTargets, bsLastContactLeg } from '../src/lib/coach-client-legs.mjs';

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 9, 15, 0, 0);   // 2026-09-09T15:00Z
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const day = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

const ME = { trainer: 7, nutritionist: null };
const tpl = (o) => new Map([['t1', { title: 'Strength Block 3', durationWeeks: 12, ...o }]]);
const asg = (o) => ({ provider_role: 'trainer', provider_id: 7, program_template_id: 't1', created_at: iso(20 * DAY), updated_at: iso(DAY), status: 'active', ...o });

test('program leg: name, week from the assignment, capped at the template length', () => {
  const p = bsProgramLeg([asg()], tpl(), ME, NOW);
  assert.deepEqual(p, { name: 'Strength Block 3', week: 3, weeks: 12, status: 'active' });
  // 400 days in on a 12-week template must not read "Wk 58/12"
  assert.equal(bsProgramLeg([asg({ created_at: iso(400 * DAY) })], tpl(), ME, NOW).week, 12);
  // no durationWeeks → a week with no total, never an invented one
  assert.deepEqual(bsProgramLeg([asg()], tpl({ durationWeeks: null }), ME, NOW),
    { name: 'Strength Block 3', week: 3, weeks: null, status: 'active' });
});

test('program leg: ANOTHER coach\'s assignment is never attributed to the caller', () => {
  // `shared_coach_reads_assignments` hands every linked coach every row, so a
  // predecessor's still-active block arrives in the same array. Filtering on
  // role alone would render it in THIS coach's PROGRAM column.
  const theirs = asg({ provider_id: 9 });
  assert.equal(bsProgramLeg([theirs], tpl(), ME, NOW), null);
  assert.equal(bsProgramLeg([theirs, asg()], tpl(), ME, NOW).name, 'Strength Block 3');
  // A string id from PostgREST still matches a numeric one.
  assert.equal(bsProgramLeg([asg({ provider_id: '7' })], tpl(), ME, NOW).name, 'Strength Block 3');
  // A dual-role coach reads THEIR OWN role's row, not the trainer's by default.
  const nutriRow = asg({ provider_role: 'nutritionist', provider_id: 4 });
  assert.equal(bsProgramLeg([asg({ provider_id: 9 }), nutriRow], tpl(), { trainer: 7, nutritionist: 4 }, NOW).name, 'Strength Block 3');
  assert.equal(bsProgramLeg([], tpl(), ME, NOW), null);
  assert.equal(bsProgramLeg(null, tpl(), ME, NOW), null);
  assert.equal(bsProgramLeg([asg()], tpl(), { trainer: null, nutritionist: null }, NOW), null, 'a caller with no link here reads nothing');
});

test('program leg: a PAUSED block reports no week', () => {
  // Wall-clock from created_at knows nothing about the pause, so a 12-week
  // block paused at week 4 would otherwise read "Wk 12/12" months later.
  const p = bsProgramLeg([asg({ status: 'paused', created_at: iso(200 * DAY) })], tpl(), ME, NOW);
  assert.deepEqual(p, { name: 'Strength Block 3', week: null, weeks: 12, status: 'paused' });
});

test('program leg: an ACTIVE block outranks a paused one, whatever updated_at says', () => {
  // Pausing an old block restamps its updated_at above the live block assigned
  // the day before — recency alone would name the paused one and leave the
  // program the client is actually running invisible.
  const templates = new Map([['t1', { title: 'Block 3', durationWeeks: 8 }], ['t2', { title: 'Block 4', durationWeeks: 6 }]]);
  const pausedYesterday = asg({ program_template_id: 't1', status: 'paused', updated_at: iso(0) });
  const activeLastWeek = asg({ program_template_id: 't2', status: 'active', updated_at: iso(6 * DAY), created_at: iso(6 * DAY) });
  assert.equal(bsProgramLeg([pausedYesterday, activeLastWeek], templates, ME, NOW).name, 'Block 4');
  assert.equal(bsProgramLeg([activeLastWeek, pausedYesterday], templates, ME, NOW).name, 'Block 4');
  // 'assigned' (not yet started) still outranks 'paused'…
  const assignedOld = asg({ program_template_id: 't2', status: 'assigned', updated_at: iso(30 * DAY) });
  assert.equal(bsProgramLeg([pausedYesterday, assignedOld], templates, ME, NOW).name, 'Block 4');
  // …and within one status class recency still decides.
  const activeNewer = asg({ program_template_id: 't1', status: 'active', updated_at: iso(0) });
  assert.equal(bsProgramLeg([activeLastWeek, activeNewer], templates, ME, NOW).name, 'Block 3');
});

test('program leg: an untitled or unknown template is not a program name', () => {
  assert.equal(bsProgramLeg([asg()], tpl({ title: '   ' }), ME, NOW), null);
  assert.equal(bsProgramLeg([asg({ program_template_id: 'gone' })], tpl(), ME, NOW), null);
});

test('program leg: the newest assignment wins whatever order the rows arrive in', () => {
  const older = asg({ program_template_id: 't1', updated_at: iso(30 * DAY) });
  const newer = asg({ program_template_id: 't2', updated_at: iso(DAY), created_at: iso(8 * DAY) });
  const templates = new Map([['t1', { title: 'Old block', durationWeeks: 8 }], ['t2', { title: 'New block', durationWeeks: 6 }]]);
  assert.equal(bsProgramLeg([older, newer], templates, ME, NOW).name, 'New block');
  assert.equal(bsProgramLeg([newer, older], templates, ME, NOW).name, 'New block');
});

test('logs leg: a day is logged when it carries CALORIES — the rollup\'s own definition', () => {
  // get_client_stats counts `calories is not null`. A wider definition here
  // puts "Today" beside a "0%" compliance cell on the same roster row.
  const rows = [
    { snapshot_date: day(0), calories: 2100, protein_g: 150 },
    { snapshot_date: day(1), sleep_hours: 7.5 },              // slept, logged no food
    { snapshot_date: day(2), protein_g: 120 },                // protein without calories is not a logged day
    { snapshot_date: day(3), calories: 1980 },
  ];
  const l = bsLogsLeg(rows, NOW);
  assert.equal(l.lastLoggedOn, day(0));
  assert.equal(l.daysLogged7d, 2);
  assert.deepEqual(l.recent.map((r) => r.on), [day(0), day(3)]);
  assert.deepEqual(l.recent[1], { on: day(3), kcal: 1980, protein: null });
});

test('logs leg: seven CALENDAR days, not the seven most recent rows', () => {
  const rows = [0, 1, 2, 20, 21, 22, 23, 24].map((d) => ({ snapshot_date: day(d), calories: 1900 }));
  assert.equal(bsLogsLeg(rows, NOW).daysLogged7d, 3, 'the 20-days-ago cluster is outside the window');
  assert.equal(bsLogsLeg(rows.slice().reverse(), NOW).lastLoggedOn, day(0), 'input order must not matter');
});

test('logs leg: nothing logged is null, never a zero', () => {
  assert.equal(bsLogsLeg([], NOW), null);
  assert.equal(bsLogsLeg(null, NOW), null);
  assert.equal(bsLogsLeg([{ snapshot_date: day(0), sleep_hours: 8 }], NOW), null);
  assert.equal(bsLogsLeg([{ calories: 2000 }], NOW), null, 'a row with no date cannot be placed');
});

test('nutrition targets: a half-set target survives; an unusable one does not', () => {
  assert.deepEqual(bsNutritionTargets({ nutrition: { calories: 2200, protein: 160 } }), { calories: 2200, protein: 160 });
  // Half-set is KEPT — ruleLedgerBlown needs only calories, ruleProteinUnder only protein.
  assert.deepEqual(bsNutritionTargets({ nutrition: { calories: 2200 } }), { calories: 2200, protein: null });
  assert.deepEqual(bsNutritionTargets({ nutrition: { calories: 0, protein: 160 } }), { calories: null, protein: 160 });
  // ⚠ Normalize BEFORE deciding emptiness: `{ calories: 0 }` used to slip past
  // the guard and return an all-null OBJECT, which reads as "targets exist".
  assert.equal(bsNutritionTargets({ nutrition: { calories: 0 } }), null);
  assert.equal(bsNutritionTargets({ nutrition: { calories: 0, protein: -5 } }), null);
  assert.equal(bsNutritionTargets({ nutrition: {} }), null);
  assert.equal(bsNutritionTargets({}), null);
  assert.equal(bsNutritionTargets(null), null);
  assert.equal(bsNutritionTargets({ nutrition: { calories: 'lots' } }), null);
});

test('last contact: only the caller\'s own thread, and a KNOWN never is not an absence', () => {
  const convos = [
    { provider_role: 'trainer', provider_id: 7, last_message_at: iso(2 * DAY) },
    { provider_role: 'trainer', provider_id: 7, last_message_at: iso(9 * DAY) },   // older thread, same coach
    { provider_role: 'trainer', provider_id: 9, last_message_at: iso(0) },         // another trainer's
    { provider_role: 'nutritionist', provider_id: 3, last_message_at: iso(DAY) },  // the counterpart's
  ];
  assert.deepEqual(bsLastContactLeg(convos, ME), { trainer: iso(2 * DAY), nutritionist: null });
  assert.deepEqual(bsLastContactLeg(convos, { trainer: 7, nutritionist: 3 }), { trainer: iso(2 * DAY), nutritionist: iso(DAY) });
  // ⚠ A coach who has never messaged this client is a KNOWN never — the leg is
  // present with a null value, so the column can say so instead of "Not shared".
  assert.deepEqual(bsLastContactLeg([], ME), { trainer: null, nutritionist: null });
  assert.deepEqual(bsLastContactLeg([{ provider_role: 'trainer', provider_id: 7, last_message_at: null }], ME),
    { trainer: null, nutritionist: null }, 'a thread that exists but was never used is still a known never');
  // Only a caller with NO link here reads nothing at all.
  assert.equal(bsLastContactLeg(convos, { trainer: null, nutritionist: null }), null);
  assert.equal(bsLastContactLeg(convos, null), null);
});

test('last contact: a numeric-vs-string provider id still matches', () => {
  assert.deepEqual(bsLastContactLeg([{ provider_role: 'trainer', provider_id: '7', last_message_at: iso(DAY) }], ME),
    { trainer: iso(DAY), nutritionist: null });
});
