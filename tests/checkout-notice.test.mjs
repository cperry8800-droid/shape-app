// A checkout that didn't start says why (pageShell.jsx, "Checkout notices").
//
// /purchase, /subscribe and the membership detour send the visitor back to the coach's profile
// with `&error=<code>`; Stripe's Cancel and the membership checkout's Cancel come back the same
// way. No page read the code. These tests run the shell's own notice code against a small fake
// page, and hold every code the server sends to a line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SHELL = read('public/newdesign/pageShell.jsx');
const from = SHELL.indexOf('const SHAPE_CHECKOUT_FAILED');
const to = SHELL.indexOf('// ── Per-day key garbage collection');
assert.ok(from > 0 && to > from, 'the checkout notices moved in pageShell.jsx');
const SECTION = SHELL.slice(from, to);

function el(tag) {
  return {
    tag, attrs: {}, children: [], style: { cssText: '' }, textContent: '', parentNode: null, onclick: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
  };
}

// Runs the section on a page at `search`; returns what it put on the page and in the address.
function page(search, { path = '/newdesign/MemberProfile.html', hash = '' } = {}) {
  const body = el('body');
  const listeners = {};
  const replaced = [];
  const document = {
    readyState: 'complete', body,
    createElement: el,
    getElementById: (id) => body.children.find((c) => c.id === id) || null,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; },
  };
  const location = { pathname: path, search, hash };
  const history = { state: null, replaceState: (s, t, url) => replaced.push(url) };
  const api = new Function('document', 'location', 'history',
    SECTION + '\nreturn { shapeCheckoutNotice, shapeQueryWithout, SHAPE_CHECKOUT_FAILED };')(document, location, history);
  const box = body.children[0] || null;
  const textOf = (b) => b && b.children[0].children.map((c) => c.textContent).join(' | ');
  return { api, body, box, text: textOf(box), replaced, listeners };
}

const { api: A } = page('');

test('the suite is running the shipped code', () => {
  assert.equal(typeof A.shapeCheckoutNotice, 'function');
  assert.equal(A.shapeCheckoutNotice('purchase_cancelled').tone, 'info');
});

// ── every code the server sends back has a line ─────────────────────────────
function sentCodes() {
  const codes = new Set();
  const sources = ['src/app/purchase/actions.ts', 'src/app/subscribe/actions.ts', 'src/lib/membership-detour.ts', 'src/app/api/stripe/platform-checkout/route.ts'];
  for (const f of sources) {
    const src = read(f);
    // Back to a page the shell renders: the coach's profile (backHref), Marketplace or Pricing.
    // `/?error=` and `/dashboard?error=` go to pages without it (and `/` carries no error on).
    for (const m of src.matchAll(/(?:&|(?:Marketplace|Pricing)\.html\?)error=([a-z_]+)/g)) codes.add(m[1]);
    // A code chosen inline: `&error=${x === 'a' ? 'a' : 'b'}`.
    for (const m of src.matchAll(/&error=\$\{[^}]* \? '([a-z_]+)' : '([a-z_]+)'\}/g)) { codes.add(m[1]); codes.add(m[2]); }
  }
  // subscribe's getProviderConnectInfo returns its refusals as `{ error: '…' }`, sent on as the code.
  for (const m of read('src/app/subscribe/actions.ts').matchAll(/return \{ error: '([a-z_]+)' \}/g)) codes.add(m[1]);
  for (const m of read('src/app/subscribe/actions.ts').matchAll(/\? '([a-z_]+)' : '([a-z_]+)' \}/g)) { codes.add(m[1]); codes.add(m[2]); }
  // `&error=${found.reason}`: a CodeRefusal.
  const refusal = /export type CodeRefusal = ([^;]+);/.exec(read('src/lib/coach-checkout.ts'));
  assert.ok(refusal, 'CodeRefusal moved');
  for (const q of refusal[1].matchAll(/'([a-z_]+)'/g)) codes.add(q[1]);
  return codes;
}

test('every error code the checkout returns with has a line', () => {
  const codes = sentCodes();
  // Vacuity: the scan has to be reading the actions.
  for (const known of ['purchase_cancelled', 'subscribe_cancelled', 'membership_cancelled', 'invalid_purchase', 'invalid_subscribe', 'provider_at_capacity', 'code_invalid', 'stripe_not_onboarded', 'membership_check_failed', 'checkout_in_progress']) {
    assert.ok(codes.has(known), 'the scan no longer finds ' + known);
  }
  const missing = [...codes].filter((c) => !A.shapeCheckoutNotice(c));
  assert.deepEqual(missing, [], 'codes sent back with no line: ' + missing.join(', '));
});

test('no checkout comes back where nothing reads its code', () => {
  // ⚠ /purchase and /subscribe sent a form missing its coach to `/?error=invalid_…`, and the root
  // redirect carries no error on (carriedQuery), so the visitor landed on the homepage hearing
  // nothing. They go to Marketplace, which the shell renders. And the membership detour's own
  // Cancel came back to the profile with no code, so it said nothing.
  for (const f of ['src/app/purchase/actions.ts', 'src/app/subscribe/actions.ts', 'src/lib/membership-detour.ts']) {
    assert.doesNotMatch(read(f), /redirect\(['`]\/\?error=/, f);
  }
  assert.match(read('src/app/purchase/actions.ts'), /redirect\('\/newdesign\/Marketplace\.html\?error=invalid_purchase'\)/);
  assert.match(read('src/app/subscribe/actions.ts'), /redirect\('\/newdesign\/Marketplace\.html\?error=invalid_subscribe'\)/);
  assert.match(read('src/lib/membership-detour.ts'), /cancelPath: `\$\{backHref\}&error=membership_cancelled`/);
  const p = page('?error=invalid_purchase', { path: '/newdesign/Marketplace.html' });
  assert.equal(p.box && p.box.attrs.role, 'alert');
  assert.match(p.text, /didn't start\. Nothing was charged\. Choose the coach again\./);
  assert.deepEqual(p.replaced, ['/newdesign/Marketplace.html']);
  const back = page('?u=abc&role=trainer&error=membership_cancelled');
  assert.equal(back.box && back.box.attrs.role, 'status');
  assert.match(back.text, /Membership checkout cancelled, so coaching didn't start\. Nothing was charged\./);
  assert.deepEqual(back.replaced, ['/newdesign/MemberProfile.html?u=abc&role=trainer']);
});

test('where another checkout may be open or paid, the line never says nothing was charged', () => {
  // ⚠ Codex on #2522, twice. Every other line's "Nothing was charged" is about the attempt that just
  // came back, which handed out no payable checkout. These two come while another may exist:
  // - payment_pending: a recent checkout on the coach's former account that Shape can't read
  //   (checkout-barrier.ts, `unverified`), so it may have gone through.
  // - checkout_in_progress: the claim can stay held for up to 60 seconds after the request that
  //   won it sent the member to Stripe (a failed release), so that checkout may be open or paid.
  for (const [code, says] of [['payment_pending', /receipt before paying again/], ['checkout_in_progress', /receipt before trying again/]]) {
    const n = A.shapeCheckoutNotice(code);
    assert.ok(n, code + ' has no line');
    assert.doesNotMatch(n.text, /nothing (new )?was charged/i, code);
    assert.match(n.text, says, code);
  }
  // The senders still mean that.
  assert.match(read('src/app/subscribe/actions.ts'), /if \(retired\.unverified\) redirect\(`\$\{backHref\}&error=payment_pending`\)/);
  assert.match(read('src/lib/checkout-barrier.ts'), /the claim lapses in 60 seconds/);
});

test('a database or Stripe failure shows the plain line, never its own message', () => {
  for (const raw of ['stripe: No such price: price_123', 'stripe_setup: Invalid API Key provided', 'db_PGRST116: JSON object requested, multiple rows returned', 'db_error: boom']) {
    const n = A.shapeCheckoutNotice(raw);
    assert.equal(n && n.text, A.SHAPE_CHECKOUT_FAILED, raw);
  }
  const p = page('?u=abc&role=trainer&error=' + encodeURIComponent('stripe: No such price: price_123'));
  assert.ok(p.box, 'nothing shown');
  assert.ok(!/price_123|No such price/.test(p.text), 'the Stripe message reached the page: ' + p.text);
});

test('only the checkout codes are read', () => {
  for (const other of ['access_denied', 'server_error', 'invalid_request', 'constructor', '__proto__', 'toString', '', null, undefined]) {
    assert.equal(A.shapeCheckoutNotice(other), null, String(other));
  }
});

// ── on the page ──────────────────────────────────────────────────────────────
test('Stripe\'s Cancel back to the profile says nothing was charged, once', () => {
  const p = page('?u=0f3c&role=trainer&error=purchase_cancelled');
  assert.ok(p.box, 'nothing shown');
  assert.equal(p.box.attrs.role, 'status');
  assert.match(p.text, /Checkout cancelled\. Nothing was charged\./);
  // The code leaves the address and nothing else does, so a reload doesn't show it again.
  assert.deepEqual(p.replaced, ['/newdesign/MemberProfile.html?u=0f3c&role=trainer']);
});

test('a refusal is an alert, and the other parameters keep their encoding', () => {
  const p = page('?name=Jane%20Doe&role=nutritionist&error=code_not_here', { hash: '#reviews' });
  assert.equal(p.box.attrs.role, 'alert');
  assert.match(p.text, /can't be used with this coach/);
  assert.deepEqual(p.replaced, ['/newdesign/MemberProfile.html?name=Jane%20Doe&role=nutritionist#reviews']);
  const first = page('?error=provider_at_capacity&role=trainer', { path: '/newdesign/Marketplace.html' });
  assert.deepEqual(first.replaced, ['/newdesign/Marketplace.html?role=trainer']);
  const only = page('?error=subscribe_cancelled', { path: '/newdesign/Pricing.html' });
  assert.deepEqual(only.replaced, ['/newdesign/Pricing.html']);
});

test('any other error is left on the page and in the address', () => {
  for (const q of ['?error=access_denied&error_description=x', '?u=1', '']) {
    const p = page(q);
    assert.equal(p.box, null, q);
    assert.deepEqual(p.replaced, [], q);
  }
});

test('the notice dismisses with its × or Escape', () => {
  const tap = page('?u=1&error=code_invalid');
  const close = tap.box.children[1];
  assert.equal(close.attrs['aria-label'], 'Dismiss');
  assert.match(close.style.cssText, /width:44px;height:44px/);
  close.onclick();
  assert.equal(tap.body.children.length, 0);
  assert.equal(tap.listeners.keydown, undefined, 'the Escape listener outlived the notice');

  const esc = page('?u=1&error=code_invalid');
  esc.listeners.keydown({ key: 'Enter' });
  assert.equal(esc.body.children.length, 1);
  esc.listeners.keydown({ key: 'Escape' });
  assert.equal(esc.body.children.length, 0);
});

test('it sits under the drawer and over every page layer', () => {
  const p = page('?error=checkout_failed');
  const z = Number((/z-index:(\d+)/.exec(p.box.style.cssText) || [])[1]);
  const drawer = Number((/aria-modal="true" aria-label="Menu"[\s\S]{0,200}?zIndex: (\d+)/.exec(SHELL) || [])[1]);
  assert.ok(Number.isFinite(drawer), 'could not read the drawer\'s zIndex');
  assert.ok(z > 3000 && z < drawer, 'z ' + z + ' against the drawer\'s ' + drawer);
});
