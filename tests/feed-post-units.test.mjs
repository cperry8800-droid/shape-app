// tests/feed-post-units.test.mjs
//
// ONE POST, ONE SYSTEM OF UNITS.
//
// ⚠ THE OWNER'S SCREENSHOT, 2026-10-05: a feed swim read "Masters swim · 1.2 mi"
// over a "2,000 m" plate, "1:42/100m" paces and "2,000 m" in its stats. The
// title's km was on the converter's whitelist and the swim's metres were not,
// so one card quoted two systems. The same gap showed a metric member "19.3 mph"
// and "540 ft" beside kilometres.
//
// These render the REAL card over the REAL demo corpus under both settings and
// assert that no figure it draws is in the other system. The member's own note
// (`a.body`) is excluded on purpose: the card never rewrites someone's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';
import { bsSdUnitizeText, bsSdUnitizeStat } from '../mobile-app/src/services/sessionLedger.mjs';
import { bsPaceSplits } from '../mobile-app/src/services/paceSplits.mjs';

// The client module reads `useBS` off the window ONCE, when it loads. A switch
// installed before the load lets the session page render under either setting.
let CURRENT = THEME;
globalThis.useBS = () => CURRENT;
const { BSActivityCard, BSActivityDetail, COMMUNITY_ACTIVITIES, bsActivityFromPost } = await loadBroadsheet(['BSActivityCard', 'BSActivityDetail', 'COMMUNITY_ACTIVITIES', 'bsActivityFromPost']);

const KG = { weight: 'kg', distance: 'km', length: 'cm' };
const LB = { weight: 'lb', distance: 'mi', length: 'in' };

// The harness THEME is imperial. A metric one differs only in its converters.
const themeFor = (prefs) => new Proxy({}, {
  get: (_, k) => (k === 'uText' ? (x, o) => bsSdUnitizeText(x, prefs, o)
    : k === 'uStat' ? (l, x, o) => bsSdUnitizeStat(l, x, prefs, o)
    : k === 'unitPrefs' ? prefs
    : k === 'isMetric' ? prefs === KG
    : THEME[k]),
  has: () => true,
});

const ctxFor = (prefs) => ({
  t: themeFor(prefs), cardInk: '#111', muted: '#777', hair: '#ddd', card: {},
  actLikes: {}, actComments: {}, actCmtOpen: null, actDetailsOpen: {}, actCoSign: {}, actExpr: {},
  exprOpenKey: null, setExprOpenKey() {}, lpTimerRef: { current: null }, lpFiredRef: { current: false },
  tierByUser: {}, avatarByUser: {}, feedAvatars: {}, myRole: 'client', coachClientIds: null,
  myFollowingSet: new Map(),
  setOpenProfile() {}, setActivityDetail() {}, setLikerSheetFor() {}, setSendPostFor() {},
  feedApplyReaction() {},
});

// ⚠ THE HARNESS'S `.text` JOINS ELEMENTS WITH NOTHING BETWEEN THEM, so a stat
// "2,000 m" followed by the next label read "2,000 mAvg pace", and a unit guard
// that refuses a following letter could never see it: the first version of the
// corpus sweep below PASSED ON THE UNFIXED CODE. Each element's own text is one
// entry here, and entries are joined with a space.
const leaves = (node, out = []) => {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) { for (const n of node) leaves(n, out); return out; }
  if (typeof node !== 'object' || !node.props) return out;
  const kids = [].concat(node.props.children == null ? [] : node.props.children).flat(Infinity);
  const own = kids.filter((k) => typeof k === 'string' || typeof k === 'number').join('');
  if (own.trim()) out.push(own.trim());
  for (const k of kids) if (k && typeof k === 'object') leaves(k, out);
  return out;
};
const entriesOf = (a, prefs, variant) =>
  leaves(drive(BSActivityCard, { a, ctx: ctxFor(prefs), isLast: true, pagePad: 0, variant }).nodes()[0]);
const render = (a, prefs, variant = 'feed') => entriesOf(a, prefs, variant).join(' ');
// The hero's figure counts up, so under this harness only its UNIT renders, as
// an element of its own ("Distance" then "yd"). A unit standing alone is still
// a claim about which system the figure is in.
const IMPERIAL_UNIT = new Set(['mi', 'yd', 'yds', 'ft', 'mph', 'lb', 'lbs']);
const METRIC_UNIT = new Set(['km', 'm', 'kg', 'km/h']);

// Figures in a system's units. A bare `m` only counts beside a grouped or
// spaced number, so "34m" (minutes ago) and "8h 10m" (sleep) are not metres.
const IMPERIAL_FIG = /\d\s*(?:mi|yd|yds|ft|mph|lbs?)(?![\w-])|\/\s*(?:mi|100\s*yd)\b/i;
const METRIC_FIG = /\d\s*(?:km|kg|km\/h)(?![\w-])|\/\s*(?:km|100\s*m)\b|\d,\d{3}\s*m(?![\w/-])|\d\s+m(?![\w/-])/i;

const lena = () => COMMUNITY_ACTIVITIES.find((a) => a.who === 'Lena Fischer');

test('the screenshot\'s swim: an imperial reader reads yards everywhere, title and plate alike', () => {
  for (const variant of ['feed', 'wall']) {
    const text = render(lena(), LB, variant);
    assert.match(text, /Masters swim · 2,187 yd/, `${variant}: the title is in yards`);
    assert.match(text, /2,187/, `${variant}: the plate states the same distance`);
    assert.doesNotMatch(text, /1\.2 mi/, `${variant}: the title still says miles`);
    assert.doesNotMatch(text, /2,000 m|\/100m/, `${variant}: a metric figure survived`);
  }
  assert.match(render(lena(), LB, 'wall'), /1:33\/100yd/, 'the pace is per 100 yd');
});

test('the same swim for a metric reader: metres everywhere, including the title', () => {
  for (const variant of ['feed', 'wall']) {
    const text = render(lena(), KG, variant);
    assert.match(text, /Masters swim · 2,000 m/, `${variant}: the title is in metres`);
    assert.doesNotMatch(text, /\d\s*(?:mi|yd)\b/, `${variant}: an imperial figure survived`);
  }
});

test('EVERY demo post, both settings, both variants: no figure in the other system', () => {
  assert.ok(COMMUNITY_ACTIVITIES.length >= 8, 'the corpus shrank; this sweep would prove little');
  const failures = [];
  for (const a of COMMUNITY_ACTIVITIES) {
    for (const variant of ['feed', 'wall']) {
      for (const [prefs, other, name] of [[LB, METRIC_FIG, 'imperial'], [KG, IMPERIAL_FIG, 'metric']]) {
        const body = String(a.body || '');
        const entries = entriesOf(a, prefs, variant);
        const text = entries.join(' ').split(body).join('');
        const hit = text.match(other);
        if (hit) failures.push(`${a.who} (${variant}, ${name}): "${hit[0]}" in …${text.slice(Math.max(0, hit.index - 30), hit.index + 20)}…`);
        const lone = entries.find((e) => (prefs === LB ? METRIC_UNIT : IMPERIAL_UNIT).has(e.trim().toLowerCase()));
        if (lone) failures.push(`${a.who} (${variant}, ${name}): a "${lone}" unit label`);
      }
    }
  }
  assert.deepEqual(failures, [], `figures in the other system:\n${failures.join('\n')}`);
});

test('a real swim states its distance from the metres the provider measured', () => {
  // Importers store "1.24 mi" (8 m of rounding); converted for a reader it read
  // "1,996 m". The post's own distanceMeter is exact.
  const post = {
    id: 'p1', workout: 'swim', status: 'Morning swim', hasRealStats: true,
    workoutStats: [{ label: 'Distance', value: '1.24 mi' }, { label: 'Pace', value: '1:42/100m' }, { label: 'Time', value: '34 min' }],
    rawMetrics: { distanceMeter: 2000 },
  };
  const a = bsActivityFromPost(post);
  const dist = (a.fullStats || a.statsRow).find((r) => r[0] === 'Distance');
  assert.equal(dist[1], '2,000 m');
  assert.equal(bsSdUnitizeStat('Distance', dist[1], LB, { sport: a.activityType }), '2,187 yd');
  // A run keeps its stored distance: only a swim is stated from metres.
  const run = bsActivityFromPost({ ...post, workout: 'run', rawMetrics: { distanceMeter: 2000 } });
  assert.equal((run.fullStats || run.statsRow).find((r) => r[0] === 'Distance')[1], '1.24 mi');
  // And a swim without the provider's metres keeps what it has.
  const bare = bsActivityFromPost({ ...post, rawMetrics: {} });
  assert.equal((bare.fullStats || bare.statsRow).find((r) => r[0] === 'Distance')[1], '1.24 mi');
});

test('a ride\'s splits in km/h still rank the fastest split fastest', () => {
  // ⚠ A converted breakdown reaches the split model as "31.1 km/h". Without a
  // km/h branch it read as a bare number where LOWER is FASTER, inverting the
  // ranking for every metric reader.
  const rows = [{ label: 'Lap 1', pace: '28.0 km/h' }, { label: 'Lap 2', pace: '33.5 km/h' }, { label: 'Lap 3', pace: '30.1 km/h' }];
  const data = bsPaceSplits({ providerSplits: rows, sport: 'ride' });
  assert.equal(data.splits[data.bestIdx].label, 'Lap 2');
  assert.equal(data.splits[1].paceLabel, '33.5 km/h');
  // The same ride in mph ranks the same way.
  const mph = bsPaceSplits({ providerSplits: rows.map((r) => ({ ...r, pace: bsSdUnitizeText(r.pace, LB) })), sport: 'ride' });
  assert.equal(mph.splits[mph.bestIdx].label, 'Lap 2');
});

// ── the session page a card opens ───────────────────────────────────────────
// Opened the way a tap opens it: the card's own hero handler builds the page's
// data, so the conversions under test are the ones the app actually runs.
const pageEntries = (a, prefs) => {
  let captured = null;
  const ctx = { ...ctxFor(prefs), setActivityDetail: (d) => { captured = d; } };
  const card = drive(BSActivityCard, { a, ctx, isLast: true, pagePad: 0, variant: 'feed' });
  const hero = card.nodes().find((n) => n.props && n.props['aria-label'] === 'Open session details');
  assert.ok(hero, `${a.who}: the card's hero is not tappable`);
  hero.props.onClick();
  assert.ok(captured, `${a.who}: tapping the hero opened nothing`);
  CURRENT = themeFor(prefs);
  try {
    const nodes = drive(BSActivityDetail, {
      d: captured, liked: false, count: 0, myExpr: null, comments: [], feedAvatars: {},
      onClose() {}, onReact() {}, onProfile() {}, onOpenLikers() {}, draft: '', setDraft() {}, onSend() {},
    }).nodes();
    // ⚠ THIS HARNESS DOES NOT RENDER NESTED COMPONENTS, so the tiles, the split
    // table, the bars and the charts never appear as text — a first version of
    // the page sweep saw only the page's own headings. What they WOULD draw is
    // in their props, so those strings are read too.
    const fromProps = [];
    for (const n of nodes) {
      if (typeof n.type !== 'function' || !FIGURE_PROPS[n.type.name]) continue;
      for (const k of FIGURE_PROPS[n.type.name]) strings(n.props[k], fromProps);
    }
    return [...leaves(nodes[0]), ...fromProps];
  } finally { CURRENT = THEME; }
};

// The props each charting component draws its figures from.
const FIGURE_PROPS = {
  BSIbTable: ['head', 'rows'], BSIbTiles: ['tiles', 'rest'], BSSdBars: ['rows'],
  BSSdPaceBars: ['data'], BSSdTrace: ['unit'], BSSdCountUp: ['text'],
};
const strings = (v, out) => {
  if (v == null || typeof v === 'function' || typeof v === 'boolean') return out;
  if (typeof v === 'string') { if (v.trim()) out.push(v.trim()); return out; }
  if (typeof v === 'number') { out.push(String(v)); return out; }
  if (Array.isArray(v)) { for (const x of v) strings(x, out); return out; }
  if (typeof v === 'object' && !v.$$typeof) for (const [k, x] of Object.entries(v)) if (k !== 't') strings(x, out);
  return out;
};

test('EVERY demo session page, both settings: no figure in the other system', () => {
  const failures = [];
  for (const a of COMMUNITY_ACTIVITIES) {
    for (const [prefs, other, name] of [[LB, METRIC_FIG, 'imperial'], [KG, IMPERIAL_FIG, 'metric']]) {
      const entries = pageEntries(a, prefs);
      const text = entries.join(' ').split(String(a.body || '')).join('');
      const hit = text.match(other);
      if (hit) failures.push(`${a.who} (${name}): "${hit[0]}" in …${text.slice(Math.max(0, hit.index - 40), hit.index + 20)}…`);
      const lone = entries.find((e) => (prefs === LB ? METRIC_UNIT : IMPERIAL_UNIT).has(e.trim().toLowerCase()));
      if (lone) failures.push(`${a.who} (${name}): a "${lone}" unit label`);
    }
  }
  assert.deepEqual(failures, [], `figures in the other system:\n${failures.join('\n')}`);
});

test('a breakdown\'s climbs are converted once, not twice', () => {
  // ⚠ The card converts a breakdown for the reader before the page sees it, and
  // the split table converts climbs from feet. Without stating the breakdown's
  // climbs back in feet first, a metric reader's 100 ft climb read "+9", not "+30".
  const run = {
    kind: 'workout', typeLabel: 'Run', activityType: 'run', who: 'Hill Runner', role: 'Client', city: 'Test', tier: 'BASE', ago: '1h',
    body: '', title: 'Hill run · 3 mi', stats: [['Distance', '3 mi'], ['Avg pace', '8:00/mi'], ['Time', '24:00']],
    breakdown: { label: 'Mile splits', rows: [['Mile 1', '8:10/mi', '+100 ft'], ['Mile 2', '7:50/mi', '-40 ft'], ['Mile 3', '8:00/mi', '+20 ft'], ['Mile 4', '8:05/mi', '+12 ft']] },
    kudos: 0, replies: 0,
  };
  const metric = pageEntries(run, KG);
  assert.ok(metric.includes('+30'), `a 100 ft climb should read +30 (m): ${metric.filter((e) => /^[+-]\d+$/.test(e)).join(' ')}`);
  assert.ok(!metric.includes('+9'), 'the climb was converted twice');
  // A small climb keeps the decimal the card writes it with ("+3.7 m"), not "4".
  assert.ok(metric.includes('+3.7'), 'a 12 ft climb lost its decimal in the split table');
  const imperial = pageEntries(run, LB);
  assert.ok(imperial.includes('+100'), 'an imperial reader keeps feet');
  // And the splits' paces are in the reader's units.
  assert.ok(metric.some((e) => /\/km$/.test(e)) && !metric.some((e) => /\/mi$/.test(e)), 'a split pace stayed in /mi');
});

test('a breakdown row is not a stat: a movement named "climb" or "stride" keeps its unit', () => {
  // ⚠ FOUND IN REVIEW (Fable, #2205): breakdown rows went through the stat
  // converter, whose label rules read the MOVEMENT NAME as a stat label, so
  // "Hill climb · 6 × 200 m" became "656 ft" beside "Flat · 2 × 400 m".
  const session = {
    kind: 'workout', typeLabel: 'Run', activityType: 'run', who: 'Track Runner', role: 'Client', city: 'Test', tier: 'BASE', ago: '1h',
    body: '', title: 'Hill session', stats: [['Distance', '5 mi'], ['Time', '45:00']],
    breakdown: { label: 'Working sets', rows: [['Hill climb', '6 × 200 m', 'RPE 8'], ['Stride outs', '4 × 80 m', 'RPE 6'], ['Flat', '2 × 400 m', 'RPE 7']] },
    kudos: 0, replies: 0,
  };
  let captured = null;
  const ctx = { ...ctxFor(LB), setActivityDetail: (d) => { captured = d; } };
  const card = drive(BSActivityCard, { a: session, ctx, isLast: true, pagePad: 0, variant: 'feed' });
  card.nodes().find((n) => n.props && n.props['aria-label'] === 'Open session details').props.onClick();
  assert.deepEqual(captured.breakdown.rows.map((r) => r[1]), ['6 × 200 m', '4 × 80 m', '2 × 400 m'], 'a set row was read as a stat');
});
