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
  assert.equal(p.calls[0].body.confirmCards, false, 'this panel cannot show a confirm card, so it asks for none');
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
  registry: new Map([['react', { useState: () => [] }], ['next/navigation', { usePathname: () => '/dashboard' }], ['@/components/Turnstile', { solveTurnstile: async () => '' }]]),
});

test('Next app: askNora posts the conversation and returns her reply with safe links', async () => {
  const seen = [];
  const r = await nextBtn.askNora([{ from: 'shape', text: 'Hi' }, { from: 'you', text: 'pricing?' }], (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return json(200, { reply: '$5 a month.', actions: [{ label: 'Pricing', url: '/newdesign/Pricing.html' }, { label: 'x', url: 'https://evil.example' }] }); });
  assert.equal(seen[0].url, '/api/support/chat');
  assert.deepEqual(seen[0].body, { surface: 'web', confirmCards: false, messages: [{ role: 'assistant', content: 'Hi' }, { role: 'user', content: 'pricing?' }] });
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

// ── The visitor's bot check (2026-10-07) ─────────────────────────────────────────
const CHECK = { error: 'check', reply: "One quick check that you're a person, then I'll answer.", needsCheck: true };

test('older pages: a visitor\'s first question solves the bot check once and asks again with the token', async () => {
  let n = 0;
  const p = page(() => (++n === 1 ? json(403, CHECK) : json(200, { reply: 'Shape is $5 a month.' })));
  p.w.ShapeTurnstile = { solve: () => Promise.resolve('tok-1') };
  const panel = await askHelp(p, 'pricing?');
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(p.calls.length, 2);
  assert.equal(p.calls[0].body.turnstileToken, undefined);
  assert.equal(p.calls[1].body.turnstileToken, 'tok-1');
  assert.equal([...panel.querySelectorAll('.sgc-msg.them')].at(-1).textContent, 'Shape is $5 a month.');
});

test('older pages: an unsolved check says so instead of claiming Nora is down', async () => {
  const p = page(() => json(403, CHECK));
  p.w.ShapeTurnstile = { solve: () => Promise.resolve('') };
  const panel = await askHelp(p, 'pricing?');
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(p.calls.length, 1, 'no token, no second ask');
  assert.match([...panel.querySelectorAll('.sgc-msg.them')].at(-1).textContent, /quick check/);
});

test('Next app: askNora solves the check once and retries with the token', async () => {
  const seen = [];
  const r = await nextBtn.askNora([{ from: 'you', text: 'hi' }], (url, init) => {
    seen.push(JSON.parse(init.body));
    return seen.length === 1 ? json(403, CHECK) : json(200, { reply: 'Hello.' });
  }, async () => 'tok-2');
  assert.equal(seen.length, 2);
  assert.equal(seen[1].turnstileToken, 'tok-2');
  assert.equal(r.reply, 'Hello.');
  const unsolved = await nextBtn.askNora([{ from: 'you', text: 'hi' }], () => json(403, CHECK), async () => '');
  assert.match(unsolved.reply, /quick check/);
});

test('the rich chat widget retries a checked question with a solved token', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');
  assert.match(src, /res\.status === 403 && data && data\.needsCheck/);
  assert.match(src, /window\.ShapeTurnstile\.solve\(\)/);
  assert.match(src, /ask\(\{ turnstileToken: token \}\)/);
});
