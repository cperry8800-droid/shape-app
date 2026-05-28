-- Let clients read their OWN coach subscriptions.
--
-- The per-coach `subscriptions` table previously had a single SELECT policy
-- ("providers read own subscriptions", 2026-04-14) which scopes reads to the
-- provider who owns the trainer/nutritionist row. There was no policy letting
-- a CLIENT read the rows where they are the subscriber.
--
-- Consequence: the client dashboard "coach team" (src/app/api/client/dashboard)
-- and the Client > Team page (src/app/api/client/team) query `subscriptions`
-- scoped to the signed-in user and rely on RLS — so they returned ZERO rows
-- for every real client, and the team list was always empty.
--
-- This adds the missing owner-scoped client read policy. RLS SELECT policies
-- are OR-combined, so the existing provider-read policy is unaffected.
--
-- Idempotent / safe to re-run.

drop policy if exists "clients read own subscriptions" on public.subscriptions;
create policy "clients read own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = client_id);
