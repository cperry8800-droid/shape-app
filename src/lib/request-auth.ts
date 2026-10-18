// Auth for the mobile-bridge API routes.
//
// These endpoints accept EITHER a Supabase cookie session OR a Bearer access
// token: the native app sends `Authorization: Bearer <token>`, while the
// `/m/` web build relies on the SSR cookie. Roughly two dozen route handlers
// each carried a byte-identical copy of the two helpers below; they now live
// here. Behavior is unchanged — `currentUser` still resolves through
// `clientForRequest`, exactly as the inlined copies did.

import { createClient as createSupabaseClient, type AuthError, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/** Supabase client scoped to the request — Bearer-token client if present, else the cookie/SSR client. */
export async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

/** The signed-in user for the request (Bearer or cookie), or null if unauthenticated. */
export async function currentUser(request: Request): Promise<User | null> {
  return (await userLookupForRequest(request)).user;
}

/**
 * The same lookup, with the auth server's error kept. getUser() answers an outage (a dead network,
 * an auth-server 5xx) with a null user too, so a route that must tell "signed out" from "couldn't
 * check" reads `error` with isMeasuredSignedOut (src/lib/auth-lookup.ts).
 */
export async function userLookupForRequest(request: Request): Promise<{ user: User | null; error: AuthError | null }> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const client = await clientForRequest(request);
    const { data, error } = await client.auth.getUser(bearer[1]);
    return { user: data.user ?? null, error };
  }
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return { user: data.user ?? null, error };
}
