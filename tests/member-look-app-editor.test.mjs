// The app's older member editor (BSProfileCustomizer) and a look picked on the website (#2611, Codex P2).
// The website's Colors panel writes profile_custom.look { paper, accent, focus }, and the member page tints with
// look.accent over the old hex `accent` this editor keeps. So an accent picked here would save and never show.
// What holds, driving the real editor through the shared harness:
//   · an accent picked here clears look.accent, keeping the look's paper and focus, so it shows;
//   · an accent left as it was leaves the look exactly as stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const mod = await loadBroadsheet(['BSProfileCustomizer']);
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};
const flush = () => new Promise((r) => setTimeout(r, 0));

async function saveWith(initial, pick) {
  const writes = [];
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u-me' } }) };
  globalThis.window.shapeDb = { saveUserGoals: async (kind, doc) => { writes.push({ kind, doc }); return { ok: true }; } };
  globalThis.window.__bsToast = () => {};
  const saved = [];
  const d = withSurface(() => drive(mod.BSProfileCustomizer, { initial, c: '#c9a227', INK: '#111', BG: '#fff', onClose() {}, onSave: (doc) => saved.push(doc), ownerUid: 'u-me' }));
  if (pick) withSurface(() => d.clickKey(pick));
  withSurface(() => d.click('Save'));
  await flush(); await flush();
  delete globalThis.window.shapeDb;
  delete globalThis.window.__bsToast;
  assert.equal(writes.length, 1, 'the editor saved once');
  assert.equal(writes[0].kind, 'profile_custom');
  return writes[0].doc;
}

const LOOK = { paper: 'bone', accent: 'rust', focus: 'top' };

test('an accent picked in the app clears the website look\'s accent, keeping its paper and focus, so it shows', async () => {
  const doc = await saveWith({ bio: 'hi', accent: '#34d6c5', look: { ...LOOK } }, '#e0518a');
  assert.equal(doc.accent, '#e0518a');
  assert.deepEqual(doc.look, { paper: 'bone', focus: 'top' }, 'look.accent goes; the paper and focus stay');
});

test('an accent left as it was leaves the look exactly as stored', async () => {
  const doc = await saveWith({ bio: 'hi', accent: '#34d6c5', look: { ...LOOK } }, null);
  assert.equal(doc.accent, '#34d6c5');
  assert.deepEqual(doc.look, LOOK);
});

test('a member with no look: picking an accent writes the accent and invents no look', async () => {
  const doc = await saveWith({ bio: 'hi' }, '#7bbf5a');
  assert.equal(doc.accent, '#7bbf5a');
  assert.ok(!doc.look, 'no look was written');
});
