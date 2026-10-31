// src/app/api/consent/banner/route.ts
// The consent banner's receipt (consent_log), for a page with no browser database client.
//
// ⚠ THE NEXT PAGES TOOK AN ANSWER AND LOGGED NOTHING (Codex on #2530). /consent-banner.js writes a
// signed-in visitor's answer to consent_log through window.shapeDb, which /supabase.js gives the
// website's pages. The Next pages, and the website's few pages without /supabase.js, have no such
// client: the answer was kept on the device and could start the page views, with no receipt of
// who chose what, under which words. The banner asks here instead.
//
// The caller is read from the request's own session (the cookie, or a Bearer token), and the row
// is written with that same session, so the table's own rules hold as they do for the browser
// client: a row for the caller's own account only, never changed or removed
// (2026-06-22-consent-log.sql). Only the banner's two kinds are taken. A visitor who isn't signed
// in has no account to log against (401). The body must be JSON (415 otherwise): a form on
// another site can't send that, and a cross-site fetch can't send it without asking first.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set(['cookies', 'gpc_optout']);
const TEXT_LIMIT = 2000;

export type BannerReceipt = { kind: string; granted: boolean; policy_version: string; consent_text: string };

export function cleanReceipt(body: unknown): BannerReceipt | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.kind !== 'string' || !KINDS.has(b.kind)) return null;
  if (typeof b.granted !== 'boolean') return null;
  if (typeof b.policy_version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.policy_version)) return null;
  if (typeof b.consent_text !== 'string') return null;
  const text = b.consent_text.trim();
  if (!text || text.length > TEXT_LIMIT) return null;
  return { kind: b.kind, granted: b.granted, policy_version: b.policy_version, consent_text: text };
}

export async function POST(request: Request) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) {
    return NextResponse.json({ logged: false, error: 'json_only' }, { status: 415 });
  }
  const parsed = await readJson<unknown>(request, { maxBytes: 8 * 1024 });
  if (!parsed.ok) return parsed.response;
  const receipt = cleanReceipt(parsed.data);
  if (!receipt) return NextResponse.json({ logged: false, error: 'bad_receipt' }, { status: 400 });
  const user = await currentUser(request).catch(() => null);
  if (!user) return NextResponse.json({ logged: false }, { status: 401 });
  try {
    const db = await clientForRequest(request);
    // The GPC opt-out is logged once per account, as the banner's own GPC log is: a browser that
    // sends GPC sends it on every visit.
    if (receipt.kind === 'gpc_optout') {
      const { data, error } = await db.from('consent_log').select('id').eq('user_id', user.id).eq('kind', 'gpc_optout').limit(1);
      if (error) throw error;
      if (data && data.length) return NextResponse.json({ logged: true });
    }
    const { error } = await db.from('consent_log').insert({ user_id: user.id, ...receipt, source: 'banner' });
    if (error) throw error;
    return NextResponse.json({ logged: true });
  } catch (e) {
    console.warn('[consent-banner] receipt not written:', e instanceof Error ? e.message : (e as { message?: string })?.message ?? e);
    return NextResponse.json({ logged: false }, { status: 503 });
  }
}
