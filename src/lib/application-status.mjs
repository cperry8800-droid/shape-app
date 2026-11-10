// Where a person's own coach application stands, for the app's Settings row and the status screen
// (owner, 2026-11-09: the application's doors "In Settings, with its status").
//
// Pure: the route reads the rows, this picks one and says its stage. It answers the stage and the
// dates only. Nothing the reviewer wrote (notes, the report id, who reviewed) leaves the server.
//
// Stages, in the order the applicant sees them:
//   submitted        the row is pending and no one has opened it
//   in_review        a reviewer has it (status in_review), and no background check is asked for yet
//   background_check the reviewer has asked for the check (admin_review.background_check requested
//                    or needs_review), still pending or in review
//   approved | not_approved | withdrawn   decided
// The reviewer's background-check record, as provider-applications.ts reads it (admin_review.background_check).
const record = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const checkStatus = (adminReview) => String(record(record(adminReview).background_check).status || '');

const OPEN = new Set(['pending', 'in_review']);

/** The stage of one application row. */
export function applicationStage(row) {
  const status = String(row?.status || '');
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'not_approved';
  if (status === 'withdrawn') return 'withdrawn';
  const check = checkStatus(row?.admin_review);
  if (OPEN.has(status) && (check === 'requested' || check === 'needs_review' || check === 'clear')) return 'background_check';
  if (status === 'in_review') return 'in_review';
  return 'submitted';
}

/**
 * The one application to show: an open one first (the newest), else the newest decided one.
 * A row is the person's when its address is their sign-in address, as approval matches an application
 * to an account. ⚠ NEVER BY details.user_id (Codex on #2667): /api/apply keeps the details a client
 * sends, so an id there is anyone's to write.
 */
export function pickApplication(rows, { email } = {}) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail) return null;
  const mine = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.email || '').trim().toLowerCase() === mail);
  if (!mine.length) return null;
  const newest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
  const open = mine.filter((r) => OPEN.has(String(r.status))).sort(newest);
  const row = open[0] || mine.slice().sort(newest)[0];
  return {
    role: row.provider_type === 'nutritionist' ? 'nutritionist' : 'trainer',
    stage: applicationStage(row),
    status: String(row.status || 'pending'),
    submittedAt: row.created_at || null,
    decidedAt: OPEN.has(String(row.status)) ? null : (row.reviewed_at || null),
  };
}
