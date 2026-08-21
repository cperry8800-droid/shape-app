// The web date-of-birth gate: WHEN it blocks, and — far more important — when
// it must not.
//
// This overlay covers the entire portal, so a false positive is an outage: it
// would hold every signed-in member behind a form none of them owed us. The
// safety property is therefore one-directional and worth pinning hard — it
// blocks on an explicit `needed: true` and on nothing else. A 401 mid token
// refresh, a 500, an HTML error page from a proxy, a body that isn't JSON, a
// body missing the field: every one of those must fall through silently.
//
// The script is loaded from disk and evaluated inside a real DOM, so what runs
// here is the shipping file — not a description of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'public', 'newdesign', 'dobGate.js'), 'utf8');
const GATE_ID = 'shape-dob-gate';

function resp(status, body, { notJson = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (notJson ? Promise.reject(new Error('not json')) : Promise.resolve(body)),
  };
}

// Boot the gate against a scripted backend. `calls` records what it asked for,
// so a test can prove the POST carried the date the member typed.
function boot({ getResp, postResp, deferReady = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><main id="page">portal</main></body></html>', {
    runScripts: 'outside-only',
  });
  const win = dom.window;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (!opts || !opts.method || opts.method === 'GET') {
      return getResp ? Promise.resolve(getResp()) : Promise.reject(new Error('offline'));
    }
    return postResp ? Promise.resolve(postResp()) : Promise.reject(new Error('offline'));
  };
  // jsdom finishes parsing before it hands the document back, so readyState is
  // already 'complete' and the file takes its run-immediately branch. Shadowing
  // it is the only way to reach the DOMContentLoaded branch — which is the only
  // path on which start() can ever be asked to run a second time.
  if (deferReady) {
    Object.defineProperty(win.document, 'readyState', { value: 'loading', configurable: true });
  }
  win.eval(SRC);
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return { win, calls, doc: win.document };
}

// The gate is promise-driven; give the microtask queue room to settle.
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const gateIn = (doc) => doc.getElementById(GATE_ID);

test('blocks when the server says the date is needed', async () => {
  const { doc } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  const gate = gateIn(doc);
  assert.ok(gate, 'overlay should be present');
  assert.equal(gate.getAttribute('role'), 'dialog');
  assert.equal(gate.getAttribute('aria-modal'), 'true');
  assert.ok(doc.getElementById(`${GATE_ID}-input`), 'a date input should be offered');
  assert.equal(doc.documentElement.style.overflow, 'hidden', 'page scroll should be locked behind it');
});

test('does NOT block when the server says the date is not needed', async () => {
  const { doc } = boot({ getResp: () => resp(200, { needed: false }) });
  await settle();
  assert.equal(gateIn(doc), null);
  assert.notEqual(doc.documentElement.style.overflow, 'hidden');
});

// ⚠ THE CORE SAFETY PROPERTY. Each of these is a way the check can fail to
// produce an answer, and not one of them is evidence that this member owes us a
// date. If any starts blocking, a transient backend fault becomes a portal-wide
// lockout — so they are enumerated rather than sampled.
for (const [label, getResp] of [
  ['401 during a token refresh', () => resp(401, { error: 'Authentication required.' })],
  ['500 from the API', () => resp(500, { error: 'boom' })],
  ['503 from a proxy', () => resp(503, null)],
  ['200 whose body is not JSON', () => resp(200, null, { notJson: true })],
  ['200 with an empty body', () => resp(200, null)],
  ['200 with no `needed` field', () => resp(200, { unknown: true })],
  ['200 with needed as the STRING "true"', () => resp(200, { needed: 'true' })],
  // ⚠ THE STATUS IS PART OF THE ANSWER. A response the server refused is not
  // evidence about this member, whatever its body happens to contain — an error
  // page, a cached copy, a shape a future route revision answers 4xx/5xx with.
  // Reading the body first would let a refused response hold the whole portal.
  ['a 500 whose body still says needed', () => resp(500, { needed: true })],
  ['a 401 whose body still says needed', () => resp(401, { needed: true, blocked: 'no_profile' })],
  ['the read failing outright', null],
]) {
  test(`does not block on: ${label}`, async () => {
    const { doc } = boot(getResp ? { getResp } : {});
    await settle();
    assert.equal(gateIn(doc), null, `${label} must not hold the member`);
  });
}

test('the profile-less account gets the blocked panel and no form', async () => {
  const { doc } = boot({ getResp: () => resp(200, { needed: true, blocked: 'no_profile' }) });
  await settle();
  const gate = gateIn(doc);
  assert.ok(gate, 'overlay should still be present');
  // Offering a form here would be offering something guaranteed to 409 — the
  // account has no row for POST to write to.
  assert.equal(doc.getElementById(`${GATE_ID}-input`), null, 'no form should be offered');
  assert.match(gate.textContent, /can’t finish this here/i);
  assert.match(gate.textContent, /Sign out/i);
});

test('a successful save removes the overlay and restores scrolling', async () => {
  const { doc, calls } = boot({
    getResp: () => resp(200, { needed: true }),
    postResp: () => resp(200, { ok: true, date_of_birth: '1990-04-02', over_18: true }),
  });
  await settle();
  const input = doc.getElementById(`${GATE_ID}-input`);
  input.value = '1990-04-02';
  doc.querySelector(`#${GATE_ID} form`).dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true, bubbles: true }));
  await settle();

  assert.equal(gateIn(doc), null, 'overlay should be gone');
  assert.equal(doc.documentElement.style.overflow, '', 'scroll lock should be released');
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'a POST should have been made');
  assert.equal(JSON.parse(post.body).date_of_birth, '1990-04-02', 'it should carry what was typed');
});

// ⚠ A 200 IS NOT ENOUGH — `ok: true` is the contract. The route answers 503
// `not_persisted` when it could not confirm the row actually holds the date,
// and it answers 403 for a minor. Treating either as saved would drop the
// member back at the gate on the next page with no idea why.
for (const [label, postResp] of [
  ['a 403 for an under-18 date', () => resp(403, { error: 'Shape is for adults 18 and over.', code: 'under_18' })],
  ['a 503 the write could not be confirmed', () => resp(503, { error: 'Could not confirm your date of birth was saved. Try again.', code: 'not_persisted' })],
  ['a 400 for an unparseable date', () => resp(400, { error: 'Enter a real date of birth, as YYYY-MM-DD.', code: 'invalid_date' })],
  ['a 200 that does NOT carry ok:true', () => resp(200, { date_of_birth: null })],
]) {
  test(`keeps the overlay up on: ${label}`, async () => {
    const { doc } = boot({ getResp: () => resp(200, { needed: true }), postResp });
    await settle();
    const input = doc.getElementById(`${GATE_ID}-input`);
    input.value = '2015-01-01';
    doc.querySelector(`#${GATE_ID} form`).dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true, bubbles: true }));
    await settle();

    assert.ok(gateIn(doc), `${label} must not be treated as success`);
    const alert = doc.querySelector(`#${GATE_ID} [role="alert"]`);
    assert.ok(alert && alert.textContent.trim(), 'the member must be told why');
  });
}

test('sign-out delegates to the portal path rather than reimplementing it', async () => {
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  let called = 0;
  win.shapePortalSignOut = () => { called += 1; };
  const out = [...doc.querySelectorAll(`#${GATE_ID} button`)].find((b) => /sign out/i.test(b.textContent));
  assert.ok(out, 'an escape hatch must exist — this overlay is the whole page');
  out.dispatchEvent(new win.Event('click', { bubbles: true }));
  assert.equal(called, 1, 'it must call the canonical sign-out, not roll its own');
});

test('the probe fires once even if DOMContentLoaded arrives twice', async () => {
  // A re-injected tag or a restored page can fire it again. A second run would
  // issue a second probe AND a second scroll-lock capture — and the second
  // capture reads back the 'hidden' this file itself wrote, so releasing it
  // later would restore 'hidden' and leave the portal unscrollable.
  const { doc, win, calls } = boot({ deferReady: true, getResp: () => resp(200, { needed: true }) });
  await settle();
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));
  await settle();

  assert.equal(
    calls.filter((c) => c.method === 'GET').length,
    1,
    'the gate must probe exactly once per page, however often the event fires'
  );
  assert.equal(doc.querySelectorAll(`#${GATE_ID}`).length, 1, 'and mount exactly one overlay');
  assert.equal(doc.documentElement.style.overflow, 'hidden', 'the lock should still be the first capture');
});

// ⚠ aria-modal="true" is a PROMISE that the page behind is unavailable. jsdom does
// not move focus on Tab by itself, which is exactly why these assert what the gate's
// own handler does rather than what a browser would do — the handler IS the trap.
test('Tab cycles inside the gate instead of escaping to the page behind', async () => {
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  // A real control behind the overlay — without the trap this is where Tab off
  // the last gate control lands, in a page aria-modal says does not exist.
  const behind = doc.createElement('button');
  behind.id = 'behind';
  doc.getElementById('page').appendChild(behind);

  const focusables = [...doc.querySelectorAll(`#${GATE_ID} input, #${GATE_ID} button`)];
  assert.ok(focusables.length >= 2, 'the gate should offer a form and an escape hatch');
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  const tab = (shiftKey) => {
    const ev = new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    doc.activeElement.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  last.focus();
  assert.equal(tab(false), true, 'Tab off the last control must be intercepted');
  assert.equal(doc.activeElement, first, 'and wrap to the first, not to the page behind');

  first.focus();
  assert.equal(tab(true), true, 'Shift+Tab off the first control must be intercepted');
  assert.equal(doc.activeElement, last, 'and wrap to the last');
});

test('the trap skips a control that is disabled mid-save', async () => {
  // The submit button disables itself while saving, and a disabled control
  // silently refuses focus — cycling onto it would drop the cycle on the floor.
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  const submit = doc.querySelector(`#${GATE_ID} button[type="submit"]`);
  assert.ok(submit, 'a submit button should exist');
  submit.disabled = true;

  const enabled = [...doc.querySelectorAll(`#${GATE_ID} input, #${GATE_ID} button`)].filter((el) => !el.disabled);
  const last = enabled[enabled.length - 1];
  last.focus();
  const ev = new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  doc.activeElement.dispatchEvent(ev);
  assert.equal(doc.activeElement, enabled[0], 'the cycle must land on an enabled control');
  assert.notEqual(doc.activeElement, submit);
});

// ⚠ THE CONTAINER IS A FOCUS POSITION THE TRAP DID NOT KNOW ABOUT. `wrap` carries
// tabIndex -1 so it is deliberately NOT tab-REACHABLE — which also means the
// focusable query excludes it, so when focus sits ON it, it is neither `first` nor
// `last` and the boundary check matched nothing. Forward Tab was fine (document
// order runs into the dialog's own children), but Shift+Tab ran BACKWARD, out of
// an aria-modal dialog and into the page it tells assistive tech is unavailable.
//
// Reachable two ways, and the second is why the fix keys on the container rather
// than on blocked mode: the blocked panel focuses `wrap` on purpose, and
// tabIndex -1 also makes it CLICK-focusable, so a backdrop click puts focus there
// in the ordinary form state too.
test('Shift+Tab from the dialog container stays inside it', async () => {
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true, blocked: 'no_profile' }) });
  await settle();
  const behind = doc.createElement('button');
  behind.id = 'behind-blocked';
  doc.getElementById('page').appendChild(behind);

  const gate = gateIn(doc);
  gate.focus();
  assert.equal(doc.activeElement, gate, 'the blocked panel starts focus on the container');

  const ev = new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  doc.activeElement.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'Shift+Tab off the container must be intercepted');

  const f = [...gate.querySelectorAll('input, button')];
  assert.equal(doc.activeElement, f[f.length - 1], 'and wrap to the last control inside the gate');
  assert.notEqual(doc.activeElement, behind);
});

test('a backdrop click does not open the same hole in the form state', async () => {
  // Same container, ordinary (non-blocked) gate: tabIndex -1 is click-focusable,
  // so this is where a member's stray click actually lands.
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  const behind = doc.createElement('button');
  behind.id = 'behind-form';
  doc.getElementById('page').appendChild(behind);

  const gate = gateIn(doc);
  gate.focus();
  const ev = new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  doc.activeElement.dispatchEvent(ev);

  assert.equal(ev.defaultPrevented, true, 'the container is a boundary in every state');
  assert.ok(gate.contains(doc.activeElement), 'focus must stay inside the dialog');
  assert.notEqual(doc.activeElement, behind);
});

test('the blocked panel puts focus inside the dialog', async () => {
  // It offers no form, so nothing pulls focus in on its own; without this the
  // first Tab would start behind the overlay.
  const { doc } = boot({ getResp: () => resp(200, { needed: true, blocked: 'no_profile' }) });
  await settle();
  const gate = gateIn(doc);
  assert.ok(gate.contains(doc.activeElement) || doc.activeElement === gate,
    'focus should start inside the dialog');
});

test('the gate mounts once even if the script is evaluated twice', async () => {
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  win.eval(SRC);
  await settle();
  assert.equal(doc.querySelectorAll(`#${GATE_ID}`).length, 1);
});
