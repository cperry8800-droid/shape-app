// src/lib/platform-fee.mjs — framework-free platform-fee math (unit-tested).
//
// Single source of truth for Shape's fee on coach sales. Shape's standard rate is
// 15% (the coach receives 85%). Coach-brought (BYO) clients pay 0% Shape
// commission — origin attribution decides which rate applies, and the RESOLVED
// rate is stamped on the row as basis points at checkout. EVERY helper here is
// rate-aware (defaulting to the standard rate) so a BYO checkout can't, e.g.,
// still apply the 15% store-credit cap while charging a 0% fee — at rate 0 the
// credit cap computes to 0, which IS the no-credit rule falling out of the math.

/** Shape's standard commission on coach revenue (85% to the coach). */
export const PLATFORM_FEE_RATE = 0.15;
/** Coach-brought (BYO) clients: 0% Shape commission (owner-ruled 2026-07-21). */
export const BYO_FEE_RATE = 0;

// Basis-point ⇄ rate conversions defined ONCE (1500 bps = 15% = 0.15). Origin
// resolution stores fee_bps; Stripe takes application_fee_percent (bps/100) on a
// subscription and an absolute application_fee_amount (via feeSplit at bps/10000)
// on a payment. Nothing downstream re-derives a rate from `origin`.
/** basis points → fractional rate (1500 → 0.15). */
export function bpsToRate(bps) {
  return assertBps(bps) / 10000;
}
/** basis points → percent for Stripe's application_fee_percent (1500 → 15). */
export function bpsToPercent(bps) {
  return assertBps(bps) / 100;
}
/** fractional rate → basis points (0.15 → 1500). */
export function rateToBps(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`platform-fee: rate must be a finite number in [0,1] (got ${rate})`);
  }
  return Math.round(rate * 10000);
}

function assertBps(bps) {
  if (typeof bps !== 'number' || !Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error(`platform-fee: fee_bps must be an integer in [0,10000] (got ${bps})`);
  }
  return bps;
}

/**
 * Parse a fee_bps value arriving off the wire (Stripe session metadata) — STRICT,
 * failing closed to the standard 1500. `Number('')` is 0 in JS, so a naive
 * numeric guard would read an empty-string metadata value as a 0% commission;
 * only an explicit digit string ('0' included — a genuine stored BYO zero)
 * passes. Anything absent, empty, or malformed → 1500: fail toward Shape's fee,
 * never toward a free ride.
 */
export function parseFeeBpsMeta(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{1,5}$/.test(s)) return 1500;
  const n = Number(s);
  return n <= 10000 ? n : 1500;
}

// Money math must fail loudly on a bad upstream value rather than silently
// produce a wrong split. Validates a non-negative finite amount and normalizes
// to an integer number of cents.
function assertCents(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`platform-fee: ${label} must be a non-negative finite number (got ${value})`);
  }
  return Math.round(value);
}

/** The coach's cut: (1 − rate) of the GROSS price (rounded to the cent). */
export function coachCutCents(grossCents, rate = PLATFORM_FEE_RATE) {
  const gross = assertCents(grossCents, 'grossCents');
  return Math.round(gross * (1 - rate));
}

/**
 * The most store credit that can be applied while still leaving the charge ≥ the
 * coach's cut — i.e. Shape's fee fully absorbs the credit and no out-of-pocket
 * top-up is ever needed. Derived from the same rate as the split, so at the BYO
 * rate (0) this is 0: there is no Shape fee to absorb credit from, so store credit
 * does not apply — the honest rule, by the math, not a UI-only special case.
 */
export function maxCreditCents(grossCents, rate = PLATFORM_FEE_RATE) {
  const gross = assertCents(grossCents, 'grossCents');
  return gross - coachCutCents(gross, rate);
}

/**
 * Split a charge into Shape's application fee and any coach top-up, at the
 * resolved rate.
 *
 * @param {number} grossCents  the full list price (what the coach is paid (1−rate) of)
 * @param {number} [chargeCents] what the client is actually charged (gross minus any credit)
 * @param {number} [rate] the resolved fee rate (default = the standard rate)
 * @returns {{ applicationFeeCents: number, coachTopupCents: number }}
 *   - applicationFeeCents — kept by Shape on the destination charge (0 at rate 0).
 *   - coachTopupCents — how much the coach's cut exceeds the charge (0 in the live flows).
 */
export function feeSplit(grossCents, chargeCents = grossCents, rate = PLATFORM_FEE_RATE) {
  const gross = assertCents(grossCents, 'grossCents');
  const charge = assertCents(chargeCents, 'chargeCents');
  const coach = Math.round(gross * (1 - rate));
  return {
    applicationFeeCents: Math.max(0, charge - coach),
    coachTopupCents: Math.max(0, coach - charge),
  };
}
