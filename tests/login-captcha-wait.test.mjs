// The app's sign-in waits for the human check instead of dropping the tap (owner, 2026-11-13, a
// screenshot of sign-in held on "Just a moment — confirming you're human…": "login not working").
//
// Before: a tap that came before Turnstile's token was answered with that line and dropped, and a
// check that failed or expired left no token and nothing that started a new one, so the line stayed
// for good. Now: the tap waits and the request goes when the token arrives; a check that fails, or
// gives no token in 20 seconds, says so, and the next tap starts a fresh check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsCaptchaStep, BS_CAPTCHA_WAIT_MS } from '../mobile-app/src/services/captchaGate.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MAIN = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
const TURNSTILE = read('mobile-app/src/services/turnstile.js');
const LOGIN = MAIN.slice(MAIN.indexOf('function BSLogin('), MAIN.indexOf('function BSWelcome('));
const LOCALES = ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'ru', 'uk', 'tr', 'vi', 'id', 'ha', 'pcm'];

test('the rule: go with a token or no check, wait for a running check, start a fresh one after a failure', () => {
  assert.equal(bsCaptchaStep({ captchaOn: false, token: '', failed: false }), 'go', 'no check configured: nothing to wait for');
  assert.equal(bsCaptchaStep({ captchaOn: false, token: '', failed: true }), 'go');
  assert.equal(bsCaptchaStep({ captchaOn: true, token: 'tok', failed: false }), 'go', 'the token is in');
  assert.equal(bsCaptchaStep({ captchaOn: true, token: 'tok', failed: true }), 'go', 'a late token after a failure still goes');
  assert.equal(bsCaptchaStep({ captchaOn: true, token: '', failed: false }), 'wait', 'a check still running: hold the request');
  assert.equal(bsCaptchaStep({ captchaOn: true, token: '', failed: true }), 'retry', 'a failed check: start a fresh one');
  assert.equal(BS_CAPTCHA_WAIT_MS, 20000);
});

test('every request that needs a token waits for it; none drops the tap', () => {
  assert.doesNotMatch(LOGIN, /if \(captchaOn && !captchaToken\) \{ setAuthError\(tr\('login\.err\.captcha'\)\); return; \}/, 'a request still drops the tap');
  const handler = (name, next) => LOGIN.slice(LOGIN.indexOf(`const ${name} = async`), LOGIN.indexOf(next));
  assert.match(handler('submitAuth', 'const advanceIdentity'), /if \(holdForCaptcha\('auth'\)\) return;/);
  assert.match(handler('sendPhoneCode', 'const verifyPhoneCode'), /if \(holdForCaptcha\('phone'\)\) return;/);
  assert.match(handler('forgotPassword', '// The held request goes'), /if \(holdForCaptcha\('forgot'\)\) return;/);
  // holdForCaptcha: the shared rule, a fresh check after a failure, the request held, the line said.
  const hold = LOGIN.slice(LOGIN.indexOf('const holdForCaptcha = (kind) => {'), LOGIN.indexOf('const isCreate = '));
  assert.match(hold, /const step = bsCaptchaStep\(\{ captchaOn, token: captchaToken, failed: captchaFailed \}\);/);
  assert.match(hold, /if \(step === 'go'\) return false;/);
  assert.match(hold, /if \(step === 'retry'\) \{ setCaptchaFailed\(false\); setCaptchaGen\(\(g\) => g \+ 1\); \}/);
  assert.match(hold, /setCaptchaWaiting\(kind\);\n\s+setAuthError\(tr\('login\.err\.captcha'\)\);\n\s+return true;/);
});

test('the widget hears failures, and a new generation renders a fresh one', () => {
  const effect = LOGIN.slice(LOGIN.indexOf('const [captchaWaiting, setCaptchaWaiting]'), LOGIN.indexOf('const resetCaptcha = '));
  assert.match(effect, /window\.ShapeTurnstile\.render\(el, \(tok\) => \{ setCaptchaToken\(tok\); if \(tok\) setCaptchaFailed\(false\); \}, \(\) => setCaptchaFailed\(true\)\)/);
  assert.match(effect, /\}, \[captchaSlot, captchaGen\]\);/, 'a retry does not render a fresh widget');
  // Codex P2 on #2734: a held request is dropped when the container, the method (Email, Phone) or the
  // mode (Sign in, Join) changes, so a late token never sends the old request with the new form's fields.
  assert.match(effect, /React\.useEffect\(\(\) => \{ setCaptchaWaiting\(null\); \}, \[captchaSlot, authMethod, mode\]\);/, 'a held request outlives a change of form');
  // The wrapper reports an error, an expiry and a script that never loaded.
  assert.match(TURNSTILE, /render\(el, onToken, onError\) \{/);
  assert.match(TURNSTILE, /const fail = \(code\) => \{ cb\(''\); try \{ if \(onError\) onError\(String\(code \|\| 'error'\)\); \} catch \(e\) \{\} \};/);
  assert.match(TURNSTILE, /'expired-callback': \(\) => fail\('expired'\),/);
  assert.match(TURNSTILE, /'error-callback': \(code\) => fail\(code\),/);
  assert.match(TURNSTILE, /\.catch\(\(e\) => \{ console\.warn\('\[shape\] turnstile render failed', e\); fail\('load'\); return null; \}\);/);
});

test('the held request goes when the token arrives; a failure or 20 seconds says so', () => {
  const go = LOGIN.slice(LOGIN.indexOf('// The held request goes the moment'), LOGIN.indexOf('// A held request whose check fails'));
  assert.match(go, /if \(!captchaWaiting \|\| !captchaToken \|\| busy\) return;/, 'it waits for the token, and for any request in flight');
  assert.match(go, /if \(kind === 'auth'\) submitAuth\(\);\n\s+else if \(kind === 'phone'\) sendPhoneCode\(\);\n\s+else if \(kind === 'forgot'\) forgotPassword\(\);/);
  assert.match(go, /\}, \[captchaWaiting, captchaToken, busy\]\);/);
  const fail = LOGIN.slice(LOGIN.indexOf('// A held request whose check fails'), LOGIN.indexOf('const continueWithApple'));
  assert.match(fail, /if \(captchaFailed\) \{ setCaptchaWaiting\(null\); setAuthError\(tr\('login\.err\.captchaFailed'\)\); return undefined; \}/);
  assert.match(fail, /const id = setTimeout\(\(\) => setCaptchaFailed\(true\), BS_CAPTCHA_WAIT_MS\);\n\s+return \(\) => clearTimeout\(id\);/);
  // Hooks: both effects run before BSLogin's early return for the verify screen.
  assert.ok(LOGIN.indexOf('// A held request whose check fails') < LOGIN.indexOf('if (verifyEmail) {'), 'an effect sits after an early return');
});

test('"the check did not finish" is in every locale, and tells you to tap again', () => {
  for (const loc of LOCALES) {
    const on = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/onboarding.json`));
    assert.ok(String(on['login.err.captchaFailed'] || '').trim(), `${loc}: login.err.captchaFailed`);
    assert.notEqual(on['login.err.captchaFailed'], on['login.err.captcha'], `${loc}: the failure reads as the wait`);
  }
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/onboarding.json'));
  assert.match(en['login.err.captchaFailed'], /Tap again/);
  assert.doesNotMatch(en['login.err.captchaFailed'], /'/, 'a straight apostrophe');
});
