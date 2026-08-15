// Server-side Supabase client for Next.js App Router.
// Use this in Server Components, Server Actions, and Route Handlers.
// It reads/writes auth cookies so server-rendered pages know who the user is.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { applyShapeCookieOptions } from './cookie-options';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // Policy applied at the WRITE, not via cookieOptions — the SDK
            // overwrites a configured maxAge with its 400-day default.
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, applyShapeCookieOptions(options))
            );
          } catch {
            // setAll called from a Server Component — safe to ignore if
            // middleware is refreshing sessions.
          }
        },
      },
    }
  );
}
