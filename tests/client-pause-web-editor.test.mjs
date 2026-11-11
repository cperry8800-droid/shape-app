// The website's break editor (public/newdesign/dashRoster.jsx DashSecPause), mounted in jsdom from the
// shipping code. The client panel keeps its sections mounted when the coach picks another row, so the
// last client's break stayed live while the new one's loaded, and "End the break" ended the new client's
// on the last one's state (Codex on #2705). One editor a client: each starts at Loading….
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');

const src = readFileSync(join(ROOT, 'public/newdesign/dashRoster.jsx'), 'utf8');
const code = babel.transformSync(src, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
const { DashSecPause } = new Function('React', 'window', code + '\nreturn { DashSecPause };')(React, W);

// Two real clients: A away until a week on, B's read still on its way.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const until = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
const asked = [];
const writes = [];
let answerB = null;
W.shapeDb = {
  getClientPause: (id) => {
    asked.push(id);
    if (id === A) return Promise.resolve({ ok: true, ready: true, pause: { until, by: 'member', mine: false } });
    return new Promise((resolve) => { answerB = resolve; });
  },
  setClientPause: async (id, day) => { writes.push([id, day]); return { ok: true }; },
};
const rec = (id) => ({ profile: { id, name: 'Client' } });
const buttons = (host) => [...host.querySelectorAll('button')].map((b) => b.textContent);

test('picking another client starts the break editor over: the last one\'s break is never drawn for the new one (Codex on #2705)', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(DashSecPause, { rec: rec(A) })); });
  assert.ok(host.querySelector('[data-pause-state="away"]'), 'A is away');
  assert.ok(buttons(host).includes('End the break'), 'A is away: the editor offers to end it');
  // The coach picks B's row: the same section, a new client.
  await React.act(async () => { root.render(React.createElement(DashSecPause, { rec: rec(B) })); });
  assert.equal(host.textContent, 'Loading…', 'B\'s break is read first');
  assert.ok(!buttons(host).includes('End the break'), 'no control from A\'s state');
  assert.deepEqual(asked, [A, B]);
  // B has no break: the picker, and nothing written for either.
  await React.act(async () => { answerB({ ok: true, ready: true, pause: null }); });
  assert.ok(host.querySelector('input[type="date"]'), 'B: pick a day');
  assert.ok(!host.querySelector('[data-pause-state="away"]') && !buttons(host).includes('End the break'), 'B is not drawn away');
  assert.deepEqual(writes, []);
  await React.act(async () => { root.unmount(); });
  host.remove();
});
