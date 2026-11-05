// The PROGRAM leg of a coach's per-client overview reads what assigning a program writes
// (2026-11-05).
//
// ⚠ "Program: Not set" FOR EVERY LIVE CLIENT. The leg read coach_program_assignments, whose one
// writer (/api/program-tools/templates POST) nothing calls. The website's builder, the app's coach
// Plans and Nora assign through builderToAssignmentRows → /api/trainer/workout, which writes a
// client_workouts row per training day stamped payload.template { id, name, week, day }. The rows
// here are made by that same function, so the leg is tested against the shape the assign flow
// really writes; the overview is then driven with them over a fake database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { bsWorkoutProgramLeg, bsProgramLeg } from '../src/lib/coach-client-legs.mjs';
import { builderToAssignmentRows } from '../public/newdesign/workoutDocument.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 10, 5, 15, 0, 0);   // Thu 2026-11-05
const COACH = { id: '11111111-1111-4111-8111-111111111111' };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// A program of `weeks` weeks, Monday / Wednesday / Friday, assigned from `start`, as the client's
// rows come back from the overview's select (->> reads every JSON value as text).
function assigned({ id = 'tpl-1', name = 'Strength Block 3', weeks = 12, start = '2026-10-05', weekdays = [0, 2, 4] } = {}) {
  const builder = { weeks: Array.from({ length: weeks }, () => ({ days: weekdays.map((wd, i) => ({ id: 'd' + i, name: 'Day ' + (i + 1), weekday: wd, blocks: [{ kind: 'main', rows: [] }] })) })) };
  return builderToAssignmentRows(builder, { id, name }, start).map((r) => ({
    scheduled_date: r.scheduledDate,
    template_id: r.payload.template.id,
    template_name: r.payload.template.name,
    template_week: String(r.payload.template.week),
  }));
}

test('a program assigned on the website reads its name and week x of y', () => {
  const p = bsWorkoutProgramLeg(assigned(), NOW);
  // 5 Oct to 5 Nov is four weeks and three days: week 5 of 12.
  assert.deepEqual(p, { name: 'Strength Block 3', week: 5, weeks: 12, status: 'active', estimatedEndAt: '2026-12-28T00:00:00.000Z', overdue: false, nextAssigned: null });
});

test('the week counts from the start the coach chose, a mid-week one included', () => {
  // Started on a Wednesday: week 1 is Wed 7 Oct to Tue 13 Oct (its Monday day lands on the 12th).
  assert.equal(bsWorkoutProgramLeg(assigned({ start: '2026-10-07' }), NOW).week, 5);
  // A block starts on its first training day: started Wednesday the 4th, Thursday is week 1.
  assert.equal(bsWorkoutProgramLeg(assigned({ start: '2026-11-04' }), NOW).week, 1);
  // Started on Thursday the 5th, a rest day here, it begins on Friday's session.
  assert.equal(bsWorkoutProgramLeg(assigned({ start: '2026-11-05' }), NOW).week, null);
  const soon = bsWorkoutProgramLeg(assigned({ start: '2026-11-09' }), NOW);
  assert.equal(soon.week, null);
  assert.equal(soon.status, 'assigned');
  assert.equal(soon.overdue, false);
});

test('the length is the run\'s own, and a finished block is overdue at its last week', () => {
  const done = bsWorkoutProgramLeg(assigned({ weeks: 4, start: '2026-09-07' }), NOW);
  assert.equal(done.week, 4, 'capped at its length, never "Wk 9/4"');
  assert.equal(done.weeks, 4);
  assert.equal(done.overdue, true);
  // Its last week: not yet overdue.
  const last = bsWorkoutProgramLeg(assigned({ weeks: 5, start: '2026-10-05' }), NOW);
  assert.deepEqual([last.week, last.weeks, last.overdue], [5, 5, false]);
});

test('the oldest days falling out of the read still date the run', () => {
  // Weeks 1 and 2 gone (the read keeps the newest): any day of the run gives its start.
  const rows = assigned().filter((r) => Number(r.template_week) >= 3);
  assert.equal(bsWorkoutProgramLeg(rows, NOW).week, 5);
});

test('the current block is the one most recently started; the next one is named', () => {
  const old = assigned({ id: 'tpl-0', name: 'Foundations', weeks: 6, start: '2026-08-03' });
  const now = assigned();
  const next = assigned({ id: 'tpl-2', name: 'Peak Block', weeks: 4, start: '2026-12-28' });
  const p = bsWorkoutProgramLeg([...next, ...old, ...now], NOW);
  assert.equal(p.name, 'Strength Block 3');
  assert.equal(p.nextAssigned, 'Peak Block');
  // The same template assigned twice is two runs: the second one is current.
  const again = assigned({ weeks: 4, start: '2026-06-01' });
  assert.equal(bsWorkoutProgramLeg([...again, ...now], NOW).week, 5);
  assert.equal(bsWorkoutProgramLeg([...again, ...now], NOW).weeks, 12);
  // With nothing started yet, the next to start is the program.
  assert.equal(bsWorkoutProgramLeg(next, NOW).name, 'Peak Block');
});

test('a single assigned workout, an unnamed one and junk rows are not a program', () => {
  assert.equal(bsWorkoutProgramLeg(assigned({ weeks: 1, weekdays: [0] }), NOW), null, 'one day is a workout');
  assert.equal(bsWorkoutProgramLeg(assigned({ name: '' }), NOW), null);
  assert.equal(bsWorkoutProgramLeg([], NOW), null);
  assert.equal(bsWorkoutProgramLeg(null, NOW), null);
  const junk = [null, { scheduled_date: 'soon', template_id: 't', template_name: 'X', template_week: '1' }, { scheduled_date: '2026-10-05', template_id: null, template_name: 'X', template_week: '1' }, { scheduled_date: '2026-10-05', template_id: 't', template_name: 'X', template_week: '0' }];
  assert.deepEqual(bsWorkoutProgramLeg([...junk, ...assigned()], NOW), bsWorkoutProgramLeg(assigned(), NOW));
});

test('the paused rule stays with the assignment rows it was written for', () => {
  const tpl = new Map([['t1', { title: 'Block 3', durationWeeks: 12 }]]);
  const p = bsProgramLeg([{ provider_role: 'trainer', provider_id: 7, program_template_id: 't1', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z', status: 'paused' }], tpl, { trainer: 7, nutritionist: null }, NOW);
  assert.equal(p.status, 'paused');
  assert.equal(p.week, null);
});

// ── The overview ────────────────────────────────────────────────────────────
const importLib = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
async function overview(tables, { fail = [] } = {}) {
  const lib = await loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only import; never called'); } }],
      ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
      ['@/lib/vitals-leg.mjs', await importLib('src/lib/vitals-leg.mjs')],
      ['@/lib/coach-client-legs.mjs', await importLib('src/lib/coach-client-legs.mjs')],
    ]),
  });
  const db = fakeSupabase({ tables: { trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH.id }], nutritionists: [], subscriptions: [{ client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null }], ...tables }, rpcs: { get_display_names: () => [{ user_id: A, full_name: 'Ada', avatar_url: null }] }, fail });
  return lib.buildSharedOverview(db, { clientId: A, me: { trainerId: 7, nutritionistId: null, userId: COACH.id } });
}
// As client_workouts holds them: one row per day, the template in the payload.
const asTable = (rows, o = {}) => rows.map((r, i) => ({ id: 'w' + i, client_id: A, trainer_id: 7, status: 'published', scheduled_date: r.scheduled_date, payload: { exercises: [], template: { id: r.template_id, name: r.template_name, version: 1, week: Number(r.template_week), day: 1 } }, ...o }));

test('the overview names the program the coach assigned on the website, and its week', async () => {
  // Days whose week has passed and days still ahead, as the calendar holds them today.
  const ov = await overview({ client_workouts: asTable(assigned().filter((r) => r.scheduled_date >= '2026-01-01')) });
  assert.equal(ov.program.name, 'Strength Block 3');
  assert.equal(ov.program.weeks, 12);
  assert.ok(ov.program.week >= 5, `week ${ov.program.week}`);   // the real clock: week 5 or later
});

test('another trainer\'s days, archived days and plain workouts are not the caller\'s program', async () => {
  const theirs = asTable(assigned(), { trainer_id: 9 });
  const archived = asTable(assigned(), { status: 'archived' });
  const plain = asTable(assigned()).map((r) => ({ ...r, payload: { exercises: [] } }));
  const ov = await overview({ client_workouts: [...theirs, ...archived, ...plain] });
  assert.equal(ov.program, null, 'no program of the caller\'s: "Not set" is then the truth');
});

test('with no program on the calendar, an assignment row still counts, paused rule and all', async () => {
  const ov = await overview({
    client_workouts: [],
    coach_program_assignments: [{ id: 'as1', client_id: A, status: 'paused', provider_role: 'trainer', provider_id: 7, program_template_id: 't1', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z', notes: null }],
    coach_program_templates: [{ id: 't1', title: 'Block 3', goal: null, level: null, duration_weeks: 12, days_per_week: 4 }],
  });
  assert.equal(ov.program.name, 'Block 3');
  assert.equal(ov.program.status, 'paused');
});

test('a failed read of the days is unknown: the key is omitted, never "Not set"', async () => {
  const ov = await overview({ client_workouts: asTable(assigned()) }, { fail: ['client_workouts'] });
  assert.ok(!('program' in JSON.parse(JSON.stringify(ov))), 'the roster then says "Not shared"');
});
