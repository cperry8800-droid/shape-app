-- Workout review notes: let the author delete their own note.
--
-- coach_workout_review_notes (2026-05-02) already scopes writes correctly:
--   • insert — reviewer_id = auth.uid() AND can_access_workout_session(session)
--     AND the caller owns the provider row for the note's provider_role;
--   • update — reviewer_id = auth.uid() (author only);
--   • read   — session participants, coach_private gated to the author.
-- The only missing CRUD verb is DELETE — so an author (and the AI add_review_note
-- tool's undo) can withdraw a note they created. Author-scoped, mirroring update.
--
-- Idempotent. Safe to re-run.

drop policy if exists "reviewers delete own workout review notes" on public.coach_workout_review_notes;
create policy "reviewers delete own workout review notes"
  on public.coach_workout_review_notes for delete
  to authenticated
  using (reviewer_id = auth.uid());
