// Pure pace-split + zone model. No React, no window — unit-tested like scoreStanding.mjs.
// Zones are RELATIVE TO THE SESSION'S OWN AVERAGE pace (no user threshold setting exists);
// callers label this "VS THIS SESSION'S AVG".

const BASE_HFRAC = 0.28; // slowest split still shows a readable bar

// Parse a pace/speed string → a comparable where LOWER = FASTER (uniform path for
// runs/swims/rides), plus the display value. Runs/swims: "8:30/mi" | "1:42/100m" →
// { cmp: 510, display: 510 }. Rides: "22.0 mph" → { cmp: 1000/22, display: 22 }.
function paceStrToComparable(str, isRide) {
  const s = String(str == null ? '' : str);
  if (isRide) {
    const m = s.match(/([\d.]+)\s*mph/i) || s.match(/([\d.]+)/);
    const mph = m ? parseFloat(m[1]) : NaN;
    if (!Number.isFinite(mph) || mph <= 0) return null;
    return { cmp: 1000 / mph, display: mph };
  }
  const mm = s.match(/(\d+):(\d+)/);
  if (mm) { const sec = (+mm[1]) * 60 + (+mm[2]); return sec > 0 ? { cmp: sec, display: sec } : null; }
  const n = s.match(/[\d.]+/);
  const sec = n ? parseFloat(n[0]) : NaN;
  return Number.isFinite(sec) && sec > 0 ? { cmp: sec, display: sec } : null;
}

function numFrom(str) {
  if (str == null) return null;
  const m = String(str).match(/-?[\d.]+/);
  return m ? Number(m[0]) : null;
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

function toRows(providerSplits, isRide) {
  const out = [];
  for (const s of providerSplits) {
    const p = paceStrToComparable(s.pace || s.value || s.split || s.time, isRide);
    if (!p) continue;
    out.push({
      label: String(s.label || `Split ${out.length + 1}`),
      cmp: p.cmp,
      paceSec: p.display,
      paceLabel: String(s.pace || s.value || s.split || ''),
      hr: numFrom(s.hr),
      cadence: numFrom(s.cadence),
      elevDelta: numFrom(s.elevation != null ? s.elevation : s.elev),
    });
  }
  return out;
}

// Distance-bucket a uniform trace into per-mile splits (fallback). Parallel
// hr/cadence/elev traces are averaged over the same bucket when present.
function bucketTrace({ paceTrace, hrTrace, cadenceTrace, elevTrace, distanceMi, isRide }) {
  if (!Array.isArray(paceTrace) || paceTrace.length < 2) return [];
  const miles = Math.max(1, Math.round(distanceMi || 0) || Math.min(paceTrace.length, 8));
  const per = paceTrace.length / miles;
  const avg = (arr, a, b) => {
    if (!Array.isArray(arr)) return null;
    const seg = arr.slice(a, b).filter((v) => Number.isFinite(v));
    return seg.length ? seg.reduce((x, y) => x + y, 0) / seg.length : null;
  };
  const rows = [];
  for (let i = 0; i < miles; i++) {
    const a = Math.floor(i * per), b = Math.floor((i + 1) * per);
    const pv = avg(paceTrace, a, b); // seconds/mi (or resampled speed for rides)
    if (pv == null || pv <= 0) continue;
    const cmp = isRide ? 1000 / pv : pv;
    const hr = avg(hrTrace, a, b), cad = avg(cadenceTrace, a, b);
    const e0 = Array.isArray(elevTrace) ? elevTrace[a] : null, e1 = Array.isArray(elevTrace) ? elevTrace[Math.max(a, b - 1)] : null;
    rows.push({
      label: `Mile ${i + 1}`, cmp, paceSec: pv, paceLabel: '',
      hr: hr == null ? null : Math.round(hr),
      cadence: cad == null ? null : Math.round(cad),
      elevDelta: (Number.isFinite(e0) && Number.isFinite(e1)) ? Math.round(e1 - e0) : null,
    });
  }
  return rows;
}

export function bsPaceSplits(input) {
  const inp = input || {};
  const isRide = /ride|bike|cycl|spin|watt|peloton/.test(String(inp.sport || '').toLowerCase());
  let rows = [];
  let source = null;
  const provider = Array.isArray(inp.providerSplits) && inp.providerSplits.length
    ? inp.providerSplits
    : (Array.isArray(inp.laps) && inp.laps.length ? inp.laps : null);
  if (provider) { rows = toRows(provider, isRide); if (rows.length) source = 'provider'; }
  if (!rows.length) { rows = bucketTrace({ ...inp, isRide }); if (rows.length) source = 'trace'; }
  if (!rows.length) return { splits: [], avgSec: null, bestIdx: -1, worstIdx: -1, source: null };

  const cmps = rows.map((r) => r.cmp);
  const avgCmp = cmps.reduce((a, b) => a + b, 0) / cmps.length;
  const avgSec = rows.reduce((a, r) => a + r.paceSec, 0) / rows.length;
  const fast = Math.min(...cmps), slow = Math.max(...cmps), rng = (slow - fast) || 1;
  const bestIdx = cmps.indexOf(fast), worstIdx = cmps.indexOf(slow);
  const splits = rows.map((r) => {
    const hFrac = 1 - ((r.cmp - fast) / rng) * (1 - BASE_HFRAC); // fastest = 1, slowest = BASE_HFRAC
    const zone = bsPaceZoneFor(r.cmp, avgCmp); // cmp is lower=faster for all sports → uniform
    return {
      label: r.label, paceSec: r.paceSec, paceLabel: r.paceLabel,
      hr: r.hr ?? null, cadence: r.cadence ?? null, elevDelta: r.elevDelta ?? null,
      zone, hFrac: Math.max(BASE_HFRAC, Math.min(1, hFrac)),
    };
  });
  return { splits, avgSec, bestIdx, worstIdx, source };
}
