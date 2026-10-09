// Mutation spec for H5 (store credit reserved at checkout) and H6 (Lead Boosts redeemed, not
// granted). Each mutation breaks one clause of the migration, the checkout route, the webhook or
// the boost route; tests/store-credit-reservation.test.mjs, tests/lead-boost-redemption.test.mjs
// and the definer audit must notice every one. The Postgres halves (the lock, the conversion,
// the sweep, the race) are not mutated here: the runner does not run Postgres, and the replica
// run recorded in the PR is their test.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/store-credit-lead-boost-2026-10-09.mutations.mjs --fail-on-skipped
const MIG = 'supabase-migrations/2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql';
const CHECKOUT = 'src/app/api/stripe/checkout-session/route.ts';
const WEBHOOK = 'src/app/api/stripe/webhook/route.ts';
const BOOST = 'src/app/api/lead-boosts/route.ts';
const CATALOGUE = 'src/lib/store-catalogue.ts';

export default {
  test: 'node --test tests/store-credit-reservation.test.mjs tests/lead-boost-redemption.test.mjs tests/definer-grants.test.mjs tests/capped-reads.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the migration: H5 ──
    { name: 'a member can call reserve_store_credit on any wallet (authenticated keeps the default EXECUTE)', file: MIG,
      find: 'revoke all on function public.reserve_store_credit(uuid, text, text, integer) from authenticated;\n',
      replace: '' },
    { name: 'the 4-argument consume_store_credit is left beside the new one', file: MIG,
      find: 'drop function if exists public.consume_store_credit(uuid, text, text, integer);\n',
      replace: '' },
    { name: 'a reservation can be released twice (the release-row check is dropped)', file: MIG,
      find: "  if exists (select 1 from public.store_credits where ref = p_ref and source = 'reservation_release') then\n    return 0;\n  end if;\n",
      replace: '' },
    { name: 'the sweep accepts any age, so a reservation behind a live session is released', file: MIG,
      find: "  v_age interval := case when p_older_than is null or p_older_than < interval '24 hours' then interval '48 hours' else p_older_than end;",
      replace: "  v_age interval := coalesce(p_older_than, interval '48 hours');" },
    { name: 'reserve stops sweeping the member\'s stale reservations first', file: MIG,
      find: "  perform public.sweep_store_credit_reservations(p_user_id, interval '48 hours');\n",
      replace: '' },
    { name: 'converting a reservation writes the debit without the release: the wallet is debited twice', file: MIG,
      find: "    insert into public.store_credits (user_id, kind, cents, source, ref, note)\n    values (p_user_id, p_kind, v_res, 'reservation_release', p_reservation_ref, 'Reservation converted at checkout');\n    v_take := least(v_res, p_amount_cents);",
      replace: '    v_take := least(v_res, p_amount_cents);' },
    { name: 'the release index is dropped: replay idempotency rests on the function alone', file: MIG,
      find: "create unique index if not exists store_credits_reservation_release_uniq\n  on public.store_credits (ref) where source = 'reservation_release';\n",
      replace: '' },
    // ── the migration: H6 ──
    { name: 'redeem_lead_boost loses its pin', file: MIG,
      find: "create or replace function public.redeem_lead_boost(p_item_id text, p_role text, p_provider_id bigint default null)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp",
      replace: "create or replace function public.redeem_lead_boost(p_item_id text, p_role text, p_provider_id bigint default null)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public" },
    { name: 'anon can redeem a Lead Boost (the anon revoke is dropped)', file: MIG,
      find: 'revoke all on function public.redeem_lead_boost(text, text, bigint) from anon;\n',
      replace: '' },
    { name: 'any catalogue row redeems as a boost (the kind and length checks are dropped)', file: MIG,
      find: "  if not found or v_kind is distinct from 'lead_boost' or v_days is null then\n    raise exception 'unknown_item' using errcode = '22023';\n  end if;",
      replace: "  if not found then\n    raise exception 'unknown_item' using errcode = '22023';\n  end if;" },
    { name: 'a named provider row need not be the caller\'s', file: MIG,
      find: "    select id into v_provider_id from public.trainers\n    where owner_id = v_uid and (p_provider_id is null or id = p_provider_id)\n    order by id limit 1;",
      replace: "    select id into v_provider_id from public.trainers\n    where (p_provider_id is null and owner_id = v_uid) or id = p_provider_id\n    order by id limit 1;" },
    { name: 'the active-boost check before the debit is dropped', file: MIG,
      find: "  if exists (select 1 from public.coach_lead_boosts where provider_id = v_provider_id and status = 'active') then\n    raise exception 'boost_active' using errcode = 'P0001';\n  end if;\n",
      replace: '' },
    { name: 'a short balance still redeems (the points check is dropped)', file: MIG,
      find: "  if v_balance < v_cost then\n    raise exception 'insufficient_points' using errcode = 'P0001';\n  end if;\n",
      replace: '' },
    { name: 'a lost race keeps the debit (the unique_violation handler swallows instead of raising)', file: MIG,
      find: "  exception when unique_violation then\n    -- A concurrent redemption won the active slot: everything above rolls back with this.\n    raise exception 'boost_active' using errcode = 'P0001';\n  end;",
      replace: "  exception when unique_violation then\n    null;\n  end;" },
    { name: 'the catalogue rows never get their length', file: MIG,
      find: "update public.store_catalogue set boost_days = 14 where id = 'lead_boost_14' and boost_days is distinct from 14;\n",
      replace: '' },
    // ── the checkout route ──
    { name: 'the checkout discounts what it READ, not what it reserved', file: CHECKOUT,
      find: '        storeCreditApplied = got;\n        storeCreditRef = got > 0 ? ref : null;',
      replace: '        storeCreditRef = got > 0 ? ref : null;' },
    { name: 'the checkout never reserves (the wallet is read and the charge lowered, as before)', file: CHECKOUT,
      find: '      if (storeCreditApplied > 0) {\n        const ref = crypto.randomUUID();',
      replace: '      if (false) {\n        const ref = crypto.randomUUID();' },
    { name: 'the reservation ref is not stamped on the session', file: CHECKOUT,
      find: "        ...(storeCreditRef ? { store_credit_ref: storeCreditRef } : {}),\n",
      replace: '' },
    { name: 'a failed Stripe call keeps the reservation for 48 hours', file: CHECKOUT,
      find: "  } catch (err) {\n    await releaseReservation();\n    return dbError(err, 'mobile checkout-session', 500, 'Could not start checkout.');",
      replace: "  } catch (err) {\n    return dbError(err, 'mobile checkout-session', 500, 'Could not start checkout.');" },
    { name: 'a reservation error discounts the full read amount anyway', file: CHECKOUT,
      find: '        const got = reserveErr ? 0 : Math.max(0, Math.min(storeCreditApplied, Math.floor(Number(reserved ?? 0)) || 0));',
      replace: '        const got = reserveErr ? storeCreditApplied : Math.max(0, Math.min(storeCreditApplied, Math.floor(Number(reserved ?? 0)) || 0));' },
    // ── the webhook ──
    { name: 'the webhook consumes without naming the reservation', file: WEBHOOK,
      find: "  let { data, error } = await admin.rpc('consume_store_credit', { ...base, p_reservation_ref: args.reservationRef });",
      replace: "  let { data, error } = await admin.rpc('consume_store_credit', base);" },
    { name: 'a shortfall is silent', file: WEBHOOK,
      find: "            else if (consumed.taken < creditCents) {\n              console.error('[stripe webhook] store credit shortfall: the member was discounted more than the wallet gave up', {",
      replace: "            else if (false) {\n              console.error('[stripe webhook] store credit shortfall: the member was discounted more than the wallet gave up', {" },
    { name: 'no fallback to the 4-argument function on a database without the new one', file: WEBHOOK,
      find: "  if (error && isUndefinedFunction(error)) ({ data, error } = await admin.rpc('consume_store_credit', base));\n",
      replace: '' },
    { name: 'an expired session releases nothing', file: WEBHOOK,
      find: "        if (ref) {\n          const { error: releaseErr } = await admin.rpc('release_store_credit_reservation', { p_ref: ref });",
      replace: "        if (false) {\n          const { error: releaseErr } = await admin.rpc('release_store_credit_reservation', { p_ref: ref });" },
    // ── the boost route and the catalogue ──
    { name: 'any days value maps to the 7-day item', file: CATALOGUE,
      find: '  return boosts.find((p) => p.boostDays === n);',
      replace: '  return boosts.find((p) => p.boostDays === n) ?? boosts[0];' },
    { name: 'a database without redeem_lead_boost reads as a client error, not an outage', file: BOOST,
      find: "      return NextResponse.json({ error: 'Lead Boosts are not switched on yet. Please try again later.' }, { status: 503 });",
      replace: "      return NextResponse.json({ error: 'Lead Boosts are not switched on yet. Please try again later.' }, { status: 400 });" },
    { name: 'a named provider row is dropped on the floor', file: BOOST,
      find: '    p_provider_id: Number.isFinite(providerIdRaw) && providerIdRaw > 0 ? Math.floor(providerIdRaw) : null,',
      replace: '    p_provider_id: null,' },
    { name: 'not enough points reads as success', file: BOOST,
      find: "      return NextResponse.json({ error: 'Not enough points for this Lead Boost.', code: 'insufficient_points' }, { status: 409 });",
      replace: "      return NextResponse.json({ error: 'Not enough points for this Lead Boost.', code: 'insufficient_points' }, { status: 200 });" },
  ],
};
