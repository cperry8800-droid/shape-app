// The coach's calendar feed (2026-10-07, owner-approved coach-tools plan, Schedule "Connect":
// "A private link that Google, Apple and Outlook can subscribe to, read-only. It's the cheapest
// true version of 'sync'").
//
// What is held here, and why each matters:
//   · THE TEXT IS VALID iCalendar: CRLF, 75-octet folds that never split a UTF-8 character,
//     TEXT escaping, UTC / DATE / floating times. A feed a calendar app rejects is no feed.
//   · THE TOKEN IS THE CREDENTIAL: a malformed, unknown, reset or orphaned link and a database
//     without the migration all get the same 404; a link only ever shows its own coach's rows.
//   · A FAILED READ IS A 503, NEVER AN EMPTY CALENDAR, because an empty feed deletes every
//     event from the subscriber's calendar.
//   · THE PROXY LETS ONLY THE FEED PATH PAST THE MEMBERSHIP GATE — not the link-management
//     route next to it.
//   · THE SETTINGS CARD, mounted in JSDOM against a recorded fetch: every reply has a state,
//     a reset needs an in-page confirm, and a failed reset keeps the working link on screen.
// Every route and component here is the SHIPPED file, compiled by loadRealModule or Babel.
// Run: node --test tests/calendar-feed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const nextServer = require('next/server');
const NY = 'America/New_York';
const DAY = 86_400_000;

let libs = null;
async function lib() {
  if (libs) return libs;
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const load = (f, registry = new Map()) => loadRealModule(join(ROOT, f), { typescript: true, registry });
  const time = await load('src/lib/time.ts');
  const ics = await load('src/lib/ics.ts');
  const feed = await load('src/lib/calendar-feed.ts', new Map([['@/lib/ics', ics], ['@/lib/time', time]]));
  const requestUtils = await load('src/lib/request-utils.ts', new Map([['next/server', nextServer]]));
  libs = { loadRealModule, load, time, ics, feed, requestUtils };
  return libs;
}

// RFC 5545 §3.1: unfolding removes every CRLF followed by one space or tab.
const unfold = (s) => s.replace(/\r\n[ \t]/g, '');
const lines = (s) => unfold(s).split('\r\n');
const vevents = (s) => unfold(s).split('BEGIN:VEVENT').slice(1).map((v) => v.slice(0, v.indexOf('END:VEVENT')));
const prop = (block, name) => {
  const m = new RegExp('(?:^|\\r\\n)' + name + '([;:][^\\r\\n]*)').exec(block);
  return m ? m[1].replace(/^[;:]/, '') : null;
};

// ── 1 · the text ─────────────────────────────────────────────────────────────
test('TEXT values escape backslash, semicolon, comma and newline, and drop other control characters', async () => {
  const { ics } = await lib();
  assert.equal(ics.icsText('Lee, Sam; "Sammy" \\ co'), 'Lee\\, Sam\\; "Sammy" \\\\ co');
  assert.equal(ics.icsText('line one\r\nline two\rthree\nfour'), 'line one\\nline two\\nthree\\nfour');
  assert.equal(ics.icsText('bell\u0007tab\tdel\u007f'), 'belltab\tdel');
  assert.equal(ics.icsText(null), '');
});

test('a long line folds at 75 octets, never inside a UTF-8 character, and unfolds to itself', async () => {
  const { ics } = await lib();
  const enc = new TextEncoder();
  for (const s of [
    'SUMMARY:' + 'a'.repeat(200),
    'DESCRIPTION:' + 'Zoë Ångström · 東京 · 🏋️ '.repeat(12),
    'SUMMARY:' + '😀'.repeat(60),
    'X:' + 'é'.repeat(37) + 'a',
  ]) {
    const folded = ics.icsFold(s);
    assert.equal(unfold(folded), s, 'folding lost or changed text');
    for (const l of folded.split('\r\n')) {
      assert.ok(enc.encode(l).length <= 75, 'a folded line is ' + enc.encode(l).length + ' octets');
      // a fold through a multi-byte character leaves a replacement character on decode
      assert.ok(!new TextDecoder().decode(enc.encode(l)).includes('�'));
    }
  }
  assert.equal(ics.icsFold('short'), 'short');
  // exactly 75 octets is not folded; 76 is
  assert.equal(ics.icsFold('x'.repeat(75)).includes('\r\n'), false);
  assert.equal(ics.icsFold('x'.repeat(76)), 'x'.repeat(75) + '\r\n x');
});

test('a calendar: CRLF everywhere, the required properties, and each time form', async () => {
  const { ics } = await lib();
  const t = Date.parse('2026-10-07T13:00:00Z');
  const body = ics.icsCalendar({
    name: 'Shape sessions', description: 'Read-only', refreshMinutes: 60,
    events: [
      { uid: 'session-1@x', start: { utc: t }, end: { utc: t + 3600e3 }, stamp: t, summary: 'A', status: 'TENTATIVE', url: 'https://meet.example/abc' },
      { uid: 'event-2@x', start: { date: '2026-10-08' }, end: { date: '2026-10-09' }, stamp: t, summary: 'B', transparent: true, url: 'javascript:alert(1)' },
      { uid: 'event-3@x', start: { floating: '2026-10-09T07:30' }, end: { floating: '2026-10-09T08:00' }, stamp: t, summary: 'C' },
    ],
  });
  assert.ok(body.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(body), 'a bare LF');
  const ls = lines(body);
  assert.deepEqual(ls.slice(0, 5), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shape//Coach calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']);
  assert.equal(ls.filter((l) => l === 'BEGIN:VEVENT').length, 3);
  assert.equal(ls.filter((l) => l === 'END:VEVENT').length, 3);
  assert.equal(ls[ls.length - 2], 'END:VCALENDAR');
  assert.ok(ls.includes('REFRESH-INTERVAL;VALUE=DURATION:PT60M'));
  const [a, b, c] = vevents(body);
  assert.deepEqual([prop(a, 'DTSTART'), prop(a, 'DTEND'), prop(a, 'DTSTAMP'), prop(a, 'STATUS'), prop(a, 'TRANSP'), prop(a, 'URL')],
    ['20261007T130000Z', '20261007T140000Z', '20261007T130000Z', 'TENTATIVE', 'OPAQUE', 'https://meet.example/abc']);
  assert.deepEqual([prop(b, 'DTSTART'), prop(b, 'DTEND'), prop(b, 'TRANSP'), prop(b, 'URL')], ['VALUE=DATE:20261008', 'VALUE=DATE:20261009', 'TRANSPARENT', null]);
  assert.deepEqual([prop(c, 'DTSTART'), prop(c, 'DTEND')], ['20261009T073000', '20261009T080000'], 'a floating time carries no Z and no TZID');
});

// ── 2 · the token ────────────────────────────────────────────────────────────
test('a feed token is 43 url-safe characters of randomness, and the path reader refuses anything else', async () => {
  const { feed } = await lib();
  const a = feed.newFeedToken();
  const b = feed.newFeedToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(feed.feedTokenFromPath(a), a);
  assert.equal(feed.feedTokenFromPath(a + '.ics'), a);
  assert.equal(feed.feedTokenFromPath(a + '.ICS'), a);
  for (const bad of ['', 'short', a.slice(0, 42), a + '!', '../' + a, a + '.ics.ics', '%E0%A4%A', null, undefined, 'a'.repeat(129)]) {
    assert.equal(feed.feedTokenFromPath(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(feed.feedUrls('https://theshapecommunity.com/', a), {
    url: 'https://theshapecommunity.com/api/calendar/feed/' + a + '.ics',
    webcalUrl: 'webcal://theshapecommunity.com/api/calendar/feed/' + a + '.ics',
  });
  assert.equal(feed.feedUrls('http://localhost:3000', a).webcalUrl, 'webcal://localhost:3000/api/calendar/feed/' + a + '.ics');
});

// ── 3 · the feed's events ────────────────────────────────────────────────────
const NOW = Date.parse('2026-10-07T12:00:00Z');
const session = (id, at, extra = {}) => ({
  id, client_id: 'member-1', provider_role: 'trainer', type: 'video', scheduled_at: at, duration_min: 60,
  status: 'confirmed', topic: null, meeting_url: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T11:30:00Z', ...extra,
});
const note = (id, date, time, extra = {}) => ({
  id, kind: 'ADMIN', title: 'Programming block', sub: null, event_date: date, event_time: time, duration_min: null,
  with_name: null, location: null, status: 'planned', created_at: '2026-10-01T10:00:00Z', updated_at: null, ...extra,
});
async function build(input) {
  const { feed } = await lib();
  return feed.buildCoachFeed({ sessions: [], events: [], names: new Map([['member-1', 'Priya Shah']]), zone: NY, origin: 'https://theshapecommunity.com', now: NOW, ...input });
}

test('a booking: UTC times from scheduled_at + duration, the client\'s name, its status, and a stable UID', async () => {
  const body = await build({ sessions: [
    session('s-1', '2026-10-07T13:00:00Z', { meeting_url: 'https://meet.example/priya', topic: 'Lower A' }),
    session('s-2', '2026-10-08T23:30:00Z', { status: 'requested', provider_role: 'nutritionist', type: 'phone', duration_min: 20, client_id: 'member-2' }),
  ] });
  const [a, b] = vevents(body);
  assert.deepEqual([prop(a, 'UID'), prop(a, 'SUMMARY'), prop(a, 'DTSTART'), prop(a, 'DTEND'), prop(a, 'STATUS')],
    ['session-s-1@theshapecommunity.com', 'Session · Priya Shah', '20261007T130000Z', '20261007T140000Z', 'CONFIRMED']);
  assert.equal(prop(a, 'LOCATION'), 'https://meet.example/priya');
  assert.equal(prop(a, 'URL'), 'https://meet.example/priya');
  const desc = prop(a, 'DESCRIPTION').split('\\n');
  assert.deepEqual(desc, ['Confirmed.', 'Video call', 'Topic: Lower A', 'Join: https://meet.example/priya',
    'Open in Shape: https://theshapecommunity.com/newdesign/TrainerApp.html#schedule']);
  assert.equal(prop(a, 'LAST-MODIFIED'), '20261002T113000Z');
  assert.equal(prop(a, 'DTSTAMP'), '20261002T113000Z', 'DTSTAMP is when the row changed, so an unchanged feed is the same bytes');
  // a request is tentative and says so; a nutritionist's booking is a consult; no name reads "Client"
  assert.deepEqual([prop(b, 'SUMMARY'), prop(b, 'STATUS'), prop(b, 'DTEND'), prop(b, 'LOCATION')],
    ['Consult · Client (requested)', 'TENTATIVE', '20261008T235000Z', 'Phone call']);
  assert.match(prop(b, 'DESCRIPTION'), /^Requested: not confirmed yet\./);
  assert.match(prop(b, 'DESCRIPTION'), /NutritionistApp\.html#schedule/);
});

test('cancelled and declined bookings are left out — that is how a subscription deletes an event', async () => {
  const body = await build({ sessions: ['requested', 'confirmed', 'completed', 'cancelled', 'declined'].map((st, i) =>
    session('s-' + st, '2026-10-0' + (i + 1) + 'T13:00:00Z', { status: st })) });
  assert.deepEqual(vevents(body).map((v) => prop(v, 'UID')), ['session-s-requested@theshapecommunity.com', 'session-s-confirmed@theshapecommunity.com', 'session-s-completed@theshapecommunity.com']);
  assert.match(prop(vevents(body)[2], 'DESCRIPTION'), /^Completed\./);
});

test('a name with a comma or a newline cannot break the line it is on', async () => {
  const body = await build({ sessions: [session('s-1', '2026-10-07T13:00:00Z')], names: new Map([['member-1', 'Lee, Sam;\nDROP']]) });
  assert.equal(prop(vevents(body)[0], 'SUMMARY'), 'Session · Lee\\, Sam\\;\\nDROP');
  assert.equal(lines(body).filter((l) => l === 'DROP').length, 0);
});

test('a coach\'s own notes: placed in their zone, all-day as a DATE that does not block the day, floating with no zone', async () => {
  const body = await build({ events: [
    note('e-1', '2026-10-07', '09:00', { duration_min: 45, sub: 'Week 3 blocks', with_name: 'Dana', location: 'Gym' }),
    note('e-2', '2026-10-08', null),
    note('e-3', '2026-10-09', '25:00'),
    note('e-4', '2026-10-10', '07:30', { status: 'done' }),
    note('e-5', '2026-10-11', '07:30', { status: 'cancelled' }),
    note('e-6', '2026-10-12', '07:30', { status: 'skipped' }),
  ] });
  const v = Object.fromEntries(vevents(body).map((x) => [prop(x, 'UID').split('@')[0], x]));
  assert.deepEqual(Object.keys(v).sort(), ['event-e-1', 'event-e-2', 'event-e-3', 'event-e-4'], 'a cancelled or skipped note reached the feed');
  // 9:00 AM in New York is 13:00 UTC in October
  assert.deepEqual([prop(v['event-e-1'], 'DTSTART'), prop(v['event-e-1'], 'DTEND'), prop(v['event-e-1'], 'TRANSP')], ['20261007T130000Z', '20261007T134500Z', 'OPAQUE']);
  assert.equal(prop(v['event-e-1'], 'DESCRIPTION'), 'Week 3 blocks\\nWith Dana');
  assert.equal(prop(v['event-e-1'], 'LOCATION'), 'Gym');
  assert.deepEqual([prop(v['event-e-2'], 'DTSTART'), prop(v['event-e-2'], 'DTEND'), prop(v['event-e-2'], 'TRANSP')], ['VALUE=DATE:20261008', 'VALUE=DATE:20261009', 'TRANSPARENT']);
  assert.equal(prop(v['event-e-3'], 'DTSTART'), 'VALUE=DATE:20261009', 'an impossible time is an all-day note, not a crash');
  assert.equal(prop(v['event-e-4'], 'DESCRIPTION'), 'Done.');
  // with no zone the wall clock floats, and a default length applies
  const fl = vevents(await build({ zone: null, events: [note('e-1', '2026-10-07', '09:00')] }))[0];
  assert.deepEqual([prop(fl, 'DTSTART'), prop(fl, 'DTEND')], ['20261007T090000', '20261007T093000']);
  // ⚠ the spring-forward hour does not exist in New York: floating, never an hour that nobody set
  const gap = vevents(await build({ events: [note('e-1', '2026-03-08', '02:30')] }))[0];
  assert.equal(prop(gap, 'DTSTART'), '20260308T023000');
});

test('the feed is the same bytes for the same rows, whatever order they were read in', async () => {
  const rows = [session('s-2', '2026-10-09T13:00:00Z'), session('s-1', '2026-10-07T13:00:00Z')];
  const evs = [note('e-2', '2026-10-08', null), note('e-1', '2026-10-07', '09:00')];
  const a = await build({ sessions: rows, events: evs });
  const b = await build({ sessions: [...rows].reverse(), events: [...evs].reverse() });
  assert.equal(a, b);
  assert.deepEqual(vevents(a).map((v) => prop(v, 'UID').split('@')[0]), ['event-e-1', 'session-s-1', 'event-e-2', 'session-s-2']);
});

// ── 4 · the feed route ───────────────────────────────────────────────────────
const TOKEN = 'T0k3n_' + 'a'.repeat(37);
const OTHER = 'Zz_' + 'b'.repeat(40);
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
function feedTables(extra = {}) {
  return {
    calendar_feed_tokens: [{ user_id: 'coach-1', token: TOKEN }, { user_id: 'member-9', token: OTHER }],
    trainers: [{ id: 7, owner_id: 'coach-1', timezone: NY }, { id: 8, owner_id: 'coach-2', timezone: NY }],
    nutritionists: [],
    sessions: [
      session('mine', iso(now + 2 * DAY), { provider_id: 7 }),
      session('mine-past', iso(now - 10 * DAY), { provider_id: 7, status: 'completed' }),
      session('too-old', iso(now - 40 * DAY), { provider_id: 7 }),
      session('too-far', iso(now + 200 * DAY), { provider_id: 7 }),
      session('cancelled', iso(now + 3 * DAY), { provider_id: 7, status: 'cancelled' }),
      session('other-coach', iso(now + 2 * DAY), { provider_id: 8 }),
      session('other-role', iso(now + 2 * DAY), { provider_id: 7, provider_role: 'nutritionist' }),
    ],
    calendar_events: [
      note('own', new Date(now + DAY).toISOString().slice(0, 10), '09:00', { user_id: 'coach-1', created_by: 'coach-1' }),
      note('on-a-client', new Date(now + DAY).toISOString().slice(0, 10), '10:00', { user_id: 'member-1', created_by: 'coach-1' }),
    ],
    profiles: [{ id: 'member-1', full_name: 'Priya Shah', email: 'priya@example.com' }],
    ...extra,
  };
}
let feedMod = null;
let admin = null;
async function feedRoute() {
  if (feedMod) return feedMod;
  const { loadRealModule, time, feed } = await lib();
  feedMod = await loadRealModule(join(ROOT, 'src/app/api/calendar/feed/[token]/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer], ['@/lib/time', time], ['@/lib/calendar-feed', feed],
      ['@/lib/supabase/admin', { createAdminClient: () => { if (!admin) throw new Error('no service key'); return admin; } }],
    ]),
  });
  return feedMod;
}
async function fetchFeed(segment, client) {
  const r = await feedRoute();
  admin = client;
  const logs = [];
  const orig = [console.error, console.warn];
  console.error = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  try {
    const res = await r.GET(new Request('https://shape.test/api/calendar/feed/' + segment), { params: Promise.resolve({ token: segment }) });
    return { status: res.status, type: res.headers.get('content-type'), cache: res.headers.get('cache-control'), retry: res.headers.get('retry-after'), text: await res.text(), logs };
  } finally { [console.error, console.warn] = orig; }
}
const uidsOf = (text) => vevents(text).map((v) => prop(v, 'UID').split('@')[0]);

test('a live link: text/calendar, private, and only this coach\'s rows inside the window', async () => {
  const c = fakeSupabase({ tables: feedTables() });
  const res = await fetchFeed(TOKEN + '.ics', c);
  assert.equal(res.status, 200);
  assert.equal(res.type, 'text/calendar; charset=utf-8');
  assert.equal(res.cache, 'private, max-age=300');
  assert.deepEqual(uidsOf(res.text).sort(), ['event-own', 'session-mine', 'session-mine-past']);
  assert.match(res.text, /SUMMARY:Session · Priya Shah/);
  // ⚠ the names read selected the display field and nothing else
  const nameRead = c._calls.find((x) => x.table === 'profiles');
  assert.equal(nameRead.select, 'id, full_name');
  assert.ok(!res.text.includes('priya@example.com'));
  // and the same link without the .ics suffix
  assert.deepEqual(uidsOf((await fetchFeed(TOKEN, c)).text).sort(), ['event-own', 'session-mine', 'session-mine-past']);
});

test('an account that owns both coach rows gets both rows\' bookings', async () => {
  const t = feedTables({ nutritionists: [{ id: 3, owner_id: 'coach-1', timezone: null }] });
  t.sessions.push(session('consult', iso(now + 4 * DAY), { provider_id: 3, provider_role: 'nutritionist' }));
  const res = await fetchFeed(TOKEN, fakeSupabase({ tables: t }));
  assert.ok(uidsOf(res.text).includes('session-consult'));
  assert.ok(uidsOf(res.text).includes('session-mine'));
  assert.ok(!uidsOf(res.text).includes('session-other-role'), 'another nutritionist\'s booking under id 7');
});

test('every link that is not live is the same 404, and a malformed one never reaches the database', async () => {
  const c = fakeSupabase({ tables: feedTables() });
  for (const seg of ['nope', TOKEN.slice(0, 30), 'x'.repeat(43), OTHER]) {
    const before = c._calls.length;
    const res = await fetchFeed(seg, c);
    assert.deepEqual([res.status, res.text, res.cache], [404, 'Not found', 'no-store'], seg);
    if (seg.length < 43) assert.equal(c._calls.length, before, 'a malformed token was looked up');
  }
  // OTHER belongs to an account that owns no coach row: no bookings, and no hint it was real
  // before the migration the table is missing — still a 404, not an outage
  const missing = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.calendar_feed_tokens'" } }) }) }) }) };
  const pre = await fetchFeed(TOKEN, missing);
  assert.equal(pre.status, 404);
  assert.equal(pre.logs.length, 0, 'the expected pre-migration state was logged as a fault');
});

test('a failed read is a 503 with Retry-After — never an empty calendar that would delete the coach\'s events', async () => {
  for (const table of ['calendar_feed_tokens', 'trainers', 'nutritionists', 'sessions', 'calendar_events']) {
    const res = await fetchFeed(TOKEN, fakeSupabase({ tables: feedTables(), fail: [table] }));
    assert.deepEqual([res.status, res.retry, res.cache], [503, '300', 'no-store'], table);
    assert.ok(!res.text.includes('BEGIN:VCALENDAR'), table + ': a partial calendar was served');
    // The log names the failure. A failed page read as "the end of the list" also lands on
    // a 503 (the count check catches the shortfall), but it logs "incomplete" over a database
    // error, and whoever reads the log goes looking for the wrong thing.
    assert.ok(res.logs.some((l) => /read failed/.test(l)), table + ': ' + res.logs.join(' | '));
  }
  // no service key: an outage, not a 500 stack
  const res = await fetchFeed(TOKEN, null);
  assert.equal(res.status, 503);
});

test('names are the one read that may fail: the bookings still come, reading "Client"', async () => {
  const res = await fetchFeed(TOKEN, fakeSupabase({ tables: feedTables(), fail: ['profiles'] }));
  assert.equal(res.status, 200);
  assert.match(res.text, /SUMMARY:Session · Client/);
  assert.equal(res.logs.length, 1);
});

test('the names go in batches the RPC would accept', async () => {
  const t = feedTables();
  t.sessions = Array.from({ length: 450 }, (_, i) => session('s' + i, iso(now + (i % 100) * 3600e3), { provider_id: 7, client_id: 'm-' + i }));
  const c = fakeSupabase({ tables: t });
  const res = await fetchFeed(TOKEN, c);
  assert.equal(res.status, 200);
  const nameReads = c._calls.filter((x) => x.table === 'profiles');
  assert.equal(nameReads.length, 3, '450 ids in batches of 200');
});

// ⚠ Codex, the review of #2224: PostgREST answers a list read with at most its own
// db-max-rows, whatever `.limit()` asked for, and the short array carries no error. These run
// the fake with that ceiling switched on (1,000, the figure the repo's other readers assume).
const many = (n, extra = {}) => Array.from({ length: n }, (_, i) => session('s' + String(i).padStart(5, '0'), iso(now + 60e3 * i), { provider_id: 7, client_id: 'm-1', ...extra }));

test('a coach past the server\'s row ceiling gets every session, a page at a time', async () => {
  // 1,000 is PAGE itself; 400 is a server whose ceiling is lower than the page the route asks
  // for, so a step of "what I asked for" would skip 600 rows a page.
  for (const maxRows of [1000, 400]) {
    const t = feedTables({ calendar_events: [] });
    t.sessions = many(2450);
    const c = fakeSupabase({ tables: t, maxRows });
    const res = await fetchFeed(TOKEN, c);
    assert.equal(res.status, 200, 'max-rows ' + maxRows);
    assert.equal(vevents(res.text).length, 2450, 'max-rows ' + maxRows + ': one read would have published ' + maxRows);
    const pages = c._calls.filter((x) => x.table === 'sessions');
    assert.ok(pages.length >= Math.ceil(2450 / maxRows), 'paged, not one read');
  }
});

test('a row that vanishes between two pages is a 503, never a feed with a hole in it', async () => {
  const t = feedTables({ calendar_events: [] });
  t.sessions = many(1500);
  const c = fakeSupabase({ tables: t, maxRows: 1000 });
  // After the first page is read, the newest booking is cancelled: every later offset shifts
  // by one, so one older row is never fetched. Only the exact count can see it.
  const from = c.from;
  let pages = 0;
  c.from = (table) => {
    const chain = from(table);
    if (table !== 'sessions') return chain;
    const then = chain.then;
    chain.then = (res, rej) => then.call(chain, (out) => { if (++pages === 1) t.sessions.splice(t.sessions.length - 1, 1); return res(out); }, rej);
    return chain;
  };
  const res = await fetchFeed(TOKEN, c);
  assert.equal(res.status, 503);
  assert.ok(res.logs.some((l) => /incomplete/.test(l)), res.logs.join('\n'));
});

test('the calendar notes page past the ceiling too', async () => {
  const t = feedTables();
  t.calendar_events = Array.from({ length: 1200 }, (_, i) => note('n' + String(i).padStart(5, '0'), iso(now + DAY * (i % 150)).slice(0, 10), null, { user_id: 'coach-1' }));
  const c = fakeSupabase({ tables: t, maxRows: 1000 });
  const res = await fetchFeed(TOKEN, c);
  assert.equal(res.status, 200);
  assert.ok(c._calls.filter((x) => x.table === 'calendar_events').length >= 2, 'paged, not one read');
  assert.equal((res.text.match(/UID:event-n\d+/g) || []).length, 1200);
});

test('at the 5,000-row ceiling the NEWEST rows are kept and the oldest days drop off', async () => {
  const t = feedTables({ calendar_events: [] });
  t.sessions = many(5200);
  const res = await fetchFeed(TOKEN, fakeSupabase({ tables: t, maxRows: 1000 }));
  assert.equal(res.status, 200);
  assert.equal(vevents(res.text).length, 5000);
  assert.match(res.text, /UID:session-s05199@/, 'the newest is in');
  assert.doesNotMatch(res.text, /UID:session-s00000@/, 'the oldest is the one that drops');
});

// ── 5 · the link-management route ────────────────────────────────────────────
// A user-scoped client over one calendar_feed_tokens table, with the RLS rule applied in the
// stand-in (an account sees and writes only its own row) and the knobs the route must survive.
function userClient({ uid = 'coach-1', coach = 'trainer', rows = [], missing = false, raceOnce = false, coachError = false } = {}) {
  const table = rows;
  const err = (code, message) => ({ code, message });
  const MISSING = err('PGRST205', "Could not find the table 'public.calendar_feed_tokens' in the schema cache");
  let raced = !raceOnce;
  const pick = (r, cols) => (r ? Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, r[c] ?? null])) : null);
  return {
    table,
    from(name) {
      if (name === 'trainers' || name === 'nutritionists') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => (coachError ? { data: null, error: err('500', 'boom') } : { data: coach === name.slice(0, -1) ? { id: 7 } : null, error: null }) }) }) };
      }
      assert.equal(name, 'calendar_feed_tokens');
      return {
        select: (cols) => ({ eq: (col, v) => ({ maybeSingle: async () => {
          if (missing) return { data: null, error: MISSING };
          return { data: pick(table.find((r) => r.user_id === v && v === uid), cols), error: null };
        } }) }),
        insert: (row) => ({ select: (cols) => ({ single: async () => {
          if (missing) return { data: null, error: MISSING };
          if (row.user_id !== uid) return { data: null, error: err('42501', 'rls') };
          if (!raced) {
            // another tab won the insert a moment ago
            raced = true;
            table.push({ user_id: uid, token: 'W' + 'w'.repeat(42), created_at: '2026-10-07T10:00:00Z', rotated_at: null });
          }
          if (table.some((r) => r.user_id === row.user_id)) return { data: null, error: err('23505', 'duplicate key') };
          const stored = { ...row, created_at: '2026-10-07T12:00:00Z', rotated_at: null };
          table.push(stored);
          return { data: pick(stored, cols), error: null };
        } }) }),
        update: (patch) => ({ eq: (col, v) => ({ select: (cols) => ({ maybeSingle: async () => {
          if (missing) return { data: null, error: MISSING };
          const r = table.find((x) => x.user_id === v && v === uid);
          if (r) Object.assign(r, patch);
          return { data: pick(r, cols), error: null };
        } }) }) }),
      };
    },
  };
}
let tokenMod = null;
let ctx = { user: null, client: null, denied: null };
async function tokenRoute() {
  if (tokenMod) return tokenMod;
  const { loadRealModule, feed, requestUtils } = await lib();
  tokenMod = await loadRealModule(join(ROOT, 'src/app/api/calendar/feed-token/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer], ['@/lib/calendar-feed', feed], ['@/lib/request-utils', requestUtils],
      ['@/lib/require-membership', { requireMembership: async () => ctx.denied }],
      ['@/lib/request-auth', { currentUser: async () => ctx.user, clientForRequest: async () => ctx.client }],
    ]),
  });
  return tokenMod;
}
async function callToken(method, { body, user = { id: 'coach-1' }, client, denied = null, site } = {}) {
  const r = await tokenRoute();
  ctx = { user, client, denied };
  const before = process.env.NEXT_PUBLIC_SITE_URL;
  if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = site;
  const orig = console.error;
  console.error = () => {};
  try {
    const res = await r[method](new Request('https://preview.shape.test/api/calendar/feed-token', {
      method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
  } finally {
    console.error = orig;
    if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = before;
  }
}

test('the first visit makes the link; the next one reads the same link back; every answer is no-store', async () => {
  const c = userClient();
  const a = await callToken('GET', { client: c, site: 'https://theshapecommunity.com' });
  assert.equal(a.status, 200);
  assert.equal(a.cache, 'no-store');
  const tok = c.table[0].token;
  assert.match(tok, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(a.body, {
    url: 'https://theshapecommunity.com/api/calendar/feed/' + tok + '.ics',
    webcalUrl: 'webcal://theshapecommunity.com/api/calendar/feed/' + tok + '.ics',
    createdAt: '2026-10-07T12:00:00Z', rotatedAt: null,
  });
  const b = await callToken('GET', { client: c, site: 'https://theshapecommunity.com' });
  assert.equal(b.body.url, a.body.url);
  assert.equal(c.table.length, 1);
  // with no site URL configured, the request's own origin
  assert.match((await callToken('GET', { client: c })).body.url, /^https:\/\/preview\.shape\.test\/api\/calendar\/feed\//);
});

test('two tabs making the link at once both get the one that was stored', async () => {
  const c = userClient({ raceOnce: true });
  const res = await callToken('GET', { client: c });
  assert.equal(res.status, 200);
  assert.equal(c.table.length, 1);
  assert.ok(res.body.url.endsWith('/' + c.table[0].token + '.ics'));
});

test('a reset needs an explicit rotate: true, writes a new token, and the old link stops working', async () => {
  const c = userClient({ rows: [{ user_id: 'coach-1', token: TOKEN, created_at: '2026-10-01T00:00:00Z', rotated_at: null }] });
  for (const body of [undefined, {}, { rotate: 'yes' }, { rotate: 1 }]) {
    const res = await callToken('POST', { client: c, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(c.table[0].token, TOKEN, 'a body that did not ask for a reset reset the link');
  }
  const res = await callToken('POST', { client: c, body: { rotate: true } });
  assert.equal(res.status, 200);
  assert.equal(res.body.rotated, true);
  assert.notEqual(c.table[0].token, TOKEN);
  assert.ok(res.body.url.endsWith('/' + c.table[0].token + '.ics'));
  assert.ok(res.body.rotatedAt);
  // the feed no longer answers the old token
  const feed = await fetchFeed(TOKEN, fakeSupabase({ tables: { ...feedTables(), calendar_feed_tokens: c.table } }));
  assert.equal(feed.status, 404);
  // a reset before any link existed simply makes one
  const fresh = userClient();
  const made = await callToken('POST', { client: fresh, body: { rotate: true } });
  assert.deepEqual([made.status, fresh.table.length, made.body.rotated], [200, 1, true]);
});

test('coaches only: signed out is 401, a member is 403, the gate\'s own answer passes through, a failed check is not a "no"', async () => {
  assert.equal((await callToken('GET', { client: userClient(), user: null })).status, 401);
  const member = await callToken('GET', { client: userClient({ coach: null }) });
  assert.deepEqual([member.status, member.body.error], [403, 'Calendar feeds are for coaches.']);
  const nutri = await callToken('GET', { client: userClient({ coach: 'nutritionist' }) });
  assert.equal(nutri.status, 200);
  const gate = await callToken('POST', { client: userClient(), denied: nextServer.NextResponse.json({ error: 'Shape membership required.' }, { status: 402 }), body: { rotate: true } });
  assert.equal(gate.status, 402);
  const flaky = await callToken('GET', { client: userClient({ coach: null, coachError: true }) });
  assert.equal(flaky.status, 503, 'a failed coach read was answered as "not a coach"');
});

test('before the migration both verbs say the feed is not set up — a 503 with a code, not a 500', async () => {
  for (const method of ['GET', 'POST']) {
    const res = await callToken(method, { client: userClient({ missing: true }), body: method === 'POST' ? { rotate: true } : undefined });
    assert.deepEqual([res.status, res.body.code, res.body.error], [503, 'feed_not_set_up', "Calendar feed isn't set up yet."], method);
  }
});

// ── 6 · the proxy lets the feed path, and only it, past the membership gate ──
async function proxyAnswer(path, { user = null, member = false } = {}) {
  const { loadRealModule } = await lib();
  const mw = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/ssr', { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }],
      ['@supabase/supabase-js', { createClient: () => ({}) }],
      ['@/lib/membership-core', { computeMembership: async () => ({ isMember: member, isKnownMinor: false }), GATE_STAMP_HEADER: 'x-shape-gate', GATE_STAMP_VALUE: 'ok' }],
      ['@/lib/rate-limit', { checkRateLimit: async () => ({ allowed: true, remaining: 99, resetSeconds: 60, limit: 100 }), jwtSub: () => null }],
      ['@/lib/supabase/cookie-options', { applyShapeCookieOptions: (o) => o }],
    ]),
  });
  const res = await mw.updateSession(new nextServer.NextRequest('https://shape.test' + path));
  return res.status;
}

test('a calendar app with no session reaches the feed; nothing else under /api/calendar does', async () => {
  assert.equal(await proxyAnswer('/api/calendar/feed/' + TOKEN + '.ics'), 200);
  assert.equal(await proxyAnswer('/api/calendar/feed/anything'), 200, 'the route, not the gate, decides a bad token');
  for (const p of ['/api/calendar', '/api/calendar/feed-token', '/api/calendar/feed', '/api/calendar/feedx/' + TOKEN, '/api/client/plan']) {
    assert.equal(await proxyAnswer(p), 401, p + ' slipped past the gate');
  }
  // and a signed-in non-member is still refused the link route, but reaches a feed
  assert.equal(await proxyAnswer('/api/calendar/feed-token', { user: { id: 'u1' } }), 402);
  assert.equal(await proxyAnswer('/api/calendar/feed/' + TOKEN, { user: { id: 'u1' } }), 200);
  assert.equal(await proxyAnswer('/api/calendar/feed-token', { user: { id: 'u1' }, member: true }), 200);
});

// ── 7 · the migration ────────────────────────────────────────────────────────
test('the token table: one row per account, an unguessable token, and RLS to the owner for read, create and reset', () => {
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-07-calendar-feed-token.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.calendar_feed_tokens \(\s*user_id uuid primary key references auth\.users\(id\) on delete cascade,/);
  assert.match(sql, /token text not null check \(token ~ '\^\[A-Za-z0-9_-\]\{43,128\}\$'\)/);
  assert.match(sql, /create unique index if not exists calendar_feed_tokens_token_uidx\s+on public\.calendar_feed_tokens \(token\)/);
  assert.match(sql, /alter table public\.calendar_feed_tokens enable row level security/);
  for (const verb of ['select', 'insert', 'update']) {
    assert.match(sql, new RegExp('for ' + verb + '\\s+to authenticated'), verb);
  }
  assert.equal((sql.match(/user_id = auth\.uid\(\)/g) || []).length, 4, 'read, create, and both halves of reset');
  assert.ok(!/to anon/.test(sql), 'anon must never read a token');
  assert.ok(!/for (delete|all)\b/.test(sql));
  // the route's token and the table's check agree
  assert.match(readFileSync(join(ROOT, 'src/lib/calendar-feed.ts'), 'utf8'), /FEED_TOKEN_RE = \/\^\[A-Za-z0-9_-\]\{43,128\}\$\//);
});

test('both routes are registered in the War Room', () => {
  const src = readFileSync(join(ROOT, 'src/lib/warroom.ts'), 'utf8');
  assert.match(src, /\['\/api\/calendar\/feed\/\[token\]', 'GET'\]/);
  assert.match(src, /\['\/api\/calendar\/feed-token', 'GET,POST'\]/);
});

// ── 8 · a claim may name the feed only while the feed exists ─────────────────
// The Coaches page may one day say coaches can subscribe from their calendar app — and that is
// TRUE only while the feed route, its gate exemption and its migration are in the tree. The
// subscription claim is the read-only one; tests/coaches-page.test.mjs keeps "sync" and
// "two-way" banned whatever this file says.
test('positive control: the code a read-only subscription claim depends on is all present', () => {
  for (const f of ['src/app/api/calendar/feed/[token]/route.ts', 'src/app/api/calendar/feed-token/route.ts', 'src/lib/calendar-feed.ts',
    'supabase-migrations/2026-10-07-calendar-feed-token.sql']) assert.ok(existsSync(join(ROOT, f)), f + ' is gone');
  assert.match(readFileSync(join(ROOT, 'src/lib/supabase/middleware.ts'), 'utf8'), /const GATE_SKIP_PREFIXES = \['\/api\/calendar\/feed\/'\];/);
  assert.match(readFileSync(join(ROOT, 'public/newdesign/coachSettings.jsx'), 'utf8'), /<CoachCalendarFeedCard key=\{acct \|\| "anon"\} signedIn=\{signedIn\} \/>/);
  // and any coach-facing page that claims a subscription is making a claim this test backs
  const ND = join(ROOT, 'public/newdesign');
  const claim = /subscribe[^.]{0,60}\b(google|apple|outlook|calendar)/i;
  for (const f of readdirSync(ND).filter((x) => /\.(jsx|html)$/.test(x))) {
    const src = readFileSync(join(ND, f), 'utf8');
    if (f === 'coachSettings.jsx' || !claim.test(src)) continue;
    assert.ok(/read-only/i.test(src), f + ' claims a calendar subscription without saying it is read-only');
  }
});

// ── 9 · the Settings card, mounted ───────────────────────────────────────────
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const SETTINGS_CODE = babel.transformSync(readFileSync(join(ROOT, 'public/newdesign/coachSettings.jsx'), 'utf8'), { presets: [presetReact], babelrc: false, configFile: false }).code;

const LINK = { url: 'https://theshapecommunity.com/api/calendar/feed/' + TOKEN + '.ics', webcalUrl: 'webcal://theshapecommunity.com/api/calendar/feed/' + TOKEN + '.ics', createdAt: 'x', rotatedAt: null };
const NEW = { ...LINK, url: LINK.url.replace(TOKEN, OTHER), webcalUrl: LINK.webcalUrl.replace(TOKEN, OTHER), rotated: true };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function mountCard(signedIn, respond) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#settings' });
  const keep = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [];
  const fetch = async (url, init = {}) => { calls.push({ url, method: init.method || 'GET', body: init.body }); return respond(init.method || 'GET', calls.length); };
  const clipboard = [];
  const navigator = { clipboard: { writeText: async (t) => { clipboard.push(t); } } };
  dom.window.shapeDb = { getSession: async () => ({}) };
  const { CoachCalendarFeedCard } = new Function('React', 'window', 'fetch', 'navigator', 'document', SETTINGS_CODE + ';return { CoachCalendarFeedCard };')(React, dom.window, fetch, navigator, dom.window.document);
  const root = createRoot(dom.window.document.getElementById('root'));
  const doc = dom.window.document;
  const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  const render = async (s) => { await act(async () => root.render(React.createElement(CoachCalendarFeedCard, { signedIn: s }))); await settle(); };
  await render(signedIn);
  const text = () => doc.body.textContent;
  const button = (label) => [...doc.querySelectorAll('button')].find((b) => b.textContent === label);
  const link = (label) => [...doc.querySelectorAll('a')].find((a) => a.textContent === label);
  const click = async (label) => { const b = button(label); assert.ok(b, 'no button ' + label); await act(async () => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); await settle(); };
  const field = () => doc.querySelector('input[aria-label="Your calendar feed link"]');
  const close = async () => {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = keep.window; globalThis.document = keep.document; globalThis.IS_REACT_ACT_ENVIRONMENT = keep.act;
  };
  return { calls, clipboard, text, button, link, click, field, render, close };
}

test('signed out the card is there, disabled, and says why — nothing is fetched', async () => {
  const m = await mountCard(false, () => { throw new Error('fetched while signed out'); });
  try {
    assert.equal(m.calls.length, 0);
    assert.match(m.text(), /Subscribe from Google, Apple or Outlook to see your Shape sessions there\. Read-only/);
    assert.match(m.text(), /Sign in as a coach to get your private calendar link\./);
    assert.equal(m.field().disabled, true);
    assert.equal(m.field().value, '');
    assert.equal(m.button('Copy').disabled, true);
    assert.equal(m.button('Reset link').disabled, true);
    assert.equal(m.link('Add to calendar').hasAttribute('href'), false);
  } finally { await m.close(); }
});

test('a live link: the URL in a read-only field, Copy, a webcal link, a Google link', async () => {
  const m = await mountCard(true, () => reply(200, LINK));
  try {
    assert.deepEqual(m.calls.map((c) => [c.url, c.method]), [['/api/calendar/feed-token', 'GET']]);
    assert.equal(m.field().value, LINK.url);
    assert.equal(m.field().readOnly, true);
    assert.equal(m.link('Add to calendar').getAttribute('href'), LINK.webcalUrl);
    assert.equal(m.link('Google Calendar ↗').getAttribute('href'), 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(LINK.webcalUrl));
    assert.equal(m.link('Google Calendar ↗').getAttribute('rel'), 'noopener noreferrer');
    assert.match(m.text(), /Link ready/);
    assert.match(m.text(), /Anyone with this link can see your session times, your clients' names and what they\s+booked about/);
    await m.click('Copy');
    assert.deepEqual(m.clipboard, [LINK.url]);
    assert.match(m.text(), /Copied\./);
  } finally { await m.close(); }
});

test('Reset asks in the page first; Keep it cancels; Reset link posts rotate:true and shows the new link', async () => {
  const m = await mountCard(true, (method) => (method === 'POST' ? reply(200, NEW) : reply(200, LINK)));
  try {
    await m.click('Reset link');
    assert.equal(m.calls.length, 1, 'the first click reset without asking');
    assert.match(m.text(), /Calendars subscribed to the current one stop updating/);
    await m.click('Keep it');
    assert.ok(!/stop updating/.test(m.text()), 'Keep it left the confirm open');
    assert.equal(m.calls.length, 1);
    await m.click('Reset link');
    const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === 'Reset link');
    await act(async () => confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual(m.calls.map((c) => [c.method, c.body ?? null]), [['GET', null], ['POST', '{"rotate":true}']]);
    assert.equal(m.field().value, NEW.url);
    assert.match(m.text(), /New link ready\. Subscribe again with it; the old one has stopped working\./);
  } finally { await m.close(); }
});

test('a failed reset keeps the working link on screen and says the current one still works', async () => {
  const m = await mountCard(true, (method) => (method === 'POST' ? reply(500, { error: 'x' }) : reply(200, LINK)));
  try {
    await m.click('Reset link');
    const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === 'Reset link');
    await act(async () => confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(m.field().value, LINK.url);
    assert.match(m.text(), /Couldn't reset your link just now\. The current one still works\./);
  } finally { await m.close(); }
});

test('every other reply has its own words: not set up, not a coach, signed out, an error with Retry', async () => {
  const cases = [
    [reply(503, { error: "Calendar feed isn't set up yet.", code: 'feed_not_set_up' }), /Calendar feed isn't set up yet\./],
    [reply(403, { error: 'Calendar feeds are for coaches.' }), /Calendar feeds are for coaches\./],
    [reply(401, { error: 'Authentication required.' }), /Sign in again to see your calendar link\./],
    [reply(503, { error: "Couldn't load your calendar link just now." }), /Couldn't load your calendar link just now\./],
    [reply(200, { nope: true }), /Couldn't load your calendar link just now\./],
  ];
  for (const [res, words] of cases) {
    const m = await mountCard(true, () => res);
    try {
      assert.match(m.text(), words);
      assert.equal(m.field().disabled, true);
      assert.ok(!/Loading/.test(m.text()), 'stuck on Loading after a reply');
    } finally { await m.close(); }
  }
  // Retry asks again, and the second answer is used
  let n = 0;
  const m = await mountCard(true, () => (++n === 1 ? reply(500, {}) : reply(200, LINK)));
  try {
    await m.click('Retry');
    assert.equal(m.calls.length, 2);
    assert.equal(m.field().value, LINK.url);
  } finally { await m.close(); }
});

test('an older answer never paints over a newer one', async () => {
  // The first read is slow and answers with the OLD link only after a second read has already
  // shown the new one — the shape of a load still in flight when a reset lands.
  let releaseFirst;
  const first = new Promise((r) => { releaseFirst = r; });
  const m = await mountCard(true, (method, n) => (n === 1 ? first.then(() => reply(200, LINK)) : reply(200, NEW)));
  try {
    assert.equal(m.field().value, '', 'the slow first read has not answered yet');
    await m.render(false);
    await m.render(true);   // a second read starts while the first is still out
    assert.equal(m.field().value, NEW.url);
    releaseFirst();
    await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(m.field().value, NEW.url, 'the stale read painted the old link back');
    assert.equal(m.calls.length, 2);
    // and signed out, no link is on screen whatever the last read said
    await m.render(false);
    assert.equal(m.field().value, '');
    assert.equal(m.link('Add to calendar').hasAttribute('href'), false);
  } finally { await m.close(); }
});
