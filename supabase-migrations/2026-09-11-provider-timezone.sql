-- Per-coach IANA timezone, so a stored availability minute can be resolved to a
-- real instant. Idempotent, safe to re-run.
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
-- provider_availability.start_minute is documented by its OWN migration
-- (2026-04-18-sessions-and-availability.sql) as "minutes since midnight in the
-- coach's local day", and both availability editors write exactly that: the coach
-- toggles the cell marked "9a" and 540 is stored. Nothing recorded WHICH local
-- day that was, so every reader invented an answer, and the three live readers
-- invented three DIFFERENT ones:
--
--   consultation.html + bookingSlots.js  →  540 means 09:00 UTC
--   mobile coachAvailability.mjs         →  540 means 09:00 in the MEMBER's zone
--   the editors + this table's own docs  →  540 means 09:00 where the COACH is
--
-- So a coach in New York who opened 9am had clients booking 5:00 AM on the
-- website and 9:00 AM in the app, for the same row, while both parties were shown
-- a string that was nobody's actual time. Only a coach living in UTC was
-- unaffected. This column is what makes the documented meaning readable, and the
-- writers now stamp it (src/app/api/my-availability/route.ts).
--
-- ── WHY THERE IS NO BACKFILL ─────────────────────────────────────────────────
-- ⚠ THIS WAS HELD AS AN OWNER RULING ON THE GROUNDS THAT EXISTING ROWS ARE
-- AMBIGUOUS -- they MEAN the coach's wall clock and are READ as UTC, so calling
-- them either one is a claim about bookings that already exist. MEASURED on
-- production 2026-09-11, rather than assumed: provider_availability holds ZERO
-- rows and sessions holds ZERO rows. There are no existing bookings and no
-- existing hours, so there is nothing to reinterpret and no claim to make. The
-- ambiguity was real and is empty.
--
-- That is why this file only ADDS a column. Should rows ever predate it, they are
-- handled by the readers rather than by a guess here: a coach with no stored zone
-- offers NO bookable slots and the surface says so, because an hour we cannot
-- place is not an hour we can let a member book.
--
-- ── WHY THE COACH ROW AND NOT THE AVAILABILITY ROW ───────────────────────────
-- A zone is a property of the coach, not of each slot -- nobody keeps Monday in
-- New York and Tuesday in Tokyo. client_profiles.timezone (2026-06-27) is the
-- established precedent for exactly this shape, and the coach's zone is also what
-- a coach-facing calendar wants, which an availability row cannot answer for a
-- coach who has set no hours.
--
-- ⚠ NO CHECK CONSTRAINT, DELIBERATELY. A CHECK cannot join pg_timezone_names (not
-- IMMUTABLE), so validation lives where the house already puts it: at the write
-- (the route rejects anything Intl does not accept as an IANA name) and at the
-- read (shape_user_tz, 2026-07-06, validates by joining pg_timezone_names). An
-- unvalidatable name therefore fails closed instead of being silently trusted.
--
-- ⚠ BOTH TABLES ARE PUBLIC-READ (`trainers public read` / `nutritionists public
-- read`, to anon + authenticated, using(true)), so this column is public too.
-- That is required rather than incidental: the consultation page renders open
-- times for anonymous visitors, and it cannot label an instant without the zone.
-- It discloses nothing the row did not already imply -- provider_availability is
-- itself public-read, so a coach's working hours were already visible; a zone is
-- coarser than the city a marketplace profile publishes.

alter table public.trainers
  add column if not exists timezone text;

alter table public.nutritionists
  add column if not exists timezone text;

comment on column public.trainers.timezone is
  'IANA zone the coach''s provider_availability.start_minute values are expressed in. NULL = never captured; readers must offer no bookable slots rather than assume UTC.';

comment on column public.nutritionists.timezone is
  'IANA zone the coach''s provider_availability.start_minute values are expressed in. NULL = never captured; readers must offer no bookable slots rather than assume UTC.';
