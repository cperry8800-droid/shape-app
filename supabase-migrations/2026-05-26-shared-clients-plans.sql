-- Shared-coach access to the *other* coach's active program assignment for a
-- shared client. Lets a trainer see their client's active nutrition plan
-- header (and vice versa) on the per-client overview page.
--
-- Read-only. Names "shared_coach_reads_assignments" /
-- "shared_coach_reads_templates" mirror the convention used by the
-- 2026-05-26-shared-clients migration. Idempotent.

drop policy if exists "shared_coach_reads_assignments" on public.coach_program_assignments;
create policy "shared_coach_reads_assignments"
  on public.coach_program_assignments for select
  to authenticated
  using (
    status in ('assigned', 'active', 'paused')
    and public.is_coach_on_client(coach_program_assignments.client_id)
  );

-- Allow the counterpart to read the template metadata (title/goal/level/etc.)
-- attached to an assignment they can already see. Scoped to templates that
-- actually have at least one assignment to a shared client — we don't open
-- the whole library to other coaches.
drop policy if exists "shared_coach_reads_templates" on public.coach_program_templates;
create policy "shared_coach_reads_templates"
  on public.coach_program_templates for select
  to authenticated
  using (
    exists (
      select 1
      from public.coach_program_assignments a
      where a.program_template_id = coach_program_templates.id
        and a.status in ('assigned', 'active', 'paused')
        and public.is_coach_on_client(a.client_id)
    )
  );
