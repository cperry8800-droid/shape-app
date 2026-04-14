// Browser-side Supabase client for Next.js.
// Use this in Client Components that need to call Supabase from the browser
// (e.g. forms, interactive filters, real-time subscriptions).

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
