// The avatar photo is placed before it is saved (owner, 2026-11-11: "need to be able to drag and reposition
// profile pic on avatar"): services/avatarCrop.mjs's frame, BSAvatarPositioner.jsx's sheet, and the client's
// Change photo / Reposition on Edit profile and the profile pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../mobile-app/src/services/avatarCrop.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('the frame: the square always inside the photo, the short side filling it at zoom 1', () => {
  // A landscape photo, 2000 × 1000: at zoom 1 the square is 1000 px and can move sideways only.
  assert.deepEqual(A.bsAvClamp(2000, 1000, null), { x: 0.5, y: 0.5, zoom: 1 });
  assert.deepEqual(A.bsAvRect(2000, 1000, null), { sx: 500, sy: 0, side: 1000 });
  assert.deepEqual(A.bsAvClamp(2000, 1000, { x: 0, y: 0, zoom: 1 }), { x: 0.25, y: 0.5, zoom: 1 }, 'kept inside the photo');
  assert.deepEqual(A.bsAvClamp(2000, 1000, { x: 2, y: -1, zoom: 99 }), { x: 1 - 0.0625, y: 0.125, zoom: A.BS_AV_ZOOM_MAX });
  assert.deepEqual(A.bsAvClamp(2000, 1000, { zoom: 0.2 }).zoom, 1, 'never zoomed out past the photo');
  assert.deepEqual(A.bsAvClamp(2000, 1000, { x: NaN, y: 'a', zoom: undefined }), { x: 0.5, y: 0.5, zoom: 1 });
});

test('a drag moves the photo with the finger; a zoom keeps the point under the fingers still', () => {
  // Frame 250 px showing a 1000 px square: 4 source px per screen px. Dragging right 50 px moves the
  // square 200 px left.
  const p = A.bsAvPan(2000, 1000, null, 50, 0, 250);
  assert.ok(near(p.x, (1000 - 200) / 2000), String(p.x));
  assert.equal(p.y, 0.5, 'nothing to move vertically at zoom 1');
  // Zoom at the centre keeps the centre.
  const z = A.bsAvZoomAt(2000, 1000, null, 2);
  assert.ok(near(z.x, 0.5) && near(z.y, 0.5) && z.zoom === 2);
  // Zoom at the top-left corner of the frame keeps that photo point at the corner.
  const before = A.bsAvRect(2000, 1000, null);
  const zc = A.bsAvZoomAt(2000, 1000, null, 2, 0, 0);
  const after = A.bsAvRect(2000, 1000, zc);
  assert.ok(near(after.sx, before.sx) && near(after.sy, before.sy), JSON.stringify({ before, after }));
  assert.equal(after.side, 500);
});

test('the kept photo: at most 1080 px, never enlarged; it is used again only while it made the avatar', () => {
  assert.deepEqual(A.bsAvFit(4000, 3000), { w: 1080, h: 810 });
  assert.deepEqual(A.bsAvFit(300, 200), { w: 300, h: 200 });
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(200) + 'xyz';
  const doc = { src: 'data:image/jpeg;base64,BIG', pos: { x: 0.4, y: 0.5, zoom: 2 }, made: A.bsAvMark(photo) };
  assert.equal(A.bsAvSourceFits(doc, photo), true);
  assert.equal(A.bsAvSourceFits(doc, photo + 'changed'), false, 'a photo changed elsewhere since is a different square');
  assert.equal(A.bsAvSourceFits(null, photo), false);
  assert.equal(A.bsAvSourceFits({ ...doc, src: '' }, photo), false);
  assert.equal(A.bsAvMark(''), '');
});

test('the sheet and its doors: a picked photo is placed, then saved; Reposition starts from the kept photo', () => {
  const sheet = read('mobile-app/src/broadsheet/BSAvatarPositioner.jsx');
  assert.match(sheet, /ref=\{bsDialogRef\(busy \? null : cancel\)\} role="dialog" aria-modal="true"/, 'a Back cancels, except while saving');
  assert.match(sheet, /el\.style\.cssText = 'position:absolute;inset:0;z-index:1300;';/, 'its own box over the surface (.bs-paper-grain > * is relative)');
  assert.match(sheet, /if \(res && res\.error\) \{ setBusy\(false\); setErr\(tr\('settings:edit\.photoFailed'/, 'a failed save says so on the sheet');
  assert.match(sheet, /onPointerDown=\{onDown\} onPointerMove=\{onMove\} onPointerUp=\{onUp\} onPointerCancel=\{onUp\} onKeyDown=\{onKey\}/);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /function bsSavePositionedPhoto\(\{ photo, source, pos, uid = null \}\) \{[\s\S]{0,400}return bsSaveIdentity\(\{ photo \}\)\.then/, 'the square every avatar reads');
  assert.match(client, /bsKeepPhotoSource\(\{ src: source, pos, made: bsAvMark\(photo\)/, 'the photo as picked, kept privately');
  assert.match(client, /saveUserGoals\?\.\('client_photo_source', job\.doc, \{ expectedUserId: job\.uid \}\)/);
  assert.match(client, /const fits = bsAvSourceFits\(doc, photo\);\s*return bsOpenPhotoPositioner\(\{ src: fits \? doc\.src : photo, pos: fits \? doc\.pos : null/);
  // Each door binds the save to the account signed in when it opened (Codex P2 on #2709).
  assert.match(client, /const onSave = bsPhotoSaver\(\);\s*bsPickPhotoFile\(\)\s*\.then\(\(src\) => \(src \? bsOpenPhotoPositioner\(\{ src, onSave \}\) : null\)\)/, 'Change photo places it first');
  assert.match(client, /const onSave = bsPhotoSaver\(\);\s*bsAvReadFile\(f\)\s*\.then\(\(src\) => bsOpenPhotoPositioner\(\{ src, onSave \}\)\)/, 'the profile pages too');
  assert.match(client, /if \(!photo\) return Promise\.resolve\(null\);\s*const onSave = bsPhotoSaver\(\);[\s\S]{0,400}pos: fits \? doc\.pos : null, onSave \}\)/, 'Reposition binds before its read');
  assert.doesNotMatch(client, /onSave: bsSavePositionedPhoto/, 'a door that saves to whoever is signed in at Use photo');
  assert.match(client, /data-edit-photo="reposition" onClick=\{\(\) => bsRepositionProfilePhoto\(photoSaved\)\}/);
  assert.match(client, /onClick=\{shownPhoto \? \(\) => bsRepositionProfilePhoto\(photoSaved\) : undefined\}/, 'the avatar itself opens it');
});

// Use photo closed the sheet while the photo as picked was still being written, so a Reposition straight after
// could read the photo before it and start from the square (Codex P2 on #2709). The save now waits for that
// write, at most BS_PHOTO_SOURCE_WAIT_MS, and a failed or stalled one still saves the avatar.
test('Use photo waits for the kept photo before the sheet closes; a failed or stalled write still saves', async () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const start = client.indexOf('const BS_PHOTO_SOURCE_WAIT_MS = 15000;');
  const end = client.indexOf('// Change photo: the file picker', start);
  assert.ok(start > 0 && end > start, 'the save is in the client');
  const body = client.slice(start, end);
  const win = (save, user = 'u1') => ({ ShapeAuth: { getCachedState: () => ({ user: user ? { id: user } : null }) }, shapeDb: { saveUserGoals: save } });
  const load = ({ window, identity = async () => ({ ok: true }), waitMs = 15000 }) => new Function('window', 'bsSaveIdentity', 'bsAvMark',
    `${body.replace('= 15000;', `= ${waitMs};`)}\nreturn { bsSavePositionedPhoto, bsPhotoSaver };`,
  )(window, identity, A.bsAvMark);
  const make = ({ save, identity, waitMs }) => load({ window: win(save), identity, waitMs }).bsSavePositionedPhoto;
  const args = { photo: 'data:image/jpeg;base64,SQUARE', source: 'data:image/jpeg;base64,WHOLE', pos: { x: 0.4, y: 0.5, zoom: 2 }, uid: 'u1' };

  // The write lands before the save resolves, with the photo, its place and the mark of the square it made.
  let wrote = null;
  const slow = (kind, doc, opts) => new Promise((r) => setTimeout(() => { wrote = { kind, doc, opts }; r({ ok: true }); }, 30));
  const res = await make({ save: slow })(args);
  assert.deepEqual(res, { ok: true });
  assert.ok(wrote, 'the sheet closed before the photo as picked was kept');
  assert.equal(wrote.kind, 'client_photo_source');
  assert.deepEqual([wrote.doc.src, wrote.doc.pos, wrote.doc.made], [args.source, args.pos, A.bsAvMark(args.photo)]);
  assert.deepEqual(wrote.opts, { expectedUserId: 'u1' });

  // A failed write, a thrown one, or none at all: the avatar is saved all the same.
  assert.deepEqual(await make({ save: () => Promise.reject(new Error('offline')) })(args), { ok: true });
  assert.deepEqual(await make({ save: () => { throw new Error('boom'); } })(args), { ok: true });
  assert.deepEqual(await make({ save: undefined })(args), { ok: true });

  // A stalled write holds the sheet no longer than the cap.
  let guardTimer = null;
  const guard = new Promise((_, reject) => { guardTimer = setTimeout(() => reject(new Error('a stalled write held the sheet')), 2000); });
  try {
    assert.deepEqual(await Promise.race([make({ save: () => new Promise(() => {}), waitMs: 40 })(args), guard]), { ok: true });
  } finally { clearTimeout(guardTimer); }

  // A failed avatar save keeps nothing and says so.
  let called = false;
  const failed = await make({ save: () => { called = true; }, identity: async () => ({ error: { message: 'x' } }) })(args);
  assert.ok(failed.error);
  assert.equal(called, false, 'the photo was kept for a square that was never saved');

  // Bound to the account the picker opened for (Codex P2 on #2709): another account signed in by Use photo (a
  // sign-in on another tab) saves nothing to either account.
  let user = 'u1';
  const writes = [];
  const shared = { ShapeAuth: { getCachedState: () => ({ user: user ? { id: user } : null }) }, shapeDb: { saveUserGoals: (...a) => { writes.push(a); return Promise.resolve({ ok: true }); } } };
  const idWrites = [];
  const mod = load({ window: shared, identity: async (patch) => { idWrites.push(patch); return { ok: true }; } });
  const onSave = mod.bsPhotoSaver();                // opened as u1
  user = 'u2';                                      // another tab signs in
  const changed = await onSave({ photo: args.photo, source: args.source, pos: args.pos });
  assert.ok(changed.error, 'Use photo saved to the account signed in later');
  assert.deepEqual([idWrites.length, writes.length], [0, 0], 'a write reached the other account');
  user = null;                                      // signed out meanwhile
  assert.ok((await onSave({ photo: args.photo, source: args.source, pos: args.pos })).error);
  user = 'u1';                                      // the same account: saved, both writes bound to it
  assert.deepEqual(await onSave({ photo: args.photo, source: args.source, pos: args.pos }), { ok: true });
  assert.deepEqual([idWrites.length, writes.length, writes[0][2]], [1, 1, { expectedUserId: 'u1' }]);

  // The newest save wins (Codex P2s on #2709). Photo A's write outlasts the cap, so its sheet closes with it still
  // out; photo B's write goes out at once (a request that never settles holds nothing back), and when A lands after
  // B, B is written again over it.
  const order = [];
  let stored = null;
  let releaseA = null;
  const slowA = (kind, doc) => {
    order.push(`start:${doc.src}`);
    const land = () => { order.push(`done:${doc.src}`); stored = doc.src; return { ok: true }; };
    if (doc.src === 'A' && !releaseA) return new Promise((r) => { releaseA = () => r(land()); });
    return Promise.resolve(land());
  };
  const queued = load({ window: win(slowA), waitMs: 20 });
  assert.deepEqual(await queued.bsSavePositionedPhoto({ ...args, source: 'A' }), { ok: true }, 'the cap still closes the sheet');
  assert.deepEqual(await queued.bsSavePositionedPhoto({ ...args, source: 'B' }), { ok: true });
  assert.deepEqual(order, ['start:A', 'start:B', 'done:B'], "B's write waited on A's, which has not settled");
  assert.equal(stored, 'B');
  releaseA();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(order, ['start:A', 'start:B', 'done:B', 'done:A', 'start:B', 'done:B'], 'A landed late and B was not written again');
  assert.equal(stored, 'B', 'the older photo stayed over the newer one');
  // In order, nothing is written twice.
  const inOrder = [];
  const plain = load({ window: win((kind, doc) => { inOrder.push(doc.src); return Promise.resolve({ ok: true }); }) });
  await plain.bsSavePositionedPhoto({ ...args, source: 'C' });
  await plain.bsSavePositionedPhoto({ ...args, source: 'D' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(inOrder, ['C', 'D']);
});

// Save said nothing: toasts are a no-op app-wide, so a taken handle or a failed write left the page as it
// was, and a Save with nothing changed did nothing at all (owner, 2026-11-11: "save changes button not
// working").
test('Edit profile: Save shows Saving…, closes when saved or when nothing changed, and says a failure on the page', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const save = client.slice(client.indexOf('const saveEdit = async () => {'), client.indexOf('const cancelEdit = () =>'));
  assert.match(save, /if \(editBusyRef\.current\) return;\s*editBusyRef\.current = true;\s*setEditSave\(\{ busy: true, err: '' \}\);/, 'one save at a time');
  assert.match(save, /if \(!Object\.keys\(fields\)\.length\) \{ try \{ await _bsIdentitySaveChain; \} catch \(e\) \{\} setEditing\(false\); return ''; \}/, 'nothing typed: Save is Done, after a photo still saving');
  assert.match(save, /if \(!result \|\| result\.error\) return tr\('settings:edit\.saveFailed'/);
  assert.doesNotMatch(save, /__bsToast/, 'nothing said through the no-op toast');
  assert.match(client, /\{editSave\.err \? <div role="alert" data-edit-save-error=""/);
  assert.match(client, /label=\{editSave\.busy \? tr\('profile:log\.saving', \{ defaultValue: 'Saving…' \}\) : tr\('settings:edit\.saveChanges'/);
});

test('every new word is in all 13 catalogs', () => {
  const locales = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
  const settings = ['edit.saveFailed', 'edit.photoFailed', 'edit.positionTitle', 'edit.positionHint', 'edit.positionStage', 'edit.zoom', 'edit.positionReset', 'edit.usePhoto', 'edit.reposition', 'edit.addPhoto', 'edit.photoUnreadable'];
  const home = ['team.weeklyFor', 'team.weeklyForCoaches', 'weekly.kicker', 'weekly.title', 'weekly.sub', 'weekly.already', 'weekly.rate', 'weekly.rateScale', 'weekly.rateAria',
    'weekly.r.trainingAdherence', 'weekly.r.nutritionAdherence', 'weekly.r.sleep', 'weekly.r.energy', 'weekly.r.stress', 'weekly.r.hunger', 'weekly.optional', 'weekly.body', 'weekly.weight',
    'weekly.measurements', 'weekly.m.waist', 'weekly.m.hips', 'weekly.m.chest', 'weekly.m.arm', 'weekly.m.thigh', 'weekly.m.calf', 'weekly.photos', 'weekly.pose.front', 'weekly.pose.side',
    'weekly.pose.back', 'weekly.photosPrivate', 'weekly.words', 'weekly.wins', 'weekly.struggles', 'weekly.question', 'weekly.send', 'weekly.signIn', 'weekly.failed'];
  for (const loc of locales) {
    const cat = (ns) => JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/${ns}.json`));
    const s = cat('settings'), h = cat('home'), o = cat('onboarding');
    for (const k of settings) assert.ok(String(s[k] || '').trim(), `${loc}: settings:${k}`);
    for (const k of home) assert.ok(String(h[k] || '').trim(), `${loc}: home:${k}`);
    assert.match(h['team.weeklyFor'], /\{name\}/, `${loc}: the coach's name is interpolated`);
    assert.match(h['weekly.weight'], /\{unit\}/, `${loc}: the unit is interpolated`);
    assert.ok(String(o['apply.nora.unavailable'] || '').trim(), `${loc}: onboarding:apply.nora.unavailable`);
    assert.ok(!('nora.ask' in o) && !('apply.nora.fallback' in o), `${loc}: the removed door's words are gone`);
    assert.doesNotMatch(o['login.ctaSignInAs'] + o['login.ctaJoinAs'], /·/, `${loc}: no "Transmit ·" on the sign-in buttons`);
  }
});
