// Single source of truth for Shape's platform fee on coach sales. The math lives
// in the framework-free, unit-tested ./platform-fee.mjs; this re-exports it with
// types so app code imports `@/lib/platform-fee` unchanged.
//
// Shape takes 15% on coach revenue (coach receives 85%); coach-brought (BYO)
// clients pay 0% (owner-ruled 2026-07-21). The RESOLVED rate is stamped on the
// row as fee_bps at checkout — see src/lib/coach-origin.ts. When a client redeems
// Shape store credit, SHAPE absorbs the discount (the coach is still paid on the
// FULL gross); callers cap the credit at Shape's cut, so the charge always covers
// the coach's cut and `coachTopupCents` is 0 in the live flows.

export {
  PLATFORM_FEE_RATE,
  BYO_FEE_RATE,
  bpsToRate,
  bpsToPercent,
  rateToBps,
  coachCutCents,
  maxCreditCents,
  feeSplit,
} from './platform-fee.mjs';
