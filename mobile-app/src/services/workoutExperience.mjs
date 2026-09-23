// Presentation is a preference, never a second workout engine. Scope the saved
// choice to the account, like the session drafts; sign-out's shapeClient scrub
// removes it. Invalid/old values reopen the chooser rather than breaking a log.
export const BS_WORKOUT_VIEWS = ['focus', 'log', 'guided'];
export const bsWorkoutView = value => BS_WORKOUT_VIEWS.includes(value) ? value : null;
export const bsWorkoutViewKey = userId => userId ? `shapeClientWorkoutView:${userId}` : null;
export function bsReadWorkoutView(storage, userId) {
  try { return userId ? bsWorkoutView(storage?.getItem(bsWorkoutViewKey(userId))) : null; } catch { return null; }
}
export function bsSaveWorkoutView(storage, userId, view) {
  if (!userId || !bsWorkoutView(view)) return false;
  try { storage.setItem(bsWorkoutViewKey(userId), view); return true; } catch { return false; }
}

// A Bluetooth connection is not proof that fresh measurements are arriving.
// Keep source timestamps, leave gaps visible, and never sample a cached reading
// on a timer. One observation per second bounds a ten-hour draft to 36,000 rows.
export const BS_HR_FRESH_MS = 15000;
export const BS_HR_MAX_SAMPLES = 36000;
export const bsValidBpm = bpm => typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0 && bpm <= 65535;
export function bsHrFresh(reading, now) {
  return !!reading?.connected && bsValidBpm(reading.bpm) && Number.isFinite(reading.t)
    && now >= reading.t && now - reading.t < BS_HR_FRESH_MS;
}
export function bsCollectHr(samples, detail, now = Date.now()) {
  const last = samples[samples.length - 1];
  if (detail?.connected === false) { bsCloseHr(samples, now); return false; }
  const stamp = Number.isFinite(detail?.t) ? detail.t : now;
  if (!bsValidBpm(detail?.bpm) || stamp > now || now - stamp >= BS_HR_FRESH_MS
    || (last && stamp - last.t < 1000) || samples.length >= BS_HR_MAX_SAMPLES) return false;
  samples.push({ bpm: detail.bpm, t: stamp });
  return true;
}
export function bsCloseHr(samples, at) {
  const last = samples[samples.length - 1];
  if (last && Number.isFinite(at)) last.until = Math.max(last.t, Math.min(last.until ?? Infinity, at));
}
export function bsRestoreHr(samples) {
  const rows = [];
  for (const s of Array.isArray(samples) ? samples : []) {
    if (!bsValidBpm(s?.bpm) || !Number.isFinite(s.t) || (rows.length && s.t - rows[rows.length - 1].t < 1000)) continue;
    rows.push({ bpm: s.bpm, t: s.t, ...(Number.isFinite(s.until) ? { until: Math.max(s.t, s.until) } : {}) });
    if (rows.length >= BS_HR_MAX_SAMPLES) break;
  }
  return rows;
}
export function bsHrSummary(samples, start, end) {
  const rows = bsRestoreHr(samples).filter(s => s.t >= start && s.t <= end);
  if (!rows.length) return null;
  let coveredMs = 0;
  rows.forEach((s, i) => { coveredMs += Math.max(0, Math.min(end, rows[i + 1]?.t ?? end, s.t + BS_HR_FRESH_MS, s.until ?? end) - s.t); });
  return {
    avg: Math.round(rows.reduce((sum, s) => sum + s.bpm, 0) / rows.length),
    max: Math.max(...rows.map(s => s.bpm)), samples: rows.length,
    coveredSeconds: Math.round(coveredMs / 1000),
    coveragePercent: end > start ? Math.round(100 * coveredMs / (end - start)) : 0,
    source: 'bluetooth_heart_rate',
  };
}
export function bsHrSensorSamples(samples, start, end) {
  const rows = bsRestoreHr(samples).filter(s => s.t >= start && s.t <= end);
  let segment = 0;
  const segments = rows.map((s, i) => {
    const prev = rows[i - 1];
    if (prev && (s.t - prev.t >= BS_HR_FRESH_MS || prev.until < s.t)) segment += 1;
    return segment;
  });
  // The atomic RPC accepts 5,000 samples INCLUDING its summary. Long sessions
  // retain each time bucket's first, last, minimum and maximum actual reading.
  // Summary statistics still use all captured observations; gap markers survive
  // reduction so the coach never sees a line across a missing-signal interval.
  const selected = new Set();
  const size = rows.length <= 4999 ? 1 : Math.ceil(rows.length / 1249);
  for (let from = 0; from < rows.length; from += size) {
    const to = Math.min(rows.length, from + size) - 1;
    let min = from, max = from;
    for (let i = from + 1; i <= to; i++) {
      if (rows[i].bpm < rows[min].bpm) min = i;
      if (rows[i].bpm > rows[max].bpm) max = i;
    }
    [from, min, max, to].forEach(i => selected.add(i));
  }
  let previous = null;
  return [...selected].sort((x, y) => x - y).map(i => {
    const s = rows[i], gapBefore = previous != null && segments[previous] !== segments[i];
    previous = i;
    return { provider: 'bluetooth_heart_rate', sampleType: 'heart_rate', sampledAt: new Date(s.t).toISOString(),
      value: s.bpm, unit: 'bpm', payload: { gapBefore, source: 'bluetooth_heart_rate' } };
  });
}
// Coach chart uses actual timestamps and explicitly broken segments. No lines
// across a disconnect, pause, or stale signal; no invented zero-bpm readings.
export function bsHrChart(samples, start, end) {
  const rows = (samples || []).filter(s => (s.sample_type || s.sampleType) === 'heart_rate')
    .map(s => ({ bpm: Number(s.value), t: Date.parse(s.sampled_at || s.sampledAt), until: s.payload?.until, gapBefore: s.payload?.gapBefore }))
    .filter(s => bsValidBpm(s.bpm) && Number.isFinite(s.t)).sort((a, b) => a.t - b.t);
  if (!rows.length) return [];
  const from = Number.isFinite(start) ? Math.min(start, rows[0].t) : rows[0].t;
  const to = Number.isFinite(end) ? Math.max(end, rows.at(-1).t) : rows.at(-1).t;
  const low = Math.min(...rows.map(s => s.bpm)) - 5, high = Math.max(...rows.map(s => s.bpm)) + 5;
  const groups = [];
  rows.forEach((s, i) => {
    const prev = rows[i - 1];
    if (!prev || (typeof s.gapBefore === 'boolean' ? s.gapBefore : s.t - prev.t >= BS_HR_FRESH_MS || prev.until < s.t)) groups.push([]);
    groups.at(-1).push([((s.t - from) / Math.max(1, to - from) * 300).toFixed(1), (70 - (s.bpm - low) / (high - low) * 60).toFixed(1)].join(','));
  });
  return groups.map(g => g.join(' '));
}
