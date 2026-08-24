-- The batch read path — SUPERSEDED, and deliberately left with no function in it.
--
-- ⚠ THIS FILE USED TO CREATE member_dobs_for_viewer(uuid[]) AND GRANT EXECUTE ON IT
-- TO `authenticated`. That function returns raw `date_of_birth` values, and PostgREST
-- exposes every function in `public` — so the grant WAS the door: any signed-in member
-- could call /rest/v1/rpc/member_dobs_for_viewer from a browser console and read the
-- exact birthdates of everyone who had opted in to showing their AGE. They consented to
-- the derived integer, not the PII it is derived from.
--
-- ⚠ THE CREATE IS REMOVED RATHER THAN RE-GRANTED, for the same reason the scalar one was
-- removed from 2026-08-22-age-visibility.sql: FILENAME ORDER IS NOT THE ORDER MIGRATIONS
-- RAN. `-` (0x2D) sorts before `.` (0x2E), so a replay by filename runs -batch, then
-- -server-only, then the base file — and any ordering that puts a create-and-grant after
-- the lockdown re-opens the hole. Narrowing this grant to service_role would still leave
-- a SECOND definition of the entitlement rule in the tree, and the copy that stops being
-- edited is the one that goes wrong.
--
-- So the outcome is ORDER-INDEPENDENT: no migration in this repo creates a
-- browser-callable raw-date function, and two of them drop the ones that existed. The
-- live read path is member_dobs_for_viewer(viewer uuid, targets uuid[]) in
-- 2026-08-22-age-visibility-server-only.sql, granted to service_role alone. Its header
-- carries the entitlement rule this file used to document.

begin;

-- The scalar form is dead: its only caller was /api/members/[id]/age, which this wave
-- replaced with the batch route. Dropped rather than left in place — an uncalled second
-- copy of an authorization rule is the copy that drifts.
drop function if exists public.member_dob_for_viewer(uuid);

-- ⚠ AND THE ONE-ARGUMENT BATCH FORM THIS FILE ITSELF SHIPPED. An environment provisioned
-- before this change still carries it WITH the `authenticated` grant, so removing the
-- create above is not enough on its own — the door has to be shut where it was already
-- opened. -server-only.sql drops it too; both are idempotent, and either order is safe.
drop function if exists public.member_dobs_for_viewer(uuid[]);

commit;
