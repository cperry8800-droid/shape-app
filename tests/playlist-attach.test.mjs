// Playlists on real data (owner, 2026-11-05): the Attach view saves (send to clients through the existing
// `attached` entries; a program day's playlist in the template), a day's playlist reaches the client's
// workout card with its link, the card opens it in the member's own Spotify or Apple Music, the member
// website shows what their coaches sent, and a coach's Spotify track list with energy tags and reorder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsPlaylistLink, bsWorkoutPlaylist, bsPlaylistService } from '../mobile-app/src/services/playlistLink.mjs';
import * as Tracks from '../src/lib/soundtrack-tracks.mjs';
import { builderToAssignmentRows } from '../public/newdesign/workoutDocument.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const PA = require('../public/newdesign/playlistAttach.js');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

const SONG = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222222';
const C2 = '33333333-3333-4333-8333-333333333333';
const row = { id: SONG, name: 'Heavy Squat Day', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', tracks: 28, duration: '2h 14m', attached: [] };

test('send to all clients or one client, through the playlist\'s own attached entries', () => {
  let a = PA.toggleSend([{ id: 'w1', kind: 'workout', name: 'Leg day' }], 'all');
  assert.deepEqual(a, [{ id: 'w1', kind: 'workout', name: 'Leg day' }, { id: 'all_clients', kind: 'all_clients', name: 'All clients' }]);
  assert.equal(PA.sendState(a).all, true);
  a = PA.toggleSend(a, C1.toUpperCase(), 'Sam');
  assert.deepEqual(a.at(-1), { id: 'client:' + C1, kind: 'client', clientId: C1, name: 'Sam' });
  assert.ok(PA.sendState(a).clients.has(C1));
  a = PA.toggleSend(a, C1, 'Sam');
  assert.ok(!PA.sendState(a).clients.has(C1), 'a second click takes it back');
  a = PA.toggleSend(a, 'all');
  assert.deepEqual(a, [{ id: 'w1', kind: 'workout', name: 'Leg day' }], 'the workout entry is never touched');
  assert.deepEqual(PA.toggleSend(a, 'not-a-client'), a);
  assert.equal(PA.sendState([{ kind: 'client', clientId: 'x' }]).clients.size, 0);
});

test('a program day carries the playlist with its id and link, and only a Spotify or Apple Music link', () => {
  assert.deepEqual(PA.dayPlaylist(row), { name: 'Heavy Squat Day', meta: '28 tracks · 2h 14m', id: SONG, url: row.url, provider: 'spotify' });
  assert.deepEqual(PA.dayPlaylist({ ...row, url: 'javascript:alert(1)', duration: '—', tracks: 0 }), { name: 'Heavy Squat Day', meta: '', id: SONG });
  assert.equal(PA.dayPlaylist({ ...row, provider: 'apple', url: 'https://music.apple.com/us/playlist/x/pl.u-1' }).provider, 'apple');
  assert.equal(PA.safeLink('http://open.spotify.com/playlist/x'), null, 'https only');
  assert.equal(PA.safeLink('https://evil.example/open.spotify.com/'), null);
  const plan = { id: 'p1', name: 'Strength Block', detail: { revision: 3, builder: { weeks: [{ days: [{ name: 'Day A', blocks: [] }, { name: 'Day B', playlist: { name: 'Heavy Squat Day', meta: '' }, blocks: [] }] }] } } };
  const days = PA.programDays([plan], { p1: { clients: 5 } });
  assert.deepEqual(days.map((d) => [d.name, d.program, d.clients]), [['Day A', 'Strength Block', 5], ['Day B', 'Strength Block', 5]]);
  assert.equal(PA.dayHas(days[1].day, row), true, 'a day saved before ids matches by name');
  assert.equal(PA.dayHas({ playlist: { id: 'other', name: 'Heavy Squat Day' } }, row), false, 'with an id, by id');
  const on = PA.setDayPlaylist(plan.detail, 0, 0, row);
  assert.deepEqual(on.builder.weeks[0].days[0].playlist, PA.dayPlaylist(row));
  assert.equal(plan.detail.builder.weeks[0].days[0].playlist, undefined, 'the original is not mutated');
  assert.equal(PA.setDayPlaylist(on, 0, 0, null).builder.weeks[0].days[0].playlist, null);
  assert.equal(PA.setDayPlaylist(plan.detail, 3, 0, row), null);
});

test('a playlist set in the builder reaches the client\'s workout with its link, and the card opens it', () => {
  // The builder's day → the assignment rows (assign, Update future assignments) → the plan route's read.
  const builder = { version: 1, weeks: [{ days: [{ id: 'd1', name: 'Lower', weekday: 0, playlist: PA.dayPlaylist(row), blocks: [{ kind: 'main', rows: [{ id: 'e1', name: 'Squat', sets: '3', reps: '5' }] }] }] }] };
  const rows = builderToAssignmentRows(builder, { id: 'p1', name: 'Strength', revision: 1 }, '2026-11-09');
  assert.deepEqual(rows[0].payload.playlist, PA.dayPlaylist(row));
  const card = bsWorkoutPlaylist(rows[0].payload.playlist);
  assert.deepEqual(card, { name: 'Heavy Squat Day', meta: '28 tracks · 2h 14m', url: row.url, provider: 'spotify' });
  assert.equal(bsPlaylistService(card), 'Spotify');
  // A day saved before links rode along keeps its name and opens Radio; a bad link is dropped.
  assert.deepEqual(bsWorkoutPlaylist({ name: ' Old ', meta: 'x' }), { name: 'Old', meta: 'x' });
  assert.deepEqual(bsWorkoutPlaylist({ name: 'X', url: 'https://example.com/p' }), { name: 'X', meta: '' });
  assert.equal(bsWorkoutPlaylist({ name: '  ' }), null);
  assert.equal(bsWorkoutPlaylist(null), null);
  assert.equal(bsPlaylistLink('https://music.apple.com/us/playlist/x'), 'https://music.apple.com/us/playlist/x');
  // Every send path copies the whole day playlist.
  assert.match(read('public/newdesign/workoutDocument.js'), /playlist:day\.playlist \? copy\(day\.playlist\) : null/);
  assert.match(read('src/app/api/coach/plans/assignments/route.ts'), /builderToAssignmentRows\(/);
  assert.match(read('mobile-app/src/services/adjustRegen.mjs'), /playlist_id: row\.playlist_id \|\| null/);
  // The readers and the cards.
  assert.match(read('src/app/api/client/plan/route.ts'), /playlist: bsWorkoutPlaylist\(payload\?\.playlist\),/);
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), /playlist: bsWorkoutPlaylist\(w\.playlist\),/);
  const day = read('mobile-app/src/broadsheet/BSTrainDay.jsx');
  assert.match(day, /const u = bsPlaylistLink\(cur\.playlist\.url\); if \(!u\) \{ if \(p\.onRadio\) p\.onRadio\(\); return; \} try \{ window\.open\(u, '_blank', 'noopener,noreferrer'\);/);
  assert.match(day, /tr\('session:train\.openPlaylistIn', \{ defaultValue: 'Open \{name\} in \{service\}'/);
  assert.match(read('public/newdesign/dashClient.jsx'), /href=\{workout\.playlist\.url && \/\^https:/);
  const builderSrc = read('public/newdesign/dashBuilder.jsx');
  assert.match(builderSrc, /\.\.\.\(p\.url \? \{ url: p\.url, provider: p\.provider \|\| "spotify" \} : \{\}\)/);
  assert.doesNotMatch(builderSrc, /x\.track_count/, 'the column is `tracks`');
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/session.json'));
  assert.equal(en['train.openPlaylistIn'], 'Open {name} in {service}');
});

test('the Playlists page uses the live Attach view and the track list for a signed-in coach', () => {
  const page = read('public/newdesign/trainerPlaylistsPage.jsx');
  assert.match(page, /authed && typeof window\.LiveAttachMatrix === "function"\n\s+\? <window\.LiveAttachMatrix role=\{ctx\.role\} rows=\{serverPlaylists\.map\(p => p\.raw\)\.filter\(Boolean\)\}/);
  assert.match(page, /: <AttachMatrix \/>\)\}/, 'the signed-out preview keeps the demo matrix');
  assert.match(page, /\{p\.raw && typeof window\.SoundtrackTracks === "function" && <window\.SoundtrackTracks key=\{p\.id\} id=\{p\.id\}/);
  const live = read('public/newdesign/playlistAttach.jsx');
  assert.match(live, /fetch\("\/api\/coach\/soundtracks", \{ method: "PATCH", credentials: "same-origin", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ id: row\.id, attached, role \}\) \}\)/);
  assert.match(live, /fetch\("\/api\/coach\/plans", \{ method: "PATCH"/);
  assert.match(live, /expectedRevision: plan\.detail && plan\.detail\.revision != null \? plan\.detail\.revision : null/);
  for (const h of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = read('public/newdesign/' + h);
    for (const s of ['playlistAttach.js', 'playlistAttach.jsx', 'soundtrackTracks.jsx']) assert.ok(html.includes(`src="${s}"`), `${h}: ${s}`);
  }
  for (const [p, role] of [['dashTrain.jsx', 'trainer'], ['dashNutri.jsx', 'nutritionist']]) {
    assert.match(read('public/newdesign/' + p), new RegExp(`source === "live" && typeof window\\.MemberCoachPlaylists === "function" && <window\\.MemberCoachPlaylists role="${role}" />`));
  }
  assert.match(read('public/newdesign/ClientApp.html'), /src="memberCoachPlaylists\.jsx"/);
});

// ── tracks ─────────────────────────────────────────────────────────────────────────────────────
test('the track list, energy tags and a reorder, as Spotify and the store expect them', () => {
  assert.equal(Tracks.spotifyPlaylistId(row.url), '37i9dQZF1DX76Wlfdnj7AP');
  assert.equal(Tracks.spotifyPlaylistId('spotify:playlist:37i9dQZF1DX76Wlfdnj7AP'), '37i9dQZF1DX76Wlfdnj7AP');
  assert.equal(Tracks.spotifyPlaylistId('https://music.apple.com/x'), null);
  const items = [
    { track: { id: '4uLU6hMCjMI75M1A2tKUQC', uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC', name: 'Run', duration_ms: 200000, artists: [{ name: 'A' }, { name: 'B' }] } },
    { track: { id: null, uri: 'spotify:local:x', name: 'Local file', duration_ms: 1000, artists: [] } },
    { track: null },
  ];
  const tracks = Tracks.mapSpotifyItems(items);
  assert.deepEqual(tracks.map((t) => [t.id, t.name, t.artists, t.durationMs]), [['4uLU6hMCjMI75M1A2tKUQC', 'Run', 'A, B', 200000], [null, 'Local file', '', 1000]]);
  const read2 = Tracks.withEnergy(tracks, { '4uLU6hMCjMI75M1A2tKUQC': 'peak', bad: 'peak' });
  assert.deepEqual([read2.tracks[0].energy, read2.tracks[1].energy, read2.tagged], ['peak', null, 1]);
  assert.deepEqual(Tracks.cleanTagPatch({ '4uLU6hMCjMI75M1A2tKUQC': 'build', '5uLU6hMCjMI75M1A2tKUQC': null, short: 'easy', '6uLU6hMCjMI75M1A2tKUQC': 'loud' }), { '4uLU6hMCjMI75M1A2tKUQC': 'build', '5uLU6hMCjMI75M1A2tKUQC': null });
  assert.deepEqual(Tracks.mergeTags({ '4uLU6hMCjMI75M1A2tKUQC': 'easy', '5uLU6hMCjMI75M1A2tKUQC': 'peak' }, { '5uLU6hMCjMI75M1A2tKUQC': null, '7uLU6hMCjMI75M1A2tKUQC': 'build' }), { '4uLU6hMCjMI75M1A2tKUQC': 'easy', '7uLU6hMCjMI75M1A2tKUQC': 'build' });
  assert.deepEqual(Tracks.mergeTags(null, {}), {});
  // Moving down inserts after the target (Spotify counts positions before the move); moving up before it.
  assert.deepEqual(Tracks.reorderBody(0, 2, 5, 'snap'), { range_start: 0, range_length: 1, insert_before: 3, snapshot_id: 'snap' });
  assert.deepEqual(Tracks.reorderBody(3, 1, 5, null), { range_start: 3, range_length: 1, insert_before: 1 });
  for (const args of [[1, 1, 5], [0, 5, 5], [-1, 0, 5], [0, 1, 1], [0.5, 1, 5]]) assert.equal(Tracks.reorderBody(...args), null, JSON.stringify(args));
});

function fakeDb(answer) {
  const calls = [];
  return {
    calls,
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve(answer({ rpc: name, args })); },
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') { const r = answer(q); return (res, rej) => Promise.resolve(r).then(res, rej); }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
}
const tracksRoute = async (db, { token = 'user-token', fetchImpl } = {}) => {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/coach/soundtracks/tracks/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'coach-1' }), clientForRequest: async () => db }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/integrations/tokens', { getFreshAccessToken: async () => token }],
    ]),
  });
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return mod;
};

test('the tracks route: read with the coach\'s connection, tag only after the migration, reorder through Spotify', async () => {
  const realFetch = globalThis.fetch;
  try {
    const seen = [];
    const fetchImpl = async (url, init = {}) => {
      seen.push([String(url), init.method || 'GET', init.body || null]);
      if (String(url).includes('?fields=snapshot_id')) return new Response(JSON.stringify({ snapshot_id: 'snap1', tracks: { total: 1 } }), { status: 200 });
      if (String(url).includes('/tracks?fields=')) return new Response(JSON.stringify({ items: [{ track: { id: '4uLU6hMCjMI75M1A2tKUQC', name: 'Run', duration_ms: 1000, artists: [] } }], next: null }), { status: 200 });
      if ((init.method || 'GET') === 'PUT') return new Response(JSON.stringify({ snapshot_id: 'snap2' }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const withTags = fakeDb((q) => (q.table === 'coach_soundtracks' ? { data: { ...row, track_tags: { '4uLU6hMCjMI75M1A2tKUQC': 'peak' } }, error: null } : { data: null, error: null }));
    let mod = await tracksRoute(withTags, { fetchImpl });
    let res = await mod.GET(new Request('https://x/api/coach/soundtracks/tracks?id=' + SONG));
    let body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.deepEqual([body.tracks[0].energy, body.tagged, body.canReorder, body.snapshotId, body.tagsStored], ['peak', 1, true, 'snap1', true]);
    assert.ok(seen.every(([u]) => u.startsWith('https://api.spotify.com/v1/playlists/37i9dQZF1DX76Wlfdnj7AP')));
    // A tag write merges into the stored tags.
    res = await mod.PATCH(new Request('https://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SONG, tags: { '4uLU6hMCjMI75M1A2tKUQC': 'easy' } }) }));
    assert.deepEqual(await res.json(), { tags: { '4uLU6hMCjMI75M1A2tKUQC': 'easy' }, tagged: 1 });
    const up = withTags.calls.find((c) => c.ops.some((o) => o[0] === 'update'));
    assert.deepEqual(up.ops.find((o) => o[0] === 'update')[1], { track_tags: { '4uLU6hMCjMI75M1A2tKUQC': 'easy' } });
    assert.ok(up.ops.some((o) => o[0] === 'eq' && o[1] === 'owner_id' && o[2] === 'coach-1'));
    // Before the migration: no track_tags on the row, nothing written.
    const old = fakeDb((q) => (q.table === 'coach_soundtracks' ? { data: { ...row }, error: null } : { data: null, error: null }));
    mod = await tracksRoute(old, { fetchImpl });
    res = await mod.PATCH(new Request('https://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SONG, tags: { '4uLU6hMCjMI75M1A2tKUQC': 'easy' } }) }));
    assert.equal(res.status, 503);
    assert.ok(!old.calls.some((c) => c.ops.some((o) => o[0] === 'update')));
    // A reorder goes to Spotify with the coach's token and the move's body.
    mod = await tracksRoute(withTags, { fetchImpl });
    res = await mod.POST(new Request('https://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SONG, from: 0, to: 2, count: 5, snapshotId: 'snap1' }) }));
    assert.deepEqual(await res.json(), { ok: true, snapshotId: 'snap2' });
    const put = seen.find((s) => s[1] === 'PUT');
    assert.deepEqual(JSON.parse(put[2]), { range_start: 0, range_length: 1, insert_before: 3, snapshot_id: 'snap1' });
    // Not the owner on Spotify: said so. Not connected: nothing sent.
    mod = await tracksRoute(withTags, { fetchImpl: async () => new Response('{}', { status: 403 }) });
    res = await mod.POST(new Request('https://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SONG, from: 0, to: 1, count: 2 }) }));
    assert.equal((await res.json()).reason, 'not_owner');
    mod = await tracksRoute(withTags, { token: null, fetchImpl });
    res = await mod.POST(new Request('https://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SONG, from: 0, to: 1, count: 2 }) }));
    assert.equal((await res.json()).reason, 'not_connected');
    // An Apple Music playlist has no list here.
    const apple = fakeDb((q) => (q.table === 'coach_soundtracks' ? { data: { ...row, provider: 'apple', url: 'https://music.apple.com/x' }, error: null } : { data: null, error: null }));
    mod = await tracksRoute(apple, { fetchImpl });
    body = await (await mod.GET(new Request('https://x/api/coach/soundtracks/tracks?id=' + SONG))).json();
    assert.equal(body.reason, 'apple');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.match(read('supabase-migrations/2026-11-05-soundtrack-energy.sql'), /add column if not exists track_tags jsonb not null default '\{\}'::jsonb/);
  assert.match(read('docs/spotify-extended-quota.md'), /PUT \/v1\/playlists\/\{id\}\/tracks/);
});

test('the member website reads the coach-sent playlists on the member\'s own session', async () => {
  const db = fakeDb((q) => (q.rpc === 'get_my_coach_playlists' ? { data: [{ id: 'a', name: 'Cook', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', tracks: 12, duration: '—', bpm: null, tag: 'Sunday prep', coach_name: 'Rae L' }, { id: 'b', name: 'Bad', provider: 'spotify', url: 'javascript:x' }], error: null } : { data: null, error: null }));
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/coach-playlists/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => ({ id: 'm1' }), clientForRequest: async () => db }]]),
  });
  const body = await (await mod.GET(new Request('https://x/api/client/coach-playlists?role=nutritionist'))).json();
  assert.deepEqual(body.playlists.map((p) => [p.name, p.url, p.duration, p.coachName]), [['Cook', 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', null, 'Rae L'], ['Bad', null, null, null]]);
  assert.deepEqual(db.calls.find((c) => c.rpc).args, { p_role: 'nutritionist' });
  assert.equal((await mod.GET(new Request('https://x/api/client/coach-playlists?role=x'))).status, 400);
});
