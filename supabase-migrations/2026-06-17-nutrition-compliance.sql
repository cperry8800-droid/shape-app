-- Nutrition-provider compliance (NC1) — credential capture, per-state licensure,
-- client state + cross-discipline consent, and a compliance audit log.
--
-- ⚠️ Engineering controls only — NOT legal advice. HARD enforcement of the
-- licensure block is gated in code on NUTRITION_COMPLIANCE_ENFORCE, which must
-- not be flipped on without healthcare-regulatory counsel sign-off. See
-- shape-ai-nutrition-compliance-brief.md. Idempotent.

-- ===== provider credentials (one row per provider owner) =====
create table if not exists public.provider_credentials (
  owner_id uuid primary key references auth.users on delete cascade,
  credential_type text not null default 'nutritionist'
    check (credential_type in ('rd', 'rdn', 'cns', 'nutritionist')),
  cdr_id text,                                   -- CDR registration id (RD/RDN)
  verified_rd boolean not null default false,    -- CDR-verified
  verified_at timestamptz,
  insurance_carrier text,
  insurance_policy text,
  insurance_expires date,
  attestations jsonb not null default '{}'::jsonb, -- independent_contractor, maintains_licensure, ...
  updated_at timestamptz not null default now()
);
alter table public.provider_credentials enable row level security;
drop policy if exists "prov_cred_own" on public.provider_credentials;
create policy "prov_cred_own" on public.provider_credentials for all
  to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ===== per-state licenses (the per-client gate is matched against this) =====
create table if not exists public.provider_licenses (
  owner_id uuid not null references auth.users on delete cascade,
  state text not null,                           -- 2-letter US state
  license_number text,
  expires_on date,
  updated_at timestamptz not null default now(),
  primary key (owner_id, state)
);
create index if not exists provider_licenses_owner_idx on public.provider_licenses (owner_id);
alter table public.provider_licenses enable row level security;
drop policy if exists "prov_lic_own" on public.provider_licenses;
create policy "prov_lic_own" on public.provider_licenses for all
  to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ===== client compliance: their US state + cross-discipline sharing consent =====
create table if not exists public.client_compliance (
  user_id uuid primary key references auth.users on delete cascade,
  us_state text,                                 -- the client's state (licensure match)
  cross_discipline_consent boolean not null default false,
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.client_compliance enable row level security;
-- The client owns their row.
drop policy if exists "client_comp_own" on public.client_compliance;
create policy "client_comp_own" on public.client_compliance for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- A coach ON the client may READ their state + consent (needed to match licensure
-- and to honor the sharing consent). Read-only — never writes the client's consent.
drop policy if exists "client_comp_coach_read" on public.client_compliance;
create policy "client_comp_coach_read" on public.client_compliance for select
  to authenticated using (public.is_coach_on_client(user_id));

-- ===== compliance audit (who-acted, on-whom, decision) =====
-- Written by the service role from server routes (the subject is usually not the
-- actor). Read by the subject, the actor, or an admin.
create table if not exists public.compliance_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  subject_user_id uuid,
  event text not null,                           -- match_blocked, individualized_write, consent_set
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists compliance_events_subject_idx on public.compliance_events (subject_user_id, created_at desc);
create index if not exists compliance_events_actor_idx on public.compliance_events (actor_id, created_at desc);
alter table public.compliance_events enable row level security;
drop policy if exists "compliance_events_read_own" on public.compliance_events;
create policy "compliance_events_read_own" on public.compliance_events for select
  to authenticated using (subject_user_id = auth.uid() or actor_id = auth.uid());
