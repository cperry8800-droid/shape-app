// Single source of truth for Shape's platform fee on coach sales.
//
// Shape takes a flat 15% on coach revenue; the coach receives 85%. When a client
// redeems Shape store credit, SHAPE absorbs the discount — the coach is still
// paid 85% of the FULL (gross) price. Callers cap the redeemable credit at
// Shape's 15% cut (see checkout-session), so the charge always covers the coach's
// cut and `coachTopupCents` is 0 in the live flows; the field is kept so the
// split is correct and self-describing for any (gross, charge) pair.

export const PLATFORM_FEE_RATE = 0.15;

// Money math must fail loudly on a bad upstream value rather than silently
// produce a wrong split. Validates a non-negative finite amount and normalizes
// to an integer number of cents.
function assertCents(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`platform-fee: ${label} must be a non-negative finite number (got ${value})`);
  }
  return Math.round(value);
}

/** The coach's cut: 85% of the GROSS price (rounded to the cent). */
export function coachCutCents(grossCents: number): number {
  const gross = assertCents(grossCents, 'grossCents');
  return Math.round(gross * (1 - PLATFORM_FEE_RATE));
}

/**
 * The most store credit that can be applied to a coach purchase while still
 * leaving the charge ≥ the coach's cut — i.e. Shape's fee fully absorbs the
 * credit and no out-of-pocket top-up is ever needed. Derived from the same
 * `coachCutCents` as the split, so it tracks `PLATFORM_FEE_RATE` and can't drift
 * from a hardcoded percentage.
 */
export function maxCreditCents(grossCents: number): number {
  const gross = assertCents(grossCents, 'grossCents');
  return gross - coachCutCents(gross);
}

/**
 * Split a charge into Shape's application fee and any coach top-up.
 *
 * @param grossCents  the full list price (what the coach is paid 85% of)
 * @param chargeCents what the client is actually charged (gross minus any credit)
 *
 * - `applicationFeeCents` — kept by Shape on the destination charge; the rest of
 *   the charge transfers to the coach. Never negative.
 * - `coachTopupCents` — the amount by which the coach's 85%-of-gross cut exceeds
 *   the charge. Zero whenever the charge covers the coach's cut (which the
 *   call-site credit cap guarantees).
 */
export function feeSplit(
  grossCents: number,
  chargeCents: number = grossCents
): { applicationFeeCents: number; coachTopupCents: number } {
  const gross = assertCents(grossCents, 'grossCents');
  const charge = assertCents(chargeCents, 'chargeCents');
  const coach = Math.round(gross * (1 - PLATFORM_FEE_RATE));
  return {
    applicationFeeCents: Math.max(0, charge - coach),
    coachTopupCents: Math.max(0, coach - charge),
  };
}
