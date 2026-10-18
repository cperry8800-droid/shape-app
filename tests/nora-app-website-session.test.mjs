// The app's Nora sheet when its own client is signed out but the website's cookie session is
// there (the hosted /m/ app in a browser, the website's cook iframe): the server answers as the
// account, so the stored thread loads, what was said before it answered is sent once it does,
// and what is said after is appended. The real client module, run (the trace for the owner,
// 2026-10-17: these were the only signed-in exchanges in production, and none was kept).
//
// ⚠ AND THE COOKIE CAN CHANGE ACCOUNT UNDER THE SHEET (Codex on #2393): each write through it
// names the account the thread loaded as, and a refusal starts the sheet again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, SRC } from './helpers/broadsheet-mount.mjs';

const B = await loadBroadsheet(['_bsNoraSave', '_bsNoraMarkSynced', '_bsNoraForget', '_bsNoraPublish', '_bsNoraSubs', '_bsNoraGen', '_bsNoraAccount', '_bsNoraDropOther', '_bsNoraHeldAs', 'BSNoraSheet']);
const { drive } = await import('./helpers/broadsheet-mount.mjs');
globalThis.document = globalThis.document || { getElementById: () => null, body: {} };
// What the sheet shows now (a fresh draw reads the shared thread).
const shown = () => drive(B.BSNoraSheet, { onClose: () => {} }).text;
const showing = (...texts) => B._bsNoraPublish([{ who: 'Nora', t: 'Hi.', time: 'now', me: false, bot: true }, ...texts.map((t) => ({ who: 'You', t, time: 'now', me: true }))]);
const { _bsNoraSave, _bsNoraMarkSynced, _bsNoraForget } = B;

const sent = [];
function world(userId, { answer = true } = {}) {
  const appended = [];
  sent.length = 0;
  globalThis.window = globalThis.window || {};
  window.ShapeAuth = { getCachedState: () => ({ user: userId ? { id: userId } : null }) };
  window.ShapeSupport = { thread: { append: (messages, opts) => { appended.push({ texts: messages.map((m) => m.text), account: (opts && opts.account) || null }); sent.push(...messages); return Promise.resolve(answer); } } };
  // Each test starts from a sheet that has not loaded.
  _bsNoraForget();
  return appended;
}
const msg = (text) => ({ role: 'user', text, at: 'now' });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('app signed out: held until the store answers for the website session, then sent, then appended as said', () => {
  const appended = world(null);
  _bsNoraSave([msg('asked before the load')]);
  assert.deepEqual(appended, [], 'nothing is written before the store has answered');
  _bsNoraMarkSynced('anon', 'acct-A');
  assert.deepEqual(appended.map((a) => a.texts), [['asked before the load']], 'held, then sent once it answered');
  _bsNoraSave([msg('asked after')]);
  assert.deepEqual(appended.map((a) => a.texts), [['asked before the load'], ['asked after']]);
  assert.deepEqual(appended.map((a) => a.account), ['acct-A', 'acct-A'], 'each write names the account the thread loaded as');
});

test('held while the store could not answer: an exchange answered as another account is never sent as this one, nor left on screen', () => {
  const appended = world(null);
  shown();
  _bsNoraSave([msg('answered as A')], 'acct-A');
  _bsNoraSave([msg('asked as a visitor')], null);
  _bsNoraSave([msg('answered as B')], 'acct-B');
  showing('answered as A', 'asked as a visitor', 'answered as B');
  const gen = B._bsNoraGen;
  // The cookie is account B by the time the store answers.
  _bsNoraMarkSynced('anon', 'acct-B');
  assert.deepEqual(appended.map((a) => a.texts), [['asked as a visitor', 'answered as B']], "A's exchange stays out of B's conversation (Codex on #2393)");
  assert.deepEqual(appended.map((a) => a.account), ['acct-B']);
  assert.ok(sent.every((m) => !('_as' in m)), 'the held mark is not sent');
  // ⚠ And off the screen: the next question would carry A's transcript as B (Codex on #2393).
  assert.doesNotMatch(shown(), /answered as A/);
  assert.equal(B._bsNoraGen, gen + 1, 'an answer still on its way is dropped, as at a Clear');
});

test('held exchanges all answered as the account the store answers for: kept on screen and sent', () => {
  const appended = world(null);
  shown();
  _bsNoraSave([msg('asked as a visitor')], null);
  _bsNoraSave([msg('answered as A')], 'acct-A');
  showing('asked as a visitor', 'answered as A');
  const gen = B._bsNoraGen;
  _bsNoraMarkSynced('anon', 'acct-A');
  assert.deepEqual(appended.map((a) => a.texts), [['asked as a visitor', 'answered as A']]);
  assert.match(shown(), /asked as a visitor[\s\S]*answered as A/);
  assert.equal(B._bsNoraGen, gen);
});

test('the store answers signed out: an exchange answered as an account goes from the screen and from what is held', () => {
  const appended = world(null);
  shown();
  _bsNoraSave([msg('asked as a visitor')], null);
  _bsNoraSave([msg('answered as A')], 'acct-A');
  showing('asked as a visitor', 'answered as A');
  assert.equal(B._bsNoraHeldAs(), 'acct-A', 'until then, the next question names the account it was answered as');
  assert.equal(B._bsNoraDropOther(null), true);
  assert.doesNotMatch(shown(), /answered as A/);
  assert.equal(B._bsNoraHeldAs(), null);
  // What a visitor said is still sent once a store answers.
  _bsNoraMarkSynced('anon', 'acct-C');
  assert.deepEqual(appended.map((a) => a.texts), [['asked as a visitor']]);
  // Nothing answered as an account: nothing goes.
  world(null);
  _bsNoraSave([msg('asked as a visitor')], null);
  assert.equal(B._bsNoraDropOther(null), false);
});

test('app signed in: appended as said, naming the account; one answered as another account is not kept (Codex on #2393)', () => {
  const appended = world('u1');
  _bsNoraSave([msg('hello')]);
  _bsNoraSave([msg('answered as u1')], 'u1');
  // The app's own account changed in another tab while she answered: the exchange was another account's.
  _bsNoraSave([msg('answered as u0')], 'u0');
  assert.deepEqual(appended, [{ texts: ['hello'], account: 'u1' }, { texts: ['answered as u1'], account: 'u1' }]);
});

test('said before signing in, then the store answers for the app account: sent naming that account', () => {
  const appended = world(null);
  _bsNoraSave([msg('asked as a visitor')], null);
  window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  _bsNoraMarkSynced('u1', 'u1');
  assert.deepEqual(appended, [{ texts: ['asked as a visitor'], account: 'u1' }]);
});

test('whose conversation the sheet holds: the app account it was drawn for, else the cookie account it loaded as', async () => {
  world(null);
  const draw = () => drive(B.BSNoraSheet, { onClose: () => {} });
  draw();
  assert.equal(B._bsNoraAccount(), null, 'a visitor: none');
  _bsNoraMarkSynced('anon', 'acct-A');
  assert.equal(B._bsNoraAccount(), 'acct-A', 'loaded through the cookie: the account it loaded as');
  // The app signs in elsewhere: until the sheet is drawn again, it still holds the cookie account's.
  window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  assert.equal(B._bsNoraAccount(), 'acct-A');
  draw();
  assert.equal(B._bsNoraAccount(), 'u1', 'drawn for the app account: that account');
  _bsNoraMarkSynced('u1', 'u1');
  window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u2' } }) };
  assert.equal(B._bsNoraAccount(), 'u1', 'the app account changed in another tab: still the one it was drawn for');
  window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  draw();
});

test('the cookie changed account: the write is refused, the sheet starts again, and holds what is said next', async () => {
  const appended = world(null, { answer: 'account_changed' });
  _bsNoraMarkSynced('anon', 'acct-A');
  const notified = [];
  const sub = () => notified.push(1);
  B._bsNoraSubs.add(sub);
  const gen = B._bsNoraGen;
  _bsNoraSave([msg('said after the switch')]);
  await tick();
  B._bsNoraSubs.delete(sub);
  assert.equal(notified.length, 1, 'the sheet is told to redraw');
  assert.equal(B._bsNoraGen, gen + 1, 'an answer still on its way is dropped, as at a Clear');
  _bsNoraSave([msg('next')]);
  assert.equal(appended.length, 1, 'nothing more is written until the store answers again');
  // What the sheet redraws to: the seed greeting, not the last account's conversation.
  const src = readFileSync(SRC, 'utf8');
  const forget = src.slice(src.indexOf('function _bsNoraForget() {'), src.indexOf('const _bsNoraWho = () =>'));
  assert.match(forget, /_bsNoraLoaded = null; _bsNoraSynced = null; _bsNoraCookie = null; _bsNoraHeld = \[\]; _bsNoraGreeted = null;/);
  assert.match(forget, /_bsNoraPublish\(\[_bsNoraSeed\(\)\]\);/);
});
