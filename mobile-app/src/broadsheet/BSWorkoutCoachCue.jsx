import React from 'react';

// ─── WORKOUT · THE COACH'S LIVE CUES ────────────────────────────────────────────────────────────
// A cue the member's coach sends from the live panel during this workout (the website's
// coachLiveWorkout.jsx, or the coach app), drawn in the player's coach slot (BSWorkoutSession.jsx's
// `session.coachCue`). The rows come from window.ShapeCoachFeed.subscribeWorkoutCues: the member's own
// coach_pushed_items rows of kind 'cue' sent since the workout began, live and by polling.
//
// ⚠ EVERY CUE, NOT ONLY THE NEWEST (Codex P2 on #2686). A cue is a row of its own now, no longer the one
// focus banner a newer focus replaced, so two cues sent close together are two things to read. The
// service hands over each one it has not delivered, oldest first, and this keeps the newest
// BS_COACH_CUES_SHOWN, newest on top, each with its own ×. It held one, and two cues landing in one read
// showed only the second.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx), and this module
// never imports the client module.

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

export const BS_COACH_CUES_SHOWN = 3;

const cueKey = (cue) => (cue && cue.id != null ? `id:${cue.id}` : `at:${cue?.sent_at}:${cue?.text}`);
const cueTime = (cue) => { const at = Date.parse(cue?.sent_at); return Number.isFinite(at) ? at : 0; };

/**
 * The cues on screen after `cue` arrives: `null` (another account) clears them; a cue already shown is
 * not shown twice; newest first, at most BS_COACH_CUES_SHOWN.
 */
export function bsAddCoachCue(list, cue) {
  if (!cue) return [];
  const key = cueKey(cue);
  const kept = (Array.isArray(list) ? list : []).filter((c) => cueKey(c) !== key);
  return [cue, ...kept].sort((a, b) => cueTime(b) - cueTime(a)).slice(0, BS_COACH_CUES_SHOWN);
}

export function BSWorkoutCoachCue({ identity }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const [cues, setCues] = React.useState([]);
  React.useEffect(() => {
    setCues([]);
    return window.ShapeCoachFeed?.subscribeWorkoutCues?.({
      userId: identity.userId, startedAt: identity.startedAt,
      onCue: (cue) => setCues((list) => bsAddCoachCue(list, cue)),
    });
  }, [identity.userId, identity.sessionId, identity.startedAt]);
  if (!cues.length) return null;
  return (
    <div data-coach-cues style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      {cues.map((cue) => (
        <div key={cueKey(cue)} data-coach-cue style={{ position: 'relative', border: '1px solid #26d8c4', borderRadius: 5, padding: '10px 12px', background: '#082b29', color: '#f6f0e4', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div role="status" aria-live="polite" aria-atomic="true" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#26d8c4' }}>{tr('session:player.coachCue')}</div>
            <div style={{ marginTop: 5, fontSize: 16, lineHeight: 1.4, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{cue.text}</div>
          </div>
          <button type="button" onClick={() => setCues((list) => list.filter((c) => cueKey(c) !== cueKey(cue)))} aria-label={tr('session:player.dismissCoachCue')} style={{ flexShrink: 0, minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: '#f6f0e4', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
      ))}
    </div>
  );
}
