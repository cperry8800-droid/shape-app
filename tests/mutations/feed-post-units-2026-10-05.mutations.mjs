// Mutation spec for "one post, one system of units" (owner screenshot, 2026-10-05:
// a feed swim read "Masters swim · 1.2 mi" over a "2,000 m" plate). Each mutation
// breaks one clause of the fix; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/feed-post-units-2026-10-05.mutations.mjs --fail-on-skipped
// The converter moved to public/newdesign/unitText.mjs (#2205's follow-up, the
// website feed), and sessionLedger.mjs re-exports it.
const LEDGER = 'public/newdesign/unitText.mjs';
const CARD = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const SPLITS = 'public/newdesign/paceSplits.mjs';

export default {
  test: 'node --test tests/units-display-text.test.mjs tests/feed-post-units.test.mjs tests/instrument-tile-detail.test.mjs tests/instrument-board.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the converter ──
    { name: 'a swim is not read as a swim: its distances never reach the pool unit', file: LEDGER,
      find: "return !!(opts && typeof opts === 'object' && /swim/i.test(String(opts.sport || '')));",
      replace: 'return false;' },
    { name: 'any truthy context reads as a swim (an Array.map index)', file: LEDGER,
      find: "return !!(opts && typeof opts === 'object' && /swim/i.test(String(opts.sport || '')));",
      replace: "return !!opts && (typeof opts !== 'object' || /swim/i.test(String(opts.sport || '')));" },
    { name: 'the hour guard is dropped: "1h 05m" in a swim becomes yards', file: LEDGER,
      find: '(?<![\\w/.,:])(?<!\\d\\s{0,3}h\\s{0,3})(\\d[\\d,]*(?:\\.\\d+)?)(\\s*)(km|mi|m|yds?)(?![\\w/-])',
      replace: '(?<![\\w/.,:])(\\d[\\d,]*(?:\\.\\d+)?)(\\s*)(km|mi|m|yds?)(?![\\w/-])' },
    { name: 'the pace denominator guard is dropped: the 100 of "/100m" reads as a distance', file: LEDGER,
      find: '(?<![\\w/.,:])(?<!\\d\\s{0,3}h\\s{0,3})(\\d[\\d,]*(?:\\.\\d+)?)(\\s*)(km|mi|m|yds?)(?![\\w/-])',
      replace: '(?<!\\d\\s{0,3}h\\s{0,3})(\\d[\\d,]*(?:\\.\\d+)?)(\\s*)(km|mi|m|yds?)(?![\\w/-])' },
    { name: 'a swim pace converts the wrong way (divides where it multiplies)', file: LEDGER,
      find: "const total = Math.round(pool === 'yd' ? secs * SD_YD_TO_M : secs / SD_YD_TO_M);",
      replace: "const total = Math.round(pool === 'yd' ? secs / SD_YD_TO_M : secs * SD_YD_TO_M);" },
    { name: 'speed never converts', file: LEDGER,
      find: "if (!want.distance || want.distance === src) return m;\n    const n = Number(num.replace(/,/g, ''));\n    if (!Number.isFinite(n)) return m;\n    const conv = want.distance === 'km' ? n * SD_MI_TO_KM : n / SD_MI_TO_KM;",
      replace: "return m;\n    const n = Number(num.replace(/,/g, ''));\n    if (!Number.isFinite(n)) return m;\n    const conv = want.distance === 'km' ? n * SD_MI_TO_KM : n / SD_MI_TO_KM;" },
    { name: 'feet never become metres', file: LEDGER,
      find: "  if (want.distance === 'km') {\n    out = out.replace(/(?<![\\w/.,:])(\\d[\\d,]*(?:\\.\\d+)?)(\\s*)ft(?![\\w-])/gi",
      replace: "  if (false) {\n    out = out.replace(/(?<![\\w/.,:])(\\d[\\d,]*(?:\\.\\d+)?)(\\s*)ft(?![\\w-])/gi" },
    { name: 'an elevation label no longer turns metres into feet', file: LEDGER,
      find: "if (SD_ELEV_LABEL.test(l) && dist === 'mi') {",
      replace: 'if (false) {' },
    { name: 'a stride is not converted', file: LEDGER,
      find: "if (dist === 'mi' && u === 'm') return `${(n / SD_FT_TO_M).toFixed(1)} ft`;",
      replace: '' },
    { name: 'yards outside a swim stay yards for a metric reader', file: LEDGER,
      find: "  } else if (want.distance === 'km') {\n    // Yards outside a swim",
      replace: "  } else if (false) {\n    // Yards outside a swim" },
    // ── the traces ──
    { name: 'a km/h figure leaves its trace in mph', file: LEDGER,
      find: ': /\\d\\s*(?:km\\/h|kph)(?![\\w-])/i.test(fig) ? SD_MI_TO_KM',
      replace: ': /\\d\\s*(?:km\\/h|kph)(?![\\w-])/i.test(fig) ? 1' },
    { name: 'a /100yd figure leaves its trace per 100 m', file: LEDGER,
      find: ': /\\/\\s*100\\s*yds?(?![\\w-])/i.test(fig) ? SD_YD_TO_M',
      replace: ': /\\/\\s*100\\s*yds?(?![\\w-])/i.test(fig) ? 1' },
    { name: 'the elevation trace ignores its figure', file: LEDGER,
      find: 'const metres = hasFigure ? sdIsMetres(elevValue) : !!metricIfNoFigure;',
      replace: 'const metres = !!metricIfNoFigure;' },
    // ── the card ──
    { name: 'the card title loses the post\'s sport', file: CARD,
      find: "a.kind === 'run' ? 'Long run' : a.title), uCtx);",
      replace: "a.kind === 'run' ? 'Long run' : a.title));" },
    { name: 'the card converts stats as plain text, without their label or sport', file: CARD,
      find: '[r[0], byLabel ? t.uStat(r[0], r[1], uCtx) : t.uText(r[1], uCtx), ...r.slice(2).map(uMeta)]',
      replace: '[r[0], t.uText(r[1]), ...r.slice(2).map(uMeta)]' },
    { name: 'a real swim keeps its rounded miles', file: CARD,
      find: "const swimMetres = (/swim/i.test(String(p.workout || '')) && Number(rm.distanceMeter) > 0) ? Math.round(Number(rm.distanceMeter)) : null;",
      replace: 'const swimMetres = null;' },
    // ── the session page ──
    { name: 'split labels are drawn in the stored units', file: CARD,
      find: 'paceLabel: x.paceLabel ? t.uText(x.paceLabel, { sport }) : x.paceLabel,',
      replace: 'paceLabel: x.paceLabel,' },
    { name: 'the elevation chart is labelled feet for everyone', file: CARD,
      find: 'distanceMi={distanceMi} unit={elevIn.unit} />',
      replace: 'distanceMi={distanceMi} unit="ft" />' },
    // ── the review round (Fable) ──
    { name: 'breakdown rows convert as stats again: a movement name reads as a label', file: CARD,
      find: 'rows: uStats(a.breakdown.rows, false) } : null,',
      replace: 'rows: uStats(a.breakdown.rows) } : null,' },
    { name: 'a time label keeps the swim context: "45m" reads as yards', file: LEDGER,
      find: '  if (SD_TIME_LABEL.test(l)) return bsSdUnitizeText(value, prefs);\n',
      replace: '' },
    { name: 'the hour guard covers only the unspaced form', file: LEDGER,
      find: '(?<!\\d\\s{0,3}h\\s{0,3})',
      replace: '(?<!\\dh\\s{0,2})' },
    { name: 'a small metric climb is rounded to a whole metre', file: CARD,
      find: '? (Math.abs(x.elevDelta * 0.3048) < 10 ? Math.round(x.elevDelta * 3.048) / 10 : Math.round(x.elevDelta * 0.3048))',
      replace: '? Math.round(x.elevDelta * 0.3048)' },
    { name: 'a grouped speed loses its grouping', file: LEDGER,
      find: "const shown = num.includes(',') ? fixed.replace(",
      replace: "const shown = false ? fixed.replace(" },
    { name: 'the split model reads km/h as a pace', file: SPLITS,
      find: "const kmh = s.match(/([\\d.]+)\\s*(?:km\\/h|kph)/i);",
      replace: 'const kmh = null;' },
  ],
};
