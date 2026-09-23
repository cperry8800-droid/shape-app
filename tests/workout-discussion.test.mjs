import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { workoutCommentContext, workoutConversation, readWorkoutComments, sendWorkoutComment, createWorkoutDiscussion } from '../public/newdesign/workoutDiscussion.mjs';
const require = createRequire(import.meta.url), { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client');
const Discussion = createWorkoutDiscussion(React);
const startedAt = '2026-09-23T12:00:00Z';
const context = workoutCommentContext({ clientId: 'client-a', startedAt, title: 'Strength', exercise: 'Squat' });
function mock() {
  const calls = [], writes = [], observers = new Set();
  const state = { owner: 'coach-a', professional: 'coaching-thread', fail: false, rows: [], gate: null };
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: state.owner } } }),
      onAuthStateChange(fn) { observers.add(fn); fn('INITIAL_SESSION', { user: { id: state.owner } }); return { data: { subscription: { unsubscribe() { observers.delete(fn); } } } }; }
    },
    rpc: async (name, args) => { calls.push([name, args]); return { data: 'private-pair' }; },
    from(table) {
      calls.push(['from', table]); let pending;
      const q = {
        select(fields) { calls.push(['select', fields]); return q; },
        eq(k, v) { calls.push(['eq', k, v]); return q; },
        order(k, opts) { calls.push(['order', k, opts]); return q; },
        limit: async n => { calls.push(['limit', n]); return { data: state.rows }; },
        maybeSingle: async () => ({ data: table === 'conversations' ? (state.professional ? { id: state.professional } : null) : { id: 'provider-id' } }),
        insert(row) { pending = row; writes.push(row); return q; },
        single: async () => { if (state.gate) await state.gate; return state.fail ? { error: { message: 'Connection lost' } } : { data: { ...pending, id: 'message-' + writes.length } }; }
      }; return q;
    }
  };
  return { db, calls, writes, state, auth: async owner => React.act(async () => { state.owner = owner; for (const fn of observers) fn(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner ? { user: { id: owner } } : null); }) };
}
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; });
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
const click = async text => { assert.ok(button(text), text); await React.act(async () => button(text).click()); };
async function type(value) { const el = document.querySelector('textarea'); await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); }); }
async function mount(m, extra = {}) {
  root = createRoot(document.getElementById('root'));
  let props = { db: m.db, clientId: 'client-a', clientName: 'Alex', role: 'trainer', startedAt, title: 'Strength', exercise: 'Squat', canComment: true, onOpenChat() {}, ...extra };
  const render = async next => { props = { ...props, ...next }; await React.act(async () => root.render(React.createElement(Discussion, props))); };
  await render({}); return render;
}

test('trainer and nutritionist comments reuse their own professional conversation', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const m = mock(); assert.equal(await workoutConversation(m.db, 'client-a', role, 'coach-a'), 'coaching-thread');
    assert.ok(m.calls.some(c => c[0] === 'eq' && c[1] === 'owner_id' && c[2] === 'coach-a'));
    assert.ok(m.calls.some(c => c[0] === 'eq' && c[1] === 'client_id' && c[2] === 'client-a'));
    assert.ok(m.calls.some(c => c[0] === 'eq' && c[1] === 'provider_role' && c[2] === role));
    assert.ok(!m.calls.some(c => c[0] === 'get_or_create_member_conversation'));
  }
  const m = mock(); m.state.professional = null;
  assert.equal(await workoutConversation(m.db, 'client-a', 'trainer', 'coach-a'), 'private-pair');
  assert.deepEqual(m.calls.at(-1), ['get_or_create_member_conversation', { p_other_user_id: 'client-a' }]);
});

test('comments filter the exact workout before applying the cap and return chronological rows', async () => {
  const m = mock(); m.state.rows = [{ id: 'new' }, { id: 'old' }];
  assert.deepEqual(await readWorkoutComments(m.db, 'thread', context), [{ id: 'old' }, { id: 'new' }]);
  const filter = m.calls.findIndex(c => c[0] === 'eq' && c[1] === 'metadata->>workout_started_at');
  assert.ok(filter > 0 && filter < m.calls.findIndex(c => c[0] === 'limit'));
  assert.equal(m.calls[filter][2], '2026-09-23T12:00:00.000Z');
});

test('identity changes and a stale client prevent the database insert', async () => {
  const m = mock();
  for (const options of [{ ownerId: 'someone-else' }, { ownerId: 'coach-a', isCurrent: () => false }]) {
    await assert.rejects(sendWorkoutComment(m.db, { conversationId: 'thread', context, text: 'Good work', ...options }), /account changed/);
  }
  assert.equal(m.writes.length, 0);
});

test('mounted feedback keeps exercise context, saves to private chat, and opens that exact thread', async () => {
  const m = mock(), opened = []; const render = await mount(m, { onOpenChat: id => opened.push(id) });
  assert.equal(m.calls.length, 0, 'viewing a workout never creates a chat');
  await click('Open workout comments'); await type('  Keep your chest up  ');
  await render({ exercise: 'Deadlift' }); await click('Send workout comment');
  assert.equal(m.writes.length, 1); assert.equal(m.writes[0].conversation_id, 'coaching-thread');
  assert.equal(m.writes[0].sender_id, 'coach-a'); assert.equal(m.writes[0].metadata.exercise, 'Squat');
  assert.equal(m.writes[0].metadata.comment, 'Keep your chest up');
  assert.match(m.writes[0].body, /Strength · Squat/);
  assert.equal(document.querySelector('textarea').value, '');
  assert.match(document.body.textContent, /Comment saved in your client chat/);
  await click('Message client'); assert.deepEqual(opened, ['coaching-thread']);
});

test('failed sends retain the draft and pending sends cannot be double submitted', async () => {
  const m = mock(); await mount(m); await click('Open workout comments'); await type('Try a lighter weight');
  m.state.fail = true; await click('Send workout comment');
  assert.equal(document.querySelector('textarea').value, 'Try a lighter weight'); assert.match(document.body.textContent, /Connection lost/);
  assert.doesNotMatch(document.body.textContent, /Comment saved/);
  m.state.fail = false; let release; m.state.gate = new Promise(r => { release = r; });
  await click('Send workout comment'); assert.equal(button('Saving comment…').disabled, true);
  await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(m.writes.length, 2);
  await React.act(async () => { release(); await m.state.gate; });
  assert.equal(document.querySelector('textarea').value, '');
});

test('switching clients discards a draft and ignores completion of an old request', async () => {
  const m = mock(), render = await mount(m); await click('Open workout comments'); await type('For Alex only');
  let release; m.state.gate = new Promise(r => { release = r; }); await click('Send workout comment');
  await render({ clientId: 'client-b', clientName: 'Blair' });
  await React.act(async () => { release(); await m.state.gate; });
  assert.doesNotMatch(document.body.textContent, /For Alex only|Comment saved/);
  assert.ok(!document.querySelector('textarea'));
  await click('Open workout comments'); assert.equal(document.querySelector('textarea').value, '');
});

test('auth changes hide feedback and disable sending until the client is reopened', async () => {
  const m = mock(); await mount(m); await click('Open workout comments'); await type('Private draft'); await m.auth('coach-b');
  assert.ok(!document.querySelector('textarea')); assert.equal(button('Message client').disabled, true);
  assert.match(document.body.textContent, /Your account changed/); assert.equal(m.writes.length, 0);
});

test('a changed owner is rejected even if an auth notification was missed', async () => {
  const m = mock(); await mount(m); await click('Open workout comments'); await type('Private draft');
  m.state.owner = 'coach-b'; await click('Send workout comment');
  assert.equal(m.writes.length, 0); assert.ok(!document.querySelector('textarea'));
  assert.equal(button('Message client').disabled, true);
});
