// MOUNT the mobile date-of-birth gate and drive it.
//
// This screen is the last thing between a member and the app, so the two things
// worth proving are that it RENDERS at all (a TDZ reference or a hook-order
// fault is valid syntax, typechecks, builds, and passes every pure-logic test —
// because none of those things run the component) and that it treats a refusal
// as a refusal. A 200 that does not carry `ok: true` is the route saying it could
// NOT confirm the write; calling that success would wave the member through to a
// gate that still refuses them, with nothing on screen to explain why.
//
// The real shipping module is compiled in memory with its imports resolved —
// only the translator is stubbed, resolving defaultValue exactly like the real
// one so the copy still renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSDobGate.jsx');

// jsdom globals must exist before react-dom/client is pulled in.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { createRoot } = require_('react-dom/client');

const tr = (key, opts) => (opts && opts.defaultValue) || key;
const MOD = await loadRealModule(SRC, {
  // ⚠ PIN REACT TO THE TEST'S OWN COPY. loadRealModule resolves bare specifiers
  // from the SOURCE file, which finds mobile-app/node_modules/react — a second
  // React instance whose hook dispatcher is null when react-dom renders from
  // the root copy. One instance, or every hook reads null.
  registry: new Map([
    ['react', React],
    ['../i18n/index.js', { useTr: () => ({ tr }) }],
  ]),
});
const BSDobGate = MOD.default;

function mount(props = {}) {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  React.act(() => { root.render(React.createElement(BSDobGate, props)); });
  return {
    host,
    text: () => host.textContent,
    input: () => host.querySelector('input[type="date"]'),
    form: () => host.querySelector('form'),
    alert: () => host.querySelector('[role="alert"]'),
    buttons: () => [...host.querySelectorAll('button')],
    unmount: () => React.act(() => { root.unmount(); }),
  };
}

// React tracks a controlled input's value on the node, so assigning el.value
// directly is invisible to onChange — the state stays empty and submit
// early-returns, which reads as "the handler never ran". Go through the native
// setter so React sees a real change.
function typeDate(ui, value) {
  const el = ui.input();
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  React.act(() => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

function submit(ui) {
  React.act(() => {
    ui.form().dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
}

const settle = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

function stubFetch(respond) {
  const calls = [];
  globalThis.fetch = (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    return Promise.resolve(respond());
  };
  dom.window.fetch = globalThis.fetch;
  return calls;
}

const resp = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

test('it mounts and offers the form', () => {
  const ui = mount({});
  assert.ok(ui.input(), 'a date input should render');
  assert.match(ui.text(), /Confirm your date of birth/i);
  assert.match(ui.text(), /Save and continue/i);
  ui.unmount();
});

test('the blocked account gets an explanation, not a form', () => {
  const ui = mount({ blocked: 'no_profile' });
  // A form here would be a form guaranteed to 409 — the account has no row.
  assert.equal(ui.input(), null, 'no form should be offered');
  assert.match(ui.text(), /can’t finish this here/i);
  assert.match(ui.text(), /Sign out/i);
  ui.unmount();
});

test('a confirmed save reports back with what was typed', async () => {
  const calls = stubFetch(() => resp(200, { ok: true, date_of_birth: '1990-04-02', over_18: true }));
  let saved = 0;
  const ui = mount({ onSaved: () => { saved += 1; } });

  typeDate(ui, '1990-04-02');
  submit(ui);
  await settle();

  assert.equal(saved, 1, 'onSaved should fire exactly once');
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'a POST should have been made');
  assert.equal(post.url, '/api/me/date-of-birth');
  assert.equal(JSON.parse(post.body).date_of_birth, '1990-04-02');
  ui.unmount();
});

// ⚠ THE PROPERTY THAT MATTERS. Each of these is the server declining, and each
// would leave the member facing the same gate on the next screen. Reporting any
// of them as saved is the failure this test exists to prevent.
for (const [label, r] of [
  ['a 403 for an under-18 date', () => resp(403, { error: 'Shape is for adults 18 and over.', code: 'under_18' })],
  ['a 503 the write could not be confirmed', () => resp(503, { error: 'Could not confirm your date of birth was saved. Try again.', code: 'not_persisted' })],
  ['a 409 the row is missing', () => resp(409, { error: 'Your account setup did not finish…', code: 'no_profile' })],
  ['a 200 that does NOT carry ok:true', () => resp(200, { date_of_birth: null })],
]) {
  test(`it does not report success on: ${label}`, async () => {
    stubFetch(r);
    let saved = 0;
    const ui = mount({ onSaved: () => { saved += 1; } });

    typeDate(ui, '2015-01-01');
    submit(ui);
    await settle();

    assert.equal(saved, 0, `${label} must not be treated as saved`);
    const alert = ui.alert();
    assert.ok(alert && alert.textContent.trim(), 'the member must be told why');
    ui.unmount();
  });
}

test('a network failure is reported, never swallowed', async () => {
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  dom.window.fetch = globalThis.fetch;
  let saved = 0;
  const ui = mount({ onSaved: () => { saved += 1; } });

  typeDate(ui, '1990-04-02');
  submit(ui);
  await settle();

  assert.equal(saved, 0);
  assert.ok(ui.alert()?.textContent.trim(), 'a failed request must surface');
  ui.unmount();
});

test('an escape hatch exists in both states', () => {
  // Without it, a member who cannot answer — a shared device, the wrong account —
  // is stranded behind the only screen the app will show them.
  for (const props of [{}, { blocked: 'no_profile' }]) {
    let out = 0;
    const ui = mount({ ...props, onLogout: () => { out += 1; } });
    const btn = ui.buttons().find((b) => /sign out/i.test(b.textContent));
    assert.ok(btn, `a sign-out control must exist (blocked=${!!props.blocked})`);
    React.act(() => { btn.dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
    assert.equal(out, 1);
    ui.unmount();
  }
});
