-- Shape Sets broadcast schedule (spec 2026-07-19 — supersedes the 2026-06-19
-- avatar-DJ sketch's nora_sets/route, which were never built). Public read of
-- PUBLISHED rows only; writes are service-role only (schedule authoring is an
-- owner/ops act — v1 ships no editor UI). Defense in depth: client DML is
-- impossible at the GRANT layer even if a policy were ever misconfigured.
-- Not in the realtime publication — consumers poll on open. Idempotent.

create table if not exists public.nora_sets (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (btrim(title) <> ''),
  dj           text not null check (btrim(dj) <> ''),
  blurb        text,                              -- optional flavor line, by design
  starts_at    timestamptz not null,
  duration_min int not null check (duration_min between 10 and 360),
  published    boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.nora_sets enable row level security;

drop policy if exists "nora sets public read" on public.nora_sets;
create policy "nora sets public read" on public.nora_sets
  for select to anon, authenticated using (published);

-- Privilege contract, explicit for EVERY role (review round): revoke from
-- PUBLIC too, and grant the service-role write path by name rather than
-- relying on pre-existing default grants.
revoke all on table public.nora_sets from public, anon, authenticated;
grant select on table public.nora_sets to anon, authenticated;
grant select, insert, update, delete on table public.nora_sets to service_role;

create index if not exists nora_sets_starts_idx on public.nora_sets (published, starts_at);
