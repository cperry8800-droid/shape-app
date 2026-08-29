// Pure state helpers for the meal logger. Kept out of the JSX component so the
// "is this meal adjusted?" rule and the repricing CTA label are unit-testable
// and can never drift from what the sticky bar / reset row show.

const ingKey = (x) => [x && x.name, x && x.qty, x && x.kcal, x && x.p, x && x.c, x && x.f, x && x.on ? 1 : 0].join('|');

// Adjusted = portion moved off 1×, or the ingredient set differs from the copy
// frozen when the sheet opened (toggle, edit, add, remove).
export function bsMealDirty(portion, ings, initialIngs) {
  if (Number(portion) !== 1) return true;
  const a = Array.isArray(ings) ? ings : [];
  const b = Array.isArray(initialIngs) ? initialIngs : [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (ingKey(a[i]) !== ingKey(b[i])) return true;
  return false;
}

const fmtPortion = (p) => Number(p).toFixed(2).replace(/\.?0+$/, '');

// The translator is INJECTED, never imported — this module is pure and its six
// shipped vectors call it with no second argument. `T` returns the PRE-INTERPOLATED
// English when no translator is supplied, so the fallback path never evaluates ICU,
// and it try/catches so a broken catalog degrades to English rather than blanking the
// one control that files the meal. (Same shape as bsWireLines in the launch cut.)
const T = (tr, key, en, vars) => {
  if (typeof tr === 'function') {
    try {
      const out = tr(key, { defaultValue: en, ...(vars || {}) });
      if (out && out !== key) return out;
    } catch (e) { /* fall through to English */ }
  }
  let s = en;
  for (const [k, v] of Object.entries(vars || {})) s = s.split(`{${k}}`).join(String(v));
  return s;
};

// The one source of truth for the log button's words. Never claims "as planned"
// over an adjusted meal, and only shows a portion multiplier when it's not 1×.
export function bsMealCtaLabel({ dirty, portion, kcal, hasPlanned }, { tr } = {}) {
  if (!dirty && hasPlanned) return T(tr, 'nutrition:log.ctaAsPlanned', 'Log as planned →');
  const k = Math.round(Number(kcal) || 0);
  if (Number(portion) !== 1) {
    return T(tr, 'nutrition:log.ctaPortion', 'Log · {kcal} kcal · {mult}× →', { kcal: k, mult: fmtPortion(portion) });
  }
  return T(tr, 'nutrition:log.cta', 'Log · {kcal} kcal →', { kcal: k });
}
