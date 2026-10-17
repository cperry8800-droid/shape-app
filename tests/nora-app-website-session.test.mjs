// The app's Nora sheet when its own client is signed out but the website's cookie session is
// there (the hosted /m/ app in a browser, the website's cook iframe): the server answers as the
// account, so the stored thread loads, what was said before it answered is sent once it does,
// and what is said after is appended. The real client module, run (the trace for the owner,
// 2026-10-17: these were the only signed-in exchanges in production, and none was kept).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';

const { _bsNoraSave, _bsNoraMarkSynced } = await loadBroadsheet(['_bsNoraSave', '_bsNoraMarkSynced']);

function world(userId) {
  const appended = [];
  globalThis.window = globalThis.window || {};
  window.ShapeAuth = { getCachedState: () => ({ user: userId ? { id: userId } : null }) };
  window.ShapeSupport = { thread: { append: (messages) => { appended.push(messages.map((m) => m.text)); return Promise.resolve(true); } } };
  return appended;
}
const msg = (text) => ({ role: 'user', text, at: 'now' });

test('app signed out: held until the store answers for the website session, then sent, then appended as said', () => {
  const appended = world(null);
  _bsNoraSave([msg('asked before the load')]);
  assert.deepEqual(appended, [], 'nothing is written before the store has answered');
  _bsNoraMarkSynced('anon');
  assert.deepEqual(appended, [['asked before the load']], 'held, then sent once it answered');
  _bsNoraSave([msg('asked after')]);
  assert.deepEqual(appended, [['asked before the load'], ['asked after']]);
});

test('app signed in: appended as said, as before', () => {
  const appended = world('u1');
  _bsNoraSave([msg('hello')]);
  assert.deepEqual(appended, [['hello']]);
});
