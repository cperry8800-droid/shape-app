-- Third-party integrations (Spotify, Strava, Whoop, Garmin, etc.).
-- One row per (user, provider). Tokens are written only by server routes
-- running with the service role; clients can read their own row to show
-- connection status but never see the raw access token.
--
-- Idempotent, safe to re-run.

create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_user_id text,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists user_integrations_user_idx
  on public.user_integrations (user_id);

alter table public.user_integrations enable row level security;

-- Users can read their own integration rows (to show connected status +
-- metadata). The sensitive access_token / refresh_token columns should
-- be stripped by the server before sending to the client — never select
-- them from the browser directly.
drop policy if exists "user_read_own_integrations" on public.user_integrations;
create policy "user_read_own_integrations"
  on public.user_integrations for select
  to authenticated
  using (user_id = auth.uid());

-- No client-side writes. All inserts/updates/deletes go through
-- /api/integrations/* routes using the service role client.

create or replace function public.user_integrations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_integrations_touch_updated_at on public.user_integrations;
create trigger user_integrations_touch_updated_at
  before update on public.user_integrations
  for each row execute function public.user_integrations_set_updated_at();
