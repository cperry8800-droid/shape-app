import React from 'react';
import { groupWorkoutUpdates } from '../services/coachWorkoutLibrary.mjs';

export function useWorkoutTr(inherited) {
  const [, refresh] = React.useState(0);
  React.useEffect(() => window.ShapeLocale?.subscribe?.(() => refresh((value) => value + 1)), []);
  return inherited || ((key, options) => window.ShapeI18n?.t?.(key, options) || options?.defaultValue || key);
}

export default function BSWorkoutFutureUpdates({ plan, t, tr: inheritedTr, onClose }) {
  const tr = useWorkoutTr(inheritedTr);
  const owner = React.useRef(window.ShapeAuth?.getCachedState?.()?.user?.id || null);
  const [rows, setRows] = React.useState(null);
  const [clients, setClients] = React.useState([]);
  const [picked, setPicked] = React.useState({});
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [skipped, setSkipped] = React.useState(0);
  const [completed, setCompleted] = React.useState(0);
  const busyRef = React.useRef(false);
  const txt = (key, text, values = {}) => tr(`coach:workoutEditor.${key}`, { defaultValue: text, ...values });
  React.useEffect(() => {
    let alive = true;
    Promise.all([window.ShapeCoachPlans.assignments(plan.id), window.ShapeAssign?.clients?.('trainer') || []])
      .then(([preview, roster]) => { if (alive) { setRows(preview.assignments); setSkipped(preview.skipped || 0); setClients(roster || []); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [plan.id]);
  const selected = (rows || []).filter((row) => picked[row.id]);
  const apply = async () => {
    if (busyRef.current || !selected.length) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      for (const group of groupWorkoutUpdates(selected)) {
        if ((window.ShapeAuth?.getCachedState?.()?.user?.id || null) !== owner.current) throw new Error(txt('accountChanged', 'Your account changed. Reopen the library before saving.'));
        await window.ShapeCoachPlans.updateAssignments({ clientId: group.clientId, assignmentPreconditions: group.rows.map((row) => row.before), sessions: group.rows.map((row) => ({ title: row.title, description: plan.name, kind: 'template', scheduledDate: row.scheduledDate, payload: row.payload })) });
        const ids = new Set(group.rows.map((row) => row.id));
        setRows((previous) => previous.filter((row) => !ids.has(row.id)));
        setPicked((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.has(id))));
        setCompleted((count) => count + group.rows.length);
      }
    } catch (e) { setError(e.message || txt('updateFailed', 'Could not update those workouts. Review and retry.')); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const button = { minHeight: 44, padding: '10px 12px', fontFamily: t.MONO, fontSize: 11, color: t.INK, background: 'transparent', border: `1px solid ${t.RULE || t.INK20}`, borderRadius: 8, cursor: 'pointer' };
  const summary = (exercise) => [exercise.sets && exercise.reps ? `${exercise.sets} × ${exercise.reps}` : '', exercise.load, exercise.rest, exercise.tempo, exercise.cue, exercise.video ? txt('demoAttached', 'Demo attached') : ''].filter(Boolean).join(' · ');
  return <section style={{ padding: `${window.BS_MAST_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))'} ${t.padX || 24}px 40px`, color: t.INK }}>
    <button type="button" disabled={busy} onClick={onClose} style={button}>{txt('backEditor', '← Saved workout')}</button>
    <h1 style={{ fontFamily: t.DISPLAY, fontSize: 28 }}>{txt('futureTitle', 'Update future workouts')}</h1>
    <p style={{ fontFamily: t.BODY, fontSize: 13, lineHeight: 1.6 }}>{txt('futureHint', 'Choose the upcoming workouts to update from this saved template. Dates stay the same. Today’s workouts and logged sessions are excluded. Clients already training keep the prescription they started.')}</p>
    {skipped > 0 && <p>{txt('futureSkipped', '{count} assignments with logged work, removed days or client changes need individual review.', { count: skipped })}</p>}
    {rows === null && !error && <p role="status">{txt('futureLoading', 'Loading future workouts…')}</p>}
    {rows?.length === 0 && <p>{txt('futureEmpty', 'No eligible future workouts.')}</p>}
    {(rows || []).map((row) => <div key={row.id} style={{ borderTop: `1px solid ${t.RULE || t.INK20}`, padding: '14px 0' }}>
      <label style={{ display: 'flex', gap: 10, minHeight: 44, alignItems: 'center', fontFamily: t.BODY, fontSize: 14 }}>
        <input type="checkbox" disabled={busy} checked={!!picked[row.id]} onChange={(e) => setPicked((previous) => ({ ...previous, [row.id]: e.target.checked }))} />
        <span>{clients.find((client) => client.userId === row.clientId)?.name || txt('client', 'Client')} · {row.scheduledDate}<br />{row.title}</span>
      </label>
      <details style={{ marginTop: 8 }}><summary style={{ minHeight: 44, cursor: 'pointer' }}>{txt('reviewChanges', 'Review changes')}</summary>
        {[[txt('current', 'Current'), row.before?.title, row.before?.exercises], [txt('updated', 'Updated'), row.title, row.payload?.exercises]].map(([heading, title, exercises]) => <div key={heading} style={{ marginBottom: 14, fontFamily: t.BODY, fontSize: 13 }}><strong>{heading} · {title}</strong>{(exercises || []).map((exercise, index) => <p key={index}><b>{exercise.name}</b><br />{summary(exercise)}</p>)}</div>)}
      </details>
    </div>)}
    {completed > 0 && <p role="status">{txt('futureDone', '{count} workouts updated.', { count: completed })}</p>}
    {error && <p role="alert" style={{ color: t.RUST }}>{error}</p>}
    <button type="button" disabled={busy || !selected.length} onClick={apply} style={{ ...button, width: '100%', opacity: busy || !selected.length ? 0.5 : 1 }}>{busy ? txt('updating', 'Updating…') : txt('updateSelected', 'Update {count} selected workouts', { count: selected.length })}</button>
  </section>;
}
