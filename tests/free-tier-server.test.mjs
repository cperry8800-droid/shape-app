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
function client({ profile = ADULT, status = null, fail = [] } = {}) {
  return {
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => {
          if (fail.includes(table)) return { data: null, error: { message: `fake failure on ${table}` } };
          if (table === 'profiles') return { data: profile, error: null };
          if (table === 'platform_subscriptions') return { data: status ? { status } : null, error: null };
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

// ── 2 ──────────────────────────────────────────────────────────────────────────────────────
async function gate(path, { user = { id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }, profile = ADULT, status = null } = {}) {
  const mw = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/ssr', { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) }, ...client({ profile, status }) }) }],
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
async function guards({ user = { id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }, profile = ADULT, status = null } = {}) {
  return loadRealModule(join(ROOT, 'src/lib/require-membership.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => client({ profile, status }) }],
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
  const { isPaidApiPath } = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
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
      if (isPaidApiPath(apiPath)) {
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
