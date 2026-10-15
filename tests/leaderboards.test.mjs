// The member and coach leaderboards (owner, 2026-10-15: "we should have a members and coaches
// leaderboard", then "looks good, build it").
//
// Three layers, each the way it can actually fail:
//   1. src/lib/leaderboard.mjs, executed: tiers, names, the switches, why a member is hidden,
//      the coach board's trim.
//   2. The four routes, DRIVEN with a scripted Supabase client: the statuses and bodies are the
//      real NextResponse ones, so "a failed read is not an empty board" is a behaviour here, not
//      a grep.
//   3. The migration, read: the privacy rules and grants the database enforces. The rankings
//      themselves were probed on a PostgreSQL 16 copy (see the PR); what a file read can hold is
//      that the rules stay written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const LB = await import(pathToFileURL(join(ROOT, 'src/lib/leaderboard.mjs')).href);
const ownedProvider = await loadRealModule(join(ROOT, 'src/lib/owned-provider.ts'), {
  typescript: true, registry: new Map([['@/lib/time', { normalizeZone: (z) => z ?? null }]]),
});
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true, registry: new Map([['next/server', nextServer]]),
});
const SQL = read('supabase-migrations/2026-10-15-leaderboards.sql');

const UID = '11111111-1111-4111-8111-111111111111';

// ── 1. The shared rules ─────────────────────────────────────────────────────────────────────
test('tiers follow the two ladders, at the floors', () => {
  assert.equal(LB.memberTier(0), 'Raw');
  assert.equal(LB.memberTier(749), 'Raw');
  assert.equal(LB.memberTier(750), 'Tempo');
  assert.equal(LB.memberTier(2000), 'Form');
  assert.equal(LB.memberTier(5000), 'Peak');
  assert.equal(LB.memberTier(15000), 'Legend');
  assert.equal(LB.coachTier(0), 'Certified');
  assert.equal(LB.coachTier(1999), 'Pro');
  assert.equal(LB.coachTier(15000), 'Icon');
  assert.equal(LB.memberTier('nope'), null);
  // the same floors the score routes publish
  assert.match(read('src/app/api/coach/score/route.ts'), /\['Pro', 750\],\s*\['Elite', 2000\],\s*\['Master', 5000\],\s*\['Icon', 15000\]/);
});

test('requests read to a known value or the default, never through', () => {
  assert.equal(LB.parseScope('TEAM'), 'team');
  assert.equal(LB.parseScope('world'), 'everyone');
  assert.equal(LB.parsePeriod(null), 'month');
  assert.equal(LB.parseCoachView('climb'), 'climb');
  assert.equal(LB.parseCoachRole('coach'), null);
  assert.equal(LB.parseLimit('500'), 200);
  assert.equal(LB.parseLimit('-3'), 50);
  assert.equal(LB.parseLimit('7'), 7);
});

test('names are first name and last initial, as the database writes them', () => {
  assert.equal(LB.shortName('Priya  Shah'), 'Priya S.');
  assert.equal(LB.shortName('mary anne o’neil'), 'mary O.');
  assert.equal(LB.shortName('Cher'), 'Cher');
  assert.equal(LB.shortName('  '), 'Shape member');
  assert.equal(LB.shortName(null), 'Shape member');
  // and the database's own expression is the one that ships to members: any whitespace (a tab, a
  // newline) is one space before it splits, as \s+ is here (Codex, #2371)
  assert.match(SQL, /regexp_replace\(regexp_replace\(coalesce\(p\.full_name, ''\), '\^\\s\+\|\\s\+\$', '', 'g'\), '\\s\+', ' ', 'g'\) as n/);
  assert.match(SQL, /else split_part\(nm\.n, ' ', 1\) \|\| ' ' \|\| upper\(left\(regexp_replace\(nm\.n, '\^\.\* ', ''\), 1\)\) \|\| '\.'/);
  assert.equal(LB.shortName('Ana\tLee'), 'Ana L.');
  assert.equal(LB.shortName('  Bo\n  Kim  '), 'Bo K.');
  assert.ok(!/p\.full_name\s*,\s*\n?\s*p\.avatar_url,\s*\n?\s*s\.pts/.test(SQL), 'the member board returns the full name');
});

test('the two switches: the board is on unless turned off; the team board is off until answered', () => {
  assert.deepEqual(LB.readPrivacy(null), { leaderboard: true, teamBoard: null });
  assert.deepEqual(LB.readPrivacy({ leaderboard: 'off', team_board: 'on' }), { leaderboard: false, teamBoard: true });
  assert.deepEqual(LB.readPrivacy({ team_board: 'off' }), { leaderboard: true, teamBoard: false });
  assert.deepEqual(LB.readPrivacy({ team_board: 'yes' }), { leaderboard: true, teamBoard: null });
  // a change keeps the keys it does not own
  assert.deepEqual(LB.writePrivacy({ other: 1, leaderboard: 'off' }, { teamBoard: true }), { other: 1, leaderboard: 'off', team_board: 'on' });
  assert.deepEqual(LB.writePrivacy(null, { leaderboard: true }), { leaderboard: 'on' });
  assert.deepEqual(LB.writePrivacy({}, { leaderboard: 'true' }), {}, 'a non-boolean wrote a setting');
});

test('why other members do not see you, board by board', () => {
  const on = { leaderboard: true, teamBoard: true };
  assert.equal(LB.hiddenReason('everyone', on, 'Public'), null);
  assert.equal(LB.hiddenReason('everyone', on, undefined), null, 'a missing visibility is public, as the database reads it');
  assert.equal(LB.hiddenReason('following', on, 'Just friends'), 'private');
  assert.equal(LB.hiddenReason('everyone', on, 'Private'), 'private');
  assert.equal(LB.hiddenReason('everyone', { leaderboard: false, teamBoard: true }, 'Public'), 'off');
  // the team board needs its own switch, and does not need a public profile
  assert.equal(LB.hiddenReason('team', on, 'Private'), null);
  assert.equal(LB.hiddenReason('team', { leaderboard: true, teamBoard: null }, 'Public'), 'team_unasked');
  assert.equal(LB.hiddenReason('team', { leaderboard: true, teamBoard: false }, 'Public'), 'team_off');
  assert.equal(LB.hiddenReason('team', { leaderboard: false, teamBoard: true }, 'Public'), 'off');
  assert.equal(LB.hiddenReason('everyone', null, 'Public'), null, 'an unread setting is reported as a cause');
});

test('the coach board sends the top, and you with the coach either side', () => {
  const e = (rank, id, isMe = false) => LB.coachEntry({ provider_id: id, name: 'C' + id, points: 1000 - rank, rank, is_me: isMe, listed: true });
  const all = [];
  for (let r = 1; r <= 140; r++) all.push(e(r, r, r === 120));
  const { entries, total, me } = LB.trimCoachBoard(all, 50);
  assert.equal(total, 140);
  assert.equal(me.rank, 120);
  assert.deepEqual(entries.slice(-3).map((x) => x.rank), [119, 120, 121]);
  assert.equal(entries.length, 53);
  // a climber with no reading to compare is not ranked, except your own row, kept last
  const climb = [e(1, 1), LB.coachEntry({ provider_id: 9, name: 'Me', points: 0, rank: null, gained: null, is_me: true, listed: false })];
  const t2 = LB.trimCoachBoard(climb, 50);
  assert.equal(t2.total, 1);
  assert.equal(t2.entries.at(-1).isMe, true);
  assert.equal(t2.me.listed, false);
  assert.equal(LB.coachEntry({ points: 2100 }).tier, 'Elite');
});

test('places moved: up is positive, and no week-ago rank is no claim', () => {
  assert.equal(LB.moved(4, 7), 3);
  assert.equal(LB.moved(7, 4), -3);
  assert.equal(LB.moved(4, null), null);
  const m = LB.memberEntry({ user_id: 'u', display_name: 'A B.', points: '90', rank: '2', prev_rank: '5', rank_points: 2400, streak: 3, training_days: 4, meal_days: 0, is_me: true });
  assert.deepEqual([m.points, m.rank, m.moved, m.tier, m.streak, m.trainingDays, m.mealDays], [90, 2, 3, 'Form', 3, 4, 0]);
  // ⚠ training and nutrition stay the member's own (privacy policy; Codex on #2371): on anyone
  // else's row they are null, even if a database sent them
  const other = LB.memberEntry({ user_id: 'o', display_name: 'C D.', points: 80, rank: 3, rank_points: 100, streak: 9, training_days: 5, meal_days: 7, is_me: false });
  assert.deepEqual([other.streak, other.trainingDays, other.mealDays, other.tier], [null, null, null, 'Raw']);
});

// ── 2. The routes, driven ───────────────────────────────────────────────────────────────────
// A scripted client: `rpc` answers by function name, `tables` by table name. Every call is
// recorded so a test can say what the route asked for.
function fakeClient({ rpc = {}, tables = {}, onUpsert, onInsert, onUpdate } = {}) {
  const calls = [];
  const client = {
    calls,
    rpc: async (name, args) => { calls.push(['rpc', name, args]); const h = rpc[name]; return typeof h === 'function' ? h(args) : (h || { data: null, error: { message: 'unscripted ' + name } }); },
    from(table) {
      const ops = [];
      const settle = (single) => {
        calls.push(['from', table, ops.slice(), single]);
        const h = tables[table];
        const r = typeof h === 'function' ? h(ops, single) : h;
        return Promise.resolve(r || { data: single ? null : [], error: null, count: 0 });
      };
      const b = {
        select: (...a) => { ops.push(['select', ...a]); return b; },
        eq: (...a) => { ops.push(['eq', ...a]); return b; },
        in: (...a) => { ops.push(['in', ...a]); return b; },
        maybeSingle: () => settle(true),
        upsert: (row, opts) => { calls.push(['upsert', table, row, opts]); return Promise.resolve(onUpsert ? onUpsert(row) : { error: null }); },
        insert: (row) => { calls.push(['insert', table, row]); return Promise.resolve(onInsert ? onInsert(row) : { error: null }); },
        update: (patch) => {
          const where = [];
          const u = {
            eq: (...a) => { where.push(['eq', ...a]); return u; },
            is: (...a) => { where.push(['is', ...a]); return u; },
            select: () => { calls.push(['update', table, patch, where]); return Promise.resolve(onUpdate ? onUpdate(patch, where) : { data: [], error: null }); },
          };
          return u;
        },
        then: (res, rej) => settle(false).then(res, rej),
      };
      return b;
    },
  };
  return client;
}
function loadRoute(file, client, user = { id: UID }) {
  return loadRealModule(join(ROOT, file), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => user }],
      ['@/lib/owned-provider', ownedProvider],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/leaderboard.mjs', LB],
      ['@/lib/supabase/admin', { createAdminClient: () => client }],
    ]),
  });
}
const req = (url, init) => new Request('https://shape.test' + url, init);
const MISSING = { code: 'PGRST202', message: 'Could not find the function public.shape_member_board in the schema cache' };

const boardRow = (o) => ({ user_id: 'u' + o.rank, display_name: 'Member ' + o.rank, avatar_url: null, points: 100 - o.rank, rank: o.rank, prev_rank: null, rank_points: 100, streak: 0, training_days: 0, meal_days: 0, total: o.total ?? 3, is_me: false, ...o });
const ownRows = (prefs, settings) => ({ data: [
  ...(prefs ? [{ kind: 'client_privacy_prefs', data: prefs }] : []),
  ...(settings ? [{ kind: 'client_settings', data: settings }] : []),
], error: null });

test('member board: the scope, window and limit reach the database, and the body says who sees you', async () => {
  const client = fakeClient({
    rpc: { shape_member_board: { data: [boardRow({ rank: 1 }), boardRow({ rank: 2, user_id: UID, is_me: true }), boardRow({ rank: 3 })], error: null } },
    tables: { user_goals: ownRows(null, { profileVisibility: 'Private' }) },
  });
  const route = await loadRoute('src/app/api/leaderboard/route.ts', client);
  const res = await route.GET(req('/api/leaderboard?scope=following&period=week&limit=2'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(client.calls.find((c) => c[0] === 'rpc').slice(1), ['shape_member_board', { p_scope: 'following', p_period: 'week', p_limit: 2 }]);
  assert.equal(body.total, 3);
  assert.deepEqual(body.entries.map((e) => e.rank), [1, 2], 'the limit dropped a row it should keep, or kept one past it');
  assert.equal(body.me.rank, 2);
  assert.equal(body.me.total, 3);
  assert.equal(body.hidden, 'private');
  assert.deepEqual(body.privacy, { leaderboard: true, teamBoard: null });
  assert.equal(body.following, 0);
  assert.ok(!('hasCoach' in body));
});

test('member board: the team board says whether you have a coach, and asks before showing you', async () => {
  const client = fakeClient({
    rpc: { shape_member_board: { data: [boardRow({ rank: 1, user_id: UID, is_me: true, total: 1 })], error: null } },
    tables: { user_goals: ownRows({}, null), subscriptions: { data: null, error: null, count: 1 } },
  });
  const body = await (await (await loadRoute('src/app/api/leaderboard/route.ts', client)).GET(req('/api/leaderboard?scope=team'))).json();
  assert.equal(body.hasCoach, true);
  assert.equal(body.hidden, 'team_unasked');
  const sub = client.calls.find((c) => c[1] === 'subscriptions')[2];
  assert.deepEqual(sub.find((o) => o[0] === 'in'), ['in', 'status', ['active', 'trialing']]);
});

test('member board: a failed read is never an empty board', async () => {
  const route = await loadRoute('src/app/api/leaderboard/route.ts', fakeClient({
    rpc: { shape_member_board: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } },
    tables: { user_goals: ownRows(null, null) },
  }));
  const res = await route.GET(req('/api/leaderboard'));
  assert.equal(res.status, 502);
  // and an unread setting is reported as unread, not as a default
  const route2 = await loadRoute('src/app/api/leaderboard/route.ts', fakeClient({
    rpc: { shape_member_board: { data: [], error: null } },
    tables: { user_goals: { data: null, error: { message: 'down' } } },
  }));
  const body = await (await route2.GET(req('/api/leaderboard'))).json();
  assert.equal(body.privacy, null);
  assert.equal(body.hidden, null);
  assert.equal(body.me, null);
  assert.deepEqual(body.entries, []);
  // signed out
  const anon = await loadRoute('src/app/api/leaderboard/route.ts', fakeClient(), null);
  assert.equal((await anon.GET(req('/api/leaderboard'))).status, 401);
});

test('member board before the migration: Everyone falls back to the old board, with short names', async () => {
  const client = fakeClient({
    rpc: {
      shape_member_board: { data: null, error: MISSING },
      shape_leaderboard: { data: [{ user_id: 'a', full_name: 'Priya Shah', avatar_url: null, points: 90, rank: 1 }, { user_id: UID, full_name: 'Sam Rivera', avatar_url: null, points: 40, rank: 2 }], error: null },
      shape_leaderboard_me: { data: [{ points: 40, rank: 2, total: 9 }], error: null },
    },
    tables: { user_goals: ownRows(null, null) },
  });
  const route = await loadRoute('src/app/api/leaderboard/route.ts', client);
  const body = await (await route.GET(req('/api/leaderboard?scope=everyone'))).json();
  assert.equal(body.legacy, true);
  assert.deepEqual(body.entries.map((e) => e.name), ['Priya S.', 'Sam R.']);
  assert.equal(body.me.total, 9);
  assert.equal(body.total, 9);
  // a failed old read is still not an empty board
  const broken = fakeClient({ rpc: { shape_member_board: { data: null, error: MISSING }, shape_leaderboard: { data: null, error: { message: 'x' } }, shape_leaderboard_me: { data: [], error: null } }, tables: { user_goals: ownRows(null, null) } });
  assert.equal((await (await loadRoute('src/app/api/leaderboard/route.ts', broken)).GET(req('/api/leaderboard'))).status, 502);
  // and the boards the old function cannot draw say they are not switched on
  const team = await loadRoute('src/app/api/leaderboard/route.ts', fakeClient({ rpc: { shape_member_board: { data: null, error: MISSING } }, tables: { user_goals: ownRows(null, null) } }));
  assert.equal((await team.GET(req('/api/leaderboard?scope=team'))).status, 503);
});

test('coach board: coaches only, each failure its own status, and the body trimmed around you', async () => {
  const rows = [];
  for (let r = 1; r <= 80; r++) rows.push({ provider_id: r, name: 'Coach ' + r, specialty: null, avatar_url: null, points: 9000 - r, active_clients: 3, completion_pct: 90, rank: r, prev_rank: r + 1, gained: 10, gained_since: '2026-09-15', is_me: r === 70, listed: true });
  const client = fakeClient({ rpc: { shape_coach_board: { data: rows, error: null } } });
  const route = await loadRoute('src/app/api/coach/leaderboard/route.ts', client);
  const body = await (await route.GET(req('/api/coach/leaderboard?role=trainer&view=climb&limit=10'))).json();
  assert.deepEqual(client.calls[0].slice(1), ['shape_coach_board', { p_role: 'trainer', p_view: 'climb' }]);
  assert.equal(body.total, 80);
  assert.equal(body.since, '2026-09-15');
  assert.deepEqual(body.entries.map((e) => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 69, 70, 71]);
  assert.equal(body.me.rank, 70);
  assert.equal(body.entries[0].moved, 1);

  const standing = await (await route.GET(req('/api/coach/leaderboard?role=trainer'))).json();
  assert.equal(standing.since, null, 'standing names a climb baseline');

  const status = async (error, url = '/api/coach/leaderboard?role=nutritionist') =>
    (await (await loadRoute('src/app/api/coach/leaderboard/route.ts', fakeClient({ rpc: { shape_coach_board: { data: null, error } } }))).GET(req(url))).status;
  assert.equal(await status({ code: '42501', message: 'shape_coach_board: coaches only' }), 403);
  assert.equal(await status(MISSING), 503);
  assert.equal(await status({ code: '57014', message: 'timeout' }), 502);
  assert.equal(await status(null, '/api/coach/leaderboard?role=coach'), 400);
  const anon = await loadRoute('src/app/api/coach/leaderboard/route.ts', fakeClient(), null);
  assert.equal((await anon.GET(req('/api/coach/leaderboard?role=trainer'))).status, 401);
});

// A user_goals row the scripted client keeps: reads see it, a conditional update applies only
// when its updated_at still matches, and `bump` lets a test change it underneath a request.
function privacyStore(initial) {
  const st = { row: initial ? { data: initial, updated_at: '2026-10-15T10:00:00.000Z' } : null, writes: 0, bump: null };
  const client = fakeClient({
    tables: { user_goals: () => {
      const r = st.row ? { data: { data: st.row.data, updated_at: st.row.updated_at }, error: null } : { data: null, error: null };
      if (st.bump) { const f = st.bump; st.bump = null; f(st); } // another write lands after this read
      return r;
    } },
    onInsert: (row) => { if (st.row) return { error: { code: '23505', message: 'duplicate key' } }; st.row = { data: row.data, updated_at: row.updated_at }; st.writes++; return { error: null }; },
    onUpdate: (patch, where) => {
      const cond = where.find((w) => w[1] === 'updated_at');
      const matches = cond[0] === 'is' ? st.row.updated_at === null : st.row.updated_at === cond[2];
      if (!matches) return { data: [], error: null };
      st.row = { data: patch.data, updated_at: patch.updated_at + '#' + (++st.writes) };
      return { data: [{ user_id: UID }], error: null };
    },
  });
  return { st, client };
}

test('the switches route: strict booleans, other keys kept, and the read-back is the answer', async () => {
  const { st, client } = privacyStore({ other: 'keep', leaderboard: 'on' });
  const route = await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', client);
  assert.deepEqual(await (await route.GET(req('/api/me/leaderboard-privacy'))).json(), { leaderboard: true, teamBoard: null });

  const put = (r, body) => r.PUT(req('/api/me/leaderboard-privacy', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  let res = await put(route, { teamBoard: true, leaderboard: false });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { leaderboard: false, teamBoard: true });
  assert.deepEqual(st.row.data, { other: 'keep', leaderboard: 'off', team_board: 'on' });
  assert.ok(!client.calls.some((c) => c[0] === 'upsert'), 'a whole-document upsert is back');
  const up = client.calls.find((c) => c[0] === 'update');
  assert.deepEqual(up[3].slice(0, 2), [['eq', 'user_id', UID], ['eq', 'kind', 'client_privacy_prefs']]);
  assert.deepEqual(up[3][2], ['eq', 'updated_at', '2026-10-15T10:00:00.000Z'], 'the write is not conditioned on the version it read');

  for (const bad of [{ leaderboard: 'off' }, { teamBoard: 1 }, {}, { unrelated: true }]) {
    assert.equal((await put(route, bad)).status, 400, 'accepted ' + JSON.stringify(bad));
  }

  // a first save creates the document
  const fresh = privacyStore(null);
  res = await put(await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', fresh.client), { leaderboard: false });
  assert.equal(res.status, 200);
  assert.deepEqual(fresh.st.row.data, { leaderboard: 'off' });

  // a failed read is not "on"
  const down = fakeClient({ tables: { user_goals: { data: null, error: { message: 'down' } } } });
  assert.equal((await (await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', down)).GET(req('/x'))).status, 503);
  assert.equal((await put(await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', down), { leaderboard: false })).status, 503);
  const anon = await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', fakeClient(), null);
  assert.equal((await anon.GET(req('/x'))).status, 401);
});

test('the switches route: two saves at once both land (Codex, on #2371)', async () => {
  // Turning the team board on while another request turns the board off: the other write lands
  // between this request's read and its write. Before the fix, the whole-document upsert wrote
  // the stale `leaderboard: 'on'` back.
  const { st, client } = privacyStore({ leaderboard: 'on' });
  st.bump = (s2) => { s2.row = { data: { leaderboard: 'off' }, updated_at: '2026-10-15T10:00:01.000Z' }; };
  const route = await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', client);
  const res = await route.PUT(req('/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teamBoard: true }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(st.row.data, { leaderboard: 'off', team_board: 'on' }, 'the other request\'s change was overwritten');
  assert.equal(client.calls.filter((c) => c[0] === 'update').length, 2, 'the stale write was not refused and retried');

  // a document that keeps changing is reported, not overwritten
  const busy = privacyStore({ leaderboard: 'on' });
  let n = 0;
  const keepBumping = (s2) => { s2.row = { data: { leaderboard: 'on' }, updated_at: 'v' + (++n) }; s2.bump = keepBumping; };
  busy.st.bump = keepBumping;
  const r2 = await (await loadRoute('src/app/api/me/leaderboard-privacy/route.ts', busy.client)).PUT(req('/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ leaderboard: false }) }));
  assert.equal(r2.status, 409);
  assert.equal((await r2.json()).code, 'busy');
  assert.deepEqual(busy.st.row.data, { leaderboard: 'on' });
});

// shapeBackend.js imports the whole app, so its writer is run on its own: the source between the
// queue and the service object, with the request function it calls handed in.
test('the app writes the switches one at a time (Codex, on #2371)', async () => {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf('let leaderboardPrivacyQueue');
  const end = src.indexOf('window.ShapeLeaderboard =');
  assert.ok(start > 0 && end > start, 'the queued writer is gone');
  const sent = [];
  const pending = [];
  const shapeApiFetch = (path, init) => { sent.push(JSON.parse(init.body)); return new Promise((resolve) => pending.push(resolve)); };
  const isPrivacy = (d) => !!d && typeof d.leaderboard === 'boolean';
  const setPrivacy = new Function('shapeApiFetch', 'isPrivacy', src.slice(start, end) + '\nreturn setLeaderboardPrivacy;')(shapeApiFetch, isPrivacy);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const answer = (status, body) => ({ ok: status < 300, status, json: () => (body ? Promise.resolve(body) : Promise.reject(new Error('no body'))) });
  const a = setPrivacy({ leaderboard: false });
  const b = setPrivacy({ teamBoard: true });
  const c = setPrivacy({ leaderboard: true });
  await tick();
  assert.deepEqual(sent, [{ leaderboard: false }], 'a second save went out before the first answered');
  pending[0](answer(200, { leaderboard: false, teamBoard: null }));
  assert.deepEqual(await a, { leaderboard: false, teamBoard: null });
  await tick();
  assert.equal(sent.length, 2);
  pending[1](answer(503, null)); // a failed save does not hold up the next
  assert.equal(await b, null);
  await tick();
  assert.deepEqual(sent, [{ leaderboard: false }, { teamBoard: true }, { leaderboard: true }]);
  pending[2](answer(200, { leaderboard: true, teamBoard: null }));
  assert.deepEqual(await c, { leaderboard: true, teamBoard: null });
});

test('the nightly reading: the cron secret, the writer, and a database without it', async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 's3cret';
  try {
    const client = fakeClient({ rpc: { record_coach_score_snapshots: { data: 43, error: null } } });
    const route = await loadRoute('src/app/api/cron/coach-score-snapshots/route.ts', client);
    assert.equal((await route.GET(req('/x'))).status, 401);
    assert.equal((await route.GET(req('/x', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
    const ok = await route.GET(req('/x', { headers: { authorization: 'Bearer s3cret' } }));
    assert.deepEqual(await ok.json(), { ok: true, written: 43 });
    const missing = await loadRoute('src/app/api/cron/coach-score-snapshots/route.ts', fakeClient({ rpc: { record_coach_score_snapshots: { data: null, error: MISSING } } }));
    assert.deepEqual(await (await missing.POST(req('/x', { headers: { 'x-cron-secret': 's3cret' } }))).json(), { ok: true, skipped: 'not_set_up' });
    const failing = await loadRoute('src/app/api/cron/coach-score-snapshots/route.ts', fakeClient({ rpc: { record_coach_score_snapshots: { data: null, error: { message: 'x' } } } }));
    assert.equal((await failing.GET(req('/x', { headers: { 'x-cron-secret': 's3cret' } }))).status, 500);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
  }
  assert.ok(JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/cron/coach-score-snapshots'), 'the nightly reading is not scheduled');
});

test('the four routes are registered in the War Room', async () => {
  const wr = read('src/lib/warroom.ts');
  for (const [path, methods] of [['/api/leaderboard', 'GET'], ['/api/coach/leaderboard', 'GET'], ['/api/me/leaderboard-privacy', 'GET,PUT'], ['/api/cron/coach-score-snapshots', 'GET,POST']]) {
    assert.equal(wr.split(`['${path}', '${methods}']`).length - 1, 1, path + ' is not registered once');
  }
});

// ── 3. The migration ────────────────────────────────────────────────────────────────────────
const sqlCode = stripComments(SQL.replace(/--[^\n]*/g, ''));
function fnBody(name) {
  const at = sqlCode.indexOf('create or replace function public.' + name + '(');
  assert.ok(at >= 0, name + ' is not created');
  const end = sqlCode.indexOf('$$;', sqlCode.indexOf('$$', at) + 2);
  return sqlCode.slice(at, end);
}

test('every definer pins its search path and every function is closed to anon', () => {
  for (const name of ['record_coach_score_snapshots', 'shape_coach_board', 'shape_member_board']) {
    const body = fnBody(name);
    assert.match(body, /security definer\s+set search_path = public, pg_temp/, name + ' is not pinned');
  }
  assert.match(fnBody('shape_coach_score_parts'), /set search_path = public, pg_temp/);
  assert.ok(!/security definer/.test(fnBody('shape_coach_score_parts')), 'the score parts became a definer');
  assert.match(sqlCode, /revoke execute on function public\.shape_coach_score_parts\(text\) from public, anon, authenticated;/);
  assert.match(sqlCode, /revoke execute on function public\.record_coach_score_snapshots\(\) from public, anon, authenticated;\s*grant execute on function public\.record_coach_score_snapshots\(\) to service_role;/);
  assert.match(sqlCode, /revoke execute on function public\.shape_member_board\(text, text, integer\) from public, anon;\s*grant execute on function public\.shape_member_board\(text, text, integer\) to authenticated, service_role;/);
  assert.match(sqlCode, /revoke execute on function public\.shape_coach_board\(text, text\) from public, anon;/);
  assert.match(sqlCode, /alter table public\.coach_score_snapshots enable row level security;\s*revoke all on table public\.coach_score_snapshots from anon, authenticated;/);
  // the old full-name boards are closed to callers
  assert.match(sqlCode, /revoke execute on function public\.shape_leaderboard\(text, integer\) from public, anon, authenticated;/);
  assert.match(sqlCode, /revoke execute on function public\.shape_leaderboard_me\(text\) from public, anon, authenticated;/);
});

test('the member board applies the privacy rules the switches promise', () => {
  const body = fnBody('shape_member_board');
  assert.match(body, /if v_me is null then/);
  // everyone and following: public profiles that have not turned the board off
  assert.match(body, /coalesce\(g\.data->>'leaderboard', 'on'\) <> 'off'/);
  assert.match(body, /when 'everyone'\s+then public\.shape_profile_visibility\(e\.uid\) = 'public'/);
  assert.match(body, /when 'following' then public\.shape_profile_visibility\(e\.uid\) = 'public'\s+and e\.uid in \(select uid from followed\)/);
  assert.match(body, /f\.follower_id = v_me and f\.status = 'accepted'/, 'a pending follow counts');
  // team: the switch, AND a shared active coach of the same role
  assert.match(body, /else g\.data->>'team_board' = 'on'\s+and e\.uid in \(select uid from teammates\)/);
  assert.match(body, /on c\.provider_role = s\.provider_role and c\.provider_id = s\.provider_id/);
  assert.equal((body.match(/status in \('active', 'trialing'\)/g) || []).length, 2, 'both ends of the team are active subscriptions');
  // points: store spending and tier bonuses never count, now or a week ago
  assert.equal((body.match(/not in \('store_redeem', 'tier_bonus'\)/g) || []).length, 3);
  assert.match(body, /having sum\(l\.delta\) > 0/);
  // ⚠ training and nutrition are the caller's own (privacy policy; Codex on #2371)
  for (const col of ['st', 'td', 'md']) {
    assert.match(body, new RegExp('case when s\\.uid = v_me then coalesce\\(' + col + '\\.n, 0\\)::integer end'), col + ' leaves for other members');
  }
  // ⚠ a photo only for a public profile or your own: the team board's ask does not name it (Codex, #2371)
  assert.match(body, /case when s\.uid = v_me or public\.shape_profile_visibility\(s\.uid\) = 'public' then p\.avatar_url end,/);
  assert.ok(!/^\s*p\.avatar_url,\s*$/m.test(body), 'the photo is returned unconditionally');
  // nothing here returns a subscription or a coach
  const out = /returns table \(([\s\S]*?)\)\s*language/.exec(body)[1];
  assert.ok(!/provider|coach|subscription|full_name|email/.test(out), 'the board returns ' + out);
});

test('the coach board ranks the score the coach Score page shows', () => {
  // the same three terms in the database, in get_coach_scores, and in /api/coach/score
  const parts = fnBody('shape_coach_score_parts');
  assert.match(parts, /active_clients \* 50 \+ completion_pct \* 10 \+ programs \* 80/);
  assert.match(parts, /scheduled_at >= \(now\(\) - interval '90 days'\)/);
  assert.match(parts, /status in \('active', 'trialing'\)/);
  const batch = read('supabase-migrations/2026-07-25-coach-scores-batch.sql');
  assert.match(batch, /coalesce\(subs\.active_clients, 0\) \* 50/);
  assert.match(batch, /round\(\(sess\.completed::numeric \/ sess\.total\) \* 100\) \* 10/);
  assert.match(batch, /coalesce\(progs\.n, 0\) \* 80/);
  const route = read('src/app/api/coach/score/route.ts');
  assert.match(route, /activeClients \* 50/);
  assert.match(route, /Math\.round\(completionPct \* 10\)/);
  assert.match(route, /programsPublished \* 80/);
  assert.match(route, /getUTCDate\(\) - 90/);
  // coaches only, live listings plus your own
  const board = fnBody('shape_coach_board');
  assert.match(board, /raise exception 'shape_coach_board: coaches only' using errcode = '42501'/);
  assert.match(board, /and \(coalesce\(t\.listing_ready, false\) or t\.owner_id = v_me\)/);
  assert.match(board, /and \(coalesce\(n\.listing_ready, false\) or n\.owner_id = v_me\)/);
  // climbers never measure against today's own reading
  assert.match(board, /s\.provider_role = p_role and s\.day < v_today\)\)/);
  assert.match(board, /s\.day <= v_today - 30/);
  assert.match(board, /s\.day <= v_today - 7/);
});
