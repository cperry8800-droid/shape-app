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
import { RECIPE_SYSTEM_TEXT, readModelText, shapeRecipeDraft } from '@/lib/recipe-draft';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 12000;

// The prompt, the Draft shape and the validator live in @/lib/recipe-draft,
// shared with the photo route. They differ only in what they hand the model;
// everything after that must be identical, because both write to the same store
// and are cooked by the same walkthrough.

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
        { role: 'system', content: RECIPE_SYSTEM_TEXT },
        { role: 'user', content: text },
      ],
    },
    { promptId: 'nutrition.recipe-parse' },
  );

  if (!res.ok) return NextResponse.json({ draft: null, unavailable: true, reason: res.reason });

  const draft = shapeRecipeDraft(parseModelJson(readModelText(res.data)));

  if (!draft || (!draft.ingredients.length && !draft.steps.length)) {
    return NextResponse.json({ draft: null, unavailable: true, reason: 'no_draft' });
  }
  return NextResponse.json({ draft, model: true });
}
