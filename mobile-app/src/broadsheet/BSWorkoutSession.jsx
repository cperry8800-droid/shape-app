import React from 'react';
import { createPortal } from 'react-dom';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType } from './bsCleanType.jsx';
import { bsMpGlass } from './BSMemberBento.jsx';
import { bsRaised } from './BSProInstrument.jsx';
// ─── THE LIVE SESSION: Focus · Workout log · Guided coach ────────────────────────────────────────
// The three views a member picks on "Choose your workout view", redrawn in the glass look the owner
// picked for the workout pages (owner, 2026-11-04: "new design for not this specific page, but the
// focus page, workout log, and guided coach", then "B for all of them", "the training ones i mean").
// What is happening now sits on one raised card (the exercise, its cue, the set's three figures, or
// the guided step); everything else sits on glass; the one action is held above the tab bar.
//   · Focus: the owner's C (2026-11-04: "Do C but have all required sets appear at same time so client can
//     see what weight may change or reps, and then user get customize and edit results/outcome
//     appropriately"): lit readouts (the exercise, the sets, the share done), the card with the move's set
//     lights and every set at once, each a row of lit slots (load, reps, RPE) that show the coach's target
//     and take what the member did, before or after it is logged, with its own ✓; Exercise details folded
//     under it, Previous / Next as lit chips, the queue as lit rows.
//   · Workout log: no card and no queue (the log IS the list): every exercise is a glass card of its
//     sets, the current one raised.
//   · Guided coach: the card carries 01 Prepare raised, 02 Perform & log folded to a line (and the
//     other way round once the set starts), then the set's figures.
// The heart-rate line sits with the session's own controls at the foot; a live reading rides beside
// the clock, so it is never scrolled away from.
//
// ⚠ THE VIEW DRAWS, BSSession DECIDES. Every value and handler here is BSSession's own (the draft,
// the rest deadline, the set logs, the live broadcast and the save all stay in the client module),
// handed in as `session`; nothing here holds workout state, so a view change keeps everything.
// The finish screen and the view chooser are still BSSession's.
//
// ⚠ NO COACH IS CREDITED HERE. BSSession is handed no coach, so there is no real name to put on a
// line, and a role-spined credit IS the claim "a coach authored this" (#1947): the old player's
// "Jordan · live · coaching" line was deleted for that reason, not hidden. A live cue from the
// member's own coach arrives through BSWorkoutCoachCue (`session.coachCue`).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// The client's bsTHexA, copied rather than imported: a feature module never imports back into the client.
const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const kick = (t, size, color, extra) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color, ...extra });
const tabular = { fontVariantNumeric: 'tabular-nums' };
const btn0 = { background: 'transparent', border: 0, padding: 0, cursor: 'pointer', minHeight: 44 };
// The live-effort heat eases from one colour to the next as the effort zone moves (#1575).
const heatTrans = { transition: 'color 1.2s ease, border-color 1.2s ease, background-color 1.2s ease' };
// ⚠ THE SET-TABLE COLUMNS ARE SIZED FOR THE LONGEST SHIPPED HEADER, NOT FOR ENGLISH: ru/uk «Подход» is
// 6 characters and id "Selesai" 7 at 9px mono (~6.8px a character), so the first column holds ~7 and
// the last ~8. The three 1fr input columns give up the difference.
const BS_WS_COLS = '48px 1fr 1fr 1fr 56px';

export function BSWorkoutSession({ session: S }) {
  const { useBS, BSPage, bsSdReduced } = window;
  const tr = useShapeTr();
  const t0 = useBS();
  // The clean type (Geist heads, Inter Tight words), as Home, Train and Eat set theirs.
  const t = { ...t0, DISPLAY: BS_CLEAN_SANS, BODY: BS_CLEAN_SANS, HEAD: BS_CLEAN_HEAD };
  const HEAD = BS_CLEAN_HEAD, SANS = BS_CLEAN_SANS;
  const INK = t.INK, px = t.padX, heat = S.heat, rust = t.RUST || '#c0533b';
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const onHeat = t.isLight ? '#ffffff' : '#04201d';
  const view = S.view, move = S.move;
  const isLog = view === 'log', isFocus = view === 'focus', isGuided = view === 'guided';
  const glass = (r = 18) => bsMpGlass(t, INK, { radius: r });
  const hair = hexA(INK, 0.08);
  const scheme = (m) => (m.s && m.s !== '—' ? m.s : `${m.sets} × ${m.reps || '—'}`);
  const lastMove = S.moveIdx >= S.moves.length - 1;
  // ONE translated label per set field, for the card's eyebrow and both inputs' names. RPE stays
  // literal, a term of art, as the table header carries it; Load, because a value can carry its unit.
  const fieldLabel = (f) => (f === 'rpe' ? 'RPE' : tr(f === 'load' ? 'session:player.fieldLoad' : 'session:player.colReps'));
  const targetRpe = move.rpe ? ` · ${tr('session:player.view.targetRpe', { rpe: move.rpe })}` : '';

  // ── The top: Pause & exit, a live heart rate, the clock; then the view and Change view ──
  const top = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, ...glass(16), padding: '0 6px 0 14px' }}>
      <button onClick={S.endWorkout} style={{ ...btn0, ...kick(t, 9.5, INK) }}>{tr('session:player.pause')}</button>
      {S.hrNow != null && <span data-ws-hr-live="" style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 11, color: heat, whiteSpace: 'nowrap', ...tabular }}>{S.heartIcon} {tr('session:player.view.hrReading', { bpm: S.hrNow })}</span>}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 999, background: hexA(heat, 0.12), ...kick(t, 8.5, t.INK50) }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: heat, display: 'inline-block' }} />
        {tr('session:player.elapsed')}
        <span style={{ fontFamily: t.MONO, fontSize: 12, color: heat, letterSpacing: '0.04em', ...tabular }}>{S.fmt(S.elapsedSec)}</span>
      </span>
    </div>
  );
  const viewRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span style={{ flexShrink: 0, ...kick(t, 9, heat) }}>{tr('session:player.view.' + view)}</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12.5, color: t.INK50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{S.title || tr('session:player.liveSession')}</span>
      <button ref={S.viewControlRef} onClick={S.openChooser} style={{ ...btn0, flexShrink: 0, ...glass(999), padding: '0 14px', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK }}>{tr('session:player.view.change')}</button>
    </div>
  );

  // ── Progress: one segment per exercise; lit = done, tinted = now ──
  const strip = (
    <div style={{ marginTop: 12 }}>
      <div aria-hidden style={{ display: 'flex', gap: 4 }}>
        {S.moves.map((_, i) => {
          const done = S.moveAllDone(i), cur = i === S.moveIdx;
          return <span key={i} data-ws-seg={done ? 'done' : cur ? 'now' : ''} style={{ flex: 1, height: 5, borderRadius: 999, background: done ? heat : cur ? hexA(heat, 0.35) : hexA(INK, 0.12), ...heatTrans }} />;
        })}
      </div>
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8, ...kick(t, 7.5, t.INK50, { letterSpacing: '0.14em' }) }}>
        <span>{tr('session:player.bandCounts', { ex: S.moveIdx + 1, exTotal: S.moves.length, done: S.doneSets, total: S.totalSets })}</span>
        <span>{tr('session:player.view.progress', { pct: Math.round(S.pct * 100) })}</span>
      </div>
    </div>
  );

  // ── The card: the exercise (named in an open session), its cue, the guided step, the set ──
  const nameStyle = { fontFamily: HEAD, fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.04, color: INK };
  const nameEl = S.openMode
    ? <input value={move.m} onChange={(e) => S.renameMove(e.target.value)} list="bs-session-move-names" placeholder={tr('session:player.namePlaceholder')} style={{ ...nameStyle, width: '100%', boxSizing: 'border-box', background: 'transparent', border: 0, borderBottom: `1px solid ${hexA(INK, 0.2)}`, outline: 'none', padding: '2px 0 6px' }} />
    : <div style={nameStyle}>{move.m}</div>;
  const clipBtn = S.clip ? (
    <button onClick={S.openClip} style={{ ...btn0, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 999, border: `1px solid ${hexA(heat, 0.45)}`, ...kick(t, 8, heat) }}>▶ {tr('session:player.formClip')}</button>
  ) : null;
  const focusLines = isFocus ? (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, letterSpacing: '0.02em' }}>{move.s || `${move.sets} × ${move.reps || '—'}`}{targetRpe}</div>
      {S.cue && <p style={{ margin: '6px 0 0', fontFamily: SANS, fontSize: 14.5, lineHeight: 1.4, color: t.INK70 }}>{S.cue}</p>}
    </div>
  ) : null;

  // Guided: the step in hand raised, the other folded to its label (✓ once Prepare is behind you).
  const guided = isGuided && S.activeIdx != null ? (() => {
    const pre = S.prefill(move, S.activeIdx);
    const target = `${pre.reps || '—'} · ${pre.load || '—'}${targetRpe}${move.restSeconds != null ? ` · ${tr('session:player.view.rest')} ${S.fmt(move.restSeconds)}` : ''}`;
    const cur = S.guidePrepare ? 'prepare' : 'perform';
    return (
      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        {[['prepare', 'session:player.view.prepare'], ['perform', 'session:player.view.perform']].map(([id, key]) => (id === cur ? (
          <div key={id} data-ws-step={id} data-ws-step-on="" style={{ ...bsRaised(t, heat), borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ ...kick(t, 8.5, heat), marginBottom: 6 }}>{tr(key)}</div>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, lineHeight: 1.45, color: INK }}>{S.guidePrepare ? (S.cue || tr('session:player.view.prepareHelp')) : tr('session:player.view.performHelp')}</p>
            <p style={{ margin: '6px 0 0', fontFamily: t.MONO, fontSize: 11, color: t.INK70, ...tabular }}>{target}</p>
          </div>
        ) : (
          <div key={id} data-ws-step={id} style={{ ...glass(14), padding: '10px 14px', display: 'flex', justifyContent: 'space-between', ...kick(t, 8.5, t.INK50) }}>
            <span>{tr(key)}</span>{id === 'prepare' ? <span aria-hidden style={{ color: heat }}>✓</span> : null}
          </div>
        )))}
      </div>
    );
  })() : null;

  const setDots = (
    <span aria-hidden style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: move.sets }).map((_, i) => {
        const done = S.completed[`${S.moveIdx}-${i}`]; const on = i === S.activeIdx;
        return <span key={i} style={{ width: 7, height: 7, borderRadius: 999, boxSizing: 'border-box', background: done ? heat : 'transparent', border: `1px solid ${done || on ? heat : hexA(INK, 0.3)}` }} />;
      })}
    </span>
  );
  // The set's three figures ARE its inputs, each a glass tile with its name over it.
  const setBlock = S.activeIdx != null ? (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ ...kick(t, 8.5, heat), ...heatTrans }}>{tr(S.activeRunning ? 'session:player.setLive' : 'session:player.setUp', { n: String(S.activeIdx + 1).padStart(2, '0') })}</span>
        {setDots}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 9 }}>
        {['load', 'reps', 'rpe'].map((f) => (
          <div key={f} data-ws-field={f} style={{ minWidth: 0, ...glass(14), padding: '8px 10px 7px' }}>
            <span style={{ display: 'block', ...kick(t, 7.5, t.INK50) }}>{fieldLabel(f)}</span>
            <input value={(S.setInputs[S.activeKey] && S.setInputs[S.activeKey][f]) ?? ''} onChange={(e) => S.updateSetInput(S.activeIdx, f, e.target.value)} placeholder="—" inputMode="decimal" aria-label={tr('session:player.setFieldAria', { n: S.activeIdx + 1, field: fieldLabel(f) })}
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'transparent', border: 0, borderRadius: 0, outline: 'none', color: INK, fontFamily: HEAD, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'left', padding: '3px 0 0', ...tabular }} />
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div style={{ marginTop: 16, ...kick(t, 9, heat) }}>{tr('session:player.allSetsLogged')}</div>
  );
  const runningLine = S.activeRunning ? <p style={{ margin: '10px 0 0', fontFamily: t.MONO, fontSize: 12, color: heat, ...tabular }}>{tr('session:player.setLive', { n: S.activeIdx + 1 })} · {S.fmt(S.activeSetSeconds)}</p> : null;
  const card = isLog ? null : (
    <div data-ws-card="" style={{ marginTop: 12, ...bsRaised(t, heat), borderRadius: 22, padding: '16px 14px' }}>
      {nameEl}
      {clipBtn}
      {focusLines}
      {guided}
      {setBlock}
      {runningLine}
    </div>
  );

  // ── Rest: a glass card, its countdown and a bar that fills as the rest runs ──
  const rest = S.restEnd && S.restLeft > 0 ? (
    <div data-ws-rest="" style={{ marginTop: 16, ...glass(18), padding: '12px 14px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={kick(t, 8.5, t.INK50)}>{tr('session:player.restAfter', { n: S.restAfterSet })}</span>
        <span style={{ fontFamily: HEAD, fontSize: 28, fontWeight: 650, color: heat, lineHeight: 1, ...tabular, ...heatTrans }}>{S.fmt(S.restLeft)}<span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50 }}> / {S.fmt(S.restTotal)}</span></span>
      </div>
      <div aria-hidden style={{ marginTop: 10, height: 6, borderRadius: 999, background: hexA(INK, 0.12), overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, background: heat, width: `${Math.round(Math.max(0, Math.min(1, 1 - S.restLeft / S.restTotal)) * 100)}%`, transition: bsSdReduced && bsSdReduced() ? 'none' : 'width 1s linear' }} />
      </div>
      <div style={{ marginTop: 2, display: 'flex', gap: 16, alignItems: 'center' }}>
        <button onClick={S.addRest30} style={{ ...btn0, ...kick(t, 9, INK) }}>{tr('session:player.plus30')}</button>
        {S.hrmOn && S.hrNow ? <span style={kick(t, 8, t.INK50)}>{tr('session:player.hrComeDown', { bpm: S.hrNow })}</span> : null}
        <button onClick={S.skipRest} style={{ ...btn0, marginLeft: 'auto', ...kick(t, 9, heat) }}>{tr('session:player.skipRest')}</button>
      </div>
    </div>
  ) : null;

  // ── The set log: every exercise (Workout log) or the current one (behind Exercise details) ──
  const rows = isLog ? S.moves.map((m, i) => ({ m, i })) : [{ m: move, i: S.moveIdx }];
  const table = (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: BS_WS_COLS, gap: 8, padding: '0 12px 8px', ...kick(t, 8, t.INK50, { fontWeight: 700 }) }}>
        <span>{tr('session:player.colSet')}</span><span>{tr('session:player.colWeight')}</span><span>{tr('session:player.colReps')}</span><span>RPE</span><span style={{ textAlign: 'right' }}>{tr('session:player.colDone')}</span>
      </div>
      {rows.map(({ m: rowMove, i: rowMoveIdx }) => {
        const cur = rowMoveIdx === S.moveIdx;
        return (
          // The current exercise's card is raised in the log; every other one sits on glass.
          <section key={rowMoveIdx} aria-labelledby={`bs-log-move-${rowMoveIdx}`} data-ws-move={cur && isLog ? 'now' : ''} style={{ ...(cur && isLog ? bsRaised(t, heat) : glass(18)), borderRadius: 18, padding: '2px 12px 8px', marginBottom: 10 }}>
            <button id={`bs-log-move-${rowMoveIdx}`} onClick={() => S.goMove(rowMoveIdx)} style={{ ...btn0, width: '100%', textAlign: 'left', display: 'block', padding: '10px 0 8px', color: INK }}>
              <span style={{ display: 'block', fontFamily: HEAD, fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.02em', color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rowMove.m || tr('session:player.namePlaceholder')}</span>
              {isLog && <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9.5, color: t.INK50 }}>{rowMove.s || `${rowMove.sets} × ${rowMove.reps || '—'}`}{rowMove.l ? ` · ${rowMove.l}` : ''}</span>}
            </button>
            {Array.from({ length: rowMove.sets }).map((_, i) => {
              const key = `${rowMoveIdx}-${i}`;
              const done = S.completed[key];
              const isActive = cur && i === S.activeIdx;
              const ri = S.setInputs[key] || { reps: '', load: S.prefill(rowMove, i).load, rpe: '' };
              // Logged sets stay editable in place (a mis-entered figure corrects without a delete and
              // relog: updateSetInput patches the captured log row); they read dimmed, not locked.
              const cell = (field, ph) => (
                <input value={ri[field] ?? ''} onChange={(e) => S.updateSetInput(i, field, e.target.value, rowMoveIdx)} placeholder={ph} inputMode="decimal" aria-label={tr('session:player.setFieldAria', { n: i + 1, field: fieldLabel(field) })} aria-describedby={`bs-log-move-${rowMoveIdx}`}
                  style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: 0, borderRadius: 9, outline: 'none', background: isActive ? hexA(heat, 0.1) : hexA(INK, t.isLight ? 0.04 : 0.05), boxShadow: isActive ? `inset 0 0 0 1px ${hexA(heat, 0.5)}` : 'none', color: INK, padding: '10px 2px', fontFamily: t.MONO, fontSize: 12.5, textAlign: 'center', opacity: done ? 0.55 : 1, ...tabular }} />
              );
              return (
                <div key={i} data-ws-set={done ? 'done' : isActive ? 'now' : ''} style={{ display: 'grid', gridTemplateColumns: BS_WS_COLS, gap: 8, alignItems: 'center', padding: '3px 0 3px 6px', marginLeft: -9, borderLeft: isActive ? `3px solid ${heat}` : '3px solid transparent' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: (done || isActive) ? heat : t.INK50, ...tabular }}>{done ? '✓' : String(i + 1).padStart(2, '0')}</span>
                  {cell('load', S.loadUnit)}
                  {cell('reps', '—')}
                  {cell('rpe', '—')}
                  <button onClick={() => { if (!done) S.logSet(i, rowMoveIdx); }} disabled={!!done} aria-label={tr(done ? 'session:player.setDoneAria' : S.timedMode && S.activeSetKey !== key ? 'session:player.startSetCta' : 'session:player.markSetDoneAria', { n: i + 1 })}
                    style={{ justifySelf: 'end', width: 44, height: 44, padding: 0, borderRadius: 999, border: `1.5px solid ${(done || isActive) ? heat : t.RULE}`, background: done ? heat : 'transparent', color: done ? onHeat : (isActive ? heat : 'transparent'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: done ? 'default' : 'pointer', ...heatTrans }}>{S.timedMode && !done && S.activeSetKey !== key ? '▶' : '✓'}</button>
                </div>
              );
            })}
          </section>
        );
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={S.addSet} aria-label={tr('session:player.addSetAria')} style={{ ...btn0, flex: 1, ...kick(t, 9, t.INK70) }}>{tr('session:player.addSet')}</button>
        {/* Remove takes the current pending set (else the last, asked first when logged); never at one set. */}
        {move.sets > 1 && <button onClick={S.removeCurrentSet} aria-label={tr('session:player.removeSetAria')} style={{ ...btn0, flex: 1, ...kick(t, 9, rust) }}>{tr('session:player.removeSet')}</button>}
        {S.openMode && <button onClick={S.addMove} aria-label={tr('session:player.addMoveAria')} style={{ ...btn0, flex: 1, ...kick(t, 9, teal) }}>{tr('session:player.addMove')}</button>}
      </div>
    </div>
  );

  // ── Exercise details: Quick Log | Timed sets, the target, the suggestion, plates, then the log ──
  const details = (
    <details key={view} open={isLog} style={{ marginTop: 16, color: INK }}>
      <summary style={{ minHeight: 44, boxSizing: 'border-box', cursor: 'pointer', display: 'list-item', ...glass(14), padding: '13px 14px', fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}>{tr('session:player.view.details')}</summary>
      <div style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, ...glass(12), padding: 3 }}>
          {[false, true].map((timed) => {
            const on = S.timedMode === timed;
            return <button key={String(timed)} aria-pressed={on} onClick={() => S.setTimed(timed)} style={{ ...btn0, flex: 1, borderRadius: 9, background: on ? hexA(INK, t.isLight ? 0.08 : 0.1) : 'transparent', fontFamily: SANS, fontSize: 13, fontWeight: 600, color: on ? INK : t.INK50 }}>{timed ? tr('session:player.timedSets') : tr('session:player.quickLog')}</button>;
          })}
        </div>
        {/* The cue leads Focus's card; the log has no card and Guided shows it only while preparing, so
            it reads here too. */}
        {(!isFocus && !S.openMode && !!S.cue) || move.l ? (
          <div style={{ marginTop: 12 }}>
            {!isFocus && !S.openMode && !!S.cue && <div style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 13.5, color: t.INK50 }}>“{S.cue}”</div>}
            {move.l && <div style={{ marginTop: 4, ...kick(t, 8.5, t.INK50, { fontWeight: 600, letterSpacing: '0.12em' }) }}>{tr('session:player.targetLoad', { load: move.l })}</div>}
          </div>
        ) : null}
        {S.sug && (
          <button onClick={S.fillSug} aria-label={tr('session:player.useSuggestedAria', { load: S.sug.load, unit: S.sug.unit })} style={{ ...btn0, width: '100%', marginTop: 8, padding: '10px 0', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={kick(t, 8.5, heat)}>{tr('session:player.suggested')}</span>
              <span style={{ fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: INK, ...tabular }}>{`${S.sug.load} ${S.sug.unit}`}{S.sug.reps != null ? ` × ${S.sug.reps}` : ''}</span>
              <span aria-hidden style={{ flex: 1 }} />
              <span style={{ ...kick(t, 9, INK), borderBottom: `2px solid ${heat}`, paddingBottom: 2 }}>{tr('session:player.use')}</span>
            </span>
            <span style={{ display: 'block', marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>{S.sug.rationale}</span>
          </button>
        )}
        {/* Plate maths, per side of a 45 lb bar (the gym's plate colours are semantic, kept). */}
        {S.loadUnit === 'lb' && S.perSide && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={kick(t, 8.5, t.INK50, { fontWeight: 700, letterSpacing: '0.12em' })}>{tr('session:player.perSide', { load: S.activeLoad })}</span>
            {S.plates.length ? S.plates.map((p, i) => (
              <span key={i} style={{ padding: '3px 8px', borderRadius: 3, background: S.plateColor[p] || t.INK50, color: '#1a1410', fontFamily: t.MONO, fontSize: 10, fontWeight: 800 }}>{p}</span>
            )) : <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>{tr('session:player.barOnly')}</span>}
          </div>
        )}
        {move.tempo && <p style={{ margin: '8px 0 0', fontFamily: SANS, fontSize: 13, color: t.INK70 }}>{tr('session:player.tempo')} · {move.tempo}</p>}
        {S.superset && <p style={{ margin: '8px 0 0', fontFamily: SANS, fontSize: 13, color: t.INK70 }}>{tr('session:player.superset')} · {S.superset}</p>}
        {S.activeIdx != null && <button onClick={S.applyRemaining} style={{ ...btn0, display: 'block', textAlign: 'left', fontFamily: SANS, fontSize: 13, fontWeight: 600, color: teal }}>{tr('session:player.applyRemaining')}</button>}
        {!isFocus && table}
      </div>
    </details>
  );

  // ── Previous / Next ──
  const prevNext = (
    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <button onClick={() => S.goMove(Math.max(0, S.moveIdx - 1))} disabled={S.moveIdx === 0} style={{ ...btn0, flexShrink: 0, ...glass(999), padding: '0 14px', opacity: S.moveIdx === 0 ? 0.35 : 1, cursor: S.moveIdx === 0 ? 'default' : 'pointer', ...kick(t, 9, t.INK50) }}>{tr('session:player.previous')}</button>
      <button onClick={() => { if (!lastMove) S.goMove(S.moveIdx + 1); }} disabled={lastMove} style={{ ...btn0, flex: 1, minWidth: 0, ...glass(999), padding: '0 14px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: lastMove ? 'default' : 'pointer', ...kick(t, 9, lastMove ? t.INK50 : teal) }}>
        {lastMove ? tr('session:player.lastExercise') : tr('session:player.nextNamed', { move: S.moves[S.moveIdx + 1].m })}
      </button>
    </div>
  );

  // ── Up next: one glass list, the current exercise tinted; a tap jumps to it ──
  const queue = (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={kick(t, 8.5, teal, { letterSpacing: '0.2em' })}>{tr('session:player.upNext')}</span>
        <span style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{tr('session:player.queue')}</span>
      </div>
      <div data-ws-queue="" style={{ ...glass(18), padding: '4px 6px' }}>
        {S.moves.map((mv, i) => {
          const mDone = S.moveAllDone(i);
          const isCurrent = i === S.moveIdx;
          return (
            <button key={i} onClick={() => S.goMove(i)} style={{ ...btn0, width: '100%', boxSizing: 'border-box', textAlign: 'left', display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', columnGap: 10, alignItems: 'center', padding: '9px 8px', borderRadius: 12, background: isCurrent ? hexA(heat, 0.1) : 'transparent', borderBottom: i < S.moves.length - 1 && !isCurrent ? `1px solid ${hair}` : 0, opacity: mDone ? 0.55 : 1 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, color: mDone || isCurrent ? heat : t.INK50 }}>{mDone ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: SANS, fontSize: 14.5, fontWeight: 650, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mv.m}{isCurrent && <span style={{ marginLeft: 8, ...kick(t, 7.5, heat) }}>{tr('session:player.now')}</span>}</span>
                {/* The coach's own scheme line; the parsed pair only for an outline day that ships none. */}
                <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{scheme(mv)}</span>
              </span>
              {mv.l ? <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK70 }}>{mv.l}</span> : <span />}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Heart rate, with the session's own controls at the foot ──
  const hr = (
    <div data-ws-hr="" style={{ marginTop: 16, ...glass(14), padding: '2px 8px 8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
        {S.hrNow != null ? (
          <span style={{ flex: 1, fontFamily: t.MONO, fontSize: 12, color: heat }}>{S.heartIcon} {tr('session:player.view.hrReading', { bpm: S.hrNow })} · {tr('session:player.view.hrLive')}</span>
        ) : (
          <>
            <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12, color: t.INK50 }}>{tr(S.hrmOn ? 'session:player.view.hrWaiting' : S.hrHadSamples ? 'session:player.view.hrLost' : 'session:player.view.hrAbsent')}</span>
            <button onClick={S.connectHrm} disabled={S.hrConnecting || S.hrmOn} style={{ ...btn0, flexShrink: 0, color: heat, fontFamily: SANS, fontSize: 12.5, fontWeight: 600 }}>{tr(S.hrConnecting ? 'session:player.view.hrConnecting' : 'session:player.connectHr')}</button>
          </>
        )}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, lineHeight: 1.4, color: t.INK50 }}>{tr('session:player.view.hrHelp')}</div>
    </div>
  );

  // End early goes to the SAME finish step, so ending early is still asked for an effort rating.
  const endBtns = (
    <div style={{ marginTop: 18 }}>
      <button onClick={() => S.openCompletion()} style={{ ...btn0, width: '100%', minHeight: 46, ...glass(14), ...kick(t, 9.5, INK, { letterSpacing: '0.18em' }) }}>{tr('session:player.endEarly')}</button>
      <button onClick={S.discardWorkout} style={{ ...btn0, width: '100%', marginTop: 6, fontFamily: SANS, fontSize: 13.5, color: rust }}>{tr('session:player.discard')}</button>
    </div>
  );

  // ── The one action, held above the tab bar on a fade of the paper ──
  const action = (
    <div data-bs-clean="" data-ws-action="" style={{ position: 'absolute', left: 0, right: 0, bottom: (window.BS_TABBAR_CSS || window.BS_TABBAR_H || 64), zIndex: 55, padding: `10px ${px}px`, background: `linear-gradient(180deg, transparent, ${t.PAPER} 38%)`, pointerEvents: 'none' }}>
      <button onClick={S.primaryAction} style={{ pointerEvents: 'auto', width: '100%', minHeight: 50, border: 0, cursor: 'pointer', borderRadius: 16, background: heat, color: onHeat, fontFamily: SANS, fontSize: 15, fontWeight: 700, boxShadow: `0 12px 28px -12px ${hexA(heat, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.35)`, ...heatTrans }}>{S.primaryLabel}</button>
    </div>
  );
  const notes = (
    <>
      {S.draftWarning && <p role="alert" style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: 13, color: '#e8a33c' }}>{S.draftWarning}</p>}
      {S.logStatus && <p role="status" style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: 13, color: t.INK70 }}>{S.logStatus}</p>}
    </>
  );
  // ── FOCUS (the owner's C, with every set on the card) ──
  // The instruments' lit slot: a dark inset on dark paper (a faint ink wash on light), framed in the heat when
  // on, glowing on dark paper only.
  const ledBox = (on, c = heat) => ({ borderRadius: 10, background: t.isLight ? hexA(INK, 0.045) : 'rgba(0,0,0,0.45)', border: `1px solid ${on ? hexA(c, t.isLight ? 0.55 : 0.6) : hexA(INK, 0.12)}`, boxShadow: on && !t.isLight ? `0 0 16px -6px ${hexA(c, 0.85)}` : 'none' });
  const glowT = (c, a = 0.65) => (t.isLight ? {} : { textShadow: `0 0 10px ${hexA(c, a)}` });
  const pad2 = (n) => String(n).padStart(2, '0');
  const focusBody = isFocus ? (() => {
    const readout = (label, value, on, key) => (
      <div data-focus-readout={key} style={{ flex: 1, minWidth: 0, ...ledBox(on), padding: '8px 10px' }}>
        <span style={{ display: 'block', ...kick(t, 7, t.INK50) }}>{label}</span>
        <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 16, fontWeight: 700, color: on ? heat : INK, ...tabular, ...(on ? glowT(heat) : {}) }}>{value}</span>
      </div>
    );
    const lights = (
      <span aria-hidden style={{ display: 'inline-flex', gap: 4 }}>
        {Array.from({ length: move.sets }).map((_, i) => {
          const done = S.completed[`${S.moveIdx}-${i}`], on = i === S.activeIdx;
          return <span key={i} style={{ width: 14, height: 8, borderRadius: 3, boxSizing: 'border-box', background: done ? heat : (t.isLight ? hexA(INK, 0.06) : 'rgba(0,0,0,0.45)'), border: `1px solid ${done || on ? heat : hexA(INK, 0.16)}`, boxShadow: done && !t.isLight ? `0 0 8px ${hexA(heat, 0.7)}` : 'none' }} />;
        })}
      </span>
    );
    // Every set at once: the coach's target shows in each slot until the member writes what they did; a
    // logged set stays editable in place (updateSetInput patches its log row), its ✓ lit.
    const COLS = '34px repeat(3, minmax(0, 1fr)) 44px';
    const setRows = (
      <div data-focus-sets="" style={{ marginTop: 12 }}>
        <div aria-hidden style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '0 0 6px', ...kick(t, 7.5, t.INK50, { fontWeight: 700 }) }}>
          <span>{tr('session:player.colSet')}</span><span>{fieldLabel('load')}</span><span>{fieldLabel('reps')}</span><span>RPE</span><span style={{ textAlign: 'center' }}>{tr('session:player.colDone')}</span>
        </div>
        {Array.from({ length: move.sets }).map((_, i) => {
          const key = `${S.moveIdx}-${i}`;
          const done = !!S.completed[key];
          const on = i === S.activeIdx;
          const ri = S.setInputs[key] || {};
          const pre = S.prefill(move, i) || {};
          const cell = (f) => {
            const target = f === 'load' ? (pre.load || '') : f === 'reps' ? (pre.reps || '') : '';
            return (
              <input key={f} value={ri[f] ?? ''} onChange={(e) => S.updateSetInput(i, f, e.target.value, S.moveIdx)} placeholder={target || '—'} inputMode="decimal"
                aria-label={tr('session:player.setFieldAria', { n: i + 1, field: fieldLabel(f) })} data-focus-field={f}
                style={{ width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box', ...ledBox(on), outline: 'none', color: on ? heat : INK, padding: '0 8px', fontFamily: t.MONO, fontSize: on ? 16 : 14.5, fontWeight: 700, opacity: done ? 0.7 : 1, ...tabular, ...(on ? glowT(heat) : {}) }} />
            );
          };
          return (
            <div key={i} data-focus-set={done ? 'done' : on ? 'now' : ''} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'center', marginTop: i ? 6 : 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 800, color: done || on ? heat : t.INK50, ...tabular, ...(on ? glowT(heat) : {}) }}>{done ? '✓' : pad2(i + 1)}</span>
              {cell('load')}
              {cell('reps')}
              {cell('rpe')}
              <button type="button" onClick={() => { if (!done) S.logSet(i, S.moveIdx); }} disabled={done}
                aria-label={tr(done ? 'session:player.setDoneAria' : S.timedMode && S.activeSetKey !== key ? 'session:player.startSetCta' : 'session:player.markSetDoneAria', { n: i + 1 })}
                style={{ width: 44, height: 44, padding: 0, borderRadius: 999, border: `1.5px solid ${done || on ? heat : hexA(INK, 0.2)}`, background: done ? heat : 'transparent', color: done ? onHeat : (on ? heat : t.INK50), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: done ? 'default' : 'pointer', boxShadow: done && !t.isLight ? `0 0 12px ${hexA(heat, 0.6)}` : 'none', ...heatTrans }}>{S.timedMode && !done && S.activeSetKey !== key ? '▶' : '✓'}</button>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={S.addSet} aria-label={tr('session:player.addSetAria')} style={{ ...btn0, flex: 1, ...kick(t, 9, t.INK70) }}>{tr('session:player.addSet')}</button>
          {move.sets > 1 && <button onClick={S.removeCurrentSet} aria-label={tr('session:player.removeSetAria')} style={{ ...btn0, flex: 1, ...kick(t, 9, rust) }}>{tr('session:player.removeSet')}</button>}
          {S.openMode && <button onClick={S.addMove} aria-label={tr('session:player.addMoveAria')} style={{ ...btn0, flex: 1, ...kick(t, 9, teal) }}>{tr('session:player.addMove')}</button>}
        </div>
      </div>
    );
    const chip = (label, onClick, off, color, grow, key) => (
      <button data-focus-step={key} onClick={onClick} disabled={off} style={{ ...btn0, flex: grow ? 1 : 'none', minWidth: 0, ...ledBox(!off && grow, color), padding: '0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: off ? 0.4 : 1, cursor: off ? 'default' : 'pointer', ...kick(t, 8.5, off ? t.INK50 : color), ...(grow && !off ? glowT(color, 0.5) : {}) }}>{label}</button>
    );
    return (
      <>
        <div data-focus-readouts="" style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          {readout(tr('session:build.exercisePlaceholder', { defaultValue: 'Exercise' }), `${S.moveIdx + 1}/${S.moves.length}`, true, 'exercise')}
          {readout(tr('session:build.sets', { defaultValue: 'Sets' }), `${S.doneSets}/${S.totalSets}`, false, 'sets')}
          {readout(tr('session:player.colDone'), `${Math.round(S.pct * 100)}%`, false, 'done')}
        </div>
        <div data-ws-card="" data-focus-card="" style={{ marginTop: 10, ...bsRaised(t, heat), borderRadius: 22, padding: '16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>{nameEl}</div>
            <span style={{ paddingTop: 9 }}>{lights}</span>
          </div>
          {clipBtn}
          {focusLines}
          <div style={{ marginTop: 14, ...kick(t, 8.5, heat), ...heatTrans }}>
            {S.activeIdx != null ? tr(S.activeRunning ? 'session:player.setLive' : 'session:player.setUp', { n: pad2(S.activeIdx + 1) }) : tr('session:player.allSetsLogged')}
          </div>
          {setRows}
          {runningLine}
        </div>
        {notes}
        {rest}
        {details}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {chip(tr('session:player.previous'), () => S.goMove(Math.max(0, S.moveIdx - 1)), S.moveIdx === 0, INK, false, 'prev')}
          {chip(lastMove ? tr('session:player.lastExercise') : tr('session:player.nextNamed', { move: S.moves[S.moveIdx + 1].m }), () => { if (!lastMove) S.goMove(S.moveIdx + 1); }, lastMove, teal, true, 'next')}
        </div>
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={kick(t, 8.5, teal, { letterSpacing: '0.2em' })}>{tr('session:player.upNext')}</span>
            <span style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{tr('session:player.queue')}</span>
          </div>
          <div data-ws-queue="" style={{ display: 'grid', gap: 6 }}>
            {S.moves.map((mv, i) => {
              const mDone = S.moveAllDone(i), cur = i === S.moveIdx;
              return (
                <button key={i} onClick={() => S.goMove(i)} data-focus-queue={cur ? 'now' : mDone ? 'done' : ''}
                  style={{ ...btn0, width: '100%', boxSizing: 'border-box', textAlign: 'left', display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) auto', columnGap: 10, alignItems: 'center', padding: '7px 10px 7px 7px', ...glass(14), ...(cur ? { border: `1px solid ${hexA(heat, 0.55)}` } : {}), opacity: mDone ? 0.55 : 1 }}>
                  <span style={{ ...ledBox(cur || mDone), height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.MONO, fontSize: 11.5, fontWeight: 700, color: cur || mDone ? heat : t.INK50, ...(cur ? glowT(heat) : {}) }}>{mDone ? '✓' : pad2(i + 1)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: SANS, fontSize: 14.5, fontWeight: 650, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mv.m}</span>
                    <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{scheme(mv)}</span>
                  </span>
                  {mv.l ? <span style={{ ...ledBox(false), padding: '5px 8px', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, color: t.INK70 }}>{mv.l}</span> : <span />}
                </button>
              );
            })}
          </div>
        </div>
        {hr}
        {endBtns}
      </>
    );
  })() : null;

  const surface = typeof document !== 'undefined' && document.getElementById && document.getElementById('bs-phone-surface');

  return (
    <BSPage noSwipe>
      <BSCleanType t={t}>
        <div style={{ padding: `46px ${px}px 150px`, color: INK }}>
          {top}
          {viewRow}
          {S.viewWarning && <p role="alert" style={{ margin: '4px 0 0', fontFamily: SANS, fontSize: 13, color: '#e8a33c' }}>{tr('session:player.view.storage')}</p>}
          {S.coachCue}
          {!isFocus && strip}
          {!isFocus && card}
          {isLog && runningLine}
          {focusBody || (
            <>
              {notes}
              {rest}
              {details}
              {prevNext}
              {!isLog && queue}
              {hr}
              {endBtns}
            </>
          )}
        </div>
      </BSCleanType>
      {S.openMode && <datalist id="bs-session-move-names">{S.moveNames.map((n) => <option key={n} value={n} />)}</datalist>}
      {surface ? createPortal(action, surface) : action}
      {S.clipSheet}
    </BSPage>
  );
}
