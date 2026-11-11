// Mutation spec for the owner's 2026-11-11 asks: one check-in on Home (the Weekly check-in a line on Team,
// with its coach), Edit profile's Save saying what happened, the avatar photo placed before it is saved
// (services/avatarCrop.mjs, BSAvatarPositioner.jsx), the Weekly check-in page, and Nora's pill gone from
// the opening screens. Every mutation must be killed. From the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/checkins-profile-launch-2026-11-11.mutations.mjs --fail-on-skipped
const CROP = 'mobile-app/src/services/avatarCrop.mjs';
const SHEET = 'mobile-app/src/broadsheet/BSAvatarPositioner.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const TEAM = 'mobile-app/src/broadsheet/BSHomeTeam.jsx';
const WEEKLY = 'mobile-app/src/broadsheet/BSWeeklyCheckin.jsx';
const MAIN = 'mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx';
const APPLY = 'mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx';

export default {
  test: 'node --test tests/avatar-positioner.test.mjs tests/home-deck-team.test.mjs tests/weekly-checkin-page.test.mjs tests/settings-passport-root.test.mjs tests/nora-forms-app.test.mjs tests/app-apply-steps.test.mjs tests/onboarding-board.test.mjs tests/broadsheet-checkin-pref.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the crop ──
    { name: 'crop: zoomed out past the photo', file: CROP, find: 'const zoom = Math.min(BS_AV_ZOOM_MAX, Math.max(1, num(pos && pos.zoom, 1)));', replace: 'const zoom = Math.min(BS_AV_ZOOM_MAX, num(pos && pos.zoom, 1));' },
    { name: 'crop: the square leaves the photo', file: CROP, find: 'const x = Math.min(1 - hx, Math.max(hx, num(pos && pos.x, 0.5)));', replace: 'const x = num(pos && pos.x, 0.5);' },
    { name: 'crop: a drag moves the square with the finger', file: CROP, find: 'x: p.x - (num(dx, 0) * k) / iw', replace: 'x: p.x + (num(dx, 0) * k) / iw' },
    { name: 'crop: a zoom drifts from the fingers', file: CROP, find: 'const sx = px - num(fx, 0.5) * side;', replace: 'const sx = px - 0.5 * side;' },
    { name: 'crop: the kept photo enlarged', file: CROP, find: 'const k = Math.min(1, max / Math.max(w, h));', replace: 'const k = max / Math.max(w, h);' },
    { name: 'crop: a kept photo from another avatar reused', file: CROP, find: 'return sourceDoc.made === bsAvMark(photo);', replace: 'return true;' },

    // ── the sheet ──
    { name: 'sheet: a zero-high box (the grain rule)', file: SHEET, find: "el.style.cssText = 'position:absolute;inset:0;z-index:1300;';", replace: '' },
    { name: 'sheet: a Back cancels a save under way', file: SHEET, find: 'ref={bsDialogRef(busy ? null : cancel)}', replace: 'ref={bsDialogRef(cancel)}' },
    { name: 'sheet: a failed save closes as saved', file: SHEET, find: "if (res && res.error) { setBusy(false); setErr(tr('settings:edit.photoFailed'", replace: "if (false) { setBusy(false); setErr(tr('settings:edit.photoFailed'" },

    // ── the client: the photo's doors and Save ──
    { name: '(review) photo: saved before it is placed', file: CLIENT, find: '.then((src) => (src ? bsOpenPhotoPositioner({ src, onSave }) : null))', replace: '.then((src) => (src ? onSave({ photo: src, source: src, pos: null }).then(() => ({ photo: src })) : null))' },
    { name: 'photo: the kept photo not kept', file: CLIENT, find: "saveUserGoals?.('client_photo_source', { src: source, pos, made: bsAvMark(photo)", replace: "saveUserGoals?.('client_photo_source_off', { src: source, pos, made: bsAvMark(photo)" },
    // Codex P2 on #2709: the sheet closed while the photo as picked was still being written.
    { name: '(review) photo: the sheet closes before the kept photo is written', file: CLIENT, find: 'return Promise.race([Promise.resolve(kept).catch(() => null), cap])', replace: 'return Promise.race([Promise.resolve(null), cap])' },
    { name: '(review) photo: a stalled write holds the sheet', file: CLIENT, find: 'return Promise.race([Promise.resolve(kept).catch(() => null), cap])', replace: 'return Promise.resolve(kept).catch(() => null)' },
    { name: '(review) photo: a failed write fails the avatar', file: CLIENT, find: 'return Promise.race([Promise.resolve(kept).catch(() => null), cap])', replace: 'return Promise.race([Promise.resolve(kept), cap])' },
    // Codex P2 on #2709: a photo opened under one account was saved to whoever was signed in at Use photo.
    { name: '(review) photo: saved to whoever is signed in at Use photo', file: CLIENT, find: '  if (now !== uid) return Promise.resolve({ error: { message: \'Account changed.\' } });', replace: '' },
    { name: '(review) photo: the account read at Use photo, not at open', file: CLIENT, find: '  return (placed) => bsSavePositionedPhoto({ ...placed, uid });', replace: '  return (placed) => bsSavePositionedPhoto({ ...placed, uid: window.ShapeAuth?.getCachedState?.()?.user?.id || null });' },
    { name: 'photo: Reposition ignores whether the kept photo still fits', file: CLIENT, find: 'const fits = bsAvSourceFits(doc, photo);', replace: 'const fits = !!doc;' },
    { name: '(review) photo: the profile pages save unplaced', file: CLIENT, find: '      .then((src) => bsOpenPhotoPositioner({ src, onSave }))\n      .then((res) => { if (res) setPhoto(res.photo); })', replace: '      .then((src) => ({ photo: src }))\n      .then((res) => { if (res) setPhoto(res.photo); })' },
    { name: 'save: two saves at once', file: CLIENT, find: '    if (editBusyRef.current) return;\n    editBusyRef.current = true;', replace: '    editBusyRef.current = true;' },
    { name: 'save: nothing changed does nothing', file: CLIENT, find: "if (!Object.keys(fields).length) { try { await _bsIdentitySaveChain; } catch (e) {} setEditing(false); return ''; }", replace: "if (!Object.keys(fields).length) return '';" },
    { name: 'save: a failed write says nothing', file: CLIENT, find: "if (!result || result.error) return tr('settings:edit.saveFailed'", replace: "if (!result || result.error) return ('' || tr)('settings:edit.saveFailed'" },
    { name: 'save: the line is never drawn', file: CLIENT, find: '{editSave.err ? <div role="alert" data-edit-save-error=""', replace: '{false ? <div role="alert" data-edit-save-error=""' },

    // ── one check-in on Home ──
    { name: '(review) home: the weekly line without the pref', file: CLIENT, find: 'weekly={!sample && checkinDue && checkinPrefOn ? {', replace: 'weekly={!sample && checkinDue ? {' },
    // Codex P2 on #2709: the engine's check-in week led Home with "Send your weekly check-in".
    { name: '(review) home: the Weekly check-in leads Home again', file: CLIENT, find: "return !!engineFlag && engineFlag.lever === 'checkin';", replace: 'return false;' },
    { name: '(review) home: the Team line hidden on the engine\'s check-in week', file: CLIENT, find: 'weekly={!sample && checkinDue && checkinPrefOn ? {', replace: "weekly={!sample && checkinDue && checkinPrefOn && !(engineFlag && engineFlag.lever === 'checkin') ? {" },
    { name: 'home: a Back clears the line', file: CLIENT, find: '<BSWeeklyCheckin onBack={() => setCheckinPage(false)} onSent=', replace: '<BSWeeklyCheckin onBack={() => { setCheckinDue(false); setCheckinPage(false); }} onSent=' },
    { name: 'team: the line with no coach', file: TEAM, find: '{weekly && count ? (() => {', replace: '{weekly ? (() => {' },
    { name: 'team: one coach named as many', file: TEAM, find: "const forWhom = count === 1 ? tr('home:team.weeklyFor'", replace: "const forWhom = count === 0 ? tr('home:team.weeklyFor'" },
    { name: 'team: the line opens nothing', file: TEAM, find: 'data-team-weekly="" onClick={weekly.onOpen}', replace: 'data-team-weekly="" onClick={() => {}}' },

    // ── the Weekly check-in page ──
    { name: 'weekly: a sent check-in reports a Back', file: WEEKLY, find: "if (typeof onSent === 'function') onSent(); else onBack();", replace: 'onBack();' },
    { name: 'weekly: ratings it did not ask are saved', file: WEEKLY, find: 'for (const [k, v] of Object.entries(ratings || {})) if (asked.has(k) || !known.has(k)) out[k] = v;', replace: 'for (const [k, v] of Object.entries(ratings || {})) out[k] = v;' },
    { name: 'weekly: nine pills', file: WEEKLY, find: '{Array.from({ length: 10 }).map((_, i) => {', replace: '{Array.from({ length: 9 }).map((_, i) => {' },

    // ── the opening screens ──
    { name: 'shell: Nora heard on every stage', file: MAIN, find: "    if (!noraHere) return undefined;\n    window.addEventListener('shape:openNora', askNora);", replace: "    window.addEventListener('shape:openNora', askNora);" },
    { name: 'apply: the line before her bundle could load', file: APPLY, find: '    }, 4000);', replace: '    }, 450);' },
  ],
};
