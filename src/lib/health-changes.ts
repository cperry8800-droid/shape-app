// A member changed their health profile: tell every coach they have (owner, 2026-11-12: "any medication
// a client is on we want to be aware of for insurance and liability reasons", "and any other conditions
// that develop in the future"). Shape says what changed, never what it means: the coach reads it.
//
// Every listing with an open subscription from this member (OPEN_SUB_STATUSES, as is_coach_on_client
// counts it), one notice per coach (a coach with both listings is one person). The notice answers to the
// coach's "Health profile changes" switch (type `health_profile`) through createPreferredNotification,
// and its dedupe key is the save, so a retried save sends none. Never throws; returns how many were stored.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createPreferredNotification } from '@/lib/notify';
import { np, phrase } from '../../mobile-app/src/services/noticeCopy.mjs';
import { OPEN_SUB_STATUSES } from './coach-trajectory.mjs';

// The part names a coach reads in the English body (the catalog's body names no parts).
const PART_EN: Record<string, string> = {
  screening: 'the PAR-Q answers', medication: 'medication', glp1: 'GLP-1 medication', conditions: 'medical conditions',
  injuries: 'injuries or surgeries', pregnancy: 'pregnancy', allergies: 'allergies',
};
function listEn(parts: string[]): string {
  const names = parts.map((p) => PART_EN[p] || p);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function tellCoachesHealthChanged(
  admin: SupabaseClient,
  a: { clientId: string; parts: string[]; changedAt: string },
): Promise<number> {
  let told = 0;
  try {
    if (!a.clientId || !a.parts.length) return 0;
    const { data: subs, error } = await admin
      .from('subscriptions')
      .select('provider_role, provider_id')
      .eq('client_id', a.clientId)
      .in('status', OPEN_SUB_STATUSES);
    if (error) { console.warn('[health-changes] coaches read failed:', error.message); return 0; }
    const ids: Record<'trainer' | 'nutritionist', Set<number>> = { trainer: new Set(), nutritionist: new Set() };
    for (const s of (subs ?? []) as { provider_role?: string | null; provider_id?: number | string | null }[]) {
      const id = Number(s.provider_id);
      if ((s.provider_role === 'trainer' || s.provider_role === 'nutritionist') && Number.isFinite(id)) ids[s.provider_role].add(id);
    }
    const coaches: Array<{ ownerId: string; role: 'trainer' | 'nutritionist' }> = [];
    for (const role of ['trainer', 'nutritionist'] as const) {
      if (!ids[role].size) continue;
      const { data, error: listErr } = await admin.from(role === 'nutritionist' ? 'nutritionists' : 'trainers').select('owner_id').in('id', [...ids[role]]);
      if (listErr) { console.warn('[health-changes] listing read failed:', listErr.message); continue; }
      for (const p of (data ?? []) as { owner_id?: string | null }[]) {
        const ownerId = p.owner_id || null;
        if (!ownerId || ownerId === a.clientId || coaches.some((c) => c.ownerId === ownerId)) continue;
        coaches.push({ ownerId, role });
      }
    }
    if (!coaches.length) return 0;
    const { data: prof } = await admin.from('profiles').select('full_name').eq('id', a.clientId).maybeSingle();
    const name = String((prof as { full_name?: string | null } | null)?.full_name || '').trim();
    const shown = name || 'A client';
    const client = name || phrase('word.aClient');
    for (const c of coaches) {
      const ok = await createPreferredNotification(admin, {
        userId: c.ownerId,
        type: 'health_profile',
        title: `Health profile updated: ${shown}`,
        body: `${shown} updated ${listEn(a.parts)} in their health profile. Read it before you next program for them.`,
        route: 'client',
        data: { dedupe: `health:${a.clientId}:${a.changedAt}:${c.ownerId}`, clientId: a.clientId, providerRole: c.role, parts: a.parts },
      }, {
        title: np('client.health.title', { client }),
        body: np('client.health.body', { client }),
      });
      if (ok) told++;
    }
  } catch (err) {
    console.error('[health-changes] tellCoachesHealthChanged failed:', err instanceof Error ? err.message : err);
  }
  return told;
}
