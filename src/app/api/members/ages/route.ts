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
// ⚠ AUTHORIZATION IS THE RPC'S, NOT THIS FILE'S, AND THAT IS DELIBERATE. The
// rule — self, or the member's coach through an active subscription, or an
// explicit `age_public` opt-in — lives in SQL next to the data it governs, so
// RLS and this route cannot drift apart. The handler runs on the CALLER's
// client, so it holds no power of its own: with no service key here, a mistake
// in this file can leak nothing the caller could not already read.
//
// ⚠ AN OMITTED ID IS THE ONLY ANSWER FOR EVERY KIND OF "NO". Not entitled, and
// entitled-but-no-date-on-file, are both simply absent from the map — the RPC
// filters nulls for exactly this reason. A caller must not be able to tell "this
// member keeps their age private" from "this member has not supplied one",
// because the first is itself a disclosure about a choice they made.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ageFromDob } from '@/lib/age-derive.mjs';

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: 'Expected a JSON body.', code: 'bad_body' }, { status: 400 });
  }

  const raw = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(raw)) {
    return privateJson({ error: 'Expected { ids: string[] }.', code: 'bad_body' }, { status: 400 });
  }

  // Dedupe before the cap, so a caller asking about the same member twice is not
  // punished for it, and the RPC never sees a longer array than it needs.
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string'))];

  // ⚠ REFUSE A MALFORMED ID RATHER THAN DROPPING IT. A dropped id comes back as
  // an absent age, which renders identically to "this member is private" — so a
  // typo upstream would look like a member's deliberate choice, and nothing
  // would ever report the mistake.
  const bad = ids.filter((v) => !UUID.test(v));
  if (bad.length) {
    return privateJson({ error: 'Invalid member id.', code: 'invalid_id', count: bad.length }, { status: 400 });
  }

  // ⚠ REFUSE, NEVER TRUNCATE. Answering the first 500 of a longer ask would
  // render the rest as "no age on file" — a claim this route would not have
  // checked. No silent caps.
  if (ids.length > MAX_IDS) {
    return privateJson(
      { error: `Too many ids (${ids.length}); maximum is ${MAX_IDS}.`, code: 'too_many' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });

  // An empty ask is not a failure — answer it without troubling the database.
  if (!ids.length) return privateJson({ ages: {} });

  const { data, error } = await supabase.rpc('member_dobs_for_viewer', { targets: ids });

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
