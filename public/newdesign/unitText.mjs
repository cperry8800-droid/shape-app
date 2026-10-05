// public/newdesign/unitText.mjs — the reader's units, applied to the TEXT a
// post or a session arrives as. Moved here from the app's
// mobile-app/src/services/sessionLedger.mjs (which re-exports every name) so
// the WEBSITE can load the same rules: the app imports it as an ES module, and
// the website's classic babel scripts reach it with
// `import('/newdesign/unitText.mjs')`. One copy, so the two surfaces cannot
// convert the same figure differently.
//
// Pure: no React, no window, no DOM.

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
//
// ⚠ A POST'S FIGURES MUST ALL BE IN ONE SYSTEM, AND THEY WERE NOT. The list above
// stopped at lb/kg and mi/km, so a swim read "Masters swim · 1.2 mi" over a
// "2,000 m" plate and a "1:42/100m" pace, and a metric member saw "19.3 mph" and
// "540 ft" beside kilometres. Three more families convert now:
//   · speed: mph ↔ km/h, by the distance setting.
//   · elevation: ft → m in free text. `ft` is unambiguous; a bare `m` is NOT
//     ("8h 10m" is sleep), so metres convert back to feet only where the stat's
//     own label says it is an elevation or a stride (`bsSdUnitizeStat`).
//   · swims, when the caller passes `{ sport: 'swim' }`: every distance becomes
//     the pool unit of the reader's system — yards or metres — and the pace is
//     per 100 of it. A swim's title and its plate then state the same distance
//     in the same unit, instead of one in miles and one in metres.
const SD_LB_TO_KG = 0.45359237;
const SD_MI_TO_KM = 1.609344;
const SD_YD_TO_M = 0.9144;
const SD_FT_TO_M = 0.3048;

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
// ⚠ EVERY TRACE IS STORED IN ONE UNIT, AND THE FIGURE NAMES THE ONE TO DRAW IN.
// A run's trace is seconds per MILE, a ride's is MPH and a swim's is seconds
// per 100 METRES. Each converts exactly when its figure has been converted:
// '/km' (seconds per mile → per km), 'km/h' (mph → km/h) and '/100yd' (seconds
// per 100 m → per 100 yd). A figure still in the trace's own unit leaves it as
// it is, so neither direction of a unit flip can split a chart from its number.
export function bsSdPaceTraceIn(trace, paceValue) {
  if (!Array.isArray(trace) || !trace.length) return trace;
  const fig = String(paceValue == null ? '' : paceValue);
  // Seconds per mile → seconds per km is a DIVISION: a mile is longer, so each
  // kilometre takes less time. The same rule, and the same constant, that
  // `bsSdUnitizeText` applies to the figure — stated once so they cannot drift.
  const factor = /\/\s*km\b/i.test(fig) ? 1 / SD_MI_TO_KM
    : /\d\s*(?:km\/h|kph)(?![\w-])/i.test(fig) ? SD_MI_TO_KM
    // 100 yd is SHORTER than 100 m, so each one takes less time: a multiplication
    // by 0.9144, the same rule the figure's own conversion applies.
    : /\/\s*100\s*yds?(?![\w-])/i.test(fig) ? SD_YD_TO_M
    : null;
  if (factor == null) return trace;
  return trace.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n * factor : v;
  });
}

// An elevation trace is stored in FEET. It is drawn in metres exactly when the
// elevation figure above it says metres, and `unit` is the label to put on it.
// A post with a trace but no elevation figure follows the reader's setting
// (`metricIfNoFigure`), since there is no figure for the chart to disagree with.
export function bsSdElevTraceIn(trace, elevValue, metricIfNoFigure = false) {
  const hasFigure = /\d\s*(?:m|ft)(?![\w/-])/i.test(String(elevValue == null ? '' : elevValue));
  const metres = hasFigure ? sdIsMetres(elevValue) : !!metricIfNoFigure;
  const unit = metres ? 'm' : 'ft';
  if (!Array.isArray(trace) || !trace.length || !metres) return { trace, unit };
  return { trace: trace.map((v) => { const n = Number(v); return Number.isFinite(n) ? n * SD_FT_TO_M : v; }), unit };
}

function sdIsMetres(value) {
  const v = String(value == null ? '' : value);
  return /\d\s*m(?![\w/-])/i.test(v) && !/\d\s*ft(?![\w-])/i.test(v);
}

// Metres, rounded the way the kind of figure is written: whole above ten, one
// decimal below, so 540 ft reads "165 m" and 8 ft reads "2.4 m".
function sdFormatMetres(n, grouped) {
  return sdFormatNumber(n, grouped, Math.abs(n) < 10 ? 1 : 0);
}

const SD_SWIM_TO_M = { km: 1000, mi: SD_MI_TO_KM * 1000, m: 1, yd: SD_YD_TO_M, yds: SD_YD_TO_M };

// `opts` is optional context: `{ sport }`. A swim reads its distances in the
// pool unit of the reader's system. Anything that is not a plain object (an
// Array.map index, say) is ignored rather than read as context.
function sdIsSwim(opts) {
  return !!(opts && typeof opts === 'object' && /swim/i.test(String(opts.sport || '')));
}

// `prefs` is { weight: 'lb'|'kg', distance: 'mi'|'km' } — the reader's two
// Settings units. Anything missing means "leave that family alone".
export function bsSdUnitizeText(text, prefs, opts) {
  if (text == null || text === '') return text;
  const s = String(text);
  if (!prefs) return s;
  const want = { weight: sdUnitKind(prefs.weight).key, distance: sdUnitKind(prefs.distance).key };
  const swim = sdIsSwim(opts);
  // The pool unit of the reader's system: yards for miles, metres for km.
  const pool = want.distance === 'mi' ? 'yd' : want.distance === 'km' ? 'm' : null;

  // Swim pace: seconds per 100 of the pool unit. 100 yd is 91.44 m, so a pace
  // per 100 yd is the pace per 100 m times 0.9144, and back again.
  let out = s.replace(/(\d{1,2}):([0-5]\d)\s*\/\s*100\s*(m|yds?)(?![\w-])/gi, (m, mm, ss, unit) => {
    const src = unit.toLowerCase() === 'm' ? 'm' : 'yd';
    if (!pool || pool === src) return m;
    const secs = Number(mm) * 60 + Number(ss);
    const total = Math.round(pool === 'yd' ? secs * SD_YD_TO_M : secs / SD_YD_TO_M);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/100${pool}`;
  });

  // Speed. Before the distance rule, which would otherwise read the "km" of
  // "km/h" as a distance. Speeds keep one decimal, the way they are written.
  out = out.replace(/(\d[\d,]*(?:\.\d+)?)\s*(mph|km\/h|kph)(?![\w/-])/gi, (m, num, unit) => {
    const src = unit.toLowerCase() === 'mph' ? 'mi' : 'km';
    if (!want.distance || want.distance === src) return m;
    const n = Number(num.replace(/,/g, ''));
    if (!Number.isFinite(n)) return m;
    const conv = want.distance === 'km' ? n * SD_MI_TO_KM : n / SD_MI_TO_KM;
    const fixed = conv.toFixed(1);
    const shown = num.includes(',') ? fixed.replace(/^(\d+)/, (w) => w.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : fixed;
    return `${shown} ${want.distance === 'km' ? 'km/h' : 'mph'}`;
  });

  // Elevation in feet → metres. `ft` is unambiguous, so this is safe in free
  // text; the reverse needs the stat's label (`bsSdUnitizeStat`).
  if (want.distance === 'km') {
    out = out.replace(/(?<![\w/.,:])(\d[\d,]*(?:\.\d+)?)(\s*)ft(?![\w-])/gi, (m, num, gap) => {
      const n = Number(num.replace(/,/g, ''));
      if (!Number.isFinite(n)) return m;
      return `${sdFormatMetres(n * SD_FT_TO_M, num.includes(','))}${gap ? ' ' : ''}m`;
    });
  }

  if (swim && pool) {
    // ⚠ A BARE `m` IS ALSO MINUTES ("1h 05m"), so it is read as metres only in a
    // swim, never straight after an hour, and never as the denominator of a pace.
    out = out.replace(/(?<![\w/.,:])(?<!\d\s{0,3}h\s{0,3})(\d[\d,]*(?:\.\d+)?)(\s*)(km|mi|m|yds?)(?![\w/-])/gi, (m, num, gap, unit) => {
      const u = unit.toLowerCase();
      const src = u === 'yds' ? 'yd' : u;
      if (src === pool) return m;
      const n = Number(num.replace(/,/g, ''));
      if (!Number.isFinite(n)) return m;
      const metres = n * SD_SWIM_TO_M[src];
      const conv = Math.round(pool === 'yd' ? metres / SD_YD_TO_M : metres);
      return `${sdFormatNumber(conv, conv >= 1000, 0)} ${pool}`;
    });
  } else if (want.distance === 'km') {
    // Yards outside a swim (a sled push, a field drill) → metres.
    out = out.replace(/(?<![\w/.,:])(\d[\d,]*(?:\.\d+)?)(\s*)(yds?)(?![\w/-])/gi, (m, num, gap) => {
      const n = Number(num.replace(/,/g, ''));
      if (!Number.isFinite(n)) return m;
      return `${sdFormatNumber(n * SD_YD_TO_M, num.includes(','), 1)}${gap ? ' ' : ''}m`;
    });
  }

  // Pace: "9:30/mi" is minutes-per-unit, so the SAME distance conversion
  // applies to the denominator and therefore INVERTS — a faster-sounding number
  // per kilometre is the same speed. Converting it as a plain distance token
  // would have made every runner 60% faster on a unit flip.
  out = out.replace(/(\d{1,2}):([0-5]\d)\s*\/\s*(mi|km)(?![\w-])/gi, (m, mm, ss, unit) => {
    const src = sdUnitKind(unit).key;
    if (!want.distance || want.distance === src) return m;
    const secs = Number(mm) * 60 + Number(ss);
    // seconds per mile -> seconds per km is a DIVISION by 1.609, not a
    // multiplication: a mile is longer, so each km takes less time.
    const conv = want.distance === 'km' ? secs / SD_MI_TO_KM : secs * SD_MI_TO_KM;
    const total = Math.round(conv);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/${want.distance}`;
  });

  // ⚠ A LADDER OF WEIGHTS SHARES ONE UNIT. "60/70/80 kg" is three weights in kg (a
  // coach's per-set targets, ShapeWorkoutDocument's compact ladder), and converting
  // only the number the unit touches read "60/70/176 lb": two kilogram figures under
  // a pound label. Every number in a slash-joined run before a WEIGHT unit converts
  // together. Distance is deliberately left alone: "1/2 mi" is a fraction, and nothing
  // writes a ladder of distances.
  out = out.replace(/(\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d[\d,]*(?:\.\d+)?)+)(\s*)(lbs?|kg)(?![\w-])/gi, (m, list, gap, unit) => {
    const src = sdUnitKind(unit);
    const target = want.weight;
    if (src.kind !== 'weight' || !target || target === src.key) return m;
    const parts = list.split(/\s*\/\s*/).map((num) => {
      const n = Number(num.replace(/,/g, ''));
      const conv = Number.isFinite(n) ? bsSdConvertValue(n, src.key, target) : null;
      return conv == null ? null : sdFormatNumber(conv, num.includes(','), 1);
    });
    if (parts.some((x) => x == null)) return m;
    return `${parts.join('/')}${gap ? ' ' : ''}${target}`;
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

// A STAT IS A LABEL AND A VALUE, AND THE LABEL CAN SAY WHAT A BARE `m` MEANS.
// In free text `m` is never read as metres outside a swim ("8h 10m" is sleep),
// so an elevation or a stride written in metres would stay metric for an
// imperial reader. Where the label names one, it converts:
//   · Elevation / ascent / climb / altitude: metres → whole feet.
//   · Stride: metres ↔ feet, kept to the precision a stride is written in.
// Everything else goes through `bsSdUnitizeText` with the same context.
const SD_ELEV_LABEL = /elev|ascent|climb|altitude/i;
const SD_STRIDE_LABEL = /stride/i;
// ⚠ A TIME IS NEVER A SWIM DISTANCE. "45m" under Time or Duration is minutes,
// and inside a swim the bare-`m` rule would have read it as 49 yd. A stat whose
// label names a time converts without the swim context.
const SD_TIME_LABEL = /time|duration|elapsed|moving|rest|sleep/i;

export function bsSdUnitizeStat(label, value, prefs, opts) {
  if (value == null || value === '' || !prefs) return value;
  const l = String(label == null ? '' : label);
  const dist = sdUnitKind(prefs.distance).key;
  if (SD_STRIDE_LABEL.test(l)) {
    return String(value).replace(/(?<![\w/.,:])(\d+(?:\.\d+)?)\s*(m|ft)(?![\w/-])/i, (m, num, unit) => {
      const n = Number(num);
      const u = unit.toLowerCase();
      if (!Number.isFinite(n)) return m;
      if (dist === 'mi' && u === 'm') return `${(n / SD_FT_TO_M).toFixed(1)} ft`;
      if (dist === 'km' && u === 'ft') return `${(n * SD_FT_TO_M).toFixed(2)} m`;
      return m;
    });
  }
  if (SD_TIME_LABEL.test(l)) return bsSdUnitizeText(value, prefs);
  let v = String(value);
  if (SD_ELEV_LABEL.test(l) && dist === 'mi') {
    v = v.replace(/(?<![\w/.,:])(\d[\d,]*(?:\.\d+)?)\s*m(?![\w/-])/gi, (m, num) => {
      const n = Number(num.replace(/,/g, ''));
      if (!Number.isFinite(n)) return m;
      return `${sdFormatNumber(n / SD_FT_TO_M, n / SD_FT_TO_M >= 1000, 0)} ft`;
    });
  }
  return bsSdUnitizeText(v, prefs, opts);
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
