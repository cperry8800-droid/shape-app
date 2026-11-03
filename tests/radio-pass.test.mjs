// Shape Radio on Shape's own station, part 3: members only at the station's door, and only where
// the licences reach. A member's pass (src/lib/radio/pass.mjs) signed by Shape, handed out with
// the stream by /api/radio/station (after membership, and only from the US or the UK), checked by
// /api/radio/pass each time the station server lets a listener in; the dashboard's own check
// carries one; both players treat a spent pass as no source and say a region refusal as such.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { passKey, makePass, verifyPass, checkListener, streamWithPass, regionAllowed, PASS_TTL_SEC, RADIO_COUNTRIES } from '../src/lib/radio/pass.mjs';

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

test('⚠ a pass: this member\'s, signed by Shape, good for six hours and no longer', () => {
  const p = makePass({ userId: USER, now: NOW, key: KEY });
  assert.match(p.pass, /^v1\.12345678-1234-4123-8123-123456789abc\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(p.expiresAt, new Date(NOW + PASS_TTL_SEC * 1000).toISOString());
  assert.equal(PASS_TTL_SEC, 6 * 3600);
  assert.deepEqual(verifyPass(p.pass, { now: NOW + 3600000, key: KEY }), { ok: true, userId: USER, expiresAt: p.expiresAt });
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

test('⚠ the door: only the station\'s own mount, with a good pass, on a listener joining', () => {
  const { pass } = makePass({ userId: USER, now: NOW, key: KEY });
  const form = (o) => new URLSearchParams({ action: 'listener_add', server: 'localhost', port: '8000', client: '1', user: '', pass: '', ip: '127.0.0.1', agent: 'x', ...o });
  assert.equal(checkListener(form({ mount: `/live?pass=${encodeURIComponent(pass)}` }), { now: NOW, key: KEY }).ok, true);
  assert.deepEqual(checkListener(form({ mount: '/live' }), { now: NOW, key: KEY }), { ok: false, reason: 'malformed' });
  assert.deepEqual(checkListener(form({ mount: `/standby?pass=${pass}` }), { now: NOW, key: KEY }), { ok: false, reason: 'mount' });
  assert.deepEqual(checkListener(form({ mount: `/live/x?pass=${pass}` }), { now: NOW, key: KEY }), { ok: false, reason: 'mount' });
  assert.deepEqual(checkListener(form({ action: 'mount_add', mount: `/live?pass=${pass}` }), { now: NOW, key: KEY }), { ok: false, reason: 'action' });
  assert.deepEqual(checkListener(new URLSearchParams(), { now: NOW, key: KEY }), { ok: false, reason: 'action' });
  assert.equal(checkListener(form({ mount: `/live?pass=${pass}` }), { now: NOW, key: null }).ok, false, 'no key, no listener');
  // The stream handed out: the station's address with this pass on it (a stale one replaced).
  assert.equal(streamWithPass('https://radio.example.com/live', pass), `https://radio.example.com/live?pass=${encodeURIComponent(pass)}`);
  assert.equal(new URL(streamWithPass('https://radio.example.com/live?pass=old', pass)).searchParams.getAll('pass').length, 1);
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

test('⚠ the station route: membership, then the territory, then the pass; no key means no stream', () => {
  const route = read('src/app/api/radio/station/route.ts');
  const at = (s) => { const i = route.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [
    at('const user = await currentUser(request);'),
    at('const minor = await refuseKnownMinor('),
    at("code: 'membership_required'"),
    at("const region = regionAllowed(request.headers.get('x-vercel-ip-country'), { production: process.env.NODE_ENV === 'production' });"),
    at('{ status: 451'),
    at(".from('radio_station')"),
    at('if (streamUrl && data?.provider === OWN_PROVIDER) {'),
    at('streamUrl = streamWithPass(streamUrl, issued.pass);'),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.match(route, /if \(!region\.ok\) \{\n\s+return NextResponse\.json\(\n\s+\{ error: 'Shape Radio isn’t available in your region yet\.', code: region\.reason \},\n\s+\{ status: 451/, 'refused only outside the territory, and then always');
  assert.match(route, /if \(!issued\) \{[\s\S]*?status: 503/, 'no key: no stream, a 503');
  // A member's pass is theirs: never kept by a cache on the way.
  assert.match(route, /\.\.\.\(passExpiresAt \? \{ passExpiresAt \} : \{\}\),\n\s+\},\n\s+\{ headers: \{ 'cache-control': 'no-store' \} \}/);
  assert.match(route, /const issued = key \? makePass\(\{ userId: user\.id, now: Date\.now\(\), key \}\) : null;/, 'the pass is the caller\'s own');
  assert.match(route, /\.\.\.\(passExpiresAt \? \{ passExpiresAt \} : \{\}\),/);
});

test('⚠ the door\'s route: always a 200, the admitting header only for a good pass, off the address rate limit', () => {
  const route = read('src/app/api/radio/pass/route.ts');
  assert.match(route, /const verdict = checkListener\(form, \{ now: Date\.now\(\), key: passKey\(\) \}\);/);
  assert.match(route, /if \(verdict\.ok\) headers\['icecast-auth-user'\] = '1';\n\s+else headers\['icecast-auth-message'\]/);
  assert.equal((route.match(/icecast-auth-user/g) || []).length, 2, 'set in one place (and named once in the header comment)');
  assert.match(route, /return new NextResponse\(null, \{ status: 200, headers \}\);/);
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

test('the dashboard\'s check carries a minute\'s pass of the admin\'s own', () => {
  const actions = read('src/app/dashboard/radio/actions.ts');
  const fn = actions.slice(actions.indexOf('export async function connectOwnStation'), actions.indexOf('export async function disconnectStation'));
  assert.match(fn, /const admin = await requireAdminUser\(\);/);
  assert.match(fn, /const probePass = key \? makePass\(\{ userId: admin\.id, now: Date\.now\(\), key, ttlSec: 60 \}\) : null;\n\s+if \(!probePass\) failed\('station_no_pass_key'\);/);
  assert.match(fn, /await probeStream\(streamWithPass\(checked\.value\.stream_url, probePass\.pass\)\)/);
});

test('⚠ the players: a spent pass is no source, and a region refusal is said as such', () => {
  const web = read('public/newdesign/radioInstrument.jsx');
  assert.match(web, /if \(r\.status === 451\) \{ setRefusal\("region"\); return false; \}/);
  assert.ok(web.indexOf('if (r.status === 451)') < web.indexOf('if (!r.ok) { setRefusal("unavailable"); return false; }'), 'before the generic refusal');
  assert.match(web, /\{st\.refusal === "region" && \(/);
  assert.match(web, /if \(audio\.src && passExpiresRef\.current != null && passExpiresRef\.current - Date\.now\(\) < 60000\) \{\n\s+audio\.removeAttribute\("src"\);/);
  assert.ok(web.indexOf('passExpiresRef.current - Date.now() < 60000') < web.indexOf('if (!audio.src) {'), 'dropped before the fetch that replaces it');
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
