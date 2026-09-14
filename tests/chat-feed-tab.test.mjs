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

test('the Feed tab is gated on the module being present', () => {
  // ⚠ THERE IS NO ERROR BOUNDARY ANYWHERE IN public/newdesign. A tab whose body
  // renders an undefined component throws a ReferenceError and blanks the whole
  // page. Absent module → no tab is a missing feature; ungated is a broken site.
  assert.match(WIDGET, /typeof window\.CommunityFeed === "function"/,
    'the widget no longer checks that the feed module is loaded');
  assert.match(WIDGET, /feedReady \? \[FEED_TAB\]\.concat/,
    'the Feed tab is no longer gated on feedReady');
});

test('the thread pane is hidden, never unmounted, while the Feed tab is up', () => {
  // That subtree owns the message poll, every open thread's draft text and its
  // scroll position. Unmounting on a tab switch drops an unsent draft.
  assert.match(WIDGET, /display: currentTab\.feed \? "none" : "grid"/,
    'the thread grid is no longer hidden-not-unmounted behind the Feed tab');
});

test('the chip labels keep the app\'s Wall/Community swap', () => {
  // ⚠ THE APP SWAPS THESE TWO DELIBERATELY: the COMMUNITY key is labelled
  // "Wall" and the SHAPE key is labelled "Community", because the Wall is a
  // REDESIGN of the activity feed rather than a surface beside it. The keys were
  // left alone so every filter comparison kept working. Read as a typo and
  // "fixed", a post lands on one chip in the app and the other one here — so
  // this asserts the app STILL does it, rather than pinning our own spelling.
  assert.match(APP, /k === 'COMMUNITY' \? tr\('feed:tab\.wall'/,
    "the app no longer labels the COMMUNITY key 'Wall' — re-derive the web chips");
  assert.match(APP, /k === 'SHAPE' \? tr\('feed:chip\.community'/,
    "the app no longer labels the SHAPE key 'Community' — re-derive the web chips");
  assert.match(FEED, /if \(k === "COMMUNITY"\) return "Wall";/, 'the web feed dropped the Wall label');
  assert.match(FEED, /if \(k === "SHAPE"\) return "Community";/, 'the web feed dropped the Community label');
});

test('the feed reads the channel from metrics, not from a column', () => {
  // ⚠ `channel` IS NOT A COLUMN on community_posts — the app stashes it in the
  // metrics jsonb (shapeBackend.js). Reading p.channel off the raw API row
  // returns undefined for every post and the Wall renders empty, with nothing
  // failing anywhere.
  assert.match(FEED, /channel: \(typeof m\.channel === 'string'/,
    'the feed no longer lifts the channel out of metrics');
  // \u26a0 SCOPED TO THE MAPPER. A file-wide ban on `p.channel` fails correct
  // code: `cfChannelOf` reads it legitimately, because by then `p` is a MAPPED
  // post that carries the field the mapper just lifted. What must never happen
  // is the MAPPER reading it off the raw API row.
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
  assert.doesNotMatch(FEED, /<Card[\s>]/, 'the feed renders the dashboard-global Card');
  assert.doesNotMatch(FEED, /<Pill[\s>]/, 'the feed renders the dashboard-global Pill');
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
