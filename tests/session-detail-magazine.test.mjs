// The session details page in the Wall's magazine look (owner, 2026-10-24: "the session details page now
// needs to match the new wall feed design", then "yes i like it" on the preview). Its one accent is the
// magazine's red on every session (the "living instrument" temperature is retired); the headline is the
// Wall's face over a heavy rule; the summary figures are flat figures under a hairline, not plates; the
// zones run grey to red; the faces are the flat facets; the buttons are square.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';

const mod = await loadBroadsheet(['BSActivityDetail', 'BSIbTile', 'BSIbZoneBar', 'BSIbTable', 'bsIbRpeDial', 'BSFacetAvatar', 'BSFeedComment', 'BSSdBars', 'BSActivityCard']);

// The magazine's red on a light paper (bsWsRed).
const RED = '#b23a1f';
const RAMP = ['#8c877e', '#b9a189', '#df8d6a', '#e6623c', '#c8321a'];

const DETAIL = {
  key: 'k1', focus: 'stats', tc: '#a07a2e', who: 'Quinn Harper', tierDisplay: 'TEMPO', role: 'Client',
  roleKind: 'CLIENT', realTier: 'tempo', city: 'Brooklyn', ago: '2h', typeLabel: 'STRENGTH', verb: 'Respect',
  title: 'Lower push · Block 2', body: 'Bar speed held.', avatarPhoto: null, coSign: { name: 'Dana Lewis', role: 'coach' }, showRoute: false,
  heroStat: ['Top set', '245 lb'], prDelta: '+10 lb',
  detailStats: [['Top set', '245 lb'], ['Total sets', '18'], ['Avg HR', '136 bpm'], ['Max HR', '159 bpm'], ['Calories', '440']],
  // A hard session: before this change its temperature ran hot, so a red here is the magazine's, not the zones'.
  zones: [['Z1', 2], ['Z2', 8], ['Z3', 20], ['Z4', 40], ['Z5', 30]],
  trace: [102, 116, 130, 118, 108, 122, 138, 126, 112, 124],
  breakdown: { label: '', rows: [['Set 1', '225 lb × 3', 'RPE 7', { rpe: 7 }], ['Set 2', '245 lb × 3', 'RPE 9 · PR', null]] },
  followedLikers: [{ name: 'Maya Okafor' }], allLikers: [{ name: 'Maya Okafor' }],
  a: { real: false, body: 'Bar speed held.', postId: null, created_at: null, userId: null },
};
const page = (over = {}) => drive(mod.BSActivityDetail, {
  d: { ...DETAIL, ...(over.d || {}) }, liked: false, count: 12, myExpr: null,
  comments: [{ who: 'A', text: 'nice' }], feedAvatars: {},
  onClose() {}, onReact() {}, onProfile() {}, onOpenLikers() {}, draft: '', setDraft() {}, onSend() {},
});
const styled = (api, pred) => api.nodes().filter((n) => n.props && n.props.style && pred(n.props.style, n));

test('the headline is the Wall\'s face over a heavy rule, and the sport is a red kicker, not a chip', () => {
  const api = page();
  const h = api.nodes().find((n) => n.type === 'h2');
  assert.ok(h, 'no headline');
  // No coloured full stop after the title, and the " · " stays with the word before it, so a wrap never
  // starts a line on the dot.
  assert.equal(h.props.children, 'Lower push\u00a0· Block 2');
  assert.equal(h.props.style.textTransform, 'uppercase');
  assert.equal(h.props.style.borderBottom, `3px solid ${THEME.INK}`);
  const kick = api.nodes().find((n) => n.type === 'span' && n.props.children === 'STRENGTH');
  assert.equal(kick.props.style.color, RED);
  assert.equal(kick.props.style.background, undefined, 'the sport is no longer a filled chip');
});

test('one accent, the magazine\'s red, whatever the session\'s intensity; no heat rail', () => {
  const api = page();
  // The set table marks its best row in the page's accent.
  const table = api.nodes().find((n) => n.type === mod.BSIbTable);
  assert.equal(table.props.heat, RED);
  // The rail and its breathing tick are gone.
  assert.equal(styled(api, (s) => /bsSdGrowY|bsSdPrBreath/.test(String(s.animation || ''))).length, 0);
  // The co-sign is an outlined line with a red check, not a filled pill.
  const cosign = api.nodes().find((n) => n.type === 'button' && /Dana Lewis/.test(JSON.stringify(n.props.children)));
  assert.equal(cosign.props.style.background, 'transparent');
  assert.equal(cosign.props.style.borderRadius, 0);
});

test('every face on the page is the flat facet', () => {
  const api = page();
  const faces = api.nodes().filter((n) => n.type === mod.BSFacetAvatar);
  assert.ok(faces.length >= 2, 'the byline and the reaction faces');
  for (const f of faces) {
    assert.equal(f.props.flat, true, 'a glowing tier gem on the session page');
    assert.equal(f.props.c, THEME.INK);
  }
  const cmts = page({ d: { focus: 'comments' } });
  const row = cmts.nodes().find((n) => n.type === mod.BSFeedComment);
  assert.equal(row.props.flat, true);
});

test('the sticky bar\'s buttons are square', () => {
  const api = page();
  // The react and comments buttons are the bar's two 30px-high buttons.
  const bar = api.nodes().filter((n) => n.type === 'button' && n.props.style && n.props.style.minHeight === 30);
  assert.equal(bar.length, 2);
  for (const b of bar) assert.equal(b.props.style.borderRadius, 0);
});

test('a summary figure is flat: the number in the headline face under a hairline, no plate', () => {
  const tile = drive(mod.BSIbTile, { label: 'Avg HR', value: '161 bpm', kind: 'plain', heat: RED, t: THEME });
  const btn = tile.nodes().find((n) => n.type === 'button');
  assert.match(btn.props.style.borderTop, /^1px solid /);
  assert.equal(styled(tile, (s) => !!s.clipPath).length, 0, 'the notched plate is back');
  assert.equal(styled(tile, (s) => s.width === 2 && s.position === 'absolute').length, 0, 'the spine is back');
  const num = styled(tile, (s) => s.fontSize === 24)[0];
  assert.equal(num.props.style.fontFamily, THEME.DISPLAY, 'the headline face (bsWsHead), the app\'s own');
  // The figure counts up (BSSdCountUp) and the harness doesn't run its effect. A heart rate has no unit
  // beside it: its label says HR.
  assert.doesNotMatch(tile.text, /bpm/i);
});

test('the zones run warm grey to the magazine\'s red, in the bar and the RPE dial', () => {
  const bar = drive(mod.BSIbZoneBar, { zones: [['Z1', 32], ['Z2', 36], ['Z3', 22], ['Z4', 8], ['Z5', 2]], heat: RED, t: THEME });
  const segs = bar.nodes().filter((n) => n.type === 'span' && n.props['aria-hidden']).map((n) => n.props.style.background);
  assert.deepEqual(segs, RAMP);
  const ring = (rpe) => mod.bsIbRpeDial(rpe, THEME).props.children[1].props.stroke;
  assert.equal(ring(9), RAMP[4]);
  assert.equal(ring(8), RAMP[3]);
  assert.equal(ring(6), RAMP[1]);
});

// Owner: "make the cadence numbers match too". The session page asks BSSdBars for the Wall's figures; the
// profile's record sections, which share it, keep theirs.
test('the cadence figures are in the Wall\'s headline face on the session page only', () => {
  const fig = (props) => {
    const api = drive(mod.BSSdBars, { rows: [['Seg 1', '173 spm', ''], ['Seg 2', '181 spm', '']], perf: [1, 2], bestIdx: 1, heat: RED, t: THEME, muted: '#777', ...props });
    return api.nodes().find((n) => n.type === 'span' && n.props.children === '173 spm').props.style;
  };
  assert.equal(fig({ mag: true }).fontFamily, THEME.DISPLAY);
  assert.equal(fig({ mag: true }).fontSize, 17);
  assert.equal(fig({}).fontFamily, THEME.DISPLAY, 'the profile records keep their face');
  // No breathing halo or burst on the best bar on the session page, and square ends.
  const bestBar = (props) => drive(mod.BSSdBars, { rows: [['Seg 1', '173 spm', ''], ['Seg 2', '181 spm', '']], perf: [1, 2], bestIdx: 1, heat: RED, t: THEME, muted: '#777', ...props })
    .nodes().filter((n) => n.type === 'div' && n.props.style && n.props.style.background === RED);
  assert.equal(bestBar({ mag: true })[0].props.style.borderRadius, 0);
  assert.doesNotMatch(String(bestBar({ mag: true })[0].props.style.animation), /bsSdPrBreath/);
  const api = page({ d: { cadenceTrace: [170, 172, 175, 178, 180, 181, 183, 182] } });
  const bars = api.nodes().find((n) => n.type === mod.BSSdBars);
  assert.ok(bars, 'a session with a cadence trace draws its cadence');
  assert.equal(bars.props.mag, true);
});

// Owner: "make sure session details for each type of activity is updated correctly". A milestone has no
// figures, so its stamp and its own line are the page; and the power and elevation lines are ink.
test('a milestone\'s page carries its stamp and its line', () => {
  const api = page({ d: { title: 'Promoted to Staff Engineer', heroStat: null, detailStats: [], zones: null, trace: null, breakdown: null, body: '', coSign: null,
    a: { real: false, body: '', postId: null, created_at: null, userId: null, milestone: { stamp: 'promoted', detail: 'Eighteen months of showing up.' } } } });
  const block = api.nodes().find((n) => n.props && n.props['data-bs-sd-milestone'] !== undefined);
  assert.ok(block, 'no milestone block');
  assert.match(api.text, /PROMOTED/);
  assert.match(api.text, /Eighteen months of showing up\./);
  // Every other post draws none.
  assert.ok(!page().nodes().some((n) => n.props && n.props['data-bs-sd-milestone'] !== undefined));
});

test('a ride\'s power and every elevation line are ink, not the old gold and slate', () => {
  const api = page({ d: { sport: 'ride', typeLabel: 'Ride', powerTrace: [200, 240, 260, 230], elevTrace: [10, 30, 25, 40] } });
  const traces = api.nodes().filter((n) => n.props && (n.props.idKey === 'pwr' || n.props.idKey === 'elev'));
  assert.equal(traces.length, 2);
  for (const tr of traces) assert.doesNotMatch(String(tr.props.color), /#d8b25a|#8a93a0/i);
});

// The Wall's card draws a post's stored line (a sample's too, in the preview), so its page draws the same
// line instead of "GPS not recorded" under a card that shows the route.
test('the page opened from a Wall story draws the line the story draws', () => {
  const ctx = {
    t: THEME, cardInk: '#111', muted: '#777', hair: '#ddd', card: {},
    actLikes: {}, actComments: {}, actCmtOpen: null, actDetailsOpen: {}, actCoSign: {}, actExpr: {},
    exprOpenKey: null, setExprOpenKey() {}, lpTimerRef: { current: null }, lpFiredRef: { current: false },
    tierByUser: {}, avatarByUser: {}, feedAvatars: {}, myRole: 'client', coachClientIds: null, myFollowingSet: new Map(),
    setOpenProfile() {}, setLikerSheetFor() {}, setSendPostFor() {}, feedApplyReaction() {},
  };
  const opened = (a) => {
    let d = null;
    const card = drive(mod.BSActivityCard, { a, ctx: { ...ctx, setActivityDetail: (x) => { d = x; } }, isLast: true, pagePad: 0, variant: 'magazine' });
    const head = card.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSWallStoryHead');
    head.props.onOpen();
    return d;
  };
  const LINE = { points: [[4, 88], [40, 50], [96, 12]] };
  const sample = { kind: 'run', real: false, who: 'Drew Oyelaran', role: 'Client', city: 'NYC', tier: 'LEGEND', ago: '34m', title: 'Long run', body: 'Negative split.', distance: '18.2 mi', pace: '8:42/mi', duration: '2:38:14', routeObj: LINE };
  assert.equal(opened(sample).routeObj, LINE, 'the sample\'s line');
  const { routeObj, ...noLine } = sample;
  assert.equal(opened(noLine).routeObj, null, 'no stored line, no route');
});

// Owner: "but no matter what activity is, needs to be displayed correctly". Every type the app logs
// (_BS_ACTIVITY_TYPES) opens the same magazine page: the headline over its rule, the red kicker, flat
// faces, and nothing in the old palette (the teal, the gold, the living-instrument ramp, the slate).
const OLD = /#34d6c5|#2ee0c4|#0ac5a8|#d8b25a|#e8843c|#e0463c|#5b8def|#8a93a0/i;
const FOOT = [['Distance', '4.1 mi'], ['Avg pace', '9:12/mi'], ['Time', '37:44'], ['Avg HR', '141 bpm'], ['Max HR', '163 bpm'], ['Calories', '420'], ['Cadence', '172 spm'], ['Elevation', '+180 ft']];
const STATS = {
  Run: FOOT, Walk: FOOT, Hike: FOOT,
  Ride: [['Distance', '25.1 mi'], ['Avg speed', '19.3 mph'], ['Time', '1:18:04'], ['Avg power', '241 W'], ['Avg HR', '148 bpm'], ['Cadence', '89 rpm']],
  Swim: [['Distance', '2,187 yd'], ['Avg pace', '1:33/100yd'], ['Time', '34:10'], ['Avg HR', '139 bpm'], ['SWOLF', '38']],
  Rowing: [['Distance', '5,000 m'], ['Avg pace', '2:04/500m'], ['Time', '20:40'], ['Avg HR', '150 bpm'], ['Stroke rate', '24 spm']],
};
const TYPES = ['Run', 'Ride', 'Swim', 'Walk', 'Hike', 'Tennis', 'Pilates', 'Rowing', 'Golf', 'Stairmaster', 'Elliptical', 'Yoga', 'HIIT', 'Strength', 'Other'];
const styleStrings = (api) => api.nodes().flatMap((n) => {
  const out = [];
  const st = n.props && n.props.style;
  if (st) for (const v of Object.values(st)) if (typeof v === 'string') out.push(v);
  for (const k of ['heat', 'color', 'c', 'dotC', 'stroke', 'fill', 'background']) if (n.props && typeof n.props[k] === 'string') out.push(n.props[k]);
  return out;
});
for (const type of TYPES) {
  test(`${type}: the session page is the magazine page`, () => {
    const stats = STATS[type] || [['Time', '52 min'], ['Avg HR', '128 bpm'], ['Max HR', '151 bpm'], ['Calories', '380']];
    const api = page({ d: {
      title: `${type} · Session`, typeLabel: type, sport: type.toLowerCase(), heroStat: stats[0], detailStats: stats,
      breakdown: null, coSign: null,
      cadenceTrace: /Run|Walk|Hike|Ride/.test(type) ? [170, 172, 175, 178] : null,
      elevTrace: /Run|Walk|Hike|Ride/.test(type) ? [10, 30, 25, 40] : null,
      powerTrace: type === 'Ride' ? [200, 240, 260, 230] : null,
      paceTrace: /Run|Walk|Hike|Swim|Rowing/.test(type) ? [560, 548, 552, 540] : null,
    } });
    const h = api.nodes().find((n) => n.type === 'h2');
    assert.equal(h.props.style.borderBottom, `3px solid ${THEME.INK}`);
    const kick = api.nodes().find((n) => n.type === 'span' && n.props.children === type);
    assert.equal(kick.props.style.color, RED, 'the sport is the red kicker');
    for (const f of api.nodes().filter((n) => n.type === mod.BSFacetAvatar)) assert.equal(f.props.flat, true);
    const old = styleStrings(api).filter((v) => OLD.test(v));
    assert.deepEqual(old, [], 'a colour from the old palette');
  });
}
