import React from 'react';
import { BSFocusTitle } from './BSFocus.jsx';

// ─── TRAIN · FROM YOUR TRAINER ──────────────────────────────────────────────────────────────────
// The exercises a trainer adds from the website's Live console ("+ Add to today's session"), on the day
// they were added, under the day's program on Train (BSTrainDay.jsx). The member's "New exercise from
// your coach" notice opens Train, so this is where it lands.
//
// ⚠ BEFORE 2026-11-10 THE EXERCISE SHOWED NOWHERE. The console saved it as a coach_pushed_items row and
// Home fetched those rows into its coach feed, but drew only the banners. The read is
// /api/client/coach-exercises (window.ShapeCoachFeed.exercises): the member's last seven days, each
// exercise on the member's day it was sent, from trainers the member pays now.
//
// ⚠ ON A DAY WITH A PLAN, TODAY'S ADDITIONS ARE PART OF THE DAY'S SESSION (Codex P1 on #2686). Train
// (BSClientTrain.jsx) runs the program's moves and then these as one session (bsCoachExerciseRows), and
// a rest day the coach added work to offers Start session; the list there says so and has no Start of
// its own (`inSession`). With no plan, or a plan that did not load, the list stands alone: Start these
// hands them to Train's player as a session of their own, by the app's shape:startWorkout.
//
// A failed read says so with a Retry, never as "nothing added"; loading and an empty day draw nothing.
// An add or a removal in the console redraws it live (ShapeCoachFeed.subscribeExercises), and so does
// coming back to the app.
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

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;
const shiftIso = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * The date ('YYYY-MM-DD') of Train's weekday `idx` (0 = Monday). Train's week is the device's, its
 * today tile the device's today; the route's days are the account's (client_profiles.timezone), and
 * `accountToday` is the route's `today`. ⚠ THE TILES COUNT FROM THE ACCOUNT'S TODAY (Codex P2 on #2686):
 * a member who keeps their home zone abroad can be a date apart from the phone, and a lookup by the
 * phone's date lost today's additions or put them on the tile beside it, where Start these is not.
 * Without the account's today (no read yet), the device's dates.
 */
export function bsCoachExerciseDate(idx, now = new Date(), accountToday = null) {
  const i = Number(idx) || 0;
  const todayIdx = (now.getDay() + 6) % 7;
  if (typeof accountToday === 'string' && DAY_ISO.test(accountToday)) return shiftIso(accountToday, i - todayIdx);
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - todayIdx);
  const d = new Date(mon); d.setDate(mon.getDate() + i);
  return isoOf(d);
}

/** A read's exercises on `date`, grouped by the trainer who added them, in the order the first of each was added. */
export function bsCoachExerciseGroups(read, date) {
  const list = read && read.status === 'ready' && read.days && Array.isArray(read.days[date]) ? read.days[date] : [];
  const groups = [];
  for (const e of list) {
    if (!e || typeof e.name !== 'string' || !e.name.trim()) continue;
    const key = String(e.providerId ?? '');
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, coachName: e.coachName || null, items: [] }; groups.push(g); }
    g.items.push(e);
  }
  return groups;
}

// A coach's sets ("3 sets", "4") as a number of sets, or undefined when it names none.
const setsOf = (v) => { const m = /\d+/.exec(String(v || '')); return m ? Number(m[0]) : undefined; };
// Reps without the word ("10–12 reps" → "10–12"), as the player's reps box pre-fills them.
const repsOf = (v) => String(v || '').replace(/\s*\breps?\b\.?/i, '').trim();

/** A day's added exercises as a workout Train's player runs (workoutSession.mjs' bsPreviewSession reads it). */
export function bsCoachExerciseWorkout(items, title) {
  return {
    title: title || '',
    exercises: (Array.isArray(items) ? items : []).map((e) => {
      const sets = setsOf(e.sets);
      const reps = repsOf(e.reps);
      return {
        name: e.name,
        sets,
        reps,
        // What the player shows under the name: "3 × 10–12" when both read as numbers, else the coach's words.
        scheme: sets && reps ? `${sets} × ${reps}` : [e.sets, e.reps].filter(Boolean).join(' · '),
        ...(e.tempo ? { tempo: e.tempo } : {}),
        ...(e.cue ? { cue: e.cue } : {}),
      };
    }),
  };
}

/**
 * A day's added exercises as rows of Train's program ({ m, s, l }, as the deck's moves are), so the day's
 * session runs them after the program's own moves (bsSessionMoves reads `sets` and `reps` first, then the
 * scheme). Each keeps its tempo and cue for the player, and `coachAdded` and its id, so no swap or
 * write-back takes one for a program move.
 */
export function bsCoachExerciseRows(items) {
  const list = (Array.isArray(items) ? items : []).filter((e) => e && typeof e.name === 'string' && e.name.trim());
  return bsCoachExerciseWorkout(list).exercises.map((e, i) => ({
    m: e.name,
    s: e.scheme || '',
    l: '',
    ...(e.sets ? { sets: e.sets } : {}),
    reps: e.reps,
    ...(e.tempo ? { tempo: e.tempo } : {}),
    ...(e.cue ? { cue: e.cue } : {}),
    coachAdded: true,
    coachExerciseId: list[i].id != null ? String(list[i].id) : null,
  }));
}

/** Every exercise added on `date`, whoever added it, in the order they were added. */
export function bsCoachExercisesOn(read, date) {
  return bsCoachExerciseGroups(read, date).flatMap((g) => g.items).sort((a, b) => String(a.sentAt || '').localeCompare(String(b.sentAt || '')));
}

/**
 * The day's session with the trainer's additions in it (Codex P1 on #2686): what Train's Start runs.
 *   moves     the day's program rows (the member's swaps on)
 *   isRest    the day is a rest day in the plan
 *   isToday   the day picked is today (another day's additions are read, not run)
 *   read      the additions' read (useBSCoachExercises); date its day on the account's calendar
 * → { rows: the program's moves then today's additions, added: the additions' rows, restWithWork: a rest
 *   day the trainer added work to, which offers Start and runs the additions alone }. A read not in yet,
 *   or failed, adds nothing: the day runs as planned, and the list says it didn't load.
 */
export function bsTrainSessionPlan({ moves = [], isRest = false, isToday = false, read = null, date = '' } = {}) {
  const own = Array.isArray(moves) ? moves : [];
  const added = isToday ? bsCoachExerciseRows(bsCoachExercisesOn(read, date)) : [];
  return { rows: added.length ? [...own, ...added] : own, added, restWithWork: !!isRest && added.length > 0 };
}

/** The member's pushed exercises, read on mount, on a change in the console, on an account change and back in the app. */
export function useBSCoachExercises() {
  const [read, setRead] = React.useState({ status: 'loading' });
  // Bumped when the account changes, so the live channel is opened again for the account now signed in.
  const [account, setAccount] = React.useState(0);
  const seq = React.useRef(0);
  const load = React.useCallback(async () => {
    const mine = ++seq.current;
    const api = window.ShapeCoachFeed;
    if (!api || typeof api.exercises !== 'function') { setRead({ status: 'none' }); return; }
    let next;
    try { next = await api.exercises(); } catch (e) { next = { status: 'error' }; }
    // Only the newest read lands: an older one answering late never paints over it.
    if (mine === seq.current) setRead(next && next.status ? next : { status: 'error' });
  }, []);
  React.useEffect(() => {
    load();
    const api = window.ShapeCoachFeed;
    const unsubscribe = api && typeof api.subscribeExercises === 'function' ? api.subscribeExercises(() => { load(); }) : () => {};
    const identity = () => { seq.current += 1; setRead({ status: 'loading' }); setAccount((n) => n + 1); };
    const foreground = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load(); };
    window.addEventListener?.('shape:identity', identity);
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', foreground);
    return () => {
      seq.current += 1;
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) { /* nothing left to stop */ }
      window.removeEventListener?.('shape:identity', identity);
      if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', foreground);
    };
  }, [load, account]);
  return { read, retry: load };
}

// The list itself, off a read. The tests draw it directly.
//   read      { status: 'loading' | 'none' | 'error' | 'ready', days }
//   date      the day shown ('YYYY-MM-DD')
//   today     whether that day is today
//   dayLabel  its short weekday name, for another day ("Added · Tue")
//   inSession today's are part of the day's session (Train with a plan): no Start of their own
export function BSCoachExercisesView({ read, date, today = true, dayLabel = '', onRetry, inSession = false }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const RUST = t.RUST || '#c0533b';
  const mono = { fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.02em', color: t.INK50 };

  if (read && read.status === 'error') {
    return (
      <div data-coach-exercises="error" role="status" style={{ margin: `${(t.sectGap || 22)}px ${t.padX}px 0`, display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: `1px solid ${t.HAIR || t.RULE}` }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70 }}>{tr('session:train.coachAdded.unread', { defaultValue: 'Your trainer’s added exercises didn’t load.' })}</span>
        {onRetry ? (
          <button type="button" data-coach-exercises-retry="" onClick={onRetry} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, padding: '0 2px', color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('session:train.coachAdded.retry', { defaultValue: 'Try again' })} →</button>
        ) : null}
      </div>
    );
  }

  const groups = bsCoachExerciseGroups(read, date);
  if (!groups.length) return null;

  return (
    <div data-coach-exercises="">
      {groups.map((g) => {
        const from = g.coachName ? tr('session:train.coachAdded.from', { defaultValue: 'From {name}', name: g.coachName }) : tr('session:train.coachAdded.fromTrainer', { defaultValue: 'From your trainer' });
        const start = () => {
          try { window.dispatchEvent(new window.CustomEvent('shape:startWorkout', { detail: { workout: bsCoachExerciseWorkout(g.items, from) } })); } catch (e) { /* the list is still there to follow */ }
        };
        return (
        <div key={g.key} data-coach-exercises-coach={g.key}>
          <BSFocusTitle color={RUST}
            kicker={from}
            title={today ? tr('session:train.coachAdded.today', { defaultValue: 'Added today' }) : tr('session:train.coachAdded.onDay', { defaultValue: 'Added · {day}', day: dayLabel })}
            meta={tr('session:train.coachAdded.count', { defaultValue: '{count, plural, one {# exercise} other {# exercises}}', count: g.items.length })} />
          <div style={{ padding: `10px ${t.padX}px 0` }}>
            {g.items.map((e, i) => {
              const scheme = [e.sets, e.reps].filter(Boolean).join(' · ');
              const notes = [e.tempo ? tr('session:train.coachAdded.tempo', { defaultValue: 'Tempo {tempo}', tempo: e.tempo }) : null, e.cue].filter(Boolean);
              return (
                <div key={e.id || i} data-coach-exercise="" style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'baseline', padding: '12px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{pad(i + 1)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{e.name}</span>
                    {notes.length ? <span data-coach-exercise-notes="" style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.4, color: t.INK70, overflowWrap: 'anywhere' }}>{notes.join(' · ')}</span> : null}
                  </span>
                  {scheme ? <span data-coach-exercise-scheme="" style={{ ...mono, textAlign: 'right', maxWidth: 120, overflowWrap: 'anywhere' }}>{scheme}</span> : <span />}
                </div>
              );
            })}
            {today && inSession ? (
              <div data-coach-exercises-in-session="" style={{ marginTop: 6, ...mono, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: RUST, fontWeight: 700 }}>
                {tr('session:train.coachAdded.inSession', { defaultValue: 'In today’s session' })}
              </div>
            ) : today ? (
              <button type="button" data-coach-exercises-start="" onClick={start}
                style={{ marginTop: 6, minHeight: 44, display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 0, padding: '0 2px', color: RUST, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {tr('session:train.coachAdded.start', { defaultValue: 'Start these' })} →
              </button>
            ) : null}
          </div>
        </div>
        );
      })}
    </div>
  );
}

// The section on Train for the week's day `dayIdx` (0 = Monday), reading for itself.
export function BSCoachExercises({ dayIdx = 0, today = true, dayLabel = '' }) {
  const { read, retry } = useBSCoachExercises();
  return <BSCoachExercisesView read={read} date={bsCoachExerciseDate(dayIdx, new Date(), read && read.status === 'ready' ? read.today : null)} today={today} dayLabel={dayLabel} onRetry={retry} />;
}
