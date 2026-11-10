// Shape Radio on Shape's own station, part 3: members only at the station's door, and only where
// the licences reach. A member's start code (the "pass", src/lib/radio/pass.mjs) signed by Shape and
// good for ninety seconds, handed out on Shape's own address for the stream by /api/radio/station
// (after membership, and only from the US or the UK); at every connection /api/radio/listen checks
// it and the listener's own country, records the stream as the member's, and sends the player on to
// the station with a two-minute ticket naming that stream (never the member), which /api/radio/pass
// checks as the station server lets the listener in. The dashboard's own check carries a ticket
// naming nothing; both players treat a spent code as no source and say a region refusal as such.
// (owner, 2026-11-10: "i dont want any pass giving any access to shape radio".)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import {
  passKey, makePass, verifyPass, makeTicket, verifyTicket, listenUrl, listenRedirect, checkListener, leavingListener, streamWithTicket, regionAllowed,
  PASS_TTL_SEC, TICKET_TTL_SEC, RADIO_COUNTRIES,
} from '../src/lib/radio/pass.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const KEY = Buffer.from('k'.repeat(40));
const OTHER = Buffer.from('o'.repeat(40));
const USER = '12345678-1234-4123-8123-123456789abc';
const NOW = Date.parse('2026-11-03T22:00:00.000Z');

test('⚠ the key: Shape\'s own secret if set, else one derived from the service key (never the key itself), else none', () => {
  const own = 'r'.repeat(40), service = 's'.repeat(60);
  assert.deepEqual(passKey({ RADIO_PASS_SECRET: own, SUPABASE_SERVICE_ROLE_KEY: service }), Buffer.from(own));
  const derived = passKey({ RADIO_PASS_SECRET: 'short', SUPABASE_SERVICE_ROLE_KEY: service });
  assert.deepEqual(derived, createHmac('sha256', service).update('shape-radio-pass-v1').digest());
  assert.notDeepEqual(derived, Buffer.from(service));
  assert.equal(passKey({}), null);
  assert.equal(passKey({ SUPABASE_SERVICE_ROLE_KEY: 'short' }), null);
});

test('⚠ a start code: this member\'s, signed by Shape, good for ninety seconds and no longer (owner, 2026-11-10)', () => {
  const p = makePass({ userId: USER, now: NOW, key: KEY });
  assert.match(p.pass, /^v1\.12345678-1234-4123-8123-123456789abc\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(p.expiresAt, new Date(NOW + PASS_TTL_SEC * 1000).toISOString());
  assert.equal(PASS_TTL_SEC, 90, 'it starts a stream; it is not a way in for six hours');
  assert.deepEqual(verifyPass(p.pass, { now: NOW + 60000, key: KEY }), { ok: true, userId: USER, expiresAt: p.expiresAt });
  assert.deepEqual(verifyPass(p.pass, { now: NOW + 3600000, key: KEY }), { ok: false, reason: 'expired' }, 'an hour later, a shared address plays nothing');
  assert.deepEqual(verifyPass(makePass({ userId: USER, now: NOW, key: KEY, ttlSec: 3600 }).pass, { now: NOW, key: KEY }), { ok: false, reason: 'too_long' }, 'an hour is longer than any Shape issues');
  assert.deepEqual(verifyPass(p.pass, { now: NOW + PASS_TTL_SEC * 1000, key: KEY }), { ok: false, reason: 'expired' });
  assert.deepEqual(verifyPass(p.pass, { now: NOW, key: OTHER }), { ok: false, reason: 'signature' }, 'another key\'s pass');
  const forged = p.pass.replace(/\.(\d+)\./, (m, exp) => `.${Number(exp) + 3600}.`);
  assert.deepEqual(verifyPass(forged, { now: NOW, key: KEY }), { ok: false, reason: 'signature' }, 'a stretched expiry');
  const other = p.pass.replace(USER, '87654321-4321-4321-8321-cba987654321');
  assert.deepEqual(verifyPass(other, { now: NOW, key: KEY }), { ok: false, reason: 'signature' }, 'another member\'s name on it');
  const long = makePass({ userId: USER, now: NOW, key: KEY, ttlSec: 24 * 3600 });
  assert.deepEqual(verifyPass(long.pass, { now: NOW, key: KEY }), { ok: false, reason: 'too_long' }, 'longer than any Shape issues');
  for (const bad of ['', null, 'v1.x.1.y', `v2.${USER}.1900000000.${'a'.repeat(43)}`, `${p.pass}x`]) {
    assert.deepEqual(verifyPass(bad, { now: NOW, key: KEY }), { ok: false, reason: 'malformed' }, String(bad));
  }
  assert.deepEqual(verifyPass(p.pass, { now: NOW, key: null }), { ok: false, reason: 'no_key' });
  assert.equal(makePass({ userId: 'not-a-member', now: NOW, key: KEY }), null);
  assert.equal(makePass({ userId: USER, now: NOW, key: null }), null);
});

const STREAM = 'abcdef01-2345-4678-9abc-def012345678';

test('⚠ a ticket: two minutes, signed by Shape, naming a stream and never a member; never a pass, and a pass never a ticket (Codex, #2579)', () => {
  // The station's ticket names the stream Shape opened for the member (t2), never the member.
  const s2 = makeTicket({ now: NOW, key: KEY, streamId: STREAM });
  assert.match(s2.ticket, /^t2\.abcdef0123454678\w{16}\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.ok(!s2.ticket.includes(USER), 'no member on it');
  assert.deepEqual(verifyTicket(s2.ticket, { now: NOW + 60000, key: KEY }), { ok: true, expiresAt: s2.expiresAt, streamId: STREAM });
  assert.equal(makeTicket({ now: NOW, key: KEY, streamId: 'not-a-stream' }), null);
  const relabelled = s2.ticket.replace(/^t2\.[0-9a-f]{32}/, 't2.' + 'f'.repeat(32));
  assert.deepEqual(verifyTicket(relabelled, { now: NOW, key: KEY }), { ok: false, reason: 'signature' }, 'another stream\'s name on it');
  // The dashboard's probe: a ticket naming nothing (t1).
  const t = makeTicket({ now: NOW, key: KEY });
  assert.match(t.ticket, /^t1\.[0-9a-f]{16}\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.ok(!t.ticket.includes(USER), 'no member on it');
  assert.equal(TICKET_TTL_SEC, 120);
  assert.equal(t.expiresAt, new Date(NOW + 120000).toISOString());
  assert.notEqual(makeTicket({ now: NOW, key: KEY }).ticket, t.ticket, 'each its own');
  assert.deepEqual(verifyTicket(t.ticket, { now: NOW + 60000, key: KEY }), { ok: true, expiresAt: t.expiresAt, streamId: null });
  assert.deepEqual(verifyTicket(t.ticket, { now: NOW + 120000, key: KEY }), { ok: false, reason: 'expired' });
  assert.deepEqual(verifyTicket(t.ticket, { now: NOW, key: OTHER }), { ok: false, reason: 'signature' });
  const stretched = t.ticket.replace(/\.(\d+)\./, (m, exp) => `.${Number(exp) + 3600}.`);
  assert.deepEqual(verifyTicket(stretched, { now: NOW, key: KEY }), { ok: false, reason: 'signature' });
  assert.deepEqual(verifyTicket(makeTicket({ now: NOW, key: KEY, ttlSec: 3600 }).ticket, { now: NOW, key: KEY }), { ok: false, reason: 'too_long' });
  assert.deepEqual(verifyTicket(t.ticket, { now: NOW, key: null }), { ok: false, reason: 'no_key' });
  assert.equal(makeTicket({ now: NOW, key: null }), null);
  // The two never stand in for each other.
  const { pass } = makePass({ userId: USER, now: NOW, key: KEY });
  assert.deepEqual(verifyTicket(pass, { now: NOW, key: KEY }), { ok: false, reason: 'malformed' });
  assert.deepEqual(verifyPass(t.ticket, { now: NOW, key: KEY }), { ok: false, reason: 'malformed' });
  const asTicket = pass.replace(/^v1\.[^.]+/, 't1.0123456789abcdef');
  assert.deepEqual(verifyTicket(asTicket, { now: NOW, key: KEY }), { ok: false, reason: 'signature' }, 'a pass\'s signature on a ticket\'s body');
});

test('⚠ the door: only the station\'s own mount, with a good ticket, on a listener joining', () => {
  const { ticket } = makeTicket({ now: NOW, key: KEY });
  const { pass } = makePass({ userId: USER, now: NOW, key: KEY });
  const form = (o) => new URLSearchParams({ action: 'listener_add', server: 'localhost', port: '8000', client: '1', user: '', pass: '', ip: '127.0.0.1', agent: 'x', ...o });
  assert.equal(checkListener(form({ mount: `/live?ticket=${encodeURIComponent(ticket)}` }), { now: NOW, key: KEY }).ok, true);
  // A member's ticket names their stream, which the door reads the account of.
  const own = makeTicket({ now: NOW, key: KEY, streamId: STREAM }).ticket;
  assert.equal(checkListener(form({ mount: `/live?ticket=${encodeURIComponent(own)}`, client: '9' }), { now: NOW, key: KEY }).streamId, STREAM);
  assert.equal(checkListener(form({ mount: `/live?ticket=${encodeURIComponent(ticket)}` }), { now: NOW, key: KEY }).streamId, null, 'the probe names none');
  assert.deepEqual(checkListener(form({ mount: '/live' }), { now: NOW, key: KEY }), { ok: false, reason: 'malformed' });
  assert.deepEqual(checkListener(form({ mount: `/live?pass=${encodeURIComponent(pass)}` }), { now: NOW, key: KEY }), { ok: false, reason: 'malformed' }, '⚠ a member\'s pass does not open the station: only Shape\'s listen address does');
  assert.deepEqual(checkListener(form({ mount: `/standby?ticket=${ticket}` }), { now: NOW, key: KEY }), { ok: false, reason: 'mount' });
  assert.deepEqual(checkListener(form({ mount: `/live/x?ticket=${ticket}` }), { now: NOW, key: KEY }), { ok: false, reason: 'mount' });
  assert.deepEqual(checkListener(form({ action: 'mount_add', mount: `/live?ticket=${ticket}` }), { now: NOW, key: KEY }), { ok: false, reason: 'action' });
  assert.deepEqual(checkListener(new URLSearchParams(), { now: NOW, key: KEY }), { ok: false, reason: 'action' });
  assert.equal(checkListener(form({ mount: `/live?ticket=${ticket}` }), { now: NOW, key: null }).ok, false, 'no key, no listener');
  // Icecast's number for the connection comes back with it (part 4 keeps each session by it).
  assert.equal(checkListener(form({ mount: `/live?ticket=${ticket}`, client: '42' }), { now: NOW, key: KEY }).client, 42);
  assert.deepEqual(checkListener(form({ mount: `/live?ticket=${ticket}`, client: 'x' }), { now: NOW, key: KEY }), { ok: false, reason: 'numbers' });
  // Leaving: the same ticket, whatever its age now (it was checked at the door), with the length.
  const leave = (o) => new URLSearchParams({ action: 'listener_remove', server: 'localhost', port: '8000', client: '42', duration: '7200', mount: `/live?ticket=${encodeURIComponent(ticket)}`, ...o });
  assert.deepEqual(leavingListener(leave({}), { key: KEY }), { ok: true, client: 42, durationSec: 7200 });
  const spent = makeTicket({ now: NOW - 7 * 3600000, key: KEY }).ticket;
  assert.equal(leavingListener(leave({ mount: `/live?ticket=${spent}` }), { key: KEY }).ok, true, 'a ticket run out since still left');
  assert.deepEqual(leavingListener(leave({ mount: `/live?ticket=${ticket.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))}` }), { key: KEY }), { ok: false, reason: 'signature' });
  assert.deepEqual(leavingListener(leave({ mount: `/live?pass=${encodeURIComponent(pass)}` }), { key: KEY }), { ok: false, reason: 'malformed' }, 'a member\'s pass is no ticket');
  // Icecast's documentation names only the mount on a leave (2.4.4 sends the ticket too, measured):
  // a bare /live is the station's own word, signed in; anything else on the address is a ticket.
  assert.deepEqual(leavingListener(leave({ mount: '/live' }), { key: KEY }), { ok: true, client: 42, durationSec: 7200 }, 'a bare /live leaves');
  assert.deepEqual(leavingListener(leave({ mount: '/live?from=elsewhere' }), { key: KEY }), { ok: false, reason: 'malformed' }, 'an address with no ticket on it');
  assert.deepEqual(leavingListener(leave({ mount: `/standby?ticket=${ticket}` }), { key: KEY }), { ok: false, reason: 'mount' });
  assert.deepEqual(leavingListener(leave({ action: 'listener_add' }), { key: KEY }), { ok: false, reason: 'action' });
  assert.deepEqual(leavingListener(leave({ duration: '-1' }), { key: KEY }), { ok: false, reason: 'numbers' });
  assert.deepEqual(leavingListener(leave({ client: '' }), { key: KEY }), { ok: false, reason: 'numbers' });
  assert.deepEqual(leavingListener(leave({}), { key: null }), { ok: false, reason: 'no_key' });
  // The station's address with a ticket on it (a stale one replaced, a pass never carried on).
  assert.equal(streamWithTicket('https://radio.example.com/live', ticket), `https://radio.example.com/live?ticket=${encodeURIComponent(ticket)}`);
  const u = new URL(streamWithTicket('https://radio.example.com/live?ticket=old&pass=p', ticket));
  assert.deepEqual([u.searchParams.getAll('ticket').length, u.searchParams.has('pass')], [1, false]);
  // Shape's own address for the stream, with the member's pass.
  assert.equal(listenUrl('https://www.theshapecommunity.com', pass), `https://www.theshapecommunity.com/api/radio/listen?pass=${encodeURIComponent(pass)}`);
});

test('⚠ every connection: the code, then this listener\'s own country, then the station, then the member\'s stream, then a ticket for it (Codex, #2579)', async () => {
  const { pass } = makePass({ userId: USER, now: NOW, key: KEY });
  const own = { provider: 'shape', stream_url: 'https://radio.example.com/live' };
  let reads = 0;
  const opened = [];
  const readStation = async () => { reads += 1; return own; };
  const openStream = async (userId) => { opened.push(userId); return STREAM; };
  const go = (o) => listenRedirect({ pass, country: 'US', production: true, readStation, openStream, now: NOW, key: KEY, ...o });
  const ok = await go({});
  assert.equal(ok.status, 302);
  const to = new URL(ok.location);
  assert.equal(`${to.origin}${to.pathname}`, 'https://radio.example.com/live');
  assert.equal(to.searchParams.has('pass'), false, 'the member\'s code never reaches the station');
  assert.deepEqual(verifyTicket(to.searchParams.get('ticket'), { now: NOW, key: KEY }), { ok: true, expiresAt: new Date(NOW + 120000).toISOString(), streamId: STREAM }, 'the ticket names the stream opened for the member');
  assert.deepEqual(opened, [USER], 'the stream is recorded as the code\'s member\'s');
  // ⚠ No stream without its account on record: a failed write plays nothing.
  assert.deepEqual(await go({ openStream: async () => null }), { status: 503, reason: 'stream' });
  assert.deepEqual(await go({ openStream: async () => { throw new Error('down'); } }), { status: 503, reason: 'stream' });
  assert.equal((await go({ country: 'GB' })).status, 302);
  // A shared address, opened abroad: refused, before the station is even read.
  reads = 0;
  opened.length = 0;
  assert.deepEqual(await go({ country: 'FR' }), { status: 451, reason: 'region_blocked' });
  assert.deepEqual(await go({ country: null }), { status: 451, reason: 'region_unknown' });
  assert.deepEqual(await go({ pass: 'nope' }), { status: 401, reason: 'malformed' });
  assert.deepEqual(await go({ pass: makePass({ userId: USER, now: NOW - 7 * 3600000, key: KEY }).pass }), { status: 401, reason: 'expired' });
  assert.deepEqual(await go({ pass: makePass({ userId: USER, now: NOW - 91000, key: KEY }).pass }), { status: 401, reason: 'expired' }, 'a minute and a half on, the code starts nothing');
  assert.equal(reads, 0, 'no station read for a refusal');
  assert.deepEqual(opened, [], 'and no stream opened');
  assert.deepEqual(await go({ key: null }), { status: 503, reason: 'no_key' });
  // Not Shape's own station, or none: no address handed out.
  assert.deepEqual(await go({ readStation: async () => ({ provider: 'http', stream_url: 'https://s5.radio.co/x/listen' }) }), { status: 503, reason: 'station' });
  assert.deepEqual(await go({ readStation: async () => null }), { status: 503, reason: 'station' });
  assert.deepEqual(await go({ readStation: async () => { throw new Error('down'); } }), { status: 503, reason: 'station' });
});

test('⚠ the listen route: one cross-origin header, `*`, on every answer, from itself alone; never cached', () => {
  const route = read('src/app/api/radio/listen/route.ts');
  assert.match(route, /const HEADERS = \{ 'access-control-allow-origin': '\*', 'cache-control': 'no-store' \};/);
  assert.match(route, /return new NextResponse\(null, \{ status: 302, headers: \{ \.\.\.HEADERS, location: r\.location \} \}\);/);
  assert.match(route, /\{ status: r\.status, headers: HEADERS \}/);
  assert.match(route, /country: request\.headers\.get\('x-vercel-ip-country'\),\n\s+production: process\.env\.NODE_ENV === 'production',/);
  assert.match(route, /\.from\('radio_station'\)\.select\('provider, stream_url'\)\.eq\('id', 1\)/);
  const cors = read('src/lib/native-cors.ts');
  assert.match(cors, /const SELF_CORS_PREFIXES = \['\/api\/apply', '\/api\/radio\/listen'\];/, 'the proxy adds no second header');
});

test('⚠ the territory: the US and the UK; elsewhere refused, and in production no country is refused too', () => {
  assert.deepEqual(RADIO_COUNTRIES, ['US', 'GB']);
  assert.deepEqual(regionAllowed('US', { production: true }), { ok: true, country: 'US' });
  assert.deepEqual(regionAllowed(' gb ', { production: true }), { ok: true, country: 'GB' });
  assert.deepEqual(regionAllowed('FR', { production: true }), { ok: false, reason: 'region_blocked', country: 'FR' });
  assert.deepEqual(regionAllowed('CA', { production: false }), { ok: false, reason: 'region_blocked', country: 'CA' }, 'a measured country is refused even off production');
  assert.deepEqual(regionAllowed(null, { production: true }), { ok: false, reason: 'region_unknown' });
  assert.deepEqual(regionAllowed('', { production: false }), { ok: true, country: null }, 'a local build has no measured country');
});

test('⚠ the station route: membership (active only; past due told so), then the territory, then the code; no key means no stream', () => {
  const route = read('src/app/api/radio/station/route.ts');
  const at = (s) => { const i = route.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [
    at('const user = await currentUser(request);'),
    at('const minor = await refuseKnownMinor('),
    at('if (!isMember) return NextResponse.json(paidRefusal({ pastDue }), { status: 402 });'),
    at("const region = regionAllowed(request.headers.get('x-vercel-ip-country'), { production: process.env.NODE_ENV === 'production' });"),
    at('{ status: 451'),
    at(".from('radio_station')"),
    at('const own = data?.provider === OWN_PROVIDER && !!data?.stream_url;'),
    at('if (own && !peek) {'),
    at('streamUrl = listenUrl(new URL(request.url).origin, issued.pass);'),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.match(route, /if \(!region\.ok\) \{\n\s+return NextResponse\.json\(\n\s+\{ error: 'Shape Radio isn’t available in your region yet\.', code: region\.reason \},\n\s+\{ status: 451/, 'refused only outside the territory, and then always');
  assert.match(route, /if \(!issued\) \{[\s\S]*?status: 503/, 'no key: no stream, a 503');
  // A member's pass is theirs: never kept by a cache on the way.
  assert.match(route, /\.\.\.\(passExpiresAt \? \{ passExpiresAt \} : \{\}\),\n\s+\},\n\s+\{ headers: \{ 'cache-control': 'no-store' \} \}/);
  assert.match(route, /const issued = key \? makePass\(\{ userId: user\.id, now: Date\.now\(\), key \}\) : null;/, 'the pass is the caller\'s own');
  assert.match(route, /\.\.\.\(passExpiresAt \? \{ passExpiresAt \} : \{\}\),/);
  // ⚠ Shape's own station is the only one (radio.co taken out, 2026-11-04): no other row's address is handed out.
  assert.match(route, /let streamUrl: string \| null = null;/, 'no stream unless Shape\'s own');
  assert.match(route, /provider: own \? OWN_PROVIDER : 'mock',\n\s+configured: own,/);
  assert.ok(!/data\?\.stream_url \|\| null|configured: !!data/.test(route), 'a stored address alone is no station');
  // ⚠ A peek (a schedule's "on air") makes no code: a code starts a stream.
  assert.match(route, /const peek = new URL\(request\.url\)\.searchParams\.get\('peek'\) === '1';/);
  assert.ok(route.indexOf('const peek =') > route.indexOf('paidRefusal({ pastDue })'), 'only after every check');
});

test('⚠ the door\'s route: always a 200, the admitting header only for a good ticket whose stream\'s account is on record, off the address rate limit', () => {
  const route = read('src/app/api/radio/pass/route.ts');
  assert.match(route, /const verdict = checkListener\(form, \{ now, key: passKey\(\) \}\);\n\s+if \(verdict\.ok\) \{/);
  assert.match(route, /let admitted = streamId === null;/, 'only the probe\'s ticket, naming no stream, is let in without an account');
  assert.match(route, /const r = await admitConnection\(createAdminClient\(\), \{ streamId, \.\.\.boot, client, now \}\);\n\s+admitted = r\.ok;/);
  assert.match(route, /if \(admitted\) \{\n\s+headers\['icecast-auth-user'\] = '1';/);
  assert.match(route, /\} else \{\n\s+headers\['icecast-auth-message'\] = String\(\(verdict as \{ reason\?: string \}\)\.reason \?\? 'refused'\);/);
  assert.equal((route.match(/icecast-auth-user/g) || []).length, 2, 'set in one place (and named once in the header comment)');
  assert.match(route, /const answer = \(\) => new NextResponse\(null, \{ status: 200, headers \}\);/);
  assert.match(route, /\(await request\.text\(\)\)\.slice\(0, 4096\)/);
  assert.ok(!/export async function GET/.test(route), 'Icecast posts');
  const mw = read('src/lib/supabase/middleware.ts');
  const skip = mw.slice(mw.indexOf('const RATE_LIMIT_SKIP = ['), mw.indexOf('];', mw.indexOf('const RATE_LIMIT_SKIP = [')));
  assert.match(skip, /'\/api\/radio\/pass',/);
});

test('the dashboard\'s check: a station refusing the pass is said as that, not as a station that is down', async () => {
  const { probeStream } = await import('../src/lib/radio/station.mjs');
  const answer = (status) => async () => ({ ok: status < 300, status, headers: new Headers({ 'content-type': 'text/html' }), body: null });
  assert.deepEqual(await probeStream('https://radio.example.com/live?pass=x', { fetchFn: answer(401) }), { ok: false, error: 'station_refused_pass' });
  assert.deepEqual(await probeStream('https://radio.example.com/live?pass=x', { fetchFn: answer(403) }), { ok: false, error: 'station_refused_pass' });
  assert.deepEqual(await probeStream('https://radio.example.com/live?pass=x', { fetchFn: answer(502) }), { ok: false, error: 'station_unreachable' });
  const sets = read('src/app/dashboard/radio/NoraSets.tsx');
  for (const code of ['station_refused_pass', 'station_no_pass_key']) assert.match(sets, new RegExp(`  ${code}: '`), `${code} in words`);
});

test('the dashboard\'s check carries a minute\'s ticket of its own', () => {
  const actions = read('src/app/dashboard/radio/actions.ts');
  const fn = actions.slice(actions.indexOf('export async function connectOwnStation'), actions.indexOf('export async function disconnectStation'));
  assert.match(fn, /await requireAdminUser\(\);/);
  assert.match(fn, /const probeTicket = key \? makeTicket\(\{ now: Date\.now\(\), key, ttlSec: 60 \}\) : null;\n\s+if \(!probeTicket\) failed\('station_no_pass_key'\);/);
  assert.match(fn, /await probeStream\(streamWithTicket\(checked\.value\.stream_url, probeTicket\.ticket\)\)/);
});

test('⚠ the players: a spent pass is no source, and a region refusal is said as such', () => {
  const web = read('public/newdesign/radioInstrument.jsx');
  assert.match(web, /if \(r\.status === 451\) \{ setRefusal\("region"\); return false; \}/);
  assert.ok(web.indexOf('if (r.status === 451)') < web.indexOf('if (!r.ok) { setRefusal("unavailable"); return false; }'), 'before the generic refusal');
  assert.match(web, /\{st\.refusal === "region" && \(/);
  assert.match(web, /if \(audio\.src && passExpiresRef\.current != null && passExpiresRef\.current - Date\.now\(\) < 20000\) \{\n\s+audio\.removeAttribute\("src"\);/);
  assert.ok(web.indexOf('passExpiresRef.current - Date.now() < 20000') < web.indexOf('if (!audio.src) {'), 'dropped before the fetch that replaces it');
  assert.match(web, /passExpiresRef\.current = Number\.isFinite\(passEnds\) \? passEnds : null;/);
  const app = read('mobile-app/src/services/shapeBackend.js');
  assert.match(app, /if \(r\.status === 451\) return \{ configured: false, refusal: 'region' \};/);
  assert.match(app, /if \(stationCache && !passFresh\(stationCache\)\) stationCache = null;/);
  const radio = read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx');
  assert.match(radio, /if \(ok !== true && window\.ShapeRadioLive\?\.lastRefusal === 'region' && !regionToldRef\.current\) \{\n\s+regionToldRef\.current = true;/);
  for (const l of ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'ru', 'uk', 'tr', 'vi', 'id', 'ha', 'pcm']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${l}/radio.json`));
    assert.ok(String(cat['region.unavailable'] || '').trim(), `${l} says it`);
  }
});
