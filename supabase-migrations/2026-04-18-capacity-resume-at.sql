-- Optional auto-resume date for "at capacity" pause.
--
-- When a coach flips on at_capacity, they can optionally pick a date
-- to auto-resume accepting new clients. While at_capacity is true and
-- capacity_resume_at is in the past, the trainer's next dashboard
-- visit (see getMyProvider in public/supabase.js) lazily flips
-- at_capacity back to false. Every read path (profile CTAs, listing
-- badge, /subscribe + /purchase server actions) also treats
-- "at_capacity AND resume_at <= now()" as no-longer-at-capacity so
-- the gate lifts in real time even if the trainer hasn't logged in.

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS capacity_resume_at timestamptz;

ALTER TABLE public.nutritionists
  ADD COLUMN IF NOT EXISTS capacity_resume_at timestamptz;
