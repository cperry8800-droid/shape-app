// Pure pace-split + zone model. No React, no window — unit-tested like scoreStanding.mjs.
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

// Distance-bucket a uniform trace into per-unit splits (fallback). Parallel
// hr/cadence/elev traces are averaged over the same bucket when present.
function bucketTrace({ paceTrace, hrTrace, cadenceTrace, elevTrace, distanceMi, sport }) {
  if (!Array.isArray(paceTrace) || paceTrace.length < 2) return [];
  const isRide = /ride|bike|cycl|spin|watt|peloton/.test(String(sport || '').toLowerCase());
  // Never make more buckets than we have samples (a 60-mi ride with a 50-sample
  // stream would otherwise produce empty/degenerate sub-sample buckets — Codex P2).
  const wanted = Math.round(distanceMi || 0) || Math.min(paceTrace.length, 8);
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
      label: `Mile ${i + 1}`, cmp, paceVal: pv, paceLabel: fmtLabel(pv, sport),
      hr: hr == null ? null : Math.round(hr),
      cadence: cad == null ? null : Math.round(cad),
      elevDelta: (Number.isFinite(e0) && Number.isFinite(e1)) ? Math.round(e1 - e0) : null,
    });
  }
  return rows;
}

export function bsPaceSplits(input) {
  const inp = input || {};
  let rows = [];
  let source = null;
  const provider = Array.isArray(inp.providerSplits) && inp.providerSplits.length
    ? inp.providerSplits
    : (Array.isArray(inp.laps) && inp.laps.length ? inp.laps : null);
  if (provider) { rows = toRows(provider); if (rows.length) source = 'provider'; }
  if (!rows.length) { rows = bucketTrace(inp); if (rows.length) source = 'trace'; }
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
