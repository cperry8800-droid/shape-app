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

import { bsAssignDayLine, bsAssignExercise, bsAssignMeal, bsAssignWeekLine, bsWeekUnits, bsWeekSpan, bsPlanWeek } from './planOutline.mjs';

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

// One meal block → one preview unit. Extracted so the per-day and legacy menu
// paths cannot drift on how a meal is titled or how an absent kcal renders.
//
// bsAssignMeal keeps the whole tail as the title (e.g. "Chicken bowl · 420
// kcal"); the sheet renders u.kcal separately, so strip a trailing kcal from the
// title to avoid showing the number twice. A kcal-only title (a block with no
// dish name) strips to empty — leave it empty rather than falling back to the
// raw text, which would show the kcal twice.
// `~` is consumed with the number: the nutrition builder's own default outline
// writes "Breakfast · ~500 kcal", so stripping only the digits left a dangling
// "Breakfast · ~" on every generated paid meal plan. The separator goes with it
// for the same reason.
function mealUnit(t) {
  const m = bsAssignMeal(t);
  if (!m) return null;
  const title = clean(m.title).replace(/\s*[·,-]?\s*[~≈]?\s*\d{2,4}\s*kcal\s*$/i, '').trim();
  return {
    label: m.slot,
    title,
    // bsAssignMeal reports 0 for "no kcal stated"; an absent number must render
    // as nothing, never as a real-looking 0.
    kcal: m.kcal > 0 ? m.kcal : null,
  };
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

  // C1a — the per-day week has to be resolved BEFORE the empty check, or a
  // per-day plan whose DEFAULT menu is empty (every day authored individually,
  // nothing left in `detail.blocks`) returns the empty model and previews as
  // nothing. That is the same "paid preview renders nothing" failure the per-day
  // contract exists to prevent, in a narrower form — an empty `blocks` is no
  // longer the same thing as an empty plan.
  const week = bsPlanWeek(detail);
  const perDayHasContent = week.perDay
    && week.days.some((d) => (d.blocks || []).some((b) => blockText(b)));

  const empty = { kind: null, weeks, sessionsPerWeek: null, units: [], free: [], locked: 0, note, media };
  if (!texts.length && !(isNutri && perDayHasContent)) return empty;

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

  // A WEEK-BLOCK outline — "Week 1 — Accumulation" … "Week 6 — Retest". Both
  // builders emit exactly this for their multi-week products (the trainer's
  // paid `plan` and the nutritionist's `program`), and none of those lines is a
  // weekday, so without this they fell through to the exercise parser: a
  // six-week program was labelled "Single session" and its WEEKS were listed as
  // moves. Checked before the exercise fallback for that reason.
  // ONE grammar, shared with the delivery path (bsAssignWeekLine) — a local copy
  // here could drift and make the preview promise a shape Assign doesn't build.
  const weekLines = texts.map(bsAssignWeekLine);
  if (weekLines.filter(Boolean).length >= 2) {
    // Same dedupe + ordering the delivery applies (bsWeekUnits), so a duplicated
    // or out-of-order week line can't make this list a different set — including
    // a different `locked` count on paid content — than Assign actually builds.
    const wu = bsWeekUnits(weekLines);
    const maxWeek = bsWeekSpan(wu);
    const units = wu.map((w) => ({ label: `WEEK ${w.week}`, title: clean(w.title) }));
    return {
      kind: 'block',
      // The outline STATES its own week numbers, so the highest one is stated
      // information — not a guess from the block count (which is what the
      // no-fabrication rule forbids, and which would be wrong here anyway:
      // the nutrition program outline carries a trailing non-week block).
      weeks: weeks || (maxWeek > 0 ? maxWeek : null),
      sessionsPerWeek: null,
      units,
      free: units.slice(0, BS_PREVIEW_FREE_UNITS),
      locked: Math.max(0, units.length - BS_PREVIEW_FREE_UNITS),
      note,
      media,
    };
  }

  if (isNutri) {
    // C1a — a per-day menu previews as BOTH structure and content (§5.4 of the
    // per-day menu contract). The seven day labels are the table of contents AND
    // the differentiator the buyer is paying for, so they are FREE — withholding
    // them would hide the product's value from the person deciding whether to
    // buy. The meals stay on the existing paid allowance.
    //
    // `week` is resolved above (before the empty check) through the SAME
    // bsPlanWeek the Assign flow delivers from, so the week shown here is the
    // week that gets installed.
    if (week.perDay) {
      const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const perDayMeals = week.days.map((d) => (d.blocks || [])
        .map(blockText).filter(Boolean).map(mealUnit).filter(Boolean));
      // `units` stays the WHOLE plan, as it is on every other kind — the sheet
      // renders `units.length` as the product's Meals count, so sampling it
      // would tell a buyer a three-meal plan has two.
      const units = perDayMeals.flat();
      // The FREE rows come from the first day that has meals, so what a buyer
      // reads is a real day rather than an interleaving of seven.
      const sample = perDayMeals.find((list) => list.length) || [];
      const free = sample.slice(0, BS_PREVIEW_FREE_UNITS);
      return {
        kind: units.length ? 'menu' : null,
        perDay: true,
        // Structure: free. Counts only — a locked meal's text never renders.
        days: week.days.map((d, i) => ({ label: DAY_LABELS[i], count: perDayMeals[i].length })),
        weeks,
        sessionsPerWeek: null,
        units,
        free,
        // Derived from what was ACTUALLY shown, never from the constant: when
        // the sampled day holds fewer meals than the allowance (a light
        // Monday), `free.length < BS_PREVIEW_FREE_UNITS`, and subtracting the
        // constant would leave meals counted in neither the free rows nor the
        // locked total — paid content invisible on both sides of the paywall.
        locked: Math.max(0, units.length - free.length),
        note,
        media,
      };
    }
    const units = texts.map(mealUnit).filter(Boolean);
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
