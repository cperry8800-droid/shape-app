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

// ⚠ THE REVIEWER'S RECORD IS NOT THE APPLICANT'S `details`. `details` is whatever the applicant
// sent (the apply route sanitises its shape, not its meaning), so a background check "requested"
// or "completed", a report id, an `approved_provider` block or a list of document paths found
// there is the applicant's claim. The admin actions write their own record to the separate
// `provider_applications.admin_review` column (2026-10-12-coach-application-review.sql), which
// no applicant path writes, and the review console reads the check from there alone. Consent is
// the one background-check fact that IS the applicant's to give, so it is still read from
// `details` (the apply route refuses an application without it).
export type AdminBackgroundCheck = {
  provider: string;
  status: BackgroundCheckStatus;
  requested_at: string | null;
  completed_at: string | null;
  report_id: string | null;
  updated_at: string;
  updated_by: string;
};

const ADMIN_BACKGROUND_STATUSES: ReadonlySet<string> = new Set(['requested', 'needs_review', 'clear']);

/** The background check as an admin recorded it in `admin_review`, or an empty record. */
export function adminBackgroundCheck(adminReview: unknown): Record<string, unknown> {
  return asRecord(asRecord(adminReview).background_check);
}

/**
 * The background check as the review console shows it: consent from the applicant's `details`,
 * everything else from the admin's own record. `adminReview` is required on purpose, so a caller
 * cannot forget it and fall back to the applicant's word.
 */
export function backgroundCheckInfo(
  details: Record<string, unknown> | null | undefined,
  adminReview: unknown
): BackgroundCheckInfo {
  const consented = hasBackgroundCheckConsent(asRecord(details));
  const check = adminBackgroundCheck(adminReview);
  const rawStatus = textValue(check.status);
  const status = ADMIN_BACKGROUND_STATUSES.has(rawStatus)
    ? (rawStatus as BackgroundCheckStatus)
    : consented
      ? 'consent_received'
      : 'missing_consent';

  return {
    provider: textValue(check.provider) || DEFAULT_BACKGROUND_CHECK_PROVIDER,
    status,
    consented,
    requestedAt: textValue(check.requested_at),
    completedAt: textValue(check.completed_at),
    reportId: textValue(check.report_id),
  };
}

export function isBackgroundCheckClear(
  details: Record<string, unknown> | null | undefined,
  adminReview: unknown
): boolean {
  const info = backgroundCheckInfo(details, adminReview);
  return info.consented && info.status === 'clear';
}

/** The next `admin_review` after an admin marks the background check `status`. */
export function withAdminBackgroundCheck(
  adminReview: unknown,
  status: Exclude<BackgroundCheckStatus, 'consent_received'>,
  adminId: string,
  timestamp: string
): Record<string, unknown> {
  const current = asRecord(adminReview);
  const prev = adminBackgroundCheck(current);
  const next: AdminBackgroundCheck = {
    provider: textValue(prev.provider) || DEFAULT_BACKGROUND_CHECK_PROVIDER,
    status,
    requested_at: textValue(prev.requested_at) || null,
    completed_at: textValue(prev.completed_at) || null,
    report_id: textValue(prev.report_id) || null,
    updated_at: timestamp,
    updated_by: adminId,
  };
  // A new request opens the screening again: the last one's completion no longer applies.
  if (status === 'requested') {
    next.requested_at = timestamp;
    next.completed_at = null;
  }
  if (status === 'clear') next.completed_at = timestamp;
  return { ...current, background_check: next };
}

// Keys of `details` the review card does not list as application answers: the documents (shown
// as links), the consent and check keys (shown in the background-check panel) and an
// `approved_provider` block, which only the admin's record can carry now.
export const REVIEW_HIDDEN_DETAIL_KEYS: readonly string[] = [
  'documents',
  'approved_provider',
  ...BACKGROUND_CHECK_DETAIL_KEYS,
  // The experience answers have their own panel on the review card.
  'experience_history',
  'experience_type',
  'experience_notes',
  'experience_standard_years',
  'meets_experience_preference',
  'professional_minimum_years',
];

/**
 * The reviewer-only fields an applicant put in `details` anyway: an `approved_provider` block or a
 * background check marked requested, completed or reported. Ignored everywhere; listed so the
 * review card can say so.
 */
export function applicantSuppliedReviewKeys(details: Record<string, unknown> | null | undefined): string[] {
  const source = asRecord(details);
  const keys: string[] = [];
  if (source.approved_provider != null) keys.push('approved_provider');
  for (const key of ['background_check_requested_at', 'background_check_completed_at', 'background_check_report_id']) {
    if (textValue(source[key])) keys.push(key);
  }
  return keys;
}

export type ApplicationDocument = { kind: string; name: string; path: string };

/** Every document an application's `details` names (the applicant's list, unchecked). */
export function listApplicationDocuments(details: Record<string, unknown> | null | undefined): ApplicationDocument[] {
  const source = asRecord(details);
  const docs: ApplicationDocument[] = [];
  const rawDocs = source.documents;
  if (Array.isArray(rawDocs)) {
    for (const doc of rawDocs) {
      if (!doc || typeof doc !== 'object') continue;
      const item = doc as Record<string, unknown>;
      const path = typeof item.path === 'string' ? item.path : '';
      if (!path) continue;
      docs.push({
        kind: typeof item.kind === 'string' ? item.kind.slice(0, 60) : 'document',
        name: typeof item.name === 'string' ? item.name.slice(0, 160) : path.split('/').pop() || 'Document',
        path,
      });
    }
  }
  // The legacy root signup pages' keys.
  for (const key of ['resume_path', 'certProof_path', 'insuranceDoc_path', 'samplePlan_path']) {
    const path = source[key];
    if (typeof path === 'string' && path) {
      docs.push({ kind: key.replace('_path', ''), name: path.split('/').pop() || key, path });
    }
  }
  return docs;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⚠ WHETHER THE REVIEW CONSOLE MAY SIGN `path` FOR THIS APPLICATION. The console signs with the
 * service role, so any path it is handed opens any object in the private provider-credentials
 * bucket. Only the two prefixes a real submission writes are accepted:
 *   · `website/<applicationId>/…` — /api/apply uploads under the id of the row it just inserted;
 *   · `<applicantUid>/…` — the installed app uploads under the signed-in member's id, and the
 *     caller passes the uid of the auth account whose email IS the application's email (so an
 *     applicant cannot name somebody else's folder by naming their id).
 * Anything else, or anything with an empty, `.` or `..` segment, a backslash or a control
 * character, is refused.
 */
export function applicationDocumentPathAllowed(
  path: unknown,
  applicationId: string,
  applicantUid: string | null
): boolean {
  if (typeof path !== 'string' || !path || path.length > 600) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  if (UUID_RE.test(applicationId) && segments.length >= 3 && segments[0] === 'website' && segments[1] === applicationId) {
    return true;
  }
  if (applicantUid && UUID_RE.test(applicantUid) && segments.length >= 2 && segments[0] === applicantUid) {
    return true;
  }
  return false;
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
