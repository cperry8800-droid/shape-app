import React from 'react';
import { bsValidLivePayload, bsValidLiveCoachPayload } from '../services/liveProgress.mjs';

// A coach observes the client's ledger. Only the cue composer writes anything.
export default function BSLiveWorkoutWatch({ client = 'Alex Rivera', clientId = null, workout = 'Upper Pull — Peak', role = 'trainer', onBack = () => {}, t, tr, masthead, mastTop = '44px' }) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [now, setNow] = React.useState(Date.now());
  const [demoStart] = React.useState(() => Date.now() - 1855000);
  const [snapshot, setSnapshot] = React.useState(null);
  const [cueDraft, setCueDraft] = React.useState('');
  const [cueState, setCueState] = React.useState('idle');
  const [sentCue, setSentCue] = React.useState('');
  const [authValid, setAuthValid] = React.useState(true);
  const sendLock = React.useRef(false);
  const generation = React.useRef(0);
  const liveMode = !!clientId;
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    generation.current++;
    sendLock.current = false;
    setAuthValid(true);
    setCueDraft(''); setCueState('idle'); setSentCue(''); setSnapshot(null);
    const off = clientId && window.ShapeLiveProgress?.watch?.(clientId, value => setSnapshot({ ...value, clientId }));
    const owner = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
    const auth = window.ShapeAuth?.client?.auth?.onAuthStateChange?.((event, session) => {
      if (event !== 'SIGNED_OUT' && (session?.user?.id || null) === owner) return;
      generation.current++; sendLock.current = false;
      setAuthValid(false); setSnapshot(null); setCueDraft(''); setSentCue(''); setCueState('idle');
    })?.data?.subscription;
    return () => { generation.current++; if (typeof off === 'function') off(); auth?.unsubscribe(); };
  }, [clientId]);
  const current = authValid && snapshot?.clientId === clientId ? snapshot : null;
  const validRow = row => row && Date.parse(row.expires_at) > now ? row : null;
  const coachRow = validRow(current?.coachRow);
  const publicRow = validRow(current?.publicRow);
  const cp = coachRow ? bsValidLiveCoachPayload(coachRow.payload) : null;
  const publicPayload = publicRow ? bsValidLivePayload(publicRow.payload) : null;
  const lp = cp || (publicPayload?.kind !== 'cooking' ? publicPayload : null);
  const status = liveMode ? (!authValid ? 'idle' : current?.status || (window.ShapeLiveProgress?.watch ? 'connecting' : 'reconnecting')) : 'preview';
  const statusCopy = {
    live: tr('coach:live.liveTag', { defaultValue: 'Live' }),
    connecting: tr('coach:live.connecting', { defaultValue: 'Connecting…' }),
    reconnecting: tr('coach:live.reconnecting', { defaultValue: 'Reconnecting…' }),
    stale: tr('coach:live.stale', { defaultValue: 'Waiting for client updates' }),
    idle: tr('coach:live.idle', { defaultValue: 'No active workout shared' }),
    preview: tr('coach:live.preview', { defaultValue: 'Preview' }),
  };
  const statusLabel = statusCopy[status] || statusCopy.reconnecting;
  const sourceRow = cp ? coachRow : publicRow;
  const startedAt = liveMode ? Date.parse(sourceRow?.started_at) : demoStart;
  const elapsed = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;
  const fmt = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const demoMoves = [
    { n: 'Pull-up', total: 4, done: 4 },
    { n: 'Barbell row', total: 4, done: 2 },
    { n: 'Chest-sup. row', total: 3, done: 0 },
    { n: 'Face pull', total: 3, done: 0 },
    { n: 'Incline curl', total: 3, done: 0 },
    { n: 'Farmer carry', total: 3, done: 0 },
  ];
  const moves = liveMode ? lp?.exercises || [] : demoMoves;
  const curIdx = liveMode ? lp?.curIdx ?? -1 : 1;
  const cur = moves[curIdx] || null;
  const total = moves.reduce((n, m) => n + m.total, 0);
  const done = moves.reduce((n, m) => n + m.done, 0);
  const pct = total ? Math.round(done / total * 100) : 0;
  // A completion COUNT is not a set index: clients can log sets out of order.
  const nextSet = cur ? (cp && cur.sets?.length === cur.total ? cur.sets.findIndex(s => !s.done) : !liveMode ? cur.done : -1) : -1;
  const workoutName = liveMode ? lp?.title || tr('coach:live.session', { defaultValue: 'Workout' }) : workout;
  const canSend = !liveMode || (!!cp && status === 'live');
  const sendCue = async text => {
    const message = String(text ?? cueDraft).trim();
    if (!message || sendLock.current || !canSend) return;
    if (!liveMode) { setCueState('preview'); return; }
    const requestGeneration = generation.current;
    const owner = window.ShapeAuth?.getCachedState?.()?.user?.id;
    sendLock.current = true; setCueState('sending'); setSentCue('');
    const isCurrent = () => generation.current === requestGeneration && owner === window.ShapeAuth?.getCachedState?.()?.user?.id;
    try {
      if (!window.ShapeCoachFeed?.sendCue) throw new Error('Cue service unavailable');
      await window.ShapeCoachFeed.sendCue({ clientId, text: message, role });
      if (!isCurrent()) return;
      setSentCue(message); setCueState('sent');
      setCueDraft(draft => draft.trim() === message ? '' : draft);
    } catch {
      if (isCurrent()) { setCueState('error'); setCueDraft(draft => draft || message); }
    } finally {
      if (generation.current === requestGeneration) sendLock.current = false;
    }
  };
  const quickCues = [
    tr('coach:live.cueEccentric', { defaultValue: 'Slow the eccentric' }),
    tr('coach:live.cueHold', { defaultValue: 'Hold this weight' }),
    tr('coach:live.cueOneMore', { defaultValue: 'One more set' }),
    tr('coach:live.cueRest', { defaultValue: 'Lengthen your rest' }),
  ];
  const mono = { fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.06em', color: t.INK70 };
  const button = { ...mono, minHeight: 44, borderRadius: 6, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, padding: '10px 12px', cursor: 'pointer' };
  const section = { padding: `18px ${t.padX}px 0` };
  const heading = { ...mono, textTransform: 'uppercase', fontWeight: 800, color: t.INK };
  const Page = window.BSPage || React.Fragment;
  const queue = moves.map((m, i) => ({ ...m, index: i })).sort((a, b) => (a.index === curIdx ? -1 : b.index === curIdx ? 1 : (a.done >= a.total) - (b.done >= b.total) || a.index - b.index));
  return <Page>
    <div style={{ padding: `${mastTop} ${t.padX}px 0` }}>{masthead}</div>
    <div style={{ ...section, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" onClick={onBack} style={button}>{tr('coach:live.close', { defaultValue: '✕ Close' })}</button>
      <div style={{ ...mono, color: status === 'live' ? teal : t.INK70 }}>
        <span role="status">{statusLabel}</span>{elapsed != null ? ` · ${fmt(elapsed)}` : ''}
      </div>
      {total > 0 && <span style={mono}>{tr('coach:live.setsCount', { defaultValue: 'Sets {done}/{total}', done, total })}</span>}
    </div>
    <div style={section}>
      <div style={heading}>{tr('coach:live.watchTitle', { defaultValue: 'Workout monitor' })}</div>
      <h1 style={{ margin: '6px 0', fontFamily: t.DISPLAY, fontSize: 29, color: t.INK }}>{client}</h1>
      {moves.length ? <>
        <div style={mono}>{workoutName} · {pct}%{lp ? ` · ${lp.resting ? tr('coach:live.resting', { defaultValue: 'Resting' }) : tr('coach:live.working', { defaultValue: 'Working' })}` : ''}</div>
        <div role="progressbar" aria-label={tr('coach:live.watchTitle', { defaultValue: 'Workout monitor' })} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={{ marginTop: 12, height: 4, background: t.HAIR }}><div style={{ width: `${pct}%`, height: '100%', background: teal }} /></div>
      </> : <p role="status" style={{ ...mono, lineHeight: 1.6 }}>{statusLabel}</p>}
      {liveMode && current?.lastSyncedAt && <div style={{ ...mono, marginTop: 8 }}>{tr('coach:live.checkedAt', { defaultValue: 'Last checked {time}', time: new Date(current.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) })}</div>}
    </div>
    {cur && <section style={section}>
      <div style={heading}>{tr('coach:live.exerciseOf', { defaultValue: 'Exercise {cur} of {total}', cur: curIdx + 1, total: moves.length })}</div>
      <h2 style={{ margin: '6px 0 12px', fontFamily: t.DISPLAY, fontSize: 27, color: t.INK }}>{cur.n}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: t.INK, fontFamily: t.MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <caption style={{ ...mono, textAlign: 'left', paddingBottom: 10 }}>{tr('coach:live.readOnly', { defaultValue: 'Client’s recorded sets · read only' })}</caption>
          <thead><tr>{[
            tr('coach:live.colSet', { defaultValue: 'Set' }),
            tr('coach:live.colWeight', { defaultValue: 'Weight' }) + (cp?.loadUnit ? ` (${cp.loadUnit})` : !liveMode ? ' (lb)' : ''),
            tr('coach:live.colReps', { defaultValue: 'Reps' }),
            tr('coach:common.rpe', { defaultValue: 'RPE' }),
          ].map(label => <th key={label} scope="col" style={{ ...mono, padding: '8px 4px', textAlign: 'center', overflowWrap: 'anywhere' }}>{label}</th>)}</tr></thead>
          <tbody>{Array.from({ length: cur.total }, (_, i) => {
            const row = cp ? cur.sets?.[i] : !liveMode ? { done: i < cur.done, load: i < cur.done ? '155' : '', reps: i < cur.done ? '8' : '', rpe: i < cur.done ? '8.0' : '' } : null;
            return <tr key={i} data-completed={row?.done === true} style={{ borderTop: `1px solid ${t.HAIR}`, background: i === nextSet ? t.PAPER2 : 'transparent' }}>
              <th scope="row" style={{ fontWeight: 700, padding: '13px 4px', color: row?.done ? teal : t.INK }}>{i + 1}{row?.done ? ' ✓' : ''}</th>
              {['load', 'reps', 'rpe'].map(field => <td key={field} style={{ padding: '13px 4px', textAlign: 'center' }}>{row?.done && row[field] !== '' ? row[field] : '—'}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
    <section style={section}>
      <h2 style={{ ...heading, margin: '0 0 10px' }}>{tr('coach:live.sendCue', { defaultValue: 'Send a cue' })}</h2>
      <div role="status" aria-live="polite" style={{ ...mono, lineHeight: 1.6, marginBottom: 8 }}>
        {cueState === 'sending' ? tr('coach:live.sending', { defaultValue: 'Sending…' }) : cueState === 'error' ? tr('coach:live.sendFailed', { defaultValue: 'Could not send. Your cue is kept—try again.' }) : cueState === 'preview' ? tr('coach:live.previewCue', { defaultValue: 'Preview only—no cue was sent.' }) : sentCue ? tr('coach:live.sentTo', { defaultValue: 'Sent to {name}: “{cue}”', name: client, cue: sentCue }) : ''}
      </div>
      <form onSubmit={e => { e.preventDefault(); sendCue(); }} style={{ display: 'flex', gap: 8 }}>
        <input aria-label={tr('coach:live.sendCue', { defaultValue: 'Send a cue' })} maxLength={500} value={cueDraft} onChange={e => setCueDraft(e.target.value)} disabled={!canSend || cueState === 'sending'} placeholder={tr('coach:live.cuePlaceholder', { defaultValue: 'Type a quick cue…' })} style={{ flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', borderRadius: 6, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '10px 12px', fontFamily: t.DISPLAY, fontSize: 16 }} />
        <button type="submit" disabled={!canSend || !cueDraft.trim() || cueState === 'sending'} style={{ ...button, background: teal, color: t.isLight ? '#fff' : '#04201d', opacity: !canSend || !cueDraft.trim() || cueState === 'sending' ? 0.5 : 1 }}>{tr('coach:common.send', { defaultValue: 'Send' })}</button>
      </form>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{quickCues.map(q => <button type="button" key={q} disabled={!canSend || cueState === 'sending'} onClick={() => sendCue(q)} style={{ ...button, opacity: !canSend || cueState === 'sending' ? 0.5 : 1 }}>{q}</button>)}</div>
      <p style={{ ...mono, lineHeight: 1.6 }}>{tr('coach:live.cueFocusNote', { defaultValue: 'Your latest cue also updates your coaching focus note.' })}</p>
    </section>
    {queue.length > 0 && <section style={section}>
      <h2 style={heading}>{tr('coach:live.queue', { defaultValue: 'Queue' })}</h2>
      {queue.map(m => <div key={m.index} style={{ borderLeft: `3px solid ${m.index === curIdx ? teal : 'transparent'}`, display: 'flex', alignItems: 'baseline', gap: 10, padding: '14px 0 14px 10px', borderBottom: `1px solid ${t.HAIR}` }}>
        <span style={{ ...mono, color: teal }}>{m.done >= m.total ? '✓' : m.index === curIdx ? tr('coach:common.now', { defaultValue: 'NOW' }) : m.index + 1}</span>
        <span style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 16, color: t.INK }}>{m.n}</span>
        <span style={mono}>{m.done}/{m.total}</span>
      </div>)}
    </section>}
    <div style={{ ...section, paddingBottom: 24 }}><button type="button" onClick={onBack} style={{ ...button, width: '100%' }}>{tr('coach:live.stopWatching', { defaultValue: 'Stop watching' })}</button></div>
  </Page>;
}
