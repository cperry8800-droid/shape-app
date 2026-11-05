// tests/chat-read-parity.test.mjs
//
// Website chat with the app's read state (P7). The website's chat never marked a thread read, showed
// every live thread as unread 0 and polled only the open thread; the coach Messages pages read once at
// mount and treated a failed send as sent. Pinned here:
//   - chatRead.mjs, the one rule both surfaces mark a thread read by (and the app uses it);
//   - the coach inbox's live layer, MOUNTED: counts from dm_unread, the open thread read, a live message
//     counted or read, a thread the inbox doesn't have reloads it; a send is sent only on the route's ok;
//   - the chat bubble reads dm_unread, subscribes to messages, and marks the open thread through the rule;
//   - both Messages pages load the layer and never call a failed send sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CR from '../public/newdesign/chatRead.mjs';
import * as appCR from '../mobile-app/src/services/chatRead.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => stripComments(read(p));
const { JSDOM } = require_('jsdom');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');

test('what a message arriving means for the read state', () => {
  assert.equal(CR.readOnArrival({ isOpenThread: true, fromOther: true, hidden: false }), 'read');
  assert.equal(CR.readOnArrival({ isOpenThread: true, fromOther: true, hidden: true }), 'wait');
  assert.equal(CR.readOnArrival({ isOpenThread: true, fromOther: false, hidden: false }), 'none', 'your own message');
  assert.equal(CR.readOnArrival({ isOpenThread: false, fromOther: true, hidden: false }), 'none', 'another thread');
  assert.equal(appCR.readOnArrival, CR.readOnArrival, 'the app re-exports the one rule');
});

test('the open thread\'s read state: opened, a message, out of sight and back', () => {
  let hidden = false;
  const marked = [];
  const tr = CR.createReadTracker({ isHidden: () => hidden, mark: (id) => marked.push(id) });
  tr.open('c1');
  assert.deepEqual(marked, ['c1'], 'opened in view: read');
  assert.equal(tr.arrived({ conversation_id: 'c1', sender_id: 'them' }, 'me'), 'read');
  assert.deepEqual(marked, ['c1', 'c1']);
  assert.equal(tr.arrived({ conversation_id: 'c1', sender_id: 'me' }, 'me'), 'none');
  assert.equal(tr.arrived({ conversation_id: 'c2', sender_id: 'them' }, 'me'), 'none');
  hidden = true;
  assert.equal(tr.arrived({ conversation_id: 'c1', sender_id: 'them' }, 'me'), 'wait');
  assert.equal(tr.waiting, true);
  tr.shown();
  assert.equal(marked.length, 2, 'still out of sight: nothing');
  hidden = false;
  tr.shown();
  assert.deepEqual(marked, ['c1', 'c1', 'c1'], 'back in view: read');
  tr.shown();
  assert.equal(marked.length, 3, 'once');
  hidden = true;
  tr.open('c3');
  assert.equal(marked.length, 3, 'opened out of sight waits');
  hidden = false;
  tr.shown();
  assert.deepEqual(marked.slice(-1), ['c3']);
  tr.close();
  tr.shown();
  assert.equal(tr.arrived({ conversation_id: 'c3', sender_id: 'them' }, 'me'), 'none', 'closed');
  assert.equal(marked.length, 4);
  // A mark that throws never breaks the tracker.
  const boom = CR.createReadTracker({ isHidden: () => false, mark: () => { throw new Error('x'); } });
  assert.doesNotThrow(() => boom.open('c1'));
});

test('the counts: dm_unread\'s rows, and one more for a live message unless it is read as it lands', () => {
  assert.deepEqual(CR.unreadByConversation([{ conversation_id: 'a', unread: 2 }, { conversation_id: 'b', unread: 0 }, { conversation_id: 'c', unread: '3' }, null, { unread: 4 }]), { a: 2, c: 3 });
  assert.deepEqual(CR.unreadByConversation(null), {});
  const m = { a: 1 };
  assert.deepEqual(CR.unreadAfterInsert(m, { conversation_id: 'a', sender_id: 'them' }, { myId: 'me' }), { a: 2 });
  assert.deepEqual(m, { a: 1 }, 'the old map is untouched');
  assert.deepEqual(CR.unreadAfterInsert(m, { conversation_id: 'a', sender_id: 'me' }, { myId: 'me' }), { a: 1 }, 'your own');
  assert.deepEqual(CR.unreadAfterInsert(m, { conversation_id: 'a', sender_id: 'them' }, { myId: 'me', openId: 'a' }), { a: 1 }, 'open and in view');
  assert.deepEqual(CR.unreadAfterInsert(m, { conversation_id: 'a', sender_id: 'them' }, { myId: 'me', openId: 'a', hidden: true }), { a: 2 }, 'open but out of sight');
  assert.deepEqual(CR.unreadAfterInsert(m, { conversation_id: 'b', sender_id: 'them' }, { myId: 'me', openId: 'a' }), { a: 1, b: 1 });
});

test('the app decides its three reads by the shared rule', () => {
  const client = code('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /import \{ readOnArrival \} from '\.\.\/services\/chatRead\.mjs';/);
  assert.equal((client.match(/readOnArrival\(\{/g) || []).length, 3);
  assert.doesNotMatch(client, /if \(bsPageHidden\(\)\) unreadWhileHiddenRef\.current = true;/);
});

// The coach inbox's live layer, evaluated from the shipping file and mounted with jsdom.
async function mountInbox({ threads, selectedId = 'c1', unreadRows = [], hidden = false }) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerMessages.html' });
  const prev = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  const React = require_('react');
  const { createRoot } = require_('react-dom/client');
  const rpcs = [];
  let onInsert = null;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'coach' } } }) },
    rpc: async (name, args) => { rpcs.push({ name, args }); return name === 'dm_unread' ? { data: unreadRows, error: null } : { data: null, error: null }; },
    channel: () => { const c = { on: (k, f, fn) => { onInsert = fn; return c; }, subscribe: () => c }; return c; },
    removeChannel: () => {},
  };
  dom.window.shapeDb = { client: db, getSession: async () => null };
  dom.window.__shapeChatRead = Promise.resolve(CR);
  const src = babel.transformSync(read('public/newdesign/coachInboxLive.jsx'), { presets: [presetReact], babelrc: false, configFile: false }).code;
  const api = new Function('React', 'window', 'document', src + ';return { useCoachInboxLive, coachInboxSend };')(React, dom.window, dom.window.document);
  const state = { threads };
  let reloads = 0;
  function Page() {
    const [ts, setTs] = React.useState(threads);
    state.threads = ts;
    api.useCoachInboxLive({ live: true, threads: ts, setThreads: setTs, selectedId, reload: () => { reloads += 1; } });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  const { act } = React;
  await act(async () => { root.render(React.createElement(Page)); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return {
    state, rpcs, api, reloads: () => reloads,
    insert: async (row) => { await act(async () => { onInsert({ new: row }); await new Promise((r) => setTimeout(r, 5)); }); },
    done: async () => { await act(async () => root.unmount()); globalThis.window = prev.window; globalThis.document = prev.document; globalThis.IS_REACT_ACT_ENVIRONMENT = prev.act; },
  };
}

test('the coach inbox, mounted: the app\'s counts, the open thread read, live messages counted or read', async () => {
  const m = await mountInbox({
    threads: [{ id: 'c1', messages: [] }, { id: 'c2', messages: [], lastMessageAt: '2026-11-01T00:00:00Z' }],
    unreadRows: [{ conversation_id: 'c1', unread: 2 }, { conversation_id: 'c2', unread: 3 }],
  });
  try {
    const by = (id) => m.state.threads.find((t) => t.id === id);
    assert.equal(by('c2').unread, 3);
    assert.equal(by('c1').unread, 0, 'the open thread');
    assert.deepEqual(m.rpcs.filter((r) => r.name === 'mark_conversation_read').map((r) => r.args.p_conversation_id), ['c1']);
    await m.insert({ id: 'x1', conversation_id: 'c2', sender_id: 'client', body: 'Hi coach', created_at: '2026-11-05T10:00:00Z' });
    assert.equal(by('c2').unread, 4);
    assert.deepEqual(by('c2').messages.map((x) => x.body), ['Hi coach']);
    assert.equal(by('c2').lastMessage, 'Hi coach');
    assert.equal(m.state.threads[0].id, 'c2', 'the newest thread first');
    await m.insert({ id: 'x2', conversation_id: 'c1', sender_id: 'client', body: 'Done', created_at: '2026-11-05T10:01:00Z' });
    assert.equal(by('c1').unread, 0);
    assert.equal(m.rpcs.filter((r) => r.name === 'mark_conversation_read').length, 2, 'read as it lands');
    await m.insert({ id: 'x2', conversation_id: 'c1', sender_id: 'client', body: 'Done', created_at: '2026-11-05T10:01:00Z' });
    assert.equal(by('c1').messages.length, 1, 'a row already shown is not shown twice');
    await m.insert({ id: 'x3', conversation_id: 'c9', sender_id: 'new-client', body: 'Hello', created_at: '2026-11-05T10:02:00Z' });
    assert.equal(m.reloads(), 1, 'a thread the inbox does not have reads the inbox again');
  } finally { await m.done(); }
});

test('a send is sent only when the route says so', async () => {
  const m = await mountInbox({ threads: [] });
  try {
    const answers = [
      { status: 200, body: { ok: true, message: { id: 'm1', body: 'hi', mine: true, createdAt: 'now' } }, want: true },
      { status: 400, body: { error: 'trainer message send failed' }, want: false },
      { status: 200, body: { ok: true }, want: false },
      { status: 500, body: null, want: false },
    ];
    for (const a of answers) {
      globalThis.fetch = async () => ({ ok: a.status < 300, status: a.status, json: async () => a.body });
      const r = await m.api.coachInboxSend('trainer', 'c1', 'hi');
      assert.equal(r.ok, a.want, JSON.stringify(a.body));
    }
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await m.api.coachInboxSend('trainer', 'c1', 'hi')).ok, false);
  } finally { await m.done(); delete globalThis.fetch; }
});

test('both Messages pages load the live layer and never call a failed send sent', () => {
  for (const [page, role] of [['TrainerMessages.html', 'trainer'], ['NutritionistMessages.html', 'nutritionist']]) {
    const html = read('public/newdesign/' + page);
    assert.ok(html.includes('<script type="text/babel" src="coachInboxLive.jsx"></script>'), page);
    const body = stripComments(html);
    assert.doesNotMatch(body, /\.catch\(\(\) => \{\}\)\s*\.finally\(\(\) => setSending\(false\)\)/, page);
    assert.ok(body.includes(`await coachInboxSend('${role}', convId, text)`), page);
    assert.match(body, /setThreads\(prev => prev\.map\(t => t\.id === convId \? \{ \.\.\.t, messages: t\.messages\.filter\(m => m\.id !== tmpId\) \} : t\)\);\s*setDraft\(d => \(d \? d : text\)\);/, page);
    assert.match(body, /useCoachInboxLive\(\{ live, threads, setThreads, selectedId, reload: \(\) => setInboxRev\(n => n \+ 1\) \}\)/, page);
    assert.match(body, /t\.unread > 0 && t\.id !== selectedId/, page);
  }
});

test('the chat bubble: the app\'s counts, live messages, and the open thread read by the rule', () => {
  const cw = code('public/newdesign/chatWidget.jsx');
  assert.match(cw, /import\("\/newdesign\/chatRead\.mjs"\)/);
  assert.match(cw, /await db\.rpc\("dm_unread"\)/);
  assert.match(cw, /CR\.unreadByConversation\(ur\.data\)/);
  assert.match(cw, /db\.rpc\("mark_conversation_read", \{ p_conversation_id: id \}\)/);
  assert.match(cw, /\.on\("postgres_changes", \{ event: "INSERT", schema: "public", table: "messages" \}/);
  assert.match(cw, /CR\.unreadAfterInsert\(/);
  assert.match(cw, /if \(cwOpenConv\) tr\.open\(cwOpenConv\); else tr\.close\(\);/);
  assert.match(cw, /\}, \[authProbe, authWho, cwListRev\]\);/);
});
