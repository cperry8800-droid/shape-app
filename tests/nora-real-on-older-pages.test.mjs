// The scripted "Nora" is gone. Pages without React (the older public/*.html pages,
// help.html and login.html among them) open globalChatButton.js's own panel, whose
// Help tab greeted people as Nora and answered from four canned lines; the Next app's
// GlobalChatButton did the same with a hard-coded "24" unread badge. Both now ask the
// real endpoint, and a failure says so and gives the address a person reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUTTON = readFileSync(join(ROOT, 'public/newdesign/globalChatButton.js'), 'utf8');
const DOWN = /I can't be reached right now\. Try again in a moment, or email the Shape team at info@theshapecommunity\.com\./;
const tick = () => new Promise((r) => setTimeout(r, 0));

function page(fetchImpl) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://www.theshapecommunity.com/help.html' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  const calls = [];
  w.fetch = (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return fetchImpl(url, init); };
  w.eval(BUTTON);
  return { w, doc: w.document, calls };
}
const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

async function askHelp(p, text) {
  for (let i = 0; i < 3 && !p.doc.getElementById('shape-global-chat-button'); i++) await new Promise((r) => setTimeout(r, 5));
  p.doc.getElementById('shape-global-chat-button').click();
  const panel = p.doc.getElementById('shape-global-chat-panel');
  assert.ok(panel, 'with no React the self-contained panel opens');
  [...panel.querySelectorAll('.sgc-tab')].find((b) => b.textContent.startsWith('Help')).click();
  const input = panel.querySelector('textarea');
  input.value = text;
  input.dispatchEvent(new p.w.Event('input'));
  panel.querySelector('.sgc-send').click();
  for (let i = 0; i < 5; i++) await tick();
  return panel;
}

test('older pages: the Help tab asks the real Nora and shows her reply', async () => {
  const p = page(() => json(200, { reply: 'A strength coach near you: Maya Okafor.', actions: [{ type: 'coach', label: 'Maya Okafor', url: '/newdesign/TrainerProfile.html?id=1' }] }));
  const panel = await askHelp(p, 'find me a strength coach');
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].url, '/api/support/chat');
  assert.equal(p.calls[0].body.surface, 'web');
  const last = p.calls[0].body.messages.at(-1);
  assert.deepEqual(last, { role: 'user', content: 'find me a strength coach' });
  assert.equal(p.calls[0].body.messages[0].role, 'assistant', "Nora's greeting rides as her own turn");
  const msgs = [...panel.querySelectorAll('.sgc-msg.them')].map((m) => m.textContent);
  assert.equal(msgs.at(-1), 'A strength coach near you: Maya Okafor.');
  const links = [...panel.querySelectorAll('.sgc-quick a')];
  assert.deepEqual(links.map((a) => [a.textContent, a.getAttribute('href')]), [['Maya Okafor', '/newdesign/TrainerProfile.html?id=1']]);
  assert.doesNotMatch(panel.textContent, /teammate will follow up|route this to billing|bring in the Shape team/);
});

test('older pages: a link is a same-site path or nothing', async () => {
  const p = page(() => json(200, { reply: 'ok', actions: [
    { label: 'evil', url: 'javascript:alert(1)' }, { label: 'other', url: 'https://example.com/x' },
    { label: 'proto', url: '//example.com/x' }, { label: '', url: '/newdesign/Pricing.html' }, { label: 'Pricing', url: '/newdesign/Pricing.html' },
  ] }));
  const panel = await askHelp(p, 'billing');
  assert.deepEqual([...panel.querySelectorAll('.sgc-quick a')].map((a) => a.getAttribute('href')), ['/newdesign/Pricing.html']);
});

test('older pages: a failed call or an empty reply says so and gives the address', async () => {
  for (const impl of [() => Promise.reject(new Error('offline')), () => json(500, { error: 'x' }), () => json(200, { reply: '   ' })]) {
    const p = page(impl);
    const panel = await askHelp(p, 'refund');
    const msgs = [...panel.querySelectorAll('.sgc-msg.them')].map((m) => m.textContent);
    assert.match(msgs.at(-1), DOWN);
  }
});

test('older pages: Nora\'s greeting promises nothing', () => {
  assert.doesNotMatch(BUTTON, /bring in the Shape team|teammate will follow up|route this to billing/);
});

// ── the Next app's button ────────────────────────────────────────────────────────
const nextBtn = await loadRealModule(join(ROOT, 'src/components/GlobalChatButton.tsx'), {
  typescript: true,
  registry: new Map([['react', { useState: () => [] }], ['next/navigation', { usePathname: () => '/dashboard' }]]),
});

test('Next app: askNora posts the conversation and returns her reply with safe links', async () => {
  const seen = [];
  const r = await nextBtn.askNora([{ from: 'shape', text: 'Hi' }, { from: 'you', text: 'pricing?' }], (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return json(200, { reply: '$5 a month.', actions: [{ label: 'Pricing', url: '/newdesign/Pricing.html' }, { label: 'x', url: 'https://evil.example' }] }); });
  assert.equal(seen[0].url, '/api/support/chat');
  assert.deepEqual(seen[0].body, { surface: 'web', messages: [{ role: 'assistant', content: 'Hi' }, { role: 'user', content: 'pricing?' }] });
  assert.deepEqual(r, { reply: '$5 a month.', links: [{ label: 'Pricing', url: '/newdesign/Pricing.html' }] });
  const down = await nextBtn.askNora([{ from: 'you', text: 'x' }], () => Promise.reject(new Error('offline')));
  assert.match(down.reply, DOWN);
  const empty = await nextBtn.askNora([{ from: 'you', text: 'x' }], () => json(503, {}));
  assert.match(empty.reply, DOWN);
});

test('Next app: no scripted replies and no invented unread count', () => {
  const src = readFileSync(join(ROOT, 'src/components/GlobalChatButton.tsx'), 'utf8');
  assert.doesNotMatch(src, /function replyFor|teammate can follow up|route this to billing/);
  assert.doesNotMatch(src, />\s*24\s*</, 'no hard-coded unread badge');
});
