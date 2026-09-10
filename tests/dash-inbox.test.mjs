// The notifications inbox on the web (review 2026-09-09, R20).
//
// ⚠ `/api/notifications` HAS SHIPPED SINCE THE 2026-05-30 MIGRATION AND THE MOBILE APP
// READS IT; no website surface did. A member could be told on their phone that their
// coach had replied and see nothing on the web. The rules below are all about the bell
// not making claims: an unreadable feed is not "you're all caught up", and a route with
// no website destination is not a link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SHELL = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
const CLIENT_APP = readFileSync(new URL('../public/newdesign/ClientApp.html', import.meta.url), 'utf8');
const CLEAN = stripComments(SHELL);

function grab(name) {
  const at = CLEAN.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let d = 0, seen = false, k = at;
  for (; k < CLEAN.length; k++) { const c = CLEAN[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  return CLEAN.slice(at, k);
}
const ROUTES_SRC = CLEAN.slice(CLEAN.indexOf('const DASH_INBOX_ROUTES'), CLEAN.indexOf('function dashInboxHref'));
const api = (win, shellHref) => new Function('window', 'dashShellHref',
  ROUTES_SRC + '\n' + grab('dashInboxHref') + '\n' + grab('dashInboxShape') + '\n' + grab('dashInboxWhen') +
  '\nreturn { dashInboxHref, dashInboxShape, dashInboxWhen, DASH_INBOX_ROUTES };')(win, shellHref);
const A = api({}, (h) => h);

test('the suite is running the shipped helpers', () => {
  assert.equal(typeof A.dashInboxShape, 'function');
  assert.ok(Object.keys(A.DASH_INBOX_ROUTES).length >= 5, 'the route map lifted as a stub');
});

// ── an unreadable feed is not an empty one ──────────────────────────────────
test('an unreadable response is NULL, never an empty inbox', () => {
  // ⚠ THE MOBILE CLIENT SWALLOWS THIS INTO `{ notifications: [], unread: 0 }` — which on
  // a bell is the positive claim "nothing new". A failed read is not a statement about
  // the member's inbox.
  for (const bad of [null, undefined, {}, { notifications: null }, { notifications: 'x' }, 'boom', 0]) {
    assert.equal(A.dashInboxShape(bad), null, JSON.stringify(bad));
  }
  // a genuinely empty inbox IS an empty inbox
  assert.deepEqual(A.dashInboxShape({ notifications: [], unread: 0 }), { rows: [], unread: 0 });
});

test('unread is recomputed from the rows, so the badge and the list cannot disagree', () => {
  // ⚠ The server sends its own `unread`; trusting it would let an optimistic mark move
  // the list and leave the badge behind.
  const j = { unread: 99, notifications: [
    { id: 'a', title: 'One', read: false, createdAt: '2026-09-10T11:00:00Z' },
    { id: 'b', title: 'Two', read: true, createdAt: '2026-09-10T10:00:00Z' },
  ] };
  assert.equal(A.dashInboxShape(j).unread, 1, 'the server count was taken on trust');
});

test('a malformed row is dropped rather than rendered as a blank line', () => {
  const j = { notifications: [
    { id: 'a', title: 'Real' }, { id: 'b' }, { title: 'no id' }, null, 'x', { id: 7, title: 'num id' },
  ] };
  const out = A.dashInboxShape(j);
  assert.deepEqual(out.rows.map((r) => r.id), ['a']);
  // and the surviving row is normalised, so the panel never reads undefined
  assert.deepEqual(out.rows[0], { id: 'a', type: '', title: 'Real', body: '', route: null, data: {}, read: false, createdAt: null });
});

// ── a route with no destination is not a link ───────────────────────────────
test('every mapped route survives BOTH maps — derived, never hand-listed', () => {
  // ⚠ THE CHAIN IS THE GUARD: a notification's target is a legacy stub filename,
  // `DASH_SHELL_STUBS.client` turns it into a slug, and `CA_ROUTES` is the shell's own
  // table of slugs it will actually render. A rename in EITHER map has to fail here
  // rather than send a member to `#today` silently.
  const at = CLIENT_APP.indexOf('const CA_ROUTES = {');
  assert.ok(at > 0, 'the client shell route table moved');
  const block = CLIENT_APP.slice(at, CLIENT_APP.indexOf('\n};', at));
  const slugs = (block.match(/^\s{2}(\w+):\s*\(\)/gm) || []).map((m) => m.trim().split(':')[0]);
  assert.ok(slugs.length >= 10, 'only ' + slugs.length + ' shell routes parsed');
  const stubsAt = CLEAN.indexOf('const DASH_SHELL_STUBS = {');
  const stubs = new Function('return ' + CLEAN.slice(stubsAt + 'const DASH_SHELL_STUBS = '.length,
    CLEAN.indexOf('\n};', stubsAt) + 2))();
  let checked = 0;
  for (const [key, target] of Object.entries(A.DASH_INBOX_ROUTES)) {
    assert.ok(!/[#?]/.test(target), key + ' targets ' + target + ' — a hash bypasses dashShellHref entirely');
    const slug = stubs.client[target];
    assert.ok(slug, key + ' targets ' + target + ', which DASH_SHELL_STUBS.client does not map');
    assert.ok(slugs.includes(slug), key + ' resolves to #' + slug + ', which the client shell does not have');
    checked += 1;
  }
  assert.ok(checked >= 5, 'the sweep checked nothing');
});

test('a route with no website destination is NOT clickable', () => {
  // ⚠ R18'S OWN RULE, TURNED ON THIS FEATURE: a button that does nothing costs more
  // trust than an absent one. `chat` is the sharp case — the client shell has no
  // messages route at all (the chat is a widget), so a "your coach replied" notice
  // opens nothing rather than opening the wrong page.
  assert.equal(A.dashInboxHref({ route: 'chat' }, 'client'), null);
  assert.equal(A.dashInboxHref({ route: 'invented_2027' }, 'client'), null);
  assert.equal(A.dashInboxHref({ route: null }, 'client'), null);
  assert.equal(A.dashInboxHref({}, 'client'), null);
  assert.equal(A.dashInboxHref(null, 'client'), null);
  // a prototype key must not resolve through Object.prototype
  assert.equal(A.dashInboxHref({ route: 'constructor' }, 'client'), null);
  assert.equal(A.dashInboxHref({ route: 'hasOwnProperty' }, 'client'), null);
  // and the ones that DO map, do
  assert.equal(A.dashInboxHref({ route: 'score' }, 'client'), 'ClientScore.html');
  assert.equal(A.dashInboxHref({ route: 'checkin' }, 'client'), 'ClientDashboard.html');
});

test("a coach's client notice needs an id AND a coach role", () => {
  const n = (data) => ({ route: 'client', data });
  assert.equal(A.dashInboxHref(n({}), 'trainer'), null, 'no client id, but it linked anyway');
  assert.equal(A.dashInboxHref(n({ clientId: 'c1' }), 'client'), null, 'a member was offered a coach route');
  assert.equal(A.dashInboxHref(n({ clientId: 'c1' }), 'trainer'), 'TrainerApp.html#client/c1');
  assert.equal(A.dashInboxHref(n({ client_id: 'c2' }), 'nutritionist'), 'NutritionistApp.html#client/c2');
  // an id is encoded, so one carrying a # or a / cannot rewrite the route
  assert.equal(A.dashInboxHref(n({ clientId: 'a#b/c' }), 'trainer'), 'TrainerApp.html#client/a%23b%2Fc');
  // inside a coach shell it is a hash switch, not a page load
  const inShell = api({ __shapeCoachShell: true }, (h) => h);
  assert.equal(inShell.dashInboxHref(n({ clientId: 'c1' }), 'trainer'), '#client/c1');
});

test('a mapped route goes through dashShellHref, so in-shell it is a hash switch', () => {
  let seen = null;
  const withShell = api({}, (h) => { seen = h; return '#score'; });
  assert.equal(withShell.dashInboxHref({ route: 'score' }, 'client'), '#score');
  assert.equal(seen, 'ClientScore.html', 'the helper was bypassed');
});

// ── the age ─────────────────────────────────────────────────────────────────
test('the age is coarse, and an unparseable one renders as nothing', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const at = (s) => A.dashInboxWhen(new Date(now.getTime() - s * 1000).toISOString(), now);
  assert.equal(at(5), 'just now');
  assert.equal(at(59), 'just now');
  assert.equal(at(60), '1m');
  assert.equal(at(3599), '59m');
  assert.equal(at(3600), '1h');
  assert.equal(at(86399), '23h');
  assert.equal(at(86400), '1d');
  assert.equal(at(6 * 86400), '6d');
  assert.match(at(30 * 86400), /^[A-Za-z]{3} \d{1,2}$/, 'past a week it should be a date');
  for (const bad of [null, undefined, '', 'not-a-date']) assert.equal(A.dashInboxWhen(bad, now), '');
  // a clock skew must not produce a negative age
  assert.equal(A.dashInboxWhen(new Date(now.getTime() + 60000).toISOString(), now), 'just now');
});

// ── the component's contract ────────────────────────────────────────────────
const COMP = CLEAN.slice(CLEAN.indexOf('function DashInbox('), CLEAN.indexOf('function navGroupsFor('));

test('the bell does not exist for a signed-out visitor', () => {
  assert.match(COMP, /if \(!signedIn\) return null;/);
  assert.match(COMP, /if \(!signedIn\) \{ setFeed\(undefined\); return undefined; \}/,
    'signing out leaves the previous account\'s notifications in the panel');
});

test('the panel has FOUR states and the unreadable one says so', () => {
  // ⚠ AN UNREADABLE FEED MUST NOT RENDER AS "you're all caught up" — that is a claim
  // about the member's inbox made from a failure to read it.
  assert.match(COMP, /feed === undefined \? \(/);
  assert.match(COMP, /\) : feed === null \? \(/);
  assert.match(COMP, /Couldn't read your notifications just now/);
  assert.match(COMP, /\) : rows\.length === 0 \? \(/);
  assert.match(COMP, /Nothing new\./);
});

test('marking read is optimistic AND rolls back', () => {
  // ⚠ A BELL THAT CLEARS ITSELF ON A WRITE THAT FAILED tells a member they have seen
  // something they have not, and the row is gone from the list to prove it.
  const m = COMP.slice(COMP.indexOf('const mark ='), COMP.indexOf('const markAll ='));
  assert.match(m, /const before = feed;/);
  assert.match(m, /setFeed\(applyLocal\(feed\)\);/);
  assert.match(m, /if \(!r\.ok\) setFeed\(before\);/, 'a rejected write is not rolled back');
  assert.match(m, /\.catch\(\(\) => setFeed\(before\)\)/, 'a network failure is not rolled back');
  // and the badge follows the rows rather than being decremented separately
  assert.match(COMP, /unread: next\.filter\(\(r\) => !r\.read\)\.length/);
});

test('the bell is mounted in the shared header, signed-in only', () => {
  assert.match(CLEAN, /<DashInbox signedIn=\{!!authUser\} role=\{authUser && authUser\.role\} \/>/);
  // ⚠ IN THIS FILE, NOT A NEW MODULE: pageShell is the chrome every newdesign page
  // already loads, so there is no script tag to add to 69 files and no load order to get
  // wrong. A new module would fail this.
  assert.ok(!/dashInbox\.jsx/.test(readFileSync(new URL('../public/newdesign/ClientApp.html', import.meta.url), 'utf8')),
    'the inbox became its own module — every page now needs a script tag');
  assert.match(CLEAN, /function DashInbox\(\{ signedIn, role \}\)/);
});

test('the tap target clears the documented 24px floor', () => {
  // This repo's own WCAG 2.5.8 AA floor, recorded 2026-09-02.
  assert.match(COMP, /minHeight: 30, minWidth: 30/);
});
