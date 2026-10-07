// Search asks Nora (the Ask Nora plan, step 2). Search finds people by name, so a question
// typed into it found nobody. A query that reads as a question is now offered to Nora on
// all three searches (siteSearch.js, pageShell.jsx, the app), its words carried into her
// composer for the person to send. Nothing is sent on their behalf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH = readFileSync(join(ROOT, 'public/newdesign/siteSearch.js'), 'utf8');
const SHELL = readFileSync(join(ROOT, 'public/newdesign/pageShell.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const BUTTON = readFileSync(join(ROOT, 'public/newdesign/globalChatButton.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Each surface's own rule, evaluated from its source.
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const site = new Function(between(SEARCH, 'var QUESTION_RE', '  function askNora(') + '; return looksLikeQuestion;')();
const app = new Function(between(APP, 'const BS_QUESTION_RE', '// Opens Nora\'s sheet') + '; return bsLooksLikeQuestion;')();
const shell = new Function(between(SHELL, 'const SS_QUESTION_RE', '  const asking = ') + '; return ssLooksLikeQuestion;')();

const CASES = [
  ['how do I cancel', true], ['pricing?', true], ['find me a coach', true], ['can I pause', true],
  ['what is shape', true], ['strength coach brooklyn', true], ['my plan', true],
  ['maya', false], ['Maya Okafor', false], ['nora', false], ['@devon', false], ['', false], ['hi?', false],
];

test('one rule on all three searches: a question is offered to Nora, a name stays a name', () => {
  for (const [q, want] of CASES) {
    assert.equal(site(q), want, `website: "${q}"`);
    assert.equal(shell(q), want, `React search: "${q}"`);
    assert.equal(app(q), want, `app: "${q}"`);
  }
  // The three regexes are the same spelling, so the rule cannot drift between them.
  const re = (src, name) => src.match(new RegExp(name + ' = (/[^\\n]+/i);'))[1];
  assert.equal(re(SEARCH, 'var QUESTION_RE'), re(APP, 'const BS_QUESTION_RE'));
  assert.equal(re(SHELL, 'const SS_QUESTION_RE'), re(APP, 'const BS_QUESTION_RE'));
});

async function searchFor(query, setup, rpc = () => Promise.resolve({ data: [], error: null })) {
  const dom = new JSDOM('<!doctype html><body><button class="nav-search">Search</button></body>', { runScripts: 'outside-only', url: 'https://www.theshapecommunity.com/newdesign/index.html' });
  const w = dom.window;
  w.shapeDb = { client: { rpc, auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } };
  const ctx = setup(w);
  w.eval(SEARCH);
  await wait(10);
  w.document.querySelector('.nav-search').click();
  const input = w.document.querySelector('input');
  input.value = query;
  input.dispatchEvent(new w.Event('input'));
  await wait(320);
  return { w, ctx };
}

test('website search: a question shows "Ask Nora" first, and picking it opens her with the words as a draft', async () => {
  const { w, ctx } = await searchFor('how do I cancel my plan', (w) => { const s = []; w.__openChatTo = (o) => s.push(o); return s; });
  const row = w.document.querySelector('.ss-ask');
  assert.ok(row, 'the Ask Nora row is shown');
  assert.match(row.textContent, /Ask Nora/);
  assert.match(row.textContent, /how do I cancel my plan/);
  assert.doesNotMatch(w.document.body.textContent, /Nothing on Shape matches|Sign in to search/, 'a question is not told nobody matched');
  row.click();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx)), [{ who: 'Nora', tab: 'support', draft: 'how do I cancel my plan' }]);
});

test('website search: a name gets no Ask Nora row', async () => {
  const { w } = await searchFor('Maya', () => null);
  assert.equal(w.document.querySelector('.ss-ask'), null);
});

test('website search: a failed search still offers the question to Nora, and still says the search failed', async () => {
  const { w } = await searchFor('what does shape cost', () => null, () => Promise.resolve({ data: null, error: { code: 'XX000' } }));
  assert.ok(w.document.querySelector('.ss-ask'));
  assert.match(w.document.body.textContent, /Couldn.t search just now/);
});

test('website, page without React: the real launcher opens Nora with the question in her composer, unsent', async () => {
  const sent = [];
  const { w } = await searchFor('can I pause my membership', (w) => {
    w.matchMedia = () => ({ matches: false });
    w.fetch = (url, init) => { if (init && init.method === 'POST') sent.push(url); return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }); };
    w.eval(BUTTON);
    return null;
  });
  w.document.querySelector('.ss-ask').click();
  await wait(10);
  const panel = w.document.getElementById('shape-global-chat-panel');
  assert.ok(panel && panel.classList.contains('open'));
  assert.equal(panel.querySelector('.sgc-title').textContent, 'Nora');
  assert.equal(panel.querySelector('textarea').value, 'can I pause my membership');
  assert.equal(panel.querySelector('.sgc-send').disabled, false, 'ready to send');
  assert.deepEqual(sent, [], 'nothing is asked on the visitor\'s behalf');
});

test('the React search and the app carry the same row and the same hand-off', () => {
  assert.match(SHELL, /const req = \{ who: "Nora", tab: "support", draft: asking \};/);
  assert.match(SHELL, /\{asking && \(\n\s+<button data-ask-nora onClick=\{askNora\}/);
  assert.match(SHELL, /rows\.length === 0 && !noraHit && !asking \?/);
  // App: the row, its hand-off, and the sheet reading the draft once.
  assert.match(APP, /<button data-ask-nora onClick=\{\(\) => \{ onClose\(\); bsAskNora\(askNora\); \}\}/);
  assert.match(APP, /function bsAskNora\(text\) \{\n\s+_bsNoraDraft = String\(text \|\| ''\)\.slice\(0, 500\);\n\s+try \{ window\.dispatchEvent\(new CustomEvent\('shape:openNora'\)\); \}/);
  assert.match(APP, /useStateBSC\(\(\) => \{ const d = _bsNoraDraft; _bsNoraDraft = ''; return d; \}\)/);
  assert.match(APP, /!noraHit && !askNora\) \? \(/);
  const errState = between(APP, ") : state !== 'ok' ? (", "common:search.rateLimited");
  assert.match(errState, /\{askNoraRow\}/, 'a failed app search still offers Nora');
});

test('the app label is translated in every catalog', () => {
  for (const loc of ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/common.json`), 'utf8'));
    assert.ok(typeof cat['search.askNora'] === 'string' && cat['search.askNora'].trim(), loc);
  }
});
