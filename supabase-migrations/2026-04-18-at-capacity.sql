-- Add an "at capacity" flag so coaches can pause new client sign-ups
-- without taking down their profile entirely.
--
-- When true:
--   * The Subscribe / Book / Buy Plan CTAs are hidden on the public
--     profile page and replaced with a "currently at capacity" notice.
--   * The marketplace listing card shows an "At capacity" badge.
--   * The /subscribe and /purchase server actions refuse to create a
--     Stripe Checkout Session and bounce back to the profile with an
--     error so the buttons can never be bypassed by URL.

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS at_capacity boolean NOT NULL DEFAULT false;

ALTER TABLE public.nutritionists
  ADD COLUMN IF NOT EXISTS at_capacity boolean NOT NULL DEFAULT false;
