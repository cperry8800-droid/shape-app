import React from 'react';
import { useBSClean, BSCleanType } from './bsCleanType.jsx';
import { BSCoachExercisesView, useBSCoachExercises, bsCoachExerciseDate, bsCoachExerciseGroups, bsTrainSessionPlan } from './BSCoachExercises.jsx';
import { BSPlanReadFailed } from './BSPlanReadFailed.jsx';
import { BSTrainBurnPage } from './BSTrainBurn.jsx';
import { BSTrainDay } from './BSTrainDay.jsx';
import { BSTrainPlanSheet } from './BSTrainPlan.jsx';
import { bsApplyMoveSwap, bsPreviewSession, bsSessionMoves, bsWorkoutDrafts } from '../services/workoutSession.mjs';
import { bsApplyTrainAdjust, bsBuildDemoTrainProgram, bsEmptyTrainProgram } from './bsClientWeekDemo.js';
import { bsFocusMin, bsFocusUntil } from '../services/focusLayout.mjs';
import { bsPlanPartRead } from '../services/planRead.mjs';

// ─── TRAIN (the member's Train tab) ───────────────────────────────────────────────────────────────
// The page: the week's plan (assigned, self-authored, or the signed-out demo), the coach's adjust on
// it, the member's swaps, the session player and its preview, the builder, the full plan sheet, the
// Build door with no plan, and a failed plan read said as one. BSTrainDay.jsx draws the day; this owns
// the data and every handler. Moved out of iosAppBroadsheetClient.jsx when the trainer's added
// exercises joined the day's session (Codex P1 on #2686), as BSIntegrationsPage and BSLeaderboard were.
//
// ⚠ TODAY'S ADDED EXERCISES ARE PART OF TODAY'S SESSION (Codex P1 on #2686). A trainer adds them from the
// website's Live console; the page reads them once (useBSCoachExercises) and Start session runs the
// program's moves and then them (bsCoachExerciseRows), under the day's assigned workout. A rest day with
// additions is no rest: it offers Start session, which runs the additions as a session of their own
// (no assigned workout to write back to). The list under the program is drawn off the same read and
// says the exercises are in today's session; with no plan, or a plan that did not load, the list keeps
// its own Start these. Another day's additions are read, not run: only today is started here.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client module imports this file, so
// it evaluates before that module's body has put its pieces on window; a top-level read would capture
// undefined (React error #130). BSClientTrain names the globals it needs on its first line, and the
// client module publishes them (its Object.assign(window, …) for Train). This file never imports the
// client module back.

// The client module's name for it, kept so the page reads as it did there.
const { useState: useStateBSC } = React;

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

export function BSClientTrain({ onProfile, goCalendar = () => {}, goRadio = () => {}, goMarket = () => {}, autoStart = false, onAutoStartConsumed = () => {} }) {
  // The client module's pieces, read at call time (see the head of this file).
  const {
    BSPage, BSPageHeader, BSFooter, BSHeaderTools, useBSProgram,
    BSBuildDoor, BSCoachAdjustBanner, BSCoachPlaylists, BSCoachPreparing, BSFindCoachBar, BSSession, BSSwapSheet,
    BSWorkoutBuilder, BSWorkoutPreview, BS_MOVE_SWAPS, BS_MOVE_SWAPS_FALLBACK, bsBuildTrainProgram, bsProgramWeek, bsWeekdayIdx, bsWeekdayName,
  } = window;
  // Home's clean type (owner, 2026-10-28: "do the same for Train and Eat pages"): Geist heads and
  // Inter Tight words under the page header (bsCleanType.jsx). The pages Train opens return before
  // the page and keep their own type, and so does the swap sheet, which sits outside the clean area.
  const t = useBSClean();
  const tr = useShapeTr();
  const bsTrainProgram = useBSProgram();
  const [day, setDay] = useStateBSC(bsWeekdayIdx()); // default to today (0=Mon..6=Sun)
  const [session, setSession] = useStateBSC(!!autoStart?.workout);
  const [launchWorkout, setLaunchWorkout] = useStateBSC(autoStart?.workout || null);
  const draftUser = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const [drafts, setDrafts] = useStateBSC(() => bsWorkoutDrafts(window.localStorage, draftUser));
  const [resumeDraft, setResumeDraft] = useStateBSC(null);
  const [openSession, setOpenSession] = useStateBSC(false);
  // A session another page started (Calendar's, Home's or Search's Start: autoStart, after the jump pushed
  // where the member was) goes back there when it is left (owner, 2026-11-10: "Make sure back buttons are
  // going back to previous page and location user was on"); one started here returns to Train.
  const [sessionViaNav, setSessionViaNav] = useStateBSC(false);
  const leaveSession = () => {
    const viaNav = sessionViaNav;
    setSession(false); setLaunchWorkout(null); setResumeDraft(null); setOpenSession(false); setDrafts(bsWorkoutDrafts(window.localStorage, draftUser));
    setSessionViaNav(false);
    if (viaNav && window.ShapeNav?.canPop?.()) window.ShapeNav.back();
  };
  const resumeBanner = drafts.length > 0 ? <div style={{ margin: `14px ${t.padX}px`, padding: 14, border: `1px solid ${t.ACCENT}`, borderRadius: 5 }}>
    <div style={{ fontFamily: t.DISPLAY, color: t.INK, fontSize: 16, fontWeight: 700 }}>{tr('session:player.unfinished')}</div>
    {drafts.map(d => <button key={d.sessionId} onClick={() => { setResumeDraft(d); setSession(true); }} style={{ display: 'block', minHeight: 44, width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: t.ACCENT, cursor: 'pointer', padding: '10px 0' }}>{tr('session:player.resume')} · {d.title || tr('session:player.liveSession')}</button>)}
  </div> : null;
  const [previewing, setPreviewing] = useStateBSC(false);
  // Burned this week, day by day (BSTrainBurnPage), opened from the row under the week (owner, 2026-10-24).
  const [burnOpen, setBurnOpen] = useStateBSC(false);
  // The full plan sheet (BSTrainPlan.jsx): the weekday it opens on, or null when closed.
  const [planAt, setPlanAt] = useStateBSC(null);
  // Auto-launch the live session ONLY when arriving from the calendar's "Start
  // session" (a one-shot pending flag), then clear it so returning to Train from
  // the calendar overlay — which remounts this screen — never re-launches.
  React.useEffect(() => { if (autoStart) { setLaunchWorkout(autoStart.workout || null); setDay(bsWeekdayIdx()); setSession(true); setSessionViaNav(true); onAutoStartConsumed(); } }, [autoStart]);
  const [swapIdx, setSwapIdx] = useStateBSC(null);          // move to swap: number | 'pick' | null
  const [moveOverrides, setMoveOverrides] = useStateBSC({}); // `${day}:${i}` → { m, s }
  React.useEffect(() => {
    let cancelled = false;
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    window.shapeDb.getUserGoals('client_train_swaps').then((saved) => {
      if (!cancelled && saved && typeof saved === 'object') setMoveOverrides(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [liveWorkouts, setLiveWorkouts] = useStateBSC(null);
  const [liveTrainCoach, setLiveTrainCoach] = useStateBSC(null); // real assigning trainer
  // The trainer this member pays, when they have one (/api/client/plan `training.coaching`, M16).
  // The trainer this member pays: the coaching object, null when the plan read says there is none,
  // undefined while it is unknown. ⚠ UNKNOWN IS NOT NONE (Codex on #2378): /api/client/plan omits
  // `coaching` when its subscriptions read fails, and a coached member was sent to find a trainer.
  const [trainCoaching, setTrainCoaching] = useStateBSC(undefined);
  const [planLoaded, setPlanLoaded] = useStateBSC(false);
  // The plan read failed, or answered without its training part (bsPlanPartRead). That is not "no
  // plan": the member is told it could not load and can try again, never sent to the Build door.
  const [planFailed, setPlanFailed] = useStateBSC(false);
  const [planRetrying, setPlanRetrying] = useStateBSC(false);
  const [builder, setBuilder] = useStateBSC(null); // { mode, ...seed } | null — the self-serve builder overlay
  // The trainer's added exercises (the Live console), read once for the list and the session alike.
  const coachEx = useBSCoachExercises();

  // Pull the client's assigned OR self-authored plan. A self-save/program lands
  // in the same table, so a rebuild after saving picks it up. On no plan for a
  // signed-in member, the Build-your-week door renders (below).
  const loadPlan = React.useCallback(async () => {
    try {
      window.ShapeMetrics?.invalidate?.();
      const p = await window.ShapePlan?.get?.();
      setTrainCoaching(p && p.training && 'coaching' in p.training ? (p.training.coaching || null) : undefined);
      const read = bsPlanPartRead(p, 'training');
      setPlanFailed(!read);
      // A failed read keeps the plan an earlier read found (a reload after a builder save).
      if (!read) return;
      if (p.training.hasPlan) { setLiveWorkouts(p.training.workouts); setLiveTrainCoach(p.training.coach || null); setDay(bsWeekdayIdx()); }
      else { setLiveWorkouts(null); setLiveTrainCoach(null); }
    } catch (e) { setPlanFailed(true); }
    finally { setPlanLoaded(true); }
  }, []);
  const retryPlan = async () => {
    setPlanRetrying(true);
    try { await loadPlan(); } finally { setPlanRetrying(false); }
  };
  React.useEffect(() => { let cancelled = false; (async () => { if (!cancelled) await loadPlan(); })(); return () => { cancelled = true; }; }, []);

  // ⚠ THE BUILT WEEK IS DERIVED, NEVER STORED. bsBuildTrainProgram bakes tr()
  // output (kicker, titles, tags, the rest-day copy) into every day, and the
  // loader above runs ONCE in a []-dep effect — so holding its result in state
  // pins the deck to whatever language was active at mount. The adjust layer
  // below DOES re-run on [t, tr], so a member switching language in-app got a
  // half-translated screen: adjusted copy in the new language over a frozen
  // English week. This is the record-shape defect one layer in — a translated
  // string held past the moment it was made. State keeps the RAW workouts; the
  // sentence is made here, on every language change.
  const liveProgram = React.useMemo(
    () => (liveWorkouts ? bsBuildTrainProgram(liveWorkouts, t, tr) : null),
    [liveWorkouts, t, tr]
  );

  // ── Per-day program (demo fallback, May 8–14, 2026) ──
  // Demo fallback program (Mon..Sun) — built from the SHARED client week so the
  // Train deck / live session / preview show the same workout as the home hero
  // and the calendar for each day. Real assigned plans still win (liveProgram).
  const MOCK_PROGRAM = React.useMemo(() => bsBuildDemoTrainProgram(t), [t]);
  // Signed in with no assigned plan → EMPTY week (no coaches yet); the demo
  // program is only the signed-out preview.
  const bsTrainSignedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const EMPTY_PROGRAM = React.useMemo(() => bsEmptyTrainProgram(t, tr), [t, tr]);

  // Apply the coach's "Adjust program" intent (client_programs.detail.training) onto
  // the deck so the per-day workouts reflect what the coach set — intensity scales
  // loads/RPE, the weekly split re-themes days + sets rest days, the note rides along.
  const PROGRAM = React.useMemo(
    () => bsApplyTrainAdjust(liveProgram || (bsTrainSignedIn ? EMPTY_PROGRAM : MOCK_PROGRAM), bsTrainProgram.detail?.training, t, tr),
    [liveProgram, MOCK_PROGRAM, EMPTY_PROGRAM, bsTrainSignedIn, bsTrainProgram.detail, t, tr]
  );
  const cur = PROGRAM[day] || PROGRAM[0];
  const days = PROGRAM.map(p => p.d);
  // Apply any coach-approved exercise swaps the user picked for this day. A swap with
  // its own scheme replaces the move's sets, reps and rest (bsApplyMoveSwap), so the
  // player runs the scheme this deck shows.
  const effMoves = (cur.moves || []).map((r, i) => bsApplyMoveSwap(r, moveOverrides[`${day}:${i}`]));
  // "No moves" is NOT the same as "no session". Every outline-delivered session —
  // a coach-assigned weekday split, and now a week-block phase — ships with an
  // empty exercise list, because the outline states the day, not the movements.
  // Keying the start CTA off effMoves alone stamped those days REST, so an
  // assigned plan read as a week of rest days. Rest is the day model's own state
  // (tag REST: no workout scheduled, or coach-set recovery); anything else is a
  // real session, and a moveless one opens as an OPEN session (log as you go).
  const isRestDay = cur.tag === 'REST';
  // Today's additions from the member's trainers, as program rows after the day's own moves. The day's
  // date is the account's, as the list's is (bsCoachExerciseDate).
  const _coachRead = coachEx.read;
  const _coachAccountToday = _coachRead && _coachRead.status === 'ready' ? _coachRead.today : null;
  const coachDate = bsCoachExerciseDate(day, new Date(), _coachAccountToday);
  const coachTodayDate = bsCoachExerciseDate(bsWeekdayIdx(), new Date(), _coachAccountToday);
  // A rest day the trainer added work to (coachOnlyDay): Start runs the additions alone, on no assigned workout.
  // ⚠ NOT BEFORE THE PLAN IS READ (Codex P1 on #2694). Until ShapePlan answers, PROGRAM is the empty week
  // (every day REST), so additions read first made today a rest day with work: Start ran them alone, on no
  // assigned workout, and the moves that arrived a moment later were left out. A signed-in member's day is
  // joined only once the plan read has finished; the signed-out demo has no read to wait for.
  const _planKnown = !bsTrainSignedIn || planLoaded;
  const _coachPlan = bsTrainSessionPlan({ moves: effMoves, isRest: isRestDay, isToday: _planKnown && day === bsWeekdayIdx(), read: _coachRead, date: coachDate });
  const sessionRows = _coachPlan.rows;
  const coachOnlyDay = _coachPlan.restWithWork;
  const _coachGroups = coachOnlyDay ? bsCoachExerciseGroups(_coachRead, coachDate) : [];
  const coachOnlyTitle = _coachGroups.length === 1 && _coachGroups[0].coachName
    ? tr('session:train.coachAdded.from', { defaultValue: 'From {name}', name: _coachGroups[0].coachName })
    : tr('session:train.coachAdded.today', { defaultValue: 'Added today' });
  // Who, if anyone, may be credited for THIS day. A coach authored it when a live
  // plan is loaded, the day is not self-programmed, and it is either a real
  // session (outline days ship moveless, so move count is not the test) or a
  // coach-SET rest. An unassigned rest day credits nobody.
  const coachDay = !!liveProgram && !cur.selfAuthored && (!isRestDay || !!cur.coachAdjust);
  const coachDayName = bsTrainSignedIn
    ? (coachDay ? (cur.coach || liveTrainCoach || tr('session:train.yourTrainer', { defaultValue: 'Your trainer' })) : '')
    : 'Jordan Chen';

  // Self-serve builder overlay (Build your week / edit a self day). On save it
  // reloads the plan so the new/edited program shows on the deck immediately.
  if (builder) return <BSWorkoutBuilder seed={builder} onClose={() => setBuilder(null)} onSaved={() => { setBuilder(null); loadPlan(); }} />;

  // Parse "4 × 8 · …" → { sets: 4, reps: '8' } so the live player reflects the
  // actual session; segment-style cardio (no "× reps") falls back to one set.
  // An empty move list = an OPEN session (log as you go); the player seeds a
  // blank move and shows ＋ Add move.
  if (session && launchWorkout && !resumeDraft) return <BSSession {...bsPreviewSession(launchWorkout, value => t.uText(value))} onBack={leaveSession} />;
  // The day's session: the program's moves, then today's added exercises (sessionRows). An open session
  // has neither; a rest day with additions runs them alone, written to no assigned workout.
  if (session) return <BSSession draft={resumeDraft} clientWorkoutId={openSession || coachOnlyDay ? null : cur.workoutId} prescriptionMeta={coachOnlyDay ? {} : { template: cur.template, program: cur.program, adjustGen: cur.adjustGen }} title={openSession ? tr('session:train.openSession', { defaultValue: 'Open session' }) : coachOnlyDay ? coachOnlyTitle : (effMoves.length === 0 && isRestDay) ? tr('session:train.openSession', { defaultValue: 'Open session' }) : cur.title} moves={openSession ? [] : bsSessionMoves(sessionRows)} onBack={leaveSession} />;
  if (previewing) return <BSWorkoutPreview program={{ ...cur, moves: sessionRows }} coach={coachDayName} onBack={() => setPreviewing(false)} onStart={() => { setPreviewing(false); setSession(true); }} />;
  if (burnOpen) return <BSTrainBurnPage onBack={() => setBurnOpen(false)} />;

  // A plan read that failed, with no plan read before it: the page says so and can read again,
  // instead of the Build door or an empty rest week.
  if (bsTrainSignedIn && planLoaded && planFailed && !liveProgram) {
    return (
      <BSPage>
        <BSPageHeader kicker={tr('session:train.kickerTrain', { defaultValue: 'Train' })} title={tr('session:train.yourTraining', { defaultValue: 'Your training' })} trailing={<BSHeaderTools onProfile={onProfile} />} />
        <BSCleanType t={t}>
        {resumeBanner}
        <BSPlanReadFailed part="training" onRetry={retryPlan} busy={planRetrying} />
        {/* The trainer's additions are their own read, so they show when the plan's did not load, with
            their own Start these (no day's session to join). */}
        <BSCoachExercisesView read={_coachRead} date={coachTodayDate} today onRetry={coachEx.retry} />
        </BSCleanType>
      </BSPage>
    );
  }

  // Signed-in member with NO plan (assigned or self) → the Build-your-week door
  // instead of the empty rest-week. Signed-out preview keeps the demo deck.
  const showBuildDoor = bsTrainSignedIn && planLoaded && !liveProgram;
  if (showBuildDoor) {
    const startTemplate = (s) => setBuilder({ mode: 'session', name: s.name, discipline: s.discipline, moves: s.moves });
    const startProgram = (p) => setBuilder({ mode: 'program', name: p.name, discipline: p.discipline, programId: p.id });
    return (
      <BSPage>
        <BSPageHeader kicker={tr('session:train.kickerTrain', { defaultValue: 'Train' })} title={tr('session:train.yourTraining', { defaultValue: 'Your training' })} trailing={<BSHeaderTools onProfile={onProfile} />} />
        <BSCleanType t={t}>
        {resumeBanner}
        {trainCoaching
          ? <BSCoachPreparing role="trainer" coaching={trainCoaching} onOpenSession={() => { setOpenSession(true); setSession(true); }} />
          : <>
            {(!bsTrainSignedIn || trainCoaching === null) && <BSFindCoachBar role="trainer" onOpen={() => goMarket('trainer')} />}
            <BSBuildDoor
              onBuild={() => setBuilder({ mode: 'session' })}
              onOpenSession={() => { setOpenSession(true); setSession(true); }}
              onStartTemplate={startTemplate}
              onStartProgram={startProgram}
              onDraft={() => setBuilder({ mode: 'program', autoDraft: true })}
            />
          </>}
        {/* ⚠ WITH NO PLAN YET, TODAY'S ADDITIONS STILL SHOW (Codex P1 on #2686): a trainer's client is often
            here, before a program is assigned, and the "New exercise from your coach" notice opens Train.
            Drawn off the page's read, with their own Start these: there is no day's session to join. */}
        <BSCoachExercisesView read={_coachRead} date={coachTodayDate} today onRetry={coachEx.retry} />
        </BSCleanType>
      </BSPage>
    );
  }

  // What the session panel says (BSTrainDay.jsx): when it is, how long until it starts, and its head.
  const _trainIsToday = day === bsWeekdayIdx();
  const _trainNow = new Date();
  const _trainUntil = _trainIsToday && !isRestDay ? bsFocusUntil(bsFocusMin(cur.time), _trainNow.getHours() * 60 + _trainNow.getMinutes()) : null;
  const _trainWhen = [_trainIsToday ? tr('home:when.today', { defaultValue: 'Today' }) : bsWeekdayName(day, 'short'), cur.timeLabel || null].filter(Boolean).join(' · ');
  // The deck headline when it differs from the title, else the title — the same
  // phrase never reads twice.
  const _trainNorm = (s) => String(s || '').trim().replace(/\.$/, '').toLowerCase();
  const _trainHead = _trainNorm(cur.headline) && _trainNorm(cur.headline) !== _trainNorm(cur.title) ? cur.headline : cur.title;

  // The page's links, in order: the full plan, then building or opening a session. Finding a coach follows
  // as its bar (BSFindCoachBar); a member who pays a trainer is not sent to find one (Codex on #2378). The
  // coach's music is no link of its own (owner, 2026-11-10: "remove the music from jordan box"): each
  // playlist sits in Playlists below, under the workouts it plays with.
  // Full plan opens the week as a sheet, every day with its moves (owner, 2026-11-10: "a pop up of the
  // actual full plan … showing the actual plan"); the calendar stays the week's Month view.
  const _trainWeekLabel = `${bsTrainProgram.trainingPhase || 'Build'} · ${tr('common:unit.weekN', { defaultValue: 'Week {n}', n: bsProgramWeek() })}`;
  // A day's moves with the member's swaps on, for On deck and the full plan alike.
  const _trainMovesOf = (i) => ((PROGRAM[i] && PROGRAM[i].moves) || []).map((r, j) => bsApplyMoveSwap(r, moveOverrides[`${i}:${j}`]));
  const _trainLinks = [
    { color: t.INK70, glyph: '▤', label: tr('session:train.fullPlan', { defaultValue: 'Full plan' }), tag: _trainWeekLabel, onOpen: () => setPlanAt(bsWeekdayIdx()) },
    ...(bsTrainSignedIn ? [
      { color: t.ACCENT, glyph: '＋', label: tr('session:train.buildWorkoutLink', { defaultValue: 'Build a workout' }), onOpen: () => setBuilder({ mode: 'session' }) },
      { color: t.INK50, glyph: '▷', label: tr('session:train.openSession', { defaultValue: 'Open session' }), onOpen: () => { setOpenSession(true); setSession(true); } },
    ] : []),
  ];

  return (
    <BSPage>
      <BSPageHeader
        kicker={`${bsTrainProgram.trainingPhase || 'Build'} · ${tr('common:unit.weekN', { defaultValue: 'Week {n}', n: bsProgramWeek() })}`}
        title={tr('session:train.yourTraining', { defaultValue: 'Your training' })}
        trailing={<BSHeaderTools onProfile={onProfile} />}
      />
      <BSCleanType t={t}>
      {resumeBanner}

      {/* ── THE DAY (the owner's C for Train, 2026-11-04: "C for tainer page but make these glow when day
          selected like in option b", restored the same day: "no revert training to what i had prior"):
          BSTrainDay.jsx draws the week as lit tiles, the coach's adjust, Burned this week as a lit slot, the
          session on a lit glass lead with its glowing Start, the program, On deck and the links. It reads
          only what the page hands it; every door is the page's own. Edit · Yours, on a repeating day the
          member wrote, opens the builder on it with its moves as rows. */}
      <BSTrainDay
        program={PROGRAM} day={day} onDay={setDay} onMonth={goCalendar} onPlan={(idx) => setPlanAt(Number.isInteger(idx) ? idx : bsWeekdayIdx())} movesOf={_trainMovesOf} cur={cur} moves={effMoves}
        swapped={effMoves.map((_, i) => !!moveOverrides[`${day}:${i}`])} isRest={isRestDay && !coachOnlyDay} when={_trainWhen} head={_trainHead}
        coachRead={_coachRead} coachDate={coachDate} onCoachRetry={coachEx.retry} coachInSession={_planKnown}
        until={_trainUntil} weekN={bsProgramWeek()} coach={coachDayName} onRadio={goRadio} onBurn={() => setBurnOpen(true)}
        onStart={() => { try { window.ShapeAnalytics?.track?.('workout_started'); } catch (e) {} setSession(true); }}
        onSwap={() => setSwapIdx('pick')} onMove={(i) => setSwapIdx(i)}
        onEditYours={cur.selfAuthored && cur.repeatDow && cur.workoutId ? () => setBuilder({ mode: 'session', editId: cur.workoutId, name: cur.title, repeatDow: cur.repeatDow, moves: (cur.moves || []).map((m) => ({ name: m.m, seg: /[·]|mi\b|min\b|Z\d/.test(m.s || '') && !m.l ? m.s : '', sets: (String(m.s).match(/(\d+)\s*×/) || [])[1] || '', reps: (String(m.s).match(/×\s*([\d–-]+)/) || [])[1] || '', load: m.l || '' })) }) : null}
        adjust={<BSCoachAdjustBanner detail={bsTrainProgram.detail} kind="training" />}
        links={_trainLinks}
        findCoach={(!bsTrainSignedIn || trainCoaching === null) ? <BSFindCoachBar role="trainer" onOpen={() => goMarket('trainer')} /> : null} />

      {/* From Jordan — the trainer's playlists (owner, 2026-10-11: "keep playlists
          though"). Signed in, the ones the member's own trainer sent them;
          signed out, the preview's sample. Separate from Eat's cooking ones. */}
      {(() => {
        const all = Array.isArray(window.BS_COACH_PLAYLISTS) ? window.BS_COACH_PLAYLISTS : [];
        const lists = all.filter(p => p.role === 'Coach');
        // Which workout a sample plays with is the sample week's own (bsBuildDemoTrainProgram's
        // `playlist`), matched as a coach's is, so `attached` no longer rides in its meta.
        const items = lists.length ? lists.map(p => ({ k: tr('session:train.playlistBy', { defaultValue: '{who} · Your trainer', who: p.by }), title: p.name, meta: tr('nutrition:eat.playlistMeta', { defaultValue: '{len} · {bpm} BPM · {tracks, plural, one {# track} other {# tracks}}', len: p.len, bpm: p.bpm, tracks: p.tracks }), url: p.url, provider: p.provider, tracks: p.songs }))
          : [{ k: 'Jordan Chen · Your trainer', title: 'Pull heavy.', meta: '52m · 95-138 BPM · 14 tracks' }];
        const who = lists.length ? String(lists[0].by || '').split(' ')[0] : 'Jordan';
        return <BSCoachPlaylists role="trainer" signedIn={bsTrainSignedIn} demo={{ who, items }} program={PROGRAM} todayIdx={bsWeekdayIdx()} />;
      })()}

      {/* The full plan: the week as a sheet, each day with its moves (swaps applied) and its playlist. It
          portals out of the clean area and keeps its type (bsCleanSheet). */}
      {planAt != null && (
        <BSTrainPlanSheet program={PROGRAM} focusIdx={planAt} weekLabel={_trainWeekLabel} coach={bsTrainSignedIn ? (liveTrainCoach || null) : 'Jordan Chen'}
          movesOf={_trainMovesOf}
          onClose={() => setPlanAt(null)} onMonth={() => { setPlanAt(null); goCalendar(); }} />
      )}
      </BSCleanType>

      {/* Exercise swap sheet — pick which move, then a coach-approved alternate. */}
      {swapIdx != null && (() => {
        if (swapIdx === 'pick') {
          return <BSSwapSheet title={tr('session:train.swap', { defaultValue: 'Swap' })} subtitle={tr('session:train.swapPick', { defaultValue: 'Swap an exercise' })} options={effMoves.map((r, i) => ({ label: r.m, sub: r.s, _i: i }))} onPick={(o) => setSwapIdx(o._i)} onClose={() => setSwapIdx(null)} />;
        }
        const orig = effMoves[swapIdx];
        if (!orig) return null;
        const alts = BS_MOVE_SWAPS[String(orig.m || '').toLowerCase().trim()] || BS_MOVE_SWAPS_FALLBACK;
        const baseName = (cur.moves[swapIdx] || {}).m;
        const options = [
          { label: baseName, sub: (cur.moves[swapIdx] || {}).s, current: true, _keep: true },
          ...alts.filter(a => a.m !== orig.m).map(a => ({ label: a.m, sub: a.s || orig.s, _alt: a })),
        ];
        return <BSSwapSheet title={tr('session:train.swapExercise', { defaultValue: 'Swap exercise' })} subtitle={orig.m} options={options} onClose={() => setSwapIdx(null)}
          onPick={(o) => {
            const key = `${day}:${swapIdx}`;
            const next = { ...moveOverrides };
            if (o._keep) delete next[key];
            else next[key] = { m: o._alt.m, s: o._alt.s || orig.s };
            setMoveOverrides(next);
            try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_train_swaps', next); } catch (e) {}
            if (!o._keep) {
              window.__bsToast && window.__bsToast(tr('session:train.swapToast', { defaultValue: 'Swapped to {to}', to: o._alt.m }), 'ok');
              // ⚠ WAS `name: 'Jordan Chen'` — the swap note was addressed to a
              // fabricated trainer for every member. Same fix as the Eat swap note.
              try { window.ShapeMessages && window.ShapeMessages.sendProviderMessage && window.ShapeMessages.sendProviderMessage({ coach: { name: liveTrainCoach || (bsTrainSignedIn ? tr('session:train.yourTrainer', { defaultValue: 'Your trainer' }) : 'Jordan Chen'), provider_role: 'trainer' }, text: tr('session:train.swapMessage', { defaultValue: 'Swapped {from} → {to} · {day}', from: baseName, to: o._alt.m, day: cur.d }) }).catch(() => {}); } catch (e) {}
            }
            setSwapIdx(null);
          }} />;
      })()}

      <BSFooter right="Pg 2 of 5" />
    </BSPage>
  );
}
