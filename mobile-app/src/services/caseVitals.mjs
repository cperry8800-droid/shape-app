// Case-file DAILY vitals — the client-side sanitizer for the shared-overview
// `vitals` leg (check-in engine spec §3B). The wire payload is a server response
// but the case file renders member-entered figures on a coach's screen, so every
// field is re-validated here rather than trusted: a leg renders ONLY when it
// carries a real finite average, and `Number(null)`/`Number('')` — the finite-0
// fabrication class — are treated as ABSENCE, never a 0/10 gauge.
//
// Returns null when NO metric survives (the station renders its redact line),
// else { energy, hunger, hydration } where each key is { avg, n } or null.
// hydration's average is liters (server key `avg7L`); energy/hunger are /10.

export function bsCaseVitals(d) {
  const v = d && typeof d === 'object' ? d.vitals : null;
  if (!v || typeof v !== 'object') return null;
  const leg = (o, key) => {
    if (!o || typeof o !== 'object') return null;
    const raw = o[key];
    if (raw == null || raw === '') return null; // absence stays absent
    const avg = Number(raw);
    if (!Number.isFinite(avg)) return null;
    const n = Number(o.n);
    return { avg, n: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 };
  };
  const energy = leg(v.energy, 'avg7');
  const hunger = leg(v.hunger, 'avg7');
  const hydration = leg(v.hydration, 'avg7L');
  if (!energy && !hunger && !hydration) return null;
  return { energy, hunger, hydration };
}
