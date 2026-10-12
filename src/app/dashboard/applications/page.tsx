import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminEmails, requireAdminUser } from '@/lib/admin-access';
import { ageFromDob } from '@/lib/age-derive.mjs';
import {
  REVIEW_HIDDEN_DETAIL_KEYS,
  applicantSuppliedReviewKeys,
  applicationDocumentPathAllowed,
  asRecord,
  backgroundCheckInfo,
  listApplicationDocuments,
  textValue,
} from '@/lib/provider-applications';
import {
  approveApplication,
  markApplicationInReview,
  markBackgroundCheckClear,
  markBackgroundCheckNeedsReview,
  markBackgroundCheckRequested,
  rejectApplication,
} from './actions';

export const metadata = { title: 'Applications - Shape' };
export const dynamic = 'force-dynamic';

type ApplicationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';

const STATUSES: ApplicationStatus[] = ['pending', 'in_review', 'approved', 'rejected', 'withdrawn'];
const PAGE_SIZE = 50;
// The details shown before "Show all": every field is on the card, the rest behind one click.
const DETAILS_SHOWN_FIRST = 12;

type ApplicationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  provider_type: 'trainer' | 'nutritionist';
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  specialty: string | null;
  years_experience: string | null;
  monthly_price: string | null;
  dob?: string | null;
  details: Record<string, unknown> | null;
  status: ApplicationStatus;
  reviewed_at: string | null;
  review_notes: string | null;
  /** The reviewer's own record (2026-10-12). Absent until that migration runs. */
  admin_review?: Record<string, unknown> | null;
};

type DocumentLink = {
  kind: string;
  name: string;
  path: string;
  url: string | null;
  /** The path is outside what this application's own submission wrote, so it was not signed. */
  blocked: boolean;
};

const NOTICES: Record<string, string> = {
  already_approved:
    'This application is already approved. Approving again would overwrite the coach’s own listing, so nothing was changed.',
  locked_approved:
    'This application is approved and its coach is live, so its review and background-check status are locked. Nothing was changed.',
  reject_approved:
    'This coach is already live. Rejecting the application would not take their listing down, so nothing was changed. Taking a live coach off the marketplace needs a “Suspend listing” action, which is not built yet.',
  already_rejected: 'This application is already rejected. Mark it in review to reopen it.',
  already_decided: 'This application was decided a moment ago by another review. Nothing was changed.',
  approval_in_progress:
    'Another Approve on this application started a moment ago and may still be setting up the coach, so nothing was done. Reload in a minute: it will show as approved, or, if that approval failed, you can approve it again.',
  approval_conflict:
    'This application changed while it was being approved (another Approve, or another review action), so nothing was provisioned. Reload it and approve again if it still needs it.',
};

function emailNotice(email: string | undefined, account: string | undefined): { ok: boolean; text: string } | null {
  if (!email) return null;
  if (email === 'sent') {
    return {
      ok: true,
      text:
        account === 'new'
          ? 'The applicant was emailed a link to set their password.'
          : account === 'existing'
            ? 'The applicant was emailed; they sign in with the account they already have.'
            : 'The applicant was emailed.',
    };
  }
  const why = email === 'email_not_configured' ? 'email is not configured (RESEND_API_KEY)' : `the send failed (${email})`;
  const recover =
    account === 'new'
      ? ' Tell them yourself: they can set a password with Forgot password on the sign-in page, using the email they applied with.'
      : ' Tell them yourself.';
  return { ok: false, text: `The applicant was NOT emailed: ${why}.${recover}` };
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${displayValue(v) || '—'}`)
      .join(' · ');
  }
  return String(value);
}

/** The applicant's auth account id, by the email they applied with (the sign-in identity). */
async function accountIdForEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('admin_account_by_email', { p_email: email });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as { id?: unknown } | null;
    return typeof row?.id === 'string' ? row.id : null;
  } catch {
    return null;
  }
}

async function signedDocumentLinks(rows: ApplicationRow[]): Promise<Map<string, DocumentLink[]>> {
  const admin = createAdminClient();
  const result = new Map<string, DocumentLink[]>();
  const uidByEmail = new Map<string, string | null>();

  for (const row of rows) {
    const docs = listApplicationDocuments(asRecord(row.details));
    // Only an app-path document (`<uid>/…`) needs the applicant's account id; look it up once per email.
    let applicantUid: string | null = null;
    if (docs.some((doc) => !doc.path.startsWith('website/'))) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!uidByEmail.has(email)) uidByEmail.set(email, email ? await accountIdForEmail(admin, email) : null);
      applicantUid = uidByEmail.get(email) ?? null;
    }
    const links: DocumentLink[] = [];
    for (const doc of docs) {
      // ⚠ SIGN ONLY WHAT THIS APPLICATION UPLOADED. The service role signs any path in the
      // private bucket, and the document list is the applicant's to write.
      if (!applicationDocumentPathAllowed(doc.path, row.id, applicantUid)) {
        links.push({ ...doc, url: null, blocked: true });
        continue;
      }
      const { data, error } = await admin.storage.from('provider-credentials').createSignedUrl(doc.path, 60 * 15);
      links.push({ ...doc, url: error ? null : data.signedUrl, blocked: false });
    }
    result.set(row.id, links);
  }

  return result;
}

function statusClass(status: ApplicationStatus): string {
  if (status === 'approved') return 'border-teal-400/40 bg-teal-400/10 text-teal-200';
  if (status === 'rejected') return 'border-red-400/40 bg-red-400/10 text-red-200';
  if (status === 'in_review') return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
  return 'border-neutral-700 bg-neutral-900 text-neutral-300';
}

function backgroundClass(status: string): string {
  if (status === 'clear') return 'border-teal-400/40 bg-teal-400/10 text-teal-200';
  if (status === 'needs_review' || status === 'missing_consent') return 'border-red-400/40 bg-red-400/10 text-red-200';
  if (status === 'requested') return 'border-blue-400/40 bg-blue-400/10 text-blue-200';
  return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; updated?: string; notice?: string; email?: string; account?: string; page?: string }>;
}) {
  try {
    await requireAdminUser();
  } catch {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const status = params?.status;
  const validStatus = (STATUSES as string[]).includes(status ?? '') ? (status as ApplicationStatus) : null;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params?.page ?? '1', 10) || 1));
  const from = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  let query = admin
    .from('provider_applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (validStatus) query = query.eq('status', validStatus);

  // ⚠ THE COUNTS ARE THE TABLE'S, NOT THE PAGE'S. They were tallied over the 100 rows the page
  // had fetched, so past 100 applications a filter's count (and every older pending
  // application) silently fell off the screen.
  const [{ data, error, count: shownTotal }, ...statusCounts] = await Promise.all([
    query,
    ...STATUSES.map((s) =>
      admin.from('provider_applications').select('id', { count: 'exact', head: true }).eq('status', s)
    ),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as ApplicationRow[];
  const docLinks = await signedDocumentLinks(rows);
  const counts: Record<string, number> = {};
  STATUSES.forEach((s, i) => {
    counts[s] = statusCounts[i]?.count ?? 0;
  });
  const total = shownTotal ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (validStatus) q.set('status', validStatus);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `/dashboard/applications?${s}` : '/dashboard/applications';
  };
  const notice = params?.notice ? NOTICES[params.notice] : null;
  const mailNotice = emailNotice(params?.email, params?.account);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-teal-400">Admin</div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-light tracking-tight">Provider applications</h2>
            <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
              Review trainer and nutritionist applications, open credential uploads, and publish approved applicants to the live marketplace.
            </p>
          </div>
          <div className="text-xs text-neutral-500 max-w-sm">
            Admin emails: {getAdminEmails().join(', ')}
          </div>
        </div>
      </section>

      {params?.updated && (
        <div className="rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-200 text-sm px-4 py-3">
          Application updated: {params.updated.replace('_', ' ')}.
        </div>
      )}
      {mailNotice && (
        <div
          className={`rounded-lg border text-sm px-4 py-3 ${
            mailNotice.ok ? 'border-teal-400/30 bg-teal-400/10 text-teal-200' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
          }`}
        >
          {mailNotice.text}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">{notice}</div>
      )}

      <nav className="flex gap-2 flex-wrap">
        {[
          ['all', 'All'],
          ['pending', 'Pending'],
          ['in_review', 'In review'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
        ].map(([key, label]) => {
          const active = (!validStatus && key === 'all') || validStatus === key;
          return (
            <Link
              key={key}
              href={key === 'all' ? '/dashboard/applications' : `/dashboard/applications?status=${key}`}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? 'border-teal-400 bg-teal-400 text-neutral-950'
                  : 'border-neutral-800 text-neutral-300 hover:border-neutral-600'
              }`}
            >
              {label} {key !== 'all' && counts[key] ? `(${counts[key]})` : ''}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">
          No applications found for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {rows.map((row) => (
            <ApplicationCard key={row.id} row={row} documents={docLinks.get(row.id) ?? []} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center gap-3 text-sm text-neutral-400">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-full border border-neutral-800 px-4 py-2 hover:border-neutral-600">
              ← Newer
            </Link>
          ) : null}
          <span>
            Page {page} of {pageCount} · {total} application{total === 1 ? '' : 's'}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="rounded-full border border-neutral-800 px-4 py-2 hover:border-neutral-600">
              Older →
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}

function ApplicationCard({ row, documents }: { row: ApplicationRow; documents: DocumentLink[] }) {
  const details = asRecord(row.details);
  const review = asRecord(row.admin_review);
  const bg = backgroundCheckInfo(details, review);
  const isApproved = row.status === 'approved';
  const canApprove = !isApproved && bg.consented && bg.status === 'clear';
  const hiddenKeys = new Set(REVIEW_HIDDEN_DETAIL_KEYS);
  const detailEntries = Object.entries(details).filter(([key, value]) => !hiddenKeys.has(key) && Boolean(displayValue(value)));
  const firstDetails = detailEntries.slice(0, DETAILS_SHOWN_FIRST);
  const moreDetails = detailEntries.slice(DETAILS_SHOWN_FIRST);
  const ignoredKeys = applicantSuppliedReviewKeys(details);
  const fullName = `${row.first_name} ${row.last_name}`.trim();
  const created = new Date(row.created_at).toLocaleString();
  // The column, or the server-validated copy the apply route keeps in details when the column is absent.
  const dob = row.dob || textValue(details.dob);
  const age = dob ? ageFromDob(dob) : null;
  const approved = asRecord(review.approved_provider);
  const decisionEmail = asRecord(review.decision_email);

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-medium">{fullName}</h3>
            <span className={`text-xs uppercase tracking-[0.12em] border rounded-full px-2 py-1 ${statusClass(row.status)}`}>
              {row.status.replace('_', ' ')}
            </span>
            <span className="text-xs uppercase tracking-[0.12em] text-neutral-500">{row.provider_type}</span>
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            {row.email} {row.phone ? `- ${row.phone}` : ''} {row.location ? `- ${row.location}` : ''}
          </p>
          <p className={`text-sm mt-1 ${dob && age != null && age >= 18 ? 'text-neutral-400' : 'text-red-300'}`}>
            {dob
              ? `Born ${dob}${age != null ? ` · age ${age}` : ' · not a valid date'}`
              : 'No date of birth on file — cannot be approved'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">Submitted {created}</p>
        </div>
        <div className="text-right text-sm text-neutral-300">
          <div>{row.specialty || 'No specialty listed'}</div>
          <div className="text-neutral-500">{row.years_experience || 'Experience not listed'}</div>
          <div className="text-neutral-500">{row.monthly_price ? `${row.monthly_price} / month` : 'No monthly price listed'}</div>
          <div className="text-neutral-500">
            {textValue(details.single_session_price)
              ? `${textValue(details.single_session_price)} / ${row.provider_type === 'nutritionist' ? 'consult' : 'session'}`
              : 'No single-session price listed'}
          </div>
        </div>
      </div>

      {documents.length > 0 && (
        <section className="mt-5">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500 mb-2">Documents</div>
          <div className="flex gap-2 flex-wrap">
            {documents.map((doc) =>
              doc.url ? (
                <a
                  key={`${doc.kind}-${doc.path}`}
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-teal-400/40 text-teal-300 px-3 py-1.5 text-xs hover:bg-teal-400 hover:text-neutral-950 transition-colors"
                >
                  {doc.kind}: {doc.name}
                </a>
              ) : doc.blocked ? (
                <span
                  key={`${doc.kind}-${doc.path}`}
                  className="rounded-full border border-red-400/30 text-red-300/80 px-3 py-1.5 text-xs"
                  title="This path is outside what this application uploaded, so it was not opened."
                >
                  {doc.kind}: not opened (not this application’s upload)
                </span>
              ) : (
                <span key={`${doc.kind}-${doc.path}`} className="rounded-full border border-neutral-800 text-neutral-500 px-3 py-1.5 text-xs">
                  {doc.kind}: unavailable
                </span>
              )
            )}
          </div>
        </section>
      )}

      <section className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Background check</div>
            <div className="text-sm text-neutral-300 mt-2">
              Provider: {bg.provider.toUpperCase()} · Consent: {bg.consented ? 'received' : 'missing'}
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              {bg.requestedAt ? `Requested ${bg.requestedAt}` : 'No screening invite marked yet.'}
              {bg.completedAt ? ` · Completed ${bg.completedAt}` : ''}
              {bg.reportId ? ` · Report ${bg.reportId}` : ''}
            </div>
          </div>
          <span className={`text-xs uppercase tracking-[0.12em] border rounded-full px-2 py-1 ${backgroundClass(bg.status)}`}>
            {bg.status.replace('_', ' ')}
          </span>
        </div>
        <p className="text-xs text-neutral-500 mt-3">
          Send the Checkr invite from Checkr until the API connection is added, then mark the result here before approval.
          Only what an admin marks here counts.
        </p>
        {ignoredKeys.length > 0 && (
          <p className="text-xs text-amber-300 mt-2">
            The application itself carried reviewer fields ({ignoredKeys.join(', ').replace(/_/g, ' ')}). They were ignored.
          </p>
        )}
      </section>

      {detailEntries.length > 0 && (
        <section className="mt-5">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500 mb-2">
            Application answers · {detailEntries.length}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {firstDetails.map(([key, value]) => (
              <DetailField key={key} name={key} value={value} />
            ))}
          </div>
          {moreDetails.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-teal-300 hover:text-teal-200">
                Show {moreDetails.length} more answer{moreDetails.length === 1 ? '' : 's'}
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {moreDetails.map(([key, value]) => (
                  <DetailField key={key} name={key} value={value} />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {isApproved ? (
        <section className="mt-5 rounded-lg border border-teal-400/20 bg-teal-400/10 p-4 text-sm text-teal-100">
          <div>
            Approved and live
            {approved.provider_role ? ` as ${textValue(approved.provider_role)} #${textValue(approved.provider_id)}` : ''}
            {approved.approved_at ? ` since ${textValue(approved.approved_at)}` : ''}.
            {decisionEmail.kind
              ? decisionEmail.ok
                ? ' The approval email was sent.'
                : ` The approval email was NOT sent (${textValue(decisionEmail.error) || 'failed'}).`
              : ''}
          </div>
          <p className="text-xs text-teal-200/70 mt-2">
            The application is locked: approving again, rejecting or reopening it would not change the live listing. A
            “Suspend listing” action to take a live coach down is not built yet.
          </p>
          {row.review_notes ? <p className="text-xs text-neutral-400 mt-2">Internal note: {row.review_notes}</p> : null}
        </section>
      ) : (
        <form className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="application_id" value={row.id} />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Review notes (internal)</span>
            <textarea
              name="review_notes"
              defaultValue={row.review_notes ?? ''}
              rows={3}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Internal note for this decision. Never sent to the applicant."
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Note for the applicant (optional)</span>
            <textarea
              name="applicant_note"
              rows={2}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Included in the approval or rejection email. Leave empty for the standard wording."
            />
          </label>
          {decisionEmail.kind ? (
            <p className="text-xs text-neutral-500">
              Last decision email ({textValue(decisionEmail.kind)}): {decisionEmail.ok ? 'sent' : `not sent (${textValue(decisionEmail.error) || 'failed'})`}
              {decisionEmail.at ? ` · ${textValue(decisionEmail.at)}` : ''}
            </p>
          ) : null}
          <div className="flex gap-2 flex-wrap">
            <button
              formAction={markApplicationInReview}
              className="rounded-full border border-amber-400/60 text-amber-200 px-4 py-2 text-sm hover:bg-amber-400 hover:text-neutral-950 transition-colors"
            >
              Mark in review
            </button>
            <button
              formAction={markBackgroundCheckRequested}
              className="rounded-full border border-blue-400/60 text-blue-200 px-4 py-2 text-sm hover:bg-blue-400 hover:text-neutral-950 transition-colors"
            >
              BG requested
            </button>
            <button
              formAction={markBackgroundCheckNeedsReview}
              className="rounded-full border border-red-400/60 text-red-200 px-4 py-2 text-sm hover:bg-red-400 hover:text-neutral-950 transition-colors"
            >
              BG needs review
            </button>
            <button
              formAction={markBackgroundCheckClear}
              className="rounded-full border border-teal-400/60 text-teal-200 px-4 py-2 text-sm hover:bg-teal-400 hover:text-neutral-950 transition-colors"
            >
              BG clear
            </button>
            {canApprove ? (
              <button
                formAction={approveApplication}
                className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-2 text-sm hover:bg-teal-300 transition-colors"
              >
                Approve, publish + email applicant
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-full border border-neutral-800 text-neutral-600 px-4 py-2 text-sm cursor-not-allowed"
                title="Approval requires background check consent and a clear result."
              >
                Approve requires BG clear
              </button>
            )}
            {row.status !== 'rejected' && (
              <button
                formAction={rejectApplication}
                className="rounded-full border border-red-400/60 text-red-200 px-4 py-2 text-sm hover:bg-red-400 hover:text-neutral-950 transition-colors"
              >
                Reject + email applicant
              </button>
            )}
          </div>
        </form>
      )}
    </article>
  );
}

function DetailField({ name, value }: { name: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{name.replace(/_/g, ' ')}</div>
      <div className="text-sm text-neutral-200 mt-1 break-words whitespace-pre-wrap">{displayValue(value)}</div>
    </div>
  );
}
