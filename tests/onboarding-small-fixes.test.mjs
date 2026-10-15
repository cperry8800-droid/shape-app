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
async function loadReset({ limits = {}, captcha = true, sent = { ok: true } } = {}) {
  const mail = [];
  const limited = [];
  const mod = await loadRealModule(join(ROOT, 'src/lib/password-reset.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/rate-limit', { checkRateLimit: async (_c, key, max, win) => { limited.push([key, max, win]); return { allowed: limits[key.split(':').slice(0, 2).join(':')] !== false }; } }],
      ['@/lib/turnstile', { verifyTurnstile: async () => captcha }],
      ['@/lib/email', { sendEmail: async (m) => { mail.push(m); return sent; } }],
      ['@/lib/coach-application-emails', await loadRealModule(join(ROOT, 'src/lib/coach-application-emails.ts'), { typescript: true })],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ]),
  });
  return { mod, mail, limited };
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
  const r = await mod.requestPasswordResetEmail(admin, { email: '  Priya@Example.com ', ip: '203.0.113.9', site: 'https://shape.test' });
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
});

test('H9: the answer is the same whether or not an account has the address', async () => {
  const { mod, mail } = await loadReset();
  const nobody = adminFor({ link: { data: null, error: { status: 404, code: 'user_not_found', message: 'User with this email not found' } } });
  assert.deepEqual(await mod.requestPasswordResetEmail(nobody, { email: 'nobody@example.com' }), { ok: true });
  assert.equal(mail.length, 0, 'and nothing is sent');
});

test('H9: an @handle is resolved on the server, and its address is never sent back', async () => {
  const { mod, mail } = await loadReset();
  const admin = adminFor({ handles: { priya_lifts: 'priya@example.com' } });
  assert.deepEqual(await mod.requestPasswordResetEmail(admin, { email: '@Priya_Lifts' }), { ok: true });
  assert.deepEqual(admin.calls[0], ['rpc', 'get_email_for_username', { p_username: 'priya_lifts' }]);
  assert.equal(mail[0].to, 'priya@example.com');
  const unknown = adminFor();
  assert.deepEqual(await mod.requestPasswordResetEmail(unknown, { email: 'ghost.handle' }), { ok: true }, 'an unknown handle reads like a sent one');
  assert.equal(unknown.calls.filter(([k]) => k === 'generateLink').length, 0);
  const broken = adminFor({ rpcError: { message: 'down' } });
  assert.equal((await mod.requestPasswordResetEmail(broken, { email: 'priya_lifts' })).code, 'send_failed', 'a failed lookup is not "sent"');
});

test('H9: a refusal or a failed send says so: nobody waits for an email that never left', async () => {
  const bad = await loadReset();
  for (const email of ['', 'not an email', 'a@b', 42, 'x'.repeat(250) + '@example.com']) {
    const r = await bad.mod.requestPasswordResetEmail(adminFor(), { email });
    assert.equal(r.ok, false, String(email));
    assert.equal(r.status, 400);
    assert.equal(r.code, 'invalid_email');
  }
  const captcha = await loadReset({ captcha: false });
  const c = await captcha.mod.requestPasswordResetEmail(adminFor(), { email: 'priya@example.com' });
  assert.deepEqual([c.status, c.code], [400, 'captcha_failed']);
  const perEmail = await loadReset({ limits: { 'pwreset:email': false } });
  const pe = await perEmail.mod.requestPasswordResetEmail(adminFor(), { email: 'priya@example.com', ip: '203.0.113.9' });
  assert.deepEqual([pe.status, pe.code], [429, 'rate_limited']);
  assert.equal(perEmail.mail.length, 0);
  const perIp = await loadReset({ limits: { 'pwreset:ip': false } });
  assert.equal((await perIp.mod.requestPasswordResetEmail(adminFor(), { email: 'priya@example.com', ip: '203.0.113.9' })).code, 'rate_limited');
  const linkDown = await loadReset();
  const ld = await linkDown.mod.requestPasswordResetEmail(adminFor({ link: { data: null, error: { status: 500, message: 'boom' } } }), { email: 'priya@example.com' });
  assert.deepEqual([ld.status, ld.code], [503, 'send_failed']);
  const noHash = await loadReset();
  assert.equal((await noHash.mod.requestPasswordResetEmail(adminFor({ link: { data: { properties: {} }, error: null } }), { email: 'priya@example.com' })).code, 'send_failed');
  const mailDown = await loadReset({ sent: { ok: false, error: 'resend_500' } });
  const md = await mailDown.mod.requestPasswordResetEmail(adminFor(), { email: 'priya@example.com' });
  assert.deepEqual([md.status, md.code], [503, 'send_failed']);
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
    ]),
  });
  const res = await route.POST(new Request('https://shape.test/api/auth/session', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'capacitor://localhost' }, body: JSON.stringify({ access_token: 'a', refresh_token: 'r' }) }));
  assert.equal(res.status, 200);
  assert.equal(db.writes.length, 1, 'the account with no row has one now');
  assert.equal(db.writes[0][0].role, 'client');
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
