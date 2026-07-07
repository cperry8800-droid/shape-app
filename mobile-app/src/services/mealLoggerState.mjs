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

// The one source of truth for the log button's words. Never claims "as planned"
// over an adjusted meal, and only shows a portion multiplier when it's not 1×.
export function bsMealCtaLabel({ dirty, portion, kcal, hasPlanned }) {
  if (!dirty && hasPlanned) return 'Log as planned →';
  const k = Math.round(Number(kcal) || 0);
  const mult = Number(portion) !== 1 ? ` · ${fmtPortion(portion)}×` : '';
  return `Log · ${k} kcal${mult} →`;
}
