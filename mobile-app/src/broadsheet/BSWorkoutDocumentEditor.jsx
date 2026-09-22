import React from 'react';
import { normalizeWorkoutDetail, videoUrl } from '../../../public/newdesign/workoutDocument.mjs';
import { coachWorkoutVideos, coachWorkoutDraftKey } from '../services/coachWorkoutLibrary.mjs';
import BSWorkoutFutureUpdates, { useWorkoutTr } from './BSWorkoutFutureUpdates.jsx';

const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const newDay = (name) => ({ id: uid(), name, blocks: [{ kind: 'main', rows: [] }] });

// The document stays structured for the whole edit. Changing one field never
// flattens the other weeks, prescription, coaching cues or exercise videos.
// The RPE scale, 1–10 in half points — plus a stored reading that is not on it. ⚠ A
// select whose value matches no option DISPLAYS its first option ("None") while the
// card still prints the stored RPE, so an off-list legacy value would be invisible
// here and visible to the member. Same rule as the website editor's.
const RPE_STEPS = Array.from({ length: 19 }, (_, i) => Math.round((1 + i * 0.5) * 10) / 10);
function rpeOptions(current) {
  const n = Number(current);
  const stored = current !== '' && current != null && Number.isFinite(n) && n > 0 && n <= 10 && !RPE_STEPS.includes(n);
  return stored ? [...RPE_STEPS, n].sort((a, b) => a - b) : RPE_STEPS;
}

export default function BSWorkoutDocumentEditor({ plan, plans, t, tr: inheritedTr, onSave, onClose }) {
  const tr = useWorkoutTr(inheritedTr);
  const account = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const ownerRef = React.useRef(account);
  const [initial] = React.useState(() => ({ name: plan.name || '', creationId: plan.id ? undefined : crypto.randomUUID(), detail: normalizeWorkoutDetail(plan.detail, { name: plan.name }) }));
  const draftKey = coachWorkoutDraftKey(ownerRef.current, plan.id, initial.detail.buildType);
  const [value, setValue] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
      // A stale draft is offered as the draft, never silently stamped with a
      // newer server revision. The PATCH conflict protects concurrent edits.
      if (saved && typeof saved.name === 'string' && saved.detail?.builder) return { ...initial, ...saved, detail: normalizeWorkoutDetail(saved.detail, { name: saved.name }) };
    } catch (_) { /* storage can be unavailable */ }
    return initial;
  });
  const [weekIdx, setWeekIdx] = React.useState(0);
  const [dayIdx, setDayIdx] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [stored, setStored] = React.useState(false);
  const [upload, setUpload] = React.useState(null);
  const [uploadError, setUploadError] = React.useState('');
  const [retry, setRetry] = React.useState(null);
  const [undo, setUndo] = React.useState(null);
  const [futureUpdates, setFutureUpdates] = React.useState(false);
  const savingRef = React.useRef(false);
  const fileRef = React.useRef(null);
  const targetRef = React.useRef(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  React.useEffect(() => {
    if ((!dirty && plan.id) || account !== ownerRef.current) return;
    try { localStorage.setItem(draftKey, JSON.stringify(value)); setStored(true); }
    catch (_) { setStored(false); }
  }, [draftKey, value, dirty, account, plan.id]);
  React.useEffect(() => {
    const guard = (event) => { if ((dirty && !stored) || saving || upload) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, stored, saving, upload]);

  const builder = value.detail.builder;
  const wi = Math.min(weekIdx, builder.weeks.length - 1);
  const week = builder.weeks[wi];
  const di = Math.min(dayIdx, Math.max(0, week.days.length - 1));
  const day = week.days[di];
  const accent = t.isLight ? '#0a8f87' : '#34d6c5';
  const button = { minHeight: 44, padding: '10px 12px', fontFamily: t.MONO, fontSize: 11, border: `1px solid ${t.RULE || t.INK20}`, borderRadius: 8, background: 'transparent', color: t.INK, cursor: 'pointer' };
  const input = { width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px', fontFamily: t.MONO, fontSize: 13, border: `1px solid ${t.RULE || t.INK20}`, borderRadius: 7, background: t.PAPER, color: t.INK };
  const label = { display: 'grid', gap: 5, color: t.INK50, fontFamily: t.MONO, fontSize: 10 };
  const txt = (key, text) => tr(`coach:workoutEditor.${key}`, { defaultValue: text });
  const change = (fn, keepUndo = false) => { if (savingRef.current) return; if (!keepUndo) setUndo(null); setRetry(null); setUploadError(''); setValue((prev) => { const next = clone(prev); fn(next); return next; }); };
  const changeDay = (fn, keepUndo = false) => change((next) => {
    fn(next.detail.builder.weeks[wi].days[di]);
    if (next.detail.builder.weeks.some((w) => w.days.some((d) => d.blocks.some((b) => b.rows.some((r) => r.name?.trim()))))) delete next.detail.builder.outlineOnly;
  }, keepUndo);
  const changeRow = (bi, ri, key, nextValue) => changeDay((next) => {
    next.blocks[bi].rows[ri][key] = nextValue;
    if (key === 'load' || key === 'loadType' || key === 'rpe') delete next.blocks[bi].rows[ri].loadText;
    if (key === 'rest') delete next.blocks[bi].rows[ri].restSeconds;
  });
  const videos = coachWorkoutVideos([...(plans || []), { name: value.name, detail: value.detail }]);
  const videoTarget = (bi, ri, row) => ({ wi, di, bi, ri, id: row.id });
  const attachVideo = (target, media) => change((next) => {
    // Row IDs can repeat across weeks copied on the website. The selected
    // position disambiguates them; authoring is frozen during an upload.
    const row = next.detail.builder.weeks[target.wi]?.days[target.di]?.blocks[target.bi]?.rows[target.ri];
    if (!row || row.id !== target.id) return;
    row.video = media.url;
    const list = next.detail.media || [];
    if (!list.some((item) => item.url === media.url)) next.detail.media = [...list, media];
  });
  const uploadVideo = async (file, target) => {
    if (!file || !target) return;
    setUpload({ target, name: file.name }); setUploadError(''); setRetry(null);
    try {
      if (!window.ShapeCoachMedia?.upload) throw new Error(txt('uploadSignIn', 'Sign in to upload a video.'));
      const media = await window.ShapeCoachMedia.upload(file, { videoOnly: true });
      if (!media?.url) throw new Error(txt('uploadFailed', 'The video did not upload. Try again.'));
      if ((window.ShapeAuth?.getCachedState?.()?.user?.id || null) !== ownerRef.current) throw new Error(txt('accountChanged', 'Your account changed. Reopen the library before saving.'));
      attachVideo(target, media);
    } catch (e) { setUploadError(e.message || txt('uploadFailed', 'The video did not upload. Try again.')); setRetry({ file, target }); }
    finally { setUpload(null); }
  };
  const save = async (asCopy = false, publish = false) => {
    if (savingRef.current || upload) return;
    if ((window.ShapeAuth?.getCachedState?.()?.user?.id || null) !== ownerRef.current) { setError(txt('accountChanged', 'Your account changed. Reopen the library before saving.')); return; }
    if (!value.name.trim()) { setError(txt('nameRequired', 'Name this workout or program first.')); return; }
    if (value.detail.builder.outlineOnly && JSON.stringify(value.detail.builder) !== JSON.stringify(initial.detail.builder)) { setError(txt('startSession', 'Add exercises')); return; }
    const invalid = value.detail.builder.weeks.some((wk) => wk.days.some((dy) => (dy.plannedMinutes != null && (dy.plannedMinutes < 1 || dy.plannedMinutes > 480)) || (dy.plannedRpe != null && (dy.plannedRpe < 1 || dy.plannedRpe > 10)) || dy.blocks.some((block) => block.rows.some((row) => row.sets !== '' && row.sets != null && (!Number.isInteger(Number(row.sets)) || Number(row.sets) < 1)))));
    if (invalid) { setError(txt('invalidPrescription', 'Use positive whole sets, 1–480 planned minutes, and RPE between 1 and 10.')); return; }
    savingRef.current = true; setSaving(true); setError('');
    try {
      const snapshot = asCopy && !value.copyId ? { ...value, copyId: crypto.randomUUID() } : value;
      if (snapshot !== value) setValue(snapshot);
      try { localStorage.setItem(draftKey, JSON.stringify(snapshot)); setStored(true); } catch (_) { setStored(false); }
      await onSave({ ...plan, published: asCopy ? false : publish || plan.published === true, ...(asCopy ? { id: undefined } : {}), creationId: asCopy ? snapshot.copyId : snapshot.creationId, expectedOwnerId: ownerRef.current, name: asCopy ? tr('coach:plans.copyName', { defaultValue: '{name} (copy)', name: snapshot.name.trim() }) : snapshot.name.trim(), detail: snapshot.detail });
      try { localStorage.removeItem(draftKey); } catch (_) { /* already saved remotely */ }
    } catch (e) { setError(e.message || txt('saveFailed', 'Could not save. Your draft is still here.')); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const close = async () => {
    if (saving || upload) return;
    if (dirty && !stored) {
      if (!window.bsAskConfirm) { setError(txt('leaveBody', 'This device could not keep your changes. Save them before leaving.')); return; }
      if (!(await window.bsAskConfirm({ title: txt('leaveTitle', 'Leave this draft?'), message: txt('leaveBody', 'This device could not keep your changes. Save them before leaving.'), confirmLabel: txt('leave', 'Leave without saving') }))) return;
    }
    onClose();
  };

  if (futureUpdates) return <BSWorkoutFutureUpdates plan={plan} t={t} tr={tr} onClose={() => setFutureUpdates(false)} />;
  return <section style={{ padding: `${window.BS_MAST_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))'} ${t.padX || 24}px 40px`, color: t.INK }}>
    <fieldset disabled={saving || !!upload} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <button type="button" onClick={close} disabled={saving || !!upload} style={button}>{txt('back', '← Library')}</button>
      <span role="status" style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>{dirty ? (stored ? txt('localDraft', 'Draft kept on this device') : txt('unsaved', 'Unsaved changes')) : txt('savedVersion', 'Saved version')}</span>
    </div>
    <h1 style={{ fontFamily: t.DISPLAY, fontSize: 30 }}>{txt('title', 'Build their next session.')}</h1>
    {plan.id && window.ShapeCoachPlans?.assignments && <button type="button" disabled={dirty || saving || !!upload} onClick={() => setFutureUpdates(true)} style={{ ...button, marginBottom: 14 }}>{dirty ? txt('saveBeforeFuture', 'Save before reviewing future workouts') : txt('reviewFuture', 'Review future assignments')}</button>}
    <label style={label}>{txt('name', 'Name')}<input value={value.name} onChange={(e) => change((next) => { next.name = e.target.value; })} style={input} /></label>
    <label style={{ ...label, marginTop: 10 }}>{txt('type', 'Library section')}<select value={value.detail.buildType || 'program'} onChange={(e) => change((next) => { next.detail.buildType = e.target.value; })} style={input}><option value="workout">{txt('singleWorkout', 'Workouts')}</option><option value="program">{txt('routine', 'Programs')}</option><option value="plan">{txt('paidPlan', 'Plans')}</option></select></label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
      {builder.weeks.map((_, i) => <button type="button" key={i} aria-pressed={wi === i} onClick={() => { setWeekIdx(i); setDayIdx(0); }} style={{ ...button, color: wi === i ? accent : t.INK }}>{txt('week', 'Week')} {i + 1}</button>)}
      <button type="button" onClick={() => { change((next) => { next.detail.builder.weeks.push({ deload: false, days: [newDay(txt('newSession', 'New session'))] }); }); setWeekIdx(builder.weeks.length); setDayIdx(0); }} style={button}>{txt('addWeek', '+ Week')}</button>
      <button type="button" onClick={() => { change((next) => { const copy = clone(next.detail.builder.weeks[wi]); for (const d of copy.days) { d.id = uid(); for (const b of d.blocks) for (const r of b.rows) r.id = uid(); } next.detail.builder.weeks.splice(wi + 1, 0, copy); }); setWeekIdx(wi + 1); setDayIdx(0); }} style={button}>{txt('copyWeek', 'Copy week')}</button>
      {builder.weeks.length > 1 && <button type="button" onClick={() => { setUndo(clone(value)); change((next) => next.detail.builder.weeks.splice(wi, 1), true); setWeekIdx(Math.max(0, wi - 1)); setDayIdx(0); }} style={button}>{txt('removeWeek', 'Remove week')}</button>}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
      {week.days.map((d, i) => <button type="button" key={d.id || i} aria-pressed={di === i} onClick={() => setDayIdx(i)} style={{ ...button, color: di === i ? accent : t.INK }}>{d.name}</button>)}
      <button type="button" onClick={() => { change((next) => next.detail.builder.weeks[wi].days.push(newDay(txt('newSession', 'New session')))); setDayIdx(week.days.length); }} style={button}>{txt('addSession', '+ Session')}</button>
    </div>
    {day && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => { change((next) => { const copy = clone(next.detail.builder.weeks[wi].days[di]); copy.id = uid(); for (const block of copy.blocks) for (const row of block.rows) row.id = uid(); next.detail.builder.weeks[wi].days.splice(di + 1, 0, copy); }); setDayIdx(di + 1); }} style={button}>{txt('copySession', 'Copy session')}</button>
        {week.days.length > 1 && <button type="button" onClick={() => { setUndo(clone(value)); change((next) => next.detail.builder.weeks[wi].days.splice(di, 1), true); setDayIdx(Math.max(0, di - 1)); }} style={button}>{txt('removeSession', 'Remove session')}</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={label}>{txt('sessionName', 'Session name')}<input value={day.name} onChange={(e) => changeDay((next) => { next.name = e.target.value; })} style={input} /></label>
        <label style={label}>{txt('weekday', 'Training day')}<select value={day.weekday ?? ''} onChange={(e) => changeDay((next) => { if (e.target.value === '') delete next.weekday; else next.weekday = Number(e.target.value); })} style={input}><option value="">{txt('startDay', 'From assignment date')}</option>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <option key={d} value={i}>{tr(`coach:editor.dow${d}`, { defaultValue: d })}</option>)}</select></label>
        <label style={label}>{txt('minutes', 'Planned minutes (optional)')}<input type="number" min="1" max="480" value={day.plannedMinutes ?? ''} onChange={(e) => changeDay((next) => { next.plannedMinutes = e.target.value === '' ? undefined : Number(e.target.value); next.loadCapture = next.plannedMinutes && next.plannedRpe ? 'per_session' : undefined; })} style={input} /></label>
        <label style={label}>{txt('effort', 'Planned effort · RPE (optional)')}<input type="number" min="1" max="10" step="0.5" value={day.plannedRpe ?? ''} onChange={(e) => changeDay((next) => { next.plannedRpe = e.target.value === '' ? undefined : Number(e.target.value); next.loadCapture = next.plannedMinutes && next.plannedRpe ? 'per_session' : undefined; })} style={input} /></label>
      </div>
      {(day.blocks || []).map((block, bi) => <div key={bi} style={{ marginTop: 22 }}>
        <div style={{ color: t.INK50, fontFamily: t.MONO, fontSize: 11 }}>{block.kind || txt('exercises', 'Exercises')}</div>
        {(block.rows || []).map((row, ri) => <fieldset key={row.id} style={{ minWidth: 0, padding: '18px 0', margin: 0, border: 0, borderBottom: `1px solid ${t.RULE || t.INK20}` }}>
          <legend style={{ fontFamily: t.MONO, fontSize: 11 }}>{ri + 1}. {row.name || txt('newExercise', 'New exercise')}</legend>
          <label style={label}>{txt('exercise', 'Exercise')}<input value={row.name || ''} onChange={(e) => changeRow(bi, ri, 'name', e.target.value)} style={input} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            {[[txt('sets', 'Sets'), 'sets', 'number'], [txt('reps', 'Reps'), 'reps', 'text'], [txt('load', 'Load'), 'load', 'number'], [txt('rest', 'Rest'), 'rest', 'text'], [txt('tempo', 'Tempo'), 'tempo', 'text'], [txt('group', 'Superset group'), 'group', 'text']].map(([caption, key, type]) => <label key={key} style={label}>{caption}<input type={type} min={type === 'number' ? 0 : undefined} step={key === 'load' ? 'any' : undefined} value={row[key] ?? ''} onChange={(e) => changeRow(bi, ri, key, type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} style={input} /></label>)}
            {/* ⚠ RPE IS ITS OWN AXIS, not a fourth unit — see the website editor and
                `splitLegacyRpe`. Both editors write one document, so a unit list
                that still offered 'rpe' here would put the retired shape back into
                a plan the website had just migrated. */}
            <label style={label}>{txt('loadUnit', 'Load unit')}<select value={row.loadType || 'kg'} onChange={(e) => changeRow(bi, ri, 'loadType', e.target.value)} style={input}>{['kg', 'lb', 'pct'].map((unit) => <option key={unit} value={unit}>{unit === 'pct' ? txt('percentMax', '% 1RM') : unit}</option>)}</select></label>
            <label style={label}>{txt('targetRpe', 'Target · RPE')}<select value={row.rpe ?? ''} onChange={(e) => changeRow(bi, ri, 'rpe', e.target.value === '' ? '' : Number(e.target.value))} style={input}><option value="">{txt('rpeNone', 'None')}</option>{rpeOptions(row.rpe).map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          </div>
          {row.loadText && <div style={{ fontFamily: t.MONO, fontSize: 11, marginTop: 8, color: t.INK50 }}>{txt('existingLoad', 'Existing prescription')}: {row.loadText}</div>}
          <label style={{ ...label, marginTop: 10 }}>{txt('cue', 'Coaching cue')}<textarea value={row.cue || ''} onChange={(e) => changeRow(bi, ri, 'cue', e.target.value)} rows={2} style={input} /></label>
          {videoUrl(row.video) && <video src={videoUrl(row.video)} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 220, marginTop: 12 }} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={!!upload} onClick={() => { targetRef.current = videoTarget(bi, ri, row); fileRef.current?.click(); }} style={button}>{txt('upload', 'Upload video')}</button>
            {videoUrl(row.video) && <button type="button" onClick={() => changeRow(bi, ri, 'video', '')} style={button}>{txt('removeVideo', 'Remove video')}</button>}
            <button type="button" disabled={ri === 0} onClick={() => changeDay((next) => { const rows = next.blocks[bi].rows; [rows[ri - 1], rows[ri]] = [rows[ri], rows[ri - 1]]; })} style={button}>{txt('moveUp', 'Move up')}</button>
            <button type="button" disabled={ri === block.rows.length - 1} onClick={() => changeDay((next) => { const rows = next.blocks[bi].rows; [rows[ri + 1], rows[ri]] = [rows[ri], rows[ri + 1]]; })} style={button}>{txt('moveDown', 'Move down')}</button>
            <button type="button" onClick={() => { setUndo(clone(value)); changeDay((next) => next.blocks[bi].rows.splice(ri, 1), true); }} style={button}>{txt('removeExercise', 'Remove exercise')}</button>
          </div>
          {videos.length > 0 && <label style={{ ...label, marginTop: 8 }}>{txt('chooseVideo', 'Choose a saved video')}<select value="" onChange={(e) => { const selected = videos.find((v) => v.url === e.target.value); if (selected) attachVideo(videoTarget(bi, ri, row), selected); }} style={input}><option value="">{txt('videoLibrary', 'Video library…')}</option>{videos.map((v) => <option key={v.url} value={v.url}>{v.name}</option>)}</select></label>}
          {upload?.target.wi === wi && upload.target.di === di && upload.target.bi === bi && upload.target.ri === ri && <div role="status" style={{ marginTop: 10 }}><progress aria-label={txt('uploading', 'Uploading video')} /> {txt('uploading', 'Uploading video')} · {upload.name}</div>}
        </fieldset>)}
        <button type="button" onClick={() => changeDay((next) => { next.blocks[bi].rows.push({ id: uid(), name: '', sets: 3, reps: '8', load: '', loadType: 'kg', rpe: '', rest: '90s', tempo: '', cue: '', video: '' }); delete next.outlineOnly; })} style={{ ...button, marginTop: 12 }}>{txt('addExercise', '+ Exercise')}</button>
      </div>)}
      {!(day.blocks || []).length && <button type="button" onClick={() => changeDay((next) => { next.blocks = [{ kind: 'main', rows: [] }]; })} style={button}>{txt('startSession', 'Add exercises')}</button>}
    </>}
    <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; uploadVideo(file, targetRef.current); }} />
    {uploadError && <div role="alert" style={{ color: t.RUST, marginTop: 14 }}>{uploadError}{retry && <button type="button" onClick={() => uploadVideo(retry.file, retry.target)} style={button}>{txt('retry', 'Retry upload')}</button>}</div>}
    {undo && <button type="button" onClick={() => { setValue(undo); setUndo(null); }} style={{ ...button, marginTop: 12 }}>{txt('undo', 'Undo removal')}</button>}
    <label style={{ ...label, marginTop: 20 }}>{txt('note', 'Program note')}<textarea value={value.detail.note || ''} onChange={(e) => change((next) => { next.detail.note = e.target.value; })} rows={3} style={input} /></label>
    {error && <p role="alert" style={{ color: t.RUST }}>{error}</p>}
    {error && plan.id && <button type="button" disabled={saving || !!upload} onClick={() => save(true)} style={button}>{txt('saveCopy', 'Save as new copy')}</button>}
    <button type="button" disabled={saving || !!upload} onClick={() => save()} style={{ ...button, width: '100%', marginTop: 22, background: accent, color: '#04201d', fontWeight: 800, opacity: saving || upload ? 0.6 : 1 }}>{saving ? txt('saving', 'Saving…') : plan.published ? txt('saveChanges', 'Save changes') : txt('saveDraft', 'Save draft')}</button>
    {!plan.published && <button type="button" disabled={saving || !!upload} onClick={() => save(false, true)} style={{ ...button, width: '100%', marginTop: 10 }}>{txt('publishTemplate', 'Publish template')}</button>}
    </fieldset>
  </section>;
}
