// EVERY TILE OPENS, AND WHAT IT OPENS IS EVIDENCE THE SESSION ACTUALLY HOLDS.
//
// Owner: "make each box at the top clickable to see more info / More detailed
// breakdown." The tile is ~105px wide and carries a label, a figure, and — when
// a series exists — a 40×18px ghost at 0.2 opacity. Tapping it gives you that
// series full size plus every other reading this session holds for the stat.
//
// ⚠ THE RULE THIS FILE DEFENDS IS THE PAGE'S OWN: A TILE, A COLUMN AND A SEGMENT
// ARE CLAIMS. The sheet is ASSEMBLED from evidence rather than padded to a shape,
// so the interesting assertions are all about what must NOT appear — zones under
// a pace stat, a run's miles under `Volume`, a marker for a value the chart does
// not contain, an instrument drawn over a number that was recorded once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { bsIbTileDetail, bsIbTileFamily, bsIbTileKind, bsIbTiles, bsIbSetRowsFor } from '../mobile-app/src/services/instrumentBoard.mjs';
import { bsPaceSplits } from '../mobile-app/src/services/paceSplits.mjs';
import { bsSdNeedle, bsSdPaceTraceIn, bsSdUnitizeText } from '../mobile-app/src/services/sessionLedger.mjs';
import { bsHeroStatIndex } from '../public/newdesign/shareCard.mjs';
import { loadBroadsheet, drive, flatten, THEME, SRC } from './helpers/broadsheet-mount.mjs';

// ⚠ THE REAL CATALOG, NOT THE HARNESS'S FALLBACK. `useShapeTr` returns the
// call site's `defaultValue` when no `ShapeI18n` is installed, and it does NOT
// interpolate — so every tile's accessible name would come back as the literal
// template `'{label}, {value} — more detail'` and a test asserting that each
// name carries its own stat would be asserting on a string no user ever sees.
// Wiring the shipped `en` catalog in makes the assertion about the rendered
// name AND proves the key resolves, rather than that a default exists.
const EN = JSON.parse(readFileSync('mobile-app/src/i18n/catalogs/en/session.json', 'utf8'));
globalThis.window = globalThis.window || {};
globalThis.window.ShapeI18n = {
  t(key, opts = {}) {
    const [ns, k] = String(key).split(':');
    const raw = ns === 'session' ? EN[k] : undefined;
    if (raw == null) return undefined;   // fall through to the call site's default
    return String(raw).replace(/\{(\w+)\}/g, (m, name) => (name in opts ? String(opts[name]) : m));
  },
};

const HR = [120, 140, 176, 150];
const PACE = [548, 504, 530];
const CTX = { hrTrace: HR, paceTrace: PACE, zones: [['Z1', 6], ['Z2', 34], ['Z3', 60]] };

// ── the pure rules ──────────────────────────────────────────────────────────

test('a stat with no readable value has no sheet at all', () => {
  for (const v of [null, undefined, '', '   ', '—', '-']) {
    assert.equal(bsIbTileDetail(['Avg HR', v], CTX), null, `value ${JSON.stringify(v)}`);
  }
  assert.equal(bsIbTileDetail(['', '154 bpm'], CTX), null, 'no label');
  assert.equal(bsIbTileDetail(null, CTX), null);
});

test('a series needs two points — one reading is not a shape', () => {
  assert.equal(bsIbTileDetail(['Avg HR', '154 bpm'], { hrTrace: [154] }).series, null);
  assert.ok(bsIbTileDetail(['Avg HR', '154 bpm'], { hrTrace: [154, 160] }).series);
  // ⚠ A GAP IS DROPPED, NEVER DRAWN AS A ZERO. `Number(null)`, `Number('')` and
  // `Number([])` are all 0 AND all finite, so a finiteness check alone turns a
  // hole in the trace into a heart rate of zero — which drags the chart's low to
  // the floor and moves this tile's marker with it.
  assert.deepEqual(bsIbTileDetail(['Avg HR', '154 bpm'], { hrTrace: [150, 'x', null, '', [], true, undefined, 160] }).series, [150, 160]);
  // A numeric string is still a reading.
  assert.deepEqual(bsIbTileDetail(['Avg HR', '154 bpm'], { hrTrace: ['150', 160] }).series, [150, 160]);
});

test('the range is read off the SERIES, never off the page’s other stats', () => {
  // A page can carry "Max HR 176" while the trace it draws tops out at 160.
  const d = bsIbTileDetail(['Avg HR', '154 bpm'], { hrTrace: [140, 160] });
  assert.deepEqual(d.range, { lo: 140, hi: 160 });
  // ⚠ AND NOTHING ELSE RIDES ON `range`. A mean lived here and was deleted with
  // its render — it read as the tile's own average and was a different number.
  assert.deepEqual(Object.keys(d.range).sort(), ['hi', 'lo']);
});

test('the marker inverts for pace and does not for anything else', () => {
  // 504s is the fastest sample, so the fastest pace sits at the TOP of the band.
  assert.equal(bsIbTileDetail(['Best pace', '8:24/mi'], CTX).marker.frac, 1);
  // 548s is the slowest.
  assert.equal(bsIbTileDetail(['Worst pace', '9:08/mi'], CTX).marker.frac, 0);
  // HR is linear: 120..176, so 176 is the top and 120 the bottom.
  assert.equal(bsIbTileDetail(['Max HR', '176 bpm'], CTX).marker.frac, 1);
  assert.equal(bsIbTileDetail(['Min HR', '120 bpm'], CTX).marker.frac, 0);
  // A ride reads speed, where higher is faster and the band is NOT inverted.
  const ride = bsIbTileDetail(['Avg speed', '19.3 mph'], { paceTrace: [16, 22], isRide: true });
  assert.ok(Math.abs(ride.marker.frac - 0.55) < 1e-9);
});

test('a value the chart does not contain gets NO marker', () => {
  // Both readings can be true — the scalar and the trace are different
  // measurements — and clamping the scalar onto the top would draw a line at a
  // sample the chart does not have.
  assert.equal(bsIbTileDetail(['Max HR', '199 bpm'], CTX).marker, null);
  assert.equal(bsIbTileDetail(['Min HR', '40 bpm'], CTX).marker, null);
  // …and a stat with no series has nothing to mark.
  assert.equal(bsIbTileDetail(['Calories', '2,140'], CTX).marker, null);
});

test('zones belong to the heart and to nothing else on the board', () => {
  assert.equal(bsIbTileDetail(['Avg HR', '154 bpm'], CTX).zones.length, 3);
  for (const label of ['Avg pace', 'Cadence', 'Elevation', 'Avg power', 'Calories']) {
    assert.equal(bsIbTileDetail([label, '100'], CTX).zones, null, label);
  }
});

test('the split column follows the family, and power has none', () => {
  const splits = [
    { label: 'Mile 1', paceLabel: '8:57/mi', hr: 141, cadence: 176, elevDelta: 12 },
    { label: 'Mile 2', paceLabel: '8:53/mi', hr: 144, cadence: 178, elevDelta: -4 },
  ];
  const ctx = { ...CTX, splits, powerTrace: [200, 300] };
  assert.deepEqual(bsIbTileDetail(['Avg pace', '8:55/mi'], ctx).splitCol.map((x) => x.value), ['8:57/mi', '8:53/mi']);
  assert.deepEqual(bsIbTileDetail(['Avg HR', '142 bpm'], ctx).splitCol.map((x) => x.value), [141, 144]);
  assert.deepEqual(bsIbTileDetail(['Cadence', '177 spm'], ctx).splitCol.map((x) => x.value), [176, 178]);
  assert.deepEqual(bsIbTileDetail(['Elevation', '8 ft'], ctx).splitCol.map((x) => x.value), [12, -4]);
  // The model carries no per-split power, so the sheet does not invent one.
  assert.equal(bsIbTileDetail(['Avg power', '241 W'], ctx).splitCol, null);
  // One split is not a breakdown.
  assert.equal(bsIbTileDetail(['Avg HR', '142 bpm'], { ...CTX, splits: [splits[0]] }).splitCol, null);
});

test('each split row carries its own bar, and a longer bar is always a better reading', () => {
  const splits = [
    { label: 'Mile 1', paceLabel: '9:00/mi', paceVal: 540, hr: 140, cadence: 170, elevDelta: -8 },
    { label: 'Mile 2', paceLabel: '8:30/mi', paceVal: 510, hr: 155, cadence: 175, elevDelta: 0 },
    { label: 'Mile 3', paceLabel: '8:00/mi', paceVal: 480, hr: 170, cadence: 180, elevDelta: 16 },
  ];
  // ⚠ PACE INVERTS. The fastest mile is the LOWEST number and must draw the
  // LONGEST bar — normalising raw seconds would draw the session's best mile as
  // its shortest, which is the page's own split-bar convention upside down.
  const pace = bsIbTileDetail(['Avg pace', '8:30/mi'], { splits }).splitCol;
  assert.deepEqual(pace.map((x) => x.frac), [0, 0.5, 1]);
  assert.deepEqual(pace.map((x) => x.value), ['9:00/mi', '8:30/mi', '8:00/mi']);
  // ⚠ AND THE BAR IS MEASURED OFF `paceVal`, NOT OFF `paceLabel` — reading the
  // display string would parse '9:00/mi' as 9.
  assert.equal(pace[2].best, true, 'the fastest split is the best row');
  assert.deepEqual(pace.map((x) => x.best), [false, false, true]);

  // HR does not invert…
  const hr = bsIbTileDetail(['Avg HR', '155 bpm'], { splits }).splitCol;
  assert.deepEqual(hr.map((x) => x.frac), [0, 0.5, 1]);
  // …⚠ AND NO ROW IS ITS "BEST". A higher heart rate is not a better reading,
  // and painting the highest one in the session's heat asserts a ranking that
  // does not exist. Only pace has a best split on this page.
  assert.deepEqual(hr.map((x) => x.best), [false, false, false]);
  for (const label of ['Cadence', 'Elevation']) {
    assert.deepEqual(bsIbTileDetail([label, '1'], { splits }).splitCol.map((x) => x.best), [false, false, false], label);
  }

  // ⚠ A COLUMN THAT NEVER VARIED GETS FULL BARS, NOT EMPTY ONES. `(v-lo)/(hi-lo)`
  // is 0/0 there, and drawing nothing would say every reading was the lowest
  // possible when what happened is that they were all the same.
  const flat = [{ label: 'A', hr: 150 }, { label: 'B', hr: 150 }];
  assert.deepEqual(bsIbTileDetail(['Avg HR', '150 bpm'], { splits: flat }).splitCol.map((x) => x.frac), [1, 1]);
});

test('set rows reach the scalars they are the breakdown OF, and no others', () => {
  const setRows = [['Set 1', '225 lb × 3', 'RPE 7'], ['Set 2', '245 lb × 3', 'RPE 9']];
  const ctx = { ...CTX, setRows };
  for (const label of ['Volume', 'Total sets', 'Reps', 'Top set', 'Est. 1RM']) {
    assert.equal(bsIbTileDetail([label, '1'], ctx).setRows.length, 2, label);
  }
  // ⚠ Calories are not a sum of the sets, so the sets say nothing about them.
  for (const label of ['Calories', 'Avg HR', 'HRV', 'Readiness']) {
    assert.equal(bsIbTileDetail([label, '1'], ctx).setRows, null, label);
  }
});

test('a split-shaped breakdown is never handed over as set rows', () => {
  const rows = [['Mile 1', '8:57/mi', '141 bpm'], ['Mile 2', '8:53/mi', '144 bpm']];
  // ⚠ THE ONE THE MUTATION ROUND FOUND. The page carries ONE `breakdown` and it
  // is either the session's splits or its working sets; passing a split-shaped
  // one through would draw a run's miles under `Volume`.
  assert.equal(bsIbSetRowsFor({ label: 'Mile splits', rows }), null);
  assert.equal(bsIbSetRowsFor({ label: '500m splits', rows }), null);
  assert.equal(bsIbSetRowsFor({ label: 'Laps', rows }), null);
  // …while a genuine set list comes through.
  const sets = [['Set 1', '225 lb × 3', 'RPE 7']];
  assert.equal(bsIbSetRowsFor({ label: 'Working sets', rows: sets }), sets);
  assert.equal(bsIbSetRowsFor({ label: 'Intervals', rows: sets }), sets);
  // …and an absent or empty breakdown is not a set list either.
  for (const b of [null, undefined, {}, { label: 'Working sets' }, { label: 'Working sets', rows: [] }]) {
    assert.equal(bsIbSetRowsFor(b), null, JSON.stringify(b));
  }
  // Driven end to end: the rule's answer is what the sheet actually shows.
  assert.equal(bsIbTileDetail(['Volume', '8,150 lb'], { setRows: bsIbSetRowsFor({ label: 'Mile splits', rows }) }).setRows, null);
  assert.deepEqual(bsIbTileDetail(['Volume', '8,150 lb'], { setRows: bsIbSetRowsFor({ label: 'Working sets', rows: sets }) }).setRows, sets);
});

test('`empty` is true only when the session holds none of the four', () => {
  assert.equal(bsIbTileDetail(['Calories', '420'], {}).empty, true);
  assert.equal(bsIbTileDetail(['Avg HR', '154 bpm'], { hrTrace: HR }).empty, false);
  assert.equal(bsIbTileDetail(['Avg HR', '154 bpm'], { zones: [['Z1', 10]] }).empty, false);
  assert.equal(bsIbTileDetail(['Volume', '8,150 lb'], { setRows: [['Set 1', '225 × 3']] }).empty, false);
  assert.equal(bsIbTileDetail(['Avg HR', '154 bpm'], {
    splits: [{ label: 'Mile 1', hr: 141 }, { label: 'Mile 2', hr: 144 }],
  }).empty, false);
});

test('the families agree with the tile’s own ghost rule — a tile that hints opens', () => {
  // ⚠ THE TWO MUST NOT DRIFT. `bsIbTileKind` decides whether the 105px tile
  // draws a ghost; `bsIbTileFamily` decides what the sheet opens. A stat that
  // hints at a trace and then opens nothing is the control lying about itself.
  for (const label of ['Avg pace', 'Avg speed', 'Best pace', 'Avg HR', 'Max HR']) {
    const kind = bsIbTileKind(label, { hasGhost: true });
    assert.notEqual(kind, 'plain', `${label} should draw an instrument`);
    assert.ok(bsIbTileFamily(label), `${label} should resolve a family`);
  }
  assert.equal(bsIbTileFamily('Calories'), null);
  assert.equal(bsIbTileFamily('Volume'), null);
});

// ── the trace and the figure above it must share one unit ───────────────────

const IMPERIAL = { weight: 'lb', distance: 'mi' };
const METRIC = { weight: 'kg', distance: 'km' };
// The shipped demo traces, in seconds per MILE.
const DREW_PACE = [548, 532, 540, 525, 538, 520, 528, 515, 524, 533, 512, 521, 530, 510, 519, 508, 517, 526, 506, 515, 524, 504, 513, 522, 502, 511, 519, 500, 509, 517];

test('a metric reader’s pace figure is compared against a metric trace', () => {
  // ⚠ THE BUG THIS CLOSES, WHICH WAS LIVE ON THE SHIPPED TILE. `detailStats` is
  // unit-converted on its way to the page and `paceTrace` is not, so the two met
  // in `bsSdNeedle` in DIFFERENT units. Driven rather than argued: the needle
  // pinned at exactly 1.000 — "your average was this session's fastest sample" —
  // for every foot-sport pace tile on a metric screen.
  const figure = bsSdUnitizeText('8:42/mi', METRIC);
  assert.equal(figure, '5:24/km', 'the figure is converted for a metric reader');
  const broken = bsSdNeedle(figure, DREW_PACE, 'pace');
  assert.equal(broken.frac, 1, 'the raw trace still pins the needle — this is the defect');

  const fixed = bsSdNeedle(figure, bsSdPaceTraceIn(DREW_PACE, figure), 'pace');
  assert.ok(fixed.frac < 0.99 && fixed.frac > 0.01, `converted frac ${fixed.frac}`);
  // …and it agrees with what an imperial reader is shown, to within the rounding
  // the converted DISPLAY string carries. Both describe the same run.
  const impFig = bsSdUnitizeText('8:42/mi', IMPERIAL);
  const imp = bsSdNeedle(impFig, bsSdPaceTraceIn(DREW_PACE, impFig), 'pace');
  assert.ok(Math.abs(fixed.frac - imp.frac) < 0.02, `metric ${fixed.frac} vs imperial ${imp.frac}`);
});

test('only the /mi pace form is converted, so rides and swims are left alone', () => {
  // ⚠ MEASURED, NOT ASSUMED: `bsSdUnitizeText` leaves 'mph' and '/100m' untouched
  // (mph is not in its unit list and the pace rule matches only /mi and /km), so
  // a ride's and a swim's figures are ALREADY in their traces' units. Converting
  // those traces would create the very mismatch this function exists to remove.
  assert.equal(bsSdUnitizeText('19.3 mph', METRIC), '19.3 mph');
  assert.equal(bsSdUnitizeText('1:42/100m', METRIC), '1:42/100m');
  const ride = [17.2, 28.4], swim = [108, 93];
  assert.deepEqual(bsSdPaceTraceIn(ride, '19.3 mph'), ride);
  assert.deepEqual(bsSdPaceTraceIn(swim, '1:42/100m'), swim);
  // A figure still in miles is never converted…
  assert.deepEqual(bsSdPaceTraceIn(DREW_PACE, '8:42/mi'), DREW_PACE);
  // …and one already in kilometres IS.
  assert.notDeepEqual(bsSdPaceTraceIn(DREW_PACE, '5:24/km'), DREW_PACE);
  // An absent figure, an empty trace and a non-array are all pass-throughs.
  assert.deepEqual(bsSdPaceTraceIn(DREW_PACE, null), DREW_PACE);
  assert.deepEqual(bsSdPaceTraceIn([], '5:24/km'), []);
  assert.equal(bsSdPaceTraceIn(null, '5:24/km'), null);
});

test('the trace follows the FIGURE, so a live unit flip cannot split them', () => {
  // ⚠ THE BROWSER CAUGHT THIS, NOT A READ. Keying the conversion on the reader's
  // CURRENT preference is right when the page opens and wrong the moment units
  // are flipped while it is open: `detailStats` is captured by `openDetail` and
  // keeps the units it was captured in, so the headline stayed '8:42/mi' while
  // the chart beneath it redrew as 5:11–5:41 per km — one stat, two units, on
  // one screen. Asking the FIGURE makes them agree by construction.
  const stale = '8:42/mi';            // captured imperial, page still open
  assert.deepEqual(bsSdPaceTraceIn(DREW_PACE, stale), DREW_PACE,
    'a stale imperial figure must keep its per-mile trace');
  const fresh = '5:24/km';            // captured after the flip
  assert.notDeepEqual(bsSdPaceTraceIn(DREW_PACE, fresh), DREW_PACE);
  // Both pairings are self-consistent, which is the property that matters.
  for (const fig of [stale, fresh]) {
    const n = bsSdNeedle(fig, bsSdPaceTraceIn(DREW_PACE, fig), 'pace');
    assert.ok(n.frac > 0.4 && n.frac < 0.7, `${fig} -> ${n.frac}`);
  }
});

test('the detail page hands every pace consumer the SAME converted trace', () => {
  // ⚠ ONE TRACE, FOUR CONSUMERS. The ghost behind a tile, the tiles' needle, the
  // needle legend's endpoint labels and each tile sheet all compare a converted
  // figure against this trace; any one of them left on `d.paceTrace` would put a
  // per-mile number under a per-km heading for every metric member.
  const src = readFileSync(SRC, 'utf8');
  const body = src.slice(src.indexOf('const paceTraceIn ='));
  assert.ok(/bsSdPaceTraceIn\(d\.paceTrace, paceStat \? paceStat\[1\] : null\)/.test(src),
    'the page must convert the trace against the DISPLAYED pace figure');
  // Inside the board's own props there must be no raw `d.paceTrace` left.
  const props = body.slice(0, body.indexOf('const hasSplitsPage'));
  assert.ok(!/paceTrace=\{d\.paceTrace\}/.test(props), 'the tiles still take the raw trace');
  assert.ok(!/paceTrace: d\.paceTrace,/.test(props), 'the tile sheets still take the raw trace');
  // ⚠ AND `bsPaceSplits` KEEPS THE RAW ONE, deliberately — its buckets are miles
  // and its labels come from the breakdown, which is converted elsewhere.
  assert.ok(/paceTrace: Array\.isArray\(d\.paceTrace\) \? d\.paceTrace : null,/.test(src),
    'bsPaceSplits should still receive the raw per-mile trace');
});

test('`paceTraceIn` is declared before the function that reads it', () => {
  // ⚠ A `const` IS NOT HOISTED, and there is no error boundary anywhere in this
  // module's render path — reading one early is a blank page, not a warning.
  // Ordering is what makes this safe; the previous arrangement was safe only
  // because nothing happened to call `ghostFor` during evaluation.
  const src = readFileSync(SRC, 'utf8');
  assert.ok(src.indexOf('const paceTraceIn =') < src.indexOf('const ghostFor ='),
    'paceTraceIn must be declared above ghostFor');
  assert.ok(src.indexOf('const isSwimSport =') < src.indexOf('const paceTraceIn ='),
    'the sport flags must be declared above paceTraceIn');
});

// ── the wiring, driven rather than grepped ──────────────────────────────────

const TILE_PROPS = {
  tiles: [['Avg HR', '154 bpm'], ['Calories', '2,140']],
  rest: [],
  heat: '#f60',
  t: THEME,
  ghostFor: () => null,
  paceTrace: PACE,
  isRide: false,
  fmtPaceSec: (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
  detailCtx: CTX,
};

test('the tile itself renders as a button that announces what it opens', async () => {
  // ⚠ DRIVEN AT `BSIbTile`, NOT AT THE GRID. The harness renders ONE component
  // deep, so from `BSIbTiles` the tiles are elements in a props tree and their
  // `<button>` does not exist yet — asserting on the grid's rendered nodes would
  // pass vacuously on a tile that had no button at all.
  const { BSIbTile } = await loadBroadsheet(['BSIbTile']);
  const d = drive(BSIbTile, {
    label: 'Avg HR', value: '154 bpm', kind: 'plain', heat: '#f60', t: THEME,
    onOpen() {}, openLabel: 'Avg HR, 154 bpm — more detail',
  });
  const buttons = d.nodes().filter((n) => n.type === 'button');
  assert.equal(buttons.length, 1, 'the tile is a button');
  const b = buttons[0];
  // A div with an onClick is not reachable by keyboard and announces nothing.
  assert.equal(b.props['aria-haspopup'], 'dialog');
  assert.match(String(b.props['aria-label']), /Avg HR/);
  assert.equal(typeof b.props.onClick, 'function');
  // The plate is a button now, so every style the browser supplies is reset —
  // a default border or background would repaint the plate the page ships.
  assert.equal(b.props.style.border, 0);
  assert.equal(b.props.style.background, 'transparent');
  assert.equal(b.props.style.padding, 0);
  assert.equal(b.props.style.textAlign, 'left');
});

test('the grid hands every tile an opener naming its own stat', async () => {
  const { BSIbTiles, BSIbTile } = await loadBroadsheet(['BSIbTiles', 'BSIbTile']);
  const d = drive(BSIbTiles, TILE_PROPS);
  const tiles = d.nodes().filter((n) => n.type === BSIbTile);
  assert.equal(tiles.length, TILE_PROPS.tiles.length, 'one tile per stat');
  const names = [];
  for (const [i, node] of tiles.entries()) {
    assert.equal(typeof node.props.onOpen, 'function', `tile ${i} has no opener`);
    const name = String(node.props.openLabel);
    // Guard the guard: an uninterpolated template means the catalog never
    // resolved, and every assertion below would be about the wrong string.
    assert.ok(!name.includes('{label}'), `openLabel was never interpolated: ${name}`);
    // The name carries the stat AND its figure, so a screen reader is not told
    // "button, button" six times over.
    assert.match(name, new RegExp(TILE_PROPS.tiles[i][0]));
    assert.ok(name.includes(TILE_PROPS.tiles[i][1]), `${name} omits its figure`);
    names.push(name);
  }
  assert.equal(new Set(names).size, names.length, 'two tiles share one accessible name');
});

test('no sheet is mounted until a tile is tapped, and then exactly one is', async () => {
  const { BSIbTiles, BSIbTile, BSIbTileSheet } = await loadBroadsheet(['BSIbTiles', 'BSIbTile', 'BSIbTileSheet']);
  const d = drive(BSIbTiles, TILE_PROPS);
  const sheets = () => d.nodes().filter((n) => n.type === BSIbTileSheet);
  assert.equal(sheets().length, 0, 'a sheet is mounted before anything was tapped');
  d.nodes().filter((n) => n.type === BSIbTile)[0].props.onOpen();
  d.render();
  assert.equal(sheets().length, 1);
  // ⚠ The STAT is what the sheet is opened on, not an index into a list that is
  // rebuilt every render — an index would point at a different figure the moment
  // the session's stats changed underneath an open sheet.
  assert.equal(sheets()[0].props.detail.label, 'Avg HR');
  // …and the second tile opens its OWN stat rather than the first one again.
  d.nodes().filter((n) => n.type === BSIbTile)[1].props.onOpen();
  d.render();
  assert.equal(sheets()[0].props.detail.label, 'Calories');
});

test('the sheet opens ABOVE the page that opened it', async () => {
  const { BSIbTileSheet, BSPostSheetShell } = await loadBroadsheet(['BSIbTileSheet', 'BSPostSheetShell']);
  const detail = bsIbTileDetail(['Avg HR', '154 bpm'], CTX);
  const d = drive(BSIbTileSheet, { detail, heat: '#f60', t: THEME, isRide: false, fmtPaceSec: (s) => String(s), onClose() {} });
  const shell = d.nodes().find((n) => n.type === BSPostSheetShell);
  assert.ok(shell, 'the sheet is built on the shared sheet shell');
  // ⚠ DERIVED, NOT TYPED: the shell's own default is 245, so a sheet that forgot
  // to pass a z would open BEHIND the detail page and read as a dead tap. The
  // floor is read out of the page itself so it cannot go stale.
  const src = readFileSync(SRC, 'utf8');
  const zs = [...src.matchAll(/zIndex:\s*(99\d{3})/g)].map((m) => Number(m[1]));
  assert.ok(zs.length >= 2, `expected the detail page's z-stack in the source, found ${zs.length}`);
  assert.ok(shell.props.z > Math.max(...zs), `sheet z ${shell.props.z} must exceed ${Math.max(...zs)}`);
});

test('the sheet draws only the instruments the stat actually has', async () => {
  const { BSIbTileSheet, BSSdTrace, BSSdZoneCells, BSIbTable } = await loadBroadsheet(
    ['BSIbTileSheet', 'BSSdTrace', 'BSSdZoneCells', 'BSIbTable']);
  const mount = (stat, ctx) => drive(BSIbTileSheet, {
    detail: bsIbTileDetail(stat, ctx), heat: '#f60', t: THEME, isRide: false,
    fmtPaceSec: (s) => String(s), onClose() {},
  });
  const has = (d, Comp) => d.nodes().some((n) => n.type === Comp);

  const hr = mount(['Avg HR', '154 bpm'], CTX);
  assert.ok(has(hr, BSSdTrace), 'an HR stat with a trace draws it');
  assert.ok(has(hr, BSSdZoneCells), 'an HR stat draws its zones');

  const pace = mount(['Avg pace', '8:42/mi'], CTX);
  assert.ok(has(pace, BSSdTrace));
  assert.ok(!has(pace, BSSdZoneCells), 'zones must not appear under a pace stat');

  // ⚠ THE HONEST CASE. 22% of tiles across the demo corpus record one figure and
  // nothing else; the sheet says so rather than drawing an empty instrument.
  const bare = mount(['Calories', '2,140'], {});
  assert.ok(!has(bare, BSSdTrace) && !has(bare, BSSdZoneCells) && !has(bare, BSIbTable),
    'an empty stat must draw no instrument at all');
  assert.match(bare.text, /records/, 'the empty sheet states what it holds');
  // …and the figure is still there, larger than the tile could show it.
  assert.match(bare.text, /2,140/);
});

test('the detail page ROUTES its breakdown through the gate rather than restating it', () => {
  // ⚠ THE MUTATION ROUND FOUND THIS ONE: `bsIbSetRowsFor` can be correct and
  // tested while the one call site bypasses it, and no mount in this repo drives
  // `BSActivityDetail` — so the only thing that can see the bypass is the tree.
  // Asserted STRUCTURALLY (the property's value is a call to the gate) rather
  // than as a spelling, so renaming `d.breakdown` or reformatting the object
  // cannot fail it and only actually bypassing the gate can.
  const ast = parse(readFileSync(SRC, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const found = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ObjectProperty' && n.key && (n.key.name || n.key.value) === 'setRows') found.push(n.value);
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  assert.ok(found.length >= 1, 'no `setRows` is handed to the board at all — has the prop been renamed?');
  for (const v of found) {
    assert.equal(v.type, 'CallExpression', `setRows is ${v.type}, not a call to the gate`);
    assert.equal(v.callee && v.callee.name, 'bsIbSetRowsFor');
  }
});

test('every instrument the sheet mounts actually RENDERS with the props it is given', async () => {
  // ⚠ THE ONE THE BROWSER HAD TO FIND. `drive()` renders ONE component deep, so
  // a child's body never runs — the first cut handed `BSIbTable` arrays of
  // strings where it takes `{label,w,right}` heads and `{cells,width,best}`
  // rows, every assertion above passed, and the real page threw
  // "Cannot read properties of undefined (reading 'map')" on the first tap,
  // taking the whole detail page down to the error boundary.
  //
  // So: mount the sheet, take each child element WITH THE PROPS THE SHEET GAVE
  // IT, and render that child for real. A prop-contract mismatch then throws
  // here instead of on a phone.
  const mod = await loadBroadsheet(['BSIbTileSheet', 'BSSdTrace', 'BSSdZoneCells', 'BSIbTable']);
  const CHILDREN = new Map([[mod.BSSdTrace, 'BSSdTrace'], [mod.BSSdZoneCells, 'BSSdZoneCells'], [mod.BSIbTable, 'BSIbTable']]);
  const splits = [
    { label: 'Mile 1', paceLabel: '8:57/mi', paceVal: 537, hr: 141, cadence: 176, elevDelta: 12 },
    { label: 'Mile 2', paceLabel: '8:24/mi', paceVal: 504, hr: 169, cadence: 180, elevDelta: -4 },
  ];
  const ctx = { ...CTX, splits, cadenceTrace: [170, 180], elevTrace: [10, 40], powerTrace: [200, 300],
    setRows: [['Set 1', '225 lb × 3', 'RPE 7'], ['Set 2', '245 lb × 3', 'RPE 9 · PR']] };
  // One stat per block the sheet can draw, so every child is exercised.
  const cases = [['Avg HR', '154 bpm'], ['Avg pace', '8:42/mi'], ['Cadence', '178 spm'],
    ['Elevation', '540 ft'], ['Avg power', '241 W'], ['Volume', '8,150 lb'], ['Calories', '2,140']];
  let rendered = 0;
  for (const stat of cases) {
    const d = drive(mod.BSIbTileSheet, {
      detail: bsIbTileDetail(stat, ctx), heat: '#f60', t: THEME, isRide: false,
      fmtPaceSec: (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`, onClose() {},
    });
    for (const node of d.nodes()) {
      const name = CHILDREN.get(node.type);
      if (!name) continue;
      // Render the child for real, with exactly the props the sheet passed it.
      assert.doesNotThrow(() => flatten(drive(node.type, node.props).nodes()),
        `${name} threw on the props ${stat[0]}'s sheet gave it`);
      rendered++;
    }
  }
  // Guard the guard: if the sheet stopped mounting these children at all, every
  // assertion above would pass by rendering nothing.
  assert.ok(rendered >= 6, `only ${rendered} child instruments were rendered across ${cases.length} stats`);
});

// ── the corpus ──────────────────────────────────────────────────────────────

function demoPosts() {
  const ast = parse(readFileSync(SRC, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const nums = (v) => (v && v.type === 'ArrayExpression' ? v.elements.map((e) => e && e.value).filter((x) => typeof x === 'number') : null);
  const arr2 = (v) => (v && v.type === 'ArrayExpression' ? v.elements.filter((e) => e && e.type === 'ArrayExpression').map((e) => e.elements.map((c) => c && c.value)) : null);
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ObjectExpression') {
      const p = {};
      for (const q of n.properties) if (q.type === 'ObjectProperty' && q.key) p[q.key.name || q.key.value] = q.value;
      if (p.stats && p.who && p.kind && arr2(p.stats) && arr2(p.stats).length) {
        let bl = null, brows = null;
        if (p.breakdown && p.breakdown.type === 'ObjectExpression') {
          for (const q of p.breakdown.properties) {
            if (q.key.name === 'label') bl = q.value.value;
            if (q.key.name === 'rows') brows = arr2(q.value);
          }
        }
        out.push({
          who: p.who.value, kind: p.kind.value, stats: arr2(p.stats),
          trace: nums(p.trace), paceTrace: nums(p.paceTrace), cadenceTrace: nums(p.cadenceTrace),
          elevTrace: nums(p.elevTrace), powerTrace: nums(p.powerTrace), zones: arr2(p.zones), bl, brows,
        });
      }
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  return out;
}

test('every tile on every demo session opens something, and most of them open evidence', () => {
  const posts = demoPosts();
  assert.ok(posts.length >= 10, `found only ${posts.length} demo sessions`);
  let total = 0, empty = 0;
  for (const po of posts) {
    const hero = bsHeroStatIndex(po.stats, { isRun: po.kind === 'run' });
    const { tiles } = bsIbTiles(po.stats.filter((_, i) => i !== hero));
    const isSplit = /split|mile|lap/i.test(String(po.bl || ''));
    const distStat = po.stats.find(([k]) => /dist/i.test(k));
    const distRaw = distStat ? String(distStat[1]) : '';
    const pd = bsPaceSplits({
      providerSplits: (isSplit && po.brows)
        ? po.brows.map((r) => ({ label: r[0], pace: r[1], hr: /bpm/.test(String(r[2])) ? r[2] : undefined }))
        : null,
      paceTrace: po.paceTrace, hrTrace: po.trace, cadenceTrace: po.cadenceTrace, elevTrace: po.elevTrace,
      distanceMi: /mi/i.test(distRaw) ? parseFloat(distRaw.replace(/[^\d.]/g, '')) : null, sport: po.kind,
    });
    const ctx = {
      hrTrace: po.trace, paceTrace: po.paceTrace, cadenceTrace: po.cadenceTrace,
      elevTrace: po.elevTrace, powerTrace: po.powerTrace, zones: po.zones,
      splits: pd ? pd.splits : null, setRows: (!isSplit && po.brows) ? po.brows : null,
    };
    for (const s of tiles) {
      const d = bsIbTileDetail(s, ctx);
      // ⚠ A TILE ALWAYS OPENS. A tile exists because its value is readable, and
      // that is the same test the sheet applies — so `null` here would be a tile
      // rendering a button that does nothing at all.
      assert.ok(d, `${po.who}: tile ${s[0]} has no sheet`);
      total++;
      if (d.empty) empty++;
    }
  }
  assert.ok(total >= 50, `only ${total} tiles across the corpus`);
  // ⚠ FLOORS AT BOTH ENDS. Without the first, a regression that returns `empty`
  // for everything passes; without the second, one that fabricates evidence for
  // every stat passes. Measured at 45 with evidence / 13 empty of 58.
  assert.ok(total - empty >= 40, `only ${total - empty} of ${total} tiles carry evidence`);
  assert.ok(empty >= 5, `only ${empty} empty — the honest case should still be reachable`);
});
