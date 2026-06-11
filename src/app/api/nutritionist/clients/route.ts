// Live client roster for the newdesign Nutritionist "Clients" page.
// See src/lib/coach-roster.ts for the shared implementation.
// Auth: cookie session OR Bearer token (the native coach app sends Bearer).

import { coachClientsResponse } from '@/lib/coach-roster';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return coachClientsResponse('nutritionist', request);
}
