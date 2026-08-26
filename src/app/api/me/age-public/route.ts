// The member's own age-visibility choice — read it, and change it.
//
// ⚠ WHY THE WEB NEEDS A ROUTE WHERE MOBILE DOES NOT. The mobile bundle holds a
// Supabase client that is already authenticated, so it writes profiles.age_public
// directly under the `users update own profile` policy. The website's browser
// client is a different animal: its session lives in Next.js HTTP cookies, and
// the client is ANON until window.shapeDb.getSession() bridges it (the #1769
// lesson, written up beside the variance RPC in coachClientDetail.jsx). An
// unbridged write would be refused by RLS, match zero rows, and — because
// PostgREST does NOT call a zero-row UPDATE an error — report success. The
// member would be told their age is public when it is not. This route runs on the
// cookie session server-side, where that ambiguity does not exist.
//
// ⚠ THE READ-BACK IS THE AUTHORITY, NOT THE UPDATE'S SILENCE. Exactly the defect
// #1928 shipped and then fixed on /api/me/date-of-birth: for an account with no
// profiles row, `.update()` affects nothing and answers without error. So this
// re-reads the row and reports what is ACTUALLY stored; a mismatch is a failure,
// however quiet the write was.
//
// AUTHORIZATION is the caller's own RLS-scoped client, never the service role.
// `users update own profile` (auth.uid() = id on USING and WITH CHECK) already
// permits exactly this write and nothing wider, and no coach-update policy
// exists — so a coach can never flip a member's toggle through this door either.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-account, and a privacy choice — never reuse it on a shared device.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...(init || {}), headers: PRIVATE_HEADERS });

type Row = { age_public: boolean | null };

async function readFlag(supabase: Awaited<ReturnType<typeof createClient>>, uid: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('age_public')
    .eq('id', uid)
    .maybeSingle();
  return { row: (data as Row | null) || null, error };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });

  const { row, error } = await readFlag(supabase, user.id);
  // ⚠ A FAILED READ IS NOT "OFF". Answering false would render a member's own
  // choice back to them as off, and their next toggle would write that wrong
  // value in — the same reasoning as the mobile door.
  if (error) return privateJson({ error: 'Could not read your settings.', code: 'unavailable' }, { status: 503 });
  if (!row) return privateJson({ error: 'No profile on file.', code: 'no_profile' }, { status: 404 });
  return privateJson({ agePublic: row.age_public === true });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<unknown>(request);
  if (!bodyResult.ok) return bodyResult.response;
  const wanted = (bodyResult.data as { agePublic?: unknown } | null)?.agePublic;

  // ⚠ A STRICT BOOLEAN, NOT A TRUTHY VALUE. This flag GATES DISCLOSURE, so
  // "on" / 1 / "false" must not each pick their own meaning here — the column is
  // typed NOT NULL for the same reason. Refuse anything else outright.
  if (typeof wanted !== 'boolean') {
    return privateJson({ error: 'Expected { agePublic: boolean }.', code: 'bad_body' }, { status: 400 });
  }

  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ age_public: wanted })
    .eq('id', user.id);
  if (writeErr) return privateJson({ error: 'Could not save that.', code: 'write_failed' }, { status: 503 });

  // ⚠ THE WRITE'S SILENCE PROVES NOTHING — read what is actually stored.
  const { row, error } = await readFlag(supabase, user.id);
  if (error) return privateJson({ error: 'Could not confirm the change.', code: 'unconfirmed' }, { status: 503 });
  if (!row) {
    // The update matched no row at all. Say so rather than echoing `wanted`
    // back, which would be this endpoint telling the member a comfortable lie.
    return privateJson({ error: 'No profile on file.', code: 'no_profile' }, { status: 404 });
  }
  const stored = row.age_public === true;
  if (stored !== wanted) {
    return privateJson({ error: 'The change was not saved.', code: 'not_saved', agePublic: stored }, { status: 409 });
  }
  return privateJson({ agePublic: stored });
}
