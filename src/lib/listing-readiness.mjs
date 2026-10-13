// Why a coach's own listing is not in the marketplace, step by step: the same three conditions
// as provider_listing_ready_row (supabase-migrations/2026-10-12-coach-listing-ready.sql), read
// back to the coach. tests/coach-listing-status.test.mjs holds the two to one rule.
//
// Pure: no I/O.

/** The steps, in the order a coach is told them. */
export const LISTING_STEPS = ['price', 'payouts', 'photo'];

// btrim with no characters given strips spaces only, so a JavaScript trim (which also strips tabs
// and newlines) would call a photo missing that the database counts.
const blank = (value) => String(value ?? '').replace(/^ +| +$/g, '') === '';

/** The steps a listing still needs: a monthly price above zero, active payouts and a photo. */
export function listingMissing({ price, stripeAccountStatus, portrait, avatar } = {}) {
  const missing = [];
  if (!(Number(price ?? 0) > 0)) missing.push('price');
  if (String(stripeAccountStatus ?? '') !== 'active') missing.push('payouts');
  if (blank(portrait) && blank(avatar)) missing.push('photo');
  return missing;
}

// The rates a coach sets: dollars with at most two decimals, the listing's numeric(10,2).
const MAX_RATE = 100_000;

/** A rate as typed, in dollars, or null when it is not one (empty, zero, negative, too large). */
export function parseRate(value) {
  const text = String(value ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n < MAX_RATE ? n : null;
}
