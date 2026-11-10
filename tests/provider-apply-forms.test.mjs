// The coach application FORMS, mounted and driven (2026-10-12). The route they post to is
// driven in tests/provider-apply-submit.test.mjs; these are the halves a person touches.
//
//   website (public/newdesign/signup.jsx), mounted in jsdom the way tests/nora-forms.test.mjs
//   mounts it, submitting into a recorded fetch:
//     · an untouched form sends what its selects show (the experience select showed 7-10 years
//       and sent "", which the years check refused), except the years, which have no default:
//       an unanswered years select is said, not sent
//     · under the 5-year standard the form asks where they have worked and what kind of
//       experience it is, and sends the answers; it never refuses the years themselves
//     · the Specialty and Availability answers, and the agreements, reach the request
//     · the human-check token reaches the request
//     · files over 4 MB in total, or the platform's plain-text 413, read as the size sentence
//
//   app (mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx), mounted in jsdom:
//     · only the route's own yes shows "Application sent"; a failed send keeps the form and says so
//     · the agreements and the nutrition attestations are checked on Review, under each box
//     · the nutritionist fields the website collects are there (professional type, now on the first
//       step, CDR number, state licenses, insurance)
//     · the experience rule is the website's (the shared src/lib/provider-experience.mjs)
//     · a file the rules refuse is said on the Documents step, on its category
//
//   The legacy /mobile sign-up pages were retired on 2026-10-12 (tests/legacy-signup-retired).
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
const experience = await import(pathToFileURL(join(ROOT, 'src/lib/provider-experience.mjs')).href);
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

async function mountWebsite(role, { turnstile = null, filesLib = true, failUpload = -1, respond = () => new Response(JSON.stringify({ ok: true, id: 'app-1' }), { status: 200 }) } = {}) {
  const env = useDom(`https://shape.test/newdesign/Signup.html?role=${role}`);
  const sent = [];
  const stored = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, form: init.body, json: typeof init.body === 'string' ? JSON.parse(init.body) : null }); return respond(url, init); };
  env.w.ShapeAgeDerive = { isMinorFromDob: ageDerive.isMinorFromDob };
  // The page loads /application-files.js (the classic-script mirror) and supabase.js's client.
  if (filesLib) env.w.ShapeApplicationFiles = require(join(ROOT, 'public/application-files.js'));
  env.w.shapeDb = { client: { storage: { from: (bucket) => ({
    uploadToSignedUrl: async (path, token, file, opts) => {
      if (stored.length === failUpload) return { data: null, error: { message: 'upload failed' } };
      stored.push({ bucket, path, token, name: file.name, type: file.type, contentType: opts?.contentType });
      return { data: { path }, error: null };
    },
  }) } } };
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
    ...env, sent, stored,
    fill: (patch) => act(() => env.w.shapeNoraForm.fill(patch)),
    next, tickBox, click,
    submit: async () => { await click(byText(env.doc, 'button', /Submit application|Submitting/)); await act(tick); },
    async unmount() { try { await act(() => root.unmount()); } finally { env.restore(); } },
  };
}

/** Walks a trainer application through every step, touching only the text fields and the boxes. */
async function walkTrainer(p, extra = {}) {
  await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'NASM-CPT', years: '7-10 years', ...extra });
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
    assert.equal(form.get('yearsExperience'), '7-10 years', 'the chosen experience is sent');
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

test('website: the years have no default; an unanswered select is said and nothing is sent', async () => {
  const p = await mountWebsite('trainer');
  try {
    await walkTrainer(p, { years: '' });
    for (let i = 0; i < 2; i += 1) await p.click(byText(p.doc, 'button', /← Back/));
    const years = [...p.doc.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.value === '15+ years'));
    assert.equal(years.value, '', 'the select starts on "Select…", not on an answer');
    assert.deepEqual([...years.options].map((o) => o.value), ['', ...experience.PROVIDER_EXPERIENCE_OPTIONS], 'the shared list, in order');
    await p.next(); await p.next();
    await p.submit();
    assert.equal(p.sent.length, 0);
    assert.match(p.doc.body.textContent, /Choose your years of professional experience\./);
  } finally { await p.unmount(); }
});

test('website: under the 5-year standard the form asks where they have worked and what kind, and sends it; it is never a refusal', async () => {
  const p = await mountWebsite('trainer');
  try {
    await walkTrainer(p, { years: '1-2 years' });
    await p.submit();
    assert.equal(p.sent.length, 0, 'not without the two answers');
    assert.match(p.doc.body.textContent, /With under 5 years, tell us where you've worked and what type of experience you have/);
    assert.doesNotMatch(p.doc.body.textContent, /requires at least/);
    for (let i = 0; i < 2; i += 1) await p.click(byText(p.doc, 'button', /← Back/));
    assert.match(p.doc.body.textContent, /Where you've worked/);
    assert.match(p.doc.body.textContent, /Type of experience/);
    await p.fill({ experienceHistory: 'Equinox, floor trainer, 2 years', experienceType: 'Gym floor and small groups', experienceNotes: 'NSCA intern' });
    await p.next(); await p.next();
    await p.submit();
    assert.equal(p.sent.length, 1, p.doc.body.textContent.slice(-300));
    const form = p.sent[0].form;
    assert.equal(form.get('yearsExperience'), '1-2 years');
    const d = JSON.parse(form.get('details'));
    assert.deepEqual(
      [d.experience_history, d.experience_type, d.experience_notes, d.experience_standard_years],
      ['Equinox, floor trainer, 2 years', 'Gym floor and small groups', 'NSCA intern', 5],
    );
    assert.equal('professional_minimum_years' in d, false, 'the old 7-year marker is gone');
  } finally { await p.unmount(); }
  // At or over the standard the questions are not asked.
  const q = await mountWebsite('trainer');
  try {
    await q.fill({ years: '5-7 years' });
    await q.next();
    assert.doesNotMatch(q.doc.body.textContent, /Where you've worked/);
    await q.fill({ years: 'Less than 1 year' });
    assert.match(q.doc.body.textContent, /Where you've worked/, 'under a year is asked the same, not refused');
  } finally { await q.unmount(); }
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

const DRAFT = '0b7c1d4e-1111-4222-8333-444455556666';
/** The upload-links answer for the files a request names. */
function linksAnswer(init) {
  const files = JSON.parse(init.body).files;
  return new Response(JSON.stringify({
    draftId: DRAFT, ticket: `${DRAFT}.trainer.9999999999.${'b'.repeat(64)}`, bucket: 'provider-credentials',
    // The route answers with the type the rules settle on (an untyped file's comes from its extension).
    uploads: files.map((f, i) => ({ kind: f.kind, name: f.name, type: require(join(ROOT, 'public/application-files.js')).applicationFileType(f.name, f.type), size: f.size, path: `website/${DRAFT}/${f.kind}/${i + 1}-${f.name}`, token: `t${i}` })),
  }), { status: 200 });
}
const pdf = (name, bytes = 4) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
function attachFiles(w, input, files) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
}

test('website: documents by category, several per section, uploaded through signed links before the application', async () => {
  const p = await mountWebsite('trainer', { respond: (url, init) => (String(url).endsWith('/api/apply/uploads') ? linksAnswer(init) : new Response(JSON.stringify({ ok: true, id: DRAFT }), { status: 200 })) });
  try {
    await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', years: '7-10 years' });
    await p.next();
    for (const label of ['Resume / CV', 'Other CV materials', 'Certifications and certificates', 'Designations and supporting paperwork', 'Insurance']) {
      assert.ok(p.doc.querySelector(`input[type=file][aria-label="Add ${label}"]`), `a picker for ${label}`);
    }
    assert.match(p.doc.body.textContent, /Up to 10 MB a file and 75 MB in all\./);
    assert.doesNotMatch(p.doc.body.textContent, /4 MB in total/);
    const picker = (label) => p.doc.querySelector(`input[type=file][aria-label="Add ${label}"]`);
    await act(() => attachFiles(p.w, picker('Resume / CV'), [pdf('cv.pdf')]));
    await act(() => attachFiles(p.w, picker('Other CV materials'), [pdf('cover.pdf'), pdf('refs.pdf')]));
    await act(() => attachFiles(p.w, picker('Certifications and certificates'), [pdf('nasm.pdf'), pdf('cpr.pdf'), pdf('kettlebell.pdf')]));
    // A browser leaves a type it does not know empty: this one goes up typed by its extension.
    await act(() => attachFiles(p.w, picker('Designations and supporting paperwork'), [new File(['PK'], 'degree.docx', { type: '' })]));
    assert.match(p.doc.body.textContent, /kettlebell\.pdf/);
    await p.click(p.doc.querySelector('button[aria-label="Remove kettlebell.pdf"]'));
    assert.doesNotMatch(p.doc.body.textContent, /kettlebell\.pdf/, 'a chosen file can be taken off');
    await p.tickBox(/credentials may be verified/);
    await p.next(); await p.next();
    await p.tickBox(/I agree to the/); await p.tickBox(/code of conduct/); await p.tickBox(/I consent to a required background check/);
    await p.submit();
    assert.deepEqual(p.sent.map((r) => String(r.url)), ['/api/apply/uploads', '/api/apply'], p.doc.body.textContent.slice(-300));
    assert.deepEqual(p.sent[0].json.files.map((f) => [f.kind, f.name]), [
      ['resume', 'cv.pdf'], ['cv_materials', 'cover.pdf'], ['cv_materials', 'refs.pdf'],
      ['credential', 'nasm.pdf'], ['credential', 'cpr.pdf'], ['designation', 'degree.docx'],
    ]);
    assert.equal(p.sent[0].json.providerType, 'trainer');
    assert.equal(p.stored.length, 6, 'every file goes up on its own link');
    assert.deepEqual(p.stored.map((u) => u.token), ['t0', 't1', 't2', 't3', 't4', 't5']);
    // ⚠ The storage client sends a File under its own type (it ignores contentType for one), so the
    // untyped DOCX has to go up as a typed copy or the bucket refuses it (Codex on #2319).
    assert.equal(p.stored[5].name, 'degree.docx');
    assert.equal(p.stored[5].type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.ok(p.stored.every((u) => u.type && u.type !== 'application/octet-stream'));
    const form = p.sent[1].form;
    assert.equal(form.get('uploadTicket'), `${DRAFT}.trainer.9999999999.${'b'.repeat(64)}`);
    assert.equal(JSON.parse(form.get('uploads')).length, 6);
    for (const kind of ['resume', 'credential', 'insurance']) assert.equal(form.get(kind), null, 'no file rides the application');
    assert.match(p.doc.body.textContent, /Application submitted\./);
  } finally { await p.unmount(); }
});

test('website: a file the rules refuse is said before anything is sent, and a failed upload stops the application', async () => {
  const tooBig = await mountWebsite('trainer');
  try {
    await walkTrainer(tooBig);
    for (let i = 0; i < 2; i += 1) await tooBig.click(byText(tooBig.doc, 'button', /← Back/));
    await act(() => attachFiles(tooBig.w, tooBig.doc.querySelector('input[type=file][aria-label="Add Insurance"]'), [pdf('policy.pdf', 11 * MB)]));
    await tooBig.next(); await tooBig.next();
    await tooBig.submit();
    assert.equal(tooBig.sent.length, 0);
    assert.match(tooBig.doc.body.textContent, /policy\.pdf is 11\.0 MB; each file can be up to 10 MB\./);
  } finally { await tooBig.unmount(); }
  const broken = await mountWebsite('trainer', { failUpload: 0, respond: (url, init) => (String(url).endsWith('/api/apply/uploads') ? linksAnswer(init) : new Response(JSON.stringify({ ok: true }), { status: 200 })) });
  try {
    await walkTrainer(broken);
    for (let i = 0; i < 2; i += 1) await broken.click(byText(broken.doc, 'button', /← Back/));
    await act(() => attachFiles(broken.w, broken.doc.querySelector('input[type=file][aria-label="Add Resume / CV"]'), [pdf('cv.pdf')]));
    await broken.next(); await broken.next();
    await broken.submit();
    assert.deepEqual(broken.sent.map((r) => String(r.url)), ['/api/apply/uploads'], 'the application waits for its files');
    assert.match(broken.doc.body.textContent, /cv\.pdf did not upload\. Check your connection and try again\./);
  } finally { await broken.unmount(); }
  // Without the rules script the form says so rather than offering pickers it cannot check.
  const bare = await mountWebsite('trainer', { filesLib: false });
  try {
    await bare.fill({ firstName: 'Ada' });
    await bare.next();
    assert.match(bare.doc.body.textContent, /Couldn't load the document uploader/);
  } finally { await bare.unmount(); }
});

// ── The app ───────────────────────────────────────────────────────────────────────────────
// Seven short steps (owner, 2026-11-09: "Option A: short steps"): Role · You · Credentials · Documents ·
// Specialty · Rates · Review. Each step is checked before Continue, and Send checks them all again.
// The seven steps themselves, the draft and Nora's door are driven in tests/app-apply-steps.test.mjs.

const { IntlMessageFormat } = require('intl-messageformat');
const ONBOARDING = JSON.parse(read('mobile-app/src/i18n/catalogs/en/onboarding.json'));
const THEME = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#0f0e0c', PAPER2: '#181612', INK: '#f5f0e6', INK70: 'rgba(245,240,230,0.7)', INK50: 'rgba(245,240,230,0.5)', inkRGB: '245,240,230', isLight: false, padX: 22 };

async function mountApp(initialRole) {
  const env = useDom('https://shape.test/m/');
  env.w.useBS = () => THEME;
  env.w.ShapeAuth = { getCachedState: () => ({}) };
  // The app's words, from the en catalog, through the same ICU the app formats with.
  env.w.ShapeI18n = { t: (key, opts = {}) => { const m = ONBOARDING[key.replace(/^onboarding:/, '')]; return m == null ? undefined : new IntlMessageFormat(m, 'en').format(opts); }, intlLocale: () => 'en' };
  await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'), { registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]) });
  const Screen = env.w.BSProviderApplicationScreen;
  const root = ReactDOMClient.createRoot(env.doc.getElementById('root'));
  await act(() => root.render(React.createElement(Screen, { initialRole, onBack: () => {} })));
  const click = (el) => act(() => el.click());
  const button = (re) => byText(env.doc, 'button', re);
  const at = () => env.doc.querySelector('[data-provider-apply]').getAttribute('data-apply-step');
  return {
    ...env, click, button, at,
    fill: (patch) => act(() => env.w.shapeNoraForm.fill(patch)),
    next: () => click(env.doc.querySelector('[data-apply-continue]')),
    edit: (section) => click(env.doc.querySelector(`[data-review-edit="${section}"]`)),
    field: (key) => env.doc.querySelector(`[data-apply-field="${key}"]`),
    send: async () => { await click(env.doc.querySelector('[data-apply-continue]')); await act(tick); },
    text: () => env.doc.body.textContent,
    async unmount() { try { await act(() => root.unmount()); } finally { env.restore(); } },
  };
}

const AGREEMENTS = [/I agree to the/, /code of conduct/, /I consent to a required background check/];
const ATTESTATIONS = [/independent contractor/, /maintain valid licensure/, /malpractice/, /general wellness guidance and individualized/];

/** Nora's card fills the fields; Continue on the first step then goes to Review; Credentials' tick and
 *  the agreements are theirs, by tap. */
async function walkApp(p, extra = {}, { nutritionist = true } = {}) {
  await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'RD 123', years: '7-10 years', ...extra });
  await p.next();
  assert.equal(p.at(), 'review', 'what Nora filled is reviewed first');
  await p.edit('credentials');
  await p.click(p.button(/credentials may be verified/));
  await p.next();
  assert.equal(p.at(), 'review', 'Continue from an edited step goes back to Review');
  for (const re of [...AGREEMENTS, ...(nutritionist ? ATTESTATIONS : [])]) await p.click(p.button(re));
}

test('app: only the route\'s own yes shows "Application sent"; a failed send keeps the form and says so', async () => {
  const p = await mountApp('nutritionist');
  try {
    await walkApp(p);
    const calls = [];
    let answer = async () => { throw Object.assign(new Error(config.PROVIDER_APPLICATION_SEND_FAILED), { retryable: true }); };
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return answer(); } };

    await p.send();
    assert.match(p.doc.querySelector('[data-apply-send-error]').textContent, /We couldn't send your application\. Check your connection and try again\./);
    assert.doesNotMatch(p.text(), /Application sent|Saved locally/);
    assert.equal(p.at(), 'review', 'the form is still there to try again');

    answer = async () => ({ stored: 'local', data: { id: 'local-1' } });
    await p.send();
    assert.doesNotMatch(p.text(), /Application sent|Saved locally/, 'anything but the route\'s yes is not a submission');
    assert.match(p.text(), /We couldn't send your application/);

    // The route's own words for a refusal show as they came.
    answer = async () => { throw new Error('All nutrition compliance attestations are required.'); };
    await p.send();
    assert.match(p.doc.querySelector('[data-apply-send-error]').textContent, /All nutrition compliance attestations are required\./);

    answer = async () => ({ stored: 'api', duplicate: false, data: { id: 'app-9' } });
    await p.send();
    assert.match(p.text(), /Application sent\./);
    assert.equal(p.at(), 'sent');
    assert.doesNotMatch(p.text(), /Saved locally|provider application API|Supabase configuration/);

    assert.equal(calls.length, 4);
    assert.deepEqual(calls[3].files, [], 'no files attached, none sent');
    assert.equal(calls[3].role, 'nutritionist');
    assert.equal(calls[3].values.nutrition_role, 'nutritionist');
    assert.equal(calls[3].values.primary, 'Weight management', 'the shown primary specialty is sent');
    assert.deepEqual([calls[3].values.tos, calls[3].values.conduct, calls[3].values.bgcheck, calls[3].values.verify], [true, true, true, true]);
    assert.deepEqual(calls[3].values.attest, { independent_contractor: true, maintains_licensure: true, maintains_insurance: true, scope_understood: true });
    assert.equal('documents' in calls[3].values, false, 'nothing is pre-uploaded');
  } finally { await p.unmount(); }
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx');
  assert.doesNotMatch(src, /uploadProviderApplicationFile|Saved locally|stored === 'local'/);
});

test('app: the attestations and the agreements are checked on Review, each under its own box', async () => {
  const p = await mountApp('nutritionist');
  try {
    await walkApp(p);
    // Untick one attestation and one agreement: Send stays on Review and says it under each.
    await p.click(p.button(/malpractice/));
    await p.click(p.button(/code of conduct/));
    const calls = [];
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return { stored: 'api', data: { id: 'n' } }; } };
    await p.send();
    assert.equal(calls.length, 0, 'the route refuses a nutritionist application without all four, so the screen does too');
    assert.equal(p.at(), 'review');
    assert.match(p.field('attest.maintains_insurance').textContent, /Tick this box to send your application\./);
    assert.match(p.field('conduct').textContent, /Tick this box to send your application\./);
    assert.doesNotMatch(p.field('tos').textContent, /Tick this box/);
    await p.click(p.button(/malpractice/));
    await p.click(p.button(/code of conduct/));
    await p.send();
    assert.equal(calls.length, 1);
  } finally { await p.unmount(); }
});

test('app: a nutritionist says what they are on the first step, and adds a CDR number, state licenses and insurance', async () => {
  const p = await mountApp('nutritionist');
  try {
    assert.match(p.text(), /Professional type/);
    await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'RD 123', years: '7-10 years' });
    // On the first step: the role can change, and a nutritionist says whether they are a dietitian.
    assert.equal(p.doc.querySelector('[role="radio"][aria-checked="true"]').textContent.includes('Nutritionist'), true);
    await p.click([...p.doc.querySelectorAll('[data-apply-field="nutritionType"] [role="radio"]')].find((b) => /Dietitian/.test(b.textContent)));
    assert.match(p.text(), /Dietitian application \(RD\/RDN\)/);
    await p.next();
    await p.edit('credentials');
    const input = (key) => p.field(key).querySelector('input');
    await act(() => typeInto(p.w, input('cdrId'), '1234567'));
    await act(() => typeInto(p.w, p.doc.querySelector('input[aria-label="State"]'), 'ny'));
    await act(() => typeInto(p.w, p.doc.querySelector('input[aria-label="License number"]'), 'NY-55'));
    await p.click(p.button(/Add another state/));
    assert.equal(p.doc.querySelectorAll('input[aria-label="State"]').length, 2);
    await act(() => typeInto(p.w, input('insCarrier'), 'HPSO'));
    await act(() => typeInto(p.w, input('insPolicy'), 'P-9'));
    await p.click(p.button(/credentials may be verified/));
    await p.next();
    for (const re of [...AGREEMENTS, ...ATTESTATIONS]) await p.click(p.button(re));
    const calls = [];
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return { stored: 'api', data: { id: 'n-1' } }; } };
    await p.send();
    assert.equal(calls.length, 1, p.text().slice(-300));
    const v = calls[0].values;
    assert.equal(v.nutrition_role, 'dietitian');
    assert.equal(v.nutritionType, 'Dietitian (RD / RDN)', 'the English value is sent, whatever the label says');
    assert.equal(v.cdrId, '1234567');
    assert.equal(v.rdCredential, 'rd');
    assert.deepEqual(v.licenses, [{ state: 'NY', number: 'NY-55', expires: '' }, { state: '', number: '', expires: '' }]);
    assert.deepEqual([v.insCarrier, v.insPolicy], ['HPSO', 'P-9']);
  } finally { await p.unmount(); }
  // A trainer is not asked for a CDR number; switching the role on the first step changes the application.
  const q = await mountApp('trainer');
  try {
    await q.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'NASM', years: '7-10 years' });
    await q.next();
    await q.edit('credentials');
    assert.doesNotMatch(q.text(), /CDR registration number/);
    assert.equal(q.w.shapeNoraForm.kind, 'app_apply_trainer');
  } finally { await q.unmount(); }
});

test('app: documents by category, several per section; the step says a refused file and hands the rest to the sender', async () => {
  const p = await mountApp('trainer');
  try {
    await walkApp(p, { cert: 'NASM', years: '10-15 years' }, { nutritionist: false });
    await p.edit('documents');
    assert.match(p.text(), /Up to 10 MB a file and 75 MB in all\./);
    assert.match(p.text(), /Files are not saved with your draft/);
    assert.doesNotMatch(p.text(), /4 MB/);
    const picker = (label) => p.doc.querySelector(`input[type=file][aria-label="Add ${label}"]`);
    for (const label of ['Resume / CV', 'Other CV materials', 'Certifications and certificates', 'Designations and supporting paperwork', 'Insurance']) assert.ok(picker(label), label);
    await act(() => attachFiles(p.w, picker('Certifications and certificates'), [pdf('nasm.pdf'), pdf('cpr.pdf')]));
    await act(() => attachFiles(p.w, picker('Designations and supporting paperwork'), [pdf('big-scan.pdf', 11 * MB)]));
    await p.next();
    assert.equal(p.at(), 'documents', 'Continue refuses a file the server would refuse');
    assert.match(p.field('docs.designation').textContent, /big-scan\.pdf is 11\.0 MB; each file can be up to 10 MB\./, 'said on the category that holds it');
    await p.click(p.doc.querySelector('button[aria-label="Remove big-scan.pdf"]'));
    await act(() => attachFiles(p.w, picker('Resume / CV'), [pdf('cv.pdf')]));
    await p.next();
    assert.equal(p.at(), 'review');
    assert.match(p.doc.querySelector('[data-review-row="documents"]').textContent, /3 files/);
    const calls = [];
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return { stored: 'api', data: { id: 'x' } }; } };
    await p.send();
    assert.equal(calls.length, 1, p.text().slice(-300));
    assert.deepEqual(calls[0].files.map((f) => [f.kind, f.file.name]), [['resume', 'cv.pdf'], ['credential', 'nasm.pdf'], ['credential', 'cpr.pdf']]);
    assert.match(p.text(), /We have your application and documents\./);
  } finally { await p.unmount(); }
});

test('app: the years have no default, and under the standard the same two questions are asked, never a refusal', async () => {
  const p = await mountApp('nutritionist');
  try {
    await p.fill({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', cert: 'RD 123' });
    await p.next();
    assert.equal(p.at(), 'review');
    // The years unanswered and the verification box unticked: two missing on Credentials.
    assert.match(p.doc.querySelector('[data-review-row="credentials"]').textContent, /2 missing/);
    for (const re of [...AGREEMENTS, ...ATTESTATIONS]) await p.click(p.button(re));
    const calls = [];
    p.w.ShapeApplications = { submitProviderApplication: async (arg) => { calls.push(arg); return { stored: 'api', data: { id: 'n-2' } }; } };
    await p.send();
    assert.equal(calls.length, 0);
    assert.equal(p.at(), 'credentials', 'Send goes to the step that fails');
    assert.match(p.field('years').textContent, /Choose your years of professional experience\./);
    assert.match(p.field('verify').textContent, /Tick this box to continue\./);
    await p.click(p.button(/credentials may be verified/));
    const years = p.field('years').querySelector('select');
    assert.equal(years.value, '');
    assert.deepEqual([...years.options].map((o) => o.value), ['', ...experience.PROVIDER_EXPERIENCE_OPTIONS], 'the shared list, in order, its values English');

    await act(() => typeInto(p.w, years, '3-4 years'));
    await p.next();
    assert.equal(p.at(), 'credentials', 'not without where they have worked and what kind');
    assert.match(p.field('experienceHistory').textContent, /With under 5 years, tell us where you've worked/);
    assert.match(p.field('experienceType').textContent, /With under 5 years, tell us where you've worked/);
    assert.doesNotMatch(p.text(), /requires at least/);
    assert.match(p.text(), /Shape's standard is 5 years/);
    const area = (key) => p.field(key).querySelector('textarea');
    await act(() => typeInto(p.w, area('experienceHistory'), 'Clinic A, dietetic intern, 1 year'));
    await act(() => typeInto(p.w, area('experienceType'), 'Clinical practice'));
    await p.next();
    assert.equal(p.at(), 'review');
    await p.send();
    assert.equal(calls.length, 1, p.text().slice(-300));
    assert.deepEqual([calls[0].values.years, calls[0].values.experienceHistory, calls[0].values.experienceType], ['3-4 years', 'Clinic A, dietetic intern, 1 year', 'Clinical practice']);
  } finally { await p.unmount(); }
});
