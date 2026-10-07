// Picking Nora in site search opens her on the first click. __openChat exists only
// once the chat has mounted, which on the homepage and both coach dashboards is the
// first click on the chat button; until then the Nora hit navigated to Community.html.
// The launcher's __openChatTo stashes the request and boots the chat, so search uses it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH = readFileSync(join(ROOT, 'public/newdesign/siteSearch.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickNora(setup) {
  const dom = new JSDOM('<!doctype html><body><button class="nav-search">Search</button></body>', { runScripts: 'outside-only', url: 'https://www.theshapecommunity.com/newdesign/index.html' });
  const w = dom.window;
  w.shapeDb = { client: { rpc: () => Promise.resolve({ data: [], error: null }), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } };
  const seen = setup(w);
  w.eval(SEARCH);
  await wait(10); // wire() runs on DOMContentLoaded
  w.document.querySelector('.nav-search').click();
  const input = w.document.querySelector('input');
  input.value = 'nora';
  input.dispatchEvent(new w.Event('input'));
  await wait(320);
  const hit = w.document.querySelector('.ss-nora');
  assert.ok(hit, 'the Nora hit is shown');
  hit.click();
  return { seen, href: w.location.href };
}

test('search: before the chat has mounted, the Nora hit boots it and opens her', async () => {
  const { seen, href } = await pickNora((w) => { const s = []; w.__openChatTo = (o) => s.push(o); return s; });
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [{ who: 'Nora', tab: 'support' }]);
  assert.equal(href, 'https://www.theshapecommunity.com/newdesign/index.html', 'the page does not navigate away');
});

test('search: once the chat has mounted, the Nora hit opens her directly', async () => {
  const { seen } = await pickNora((w) => { const s = []; w.__openChat = (...a) => s.push(a); w.__openChatTo = () => s.push('boot'); return s; });
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [['Nora', 'support']]);
});

test('the React search (pageShell.jsx) takes the same path', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/pageShell.jsx'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('const openNora = '));
  assert.match(line, /else if \(window\.__openChatTo\) window\.__openChatTo\(\{ who: "Nora", tab: "support" \}\);/);
  assert.ok(line.indexOf('__openChatTo') < line.indexOf('Community.html'), 'Community is the last resort');
});

// ⚠ WITH THE REAL LAUNCHER, ON A PAGE WITHOUT REACT (contact.html, help.html,
// privacy.html …). __openChatTo there falls back to globalChatButton.js's own panel,
// which ignored the request and opened on its first tab (Codex, #2240). Not a stub.
test('search on a page without React: the real launcher opens its panel on Nora', async () => {
  const BUTTON = readFileSync(join(ROOT, 'public/newdesign/globalChatButton.js'), 'utf8');
  const { seen, href } = await pickNora((w) => { w.matchMedia = () => ({ matches: false }); w.eval(BUTTON); return w; });
  const panel = seen.document.getElementById('shape-global-chat-panel');
  assert.ok(panel && panel.classList.contains('open'), 'the fallback panel opened');
  assert.equal(panel.querySelector('.sgc-tab.active').textContent, 'Help');
  assert.equal(panel.querySelector('.sgc-title').textContent, 'Nora');
  assert.equal(seen.__openChatRequest, undefined, 'the request is consumed');
  assert.equal(href, 'https://www.theshapecommunity.com/newdesign/index.html');
});
