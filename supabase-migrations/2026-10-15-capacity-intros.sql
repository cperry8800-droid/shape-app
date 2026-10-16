-- A coach at capacity decides whether free intros stay open (client-onboarding task #10).
-- Idempotent, safe to re-run.
--
-- Owner, 2026-10-15, on the at-capacity toggle: "make sure their at capacity toggle works and is
-- routed properly, which basically makes it so they cant add new clients, but clients can still be
-- added to waitlist", and on whether members may still book a free intro at capacity: "let the
-- coach decide".
--
-- Called by:
--   src/app/api/my-booking-rules/route.ts and src/app/api/coach/capacity/route.ts (the coach saves it)
--   src/app/api/consultation/route.ts   (books an intro at capacity only when it is on)
--   src/app/api/availability/route.ts   (the booking pages show it in `rules`)
--
-- provider_booking_rules.intros_at_capacity: off by default, which is what happens today (an intro
-- is refused while the coach is at capacity). A member with a live waitlist invite can book one
-- either way. Public read, like the rest of the row: a booking page has to know whether to offer
-- times. The owner write policy already covers the column.

alter table public.provider_booking_rules
  add column if not exists intros_at_capacity boolean not null default false;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_booking_rules'
      and column_name = 'intros_at_capacity' and is_nullable = 'NO' and column_default = 'false'
  ) then
    raise exception 'provider_booking_rules.intros_at_capacity is not NOT NULL DEFAULT false';
  end if;
end $$;
