// Single source of truth for Shape's platform fee on coach sales.
//
// Shape takes a flat 15% on coach revenue; the coach receives 85%. When a client
// redeems Shape store credit, SHAPE absorbs the discount — the coach is still
// paid 85% of the FULL (gross) price, and Shape's cut eats the credit. On a
// Stripe destination charge that means: keep `applicationFeeCents` on the charge,
// and if a large credit pushes the coach's cut above what's actually charged,
// pay the remainder (`coachTopupCents`) as a separate transfer from Shape's
// balance (see the checkout webhook).

export const PLATFORM_FEE_RATE = 0.15;

/** The coach's cut: 85% of the GROSS price (rounded to the cent). */
export function coachCutCents(grossCents: number): number {
  return Math.round(grossCents * (1 - PLATFORM_FEE_RATE));
}

/**
 * Split a charge into Shape's application fee and any coach top-up.
 *
 * @param grossCents  the full list price (what the coach is paid 85% of)
 * @param chargeCents what the client is actually charged (gross minus any credit)
 *
 * - `applicationFeeCents` — kept by Shape on the destination charge; the rest of
 *   the charge transfers to the coach. Never negative.
 * - `coachTopupCents` — when a credit makes the coach's 85%-of-gross cut exceed
 *   the charge, the charge can't cover it; Shape tops up this remainder via a
 *   separate transfer. Zero in the common (no/small credit) case.
 */
export function feeSplit(
  grossCents: number,
  chargeCents: number = grossCents
): { applicationFeeCents: number; coachTopupCents: number } {
  const coach = coachCutCents(grossCents);
  return {
    applicationFeeCents: Math.max(0, chargeCents - coach),
    coachTopupCents: Math.max(0, coach - chargeCents),
  };
}
