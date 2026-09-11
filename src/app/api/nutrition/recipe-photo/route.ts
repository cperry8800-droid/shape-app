// Member recipe import, the PHOTO half — an image in, a structured draft out.
// Spec: docs/superpowers/specs/2026-09-10-third-party-recipe-import-design.md §4.
//
// POST { image: "data:image/jpeg;base64,..." }
//   -> { draft: { title, servings, ingredients, steps }, model: true }
//   -> { draft: null, unavailable: true, reason }   on every failure
//
// ⚠ THE PHOTO IS NEVER STORED, AND THAT IS A DESIGN DECISION RATHER THAN AN
// OMISSION. The spec reached for a `recipe-imports` storage bucket because it
// assumed the saved document would keep a `photoPath`. It does not need to: the
// member photographs a page, reviews the draft, and what they keep is the
// recipe. Holding the image afterwards would mean a migration the owner has to
// run, a second signed-URL surface, a new row in the GDPR export, a deletion
// obligation, and indefinite retention of a page that is very often someone
// else's copyrighted cookbook. So the bytes live for the length of one request
// and are never written anywhere. That also means this route ships with NO
// migration, like the rest of the feature.
//
// ⚠ AND THE DRAFT IS NEVER PERSISTED BY THIS ROUTE EITHER. It goes to the same
// review screen the paste path uses; the member confirms or edits every line
// before a byte is stored.
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
import { RECIPE_SYSTEM_PHOTO, parseImageDataUrl, readModelText, shapeRecipeDraft } from '@/lib/recipe-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// ⚠ DECLARED, BECAUSE THE ROUTE'S OWN TIMEOUT IS ONLY HALF THE BUDGET. If the
// platform kills the invocation first, none of the named failure handling below
// runs — the client gets a platform error page, degrades to its generic
// "couldn't read that photo", and the one diagnostic this feature ships (the
// console.warn naming a possible vision-capability problem, which the War Room
// tells the owner to look for) is never written. 60 leaves the provider call
// 55s and the rest of the handler the remainder.
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // readJson returns a WRAPPER, `{ ok: true, data } | { ok: false, response }`.
  // Its 400/413 responses are returned rather than swallowed — reading the body
  // off the wrapper is what made the sibling paste route dead in production.
  const parsed = await readJson<{ image?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const img = parseImageDataUrl(parsed.data?.image);
  if (!img.ok) return NextResponse.json({ draft: null, unavailable: true, reason: img.reason });

  if (!hasOpenAIKey()) return NextResponse.json({ draft: null, unavailable: true, reason: 'no_key' });

  // ⚠ THE RESPONSES API CONTENT-BLOCK SHAPE, NOT CHAT COMPLETIONS'. ai.ts targets
  // /v1/responses and its own header warns against inferring this from the older
  // endpoint. Responses takes `input_text` / `input_image` with `image_url` as a
  // STRING; Chat Completions takes `{type:'image_url', image_url:{url}}`. They
  // are not interchangeable and the wrong one is a 400.
  const res = await callAI(
    {
      input: [
        { role: 'system', content: RECIPE_SYSTEM_PHOTO },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Transcribe the recipe in this photograph.' },
            // ⚠ `detail` IS SENT EXPLICITLY. The Responses API's input_image part
            // carries it (the official SDK types it as required), and a schema
            // rejection here is a 400 — which this route maps to
            // photo_unreadable, so an omitted field would present as "we
            // couldn't read your photo" on EVERY import, forever, while the log
            // blamed the model's vision capability. 'high' is also the right
            // value for reading a page of text rather than recognising a scene.
            { type: 'input_image', image_url: img.dataUrl, detail: 'high' },
          ],
        },
      ],
    },
    { promptId: 'nutrition.recipe-photo', timeoutMs: 55_000 },
  );

  if (!res.ok) {
    // ⚠ A 4xx ON AN IMAGE REQUEST IS REPORTED AS "WE COULD NOT READ THE PHOTO",
    // AND THE ROUTE DELIBERATELY DOES NOT CLAIM TO KNOW WHY. The pinned
    // production model is set by OPENAI_MODEL and a build whose model has no
    // vision capability rejects this request — but so does an image this
    // provider dislikes for half a dozen other reasons, and guessing between
    // them in member-facing copy would be a fabrication. What IS true either way
    // is that the photo did not become a recipe, and that typing it in will
    // work; that is what the sheet says. The server log carries the provider's
    // own detail for whoever is debugging it.
    const reason = res.reason === 'http_error' && typeof res.status === 'number' && res.status < 500
      ? 'photo_unreadable'
      : res.reason;
    if (reason === 'photo_unreadable') {
      console.warn(
        `[shape-ai] nutrition.recipe-photo provider ${res.status} — if this build's OPENAI_MODEL ` +
        `has no vision capability, every photo import fails here:`,
        String(res.detail ?? '').slice(0, 300),
      );
    }
    return NextResponse.json({ draft: null, unavailable: true, reason });
  }

  const draft = shapeRecipeDraft(parseModelJson(readModelText(res.data)));

  // ⚠ AN EMPTY DRAFT IS A FAILURE, NEVER A RESULT. `{ingredients: [], steps: []}`
  // is the positive claim "this photo contains a recipe with no ingredients",
  // which the review screen would render as a finding rather than as a failure —
  // and on the photo path the likeliest cause is that the member photographed
  // something that is not a recipe, which they need told.
  if (!draft || (!draft.ingredients.length && !draft.steps.length)) {
    return NextResponse.json({ draft: null, unavailable: true, reason: 'no_draft' });
  }
  return NextResponse.json({ draft, model: true });
}
