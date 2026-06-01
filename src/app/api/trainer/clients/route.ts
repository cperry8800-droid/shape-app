// Live client roster for the newdesign Trainer "Clients" page.
// See src/lib/coach-roster.ts for the shared implementation.

import { coachClientsResponse } from '@/lib/coach-roster';

export const dynamic = 'force-dynamic';

export async function GET() {
  return coachClientsResponse('trainer');
}
