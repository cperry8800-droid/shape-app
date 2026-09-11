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
import { bsSdRankStats } from './sessionLedger.mjs';

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
