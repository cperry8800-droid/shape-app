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
import { readJson } from '@/lib/request-utils';

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

  // ⚠ A MISSING PROFILE ROW IS A THIRD STATE, NOT A MISSING DATE. `absence
  // refuses` means such an account is already locked out of every gated
  // surface, and POST below cannot help it — there is no row to write to. It
  // is reported separately so the prompt can say something true instead of
  // presenting a form that is guaranteed to fail. Verified against the live
  // database 2026-08-21: 2 of 4 confirmed, signed-in accounts are in this
  // state, so it is the reachable case, not a theoretical one.
  if (!profile) return NextResponse.json({ needed: true, blocked: 'no_profile' });

  return NextResponse.json({ needed: !profile.date_of_birth });
}

// POST — supply it, once.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // The shared reader, not a local try/catch: it carries the proxy's size cap
  // and one malformed-body answer for every route, so this endpoint cannot
  // drift into being the one that accepts an unbounded payload.
  const bodyResult = await readJson<unknown>(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
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

  // ⚠ NORMALISE ONCE, HERE, SO ONE STRING IS VALIDATED, STORED AND COMPARED.
  // `isMinorFromDob` validates `dob.trim()`, so a body carrying surrounding
  // whitespace passes it — and the raw value was then both written and compared
  // against the read-back. Postgres parses ' 1985-05-05 ' into the date and hands
  // back the canonical form, so that comparison could never match: a member whose
  // save SUCCEEDED was told their date was already on file and to contact
  // support. Trimming at the point the value is accepted, rather than at either
  // use, is what keeps the write and the check from ever disagreeing again.
  const dobValue = (dob as string).trim();

  const { profile, error: readErr } = await readProfile(supabase, user.id);
  if (readErr) {
    return NextResponse.json({ error: 'Could not read your profile. Try again.' }, { status: 503 });
  }

  // ⚠ NO PROFILE ROW MEANS THE UPDATE BELOW MATCHES ZERO ROWS AND REPORTS
  // SUCCESS. PostgREST does not treat an UPDATE affecting nothing as an error,
  // so `writeErr` stays null and this route used to answer `ok: true` with a
  // null date — telling a member their birthday was recorded while the gate
  // went on refusing them, permanently and with no way to tell. Proven against
  // the live database 2026-08-21 by running this exact statement under the
  // caller's own RLS identity: 0 rows written for a profile-less account, 1 for
  // an account with a row (both arms measured — an equal result would only have
  // meant the test was broken).
  //
  // ⚠ AND THIS ROUTE DELIBERATELY DOES NOT CREATE THE ROW. `profiles.role` is
  // NOT NULL with no default, so an insert has to choose a role — and
  // `guard_profile_role_elevation` rewrites any coach role to 'client' on a
  // non-privileged INSERT. A coach whose row went missing would silently
  // self-provision as a client and lose their coach surfaces, which is a worse
  // failure than the one being fixed. Provisioning belongs to the sign-in path
  // that already owns it (src/app/auth/callback/route.ts), not to an
  // age-collection endpoint.
  if (!profile) {
    return NextResponse.json(
      {
        error: 'Your account setup did not finish, so there is nothing to save this to yet. Contact support and we can complete it.',
        code: 'no_profile',
      },
      { status: 409 }
    );
  }

  // ⚠ REFUSE A SECOND WRITE LOUDLY RATHER THAN APPEARING TO ACCEPT IT. The
  // `set_over_18` trigger silently REVERTS any change to a non-null
  // date_of_birth, so writing here would return success while changing nothing —
  // a member correcting a typo would be told it worked. Say so instead.
  if (profile.date_of_birth) {
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
    .update({ date_of_birth: dobValue })
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

  // Read back rather than assuming: the trigger derives over_18, and confirming
  // it landed is the difference between "we wrote a row" and "the gate will now
  // admit them".
  //
  // ⚠ THE READ-BACK IS THE AUTHORITY AND MUST BE ACTED ON. This comment already
  // claimed as much while the code below simply reported whatever came back and
  // answered `ok: true` regardless — a described check that was never performed.
  // Anything short of a stored date is a failure to report, not a success to
  // decorate, because the member's next screen is the gate that reads this row.
  const { profile: after, error: verifyErr } = await readProfile(supabase, user.id);
  if (verifyErr || !after?.date_of_birth) {
    return NextResponse.json(
      { error: 'Could not confirm your date of birth was saved. Try again.', code: 'not_persisted' },
      { status: 503 }
    );
  }

  // ⚠ PRESENCE IS NOT PROOF IT IS *THIS* CALLER'S DATE. The already_set guard
  // above is a read followed by a write, so two requests can both find null and
  // both proceed. The first write lands; `set_over_18` then silently REVERTS the
  // second back to the stored value, and PostgREST reports no error — so the
  // second caller read back a truthy date and was told `ok: true` for a date
  // that is not the one they sent. That is the same lie this route was just
  // fixed for, one layer in: a write that did nothing, reported as success.
  //
  // Comparing identity closes it for every cause, not just concurrency — a
  // trigger that rewrites the value, or a future policy that narrows the write,
  // lands here too. Deliberately NOT paired with a `.is('date_of_birth', null)`
  // filter on the UPDATE: that would need its own `.select()` to be observable
  // (a zero-row filtered update is the same PostgREST silence), which puts a
  // second authority next to this one and makes neither individually testable.
  // The read-back is the authority; it decides alone.
  if (after.date_of_birth !== dobValue) {
    return NextResponse.json(
      {
        error: 'Your date of birth is already on file and cannot be changed here. Contact support if it is wrong.',
        code: 'already_set',
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    date_of_birth: after.date_of_birth,
    over_18: after.over_18 ?? null,
  });
}
