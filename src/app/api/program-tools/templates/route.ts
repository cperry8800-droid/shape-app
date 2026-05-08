import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanText } from '@/lib/request-utils';

export const runtime = 'nodejs';

type ProviderRole = 'trainer' | 'nutritionist';

type ProgramTemplateBody = {
  providerRole?: ProviderRole;
  providerId?: number;
  title?: string;
  goal?: string;
  level?: string;
  durationWeeks?: number;
  daysPerWeek?: number;
  source?: 'manual' | 'ai_generated' | 'imported';
  prompt?: string;
  draft?: unknown;
  weekBoard?: unknown;
  autoAdjustRules?: unknown;
  progressionRules?: unknown;
  nutritionTargets?: unknown;
  marketplace?: {
    list?: boolean;
    priceDollars?: string;
  };
  clientAssignments?: Array<{
    clientId?: string;
    weightOverride?: string;
  }>;
};

function normalizeProviderRole(value: unknown): ProviderRole | null {
  return value === 'trainer' || value === 'nutritionist' ? value : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in before saving program drafts.' }, { status: 401 });
  }

  let body: ProgramTemplateBody;
  try {
    body = (await request.json()) as ProgramTemplateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const providerRole = normalizeProviderRole(body.providerRole);
  const providerId = Number(body.providerId || 0);
  const title = cleanText(body.title, 160) || 'Untitled program';
  const marketplacePriceCents = Math.max(0, Math.round(Number(body.marketplace?.priceDollars || 0) * 100));
  const marketplaceListed = Boolean(body.marketplace?.list);
  const clientAssignments = Array.isArray(body.clientAssignments)
    ? body.clientAssignments
        .map((assignment) => ({
          client_id: cleanText(assignment.clientId, 80),
          weight_override: cleanText(assignment.weightOverride, 120),
        }))
        .filter((assignment) => assignment.client_id)
    : [];

  if (!providerRole || !providerId) {
    return NextResponse.json({ error: 'Select a linked trainer or nutritionist profile.' }, { status: 400 });
  }

  const providerTable = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider, error: providerError } = await supabase
    .from(providerTable)
    .select('id')
    .eq('id', providerId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (providerError) {
    return NextResponse.json({ error: providerError.message }, { status: 500 });
  }

  if (!provider) {
    return NextResponse.json({ error: 'That provider profile is not linked to your account.' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('coach_program_templates')
    .insert({
      owner_id: user.id,
      provider_id: providerId,
      provider_role: providerRole,
      title,
      goal: cleanText(body.goal, 220),
      level: cleanText(body.level, 80),
      duration_weeks: Math.max(1, Math.min(52, Number(body.durationWeeks || 4))),
      days_per_week: Math.max(1, Math.min(7, Number(body.daysPerWeek || 4))),
      source: body.source === 'ai_generated' || body.source === 'imported' ? body.source : 'manual',
      auto_adjust_rules: Array.isArray(body.autoAdjustRules) ? { rules: body.autoAdjustRules } : {},
      progression_rules: Array.isArray(body.progressionRules) ? body.progressionRules : [],
      nutrition_targets: body.nutritionTargets && typeof body.nutritionTargets === 'object' ? body.nutritionTargets : {},
      marketplace_listed: marketplaceListed,
      marketplace_price_cents: marketplaceListed ? marketplacePriceCents : null,
      marketplace_status: marketplaceListed ? 'pending_review' : 'not_listed',
      payload: {
        prompt: cleanText(body.prompt, 2000),
        draft: body.draft ?? null,
        weekBoard: body.weekBoard ?? null,
        progressionRules: body.progressionRules ?? [],
        nutritionTargets: body.nutritionTargets ?? {},
        marketplace: body.marketplace ?? { list: false },
      },
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (clientAssignments.length > 0) {
    const { error: assignmentError } = await supabase.from('coach_program_assignments').insert(
      clientAssignments.map((assignment) => ({
        program_template_id: data.id,
        owner_id: user.id,
        client_id: assignment.client_id,
        provider_id: providerId,
        provider_role: providerRole,
        weight_override: assignment.weight_override,
        payload: {
          title,
          daysPerWeek: Math.max(1, Math.min(7, Number(body.daysPerWeek || 4))),
        },
      }))
    );

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: data.id, assignments: clientAssignments.length });
}
