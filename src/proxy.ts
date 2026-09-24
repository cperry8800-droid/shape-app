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
    // Stripe webhook (which needs the raw body untouched). Public website scripts,
    // styles and fonts never need a session lookup. Keep HTML and API paths
    // covered, including API parameters that happen to end in .js/.css.
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|(?:newdesign|vendor)/.*\\.(?:js|jsx|mjs|css|woff2?|ttf|otf)$|supabase\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
