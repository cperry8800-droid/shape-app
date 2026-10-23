// tests/wall-story.test.mjs
//
// The Wall in the magazine look (owner, 2026-10-23: the dark magazine design, its headlines in Oswald,
// "use oswald", and "keep the same likes and comments"). The Wall's cards ask for variant "magazine":
// a story head (a picture or the route with the headline over it, or the headline alone), the byline,
// three figures or a record's one number, and the co-signing coach's own line pulled out. Everything
// under that (the reactions, the faces, the comments) is the card it always was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, SHIM, THEME, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

globalThis.BSPlate = ({ children }) => SHIM.createElement('div', null, children);
globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
const { BSActivityCard: Card, COMMUNITY_ACTIVITIES } = await loadBroadsheet(['BSActivityCard', 'COMMUNITY_ACTIVITIES']);

const ctx = () => ({
  t: THEME, cardInk: '#111', muted: '#777', hair: '#ddd', card: {},
  actLikes: {}, actComments: {}, actCmtOpen: null, actDetailsOpen: {}, actCoSign: {}, actExpr: {},
  exprOpenKey: null, setExprOpenKey() {}, lpTimerRef: { current: null }, lpFiredRef: { current: false },
  tierByUser: {}, avatarByUser: {}, feedAvatars: {}, myRole: 'client', coachClientIds: null,
  myFollowingSet: new Map(),
  setOpenProfile() {}, setActivityDetail() {}, setLikerSheetFor() {}, setSendPostFor() {},
  feedApplyReaction() {},
});
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const demo = (who) => COMMUNITY_ACTIVITIES.find((a) => a.who === who);

test('a record reads as a story: its kicker and headline, one big number, and the coach\'s own line pulled out', () => {
  const a = demo('Priya Shah');
  const d = drive(Card, { a, ctx: ctx(), isLast: false, pagePad: 0, variant: 'magazine' });
  const nodes = d.nodes();
  const head = nodes.find(named('BSWallStoryHead'));
  assert.ok(head, 'no story head');
  assert.equal(head.props.kicker, 'New PR · Gold St. Barbell · NYC');
  assert.equal(head.props.title, 'Deadlift — new PR');
  assert.equal(head.props.name, 'Priya Shah');
  assert.match(head.props.meta, /^PEAK · /, 'the tier, then the time');
  const record = nodes.find(named('BSWallStoryRecord'));
  assert.ok(record && /\d/.test(record.props.value), 'a record shows its number');
  assert.ok(!nodes.find(named('BSWallStoryFigures')), 'a record is one number, not three');
  // Dana Lewis co-signed it and left a comment: that comment is the quote.
  const quote = nodes.find(named('BSWallStoryQuote'));
  assert.ok(quote, 'the co-signing coach\'s line was not pulled out');
  assert.equal(quote.props.text, 'Exactly what we trained for. Proud of you.');
  assert.match(quote.props.cite, /^Dana Lewis · co-signed/);
  // The old record plate is not drawn under the story.
  assert.ok(!nodes.find(named('BSDotNumber')), 'the dot-matrix figure is the old card');
  assert.doesNotMatch(d.text, /HR zones|Heart rate/, 'the zones and the trace are the old card');
  // The reactions and comments are the card's own, unchanged.
  const react = nodes.find((n) => n.type === 'button' && /^Beast · 41$/.test(String(n.props['aria-label'] || '')));
  assert.ok(react, 'the reaction button, worded for a PR, with its count');
  assert.ok(nodes.find((n) => n.type === 'button' && /^Comments · 6$/.test(String(n.props['aria-label'] || ''))), 'the comment door');
  assert.match(d.text, /Comments · 6 ›/, 'the comments line');
  assert.ok(nodes.find((n) => n.props && n.props['data-bs-wall-story-rule'] != null), 'stories are split by a hairline');
});

test('a run reads as a story: the route is its picture, three figures under it, and no "GPS not recorded"', () => {
  const a = demo('Drew Oyelaran');
  const d = drive(Card, { a, ctx: ctx(), isLast: true, pagePad: 0, variant: 'magazine' });
  const nodes = d.nodes();
  const head = nodes.find(named('BSWallStoryHead'));
  assert.equal(head.props.kicker, 'Run · East River Loop · NYC');
  assert.ok(head.props.route && head.props.route.points.length >= 2, 'the route is the picture');
  assert.equal(head.props.photo, null);
  const figs = nodes.find(named('BSWallStoryFigures'));
  // The hero, then the session ranking's lead: not the first three of a dozen stats.
  assert.deepEqual(figs.props.items.map((r) => r[0]), ['Distance', 'Avg pace', 'Time']);
  assert.doesNotMatch(d.text, /GPS · Not recorded/);
  assert.ok(!nodes.find((n) => n.props && n.props['data-bs-wall-story-rule'] != null), 'the last story ends without a rule');
});

test('a post\'s photo is the story\'s picture, drawn once', () => {
  const a = { real: true, kind: 'workout', who: 'Maya Patel', role: 'Nutritionist', ago: '5h', typeLabel: 'Meal', title: 'Sunday prep', photo: 'https://cdn.test/prep.jpg', statsRow: [['Kcal', '620']], postId: 'p1', kudos: 3 };
  const nodes = drive(Card, { a, ctx: ctx(), isLast: true, pagePad: 0, variant: 'magazine' }).nodes();
  assert.equal(nodes.find(named('BSWallStoryHead')).props.photo, 'https://cdn.test/prep.jpg');
  assert.ok(!nodes.find((n) => n.type === 'img'), 'the photo was drawn again under the story');
});

test('the profiles keep the record card: the magazine is the Wall\'s alone', () => {
  const nodes = drive(Card, { a: demo('Priya Shah'), ctx: ctx(), isLast: true, pagePad: 0, variant: 'wall' }).nodes();
  assert.ok(!nodes.find(named('BSWallStoryHead')), 'a profile card became a story');
});

// ── The story's own pieces, drawn with real React ─────────────────────────────
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const STORY = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWallStory.jsx'), { registry: new Map([['react', React]]) });

async function render(el) {
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.useBS = () => ({ ...THEME, HEADLINE: 'oswald', DISPLAY: 'display', MONO: 'mono', BODY: 'body', isLight: false, INK: '#f1ece1', INK50: '#999', HAIR: '#333' });
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, done: async () => { await React.act(async () => { root.unmount(); }); host.remove(); Object.assign(globalThis, saved); } };
}

test('the head: a picture carries the headline in Oswald capitals; with none the headline stands alone', async () => {
  const calls = [];
  let r = await render(React.createElement(STORY.BSWallStoryHead, { kicker: 'Run · East River Loop', title: 'Long run', route: { points: [[0, 90], [50, 20], [100, 60]] }, name: 'Drew Oyelaran', meta: 'LEGEND · 34m ago', onOpen: () => calls.push('open'), onAuthor: () => calls.push('author') }));
  try {
    const pic = r.host.querySelector('[data-bs-wall-story-pic]');
    assert.ok(pic && pic.querySelector('svg polyline'), 'the route is drawn as the picture');
    assert.ok(!pic.querySelector('svg circle'), 'the marks are drawn apart from the stretched line, so they stay round');
    const h = r.host.querySelector('h3');
    assert.equal(h.textContent, 'Long run');
    assert.equal(h.style.fontFamily, 'oswald');
    assert.equal(h.style.textTransform, 'uppercase');
    assert.match(r.host.textContent, /Run · East River Loop/);
    assert.match(r.host.textContent, /Drew Oyelaran · LEGEND · 34m ago/);
    await React.act(async () => { pic.click(); });
    await React.act(async () => { r.host.querySelector('button').click(); });
    assert.deepEqual(calls, ['open', 'author']);
  } finally { await r.done(); }
  r = await render(React.createElement(STORY.BSWallStoryHead, { kicker: 'Strength', title: 'Lower body', name: 'Casey Morgan' }));
  try {
    assert.ok(!r.host.querySelector('[data-bs-wall-story-pic]'), 'a picture with nothing to show');
    assert.equal(r.host.querySelector('h3').textContent, 'Lower body');
  } finally { await r.done(); }
});

test('the figures, the record and the quote', async () => {
  let r = await render(React.createElement(STORY.BSWallStoryFigures, { items: [['Distance', '18.2 mi'], ['Pace', '8:42/mi'], ['Time', '2:38'], ['Avg HR', '154']] }));
  try {
    const grid = r.host.querySelector('[data-bs-wall-story-figs]');
    assert.equal(grid.children.length, 3, 'three figures at most');
    assert.equal(grid.textContent, '18.2 miDistance8:42/miPace2:38Time');
  } finally { await r.done(); }
  r = await render(React.createElement(STORY.BSWallStoryRecord, { value: '245 lb', best: '↑ PR +10 lb' }));
  try {
    assert.equal(r.host.textContent, '245lb↑ PR +10 lb');
    assert.equal(r.host.querySelector('[data-bs-wall-story-record] span').style.fontSize, '48px', 'the record is a big number, not a poster');
  } finally { await r.done(); }
  r = await render(React.createElement(STORY.BSWallStoryQuote, { text: '', cite: 'x' }));
  try { assert.equal(r.host.textContent, '', 'no words, no quote'); } finally { await r.done(); }
  r = await render(React.createElement(STORY.BSWallStoryQuote, { text: 'Depth was clean.', cite: 'Coach Jordan · co-signed · Coach' }));
  try { assert.equal(r.host.textContent, '“Depth was clean.Coach Jordan · co-signed · Coach'); } finally { await r.done(); }
});

test('the masthead: the Wall\'s name in Oswald capitals, the day and who is training, and the types as tabs', async () => {
  const picked = [];
  const types = [['all', 'All'], ['workouts', 'Workouts'], ['runs', 'Runs'], ['prs', 'PRs']];
  let r = await render(React.createElement(STORY.BSWallMasthead, { title: 'The Wall', dateline: 'Thursday, Oct 23', trainingLine: '3 training now', types, typesLabel: 'Filter by activity type', type: 'runs', onType: (k) => picked.push(k) }));
  try {
    assert.equal(r.host.querySelector('[data-bs-wall-masthead]').style.margin, '0px 12px', 'on the cards\' gutter, as the live story is');
    const h = r.host.querySelector('[data-bs-wall-masthead] h2');
    assert.equal(h.textContent, 'The Wall');
    assert.equal(h.style.fontFamily, 'oswald');
    assert.equal(h.style.textTransform, 'uppercase');
    assert.match(r.host.textContent, /Thursday, Oct 233 training now/);
    const nav = r.host.querySelector('nav');
    assert.equal(nav.getAttribute('aria-label'), 'Filter by activity type');
    const tabs = [...nav.querySelectorAll('button')];
    assert.deepEqual(tabs.map((b) => b.textContent), ['All', 'Workouts', 'Runs', 'PRs']);
    assert.deepEqual(tabs.map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false'], 'the type shown is the pressed tab');
    assert.ok(tabs.every((b) => b.style.minHeight === '44px'), 'every tab is a full touch target');
    await React.act(async () => { tabs[3].click(); });
    assert.deepEqual(picked, ['prs']);
  } finally { await r.done(); }
  r = await render(React.createElement(STORY.BSWallMasthead, { title: 'The Wall', dateline: 'Thursday, Oct 23', types, type: 'all' }));
  try { assert.doesNotMatch(r.host.textContent, /training now/, 'nobody training, no count'); } finally { await r.done(); }
});

test('the Wall opens on its masthead, whose tabs are the type filter the ALL ▾ select was', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.doesNotMatch(src, /<select value=\{feedType\}/, 'the select is gone');
  const at = src.indexOf('<BSWallMasthead ');
  assert.ok(at > 0, 'the Wall draws its masthead');
  const call = src.slice(at, src.indexOf('/>', at));
  assert.match(call, /type=\{feedType\} onType=\{setFeedType\}/, 'its tabs filter the Wall');
  for (const k of ['all', 'workouts', 'runs', 'prs', 'nutrition', 'milestones']) assert.match(call, new RegExp(`\\['${k}', tr\\('feed:type\\.${k}'`), k);
  // The count is the live story's people: in a workout, under Universal, with the rail on.
  assert.match(src, /const trainingNow = railOn && feedMode === 'universal' \? railPeople\.filter\(\(p\) => p && p\.activity === 'workout'\)\.length : 0;/);
  assert.ok(at < src.indexOf('<BSWallTrainingNow '), 'the masthead heads the live story');
});
