-- 2026-05-22 — Coach Console: live focus banners + pushed items.
--
-- Powers the newdesign Trainer / Nutritionist Live Console:
--   • coach_focus_banners — one "this week's focus" banner per
--     (provider, client), upserted when the coach hits Send.
--   • coach_pushed_items  — exercises (trainer) or meals (nutritionist)
--     the coach added to a client's "Today's session/plan". Append-only;
--     removing from the list sets removed_at instead of deleting.
--
-- client_id is text (not uuid) so the same tables back demo client ids
-- (e.g. "charlie") and real client auth uuids. Mobile app clients query
-- their own rows by client_id = auth.uid()::text.
--
-- Idempotent, safe to re-run.

-- ===== Focus banners =====
create table if not exists public.coach_focus_banners (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null
    check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id text not null,
  text text not null check (char_length(trim(text)) > 0),
  sent_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create unique index if not exists coach_focus_banners_unique_idx
  on public.coach_focus_banners (provider_role, provider_id, client_id);

create index if not exists coach_focus_banners_client_idx
  on public.coach_focus_banners (client_id, sent_at desc);

create index if not exists coach_focus_banners_provider_idx
  on public.coach_focus_banners (provider_role, provider_id, sent_at desc);

-- ===== Pushed items (exercises / meals) =====
create table if not exists public.coach_pushed_items (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null
    check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id text not null,
  kind text not null check (kind in ('exercise','meal')),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  removed_at timestamptz
);

create index if not exists coach_pushed_items_client_idx
  on public.coach_pushed_items (client_id, sent_at desc);

create index if not exists coach_pushed_items_provider_idx
  on public.coach_pushed_items (provider_role, provider_id, sent_at desc);

create index if not exists coach_pushed_items_active_idx
  on public.coach_pushed_items (provider_role, provider_id, client_id)
  where removed_at is null;

-- ===== RLS =====
alter table public.coach_focus_banners enable row level security;
alter table public.coach_pushed_items enable row level security;

-- Trainers / nutritionists manage rows under their own provider id.
drop policy if exists "coach_focus_banners_trainer_all" on public.coach_focus_banners;
create policy "coach_focus_banners_trainer_all"
  on public.coach_focus_banners
  to authenticated
  using (
    provider_role = 'trainer'
    and exists (
      select 1 from public.trainers t
      where t.id = provider_id and t.owner_id = auth.uid()
    )
  )
  with check (
    provider_role = 'trainer'
    and exists (
      select 1 from public.trainers t
      where t.id = provider_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "coach_focus_banners_nutritionist_all" on public.coach_focus_banners;
create policy "coach_focus_banners_nutritionist_all"
  on public.coach_focus_banners
  to authenticated
  using (
    provider_role = 'nutritionist'
    and exists (
      select 1 from public.nutritionists n
      where n.id = provider_id and n.owner_id = auth.uid()
    )
  )
  with check (
    provider_role = 'nutritionist'
    and exists (
      select 1 from public.nutritionists n
      where n.id = provider_id and n.owner_id = auth.uid()
    )
  );

drop policy if exists "coach_pushed_items_trainer_all" on public.coach_pushed_items;
create policy "coach_pushed_items_trainer_all"
  on public.coach_pushed_items
  to authenticated
  using (
    provider_role = 'trainer'
    and exists (
      select 1 from public.trainers t
      where t.id = provider_id and t.owner_id = auth.uid()
    )
  )
  with check (
    provider_role = 'trainer'
    and exists (
      select 1 from public.trainers t
      where t.id = provider_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "coach_pushed_items_nutritionist_all" on public.coach_pushed_items;
create policy "coach_pushed_items_nutritionist_all"
  on public.coach_pushed_items
  to authenticated
  using (
    provider_role = 'nutritionist'
    and exists (
      select 1 from public.nutritionists n
      where n.id = provider_id and n.owner_id = auth.uid()
    )
  )
  with check (
    provider_role = 'nutritionist'
    and exists (
      select 1 from public.nutritionists n
      where n.id = provider_id and n.owner_id = auth.uid()
    )
  );

-- Clients read their own rows (mobile app surface).
drop policy if exists "coach_focus_banners_client_read" on public.coach_focus_banners;
create policy "coach_focus_banners_client_read"
  on public.coach_focus_banners for select
  to authenticated
  using (client_id = auth.uid()::text);

drop policy if exists "coach_pushed_items_client_read" on public.coach_pushed_items;
create policy "coach_pushed_items_client_read"
  on public.coach_pushed_items for select
  to authenticated
  using (client_id = auth.uid()::text);
