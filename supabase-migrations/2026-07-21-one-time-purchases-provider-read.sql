-- One-time purchases: providers read their OWN sales (BYO PR B, #1799).
--
-- The Business page's origin labels must cover the PURCHASE path — a BYO
-- client who only books a session or buys a meal plan never appears in
-- subscriptions, so without this policy the provider's RLS query returns zero
-- rows silently and the "who found whom" feed under-reports exactly the sales
-- the 0% pitch is about. Mirrors the existing "providers read own
-- subscriptions" policy shape verbatim (ownership via the provider row's
-- owner_id). Idempotent — safe to re-run.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'one_time_purchases'
      and policyname = 'providers read own purchases'
  ) then
    create policy "providers read own purchases" on public.one_time_purchases
      for select using (
        (provider_role = 'trainer' and exists (
          select 1 from public.trainers t
          where t.id = one_time_purchases.provider_id and t.owner_id = auth.uid()
        ))
        or (provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n
          where n.id = one_time_purchases.provider_id and n.owner_id = auth.uid()
        ))
      );
  end if;
end $$;
