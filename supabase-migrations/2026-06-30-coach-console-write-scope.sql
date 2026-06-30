-- Coach Console write-scope hardening — AUTHZ-P2-console-idor
-- (docs/SECURITY-AUDIT-2026-06-30.md §2c).
--
-- The gap: coach_focus_banners + coach_pushed_items each had a single broad
-- "*_all" (FOR ALL) policy per role whose WITH CHECK verified only that the
-- caller OWNS the provider row — never that they ACTIVELY coach the target
-- client. So any coach could INSERT a focus banner / pushed item / grocery note
-- with an ARBITRARY client_id (cross-tenant content injection onto a non-client's
-- Console surface, since those rows are client-readable where client_id =
-- auth.uid()). The /api/trainer/console + /api/nutritionist/console routes write
-- via the cookie/Bearer client, so RLS is the authoritative server-side gate.
--
-- Fix (mirrors 2026-06-17-coach-write-scope.sql): replace the broad ALL policy
-- with owner-scoped SELECT / UPDATE / DELETE (so the GET hydrate, the focus
-- upsert's update path, and the removeItem soft-delete keep working even after a
-- subscription lapses) PLUS a stricter INSERT policy that ALSO requires an active
-- discipline subscription to the target client (is_discipline_coach_on_client).
-- The routes re-check is_coach_on_client for a clean 403; both layers enforce.
--
-- is_discipline_coach_on_client(uuid, text) already exists (2026-06-17). Idempotent.

-- ============================ coach_focus_banners ============================
drop policy if exists "coach_focus_banners_trainer_all" on public.coach_focus_banners;
drop policy if exists "coach_focus_banners_nutritionist_all" on public.coach_focus_banners;

drop policy if exists "coach_focus_banners_owner_select" on public.coach_focus_banners;
create policy "coach_focus_banners_owner_select" on public.coach_focus_banners
  for select to authenticated
  using (
    (coach_focus_banners.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_focus_banners.provider_id and t.owner_id = auth.uid()))
    or (coach_focus_banners.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_focus_banners.provider_id and n.owner_id = auth.uid()))
  );

drop policy if exists "coach_focus_banners_owner_update" on public.coach_focus_banners;
create policy "coach_focus_banners_owner_update" on public.coach_focus_banners
  for update to authenticated
  using (
    (coach_focus_banners.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_focus_banners.provider_id and t.owner_id = auth.uid()))
    or (coach_focus_banners.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_focus_banners.provider_id and n.owner_id = auth.uid()))
  )
  with check (
    (coach_focus_banners.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_focus_banners.provider_id and t.owner_id = auth.uid()))
    or (coach_focus_banners.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_focus_banners.provider_id and n.owner_id = auth.uid()))
  );

drop policy if exists "coach_focus_banners_owner_delete" on public.coach_focus_banners;
create policy "coach_focus_banners_owner_delete" on public.coach_focus_banners
  for delete to authenticated
  using (
    (coach_focus_banners.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_focus_banners.provider_id and t.owner_id = auth.uid()))
    or (coach_focus_banners.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_focus_banners.provider_id and n.owner_id = auth.uid()))
  );

drop policy if exists "coach_focus_banners_insert_on_client" on public.coach_focus_banners;
create policy "coach_focus_banners_insert_on_client" on public.coach_focus_banners
  for insert to authenticated
  with check (
    (
      (coach_focus_banners.provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = coach_focus_banners.provider_id and t.owner_id = auth.uid()))
      or (coach_focus_banners.provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = coach_focus_banners.provider_id and n.owner_id = auth.uid()))
    )
    and public.is_discipline_coach_on_client(coach_focus_banners.client_id::uuid, coach_focus_banners.provider_role)
  );

-- ============================ coach_pushed_items ============================
drop policy if exists "coach_pushed_items_trainer_all" on public.coach_pushed_items;
drop policy if exists "coach_pushed_items_nutritionist_all" on public.coach_pushed_items;

drop policy if exists "coach_pushed_items_owner_select" on public.coach_pushed_items;
create policy "coach_pushed_items_owner_select" on public.coach_pushed_items
  for select to authenticated
  using (
    (coach_pushed_items.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_pushed_items.provider_id and t.owner_id = auth.uid()))
    or (coach_pushed_items.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_pushed_items.provider_id and n.owner_id = auth.uid()))
  );

drop policy if exists "coach_pushed_items_owner_update" on public.coach_pushed_items;
create policy "coach_pushed_items_owner_update" on public.coach_pushed_items
  for update to authenticated
  using (
    (coach_pushed_items.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_pushed_items.provider_id and t.owner_id = auth.uid()))
    or (coach_pushed_items.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_pushed_items.provider_id and n.owner_id = auth.uid()))
  )
  with check (
    (coach_pushed_items.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_pushed_items.provider_id and t.owner_id = auth.uid()))
    or (coach_pushed_items.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_pushed_items.provider_id and n.owner_id = auth.uid()))
  );

drop policy if exists "coach_pushed_items_owner_delete" on public.coach_pushed_items;
create policy "coach_pushed_items_owner_delete" on public.coach_pushed_items
  for delete to authenticated
  using (
    (coach_pushed_items.provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_pushed_items.provider_id and t.owner_id = auth.uid()))
    or (coach_pushed_items.provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_pushed_items.provider_id and n.owner_id = auth.uid()))
  );

drop policy if exists "coach_pushed_items_insert_on_client" on public.coach_pushed_items;
create policy "coach_pushed_items_insert_on_client" on public.coach_pushed_items
  for insert to authenticated
  with check (
    (
      (coach_pushed_items.provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = coach_pushed_items.provider_id and t.owner_id = auth.uid()))
      or (coach_pushed_items.provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = coach_pushed_items.provider_id and n.owner_id = auth.uid()))
    )
    and public.is_discipline_coach_on_client(coach_pushed_items.client_id::uuid, coach_pushed_items.provider_role)
  );

-- The client_read SELECT policies (client_id = auth.uid()::text) are left intact.
--
-- Verify after apply (expect the *_insert_on_client policies present, the *_all
-- policies gone):
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in ('coach_focus_banners','coach_pushed_items')
--   order by tablename, cmd;
