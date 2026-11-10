// Coach playlists for their clients (owner, 2026-10-11: "they should be seperate
// playlists" · "for nutritionists that send playlists for cooking"). A coach sends
// a saved soundtrack to one client or to all their clients; the member reads the
// trainer's on Train and the nutritionist's on Eat, through one definer function
// that answers only from the caller's own coaches.
//
// What is pinned here:
//   · the migration: the read is a pinned security definer for signed-in callers
//     only, answers nothing without a caller, and matches only rows sent to the
//     caller or to all clients, from a coach the caller actually has;
//   · the API keeps a client entry only with a real uuid and a role only from the
//     two it knows;
//   · the member's section: the preview's sample when signed out, and NEVER the
//     sample when signed in (none sent renders nothing);
//   · the coach's "By client" tab sends to real clients when signed in.
// The function's behaviour was also probed on a local PostgreSQL 16 (members with
// and without a coach, a cancelled subscription, a visitor) — see the PR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadBroadsheet, drive, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SQL = read('supabase-migrations/2026-10-11-coach-playlists-for-clients.sql');
const API = read('src/app/api/coach/soundtracks/route.ts');
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const BACKEND = read('mobile-app/src/services/shapeBackend.js');

test('the read is a pinned security definer that only a signed-in member can call', () => {
  assert.match(SQL, /create or replace function public\.get_my_coach_playlists\(p_role text\)/);
  assert.match(SQL, /security definer\s+set search_path = public, pg_temp/);
  assert.match(SQL, /revoke all on function public\.get_my_coach_playlists\(text\) from public;/);
  assert.match(SQL, /revoke all on function public\.get_my_coach_playlists\(text\) from anon;/, 'a revoke from PUBLIC alone leaves anon able to call it');
  assert.match(SQL, /grant execute on function public\.get_my_coach_playlists\(text\) to authenticated;/);
  assert.doesNotMatch(SQL, /create policy/i, 'the table stays owner-only: no new policy');
});

test('it answers only for the caller, from their own coaches, for rows sent to them', () => {
  assert.match(SQL, /select auth\.uid\(\) as uid/);
  assert.equal((SQL.match(/me\.uid is not null/g) || []).length, 2, 'both coach branches require a caller');
  assert.match(SQL, /s\.client_id = me\.uid and s\.provider_role = 'trainer'[\s\S]{0,80}s\.status in \('active', 'trialing'\)/);
  assert.match(SQL, /s\.client_id = me\.uid and s\.provider_role = 'nutritionist'[\s\S]{0,80}s\.status in \('active', 'trialing'\)/);
  assert.match(SQL, /w\.client_id = me\.uid and w\.trainer_id = t\.id and w\.status = 'published'/);
  assert.match(SQL, /m\.client_id = me\.uid and m\.nutritionist_id = n\.id and m\.status = 'published'/);
  assert.match(SQL, /cs\.attached @> '\[\{"kind": "all_clients"\}\]'::jsonb/);
  assert.match(SQL, /jsonb_build_object\('kind', 'client', 'clientId', me\.uid::text\)/);
  assert.match(SQL, /\(cs\.role is null or cs\.role = p_role\)/, 'a trainer\'s list and a nutritionist\'s are kept apart');
  assert.match(SQL, /cs\.url is not null and cs\.url <> ''/, 'a playlist with no link is not sent');
});

test('the API keeps a client entry only with a real uuid, and a role only from the two it knows', () => {
  assert.match(API, /const roleOf = \(v: unknown\): 'trainer' \| 'nutritionist' \| null => \(v === 'trainer' \|\| v === 'nutritionist' \? v : null\);/);
  assert.match(API, /if \(kind === 'client'\) \{\s*const cid = clean\(r\.clientId, 64\);\s*if \(!UUID_RE\.test\(cid\)\) continue;/);
  assert.match(API, /attached: cleanAttached\(body\.attached\),\s*role: roleOf\(body\.role\),/);
  assert.match(API, /patch\.attached = cleanAttached\(body\.attached\)/);
  assert.doesNotMatch(API, /patch\.attached = body\.attached/, 'nothing reaches the row unclean');
});

test('the member\'s reader calls the function and tells "none sent" from "could not ask"', () => {
  assert.match(BACKEND, /supabase\.rpc\('get_my_coach_playlists', \{ p_role: role \}\)/);
  assert.match(BACKEND, /if \(error\) return null;\s*return Array\.isArray\(data\) \? data : \[\];/);
  assert.match(BACKEND, /fromMyCoaches: listMyCoachPlaylists/);
});

test('Train reads the trainer\'s and Eat the nutritionist\'s — two separate lists', () => {
  assert.match(CLIENT, /<BSCoachPlaylists role="trainer" signedIn=\{bsTrainSignedIn\}/);
  assert.match(CLIENT, /<BSCoachPlaylists role="nutritionist" signedIn=\{bsEatSignedIn\}/);
});

test('the coach sends to real clients when signed in: one client, or all of them', () => {
  assert.match(PROS, /const \{ clients: rosterClients \} = useBSProRoster\(role\);/);
  assert.match(PROS, /row\(\{ id: 'all_clients', kind: 'all_clients'/);
  assert.match(PROS, /row\(\{ id: `client:\$\{c\.userId\}`, kind: 'client', clientId: c\.userId, name: c\.name \}/);
  assert.match(PROS, /ShapeSoundtracks\.update\(\{ id: p\.id, attached: nextArr, role \}\)/);
  assert.match(PROS, /tracks: 0, duration: '—', bpm: '—', role \};/);
});

globalThis.ShapeI18n = { t: () => undefined };
const { BSCoachPlaylists } = await loadBroadsheet(['BSCoachPlaylists'], SHIM);
const CARD = await loadBroadsheet(['BSPlaylistCard'], SHIM);
const DEMO = { who: 'Jordan', items: [{ k: 'Jordan Chen · Your trainer', title: 'Pull heavy.', meta: '52m · 95-138 BPM · 14 tracks' }] };

test('signed out, the section shows the preview\'s sample playlists', () => {
  const d = drive(BSCoachPlaylists, { role: 'trainer', signedIn: false, demo: DEMO });
  const cards = d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSPlaylistCard');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].props.title, 'Pull heavy.');
});

test('signed in, the sample never shows: until the coach has sent one, there is no section', () => {
  const d = drive(BSCoachPlaylists, { role: 'nutritionist', signedIn: true, demo: DEMO });
  const cards = d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSPlaylistCard');
  assert.equal(cards.length, 0, 'a signed-in member read a sample playlist as their coach\'s');
  assert.doesNotMatch(d.text || '', /Pull heavy/);
});

// ── Train: which workout each playlist plays with (owner, 2026-11-10: "remove the music from jordan box and
// have the music assigned to workouts down in the playlist section, just make it more clear which workout
// its assigned to") ─────────────────────────────────────────────────────────────────────────────────────
const TODAY = (new Date().getDay() + 6) % 7;
const at = (off) => (TODAY + off) % 7;
// A week as the page builds it: a coach set "Pull heavy." on two workouts and "Engine room" on one, a
// coach-set rest keeps a playlist it does not play, and the rest of the week has none.
function week() {
  const w = Array.from({ length: 7 }, (_, i) => ({ tag: 'FEATURE', title: `Day ${i}`, headline: `Day ${i}`, moves: [] }));
  w[at(2)] = { tag: 'FEATURE', title: 'Upper Pull — Peak', headline: 'Upper Pull — Peak', playlist: { name: 'Pull heavy.', meta: '14 tracks' } };
  w[at(0)] = { tag: 'FEATURE', title: 'Lower Pull — Vol.', headline: 'Lower Pull — Vol.', playlist: { name: '  pull HEAVY. ', meta: '' } };
  w[at(4)] = { tag: 'COND', title: 'Intervals', headline: 'Intervals', playlist: { name: 'Engine room', meta: '40m · 12 tracks' }, coach: 'Sam Ortiz' };
  w[at(5)] = { tag: 'REST', title: 'Rest\nday.', headline: 'Coach-set rest.', coachAdjust: true, playlist: { name: 'Sunday stretch', meta: '' } };
  return w;
}
const cardsOf = (d) => d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSPlaylistCard');
// These read the words as a member does: each default formatted with its values (the catalogs are not loaded).
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');
const worded = (fn) => () => {
  const was = globalThis.ShapeI18n;
  globalThis.ShapeI18n = { t: (k, o = {}) => (o.defaultValue == null ? undefined : new IntlMessageFormat(o.defaultValue, 'en').format(o)) };
  try { return fn(); } finally { globalThis.ShapeI18n = was; }
};
const DEMO2 = { who: 'Jordan', items: [
  { k: 'Jordan Chen · Your trainer', title: 'Riverside', meta: '24 tracks' },
  { k: 'Jordan Chen · Your trainer', title: 'Pull heavy.', meta: '52m · 95-138 BPM · 14 tracks' },
] };

test('on Train each card says which workouts it plays with, soonest first, and plays this week first', worded(() => {
  const d = drive(BSCoachPlaylists, { role: 'trainer', signedIn: false, demo: DEMO2, program: week(), todayIdx: TODAY });
  const cards = cardsOf(d);
  assert.deepEqual(cards.map((c) => c.props.title), ['Pull heavy.', 'Engine room', 'Riverside'], 'the ones that play this week lead, soonest first');
  // Matched by name as the builder matches a day saved before ids: case and spacing aside.
  assert.match(cards[0].props.forLine, /^For Today · Lower Pull — Vol\. \/ .+ · Upper Pull — Peak$/);
  assert.equal(cards[0].props.meta, '52m · 95-138 BPM · 14 tracks', 'the meta is the playlist\'s own');
  assert.equal(cards[2].props.forLine, null, 'a playlist on no workout claims none');
}));

test('a workout\'s playlist the coach never sent to the list is a card of its own, under that workout', worded(() => {
  const d = drive(BSCoachPlaylists, { role: 'trainer', signedIn: false, demo: DEMO2, program: week(), todayIdx: TODAY });
  const engine = cardsOf(d).find((c) => c.props.title === 'Engine room');
  assert.ok(engine, 'the workout\'s playlist is missing from Playlists');
  assert.match(engine.props.forLine, /· Intervals$/);
  assert.equal(engine.props.meta, '40m · 12 tracks');
  assert.equal(engine.props.kicker, 'Sam Ortiz · Your trainer', 'it names the coach who set it');
  // The plan names it and nothing more (Codex on #2669: an Apple Music playlist read "Open in Spotify"): it is
  // drawn bare, with no service and no link, and a carried card keeps its own.
  assert.equal(engine.props.bare, true);
  assert.equal(engine.props.url, undefined);
  assert.equal(cardsOf(d).find((c) => c.props.title === 'Pull heavy.').props.bare, false);
  assert.ok(!cardsOf(d).some((c) => c.props.title === 'Sunday stretch'), 'a rest day plays nothing, though a coach-set rest keeps its playlist');
}));

test('Tomorrow is tomorrow, and a playlist on three workouts names two and counts the rest', worded(() => {
  const w = week();
  for (const off of [1, 3, 6]) w[at(off)] = { tag: 'FEATURE', title: `W${off}`, headline: `W${off}`, playlist: { name: 'Riverside' } };
  const d = drive(BSCoachPlaylists, { role: 'trainer', signedIn: false, demo: DEMO2, program: w, todayIdx: TODAY });
  const river = cardsOf(d).find((c) => c.props.title === 'Riverside');
  assert.match(river.props.forLine, /^For Tomorrow · W1 \/ \S+ · W3 \+1$/);
}));

test('Eat hands no week, and its cards stay as they were', () => {
  const d = drive(BSCoachPlaylists, { role: 'nutritionist', signedIn: false, demo: DEMO2 });
  assert.deepEqual(cardsOf(d).map((c) => [c.props.title, c.props.forLine]), [['Riverside', null], ['Pull heavy.', null]]);
});

test('Train passes its week to Playlists, and the sample\'s workout is the sample week\'s, not its meta', () => {
  assert.match(CLIENT, /<BSCoachPlaylists role="trainer" signedIn=\{bsTrainSignedIn\} demo=\{\{ who, items \}\} program=\{PROGRAM\} todayIdx=\{bsWeekdayIdx\(\)\} \/>/);
  const train = CLIENT.slice(CLIENT.indexOf('function BSClientTrain('), CLIENT.indexOf('<BSCoachPlaylists role="trainer"'));
  assert.doesNotMatch(train.slice(train.lastIndexOf('const items = lists.length')), /p\.attached/, 'the sample\'s "W6 D4" still rides in its meta');
  assert.doesNotMatch(train, /session:train\.musicFrom/, 'the Music from row is back');
});

test('a workout\'s playlist with no coach named on its day names nobody, never " · Your trainer"', worded(() => {
  const w = week();
  w[at(1)] = { tag: 'FEATURE', title: 'Solo', headline: 'Solo', playlist: { name: 'Solo mix' } };
  const d = drive(BSCoachPlaylists, { role: 'trainer', signedIn: false, demo: DEMO2, program: w, todayIdx: TODAY });
  const solo = cardsOf(d).find((c) => c.props.title === 'Solo mix');
  assert.ok(solo, 'no card for the workout\'s playlist');
  assert.equal(solo.props.kicker, null);
}));

test('a bare card wears no service: no Spotify mark, nothing to open, its name, workouts and meta', worded(() => {
  const { BSPlaylistCard } = CARD;
  const d = drive(BSPlaylistCard, { kicker: 'Sam Ortiz · Your trainer', title: 'Engine room', meta: '12 tracks', forLine: 'For Today · Intervals', bare: true, color: '#1db954' });
  const nodes = d.nodes();
  assert.ok(nodes.some((n) => n.props && n.props['data-playlist-bare'] === ''), 'not drawn bare');
  assert.equal(nodes.filter((n) => n.type === 'button').length, 0, 'a bare card offers something to open');
  assert.ok(!nodes.some((n) => n.props && n.props.role === 'button'), 'a bare card is a button');
  assert.doesNotMatch(d.text, /Spotify|Apple Music/);
  for (const s of ['Engine room', 'For Today · Intervals', '12 tracks', 'Sam Ortiz · Your trainer']) assert.ok(d.text.includes(s), `missing ${s}`);
  assert.ok(!JSON.stringify(nodes.map((n) => n.props && n.props.style)).includes('#1db954'), 'it wears Spotify\'s green');
}));

test('the plan carries the day\'s playlist id when the builder saved one, and the app keeps it', () => {
  const ROUTE = read('src/app/api/client/plan/route.ts');
  assert.match(ROUTE, /playlist: payload\?\.playlist && typeof payload\.playlist === 'object'\s*\? playlistOf\(/);
  assert.match(ROUTE, /return \{ \.\.\.\(id \? \{ id \} : \{\}\), name: String\(o\.name \?\? ''\), meta: String\(o\.meta \?\? ''\) \};/);
  assert.match(CLIENT, /\{ \.\.\.\(w\.playlist\.id != null && String\(w\.playlist\.id\)\.trim\(\) \? \{ id: String\(w\.playlist\.id\)\.trim\(\) \} : \{\}\), name: String\(w\.playlist\.name\)\.trim\(\)/);
  assert.match(CLIENT, /\bid: p\.id,\s*title: p\.name,/, 'the live list\'s cards lose their ids');
});
