import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { approveCredential, rejectCredential, requestCredentialChanges } from './actions';

export const metadata = { title: 'Credential review - Shape' };
export const dynamic = 'force-dynamic';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

type CredentialRow = {
  owner_id: string;
  credential_type: string | null;
  cdr_id: string | null;
  verified_rd: boolean | null;
  insurance_carrier: string | null;
  insurance_policy: string | null;
  insurance_expires: string | null;
  insurance_coi_path: string | null;
  cert_files: Array<{ type?: string; number?: string; path?: string; name?: string }> | null;
  review_status: ReviewStatus | 'none';
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

type CoachMeta = { name: string; role: string; verified: boolean };

function statusClass(status: string): string {
  if (status === 'approved') return 'border-teal-400/40 bg-teal-400/10 text-teal-200';
  if (status === 'rejected') return 'border-red-400/40 bg-red-400/10 text-red-200';
  if (status === 'changes_requested') return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
  return 'border-blue-400/40 bg-blue-400/10 text-blue-200';
}

function expiryLabel(date: string | null): { text: string; cls: string } {
  if (!date) return { text: 'not provided', cls: 'text-neutral-500' };
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `expired ${date}`, cls: 'text-red-300' };
  if (days <= 60) return { text: `expires ${date} (${days}d)`, cls: 'text-amber-300' };
  return { text: `expires ${date}`, cls: 'text-neutral-300' };
}

export default async function CredentialsPage({
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
  const validStatus = (['pending', 'approved', 'rejected', 'changes_requested'].includes(status ?? '')
    ? status
    : null) as ReviewStatus | null;

  const admin = createAdminClient();
  let query = admin
    .from('provider_credentials')
    .select('*')
    .neq('review_status', 'none')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (validStatus) query = query.eq('review_status', validStatus);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as CredentialRow[];

  const ownerIds = rows.map((r) => r.owner_id);
  const meta = new Map<string, CoachMeta>();
  const signed = new Map<string, string | null>();

  if (ownerIds.length) {
    const [profiles, trainers, nutritionists, licenses] = await Promise.all([
      admin.from('profiles').select('id, full_name').in('id', ownerIds),
      admin.from('trainers').select('owner_id, name, verified').in('owner_id', ownerIds),
      admin.from('nutritionists').select('owner_id, name, verified').in('owner_id', ownerIds),
      admin.from('provider_licenses').select('owner_id, state, license_number, expires_on').in('owner_id', ownerIds),
    ]);

    const nameById = new Map<string, string>();
    for (const p of (profiles.data ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name) nameById.set(p.id, p.full_name);
    }
    for (const t of (trainers.data ?? []) as Array<{ owner_id: string; name: string | null; verified: boolean | null }>) {
      meta.set(t.owner_id, { name: nameById.get(t.owner_id) || t.name || 'Coach', role: 'trainer', verified: !!t.verified });
    }
    for (const n of (nutritionists.data ?? []) as Array<{ owner_id: string; name: string | null; verified: boolean | null }>) {
      const prev = meta.get(n.owner_id);
      meta.set(n.owner_id, {
        name: nameById.get(n.owner_id) || n.name || prev?.name || 'Coach',
        role: prev ? `${prev.role} + nutritionist` : 'nutritionist',
        verified: prev?.verified || !!n.verified,
      });
    }
    for (const id of ownerIds) {
      if (!meta.has(id)) meta.set(id, { name: nameById.get(id) || 'Coach', role: 'coach', verified: false });
    }

    const licByOwner = new Map<string, Array<{ state: string; license_number?: string; expires_on?: string }>>();
    for (const l of (licenses.data ?? []) as Array<{ owner_id: string; state: string; license_number?: string; expires_on?: string }>) {
      const arr = licByOwner.get(l.owner_id) ?? [];
      arr.push(l);
      licByOwner.set(l.owner_id, arr);
    }
    (rows as Array<CredentialRow & { _licenses?: unknown }>).forEach((r) => {
      r._licenses = licByOwner.get(r.owner_id) ?? [];
    });

    // Signed URLs (15 min) for every COI + cert document.
    const paths = new Set<string>();
    for (const r of rows) {
      if (r.insurance_coi_path) paths.add(r.insurance_coi_path);
      for (const c of r.cert_files ?? []) if (c.path) paths.add(c.path);
    }
    await Promise.all(
      [...paths].map(async (path) => {
        const { data: s, error: sErr } = await admin.storage.from('coach-credentials').createSignedUrl(path, 60 * 15);
        signed.set(path, sErr ? null : s.signedUrl);
      }),
    );
  }

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.review_status] = (acc[r.review_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-teal-400">Admin</div>
        <h2 className="text-2xl font-light tracking-tight">Credential review</h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Verify coach certifications + professional liability insurance (COI). Approving sets the
          <span className="text-teal-300"> ✓ Verified</span> badge on the coach’s marketplace profile.
        </p>
      </section>

      {params?.updated && (
        <div className="rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-200 text-sm px-4 py-3">
          Credential updated: {params.updated.replace('_', ' ')}.
        </div>
      )}

      <nav className="flex gap-2 flex-wrap">
        {[
          ['all', 'All'],
          ['pending', 'Pending'],
          ['changes_requested', 'Changes requested'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
        ].map(([key, label]) => {
          const active = (!validStatus && key === 'all') || validStatus === key;
          return (
            <Link
              key={key}
              href={key === 'all' ? '/dashboard/credentials' : `/dashboard/credentials?status=${key}`}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                active ? 'border-teal-400 bg-teal-400 text-neutral-950' : 'border-neutral-800 text-neutral-300 hover:border-neutral-600'
              }`}
            >
              {label} {key !== 'all' && counts[key] ? `(${counts[key]})` : ''}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">
          No credential submissions for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {rows.map((row) => (
            <CredentialCard
              key={row.owner_id}
              row={row}
              meta={meta.get(row.owner_id)}
              licenses={(row as CredentialRow & { _licenses?: Array<{ state: string; license_number?: string; expires_on?: string }> })._licenses ?? []}
              signed={signed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CredentialCard({
  row,
  meta,
  licenses,
  signed,
}: {
  row: CredentialRow;
  meta?: CoachMeta;
  licenses: Array<{ state: string; license_number?: string; expires_on?: string }>;
  signed: Map<string, string | null>;
}) {
  const ins = expiryLabel(row.insurance_expires);
  const certs = (row.cert_files ?? []).filter((c) => c.path);
  const submitted = row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—';

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-medium">{meta?.name ?? 'Coach'}</h3>
            <span className={`text-xs uppercase tracking-[0.12em] border rounded-full px-2 py-1 ${statusClass(row.review_status)}`}>
              {row.review_status.replace('_', ' ')}
            </span>
            <span className="text-xs uppercase tracking-[0.12em] text-neutral-500">{meta?.role ?? 'coach'}</span>
            {meta?.verified && <span className="text-xs text-teal-300">✓ verified live</span>}
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            Credential: {(row.credential_type || 'n/a').toUpperCase()}
            {row.cdr_id ? ` · CDR ${row.cdr_id}` : ''}
          </p>
          <p className="text-xs text-neutral-500 mt-1">Submitted {submitted}</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Insurance</div>
          <div className="text-neutral-300">{row.insurance_carrier || 'No carrier listed'}</div>
          <div className="text-neutral-500">{row.insurance_policy ? `Policy ${row.insurance_policy}` : 'No policy #'}</div>
          <div className={ins.cls}>{ins.text}</div>
        </div>
      </div>

      {licenses.length > 0 && (
        <section className="mt-5">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500 mb-2">State licenses</div>
          <div className="flex gap-2 flex-wrap">
            {licenses.map((l) => {
              const e = expiryLabel(l.expires_on ?? null);
              return (
                <span key={l.state} className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-300">
                  {l.state}{l.license_number ? ` · ${l.license_number}` : ''} · <span className={e.cls}>{e.text}</span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="text-xs uppercase tracking-[0.14em] text-neutral-500 mb-2">Documents</div>
        <div className="flex gap-2 flex-wrap">
          {row.insurance_coi_path ? (
            signed.get(row.insurance_coi_path) ? (
              <a href={signed.get(row.insurance_coi_path)!} target="_blank" rel="noreferrer" className="rounded-full border border-teal-400/40 text-teal-300 px-3 py-1.5 text-xs hover:bg-teal-400 hover:text-neutral-950 transition-colors">
                COI (insurance)
              </a>
            ) : (
              <span className="rounded-full border border-neutral-800 text-neutral-500 px-3 py-1.5 text-xs">COI: unavailable</span>
            )
          ) : (
            <span className="rounded-full border border-red-400/30 text-red-300/80 px-3 py-1.5 text-xs">No COI uploaded</span>
          )}
          {certs.map((c, i) => {
            const url = c.path ? signed.get(c.path) : null;
            const label = `${c.type || 'cert'}${c.number ? ` · ${c.number}` : ''}`;
            return url ? (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="rounded-full border border-teal-400/40 text-teal-300 px-3 py-1.5 text-xs hover:bg-teal-400 hover:text-neutral-950 transition-colors">
                {label}
              </a>
            ) : (
              <span key={i} className="rounded-full border border-neutral-800 text-neutral-500 px-3 py-1.5 text-xs">{label}: unavailable</span>
            );
          })}
        </div>
      </section>

      <form className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="owner_id" value={row.owner_id} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Review notes</span>
          <textarea
            name="review_notes"
            defaultValue={row.review_notes ?? ''}
            rows={2}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
            placeholder="Visible to the coach on a changes request"
          />
        </label>
        <div className="flex gap-2 flex-wrap">
          <button formAction={approveCredential} className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-2 text-sm hover:bg-teal-300 transition-colors">
            Approve + verify
          </button>
          <button formAction={requestCredentialChanges} className="rounded-full border border-amber-400/60 text-amber-200 px-4 py-2 text-sm hover:bg-amber-400 hover:text-neutral-950 transition-colors">
            Request changes
          </button>
          <button formAction={rejectCredential} className="rounded-full border border-red-400/60 text-red-200 px-4 py-2 text-sm hover:bg-red-400 hover:text-neutral-950 transition-colors">
            Reject
          </button>
        </div>
      </form>
    </article>
  );
}
