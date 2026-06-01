// Shape War Room — one screen for "where do we stand?".
//
// Admin-gated. Server-renders the first snapshot so it's useful even before
// JS hydrates; the client component then polls /api/warroom to keep the live
// service pings fresh and runs browser-side liveness checks on safe GET routes.

import { redirect } from 'next/navigation';
import { requireAdminUser } from '@/lib/admin-access';
import { buildWarRoomSnapshot } from '@/lib/warroom';
import WarRoomClient from './WarRoomClient';

// Admin-only. requireAdminUser() below is the real gate; noindex just keeps the
// URL out of search engines as defence-in-depth.
export const metadata = {
  title: 'Shape — War Room',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function WarRoomPage() {
  try {
    await requireAdminUser();
  } catch {
    redirect('/login?next=/warroom');
  }

  const snapshot = await buildWarRoomSnapshot();
  return <WarRoomClient initial={snapshot} />;
}
