'use client';

// BYO rails (#1794): the legacy checkout forms (/subscribe · /purchase) feed
// the coach-referral token to their server actions, which hand it to
// resolveCoachCheckoutOrigin as the checkout-time last-resort bind. Value
// resolution mirrors public/supabase.js ShapeCoachRef — the URL's ?ref= first
// (a ref-tagged link pointing straight here), else the localStorage capture
// written on the coach's profile page. Client storage is a courtesy: the
// server re-validates token + provider + window regardless, so a stale or
// hand-edited value can only ever resolve marketplace.

import { useEffect, useState } from 'react';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // hygiene mirror of the 30-day window

export default function CoachRefField({ initial }: { initial?: string | null }) {
  const [token, setToken] = useState(
    initial && UUID_RE.test(initial) ? initial.toLowerCase() : ''
  );
  useEffect(() => {
    if (token) return;
    try {
      const raw = localStorage.getItem('shape.coachRef');
      if (!raw) return;
      const v = JSON.parse(raw) as { token?: string; at?: number } | null;
      if (v?.token && UUID_RE.test(v.token) && v.at && Date.now() - v.at <= TTL_MS) {
        setToken(v.token.toLowerCase());
      }
    } catch {
      /* no stored ref */
    }
  }, [token]);
  if (!token) return null;
  return <input type="hidden" name="ref" value={token} />;
}
