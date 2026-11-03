// Mutation spec for Shape Radio on Shape's own station, part 3: members only at the station's door
// (a member's pass signed by Shape, checked with the listener's own country at every connection on
// Shape's own address; a two-minute ticket naming no one, checked by the station as each listener
// connects), and only where the licences reach (the US and the UK). The pass itself, the door's
// route, the station route's order, the dashboard's check, the station server's config, and both
// players. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/radio-pass-2026-11-03.mutations.mjs --fail-on-skipped
const PASS = 'src/lib/radio/pass.mjs';
const DOOR = 'src/app/api/radio/pass/route.ts';
const ROUTE = 'src/app/api/radio/station/route.ts';
const MW = 'src/lib/supabase/middleware.ts';
const ACT = 'src/app/dashboard/radio/actions.ts';
const ST = 'src/lib/radio/station.mjs';
const XML = 'services/station/icecast/icecast.xml.template';
const ENTRY = 'services/station/icecast/entrypoint.sh';
const WEB = 'public/newdesign/radioInstrument.jsx';
const APP = 'mobile-app/src/services/shapeBackend.js';
const RADIO = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';

export default {
  test: 'node --test tests/radio-pass.test.mjs tests/radio-station-config.test.mjs tests/radio-rest-state.test.mjs tests/radio-own-station.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the pass ──
    { name: '⚠ a short secret of Shape\'s own signs passes', file: PASS,
      find: '  if (own.length >= 32) return Buffer.from(own, \'utf8\');', replace: '  if (own.length >= 1) return Buffer.from(own, \'utf8\');' },
    { name: '⚠ the service-role key itself signs passes', file: PASS,
      find: "  if (service.length >= 32) return createHmac('sha256', service).update('shape-radio-pass-v1').digest();", replace: "  if (service.length >= 32) return Buffer.from(service, 'utf8');" },
    { name: 'a pass is made for something that is not a member', file: PASS,
      find: "  if (!key || !UUID.test(String(userId || ''))) return null;", replace: '  if (!key) return null;' },
    { name: '⚠ a pass\'s signature is not checked', file: PASS,
      find: "  const want = Buffer.from(sign(key, `v1.${userId}.${exp}`));\n  const got = Buffer.from(sig);\n  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: 'signature' };",
      replace: "  const want = Buffer.from(sign(key, `v1.${userId}.${exp}`));\n  const got = Buffer.from(sig);" },
    { name: '⚠ an expired pass is taken', file: PASS,
      find: "  if (expMs <= now) return { ok: false, reason: 'expired' };\n  // Longer than any pass", replace: '  // Longer than any pass' },
    { name: 'a pass is taken at the second it expires', file: PASS,
      find: "  if (expMs <= now) return { ok: false, reason: 'expired' };\n  // Longer than any pass", replace: "  if (expMs < now) return { ok: false, reason: 'expired' };\n  // Longer than any pass" },
    { name: 'a pass longer than any Shape issues is taken', file: PASS,
      find: "  if (expMs > now + (PASS_TTL_SEC + 60) * 1000) return { ok: false, reason: 'too_long' };\n", replace: '' },
    { name: 'the passes last a day', file: PASS,
      find: 'export const PASS_TTL_SEC = 6 * 3600;', replace: 'export const PASS_TTL_SEC = 24 * 3600;' },
    { name: '⚠ the door answers anything that is not a listener joining', file: PASS,
      find: "  if (form.get('action') !== 'listener_add') return { ok: false, reason: 'action' };\n", replace: '' },
    { name: '⚠ a pass opens any mount', file: PASS,
      find: "  if (u.pathname !== STATION_MOUNT) return { ok: false, reason: 'mount' };\n", replace: '' },
    { name: 'a stale ticket on the address stays beside the new one', file: PASS,
      find: '  u.searchParams.set(TICKET_PARAM, ticket);', replace: '  u.searchParams.append(TICKET_PARAM, ticket);' },
    { name: '⚠ a member\'s pass rides on to the station (and into its log)', file: PASS,
      find: '  u.searchParams.delete(PASS_PARAM);\n', replace: '' },
    // ── the ticket ──
    { name: '⚠ a ticket\'s signature is not checked', file: PASS,
      find: "  const want = Buffer.from(sign(key, `t1.${nonce}.${exp}`));\n  const got = Buffer.from(sig);\n  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: 'signature' };",
      replace: "  const want = Buffer.from(sign(key, `t1.${nonce}.${exp}`));\n  const got = Buffer.from(sig);" },
    { name: '⚠ an expired ticket is taken', file: PASS,
      find: "  if (expMs <= now) return { ok: false, reason: 'expired' };\n  if (expMs > now + (TICKET_TTL_SEC", replace: '  if (expMs > now + (TICKET_TTL_SEC' },
    { name: 'a ticket longer than any Shape issues is taken', file: PASS,
      find: "  if (expMs > now + (TICKET_TTL_SEC + 60) * 1000) return { ok: false, reason: 'too_long' };\n  return { ok: true, expiresAt: new Date(expMs).toISOString() };",
      replace: "  return { ok: true, expiresAt: new Date(expMs).toISOString() };" },
    { name: 'tickets last an hour', file: PASS,
      find: 'export const TICKET_TTL_SEC = 120;', replace: 'export const TICKET_TTL_SEC = 3600;' },
    { name: '⚠ a pass\'s signature opens the station as a ticket', file: PASS,
      find: "  const want = Buffer.from(sign(key, `t1.${nonce}.${exp}`));", replace: "  const want = Buffer.from(sign(key, `v1.${nonce}.${exp}`));" },
    // ── every connection ──
    { name: '⚠ a shared address plays abroad (no territory at the connection)', file: PASS,
      find: '  if (!region.ok) return { status: 451, reason: region.reason };\n  let station', replace: '  let station' },
    { name: '⚠ a connection with no good pass is sent on', file: PASS,
      find: "  if (!p.ok) return { status: p.reason === 'no_key' ? 503 : 401, reason: p.reason };", replace: '' },
    { name: 'the station is read for a refusal', file: PASS,
      find: "export async function listenRedirect({ pass, country, production, readStation, now, key }) {\n  const p = verifyPass(pass, { now, key });",
      replace: "export async function listenRedirect({ pass, country, production, readStation, now, key }) {\n  await readStation();\n  const p = verifyPass(pass, { now, key });" },
    { name: '⚠ another station is handed out (radio.co\'s, with a ticket on it)', file: PASS,
      find: '  if (!station || station.provider !== OWN_PROVIDER || !station.stream_url) return', replace: '  if (!station || !station.stream_url) return' },
    { name: '⚠ the station checks a member\'s pass, not a ticket', file: PASS,
      find: '  return verifyTicket(u.searchParams.get(TICKET_PARAM), { now, key });', replace: '  return verifyPass(u.searchParams.get(PASS_PARAM), { now, key });' },
    { name: '⚠ the listen route allows no cross-origin load', file: 'src/app/api/radio/listen/route.ts',
      find: "const HEADERS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };", replace: "const HEADERS = { 'cache-control': 'no-store' };" },
    { name: 'the proxy names a second origin on the listen route', file: 'src/lib/native-cors.ts',
      find: "const SELF_CORS_PREFIXES = ['/api/apply', '/api/radio/listen'];", replace: "const SELF_CORS_PREFIXES = ['/api/apply'];" },
    { name: '⚠ the listen route takes no measured country', file: 'src/app/api/radio/listen/route.ts',
      find: "    country: request.headers.get('x-vercel-ip-country'),", replace: "    country: 'US'," },
    // ── the territory ──
    { name: '⚠ another country is licensed', file: PASS,
      find: "export const RADIO_COUNTRIES = Object.freeze(['US', 'GB']);", replace: "export const RADIO_COUNTRIES = Object.freeze(['US', 'GB', 'CA']);" },
    { name: '⚠ in production, a request with no country is let through', file: PASS,
      find: "  if (!c) return production ? { ok: false, reason: 'region_unknown' } : { ok: true, country: null };", replace: '  if (!c) return { ok: true, country: null };' },
    { name: 'a country in other case is refused', file: PASS,
      find: "  const c = String(country || '').trim().toUpperCase();", replace: "  const c = String(country || '').trim();" },
    // ── the door's route ──
    { name: '⚠ the door admits every listener', file: DOOR,
      find: "  if (verdict.ok) headers['icecast-auth-user'] = '1';\n  else headers", replace: "  headers['icecast-auth-user'] = '1';\n  if (!verdict.ok) headers" },
    { name: 'the door reads a body of any size', file: DOOR,
      find: '(await request.text()).slice(0, 4096)', replace: '(await request.text())' },
    { name: 'the door is on the per-address rate limit (a busy minute locks members out)', file: MW,
      find: "  '/api/radio/pass',\n", replace: '' },
    // ── the station route ──
    { name: '⚠ no territory check', file: ROUTE,
      find: '  if (!region.ok) {\n    return NextResponse.json(', replace: '  if (false) {\n    return NextResponse.json(' },
    { name: '⚠ off production rules in production (no country let through)', file: ROUTE,
      find: "{ production: process.env.NODE_ENV === 'production' }", replace: '{ production: false }' },
    { name: '⚠ the stream is handed out without a pass when there is no key', file: ROUTE,
      find: '    if (!issued) {\n', replace: '    if (false) {\n' },
    { name: 'the pass is made out to someone else', file: ROUTE,
      find: 'makePass({ userId: user.id, now: Date.now(), key })', replace: "makePass({ userId: '00000000-0000-4000-8000-000000000000', now: Date.now(), key })" },
    { name: 'a member\'s pass may be cached on the way', file: ROUTE,
      find: "      ...(passExpiresAt ? { passExpiresAt } : {}),\n    },\n    { headers: { 'cache-control': 'no-store' } }", replace: '      ...(passExpiresAt ? { passExpiresAt } : {}),\n    },\n    {}' },
    { name: 'the player is not told when its pass runs out', file: ROUTE,
      find: '      ...(passExpiresAt ? { passExpiresAt } : {}),\n', replace: '' },
    // ── the dashboard's check ──
    { name: '⚠ the dashboard probes without a pass (the station refuses it)', file: ACT,
      find: 'await probeStream(streamWithTicket(checked.value.stream_url, probeTicket.ticket))', replace: 'await probeStream(checked.value.stream_url)' },
    { name: 'the dashboard\'s ticket lasts the full two minutes', file: ACT,
      find: 'key, ttlSec: 60 })', replace: 'key })' },
    { name: 'no key is not said', file: ACT,
      find: "  if (!probeTicket) failed('station_no_pass_key');\n", replace: '' },
    { name: 'a refused pass reads as a station that is down', file: ST,
      find: "  if (res.status === 401 || res.status === 403) return { ok: false, error: 'station_refused_pass' };\n", replace: '' },
    // ── the station server ──
    { name: '⚠ the station lets anyone in (no door on /live)', file: XML,
      find: '        <authentication type="url">\n            <option name="listener_add" value="${LISTENER_AUTH_URL}" />\n            <option name="auth_header" value="icecast-auth-user: 1" />\n        </authentication>\n', replace: '' },
    { name: '⚠ the station admits on any 200 (no admitting header asked for)', file: XML,
      find: '            <option name="auth_header" value="icecast-auth-user: 1" />\n', replace: '' },
    { name: '⚠ passes go to Shape in clear text', file: ENTRY,
      find: "grep -Eq '^(https://[A-Za-z0-9.-]+|http://(127\\.0\\.0\\.1|localhost))(:[0-9]{2,5})?$'", replace: "grep -Eq '^(https?://[A-Za-z0-9.-]+|http://(127\\.0\\.0\\.1|localhost))(:[0-9]{2,5})?$'" },
    { name: 'a path rides on Shape\'s address', file: ENTRY,
      find: "grep -Eq '^(https://[A-Za-z0-9.-]+|http://(127\\.0\\.0\\.1|localhost))(:[0-9]{2,5})?$'", replace: "grep -Eq '^(https://[A-Za-z0-9./-]+|http://(127\\.0\\.0\\.1|localhost))(:[0-9]{2,5})?$'" },
    { name: 'the door\'s address is never filled in', file: ENTRY,
      find: '    -e "s|\\${LISTENER_AUTH_URL}|$LISTENER_AUTH_URL|g" \\\n', replace: '' },
    // ── the players ──
    { name: '⚠ the website says a region refusal as a fault to retry', file: WEB,
      find: '        if (r.status === 451) { setRefusal("region"); return false; }\n', replace: '' },
    { name: '⚠ the website resumes on a spent pass', file: WEB,
      find: '    if (audio.src && passExpiresRef.current != null && passExpiresRef.current - Date.now() < 60000) {', replace: '    if (false) {' },
    { name: 'the website never learns when its pass runs out', file: WEB,
      find: '        passExpiresRef.current = Number.isFinite(passEnds) ? passEnds : null;\n', replace: '' },
    { name: '⚠ the app says a region refusal as a fault', file: APP,
      find: "      if (r.status === 451) return { configured: false, refusal: 'region' };\n", replace: '' },
    { name: '⚠ the app replays a spent pass', file: APP,
      find: '    if (stationCache && !passFresh(stationCache)) stationCache = null;\n', replace: '' },
    { name: 'the app replays a pass in its last minute', file: APP,
      find: '    return !Number.isFinite(ends) || ends - Date.now() > 60000;', replace: '    return !Number.isFinite(ends) || ends - Date.now() > 0;' },
    { name: 'the app forgets why it was refused', file: APP,
      find: '      if (cfg && cfg.refusal) radioApi.lastRefusal = cfg.refusal;\n', replace: '' },
    { name: 'the app tells the member at every ask', file: RADIO,
      find: "window.ShapeRadioLive?.lastRefusal === 'region' && !regionToldRef.current) {", replace: "window.ShapeRadioLive?.lastRefusal === 'region') {" },
  ],
};
