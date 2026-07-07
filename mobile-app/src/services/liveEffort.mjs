// "The Meter" — live effort → a 5-zone read on the SAME heat ramp Session
// Details replays with (bsSdHeatColor stops; Z1/Z2 share the cool stop).
// HRmax is a documented conservative default — we never fabricate a per-user max.
export const BS_EFFORT_HRMAX = 190;
export const BS_EFFORT_RAMP = { 1: '#34d6c5', 2: '#34d6c5', 3: '#d8b25a', 4: '#e8843c', 5: '#e0463c' };

export function bsLiveEffort({ bpm, rpe } = {}) {
  const b = Number(bpm);
  if (Number.isFinite(b) && b > 0) {
    const p = b / BS_EFFORT_HRMAX;
    const zone = p < 0.6 ? 1 : p < 0.7 ? 2 : p < 0.8 ? 3 : p < 0.9 ? 4 : 5;
    return { zone, label: `Z${zone}`, source: 'hr' };
  }
  const r = Number(rpe);
  if (Number.isFinite(r) && r > 0) {
    const zone = r <= 4 ? 1 : r <= 6 ? 2 : r <= 7 ? 3 : r <= 8 ? 4 : 5;
    return { zone, label: `Z${zone}`, source: 'rpe' };
  }
  return null;
}
