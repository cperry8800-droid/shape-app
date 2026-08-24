-- Age visibility: an opt-in flag, and one door that returns a birthdate only to
-- someone entitled to derive an age from it.
--
-- ⚠ THE BIRTHDATE IS THE PII; THE AGE IS THE SAFE, DERIVED FORM. The whole point
-- of this migration is that no caller ever receives a date they are not already
-- entitled to. The read path lives in 2026-08-22-age-visibility-server-only.sql;
-- this file adds only the opt-in COLUMN. See the note at the foot of this file.
--
-- ⚠ WHY A COLUMN AND NOT A KEY IN client_profiles.data. The existing preference
-- blob would have worked for a display toggle, but this flag GATES DISCLOSURE of
-- personal data. `(data->>'age_public')::boolean` is absent / null / 'false' /
-- false depending on who wrote it, and a security decision must not depend on
-- which. A typed NOT NULL DEFAULT false column has exactly two states, lives on
-- the same row as the date it governs (so the function needs no join, and cannot
-- be defeated by a MISSING preferences row), and defaults to private.
--
-- ⚠ AGE IS NOT COMPUTED HERE, DELIBERATELY. Two implementations of the 18+ rule
-- already exist and are held in step by tests/age-derive-mirror.test.mjs; the
-- set_over_18() trigger is a third piece of anniversary arithmetic. Postgres
-- CLAMPS an impossible anniversary (Feb 29 - interval '18 years' -> Feb 28) while
-- JS Date.UTC ROLLS it forward to Mar 1 — a divergence this repo has already been
-- bitten by. Adding age arithmetic here would put a fourth copy in a fourth
-- language. The date crosses to the Node server and ageFromDob() decides, once.

alter table public.profiles
  add column if not exists age_public boolean not null default false;

comment on column public.profiles.age_public is
  'Member opt-in to showing their AGE (never their birthdate) on their public profile. '
  'Default false: absence of a choice is not consent. Coaches see their own clients'' age '
  'regardless of this flag, which is why member_dobs_for_viewer() checks the coach '
  'relationship separately rather than folding it into this column.';

-- ── The read path is NOT here, deliberately ──────────────────────────
--
-- ⚠ THIS FILE ORIGINALLY CREATED `member_dob_for_viewer(uuid)` — A FUNCTION
-- RETURNING `date` — AND GRANTED EXECUTE ON IT TO `authenticated`. PostgREST
-- exposes every function in `public`, so that grant made raw `date_of_birth`
-- readable from any signed-in browser console, defeating the reduction to an
-- integer that this feature exists to perform. It was superseded the same day by
-- the batch door and dropped.
--
-- ⚠ IT IS REMOVED HERE RATHER THAN LEFT FOR A LATER FILE TO DROP, BECAUSE
-- FILENAME ORDER DOES NOT MATCH THE ORDER THESE WERE APPLIED. `-` (0x2D) sorts
-- before `.` (0x2E), so a replay by filename runs:
--
--     2026-08-22-age-visibility-batch.sql
--     2026-08-22-age-visibility-server-only.sql
--     2026-08-22-age-visibility.sql        <- this file, LAST
--
-- The drop in -batch.sql therefore ran BEFORE the create, and any environment
-- rebuilt from these files would have ended with the grant restored and nothing
-- left to revoke it. Production is unaffected — the applied order was correct —
-- but a replay was one `psql -f` away from re-opening it.
--
-- Encoding the order in the filenames would have fixed only a replay that honours
-- names. Removing the function makes the outcome ORDER-INDEPENDENT: no sequence of
-- these three files can produce a browser-callable date door.
--
-- The surviving door is `member_dobs_for_viewer(viewer uuid, targets uuid[])` in
-- 2026-08-22-age-visibility-server-only.sql, granted to `service_role` alone and
-- reached only through /api/members/ages, which returns integers.
