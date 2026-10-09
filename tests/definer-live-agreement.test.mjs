// The static model against the LIVE catalog, and an honest account of where they differ.
//
// tests/fixtures/definer-live-2026-10-08.json is what the production database said on that date
// (which non-trigger definers anon can execute, which trigger definers exist, and which definers of
// either kind lack a pg_temp pin); scripts/definer-live-check.sql re-reads it. This test replays the
// migrations as of the capture and compares, function by function.
//
// WHY THE DRIFT LIST IS THE POINT. The model cannot see a privilege changed by hand, a function
// created outside the migrations, or a migration applied out of order. Those are exactly the
// cases the live catalog exists to catch, so every disagreement has to be NAMED with a reason in
// KNOWN_MODEL_DRIFT below, and the test fails on a NEW one (read it before allowing it) and on a
// stale one (the explanation stopped being true). Drift cannot grow silently, and a fixed one
// cannot linger as a false comfort.
//
// AGREEMENT ON 2026-10-08: all 138 live non-trigger definers are in the model and the model gets
// anon-executability right for every one (83 anon, 55 not), with the same single unpinned definer
// (save_workout_session). Of the 12 trigger definers on each side, 11 are the same functions; the two
// that are not are KNOWN_MODEL_DRIFT's whole content, and one of them is a defect in production, not
// in the model (read its reason). That is a measurement about 2026-10-08, not a promise: the two
// move apart the moment someone edits the live database, and this file is where that shows up.
// The 2026-09-30 capture this one replaced agreed on all 136 non-trigger definers of its day (85
// anon, 51 not) and could say nothing about trigger definers; a third witness agreed with the model
// that day too, a throwaway local cluster (not checked in) replaying the 637 function-relevant
// statements on PostgreSQL 16.13, which gave the same 193 functions, field for field.
//
// ⚠ BUT THE MODEL HAS NEVER REPRODUCED A LIVE COUNT ON ANY EARLIER DAY. The pg_temp sweep's own
// header records what production held when it was written (2026-08-09-definer-pg-temp-sweep.sql:21-28),
// and replaying the migrations through that date, with the sweep itself left out because those counts
// are from before it, gives:
//                                  definers  pinned  unpinned  anon  authenticated  service-role only
//     live, 2026-08-14 (recorded)      132      19      113      92      102             11
//     model through 2026-08-14         136      21      115      94      104             11
//     live, 2026-07-31 (recorded)      131      18      113       .       .              .
//     model through 2026-07-31         133      14      119     103     112               7
// (the model also counts 181 functions in public against the recorded 175). On both days the model
// has more definers and more unpinned ones than production recorded, and on 07-31 fewer pinned. That
// is consistent with migrations applied out of filename-date order, which is the model's stated
// blind spot, with functions changed or dropped by hand, or with a recorded count that counted
// something else; nothing here settles which. The 2026-10-08 comparison found one such case by name
// (messages_touch_conversation, below). A test below pins both sides of that table (the recorded
// numbers are read out of the sweep's own header), so a number here cannot drift from the code or
// from the file.
//
// TRIGGER DEFINERS. The audit has one scope (see tests/helpers/definer-live.mjs): anon-executability
// over NON-trigger definers, the search_path pin over ALL definers. The fixture lists the trigger
// definers by name (`triggerDefiners`), so the model's are confirmed against production rather than
// assumed: compareToLive reports a trigger definer only one side has as drift of its own kind.
//
// THE CAPTURE DAY. A capture has a date and no time, so a migration dated the day it was taken may
// or may not have been applied by then. The replay takes files dated STRICTLY BEFORE `capturedOn`
// plus the capture-day files the capture records as applied before it was taken
// (`captureDayFilesApplied`; modelAsOfCapture). That record is checked by the comparison itself: a
// file the capture did not see puts functions or grants in the model that live lacks, and that is
// drift. A capture-day file the capture does NOT record as applied stays outside the replay, and a
// disagreement it could explain is reported as ambiguous with a re-capture as the remedy, not as an
// entry in KNOWN_MODEL_DRIFT.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from './helpers/definer-model.mjs';
import { compareToLive, checkDrift, allowListAsOfCapture, modelAsOfCapture, captureDayFiles, ambiguousCaptureDayFiles } from './helpers/definer-live.mjs';
import { diffLive } from '../scripts/definer-live-diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = JSON.parse(fs.readFileSync(join(ROOT, 'tests/fixtures/definer-live-2026-10-08.json'), 'utf8'));
const ALLOW = JSON.parse(fs.readFileSync(join(ROOT, 'tests/fixtures/definer-anon-allowlist.json'), 'utf8'));

// { kind, name, live, model, reason }. Every entry was read before it was allowed (see the header).
const KNOWN_MODEL_DRIFT = [
  {
    kind: 'trigger-live-only', name: 'rls_auto_enable', live: 'trigger definer', model: 'absent',
    reason: 'An event-trigger definer (search_path pg_catalog, pg_temp; read live 2026-10-08) that exists in production and in no migration: it was created by hand or by the platform, and nothing in this repo describes it, so the model cannot know it. Named in the pg_temp sweep (2026-08-09-definer-pg-temp-sweep.sql:25) and in 2026-08-12-revoke-anon-write-providers.sql:31. It is pinned, so the pin audit has nothing against it.',
  },
  {
    kind: 'trigger-model-only', name: 'messages_touch_conversation', live: 'absent', model: 'trigger definer',
    reason: 'A defect in production, found by this comparison on 2026-10-08. 2026-05-02-conversations-messages.sql creates the function and an AFTER INSERT trigger of the same name on public.messages, which writes conversations.last_message, last_message_at and updated_at; no migration drops either. Live, neither exists: pg_proc has no function of that name and public.messages carries one trigger, messages_notify (read 2026-10-08). The app relies on it (src/app/api/conversations/[id]/messages/route.ts says the trigger updates the preview), so in production a sent message never refreshes its conversation\'s preview or its last_message_at ordering. Production held 0 conversations and 0 messages when this was read (2026-10-08), so nothing is stale yet; the first message will be. The restore is 2026-10-09-restore-messages-touch-conversation.sql (the function with pg_temp pinned, the trigger, a backfill), dated after this capture, so the replay this test runs does not see it; until the owner runs it and the catalog is captured again, this entry says the model is right and production is wrong. When a capture lists the trigger, delete this entry.',
  },
];

// The migrations dated STRICTLY BEFORE the capture day, plus the capture-day files the capture
// records as applied (see the header). A PR that adds a function dated after 2026-10-08 is the
// grants test's business until the live catalog is captured again (paste scripts/definer-live-check.sql's
// rows into a new dated fixture, record the capture-day files it saw, and point LIVE at it).
const MIGRATIONS = join(ROOT, 'supabase-migrations');
const model = modelAsOfCapture(MIGRATIONS, LIVE);
const ambiguousFiles = ambiguousCaptureDayFiles(MIGRATIONS, LIVE);

test('the live fixture is a dated, well-formed capture', () => {
  assert.match(LIVE.capturedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(LIVE.source.length > 100, 'says where the names came from and how to re-read them');
  for (const key of ['anonExecutable', 'notAnonExecutable']) {
    const list = LIVE[key];
    assert.ok(Array.isArray(list) && list.length > 0 && list.every((n) => typeof n === 'string' && n.length > 0), key);
    assert.equal(new Set(list).size, list.length, `${key} lists a name twice`);
    assert.deepEqual(list, [...list].sort(), `${key} must stay sorted so a diff of the fixture reads`);
  }
  assert.deepEqual(LIVE.anonExecutable.filter((n) => LIVE.notAnonExecutable.includes(n)), [], 'a name cannot be both');
  assert.equal(LIVE.anonExecutable.length, 83);
  assert.equal(LIVE.notAnonExecutable.length, 55);
  assert.ok(Array.isArray(LIVE.triggerDefiners) && LIVE.triggerDefiners.length === 12, 'the trigger definers are listed');
  assert.deepEqual(LIVE.triggerDefiners, [...LIVE.triggerDefiners].sort());
  assert.deepEqual(LIVE.triggerDefiners.filter((n) => LIVE.anonExecutable.includes(n) || LIVE.notAnonExecutable.includes(n)), [], 'a trigger function is not an RPC');
  assert.deepEqual(LIVE.definersWithoutPgTemp, ['save_workout_session']);
  assert.match(LIVE.scope, /triggerDefiners/);
  // The capture-day files it saw: each dated the capture day and present in the tree (modelAsOfCapture
  // and replayDir refuse anything else), and here all four of them, so nothing is ambiguous.
  assert.deepEqual(LIVE.captureDayFilesApplied, captureDayFiles(MIGRATIONS, LIVE));
  assert.deepEqual(ambiguousFiles, []);
});

test('the model and the live catalog agree, and every disagreement is named', (t) => {
  const cmp = compareToLive(model, LIVE);
  const problems = checkDrift(cmp, KNOWN_MODEL_DRIFT, { capturedOn: LIVE.capturedOn, ambiguousFiles });
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
  const drift = cmp.drift.length;
  t.diagnostic(`live ${cmp.liveNames} definers (${LIVE.anonExecutable.length} anon, ${LIVE.notAnonExecutable.length} not) vs model ${cmp.modelNames}: ${cmp.compared} compared, ${cmp.agree} agree (${cmp.agreeAnon} anon, ${cmp.agreeNoAnon} not), ${cmp.triggersCompared} trigger definers on both sides, ${drift} drift (${KNOWN_MODEL_DRIFT.length} known); pin state agrees: ${cmp.pinAgree}`);
  assert.equal(cmp.liveNames, LIVE.anonExecutable.length + LIVE.notAnonExecutable.length);
  assert.equal(cmp.agree, 138, 'every non-trigger definer agrees');
  assert.equal(cmp.triggersCompared, 11);
  assert.equal(cmp.pinAgree, true);
  assert.deepEqual(cmp.drift.map((d) => d.kind).sort(), ['trigger-live-only', 'trigger-model-only'], 'the only drift is the two trigger definers the header names');
});

test('the comparison window: files dated after the capture day, and capture-day files the capture does not record, are outside the replay', (t) => {
  const all = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
  const outside = all.filter((f) => M.migrationDate(f) >= LIVE.capturedOn);
  assert.equal(model.files.length, all.length - outside.length + LIVE.captureDayFilesApplied.length);
  for (const f of LIVE.captureDayFilesApplied) assert.ok(model.files.includes(f), `${f} is replayed: the capture records it as applied`);
  t.diagnostic(`${model.files.length} migrations were replayed: those dated before ${LIVE.capturedOn} plus ${LIVE.captureDayFilesApplied.length} dated that day that the capture saw; ${outside.length - LIVE.captureDayFilesApplied.length} are outside the capture`);
  const fn = (name) => `create function public.${name}() returns int language sql security definer as $$ select 1 $$;`;
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'definer-window-'));
  try {
    fs.writeFileSync(join(dir, '2026-09-29-old.sql'), fn('older'));
    fs.writeFileSync(join(dir, '2026-10-01-new.sql'), fn('later'));
    fs.writeFileSync(join(dir, '20260930235959_compact.sql'), fn('same_day'));
    fs.writeFileSync(join(dir, '2026-09-30-dashed.sql'), fn('same_day_dashed'));
    const names = (opts) => [...M.replayDir(dir, opts).fns.keys()].sort();
    assert.deepEqual(names({ before: '2026-09-30' }), ['public.older()'], 'a file dated ON the capture day is outside the replay (compact and dashed spellings alike), and so is one dated after');
    assert.deepEqual(names({ through: '2026-09-30' }), ['public.older()', 'public.same_day()', 'public.same_day_dashed()'], '`through` keeps the day itself');
    assert.equal(names({}).length, 4, 'no window reads everything');
    assert.throws(() => M.replayDir(dir, { through: '2026-09-30', before: '2026-09-30' }), /`through` or `before`, not both/);
    // `including`: a capture-day file the capture records as applied joins the replay; a name the
    // directory lacks is refused, so a typo cannot include nothing and pass.
    assert.deepEqual(names({ before: '2026-09-30', including: ['2026-09-30-dashed.sql'] }), ['public.older()', 'public.same_day_dashed()']);
    assert.throws(() => M.replayDir(dir, { before: '2026-09-30', including: ['2026-09-30-typo.sql'] }), /`including` names 2026-09-30-typo\.sql, which is not a migration/);
    // The fixture-level helpers draw the same line from the capture's own record.
    const seen = { capturedOn: '2026-09-30', captureDayFilesApplied: ['2026-09-30-dashed.sql'] };
    assert.deepEqual(captureDayFiles(dir, seen).sort(), ['2026-09-30-dashed.sql', '20260930235959_compact.sql'], 'both spellings of the day, in the replay order');
    assert.deepEqual(ambiguousCaptureDayFiles(dir, seen), ['20260930235959_compact.sql'], 'the capture-day file the capture does not record stays ambiguous');
    assert.deepEqual([...modelAsOfCapture(dir, seen).fns.keys()].sort(), ['public.older()', 'public.same_day_dashed()']);
    assert.deepEqual(ambiguousCaptureDayFiles(dir, { capturedOn: '2026-09-30' }).sort(), ['2026-09-30-dashed.sql', '20260930235959_compact.sql'], 'a capture with no record leaves every capture-day file ambiguous');
    assert.throws(() => modelAsOfCapture(dir, { capturedOn: '2026-09-30', captureDayFilesApplied: ['2026-10-01-new.sql'] }), /not dated the capture day 2026-09-30/);
    assert.throws(() => modelAsOfCapture(dir, { capturedOn: '2026-09-30', captureDayFilesApplied: ['2026-09-29-old.sql'] }), /not dated the capture day/, 'a file dated earlier is in the replay already');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('agreement is real: the model reaches the live answer without being told it', () => {
  // The model is fed migrations only. If it were reading the fixture, breaking one of its rules
  // could not move this count, and the mutation round shows that it does.
  const cmp = compareToLive(model, LIVE);
  assert.equal(cmp.agreeAnon + cmp.agreeNoAnon, cmp.agree);
  assert.ok(cmp.agree >= 100, `only ${cmp.agree} functions agree`);
});

test('the live anon-executable set is fully accounted for by the allow-list', () => {
  // Entries for functions no pre-capture migration creates are the grants test's business until a
  // re-capture (allowListAsOfCapture says why); the rest must match the capture exactly.
  const { allow: ALLOW_AT_CAPTURE, pending } = allowListAsOfCapture(ALLOW, model);
  const fullModel = M.replayDir(MIGRATIONS);
  for (const name of pending) {
    assert.ok(!LIVE.anonExecutable.includes(name) && !LIVE.notAnonExecutable.includes(name), `${name} is set aside as post-capture but the capture has it — it is not pending, so classify it against the capture`);
    assert.ok([...fullModel.fns.values()].some((f) => f.name === name), `${name} is in the allow-list but no migration creates it at all — that is stale, not pending`);
  }
  const unpinned = new Set(LIVE.definersWithoutPgTemp);
  const rows = [
    ...LIVE.anonExecutable.map((proname) => ({ proname, is_trigger: false, anon_executable: true, pg_temp_pinned: !unpinned.has(proname) })),
    ...LIVE.notAnonExecutable.map((proname) => ({ proname, is_trigger: false, anon_executable: false, pg_temp_pinned: !unpinned.has(proname) })),
    ...LIVE.triggerDefiners.map((proname) => ({ proname, is_trigger: true, anon_executable: false, pg_temp_pinned: !unpinned.has(proname) })),
  ];
  const d = diffLive(rows, ALLOW_AT_CAPTURE);
  assert.deepEqual(d.unaccounted, [], 'a live anon-executable definer with no entry and no registered finding');
  assert.deepEqual(d.unregisteredPins, []);
  assert.deepEqual(d.doubleListed, []);
  assert.deepEqual(d.stale, [], 'an allow-list entry the live catalog no longer supports');
  assert.deepEqual(d.appliedLive, [], 'a fixedAfterCapture item the capture already shows fixed: delete it');
  assert.deepEqual(d.stalePins, []);
  assert.equal(d.anonExecutable, 83);
  assert.equal(d.allowListed + d.registered, 83);
  assert.equal(d.triggerDefiners, 12);
});

// Helpers for the tests that drive the comparison on a small model with a hand-made "live".
const fn = (name, attrs = 'security definer set search_path = public, pg_temp') => `create function public.${name}() returns int language sql ${attrs} as $$ select 1 $$;`;
const small = (sql) => M.replay([{ file: 's.sql', sql }]);
const liveOf = (anon, no, unpinned = []) => ({ anonExecutable: anon, notAnonExecutable: no, definersWithoutPgTemp: unpinned });

test('the model does not reproduce the counts the sweep file recorded from production (measured, so the header stays true)', () => {
  const SWEEP = '2026-08-09-definer-pg-temp-sweep.sql';
  const header = fs.readFileSync(join(MIGRATIONS, SWEEP), 'utf8');
  const num = (re) => { const m = re.exec(header); assert.ok(m, `the sweep header no longer says ${re}`); return m.slice(1).map(Number); };
  const [inPublic, definers, pinned] = num(/(\d+) functions in public \| (\d+) SECURITY DEFINER \| (\d+) already pinned/);
  const [unpinned] = num(/(\d+) unpinned \| \d+ carrying no search_path at all/);
  const [anon, authenticated, serviceOnly] = num(/Of the \d+: (\d+) anon-executable, (\d+) authenticated-executable, (\d+) service-role only/);
  const [dJul, pJul, uJul] = num(/recorded \d+\/(\d+)\/(\d+)\/(\d+)\/\d+ as of 2026-07-31/);
  assert.deepEqual({ inPublic, definers, pinned, unpinned, anon, authenticated, serviceOnly }, { inPublic: 175, definers: 132, pinned: 19, unpinned: 113, anon: 92, authenticated: 102, serviceOnly: 11 });
  assert.deepEqual([dJul, pJul, uJul], [131, 18, 113]);

  // The sweep is left out on purpose: its recorded counts are the state BEFORE it ran.
  const counts = (through) => {
    const files = M.orderedMigrationFiles(MIGRATIONS).filter((f) => M.migrationDate(f) <= through && f !== SWEEP);
    const m = M.replay(files.map((file) => ({ file, sql: fs.readFileSync(join(MIGRATIONS, file), 'utf8') })));
    const all = [...m.fns.values()].filter((f) => f.schema === 'public');
    const defs = all.filter((f) => f.definer);
    const loose = defs.filter((f) => !M.pgTempPinned(f));
    const d = (f) => M.describeFunction(f);
    return {
      inPublic: all.length, definers: defs.length, pinned: defs.length - loose.length, unpinned: loose.length,
      anon: loose.filter((f) => d(f).anon).length, authenticated: loose.filter((f) => d(f).authenticated).length,
      serviceOnly: loose.filter((f) => !d(f).anon && !d(f).authenticated && d(f).service_role).length,
    };
  };
  const aug = counts('2026-08-14');
  assert.deepEqual(aug, { inPublic: 181, definers: 136, pinned: 21, unpinned: 115, anon: 94, authenticated: 104, serviceOnly: 11 });
  const jul = counts('2026-07-31');
  assert.deepEqual([jul.definers, jul.pinned, jul.unpinned], [133, 14, 119]);
  // And so the header's claim is a measurement: if a fix to the model ever makes these equal, this
  // fails and the header paragraph has to be re-read, not silently left saying the opposite.
  assert.notDeepEqual(aug, { inPublic, definers, pinned, unpinned, anon, authenticated, serviceOnly });
  assert.notDeepEqual([jul.definers, jul.pinned, jul.unpinned], [dJul, pJul, uJul]);
});

// ── The scope: anon over non-trigger definers, the pin over ALL definers ─────

test('scope: an unpinned TRIGGER definer in the model is compared on the pin, and agrees only when live lists it too', () => {
  // The model here has one trigger definer with no pg_temp pin. The pin comparison runs over every
  // definer, so live must list it unpinned to agree. Restricting the model's side to non-trigger
  // functions (the shape of the scope disagreement this test exists for) makes both directions wrong.
  const m = small(`${fn('a')}\ncreate function public.tf() returns trigger language plpgsql security definer set search_path = public as $$ begin return new; end $$;`);
  const agree = compareToLive(m, liveOf(['a'], [], ['tf']));
  assert.deepEqual(agree.drift, [], 'live lists the unpinned trigger definer, and so does the model');
  assert.equal(agree.pinAgree, true);
  const c = compareToLive(m, liveOf(['a'], [], []));
  assert.deepEqual(c.drift.map((d) => `${d.kind} ${d.name} live=${d.live} model=${d.model}`), ['pin-mismatch tf live=pinned model=unpinned'], 'live says pinned, the model says its trigger definer is not');
  assert.equal(c.pinAgree, false);
  // ...while the ANON comparison still leaves the trigger function out on both sides.
  assert.equal(c.modelNames, 1);
  assert.equal(compareToLive(m, liveOf(['a', 'tf'], [])).drift.some((d) => d.name === 'tf' && d.kind !== 'pin-mismatch'), true, 'a trigger function live lists as an RPC is live-only: the model has no RPC of that name');
});

test('scope: a name live lists as unpinned that the model has never heard of reads absent, not pinned', () => {
  const c = compareToLive(small(fn('a')), liveOf(['a'], [], ['rls_like_event_trigger']));
  assert.deepEqual(c.drift.map((d) => `${d.kind} ${d.name} live=${d.live} model=${d.model}`), ['pin-mismatch rls_like_event_trigger live=unpinned model=absent']);
});

test('the trigger definers: 12 in the model and 12 live, 11 the same, all pinned on both sides, and the two that differ are named', () => {
  const triggers = [...model.fns.values()].filter((f) => f.schema === 'public' && f.definer && f.trigger).map((f) => f.name).sort();
  assert.equal(triggers.length, 12);
  assert.deepEqual([...model.fns.values()].filter((f) => f.schema === 'public' && f.definer && f.trigger && !M.pgTempPinned(f)), []);
  const live = new Set(LIVE.triggerDefiners);
  assert.deepEqual(LIVE.triggerDefiners.filter((n) => !triggers.includes(n)), ['rls_auto_enable']);
  assert.deepEqual(triggers.filter((n) => !live.has(n)), ['messages_touch_conversation']);
  assert.deepEqual(LIVE.triggerDefiners.filter((n) => LIVE.definersWithoutPgTemp.includes(n)), [], 'every live trigger definer is pinned');
  const known = KNOWN_MODEL_DRIFT.map((k) => `${k.kind} ${k.name}`).sort();
  assert.deepEqual(known, ['trigger-live-only rls_auto_enable', 'trigger-model-only messages_touch_conversation']);
});

test('scope: trigger definers are compared by name when the capture lists them, and not at all when it does not', () => {
  const m = small(`${fn('a')}\ncreate function public.tf() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin return new; end $$;`);
  const same = compareToLive(m, { ...liveOf(['a'], []), triggerDefiners: ['tf'] });
  assert.deepEqual(same.drift, []);
  assert.equal(same.triggersCompared, 1);
  const differ = compareToLive(m, { ...liveOf(['a'], []), triggerDefiners: ['made_by_hand'] });
  assert.deepEqual(differ.drift.map((d) => `${d.kind} ${d.name} live=${d.live} model=${d.model}`).sort(), [
    'trigger-live-only made_by_hand live=trigger definer model=absent',
    'trigger-model-only tf live=absent model=trigger definer',
  ]);
  assert.equal(differ.triggersCompared, 0);
  const silent = compareToLive(m, liveOf(['a'], []));
  assert.equal(silent.triggersCompared, null, 'a capture without the list (the 2026-09-30 shape) is not compared on it');
  assert.deepEqual(silent.drift, []);
});

// ── checkDrift on the capture day ────────────────────────────────────────────

test('drift on the capture day: the message names the ambiguous files and prescribes a re-capture, not an allow entry', () => {
  const m = small(`${fn('a')}\n${fn('b')}`);
  const cmp = compareToLive(m, liveOf(['a'], ['b'])); // b: model says anon, live says not
  const plain = checkDrift(cmp, []);
  assert.match(plain[0], /read why, then add it to KNOWN_MODEL_DRIFT with the reason, or fix the model$/, 'with nothing ambiguous the old remedy stands');
  const withDay = checkDrift(cmp, [], { capturedOn: '2026-09-30', ambiguousFiles: ['2026-09-30-x.sql', '20260930101500_y.sql'] });
  assert.equal(withDay.length, 1);
  assert.match(withDay[0], /^new model\/live disagreement: anon-mismatch b \(live: no-anon, model: anon\)/);
  assert.match(withDay[0], /2 migration file\(s\) are dated on the capture day 2026-09-30 \(2026-09-30-x\.sql, 20260930101500_y\.sql\)/);
  assert.match(withDay[0], /the capture records a date and no time, so it is not known whether it saw them; re-capture with scripts\/definer-live-check\.sql/);
  assert.doesNotMatch(withDay[0], /add it to KNOWN_MODEL_DRIFT/, 'allowing it would record a disagreement that may not exist');
  const none = checkDrift(cmp, [], { capturedOn: '2026-09-30', ambiguousFiles: [] });
  assert.match(none[0], /add it to KNOWN_MODEL_DRIFT/, 'an empty list is no ambiguity');
});

// ── The comparison, driven on a small model with a hand-made "live" ──────────

test('comparison: a function both sides agree on is not drift', () => {
  const m = small(`${fn('a')}\n${fn('b')}\nrevoke all on function public.b() from public, anon;`);
  const c = compareToLive(m, liveOf(['a'], ['b']));
  assert.deepEqual(c.drift, []);
  assert.equal(c.agree, 2);
  assert.equal(c.agreeAnon, 1);
  assert.equal(c.agreeNoAnon, 1);
  assert.equal(c.pinAgree, true);
});

test('comparison: anon-executable in the model and not live is a mismatch, and so is the reverse', () => {
  const m = small(`${fn('a')}\n${fn('b')}\nrevoke all on function public.b() from public, anon;`);
  const c = compareToLive(m, liveOf(['b'], ['a']));
  assert.deepEqual(c.drift.map((d) => `${d.kind} ${d.name} live=${d.live} model=${d.model}`), ['anon-mismatch a live=no-anon model=anon', 'anon-mismatch b live=anon model=no-anon']);
  assert.equal(c.agree, 0);
});

test('comparison: a live definer no migration creates is live-only, and the reverse is model-only', () => {
  const m = small(fn('a'));
  const c = compareToLive(m, liveOf(['a', 'made_by_hand'], ['also_by_hand']));
  assert.deepEqual(c.drift.map((d) => `${d.kind} ${d.name}`), ['live-only also_by_hand', 'live-only made_by_hand']);
  const c2 = compareToLive(small(`${fn('a')}\n${fn('never_applied')}`), liveOf(['a'], []));
  assert.deepEqual(c2.drift.map((d) => `${d.kind} ${d.name} model=${d.model}`), ['model-only never_applied model=anon']);
});

test('comparison: the pin is compared over every definer, and either side can be the odd one out', () => {
  const m = small(`${fn('a', 'security definer set search_path = public')}\n${fn('b')}`);
  assert.equal(compareToLive(m, liveOf(['a', 'b'], [], ['a'])).pinAgree, true);
  const c = compareToLive(m, liveOf(['a', 'b'], [], ['b']));
  assert.deepEqual(c.drift.map((d) => `${d.kind} ${d.name} live=${d.live} model=${d.model}`), ['pin-mismatch a live=pinned model=unpinned', 'pin-mismatch b live=unpinned model=pinned']);
  assert.equal(c.pinAgree, false);
});

test('comparison: a trigger definer is outside the compared set on both sides', () => {
  const m = small(`${fn('a')}\ncreate function public.tf() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin return new; end $$;`);
  const c = compareToLive(m, liveOf(['a'], []));
  assert.deepEqual(c.drift, []);
  assert.equal(c.modelNames, 1);
});

test('comparison: an invoker function is not a definer and is not compared', () => {
  const c = compareToLive(small(`${fn('a')}\n${fn('inv', 'security invoker')}`), liveOf(['a'], []));
  assert.deepEqual(c.drift, []);
});

test('drift: a new disagreement fails, a known one passes, a stale or unexplained one fails', () => {
  const m = small(`${fn('a')}\n${fn('b')}`);
  const cmp = compareToLive(m, liveOf(['a'], ['b'])); // b: model says anon, live says not
  const known = { kind: 'anon-mismatch', name: 'b', live: 'no-anon', model: 'anon', reason: 'Revoked by hand in the dashboard on the day; no migration says so.' };
  assert.match(checkDrift(cmp, [])[0], /^new model\/live disagreement: anon-mismatch b \(live: no-anon, model: anon\)/);
  assert.deepEqual(checkDrift(cmp, [known]), []);
  assert.match(checkDrift(cmp, [{ ...known, live: 'anon' }])[0], /^known drift anon-mismatch b changed/);
  assert.match(checkDrift(cmp, [{ ...known, reason: 'hand' }]).join('\n'), /needs a real reason/);
  const agreeing = compareToLive(m, liveOf(['a', 'b'], []));
  assert.match(checkDrift(agreeing, [known])[0], /^stale known drift: anon-mismatch b no longer disagrees/);
});

test('comparison is by name, so a name with any anon-executable signature counts as anon', () => {
  const m = small('create function public.f(p int) returns int language sql security definer set search_path = public, pg_temp as $$ select 1 $$;\ncreate function public.f(p text) returns int language sql security definer set search_path = public, pg_temp as $$ select 1 $$;\nrevoke all on function public.f(int) from public, anon;');
  assert.equal(compareToLive(m, liveOf(['f'], [])).drift.length, 0, 'the conservative reading; the grants test forbids overloads so this cannot hide one');
});
