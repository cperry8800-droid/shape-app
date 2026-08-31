// The Contract's verdict copy — ONE pure mapping from the goal facts + the
// ShapeSignals projection to the serif lead + mono subline. The component keeps
// zero verdict logic (spec: docs/superpowers/specs/2026-07-07-goals-workout-open-ledger-design.md).
//
// ⚠ THE TRANSLATOR IS INJECTED, NEVER A HOOK. This is a module-scope pure
// function with six existing test vectors and no React in scope, so it takes
// `tr` as an argument (the cut-1 `bsWireLines` / cut-5 `bsTrainT` shape). `T()`
// returns the caller's ALREADY-INTERPOLATED English when no translator is
// supplied, so no ICU is ever evaluated on the path that exists precisely
// because the catalog failed to load — and it try/catches, so a broken catalog
// degrades to English rather than blanking the page's one job.
function T(tr, key, en, vars) {
  if (typeof tr !== 'function') return en;
  try {
    const v = tr(key, { defaultValue: en, ...(vars || {}) });
    return (v == null || v === '' || v === key) ? en : v;
  } catch (e) { return en; }
}
const r1 = (v) => Math.round(Number(v) * 10) / 10;
const fmt = (v) => {
  const n = r1(v);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('en-US');
};

export function bsGoalVerdict({ start, now, target, unit = 'kg', proj = null, tr = null }) {
  const s = Number(start) || 0, n = Number(now) || 0, g = Number(target) || 0;
  if (!s || !g || s === g) {
    return {
      lead: T(tr, 'goal:verdict.setTerms', 'Set the terms.'),
      sub: T(tr, 'goal:verdict.setTermsSub', 'ADD A START + TARGET TO OPEN THE CONTRACT'),
      tone: 'neutral',
    };
  }
  const build = g > s;
  const moved = r1(build ? n - s : s - n);          // progress in the goal's direction
  const range = r1(Math.abs(g - s));
  const toGo = r1(build ? g - n : n - g);
  const pct = Math.max(0, Math.min(1, range ? (range - Math.max(0, toGo)) / range : 0));
  const amount = fmt(Math.abs(moved));
  // Two keys, not one with a {dir} placeholder: "up"/"down" is the verb of the
  // sentence, and a locale that inflects around it cannot be served by swapping
  // one word into a fixed frame.
  const movedLead = build
    ? T(tr, 'goal:verdict.movedUp', `${amount} ${unit} up.`, { amount, unit })
    : T(tr, 'goal:verdict.movedDown', `${amount} ${unit} down.`, { amount, unit });
  const dir = build ? T(tr, 'goal:verdict.dirBuild', 'BUILD') : T(tr, 'goal:verdict.dirCut', 'CUT');
  // ⚠ NO `String(unit).toUpperCase()` HERE, and the reason is that `unit` is
  // MEMBER-TYPED FREE TEXT — BSOverallEditSheet renders it as a 6-character
  // input, not a two-value picker. `toUpperCase()` is locale-INSENSITIVE (the
  // Turkish dotted-i class this file's own house has now paid for three times),
  // so a member who types a unit containing `i` had it folded by English rules.
  // The one render site (BSGoalsContract's verdict subline) already carries CSS
  // `text-transform: uppercase`, which IS locale-aware through <html lang> — so
  // deleting the JS fold loses nothing on screen and fixes the fold. The
  // authored words (BUILD/CUT/OF/THERE) keep their shipped casing: those are
  // copy, and an i18n cut preserves copy rather than rewriting it.
  const sub = T(tr, 'goal:verdict.sub', `${dir} · ${fmt(s)} → ${fmt(n)} OF ${fmt(g)} ${unit} · ${Math.round(pct * 100)}% THERE`,
    { dir, start: fmt(s), now: fmt(n), target: fmt(g), unit, pct: Math.round(pct * 100) });
  const st = proj && proj.state;
  if (st === 'achieved') {
    return { lead: T(tr, 'goal:verdict.achieved', `You did it. ${fmt(g)} ${unit}.`, { target: fmt(g), unit }), sub, tone: 'good' };
  }
  if (st === 'on-pace' && proj.projectedLabel) {
    const slip = proj.slip != null && isFinite(proj.slip) && proj.slip >= 7 ? Number(proj.slip) : null;
    return {
      lead: T(tr, 'goal:verdict.onPace', `${movedLead} ${proj.projectedLabel} at this pace.`, { moved: movedLead, date: proj.projectedLabel }),
      sub: slip ? T(tr, 'goal:verdict.subSlip', `${sub} · +${slip}D THIS WK`, { sub, days: slip }) : sub,
      tone: slip ? 'warn' : 'good',
    };
  }
  if (st === 'stalled') return { lead: T(tr, 'goal:verdict.stalled', `${movedLead} Pace has flattened.`, { moved: movedLead }), sub, tone: 'bad' };
  if (st === 'far') return { lead: T(tr, 'goal:verdict.far', `${movedLead} Over a year at this pace.`, { moved: movedLead }), sub, tone: 'warn' };
  if (st === 'stale') return { lead: T(tr, 'goal:verdict.stale', `${movedLead} Log a weigh-in to update the read.`, { moved: movedLead }), sub, tone: 'warn' };
  if (moved <= 0) {
    return { lead: T(tr, 'goal:verdict.termsSet', `The terms are set. ${fmt(toGo)} ${unit} to go.`, { toGo: fmt(toGo), unit }), sub, tone: 'neutral' };
  }
  return { lead: T(tr, 'goal:verdict.toGo', `${movedLead} ${fmt(toGo)} to go.`, { moved: movedLead, toGo: fmt(toGo) }), sub, tone: 'neutral' };
}
