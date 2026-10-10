// Nora's engine's line to Shape (services/nora-engine): GET hands it the set due now or next, with
// the programme and a signed link to each song; POST takes its reports (a set started, a song
// played, a set ended or failed). The work is in src/lib/radio/noraEngineApi.mjs.
//
// Auth: `Authorization: Bearer <NORA_ENGINE_TOKEN>`, compared in constant time. No token
// configured means the route is closed (503), never open.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { engineJob, recordEngineEvent } from '@/lib/radio/noraEngineApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

function gate(request: Request): NextResponse | null {
  const secret = process.env.NORA_ENGINE_TOKEN || '';
  if (secret.length < 32) return NextResponse.json({ error: 'engine_not_configured' }, { status: 503, headers: NO_STORE });
  const given = Buffer.from(request.headers.get('authorization') || '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }
  return null;
}

export async function GET(request: Request) {
  const refused = gate(request);
  if (refused) return refused;
  const r = await engineJob(createAdminClient(), { now: Date.now() });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const refused = gate(request);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400, headers: NO_STORE });
  }
  const r = await recordEngineEvent(createAdminClient(), body, { now: Date.now() });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
