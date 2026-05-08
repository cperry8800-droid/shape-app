export const REQUIRED_PROVIDER_EXPERIENCE_YEARS = 7;
export const DEFAULT_BACKGROUND_CHECK_PROVIDER = 'checkr';
export const BACKGROUND_CHECK_DETAIL_KEYS = [
  'background_check_provider',
  'background_check_required',
  'background_check_consent',
  'backgroundCheckConsent',
  'agreeBgCheck',
  'background_check_status',
  'background_check_requested_at',
  'background_check_completed_at',
  'background_check_report_id',
] as const;

export type BackgroundCheckStatus = 'consent_received' | 'requested' | 'needs_review' | 'clear';

export type BackgroundCheckInfo = {
  provider: string;
  status: BackgroundCheckStatus | 'missing_consent';
  consented: boolean;
  requestedAt: string;
  completedAt: string;
  reportId: string;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function textValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function minimumYears(value: string | null | undefined): number {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function isAffirmative(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return ['yes', 'true', '1', 'on', 'checked', 'accepted'].includes(value.trim().toLowerCase());
}

export function hasBackgroundCheckConsent(
  details: Record<string, unknown> | null | undefined,
  topLevel: Record<string, unknown> = {}
): boolean {
  const source = asRecord(details);
  const agreements = asRecord(source.agreements);
  return (
    isAffirmative(topLevel.backgroundCheckConsent) ||
    isAffirmative(source.backgroundCheckConsent) ||
    isAffirmative(source.background_check_consent) ||
    isAffirmative(source.agreeBgCheck) ||
    isAffirmative(agreements.background_check)
  );
}

export function backgroundCheckInfo(details: Record<string, unknown> | null | undefined): BackgroundCheckInfo {
  const source = asRecord(details);
  const consented = hasBackgroundCheckConsent(source);
  const rawStatus = textValue(source.background_check_status) as BackgroundCheckStatus | '';

  return {
    provider: textValue(source.background_check_provider) || DEFAULT_BACKGROUND_CHECK_PROVIDER,
    status: rawStatus || (consented ? 'consent_received' : 'missing_consent'),
    consented,
    requestedAt: textValue(source.background_check_requested_at),
    completedAt: textValue(source.background_check_completed_at),
    reportId: textValue(source.background_check_report_id),
  };
}

export function isBackgroundCheckClear(details: Record<string, unknown> | null | undefined): boolean {
  const info = backgroundCheckInfo(details);
  return info.consented && info.status === 'clear';
}

export function withBackgroundCheckDetails(
  details: Record<string, unknown>,
  status: BackgroundCheckStatus,
  timestamp?: string
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...details,
    background_check_provider: textValue(details.background_check_provider) || DEFAULT_BACKGROUND_CHECK_PROVIDER,
    background_check_required: true,
    background_check_consent: hasBackgroundCheckConsent(details),
    background_check_status: status,
  };

  if (!('background_check_requested_at' in next)) next.background_check_requested_at = null;
  if (!('background_check_completed_at' in next)) next.background_check_completed_at = null;
  if (!('background_check_report_id' in next)) next.background_check_report_id = null;
  if (status === 'requested') next.background_check_requested_at = timestamp ?? new Date().toISOString();
  if (status === 'clear') next.background_check_completed_at = timestamp ?? new Date().toISOString();

  return next;
}
