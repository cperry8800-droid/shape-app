// Mutation spec for the coach fee (owner, 2026-11-12): 15% on clients who sign up through Shape, no
// cut on a coach's existing clients, the coach's declared list.
// Run: SHAPE_PGLITE=<a folder with node_modules/@electric-sql/pglite> node scripts/mutate.mjs \
//   --spec tests/mutations/coach-existing-clients-2026-11-12.mutations.mjs --fail-on-skipped
// ⚠ THE MIGRATION'S BEHAVIOUR IS KILLED BY tests/coach-existing-clients-sql.test.mjs, WHICH NEEDS PGLITE:
// without it that file's database half is skipped and the entries marked (db) survive.
const SQL = 'supabase-migrations/2026-11-12-coach-existing-clients.sql';
const ORIGIN = 'src/lib/coach-origin.mjs';
const RESOLVER = 'src/lib/coach-origin.ts';
const WEBHOOK = 'src/app/api/stripe/webhook/route.ts';
const EXPORT = 'public/newdesign/dashExport.js';
const SERVICE = 'mobile-app/src/services/coachExistingClients.mjs';
const EDITOR = 'mobile-app/src/broadsheet/BSCoachExistingClients.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const HELP = 'public/help.html';
const TERMS = 'public/terms.html';
const COACHES = 'public/newdesign/coaches.jsx';
const NORA = 'src/lib/ai/shapeKnowledge.mjs';
export default {
  test: 'node --test tests/coach-existing-clients-sql.test.mjs tests/coach-existing-clients.test.mjs tests/coach-origin.test.mjs tests/payment-notices.test.mjs tests/coach-export.test.mjs tests/marketing-earnings.test.mjs tests/shape-knowledge.test.mjs',
  mutations: [
    // ── the checkout's origin (db) ─────────────────────────────────────────────
    { name: 'a listed member in the waiting room pays 0% (db)', file: SQL,
      find: '  -- 1) Waitlist wins: Shape-found demand, whatever else is true.\n  if exists (',
      replace: '  -- 1) Waitlist wins: Shape-found demand, whatever else is true.\n  if false and exists (' },
    { name: 'an unconfirmed email counts as listed (db)', file: SQL,
      find: '       and u.email is not null and u.email_confirmed_at is not null\n', replace: '       and u.email is not null\n' },
    { name: 'one trainer\'s list pays 0% at another\'s checkout (db)', file: SQL,
      find: '     where e.provider_role = p_provider_role and e.provider_id = p_provider_id\n       and u.email is not null',
      replace: '     where e.provider_role = p_provider_role\n       and u.email is not null' },
    { name: 'the account email is compared as typed, not trimmed and lowercased (db)', file: SQL,
      find: '       and e.email = lower(btrim(u.email))\n', replace: '       and e.email = u.email\n' },
    { name: 'an existing client is stamped as a link client (db)', file: SQL,
      find: "    return query select 'coach_existing'::text, null::uuid; return;", replace: "    return query select 'coach_link'::text, null::uuid; return;" },
    { name: 'an expired tag still pays 0% (db)', file: SQL,
      find: '    and r.provider_id = p_provider_id and r.expires_at > now()\n  order by r.expires_at desc',
      replace: '    and r.provider_id = p_provider_id\n  order by r.expires_at desc' },
    { name: 'an invite still writes a 0% tag (db)', file: SQL,
      find: '  -- 2026-11-12: an invite is not an existing-client claim. Nothing is written.\n  return null;',
      replace: "  insert into public.coach_referrals (coach_user_id, provider_role, provider_id, client_id, channel, token, expires_at)\n  values (auth.uid(), p_provider_role, p_provider_id, p_client_id, 'dm', null, now() + interval '30 days')\n  on conflict (coach_user_id, provider_role, provider_id, client_id) where client_id is not null\n  do update set channel = 'dm', token = null, expires_at = excluded.expires_at;\n  return null;" },
    { name: 'opening a link still starts a 0% window (db)', file: SQL,
      find: "  -- 2026-11-12: opening a coach's link no longer starts or extends a 0% window. Nothing is written;\n  -- the provider is returned as before.\n  return query select v_role, v_pid;",
      replace: "  insert into public.coach_referrals (coach_user_id, provider_role, provider_id, client_id, channel, token, expires_at)\n  values (v_coach, v_role, v_pid, auth.uid(), 'link', null, now() + interval '30 days')\n  on conflict (coach_user_id, provider_role, provider_id, client_id) where client_id is not null\n  do update set channel = 'link', token = null, expires_at = excluded.expires_at;\n  return query select v_role, v_pid;" },
    { name: 'the money rows refuse coach_existing', file: SQL,
      find: "alter table public.subscriptions add constraint subscriptions_origin_check\n  check (origin in ('marketplace', 'coach_invite', 'coach_link', 'coach_existing'));",
      replace: "alter table public.subscriptions add constraint subscriptions_origin_check\n  check (origin in ('marketplace', 'coach_invite', 'coach_link'));" },
    // ── the list (db) ──────────────────────────────────────────────────────────
    { name: 'the window counts from joining alone, closed for a coach who joined before the rule (db)', file: SQL,
      find: "  select greatest(coalesce(p_joined, timestamptz '2026-11-12 00:00:00+00'),\n                  timestamptz '2026-11-12 00:00:00+00') + interval '1440 hours'",
      replace: "  select coalesce(p_joined, timestamptz '2026-11-12 00:00:00+00') + interval '1440 hours'" },
    { name: 'a closed list still takes emails (db)', file: SQL,
      find: '  v_closes := public.coach_existing_clients_closes_at(v_joined);\n  if now() >= v_closes then',
      replace: '  v_closes := public.coach_existing_clients_closes_at(v_joined);\n  if false then' },
    { name: 'a closed list still lets one go (db)', file: SQL,
      find: '  if now() >= public.coach_existing_clients_closes_at(v_joined) then', replace: '  if false then' },
    { name: 'a coach lists their own email (db)', file: SQL,
      find: '     and norm.e is distinct from v_own\n', replace: '' },
    { name: 'any number at a time (db)', file: SQL,
      find: '  if coalesce(cardinality(p_emails), 0) > 200 then', replace: '  if false then' },
    { name: 'any coach adds to another\'s list (db)', file: SQL,
      find: "    raise exception 'at most 200 emails at a time' using errcode = '22023';\n  end if;\n  if p_provider_role = 'trainer' then\n    select t.created_at into v_joined from public.trainers t\n     where t.id = p_provider_id and t.owner_id = auth.uid();",
      replace: "    raise exception 'at most 200 emails at a time' using errcode = '22023';\n  end if;\n  if p_provider_role = 'trainer' then\n    select t.created_at into v_joined from public.trainers t\n     where t.id = p_provider_id;" },
    { name: 'anyone reads a coach\'s list (db)', file: SQL,
      find: "  if not v_found then\n    raise exception 'not your provider row' using errcode = '42501';\n  end if;\n\n  v_closes := public.coach_existing_clients_closes_at(v_joined);\n  return jsonb_build_object(",
      replace: "  v_closes := public.coach_existing_clients_closes_at(v_joined);\n  return jsonb_build_object(" },
    { name: 'removing an email takes it off every list (db)', file: SQL,
      find: "   where e.provider_role = p_provider_role and e.provider_id = p_provider_id\n     and e.email = lower(btrim(coalesce(p_email, '')));",
      replace: "   where e.email = lower(btrim(coalesce(p_email, '')));" },
    { name: 'the table has no row level security (db)', file: SQL,
      find: 'alter table public.coach_existing_clients enable row level security;\n', replace: '' },
    { name: 'anyone signed in reads every list (db)', file: SQL,
      find: '  using (coach_user_id = auth.uid());', replace: '  using (true);' },
    { name: 'anonymous callers add to a list (db)', file: SQL,
      find: 'revoke all on function public.add_coach_existing_clients(text, bigint, text[]) from public, anon;',
      replace: 'revoke all on function public.add_coach_existing_clients(text, bigint, text[]) from public;' },
    // ── the code's decision ────────────────────────────────────────────────────
    { name: 'the list wins over the waitlist', file: ORIGIN,
      find: "  if (onWaitlist) return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };\n  if (onExistingList === true) return { origin: 'coach_existing', feeBps: BYO_FEE_BPS };",
      replace: "  if (onExistingList === true) return { origin: 'coach_existing', feeBps: BYO_FEE_BPS };\n  if (onWaitlist) return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };" },
    { name: 'anything truthy counts as listed', file: ORIGIN,
      find: '  if (onExistingList === true) return', replace: '  if (onExistingList) return' },
    { name: 'coach_existing was never issued', file: ORIGIN,
      find: '  coach_existing: Object.freeze([BYO_FEE_BPS]),\n', replace: '' },
    { name: 'coach_existing is issued at 15%', file: ORIGIN,
      find: '  coach_existing: Object.freeze([BYO_FEE_BPS]),', replace: '  coach_existing: Object.freeze([MARKETPLACE_FEE_BPS]),' },
    { name: 'an inherited name passes as an origin', file: ORIGIN,
      find: '  const issued = Object.prototype.hasOwnProperty.call(ISSUED_FEE_BPS, origin) ? ISSUED_FEE_BPS[origin] : null;', replace: '  const issued = ISSUED_FEE_BPS[origin];' },
    { name: 'the window ignores the day a coach joined', file: ORIGIN,
      find: '  const from = Number.isFinite(joined) && joined > start ? joined : start;', replace: '  const from = start;' },
    { name: 'the resolver drops coach_existing to 15%', file: RESOLVER,
      find: "    if (row?.origin === 'coach_existing') {", replace: "    if (row?.origin === 'coach_existing_x') {" },
    { name: 'an existing client carries a referral for the webhook to consume', file: RESOLVER,
      find: "      return { origin: 'coach_existing', feeBps: BYO_FEE_BPS, referralId: null };", replace: "      return { origin: 'coach_existing', feeBps: BYO_FEE_BPS, referralId: row.referral_id ?? null };" },
    { name: 'the webhook knows only the 2026-07-21 origins', file: WEBHOOK,
      find: 'const VALID_ORIGINS = new Set<string>(KNOWN_ORIGINS);', replace: "const VALID_ORIGINS = new Set<string>(['marketplace', 'coach_invite', 'coach_link']);" },
    { name: 'the export has no word for an existing client', file: EXPORT,
      find: '    coach_existing: "Existing client",\n', replace: '' },
    // ── the app ────────────────────────────────────────────────────────────────
    { name: 'a closed list reads as a failed save', file: SERVICE,
      find: "const isClosed = (error) => error && /existing_client_list_closed/.test(String(error.message || ''));", replace: 'const isClosed = () => false;' },
    { name: 'before the migration the read is a failure, not hidden', file: SERVICE,
      find: "const isMissing = (error) => error && (error.code === 'PGRST202' || error.code === '42883');", replace: 'const isMissing = () => false;' },
    { name: 'a batch the database refuses for its size', file: SERVICE,
      find: 'export const ADD_BATCH = 200;', replace: 'export const ADD_BATCH = 201;' },
    { name: 'pasted emails are kept as typed', file: SERVICE,
      find: '    const e = part.trim().toLowerCase();', replace: '    const e = part.trim();' },
    { name: 'a failed read draws an empty list', file: EDITOR,
      find: "      if (!r.ok) setRead({ kind: 'failed', list: null });",
      replace: "      if (!r.ok) setRead({ kind: 'ready', list: { closesAt: '2027-01-11T00:00:00Z', open: true, emails: [] } });" },
    { name: 'a closed list is still edited', file: EDITOR,
      find: '  const open = list.open && Date.parse(list.closesAt) > Date.now();', replace: '  const open = true;' },
    { name: 'the sheet\'s invite writes a 0% tag again', file: PROS,
      find: "      setInvited((prev) => ({ ...prev, [k]: 'ok' }));\n      window.__bsToast?.(tr('coach:addClient.inviteSent'",
      replace: "      await window.ShapeReferrals?.forClient?.(role, mine.providerId, p.userId);\n      setInvited((prev) => ({ ...prev, [k]: 'ok' }));\n      window.__bsToast?.(tr('coach:addClient.inviteSent'" },
    { name: 'the sheet drops the list', file: PROS,
      find: '          <BSCoachExistingClients key={role', replace: '          <span key={role' },
    // ── the copy ───────────────────────────────────────────────────────────────
    { name: 'help.html promises nothing on a client the coach brings again', file: HELP,
      find: 'No invoicing, no chasing payments. Shape takes 15% on clients who sign up through Shape and no cut on your existing clients.',
      replace: 'No invoicing, no chasing payments. Shape takes 15% on clients who find you on Shape and nothing on clients you bring.' },
    { name: 'the Terms give 0% to a client from an invite or link again', file: TERMS,
      find: '<li><strong>Your existing clients — 0%.</strong>', replace: '<li><strong>Clients you brought yourself — 0%.</strong>' },
    { name: 'the coaches page promises the 30-day invite window again', file: COACHES,
      find: '"Yes. In the app, list the clients you coached before Shape by the email they use on Shape, within 60 days of joining: they pay no Shape fee on their plans with you.',
      replace: '"Yes. Send them your invite or your referral link: a client who subscribes within 30 days of it pays no Shape fee on that plan, for as long as it renews.' },
    { name: 'Nora says an invite or link pays nothing again', file: NORA,
      find: 'and no cut on the coach’s existing clients: clients they coached before Shape, listed in the app by their Shape email within 60 days of joining.',
      replace: 'and nothing on a client who subscribes through the coach’s own invite or referral link within 30 days of it.' },
  ],
};
