// The Instrument Board — pure rules for the Session details page (review
// 2026-09-11 §3, the owner's pick: "i like the instrument board").
//
// The page's thesis is GLANCE FIRST: a record header, six instrument tiles, the
// scalars that do not fit them as dot-leader rows, one zone bar — then the
// charts, then the set-by-set and split-by-split tables. Everything the page
// showed before is still on it; what changes is the order you meet it in.
//
// Dependency-free on purpose, like `sessionLedger.mjs` beside it, so every rule
// below is driven by a test rather than eyeballed in a render. The rules are all
// one rule wearing different clothes: A TILE, A COLUMN AND A SEGMENT ARE CLAIMS,
// so none of them may exist without a value behind it.
import { bsSdRankStats, bsSdNeedle } from './sessionLedger.mjs';

// A value that is not worth drawing. `null`, `undefined`, `''` and a string of
// spaces are all "we have nothing"; an em-dash is the app's own way of writing
// the same thing, and putting one on a 19px tile makes an absence look like a
// reading taken.
function ibBlank(v) {
  const s = String(v == null ? '' : v).trim();
  return s === '' || s === '—' || s === '-';
}

// Which stats become tiles and which fall through to the dot-leader rows.
//
// ⚠ THE RANKING IS `bsSdRankStats`' AND NOT A SECOND OPINION. That function
// already decides which of a session's scalars are its headline figures (the
// pace/time/HR trio, with leading stats promoted when a strength session has no
// such trio), and it has been the Summary ledger's ranking since the open-ledger
// spec. Inventing a different order here would mean the same session had two
// ideas about which of its numbers matter.
//
// ⚠ AND THE GRID IS NEVER PADDED. A session with four readable stats gets four
// tiles; filling the last two with blanks would draw two instruments reading
// nothing, which is the fabrication this whole page is careful about. `max` is a
// ceiling, not a quota.
export function bsIbTiles(stats, max = 6) {
  const list = (Array.isArray(stats) ? stats : []).filter((s) => Array.isArray(s) && s.length >= 2 && !ibBlank(s[1]));
  const cap = Number.isFinite(Number(max)) && Number(max) > 0 ? Math.floor(Number(max)) : 6;
  const { primary, secondary } = bsSdRankStats(list);
  const ordered = [...primary, ...secondary];
  return { tiles: ordered.slice(0, cap), rest: ordered.slice(cap) };
}

// Which kind of instrument a tile draws behind its number: the session's own
// trace as a ghost line, or the needle band that says where this average sits
// between the session's slowest and fastest sample. Neither is available for
// most stats, and `'plain'` is the honest majority case.
//
// ⚠ THE NEEDLE OUTRANKS THE GHOST ON A PACE TILE, because they answer different
// questions and the needle answers the sharper one: a ghost line says the shape
// of the session, the needle says where THIS number falls inside it.
const IB_PACE_RE = /pace|speed/i;
const IB_HR_RE = /\bhr\b|heart|bpm/i;
export function bsIbTileKind(label, { hasNeedle = false, hasGhost = false } = {}) {
  const k = String(label == null ? '' : label);
  if (IB_PACE_RE.test(k)) return hasNeedle ? 'needle' : (hasGhost ? 'ghost' : 'plain');
  if (IB_HR_RE.test(k)) return hasGhost ? 'ghost' : 'plain';
  return 'plain';
}

// One working-set row, read into the table's columns.
//
// ⚠ A ROW CARRIES ITS COLUMNS IN A FOURTH ELEMENT WHEN IT HAS THEM, AND THE
// NOTE STRING WHEN IT DOES NOT. `bsBuildBreakdown` builds live rows and can hand
// over structured values; the demo posts in this repo are hand-written 3-tuples
// whose third element is prose (`'RPE 9 · PR'`). Parsing the note is therefore
// not a fallback for a bug — it is how the demo cast has always spelled it, and
// both have to render the same table.
export function bsIbSetRow(row) {
  const r = Array.isArray(row) ? row : [];
  const meta = (r[3] && typeof r[3] === 'object' && !Array.isArray(r[3])) ? r[3] : null;
  const note = String(r[2] == null ? '' : r[2]);
  const rpeRaw = meta ? meta.rpe : (note.match(/rpe\s*([\d.]+)/i) || [])[1];
  const rpeNum = Number(rpeRaw);
  // `Number(null)` and `Number('')` are both 0 AND both finite, and the RPE
  // scale starts at 1 — so `Number.isFinite` alone would draw a dial for a set
  // nobody rated. The same trap this repo has now paid for on the Wall's
  // helpers, the demo payout history and the booking sheet.
  const rpe = Number.isFinite(rpeNum) && rpeNum > 0 ? rpeNum : null;
  // Whatever is left of the note once the RPE token is lifted out is the row's
  // own sub-label (the demo rows' `PR`, a live row's duration and rest).
  const leftover = note.replace(/rpe\s*[\d.]+/i, '').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
  const restFromNote = (leftover.match(/rest\s+([^·]+)/i) || [])[1];
  // ⚠ WHAT THE REST COLUMN TAKES, THE NOTE COLUMN GIVES UP. Without this the
  // same `rest 2:30` renders in two columns of one row — the note reading
  // `42s · rest 2:30` beside a REST cell saying `2:30` — which looks like two
  // measurements and is one.
  const spare = leftover.replace(/(^|·\s*)rest\s+[^·]+/i, '').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
  const plain = (v) => (ibBlank(v) ? null : String(v).trim());
  return {
    label: String(r[0] == null ? '' : r[0]),
    value: String(r[1] == null ? '' : r[1]),
    plan: plain(meta ? meta.plan : null),
    rpe,
    rest: plain(meta ? meta.rest : restFromNote),
    note: plain(spare),
  };
}

// The table's shape: the parsed rows, which optional columns have anything in
// them, the bar lengths and which row is the best.
//
// ⚠ A COLUMN WITH NOTHING IN IT IS NOT RENDERED. A PLAN heading over five empty
// cells tells a coach the prescription was not recorded when the truth is that
// this build never had it — and on a phone it spends a fifth of the width doing
// so. Every optional column asks the rows whether it exists.
//
// ⚠ AND THE BAR IS THE SAME MEASURE `BSSdBars` DRAWS: the leading number of the
// value column, floored at 24% so a light set is still a visible bar rather than
// a sliver that reads as missing data.
export function bsIbSetTable(rows) {
  const parsed = (Array.isArray(rows) ? rows : []).map(bsIbSetRow);
  const perf = parsed.map((p) => { const m = String(p.value).match(/[\d.]+/); return m ? +m[0] : 0; });
  const pmax = Math.max(...perf, 1);
  return {
    rows: parsed,
    perf,
    widths: perf.map((v) => 24 + (v / pmax) * 76),
    // `bestIdx` is meaningless with one row — there is nothing it is better
    // than — which is the same rule `BSSdBars` applies before it bursts a row.
    bestIdx: parsed.length > 1 ? perf.indexOf(Math.max(...perf)) : -1,
    cols: {
      plan: parsed.some((p) => p.plan != null),
      rpe: parsed.some((p) => p.rpe != null),
      rest: parsed.some((p) => p.rest != null),
      note: parsed.some((p) => p.note != null),
    },
  };
}

// The single stacked zone bar that sits with the tiles — the glance version of
// the labelled cells the Heart rate section draws further down.
//
// ⚠ A ZONE WITH NO TIME IN IT STILL HOLDS A SLIVER OF THE BAR, and that is
// deliberate rather than sloppy: five segments always in the same order is what
// makes two sessions comparable at a glance, and a zone that collapses to
// nothing makes the bar a different chart each time. The sliver is 0.5 against a
// scale where a real zone is tens, so it cannot be misread as time spent.
export function bsIbZoneSegments(zones) {
  const list = (Array.isArray(zones) ? zones : []).filter((z) => Array.isArray(z) && z.length >= 2);
  return list.map(([label, pct], i) => {
    const n = Number(pct);
    return { label: String(label == null ? '' : label), pct: Number.isFinite(n) ? n : 0, flex: Math.max(Number.isFinite(n) ? n : 0, 0.5), i };
  });
}

// How many splits the inline table shows before handing off to the Splits page.
// ⚠ THE LINK IS NOT OPTIONAL WHEN THE TABLE IS TRUNCATED. A table showing six of
// twelve miles with no way to the other six is a page claiming to be the whole
// record; the caller renders the link whenever `truncated` is true.
export function bsIbSplitTable(splits, max = 6) {
  const list = Array.isArray(splits) ? splits : [];
  const cap = Number.isFinite(Number(max)) && Number(max) > 0 ? Math.floor(Number(max)) : 6;
  const shown = list.slice(0, cap);
  return {
    shown,
    total: list.length,
    truncated: list.length > shown.length,
    cols: {
      hr: shown.some((x) => x && x.hr != null),
      cadence: shown.some((x) => x && x.cadence != null),
      elev: shown.some((x) => x && x.elevDelta != null),
    },
  };
}

// ── What opens when a tile is tapped ────────────────────────────────────────
//
// Owner: "make each box at the top clickable to see more info / More detailed
// breakdown." A tile is ~105px wide and carries a label, a figure, and — when
// there is a series behind it — a 40×18px ghost at 0.2 opacity whose whole job
// is to say what SHAPE the number came out of. Tapping it should give you the
// thing the ghost was hinting at, full size, plus every other reading this
// session actually holds for that stat.
//
// ⚠ THE RULE IS THE PAGE'S OWN AND IT DOES NOT BEND FOR THIS CONTROL: A TILE, A
// COLUMN AND A SEGMENT ARE CLAIMS. So the sheet is assembled from evidence that
// EXISTS rather than padded to a shape — a stat with a trace gets its trace, a
// stat the splits carry a column for gets that column, an HR stat gets the
// zones, a strength scalar gets the sets that sum to it, and a stat with none of
// those says so in one line instead of drawing an empty instrument.
//
// ⚠ AND EVERY TILE IS TAPPABLE, INCLUDING THAT LAST ONE. Measured across the
// demo corpus, 22 of 58 tiles have no series behind them — a 38% minority, not
// an edge — so gating the affordance on "has a chart" would leave more than a
// third of the board dead under a request that said *each* box. An honest "this
// is a single reading" is information; a tile that silently does nothing is not.
// The caller still needs `empty` to render that sentence rather than a blank.

// Which series, which split column, which chart name. ⚠ ONE TABLE, NOT A REGEX
// PER CONSUMER: `bsIbTileKind` above decides whether a tile draws a ghost from
// the same families, so a stat that hints at a trace on the tile is the stat
// that opens one, and the two cannot drift into disagreeing.
// ⚠ `show` AND `num` ARE TWO FIELDS BECAUSE A SPLIT'S PACE IS A STRING. The
// row carries `paceLabel` ('8:57/mi') for the reader and `paceVal` (537) for the
// bar; taking the bar's length off the label would parse '8:57/mi' as 8.
const IB_FAMILIES = [
  { name: 'pace', re: IB_PACE_RE, series: 'paceTrace', show: 'paceLabel', num: 'paceVal' },
  { name: 'hr', re: IB_HR_RE, series: 'hrTrace', show: 'hr', num: 'hr' },
  { name: 'cadence', re: /cadence/i, series: 'cadenceTrace', show: 'cadence', num: 'cadence' },
  { name: 'elevation', re: /elev|ascent|altitude|climb/i, series: 'elevTrace', show: 'elevDelta', num: 'elevDelta' },
  { name: 'power', re: /power|watt/i, series: 'powerTrace', show: null, num: null },
];
// The scalars a strength session's set rows are the breakdown OF. Volume is the
// sum of them, sets and reps are the count of them, and a top set or a 1RM
// estimate is read off one of them — so in every case the rows are the evidence.
const IB_SET_RE = /volume|tonnage|\bsets?\b|\breps?\b|top set|1rm|one.rep/i;

export function bsIbTileFamily(label) {
  const k = String(label == null ? '' : label);
  const hit = IB_FAMILIES.find((f) => f.re.test(k));
  return hit ? hit.name : null;
}

// ⚠ `Number.isFinite` ALONE CANNOT CLEAN A TRACE, and this is the trap the house
// has now paid for on the Wall's helpers, a demo payout's `joinedAt: 0` and the
// booking sheet's `start_minute`. `Number(null)`, `Number('')` and `Number([])`
// are ALL 0 and all finite — so a gap in a series would not be dropped, it would
// be drawn as a heart rate of zero, dragging the chart's low to the floor and
// putting this tile's marker somewhere it does not belong. A reading is a number,
// or a string that is one; nothing else is a sample.
function ibNumeric(series) {
  if (!Array.isArray(series)) return null;
  const nums = [];
  for (const v of series) {
    if (typeof v === 'number') { if (Number.isFinite(v)) nums.push(v); continue; }
    if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); if (Number.isFinite(n)) nums.push(n); }
  }
  // One point is not a shape. Two is the minimum that can be drawn as a line,
  // which is the same floor `ghostFor` applies on the tile.
  return nums.length > 1 ? nums : null;
}

// The breakdown rows a tile's sheet may treat as SETS.
//
// ⚠ A SPLIT-SHAPED BREAKDOWN IS NOT A SET LIST, and handing one over would draw
// a run's eighteen miles under `Volume` as though they were its working sets.
// The page already tells the two apart by the breakdown's own label — the same
// test `bsPaceSplits` applies when it decides whether those rows are splits — so
// the rule lives here, drivable, rather than as an expression at one call site
// where only a source scan could ever have checked it.
const IB_SPLIT_LABEL_RE = /split|mile|lap/i;
export function bsIbSetRowsFor(breakdown) {
  if (!breakdown || !Array.isArray(breakdown.rows) || !breakdown.rows.length) return null;
  if (IB_SPLIT_LABEL_RE.test(String(breakdown.label == null ? '' : breakdown.label))) return null;
  return breakdown.rows;
}

export function bsIbTileDetail(stat, ctx = {}) {
  const label = Array.isArray(stat) ? String(stat[0] == null ? '' : stat[0]) : '';
  const value = Array.isArray(stat) ? stat[1] : null;
  // A tile that should not exist has no sheet behind it.
  if (!label || ibBlank(value)) return null;

  const family = bsIbTileFamily(label);
  const spec = IB_FAMILIES.find((f) => f.name === family) || null;

  const series = spec ? ibNumeric(ctx[spec.series]) : null;
  // ⚠ THE RANGE IS READ OFF THE SERIES, NEVER OFF THE OTHER STATS. A page can
  // carry "Max HR 176" as its own scalar while the trace tops out at 174, and
  // quoting one as the other would put a number under a chart that does not
  // contain it. Both are true; only one of them is what this chart shows.
  // ⚠ THE ENDS AND NOTHING ELSE. A mean lived here and was deleted with its
  // render: the sheet printed it beside a tile whose own figure is the session's
  // time-weighted average, and the two numbers differ honestly — so the page read
  // as contradicting itself. A field nothing renders is the next reader's
  // invitation to render it.
  const range = series ? { lo: Math.min(...series), hi: Math.max(...series) } : null;

  // Zones belong to the heart, and to nothing else on the board.
  const zoneList = family === 'hr' ? bsIbZoneSegments(ctx.zones) : [];
  const zones = zoneList.length ? zoneList : null;

  // The split column for this stat, when the splits carry one. Power has no
  // per-split column in the model, so it is `null` above rather than guessed at.
  const splitsIn = Array.isArray(ctx.splits) ? ctx.splits : [];
  const key = spec && spec.show;
  const rows = key ? splitsIn.filter((s) => s && s[key] != null && s[key] !== '') : [];
  const splitCol = rows.length > 1 ? ibSplitBars(rows, spec, family === 'pace') : null;

  // The set rows, for the scalars they are the breakdown of. ⚠ Gated on the
  // stat as well as on the rows: every session with a breakdown would otherwise
  // show its sets under `Calories`, which they say nothing about.
  const setIn = Array.isArray(ctx.setRows) ? ctx.setRows.filter((r) => Array.isArray(r) && r.length >= 2) : [];
  const setRows = (IB_SET_RE.test(label) && setIn.length) ? setIn : null;

  return {
    label,
    value,
    family,
    series,
    range,
    marker: ibMarker(value, series, family, !!ctx.isRide),
    zones,
    splitCol,
    setRows,
    empty: !series && !zones && !splitCol && !setRows,
  };
}

// Where THIS tile's number sits inside the series drawn beneath it — the tile's
// 40px needle, at full size, on every family rather than just on pace.
//
// ⚠ PACE IS INVERTED AND THE OTHERS ARE NOT, WHICH IS WHY PACE GOES THROUGH
// `bsSdNeedle` RATHER THAN THE ARITHMETIC BELOW. Lower seconds is faster and
// faster reads HIGHER on this page's charts, so a plain `(v - lo) / (hi - lo)`
// would put a session's best mile at the bottom of its own trace. That function
// already owns the inversion — and it is the one the tile's needle uses, so the
// marker and the needle cannot come to disagree about the same number.
//
// ⚠ AND A VALUE OUTSIDE THE SERIES GETS NO MARKER AT ALL. A page may carry
// "Max HR 176" as its own scalar while the trace it is drawn over tops out at
// 174 — both readings are true, and clamping the higher one onto the top of the
// chart would draw a line at a sample the chart does not contain.
// Each split row, with the width of its own bar.
//
// ⚠ THE BAR IS NORMALISED WITHIN THE COLUMN, AND INVERTED FOR PACE so a longer
// bar is always a better reading — the convention the page's own split bars
// already use. Normalising raw seconds instead would draw the session's fastest
// mile as its shortest bar.
//
// ⚠ AND A COLUMN WHERE EVERY ROW IS EQUAL GETS FULL BARS, NOT ZERO-WIDTH ONES.
// `(v - lo) / (hi - lo)` is 0/0 there; drawing nothing would say the readings
// were the lowest possible when what happened is that they never varied.
function ibSplitBars(rows, spec, invert) {
  const nums = rows.map((s) => Number(s[spec.num]));
  const usable = nums.filter((n) => Number.isFinite(n));
  const lo = usable.length ? Math.min(...usable) : 0;
  const hi = usable.length ? Math.max(...usable) : 0;
  const span = hi - lo;
  // ⚠ ONLY A PACE COLUMN HAS A "BEST" ROW. The fastest split is a notion this
  // page already owns (`paceData.bestIdx`); a highest HEART RATE is not a better
  // reading than a lower one, and painting it in the session's heat would assert
  // a ranking that does not exist. `invert` is true exactly for pace.
  const bestVal = invert ? lo : null;
  return rows.map((s, i) => {
    const n = nums[i];
    const f = !Number.isFinite(n) ? 0 : (span > 0 ? (invert ? (hi - n) / span : (n - lo) / span) : 1);
    return {
      label: String(s.label == null ? '' : s.label),
      value: s[spec.show],
      frac: f,
      best: bestVal != null && usable.length > 1 && Number.isFinite(n) && n === bestVal,
    };
  });
}

function ibMarker(value, series, family, isRide) {
  if (!series) return null;
  if (family === 'pace') {
    const n = bsSdNeedle(value, series, isRide ? 'speed' : 'pace');
    return n ? { frac: n.frac } : null;
  }
  const v = parseFloat(String(value == null ? '' : value).replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  const lo = Math.min(...series), hi = Math.max(...series);
  if (!(hi > lo) || v < lo || v > hi) return null;
  return { frac: (v - lo) / (hi - lo) };
}
