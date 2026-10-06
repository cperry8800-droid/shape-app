// Pure pace-split + zone model. No React, no window — unit-tested like scoreStanding.mjs.
// Shared: the app imports it through mobile-app/src/services/paceSplits.mjs, and the
// website's community feed loads it with `import('/newdesign/paceSplits.mjs')`.
// Zones are RELATIVE TO THE SESSION'S OWN AVERAGE pace (no user threshold setting exists);
// callers label this "VS THIS SESSION'S AVG".
//
// `cmp` is the universal comparable: LOWER = FASTER for every sport (run/swim seconds, or
// 1000/mph for rides), so bestIdx / zone / bar-height math is one path. `paceLabel` is the
// ready-to-render display string for EVERY split, so the UI never re-guesses units.

const BASE_HFRAC = 0.28; // slowest split still shows a readable bar

// Parse a pace/speed string → { cmp, val, label }. Format is detected from the STRING
// (mph vs M:SS vs bare number), not from the sport — so a ride whose provider split is
// "3:00/mi" (time) parses correctly instead of being dropped by an mph-only parser.
function parsePace(str) {
  const s = String(str == null ? '' : str).trim();
  const mph = s.match(/([\d.]+)\s*mph/i);
  if (mph) { const v = parseFloat(mph[1]); return (Number.isFinite(v) && v > 0) ? { cmp: 1000 / v, val: v, label: `${v.toFixed(1)} mph` } : null; }
  // ⚠ A SPEED IN KM/H IS STILL A SPEED. A ride's breakdown reaches here already
  // converted for a metric reader, and without this branch "31.1 km/h" fell to
  // the bare-number path below, where LOWER reads FASTER — the fastest split
  // ranked slowest. `cmp` only has to order one session's splits, so 1000/v
  // serves km/h exactly as it serves mph.
  const kmh = s.match(/([\d.]+)\s*(?:km\/h|kph)/i);
  if (kmh) { const v = parseFloat(kmh[1]); return (Number.isFinite(v) && v > 0) ? { cmp: 1000 / v, val: v, label: `${v.toFixed(1)} km/h` } : null; }
  const mmss = s.match(/(\d+):(\d+)/);
  if (mmss) { const sec = (+mmss[1]) * 60 + (+mmss[2]); return sec > 0 ? { cmp: sec, val: sec, label: s } : null; }
  const bare = s.match(/[\d.]+/);
  const v = bare ? parseFloat(bare[0]) : NaN;
  return (Number.isFinite(v) && v > 0) ? { cmp: v, val: v, label: s || String(v) } : null;
}

function numFrom(str) {
  if (str == null) return null;
  const m = String(str).match(/-?[\d.]+/);
  return m ? Number(m[0]) : null;
}

// Format a trace-derived value into a display label for the split's sport.
function fmtLabel(val, sport) {
  const s = String(sport || '').toLowerCase();
  if (/ride|bike|cycl|spin|watt|peloton/.test(s)) return `${val.toFixed(1)} mph`;
  const mm = Math.floor(val / 60), ss = Math.round(val % 60);
  const unit = /swim/.test(s) ? '/100m' : '/mi';
  return `${mm}:${String(ss).padStart(2, '0')}${unit}`;
}

export function bsPaceZoneFor(paceSec, avgSec) {
  if (!Number.isFinite(paceSec) || !Number.isFinite(avgSec) || paceSec <= 0 || avgSec <= 0) return 3;
  const d = (paceSec - avgSec) / avgSec; // >0 = slower than avg
  if (d <= -0.08) return 5;
  if (d <= -0.03) return 4;
  if (d < 0.03) return 3;
  if (d < 0.08) return 2;
  return 1;
}

function toRows(providerSplits) {
  const out = [];
  for (const s of providerSplits) {
    const p = parsePace(s.pace || s.value || s.split || s.time);
    if (!p) continue;
    out.push({
      label: String(s.label || `Split ${out.length + 1}`),
      cmp: p.cmp, paceVal: p.val, paceLabel: p.label,
      hr: numFrom(s.hr), cadence: numFrom(s.cadence),
      elevDelta: numFrom(s.elevation != null ? s.elevation : s.elev),
    });
  }
  return out;
}

const MI_TO_KM = 1.609344;

// The distance unit a set of split rows is cut in: what a row's LABEL says
// ('Mile 3', 'Km 3'), else what its pace is per ('8:01/mi'). null when nothing
// says (laps). ⚠ The label wins: a demo breakdown reaches here with its paces
// already converted for the reader ('4:59/km') while its rows are still miles.
function splitsUnit(rows) {
  for (const s of rows) {
    const label = String((s && s.label) || '');
    if (/^(mile|mi)\b/i.test(label)) return 'mi';
    if (/^(km|kilomet)/i.test(label)) return 'km';
  }
  for (const s of rows) {
    const pace = String((s && (s.pace || s.value || s.split || s.time)) || '');
    if (/\/\s*mi\b/i.test(pace)) return 'mi';
    if (/\/\s*km\b/i.test(pace)) return 'km';
  }
  return null;
}

// Distance-bucket a uniform trace into per-unit splits (fallback). Parallel
// hr/cadence/elev traces are averaged over the same bucket when present.
// ⚠ ONE SPLIT PER MILE FOR AN IMPERIAL READER AND PER KILOMETRE FOR A METRIC ONE,
// so a split table never says "Mile 3" over a pace per km. `distance` is in
// `unit`; with no distance there is no unit to cut by, so the buckets say "Split".
function bucketTrace({ paceTrace, hrTrace, cadenceTrace, elevTrace, distance, unit, sport }) {
  if (!Array.isArray(paceTrace) || paceTrace.length < 2) return [];
  const isRide = /ride|bike|cycl|spin|watt|peloton/.test(String(sport || '').toLowerCase());
  const known = Number.isFinite(distance) && distance > 0;
  const name = known ? (unit === 'km' ? 'Km' : 'Mile') : 'Split';
  // Never make more buckets than we have samples (a 60-mi ride with a 50-sample
  // stream would otherwise produce empty/degenerate sub-sample buckets — Codex P2).
  const wanted = (known && Math.round(distance)) || Math.min(paceTrace.length, 8);
  const buckets = Math.max(1, Math.min(wanted, paceTrace.length));
  const per = paceTrace.length / buckets;
  const avg = (arr, a, b) => {
    if (!Array.isArray(arr)) return null;
    const seg = arr.slice(a, b).filter((v) => Number.isFinite(v));
    return seg.length ? seg.reduce((x, y) => x + y, 0) / seg.length : null;
  };
  const rows = [];
  for (let i = 0; i < buckets; i++) {
    const a = Math.floor(i * per), b = Math.floor((i + 1) * per);
    const pv = avg(paceTrace, a, b); // sec/mi or sec/100m; mph for rides (resampled speed)
    if (pv == null || pv <= 0) continue;
    const cmp = isRide ? 1000 / pv : pv;
    const hr = avg(hrTrace, a, b), cad = avg(cadenceTrace, a, b);
    const e0 = Array.isArray(elevTrace) ? elevTrace[a] : null, e1 = Array.isArray(elevTrace) ? elevTrace[Math.max(a, b - 1)] : null;
    rows.push({
      label: `${name} ${i + 1}`, cmp, paceVal: pv, paceLabel: fmtLabel(pv, sport),
      hr: hr == null ? null : Math.round(hr),
      cadence: cad == null ? null : Math.round(cad),
      elevDelta: (Number.isFinite(e0) && Number.isFinite(e1)) ? Math.round(e1 - e0) : null,
    });
  }
  return rows;
}

// `unit` is the reader's distance unit ('mi' default, or 'km') and `distance` the
// session's distance in it. `distanceMi` is still read when `distance` is absent.
export function bsPaceSplits(input) {
  const inp = input || {};
  const unit = inp.unit === 'km' ? 'km' : 'mi';
  const distance = Number.isFinite(inp.distance) ? inp.distance
    : (Number.isFinite(inp.distanceMi) ? (unit === 'km' ? inp.distanceMi * MI_TO_KM : inp.distanceMi) : null);
  let rows = [];
  let source = null;
  const provider = Array.isArray(inp.providerSplits) && inp.providerSplits.length
    ? inp.providerSplits
    : (Array.isArray(inp.laps) && inp.laps.length ? inp.laps : null);
  // ⚠ SPLITS CUT IN THE OTHER UNIT ARE RE-CUT FROM THE TRACE. A provider's rows are
  // one per mile; a metric reader gets one per kilometre from the same session's
  // trace instead. With no trace there is nothing to re-cut, and the rows stay.
  const otherUnit = provider && splitsUnit(provider) && splitsUnit(provider) !== unit
    && Array.isArray(inp.paceTrace) && inp.paceTrace.length >= 2;
  if (provider && !otherUnit) { rows = toRows(provider); if (rows.length) source = 'provider'; }
  if (!rows.length) { rows = bucketTrace({ ...inp, unit, distance }); if (rows.length) source = 'trace'; }
  if (!rows.length) return { splits: [], avgCmp: null, bestIdx: -1, worstIdx: -1, source: null };

  const cmps = rows.map((r) => r.cmp);
  const avgCmp = cmps.reduce((a, b) => a + b, 0) / cmps.length;
  const fast = Math.min(...cmps), slow = Math.max(...cmps), rng = (slow - fast) || 1;
  const bestIdx = cmps.indexOf(fast), worstIdx = cmps.indexOf(slow);
  const splits = rows.map((r) => ({
    label: r.label, paceVal: r.paceVal, paceLabel: r.paceLabel,
    hr: r.hr ?? null, cadence: r.cadence ?? null, elevDelta: r.elevDelta ?? null,
    zone: bsPaceZoneFor(r.cmp, avgCmp), // cmp lower=faster for all sports → uniform
    hFrac: Math.max(BASE_HFRAC, Math.min(1, 1 - ((r.cmp - fast) / rng) * (1 - BASE_HFRAC))),
  }));
  return { splits, avgCmp, bestIdx, worstIdx, source };
}
