import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function clean(value: unknown, max = 300): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const email = clean(body.email, 200).toLowerCase();
  const platform = clean(body.platform, 40) === 'android' ? 'android' : 'ios';

  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('contact_submissions').insert({
    first_name: 'App',
    last_name: 'Waitlist',
    email,
    phone: null,
    subject: 'App launch waitlist',
    message: `Notify this person when the Shape ${platform === 'ios' ? 'App Store' : 'Google Play'} link is ready.`,
    user_agent: req.headers.get('user-agent') || null,
  });

  if (error) {
    console.error('app waitlist insert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your email. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
