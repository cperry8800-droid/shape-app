// The community feed lives in the chat bubble's Feed tab.
//
// ⚠ IT SHIPPED AS A DASHBOARD PAGE AND IS NOT ONE. `dashboardCommunity.jsx` sat
// behind a Community tab on all three dashboards, beside a bubble that already
// carried Team / Channels / Help — so the website split the app's ONE Chat page
// across two surfaces. The app's Chat is four segments (Feed / Team / Channels /
// Support) and the Wall is a CHIP INSIDE Feed (#2036: "don't need 2 wall tabs").
// The feed moved into the bubble and the page went.
//
// Everything here guards a way that move can silently half-undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

const ND = 'public/newdesign';
const read = (f) => readFileSync(path.join(ND, f), 'utf8');
const WIDGET = read('chatWidget.jsx');
const FEED = read('communityFeed.jsx');
const BUTTON = read('globalChatButton.js');
const APP = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');

// Lift a function body out of source and make it callable. ⚠ IT SKIPS THE
// PARAMETER LIST — counting braces from the first `{` after the name opens and
// closes on a destructured parameter and hands back the SIGNATURE, after which
// every assertion against it is vacuously true. The length floor surfaces that.
function lift(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone — re-anchor this guard`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const body = src.slice(at, i + 1);
  assert.ok(body.length > 120, `${name} lifted only ${body.length} chars — the matcher read a signature`);
  return body;
}

test('every page that loads the bubble also loads the feed, and loads it FIRST', () => {
  // ⚠ ORDER, NOT MERE PRESENCE. The widget decides whether to render its Feed
  // tab by reading window.CommunityFeed AT FIRST RENDER. Loaded after, the
  // module arrives too late and the tab is silently missing.
  const pages = readdirSync(ND).filter((f) => f.endsWith('.html'));
  const hosts = pages.filter((f) => read(f).includes('chatWidget.jsx'));
  // A sweep that stopped matching passes vacuously on zero hosts.
  assert.ok(hosts.length >= 30, 'read only ' + hosts.length + ' widget hosts — the sweep stopped matching');
  const missing = [], misordered = [];
  for (const f of hosts) {
    const src = read(f);
    if (!src.includes('communityFeed.jsx')) { missing.push(f); continue; }
    if (src.indexOf('communityFeed.jsx') > src.indexOf('chatWidget.jsx')) misordered.push(f);
  }
  assert.deepEqual(missing, [], 'pages load the chat bubble without the feed module');
  assert.deepEqual(misordered, [], 'pages load the feed module AFTER the widget that reads it');
});

test('the lazy boot loads the feed before the widget, in BOTH of its lists', () => {
  // globalChatButton.js boots the bubble two ways — a precompiled path and a
  // raw-babel one — each with its own hardcoded script list. Updating one and
  // not the other gives half the site a Feed tab and the other half none.
  const lists = BUTTON.match(/\[[^\]]*chatWidget\.jsx[^\]]*\]/g) || [];
  assert.equal(lists.length, 2, 'expected the two boot lists, found ' + lists.length);
  for (const l of lists) {
    assert.ok(l.includes('communityFeed'), 'a boot list omits communityFeed: ' + l);
    assert.ok(l.indexOf('communityFeed') < l.indexOf('chatWidget'),
      'a boot list loads communityFeed AFTER chatWidget: ' + l);
  }
});

test("every module the precompiled boot asks for is in the pages' manifest", () => {
  // ⚠ window.__ndCompiled IS DERIVED FROM THE PAGES, NOT WRITTEN BY HAND.
  // scripts/build-newdesign.mjs builds it out of the `<script type="text/babel"
  // src="…jsx">` tags it finds across public/newdesign/*.html — so a module NO
  // page references has no entry at all. `map[name]` is then undefined,
  // bootCompiledChat sets `sc.src = undefined`, the browser fetches a file
  // literally called "undefined", 404s, and onerror drops the member into the
  // plain fallback panel. The rich bubble never opens on ANY page that
  // lazy-boots, and nothing fails anywhere a build or a suite would see it.
  //
  // ⚠ BOTH HALVES ARE DERIVED. Naming the four modules here would let the ask
  // and the manifest drift apart with this still green, which is the whole
  // failure being guarded.
  const boot = /function bootCompiledChat\(\)\s*\{[\s\S]*?\n  \}/.exec(stripComments(BUTTON));
  assert.ok(boot, 'bootCompiledChat no longer has the shape this reads — re-anchor the guard');
  const decl = /var names\s*=\s*\[([^\]]*)\]/.exec(boot[0]);
  assert.ok(decl, 'bootCompiledChat no longer declares a `names` array');
  const names = (decl[1].match(/"([^"]+)"/g) || []).map((q) => q.slice(1, -1));
  assert.ok(names.length >= 3 && names.includes('chatWidget.jsx'),
    'read only ' + names.length + ' boot modules — the parse stopped matching');

  // The precompile's own two regexes, so this asks the question the build
  // answers rather than a paraphrase of it.
  const BABEL_TAG = /<script\s+type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g;
  const manifest = new Set();
  for (const f of readdirSync(ND).filter((n) => n.endsWith('.html'))) {
    for (const m of read(f).matchAll(BABEL_TAG)) {
      const src = /src="([^"?]+)(?:\?[^"]*)?"/.exec(m[1]);
      if (src) manifest.add(src[1]);
    }
  }
  assert.ok(manifest.size >= 50,
    'read only ' + manifest.size + ' compiled modules — the sweep stopped matching');

  const orphans = names.filter((n) => !manifest.has(n));
  assert.deepEqual(orphans, [],
    'bootCompiledChat asks window.__ndCompiled for a module no page references, so it gets no ' +
    'manifest entry, its script src is `undefined`, and the rich bubble falls back to the plain panel');
});

test('the Feed tab is gated on the module being present', () => {
  // ⚠ THERE IS NO ERROR BOUNDARY ANYWHERE IN public/newdesign. A tab whose body
  // renders an undefined component throws a ReferenceError and blanks the whole
  // page. Absent module → no tab is a missing feature; ungated is a broken site.
  assert.match(WIDGET, /typeof window\.CommunityFeed === "function"/,
    'the widget no longer checks that the feed module is loaded');
  assert.match(WIDGET, /feedReady \? FEED_TABS\.concat/,
    'the feed places are no longer gated on feedReady');
});

test('the thread pane is hidden, never unmounted, while the Feed tab is up', () => {
  // That subtree owns the message poll, every open thread's draft text and its
  // scroll position. Unmounting on a tab switch drops an unsent draft.
  assert.match(WIDGET, /display: currentTab\.feed \? "none" : "grid"/,
    'the thread grid is no longer hidden-not-unmounted behind the Feed tab');
});

test('the bubble draws no chip row, and still stamps the app\'s Wall channel', () => {
  // ⚠ THE CHIPS ARE GONE — owner, on a screenshot of them: "dont need client and
  // community tabs here in chat bubble, already have them in chat bubble,
  // repetitive." The bubble carries those audiences as TABS (Clients, Channels);
  // the app's Chat does not, which is why it can afford the chips and this
  // surface cannot. Re-adding them is the regression this bans.
  const s = stripComments(FEED);
  // ⚠ THE BAN IS ON THE CONTROL, NOT ON CHANNEL AWARENESS. `cfChannelOf` is
  // back and must be — see the scope test below; banning it outright was the
  // first version of this guard and it would have failed the correct fix.
  assert.doesNotMatch(s, /function CF_CHIP_(KEYS|LABEL)\b/, 'the chip row came back');
  assert.doesNotMatch(s, /setFilter\(/, 'the feed grew a channel picker again');
  assert.doesNotMatch(s, /aria-pressed=\{on\}[^\n]*setFilter/, 'the chip buttons came back');

  // ⚠ AND THE WRITE SIDE MUST SURVIVE THE REMOVAL, which is the half that is
  // easy to lose: the APP still files a post by its channel, and a post
  // published from here with none falls back to the AUTHOR'S ROLE and lands on
  // the app's Client chip instead of its Wall. The app labels the COMMUNITY key
  // "Wall" and the SHAPE key "Community" — a deliberate swap — so this asserts
  // the app STILL does it rather than pinning our own spelling of the stamp.
  assert.match(APP, /k === 'COMMUNITY' \? tr\('feed:tab\.wall'/,
    "the app no longer labels the COMMUNITY key 'Wall' — re-derive CF_POST_CHANNEL");
  assert.match(s, /const CF_POST_CHANNEL = "COMMUNITY";/,
    'the feed no longer stamps the app\'s Wall channel on a post made here');
});

// ── The Codex round on 5b5fc1b: two findings, each replayed as its own guard ──

test('dropping the chip row did not widen who sees the peer channels', () => {
  // ⚠ P1, VERIFIED AT THE SOURCE. `/api/community/feed` applies NO channel
  // predicate — it filters `privacy`, plus `author_id` in `following` mode, then
  // LIMIT 50 — so the chip row was the ONLY thing scoping channels here. Both
  // halves are asserted from their own files, so the day either moves this fails
  // rather than the boundary quietly reopening.
  const route = readFileSync('src/app/api/community/feed/route.ts', 'utf8');
  const q = /let query = client[\s\S]*?\.limit\(50\);/.exec(stripComments(route));
  assert.ok(q, 'the feed query moved — re-derive this guard');
  assert.doesNotMatch(q[0], /channel/i,
    'the feed route now scopes channels itself — re-derive the web scope');
  // ⚠ THE APP'S OWN ENFORCEMENT, NOT ITS COMMENT. A first cut matched the
  // sentence "TRAINER/NUTRI/CLIENT = that role's peers only" — against a
  // comment-STRIPPED copy, so it could never match at all. What makes the
  // channels peers-only is the code: the chip list offers the viewer exactly
  // ONE role channel, their own, and the feed is filtered to the chip.
  const app = stripComments(APP);
  assert.match(app, /const CHIP_KEYS = \['COMMUNITY', myRoleChip, 'SHAPE'\];/,
    'the app changed which channels it offers — re-derive the web scope');
  assert.match(app, /\.filter\(p => p\.kind === filter\)/,
    'the app no longer scopes its feed to the selected channel — re-derive the web scope');

  // The shipped scope, driven rather than read.
  // ⚠ THE CHANNEL LIST IS READ AS DATA, NOT RESTATED — `cfChannelOf` closes
  // over it, and a copy written here would let the two drift with the guard
  // green.
  const known = /const CF_KNOWN_CHANNELS = (\[[^\]]*\]);/.exec(stripComments(FEED));
  assert.ok(known, 'CF_KNOWN_CHANNELS moved — re-anchor this guard');
  const scope = {};
  new Function('S', `
    const CF_KNOWN_CHANNELS = ${known[1]};
    ${lift(FEED, 'cfKindOfRole')}
    ${lift(FEED, 'cfChannelOf')}
    ${lift(FEED, 'cfFeedScope')}
    S.of = cfChannelOf; S.scope = cfFeedScope;
  `)(scope);
  assert.ok(scope.scope('client').length >= 3, 'the scope parsed empty — this would pass on nothing');
  const seen = (role, p) => scope.scope(role).indexOf(scope.of(p)) >= 0;

  // A client never reaches a trainer- or nutritionist-peer post, by channel or
  // by the author's-role fallback.
  for (const ch of ['TRAINER', 'NUTRI']) {
    assert.equal(seen('client', { channel: ch }), false, `a client can see the ${ch} peer channel`);
  }
  assert.equal(seen('client', { role: 'Head trainer · Tempo' }), false,
    "a client can see a trainer's pre-channel post through the role fallback");
  assert.equal(seen('client', { role: 'Nutritionist' }), false,
    "a client can see a nutritionist's pre-channel post through the role fallback");
  // And a trainer reaches their own peers but not the nutritionists'.
  assert.equal(seen('trainer', { channel: 'TRAINER' }), true, 'a trainer lost their own peer channel');
  assert.equal(seen('trainer', { channel: 'NUTRI' }), false, 'a trainer can see the nutritionist peer channel');
  // Everyone keeps the two the demo board is made of.
  for (const role of ['client', 'trainer', 'nutritionist']) {
    assert.equal(seen(role, { channel: 'COMMUNITY' }), true, `${role} lost the Wall`);
    assert.equal(seen(role, { channel: 'SHAPE' }), true, `${role} lost the members' notes`);
  }

  // ⚠ AND THE PAGE ACTUALLY APPLIES IT. Everything above proves the RULE is
  // right and says nothing about whether the render goes through it — the
  // mutation that deletes the filter from the component left all of it green.
  // That is the rule-nobody-calls defect this repo keeps paying for.
  const feedSrc = stripComments(FEED);
  const vis = /const visible = feed\.filter\(([\s\S]*?)\n            \}\);/.exec(feedSrc);
  assert.ok(vis, "the feed's visible filter moved — re-anchor this guard");
  assert.match(vis[1], /cfChannelOf\(/, "the rendered feed no longer derives a post's channel");
  assert.match(feedSrc, /const scope = cfFeedScope\(myRole\);/, 'the rendered feed no longer scopes by role');
});

test('every web-originated feed write carries the channel, reposts included', () => {
  // ⚠ P2. `onRepost` is the OTHER create path and it sent no channel, so the
  // app's mapper fell back to the reposter's ROLE and filed it under
  // Client/Trainer/Nutri instead of the Wall. Pre-existing — and this PR is what
  // made `CF_POST_CHANNEL` the file's write-side invariant, so it owns it.
  // ⚠ BOTH QUOTE STYLES. The repost writes `fetch("...")` and the composer's
  // create writes `fetch('...')` — a double-quoted-only sweep found ONE of the
  // two and its vacuity floor is what said so, rather than the assertion below
  // passing on a corpus of one.
  const s = stripComments(FEED);
  // ⚠ THE WINDOW REACHES BACKWARDS TOO, because the two creates assemble their
  // payload differently: the repost inlines the metrics literal in the call, and
  // the composer's create builds a `metrics` object in the lines ABOVE it. A
  // forward-only window saw the first and reported the second as unstamped.
  const hits = [...s.matchAll(/fetch\(['"]\/api\/community\/feed['"]/g)]
    .map((m) => s.slice(Math.max(0, m.index - 1200), m.index + 1400));
  assert.ok(hits.length >= 3,
    `found ${hits.length} calls to /api/community/feed — the read stopped matching`);
  // ⚠ CREATES ONLY. The PATCH is an EDIT of a post that already has a channel;
  // stamping one there would rewrite where an existing post lives.
  // ⚠ A MISSING `method` IS A GET, NOT A BROKEN READ. The feed's own fetch names
  // none — a first cut asserted every call named one and failed on it, which is
  // a guard reporting on itself.
  // The verb is read from the call itself — the 1200 chars of preamble can
  // legitimately contain another request's method.
  const verb = (b) => {
    const at = b.search(/fetch\(['"]\/api\/community\/feed['"]/);
    return (/method: ['"]([A-Z]+)['"]/.exec(b.slice(at)) || [, 'GET'])[1];
  };
  const verbs = hits.map(verb);
  assert.ok(verbs.includes('GET') && verbs.includes('PATCH'),
    `the feed's calls read as ${verbs.join('/')} — the read stopped matching`);
  const creates = hits.filter((b) => verb(b) === 'POST');
  assert.ok(creates.length >= 2,
    `found ${creates.length} POST creates — the read stopped matching, so this passes on nothing`);
  // ⚠ THE CHANNEL MUST BE ON THE METRICS PAYLOAD THIS CALL SENDS, not merely
  // somewhere in the window. A window-wide match was satisfied for the
  // composer's create by the OPTIMISTIC ROW's own stamp thirteen lines above
  // it, so deleting `metrics.channel = …` left the guard green — it was
  // measuring a different occurrence of the same string.
  for (const b of creates) {
    const call = b.slice(b.search(/fetch\(['"]\/api\/community\/feed['"]/));
    const m = /metrics: ([^\n]*)/.exec(call);
    assert.ok(m, 'a POST to the feed sends no metrics — the read stopped matching');
    const expr = m[1].trim();
    if (expr.startsWith('{')) {
      assert.match(expr, /channel: CF_POST_CHANNEL/,
        'an inline metrics payload does not stamp the channel: ' + expr.slice(0, 160));
    } else {
      // A named payload assembled above the call: at least one identifier in
      // the expression must be the object the channel was written onto.
      const ids = [...expr.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((x) => x[1])
        .filter((n) => !['Object', 'keys', 'length', 'undefined', 'null'].includes(n));
      assert.ok(ids.length, 'the metrics expression named nothing — the read stopped matching');
      // The composer stamps the PLACE's channel (owner, 2026-11-10: match the app's places);
      // `postChannel` is asserted below to be derived from the place and the role.
      const stamped = ids.some((n) => b.includes(`${n}.channel = CF_POST_CHANNEL`) || b.includes(`${n}.channel = postChannel`));
      assert.ok(stamped,
        `the metrics payload (${expr.slice(0, 80)}) is never stamped with the channel`);
    }
  }
});

test('the feed reads the channel from metrics, not from a column', () => {
  // ⚠ `channel` IS NOT A COLUMN on community_posts — the app stashes it in the
  // metrics jsonb (shapeBackend.js). Reading p.channel off the raw API row
  // returns undefined for every post and the Wall renders empty, with nothing
  // failing anywhere.
  assert.match(FEED, /channel: \(typeof m\.channel === 'string'/,
    'the feed no longer lifts the channel out of metrics');
  // \u26a0 SCOPED TO THE MAPPER. What must never happen is the MAPPER reading
  // `channel` off the raw API row; a mapped post carrying the field the mapper
  // lifted is exactly the shape the rest of the file is entitled to read.
  // \u26a0 COMMENTS STRIPPED FIRST. The rationale comment inside the mapper quotes
  // `p.channel` to explain why it is NOT read — so the guard was failing on the
  // very sentence documenting the thing it checks.
  const mapper = /const mapPost = \(p, uid\) => \{[\s\S]*?\n    \};/.exec(stripComments(FEED));
  assert.ok(mapper, 'mapPost no longer has the shape this reads — re-anchor the guard');
  assert.doesNotMatch(mapper[0], /\bp\.channel\b/,
    'mapPost reads p.channel off the raw row, which community_posts does not carry');
});

test('the feed carries no dashboard globals', () => {
  // It renders inside a bubble that mounts on pages loading no dashboard module
  // at all. `Card` and `Pill` were file-scope declarations in
  // trainerDashboard.jsx — and `Pill` is declared TWICE in this directory with
  // different defaults, so which one it got was a property of tag order.
  //
  // ⚠ COMMENTS STRIPPED FIRST. This is a ban on what the feed RENDERS, and a
  // comment naming the tag is a mention, not a render — so the raw-source form
  // failed on the very sentence documenting why the local Pill is kept. That is
  // the same defect the mapper's `p.channel` guard below was fixed for, in the
  // same file: a guard that fires on its own rationale is measuring the prose.
  const rendered = stripComments(FEED);
  assert.doesNotMatch(rendered, /<Card[\s>]/, 'the feed renders the dashboard-global Card');
  assert.doesNotMatch(rendered, /<Pill[\s>]/, 'the feed renders the dashboard-global Pill');
  assert.match(FEED, /function CfCard\(/, 'the feed lost its local Card');
  assert.match(FEED, /function CfPill\(/, 'the feed lost its local Pill');
});

test('the Community tab is gone from all three dashboards', () => {
  for (const f of ['ClientCommunity.html', 'TrainerCommunity.html', 'NutritionistCommunity.html']) {
    assert.ok(!readdirSync(ND).includes(f), f + ' came back');
  }
  assert.doesNotMatch(read('clientNav.jsx'), /slug: "community"/, 'the client nav still carries Community');
  assert.doesNotMatch(read('coachNav.jsx'), /slug: "community"/, 'a coach nav still carries Community');
  for (const shell of ['ClientApp.html', 'TrainerApp.html', 'NutritionistApp.html']) {
    assert.doesNotMatch(read(shell), /community: \(\) =>/, shell + ' still routes #community');
  }
});

// ── The Codex round on this change: three P1s, each replayed as its own guard ──
// Every one was a defect the move INTRODUCED, so each is pinned here rather than
// left to be green-after-the-fix.

test('an optimistic post carries the chip it was posted from', () => {
  // ⚠ P1. The channel was stamped only onto the REQUEST. The optimistic row had
  // none, so cfChannelOf fell back to the author's role — which here is the
  // hardcoded ME.role tier string ("Hypertrophy · 2,140") and resolves to CLIENT.
  // A post made on the Wall vanished the instant it was published.
  const s = stripComments(FEED);
  const insert = /setFeed\(prev => \[\{ id: optimisticId[^\]]*\]\);/.exec(s);
  assert.ok(insert, 'the optimistic insert no longer has the shape this reads');
  assert.match(insert[0], /channel: postChannel/, 'the optimistic row does not carry its channel');
  // AFTER the `...post` spread, or a composer that ever grows a channel key
  // silently outranks it.
  assert.ok(insert[0].indexOf('...post') < insert[0].indexOf('channel: postChannel'),
    'channel is spread before ...post, so it can be overridden');
});

test('posting is gated on a MEASURED signed-in, and a refused post rolls back', () => {
  const s = stripComments(FEED);
  // Three states: null unknown / false signed out / true signed in. `!signedIn`
  // would disable posting for a signed-in member for as long as the read takes.
  assert.match(s, /disabled=\{signedIn !== true( \|\| roleUnsure)?\}/, 'the composer is no longer gated on a measured signed-in');
  assert.match(s, /setSignedIn\(signedIn\)/, 'the loader no longer publishes the auth state');
  // ⚠ THE ROLLBACK IS THE HALF THAT SURVIVES A RACE. The gate makes the
  // signed-out case unreachable; this covers every other refusal, and the arm it
  // replaced returned early for EVERY non-milestone post.
  assert.match(s, /if \(!r \|\| !r\.ok\) \{ setFeed\(prev => prev\.filter\(x => x\.id !== optimisticId\)\); return; \}/,
    'a refused post is no longer rolled back');
  assert.match(s, /\.catch\(\(\) => \{ setFeed\(prev => prev\.filter\(x => x\.id !== optimisticId\)\); \}\)/,
    'a network failure no longer rolls the optimistic row back');
});

test('the persisted chat state is read back by tab id, and a record saved before is migrated', () => {
  // ⚠ P1, and it is silent DATA LOSS. `threadsByTab` / `activeByTab` were
  // positional, so each change to the tab list (the Feed tab, then the app's
  // places on 2026-11-10) either dropped a member's record or filed it under the
  // wrong tabs: coach threads under a feed, channels under Friends.
  const s = stripComments(WIDGET);
  assert.doesNotMatch(s, /saved\.threadsByTab\.length === tabs\.length/,
    'the hydrate is back to an exact-length match, which discards every older record');
  assert.match(s, /tabIds: tabs\.map\(\(t\) => t\.id\)/, 'the saved record no longer names its tabs');
  assert.match(s, /const at = ids\.indexOf\(t\.id\)/, 'the hydrate no longer reads a record back by tab id');
  // Only the site's own tab list is read by shape; another host's record keeps the exact-fit rule.
  assert.match(s, /if \(std && tabs\.some\(\(t\) => t\.id === "circle"\)\) return std;/, 'an old record is read by shape on any host');
  assert.match(s, /return arr\.length === tabs\.length \? tabs\.map\(\(t\) => t\.id\) : null;/, 'another host\'s exact-fit record is dropped');
  // A record saved before names nothing: its ids are read back from its length.
  const legacy = {};
  new Function('S', `${lift(WIDGET, 'cwLegacyTabIds')}\nS.ids = cwLegacyTabIds;`)(legacy);
  const len = (n) => legacy.ids(Array.from({ length: n }, () => []));
  assert.deepEqual(len(8), ['feed', 'circle', 'clients', 'trainers', 'nutritionists', 'friends', 'community', 'support'], 'a visitor\'s record with the Feed tab');
  assert.deepEqual(len(7), ['circle', 'clients', 'trainers', 'nutritionists', 'friends', 'community', 'support'], "a visitor's record from before the Feed tab");
  const six = len(6), five = len(5);
  assert.deepEqual([six[0], six[1], six[3], six[4], six[5]], ['feed', 'circle', 'friends', 'community', 'support'], "a member's record with the Feed tab");
  assert.deepEqual([five[0], five[2], five[3], five[4]], ['circle', 'friends', 'community', 'support'], "a member's record from before the Feed tab");
  assert.equal(len(3), null, 'an unknown shape is not guessed at');
  // The migration is keyed on the feed tabs existing, so it must re-run if the
  // module lands late — otherwise it is decided on a tabs.length it never saw.
  // (`authTry` re-runs it to read /api/me again after a read that did not complete; Codex, #2391.)
  assert.match(s, /\}, \[tabs\.length, feedReady, authTry\]\);/, 'the hydrate effect no longer re-runs when the Feed tab appears');
});

// ── owner, 2026-11-10: "just have it match the app, referring to whats available on the chat
// page", then "make sure the feeds are showing the same. Updating correctly" ──────────────
test('the bubble carries the app\'s places, and files each post where the app does', () => {
  const W = stripComments(WIDGET);
  const places = [...W.matchAll(/\{\s*id: "(\w+)", label: "(\w+)", place: "(\w+)"/g)].map((m) => [m[1], m[3]]);
  assert.deepEqual(places, [['feed', 'wall'], ['members', 'community'], ['peers', 'role']], 'the three feed places, in the app\'s order');
  assert.match(W, /React\.createElement\(window\.CommunityFeed, \{ place: currentTab\.place \|\| "wall" \}\)/, 'the feed is not told its place');
  // The web-only peer DM tabs are gone: the app's role place is a feed.
  const threads = read('clientChatThreads.jsx');
  for (const id of ['clients', 'trainers', 'nutritionists']) assert.doesNotMatch(threads, new RegExp(`id: "${id}"`), `the ${id} DM tab came back`);
  // Team is Coaches + Friends, as the app's Team is.
  assert.match(W, /const TEAM_IDS = \["circle", "friends"\];/);

  // The filing rule, driven.
  const F = stripComments(FEED);
  const known = /const CF_KNOWN_CHANNELS = (\[[^\]]*\]);/.exec(F);
  const post = /const CF_POST_CHANNEL = ("\w+");/.exec(F);
  const kinds = /const CF_WALL_KINDS = (\[[^\]]*\]);/.exec(F);
  const S = {};
  new Function('S', `
    const CF_KNOWN_CHANNELS = ${known[1]}; const CF_POST_CHANNEL = ${post[1]}; const CF_WALL_KINDS = ${kinds[1]};
    ${lift(FEED, 'cfKindOfRole')} ${lift(FEED, 'cfChannelOf')} ${lift(FEED, 'cfFeedScope')}
    ${lift(FEED, 'cfExplicitChannel')} ${lift(FEED, 'cfRoleChannel')} ${lift(FEED, 'cfPlaceChannel')}
    ${lift(FEED, 'cfIsWallCard')} ${lift(FEED, 'cfInPlace')}
    S.inPlace = cfInPlace; S.scope = cfFeedScope; S.postTo = cfPlaceChannel;
  `)(S);
  const at = (p, place, role = 'client') => S.inPlace(p, place, role, S.scope(role));
  // Where a post made in each place is filed: the app's chips.
  assert.equal(S.postTo('wall', 'client'), 'COMMUNITY');
  assert.equal(S.postTo('community', 'trainer'), 'SHAPE');
  assert.equal(S.postTo('role', 'nutritionist'), 'NUTRI');
  assert.equal(S.postTo('role', 'client'), 'CLIENT');
  assert.match(F, /const postChannel = cfPlaceChannel\(place, myRole\);/, 'the composer does not post to its place');
  // Community: the members' posts, everyone.
  const talk = { kind: 'post', channel: 'SHAPE', body: 'any tips?', role: 'Member' };
  assert.ok(at(talk, 'community') && !at(talk, 'wall') && !at(talk, 'role'), 'a Community post is in Community only');
  // Role: the viewer's own peers only.
  const peers = { kind: 'post', channel: 'TRAINER', body: 'coaches only', role: 'Trainer' };
  assert.ok(at(peers, 'role', 'trainer'), 'a trainer misses their own room');
  assert.ok(!at(peers, 'role', 'client') && !at(peers, 'community', 'client') && !at(peers, 'wall', 'client'), 'a client reaches the trainers\' room');
  // An older post with no channel files by its author's role, as the app's does.
  assert.ok(at({ kind: 'post', channel: '', body: 'hi', role: 'Client' }, 'role'), 'a pre-channel client post left the Client place');
  // Wall: activities and media, the app's activityFeed.
  const run = { kind: 'post', channel: '', buckets: ['run'], body: '', role: 'Trainer' };
  assert.ok(at(run, 'wall', 'client'), "a trainer's auto-posted run is not on a client's Wall, as it is in the app");
  const photo = { kind: 'post', channel: 'SHAPE', buckets: ['post'], photo: 'x.jpg', body: 'view', role: 'Member' };
  assert.ok(at(photo, 'wall') && at(photo, 'community'), 'a captioned photo is on the Wall and in Community, as in the app');
  assert.ok(!at({ ...photo, repost: true }, 'wall'), 'a repost is a Wall card');
  assert.ok(!at({ kind: 'post', channel: 'TRAINER', buckets: ['post'], photo: 'x.jpg', body: '', role: 'Trainer' }, 'wall', 'client'),
    "a photo posted into the trainers' room reached a client's Wall");
  assert.ok(at({ kind: 'post', channel: 'COMMUNITY', buckets: ['post'], body: 'from the web', role: 'Member' }, 'wall'),
    'a text post made on the web Wall vanished from it');
});

test('the feed keeps up: re-read on a post, on return, and on a timer, keeping what is on screen', () => {
  const F = stripComments(FEED);
  assert.match(F, /\}, \[feedMode, refreshNonce\]\);/, 'the feed is read once per open again');
  assert.match(F, /setInterval\(\(\) => \{ if \(visible\(\)\) refreshFeed\(\); \}, 45000\)/, 'no poll while in view');
  assert.match(F, /addEventListener\("visibilitychange", back\)/, 'no re-read on return');
  assert.match(F, /if \(!ok && loadedRef\.current\) return;/, 'a failed re-read blanks the feed');
  // A post of yours: the stand-in is held through a re-read, then replaced by the real one.
  assert.match(F, /prev\.filter\(\(x\) => x && x\.pending\)\.concat/, 'a re-read drops a post still on its way');
  assert.match(F, /\{ \.\.\.x, pending: false \}[^\n]*\n\s+refreshFeed\(\);/, 'a landed post is not read back');
  // The like and the replies are the server's, so the app and the site agree.
  assert.match(F, /likedByMe: !!\(uid && Array\.isArray\(p\.likes\) && p\.likes\.some/, 'your like is assumed, not read');
  assert.match(F, /React\.useState\(!!p\.likedByMe\)/, 'the heart starts empty');
  assert.match(F, /commentList: Array\.isArray\(p\.comments\)/, 'the replies are not read');
  // Signed out with nothing live: the app's sample, labelled; never mixed into live posts.
  assert.match(F, /const sample = !signedIn && live\.length === 0;/, 'the sample is mixed into live posts');
  assert.match(F, /\{showingSample && \(/, 'the sample is not labelled');
  // A re-read re-renders the cards, never remounts them: an open reply and its draft survive.
  assert.match(F, /const CfFeedCard = cardTypeRef\.current \|\| \(cardTypeRef\.current = FeedItem\);/, 'the card type is made anew each render');
  assert.match(F, /visible\.map\(\(p, i\) => <CfFeedCard /, 'the list renders the per-render FeedItem');
  // A retry after a failed first read can still replace the error.
  assert.match(F, /loadedRef\.current = ok \|\| !signedIn;/, 'a failed read counts as loaded, so a retry is ignored');
  // ⚠ Codex P1 on #2671: the role is the account's, read with it, never the cache's guess.
  // A trainer's post in the role place was filed under CLIENT on a first visit.
  assert.match(F, /const pr = await sdb\.getProfile\(u\.id\);/, 'the feed no longer reads the account\'s role');
  assert.match(F, /const myRole = \(signedIn === true && acctRole\) \|\| cachedRole \|\| "client";/, 'a signed-in member\'s role is the cache\'s guess again');
  assert.match(F, /const roleUnsure = place === "role" && signedIn === true && !acctRole;/, 'the role place no longer waits for the role');
  assert.match(F, /disabled=\{signedIn !== true \|\| roleUnsure\}/, 'New post in the role place opens before the role is known');
  assert.match(F, /window\.dispatchEvent\(new Event\("shape:viewer-role"\)\)/, 'the bubble is not told the role');
  assert.match(stripComments(WIDGET), /window\.addEventListener\("shape:viewer-role", seen\)/, 'the role tab does not follow the account');
  // The member is found on every page, not only where /supabase.js is loaded.
  assert.match(F, /window\.shapeEnsureDb \? await window\.shapeEnsureDb\(\)/, 'the feed assumes the client is loaded');
});
