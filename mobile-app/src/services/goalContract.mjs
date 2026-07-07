// The Contract's verdict copy — ONE pure mapping from the goal facts + the
// ShapeSignals projection to the serif lead + mono subline. The component keeps
// zero verdict logic (spec: docs/superpowers/specs/2026-07-07-goals-workout-open-ledger-design.md).
const r1 = (v) => Math.round(Number(v) * 10) / 10;
const fmt = (v) => {
  const n = r1(v);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('en-US');
};

export function bsGoalVerdict({ start, now, target, unit = 'kg', proj = null }) {
  const s = Number(start) || 0, n = Number(now) || 0, g = Number(target) || 0;
  if (!s || !g || s === g) {
    return { lead: 'Set the terms.', sub: 'ADD A START + TARGET TO OPEN THE CONTRACT', tone: 'neutral' };
  }
  const build = g > s;
  const moved = r1(build ? n - s : s - n);          // progress in the goal's direction
  const range = r1(Math.abs(g - s));
  const toGo = r1(build ? g - n : n - g);
  const pct = Math.max(0, Math.min(1, range ? (range - Math.max(0, toGo)) / range : 0));
  const dirWord = build ? 'up' : 'down';
  const movedLead = `${fmt(Math.abs(moved))} ${unit} ${dirWord}.`;
  const sub = `${build ? 'BUILD' : 'CUT'} · ${fmt(s)} → ${fmt(n)} OF ${fmt(g)} ${String(unit).toUpperCase()} · ${Math.round(pct * 100)}% THERE`;
  const st = proj && proj.state;
  if (st === 'achieved') return { lead: `You did it. ${fmt(g)} ${unit}.`, sub, tone: 'good' };
  if (st === 'on-pace' && proj.projectedLabel) {
    const slip = proj.slip != null && isFinite(proj.slip) && proj.slip >= 7 ? Number(proj.slip) : null;
    return {
      lead: `${movedLead} ${proj.projectedLabel} at this pace.`,
      sub: slip ? `${sub} · +${slip}D THIS WK` : sub,
      tone: slip ? 'warn' : 'good',
    };
  }
  if (st === 'stalled') return { lead: `${movedLead} Pace has flattened.`, sub, tone: 'bad' };
  if (st === 'far') return { lead: `${movedLead} Over a year at this pace.`, sub, tone: 'warn' };
  if (st === 'stale') return { lead: `${movedLead} Log a weigh-in to update the read.`, sub, tone: 'warn' };
  if (moved <= 0) return { lead: `The terms are set. ${fmt(toGo)} ${unit} to go.`, sub, tone: 'neutral' };
  return { lead: `${movedLead} ${fmt(toGo)} to go.`, sub, tone: 'neutral' };
}
