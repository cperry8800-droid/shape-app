// Nora helps fill in the app's sign-up and coach application (the Ask Nora plan, step 5):
// the labelled door on the paywall, sign-in and application, the screens' bridges, what the
// sheet tells her, and the card that fills the form. The server side is in nora-forms.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FORMS, CHOICES } from '../src/lib/ai/noraForms.mjs';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MAIN = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
const APPLY = read('mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx');
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const keysOf = (kind) => FORMS[kind].steps.flatMap((s) => s.fields.map((f) => f.key));

test('the app forms follow the app screens: every key one the screen sets, every choice one it offers', async () => {
  const login = between(MAIN, 'function BSLogin(', 'const submitAuth');
  const fills = login.match(/const fills = \{([^\n]*)\};/)[1];
  assert.deepEqual([...fills.matchAll(/(\w+):/g)].map((m) => m[1]).sort(), keysOf('app_signup').sort(), 'the sign-up bridge fills exactly the fields the server lists');
  assert.equal(FORMS.app_signup.steps.length, 2, 'identity, then credentials, as the create form files');
  for (const kind of ['app_apply_trainer', 'app_apply_nutritionist']) {
    for (const key of keysOf(kind)) assert.ok(new RegExp(`(set|toggle)\\('${key}'`).test(APPLY), `${kind}.${key} is a field the application sets`);
  }
  assert.ok(!keysOf('app_apply_trainer').includes('username'), 'the app\'s application has no username');
  for (const o of [...CHOICES.appTrainerSpecs, ...CHOICES.appNutriSpecs, ...CHOICES.trainerPopulations, ...CHOICES.nutriPopulations]) assert.ok(APPLY.includes(`'${o}'`), `"${o}" is offered on the app's application`);
  const config = await import(pathToFileURL(join(ROOT, 'mobile-app/src/config/providerApplications.js')).href);
  assert.deepEqual(CHOICES.years, config.PROVIDER_EXPERIENCE_OPTIONS);
  assert.ok(FORMS.app_apply_trainer.steps.find((s) => s.name === 'Specialty').fields[0].options.includes('Marathon'));
});

test('the paywall, sign-in and application get a labelled door; the tap loads the bundle her sheet lives in', () => {
  const shell = between(MAIN, '// ── Nora before there is an account', 'const askNora');
  assert.match(shell, /const paywallUp = \(stage === 'gate' \|\| \(stage === 'app' && !previewMode\)\) && !memberGateLoading && !memberAllowed;/);
  assert.match(shell, /const noraDoor = paywallUp \|\| stage === 'login' \|\| stage === 'apply';/);
  assert.match(shell, /if \(!noraDoor\) setNoraSheet\(false\);/, 'the sheet goes when the screen it was opened over does');
  assert.match(MAIN, /const askNora = \(\) => \{ loadClientBundle\(\)\.then\(\(\) => setNoraSheet\(true\)\)\.catch\(\(\) => \{\}\); \};/);
  assert.match(MAIN, /\{noraDoor && !noraSheet && <BSAskNoraDoor onAsk=\{askNora\} \/>\}/);
  assert.match(MAIN, /\{noraDoor && noraSheet && window\.BSNoraSheet \? <window\.BSNoraSheet onClose=\{\(\) => setNoraSheet\(false\)\} \/> : null\}/);
  assert.match(between(MAIN, 'function BSAskNoraDoor(', 'function BSWireHold('), /\{tr\('nora\.ask'\)\}/);
  assert.match(shell, /return window\.bsNoraOpen\(\{ page: noraWhere\[0\], label: noraWhere\[1\] \}\);/, 'she is told the screen, and the chip names it in their language');
});

test('the screens\' bridges: never the password, the phone sign-in, documents or any agreement box', () => {
  const login = between(MAIN, 'function BSLogin(', 'const submitAuth');
  assert.match(login, /const noraFormOn = isCreate && !isPhone && !verifyEmail;/);
  assert.match(login, /kind: 'app_signup'/);
  assert.doesNotMatch(between(login, 'const fills = {', '};'), /password|phone|otp/i);
  const apply = between(APPLY, '// Nora fills the application in with them', 'async function submit()');
  assert.match(apply, /const never = \['verify', 'tos', 'conduct', 'bgcheck', 'attest', 'resumeFile', 'credentialFile', 'insuranceFile'\];/);
  assert.match(apply, /const kind = isTrainer \? 'app_apply_trainer' : 'app_apply_nutritionist';/);
  assert.match(apply, /if \(submitted\) return undefined;/, 'a submitted application has no form to fill');
  for (const src of [login, apply]) assert.match(src, /return \(\) => \{ if \(window\.shapeNoraForm === bridge\) window\.shapeNoraForm = null; \};/);
});

test('the sheet tells her the open form, never its values; the card fills only its own form, on a tap', async () => {
  const { bsNoraContext, BSNoraFill } = await loadBroadsheet(['bsNoraContext', 'BSNoraFill']);
  const w = globalThis.window;
  const was = w.shapeNoraForm;
  try {
    w.shapeNoraForm = null;
    assert.equal(bsNoraContext(true).form, undefined);
    const filled = [];
    w.shapeNoraForm = { kind: 'app_signup', state: () => ({ kind: 'app_signup', step: 1, filled: ['fullName'], values: { email: 'x@y.z' } }), fill: (v) => { filled.push(v); return true; } };
    assert.deepEqual(bsNoraContext(true).form, { kind: 'app_signup', step: 1, filled: ['fullName'] });
    assert.equal(bsNoraContext(false).form, undefined, 'the chip off sends only the zone');
    const a = { type: 'fill', label: 'Fill these in', form: 'app_signup', fields: [{ key: 'fullName', label: 'Full name', value: 'Sam Lee' }], values: { fullName: 'Sam Lee' } };
    const card = drive(BSNoraFill, { a, t: THEME });
    assert.match(card.text, /Full name\s*Sam Lee/);
    assert.equal(filled.length, 0, 'nothing is filled before the tap');
    card.click('Fill these in');
    assert.deepEqual(filled, [{ fullName: 'Sam Lee' }]);
    assert.match(card.text, /Filled in ✓/);
    const other = drive(BSNoraFill, { a: { ...a, form: 'app_apply_trainer' }, t: THEME });
    other.click('Fill these in');
    assert.equal(filled.length, 1, 'a card for another form fills nothing here');
    assert.match(other.text, /Open the form these are for/);
    w.shapeNoraForm = { kind: 'app_signup', state: () => { throw new Error('boom'); } };
    assert.equal(bsNoraContext(true).form, undefined, 'a broken bridge never breaks the question');
  } finally { w.shapeNoraForm = was; }
});
