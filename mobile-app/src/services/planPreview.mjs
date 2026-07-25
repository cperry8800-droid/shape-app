// Plan preview — the model behind the Listing's "what's inside" sheet.
//
// A buyer looking at a coach's programs and single workouts could see a name, a
// price and a one-line meta, and nothing else. This turns the coach's OWN
// authored outline (coach_plans.detail.blocks) into a structured preview so the
// purchase is informed.
//
// THE HONESTY RULE: this module never invents a session. Every unit it returns
// is parsed from a block the coach actually wrote, through the SAME parsers the
// Assign flow uses (planOutline.mjs — one implementation, so a preview can
// never describe a plan differently from how it is delivered). Where the coach
// stated nothing, the model says null and the sheet renders nothing.
//
// THE PAYWALL RULE: a split is the plan's table of contents — its day lines are
// structure, and the sessions' exercises do not exist in the data, so there is
// nothing deeper to withhold and the whole split shows. An exercise list or a
// menu IS the product, so it shows BS_PREVIEW_FREE_UNITS units and reports the
// remainder as locked. The sheet never renders a locked unit's text.

import { bsAssignDayLine, bsAssignExercise, bsAssignMeal } from './planOutline.mjs';

// How many units of a session/menu a buyer sees before paying.
export const BS_PREVIEW_FREE_UNITS = 2;

// Bounds — blocks come off a public-read provider row, so a crafted plan could
// carry a huge array or huge strings. We only ever parse/keep this many.
const BLOCK_SCAN = 40;
const TITLE_MAX = 120;

const clean = (v) => String(v == null ? '' : v).slice(0, 2000).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, TITLE_MAX);

// A block may be a bare string or the PR-E authored object { text, … }.
function blockText(b) {
  if (b == null) return '';
  if (typeof b === 'string') return clean(b);
  if (typeof b === 'object' && !Array.isArray(b) && b.text != null) return clean(b.text);
  return '';
}

// "6 weeks · 4 days" / "6 week hypertrophy" / "12 wk · 48 on it" → 6 / 12. Only
// ever reads a STATED number — an unstated length is null, never a guess from
// the block count.
//
// `wk`/`wks` are accepted because that is what the live catalogue actually
// writes ("12 wk · 48 on it · 4.9 ★", "4 wks · fast & balanced · $130"), and
// the Assign flow's own duration parser already reads `wk|week`. Matching only
// the long form here made every one of those plans silently drop its Weeks
// register — real stated information lost in this preview alone.
function statedWeeks(...sources) {
  for (const s of sources) {
    // \b before the digits so a longer number can't be misread — "106 weeks"
    // must not parse as "6 weeks". slice bounds the (attacker-controllable) scan.
    const m = String(s || '').slice(0, 200).match(/\b(\d{1,2})\s*[-\s]?\s*(?:wks?|weeks?)\b/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 52) return n;
    }
  }
  return null;
}

export function bsPlanPreview(plan, opts) {
  const isNutri = !!(opts && opts.isNutri);
  const detail = (plan && plan.detail && typeof plan.detail === 'object') ? plan.detail : {};
  const rawBlocks = Array.isArray(detail.blocks) ? detail.blocks.slice(0, BLOCK_SCAN) : [];
  const texts = rawBlocks.map(blockText).filter(Boolean);

  const media = (Array.isArray(detail.media) ? detail.media : [])
    .slice(0, BLOCK_SCAN)   // bound the scan first — the array is attacker-controllable
    .filter((m) => m && typeof m === 'object' && typeof m.url === 'string' && m.url)
    .slice(0, 8)
    .map((m) => ({ ...m, url: m.url.slice(0, 2048) }));   // bound the url length too
  const note = clean(detail.note);
  const weeks = statedWeeks(plan && plan.meta, plan && plan.name);

  const empty = { kind: null, weeks, sessionsPerWeek: null, units: [], free: [], locked: 0, note, media };
  if (!texts.length) return empty;

  // A weekday split — the shape the Assign flow also keys off (≥3 day lines).
  //
  // Gated on !isNutri to match `iosAppBroadsheetPros.jsx`'s own test verbatim
  // (`const isSplit = !isNutri && dayLines.filter(Boolean).length >= 3`). A
  // nutrition plan whose meals happen to carry weekday prefixes ("Mon —
  // Breakfast…" through "Wed — Dinner…") clears the ≥3 bar, so without this
  // gate it was classified as a workout split: rows labelled as DAYS, every
  // meal exposed with `locked: 0`, and the meal-specific kcal treatment skipped
  // — a preview that disagrees with what the buyer is actually assigned.
  const dayLines = texts.map(bsAssignDayLine);
  if (!isNutri && dayLines.filter(Boolean).length >= 3) {
    const units = [];
    for (let i = 0; i < texts.length; i += 1) {
      const dl = dayLines[i];
      if (!dl) continue;
      units.push({
        label: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][dl.dow] || '',
        title: clean(dl.title),
        rest: !!dl.rest,
      });
    }
    return {
      kind: 'split',
      weeks,
      sessionsPerWeek: units.filter((u) => !u.rest).length,
      units,
      free: units,   // structure, not withheld content
      locked: 0,
      note,
      media,
    };
  }

  if (isNutri) {
    const units = texts.map((t) => {
      const m = bsAssignMeal(t);
      if (!m) return null;
      // bsAssignMeal keeps the whole tail as the title (e.g. "Chicken bowl · 420
      // kcal"); the sheet renders u.kcal separately, so strip a trailing kcal
      // from the title to avoid showing the number twice.
      // A kcal-only title (a block with no dish name) strips to empty — leave it
      // empty rather than falling back to the raw text, which would show the kcal
      // twice (kcal renders from u.kcal).
      const title = clean(m.title).replace(/\s*[·,]?\s*\d{2,4}\s*kcal\s*$/i, '').trim();
      return {
        label: m.slot,
        title,
        // bsAssignMeal reports 0 for "no kcal stated"; an absent number must
        // render as nothing, never as a real-looking 0.
        kcal: m.kcal > 0 ? m.kcal : null,
      };
    }).filter(Boolean);
    return {
      kind: units.length ? 'menu' : null,
      weeks,
      sessionsPerWeek: null,
      units,
      free: units.slice(0, BS_PREVIEW_FREE_UNITS),
      locked: Math.max(0, units.length - BS_PREVIEW_FREE_UNITS),
      note,
      media,
    };
  }

  const units = texts.map((t) => {
    const e = bsAssignExercise(t);
    if (!e || !e.name) return null;
    const scheme = (e.sets && e.reps) ? `${e.sets}×${e.reps}` : '';
    return { label: '', title: clean(e.name), scheme, load: clean(e.load) };
  }).filter(Boolean);

  return {
    kind: units.length ? 'session' : null,
    weeks,
    sessionsPerWeek: null,
    units,
    free: units.slice(0, BS_PREVIEW_FREE_UNITS),
    locked: Math.max(0, units.length - BS_PREVIEW_FREE_UNITS),
    note,
    media,
  };
}
