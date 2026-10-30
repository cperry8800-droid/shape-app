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

function page(fetchImpl, greet = () => json(404, {})) {
  const gets = [];
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://www.theshapecommunity.com/help.html' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  const calls = [];
  // What is kept on the account (POST /api/nora/thread) after an answer, apart from the questions.
  const kept = [];
  const keptAs = [];
  // The panel's greeting is a GET on open; the questions are the POSTs this harness reads.
  w.fetch = (url, init) => {
    if (!init || init.method !== 'POST') { gets.push(url); return greet(url); }
    if (url === '/api/nora/thread') { const b = JSON.parse(init.body); kept.push(b.append); keptAs.push(b.account); return json(200, { ok: true }); }
    calls.push({ url, body: JSON.parse(init.body) }); return fetchImpl(url, init);
  };
  w.eval(BUTTON);
  return { w, doc: w.document, calls, gets, kept, keptAs };
}
const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

async function askHelp(p, text) {
  for (let i = 0; i < 3 && !p.doc.getElementById('shape-global-chat-button'); i++) await new Promise((r) => setTimeout(r, 5));
  // The corner's "✦ Ask Nora" half (the split, 2026-10-07) opens her thread directly.
  p.doc.querySelector('#shape-global-chat-button .sgc-nora').click();
  const panel = p.doc.getElementById('shape-global-chat-panel');
  assert.ok(panel, 'with no React the self-contained panel opens');
  assert.equal(panel.querySelector('.sgc-title').textContent, 'Nora');
  const input = panel.querySelector('textarea');
  input.value = text;
  input.dispatchEvent(new p.w.Event('input'));
  panel.querySelector('.sgc-send').click();
  for (let i = 0; i < 5; i++) await tick();
  return panel;
}

test('older pages: the Help tab asks the real Nora and shows her reply', async () => {
  const p = page(() => json(200, { reply: 'A strength coach near you: Maya Okafor.', actions: [{ type: 'coach', label: 'Maya Okafor', url: '/newdesign/TrainerProfile.html?id=1' }], account: 'u1' }));
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
  assert.deepEqual(p.kept.map((a) => a.map((m) => [m.role, m.text])), [[['user', 'find me a strength coach'], ['assistant', 'A strength coach near you: Maya Okafor.']]], 'the answered exchange is kept on the account');
  assert.deepEqual(p.keptAs, ['u1'], 'as the account she answered (Codex on #2393)');
});

test('older pages: a visitor\'s answer names no account, and nothing is kept', async () => {
  const p = page(() => json(200, { reply: 'Shape is $5 a month.', account: null }));
  await askHelp(p, 'pricing?');
  assert.deepEqual(p.kept, []);
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
    assert.deepEqual(p.kept, [], '"can\'t be reached" is not kept');
  }
});

test('older pages: Nora\'s greeting promises nothing', () => {
  assert.doesNotMatch(BUTTON, /bring in the Shape team|teammate will follow up|route this to billing/);
});

// ── the Next app's button ────────────────────────────────────────────────────────
const nextBtn = await loadRealModule(join(ROOT, 'src/components/GlobalChatButton.tsx'), {
  typescript: true,
  registry: new Map([['react', { useState: () => [], useEffect: () => {}, useRef: () => ({ current: null }) }], ['next/navigation', { usePathname: () => '/dashboard' }], ['@/components/Turnstile', { solveTurnstile: async () => '' }]]),
});

test('Next app: askNora posts the conversation and returns her reply with safe links', async () => {
  const seen = [];
  const r = await nextBtn.askNora([{ from: 'shape', text: 'Hi' }, { from: 'you', text: 'pricing?' }], (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return json(200, { reply: '$5 a month.', actions: [{ label: 'Pricing', url: '/newdesign/Pricing.html' }, { label: 'x', url: 'https://evil.example' }], account: 'u1' }); });
  assert.equal(seen[0].url, '/api/support/chat');
  assert.deepEqual(seen[0].body, { surface: 'web', confirmCards: false, messages: [{ role: 'assistant', content: 'Hi' }, { role: 'user', content: 'pricing?' }] });
  assert.deepEqual(r, { reply: '$5 a month.', links: [{ label: 'Pricing', url: '/newdesign/Pricing.html' }], account: 'u1' }, 'with who she answered as');
  const down = await nextBtn.askNora([{ from: 'you', text: 'x' }], () => Promise.reject(new Error('offline')));
  assert.match(down.reply, DOWN);
  const empty = await nextBtn.askNora([{ from: 'you', text: 'x' }], () => json(503, {}));
  assert.match(empty.reply, DOWN);
});

test('an answered exchange is kept on the account, from the Next app\'s button and the older pages\' panel (the trace, 2026-10-17)', () => {
  const seen = [];
  nextBtn.keepNoraExchange('pricing?', '$5 a month.', 'u1', (url, init) => { seen.push({ url, init }); return Promise.resolve({ ok: true }); });
  assert.equal(seen.length, 1);
  assert.equal(JSON.parse(seen[0].init.body).account, 'u1', 'named for the account she answered: a cookie that changed since keeps nothing (Codex on #2393)');
  nextBtn.keepNoraExchange('pricing?', '$5 a month.', null, (url, init) => { seen.push({ url, init }); return Promise.resolve({ ok: true }); });
  assert.equal(seen.length, 1, 'a visitor\'s answer names no account: nothing is kept');
  assert.equal(seen[0].url, '/api/nora/thread');
  assert.deepEqual([seen[0].init.method, seen[0].init.credentials], ['POST', 'same-origin'], 'the account\'s own cookie: a visitor\'s answers 401');
  assert.deepEqual(JSON.parse(seen[0].init.body).append.map((m) => [m.role, m.text]), [['user', 'pricing?'], ['assistant', '$5 a month.']]);
  assert.doesNotThrow(() => nextBtn.keepNoraExchange('q', 'a', 'u1', () => Promise.reject(new Error('offline'))), 'a failure is silent');
  const src = readFileSync(join(ROOT, 'src/components/GlobalChatButton.tsx'), 'utf8');
  assert.match(src, /const \{ reply, links, account, refused \} = await askNora\(next, fetch, solveTurnstile, accountRef\.current\);/);
  assert.match(src, /if \(reply !== NORA_DOWN\) keepNoraExchange\(value, reply, account\);/, 'only an answer is kept');
  assert.match(BUTTON, /if \(r\.reply !== NORA_DOWN\) keepNoraExchange\(value, r\.reply, r\.account\);/);
  assert.match(BUTTON, /window\.fetch\("\/api\/nora\/thread", \{\n\s+method: "POST", credentials: "same-origin"/);
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
  assert.match(src, /const token = solve \? await solve\(\) : "";/);
  assert.match(src, /ask\(\{ turnstileToken: token \}\)/);
});

test('⚠ the solver is on every page with Nora, not only the ones that load supabase.js', async () => {
  // A marketing page: no ShapeTurnstile. The button script's own solver loads Turnstile.
  const p = page(() => json(403, CHECK));
  assert.equal(typeof p.w.__shapeNoraSolve, 'function');
  assert.equal(p.w.ShapeTurnstile, undefined);
  let rendered = null;
  p.w.turnstile = { render: (el, opts) => { rendered = opts; setTimeout(() => opts.callback('tok-3'), 0); return 'w1'; }, remove: () => {} };
  const tok = await p.w.__shapeNoraSolve();
  assert.equal(tok, 'tok-3');
  assert.equal(rendered.appearance, 'interaction-only');
  assert.equal(rendered.sitekey, '0x4AAAAAADmrGKVw7Ghzs1gQ');
  assert.ok(!p.doc.querySelector('[data-nora-check]'), 'the widget is removed once it answers');
  const widget = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');
  assert.match(widget, /window\.__shapeNoraSolve \|\| \(window\.ShapeTurnstile && window\.ShapeTurnstile\.solve\)/);
});

test('the app, which cannot earn a website token, says where to ask instead of failing', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  assert.match(src, /if \(res\.status === 403 && payload && payload\.needsCheck\) \{\n\s+return \{ reply: 'Sign in to ask Nora in the app\./);
});

test('older pages: Nora opens with the account\'s greeting and suggestions, and a suggestion asks Nora', async () => {
  const p = page(() => json(200, { reply: 'Here is your day.' }), () => json(200, { kind: 'member', text: 'Hi, I\'m Nora. Member greeting.', quick: ["What's on today?", 'How was my week?', 'Find me a coach', 'How do I cancel or change my plan?'] }));
  for (let i = 0; i < 3 && !p.doc.getElementById('shape-global-chat-button'); i++) await new Promise((r) => setTimeout(r, 5));
  p.doc.querySelector('#shape-global-chat-button .sgc-nora').click();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(p.gets, ['/api/support/chat?plain=1']);
  const panel = p.doc.getElementById('shape-global-chat-panel');
  assert.match(panel.textContent, /Member greeting\./);
  const chips = [...panel.querySelectorAll('.sgc-quick button')].map((b) => b.textContent);
  assert.deepEqual(chips, ["What's on today?", 'How was my week?', 'Find me a coach', 'How do I cancel or change my plan?']);
  panel.querySelectorAll('.sgc-quick button')[0].click();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(p.calls.at(-1).body.messages.at(-1), { role: 'user', content: "What's on today?" });
  assert.equal(p.calls.at(-1).body.messages[0].content, "Hi, I'm Nora. Member greeting.", 'the greeting shown is the one Nora is told she said');
});

// ── the split: "✦ Ask Nora | Chat" (owner, 2026-10-07, option A) ────────────────
test('the corner is one split object: the Nora half first, then Chat, under the old id', async () => {
  const p = page(() => json(200, { reply: 'ok' }));
  for (let i = 0; i < 3 && !p.doc.getElementById('shape-global-chat-button'); i++) await new Promise((r) => setTimeout(r, 5));
  const dock = p.doc.getElementById('shape-global-chat-button');
  assert.equal(dock.getAttribute('role'), 'group');
  assert.deepEqual([...dock.querySelectorAll('.sgc-half')].map((b) => b.getAttribute('aria-label')), ['Ask Nora', 'Open Shape chat']);
  assert.ok(dock.querySelector('.sgc-chat .shape-global-chat-count'), 'the unread badge rides on Chat');
});

test('Chat (its half, or a page\'s own .click() on the old id) opens with no Nora tab', async () => {
  for (const how of ['half', 'element']) {
    const p = page(() => json(200, { reply: 'ok' }));
    for (let i = 0; i < 3 && !p.doc.getElementById('shape-global-chat-button'); i++) await new Promise((r) => setTimeout(r, 5));
    const dock = p.doc.getElementById('shape-global-chat-button');
    (how === 'half' ? dock.querySelector('.sgc-chat') : dock).click();
    const panel = p.doc.getElementById('shape-global-chat-panel');
    assert.ok(panel && panel.classList.contains('open'), how);
    const tabs = [...panel.querySelectorAll('.sgc-tab')].map((b) => b.textContent);
    assert.ok(tabs.length > 0, how);
    assert.ok(!tabs.some((t) => t.startsWith('Help')), `${how}: Nora is not a tab inside Chat`);
  }
});

test('phones get the round ✦: the dock mounts below 760 px, Chat hidden by CSS there', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://www.theshapecommunity.com/help.html' });
  dom.window.matchMedia = () => ({ matches: true });
  dom.window.eval(BUTTON);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(dom.window.document.getElementById('shape-global-chat-button'), 'mounted at phone width');
  // The site's mobile breakpoint, 760 px (Codex, #2244), not the panel's 640.
  assert.match(BUTTON, /@media \(max-width:760px\)\{#shape-global-chat-button \.sgc-chat\{display:none\}#shape-global-chat-button \.sgc-nora\{width:44px;height:44px/);
  assert.doesNotMatch(BUTTON, /@media \(max-width:640px\)\{[^"]*\.sgc-chat\{display:none\}/);
});

test('the corner steps aside while a panel is open, and comes back when it closes', async () => {
  const p = page(() => json(200, { reply: 'ok' }));
  for (let i = 0; i < 3 && !p.doc.getElementById('shape-global-chat-button'); i++) await new Promise((r) => setTimeout(r, 5));
  const dock = p.doc.getElementById('shape-global-chat-button');
  dock.querySelector('.sgc-nora').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(dock.classList.contains('shape-global-chat-hidden'), 'hidden while the panel is open');
  p.doc.querySelector('#shape-global-chat-panel .sgc-close').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!dock.classList.contains('shape-global-chat-hidden'), 'back once it closes');
  const rich = p.doc.createElement('div'); rich.setAttribute('data-chat-panel', ''); p.doc.body.appendChild(rich);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(dock.classList.contains('shape-global-chat-hidden'), 'hidden under the rich widget too');
});

// ── Codex on #2393: the cookie can change account between two questions ───────────────────
// Each panel keeps the account its conversation is with (from her first answer as one) and
// names it on every later question; the server refuses one whose caller is someone else now,
// and the conversation starts again from her greeting with the question back in the box.
const SWITCHED = "You're signed in as another account now, so this conversation started again.";
const REFUSED = { error: "You're signed in as another account now. Open the conversation again.", code: 'account_changed', account: 'u2' };

test('older pages: a later question names the account, and a refusal starts the conversation again', async () => {
  let who = 'u1';
  const p = page((url, init) => {
    const named = JSON.parse(init.body).account;
    if (named && named !== who) return json(409, REFUSED);
    return json(200, { reply: `Answer for ${who}.`, account: who });
  });
  const panel = await askHelp(p, 'first');
  assert.equal(p.calls[0].body.account, undefined, 'nothing to name before her first answer');
  const input = panel.querySelector('textarea');
  const ask = async (text) => {
    input.value = text;
    input.dispatchEvent(new p.w.Event('input'));
    panel.querySelector('.sgc-send').click();
    for (let i = 0; i < 5; i++) await tick();
  };
  await ask('second');
  assert.equal(p.calls[1].body.account, 'u1', 'then the account she answered as');
  who = 'u2'; // signed in as someone else in another tab
  await ask('third');
  assert.equal(p.calls[2].body.account, 'u1');
  const shown = [...panel.querySelectorAll('.sgc-msg')].map((m) => m.textContent);
  assert.ok(!shown.some((t) => /Answer for u1|first|second/.test(t)), "u1's conversation is gone from the panel");
  assert.equal(shown.at(-1), SWITCHED, 'it says why');
  assert.equal(input.value, 'third', 'the question goes back in the box');
  assert.deepEqual(p.keptAs, ['u1', 'u1'], 'nothing kept for the refused question');
  // Asked again, the conversation is u2's from here.
  await ask('third');
  assert.equal(p.calls[3].body.account, undefined);
  await ask('fourth');
  assert.equal(p.calls[4].body.account, 'u2');
});

test('older pages: any other 409 is a failed request, not another account', async () => {
  const p = page(() => json(409, { error: 'busy' }));
  const panel = await askHelp(p, 'first');
  const shown = [...panel.querySelectorAll('.sgc-msg')].map((m) => m.textContent);
  assert.ok(shown.includes('first'), 'the conversation stays');
  assert.match(shown.at(-1), DOWN);
});

test('Next app: askNora names the account and reads a refusal; the button keeps it and starts again', async () => {
  const seen = [];
  const r = await nextBtn.askNora([{ from: 'you', text: 'x' }], (url, init) => { seen.push(JSON.parse(init.body)); return json(409, REFUSED); }, async () => '', 'u1');
  assert.equal(seen[0].account, 'u1');
  assert.deepEqual(r, { reply: '', links: [], account: null, refused: true });
  const none = [];
  await nextBtn.askNora([{ from: 'you', text: 'x' }], (url, init) => { none.push(JSON.parse(init.body)); return json(200, { reply: 'ok' }); });
  assert.ok(!('account' in none[0]), 'nothing to name: none is sent');
  const other = await nextBtn.askNora([{ from: 'you', text: 'x' }], () => json(409, { error: 'busy' }), async () => '', 'u1');
  assert.match(other.reply, DOWN, 'any other 409 is a failed request');
  const src = readFileSync(join(ROOT, 'src/components/GlobalChatButton.tsx'), 'utf8');
  const send = src.slice(src.indexOf('async function send('), src.indexOf('return (', src.indexOf('async function send(')));
  assert.match(send, /if \(refused\) \{\n(?:\s+\/\/[^\n]*\n)+\s+accountRef\.current = null;\n\s+setMessages\(\[next\[0\], \{ from: 'shape', text: NORA_SWITCHED \}\]\);\n\s+setDraft\(value\);\n\s+setBusy\(false\);\n\s+return;\n\s+\}\n\s+if \(account && !accountRef\.current\) accountRef\.current = account;/);
  assert.match(src, new RegExp(`const NORA_SWITCHED = "${SWITCHED.replace(/[.?]/g, '\\$&')}";`));
});

// The /connect pages are the installed app's in-app browser for a music sign-in (War Room: "the
// site's floating Ask Nora button shows on the /connect pages").
test('Next app: the floating button stays off the homepage and the /connect sign-in pages', () => {
  for (const p of ['/', '/intro-preview', '/connect', '/connect/spotify', '/connect/apple-music', '/connect/done']) {
    assert.equal(nextBtn.noraButtonHidden(p), true, p);
  }
  for (const p of ['/dashboard', '/login', '/purchase', '/connected', '/connections', '/dashboard/connect', null, undefined, '']) {
    assert.equal(nextBtn.noraButtonHidden(p), false, String(p));
  }
  const src = readFileSync(join(ROOT, 'src/components/GlobalChatButton.tsx'), 'utf8');
  assert.match(src, /if \(noraButtonHidden\(pathname\)\) \{\n\s+return null;/, 'the component asks the rule');
});
