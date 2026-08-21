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
function boot({ getResp, postResp } = {}) {
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

test('the gate mounts once even if the script is evaluated twice', async () => {
  const { doc, win } = boot({ getResp: () => resp(200, { needed: true }) });
  await settle();
  win.eval(SRC);
  await settle();
  assert.equal(doc.querySelectorAll(`#${GATE_ID}`).length, 1);
});
