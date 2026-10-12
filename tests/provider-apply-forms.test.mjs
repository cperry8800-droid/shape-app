// The coach application FORMS, mounted and driven (2026-10-12). The route they post to is
// driven in tests/provider-apply-submit.test.mjs; these are the halves a person touches.
//
//   website (public/newdesign/signup.jsx), mounted in jsdom the way tests/nora-forms.test.mjs
//   mounts it, submitting into a recorded fetch:
//     · an untouched form sends what its selects show (the experience select showed 7-10 years
//       and sent "", which the years check refused)
//     · the Specialty and Availability answers, and the agreements, reach the request
//     · the human-check token reaches the request
//     · files over 4 MB in total, or the platform's plain-text 413, read as the size sentence
//
//   app (mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx), mounted in jsdom:
//     · only the route's own yes shows "Submitted"; a failed send keeps the form and says so
//     · the nutritionist fields the website collects are there (professional type, CDR number,
//       state licenses, insurance)
//
//   the legacy /mobile pages (public/mobile/signup.jsx), by source: the years default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const require = createRequire(join(ROOT, 'package.json'));
const { JSDOM } = require('jsdom');
const React = require('react');
// ⚠ react-dom decides which DOM events it can use when it is first loaded, from the `window`
// it sees then; loaded with none, it never listens for `input`, and typing changes nothing.
// So it is loaded on the first mount, once a jsdom window is in place.
let ReactDOMClient = null;
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
const config = await import(pathToFileURL(join(ROOT, 'mobile-app/src/config/providerApplications.js')).href);
const MB = 1024 * 1024;

function useDom(url) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ReactDOMClient ??= require('react-dom/client');
  const restore = () => {
    dom.window.close();
    Object.assign(globalThis, { window: before.window, document: before.document, IS_REACT_ACT_ENVIRONMENT: before.act, fetch: before.fetch });
  };
  return { dom, w: dom.window, doc: dom.window.document, restore };
}
const act = (fn) => React.act(async () => { await fn(); });
const byText = (doc, sel, re) => [...doc.querySelectorAll(sel)].find((el) => re.test(el.textContent));
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Type into a React-controlled field the way a browser does: the native setter, then the event React listens for. */
function typeInto(w, el, value) {
  const proto = el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function attachFile(w, input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
}

// ── The website ───────────────────────────────────────────────────────────────────────────

async function mountWebsite(role, { turnstile = null, respond = () => new Response(JSON.stringify({ ok: true, id: 'app-1' }), { status: 200 }) } = {}) {
  const env = useDom(`https://shape.test/newdesign/Signup.html?role=${role}`);
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, form: init.body }); return respond(); };
  env.w.ShapeAgeDerive = { isMinorFromDob: ageDerive.isMinorFromDob };
  if (turnstile) env.w.ShapeTurnstile = turnstile;
  const code = babel.transformSync(read('public/newdesign/signup.jsx'), { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  let root = null;
  const ReactDOM = { createRoot: (el) => (root = ReactDOMClient.createRoot(el)) };
  await act(() => {
    new Function('React', 'ReactDOM', 'window', 'document', 'Logo', 'serif', 'sans', 'INK', 'PAPER', 'TEAL', code)(
      React, ReactDOM, env.w, env.doc, () => null, 'serif', 'sans', '#fff', '#000', '#0ac5a8',
    );
  });
  const click = (el) => act(() => el.click());
  const next = () => click(byText(env.doc, 'button', /^Continue$/));
  const tickBox = (re) => click(byText(env.doc, 'label', re));
  return {
    ...env, sent,
    fill: (patch) => act(() => env.w.shapeNoraForm.fill(patch)),
    next, tickBox, click,
    submit: async () => { await click(byText(env.doc, 'button', /Submit application|Submitting/)); await act(tick); },
    async unmount() { try { await act(() => root.unmount()); } finally { env.restore(); } },
  };
}

/** Walks a trainer application through every step, touching only the text fields and the boxes. */
async function walkTrainer(p, extra = {}) {
  await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'NASM-CPT', ...extra });
  await p.next();
  await p.tickBox(/credentials may be verified/);
  await p.next();
  await p.next();
  await p.tickBox(/I agree to the/);
  await p.tickBox(/code of conduct/);
  await p.tickBox(/I consent to a required background check/);
}

test('website: an untouched application sends what its selects show, plus the answers and the agreements', async () => {
  const p = await mountWebsite('trainer');
  try {
    await walkTrainer(p, { secondary: ['Mobility'], populations: ['Athletes'], style: 'Warm, data-driven', maxClients: '20' });
    await p.submit();
    assert.equal(p.sent.length, 1, `submitted (error: ${p.doc.body.textContent.slice(-300)})`);
    const form = p.sent[0].form;
    assert.equal(form.get('yearsExperience'), '7-10 years', 'the shown experience is sent, not ""');
    assert.equal(form.get('specialty'), 'Strength & Powerlifting', 'the shown primary specialty is sent');
    const d = JSON.parse(form.get('details'));
    assert.deepEqual(
      [d.insurance_status, d.response_time, d.accepting_new_clients, d.one_on_one, d.intro_offer],
      ['Yes', 'Within 24 hours', 'Yes', 'Yes', '15-minute free intro'],
      'every select sends the value it shows',
    );
    assert.deepEqual(d.secondary_specialties, ['Mobility']);
    assert.deepEqual(d.populations, ['Athletes']);
    assert.equal(d.coaching_style, 'Warm, data-driven');
    assert.equal(d.max_clients, '20');
    assert.deepEqual(d.agreements, { credential_verification: true, terms: true, code_of_conduct: true, background_check: true });
    assert.equal(d.certification, 'NASM-CPT');
    assert.match(p.doc.body.textContent, /Application submitted\./);
  } finally { await p.unmount(); }
});

test('website: a choice the person makes is what is sent', async () => {
  const p = await mountWebsite('trainer');
  try {
    await walkTrainer(p, { years: '15+ years', insurance: 'In progress', response: 'Within 12 hours' });
    await p.submit();
    const form = p.sent[0].form;
    assert.equal(form.get('yearsExperience'), '15+ years');
    const d = JSON.parse(form.get('details'));
    assert.equal(d.insurance_status, 'In progress');
    assert.equal(d.response_time, 'Within 12 hours');
  } finally { await p.unmount(); }
});

test('website: the coach application carries the human-check token, and waits for one', async () => {
  let give = null;
  const turnstile = { enabled: () => true, render: (el, cb) => { give = cb; return Promise.resolve(7); }, reset: () => {}, remove: () => {} };
  const p = await mountWebsite('trainer', { turnstile });
  try {
    await walkTrainer(p);
    await act(tick);
    await p.submit();
    assert.equal(p.sent.length, 0, 'no request before the check answers');
    assert.match(p.doc.body.textContent, /confirming you're human/);
    await act(() => give('web-token'));
    await p.submit();
    assert.equal(p.sent.length, 1);
    assert.equal(p.sent[0].form.get('turnstileToken'), 'web-token');
  } finally { await p.unmount(); }
});

test('website: files over 4 MB in total are stopped before sending, and the platform\'s 413 reads the same way', async () => {
  const attachAndSubmit = async (p, sizes) => {
    await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02' });
    await p.next();
    const inputs = [...p.doc.querySelectorAll('input[type=file]')];
    assert.equal(inputs.length, 3);
    for (const [i, mb] of sizes.entries()) await act(() => attachFile(p.w, inputs[i], new File([new Uint8Array(Math.round(mb * MB))], `doc${i}.pdf`, { type: 'application/pdf' })));
    assert.match(p.doc.body.textContent, /up to 4 MB in total/, 'the form says the real limit');
    await p.tickBox(/credentials may be verified/);
    await p.next(); await p.next();
    await p.tickBox(/I agree to the/); await p.tickBox(/code of conduct/); await p.tickBox(/I consent to a required background check/);
    await p.submit();
  };
  const tooBig = await mountWebsite('trainer');
  try {
    await attachAndSubmit(tooBig, [3, 2]);
    assert.equal(tooBig.sent.length, 0, 'nothing is sent');
    assert.match(tooBig.doc.body.textContent, /Your files add up to 5\.0 MB; the limit for one application is 4 MB in total\. Attach a smaller scan or fewer files\./);
  } finally { await tooBig.unmount(); }
  // Under the line on this side and refused by the platform anyway: its plain-text 413 is not what shows.
  const refused = await mountWebsite('trainer', { respond: () => new Response('Request Entity Too Large', { status: 413 }) });
  try {
    await attachAndSubmit(refused, [1]);
    assert.equal(refused.sent.length, 1);
    assert.match(refused.doc.body.textContent, /the limit for one application is 4 MB in total/);
    assert.doesNotMatch(refused.doc.body.textContent, /Could not submit application|Request Entity Too Large/);
  } finally { await refused.unmount(); }
});

// ── The legacy /mobile pages ─────────────────────────────────────────────────────────────

test('/mobile: the coach form starts with each select\'s shown value, and sends a token and the size check', () => {
  const src = read('public/mobile/signup.jsx');
  assert.match(src, /React\.useState\(\(\) => proInitialValues\(role\)\)/);
  const init = src.slice(src.indexOf('function proInitialValues'), src.indexOf('\n}\n', src.indexOf('function proInitialValues')));
  for (const key of ['years: proExperienceOptions[0]', 'insurance: "Yes"', 'primary:', 'response: "Within 24 hours"']) assert.ok(init.includes(key), key);
  assert.match(src, /form\.append\("turnstileToken", humanCheck\)/);
  assert.match(src, /filesBytes > APPLY_FILES_MAX_BYTES/);
  assert.match(src, /res\.status === 413/);
});

// ── The app ───────────────────────────────────────────────────────────────────────────────

const THEME = new Proxy({ MONO: 'mono', DISPLAY: 'display' }, { get: (t, k) => (k in t ? t[k] : '#000') });

async function mountApp(initialRole) {
  const env = useDom('https://shape.test/m/');
  env.w.useBS = () => THEME;
  env.w.ShapeAuth = { getCachedState: () => ({}) };
  const mod = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'), { registry: new Map([['react', React]]) });
  void mod;
  const Screen = env.w.BSProviderApplicationScreen;
  const root = ReactDOMClient.createRoot(env.doc.getElementById('root'));
  await act(() => root.render(React.createElement(Screen, { initialRole, onBack: () => {} })));
  const click = (el) => act(() => el.click());
  const button = (re) => byText(env.doc, 'button', re);
  return {
    ...env, click, button,
    fill: (patch) => act(() => env.w.shapeNoraForm.fill(patch)),
    next: () => click(button(/^Continue/)),
    text: () => env.doc.body.textContent,
    async unmount() { try { await act(() => root.unmount()); } finally { env.restore(); } },
  };
}

async function walkApp(p) {
  await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'RD 123' });
  await p.next();
  await p.click(p.button(/credentials may be verified/));
  await p.next();
  await p.next();
  for (const re of [/I agree to the/, /code of conduct/, /I consent to a required background check/, /independent contractor/, /maintain valid licensure/, /malpractice/, /general wellness guidance and individualized/]) {
    await p.click(p.button(re));
  }
}

test('app: only the route\'s own yes shows "Submitted"; a failed send keeps the form and says so', async () => {
  const p = await mountApp('nutritionist');
  try {
    await walkApp(p);
    const calls = [];
    let answer = async () => { throw Object.assign(new Error(config.PROVIDER_APPLICATION_SEND_FAILED), { retryable: true }); };
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return answer(); } };
    const transmit = () => p.click(p.button(/Transmit · Submit/));

    await transmit(); await act(tick);
    assert.match(p.text(), /We couldn't send your application\. Check your connection and try again\./);
    assert.doesNotMatch(p.text(), /Submitted|Saved locally/);
    assert.ok(p.button(/Transmit · Submit/), 'the form is still there to try again');

    answer = async () => ({ stored: 'local', data: { id: 'local-1' } });
    await transmit(); await act(tick);
    assert.doesNotMatch(p.text(), /Submitted|Saved locally/, 'anything but the route\'s yes is not a submission');
    assert.match(p.text(), /We couldn't send your application/);

    answer = async () => ({ stored: 'api', duplicate: false, data: { id: 'app-9' } });
    await transmit(); await act(tick);
    assert.match(p.text(), /Filed ✓ · Submitted/);
    assert.doesNotMatch(p.text(), /Saved locally|provider application API|Supabase configuration/);

    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].files, [], 'no files attached, none sent');
    assert.equal(calls[2].values.nutrition_role, 'nutritionist');
    assert.equal('documents' in calls[2].values, false, 'nothing is pre-uploaded');
  } finally { await p.unmount(); }
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx');
  assert.doesNotMatch(src, /uploadProviderApplicationFile|Saved locally|stored === 'local'/);
});

test('app: a nutritionist says what they are, and adds a CDR number, state licenses and insurance', async () => {
  const p = await mountApp('nutritionist');
  try {
    await walkApp(p);
    await p.click(p.button(/^Back$/)); await p.click(p.button(/^Back$/));
    assert.match(p.text(), /Professional type/);
    assert.doesNotMatch(p.text(), /CDR registration number/, 'a nutritionist is not asked for a CDR number');
    const typeSelect = [...p.doc.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Dietitian (RD / RDN)'));
    await act(() => typeInto(p.w, typeSelect, 'Dietitian (RD / RDN)'));
    assert.match(p.text(), /CDR registration number/);
    assert.match(p.text(), /nutritionist application · RD\/RDN/);
    const field = (label) => byText(p.doc, 'label', new RegExp(`^${label}`)).querySelector('input');
    await act(() => typeInto(p.w, field('CDR registration number'), '1234567'));
    await act(() => typeInto(p.w, p.doc.querySelector('input[aria-label="State"]'), 'ny'));
    await act(() => typeInto(p.w, p.doc.querySelector('input[aria-label="License number"]'), 'NY-55'));
    await p.click(p.button(/Add another state/));
    assert.equal(p.doc.querySelectorAll('input[aria-label="State"]').length, 2);
    await act(() => typeInto(p.w, field('Insurance carrier'), 'HPSO'));
    await act(() => typeInto(p.w, field('Policy number'), 'P-9'));
    await p.next(); await p.next();
    const calls = [];
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return { stored: 'api', data: { id: 'n-1' } }; } };
    await p.click(p.button(/Transmit · Submit/)); await act(tick);
    assert.equal(calls.length, 1, p.text().slice(-300));
    const v = calls[0].values;
    assert.equal(v.nutrition_role, 'dietitian');
    assert.equal(v.cdrId, '1234567');
    assert.equal(v.rdCredential, 'rd');
    assert.deepEqual(v.licenses, [{ state: 'NY', number: 'NY-55', expires: '' }, { state: '', number: '', expires: '' }]);
    assert.deepEqual([v.insCarrier, v.insPolicy], ['HPSO', 'P-9']);
  } finally { await p.unmount(); }
});

test('app: files over 4 MB in total are stopped on the screen, and the helper copy says the real limit', async () => {
  const p = await mountApp('trainer');
  try {
    await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'NASM' });
    await p.next();
    assert.match(p.text(), /All files together up to 4 MB/);
    assert.doesNotMatch(p.text(), /10MB/);
    const inputs = [...p.doc.querySelectorAll('input[type=file]')];
    await act(() => attachFile(p.w, inputs[0], new File([new Uint8Array(3 * MB)], 'cv.pdf', { type: 'application/pdf' })));
    await act(() => attachFile(p.w, inputs[1], new File([new Uint8Array(1.5 * MB)], 'cert.pdf', { type: 'application/pdf' })));
    await p.click(p.button(/credentials may be verified/));
    await p.next(); await p.next();
    for (const re of [/I agree to the/, /code of conduct/, /I consent to a required background check/]) await p.click(p.button(re));
    const calls = [];
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return { stored: 'api', data: { id: 'x' } }; } };
    await p.click(p.button(/Transmit · Submit/)); await act(tick);
    assert.equal(calls.length, 0);
    assert.match(p.text(), /Your files add up to 4\.5 MB; the limit for one application is 4 MB in total/);
  } finally { await p.unmount(); }
});
