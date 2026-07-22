// Meal prep — the mobile half of the Prep Session (Cook Mode wave PR C).
//
// The PREPPED-record semantics (window · prune · match · weekKey · summary)
// are CANONICAL in public/newdesign/mealPrep.mjs (one implementation for both
// surfaces — the liveProgress/varianceBand split precedent); this module
// re-exports them and adds the MOBILE-ONLY half: the merged mise (needs the
// cookable contract) and the longest-first session order (needs bsStepTimers)
// — neither is web-servable, so they live here.
//
// Every time-dependent export takes an injected `now` so tests are
// deterministic (the injected-clock rule).

import { bsStepTimers } from './cookable.mjs';

export {
  BS_PREP_WINDOW_MS, bsPrepWeekKey, bsPrunePrep, bsPrepMatch, bsPrepSummary,
} from '../../../public/newdesign/mealPrep.mjs';

// ---------------------------------------------------------------------------
// Quantity parsing — deliberately narrow. We only do arithmetic on quantities
// we can parse EXACTLY (leading number or simple fraction + a unit token);
// anything else stays a verbatim string on its own line. Honest > clever.
// Fraction branch FIRST — the integer branch would otherwise eat the "1" of
// "1/2" and leave "/2" dangling into the tail.
const QTY_RE = /^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\b(.*)$/;

export const bsQtyParse = (n) => {
  const s = String(n || '').trim();
  if (!s) return null;
  const m = QTY_RE.exec(s);
  if (!m) return null;
  let num;
  if (m[1].includes('/')) {
    const [a, b] = m[1].split('/').map((x) => parseFloat(x));
    if (!b) return null;
    num = a / b;
  } else num = parseFloat(m[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Unit token normalized singular for the MATCH key only — display keeps the
  // author's own spelling (we never rewrite "cups" to "cup" on screen).
  const rawUnit = (m[2] || '').trim();
  const unitKey = rawUnit.toLowerCase().replace(/s$/, '');
  const rest = String(m[3] || '').trim();
  return { num, unit: rawUnit, unitKey, rest };
};

const fmtNum = (x) => {
  const r = Math.round(x * 100) / 100;
  return String(r).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

// Scale a quantity string by mult. Parseable → real arithmetic on the leading
// number; unparseable → null (the caller ANNOTATES "× N" instead of inventing
// math on "a pinch").
export const bsScaleQty = (n, mult) => {
  if (!Number.isFinite(mult) || mult === 1) return String(n || '').trim() || null;
  const p = bsQtyParse(n);
  if (!p) return null;
  const tail = [p.unit, p.rest].filter(Boolean).join(' ');
  return `${fmtNum(p.num * mult)}${tail ? ` ${tail}` : ''}`;
};

// ---------------------------------------------------------------------------
// The merged mise. items = [{ cookable, mult? }] (mult = chosen servings /
// the recipe's base servings; defaults 1). Returns
//   { ingredients: [{ n, m, from }], prep: [{ label, from }] }
// where same-name SAME-UNIT quantities sum into one line and clashing units
// keep separate lines under the same name ("200 g" + "1 cup" both print —
// never a fabricated unit conversion).
export const bsMergeMise = (items) => {
  // name -> { display, lines: Map(unitKey|raw -> {sum?, raw?, unit}), from:Set }
  const byName = new Map();
  const prep = new Map();
  (items || []).forEach(({ cookable, mult = 1 } = {}) => {
    if (!cookable) return;
    const title = String(cookable.title || '').trim();
    (cookable.ingredients || []).forEach((ing) => {
      const name = String(ing && ing.m || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const e = byName.get(key) || { display: name, lines: new Map(), from: new Set() };
      if (title) e.from.add(title);
      const scaled = bsScaleQty(ing.n, mult);
      const src = scaled != null ? scaled : String(ing.n || '').trim();
      const annotated = scaled == null && mult !== 1 && src ? `${src} ×${fmtNum(mult)}` : src;
      const p = bsQtyParse(annotated);
      if (p && p.unitKey && !p.rest) {
        // Cleanly "number + unit" → sum with same-unit occurrences.
        const lk = `u:${p.unitKey}`;
        const line = e.lines.get(lk) || { sum: 0, unit: p.unit };
        line.sum += p.num;
        e.lines.set(lk, line);
      } else if (annotated) {
        // Verbatim line (unparseable, or carries a tail like "skin-on") —
        // repeated identical strings collapse to "×N" (the grocery precedent).
        const lk = `r:${annotated.toLowerCase()}`;
        const line = e.lines.get(lk) || { raw: annotated, count: 0 };
        line.count += 1;
        e.lines.set(lk, line);
      } else {
        // No quantity at all — the bare name still earns its row once.
        const line = e.lines.get('r:') || { raw: '', count: 0 };
        line.count += 1;
        e.lines.set('r:', line);
      }
      byName.set(key, e);
    });
    const note = String(cookable.prepNote || '').trim();
    if (note) {
      const pk = note.toLowerCase();
      const pe = prep.get(pk) || { label: note, from: new Set() };
      if (title) pe.from.add(title);
      prep.set(pk, pe);
    }
  });
  const fromStr = (set) => {
    const a = [...set];
    return a.length <= 2 ? a.join(' · ') : `${a.slice(0, 2).join(' · ')} +${a.length - 2}`;
  };
  const fmtN = fmtNum;
  const ingredients = [];
  // Deterministic order: by name code-unit (never localeCompare — collation
  // varies by ICU build; the nora-sets lesson).
  [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).forEach(([, e]) => {
    [...e.lines.values()].forEach((line) => {
      const n = line.unit != null
        ? `${fmtN(line.sum)} ${line.unit}`
        : (line.count > 1 && line.raw ? `${line.raw} ×${line.count}` : line.raw);
      ingredients.push({ n, m: e.display, from: fromStr(e.from) });
    });
  });
  const prepOut = [...prep.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, e]) => ({ label: e.label, from: fromStr(e.from) }));
  return { ingredients, prep: prepOut };
};

// ---------------------------------------------------------------------------
// Session order — longest estimated total first (the long roast leads so its
// passive time overlaps the rest of the session; PR D's orchestrator formalizes
// this). Estimate = every parsed step-timer second + a flat 45s handling per
// step. Recipes with NO parseable time sort by step count alone — never a
// fabricated duration. Deterministic tiebreak on title (code-unit).
export const bsPrepEstimate = (cookable) => {
  const steps = (cookable && cookable.steps) || [];
  let s = 0;
  steps.forEach((st) => {
    const text = typeof st === 'string' ? st : String(st && st.t || '');
    bsStepTimers(text).forEach((tm) => { s += tm.seconds; });
    s += 45;
  });
  return s;
};

const normTitle = (s) => String(s || '').trim().toLowerCase();
export const bsPrepOrder = (items) => [...(items || [])].sort((a, b) => {
  const ea = bsPrepEstimate(a && a.cookable);
  const eb = bsPrepEstimate(b && b.cookable);
  if (eb !== ea) return eb - ea;
  const ta = normTitle(a && a.cookable && a.cookable.title);
  const tb = normTitle(b && b.cookable && b.cookable.title);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
});
