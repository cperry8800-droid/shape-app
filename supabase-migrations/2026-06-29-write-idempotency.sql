-- Server write idempotency — close three double-submit / read-then-write races the
-- race audit confirmed. Each: a write with no in-flight lock and no unique/idempotency
-- key, so a double-tap (or retry / two tabs) inserts duplicate rows.
--
-- Adds unique indexes (idempotent; de-dups any existing rows first) so a second write
-- conflicts instead of duplicating; the routes upsert / catch the conflict.

-- ── One coach review per (user, coach). De-dup keeping the newest, then enforce. ──
delete from public.coach_reviews a using public.coach_reviews b
where a.user_id = b.user_id and a.coach_slug = b.coach_slug
  and (a.created_at, a.ctid) < (b.created_at, b.ctid);
create unique index if not exists coach_reviews_user_slug_uniq
  on public.coach_reviews (user_id, coach_slug);

-- ── One recipe review per (user, recipe). ──
delete from public.recipe_reviews a using public.recipe_reviews b
where a.user_id = b.user_id and a.recipe_slug = b.recipe_slug
  and (a.created_at, a.ctid) < (b.created_at, b.ctid);
create unique index if not exists recipe_reviews_user_slug_uniq
  on public.recipe_reviews (user_id, recipe_slug);

-- ── At most one ACTIVE lead boost per provider. Expire older duplicate actives, then a
--    partial unique index rejects a concurrent second active redemption. ──
update public.coach_lead_boosts a set status = 'expired'
from public.coach_lead_boosts b
where a.provider_id = b.provider_id and a.status = 'active' and b.status = 'active'
  and (a.starts_at, a.ctid) < (b.starts_at, b.ctid);
create unique index if not exists coach_lead_boosts_active_uniq
  on public.coach_lead_boosts (provider_id) where status = 'active';
