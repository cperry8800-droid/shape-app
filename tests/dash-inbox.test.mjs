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

// ⚠ THE BODY STARTS AFTER THE PARAMETER LIST, AND THIS DID NOT. Counting braces from
// `function NAME(` makes a DESTRUCTURED parameter — `function DashInbox({ signedIn })` —
// open and close the count on its own, so `grab` returned the 44-character signature and
// nothing else. Every assertion made against it was vacuously true: a mutation that put
// a second `fetch` back inside the component SURVIVED, because the guard was reading a
// string that could not contain one. Caught by the mutation round, not by reading.
// Skip to the `)` that closes the parameters first; the body's `{` is the next one.
function grab(name) {
  const at = CLEAN.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let p = 0, k = CLEAN.indexOf('(', at);
  for (; k < CLEAN.length; k++) { const c = CLEAN[k]; if (c === '(') p++; else if (c === ')') { p--; if (!p) { k++; break; } } }
  let d = 0, seen = false;
  for (; k < CLEAN.length; k++) { const c = CLEAN[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  const body = CLEAN.slice(at, k);
  // A signature with no body is the failure above, silently.
  assert.ok(body.length > name.length + 40 && /\{[\s\S]*\breturn\b|\{[\s\S]{40,}/.test(body),
    'grab(' + name + ') returned ' + body.length + ' chars — it stopped at the parameter list');
  return body;
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
  // ⚠ RE-ANCHORED when the feed was lifted into `useDashInboxFeed` so two render sites
  // could share one read: the reset lives in the hook now and the render gate in the
  // component. Pinning both spellings in one blob failed the correct refactor — the
  // third time this suite has had to learn that a guard pins the invariant, not the
  // address. What is asserted is that BOTH still happen, wherever they live.
  assert.match(COMP, /if \(!signedIn[^)]*\) return null;/, 'the bell renders for a signed-out visitor');
  // ⚠ NOT THE WHOLE LINE. This pinned the exact statement, so adding the generation bump
  // that CANCELS a read still in flight — a strictly stronger version of the same
  // guarantee — failed the guard for it. Twice now, in this one test. Assert the two
  // things the sign-out actually owes.
  const signOut = /if \(!signedIn\) \{([^}]*)\}/.exec(grab('useDashInboxFeed'));
  assert.ok(signOut, 'the hook no longer branches on signing out');
  assert.match(signOut[1], /setFeed\(undefined\)/, 'signing out leaves the previous account\'s notifications in the panel');
  assert.match(signOut[1], /genRef\.current\+\+/, 'a read in flight can still land after the sign-out');
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
  // ⚠ `mark` lives in the hook now, not the component — see the note above.
  const HOOK = grab('useDashInboxFeed');
  const m = HOOK.slice(HOOK.indexOf('const mark ='), HOOK.indexOf('return {'));
  assert.match(m, /const before = feed;/);
  assert.match(m, /setFeed\(applyLocal\(feed\)\);/);
  assert.match(m, /if \(!r\.ok\) setFeed\(before\);/, 'a rejected write is not rolled back');
  assert.match(m, /\.catch\(\(\) => setFeed\(before\)\)/, 'a network failure is not rolled back');
  // and the badge follows the rows rather than being decremented separately
  assert.match(HOOK, /unread: next\.filter\(\(r\) => !r\.read\)\.length/);
});

test('the bell is mounted in the shared header, signed-in only', () => {
  // ⚠ NOT A SPELLING. This pinned one exact JSX string, so adding the SECOND render site
  // — the whole fix for a bell no phone could reach — failed a test about module layout.
  for (const site of CLEAN.match(/<DashInbox[^/]*\/>/g) || []) {
    assert.match(site, /signedIn=\{!!authUser\}/, 'a bell renders without the signed-in gate: ' + site);
    assert.match(site, /role=\{authUser && authUser\.role\}/, 'a bell renders without a role: ' + site);
  }
  // ⚠ IN THIS FILE, NOT A NEW MODULE: pageShell is the chrome every newdesign page
  // already loads, so there is no script tag to add to 69 files and no load order to get
  // wrong. A new module would fail this.
  assert.ok(!/dashInbox\.jsx/.test(readFileSync(new URL('../public/newdesign/ClientApp.html', import.meta.url), 'utf8')),
    'the inbox became its own module — every page now needs a script tag');
  assert.match(CLEAN, /function DashInbox\(\{[^}]*signedIn[^}]*\}\)/);
});

test('the tap target clears the documented 24px floor', () => {
  // This repo's own WCAG 2.5.8 AA floor, recorded 2026-09-02.
  assert.match(COMP, /minHeight: 30, minWidth: 30/);
});

// ── THE BELL HAS TO BE REACHABLE, AND ON A PHONE IT WAS NOT ─────────────────
// The first cut rendered the bell inside `.shape-nav-auth`, which every collapsed
// breakpoint hides outright. Measured in a browser: a 33×30 box at 1440px and a
// ZERO-SIZED one at 1024 and 390 — present in the DOM, painting nothing, unreachable on
// every phone, tablet and narrow laptop. R20 is about a member seeing on the web what
// their phone already told them, so a bell a phone cannot reach is the feature not
// shipping.
test('every breakpoint that hides the auth cluster shows the mobile bell', () => {
  // Derived from the source: a breakpoint added later is covered without anyone
  // remembering this test exists.
  const blocks = SHELL.split(/@media\s*\(max-width:\s*\d+px\)\s*\{/).slice(1);
  const hiding = blocks.filter((b) => /\.shape-nav-auth\s*\{[^}]*display:\s*none/.test(b));
  assert.ok(hiding.length >= 2, 'expected the collapsed-header breakpoints, found ' + hiding.length);
  for (const b of hiding) {
    assert.match(b, /\.shape-nav-bell\s*\{[^}]*display:\s*inline-flex/,
      'a breakpoint hides .shape-nav-auth without showing .shape-nav-bell — the bell is invisible there');
  }
});

test('the two bell render sites share ONE feed, so they cannot disagree', () => {
  // Two <DashInbox> in the header; both take `inbox`, and the fetch lives in the hook.
  const sites = CLEAN.match(/<DashInbox[^/]*\/>/g) || [];
  assert.equal(sites.length, 2, 'expected exactly two render sites, got ' + sites.length);
  for (const s of sites) assert.match(s, /inbox=\{inbox\}/, 'a bell renders without the shared feed: ' + s);
  // The fetch must NOT be inside the component — that is what a second copy would spend.
  assert.ok(!/fetch\("\/api\/notifications"/.test(grab('DashInbox')), 'DashInbox fetches its own feed again');
  assert.match(grab('useDashInboxFeed'), /fetch\("\/api\/notifications"/, 'the hook stopped owning the read');
  assert.equal((CLEAN.match(/useDashInboxFeed\(/g) || []).length, 2, 'the hook is declared once and called once');
});

// ── the panel is anchored to the bell, and on a phone the bell is not at the edge ──
const PANEL = new Function(
  'const DASH_INBOX_W = ' + /const DASH_INBOX_W = (\d+)/.exec(CLEAN)[1] + ';' +
  'const DASH_INBOX_GUTTER = ' + /const DASH_INBOX_GUTTER = (\d+)/.exec(CLEAN)[1] + ';' +
  grab('dashInboxPanelBox') + '\nreturn dashInboxPanelBox;')();

test('the panel is fully on screen at every width — driven, not asserted about CSS', () => {
  // ⚠ LEFT OVERFLOW CREATES NO SCROLLBAR, so the defect this closes was silent: at 390px
  // the panel started at −33 and at 360 at −51, clipping the first third of every row
  // with nothing on screen saying so. `maxWidth: calc(100vw - Npx)` cannot fix it — that
  // caps the WIDTH while the RIGHT edge stays pinned to the bell.
  const G = Number(/const DASH_INBOX_GUTTER = (\d+)/.exec(CLEAN)[1]);
  for (const vw of [320, 360, 375, 390, 414, 600, 700, 768, 900, 1024, 1200, 1440, 1920]) {
    // The bell sits ~83px in from the right edge on a collapsed header (the burger plus
    // the flex gap), and hard against the auth cluster on a wide one.
    for (const inset of [0, 12, 46, 83, 140]) {
      const bellRight = vw - inset;
      const b = PANEL(bellRight, vw);
      assert.ok(b.left >= G - 1, `vw=${vw} inset=${inset}: left ${b.left} is inside the gutter`);
      assert.ok(b.viewRight <= vw - G + 1, `vw=${vw} inset=${inset}: right ${b.viewRight} past ${vw - G}`);
      assert.ok(b.w > 0 && b.w <= 340, `vw=${vw} inset=${inset}: width ${b.w}`);
    }
  }
});

test('a desktop bell keeps the plain right-aligned panel it always had', () => {
  // The offset must be a no-op wherever there is room: this is a fix for narrow
  // viewports, not a re-layout of the desktop header.
  assert.equal(PANEL(967, 1440).right, 0);
  assert.equal(PANEL(967, 1440).w, 340);
  // ...and it must NOT be a no-op where there is not.
  assert.ok(PANEL(307, 390).right < 0, 'a phone bell still right-aligns the panel off screen');
});

// ── THE THREE FINDINGS FROM THE REVIEW ROUND ───────────────────────────────
// Codex and CodeRabbit each raised all three independently; each is a way the bell
// made a claim it had not earned.

const ROUTE = readFileSync(new URL('../src/app/api/notifications/route.ts', import.meta.url), 'utf8');

test('the ROUTE distinguishes a failed read from an empty inbox', () => {
  // ⚠ IT RETURNED HTTP 200 WITH `{ notifications: [], unread: 0 }` ON A QUERY ERROR —
  // the positive claim "nothing new" made out of a read that never answered. The panel's
  // whole "couldn't read your notifications" state was therefore UNREACHABLE for the
  // most likely failure there is, while this suite and the records both claimed it was
  // handled. Fixing the client alone would have left the lie one layer down.
  const g = ROUTE.slice(ROUTE.indexOf('export async function GET'), ROUTE.indexOf('export async function POST'));
  const err = /if \(error\) return NextResponse\.json\(([^;]*)\);/.exec(g);
  assert.ok(err, 'the GET no longer has an explicit error branch');
  assert.doesNotMatch(err[1], /notifications:\s*\[\]/, 'a failed read still answers with an empty inbox');
  assert.match(err[1], /status:\s*5\d\d/, 'a failed read still answers 2xx');
  // and the client turns a non-OK into the unreadable state rather than parsing it
  assert.match(grab('useDashInboxFeed'), /r\.ok \? r\.json\(\) : null/);
});

test('opening the panel re-reads the feed', () => {
  // ⚠ THE READ RAN ONCE PER HEADER MOUNT. A notification arriving while a member stayed
  // on one dashboard tab never reached the badge until they reloaded the page — and a
  // dashboard is a page people leave open all day.
  const hook = grab('useDashInboxFeed');
  assert.match(hook, /reload:\s*\(\) => \{ if \(!busy\) load\(true\); \}/, 'the hook exposes no reload, or reloads mid-write');
  assert.match(grab('DashInbox'), /if \(!v && typeof reload === "function"\) reload\(\)/,
    'opening the panel does not re-read');
  // ⚠ AND A FAILED REFRESH MUST NOT DISCARD A GOOD FEED. "possibly a minute old" and
  // "we have nothing" are different claims.
  assert.match(hook, /if \(next === null && keepOnFail\) return;/);
  assert.match(hook, /load\(false\)/, 'the first read keeps a stale feed on failure');
  // one writer wins: a generation, not a per-call boolean
  assert.match(hook, /const gen = \+\+genRef\.current;/);
  assert.match(hook, /if \(gen !== genRef\.current\) return;/);
  assert.match(hook, /if \(!signedIn\) \{ genRef\.current\+\+;/, 'signing out does not cancel a read in flight');
});

test('a mark that rides a navigation uses keepalive', () => {
  // ⚠ OUTSIDE A SHELL THESE LINKS ARE A REAL DOCUMENT NAVIGATION, and a POST started in
  // the same tick is cancelled on unload — so the row the member had just opened stayed
  // unread and the badge went on claiming it.
  const hook = grab('useDashInboxFeed');
  assert.match(hook, /const mark = \(body, applyLocal, keepalive\) =>/);
  assert.match(hook, /keepalive: !!keepalive/);
  assert.match(hook, /markOne: \(id, keepalive\) =>[\s\S]*?\}, keepalive\)/);
  // the LINK row passes it; the plain "Mark read" button, which navigates nowhere, does not
  const comp = grab('DashInbox');
  // ⚠ NEITHER `[^>]*` NOR A LAZY `[\s\S]*?>` CAN DELIMIT A JSX OPENING TAG: both stop at
  // the `>` of the `=>` inside the first arrow function, so the first TWO spellings of
  // this assertion failed on correct code (the second matched exactly
  // `<a key={n.id} href={href} onClick={() =>`). Take the element to a terminator that
  // is actually unique to it.
  const at = comp.indexOf('<a key={n.id} href={href}');
  assert.ok(at > 0, 'the link row changed shape');
  const end = comp.indexOf('>{inner}</a>', at);
  assert.ok(end > at, 'the link row no longer renders {inner}');
  assert.match(comp.slice(at, end), /markOne\(n\.id, true\)/, 'the link row does not keep its write alive');
  assert.match(comp, /<button onClick=\{\(\) => markOne\(n\.id\)\}/, 'the in-panel Mark read button changed shape');
  // ⚠ markAll IS NOT keepalive: it is pressed inside an open panel, which navigates
  // nowhere, and a keepalive request cannot be aborted.
  assert.doesNotMatch(hook, /markAll:[^\n]*keepalive/);
});
