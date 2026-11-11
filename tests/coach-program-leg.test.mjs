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
import { bsWorkoutProgramLeg, bsProgramLeg, bsCoachDay } from '../src/lib/coach-client-legs.mjs';
import { readFileSync } from 'node:fs';
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
  // templateId: the program the run came from, so the library can tell whose week is whose (step 6a).
  assert.deepEqual(p, { name: 'Strength Block 3', templateId: 'tpl-1', week: 5, weeks: 12, status: 'active', estimatedEndAt: '2026-12-28T00:00:00.000Z', overdue: false, nextAssigned: null });
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
  // Thursdays from 8 Oct for four weeks: the last session was 29 Oct, and today, 5 Nov, is the
  // first day after its fourth week.
  const ended = bsWorkoutProgramLeg(assigned({ weeks: 4, start: '2026-10-08', weekdays: [3] }), NOW);
  assert.deepEqual([ended.week, ended.overdue, ended.estimatedEndAt], [4, true, '2026-11-05T00:00:00.000Z']);
  const lastDay = bsWorkoutProgramLeg(assigned({ weeks: 4, start: '2026-10-08', weekdays: [3] }), NOW - 86400000);
  assert.equal(lastDay.overdue, false, 'on its last day it is not yet overdue');
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

// The Week page's logged days ride on the same overview (2026-11-05): `from` is where a full
// snapshot window stops knowing, and null when the window holds every row the member has.
test('the overview sends the logged days, and where a full snapshot window stops knowing', async () => {
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ user_id: A, snapshot_date: day(i), dietary_kcal: i % 2 ? null : 1900 }));
  // 42 rows: the steps baseline needs four weeks before this one (the coach-alerts plan).
  const full = await overview({ daily_health_snapshot: rows(50) });
  assert.equal(full.logDays.from, day(41), 'forty-two rows read: nothing before the oldest of them is known');
  assert.equal(full.logDays.days.length, 21);
  const short = await overview({ daily_health_snapshot: rows(12) });
  assert.equal(short.logDays.from, null, 'twelve rows: every row the member has');
  const failed = await overview({ daily_health_snapshot: rows(12) }, { fail: ['daily_health_snapshot'] });
  assert.ok(!('logDays' in failed), 'a failed read omits it');
});

// A coach with both listings (2026-11-05): `program` is one pick, the trainer's calendar first, so the
// nutrition page's "program ending" named the trainer's block. `programs` is each role's own.
test("a coach with both listings: the overview carries each role's own program", async () => {
  const dual = async (tables, opts) => {
    const lib = await loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
      typescript: true,
      registry: new Map([
        ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only import; never called'); } }],
        ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
        ['@/lib/vitals-leg.mjs', await importLib('src/lib/vitals-leg.mjs')],
        ['@/lib/coach-client-legs.mjs', await importLib('src/lib/coach-client-legs.mjs')],
      ]),
    });
    const db = fakeSupabase({
      tables: {
        trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH.id }],
        nutritionists: [{ id: 3, name: 'Coach Q', owner_id: COACH.id }],
        subscriptions: [
          { client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null },
          { client_id: A, provider_role: 'nutritionist', provider_id: 3, status: 'active', current_period_end: null },
        ],
        ...tables,
      },
      rpcs: { get_display_names: () => [{ user_id: A, full_name: 'Ada', avatar_url: null }] },
      ...opts,
    });
    return lib.buildSharedOverview(db, { clientId: A, me: { trainerId: 7, nutritionistId: 3, userId: COACH.id } });
  };
  const plan = {
    coach_program_assignments: [{ id: 'as-n', client_id: A, status: 'active', provider_role: 'nutritionist', provider_id: 3, program_template_id: 'tn', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', notes: null }],
    coach_program_templates: [{ id: 'tn', title: 'Cut Phase', goal: null, level: null, duration_weeks: 8, days_per_week: 3 }],
  };
  const ov = await dual({ client_workouts: asTable(assigned()), ...plan });
  assert.equal(ov.program.name, 'Strength Block 3', 'the one pick stays the trainer\'s calendar, for the readers that show one');
  assert.equal(ov.programs.trainer.name, 'Strength Block 3');
  assert.equal(ov.programs.nutritionist.name, 'Cut Phase', 'the nutritionist\'s own plan');
  // No plan of the nutritionist's: none, never the trainer's block or the trainer's assignment.
  const trainerRow = {
    coach_program_assignments: [{ id: 'as-t', client_id: A, status: 'active', provider_role: 'trainer', provider_id: 7, program_template_id: 'tt', created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', notes: null }],
    coach_program_templates: [{ id: 'tt', title: 'Old Block', goal: null, level: null, duration_weeks: 6, days_per_week: 3 }],
  };
  const noPlan = await dual({ client_workouts: asTable(assigned()), ...trainerRow });
  assert.equal(noPlan.programs.nutritionist, null);
  assert.equal(noPlan.programs.trainer.name, 'Strength Block 3', 'the calendar first, as `program`');
  // Nothing on the calendar: the trainer's is the trainer's assignment, never the nutritionist's.
  const onlyPlan = await dual({ client_workouts: [], ...plan });
  assert.equal(onlyPlan.programs.trainer, null);
  assert.equal(onlyPlan.programs.nutritionist.name, 'Cut Phase');
  // The calendar unread: the trainer's is unknown (left out), the nutritionist's still read.
  const failed = JSON.parse(JSON.stringify(await dual({ client_workouts: asTable(assigned()), ...plan }, { fail: ['client_workouts'] })));
  assert.equal('trainer' in failed.programs, false);
  assert.equal(failed.programs.nutritionist.name, 'Cut Phase');
  // A trainer-only caller: no nutritionist program to claim.
  assert.deepEqual((await overview({ client_workouts: asTable(assigned()) })).programs.nutritionist, null);
});

test('a failed read of the days is unknown: the key is omitted, never "Not set"', async () => {
  const ov = await overview({ client_workouts: asTable(assigned()) }, { fail: ['client_workouts'] });
  assert.ok(!('program' in JSON.parse(JSON.stringify(ov))), 'the roster then says "Not shared"');
});

// Codex on #2620: the week turns over at the COACH's midnight. 5 Oct start, Monday 9 Nov 02:00 UTC
// is still Sunday 8 Nov evening in New York: week 5 there, week 6 by the UTC date.
test('the program week counts on the coach\'s calendar day, not UTC\'s', () => {
  const late = Date.UTC(2026, 10, 9, 2, 0, 0);
  assert.equal(bsWorkoutProgramLeg(assigned(), late).week, 6, 'no day given: the UTC date');
  assert.equal(bsWorkoutProgramLeg(assigned(), late, '2026-11-08').week, 5, 'a New York coach on Sunday evening saw next week');
  assert.equal(bsWorkoutProgramLeg(assigned(), late, 'not-a-day').week, 6, 'a bad day must fall back to the UTC date');
});

test('the coach\'s day: the listing\'s zone, else the browser\'s, and the overview passes it', () => {
  const late = Date.UTC(2026, 10, 9, 2, 0, 0);
  assert.equal(bsCoachDay(late, ['America/New_York', 'Europe/London']), '2026-11-08');
  assert.equal(bsCoachDay(late, [null, 'Australia/Sydney']), '2026-11-09', 'no listing zone: the browser\'s');
  assert.equal(bsCoachDay(late, ['Not/AZone', 'America/New_York']), '2026-11-08', 'a bad listing zone: the browser\'s');
  assert.equal(bsCoachDay(late, [null, undefined]), null, 'no zone: null, and the leg uses the UTC date');
  const src = readFileSync(join(ROOT, 'src/lib/shared-overview.ts'), 'utf8');
  assert.match(src, /bsWorkoutProgramLeg\(\(programDays \?\? \[\]\) as ProgramDayRow\[\], Date\.now\(\), bsCoachDay\(Date\.now\(\), me\.dayZones\)\)/, 'the overview no longer counts the week on the coach\'s day');
  assert.match(src, /dayZones: \[t\?\.timezone \?\? n\?\.timezone, sentZone\]/);
});
