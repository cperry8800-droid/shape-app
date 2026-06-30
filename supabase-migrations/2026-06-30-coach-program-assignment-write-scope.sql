-- Program-assignment write-scope hardening — AUTHZ-P2-program-idor
-- (docs/SECURITY-AUDIT-2026-06-30.md §2c).
--
-- The gap: coach_program_assignments had a single "owner_write" (FOR ALL) policy
-- whose WITH CHECK was only `owner_id = auth.uid()` — never that the caller
-- ACTIVELY coaches the target client. /api/program-tools/templates inserted
-- assignments with an attacker-supplied client_id, so a coach could plant a fake
-- "assigned program" on ANY member (the row is client-readable where
-- client_id = auth.uid(), and surfaces on /api/clients/[id]/shared-overview).
--
-- Fix (mirrors 2026-06-17-coach-write-scope.sql): split the broad ALL policy into
-- owner-scoped select/update/delete (history stays editable) + a stricter INSERT
-- requiring an active discipline subscription to the target client
-- (is_discipline_coach_on_client). The route re-checks via unauthorizedAssignTargets
-- for a clean 403; both layers enforce.
--
-- is_discipline_coach_on_client(uuid, text) already exists (2026-06-17). Idempotent.

drop policy if exists "coach_program_assignments_owner_write" on public.coach_program_assignments;

drop policy if exists "coach_program_assignments_owner_select" on public.coach_program_assignments;
create policy "coach_program_assignments_owner_select" on public.coach_program_assignments
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "coach_program_assignments_owner_update" on public.coach_program_assignments;
create policy "coach_program_assignments_owner_update" on public.coach_program_assignments
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "coach_program_assignments_owner_delete" on public.coach_program_assignments;
create policy "coach_program_assignments_owner_delete" on public.coach_program_assignments
  for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "coach_program_assignments_insert_on_client" on public.coach_program_assignments;
create policy "coach_program_assignments_insert_on_client" on public.coach_program_assignments
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_discipline_coach_on_client(coach_program_assignments.client_id, coach_program_assignments.provider_role)
  );

-- The client_read SELECT policy (client_id = auth.uid()) is left intact.
--
-- Verify after apply (expect coach_program_assignments_insert_on_client present,
-- coach_program_assignments_owner_write gone):
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='coach_program_assignments' order by cmd;
