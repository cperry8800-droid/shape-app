import React from 'react';
import { bsValidLivePayload, bsValidLiveCoachPayload } from '../services/liveProgress.mjs';
import { createWorkoutDiscussion } from '../../../public/newdesign/workoutDiscussion.mjs';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';
import { bsRaised } from './BSProInstrument.jsx';
import { bsMpGlass } from './BSMemberBento.jsx';
import { bsWsHexA as hexA } from './bsMagazine.mjs';
const WorkoutDiscussion = createWorkoutDiscussion(React);

// The coach's view of a client's live workout, as the owner picked it (2026-11-04: "use option B for coaches
// view, but use this section from C in bottom part"). B's top: the client's monogram and the elapsed clock on
// glass, the move on a raised card with its set lights, the latest set as a pair board and the overall progress,
// then the recorded sets as glass rows. C's foot: Send a cue as lit quick cues over a lit composer, in the coach's
// own colour; the Queue as lit rows, in the client's teal; Stop watching.
// Client readings stay read-only; cues and private feedback use their own stores.
export default function BSLiveWorkoutWatch({ client = 'Alex Rivera', clientId = null, workout = 'Upper Pull — Peak', role = 'trainer', onBack = () => {}, onMessage, t, tr, masthead, mastTop = '44px' }) {
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
  const logId = React.useId();
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
  // Read at call time: the chrome defines these on window, and this module never imports it back.
  const Page = window.BSPage || React.Fragment;
  const BackRow = window.BSBackRow || null;
  const queue = moves.map((m, i) => ({ ...m, index: i })).sort((a, b) => (a.index === curIdx ? -1 : b.index === curIdx ? 1 : (a.done >= a.total) - (b.done >= b.total) || a.index - b.index));

  const HEAD = BS_CLEAN_HEAD, SANS = BS_CLEAN_SANS, INK = t.INK, px = t.padX;
  const tealText = t.isLight ? '#07706a' : teal;
  // The coach's own colour marks what the coach does here (the cue); teal is the client, live.
  const hue = role === 'nutritionist' ? '#a07a2e' : '#c0533b';
  const hueText = t.isLight ? hue : (role === 'nutritionist' ? '#d8b25a' : '#e0654b');
  const tab = { fontVariantNumeric: 'tabular-nums' };
  const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const kick = (size, color, extra) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, ...extra });
  const pad2 = n => String(n).padStart(2, '0');
  const liveLit = status === 'live' || status === 'preview';
  const stateWord = lp ? (lp.resting ? tr('coach:live.resting', { defaultValue: 'Resting' }) : tr('coach:live.working', { defaultValue: 'Working' })) : null;
  const unit = cp?.loadUnit || (!liveMode ? 'lb' : '');
  const colSet = tr('coach:live.colSet', { defaultValue: 'Set' });
  const weightHead = tr('coach:live.colWeight', { defaultValue: 'Weight' }) + (unit ? ` (${unit})` : '');
  const colReps = tr('coach:live.colReps', { defaultValue: 'Reps' });
  const colRpe = tr('coach:common.rpe', { defaultValue: 'RPE' });
  const nowWord = tr('coach:common.now', { defaultValue: 'NOW' });
  const watchTitle = tr('coach:live.watchTitle', { defaultValue: 'Workout monitor' });
  const exerciseOf = cur ? tr('coach:live.exerciseOf', { defaultValue: 'Exercise {cur} of {total}', cur: curIdx + 1, total: moves.length }) : '';
  const setsCount = tr('coach:live.setsCount', { defaultValue: 'Sets {done}/{total}', done, total });
  const readOnly = tr('coach:live.readOnly', { defaultValue: 'Client’s recorded sets · read only' });
  const elapsedWord = tr('coach:review.statElapsed', { defaultValue: 'Elapsed' });
  const clock = elapsed != null ? fmt(elapsed) : '—';
  // A set's recorded figures: the coach payload's own set, the demo's, or none (the public payload has no sets).
  const rowAt = i => cp ? cur?.sets?.[i] || null : !liveMode && cur ? { done: i < cur.done, load: i < cur.done ? '155' : '', reps: i < cur.done ? '8' : '', rpe: i < cur.done ? '8.0' : '' } : null;
  const fig = (row, f) => (row?.done && row[f] !== '' ? row[f] : '—');
  const setIdx = cur ? Array.from({ length: cur.total }, (_, i) => i) : [];
  const latestIdx = setIdx.filter(i => rowAt(i)?.done).pop();
  const latest = latestIdx != null ? rowAt(latestIdx) : null;
  // A light shows a set's own done flag where the payload has the sets, else the completion count (a meter).
  const hasRows = (!!cp && cur?.sets?.length === cur?.total) || !liveMode;
  const litDone = i => (hasRows ? !!rowAt(i)?.done : i < (cur?.done || 0));
  const cueStatus = cueState === 'sending' ? tr('coach:live.sending', { defaultValue: 'Sending…' }) : cueState === 'error' ? tr('coach:live.sendFailed', { defaultValue: 'Could not send. Your cue is kept—try again.' }) : cueState === 'preview' ? tr('coach:live.previewCue', { defaultValue: 'Preview only—no cue was sent.' }) : sentCue ? tr('coach:live.sentTo', { defaultValue: 'Sent to {name}: “{cue}”', name: client, cue: sentCue }) : '';
  const cueTone = cueState === 'error' ? (t.AMBER || '#d8a23a') : cueState === 'sent' ? tealText : t.INK70;
  const cueOff = !canSend || cueState === 'sending';
  const sendOff = cueOff || !cueDraft.trim();
  const checked = liveMode && current?.lastSyncedAt ? tr('coach:live.checkedAt', { defaultValue: 'Last checked {time}', time: new Date(current.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) }) : null;
  const sectionPad = top => ({ padding: `${top}px ${px}px 0` });
  const progressAria = { role: 'progressbar', 'aria-label': watchTitle, 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done };
  const emptyEl = <p role="status" style={{ margin: '14px 0 0', fontFamily: SANS, fontSize: 14, lineHeight: 1.5, color: t.INK70 }}>{statusLabel}</p>;
  // B's surfaces: a glass pane, and the inset slot of the pair board.
  const glass = (r = 16) => bsMpGlass(t, INK, { radius: r });
  const inset = { borderRadius: 14, background: t.isLight ? hexA(INK, 0.045) : 'rgba(0,0,0,0.3)', border: `1px solid ${hexA(INK, t.isLight ? 0.06 : 0.08)}` };
  const LOG_COLS = '44px repeat(3, minmax(0, 1fr))';
  const initials = String(client || '?').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  // C's lit slot: a dark inset in a hairline frame, framed in its colour and glowing on dark paper when lit.
  const ledBox = (on, c = teal) => ({ borderRadius: 10, boxSizing: 'border-box', background: t.isLight ? hexA(INK, 0.045) : 'rgba(0,0,0,0.45)', border: `1px solid ${on ? hexA(c, t.isLight ? 0.55 : 0.6) : hexA(INK, 0.12)}`, boxShadow: on && !t.isLight ? `0 0 16px -6px ${hexA(c, 0.85)}` : 'none' });
  const glowT = (c, a = 0.65) => (t.isLight ? {} : { textShadow: `0 0 10px ${hexA(c, a)}` });
  // A move's planned sets against the logged ones, as small ticks (a bar past 8 sets).
  const miniTrack = (m, on, off, w) => (m.total <= 8
    ? Array.from({ length: m.total }, (_, k) => <span key={k} style={{ width: w, height: 4, borderRadius: 2, background: k < m.done ? on : off }} />)
    : <span style={{ width: w * 8 + 14, height: 4, borderRadius: 2, background: `linear-gradient(90deg, ${on} ${m.done / m.total * 100}%, ${off} 0)` }} />);
  // The live lamp pulses on opacity alone (no per-tick paint, no filter) and stands still under reduced motion.
  // Keyboard focus: the cue field lights in the coach's colour, a button rings.
  const css = '@keyframes bsLwPulse{0%,100%{opacity:.35}50%{opacity:1}}@media (prefers-reduced-motion: reduce){[data-lw-lamp]{animation:none!important}}'
    + `[data-lw-cue] input:focus{outline:1.5px solid ${hue};outline-offset:-1px}[data-lw-cue] button:focus-visible{outline:2px solid ${hueText};outline-offset:2px}[data-lw-stop]:focus-visible{outline:2px solid ${tealText};outline-offset:2px}`;
  const lamp = <span aria-hidden data-lw-lamp="" style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, display: 'inline-block', background: liveLit ? teal : t.INK50, boxShadow: liveLit && !t.isLight ? `0 0 8px ${hexA(teal, 0.9)}` : 'none', animation: liveLit ? 'bsLwPulse 2s ease-in-out infinite' : 'none' }} />;
  const statusPill = <span style={{ ...glass(999), display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 30, padding: '0 12px', ...kick(8.5, liveLit ? tealText : t.INK70) }}>{lamp}<span role="status">{statusLabel}</span></span>;

  return <Page>
    <style>{css}</style>
    <div style={{ padding: `${mastTop} ${px}px 0` }}>{masthead}</div>
    {/* ← Back where every page keeps it, the live status on its right. */}
    <div style={{ padding: `0 ${px}px` }}>{BackRow ? <BackRow onBack={onBack} trailing={statusPill} /> : statusPill}</div>
    {/* The head: the client's monogram in the coach's colour, the workout, the elapsed clock on glass. */}
    <div style={{ ...sectionPad(8), display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden style={{ width: 46, height: 46, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', background: `linear-gradient(150deg, ${hue}, ${hexA(hue, 0.72)})`, color: '#fff', fontFamily: HEAD, fontSize: 16, fontWeight: 700, boxShadow: t.isLight ? `0 8px 16px -10px ${hexA(hue, 0.9)}` : `inset 0 1px 0 rgba(255,255,255,0.22), 0 10px 20px -12px ${hexA(hue, 0.95)}` }}>{initials}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={kick(8, t.INK50)}>{watchTitle}</div>
        <h1 style={{ margin: '3px 0 0', fontFamily: HEAD, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: INK, ...clip }}>{client}</h1>
        <div style={{ marginTop: 1, fontFamily: SANS, fontSize: 13, color: t.INK70, ...clip }}>{workoutName}</div>
      </div>
      <div data-lw-elapsed="" style={{ ...glass(14), flexShrink: 0, padding: '7px 11px 8px', textAlign: 'right' }}>
        <div style={kick(7, t.INK50)}>{elapsedWord}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 18, fontWeight: 700, color: liveLit ? tealText : INK, ...tab }}>{clock}</div>
      </div>
    </div>
    {checked && <div style={{ padding: `8px ${px}px 0`, fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.04em', color: t.INK50 }}>{checked}</div>}
    {/* The move on a raised card: its set lights, the latest set as a pair board, the whole workout's progress. */}
    <div style={sectionPad(16)}>
      {moves.length ? <div data-lw-hero="" style={{ ...bsRaised(t, teal), padding: '16px 16px 14px' }}>
        {cur && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={kick(8.5, tealText)}>{exerciseOf}</span>
            {stateWord && <span style={{ ...kick(7.5, lp.resting ? t.INK70 : tealText), padding: '5px 9px', borderRadius: 999, background: hexA(lp.resting ? INK : teal, 0.12) }}>{stateWord}</span>}
          </div>
          <h2 style={{ margin: '6px 0 12px', fontFamily: HEAD, fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, color: INK }}>{cur.n}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div aria-hidden style={{ flex: 1, display: 'flex', gap: 5 }}>{setIdx.map(i => {
              const on = litDone(i), nowS = i === nextSet;
              return <span key={i} data-lw-light={on ? 'done' : nowS ? 'now' : 'open'} style={{ flex: 1, minWidth: 0, height: 8, borderRadius: 999, boxSizing: 'border-box', background: on ? teal : 'transparent', border: on ? 0 : `1.5px solid ${nowS ? teal : hexA(INK, 0.16)}`, boxShadow: !t.isLight && (on || nowS) ? `0 0 10px ${hexA(teal, on ? 0.5 : 0.4)}` : 'none' }} />;
            })}</div>
            <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: INK, ...tab }}>{cur.done}/{cur.total}</span>
          </div>
          <div style={{ marginTop: 14, ...kick(7.5, t.INK50, { letterSpacing: '0.12em' }) }}>{latest ? `${colSet} ${pad2(latestIdx + 1)} ✓` : colSet}</div>
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {[[weightHead, 'load'], [colReps, 'reps'], [colRpe, 'rpe']].map(([label, f], k) => <div key={f} data-lw-pair={f} style={{ ...inset, minWidth: 0, padding: '9px 11px 10px' }}>
              <div style={{ ...kick(7, t.INK50, { letterSpacing: '0.1em' }), ...clip }}>{label}</div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: latest ? (k ? INK : tealText) : t.INK50, ...tab }}>{fig(latest, f)}</div>
            </div>)}
          </div>
        </>}
        <div style={{ marginTop: cur ? 14 : 0, paddingTop: cur ? 12 : 0, borderTop: cur ? `1px solid ${hexA(INK, 0.08)}` : 0 }}>
          <div {...progressAria} style={{ height: 4, borderRadius: 999, background: hexA(INK, 0.1), overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: teal }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 7, fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.03em', color: t.INK70, ...tab }}><span>{setsCount}</span><span>{pct}%</span></div>
        </div>
      </div> : <div style={{ ...glass(16), padding: '2px 16px 14px' }}>{emptyEl}</div>}
    </div>
    {/* The client's recorded sets on glass rows, read only; the set in progress outlined. */}
    {cur && <section style={sectionPad(18)}>
      <div id={logId} style={{ ...kick(7.5, t.INK50, { fontWeight: 700, letterSpacing: '0.1em' }), marginBottom: 8 }}>{readOnly}</div>
      <div role="table" aria-labelledby={logId} style={{ display: 'grid', gap: 5 }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: LOG_COLS, columnGap: 8, padding: '0 14px', ...kick(7, t.INK50, { fontWeight: 700, letterSpacing: '0.1em' }) }}>
          {[colSet, weightHead, colReps, colRpe].map((label, k) => <span role="columnheader" key={label} style={{ textAlign: k ? 'right' : 'left', ...clip }}>{label}</span>)}
        </div>
        {setIdx.map(i => {
          const row = rowAt(i), on = i === nextSet;
          return <div role="row" key={i} data-completed={row?.done === true} aria-current={on ? 'step' : undefined} style={{ ...glass(12), display: 'grid', gridTemplateColumns: LOG_COLS, columnGap: 8, alignItems: 'center', minHeight: 36, padding: '0 14px', ...(on ? { border: `1px solid ${hexA(teal, 0.6)}` } : {}) }}>
            <span role="rowheader" style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 800, color: row?.done || on ? tealText : t.INK50, ...tab }}>{pad2(i + 1)}{row?.done ? ' ✓' : ''}</span>
            {['load', 'reps', 'rpe'].map(f => <span role="cell" key={f} style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 14.5, fontWeight: 600, color: row?.done ? INK : t.INK50, ...tab }}>{fig(row, f)}</span>)}
          </div>;
        })}
      </div>
    </section>}
    {/* Send a cue, in the coach's colour: the quick cues as lit slots two by two, then the composer. */}
    <section data-lw-cue="" style={sectionPad(20)}>
      <h2 style={{ margin: '0 0 8px', ...kick(8.5, hueText, { letterSpacing: '0.18em' }), ...glowT(hue, 0.45) }}>{tr('coach:live.sendCue', { defaultValue: 'Send a cue' })}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>{quickCues.map(q => <button type="button" key={q} disabled={cueOff} onClick={() => sendCue(q)} style={{ minHeight: 44, cursor: cueOff ? 'default' : 'pointer', opacity: cueOff ? 0.5 : 1, ...ledBox(false), color: INK, fontFamily: SANS, fontSize: 13, lineHeight: 1.25, textAlign: 'left', padding: '6px 12px' }}>{q}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); sendCue(); }} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input aria-label={tr('coach:live.sendCue', { defaultValue: 'Send a cue' })} maxLength={500} value={cueDraft} onChange={e => setCueDraft(e.target.value)} disabled={cueOff} placeholder={tr('coach:live.cuePlaceholder', { defaultValue: 'Type a quick cue…' })} style={{ flex: 1, minWidth: 0, minHeight: 44, color: INK, fontFamily: SANS, fontSize: 16, ...ledBox(!!cueDraft.trim(), hue), padding: '0 12px' }} />
        <button type="submit" disabled={sendOff} style={{ minHeight: 44, minWidth: 72, cursor: sendOff ? 'default' : 'pointer', ...ledBox(!sendOff, hue), padding: '0 16px', opacity: sendOff ? 0.55 : 1, ...kick(9.5, sendOff ? t.INK50 : hueText), ...(sendOff ? {} : glowT(hue, 0.6)) }}>{tr('coach:common.send', { defaultValue: 'Send' })}</button>
      </form>
      <div role="status" aria-live="polite" style={{ marginTop: cueStatus ? 10 : 0, fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.03em', lineHeight: 1.5, color: cueTone, ...(cueState === 'sent' ? glowT(teal, 0.45) : {}) }}>{cueStatus}</div>
      <p style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: 12, lineHeight: 1.45, color: t.INK50 }}>{tr('coach:live.cueFocusNote', { defaultValue: 'Your latest cue also updates your coaching focus note.' })}</p>
    </section>
    {liveMode && authValid && <div style={{ padding: `6px ${px}px 0` }}><WorkoutDiscussion key={clientId + ':' + (sourceRow?.started_at || '')}
      db={window.ShapeAuth?.client} clientId={clientId} clientName={client} role={role}
      startedAt={sourceRow?.started_at} title={workoutName} exercise={cur?.n} canComment={canSend}
      theme={{ink:t.INK,muted:t.INK70,line:t.RULE,paper:t.PAPER2}}
      onOpenChat={conversationId=>{if(onMessage)onMessage(conversationId);else {onBack();window.dispatchEvent(new CustomEvent('shape:proMessageClient',{detail:{client:{userId:clientId,n:client},conversationId}}));}}}/></div>}
    {/* The queue, in the client's teal: lit rows, each led by its number slot; the move in hand framed with NOW. */}
    {queue.length > 0 && <section style={sectionPad(22)}>
      <h2 style={{ margin: '0 0 8px', ...kick(8.5, tealText, { letterSpacing: '0.2em' }) }}>{tr('coach:live.queue', { defaultValue: 'Queue' })}</h2>
      <div role="list" style={{ display: 'grid', gap: 6 }}>{queue.map(m => {
        const isCur = m.index === curIdx, fin = m.done >= m.total;
        return <div role="listitem" key={m.index} aria-current={isCur ? 'step' : undefined} style={{ ...glass(14), display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) auto', columnGap: 10, alignItems: 'center', padding: '6px 12px 6px 6px', ...(isCur ? { border: `1px solid ${hexA(teal, 0.55)}` } : {}), opacity: fin ? 0.55 : 1 }}>
          <span data-lw-slot="" style={{ ...ledBox(isCur || fin), height: 30, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: isCur || fin ? tealText : t.INK50, ...tab, ...(isCur ? glowT(teal) : {}) }}>{fin ? '✓' : pad2(m.index + 1)}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: SANS, fontSize: 14.5, fontWeight: 650, color: INK, ...clip }}>{m.n}{isCur && <span style={{ marginLeft: 8, ...kick(7.5, tealText), ...glowT(teal) }}>{nowWord}</span>}</span>
            <span aria-hidden style={{ display: 'flex', gap: 2, marginTop: 5 }}>{miniTrack(m, teal, hexA(INK, 0.14), 9)}</span>
          </span>
          <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: isCur ? tealText : t.INK70, ...tab, ...(isCur ? glowT(teal, 0.5) : {}) }}>{m.done}/{m.total}</span>
        </div>;
      })}</div>
    </section>}
    <div style={{ padding: `22px ${px}px 28px` }}><button data-bs-back="" data-lw-stop="" type="button" onClick={onBack} style={{ width: '100%', minHeight: 44, cursor: 'pointer', ...ledBox(false), ...kick(9.5, t.INK70) }}>{tr('coach:live.stopWatching', { defaultValue: 'Stop watching' })}</button></div>
  </Page>;
}
