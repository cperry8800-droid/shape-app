// The app's member editor (Customize, BSProfileCustomizer.jsx) and a look picked on the website (#2611, Codex P2).
// The website's Colors panel writes profile_custom.look { paper, accent, focus }, and the member page tints with
// look.accent over the old hex `accent`. The app's editor picks in the same look panel and writes the same
// look, so a pick made in the app always shows. What holds, driving the real editor through the shared harness:
//   · a look picked in the app goes over the stored look, keeping the website's crop, and the old hex stays as
//     stored (the page reads look.accent first, so the pick is what shows);
//   · saving another area leaves the look exactly as stored;
//   · a member with no look who saves another area gets no look invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const mod = await loadBroadsheet(['BSProfileCustomizer']);
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;

// Open the editor on `stored`, open `area`, do `edit` there, press its Save; the doc written.
async function saveArea(stored, area, edit) {
  const writes = [];
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u-me' } }) };
  globalThis.window.shapeDb = {
    getUserGoals: async () => JSON.parse(JSON.stringify(stored)),
    saveUserGoals: async (kind, doc) => { writes.push({ kind, doc }); return { ok: true }; },
  };
  globalThis.window.__bsToast = () => {};
  try {
    const d = withSurface(() => drive(mod.BSProfileCustomizer, { initial: stored, c: '#c9a227', INK: '#111', BG: '#fff', onClose() {}, onSave() {}, ownerUid: 'u-me' }));
    d.nodes().find((n) => n.props && n.props['data-cust-row'] === area).props.onClick();
    withSurface(() => d.render());
    edit(d);
    withSurface(() => d.render());
    await withSurface(() => d.nodes().find((n) => n.props && n.props['data-cust-save'] != null).props.onClick());
  } finally { delete globalThis.window.shapeDb; delete globalThis.window.__bsToast; }
  assert.equal(writes.length, 1, 'the editor saved once');
  assert.equal(writes[0].kind, 'profile_custom');
  return writes[0].doc;
}

const LOOK = { paper: 'bone', accent: 'rust', focus: 'top' };

test('a look picked in the app goes over the website\'s, keeping its crop, so the pick is what shows', async () => {
  const doc = await saveArea({ bio: 'hi', accent: '#34d6c5', look: { ...LOOK } }, 'colors', (d) => d.nodes().find(named('BSLookPicker')).props.setLook({ paper: 'forest', accent: 'green' }));
  assert.deepEqual(doc.look, { paper: 'forest', accent: 'green', focus: 'top' }, 'the pick did not go over the stored look');
  assert.equal(doc.accent, '#34d6c5', 'the old hex was not left as stored');
});

test('saving another area leaves the look exactly as stored', async () => {
  const doc = await saveArea({ bio: 'hi', accent: '#34d6c5', look: { ...LOOK } }, 'about', (d) => d.nodes().find((n) => n.props && n.props['data-cust-field'] === 'bio').props.onChange({ target: { value: 'hello' } }));
  assert.equal(doc.bio, 'hello');
  assert.deepEqual(doc.look, LOOK);
  assert.equal(doc.accent, '#34d6c5');
});

test('a member with no look who saves another area gets no look invented', async () => {
  const doc = await saveArea({ bio: 'hi' }, 'about', (d) => d.nodes().find((n) => n.props && n.props['data-cust-field'] === 'bio').props.onChange({ target: { value: 'hello' } }));
  assert.ok(!doc.look, 'a look was written');
});
