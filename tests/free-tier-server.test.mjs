// The free account on the server (owner, 2026-11-10): an account is free; the $5 membership adds
// assistant Nora, Shape Radio, the AI helpers, Cook Mode's voice, being ranked on the leaderboards
// and the points Store. Only an `active` membership pays (no trial), and a past-due member keeps
// the account and the free features but loses the paid ones, told `payment_past_due`.
//
//   1  computeMembership: active, trialing, past_due, cancelled, a coach, an admin.
//   2  the edge gate: every account prefix needs a signed-in adult; only the paid paths need the
//      membership, and their refusal says past due or not a member.
//   3  the route guards: requireAccount takes either stamp, requireMembership only the member's.
//   4  every route under the account prefixes is guarded by the right one.
//   5  the plan card's read and the hire-a-coach detour.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// An allow-listed admin address of the test's own (adminEmails() reads ADMIN_EMAILS).
process.env.ADMIN_EMAILS = 'admin@example.invalid';
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
const core = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true, registry: new Map([['./age-derive.mjs', ageDerive]]) });

const ADULT = { role: 'client', roles: ['client'], over_18: true, date_of_birth: '1990-04-02', created_at: '2026-10-01T00:00:00Z' };
const MINOR = { ...ADULT, over_18: false, date_of_birth: '2014-04-02' };

/** A Supabase-shaped client answering the profile and the newest platform subscription. */
function client({ profile = ADULT, status = null, fail = [], coached = false, week = null } = {}) {
  return {
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        // The coach subscriptions read is awaited as a list (an active one includes the membership).
        then: table === 'subscriptions'
          ? (res, rej) => Promise.resolve(fail.includes(table) ? { data: null, error: { message: 'fake failure on subscriptions' } } : { data: coached ? [{ id: 1 }] : [], error: null }).then(res, rej)
          : undefined,
        maybeSingle: async () => {
          if (fail.includes(table)) return { data: null, error: { message: `fake failure on ${table}` } };
          if (table === 'profiles') return { data: profile, error: null };
          if (table === 'platform_subscriptions') return { data: status ? { status } : null, error: null };
          if (table === 'nora_previews') return { data: week, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  };
}
const UID = '11111111-1111-4111-8111-111111111111';

// ── 1 ──────────────────────────────────────────────────────────────────────────────────────
test('1: only an active membership pays; a trial and a past-due one do not, and past due says so', async () => {
  const m = (o) => core.computeMembership(client(o), UID, 'm@example.invalid', { emailConfirmed: true });
  assert.deepEqual(pick(await m({ status: 'active' })), { isMember: true, pastDue: false, platformStatus: 'active' });
  assert.deepEqual(pick(await m({ status: 'past_due' })), { isMember: false, pastDue: true, platformStatus: 'past_due' });
  assert.deepEqual(pick(await m({ status: 'trialing' })), { isMember: false, pastDue: false, platformStatus: 'trialing' });
  assert.deepEqual(pick(await m({ status: 'canceled' })), { isMember: false, pastDue: false, platformStatus: 'canceled' });
  assert.deepEqual(pick(await m({})), { isMember: false, pastDue: false, platformStatus: null });
  // A coach is paid for by role, whatever their own plan says: never "past due".
  assert.deepEqual(pick(await m({ profile: { ...ADULT, role: 'client', roles: ['client', 'trainer'] }, status: 'past_due' })), { isMember: true, pastDue: false, platformStatus: null });
  assert.equal(core.PLATFORM_PERK_STATUSES.has('trialing'), false);
  assert.equal(core.PLATFORM_PERK_STATUSES.has('past_due'), false);
  // The coach-subscription rule is untouched: a member's coach on a retrying card is still theirs.
  assert.deepEqual([...core.ACTIVE_SUB].sort(), ['active', 'past_due', 'trialing']);
  assert.deepEqual(core.paidRefusal({ pastDue: true }).code, 'payment_past_due');
  assert.deepEqual(core.paidRefusal({ pastDue: false }).code, 'membership_required');
});
const pick = (r) => ({ isMember: r.isMember, pastDue: r.pastDue, platformStatus: r.platformStatus });

test('1: coaching includes the membership: an active coach subscription pays, past due on the $5 plan or not (owner, 2026-11-10)', async () => {
  const m = (o) => core.computeMembership(client(o), UID, 'm@example.invalid', { emailConfirmed: true, strict: true });
  const coached = await m({ coached: true });
  assert.equal(coached.isMember, true);
  assert.equal(coached.includedWithCoach, true);
  const lapsedPlan = await m({ coached: true, status: 'past_due' });
  assert.equal(lapsedPlan.isMember, true, 'their coaching still pays');
  assert.equal(lapsedPlan.pastDue, false, 'so nothing is past due for them');
  assert.equal(lapsedPlan.includedWithCoach, true);
  const own = await m({ coached: true, status: 'active' });
  assert.equal(own.includedWithCoach, false, 'a member on their own plan is not "included"');
  assert.equal((await m({})).includedWithCoach, false);
  await assert.rejects(m({ fail: ['subscriptions'] }), (e) => /subscriptions/.test(e?.message), 'a failed read is unknown under strict, never "not coached"');
});

// ── 2 ──────────────────────────────────────────────────────────────────────────────────────
async function gate(path, { user = { id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }, profile = ADULT, status = null, week = null } = {}) {
  const mw = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/ssr', { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) }, ...client({ profile, status, week }) }) }],
      ['@supabase/supabase-js', { createClient: () => ({}) }],
      ['@/lib/membership-core', core],
      ['@/lib/rate-limit', { checkRateLimit: async () => ({ allowed: true, remaining: 99, resetSeconds: 60, limit: 100 }), jwtSub: () => null }],
      ['@/lib/supabase/cookie-options', { applyShapeCookieOptions: (o) => o }],
      ['@/lib/staff-two-factor.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/staff-two-factor.mjs')).href)],
    ]),
  });
  const res = await mw.updateSession(new nextServer.NextRequest('https://shape.test' + path));
  const body = res.status === 200 ? null : await res.json().catch(() => null);
  return { status: res.status, code: body?.code ?? null, stamp: res.headers.get('x-middleware-request-x-shape-gate') };
}

const FREE_PATHS = ['/api/client/plan', '/api/client/dashboard', '/api/nutrition/meal-log', '/api/nutrition/food-search', '/api/nutrition/voice', '/api/calendar', '/api/conversations/abc/messages', '/api/messages/direct', '/api/insights/correlations'];
const PAID_PATHS = ['/api/ai/speak', '/api/ai/transcribe', '/api/ai/proposals/confirm', '/api/ai/weekly-readout', '/api/ai/draft-program', '/api/nutrition/recipe-parse', '/api/nutrition/recipe-photo'];

test('2: a free account passes every account path, stamped as an account; a paid path refuses it', async () => {
  for (const p of FREE_PATHS) {
    const r = await gate(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.stamp, 'account', `${p}: an account, not a member`);
  }
  for (const p of PAID_PATHS) {
    const r = await gate(p);
    assert.equal(r.status, 402, p);
    assert.equal(r.code, 'membership_required', p);
  }
});

test('2: a past-due member is refused a paid path as past due, and keeps every free one', async () => {
  for (const p of PAID_PATHS) assert.equal((await gate(p, { status: 'past_due' })).code, 'payment_past_due', p);
  for (const p of FREE_PATHS) assert.equal((await gate(p, { status: 'past_due' })).status, 200, p);
  for (const p of PAID_PATHS) assert.equal((await gate(p, { status: 'trialing' })).code, 'membership_required', `${p}: a trial pays for nothing`);
});

test('2: a member and a coach pass the paid paths, stamped as a member; signed out and a minor never pass', async () => {
  for (const p of [...PAID_PATHS, ...FREE_PATHS]) {
    const member = await gate(p, { status: 'active' });
    assert.equal(member.status, 200, p);
    assert.equal(member.stamp, 'member', p);
    assert.equal((await gate(p, { profile: { ...ADULT, role: 'trainer', roles: ['trainer'] } })).status, 200, p);
    assert.equal((await gate(p, { user: null })).status, 401, p);
    assert.equal((await gate(p, { profile: MINOR, status: 'active' })).status, 403, p);
  }
  assert.equal((await gate('/api/calendar/feed/' + 'a'.repeat(43), { user: null })).status, 200, 'a calendar app still reaches its feed');
});

// ── 3 ──────────────────────────────────────────────────────────────────────────────────────
async function guards({ user = { id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }, profile = ADULT, status = null, week = null } = {}) {
  return loadRealModule(join(ROOT, 'src/lib/require-membership.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => client({ profile, status, week }) }],
      ['@/lib/membership-core', core],
    ]),
  });
}
const stamped = (v) => new Request('https://shape.test/x', { headers: v ? { 'x-shape-gate': v } : {} });

test('3: requireAccount takes either stamp, and with none lets a signed-in adult through', async () => {
  const g = await guards();
  assert.equal(await g.requireAccount(stamped('account')), null);
  assert.equal(await g.requireAccount(stamped('member')), null);
  assert.equal(await g.requireAccount(stamped(null)), null, 'a free account, checked again');
  assert.equal((await (await guards({ user: null })).requireAccount(stamped(null))).status, 401);
  assert.equal((await (await guards({ profile: MINOR })).requireAccount(stamped(null))).status, 403);
});

test('3: requireMembership takes only the member stamp; an account stamp is checked again and refused', async () => {
  const free = await guards();
  assert.equal(await free.requireMembership(stamped('member')), null);
  const refused = await free.requireMembership(stamped('account'));
  assert.equal(refused.status, 402);
  assert.equal((await refused.json()).code, 'membership_required');
  const late = await (await guards({ status: 'past_due' })).requireMembership(stamped(null));
  assert.equal((await late.json()).code, 'payment_past_due');
  assert.equal(await (await guards({ status: 'active' })).requireMembership(stamped(null)), null);
  // ⚠ An admin passes with no stamp: the address's confirmation now reaches computeMembership.
  const admin = await guards({ user: { id: UID, email: 'admin@example.invalid', email_confirmed_at: '2026-01-01' } });
  assert.equal(await admin.requireMembership(stamped(null)), null);
  assert.match(stripComments(read('src/lib/require-membership.ts')), /emailConfirmed: !!user\.email_confirmed_at/);
});

// ── 4 ──────────────────────────────────────────────────────────────────────────────────────
function routes(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...routes(p));
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

test('4: every account-prefix route is guarded, the paid ones by requireMembership, the rest by requireAccount', async () => {
  const mw = read('src/lib/supabase/middleware.ts');
  const prefixes = ['client', 'nutrition', 'ai', 'insights', 'calendar', 'conversations', 'messages'];
  const serverOnly = new Set(['src/app/api/ai/notify/cron/route.ts', 'src/app/api/calendar/feed/[token]/route.ts']);
  const { isPaidApiPath, isNoraApiPath } = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@supabase/ssr', {}], ['@supabase/supabase-js', {}], ['@/lib/membership-core', core], ['@/lib/rate-limit', {}], ['@/lib/supabase/cookie-options', {}], ['@/lib/staff-two-factor.mjs', {}]]),
  });
  let seen = 0;
  for (const pre of prefixes) {
    for (const file of routes(`src/app/api/${pre}`)) {
      if (serverOnly.has(file)) continue;
      seen += 1;
      const apiPath = '/' + relative('src/app', dirname(file)).replace(/\\/g, '/');
      const src = stripComments(read(file));
      if (isNoraApiPath(apiPath) && apiPath !== '/api/ai/directive/override') {
        assert.match(src, /requireNora\(request|requireNora\(req/, `${file}: assistant Nora's route checks the membership or the free week`);
        assert.doesNotMatch(src, /requireMembership\(/, file);
      } else if (isPaidApiPath(apiPath)) {
        assert.match(src, /requireMembership\(request|requireMembership\(req/, `${file}: a paid route checks the membership`);
      } else {
        assert.match(src, /requireAccount\(request|requireAccount\(req/, `${file}: a free route checks the account`);
        assert.doesNotMatch(src, /requireMembership\(/, `${file}: free since 2026-11-10, never the membership`);
      }
    }
  }
  assert.ok(seen > 40, 'the scan found the routes');
  assert.match(mw, /const PAID_API_PATHS = \['\/api\/nutrition\/recipe-parse', '\/api\/nutrition\/recipe-photo'\];/);
  // Groceries are free: Instacart's list too.
  assert.match(stripComments(read('src/app/api/integrations/instacart/shopping-list/route.ts')), /requireAccount\(/);
});

// ── 5 ──────────────────────────────────────────────────────────────────────────────────────
test('5: the plan card reads active as the paid features, shows a past-due plan as one, and never a trial', async () => {
  const run = async (status) => {
    const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/subscription/route.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', nextServer],
        ['@/lib/request-auth', { currentUser: async () => ({ id: UID }), clientForRequest: async () => ({ from: () => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: status ? { status, price_cents: 500, current_period_end: '2026-12-01' } : null, error: null }) }; return q; } }) }],
        ['@/lib/membership-core', core],
      ]),
    });
    return (await route.GET(new Request('https://shape.test/api/stripe/subscription'))).json();
  };
  assert.deepEqual(await run('active'), { active: true, pastDue: false, status: 'active', priceCents: 500, renewsAt: '2026-12-01' });
  assert.deepEqual(await run('past_due'), { active: false, pastDue: true, status: 'past_due', priceCents: 500, renewsAt: '2026-12-01' });
  assert.deepEqual(await run('trialing'), { active: false });
  assert.deepEqual(await run(null), { active: false });
});

test('5: nothing that hires a coach asks for the membership any more; the 18+ still holds', () => {
  const coach = stripComments(read('src/app/api/stripe/checkout-session/route.ts'));
  assert.doesNotMatch(coach, /membership_required/);
  assert.match(coach, /if \(m\.isKnownMinor\)/);
  const detour = stripComments(read('src/lib/membership-detour.ts'));
  assert.doesNotMatch(detour, /createPlatformCheckout|isMember/);
  assert.match(detour, /if \(membership\.isKnownMinor\) return `\$\{backHref\}&error=age_restricted`;/);
  const platform = stripComments(read('src/app/api/stripe/platform-checkout/route.ts'));
  assert.ok(platform.indexOf("code: 'payment_past_due'") > 0 && platform.indexOf("code: 'payment_past_due'") < platform.indexOf("code: 'already_member'"), 'a past-due member is sent to the card before anything else');
  assert.doesNotMatch(stripComments(read('src/app/dashboard/layout.tsx')), /Shape is for members|platform_subscriptions/);
});

// ── the free week of Nora (owner, 2026-11-10) ───────────────────────────────────────────────
const WEEK = { started_at: '2026-11-08T10:00:00Z', ends_at: new Date(Date.now() + 3 * 86400000).toISOString() };
const ENDED = { started_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-08T10:00:00Z' };
const NORA_PATHS = ['/api/ai/speak', '/api/ai/transcribe', '/api/ai/proposals/confirm', '/api/ai/audit/undo', '/api/ai/weekly-readout', '/api/ai/notify'];

test('free week: a free account in its week passes assistant Nora\'s routes, stamped as such; never the AI drafting or the recipes; an ended week does not', async () => {
  for (const p of NORA_PATHS) {
    const r = await gate(p, { week: WEEK });
    assert.equal(r.status, 200, p);
    assert.equal(r.stamp, 'nora', p);
    assert.equal((await gate(p, { week: ENDED })).code, 'membership_required', `${p}: the week is over`);
    assert.equal((await gate(p, { week: ENDED, status: 'past_due' })).code, 'payment_past_due', p);
  }
  for (const p of ['/api/ai/draft-program', '/api/nutrition/recipe-parse', '/api/nutrition/recipe-photo']) {
    assert.equal((await gate(p, { week: WEEK })).code, 'membership_required', `${p} is not Nora's`);
  }
  assert.equal((await gate('/api/client/plan', { week: WEEK })).stamp, 'account', 'a free route is the account\'s, week or not');
});

test('free week: requireNora takes the member and Nora stamps, and with none checks the week; requireMembership never takes it', async () => {
  const free = await guards();
  assert.equal(await free.requireNora(stamped('member')), null);
  assert.equal(await free.requireNora(stamped('nora')), null);
  assert.equal((await free.requireNora(stamped('account'))).status, 402);
  assert.equal(await (await guards({ week: WEEK })).requireNora(stamped(null)), null);
  assert.equal((await (await guards({ week: ENDED })).requireNora(stamped(null))).status, 402);
  assert.equal(await (await guards({ status: 'active' })).requireNora(stamped(null)), null);
  assert.equal((await (await guards({ profile: MINOR, week: WEEK })).requireNora(stamped(null))).status, 403);
  assert.equal((await free.requireMembership(stamped('nora'))).status, 402, 'a free week is not the membership');
  assert.equal(await free.requireAccount(stamped('nora')), null);
});

test('free week: /api/me/membership says whether Nora is on, and the week itself', async () => {
  const run = async (o) => {
    const route = await loadRealModule(join(ROOT, 'src/app/api/me/membership/route.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', nextServer],
        ['@/lib/request-auth', { currentUser: async () => ({ id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }), clientForRequest: async () => client(o) }],
        ['@/lib/membership-core', core],
      ]),
    });
    return (await route.GET(new Request('https://shape.test/api/me/membership'))).json();
  };
  const week = await run({ week: WEEK });
  assert.equal(week.member, false);
  assert.equal(week.nora, true);
  assert.equal(week.noraPreview.active, true);
  assert.equal(week.noraPreview.endsAt, WEEK.ends_at);
  const ended = await run({ week: ENDED });
  assert.equal(ended.nora, false);
  assert.equal(ended.noraPreview.active, false);
  assert.equal((await run({ status: 'active' })).nora, true, 'a member has her anyway');
  assert.equal((await run({})).noraPreview, null);
  const coached = await run({ coached: true });
  assert.equal(coached.member, true);
  assert.equal(coached.includedWithCoach, true);
});

test('free week: the migration starts it after the third completed workout, once, for an unpaid account only; an account reads its own row and writes none', () => {
  const sql = read('supabase-migrations/2026-11-10-nora-free-week.sql').replace(/^\s*--.*$/gm, '');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\s*$/m);
  assert.match(sql, /v_needed constant integer := 3;/);
  assert.match(sql, /v_days constant integer := 7;/);
  assert.match(sql, /if exists \(select 1 from public\.nora_previews p where p\.user_id = new\.client_id\) then\s+return new;/, 'once per account');
  assert.match(sql, /where newest\.status = 'active'/);
  assert.match(sql, /c\.status = 'active'/, 'a coached account is paid already');
  assert.match(sql, /on conflict \(user_id\) do nothing;/);
  assert.match(sql, /create policy "read own nora preview" on public\.nora_previews\s+for select to authenticated\s+using \(user_id = auth\.uid\(\)\);/);
  assert.match(sql, /revoke all on public\.nora_previews from anon, authenticated;\ngrant select on public\.nora_previews to authenticated;/, 'read, never written, through the API');
  assert.match(sql, /after insert or update of status on public\.workout_sessions/);
});

test('annual: the checkout takes the yearly price when asked, and refuses a year with none set; the plans route checks each interval', async () => {
  const checkout = stripComments(read('src/app/api/stripe/platform-checkout/route.ts'));
  assert.match(checkout, /const annual = body\.plan === 'annual';\n\s+const priceId = annual \? process\.env\.STRIPE_PLATFORM_ANNUAL_PRICE_ID : monthly;/);
  assert.match(checkout, /code: 'annual_unavailable' \}, \{ status: 400 \}/);
  assert.match(checkout, /includedWithCoach: true/, 'coaching includes it: nothing to buy');
  const plans = stripComments(read('src/app/api/membership/plans/route.ts'));
  assert.match(plans, /price\.recurring\?\.interval !== want/, 'a monthly price set as the yearly one is no plan');
  assert.match(plans, /planOf\(process\.env\.STRIPE_PLATFORM_ANNUAL_PRICE_ID, 'year'\)/);
});

// ⚠ CHANNELS ARE FREE (owner, 2026-11-10: "also make channels free"). The community channels (the
// member-made group chats, Shape HQ, the PR Wall) are read and written straight through Supabase by
// any signed-in account, so what keeps them free is that nothing adds a paid condition: no channel
// policy or RPC reads a subscription or the membership, no community route sits behind the paid
// gate, and Nora tells a member they come with the account.
test('channels: every signed-in account browses, joins, starts and posts in channels; nothing makes them paid', async () => {
  const dir = join(ROOT, 'supabase-migrations');
  const channelSql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => [f, read('supabase-migrations/' + f)])
    .filter(([, sql]) => /\bon public\.channel(s|_members|_messages)\b|function public\.(create_channel|is_channel_member|is_public_channel|is_channel_host)\b/.test(sql));
  assert.ok(channelSql.length >= 2, 'the channel migrations are found');
  for (const [f, sql] of channelSql) {
    const blocks = stripComments(sql).split(/;\s*\n/).filter((b) => /policy[\s\S]*on public\.channel(s|_members|_messages)\b|function public\.(create_channel|is_channel_member|is_public_channel|is_channel_host)\b/.test(b));
    for (const b of blocks) assert.doesNotMatch(b, /platform_subscriptions|shape_viewer_is_member|\bsubscriptions\b|nora_previews/, `${f}: a channel policy or function reads a membership`);
  }
  const { isPaidApiPath } = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@supabase/ssr', {}], ['@supabase/supabase-js', {}], ['@/lib/membership-core', core], ['@/lib/rate-limit', {}], ['@/lib/supabase/cookie-options', {}], ['@/lib/staff-two-factor.mjs', {}]]),
  });
  for (const p of ['/api/community/feed', '/api/community/pr-wall', '/api/messages', '/api/conversations']) {
    assert.equal(isPaidApiPath(p), false, `${p} is not paid`);
  }
  const kb = (await import(pathToFileURL(join(ROOT, 'src/lib/ai/shapeKnowledge.mjs')).href));
  const entries = kb.SHAPE_KNOWLEDGE || Object.values(kb).find(Array.isArray);
  const membership = entries.find((e) => e.id === 'membership');
  assert.match(membership.body.split('The membership is')[0], /the community and its channels/, 'Nora lists channels with the free account');
});
