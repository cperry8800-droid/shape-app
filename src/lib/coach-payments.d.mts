// Types for coach-payments.mjs — the record of what members paid each coach. The module is plain JS
// so the test suite and the backfill script drive it; this file is what the webhook and routes type against.

export const COACH_PAYMENTS_TABLE: 'coach_payments';
export const STANDARD_FEE_BPS: number;
export const INVOICE_BILLING: Readonly<Record<string, 'first' | 'renewal' | 'adjustment'>>;
export const PAYMENT_PAGE: number;
export const PAYMENT_PAGES: number;

export type PaymentKind = 'plan' | 'booking' | 'meal_plan' | 'program';
export type PaymentBilling = 'first' | 'renewal' | 'adjustment' | 'one_off' | 'refund';

export type CoachPaymentRow = {
  stripe_object_id: string;
  stripe_object_type: 'invoice' | 'checkout_session' | 'refund';
  stripe_account_id: string | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id?: string | null;
  refund_of: string | null;
  client_id: string | null;
  provider_role: 'trainer' | 'nutritionist';
  provider_id: number;
  kind: PaymentKind;
  billing: PaymentBilling;
  gross_cents: number;
  shape_fee_cents: number;
  coach_net_cents: number;
  fee_bps: number | null;
  currency: string;
  paid_at: string;
};

export type PlanForPayment = {
  client_id?: string | null;
  provider_role?: string | null;
  provider_id?: number | string | null;
  fee_bps?: number | null;
  stripe_subscription_id?: string | null;
};

type DbError = { code?: string; message?: string } | null;
// The slice of a Supabase client these helpers use (the service role for writes, the caller's for reads).
type ClientLike = { from: (table: string) => any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (params: any, opts?: any) => PromiseLike<{ data: unknown[] }>;
type StripeLike = { refunds: { list: AnyFn }; invoicePayments?: { list: AnyFn } };

export function isoAt(v: unknown): string | null;
export function feeBpsOr(bps: unknown): number;
export function splitCents(gross: number, bps: unknown): { shape: number; coach: number };

export function invoicePaymentRow(
  invoice: unknown,
  plan: PlanForPayment | null | undefined,
  opts?: { account?: string | null; subscriptionId?: string | null; fallbackPaidAt?: number | string | null }
): CoachPaymentRow | null;

export function purchasePaymentRow(args: {
  sessionId: string;
  paymentIntentId?: string | null;
  account?: string | null;
  clientId?: string | null;
  providerRole: string | null | undefined;
  providerId: number | string | null | undefined;
  kind: string | null | undefined;
  grossCents: number;
  applicationFeeCents?: number | null;
  feeBps?: number | null;
  currency?: string | null;
  paidAt: number | string | null | undefined;
}): CoachPaymentRow | null;

export function refundRow(refund: unknown, payment: Partial<CoachPaymentRow> | null | undefined): CoachPaymentRow | null;

export function missingRelation(err: unknown): boolean;
export function savePayment(admin: ClientLike, row: CoachPaymentRow | null): Promise<{ ok: boolean; missing?: boolean; error?: unknown }>;
export function findPayment(
  admin: ClientLike,
  args: { account?: string | null; paymentIntentId?: string | null; invoiceId?: string | null }
): Promise<{ row: CoachPaymentRow | null; error: DbError }>;
export function recordRefunds(
  admin: ClientLike,
  stripe: StripeLike,
  charge: { id: string; payment_intent?: string | { id?: string } | null },
  opts?: { account?: string | null; opts?: unknown; invoiceId?: string | null }
): Promise<{ recorded: number; skipped: string | null }>;

export type EarningsSum = { grossCents: number; feeCents: number; netCents: number; refundedCents: number; payments: number };
export type Earnings = {
  zone: string;
  currency: 'usd';
  month: EarningsSum & { from: string; to: string };
  lifetime: EarningsSum & { since: string | null };
  otherCurrency: number;
};
export type EarningsPayload = ({ state: 'ready' } & Earnings) | { state: 'not_set_up' } | { state: 'unread' };

export function readCoachPayments(
  client: ClientLike,
  role: 'trainer' | 'nutritionist',
  providerId: number
): Promise<{ rows: CoachPaymentRow[]; state: 'ready' } | { rows: null; state: 'not_set_up' | 'unread'; error: unknown }>;
export function dayIn(at: number | string | null | undefined, zone: string | null | undefined): string | null;
export function earningsFrom(rows: Array<Partial<CoachPaymentRow>> | null | undefined, opts?: { zone?: string | null; now?: number }): Earnings;
export function coachEarnings(
  client: ClientLike,
  args: { role: 'trainer' | 'nutritionist'; providerId: number; zone?: string | null; now?: number }
): Promise<EarningsPayload>;
