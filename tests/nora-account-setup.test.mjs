// Nora sets the account up (src/lib/ai/accountSetup.mjs, the set_up_account action in actions.mjs,
// offered by /api/support/chat). A model's output writes account data here, so the suite drives the
// shipping code against an account store that behaves like the real one: RLS (a row is read and
// written only as its owner), the user_goals touch trigger (updated_at moves on every write), and the
// table defaults of notification_settings. It proves the allowlist, each field's rule, the card,
// Confirm, Undo, the guards that refuse a stale card or a changed value, the rollback of a failed
// apply, and that a proposal for another account, a field off the list or a malformed value is
// refused. The route half drives /api/support/chat with a scripted model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import * as setup from '../src/lib/ai/accountSetup.mjs';
import * as actions from '../src/lib/ai/actions.mjs';
import * as proposals from '../src/lib/ai/proposals.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const NOW = '2026-11-01T12:00:00.000Z';

// ── An account store that behaves like Supabase under RLS ─────────────────────────────────────
// user_goals (PK user_id+kind, updated_at touched on every update), notification_settings (PK
// user_id, the table's defaults), profiles (PK id). Every read and write is the signed-in owner's
// only: a row of another account is invisible and unwritable, an insert for another account is
// refused (42501), a duplicate first row is 23505. `before(op)` runs before each write, so a test
// can land a concurrent edit; `failOn(op)` makes a write answer an error. ⚠ profiles are READABLE
// beyond the owner, as in production (a coach reads their subscribers' profiles:
// providers_read_subscriber_profiles_base), and maybeSingle over several rows is PostgREST's error,
// so a read that forgets its own id is caught here rather than saved by the fake.
function accountDb({ uid = ME, goals = {}, notify = null, profile = { full_name: 'Sam Lee' }, others = true } = {}) {
  let tick = 0;
  const stamp = () => `2026-11-01T00:00:${String(++tick).padStart(2, '0')}.000000+00:00`;
  const t = {
    user_goals: Object.entries(goals).map(([kind, data]) => ({ user_id: uid, kind, data, updated_at: stamp() })),
    notification_settings: notify ? [{ user_id: uid, muted: false, tz: 'UTC', ...setup.NOTIFY_DEFAULTS, ...notify }] : [],
    profiles: [{ id: uid, ...profile }],
  };
  if (others) {
    t.user_goals.push({ user_id: OTHER, kind: 'client_settings', data: { units: 'Imperial · lb / mi' }, updated_at: stamp() });
    t.profiles.push({ id: OTHER, full_name: 'Someone Else' });
  }
  const owner = (table, r) => (table === 'profiles' ? r.id : r.user_id);
  const writes = [];
  const hooks = { before: null, failOn: null };
  const val = (r, col) => r[col];
  function from(table) {
    const st = { op: 'select', filters: [], patch: null, row: null, single: false, ret: false };
    const mine = (r) => owner(table, r) === uid;
    const visible = (r) => table === 'profiles' || mine(r);
    const chain = {
      select() { st.ret = true; return chain; },
      update(patch) { st.op = 'update'; st.patch = patch; return chain; },
      insert(row) { st.op = 'insert'; st.row = row; return chain; },
      upsert() { throw new Error('the setup engine never upserts blind'); },
      delete() { st.op = 'delete'; return chain; },
      eq(col, v) { st.filters.push((r) => val(r, col) === v); return chain; },
      is(col, v) { st.filters.push((r) => (v === null ? r[col] == null : r[col] === v)); return chain; },
      in(col, vs) { st.filters.push((r) => vs.includes(r[col])); return chain; },
      maybeSingle() { st.single = true; return chain; },
      async then(res, rej) {
        try {
          const op = `${table}:${st.op}`;
          if (st.op !== 'select') {
            if (hooks.before) await hooks.before(op, st);
            if (hooks.failOn && hooks.failOn(op, st)) return res({ data: null, error: { message: 'boom', code: 'XX000' } });
          }
          const rows = t[table];
          if (st.op === 'select') {
            const hit = rows.filter((r) => visible(r) && st.filters.every((f) => f(r))).map((r) => JSON.parse(JSON.stringify(r)));
            if (st.single && hit.length > 1) return res({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } });
            return res({ data: st.single ? hit[0] ?? null : hit, error: null });
          }
          if (st.op === 'insert') {
            if (owner(table, st.row) !== uid) return res({ data: null, error: { message: 'new row violates row-level security', code: '42501' } });
            const key = table === 'user_goals' ? (r) => r.user_id === st.row.user_id && r.kind === st.row.kind : (r) => owner(table, r) === owner(table, st.row);
            if (rows.some(key)) return res({ data: null, error: { message: 'duplicate key', code: '23505' } });
            const row = { ...(table === 'notification_settings' ? { muted: false, ...setup.NOTIFY_DEFAULTS } : {}), ...JSON.parse(JSON.stringify(st.row)), ...(table === 'user_goals' ? { updated_at: stamp() } : {}) };
            rows.push(row);
            writes.push({ op, row: JSON.parse(JSON.stringify(row)) });
            return res({ data: [row], error: null });
          }
          if (st.op === 'update') {
            const hit = rows.filter((r) => mine(r) && st.filters.every((f) => f(r)));
            for (const r of hit) { Object.assign(r, JSON.parse(JSON.stringify(st.patch))); if (table === 'user_goals') r.updated_at = stamp(); }
            if (hit.length) writes.push({ op, patch: JSON.parse(JSON.stringify(st.patch)) });
            return res({ data: hit.map((r) => ({ ...r })), error: null });
          }
          if (st.op === 'delete') {
            const keep = rows.filter((r) => !(mine(r) && st.filters.every((f) => f(r))));
            t[table] = keep;
            return res({ data: [], error: null });
          }
          return res({ data: null, error: null });
        } catch (e) { return rej(e); }
      },
    };
    return chain;
  }
  // A concurrent writer: what another device's Settings save does to a user_goals document.
  const touch = (kind, patch) => {
    const r = t.user_goals.find((x) => x.user_id === uid && x.kind === kind);
    if (r) { r.data = { ...r.data, ...patch }; r.updated_at = stamp(); } else t.user_goals.push({ user_id: uid, kind, data: { ...patch }, updated_at: stamp() });
  };
  const goal = (kind, u = uid) => { const r = t.user_goals.find((x) => x.user_id === u && x.kind === kind); return r ? r.data : null; };
  return { from, async rpc() { return { data: null, error: null }; }, t, writes, hooks, touch, goal };
}

const preview = async (db, changes, { roles = ['client'], uid = ME, tz = 'America/New_York' } = {}) => {
  const plan = setup.planSetupChanges({ changes }, { actorId: uid, roles });
  return { plan, built: await setup.buildSetupPreview(db, uid, plan, { now: NOW, tz }) };
};

// ── The allowlist and each field's rule ────────────────────────────────────────────────────────
test('the allowlist: every field names the cells it writes, and nothing else can be written', () => {
  assert.deepEqual([...setup.SETUP_FIELD_KEYS].sort(), [
    'aboutStory', 'alcohol', 'basedIn', 'calorieRange', 'coaching', 'coachingFormat', 'dailyCheckin', 'dailyLimit', 'dietaryStyle', 'equipment',
    'experience', 'goal', 'headline', 'languages', 'name', 'preferredTimes', 'quietEnd', 'quietStart', 'sessionsPerWeek', 'trainingGoal',
    'units', 'weekStarts', 'yearsCoaching',
  ].sort());
  const cells = [...setup.ALLOWED_CELLS];
  // Only the screens' own stores; never a credential, the membership, privacy, health or a role.
  for (const id of cells) assert.match(id, /^(goals:(client_goals|client_identity|client_onboarding|client_training_prefs|client_nutrition_prefs|client_settings|profile_custom):|notify:(quiet_start|quiet_end|daily_cap)$|profile:full_name$)/, id);
  for (const bad of ['profileVisibility', 'shareWorkoutData', 'onlineVisible', 'agePublic', 'email', 'password', 'role', 'muted', 'health', 'allergies', 'injuries']) {
    assert.ok(!cells.some((id) => id.endsWith(`:${bad}`)), `${bad} is never a setup cell`);
  }
  assert.ok(cells.includes('goals:client_onboarding:intentSeen') && !cells.some((id) => /health_profile|consent/i.test(id)), 'the goal step can be marked done; the health screening never');
});

test('a value is read by the screen\'s own rule; anything else is refused as not fitting', () => {
  const ok = (field, value, want) => {
    const { changes, refused } = setup.planSetupChanges({ changes: [{ field, value }] }, { actorId: ME, roles: ['trainer'] });
    assert.deepEqual(refused, [], `${field}=${JSON.stringify(value)} should be read`);
    assert.deepEqual(changes, [{ field, value: want }], `${field}=${JSON.stringify(value)}`);
  };
  const bad = (field, value) => {
    const { changes, refused } = setup.planSetupChanges({ changes: [{ field, value }] }, { actorId: ME, roles: ['trainer'] });
    assert.deepEqual(changes, [], `${field}=${JSON.stringify(value)} must be refused`);
    assert.equal(refused[0].reason, 'invalid', `${field}=${JSON.stringify(value)}`);
  };
  ok('goal', 'Build muscle', 'muscle'); ok('goal', 'fat_loss', 'fat_loss'); ok('goal', 'Run my first 10k', 'Run my first 10k');
  bad('goal', '   '); bad('goal', '12345'); bad('goal', 'Run '.repeat(16)); ok('goal', ` ${'Run '.repeat(15)}`, 'Run '.repeat(15).trim());
  ok('coaching', 'both', 'both'); ok('coaching', 'Not right now', 'none'); ok('coaching', 'trainer', 'training'); bad('coaching', 'maybe');
  ok('experience', 'Intermediate', 'intermediate'); ok('experience', 'ADVANCED', 'advanced'); bad('experience', 'guru');
  ok('sessionsPerWeek', '4', '4'); ok('sessionsPerWeek', 3, '3'); ok('sessionsPerWeek', '5 days a week', '5'); ok('sessionsPerWeek', '4x', '4'); bad('sessionsPerWeek', '7'); bad('sessionsPerWeek', '1'); bad('sessionsPerWeek', '4.5');
  ok('equipment', 'Bodyweight only', 'bodyweight'); ok('equipment', 'home gym', 'home_gym'); bad('equipment', 'a rowing machine');
  ok('preferredTimes', 'Early morning', 'early_morning'); bad('preferredTimes', '3am');
  ok('trainingGoal', 'Strength + hypertrophy', 'strength_hypertrophy'); bad('trainingGoal', 'be huge');
  ok('dietaryStyle', 'vegan', 'vegan'); bad('dietaryStyle', 'carnivore');
  ok('calorieRange', '1800–2000', 'r1800_2000'); ok('calorieRange', 'By feel', 'by_feel'); bad('calorieRange', '900');
  ok('alcohol', 'Social', 'social'); bad('alcohol', 'lots');
  ok('units', 'metric', setup.UNITS_METRIC); ok('units', 'lb', setup.UNITS_IMPERIAL); ok('units', setup.UNITS_METRIC, setup.UNITS_METRIC); bad('units', 'stone');
  ok('weekStarts', 'sunday', 'Sunday'); bad('weekStarts', 'Wednesday');
  ok('dailyCheckin', 'off', 'Off'); ok('dailyCheckin', true, 'On'); bad('dailyCheckin', 'sometimes');
  ok('quietStart', '10 pm', 22); ok('quietStart', '22:00', 22); ok('quietStart', 0, 0); ok('quietEnd', '7am', 7); ok('quietEnd', 'noon', 12);
  ok('quietStart', '12am', 0); ok('quietEnd', '12 pm', 12); ok('quietStart', 'midnight', 0);
  bad('quietStart', '22:30'); bad('quietStart', 24); bad('quietStart', '13pm'); bad('quietEnd', -1); bad('quietEnd', 7.5);
  ok('dailyLimit', '6', 6); bad('dailyLimit', '5'); bad('dailyLimit', 100);
  ok('name', '  Sam   Lee ', 'Sam Lee'); bad('name', 'sam@example.com'); bad('name', 'https://x.y'); bad('name', '1234'); bad('name', 'a'.repeat(61));
  ok('headline', 'Strength coach for busy parents', 'Strength coach for busy parents'); bad('headline', 'x'.repeat(81));
  ok('aboutStory', 'I coach.\n\n\n\nA lot.', 'I coach.\n\nA lot.'); bad('aboutStory', 'y'.repeat(1201)); bad('aboutStory', '   ');
  ok('yearsCoaching', '8 years', 8); ok('yearsCoaching', 12, 12); bad('yearsCoaching', 0); bad('yearsCoaching', 61); bad('yearsCoaching', 'many');
  ok('coachingFormat', 'in person', 'in_person'); ok('coachingFormat', 'Online', 'online'); bad('coachingFormat', 'by mail');
  ok('basedIn', 'Brooklyn, NY', 'Brooklyn, NY'); bad('basedIn', 'z'.repeat(81));
  ok('languages', 'English, Spanish', 'English, Spanish');
  // Not a string, a number or a yes/no: never read.
  for (const value of [null, undefined, { units: 'metric' }, ['metric']]) bad('units', value);
});

test('⚠ a field off the list, and the person\'s own boxes, are refused by name — never written', () => {
  const { changes, refused } = setup.planSetupChanges({ changes: [
    { field: 'email', value: 'new@example.com' }, { field: 'password', value: 'hunter22' }, { field: 'termsAccepted', value: 'true' },
    { field: 'parq', value: 'no to all' }, { field: 'healthScreening', value: 'done' }, { field: 'cardNumber', value: '4242' },
    { field: 'profileVisibility', value: 'Public' }, { field: 'shareWorkoutData', value: 'On' }, { field: 'username', value: 'sam' },
    { field: 'dob', value: '1990-01-01' }, { field: 'role', value: 'admin' }, { field: 'monthlyRate', value: '120' },
    { field: 'favouriteColour', value: 'teal' }, { field: 'units', value: 'metric' },
  ] }, { actorId: ME, roles: ['trainer'] });
  assert.deepEqual(changes, [{ field: 'units', value: setup.UNITS_METRIC }]);
  const by = Object.fromEntries(refused.map((r) => [r.field, r.reason]));
  for (const f of ['email', 'password', 'termsAccepted', 'parq', 'healthScreening', 'cardNumber', 'profileVisibility', 'shareWorkoutData', 'username', 'dob', 'role', 'monthlyRate']) {
    assert.equal(by[f], 'yours', `${f} is theirs to do`);
  }
  assert.equal(by.favouriteColour, 'not_here');
});

test('⚠ a coach\'s profile fields are refused for a member; a second answer for one field is refused', () => {
  const member = setup.planSetupChanges({ changes: [{ field: 'headline', value: 'Hi' }, { field: 'aboutStory', value: 'Me' }] }, { actorId: ME, roles: ['client'] });
  assert.deepEqual(member.changes, []);
  assert.deepEqual(member.refused.map((r) => r.reason), ['coach_only', 'coach_only']);
  const dual = setup.planSetupChanges({ changes: [{ field: 'headline', value: 'Hi' }] }, { actorId: ME, roles: ['client', 'nutritionist'] });
  assert.deepEqual(dual.changes, [{ field: 'headline', value: 'Hi' }], 'a member who also coaches');
  const twice = setup.planSetupChanges({ changes: [{ field: 'units', value: 'metric' }, { field: 'units', value: 'imperial' }] }, { actorId: ME });
  assert.deepEqual(twice.changes, [{ field: 'units', value: setup.UNITS_METRIC }]);
  assert.deepEqual(twice.refused, [{ field: 'units', label: 'Units', reason: 'invalid' }]);
  assert.equal(setup.planSetupChanges({ changes: Array.from({ length: 40 }, () => ({ field: 'nope', value: 'x' })) }, { actorId: ME }).refused.length, setup.SETUP_MAX_CHANGES);
  assert.deepEqual(setup.planSetupChanges('junk', { actorId: ME }), { changes: [], refused: [] });
});

test('⚠ a proposal aimed at any other account is refused outright', () => {
  for (const k of ['userId', 'user_id', 'accountId', 'clientId', 'targetUserId', 'uid', 'forUser']) {
    assert.throws(() => setup.planSetupChanges({ [k]: OTHER, changes: [{ field: 'units', value: 'metric' }] }, { actorId: ME }), { message: setup.OTHER_ACCOUNT_MSG }, k);
  }
  assert.throws(() => setup.planSetupChanges({ email: 'someone@else.com', changes: [] }, { actorId: ME }), { message: setup.OTHER_ACCOUNT_MSG });
  // Naming the account itself changes nothing.
  assert.equal(setup.planSetupChanges({ userId: ME, changes: [{ field: 'units', value: 'metric' }] }, { actorId: ME }).changes.length, 1);
});

// ── The card ─────────────────────────────────────────────────────────────────────────────────
test('the card: each change as before → after from the account as it stands; unchanged left off; refusals named', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL, profileVisibility: 'Private' }, client_training_prefs: { experience: 'beginner', injuries: 'left knee' } } });
  const { built } = await preview(db, [
    { field: 'units', value: 'metric' }, { field: 'experience', value: 'beginner' }, { field: 'goal', value: 'build muscle' },
    { field: 'dailyCheckin', value: 'on' }, { field: 'quietStart', value: '9pm' }, { field: 'email', value: 'x@y.z' }, { field: 'sessionsPerWeek', value: '9' },
  ]);
  assert.deepEqual(built.unchanged, ['experience', 'dailyCheckin'], 'already beginner; an unset check-in reads On');
  assert.deepEqual(built.diff, [
    { label: 'Units', field: 'units', before: setup.UNITS_IMPERIAL, after: setup.UNITS_METRIC },
    { label: 'Goal', field: 'goal', before: null, after: 'Build muscle' },
    { label: 'Quiet hours from', field: 'quietStart', before: '10 PM', after: '9 PM' },
    { label: 'email', field: 'email', refused: 'yours', after: 'Not set: Yours to do yourself' },
    { label: 'Sessions a week', field: 'sessionsPerWeek', refused: 'invalid', after: 'Not set: That doesn’t fit this setting' },
  ]);
  assert.equal(built.changed, 3);
  // The goal writes the step's three cells; quiet hours are the defaults of a row not yet made.
  assert.deepEqual(built.cells.filter((c) => c.field === 'goal').map((c) => [setup.cellId(c), c.had, c.after]), [
    ['goals:client_goals:primaryGoal', false, 'muscle'], ['goals:client_identity:goal', false, 'Build muscle'], ['goals:client_onboarding:intentSeen', false, true],
  ]);
  assert.deepEqual(built.cells.find((c) => c.field === 'quietStart'), { store: 'notify', key: 'quiet_start', field: 'quietStart', had: false, before: 22, after: 21 });
  assert.equal(db.writes.length, 0, 'drawing the card writes nothing');
});

test('the card reads only the signed-in account: another account\'s rows are never its "before"', async () => {
  const db = accountDb({ goals: {} });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }]);
  assert.equal(built.diff[0].before, null, 'not the other account\'s Imperial');
});

// ── Confirm and Undo ─────────────────────────────────────────────────────────────────────────
test('confirm writes every cell into the screens\' own stores, merged; undo restores exactly what was there', async () => {
  const db = accountDb({
    goals: { client_settings: { units: setup.UNITS_IMPERIAL, profileVisibility: 'Private', radioAsked: true }, client_onboarding: { tourSeen: true } },
    notify: { quiet_start: 22, quiet_end: 7, daily_cap: 4, muted: true },
  });
  const before = JSON.parse(JSON.stringify(db.t));
  const { built } = await preview(db, [
    { field: 'units', value: 'metric' }, { field: 'goal', value: 'Lose fat' }, { field: 'coaching', value: 'both' }, { field: 'experience', value: 'novice' },
    { field: 'quietStart', value: '9 pm' }, { field: 'dailyLimit', value: 6 }, { field: 'name', value: 'Samantha Lee' }, { field: 'dailyCheckin', value: 'off' },
  ]);
  await setup.applySetupCells(db, ME, built.cells, 'apply', { tz: built.tz });
  assert.deepEqual(db.goal('client_settings'), { units: setup.UNITS_METRIC, profileVisibility: 'Private', radioAsked: true, dailyCheckin: 'Off', dailyCheckinSince: NOW }, 'merged: privacy and the radio ask untouched');
  assert.deepEqual(db.goal('client_onboarding'), { tourSeen: true, intentSeen: true, wantsCoaching: true, coachingFor: ['training', 'nutrition'], coachingAt: NOW });
  assert.deepEqual(db.goal('client_goals'), { primaryGoal: 'fat_loss' });
  assert.deepEqual(db.goal('client_identity'), { goal: 'Lose fat', name: 'Samantha Lee' });
  assert.deepEqual(db.goal('client_training_prefs'), { experience: 'novice' });
  const n = db.t.notification_settings.find((r) => r.user_id === ME);
  assert.deepEqual([n.quiet_start, n.quiet_end, n.daily_cap, n.muted], [21, 7, 6, true], 'mute is left as they set it');
  assert.equal(db.t.profiles.find((p) => p.id === ME).full_name, 'Samantha Lee');
  assert.deepEqual(db.goal('client_settings', OTHER), { units: 'Imperial · lb / mi' }, 'the other account is untouched');

  await setup.applySetupCells(db, ME, built.cells, 'undo', { tz: built.tz });
  const strip = (tables) => ({
    goals: Object.fromEntries(tables.user_goals.filter((r) => r.user_id === ME).map((r) => [r.kind, r.data]).filter(([, d]) => Object.keys(d).length)),
    notify: tables.notification_settings.map(({ updated_at, ...r }) => r),
    profile: tables.profiles.map(({ updated_at, ...r }) => r),
  });
  assert.deepEqual(strip(db.t), strip(before), 'every document, the notification row and the name are back as they were');
});

test('an account with no rows yet: confirm makes them; undo leaves them as an account that never answered', async () => {
  const db = accountDb({ goals: {}, notify: null });
  const { built } = await preview(db, [{ field: 'weekStarts', value: 'Sunday' }, { field: 'quietEnd', value: '8am' }]);
  await setup.applySetupCells(db, ME, built.cells, 'apply', { tz: built.tz });
  assert.deepEqual(db.goal('client_settings'), { weekStarts: 'Sunday' });
  const row = db.t.notification_settings.find((r) => r.user_id === ME);
  assert.deepEqual([row.quiet_start, row.quiet_end, row.daily_cap, row.tz], [22, 8, 4, 'America/New_York'], 'made in their own zone, the rest the table defaults');
  await setup.applySetupCells(db, ME, built.cells, 'undo', { tz: built.tz });
  assert.deepEqual(db.goal('client_settings'), {}, 'the key they never had is gone again');
  assert.equal(db.t.notification_settings.find((r) => r.user_id === ME).quiet_end, 7, 'back to the default');
});

test('⚠ a value changed after the card was drawn stops the whole confirm before any write', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL }, client_training_prefs: { experience: 'beginner' } } });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }, { field: 'experience', value: 'advanced' }]);
  db.touch('client_training_prefs', { experience: 'intermediate' }); // set in Settings on another device
  await assert.rejects(setup.applySetupCells(db, ME, built.cells, 'apply'), { message: setup.STALE_MSG });
  assert.equal(db.writes.length, 0, 'nothing written');
  assert.equal(db.goal('client_settings').units, setup.UNITS_IMPERIAL);
});

test('⚠ a save that lands between the read and the write is never overwritten: the write is compare-and-set', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } } });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }]);
  let once = true;
  db.hooks.before = (op) => { if (op === 'user_goals:update' && once) { once = false; db.touch('client_settings', { onlineRail: 'Off' }); } };
  await setup.applySetupCells(db, ME, built.cells, 'apply');
  assert.deepEqual(db.goal('client_settings'), { units: setup.UNITS_METRIC, onlineRail: 'Off' }, 'the other save is kept; ours went in on a re-read');
});

test('⚠ the notification row and the name are written only while they still hold what was read', async () => {
  const db = accountDb({ goals: {}, notify: { quiet_start: 22, daily_cap: 4 } });
  const { built } = await preview(db, [{ field: 'quietStart', value: 21 }]);
  let once = true;
  db.hooks.before = (op) => { if (op === 'notification_settings:update' && once) { once = false; db.t.notification_settings.find((r) => r.user_id === ME).quiet_start = 23; } };
  await assert.rejects(setup.applySetupCells(db, ME, built.cells, 'apply'), { message: setup.STALE_MSG });
  assert.equal(db.t.notification_settings.find((r) => r.user_id === ME).quiet_start, 23, 'the other device\'s choice stands');

  const named = accountDb({ goals: {} });
  const b2 = (await preview(named, [{ field: 'name', value: 'Samantha Lee' }])).built;
  let first = true;
  named.hooks.before = (op) => { if (op === 'profiles:update' && first) { first = false; named.t.profiles.find((p) => p.id === ME).full_name = 'Sam L.'; } };
  await assert.rejects(setup.applySetupCells(named, ME, b2.cells, 'apply'), { message: setup.STALE_MSG });
  assert.equal(named.t.profiles.find((p) => p.id === ME).full_name, 'Sam L.');
  assert.equal(named.goal('client_identity'), null, 'nor its mirror');
});

test('a first row made beside ours (another device, the same moment) is read and merged, not refused', async () => {
  const db = accountDb({ goals: {} });
  const { built } = await preview(db, [{ field: 'weekStarts', value: 'Sunday' }]);
  let once = true;
  db.hooks.before = (op) => { if (op === 'user_goals:insert' && once) { once = false; db.touch('client_settings', { radioAsked: true }); } };
  await setup.applySetupCells(db, ME, built.cells, 'apply');
  assert.deepEqual(db.goal('client_settings'), { radioAsked: true, weekStarts: 'Sunday' });
});

test('⚠ a write that fails part way restores what it had written: no half-applied setup without an undo', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } }, notify: { quiet_start: 22 } });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }, { field: 'quietStart', value: 21 }, { field: 'name', value: 'New Name' }]);
  db.hooks.failOn = (op) => op === 'profiles:update';
  await assert.rejects(setup.applySetupCells(db, ME, built.cells, 'apply'), { message: setup.WRITE_FAILED_MSG });
  assert.equal(db.goal('client_settings').units, setup.UNITS_IMPERIAL, 'units rolled back');
  assert.equal(db.t.notification_settings.find((r) => r.user_id === ME).quiet_start, 22, 'quiet hours rolled back');
  assert.equal(db.goal('client_identity'), null, 'the name mirror was never made, or was taken back');
  assert.equal(db.t.profiles.find((p) => p.id === ME).full_name, 'Sam Lee');
});

test('⚠ undo after the member changed one of the values refuses, and undoes nothing', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL }, client_training_prefs: { experience: 'beginner' } } });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }, { field: 'experience', value: 'advanced' }]);
  await setup.applySetupCells(db, ME, built.cells, 'apply');
  db.touch('client_training_prefs', { experience: 'intermediate' }); // neither what Nora wrote nor what was there
  await assert.rejects(setup.applySetupCells(db, ME, built.cells, 'undo'), { message: setup.CHANGED_MSG });
  assert.equal(db.goal('client_settings').units, setup.UNITS_METRIC, 'units stays as confirmed: nothing undone');
  assert.equal(db.goal('client_training_prefs').experience, 'intermediate', 'their own change stands');
});

test('undo is safe to run again: a cell already back where it was is passed over', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } }, notify: { quiet_start: 22 } });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }, { field: 'quietStart', value: 23 }]);
  await setup.applySetupCells(db, ME, built.cells, 'apply');
  db.touch('client_settings', { units: setup.UNITS_IMPERIAL }); // put back by hand
  await setup.applySetupCells(db, ME, built.cells, 'undo');
  assert.equal(db.t.notification_settings.find((r) => r.user_id === ME).quiet_start, 22);
  await setup.applySetupCells(db, ME, built.cells, 'undo');
});

test('⚠ a plan carrying any cell off the allowlist is refused before anything is read', async () => {
  const db = accountDb({ goals: { client_settings: { profileVisibility: 'Private' } } });
  for (const cell of [
    { store: 'goals', kind: 'client_settings', key: 'profileVisibility', had: true, before: 'Private', after: 'Public' },
    { store: 'goals', kind: 'cycle_settings', key: 'enabled', had: false, before: null, after: true },
    { store: 'profile', key: 'email', had: true, before: 'a@b.c', after: 'x@y.z' },
    { store: 'notify', key: 'muted', had: true, before: false, after: true },
    { store: 'profiles', key: 'full_name', had: true, before: 'Sam Lee', after: 'X' },
  ]) {
    await assert.rejects(setup.applySetupCells(db, ME, [cell], 'apply'), { message: setup.NOT_ALLOWED_MSG }, setup.cellId(cell));
  }
  await assert.rejects(setup.applySetupCells(db, ME, [], 'apply'), { message: setup.NOT_ALLOWED_MSG });
  await assert.rejects(setup.applySetupCells(db, null, [{ store: 'goals', kind: 'client_settings', key: 'units', had: false, before: null, after: 'x' }], 'apply'), { message: setup.NOT_ALLOWED_MSG });
  assert.equal(db.writes.length, 0);
  assert.equal(db.goal('client_settings').profileVisibility, 'Private');
});

test('⚠ RLS holds the line too: a plan replayed as another account writes nothing of the first', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } } });
  const { built } = await preview(db, [{ field: 'units', value: 'metric' }]);
  // The engine writes only rows keyed on the uid it is given, through a client that is that uid's.
  await assert.rejects(setup.applySetupCells(db, OTHER, built.cells, 'apply'));
  assert.equal(db.goal('client_settings').units, setup.UNITS_IMPERIAL);
  assert.deepEqual(db.goal('client_settings', OTHER), { units: 'Imperial · lb / mi' });
});

test('a coach\'s headline and About go through Make it yours\' own cleaner; an About it would reshape is refused', async () => {
  const db = accountDb({ goals: { profile_custom: { look: { paper: 'bone' }, about: { story: 'Old story', languages: 'English' } } } });
  const { built } = await preview(db, [
    { field: 'headline', value: 'Strength for busy parents' }, { field: 'aboutStory', value: 'Twelve years under the bar.' },
    { field: 'yearsCoaching', value: 12 }, { field: 'coachingFormat', value: 'both' }, { field: 'basedIn', value: 'Austin, TX' },
  ], { roles: ['trainer'] });
  assert.equal(built.diff.find((d) => d.field === 'aboutStory').before, 'Old story');
  await setup.applySetupCells(db, ME, built.cells, 'apply');
  assert.deepEqual(db.goal('profile_custom'), { look: { paper: 'bone' }, line: 'Strength for busy parents', about: { story: 'Twelve years under the bar.', languages: 'English', years: 12, how: 'both', where: 'Austin, TX' } });
  await setup.applySetupCells(db, ME, built.cells, 'undo');
  assert.deepEqual(db.goal('profile_custom'), { look: { paper: 'bone' }, about: { story: 'Old story', languages: 'English' } });

  const legacy = accountDb({ goals: { profile_custom: { about: { story: 'Old', how: 'carrier pigeon' } } } });
  const b2 = (await preview(legacy, [{ field: 'basedIn', value: 'Austin' }], { roles: ['trainer'] })).built;
  await assert.rejects(setup.applySetupCells(legacy, ME, b2.cells, 'apply'), /Make it yours/);
  assert.deepEqual(legacy.goal('profile_custom'), { about: { story: 'Old', how: 'carrier pigeon' } });
});

// ── Through the scaffold: propose → confirm → undo ─────────────────────────────────────────────
const SECRET = 'setup-secret';
function scaffold(db, { isMember = true, role = 'client' } = {}) {
  const registry = proposals.createRegistry();
  for (const a of actions.NORA_ACTIONS) registry.define(a.name, a);
  const audit = proposals.inMemoryAudit();
  const consumer = proposals.inMemoryConsumer();
  const ctxFor = (id, r = role) => ({ actor: { id, role: r, roles: [r] }, supabase: db, isMember, zone: 'Europe/London' });
  const propose = (input, id = ME) => proposals.proposeChange({ registry, action: 'set_up_account', input, actor: { id, role, roles: [role] }, ctx: ctxFor(id), secret: SECRET });
  const confirm = (token, id = ME) => proposals.confirmChange({ registry, token, actor: { id, role, roles: [role] }, ctx: ctxFor(id), secret: SECRET, audit, consume: consumer.consume, release: consumer.release });
  const undo = (auditId, id = ME) => proposals.undoChange({ registry, auditId, actor: { id, role, roles: [role] }, ctx: ctxFor(id), audit });
  return { propose, confirm, undo, audit };
}

test('the whole lifecycle: one card, Confirm applies it all, Undo restores it all; a replay is refused', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } } });
  const s = scaffold(db);
  const p = await s.propose({ changes: [{ field: 'units', value: 'metric' }, { field: 'goal', value: 'get stronger' }, { field: 'password', value: 'x' }] });
  assert.equal(p.ok, true);
  assert.equal(p.preview.summary, 'Set up your account: 2 changes');
  assert.deepEqual(p.preview.target, { userId: ME, kind: 'account_setup', id: null });
  assert.match(p.preview.note, /On the card as not set: password — Yours to do yourself/);
  assert.equal(db.writes.length, 0, 'proposing writes nothing');
  const c = await s.confirm(p.token);
  assert.equal(c.ok, true);
  assert.deepEqual(c.result.fields.sort(), ['goal', 'units']);
  assert.equal(db.goal('client_settings').units, setup.UNITS_METRIC);
  assert.equal(db.goal('client_goals').primaryGoal, 'strength');
  assert.equal((await s.confirm(p.token)).error, 'already_confirmed');
  const u = await s.undo(c.auditId);
  assert.equal(u.ok, true);
  assert.equal(db.goal('client_settings').units, setup.UNITS_IMPERIAL);
  assert.equal(db.goal('client_goals').primaryGoal, undefined);
  assert.equal((await s.undo(c.auditId)).alreadyUndone, true);
});

test('⚠ only the account it was drafted for can confirm or undo it, and only a member is drafted one', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } } });
  const s = scaffold(db);
  const p = await s.propose({ changes: [{ field: 'units', value: 'metric' }] });
  assert.equal((await s.confirm(p.token, OTHER)).error, 'actor_mismatch');
  const c = await s.confirm(p.token);
  assert.equal((await s.undo(c.auditId, OTHER)).error, 'actor_mismatch');
  assert.equal(db.goal('client_settings').units, setup.UNITS_METRIC);

  const other = await s.propose({ userId: OTHER, changes: [{ field: 'units', value: 'metric' }] });
  assert.deepEqual([other.ok, other.message], [false, setup.OTHER_ACCOUNT_MSG]);
  const off = await s.propose({ changes: [{ field: 'email', value: 'x@y.z' }, { field: 'units', value: 'kelvin' }] });
  assert.equal(off.ok, false);
  assert.match(off.message, /None of that can be set from here: email \(yours to do yourself\), Units \(that doesn’t fit this setting\)\./);
  const same = await s.propose({ changes: [{ field: 'units', value: 'metric' }] });
  assert.match(same.message, /already how your account is set/);
  const visitor = await scaffold(db, { isMember: false }).propose({ changes: [{ field: 'units', value: 'imperial' }] });
  assert.deepEqual([visitor.ok, visitor.message], [false, 'Becoming a member unlocks this.']);
});

test('a coach is drafted their profile through the scaffold; a member asking the same is refused it', async () => {
  const db = accountDb({ goals: { profile_custom: {} } });
  const coach = scaffold(db, { role: 'trainer' });
  const p = await coach.propose({ changes: [{ field: 'headline', value: 'Strength for busy parents' }, { field: 'yearsCoaching', value: '9' }] });
  assert.equal(p.ok, true);
  assert.deepEqual(p.preview.diff.map((d) => [d.field, d.after]), [['headline', 'Strength for busy parents'], ['yearsCoaching', '9 years']]);
  const c = await coach.confirm(p.token);
  assert.equal(c.ok, true);
  assert.deepEqual(db.goal('profile_custom'), { line: 'Strength for busy parents', about: { years: 9 } });
  const member = await scaffold(accountDb({ goals: {} })).propose({ changes: [{ field: 'headline', value: 'Hi' }] });
  assert.equal(member.ok, false);
  assert.match(member.message, /Headline \(for coaches only\)/);
});

test('⚠ execute and undo refuse a plan whose target is not the account confirming it', async () => {
  const db = accountDb({ goals: { client_settings: { units: setup.UNITS_IMPERIAL } } });
  const cells = [{ store: 'goals', kind: 'client_settings', key: 'units', field: 'units', had: true, before: setup.UNITS_IMPERIAL, after: setup.UNITS_METRIC }];
  const ctx = { actor: { id: ME, role: 'client' }, supabase: db };
  for (const target of [{ userId: OTHER, kind: 'account_setup' }, { userId: ME, kind: 'weigh_in' }, null]) {
    await assert.rejects(actions.setUpAccountAction.execute(ctx, { target, afterState: { cells } }), { message: setup.NOT_ALLOWED_MSG });
    await assert.rejects(actions.setUpAccountAction.undo(ctx, { target, afterState: { cells } }), { message: setup.NOT_ALLOWED_MSG });
  }
  assert.equal(db.goal('client_settings').units, setup.UNITS_IMPERIAL);
});

// ── The route: who is offered it, what the card carries, the budget ────────────────────────────
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
class SubmoduleStubs extends Map {
  has(k) { return super.has(k) || String(k).startsWith('./ai/'); }
  get(k) { return super.has(k) ? super.get(k) : {}; }
}
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), { typescript: true, registry: new SubmoduleStubs([['next/server', nextServer]]) });
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const coachCatalog = await loadRealModule(join(ROOT, 'src/lib/coach-catalog.ts'), { typescript: true });
function say(text) { return { output_text: text, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }; }
function call(name, args) { return { output: [{ type: 'reasoning', id: 'rs_1', summary: [] }, { type: 'function_call', call_id: `call_${name}`, name, arguments: JSON.stringify(args) }] }; }

async function loadChat({ user = { id: ME, email: 'm@x' }, role = 'client', isMember = true, answers = [say('ok')], tables = {}, budget = 30 } = {}) {
  const sb = fakeSupabase({ tables: { user_goals: [], profiles: [{ id: ME, full_name: 'Sam Lee' }], ...tables } });
  const seen = { ai: [], rate: [] };
  const counts = new Map();
  const noraLimits = await loadRealModule(join(ROOT, 'src/lib/ai/noraLimits.ts'), { typescript: true, registry: new Map([
    ['@/lib/rate-limit', { checkRateLimit: async (_sb, key, max, win) => {
      seen.rate.push({ key, max, win });
      const n = (counts.get(key) || 0) + 1; counts.set(key, n);
      const cap = key.startsWith('nora:account_setup:') ? Math.min(max, budget) : max;
      return { allowed: n <= cap, remaining: Math.max(0, cap - n), resetSeconds: 3600, limit: max };
    } }],
    ['@/lib/turnstile', { turnstileEnabled: () => false, verifyTurnstile: async () => true }],
  ]) });
  const registry = proposals.createRegistry();
  for (const a of actions.NORA_ACTIONS) registry.define(a.name, a);
  let i = 0;
  const reg = new Map([
    ['next/server', nextServer],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/coach-catalog', coachCatalog],
    ['@/lib/ai/proposals.mjs', proposals],
    ['@/lib/ai/tone.mjs', await import(join(ROOT, 'src/lib/ai/tone.mjs'))],
    ['@/lib/ai/memberContext.mjs', await import(join(ROOT, 'src/lib/ai/memberContext.mjs'))],
    ['@/lib/ai/cookContext.mjs', await import(join(ROOT, 'src/lib/ai/cookContext.mjs'))],
    ['@/lib/ai/actions.mjs', actions],
    ['@/lib/ai/replyText.mjs', await import(join(ROOT, 'src/lib/ai/replyText.mjs'))],
    ['@/lib/ai/memberReads.mjs', await import(join(ROOT, 'src/lib/ai/memberReads.mjs'))],
    ['@/lib/ai/memberMornings.mjs', await import(join(ROOT, 'src/lib/ai/memberMornings.mjs'))],
    ['@/lib/ai/shapeKnowledge.mjs', await import(join(ROOT, 'src/lib/ai/shapeKnowledge.mjs'))],
    ['@/lib/ai/voiceLang.mjs', await import(join(ROOT, 'src/lib/ai/voiceLang.mjs'))],
    ['@/lib/request-auth', { clientForRequest: async () => sb }],
    ['@/lib/ai/noraLimits', noraLimits],
    ['@/lib/ai/noraGreeting.mjs', await import(join(ROOT, 'src/lib/ai/noraGreeting.mjs'))],
    ['@/lib/ai/noraContext.mjs', await import(join(ROOT, 'src/lib/ai/noraContext.mjs'))],
    ['@/lib/ai/noraForms.mjs', await import(join(ROOT, 'src/lib/ai/noraForms.mjs'))],
    ['@/lib/ai/coachToday.mjs', await import(join(ROOT, 'src/lib/ai/coachToday.mjs'))],
    ['@/lib/supportRequests.mjs', await import(join(ROOT, 'src/lib/supportRequests.mjs'))],
    ['@/lib/ai/adminLookup.mjs', await import(join(ROOT, 'src/lib/ai/adminLookup.mjs'))],
    ['@/lib/supabase/admin', { createAdminClient: () => { throw new Error('no service role'); } }],
    ['@/lib/membership-core', { computeMembership: async () => ({ isMember, isCoach: ['trainer', 'nutritionist'].includes(role), isAdmin: false, isKnownMinor: false }) }],
    ['@/lib/food-search-server', { searchFoodsServer: async () => ({ results: [], unavailable: true }) }],
    ['@/lib/ai', {
      hasOpenAIKey: () => true,
      aiPublicModel: ai.aiPublicModel,
      callAI: async (body, opts) => { seen.ai.push({ body, opts }); const data = answers[Math.min(i, answers.length - 1)]; i += 1; return { ok: true, data, usage: null, latencyMs: 1, promptId: opts.promptId, model: 'pinned', fellBack: false }; },
    }],
    ['@/lib/ai/server', {
      resolveActor: async () => (user ? { user, role, roles: [role], supabase: sb } : null),
      makeCtx: (actor) => ({ actor: { id: actor.user.id, role: actor.role, roles: actor.roles }, supabase: sb, store: {}, call: async () => ({ ok: true, status: 200, data: {} }) }),
      serverRegistry: registry,
      proposalSecret: () => SECRET,
      casWriteUserGoals: async () => ({ ok: true }),
      auditSink: () => ({ log: async () => 'audit-1' }),
    }],
  ]);
  const mod = await loadRealModule(join(ROOT, 'src/app/api/support/chat/route.ts'), { typescript: true, registry: reg });
  return { mod, seen, sb };
}
const chat = (text, extra = {}) => new Request('https://x/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }], ...extra }) });
const toolNames = (body) => (body.tools || []).map((t) => t.name);

test('route: a member is offered set_up_account with its note; a visitor, a non-member, a plain panel and the kitchen are not', async () => {
  const m = await loadChat();
  await m.mod.POST(chat('Set up my account with me'));
  const body = m.seen.ai[0].body;
  assert.ok(toolNames(body).includes('set_up_account'));
  assert.equal(body.tools.find((t) => t.name === 'set_up_account').strict, true);
  assert.match(body.input[0].content, /ACCOUNT SETUP: You can set up their account with them \(set_up_account\)/);
  assert.match(body.input[0].content, /never their email, password|You can never set their email, password, phone, username, birth date, payment or plan, privacy, the agreements or the health screening/);
  for (const [label, opts, extra] of [
    ['visitor', { user: null }, {}],
    ['signed in, no membership', { isMember: false }, {}],
    ['a panel that draws no cards', {}, { confirmCards: false }],
    ['cook mode', {}, { cookContext: { recipeTitle: 'Tomato soup', stepIndex: 0, stepText: 'Boil the water' } }],
  ]) {
    const r = await loadChat(opts);
    await r.mod.POST(chat('Set up my account', extra));
    const b = r.seen.ai[0].body;
    assert.ok(!toolNames(b).includes('set_up_account'), `${label}: no tool`);
    assert.doesNotMatch(b.input[0].content, /ACCOUNT SETUP/, `${label}: no note`);
  }
});

test('route: Nora\'s call becomes one confirm card with each change and each refusal; she is told what was not set', async () => {
  const tables = { user_goals: [{ user_id: ME, kind: 'client_settings', data: { units: setup.UNITS_IMPERIAL } }] };
  const r = await loadChat({ tables, answers: [call('set_up_account', { changes: [{ field: 'units', value: 'metric' }, { field: 'dailyLimit', value: '3' }, { field: 'password', value: 'secret' }] }), say('Drafted — confirm below.')] });
  const res = await (await r.mod.POST(chat('metric please, 3 notifications a day, and change my password to secret'))).json();
  const card = res.actions.find((a) => a.type === 'proposal');
  assert.equal(card.action, 'set_up_account');
  assert.equal(card.summary, 'Set up your account: 2 changes');
  assert.deepEqual(card.diff, [
    { label: 'Units', field: 'units', before: setup.UNITS_IMPERIAL, after: setup.UNITS_METRIC },
    { label: 'Daily notification limit', field: 'dailyLimit', before: '4 a day', after: '3 a day' },
    { label: 'password', field: 'password', refused: 'yours', after: 'Not set: Yours to do yourself' },
  ]);
  assert.ok(typeof card.token === 'string' && card.token.includes('.'));
  const out = JSON.parse(r.seen.ai[1].body.input.find((it) => it.type === 'function_call_output').output);
  assert.equal(out.requiresConfirm, true);
  assert.match(out.note, /password — Yours to do yourself/);
  assert.deepEqual(r.seen.rate.filter((x) => x.key.startsWith('nora:account_setup:')), [{ key: `nora:account_setup:${ME}`, max: 30, win: 86400 }], 'counted once, per account, a day long');
});

test('route: ⚠ past the day\'s budget nothing is read or drafted; another account\'s setup is never drafted', async () => {
  const spent = await loadChat({ budget: 0, answers: [call('set_up_account', { changes: [{ field: 'units', value: 'metric' }] }), say('ok')] });
  const res = await (await spent.mod.POST(chat('metric'))).json();
  assert.ok(!res.actions.some((a) => a.type === 'proposal'), 'no card');
  const out = JSON.parse(spent.seen.ai[1].body.input.find((it) => it.type === 'function_call_output').output);
  assert.equal(out.error, 'daily_budget');
  assert.match(out.message, /That's today's limit for setting up your account with Nora\. It resets in about 1 hour\./);
  assert.ok(!spent.sb._calls.some((c) => c.table === 'user_goals' && c.select === 'kind, data, updated_at'), 'no setup read past the budget');
  assert.ok(!spent.sb._calls.some((c) => c.table === 'notification_settings'), 'nor the notification row');

  const other = await loadChat({ answers: [call('set_up_account', { userId: OTHER, changes: [{ field: 'units', value: 'metric' }] }), say('ok')] });
  const ores = await (await other.mod.POST(chat('set up my friend\'s account'))).json();
  assert.ok(!ores.actions.some((a) => a.type === 'proposal'));
  const oout = JSON.parse(other.seen.ai[1].body.input.find((it) => it.type === 'function_call_output').output);
  assert.deepEqual([oout.error, oout.message], ['preview_failed', setup.OTHER_ACCOUNT_MSG]);

  const visitor = await loadChat({ user: null, answers: [call('set_up_account', { changes: [{ field: 'units', value: 'metric' }] }), say('ok')] });
  const vres = await (await visitor.mod.POST(chat('metric'))).json();
  assert.ok(!vres.actions.some((a) => a.type === 'proposal'), 'a fabricated call from a visitor drafts nothing');
});

test('route source: set_up_account is a write tool, so a plain panel never offers it, and the budget is counted before the preview', () => {
  const src = readFileSync(join(ROOT, 'src/app/api/support/chat/route.ts'), 'utf8');
  assert.match(src, /const WRITE_TOOLS = new Set\(\[[^\]]*'set_up_account'\]\);/);
  const propose = src.slice(src.indexOf('function makePropose('), src.indexOf('async function askOpenAI('));
  assert.ok(propose.indexOf("countBudget(actor.supabase, actor.user.id, 'account_setup')") < propose.indexOf('proposeChange({'), 'the budget gates the preview');
  const limits = readFileSync(join(ROOT, 'src/lib/ai/noraLimits.ts'), 'utf8');
  assert.match(limits, /account_setup: 30,/);
});
