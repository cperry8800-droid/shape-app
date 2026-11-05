// Types for plan-cancellation.mjs — a coach plan's cancellation on its subscriptions row.

export const MEMBER_REASON_MAX: number;
export const CANCELLATION_COLUMNS: readonly string[];

export type CancellationPatch = {
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  cancellation_reason: string | null;
  cancellation_feedback: string | null;
  cancellation_comment: string | null;
};

export type CancellableRow = {
  cancel_at_period_end?: boolean | null;
  cancel_at?: string | null;
  current_period_end?: string | null;
  member_cancel_reason?: string | null;
  cancellation_comment?: string | null;
};

export function memberReason(raw: unknown): string | null;
export function cancellationPatch(sub: {
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  canceled_at?: number | null;
  ended_at?: number | null;
  cancellation_details?: { reason?: string | null; feedback?: string | null; comment?: string | null } | null;
} | null | undefined): CancellationPatch;
export function withoutCancellation<T extends Record<string, unknown>>(patch: T): Partial<T>;
export function cancellationLands(storedAt: unknown, eventSec: number, final?: boolean): boolean;
export function planEndsAt(row: CancellableRow | null | undefined): string | null;
export function planEndingOf(rows: Array<CancellableRow | null | undefined> | null | undefined): { planEnding: boolean | null; planEndsAt: string | null };
export function churnReason(row: CancellableRow | null | undefined): string | null;
