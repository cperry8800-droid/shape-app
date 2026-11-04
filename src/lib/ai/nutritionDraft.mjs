// Nora drafts a nutritionist's PROGRAM or DIET, the two kinds the app's Plans page keeps beside meal
// plans (owner, 2026-11-04: "Nora can't create a nutritionist's 'program' or 'diet' yet, only meal
// plans … can you fix these and make them possible?"). PURE: no I/O, no clock.
//
//   program  a multi-week arc, a line a week ("Week 1 — Reset & habits"): what to work on, no meals.
//   diet     options for each meal and the foods to favour and avoid ("Breakfast options — Oats, …").
//
// ⚠ THE DRAFT IS THE PLAN BUILDER'S OWN. The action asks POST /api/ai/generate-plan, the generator the
// app's ✦ AI draft uses (its prompt, its block grammar, its template when there is no model), and this
// file reads the answer with the parsers the app reads it with (planOutline.mjs bsDraftFromResponse).
// An answer that does not parse is the app's own starting template, said so on the card. Nora never
// writes a line of it herself.
//
// It is saved as the app's own document (coach_plans kind 'meal_plan', detail.buildType 'program' or
// 'diet', the shape BSNutriPlans publishes), unpublished, so it opens in the app's editor.

import { bsDraftFromResponse, bsAssignWeekLine, bsWeekUnits, bsWeekSpan } from '../../../public/newdesign/planOutline.mjs';
import { clipText } from './workoutDraft.mjs';

export const NUTRITION_DRAFT_KINDS = ['program', 'diet'];
const MODE = { program: 'nutrition_program', diet: 'diet' };
// The app builder's chips (BSNutriPlans): what its editor and its meta line read back.
export const GOALS = ['Cut', 'Maintain', 'Lean bulk', 'Performance'];
export const DIETS = ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian'];
// The app's starting outlines (BSNutriPlans generateOnce), for an answer that does not parse.
export const TEMPLATE_LINES = {
  program: ['Week 1 — Reset & habits', 'Week 2 — Build routine', 'Week 3 — Dial macros', 'Week 4 — Lock it in', 'Grocery + prep guide'],
  diet: ['Breakfast options', 'Lunch options', 'Dinner options', 'Snacks', 'Foods to favour', 'Foods to avoid'],
};
export const NUTRITION_TEMPLATE_NOTICE = "Template — the plan builder's starting outline; AI drafting is unavailable right now.";

const pick = (value, list, words) => {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return null;
  const exact = list.find((x) => x.toLowerCase() === s);
  if (exact) return exact;
  for (const [re, out] of words) if (re.test(s)) return out;
  return null;
};
const GOAL_WORDS = [[/\bcut\b|fat loss|weight loss|\blos(e|ing)\b|deficit/, 'Cut'], [/bulk|\bbuild|\bgain|surplus|muscle/, 'Lean bulk'], [/perform|athlet|sport|endurance/, 'Performance'], [/maint|balanced/, 'Maintain']];
const DIET_WORDS = [[/vegan|plant/, 'Vegan'], [/vegetarian|veggie/, 'Vegetarian'], [/pesc/, 'Pescatarian'], [/omni|anything|everything/, 'Omnivore']];
const int = (v, lo, hi) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

/** The brief as Nora read it, reduced to what the builder can honour. `kind` null: she must ask. */
export function cleanNutritionBrief(input) {
  const i = input && typeof input === 'object' ? input : {};
  const kind = NUTRITION_DRAFT_KINDS.includes(i.kind) ? i.kind : null;
  const request = clipText(i.request, 400);
  return {
    kind,
    request,
    name: clipText(i.name, 80),
    // Read from the fields Nora filled, never guessed from the request's words ("build me a diet"
    // is not a bulk): one she left out is the builder's default, and the card shows it.
    goal: pick(i.goal, GOALS, GOAL_WORDS) || 'Maintain',
    diet: pick(i.diet, DIETS, DIET_WORDS) || 'Omnivore',
    // A program's length, as the app's builder offers it; a number out of range was misheard.
    weeks: kind === 'program' ? (int(i.weeks, 2, 12) || 4) : null,
    kcal: int(i.kcal, 1000, 6000),
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * The coach's words with the client's name taken out ("a reset for Priya" → "a reset for the
 * client"): the whole name, then each part of it, wherever it stands as a word (Codex on #2594).
 */
export function withoutClientName(text, clientName) {
  let out = String(text == null ? '' : text);
  const full = String(clientName == null ? '' : clientName).trim().replace(/\s+/g, ' ');
  if (!full) return out;
  const parts = [full, ...full.split(' ')].filter((w, i, a) => w.length >= 2 && a.indexOf(w) === i);
  for (const w of parts) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'giu'), 'the client');
  return out;
}

/** The body the plan builder's generator takes (the fields the app's ✦ AI draft sends). */
export function generatePlanBody(brief, { clientName = '' } = {}) {
  return {
    kind: MODE[brief.kind],
    goal: brief.goal,
    // No client's name goes to the model, as from the app's builder: not as `client`, and not in
    // the coach's own words either.
    client: '',
    level: brief.diet,
    duration: brief.kind === 'program' ? `${brief.weeks} weeks` : '7 days',
    calories: brief.kcal ? String(brief.kcal) : '',
    preferences: withoutClientName(brief.request, clientName),
    protein: '',
  };
}

// A program's length is the weeks its lines hold, not the weeks asked for: the generator may answer
// a four-week request with six (it says so in its own `duration`, Codex on #2594), and the starting
// template is four whatever was asked. Counted as the plan builder counts it (bsWeekSpan: the
// highest week a line states), so the card, the row and Assign tell one length.
const weeksIn = (lines) => bsWeekSpan(bsWeekUnits(lines.map((l) => bsAssignWeekLine(l))));

/** The generator's answer read the way the app reads it: { lines, name, note, source, weeks }. */
export function nutritionDraftFrom(brief, response) {
  const data = response && typeof response === 'object' ? response : {};
  const used = data.draft ? bsDraftFromResponse(MODE[brief.kind], data.draft, null) : null;
  const out = used
    ? { lines: used.lines, name: used.name || '', note: used.note || '', source: data.source === 'openai' ? 'ai' : 'template' }
    : { lines: TEMPLATE_LINES[brief.kind].slice(), name: '', note: '', source: 'template' };
  return { ...out, weeks: brief.kind === 'program' ? weeksIn(out.lines) : null };
}

const typeWord = (kind) => (kind === 'program' ? 'program' : 'diet');

/** The row saved to coach_plans: the app's own document for the kind, as BSNutriPlans writes it. */
export function nutritionPlanRow(brief, draft, planId) {
  const name = brief.name || clipText(draft.name, 80) || `${brief.goal} ${typeWord(brief.kind)}`;
  const facts = [typeWord(brief.kind)];
  if (brief.kind === 'program') facts.push(`${draft.weeks} weeks`);
  if (brief.kcal) facts.push(`${brief.kcal} kcal`);
  facts.push(brief.diet.toLowerCase());
  return {
    id: planId,
    kind: 'meal_plan',
    name,
    meta: facts.join(' · '),
    detail: {
      buildType: brief.kind,
      goal: brief.goal,
      diet: brief.diet,
      ...(brief.kcal ? { cals: `~${brief.kcal}` } : {}),
      blocks: draft.lines.map((text, i) => ({ id: `b${i}`, text })),
      note: draft.note || '',
      media: [],
    },
  };
}

/** The card: where the lines came from, the brief it honoured, then every line. */
export function nutritionDraftDiff(brief, draft) {
  const rows = [{
    label: 'Source',
    after: draft.source === 'ai'
      ? 'AI draft from the plan builder; edit it before anyone sees it'
      : NUTRITION_TEMPLATE_NOTICE,
  }];
  rows.push({ label: 'Goal', after: brief.goal });
  rows.push({ label: 'Diet', after: brief.diet });
  if (brief.kind === 'program') {
    rows.push({ label: 'Length', after: draft.weeks === brief.weeks ? `${draft.weeks} weeks` : `${draft.weeks} weeks (asked for ${brief.weeks})` });
  }
  if (brief.kcal) rows.push({ label: 'Calories', after: `${brief.kcal} kcal a day` });
  draft.lines.forEach((line) => rows.push({ label: '', after: line }));
  return rows;
}
