// The session details page in the Wall's magazine look (owner, 2026-10-24: "the session details page now
// needs to match the new wall feed design", then "yes i like it" on the preview). Its one accent is the
// magazine's red on every session (the "living instrument" temperature is retired); the headline is the
// Wall's face over a heavy rule; the summary figures are flat figures under a hairline, not plates; the
// zones run grey to red; the faces are the flat facets; the buttons are square.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';

const mod = await loadBroadsheet(['BSActivityDetail', 'BSIbTile', 'BSIbZoneBar', 'BSIbTable', 'bsIbRpeDial', 'BSFacetAvatar', 'BSFeedComment']);

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
  assert.equal(h.props.children, 'Lower push · Block 2', 'no coloured full stop after the title');
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
  assert.equal(num.props.style.fontFamily, THEME.HEADLINE || THEME.DISPLAY, 'the Wall\'s headline face (bsWsHead)');
  // The figure counts up (BSSdCountUp) and the harness doesn't run its effect; its unit is set apart.
  assert.match(tile.text, /bpm/);
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
