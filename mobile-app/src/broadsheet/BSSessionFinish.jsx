import React from 'react';
import { createPortal } from 'react-dom';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType } from './bsCleanType.jsx';
import { bsRaised } from './BSProInstrument.jsx';
// ─── THE FINISH POP-UP: how hard it was, how much they enjoyed it, then Save ────────────────────
// The owner's ask (2026-11-04): "at the end of each workout, have a pop up appear where the client
// ranks workout from level of difficulty to enjoyment/satisfication". When a workout ends (Finish
// workout, or End workout early) the live session stays drawn behind and this sheet rises over it,
// in the session's C look: lit slots (a dark inset, a 1px frame in the slot's colour, a glow on dark
// paper only) on a raised plate.
//   · Difficulty leads: "How hard was that?", 1-10, the session RPE (SPEC-guardrails.md §3.1). Each
//     slot is lit in its effort band (green to 4, amber to 7, red above); the slots under the pick
//     are lit faintly, so the row reads as a meter.
//   · Enjoyment next: 1-5, saved as `summary.enjoyment`. It replaced the three-way "The vibe".
//   · Then the duration question (only when the wall-clock timer is not credible), the share toggle
//     and Save.
// Both ratings are skippable and nothing is pre-selected: a tap on the lit slot clears it, and a
// skipped rating saves as NULL, never 0. Stored as workout_sessions.session_rpe (difficulty) and
// workout_sessions.summary->'enjoyment' (enjoyment); the client's coach reads both through the
// session read the coach's review already makes (the owner, 2026-11-04: "show both ratings to
// coaches"). tests/workout-ratings-data.test.mjs pins the path.
// ← Edit workout (Pause & exit while a save is pending) closes the sheet back to the workout. A tap
// on the dim does nothing, so a stray tap neither restarts the latched clock nor leaves the workout.
//
// ⚠ THE SHEET DRAWS, BSSession DECIDES. Every value and handler is BSSession's (the latched clock,
// the duration rules, the frozen pending submission, the save), handed in as `finish`; nothing here
// holds workout state.
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
// The dim fades in and the sheet rises; reduced motion skips both.
const BS_FINISH_MOTION = '@keyframes bsFinishDim{from{opacity:0}to{opacity:1}}@keyframes bsFinishUp{from{transform:translateY(48px)}to{transform:none}}';
// The effort bands, as the finish step has always drawn them: green to 4, amber to 7, red above.
// Deeper on light paper, where the dark paper's figures would not read on the ink wash.
const BS_FINISH_BANDS = { dark: ['#4fd18b', '#e8a33c', '#e8674c'], light: ['#17844c', '#a8680d', '#c4432b'] };

export function BSSessionFinish({ finish: F }) {
  const { useBS, bsSdReduced } = window;
  const tr = useShapeTr();
  const t0 = useBS();
  // The clean type (Geist heads, Inter Tight words), as the session behind it sets its own.
  const t = { ...t0, DISPLAY: BS_CLEAN_SANS, BODY: BS_CLEAN_SANS, HEAD: BS_CLEAN_HEAD };
  const HEAD = BS_CLEAN_HEAD, SANS = BS_CLEAN_SANS;
  const INK = t.INK, px = t.padX, heat = F.heat, light = !!t.isLight;
  const teal = light ? '#0a8f87' : '#34d6c5';
  const onHeat = light ? '#ffffff' : '#04201d';
  const warn = light ? '#a3610c' : '#e8a33c';
  const still = !!(bsSdReduced && bsSdReduced());
  const bands = BS_FINISH_BANDS[light ? 'light' : 'dark'];
  const bandOf = (n) => bands[n <= 4 ? 0 : n <= 7 ? 1 : 2];
  // The sheet takes focus as it opens, so a screen reader starts at its title, not at the workout behind.
  const headRef = React.useRef(null);
  // ⚠ THE WORKOUT BEHIND THE SHEET IS INERT, NOT ONLY COVERED (Codex P2 on #2614). aria-modal enforces
  // nothing: a hardware keyboard or switch control tabbed past the sheet into the logged sets while the
  // clock is frozen. Every other child of the phone surface is made inert and hidden from screen readers
  // while it shows, as BSUpdateGate does, and a focus that lands outside the sheet is sent back to its
  // title, since `inert` first shipped in iOS 15.5 and the app supports iOS 14.
  const dimRef = React.useRef(null);
  React.useEffect(() => {
    const toHead = () => { try { if (headRef.current) headRef.current.focus({ preventScroll: true }); } catch (e) {} };
    const dim = dimRef.current;
    const surface = typeof document !== 'undefined' && document.getElementById ? document.getElementById('bs-phone-surface') : null;
    // The portal's own node on the surface (the clean-type wrapper may sit between it and the dim).
    let gate = dim;
    while (gate && surface && gate.parentElement && gate.parentElement !== surface) gate = gate.parentElement;
    const made = [];
    if (surface && gate && gate.parentElement === surface) {
      for (const el of Array.from(surface.children)) {
        if (el === gate) continue;
        made.push({ el, inert: el.hasAttribute('inert'), hidden: el.getAttribute('aria-hidden') });
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
      }
    }
    const hold = (e) => { try { if (dim && e.target && !dim.contains(e.target)) toHead(); } catch (err) {} };
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('focusin', hold);
    toHead();
    return () => {
      if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('focusin', hold);
      for (const w of made) {
        if (!w.inert) w.el.removeAttribute('inert');
        if (w.hidden === null) w.el.removeAttribute('aria-hidden'); else w.el.setAttribute('aria-hidden', w.hidden);
      }
    };
  }, []);

  // The session's lit slot: a dark inset on dark paper (a faint ink wash on light), framed in the colour
  // when on, glowing on dark paper only.
  const ledBox = (on, c = heat) => ({ borderRadius: 10, background: light ? hexA(INK, 0.045) : 'rgba(0,0,0,0.45)', border: `1px solid ${on ? hexA(c, light ? 0.55 : 0.6) : hexA(INK, 0.12)}`, boxShadow: on && !light ? `0 0 16px -6px ${hexA(c, 0.85)}` : 'none' });
  const glowT = (c, a = 0.65) => (light ? {} : { textShadow: `0 0 10px ${hexA(c, a)}` });

  // A question, its scale beside it.
  const ask = (id, question, scale) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 10, rowGap: 2 }}>
      <h3 id={`bs-finish-${id}`} style={{ margin: 0, fontFamily: HEAD, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: INK }}>{question}</h3>
      {scale ? <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{scale}</span> : null}
    </div>
  );
  // A rating: one lit slot per figure. The pick is lit full, with a bar along its foot; the slots under
  // it faintly. A tap on the pick clears it (skipped = null). `aria` names a figure in the member's words.
  const rating = (id, max, value, pick, colorOf, aria) => (
    <div role="group" aria-labelledby={`bs-finish-${id}`} data-finish-rating={id} style={{ display: 'grid', gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))`, gap: max > 5 ? 4 : 6, marginTop: 9 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const on = value === n, trail = value != null && n < value, c = colorOf(n);
        return (
          <button key={n} type="button" onClick={() => pick(on ? null : n)} aria-label={aria(n)} aria-pressed={on} data-finish-slot={n}
            style={{
              ...btn0, minWidth: 0, minHeight: 44, ...ledBox(on, c),
              ...(trail ? { border: `1px solid ${hexA(c, light ? 0.3 : 0.32)}` } : {}),
              ...(on ? {
                background: light ? hexA(c, 0.12) : `linear-gradient(${hexA(c, 0.16)}, ${hexA(c, 0.16)}), rgba(0,0,0,0.45)`,
                boxShadow: [`inset 0 -3px 0 ${c}`, light ? null : `0 0 16px -6px ${hexA(c, 0.85)}`].filter(Boolean).join(', '),
              } : {}),
              fontFamily: t.MONO, fontSize: max > 5 ? 13 : 14, fontWeight: 700, color: on || trail ? c : t.INK50, opacity: trail ? 0.8 : 1, ...tabular, ...(on ? glowT(c) : {}),
            }}>{n}</button>
        );
      })}
    </div>
  );

  // Asked at BOTH ends of implausibility (BSSession's rules): far too short (the timer never ran) or
  // far too long (finished hours after they stopped). Never shown on a normal-length session.
  const duration = F.askDuration ? (
    <div data-finish-duration="" style={{ marginTop: 20 }}>
      {ask('duration', tr(F.timerImplausible ? 'session:player.howLongReally' : 'session:player.howLong'))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
        <input type="number" inputMode="numeric" min={F.minutesMin} max={F.minutesMax} value={F.shownMinutes}
          onChange={(e) => F.setManualMinutes(e.target.value)} aria-label={tr('session:player.durationAria')} placeholder="—"
          style={{ width: 104, minHeight: 44, boxSizing: 'border-box', ...ledBox(F.shownMinutes !== '', heat), outline: 'none', color: INK, padding: '0 12px', fontFamily: t.MONO, fontSize: 16, fontWeight: 700, ...tabular }} />
        <span style={kick(t, 9, t.INK50)}>{tr('session:player.minutes')}</span>
      </div>
      <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', lineHeight: 1.45, color: t.INK50 }}>
        {!F.timerImplausible
          ? tr('session:player.timerDidntRun')
          : F.prefillOffered
            ? tr('session:player.timerRan', { min: F.timerMinutes })
            : tr('session:player.timerImplausible', { min: F.timerMinutes })}
      </div>
      {/* Honest about the consequence: only the over-ceiling case is excluded without an answer. */}
      {F.timerImplausible && !F.durationAnswered && (
        <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', lineHeight: 1.45, color: warn }}>{tr('session:player.blankExcluded')}</div>
      )}
    </div>
  ) : null;

  // Privacy sits with the save: this is the tap that decides whether the session posts.
  const share = (
    <button type="button" onClick={F.toggleShare} aria-pressed={F.shareToFeed} data-finish-share=""
      style={{ ...btn0, marginTop: 20, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 14px', textAlign: 'left', ...ledBox(F.shareToFeed, heat), borderRadius: 14 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: SANS, fontSize: 14.5, fontWeight: 650, color: INK }}>{F.shareAudience === 'friends' ? tr('session:player.shareToggleFriends') : tr('session:player.shareToggle')}</span>
        <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', lineHeight: 1.4, color: t.INK50 }}>{F.shareAudience === 'friends' ? tr('session:player.shareSubFriends') : tr('session:player.shareSub')}</span>
      </span>
      <span aria-hidden style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 999, background: F.shareToFeed ? heat : hexA(INK, 0.16), position: 'relative', transition: still ? 'none' : 'background 0.15s', boxShadow: F.shareToFeed && !light ? `0 0 12px ${hexA(heat, 0.55)}` : 'none' }}>
        <span style={{ position: 'absolute', top: 3, left: F.shareToFeed ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: still ? 'none' : 'left 0.15s' }} />
      </span>
    </button>
  );

  const saving = F.saveState === 'saving';
  const { overflow: _clip, ...plate } = bsRaised(t, heat);
  const sheet = (
    <div ref={dimRef} data-finish-dim="" style={{ position: 'absolute', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: light ? 'rgba(20,18,15,0.42)' : 'rgba(0,0,0,0.58)', animation: still ? 'none' : 'bsFinishDim 180ms ease-out' }}>
      {still ? null : <style>{BS_FINISH_MOTION}</style>}
      <div role="dialog" aria-modal="true" aria-labelledby="bs-finish-title" data-finish-sheet="" className="bs-scroll"
        style={{ ...plate, borderRadius: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottom: 0, width: '100%', boxSizing: 'border-box', maxHeight: '92%', overflowX: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain', padding: `8px ${px}px calc(18px + env(safe-area-inset-bottom, 0px))`, color: INK, animation: still ? 'none' : 'bsFinishUp 260ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
        <div aria-hidden style={{ width: 38, height: 4, borderRadius: 999, background: hexA(INK, 0.2), margin: '0 auto 2px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button type="button" onClick={F.onEdit} data-finish-edit="" style={{ ...btn0, ...kick(t, 9.5, INK) }}>{tr(F.pending ? 'session:player.pause' : 'session:player.editWorkout')}</button>
          <span style={{ ...kick(t, 8, heat), ...glowT(heat, 0.5) }}>{tr('session:player.completeEyebrow')}</span>
        </div>
        <h2 id="bs-finish-title" ref={headRef} tabIndex={-1} style={{ margin: '4px 0 0', outline: 'none', fontFamily: HEAD, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.08, color: INK }}>{F.title || tr('session:player.sessionDone')}</h2>
        {/* ⚠ ONE SENTENCE, NOT FOUR JSX CHILDREN — word order moves. */}
        <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 10.5, color: t.INK50, ...tabular }}>{tr('session:player.completeMeta', { done: F.doneSets, total: F.totalSets, clock: F.clock })}</div>

        <fieldset disabled={F.pending} style={{ border: 0, padding: 0, margin: '20px 0 0', minWidth: 0 }}>
          {/* THE TWO RATINGS lead, each one tap and skippable. */}
          <div data-finish-q="effort">
            {ask('effort', tr('session:player.effortQ'), tr('session:player.effortScale'))}
            {rating('effort', 10, F.sessionRpe, F.setSessionRpe, bandOf, (n) => tr('session:player.effortAria', { n }))}
          </div>
          <div data-finish-q="enjoy" style={{ marginTop: 20 }}>
            {ask('enjoy', tr('session:player.enjoyQ'), tr('session:player.enjoyScale'))}
            {rating('enjoy', 5, F.enjoyment, F.setEnjoyment, () => teal, (n) => tr('session:player.enjoyAria', { n }))}
          </div>
          {duration}
          {share}
        </fieldset>

        <div style={{ marginTop: 20 }}>
          <button type="button" disabled={saving} onClick={F.onSave} data-finish-save=""
            style={{ ...btn0, width: '100%', minHeight: 50, borderRadius: 16, background: heat, color: onHeat, fontFamily: SANS, fontSize: 15, fontWeight: 700, opacity: saving ? 0.7 : 1, cursor: saving ? 'default' : 'pointer', boxShadow: `0 12px 28px -12px ${hexA(heat, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.35)` }}>
            {saving ? tr('session:player.saving') : F.saveState === 'error' ? tr('session:player.retrySave') : tr('session:player.saveFinish')}
          </button>
          {F.saveError && <p role="alert" style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: 13.5, lineHeight: 1.4, color: warn }}>{F.saveError}</p>}
          {F.saveError && F.pending && <p style={{ margin: '4px 0 0', fontFamily: SANS, fontSize: 12.5, lineHeight: 1.4, color: t.INK70 }}>{tr('session:player.retrySame')}</p>}
        </div>
      </div>
    </div>
  );
  const body = <BSCleanType t={t}>{sheet}</BSCleanType>;
  const surface = typeof document !== 'undefined' && document.getElementById ? document.getElementById('bs-phone-surface') : null;
  return surface ? createPortal(body, surface) : body;
}
