// The app's Nora, option D (owner, 2026-10-07): a ✦ beside ⌕ in every header opens
// her as a sheet over the screen you are on, and the Support segment leaves Chat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const APP = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const PROS = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
const RADIO = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx'), 'utf8');
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

test('the header corner: ✦ Ask Nora left of ⌕, and it opens Nora', async () => {
  const { BSSearchCorner } = await loadBroadsheet(['BSSearchCorner']);
  const sent = [];
  const prev = globalThis.window;
  globalThis.window = Object.assign(prev || {}, { dispatchEvent: (e) => sent.push(e.type) });
  globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type) { this.type = type; } };
  try {
    const d = drive(BSSearchCorner, { size: 34 });
    const buttons = d.nodes().filter((n) => n.type === 'button');
    assert.deepEqual(buttons.map((b) => b.props['aria-label']), ['Ask Nora', 'Search Shape']);
    buttons[0].props.onClick();
    assert.deepEqual(sent, ['shape:openNora']);
    const quiet = drive(BSSearchCorner, { size: 34, nora: false });
    assert.deepEqual(quiet.nodes().filter((n) => n.type === 'button').map((b) => b.props['aria-label']), ['Search Shape'], 'a surface can opt out');
  } finally { globalThis.window = prev; }
});

test('the full-screen Radio, which has its own Nora controls, opts out', () => {
  assert.match(RADIO, /React\.createElement\(window\.BSSearchCorner, \{ size, ink, nora: false \}\)/);
});

test('Chat has no Support segment and no Nora thread of its own', () => {
  const feed = between(APP, 'function BSClientFeed(', 'function BSNoraSheet(');
  assert.ok(!/\['support', tr\('feed:tab\.support'/.test(feed), 'no Support pill');
  assert.ok(!feed.includes('supportMsgs'), 'the thread state moved out');
  assert.ok(!feed.includes("tab === 'support' && ("), 'no Support composer');
  assert.match(feed, /if \(openRequest\.support\) return;/, 'a support request is the shell\'s to answer');
});

test('the sheet carries the whole thread: messages, cards, actions, voice, and the session store', () => {
  const sheet = between(APP, 'function BSNoraSheet(', '// Chat tab for ALL roles');
  for (const needle of ['sendSupportText', 'runSupportAction', '<BSNoraProposal', 'speakReply(', 'useNoraTalk(', '<BSNoraTalk ', '<BSMessageComposer', 'createPortal(']) {
    assert.ok(sheet.includes(needle), needle);
  }
  assert.ok(sheet.includes('useStateBSC(() => _bsNoraThread || [SUPPORT_GREETING])'), 'reopening keeps the thread');
  assert.match(APP, /Object\.assign\(window, \{ BSNoraSheet, /, 'the coach shells read it off window');
});

test('every shell opens the sheet for the ✦ and for a support request, over Settings and search', () => {
  const client = between(APP, "const [showNoraSheet, setShowNoraSheet] = useStateBSC(false);", 'const settingsOverlay = showSettings ? (');
  assert.match(client, /window\.addEventListener\('shape:openNora', open\)/);
  assert.match(client, /if \(d\.support\) \{ setShowSearch\(false\); setShowSettings\(false\); setShowNoraSheet\(true\); return; \}/);
  assert.match(APP, /const noraSheet = showNoraSheet \? <BSNoraSheet onClose=\{\(\) => setShowNoraSheet\(false\)\} \/> : null;/);
  assert.equal((PROS.match(/if \(d\.support\) \{ setShowSearch\(false\); setShowSettings\(false\); setShowNoraSheet\(true\); return; \}/g) || []).length, 2, 'trainer and nutritionist');
  assert.equal((PROS.match(/window\.addEventListener\('shape:openNora', open\);/g) || []).length, 2);
  assert.equal((PROS.match(/const takeover = \(el\) => \(<>\{el\}\{settingsOverlay\}\{searchOverlay\}\{noraSheet\}<\/>\);/g) || []).length, 2);
});

test('the Help page points at the ✦', () => {
  assert.match(APP, /ask <b>Nora<\/b> — tap ✦ at the top of any screen/);
  assert.doesNotMatch(APP, /in Chat → Support/);
});

// ── Codex, #2245 ─────────────────────────────────────────────────────────────────
test('a reply that lands after the sheet closes is kept: the thread and the in-flight flag outlive the sheet', () => {
  const sheet = between(APP, 'function BSNoraSheet(', '// Chat tab for ALL roles');
  assert.match(APP, /let _bsNoraBusy = false;\nconst _bsNoraSubs = new Set\(\);/);
  assert.match(sheet, /useStateBSC\(\(\) => _bsNoraBusy\)/, 'a reopened sheet shows Nora still typing');
  assert.match(sheet, /_bsNoraSubs\.add\(sync\);/);
  assert.match(sheet, /_bsNoraPublish\(\[\.\.\.\(_bsNoraThread \|\| next\), \{ who: 'Nora', t: reply/, 'the reply is written to the store, not to the instance that asked');
  assert.match(sheet, /finally \{ _bsNoraPublish\(null, false\); \}/);
  assert.ok(!/setSupportMsgs\(m => \[\.\.\.m/.test(sheet), 'no reply is written only to this instance');
});

test('Chat\'s segment row is three columns now that Support has left', () => {
  const feed = between(APP, 'function BSClientFeed(', 'function BSNoraSheet(');
  assert.match(feed, /gridTemplateColumns: 'repeat\(3, 1fr\)', gap: 3/);
});

test('each takeover renders the sheet once', () => {
  for (const key of ['if (showCalendar) {', 'if (showCycle) {']) {
    const block = between(APP, key, '    );');
    assert.equal((block.match(/\{noraSheet\}/g) || []).length, 1, key);
  }
});

test('a follow-up that opens another screen closes the sheet', () => {
  const sheet = between(APP, 'function BSNoraSheet(', '// Chat tab for ALL roles');
  assert.match(sheet, /\['shape:openMarket', 'shape:openIntegrations', 'shape:openCoachPlan'\]/);
  assert.match(sheet, /names\.forEach\(\(n\) => window\.addEventListener\(n, close\)\)/);
});

// ── The account's greeting in the sheet (the Ask Nora plan, step 2, after #2247) ──────
test('the sheet greets with the account\'s own greeting and suggestions, once, and only an untouched thread', () => {
  const sheet = between(APP, 'function BSNoraSheet(', '// Chat tab for ALL roles');
  assert.match(sheet, /greet: true \};/, 'the seed is marked, so only it is ever replaced');
  // Keyed by the account, so a sign-in after a signed-out preview fetches the new account's (Codex, #2249).
  assert.match(sheet, /const who = _bsNoraWho\(\);\n\s+if \(_bsNoraGreeted === who \|\| !window\.ShapeSupport\?\.greeting\) return;/);
  assert.match(APP, /const _bsNoraWho = \(\) => \{ try \{ return window\.ShapeAuth\?\.getCachedState\?\.\(\)\?\.user\?\.id \|\| 'anon'; \}/);
  assert.match(sheet, /if \(!g \|\| _bsNoraGreeted !== who\)/, 'an answer for an account that has since signed out is dropped');
  assert.match(sheet, /if \(cur\.length !== 1 \|\| !cur\[0\]\.greet\) return;/, 'a conversation under way is never rewritten');
  assert.match(sheet, /_bsNoraPublish\(\[\{ \.\.\.cur\[0\], t: g\.text, quick: g\.quick \}\]\);/, 'through the store, so a closed sheet still gets it');
  assert.match(sheet, /if \(!g && _bsNoraGreeted === who\) _bsNoraGreeted = null;/, 'a failed read is tried again next open');
  // The chips show under the greeting while it is the only message, and a tap asks Nora.
  assert.match(sheet, /\{m\.greet && supportMsgs\.length === 1 && Array\.isArray\(m\.quick\) && m\.quick\.length > 0 && \(/);
  assert.match(sheet, /onClick=\{\(\) => sendSupportText\(q\)\}/);
});

test('the app reads the greeting through its API base and session, and fails to the seed', () => {
  const be = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const fn = between(be, 'async function noraGreeting(', 'window.ShapeSupport = {');
  assert.match(fn, /fetch\(`\$\{apiBaseUrl\}\/api\/support\/chat`, \{ headers, signal \}\)/, 'a root-relative fetch never reaches the backend on the native build');
  assert.match(fn, /headers\.Authorization = `Bearer \$\{token\}`/);
  assert.doesNotMatch(fn, /plain=1/, 'the sheet shows confirm cards, so it gets the full set');
  assert.match(fn, /if \(!res\.ok\) return null;/);
  assert.match(be, /window\.ShapeSupport = \{\n  ask: askSupportBot,[^}]*\n  greeting: noraGreeting,\n\};/);
});
