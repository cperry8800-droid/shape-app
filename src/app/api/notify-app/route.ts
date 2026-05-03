// App-launch waitlist signup. Captures email + source for the
// "Notify me when the Shape app launches" CTA. Inserts into
// public.app_launch_notifications. Repeat submissions on the same email are
// silently treated as a no-op (the unique index handles dedupe).
//
// Called by public/newdesign/GetApp.html.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 80) : '';

  if (!email || email.length > 200 || !isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('app_launch_notifications')
    .upsert(
      {
        email,
        source: source || null,
        user_agent: req.headers.get('user-agent') || null,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
      { onConflict: 'email', ignoreDuplicates: true }
    );

  if (error) {
    console.error('app_launch_notifications insert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your email. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
