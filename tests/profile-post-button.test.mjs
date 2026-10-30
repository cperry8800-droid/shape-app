// ＋ Post on the living profile's own feed head (#2137's review: it was a <span>, "a control that
// leads nowhere"). It now opens the chat widget's Feed tab with the composer open. The button
// (livingShared.jsx) and the feed's side of the request (communityFeed.jsx) run as written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/MemberProfile.html' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
// The page's own CustomEvent, as in a browser (Node's can't be dispatched on jsdom's window).
globalThis.CustomEvent = dom.window.CustomEvent;
const React = require('react');
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const act = React.act;

const ND = new URL('../public/newdesign/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ND), 'utf8');
const SHARED = read('livingShared.jsx');
const FEED = read('communityFeed.jsx');
const compile = (src) => babel.transformSync(src, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
function fnSource(src, name) {
  const decl = parse(src, { sourceType: 'module', plugins: ['jsx'] }).program.body
    .find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === name);
  assert.ok(decl, name + ' is no longer a top-level function');
  return src.slice(decl.start, decl.end);
}
const scope = { React, lvMono: 'monospace', LV_INK: '#f2ede4', hexA: (h, a) => `rgba(${h},${a})` };
const { LvPostButton } = new Function(...Object.keys(scope),
  compile(fnSource(SHARED, 'lvComposePost') + '\n' + fnSource(SHARED, 'LvPostButton')) + '\nreturn { LvPostButton };')(...Object.values(scope));

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(el); });
  return { host, unmount: () => act(async () => { root.unmount(); host.remove(); }) };
}

test('＋ Post is a button that opens the Feed tab and asks for the composer', async () => {
  const opened = [];
  let heard = 0;
  window.__openChatTo = (req) => opened.push(req);
  const onAsk = () => { heard += 1; };
  window.addEventListener('shape:compose-post', onAsk);
  delete window.__shapeComposePost;
  const m = await mount(React.createElement(LvPostButton, { c: '#34d6c5' }));
  const b = m.host.querySelector('button[data-lv-post]');
  assert.ok(b, 'not a button');
  assert.equal(b.type, 'button');
  assert.equal(b.textContent, '＋ Post');
  assert.equal(b.style.minWidth, '44px');
  assert.equal(b.style.minHeight, '44px');
  await act(async () => { b.click(); });
  assert.deepEqual(opened, [{ tab: 'feed' }], 'the Feed tab was not opened');
  assert.equal(window.__shapeComposePost, true, 'no request for the composer');
  assert.equal(heard, 1, 'a feed already on screen was not told');
  // With no chat on the page it does nothing, and throws nothing.
  delete window.__openChatTo;
  await act(async () => { b.click(); });
  window.removeEventListener('shape:compose-post', onAsk);
  await m.unmount();
});

// The feed's side, lifted from CommunityFeed as written and run in a component that holds the
// same two pieces of state.
const effectAt = FEED.indexOf('  // ＋ Post elsewhere on the site');
const effectEnd = FEED.indexOf('}, [signedIn]);', effectAt);
assert.ok(effectAt > 0 && effectEnd > effectAt, 'the compose request moved in communityFeed.jsx');
const EFFECT = FEED.slice(effectAt, effectEnd + '}, [signedIn]);'.length);
const Harness = new Function('React', compile(`function Harness({ signedIn }) {
  const [composerOpen, setComposerOpen] = React.useState(false);
${EFFECT}
  return React.createElement('i', { 'data-open': String(composerOpen) });
}`) + '\nreturn Harness;')(React);

test('the feed opens its composer for the request once the account is signed in', async () => {
  const state = (m) => m.host.querySelector('i').getAttribute('data-open');
  // Asked before the feed knew the account: held, then taken once it is signed in.
  window.__shapeComposePost = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Harness, { signedIn: null })); });
  const m = { host };
  assert.equal(state(m), 'false', 'opened before the account was known');
  await act(async () => { root.render(React.createElement(Harness, { signedIn: true })); });
  assert.equal(state(m), 'true', 'the held request was not taken');
  assert.equal(window.__shapeComposePost, false, 'the request is one-shot');
  await act(async () => { root.unmount(); });

  // A feed already on screen hears the event.
  const root2 = createRoot(host);
  await act(async () => { root2.render(React.createElement(Harness, { signedIn: true })); });
  assert.equal(state(m), 'false');
  await act(async () => { window.__shapeComposePost = true; window.dispatchEvent(new window.Event('shape:compose-post')); });
  assert.equal(state(m), 'true', 'the event did not open the composer');
  await act(async () => { root2.unmount(); });

  // Signed out, the request is left alone: the feed shows "Sign in to post".
  window.__shapeComposePost = true;
  const root3 = createRoot(host);
  await act(async () => { root3.render(React.createElement(Harness, { signedIn: false })); });
  assert.equal(state(m), 'false');
  assert.equal(window.__shapeComposePost, true);
  await act(async () => { root3.unmount(); });
  host.remove();
  delete window.__shapeComposePost;
});

test('every owner feed head uses the button, and no ＋ Post is a bare label', () => {
  for (const f of ['livingSignal.jsx', 'livingTerrain.jsx', 'livingDesktop.jsx']) {
    const src = read(f);
    assert.ok(/owner && <LvPostButton c=\{c\} \/>|meta=\{owner \? <LvPostButton c=\{c\} size=\{10\} \/> : null\}/.test(src), f + ' has no LvPostButton');
    assert.ok(!/<span[^>]*>＋ Post<\/span>|"＋ Post"/.test(src), f + ' still draws ＋ Post as a label');
  }
});

// The member pages load the widget and the feed; the coach pages load only the bubble, whose
// lazy boot loads both (in both of its lists) and then hands the stashed request to the widget.
test('every page with a living profile can open the Feed tab', () => {
  const hosts = readdirSync(ND).filter((f) => f.endsWith('.html') && /living(Signal|Terrain|Desktop)\.jsx/.test(read(f)));
  assert.ok(hosts.length >= 7, 'the sweep found ' + hosts.length + ' living-profile pages');
  for (const f of hosts) assert.ok(read(f).includes('globalChatButton.js'), f + ' does not load globalChatButton.js');
  const bubble = read('globalChatButton.js');
  assert.match(bubble, /var names = \["pageShell\.jsx", "clientChatThreads\.jsx", "communityFeed\.jsx", "chatWidget\.jsx"\];/);
  assert.match(bubble, /\["\/newdesign\/pageShell\.jsx", "\/newdesign\/clientChatThreads\.jsx", "\/newdesign\/communityFeed\.jsx", "\/newdesign\/chatWidget\.jsx"\]/);
  assert.match(bubble, /function flushOpen\(\) \{\n\s+var req = window\.__openChatRequest \|\| undefined;[\s\S]{0,120}window\.__openChat\(req, req && req\.tab\);/);
});
