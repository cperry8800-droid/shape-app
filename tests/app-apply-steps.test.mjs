// The coach application in seven short steps (owner, 2026-11-09: "Option A: short steps", with Nora
// offered as a second way through it): Role · You · Credentials · Documents · Specialty · Rates · Review.
// Mounted in jsdom from the shipping module, in English from the en catalog through the app's ICU:
//   · seven steps, a segmented bar and "Step N of 7";
//   · Continue refuses a step with a field at fault, says why under that field and focuses it;
//   · the draft is kept on the device without files or ticks, comes back on the next open, and goes once
//     the application is sent;
//   · Review marks a section that still needs something, and its Edit goes there;
//   · "Fill it in with Nora" opens her with the starter line; what her card fills says so;
//   · after the send, where it stands.
// The send itself, the route's refusals, the nutritionist fields and the files are driven in
// tests/provider-apply-forms.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.sessionStorage = W.sessionStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOM = require_('react-dom');
const ReactDOMClient = require_('react-dom/client');

const EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/onboarding.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const msg = EN[key.replace(/^onboarding:/, '')];
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#f5f0e6', PAPER2: '#ede6d6', INK: '#0f0e0c', INK70: 'rgba(15,14,12,0.7)', INK50: 'rgba(15,14,12,0.5)', inkRGB: '15,14,12', isLight: true, padX: 22 };
W.useBS = () => theme;
let auth = {};
W.ShapeAuth = { getCachedState: () => auth };
// The chrome's small ←, as the chrome draws it: a 44px button that calls its page's Back.
W.BSBackButton = ({ onClick, compact }) => React.createElement('button', { type: 'button', 'data-bs-back': '', 'data-bs-back-compact': compact ? '' : undefined, 'aria-label': 'Back', onClick }, '←');
W.BS_BACK_SLOT_TOP_CSS = '44px';

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'), {
  registry: new Map([['react', React], ['react-dom', ReactDOM]]),
});
const Screen = W.BSProviderApplicationScreen;

const act = (fn) => React.act(async () => { await fn(); });
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
const byText = (sel, re, within = document) => [...within.querySelectorAll(sel)].find((el) => re.test(el.textContent));
function typeInto(el, value) {
  const proto = el.tagName === 'SELECT' ? W.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : W.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new W.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
const pdf = (name) => new W.File([new Uint8Array(4)], name, { type: 'application/pdf' });

async function mount({ role = 'trainer', host = null } = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = ReactDOMClient.createRoot(el);
  const backs = [];
  await act(() => root.render(React.createElement(Screen, { initialRole: role, onBack: () => backs.push(1) })));
  const scope = () => (host || el);
  const q = (sel) => scope().querySelector(sel);
  const p = {
    el, backs,
    q,
    at: () => q('[data-provider-apply]').getAttribute('data-apply-step'),
    text: () => scope().textContent,
    field: (key) => q(`[data-apply-field="${key}"]`),
    input: (key) => q(`[data-apply-field="${key}"] input, [data-apply-field="${key}"] select, [data-apply-field="${key}"] textarea`),
    click: (node) => act(() => { assert.ok(node, 'no such control'); node.click(); }),
    next: () => p.click(q('[data-apply-continue]')),
    type: (key, value) => act(() => typeInto(p.input(key), value)),
    fill: (patch) => act(() => W.shapeNoraForm.fill(patch)),
    close: () => act(() => { root.unmount(); el.remove(); }),
  };
  return p;
}

test.beforeEach(() => { localStorage.clear(); sessionStorage.clear(); auth = {}; delete W.bsAskNora; });

test('seven short steps, a segmented bar and "Step N of 7", Back stepping back and out', async () => {
  const p = await mount();
  try {
    const bar = p.q('[data-apply-progress]');
    assert.equal(bar.getAttribute('aria-valuemax'), '7');
    assert.equal(bar.children.length, 7, 'seven segments');
    assert.equal(bar.querySelectorAll('[data-on]').length, 1);
    assert.match(p.q('[data-apply-kicker]').textContent, /^Step 1 of 7 · Trainer application$/);
    assert.equal(p.at(), 'role');
    // Every step in order, with what each one asks filled in.
    await p.next();
    assert.equal(p.at(), 'you');
    await p.type('firstName', 'Ada'); await p.type('lastName', 'Lovelace'); await p.type('email', 'ada@example.invalid'); await p.type('dob', '1990-04-02');
    await p.next();
    assert.equal(p.at(), 'credentials');
    await p.type('cert', 'NASM-CPT'); await p.type('years', '7-10 years');
    await p.click(byText('button', /credentials may be verified/, p.el));
    const seen = [];
    for (let i = 0; i < 3; i += 1) { await p.next(); seen.push(p.at()); }
    assert.deepEqual(seen, ['documents', 'specialty', 'rates']);
    await p.next();
    assert.equal(p.at(), 'review');
    assert.match(p.q('[data-apply-kicker]').textContent, /^Step 7 of 7/);
    assert.equal(p.q('[data-apply-progress]').querySelectorAll('[data-on]').length, 7);
    assert.match(p.q('[data-apply-continue]').textContent, /^Send application$/);
    // ← goes to the step before, and out from the first.
    await p.click(p.q('[data-bs-back]'));
    assert.equal(p.at(), 'rates');
    for (let i = 0; i < 5; i += 1) await p.click(p.q('[data-bs-back]'));
    assert.equal(p.at(), 'role');
    assert.equal(p.backs.length, 0);
    await p.click(p.q('[data-bs-back]'));
    assert.equal(p.backs.length, 1, 'the first step\'s ← leaves the application');
  } finally { await p.close(); }
});

test('the role can change on the first step, and a nutritionist says whether they are a dietitian', async () => {
  const p = await mount({ role: 'trainer' });
  try {
    assert.equal(W.shapeNoraForm.kind, 'app_apply_trainer');
    await p.click(byText('[role="radio"]', /^Nutritionist/, p.el));
    assert.match(p.q('[data-apply-kicker]').textContent, /Nutritionist application/);
    assert.equal(W.shapeNoraForm.kind, 'app_apply_nutritionist', 'Nora\'s form follows the role');
    await p.click(byText('[data-apply-field="nutritionType"] [role="radio"]', /Dietitian/, p.el));
    assert.match(p.q('[data-apply-kicker]').textContent, /Dietitian application \(RD\/RDN\)/);
    assert.match(p.text(), /Approved dietitians get the credentialed badge/);
  } finally { await p.close(); }
});

test('Continue refuses an empty You step, says why under each field, marks it and focuses the first', async () => {
  const p = await mount();
  try {
    await p.next();
    assert.equal(p.at(), 'you');
    await p.next();
    assert.equal(p.at(), 'you', 'not on to Credentials');
    for (const [key, msg] of [['firstName', 'Add your first name.'], ['lastName', 'Add your last name.'], ['email', 'Add your email.'], ['dob', 'Enter a valid date of birth — Shape is for adults 18 and over.']]) {
      const field = p.field(key);
      assert.equal(field.querySelector('[role="alert"]').textContent, msg, key);
      assert.equal(p.input(key).getAttribute('aria-invalid'), 'true', `${key} is marked`);
      assert.match(field.querySelector('[data-ap-box]').style.border, /1px solid/, `${key} has its red edge`);
    }
    assert.ok(document.activeElement === p.input('firstName'), 'the first field at fault takes the focus');
    assert.ok(!p.field('phone').querySelector('[role="alert"]'), 'an optional field is never at fault');
    // Typing in a field takes its message away.
    await p.type('firstName', 'Ada');
    assert.ok(!p.field('firstName').querySelector('[role="alert"]'), 'typing takes the message away');
    // 18+: a minor is refused here, and a bad address is said.
    await p.type('lastName', 'Lovelace'); await p.type('email', 'not-an-address');
    const minor = new Date(Date.now() - 10 * 365 * 864e5).toISOString().slice(0, 10);
    await p.type('dob', minor);
    await p.next();
    assert.equal(p.at(), 'you');
    assert.equal(p.field('email').querySelector('[role="alert"]').textContent, 'Check your email address.');
    assert.equal(p.field('dob').querySelector('[role="alert"]').textContent, 'You must be 18 or older to apply as a coach.');
    await p.type('email', 'ada@example.invalid'); await p.type('dob', '1990-04-02');
    await p.next();
    assert.equal(p.at(), 'credentials');
    // Credentials: the credential, the years and the verification box.
    await p.next();
    assert.equal(p.at(), 'credentials');
    assert.equal(p.field('cert').querySelector('[role="alert"]').textContent, 'Add your primary credential.');
    assert.equal(p.field('years').querySelector('[role="alert"]').textContent, 'Choose your years of professional experience.');
    assert.equal(p.field('verify').querySelector('[role="alert"]').textContent, 'Tick this box to continue.');
    assert.ok(document.activeElement === p.input('cert'), 'the credential takes the focus');
  } finally { await p.close(); }
});

test('the draft round-trips through this device without files or ticks, and Start over clears it', async () => {
  auth = { user: { id: 'u-77' } };
  const KEY = 'shape.applyDraft.u-77';
  const p = await mount({ role: 'nutritionist' });
  try {
    await p.next();
    await p.type('firstName', 'Ada'); await p.type('lastName', 'Lovelace'); await p.type('email', 'ada@example.invalid'); await p.type('dob', '1990-04-02');
    await p.next();
    await p.type('cert', 'RD 123'); await p.type('years', '7-10 years');
    await p.click(byText('button', /credentials may be verified/, p.el));
    await p.next();
    assert.equal(p.at(), 'documents');
    assert.match(p.text(), /Files are not saved with your draft/);
    const picker = p.q('input[type=file][aria-label="Add Resume / CV"]');
    Object.defineProperty(picker, 'files', { value: [pdf('cv.pdf')], configurable: true });
    await act(() => picker.dispatchEvent(new W.Event('change', { bubbles: true })));
    assert.match(p.text(), /cv\.pdf/);
    await wait(650);
    const saved = JSON.parse(localStorage.getItem(KEY));
    assert.equal(saved.role, 'nutritionist');
    assert.equal(saved.step, 3);
    assert.deepEqual([saved.values.firstName, saved.values.email, saved.values.cert, saved.values.years], ['Ada', 'ada@example.invalid', 'RD 123', '7-10 years']);
    for (const tick of ['verify', 'tos', 'conduct', 'bgcheck', 'attest']) assert.equal(tick in saved.values, false, `${tick} is never kept`);
    assert.doesNotMatch(JSON.stringify(saved), /cv\.pdf/, 'no file in the draft');
    assert.equal(localStorage.getItem('shape.applyDraft.anon'), null, 'kept under the signed-in account');
  } finally { await p.close(); }

  // The next open: the draft comes back where they were, without the tick or the file.
  const q = await mount({ role: 'trainer' });
  try {
    assert.match(q.q('[data-apply-restored]').textContent, /Draft restored\s*·\s*Start over/);
    assert.equal(q.at(), 'documents');
    assert.match(q.q('[data-apply-kicker]').textContent, /Nutritionist application/, 'the role they chose comes back with it');
    assert.doesNotMatch(q.text(), /cv\.pdf/);
    await q.click(q.q('[data-bs-back]'));
    assert.equal(q.input('cert').value, 'RD 123');
    assert.equal(q.field('verify').querySelector('[role="checkbox"]').getAttribute('aria-checked'), 'false', 'the tick is theirs to give again');
    await q.click(q.q('[data-bs-back]'));
    assert.equal(q.input('firstName').value, 'Ada');
  } finally { await q.close(); }

  const r = await mount({ role: 'trainer' });
  try {
    await r.click(byText('button', /^Start over$/, r.el));
    assert.equal(localStorage.getItem(KEY), null, 'Start over forgets the draft');
    assert.equal(r.at(), 'role');
    assert.ok(!r.q('[data-apply-restored]'), 'no restored line after Start over');
    assert.match(r.q('[data-apply-kicker]').textContent, /Trainer application/);
  } finally { await r.close(); }

  // "Save and finish later" keeps it at once and leaves.
  auth = { user: { id: 'u-77' } };
  const s = await mount();
  try {
    await s.next();
    await s.type('firstName', 'Grace');
    await s.click(s.q('[data-apply-save-later]'));
    assert.equal(s.backs.length, 1);
    assert.equal(JSON.parse(localStorage.getItem(KEY)).values.firstName, 'Grace', 'under their account');
  } finally { await s.close(); }

  // A draft past 30 days is dropped, not restored.
  localStorage.setItem(KEY, JSON.stringify({ v: 1, role: 'trainer', step: 2, values: { firstName: 'Old' }, at: Date.now() - 31 * 86400000 }));
  const o = await mount();
  try {
    assert.equal(o.at(), 'role');
    assert.ok(!o.q('[data-apply-restored]'), 'an expired draft is no draft');
    assert.equal(localStorage.getItem(KEY), null, 'and it is removed');
  } finally { await o.close(); }
  auth = {};

  // A draft in a shape the screen does not hold (an old build's, a hand-edited one) keeps only what fits.
  sessionStorage.setItem('shape.applyDraft.anon', JSON.stringify({ role: 'admin', step: 99, at: Date.now(), values: { email: 'a@b.co', firstName: { x: 1 }, secondary: 'Mobility', populations: ['Rehab', 7], licenses: 'NY', tos: true, password: 'x' } }));
  const u = await mount();
  try {
    assert.equal(u.at(), 'review', 'a step past the last is the last');
    assert.match(u.q('[data-apply-kicker]').textContent, /Trainer application/, 'an unknown role is the one they came for');
    for (const re of [/code of conduct/]) assert.equal(byText('[role="checkbox"]', re, u.el).getAttribute('aria-checked'), 'false', 'a tick never comes back');
    await u.click(u.q('[data-review-edit="you"]'));
    assert.equal(u.input('email').value, 'a@b.co');
    assert.equal(u.input('firstName').value, '');
    await u.click(u.q('[data-bs-back]'));
    await u.next();
    assert.equal(u.at(), 'review', 'Continue from a step opened by Edit goes back to Review');
    await u.click(u.q('[data-review-edit="specialty"]'));
    assert.equal(u.field('secondary').querySelectorAll('[aria-pressed="true"]').length, 0, 'a list that is not a list is left out');
    assert.equal(u.field('populations').querySelectorAll('[aria-pressed="true"]').length, 1);
  } finally { await u.close(); }

  // Storage that throws is no draft, and the screen still opens.
  const get = W.Storage.prototype.getItem;
  W.Storage.prototype.getItem = () => { throw new Error('blocked'); };
  try {
    const t = await mount();
    try { assert.equal(t.at(), 'role'); assert.ok(!t.q('[data-apply-restored]'), 'no draft'); } finally { await t.close(); }
  } finally { W.Storage.prototype.getItem = get; }
});

test('Review marks a section that still needs something, and its Edit goes there and back', async () => {
  const p = await mount();
  try {
    await p.fill({ firstName: 'Ada' });
    assert.match(p.q('[data-apply-continue]').textContent, /^Review what Nora filled$/);
    await p.next();
    assert.equal(p.at(), 'review');
    const row = (k) => p.q(`[data-review-row="${k}"]`);
    assert.match(row('you').querySelector('[data-review-flag]').textContent, /^3 missing$/);
    assert.match(row('credentials').querySelector('[data-review-flag]').textContent, /^3 missing$/);
    assert.ok(!row('role').querySelector('[data-review-flag]'), 'the role is always set');
    assert.ok(row('role').hasAttribute('data-review-ok'));
    assert.match(row('documents').textContent, /No files added/);
    assert.ok(!row('documents').querySelector('[data-review-flag]'), 'documents are not required');
    await p.click(p.q('[data-review-edit="you"]'));
    assert.equal(p.at(), 'you');
    assert.match(p.q('[data-apply-continue]').textContent, /^Back to review$/);
    await p.type('lastName', 'Lovelace'); await p.type('email', 'ada@example.invalid'); await p.type('dob', '1990-04-02');
    await p.next();
    assert.equal(p.at(), 'review');
    assert.ok(!row('you').querySelector('[data-review-flag]'), 'and it is ticked off');
    assert.match(row('you').textContent, /Ada Lovelace/);
    // Send checks every step again and goes to the first that fails.
    for (const re of [/I agree to the/, /code of conduct/, /I consent to a required background check/]) await p.click(byText('button', re, p.el));
    W.ShapeApplications = { submitProviderApplication: async () => { throw new Error('should not send'); } };
    await p.next();
    assert.equal(p.at(), 'credentials');
    assert.equal(p.field('cert').querySelector('[role="alert"]').textContent, 'Add your primary credential.');
  } finally { await p.close(); delete W.ShapeApplications; }
});

test('"Fill it in with Nora" opens her with the starter line; where her sheet does not open, a line says so', async () => {
  const asked = [];
  W.bsAskNora = (text) => asked.push(text);
  const p = await mount();
  try {
    assert.match(p.q('[data-apply-nora]').textContent, /Prefer to talk it through\?\s*Nora can ask you the questions and fill this in\. You check everything before it is sent\./);
    await p.click(p.q('[data-apply-ask-nora]'));
    assert.deepEqual(asked, ['Help me fill in my trainer application. Ask me one question at a time.']);
    await p.click(byText('[role="radio"]', /^Nutritionist/, p.el));
    await p.click(p.q('[data-apply-ask-nora]'));
    assert.equal(asked[1], 'Help me fill in my nutritionist application. Ask me one question at a time.');
    // Her bundle may still be loading on the sign-in route, so nothing is said at once.
    await wait(500);
    assert.doesNotMatch(p.text(), /Nora couldn’t open/);
    // Her sheet did not open (nothing here draws it): after the wait the line says so. There is no door to
    // press any more (owner, 2026-11-11: the top-right Nora box went).
    await wait(3700);
    assert.match(p.text(), /Nora couldn’t open just now\. Try again in a moment\./);
    assert.doesNotMatch(p.text(), /at the top of the screen/);
  } finally { await p.close(); }

  // Her sheet opening in time says nothing.
  const sheet = document.createElement('div');
  sheet.setAttribute('data-nora-sheet', '');
  document.body.appendChild(sheet);
  const q = await mount();
  try {
    await q.click(q.q('[data-apply-ask-nora]'));
    await wait(4200);
    assert.doesNotMatch(q.text(), /Nora couldn’t open/);
  } finally { await q.close(); sheet.remove(); }

  // And with no client module at all (the sign-in route), the event the pre-account shell listens for.
  delete W.bsAskNora;
  let heard = 0;
  const listen = () => { heard += 1; };
  W.addEventListener('shape:openNora', listen);
  const r = await mount();
  try {
    await r.click(r.q('[data-apply-ask-nora]'));
    assert.equal(heard, 1);
  } finally { W.removeEventListener('shape:openNora', listen); await r.close(); }
});

test('Nora\'s card fills listed fields only, the screen says so on each step, and she is told the step', async () => {
  const p = await mount({ role: 'nutritionist' });
  try {
    const bridge = W.shapeNoraForm;
    assert.equal(bridge.kind, 'app_apply_nutritionist');
    assert.deepEqual(bridge.state().stepName, 'role');
    assert.equal(bridge.state().step, 0);
    // Never a document, an agreement, an attestation, a license row or the verification box.
    for (const k of ['tos', 'conduct', 'bgcheck', 'verify', 'attest', 'licenses', 'docs']) assert.equal(bridge.fill({ [k]: true }), false, k);
    await p.fill({ firstName: 'Ada', years: '7-10 years', primary: 'Gut health', tos: true });
    const st = bridge.state();
    assert.ok(st.filled.includes('firstName') && st.filled.includes('years'));
    assert.equal(st.filled.includes('tos'), false);
    assert.ok(!p.q('[data-apply-nora-filled]'), 'the first step holds none of her values');
    await p.next();
    assert.equal(p.at(), 'review');
    assert.equal(bridge.state().stepName, 'review');
    assert.equal(bridge.state().step, 3, 'her list has four steps; Review sits in its last');
    assert.match(p.q('[data-review-row="you"]').textContent, /Filled by Nora · check it/);
    assert.doesNotMatch(p.q('[data-review-row="rates"]').textContent, /Filled by Nora/);
    assert.equal(p.q('[data-review-row="specialty"]').textContent.includes('Gut health'), true);
    await p.click(p.q('[data-review-edit="you"]'));
    assert.match(p.q('[data-apply-nora-filled]').textContent, /Filled by Nora · check it/);
    assert.equal(bridge.state().step, 0);
    assert.ok(!p.field('tos'), 'the agreements are on Review only');
  } finally { await p.close(); }
});

test('a successful send shows where it stands and clears the draft; Done leaves', async () => {
  const p = await mount();
  try {
    await p.fill({ firstName: 'Maya', lastName: 'Torres', email: 'maya@example.invalid', dob: '1991-06-14', cert: 'NASM-CPT', years: '7-10 years' });
    await p.next();
    await p.click(p.q('[data-review-edit="credentials"]'));
    await p.click(byText('button', /credentials may be verified/, p.el));
    await p.next();
    for (const re of [/I agree to the/, /code of conduct/, /I consent to a required background check/]) await p.click(byText('button', re, p.el));
    await wait(650);
    assert.ok(sessionStorage.getItem('shape.applyDraft.anon'), 'a draft while they work, for this session');
    const sent = [];
    W.ShapeApplications = { submitProviderApplication: async (arg) => { sent.push(arg); return { stored: 'api', duplicate: false, data: { id: 'a-1' } }; } };
    await p.next();
    await act(() => new Promise((r) => setTimeout(r, 0)));
    assert.equal(sent.length, 1);
    assert.equal(p.at(), 'sent');
    assert.match(p.text(), /Application sent\./);
    assert.match(p.text(), /Thanks, Maya\. Here is where it stands\./);
    const stages = [...p.el.querySelectorAll('[data-apply-stage]')];
    assert.deepEqual(stages.map((s) => s.getAttribute('data-apply-stage')), ['submitted', 'review', 'bg', 'decision']);
    // Submitted is where it stands (Codex on #2667): the row is pending, which the server and Settings call
    // Submitted until a reviewer opens it; In review is the next step, never claimed.
    assert.equal(stages[0].getAttribute('aria-current'), 'step', 'Submitted is where it stands');
    assert.equal(stages[1].getAttribute('aria-current'), null, 'In review is not claimed');
    assert.match(stages[1].textContent, /Next, a Shape reviewer reads your credentials\./);
    assert.match(stages[0].textContent, /Submitted/);
    assert.match(stages[0].textContent, new RegExp(new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date())), 'with today\'s date');
    assert.match(p.text(), /Usually 2–3 business days\. We'll email you, and you can see where it stands in Settings, under Coach on Shape\./);
    assert.equal(sessionStorage.getItem('shape.applyDraft.anon'), null, 'the draft goes once it is sent');
    await wait(650);
    assert.equal(sessionStorage.getItem('shape.applyDraft.anon'), null, 'and is not written again');
    assert.equal(W.shapeNoraForm, null, 'a sent application has no form for Nora');
    await p.click(byText('button', /^Done$/, p.el));
    assert.equal(p.backs.length, 1);
    const asked = [];
    W.bsAskNora = (t) => asked.push(t);
    await p.click(byText('button', /Ask Nora a question/, p.el));
    assert.deepEqual(asked, ['']);
  } finally { await p.close(); delete W.ShapeApplications; }

  // An application already with us says so.
  const q = await mount();
  try {
    await q.fill({ firstName: 'Maya', lastName: 'Torres', email: 'maya@example.invalid', dob: '1991-06-14', cert: 'NASM-CPT', years: '7-10 years' });
    await q.next();
    await q.click(q.q('[data-review-edit="credentials"]'));
    await q.click(byText('button', /credentials may be verified/, q.el));
    await q.next();
    for (const re of [/I agree to the/, /code of conduct/, /I consent to a required background check/]) await q.click(byText('button', re, q.el));
    W.ShapeApplications = { submitProviderApplication: async () => ({ stored: 'api', duplicate: true, data: { id: 'a-1' } }) };
    await q.next();
    await act(() => new Promise((r) => setTimeout(r, 0)));
    assert.match(q.text(), /This application was already with us\./);
  } finally { await q.close(); delete W.ShapeApplications; }
});

test('in the member app it covers the whole phone surface, tab bar included; on the sign-in route it stays in place', async () => {
  const surface = document.createElement('div');
  surface.id = 'bs-phone-surface';
  const nav = document.createElement('nav');
  nav.setAttribute('data-bs-tabbar', '');
  surface.appendChild(nav);
  document.body.appendChild(surface);
  auth = { user: { id: 'u-5' } };
  const p = await mount({ host: surface });
  try {
    const screen = surface.querySelector('[data-provider-apply]');
    assert.ok(screen, 'portalled into #bs-phone-surface');
    assert.ok(!p.el.querySelector('[data-provider-apply]'), 'not drawn in place');
    assert.equal(screen.style.position, 'absolute');
    assert.equal(screen.style.zIndex, '220', 'above the tab bar (55), under Nora\'s sheet (240)');
    assert.ok(surface.querySelector('[data-apply-save-later]').closest('[data-provider-apply]'), 'Save and finish later in the head');
    assert.match(screen.textContent, /Next: You/);
  } finally { await p.close(); surface.remove(); }
  const q = await mount();
  try {
    const screen = q.el.querySelector('[data-provider-apply]');
    assert.ok(screen, 'drawn where Main puts it');
    assert.equal(screen.style.zIndex, '', 'under Main\'s own Ask Nora door');
  } finally { await q.close(); }
});

test('the option values stay English for the route; only their labels are translated', async () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'), 'utf8');
  // Every label the screen asks for exists in all thirteen catalogs (the catalog gate holds the rest).
  const keys = [...src.matchAll(/tr\('onboarding:(apply\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length > 200, `only ${keys.length} keys found`);
  for (const loc of ['de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/onboarding.json`), 'utf8'));
    assert.deepEqual(keys.filter((k) => !(k in cat)), [], loc);
  }
  // In German, the labels change and the values do not.
  const de = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/onboarding.json'), 'utf8'));
  const was = W.ShapeI18n;
  W.ShapeI18n = { t: (key, opts = {}) => { const m = de[key.replace(/^onboarding:/, '')]; return m == null ? undefined : new IntlMessageFormat(m, 'de').format(opts); }, intlLocale: () => 'de' };
  const p = await mount();
  try {
    assert.match(p.text(), /Was coachst du\?/);
    await p.fill({ firstName: 'Ada' });
    await p.next();
    await p.click(p.q('[data-review-edit="credentials"]'));
    const years = p.input('years');
    assert.deepEqual([...years.options].slice(1).map((o) => [o.value, o.textContent]).slice(0, 2), [['Less than 1 year', 'Weniger als 1 Jahr'], ['1-2 years', '1–2 Jahre']]);
    const yes = byText('[data-apply-field="insurance"] [role="radio"]', /^Ja$/, p.el);
    assert.ok(yes, 'the label is German');
    await p.click(byText('[data-apply-field="insurance"] [role="radio"]', /^In Arbeit$/, p.el));
    assert.equal(byText('[data-apply-field="insurance"] [role="radio"]', /^In Arbeit$/, p.el).getAttribute('aria-checked'), 'true');
    await wait(650);
    assert.equal(JSON.parse(sessionStorage.getItem('shape.applyDraft.anon')).values.insurance, 'In progress', 'the English value is what is kept and sent');
  } finally { await p.close(); W.ShapeI18n = was; }
});

test('a signed-out draft is this session\'s only, never a device-wide one the next person opens (Codex on #2667)', async () => {
  // An earlier build's device-wide signed-out draft: cleared on open, never restored.
  localStorage.setItem('shape.applyDraft.anon', JSON.stringify({ v: 1, role: 'trainer', step: 1, at: Date.now(), values: { firstName: 'Previous', email: 'prev@example.invalid', dob: '1980-01-01' } }));
  const p = await mount();
  try {
    assert.equal(p.at(), 'role');
    assert.ok(!p.q('[data-apply-restored]'), 'the previous applicant\'s draft is not restored');
    assert.equal(localStorage.getItem('shape.applyDraft.anon'), null, 'and it is cleared from the device');
    assert.ok(!p.q('[data-apply-save-later]'), 'no "finish later" promise signed out');
    await p.next();
    await p.type('firstName', 'Grace');
    await wait(650);
    assert.equal(JSON.parse(sessionStorage.getItem('shape.applyDraft.anon')).values.firstName, 'Grace', 'kept for this session');
    assert.equal(localStorage.getItem('shape.applyDraft.anon'), null, 'never on the device');
  } finally { await p.close(); }
  // Within the session, going back and returning restores it.
  const q = await mount();
  try { assert.ok(q.q('[data-apply-restored]')); } finally { await q.close(); }
});

test('a duplicate send shows the application already with us at its own stage and day, or no tracker (Codex on #2667)', async () => {
  const send = async (status) => {
    const p = await mount();
    await p.fill({ firstName: 'Maya', lastName: 'Torres', email: 'maya@example.invalid', dob: '1991-06-14', cert: 'NASM-CPT', years: '7-10 years' });
    await p.next();
    await p.click(p.q('[data-review-edit="credentials"]'));
    await p.click(byText('button', /credentials may be verified/, p.el));
    await p.next();
    for (const re of [/I agree to the/, /code of conduct/, /I consent to a required background check/]) await p.click(byText('button', re, p.el));
    W.ShapeApplications = { submitProviderApplication: async () => ({ stored: 'api', duplicate: true, data: { id: 'a-0' } }), myStatus: async () => status };
    await p.next();
    await act(() => new Promise((r) => setTimeout(r, 0)));
    return p;
  };
  // In review already: Submitted done on its own day, In review where it stands.
  const p = await send({ role: 'trainer', stage: 'in_review', submittedAt: '2026-11-01T10:00:00Z' });
  try {
    assert.equal(p.at(), 'sent');
    assert.match(p.text(), /This application was already with us\./);
    const stages = [...p.el.querySelectorAll('[data-apply-stage]')];
    assert.equal(stages[0].getAttribute('aria-current'), null);
    assert.match(stages[0].textContent, new RegExp(new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date('2026-11-01T10:00:00Z'))), 'the day it was sent, not today');
    assert.match(stages[0].textContent, /We have your application\./, 'a duplicate\'s files were not taken');
    assert.equal(stages[1].getAttribute('aria-current'), 'step', 'In review is where it stands');
    assert.match(stages[1].textContent, /A Shape reviewer is reading your credentials\./);
  } finally { await p.close(); delete W.ShapeApplications; }
  // Its stage unread: no tracker rather than a wrong one.
  const q = await send(null);
  try {
    assert.equal(q.at(), 'sent');
    assert.ok(!q.el.querySelector('[data-apply-tracker]'), 'no tracker for an application whose stage was not read');
    assert.match(q.text(), /see where it stands in Settings/);
  } finally { await q.close(); delete W.ShapeApplications; }
});
