// The website's pieces of the coach money record (2026-11-05), MOUNTED as they ship:
//   · Settings' Payouts card (public/newdesign/coachSettings.jsx CoachPayoutsCard), from /api/coach/money:
//     what the coach collected this month, the next payout from their own schedule, the balance;
//   · the Me page's cancel step (public/newdesign/clientMeSettings.jsx CancelPlanDialog): one optional
//     question in the member's own words, then POST /api/stripe/cancel-plan; the question never blocks it.
// Each page is a babel-in-the-browser script, compiled here and evaluated against a JSDOM window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { JSDOM } = require('jsdom');
// ⚠ A WINDOW BEFORE react-dom LOADS: it decides at load time whether the DOM has `input` events, and
// without one it listens for IE's propertychange instead, so typing in a box never reached onChange.
const base = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/' });
globalThis.window = base.window;
globalThis.document = base.window.document;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const CF = require(join(ROOT, 'public/newdesign/coachForecast.js'));
const compile = (f) => babel.transformSync(readFileSync(join(ROOT, f), 'utf8'), { presets: [presetReact], babelrc: false, configFile: false }).code;
const SETTINGS_CODE = compile('public/newdesign/coachSettings.jsx');
const ME_CODE = compile('public/newdesign/clientMeSettings.jsx');
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function mountWith(code, name, props, respond) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#settings' });
  const keep = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.CoachForecast = CF;
  const calls = [];
  const fetch = async (url, init = {}) => { calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null }); return respond(url, init.method || 'GET'); };
  const Comp = new Function('React', 'window', 'fetch', 'document', code + `;return ${name};`)(React, dom.window, fetch, dom.window.document);
  const root = createRoot(dom.window.document.getElementById('root'));
  const doc = dom.window.document;
  const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => root.render(React.createElement(Comp, props)));
  await settle();
  const button = (re) => [...doc.querySelectorAll('button')].find((b) => re.test(b.textContent));
  return {
    calls, doc, settle,
    text: () => doc.body.textContent.replace(/\s+/g, ' '),
    click: async (re) => { const b = button(re); assert.ok(b, 'no button ' + re); await act(async () => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); await settle(); },
    type: async (el, v) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      await settle();
    },
    close: async () => {
      await act(async () => root.unmount());
      dom.window.close();
      globalThis.window = keep.window; globalThis.document = keep.document; globalThis.IS_REACT_ACT_ENVIRONMENT = keep.act;
    },
  };
}

const EARNINGS = {
  state: 'ready', zone: 'America/New_York', currency: 'usd', otherCurrency: 0,
  month: { from: '2026-11-01', to: '2026-11-04', grossCents: 36000, feeCents: 2700, netCents: 33300, refundedCents: 0, payments: 2 },
  lifetime: { since: '2026-06-02T15:00:00.000Z', grossCents: 180000, feeCents: 13500, netCents: 166500, refundedCents: 0, payments: 10 },
};

test('Settings › Payouts: collected this month in the coach\'s zone, the next payout from their schedule, the whole balance said as such', async () => {
  const stripe = { connected: true, balanceCents: 5200, pendingCents: 0, payouts: [], schedule: { interval: 'daily', delayDays: 2 } };
  const m = await mountWith(SETTINGS_CODE, 'CoachPayoutsCard', { role: 'trainer' }, () => reply(200, { isCoach: true, role: 'trainer', providerId: 7, earnings: EARNINGS, stripe }));
  try {
    assert.deepEqual(m.calls.map((c) => c.url), ['/api/coach/money?role=trainer']);
    assert.match(m.text(), /This month · collectedNov 1–Nov 4 · after Shape's fee\$333/);
    assert.match(m.text(), /Next payouteach payment clears 2 days after it is chargedDaily/);
    assert.match(m.text(), /Balance · ready to pay outyour whole Stripe balance, other business included\$52/);
  } finally { await m.close(); }
  // Not recorded yet, not linked, a failed read: each said, none of them $0.
  const early = await mountWith(SETTINGS_CODE, 'CoachPayoutsCard', { role: 'trainer' }, () => reply(200, { isCoach: true, earnings: { state: 'not_set_up' }, stripe: { connected: false } }));
  try {
    assert.match(early.text(), /This month · collectedshows once Shape's payment record is switched on—/);
    assert.match(early.text(), /Stripenot linked yet/);
  } finally { await early.close(); }
  const failed = await mountWith(SETTINGS_CODE, 'CoachPayoutsCard', { role: 'nutritionist' }, () => reply(503, { error: 'x' }));
  try {
    assert.deepEqual(failed.calls.map((c) => c.url), ['/api/coach/money?role=nutritionist']);
    assert.match(failed.text(), /Couldn't read your payouts just now/);
  } finally { await failed.close(); }
});

const PLAN = { subscriptionId: '77777777-7777-4777-8777-777777777777', providerRole: 'trainer', providerId: 4, name: 'Maya Okafor', renewsAt: '2026-11-30T12:00:00.000Z', ending: false };

test('Me › cancel: one optional question, who reads it, and the plan cancelled at the period\'s end', async () => {
  const done = [];
  const m = await mountWith(ME_CODE, 'CancelPlanDialog', { plan: PLAN, onClose: () => {}, onDone: (e) => done.push(e) }, () => reply(200, { ok: true, endsAt: '2026-11-30T12:00:00.000Z', reasonSaved: true }));
  try {
    assert.match(m.text(), /Cancel your plan with Maya Okafor\?/);
    assert.match(m.text(), /Why are you leaving\? \(optional\)/);
    assert.match(m.text(), /Only Maya Okafor and Shape will read this\./);
    const box = m.doc.querySelector('textarea');
    assert.equal(box.getAttribute('maxlength'), '500');
    await m.type(box, '  Budget. Back in the fall. ');
    await m.click(/^Cancel plan$/);
    assert.deepEqual(m.calls.map((c) => [c.url, c.method, c.body]), [['/api/stripe/cancel-plan', 'POST', { subscriptionId: PLAN.subscriptionId, reason: 'Budget. Back in the fall.' }]]);
    assert.deepEqual(done, ['2026-11-30T12:00:00.000Z']);
  } finally { await m.close(); }
  // No answer cancels too; a failure changes nothing and says the server's words.
  const quiet = await mountWith(ME_CODE, 'CancelPlanDialog', { plan: PLAN, onClose: () => {}, onDone: () => {} }, () => reply(200, { ok: true, endsAt: null }));
  try {
    await quiet.click(/^Cancel plan$/);
    assert.equal(quiet.calls[0].body.reason, undefined);
  } finally { await quiet.close(); }
  const off = await mountWith(ME_CODE, 'CancelPlanDialog', { plan: PLAN, onClose: () => {}, onDone: () => { throw new Error('not done'); } }, () => reply(409, { reason: 'coach_disconnected', error: 'Contact Shape support.' }));
  try {
    await off.click(/^Cancel plan$/);
    assert.match(off.text(), /Contact Shape support\./);
  } finally { await off.close(); }
});

test('Me › the plans list reads the cancel step\'s plans, and a plan that already ends offers no Cancel', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/clientMeSettings.jsx'), 'utf8');
  assert.match(src, /j\("\/api\/stripe\/cancel-plan"\)\.then\(d => setPlans\(/);
  assert.match(src, /action=\{p\.ending \? undefined : "CANCEL"\} onAction=\{p\.ending \? undefined : \(\) => setCancelling\(p\)\}/);
});
