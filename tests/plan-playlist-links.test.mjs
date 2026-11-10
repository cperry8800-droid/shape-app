// The link a playlist on a member's plan opens (owner, 2026-11-10: "make the playlist chip open the
// playlist"). /api/client/plan looks it up in the saved playlists (coach_soundtracks) of the coach who
// wrote that session or menu: by id, or by a name only one of theirs has; never from the plan itself, and
// only an https Spotify or Apple Music link. The website's chip opens it (tests/meal-plan-playlists.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { safePlaylistUrl, playlistLinkIndex, linkedPlaylist, linkMealDays, mealDaysHavePlaylist } from '../src/lib/plan-playlist-links.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('only an https Spotify or Apple Music link is one', () => {
  assert.equal(safePlaylistUrl(' https://open.spotify.com/playlist/abc '), 'https://open.spotify.com/playlist/abc');
  assert.equal(safePlaylistUrl('https://spotify.link/xyz'), 'https://spotify.link/xyz');
  assert.equal(safePlaylistUrl('https://music.apple.com/us/playlist/x/pl.1'), 'https://music.apple.com/us/playlist/x/pl.1');
  for (const bad of ['http://open.spotify.com/playlist/abc', 'javascript:alert(1)', 'https://open.spotify.com.evil.test/x', 'https://evilspotify.com/x', 'https://apple.com/music', '', '  ', null, 42, {}]) {
    assert.equal(safePlaylistUrl(bad), null, String(bad));
  }
});

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Saved playlists' ids are uuids (coach_soundtracks.id).
const [S1, S2, S3, S4, S5, S6] = [1, 2, 3, 4, 5, 6].map((n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`);
const ROWS = [
  { id: S1, owner_id: A, name: 'Pull heavy', url: 'https://open.spotify.com/playlist/pull' },
  { id: S2, owner_id: A, name: 'Twin', url: 'https://open.spotify.com/playlist/twin-1' },
  { id: S3, owner_id: A, name: ' twin', url: 'https://open.spotify.com/playlist/twin-2' },
  { id: S4, owner_id: A, name: 'No link', url: null },
  { id: S5, owner_id: A, name: 'Bad link', url: 'javascript:alert(1)' },
  { id: S6, owner_id: B, name: 'Sunday prep', url: 'https://music.apple.com/us/playlist/sunday/pl.6' },
];

test('a playlist opens its coach\'s saved link: by id, or by a name only one of theirs has', () => {
  const ix = playlistLinkIndex(ROWS);
  assert.deepEqual(linkedPlaylist({ id: S1, name: 'Pull heavy', meta: '14 tracks' }, A, ix), { id: S1, name: 'Pull heavy', meta: '14 tracks', url: 'https://open.spotify.com/playlist/pull' });
  assert.deepEqual(linkedPlaylist({ name: '  pull HEAVY ', meta: '' }, A, ix), { name: 'pull HEAVY', meta: '', url: 'https://open.spotify.com/playlist/pull' }, 'one saved before ids, by its name');
  assert.deepEqual(linkedPlaylist({ name: 'Twin' }, A, ix), { name: 'Twin', meta: '' }, 'a name two share opens neither');
  assert.deepEqual(linkedPlaylist({ id: S2, name: 'Twin' }, A, ix).url, 'https://open.spotify.com/playlist/twin-1', 'an id tells them apart');
  assert.deepEqual(linkedPlaylist({ id: 'st-gone', name: 'Pull heavy' }, A, ix), { id: 'st-gone', name: 'Pull heavy', meta: '' }, 'a deleted playlist opens no namesake');
  assert.equal('url' in linkedPlaylist({ id: S4, name: 'No link' }, A, ix), false, 'one saved without a link');
  assert.equal('url' in linkedPlaylist({ id: S5, name: 'Bad link' }, A, ix), false, 'an unsafe saved link');
  assert.equal('url' in linkedPlaylist({ id: S6, name: 'Sunday prep' }, A, ix), false, 'another coach\'s playlist, even by its id');
  assert.equal('url' in linkedPlaylist({ id: S1, name: 'Pull heavy' }, null, ix), false, 'no coach, no link');
  // ⚠ NEVER A LINK FROM THE PLAN: the payload is client-written.
  assert.deepEqual(linkedPlaylist({ id: 'st-x', name: 'Planted', meta: '', url: 'https://open.spotify.com/planted' }, A, ix), { id: 'st-x', name: 'Planted', meta: '' });
  for (const none of [null, undefined, 'Pull heavy', [], {}, { name: '  ' }]) assert.equal(linkedPlaylist(none, A, ix), null, JSON.stringify(none));
});

test('a menu\'s day and meal playlists are read the same way; a menu without one is returned as it was', () => {
  const ix = playlistLinkIndex(ROWS);
  const plain = [{ dow: 0, meals: [{ id: 'm1', title: 'Oats' }] }, { dow: 1, meals: [] }];
  assert.equal(mealDaysHavePlaylist(plain), false);
  const same = linkMealDays(plain, B, ix);
  assert.equal(same[0], plain[0], 'a day without a playlist is the same object');
  assert.deepEqual(same, plain);
  const days = [
    { dow: 6, title: 'Prep', playlist: { id: S6, name: 'Sunday prep', meta: '12 tracks', url: 'https://evil.test/x' },
      meals: [{ id: 'm1', title: 'Soup', playlist: { name: 'Sunday prep', meta: '' } }, { id: 'm2', title: 'Eggs' }, { id: 'm3', title: 'Odd', playlist: { name: '' } }] },
  ];
  assert.equal(mealDaysHavePlaylist(days), true);
  const out = linkMealDays(days, B, ix);
  assert.deepEqual(out[0].playlist, { id: S6, name: 'Sunday prep', meta: '12 tracks', url: 'https://music.apple.com/us/playlist/sunday/pl.6' }, 'the stored link replaced by the coach\'s');
  assert.deepEqual(out[0].meals[0].playlist, { name: 'Sunday prep', meta: '', url: 'https://music.apple.com/us/playlist/sunday/pl.6' });
  assert.equal(out[0].meals[1], days[0].meals[1], 'a meal without one, as it was');
  assert.equal('playlist' in out[0].meals[2], false, 'a nameless one is no playlist');
  assert.equal(days[0].playlist.url, 'https://evil.test/x', 'the stored menu is not changed');
  const unlinked = linkMealDays(days, null, ix);
  assert.equal('url' in unlinked[0].playlist, false, 'no coach: a stored link still goes');
});

// ── The route ──
const U = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function loadRoute(db, admin) {
  return loadRealModule(join(ROOT, 'src/app/api/client/plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', { NextResponse: { json: (body, init) => ({ body, init }) } }],
      ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => ({ id: U }) }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/supabase/admin', { createAdminClient: () => { if (!admin) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY'); return admin; } }],
    ]),
  });
}
const monday = (() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); })();
const memberTables = (over = {}) => ({
  client_workouts: [
    { id: 'w1', client_id: U, status: 'published', scheduled_date: monday, created_at: '2026-11-01', trainer_id: 7, title: 'Upper Pull', kind: 'workout',
      payload: { exercises: [], playlist: { id: S1, name: 'Pull heavy', meta: '14 tracks', url: 'https://evil.test/planted' } } },
    { id: 'w2', client_id: U, status: 'published', scheduled_date: monday, created_at: '2026-11-01', trainer_id: 7, title: 'Legs', kind: 'workout', payload: { exercises: [] } },
  ],
  client_meal_plans: [
    { id: 'mp1', client_id: U, status: 'published', created_at: '2026-11-01', nutritionist_id: 9, title: 'Week', week_start: monday,
      payload: { days: [{ dow: 6, playlist: { id: S6, name: 'Sunday prep', meta: '' }, meals: [{ id: 'm1', title: 'Soup', playlist: { id: S6, name: 'Sunday prep', meta: '' } }] }, { dow: 0, meals: [{ id: 'm2', title: 'Oats' }] }] } },
  ],
  client_programs: [], subscriptions: [], conversations: [],
  trainers: [{ id: 7, name: 'Tom', owner_id: A }],
  nutritionists: [{ id: 9, name: 'Nia', owner_id: B }],
  ...over,
});

// The service role's reads, recording what each asked for, answered from `rows` as PostgREST would: every
// `in` filter applied, ordered, and the asked range cut to the server's own row ceiling (`maxRows`).
function recordingAdmin(rows, { maxRows = Infinity } = {}) {
  const seen = [];
  return {
    seen,
    from(table) {
      const q = { table, in: [] };
      const run = () => {
        seen.push(q);
        let out = rows.filter((r) => q.in.every(([col, vals]) => vals.includes(r[col])));
        if (q.order) out = [...out].sort((a, b) => (a[q.order] < b[q.order] ? -1 : a[q.order] > b[q.order] ? 1 : 0));
        if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
        return { data: out.slice(0, maxRows), error: null };
      };
      const chain = {
        select(cols) { q.select = cols; return chain; },
        in(col, values) { q.in.push([col, values]); return chain; },
        order(col) { q.order = col; return chain; },
        range(from, to) { q.range = [from, to]; return chain; },
        then(ok, bad) { return Promise.resolve().then(run).then(ok, bad); },
      };
      return chain;
    },
  };
}
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

test('which rows a plan needs: those its ids name, and the whole list only of a coach a name needs', async () => {
  const { playlistLookups } = await import('../src/lib/plan-playlist-links.mjs');
  assert.deepEqual(playlistLookups([
    { playlist: { id: S1, name: 'Pull heavy' }, owner: A },
    { playlist: { id: S1, name: 'Pull heavy' }, owner: A },
    { playlist: { id: S6, name: 'Sunday prep' }, owner: B },
    { playlist: { name: 'Old mix' }, owner: A },
    { playlist: { id: 'pl-1', name: 'Sample' }, owner: A },
    { playlist: { id: S2, name: 'Twin' }, owner: null },
    { playlist: { id: S3, name: '  ' }, owner: A },
    { playlist: null, owner: A },
  ]), { ids: [S1, S6], idOwners: [A, B], nameOwners: [A] }, 'a non-uuid id could match nothing, and would fail the read');
});

test('the plan read sets each playlist\'s link from its own coach\'s saved playlists, reading only what the plan names', async () => {
  // Another coach's playlist of the same id: never this member's link, and never read.
  const admin = recordingAdmin([{ id: S1, owner_id: OTHER, name: 'Pull heavy', url: 'https://open.spotify.com/other' }, ...ROWS]);
  const { body } = await (await loadRoute(fakeSupabase({ tables: memberTables() }), admin)).GET(new Request('https://x/api/client/plan'));
  const pull = body.training.workouts.find((w) => w.id === 'w1');
  assert.deepEqual(pull.playlist, { id: S1, name: 'Pull heavy', meta: '14 tracks', url: 'https://open.spotify.com/playlist/pull' }, 'the trainer\'s own link, not the payload\'s');
  assert.equal(body.training.workouts.find((w) => w.id === 'w2').playlist, null);
  const sun = body.meals.days.find((d) => d.dow === 6);
  assert.equal(sun.playlist.url, 'https://music.apple.com/us/playlist/sunday/pl.6', 'the nutritionist\'s, for the day');
  assert.equal(sun.meals[0].playlist.url, 'https://music.apple.com/us/playlist/sunday/pl.6', 'and the meal');
  assert.deepEqual(body.meals.days.find((d) => d.dow === 0), { dow: 0, meals: [{ id: 'm2', title: 'Oats' }] }, 'a day without one, as stored');
  // Every playlist has an id: one read, of those ids, from the coaches behind this member's own plan.
  assert.equal(admin.seen.length, 1);
  assert.deepEqual(admin.seen[0], { table: 'coach_soundtracks', select: 'id, owner_id, name, url', in: [['owner_id', [A, B]], ['id', [S1, S6]]] });
});

test('a playlist saved before ids reads its coach\'s whole list, page after page past the server\'s row ceiling', async () => {
  // 2,500 of the trainer's playlists, the one the plan names among the last, a server that answers 600 rows at
  // most: the first read of every row, capped at 1,000, missed it (Codex P2 on #2679).
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: `0000${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`, owner_id: A, name: 'Mix ' + i, url: 'https://open.spotify.com/playlist/' + i }));
  const admin = recordingAdmin([...many, { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', owner_id: A, name: 'Old mix', url: 'https://open.spotify.com/playlist/old' }, { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', owner_id: OTHER, name: 'Old mix', url: 'https://open.spotify.com/playlist/theirs' }], { maxRows: 600 });
  const tables = memberTables({
    client_workouts: [{ id: 'w3', client_id: U, status: 'published', scheduled_date: monday, created_at: '2026-11-01', trainer_id: 7, title: 'Old day', kind: 'workout', payload: { exercises: [], playlist: { name: 'Old mix', meta: '' } } }],
    client_meal_plans: [],
  });
  const { body } = await (await loadRoute(fakeSupabase({ tables }), admin)).GET(new Request('https://x/api/client/plan'));
  assert.deepEqual(body.training.workouts[0].playlist, { name: 'Old mix', meta: '', url: 'https://open.spotify.com/playlist/old' });
  // Only the trainer's list, in id order, each read starting where the last one ended, until one comes back empty.
  assert.ok(admin.seen.every((q) => JSON.stringify(q.in) === JSON.stringify([['owner_id', [A]]]) && q.order === 'id'));
  assert.deepEqual(admin.seen.map((q) => q.range[0]), [0, 600, 1200, 1800, 2400, 2501]);
});

test('no playlist on the plan, no read; a read that fails leaves every playlist a name', async () => {
  const admin = recordingAdmin(ROWS);
  const bare = memberTables({
    client_workouts: [{ id: 'w2', client_id: U, status: 'published', scheduled_date: monday, created_at: '2026-11-01', trainer_id: 7, title: 'Legs', kind: 'workout', payload: { exercises: [] } }],
    client_meal_plans: [],
  });
  await (await loadRoute(fakeSupabase({ tables: bare }), admin)).GET(new Request('https://x/api/client/plan'));
  assert.equal(admin.seen.length, 0, 'the service role is not asked');
  for (const failing of [null, fakeSupabase({ tables: {}, fail: ['coach_soundtracks'] })]) {
    const { body } = await (await loadRoute(fakeSupabase({ tables: memberTables() }), failing)).GET(new Request('https://x/api/client/plan'));
    assert.deepEqual(body.training.workouts.find((w) => w.id === 'w1').playlist, { id: S1, name: 'Pull heavy', meta: '14 tracks' }, 'a name, and never the payload\'s link');
    const sun = body.meals.days.find((d) => d.dow === 6);
    assert.deepEqual(sun.playlist, { id: S6, name: 'Sunday prep', meta: '' });
    assert.equal(body.meals.hasPlan, true);
  }
});

test('a row both reads return is one playlist, not two of a name', () => {
  const row = { id: S1, owner_id: A, name: 'Pull heavy', url: 'https://open.spotify.com/playlist/pull' };
  const ix = playlistLinkIndex([row, { ...row }]);
  assert.equal(linkedPlaylist({ name: 'Pull heavy' }, A, ix).url, 'https://open.spotify.com/playlist/pull');
});
