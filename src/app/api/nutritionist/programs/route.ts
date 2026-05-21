// Live meal-plan templates for the newdesign Nutritionist "Plans" page.
// Read-only over coach_program_templates (+ assignment counts). RLS scopes
// every row to the signed-in owner. Per-plan "sold" / playlist metrics are
// intentionally absent — nothing in the schema tracks them.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: nutriRow } = await supabase
    .from('nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!nutriRow) {
    return NextResponse.json({ isNutritionist: false, programs: [] });
  }

  const { data: tplRows } = await supabase
    .from('coach_program_templates')
    .select(
      'id, title, goal, level, duration_weeks, days_per_week, status, source, marketplace_listed, marketplace_price_cents'
    )
    .eq('owner_id', user.id)
    .eq('provider_role', 'nutritionist')
    .order('updated_at', { ascending: false })
    .limit(100);

  const templates = tplRows ?? [];

  const countByTemplate = new Map<string, number>();
  if (templates.length) {
    const { data: asnRows } = await supabase
      .from('coach_program_assignments')
      .select('program_template_id, status')
      .eq('owner_id', user.id)
      .in(
        'program_template_id',
        templates.map((t) => t.id)
      );
    for (const a of asnRows ?? []) {
      if (a.status === 'completed' || a.status === 'archived') continue;
      countByTemplate.set(
        a.program_template_id,
        (countByTemplate.get(a.program_template_id) ?? 0) + 1
      );
    }
  }

  const programs = templates.map((t) => ({
    id: t.id,
    title: t.title,
    goal: t.goal ?? '',
    level: t.level ?? '',
    durationWeeks: t.duration_weeks ?? null,
    daysPerWeek: t.days_per_week ?? null,
    status: t.status ?? 'draft',
    source: t.source ?? 'manual',
    priceCents: t.marketplace_listed ? t.marketplace_price_cents ?? 0 : null,
    clients: countByTemplate.get(t.id) ?? 0,
  }));

  return NextResponse.json({ isNutritionist: true, programs });
}
