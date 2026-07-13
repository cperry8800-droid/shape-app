// Opportunistic per-user UI-locale capture. The client posts its active locale
// on change; we mirror it onto client_profiles.locale so later sub-projects
// (localized emails/notifications) can address a member in their language.
// Owner-scoped via the request's auth client. Mirrors the timezone route.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// BCP-47-ish shape for the supported set (e.g. 'en', 'pt-BR', 'zh-Hans'). A
// well-formed-but-unsupported code is harmless — email/notification localization
// falls back to English on an unknown value, same as the client runtime.
const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await readJson<{ locale?: unknown }>(request, { allowEmpty: false });
  if (!body.ok) return body.response;
  const locale = String(body.data?.locale ?? '').trim().slice(0, 16);
  if (!CODE.test(locale)) return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });

  const supabase = await clientForRequest(request);
  // client_profiles is keyed by user_id (PK); a locale-only upsert is safe on
  // insert + update (RLS: client_profiles_insert_own + client_profiles_update_own).
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ user_id: user.id, locale }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
