import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { closeSupportRequest, replySupportRequest } from './actions';

// "Talk to a person" (the Ask Nora plan, step 5): the questions signed-in accounts sent the
// Shape team from Nora's chat, with their conversation, and the replies. A reply reaches the
// account in the same Nora conversation and by email (./actions.ts).

export const metadata = { title: 'Help requests - Shape' };
export const dynamic = 'force-dynamic';

type Status = 'open' | 'answered' | 'closed';
type Row = {
  id: string;
  user_id: string;
  question: string;
  transcript: { role?: string; text?: string; at?: string }[] | null;
  surface: string;
  page: string | null;
  status: Status;
  reply: string | null;
  replied_by_email: string | null;
  replied_at: string | null;
  created_at: string;
};

const WHO: Record<string, string> = { user: 'Them', assistant: 'Nora', team: 'Shape team' };
const OUTCOME: Record<string, string> = {
  answered: 'Reply sent: it is in their Nora conversation and their email.',
  answered_not_emailed: 'Reply saved and in their Nora conversation; the email could not be sent.',
  answered_by_email_only: 'Reply saved and emailed; it could not be added to their Nora conversation.',
  answered_not_delivered: 'Reply saved, but neither their Nora conversation nor the email took it. Reach them another way.',
  already_answered: 'That request was already answered or closed.',
  closed: 'Request closed without a reply.',
};

function statusClass(status: Status): string {
  if (status === 'answered') return 'border-teal-400/40 bg-teal-400/10 text-teal-200';
  if (status === 'closed') return 'border-neutral-600 bg-neutral-800/40 text-neutral-300';
  return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; updated?: string; error?: string }>;
}) {
  try {
    await requireAdminUser();
  } catch {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const status = (['open', 'answered', 'closed'] as const).find((s) => s === params?.status) ?? 'open';
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('support_requests')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: status === 'open' })
    .limit(100);
  const missing = error && (error.code === '42P01' || error.code === 'PGRST205');
  if (error && !missing) throw error;

  const rows = (data ?? []) as Row[];
  const people = new Map<string, { email: string | null; name: string | null }>();
  await Promise.all([...new Set(rows.map((r) => r.user_id))].map(async (id) => {
    const [{ data: who }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from('profiles').select('full_name').eq('id', id).maybeSingle<{ full_name: string | null }>(),
    ]);
    people.set(id, { email: who?.user?.email ?? null, name: profile?.full_name ?? null });
  }));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-teal-400">Admin</div>
        <h2 className="text-2xl font-light tracking-tight">Help requests</h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Questions members and coaches sent the team with &ldquo;Talk to a person&rdquo; in Nora&apos;s chat, with their
          conversation. Your reply appears in that conversation on the website and in the app, and is emailed to them.
        </p>
      </section>

      {missing && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
          Not set up yet: run supabase-migrations/2026-10-08-support-requests.sql.
        </div>
      )}
      {params?.updated && (
        <div className="rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-200 text-sm px-4 py-3">
          {OUTCOME[params.updated] ?? 'Updated.'}
        </div>
      )}
      {params?.error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 text-sm px-4 py-3">
          Could not save: {params.error.replace(/_/g, ' ')}.
        </div>
      )}

      <nav className="flex gap-2 flex-wrap">
        {(['open', 'answered', 'closed'] as const).map((key) => (
          <Link
            key={key}
            href={`/dashboard/support?status=${key}`}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              status === key ? 'border-teal-400 bg-teal-400 text-neutral-950' : 'border-neutral-800 text-neutral-300 hover:border-neutral-600'
            }`}
          >
            {key[0].toUpperCase() + key.slice(1)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">
          No {status} requests.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {rows.map((row) => (
            <RequestCard key={row.id} row={row} person={people.get(row.user_id) ?? { email: null, name: null }} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ row, person }: { row: Row; person: { email: string | null; name: string | null } }) {
  const transcript = Array.isArray(row.transcript) ? row.transcript : [];
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950 p-5" data-request={row.id}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-medium">{person.name || person.email || row.user_id}</h3>
            <span className={`text-xs uppercase tracking-[0.12em] border rounded-full px-2 py-1 ${statusClass(row.status)}`}>{row.status}</span>
          </div>
          <p className="text-sm text-neutral-400 mt-1">{person.email ?? 'no email on file'}</p>
          <p className="text-xs text-neutral-500 mt-1">
            {new Date(row.created_at).toLocaleString()} · {row.surface === 'app' ? 'the app' : 'the website'}
            {row.page ? ` · ${row.page}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Their question</div>
        <div className="text-sm text-neutral-200 mt-1 whitespace-pre-wrap break-words">{row.question}</div>
      </div>

      <details className="mt-3">
        <summary className="text-xs uppercase tracking-[0.14em] text-neutral-500 cursor-pointer">
          Their conversation with Nora ({transcript.length})
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-sm">
          {transcript.length === 0 && <div className="text-neutral-500">They had no conversation with Nora before asking.</div>}
          {transcript.map((m, i) => (
            <div key={i} className="text-neutral-300 whitespace-pre-wrap break-words">
              <span className="text-neutral-500">{WHO[String(m.role)] ?? m.role}:</span> {m.text}
            </div>
          ))}
        </div>
      </details>

      {row.status === 'open' ? (
        <form className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="request_id" value={row.id} />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Your reply</span>
            <textarea
              name="reply"
              rows={4}
              maxLength={4000}
              required
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="This goes to them in Nora's chat and by email."
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button type="submit" formAction={replySupportRequest} className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-2 text-sm hover:bg-teal-300 transition-colors">
              Send reply
            </button>
            <button type="submit" formAction={closeSupportRequest} formNoValidate className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-2 text-sm hover:border-neutral-500 transition-colors">
              Close without a reply
            </button>
          </div>
        </form>
      ) : row.reply ? (
        <div className="mt-4 rounded-lg border border-teal-400/20 bg-teal-400/5 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-teal-300">
            Replied {row.replied_at ? new Date(row.replied_at).toLocaleString() : ''}{row.replied_by_email ? ` by ${row.replied_by_email}` : ''}
          </div>
          <div className="text-sm text-neutral-200 mt-1 whitespace-pre-wrap break-words">{row.reply}</div>
        </div>
      ) : null}
    </article>
  );
}
