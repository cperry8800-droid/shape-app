// Nora helps fill in the sign-up and coach application (the Ask Nora plan, step 5): the
// server's field list (src/lib/ai/noraForms.mjs), the page's bridge (signup.jsx), what the
// page tells her (globalChatButton.js) and the card that fills it (chatWidget.jsx).
// The route itself is driven in tests/support-chat-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMS, CHOICES, NEVER_FILLED, cleanFill, cleanFormContext, formNote, FILL_FORM_TOOL } from '../src/lib/ai/noraForms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const require = createRequire(join(ROOT, 'package.json'));
const SIGNUP = read('public/newdesign/signup.jsx');
const NOW = new Date('2026-10-08T12:00:00Z');
const keysOf = (kind) => FORMS[kind].steps.flatMap((s) => s.fields.map((f) => f.key));

test('⚠ never a password, a document, a consent box or the human check: no field exists for one', () => {
  for (const kind of Object.keys(FORMS)) {
    for (const key of keysOf(kind)) assert.ok(!NEVER_FILLED.includes(key), `${kind}.${key} must not be fillable`);
  }
  const page = JSON.parse(SIGNUP.match(/const SIGNUP_NORA_NEVER = (\[[^\]]*\]);/)[1]);
  for (const key of ['password', 'tos', 'waiver', 'verify', 'conduct', 'bgcheck', 'attest', 'resumeFile', 'credentialFile', 'insuranceFile', 'licenses']) {
    assert.ok(page.includes(key), `the page refuses ${key} too`);
    assert.ok(NEVER_FILLED.includes(key));
  }
  // Every consent box the page draws is one of them.
  for (const m of SIGNUP.matchAll(/<Check on=\{v\.(\w+)\}/g)) assert.ok(page.includes(m[1]), `the ${m[1]} box is refused`);
  assert.match(SIGNUP, /toggleAtt\("independent_contractor"\)/, 'the attestations live under `attest`');
});

test('the field list follows the page: every key is one the form sets, every choice one it offers', () => {
  for (const kind of Object.keys(FORMS)) {
    for (const key of keysOf(kind)) {
      assert.ok(new RegExp(`set\\(\\{ ${key}:|toggle\\("${key}"`).test(SIGNUP), `${kind}.${key} is a field signup.jsx sets`);
    }
  }
  for (const [name, options] of Object.entries(CHOICES)) {
    for (const o of options) assert.ok(SIGNUP.includes(JSON.stringify(o)), `${name}: "${o}" is offered on the page`);
  }
  assert.equal(FORMS.signup.steps.length, 4);
  assert.deepEqual(FORMS.apply_trainer.steps.map((s) => s.name), ['Personal', 'Credentials', 'Specialty', 'Availability & pricing']);
  assert.ok(!keysOf('apply_trainer').includes('nutritionType') && keysOf('apply_nutritionist').includes('nutritionType'));
  assert.equal(FILL_FORM_TOOL.strict, true);
});

test('cleanFill: each value checked against its field; anything else dropped and named', () => {
  const out = cleanFill('signup', { fields: [
    { key: 'firstName', value: '  Sam  ' },
    { key: 'username', value: '@Sam.Lee!' },
    { key: 'email', value: 'Sam@Example.com' },
    { key: 'goal', value: 'build muscle' },
    { key: 'frequency', value: '3–4 times per week' },
    { key: 'accountability', value: 'Balanced' },
    { key: 'interests', value: 'Personal training, nutrition coaching, juggling' },
    { key: 'dob', value: '1990-02-30' },
    { key: 'password', value: 'hunter22' },
    { key: 'tos', value: 'true' },
    { key: 'sex', value: 'Other' },
  ] }, NOW);
  assert.deepEqual(out.values, {
    firstName: 'Sam', username: 'sam.lee', email: 'sam@example.com', goal: 'Build muscle', frequency: '3-4 times per week',
    accountability: 'Balanced — weekly check-ins', interests: ['Personal training', 'Nutrition coaching'],
  });
  assert.deepEqual(out.dropped.sort(), ['dob', 'password', 'sex', 'tos']);
  assert.deepEqual(out.fields.map((f) => f.key), ['firstName', 'lastName', 'username', 'email', 'goal', 'experience', 'frequency', 'accountability', 'interests'].filter((k) => k in out.values), 'in the form\'s own order');
  assert.equal(out.fields.find((f) => f.key === 'username').label, 'Username', 'a card label without the note in brackets');

  const dates = cleanFill('signup', { fields: [{ key: 'dob', value: '2026-10-08' }] }, NOW);
  assert.deepEqual(dates.values, {}, 'a birth date cannot be today or later');
  assert.deepEqual(cleanFill('signup', { fields: [{ key: 'dob', value: '1994-06-01' }] }, NOW).values, { dob: '1994-06-01' });

  const pro = cleanFill('apply_nutritionist', { fields: [
    { key: 'tz', value: 'Europe/London' }, { key: 'subPrice', value: '320' }, { key: 'maxClients', value: '900' },
    { key: 'nutritionType', value: 'dietitian (rd / rdn)' }, { key: 'rdCredential', value: 'RDN' }, { key: 'primary', value: 'HIIT & Fat Loss' },
    { key: 'insExpires', value: '2027-03-31' }, { key: 'phone', value: '+1 (555) 010-2000' },
  ] }, NOW);
  assert.deepEqual(pro.values, { tz: 'Europe/London', subPrice: '320', nutritionType: 'Dietitian (RD / RDN)', rdCredential: 'rdn', insExpires: '2027-03-31', phone: '+1 (555) 010-2000' });
  assert.deepEqual(pro.dropped.sort(), ['maxClients', 'primary'], 'a trainer specialty is not a nutritionist\'s; 900 clients is past the cap');
  assert.deepEqual(cleanFill('signup', 'nonsense').values, {});
  assert.deepEqual(cleanFill('nope', { fields: [{ key: 'firstName', value: 'Sam' }] }).values, {});
});

test('the page\'s claim is reduced to a known form, step and keys; the note names them and the rules', () => {
  assert.equal(cleanFormContext({ kind: 'admin', step: 0 }), null);
  assert.equal(cleanFormContext('signup'), null);
  assert.deepEqual(cleanFormContext({ kind: 'signup', step: 9, filled: ['email', 'password', 'email', 7] }), { kind: 'signup', step: 0, filled: ['email'] });
  const note = formNote({ kind: 'apply_trainer', step: 3, filled: ['firstName'] });
  assert.match(note, /trainer application open, on step 4 of 4 \(Availability & pricing\)/);
  assert.match(note, /Step 4 · Availability & pricing \(they are here\)/);
  assert.match(note, /First name \[firstName\] \(filled\)/);
  assert.match(note, /Never guess or invent/);
  assert.match(note, /never submit/);
  assert.match(note, /password, an uploaded document, the human check, or any agreement or consent box/);
  assert.match(note, /at least 5 years of professional training or coaching experience/);
  assert.doesNotMatch(formNote({ kind: 'apply_trainer', step: 0, filled: [] }), /dietitian license/);
  assert.match(formNote({ kind: 'apply_nutritionist', step: 0, filled: [] }), /general wellness guidance only/);
  assert.equal(formNote(null), '');
});

// ── The page ─────────────────────────────────────────────────────────────────────
test('every page with Nora tells her the open form, never its values; not with the page chip off', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x/newdesign/SignupTrainer.html' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.fetch = async () => ({ ok: false, json: async () => ({}) });
  w.eval(read('public/newdesign/globalChatButton.js'));
  assert.equal(w.__shapeNoraContext().form, undefined, 'no form, no claim');
  w.shapeNoraForm = { kind: 'apply_trainer', state: () => ({ kind: 'apply_trainer', step: 2, filled: ['firstName', 'email'], values: { email: 'x@y.z' } }) };
  assert.equal(JSON.stringify(w.__shapeNoraContext().form), JSON.stringify({ kind: 'apply_trainer', step: 2, filled: ['firstName', 'email'] }));
  assert.equal(w.__shapeNoraContext(false).form, undefined, 'the chip off sends only the zone');
  w.shapeNoraForm = { kind: 'signup', state: () => { throw new Error('boom'); } };
  assert.equal(w.__shapeNoraContext().form, undefined, 'a broken bridge never breaks the question');
});

async function mountSignup(role) {
  const { JSDOM } = require('jsdom');
  const babel = require('next/dist/compiled/babel/core');
  const presetReact = require('next/dist/compiled/babel/preset-react');
  const React = require('react');
  const ReactDOMClient = require('react-dom/client');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `https://shape.test/newdesign/Signup.html?role=${role}` });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const opened = [];
  dom.window.__openChatTo = (req) => opened.push(req);
  const code = babel.transformSync(SIGNUP, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  let root = null;
  const ReactDOM = { createRoot: (el) => (root = ReactDOMClient.createRoot(el)) };
  await React.act(async () => {
    new Function('React', 'ReactDOM', 'window', 'document', 'Logo', 'serif', 'sans', 'INK', 'PAPER', 'TEAL', code)(
      React, ReactDOM, dom.window, dom.window.document, () => null, 'serif', 'sans', '#fff', '#000', '#0ac5a8',
    );
  });
  return {
    w: dom.window, doc: dom.window.document, opened, act: React.act,
    async unmount() {
      try { await React.act(async () => root.unmount()); } finally {
        dom.window.close();
        Object.assign(globalThis, { window: before.window, document: before.document, IS_REACT_ACT_ENVIRONMENT: before.act });
      }
    },
  };
}

test('signup.jsx: the bridge reports the form, fills only what it may, and goes with the form', async () => {
  const p = await mountSignup('trainer');
  try {
    const form = p.w.shapeNoraForm;
    assert.ok(form, 'the application registers its bridge');
    assert.equal(form.kind, 'apply_trainer');
    assert.deepEqual({ ...form.state(), filled: [...form.state().filled] }, { kind: 'apply_trainer', step: 0, filled: [] });
    let ok;
    await p.act(async () => { ok = form.fill({ firstName: 'Sam', password: 'hunter22', tos: true, bgcheck: true, years: '15+ years' }); });
    assert.equal(ok, true);
    assert.equal(p.doc.querySelector('input').value, 'Sam', 'the first-name field shows it');
    assert.deepEqual([...form.state().filled].sort(), ['firstName', 'years'], 'the password and the boxes were refused');
    assert.equal(form.fill({ password: 'x', tos: true }), false, 'nothing it may fill: nothing changes');
    const help = p.doc.querySelector('[data-nora-form-help]');
    assert.match(help.textContent, /Ask Nora, and she can fill this in with you/);
    await p.act(async () => help.click());
    assert.equal(JSON.stringify(p.opened), JSON.stringify([{ who: 'Nora', tab: 'support', draft: 'Can you help me fill this in?' }]));
  } finally { await p.unmount(); }
  assert.equal(p.w.shapeNoraForm, null, 'unmounted: the bridge is gone');
  const member = await mountSignup('client');
  try { assert.equal(member.w.shapeNoraForm.kind, 'signup'); } finally { await member.unmount(); }
});

// ── The card ─────────────────────────────────────────────────────────────────────
test('chatWidget: the fill card fills only the form it was made for, on a tap', async () => {
  const { JSDOM } = require('jsdom');
  const babel = require('next/dist/compiled/babel/core');
  const presetReact = require('next/dist/compiled/babel/preset-react');
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const W = read('public/newdesign/chatWidget.jsx');
  const slice = (a, b) => W.slice(W.indexOf(a), W.indexOf(b, W.indexOf(a)));
  const src = slice('function cwHexDigits', '\nfunction cwShade') + slice('function cwHexA', '\n// ') + slice('function CwFillCard', '\n// A twentieth');
  const code = babel.transformSync(src, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: 'https://shape.test/newdesign/SignupTrainer.html' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const CwFillCard = new Function('React', 'window', 'TEAL', 'TEAL_BRIGHT', 'PAPER', 'sans', `${code}\nreturn CwFillCard;`)(React, dom.window, '#0ac5a8', '#2ee0c4', '#000', 'sans');
    const filled = [];
    dom.window.shapeNoraForm = { kind: 'apply_trainer', fill: (v) => { filled.push(v); return true; } };
    const a = { type: 'fill', label: 'Fill these in', form: 'apply_trainer', fields: [{ key: 'firstName', label: 'First name', value: 'Sam' }], values: { firstName: 'Sam' } };
    const root = createRoot(dom.window.document.getElementById('r'));
    await React.act(async () => root.render(React.createElement('div', null, React.createElement(CwFillCard, { a }), React.createElement(CwFillCard, { a: { ...a, form: 'signup' } }))));
    const cards = [...dom.window.document.querySelectorAll('[data-nora-fill-card]')];
    assert.match(cards[0].textContent, /First nameSam/);
    assert.equal(filled.length, 0, 'nothing is filled before the tap');
    await React.act(async () => cards[0].querySelector('button').click());
    assert.equal(JSON.stringify(filled), JSON.stringify([{ firstName: 'Sam' }]));
    assert.match(cards[0].textContent, /Filled in ✓/);
    await React.act(async () => cards[1].querySelector('button').click());
    assert.equal(filled.length, 1, 'a card for another form fills nothing here');
    assert.match(cards[1].textContent, /Open the form these are for/);
    await React.act(async () => root.unmount());
  } finally {
    dom.window.close();
    Object.assign(globalThis, { window: before.window, document: before.document, IS_REACT_ACT_ENVIRONMENT: before.act });
  }
});
