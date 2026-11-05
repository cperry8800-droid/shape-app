// The coach's own Goal page (P4, 2026-11-05): a goal's start value, start date and due date; Archive
// that keeps the goals (it deleted every one, unasked: trainerGoalPage.jsx:276,
// nutritionistGoalPage.jsx:281); every write compare-and-set; and each goal's pace against its due
// date from the engine's own projectGoal, over a weekly series of its figure
// (public/newdesign/coachGoals.js).
// Run: node --test tests/coach-goals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const CG = require_('../public/newdesign/coachGoals.js');
const DS = require_('../public/newdesign/dashSignals.js');
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

const NOW = new Date(2026, 10, 5, 12); // Thu 5 Nov 2026, local
const TODAY = '2026-11-05';
const day = (offset) => CG.localDay(new Date(2026, 10, 5 + offset));

// The trajectory's weeks as the analytics route sends them: Mondays, oldest first, the last one partial.
function weeks(values) {
  return values.map((v, i) => {
    const monday = new Date(2026, 10, 2 - (values.length - 1 - i) * 7);
    return { weekOf: CG.localDay(monday), active: v, mrrNetCents: v * 15000 };
  });
}
const liveOf = (values) => ({ kind: 'live', trajectory: { weeks: weeks(values) } });

// ── The document ────────────────────────────────────────────────────────────────────────────
test('a goal saved before the new fields reads, edits and saves as it did', () => {
  const old = { goals: [{ t: '50 clients', cur: 34, tgt: 50, sub: 'x', id: 'g1' }, { t: 'typed', cur: 3, tgt: 5, sub: '', money: false, pct: false }], momentum: [['+1', 'a', 'b']] };
  assert.deepEqual(CG.cleanGoal(old.goals[0]), old.goals[0], 'nothing added to a goal that has none of them');
  // Removing one leaves the others exactly as stored.
  const removed = CG.removeGoal(old, 'g1');
  assert.deepEqual(removed.goals, [old.goals[1]]);
  assert.deepEqual(removed.momentum, old.momentum, 'the rest of the document rides along');
  // An outlook for a goal with no start, no start date and no due date still answers.
  const out = CG.goalOutlook({ id: 'g', tgt: 20, metric: 'activeClients' }, CG.seriesFor({ metric: 'activeClients' }, { live: liveOf([10, 11, 12, 13, 14, 15, 16, 17, 18]) }, NOW), { now: NOW, current: 18 });
  assert.equal(out.state, 'pace');
  assert.match(out.line, /^At this pace: /);
  // Junk in the new fields is dropped, not kept.
  assert.deepEqual(CG.cleanGoal({ id: 'x', start: 'abc', startDate: '2026-02-30', due: 'soon', history: [{ on: 'x', value: 1 }] }), { id: 'x' });
  assert.deepEqual(CG.cleanGoal({ id: 'x', start: '12', startDate: '2026-10-01', due: '2026-12-31' }), { id: 'x', start: 12, startDate: '2026-10-01', due: '2026-12-31' });
});

test('a new goal starts today from where its figure stands; the coach can set either', () => {
  const doc = { goals: [], momentum: [] };
  const bound = CG.upsertGoal(doc, { t: 'Clients', tgt: 20, metric: 'activeClients', due: '2026-12-31' }, { now: NOW, current: 12 });
  const g = bound.goals[0];
  assert.match(g.id, /^g/);
  assert.deepEqual([g.start, g.startDate, g.due], [12, TODAY, '2026-12-31']);
  assert.equal(g.history, undefined, 'a bound goal keeps no typed readings');
  const typed = CG.upsertGoal(doc, { t: 'Typed', cur: 3, tgt: 10 }, { now: NOW }).goals[0];
  assert.deepEqual([typed.start, typed.startDate, typed.history], [3, TODAY, [{ on: TODAY, value: 3 }]]);
  const programs = CG.upsertGoal(doc, { t: 'Publish 2', tgt: 2, metric: 'programsPublished' }, { now: NOW, current: 5 }).goals[0];
  assert.equal(programs.start, 0, 'programs published are counted from none');
  const chosen = CG.upsertGoal(doc, { t: 'Since Oct', tgt: 20, metric: 'activeClients', startDate: '2026-10-01' }, { now: NOW, current: 12 }).goals[0];
  assert.deepEqual([chosen.startDate, chosen.start], ['2026-10-01', undefined], 'a past start date: the start is read off the series at that date, not today\'s figure');
  const given = CG.upsertGoal(doc, { t: 'Given', tgt: 20, metric: 'activeClients', start: 9 }, { now: NOW, current: 12 }).goals[0];
  assert.equal(given.start, 9);
});

test('a typed goal keeps a reading each day its CURRENT changes; rebinding drops the old figure\'s start', () => {
  let doc = CG.upsertGoal({ goals: [] }, { id: 'a', t: 'Typed', cur: 3, tgt: 10 }, { now: new Date(2026, 9, 20, 9) });
  doc = CG.upsertGoal(doc, { id: 'a', cur: 5 }, { now: new Date(2026, 9, 27, 9) });
  doc = CG.upsertGoal(doc, { id: 'a', cur: 6 }, { now: new Date(2026, 9, 27, 18) });
  doc = CG.upsertGoal(doc, { id: 'a', sub: 'note' }, { now: NOW });
  assert.deepEqual(doc.goals[0].history, [{ on: '2026-10-20', value: 3 }, { on: '2026-10-27', value: 6 }], 'one a day, the last kept; an edit that leaves CURRENT alone adds none');
  assert.equal(doc.goals.length, 1, 'edited in place, by id');
  assert.equal(doc.goals[0].start, 3);
  // Bound now: its typed readings go, and the typed start of 3 is not a start for active clients.
  const rebound = CG.upsertGoal(doc, { id: 'a', metric: 'activeClients', start: 3 }, { now: NOW, current: 12 }).goals[0];
  assert.equal(rebound.history, undefined);
  assert.equal(rebound.start, undefined, 'the old figure\'s start is dropped; the series gives the new one at the start date');
  assert.equal(rebound.startDate, '2026-10-20', 'the goal\'s period stands');
  // Cap.
  let many = { goals: [{ id: 'm', cur: 0, tgt: 100 }] };
  for (let i = 1; i <= CG.HISTORY_MAX + 5; i += 1) many = CG.upsertGoal(many, { id: 'm', cur: i }, { now: new Date(2026, 0, i) });
  assert.equal(many.goals[0].history.length, CG.HISTORY_MAX);
  assert.equal(many.goals[0].history.at(-1).value, CG.HISTORY_MAX + 5);
});

test('Archive moves every goal to the archive with where it ended; nothing is deleted, and one can be restored', () => {
  const doc = { goals: [{ id: 'a', t: 'A', tgt: 20, metric: 'activeClients' }, { id: 'b', t: 'B', cur: 4, tgt: 5 }, { id: 'c', t: 'C', tgt: 90, metric: 'adherencePct' }, { id: 'd', t: 'D', cur: 7, tgt: 9, metric: 'activeClients' }], momentum: [['1', 'x', 'y']], archived: [{ id: 'old', t: 'Last quarter', archivedAt: '2026-07-01T00:00:00.000Z', final: 3 }] };
  const out = CG.archiveGoals(doc, { now: NOW, finals: { a: 16, c: null } });
  assert.deepEqual(out.goals, []);
  assert.deepEqual(out.momentum, doc.momentum);
  assert.deepEqual(out.archived.map((g) => [g.id, g.final]), [['a', 16], ['b', 4], ['c', null], ['d', null], ['old', 3]], 'newest first; a typed goal ends at its CURRENT; an unread figure is null, and a bound goal\'s stale typed CURRENT is never its end');
  assert.ok(out.archived.slice(0, 3).every((g) => g.archivedAt === NOW.toISOString()));
  assert.deepEqual(CG.archiveGoals({ goals: [], archived: doc.archived }, { now: NOW }).archived, doc.archived, 'nothing to archive changes nothing');
  const back = CG.restoreGoal(out, 'b', { now: NOW });
  assert.deepEqual(back.goals, [{ id: 'b', t: 'B', cur: 4, tgt: 5 }]);
  assert.deepEqual(back.archived.map((g) => g.id), ['a', 'c', 'd', 'old']);
  assert.deepEqual(CG.restoreGoal(out, 'nope'), out);
  // A restored goal whose id is taken again gets a new one, so two cards never share an id.
  const clash = CG.restoreGoal({ goals: [{ id: 'b', t: 'new B' }], archived: [{ id: 'b', t: 'old B', archivedAt: 'x' }] }, 'b', { now: NOW });
  assert.equal(clash.goals.length, 2);
  assert.notEqual(clash.goals[1].id, 'b');
  // Capped, oldest dropped.
  const full = { goals: [{ id: 'n', t: 'N' }], archived: Array.from({ length: CG.ARCHIVE_MAX }, (_, i) => ({ id: 'z' + i })) };
  const capped = CG.archiveGoals(full, { now: NOW });
  assert.equal(capped.archived.length, CG.ARCHIVE_MAX);
  assert.equal(capped.archived[0].id, 'n');
});

// ── Writing it ──────────────────────────────────────────────────────────────────────────────
function fakeDb({ doc = {}, uid = 'u1', cas = true, conflicts = 0, failRead = false, failWrite = false } = {}) {
  const store = { doc: JSON.parse(JSON.stringify(doc)) };
  const calls = [];
  let left = conflicts;
  const db = {
    store, calls,
    async getUser() { return uid ? { id: uid } : null; },
    async getUserGoals(kind, opts) { calls.push(['get', kind, opts]); return failRead ? null : JSON.parse(JSON.stringify(store.doc)); },
    async saveUserGoals(kind, next, opts) { calls.push(['save', kind, opts]); if (failWrite) return { error: { message: 'x' } }; store.doc = next; return { ok: true }; },
  };
  if (cas) db.saveUserGoalsIfRev = async (kind, next, rev, who) => {
    calls.push(['cas', kind, rev, who]);
    if (failWrite) return { error: { message: 'x' } };
    if (left > 0) { left -= 1; store.doc = { ...store.doc, goals: [...(store.doc.goals || []), { id: 'other', t: 'from another tab' }], rev: (store.doc.rev || 0) + 1 }; return { conflict: true }; }
    if ((store.doc.rev == null ? null : String(store.doc.rev)) !== rev) return { conflict: true };
    store.doc = next; return { ok: true };
  };
  return db;
}

test('every write reads the saved document, applies its change to it, and saves only if nobody wrote in between', async () => {
  const db = fakeDb({ doc: { goals: [{ id: 'a', t: 'A' }], rev: 4 } });
  const res = await CG.writeGoalsDoc(db, 'trainer', (d) => CG.removeGoal(d, 'a'));
  assert.equal(res.ok, true);
  assert.deepEqual(db.store.doc, { goals: [], rev: 5 });
  assert.deepEqual(db.calls, [['get', 'trainer', { expectedUserId: 'u1' }], ['cas', 'trainer', '4', 'u1']]);
  // Another tab wrote between the read and the save: read again, apply again, and keep its goal.
  const raced = fakeDb({ doc: { goals: [{ id: 'a', t: 'A' }] }, conflicts: 1 });
  const again = await CG.writeGoalsDoc(raced, 'trainer', (d) => CG.archiveGoals(d, { now: NOW }));
  assert.equal(again.ok, true);
  assert.deepEqual(raced.store.doc.archived.map((g) => g.id), ['a', 'other'], 'the other tab\'s goal is archived too, not lost');
  assert.equal(raced.calls.filter((c) => c[0] === 'get').length, 2);
  // Lost every try: nothing written.
  const busy = fakeDb({ doc: { goals: [] }, conflicts: 99 });
  assert.deepEqual(await CG.writeGoalsDoc(busy, 'trainer', (d) => d), { ok: false, reason: 'contended' });
  assert.equal(busy.calls.filter((c) => c[0] === 'cas').length, CG.CAS_TRIES);
});

test('a failed read writes nothing; signed out, a failed write and an older backend are each said', async () => {
  const unread = fakeDb({ failRead: true });
  assert.deepEqual(await CG.writeGoalsDoc(unread, 'trainer', () => ({ goals: [] })), { ok: false, reason: 'unreadable' });
  assert.equal(unread.calls.some((c) => c[0] !== 'get'), false, 'an empty document is never saved over one that could not be read');
  assert.deepEqual(await CG.writeGoalsDoc(fakeDb({ uid: null }), 'trainer', (d) => d), { ok: false, reason: 'signed-out' });
  assert.deepEqual(await CG.writeGoalsDoc(fakeDb({ failWrite: true }), 'trainer', (d) => d), { ok: false, reason: 'write-failed' });
  assert.deepEqual(await CG.writeGoalsDoc(null, 'trainer', (d) => d), { ok: false, reason: 'write-failed' });
  const old = fakeDb({ cas: false, doc: { goals: [{ id: 'a' }] } });
  assert.equal((await CG.writeGoalsDoc(old, 'nutritionist', (d) => CG.removeGoal(d, 'a'))).ok, true);
  assert.deepEqual(old.calls.at(-1), ['save', 'nutritionist', { expectedUserId: 'u1' }], 'bound to the account');
  const switched = fakeDb();
  switched.saveUserGoalsIfRev = async () => ({ accountChanged: true });
  assert.deepEqual(await CG.writeGoalsDoc(switched, 'trainer', (d) => d), { ok: false, reason: 'account-changed' });
});

// ── The series ──────────────────────────────────────────────────────────────────────────────
test('each bound figure has its series: the trajectory\'s weeks, the recorded readings, the programs\' dates', () => {
  const live = liveOf([10, 11, 12]);
  const clients = CG.seriesFor({ metric: 'activeClients' }, { live }, NOW);
  assert.deepEqual(clients, [{ on: '2026-10-25', value: 10 }, { on: '2026-11-01', value: 11 }, { on: TODAY, value: 12 }], 'each week at its end; this week at today');
  assert.deepEqual(CG.seriesFor({ metric: 'mrrNetMonthly' }, { live }, NOW).map((p) => p.value), [1500, 1650, 1800], 'net a month in dollars');
  assert.equal(CG.seriesFor({ metric: 'activeClients' }, { live: { kind: 'unknown' } }, NOW), null, 'unread is no series, not an empty one');
  const readings = { kind: 'live', adherence: [{ on: '2026-10-29', value: 81 }, { on: '2026-10-22', value: 78 }, { on: 'bad', value: 1 }], programs: { published: ['2026-09-30', '2026-10-01', '2026-10-20', '2026-11-04', 'junk'] } };
  assert.deepEqual(CG.seriesFor({ metric: 'adherencePct' }, { readings }, NOW), [{ on: '2026-10-22', value: 78 }, { on: '2026-10-29', value: 81 }]);
  assert.equal(CG.seriesFor({ metric: 'adherencePct' }, { readings: { kind: 'loading' } }, NOW), null);
  const pg = { metric: 'programsPublished', startDate: '2026-10-01' };
  assert.deepEqual(CG.seriesFor(pg, { readings }, NOW), [
    { on: '2026-10-01', value: 1 }, { on: '2026-10-08', value: 1 }, { on: '2026-10-15', value: 1 }, { on: '2026-10-22', value: 2 }, { on: '2026-10-29', value: 2 }, { on: TODAY, value: 3 },
  ], 'counted from the start date: the one published the day before is not this goal\'s');
  assert.equal(CG.programsBound(pg, readings, NOW), 3);
  assert.equal(CG.programsBound({ metric: 'programsPublished' }, readings, NOW), 3, 'no start date: this quarter (Q4 opens Oct 1)');
  assert.equal(CG.programsBound(pg, { kind: 'loading' }, NOW), 'loading');
  assert.equal(CG.programsBound(pg, { kind: 'unknown' }, NOW), null);
  assert.equal(CG.programsBound(pg, { kind: 'live', programs: null }, NOW), null);
  assert.deepEqual(CG.seriesFor({ cur: 3, history: [{ on: '2026-10-01', value: 1 }] }, {}, NOW), [{ on: '2026-10-01', value: 1 }], 'a typed goal: its own readings');
  assert.deepEqual([CG.quarterStart(NOW), CG.quarterEnd(NOW), CG.quarterEnd(new Date(2026, 1, 3))], ['2026-10-01', '2026-12-31', '2026-03-31']);
});

// ── The outlook ─────────────────────────────────────────────────────────────────────────────
test('the pace is the engine\'s own projectGoal, not a copy of it', () => {
  const seen = [];
  const spy = { ...DS, projectGoal: (g, now, asOf) => { seen.push(g); return DS.projectGoal(g, now, asOf); } };
  const g = { tgt: 20, metric: 'activeClients', due: '2026-12-31', startDate: '2026-10-20' };
  CG.goalOutlook(g, CG.seriesFor(g, { live: liveOf([10, 11, 12, 13, 14, 15, 16]) }, NOW), { now: NOW, current: 16, signals: spy });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].target, 20);
  assert.equal(seen[0].start, 13, 'the start is where the figure stood on the start date: the last reading on or before it (Oct 18), not the window\'s first');
  // Readings a week old: today's figure is today's reading, so the pace runs to now.
  const a = { tgt: 90, pct: true, metric: 'adherencePct', start: 70, due: '2026-12-31' };
  CG.goalOutlook(a, [{ on: '2026-10-22', value: 78 }, { on: '2026-10-29', value: 81 }], { now: NOW, current: 84, signals: spy });
  assert.deepEqual(seen[1].history.at(-1), { on: TODAY, value: 84 });
  assert.equal(seen[1].start, 70, 'the coach\'s own start stands');
  const src = stripComments(read('public/newdesign/coachGoals.js'));
  assert.match(src, /S\.projectGoal\(/);
  assert.doesNotMatch(src, /slope|least|GOAL_FAR_DAYS/i, 'no second least-squares fit');
});

test('on track, off track with where it is heading, reached, missed, and too few readings', () => {
  const rising = liveOf([8, 9, 10, 11, 12, 13, 14, 15, 16]); // one a week
  const g = { tgt: 20, metric: 'activeClients', startDate: '2026-10-01', due: '2026-12-31' };
  const s = CG.seriesFor(g, { live: rising }, NOW);
  const on = CG.goalOutlook(g, s, { now: NOW, current: 16 });
  assert.equal(on.state, 'on');
  assert.match(on.line, /^On track · gets there Dec \d+, \d+ days early$/);
  const off = CG.goalOutlook({ ...g, tgt: 30 }, s, { now: NOW, current: 16 });
  assert.equal(off.state, 'off');
  assert.ok(Math.abs(off.heading - (16 + 56 / 7)) < 0.6, 'eight more weeks at one a week: about 24 by Dec 31, got ' + off.heading);
  assert.match(off.line, /^Off track · heading for 24 by Dec 31, not 30 · gets there .+, \d+ days late$/);
  const flat = CG.seriesFor(g, { live: liveOf([16, 16, 16, 16, 16, 16, 16, 16, 16]) }, NOW);
  const stalled = CG.goalOutlook(g, flat, { now: NOW, current: 16 });
  assert.deepEqual([stalled.state, stalled.line], ['off', 'Off track · heading for 16 by Dec 31, not 20']);
  assert.deepEqual([CG.goalOutlook({ ...g, due: undefined }, flat, { now: NOW, current: 16 }).state, CG.goalOutlook({ ...g, due: undefined }, flat, { now: NOW, current: 16 }).line], ['stalled', 'Pace stalled']);
  const done = CG.goalOutlook({ ...g, tgt: 12 }, s, { now: NOW, current: 16 });
  assert.equal(done.state, 'done');
  assert.match(done.line, /^Reached .+ ✓$/);
  const missed = CG.goalOutlook({ ...g, due: '2026-11-01' }, s, { now: NOW, current: 16 });
  assert.deepEqual([missed.state, missed.line], ['missed', 'Was due Nov 1 · 16 of 20']);
  const fresh = CG.goalOutlook({ tgt: 10, cur: 3, history: [{ on: TODAY, value: 3 }] }, [{ on: TODAY, value: 3 }], { now: NOW, current: 3 });
  assert.equal(fresh.state, 'unknown');
  // A percent heads no higher than 100 and nothing goes below none; money reads as money.
  const falling = [{ on: '2026-10-01', value: 90 }, { on: '2026-10-29', value: 60 }];
  const pct = CG.goalOutlook({ tgt: 95, pct: true, metric: 'adherencePct', due: '2026-12-31' }, falling, { now: NOW, current: 55 });
  assert.equal(pct.heading, 0);
  assert.match(pct.line, /heading for 0% by Dec 31, not 95%/);
  const money = CG.goalOutlook({ tgt: 3000, money: true, metric: 'mrrNetMonthly', due: '2026-12-31' }, CG.seriesFor({ metric: 'mrrNetMonthly' }, { live: rising }, NOW), { now: NOW, current: 2400 });
  assert.match(money.line, /^(On track|Off track · heading for \$[\d,]+ by Dec 31, not \$3,000)/);
  assert.equal(CG.goalOutlook({ tgt: null }, s, { now: NOW }), null);
  assert.equal(CG.goalOutlook(g, [], { now: NOW }), null, 'no figure at all: nothing to say');
});

test('on track to the day: gets there on the due date is on track, a day after is not', () => {
  // A typed figure rising one a day, 28 today: 30 is two days away, Nov 7.
  const history = [0, 7, 14, 21, 28].map((v, i) => ({ on: day(-28 + i * 7), value: v }));
  const g = { tgt: 30, cur: 28, history };
  const at = (due) => CG.goalOutlook({ ...g, due }, CG.seriesFor(g, {}, NOW), { now: NOW, current: 28 });
  assert.deepEqual([at('2026-11-08').state, at('2026-11-08').line], ['on', 'On track · gets there Nov 7, 1 day early']);
  assert.deepEqual([at('2026-11-07').state, at('2026-11-07').line], ['on', 'On track · gets there Nov 7, on the day']);
  assert.equal(at('2026-11-06').state, 'off');
  assert.match(at('2026-11-06').line, /^Off track · heading for 29 by Nov 6, not 30 · gets there Nov 7, 1 day late$/);
});

test('programs published: on pace from none, against the due date', () => {
  const readings = { kind: 'live', programs: { published: ['2026-10-10', '2026-10-28'] } };
  const g = { tgt: 4, metric: 'programsPublished', startDate: '2026-10-01', due: '2026-12-31' };
  const out = CG.goalOutlook(g, CG.seriesFor(g, { readings }, NOW), { now: NOW, current: CG.programsBound(g, readings, NOW) });
  assert.ok(['on', 'off'].includes(out.state), out.line);
  assert.doesNotMatch(out.line, /\d\.\d/, 'programs come whole');
});

// ── The pages ───────────────────────────────────────────────────────────────────────────────
const PAGES = [['trainer', 'public/newdesign/trainerGoalPage.jsx'], ['nutritionist', 'public/newdesign/nutritionistGoalPage.jsx']];

test('both Goal pages: Archive asks and keeps the goals; it never empties the list', () => {
  for (const [role, file] of PAGES) {
    const src = stripComments(read(file));
    assert.doesNotMatch(src, /persist\(\{ \.\.\.state, goals: \[\] \}\)/, role + ': the old delete-all');
    assert.doesNotMatch(src, /saveUserGoals\(/, role + ': no blind whole-document save is left');
    assert.match(src, /<button onClick=\{archiveGoals\} disabled=\{!goals\.length\}/, role);
    assert.match(src, /if \(!\(await window\.ShapeConfirm\.open\(\{ title: "Archive these goals\?"[^]*?danger: false \}\)\)\) return;/, role + ': it asks first');
    assert.match(src, /persistOp\(\(doc\) => CoachGoals\.archiveGoals\(doc, \{ now: new Date\(\), finals \}\), "Archived\."\);/, role);
    assert.match(src, /\{archived\.length > 0 && \(\s*<GoalArchiveCard archived=\{archived\} open=\{showArchived\} onToggle=\{\(\) => setShowArchived\(v => !v\)\} onRestore=\{restoreGoal\} \/>/, role + ': the archive is shown, with Restore');
    assert.match(src, /\{outlook && outlook\.line && <div style=\{\{ fontSize: 12\.5, lineHeight: 1\.5, marginTop: 8, color: GOAL_OUTLOOK_INK\[outlook\.state\]/, role + ': the pace line is drawn');
    assert.match(src, new RegExp(`const res = await CoachGoals\\.writeGoalsDoc\\(window\\.shapeDb, "${role}", \\(doc\\) => change\\(goalsDocState\\(doc\\)\\)\\);`), role + ': every save is compare-and-set');
    assert.match(src, /setState\(before\);/, role + ': a failed save puts the page back');
    assert.match(src, /persistOp\(\(doc\) => \(\{ \.\.\.doc, momentum: m \}\)\)/, role + ': momentum too');
    assert.match(src, new RegExp(`const readings = useCoachGoalReadings\\("${role}"\\);`), role);
    assert.match(src, /CoachGoals\.goalOutlook\(g, CoachGoals\.seriesFor\(g, \{ live, readings \}, new Date\(\)\), \{ now: new Date\(\), current: liveCur \}\)/, role + ': the card shows its pace');
    assert.match(src, /<Field label="START VALUE" type="number"/, role);
    assert.match(src, /<Field label="START DATE" type="date"/, role);
    assert.match(src, /<Field label="DUE DATE" type="date"/, role);
    assert.match(src, /const badDates = !!\(g\.startDate && g\.due && g\.due < g\.startDate\);/, role);
    // Ids are the goal's, the same on every read, so a re-applied change finds the goal that was opened.
    assert.match(src, /\.map\(\(g, i\) => \(g && g\.id\) \? g : \{ \.\.\.g, id: "goal" \+ i \}\)/, role);
    assert.doesNotMatch(src, /editGoalIdx/, role + ': edited by id, not by place');
  }
});

test('the pages load the module after the engine, and dashData offers programs published with its unit', () => {
  for (const html of ['public/newdesign/TrainerApp.html', 'public/newdesign/NutritionistApp.html']) {
    const src = read(html);
    const engine = src.indexOf('<script src="dashSignals.js');
    const mod = src.indexOf('<script src="coachGoals.js"></script>');
    assert.ok(engine > 0 && mod > engine, html + ': coachGoals.js after dashSignals.js');
    assert.ok(mod < src.indexOf('GoalPage.jsx'), html + ': before the Goal page');
  }
  const DATA = read('public/newdesign/dashData.jsx');
  const fn = (name) => {
    const at = DATA.indexOf('function ' + name + '(');
    let depth = 0;
    for (let j = DATA.indexOf('{', DATA.indexOf(')', at)); j < DATA.length; j++) {
      if (DATA[j] === '{') depth++;
      else if (DATA[j] === '}' && --depth === 0) return DATA.slice(at, j + 1);
    }
    return '';
  };
  const api = new Function('window', fn('goalMetricsFor') + fn('goalMetricUnit') + fn('goalLiveValue') + '\nreturn { goalMetricsFor, goalMetricUnit, goalLiveValue };')({ CoachGoals: CG });
  for (const role of ['trainer', 'nutritionist']) {
    const keys = api.goalMetricsFor(role).map(([k]) => k);
    assert.deepEqual(keys, ['', 'activeClients', 'mrrNetMonthly', 'adherencePct', 'programsPublished']);
  }
  assert.deepEqual(api.goalMetricUnit('programsPublished'), { money: false, pct: false });
  const readings = { kind: 'live', programs: { published: [CG.localDay(new Date())] } };
  assert.equal(api.goalLiveValue('programsPublished', { kind: 'loading' }, { startDate: '2000-01-01' }, readings), 1, 'counted from the goal, not the analytics read');
  assert.equal(api.goalLiveValue('programsPublished', { kind: 'live' }, {}, { kind: 'loading' }), 'loading');
  assert.equal(api.goalLiveValue('activeClients', { kind: 'live', activeClients: 4 }), 4, 'the others read as before');
  assert.match(DATA, /function useCoachGoalReadings\(role\) \{/);
  assert.match(DATA, /_dashJson\("\/api\/coach\/goal-readings\?role=" \+ encodeURIComponent\(role\)\)/);
  assert.match(DATA, /useCoachLiveFigures, useCoachGoalReadings, coachLiveMomentum,/);
});
