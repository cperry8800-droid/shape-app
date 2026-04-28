// Supabase client for the iOS app. Reuses the same project as the web —
// auth sessions are scoped per-platform (different storage keys), but the
// underlying user_id and RLS rules are identical.
//
// Set these in mobile-app/.env (gitignored) when developing locally:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=sb_publishable_...
// On iOS device builds, Vite bakes them into the bundle at build time.

import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

// Capacitor's Preferences plugin persists across app launches and survives
// upgrades — much safer than localStorage on iOS, which can get evicted.
const capacitorStorage = {
  async getItem(key: string) {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async setItem(key: string, value: string) {
    await Preferences.set({ key, value });
  },
  async removeItem(key: string) {
    await Preferences.remove({ key });
  },
};

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    storage: capacitorStorage as never,
    storageKey: 'shape.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
