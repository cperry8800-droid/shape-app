import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminEmails, requireAdminUser } from '@/lib/admin-access';
import { approveApplication, markApplicationInReview, rejectApplication } from './actions';

export const metadata = { title: 'Applications - Shape' };
export const dynamic = 'force-dynamic';

type ApplicationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';

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
  details: Record<string, unknown> | null;
  status: ApplicationStatus;
  reviewed_at: string | null;
  review_notes: string | null;
};

type DocumentLink = {
  kind: string;
  name: string;
  path: string;
  url: string | null;
};

function asDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getDocuments(details: Record<string, unknown>): Array<{ kind: string; name: string; path: string }> {
  const docs: Array<{ kind: string; name: string; path: string }> = [];
  const rawDocs = details.documents;
  if (Array.isArray(rawDocs)) {
    for (const doc of rawDocs) {
      if (!doc || typeof doc !== 'object') continue;
      const item = doc as Record<string, unknown>;
      const path = typeof item.path === 'string' ? item.path : '';
      if (!path) continue;
      docs.push({
        kind: typeof item.kind === 'string' ? item.kind : 'document',
        name: typeof item.name === 'string' ? item.name : path.split('/').pop() || 'Document',
        path,
      });
    }
  }

  for (const key of ['resume_path', 'certProof_path', 'insuranceDoc_path', 'samplePlan_path']) {
    const path = details[key];
    if (typeof path === 'string' && path) {
      docs.push({ kind: key.replace('_path', ''), name: path.split('/').pop() || key, path });
    }
  }

  return docs;
}

async function signedDocumentLinks(rows: ApplicationRow[]): Promise<Map<string, DocumentLink[]>> {
  const admin = createAdminClient();
  const result = new Map<string, DocumentLink[]>();

  for (const row of rows) {
    const docs = getDocuments(asDetails(row.details));
    const links: DocumentLink[] = [];
    for (const doc of docs) {
      const { data, error } = await admin.storage
        .from('provider-credentials')
        .createSignedUrl(doc.path, 60 * 15);
      links.push({
        ...doc,
        url: error ? null : data.signedUrl,
      });
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

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; updated?: string }>;
}) {
  try {
    await requireAdminUser();
  } catch {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const status = params?.status;
  const validStatus = ['pending', 'in_review', 'approved', 'rejected', 'withdrawn'].includes(status ?? '')
    ? status
    : null;

  const admin = createAdminClient();
  let query = admin
    .from('provider_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (validStatus) query = query.eq('status', validStatus);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ApplicationRow[];
  const docLinks = await signedDocumentLinks(rows);
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

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
    </div>
  );
}

function ApplicationCard({ row, documents }: { row: ApplicationRow; documents: DocumentLink[] }) {
  const details = asDetails(row.details);
  const hiddenKeys = new Set(['documents', 'approved_provider']);
  const detailEntries = Object.entries(details).filter(([key, value]) => !hiddenKeys.has(key) && Boolean(displayValue(value)));
  const fullName = `${row.first_name} ${row.last_name}`.trim();
  const created = new Date(row.created_at).toLocaleString();

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
          <p className="text-xs text-neutral-500 mt-1">Submitted {created}</p>
        </div>
        <div className="text-right text-sm text-neutral-300">
          <div>{row.specialty || 'No specialty listed'}</div>
          <div className="text-neutral-500">{row.years_experience || 'Experience not listed'}</div>
          <div className="text-neutral-500">{row.monthly_price || 'No price listed'}</div>
        </div>
      </div>

      {documents.length > 0 && (
        <section className="mt-5">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500 mb-2">Documents</div>
          <div className="flex gap-2 flex-wrap">
            {documents.map((doc) => (
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
              ) : (
                <span key={`${doc.kind}-${doc.path}`} className="rounded-full border border-neutral-800 text-neutral-500 px-3 py-1.5 text-xs">
                  {doc.kind}: unavailable
                </span>
              )
            ))}
          </div>
        </section>
      )}

      {detailEntries.length > 0 && (
        <section className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {detailEntries.slice(0, 12).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{key.replace(/_/g, ' ')}</div>
              <div className="text-sm text-neutral-200 mt-1 break-words">{displayValue(value)}</div>
            </div>
          ))}
        </section>
      )}

      {Boolean(details.approved_provider) && (
        <pre className="mt-5 text-xs text-teal-200 bg-teal-400/10 border border-teal-400/20 rounded-lg p-3 overflow-auto">
          {JSON.stringify(details.approved_provider, null, 2)}
        </pre>
      )}

      <form className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="application_id" value={row.id} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Review notes</span>
          <textarea
            name="review_notes"
            defaultValue={row.review_notes ?? ''}
            rows={3}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
            placeholder="Internal note for this decision"
          />
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            formAction={markApplicationInReview}
            className="rounded-full border border-amber-400/60 text-amber-200 px-4 py-2 text-sm hover:bg-amber-400 hover:text-neutral-950 transition-colors"
          >
            Mark in review
          </button>
          <button
            formAction={approveApplication}
            className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-2 text-sm hover:bg-teal-300 transition-colors"
          >
            Approve + publish profile
          </button>
          <button
            formAction={rejectApplication}
            className="rounded-full border border-red-400/60 text-red-200 px-4 py-2 text-sm hover:bg-red-400 hover:text-neutral-950 transition-colors"
          >
            Reject
          </button>
        </div>
      </form>
    </article>
  );
}
