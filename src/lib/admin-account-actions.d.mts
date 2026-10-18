import type { StaffLevel } from './staff-levels.mjs';

export type AccountAction = 'view' | 'freeze' | 'unfreeze' | 'handle_request' | 'suspend_listing' | 'lift_listing' | 'remove';
export type AccountRefusal = '' | 'self' | 'owner' | 'staff';
export type RequestOutcome = 'done' | 'declined';

export const ACCOUNT_ACTION_LEVELS: Readonly<Record<AccountAction, StaffLevel>>;
export function canDoAccountAction(level: StaffLevel | null | undefined, action: AccountAction): boolean;
export function accountRefusal(input: {
  actorId?: string | null;
  actorLevel?: StaffLevel | null;
  targetId?: string | null;
  targetEmail?: string | null;
  ownerEmails?: ReadonlyArray<string>;
  targetStaffLevel?: StaffLevel | null;
}): AccountRefusal;
export const REASON_MIN: number;
export const REASON_MAX: number;
export function cleanReason(value: unknown): string;
export function confirmsRemoval(typed: unknown, account: { id?: string | null; email?: string | null }): boolean;
export const BILLING_STATUSES: ReadonlyArray<string>;
/** account: an acct_ id (a coach's own account), null (the platform), undefined (not known). */
export type SubscriptionToCancel = { id: string; account: string | null | undefined };
export function subscriptionsToCancel(
  rows: ReadonlyArray<{ stripe_subscription_id?: string | null; status?: string | null; stripe_account_id?: string | null }> | null | undefined
): SubscriptionToCancel[];
export function cancelSubscriptions(
  stripe: {
    subscriptions: {
      cancel(id: string, params?: undefined, opts?: { stripeAccount: string }): Promise<unknown>;
      retrieve(id: string, params?: undefined, opts?: { stripeAccount: string }): Promise<{ status?: string } | unknown>;
    };
  },
  items: ReadonlyArray<SubscriptionToCancel | string>
): Promise<{ cancelled: string[]; failed: string[] }>;
export const REQUEST_OUTCOMES: ReadonlyArray<RequestOutcome>;
export function parseRequestOutcome(value: unknown): RequestOutcome | '';
export function cleanNote(value: unknown): string;
