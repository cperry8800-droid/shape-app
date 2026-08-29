// Shape Mission Control — N.O.R.A.'s ops board. One screen, three answers:
// what's left before launch · what's in flight · is anything broken.
//
// Admin-gated, exactly like /warroom (which stays the deep archive this page
// reads from — /console duplicates zero computation, so the two can't drift).
// Design: docs/superpowers/specs/2026-07-27-mission-control-console-design.md

import { redirect } from 'next/navigation';
import { requireAdminUser } from '@/lib/admin-access';
import SentryUser from '@/components/SentryUser';
import { buildWarRoomSnapshot } from '@/lib/warroom';
import ConsoleClient from './ConsoleClient';

// Admin-only. requireAdminUser() below is the real gate; noindex is
// defence-in-depth (the /warroom pattern).
export const metadata = {
  title: 'Shape — Mission Control',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  let adminId = '';
  try {
    adminId = (await requireAdminUser()).id;
  } catch {
    redirect('/login?next=/console');
  }

  const snapshot = await buildWarRoomSnapshot();
  // ⚠ ID ONLY, and honestly so. requireAdminUser returns { id, email } — no
  // profile — so roles are absent rather than guessed, which is the canonical
  // module's own behaviour for an unresolved profile. Reading the profile row
  // just to enrich a crash report would add a query to every load of an
  // admin-only board.
  return (
    <>
      <SentryUser id={adminId} />
      <ConsoleClient initial={snapshot} />
    </>
  );
}
