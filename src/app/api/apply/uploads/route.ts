// Signed upload links for a coach application's documents (2026-10-12).
//
// The owner asked for an application to carry a resume and other CV materials, certifications
// and certificates, and designations with their supporting paperwork. They used to ride the
// application request, which the platform caps at 4.5 MB, so an application held 4 MB of files
// in all. Now the form asks here first, with each file's category, name, type and size; this
// route checks them against the shared rules (src/lib/application-files.mjs), runs the same bot
// check as /api/apply, and answers with one signed upload link per file under a new draft id
// and a ticket for that id. The form uploads each file straight to the private bucket, then
// sends the application with the ticket; /api/apply takes the draft id as the application's id
// and reads the documents from storage itself.
//
// Nothing is written here but the links: an upload that is never followed by an application is
// removed by /api/cron/application-uploads.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { verifyTurnstile } from '@/lib/turnstile';
import { currentUser } from '@/lib/request-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  APPLICATION_FILE_BUCKET,
  applicationFileType,
  applicationFilesProblem,
  applicationUploadPath,
} from '@/lib/application-files.mjs';
import { issueUploadTicket } from '@/lib/application-upload-ticket';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
// The signed-in path's daily cap: the same key /api/apply counts, so asking for links and then
// applying with the ticket costs one of the five, not two.
const ACCOUNT_DAILY_APPLICATIONS = 5;
// Link requests a signed-out address may make an hour, on top of the human check.
const ADDRESS_HOURLY_UPLOADS = 10;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** Turnstile, or a signed-in account within its daily cap (the app's path), as /api/apply checks. */
async function passesBotCheck(req: NextRequest, body: Record<string, unknown>, ip: string | null): Promise<boolean> {
  if (await verifyTurnstile(body.captchaToken ?? body.turnstileToken, ip)) return true;
  if (!/^Bearer\s+\S/i.test(req.headers.get('authorization') ?? '')) return false;
  let userId = '';
  try {
    userId = (await currentUser(req))?.id ?? '';
  } catch {
    userId = '';
  }
  if (!userId) return false;
  const limit = await checkRateLimit(createAdminClient(), `apply:u:${userId}`, ACCOUNT_DAILY_APPLICATIONS, 24 * 60 * 60, { failClosed: true });
  return limit.allowed;
}

export async function POST(req: NextRequest) {
  const parsed = await readJson<Record<string, unknown>>(req);
  if (!parsed.ok || !parsed.data || typeof parsed.data !== 'object') return json({ error: 'Invalid upload request.' }, 400);
  const body = parsed.data;

  const role = String(body.providerType ?? '').toLowerCase();
  if (role !== 'trainer' && role !== 'nutritionist') return json({ error: 'providerType must be "trainer" or "nutritionist".' }, 400);

  const raw = Array.isArray(body.files) ? body.files : [];
  if (!raw.length) return json({ error: 'No files to upload.' }, 400);
  const files = raw.slice(0, 100).map((f) => {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    return { kind: String(r.kind ?? ''), name: String(r.name ?? '').slice(0, 200), type: String(r.type ?? ''), size: Number(r.size) };
  });
  const problem = applicationFilesProblem(files);
  if (problem) return json({ error: problem }, 400);

  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (ip) {
    const limit = await checkRateLimit(createAdminClient(), `apply-uploads:ip:${ip}`, ADDRESS_HOURLY_UPLOADS, 60 * 60);
    if (!limit.allowed) return json({ error: 'Too many uploads from this connection. Try again in an hour.' }, 429);
  }
  if (!(await passesBotCheck(req, body, ip))) {
    return json({ error: 'Captcha check failed — please retry.', code: 'captcha_failed' }, 400);
  }

  const draftId = crypto.randomUUID();
  const issued = issueUploadTicket(draftId, role);
  if (!issued) return json({ error: 'Uploads are not available right now. Please try again later.' }, 503);

  const storage = createAdminClient().storage.from(APPLICATION_FILE_BUCKET);
  const uploads: Array<Record<string, unknown>> = [];
  for (const [i, f] of files.entries()) {
    const path = applicationUploadPath(draftId, f.kind, i + 1, f.name);
    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error('[shape-api] application upload link failed:', error);
      return json({ error: 'Could not prepare your uploads. Nothing was saved, so please try again.' }, 500);
    }
    uploads.push({
      kind: f.kind,
      name: f.name,
      type: applicationFileType(f.name, f.type),
      size: f.size,
      path: data.path || path,
      token: data.token,
      signedUrl: data.signedUrl || null,
    });
  }

  return json({ draftId, ticket: issued.ticket, expiresAt: issued.expiresAt, bucket: APPLICATION_FILE_BUCKET, uploads });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
