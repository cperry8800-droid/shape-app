// The client-onboarding review's small fixes (2026-10-15). Each section names the finding and
// drives the shipping code (loadRealModule compiles the real files; stubs stand only where a
// network, a database or a mail service would), or pins the line a finding came down to.
//
//   H9   "Forgot password" in the app sent nothing, and the website's reset link worked only in
//        the browser that asked for it. Shape mails its own link (/auth/confirm, verified on the
//        server), and the app and the website both ask for it.
//   H10  an account confirmed in another browser (or signed in on a page that did not provision)
//        had no profile, and the age check refused it. ensureProfile runs on every sign-in bridge.
//   M5   /signup was a second, thinner sign-up form that made Trainer a client account. It
//        redirects to the website's sign-up, and a coach's role to their application.
//   M4   the app's sign-up and paywall named no Terms, no Privacy Policy and no renewal, and the
//        website required a Terms tick it never recorded. Both say it now, and the server records
//        the versions in force when the account was made (terms_acceptances).
//   L4   the money path said "Create a free account" beside a $5 membership, and showed the
//        checkout's English refusals as they came.
//   L1   the Score intro and the tour showed only to accounts under a day old.
//   L3   a phone account could be made with no name, and no screen could give it a handle.
//   L5   the system's notification prompt ran the moment an account existed.
//   L6   the website sign-up: errors only on the last step, no way to resend the confirmation,
//        and an address that already had an account told to confirm it.
//   L7   the sign-up page was a fixed two-column grid with 72px sides: too wide for a phone.
//   L11  dead code: get-started.html, pricing/actions.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => fs.readFileSync(join(ROOT, p), 'utf8');

// ── H9: the reset email ─────────────────────────────────────────────────────────────────────
async function loadReset({ limits = {}, captcha = true, sent = { ok: true }, configured = true } = {}) {
  const mail = [];
  const limited = [];
  const order = [];
  const mod = await loadRealModule(join(ROOT, 'src/lib/password-reset.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/rate-limit', { checkRateLimit: async (_c, key, max, win, opts) => { order.push(key.split(':').slice(0, 2).join(':')); limited.push([key, max, win, opts || {}]); return { allowed: limits[key.split(':').slice(0, 2).join(':')] !== false }; } }],
      ['@/lib/turnstile', { verifyTurnstile: async () => { order.push('turnstile'); return captcha; } }],
      ['@/lib/email', { sendEmail: async (m) => { mail.push(m); return sent; }, emailConfigured: () => configured }],
      ['@/lib/coach-application-emails', await loadRealModule(join(ROOT, 'src/lib/coach-application-emails.ts'), { typescript: true })],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ]),
  });
  return { mod, mail, limited, order };
}

function adminFor({ link = { data: { properties: { hashed_token: 'hash-abc' } }, error: null }, handles = {}, rpcError = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      if (rpcError) return { data: null, error: rpcError };
      return { data: handles[args.p_username] ?? null, error: null };
    },
    auth: { admin: { generateLink: async (args) => { calls.push(['generateLink', args]); return typeof link === 'function' ? link(args) : link; } } },
  };
}

test('H9: a reset mails a link /auth/confirm verifies, in any browser, to the address that asked', async () => {
  const { mod, mail, limited } = await loadReset();
  const admin = adminFor();
  const r = await mod.requestPasswordResetEmail(admin, { minMs: 0, email: '  Priya@Example.com ', ip: '203.0.113.9', site: 'https://shape.test' });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(admin.calls, [['generateLink', { type: 'recovery', email: 'priya@example.com' }]], 'Supabase makes the link and sends nothing');
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'priya@example.com');
  const href = mail[0].text.split('\n').find((l) => l.startsWith('https://'));
  const u = new URL(href);
  assert.equal(u.origin + u.pathname, 'https://shape.test/auth/confirm');
  assert.deepEqual(Object.fromEntries(u.searchParams), { token_hash: 'hash-abc', type: 'recovery', next: '/reset-password' });
  assert.ok(mail[0].html.includes(href.replace(/&/g, '&amp;')), 'the button carries the same link');
  assert.deepEqual(limited.map(([k]) => k), ['pwreset:ip:203.0.113.9', 'pwreset:email:priya@example.com'], 'both limits are counted');
  assert.deepEqual(limited.map(([, , , o]) => !!o.failClosed), [false, true], 'the per-address limit fails closed (Fable): it is what stops one inbox being flooded');
});

test('H9: the answer is the same whether or not an account has the address', async () => {
  const { mod, mail } = await loadReset();
  const nobody = adminFor({ link: { data: null, error: { status: 404, code: 'user_not_found', message: 'User with this email not found' } } });
  assert.deepEqual(await mod.requestPasswordResetEmail(nobody, { minMs: 0, email: 'nobody@example.com' }), { ok: true });
  assert.equal(mail.length, 0, 'and nothing is sent');
});

test('H9: an @handle is resolved on the server, and its address is never sent back', async () => {
  const { mod, mail } = await loadReset();
  const admin = adminFor({ handles: { priya_lifts: 'priya@example.com' } });
  assert.deepEqual(await mod.requestPasswordResetEmail(admin, { minMs: 0, email: '@Priya_Lifts' }), { ok: true });
  assert.deepEqual(admin.calls[0], ['rpc', 'get_email_for_username', { p_username: 'priya_lifts' }]);
  assert.equal(mail[0].to, 'priya@example.com');
  const unknown = adminFor();
  assert.deepEqual(await mod.requestPasswordResetEmail(unknown, { minMs: 0, email: 'ghost.handle' }), { ok: true }, 'an unknown handle reads like a sent one');
  assert.equal(unknown.calls.filter(([k]) => k === 'generateLink').length, 0);
  const broken = adminFor({ rpcError: { message: 'down' } });
  assert.equal((await mod.requestPasswordResetEmail(broken, { minMs: 0, email: 'priya_lifts' })).code, 'send_failed', 'a failed lookup is not "sent"');
});

test('H9: a refusal says so only when it would for any address; a real account\'s failed send answers like any other', async () => {
  const bad = await loadReset();
  for (const email of ['', 'not an email', 'a@b', 42, 'x'.repeat(250) + '@example.com']) {
    const r = await bad.mod.requestPasswordResetEmail(adminFor(), { minMs: 0, email });
    assert.equal(r.ok, false, String(email));
    assert.equal(r.status, 400);
    assert.equal(r.code, 'invalid_email');
  }
  const captcha = await loadReset({ captcha: false });
  const c = await captcha.mod.requestPasswordResetEmail(adminFor(), { minMs: 0, email: 'priya@example.com', ip: '203.0.113.9' });
  assert.deepEqual([c.status, c.code], [400, 'captcha_failed']);
  assert.deepEqual(captcha.order, ['pwreset:ip', 'turnstile'], 'the cheap limit before the call to Cloudflare (Fable)');
  const perEmail = await loadReset({ limits: { 'pwreset:email': false } });
  const pe = await perEmail.mod.requestPasswordResetEmail(adminFor(), { minMs: 0, email: 'priya@example.com', ip: '203.0.113.9' });
  assert.deepEqual([pe.status, pe.code], [429, 'rate_limited']);
  assert.equal(perEmail.mail.length, 0);
  const perIp = await loadReset({ limits: { 'pwreset:ip': false } });
  const pi = await perIp.mod.requestPasswordResetEmail(adminFor(), { minMs: 0, email: 'priya@example.com', ip: '203.0.113.9' });
  assert.equal(pi.code, 'rate_limited');
  assert.deepEqual(perIp.order, ['pwreset:ip'], 'past the limit: no human check, no lookup');
  // Mail that is not set up: the same 503 for an account and for nobody.
  const off = await loadReset({ configured: false });
  for (const admin of [adminFor(), adminFor({ link: { data: null, error: { status: 404, message: 'User not found' } } })]) {
    const r = await off.mod.requestPasswordResetEmail(admin, { minMs: 0, email: 'priya@example.com' });
    assert.deepEqual([r.status, r.code], [503, 'send_failed']);
  }
  // ⚠ A REAL ACCOUNT'S FAILURE ANSWERS LIKE NOBODY'S (Fable): a 503 here was a yes to "does this
  // address have an account?". Logged, retried once for the email, answered { ok: true }.
  const errs = [];
  const origErr = console.error; console.error = (...a) => errs.push(a.join(' '));
  try {
    const linkDown = await loadReset();
    assert.deepEqual(await linkDown.mod.requestPasswordResetEmail(adminFor({ link: { data: null, error: { status: 500, message: 'boom' } } }), { minMs: 0, email: 'priya@example.com' }), { ok: true });
    const noHash = await loadReset();
    assert.deepEqual(await noHash.mod.requestPasswordResetEmail(adminFor({ link: { data: { properties: {} }, error: null } }), { minMs: 0, email: 'priya@example.com' }), { ok: true });
    const mailDown = await loadReset({ sent: { ok: false, error: 'resend_500' } });
    assert.deepEqual(await mailDown.mod.requestPasswordResetEmail(adminFor(), { minMs: 0, email: 'priya@example.com' }), { ok: true });
    assert.equal(mailDown.mail.length, 2, 'one retry');
  } finally { console.error = origErr; }
  assert.ok(errs.some((e) => /generateLink failed/.test(e)) && errs.some((e) => /no token/.test(e)) && errs.some((e) => /did not send/.test(e)), 'each failure is logged for us');
  // And at the same pace: an unknown address waits out the floor too.
  const slow = await loadReset();
  const t0 = Date.now();
  await slow.mod.requestPasswordResetEmail(adminFor({ link: { data: null, error: { status: 404, message: 'User not found' } } }), { minMs: 60, email: 'nobody@example.com' });
  assert.ok(Date.now() - t0 >= 55, 'the floor');
  assert.equal(slow.mod.RESET_MIN_MS, 1200);
});

test('H9: the website form and the route both use the one sender; Supabase\'s browser-bound reset is gone', () => {
  const actions = read('src/app/login/actions.ts');
  assert.doesNotMatch(actions, /auth\.resetPasswordForEmail\(/, 'the PKCE link only the asking browser could use');
  assert.match(actions, /requestPasswordResetEmail\(createAdminClient\(\), \{\s*email: formData\.get\('email'\),\s*captchaToken: formData\.get\('captchaToken'\),\s*ip: requestIp\(await headers\(\)\),/);
  const route = read('src/app/api/auth/password-reset/route.ts');
  assert.match(route, /requestPasswordResetEmail\(createAdminClient\(\), \{\s*email: data\.email,\s*captchaToken: data\.captchaToken,\s*ip: requestIp\(request\.headers\),/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/auth\/password-reset', 'POST'\]/);
  assert.match(read('src/app/auth/confirm/route.ts'), /new Set\(\['invite', 'recovery', 'magiclink'\]\)/, '/auth/confirm takes a recovery link');
});

test('H9: the route answers the app (CORS, the auth tier) and passes on what the sender decided', async () => {
  const seen = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/auth/password-reset/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ admin: true }) }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/password-reset', {
        requestIp: (h) => h.get('x-forwarded-for'),
        requestPasswordResetEmail: async (_a, args) => { seen.push(args); return args.email === 'limit@example.com' ? { ok: false, status: 429, code: 'rate_limited', error: 'Too many' } : { ok: true }; },
      }],
    ]),
  });
  const post = (body) => route.POST(new Request('https://shape.test/api/auth/password-reset', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.4' }, body: JSON.stringify(body) }));
  const ok = await post({ email: 'priya@example.com', captchaToken: 'tok' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.deepEqual(seen[0], { email: 'priya@example.com', captchaToken: 'tok', ip: '198.51.100.4' });
  const limited = await post({ email: 'limit@example.com' });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'Too many', code: 'rate_limited' });
  // The proxy's strict auth tier and the app's CORS both cover every /api/auth POST.
  const mw = read('src/lib/supabase/middleware.ts');
  assert.match(mw, /const isAuth = apiPath === '\/api\/auth' \|\| apiPath\.startsWith\('\/api\/auth\/'\);\s*const strict = isAuth && request\.method !== 'GET';/);
});

// The app's call, lifted from the shipped shapeBackend.js and run against a recorded fetch.
function liftReset() {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const i = src.indexOf('async function resetPassword(email, captchaToken) {');
  const j = src.indexOf('\n// Re-send the signup confirmation email', i);
  assert.ok(i > 0 && j > i, 'could not lift resetPassword');
  const calls = [];
  let answer = { status: 200, body: { ok: true } };
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    if (answer === 'offline') throw new TypeError('Failed to fetch');
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  const fn = new Function('fetch', 'apiBaseUrl', src.slice(i, j) + '\nreturn resetPassword;')(fetch, 'https://shape.test');
  return { fn, calls, answer: (a) => { answer = a; } };
}

test('H9: the app asks the server, and says "on its way" only when the server took the request', async () => {
  const a = liftReset();
  assert.equal(await a.fn(' priya@example.com ', 'cap-1'), true);
  assert.deepEqual(a.calls[0], { url: 'https://shape.test/api/auth/password-reset', method: 'POST', body: { email: 'priya@example.com', captchaToken: 'cap-1' } });
  a.answer({ status: 429, body: { error: 'Too many', code: 'rate_limited' } });
  await assert.rejects(a.fn('priya@example.com'), (e) => e.code === 'rate_limited');
  a.answer({ status: 503, body: {} });
  await assert.rejects(a.fn('priya@example.com'), (e) => e.code === 'send_failed');
  a.answer('offline');
  await assert.rejects(a.fn('priya@example.com'), (e) => e.code === 'send_failed');
  await assert.rejects(a.fn('   '), (e) => e.code === 'invalid_email');

  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /window\.ShapeAuth = \{[\s\S]*?\n  resetPassword,\n[\s\S]*?\};/, 'ShapeAuth exposes it: the screen called a function that did not exist');
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  const i = main.indexOf('const forgotPassword = async () => {');
  const body = main.slice(i, main.indexOf('\n  };', i));
  assert.match(body, /if \(!auth\?\.resetPassword\) \{ setAuthError\(tr\('login\.err\.forgotFail'\)\); return; \}/, 'no reset function is a failure, not a sent email');
  assert.match(body, /await auth\.resetPassword\(e, captchaOn \? captchaToken : undefined\);\s*window\.__bsToast\?\.\(tr\('login\.ok\.resetSent'\), 'ok'\);/, 'the toast follows a request the server took');
  for (const [code, key] of [['rate_limited', 'resetLimited'], ['captcha_failed', 'resetCaptcha'], ['invalid_email', 'resetAccount']]) {
    assert.match(body, new RegExp(`code === '${code}' \\? tr\\('login\\.err\\.${key}'\\)`));
  }
  for (const loc of fs.readdirSync(join(ROOT, 'mobile-app/src/i18n/catalogs'))) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/onboarding.json`));
    for (const key of ['resetLimited', 'resetCaptcha', 'resetAccount']) assert.ok(cat[`login.err.${key}`], `${loc}: login.err.${key}`);
  }
});

// ── H10: one server-side place an account gets its profile ──────────────────────────────────
function profilesDb({ row = null, readError = null, writeError = null } = {}) {
  const writes = [];
  const client = {
    from: (table) => {
      assert.equal(table, 'profiles');
      const q = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: readError ? null : row, error: readError }),
        upsert: async (payload, opts) => { writes.push([payload, opts]); return { error: writeError }; },
      };
      return q;
    },
  };
  return { client, writes };
}
const provision = await loadRealModule(join(ROOT, 'src/lib/provision-profile.ts'), { typescript: true });
const NEWBIE = { id: 'u-1', email: 'sam@example.com', user_metadata: { role: 'client', date_of_birth: '1990-04-02', full_name: 'Sam Lee' } };

test('H10: a signed-in account with no profile gets one from its sign-up details, and an existing one is only filled in', async () => {
  const none = profilesDb();
  assert.equal(await provision.ensureProfile(none.client, NEWBIE), 'created');
  assert.deepEqual(none.writes, [[{ id: 'u-1', full_name: 'Sam Lee', email: 'sam@example.com', role: 'client', roles: ['client'], date_of_birth: '1990-04-02' }, { onConflict: 'id' }]]);
  // /signup's accounts carried no name and no role: a client, with the date they gave.
  const bare = profilesDb();
  await provision.ensureProfile(bare.client, { id: 'u-2', email: 'x@example.com', user_metadata: { date_of_birth: '1991-01-01' } });
  assert.deepEqual(bare.writes[0][0], { id: 'u-2', email: 'x@example.com', role: 'client', roles: ['client'], date_of_birth: '1991-01-01' });
  // An existing row keeps what it has; only the missing date of birth is filled.
  const partial = profilesDb({ row: { id: 'u-1', full_name: 'Sam L.', email: 'sam@example.com', role: 'trainer', roles: ['trainer', 'client'], date_of_birth: null } });
  assert.equal(await provision.ensureProfile(partial.client, NEWBIE), 'filled');
  assert.deepEqual(partial.writes[0][0], { id: 'u-1', date_of_birth: '1990-04-02' }, 'no role, roles or name written over a coach');
  // Nothing missing: no write at all (the bridge runs on every sign-in).
  const whole = profilesDb({ row: { id: 'u-1', full_name: 'Sam', email: 'sam@example.com', role: 'client', roles: ['client'], date_of_birth: '1990-04-02' } });
  assert.equal(await provision.ensureProfile(whole.client, NEWBIE), 'unchanged');
  assert.equal(whole.writes.length, 0);
  // A failed read is not an absent row: nothing is written over a row we could not see.
  const unread = profilesDb({ readError: { message: 'timeout' } });
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(await provision.ensureProfile(unread.client, NEWBIE), 'unread');
    assert.equal(unread.writes.length, 0);
    assert.equal(await provision.ensureProfile(profilesDb({ writeError: { message: 'denied' } }).client, NEWBIE), 'failed');
  } finally { console.warn = warn; }
  assert.equal(await provision.ensureProfile(profilesDb().client, null), 'unchanged');
});

test('H10: the sign-in bridge provisions (the website and the app both call it), and the callback uses the same function', async () => {
  const db = profilesDb();
  const accepted = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/auth/session/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['next/headers', { cookies: async () => ({ getAll: () => [], set: () => {} }) }],
      ['@/lib/supabase/server', { createClient: async () => ({ ...db.client, auth: { setSession: async () => ({ data: { user: NEWBIE }, error: null }) } }) }],
      ['@/lib/supabase/auth-cookies.mjs', { clearSupabaseAuthCookies: () => {} }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/native-cors', { NATIVE_APP_ORIGINS: ['capacitor://localhost', 'https://localhost'] }],
      ['@/lib/provision-profile', provision],
      ['@/lib/legal-acceptance', { recordLegalAcceptance: async (admin, u) => { accepted.push([admin, u]); return 'recorded'; } }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ admin: true }) }],
    ]),
  });
  const res = await route.POST(new Request('https://shape.test/api/auth/session', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'capacitor://localhost' }, body: JSON.stringify({ access_token: 'a', refresh_token: 'r' }) }));
  assert.equal(res.status, 200);
  assert.equal(db.writes.length, 1, 'the account with no row has one now');
  assert.equal(db.writes[0][0].role, 'client');
  assert.deepEqual(accepted, [[{ admin: true }, NEWBIE]], 'and the Terms acceptance is recorded by the service role (M4)');
  const callback = read('src/app/auth/callback/route.ts');
  assert.match(callback, /await ensureProfile\(supabase as unknown as SupabaseClient, data\?\.user\);/);
  assert.doesNotMatch(callback, /from\('profiles'\)/, 'one copy of the rules, not two');
});

// ── M5 + L11: one website sign-up; dead code gone ───────────────────────────────────────────
async function loadRedirects() {
  const src = fs.readFileSync(join(ROOT, 'next.config.ts'), 'utf8').replace(/^import .*$/gm, '');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = await import('data:text/javascript,' + encodeURIComponent('const withSentryConfig = (c) => c;\n' + js));
  return mod.default.redirects();
}
function resolveRedirect(redirects, pathname, query = {}) {
  for (const r of redirects) {
    if (r.source !== pathname) continue;
    const ok = (r.has || []).every((h) => h.type === 'query' && query[h.key] !== undefined && (h.value === undefined || new RegExp(`^${h.value}$`).test(query[h.key])));
    if (ok) return r.destination;
  }
  return null;
}

test('M5: /signup lands on the website\'s sign-up, and a coach on their application; its form is gone', async () => {
  const redirects = await loadRedirects();
  assert.equal(resolveRedirect(redirects, '/signup'), '/newdesign/SignupClient.html');
  assert.equal(resolveRedirect(redirects, '/signup', { next: '/pricing' }), '/newdesign/SignupClient.html', 'the query rides along to signup.jsx');
  assert.equal(resolveRedirect(redirects, '/signup', { role: 'client' }), '/newdesign/SignupClient.html');
  assert.equal(resolveRedirect(redirects, '/signup', { role: 'trainer' }), '/newdesign/SignupTrainer.html', 'Trainer no longer makes a client account');
  assert.equal(resolveRedirect(redirects, '/signup', { role: 'nutritionist' }), '/newdesign/SignupNutritionist.html');
  assert.equal(resolveRedirect(redirects, '/signup', { role: 'dietitian' }), '/newdesign/SignupNutritionist.html');
  assert.equal(resolveRedirect(redirects, '/signup', { role: 'trainerx' }), '/newdesign/SignupClient.html', 'an anchored match');
  for (const d of ['SignupClient', 'SignupTrainer', 'SignupNutritionist']) assert.ok(fs.existsSync(join(ROOT, `public/newdesign/${d}.html`)));
  for (const f of ['src/app/signup/page.tsx', 'src/app/signup/SignupForm.tsx']) assert.equal(fs.existsSync(join(ROOT, f)), false, `${f} is back`);
  assert.doesNotMatch(read('src/app/login/actions.ts'), /export async function signup\(/);
  // Links go straight there rather than through the redirect.
  for (const f of ['src/components/Nav.tsx', 'src/components/Footer.tsx', 'src/components/CinematicNav.tsx', 'public/newdesign/publicProfile.jsx', 'public/newdesign/recipeDetailPage.jsx', 'public/newdesign/recipesPage.jsx', 'public/newdesign/consultation.html']) {
    const src = read(f);
    assert.doesNotMatch(src, /href="\/signup"/, `${f} still links /signup`);
    assert.match(src, /href="\/newdesign\/SignupClient\.html"/, f);
  }
});

test('L11: the dead pricing action and get-started page are gone', () => {
  for (const f of ['src/app/pricing/actions.ts', 'public/newdesign/get-started.html']) assert.equal(fs.existsSync(join(ROOT, f)), false, `${f} is back`);
});

// ── M4: the Terms and Privacy acceptance, recorded ──────────────────────────────────────────
const legal = await loadRealModule(join(ROOT, 'src/lib/legal-acceptance.ts'), { typescript: true });
function acceptDb({ error = null, markError = null } = {}) {
  const rows = [];
  const marks = [];
  return { rows, marks, client: {
    from: (t) => { assert.equal(t, 'terms_acceptances'); return { upsert: async (row, opts) => { rows.push([row, opts]); return { error }; } }; },
    auth: { admin: { updateUserById: async (id, attrs) => { marks.push([id, attrs]); return { error: markError }; } } },
  } };
}

test('M4: the versions recorded are the pages\' own "Last updated" dates', () => {
  const pageDate = (f) => {
    const m = /Last updated — ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(read(f));
    assert.ok(m, `${f} has no Last updated line`);
    return new Date(m[1] + ' 12:00 UTC').toISOString().slice(0, 10);
  };
  assert.equal(legal.TERMS_VERSIONS.at(-1), pageDate('public/terms.html'), 'a new Terms date needs a new entry in TERMS_VERSIONS');
  assert.equal(legal.PRIVACY_VERSIONS.at(-1), pageDate('public/privacy.html'), 'a new privacy date needs a new entry in PRIVACY_VERSIONS');
  assert.equal(legal.versionInForce(['2026-06-22', '2026-11-01'], '2026-10-15'), '2026-06-22');
  assert.equal(legal.versionInForce(['2026-06-22', '2026-11-01'], '2026-11-01'), '2026-11-01');
  assert.equal(legal.versionInForce(['2026-06-22'], '2026-01-01'), '2026-06-22', 'before the first: the first');
});

test('M4: an account that accepted at sign-up gets one record, at the account\'s own time, never the browser\'s', async () => {
  const created = new Date(Date.now() - 2 * 86_400_000).toISOString();
  // What the migration's trigger leaves in app_metadata as the account is created.
  const captured = { provider: 'phone', terms_accepted_at: created, terms_surface: 'app' };
  const user = { id: 'u-1', created_at: created, user_metadata: { terms_accepted_at: '1999-01-01T00:00:00Z', signup_source: { surface: 'website' } }, app_metadata: captured };
  const db = acceptDb();
  assert.equal(await legal.recordLegalAcceptance(db.client, user), 'recorded');
  assert.deepEqual(db.rows, [[
    { user_id: 'u-1', terms_version: legal.TERMS_VERSIONS.at(-1), privacy_version: legal.PRIVACY_VERSIONS.at(-1), surface: 'app', accepted_at: created },
    { onConflict: 'user_id,terms_version,privacy_version', ignoreDuplicates: true },
  ]], 'a repeat sign-in writes nothing new');
  const web = acceptDb();
  await legal.recordLegalAcceptance(web.client, { ...user, app_metadata: { terms_accepted_at: created } });
  assert.equal(web.rows[0][0].surface, 'website');
  for (const u of [
    null,
    { id: 'u', created_at: created, user_metadata: {}, app_metadata: {} },
    { id: 'u', created_at: 'nope', app_metadata: { terms_accepted_at: 'x' } },
    // Codex on #2379 (P1): the member's own metadata is theirs to edit, so a flag set there later
    // (an old account backdating an acceptance to its creation) records nothing.
    { id: 'u', created_at: created, user_metadata: { terms_accepted_at: '2026-01-01T00:00:00Z', signup_source: { surface: 'app' } }, app_metadata: { provider: 'email' } },
  ]) {
    const none = acceptDb();
    assert.equal(await legal.recordLegalAcceptance(none.client, u), 'none');
    assert.equal(none.rows.length, 0);
  }
  // Recorded once, whenever the first sign-in is (Fable: a 30-day window lost a late first sign-in).
  const key = `${legal.TERMS_VERSIONS.at(-1)}|${legal.PRIVACY_VERSIONS.at(-1)}`;
  assert.deepEqual(db.marks, [['u-1', { app_metadata: { ...captured, terms_recorded: key } }]], 'the marker, which only the service role can write');
  const late = acceptDb();
  assert.equal(await legal.recordLegalAcceptance(late.client, { ...user, created_at: new Date(Date.now() - 400 * 86_400_000).toISOString() }), 'recorded', 'a first sign-in a year later is still recorded');
  const marked = acceptDb();
  assert.equal(await legal.recordLegalAcceptance(marked.client, { ...user, app_metadata: { ...captured, terms_recorded: key } }), 'none', 'every later page load pays nothing');
  assert.equal(marked.rows.length, 0);
  const keepsOthers = acceptDb();
  await legal.recordLegalAcceptance(keepsOthers.client, { ...user, app_metadata: { ...captured, terms_recorded: 'old|old' } });
  assert.deepEqual(keepsOthers.marks[0][1].app_metadata, { ...captured, terms_recorded: key }, 'a newer version is recorded and the rest of app_metadata kept');
  const markFails = acceptDb({ markError: { message: 'x' } });
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(await legal.recordLegalAcceptance(markFails.client, user), 'recorded', 'the record stands; the next page load retries the marker'); } finally { console.warn = warn; }
  const missing = acceptDb({ error: { code: '42P01', message: 'relation does not exist' } });
  assert.equal(await legal.recordLegalAcceptance(missing.client, user), 'failed', 'before the migration: nothing to record into, and quiet');
});

test('M4: the table is the server\'s to write; both sign-in doors record; both sign-ups carry the acceptance', () => {
  const sql = read('supabase-migrations/2026-10-15-terms-acceptances.sql');
  assert.match(sql, /alter table public\.terms_acceptances enable row level security;/);
  assert.match(sql, /revoke all on public\.terms_acceptances from anon, authenticated;\ngrant select on public\.terms_acceptances to authenticated;/);
  assert.match(sql, /using \(user_id = auth\.uid\(\)\);/);
  assert.match(sql, /references auth\.users \(id\) on delete cascade/);
  assert.match(sql, /raise exception 'terms_acceptances: a member or a visitor can write it/);
  // Codex on #2379 (P1): the acceptance is taken as the account is created, into app_metadata, by a
  // BEFORE INSERT trigger (an UPDATE of user_metadata never fires it), and the guard holds it there.
  assert.match(sql, /create trigger capture_terms_acceptance\n  before insert on auth\.users\n  for each row execute function public\.capture_terms_acceptance\(\);/);
  assert.match(sql, /security definer\nset search_path = pg_catalog, pg_temp\n/);
  assert.match(sql, /new\.raw_app_meta_data := coalesce\(new\.raw_app_meta_data, '\{\}'::jsonb\) \|\| jsonb_build_object\(\n      'terms_accepted_at', to_char\(coalesce\(new\.created_at, now\(\)\)/, 'the time is the account\'s, not the browser\'s');
  assert.match(sql, /exception when others then\n  return new;/, 'a sign-up is never refused over the record');
  assert.match(sql, /revoke all on function public\.capture_terms_acceptance\(\) from public, anon, authenticated;/);
  assert.match(sql, /raise exception 'terms_acceptances: the capture trigger is not a row-level BEFORE INSERT trigger on auth\.users'/);
  assert.match(read('src/lib/legal-acceptance.ts'), /const app = \(user\?\.app_metadata \?\? \{\}\) as Record<string, unknown>;\n  if \(!user\?\.id \|\| typeof app\.terms_accepted_at !== 'string'/);
  for (const f of ['src/app/api/auth/session/route.ts', 'src/app/auth/callback/route.ts']) {
    assert.match(read(f), /try \{ await recordLegalAcceptance\(createAdminClient\(\), data\?\.user\); \} catch \{ \/\* best effort \*\/ \}/, f);
  }
  assert.match(read('public/newdesign/signup.jsx'), /if \(!values\.tos\) \{ setError\([^)]*\); return; \}[\s\S]*terms_accepted_at: new Date\(\)\.toISOString\(\),/, 'the website records only after its required tick');
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /signup_source: typeof window[^\n]*\n[^\n]*\n[^\n]*\n\s+terms_accepted_at: new Date\(\)\.toISOString\(\),/);
  assert.match(be, /if \(isCreate\) meta\.terms_accepted_at = new Date\(\)\.toISOString\(\);/, 'the phone create too');
});

test('M4 + L4: the app says what joining means, in every language, and never "free" beside $5', () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  const paywall = main.slice(main.indexOf('function BSPaywall('), main.indexOf('// Persistent "you\'re previewing" banner'));
  assert.match(paywall, /\{tr\('paywall\.renews', \{ price: BS_PRICE \}\)\} \{tr\('login\.agree'\)\}\s*<BSLegalLinks /);
  const login = main.slice(main.indexOf('function BSLogin('), main.indexOf('function BSPaywall('));
  assert.match(login, /\{isCreate && \(isPhone \|\| createStep === 2\) && \([\s\S]{0,200}\{tr\('login\.agree'\)\}\s*<BSLegalLinks /, 'on the create step that makes the account');
  assert.match(main, /onClick=\{\(\) => bsOpenLegal\('\/terms\.html'\)\}[\s\S]{0,120}onClick=\{\(\) => bsOpenLegal\('\/privacy\.html'\)\}/);
  for (const f of ['public/terms.html', 'public/privacy.html']) assert.ok(fs.existsSync(join(ROOT, f)));
  // L4: the checkout's English refusals are not shown as they came.
  const start = main.slice(main.indexOf('async function bsmStartCheckout('), main.indexOf('// The membership-resolving hold'));
  assert.doesNotMatch(start, /__bsToast\?\.\(r\.error/);
  assert.match(start, /r\.code === 'age_restricted'\) window\.__bsToast\?\.\(t\?\.\('onboarding:login\.err\.under18'\)/);
  assert.match(start, /r\.code === 'checkout_in_progress'\) window\.__bsToast\?\.\(t\?\.\('onboarding:paywall\.err\.inProgress'\)/);
  assert.doesNotMatch(main, /Create a free account/);
  const FREE = /free|kostenlos|gratis|gratuit|kyauta|grátis|бесплатн|ücretsiz|безкоштовн|miễn phí/i;
  for (const loc of fs.readdirSync(join(ROOT, 'mobile-app/src/i18n/catalogs'))) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/onboarding.json`));
    for (const key of ['login.agree', 'legal.terms', 'legal.privacy', 'paywall.renews', 'paywall.err.inProgress']) assert.ok(cat[key], `${loc}: ${key}`);
    assert.match(cat['paywall.renews'], /\{price\}/, `${loc}: the price`);
    for (const key of ['shell.requireAccount', 'shell.requireAccountLabel']) assert.doesNotMatch(cat[key], FREE, `${loc}: ${key} says free`);
  }
});

// ── L1: the Score intro and the tour key on "seen" alone ────────────────────────────────────
// The mount effect, lifted from the shipped client file and run with a recorded React and window.
function liftFirstRun(marker) {
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const i = src.indexOf(marker);
  assert.ok(i > 0, marker);
  const start = src.lastIndexOf('React.useEffect(() => {', i);
  const end = src.indexOf('\n  }, []);', i) + '\n  }, []);'.length;
  return src.slice(start, end);
}
async function runFirstRun(code, { goals, local = {}, user = { id: 'u', created_at: '2024-01-01T00:00:00Z' }, coach = false }) {
  const shown = [];
  const storage = { ...local };
  const localStorage = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } };
  const win = { ShapeAuth: { getCachedState: () => ({ user }) }, shapeDb: { getUserGoals: async () => (goals instanceof Error ? Promise.reject(goals) : goals) } };
  const React = { useEffect: (fn) => fn() };
  new Function('React', 'window', 'localStorage', 'setTimeout', 'clearTimeout', 'setShowScoreIntro', 'setShowTour', 'bsIsCoachAccount', code)(
    React, win, localStorage, () => 0, () => {}, (v) => shown.push(['intro', v]), (v) => shown.push(['tour', v]), () => coach);
  await new Promise((r) => setImmediate(r));
  return { shown, storage };
}

test('L1: a member of any age who has not seen the Score intro or the tour gets them; a failed read waits', async () => {
  const intro = liftFirstRun("done = localStorage.getItem('shape.scoreIntroSeen') === '1';");
  const tour = liftFirstRun("const decide = () => {\n      if (!alive || done) return;\n      const u = window.ShapeAuth?.getCachedState?.().user;\n      if (!u) return; // signed out / not resolved yet");
  for (const code of [intro, tour]) assert.doesNotMatch(code, /NEW_MS|created_at/, 'no account-age window');
  // An account made in 2024, never shown either: the intro, then (once it is seen) the tour.
  assert.deepEqual((await runFirstRun(intro, { goals: {} })).shown, [['intro', true]]);
  assert.deepEqual((await runFirstRun(tour, { goals: {}, local: { 'shape.scoreIntroSeen': '1' } })).shown, [['tour', true]]);
  // Seen on another device: not shown, and remembered here.
  const seen = await runFirstRun(intro, { goals: { seen: true } });
  assert.deepEqual(seen.shown, []);
  assert.equal(seen.storage['shape.scoreIntroSeen'], '1');
  assert.deepEqual((await runFirstRun(tour, { goals: { tourSeen: true }, local: { 'shape.scoreIntroSeen': '1' } })).shown, []);
  // The cloud read failed (getUserGoals answers null on an error, or throws): not shown; next launch asks.
  for (const goals of [null, new Error('offline')]) {
    assert.deepEqual((await runFirstRun(intro, { goals })).shown, [], 'a failed read is not "never seen"');
    assert.deepEqual((await runFirstRun(tour, { goals, local: { 'shape.scoreIntroSeen': '1' } })).shown, []);
  }
  assert.deepEqual((await runFirstRun(intro, { goals: {}, local: { 'shape.scoreIntroSeen': '1' } })).shown, [], 'seen on this device');
  assert.deepEqual((await runFirstRun(intro, { goals: {}, user: null })).shown, [], 'signed out');
  // A coach on the client app gets neither: they are the member's (Fable).
  assert.deepEqual((await runFirstRun(intro, { goals: {}, coach: true })).shown, []);
  assert.deepEqual((await runFirstRun(tour, { goals: {}, local: { 'shape.scoreIntroSeen': '1' }, coach: true })).shown, []);
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), /const bsIsCoachAccount = \(\) => \{\s*try \{ return \['trainer', 'nutritionist', 'dietitian'\]\.includes\(window\.ShapeAuth\?\.getCachedState\?\.\(\)\?\.profile\?\.role\); \}/);
});

// ── L3: a phone account has a name, and any account can get a handle ────────────────────────
test('L3: the phone create needs a name, offers a handle, and claims it once the code is verified', async () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  const send = main.slice(main.indexOf('const sendPhoneCode = async () => {'), main.indexOf('// Phone — step 2: verify the code and sign in.'));
  assert.match(send, /if \(isCreate\) \{\s*if \(!fullName\.trim\(\)\) \{ setAuthError\(tr\('login\.err\.nameRequired'\)\); return; \}/);
  assert.match(send, /username: isCreate \? username : undefined \}\);/);
  assert.match(send, /if \(username && unameOk === null\) \{ setAuthError\(tr\('login\.handleChecking'\)\); return; \}/, 'a handle still being checked is not accepted yet (Fable)');
  assert.match(main, /\{isCreate && \(!stepped \|\| createStep === 1\) && wireField\(tr\('login\.fieldHandle'\),/, 'the handle field shows on the phone create too');
  // signInWithPhone, lifted and run: the handle rides in the sign-up metadata.
  const be = read('mobile-app/src/services/shapeBackend.js');
  const i = be.indexOf('async function signInWithPhone(');
  const fn = be.slice(i, be.indexOf('\n}\n', i) + 2);
  const calls = [];
  const supabase = { auth: { signInWithOtp: async (a) => { calls.push(a); return { error: null }; } } };
  const signIn = new Function('supabase', 'authConfigured', 'normalizeRole', 'isMinorFromDob', fn + '\nreturn signInWithPhone;')(supabase, true, (r) => r, () => false);
  await signIn({ phone: '+15550001111', fullName: 'Sam Lee', role: 'client', dob: '1990-01-01', isCreate: true, username: '@Sam.Lee' });
  assert.equal(calls[0].options.data.username, 'sam.lee');
  assert.equal(calls[0].options.data.full_name, 'Sam Lee');
  await signIn({ phone: '+15550001111', isCreate: false, username: 'someone' });
  assert.equal(calls[1].options.data, undefined, 'a sign-in sends no sign-up details');
  const verify = be.slice(be.indexOf('async function verifyPhoneOtp('), be.indexOf('const cached = setCached({ user: data.user, session: data.session, profile });', be.indexOf('async function verifyPhoneOtp(')));
  assert.match(verify, /if \(data\.user\) profile = await ensureUsernameClaimed\(data\.user, profile\);/);
  for (const loc of fs.readdirSync(join(ROOT, 'mobile-app/src/i18n/catalogs'))) {
    assert.ok(JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/onboarding.json`))['login.err.nameRequired'], `${loc}: login.err.nameRequired`);
  }
});

test('L3: the profile editor claims the account\'s username when it has none; a taken one saves nothing', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const save = client.slice(client.indexOf('const saveEdit  = async () => {'), client.indexOf('const cancelEdit = () => setEditing(false);'));
  const claim = save.indexOf('await window.ShapeAuth.claimUsername(want);');
  assert.ok(claim > 0, 'the claim');
  assert.ok(claim < save.indexOf('await bsSaveIdentity(patch);'), 'before the profile is written');
  assert.match(save, /if \(touched\.has\('handle'\) && typed && !accountUsername && window\.ShapeAuth\?\.claimUsername\) \{/);
  assert.match(save, /if \(!claimed\) \{ window\.__bsToast\?\.\([^;]*'err'\); return; \}/);
  // The cached username is from launch: read fresh before claiming, and claim nothing on a failed read (Fable).
  assert.match(save, /const r = sb && uid \? await sb\.from\('profiles'\)\.select\('username'\)\.eq\('id', uid\)\.maybeSingle\(\) : null;\s*accountUsername = r && !r\.error \? \(r\.data\?\.username \|\| null\) : 'unknown';/);
  assert.ok(save.indexOf("select('username')") < save.indexOf('await window.ShapeAuth.claimUsername(want);'));
  assert.match(save, /if \(touched\.has\('handle'\) && typed && !accountUsername\) \{\s*const sb = window\.ShapeAuth\?\.client;/, 'read whenever the cached profile has none');
});

// ── L5: phone notifications are asked for when they mean something ──────────────────────────
async function loadPush(receive) {
  const asked = [];
  const plugin = {
    checkPermissions: async () => ({ receive: receive.now }),
    requestPermissions: async () => { asked.push('prompt'); receive.now = receive.answer; return { receive: receive.answer }; },
    addListener: async () => ({ remove: () => {} }),
    register: async () => { asked.push('register'); },
  };
  globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { PushNotifications: plugin } } };
  const mod = await loadRealModule(join(ROOT, 'mobile-app/src/services/push.js'), {});
  return { mod, asked };
}

test('L5: signing in never runs the system prompt; asking does, once, and the answer is read back', async () => {
  const before = globalThis.window;
  try {
    const fresh = { now: 'prompt', answer: 'granted' };
    const a = await loadPush(fresh);
    await a.mod.registerPush();
    assert.deepEqual(a.asked, [], 'sign-in: no prompt, no registration');
    assert.equal(await a.mod.pushPermission(), 'prompt');
    assert.equal(await a.mod.askForPush(), 'granted');
    assert.deepEqual(a.asked, ['prompt', 'register']);
    const allowed = await loadPush({ now: 'granted' });
    await allowed.mod.registerPush();
    assert.deepEqual(allowed.asked, ['register'], 'a phone already allowed is registered silently');
    const refused = await loadPush({ now: 'denied' });
    assert.equal(await refused.mod.pushPermission(), 'denied');
    globalThis.window = { Capacitor: { isNativePlatform: () => false } };
    const web = await loadRealModule(join(ROOT, 'mobile-app/src/services/push.js'), {});
    assert.equal(await web.pushPermission(), 'unavailable');
  } finally { globalThis.window = before; }
  // The shell asks after a reminder is saved, with an explanation first; Settings has the row.
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /window\.ShapePush = \{ register: registerPush, permission: pushPermission, ask: askForPush \};/);
  assert.match(be, /if \(res\.ok && out && out\.ok !== false\) bsReminderSet\(\);/);
  assert.match(be, /await scheduleLocalHabit\(row\);\s*\/\/[^\n]*\n\s*if \(row\.enabled\) \{ try \{ if \(typeof window !== 'undefined'\) window\.dispatchEvent\(new CustomEvent\('shape:reminderSet'\)\); \}/);
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  const ask = main.slice(main.indexOf('function BSPushAsk({ coach = false }) {'), main.indexOf('// Persistent "you\'re previewing" banner'));
  assert.ok(ask.length > 100, 'the ask was found');
  assert.match(ask, /window\.addEventListener\('shape:reminderSet', decide\);/);
  assert.match(ask, /if \(perm === 'prompt'\) setOpen\(true\);\s*else if \(perm === 'granted'\) \{ try \{ window\.ShapePush\?\.register\?\.\(\); \} catch \(e\) \{\} \}/, 'only a phone that has not answered is asked; one that allows push is registered (Fable)');
  assert.match(ask, /const tid = coach \? setTimeout\(decide, 4000\) : null;/, 'a coach sets no reminders: asked when the coach app opens (Fable)');
  assert.match(ask, /\{coach \? tr\('settings:push\.askBodyCoach'\) : tr\('settings:push\.askBody'\)\}/);
  assert.match(ask, /const turnOn = async \(\) => \{ setOpen\(false\); try \{ await window\.ShapePush\?\.ask\?\.\(\); \}/, 'the system prompt only from Turn on');
  assert.match(main, /<App onLogout=\{handleLogout\}[^\n]*\/>\s*<BSPushAsk coach=\{isCoachRole\} \/>/);
  // A coach turns push on in Settings → Notifications, as a member does (the row below). The pros
  // module's own Notifications page hung off the old coach Me page, which nothing rendered, and
  // was deleted with it (2026-10-17).
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), /Object\.assign\(window, \{ BSPushPermissionRow \}\);/);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /<div style=\{\{ padding: `4px \$\{t\.padX\}px 30px` \}\}>\s*<BSPushPermissionRow \/>/);
  for (const loc of fs.readdirSync(join(ROOT, 'mobile-app/src/i18n/catalogs'))) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/settings.json`));
    for (const k of ['push.title', 'push.on', 'push.off', 'push.notYet', 'push.turnOn', 'push.askTitle', 'push.askBody', 'push.askYes', 'push.notNow', 'push.askTitleCoach', 'push.askBodyCoach']) assert.ok(cat[k], `${loc}: settings:${k}`);
  }
});

// ── L6: the website sign-up, mounted ────────────────────────────────────────────────────────
async function mountSignupPage(signUpAnswer) {
  const { JSDOM } = await import('jsdom');
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/newdesign/SignupClient.html' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // ⚠ LOADED AFTER THE WINDOW EXISTS: react-dom decides at load whether the page has input events.
  const React = (await import('react')).default;
  const ReactDOMClient = await import('react-dom/client');
  const calls = { signUp: [], resend: [] };
  dom.window.ShapeAgeDerive = { isMinorFromDob: (d) => (d ? false : null) };
  dom.window.shapeDb = { client: { auth: {
    signUp: async (a) => { calls.signUp.push(a); return signUpAnswer; },
    resend: async (a) => { calls.resend.push(a); return { error: null }; },
  } } };
  const code = babel.transformSync(read('public/newdesign/signup.jsx'), { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  let root = null;
  const ReactDOM = { createRoot: (el) => (root = ReactDOMClient.createRoot(el)) };
  await React.act(async () => {
    new Function('React', 'ReactDOM', 'window', 'document', 'Logo', 'serif', 'sans', 'INK', 'PAPER', 'TEAL', code)(React, ReactDOM, dom.window, dom.window.document, () => null, 'serif', 'sans', '#fff', '#000', '#0ac5a8');
  });
  const doc = dom.window.document;
  const text = () => doc.body.textContent;
  const button = (label) => [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const click = async (el) => React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  const type = async (input, value) => React.act(async () => { setValue.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  return {
    doc, text, button, click, type, calls,
    async unmount() {
      try { await React.act(async () => root.unmount()); } finally {
        dom.window.close();
        Object.assign(globalThis, { window: before.window, document: before.document, IS_REACT_ACT_ENVIRONMENT: before.act });
      }
    },
  };
}
async function fillAndSubmit(p) {
  await p.click(p.button('Continue'));
  assert.match(p.text(), /First and last name are required\./, 'Personal says what is wrong before it is left');
  assert.match(p.text(), /Step 1 of 3/i);
  const inputs = [...p.doc.querySelectorAll('input')];
  const [first, last, handle, email, password, dob] = inputs;
  await p.type(first, 'Sam'); await p.type(last, 'Lee'); await p.type(handle, 'sam.lee');
  await p.type(email, 'not-an-email'); await p.type(password, 'short');
  await p.click(p.button('Continue'));
  assert.match(p.text(), /Enter a valid email address\./, 'a malformed email, on the step it was typed (Codex on #2379)');
  assert.match(p.text(), /Step 1 of 3/i);
  await p.type(email, 'sam@example.com');
  await p.click(p.button('Continue'));
  assert.match(p.text(), /Choose a password with at least 8 characters\./, 'a short password, on the step it was typed');
  await p.type(password, 'long-enough-1'); await p.type(dob, '1990-04-02');
  await p.click(p.button('Continue'));
  assert.match(p.text(), /Step 2 of 3/i);
  await p.click(p.button('Continue'));
  await p.click(p.button('A trainer'));
  await p.click([...p.doc.querySelectorAll('label')].find((l) => /Terms of Service/.test(l.textContent)));
  await p.click(p.button('Create profile'));
}

test('L6: each step says what is wrong before it is left; an address with an account is told so, not to confirm it', async () => {
  const existing = await mountSignupPage({ data: { user: { id: 'u-x', identities: [] }, session: null }, error: null });
  try {
    await fillAndSubmit(existing);
    assert.equal(existing.calls.signUp.length, 1);
    assert.match(existing.text(), /You already have an account\./);
    assert.doesNotMatch(existing.text(), /Confirm your email/);
    assert.ok([...existing.doc.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/forgot-password'), 'the way back in');
  } finally { await existing.unmount(); }
});

test('L6: a new address is asked to confirm it, and can have the email sent again', async () => {
  const fresh = await mountSignupPage({ data: { user: { id: 'u-n', identities: [{ id: 'i' }] }, session: null }, error: null });
  try {
    await fillAndSubmit(fresh);
    assert.match(fresh.text(), /Confirm your email\./);
    await fresh.click(fresh.button('Send it again'));
    assert.equal(fresh.calls.resend.length, 1);
    assert.equal(fresh.calls.resend[0].type, 'signup');
    assert.equal(fresh.calls.resend[0].email, 'sam@example.com');
    assert.match(fresh.calls.resend[0].options.emailRedirectTo, /\/newdesign\/Login\.html$/);
    assert.match(fresh.text(), /Sent again\. Check your inbox and your spam folder\./);
  } finally { await fresh.unmount(); }
  // The welcome after payment (the review's last L6 clause) already ships: welcomeMember emails it.
  assert.match(read('src/lib/coach-thread.ts'), /if \(to\) await sendEmail\(\{ to, \.\.\.membershipWelcomeEmail\(\{ firstName: first \}\) \}\);/);
});

test('L7: below 900px the sign-up page is one column with 16px sides, and paired fields stack below 560px', () => {
  const src = read('public/newdesign/signup.jsx');
  const css = src.slice(src.indexOf('<style>{`'), src.indexOf('`}</style>', src.indexOf('<style>{`')));
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*\.su-pad \{ padding-left: 16px !important; padding-right: 16px !important; \}[\s\S]*\.su-page \{ grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*\.su-2col \{ grid-template-columns: minmax\(0, 1fr\) !important; \}/);
  for (const cls of ['su-pad', 'su-main', 'su-page', 'su-aside', 'su-title', 'su-card']) assert.match(src, new RegExp(`className="[^"]*\\b${cls}\\b`), cls);
  assert.doesNotMatch(src, /<div style=\{\{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1[28] \}\}>/, 'every paired-field grid stacks');
});
