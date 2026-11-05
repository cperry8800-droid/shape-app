-- Dismiss and snooze a coach signal (P2, 2026-11-05: one engine everywhere, plus coach actions).
--
-- Owner: "I dont want coaches being overwhelmed with data." A coach can set aside one reason the signal
-- engine raised about one client — "No contact in 7 days" on Sam, say — from the website's Today and
-- Clients and from the app's client file:
--   · Dismiss: hidden until the reason changes (`until` null);
--   · Snooze: hidden until a time (`until`), and also only while the reason is the same.
-- "The same reason" is the flag's episode signature (`reason_sig`, dashSignals.js: each rule's `sig`,
-- e.g. the last contact's time, the Monday a check-in was missed from, the week of a weekly reading),
-- so a new episode of the same kind comes back on its own. One row per coach, client and reason.
--
-- Read and written by the coach under their own session (RLS below), and by the hourly push cron with
-- the service role (it reads a coach's own rows, coach_id = that coach). The app and the website
-- tolerate this table not existing yet: until this runs, the read errors, nothing is hidden, and the
-- controls say they could not save.
--
-- Erasure: both people are auth users and both keys cascade, so deleting either account removes the
-- rows that name them (src/lib/account-erasure.ts step 3, the auth delete).
--
-- One transaction, re-runnable (create if not exists; the policy is dropped only to be created again),
-- a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

create table if not exists public.coach_signal_dismissals (
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  -- The flag's key (contact_gap, checkin_overdue, …) and its episode signature.
  reason_key text not null check (reason_key ~ '^[a-z_]{1,40}$'),
  reason_sig text not null check (char_length(reason_sig) between 1 and 300),
  -- null = until the reason changes; a time = snoozed until then.
  until timestamptz,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id, reason_key)
);

alter table public.coach_signal_dismissals enable row level security;

-- A coach reads and changes only their own rows, and sets a reason aside only on a client they coach
-- (is_coach_on_client: an open subscription, past_due included). A row whose coaching has ended stays
-- readable and deletable by its coach, and hides nothing anyone else sees.
drop policy if exists coach_signal_dismissals_read on public.coach_signal_dismissals;
create policy coach_signal_dismissals_read on public.coach_signal_dismissals
  for select to authenticated
  using (coach_id = auth.uid());

drop policy if exists coach_signal_dismissals_insert on public.coach_signal_dismissals;
create policy coach_signal_dismissals_insert on public.coach_signal_dismissals
  for insert to authenticated
  with check (coach_id = auth.uid() and public.is_coach_on_client(client_id));

drop policy if exists coach_signal_dismissals_update on public.coach_signal_dismissals;
create policy coach_signal_dismissals_update on public.coach_signal_dismissals
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_coach_on_client(client_id));

drop policy if exists coach_signal_dismissals_delete on public.coach_signal_dismissals;
create policy coach_signal_dismissals_delete on public.coach_signal_dismissals
  for delete to authenticated
  using (coach_id = auth.uid());

revoke all on public.coach_signal_dismissals from anon;
grant select, insert, update, delete on public.coach_signal_dismissals to authenticated;

-- The guard: the table is there, RLS is on, the four policies exist, and anon has nothing.
do $$
begin
  if to_regclass('public.coach_signal_dismissals') is null then
    raise exception 'coach_signal_dismissals was not created';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.coach_signal_dismissals'::regclass) then
    raise exception 'coach_signal_dismissals has row level security off';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'coach_signal_dismissals'
      and policyname in ('coach_signal_dismissals_read', 'coach_signal_dismissals_insert',
                         'coach_signal_dismissals_update', 'coach_signal_dismissals_delete')) <> 4 then
    raise exception 'coach_signal_dismissals is missing a policy';
  end if;
  if has_table_privilege('anon', 'public.coach_signal_dismissals', 'select') then
    raise exception 'anon can read coach_signal_dismissals';
  end if;
end;
$$;

commit;
