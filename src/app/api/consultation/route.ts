// Consultation booking endpoint.
// Expects a Supabase table `consultation_bookings` with columns:
//   id uuid default gen_random_uuid() primary key
//   created_at timestamptz default now()
//   professional_name text not null
//   professional_type text not null check (professional_type in ('trainer','nutritionist'))
//   scheduled_date date not null
//   scheduled_time text not null
//   client_name text not null
//   client_email text not null
//   topic text
//   status text default 'pending'
// RLS: allow anon insert, select restricted to authenticated admins / matched professional.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function clean(v: unknown, max = 500): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const professionalName = clean(body.professionalName, 200);
  const professionalTypeRaw = clean(body.professionalType, 20).toLowerCase();
  const professionalType = professionalTypeRaw === 'nutritionist' ? 'nutritionist' : 'trainer';
  const date = clean(body.date, 20);
  const time = clean(body.time, 20);
  const clientName = clean(body.clientName, 200);
  const clientEmail = clean(body.clientEmail, 200).toLowerCase();
  const topic = clean(body.topic, 2000);

  if (!professionalName || !date || !time || !clientName || !clientEmail) {
    return NextResponse.json(
      { error: 'Professional, date, time, name, and email are required.' },
      { status: 400 }
    );
  }
  if (!isISODate(date)) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }
  if (!isEmail(clientEmail)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }
  const parsed = new Date(date + 'T00:00:00');
  if (parsed.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Cannot book a consultation in the past.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('consultation_bookings').insert({
    professional_name: professionalName,
    professional_type: professionalType,
    scheduled_date: date,
    scheduled_time: time,
    client_name: clientName,
    client_email: clientEmail,
    topic: topic || null,
  });

  if (error) {
    console.error('consultation_bookings insert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your booking. Please email info@theshapecommunity.com directly.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
