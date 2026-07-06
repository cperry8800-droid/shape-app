-- Per-user UI locale (BCP-47 code from the supported set, e.g. 'en','ar','ja').
-- Server-readable mirror of the app's locale preference so later i18n sub-projects
-- (localized emails/notifications) can address a member in their language.
-- Dedicated text column (cheaper to read than JSONB), same shape as timezone.
-- Idempotent; no backfill source exists (device/app sets it on next open).
alter table public.client_profiles
  add column if not exists locale text;
