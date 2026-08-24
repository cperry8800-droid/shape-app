// Members' AGES — never their birthdates, asked a roster at a time.
//
// ⚠ THE BIRTHDATE IS THE PII; THE AGE IS THE SAFE, DERIVED FORM. This route
// exists so the reduction happens on the SERVER: `member_dobs_for_viewer` hands
// back dates only for members this viewer is already entitled to, and this
// handler turns each into an integer before anything reaches a browser. That is
// also why this is a route rather than the direct-RPC batch pattern used by
// ShapeRosterVariance — a `supabase.rpc()` from the client would put the raw
// DATES on the wire, which for an `age_public` member publishes their exact
// birthday to every viewer. Column grants cannot fix that after the fact; it is
// a row-level question.
//
// ⚠ AUTHORIZATION IS THE RPC'S, NOT THIS FILE'S. The rule — self, or the
// member's coach through an active subscription, or an explicit `age_public`
// opt-in — lives in SQL next to the data it governs, so RLS and this route
// cannot drift apart.
//
// ⚠ THE ADMIN CLIENT IS USED HERE, AND THE REASON IS THE WHOLE POINT OF THIS
// ROUTE. `member_dobs_for_viewer` returns DATES, so it must not be callable by
// any browser identity — an earlier version granted it to `authenticated`, which
// let any signed-in member read an opted-in member's exact birthdate straight
// from PostgREST, defeating the reduction below. It is now granted to
// `service_role` alone, which means only a server can ask it.
//
// ⚠ SO THE ONE INVARIANT THAT MATTERS IS THE VIEWER. `viewer` is ALWAYS the id
// from this request's verified session — never anything in the body. The caller
// supplies only `targets`, and every one of those is independently filtered by
// the SQL rule, so an arbitrary id list can widen nothing. The admin client's
// only job here is reaching a function browsers cannot; it is not a shortcut
// past an authorization check.
//
// ⚠ AN OMITTED ID IS THE ONLY ANSWER FOR EVERY KIND OF "NO". Not entitled, and
// entitled-but-no-date-on-file, are both simply absent from the map — the RPC
// filters nulls for exactly this reason. A caller must not be able to tell "this
// member keeps their age private" from "this member has not supplied one",
// because the first is itself a disclosure about a choice they made.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ageFromDob } from '@/lib/age-derive.mjs';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Every answer here is per-viewer AND per-account, so it must never be reused —
// the same reasoning as the date-of-birth probe, and the same shared-device
// surface this repo has already had to harden once.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...(init || {}), headers: PRIVATE_HEADERS });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors the guard inside member_dobs_for_viewer. Both exist: this one gives a
// clean 400, and the RPC's protects it from callers that skip this route.
const MAX_IDS = 500;

export async function POST(request: Request) {
  // ⚠ AUTHENTICATE FIRST. Everything below — parsing, validating up to 500 ids,
  // deduping — is work an anonymous caller could otherwise drive on every request.
  // `readJson` bounds the payload, so this is cheap rather than critical, but the
  // order now also matches /api/me/age-public, which calls getUser() first.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });

  // The shared reader, not a local try/catch: it carries the proxy's size cap and
  // one malformed-body answer for every route, so this endpoint — which accepts a
  // list — cannot drift into being the one that takes an unbounded payload.
  const bodyResult = await readJson<unknown>(request);
  if (!bodyResult.ok) return bodyResult.response;
  const raw = (bodyResult.data as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(raw)) {
    return privateJson({ error: 'Expected { ids: string[] }.', code: 'bad_body' }, { status: 400 });
  }

  // ⚠ REFUSE A MALFORMED ID RATHER THAN DROPPING IT, AND THAT INCLUDES A
  // NON-STRING. A dropped id comes back as an absent age, which renders
  // identically to "this member keeps their age private" — so a bug upstream
  // would look like a member's deliberate choice and nothing would ever report
  // it. An earlier version filtered non-strings out before validating, so
  // `{ ids: ['<uuid>', 42] }` answered 200 for the good half; every element is
  // now checked, before the dedupe can hide one.
  const bad = raw.filter((v) => typeof v !== 'string' || !UUID.test(v));
  if (bad.length) {
    return privateJson({ error: 'Invalid member id.', code: 'invalid_id', count: bad.length }, { status: 400 });
  }

  // Dedupe after validating, so a caller asking about the same member twice is
  // not punished for it and the RPC never sees a longer array than it needs.
  const ids = [...new Set(raw as string[])];

  // ⚠ REFUSE, NEVER TRUNCATE. Answering the first 500 of a longer ask would
  // render the rest as "no age on file" — a claim this route would not have
  // checked. No silent caps.
  if (ids.length > MAX_IDS) {
    return privateJson(
      { error: `Too many ids (${ids.length}); maximum is ${MAX_IDS}.`, code: 'too_many' },
      { status: 400 }
    );
  }

  // An empty ask is not a failure — answer it without troubling the database.
  if (!ids.length) return privateJson({ ages: {} });

  // ⚠ `viewer: user.id` COMES FROM THE VERIFIED SESSION ABOVE, NEVER THE BODY.
  // That single argument is what the SQL rule keys every branch on, so it is the
  // one value in this file a mistake could actually widen.
  //
  // ⚠ THE ADMIN CLIENT IS DELIBERATE HERE, AND THE CALLER'S RLS CLIENT CANNOT REPLACE
  // IT. This is the one documented exception to "RLS stays authoritative at the
  // endpoint", so read this before changing it:
  //   • member_dobs_for_viewer is granted to service_role ALONE. That grant IS the
  //     security fix of this wave — PostgREST exposes every function in `public`, so
  //     granting it to `authenticated` would let any signed-in member call
  //     /rest/v1/rpc/member_dobs_for_viewer from a browser console and read raw
  //     date_of_birth values, bypassing the reduction below. Swapping in an
  //     RLS-scoped client does not narrow this route; it 500s it, and the only way to
  //     make that call succeed is to re-open the door.
  //   • Authorization is not skipped, it MOVED. The RPC is SECURITY DEFINER and does
  //     the whole entitlement check itself — self, an active coach link, or an
  //     explicit age_public opt-in — keyed on `viewer`, which the caller cannot set.
  //     `tests/age-route-behaviour.test.mjs` drives the real handler with a hostile
  //     body and asserts the RPC still receives the SESSION id, and that it lands on
  //     the admin client rather than the session one. Mutation-checked.
  //   • No date leaves the server: the reduction to an integer happens below.
  // The alternative — compute the age in SQL and grant the function to
  // `authenticated` — was considered and REJECTED, and the reasons are unchanged:
  // CI has no database, so SQL cannot be behaviourally tested here, and it would add
  // a THIRD implementation of the age derivation (both console routes already carry
  // local copies). The failure mode of a second implementation is anniversary
  // arithmetic — Feb 29 clamps in Postgres and rolls in JS — which is exactly the
  // kind of drift that ships silently. ageFromDob() stays the single derivation.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // A missing service key breaks this feature; it must not read as "nobody
    // here has an age on file".
    return privateJson({ error: 'Could not read these members.', code: 'unavailable' }, { status: 503 });
  }
  const { data, error } = await admin.rpc('member_dobs_for_viewer', {
    viewer: user.id,
    targets: ids,
  });

  // ⚠ A READ FAULT IS NOT A REFUSAL. Answering `{ ages: {} }` here would render
  // as "none of these members has an age", which is a claim we cannot make from a
  // failed read — and it would look identical to a roster of private members.
  if (error) {
    return privateJson({ error: 'Could not read these members.', code: 'unavailable' }, { status: 503 });
  }

  // The reduction to integers happens HERE — no date leaves the server.
  const ages: Record<string, number> = {};
  for (const row of (data as { member_id: string; dob: string }[] | null) || []) {
    const age = ageFromDob(row?.dob);
    if (typeof age === 'number') ages[row.member_id] = age;
  }
  return privateJson({ ages });
}
