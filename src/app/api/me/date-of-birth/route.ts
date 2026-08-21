// Date-of-birth completion for accounts that have never supplied one.
//
// WHY THIS EXISTS. `mustRefuseForAge()` grandfathers accounts created before
// ADULT_PROOF_REQUIRED_FROM: with nothing proving an age either way, an older
// account is admitted and a newer one refused. The owner ruled (2026-08-21) that
// EVERY account must supply a birthdate, which means that exemption ends — and
// ending it without first giving those members a way to comply would lock them
// out of the product with no route back in.
//
// ⚠ THIS ROUTE MUST STAY OUTSIDE `GATED_API_PREFIXES`. It is the one door a
// member still needs after the gate starts refusing them. `/api/me/...` is not in
// that list (verified against supabase/middleware.ts) — if the gate is ever
// widened to cover `/api/me`, this route has to be added to GATE_SKIP in the same
// change or the remedy becomes unreachable at the moment it is needed.
//
// ORDERING, which is the whole risk here: collect FIRST, enforce SECOND. This is
// the same shape as the profiles PII lockdown — a change that removes an
// allowance lands only after the deploy that stops needing it.
//
// AUTHORIZATION is the caller's own RLS-scoped client, not the service role. The
// `users update own profile` policy (auth.uid() = id, on USING and WITH CHECK)
// already permits exactly this write and nothing wider, so an admin client would
// be strictly more power than the job needs.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isMinorFromDob } from '@/lib/age-derive.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Profile = { date_of_birth: string | null; over_18: boolean | null };

async function readProfile(supabase: Awaited<ReturnType<typeof createClient>>, uid: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('date_of_birth, over_18')
    .eq('id', uid)
    .maybeSingle();
  return { profile: (data ?? null) as Profile | null, error };
}

// GET — does this member still owe us a birthdate?
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { profile, error } = await readProfile(supabase, user.id);
  // ⚠ FAIL AS "NOT NEEDED" ON A READ FAULT. This drives a blocking prompt; a
  // transient read error must not trap a member behind a form we cannot tell
  // whether they need. The gate itself is the authority on access — this endpoint
  // only decides whether to ASK.
  if (error) return NextResponse.json({ needed: false, unknown: true });

  return NextResponse.json({ needed: !profile?.date_of_birth });
}

// POST — supply it, once.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const dob = (body as { date_of_birth?: unknown } | null)?.date_of_birth;

  // ⚠ VALIDATE WITH THE SHARED HELPER, NEVER A LOCAL PARSE. `isMinorFromDob`
  // rejects calendar-impossible dates rather than letting Date.UTC roll them
  // forward (Feb 30 -> Mar 2), and clamps the 18-year anniversary the way Postgres
  // does rather than rolling it (Feb 29 -> Feb 28, not Mar 1). Re-implementing
  // either here would let this route and the trigger disagree about one person's
  // age, which is the exact class the shared module exists to prevent.
  const minor = isMinorFromDob(dob);
  if (minor === null) {
    return NextResponse.json(
      { error: 'Enter a real date of birth, as YYYY-MM-DD.', code: 'invalid_date' },
      { status: 400 }
    );
  }
  if (minor === true) {
    return NextResponse.json(
      { error: 'Shape is for adults 18 and over.', code: 'under_18' },
      { status: 403 }
    );
  }

  const { profile, error: readErr } = await readProfile(supabase, user.id);
  if (readErr) {
    return NextResponse.json({ error: 'Could not read your profile. Try again.' }, { status: 503 });
  }

  // ⚠ REFUSE A SECOND WRITE LOUDLY RATHER THAN APPEARING TO ACCEPT IT. The
  // `set_over_18` trigger silently REVERTS any change to a non-null
  // date_of_birth, so writing here would return success while changing nothing —
  // a member correcting a typo would be told it worked. Say so instead.
  if (profile?.date_of_birth) {
    return NextResponse.json(
      {
        error: 'Your date of birth is already on file and cannot be changed here. Contact support if it is wrong.',
        code: 'already_set',
      },
      { status: 409 }
    );
  }

  // over_18 is deliberately NOT written: set_over_18() derives it from this value
  // and discards anything supplied, which is what makes `true` real proof.
  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ date_of_birth: dob as string })
    .eq('id', user.id);

  // ⚠ SURFACE THE FAILURE. A swallowed write here leaves the member believing
  // they have complied while the gate still refuses them — the silent-persistence
  // class already registered against writeUserGoal.
  if (writeErr) {
    return NextResponse.json(
      { error: 'Could not save your date of birth. Try again.', code: 'write_failed' },
      { status: 503 }
    );
  }

  // Read back rather than assuming: the trigger derives over_18, and confirming it
  // landed is the difference between "we wrote a row" and "the gate will now
  // admit them".
  const { profile: after } = await readProfile(supabase, user.id);
  return NextResponse.json({
    ok: true,
    date_of_birth: after?.date_of_birth ?? null,
    over_18: after?.over_18 ?? null,
  });
}
