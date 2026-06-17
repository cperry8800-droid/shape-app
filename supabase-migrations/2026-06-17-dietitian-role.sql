-- Dietitian (RD/RDN) as a first-class provider role.
--
-- A dietitian and a nutritionist are the SAME discipline (nutrition): a dietitian
-- rides the existing nutritionist provider rails — the nutritionists table, the
-- subscriptions.provider_role = 'nutritionist' key, is_coach_on_client /
-- is_discipline_coach_on_client, and the hardened POST /api/nutritionist/meal-plan
-- write path — so NO per-table CHECK constraints change and the shared
-- trainer+nutrition record works unchanged. The role is distinguished by:
--   • profiles.role = 'dietitian'   (free text — no constraint; app dispatch +
--     the discipline-aware engine treat it as the nutrition owner), and
--   • nutritionists.credential      (rd | rdn) — the RD/RDN marker for the label
--     and a future "verified dietitian" badge.
--
-- Idempotent. Safe to re-run.

alter table public.nutritionists
  add column if not exists credential text
  check (credential is null or credential in ('rd', 'rdn'));

comment on column public.nutritionists.credential is
  'Registered-dietitian credential (rd|rdn). When set, the provider reads as a Dietitian (RD/RDN); otherwise a Nutritionist. Same nutrition discipline either way.';
