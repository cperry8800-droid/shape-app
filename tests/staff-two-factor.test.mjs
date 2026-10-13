// Two-factor sign-in for the Shape team: the rules (src/lib/staff-two-factor.mjs), the staff check
// that needs it (src/lib/admin-access.ts), the proxy that sends a staff page to /staff-verify
// (src/lib/supabase/middleware.ts), that page, and the owner's reset on the Staff page.
// Run: node --test tests/staff-two-factor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const tf = await imp('src/lib/staff-two-factor.mjs');
const levels = await imp('src/lib/staff-levels.mjs');
const activity = await imp('src/lib/admin-activity.mjs');
const nextServer = createRequire(import.meta.url)('next/server');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
// The pages are compiled with the classic JSX runtime, which reads React off the global scope.
globalThis.React = React;

const OWNER = 'cperry8800@gmail.com';
const OWNER_ID = '99999999-9999-4999-8999-999999999999';
const ANN = '11111111-1111-4111-8111-111111111111';
const redirectTo = (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; };

// ── The rules ─────────────────────────────────────────────────────────────────────────────
test('rules: every staff page, and only staff pages, asks for the second factor', () => {
  for (const p of ['/admin', '/admin/', '/admin/members', '/admin/accounts/abc', '/admin/requests', '/admin/staff', '/dashboard/support',
    '/dashboard/applications', '/dashboard/credentials', '/dashboard/refunds', '/dashboard/claim', '/dashboard/radio', '/warroom', '/console']) {
    assert.equal(tf.isStaffPage(p), true, p);
  }
  for (const p of ['/', '/administrator', '/admins', '/dashboard', '/dashboard/supporting', '/warrooms', '/staff-verify', '/login',
    '/newdesign/ClientDashboard.html', '/api/admin/radio/tracks', '', null]) {
    assert.equal(tf.isStaffPage(p), false, String(p));
  }
  for (const page of [...levels.CONSOLE_PAGES, ...levels.ADMIN_TOOLS]) assert.ok(tf.STAFF_PAGE_PREFIXES.includes(page.href), `${page.href} is covered`);
});

test('rules: the state is the session’s level first, then whether an authenticator exists', () => {
  assert.equal(tf.twoFactorState({ currentLevel: 'aal2', verifiedFactors: 1 }), 'verified');
  assert.equal(tf.twoFactorState({ currentLevel: 'aal1', verifiedFactors: 1 }), 'verify');
  assert.equal(tf.twoFactorState({ currentLevel: 'aal1', verifiedFactors: 0 }), 'enroll');
  assert.equal(tf.twoFactorState({ currentLevel: null, verifiedFactors: 2 }), 'verify');
  assert.equal(tf.twoFactorState({}), 'enroll');
  assert.equal(tf.twoFactorState({ currentLevel: 'AAL2', verifiedFactors: 1 }), 'verify', 'the claim is matched exactly');
});

test('rules: the way back is a staff page on this site, carried in the link', () => {
  assert.equal(tf.staffNext('/admin/members?q=bo'), '/admin/members?q=bo');
  for (const bad of ['//evil.example/admin', 'https://evil.example', '/\\evil.example', '/newdesign/index.html', '/administrator', '', null, 42]) {
    assert.equal(tf.staffNext(bad), '/admin', String(bad));
  }
  assert.equal(tf.verifyUrl('/admin/members', '?q=bo'), '/staff-verify?next=%2Fadmin%2Fmembers%3Fq%3Dbo');
  assert.equal(tf.verifyUrl('/somewhere'), '/staff-verify?next=%2Fadmin');
  assert.equal(tf.cleanCode(' 123 456 '), '123456');
  assert.equal(tf.cleanCode('123-456'), '123456');
  for (const bad of ['12345', '1234567', 'abcdef', '', null]) assert.equal(tf.cleanCode(bad), '', String(bad));
});

// ── The staff check ───────────────────────────────────────────────────────────────────────
async function access({ user, aal = 'aal1', claimsError = false, rows = [] }) {
  return loadRealModule(join(ROOT, 'src/lib/admin-access.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user } }),
            getClaims: async () => (claimsError ? { data: null, error: { message: 'bad token' } } : { data: { claims: { aal } }, error: null }),
          },
        }),
      }],
      ['@/lib/supabase/admin', {
        createAdminClient: () => ({
          from: () => {
            const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) };
            return chain;
          },
        }),
      }],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/staff-two-factor.mjs', tf],
    ]),
  });
}
const owner = (factors = []) => ({ id: OWNER_ID, email: OWNER, email_confirmed_at: '2026-10-01T00:00:00Z', factors });
const verifiedFactor = { id: 'f1', status: 'verified', factor_type: 'totp' };

test('access: a password alone is not staff; the second factor is', async () => {
  const fresh = await access({ user: owner() });
  assert.deepEqual(await fresh.getStaffSignIn(), { staff: { id: OWNER_ID, email: OWNER, level: 'owner' }, twoFactor: 'enroll' });
  assert.equal(await fresh.getStaffMember(), null);
  await assert.rejects(fresh.requireStaff('analyst'), /Admin access required/);

  const enrolled = await access({ user: owner([verifiedFactor]) });
  assert.equal((await enrolled.getStaffSignIn()).twoFactor, 'verify');
  assert.equal(await enrolled.getStaffMember(), null);
  await assert.rejects(enrolled.requireAdminUser(), /Admin access required/, 'the older admin tools too');

  const half = await access({ user: owner([{ id: 'f2', status: 'unverified', factor_type: 'totp' }]) });
  assert.equal((await half.getStaffSignIn()).twoFactor, 'enroll', 'a set-up never confirmed is not an authenticator');
  // Codex, #2329: /staff-verify asks for an authenticator code, so a phone factor is not one.
  const phone = await access({ user: owner([{ id: 'p1', status: 'verified', factor_type: 'phone' }]) });
  assert.equal((await phone.getStaffSignIn()).twoFactor, 'enroll', 'a verified phone factor does not strand them on a code screen');

  const done = await access({ user: owner([verifiedFactor]), aal: 'aal2' });
  assert.equal((await done.getStaffSignIn()).twoFactor, 'verified');
  assert.deepEqual(await done.getStaffMember(), { id: OWNER_ID, email: OWNER, level: 'owner' });
  assert.deepEqual(await done.requireAdminUser(), { id: OWNER_ID, email: OWNER });

  const unread = await access({ user: owner([verifiedFactor]), aal: 'aal2', claimsError: true });
  assert.equal((await unread.getStaffSignIn()).twoFactor, 'verify', 'a token that cannot be read has no second factor');
  assert.equal(await unread.getStaffMember(), null);

  const ann = await access({ user: { id: ANN, email: 'ann@x.com', email_confirmed_at: '2026-10-01T00:00:00Z', factors: [] }, rows: [{ level: 'support' }] });
  assert.deepEqual(await ann.getStaffSignIn(), { staff: { id: ANN, email: 'ann@x.com', level: 'support' }, twoFactor: 'enroll' });
  const nobody = await access({ user: { id: ANN, email: 'nobody@x.com', email_confirmed_at: '2026-10-01T00:00:00Z' }, aal: 'aal2' });
  assert.equal(await nobody.getStaffSignIn(), null, 'a second factor makes nobody staff');
});

// ── The proxy ─────────────────────────────────────────────────────────────────────────────
async function proxy(path, { user = null, aal = 'aal1' } = {}) {
  const asked = [];
  const mw = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/ssr', {
        createServerClient: () => ({
          auth: {
            getUser: async () => ({ data: { user } }),
            mfa: { getAuthenticatorAssuranceLevel: async () => { asked.push('aal'); return { data: { currentLevel: aal, nextLevel: 'aal2' }, error: null }; } },
          },
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
        }),
      }],
      ['@supabase/supabase-js', { createClient: () => ({}) }],
      ['@/lib/membership-core', { computeMembership: async () => ({ isMember: true, isKnownMinor: false }), GATE_STAMP_HEADER: 'x-shape-gate', GATE_STAMP_VALUE: 'ok' }],
      ['@/lib/rate-limit', { checkRateLimit: async () => ({ allowed: true, remaining: 99, resetSeconds: 60, limit: 100 }), jwtSub: () => null }],
      ['@/lib/supabase/cookie-options', { applyShapeCookieOptions: (o) => o }],
      ['@/lib/staff-two-factor.mjs', tf],
    ]),
  });
  const res = await mw.updateSession(new nextServer.NextRequest(`https://shape.test${path}`));
  return { status: res.status, location: res.headers.get('location'), asked };
}

test('proxy: a signed-in session without the second factor is sent to /staff-verify from every staff page', async () => {
  const me = { id: OWNER_ID };
  const hit = await proxy('/admin/members?q=bo', { user: me });
  assert.equal(hit.status, 307);
  assert.equal(hit.location, 'https://shape.test/staff-verify?next=%2Fadmin%2Fmembers%3Fq%3Dbo');
  for (const p of ['/admin', '/dashboard/refunds', '/warroom', '/console', '/admin/accounts/x']) {
    assert.match((await proxy(p, { user: me })).location ?? '', /\/staff-verify\?next=/, p);
  }
  const verified = await proxy('/admin/members', { user: me, aal: 'aal2' });
  assert.equal(verified.status, 200, 'verified: through');
  const visitor = await proxy('/admin', {});
  assert.equal(visitor.status, 200, 'a visitor is the page’s to send to sign-in');
  assert.deepEqual(visitor.asked, [], 'and their session is not read');
  for (const p of ['/staff-verify?next=%2Fadmin', '/', '/dashboard', '/newdesign/index.html']) {
    const r = await proxy(p, { user: me });
    assert.equal(r.status, 200, p);
    assert.deepEqual(r.asked, [], `${p}: not a staff page`);
  }
});

// ── The page ──────────────────────────────────────────────────────────────────────────────
async function verifyPage({ signIn = null, user = null, next = '/admin/members' } = {}) {
  const mod = await loadRealModule(join(ROOT, 'src/app/staff-verify/page.tsx'), {
    typescript: true,
    registry: new Map([
      ['next/navigation', { redirect: redirectTo, notFound: () => { const e = new Error('NOT_FOUND'); e.notFound = true; throw e; } }],
      ['@/lib/admin-access', { getStaffSignIn: async () => signIn }],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }],
      ['@/lib/staff-two-factor.mjs', tf],
      ['./StaffTwoFactor', { __esModule: true, default: ({ mode, next: n }) => React.createElement('div', { 'data-mode': mode, 'data-next': n }) }],
    ]),
  });
  try {
    return { html: renderToStaticMarkup(await mod.default({ searchParams: Promise.resolve({ next }) })) };
  } catch (e) {
    if (e.to) return { redirect: e.to };
    if (e.notFound) return { notFound: true };
    throw e;
  }
}
const staff = (twoFactor) => ({ staff: { id: OWNER_ID, email: OWNER, level: 'owner' }, twoFactor });

test('/staff-verify: set up or enter a code; a visitor signs in first; anyone else gets the 404', async () => {
  assert.deepEqual(await verifyPage({}), { redirect: '/login?next=%2Fadmin%2Fmembers' });
  assert.deepEqual(await verifyPage({ user: { id: ANN } }), { notFound: true });
  assert.deepEqual(await verifyPage({ signIn: staff('verified') }), { redirect: '/admin/members' });
  assert.deepEqual(await verifyPage({ signIn: staff('verified'), next: '//evil.example' }), { redirect: '/admin' }, 'never off-site');
  const enroll = (await verifyPage({ signIn: staff('enroll') })).html;
  assert.ok(enroll.includes('data-mode="enroll"') && enroll.includes('data-next="/admin/members"') && enroll.includes(OWNER));
  assert.ok((await verifyPage({ signIn: staff('verify') })).html.includes('data-mode="verify"'));
  const client = stripComments(read('src/app/staff-verify/StaffTwoFactor.tsx'));
  // ⚠ The session cookies are httpOnly: a browser Supabase client on this page has no session, and
  // every staff member saw "Your sign-in methods could not be read" (owner, 2026-10-13). Every
  // step goes through the server route.
  assert.doesNotMatch(client, /@\/lib\/supabase\/client|createClient|auth\.mfa/, 'no Supabase call from the browser');
  assert.match(client, /fetch\('\/api\/staff\/two-factor'/);
  assert.match(client, /step\(\{ action: 'verify', factorId, code: typed \}\)/);
  assert.match(client, /window\.location\.assign\(next\);/, 'a full load, so the server reads the upgraded session');
  assert.match(read('src/app/staff-verify/page.tsx'), /robots: \{ index: false, follow: false \}/);
});

// ── The server route that runs the steps ──────────────────────────────────────────────────
const FACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function mfaWorld({ factors = [], fail = [] } = {}) {
  const calls = [];
  const mfa = {
    listFactors: async () => { calls.push('list'); return fail.includes('list') ? { data: null, error: { message: 'Auth session missing!' } } : { data: { all: factors }, error: null }; },
    unenroll: async ({ factorId }) => { calls.push(`unenroll:${factorId}`); return { data: null, error: null }; },
    enroll: async (opts) => { calls.push(`enroll:${opts.factorType}:${opts.issuer}`); return fail.includes('enroll') ? { data: null, error: { message: 'no' } } : { data: { id: FACTOR, totp: { qr_code: 'data:image/svg+xml;qr', secret: 'SECRET' } }, error: null }; },
    challengeAndVerify: async (args) => { calls.push(`verify:${args.factorId}:${args.code}`); return fail.includes('verify') ? { data: null, error: { message: 'Invalid TOTP code entered' } } : { data: {}, error: null }; },
  };
  return { calls, client: { auth: { mfa } } };
}
async function twoFactorRoute(signIn, world) {
  return loadRealModule(join(ROOT, 'src/app/api/staff/two-factor/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/admin-access', { getStaffSignIn: async () => signIn }],
      ['@/lib/supabase/server', { createClient: async () => world.client }],
      ['@/lib/staff-two-factor.mjs', tf],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ]),
  });
}
const post = async (route, body) => {
  const res = await route.POST(new Request('https://shape.test/api/staff/two-factor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

test('route: staff only; a session already verified goes straight on', async () => {
  const w = mfaWorld();
  assert.equal((await post(await twoFactorRoute(null, w), { action: 'start' })).status, 404);
  assert.deepEqual(await post(await twoFactorRoute(staff('verified'), w), { action: 'start' }), { status: 200, body: { mode: 'verified' }, cache: 'no-store' });
  assert.deepEqual(w.calls, [], 'nothing asked of Supabase for either');
  assert.equal((await post(await twoFactorRoute(staff('enroll'), w), { action: 'nope' })).status, 400);
});

test('route: set-up clears an abandoned one, enrolls an authenticator and hands back its code to scan', async () => {
  const w = mfaWorld({ factors: [
    { id: 'old', factor_type: 'totp', status: 'unverified' },
    { id: 'phone', factor_type: 'phone', status: 'unverified' },
    // Not reachable with the sign-in saying 'enroll', but a confirmed authenticator is never cleared.
    { id: 'kept', factor_type: 'totp', status: 'verified' },
  ] });
  const r = await post(await twoFactorRoute(staff('enroll'), w), { action: 'start' });
  assert.deepEqual(r, { status: 200, body: { mode: 'enroll', factorId: FACTOR, qr: 'data:image/svg+xml;qr', secret: 'SECRET' }, cache: 'no-store' });
  assert.deepEqual(w.calls, ['list', 'unenroll:old', 'enroll:totp:Shape'], 'only the unconfirmed authenticator is cleared');

  const down = mfaWorld({ fail: ['list'] });
  const failed = await post(await twoFactorRoute(staff('enroll'), down), { action: 'start' });
  assert.deepEqual([failed.status, failed.body.error], [503, 'Your sign-in methods could not be read. Reload the page to try again.']);
  const noEnroll = await post(await twoFactorRoute(staff('enroll'), mfaWorld({ fail: ['enroll'] })), { action: 'start' });
  assert.equal(noEnroll.status, 503);
});

test('route: with an authenticator set up it asks for that one\'s code, and checks the code on the server', async () => {
  const w = mfaWorld({ factors: [{ id: 'old', factor_type: 'totp', status: 'unverified' }, { id: FACTOR, factor_type: 'totp', status: 'verified' }] });
  const route = await twoFactorRoute(staff('verify'), w);
  assert.deepEqual((await post(route, { action: 'start' })).body, { mode: 'verify', factorId: FACTOR });
  assert.equal(w.calls.includes('unenroll:old'), false, 'asking for a code clears nothing');
  assert.equal((await post(await twoFactorRoute(staff('verify'), mfaWorld()), { action: 'start' })).status, 409);

  assert.deepEqual(await post(route, { action: 'verify', factorId: FACTOR, code: '123 456' }), { status: 200, body: { ok: true }, cache: 'no-store' });
  assert.equal(w.calls.at(-1), `verify:${FACTOR}:123456`);
  for (const [why, body] of [
    ['no factor', { action: 'verify', code: '123456' }],
    ['not a factor id', { action: 'verify', factorId: '../x', code: '123456' }],
    ['not a code', { action: 'verify', factorId: FACTOR, code: '12345' }],
  ]) {
    const before = w.calls.length;
    assert.equal((await post(route, body)).status, 400, why);
    assert.equal(w.calls.length, before, `${why}: Supabase is not asked`);
  }
  const wrong = await post(await twoFactorRoute(staff('verify'), mfaWorld({ fail: ['verify'] })), { action: 'verify', factorId: FACTOR, code: '000000' });
  assert.deepEqual([wrong.status, wrong.body.error], [400, 'That code did not match. Codes change every 30 seconds; enter the one showing now.']);
});

test('nothing under src/ uses a browser Supabase client: the session cookies are httpOnly', () => {
  // src/lib/supabase/cookie-options.ts sets httpOnly on the auth cookies on the strength of this
  // file having no importers; #2329 broke that and the two-factor page could not read a session.
  const { execSync } = createRequire(import.meta.url)('node:child_process');
  const hits = execSync(`grep -rlE "from ['\\"]@/lib/supabase/client['\\"]" src || true`, { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(hits, '', `browser Supabase client imported by:\n${hits}`);
  assert.match(read('src/lib/supabase/cookie-options.ts'), /httpOnly: true,/);
});

test('the website: the header offers staff the console, and asks the level of /api/me/staff once per tab', () => {
  const shell = stripComments(read('public/newdesign/pageShell.jsx'));
  assert.match(shell, /fetch\('\/api\/me\/staff', \{ credentials: 'same-origin', cache: 'no-store' \}\)/);
  assert.match(shell, /sessionStorage\.setItem\(key, v \|\| 'none'\)/, 'one read per account per tab');
  assert.match(shell, /\{staffLevel \? <a href="\/admin" style=\{quietLink\}>Admin<\/a> : null\}/, 'the bar, staff only');
  assert.match(shell, /\{authUser && staffLevel \? <a href="\/admin" onClick=\{onClose\} style=\{\{ \.\.\.linkBase, color: INK \}\}>Admin<\/a> : null\}/, 'the phone drawer, staff only');
  assert.match(shell, /<MobileDrawer open=\{drawerOpen\}[^\n]*staffLevel=\{staffLevel\}/);
});

// ── The owner's reset ─────────────────────────────────────────────────────────────────────
function staffWorld({ rows = [{ user_id: ANN, email: 'ann@x.com', level: 'support' }], factors = [{ id: 'f1', status: 'verified' }, { id: 'f2', status: 'unverified' }], fail = [], users = {} } = {}) {
  const calls = [];
  const log = [];
  const db = {
    calls,
    log,
    auth: {
      admin: {
        getUserById: async (id) => { calls.push(`user:${id}`); return { data: { user: users[id] ? { id, ...users[id] } : null }, error: users[id] ? null : { status: 404 } }; },
        mfa: {
          listFactors: async ({ userId }) => { calls.push(`list:${userId}`); return fail.includes('list') ? { data: null, error: { message: 'down' } } : { data: { factors }, error: null }; },
          deleteFactor: async ({ id }) => { calls.push(`delete:${id}`); return { data: null, error: fail.includes(`delete:${id}`) ? { message: 'no' } : null }; },
        },
      },
    },
    rpc: async (name, args) => { calls.push(`rpc:${name}:${args.p_user}`); return { data: 1, error: fail.includes('rpc') ? { message: 'no' } : null }; },
    from(table) {
      const st = { op: 'select', payload: null, filters: [] };
      const exec = () => {
        calls.push(`${st.op}:${table}`);
        if (table === 'admin_activity_log') {
          if (st.op === 'insert') {
            if (fail.includes('log')) return { data: null, error: { code: 'XX000', message: 'fake' } };
            const row = { id: `log-${log.length + 1}`, ...st.payload };
            log.push(row);
            return { data: { id: row.id }, error: null };
          }
          if (st.op === 'update') { for (const r of log.filter((x) => st.filters.every(([c, v]) => x[c] === v))) Object.assign(r, st.payload); return { data: null, error: null }; }
        }
        const found = rows.filter((r) => st.filters.every(([c, v]) => r[c] === v));
        return { data: found[0] ?? null, error: null };
      };
      const chain = {
        select() { return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push([c, v]); return chain; },
        single() { return chain; },
        maybeSingle() { return chain; },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}

async function reset(db, { level = 'owner', userId = ANN } = {}) {
  const actions = await loadRealModule(join(ROOT, 'src/app/admin/staff/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/cache', { revalidatePath: () => {} }],
      ['next/navigation', { redirect: redirectTo }],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/admin-access', {
        getOwnerEmails: () => [OWNER],
        getEnvAdminEmails: () => ['ops@shape.test', OWNER],
        requireStaff: async (min) => { if (!levels.atLeast(level, min)) throw new Error('Admin access required.'); return { id: OWNER_ID, email: OWNER, level }; },
      }],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/admin-activity.mjs', activity],
    ]),
  });
  const fd = new FormData();
  fd.set('user_id', userId);
  try { await actions.resetStaffTwoFactor(fd); return null; } catch (e) { if (e.to) return e.to; throw e; }
}

test('reset: owner only; logged first, every factor removed, signed out everywhere, then marked done', async () => {
  const db = staffWorld();
  assert.equal(await reset(db), '/admin/staff?updated=two_factor_reset');
  assert.deepEqual(db.calls, ['select:staff_members', `list:${ANN}`, 'insert:admin_activity_log', 'delete:f1', 'delete:f2', `rpc:admin_end_sessions:${ANN}`, 'update:admin_activity_log']);
  assert.equal(db.log[0].action, 'staff.reset_two_factor');
  assert.deepEqual(db.log[0].details, { level: 'support', factors: 2 });
  assert.equal(db.log[0].outcome, 'done');
  assert.equal(levels.describeActivity(db.log[0]), "reset ann@x.com's two-factor sign-in");
  await assert.rejects(reset(staffWorld(), { level: 'admin' }), /Admin access required/);
});

test('reset: only a staff row, only when there is something to reset, and a failure is said', async () => {
  const none = staffWorld({ factors: [] });
  assert.equal(await reset(none), '/admin/staff?updated=no_two_factor');
  assert.ok(!none.calls.includes('insert:admin_activity_log'));
  const owner = staffWorld({ rows: [], users: { [OWNER_ID]: { email: 'CPerry8800@gmail.com' } } });
  assert.equal(await reset(owner, { userId: OWNER_ID }), '/admin/staff?error=missing_member', 'an owner is never reset here, even one also in ADMIN_EMAILS');
  assert.deepEqual(owner.calls, ['select:staff_members', `user:${OWNER_ID}`]);
  const member = staffWorld({ rows: [], users: { [ANN]: { email: 'ann@x.com' } } });
  assert.equal(await reset(member), '/admin/staff?error=missing_member', 'nobody on the team');
  assert.equal(await reset(staffWorld(), { userId: 'nope' }), '/admin/staff?error=missing_member');
  const unread = staffWorld({ fail: ['list'] });
  assert.equal(await reset(unread), '/admin/staff?error=reset_failed');
  assert.ok(!unread.calls.includes('insert:admin_activity_log'));
  const unlogged = staffWorld({ fail: ['log'] });
  assert.equal(await reset(unlogged), '/admin/staff?error=not_logged', 'a reset that cannot be logged does not run');
  assert.ok(!unlogged.calls.some((c) => c.startsWith('delete:') || c.startsWith('rpc:')), 'no factor removed, nobody signed out');
  // Codex, #2329: an ADMIN_EMAILS admin has no row, and gets the same way back.
  const ops = staffWorld({ rows: [], users: { [ANN]: { email: 'Ops@Shape.test' } } });
  assert.equal(await reset(ops), '/admin/staff?updated=two_factor_reset');
  assert.deepEqual(ops.log[0].details, { level: 'admin', factors: 2 });
  assert.equal(ops.log[0].target_email, 'ops@shape.test');
  for (const f of ['delete:f2', 'rpc']) {
    const db = staffWorld({ fail: [f] });
    assert.equal(await reset(db), '/admin/staff?error=reset_failed', f);
    assert.equal(db.log[0].outcome, 'failed', f);
  }
});

test('the dashboard and the Staff page read the level and the authenticator, not access', () => {
  const layout = stripComments(read('src/app/dashboard/layout.tsx'));
  assert.match(layout, /if \(isAdmin && verified\) \{/, 'service-role counts wait for the second factor');
  const page = stripComments(read('src/app/admin/staff/page.tsx'));
  assert.match(page, /admin\.auth\.admin\.mfa\.listFactors\(\{ userId \}\)/);
  assert.match(page, /\.\.\.rows\.map\(\(r\) => readFactors\(r\.user_id\)\),/, 'every staff row is read');
  assert.match(page, /\{twoFactor && resetId && \(\n\s+<form action=\{resetStaffTwoFactor\}>/, 'reset is offered only when there is an authenticator');
  assert.match(page, /admin\.rpc\('admin_account_by_email', \{ p_email: email \}\)/, 'ADMIN_EMAILS admins are found by their sign-in identity');
  assert.match(page, /resetId=\{envAdminIds\.get\(e\)\}/, 'and can be reset');
  assert.doesNotMatch(page, /removeId=\{envAdminIds/, 'but not removed here: that is Vercel’s setting');
  const mw = stripComments(read('src/lib/supabase/middleware.ts'));
  assert.ok(mw.indexOf('isStaffPage(request.nextUrl.pathname)') < mw.indexOf('portalRoleForPath(request.nextUrl.pathname)'), 'the two-factor redirect runs before the portal gate');
});

// ── The app's door (#14): /api/me/staff and Settings → Shape admin ─────────────────────────
test('/api/me/staff answers the level, grants nothing, and is never cached', async () => {
  const levelOf = [];
  const load = (user, level) => loadRealModule(join(ROOT, 'src/app/api/me/staff/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/admin-access', { staffLevelOf: async (u) => { levelOf.push(u.id); return level; } }],
    ]),
  });
  const ask = async (route) => { const res = await route.GET(new Request('https://shape.test/api/me/staff')); return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }; };
  assert.deepEqual(await ask(await load(null, 'owner')), { status: 200, body: { level: null }, cache: 'no-store' });
  assert.deepEqual(levelOf, [], 'a visitor is not looked up');
  assert.deepEqual(await ask(await load({ id: ANN }, 'support')), { status: 200, body: { level: 'support' }, cache: 'no-store' });
  assert.deepEqual(await ask(await load({ id: ANN }, null)), { status: 200, body: { level: null }, cache: 'no-store' });
  const src = stripComments(read('src/app/api/me/staff/route.ts'));
  assert.doesNotMatch(src, /createAdminClient|getStaffMember|requireStaff/, 'the level only, through the one lookup');
});

test('staffLevelOf: the same owners, ADMIN_EMAILS and rows as the console, and nothing unconfirmed', async () => {
  const mod = (rows = [], throws = false) => loadRealModule(join(ROOT, 'src/lib/admin-access.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => ({}) }],
      ['@/lib/supabase/admin', {
        createAdminClient: () => {
          if (throws) throw new Error('no service key');
          return { from: () => { const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }; return c; } };
        },
      }],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/staff-two-factor.mjs', tf],
    ]),
  });
  const confirmed = '2026-10-01T00:00:00Z';
  assert.equal(await (await mod()).staffLevelOf({ id: OWNER_ID, email: 'CPerry8800@gmail.com', email_confirmed_at: confirmed }), 'owner');
  assert.equal(await (await mod()).staffLevelOf({ id: OWNER_ID, email: OWNER, email_confirmed_at: null }), null, 'unconfirmed');
  assert.equal(await (await mod()).staffLevelOf({ id: ANN, email: null, email_confirmed_at: confirmed }), null, 'no email');
  assert.equal(await (await mod([{ level: 'analyst' }])).staffLevelOf({ id: ANN, email: 'ann@x.com', email_confirmed_at: confirmed }), 'analyst');
  assert.equal(await (await mod([], true)).staffLevelOf({ id: ANN, email: 'ann@x.com', email_confirmed_at: confirmed }), null, 'a failed read is no row');
});

test('the app: Settings shows Shape admin only for staff, and opens the console outside the app', () => {
  const client = stripComments(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'));
  assert.match(client, /\.\.\.\(staffLevel \? \[\{ title: tr\('settings:section\.admin', \{ defaultValue: 'Shape admin' \}\), summary: tr\('settings:card\.adminSummary'[^\n]*detail: 'admin' \}\] : \[\]\),/);
  assert.match(client, /\{detail === 'admin' && \(<>/, 'the row opens a pane');
  assert.match(client, /onClick=\{\(\) => window\.ShapeStaff && window\.ShapeStaff\.openConsole\(\)\}/);
  assert.match(client, /const ask = window\.ShapeStaff && window\.ShapeStaff\.getLevel;/);
  const backend = stripComments(read('mobile-app/src/services/shapeBackend.js'));
  assert.match(backend, /fetch\(`\$\{base\}\/api\/me\/staff`, \{\n\s+headers: \{ Authorization: `Bearer \$\{state\.session\.access_token\}` \},/);
  // Codex, #2330: a native build has no API base today, so the door names the production site there.
  assert.match(backend, /function staffBase\(\) \{\n\s+return apiBaseUrl \|\| \(_isNative \? SHAPE_SITE : ''\);\n\}/);
  assert.match(backend, /const SHAPE_SITE = 'https:\/\/theshapecommunity\.com';/);
  assert.match(backend, /const url = `\$\{staffBase\(\)\}\/admin`;/, 'an absolute URL for the native browser');
  assert.match(backend, /return \['owner', 'admin', 'support', 'analyst'\]\.includes\(payload\.level\) \? payload\.level : null;/, 'anything else is no row');
  assert.match(backend, /Browser\.open\(\{ url, presentationStyle: 'fullscreen' \}\);/);
  assert.match(backend, /try \{ window\.open\(url, '_blank', 'noopener'\); return; \} catch \(e\) \{\}/, 'the web app keeps its own tab');
});
