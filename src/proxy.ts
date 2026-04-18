// Next 16 proxy (formerly middleware). Refreshes the Supabase session on
// every non-static request so server components can rely on getUser().
// Also forwards the request pathname as a header so server components
// (Nav, Footer) can decide whether to render based on the current route.

import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, common image files, and the
    // Stripe webhook (which needs the raw body untouched).
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
