// Set a new password, for an account with two-factor sign-in and in the website's current look
// (owner, 2026-11-13, two screenshots of /reset-password: "Need to update to current design and also
// this error", the error being Supabase's "AAL2 session is required to update email or password when
// MFA is enabled.").
//
// The reset link's session is 'aal1'; Supabase saves no new password for an account with a verified
// factor until the session is 'aal2'. The page asks for the authenticator code with the password, and
// the action verifies it (mfa.challengeAndVerify) before updateUser, on the same client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as step from '../src/lib/password-reset-step.mjs';
import * as safeRedirect from '../src/lib/safe-redirect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the rule: the code is asked only of a session short of aal2 on an account with an authenticator', () => {
  assert.equal(step.resetNeedsCode({ currentLevel: 'aal1', verifiedFactors: 1 }), true, 'the reset link with an authenticator');
  assert.equal(step.resetNeedsCode({ currentLevel: null, verifiedFactors: 1 }), true, 'an unreadable token counts as no second factor');
  assert.equal(step.resetNeedsCode({ currentLevel: 'aal2', verifiedFactors: 1 }), false, 'a code verified a moment ago');
  assert.equal(step.resetNeedsCode({ currentLevel: 'aal1', verifiedFactors: 0 }), false, 'no authenticator: the password alone');
  assert.equal(step.resetNeedsCode(), false);
});

test('Supabase refusals read in Shape’s words, and the AAL2 refusal asks for the code', () => {
  const aal = step.resetPasswordError({ code: 'insufficient_aal', message: 'AAL2 session is required to update email or password when MFA is enabled.' });
  assert.equal(aal.needsCode, true);
  assert.doesNotMatch(aal.error, /AAL2|MFA/, 'the raw message the owner saw');
  assert.equal(step.resetPasswordError({ message: 'AAL2 session is required to update email or password when MFA is enabled.' }).needsCode, true, 'by its words when the code is missing');
  assert.match(step.resetPasswordError({ code: 'same_password', message: 'x' }).error, /password you have now/);
  assert.equal(step.resetPasswordError({ code: 'weak_password', message: 'Password should contain a digit.' }).error, 'Password should contain a digit.');
  assert.equal(step.resetPasswordError({ code: 'session_not_found' }).expired, true);
  assert.equal(step.resetPasswordError({ name: 'AuthSessionMissingError', message: 'Auth session missing!' }).expired, true);
  assert.equal(step.resetPasswordError({ message: 'Something else' }).error, 'Something else');
  assert.match(step.resetCodeError({ code: 'mfa_verification_failed' }), /did not match/);
  assert.match(step.resetCodeError({ code: 'mfa_challenge_expired' }), /expired/);
  assert.equal(step.cleanCode('123 456'), '123456');
  assert.equal(step.cleanCode('12345'), '');
});

// The real action, on a stand-in Supabase client that answers the way Auth does.
function fakeSupabase({ aal = 'aal1', factors = [], goodCode = '123456', updateError = null } = {}) {
  const calls = [];
  let level = aal;
  const client = {
    calls,
    auth: {
      async getUser() { return { data: { user: { id: 'u1', email: 'owner@example.com', factors } } }; },
      async getClaims() { return { data: { claims: { aal: level } }, error: null }; },
      mfa: {
        async challengeAndVerify({ factorId, code }) {
          calls.push(['challengeAndVerify', factorId, code]);
          if (code !== goodCode) return { data: null, error: { code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' } };
          level = 'aal2';
          return { data: { access_token: 'aal2-token' }, error: null };
        },
      },
      async updateUser({ password }) {
        calls.push(['updateUser', password, level]);
        if (updateError) return { data: null, error: updateError };
        if (factors.some((f) => f.status === 'verified') && level !== 'aal2') {
          return { data: null, error: { code: 'insufficient_aal', message: 'AAL2 session is required to update email or password when MFA is enabled.' } };
        }
        return { data: { user: {} }, error: null };
      },
    },
  };
  return client;
}

async function loadAction(client) {
  const redirects = [];
  const mod = await loadRealModule(join(ROOT, 'src/app/login/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/navigation', { redirect: (to) => { redirects.push(to); throw Object.assign(new Error('NEXT_REDIRECT'), { to }); } }],
      ['next/cache', { revalidatePath() {} }],
      ['next/headers', { headers: async () => new Headers() }],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({}) }],
      ['@/lib/password-reset', { requestPasswordResetEmail: async () => ({ ok: true }), requestIp: () => '' }],
      ['@/lib/safe-redirect.mjs', safeRedirect],
      ['@/lib/password-reset-step.mjs', step],
    ]),
  });
  return { updatePassword: mod.updatePassword, redirects };
}

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const TOTP = { id: 'f-totp', status: 'verified', factor_type: 'totp' };

test('two-factor account: the code is verified first, then the password saves on the aal2 session', async () => {
  const client = fakeSupabase({ factors: [TOTP] });
  const { updatePassword, redirects } = await loadAction(client);
  await assert.rejects(updatePassword(form({ password: 'new-pass-1', code: '123 456' })), /NEXT_REDIRECT/);
  assert.deepEqual(client.calls, [['challengeAndVerify', 'f-totp', '123456'], ['updateUser', 'new-pass-1', 'aal2']]);
  assert.deepEqual(redirects, ['/dashboard']);
});

test('two-factor account: no code, or a wrong one, saves nothing and asks for the code', async () => {
  const none = fakeSupabase({ factors: [TOTP] });
  const a = await loadAction(none);
  const noCode = await a.updatePassword(form({ password: 'new-pass-1' }));
  assert.equal(noCode.needsCode, true);
  assert.match(noCode.error, /6-digit code/);
  assert.deepEqual(none.calls, [], 'no request to Auth without a code');

  const wrong = fakeSupabase({ factors: [TOTP] });
  const b = await loadAction(wrong);
  const r = await b.updatePassword(form({ password: 'new-pass-1', code: '000000' }));
  assert.equal(r.needsCode, true);
  assert.match(r.error, /did not match/);
  assert.deepEqual(wrong.calls.map((c) => c[0]), ['challengeAndVerify'], 'the password is not sent after a refused code');
});

test('a verified code then a refused password says so and marks the code done', async () => {
  const client = fakeSupabase({ factors: [TOTP], updateError: { code: 'same_password', message: 'New password should be different from the old password.' } });
  const { updatePassword } = await loadAction(client);
  const r = await updatePassword(form({ password: 'same-old-1', code: '123456' }));
  assert.equal(r.codeDone, true, 'the field goes: the session is aal2 now');
  assert.match(r.error, /password you have now/);
});

test('no authenticator, or a session already at aal2: the password alone, no code asked', async () => {
  for (const client of [fakeSupabase({ factors: [] }), fakeSupabase({ factors: [TOTP], aal: 'aal2' })]) {
    const { updatePassword } = await loadAction(client);
    await assert.rejects(updatePassword(form({ password: 'new-pass-1' })), /NEXT_REDIRECT/);
    assert.deepEqual(client.calls.map((c) => c[0]), ['updateUser']);
  }
  // A verified factor that is not an authenticator app (Shape enrolls none): no code field to fill, and
  // Supabase's refusal says where to turn instead of asking for a code that would go nowhere.
  const phone = fakeSupabase({ factors: [{ id: 'p', status: 'verified', factor_type: 'phone' }] });
  const p = await loadAction(phone);
  const r = await p.updatePassword(form({ password: 'new-pass-1', code: '123456' }));
  assert.equal(r.error, step.RESET_OTHER_FACTOR);
  assert.equal(r.needsCode, undefined);
  assert.deepEqual(phone.calls.map((c) => c[0]), ['updateUser'], 'no TOTP challenge on a phone factor');
  const short = fakeSupabase();
  const { updatePassword } = await loadAction(short);
  assert.match((await updatePassword(form({ password: 'abc' }))).error, /6 characters/);
  assert.deepEqual(short.calls, []);
});

test('the page asks for the code from the session and the account, and the form sends it', () => {
  const page = read('src/app/reset-password/page.tsx');
  assert.match(page, /const askCode = resetNeedsCode\(\{ currentLevel, verifiedFactors \}\);/);
  assert.match(page, /f\.status === 'verified' && f\.factor_type === 'totp'/);
  assert.match(page, /<ResetPasswordForm askCode=\{askCode\} \/>/);
  const formSrc = read('src/app/reset-password/ResetPasswordForm.tsx');
  assert.match(formSrc, /const codeAsked = !!state\?\.needsCode \|\| \(askCode && !state\?\.codeDone\);/);
  // A server that asks for the code again undoes an earlier verified one, so the field never goes missing.
  assert.match(formSrc, /codeDone: result\.needsCode \? false : codeDone \|\| !!result\.codeDone/);
  assert.match(formSrc, /name="code"/);
  assert.match(formSrc, /autoComplete="one-time-code"/);
  // Chrome compiles a pattern with the v flag, where [0-9 -] is invalid (and the console says so).
  assert.doesNotMatch(formSrc, /pattern=/);
  // Held in state, so a refused code keeps the passwords (React resets an uncontrolled form).
  for (const f of ['password', 'confirm', 'code']) assert.match(formSrc, new RegExp(`value=\\{${f}\\}`));
});

test('the old static copy is gone, and its address lands on the one page', () => {
  assert.equal(existsSync(join(ROOT, 'public/reset-password.html')), false);
  assert.match(read('next.config.ts'), /\{ source: '\/reset-password\.html', destination: '\/reset-password', permanent: true \}/);
});

test('both password pages are drawn as the website’s Log in, with its faces self-hosted', () => {
  for (const p of ['src/app/reset-password/page.tsx', 'src/app/forgot-password/page.tsx']) {
    const src = read(p);
    assert.match(src, /<AuthScene back=\{\{ href: '\/login', label: '← Back to log in' \}\}>/, p);
    assert.match(src, /className=\{styles\.title\}/, p);
    assert.doesNotMatch(src, /rounded-xl border border-neutral-800/, `${p}: the old panel`);
  }
  for (const p of ['src/app/reset-password/ResetPasswordForm.tsx', 'src/app/forgot-password/ForgotPasswordForm.tsx']) {
    assert.doesNotMatch(read(p), /uppercase tracking-wider/, `${p}: the old uppercase labels`);
  }
  for (const p of ['src/components/Nav.tsx', 'src/components/Footer.tsx']) {
    assert.match(read(p), /'\/forgot-password', '\/reset-password'\]/, `${p}: the site bar over Log in's own`);
  }
  const scene = read('src/components/AuthScene.tsx');
  assert.match(scene, /url\('\/login%20page%201\.webp'\)/, 'Log in’s photograph');
  for (const font of ['anybody-latin-wdth-wght-normal.woff2', 'schibsted-grotesk-latin-wght-normal.woff2', 'jetbrains-mono-latin-wght-normal.woff2']) {
    assert.ok(scene.includes(`'../app/fonts/${font}'`), font);
    assert.ok(existsSync(join(ROOT, 'src/app/fonts', font)), font);
  }
  for (const ofl of ['OFL-Anybody.txt', 'OFL-SchibstedGrotesk.txt']) assert.ok(existsSync(join(ROOT, 'src/app/fonts', ofl)), ofl);
  assert.doesNotMatch(scene, /next\/font\/google/, 'the build fetched Google and failed with it (WORKLOG)');
});
