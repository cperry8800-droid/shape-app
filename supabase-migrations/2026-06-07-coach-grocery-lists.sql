-- Coach grocery lists — lists a coach builds for THEMSELVES (personal) or for a
-- client, then sends to that client. Mirrors coach_soundtracks / coach_plans:
-- owner-scoped, items ride in a jsonb array. Idempotent.

create table if not exists public.coach_grocery_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  client_id text,                                 -- null = the coach's own list
  client_name text,                               -- display name for a client list
  status text not null default 'ready' check (status in ('ready', 'review', 'approval', 'sent')),
  items jsonb not null default '[]'::jsonb,        -- [{ name, aisle }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_grocery_lists_owner_idx
  on public.coach_grocery_lists (owner_id, created_at desc);

alter table public.coach_grocery_lists enable row level security;

drop policy if exists "grocery_lists_owner_all" on public.coach_grocery_lists;
create policy "grocery_lists_owner_all" on public.coach_grocery_lists for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.coach_grocery_lists_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists coach_grocery_lists_touch on public.coach_grocery_lists;
create trigger coach_grocery_lists_touch
  before update on public.coach_grocery_lists
  for each row execute function public.coach_grocery_lists_touch_updated_at();
