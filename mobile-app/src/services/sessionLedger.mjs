// Pure helpers for the Session Details "Open Ledger" summary — stat ranking
// into the two ledger registers + the AVG PACE needle math. Dependency-free
// so the honesty rules (no fabricated needle, promoted primaries) stay
// unit-tested. Spec: docs/superpowers/specs/2026-07-03-session-details-open-ledger-design.md

// Split a stat value into { num, unit } for big-number + small-unit type.
// Only a short trailing letter/%/slash token counts as a unit — composites
// ("2.4 · M0") and times ("25:31") render whole.
export function bsSdSplitUnit(text) {
  const s = String(text == null ? '' : text).trim();
  const m = s.match(/^([\d.,:]+)\s*([a-zA-Z%/]{1,6})$/);
  return m ? { num: m[1], unit: m[2] } : { num: s, unit: '' };
}

const SD_PACE_RE = /pace|speed/i;
const SD_TIME_RE = /\btime\b|duration|moving|elapsed/i;
const SD_HR_RE = /avg.*(hr|heart|bpm)|(^|\s)hr\b|heart/i;

// Rank [label, value] pairs into the ledger registers. Primary = the first
// pace/speed + time + HR match (≤3), kept in SOURCE order; when fewer than 2
// match (strength / recovery sessions) the leading stats are promoted so the
// big register never renders a lonely orphan. Secondary = the rest, in order.
export function bsSdRankStats(stats) {
  const list = Array.isArray(stats) ? stats.filter((s) => Array.isArray(s) && s.length >= 2) : [];
  const primary = [];
  [SD_PACE_RE, SD_TIME_RE, SD_HR_RE].forEach((re) => {
    const hit = list.find((s) => re.test(String(s[0])) && !primary.includes(s));
    if (hit) primary.push(hit);
  });
  list.forEach((s) => { if (primary.length < 2 && !primary.includes(s)) primary.push(s); });
  primary.sort((a, b) => list.indexOf(a) - list.indexOf(b));
  return { primary, secondary: list.filter((s) => !primary.includes(s)) };
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
// Round to whole seconds FIRST so a fractional 479.6 can't render "7:60".
const fmtPace = (sec) => {
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Where the average sits between the session's slowest and fastest samples.
// Returns null (→ plain ledger row, never a fabricated needle) when the trace
// is short/flat or the value doesn't parse. 'pace' traces are seconds (lower
// = faster; faster reads RIGHT); 'speed' traces are mph (higher = faster).
// lo/hi are the LEFT/RIGHT endpoint labels (slowest → fastest).
export function bsSdNeedle(value, trace, mode = 'pace') {
  if (!Array.isArray(trace) || trace.length < 2) return null;
  // Linear scan, not spread — dense per-second traces can exceed the arg limit.
  const lo = trace.reduce((a, b) => Math.min(a, b), Infinity);
  const hi = trace.reduce((a, b) => Math.max(a, b), -Infinity);
  if (!(hi > lo)) return null;
  const s = String(value == null ? '' : value);
  if (mode === 'speed') {
    // A mislabeled time-shaped value ("7:58/mi") must never parse as a speed
    // (stripping non-digits would read it as "758" mph) — reject it outright.
    if (s.includes(':')) return null;
    const avg = parseFloat(s.replace(/[^\d.]/g, ''));
    if (!isFinite(avg)) return null;
    return { frac: clamp01((avg - lo) / (hi - lo)), lo: lo.toFixed(1), hi: hi.toFixed(1) };
  }
  const m = s.match(/(\d+):(\d{2})/);
  if (!m) return null;
  const avg = (+m[1]) * 60 + (+m[2]);
  return { frac: clamp01((hi - avg) / (hi - lo)), lo: fmtPace(hi), hi: fmtPace(lo) };
}

// ── Display-unit conversion ─────────────────────────────────────────────────
//
// ⚠ THE APP BAKES UNITS INTO DISPLAY STRINGS, AND THAT IS WHY FLIPPING SETTINGS
// USED TO CHANGE ALMOST NOTHING. A session's stats, its breakdown rows and a
// feed card's hero all arrive as text — `'245 lb'`, `'8,150 lb'`, `'3.2 mi'`,
// `'245 lb × 3'`, `'9:30/mi'` — from demo arrays and from live builders alike.
// There is no number to convert by the time a card renders it, so the reader's
// preference could only ever have relabelled them, which is worse than doing
// nothing: a 245 that says "kg" is a lie where a 245 that says "lb" is merely
// the wrong unit for that reader.
//
// So conversion happens on the TEXT, at the last moment before it is drawn.
// The rules that keep that safe:
//   · a strict whitelist — lb / lbs / kg / mi / km and the pace forms /mi, /km.
//     bpm, %, spm, kcal, min, m, reps and anything else pass through untouched.
//   · `in` is deliberately NOT a unit here. It is the commonest English word in
//     this corpus ("3 in a row", "in 14 weeks"), and no height string in the app
//     is worth the false positives. Inches are handled structurally where they
//     are actually entered, not by pattern-matching prose.
//   · the trailing guard is `(?![\w-])`, not `\b`: `\b` matches inside "mi-" and
//     would rewrite a hyphenated word.
//   · a number that is already in the target unit is returned untouched, so a
//     string can be passed through this repeatedly without drifting.
const SD_LB_TO_KG = 0.45359237;
const SD_MI_TO_KM = 1.609344;

function sdUnitKind(u) {
  const v = String(u || '').toLowerCase();
  if (v === 'lb' || v === 'lbs') return { kind: 'weight', key: 'lb' };
  if (v === 'kg') return { kind: 'weight', key: 'kg' };
  if (v === 'mi') return { kind: 'distance', key: 'mi' };
  if (v === 'km') return { kind: 'distance', key: 'km' };
  return { kind: null, key: v };
}

// Keep the source's own thousands separator, because dropping it turns a
// legible "8,150 lb" into "3697 kg".
function sdFormatNumber(n, grouped, digits) {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits);
  const fixed = Math.abs(n) >= 100 ? String(r) : r.toFixed(digits).replace(/\.0+$/, '');
  if (!grouped) return fixed;
  const [whole, frac] = fixed.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
}

export function bsSdConvertValue(value, from, to) {
  const f = sdUnitKind(from), d = sdUnitKind(to);
  if (!f.kind || f.kind !== d.kind || f.key === d.key) return null;
  if (f.kind === 'weight') return d.key === 'kg' ? value * SD_LB_TO_KG : value / SD_LB_TO_KG;
  return d.key === 'km' ? value * SD_MI_TO_KM : value / SD_MI_TO_KM;
}

// A PACE TRACE AND THE FIGURE ABOVE IT MUST BE IN THE SAME UNITS.
//
// ⚠ THEY WERE NOT, AND IT WAS LIVE. `detailStats` goes through `uStats`, which
// maps `bsSdUnitizeText` over every value, so a metric reader sees Drew's
// '8:42/mi' as '5:24/km' — while `paceTrace` was handed on RAW, still seconds
// per MILE. Both then reach `bsSdNeedle`. Measured on the shipped demo corpus:
// the needle went 0.542 → **1.000** for Drew's average and 0.714 → **1.000** for
// Quinn's, so the tile told every metric member their average was the session's
// fastest sample, on three of the five runs in the app.
//
// ⚠ THE UNIT IS READ OFF THE FIGURE, NOT OFF THE SETTINGS — and that is the
// whole point rather than a detail. A first cut keyed the conversion on the
// reader's CURRENT preference, which is right when the page is opened and wrong
// the moment units are flipped WHILE it is open: `detailStats` is captured by
// `openDetail` and keeps the units it was captured in, so the headline stayed
// '8:42/mi' while the chart under it redrew as 5:11–5:41 per km. Caught in a
// browser, not by reading. Asking the figure removes the question: if the stat
// says /km the trace is made /km, and the two cannot disagree in either
// direction.
//
// ⚠ AND ONLY THE `/mi` FORM IS AFFECTED, WHICH IS WHY THIS IS NOT A BLANKET
// CONVERSION. Measured through `bsSdUnitizeText`: '19.3 mph' and '1:42/100m'
// come back unchanged, so a ride's and a swim's figures are already in the same
// units as their traces — and neither carries a `/km` suffix, so neither can
// reach the conversion below.
export function bsSdPaceTraceIn(trace, paceValue) {
  if (!Array.isArray(trace) || !trace.length) return trace;
  // The trace is seconds per MILE. It needs converting exactly when the figure
  // drawn above it has already been converted to kilometres.
  if (!/\/\s*km\b/i.test(String(paceValue == null ? '' : paceValue))) return trace;
  // Seconds per mile → seconds per km is a DIVISION: a mile is longer, so each
  // kilometre takes less time. The same rule, and the same constant, that
  // `bsSdUnitizeText` applies to the figure — stated once so they cannot drift.
  return trace.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n / SD_MI_TO_KM : v;
  });
}

// `prefs` is { weight: 'lb'|'kg', distance: 'mi'|'km' } — the reader's two
// Settings units. Anything missing means "leave that family alone".
export function bsSdUnitizeText(text, prefs) {
  if (text == null || text === '') return text;
  const s = String(text);
  if (!prefs) return s;
  const want = { weight: sdUnitKind(prefs.weight).key, distance: sdUnitKind(prefs.distance).key };

  // Pace first: "9:30/mi" is minutes-per-unit, so the SAME distance conversion
  // applies to the denominator and therefore INVERTS — a faster-sounding number
  // per kilometre is the same speed. Converting it as a plain distance token
  // would have made every runner 60% faster on a unit flip.
  let out = s.replace(/(\d{1,2}):([0-5]\d)\s*\/\s*(mi|km)(?![\w-])/gi, (m, mm, ss, unit) => {
    const src = sdUnitKind(unit).key;
    if (!want.distance || want.distance === src) return m;
    const secs = Number(mm) * 60 + Number(ss);
    // seconds per mile -> seconds per km is a DIVISION by 1.609, not a
    // multiplication: a mile is longer, so each km takes less time.
    const conv = want.distance === 'km' ? secs / SD_MI_TO_KM : secs * SD_MI_TO_KM;
    const total = Math.round(conv);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/${want.distance}`;
  });

  out = out.replace(/(\d[\d,]*(?:\.\d+)?)\s*(lbs?|kg|mi|km)(?![\w-])/gi, (m, num, unit) => {
    const src = sdUnitKind(unit);
    const target = src.kind === 'weight' ? want.weight : want.distance;
    if (!src.kind || !target || target === src.key) return m;
    const grouped = num.includes(',');
    const n = Number(num.replace(/,/g, ''));
    if (!Number.isFinite(n)) return m;
    const conv = bsSdConvertValue(n, src.key, target);
    if (conv == null) return m;
    const spaced = /\s/.test(m);
    return `${sdFormatNumber(conv, grouped, 1)}${spaced ? ' ' : ''}${target}`;
  });
  return out;
}

// A bare unit label with no number beside it ("lb" under a big figure).
export function bsSdUnitizeLabel(unit, prefs) {
  const src = sdUnitKind(unit);
  if (!src.kind || !prefs) return unit;
  const target = src.kind === 'weight' ? sdUnitKind(prefs.weight).key : sdUnitKind(prefs.distance).key;
  if (!target || target === src.key) return unit;
  // Preserve the caller's casing: these render inside uppercase type.
  return String(unit) === String(unit).toUpperCase() ? target.toUpperCase() : target;
}

// ── Structured value + unit ─────────────────────────────────────────────────
//
// Where a measurement arrives as a NUMBER and a separate unit FIELD, there is
// no prose to be careful about — so this converts a third family the text path
// deliberately refuses: length (in ↔ cm). `in` is unmatchable in free text (it
// is the commonest English word in this corpus) but perfectly safe as a field.
const SD_IN_TO_CM = 2.54;

function sdMeasureKind(u) {
  const v = String(u || '').trim().toLowerCase();
  if (v === 'lb' || v === 'lbs') return { kind: 'weight', key: 'lb' };
  if (v === 'kg') return { kind: 'weight', key: 'kg' };
  if (v === 'mi') return { kind: 'distance', key: 'mi' };
  if (v === 'km') return { kind: 'distance', key: 'km' };
  if (v === 'in' || v === 'inch' || v === 'inches') return { kind: 'length', key: 'in' };
  if (v === 'cm') return { kind: 'length', key: 'cm' };
  return { kind: null, key: v };
}

// Returns { value, unit } in the reader's units, or the input untouched when
// the unit is one this does not know. `value` stays a NUMBER so the caller
// keeps control of formatting.
export function bsSdMeasure(value, unit, prefs) {
  const src = sdMeasureKind(unit);
  const n = (value == null || value === '') ? null : Number(value);
  if (!src.kind || !prefs || n == null || !Number.isFinite(n)) return { value, unit };
  const target = sdMeasureKind(
    src.kind === 'weight' ? prefs.weight : src.kind === 'distance' ? prefs.distance : (prefs.length || (sdMeasureKind(prefs.weight).key === 'kg' ? 'cm' : 'in')),
  );
  if (!target.kind || target.kind !== src.kind || target.key === src.key) return { value: n, unit: src.key };
  let out;
  if (src.kind === 'weight') out = target.key === 'kg' ? n * SD_LB_TO_KG : n / SD_LB_TO_KG;
  else if (src.kind === 'distance') out = target.key === 'km' ? n * SD_MI_TO_KM : n / SD_MI_TO_KM;
  else out = target.key === 'cm' ? n * SD_IN_TO_CM : n / SD_IN_TO_CM;
  const rounded = Math.abs(out) >= 100 ? Math.round(out) : Math.round(out * 10) / 10;
  return { value: rounded, unit: target.key };
}
