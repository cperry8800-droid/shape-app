// A member's AGE — never their birthdate.
//
// ⚠ THE BIRTHDATE IS THE PII; THE AGE IS THE SAFE, DERIVED FORM. This route exists
// so the reduction happens on the SERVER: `member_dob_for_viewer` hands back a date
// only to a viewer already entitled to one, and this handler turns it into an
// integer before anything reaches a browser. A client that fetched the date and
// subtracted would have published exact birthdates to every member who can see an
// age, which column grants cannot fix — it is a row-level question.
//
// ⚠ AUTHORIZATION IS THE RPC'S, NOT THIS FILE'S, AND THAT IS DELIBERATE. The rule —
// self, or the member's coach through an active subscription, or an explicit
// `age_public` opt-in — lives in SQL next to the data it governs, so RLS and this
// route cannot drift apart. The handler runs on the CALLER's client, so it holds no
// power of its own: with no service key here, a mistake in this file can leak
// nothing the caller could not already read.
//
// ⚠ NULL IS THE REFUSAL, AND IT IS INDISTINGUISHABLE FROM "no date on file".
// Deliberate, and mirrored from the RPC: a caller must not be able to tell "this
// member keeps their age private" from "this member has not supplied one", because
// the first is itself a disclosure about a choice they made.

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Reject a malformed id before it reaches the database — a bad uuid would
  // otherwise surface as a raw Postgres error rather than a clean 400.
  if (!UUID.test(id)) {
    return privateJson({ error: 'Invalid member id.', code: 'invalid_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });

  const { data, error } = await supabase.rpc('member_dob_for_viewer', { target: id });

  // ⚠ A READ FAULT IS NOT A REFUSAL. Answering `age: null` here would render as
  // "no age on file", which is a claim we cannot make from a failed read — and it
  // would look identical to a deliberate refusal. Say we could not tell.
  if (error) {
    return privateJson(
      { error: 'Could not read this member.', code: 'unavailable' },
      { status: 503 }
    );
  }

  // `data` is the date or null. The reduction to an integer happens HERE — the date
  // itself never leaves the server.
  return privateJson({ age: ageFromDob(data) });
}
