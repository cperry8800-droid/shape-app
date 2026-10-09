// Nora's admin help-desk lookup (the Ask Nora plan, step 5): an account by its email, its
// membership and plan, the coaches it subscribes to, and, for a coach, their listings and
// payout (Stripe Connect) setup. READ-ONLY, and every lookup is logged.
//
// ⚠ LOGGED BEFORE IT RUNS. The log row is written first, with the service role, and a lookup
// whose row cannot be written does not run, so there is no unlogged read. The row is then
// completed with what was found (best effort: the lookup is already on record).
//
// Only the chat route calls this, for an account computeMembership calls an admin (the
// ADMIN_EMAILS allow-list) whose email is confirmed. `db` is the SERVICE-ROLE client: RLS has
// no notion of an admin, and since the profiles PII lockdown another member's profile is
// readable no other way. So what comes back is a fixed help-desk set: no date of birth, phone
// or address, and no Stripe ids (a listing says whether it is connected and its status).
//
// Pure apart from `db`: tests/nora-admin-lookup.test.mjs drives it with a recording fake.

const EMAIL_RE = /^[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,253}\.[^\s@<>()"',;:]{2,63}$/;

/** A lowercased email address, or null. Auth stores emails lowercased, and profiles copies them. */
export function cleanLookupEmail(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

async function leg(promise) {
  try {
    const r = await promise;
    if (!r || r.error) return { ok: false, data: null };
    return { ok: true, data: r.data };
  } catch { return { ok: false, data: null }; }
}
const day = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
const dollars = (cents) => (Number.isFinite(Number(cents)) && cents != null ? `$${(Number(cents) / 100).toFixed(2)}` : null);
const price = (v) => (v != null && Number.isFinite(Number(v)) ? `$${Number(v).toFixed(2)}` : null);

/**
 * @param {any} db  the service-role client
 * @param {{ admin: { id: string, email: string }, email: unknown, surface?: string,
 *   computeMembership?: (db: any, id: string, email: string) => Promise<any> }} opts
 */
export async function adminLookupAccount(db, opts) {
  const q = cleanLookupEmail(opts && opts.email);
  if (!q) return { ok: false, error: 'bad_email', message: 'Give the full email address of the account to look up.' };
  const admin = opts.admin;

  let logId = null;
  {
    const r = await leg(db.from('admin_lookup_log')
      .insert({ admin_user_id: admin.id, admin_email: admin.email, query_email: q, surface: opts.surface === 'app' ? 'app' : 'web' })
      .select('id').single());
    if (!r.ok || !r.data || !r.data.id) {
      return { ok: false, error: 'log_unavailable', message: 'The lookup could not be logged, so nothing was looked up. Try again, or use the console.' };
    }
    logId = r.data.id;
  }
  const finish = (fields) => leg(db.from('admin_lookup_log').update(fields).eq('id', logId));

  // ⚠ THE ACCOUNT IS FOUND BY ITS SIGN-IN IDENTITY (auth.users), never by profiles.email: a
  // profile is created best effort and can be missing, and it keeps the first address after an
  // email change, so it would answer "no account" for one that exists (Codex, #2264).
  const who = await leg(db.rpc('admin_account_by_email', { p_email: q }));
  if (!who.ok) {
    await finish({ found: null });
    return { ok: false, error: 'unavailable', message: 'The account could not be read right now.' };
  }
  const u = Array.isArray(who.data) ? who.data[0] : who.data;
  if (!u || !u.id) {
    await finish({ found: false });
    return { ok: true, found: false, email: q, message: 'No Shape account has this email address.' };
  }
  const prof = await leg(db.from('profiles').select('full_name, role, roles').eq('id', u.id).maybeSingle());
  const p = prof.ok ? prof.data : null;

  const [plat, subs, tr, nu, membership] = await Promise.all([
    leg(db.from('platform_subscriptions').select('status, current_period_end, price_cents')
      .eq('client_id', u.id).order('current_period_end', { ascending: false, nullsFirst: false }).limit(1)),
    leg(db.from('subscriptions').select('provider_role, provider_id, status, current_period_end, price_cents')
      .eq('client_id', u.id).order('current_period_end', { ascending: false, nullsFirst: false }).limit(20)),
    leg(db.from('trainers').select('id, name, stripe_account_id, stripe_account_status, verified, at_capacity, price, session_price').eq('owner_id', u.id).limit(5)),
    leg(db.from('nutritionists').select('id, name, stripe_account_id, stripe_account_status, verified, at_capacity, price, meal_plan_price').eq('owner_id', u.id).limit(5)),
    typeof opts.computeMembership === 'function' ? opts.computeMembership(db, u.id, q, { emailConfirmed: !!u.email_confirmed_at }).catch(() => null) : Promise.resolve(null),
  ]);

  // The coaches they subscribe to, by name: one read per role, ids only from their own rows.
  const subRows = subs.ok && Array.isArray(subs.data) ? subs.data : [];
  const coachNames = new Map();
  await Promise.all(['trainer', 'nutritionist'].map(async (role) => {
    const ids = [...new Set(subRows.filter((s) => s.provider_role === role).map((s) => s.provider_id))];
    if (!ids.length) return;
    const r = await leg(db.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('id, name').in('id', ids));
    for (const row of r.ok && Array.isArray(r.data) ? r.data : []) coachNames.set(`${role}:${row.id}`, row.name);
  }));

  const latest = plat.ok && Array.isArray(plat.data) ? plat.data[0] : null;
  const listings = [
    ...(tr.ok && Array.isArray(tr.data) ? tr.data.map((r) => ({ role: 'trainer', r, prices: { monthly: price(r.price), session: price(r.session_price) } })) : []),
    ...(nu.ok && Array.isArray(nu.data) ? nu.data.map((r) => ({ role: 'nutritionist', r, prices: { monthly: price(r.price), mealPlan: price(r.meal_plan_price) } })) : []),
  ];
  const out = {
    ok: true,
    found: true,
    account: {
      name: p ? p.full_name || null : null,
      role: p ? p.role || 'client' : null,
      roles: p && Array.isArray(p.roles) ? p.roles : [],
      joined: day(u.created_at),
      emailConfirmed: !!u.email_confirmed_at,
      lastSignIn: day(u.last_sign_in_at),
      // 'missing': they can sign in, but their profile was never created.
      profile: prof.ok ? (p ? 'present' : 'missing') : 'unavailable',
    },
    membership: membership
      ? { member: !!membership.isMember, coach: !!membership.isCoach, admin: !!membership.isAdmin, refusedForAge: !!membership.isKnownMinor }
      : 'unavailable',
    platformPlan: plat.ok
      ? (latest ? { status: latest.status, until: day(latest.current_period_end), price: dollars(latest.price_cents) } : 'none')
      : 'unavailable',
    coaching: subs.ok
      ? subRows.map((s) => ({ role: s.provider_role, coach: coachNames.get(`${s.provider_role}:${s.provider_id}`) || null, status: s.status, until: day(s.current_period_end), price: dollars(s.price_cents) }))
      : 'unavailable',
    // A listing says whether Stripe is connected and Stripe's status, never the account id.
    payouts: tr.ok || nu.ok
      ? listings.map(({ role, r, prices }) => ({
          role, listing: r.name, connected: !!r.stripe_account_id,
          status: r.stripe_account_id ? (r.stripe_account_status || 'pending') : 'not connected',
          verified: !!r.verified, atCapacity: !!r.at_capacity,
          prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => v)),
        }))
      : 'unavailable',
    ...(tr.ok && nu.ok ? {} : (tr.ok || nu.ok ? { payoutsPartial: true } : {})),
  };
  const sections = ['account', ...(membership ? ['membership'] : []), ...(plat.ok ? ['plan'] : []), ...(subs.ok ? ['coaching'] : []), ...(tr.ok || nu.ok ? ['payouts'] : [])];
  await finish({ found: true, target_user_id: u.id, sections });
  return out;
}
