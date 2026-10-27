// tests/me-page-magazine.test.mjs
//
// The Me page, the live Boost sheet and the coach profile, after four asks on 2026-10-24:
//   "This needs to get cleaned up" (the Me tab: the score bars, the tabs, THE WALL, THE SHELF),
//   "update design of this as well to match" (the "Boost Priya" sheet),
//   "also why isnt this going away when i scroll down, the message and work with maya" (the dock), and
//   "Design", on the offer to bring the rest of the coach profile into the same look.
//
// The first two now print as the Wall does (#2436, #2438, #2439): heads in the headline face over ink
// rules, the active tab underlined in the magazine's teal, square bars and boxes, and a member's own words
// pulled out under a teal quote mark. The dock slides away while the page scrolls down and comes back as
// it scrolls up. That part is driven with real React in jsdom, since it runs on a scroll listener.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, flatten, textOf, THEME, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const mod = await loadBroadsheet(['BSTerrainProfile', 'BSTerrainTabs', 'BSTStationHead', 'BSTPullQuote', 'BSProfileExtras', 'BSLiveBoostSheet', 'bsDemoMemberCustom', 'BSSignalCoachProfile', 'BSProfileCustomizer']);
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const TEAL = '#0a7a72';   // bsWsAccent on a light paper (the harness THEME is light)
const INK = '#111';

test('the Me page asks for the Wall\'s heads on every tab: the name, the score, the climb, the signals', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const person = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
  const d = drive(mod.BSTerrainProfile, { person, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  const nodes = d.nodes();
  assert.equal(nodes.find(named('BSProfileIdentityHead')).props.mag, true, 'the name block keeps its old heat rule');
  // The score's bars: square, and no burst on the best one (it left a box drawn round the bar).
  const scoreBars = nodes.filter(named('BSSdBars'));
  assert.ok(scoreBars.length && scoreBars.every((b) => b.props.mag && b.props.still), 'the score bars are the old animated ones');
  // No quote at the top (owner, 2026-10-24: "remove the quote at the top on profiles"): the demo
  // member has a line, and it is not pulled out; the Training for line under the name stays.
  assert.equal(nodes.filter(named('BSTPullQuote')).length, 0, 'the member\'s line is pulled out at the top again');
  assert.match(d.text, /Training for/, 'the start line under the name went with the quote');
  const tabsOf = () => d.nodes().find(named('BSTerrainTabs'));
  const seen = {}, texts = {};
  for (const tb of tabsOf().props.tabs) {
    tabsOf().props.onPick(tb.key);
    d.render();
    const heads = d.nodes().filter(named('BSTStationHead'));
    for (const h of heads) assert.equal(h.props.mag, true, `"${h.props.label}" on ${tb.key} is the old station head`);
    for (const b of d.nodes().filter(named('BSSdBars'))) assert.equal(b.props.mag, true, `bars on ${tb.key} are the old ones`);
    seen[tb.key] = heads.map((h) => h.props.label);
    texts[tb.key] = d.text;
  }
  // A tab's first section takes no head of its own: the tab right above names it (owner, 2026-10-26:
  // "remove these headers. dont need it showing twice", then "and remove 'the climb'").
  assert.deepEqual(seen.signals, ['Disciplines · strata', 'Key lifts']);
  assert.deepEqual(seen.climb, []);
  // The Climb's head carried the join date, the one place most profiles show it: it stays without the head
  // (Codex P2 on #2468).
  assert.match(texts.climb, /Member since/);
  assert.ok(!seen.activity.includes('The wall'), 'the wall has its head back under the Activity tab');
});

test('the section strip: the names in the headline face between a heavy rule and a hairline, the active one underlined in teal', () => {
  const tabs = [{ key: 'activity', label: 'Activity' }, { key: 'signals', label: 'Signals' }, { key: 'climb', label: 'Climb' }];
  const picked = [];
  const d = drive(mod.BSTerrainTabs, { tabs, active: 'signals', onPick: (k) => picked.push(k), heat: '#c0533b', INK, BG: '#fff', pad: 20, top: 57 });
  const [outer] = d.nodes();
  // Still sticky below the pinned masthead (tests/profile-pinned-mast.test.mjs holds the offset).
  assert.equal(outer.props.style.position, 'sticky');
  assert.equal(outer.props.style.top, 57);
  assert.equal(outer.props.style.background, '#fff', 'the strip scrolls over the page on solid paper');
  assert.equal(outer.props.style.borderTop, `3px solid ${INK}`);
  assert.match(outer.props.style.borderBottom, /^1px solid /);
  // A long name (ru "Восхождение") scrolls the row sideways instead of squeezing it.
  const row = d.nodes().find((n) => n.props && n.props.className === 'bs-hide-scroll');
  assert.equal(row.props.style.overflowX, 'auto');
  const buttons = d.nodes().filter((n) => n.type === 'button');
  assert.deepEqual(buttons.map((b) => b.props['aria-pressed']), [false, true, false]);
  for (const b of buttons) {
    assert.ok(b.props.style.minHeight >= 44, 'a tab is a real 44px target');
    const label = b.props.children;
    assert.match(label.props.style.fontFamily, /^'Saira'/, 'the names are set in the headline face');
    assert.equal(label.props.style.textTransform, 'uppercase');
  }
  assert.equal(buttons[1].props.children.props.style.boxShadow, `inset 0 -2px 0 ${TEAL}`, 'the active name is underlined in the magazine\'s teal');
  assert.equal(buttons[1].props.children.props.style.color, INK);
  assert.equal(buttons[0].props.children.props.style.boxShadow, 'none');
  assert.notEqual(buttons[0].props.children.props.style.color, INK, 'an inactive name is dimmed');
  d.click('Climb');
  assert.deepEqual(picked, ['climb']);
});

test('a station head in the Wall\'s look: the name over a 2px ink rule, its count at the right; the session pages keep theirs', () => {
  const mag = drive(mod.BSTStationHead, { mag: true, heat: '#c0533b', INK, label: 'The wall', meta: '3 shots' });
  const [head] = mag.nodes();
  assert.equal(head.props['data-bst-head'], 'mag');
  assert.equal(head.props.style.borderBottom, `2px solid ${INK}`);
  assert.equal(mag.text, 'The wall3 shots');
  const [label, meta] = head.props.children;
  assert.match(label.props.style.fontFamily, /^'Saira'/);
  assert.equal(meta.props.style.marginLeft, 'auto');
  const plain = drive(mod.BSTStationHead, { heat: '#c0533b', INK, label: 'Splits' });
  assert.equal(plain.nodes()[0].props['data-bst-head'], undefined, 'the session pages\' head changed too');
});

test('a pulled-out line: the teal quote mark, the words, and who said it; nothing when there are no words', () => {
  const d = drive(mod.BSTPullQuote, { INK, text: 'Earn the easy days.', cite: 'Quinn line' });
  const [fig] = d.nodes();
  assert.equal(fig.type, 'figure');
  const [mark, words, cite] = fig.props.children;
  assert.equal(mark.props.children, '“');
  assert.equal(mark.props.style.color, TEAL);
  assert.equal(words.type, 'blockquote');
  assert.equal(words.props.children, 'Earn the easy days.');
  assert.notEqual(words.props.style.fontStyle, 'italic');
  assert.equal(cite.type, 'figcaption');
  assert.equal(cite.props.children, 'Quinn line');
  assert.equal(drive(mod.BSTPullQuote, { INK, cite: 'x' }).nodes().length, 0);
  assert.equal(drive(mod.BSTPullQuote, { INK, text: 'Just the words' }).nodes()[0].props.children[2], null, 'no caption without a cite');
});

test('the wall, the shelf and the prompts in the Wall\'s look: square shots to the screen\'s edge, answers pulled out', () => {
  const d = drive(mod.BSProfileExtras, { custom: mod.bsDemoMemberCustom(), c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, demo: true, bleed: 20 });
  const nodes = d.nodes();
  const heads = nodes.filter(named('BSTStationHead'));
  // The wall takes no head (the Activity tab above names it) and keeps its name for a screen reader.
  assert.deepEqual(heads.map((h) => h.props.label), ['The shelf · Proudest']);
  assert.ok(heads.every((h) => h.props.mag), 'the shelf head is the old one');
  assert.ok(nodes.some((n) => n.props && n.props.role === 'group' && n.props['aria-label'] === 'The wall'), 'the wall lost its accessible name');
  const figs = nodes.filter((n) => n.type === 'figure');
  assert.ok(figs.length >= 2, 'the demo wall has its shots');
  for (const f of figs) {
    const [pic, caption] = f.props.children;
    assert.ok(!pic.props.style.borderRadius, 'a shot is square');
    assert.ok(!pic.props.style.border, 'a shot is unframed');
    if (caption) assert.match(caption.props.style.fontFamily, /^'Saira'/, 'captions are in the headline face');
  }
  // The strip runs to the screen's edge, so the last shot is cut by the screen, not the gutter.
  const strip = nodes.find((n) => n.props && n.props.className === 'bs-hide-scroll' && Array.isArray(n.props.children));
  assert.equal(strip.props.style.marginRight, -20);
  assert.equal(strip.props.style.paddingRight, 20);
  const custom = mod.bsDemoMemberCustom();
  const answers = custom.prompts.filter((p) => p && p.q && p.a).map((p) => p.a);
  assert.ok(answers.length, 'the demo has prompts');
  assert.deepEqual(nodes.filter(named('BSTPullQuote')).map((q) => q.props.text), answers, 'each answer is pulled out');
});

// Owner, 2026-10-24, of the profile editor: "also update design and look of this page". The Wall's look:
// the teal kicker over an upright title and a heavy rule, each part under a Saira head on a 2px ink rule
// (its hint at the right), square fields 44 px tall, square actions in the ink outline, the chosen chips
// in ink, and Save in ink with the paper's text. Nothing rounded, tinted, dashed or gold.
test('the profile editor in the Wall\'s look, for a member and for a coach', () => {
  for (const coach of [false, true]) {
    const d = withSurface(() => drive(mod.BSProfileCustomizer, { initial: { prompts: [{ q: 'why', a: 'x' }, { q: 'fuel', a: 'y' }] }, c: '#c9a227', INK, BG: '#fff', onClose() {}, onSave() {}, coach }));
    const nodes = d.nodes();
    const styled = nodes.filter((n) => n.props && n.props.style);
    const who = coach ? 'coach' : 'member';
    assert.match(d.text, /Your profile · Editor/);
    assert.equal(styled.filter((n) => n.props.style.fontStyle === 'italic').length, 0, `${who}: an italic is back`);
    const round = styled.filter((n) => n.props.style.borderRadius && !(n.props.style.width === 8 && n.props.style.height === 8));
    assert.deepEqual(round.map((n) => n.type), [], `${who}: a rounded piece (only the rings' legend dots are round)`);
    assert.equal(styled.filter((n) => /dashed/.test(String(n.props.style.border || ''))).length, 0, `${who}: a dashed gold Add is back`);
    assert.equal(styled.filter((n) => /gradient/.test(String(n.props.style.background || ''))).length, 0, `${who}: a gradient rule or wash is back`);
    // The tier's colour stays only where it is the thing shown: the "tier default" swatch and a ring's dot.
    const swatchOrDot = (n) => n.props.style.width === 36 || n.props.style.width === 8;
    assert.equal(styled.filter((n) => !swatchOrDot(n) && (n.props.style.color === '#c9a227' || n.props.style.background === '#c9a227')).length, 0, `${who}: the tier's gold is back`);
    const heads = nodes.filter((n) => n.props && n.props['data-cust-head'] != null);
    assert.ok(heads.length >= (coach ? 8 : 12), `${who}: the parts lost their heads (${heads.length})`);
    assert.ok(heads.every((h) => h.props.style.borderBottom === `2px solid ${INK}`));
    const line = heads.find((h) => /Your line/.test(textOf(h)));
    assert.deepEqual(line.props.children.map((ch) => ch && textOf({ props: { children: ch.props.children } })), ['Your line', 'one motto'], 'the hint after " · " sits at the right');
    const fields = nodes.filter((n) => n.type === 'input' || n.type === 'textarea');
    assert.ok(fields.length > 4);
    for (const f of fields.filter((n) => n.props.type !== 'file')) {
      assert.equal(f.props.style.borderRadius, 0, `${who}: a rounded field`);
      assert.ok(f.props.style.minHeight >= 44, `${who}: a field under 44 px`);
      assert.equal(f.props.style.background, 'transparent', `${who}: a filled field`);
    }
    const close = nodes.find((n) => n.props && n.props['data-cust-close'] != null);
    assert.equal(close.props.style.width, 44);
    assert.equal(close.props.style.height, 44);
    const save = nodes.find((n) => n.props && n.props['data-cust-save'] != null);
    assert.equal(save.props.style.background, INK, 'Save is the ink action');
    assert.equal(save.props.style.color, THEME.PAPER, 'Save\'s text is the paper, not BG');
    assert.equal(save.props.style.clipPath, undefined, 'the notched corner is back');
    const chips = nodes.filter((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined && n.props.style && n.props.style.minHeight === 44);
    assert.ok(chips.length >= 4, `${who}: the stat and pin chips say whether they are chosen`);
    for (const ch of chips) assert.equal(ch.props.style.background, ch.props['aria-pressed'] ? INK : 'transparent');
  }
});

// Owner, 2026-10-24: "should be able to click on these pictures and make bigger". Each shot is a door to
// the viewer, at its own place on the wall; the viewer steps round the wall and closes back to the strip.
test('a Wall shot opens full size, at its place, and steps round the wall', () => {
  const d = drive(mod.BSProfileExtras, { custom: mod.bsDemoMemberCustom(), c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, demo: true, bleed: 20 });
  const viewer = () => d.nodes().find(named('BSPhotoViewer'));
  const shots = d.nodes().filter((n) => n.type === 'button' && n.props['data-bs-wall-shot'] != null);
  assert.ok(shots.length >= 2, 'the demo wall has its shots');
  assert.equal(viewer(), undefined, 'the viewer is open before a tap');
  // Each shot names itself for a screen reader by its place (the harness's tr leaves {n} as it is).
  assert.ok(shots.every((b) => /^Open photo /.test(b.props['aria-label'])));
  assert.match(stripComments(readFileSync(SRC, 'utf8')), /tr\('profile:wall\.openShot', \{ defaultValue: 'Open photo \{n\} of \{count\}', n: i \+ 1, count: wall\.length \}\)/);
  shots[1].props.onClick();
  d.render();
  const v = viewer();
  assert.ok(v, 'a tap on a shot opens nothing');
  assert.equal(v.props.at, 1, 'the viewer opens on the shot tapped');
  assert.equal(v.props.shots.length, shots.length);
  assert.ok(v.props.shots.every((w) => typeof w.url === 'string' && w.url), 'the viewer gets the wall\'s own photos');
  assert.equal(v.props.labels.close, 'Close');
  v.props.onStep(1); d.render();
  assert.equal(viewer().props.at, 2 % shots.length);
  viewer().props.onStep(-1); d.render(); viewer().props.onStep(-1); d.render();
  assert.equal(viewer().props.at, 0);
  viewer().props.onStep(-1); d.render();
  assert.equal(viewer().props.at, shots.length - 1, 'back from the first shot is the last');
  viewer().props.onClose(); d.render();
  assert.equal(viewer(), undefined, 'the viewer would not close');
});

// The Boost sheet portals into the phone surface; with no document the sheet renders nothing, so every
// render of it (the first, and the one after typing) runs with one.
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};
function driveBoost(person) {
  const d = withSurface(() => drive(mod.BSLiveBoostSheet, { person, onClose() {}, onOpenProfile() {} }));
  const render = d.render;
  d.render = () => withSurface(render);
  return d;
}

test('the Boost sheet in the Wall\'s look: the flat face, the headline over a heavy rule, square boxes, Send in ink', () => {
  const d = driveBoost({ name: 'Priya Shah', activity: 'workout', tier: 'PEAK' });
  const nodes = d.nodes();
  assert.ok(!nodes.some((n) => n.props && n.props.style && n.props.style.clipPath), 'a clipped corner is the old sheet');
  const av = nodes.find(named('BSFacetAvatar'));
  assert.equal(av.props.flat, true);
  assert.equal(av.props.c, THEME.INK, 'the face is framed in ink, not the tier\'s colour');
  // The live line is the magazine's kicker: teal mid-workout, with a still dot.
  const kicker = nodes.find((n) => n.type === 'span' && /^In a workout now/.test(String(n.props.children && n.props.children[0])));
  assert.equal(kicker.props.style.color, TEAL);
  const dot = nodes.find((n) => n.type === 'span' && n.props.style && n.props.style.width === 6);
  assert.equal(dot.props.style.animation, undefined, 'the dot no longer breathes');
  const title = nodes.find((n) => n.type === 'div' && n.props.children && n.props.children[0] === 'Boost ');
  assert.equal(title.props.style.fontFamily, THEME.DISPLAY);
  assert.equal(title.props.style.textTransform, 'uppercase');
  assert.equal(title.props.children[1], 'Priya');
  assert.equal(title.props.children.length, 2, 'the accent full stop is the old title');
  assert.ok(nodes.some((n) => n.type === 'div' && n.props.style && n.props.style.height === 3 && n.props.style.background === THEME.INK), 'no heavy ink rule under the head');
  const chips = nodes.filter((n) => n.type === 'button' && n.props.style && n.props.style.minHeight === 40);
  assert.equal(chips.length, 7, 'the seven workout phrases');
  assert.equal(chips[0].props.children, "Let's go!");
  for (const ch of chips) {
    assert.equal(ch.props.style.borderRadius, 0);
    assert.equal(ch.props.style.background, 'transparent');
  }
  const send = () => d.nodes().find((n) => n.type === 'button' && /Send$/.test(String(n.props.children)));
  assert.equal(send().props.disabled, true);
  assert.notEqual(send().props.style.background, THEME.INK, 'an empty Send reads as off');
  d.nodes().find((n) => n.type === 'input').props.onChange({ target: { value: 'Go get it' } });
  d.render();
  assert.equal(send().props.disabled, false);
  assert.equal(send().props.style.background, THEME.INK);
  assert.equal(send().props.style.color, THEME.PAPER);
  assert.equal(send().props.style.borderRadius, 0);
});

test('at the stove the kicker is amber, as the face\'s dot', () => {
  const d = driveBoost({ name: 'Sam Ortiz', activity: 'cooking' });
  const kicker = d.nodes().find((n) => n.type === 'span' && /^Cooking now/.test(String(n.props.children && n.props.children[0])));
  assert.equal(kicker.props.style.color, THEME.AMBER);
});

// ── The coach profile (Signal) in the same look ───────────────────────────────
const MAYA = { who: 'Maya Okafor', kind: 'TRAINER', tier: 'ELITE', init: 'MO' };
// The old page drew every action as a pill (borderRadius 999) and its quotes in italics.
const oldLook = (nodes) => nodes.filter((n) => n.props && n.props.style && (n.props.style.borderRadius === 999 || n.props.style.fontStyle === 'italic'));
const roundButtons = (nodes) => nodes.filter((n) => n.type === 'button' && n.props.style && n.props.style.borderRadius);

test('the coach profile: no quote at the top, the Me page\'s counts and tab strip, and no pill or italics on any tab', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  const nodes = d.nodes();
  // No quote at the top, as on the member's profile (owner, 2026-10-24).
  assert.equal(nodes.filter(named('BSTPullQuote')).length, 0, 'the coach\'s line is pulled out at the top again');
  assert.equal(nodes.find(named('BSFollowBlock')).props.variant, 'ledger', 'the counts are the old centred pills');
  const tabsOf = () => d.nodes().find(named('BSTerrainTabs'));
  assert.deepEqual(tabsOf().props.tabs.map((tb) => tb.key), ['activity', 'about', 'coaching', 'playlists', 'reviews']);
  const heads = {};
  for (const tb of tabsOf().props.tabs) {
    tabsOf().props.onPick(tb.key);
    d.render();
    const all = d.nodes();
    assert.deepEqual(oldLook(all).map((n) => n.type), [], `${tb.key} still has a pill or italics`);
    assert.deepEqual(roundButtons(all).map((n) => textOf(n)), [], `${tb.key} has a rounded button`);
    const h = all.filter(named('BSTStationHead'));
    for (const x of h) assert.equal(x.props.mag, true, `"${x.props.label}" is the old kicker`);
    heads[tb.key] = h.map((x) => x.props.label);
  }
  assert.deepEqual(heads.about, ['Coaching philosophy', 'The practice', 'Coaching focus', 'Track record', 'Certifications']);
  assert.equal(heads.coaching.length, 1);
  assert.match(heads.coaching[0], /^Train with /, 'the harness\'s tr leaves {name} unfilled');
  assert.deepEqual(heads.reviews, ['Reviews']);
  // The activity tab's extras are the Me page's ledger: answers pulled out, not boxed in italics.
  tabsOf().props.onPick('activity');
  d.render();
  assert.equal(d.nodes().find(named('BSProfileExtras')).props.ledger, true);
});

test('the coach\'s About: the philosophy pulled out, the focus on square bars to its own /100, the record as the Wall\'s figures', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('about');
  d.render();
  const nodes = d.nodes();
  const quotes = nodes.filter(named('BSTPullQuote'));
  assert.equal(quotes[0].props.text, 'Get strong, stay strong.', 'the philosophy, without the literal quote marks the old italic line carried');
  const focus = nodes.find((n) => n.props && n.props['data-coach-focus'] != null);
  const rows = focus.props.children;
  assert.ok(rows.length >= 2);
  for (const row of rows) {
    const [label, track, fig] = row.props.children;
    const fill = track.props.children;
    const value = Number(fig.props.children[0]);
    assert.equal(fill.props.style.width, `${value}%`, `${label.props.children}: a bar is its own share of 100, not of the best`);
  }
  const figs = nodes.find(named('BSWallStoryFigures'));
  assert.deepEqual(figs.props.items.map((r) => r[0]), ['Clients', 'Rating', 'Years']);
});

test('the coach\'s Coaching tab: square actions, ink for the one to take, and the plan types as the Wall\'s word tabs', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('coaching');
  d.render();
  const btn = (re) => d.nodes().find((n) => n.type === 'button' && re.test(textOf(n)));
  const subscribe = btn(/^Subscribe$/);
  assert.equal(subscribe.props.style.background, THEME.INK);
  // The solid paper, never PAPER_BG: on the Steel paper that is a gradient, which is no colour (Codex P1 on #2441).
  assert.equal(subscribe.props.style.color, THEME.PAPER);
  assert.equal(subscribe.props.style.borderRadius, 0);
  const intro = btn(/^Book intro · Free$/);
  assert.equal(intro.props.style.background, 'transparent');
  assert.equal(intro.props.style.border, `1px solid ${THEME.INK}`);
  const cats = d.nodes().filter((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined && /^(All|Workouts|Programs|Coaching)$/i.test(textOf(n)));
  assert.ok(cats.length >= 2, 'the plan types');
  assert.equal(cats.filter((n) => n.props['aria-pressed']).length, 1);
  const on = cats.find((n) => n.props['aria-pressed']).props.children;
  assert.equal(on.props.style.boxShadow, `inset 0 -2px 0 ${TEAL}`);
});

test('the coach\'s Reviews: the average at the head, each review its writer\'s flat face and words pulled out', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('reviews');
  d.render();
  const nodes = d.nodes();
  assert.match(nodes.find(named('BSTStationHead')).props.meta, /^[\d.—]+\/10 · ★ \d+$/);
  const reviews = nodes.filter((n) => n.props && n.props['data-coach-review'] != null);
  assert.ok(reviews.length >= 2);
  for (const r of reviews) {
    const inner = flatten(r);
    const face = inner.find(named('BSFacetAvatar'));
    assert.equal(face.props.flat, true);
    assert.equal(face.props.c, THEME.INK);
    assert.ok(inner.find(named('BSTPullQuote')).props.text, 'the words are pulled out');
  }
});

test('the coach\'s own Me tab draws in the same look', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, isSelf: true, meMode: true, onBack() {}, onMessage() {} });
  assert.ok(d.nodes().find(named('BSTerrainTabs')));
  // The owner's own ＋ Log activity is the Me page's underlined word, not the old pill (Codex P2 on #2441:
  // this driver draws no nested component, so the element's props are what is checked).
  const log = d.nodes().find(named('BSActivityLogCta'));
  assert.equal(log.props.ledger, true);
  assert.equal(log.props.INK, THEME.INK);
  assert.ok(!d.nodes().find(named('BSProfileDock')), 'no Message / Work-with on one\'s own profile');
  assert.deepEqual(oldLook(d.nodes()).map((n) => n.type), []);
});

test('the member profile\'s Message is the same dock with Message alone, not a sticky fade over the wall', () => {
  // Owner, 2026-10-24, of "Message Priya" over a member's wall: "fix this message box thats appearing".
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const at = src.indexOf('function BSTerrainProfile(');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.match(fn, /<BSProfileDock INK=\{INK\} BG=\{BG\} PAPER=\{tTheme\.PAPER\} onMessage=\{\(\) => onMsg\(person\)\}\s+messageLabel=\{tr\('profile:terrain\.messageName'/);
  assert.doesNotMatch(fn.slice(fn.indexOf('<BSProfileDock')), /onWorkWith/, 'a member has no Work with');
  assert.doesNotMatch(fn, /position: 'sticky', bottom: 0/, 'the old fade that sat over the wall is back');
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSTerrainProfile, { person: { who: 'Priya Shah', kind: 'CLIENT', tier: 'PEAK', init: 'PS', userId: 'u-priya' }, onBack() {}, onMessage() {} });
  const dock = d.nodes().find(named('BSProfileDock'));
  assert.ok(dock, 'another member\'s profile has no Message dock');
  assert.equal(dock.props.onWorkWith, undefined);
  assert.match(dock.props.messageLabel, /^Message /);
});

test('the coach profile renders its dock as the component that hides on scroll, and no other sticky footer', () => {
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const at = src.indexOf('function BSSignalCoachProfile(');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.match(fn, /<BSProfileDock [^>]*onMessage=\{\(\) => onMsg\(person\)\}[^>]*onWorkWith=\{\(\) => setTab\('coaching'\)\}/);
  assert.doesNotMatch(fn, /position: 'sticky', bottom: 0/, 'the old dock that never moved is back');
});

// ── The dock, mounted with real React in jsdom ───────────────────────────────
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { BSProfileDock, BSPhotoViewer } = await loadBroadsheet(['BSProfileDock', 'BSPhotoViewer'], React);

test('the coach dock slides away while the page scrolls down and comes back up, at the top and at the end', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sc = dom.window.document.createElement('div');
  sc.className = 'bs-scroll';
  let y = 0;
  Object.defineProperty(sc, 'scrollTop', { get: () => y, configurable: true });
  Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(sc, 'scrollHeight', { value: 3000, configurable: true });
  const removed = [];
  const realRemove = sc.removeEventListener.bind(sc);
  sc.removeEventListener = (type, fn, o) => { removed.push(type); realRemove(type, fn, o); };
  const host = dom.window.document.createElement('div');
  sc.appendChild(host);
  dom.window.document.body.appendChild(sc);
  const calls = [];
  const root = ReactDOMClient.createRoot(host);
  try {
    await React.act(async () => {
      root.render(React.createElement(BSProfileDock, { INK: '#f1ece1', BG: 'linear-gradient(180deg, #1a1612, #100d0a)', PAPER: '#100d0a', onMessage: () => calls.push('message'), onWorkWith: () => calls.push('work'), messageLabel: 'Message', workLabel: 'Work with Maya' }));
    });
    const dock = host.querySelector('[data-profile-dock]');
    const isHidden = () => {
      const h = dock.style.opacity === '0';
      assert.equal(dock.hasAttribute('inert'), h, 'the dock is inert exactly while it is hidden');
      assert.equal(dock.style.transform, h ? 'translateY(40%)' : 'none');
      return h;
    };
    const scrollTo = async (to) => { y = to; await React.act(async () => { sc.dispatchEvent(new dom.window.Event('scroll')); }); return isHidden(); };
    assert.equal(isHidden(), false, 'the dock starts on screen');
    assert.match(dock.style.background, /linear-gradient/, 'the dock sits on the page\'s own paper, so no text shows through it');
    assert.equal(await scrollTo(300), true, 'scrolling down hides the dock');
    assert.equal(await scrollTo(305), true, 'a resting thumb\'s few pixels don\'t bring it back');
    assert.equal(await scrollTo(280), false, 'scrolling up brings it back');
    assert.equal(await scrollTo(285), false, 'a few pixels down don\'t hide it again');
    assert.equal(await scrollTo(900), true);
    assert.equal(await scrollTo(2200), false, 'at the end of the page the dock comes back, so the last lines can be read over it');
    assert.equal(await scrollTo(1500), false, 'scrolling up from the end keeps it');
    assert.equal(await scrollTo(1700), true);
    assert.equal(await scrollTo(40), false, 'near the top the dock is always shown');
    const [msg, work] = dock.querySelectorAll('button');
    assert.equal(msg.textContent, 'Message');
    assert.equal(work.textContent, 'Work with Maya →');
    assert.equal(parseFloat(msg.style.borderRadius), 0, 'the dock\'s actions are square, as the page\'s');
    assert.equal(parseFloat(work.style.borderRadius), 0);
    assert.equal(work.style.background, 'rgb(241, 236, 225)', 'Work with is the ink action');
    assert.equal(work.style.color, 'rgb(16, 13, 10)', 'its text is the solid paper, not the page\'s gradient background');
    await React.act(async () => { msg.click(); work.click(); });
    assert.deepEqual(calls, ['message', 'work']);
  } finally {
    await React.act(async () => { root.unmount(); });
    sc.remove();
    Object.assign(globalThis, saved);
  }
  assert.deepEqual(removed, ['scroll'], 'the scroll listener outlives the dock');
});

test('a member\'s dock is Message alone, square, in the outline, and hides on scroll as the coach\'s does', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sc = dom.window.document.createElement('div');
  sc.className = 'bs-scroll';
  let y = 0;
  Object.defineProperty(sc, 'scrollTop', { get: () => y, configurable: true });
  Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(sc, 'scrollHeight', { value: 3000, configurable: true });
  const host = dom.window.document.createElement('div');
  sc.appendChild(host);
  dom.window.document.body.appendChild(sc);
  const calls = [];
  const root = ReactDOMClient.createRoot(host);
  try {
    await React.act(async () => { root.render(React.createElement(BSProfileDock, { INK: '#111111', BG: '#f4efe6', PAPER: '#f4efe6', onMessage: () => calls.push('message'), messageLabel: 'Message Priya' })); });
    const dock = host.querySelector('[data-profile-dock]');
    const buttons = dock.querySelectorAll('button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].textContent, 'Message Priya →');
    assert.equal(parseFloat(buttons[0].style.borderRadius), 0);
    assert.equal(buttons[0].style.background, 'transparent');
    assert.match(buttons[0].style.border, /1px solid/);
    y = 600; await React.act(async () => { sc.dispatchEvent(new dom.window.Event('scroll')); });
    assert.equal(dock.style.opacity, '0', 'scrolling down hides it');
    assert.ok(dock.hasAttribute('inert'));
    y = 560; await React.act(async () => { sc.dispatchEvent(new dom.window.Event('scroll')); });
    assert.equal(dock.style.opacity, '1', 'scrolling up brings it back');
    await React.act(async () => { buttons[0].click(); });
    assert.deepEqual(calls, ['message']);
  } finally {
    await React.act(async () => { root.unmount(); });
    sc.remove();
    Object.assign(globalThis, saved);
  }
});

test('the photo viewer: the shot whole, its caption, where it sits on the wall, and keys, arrows, × and Escape', async () => {
  const dom = new JSDOM('<!doctype html><html><body><button id="opener">shot</button><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/' });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const shots = [{ url: 'https://x.test/a.jpg', caption: 'Dawn miles before work.' }, { url: 'https://x.test/b.jpg', caption: 'Chalk on, doubts off.' }, { url: 'https://x.test/c.jpg', caption: '' }];
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const opener = dom.window.document.getElementById('opener');
  opener.focus();
  let open = true;
  function Harness({ list }) {
    const [at, setAt] = React.useState(0);
    const [on, setOn] = React.useState(true);
    open = on;
    return on ? React.createElement(BSPhotoViewer, { shots: list, at, onClose: () => setOn(false), onStep: (d) => setAt((i) => (i + d + list.length) % list.length), labels: { close: 'Close', prev: 'Previous photo', next: 'Next photo' } }) : null;
  }
  const root = ReactDOMClient.createRoot(host);
  // The harness hands every module a react-dom whose createPortal renders in place, so the viewer is looked
  // for in the page; that it portals into the phone's surface is read from the source below.
  const q = (sel) => dom.window.document.querySelector(sel);
  const key = async (k) => { await React.act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k })); }); };
  try {
    await React.act(async () => { root.render(React.createElement(Harness, { list: shots })); });
    const dlg = q('[data-bs-photo-viewer]');
    assert.ok(dlg, 'the viewer did not open');
    assert.equal(dlg.getAttribute('role'), 'dialog');
    assert.equal(dlg.getAttribute('aria-modal'), 'true');
    assert.equal(dlg.style.zIndex, '300', 'the viewer sits under the tab bar');
    assert.equal(q('img').getAttribute('src'), shots[0].url);
    assert.equal(q('img').style.objectFit, 'contain', 'the shot is cropped, not shown whole');
    assert.equal(q('img').getAttribute('alt'), 'Dawn miles before work.');
    assert.match(dlg.textContent, /1 \/ 3/);
    assert.ok(dom.window.document.activeElement === q('[data-bs-photo-close]'), 'focus did not move into the viewer');
    for (const sel of ['[data-bs-photo-close]', '[data-bs-photo-prev]', '[data-bs-photo-next]']) {
      assert.equal(q(sel).style.minHeight, '44px', `${sel} is under 44 px`);
      assert.equal(parseFloat(q(sel).style.borderRadius), 0, `${sel} is round`);
    }
    await key('ArrowRight');
    assert.match(q('[data-bs-photo-viewer]').textContent, /2 \/ 3/);
    assert.match(q('[data-bs-photo-viewer]').textContent, /Chalk on, doubts off\./);
    await React.act(async () => { q('[data-bs-photo-next]').click(); });
    assert.equal(q('img').getAttribute('src'), shots[2].url);
    await React.act(async () => { q('[data-bs-photo-next]').click(); });
    assert.match(q('[data-bs-photo-viewer]').textContent, /1 \/ 3/, 'next from the last shot is the first');
    await React.act(async () => { q('[data-bs-photo-prev]').click(); });
    assert.match(q('[data-bs-photo-viewer]').textContent, /3 \/ 3/);
    await key('Escape');
    assert.equal(open, false, 'Escape did not close the viewer');
    assert.equal(q('[data-bs-photo-viewer]'), null);
    assert.ok(dom.window.document.activeElement === opener, 'focus did not go back to the shot that opened it');
    // One shot: no arrows. A tap on the dark ground closes it, as × does.
    await React.act(async () => { root.render(null); });
    await React.act(async () => { root.render(React.createElement(Harness, { list: shots.slice(0, 1) })); });
    assert.equal(q('[data-bs-photo-prev]'), null);
    assert.equal(q('[data-bs-photo-next]'), null);
    await React.act(async () => { q('[data-bs-photo-viewer]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.equal(q('[data-bs-photo-viewer]'), null, 'a tap on the ground did not close it');
    await React.act(async () => { root.render(null); });
    await React.act(async () => { root.render(React.createElement(Harness, { list: shots })); });
    await React.act(async () => { q('[data-bs-photo-close]').click(); });
    assert.equal(q('[data-bs-photo-viewer]'), null, '× did not close it');
  } finally {
    await React.act(async () => { root.unmount(); });
    Object.assign(globalThis, saved);
  }
});

test('the viewer portals into the phone\'s surface, over the tab bar, as every sheet does', () => {
  const src = stripComments(readFileSync(SRC.replace(/iosAppBroadsheetClient\.jsx$/, 'BSProfileMagazine.jsx'), 'utf8'));
  const body = src.slice(src.indexOf('export function BSPhotoViewer('));
  assert.match(body, /document\.getElementById\('bs-phone-surface'\)/);
  assert.match(body, /return host \? createPortal\(view, host\) : view;/);
});
