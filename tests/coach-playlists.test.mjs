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
