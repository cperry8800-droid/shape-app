// Member recipe import — text in, a STRUCTURED DRAFT out.
// Spec: docs/superpowers/specs/2026-09-10-third-party-recipe-import-design.md §5.
//
// POST { text } -> { draft: { title, servings, ingredients, steps }, model: true }
//              -> { draft: null, unavailable: true }   when no key is configured
//
// ⚠ THE DRAFT IS NEVER PERSISTED BY THIS ROUTE. It goes to a review screen and
// the member confirms or edits every line before anything is stored — the
// "labelled AI draft" the cookable contract's own header already anticipates.
//
// ⚠ AND `{ draft: null, unavailable: true }` IS THE HONEST FAILURE, never an
// empty draft: `{ingredients: [], steps: []}` is the positive claim "this recipe
// has no ingredients", which the review screen would render as a finding rather
// than as a failure. The client falls back to its own structural split.
//
// Lives under /api/nutrition (membership proxy gate) but does its OWN auth — the
// proxy deliberately fails open on faults, so like every sibling route the user
// is resolved before any provider call, and an unauthenticated request never
// burns provider quota.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { callAI, hasOpenAIKey, parseModelJson } from '@/lib/ai';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 12000;

// The model may not invent quantities, may not reword the method into a house
// voice, and may not emit step metadata. The last one is not cosmetic: `passive`
// + a station + a duration is how a step earns an interleave window on the prep
// board, and an imported recipe may never have one (cookOrchestrator's binding
// "no fabricated parallelism"). The wrapper drops it too — this is the belt.
const SYSTEM = [
  'You extract a recipe from pasted text into JSON. You are a parser, not an author.',
  'Rules, all binding:',
  '1. Carry the source\'s OWN words for each step. Do not reword, merge, summarise or add flourish.',
  '2. Never invent a quantity. If an ingredient states no amount, use "" for n.',
  '3. Never invent a step, an ingredient, a serving count or a title.',
  // ⚠ THE UNIT BELONGS IN `n`, WITH THE NUMBER. Measured on the catalog, 277 of
  // 334 amounts are written that way ("3/4 cup", "6 oz", "2 cloves"), and
  // bsScaleQty reads the unit back out of that field — so a unitless `n` scales
  // to a unitless quantity and the member's mise loses its units entirely. The
  // first version of this rule used "1/2 cup" -> "1/2" to mean "do not convert
  // the fraction", and taught exactly the wrong lesson.
  '4. Emit ingredients as {"n": amount INCLUDING its unit, "m": the ingredient name}.',
  '   "1/2 cup flour" is {"n": "1/2 cup", "m": "flour"} — the unit goes in n, never in m.',
  '   Keep the amount as written: "1/2 cup", never "0.5 cup". An amount with no unit is fine ("2" eggs).',
  '5. Steps are plain strings. Never emit timing, station or passive/hands-off metadata of any kind.',
  '6. If the text is not a recipe, return empty arrays rather than guessing.',
  'Return ONLY JSON: {"title": string, "servings": number|null, "ingredients": [{"n": string, "m": string}], "steps": [string]}',
].join('\n');

type Draft = {
  title: string;
  servings: number | null;
  ingredients: { n: string; m: string }[];
  steps: string[];
};

// The model's output becomes DATA, so it goes through a hand-written validator
// after parseModelJson — never straight to the record.
function shape(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown, max: number): string =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const ings: { n: string; m: string }[] = [];
  if (Array.isArray(o.ingredients)) {
    for (const g of o.ingredients.slice(0, 120)) {
      if (!g || typeof g !== 'object') continue;
      const row = g as Record<string, unknown>;
      const m = s(row.m, 200);
      if (!m) continue;
      ings.push({ n: s(row.n, 60), m });
    }
  }
  const steps: string[] = [];
  if (Array.isArray(o.steps)) {
    for (const st of o.steps.slice(0, 80)) {
      // A structured step is dropped to its text — the route never passes
      // min/passive/station through, whatever the model emitted.
      const t = typeof st === 'object' && st !== null ? s((st as Record<string, unknown>).t, 1200) : s(st, 1200);
      if (t) steps.push(t);
    }
  }
  const servRaw = typeof o.servings === 'number' && Number.isFinite(o.servings) ? Math.floor(o.servings) : null;
  return {
    title: s(o.title, 160),
    servings: servRaw !== null && servRaw > 0 && servRaw <= 99 ? servRaw : null,
    ingredients: ings,
    steps,
  };
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // ⚠ readJson RETURNS A WRAPPER, `{ ok: true, data } | { ok: false, response }`
  // — never the body. Reading `.text` off the wrapper made `text` empty on every
  // request, so the `too_short` guard below fired for all of them and this whole
  // route was unreachable code behind a client that silently fell back to its
  // structural split. Its 400/413 responses are returned rather than swallowed.
  const parsed = await readJson<{ text?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const text = String(parsed.data?.text ?? '').trim();
  if (text.length < 20) return NextResponse.json({ draft: null, unavailable: true, reason: 'too_short' });
  // ⚠ REFUSED, NOT TRUNCATED. Slicing to MAX_TEXT sent the model a PREFIX, and a
  // prefix usually yields a usable draft — so the client accepted it and never
  // ran its own splitter over the full paste. The recipe's last ingredients and
  // last steps simply disappeared, with nothing on screen saying so. The local
  // split is line-based and has no length limit, so handing this back is
  // strictly better than a silent half-read.
  if (text.length > MAX_TEXT) return NextResponse.json({ draft: null, unavailable: true, reason: 'too_long' });

  if (!hasOpenAIKey()) return NextResponse.json({ draft: null, unavailable: true, reason: 'no_key' });

  const res = await callAI(
    {
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text },
      ],
    },
    { promptId: 'nutrition.recipe-parse' },
  );

  if (!res.ok) return NextResponse.json({ draft: null, unavailable: true, reason: res.reason });

  // The Responses API returns the text in output_text; fall back to walking the
  // content blocks rather than assuming a shape.
  const data = res.data as Record<string, unknown>;
  let out = typeof data.output_text === 'string' ? data.output_text : '';
  if (!out && Array.isArray(data.output)) {
    for (const blk of data.output as Record<string, unknown>[]) {
      const content = blk && Array.isArray(blk.content) ? (blk.content as Record<string, unknown>[]) : [];
      for (const c of content) if (typeof c.text === 'string') out += c.text;
    }
  }
  // Models fence JSON often enough that not stripping it is a self-inflicted
  // parse failure.
  const fenced = out.match(/```(?:json)?\s*([\s\S]*?)```/);
  const draft = shape(parseModelJson(fenced ? fenced[1] : out));

  if (!draft || (!draft.ingredients.length && !draft.steps.length)) {
    return NextResponse.json({ draft: null, unavailable: true, reason: 'no_draft' });
  }
  return NextResponse.json({ draft, model: true });
}
