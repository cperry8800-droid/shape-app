-- P6 (2026-11-05): "who's on this plan" and "Most used", for programs and meal plans.
--
-- An assignment already names the template it came from in its payload: a program's sessions since
-- the builder shipped (client_workouts.payload.template.id), and a meal plan's from today
-- (client_meal_plans.payload.template.id, written by /api/nutritionist/meal-plan). The libraries read
-- them through /api/coach/plans/usage, filtering on that JSON path.
--
-- These two indexes make those reads cheap. They are OPTIONAL: the code reads the same rows with or
-- without them (a sequential scan of one coach's published rows), so nothing waits on this file.
-- Partial on published rows, which is all the usage route reads. Idempotent; safe to run twice.

create index if not exists client_workouts_template_idx
  on public.client_workouts ((payload->'template'->>'id'))
  where status = 'published';

create index if not exists client_meal_plans_template_idx
  on public.client_meal_plans ((payload->'template'->>'id'))
  where status = 'published';
