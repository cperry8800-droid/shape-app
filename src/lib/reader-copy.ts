// The language a notice's reader reads in, and their translator (memberTranslator.mjs over the app's
// own catalogs). One translator per language, built once per server instance and shared by the AI
// notify layer (notify-core), push dispatch and the preference-aware email (notify.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { makeMemberCopy, memberLocaleCode } from '@/lib/ai/memberTranslator.mjs';
import { MEMBER_HOME_CATALOGS } from '@/lib/ai/memberCatalogs';

export type Translate = (key: string, opts?: Record<string, unknown>) => string;
// `code` the catalog's language, `locale` the Intl locale times, dates and amounts are said in,
// `metric` the units preference (the AI layer's water line), `tr` the translator.
export type ReaderCopy = { code: string; locale: string; metric: boolean; tr: Translate };

export const copyFor = makeMemberCopy(MEMBER_HOME_CATALOGS) as (code: string, metric: boolean) => ReaderCopy;

// The account's stored language (user_goals 'app_locale', which the app writes at sign-in and on
// every change). A read that fails, or none stored, is English: the notice is said as written.
export async function readerCopy(client: SupabaseClient, userId: string): Promise<ReaderCopy> {
  try {
    const { data, error } = await client.from('user_goals').select('data').eq('user_id', userId).eq('kind', 'app_locale').maybeSingle();
    if (error) return copyFor('en', false);
    const doc = (data as { data?: unknown } | null)?.data;
    return copyFor(memberLocaleCode(doc && typeof doc === 'object' ? doc : null), false);
  } catch {
    return copyFor('en', false);
  }
}
