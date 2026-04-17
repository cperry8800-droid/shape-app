// Contact form submission endpoint.
// Expects a Supabase table `contact_submissions` with columns:
//   id uuid default gen_random_uuid() primary key
//   created_at timestamptz default now()
//   first_name text not null
//   last_name text not null
//   email text not null
//   phone text
//   subject text
//   message text not null
//   user_agent text
//   status text default 'new'
// RLS: allow anon insert, select restricted to authenticated admins.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_FIELD = 5000;

function clean(v: unknown, max = 500): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

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

  const firstName = clean(body.firstName, 100);
  const lastName = clean(body.lastName, 100);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const subject = clean(body.subject, 100);
  const message = clean(body.message, MAX_FIELD);

  if (!firstName || !lastName || !email || !message) {
    return NextResponse.json(
      { error: 'First name, last name, email, and message are required.' },
      { status: 400 }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('contact_submissions').insert({
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    subject: subject || null,
    message,
    user_agent: req.headers.get('user-agent') || null,
  });

  if (error) {
    console.error('contact_submissions insert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your message. Please email hello@shape.app directly.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
