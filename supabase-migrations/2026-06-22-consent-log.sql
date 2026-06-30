-- Consent receipts — records each consent a user grants (or withdraws), so we can
-- prove WHO consented to WHAT (the exact text + policy version), WHEN, and from
-- where. Powers the unbundled signup consents (health / Art.9, share-with-coach,
-- marketing), the cookie/consent banner, and the GPC opt-out. The log is
-- append-only and owner-scoped. Idempotent. Code that writes here no-ops until
-- this migration is applied.

create table if not exists public.consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,                 -- health | share_coach | marketing | cookies | gpc_optout | terms
  granted boolean not null default true,
  policy_version text,                -- e.g. '2026-06-22'
  consent_text text,                  -- the exact wording the user saw
  scope text,                         -- optional detail (e.g. which wearable / metrics)
  source text,                        -- signup | settings | banner
  created_at timestamptz not null default now()
);
create index if not exists consent_log_user_idx on public.consent_log (user_id, kind, created_at desc);

alter table public.consent_log enable row level security;
-- Append-only + own-only: a user may record and read their own consent receipts,
-- but cannot modify or delete them (immutable audit). The service role bypasses
-- RLS to purge them when an account is deleted.
drop policy if exists "consent_log_insert_own" on public.consent_log;
create policy "consent_log_insert_own" on public.consent_log for insert
  to authenticated with check (user_id = auth.uid());
drop policy if exists "consent_log_select_own" on public.consent_log;
create policy "consent_log_select_own" on public.consent_log for select
  to authenticated using (user_id = auth.uid());
