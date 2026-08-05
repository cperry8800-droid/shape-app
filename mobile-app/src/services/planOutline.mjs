// Plan-outline parsers — shared by the coach Assign flow (iosAppBroadsheetPros)
// and the client Start-this-plan flow (a purchased plan → self-authored rows).
// Coach plans (coach_plans) store free-text outline blocks; these map them onto
// the shapes the client app consumes — client_workouts exercises (Train deck)
// and client_meal_plans days (Eat menu). Extracted verbatim so both callers
// share one implementation.

export const BS_ASSIGN_DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function bsAssignSplitBlock(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[—–:]\s*(.+)$/);
  return { head: (m ? m[1] : s).trim(), tail: m ? m[2].trim() : '' };
}

// "Secondary compound · 4×8" / "Back squat — 4 × 6 · RPE 8" → exercise row.
export function bsAssignExercise(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  let { head, tail } = p;
  if (!tail) {
    const dot = head.split(/\s*·\s*/);
    if (dot.length > 1 && /\d/.test(dot.slice(1).join(''))) { head = dot[0].trim(); tail = dot.slice(1).join(' · '); }
  }
  const sx = tail.match(/(\d+)\s*[×x]\s*([\d–-]+)/);
  return {
    name: head,
    sets: sx ? sx[1] : '',
    reps: sx ? sx[2] : '',
    rest: '',
    load: sx ? tail.replace(sx[0], '').replace(/^[\s·,]+|[\s·,]+$/g, '') : tail,
  };
}

// "Week 3 — Intensification" → { week: 3, title: 'Intensification' }; null when
// the line is not a week label.
//
// This is NOT malformed input. The trainer's paid `plan` builder and the
// nutritionist's `program` builder both emit exactly this shape, and both label
// the field "Weeks" in the editor — a week-block outline is a first-class way to
// author a multi-week product. A week label states HOW HARD over time; it is not
// a movement, which is why it must never reach bsAssignExercise (that produced
// an exercise literally named "Week 3" carrying a LOAD of "Intensification").
//
// ONE grammar, deliberately: planPreview.mjs imports this, so the Listing
// preview can never classify a plan differently from how Assign /
// Start-this-plan actually deliver it.
export function bsAssignWeekLine(text) {
  const m = /^\s*week\s*(\d{1,2})\b[\s.:—–-]*(.*)$/i.exec(String(text || ''));
  if (!m) return null;
  const week = Number(m[1]);
  if (!Number.isFinite(week) || week < 1 || week > 52) return null;
  return { week, title: String(m[2] || '').trim() };
}

// The ONE aggregation over week lines: dedupe by week number (the first stated
// title wins), ordered ascending. Sharing the GRAMMAR was not enough — the
// preview, the coach Assign page and the client start sheet each re-derived this
// independently, and the preview's copy had neither the dedupe nor the sort, so a
// duplicated or out-of-order "Week N" line previewed a different set than the
// delivery built. That is the exact preview/delivery mismatch this file exists to
// prevent, so the aggregation is shared too.
export function bsWeekUnits(lines) {
  const seen = new Set();
  const out = [];
  for (const w of (Array.isArray(lines) ? lines : [])) {
    if (!w || seen.has(w.week)) continue;
    seen.add(w.week);
    out.push(w);
  }
  return out.sort((a, b) => a.week - b.week);
}

// A block's DURATION is the highest week it STATES, not how many labels it
// carries: "Week 1 — Base" + "Week 6 — Peak" is a six-week plan with two authored
// weeks. Counting labels would report 2 while the schedule runs to week 6 and the
// Listing preview (which reads the max) says 6 — three numbers, one plan.
export const bsWeekSpan = (units) => (units.length ? units[units.length - 1].week : 0);

// "Mon — Upper (push)" → { dow: 0, title, rest }; null when not a weekday line.
export function bsAssignDayLine(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  const dow = BS_ASSIGN_DOW.indexOf(p.head.slice(0, 3).toLowerCase());
  if (dow < 0) return null;
  return { dow, title: p.tail || p.head, rest: /rest/i.test(p.tail || p.head) };
}

// "Breakfast — Greek yogurt bowl · 420 kcal" → meal-plan meal entry.
export function bsAssignMeal(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  const lower = p.head.toLowerCase();
  const slot = ['breakfast', 'lunch', 'dinner', 'snack'].find(w => lower.startsWith(w));
  const kcal = ((p.tail || p.head).match(/(\d{2,4})\s*kcal/i) || [])[1];
  return { slot: (slot || 'meal').toUpperCase(), title: p.tail || p.head, kcal: kcal ? Number(kcal) : 0 };
}

// ── The AI draft contract ────────────────────────────────────────────────────
//
// The ✦ AI DRAFT button generates a STARTING TEMPLATE the coach then edits and
// personalises. It is not a finished plan, and nothing here is sent to a client
// without a human pressing publish.
//
// ⚠ THE REASON THIS LIVES IN THIS FILE, NEXT TO THE PARSERS.
// A draft block is not free text. Every line the editor publishes is later
// PARSED by the functions above to decide what the plan even IS — a weekday
// split (`bsAssignDayLine`), a multi-week arc (`bsAssignWeekLine`), a day's
// menu (`bsAssignMeal`) or a session (`bsAssignExercise`). A model that writes
// "Monday: upper body push" instead of "Mon — Upper (push)" produces a draft
// that publishes cleanly, looks right in the editor, and then MIS-ASSIGNS to
// the client, silently. So the generated outline is validated with the exact
// parsers that will later read it, and a draft that does not parse is refused.
//
// The template is therefore always the floor: no key, no network, a malformed
// response, or text that will not parse all degrade to precisely the outline
// that shipped before the model was wired in. The worst case is today.

// The six real builder modes. The route used to accept three
// (`workout | program | meal_plan`) and SILENTLY COERCE anything else to
// `workout`, so four of the six builder kinds asked for the wrong artifact —
// both nutritionist meal builders were literally requesting strength workouts,
// and `meal_plan`, the one nutrition mode the route implemented, was
// unreachable from any interface. `program` is genuinely overloaded: a trainer
// program is a weekly split, a nutrition program is a multi-week arc. They are
// separate modes because they parse differently.
export const BS_DRAFT_MODES = Object.freeze([
  'workout',
  'training_program',
  'training_plan',
  'meal_plan',
  'nutrition_program',
  'diet',
]);

const DRAFT_MODE_BY_KIND = Object.freeze({
  training: Object.freeze({ workout: 'workout', program: 'training_program', plan: 'training_plan' }),
  nutrition: Object.freeze({ mealplan: 'meal_plan', program: 'nutrition_program', diet: 'diet' }),
});

// (discipline, builder buildType) → wire mode. Returns null for an unknown
// pair rather than guessing: a wrong mode is worse than no generation, because
// it spends money to produce an artifact of the wrong kind.
export function bsDraftMode(discipline, buildType) {
  const table = DRAFT_MODE_BY_KIND[String(discipline || '').toLowerCase()];
  if (!table) return null;
  return table[String(buildType || '').toLowerCase()] || null;
}

// A draft arrives over the wire from a model. Treat every field as hostile:
// strip control characters (they can hide or reorder rendered text), collapse
// whitespace, and bound the length. Total by construction — a throwing getter
// or a Symbol must not take down the builder.
const DRAFT_LINE_MAX = 120;
function draftText(value) {
  let s;
  try {
    if (value == null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value !== 'string') return '';
    s = value;
  } catch { return ''; }
  return s
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DRAFT_LINE_MAX);
}

// `{ title, detail }` → one outline line in the grammar the parsers expect.
// The em dash is the separator `bsAssignSplitBlock` splits on, so `title`
// becomes the parsed HEAD (the weekday, the week number, the meal slot, the
// movement) and `detail` becomes the TAIL.
// ⚠ The try must wrap the property ACCESS, not just the coercion. A hostile
// payload can carry a throwing getter, and `block.title` throws before any
// value reaches draftText — which is exactly how the first version of this
// function failed its own totality test.
function draftProp(block, key) {
  try {
    return block == null ? '' : draftText(block[key]);
  } catch {
    return '';
  }
}

function draftLine(block) {
  const title = draftProp(block, 'title');
  const detail = draftProp(block, 'detail');
  if (title && detail) return `${title} — ${detail}`.slice(0, DRAFT_LINE_MAX);
  return title || detail || '';
}

// Per-mode acceptance. Each predicate is the SAME function that will read the
// line at assign time — not a re-implementation of its grammar, which is how
// the preview and the delivery drifted apart before this file existed.
//
// ⚠ `key` is the SECOND half of validation, and a per-line check alone is not
// enough without it. A draft that answers "Mon — Upper" seven times passes
// every line check and then stacks all seven sessions onto ONE calendar day:
// `bsAssignWeekLine` output is deduped downstream by `bsWeekUnits`, but the
// weekday path has no equivalent dedupe in `bsMaterializeOutline` or the Assign
// page. Where a repeat is meaningless, the draft is refused.
//
// Deliberately absent for `meal_plan`: a day legitimately repeats `Snack`, and
// for `workout`/`diet`, where repetition is the coach's business.

// ⚠ `fit` is the THIRD half: does the accepted draft honour what the coach
// actually chose? Per-line and per-key checks both pass on a two-meal, 900 kcal
// answer to "6 meals / 3000 kcal" — and that draft would then be used INSTEAD of
// a template that honours both chips exactly, so the AI path would silently undo
// the only two numbers on the screen the coach set by hand.
//
// It applies to `meal_plan` alone, and the reason is a rule worth keeping: only
// enforce a number the coach explicitly picked AND the deterministic fallback
// already honours. MEALS / DAY and DAILY CALORIES are both. The trainer
// templates are fixed lists that ignore their `duration` chip, so enforcing a
// week count there would refuse a good 10-week draft in favour of a 6-week
// template — stricter than the fallback, and worse for the coach.
const DRAFT_KCAL_TOLERANCE = 0.1;

function mealPlanFits(lines, expect) {
  const meals = Math.round(Number(expect.meals));
  if (Number.isFinite(meals) && meals > 0 && lines.length !== meals) return false;

  const target = Math.round(Number(expect.calories));
  if (Number.isFinite(target) && target > 0) {
    // `ok` already required a real figure on every line, so this sums the
    // draft's own stated calories, never a fabricated 0.
    const total = lines.reduce((acc, line) => acc + bsAssignMeal(line).kcal, 0);
    if (Math.abs(total - target) > target * DRAFT_KCAL_TOLERANCE) return false;
  }
  return true;
}

const DRAFT_MODE_RULES = Object.freeze({
  workout:           { min: 2, ok: (line) => { const x = bsAssignExercise(line); return !!(x && x.name); } },
  training_program:  { min: 3, ok: (line) => !!bsAssignDayLine(line), key: (line) => bsAssignDayLine(line).dow },
  training_plan:     { min: 2, ok: (line) => !!bsAssignWeekLine(line), key: (line) => bsAssignWeekLine(line).week },
  nutrition_program: { min: 2, ok: (line) => !!bsAssignWeekLine(line), key: (line) => bsAssignWeekLine(line).week },
  // A meal line must resolve to a REAL slot AND carry calories. `bsAssignMeal`
  // falls back to the slot 'MEAL' for anything it does not recognise, so
  // accepting its non-null return would accept every string — the check has to
  // be the slot itself. The kcal requirement is the same rule the route's
  // grammar already states ("MUST end with the calories"): a meal line with no
  // figure parses to `kcal: 0`, and a menu printing 0 kcal beside real food is
  // a worse starting template than the deterministic one.
  meal_plan: {
    min: 2,
    ok: (line) => { const m = bsAssignMeal(line); return !!(m && m.slot && m.slot !== 'MEAL' && m.kcal > 0); },
    fit: mealPlanFits,
  },
  // Diet is an options list with no downstream parse, so it carries no grammar
  // requirement — only that the lines are non-empty.
  diet:              { min: 2, ok: (line) => !!line },
});

// Map a model's `blocks` onto the editor's outline, or return null to mean
// "unusable — keep the template". Null is the honest answer, not an empty
// array: an empty outline would open the editor on a blank plan and read as a
// successful generation that produced nothing.
// `expect` carries the coach's own chosen numbers (see `fit` above). Omitting
// it keeps every pre-existing caller's behaviour unchanged.
export function bsDraftOutline(mode, blocks, expect) {
  // Own-property lookup, because this file promises totality: a `mode` of
  // 'constructor' or 'toString' resolves an inherited function, which is truthy
  // and has no `ok`, so a plain index would throw a TypeError out of a function
  // whose entire contract is to return null instead.
  const key = String(mode || '');
  const rule = Object.prototype.hasOwnProperty.call(DRAFT_MODE_RULES, key)
    ? DRAFT_MODE_RULES[key]
    : null;
  if (!rule) return null;
  if (!Array.isArray(blocks) || !blocks.length) return null;

  const lines = [];
  const seen = new Set();
  for (const block of blocks.slice(0, BS_DAY_BLOCK_MAX)) {
    const line = draftLine(block);
    // One unparseable line invalidates the whole draft rather than being
    // dropped. A partial outline is the dangerous shape: it looks authored,
    // and the coach has no way to see which day the model failed to write.
    if (!line || !rule.ok(line)) return null;
    if (rule.key) {
      const k = rule.key(line);
      if (seen.has(k)) return null;
      seen.add(k);
    }
    lines.push(line);
  }
  if (lines.length < rule.min) return null;

  if (rule.fit && expect) {
    // Fails CLOSED on a throw: an expectation we cannot evaluate degrades to
    // the template, which is this whole path's floor.
    let fits = false;
    try { fits = !!rule.fit(lines, expect); } catch { fits = false; }
    if (!fits) return null;
  }
  return lines;
}

// The ONE entry point the builders call. Returns `{ lines, name, note }` when
// the generated draft is usable, or null to mean "keep the template".
//
// name/note ride ALONG WITH the outline and are never taken on their own: a
// draft whose blocks were refused is a draft we did not accept, and stamping
// its title over the builder's template outline would advertise a generation
// that did not survive.
export function bsDraftFromResponse(mode, draft, expect) {
  const lines = bsDraftOutline(mode, draft && safeProp(draft, 'blocks'), expect);
  if (!lines) return null;

  const name = draftProp(draft, 'title');

  let note = '';
  const notes = safeProp(draft, 'coachNotes');
  if (Array.isArray(notes)) {
    note = notes
      .slice(0, 6)
      .map((n) => draftText(n))
      .filter(Boolean)
      .join('\n');
  }

  return { lines, name, note };
}

function safeProp(obj, key) {
  try {
    return obj == null ? undefined : obj[key];
  } catch {
    return undefined;
  }
}

// ── A day's meals, from the builder's own chips ──────────────────────────────
//
// ⚠ THE BUG THESE EXIST TO FIX. The nutritionist builder offers MEALS / DAY
// (3-6) and DAILY CALORIES (~1800-~3000) chips, and the outline template
// ignored BOTH: it always emitted five fixed lines summing to ~2150 kcal. A
// coach choosing 3000 kcal across 6 meals got 2150 across 5, with nothing
// saying so.
//
// Shared with the generate-plan route (which imports this module) so the
// server template and the builder template cannot describe different days.

// Only the four words `bsAssignMeal` recognises are used — anything else parses
// as the generic 'MEAL' slot and would be refused by bsDraftOutline.
export function bsMealSlots(n) {
  const count = Math.max(3, Math.min(Number(n) || 4, 6));
  switch (count) {
    case 3: return ['Breakfast', 'Lunch', 'Dinner'];
    case 5: return ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Snack'];
    case 6: return ['Breakfast', 'Snack', 'Lunch', 'Snack', 'Dinner', 'Snack'];
    default: return ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
  }
}

// Split a day's calories across those slots — main meals weighted heavier,
// rounded to 10, with the rounding remainder pushed onto dinner so the parts
// SUM EXACTLY to the target. A plan whose meals do not add up to the number
// printed on it is the quiet dishonesty this codebase treats as a bug.
export function bsMealCalories(total, slots) {
  const list = Array.isArray(slots) && slots.length ? slots : bsMealSlots(4);
  const target = Math.max(0, Math.round(Number(total) || 0));
  const weight = (s) => (s === 'Snack' ? 1 : 2.4);
  const sum = list.reduce((acc, s) => acc + weight(s), 0);
  const parts = list.map((s) => Math.round((target * weight(s)) / sum / 10) * 10);
  const drift = target - parts.reduce((a, b) => a + b, 0);
  const dinner = list.lastIndexOf('Dinner');
  parts[dinner >= 0 ? dinner : parts.length - 1] += drift;
  return parts;
}

// The default day menu in the grammar `bsAssignMeal` reads. Exported so the
// generate-plan route's fallback serves the same food as the builder's — a
// second copy had already appeared there, which is how these drift.
export const BS_MEAL_FOOD = Object.freeze({
  Breakfast: 'Greek yogurt bowl, oats, berries',
  Lunch: 'Chicken rice bowl, greens, olive oil',
  Dinner: 'Salmon or lean beef, potato, vegetables',
  Snack: 'Fruit, nuts or a protein shake',
});

export function bsMealPlanTemplate(mealsPerDay, calories) {
  const slots = bsMealSlots(mealsPerDay);
  const kcal = bsMealCalories(calories, slots);
  return slots.map((slot, i) => `${slot} — ${BS_MEAL_FOOD[slot]} · ${kcal[i]} kcal`);
}

// ── The per-day menu contract ────────────────────────────────────────────────
// docs/superpowers/specs/2026-07-26-per-day-menu-contract.md
//
// The single source of truth for "what does this plan serve on each day?".
// BSProAssignPage delivers from it and planPreview.mjs renders the buyer-facing
// paid preview from it, so a preview can never describe a week the delivery does
// not build — the same reason the parsers above are shared rather than copied.
//
// `detail.days` is ADDITIVE. `detail.blocks` stays and is the DEFAULT menu: a
// plan with no `days` key, or a `days` that omits a weekday, serves
// `detail.blocks` on those days. That is what keeps every already-published plan
// byte-identical with no backfill, and what keeps the paid preview from ever
// seeing an empty block list.

// `detail` comes off a PUBLIC-READ provider row, so a crafted plan can carry a
// huge array. Bound the scan the way planPreview.mjs already does.
const DAYS_SCAN = 7;
// The EDITOR enforces this same number at authoring time, with visible
// feedback. The reader's slice below is a backstop against data written by
// something other than our editor — it must never be the thing that decides a
// coach's 41st meal disappears, because silent truncation on the write path is
// how published-but-never-delivered paid content happens.
export const BS_DAY_BLOCK_MAX = 40;

// ⚠ DELIVERY DOES NOT TRUNCATE AN OVERRIDE — deliberately, and by this
// contract's own rule: *a display bound may truncate; a delivery bound may only
// ever truncate data that could not have been authored in good faith.*
//
// A 41st meal on a day CAN be authored in good faith — the editor produces one
// the moment a coach varies a legacy plan whose uncapped default already holds
// more than 40. An earlier revision capped each override at 40 here, which made
// that content vanish on assign; raising the cap to a floor of the default's
// length only moved the trap (trim the default afterwards and the day becomes
// unpublishable). Both were the same mistake the legacy `blocks` exemption
// above already rules out, so `days` now gets the same treatment as `blocks`:
// **delivery serves what was stored.**
//
// The economy bound lives where the exposure is — planPreview re-caps every
// resolved day at BS_DAY_BLOCK_MAX before scanning, and the preview is the only
// surface a crafted public-read row reaches unauthenticated. Assign is an
// authenticated coach acting on their own plan, and it has always delivered an
// unbounded `detail.blocks`.


// A dow is valid only as a real integer 0..6 (0 = MONDAY, matching
// BS_ASSIGN_DOW and bsRepeatSpec — NOT the reminders table's 0 = Sunday).
// Invalid/duplicate values are DROPPED, never clamped: clamping would silently
// move a coach's Thursday menu onto Sunday, whereas dropping falls back to that
// day's default menu, which is the honest degrade.
//
// Deliberately strict about type. `Number('1')` is 1, so a stringy dow off a
// jsonb column would coerce — but a value we cannot distinguish from a typo is
// not a day the coach chose, and this is the write path for PAID content.
function validDow(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6;
}

// Two block lists say the same thing when their DELIVERED text matches in
// order — trimmed, empties dropped — because that is exactly what the meal
// parse does on the way to the client (String(...).trim() + filter(Boolean)).
// Comparing raw strings made perDay disagree with delivery: an authored day
// differing from the fallback only by trailing whitespace or a stray empty
// block DELIVERS the identical menu, but a raw compare called it a per-day
// plan — "Menus vary by day" on a paid listing over seven identical menus,
// with every repeat counted as a locked meal. Equality here must use the same
// normalization delivery uses, or the claim and the product diverge.
// (Identity never matters either way: a per-day authoring UI naturally
// produces fresh objects for an unmodified day.)
// ⚠ The coercion is `raw || ''`, NOT `String(raw)`. Assign's mealsFrom reduces
// each block with `String(((b && b.text != null) ? b.text : b) || '').trim()`
// and skips the empties, so a `false`, a `0` or a `NaN` in a blocks array
// delivers NOTHING. Coercing with plain String() turns those into the non-empty
// texts "false" and "0", and a default ['Breakfast'] against an override
// ['Breakfast', false] would then compare as DIFFERENT while delivering the
// identical menu — "menus vary by day" on a paid listing, with a phantom meal
// inflating the weekly count. Same rule as ever, one level deeper: the claim
// must be computed with the same semantics as the thing it claims about,
// including the coercion.
function deliveredTexts(list, cap) {
  const out = [];
  for (const b of (Array.isArray(list) ? list.slice(0, cap) : [])) {
    const raw = (b && b.text != null) ? b.text : b;
    const t = String(raw || '').trim();
    if (t) out.push(t);
  }
  return out;
}
// ⚠ The COMPARISON is bounded even though delivery is not, and the two are not
// in tension: `perDay` is consumed by exactly one thing — the marketplace
// preview's "Menus vary by day" claim — while delivery reads `days`. Leaving
// this unbounded meant a crafted public-read row could make the PUBLIC listing
// normalize every attacker-supplied block, because bsPlanPreview calls this
// function before applying its own 40/day cap; the cap then only governed the
// later rendering pass.
//
// Bounding at BS_DAY_BLOCK_MAX keeps the claim honest rather than approximate:
// the preview shows at most that many meals per day, so a difference that
// appears only past the bound is one no buyer could see before paying, and
// counting it would advertise variation they cannot verify. Same rule as the
// rest of this file — the claim is computed with the same semantics as the
// thing it claims about, and here that thing is the preview.
function sameBlocks(a, b) {
  if (a === b) return true;
  const ta = deliveredTexts(a, BS_DAY_BLOCK_MAX);
  const tb = deliveredTexts(b, BS_DAY_BLOCK_MAX);
  if (ta.length !== tb.length) return false;
  for (let i = 0; i < ta.length; i += 1) if (ta[i] !== tb[i]) return false;
  return true;
}

// → { perDay: boolean, days: [{ dow, blocks }] } — ALWAYS seven entries, dow 0..6
// ascending, each carrying the blocks that day actually serves.
//
// `perDay` is true only when at least one day's blocks DIFFER from the default.
// A `days` array that is present but says the same thing everywhere is not a
// per-day plan and must not be sold as one — §5.3 of the contract.
export function bsPlanWeek(detail) {
  const d = (detail && typeof detail === 'object' && !Array.isArray(detail)) ? detail : {};
  // ⚠ The FALLBACK is deliberately UNCAPPED. Legacy Assign delivered every
  // block in detail.blocks with no limit, and the contract promises a plan with
  // no `days` key behaves byte-identically — capping here would silently drop
  // meals from an already-SOLD plan on delivery. Truncation in the preview is
  // cosmetic; truncation in delivery is taking content someone paid for. The
  // bounds below apply only to `days` entries, which are NEW data with no
  // legacy expectations (and the attack surface, since a legacy row can't
  // carry them).
  const fallback = Array.isArray(d.blocks) ? d.blocks : [];

  const byDow = new Map();
  if (Array.isArray(d.days)) {
    for (const entry of d.days.slice(0, DAYS_SCAN)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (!validDow(entry.dow)) continue;
      if (byDow.has(entry.dow)) continue;          // first authored entry wins
      if (!Array.isArray(entry.blocks)) continue;  // a day with no list inherits
      byDow.set(entry.dow, entry.blocks);
    }
  }

  const days = [];
  for (let dow = 0; dow < 7; dow += 1) {
    days.push({ dow, blocks: byDow.get(dow) || fallback });
  }
  // perDay is a claim about what is DELIVERED, so it is computed from the
  // resolved week, not from how the week was authored: seven authored days that
  // all say the same thing are one menu, even when that menu differs from a
  // detail.blocks nobody will ever be served. Selling that as "per-day" would
  // advertise variation that does not exist.
  let perDay = false;
  for (let i = 1; i < 7 && !perDay; i += 1) {
    if (!sameBlocks(days[i].blocks, days[0].blocks)) perDay = true;
  }
  return { perDay, days };
}

// The WRITER's half of the same contract, deliberately in this file: whatever
// canonicalizes `days` on publish has to agree with bsPlanWeek above, and two
// modules is how they stop agreeing. The editor calls this; bsPlanWeek reads
// what it produces.
//
// Order of operations matters and is not interchangeable: **dedupe FIRST, in
// the caller's original order (first entry wins), THEN sort by dow.** The reader
// resolves duplicates first-wins over the stored order, so deduping last-wins —
// or sorting before deduping, which lets a stable sort reorder equal dows —
// could store a different winner than every read of it resolves. The stored data
// would then disagree with the only function that interprets it.
//
// Invalid entries are DROPPED, not repaired, matching the reader: a day we can't
// place is a day that inherits the default menu, which is the honest degrade.
// Nothing here truncates — the block bound is enforced at authoring where the
// coach can see it happen.
export function bsCanonicalDays(days) {
  const seen = new Set();
  const out = [];
  // ⚠ The SAME raw slice the reader applies. bsPlanWeek takes the first
  // DAYS_SCAN entries and validates them afterwards, so a scan over the whole
  // array here would disagree with it: for 7 junk entries followed by a real
  // Thursday, canonicalizing would PROMOTE Thursday into the first seven and
  // change the menu that day serves. Writer and reader must consider the same
  // entries, or canonicalization stops being lossless.
  for (const entry of (Array.isArray(days) ? days : []).slice(0, DAYS_SCAN)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (!validDow(entry.dow)) continue;
    if (!Array.isArray(entry.blocks)) continue;
    if (seen.has(entry.dow)) continue;
    seen.add(entry.dow);
    out.push({ dow: entry.dow, blocks: entry.blocks });
  }
  return out.sort((a, b) => a.dow - b.dow);
}

export function bsAssignIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── The week-shaped publish boundary's caller-side helpers ───────────────────
// SPEC-guardrails.md §9.4. Training reaches a client through ONE gated,
// week-shaped writer, so the caller has to answer two questions before it can
// send anything: which WEEK does this session fall in, and what KEY identifies
// this publish. Both are pure, so both are tested rather than trusted.

/**
 * Monday of the calendar week containing `d`, as a new Date.
 *
 * The boundary evaluates and writes a week atomically, so a session can only
 * ride the week it actually falls in — grouping is by the session's OWN Monday,
 * never by the week the coach happened to start from.
 */
export function bsAssignMonday(d) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/**
 * A DETERMINISTIC, UUID-shaped publish key derived from the assignment itself.
 *
 * §9.4 requires the key to be minted at AUTHORING time and to stay stable
 * across retries. "Stable" has to survive more than a re-render: a coach who
 * loses signal mid-publish may kill the app and come back, and a key held only
 * in memory (or in storage that failed to write) is gone by then — the retry
 * would mint a second key and the boundary would read it as a second publish.
 *
 * Deriving the key from the assignment's own content gives that statelessly.
 * The same coach, plan, client, start and week always produce the same key, so
 * a retry is a REPLAY (the boundary answers `already_delivered`) rather than a
 * duplicate. It is also what makes the acknowledge-and-republish path safe:
 * re-running a whole assignment after a guardrail rejection re-sends the weeks
 * that already landed under their original keys, and they no-op.
 *
 * ⚠ This is a CONTENT hash, not a random id. Changing any part of the seed is
 * MEANT to mint a new key — that is a different assignment, not a retry.
 *
 * @param {string} seed the assignment's identity, caller-composed
 * @returns {string} a v4-shaped UUID (the boundary rejects any other shape)
 */
/**
 * The assignment identity `bsAssignKey` hashes — composed HERE, not at the page.
 *
 * ⚠ IT SEEDS ON THE BLOCK OBJECTS, NOT THEIR TEXT, AND THAT IS THE WHOLE POINT.
 *
 * The Assign page holds two index-aligned lists: `blocks` (text only) and the
 * raw block OBJECTS, which are the only place the authored planned-load pair
 * (`plannedMinutes` / `plannedRpe`) lives. Seeding on the text alone let two
 * GENUINELY DIFFERENT assignments compose the same seed: edit a catalogue plan's
 * planned minutes or RPE without touching a word of the block text and the seed
 * came out byte-identical. The publish route's ledger short-circuit then answers
 * `already_delivered` from the FIRST publish, so the new load is never written
 * and never judged — and the pair is precisely what §3.2a evaluates, which makes
 * that the guardrail switching itself off on the coach's most ordinary action.
 *
 * Serialising the whole block rather than enumerating the fields that matter is
 * deliberate: the next authored field is covered without anyone remembering this
 * function. Key-order churn in stored JSON can only OVER-mint (one extra publish
 * of identical content) — the safe direction. Under-minting is what loses work.
 *
 * The NAME is seeded separately from the id for the same reason. `planKey`
 * prefers `plan.id`, which is exactly what a rename PRESERVES — but the name is
 * published: it is the session title outright in the exercise-shaped branch, and
 * the description fallback in the others. So renaming a catalogue plan through
 * `PATCH /api/coach/plans` and re-assigning it composed the old seed, and the
 * client went on reading the old title. One field further out, same failure:
 * authored content that reaches the published rows but not the key.
 *
 * NUL joins the parts because it cannot occur inside any of them; a printable
 * separator lets two different assignments compose the same seed.
 *
 * @param {{clientId: string, planKey: string, planName: string, blocks: Array,
 *          note: string, startISO: string, weeks: number|string,
 *          time: string}} parts
 * @returns {string} the seed to hand `bsAssignKey`
 */
export function bsAssignSeed(parts) {
  const p = (parts && typeof parts === 'object') ? parts : {};
  const list = Array.isArray(p.blocks) ? p.blocks : [];
  const blockSeed = list.map((b) => {
    // A stored block came from JSON so it cannot be circular, but a throw here
    // would take down the coach's whole assign — degrade to the text rather
    // than crash the action.
    try { return JSON.stringify(b); } catch (e) { return String((b && b.text) || b || ''); }
  }).join('|');
  return [p.clientId, p.planKey, p.planName, blockSeed, p.note, p.startISO, p.weeks, p.time].join('\u0000');
}

export function bsAssignKey(seed) {
  // Four independently-salted FNV-1a passes → 128 bits. One pass gives 32,
  // which collides far too readily across a coach's catalogue.
  const pass = (salt) => {
    const s = `${salt} ${seed}`;
    let x = 0x811c9dc5 ^ salt;
    for (let i = 0; i < s.length; i += 1) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return (x >>> 0).toString(16).padStart(8, '0');
  };
  const hex = `${pass(1)}${pass(2)}${pass(3)}${pass(4)}`;
  const variant = '89ab'[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Group authored sessions into the WEEK payloads the gated boundary accepts.
 *
 * Kept pure and separate from the page because the two rules it encodes are
 * the ones that fail silently, and both are load-bearing:
 *
 *  GROUPING — a session rides the week it actually falls in, by its OWN Monday.
 *  The boundary evaluates and writes a week atomically, so a session grouped
 *  into the wrong week is judged against the wrong week's load and, worse,
 *  lands in a replace that deletes a week it was never part of.
 *
 *  STAMPING — `per_session` is declared only when EVERY session in that week
 *  carries BOTH halves of the planned-load pair (§3.2a). A PARTIAL stamp is
 *  malformed (§13.17/F158), and one malformed row turns the whole evaluation
 *  `unknown` — which never blocks. So a half-captured week must publish
 *  UNSTAMPED (`incomplete_week`) rather than look like a transport bug: the
 *  first is a coach who skipped a field, the second is an alarm.
 *
 * Session ids are deliberately NOT set. The boundary synthesizes positional
 * labels and excludes them from the request digest, so a re-ordered retry still
 * hashes to the same week; an index-derived id here would read as a CONFLICT.
 *
 * @param {Array<{date: Date, title: string, description: string,
 *                block: object|null, exercises?: Array}>} rows
 * @param {object} [basePayload] fields merged into every session's payload
 * @returns {Array<{weekStartISO: string, capture: 'per_session'|undefined,
 *                  sessions: Array}>} ordered by week, one publish each
 */
export function bsAssignWeeks(rows, basePayload = {}) {
  const byWeek = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !(r.date instanceof Date) || Number.isNaN(r.date.getTime())) continue;
    const k = bsAssignIso(bsAssignMonday(r.date));
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(r);
  }

  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStartISO, wk]) => {
      // Read the pair off the block the COACH stamped it on. A non-finite
      // value is absence, not zero — `Number(null)` is a finite 0 and would
      // fabricate a session that was never captured.
      const pairs = wk.map((r) => ({
        min: r.block && Number.isFinite(r.block.plannedMinutes) ? r.block.plannedMinutes : undefined,
        rpe: r.block && Number.isFinite(r.block.plannedRpe) ? r.block.plannedRpe : undefined,
      }));
      const stamped = pairs.every((p) => p.min !== undefined && p.rpe !== undefined);

      return {
        weekStartISO,
        capture: stamped ? 'per_session' : undefined,
        sessions: wk.map((r, i) => ({
          title: r.title,
          description: r.description,
          kind: 'custom',
          scheduledDate: bsAssignIso(r.date),
          ...(stamped ? { plannedMinutes: pairs[i].min, plannedRpe: pairs[i].rpe, loadCapture: 'per_session' } : {}),
          // Authored content wins: spread the caller's base FIRST so an
          // `exercises` key in it can never overwrite the coach's own list.
          payload: { ...basePayload, exercises: r.exercises || [] },
        })),
      };
    });
}

// Materialize a purchased plan's outline into self-authored client_workouts
// insert-payloads. Mirrors BSProAssignPage.apply's split-vs-exercise branch,
// but returns payloads (stamped payload.program:{id:'plan:'+planId, …}) instead
// of writing — the client's Start-this-plan flow inserts them as self rows.
//
//   plan     — { id, name, detail:{ blocks:[{text}|string], note } }
//   startISO — 'YYYY-MM-DD' the block begins on
//   weeks    — how many weeks to repeat
//   runId    — the materialization run stamp (for atomic re-start)
export function bsMaterializeOutline({ plan, startISO, weeks = 4, runId }) {
  if (!plan) return [];
  const id = `plan:${plan.id}`;
  const name = plan.name || 'Plan';
  const [sy, sm, sd] = String(startISO).split('-').map(Number);
  const start = new Date(sy, (sm || 1) - 1, sd || 1); // local midnight
  const monday = new Date(start); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const planNote = (plan.detail && plan.detail.note) || '';
  const blocks = (plan.detail && Array.isArray(plan.detail.blocks) ? plan.detail.blocks : [])
    .map(b => (b && b.text != null) ? b.text : b).map(s => String(s || '').trim()).filter(Boolean);
  const dayLines = blocks.map(bsAssignDayLine);
  const weekLines = blocks.map(bsAssignWeekLine);
  // Precedence mirrors planPreview.mjs EXACTLY (split → week block → session).
  // The two modules classify the same outline or the Listing preview would
  // promise something the delivery doesn't build.
  const isSplit = dayLines.filter(Boolean).length >= 3;
  const isWeekBlock = !isSplit && weekLines.filter(Boolean).length >= 2;
  // Stated phase per week ("Week 3 — Intensification" → phases[3]). Carried, not
  // dropped: the split branch used to skip every non-weekday line, so a phase the
  // coach deliberately wrote just vanished.
  const phases = {};
  for (const w of weekLines) if (w && w.title && phases[w.week] == null) phases[w.week] = w.title;
  const nWeeks = Math.max(1, Math.min(26, Math.round(Number(weeks) || 1)));
  const rows = [];
  const stamp = (week, day) => {
    const s = { id, name, week, day, weeks: nWeeks, runId: runId || '' };
    if (phases[week]) s.phase = phases[week];
    return s;
  };

  if (isWeekBlock) {
    // A week block's length is STATED by the outline itself, so it drives the
    // schedule — the caller's `weeks` means "repeat the weekly thing N times",
    // which is not what a week block does. Deduped and ordered by the coach's
    // own week numbers; a non-week block (the nutrition builder emits a trailing
    // "Grocery + prep guide") is not a week and is not scheduled as one.
    const units = bsWeekUnits(weekLines);
    const span = bsWeekSpan(units);
    for (const u of units) {
      const d = new Date(start);
      d.setDate(d.getDate() + (u.week - 1) * 7);
      const dow = (d.getDay() + 6) % 7;
      rows.push({
        title: u.title || `${name} · Week ${u.week}`,
        description: planNote || name,
        scheduledDate: bsAssignIso(d),
        // Deliberately NO exercises: the coach stated a phase, not movements.
        // An empty session is the honest render of what they wrote — inventing
        // moves from a week label is exactly the old bug.
        payload: {
          exercises: [],
          program: { id, name, week: u.week, day: dow, weeks: span, runId: runId || '', ...(u.title ? { phase: u.title } : {}) },
        },
      });
    }
    return rows;
  }

  if (isSplit) {
    for (let w = 0; w < nWeeks; w++) {
      for (const dl of dayLines) {
        if (!dl || dl.rest) continue;
        const d = new Date(monday); d.setDate(d.getDate() + w * 7 + dl.dow);
        if (d < start) continue;
        rows.push({
          title: dl.title,
          description: planNote || name,
          scheduledDate: bsAssignIso(d),
          payload: { exercises: [], program: stamp(w + 1, dl.dow) },
        });
      }
    }
  } else {
    // A week label is never a movement — drop it here too, so a mixed outline
    // (one phase line + real exercises) can't smuggle "Week 1" in as a lift.
    const exercises = blocks.filter((_, i) => !weekLines[i]).map(bsAssignExercise).filter(Boolean)
      .map(e => ({ name: e.name, sets: e.sets, reps: e.reps, load: e.load, seg: '' }));
    for (let w = 0; w < nWeeks; w++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7);
      const dow = (d.getDay() + 6) % 7;
      rows.push({
        title: name,
        description: planNote,
        scheduledDate: bsAssignIso(d),
        payload: { exercises, program: stamp(w + 1, dow) },
      });
    }
  }
  return rows;
}

// ── Deploy 2b: the planned-load pair ────────────────────────────────────────
//
// SPEC-guardrails.md §3.2a; the capture design §2 and §6.
//
// ⚠ THESE ARE ENUM MAPPINGS, NOT PARSES. The builder renders LENGTH and EFFORT
// through the same closed `chips()` helper as FOCUS and EQUIPMENT — pickers
// whose values happen to be strings. So the mapping is over EXACT MATCHES
// against those known values, and anything else is ABSENT.
//
// The rule, stated so it survives a later writer who is less disciplined:
//
//   * A range ('45-60 minutes'), prose, an empty string, or a value from a
//     different builder is ABSENT. NEVER resolve a range by picking an end — a
//     45-vs-60 resolution is a 33% swing in that session's load, silently, in
//     the direction that LOOSENS ceilings.
//   * A failed mapping yields ABSENT, **never 0**. A zero-minute session scores
//     as zero load and reads as a rest day the coach never wrote.
//
// Absent is safe here because the core knows what to do with it: an unstamped
// week is `incomplete_week`, and a stamped week whose pair is missing is
// `malformed_week`. Neither is a fabricated number.

/** The LENGTH chip's closed list. KEEP IN SYNC with the `chips()` call. */
export const BS_LENGTH_CHIPS = Object.freeze({ '30 min': 30, '45 min': 45, '60 min': 60, '75 min': 75 });

/** The EFFORT chip's closed list. KEEP IN SYNC with the `chips()` call. */
export const BS_EFFORT_CHIPS = Object.freeze({ 'RPE 6': 6, 'RPE 7': 7, 'RPE 8': 8, 'RPE 9': 9 });

// `hasOwnProperty` rather than a bare lookup: `CHIPS['toString']` would
// otherwise return a function off the prototype chain.
const mapChip = (table, v) => (
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v) ? table[v] : undefined
);

/** @returns {number|undefined} minutes, or ABSENT */
export function bsPlannedMinutes(chipValue) { return mapChip(BS_LENGTH_CHIPS, chipValue); }

/** @returns {number|undefined} RPE, or ABSENT */
export function bsPlannedRpe(chipValue) { return mapChip(BS_EFFORT_CHIPS, chipValue); }

/**
 * Does this outline block represent a SESSION (rather than an exercise)?
 *
 * The capture design §6's table, read through THIS module's own classifiers and
 * never re-derived — three surfaces already classify through planOutline, and a
 * fourth opinion is how they start disagreeing:
 *
 *   split day line (non-rest) -> one session per day line per week
 *   week block line           -> one session per authored week
 *   anything else             -> an EXERCISE; the session is the whole week
 *
 * A rest day is not a session: there is nothing scheduled to capture a length
 * or an effort for.
 */
export function bsBlockIsSession(text) {
  const day = bsAssignDayLine(text);
  if (day) return !day.rest;
  return !!bsAssignWeekLine(text);
}
