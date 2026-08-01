import React from 'react';
import { createPortal } from 'react-dom';
import { startTour } from '../../../public/newdesign/spotlightTour.js';
import { bsProHourLabel, bsProGapLabel, bsProDurationFromSub, bsProDayShape, bsProAttentionBudget, bsProLeadVerdict } from '../services/proLedger.mjs';
import { bsAssignExercise, bsAssignDayLine, bsAssignWeekLine, bsWeekUnits, bsWeekSpan, bsAssignMeal, bsAssignIso, bsAssignMonday, bsAssignKey, bsAssignSeed, bsAssignWeeks, bsPlanWeek, bsCanonicalDays, bsBlockIsSession, bsPlannedMinutes, bsPlannedRpe, BS_LENGTH_CHIPS, BS_EFFORT_CHIPS } from '../services/planOutline.mjs';
import { bsAuthorStep, BS_STATIONS } from '../services/cookable.mjs';
import { bsSelfPlansSummary } from '../services/selfPlansSummary.mjs';
import { bsValidLivePayload, bsValidLiveCoachPayload } from '../services/liveProgress.mjs';
import { bsVarianceCopy } from '../../../public/newdesign/varianceBand.mjs';
import { bsDeriveCycle } from '../services/cyclePhase.mjs';
import { BS_LISTING_GALLERY_MAX, BS_LISTING_CAPTION_MAX } from '../services/listingMedia.mjs';
import { useBSNavHistory, bsNavStepTab, useBSNavGestureHandler, useBSNavSlide } from './bsNavShell.js';
// Two coach surfaces share ONE severity engine (bsRowSeverity — prefers the
// live getTriageFeed `_sig`, else the local status scorer) reading ONE roster
// (useBSProRoster): BSProToday's THE WIRE (today's attention budget, capped at
// 3 rows via bsProAttentionBudget) and BSProRosterView (the full ranked book,
// every client grouped red -> amber -> green with search + phase filters).
// iosAppBroadsheetPros.jsx — Trainer & Nutritionist roles in Broadsheet style.
// Lighter pass: 4 tabs each — Today, Clients, Plans/Pubs, Me.

const { useState: useStateBSP, useEffect: useEffectBSP } = React;

// The masthead contract (owner ruling 2026-08-01) — one top inset + one corner
// gap for every page, chrome-owned. Local fallbacks so a load-order slip can't
// render "undefinedpx"; see iosAppBroadsheet.jsx's BS_MAST_TOP.
const BS_MAST_TOP = (typeof window !== 'undefined' && window.BS_MAST_TOP) || 44;
// Same inset as a CSS value — flat on device, floored to the preview's drawn
// notch. See the chrome's declaration for why max() is uniform in both.
const BS_MAST_TOP_CSS = (typeof window !== 'undefined' && window.BS_MAST_TOP_CSS) || `max(${BS_MAST_TOP}px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))`;
const BS_CORNER_GAP = (typeof window !== 'undefined' && window.BS_CORNER_GAP) || 9;

// The i18n translator for this module. Mirrors client.jsx's useShapeTr —
// self-contained on the window globals (ShapeI18n/ShapeLocale), so this module
// doesn't depend on another file's copy or its load order.
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
// Active app locale for Intl date/number formatting.
function coachLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}
// Non-reactive translator for module-scope helpers (roster severity/directives)
// that render verdict text but can't hold a React hook. Reads the live i18n
// bridge at call time; the components that consume these outputs carry their
// own useShapeTr() subscription, so they re-run on locale change.
function coachTr(key, opts) {
  const v = typeof window !== 'undefined' ? window.ShapeI18n?.t?.(key, opts) : undefined;
  return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
}
const {
  useBS, BSBackButton, BSPage, BSMasthead, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSPlate,
  BSSlab, BSCell, BSTag, BSRow, BSHeadlineNumber, BSHalftone,
  BSTabBar, BSFooter,
  BSSheetProvider, useBSSheet, BSCalendarScreen,
  BSRadioPrompt, BSRadioScreen, BSNowPlaying,
  BSClientChat, BSSettings, BSShapeScorePage, BSShapeStorePage, BSContactPage, BSTermsPage, SHAPE_SCORE_PROFILES, _bsUseLiveScore,
  BSPublicProfile, BSFacetAvatar, bsAmLive,
} = window;

// These identity/tier helpers are set on `window` by the CLIENT bundle, which
// may evaluate AFTER this module. Read them lazily at call time (with safe
// fallbacks) instead of capturing `undefined` at module load — otherwise a
// coach session that loads this bundle first crashes with "… is not a function".
const bsTierColor   = (...a) => { try { return (window.bsTierColor && window.bsTierColor(...a)) || '#8a8f98'; } catch (e) { return '#8a8f98'; } };
const bsMyInitials  = () => { try { return (window.bsMyInitials && window.bsMyInitials()) || 'A'; } catch (e) { return 'A'; } };
const bsMyTierColor = () => { try { return (window.bsMyTierColor && window.bsMyTierColor()) || '#8a8f98'; } catch (e) { return '#8a8f98'; } };
// Coach tier ladder (scheme J) translator — set on window by the client bundle.
const bsCoachTier   = (x) => { try { return (window.bsCoachTier && window.bsCoachTier(x)) || x; } catch (e) { return x; } };
// Signed-in (live account) check for coach surfaces — demo data is preview-only,
// so signed-in falls back to empty (not the demo schedule/roster/etc.).
function bsProSignedIn() { try { return !!(window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id); } catch (e) { return false; } }

// Hydrate the coach's Shape Score tier into window.ShapeScore at app startup so
// every coach avatar (home header, Me) reflects the right tier color before the
// Me tab is opened. Mirrors the client shell's startup fetch.
function _bsHydrateProScore() {
  if (typeof window === 'undefined') return;
  // A coach's tier comes from their COACH score (clients/sessions/programs), not
  // their personal member ledger — fetch /api/coach/score, which now returns the
  // 5-rung coach ladder (Certified/Pro/Elite/Master/Icon) as a string current_tier
  // (no bsCoachTier remap needed). Dietitians ride the nutritionist rails.
  const role = String(window.ShapeAuth?.getCachedState?.()?.profile?.role || '').toLowerCase();
  const coachRole = role === 'trainer' ? 'trainer' : (role === 'nutritionist' || role === 'dietitian') ? 'nutritionist' : null;
  if (!coachRole) return;
  fetch(`/api/coach/score?role=${coachRole}`, { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && typeof d.total === 'number') { try { window.ShapeScore = { points: d.total || 0, tier: d.current_tier || 'Certified' }; } catch (e) {} } })
    .catch(() => {});
}

function formatReviewSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (!min) return `${sec}s`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// Live wall-clock HH:MM for the Today hero (replaces the old hardcoded '09:42').
function bsNowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "2026-07-14" → "JUL 14" for the Case File's self-programmed leaders. The
// T00:00:00 suffix pins the ISO day to LOCAL midnight (bare ISO parses UTC and
// can render the previous day west of Greenwich). Falls back to the raw string.
function bsSelfPlanDateLabel(iso) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d)) return String(iso || '');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
  } catch (e) { return String(iso || ''); }
}

// Re-render on live-presence change (coach Today live-now banner). Mirrors the
// client bundle's useBSPresence, using the pros hooks. ShapePresence.activityOf
// is hydrated app-wide by startActivity() on every signed-in session.
function useProPresenceTick() {
  const [v, setV] = useStateBSP(0);
  useEffectBSP(() => {
    const bump = () => setV((x) => x + 1);
    let off = null;
    try { off = window.ShapePresence && window.ShapePresence.onChange && window.ShapePresence.onChange(bump); } catch (e) {}
    try { window.addEventListener('shape:presence', bump); } catch (e) {}
    return () => { try { off && off(); } catch (e) {} try { window.removeEventListener('shape:presence', bump); } catch (e) {} };
  }, []);
  return v;
}

function demoWorkoutReviewSessions(role = 'trainer') {
  const isNutri = role === 'nutritionist';
  // Nutritionist review = meal-log days (kcal/protein/meals) — NOT relabeled
  // workout sets. Honest nutrition shape; the detail body branches on
  // `nutrition: true`.
  if (isNutri) return [
    { id: 'demo-nutritionist-day-1', nutrition: true, title: 'Tue · 4 meals logged', status: 'complete day',
      kcal: 1980, target: 2100, protein_g: 152, protein_target_g: 170, logged: 4, planned: 4, flag: null,
      meals: [
        { slot: 'Breakfast', name: 'Greek yogurt bowl', kcal: 420, macros: '32P · 44C · 12F' },
        { slot: 'Lunch', name: 'Chicken + rice plate', kcal: 620, macros: '48P · 62C · 16F' },
        { slot: 'Snack', name: 'Protein shake + banana', kcal: 310, macros: '30P · 38C · 4F' },
        { slot: 'Dinner', name: 'Salmon, potatoes, greens', kcal: 630, macros: '42P · 48C · 24F' },
      ], coach_workout_review_notes: [] },
    { id: 'demo-nutritionist-day-2', nutrition: true, title: 'Mon · 3 of 4 meals logged', status: 'gap flagged',
      kcal: 1210, target: 2100, protein_g: 82, protein_target_g: 170, logged: 3, planned: 4,
      flag: 'PROTEIN 88G UNDER · DINNER UNLOGGED',
      meals: [
        { slot: 'Breakfast', name: 'Oats + berries', kcal: 390, macros: '18P · 62C · 9F' },
        { slot: 'Lunch', name: 'Turkey wrap', kcal: 540, macros: '38P · 48C · 18F' },
        { slot: 'Snack', name: 'Cottage cheese + fruit', kcal: 280, macros: '26P · 30C · 6F' },
      ], coach_workout_review_notes: [] },
  ];
  return [
    {
      id: `demo-${role}-session-1`,
      title: 'Lower pull session',
      workout_name: 'Lower Pull - Peak',
      status: 'completed',
      started_at: '2026-05-14T13:05:00Z',
      ended_at: '2026-05-14T13:57:00Z',
      duration_seconds: 3120,
      summary: { completedSets: 10, avgSetSeconds: 48, avgRestSeconds: 94 },
      workout_set_logs: [
        { id: 'd1', movement_name: 'Trap bar deadlift', set_number: 1, target_reps: '5', target_load: '245 lb', completed: true, set_duration_seconds: 42, rest_before_seconds: 0 },
        { id: 'd2', movement_name: 'Trap bar deadlift', set_number: 2, target_reps: '5', target_load: '265 lb', completed: true, set_duration_seconds: 47, rest_before_seconds: 118 },
        { id: 'd3', movement_name: 'Bulgarian split squat', set_number: 1, target_reps: '8/side', target_load: '45 lb', completed: true, set_duration_seconds: 62, rest_before_seconds: 96 },
      ],
      workout_sensor_samples: [
        { id: 's1', source: 'watch', metric: 'avg_hr', value: 132, unit: 'bpm' },
        { id: 's2', source: 'watch', metric: 'max_hr', value: 166, unit: 'bpm' },
        { id: 's3', source: 'watch', metric: 'calories', value: 418, unit: 'kcal' },
      ],
      coach_workout_review_notes: [
        { id: 'n1', body: 'Rest timing is solid. Cue slower eccentric on set 2 next week.', visibility: 'client', created_at: '2026-05-14T16:05:00Z' },
      ],
    },
    {
      id: `demo-${role}-session-2`,
      title: 'Upper push session',
      workout_name: 'Upper Push - Tempo',
      status: 'completed',
      started_at: '2026-04-20T18:30:00Z',
      ended_at: '2026-04-20T19:18:00Z',
      duration_seconds: 2880,
      summary: { completedSets: 8, avgSetSeconds: 41, avgRestSeconds: 86 },
      workout_set_logs: [
        { id: 'd4', movement_name: 'Incline DB press', set_number: 1, target_reps: '10', target_load: '55 lb', completed: true, set_duration_seconds: 39, rest_before_seconds: 0 },
        { id: 'd5', movement_name: 'Incline DB press', set_number: 2, target_reps: '10', target_load: '55 lb', completed: true, set_duration_seconds: 43, rest_before_seconds: 82 },
      ],
      workout_sensor_samples: [
        { id: 's4', source: 'watch', metric: 'avg_hr', value: 119, unit: 'bpm' },
      ],
      coach_workout_review_notes: [],
    },
  ];
}

// ─── Reusable week strip for trainer / nutritionist home ─────
// Compact 7-day calendar matching the one on Client home, with role-tinted
// dots showing what's on each day. Selecting a day is local-only — pros
// click "Open calendar →" to drill in.
function BSWorkoutReviewPage({ role = 'trainer', onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const isNutri = role === 'nutritionist';
  const heat = bsProHeat(t, role);
  const [sessions, setSessions] = useStateBSP([]);
  const [selectedId, setSelectedId] = useStateBSP(null);
  const [note, setNote] = useStateBSP('');
  const [status, setStatus] = useStateBSP(tr('coach:review.statusLoading', { defaultValue: 'LOADING…' }));

  useEffectBSP(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await window.ShapeWorkoutLogs?.listSessions?.();
        const rows = Array.isArray(result?.data) ? result.data : [];
        if (cancelled) return;
        const nextRows = rows.length ? rows : demoWorkoutReviewSessions(role);
        setSessions(nextRows);
        setSelectedId((current) => current || nextRows[0]?.id || null);
        setStatus(rows.length ? tr('coach:review.statusLiveLogs', { defaultValue: 'LIVE · SUPABASE SESSION LOGS' }) : tr('coach:review.statusDemoQueue', { defaultValue: 'DEMO QUEUE · UNTIL CLIENT SESSIONS APPEAR' }));
      } catch (error) {
        if (cancelled) return;
        const fallback = demoWorkoutReviewSessions(role);
        setSessions(fallback);
        setSelectedId(fallback[0]?.id || null);
        setStatus(tr('coach:review.statusDemoOffline', { defaultValue: 'DEMO QUEUE · OFFLINE' }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [role]);

  const selected = sessions.find((session) => session.id === selectedId) || sessions[0];
  const setLogs = selected?.workout_set_logs || selected?.set_logs || [];
  const sensorSamples = selected?.workout_sensor_samples || selected?.sensor_samples || [];
  const reviewNotes = selected?.coach_workout_review_notes || selected?.review_notes || [];
  const completedSets = selected?.summary?.completedSets || setLogs.filter((entry) => entry.completed !== false).length;
  const avgSet = selected?.summary?.avgSetSeconds || (completedSets ? Math.round(setLogs.reduce((sum, entry) => sum + Number(entry.set_duration_seconds || entry.setDurationSeconds || 0), 0) / completedSets) : 0);
  const restRows = setLogs.filter((entry) => Number.isFinite(Number(entry.rest_before_seconds ?? entry.restBeforeSeconds)));
  const avgRest = selected?.summary?.avgRestSeconds || (restRows.length ? Math.round(restRows.reduce((sum, entry) => sum + Number(entry.rest_before_seconds ?? entry.restBeforeSeconds ?? 0), 0) / restRows.length) : 0);

  const saveNote = async () => {
    const clean = note.trim();
    if (!selected?.id || !clean) return;
    setStatus(tr('coach:review.savingNote', { defaultValue: 'Saving review note...' }));
    try {
      const result = await window.ShapeWorkoutLogs?.addCoachReviewNote?.({
        sessionId: selected.id,
        providerRole: role,
        body: clean,
        visibility: 'client',
      });
      const saved = result?.data || { id: `local-${Date.now()}`, body: clean, visibility: 'client', created_at: new Date().toISOString() };
      setSessions((rows) => rows.map((session) => session.id === selected.id
        ? { ...session, coach_workout_review_notes: [...(session.coach_workout_review_notes || []), saved] }
        : session));
      setNote('');
      setStatus(result?.stored === 'supabase' ? tr('coach:review.noteSavedRemote', { defaultValue: 'Review note saved to Supabase' }) : tr('coach:review.noteSavedLocal', { defaultValue: 'Review note saved locally' }));
    } catch (error) {
      const saved = { id: `local-${Date.now()}`, body: clean, visibility: 'client', created_at: new Date().toISOString() };
      setSessions((rows) => rows.map((session) => session.id === selected.id
        ? { ...session, coach_workout_review_notes: [...(session.coach_workout_review_notes || []), saved] }
        : session));
      setNote('');
      setStatus(error?.message || tr('coach:review.savedDemo', { defaultValue: 'Saved locally for this demo session' }));
    }
  };

  // Eyebrow-ABOVE-figure register (the Open Ledger hero-stat pattern); bare — no
  // rule/box/fill.
  const stat = (label, value) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 27, lineHeight: 1, color: t.INK, fontWeight: t.W.display, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );

  return (
    <BSPage>
      {/* ── Ledger header — mast row (the standard inset), then the universal
          back row (← BACK left · THE QUEUE eyebrow right), serif "Workout
          review." (heat italic), status meta. corners: false — the review note
          is a textarea that only lands on Save review note. ── */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow({ corners: false })}</div>
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <BSBackButton onClick={onBack} />
          <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
            {tr('coach:review.queueEyebrow', { defaultValue: 'THE QUEUE' })} <span style={{ color: `${t.INK}80` }}>· {tr('coach:review.itemsCount', { defaultValue: '{count, plural, one {# ITEM} other {# ITEMS}}', count: sessions.length })}</span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK, lineHeight: 1.05 }}>
          {isNutri ? tr('coach:review.titleNutri', { defaultValue: 'Client' }) : tr('coach:review.titleTrainer', { defaultValue: 'Workout' })} <i style={{ color: heat, fontStyle: 'italic' }}>{tr('coach:review.titleAccent', { defaultValue: 'review.' })}</i>
        </div>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{status}</div>
      </div>

      {/* ── The queue — dot-leader rows; the selected row carries a heat spine +
          aria-current (never color-only). No fill, no radius. ── */}
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        {sessions.map((session) => {
          const active = session.id === selected?.id;
          const isNut = session.nutrition === true;
          const count = isNut ? `${session.logged}/${session.planned}` : (session.summary?.completedSets || (session.workout_set_logs || []).length || 0);
          const unit = isNut ? tr('coach:review.unitMeals', { defaultValue: 'MEALS' }) : tr('coach:review.unitSets', { defaultValue: 'SETS' });
          const title = session.workout_name || session.title || tr('coach:review.sessionFallback', { defaultValue: 'Workout session' });
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelectedId(session.id)}
              aria-current={active ? 'true' : undefined}
              aria-label={`${title}, ${count} ${unit.toLowerCase()}, ${session.status || 'completed'}`}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0,
                borderTop: `1px solid ${t.INK}12`,
                borderLeft: active ? `3px solid ${heat}` : '3px solid transparent',
                minHeight: 52, padding: '11px 0 11px 11px',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                <span aria-hidden style={{ flex: 1, minWidth: 18, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} />
                <span style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.04em', color: t.INK, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{count} {unit}</span>
              </span>
              <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
                {(session.status || 'completed')}{isNut ? '' : ` · ${formatReviewSeconds(session.duration_seconds)}`}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <>
          {/* Nutrition day (meal-log register + flag + per-meal rows) vs. the
              workout body (sets + watch samples); COACH NOTES is shared below. */}
          {selected.nutrition ? (
            <div style={{ padding: `22px ${t.padX}px 0` }}>
              {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={`${tr('coach:review.mealLog', { defaultValue: 'MEAL LOG' })} · ${selected.status || 'logged'}`} />}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {stat(tr('coach:review.statKcal', { defaultValue: 'Kcal' }), selected.kcal)}
                {stat(tr('coach:review.statTarget', { defaultValue: 'Target' }), selected.target)}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{tr('coach:review.statProtein', { defaultValue: 'Protein' })}</div>
                  <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 27, lineHeight: 1, color: t.INK, fontWeight: t.W.display, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums' }}>
                    {selected.protein_g}<span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50, marginLeft: 3 }}>/{selected.protein_target_g}G</span>
                  </div>
                </div>
                {stat(tr('coach:review.statLogged', { defaultValue: 'Logged' }), `${selected.logged}/${selected.planned}`)}
              </div>
              {selected.flag ? (
                <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.RUST }}>{selected.flag}</div>
              ) : null}
              <div style={{ marginTop: 16 }}>
                {(selected.meals || []).map((meal, index) => (
                  <div key={index} style={{ borderTop: `1px solid ${t.INK}12`, padding: '11px 0', minHeight: 52 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meal.slot} · {meal.name}</span>
                      <span aria-hidden style={{ flex: 1, minWidth: 18, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} />
                      <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: t.INK, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{meal.kcal} KCAL</span>
                    </span>
                    <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{meal.macros}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
          {/* ── Session detail — station head + bare 4-up registers (eyebrow above
              figure) + dot-leader set rows. The bordered card is gone. ── */}
          <div style={{ padding: `22px ${t.padX}px 0` }}>
            {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={`${tr('coach:review.sessionDetail', { defaultValue: 'SESSION DETAIL' })} · ${selected.status || 'completed'}`} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {stat(tr('coach:review.statSets', { defaultValue: 'Sets' }), completedSets)}
              {stat(tr('coach:review.statAvgSet', { defaultValue: 'Avg set' }), formatReviewSeconds(avgSet))}
              {stat(tr('coach:review.statAvgRest', { defaultValue: 'Avg rest' }), formatReviewSeconds(avgRest))}
              {stat(tr('coach:review.statElapsed', { defaultValue: 'Elapsed' }), formatReviewSeconds(selected.duration_seconds))}
            </div>
            <div style={{ marginTop: 16 }}>
              {setLogs.length ? setLogs.map((entry, index) => {
                const name = `${entry.movement_name || entry.moveName || tr('coach:review.movementFallback', { defaultValue: 'Movement' })} #${entry.set_number || entry.setNumber || index + 1}`;
                const target = `${entry.target_reps || entry.targetReps || tr('coach:review.targetFallback', { defaultValue: 'target' })} · ${entry.target_load || entry.targetLoad || tr('coach:review.loadFallback', { defaultValue: 'load' })}`;
                return (
                  <div key={entry.id || index} style={{ borderTop: `1px solid ${t.INK}12`, padding: '11px 0', minHeight: 52 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      <span aria-hidden style={{ flex: 1, minWidth: 18, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} />
                      <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: t.INK, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tr('coach:review.setLabel', { defaultValue: 'SET' })} {formatReviewSeconds(entry.set_duration_seconds ?? entry.setDurationSeconds)} · {tr('coach:review.restLabel', { defaultValue: 'REST' })} {formatReviewSeconds(entry.rest_before_seconds ?? entry.restBeforeSeconds)}</span>
                    </span>
                    <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{target}</span>
                  </div>
                );
              }) : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:review.noSetsLogged', { defaultValue: 'NO SETS LOGGED' })} /> : null)}
            </div>
          </div>

          {/* ── Watch samples — bare registers (eyebrow above figure); a pending
              sample renders — in t.INK50. ── */}
          <div style={{ padding: `22px ${t.padX}px 0` }}>
            {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:review.watchSamples', { defaultValue: 'WATCH SAMPLES' })} meta={tr('coach:review.samplesCount', { defaultValue: '{count, plural, one {# sample} other {# samples}}', count: sensorSamples.length })} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, rowGap: 16 }}>
              {(sensorSamples.length ? sensorSamples : [{ metric: tr('coach:review.watchDataFallback', { defaultValue: 'watch data' }), value: 'pending', unit: '' }]).slice(0, 4).map((sample, index) => {
                const pending = sample.value === 'pending' || sample.value == null;
                return (
                  <div key={sample.id || index} style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{String(sample.metric || sample.type || tr('coach:review.metricFallback', { defaultValue: 'metric' })).replace(/_/g, ' ')}</div>
                    <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 26, color: pending ? t.INK50 : t.INK, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {pending ? '—' : sample.value}{!pending && sample.unit ? <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', color: t.INK50, textTransform: 'uppercase', marginLeft: 5 }}>{sample.unit}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
            </>
          )}

          {/* ── Coach notes — heat-spine note rows over a quiet composer form (the
              textarea + save button stay a quiet form; button keeps its t.INK
              fill — this page's primary action). ── */}
          <div style={{ padding: `22px ${t.padX}px 22px` }}>
            {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:review.coachNotes', { defaultValue: 'COACH NOTES' })} meta={tr('coach:review.notesCount', { defaultValue: '{count, plural, one {# note} other {# notes}}', count: reviewNotes.length })} />}
            <div style={{ display: 'grid', gap: 10 }}>
              {reviewNotes.map((item) => (
                <div key={item.id} style={{ borderLeft: `3px solid ${heat}`, padding: '8px 0 8px 11px', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, lineHeight: 1.4 }}>
                  {item.body}
                </div>
              ))}
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr('coach:review.notePlaceholder', { defaultValue: 'Write feedback for the client...' })} style={{
                width: '100%',
                minHeight: 94,
                resize: 'vertical',
                border: `1px solid ${t.RULE}`,
                borderRadius: 12,
                background: t.PAPER2,
                color: t.INK,
                padding: 12,
                fontFamily: t.DISPLAY,
                fontSize: 15,
                lineHeight: 1.35,
                outline: 'none',
              }} />
              <button onClick={saveNote} style={{
                border: 0,
                borderRadius: 12,
                background: t.INK,
                color: t.PAPER,
                minHeight: 48,
                fontFamily: t.MONO,
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 800,
                cursor: 'pointer',
              }}>
                {tr('coach:review.saveNote', { defaultValue: 'Save review note' })}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </BSPage>
  );
}

// Coach "live now" — read-only mirror of the client's live session: running
// timer, sets as they land, current move, plus a quick-cue sender.
function BSProLiveWatch({ client = 'Alex Rivera', clientId = null, workout = 'Upper Pull — Peak', onBack = () => {} }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [now, setNow] = useStateBSP(Date.now());
  const [startedAt] = useStateBSP(Date.now() - (30 * 60 + 55) * 1000); // ~30:55 in (DEMO only)
  const [cueDraft, setCueDraft] = useStateBSP('');
  const [sentCue, setSentCue] = useStateBSP(null);
  useEffectBSP(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Real mode (spec 2026-07-18): a real clientId + a readable row → render the
  // PAYLOAD (names + set counts; loads render '—' — v1 broadcasts none, and the
  // demo figures must NEVER show for a real client). No readable row → the demo
  // grid is NOT shown either: the console keeps elapsed/kind and reads an honest
  // neutral line. The hardcoded demo survives ONLY for demo roster entries.
  const [liveRow, setLiveRow] = useStateBSP(null);
  useEffectBSP(() => {
    if (!clientId || !window.ShapeLiveProgress) return undefined;
    let on = true; let expTimer = null; let evented = false;
    // TOCTOU guard (review: CodeRabbit) — see the boost sheet: a late initial
    // get() must not overwrite a newer realtime event or a DELETE.
    const take = (r, fromEvent) => {
      if (!on) return;
      if (fromEvent) evented = true; else if (evented) return;
      setLiveRow(r);
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      const expMs = r && r.expires_at ? new Date(r.expires_at).getTime() - Date.now() : 0;
      if (expMs > 0) expTimer = setTimeout(() => { if (on) setLiveRow(null); }, expMs);   // subscription-side expiry
    };
    window.ShapeLiveProgress.get(clientId).then((r) => take(r, false)).catch(() => {});
    const off = window.ShapeLiveProgress.subscribe(clientId, (r) => take(r, true));
    return () => { on = false; if (expTimer) clearTimeout(expTimer); off(); };
  }, [clientId]);
  // malformed → honest-absent. bsValidLivePayload now returns a DISCRIMINATED
  // UNION (workout | cooking, spec 2026-07-19), and this console renders
  // workout scaffolding — a cooking row must fall through to the neutral
  // no-detail line, never an exercise grid built from fields it doesn't carry.
  // Coach channel (spec 2026-07-19, owner-ratified): real loads/reps/RPE for
  // the client's OWN coach, from a separate coach-only row. RLS decides — a
  // non-coach, and a SINCE-REVOKED coach, simply reads nothing. NO persistent
  // cache anywhere: component state only. That alone is not the revocation
  // bound though — revocation is SILENT to an open page (RLS just stops
  // delivering events), so the bound is the periodic protected re-read below.
  const [coachRow, setCoachRow] = useStateBSP(null);
  const COACH_RECHECK_MS = 60000;            // how often an on-screen row re-proves access
  useEffectBSP(() => {
    setCoachRow(null);                       // reset on client change
    if (!clientId || !window.ShapeLiveProgress?.getCoach) return undefined;
    let on = true; let expTimer = null; let evented = false;
    const refetch = () => {
      // On expiry, RE-FETCH rather than merely nulling (spec round 3): a
      // revoked link's protected re-read returns nothing under RLS, so held
      // coach state actively clears at the first re-check — and a failed or
      // empty re-read clears it too.
      window.ShapeLiveProgress.getCoach(clientId)
        .then((r) => { if (on) take(r, 'refetch'); })
        .catch(() => { if (on) setCoachRow(null); });
    };
    // `src`: 'init' | 'event' | 'refetch'. The evented guard exists ONLY to stop
    // a slow initial read from clobbering a realtime event that landed first.
    // A 'refetch' is the expiry/revocation re-check and is AUTHORITATIVE — the
    // old boolean form swallowed it once any event had arrived, so a revoked
    // coach's loads could never clear. Same defect as the web station carried;
    // it was reported there and is fixed here for parity.
    const take = (r, src) => {
      if (!on) return;
      if (src === 'event') evented = true;
      else if (src === 'init' && evented) return;
      const expMs = r && r.expires_at ? new Date(r.expires_at).getTime() - Date.now() : 0;
      if (r && !(expMs > 0)) r = null;        // expired / NaN expiry = absence
      setCoachRow(r);
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      // Bounded re-check, not the row's full remaining life: revocation is
      // silent (RLS just stops delivering events) and the writer refreshes
      // expires_at to 30 MINUTES on every push, so an unbounded timer left the
      // last snapshot on screen for up to half an hour.
      if (r && expMs > 0) expTimer = setTimeout(() => { if (on) refetch(); }, Math.min(expMs, COACH_RECHECK_MS));
    };
    window.ShapeLiveProgress.getCoach(clientId).then((r) => take(r, 'init')).catch(() => {});
    const offC = window.ShapeLiveProgress.subscribeCoach
      ? window.ShapeLiveProgress.subscribeCoach(clientId, (r) => take(r, 'event'))
      : () => {};
    return () => { on = false; if (expTimer) clearTimeout(expTimer); offC(); };
  }, [clientId]);
  // malformed → honest-absent. bsValidLivePayload now returns a DISCRIMINATED
  // UNION (workout | cooking, spec 2026-07-19), and this console renders
  // workout scaffolding — a cooking row must fall through to the neutral
  // no-detail line, never an exercise grid built from fields it doesn't carry.
  // Preference: an unexpired, VALID coach row wins; else the public row; else
  // neutral. A malformed coach payload falls back rather than blanking.
  const cp = coachRow && coachRow.expires_at && new Date(coachRow.expires_at).getTime() > Date.now()
    ? bsValidLiveCoachPayload(coachRow.payload) : null;
  const lpAny = cp || (liveRow ? bsValidLivePayload(liveRow.payload) : null);
  const lp = lpAny && (!lpAny.kind || lpAny.kind === 'workout') ? lpAny : null;
  const liveMode = !!clientId;   // real client → NEVER the demo data, row or not

  const demoMoves = [
    { name: 'Pull-up', scheme: '4 × 6-8', rest: '180s', load: '42 lb', sets: 4, done: 4 },
    { name: 'Barbell row', scheme: '4 × 8', rest: '2:00', load: '155 lb', sets: 4, done: 2, active: true, cue: 'Hinge 45°, pull to sternum.' },
    { name: 'Chest-sup. row', scheme: '3 × 10', rest: '90s', load: '60 lb', sets: 3, done: 0 },
    { name: 'Face pull', scheme: '3 × 15', rest: '60s', load: '35 lb', sets: 3, done: 0 },
    { name: 'Incline curl', scheme: '3 × 12', rest: '60s', load: '27.5 lb', sets: 3, done: 0 },
    { name: 'Farmer carry', scheme: '3 × 40m', rest: '60s', load: '80 lb', sets: 3, done: 0 },
  ];
  // Live payload → the same row shape the demo grid renders. `setRows` carries
  // the per-set figures ONLY when the coach payload drives (cp); on the public
  // payload it is null and every cell stays an honest '—'. Note `sets` is the
  // COUNT (pre-existing); `setRows` is the array — deliberately different keys.
  const shownMoves = liveMode
    ? (lp ? lp.exercises.map((e, i) => ({ name: e.n, scheme: `${e.done}/${e.total}`, rest: '—', load: '—', sets: e.total, setRows: (cp && Array.isArray(e.sets)) ? e.sets : null, done: e.done, active: i === lp.curIdx })) : [])
    : demoMoves;
  // Prefer the coach row's start when it drives — otherwise a coach-only stream
  // (private member: no public row at all) would have no clock to read.
  const shownStartedAt = liveMode
    ? ((cp && coachRow && coachRow.started_at) ? new Date(coachRow.started_at).getTime()
      : (liveRow && liveRow.started_at ? new Date(liveRow.started_at).getTime() : null))
    : startedAt;
  // ⚠ Crash guard (spec review, Codex P1): with shownMoves = [] every `cur.*`
  // read below would throw. `noDetail` short-circuits the header counter, the
  // exercise section and the set grid; `cur` is null-safe regardless.
  const noDetail = liveMode && !lp;
  // curIdx === -1 is a REAL state the validator preserves ("no current
  // exercise" — nothing started yet). Math.max(0, …) would fabricate exercise 1
  // and a NOW marker (review: CodeRabbit), so -1 is honoured and `cur` stays null.
  const curIdx = shownMoves.findIndex(m => m.active);
  const cur = curIdx >= 0 ? shownMoves[curIdx] : null;
  const totalSets = shownMoves.reduce((s, m) => s + m.sets, 0);
  const doneSets = shownMoves.reduce((s, m) => s + m.done, 0);
  const pct = totalSets ? doneSets / totalSets : 0;
  const elapsed = shownStartedAt != null ? Math.max(0, Math.floor((now - shownStartedAt) / 1000)) : null;
  const quickCues = [
    tr('coach:live.cueEccentric', { defaultValue: 'Slow the eccentric' }),
    tr('coach:live.cueHold', { defaultValue: 'Hold this weight' }),
    tr('coach:live.cueOneMore', { defaultValue: 'One more set' }),
    tr('coach:live.cueRest', { defaultValue: 'Lengthen your rest' }),
  ];
  const sendCue = (text) => { const m = String(text || cueDraft).trim(); if (!m) return; setSentCue(m); setCueDraft(''); };

  return (
    <BSPage>
      {/* Standing masthead row (the standard inset) — a DISPLAY page, so it
          carries the full trailing cluster (search + self avatar). The page's
          own ✕ Close / live-clock row moves directly beneath it. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow()}</div>
      <div style={{ padding: `12px ${t.padX}px 6px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK }}>{tr('coach:live.close', { defaultValue: '✕ Close' })}</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: teal, display: 'inline-block', boxShadow: '0 0 8px currentColor' }} /> {tr('coach:live.liveClock', { defaultValue: 'Live · {time}', time: elapsed != null ? fmt(elapsed) : '—:—' })}
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{noDetail ? '' : tr('coach:live.setsCount', { defaultValue: 'Sets {done}/{total}', done: doneSets, total: totalSets })}</span>
      </div>

      <div style={{ padding: `8px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, fontWeight: 800 }}>{tr('coach:live.watchingLive', { defaultValue: 'Watching live' })}</div>
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 29, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{client}</div>
        {noDetail ? (
          // Neutral by design (spec review): RLS makes 'private', 'not visible
          // to this viewer' and 'pre-migration' indistinguishable — naming any
          // one would fabricate a state we cannot know.
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
            {tr('coach:live.detailUnavailable', { defaultValue: "Live detail unavailable — set-by-set isn't shared here" })}
          </div>
        ) : (
          <React.Fragment>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{tr('coach:live.workoutProgress', { defaultValue: '{workout} · {pct}% · set {cur} of {total}', workout, pct: Math.round(pct * 100), cur: (cur ? cur.done : 0) + 1, total: cur ? cur.sets : 0 })}</div>
            <div style={{ marginTop: 12, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: teal, borderRadius: 999 }} />
            </div>
          </React.Fragment>
        )}
      </div>

      {cur && <div style={{ padding: `20px ${t.padX}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, fontWeight: 800 }}>{tr('coach:live.exerciseOf', { defaultValue: 'Exercise {cur} of {total}', cur: curIdx + 1, total: shownMoves.length })}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 700 }}>{cur.scheme}</span>
      </div>}
      {cur && <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{cur.name}<span style={{ color: teal }}>.</span></div>
        {cur.cue && <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, color: t.INK50 }}>“{cur.cue}”</div>}
      </div>}

      {cur && <div style={{ padding: `16px ${t.padX}px 0` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 30px', gap: 8, padding: '0 0 8px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
          <span>{tr('coach:live.colSet', { defaultValue: 'Set' })}</span><span>{tr('coach:live.colWeight', { defaultValue: 'Weight' })}</span><span>{tr('coach:live.colReps', { defaultValue: 'Reps' })}</span><span>{tr('coach:common.rpe', { defaultValue: 'RPE' })}</span><span />
        </div>
        {/* Read-only set ledger — this is a MIRROR of the client's live inputs, so no
            box-fields: bare tabular figures; the live set carries a teal underline. */}
        {Array.from({ length: cur.sets }).map((_, i) => {
          const done = i < cur.done;
          const active = i === cur.done;
          const cell = (val) => <div style={{ color: val === '—' ? t.INK50 : t.INK, padding: '10px 8px', fontFamily: t.MONO, fontSize: 12.5, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderBottom: `2px solid ${active ? teal : 'transparent'}`, opacity: done ? 0.6 : 1 }}>{val}</div>;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 30px', gap: 8, alignItems: 'center', padding: '3px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: (done || active) ? teal : t.INK50 }}>{done ? '✓' : String(i + 1).padStart(2, '0')}</span>
              {/* Real figures when the COACH payload drives; '—' per set when a
                  field wasn't entered, and '—' throughout on the public payload.
                  Honest-absent per cell — never a fabricated load. */}
              {cell(liveMode ? ((cur.setRows && cur.setRows[i] && cur.setRows[i].load) || '—') : String(cur.load || '').replace(/\s*lb/i, '') + ' lb')}
              {cell(liveMode ? ((cur.setRows && cur.setRows[i] && cur.setRows[i].reps) || '—') : (done ? '8' : '—'))}
              {cell(liveMode ? ((cur.setRows && cur.setRows[i] && cur.setRows[i].rpe) || '—') : (done ? '8.0' : '—'))}
              <span style={{ justifySelf: 'end', width: 24, height: 24, borderRadius: 999, border: `1.5px solid ${(done || active) ? teal : t.RULE}`, background: done ? teal : 'transparent', color: done ? '#04201d' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>✓</span>
            </div>
          );
        })}
      </div>}

      <div style={{ padding: `18px ${t.padX}px 0` }}>
        {/* Rust retired from chrome — station-head eyebrow (accent tick + ink), teal action. */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK }}><span aria-hidden style={{ width: 10, height: 2, background: teal, display: 'inline-block' }} /> {tr('coach:live.sendCue', { defaultValue: 'Send a cue' })}</div>
        {sentCue && <div style={{ marginTop: 8, borderLeft: `3px solid ${teal}`, padding: '2px 0 2px 11px', fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: t.INK70 }}>{tr('coach:live.sentTo', { defaultValue: 'Sent to {name}: “{cue}”', name: client, cue: sentCue })}</div>}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <input value={cueDraft} onChange={e => setCueDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendCue(); }} placeholder={tr('coach:live.cuePlaceholder', { defaultValue: 'Type a quick cue…' })} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '11px 14px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' }} />
          <button onClick={() => sendCue()} style={{ borderRadius: 6, clipPath: 'polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)', border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', padding: '0 18px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('coach:common.send', { defaultValue: 'Send' })}</button>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {quickCues.map(q => <button key={q} onClick={() => sendCue(q)} style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', padding: '8px 12px', minHeight: 32, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{q}</button>)}
        </div>
      </div>

      <div style={{ padding: `24px ${t.padX}px 4px` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK }}><span aria-hidden style={{ width: 10, height: 2, background: teal, display: 'inline-block' }} /> {tr('coach:common.upNext', { defaultValue: 'Up next' })}</div>
        <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>{tr('coach:live.queue', { defaultValue: 'Queue' })}<span style={{ color: teal }}>.</span></div>
      </div>
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {/* NOW spine on the current move — no fill/box (the client session queue grammar). */}
        {shownMoves.map((m, i) => {
          const mDone = m.done >= m.sets;
          const isCur = i === curIdx;
          return (
            <div key={i} style={{ borderLeft: `3px solid ${isCur ? teal : 'transparent'}`, display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'center', padding: '12px 0 12px 10px', borderBottom: `1px solid ${t.HAIR}`, opacity: mDone ? 0.5 : 1 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: mDone ? teal : (isCur ? teal : t.INK50) }}>{mDone ? '✓' : isCur ? tr('coach:common.now', { defaultValue: 'NOW' }) : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', textDecoration: mDone ? 'line-through' : 'none' }}>{m.name}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50, marginTop: 2 }}>{tr('coach:live.moveMeta', { defaultValue: '{scheme} · {rest} rest · {done}/{total} sets', scheme: m.scheme, rest: m.rest, done: m.done, total: m.sets })}</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{m.load}</span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: `16px ${t.padX}px 24px` }}>
        <button onClick={onBack} style={{ width: '100%', padding: '14px', borderRadius: 6, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{tr('coach:live.stopWatching', { defaultValue: 'Stop watching' })}</button>
      </div>
      <BSFooter right={tr('coach:common.live', { defaultValue: 'Live' })} />
    </BSPage>
  );
}

// Coach Grocery Lists — real, owner-scoped lists (coach_grocery_lists). A coach
// builds lists for THEMSELVES or for a client, then sends a client list to that
// client (real delivery via a chat message). Demo seeds when signed out.
const _BS_GRO_AISLES = [
  [/(chicken|beef|turkey|pork|salmon|tuna|fish|tofu|tempeh|egg|shrimp|steak|protein|lentil|bean|chickpea)/, 'Protein'],
  [/(milk|yogurt|cheese|butter|cream|feta|kefir|dairy)/, 'Dairy'],
  [/(spinach|kale|broccoli|pepper|onion|garlic|tomato|zucchini|carrot|cucumber|lettuce|avocado|berry|banana|apple|pineapple|lemon|lime|produce|greens|salad)/, 'Produce'],
  [/(rice|pasta|bread|bagel|oat|quinoa|tortilla|noodle|grain|cereal|flour)/, 'Grains'],
  [/(oil|salt|pepper|spice|sauce|stock|broth|honey|sugar|vinegar|pantry|canned|nut|seed|peanut|almond)/, 'Pantry'],
];
function bsGroAisle(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, a] of _BS_GRO_AISLES) if (re.test(n)) return a;
  return 'Other';
}
function BSProGroceryLists({ t, isNutri, onBack }) {
  const tr = useShapeTr();
  const DEMO = [
    { id: 'd0', name: 'My weekly prep', client_id: null, client_name: null, status: 'ready', items: [{ name: 'Chicken breast' }, { name: 'Jasmine rice' }, { name: 'Broccoli' }, { name: 'Greek yogurt' }, { name: 'Olive oil' }, { name: 'Eggs' }].map(x => ({ name: x.name, aisle: bsGroAisle(x.name) })) },
    { id: 'd1', name: 'Big-plate day list', client_id: null, client_name: 'Riley Kim', status: 'ready', items: ['Chicken breast', 'Jasmine rice', 'Pineapple', 'Chili base', 'Greek yogurt'].map(n => ({ name: n, aisle: bsGroAisle(n) })) },
    { id: 'd2', name: 'Low-FODMAP cut', client_id: null, client_name: 'Sara Mendez', status: 'review', items: ['Zucchini', 'Firm tofu', 'Rice noodles', 'Lactose-free milk'].map(n => ({ name: n, aisle: bsGroAisle(n) })) },
    { id: 'd3', name: 'Vegetarian prep', client_id: null, client_name: 'Ava Brooks', status: 'approval', items: ['Spinach', 'Tempeh', 'Lentils', 'Feta'].map(n => ({ name: n, aisle: bsGroAisle(n) })) },
  ];
  const [lists, setLists] = useStateBSP(null);
  const [tab, setTab] = useStateBSP('clients');
  const [creating, setCreating] = useStateBSP(false);
  const [draft, setDraft] = useStateBSP({ name: '', items: '', forClient: true, clientName: '' });
  const [busy, setBusy] = useStateBSP(false);
  const reload = React.useCallback(() => {
    if (!window.ShapeGroceryLists?.list) { setLists(DEMO); return; }
    window.ShapeGroceryLists.list().then(r => setLists(Array.isArray(r) && r.length ? r : DEMO)).catch(() => setLists(DEMO));
  }, []);
  React.useEffect(() => { reload(); }, [reload]);
  const all = lists || DEMO;
  const mine = all.filter(g => !g.client_name && !g.client_id);
  const clients = all.filter(g => g.client_name || g.client_id);
  const shown = tab === 'mine' ? mine : clients;
  // Role-true heat (trainer rust / nutritionist gold), line-only; teal = the one action.
  const heat = bsProHeat(t, isNutri ? 'nutritionist' : 'trainer');
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const STAT = { ready: [tr('coach:grocery.statusReady', { defaultValue: 'Ready to send' }), '#5fae7e'], review: [tr('coach:grocery.statusReview', { defaultValue: 'In review' }), t.AMBER || '#d8a23a'], approval: [tr('coach:grocery.statusApproval', { defaultValue: 'Awaiting approval' }), t.INK70], sent: [tr('coach:grocery.statusSent', { defaultValue: 'Sent' }), heat] };
  const aislesOf = (items) => { const m = {}; (items || []).forEach(it => { const a = it.aisle || bsGroAisle(it.name); m[a] = (m[a] || 0) + 1; }); return Object.keys(m).map(a => [a, m[a]]); };
  const create = async () => {
    const name = draft.name.trim();
    if (!name) { window.__bsToast?.(tr('coach:grocery.toastAddName', { defaultValue: 'Add a list name' }), 'err'); return; }
    const items = draft.items.split('\n').map(s => s.trim()).filter(Boolean).map(n => ({ name: n, aisle: bsGroAisle(n) }));
    const clientName = draft.forClient ? draft.clientName.trim() : '';
    setBusy(true);
    try {
      if (window.ShapeGroceryLists?.create) { await window.ShapeGroceryLists.create({ name, items, status: 'ready', clientName }); window.__bsToast?.(tr('coach:grocery.toastCreated', { defaultValue: 'List created' }), 'ok'); }
      else { setLists(l => [{ id: 'l' + Date.now(), name, items, status: 'ready', client_name: clientName || null, client_id: null }, ...(l || DEMO)]); }
      setCreating(false); setDraft({ name: '', items: '', forClient: true, clientName: '' });
      setTab(clientName ? 'clients' : 'mine');
      reload();
    } catch (e) { window.__bsToast?.(e.message || tr('coach:grocery.toastCouldNotSave', { defaultValue: 'Could not save' }), 'err'); }
    finally { setBusy(false); }
  };
  const send = async (g) => {
    if (!g.client_id) { window.__bsToast?.(tr('coach:grocery.toastDeliversLinked', { defaultValue: 'Delivers once this client is linked' }), 'info'); return; }
    try {
      // Deliver to the client's EAT page (grocery) — not chat. Nutritionists push
      // it into the client's grocery (review + sub-out there); the push fires the
      // tailored "loaded into grocery lists" notification. Trainers just notify.
      let pushed = false;
      if (isNutri && window.ShapeGroceryLists?.push) pushed = await window.ShapeGroceryLists.push({ clientId: g.client_id, name: g.name, items: g.items });
      if (!pushed) { try { await window.ShapeGroceryLists?.notify?.(g.client_id, g.name); } catch (e) {} }
      if (window.ShapeGroceryLists?.update && !String(g.id).startsWith('d')) await window.ShapeGroceryLists.update({ id: g.id, status: 'sent' });
      window.__bsToast?.(tr('coach:grocery.toastSentTo', { defaultValue: 'Sent to {name} · on their Eat page', name: String(g.client_name || tr('coach:grocery.clientWord', { defaultValue: 'client' })).split(' ')[0] }), 'ok');
      reload();
    } catch (e) { window.__bsToast?.(tr('coach:grocery.toastCouldNotSend', { defaultValue: 'Could not send' }), 'err'); }
  };
  const del = async (g) => {
    if (!(await window.bsAskConfirm({
      title: tr('coach:grocery.deleteTitle', { defaultValue: 'Delete this grocery list?' }),
      name: g.name,
      message: g.client_name ? tr('coach:grocery.deleteMsgClient', { defaultValue: 'This permanently removes the list for {name}.', name: String(g.client_name).split(' ')[0] }) : tr('coach:grocery.deleteMsg', { defaultValue: 'This permanently removes the list.' }),
      confirmLabel: tr('coach:grocery.deleteConfirm', { defaultValue: 'Delete list' }),
    }))) return;
    if (window.ShapeGroceryLists?.remove && !String(g.id).startsWith('d')) await window.ShapeGroceryLists.remove(g.id);
    setLists(l => (l || DEMO).filter(x => x.id !== g.id));
  };
  const heatInk = t.isLight ? '#fff' : '#04201d';       // text on the teal action CTA
  const uline = { width: '100%', boxSizing: 'border-box', padding: '7px 0 9px', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, outline: 'none', background: 'transparent', '--bs-uline-ink': `${t.INK}40`, '--bs-accent': heat };
  const tabItem = (k, label, count) => {
    const on = tab === k;
    return (
      <button key={k} onClick={() => setTab(k)} aria-pressed={on} style={{ background: 'transparent', border: 0, padding: '2px 0 8px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>{label}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: on ? heat : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        {on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: heat }} />}
      </button>
    );
  };
  const tealCta = { borderRadius: 5, clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)', border: 0, background: teal, color: heatInk, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' };
  const textAction = (color) => ({ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color, borderBottom: `2px solid ${color}66` });
  const rust = t.RUST || '#c0533b';
  return (
    <BSPage>
      <BSMasthead title={tr('coach:grocery.title', { defaultValue: 'Grocery Lists' })} leftKicker={isNutri ? tr('coach:grocery.kickerNutri', { defaultValue: 'Nutrition delivery' }) : tr('coach:grocery.kickerTrainer', { defaultValue: 'Meal support' })} rightKicker={tr('coach:grocery.listsCount', { defaultValue: '{count, plural, one {# list} other {# lists}}', count: all.length })} onBack={onBack} trailing={bsProCorner()}
      />

      {/* Verdict lead — the whole queue on one line, heat = role */}
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: heat, flexShrink: 0 }} />
          {tr('coach:grocery.leadEyebrow', { defaultValue: 'The lists · {mode}', mode: isNutri ? tr('coach:grocery.modeNutri', { defaultValue: 'nutrition delivery' }) : tr('coach:grocery.modeTrainer', { defaultValue: 'meal support' }) })}
        </div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.02 }}>
          {tr('coach:grocery.clientListsCount', { defaultValue: '{count, plural, one {# client list} other {# client lists}}', count: clients.length })}<span style={{ color: heat }}>.</span>
        </div>
        <div aria-hidden style={{ marginTop: 7, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${heat} 60%, transparent)` }} />
      </div>

      {/* Typographic index — Clients / Mine */}
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'flex', gap: 20, borderBottom: `1px solid ${t.HAIR}` }}>
        {tabItem('clients', tr('coach:grocery.tabClients', { defaultValue: 'Clients' }), clients.length)}
        {tabItem('mine', tr('coach:grocery.tabMine', { defaultValue: 'Mine' }), mine.length)}
      </div>

      {/* New list — dashed add box, or the quiet create form */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        {!creating ? (
          <button onClick={() => setCreating(true)} style={{ width: '100%', padding: '13px', borderRadius: 6, border: `1.5px dashed ${t.INK}40`, background: 'transparent', color: teal, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('coach:grocery.newList', { defaultValue: '＋ New grocery list' })}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder={tr('coach:grocery.listNamePlaceholder', { defaultValue: 'List name — e.g. Big-plate day' })} className="bs-uline" style={uline} />
            <textarea value={draft.items} onChange={e => setDraft(d => ({ ...d, items: e.target.value }))} rows={4} placeholder={tr('coach:grocery.itemsPlaceholder', { defaultValue: 'One item per line\nChicken breast\nJasmine rice\nBroccoli' })} className="bs-uline" style={{ ...uline, resize: 'vertical', fontSize: 14 }} />
            <div style={{ display: 'flex', gap: 20 }}>
              {[[tr('coach:grocery.forMine', { defaultValue: 'Mine' }), false], [tr('coach:grocery.forClient', { defaultValue: 'For a client' }), true]].map(([l, v]) => {
                const on = draft.forClient === v;
                return <button key={String(v)} onClick={() => setDraft(d => ({ ...d, forClient: v }))} aria-pressed={on} style={{ background: 'transparent', border: 0, padding: '2px 0 6px', cursor: 'pointer', position: 'relative', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>{l}{on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: heat }} />}</button>;
              })}
            </div>
            {draft.forClient && <input value={draft.clientName} onChange={e => setDraft(d => ({ ...d, clientName: e.target.value }))} placeholder={tr('coach:grocery.clientNamePlaceholder', { defaultValue: 'Client name' })} className="bs-uline" style={uline} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 2 }}>
              <button onClick={() => { setCreating(false); setDraft({ name: '', items: '', forClient: true, clientName: '' }); }} style={textAction(t.INK70)}>{tr('coach:common.cancel', { defaultValue: 'Cancel' })}</button>
              <button disabled={busy} onClick={create} style={{ ...tealCta, marginLeft: 'auto', padding: '11px 18px', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? tr('coach:common.saving', { defaultValue: 'Saving…' }) : tr('coach:grocery.createList', { defaultValue: 'Create list' })}</button>
            </div>
          </div>
        )}
      </div>

      {/* The lists — zero-box, heat-spine blocks */}
      <div style={{ padding: `16px ${t.padX}px 22px`, display: 'flex', flexDirection: 'column' }}>
        {shown.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
            <span aria-hidden style={{ flex: 1, borderBottom: `1px dashed ${t.INK}40` }} />
            {tab === 'mine' ? tr('coach:grocery.emptyMine', { defaultValue: 'No personal lists yet' }) : tr('coach:grocery.emptyClients', { defaultValue: 'No client lists yet' })}
            <span aria-hidden style={{ flex: 1, borderBottom: `1px dashed ${t.INK}40` }} />
          </div>
        )}
        {shown.map((g, i) => {
          const [sl, sc] = STAT[g.status] || STAT.ready;
          const first = String(g.client_name || '').split(' ')[0];
          const ais = aislesOf(g.items);
          const preview = (g.items || []).slice(0, 4).map(it => it.name);
          const more = (g.items || []).length - preview.length;
          return (
            <div key={g.id || i} style={{ position: 'relative', borderTop: i ? `1px solid ${t.HAIR}` : 0, paddingTop: i ? 16 : 0, paddingBottom: 16, paddingLeft: 13 }}>
              <span aria-hidden style={{ position: 'absolute', left: 0, top: i ? 16 : 0, bottom: 16, width: 3, background: heat }} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: heat, fontWeight: 900 }}>{g.client_name || tr('coach:grocery.personal', { defaultValue: 'Personal' })}</div>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: sc }}>{sl}</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{g.name}</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:grocery.itemsCount', { defaultValue: '{count, plural, one {# item} other {# items}}', count: (g.items || []).length })} · {tr('coach:grocery.aislesCount', { defaultValue: '{count, plural, one {# aisle} other {# aisles}}', count: ais.length })}</div>
              {ais.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {ais.map(([a, n]) => (
                    <div key={a} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK70 }}>{a}</span>
                      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}40`, transform: 'translateY(-3px)' }} />
                      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                    </div>
                  ))}
                </div>
              )}
              {preview.length > 0 && <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, lineHeight: 1.4 }}>{preview.join(' · ')}{more > 0 ? tr('coach:grocery.andMore', { defaultValue: ' +{count} more', count: more }) : ''}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 13 }}>
                {g.client_name
                  ? <button type="button" onClick={() => send(g)} style={{ ...tealCta, padding: '10px 16px' }}>{tr('coach:grocery.sendToClient', { defaultValue: 'Send to {name} →', name: first || tr('coach:grocery.clientWord', { defaultValue: 'client' }) })}</button>
                  : <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:grocery.yourList', { defaultValue: 'Your list' })}</span>}
                <button type="button" onClick={() => del(g)} aria-label={tr('coach:grocery.deleteConfirm', { defaultValue: 'Delete list' })} style={{ ...textAction(rust), marginLeft: 'auto' }}>{tr('coach:common.delete', { defaultValue: 'Delete' })}</button>
              </div>
            </div>
          );
        })}
      </div>
      <BSFooter left={isNutri ? tr('coach:grocery.footerNutri', { defaultValue: 'Nutrition Queue' }) : tr('coach:grocery.footerTrainer', { defaultValue: 'Coach Queue' })} right={tr('coach:grocery.footerRight', { defaultValue: 'Grocery delivery' })} />
    </BSPage>
  );
}

function BSProWidgetQueuePage({ role = 'trainer', type = 'pr', onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.GREEN;
  const configs = {
    pr: {
      title: tr('coach:prq.title', { defaultValue: 'PR Alerts' }),
      kicker: tr('coach:prq.kicker', { defaultValue: 'Client milestones' }),
      meta: tr('coach:prq.meta', { defaultValue: '7 alerts' }),
      rows: [
        ['Casey Lee', 'Deadlift +15 lb', 'Verified from workout log - comment queued'],
        ['Alex Rivera', 'Bench press 185 x 6', 'First time hitting target reps this block'],
        ['Quinn Choi', '10k pace down 18 sec/mi', 'Strava import matched the training plan'],
        ['Riley Kim', 'Rest compliance 92%', 'Watch-assisted logging showed cleaner rest windows'],
      ],
    },
    grocery: {
      title: 'Grocery Lists',
      kicker: 'Nutrition delivery',
      meta: '14 generated',
      lists: [
        { client: 'Riley Kim', name: 'Big-plate day list', status: 'ready', items: 24, aisles: [['Produce', 7], ['Protein', 5], ['Pantry', 8], ['Dairy', 4]], preview: ['Chicken breast', 'Jasmine rice', 'Pineapple', 'Chili base'] },
        { client: 'Sara Mendez', name: 'Low-FODMAP cut', status: 'ready', items: 19, aisles: [['Produce', 6], ['Protein', 4], ['Pantry', 6], ['Other', 3]], preview: ['Zucchini', 'Firm tofu', 'Rice noodles', 'Lactose-free milk'] },
        { client: 'Morgan Liu', name: 'Carb-load template', status: 'review', items: 22, aisles: [['Grains', 9], ['Produce', 4], ['Protein', 5], ['Pantry', 4]], preview: ['Sweet potato', 'Pasta', 'Bagels', 'Banana'] },
        { client: 'Ava Brooks', name: 'Vegetarian prep', status: 'approval', items: 27, aisles: [['Produce', 10], ['Protein', 6], ['Pantry', 7], ['Dairy', 4]], preview: ['Spinach', 'Tempeh', 'Lentils', 'Feta'] },
      ],
    },
  };
  const cfg = configs[type] || configs.pr;
  // Grocery Lists → dedicated, real (owner-scoped) lists the coach builds for
  // themselves or a client, then sends to that client. Role-accented.
  if (type === 'grocery') return <BSProGroceryLists t={t} accent={accent} isNutri={isNutri} onBack={onBack} />;
  return (
    <BSPage>
      <BSMasthead
        title={cfg.title}
        leftKicker={cfg.kicker}
        rightKicker={cfg.meta}
        onBack={onBack}
      trailing={bsProCorner()}
    />
      <BSSection title={cfg.title} meta={tr('coach:prq.actionQueue', { defaultValue: 'Action queue' })} />
      <div style={{ padding: `0 ${t.padX}px 18px`, display: 'grid', gap: 10 }}>
        {cfg.rows.map(([name, title, detail], i) => (
          <button key={`${name}-${title}`} type="button" style={{
            width: '100%',
            border: `1px solid ${t.RULE}`,
            borderRadius: 16,
            background: t.SURFACE || t.PAPER2,
            padding: 13,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 10,
            textAlign: 'left',
            color: t.INK,
            cursor: 'pointer',
            boxShadow: t.ELEVATION_SOFT || '0 8px 18px rgba(10,13,12,0.035)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent, fontWeight: 900 }}>
                {String(i + 1).padStart(2, '0')} - {name}
              </div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 750, letterSpacing: '-0.03em', color: t.INK }}>
                {title}
              </div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.35, color: t.INK70 }}>
                {detail}
              </div>
            </div>
            <span style={{
              alignSelf: 'start',
              borderRadius: 999,
              border: `1px solid ${t.RULE}`,
              padding: '6px 8px',
              fontFamily: t.MONO,
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: t.INK70,
              background: t.PAPER,
            }}>{tr('coach:common.open', { defaultValue: 'Open' })}</span>
          </button>
        ))}
      </div>
      <BSFooter left={isNutri ? tr('coach:grocery.footerNutri', { defaultValue: 'Nutrition Queue' }) : tr('coach:grocery.footerTrainer', { defaultValue: 'Coach Queue' })} right={tr('coach:prq.footerRight', { defaultValue: 'Live widgets' })} />
    </BSPage>
  );
}

// ── Real-week helpers for the pro Today screens ──────────────────────────────
const _BS_DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _BS_DOW_L = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const _BS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function bsProWeek(now = new Date()) {
  const todayIdx = (now.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - todayIdx);
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  return { todayIdx, dates };
}

// `dots` is an array indexed by weekday (0=Mon..6=Sun).
function BSProWeekStrip({ goCalendar, dots, heat, label, selDay: selDayProp, onSelectDay }) {
  const t = useBS();
  const tr = useShapeTr();
  const labelText = label || tr('coach:rail.thisWeek', { defaultValue: 'This week' });
  const { todayIdx, dates } = bsProWeek();
  const [internalSel, setInternalSel] = useStateBSP(dates[todayIdx].getDate());
  const selDay = selDayProp != null ? selDayProp : internalSel;
  const setSelDay = onSelectDay || setInternalSel;
  const days = dates.map((d, i) => ({ d: d.getDate(), l: _BS_DOW_L[i], isToday: i === todayIdx, idx: i }));
  const selDate = dates.find(d => d.getDate() === selDay) || dates[todayIdx];
  const range = dates[0].getMonth() === dates[6].getMonth()
    ? `${_BS_MON[dates[0].getMonth()]} ${dates[0].getDate()}–${dates[6].getDate()}`
    : `${_BS_MON[dates[0].getMonth()]} ${dates[0].getDate()} – ${_BS_MON[dates[6].getMonth()]} ${dates[6].getDate()}`;
  const heatC = heat || t.ACCENT;
  return (
    <>
      <BSSection
        title={labelText}
        kicker={`${range} · ${_BS_MON[selDate.getMonth()]} ${selDate.getDate()}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', fontWeight: 800, color: t.INK, marginLeft: 'auto' }}>{tr('coach:rail.monthView', { defaultValue: 'Month view →' })}</span>}
      />
      <div style={{ padding: `0 ${t.padX}px 14px` }}>
        {/* Day boxes — mono day letters, ink-alpha ticks (not colored dots); the
            selected day carries a drawn heat underline instead of an ink fill. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderTop: `1px solid ${t.RULE}`, paddingTop: 8 }}>
          {days.map((day) => {
            const on    = day.d === selDay;
            const today = day.isToday;
            const dd    = (dots && dots[day.idx]) || [];
            const nTicks = Math.min(3, dd.length);
            return (
              <button key={day.d} onClick={() => setSelDay(day.d)} style={{
                position: 'relative',
                border: 0,
                background: today && !on ? t.PAPER2 : 'transparent',
                color: on ? t.INK : t.INK70,
                padding: '5px 0 6px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', opacity: today || on ? 1 : 0.6 }}>{day.l}</span>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{day.d}</span>
                <span style={{ display: 'flex', gap: 2.5, height: 3, marginTop: 1 }}>
                  {Array.from({ length: nTicks }).map((_, k) => <span key={k} style={{ width: 3, height: 3, borderRadius: 1, background: `${t.INK}59` }} />)}
                </span>
                {on && <span aria-hidden style={{ position: 'absolute', left: '22%', right: '22%', bottom: 0, height: 2, background: heatC }} />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TRAINER
// ═══════════════════════════════════════════════════════════
// ── First-run coach app tour ────────────────────────────────────────────────
// Coach-side counterpart of the client BSOnboardingTour: a skippable guided
// walkthrough of the coaching tools. Auto-shows ONCE per coach on their first
// signed-in visit to a coach shell (persisted to localStorage
// 'shape.coachTourSeen' + cloud user_goals 'coach_onboarding'); replayable
// anytime via the `shape:startTour` event.
function bsMarkCoachTourSeen() {
  try { localStorage.setItem('shape.coachTourSeen', '1'); } catch (e) {}
  try { window.shapeDb?.saveUserGoals?.('coach_onboarding', { tourSeen: true, at: new Date().toISOString() }); } catch (e) {}
}
// Auto-show decision shared by both coach shells: signed-in coach + not seen.
// Deliberately NOT gated on account age (2026-07-16): a coach APPLIES on day 0
// and is approved days later, so by their first real coach-shell login the old
// created_at<24h window had usually passed and the tour never auto-showed.
// Being in a coach shell already proves the role; the seen flags carry the
// once-only guarantee.
function bsCoachTourAutoShow(setShow) {
  let alive = true;
  let done = false;
  try { done = localStorage.getItem('shape.coachTourSeen') === '1'; } catch (e) {}
  if (done) return () => {};
  const decide = () => {
    if (!alive || done) return;
    const u = window.ShapeAuth?.getCachedState?.().user;
    if (!u) return;
    done = true;
    if (window.shapeDb?.getUserGoals) {
      window.shapeDb.getUserGoals('coach_onboarding')
        .then(d => { if (!alive) return; if (d && d.tourSeen) { try { localStorage.setItem('shape.coachTourSeen', '1'); } catch (e) {} } else setShow(true); })
        .catch(() => { if (alive) setShow(true); });
    } else { setShow(true); }
  };
  decide();
  const tid = setTimeout(decide, 1200);
  return () => { alive = false; clearTimeout(tid); };
}

function BSProOnboardingTour({ onClose, onNavigate, role = 'trainer', plansKey = 'plans' }) {
  const t = useBS();
  const tr = useShapeTr();
  useEffectBSP(() => {
    const root = document.getElementById('bs-phone-surface') || document.body;
    const q = (k) => () => root.querySelector('[data-tour="' + k + '"]');
    const go = (tab) => () => onNavigate && onNavigate(tab);
    const plansLabel = plansKey === 'programs' ? tr('coach:tour.programs', { defaultValue: 'Programs' }) : tr('coach:tour.plans', { defaultValue: 'Plans' });
    const steps = [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('tab-today'), eyebrow: tr('coach:tour.welcomeEyebrow', { defaultValue: 'Welcome' }), title: tr('coach:tour.welcomeTitle', { defaultValue: 'Your coaching tools.' }), body: tr('coach:tour.welcomeBody', { defaultValue: 'A quick tour of your dashboard — about 30 seconds.' }) },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('tab-today'), eyebrow: tr('coach:tour.todayEyebrow', { defaultValue: 'Today' }), title: tr('coach:tour.todayTitle', { defaultValue: 'Who needs you.' }), body: tr('coach:tour.todayBody', { defaultValue: 'Your day leads with the clients who need attention first.' }) },
      { navigate: go('clients'), anchor: q('hero-clients'), fallback: q('tab-clients'), eyebrow: tr('coach:tour.clientsEyebrow', { defaultValue: 'Clients' }), title: tr('coach:tour.clientsTitle', { defaultValue: 'Your roster.' }), body: tr('coach:tour.clientsBody', { defaultValue: "Every client, sorted by who's on track and who's slipping." }) },
      { navigate: go(plansKey), anchor: q('hero-plans'), fallback: q('tab-' + plansKey), eyebrow: plansLabel, title: tr('coach:tour.plansTitle', { defaultValue: 'Build & sell.' }), body: tr('coach:tour.plansBody', { defaultValue: 'Create {kind}, assign them to clients, and sell them in the marketplace.', kind: plansLabel.toLowerCase() }) },
      { navigate: go('chat'), anchor: q('tab-chat'), fallback: q('tab-chat'), eyebrow: tr('coach:tour.chatEyebrow', { defaultValue: 'Chat' }), title: tr('coach:tour.chatTitle', { defaultValue: 'Stay in touch.' }), body: tr('coach:tour.chatBody', { defaultValue: 'Message clients and co-coaches; see the community.' }) },
      { navigate: go('me'), anchor: q('hero-me'), fallback: q('tab-me'), eyebrow: tr('coach:tour.meEyebrow', { defaultValue: 'You' }), title: tr('coach:tour.meTitle', { defaultValue: 'Your standing.' }), body: tr('coach:tour.meBody', { defaultValue: 'Your coach profile, payouts and Shape Score.' }) },
    ];
    const tour = startTour(steps, { root, accent: bsProAccent(t, role), isLight: t.isLight, onDone: () => { bsMarkCoachTourSeen(); onClose && onClose(); } });
    return () => tour.destroy();
  }, [role, plansKey]);
  return null;
}

function BSTrainerApp({ onLogout, tweaks, setTweak }) {
  // BSNavGestures mounts in the wrapper (never early-returns) so edge-swipe
  // back stays alive while a takeover has replaced the Inner's main render.
  return <BSSheetProvider>{typeof window !== 'undefined' && window.BSNavGestures ? React.createElement(window.BSNavGestures) : null}<BSTrainerAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} /></BSSheetProvider>;
}
function BSTrainerAppInner({ onLogout, tweaks, setTweak }) {
  const t = useBS();
  const tr = useShapeTr();
  const sheet = useBSSheet();
  const [, _bumpIdentity] = useStateBSP(0);
  React.useEffect(() => {
    _bsHydrateProScore();
    // Load the coach's identity (photo / initials / avatarMode) — the coach app
    // never did this, so coach avatars never received their photo. Re-render when it lands.
    try { window.bsHydrateIdentity && window.bsHydrateIdentity(); } catch (e) {}
    const bump = () => _bumpIdentity((v) => v + 1);
    window.addEventListener('shape:identity', bump);
    return () => window.removeEventListener('shape:identity', bump);
  }, []);
  const [tab, setTab] = useStateBSP('today');
  const [showTour, setShowTour] = useStateBSP(false);
  // Universal search — the ⌕ in the header opens it (shared client component).
  const [showSearch, setShowSearch] = useStateBSP(false);
  useEffectBSP(() => {
    const open = () => { navJumpRef.current.navPush(); setShowSearch(true); };
    window.addEventListener('shape:openSearch', open);
    return () => window.removeEventListener('shape:openSearch', open);
  }, []);
  // Inline ✉ on a search row → the real 1:1 thread; a channel result → that
  // channel's thread; Nora → the Support tab. All land in the Chat tab.
  useEffectBSP(() => {
    const open = (e) => {
      const d = (e && e.detail) || {};
      if (!d.conversationId && !d.channel && !d.support) return;
      navJumpRef.current.navPush();
      setShowSearch(false);
      setChatRequest({ conversationId: d.conversationId || null, channel: d.channel || null, support: !!d.support, coach: d.name || null, nonce: Date.now() });
      setTab('chat');
    };
    window.addEventListener('shape:openConversation', open);
    return () => window.removeEventListener('shape:openConversation', open);
  }, []);
  useEffectBSP(() => bsCoachTourAutoShow(setShowTour), []);
  useEffectBSP(() => {
    const start = () => { setShowSettings(false); setShowCalendar(false); setShowTour(true); };
    window.addEventListener('shape:startTour', start);
    return () => window.removeEventListener('shape:startTour', start);
  }, []);
  // About-page CTA — "Join the community." closes the settings takeover and
  // lands on the chat tab's community feed. About rides the SHARED BSSettings,
  // which the coach apps embed too (#1795 Codex catch: without this listener the
  // coach-side button was a dead tap); the client shell has the same listener.
  useEffectBSP(() => {
    // Clear EVERY takeover that early-returns above the tab body (Settings can
    // be opened from the Calendar takeover via onProfile, so closing settings
    // alone would land back on the calendar — Codex catch), plus any stale chat
    // deep-link, so the chat tab always lands on the community FEED.
    const open = () => {
      navJumpRef.current.navPush();
      setShowSoundtracks(false); setShowSettings(false); setSettingsStart('');
      setShowCalendar(false); setShowReviews(false); setShowHabits(false);
      setQueueView(null); setLiveWatch(null); setShowSearch(false);
      setChatRequest(null); setTab('chat');
    };
    window.addEventListener('shape:goCommunity', open);
    return () => window.removeEventListener('shape:goCommunity', open);
  }, []);
  const [showSettings, setShowSettings] = useStateBSP(false);
  const [showSoundtracks, setShowSoundtracks] = useStateBSP(false);
  const [showCalendar, setShowCalendar] = useStateBSP(false);
  const [showReviews, setShowReviews] = useStateBSP(false);
  const [showHabits, setShowHabits] = useStateBSP(false);
  const [storeView, setStoreView] = useStateBSP('store');
  const [programInitialTab, setProgramInitialTab] = useStateBSP('programs');
  const [queueView, setQueueView] = useStateBSP(null);
  const [liveWatch, setLiveWatch] = useStateBSP(null);
  const [settingsStart, setSettingsStart] = useStateBSP(''); // replayed Settings sub-page (announce register)
  const scoreProfile = SHAPE_SCORE_PROFILES?.trainer;
  // ── Nav history (spec 2026-07-09; PR A shipped the client spine) ──
  // Takeovers are early-returns below, so they ARE the location when open.
  const navLoc = () => {
    if (showSoundtracks) return { tab, overlay: 'soundtracks' };
    if (showSettings) return { tab, overlay: 'settings', sub: settingsStart || '' };
    if (showCalendar) return { tab, overlay: 'calendar' };
    if (showReviews) return { tab, overlay: 'reviews' };
    if (showHabits) return { tab, overlay: 'habits' };
    if (queueView) return { tab, overlay: 'queue', detail: { type: queueView } };
    if (showSearch) return { tab, overlay: 'search' };
    if (tab === 'store') return { tab: 'store', sub: storeView };
    if (tab === 'programs') return { tab: 'programs', sub: programInitialTab };
    return { tab };
  };
  // Replay a popped descriptor onto the existing entry points. NEVER pushes.
  // liveWatch is deliberately NOT replayable (a live session is ephemeral —
  // re-opening a stale watch would fabricate a session that may have ended).
  const navResolve = (loc) => {
    if (!loc) return;
    setShowSoundtracks(loc.overlay === 'soundtracks');
    setShowCalendar(loc.overlay === 'calendar');
    setShowReviews(loc.overlay === 'reviews');
    setShowHabits(loc.overlay === 'habits');
    setShowSearch(loc.overlay === 'search');
    setQueueView(loc.overlay === 'queue' && loc.detail ? loc.detail.type : null);
    setLiveWatch(null);
    if (loc.overlay === 'settings') { setSettingsStart(loc.sub || ''); setShowSettings(true); }
    else { setShowSettings(false); setSettingsStart(''); }
    if (loc.tab === 'store') setStoreView(loc.sub === 'score' ? 'score' : 'store');
    if (loc.tab === 'programs') setProgramInitialTab(loc.sub || 'programs');
    if (loc.tab === 'chat' && loc.detail) setChatRequest({ ...loc.detail, nonce: Date.now() });
    if (loc.tab) setTab(loc.tab);
  };
  const { navPush, navBack } = useBSNavHistory({ navLoc, navResolve });
  const navJumpRef = React.useRef({});
  const goRadio = () => { navPush(); setTab('radio'); };
  const goSettings = () => { navPush(); setShowSettings(true); };
  const openHomeWidget = (action) => {
    // Push ONLY for actions that actually navigate — an unknown action must not
    // leave a phantom entry the user's next back would spend itself on.
    if (!['reviews', 'clients', 'programs', 'playlists', 'grocery', 'pr'].includes(action)) return;
    navPush();
    if (action === 'reviews') { setShowReviews(true); return; }
    if (action === 'clients') { setTab('clients'); return; }
    if (action === 'programs' || action === 'playlists') {
      setProgramInitialTab(action === 'playlists' ? 'playlists' : 'programs');
      setTab('programs');
      return;
    }
    if (action === 'grocery') { setQueueView('grocery'); return; }
    if (action === 'pr') setQueueView('pr');
  };
  // MESSAGE button on a client profile → ensure the 1:1 conversation exists and
  // jump to the Chat tab, opening that exact thread.
  const [chatRequest, setChatRequest] = useStateBSP(null);
  // Swipe judgment (PR C) — mirrors the client shell: 'back' = the stack, else
  // close the top takeover; tab swipes step the ROOT order only, never while a
  // takeover is open. liveWatch closes on back but is never replayed (ephemeral).
  const [navSlideCls, navSlide] = useBSNavSlide(tab);
  const onNavGesture = (intent) => {
    if (intent === 'back') {
      if (navBack()) return;
      if (showSearch) { setShowSearch(false); return; }
      if (liveWatch) { setLiveWatch(null); return; }
      if (queueView) { setQueueView(null); return; }
      if (showSoundtracks) { setShowSoundtracks(false); return; }
      if (showSettings) { setShowSettings(false); setSettingsStart(''); return; }
      if (showCalendar) { setShowCalendar(false); return; }
      if (showReviews) { setShowReviews(false); return; }
      if (showHabits) setShowHabits(false);
      return;
    }
    if (showSearch || liveWatch || queueView || showSoundtracks || showSettings || showCalendar || showReviews || showHabits) return;
    const next = bsNavStepTab(['today', 'clients', 'programs', 'chat', 'me'], tab, intent);
    if (!next) return;
    navSlide(intent === 'next-tab' ? 'l' : 'r');
    setTab(next);
  };
  navJumpRef.current = { navPush, goSettings, openHomeWidget, onNavGesture };
  useBSNavGestureHandler(navJumpRef);
  React.useEffect(() => {
    const onMsg = async (e) => {
      navJumpRef.current.navPush();
      const c = e?.detail?.client;
      const uid = c && (c.userId || c.user_id || (typeof c.id === 'string' && c.id.includes('-') ? c.id : null));
      const name = (c && c.n) || 'Client';
      let cid = null;
      if (uid && window.ShapeMessages?.getOrCreateMemberConversation) {
        try { const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: uid }); cid = (conv && conv.data) || null; } catch (err) {}
      }
      setChatRequest({ coach: name, role: 'Client', conversationId: cid, nonce: Date.now() });
      setTab('chat');
    };
    window.addEventListener('shape:proMessageClient', onMsg);
    return () => window.removeEventListener('shape:proMessageClient', onMsg);
  }, []);
  // Care team — open (or reuse) the private coach↔coach thread about a shared
  // client, then jump to Chat on that thread.
  React.useEffect(() => {
    const onCoach = async (e) => {
      navJumpRef.current.navPush();
      const d = e?.detail || {};
      let cid = null;
      if (d.clientId && d.counterpartUserId && window.ShapeCareTeam?.openThread) {
        try { cid = await window.ShapeCareTeam.openThread(d.clientId, d.counterpartUserId); } catch (err) {}
      }
      setChatRequest({ coach: d.name || 'Coach', role: d.role || 'Care team', conversationId: cid, nonce: Date.now() });
      setTab('chat');
    };
    window.addEventListener('shape:proMessageCoach', onCoach);
    return () => window.removeEventListener('shape:proMessageCoach', onCoach);
  }, []);
  React.useEffect(() => {
    const onSettingsEvt = () => navJumpRef.current.goSettings();
    const onAvail = () => { navJumpRef.current.navPush(); setShowSettings(false); setShowCalendar(true); };
    const onSound = () => { navJumpRef.current.navPush(); setShowSettings(false); setShowSoundtracks(true); };
    // shape:openProfile is what every self-avatar tap fires (same as the client) —
    // open Settings in one tap, so the coach flow matches the client/preview flow.
    window.addEventListener('shape:openProSettings', onSettingsEvt);
    window.addEventListener('shape:openProfile', onSettingsEvt);
    window.addEventListener('shape:proAvailability', onAvail);
    window.addEventListener('shape:proSoundtracks', onSound);
    return () => { window.removeEventListener('shape:openProSettings', onSettingsEvt); window.removeEventListener('shape:openProfile', onSettingsEvt); window.removeEventListener('shape:proAvailability', onAvail); window.removeEventListener('shape:proSoundtracks', onSound); };
  }, []);
  if (showSoundtracks) return <BSProSoundtracks role="trainer" onBack={() => { if (!navBack()) setShowSoundtracks(false); }} />;
  if (showSettings) return <BSSettings initialPage={settingsStart} onBack={() => { if (!navBack()) { setShowSettings(false); setSettingsStart(''); } }} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="trainer" onProfile={goSettings} onBack={() => { if (!navBack()) setShowCalendar(false); }} />;
  if (showReviews) return <BSWorkoutReviewPage role="trainer" onBack={() => { if (!navBack()) setShowReviews(false); }} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => { if (!navBack()) setShowHabits(false); }} onOpenScore={() => { navPush(); setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="trainer" type={queueView} onBack={() => { if (!navBack()) setQueueView(null); }} />;
  if (liveWatch) return <BSProLiveWatch client={liveWatch.client} clientId={liveWatch.clientId} workout={liveWatch.workout} onBack={() => setLiveWatch(null)} />;
  const screens = {
    today:    <BSTrainerToday onProfile={goSettings} sheet={sheet} goCalendar={() => { navPush(); setShowCalendar(true); }} goRadio={goRadio} onOpenReviews={() => { navPush(); setShowReviews(true); }} onWidgetOpen={openHomeWidget} onOpenHabits={() => { navPush(); setShowHabits(true); }} onOpenScore={() => { navPush(); setStoreView('score'); setTab('store'); }} onWatchLive={(c) => setLiveWatch(c)} tweaks={tweaks} setTweak={setTweak} />,
    clients:  <BSTrainerClients sheet={sheet} />,
    programs: <BSTrainerPrograms sheet={sheet} initialTab={programInitialTab} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="trainer" openRequest={chatRequest} />,
    radio:    <BSRadioScreen onBack={() => { if (!navBack()) setTab('today'); }} />,
    store:    storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => { if (!navBack()) setTab('today'); }} onOpenScore={() => setStoreView('score')} />,
    me:       <BSPublicProfile person={{ who: 'Jordan Chen', kind: 'TRAINER', init: bsMyInitials(), userId: (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || undefined }} isSelf meMode onOpenSettings={goSettings} onOpenScore={() => { navPush(); setStoreView('score'); setTab('store'); }} onBack={() => setTab('today')} />,
  };
  // navSlideCls (from useBSNavSlide): one-shot on a tab SWIPE, cleared in an
  // effect after commit; a tab TAP renders instantly; reduced-motion in CSS.
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div key={tab} className={navSlideCls} style={{ position: 'absolute', inset: 0 }}>
        {screens[tab]}
      </div>
      {/* Feed composer portals into this slot (see BSClientFeed). */}
      <div id="bs-composer-slot" style={{ position: 'absolute', left: 0, right: 0, bottom: (window.BS_TABBAR_H || 64), zIndex: 60, pointerEvents: 'none' }} />
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: tr('coach:nav.today', { defaultValue: 'Today' }) },
        { key: 'clients',  label: tr('coach:nav.clients', { defaultValue: 'Clients' }) },
        { key: 'programs', label: tr('coach:nav.plans', { defaultValue: 'Plans' }) },
        { key: 'chat',     label: tr('coach:nav.chat', { defaultValue: 'Chat' }) },
        { key: 'me',       label: tr('coach:nav.me', { defaultValue: 'Me' }) },
      ]} />
      <BSRadioPrompt />
      {showSearch && typeof window !== 'undefined' && window.BSUniversalSearch ? React.createElement(window.BSUniversalSearch, { onClose: () => { if (!navBack()) setShowSearch(false); } }) : null}
      {showTour && <BSProOnboardingTour role="trainer" plansKey="programs" onNavigate={setTab} onClose={() => setShowTour(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BSProToday — the Assignment Rail (both editions, one component)
// §A.1–A.9 of docs/superpowers/specs/2026-07-04-coach-ledger-redesign-design.md:
// masthead → dateline → bulletins (live/review) → THE LEAD (verdict) → week
// strip → THE RAIL (booking ledger + NOW tick + gaps) → THE WIRE (attention
// budget) → INSIDE. (doors) → radio + footer. ONE breathing tick per page
// (the LIVE bulletin dot, else the NOW tick); attention budget caps the WIRE
// at 3 rows (bsProAttentionBudget); the LEAD block keeps `data-tour="hero-today"`
// (the coach onboarding tour anchors to it).
// ═══════════════════════════════════════════════════════════
function BSProToday({ role = 'trainer', onProfile, sheet, goCalendar, goRadio, onOpenReviews, onWidgetOpen = () => {}, onOpenHabits = () => {}, onOpenScore = () => {}, onWatchLive = () => {}, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const tr = useShapeTr();
  const isNutri = role === 'nutritionist';
  const heat = bsProHeat(t, role);
  const [selDay, setSelDay] = useStateBSP(bsProWeek().dates[(new Date().getDay() + 6) % 7].getDate());
  // Live-bulletin boost sheet (nutritionist OPEN → — a cheer that lands mid-cook).
  const [boostFor, setBoostFor] = useStateBSP(null);

  // Window-kit consumption (Task 1's Open Ledger kit, exposed on window by the
  // client bundle). Null-guarded — the client bundle may not have loaded yet.
  const StationHead = typeof window !== 'undefined' ? window.BSTStationHead : null;
  const Redact = typeof window !== 'undefined' ? window.BSTRedact : null;
  const LedgerStat = typeof window !== 'undefined' ? window.BSTLedgerStat : null;
  const useSdInView = typeof window !== 'undefined' ? window.useBSSdInView : null;
  const sdReduced = typeof window !== 'undefined' && window.bsSdReduced ? window.bsSdReduced() : false;
  React.useInsertionEffect(() => { try { window.bsInjectSessionDetailCss && window.bsInjectSessionDetailCss(); } catch (e) {} }, []);

  // Real schedule — the coach's own calendar events for the visible week
  // (ShapeCalendar). Keyed by YYYY-MM-DD; used when signed in + has events, else demo.
  const _pad2 = (n) => String(n).padStart(2, '0');
  const _ds = (d) => `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
  const [realByDate, setRealByDate] = useStateBSP(null);
  React.useEffect(() => {
    if (!window.ShapeCalendar?.list) return undefined;
    let on = true;
    const wk = bsProWeek().dates;
    const tagFor = (kind) => {
      const k = String(kind || '').toUpperCase();
      if (isNutri) {
        if (k === 'CHECKIN' || k === 'CHK') return ['CHK', t.GREEN];
        if (k === 'REVIEW') return ['F/U', t.BLUE];
        if (k === 'PLAN' || k === 'PROGRAM' || k === 'PRGM') return ['PLAN', t.AMBER];
        if (k === 'ADMIN' || k === 'ADM') return ['ADM', t.INK50];
        return ['CONS', t.RUST];
      }
      if (k === 'CONSULT' || k === 'CON') return ['CONS', t.RUST];
      if (k === 'CHECKIN' || k === 'CHK') return ['CHK', t.GREEN];
      if (k === 'REVIEW') return ['ASYN', t.BLUE];
      if (k === 'PLAN' || k === 'PROGRAM' || k === 'PRGM') return ['PRGM', t.AMBER];
      if (k === 'ADMIN' || k === 'ADM') return ['ADM', t.INK50];
      return ['LIVE', t.RUST];
    };
    window.ShapeCalendar.list({ from: _ds(wk[0]), to: _ds(wk[6]) }).then((r) => {
      if (!on) return;
      const evs = (r && Array.isArray(r.events)) ? r.events : [];
      const byDate = {};
      evs.slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))).forEach((ev) => {
        if (!ev.date) return;
        const [tg, tc] = tagFor(ev.kind);
        (byDate[ev.date] = byDate[ev.date] || []).push({
          time: ev.time || '—', tag: tg, tagColor: tc,
          title: ev.title || (isNutri ? tr('coach:today.consult', { defaultValue: 'Consult' }) : tr('coach:today.session', { defaultValue: 'Session' })),
          sub: [ev.sub, ev.durationMin ? `${ev.durationMin}m` : null].filter(Boolean).join(' · ') || tr('coach:today.scheduled', { defaultValue: 'Scheduled' }),
          state: ev.status === 'done' ? 'done' : undefined,
          client: ev.with || '', clientId: ev.clientId || null,
        });
      });
      Object.values(byDate).forEach((list) => { if (list.length) list[list.length - 1].last = true; });
      setRealByDate(byDate);
    }).catch(() => {});
    return () => { on = false; };
  }, [isNutri]);
  // Per-day bookings dataset (demo). "Today" (offset 0) is always the busy
  // roster regardless of the real weekday. Trainer keys off 21; nutritionist off 22.
  const TRAINER_BOOKINGS = {
    20: [
      { time: '08:00', tag: 'LIVE', tagColor: t.RUST, title: 'Alex Rivera',    sub: 'Lower Pull · 60m', state: 'done' },
      { time: '11:30', tag: 'LIVE', tagColor: t.RUST, title: 'Riley Kim',      sub: 'Conditioning · 45m', state: 'done' },
      { time: '15:00', tag: 'ASYN', tagColor: t.BLUE, title: 'Drew Park · review', sub: 'Form check · 6 clips', state: 'done', last: true },
    ],
    21: [
      { time: '07:00', tag: 'LIVE', tagColor: t.RUST,  title: 'Alex Rivera',     sub: 'Upper Push — Peak · 60m', state: 'done' },
      { time: '08:30', tag: 'LIVE', tagColor: t.RUST,  title: 'Sam Patel',       sub: 'Conditioning · 45m',      state: 'done' },
      { time: '10:00', tag: 'ASYN', tagColor: t.BLUE,  title: 'Riley Kim · review', sub: 'Form check · 4 clips', state: 'next' },
      { time: '13:00', tag: 'LIVE', tagColor: t.RUST,  title: 'Casey Lee',       sub: 'Lower Pull — Peak · 60m' },
      { time: '14:30', tag: 'LIVE', tagColor: t.RUST,  title: 'Drew Park',       sub: 'Upper Push — Peak · 45m' },
      { time: '16:00', tag: 'INTK', tagColor: t.GREEN, title: 'New: Morgan Liu', sub: 'Intake call · 30m' },
      { time: '17:30', tag: 'LIVE', tagColor: t.RUST,  title: 'Quinn Choi',      sub: 'Hypertrophy block 2 · 60m' },
      { time: '19:00', tag: 'PRGM', tagColor: t.AMBER, title: 'Block 3 release', sub: 'Push to all · auto-send', last: true },
    ],
    22: [
      { time: '10:00', tag: 'PRGM', tagColor: t.AMBER, title: 'Sofia program', sub: 'Final review · 1h block' },
      { time: '14:00', tag: 'INTK', tagColor: t.GREEN, title: 'Tasha Yeo',      sub: 'Intake call · 30m', last: true },
    ],
    23: [
      { time: '07:00', tag: 'LIVE', tagColor: t.RUST, title: 'Alex Rivera',  sub: 'Upper Push · 60m' },
      { time: '11:00', tag: 'ASYN', tagColor: t.BLUE, title: 'Sam Patel · review', sub: 'Bench form · 3 clips', last: true },
    ],
    24: [
      { time: '08:30', tag: 'LIVE', tagColor: t.RUST, title: 'Casey Lee',  sub: 'Lower Pull · 60m' },
      { time: '13:00', tag: 'LIVE', tagColor: t.RUST, title: 'Quinn Choi', sub: 'Conditioning · 45m', last: true },
    ],
    25: [],
    26: [
      { time: '09:00', tag: 'INTK', tagColor: t.GREEN, title: 'Open hours', sub: 'Drop-in consults', last: true },
    ],
  };
  const NUTRI_SCHEDULE = {
    20: [
      { time: '10:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Sam Patel',   sub: 'Macro check · 30m', state: 'done' },
      { time: '14:00', tag: 'INTK', tagColor: t.GREEN, title: 'Drew Park',   sub: 'Initial · 60m', state: 'done', last: true },
    ],
    21: [
      { time: '09:00', tag: 'INTK', tagColor: t.GREEN, title: 'Casey Lee',   sub: 'Initial · 60m', state: 'done' },
      { time: '11:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Sara Mendez', sub: 'Cut adjustment · 30m', state: 'done' },
      { time: '13:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Riley Kim',   sub: 'Refeed plan · 30m', state: 'next' },
      { time: '16:00', tag: 'INTK', tagColor: t.GREEN, title: 'Morgan Liu',  sub: 'Initial · 60m', last: true },
    ],
    22: [
      { time: '11:00', tag: 'INTK', tagColor: t.GREEN, title: 'Sara Mendez', sub: 'Initial · 60m' },
      { time: '13:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Jamie Wong',  sub: 'Cut adjustment · 30m' },
      { time: '15:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Alex Rivera', sub: 'Macro check · 30m', state: 'next' },
      { time: '16:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Riley Kim',   sub: 'Refeed plan · 30m' },
      { time: '17:30', tag: 'INTK', tagColor: t.GREEN, title: 'Pat Doan',    sub: 'Initial · 60m', last: true },
    ],
    23: [
      { time: '10:00', tag: 'INTK', tagColor: t.GREEN, title: 'Quinn Choi', sub: 'Initial · 60m' },
      { time: '14:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Tasha Yeo',  sub: 'Macro check · 30m', last: true },
    ],
    24: [
      { time: '09:30', tag: 'F/U',  tagColor: t.BLUE,  title: 'Alex Rivera', sub: 'Macro check · 30m' },
      { time: '12:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Sam Patel',   sub: 'Cut adjustment · 30m', last: true },
    ],
    25: [],
    26: [
      { time: '09:00', tag: 'INTK', tagColor: t.GREEN, title: 'Open hours', sub: 'Drop-in consults', last: true },
    ],
  };
  const { todayIdx, dates } = bsProWeek();
  const dataFor = isNutri
    ? (off) => off === 0 ? 22 : off > 0 ? [23, 24, 21][Math.min(off - 1, 2)] : [20, 25, 26][Math.min(-off - 1, 2)]
    : (off) => off === 0 ? 21 : off > 0 ? [22, 23, 24][Math.min(off - 1, 2)] : [20, 25, 26][Math.min(-off - 1, 2)];
  const dataByIdx = dates.map((_, i) => dataFor(i - todayIdx));
  const selIdx = Math.max(0, dates.findIndex(d => d.getDate() === selDay));
  const selDate = dates[selIdx];
  const isToday = selIdx === todayIdx;
  const dataDay = dataByIdx[selIdx];
  // Live when the coach has any real calendar events this week (empty days show
  // empty); demo roster in preview / before any sessions are booked.
  const hasReal = realByDate && Object.values(realByDate).some((l) => l && l.length);
  const demoDataset = isNutri ? NUTRI_SCHEDULE : TRAINER_BOOKINGS;
  const bookings = hasReal ? ((selDate && realByDate[_ds(selDate)]) || []) : (bsProSignedIn() ? [] : (demoDataset[dataDay] || []));

  // Per-day lead narrative (demo).
  const TRAINER_LEAD = {
    20: { count: '3', copy: 'Light Monday — catch-up day for async reviews.' },
    21: { count: '8', copy: "First at 7am. Two free hours at noon to write Sofia's program." },
    22: { count: '2', copy: 'Quiet day. Block out the morning for Sofia.' },
    23: { count: '2', copy: 'One live, one async. Easy build-up to Friday.' },
    24: { count: '2', copy: 'Two heavy sessions — Casey & Quinn back-to-back area.' },
    25: { count: '0', copy: 'Off day. Programming refresh on the docket.' },
    26: { count: '1', copy: 'Open hours — drop-in consults only.' },
  };
  const NUTRI_LEAD = {
    20: { count: '2', copy: 'Quiet Monday — one intake, one follow-up.' },
    21: { count: '4', copy: 'One intake, three follow-ups. First at 9am.' },
    22: { count: '5', copy: 'Two intakes, three follow-ups. First at 11am.' },
    23: { count: '2', copy: 'Light Friday — one intake, one macro check.' },
    24: { count: '2', copy: 'Two follow-ups. Easy weekend cadence.' },
    25: { count: '0', copy: 'Off day. No sessions scheduled.' },
    26: { count: '1', copy: 'Open hours — drop-in consults only.' },
  };
  const LEAD_SET = isNutri ? NUTRI_LEAD : TRAINER_LEAD;
  const defaultDay = isNutri ? 22 : 21;
  // Live-now banner: REAL presence only. A roster client (with a real userId)
  // currently in a matching activity surfaces the banner; signed-out keeps the
  // demo banner as a preview. Re-renders on presence change.
  useProPresenceTick();
  const roster = useBSProRoster(role);
  const coachSignedIn = bsProSignedIn();
  // Day-shape hero lead. Signed-out keeps the rich demo narrative; signed-in is
  // honest off the day's real bookings (no demo session counts/copy).
  const demoLead = LEAD_SET[dataDay] || LEAD_SET[defaultDay];
  const first = bookings.length ? bookings[0] : null;
  const bookingsWithDuration = bookings.map((b) => ({ ...b, durationMin: bsProDurationFromSub(b.sub) || undefined }));
  const dayShape = bsProDayShape(bookingsWithDuration, isToday ? { h: new Date().getHours(), m: new Date().getMinutes() } : null);
  // THE WIRE / rail attention budget — the VERIFIED severity model (sev values
  // are red/amber/new/green/past; green/past never enter the budget). Demo rows
  // carry no `_sig` and derive severity from their `s` status via bsRowSeverity —
  // the single live-or-demo path — so signed-out demo flags flow through here too.
  const FLAG_WORDS = { red: tr('coach:sev.flag', { defaultValue: 'FLAG' }), amber: tr('coach:sev.watch', { defaultValue: 'WATCH' }), new: tr('coach:sev.new', { defaultValue: 'NEW' }) };
  const triageRows = roster
    .filter((c) => c.active !== false)
    .map((c) => ({ c, sig: bsRowSeverity(c, role) }))
    .filter(({ sig }) => sig && FLAG_WORDS[sig.sev])
    .sort((a, b) => (a.sig.rank ?? 9) - (b.sig.rank ?? 9))
    .map(({ c, sig }) => ({ clientId: c.userId || null, name: c.n, severity: sig.sev, directive: sig.directive || sig.label || '' }));
  const budget = bsProAttentionBudget(triageRows, bookingsWithDuration);
  // Demoted-client rail anchoring — SAME clientId-first / exact-name-match rule
  // bsProAttentionBudget uses internally (never substring/.includes()), so a
  // demoted client who IS booked today still gets their ⚑ mark on that rail row.
  const normName = (s) => String(s || '').trim().toLowerCase();
  const demotedAnchorFor = (rawIdx) => {
    const b = bookingsWithDuration[rawIdx];
    if (!b) return null;
    return budget.demoted.find((dt) => (
      (dt.clientId && b.clientId && dt.clientId === b.clientId) ||
      (normName(dt.name) && (normName(b.client) === normName(dt.name) || normName(b.title) === normName(dt.name)))
    )) || null;
  };
  const leadVerdict = coachSignedIn
    ? bsProLeadVerdict({ signedIn: true, sessions: bookings.length, firstLabel: bsProHourLabel(first && first.time), top: budget.lead })
    : demoLead.copy;
  const flaggedTotal = roster.filter((c) => c.active !== false && FLAG_WORDS[(bsRowSeverity(c, role) || {}).sev]).length;
  const openHoursKnown = dayShape.openHours != null;
  const liveClients = isToday ? roster.filter((c) => c.active !== false && c.userId && window.ShapePresence && window.ShapePresence.activityOf && window.ShapePresence.activityOf(c.userId) === (isNutri ? 'cooking' : 'workout')) : [];
  const liveClient = liveClients[0] || null;
  const liveBulletinShown = isToday && (liveClient || !coachSignedIn);
  const openLiveMessage = (lc) => {
    if (isNutri) { try { window.dispatchEvent(new CustomEvent('shape:proMessageClient', { detail: { client: { userId: lc.userId, n: lc.n } } })); } catch (e) {} return; }
    onWatchLive({ client: lc.n, clientId: lc.userId, workout: 'Live session' });
  };

  // Wire-row local state — SCHEDULE opens BSProScheduleSession for a client row;
  // OPEN THE FILE routes to the roster (onWidgetOpen('clients')) exactly like
  // the client page's local schedFor pattern.
  const [schedFor, setSchedFor] = useStateBSP(null);

  // ── Motion sections: one useBSSdInView pair per station (lead/rail/wire/inside) ──
  const [leadRef, leadSeen] = useSdInView ? useSdInView() : [null, true];
  const [railRef, railSeen] = useSdInView ? useSdInView() : [null, true];
  const [wireRef, wireSeen] = useSdInView ? useSdInView() : [null, true];
  const [insideRef, insideSeen] = useSdInView ? useSdInView() : [null, true];

  // NOW tick — heat dot + "NOW hh:mm — {countdown}". One markup, two sites: inline at
  // the current rail slot, or as a trailing line when the day is clear (nowSlot 'end').
  const nowTick = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 10px' }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: heat, flexShrink: 0, ...(liveBulletinShown || sdReduced ? null : { animation: 'bsLivePulse 2.2s ease-in-out infinite' }) }} />
      <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: heat }}>{tr('coach:common.now', { defaultValue: 'NOW' })} {bsNowHHMM()} — {dayShape.countdown}</span>
    </div>
  );

  if (schedFor) return <BSProScheduleSession client={schedFor} role={role} clientUid={schedFor.userId} onBack={() => setSchedFor(null)} />;

  return (
    <BSPage>
      <BSMasthead
        compact
        thinRule
        noTopRule
        title={<img src={`${import.meta.env.BASE_URL}shape-wordmark.png`} alt="Shape" style={{ display: 'block', margin: '6px auto -2px', height: 56, width: 'auto', filter: t.isLight ? 'brightness(0)' : 'brightness(0) invert(1)' }} />}
        showDoubleRule={false}
        trailing={<span style={{ display: 'flex', alignItems: 'center', gap: BS_CORNER_GAP }}>{typeof window !== 'undefined' && window.BSSearchCorner ? React.createElement(window.BSSearchCorner, { size: (typeof window !== 'undefined' && window.BS_HEADER_AVATAR) || 34 }) : null}<BSFacetAvatar size={(typeof window !== 'undefined' && window.BS_HEADER_AVATAR) || 34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.bsMyPhoto && window.bsMyPhoto()) || undefined} live={typeof bsAmLive==='function'?bsAmLive():false} showRank={false} onClick={onProfile} /></span>}
        showDotTexture={false}
      />

      {/* §A.2 DATELINE — one row, edition label in heat + day/date, ink-50; right = live clock or selected date. */}
      <div style={{ padding: `6px ${t.padX}px 7px`, borderBottom: `1px solid ${t.INK}12`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          <span style={{ color: heat }}>{isNutri ? tr('coach:today.editionNutri', { defaultValue: 'NUTRI EDITION' }) : tr('coach:today.editionTrainer', { defaultValue: 'TRAINERS EDITION' })}</span>
          <span style={{ color: `${t.INK}80` }}> · {_BS_DOW[selIdx]} · {_BS_MON[selDate.getMonth()]} {selDate.getDate()}</span>
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: `${t.INK}80`, fontVariantNumeric: 'tabular-nums' }}>
          {isToday ? bsNowHHMM() : `${_BS_MON[selDate.getMonth()]} ${selDate.getDate()}`}
        </span>
      </div>

      {/* NOW PLAYING — Shape Radio, pinned to the top under the edition band */}
      <div style={{ marginTop: 12 }}>
        <BSNowPlaying onOpen={goRadio} />
      </div>

      {/* §A.3 BULLETINS — LIVE (teal spine + breathing dot) then REVIEW (heat spine, no dot). */}
      {liveBulletinShown && (() => {
        const lc = liveClient || { n: 'Alex Rivera', i: 'A', c: t.RUST };
        const more = Math.max(0, liveClients.length - 1);
        const verb = isNutri ? tr('coach:today.verbCooking', { defaultValue: 'cooking' }) : tr('coach:today.verbTraining', { defaultValue: 'training' });
        const actionLabel = isNutri ? tr('coach:today.openArrow', { defaultValue: 'OPEN →' }) : tr('coach:today.watchArrow', { defaultValue: 'WATCH →' });
        const title = liveClient ? (more ? tr('coach:today.livePlusMore', { defaultValue: '{name} · +{count} more', name: lc.n, count: more }) : lc.n) : (isNutri ? 'Alex Rivera · Meal prep' : 'Alex Rivera · Upper Pull');
        return (
          <div style={{ padding: `4px ${t.padX}px 0` }}>
            <div style={{ borderLeft: `3px solid ${t.isLight ? '#0a8f87' : '#34d6c5'}`, padding: '8px 0 8px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BSFacetAvatar size={28} c={lc.c || t.RUST} initial={lc.i || (lc.n || '?').charAt(0).toUpperCase()} name={lc.n} photo={lc.avatarUrl || lc.avatar || undefined} showRank={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.isLight ? '#0a8f87' : '#34d6c5', fontWeight: 800 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor', display: 'inline-block', boxShadow: '0 0 8px currentColor', animation: 'bsLivePulse 2.2s ease-in-out infinite' }} /> {tr('coach:today.liveVerb', { defaultValue: 'Live · {verb}', verb })}
                  </div>
                  <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                </div>
                <button type="button" onClick={() => {
                  // Nutritionist OPEN → the live-boost sheet (#1514 — cheer them
                  // mid-cook). Works for a real live client AND the demo bulletin
                  // (the sheet labels the preview honestly). Previously this fell
                  // through to the trainer's workout watch payload on the nutri
                  // shell (which never wires onWatchLive) — a dead link.
                  if (isNutri) {
                    // lc already resolves the demo fallback (name/avatar), so one
                    // payload covers both. The sheet lives in the CLIENT bundle,
                    // which a cold pros-only session hasn't loaded — pull it in
                    // on demand before opening (no-op when already loaded).
                    const payload = { name: lc.n, userId: lc.userId || null, activity: 'cooking', photoUrl: lc.avatarUrl || lc.avatar || null };
                    if (typeof window !== 'undefined' && window.BSLiveBoostSheet) setBoostFor(payload);
                    else import('./iosAppBroadsheetClient.jsx').then(() => setBoostFor(payload)).catch(() => {});
                    return;
                  }
                  if (liveClient) openLiveMessage(lc); else onWatchLive({ client: 'Alex Rivera', workout: 'Upper Pull — Peak' });
                }} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.isLight ? '#0a8f87' : '#34d6c5' }}>{actionLabel}</button>
              </div>
            </div>
            <style>{`@keyframes bsLivePulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
          </div>
        );
      })()}
      {boostFor && typeof window !== 'undefined' && window.BSLiveBoostSheet
        ? React.createElement(window.BSLiveBoostSheet, { person: boostFor, onClose: () => setBoostFor(null) })
        : null}
      {!coachSignedIn && (
        <div style={{ padding: `4px ${t.padX}px 0` }}>
          <button type="button" onClick={onOpenReviews} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', borderLeft: `3px solid ${heat}`, padding: '8px 0 8px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70 }}>{isNutri ? tr('coach:today.logsWaiting', { defaultValue: '2 CLIENT LOGS WAITING' }) : tr('coach:today.clipsWaiting', { defaultValue: '4 FORM CLIPS WAITING' })} · {tr('coach:today.reviewArrow', { defaultValue: 'REVIEW →' })}</span>
          </button>
        </div>
      )}

      {/* §A.4 THE LEAD — verdict lead (data-tour anchor for the coach onboarding tour). */}
      <div ref={leadRef} data-tour="hero-today" style={{ padding: `14px ${t.padX}px 16px`, borderBottom: `1px solid ${t.RULE}` }}>
        {StationHead && <StationHead heat={heat} INK={t.INK} label={tr('coach:today.theLead', { defaultValue: 'THE LEAD' })} />}
        <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.28, color: t.INK }}>
          {leadVerdict}<span style={{ color: heat }}>.</span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 22 }}>
          {LedgerStat && <LedgerStat INK={t.INK} label={isNutri ? tr('coach:today.consults', { defaultValue: 'CONSULTS' }) : tr('coach:today.sessions', { defaultValue: 'SESSIONS' })} value={String(bookings.length)} seen={leadSeen} figSize={26} />}
          {LedgerStat && <LedgerStat INK={t.INK} label={tr('coach:today.needYou', { defaultValue: 'NEED YOU' })} value={String(flaggedTotal)} seen={leadSeen} figSize={26} delay={60} />}
          {openHoursKnown && LedgerStat && <LedgerStat INK={t.INK} label={tr('coach:today.openHrs', { defaultValue: 'OPEN HRS' })} value={String(dayShape.openHours)} seen={leadSeen} figSize={26} delay={120} />}
        </div>
      </div>

      {/* §A.5 WEEK STRIP */}
      <BSProWeekStrip
        goCalendar={goCalendar}
        heat={heat}
        selDay={selDay}
        onSelectDay={setSelDay}
        dots={hasReal
          ? dates.map((d) => ((realByDate[_ds(d)] || []).slice(0, 3).map((b) => b.tagColor)))
          : bsProSignedIn() ? dates.map(() => []) : dataByIdx.map(dd => (isNutri ? {
          20: [t.BLUE, t.BLUE],
          21: [t.GREEN, t.BLUE, t.BLUE],
          22: [t.BLUE],
          23: [t.GREEN, t.BLUE],
          24: [t.BLUE, t.BLUE],
          25: [],
          26: [t.AMBER],
        } : {
          20: [t.RUST, t.RUST, t.BLUE],
          21: [t.RUST, t.RUST, t.RUST],
          22: [t.AMBER, t.GREEN],
          23: [t.RUST, t.BLUE],
          24: [t.RUST, t.RUST],
          25: [],
          26: [t.GREEN],
        })[dd] || [])}
      />

      {/* §A.6 THE RAIL — the booking ledger, time-ordered, NOW tick + gaps. */}
      <div ref={railRef} style={{ padding: `4px ${t.padX}px 0` }}>
        {StationHead && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}><StationHead heat={heat} INK={t.INK} label={`${_BS_DOW[selIdx]} · ${tr('coach:rail.theRail', { defaultValue: 'THE RAIL' })}`} /></div>
            <button type="button" onClick={goCalendar} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', marginBottom: 13, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, padding: '0 2px' }}>{tr('coach:rail.calendar', { defaultValue: 'CALENDAR →' })}</button>
          </div>
        )}
        <div
          onClick={(e) => { if (e.target && e.target.closest && e.target.closest('button')) return; goCalendar(); }}
          style={{ position: 'relative', paddingLeft: 44, cursor: 'pointer' }}
        >
          <span aria-hidden style={{ position: 'absolute', left: 30, top: 0, bottom: 0, width: 2, background: heat, ...(sdReduced ? null : railSeen ? { transformOrigin: 'top', animation: 'bsSdGrowY 900ms cubic-bezier(.4,0,.2,1) both' } : { transformOrigin: 'top', transform: 'scaleY(0)' }) }} />
          {bookings.length >= 10 && bookings.filter((b) => b.state === 'done').length > 0 && (
            <div style={{ position: 'relative', minHeight: 44, padding: '6px 0 10px' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: `${t.INK}80` }}>{tr('coach:rail.doneCount', { defaultValue: '{count} DONE ✓', count: bookings.filter((b) => b.state === 'done').length })}</div>
            </div>
          )}
          {(() => {
            // Raw-index preservation: every downstream reference (dayShape.nowSlot,
            // dayShape.gaps[].afterIdx, budget.inline[].bookingIdx, demoted-anchor)
            // keys off the RAW booking index — so the density fold (≥10 bookings
            // collapses `done` entries into one row) must not re-index `i`.
            const indexed = bookings.map((b, rawIdx) => ({ b, rawIdx }));
            // Density fold hides `done` rows on ≥10-booking days — but keep any done row
            // that anchors a gap so its OPEN divider (still counted in openHours) renders.
            const gapAnchors = new Set(dayShape.gaps.map((g) => g.afterIdx));
            const visible = bookings.length >= 10 ? indexed.filter(({ b, rawIdx }) => b.state !== 'done' || gapAnchors.has(rawIdx)) : indexed;
            return visible.map(({ b, rawIdx }) => {
              const done = b.state === 'done';
              const isNext = b.state === 'next' || b.state === 'live';
              const typeWord = b.tag || tr('coach:rail.sessionTag', { defaultValue: 'SESSION' });
              const inlineFlag = budget.inline.find((x) => x.bookingIdx === rawIdx);
              const demotedFlag = !inlineFlag ? demotedAnchorFor(rawIdx) : null;
              const flagHit = inlineFlag || demotedFlag;
              const sevWord = flagHit ? FLAG_WORDS[flagHit.severity] : null;
              const sevColor = flagHit ? { red: '#c0533b', amber: '#d8a23a', new: '#5fa96e' }[flagHit.severity] : null;
              const gap = dayShape.gaps.find((g) => g.afterIdx === rawIdx);
              return (
                <React.Fragment key={rawIdx}>
                  <div style={{ position: 'relative', minHeight: 44, padding: '6px 0 10px' }}>
                    <span style={{ position: 'absolute', left: -44, top: 8, width: 26, textAlign: 'right', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: done ? `${t.INK}4d` : `${t.INK}b3`, textDecoration: done ? 'line-through' : 'none' }}>{bsProHourLabel(b.time)}</span>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: done ? t.INK50 : t.INK, textDecoration: done ? 'line-through' : 'none' }}>{b.title}</div>
                    <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
                      {isNext ? <span style={{ color: t.INK, borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{typeWord}</span> : typeWord}
                      {' · '}{b.sub}{done ? tr('coach:rail.doneSuffix', { defaultValue: ' · DONE' }) : ''}{isNext && <span style={{ color: heat }}> {tr('coach:rail.nextSuffix', { defaultValue: '· ↑ NEXT' })}</span>}
                      {sevWord && <span style={{ color: sevColor }}> · ⚑ {sevWord}</span>}
                    </div>
                  </div>
                  {dayShape.nowSlot === rawIdx && isToday && nowTick}
                  {gap && (
                    <div style={{ borderTop: `1px dashed ${t.INK}1f`, borderBottom: `1px dashed ${t.INK}1f`, padding: '8px 0', margin: '2px 0' }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: `${t.INK}4d` }}>{bsProGapLabel(gap.startMin, gap.endMin)}</span>
                    </div>
                  )}
                </React.Fragment>
              );
            });
          })()}
          {/* Trailing NOW line — dayShape.nowSlot === 'end' means the coach is past
              every booking today; the loop above only matches a numeric rawIdx, so
              this end-of-day tick renders after the last rail entry. */}
          {dayShape.nowSlot === 'end' && isToday && nowTick}
          {bookings.length === 0 && coachSignedIn && (
            Redact ? <Redact INK={t.INK} label={tr('coach:rail.nothingBooked', { defaultValue: 'NOTHING BOOKED — OPEN HOURS' })} /> : (
              <div style={{ borderTop: `1px dashed ${t.INK}1f`, borderBottom: `1px dashed ${t.INK}1f`, padding: '10px 0' }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${t.INK}4d` }}>{tr('coach:rail.nothingBooked', { defaultValue: 'NOTHING BOOKED — OPEN HOURS' })}</span>
              </div>
            )
          )}
          {bookings.length === 0 && !coachSignedIn && (
            <div style={{ padding: '10px 0', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{isNutri ? tr('coach:rail.offDayNutri', { defaultValue: 'Off day · nothing scheduled' }) : tr('coach:rail.offDayTrainer', { defaultValue: 'Off day · nothing booked' })}</div>
          )}
        </div>
      </div>

      {/* §A.7 THE WIRE — attention-budget wires (overflow past the rail's inline capacity), then the roster leader row (always). */}
      <div ref={wireRef} style={{ marginTop: 10, ...(sdReduced ? null : wireSeen ? { animation: 'bsSdFadeUp 420ms cubic-bezier(.4,0,.2,1) both' } : { opacity: 0 }) }}>
        {budget.wires.length > 0 && (
          <>
            {StationHead && <div style={{ padding: `0 ${t.padX}px` }}><StationHead heat="#c0533b" INK={t.INK} label={`${tr('coach:wire.theWire', { defaultValue: 'THE WIRE' })} · ${bookings.length === 0 ? tr('coach:wire.noSessionBooked', { defaultValue: 'NO SESSION BOOKED' }) : tr('coach:today.needsYou', { defaultValue: 'NEEDS YOU' })}`} /></div>}
            <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gap: 10 }}>
              {budget.wires.map((w, i) => {
                const sevColor = { red: '#c0533b', amber: '#d8a23a', new: '#5fa96e' }[w.severity] || t.AMBER;
                const sevWord = FLAG_WORDS[w.severity] || tr('coach:sev.flag', { defaultValue: 'FLAG' });
                return (
                  <div key={w.clientId || w.name || i} style={{ borderLeft: `3px solid ${sevColor}`, padding: '8px 0 9px 11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{w.name}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 6.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>· {sevWord}</span>
                    </div>
                    <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 11.5, color: t.INK70, lineHeight: 1.4 }}>{w.directive}</div>
                    <button
                      type="button"
                      onClick={() => (w.clientId ? setSchedFor({ n: w.name, userId: w.clientId }) : onWidgetOpen('clients'))}
                      style={{ marginTop: 5, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0 0', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase', color: t.INK }}
                    >
                      <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{w.clientId ? tr('coach:wire.scheduleArrow', { defaultValue: 'SCHEDULE →' }) : tr('coach:wire.openFileArrow', { defaultValue: 'OPEN THE FILE →' })}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div style={{ padding: `10px ${t.padX}px 0` }}>
          <button type="button" onClick={() => onWidgetOpen('clients')} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>{tr('coach:wire.seeFullRoster', { defaultValue: 'SEE THE FULL ROSTER' })}</span>
            <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{tr('coach:wire.clientsCount', { defaultValue: '{count} CLIENTS', count: roster.filter((c) => c.active !== false).length })}{flaggedTotal ? tr('coach:wire.flaggedSuffix', { defaultValue: ' · {count} FLAGGED', count: flaggedTotal }) : ''} ›</span>
          </button>
        </div>
      </div>

      {/* §A.8 INSIDE. — four doors per role (spec §A.8, lines 171-177). Door ALWAYS
          renders; figures only when known. */}
      <div ref={insideRef} style={{ padding: `18px ${t.padX}px 0`, ...(sdReduced ? null : insideSeen ? { animation: 'bsSdFadeUp 420ms cubic-bezier(.4,0,.2,1) both' } : { opacity: 0 }) }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{tr('coach:today.inside', { defaultValue: 'INSIDE.' })}</div>
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {(() => {
            const activeCount = roster.filter((c) => c.active !== false).length;
            const clientsFigure = `${tr('coach:today.activeCount', { defaultValue: '{count} ACTIVE', count: activeCount })}${flaggedTotal ? tr('coach:wire.flaggedSuffix', { defaultValue: ' · {count} FLAGGED', count: flaggedTotal }) : ''}`;
            return isNutri
              ? [
                  { label: tr('coach:door.clients', { defaultValue: 'CLIENTS' }), figure: clientsFigure, onOpen: () => onWidgetOpen('clients') },
                  { label: tr('coach:door.plans', { defaultValue: 'PLANS' }), figure: null, onOpen: () => onWidgetOpen('plans') },
                  { label: tr('coach:door.reviewQueue', { defaultValue: 'REVIEW QUEUE' }), figure: null, onOpen: () => onOpenReviews() },
                  { label: tr('coach:door.groceryLists', { defaultValue: 'GROCERY LISTS' }), figure: null, onOpen: () => onWidgetOpen('grocery') },
                ]
              : [
                  { label: tr('coach:door.clients', { defaultValue: 'CLIENTS' }), figure: clientsFigure, onOpen: () => onWidgetOpen('clients') },
                  { label: tr('coach:door.programs', { defaultValue: 'PROGRAMS' }), figure: null, onOpen: () => onWidgetOpen('programs') },
                  { label: tr('coach:door.reviewQueue', { defaultValue: 'REVIEW QUEUE' }), figure: null, onOpen: () => onOpenReviews() },
                  { label: tr('coach:door.groceryLists', { defaultValue: 'GROCERY LISTS' }), figure: null, onOpen: () => onWidgetOpen('grocery') },
                  { label: tr('coach:door.playlists', { defaultValue: 'PLAYLISTS' }), figure: null, onOpen: () => onWidgetOpen('playlists') },
                ];
          })().map((door) => (
            <button key={door.label} type="button" onClick={door.onOpen} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>{door.label}</span>
              <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK50 }}>{door.figure != null ? door.figure : '›'}</span>
            </button>
          ))}
        </div>
      </div>

      <BSFooter left={isNutri ? tr('coach:common.nutriEdition', { defaultValue: 'The Nutri Edition' }) : tr('coach:common.coachEdition', { defaultValue: 'The Coach Edition' })} right={tr('coach:common.pg1of4', { defaultValue: 'Pg 1 of 4' })} />
    </BSPage>
  );
}
function BSTrainerToday(props) { return <BSProToday role="trainer" {...props} />; }



// Roster filters are PHASE only (CUT / BUILD / PEAK). Status (on track / needs
// you / new) is shown by the section grouping + summary line, so it's not also a
// chip; the at-risk cut is the separate "Needs you" toggle in BSProRosterView.
const BS_ROSTER_FILTERS = {
  trainer: [
    { k: 'all', label: 'ALL' }, { k: 'cut', label: 'CUT' }, { k: 'build', label: 'BUILD' }, { k: 'peak', label: 'PEAK' },
  ],
  nutritionist: [
    { k: 'all', label: 'ALL' }, { k: 'cut', label: 'CUT' }, { k: 'build', label: 'BUILD' },
  ],
};
function bsClientMatchesFilter(c, key, role) {
  if (key === 'all') return true;
  const r = (c.r || '').toUpperCase();
  if (key === 'cut') return r.startsWith('CUT');
  if (key === 'build') return r.startsWith('BUILD');
  if (key === 'peak') return r.startsWith('PEAK');
  return true;
}
function bsClientMatchesQuery(c, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (c.n || '').toLowerCase().includes(q) || (c.prog || '').toLowerCase().includes(q) || (c.r || '').toLowerCase().includes(q);
}
// Roster triage — derive a severity + a one-line DIRECTIVE ("what to do") for
// every client from its status, using the SAME red → amber → new → green
// vocabulary as the Today "Who needs you" triage feed. Source-agnostic: the `s`
// status is set for demo AND live rosters, so the Clients page reads as a triage
// surface (sorted at-risk first, each row leading with the action), not a flat
// list. rank orders the list: 0 red, 1 amber, 2 new, 3 on-track, 5 past.
function bsRosterSeverity(c, role) {
  const s = (c && c.s) || 'on track';
  const nut = role === 'nutritionist';
  const NEEDS = coachTr('coach:roster.labelNeedsYou', { defaultValue: 'NEEDS YOU' });
  switch (s) {
    case 'missed':
      return { sev: 'red', rank: 0, label: NEEDS, directive: nut ? coachTr('coach:roster.dirMissedNutri', { defaultValue: 'No logs lately — send a nudge.' }) : coachTr('coach:roster.dirMissed', { defaultValue: 'Missed — no check-in. Reach out.' }) };
    case 'review form':
      return { sev: 'amber', rank: 1, label: NEEDS, directive: nut ? coachTr('coach:roster.dirReviewNutri', { defaultValue: 'Food log waiting on your review.' }) : coachTr('coach:roster.dirReview', { defaultValue: 'Check-in form waiting on your review.' }) };
    case 'deload soon':
      return { sev: 'amber', rank: 1, label: NEEDS, directive: coachTr('coach:roster.dirDeload', { defaultValue: 'Deload due — adjust the block.' }) };
    case 'onboard':
      return { sev: 'new', rank: 2, label: coachTr('coach:sev.new', { defaultValue: 'NEW' }), directive: nut ? coachTr('coach:roster.dirOnboardNutri', { defaultValue: 'New — send the intake form.' }) : coachTr('coach:roster.dirOnboard', { defaultValue: 'New — send the intake + first plan.' }) };
    case 'pr':
      return { sev: 'green', rank: 3, label: coachTr('coach:roster.labelPr', { defaultValue: 'PR' }), directive: coachTr('coach:roster.dirPr', { defaultValue: 'PR this week — send some props.' }) };
    case 'past':
      return { sev: 'past', rank: 5, label: coachTr('coach:roster.labelPast', { defaultValue: 'PAST' }), directive: coachTr('coach:roster.dirPast', { defaultValue: 'Past client — re-engage when ready.' }) };
    case 'on track':
    default:
      return { sev: 'green', rank: 3, label: coachTr('coach:roster.labelOnTrack', { defaultValue: 'ON TRACK' }), directive: nut ? coachTr('coach:roster.dirOnTrackNutri', { defaultValue: 'Logging on plan — nothing needed.' }) : coachTr('coach:roster.dirOnTrack', { defaultValue: 'On plan — nothing needed.' }) };
  }
}
// Demo rosters — ONE source rendered by the Clients page AND read by the Today
// "Who needs you" card, so the two surfaces always agree (same names,
// severities, directives). Builders take the theme so avatar colors stay
// theme-aware; `s` status drives bsRosterSeverity. When a live roster lands,
// point both consumers at it.
function bsTrainerDemoRoster(t) {
  return [
    { i: 'S', c: t.GREEN,  n: 'Sofia Martinez', prog: 'Hypertrophy',        streak: 14, r: 'BUILD · W6',  d: 'JUST NOW', s: 'on track',    active: true },
    { i: 'A', c: t.RUST,   n: 'Alex Rivera',    prog: 'Push / Pull / Legs', streak: 8,  r: 'CUT · W6',    d: '2H AGO',   s: 'on track',    active: true },
    { i: 'P', c: '#8a5cf6',n: 'Priya Singh',    prog: 'Fat Loss 101',       streak: 0,  r: 'CUT · W3',    d: '3D AGO',   s: 'missed',      active: true },
    { i: 'M', c: t.AMBER,  n: 'Marcus Lee',     prog: 'Intro Block',        streak: 3,  r: 'INTAKE',      d: 'NEW',      s: 'onboard',     active: true },
    { i: 'J', c: t.BLUE,   n: 'Jamal Green',    prog: 'Strength',           streak: 21, r: 'PEAK · W11',  d: '1D AGO',   s: 'pr',          active: true },
    { i: 'R', c: t.AMBER,  n: 'Riley Kim',      prog: 'Cut Block',          streak: 6,  r: 'CUT · W8',    d: '1D AGO',   s: 'review form', active: true },
    { i: 'Q', c: t.BLUE,   n: 'Quinn Choi',     prog: 'Build Phase',        streak: 11, r: 'BUILD · W2',  d: '3D AGO',   s: 'on track',    active: true },
    { i: 'D', c: t.AMBER,  n: 'Devon Pierce',   prog: 'Strength',           streak: 9,  r: 'BUILD · W9',  d: '2D AGO',   s: 'deload soon', active: true },
    { i: 'B', c: t.INK50,  n: 'Bailey Cruz',    prog: 'Finished block',     streak: 0,  r: 'PAST · finished block', d: '6W AGO', s: 'past', active: false },
    { i: 'T', c: t.INK50,  n: 'Taylor Reed',    prog: 'Paused',             streak: 0,  r: 'PAST · paused', d: '3M AGO', s: 'past',        active: false },
  ];
}
function bsNutriDemoRoster(t) {
  return [
    { i: 'A', c: t.RUST,  n: 'Alex Rivera',  prog: 'Cut · 1900 kcal', streak: 19, r: 'CUT · 1900 KCAL',  d: '94%', good: true, s: 'on track',    active: true },
    { i: 'J', c: t.BLUE,  n: 'Jamie Wong',   prog: 'Cut · 1700 kcal', streak: 12, r: 'CUT · 1700 KCAL',  d: '88%', good: true, s: 'on track',    active: true },
    { i: 'R', c: t.AMBER, n: 'Riley Kim',    prog: 'Cut · 1850 kcal', streak: 4,  r: 'CUT · 1850 KCAL',  d: '72%', s: 'review form', active: true },
    { i: 'S', c: t.GREEN, n: 'Sara Mendez',  prog: 'Intake',          streak: 0,  r: 'INTAKE',           d: 'NEW', s: 'onboard',     active: true },
    { i: 'P', c: t.BLUE,  n: 'Pat Doan',     prog: 'Intake',          streak: 0,  r: 'INTAKE',           d: 'NEW', s: 'onboard',     active: true },
    { i: 'C', c: t.AMBER, n: 'Casey Lee',    prog: 'Build · 2400',    streak: 9,  r: 'BUILD · 2400',     d: '64%', warn: true, s: 'missed', active: true },
    { i: 'D', c: t.RUST,  n: 'Drew Park',    prog: 'Build · 2200',    streak: 7,  r: 'BUILD · 2200',     d: '58%', warn: true, s: 'missed', active: true },
    { i: 'H', c: t.AMBER, n: 'Harper Quinn', prog: 'Build · 2600 kcal', streak: 5, r: 'BUILD · 2600 KCAL', d: '68%', warn: true, s: 'review form', active: true },
    { i: 'M', c: t.INK50, n: 'Morgan Liu',   prog: 'Ended Apr',       streak: 0,  r: 'PAST · ended Apr', d: '—', s: 'past', active: false },
    { i: 'T', c: t.INK50, n: 'Taylor Reed',  prog: 'Paused',          streak: 0,  r: 'PAST · paused',    d: '—', s: 'past', active: false },
    { i: 'N', c: t.INK50, n: 'Noah Bennett', prog: 'Completed',       streak: 0,  r: 'PAST · completed', d: '—', s: 'past', active: false },
  ];
}
function bsDemoRoster(role, t) {
  return role === 'nutritionist' ? bsNutriDemoRoster(t) : bsTrainerDemoRoster(t);
}
// Map an engine triage row (LIVE roster) → the roster-row shape the UI renders,
// carrying a pre-computed `_sig` (severity + directive) from the REAL signals so
// the home card + Clients page show the same verdict. The detail page only needs
// `userId` to fetch everything live; the rest is best-effort from the record.
function bsRowFromTriage(row, role, t) {
  const p = (row && row.client && row.client.profile) || {};
  const rec = (row && row.client) || {};
  const name = p.name || coachTr('coach:common.clientFallback', { defaultValue: 'Client' });
  const initials = name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  const palette = [t.GREEN, t.RUST, t.AMBER, t.BLUE, '#8a5cf6'];
  let h = 0; for (let k = 0; k < name.length; k++) h = (h * 31 + name.charCodeAt(k)) >>> 0;
  const sev = row.severity || 'green';
  const rank = sev === 'red' ? 0 : sev === 'amber' ? 1 : 3;
  // Prefer the engine's ONE cross-domain directive reason (the read), falling
  // back to the first raw flag reason — same row, just a sharper "why".
  const dir = row.directive || null;
  // An empty `row.reasons: []` is still truthy, so don't let it short-circuit the
  // flag-reason fallback — merge both and take the first real reason.
  const rawReasons = Array.isArray(row.reasons) ? row.reasons : [];
  const flagReasons = (row.flags || []).map((f) => f && f.reason);
  const reason = (dir && dir.reason && dir.reason !== '—' ? dir.reason : null)
    || [...rawReasons, ...flagReasons].filter(Boolean)[0];
  const nut = role === 'nutritionist';
  const directive = reason || (sev === 'green' ? (nut ? coachTr('coach:roster.dirOnTrackNutri', { defaultValue: 'Logging on plan — nothing needed.' }) : coachTr('coach:roster.dirOnTrack', { defaultValue: 'On plan — nothing needed.' })) : coachTr('coach:roster.dirNeedsAttention', { defaultValue: 'Needs your attention this week.' }));
  const adh = (rec.trainingAdherence && rec.trainingAdherence.pct != null) ? rec.trainingAdherence.pct
    : (rec.foodLogs && rec.foodLogs.daysLogged7d != null) ? Math.round((rec.foodLogs.daysLogged7d / 7) * 100) : null;
  const streak = (rec.streaks && rec.streaks.current != null) ? rec.streaks.current : null;
  // The OTHER discipline's signal, routed read-only to this pro (e.g. a trainer
  // seeing the dietitian's protein flag). owned===false = read-only context.
  const roFlags = ((row.flags || []).filter((f) => f && f.owned === false))
    .concat((row.readOnly || []).filter((f) => f && f.owned === false));
  const routed = roFlags.length
    ? { to: ['nutritionist', 'dietitian', 'nutrition'].includes(String(roFlags[0].routeTo || '').toLowerCase()) ? coachTr('coach:role.dietitian', { defaultValue: 'Dietitian' }) : coachTr('coach:role.trainer', { defaultValue: 'Trainer' }), reason: roFlags[0].reason }
    : null;
  return {
    userId: p.id || null, n: name, i: initials, c: palette[h % palette.length],
    avatar: p.avatar || p.photo || undefined,
    prog: (rec.program && rec.program.name) || '', r: String(rec.goalPhase || '').toUpperCase(),
    streak, d: adh != null ? `${adh}%` : '',
    s: sev === 'red' ? 'missed' : sev === 'amber' ? 'review form' : 'on track',
    active: true,
    _sig: { sev, rank, label: sev === 'green' ? coachTr('coach:roster.labelOnTrack', { defaultValue: 'ON TRACK' }) : coachTr('coach:roster.labelNeedsYou', { defaultValue: 'NEEDS YOU' }), directive, routed },
  };
}
// Severity for a roster row — prefers the live engine `_sig` when present, else
// derives from the demo row's `s` status. Single path for both surfaces.
function bsRowSeverity(c, role) {
  return (c && c._sig) || bsRosterSeverity(c, role);
}
// Shared roster source: the rich demo roster on first paint / signed-out, then
// the REAL coach roster (ShapeSignals.triageLive, scored by the engine) once it
// resolves. The coach Today card + both Clients pages all read this, so they're
// always in agreement. triageLive is cached per-role so they share one fetch.
function useBSProRoster(role) {
  const t = useBS();
  const [live, setLive] = useStateBSP(null); // null = not loaded; array = live rows
  useEffectBSP(() => {
    let on = true;
    const S = (typeof window !== 'undefined' && window.ShapeSignals) || null;
    if (!S || !S.triageLive) return undefined;
    S.triageLive(role).then((feed) => {
      if (!on) return;
      if (!Array.isArray(feed) || !feed.length) return;
      const rows = feed.map((r) => bsRowFromTriage(r, role, t));
      setLive(rows);
      // Two batch enrichments off the SAME `rows` closure: the weekend split
      // (_wknd) and the weekly-adherence variance band (_var). They MUST be
      // merged in ONE setLive — two independent setLive(rows.map(...)) calls
      // both map the captured `rows`, so whichever resolved second would erase
      // the other's key. Both degrade silently to an empty map.
      const W = (typeof window !== 'undefined' && window.ShapeRosterWeekend) || null;
      const V = (typeof window !== 'undefined' && window.ShapeRosterVariance) || null;
      const ids = rows.map((r) => r.userId);
      Promise.all([
        W && W.get ? W.get(ids).then((res) => (res && res.split) || {}).catch(() => ({})) : Promise.resolve({}),
        V && V.get ? V.get(ids).catch(() => ({})) : Promise.resolve({}),
      ]).then(([split, varMap]) => {
        if (!on) return;
        if (!Object.keys(split).length && !Object.keys(varMap).length) return;
        setLive(rows.map((r) => {
          const extra = {};
          if (split[r.userId]) extra._wknd = split[r.userId];
          if (varMap[r.userId]) extra._var = varMap[r.userId];
          return Object.keys(extra).length ? { ...r, ...extra } : r;
        }));
      }).catch(() => {});
    }).catch(() => {});
    return () => { on = false; };
  }, [role]);
  // Signed-in with no live clients → empty roster (not the demo cast). The demo
  // roster is preview-only; signed-out shows it as the example coach book.
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id);
  return live || (signedIn ? [] : bsDemoRoster(role, t));
}
// Card-based coach roster — header, search, scrollable filter pills (scrollbar
// hidden via .bs-hide-scroll), an Active/Past toggle, and tappable client cards.
function bsProMeInit() {
  const p = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.().profile) || {};
  const nm = (p.full_name || '').trim();
  const custom = (typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.initials) ? String(window.ShapeIdentity.initials).toUpperCase().slice(0, 2) : '';
  return custom || (nm ? nm.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() : 'S') || 'S';
}
// The coach's own avatar — opens Settings (the shells listen for the event).
function BSProAvatarButton({ size = 38 }) {
  // Match the Today/Me headers: the coach's real photo (custom or signed-in),
  // tier-colored ring, falling back to initials — not a flat initial badge.
  const tier = (typeof window !== 'undefined' && window.ShapeScore && window.ShapeScore.tier) || 'Base';
  const photo = (typeof window !== 'undefined' && window.bsMyPhoto && window.bsMyPhoto()) || undefined;
  const live = (typeof window !== 'undefined' && typeof bsAmLive === 'function') ? bsAmLive() : false;
  const open = () => { try { window.dispatchEvent(new CustomEvent('shape:openProSettings')); } catch (e) {} };
  return <BSFacetAvatar size={size} c={bsTierColor(tier)} initial={bsProMeInit()} photo={photo} live={live} showRank={false} onClick={open} />;
}
// The Client Index — the roster serialized into the Open Ledger / Wire
// Dispatch grammar (spec §B). Zero-box: a search underline, a typographic
// filter index (phase filters + a rust ⚑ NEEDS YOU item), a serif verdict,
// a NEEDS YOU station of full wire rows, a compact ON TRACK station (first 5
// + a dot-leader expander), and a PAST redaction toggle. Every piece of the
// original state/logic (query/filter/needsYou/roster/counts/onOpen) is kept
// verbatim — only the markup changed. Rows stagger in one-shot (30ms);
// roster carries ZERO infinite loops (the spec's loop rule).
// Stable no-op fallback for the in-view hook, so BSProRosterView can call it
// UNCONDITIONALLY (rules of hooks) even if the client-bundle kit isn't present.
function bsUseSdInViewFallback() { return [null, true]; }

function BSProRosterView({ role = 'trainer', clients, activeCount, pastCount, totalCount, newThisMonth = 3, roster, setRoster, query, setQuery, filter, setFilter, needsYou = false, setNeedsYou = () => {}, onOpen, footerLeft, footerRight }) {
  const t = useBS();
  const tr = useShapeTr();
  const heat = bsProHeat(t, role);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const filters = BS_ROSTER_FILTERS[role] || BS_ROSTER_FILTERS.trainer;

  // Window-kit consumption (Open Ledger kit, exposed by the client bundle) —
  // same null-guarded read-off-window pattern as BSProToday.
  const StationHead = typeof window !== 'undefined' ? window.BSTStationHead : null;
  const Redact = typeof window !== 'undefined' ? window.BSTRedact : null;
  // Rules of hooks: window.useBSSdInView is exposed by the client bundle (loaded
  // before the pros bundle), but fall back to a stable no-op hook and call it
  // UNCONDITIONALLY so the hook count never changes across renders.
  const useSdInView = (typeof window !== 'undefined' && window.useBSSdInView) || bsUseSdInViewFallback;
  const sdReduced = typeof window !== 'undefined' && window.bsSdReduced ? window.bsSdReduced() : false;
  React.useInsertionEffect(() => { try { window.bsInjectSessionDetailCss && window.bsInjectSessionDetailCss(); } catch (e) {} }, []);
  const [needsRef, needsSeen] = useSdInView();
  const [trackRef, trackSeen] = useSdInView();

  const [expanded, setExpanded] = useStateBSP(false);
  const [showAdd, setShowAdd] = useStateBSP(false);

  // ＋ADD used to punt to the settings hub — it now opens the real add-client
  // sheet (invite a member with your listing attached, or share the link).
  const goGrowRoster = () => setShowAdd(true);

  const SEVCOL = { red: '#c0533b', amber: '#d8a23a', new: '#5fa96e' };
  const rows = clients.map((c) => ({ c, sig: bsRowSeverity(c, role) })).sort((a, b) => a.sig.rank - b.sig.rank);
  // In PAST mode `clients` holds past records (all sev 'past') — they'd be dropped by
  // both the needs (rank<=1) and on-track (excludes 'past') filters, so route them to
  // their own station instead of leaving the PAST view empty.
  const pastMode = roster === 'past';
  const needsRows = pastMode ? [] : rows.filter((r) => r.sig.rank <= 1);
  const onTrackRows = pastMode ? [] : rows.filter((r) => r.sig.rank > 1 && r.sig.sev !== 'past');
  const pastRows = pastMode ? rows : [];
  const k = needsRows.length;
  const m = onTrackRows.length;
  const trackShown = expanded ? onTrackRows : onTrackRows.slice(0, 5);
  const trackMore = onTrackRows.length - trackShown.length;

  return (
    <BSPage>
      {/* §B.1 Header — mast row + THE ROSTER eyebrow + serif "Your clients."
          (heat italic accent) + mono right meta + ＋ ADD (≥44px). The mast row
          needs the standard 46px top / t.padX horizontal inset (BSPage provides
          no top padding) so it clears the notch + rounded corners — matches
          BSProActionHead / BSStShell; without it the masthead sat off-screen. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow()}</div>
      <div style={{ padding: `10px ${t.padX}px 0`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
            {tr('coach:roster.theRoster', { defaultValue: 'THE ROSTER' })} <span style={{ color: `${t.INK}80` }}>· {tr('coach:roster.activeCount', { defaultValue: '{count} ACTIVE', count: activeCount })}{newThisMonth > 0 ? tr('coach:roster.newThisMonth', { defaultValue: ' · +{count} THIS MO', count: newThisMonth }) : ''}</span>
          </div>
          <div data-tour="hero-clients" style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK, lineHeight: 1.05 }}>
            {tr('coach:roster.your', { defaultValue: 'Your' })} <i style={{ color: heat, fontStyle: 'italic' }}>{tr('coach:roster.clientsAccent', { defaultValue: 'clients.' })}</i>
          </div>
        </div>
        <button type="button" onClick={goGrowRoster} style={{ flexShrink: 0, minHeight: 44, minWidth: 44, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK }}>{tr('coach:roster.add', { defaultValue: '＋ ADD' })}</button>
      </div>

      {/* §B.2 Underline search */}
      <div style={{ margin: `14px ${t.padX}px 0`, display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1.5px solid ${t.INK}4d`, paddingBottom: 8 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 13, color: t.INK50 }}>⌕</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr('coach:roster.searchAria', { defaultValue: 'Search clients' })} placeholder={tr('coach:roster.searchPlaceholder', { defaultValue: 'Search {count} clients', count: totalCount })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14 }} />
      </div>

      {/* §B.3 Typographic filter index — role phase filters + ⚑ NEEDS YOU last;
          active = ink + 2px TEAL underline (page chrome, per §B item 3 — heat
          stays reserved for identity, not the active-filter indicator). */}
      <div style={{ margin: `0 ${t.padX}px`, display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${t.INK}12`, overflowX: 'auto' }} className="bs-hide-scroll">
        {filters.map((f) => {
          const on = filter === f.k;
          return (
            <button key={f.k} type="button" onClick={() => setFilter(f.k)} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, borderBottom: on ? `2px solid ${teal}` : '2px solid transparent', cursor: 'pointer', padding: '0 1px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', color: on ? t.INK : t.INK50, whiteSpace: 'nowrap' }}>{f.label}</button>
          );
        })}
        <button type="button" onClick={() => setNeedsYou(!needsYou)} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, borderBottom: needsYou ? `2px solid ${teal}` : '2px solid transparent', cursor: 'pointer', padding: '0 1px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', color: needsYou ? t.INK : '#c0533b', whiteSpace: 'nowrap' }}>{tr('coach:roster.needsYouFilter', { defaultValue: '⚑ NEEDS YOU' })}</button>
      </div>

      <div style={{ padding: `0 ${t.padX}px 24px` }}>
        {/* §B.4 Verdict — serif 16/600 + heat period; k = flagged, m = on-track. */}
        {!pastMode && rows.length > 0 && (
          <div style={{ marginTop: 16, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: t.INK }}>
            {k > 0 ? tr('coach:roster.verdictNeed', { defaultValue: '{k} need you — the other {m} are holding', k, m }) : tr('coach:roster.verdictAllHolding', { defaultValue: 'All {m} holding — nobody needs you today', m })}
            <span style={{ color: heat }}>.</span>
          </div>
        )}
        {/* Filtered-to-empty (an active roster with no matches) — NOT the zero-roster
            case (§B.8 owns that) and not PAST mode (its own station below). */}
        {!pastMode && rows.length === 0 && totalCount > 0 && (
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:roster.noMatching', { defaultValue: 'NO MATCHING CLIENTS' })}</span>
            <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
          </div>
        )}

        {/* §B.5 NEEDS YOU station — full wire rows (only when k > 0). */}
        {k > 0 && (
          <div ref={needsRef} style={{ marginTop: 20 }}>
            {StationHead && <StationHead heat="#c0533b" INK={t.INK} label={`${tr('coach:today.needsYou', { defaultValue: 'NEEDS YOU' })} · ${k}`} />}
            <div style={{ display: 'grid', gap: 2 }}>
              {needsRows.map(({ c, sig }, i) => {
                const sevKey = sig.sev === 'red' ? 'red' : sig.sev === 'amber' ? 'amber' : 'new';
                const sevWord = sig.sev === 'red' ? tr('coach:sev.flag', { defaultValue: 'FLAG' }) : sig.sev === 'amber' ? tr('coach:sev.watch', { defaultValue: 'WATCH' }) : tr('coach:sev.new', { defaultValue: 'NEW' });
                const col = SEVCOL[sevKey];
                return (
                  <button
                    key={`needs-${c.n}-${i}`}
                    type="button"
                    onClick={() => onOpen(c)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 12, alignItems: 'center',
                      border: 0, borderLeft: `3px solid ${col}`, background: 'transparent', minHeight: 52, padding: '11px 4px 11px 11px',
                      ...(sdReduced ? null : needsSeen ? { animation: `bsSdFadeUp 380ms cubic-bezier(.4,0,.2,1) ${i * 30}ms both` } : { opacity: 0 }),
                    }}
                  >
                    <BSFacetAvatar size={42} c={c.c} initial={c.i} name={c.n} photo={c.avatarUrl || c.avatar || undefined} showRank={false} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{c.n}</div>
                      <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 11.5, color: t.INK70, lineHeight: 1.35 }}>{sig.directive}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {c._wknd?.worstDimension && c._wknd.dimensions?.[c._wknd.worstDimension]?.flagged && (
                        <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', color: t.RUST, whiteSpace: 'nowrap' }}>{tr('coach:roster.wkndGap', { defaultValue: 'WKND −{gap}', gap: Math.abs(Math.round(c._wknd.dimensions[c._wknd.worstDimension].gapPp)) })}</span>
                      )}
                      {/* WATCH-tier signal, deliberately NOT the rust FLAG colour —
                          a variable week-to-week pattern is something to coach, not
                          a failure. `steady` renders nothing (never-shaming). */}
                      {c._var && c._var.band === 'variable' && (
                        <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', color: t.AMBER, whiteSpace: 'nowrap' }}>{tr('coach:roster.variable', { defaultValue: 'VARIABLE' })}</span>
                      )}
                      <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: col, whiteSpace: 'nowrap' }}>{sevWord} · {c.r || sig.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* §B.6 ON TRACK station — compact quiet rows, first 5 then a
            dot-leader expander. */}
        {onTrackRows.length > 0 && (
          <div ref={trackRef} style={{ marginTop: 20, ...(sdReduced ? null : trackSeen ? { animation: 'bsSdFadeUp 380ms cubic-bezier(.4,0,.2,1) both' } : { opacity: 0 }) }}>
            {StationHead && <StationHead heat={`${t.INK}30`} INK={t.INK} label={`${tr('coach:roster.labelOnTrack', { defaultValue: 'ON TRACK' })} · ${onTrackRows.length}`} />}
            <div style={{ display: 'grid', gap: 1 }}>
              {trackShown.map(({ c, sig }, i) => (
                <button
                  key={`track-${c.n}-${i}`}
                  type="button"
                  onClick={() => onOpen(c)}
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 11, alignItems: 'center', border: 0, background: 'transparent', minHeight: 44, padding: '9px 4px' }}
                >
                  <span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: `${t.INK}30`, justifySelf: 'center' }} />
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.n}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{[c.r, c.streak ? `${c.streak}D` : null].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
            {trackMore > 0 && (
              <button type="button" onClick={() => setExpanded(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 4px 0', textAlign: 'left' }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:roster.moreOnTrack', { defaultValue: '{count} MORE ON TRACK', count: trackMore })}</span>
                <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK }}>{tr('coach:roster.show', { defaultValue: 'SHOW ›' })}</span>
              </button>
            )}
          </div>
        )}

        {/* PAST station — compact rows of the coach's past clients (rendered only in
            PAST mode, where the active NEEDS YOU / ON TRACK stations are empty). */}
        {pastMode && (
          <div style={{ marginTop: 20 }}>
            {StationHead && <StationHead heat={`${t.INK}30`} INK={t.INK} label={`${tr('coach:roster.pastClients', { defaultValue: 'PAST CLIENTS' })} · ${pastRows.length}`} />}
            {pastRows.length > 0 ? (
              <div style={{ display: 'grid', gap: 1 }}>
                {pastRows.map(({ c }, i) => (
                  <button
                    key={`past-${c.n}-${i}`}
                    type="button"
                    onClick={() => onOpen(c)}
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 11, alignItems: 'center', border: 0, background: 'transparent', minHeight: 44, padding: '9px 4px' }}
                  >
                    <span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: `${t.INK}30`, justifySelf: 'center' }} />
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.n}</span>
                    <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{c.r || tr('coach:roster.labelPast', { defaultValue: 'PAST' })}</span>
                  </button>
                ))}
              </div>
            ) : (
              Redact ? <Redact INK={t.INK} label={tr('coach:roster.noPast', { defaultValue: 'NO PAST CLIENTS' })} /> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
                  <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:roster.noPast', { defaultValue: 'NO PAST CLIENTS' })}</span>
                  <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
                </div>
              )
            )}
          </div>
        )}

        {/* §B.7 PAST — redaction-row toggle flipping the existing active/past
            roster state. */}
        <div style={{ marginTop: 22 }}>
          <button type="button" onClick={() => setRoster(roster === 'past' ? 'active' : 'past')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}>
            <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>
              {roster === 'past' ? tr('coach:roster.backToActive', { defaultValue: '← BACK TO ACTIVE' }) : tr('coach:roster.pastClientsToggle', { defaultValue: 'PAST CLIENTS · {count} ›', count: pastCount })}
            </span>
            <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
          </button>
        </div>

        {/* §B.8 Signed-in empty roster — redaction line + Grow your roster →. */}
        {totalCount === 0 && (
          <div style={{ marginTop: 20 }}>
            {Redact ? <Redact INK={t.INK} label={tr('coach:roster.noClients', { defaultValue: 'NO CLIENTS YET' })} /> : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:roster.noClients', { defaultValue: 'NO CLIENTS YET' })}</span>
                <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
              </div>
            )}
            <button type="button" onClick={goGrowRoster} style={{ display: 'block', margin: '10px auto 0', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK }}>
              <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{tr('coach:roster.growRoster', { defaultValue: 'Grow your roster →' })}</span>
            </button>
          </div>
        )}
      </div>
      <BSFooter left={footerLeft} right={footerRight} />
      {showAdd && <BSProAddClientSheet role={role} onClose={() => setShowAdd(false)} />}
    </BSPage>
  );
}

// ═══ ADD A CLIENT — the roster's ＋ADD sheet ═══════════════════════════════
// Honest model: a client joins a roster by SUBSCRIBING to the coach — a coach
// can't unilaterally link someone. So ＋ADD offers the two real growth moves:
// (1) invite a member on Shape — a real 1:1 DM stamped metadata
//     {kind:'coach_invite', role, providerId, name} that renders as a tappable
//     card in their chat and opens this coach's marketplace Listing (the
//     conversion page), and
// (2) share the coach's public listing link outside Shape.
// The invite needs the coach's own provider row (ShapeCoachLookup.mine) so the
// card can deep-link; without one (application not approved yet) the sheet
// says so honestly instead of sending a card that opens nothing.
function BSProAddClientSheet({ role, onClose }) {
  const t = useBS();
  const tr = useShapeTr();
  const heat = bsProHeat(t, role);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const myUid = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || null;
  const [mine, setMine] = useStateBSP(undefined); // undefined = loading · null = no provider row
  // The durable ?ref= share token, tri-state (declared HERE, above every
  // effect that touches it): undefined = still resolving (send buttons WAIT),
  // null = CONFIRMED unavailable (plain URL is the honest final state),
  // string = the token.
  const [refToken, setRefToken] = useStateBSP(undefined);
  // The role whose provider-lookup produced the CURRENT mine/refToken. It's the
  // single readiness authority: mine===null carries no role marker, so after
  // switching FROM a listing-less role the stale null would read ready for one
  // frame — resolvedRole !== role blocks that whole class (both null and
  // non-null), and no per-value role check is needed.
  const [resolvedRole, setResolvedRole] = useStateBSP(null);
  const [q, setQ] = useStateBSP('');
  const [results, setResults] = useStateBSP(null); // null = idle · [] = no matches
  const [searching, setSearching] = useStateBSP(false);
  const [busyId, setBusyId] = useStateBSP(null);
  const [invited, setInvited] = useStateBSP({}); // userId -> true
  // Synchronous invite lock — two taps in the same render see stale busyId
  // state, so the ref is the authoritative in-flight/sent guard (state only
  // drives the UI). Holds the active send's userId + every already-sent id.
  const sendLockRef = React.useRef({ active: null, sent: {} });
  useEffectBSP(() => {
    let on = true;
    // A role change must never leave the PREVIOUS role's provider row, ref
    // token, or role marker live behind the buttons — all drop back to their
    // resolving states (invite toasts publish-first, send buttons disable)
    // until THIS role's lookups settle.
    setMine(undefined);
    setRefToken(undefined);
    setResolvedRole(null);
    (async () => {
      // Role-aware: a dual-role account must resolve THIS roster's provider
      // row — a nutritionist invite carrying a trainer id opens nothing.
      let r = null;
      try { r = await window.ShapeCoachLookup?.mine?.(role); } catch (e) { r = null; }
      if (!on) return;
      setMine(r || null);
      setResolvedRole(role); // stamp readiness to THIS role (null result included)
    })();
    return () => { on = false; };
  }, [role]);
  // Debounced live member search (search_shape_people — same source as the
  // universal search); coaches filtered out (a roster holds clients). The
  // request id guards against a slow older query resolving LAST and
  // overwriting the current query's results.
  const searchReqRef = React.useRef(0);
  useEffectBSP(() => {
    const query = q.trim();
    const req = ++searchReqRef.current;
    if (query.length < 2) { setResults(null); setSearching(false); return undefined; }
    setSearching(true);
    const id = setTimeout(async () => {
      let people = [];
      try { people = await window.ShapeSearch?.people?.(query, 12); } catch (e) { people = []; }
      if (searchReqRef.current !== req) return; // a newer query owns the results
      setResults((Array.isArray(people) ? people : []).filter((p) => p.userId && p.userId !== myUid && p.role === 'client'));
      setSearching(false);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  // Invite state + the send lock are keyed by ROLE:USER, and every handler
  // captures its own render's role — so on a role switch each provider role
  // delivers and attributes independently (a trainer invite can never satisfy
  // or suppress the nutritionist one), and an in-flight completion writes
  // under the role that started it, never the newly selected one.
  const inviteKey = (uid) => role + ':' + uid;
  const invite = async (p) => {
    const lock = sendLockRef.current;
    const k = inviteKey(p.userId);
    // 'ok' = delivered + tagged (terminal). 'noTag' rows stay actionable — the
    // retry re-runs ONLY the attribution write (lock.sent gates the DM), so a
    // failed create_coach_referral can never strand a client untaggable behind
    // an "Invited ✓" it didn't earn.
    if (lock.active || invited[k] === 'ok') return;
    // mine must be RESOLVED and belong to THIS role — the one commit frame
    // after a role switch (new role, stale mine) must never stamp the previous
    // role's provider id onto the invite or the referral.
    if (!mine || mine.role !== role) { window.__bsToast?.(tr('coach:addClient.publishFirst', { defaultValue: 'Publish your marketplace listing first — the invite carries it.' }), 'warn'); return; }
    lock.active = p.userId;
    setBusyId(p.userId);
    try {
      if (!lock.sent[k]) {
        const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: p.userId });
        const cid = (conv && conv.data) || null; // the RPC returns the conversation UUID on .data
        if (!cid) throw new Error('Could not open the conversation.');
        const inviteBody = role === 'nutritionist' ? tr('coach:addClient.inviteBodyNutri', { defaultValue: "Come work with me on Shape — my listing's attached." }) : tr('coach:addClient.inviteBodyTrainer', { defaultValue: "Come train with me on Shape — my listing's attached." });
        await window.ShapeMessages.sendMessage({
          conversationId: cid,
          body: inviteBody,
          metadata: { kind: 'coach_invite', role, providerId: mine.providerId, name: mine.name || (window.bsMyName ? window.bsMyName() : tr('coach:common.yourCoach', { defaultValue: 'Your coach' })) },
        });
        lock.sent[k] = true;
      }
      // The BYO attribution row (rails #1794): the DM card carries no token —
      // this client-bound referral IS what resolves 0% at their checkout.
      const refRes = await window.ShapeReferrals?.forClient?.(role, mine.providerId, p.userId);
      if (refRes && refRes.ok) {
        setInvited((prev) => ({ ...prev, [k]: 'ok' }));
        window.__bsToast?.(tr('coach:addClient.inviteSent', { defaultValue: 'Invite sent ✓ — it lands in their chat' }), 'ok');
      } else {
        setInvited((prev) => ({ ...prev, [k]: 'noTag' }));
        window.__bsToast?.(tr('coach:addClient.inviteSentNoTag', { defaultValue: 'Invite sent ✓ — the 0% tag didn’t record; tap Retry tag' }), 'warn');
      }
    } catch (e) {
      window.__bsToast?.(e?.message || tr('coach:addClient.inviteFailed', { defaultValue: 'Could not send the invite' }), 'err');
    }
    lock.active = null;
    setBusyId(null);
  };
  // ── The ref-tagged link + send channels (BYO rails #1794) ────────────────
  // The durable ?ref= token binds a member who opens the link into THIS
  // coach's 30-day attribution window (0% commission at checkout). A fast
  // first tap must never ship an untagged link that checkout can't attribute
  // — the buttons wait for refToken (declared with `mine` above) to resolve.
  useEffectBSP(() => {
    let on = true;
    (async () => {
      if (mine === undefined) return; // provider row still resolving
      if (!mine || !myUid) { if (on) setRefToken(null); return; }
      if (mine.role !== role) return; // stale pre-switch value — the reset re-runs this
      // The helper resolves null on failure, but a rejection here must still
      // land on the documented null fallback — undefined forever would lock
      // the send buttons.
      let tok = null;
      try { tok = await window.ShapeReferrals?.link?.(role, mine.providerId); } catch (e) { tok = null; }
      if (on) setRefToken(tok || null);
    })();
    return () => { on = false; };
  }, [mine, role]);
  // Ready = the token resolved AND the resolved-role marker matches (so a
  // listing-less null carries a role, closing the post-switch stale frame for
  // both null and non-null mine). A genuinely-listing-less account (mine null,
  // resolvedRole===role) is ready — it may still share the plain URL.
  const mineForRole = resolvedRole === role;
  const linkReady = refToken !== undefined && mineForRole;
  const listingUrl = () => {
    const base = `https://theshapecommunity.com/newdesign/MemberProfile.html?u=${myUid}`;
    return refToken ? `${base}&ref=${refToken}` : base;
  };
  const pitchBody = () => tr('coach:addClient.pitchBody', { defaultValue: 'I’m coaching on Shape now — my programs, your logging, and our chat all live in one app. Join me here: {link}', link: listingUrl() });
  // Every interpolation is URI-encoded before entering the mailto:/sms: URI —
  // the localized bodies are non-ASCII in most locales, and a raw &/?/# would
  // truncate the prefill.
  const emailIt = () => {
    if (!myUid) { window.__bsToast?.(tr('coach:addClient.signInToShare', { defaultValue: 'Sign in to share your listing.' }), 'warn'); return; }
    if (!linkReady) return; // token still resolving — button is disabled too
    window.location.href = `mailto:?subject=${encodeURIComponent(tr('coach:addClient.pitchSubject', { defaultValue: 'Join me on Shape' }))}&body=${encodeURIComponent(pitchBody())}`;
  };
  const textIt = () => {
    if (!myUid) { window.__bsToast?.(tr('coach:addClient.signInToShare', { defaultValue: 'Sign in to share your listing.' }), 'warn'); return; }
    if (!linkReady) return;
    // iOS takes `sms:&body=`, Android `sms:?body=` — the wrong one opens an
    // empty composer.
    const ios = /iPad|iPhone|iPod/.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    window.location.href = ios ? `sms:&body=${encodeURIComponent(pitchBody())}` : `sms:?body=${encodeURIComponent(pitchBody())}`;
  };
  const shareListing = async () => {
    if (!myUid) { window.__bsToast?.(tr('coach:addClient.signInToShare', { defaultValue: 'Sign in to share your listing.' }), 'warn'); return; }
    if (!linkReady) return;
    const url = listingUrl();
    try {
      if (navigator.share) {
        try { await navigator.share({ title: tr('coach:addClient.shareTitle', { defaultValue: 'My Shape listing' }), url }); return; }
        catch (e) {
          // ONLY an intentional cancel is silent — a permission/other failure
          // falls through to the clipboard so the share can still complete.
          if (e && e.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      window.__bsToast?.(tr('coach:addClient.linkCopied', { defaultValue: 'Listing link copied ✓' }), 'ok');
    } catch (e) {
      window.__bsToast?.(tr('coach:addClient.shareFailed', { defaultValue: 'Couldn’t share or copy the link — it’s also on your Business page.' }), 'err');
    }
  };
  const FA = typeof window !== 'undefined' ? window.BSFacetAvatar : null;
  const sheet = (
    <div onClick={() => !busyId && onClose()} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr('coach:addClient.aria', { defaultValue: 'Add a client' })} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '86%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))` }} className="bs-hide-scroll">
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: heat }}>{tr('coach:addClient.eyebrow', { defaultValue: 'Grow your roster' })}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.15 }}>{tr('coach:addClient.title', { defaultValue: 'Add a client.' })}</div>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50, lineHeight: 1.6 }}>{tr('coach:addClient.blurb', { defaultValue: 'Clients join your roster by subscribing to you. Invite a member — your listing lands in their chat — or share the link anywhere.' })}</div>
        {mine === null && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderLeft: `3px solid ${t.AMBER || heat}`, background: t.PAPER2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK70, lineHeight: 1.6 }}>
            {tr('coach:addClient.noListing', { defaultValue: "No marketplace listing found for this account yet — invites carry your listing, so they'll switch on once your coach application is approved." })}
          </div>
        )}
        <label style={{ display: 'block', marginTop: 14 }}>
          <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>{tr('coach:addClient.inviteLabel', { defaultValue: 'Invite a member on Shape' })}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('coach:addClient.searchPlaceholder', { defaultValue: 'Search members by name…' })} autoComplete="off"
            style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '10px 12px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' }} />
        </label>
        {searching && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:common.searching', { defaultValue: 'Searching…' })}</div>}
        {!searching && results && results.length === 0 && (
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:addClient.noMembers', { defaultValue: 'No members match — share your listing link instead.' })}</div>
        )}
        {!searching && (results || []).map((p) => (
          <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
            {FA
              ? <FA size={34} c={teal} initial={(p.name || 'M').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()} photo={p.avatar || undefined} showRank={false} />
              : <span style={{ width: 34, height: 34, borderRadius: 10, background: teal, color: '#06110e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 800 }}>{(p.name || 'M').slice(0, 1).toUpperCase()}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:addClient.member', { defaultValue: 'Member' })}</div>
            </div>
            {invited[inviteKey(p.userId)] === 'ok'
              ? <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: teal }}>{tr('coach:addClient.invited', { defaultValue: 'Invited ✓' })}</span>
              : invited[inviteKey(p.userId)] === 'noTag'
                ? <button onClick={() => invite(p)} disabled={!!busyId} style={{ minHeight: 34, padding: '8px 12px', background: 'transparent', border: `1px dashed ${t.AMBER || heat}`, color: t.AMBER || heat, cursor: busyId ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: busyId ? 0.6 : 1 }}>{busyId === p.userId ? tr('coach:common.sending', { defaultValue: 'Sending…' }) : tr('coach:addClient.retryTag', { defaultValue: 'Retry 0% tag' })}</button>
                : <button onClick={() => invite(p)} disabled={!!busyId} style={{ minHeight: 34, padding: '8px 14px', border: 0, background: heat, color: t.isLight ? '#fff' : '#0c0a08', cursor: busyId ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)', opacity: busyId ? 0.6 : 1 }}>{busyId === p.userId ? tr('coach:common.sending', { defaultValue: 'Sending…' }) : tr('coach:addClient.invite', { defaultValue: 'Invite' })}</button>}
          </div>
        ))}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:addClient.sendLabel', { defaultValue: 'Send your link' })}</div>
          {/* The honest pitch — incl. the waitlist qualifier — renders ONLY
              with a REAL ref token. When the token is confirmed unavailable
              (signed out / no listing / pre-migration) the plain URL still
              shares, but the copy says the truth: those links can't attribute,
              so the 0% promise never sits over an untagged link. */}
          {refToken ? (
            <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `3px solid ${heat}`, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK70, lineHeight: 1.6 }}>
              {tr('coach:addClient.byoPitch', { defaultValue: 'Clients you bring pay no Shape commission — you keep your full rate. They join Shape as members at $5/mo. Members already in your Shape waiting room count as Shape-found.' })}
            </div>
          ) : linkReady ? (
            <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `3px solid ${t.AMBER || heat}`, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK70, lineHeight: 1.6 }}>
              {tr('coach:addClient.noTagNote', { defaultValue: 'The 0% tag isn’t available right now — links sent from here will count as Shape-found.' })}
            </div>
          ) : null}
          {/* Monochrome typographic glyphs only (︎ pins text presentation) —
              never colored emoji, per the AGENTS.md new-additions rule. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {[
              { key: 'email', glyph: '✉︎', label: tr('coach:addClient.emailIt', { defaultValue: 'Email it' }), onTap: emailIt },
              { key: 'text', glyph: '✆︎', label: tr('coach:addClient.textIt', { defaultValue: 'Text it' }), onTap: textIt },
              { key: 'share', glyph: '↗︎', label: tr('coach:addClient.shareCopy', { defaultValue: 'Share / copy' }), onTap: shareListing },
            ].map((ch) => (
              <button key={ch.key} onClick={ch.onTap} disabled={!linkReady} style={{ flex: 1, minHeight: 44, cursor: linkReady ? 'pointer' : 'default', padding: '10px 6px', border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: linkReady ? 1 : 0.45 }}>
                {ch.glyph} {ch.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{ marginTop: 10, background: 'transparent', border: 0, cursor: 'pointer', padding: '12px 4px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:common.close', { defaultValue: 'Close' })}</button>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

function BSTrainerClients() {
  const t = useBS();
  const tr = useShapeTr();
  const [previewClient, setPreviewClient] = useStateBSP(null);
  const [fullClient, setFullClient] = useStateBSP(null);
  const [roster, setRoster] = useStateBSP('active'); // 'active' | 'past'
  const [cQuery, setCQuery] = useStateBSP('');
  const [cFilter, setCFilter] = useStateBSP('all');
  const [needsYou, setNeedsYou] = useStateBSP(false);
  const COACH_CLIENTS = useBSProRoster('trainer'); // demo → live roster when signed in
  const shownClients = COACH_CLIENTS
    .filter(c => roster === 'active' ? c.active : !c.active)
    .filter(c => bsClientMatchesFilter(c, cFilter, 'trainer'))
    .filter(c => !needsYou || bsRowSeverity(c, 'trainer').rank <= 1)
    .filter(c => bsClientMatchesQuery(c, cQuery));
  const activeCount = COACH_CLIENTS.filter(c => c.active).length;
  const pastCount = COACH_CLIENTS.length - activeCount;
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id);
  if (fullClient) {
    return <BSProClientFullProfilePage client={fullClient} onBack={() => setFullClient(null)} />;
  }
  if (previewClient) {
    return (
      <BSProClientPreviewPage
        client={previewClient}
        onBack={() => setPreviewClient(null)}
        onViewFullProfile={() => {
          setFullClient(previewClient);
          setPreviewClient(null);
        }}
      />
    );
  }
  return (
    <BSProRosterView
      role="trainer"
      clients={shownClients}
      activeCount={activeCount}
      pastCount={pastCount}
      totalCount={COACH_CLIENTS.length}
      newThisMonth={signedIn ? 0 : 3}
      roster={roster}
      setRoster={setRoster}
      query={cQuery}
      setQuery={setCQuery}
      filter={cFilter}
      setFilter={setCFilter}
      needsYou={needsYou}
      setNeedsYou={setNeedsYou}
      onOpen={(c) => setFullClient(c)}
      footerLeft={tr('coach:common.coachEdition', { defaultValue: 'The Coach Edition' })}
      footerRight={tr('coach:nav.clients', { defaultValue: 'Clients' })}
    />
  );
}

function BSProClientPreviewPage({ client, onBack, onViewFullProfile }) {
  const t = useBS();
  const tr = useShapeTr();
  if (!client) return null;
  return (
    <BSPage>
      <BSPageHeader kicker={tr('coach:preview.kicker', { defaultValue: 'Section · Roster' })} title={<>{tr('coach:preview.titleA', { defaultValue: 'Client' })}<br/>{tr('coach:preview.titleB', { defaultValue: 'preview.' })}</>} onBack={onBack} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, alignItems: 'center', padding: `${t.rowY + 6}px 0`, borderBottom: `1px solid ${t.HAIR}` }}>
          <BSFacetAvatar size={36} c={client.c} initial={client.i} name={client.n} photo={client.avatarUrl || client.avatar || undefined} showRank={false} />
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK }}>{client.n}</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{client.r}</div>
          </div>
        </div>
        <div style={{ padding: `${t.rowY + 8}px 0`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10 }}>
            <BSEyebrow>{tr('coach:preview.lastSeen', { defaultValue: 'Last seen' })}</BSEyebrow>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{client.d || '—'}</div>
          </div>
          <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10 }}>
            <BSEyebrow>{tr('coach:preview.status', { defaultValue: 'Status' })}</BSEyebrow>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{client.s || tr('coach:preview.onTrack', { defaultValue: 'On track' })}</div>
          </div>
          <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10 }}>
            <BSEyebrow>{tr('coach:preview.tier', { defaultValue: 'Tier' })}</BSEyebrow>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{(client.r || '').split('·')[0]?.trim() || 'Build'}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: `12px ${t.padX}px 18px` }}>
        <button onClick={onViewFullProfile} style={{ width: '100%', border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '12px 14px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 900 }}>
          {tr('coach:preview.viewFull', { defaultValue: 'View full profile →' })}
        </button>
      </div>
      <BSFooter left={tr('coach:preview.footer', { defaultValue: 'Client preview' })} right={client.n} />
    </BSPage>
  );
}

// ── Shared chrome for the coach action pages (Adjust program / Schedule) ──────
function bsProAccent(t, role) { return role === 'nutritionist' ? '#d8b25a' : (t.isLight ? '#0a8f87' : '#34d6c5'); }
// ROLE heat for the coach ledger surfaces (spec: trainer rust is ONE literal
// on all papers; nutritionist gold is a light/dark pair). bsProAccent (teal)
// stays the ACTION accent for the action pages — heat ≠ accent.
function bsProHeat(t, role) { return role === 'nutritionist' ? (t.isLight ? '#a07a2e' : '#d8b25a') : '#c0533b'; }
// ── Open Ledger catalogue primitives (Plans tab, both roles — spec §1) ──
// Typographic index: mono 9.5/800 items, active = ink + 2px page-teal
// underline (the roster's filter-index grammar, BSProRosterView §B.3).
function bsProTypoIndex(t, items, activeKey, onPick, { ariaLabel = 'Sections' } = {}) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  return (
    <div role="tablist" aria-label={ariaLabel} className="bs-hide-scroll" style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${t.INK}12`, overflowX: 'auto' }}>
      {items.map(([k, l]) => {
        const on = activeKey === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onPick(k)} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, borderBottom: on ? `2px solid ${teal}` : '2px solid transparent', cursor: 'pointer', padding: '0 1px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: on ? t.INK : t.INK50, whiteSpace: 'nowrap' }}>{l}</button>
        );
      })}
    </div>
  );
}
// Dot-leader catalogue row: mono index · serif name · leader · mono price ·
// ASSIGN heat-underlined action; meta subline. Row tap = onOpen.
function BSProCatRow({ index, name, meta, price, onOpen, onAssign, heat, t }) {
  const tr = useShapeTr();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'center', minHeight: 52, padding: '13px 0', borderTop: `1px solid ${t.INK}12` }}>
      <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>{String(index + 1).padStart(2, '0')}</span>
      <button type="button" onClick={onOpen} aria-label={tr('coach:plans.openAria', { defaultValue: 'Open {name}', name })} style={{ minWidth: 0, textAlign: 'left', background: 'transparent', border: 0, cursor: onOpen ? 'pointer' : 'default', padding: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span aria-hidden style={{ flex: 1, minWidth: 18, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} />
          {price && <span style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.04em', color: t.INK, whiteSpace: 'nowrap' }}>{String(price).toUpperCase()}</span>}
        </span>
        {meta && <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{meta}</span>}
      </button>
      {onAssign && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAssign(); }} aria-label={tr('coach:plans.assignAria', { defaultValue: 'Assign {name} to a client', name })} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: t.INK, padding: '0 2px' }}>
          <span style={{ borderBottom: `2px solid ${heat}`, paddingBottom: 2 }}>{tr('coach:plans.assign', { defaultValue: 'ASSIGN' })}</span>
        </button>
      )}
    </div>
  );
}
// Text action: ink + heat underline (mono:false) or plain mono (mono:true).
function BSProTextAction({ label, onClick, heat, t, mono = false }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: mono ? t.INK50 : t.INK }}>
      <span style={mono ? undefined : { borderBottom: `2px solid ${heat}`, paddingBottom: 2 }}>{label}</span>
    </button>
  );
}
// ── Shared catalogue ledger furniture (Plans tab, both roles — extracted so the
// trainer + nutrition copies can't drift). Deps (t, heat, flash) come in as args.
// Station head (heat tick + eyebrow) with an optional trailing mono control.
function bsProStationHead(t, heat, label, trailing) {
  const StationHead = typeof window !== 'undefined' ? window.BSTStationHead : null;
  return (
    <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      {StationHead ? <StationHead heat={heat} INK={t.INK} label={label} /> : <span />}
      {trailing || null}
    </div>
  );
}
// Trailing mono control (SORT · POPULAR → / NEW →) — plain mono button, 44px target.
function bsProMonoTrail(t, label, onClick) {
  return (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50, whiteSpace: 'nowrap', padding: '0 2px' }}>{label}</button>
  );
}
// Verdict lead for a TOP feature (unboxed): mono eyebrow · serif headline w/
// heat-italic last word · mono meta · EDIT · DUPLICATE · SHARE → actions.
function bsProFeatureLead(t, heat, eyebrow, headA, headB, meta, actions) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{eyebrow}</div>
      <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{headA} <span style={{ fontStyle: 'italic', color: heat }}>{headB}</span></div>
      <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50 }}>{meta}</div>
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 18 }}>{actions}</div>
    </div>
  );
}
// Enrolled row (borderless): serif plan · dotted leader · {n} on it · facepiles.
function bsProEnrolledRow(t, flash, e, i) {
  return (
    <button key={i} type="button" onClick={() => flash(coachTr('coach:plans.enrolledFlash', { defaultValue: '{count} clients on {prog}', count: e.n, prog: e.prog }))} aria-label={coachTr('coach:plans.enrolledAria', { defaultValue: '{prog}, {count} clients enrolled', prog: e.prog, count: e.n })} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 0, borderTop: `1px solid ${t.INK}12`, cursor: 'pointer', padding: '13px 0', minHeight: 52 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.prog}</span>
        <span aria-hidden style={{ flex: 1, minWidth: 18, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} />
        <span style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.04em', color: t.INK, whiteSpace: 'nowrap' }}>{coachTr('coach:plans.onIt', { defaultValue: '{count} ON IT', count: e.n })}</span>
      </span>
      <span style={{ display: 'flex', marginTop: 7 }}>
        {e.who.map(([ini, col], j) => (
          <span key={j} style={{ marginLeft: j ? -7 : 0, width: 22, height: 22, borderRadius: 999, background: col, color: '#fff', border: `1.5px solid ${t.PAPER}`, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: 800 }}>{ini}</span>
        ))}
      </span>
    </button>
  );
}
// The standing masthead row (logo + Vol·No) for pros pages with fully custom
// headers — withCorners adds the coach corner cluster (search + self avatar).
// The canonical corner cluster for pages whose header is BSMasthead/BSPageHeader
// (those embed their own logo + Vol·No row and take the corner as ).
function bsProCorner() {
  const size = (typeof window !== 'undefined' && window.BS_HEADER_AVATAR) || 34;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: BS_CORNER_GAP }}>
      {typeof window !== 'undefined' && window.BSSearchCorner ? React.createElement(window.BSSearchCorner, { size }) : null}
      <BSProAvatarButton size={size} />
    </span>
  );
}
// The one masthead row for every coach page. The row itself is identical
// everywhere; `corners` is the ONE documented exception, and it takes an options
// object rather than a positional flag so a stray `.map()` index can never strip
// the cluster by accident.
//
// ⚠ The two corner controls fail in DIFFERENT ways, so "search is safe" says
// nothing about the avatar — an earlier revision of this comment claimed exactly
// that and the draft editors shipped a data-loss path because of it:
//   ⌕  opens a SIBLING overlay (`{showSearch && <BSUniversalSearch/>}` in each
//      shell's main return) — the page under it stays mounted.
//   ◉  dispatches shape:openProSettings, and the shell answers by EARLY-RETURNING
//      <BSSettings>. The whole tab tree unmounts, so any local React state is
//      gone and back only restores {tab}.
// Pass `corners: false` where the page holds unsaved input the avatar would
// discard, or where an early return above `showSettings` makes both controls
// unreachable (see BSStShell).
function bsProMastRow({ corners = true } = {}) {
  const MastRow = typeof window !== 'undefined' ? window.BSMastRow : null;
  if (!MastRow) return null;
  // The corner cluster is bsProCorner()'s, so every page that goes through this
  // helper shares one definition. ⚠ Not the whole file: BSProToday's masthead
  // keeps its own inline cluster because it is genuinely different — it binds
  // onClick={onProfile} rather than BSProAvatarButton's shape:openProSettings
  // dispatch, and resolves tier/initials from different sources. Unifying it is
  // a handler change, not a duplication cleanup, so it needs its own decision.
  return <MastRow trailing={bsProCorner()} />;
}
// Action-page heat = the CLIENT's member tier (spec §2) — same resolution the
// Case File uses (getUserPoints → bsTierForPoints → bsTierColor); role heat
// until known / for demo rows.
function useBSProClientHeat(t, role, clientUid) {
  const [tier, setTier] = useStateBSP(null);
  useEffectBSP(() => {
    setTier(null);
    if (!clientUid || !window.ShapeProfiles?.getUserPoints) return undefined;
    let on = true;
    window.ShapeProfiles.getUserPoints([clientUid])
      .then((map) => { const pts = map && map[clientUid]; if (on && pts != null && window.bsTierForPoints) setTier(window.bsTierForPoints(pts)); })
      .catch(() => {});
    return () => { on = false; };
  }, [clientUid]);
  return tier && window.bsTierColor ? window.bsTierColor(tier) : bsProHeat(t, role);
}
function BSProActionHead({ eyebrow, titleA, titleB, accent, onBack }) {
  const t = useBS();
  return (
    <div style={{ paddingTop: BS_MAST_TOP_CSS }}>
      {/* corners: false — all three consumers (Adjust · Schedule · Assign) are
          forms that commit on an explicit action, so the self avatar would
          unmount an un-applied one. ← BACK is the way out. */}
      {bsProMastRow({ corners: false })}
      {/* Universal back row — ← BACK left, eyebrow right (owner call 2026-07-14). */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <BSBackButton onClick={onBack} />
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{eyebrow}</div>
      </div>
      <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>{titleA} <span style={{ fontStyle: 'italic', color: accent }}>{titleB}</span></div>
    </div>
  );
}
function BSProClientMini({ client, heat }) {
  const t = useBS();
  const tr = useShapeTr();
  if (!client) return null;
  const prog = client.prog || (client.r || '').split('·')[0].trim() || tr('coach:common.program', { defaultValue: 'Program' });
  return (
    <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${heat || t.INK}`, padding: '4px 0 4px 12px' }}>
      <BSFacetAvatar size={38} c={client.c} initial={client.i} name={client.n} photo={client.avatarUrl || client.avatar || undefined} showRank={false} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{client.n}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{prog}{client.week != null && client.weeks != null ? tr('coach:common.weekOf', { defaultValue: ' · Week {week} of {weeks}', week: client.week, weeks: client.weeks }) : ''}</div>
      </div>
    </div>
  );
}
function BSProActionSec({ eyebrow, title, trailing, accent }) {
  const t = useBS();
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden style={{ width: 8, height: 2, background: accent }} />
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{eyebrow} · {title}</span>
        </span>
        {trailing}
      </div>
      <div aria-hidden style={{ marginTop: 7, height: 1, background: `linear-gradient(90deg, ${t.INK}, ${accent} 70%, transparent)` }} />
    </div>
  );
}
function BSProChips({ options, value, multi, onPick, accent }) {
  const t = useBS();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const on = multi ? (value || []).includes(o.k) : value === o.k;
        return <button key={o.k} onClick={() => onPick(o.k)} style={{ borderRadius: 999, padding: '9px 15px', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : 'transparent', color: on ? accent : t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{o.l}</button>;
      })}
    </div>
  );
}
function BSProSegment({ options, value, onPick, accent }) {
  const t = useBS();
  return (
    <div style={{ display: 'flex', gap: 6, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 6 }}>
      {options.map(o => {
        const on = value === o.k;
        return <button key={o.k} onClick={() => onPick(o.k)} style={{ flex: 1, borderRadius: 10, padding: '11px 6px', cursor: 'pointer', border: 0, background: on ? accent : 'transparent', color: on ? '#06231f' : t.INK70, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{o.l}</button>;
      })}
    </div>
  );
}
function BSProStepper({ label, sub, value, set, min = 1, max = 14, step = 1, unit = '', accent }) {
  const t = useBS();
  const rnd = (txt, on) => <button onClick={on} style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>{txt}</button>;
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: accent }}>{label}</div>
        <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {rnd('−', () => set(Math.max(min, value - step)))}
        <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 600, color: t.INK, minWidth: 24, textAlign: 'center' }}>{value}{unit}</span>
        {rnd('+', () => set(Math.min(max, value + step))) }
      </div>
    </div>
  );
}

function BSProAdjustProgram({ client, role = 'trainer', clientUid, onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const accent = useBSProClientHeat(t, role, clientUid);
  const isNutri = role === 'nutritionist';
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const gold = '#d8b25a';
  const rust = t.RUST;
  const first = (client?.n || tr('coach:common.there', { defaultValue: 'there' })).split(' ')[0];
  // Trainer state
  const [intensity, setIntensity] = useStateBSP('progress');
  const [sessions, setSessions] = useStateBSP(4);
  const [weeks, setWeeks] = useStateBSP(6);
  const [focus, setFocus] = useStateBSP(['strength', 'hypertrophy']);
  const DAY_OPTS = ['Push day', 'Pull day', 'Legs day', 'Upper day', 'Lower day', 'Conditioning', 'Rest'];
  const [days, setDays] = useStateBSP(['Push day', 'Pull day', 'Legs day', 'Rest', 'Push day', 'Pull day', 'Rest']);
  // Nutritionist state
  const [calories, setCalories] = useStateBSP(2100);
  const [protein, setProtein] = useStateBSP(170);
  const [carbs, setCarbs] = useStateBSP(190);
  const [fat, setFat] = useStateBSP(62);
  const [meals, setMeals] = useStateBSP(4);
  const [refeed, setRefeed] = useStateBSP(true);
  const [restrictions, setRestrictions] = useStateBSP(['dairy-light']);
  // Shared
  const [noteText, setNoteText] = useStateBSP(null);
  const [status, setStatus] = useStateBSP('');
  // A guardrail rejection is an ANSWER, not an error (SPEC-guardrails.md §9.4):
  // held here with the boundary's own words so the coach can read the reason
  // and decide. Nothing else in the Apply runs while a regeneration is blocked.
  const [blocked, setBlocked] = useStateBSP(null); // {weekStartISO, copy, reason}
  const [reasonText, setReasonText] = useStateBSP('');
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  // Seed the controls from the last-applied adjustment so reopening the page
  // shows what's currently in effect for this client (coach-writable store).
  // The note is left to auto-regenerate from the seeded values.
  useEffectBSP(() => {
    let alive = true;
    if (!clientUid || !window.ShapeProgramApi?.get) return undefined;
    window.ShapeProgramApi.get(clientUid).then((rec) => {
      if (!alive || !rec) return;
      const d = isNutri ? rec.detail?.nutrition : rec.detail?.training;
      if (!d) return;
      if (isNutri) {
        if (d.calories != null) setCalories(d.calories);
        if (d.protein != null) setProtein(d.protein);
        if (d.carbs != null) setCarbs(d.carbs);
        if (d.fat != null) setFat(d.fat);
        if (d.meals != null) setMeals(d.meals);
        if (typeof d.refeed === 'boolean') setRefeed(d.refeed);
        if (Array.isArray(d.restrictions)) setRestrictions(d.restrictions);
      } else {
        if (d.intensity) setIntensity(d.intensity);
        if (d.sessions != null) setSessions(d.sessions);
        if (d.weeks != null) setWeeks(d.weeks);
        if (Array.isArray(d.focus)) setFocus(d.focus);
        if (Array.isArray(d.days)) setDays(d.days);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Trainer derived
  const intensityDesc = { deload: tr('coach:adjust.descDeload', { defaultValue: 'Pull volume back ~40% and cap intensity. Recover and resensitize.' }), maintain: tr('coach:adjust.descMaintain', { defaultValue: 'Hold volume and loads — keep the engine ticking, no new stress.' }), progress: tr('coach:adjust.descProgress', { defaultValue: 'Add a set to main lifts and nudge top-set loads. Keep RPE ≤ 8.' }) }[intensity];
  const focusOpts = [{ k: 'strength', l: tr('coach:adjust.focusStrength', { defaultValue: 'Strength' }) }, { k: 'hypertrophy', l: tr('coach:adjust.focusHypertrophy', { defaultValue: 'Hypertrophy' }) }, { k: 'conditioning', l: tr('coach:adjust.focusConditioning', { defaultValue: 'Conditioning' }) }, { k: 'mobility', l: tr('coach:adjust.focusMobility', { defaultValue: 'Mobility' }) }, { k: 'power', l: tr('coach:adjust.focusPower', { defaultValue: 'Power' }) }];
  const toggleFocus = (k) => setFocus(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  const cycleDay = (i) => setDays(d => d.map((v, j) => j === i ? DAY_OPTS[(DAY_OPTS.indexOf(v) + 1) % DAY_OPTS.length] : v));
  const focusLabel = focus.map(k => focusOpts.find(o => o.k === k)?.l.toLowerCase()).filter(Boolean).join(' + ') || tr('coach:adjust.generalFitness', { defaultValue: 'general fitness' });
  const verb = intensity === 'progress' ? tr('coach:adjust.verbProgress', { defaultValue: 'progressing top sets' }) : intensity === 'deload' ? tr('coach:adjust.verbDeload', { defaultValue: 'deloading this week' }) : tr('coach:adjust.verbMaintain', { defaultValue: 'maintaining volume' });
  // Nutritionist derived
  const restrictOpts = [{ k: 'vegetarian', l: tr('coach:adjust.restrictVegetarian', { defaultValue: 'Vegetarian' }) }, { k: 'dairy-light', l: tr('coach:adjust.restrictDairyLight', { defaultValue: 'Dairy-light' }) }, { k: 'gluten-free', l: tr('coach:adjust.restrictGlutenFree', { defaultValue: 'Gluten-free' }) }, { k: 'egg-free', l: tr('coach:adjust.restrictEggFree', { defaultValue: 'Egg-free' }) }, { k: 'nut-free', l: tr('coach:adjust.restrictNutFree', { defaultValue: 'Nut-free' }) }, { k: 'halal', l: tr('coach:adjust.restrictHalal', { defaultValue: 'Halal' }) }];
  const toggleRestrict = (k) => setRestrictions(r => r.includes(k) ? r.filter(x => x !== k) : [...r, k]);
  const kcalFromMacros = protein * 4 + carbs * 4 + fat * 9;
  const kcalDiff = kcalFromMacros - calories;
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9, mTot = (pK + cK + fK) || 1;

  const autoNote = isNutri
    ? tr('coach:adjust.noteNutri', { defaultValue: 'Updated your plan to {calories} kcal — {protein}g protein, {carbs}g carbs, {fat}g fat across {meals} meals.{refeed} New targets are live in your Eat tab.', calories, protein, carbs, fat, meals, refeed: refeed ? tr('coach:adjust.noteRefeed', { defaultValue: ' Keeping the weekend refeed to support training.' }) : '' })
    : tr('coach:adjust.noteTrainer', { defaultValue: 'Adjusting your block: {sessions}×/week, {verb}. Focus stays on {focus}. Check the updated split in your Train tab.', sessions, verb, focus: focusLabel });
  const body = noteText == null ? autoNote : noteText;
  const apply = async (notify, ack) => {
    const who = (client && (client.n || client.name)) || tr('coach:common.thisClient', { defaultValue: 'this client' });
    if (!(await window.bsAskConfirm({
      title: isNutri ? tr('coach:adjust.confirmTitleNutri', { defaultValue: 'Update nutrition targets?' }) : tr('coach:adjust.confirmTitleTrainer', { defaultValue: 'Update training program?' }),
      name: who,
      message: isNutri
        ? tr('coach:adjust.confirmMsgNutri', { defaultValue: "This overwrites this client's live nutrition targets (calories + macros) on their Eat tab. It takes effect immediately." })
        : tr('coach:adjust.confirmMsgTrainer', { defaultValue: "This overwrites this client's live training program on their Train tab. It takes effect immediately." }),
      confirmLabel: tr('coach:adjust.confirmApply', { defaultValue: 'Apply changes' }),
    }))) return;
    setStatus('saving');
    try {
      // 1a) TRAINING: regenerate the client's REAL upcoming rows first
      //     (spec #1707) — the deck, calendar, and website then read the same
      //     adjusted plan from the same rows. A regeneration failure aborts
      //     honestly (detail/note only land after the rows do); pre-migration
      //     it degrades to the detail+note behavior below.
      let regenGen = null;
      if (!isNutri && clientUid && window.ShapeAdjustRegen?.apply) {
        const regen = await window.ShapeAdjustRegen.apply({
          clientId: clientUid,
          adjustment: { intensity, sessions, weeks, days },
          acknowledgment: ack || null,
        });
        // ⚠ A GUARDRAIL REJECTION STOPS THE WHOLE APPLY — it must not fall
        // through to the detail/note writes below. Those are what the client
        // actually reads, so persisting them over a regeneration the boundary
        // refused would tell the client their program changed when not one of
        // their rows moved. Held, surfaced, and never absorbed into a success.
        if (regen?.rejected) {
          // ⚠ CARRY THE NOTIFY CHOICE THAT TRIGGERED THE HOLD. "Publish anyway"
          // replays this apply, and it used to pass `false` unconditionally — so
          // a coach who tapped Apply & Notify, got held, then overrode, changed
          // the client's Train tab and NOBODY TOLD THE CLIENT. The override is a
          // decision about the guardrail, not about notification.
          //
          // Spread over an object rather than `|| null` so a rejection with no
          // blocking week still RENDERS (the panel's default copy). Clearing the
          // status with nothing on screen is the silent refusal §9.4 forbids.
          setBlocked({ ...(regen.blocking || {}), notify: notify === true });
          setStatus('');
          return;
        }
        setBlocked(null);
        // Keep the generation whenever the regeneration path ran (changed OR
        // a no-op re-apply returning the CURRENT gen) so the display guard
        // never lapses on already-baked rows; only the degraded
        // (pre-migration) path leaves gen absent.
        if (regen?.gen != null && regen.gen > 0) regenGen = regen.gen;
        if (regen?.changed && regen.capped) window.__bsToast?.(tr('coach:adjust.trimmed', { defaultValue: 'Extension hit the plan bound — trimmed to fit.' }), 'warn');
      }
      // 1b) Persist the adjustment to the client's coach-writable program record.
      //    This is what actually "takes effect" — the client app reads it back
      //    and reflects it on their Train / Eat tabs. Only on Apply, never on tap.
      if (clientUid && window.ShapeProgramApi?.set) {
        const now = new Date().toISOString();
        const detail = isNutri
          ? { nutrition: { calories, protein, carbs, fat, meals, refeed, restrictions, note: body, updatedAt: now } }
          : { training: { intensity, sessions, weeks, focus, days, note: body, updatedAt: now, ...(regenGen != null ? { gen: regenGen } : {}) } };
        try { await window.ShapeProgramApi.set({ userId: clientUid, detail }); }
        catch (e) {
          // After a real row rewrite the gen stamp MUST land (it's the
          // display double-scale guard) — surface the failure honestly
          // instead of sending the note over a half-applied adjustment.
          if (regenGen != null) throw e;
        }
      }
      // 2) Deliver the note to the client's 1:1 thread.
      if (clientUid && window.ShapeMessages?.getOrCreateMemberConversation) {
        const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: clientUid });
        const cid = conv?.data;
        if (cid && window.ShapeMessages?.sendMessage) await window.ShapeMessages.sendMessage({ conversationId: cid, body, metadata: { kind: isNutri ? 'plan_update' : 'program_update', notify: !!notify } });
      }
      setStatus('done');
      setTimeout(onBack, 950);
    } catch (e) {
      setStatus('error');
      // ⚠ NEVER SWALLOW THE BOUNDARY'S REASON. The rust line below says only
      // "Couldn't send — try again", which is true of a network blip and
      // actively misleading for the answer that matters: a 409 means the
      // client's plan MOVED under this adjustment and NOTHING WAS WRITTEN. The
      // coach needs to know their apply was refused rather than half-applied,
      // and that applying again re-reads the plan rather than repeating a
      // doomed call.
      //
      // Only a 4xx carries a message written for a human; a 5xx is our own
      // failure and its text is not the coach's business, so that falls back to
      // the same generic line the status already renders.
      const s = e && e.status;
      const msg = (s >= 400 && s < 500 && e && e.message)
        ? e.message
        : tr('coach:adjust.sendError', { defaultValue: "Couldn't send — try again." });
      window.__bsToast?.(msg, 'warn');
    }
  };
  const cta = (txt, onClick, mt) => (
    <button onClick={onClick} disabled={status === 'saving' || status === 'done'} style={{ width: '100%', marginTop: mt || 0, borderRadius: 14, border: 0, background: teal, color: '#06231f', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: status === 'saving' ? 0.6 : 1 }}>{txt}</button>
  );
  const sendLabel = status === 'saving' ? tr('coach:common.sending', { defaultValue: 'Sending…' }) : status === 'done' ? tr('coach:adjust.sent', { defaultValue: 'Sent ✓' }) : tr('coach:adjust.applySend', { defaultValue: 'Apply & Send →' });

  const trainerBody = (
    <>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.thisWeek', { defaultValue: 'THIS WEEK' })} title={tr('coach:adjust.intensity', { defaultValue: 'Intensity' })} accent={accent} />
        <BSProSegment options={[{ k: 'deload', l: tr('coach:adjust.deload', { defaultValue: 'Deload' }) }, { k: 'maintain', l: tr('coach:adjust.maintain', { defaultValue: 'Maintain' }) }, { k: 'progress', l: tr('coach:adjust.progress', { defaultValue: 'Progress' }) }]} value={intensity} onPick={setIntensity} accent={accent} />
        <div style={{ marginTop: 14, fontFamily: t.DISPLAY, fontSize: 14.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.5 }}>{intensityDesc}</div>
      </div>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.structure', { defaultValue: 'STRUCTURE' })} title={tr('coach:adjust.frequencyBlock', { defaultValue: 'Frequency & block' })} accent={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BSProStepper label={tr('coach:adjust.sessionsWeek', { defaultValue: 'SESSIONS / WEEK' })} sub={tr('coach:adjust.perMicrocycle', { defaultValue: 'Per microcycle' })} value={sessions} set={setSessions} min={1} max={7} accent={accent} />
          <BSProStepper label={tr('coach:adjust.weeksRemaining', { defaultValue: 'WEEKS REMAINING' })} sub={tr('coach:adjust.untilReview', { defaultValue: 'Until next review' })} value={weeks} set={setWeeks} min={1} max={16} accent={accent} />
        </div>
      </div>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.emphasis', { defaultValue: 'EMPHASIS' })} title={tr('coach:adjust.focus', { defaultValue: 'Focus' })} accent={accent} />
        <BSProChips options={focusOpts} value={focus} multi onPick={toggleFocus} accent={accent} />
      </div>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.weeklySplit', { defaultValue: 'WEEKLY SPLIT' })} title={tr('coach:adjust.trainingDays', { defaultValue: 'Training days' })} trailing={<span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50, whiteSpace: 'nowrap' }}>{tr('coach:adjust.tapToChange', { defaultValue: 'TAP TO CHANGE →' })}</span>} accent={accent} />
        {days.map((label, i) => {
          const rest = label === 'Rest';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 10, alignItems: 'center', padding: '13px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: rest ? t.INK50 : accent }}>{DOW[i]}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: rest ? t.INK50 : t.INK }}>{label}</span>
              <button onClick={() => cycleDay(i)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: rest ? t.INK50 : accent, fontSize: 16, lineHeight: 1 }}>⇄</button>
            </div>
          );
        })}
      </div>
    </>
  );

  const nutriBody = (
    <>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.energy', { defaultValue: 'ENERGY' })} title={tr('coach:adjust.calorieTarget', { defaultValue: 'Calorie target' })} accent={accent} />
        <BSProStepper label={tr('coach:adjust.dailyCalories', { defaultValue: 'DAILY CALORIES' })} sub={tr('coach:adjust.kcalPerDay', { defaultValue: 'kcal / day' })} value={calories} set={setCalories} min={1000} max={5000} step={50} accent={accent} />
      </div>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.macros', { defaultValue: 'MACROS' })} title={tr('coach:adjust.dailySplit', { defaultValue: 'Daily split' })} accent={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BSProStepper label={tr('coach:adjust.protein', { defaultValue: 'PROTEIN' })} sub="" value={protein} set={setProtein} min={0} max={400} step={5} unit="g" accent={teal} />
          <BSProStepper label={tr('coach:adjust.carbs', { defaultValue: 'CARBS' })} sub="" value={carbs} set={setCarbs} min={0} max={600} step={5} unit="g" accent={gold} />
          <BSProStepper label={tr('coach:adjust.fat', { defaultValue: 'FAT' })} sub="" value={fat} set={setFat} min={0} max={250} step={2} unit="g" accent={rust} />
          <div style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '13px 15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: accent }}>{tr('coach:adjust.fromMacros', { defaultValue: 'FROM MACROS' })}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50 }}>{tr('coach:adjust.kcalUnit', { defaultValue: '{kcal} kcal', kcal: kcalFromMacros.toLocaleString(coachLocale()) })} · <span style={{ color: kcalDiff < 0 ? rust : t.INK }}>{kcalDiff >= 0 ? '+' : ''}{tr('coach:adjust.vsTarget', { defaultValue: '{diff} vs target', diff: kcalDiff })}</span></span>
            </div>
            <div style={{ marginTop: 9, display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
              <div style={{ width: `${(pK / mTot) * 100}%`, background: teal }} />
              <div style={{ width: `${(cK / mTot) * 100}%`, background: gold }} />
              <div style={{ width: `${(fK / mTot) * 100}%`, background: rust }} />
            </div>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50 }}>{protein}P · {carbs}C · {fat}F</div>
          </div>
        </div>
      </div>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.structure', { defaultValue: 'STRUCTURE' })} title={tr('coach:adjust.mealsRefeeds', { defaultValue: 'Meals & refeeds' })} accent={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BSProStepper label={tr('coach:adjust.mealsDay', { defaultValue: 'MEALS / DAY' })} sub="" value={meals} set={setMeals} min={1} max={8} accent={accent} />
          <button onClick={() => setRefeed(r => !r)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '15px 16px', cursor: 'pointer', textAlign: 'left' }}>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{tr('coach:adjust.weekendRefeed', { defaultValue: 'Weekend refeed' })}</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:adjust.refeedSub', { defaultValue: '+40g carbs on training days' })}</div>
            </div>
            <span style={{ width: 42, height: 24, borderRadius: 999, padding: 3, flexShrink: 0, border: `1px solid ${refeed ? accent : t.RULE}`, background: refeed ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: refeed ? 'flex-end' : 'flex-start' }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, background: refeed ? '#06231f' : t.INK50, display: 'block' }} />
            </span>
          </button>
        </div>
      </div>
      <div>
        <BSProActionSec eyebrow={tr('coach:adjust.constraints', { defaultValue: 'CONSTRAINTS' })} title={tr('coach:adjust.restrictions', { defaultValue: 'Restrictions' })} accent={accent} />
        <BSProChips options={restrictOpts} value={restrictions} multi onPick={toggleRestrict} accent={accent} />
      </div>
    </>
  );

  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        <BSProActionHead eyebrow={isNutri ? tr('coach:adjust.eyebrowNutri', { defaultValue: 'ADJUST PLAN' }) : tr('coach:adjust.eyebrowTrainer', { defaultValue: 'ADJUST PROGRAM' })} titleA={tr('coach:adjust.titleA', { defaultValue: 'Tune the' })} titleB={isNutri ? tr('coach:adjust.titleBNutri', { defaultValue: 'plan.' }) : tr('coach:adjust.titleBTrainer', { defaultValue: 'program.' })} accent={accent} onBack={onBack} />
        <BSProClientMini client={client} heat={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 26 }}>
          {isNutri ? nutriBody : trainerBody}
          <div>
            <BSProActionSec eyebrow={tr('coach:adjust.message', { defaultValue: 'MESSAGE' })} title={tr('coach:adjust.noteTo', { defaultValue: 'Note to {name}', name: first })} accent={accent} />
            <textarea value={body} onChange={(e) => setNoteText(e.target.value)} rows={4} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: 14, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
            <div style={{ marginTop: 14 }}>
              {cta(sendLabel, () => apply(false))}
              {cta(tr('coach:adjust.applyNotify', { defaultValue: 'Apply & Notify →' }), () => apply(true), 10)}
            </div>
            {/* The guardrail's own words, a REQUIRED reason, and an explicit
                override — the same acknowledgment path §9.4 gives a
                hand-authored week, because a regenerated one is judged on
                exactly the same terms.

                ⚠ The `coach:assign.guard*` keys are reused DELIBERATELY. This is
                one concept with one wording, and forking it into a second key
                set would let the two gated surfaces drift into describing the
                same refusal differently — in 13 locales. */}
            {blocked && (
              <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${t.AMBER}`, background: t.PAPER2, padding: '13px 14px' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.AMBER }}>{(blocked.copy && blocked.copy.chip) || tr('coach:assign.guardChip', { defaultValue: 'Held for review' })}</div>
                <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{(blocked.copy && blocked.copy.line) || tr('coach:assign.guardLine', { defaultValue: 'This week was held for review.' })}</div>
                {blocked.copy && blocked.copy.detail && (
                  <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.55, color: t.INK70 }}>{blocked.copy.detail}</div>
                )}
                {blocked.weekStartISO && (
                  <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:assign.guardWeek', { defaultValue: 'Week of {date}', date: blocked.weekStartISO })}</div>
                )}
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={3}
                  placeholder={tr('coach:assign.guardReasonPlaceholder', { defaultValue: 'Why is this week right for them?' })}
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 11, borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, padding: '9px 10px', fontFamily: t.BODY, fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
                />
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:assign.guardReasonHint', { defaultValue: 'Recorded with the week · required to publish' })}</div>
                <button
                  onClick={() => apply(blocked.notify === true, { reasonCode: 'coach_override', reasonText: reasonText.trim() })}
                  disabled={!reasonText.trim() || status === 'saving'}
                  style={{ width: '100%', marginTop: 10, borderRadius: 12, border: `1px solid ${t.AMBER}`, background: 'transparent', color: t.AMBER, padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: (!reasonText.trim() || status === 'saving') ? 0.5 : 1 }}
                >{tr('coach:assign.guardPublishAnyway', { defaultValue: 'Publish anyway' })}</button>
                <button onClick={() => { setBlocked(null); setReasonText(''); }} style={{ width: '100%', marginTop: 8, border: 0, background: 'transparent', color: t.INK50, padding: '8px', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:common.cancel', { defaultValue: 'Cancel' })}</button>
              </div>
            )}
            {status === 'error' && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST, letterSpacing: '0.08em' }}>{tr('coach:adjust.sendError', { defaultValue: "Couldn't send — try again." })}</div>}
            {clientUid
              ? <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{isNutri ? tr('coach:adjust.onApplyNutri', { defaultValue: "On apply · updates {name}'s Eat tab + sends this note", name: first }) : tr('coach:adjust.onApplyTrainer', { defaultValue: "On apply · updates {name}'s Train tab + sends this note", name: first })}</div>
              : <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:adjust.demoApplies', { defaultValue: 'Demo client · applies once linked to a live member' })}</div>}
          </div>
        </div>
      </div>
      <BSFooter left={isNutri ? tr('coach:adjust.footerNutri', { defaultValue: 'Adjust plan' }) : tr('coach:adjust.footerTrainer', { defaultValue: 'Adjust program' })} right={client?.n} />
    </BSPage>
  );
}

function BSProScheduleSession({ client, role = 'trainer', clientUid, onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const accent = useBSProClientHeat(t, role, clientUid);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const isNutri = role === 'nutritionist';
  const first = (client?.n || tr('coach:common.there', { defaultValue: 'there' })).split(' ')[0];
  const TYPES = isNutri
    ? [{ k: 'consult', l: tr('coach:schedule.typeConsult', { defaultValue: 'Consult' }) }, { k: 'plan', l: tr('coach:schedule.typePlanDelivery', { defaultValue: 'Plan delivery' }) }, { k: 'review', l: tr('coach:schedule.typeFoodLog', { defaultValue: 'Food-log review' }) }, { k: 'intro', l: tr('coach:schedule.typeIntro', { defaultValue: 'Intro call' }) }]
    : [{ k: 'session', l: tr('coach:schedule.typeSession', { defaultValue: 'Session' }) }, { k: 'checkin', l: tr('coach:schedule.typeCheckin', { defaultValue: 'Check-in' }) }, { k: 'review', l: tr('coach:schedule.typeFormReview', { defaultValue: 'Form review' }) }, { k: 'intro', l: tr('coach:schedule.typeIntro', { defaultValue: 'Intro call' }) }];
  const [type, setType] = useStateBSP(TYPES[0].k);
  const [dayIdx, setDayIdx] = useStateBSP(0);
  const [time, setTime] = useStateBSP('9:00');
  const [duration, setDuration] = useStateBSP(isNutri ? 30 : 45);
  const [mode, setMode] = useStateBSP('zoom');
  const [repeat, setRepeat] = useStateBSP(false);
  const [status, setStatus] = useStateBSP('');
  const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const dayCells = Array.from({ length: 7 }, (_, k) => { const d = new Date(today); d.setDate(today.getDate() + k); return d; });
  const sel = dayCells[dayIdx] || today;
  const times = ['7:00', '8:00', '9:00', '11:30', '14:00', '16:00', '17:00', '18:30'];
  const modeOpts = isNutri
    ? [{ k: 'zoom', l: 'Zoom' }, { k: 'call', l: tr('coach:schedule.modeCall', { defaultValue: 'Call' }) }, { k: 'inperson', l: tr('coach:schedule.modeInPerson', { defaultValue: 'In-person' }) }]
    : [{ k: 'zoom', l: 'Zoom' }, { k: 'gym', l: tr('coach:schedule.modeGym', { defaultValue: 'Gym' }) }, { k: 'call', l: tr('coach:schedule.modeCall', { defaultValue: 'Call' }) }, { k: 'inperson', l: tr('coach:schedule.modeInPerson', { defaultValue: 'In-person' }) }];
  const kindMap = { session: 'SESSION', consult: 'CONSULT', plan: 'PLAN', checkin: 'CHECKIN', review: 'REVIEW', intro: 'CONSULT' };
  const typeLabel = TYPES.find(x => x.k === type)?.l || tr('coach:schedule.typeSession', { defaultValue: 'Session' });
  const modeLabel = modeOpts.find(m => m.k === mode)?.l || 'Zoom';
  const dateStr = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`;
  const add = async () => {
    setStatus('saving');
    try {
      if (clientUid && window.ShapeCalendar?.create) {
        await window.ShapeCalendar.create({ userId: clientUid, kind: kindMap[type] || 'SESSION', title: `${typeLabel} · ${first}`, sub: repeat ? tr('coach:schedule.subWeekly', { defaultValue: '{mode} · weekly', mode: modeLabel }) : modeLabel, date: dateStr, time, durationMin: duration, with: client?.n, location: modeLabel });
      }
      setStatus('done');
      setTimeout(onBack, 950);
    } catch (e) { setStatus('error'); }
  };
  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        <BSProActionHead eyebrow={tr('coach:schedule.eyebrow', { defaultValue: 'SCHEDULE' })} titleA={tr('coach:schedule.titleA', { defaultValue: 'Book a' })} titleB={isNutri ? tr('coach:schedule.titleBNutri', { defaultValue: 'consult.' }) : tr('coach:schedule.titleBTrainer', { defaultValue: 'session.' })} accent={accent} onBack={onBack} />
        <BSProClientMini client={client} heat={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 26 }}>
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.what', { defaultValue: 'WHAT' })} title={tr('coach:schedule.sessionType', { defaultValue: 'Session type' })} accent={accent} />
            <BSProChips options={TYPES} value={type} onPick={setType} accent={accent} />
          </div>
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.when', { defaultValue: 'WHEN' })} title={tr('coach:schedule.pickDay', { defaultValue: 'Pick a day' })} accent={accent} />
            <div className="bs-hide-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {dayCells.map((d, i) => {
                const on = dayIdx === i;
                return (
                  <button key={i} onClick={() => setDayIdx(i)} style={{ flexShrink: 0, width: 52, borderRadius: 12, padding: '10px 0', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, textAlign: 'center' }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: on ? accent : t.INK50 }}>{WD[d.getDay()]}</div>
                    <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 600, color: t.INK }}>{d.getDate()}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.time', { defaultValue: 'TIME' })} title={tr('coach:schedule.openSlots', { defaultValue: 'Open slots' })} accent={accent} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {times.map(tm => {
                const on = time === tm;
                return <button key={tm} onClick={() => setTime(tm)} style={{ borderRadius: 12, padding: '12px 0', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, color: on ? accent : t.INK, fontFamily: t.MONO, fontSize: 11, fontWeight: 700 }}>{tm}</button>;
              })}
            </div>
          </div>
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.howLong', { defaultValue: 'HOW LONG' })} title={tr('coach:schedule.duration', { defaultValue: 'Duration' })} accent={accent} />
            <BSProSegment options={[{ k: 30, l: tr('coach:schedule.min30', { defaultValue: '30 min' }) }, { k: 45, l: tr('coach:schedule.min45', { defaultValue: '45 min' }) }, { k: 60, l: tr('coach:schedule.min60', { defaultValue: '60 min' }) }]} value={duration} onPick={setDuration} accent={accent} />
          </div>
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.where', { defaultValue: 'WHERE' })} title={tr('coach:schedule.mode', { defaultValue: 'Mode' })} accent={accent} />
            <BSProChips options={modeOpts} value={mode} onPick={setMode} accent={accent} />
          </div>
          <button onClick={() => setRepeat(r => !r)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '15px 16px', cursor: 'pointer', textAlign: 'left' }}>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{tr('coach:schedule.repeatWeekly', { defaultValue: 'Repeat weekly' })}</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:schedule.everyDayAt', { defaultValue: 'Every {day} at {time}', day: WD[sel.getDay()], time })}</div>
            </div>
            <span style={{ width: 42, height: 24, borderRadius: 999, padding: 3, flexShrink: 0, border: `1px solid ${repeat ? accent : t.RULE}`, background: repeat ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: repeat ? 'flex-end' : 'flex-start' }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, background: repeat ? '#06231f' : t.INK50, display: 'block' }} />
            </span>
          </button>
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.summary', { defaultValue: 'SUMMARY' })} title={tr('coach:schedule.theBooking', { defaultValue: 'The booking' })} accent={accent} />
            <div style={{ display: 'flex', gap: 20 }}>
              {[[tr('coach:schedule.day', { defaultValue: 'DAY' }), `${WD[sel.getDay()]} ${MON[sel.getMonth()]} ${sel.getDate()}`], [tr('coach:schedule.timeCol', { defaultValue: 'TIME' }), time], [tr('coach:schedule.length', { defaultValue: 'LENGTH' }), tr('coach:schedule.minUnit', { defaultValue: '{n} min', n: duration })]].map(([lab, fig]) => (
                <div key={lab} style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{lab}</div>
                  <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1, whiteSpace: 'nowrap' }}>{fig}</div>
                </div>
              ))}
            </div>
            <button onClick={add} disabled={status === 'saving' || status === 'done'} style={{ width: '100%', marginTop: 16, borderRadius: 14, border: 0, background: teal, color: '#06231f', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: status === 'saving' ? 0.6 : 1 }}>{status === 'saving' ? tr('coach:schedule.adding', { defaultValue: 'Adding…' }) : status === 'done' ? tr('coach:schedule.added', { defaultValue: 'Added ✓' }) : tr('coach:schedule.addToCalendar', { defaultValue: 'Add to calendar →' })}</button>
            {status === 'error' && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST, letterSpacing: '0.08em' }}>{tr('coach:schedule.addError', { defaultValue: "Couldn't add — try again." })}</div>}
            {!clientUid && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:schedule.demoBooks', { defaultValue: 'Demo client · books once linked to a live member' })}</div>}
          </div>
        </div>
      </div>
      <BSFooter left={tr('coach:schedule.footer', { defaultValue: 'Schedule' })} right={client?.n} />
    </BSPage>
  );
}

// ── Assign a catalogue plan to a client ──────────────────────────────────────
// The outline parsers (bsAssignExercise / bsAssignDayLine / bsAssignMeal /
// bsAssignIso) now live in ../services/planOutline.mjs — shared with the client
// Start-this-plan flow so both callers map coach_plans blocks the same way.

// The Assign page. Entered with a concrete plan (from the Plans catalogue) or
// a fixed client (from the client profile's Manage tab) — whichever half is
// missing gets an inline picker. Trainer assignments publish WEEKS through the
// one gated boundary (a weekday split fills the week; a week block or an
// exercise outline is one session per week); nutritionist assignments publish a
// client_meal_plans weekly menu. A short note lands in the client's 1:1.
function BSProAssignPage({ role = 'trainer', plan: planProp, client: clientProp, clientUid: clientUidProp, onBack, onDone }) {
  const t = useBS();
  const tr = useShapeTr();
  const accent = bsProAccent(t, role);
  const isNutri = role === 'nutritionist';
  const [plan, setPlan] = useStateBSP(planProp || null);
  const [planList, setPlanList] = useStateBSP(null);
  const [picked, setPicked] = useStateBSP(null); // { userId, name } from the live roster
  const [clientList, setClientList] = useStateBSP(null);
  const [dayIdx, setDayIdx] = useStateBSP(1);
  const [weeks, setWeeks] = useStateBSP(4);
  const [timeSel, setTimeSel] = useStateBSP(''); // '' = no set time, else 'HH:MM' (24h)
  const [status, setStatus] = useStateBSP('');
  const [disclaimer, setDisclaimer] = useStateBSP(''); // NC1 nutrition-scope disclaimer from the server
  // A guardrail rejection is an ANSWER, not an error: it is held here with the
  // boundary's own words so the coach can read the reason and decide.
  const [blocked, setBlocked] = useStateBSP(null); // {weekStartISO, copy, reason, published}
  const [reasonText, setReasonText] = useStateBSP('');
  const [queuedWeeks, setQueuedWeeks] = useStateBSP(0);
  const fixedClient = !!clientProp;
  const uid = fixedClient ? clientUidProp : (picked && picked.userId);
  const targetName = fixedClient ? (clientProp?.n || tr('coach:common.thisClient', { defaultValue: 'this client' })) : (picked ? picked.name : tr('coach:assign.aClient', { defaultValue: 'a client' }));
  const first = String(targetName).split(' ')[0];

  // Pickers — load only the half that wasn't handed in.
  useEffectBSP(() => {
    if (planProp || !window.ShapeCoachPlans?.list) return;
    window.ShapeCoachPlans.list(isNutri ? 'meal_plan' : 'program').then(rows => setPlanList(rows || [])).catch(() => setPlanList([]));
  }, []);
  useEffectBSP(() => {
    if (fixedClient || !window.ShapeAssign?.clients) { setClientList([]); return; }
    window.ShapeAssign.clients(role).then(rows => setClientList(rows || [])).catch(() => setClientList([]));
  }, []);

  // Default the weekly repeat to the plan's authored length ("6 weeks").
  useEffectBSP(() => {
    const m = String(plan?.detail?.length || plan?.meta || '').match(/(\d+)\s*(?:wk|week)/i);
    if (m) setWeeks(Math.max(1, Math.min(8, Number(m[1]))));
  }, [plan]);

  const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const today = new Date();
  const dayCells = Array.from({ length: 7 }, (_, k) => { const d = new Date(today); d.setDate(today.getDate() + k); return d; });
  // The flattened DEFAULT-menu texts, used to classify the outline below
  // (split / week block / exercises). The nutrition delivery path no longer
  // reads these — C1a routes it through bsPlanWeek so it can serve a different
  // menu per day, and the raw block OBJECTS (carrying PR E's authored method
  // steps) ride that path instead.
  // ⚠ Kept INDEX-ALIGNED with `rawBlocks` below — the flattening drops empties,
  // so filtering the two lists separately would silently pair session N's text
  // with session N+1's planned load.
  const _rawAll = (plan && plan.detail && Array.isArray(plan.detail.blocks) ? plan.detail.blocks : [])
    .map(b => ({ raw: b, text: String(((b && b.text != null) ? b.text : b) || '').trim() }))
    .filter(x => x.text);
  const blocks = _rawAll.map(x => x.text);
  // The block OBJECTS, carrying the planned-load pair the editor captured
  // (§3.2a). `blocks` is text-only and cannot reach it.
  const rawBlocks = _rawAll.map(x => (x.raw && typeof x.raw === 'object' ? x.raw : {}));
  const dayLines = blocks.map(bsAssignDayLine);
  const weekLines = blocks.map(bsAssignWeekLine);
  const isSplit = !isNutri && dayLines.filter(Boolean).length >= 3;
  // A week-block plan ("Week 1 — Accumulation" …) — what the paid-`plan` builder
  // emits. Same precedence + threshold as bsMaterializeOutline and the Listing
  // preview, so all three classify a plan identically.
  const weekBlockShape = weekLines.filter(Boolean).length >= 2;
  const isWeekBlock = !isNutri && !isSplit && weekBlockShape;
  // C0 — the NUTRITION half of the same class. `isWeekBlock` is gated on
  // `!isNutri`, so week-block detection was structurally unreachable here and
  // the isNutri branch mapped every block through bsAssignMeal — installing a
  // 7-day menu whose meals were named after the week phases ("Reset & habits",
  // "Build routine"). That is fabricated food on the client's Eat tab.
  // A week block is a coaching ARC: it states what to focus on each week and
  // contains no meals, so it must never yield a menu row. Same grammar and same
  // ≥2 threshold as training (planOutline.mjs), so both disciplines classify an
  // outline identically.
  // ⚠ This ALIGNS Assign with what the buyer-facing Listing preview already
  // does: planPreview.mjs:121 tests the week-block shape BEFORE its isNutri
  // meal branch (:144), so the preview has always shown a nutrition week block
  // as weeks. Assign was the one surface that fabricated, purely because of the
  // `!isNutri` gate above — preview, Assign and Start-this-plan now agree.
  const isNutriWeekBlock = isNutri && weekBlockShape;
  // What the arc carries that ISN'T a week — the builder's trailing
  // "Grocery + prep guide". Ruling 7: dropped from delivery, but NEVER silently.
  // It is redundant rather than impossible: bsBuildPlanGrocery already derives
  // the shop list from the assigned menu's own ingredients every week, so
  // materializing this block would mean a second, hand-authored list that can
  // disagree with the derived one.
  const droppedBlocks = isNutriWeekBlock ? blocks.filter((_, i) => !weekLines[i]) : [];
  const weekUnits = bsWeekUnits(weekLines);
  const planNote = (plan && plan.detail && plan.detail.note) || '';

  const apply = async (ack = null) => {
    if (!plan || !uid || status === 'working' || status === 'done') return;
    // C0 — an arc carries no meals, so there is nothing honest to install.
    // The CTA is already replaced by the notice below; this is the structural
    // guard, so a stale selection can never reach bsAssignMeal and it can never
    // reach the replace-confirm (which archives every published row for the
    // pair — a client's real, separately-assigned menu must survive untouched).
    if (isNutriWeekBlock) return;
    if (isNutri) {
      if (!(await window.bsAskConfirm({
        title: tr('coach:assign.replaceTitle', { defaultValue: 'Replace active meal plan?' }),
        name: targetName,
        message: tr('coach:assign.replaceMsg', { defaultValue: "This archives {name}’s current week menu and installs {plan} on their Eat tab.", name: first, plan: plan.name ? '“' + plan.name + '”' : tr('coach:assign.theNewPlan', { defaultValue: 'the new plan' }) }),
        confirmLabel: tr('coach:assign.replaceConfirm', { defaultValue: 'Replace plan' }),
      }))) return;
    }
    setStatus('working');
    setBlocked(null);
    setQueuedWeeks(0);
    let gotDisclaimer = false;
    let heldWeeks = 0;
    try {
      const start = dayCells[dayIdx];
      const monday = bsAssignMonday(start);
      if (isNutri) {
        // Menu meals from the outline lines; a block's authored method steps
        // (PR E) re-derive through bsAuthorStep on the way out — stored windows
        // can't drift from their own text — and ride the menu meal so the
        // client's Cook door opens tier-1 (bsCookableFromMeal reads meal.steps).
        // C1a — one menu per DAY. The derivation below is unchanged; only its
        // INPUT becomes per-day. bsPlanWeek is the shared normalizer the Listing
        // preview also reads through, so the week a buyer was shown and the week
        // we install cannot disagree.
        //
        // A plan with no `detail.days` gets `blocks` on all seven days — exactly
        // what the previous `Array.from({length:7}, … meals)` did — so every
        // already-published plan assigns byte-identically.
        const mealsFrom = (blockList) => (Array.isArray(blockList) ? blockList : []).map((rb) => {
          const text = String(((rb && rb.text != null) ? rb.text : rb) || '').trim();
          if (!text) return null;
          const m = bsAssignMeal(text);
          if (!m) return null;
          const ds = (rb && Array.isArray(rb.steps) ? rb.steps : [])
            .map((s) => (s && typeof s === 'object' ? bsAuthorStep(s.t, s.station) : bsAuthorStep(s, null)))
            .filter(Boolean).slice(0, 30);
          if (ds.length) m.steps = ds;
          return m;
        }).filter(Boolean);
        const calM = String((plan.detail && plan.detail.cals) || plan.meta || '').match(/(\d{3,4})/);
        const targets = calM ? { cal: Number(calM[1]) } : {};
        const days = bsPlanWeek(plan.detail).days.map(({ dow, blocks: dayBlocks }) => ({
          dow, title: plan.name, tag: 'PLAN', coachLine: planNote, targets, meals: mealsFrom(dayBlocks),
        }));
        const res = await window.ShapeAssign.mealPlan({ clientId: uid, title: plan.name, weekStart: bsAssignIso(monday), days });
        // NC1 — show the individualized-care / scope disclaimer the server returns.
        if (res && res.disclaimer) { setDisclaimer(String(res.disclaimer)); gotDisclaimer = true; }
      } else {
        // ── THE week-shaped training publish (SPEC-guardrails.md §9.4) ──
        //
        // All three training outline shapes collapse into ONE list of sessions
        // here, are grouped by the week they fall in, and go to the boundary a
        // whole week at a time. There is deliberately no per-session writer
        // left beside this one: a session-shaped path living next to the
        // week-shaped one makes the gate optional in practice, since the
        // guardrail can only judge a week it is handed whole.
        const basePayload = timeSel ? { time: timeSel } : {};
        const rows = [];
        // `block` is the AUTHORED block this session came from — it carries the
        // planned-load pair the editor stamped (§3.2a). Never re-derived here.
        const add = (date, title, description, block, exercises) => rows.push({ date, title, description, block: block || null, exercises: exercises || [] });

        if (isSplit) {
          for (let w = 0; w < weeks; w++) {
            for (let i = 0; i < dayLines.length; i++) {
              const dl = dayLines[i];
              if (!dl || dl.rest) continue;
              const d = new Date(monday); d.setDate(d.getDate() + w * 7 + dl.dow);
              if (d < start) continue;
              add(d, dl.title, planNote || plan.name, rawBlocks[i]);
            }
          }
        } else if (isWeekBlock) {
          // One session per week the coach STATED, titled by that week's phase.
          // The outline's own week numbers drive the schedule (the Weeks stepper
          // is hidden for this shape — a block's length is intrinsic). Exercises
          // are empty on purpose: the coach wrote a phase, not movements.
          for (const u of weekUnits) {
            const d = new Date(start); d.setDate(d.getDate() + (u.week - 1) * 7);
            // ⚠ Find the block that AUTHORED this week rather than trusting
            // position: bsWeekUnits dedupes and re-sorts, so its index is not
            // the outline's — pairing by index would hand one week another
            // week's planned load.
            const bi = weekLines.findIndex(wl => wl && wl.week === u.week);
            add(d, u.title || `${plan.name} · Week ${u.week}`, planNote || plan.name, bi >= 0 ? rawBlocks[bi] : null);
          }
        } else {
          // Week labels are never movements — keep them out of the exercise list.
          const exercises = blocks.filter((_, i) => !weekLines[i]).map(bsAssignExercise).filter(Boolean);
          for (let w = 0; w < weeks; w++) {
            const d = new Date(start); d.setDate(d.getDate() + w * 7);
            // No planned-load pair, by design: an exercise block has no length
            // or effort of its own (the session IS the whole week), so the
            // editor never offers the row for this shape. The week publishes
            // unstamped and the core reads `incomplete_week` → `unknown` —
            // the honest answer, not a fabricated figure.
            add(d, plan.name, planNote, null, exercises);
          }
        }

        if (!rows.length) throw new Error(tr('coach:assign.nothingToPublish', { defaultValue: 'This plan has no sessions to publish' }));

        // Grouping by week and declaring the capture stamp are the two rules
        // that fail silently, so they live in ONE tested function rather than
        // in this page: planOutline.mjs `bsAssignWeeks`.
        const publishes = bsAssignWeeks(rows, basePayload);

        // The seed is the ASSIGNMENT, not the moment it was sent. NUL joins the
        // parts because it cannot occur inside any of them — a printable
        // separator lets two different assignments compose the same seed.
        //
        // ⚠ The coach is deliberately NOT in the seed. `plan.id` is a row from
        // the coach's own owner-scoped catalogue, so it already separates two
        // coaches; and the ledger is keyed (idempotency_key, client_id) with an
        // explicit cross-coach check, so a genuine collision RAISES rather than
        // overwriting. Adding an async-resolved identity would be worse than the
        // problem: a retry before auth resolves would seed differently and mint a
        // SECOND key — the exact duplicate publish this derivation exists to stop.
        //
        // ⚠ AND IT SEEDS ON THE BLOCK OBJECTS, NOT THEIR TEXT — a rule that
        // fails silently the same way, so it lives in the same tested module:
        // planOutline.mjs `bsAssignSeed`. `blocks` is text-only and cannot
        // reach the authored planned-load pair, yet that pair is published per
        // session and is precisely what §3.2a evaluates.
        const seed = bsAssignSeed({
          clientId: uid,
          // Both: the id survives a rename, and the name is published as copy.
          planKey: plan.id || plan.name,
          planName: plan.name,
          blocks: _rawAll.map((x) => x.raw),
          note: planNote,
          startISO: bsAssignIso(start),
          weeks,
          time: timeSel,
        });
        let landed = 0;

        for (const wk of publishes) {
          const res = await window.ShapeAssign.week({
            clientId: uid,
            weekStartISO: wk.weekStartISO,
            // Derived from the assignment + this week, so a retry replays.
            idempotencyKey: bsAssignKey(`${seed}\u0000${wk.weekStartISO}`),
            ...(wk.capture ? { capture: wk.capture } : {}),
            ...(ack ? { acknowledgment: ack } : {}),
            sessions: wk.sessions,
          });

          if (res && res.stored === 'rejected') {
            // Held, not failed. Show the boundary's own words and stop — the
            // weeks already published stay published (their keys make a
            // re-run a replay), so nothing is lost by stopping here.
            setBlocked({ weekStartISO: wk.weekStartISO, copy: res.copy || null, reason: res.reason || null, published: landed });
            // A week held before this one is still held — say so rather than
            // letting the rejection swallow it.
            setQueuedWeeks(heldWeeks);
            setStatus('');
            return;
          }
          if (res && res.stored === 'lost') {
            throw new Error(tr('coach:assign.notHeld', { defaultValue: "Offline and this device couldn't hold the week — try again" }));
          }
          // Only a week the boundary actually took counts as landed. A queued
          // week is held on THIS DEVICE, and reporting it as published would be
          // the same false "saved" the old session-shaped writer used to give.
          if (res && res.stored === 'queued') heldWeeks += 1; else landed += 1;
        }
        setQueuedWeeks(heldWeeks);
      }
      // Tell the client — best-effort, the assignment already landed. Skipped
      // when a week is still held offline: the note would announce a plan that
      // is not on their Train tab yet.
      try {
        if (!heldWeeks && window.ShapeMessages?.getOrCreateMemberConversation) {
          const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: uid });
          const cid = conv?.data;
          if (cid && window.ShapeMessages?.sendMessage) await window.ShapeMessages.sendMessage({ conversationId: cid, body: isNutri ? tr('coach:assign.msgNutri', { defaultValue: "Put you on “{plan}” — it's live on your Eat tab now.", plan: plan.name }) : tr('coach:assign.msgTrainer', { defaultValue: "Put you on “{plan}” — it's live on your Train tab now.", plan: plan.name }), metadata: { kind: 'plan_assigned' } });
        }
      } catch (e) {}
      setStatus('done');
      // Keep the screen open when a compliance disclaimer was returned so the
      // coach can read it, or when a week is still held offline so they can
      // read that too; both are dismissed via the explicit Done button.
      // Otherwise auto-advance as before.
      if (!gotDisclaimer && !heldWeeks) setTimeout(() => { if (onDone) onDone(plan); else onBack(); }, 1050);
    } catch (e) { setStatus(String(e?.message || 'error')); }
  };

  const rowBtn = (key, title, sub, on, onClick) => (
    <button key={key} onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', borderRadius: 14, border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, padding: '13px 14px', cursor: 'pointer' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{title}</div>
        {sub && <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50 }}>{sub}</div>}
      </div>
      <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, color: on ? accent : t.INK50 }}>{on ? '✓' : '○'}</span>
    </button>
  );
  const emptyCard = (txt) => (
    <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.6 }}>{txt}</div>
  );
  const working = status === 'working';
  const ctaLabel = working ? tr('coach:assign.assigning', { defaultValue: 'Assigning…' }) : status === 'done' ? tr('coach:assign.assigned', { defaultValue: 'Assigned ✓' }) : tr('coach:assign.assignNotify', { defaultValue: 'Assign & notify →' });
  const timeLabel = timeSel ? (() => { const [h, m] = timeSel.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 === 0 ? 12 : h % 12; return ` · ${hh}:${String(m).padStart(2, '0')} ${ap}`; })() : '';
  const fromLabel = `${WD[dayCells[dayIdx].getDay()]} ${dayCells[dayIdx].getDate()}${timeLabel}`;
  const summaryWhen = isNutriWeekBlock
    // An arc states weeks, not a menu — say so rather than promising a replace
    // that will not happen.
    ? tr('coach:assign.whenArc', { defaultValue: '{weeks, plural, one {# week} other {# weeks}} · a coaching arc, no menu', weeks: bsWeekSpan(weekUnits) })
    : isNutri
    ? tr('coach:assign.whenNutri', { defaultValue: 'This week · replaces their current menu from you' })
    : isSplit
      ? tr('coach:assign.whenSplit', { defaultValue: '{sessions} sessions/wk · {weeks, plural, one {# week} other {# weeks}} · from {from}', sessions: dayLines.filter(d => d && !d.rest).length, weeks, from: fromLabel })
      // A week block is one session per stated week — accurate under the existing
      // "Weekly · N weeks" copy, so it reuses that key with the outline's OWN
      // length rather than the (hidden) stepper value.
      : tr('coach:assign.whenWeekly', { defaultValue: 'Weekly · {weeks, plural, one {# week} other {# weeks}} · from {from}', weeks: isWeekBlock ? bsWeekSpan(weekUnits) : weeks, from: fromLabel });

  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        {/* C0 — the heading must not promise what the arc can't deliver: with the
            "Not a menu" notice below, "Put them on a menu." would contradict it. */}
        <BSProActionHead eyebrow={tr('coach:assign.eyebrow', { defaultValue: 'ASSIGN' })} titleA={isNutriWeekBlock ? tr('coach:assign.titleAArc', { defaultValue: 'No menu' }) : tr('coach:assign.titleA', { defaultValue: 'Put them on' })} titleB={isNutriWeekBlock ? tr('coach:assign.titleBArc', { defaultValue: 'to assign.' }) : isNutri ? tr('coach:assign.titleBNutri', { defaultValue: 'a menu.' }) : tr('coach:assign.titleBTrainer', { defaultValue: 'a program.' })} accent={accent} onBack={onBack} />
        {fixedClient && <BSProClientMini client={clientProp} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 26 }}>
          {!planProp && (
            <div>
              <BSProActionSec eyebrow={tr('coach:schedule.what', { defaultValue: 'WHAT' })} title={isNutri ? tr('coach:assign.pickMealPlan', { defaultValue: 'Pick a meal plan' }) : tr('coach:assign.pickProgram', { defaultValue: 'Pick a program' })} accent={accent} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {planList == null ? emptyCard(tr('coach:assign.loadingCatalogue', { defaultValue: 'Loading your catalogue…' }))
                  : planList.length === 0 ? emptyCard(isNutri ? tr('coach:assign.noSavedMealPlans', { defaultValue: 'No saved meal plans yet — build one on the Plans tab first' }) : tr('coach:assign.noSavedPrograms', { defaultValue: 'No saved programs yet — build one on the Plans tab first' }))
                  : planList.map(p => rowBtn(p.id, p.name, p.meta, plan && plan.id === p.id, () => setPlan(p)))}
              </div>
            </div>
          )}
          {!fixedClient && (
            <div>
              <BSProActionSec eyebrow={tr('coach:schedule.who', { defaultValue: 'WHO' })} title={tr('coach:assign.pickClient', { defaultValue: 'Pick a client' })} accent={accent} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {clientList == null ? emptyCard(tr('coach:assign.loadingClients', { defaultValue: 'Loading your clients…' }))
                  : clientList.length === 0 ? emptyCard(tr('coach:assign.noLinked', { defaultValue: 'No linked members yet — clients appear here once they subscribe or book' }))
                  : clientList.map(c => rowBtn(c.userId, c.name, c.sessions ? tr('coach:assign.sessionsTogether', { defaultValue: '{count, plural, one {# session} other {# sessions}} together', count: c.sessions }) : tr('coach:assign.linkedMember', { defaultValue: 'Linked member' }), picked && picked.userId === c.userId, () => setPicked(c)))}
              </div>
            </div>
          )}
          {!isNutri && (
            <div>
              <BSProActionSec eyebrow={tr('coach:schedule.when', { defaultValue: 'WHEN' })} title={tr('coach:assign.starts', { defaultValue: 'Starts' })} accent={accent} />
              <div className="bs-hide-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {dayCells.map((d, i) => {
                  const on = dayIdx === i;
                  return (
                    <button key={i} onClick={() => setDayIdx(i)} style={{ flexShrink: 0, width: 52, borderRadius: 12, padding: '10px 0', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, textAlign: 'center' }}>
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: on ? accent : t.INK50 }}>{WD[d.getDay()]}</div>
                      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 600, color: t.INK }}>{d.getDate()}</div>
                    </button>
                  );
                })}
              </div>
              {/* A week block states its own length, so there is nothing to
                  choose — showing a Weeks stepper would let the coach pick a
                  number the plan then ignores. */}
              {!isWeekBlock && (
                <div style={{ marginTop: 12 }}>
                  <BSProStepper label={tr('coach:assign.weeks', { defaultValue: 'WEEKS' })} sub={isSplit ? tr('coach:assign.repeatsSplit', { defaultValue: 'Repeats the weekly split' }) : tr('coach:assign.repeatsSession', { defaultValue: 'Repeats the session weekly' })} value={weeks} set={setWeeks} min={1} max={8} accent={accent} />
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:assign.sessionTime', { defaultValue: 'Session time · optional' })}</div>
                <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:assign.sessionTimeHint', { defaultValue: "Set the time you've agreed with your client — it shows on their calendar & home card." })}</div>
                <div className="bs-hide-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', marginTop: 9 }}>
                  {['', '06:00', '07:00', '08:00', '09:00', '12:00', '16:00', '17:00', '17:45', '18:00', '19:00', '20:00'].map((tv) => {
                    const on = timeSel === tv;
                    const lbl = tv === '' ? tr('coach:assign.noSetTime', { defaultValue: 'No set time' }) : (() => { const [h, m] = tv.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}:${String(m).padStart(2, '0')} ${ap}`; })();
                    return (
                      <button key={tv || 'none'} onClick={() => setTimeSel(tv)} style={{ flexShrink: 0, borderRadius: 999, padding: '8px 13px', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, color: on ? accent : t.INK50, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }}>{lbl}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <div>
            <BSProActionSec eyebrow={tr('coach:schedule.summary', { defaultValue: 'SUMMARY' })} title={tr('coach:assign.theAssignment', { defaultValue: 'The assignment' })} accent={accent} />
            <div style={{ borderRadius: 16, border: `1px solid ${accent}44`, background: `linear-gradient(150deg, ${accent}16, ${t.PAPER2} 80%), ${t.PAPER2}`, padding: 16 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, color: t.INK }}>{plan ? plan.name : (isNutri ? tr('coach:assign.pickMealPlan', { defaultValue: 'Pick a meal plan' }) : tr('coach:assign.pickProgram', { defaultValue: 'Pick a program' }))} · <span style={{ fontStyle: 'italic', color: accent }}>{first}</span></div>
              <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: accent }}>{summaryWhen}</div>
            </div>
            {/* C0 — a week block has no menu to install, so there is no assign
                action. State what it is, what to do instead, and (ruling 7)
                name anything the arc carried that isn't delivered. */}
            {isNutriWeekBlock ? (
              <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${t.AMBER}`, background: t.PAPER2, padding: '13px 14px' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.AMBER }}>{tr('coach:assign.arcEyebrow', { defaultValue: 'Not a menu' })}</div>
                <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{tr('coach:assign.arcTitle', { defaultValue: 'This program describes weeks, not meals.' })}</div>
                <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.55, color: t.INK70 }}>{tr('coach:assign.arcBody', { defaultValue: "It sets the focus for each week and contains no food. Assign a Diet or Meal plan to install {name}'s menu — the shop list then builds itself from those meals.", name: first })}</div>
                {droppedBlocks.length > 0 && (
                  <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:assign.arcDropped', { defaultValue: 'Not delivered · {blocks}', blocks: droppedBlocks.join(' · ') })}</div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => apply()} disabled={!plan || !uid || working || status === 'done'} style={{ width: '100%', marginTop: 14, borderRadius: 14, border: 0, background: accent, color: '#06231f', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: (!plan || !uid || working) ? 0.6 : 1 }}>{ctaLabel}</button>
                {/* A guardrail rejection is HELD, never absorbed: the boundary's
                    own words, a required reason, and an explicit override. */}
                {blocked && (
                  <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${t.AMBER}`, background: t.PAPER2, padding: '13px 14px' }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.AMBER }}>{(blocked.copy && blocked.copy.chip) || tr('coach:assign.guardChip', { defaultValue: 'Held for review' })}</div>
                    <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{(blocked.copy && blocked.copy.line) || tr('coach:assign.guardLine', { defaultValue: 'This week was held for review.' })}</div>
                    {blocked.copy && blocked.copy.detail && (
                      <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.55, color: t.INK70 }}>{blocked.copy.detail}</div>
                    )}
                    <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
                      {tr('coach:assign.guardWeek', { defaultValue: 'Week of {date}', date: blocked.weekStartISO })}
                      {blocked.published > 0 ? ` · ${tr('coach:assign.guardPublished', { defaultValue: '{count, plural, one {# week already published} other {# weeks already published}}', count: blocked.published })}` : ''}
                    </div>
                    <textarea
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      rows={3}
                      placeholder={tr('coach:assign.guardReasonPlaceholder', { defaultValue: 'Why is this week right for them?' })}
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 11, borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, padding: '9px 10px', fontFamily: t.BODY, fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
                    />
                    <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:assign.guardReasonHint', { defaultValue: 'Recorded with the week · required to publish' })}</div>
                    <button
                      onClick={() => apply({ reasonCode: 'coach_override', reasonText: reasonText.trim() })}
                      disabled={!reasonText.trim() || working}
                      style={{ width: '100%', marginTop: 10, borderRadius: 12, border: `1px solid ${t.AMBER}`, background: 'transparent', color: t.AMBER, padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: (!reasonText.trim() || working) ? 0.5 : 1 }}
                    >{tr('coach:assign.guardPublishAnyway', { defaultValue: 'Publish anyway' })}</button>
                    <button onClick={() => { setBlocked(null); setReasonText(''); }} style={{ width: '100%', marginTop: 8, border: 0, background: 'transparent', color: t.INK50, padding: '8px', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:common.cancel', { defaultValue: 'Cancel' })}</button>
                  </div>
                )}
                {/* Offline is not "sent". Say what actually happened — and say
                    it even when a LATER week was rejected, or the rejection
                    swallows the fact that earlier work is still on the device.
                    The count is reset at the start of every run, so a non-zero
                    value always describes the run the coach just made. */}
                {queuedWeeks > 0 && (
                  <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.AMBER, letterSpacing: '0.08em' }}>{tr('coach:assign.queuedWeeks', { defaultValue: "{count, plural, one {# week is held on this device} other {# weeks are held on this device}} — they publish when you're back online, and {name} hasn't been told yet", count: queuedWeeks, name: first })}</div>
                )}
                {status && status !== 'working' && status !== 'done' && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST, letterSpacing: '0.08em' }}>{tr('coach:assign.assignError', { defaultValue: "Couldn't assign — {status}", status })}</div>}
                <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                  {uid
                    ? (isNutri ? tr('coach:assign.onAssignNutri', { defaultValue: "On assign · lands on {name}'s Eat tab + sends a note", name: first }) : tr('coach:assign.onAssignTrainer', { defaultValue: "On assign · lands on {name}'s Train tab + sends a note", name: first }))
                    : fixedClient ? tr('coach:assign.demoAssigns', { defaultValue: 'Demo client · assigns once linked to a live member' }) : tr('coach:assign.pickLinked', { defaultValue: 'Pick a linked client above' })}
                </div>
              </>
            )}
            {disclaimer && (
              <div style={{ marginTop: 12, borderRadius: 12, border: `1px solid ${accent}33`, background: `${accent}10`, padding: '10px 12px', fontFamily: t.BODY, fontSize: 10.5, lineHeight: 1.5, color: t.INK }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, display: 'block', marginBottom: 4 }}>{tr('coach:assign.scopeCompliance', { defaultValue: 'Scope & compliance' })}</span>
                {disclaimer}
              </div>
            )}
            {status === 'done' && (disclaimer || queuedWeeks > 0) && (
              <button onClick={() => { if (onDone) onDone(plan); else onBack(); }} style={{ width: '100%', marginTop: 10, borderRadius: 14, border: `1px solid ${accent}`, background: 'transparent', color: accent, padding: '13px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:assign.readAck', { defaultValue: 'Read & acknowledged · done' })}</button>
            )}
          </div>
        </div>
      </div>
      <BSFooter left={tr('coach:assign.footer', { defaultValue: 'Assign' })} right={plan ? plan.name : tr('coach:assign.catalogueFooter', { defaultValue: 'Catalogue' })} />
    </BSPage>
  );
}

// Build a unified record for the AI draft from the coach-read stats rollup
// (live), or a demo record whose week shows BOTH a training and a nutrition
// signal (signed-out preview). Real values only — no field is invented.
function bsBuildDraftRecord(clientUid, stats, name) {
  // A LIVE client (real userId) NEVER falls back to demo data — a check-in must
  // be grounded only in their real signals. With no stats yet, return a bare
  // record (the engine drafts an honest "just checking in" note).
  if (clientUid) {
    const rec = { profile: { name: name || coachTr('coach:common.clientFallback', { defaultValue: 'Client' }) } };
    if (!stats) return rec;
    if (stats.sessionsPlanned != null) rec.trainingAdherence = { done: stats.sessionsCompleted || 0, planned: stats.sessionsPlanned, pct: stats.sessionsPlanned ? Math.round(((stats.sessionsCompleted || 0) / stats.sessionsPlanned) * 100) : null };
    if (stats.avgCalories != null || stats.avgProtein != null) rec.nutrition = { avgCalories: stats.avgCalories ?? null, avgProtein: stats.avgProtein ?? null, targetCalories: stats.targetCalories ?? null, targetProtein: stats.targetProtein ?? null };
    if (stats.daysLogged7d != null) rec.foodLogs = { daysLogged7d: stats.daysLogged7d };
    if (stats.weightNow != null && stats.weightStart != null) rec.weighIns = [{ on: '', weight: stats.weightStart, unit: 'lb' }, { on: '', weight: stats.weightNow, unit: 'lb' }];
    return rec;
  }
  return {
    profile: { name: name || 'Marcus Tan' },
    trainingAdherence: { done: 4, planned: 5, pct: 80 },
    streaks: { current: 6, best: 9 },
    nutrition: { avgCalories: 2150, targetCalories: 2000, avgProtein: 150, targetProtein: 175 },
    foodLogs: { daysLogged7d: 3 },
    weighIns: [{ on: '2026-04-21', weight: 184, unit: 'lb' }, { on: '2026-06-15', weight: 181, unit: 'lb' }],
  };
}

// AI-drafted check-in sheet: a grounded, cross-discipline draft the coach EDITS
// and approves. Sends via the existing ShapeMessages path; logs the draft + the
// sent version to ai_audit_log. Never auto-sends.
function BSProCheckinDraft({ clientUid, clientName, role, stats, accent, onClose }) {
  const t = useBS();
  const tr = useShapeTr();
  const first = String(clientName || tr('coach:draft.yourClient', { defaultValue: 'your client' })).split(' ')[0];
  const [draft, setDraft] = useStateBSP('');
  const [cited, setCited] = useStateBSP([]);
  const [loading, setLoading] = useStateBSP(true);
  const [sending, setSending] = useStateBSP(false);
  const [auditId, setAuditId] = useStateBSP(null);
  const record = bsBuildDraftRecord(clientUid, stats, clientName);

  useEffectBSP(() => {
    let on = true;
    (async () => {
      try {
        // LIVE client (signed-in coach): the server route is authoritative — it
        // re-checks coach scope and writes the draft to ai_audit_log. On failure
        // we surface an error rather than silently falling back to an UNAUDITED
        // client-side draft (which would bypass the scope/audit contract). The
        // DashSignals fallback is for demo / signed-out preview only.
        if (clientUid && bsProSignedIn()) {
          const r = await fetch('/api/ai/draft-message', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: clientUid, record, role }) }).catch(() => null);
          const res = r && r.ok ? await r.json().catch(() => null) : null;
          if (!on) return;
          if (res && res.draft) { setDraft(res.draft); setCited(res.cited || []); setAuditId(res.draftAuditId || null); setLoading(false); return; }
          setDraft(''); setCited([]); setAuditId(null); setLoading(false);
          window.__bsToast?.((res && res.error) || tr('coach:draft.couldNotDraft', { defaultValue: 'Could not draft check-in' }), 'err');
          return;
        }
        // Demo / signed-out fallback — the SAME grounded engine, client-side.
        const E = typeof window !== 'undefined' && window.DashSignals;
        const d = E && E.buildCheckinDraft ? E.buildCheckinDraft(record, role) : { text: '', cited: [] };
        if (on) { setDraft(d.text || ''); setCited(d.cited || []); setLoading(false); }
      } catch (e) { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [clientUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || loading) return;
    if (!clientUid) { window.__bsToast?.(tr('coach:draft.sendsWhenLinked', { defaultValue: 'Sends once this client is linked' }), 'info'); onClose(); return; }
    setSending(true);
    try {
      let cid = null;
      if (window.ShapeMessages?.getOrCreateMemberConversation) {
        const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: clientUid });
        cid = (conv && conv.data) || null;
      }
      if (cid && window.ShapeMessages?.sendMessage) {
        await window.ShapeMessages.sendMessage({ conversationId: cid, body, metadata: { kind: 'checkin', notify: true } });
        // The message is now sent. Record the SENT version for the audit trail.
        // If THIS fails the send still stands (re-sending would double-post), so
        // surface a soft warning rather than silently dropping the audit.
        let audited = false;
        try {
          const ar = await fetch('/api/ai/draft-message/sent', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: clientUid, sentText: body, draftAuditId: auditId, conversationId: cid }) });
          audited = !!(ar && ar.ok);
        } catch (e) { audited = false; }
        window.__bsToast?.(audited ? tr('coach:draft.sentTo', { defaultValue: 'Sent to {name}', name: first }) : tr('coach:draft.sentNoLog', { defaultValue: "Sent to {name} — couldn't log it", name: first }), audited ? 'ok' : 'info');
        setSending(false);
        onClose();
        return;
      }
      throw new Error('Could not send');
    } catch (e) {
      // Keep the sheet open on failure so the coach's edited message isn't lost.
      window.__bsToast?.(tr('coach:draft.couldNotSend', { defaultValue: 'Could not send — try again' }), 'err');
      setSending(false);
    }
  };

  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `12px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: t.RULE, margin: '0 auto 14px' }} />
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent }}>{tr('coach:draft.eyebrow', { defaultValue: '✦ AI draft · check-in' })}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>{tr('coach:draft.aNoteTo', { defaultValue: 'A note to' })} <span style={{ fontStyle: 'italic', color: accent }}>{first}.</span></div>
        <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50, lineHeight: 1.5 }}>{tr('coach:draft.grounded', { defaultValue: "Grounded in {name}'s real week — across training and nutrition. Edit anything; nothing sends until you tap Send.", name: first })}</div>
        {cited.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {cited.map((c, i) => (
              <span key={i} style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', color: t.INK, border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: 6, padding: '4px 8px' }}>{c.label}: <span style={{ color: accent }}>{c.value}</span></span>
            ))}
          </div>
        )}
        <textarea value={loading ? tr('coach:draft.drafting', { defaultValue: 'Drafting…' }) : draft} onChange={(e) => setDraft(e.target.value)} rows={6} disabled={loading} style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '12px 13px', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 12, outline: 'none', fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.5, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', padding: '13px 22px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('coach:common.cancel', { defaultValue: 'Cancel' })}</button>
          <button onClick={send} disabled={loading || sending || !draft.trim()} style={{ flex: 1, padding: '13px', borderRadius: 999, border: 0, background: accent, color: '#06110e', cursor: loading || sending || !draft.trim() ? 'default' : 'pointer', opacity: loading || sending || !draft.trim() ? 0.55 : 1, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{sending ? tr('coach:common.sending', { defaultValue: 'Sending…' }) : tr('coach:draft.sendButton', { defaultValue: 'Send to {name} →', name: first })}</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// The flagged-dimension float (spec §C step 2) — the weekend-adherence split,
// serialized to a zero-box station: a station head, a semantic-rust wire spine
// (the split IS a flag — always rust, never role heat), the per-dimension
// weekday-vs-weekend figures, and the one concrete move. Data verbatim from
// `get_roster_weekend_split` (ShapeRosterWeekend); plate chrome → zero-box.
function ProWeekendPlate({ split }) {
  const t = useBS();
  const tr = useShapeTr();
  if (!split || split.status !== 'ok') return null;
  const dims = split.dimensions || {};
  const present = ['nutrition', 'habits', 'training'].map((k) => [k, dims[k]]).filter(([, d]) => d);
  if (!present.length) return null;
  const worst = split.worstDimension;
  const move = worst === 'nutrition'
    ? tr('coach:case.wkndMoveNutrition', { defaultValue: 'Set a weekend check-in or a lighter weekend nutrition target.' })
    : worst === 'training'
      ? tr('coach:case.wkndMoveTraining', { defaultValue: 'Move a weekend session earlier in the day, or shift it to a weekday they hit.' })
      : worst === 'habits'
        ? tr('coach:case.wkndMoveHabits', { defaultValue: 'Add a weekend-specific habit reminder.' })
        : tr('coach:case.wkndMoveDefault', { defaultValue: 'Set one weekend anchor habit.' });
  const dimLabel = { nutrition: tr('coach:case.dimNutrition', { defaultValue: 'Nutrition' }), training: tr('coach:case.dimTraining', { defaultValue: 'Training' }), habits: tr('coach:case.dimHabits', { defaultValue: 'Habits' }) };
  return (
    <div style={{ marginTop: 22 }}>
      {window.BSTStationHead && <window.BSTStationHead heat={t.RUST} INK={t.INK} label={tr('coach:case.weekendPattern', { defaultValue: 'WEEKEND PATTERN' })} />}
      <div style={{ borderLeft: `3px solid ${t.RUST}`, padding: '2px 0 2px 11px', display: 'grid', gap: 7 }}>
        {present.map(([k, d]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK }}>{dimLabel[k]}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: d.flagged ? t.RUST : t.INK70, fontVariantNumeric: 'tabular-nums' }}>
              WK {Math.round(d.weekdayRate * 100)}% · WE {Math.round(d.weekendRate * 100)}% · {d.gapPp >= 0 ? '−' : '+'}{Math.abs(Math.round(d.gapPp))}
            </span>
          </div>
        ))}
        {worst && <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>{move}</div>}
      </div>
    </div>
  );
}

// Cycle predicted-window dates are date-only ISO strings ("2026-07-25", the
// engine's iso()); format short + localized, pinned to UTC so the calendar date
// never drifts ±1 for a viewer behind UTC. Falls back to the raw string.
function bsCycleShortDate(isoStr) {
  try {
    const d = new Date(`${String(isoStr).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return String(isoStr);
    const loc = (typeof window !== 'undefined' && window.ShapeI18n && window.ShapeI18n.intlLocale && window.ShapeI18n.intlLocale()) || 'en';
    return new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
  } catch (e) { return String(isoStr); }
}

// Pure presentational: the current month as a tick row — each day a thin bar, a
// day the member logged a period start renders as a taller filled heat mark,
// today carries a faint heat ring. Date-only strings compared as pure calendar
// dates (parts split, no timezone) so a start "on the 25th" reads on the 25th.
// `today` is the MEMBER's local calendar date (YYYY-MM-DD, from the definer) —
// used as calendar-date PARTS, never reinterpreted through a Date's timezone —
// so the month/today mark match her frame, not the coach's (Codex P2). Falls
// back to the device date only if absent. Heat-only coloring reads on any paper.
function BSCycleMonthStrip({ starts, heat, today }) {
  let y, mo, todayDay;
  if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}/.test(today)) {
    const p = today.slice(0, 10).split('-').map(Number);
    y = p[0]; mo = p[1]; todayDay = p[2];
  } else {
    const now = today instanceof Date ? today : new Date();
    y = now.getFullYear(); mo = now.getMonth() + 1; todayDay = now.getDate();
  }
  const days = new Date(y, mo, 0).getDate();  // days in the current month
  const startDays = new Set(
    (Array.isArray(starts) ? starts : [])
      .map((s) => String(s).slice(0, 10).split('-').map(Number))
      .filter((p) => p.length === 3 && p[0] === y && p[1] === mo)
      .map((p) => p[2])
  );
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 10, alignItems: 'flex-end' }}>
      {Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const isStart = startDays.has(day);
        return (
          <div key={day} style={{
            flex: 1,
            height: isStart ? 9 : 3,
            borderRadius: isStart ? 5 : 2,
            background: isStart ? heat : `${heat}2a`,
            boxShadow: day === todayDay ? `0 0 0 1px ${heat}` : 'none',
          }} />
        );
      })}
    </div>
  );
}

function BSProClientFullProfilePage({ client, onBack, role = 'trainer' }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const isNutri = role === 'nutritionist';
  const [phase, setPhase] = useStateBSP({ trainingPhase: 'Build', nutritionPhase: 'Cut' });
  // Real per-client store when the row carries a user id (uuid); otherwise the
  // selector is local (demo roster has mock clients).
  const clientUid = client && (client.userId || client.user_id || (typeof client.id === 'string' && client.id.includes('-') ? client.id : null));
  // Case File heat = the CLIENT's member tier (spec §C) — resolved from their
  // all-time points; role heat until known / for demo rows (no clientUid).
  const [clientTier, setClientTier] = useStateBSP(null);
  useEffectBSP(() => {
    setClientTier(null);
    if (!clientUid || !window.ShapeProfiles?.getUserPoints) return undefined;
    let on = true;
    window.ShapeProfiles.getUserPoints([clientUid])
      .then((map) => {
        const pts = map && map[clientUid];
        if (on && pts != null && window.bsTierForPoints) setClientTier(window.bsTierForPoints(pts));
      })
      .catch(() => {});
    return () => { on = false; };
  }, [clientUid]);
  useEffectBSP(() => {
    if (clientUid && window.ShapeProgramApi?.get) {
      window.ShapeProgramApi.get(clientUid).then(p => { if (p && (p.trainingPhase || p.nutritionPhase)) setPhase(prev => ({ ...prev, ...p })); }).catch(() => {});
    }
  }, [clientUid]);
  // The client's shared goals (read-only here) — server-gated on the share flag.
  const [cGoals, setCGoals] = useStateBSP(null);
  const [cGoalsLoaded, setCGoalsLoaded] = useStateBSP(false);
  const [showAdjust, setShowAdjust] = useStateBSP(false);
  const [showAdjustPage, setShowAdjustPage] = useStateBSP(false);
  const [showSchedulePage, setShowSchedulePage] = useStateBSP(false);
  const [showAssignPage, setShowAssignPage] = useStateBSP(false);
  const [showDraft, setShowDraft] = useStateBSP(false);
  const [showReconcile, setShowReconcile] = useStateBSP(false);
  const [view, setView] = useStateBSP('profile'); // 'profile' | 'manage'
  const [cStats, setCStats] = useStateBSP(null); // live KPI rollup (coach read)
  const [cLifts, setCLifts] = useStateBSP(null); // strength rollup (coach read)
  useEffectBSP(() => {
    if (!clientUid || !window.ShapeGoalsApi?.getForClient) return;
    window.ShapeGoalsApi.getForClient(clientUid).then(d => { setCGoals(d || null); setCGoalsLoaded(true); }).catch(() => setCGoalsLoaded(true));
  }, [clientUid]);
  useEffectBSP(() => {
    if (!clientUid || !window.ShapeClientStats?.get) return;
    window.ShapeClientStats.get(clientUid).then(d => setCStats(d || null)).catch(() => {});
    if (window.ShapeClientStats?.getLifts) window.ShapeClientStats.getLifts(clientUid).then(d => setCLifts(d || null)).catch(() => {});
  }, [clientUid]);
  // The member's SELF-AUTHORED training (v1 gap: it only surfaced via session
  // logs). Reset per client + ignore stale responses (the care-team pattern);
  // demo roster rows have no uid so this stays live-only.
  const [cSelfPlans, setCSelfPlans] = useStateBSP(null);
  useEffectBSP(() => {
    setCSelfPlans(null);
    if (!clientUid || !window.ShapeClientStats?.getSelfPlans) return undefined;
    let ignore = false;
    window.ShapeClientStats.getSelfPlans(clientUid).then(d => { if (!ignore) setCSelfPlans(Array.isArray(d) ? d : null); }).catch(() => {});
    return () => { ignore = true; };
  }, [clientUid]);
  const selfPlans = React.useMemo(
    () => bsSelfPlansSummary(cSelfPlans || [], new Date().toLocaleDateString('en-CA')),
    [cSelfPlans]
  );
  // Care team — the OTHER coach(es) on this shared client (trainer ↔ nutritionist).
  // The same overview fetch also carries the client's objective sleep (coach read).
  const [careTeam, setCareTeam] = useStateBSP(null);
  const [careLoaded, setCareLoaded] = useStateBSP(false);
  const [sleepRec, setSleepRec] = useStateBSP(null); // objective sleep + recovery
  // THE CYCLE (spec 2026-07-19) — share-gated, derived from the SAME overview
  // payload (d.cycle) so there's no second roundtrip / duplicate get_client_cycle
  // RPC. State is set ONLY for { share:true }: null (not my client),
  // { share:false }, and pre-migration all leave it null → the station renders
  // NOTHING — absence, never a padlock (a coach can't tell never-opted-in from
  // not-shared).
  const [cycleShared, setCycleShared] = useStateBSP(null);
  // PREP (PR C) — the compact { count, lastAt, days } projection off d.prep
  // (get_client_meal_prep, coach-link-gated). null → the register renders
  // NOTHING (absence, never a padlock; a coach can't tell never-preps from
  // pre-migration).
  const [prepSignal, setPrepSignal] = useStateBSP(null);
  useEffectBSP(() => {
    // Reset per client + ignore a stale response, so navigating A→B never shows
    // client A's care team / sleep / cycle / prep on client B's profile.
    setCareTeam(null); setSleepRec(null); setCycleShared(null); setPrepSignal(null); setCareLoaded(false);
    if (!clientUid || !window.ShapeCareTeam?.overview) { setCareLoaded(true); return undefined; }
    let ignore = false;
    window.ShapeCareTeam.overview(clientUid)
      .then(d => { if (ignore) return; const team = (d && Array.isArray(d.careTeam)) ? d.careTeam.filter(c => c && !c.isMe && (c.userId || c.user_id)) : []; setCareTeam(team); setSleepRec(d && d.sleep ? d.sleep : null); setCycleShared(d && d.cycle && d.cycle.share === true && Array.isArray(d.cycle.starts) ? { starts: d.cycle.starts, today: typeof d.cycle.today === 'string' ? d.cycle.today : null } : null); setPrepSignal(d && d.prep && Number(d.prep.count) > 0 ? { count: Number(d.prep.count), lastAt: Number(d.prep.lastAt) || null, days: Array.isArray(d.prep.days) ? d.prep.days : [] } : null); setCareLoaded(true); })
      .catch(() => { if (!ignore) setCareLoaded(true); });
    return () => { ignore = true; };
  }, [clientUid]);
  // Weekend-adherence split for THIS client — reset per-client, ignore stale.
  const [wkndSplit, setWkndSplit] = useStateBSP(null);
  useEffectBSP(() => {
    setWkndSplit(null);
    if (!clientUid || !window.ShapeRosterWeekend?.get) return undefined;
    let ignore = false;
    window.ShapeRosterWeekend.get([clientUid])
      .then(res => { if (ignore) return; const s = res && res.split && res.split[clientUid]; setWkndSplit(s || null); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [clientUid]);
  // Weekly-adherence variance for THIS client — reset per-client, ignore stale.
  // Demo roster rows carry no real clientUid, so they simply never fetch → no line.
  const [clientVar, setClientVar] = useStateBSP(null);
  useEffectBSP(() => {
    setClientVar(null);
    if (!clientUid || !window.ShapeRosterVariance?.get) return undefined;
    let ignore = false;
    window.ShapeRosterVariance.get([clientUid])
      .then(map => { if (ignore) return; setClientVar((map && map[clientUid]) || null); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [clientUid]);
  const varRead = clientVar ? bsVarianceCopy(clientVar) : null;
  // Check-in kit (coach read): latest weekly check-in, health screening, girths.
  const [cKit, setCKit] = useStateBSP({ checkins: [], health: null, meas: [] });
  useEffectBSP(() => {
    if (!clientUid || !window.ShapeClientKit) return undefined;
    let on = true;
    Promise.all([
      window.ShapeClientKit.checkins(clientUid, 2),
      window.ShapeClientKit.health(clientUid),
      window.ShapeClientKit.measurements(clientUid),
    ]).then(([checkins, health, meas]) => { if (on) setCKit({ checkins: checkins || [], health: health || null, meas: meas || [] }); }).catch(() => {});
    return () => { on = false; };
  }, [clientUid]);
  // Accountability penalties (coach read) — recent, un-waived, for the Waive affordance.
  const [pens, setPens] = useStateBSP([]);
  const loadPens = () => {
    if (!clientUid || !window.ShapeCoachPenalties?.list) return;
    window.ShapeCoachPenalties.list(clientUid).then(d => setPens(Array.isArray(d) ? d : [])).catch(() => {});
  };
  useEffectBSP(() => { loadPens(); }, [clientUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const waivePen = async (p) => {
    if (!clientUid || !window.ShapeCoachPenalties?.waive) return;
    const r = await window.ShapeCoachPenalties.waive(clientUid, p.source_kind, p.source_id);
    if (r && r.waived) { window.__bsToast?.(tr('coach:case.penaltyWaived', { defaultValue: 'Penalty waived' }), 'ok'); loadPens(); }
    else { window.__bsToast?.(tr('coach:case.waiveFailed', { defaultValue: 'Couldn’t waive that' }), 'info'); }
  };
  // Propose a weekly commitment for this client (they accept before points are at risk).
  const [commitForm, setCommitForm] = useStateBSP(false);
  const [cf, setCf] = useStateBSP({ workouts: 4, checkin: true, habits: 5, stake: 20 });
  const [cfBusy, setCfBusy] = useStateBSP(false);
  const proposeCommit = async () => {
    if (cfBusy || !clientUid || !window.ShapeCoachCommit) return;
    setCfBusy(true);
    const targets = {};
    if (cf.workouts > 0) targets.workouts = cf.workouts;
    if (cf.checkin) targets.checkin = true;
    if (cf.habits > 0) targets.habits = cf.habits;
    const r = await window.ShapeCoachCommit.propose(clientUid, targets, cf.stake);
    setCfBusy(false);
    if (r && r.ok) { window.__bsToast?.(tr('coach:case.commitProposed', { defaultValue: 'Commitment proposed' }), 'ok'); setCommitForm(false); }
    else { window.__bsToast?.(r && r.reason === 'no_targets' ? tr('coach:case.pickTarget', { defaultValue: 'Pick at least one target' }) : tr('coach:case.proposeFailed', { defaultValue: 'Couldn’t propose it' }), 'info'); }
  };
  const setPhaseKey = (key, val) => {
    setPhase(prev => ({ ...prev, [key]: val }));
    if (clientUid) { try { window.ShapeProgramApi?.set?.({ userId: clientUid, [key]: val }); } catch (e) {} }
  };
  // ---- motion: one useBSSdInView pair per station (Open Ledger kit off window;
  // a stable no-op fallback so hook count never changes across renders). These
  // hooks MUST run before the early returns below — showAdjust/Schedule/Assign/
  // Reconcile are useStateBSP flags that toggle while the component stays mounted,
  // so a hook placed AFTER a conditional return would change the hook count on
  // toggle and crash React (same pattern as BSProToday / BSProRosterView). ----
  const useSdInView = (typeof window !== 'undefined' && window.useBSSdInView) || bsUseSdInViewFallback;
  const sdReduced = typeof window !== 'undefined' && window.bsSdReduced ? window.bsSdReduced() : false;
  React.useInsertionEffect(() => { try { window.bsInjectSessionDetailCss && window.bsInjectSessionDetailCss(); } catch (e) {} }, []);
  const [moveRef, moveSeen] = useSdInView();
  const [statsRef, statsSeen] = useSdInView();
  const [bodyRef, bodySeen] = useSdInView();
  const bodyStatsSeen = bodySeen;
  if (!client) return null;
  if (showAdjustPage) return <BSProAdjustProgram client={client} role={role} clientUid={clientUid} onBack={() => setShowAdjustPage(false)} />;
  if (showSchedulePage) return <BSProScheduleSession client={client} role={role} clientUid={clientUid} onBack={() => setShowSchedulePage(false)} />;
  if (showAssignPage) return <BSProAssignPage role={role} client={client} clientUid={clientUid} onBack={() => setShowAssignPage(false)} onDone={() => setShowAssignPage(false)} />;
  // Source reconciliation for THIS client (data-quality check) — the shared
  // client-bundle view, scoped to the client's id (RLS re-checks is_coach_on_client).
  if (showReconcile && window.BSReconcile) { const Reconcile = window.BSReconcile; return <Reconcile clientId={clientUid} onBack={() => setShowReconcile(false)} />; }

  // ---- theme + derived facts ----
  const accent = isNutri ? '#d8b25a' : teal;   // gold for nutrition, teal for training
  const gold = '#d8b25a';
  const rust = t.RUST;
  // Case File heat (spec §C) — the client's member tier when known, else the
  // role-heat fallback (bsProHeat, Task 2). `accent` (teal/gold) stays the
  // ACTION accent on the action-line cells; `heat` is for the header period,
  // the avatar ring, the status tick, and the tab underline (Tasks 5–6 read
  // this same const for their register rules / underlines).
  const heat = clientTier && window.bsTierColor ? window.bsTierColor(clientTier) : bsProHeat(t, role);
  const nm = (client.n || '').trim().split(/\s+/);
  const first = nm[0] || client.n || tr('coach:common.clientFallback', { defaultValue: 'Client' });
  const last = nm.slice(1).join(' ');
  const isPast = client.s === 'past' || client.active === false;
  const statusLabel = isPast ? tr('coach:roster.labelPast', { defaultValue: 'PAST' }) : client.warn ? tr('coach:sev.watch', { defaultValue: 'WATCH' }) : isNutri ? tr('coach:case.statusStrong', { defaultValue: 'STRONG' }) : tr('coach:roster.labelOnTrack', { defaultValue: 'ON TRACK' });
  const phaseUp = (isNutri ? (phase.nutritionPhase || 'Cut') : (phase.trainingPhase || 'Build')).toUpperCase();
  // Eyebrow: CASE FILE · {PHASE}[ · WK N REMAINING | · {KCAL} KCAL] — the week/
  // kcal fragment only when the live program `detail` actually carries it
  // (no fabricated "week X of Y" numerator — the store only tracks weeks
  // REMAINING, never an elapsed count); demo rows keep the authored literal.
  const liveWeeksRemaining = phase.detail && phase.detail.training && phase.detail.training.weeks != null ? Number(phase.detail.training.weeks) : null;
  const liveKcalTarget = phase.detail && phase.detail.nutrition && phase.detail.nutrition.calories != null ? Number(phase.detail.nutrition.calories) : null;
  const headFrag = clientUid
    ? (isNutri ? (liveKcalTarget != null ? tr('coach:case.headKcal', { defaultValue: ' · {kcal} KCAL', kcal: liveKcalTarget.toLocaleString(coachLocale()) }) : '') : (liveWeeksRemaining != null ? tr('coach:case.headWeeksRemaining', { defaultValue: ' · WK {weeks} REMAINING', weeks: liveWeeksRemaining }) : ''))
    : (isNutri ? ' · 2100 KCAL' : ' · WEEK 6 OF 12');
  const headEyebrow = `${tr('coach:case.caseFile', { defaultValue: 'CASE FILE' })} · ${phaseUp}${headFrag}`;
  // Real clients show '—' (no live since/streak source) — never the demo literal;
  // demo rows (no clientUid · signed-out preview) keep the example label.
  const sinceLabel = clientUid ? '—' : (isNutri ? 'Since Feb 2026 · 19d streak' : 'Since Jan 2026 · 14d streak');

  // Live weigh-ins (share-gated) drive the body chart; else illustrative demo.
  const liveW = (cGoals && cGoals.share !== false && cGoals.overall && Array.isArray(cGoals.overall.weighIns))
    ? cGoals.overall.weighIns.map(x => Number(x.kg)).filter(Number.isFinite) : [];
  const bwUnit = (cGoals && cGoals.overall && cGoals.overall.unit) || 'kg';
  // Real weigh-ins when the client shares ≥2; for a LINKED client with fewer,
  // return [] so BODY redacts (WEIGHT · NOT ON RECORD) instead of fabricating.
  // The demo 8-point series is the signed-out / no-clientUid preview ONLY.
  const bwSeries = liveW.length >= 2 ? liveW : (clientUid ? [] : (isNutri
    ? [80.4, 80.1, 79.9, 79.7, 79.6, 79.4, 79.3, 79.2]
    : [64.4, 64.6, 65.0, 64.6, 64.3, 64.1, 63.9, 63.8]));
  const bwHasData = bwSeries.length >= 2;
  const bwNow = bwHasData ? bwSeries[bwSeries.length - 1] : null;
  const bwDelta = bwHasData ? +(bwNow - bwSeries[0]).toFixed(1) : null;
  const bwWeeks = bwSeries.length;

  // ---- live KPIs (get_client_stats; null fields → demo fallback) ----
  const S = cStats || {};
  const lnum = (x) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
  const sDone = lnum(S.sessionsCompleted), sPlan = lnum(S.sessionsPlanned);
  const attendancePct = (sPlan && sPlan > 0) ? Math.round((sDone / sPlan) * 100) : null;
  const days7 = lnum(S.daysLogged7d), days30 = lnum(S.daysLogged30d);
  const adherencePct = (days7 != null) ? Math.round((days7 / 7) * 100) : null;
  const avgKcal = lnum(S.avgCalories), avgP = lnum(S.avgProtein), avgC = lnum(S.avgCarbs), avgF = lnum(S.avgFat);
  const kcalStr = avgKcal != null ? avgKcal.toLocaleString() : null;
  const liveRecent = Array.isArray(S.recentSessions) && S.recentSessions.length ? S.recentSessions.map(r => {
    const d = r.at ? new Date(r.at) : null;
    const when = d && !isNaN(d) ? d.toLocaleDateString(coachLocale(), { month: 'short', day: 'numeric' }) : '';
    const st = r.status === 'completed' ? tr('coach:case.stCompleted', { defaultValue: 'Completed' }) : r.status === 'requested' ? tr('coach:case.stRequested', { defaultValue: 'Requested' }) : tr('coach:case.stConfirmed', { defaultValue: 'Confirmed' });
    const mins = r.durationMin ? tr('coach:case.minsSuffix', { defaultValue: ' · {n} min', n: r.durationMin }) : '';
    return { n: r.title || tr('coach:today.session', { defaultValue: 'Session' }), s: `${st}${mins}`, d: when };
  }) : null;
  // Strength rollup (key lifts, PRs, avg RPE) — best-effort, demo fallback.
  const L = cLifts || {};
  const avgRpe = lnum(L.avgRpe);
  const prs = lnum(L.prs);
  const liftRows = Array.isArray(L.keyLifts) && L.keyLifts.length ? (() => {
    const best = L.keyLifts.map(x => lnum(x.best)).filter(v => v != null);
    const mx = best.length ? Math.max(...best) : 1;
    return L.keyLifts.map(x => {
      const b = lnum(x.best), dl = lnum(x.delta), e1 = lnum(x.e1rm);
      const v = b != null ? (e1 != null ? tr('coach:case.liftE1rm', { defaultValue: '{load} kg · {e1rm} e1RM', load: b, e1rm: Math.round(e1) }) : tr('coach:case.liftLoad', { defaultValue: '{load} kg', load: b })) : '—';
      return { n: x.name || tr('coach:case.liftFallback', { defaultValue: 'Lift' }), v, d: dl != null ? `${dl >= 0 ? '+' : ''}${dl}` : '—', p: b != null && mx ? Math.max(0.2, b / mx) : 0.5 };
    });
  })() : null;

  // ---- presentational helpers ----
  // Empty-state row for a signed-in real client with no live data yet.
  const emptyNote = (txt) => (
    <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{txt}</div>
  );

  // ---- header (shared across tabs) — the Case File masthead (spec §C):
  // typographic eyebrow + ← BACK, serif name w/ a heat period, the existing
  // avatar with the tier ring, a mono id line, status as mono text + a heat
  // tick, a 4-cell typographic action line (heat-underlined labels), and a
  // typographic PROFILE/MANAGE index with a drawn heat underline. Every
  // handler below is unchanged from the prior pill row — restyle only.
  const fireEvt = (name) => { try { window.dispatchEvent(new CustomEvent(name, { detail: { client } })); } catch (e) {} };
  const actionCell = (label, onClick) => (
    <button key={label} type="button" onClick={onClick} style={{ flex: 1, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 2px', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: t.INK, textAlign: 'center' }}>
      <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{label}</span>
    </button>
  );
  const headerBlock = (
    <div style={{ paddingTop: BS_MAST_TOP_CSS }}>
      {bsProMastRow()}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: t.INK50 }}>{headEyebrow}</div>
        <button type="button" onClick={onBack} aria-label={tr('coach:common.backAria', { defaultValue: 'Back' })} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '0 2px', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: t.INK }}>{tr('coach:common.back', { defaultValue: '← BACK' })}</button>
      </div>
      <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>
        {first} <span style={{ fontStyle: 'italic', color: heat }}>{last ? `${last}.` : '.'}</span>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 11 }}>
        <BSFacetAvatar size={56} c={heat} initial={client.i} name={client.n} photo={client.avatarUrl || client.avatar || undefined} showRank={false} />
        <div style={{ flex: 1, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.clientSince', { defaultValue: 'CLIENT {since}', since: sinceLabel })}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: t.INK70 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: isPast ? t.INK50 : heat, display: 'inline-block' }} />
          {statusLabel}
        </span>
      </div>
      {/* §C action line — MESSAGE / ADJUST / SCHEDULE / ✦ DRAFT, one row of 4
          typographic cells, each ≥44px, label underlined in heat. */}
      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${t.INK}12`, borderBottom: `1px solid ${t.INK}12` }}>
        {actionCell(tr('coach:case.actMessage', { defaultValue: 'MESSAGE' }), () => fireEvt('shape:proMessageClient'))}
        {actionCell(tr('coach:case.actAdjust', { defaultValue: 'ADJUST' }), () => setShowAdjustPage(true))}
        {actionCell(tr('coach:case.actSchedule', { defaultValue: 'SCHEDULE' }), () => setShowSchedulePage(true))}
        {actionCell(tr('coach:case.actDraft', { defaultValue: '✦ DRAFT' }), () => setShowDraft(true))}
      </div>
      {showDraft && <BSProCheckinDraft clientUid={clientUid} clientName={client.n} role={role} stats={cStats} accent={accent} onClose={() => setShowDraft(false)} />}
      {/* §C tabs — PROFILE / MANAGE typographic index, drawn heat underline. */}
      <div style={{ marginTop: 4, display: 'flex' }}>
        {[['profile', isNutri ? tr('coach:case.tabPlan', { defaultValue: 'PLAN' }) : tr('coach:case.tabProfile', { defaultValue: 'PROFILE' })], ['manage', tr('coach:case.tabManage', { defaultValue: 'MANAGE' })]].map(([k, label]) => {
          const on = view === k;
          return (
            <button key={k} type="button" onClick={() => setView(k)} style={{ flex: 1, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '11px 2px 9px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: on ? t.INK : t.INK50, textAlign: 'center', borderBottom: `2px solid ${on ? heat : 'transparent'}` }}>{label}</button>
          );
        })}
      </div>
    </div>
  );

  // ---- PROFILE tab ----
  // Real clients with no live value show '—'/0 (never the demo literal); demo
  // rows (no clientUid) keep the example numbers.
  const adhBig = adherencePct != null ? String(adherencePct) : (clientUid ? '—' : '92');
  const attBig = attendancePct != null ? String(attendancePct) : (clientUid ? '—' : '96');
  const days7Show = days7 != null ? days7 : (clientUid ? 0 : 6);
  const sDoneShow = sDone != null ? sDone : (clientUid ? 0 : 38);
  const sPlanShow = sPlan != null ? sPlan : (clientUid ? 0 : 41);
  const bigCard = isNutri
    ? { eyebrow: 'ADHERENCE · THIS WEEK', big: adhBig, small: '%', sub: `${days7Show}/7 days logged${bwHasData ? ` · ${bwDelta} ${bwUnit}` : ''}`, barsLabel: 'DAILY ADHERENCE', barsRight: 'MON — SUN', bars: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], barLetters: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], uniform: true }
    : { eyebrow: 'ATTENDANCE · THIS BLOCK', big: attBig, small: '%', sub: `${sDoneShow}/${sPlanShow} sessions · 6 wks left`, barsLabel: 'SESSIONS / WEEK', barsRight: 'LAST 7 WEEKS', bars: [0.55, 0.72, 0.5, 0.86, 0.46, 0.7, 1], barLetters: null, uniform: false };
  // Real clients with no strength rollup → empty (empty-state); demo rows keep
  // the example lifts.
  const lifts = liftRows || (clientUid ? [] : [
    { n: 'Back Squat', v: '82.5 kg', d: '+7.5', p: 0.92 },
    { n: 'Bench Press', v: '52.5 kg', d: '+5.0', p: 0.55 },
    { n: 'Deadlift', v: '110 kg', d: '+10', p: 1.0 },
    { n: 'Overhead Press', v: '35 kg', d: '+2.5', p: 0.38 },
  ]);
  // Real clients with no live macros → '—' values (never demo grams); demo rows
  // keep the example averages.
  const macros = [
    { n: tr('coach:case.macroProtein', { defaultValue: 'Protein' }), cur: avgP != null ? avgP : (clientUid ? null : 165), tgt: 170, c: teal },
    { n: tr('coach:case.macroCarbs', { defaultValue: 'Carbs' }), cur: avgC != null ? avgC : (clientUid ? null : 190), tgt: 200, c: gold },
    { n: tr('coach:case.macroFat', { defaultValue: 'Fat' }), cur: avgF != null ? avgF : (clientUid ? null : 60), tgt: 62, c: rust },
  ];
  const trackRow = (label, value, deltaColor, delta, pct, barColor) => (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${t.HAIR}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{label}</span>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{value} <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: deltaColor, fontWeight: 700 }}>▲ {delta}</span></span>
      </div>
      <div style={{ marginTop: 8, height: 3, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(1, pct) * 100}%`, background: barColor, borderRadius: 999 }} /></div>
    </div>
  );
  // Real clients with no live recent activity → empty (empty-state); demo rows
  // keep the example logs/sessions.
  const recent = liveRecent || (clientUid ? [] : (isNutri ? [
    { n: 'Tue · 2,040 kcal', s: '162P / 188C / 58F · on target', d: 'Today' },
    { n: 'Mon · 2,110 kcal', s: '168P / 201C / 61F · +protein', d: 'Mon' },
    { n: 'Sun · 1,980 kcal', s: '155P / 176C / 64F · low carb', d: 'Sun' },
  ] : [
    { n: 'Push Day A', s: 'Completed · 52 min · RPE 8', d: 'Today' },
    { n: 'Squat form video', s: 'Uploaded · awaiting review', d: '2h' },
    { n: 'Pull Day B', s: 'Completed · 48 min · RPE 7', d: 'Mon' },
    { n: 'Leg Day', s: 'Completed · 61 min · RPE 9', d: 'Sat' },
  ]));
  // No live inbox/note source — real clients show empty (demo rows keep example).
  const inbox = clientUid ? [] : (isNutri
    ? [{ n: 'Food log · this week', s: 'Submitted 4h ago · 18 entries', d: 'Review', cta: true }]
    : [{ n: 'Squat form video', s: 'Uploaded 2h ago · 1:42', d: 'Review', cta: true }]);
  const note = clientUid ? '' : (isNutri
    ? 'Adherence excellent. Refeed Saturday to support training — bump carbs +40g.'
    : 'Knee valgus on heavy squats — cue knees out, film week 6 top set.');
  // 30-day read — a one-line "what's happening" summary. Surfaced in the
  // directive lead at the TOP of the page now (the old standalone Analysis
  // trendline duplicated the body chart, so it was dropped in the density pass).
  const summaryLine = isNutri
    ? 'Adherence high and weight tracking to goal — refeed timing is the next lever.'
    : 'Strong block — attendance up, lifts trending, weight on plan.';

  // (motion hooks — useSdInView / sdReduced / moveRef / statsRef / bodyRef —
  // are hoisted ABOVE the early returns near the top of the component, so the
  // hook count stays constant when the show*Page flags toggle.)

  // ---- YOUR MOVE · FROM THE ENGINE (station #1, spec §C.1) ----------------
  // Reuses the page's EXISTING directive-lead computation VERBATIM — `_sig`
  // (bsRowSeverity → the engine's {sev,rank,label,directive} or the local
  // status scorer) and `summaryLine` (the 30-day read) are the verdict/
  // severity/evidence source; nothing here recomputes the engine.
  const _sig = bsRowSeverity(client, role);
  // No directive computable at all (no engine reachable, no data) — the honest
  // station renders just the redaction line. `_sig.directive` is always a
  // non-empty string in the current shape (bsRowFromTriage/bsRosterSeverity
  // both guarantee one), so this only trips if the severity lookup itself
  // failed to produce a signature.
  const hasDirective = !!(_sig && _sig.directive);
  // Directive-KIND classifier — presentation-only inference over the existing
  // reason text (no new engine intelligence; the engine's own vocabulary is
  // reused: "check-in"/"check in", "session"/"missed", "protein"/"macro"/
  // "kcal"/"nutrition"/"log", "program"/"stall"/"plateau"). Maps to the ONE
  // underlined action per the brief.
  const _dtext = String((_sig && _sig.directive) || '').toLowerCase();
  const _allClear = _sig.sev === 'green' || _sig.sev === 'past';
  const _dirKind = _allClear ? 'all-clear'
    : _sig.sev === 'new' ? 'new-intake' // a fresh client → reach out with the intake; the directive's word "plan" must NOT route to program-stall/ADJUST (no program exists yet)
    : /check-?in/.test(_dtext) ? 'check-in-due'
    : /(missed|session|attendance|no-show|didn.?t (show|train)|skipped)/.test(_dtext) ? 'missed-sessions'
    : /(protein|macro|kcal|calorie|nutrition|ledger|food log|logs? quiet|no food)/.test(_dtext) ? 'nutrition-slip'
    : /(program|plateau|stall|plan|phase|deload)/.test(_dtext) ? 'program-stall'
    : 'nutrition-slip'; // engine "needs attention" default reads as a message, not a fabricated program call
  // Next weekday label ("Thu") for the all-clear verdict — the client's next
  // weekly check-in is due at the start of next week; honest generic label
  // (no fabricated exact date without a real cadence source).
  const _nextCheckinWeekday = (() => {
    const d = new Date(); const day = d.getDay(); // 0=Sun..6=Sat
    const untilMon = ((1 - day) + 7) % 7 || 7;
    const nd = new Date(d); nd.setDate(d.getDate() + untilMon);
    return _BS_DOW[(nd.getDay() + 6) % 7];
  })();
  const moveVerdict = !hasDirective ? null
    : _allClear ? tr('coach:case.moveAllClear', { defaultValue: 'Everything holding — next check-in {weekday} ✓.', weekday: _nextCheckinWeekday })
    : _sig.directive;
  const moveActionLabel = _allClear ? tr('coach:case.actDraft', { defaultValue: '✦ DRAFT' })
    : _dirKind === 'new-intake' ? tr('coach:case.actMessage', { defaultValue: 'MESSAGE' })
    : _dirKind === 'nutrition-slip' ? tr('coach:case.actMessage', { defaultValue: 'MESSAGE' })
    : _dirKind === 'missed-sessions' ? tr('coach:case.actSchedule', { defaultValue: 'SCHEDULE' })
    : _dirKind === 'program-stall' ? tr('coach:case.actAdjust', { defaultValue: 'ADJUST' })
    : tr('coach:case.actDraft', { defaultValue: '✦ DRAFT' });
  const moveActionFn = _allClear || _dirKind === 'check-in-due' ? () => setShowDraft(true)
    : _dirKind === 'new-intake' || _dirKind === 'nutrition-slip' ? () => fireEvt('shape:proMessageClient')
    : _dirKind === 'missed-sessions' ? () => setShowSchedulePage(true)
    : _dirKind === 'program-stall' ? () => setShowAdjustPage(true)
    : () => setShowDraft(true);
  // THE EVIDENCE — ≤3 dot-leader rows from the SAME fields the directive
  // cites: the weekend split (when it fired), the check-in/log recency, and
  // the attendance/adherence figure — closing with the honest all-clear line
  // when nothing else is flagged. Built from data already on the page (cKit,
  // wkndSplit, cStats) — no new fetches.
  const evidenceRows = (() => {
    if (_allClear || !hasDirective || _dirKind === 'new-intake') return [];
    const rows = [];
    if (wkndSplit && wkndSplit.status === 'ok' && wkndSplit.worstDimension) {
      const d = (wkndSplit.dimensions || {})[wkndSplit.worstDimension];
      if (d && d.gapPp != null) rows.push([tr('coach:case.evWeekend', { defaultValue: 'WEEKEND {dim}', dim: wkndSplit.worstDimension === 'nutrition' ? tr('coach:case.dimNutritionUp', { defaultValue: 'NUTRITION' }) : wkndSplit.worstDimension === 'training' ? tr('coach:case.dimTrainingUp', { defaultValue: 'TRAINING' }) : tr('coach:case.dimHabitsUp', { defaultValue: 'HABITS' }) }), tr('coach:case.evPts', { defaultValue: '{sign}{gap} PTS', sign: d.gapPp >= 0 ? '−' : '+', gap: Math.abs(Math.round(d.gapPp)) })]);
    }
    if (_dirKind === 'nutrition-slip' && days7 != null && days7 < 7) rows.push([tr('coach:case.evLogs', { defaultValue: 'LOGS' }), days7 === 0 ? tr('coach:case.evQuietAll', { defaultValue: 'QUIET 7 DAYS' }) : tr('coach:case.evQuiet', { defaultValue: 'QUIET {n} DAYS', n: 7 - days7 })]);
    if (_dirKind === 'missed-sessions' && sDone != null && sPlan != null) rows.push([tr('coach:case.evAttendance', { defaultValue: 'ATTENDANCE' }), tr('coach:case.evSessions', { defaultValue: '{done}/{planned} SESSIONS', done: sDone, planned: sPlan })]);
    if (_dirKind === 'check-in-due' && cKit.checkins.length) rows.push([tr('coach:case.evLastCheckin', { defaultValue: 'LAST CHECK-IN' }), tr('coach:case.evWkOf', { defaultValue: 'WK OF {date}', date: String(cKit.checkins[0].week_of).slice(5) })]);
    if (avgKcal != null && _dirKind === 'nutrition-slip') rows.push([tr('coach:case.evAvgIntake', { defaultValue: 'AVG INTAKE' }), tr('coach:case.evKcal', { defaultValue: '{kcal} KCAL', kcal: avgKcal.toLocaleString(coachLocale()) })]);
    // ≤3 evidence lines. When there are fewer than 3 real cited rows (i.e. no
    // other dimension is flagged), close with the honest all-clear line —
    // never displace a real evidence row to make room for it.
    const capped = rows.slice(0, 3);
    if (rows.length < 3) capped.push([tr('coach:case.evEverythingElse', { defaultValue: 'EVERYTHING ELSE' }), tr('coach:case.evHolding', { defaultValue: 'HOLDING ✓' })]);
    return capped;
  })();
  const dotLeaderRow = (label, value, i) => (
    <div key={label + i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '5px 0' }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70, whiteSpace: 'nowrap' }}>{label}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
  const yourMoveStation = (
    <div ref={moveRef} style={{ marginTop: 20 }}>
      {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.yourMove', { defaultValue: 'YOUR MOVE · FROM THE ENGINE' })} />}
      {!hasDirective ? (
        window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.noRead', { defaultValue: 'NO READ YET · DATA STILL THIN' })} /> : null
      ) : (
        <>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.3, color: t.INK }}>
            {moveVerdict}<span style={{ color: heat }}>.</span>
          </div>
          <button type="button" onClick={moveActionFn} style={{ marginTop: 10, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 0', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK }}>
            <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{moveActionLabel} →</span>
          </button>{/* i18n: moveActionLabel is translated at source */}
          {evidenceRows.length > 0 && (
            <div style={{ marginTop: 8, borderTop: `1px solid ${t.HAIR}`, paddingTop: 6 }}>
              {evidenceRows.map(([l, v], i) => dotLeaderRow(l, v, i))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const profileView = (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
      {yourMoveStation}
      {/* Flagged-dimension float (spec §C step 2) — when the weekend split
          flags, its station renders directly under YOUR MOVE; otherwise the
          station simply doesn't render here (ProWeekendPlate itself checks
          `status==='ok'` and returns null when there's nothing to flag). */}
      <ProWeekendPlate split={wkndSplit} />

      {/* ATTENDANCE / ADHERENCE — register pair + BSSdBars(still) week bars. */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={isNutri ? tr('coach:case.adherenceWeek', { defaultValue: 'ADHERENCE · THIS WEEK' }) : tr('coach:case.attendanceBlock', { defaultValue: 'ATTENDANCE · THIS BLOCK' })} />}
        <div style={{ display: 'flex', gap: 22 }}>
          {window.BSTLedgerStat && <window.BSTLedgerStat INK={t.INK} label={isNutri ? tr('coach:case.adherence', { defaultValue: 'ADHERENCE' }) : tr('coach:case.attendance', { defaultValue: 'ATTENDANCE' })} value={`${bigCard.big}%`} seen={statsSeen} figSize={26} />}
          {window.BSTLedgerStat && <window.BSTLedgerStat INK={t.INK} label={isNutri ? tr('coach:case.daysLogged', { defaultValue: 'DAYS LOGGED' }) : tr('coach:case.sessionsStat', { defaultValue: 'SESSIONS' })} value={isNutri ? `${days7Show}/7` : `${sDoneShow}/${sPlanShow}`} seen={statsSeen} figSize={26} delay={60} />}
        </div>
        <div ref={statsRef} style={{ marginTop: 12 }}>
          {window.BSSdBars && <window.BSSdBars
            rows={(bigCard.barLetters || ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7']).map((l, i) => [l, '', ''])}
            perf={bigCard.bars}
            bestIdx={bigCard.uniform ? -1 : bigCard.bars.length - 1}
            heat={heat}
            t={t}
            muted={t.INK50}
            still
          />}
        </div>
        {/* Week-to-week variance. Rendered BARE — bsVarianceCopy is the ONE copy
            source (words + figures baked together, the crossoverCopy precedent),
            so the Case File and the website line can never disagree. Wrapping it
            in tr() would invite catalogs to rebuild the sentence from parts and
            fork that source; it is a ledger-note, English by design. */}
        {varRead && (
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: varRead.chip ? t.AMBER : t.INK50 }}>
            {varRead.line}
          </div>
        )}
      </div>

      {/* KEY LIFTS (trainer) / MACROS VS TARGET (nutri). */}
      {!isNutri ? (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.keyLifts', { defaultValue: 'KEY LIFTS' })} meta={lifts.length ? undefined : null} />}
          {lifts.length ? (
            <>
              {lifts.map((l, i) => (
                <div key={l.n + i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap' }}>{l.n}</span>
                  <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
                  <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.v} <span style={{ color: heat }}>▲{l.d}</span></span>
                </div>
              ))}
              <span style={{ marginTop: 6, display: 'inline-block', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{tr('coach:case.history', { defaultValue: 'HISTORY' })}</span>
            </>
          ) : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.liftsRedact', { defaultValue: 'LIFTS · NOT ON RECORD' })} /> : emptyNote(tr('coach:case.noLifts', { defaultValue: 'No lifts logged yet' })))}
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.macrosVsTarget', { defaultValue: 'MACROS VS TARGET' })} />}
          {window.BSSdBars ? <window.BSSdBars
            rows={macros.map((m) => [m.n.toUpperCase(), m.cur != null ? tr('coach:case.macroVsTgt', { defaultValue: '{cur}g · {tgt}g tgt', cur: m.cur, tgt: m.tgt }) : '—', ''])}
            perf={macros.map((m) => (m.cur != null && m.tgt ? m.cur / m.tgt : 0))}
            bestIdx={-1}
            heat={heat}
            t={t}
            muted={t.INK50}
            still
          /> : macros.map((m, i) => <div key={i}>{trackRow(m.n, m.cur != null ? `${m.cur} g` : '—', m.c, `${m.tgt} g`, m.cur != null ? m.cur / m.tgt : 0, m.c)}</div>)}
        </div>
      )}

      {/* PREP (PR C) — the meal-prep signal: "{n} meals · {day}". Honest slot:
          renders ONLY from a real fresh prep record (get_client_meal_prep,
          coach-link-gated); states what happened, never what didn't
          (never-shaming — a client who never preps shows NOTHING here). */}
      {prepSignal && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.prep', { defaultValue: 'PREP' })} />}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap' }}>
              {tr('coach:case.prepLine', { defaultValue: '{count, plural, one {# meal prepped} other {# meals prepped}}', count: prepSignal.count })}
            </span>
            <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, whiteSpace: 'nowrap' }}>
              {prepSignal.lastAt ? (() => { try { return new Date(prepSignal.lastAt).toLocaleDateString((window.ShapeI18n && window.ShapeI18n.intlLocale && window.ShapeI18n.intlLocale()) || 'en', { weekday: 'short' }); } catch (e) { return ''; } })() : ''}
              {prepSignal.days.length ? <span style={{ color: t.INK50 }}> · {prepSignal.days.join(' ')}</span> : null}
            </span>
          </div>
        </div>
      )}

      {/* SELF-PROGRAMMED — the member's own authored training (trainer_id-NULL
          rows, coach read via get_client_self_plans). Honest slot: renders
          ONLY when the member actually self-programs — a coached-only client
          (or a demo row / pre-migration read) shows nothing here. */}
      {(selfPlans.programs.length > 0 || selfPlans.repeats.length > 0 || selfPlans.upcoming.length > 0) && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.selfProgrammed', { defaultValue: 'SELF-PROGRAMMED' })} meta={tr('coach:case.sessionsCount', { defaultValue: '{count, plural, one {# SESSION} other {# SESSIONS}}', count: selfPlans.total })} />}
          {selfPlans.programs.map((p, i) => (
            <div key={`sp-prog-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {p.nextDate
                  ? <>{p.nextWeek != null ? `W${p.nextWeek}` : ''}{p.nextWeek != null && p.weeks ? tr('coach:case.weekOfSep', { defaultValue: ' OF {weeks}', weeks: p.weeks }) : ''}{p.nextWeek != null ? ' · ' : ''}<span style={{ color: heat }}>{bsSelfPlanDateLabel(p.nextDate)}</span></>
                  : tr('coach:roster.labelPast', { defaultValue: 'PAST' })}
              </span>
            </div>
          ))}
          {selfPlans.repeats.map((r, i) => (
            <div key={`sp-rep-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
              <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{r.days} <span style={{ color: t.INK50 }}>· {tr('coach:case.weekly', { defaultValue: 'WEEKLY' })}</span></span>
            </div>
          ))}
          {selfPlans.upcoming.map((u, i) => (
            <div key={`sp-up-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.title}</span>
              <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: heat, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{bsSelfPlanDateLabel(u.date)}</span>
            </div>
          ))}
          <span style={{ marginTop: 6, display: 'inline-block', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{tr('coach:case.programmedByMember', { defaultValue: 'PROGRAMMED BY THE MEMBER' })}</span>
        </div>
      )}

      {/* BODY — registers + the self-drawing line-only weight trace + LOG →. */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.body', { defaultValue: 'BODY' })} />}
        {bwHasData && (
          <div style={{ display: 'flex', gap: 22, alignItems: 'baseline' }}>
            {window.BSTLedgerStat && <window.BSTLedgerStat INK={t.INK} label={tr('coach:case.weight', { defaultValue: 'WEIGHT' })} value={`${bwNow}${bwUnit}`} seen={bodyStatsSeen} figSize={26} />}
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: heat, letterSpacing: '0.04em' }}>{bwDelta > 0 ? '+' : ''}{tr('coach:case.weightDelta', { defaultValue: '{delta} {unit} · {weeks} weeks', delta: bwDelta, unit: bwUnit, weeks: bwWeeks })}</div>
            <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{isNutri ? tr('coach:case.history', { defaultValue: 'HISTORY' }) : tr('coach:case.log', { defaultValue: 'LOG' })}</span>
          </div>
        )}
        <div ref={bodyRef} style={{ marginTop: 10 }}>
          {(() => {
            const vals = bwSeries.map(Number).filter(Number.isFinite);
            if (vals.length < 2) return window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.weightRedact', { defaultValue: 'WEIGHT · NOT ON RECORD' })} /> : null;
            const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1, n = vals.length, W = 320, H = 46;
            const pts = vals.map((v, i) => [(i / (n - 1)) * W, H - 6 - ((v - mn) / span) * (H - 16)]);
            const ln = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
            const lp = pts[pts.length - 1];
            return (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
                <path d={ln} fill="none" stroke={heat} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                  pathLength={1} strokeDasharray="1 1"
                  style={{ '--sd-len': 1, ...(sdReduced ? { strokeDashoffset: 0 } : (bodySeen ? { animation: 'bsSdDrawLine 900ms cubic-bezier(.4,0,.2,1) 200ms both' } : { strokeDashoffset: 1 })) }} />
                <circle cx={lp[0]} cy={lp[1]} r="3.5" fill={heat} opacity={sdReduced || bodySeen ? 1 : 0} style={{ transition: 'opacity 300ms ease 900ms' }} />
              </svg>
            );
          })()}
        </div>
      </div>

      {/* CHECK-IN — 3-col mini registers ×6 + the wins/struggles serif pull-quote + asked-you. */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={cKit.checkins.length ? tr('coach:case.checkinWkOf', { defaultValue: 'CHECK-IN · WK OF {date}', date: String(cKit.checkins[0].week_of).slice(5) }) : tr('coach:case.checkin', { defaultValue: 'CHECK-IN' })} />}
        {clientUid && cKit.checkins.length > 0 ? (() => {
          const ck = cKit.checkins[0];
          const R = ck.ratings || {};
          const items = [['trainingAdherence', tr('coach:case.ckTraining', { defaultValue: 'Training' })], ['nutritionAdherence', tr('coach:case.ckNutrition', { defaultValue: 'Nutrition' })], ['sleep', tr('coach:case.ckSleep', { defaultValue: 'Sleep' })], ['energy', tr('coach:case.ckEnergy', { defaultValue: 'Energy' })], ['stress', tr('coach:case.ckStress', { defaultValue: 'Stress' })], ['hunger', tr('coach:case.ckHunger', { defaultValue: 'Hunger' })]];
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {items.map(([k, l]) => (
                  <div key={k}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{l}</div>
                    <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: R[k] != null ? t.INK : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{R[k] != null ? tr('coach:case.ratingOf10', { defaultValue: '{n}/10', n: R[k] }) : '—'}</div>
                  </div>
                ))}
              </div>
              {(ck.wins || ck.struggles || ck.question) && (
                <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${t.HAIR}`, display: 'grid', gap: 9 }}>
                  {ck.wins ? <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.45 }}>“{ck.wins}”</div> : null}
                  {ck.struggles ? <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.45 }}>{ck.struggles}</div> : null}
                  {ck.question ? <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: accent }}>{tr('coach:case.askedYou', { defaultValue: 'ASKED YOU · {question}', question: ck.question })}</div> : null}
                </div>
              )}
            </>
          );
        })() : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.checkinRedact', { defaultValue: 'CHECK-IN · NOT SUBMITTED' })} /> : emptyNote(tr('coach:case.noCheckin', { defaultValue: 'No check-in yet' })))}
      </div>

      {/* SLEEP · RECOVERY — readiness + 7-day registers; redactions per field. */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.sleepRecovery', { defaultValue: 'SLEEP · RECOVERY' })} />}
        {sleepRec ? (() => {
          const s = sleepRec;
          const rc = s.readiness == null ? t.INK50 : s.readiness >= 80 ? heat : s.readiness >= 60 ? (t.isLight ? '#3a6ea5' : '#5b9bd5') : s.readiness >= 40 ? '#e8b14a' : '#c0533b';
          const cells = [
            [tr('coach:case.lastNight', { defaultValue: 'LAST NIGHT' }), s.latest != null ? `${Number(s.latest)}H` : null],
            [tr('coach:case.sevenDayAvg', { defaultValue: '7-DAY AVG' }), s.avg7 != null ? `${Number(s.avg7)}H` : null],
            [tr('coach:case.efficiency', { defaultValue: 'EFFICIENCY' }), s.efficiency != null ? `${s.efficiency}%` : null],
            [tr('coach:case.restingHr', { defaultValue: 'RESTING HR' }), s.rhr != null ? `${s.rhr}` : null],
            [tr('coach:common.hrv', { defaultValue: 'HRV' }), s.hrv != null ? `${s.hrv}` : null],
            [tr('coach:case.respiratory', { defaultValue: 'RESPIRATORY' }), s.respiratory != null ? `${s.respiratory}/MIN` : null],
          ];
          return (
            <>
              {s.readiness != null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{tr('coach:case.readiness', { defaultValue: 'READINESS' })}</span>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: rc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.readiness}</span>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 11, color: t.INK50 }}>/100</span>
                  {s.readinessLabel && <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: rc }}>{s.readinessLabel}</span>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {cells.map(([l, v]) => v != null ? (
                  <div key={l}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{l}</div>
                    <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ) : (
                  <div key={l}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{l}</div>
                    <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>{tr('coach:case.notSynced', { defaultValue: '— NOT SYNCED' })}</div>
                  </div>
                ))}
              </div>
            </>
          );
        })() : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.sleepRedact', { defaultValue: 'SLEEP · RECOVERY · NOT SYNCED' })} /> : emptyNote(tr('coach:case.noRecovery', { defaultValue: 'No recovery data yet' })))}
      </div>

      {/* CYCLE — share-gated (spec 2026-07-19): renders ONLY when the member
          left sharing on (cycleShared is set only for { share:true }). Phase +
          timing only — never a symptom read. Absence, never a padlock: nothing
          renders otherwise, so a coach can't tell never-opted-in from not-shared. */}
      {cycleShared && (() => {
        // Derive against the MEMBER's local today (from the definer via
        // shape_user_tz), never the coach device clock — a coach a calendar day
        // behind her would otherwise read the wrong day/phase (Codex P2). Falls
        // back to new Date() only if the RPC predates the today field.
        const c = bsDeriveCycle(cycleShared.starts, cycleShared.today || new Date());
        if (!c || c.phase === null) return null;
        // Enumerated phase labels — NOT a `coach:cycle.phase.${c.phase}` dynamic
        // key (the resolve-check can't see template keys; the #1759 lesson).
        let phaseLabel;
        switch (c.phase) {
          case 'menstrual': phaseLabel = tr('coach:cycle.phase.menstrual', { defaultValue: 'Menstrual' }); break;
          case 'follicular': phaseLabel = tr('coach:cycle.phase.follicular', { defaultValue: 'Follicular' }); break;
          case 'ovulatory': phaseLabel = tr('coach:cycle.phase.ovulatory', { defaultValue: 'Ovulatory' }); break;
          case 'luteal': phaseLabel = tr('coach:cycle.phase.luteal', { defaultValue: 'Luteal' }); break;
          case 'paused': phaseLabel = tr('coach:cycle.phase.paused', { defaultValue: 'Predictions paused' }); break;
          case 'late': phaseLabel = tr('coach:cycle.phase.late', { defaultValue: 'Awaiting next log' }); break;
          default: return null;
        }
        const timing = (c.phase === 'paused' || c.phase === 'late')
          ? phaseLabel
          : tr('coach:cycle.phaseDay', { defaultValue: '{phase} · day {day}', phase: phaseLabel, day: c.day });
        return (
          <div style={{ marginTop: 22 }}>
            {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:cycle.head', { defaultValue: 'CYCLE · SHARED BY THE MEMBER' })} />}
            <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK }}>{timing}</div>
            {c.predictedStart && (
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>
                {tr('coach:cycle.window', { defaultValue: 'Next period window · {from} – {to}', from: bsCycleShortDate(c.predictedStart.from), to: bsCycleShortDate(c.predictedStart.to) })}
              </div>
            )}
            <BSCycleMonthStrip starts={cycleShared.starts} heat={heat} today={cycleShared.today} />
            {c.phase === 'luteal' && c.predictedStart && (
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 12, fontStyle: 'italic', color: t.INK70 }}>
                {tr('coach:cycle.deload', { defaultValue: 'Week of the {d} is a natural deload window.', d: bsCycleShortDate(c.predictedStart.from) })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ACTIVITY — recent sessions/logs as dot-leader rows. */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={isNutri ? tr('coach:case.activityLogs', { defaultValue: 'ACTIVITY · RECENT LOGS' }) : tr('coach:case.activitySessions', { defaultValue: 'ACTIVITY · RECENT SESSIONS' })} />}
        {recent.length ? recent.map((r, i) => dotLeaderRow(r.n, r.d, i)) : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={isNutri ? tr('coach:case.logsRedact', { defaultValue: 'LOGS · NOT ON RECORD' }) : tr('coach:case.sessionsRedact', { defaultValue: 'SESSIONS · NOT ON RECORD' })} /> : emptyNote(isNutri ? tr('coach:case.noLogs', { defaultValue: 'No logs yet' }) : tr('coach:case.noSessions', { defaultValue: 'No sessions yet' })))}
      </div>

      {/* COACH NOTE — ink-spined quiet block (private, only-you). */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.coachNoteHead', { defaultValue: 'COACH NOTE · ONLY YOU SEE THIS' })} />}
        {note ? (
          <div style={{ borderLeft: `3px solid ${t.INK}33`, padding: '2px 0 2px 11px' }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontStyle: 'italic', fontWeight: 600, color: t.INK, lineHeight: 1.5 }}>{note}</div>
          </div>
        ) : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.noNote', { defaultValue: 'NO NOTE ON FILE' })} /> : null)}
      </div>
    </div>
  );

  // ---- MANAGE tab (Open Ledger grammar, spec §C-Manage) --------------------
  // Shared goals → dot-leader rows (a tier-heat progress leader for the
  // Overall body-comp goal, plain dot-leaders for Training/Nutrition headline
  // goals); private/none/loading → BSTRedact. Same data + gating as before —
  // restyle only (goalsContent no longer wraps its own rounded cards).
  const goalsContent = !clientUid ? (
    window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.goalsAppearLinked', { defaultValue: 'GOALS · APPEARS ONCE LINKED' })} /> : emptyNote(tr('coach:case.appearsLinked', { defaultValue: 'Appears once linked to a live member' }))
  ) : !cGoalsLoaded ? (
    <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:common.loading', { defaultValue: 'Loading…' })}</div>
  ) : (cGoals && cGoals.share === false) ? (
    window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.goalsPrivateRedact', { defaultValue: '{name} KEEPS GOALS PRIVATE', name: first.toUpperCase() })} /> : emptyNote(tr('coach:case.goalsPrivate', { defaultValue: '{name} keeps their goals private.', name: first }))
  ) : (() => {
    const ov = cGoals && cGoals.overall;
    const trM = (cGoals && cGoals.trainingMeta) || null;
    const nuM = (cGoals && cGoals.nutritionMeta) || null;
    // Work-domain headline (spec 2026-07-13) — shared goals include THE WORK
    // station; a member sharing only work goals must not read as "none shared".
    const wkM = (cGoals && cGoals.workMeta) || null;
    if (!ov && !(trM && trM.title) && !(nuM && nuM.title) && !(wkM && wkM.title)) return (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.noGoalsShared', { defaultValue: 'NO GOALS SHARED YET' })} /> : emptyNote(tr('coach:case.noGoalsSharedFull', { defaultValue: 'No goals shared yet.' })));
    const goalDotRow = (label, value, c, i) => (
      <div key={label + i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap' }}>{label}</span>
        <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: c || t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    );
    return (
      <div>
        {ov && (() => {
          const start = Number(ov.start) || 0, now = Number(ov.now) || 0, target = Number(ov.target) || 0, unit = ov.unit || 'kg';
          const range = start - target;
          const pct = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : 0;
          const down = +(now - start).toFixed(1), toGo = +(now - target).toFixed(1);
          const byD = ov.by ? new Date(ov.by) : null;
          const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString(coachLocale(), { month: 'short', day: 'numeric' }).toUpperCase() : '';
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: heat }}>{tr('coach:case.overall', { defaultValue: 'OVERALL' })}{byLabel ? tr('coach:case.byDate', { defaultValue: ' · BY {date}', date: byLabel }) : ''}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50 }}>{tr('coach:case.pctThere', { defaultValue: '{pct}% there', pct: Math.round(pct * 100) })}</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{ov.title}</div>
              <div style={{ marginTop: 8, height: 2, borderRadius: 0, background: `${t.INK}22`, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct * 100}%`, background: heat }} /></div>
              <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.04em' }}>{tr('coach:case.goalProgress', { defaultValue: '{down} {unit} so far · {toGo} {unit} to go · now {now}{unit} · target {target}{unit}', down, unit, toGo: Math.abs(toGo), now, target })}</div>
            </div>
          );
        })()}
        {trM && trM.title && (
          <div style={{ marginTop: ov ? 12 : 0 }}>
            {goalDotRow(tr('coach:case.ckTraining', { defaultValue: 'Training' }), trM.title, t.RUST, 0)}
            {trM.subtitle && <div style={{ marginTop: -2, marginBottom: 4, fontFamily: t.DISPLAY, fontSize: 11.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.35 }}>{trM.subtitle}</div>}
          </div>
        )}
        {nuM && nuM.title && (
          <div style={{ marginTop: 4 }}>
            {goalDotRow(tr('coach:case.ckNutrition', { defaultValue: 'Nutrition' }), nuM.title, '#a07a2e', 1)}
            {nuM.subtitle && <div style={{ marginTop: -2, marginBottom: 4, fontFamily: t.DISPLAY, fontSize: 11.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.35 }}>{nuM.subtitle}</div>}
          </div>
        )}
        {wkM && wkM.title && (
          <div style={{ marginTop: 4 }}>
            {goalDotRow(tr('coach:case.dimWork', { defaultValue: 'Work' }), wkM.title, t.BLUE, 2)}
            {wkM.subtitle && <div style={{ marginTop: -2, marginBottom: 4, fontFamily: t.DISPLAY, fontSize: 11.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.35 }}>{wkM.subtitle}</div>}
          </div>
        )}
      </div>
    );
  })();
  const manageView = (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
      {/* PHASE — typographic index (mono 9/800, active = ink + 2px heat
          underline), the same setPhaseKey handler (ShapeProgramApi-backed). */}
      <div style={{ marginTop: 20 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.blockPhase', { defaultValue: 'BLOCK & PHASE' })} />}
        {[['trainingPhase', tr('coach:case.trainingBlock', { defaultValue: 'TRAINING BLOCK' }), ['Build', 'Cut', 'Peak', 'Maintain', 'Deload', 'Base']], ['nutritionPhase', tr('coach:case.nutritionPhase', { defaultValue: 'NUTRITION PHASE' }), ['Cut', 'Bulk', 'Maintain', 'Recomp', 'Refeed']]].map(([key, label, opts], gi) => (
          <div key={key} style={{ marginTop: gi ? 14 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>{label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {opts.map(o => {
                const on = phase[key] === o;
                return (
                  <button key={o} type="button" onClick={() => setPhaseKey(key, o)} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: on ? t.INK : t.INK50 }}>
                    <span style={{ borderBottom: on ? `2px solid ${heat}` : '2px solid transparent', paddingBottom: 2 }}>{o.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!clientUid && <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.demoSaves', { defaultValue: 'Demo client · saves once linked to a live member' })}</div>}
      </div>

      {/* ASSIGN — amber-spined notice row → setShowAssignPage(true). */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={t.AMBER || '#d8a23a'} INK={t.INK} label={isNutri ? tr('coach:case.mealPlanHead', { defaultValue: 'MEAL PLAN' }) : tr('coach:case.programHead', { defaultValue: 'PROGRAM' })} />}
        <button type="button" onClick={() => setShowAssignPage(true)} style={{ display: 'block', width: '100%', minHeight: 44, textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', borderLeft: `3px solid ${t.AMBER || '#d8a23a'}`, padding: '9px 0 9px 11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK }}>{tr('coach:case.assignFromCatalogue', { defaultValue: 'ASSIGN FROM YOUR CATALOGUE…' })}</span>
            <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 13, fontWeight: 700, color: t.AMBER || '#d8a23a' }}>›</span>
          </div>
          <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, lineHeight: 1.4 }}>{isNutri ? tr('coach:case.assignHintNutri', { defaultValue: "A saved meal plan → {name}'s Eat tab", name: first }) : tr('coach:case.assignHintTrainer', { defaultValue: "A saved program → {name}'s Train tab", name: first })}</div>
        </button>
      </div>

      {/* CLIENT GOALS — shared goals as dot-leader rows; private/none → redaction. */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.sharedGoals', { defaultValue: 'SHARED GOALS' })} />}
        {goalsContent}
      </div>

      {/* DATA QUALITY — reconcile sources (unchanged handler). */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.dataQuality', { defaultValue: 'DATA QUALITY' })} />}
        {clientUid ? (
          <button type="button" onClick={() => setShowReconcile(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK }}>{tr('coach:case.whichSource', { defaultValue: 'Which source to trust' })}</span>
              <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.whichSourceSub', { defaultValue: "When {name}'s devices disagree on a metric", name: first })}</span>
            </span>
            <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 13, fontWeight: 700, color: heat }}>›</span>
          </button>
        ) : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.demoAppearsRedact', { defaultValue: 'DEMO CLIENT · APPEARS ONCE LINKED' })} /> : emptyNote(tr('coach:case.demoAppears', { defaultValue: 'Demo client · appears once linked to a live member' })))}
      </div>

      {/* CARE TEAM — press-credit rows (counterpart's ROLE-color spine · name ·
          CO-MANAGING · MESSAGE heat-underline → existing shape:proMessageCoach). */}
      {clientUid && careLoaded && careTeam && careTeam.length > 0 && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.careTeam', { defaultValue: 'CARE TEAM' })} />}
          {careTeam.map((c, i) => {
            const cName = (c.name || tr('coach:common.coach', { defaultValue: 'Coach' })).trim();
            const cInit = cName.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
            const cColor = c.role === 'nutritionist' ? '#a07a2e' : t.RUST;
            const cRoleLabel = c.role === 'nutritionist' ? tr('coach:role.nutritionist', { defaultValue: 'Nutritionist' }) : tr('coach:role.trainer', { defaultValue: 'Trainer' });
            return (
              <div key={c.userId || i} style={{ display: 'flex', alignItems: 'center', gap: 11, borderLeft: `3px solid ${cColor}`, padding: '9px 0 9px 11px', marginTop: i ? 8 : 0 }}>
                <BSFacetAvatar size={36} c={cColor} initial={cInit} photo={c.avatarUrl || c.avatar || undefined} showRank={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cName}</div>
                  <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.coManaging', { defaultValue: '{role} · CO-MANAGING', role: cRoleLabel.toUpperCase() })}</div>
                </div>
                <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:proMessageCoach', { detail: { clientId: clientUid, counterpartUserId: c.userId, name: cName, role: cRoleLabel } })); } catch (e) {} }} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 2px', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: t.INK, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{tr('coach:case.actMessage', { defaultValue: 'MESSAGE' })}</span>
                </button>
              </div>
            );
          })}
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.coordinatePlan', { defaultValue: "Coordinate {name}'s plan with the rest of the care team", name: first })}</div>
        </div>
      )}

      {/* ACCOUNTABILITY — penalty rows (mono description · rust −{n} · dotted
          leader · WAIVE heat-underline action, existing RPC handler). */}
      {clientUid && pens.length > 0 && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.accountabilityPenalties', { defaultValue: 'ACCOUNTABILITY · RECENT PENALTIES' })} />}
          {pens.map((p, i) => (
            <div key={p.source_id || i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 0' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK, whiteSpace: 'nowrap' }}>{p.note || tr('coach:case.penalty', { defaultValue: 'Penalty' })}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, color: t.RUST, whiteSpace: 'nowrap' }}>−{Math.abs(Number(p.delta) || 0)}</span>
              <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK50, whiteSpace: 'nowrap' }}>{p.earned_at ? new Date(p.earned_at).toLocaleDateString(coachLocale()) : ''}</span>
              <button type="button" onClick={() => waivePen(p)} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 2px', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: t.INK, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{tr('coach:case.waive', { defaultValue: 'WAIVE' })}</span>
              </button>
            </div>
          ))}
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.waiveHint', { defaultValue: "Waiving adds the points back — use it when a miss wasn't on {name}", name: first })}</div>
        </div>
      )}

      {/* ACCOUNTABILITY — set a weekly commitment (unchanged form/handlers). */}
      {clientUid && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.setCommitment', { defaultValue: 'ACCOUNTABILITY · SET A COMMITMENT' })} />}
          {!commitForm ? (
            <button type="button" onClick={() => setCommitForm(true)} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 0', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK }}>
              <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{tr('coach:case.proposeCommitment', { defaultValue: '+ PROPOSE A WEEKLY COMMITMENT →' })}</span>
            </button>
          ) : (
            <div style={{ borderLeft: `3px solid ${t.INK}33`, padding: '2px 0 2px 11px' }}>
              {[[tr('coach:case.commitWorkouts', { defaultValue: 'Workouts' }), 'workouts', 0, 14], [tr('coach:case.commitHabits', { defaultValue: 'Habit check-offs' }), 'habits', 0, 21]].map(([label, key, lo, hi], idx) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: idx ? 12 : 0 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" onClick={() => setCf(s => ({ ...s, [key]: Math.max(lo, s[key] - 1) }))} style={{ width: 28, height: 28, borderRadius: 0, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 15, cursor: 'pointer' }}>−</button>
                    <span style={{ minWidth: 20, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{cf[key]}</span>
                    <button type="button" onClick={() => setCf(s => ({ ...s, [key]: Math.min(hi, s[key] + 1) }))} style={{ width: 28, height: 28, borderRadius: 0, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 15, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{tr('coach:case.weeklyCheckin', { defaultValue: 'Weekly check-in' })}</div>
                <button type="button" onClick={() => setCf(s => ({ ...s, checkin: !s.checkin }))} style={{ minHeight: 44, padding: '10px 2px', background: 'transparent', border: 0, color: t.INK, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  <span style={{ borderBottom: cf.checkin ? `1px solid ${heat}` : `1px solid ${t.INK}4d`, paddingBottom: 2 }}>{cf.checkin ? tr('coach:common.yes', { defaultValue: 'YES' }) : tr('coach:common.no', { defaultValue: 'NO' })}</span>
                </button>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}><span>{tr('coach:case.stake', { defaultValue: 'STAKE' })}</span><span style={{ color: heat }}>{tr('coach:case.stakePts', { defaultValue: '{n} pts', n: cf.stake })}</span></div>
                <input type="range" aria-label={tr('coach:case.stakePointsAria', { defaultValue: 'Stake points' })} min={5} max={50} step={5} value={cf.stake} onChange={e => setCf(s => ({ ...s, stake: Number(e.target.value) }))} style={{ width: '100%', marginTop: 8, accentColor: heat }} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 18 }}>
                <button type="button" disabled={cfBusy} onClick={proposeCommit} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, opacity: cfBusy ? 0.6 : 1 }}>
                  <span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{cfBusy ? tr('coach:case.proposing', { defaultValue: 'PROPOSING…' }) : tr('coach:case.propose', { defaultValue: 'PROPOSE →' })}</span>
                </button>
                <button type="button" onClick={() => setCommitForm(false)} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:common.cancelUpper', { defaultValue: 'CANCEL' })}</button>
              </div>
            </div>
          )}
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.acceptsBeforeStake', { defaultValue: '{name} accepts before any points are staked', name: first })}</div>
        </div>
      )}

      {/* SCREENING — health profile (PAR-Q); redaction when absent. */}
      {clientUid && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.screening', { defaultValue: 'SCREENING · HEALTH PROFILE' })} meta={cKit.health ? (cKit.health.flagged ? tr('coach:case.flagged', { defaultValue: 'FLAGGED' }) : tr('coach:case.allClear', { defaultValue: 'ALL CLEAR' })) : undefined} />}
          {cKit.health ? (() => {
            const h = cKit.health;
            const rxLine = h.rxMeds === 'yes' ? (h.medications || tr('coach:case.yesNotListed', { defaultValue: 'Yes — not listed' })) : h.rxMeds === 'no' ? tr('coach:case.none', { defaultValue: 'None' }) : (h.medications || null);
            const condLine = [(Array.isArray(h.conditionTags) ? h.conditionTags.join(' · ') : ''), (h.conditions || '')].filter(Boolean).join(' — ') || null;
            const allergyLine = h.allergies === 'yes' ? (h.allergyDetails || tr('coach:case.yesNotListed', { defaultValue: 'Yes — not listed' })) : h.allergies === 'no' ? tr('coach:case.noneReported', { defaultValue: 'None reported' }) : null;
            const pregLine = h.pregnancy === 'yes' ? tr('coach:case.pregnancyYes', { defaultValue: 'Yes — pregnant or ≤6 months postpartum' }) : null;
            const rows = [
              [tr('coach:case.rowRx', { defaultValue: 'Prescription medication' }), rxLine],
              [tr('coach:case.rowAllergies', { defaultValue: 'Allergies' }), allergyLine],
              [tr('coach:case.rowPregnancy', { defaultValue: 'Pregnancy / postpartum' }), pregLine],
              [tr('coach:case.rowConditions', { defaultValue: 'Medical conditions' }), condLine],
              [tr('coach:case.rowInjuries', { defaultValue: 'Injuries & surgeries' }), h.injuries],
              [tr('coach:case.rowEmergency', { defaultValue: 'Emergency contact' }), h.emergency && (h.emergency.name || h.emergency.phone) ? `${h.emergency.name || ''} ${h.emergency.phone || ''}`.trim() : null],
            ];
            return (
              <div style={{ borderLeft: `3px solid ${h.flagged ? t.RUST : heat}`, padding: '2px 0 2px 11px' }}>
                {rows.map(([l, v]) => v ? (
                  <div key={l} style={{ marginTop: 10 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{l}</div>
                    <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.45 }}>{v}</div>
                  </div>
                ) : null)}
                <div style={{ marginTop: 11, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:case.screeningShared', { defaultValue: 'Shared with linked coaches for safety · completed {date}', date: h.consentAt ? new Date(h.consentAt).toLocaleDateString(coachLocale()) : '' })}</div>
              </div>
            );
          })() : (window.BSTRedact ? <window.BSTRedact INK={t.INK} label={tr('coach:case.noHealthRedact', { defaultValue: 'NO HEALTH PROFILE ON FILE' })} /> : emptyNote(tr('coach:case.noHealth', { defaultValue: 'No health profile on file yet' })))}
        </div>
      )}

      {/* BODY — latest measurements (dot-leader rows). */}
      {clientUid && cKit.meas.length > 0 && (
        <div style={{ marginTop: 22 }}>
          {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.bodyMeasurements', { defaultValue: 'BODY · LATEST MEASUREMENTS' })} />}
          {cKit.meas.map((m, i) => (
            <div key={m.site} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: t.INK, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{m.site}</span>
              <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK50, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{String(m.measured_on).slice(5)}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Number(m.value)} {m.unit}</span>
            </div>
          ))}
        </div>
      )}

      {/* PRIVATE — coach notes (quiet form, unchanged — two-tier rule). */}
      <div style={{ marginTop: 22 }}>
        {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:case.privateNotes', { defaultValue: 'PRIVATE · COACH NOTES' })} />}
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, color: t.INK70 }}>
          {isNutri ? tr('coach:case.notesBodyNutri', { defaultValue: 'Clinical notes for {name} — history, compliance, habits, and messaging context live here.', name: client.n }) : tr('coach:case.notesBodyTrainer', { defaultValue: 'Training notes for {name} — history, compliance, habits, and messaging context live here.', name: client.n })}
        </div>
      </div>
    </div>
  );

  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        {headerBlock}
        {view === 'manage' ? manageView : profileView}
      </div>
      <BSFooter left={isNutri ? tr('coach:case.footerNutri', { defaultValue: 'Client plan' }) : tr('coach:case.footerTrainer', { defaultValue: 'Full profile' })} right={client.n} />
    </BSPage>
  );
}


// Editable draft — after an AI (or blank) generation the coach lands here to
// customize the name, the sections (add / rename / remove / reorder-by-edit),
// and a note, then publishes. Shared by the trainer + nutritionist pages.
// PR E — method-authoring state: stored steps ({t, min?, passive?, station?} or
// plain strings) normalize to raw {t, station} for editing; windows RE-DERIVE
// from the step's own text at publish (bsAuthorStep — the no-fabrication rule
// at the source), so a stale stored `min` can never outlive a text edit.
const bsEditorSteps = (steps) => (Array.isArray(steps)
  ? steps.map((s) => (typeof s === 'string' ? { t: s, station: null } : { t: (s && typeof s.t === 'string') ? s.t : '', station: (s && s.station) || null }))
  : undefined);

function BSCoachDraftEditor({ t, accent, accentInk = '#04201d', typeName, blockLabel, initialName, initialBlocks, initialNote, initialMedia, initialDays, stepAuthoring = false, perDayAuthoring = false, loadCapture = false, onPublish, onCancel }) {
  const tr = useShapeTr();
  const blockLabelText = blockLabel || tr('coach:editor.sections', { defaultValue: 'Sections' });
  // ⚠ Seven STATIC keys, not `coach:editor.dow.${d}`. A template-literal key is
  // invisible to the catalog key-sync, so it passes every check and then ships
  // English into all 13 locales — the documented failure of this codebase's i18n
  // tooling, not a style preference.
  const DOW_LABELS = [
    tr('coach:editor.dowMon', { defaultValue: 'MON' }),
    tr('coach:editor.dowTue', { defaultValue: 'TUE' }),
    tr('coach:editor.dowWed', { defaultValue: 'WED' }),
    tr('coach:editor.dowThu', { defaultValue: 'THU' }),
    tr('coach:editor.dowFri', { defaultValue: 'FRI' }),
    tr('coach:editor.dowSat', { defaultValue: 'SAT' }),
    tr('coach:editor.dowSun', { defaultValue: 'SUN' }),
  ];
  const hydrate = (list) => (list || []).map((b) => {
    const steps = b && bsEditorSteps(b.steps);
    return steps ? { ...b, steps } : b;
  });
  const [name, setName] = useStateBSP(initialName || '');
  const [blocks, setBlocks] = useStateBSP(hydrate(initialBlocks));
  // Per-day overrides (contract §5.1). PRESENCE in this list IS authorship —
  // an entry with `blocks: []` is a day the coach explicitly emptied and must
  // stay empty, which is why authorship can't be inferred from non-emptiness.
  // Absence means the day inherits `blocks` (the DEFAULT menu).
  const [days, setDays] = useStateBSP(perDayAuthoring
    ? bsCanonicalDays(initialDays).map((d) => ({ dow: d.dow, blocks: hydrate(d.blocks) }))
    : []);
  const [activeDow, setActiveDow] = useStateBSP(null); // null = the DEFAULT menu
  const [note, setNote] = useStateBSP(initialNote || '');
  const [media, setMedia] = useStateBSP(initialMedia || []);
  const [uploading, setUploading] = useStateBSP(false);
  const mediaInputRef = React.useRef(null);
  const [status, setStatus] = useStateBSP('');
  // ⚠ Find the active day BY `dow`, never by array position. `days` is a SPARSE
  // list, so `days[1]` is whatever weekday happens to sit second — for
  // [{dow:0},{dow:2},{dow:4}] that is Wednesday. An editor that indexed by
  // position would write Tuesday's edits onto Wednesday's menu, and it would be
  // the only thing in the system reading the array that way (bsPlanWeek keys a
  // Map on entry.dow).
  const dayEntry = activeDow == null ? null : (days.find((d) => d.dow === activeDow) || null);
  // `null` = this day is INHERITED: it has no list of its own yet, so there is
  // nothing to edit until the coach starts one. Distinct from `[]`, which is a
  // day deliberately emptied.
  const activeBlocks = activeDow == null ? blocks : (dayEntry ? dayEntry.blocks : null);
  const editBlocks = (fn) => {
    if (activeDow == null) { setBlocks(fn); return; }
    setDays((list) => list.map((d) => (d.dow === activeDow ? { ...d, blocks: fn(d.blocks) } : d)));
  };
  // Starting a day from the default is a COPY, not a reference: editing Tuesday
  // must not edit the menu every other day inherits.
  const startDay = () => {
    if (activeDow == null) return;
    const stamp = Date.now();
    setDays((list) => [...list, { dow: activeDow, blocks: blocks.map((b, i) => ({ ...b, id: `d${activeDow}b${i}-${stamp}` })) }]);
  };
  // The explicit un-clear §6 requires: without it, a day emptied on purpose has
  // no way back to inheriting, because "empty" is a real override.
  //
  // Confirm first — this discards the day's whole menu: block text, attached
  // clips and authored method steps, with no undo. That is a strictly larger
  // blast radius than deleting a grocery list, which this file already guards
  // exactly this way. Only asked when there is something to lose.
  const inheritDay = async () => {
    const losing = (dayEntry && dayEntry.blocks.length) || 0;
    if (losing && window.bsAskConfirm && !(await window.bsAskConfirm({
      title: tr('coach:editor.dayInheritTitle', { defaultValue: 'Use the default menu for this day?' }),
      name: DOW_LABELS[activeDow],
      message: tr('coach:editor.dayInheritMsg', { defaultValue: 'This deletes what you wrote for this day.' }),
      confirmLabel: tr('coach:editor.dayInheritConfirm', { defaultValue: 'Use the default' }),
    }))) return;
    setDays((list) => list.filter((d) => d.dow !== activeDow));
  };
  const pickMedia = async (e) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length) return;
    if (!window.ShapeCoachMedia?.upload) { setStatus(tr('coach:editor.signInUpload', { defaultValue: 'Sign in to upload media.' })); setTimeout(() => setStatus(''), 1800); return; }
    setUploading(true);
    for (const f of files) {
      try { const m = await window.ShapeCoachMedia.upload(f); if (m && m.url) setMedia(list => [...list, m]); }
      catch (err) { setStatus(String(err?.message || tr('coach:editor.uploadFailed', { defaultValue: 'Upload failed' }))); setTimeout(() => setStatus(''), 2200); }
    }
    setUploading(false);
  };
  const rmMedia = (i) => setMedia(list => list.filter((_, j) => j !== i));
  // Per-exercise clip attach — one hidden input, target block tracked by ref.
  // Reuses the media section's ShapeCoachMedia upload + signed-out guard.
  const clipInputRef = React.useRef(null);
  const clipTargetRef = React.useRef(null);
  const openClip = (i) => { clipTargetRef.current = i; if (clipInputRef.current) clipInputRef.current.click(); };
  const pickClip = async (e) => {
    const file = (e.target.files || [])[0];
    if (e.target) e.target.value = '';
    const i = clipTargetRef.current;
    clipTargetRef.current = null;
    if (!file || i == null) return;
    if (!window.ShapeCoachMedia?.upload) { setStatus(tr('coach:editor.signInUpload', { defaultValue: 'Sign in to upload media.' })); setTimeout(() => setStatus(''), 1800); return; }
    setUploading(true);
    try { const m = await window.ShapeCoachMedia.upload(file); if (m && m.url) editBlocks(list => list.map((b, j) => (j === i ? { ...b, video: m.url } : b))); }
    catch (err) { setStatus(String(err?.message || tr('coach:editor.uploadFailed', { defaultValue: 'Upload failed' }))); setTimeout(() => setStatus(''), 2200); }
    setUploading(false);
  };
  const clearClip = (i) => editBlocks(list => list.map((b, j) => (j === i ? { ...b, video: undefined } : b)));
  const clipBtnStyle = { minHeight: 44, display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', color: accent, whiteSpace: 'nowrap', padding: '0 2px' };
  const setBlock = (i, v) => editBlocks(bs => bs.map((b, j) => (j === i ? { ...b, text: v } : b)));
  // §3.2a capture. Stored as the CHIP VALUE the coach picked, never a number:
  // the mapping to minutes/RPE runs once, at publish, through the one enum in
  // planOutline. Picking the selected chip again CLEARS it — a coach who
  // mis-tapped must be able to get back to honestly-absent, and there is no
  // other way out of a chip row.
  const setBlockChip = (i, key, v) => editBlocks(bs => bs.map((b, j) => {
    if (j !== i) return b;
    if (b[key] === v) { const { [key]: _drop, ...rest } = b; return rest; }
    return { ...b, [key]: v };
  }));
  // No per-day cap here, deliberately: delivery serves an override in full
  // (planOutline), so there is nothing for the editor to protect the coach
  // from. An earlier revision refused the 41st block on a day, and that turned
  // into a trap — fork a day from a large default, trim the default afterwards,
  // and the day became unpublishable with no non-destructive way out.
  const addBlock = () => editBlocks(bs => [...bs, { id: 'b' + Date.now() + Math.round(Math.random() * 1e4), text: '' }]);
  const rmBlock = (i) => editBlocks(bs => bs.filter((_, j) => j !== i));
  // PR E — per-block method steps (meal items → tier-1 cookable at the source).
  const patchSteps = (bi, fn) => editBlocks(bs => bs.map((b, j) => (j === bi ? { ...b, steps: fn(b.steps || []) } : b)));
  const addStep = (bi) => patchSteps(bi, (ss) => [...ss, { t: '', station: null }]);
  const rmStep = (bi, si) => patchSteps(bi, (ss) => ss.filter((_, k) => k !== si));
  const setStepText = (bi, si, v) => patchSteps(bi, (ss) => ss.map((s, k) => (k === si ? { ...s, t: v } : s)));
  const setStepStation = (bi, si, v) => patchSteps(bi, (ss) => ss.map((s, k) => (k === si ? { ...s, station: v || null } : s)));
  const stationOpt = (st) => tr(`cook:prep.station.${st}`, { defaultValue: { oven: 'in the oven', stove: 'on the stove', board: 'on the board', off: 'resting' }[st] || st });
  const lbl = (s) => <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent, marginBottom: 8 }}>{s}</div>;
  const inputStyle = { width: '100%', boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '12px 13px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' };
  return (
    <BSPage>
      {/* corners: false — this editor holds the coach's unsaved draft in local
          state, and the self avatar early-returns the shell into Settings, which
          unmounts it. CANCEL is the way out of an editor. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow({ corners: false })}</div>
      <div style={{ padding: `12px ${t.padX}px 28px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>{tr('coach:editor.editEyebrow', { defaultValue: 'EDIT · {type}', type: (typeName || '').toUpperCase() })}</div>
          <button onClick={onCancel} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.cancelUpper', { defaultValue: 'CANCEL' })}</button>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{tr('coach:editor.customize', { defaultValue: 'Customize' })} <span style={{ fontStyle: 'italic', color: accent }}>{tr('coach:editor.yourType', { defaultValue: 'your {type}.', type: typeName })}</span></div>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50 }}>{tr('coach:editor.tweakBelow', { defaultValue: "Tweak anything below, then publish. Nothing's live until you do." })}</div>

        <div style={{ marginTop: 20 }}>{lbl(tr('coach:editor.name', { defaultValue: 'NAME' }))}<input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></div>

        {/* Per-day menus (contract §6) — meal-plan/diet drafts only. DEFAULT is
            the menu every unauthored day inherits, so a coach who never opens a
            day tab publishes exactly what they publish today. */}
        {perDayAuthoring && (
          <div style={{ marginTop: 18 }}>
            {lbl(tr('coach:editor.dayLabel', { defaultValue: 'MENU · BY DAY' }))}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {[[null, tr('coach:editor.dayDefault', { defaultValue: 'DEFAULT' })], ...DOW_LABELS.map((label, i) => [i, label])].map(([dow, label]) => {
                const on = activeDow === dow;
                const authored = dow != null && days.some((d) => d.dow === dow);
                return (
                  <button key={String(dow)} type="button" onClick={() => setActiveDow(dow)}
                    style={{ minHeight: 44, flex: '0 0 auto', borderRadius: 10, border: `1px solid ${on ? accent : t.RULE}`, background: on ? accent : 'transparent', color: on ? accentInk : t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', padding: '0 11px', cursor: 'pointer' }}>
                    {label}{authored ? ' ·' : ''}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK50 }}>
              {activeDow == null
                ? tr('coach:editor.dayDefaultHint', { defaultValue: 'Every day you don’t set serves this menu.' })
                : tr('coach:editor.dayAuthoredHint', { defaultValue: 'A dot marks a day with its own menu.' })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {lbl(activeDow == null ? blockLabelText : tr('coach:editor.dayBlockLabel', { defaultValue: '{day} · {label}', day: DOW_LABELS[activeDow], label: blockLabelText }))}
            {activeBlocks && <button onClick={addBlock} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: accent }}>{tr('coach:editor.add', { defaultValue: '+ ADD' })}</button>}
          </div>
          {/* An inherited day shows what it WILL serve, greyed — §5.2's
              inheritance made visible instead of discovered at assign time. */}
          {activeDow != null && !activeBlocks && (
            <div style={{ borderRadius: 12, border: `1px dashed ${t.RULE}`, background: t.PAPER2, padding: '14px 13px' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{tr('coach:editor.dayInherits', { defaultValue: 'SERVES THE DEFAULT MENU' })}</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {blocks.length === 0
                  ? <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:editor.noneYet', { defaultValue: 'None yet — add one.' })}</div>
                  : blocks.map((b, i) => (
                      <div key={b.id || i} style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50 }}>{b.text || '—'}</div>
                    ))}
              </div>
              <button type="button" onClick={startDay} style={{ marginTop: 12, minHeight: 44, width: '100%', borderRadius: 10, border: `1px solid ${accent}`, background: 'transparent', color: accent, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', cursor: 'pointer' }}>{tr('coach:editor.dayStart', { defaultValue: 'GIVE THIS DAY ITS OWN MENU' })}</button>
            </div>
          )}
          <input ref={clipInputRef} type="file" accept="video/*" onChange={pickClip} style={{ display: 'none' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(activeBlocks || []).map((b, i) => (
              <div key={b.id}>
                <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50 }}>{String(i + 1).padStart(2, '0')}</span>
                  <input value={b.text} onChange={(e) => setBlock(i, e.target.value)} style={inputStyle} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {b.video ? (<>
                      <button type="button" onClick={() => window.open(b.video, '_blank', 'noopener,noreferrer')} aria-label={tr('coach:editor.playClipAria', { defaultValue: 'Play clip for {name}', name: b.text || tr('coach:editor.exercise', { defaultValue: 'exercise' }) })} style={clipBtnStyle}>{tr('coach:editor.playClip', { defaultValue: '▶ CLIP' })}</button>
                      <button type="button" onClick={() => clearClip(i)} aria-label={tr('coach:editor.removeClipAria', { defaultValue: 'Remove clip from {name}', name: b.text || tr('coach:editor.exercise', { defaultValue: 'exercise' }) })} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', color: t.INK50, fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: '0 3px' }}>×</button>
                    </>) : (
                      <button type="button" onClick={() => openClip(i)} disabled={uploading} aria-label={tr('coach:editor.attachClipAria', { defaultValue: 'Attach a video clip to {name}', name: b.text || tr('coach:editor.exercise', { defaultValue: 'exercise' }) })} style={{ ...clipBtnStyle, opacity: uploading ? 0.5 : 1 }}>{tr('coach:editor.addClip', { defaultValue: '＋ CLIP' })}</button>
                    )}
                    <button type="button" onClick={() => rmBlock(i)} aria-label={tr('coach:common.remove', { defaultValue: 'Remove' })} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', color: t.INK50, fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}>×</button>
                  </span>
                </div>
                {/* Deploy 2b — the planned-load pair (SPEC-guardrails.md §3.2a).
                    Shown ONLY where a block IS a session, read through
                    planOutline's own classifier rather than a fourth opinion.
                    An exercise block has no length or effort of its own — the
                    session is the whole week — so offering the row there would
                    invite a figure the guardrail must then refuse. */}
                {loadCapture && bsBlockIsSession(b.text) && (
                  <div style={{ margin: '6px 0 4px 28px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: t.INK50, width: '100%' }}>
                      {tr('coach:editor.loadLabel', { defaultValue: 'PLANNED LOAD · OPTIONAL' })}
                    </span>
                    {[['plannedLength', Object.keys(BS_LENGTH_CHIPS), tr('coach:editor.lengthAria', { defaultValue: 'Planned length for {name}', name: b.text || tr('coach:editor.session', { defaultValue: 'session' }) })],
                      ['plannedEffort', Object.keys(BS_EFFORT_CHIPS), tr('coach:editor.effortAria', { defaultValue: 'Planned effort for {name}', name: b.text || tr('coach:editor.session', { defaultValue: 'session' }) })]].map(([key, opts, aria]) => (
                      <span key={key} role="group" aria-label={aria} style={{ display: 'flex', gap: 4 }}>
                        {opts.map((opt) => {
                          const on = b[key] === opt;
                          return (
                            <button key={opt} type="button" onClick={() => setBlockChip(i, key, opt)} aria-pressed={on}
                              style={{ minHeight: 34, borderRadius: 8, border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : 'transparent', color: on ? accent : t.INK50, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.04em', padding: '0 7px', cursor: 'pointer' }}>
                              {opt}
                            </button>
                          );
                        })}
                      </span>
                    ))}
                    {/* Honest about what absence COSTS, without nagging: a blank
                        pair is a real answer the core reads as incomplete_week,
                        and the coach should know the week goes unscored. */}
                    {(!b.plannedLength || !b.plannedEffort) && (
                      <div style={{ width: '100%', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', color: t.INK50 }}>
                        {tr('coach:editor.loadHint', { defaultValue: 'Both are needed to check this week against their history — leave blank and it publishes unscored.' })}
                      </div>
                    )}
                  </div>
                )}
                {/* PR E — the method: ordered cooking steps on a meal block. A step
                    with a station AND a duration STATED IN ITS OWN TEXT becomes a
                    hands-off window (Cook Mode's board can interleave around it);
                    a station with no stated time downgrades honestly — the hint
                    says why. `min` is never typed, only derived (bsAuthorStep). */}
                {stepAuthoring && (
                  <div style={{ margin: '6px 0 4px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(() => { const _lastAuthorable = (b.steps || []).reduce((acc, s, k) => (bsAuthorStep(s.t, s.station) ? k : acc), -1); return (b.steps || []).map((s, si) => {
                      const derived = bsAuthorStep(s.t, s.station);
                      // A TERMINAL window must be walk-away ('off') — a live-fire
                      // final hold is dropped at ingestion (finishCookable), so
                      // the editor never confirms one it won't ship. Terminal =
                      // the last NON-EMPTY step (publish drops blank rows first),
                      // not the raw last row (Codex — a trailing blank hid it).
                      const liveFireTerminal = !!(derived && derived.passive && si === _lastAuthorable && derived.station !== 'off');
                      const isWin = !!(derived && derived.passive && !liveFireTerminal);
                      const wantsWin = !!(s.station && !isWin && String(s.t || '').trim());
                      return (
                        <div key={si}>
                          <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto auto', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK50 }}>{String.fromCharCode(97 + si)}.</span>
                            <input value={s.t} onChange={(e) => setStepText(i, si, e.target.value)} placeholder={tr('coach:editor.stepPh', { defaultValue: 'Step — “Simmer 15 minutes, lid on.”' })} style={{ ...inputStyle, padding: '9px 11px', fontSize: 12.5 }} />
                            <select value={s.station || ''} onChange={(e) => setStepStation(i, si, e.target.value)} aria-label={tr('coach:editor.handsOffAria', { defaultValue: 'Hands-off station for step {n}', n: si + 1 })} style={{ minHeight: 40, borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: s.station ? accent : t.INK50, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', padding: '0 6px', maxWidth: 104 }}>
                              <option value="">{tr('coach:editor.handsOn', { defaultValue: 'Hands-on' })}</option>
                              {BS_STATIONS.map((st) => <option key={st} value={st}>{stationOpt(st)}</option>)}
                            </select>
                            <button type="button" onClick={() => rmStep(i, si)} aria-label={tr('coach:common.remove', { defaultValue: 'Remove' })} style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', color: t.INK50, fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}>×</button>
                          </div>
                          {isWin && <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', color: accent }}>◷ {tr('coach:editor.windowOk', { defaultValue: '{min} min hands-off {station} — the cook can work on another dish', min: derived.min, station: stationOpt(derived.station) })}</div>}
                          {wantsWin && <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:editor.windowHint', { defaultValue: 'State a time of 4+ minutes in the step (“roast 15 minutes”) to make it hands-off.' })}</div>}
                        </div>
                      );
                    }); })()}
                    <button type="button" onClick={() => addStep(i)} style={{ alignSelf: 'flex-start', minHeight: 40, display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', color: accent, padding: '0 2px' }}>
                      {(b.steps || []).length === 0 ? tr('coach:editor.addMethod', { defaultValue: '＋ METHOD · COOKING STEPS' }) : tr('coach:editor.addStepRow', { defaultValue: '+ STEP' })}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {activeBlocks && activeBlocks.length === 0 && (
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, padding: '8px 2px' }}>
                {activeDow == null
                  ? tr('coach:editor.noneYet', { defaultValue: 'None yet — add one.' })
                  /* An emptied day is a real choice the client will see: nothing
                     served that day. Saying so is the difference between a
                     deliberate fast day and a page the coach thinks is broken. */
                  : tr('coach:editor.dayEmpty', { defaultValue: 'Nothing served this day.' })}
              </div>
            )}
          </div>
          {/* The explicit un-clear. Without it an emptied day can never go back
              to inheriting, because empty IS an override — §5.3. */}
          {activeDow != null && activeBlocks && (
            <button type="button" onClick={inheritDay} style={{ marginTop: 10, minHeight: 44, border: 0, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer', padding: '0 2px' }}>{tr('coach:editor.dayInherit', { defaultValue: '← BACK TO THE DEFAULT MENU' })}</button>
          )}
        </div>

        <div style={{ marginTop: 18 }}>{lbl(tr('coach:editor.coachNote', { defaultValue: 'COACH NOTE' }))}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={tr('coach:editor.notePlaceholder', { defaultValue: 'Anything the client should know…' })} style={{ ...inputStyle, lineHeight: 1.5, resize: 'vertical' }} /></div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {lbl(tr('coach:editor.media', { defaultValue: 'MEDIA · PHOTOS & VIDEOS' }))}
            <button onClick={() => mediaInputRef.current && mediaInputRef.current.click()} disabled={uploading} style={{ border: 0, background: 'transparent', cursor: uploading ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: accent, opacity: uploading ? 0.5 : 1 }}>{uploading ? tr('coach:editor.uploading', { defaultValue: 'UPLOADING…' }) : tr('coach:editor.upload', { defaultValue: '+ UPLOAD' })}</button>
          </div>
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple onChange={pickMedia} style={{ display: 'none' }} />
          {media.length === 0
            ? <div onClick={() => mediaInputRef.current && mediaInputRef.current.click()} style={{ borderRadius: 12, border: `1px dashed ${t.RULE}`, background: t.PAPER2, padding: '18px 13px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:editor.addMedia', { defaultValue: 'Add demo photos or videos' })}</div>
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK50 }}>{tr('coach:editor.showMoves', { defaultValue: 'Show clients the moves in this {type}', type: typeName })}</div>
              </div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {media.map((m, i) => (
                  <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1 / 1', background: t.PAPER2, border: `1px solid ${t.RULE}` }}>
                    {m.type === 'video'
                      ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                      : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {m.type === 'video' && <div style={{ position: 'absolute', bottom: 4, left: 4, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '1px 4px' }}>{tr('coach:editor.videoBadge', { defaultValue: 'VIDEO' })}</div>}
                    <button onClick={() => rmMedia(i)} aria-label={tr('coach:common.remove', { defaultValue: 'Remove' })} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, lineHeight: '18px', textAlign: 'center', cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
                ))}
              </div>}
        </div>

        <button onClick={async () => {
          // Steps persist in the DERIVED shape ({t, min?, passive?, station?}) —
          // windows re-derived from each step's own text at publish time, empty
          // rows dropped, so stored metadata can never drift from the text.
          const finish = (list) => (stepAuthoring
            ? list.map((b) => {
                const ds = (b.steps || []).map((s) => bsAuthorStep(s.t, s.station)).filter(Boolean).slice(0, 30);
                // Terminal live-fire windows drop to plain steps at publish too
                // (matching the ingestion guard), so stored data never carries a
                // window the cook surfaces would refuse.
                const li = ds.length - 1;
                if (li >= 0 && ds[li].passive === true && ds[li].station !== 'off') ds[li] = { t: ds[li].t };
                const { steps: _raw, ...rest } = b;
                return ds.length ? { ...rest, steps: ds } : rest;
              })
            : list);
          // §3.2a — the pair is mapped ONCE, here, through the one enum in
          // planOutline. The chip values are dropped after mapping so a stored
          // block never carries two representations of the same fact.
          //
          // ⚠ THE STAMP IS WRITTEN BY THE BUILDER AT THE MOMENT IT COLLECTS THE
          // PAIR — never inferred from contents. That is what lets a hop that
          // strips the field from EVERY session (the likelier bug, since
          // transforms apply uniformly) be told apart from a coach who skipped
          // the step. Content inspection alone catches only the partial drop.
          const stampLoad = (list) => (loadCapture
            ? list.map((b) => {
                if (!bsBlockIsSession(b.text)) return b;
                const { plannedLength, plannedEffort, ...rest } = b;
                const min = bsPlannedMinutes(plannedLength);
                const rpe = bsPlannedRpe(plannedEffort);
                // Stamp ONLY when the pair genuinely arrived. A half-answered
                // session stays unstamped rather than being recorded as
                // captured-with-a-hole, which the core would read as malformed
                // — a transport-bug report for what is really a blank field.
                if (min === undefined || rpe === undefined) return rest;
                return { ...rest, plannedMinutes: min, plannedRpe: rpe, loadCapture: 'per_session' };
              })
            : list);
          const pubBlocks = stampLoad(finish(blocks));
          // Canonicalized here, by the same module that reads it back, so the
          // stored winner for a duplicate dow is the one bsPlanWeek resolves.
          const pubDays = perDayAuthoring
            ? bsCanonicalDays(days).map((d) => ({ dow: d.dow, blocks: finish(d.blocks) }))
            : [];
          setStatus(tr('coach:editor.publishing', { defaultValue: 'Publishing…' }));
          // ⚠ `days` MUST cross this callback. The editor can track seven
          // authored days perfectly and still lose every one of them if the
          // payload drops the key — the plan reloads as the legacy repeated
          // menu and nothing errors. Omitted entirely when there is nothing to
          // say, so a draft with no per-day authoring publishes a payload
          // byte-identical to today's.
          await onPublish({ name, blocks: pubBlocks, note, media, ...(pubDays.length ? { days: pubDays } : {}) });
        }} style={{ width: '100%', marginTop: 24, borderRadius: 14, border: 0, background: accent, color: accentInk, padding: '16px', fontFamily: t.MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>{status || tr('coach:editor.publish', { defaultValue: 'Publish {type} →', type: typeName })}</button>
        <div style={{ marginTop: 12, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:editor.savesLibrary', { defaultValue: 'Saves to your library · you can edit again anytime' })}</div>
      </div>
      <BSFooter left={tr('coach:editor.footer', { defaultValue: 'Edit draft' })} right={typeName} />
    </BSPage>
  );
}

function BSTrainerPrograms({ initialTab = 'programs' } = {}) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const heat = bsProHeat(t, 'trainer');
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [showSoundtracks, setShowSoundtracks] = useStateBSP(false);
  const [drafting, setDrafting] = useStateBSP(false);
  const [desc, setDesc] = useStateBSP('');
  const [focus, setFocus] = useStateBSP('Full body');
  const [exp, setExp] = useStateBSP('Intermediate');
  const [equip, setEquip] = useStateBSP('Full gym');
  const [length, setLength] = useStateBSP('45 min');
  const [draftStatus, setDraftStatus] = useStateBSP('');
  const [sort, setSort] = useStateBSP('Popular');
  const [dupes, setDupes] = useStateBSP([]);
  const [serverPlans, setServerPlans] = useStateBSP(null); // synced coach_plans rows
  const [note, setNote] = useStateBSP('');
  const flash = (m) => { setNote(m); setTimeout(() => setNote(''), 1700); };
  const share = (name) => { try { navigator.clipboard?.writeText(`https://shape.app/p/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`); } catch (e) {} flash(tr('coach:plans.shareCopied', { defaultValue: 'Share link copied' })); };
  useEffectBSP(() => { if (window.ShapeCoachPlans?.list) window.ShapeCoachPlans.list('program').then(rows => { if (Array.isArray(rows)) setServerPlans(rows); }).catch(() => {}); }, []);
  const duplicate = async (p) => {
    const copy = { kind: 'program', name: tr('coach:plans.copyName', { defaultValue: '{name} (copy)', name: p.n }), meta: p.meta, price: p.price };
    if (window.ShapeCoachPlans?.create) { try { const row = await window.ShapeCoachPlans.create(copy); if (row) { setServerPlans(list => [row, ...(list || [])]); flash(tr('coach:plans.programDuplicated', { defaultValue: 'Program duplicated' })); return; } } catch (e) {} }
    setDupes(d => [{ n: copy.name, meta: p.meta, price: p.price }, ...d]); flash(tr('coach:plans.programDuplicated', { defaultValue: 'Program duplicated' }));
  };
  const cycleSort = () => setSort(s => s === 'Popular' ? 'Price' : s === 'Price' ? 'Rating' : 'Popular');

  // ── Add a clip to a published workout (WORKOUT VIDEOS station) ──
  const [clipSheet, setClipSheet] = useStateBSP(false);
  const [clipPlanId, setClipPlanId] = useStateBSP(null);
  const [clipUploading, setClipUploading] = useStateBSP(false);
  const clipVideoRef = React.useRef(null);
  const openClipAdder = () => {
    if (!serverPlans || !window.ShapeCoachMedia?.upload || !window.ShapeCoachPlans?.update) { flash(tr('coach:plans.clipSignIn', { defaultValue: 'Sign in and publish a plan to add workout clips' })); return; }
    if (!serverPlans.length) { flash(tr('coach:plans.clipPublishFirst', { defaultValue: 'Publish a plan first, then add a clip' })); return; }
    setClipSheet(true);
  };
  const pickPlanForClip = (id) => { setClipPlanId(id); if (clipVideoRef.current) clipVideoRef.current.click(); };
  const uploadClipToPlan = async (e) => {
    const file = (e.target.files || [])[0];
    if (e.target) e.target.value = '';
    const planId = clipPlanId;
    const plan = (serverPlans || []).find(p => p.id === planId);
    if (!file || !plan || !window.ShapeCoachMedia?.upload || !window.ShapeCoachPlans?.update) { flash(tr('coach:plans.clipFailed', { defaultValue: 'Could not add clip' })); return; }
    setClipUploading(true);
    try {
      const m = await window.ShapeCoachMedia.upload(file);
      if (m && m.url) {
        const nextDetail = { ...(plan.detail || {}), media: [...((plan.detail && plan.detail.media) || []), m] };
        const row = await window.ShapeCoachPlans.update({ id: plan.id, detail: nextDetail });
        const merged = (row && row.detail) ? row : { ...plan, detail: nextDetail };
        setServerPlans(list => (list || []).map(p => (p.id === plan.id ? merged : p)));
        flash(tr('coach:plans.clipAdded', { defaultValue: 'Clip added to {name}', name: plan.name }));
      }
    } catch (err) { flash(String(err?.message || tr('coach:editor.uploadFailed', { defaultValue: 'Upload failed' }))); }
    setClipUploading(false);
    setClipPlanId(null);
    setClipSheet(false);
  };
  const closeClipSheet = () => { setClipSheet(false); setClipPlanId(null); };
  // §3 (CodeRabbit a11y) — keyboard close: Escape dismisses the clip sheet while open.
  useEffectBSP(() => {
    if (!clipSheet || typeof window === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeClipSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clipSheet]);

  const basePrograms = [
    { n: 'Push / Pull / Legs', meta: '12 wk · 48 on it · 4.9 ★', price: '$120/mo' },
    { n: 'Starting Strength', meta: '8 wk · 31 on it · 4.8 ★', price: '$95' },
    { n: 'Fat Loss 101', meta: '12 wk · 22 on it · 4.7 ★', price: '$160' },
    { n: 'Hypertrophy Block', meta: '8 wk · 19 on it · 4.8 ★', price: '$110' },
  ];
  // §4 (CodeRabbit) — the PAID PLANS list only wants paid plans. Filter the
  // server-derived rows to buildType 'plan' (legacy rows w/o detail stay); local
  // dupes (no .id) always pass. Workout/program templates no longer leak in here.
  const customCards = (serverPlans || dupes)
    .filter(p => !p.id || !p.detail || p.detail.buildType === 'plan')
    .map(p => p.id ? { n: p.name, meta: p.meta || 'New program', price: p.price || '$—', id: p.id, server: true, detail: p.detail || null } : p);
  const numFrom = (s, re) => { const m = (s || '').match(re); return m ? parseFloat(m[1]) : 0; };
  const programs = (() => {
    // §5 (CodeRabbit) — the demo social-proof rows (48 on it · 4.9 ★) are a
    // signed-OUT preview only; a signed-in coach sees only their real
    // serverPlans-derived rows (customCards), with the empty-state redaction.
    const list = signedIn ? [...customCards] : [...customCards, ...basePrograms];
    if (sort === 'Price') return [...list].sort((a, b) => numFrom(b.price, /(\d+)/) - numFrom(a.price, /(\d+)/));
    if (sort === 'Rating') return [...list].sort((a, b) => numFrom(b.meta, /([\d.]+) ★/) - numFrom(a.meta, /([\d.]+) ★/));
    return [...list].sort((a, b) => numFrom(b.meta, /(\d+) on it/) - numFrom(a.meta, /(\d+) on it/));
  })();
  const cues = [
    { n: 'Push / Pull / Legs — demos', meta: '12 videos · 22 min · in 1 plan' },
    { n: 'Squat & deadlift form', meta: '8 videos · 14 min · in 3 plans' },
    { n: 'Warmup & mobility', meta: '6 videos · 9 min · in 4 plans' },
  ];
  const [tab, setTab] = useStateBSP('library');
  const TABS = [['library', tr('coach:plans.tabLibrary', { defaultValue: 'Library' })], ['soundtracks', tr('coach:plans.tabSoundtracks', { defaultValue: 'Soundtracks' })]];
  // Library sub-tabs. NOTE the labels: Plans = multi-week paid programs,
  // Programs = reusable weekly routines/templates, Workouts = single sessions.
  const [libTab, setLibTab] = useStateBSP('plans');
  const LIB_TABS = [['plans', tr('coach:plans.subPlans', { defaultValue: 'Plans' })], ['workouts', tr('coach:plans.subWorkouts', { defaultValue: 'Workouts' })], ['programs', tr('coach:plans.subPrograms', { defaultValue: 'Programs' })]];
  const [buildType, setBuildType] = useStateBSP('plan'); // plan | workout | program
  const [blankMode, setBlankMode] = useStateBSP(false); // false = AI draft, true = build from scratch
  const BUILD_LABEL = { plan: tr('coach:plans.buildPlan', { defaultValue: 'plan' }), workout: tr('coach:plans.buildWorkout', { defaultValue: 'workout' }), program: tr('coach:plans.buildProgram', { defaultValue: 'program' }) };
  const openDraft = (type, blank = false) => { setBuildType(type); setBlankMode(blank); setDrafting(true); };
  const [editDraft, setEditDraft] = useStateBSP(null); // generated/blank draft being customized before publish
  const [assignPlan, setAssignPlan] = useStateBSP(null); // catalogue plan being assigned to a client
  // `days` is destructured and carried even though the trainer editor never
  // authors it (perDayAuthoring is nutrition-only): the callback contract lives
  // on the editor, and a receiver that silently drops a field the editor may one
  // day send is exactly how this feature would die without erroring.
  const publishDraft = async ({ name, blocks, note, media, days }) => {
    const typeName = BUILD_LABEL[buildType];
    const payload = { kind: 'program', name: name || `${focus} ${typeName}`, meta: `${typeName} · ${length} · ${exp.toLowerCase()}`, price: buildType === 'plan' ? '$110' : null, detail: { buildType, focus, exp, equip, length, blocks, note, media: media || [], ...(days && days.length ? { days } : {}) } };
    if (window.ShapeCoachPlans?.create) { try { const row = await window.ShapeCoachPlans.create(payload); if (row) setServerPlans(list => [row, ...(list || [])]); } catch (e) {} }
    flash(tr('coach:plans.published', { defaultValue: '{type} published', type: `${typeName.charAt(0).toUpperCase()}${typeName.slice(1)}` }));
    setEditDraft(null); setDrafting(false);
  };
  // Single day workouts — demo catalogue (signed-OUT preview only; §5 CodeRabbit).
  const workouts = signedIn ? [] : [
    { n: 'Lower Push — Peak', meta: '6 lifts · 62 min · RPE 8' },
    { n: 'Upper Pull — Volume', meta: '7 lifts · 58 min · RPE 7.5' },
    { n: 'Tempo Run · Zone 2', meta: '45 min · cardio · Z2' },
    { n: 'Full-body Conditioning', meta: '5 rounds · 35 min · RPE 8' },
    { n: 'Deload Circuit', meta: '4 lifts · 40 min · RPE 6' },
    { n: 'Upper Body — Hypertrophy', meta: '7 lifts · 55 min · RPE 7.5' },
    { n: 'Lower Body — Strength', meta: '5 lifts · 60 min · RPE 8' },
    { n: 'Push Day', meta: '6 lifts · 50 min · RPE 8' },
    { n: 'Pull Day', meta: '6 lifts · 50 min · RPE 7.5' },
  ];
  // Reusable weekly routines / templates (the "Programs" sub-tab) — demo (signed-OUT only; §5 CodeRabbit).
  const routines = signedIn ? [] : [
    { n: '5-day Upper / Lower', meta: '5 days/wk · 8-week block' },
    { n: '3-day Full Body', meta: '3 days/wk · beginner' },
    { n: 'PPL · 6-day split', meta: '6 days/wk · intermediate' },
    { n: 'Bro split · 5-day', meta: '5 days/wk · hypertrophy' },
  ];
  // Clients enrolled per paid plan (shown under the Plans sub-tab) — demo facepiles
  // carry fabricated "N on it" counts, so signed-OUT preview only (§5 CodeRabbit).
  const enrolled = signedIn ? [] : [
    { prog: 'Push / Pull / Legs', n: 48, who: [['A', t.RUST], ['J', '#3b7de0'], ['C', t.AMBER]] },
    { prog: 'Starting Strength', n: 31, who: [['R', t.AMBER], ['P', '#3b7de0']] },
    { prog: 'Fat Loss 101', n: 22, who: [['P', '#8a5cf6'], ['D', t.RUST]] },
    { prog: 'Hypertrophy Block', n: 19, who: [['S', '#2f7d4f']] },
  ];
  const libBuild = ({ plans: 'plan', workouts: 'workout', programs: 'program' })[libTab] || 'plan';

  if (showSoundtracks) return <BSProSoundtracks role="trainer" onBack={() => setShowSoundtracks(false)} />;

  // ── Assign a catalogue plan to a linked client ──
  if (assignPlan) return <BSProAssignPage role="trainer" plan={assignPlan} onBack={() => setAssignPlan(null)} onDone={() => { setAssignPlan(null); flash(tr('coach:plans.assignedTrain', { defaultValue: "Assigned — it's on their Train tab" })); }} />;

  // ── Customize the generated/blank draft before publishing ──
  // `loadCapture` is TRAINING-ONLY. The guardrail's universe is training load
  // (sRPE = RPE x minutes); a meal plan has no session to carry a length or an
  // effort, so offering the row on the nutritionist editor would collect a
  // figure nothing scores.
  if (editDraft) return <BSCoachDraftEditor t={t} accent={teal} accentInk="#04201d" typeName={BUILD_LABEL[buildType]} blockLabel={editDraft.blockLabel} initialName={editDraft.name} initialBlocks={editDraft.blocks} initialNote={editDraft.note} initialMedia={editDraft.media} loadCapture onPublish={publishDraft} onCancel={() => { setEditDraft(null); setDrafting(false); }} />;

  // ── AI draft sheet (workout builder) ──
  if (drafting) {
    const chips = (label, value, set, opts) => (
      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 9 }}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map(o => {
            const on = value === o;
            return <button key={o} onClick={() => set(o)} style={{ borderRadius: 999, padding: '9px 15px', cursor: 'pointer', border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}1c` : 'transparent', color: on ? teal : t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em' }}>{o}</button>;
          })}
        </div>
      </div>
    );
    const generate = async () => {
      setDraftStatus(blankMode ? tr('coach:plans.openingEditor', { defaultValue: 'Opening editor…' }) : tr('coach:plans.generating', { defaultValue: 'Generating…' }));
      if (!blankMode) { try { await window.ShapeAI?.generatePlanDraft?.({ kind: buildType, goal: focus, client: '', level: exp, duration: length, preferences: `${desc} · ${equip}`, equipment: equip }); } catch (e) {} }
      const mk = (arr) => arr.map((s, i) => ({ id: 'b' + i, text: s }));
      const outline = blankMode ? mk(['', '', '']) : (buildType === 'workout'
        ? mk(['Warm-up · 8 min', `Main lift — ${focus}`, 'Secondary compound · 4×8', 'Accessory superset · 3×12', 'Core finisher', 'Cooldown · mobility'])
        : buildType === 'program'
        ? mk(['Mon — Upper (push)', 'Tue — Lower (squat)', 'Wed — Rest / mobility', 'Thu — Upper (pull)', 'Fri — Lower (hinge)', 'Sat — Conditioning', 'Sun — Rest'])
        : mk(['Week 1 — Accumulation', 'Week 2 — Accumulation', 'Week 3 — Intensification', 'Week 4 — Deload', 'Week 5 — Peak', 'Week 6 — Retest']));
      const blockLabel = buildType === 'workout' ? tr('coach:plans.blockExercises', { defaultValue: 'Exercises' }) : buildType === 'program' ? tr('coach:plans.blockWeeklySplit', { defaultValue: 'Weekly split' }) : tr('coach:plans.blockWeeks', { defaultValue: 'Weeks' });
      setDrafting(false);
      setEditDraft({ name: `${focus} ${BUILD_LABEL[buildType]}`, blocks: outline, note: '', blockLabel });
    };
    return (
      <BSPage>
        {/* Masthead row at the standard inset — the AI-draft eyebrow + CANCEL
            sit BELOW it (every page opens on the same row). corners: false —
            this view holds an unsaved draft the self avatar would discard. */}
        <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow({ corners: false })}</div>
        <div style={{ padding: `12px ${t.padX}px 28px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: teal }}>{blankMode ? tr('coach:plans.buildEyebrow', { defaultValue: 'BUILD' }) : tr('coach:plans.aiDraftEyebrow', { defaultValue: '✦ AI DRAFT' })} · {BUILD_LABEL[buildType].toUpperCase()}</div>
            <button onClick={() => setDrafting(false)} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.cancelUpper', { defaultValue: 'CANCEL' })}</button>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{blankMode ? tr('coach:plans.buildA', { defaultValue: 'Build a' }) : tr('coach:plans.describeThe', { defaultValue: 'Describe the' })} <span style={{ fontStyle: 'italic', color: teal }}>{BUILD_LABEL[buildType]}.</span></div>
          {/* What are you building? */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 8 }}>{tr('coach:plans.building', { defaultValue: 'BUILDING' })}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['plan', tr('coach:plans.kindPlan', { defaultValue: 'Plan' })], ['workout', tr('coach:plans.kindWorkout', { defaultValue: 'Workout' })], ['program', tr('coach:plans.kindProgram', { defaultValue: 'Program' })]].map(([k, l]) => {
                const on = buildType === k;
                return <button key={k} onClick={() => setBuildType(k)} style={{ flex: 1, borderRadius: 999, padding: '10px 6px', cursor: 'pointer', border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}1c` : 'transparent', color: on ? teal : t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{l}</button>;
              })}
            </div>
            <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK50 }}>{buildType === 'plan' ? tr('coach:plans.descPlan', { defaultValue: 'A multi-week paid program clients enroll in.' }) : buildType === 'program' ? tr('coach:plans.descProgram', { defaultValue: 'A reusable weekly routine / template.' }) : tr('coach:plans.descWorkout', { defaultValue: 'A single day workout session.' })}</div>
          </div>
          {!blankMode && <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder={tr('coach:plans.descPlaceholderTrainer', { defaultValue: 'e.g. 45-min upper body for an intermediate lifter, shoulder-friendly, dumbbells only' })} style={{ width: '100%', boxSizing: 'border-box', marginTop: 18, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: 14, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />}
          {chips(tr('coach:plans.focusLabel', { defaultValue: 'FOCUS' }), focus, setFocus, ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full body', 'Conditioning'])}
          {chips(tr('coach:plans.experienceLabel', { defaultValue: 'EXPERIENCE' }), exp, setExp, ['Beginner', 'Intermediate', 'Advanced'])}
          {chips(tr('coach:plans.equipmentLabel', { defaultValue: 'EQUIPMENT' }), equip, setEquip, ['Full gym', 'Dumbbells', 'Bodyweight'])}
          {chips(tr('coach:plans.lengthLabel', { defaultValue: 'LENGTH' }), length, setLength, ['30 min', '45 min', '60 min', '75 min'])}
          <button onClick={generate} style={{ width: '100%', marginTop: 24, borderRadius: 14, border: 0, background: teal, color: '#04201d', padding: '16px', fontFamily: t.MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>{draftStatus || (blankMode ? tr('coach:plans.createType', { defaultValue: 'Create {type}', type: BUILD_LABEL[buildType] }) : tr('coach:plans.generateDraft', { defaultValue: '✦ Generate draft' }))}</button>
          <div style={{ marginTop: 12, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:plans.editBeforePublish', { defaultValue: 'You can edit everything before publishing' })}</div>
        </div>
        <BSFooter left={tr('coach:plans.footerAiDraft', { defaultValue: 'AI draft' })} right={tr('coach:plans.footerAiWorkout', { defaultValue: 'Workout' })} />
      </BSPage>
    );
  }

  // ── Ledger furniture (spec §1) — shared bsPro* helpers (above bsProMastRow),
  // bound to this component's t/heat/flash so trainer + nutri can't drift. ──
  const Redact = typeof window !== 'undefined' ? window.BSTRedact : null;
  const stationHead = (label, trailing) => bsProStationHead(t, heat, label, trailing);
  const monoTrail = (label, onClick) => bsProMonoTrail(t, label, onClick);
  const featureLead = (eyebrow, headA, headB, meta, actions) => bsProFeatureLead(t, heat, eyebrow, headA, headB, meta, actions);
  const enrolledRow = (e, i) => bsProEnrolledRow(t, flash, e, i);

  // §2 (CodeRabbit) — catalogue stat: signed-out keeps the demo string; signed-in
  // shows the live PUBLISHED count once loaded, else "—" (no fabricated drafts).
  const catalogueStat = !signedIn
    ? tr('coach:plans.catalogueDemoTrainer', { defaultValue: '· 4 PUBLISHED · 1 DRAFT' })
    : (serverPlans === null ? '· —' : tr('coach:plans.publishedCount', { defaultValue: '· {count} PUBLISHED', count: serverPlans.length }));

  return (
    <BSPage>
      {/* §1.1 Header — mast row (the standard inset, #1574 rule) + THE CATALOGUE eyebrow
          + serif "Your programs." (heat italic). */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow()}</div>
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
          {tr('coach:plans.theCatalogue', { defaultValue: 'THE CATALOGUE' })} <span style={{ color: `${t.INK}80` }}>{catalogueStat}</span>
        </div>
        <div data-tour="hero-plans" style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK, lineHeight: 1.05 }}>
          {tr('coach:plans.yourWord', { defaultValue: 'Your' })} <i style={{ color: heat, fontStyle: 'italic' }}>{tr('coach:plans.programsAccent', { defaultValue: 'programs.' })}</i>
        </div>
      </div>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        {note && <div style={{ marginTop: 12, borderRadius: 999, border: `1px solid ${teal}`, background: `${teal}1c`, color: teal, padding: '9px 14px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em' }}>✓ {note}</div>}

        <input ref={clipVideoRef} type="file" accept="video/*" onChange={uploadClipToPlan} style={{ display: 'none' }} />
        {clipSheet && createPortal(
          <div onClick={closeClipSheet} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr('coach:plans.clipSheetAria', { defaultValue: 'Add a clip to a workout' })} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `12px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: t.RULE, margin: '0 auto 14px' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: heat }}>{tr('coach:plans.addClipEyebrow', { defaultValue: '＋ Add a clip' })}</div>
                <button type="button" onClick={closeClipSheet} aria-label={tr('coach:common.closeAria', { defaultValue: 'Close' })} style={{ flexShrink: 0, minWidth: 44, minHeight: 44, marginTop: -8, marginRight: -6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>{tr('coach:plans.pickA', { defaultValue: 'Pick a' })} <span style={{ fontStyle: 'italic', color: heat }}>{tr('coach:plans.workoutAccent', { defaultValue: 'workout.' })}</span></div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50, lineHeight: 1.5 }}>{clipUploading ? tr('coach:plans.uploading', { defaultValue: 'Uploading…' }) : tr('coach:plans.chooseClipPlan', { defaultValue: 'Choose which plan this clip belongs to, then pick a video.' })}</div>
              <div style={{ marginTop: 12 }}>
                {(serverPlans || []).map((p, i) => (
                  <button key={p.id || i} type="button" disabled={clipUploading} onClick={() => pickPlanForClip(p.id)} aria-label={tr('coach:plans.addClipToAria', { defaultValue: 'Add a clip to {name}', name: p.name })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minHeight: 52, textAlign: 'left', background: 'transparent', border: 0, borderTop: `1px solid ${t.INK}12`, cursor: clipUploading ? 'default' : 'pointer', padding: '13px 0', opacity: clipUploading ? 0.5 : 1 }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      {p.meta && <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{p.meta}</span>}
                    </span>
                    <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 13, color: heat }}>＋</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null)
        )}

        {/* §1.2 LIBRARY / SOUNDTRACKS — typographic index */}
        <div style={{ marginTop: 14 }}>{bsProTypoIndex(t, TABS, tab, setTab, { ariaLabel: tr('coach:plans.libraryOrSoundtracks', { defaultValue: 'Library or soundtracks' }) })}</div>

        {tab === 'library' && (<>
        {/* §1.3 Create actions — draft with AI · build from scratch */}
        <div style={{ marginTop: 6 }}>
          <BSProTextAction heat={heat} t={t} label={tr('coach:plans.draftInSeconds', { defaultValue: '✦ Draft a {type} in seconds →', type: BUILD_LABEL[libBuild] })} onClick={() => openDraft(libBuild)} />
          <BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.buildFromScratch', { defaultValue: '＋ Build from scratch' })} onClick={() => openDraft(libBuild, true)} />
        </div>

        {/* §1.4 Kind sub-tabs — Plans / Workouts / Programs */}
        <div style={{ marginTop: 8 }}>{bsProTypoIndex(t, LIB_TABS, libTab, setLibTab, { ariaLabel: tr('coach:plans.catalogueKind', { defaultValue: 'Catalogue kind' }) })}</div>

        {libTab === 'plans' && (<>
        {/* §1.5 THE CATALOGUE — paid plans as dot-leader rows */}
        {stationHead(tr('coach:plans.paidPlans', { defaultValue: 'PAID PLANS' }), monoTrail(tr('coach:plans.sortBy', { defaultValue: 'SORT · {mode} →', mode: (sort === 'Price' ? tr('coach:plans.sortPrice', { defaultValue: 'PRICE' }) : sort === 'Rating' ? tr('coach:plans.sortRating', { defaultValue: 'RATING' }) : tr('coach:plans.sortPopular', { defaultValue: 'POPULAR' })) }), cycleSort))}
        {programs.length === 0 ? (
          <div style={{ marginTop: 2 }}>
            {Redact ? <Redact INK={t.INK} label={tr('coach:plans.noPublishedPlans', { defaultValue: 'NO PUBLISHED PLANS' })} /> : null}
            <BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.buildFromScratch', { defaultValue: '＋ Build from scratch' })} onClick={() => openDraft('plan', true)} />
          </div>
        ) : (
          <div style={{ marginTop: 2 }}>
            {programs.map((p, i) => (
              <BSProCatRow key={p.id || p.n} index={i} name={p.n} meta={p.meta} price={p.price} heat={heat} t={t}
                onOpen={() => openDraft('plan')}
                onAssign={() => setAssignPlan({ id: p.id || null, name: p.n, meta: p.meta, detail: p.detail || null })} />
            ))}
          </div>
        )}
        {/* §1.6 ENROLLED — clients on plans */}
        {stationHead(tr('coach:plans.enrolled', { defaultValue: 'ENROLLED' }))}
        {enrolled.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:plans.noEnrolled', { defaultValue: 'NO ENROLLED CLIENTS' })} /> : null
        ) : (
          <div style={{ marginTop: 2 }}>{enrolled.map(enrolledRow)}</div>
        )}
        </>)}

        {libTab === 'workouts' && (<>
        {/* Top workout — unboxed verdict lead. §5 (CodeRabbit) — fabricated
            "used by 34 · 4.9 ★" so signed-OUT preview only. */}
        {!signedIn && featureLead('TOP WORKOUT · 62 MIN', 'Lower Push —', 'Peak.', '6 lifts · used by 34 · RPE 8 · 4.9 ★', <>
          <span style={{ display: 'inline-flex' }}><BSProTextAction heat={heat} t={t} label={tr('coach:plans.edit', { defaultValue: 'EDIT' })} onClick={() => openDraft('workout')} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.duplicate', { defaultValue: 'DUPLICATE' })} onClick={() => duplicate({ n: 'Lower Push — Peak', meta: '6 lifts · 62 min · RPE 8' })} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.shareAction', { defaultValue: 'SHARE →' })} onClick={() => share('Lower Push Peak')} /></span>
        </>)}
        {/* Single day workouts — demo signed-out, redaction signed-in-with-none. */}
        {stationHead(tr('coach:plans.sessions', { defaultValue: 'SESSIONS' }), monoTrail(tr('coach:plans.newAction', { defaultValue: 'NEW →' }), () => openDraft('workout')))}
        {workouts.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:plans.noWorkouts', { defaultValue: 'NO WORKOUTS YET' })} /> : null
        ) : (
        <div style={{ marginTop: 2 }}>
          {workouts.map((w, i) => (
            <BSProCatRow key={w.n} index={i} name={w.n} meta={w.meta} heat={heat} t={t}
              onOpen={() => openDraft('workout')}
              onAssign={() => setAssignPlan({ id: w.id || null, name: w.n, meta: w.meta, detail: w.detail || null })} />
          ))}
        </div>
        )}

        {/* Video library — real clips flattened from published plans (plan
            media + per-block clips); demo cues are the signed-out fallback. */}
        {stationHead(tr('coach:plans.workoutVideos', { defaultValue: 'WORKOUT VIDEOS' }))}
        <BSProTextAction heat={heat} t={t} label={tr('coach:plans.addClipAction', { defaultValue: '＋ Add a clip to a workout →' })} onClick={openClipAdder} />
        {serverPlans === null ? (
          !signedIn ? (
            // Signed-out preview → demo cues are fine.
            <div style={{ marginTop: 2 }}>
              {cues.map((c, i) => (
                <BSProCatRow key={c.n} index={i} name={c.n} meta={c.meta} heat={heat} t={t} onOpen={() => flash(tr('coach:plans.openVideoSet', { defaultValue: 'Open video set' }))} />
              ))}
            </div>
          ) : (
            // Signed-in but still loading → redaction line, never fabricated counts.
            <div style={{ marginTop: 2 }}>{Redact ? <Redact INK={t.INK} label={tr('coach:plans.clipsLoading', { defaultValue: 'CLIPS · LOADING' })} /> : null}</div>
          )
        ) : (() => {
          const clips = [];
          (serverPlans || []).forEach((p) => {
            const d = p && p.detail;
            const from = tr('coach:plans.fromPlan', { defaultValue: 'FROM {name}', name: String((p && p.name) || tr('coach:plans.planFallback', { defaultValue: 'PLAN' })).toUpperCase() });
            (d && Array.isArray(d.media) ? d.media : []).forEach((m) => {
              if (m && m.type === 'video' && m.url) clips.push({ url: m.url, name: (m.name && m.name.trim()) || tr('coach:plans.clipFallback', { defaultValue: 'Clip' }), meta: from });
            });
            (d && Array.isArray(d.blocks) ? d.blocks : []).forEach((b) => {
              if (b && b.video) {
                const words = String((b.text) || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
                clips.push({ url: b.video, name: words || tr('coach:plans.clipFallback', { defaultValue: 'Clip' }), meta: from });
              }
            });
          });
          if (!clips.length) return <div style={{ marginTop: 2 }}>{Redact ? <Redact INK={t.INK} label={tr('coach:plans.noClips', { defaultValue: 'NO CLIPS YET' })} /> : null}</div>;
          return (
            <div style={{ marginTop: 2 }}>
              {clips.map((c, i) => (
                <BSProCatRow key={i} index={i} name={c.name} meta={c.meta} heat={heat} t={t} onOpen={() => window.open(c.url, '_blank', 'noopener,noreferrer')} />
              ))}
            </div>
          );
        })()}
        </>)}

        {libTab === 'programs' && (<>
        {/* Top program — unboxed verdict lead. §5 (CodeRabbit) — fabricated
            "used by 22 · 4.8 ★" so signed-OUT preview only. */}
        {!signedIn && featureLead('TOP PROGRAM · 8 WK', '5-day Upper /', 'Lower.', '5 days/wk · 8-week block · used by 22 · 4.8 ★', <>
          <span style={{ display: 'inline-flex' }}><BSProTextAction heat={heat} t={t} label={tr('coach:plans.edit', { defaultValue: 'EDIT' })} onClick={() => openDraft('program')} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.duplicate', { defaultValue: 'DUPLICATE' })} onClick={() => duplicate({ n: '5-day Upper / Lower', meta: '5 days/wk · 8-week block' })} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.shareAction', { defaultValue: 'SHARE →' })} onClick={() => share('5-day Upper Lower')} /></span>
        </>)}
        {/* Reusable weekly routines / templates — demo signed-out, redaction signed-in-with-none. */}
        {stationHead(tr('coach:plans.templates', { defaultValue: 'TEMPLATES' }), monoTrail(tr('coach:plans.newAction', { defaultValue: 'NEW →' }), () => openDraft('program')))}
        {routines.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:plans.noPrograms', { defaultValue: 'NO PROGRAMS YET' })} /> : null
        ) : (
        <div style={{ marginTop: 2 }}>
          {routines.map((r, i) => (
            <BSProCatRow key={r.n} index={i} name={r.n} meta={r.meta} heat={heat} t={t}
              onOpen={() => openDraft('program')}
              onAssign={() => setAssignPlan({ id: r.id || null, name: r.n, meta: r.meta, detail: r.detail || null })} />
          ))}
        </div>
        )}
        </>)}
        </>)}

        {tab === 'soundtracks' && (
        <BSProSoundtracks role="trainer" embedded onBack={() => setTab('library')} />
        )}
      </div>
      <BSFooter left={tr('coach:common.coachEdition', { defaultValue: 'The Coach Edition' })} right={tr('coach:plans.footerRightTrainer', { defaultValue: 'Programs' })} />
    </BSPage>
  );
}

function BSCoachPlaylistStudio({ role, targets, title, meta, copy }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;
  const initialTarget = targets[0]?.id || '';
  const [service, setService] = useStateBSP('spotify');
  const [name, setName] = useStateBSP(isNutri ? 'Sunday prep focus' : 'Upper pull tempo');
  const [url, setUrl] = useStateBSP(isNutri ? 'https://music.apple.com/playlist/shape-prep' : 'https://open.spotify.com/playlist/shape-tempo');
  const [note, setNote] = useStateBSP(isNutri ? 'Low-key prep music for cooking and logging meals.' : 'BPM climbs with the main working sets.');
  const [selectedTarget, setSelectedTarget] = useStateBSP(initialTarget);
  const [sent, setSent] = useStateBSP({});
  const [playlistStatus, setPlaylistStatus] = useStateBSP('');
  const [playlists, setPlaylists] = useStateBSP([
    {
      id: 'coach-pl-1',
      name: isNutri ? 'Meal prep, low-key' : 'Pull day tempo',
      service: isNutri ? 'apple' : 'spotify',
      bpm: isNutri ? '85-100' : '95-138',
      tracks: isNutri ? 12 : 14,
      attached: targets[0]?.name || 'Draft',
      targetType: targets[0]?.type || 'PLAN',
      note: isNutri ? 'Attached to Sunday prep and carb-load plans.' : 'Attached to Upper Pull and Tempo Run Prep.',
      clients: isNutri ? '8 clients' : '14 clients',
    },
    {
      id: 'coach-pl-2',
      name: isNutri ? 'Grocery run' : 'Riverside long run',
      service: 'spotify',
      bpm: isNutri ? '90-112' : '160-172',
      tracks: isNutri ? 10 : 24,
      attached: targets[1]?.name || targets[0]?.name || 'Draft',
      targetType: targets[1]?.type || targets[0]?.type || 'WORKOUT',
      note: isNutri ? 'For templates with grocery list follow-through.' : 'For marathon blocks and long run workouts.',
      clients: isNutri ? '5 clients' : '6 clients',
    },
  ]);

  useEffectBSP(() => {
    let active = true;
    if (role !== 'trainer') return () => {};
    window.ShapePlaylists?.listTrainerPlaylists?.()
      .then((result) => {
        if (!active || !result?.data?.length) return;
        setPlaylists(result.data);
        setPlaylistStatus(result.stored === 'supabase' ? 'Synced from Supabase' : 'Using local playlist cache');
      })
      .catch(() => {
        if (active) setPlaylistStatus('Using demo playlist cache');
      });
    return () => { active = false; };
  }, [role]);

  const inputStyle = {
    width: '100%',
    borderRadius: t.RADIUS_SM,
    border: `1px solid ${t.SURFACE_BORDER || t.RULE}`,
    background: t.PAPER2,
    color: t.INK,
    padding: '11px 12px',
    fontFamily: t.DISPLAY,
    fontSize: 14,
    outline: 'none',
    boxShadow: 'none',
  };
  const monoLabel = {
    display: 'block',
    marginBottom: 5,
    fontFamily: t.MONO,
    fontSize: 9,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: t.INK50,
    fontWeight: 700,
  };
  const actionButton = (filled, color = accent) => ({
    borderRadius: t.RADIUS_SM,
    border: `1px solid ${filled ? color : (t.SURFACE_BORDER || t.RULE)}`,
    background: filled ? color : t.PAPER2,
    color: filled ? t.PAPER : t.INK,
    padding: '11px 12px',
    fontFamily: t.MONO,
    fontSize: 9,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: filled ? t.ELEVATION_SOFT || '0 8px 16px rgba(10,13,12,0.12)' : 'none',
  });

  const targetWorkoutId = (target) => {
    if (!target?.id?.startsWith('workout-')) return null;
    const index = targets.filter(x => x.type === 'WORKOUT').findIndex(x => x.id === target.id);
    return index >= 0 ? index + 1 : null;
  };

  const addPlaylist = async () => {
    const target = targets.find((x) => x.id === selectedTarget) || targets[0];
    if (!target || !name.trim()) return;
    const draft = {
      id: `coach-pl-${Date.now()}`,
      name: name.trim(),
      service,
      bpm: service === 'spotify' ? '96-142' : '88-128',
      tracks: 16,
      attached: target.name,
      targetType: target.type,
      note: note.trim() || 'Custom playlist attached for this client workflow.',
      clients: 'Ready to send',
      url,
    };

    if (role === 'trainer' && service === 'spotify') {
      setPlaylistStatus('Saving playlist...');
      try {
        const result = await window.ShapePlaylists?.createTrainerPlaylist?.({
          title: name.trim(),
          description: note.trim() || `Attached to ${target.name}`,
          spotifyUrl: url,
          workoutId: targetWorkoutId(target),
        });
        setPlaylists((list) => [result?.data && result.stored === 'supabase' ? result.data : draft, ...list]);
        setPlaylistStatus(result?.stored === 'supabase' ? 'Saved to Supabase' : 'Saved locally');
      } catch (error) {
        setPlaylistStatus(error?.message || 'Playlist could not be saved');
        return;
      }
    } else {
      setPlaylists((list) => [draft, ...list]);
      setPlaylistStatus(service === 'apple' ? 'Apple Music links are local until schema supports them' : 'Saved locally');
    }

    setName('');
    setNote('');
  };

  const platformName = (p) => p.service === 'apple' ? 'Apple Music' : 'Spotify';
  const openProvider = (p) => {
    const fallback = p.service === 'apple' ? 'https://music.apple.com/' : 'https://open.spotify.com/';
    window.open(p.url || fallback, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <BSSection title={title} meta={meta} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ padding: 14, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, borderRadius: t.RADIUS_LG || 16, background: t.SURFACE || t.PAPER2, boxShadow: t.ELEVATION_SOFT || '0 8px 18px rgba(10,13,12,0.035)' }}>
          <BSEyebrow color={accent}>Coach music delivery</BSEyebrow>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.35, color: t.INK, fontWeight: 600 }}>
            {copy}
          </div>
          {playlistStatus && (
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>
              {playlistStatus}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, padding: 12, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, borderRadius: t.RADIUS_LG || 16, background: t.SURFACE || t.PAPER2, boxShadow: t.ELEVATION_SOFT || '0 8px 18px rgba(10,13,12,0.035)', display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['spotify', 'apple'].map((s) => (
              <button key={s} onClick={() => setService(s)} style={actionButton(service === s, s === 'spotify' ? t.GREEN : t.BLUE)}>
                {s === 'spotify' ? 'Spotify' : 'Apple Music'}
              </button>
            ))}
          </div>
          <div>
            <label style={monoLabel}>Playlist name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tempo set, leg day, meal prep..." style={inputStyle} />
          </div>
          <div>
            <label style={monoLabel}>Spotify / Apple Music link</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste playlist URL" style={{ ...inputStyle, fontFamily: t.MONO, fontSize: 10 }} />
          </div>
          <div>
            <label style={monoLabel}>Attach to</label>
            <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)} style={{ ...inputStyle, fontFamily: t.MONO, fontSize: 10, textTransform: 'uppercase' }}>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.type} - {target.name}</option>)}
            </select>
          </div>
          <div>
            <label style={monoLabel}>Client note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Tell the client when to play it." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={addPlaylist} style={actionButton(true)}>Import and attach</button>
        </div>

        {playlists.map((p, i) => {
          const isSent = !!sent[p.id];
          return (
            <div key={p.id} style={{ marginTop: 10, padding: 12, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, borderRadius: t.RADIUS_LG || 16, background: t.SURFACE || t.PAPER2, boxShadow: t.ELEVATION_SOFT || '0 8px 18px rgba(10,13,12,0.035)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 800, color: t.INK, letterSpacing: '-0.025em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', color: t.INK50, textTransform: 'uppercase' }}>
                    {platformName(p)} - {p.bpm} BPM - {p.tracks} tracks
                  </div>
                </div>
                <span style={{ borderRadius: 999, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.PAPER, background: p.service === 'spotify' ? t.GREEN : t.BLUE, padding: '5px 8px', fontWeight: 800 }}>
                  {p.service === 'spotify' ? 'SPOT' : 'APPLE'}
                </span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${accent}`, color: accent, background: `${accent}12`, padding: '5px 8px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800 }}>{p.targetType}</span>
                <span style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, color: t.INK, background: t.PAPER2, padding: '5px 8px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{p.attached}</span>
                <span style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, color: t.INK50, background: t.PAPER2, padding: '5px 8px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{isSent ? 'Sent to clients' : p.clients}</span>
              </div>
              <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.35 }}>{p.note}</div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => setSent((s) => ({ ...s, [p.id]: true }))} style={actionButton(isSent, isSent ? t.GREEN : accent)}>
                  {isSent ? 'Sent' : 'Send'}
                </button>
                <button onClick={() => openProvider(p)} style={actionButton(false)}>
                  Open {p.service === 'apple' ? 'Apple' : 'Spotify'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// NUTRITIONIST
// ═══════════════════════════════════════════════════════════
function BSNutritionistApp({ onLogout, tweaks, setTweak }) {
  // Same gesture-mount reasoning as BSTrainerApp.
  return <BSSheetProvider>{typeof window !== 'undefined' && window.BSNavGestures ? React.createElement(window.BSNavGestures) : null}<BSNutritionistAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} /></BSSheetProvider>;
}
function BSNutritionistAppInner({ onLogout, tweaks, setTweak }) {
  const t = useBS();
  const tr = useShapeTr();
  const sheet = useBSSheet();
  const [, _bumpIdentity] = useStateBSP(0);
  React.useEffect(() => {
    _bsHydrateProScore();
    // Load the coach's identity (photo / initials / avatarMode) — the coach app
    // never did this, so coach avatars never received their photo. Re-render when it lands.
    try { window.bsHydrateIdentity && window.bsHydrateIdentity(); } catch (e) {}
    const bump = () => _bumpIdentity((v) => v + 1);
    window.addEventListener('shape:identity', bump);
    return () => window.removeEventListener('shape:identity', bump);
  }, []);
  const [tab, setTab] = useStateBSP('today');
  const [showTour, setShowTour] = useStateBSP(false);
  // Universal search — the ⌕ in the header opens it (shared client component).
  const [showSearch, setShowSearch] = useStateBSP(false);
  useEffectBSP(() => {
    const open = () => { navJumpRef.current.navPush(); setShowSearch(true); };
    window.addEventListener('shape:openSearch', open);
    return () => window.removeEventListener('shape:openSearch', open);
  }, []);
  // Inline ✉ on a search row → the real 1:1 thread; a channel result → that
  // channel's thread; Nora → the Support tab. All land in the Chat tab.
  useEffectBSP(() => {
    const open = (e) => {
      const d = (e && e.detail) || {};
      if (!d.conversationId && !d.channel && !d.support) return;
      navJumpRef.current.navPush();
      setShowSearch(false);
      setChatRequest({ conversationId: d.conversationId || null, channel: d.channel || null, support: !!d.support, coach: d.name || null, nonce: Date.now() });
      setTab('chat');
    };
    window.addEventListener('shape:openConversation', open);
    return () => window.removeEventListener('shape:openConversation', open);
  }, []);
  useEffectBSP(() => bsCoachTourAutoShow(setShowTour), []);
  useEffectBSP(() => {
    const start = () => { setShowSettings(false); setShowCalendar(false); setShowTour(true); };
    window.addEventListener('shape:startTour', start);
    return () => window.removeEventListener('shape:startTour', start);
  }, []);
  // About-page CTA — "Join the community." closes the settings takeover and
  // lands on the chat tab's community feed. About rides the SHARED BSSettings,
  // which the coach apps embed too (#1795 Codex catch: without this listener the
  // coach-side button was a dead tap); the client shell has the same listener.
  useEffectBSP(() => {
    // Clear EVERY takeover that early-returns above the tab body (Settings can
    // be opened from the Calendar takeover via onProfile, so closing settings
    // alone would land back on the calendar — Codex catch), plus any stale chat
    // deep-link, so the chat tab always lands on the community FEED.
    const open = () => {
      navJumpRef.current.navPush();
      setShowSoundtracks(false); setShowSettings(false); setSettingsStart('');
      setShowCalendar(false); setShowReviews(false); setShowHabits(false);
      setQueueView(null); setShowSearch(false);
      setChatRequest(null); setTab('chat');
    };
    window.addEventListener('shape:goCommunity', open);
    return () => window.removeEventListener('shape:goCommunity', open);
  }, []);
  const [showSettings, setShowSettings] = useStateBSP(false);
  const [showSoundtracks, setShowSoundtracks] = useStateBSP(false);
  const [showCalendar, setShowCalendar] = useStateBSP(false);
  const [showReviews, setShowReviews] = useStateBSP(false);
  const [showHabits, setShowHabits] = useStateBSP(false);
  const [storeView, setStoreView] = useStateBSP('store');
  const [queueView, setQueueView] = useStateBSP(null);
  const [settingsStart, setSettingsStart] = useStateBSP(''); // replayed Settings sub-page (announce register)
  const scoreProfile = SHAPE_SCORE_PROFILES?.nutritionist;
  // ── Nav history (spec 2026-07-09) — mirrors the trainer shell. ──
  const navLoc = () => {
    if (showSoundtracks) return { tab, overlay: 'soundtracks' };
    if (showSettings) return { tab, overlay: 'settings', sub: settingsStart || '' };
    if (showCalendar) return { tab, overlay: 'calendar' };
    if (showReviews) return { tab, overlay: 'reviews' };
    if (showHabits) return { tab, overlay: 'habits' };
    if (queueView) return { tab, overlay: 'queue', detail: { type: queueView } };
    if (showSearch) return { tab, overlay: 'search' };
    if (tab === 'store') return { tab: 'store', sub: storeView };
    return { tab };
  };
  const navResolve = (loc) => {
    if (!loc) return;
    setShowSoundtracks(loc.overlay === 'soundtracks');
    setShowCalendar(loc.overlay === 'calendar');
    setShowReviews(loc.overlay === 'reviews');
    setShowHabits(loc.overlay === 'habits');
    setShowSearch(loc.overlay === 'search');
    setQueueView(loc.overlay === 'queue' && loc.detail ? loc.detail.type : null);
    if (loc.overlay === 'settings') { setSettingsStart(loc.sub || ''); setShowSettings(true); }
    else { setShowSettings(false); setSettingsStart(''); }
    if (loc.tab === 'store') setStoreView(loc.sub === 'score' ? 'score' : 'store');
    if (loc.tab === 'chat' && loc.detail) setChatRequest({ ...loc.detail, nonce: Date.now() });
    if (loc.tab) setTab(loc.tab);
  };
  const { navPush, navBack } = useBSNavHistory({ navLoc, navResolve });
  const navJumpRef = React.useRef({});
  const goRadio = () => { navPush(); setTab('radio'); };
  const goSettings = () => { navPush(); setShowSettings(true); };
  const openHomeWidget = (action) => {
    // Push ONLY for actions that actually navigate — an unknown action must not
    // leave a phantom entry the user's next back would spend itself on.
    if (!['reviews', 'plans', 'clients', 'grocery'].includes(action)) return;
    navPush();
    if (action === 'reviews') { setShowReviews(true); return; }
    if (action === 'plans') { setTab('plans'); return; }
    if (action === 'clients') { setTab('clients'); return; }
    if (action === 'grocery') setQueueView('grocery');
  };
  const [chatRequest, setChatRequest] = useStateBSP(null);
  // Swipe judgment (PR C) — mirrors the trainer shell (no liveWatch here).
  const [navSlideCls, navSlide] = useBSNavSlide(tab);
  const onNavGesture = (intent) => {
    if (intent === 'back') {
      if (navBack()) return;
      if (showSearch) { setShowSearch(false); return; }
      if (queueView) { setQueueView(null); return; }
      if (showSoundtracks) { setShowSoundtracks(false); return; }
      if (showSettings) { setShowSettings(false); setSettingsStart(''); return; }
      if (showCalendar) { setShowCalendar(false); return; }
      if (showReviews) { setShowReviews(false); return; }
      if (showHabits) setShowHabits(false);
      return;
    }
    if (showSearch || queueView || showSoundtracks || showSettings || showCalendar || showReviews || showHabits) return;
    const next = bsNavStepTab(['today', 'clients', 'plans', 'chat', 'me'], tab, intent);
    if (!next) return;
    navSlide(intent === 'next-tab' ? 'l' : 'r');
    setTab(next);
  };
  navJumpRef.current = { navPush, goSettings, openHomeWidget, onNavGesture };
  useBSNavGestureHandler(navJumpRef);
  React.useEffect(() => {
    const onMsg = async (e) => {
      navJumpRef.current.navPush();
      const c = e?.detail?.client;
      const uid = c && (c.userId || c.user_id || (typeof c.id === 'string' && c.id.includes('-') ? c.id : null));
      const name = (c && c.n) || 'Client';
      let cid = null;
      if (uid && window.ShapeMessages?.getOrCreateMemberConversation) {
        try { const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: uid }); cid = (conv && conv.data) || null; } catch (err) {}
      }
      setChatRequest({ coach: name, role: 'Client', conversationId: cid, nonce: Date.now() });
      setTab('chat');
    };
    window.addEventListener('shape:proMessageClient', onMsg);
    return () => window.removeEventListener('shape:proMessageClient', onMsg);
  }, []);
  // Care team — open (or reuse) the private coach↔coach thread about a shared
  // client, then jump to Chat on that thread.
  React.useEffect(() => {
    const onCoach = async (e) => {
      navJumpRef.current.navPush();
      const d = e?.detail || {};
      let cid = null;
      if (d.clientId && d.counterpartUserId && window.ShapeCareTeam?.openThread) {
        try { cid = await window.ShapeCareTeam.openThread(d.clientId, d.counterpartUserId); } catch (err) {}
      }
      setChatRequest({ coach: d.name || 'Coach', role: d.role || 'Care team', conversationId: cid, nonce: Date.now() });
      setTab('chat');
    };
    window.addEventListener('shape:proMessageCoach', onCoach);
    return () => window.removeEventListener('shape:proMessageCoach', onCoach);
  }, []);
  React.useEffect(() => {
    const onSettingsEvt = () => navJumpRef.current.goSettings();
    const onAvail = () => { navJumpRef.current.navPush(); setShowSettings(false); setShowCalendar(true); };
    const onSound = () => { navJumpRef.current.navPush(); setShowSettings(false); setShowSoundtracks(true); };
    // shape:openProfile is what every self-avatar tap fires (same as the client) —
    // open Settings in one tap, so the coach flow matches the client/preview flow.
    window.addEventListener('shape:openProSettings', onSettingsEvt);
    window.addEventListener('shape:openProfile', onSettingsEvt);
    window.addEventListener('shape:proAvailability', onAvail);
    window.addEventListener('shape:proSoundtracks', onSound);
    return () => { window.removeEventListener('shape:openProSettings', onSettingsEvt); window.removeEventListener('shape:openProfile', onSettingsEvt); window.removeEventListener('shape:proAvailability', onAvail); window.removeEventListener('shape:proSoundtracks', onSound); };
  }, []);
  if (showSoundtracks) return <BSProSoundtracks role="nutritionist" onBack={() => { if (!navBack()) setShowSoundtracks(false); }} />;
  if (showSettings) return <BSSettings initialPage={settingsStart} onBack={() => { if (!navBack()) { setShowSettings(false); setSettingsStart(''); } }} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="nutritionist" onProfile={goSettings} onBack={() => { if (!navBack()) setShowCalendar(false); }} />;
  if (showReviews) return <BSWorkoutReviewPage role="nutritionist" onBack={() => { if (!navBack()) setShowReviews(false); }} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => { if (!navBack()) setShowHabits(false); }} onOpenScore={() => { navPush(); setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="nutritionist" type={queueView} onBack={() => { if (!navBack()) setQueueView(null); }} />;
  const screens = {
    today:    <BSNutriToday onProfile={goSettings} sheet={sheet} goCalendar={() => { navPush(); setShowCalendar(true); }} goRadio={goRadio} onOpenReviews={() => { navPush(); setShowReviews(true); }} onWidgetOpen={openHomeWidget} onOpenHabits={() => { navPush(); setShowHabits(true); }} onOpenScore={() => { navPush(); setStoreView('score'); setTab('store'); }} tweaks={tweaks} setTweak={setTweak} />,
    clients:  <BSNutriClients sheet={sheet} />,
    plans:    <BSNutriPlans sheet={sheet} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="nutritionist" openRequest={chatRequest} />,
    radio:    <BSRadioScreen onBack={() => { if (!navBack()) setTab('today'); }} />,
    store:    storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => { if (!navBack()) setTab('today'); }} onOpenScore={() => setStoreView('score')} />,
    me:       <BSPublicProfile person={{ who: 'Dr. Maya Patel', kind: 'NUTRI', init: bsMyInitials(), userId: (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || undefined }} isSelf meMode onOpenSettings={goSettings} onOpenScore={() => { navPush(); setStoreView('score'); setTab('store'); }} onBack={() => setTab('today')} />,
  };
  // navSlideCls (from useBSNavSlide): one-shot on a tab SWIPE, cleared in an
  // effect after commit; a tab TAP renders instantly; reduced-motion in CSS.
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div key={tab} className={navSlideCls} style={{ position: 'absolute', inset: 0 }}>
        {screens[tab]}
      </div>
      {/* Feed composer portals into this slot (see BSClientFeed). */}
      <div id="bs-composer-slot" style={{ position: 'absolute', left: 0, right: 0, bottom: (window.BS_TABBAR_H || 64), zIndex: 60, pointerEvents: 'none' }} />
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: tr('coach:nav.today', { defaultValue: 'Today' }) },
        { key: 'clients',  label: tr('coach:nav.clients', { defaultValue: 'Clients' }) },
        { key: 'plans',    label: tr('coach:nav.plans', { defaultValue: 'Plans' }) },
        { key: 'chat',     label: tr('coach:nav.chat', { defaultValue: 'Chat' }) },
        { key: 'me',       label: tr('coach:nav.me', { defaultValue: 'Me' }) },
      ]} />
      <BSRadioPrompt />
      {showSearch && typeof window !== 'undefined' && window.BSUniversalSearch ? React.createElement(window.BSUniversalSearch, { onClose: () => { if (!navBack()) setShowSearch(false); } }) : null}
      {showTour && <BSProOnboardingTour role="nutritionist" plansKey="plans" onNavigate={setTab} onClose={() => setShowTour(false)} />}
    </div>
  );
}

function BSNutriToday(props) { return <BSProToday role="nutritionist" {...props} />; }

function BSNutriClients() {
  const t = useBS();
  const [previewClient, setPreviewClient] = useStateBSP(null);
  const [fullClient, setFullClient] = useStateBSP(null);
  const [roster, setRoster] = useStateBSP('active'); // 'active' | 'past'
  const [cQuery, setCQuery] = useStateBSP('');
  const [cFilter, setCFilter] = useStateBSP('all');
  const [needsYou, setNeedsYou] = useStateBSP(false);
  const NUTRI_CLIENTS = useBSProRoster('nutritionist'); // demo → live roster when signed in
  const shownClients = NUTRI_CLIENTS
    .filter(c => roster === 'active' ? c.active : !c.active)
    .filter(c => bsClientMatchesFilter(c, cFilter, 'nutritionist'))
    .filter(c => !needsYou || bsRowSeverity(c, 'nutritionist').rank <= 1)
    .filter(c => bsClientMatchesQuery(c, cQuery));
  const activeCount = NUTRI_CLIENTS.filter(c => c.active).length;
  const pastCount = NUTRI_CLIENTS.length - activeCount;
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id);
  if (fullClient) {
    return <BSProClientFullProfilePage client={fullClient} onBack={() => setFullClient(null)} role="nutritionist" />;
  }
  if (previewClient) {
    return (
      <BSProClientPreviewPage
        client={previewClient}
        onBack={() => setPreviewClient(null)}
        onViewFullProfile={() => {
          setFullClient(previewClient);
          setPreviewClient(null);
        }}
      />
    );
  }
  return (
    <BSProRosterView
      role="nutritionist"
      clients={shownClients}
      activeCount={activeCount}
      pastCount={pastCount}
      totalCount={NUTRI_CLIENTS.length}
      newThisMonth={signedIn ? 0 : 3}
      roster={roster}
      setRoster={setRoster}
      query={cQuery}
      setQuery={setCQuery}
      filter={cFilter}
      setFilter={setCFilter}
      needsYou={needsYou}
      setNeedsYou={setNeedsYou}
      onOpen={(c) => setFullClient(c)}
      footerLeft="The Nutri Edition"
      footerRight="Clients"
    />
  );
}

function BSProPlansTabBar({ active, onChange }) {
  const t = useBS();
  const tabs = [
    { k: 'meal',    l: 'Meal plans' },
    { k: 'tmpl',    l: 'Templates' },
    { k: 'onetime', l: 'One-time' },
  ];
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${t.INK}`, background: t.PAPER }}>
      {tabs.map(tb => {
        const on = active === tb.k;
        return (
          <button key={tb.k} onClick={() => onChange(tb.k)} style={{
            flex: 1, padding: '12px 0', border: 0, cursor: 'pointer',
            background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70,
            fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
            borderRight: tb.k !== 'onetime' ? `1px solid ${t.RULE}` : 'none',
          }}>{tb.l}</button>
        );
      })}
    </div>
  );
}

function BSNutriPlans() {
  const t = useBS();
  const tr = useShapeTr();
  const gold = '#d8b25a', teal = t.isLight ? '#0a8f87' : '#34d6c5', heat = bsProHeat(t, 'nutritionist');
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [showSoundtracks, setShowSoundtracks] = useStateBSP(false);
  const [drafting, setDrafting] = useStateBSP(false);
  // AI draft form
  const [desc, setDesc] = useStateBSP('');
  const [goal, setGoal] = useStateBSP('Cut');
  const [diet, setDiet] = useStateBSP('Omnivore');
  const [cals, setCals] = useStateBSP('~2100');
  const [mealsDay, setMealsDay] = useStateBSP(4);
  const [draftStatus, setDraftStatus] = useStateBSP('');
  const [dupes, setDupes] = useStateBSP([]);
  const [serverPlans, setServerPlans] = useStateBSP(null); // synced coach_plans (meal_plan)
  const [note, setNote] = useStateBSP('');
  const flash = (m) => { setNote(m); setTimeout(() => setNote(''), 1700); };
  const share = (name) => { try { navigator.clipboard?.writeText(`https://shape.app/p/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`); } catch (e) {} flash(tr('coach:plans.shareCopied', { defaultValue: 'Share link copied' })); };
  useEffectBSP(() => { if (window.ShapeCoachPlans?.list) window.ShapeCoachPlans.list('meal_plan').then(rows => { if (Array.isArray(rows)) setServerPlans(rows); }).catch(() => {}); }, []);
  const duplicate = async (p) => {
    const copy = { kind: 'meal_plan', name: tr('coach:plans.copyName', { defaultValue: '{name} (copy)', name: p.n }), meta: p.meta, price: p.price };
    if (window.ShapeCoachPlans?.create) { try { const row = await window.ShapeCoachPlans.create(copy); if (row) { setServerPlans(list => [row, ...(list || [])]); flash(tr('coach:diet.planDuplicated', { defaultValue: 'Plan duplicated' })); return; } } catch (e) {} }
    setDupes(d => [{ n: copy.name, meta: p.meta, price: p.price }, ...d]); flash(tr('coach:diet.planDuplicated', { defaultValue: 'Plan duplicated' }));
  };

  // §4 (CodeRabbit) — the PAID PLANS list only wants paid meal plans. Filter the
  // server-derived rows to buildType 'mealplan' (legacy rows w/o detail stay); local
  // dupes (no .id) always pass. Program/diet templates no longer leak in here.
  const customCards = (serverPlans || dupes)
    .filter(p => !p.id || !p.detail || p.detail.buildType === 'mealplan')
    .map(p => p.id ? { n: p.name, meta: p.meta || 'New meal plan', price: p.price || '$—', id: p.id, server: true, detail: p.detail || null } : p);
  // §5 (CodeRabbit) — the demo social-proof rows (12 on it · 4.9 ★) are a
  // signed-OUT preview only; a signed-in coach sees only their real
  // serverPlans-derived rows (customCards), with the empty-state redaction.
  const plans = signedIn ? [...customCards] : [...customCards,
    { n: 'Lean Cut', meta: '2,100 kcal · 12 on it · 4.9 ★', price: '$140' },
    { n: 'Performance', meta: '3,200 kcal · 8 on it · 4.8 ★', price: '$140' },
    { n: 'Vegetarian Base', meta: '2,400 kcal · 6 on it · 4.7 ★', price: '$120' },
    { n: 'Maintenance', meta: '2,700 kcal · 14 on it · 4.9 ★', price: '$120' },
  ];
  // Lifestyle-based meal programs a client can buy (the "Programs" sub-tab) — demo (signed-OUT only; §5 CodeRabbit).
  const nutriPrograms = signedIn ? [] : [
    { n: 'Busy professional', meta: '4 wks · fast & balanced · $130' },
    { n: 'New-parent reset', meta: '6 wks · simple batch meals · $120' },
    { n: 'Athlete fuel', meta: '8 wks · performance · $160' },
    { n: 'Weight-loss kickstart', meta: '4 wks · calorie-controlled · $110' },
  ];
  const [tab, setTab] = useStateBSP('library');
  const TABS = [['library', tr('coach:plans.tabLibrary', { defaultValue: 'Library' })], ['soundtracks', tr('coach:plans.tabSoundtracks', { defaultValue: 'Soundtracks' })]];
  // Library sub-tabs. Plans = multi-week paid meal plans, Programs = lifestyle
  // meal programs you sell, Diet = diet-specific meals / plans.
  const [libTab, setLibTab] = useStateBSP('plans');
  const LIB_TABS = [['plans', tr('coach:plans.subPlans', { defaultValue: 'Plans' })], ['programs', tr('coach:plans.subPrograms', { defaultValue: 'Programs' })], ['diet', tr('coach:diet.subDiet', { defaultValue: 'Diet' })]];
  const [buildType, setBuildType] = useStateBSP('mealplan'); // mealplan | program | diet
  const [blankMode, setBlankMode] = useStateBSP(false); // false = AI draft, true = build from scratch
  const BUILD_LABEL = { mealplan: tr('coach:diet.buildMealPlan', { defaultValue: 'meal plan' }), program: tr('coach:plans.buildProgram', { defaultValue: 'program' }), diet: tr('coach:diet.buildDiet', { defaultValue: 'diet' }) };
  const openDraft = (type, blank = false) => { setBuildType(type); setBlankMode(blank); setDrafting(true); };
  const [editDraft, setEditDraft] = useStateBSP(null); // generated/blank draft being customized before publish
  const [assignPlan, setAssignPlan] = useStateBSP(null); // catalogue plan being assigned to a client
  // ⚠ `days` must survive this destructure. The editor may hand over seven
  // authored day menus; a payload built without the key stores the legacy
  // repeated menu, the plan reloads looking untouched, and nothing errors —
  // the feature would be theatre. Omitted when empty so a draft with no per-day
  // authoring writes a `detail` byte-identical to today's.
  const publishDraft = async ({ name, blocks, note, media, days }) => {
    const typeName = BUILD_LABEL[buildType];
    const payload = { kind: 'meal_plan', name: name || `${goal} ${typeName}`, meta: `${typeName} · ${cals.replace('~', '')} kcal · ${diet.toLowerCase()}`, price: buildType === 'mealplan' ? '$120' : null, detail: { buildType, goal, diet, cals, mealsDay, blocks, note, media: media || [], ...(days && days.length ? { days } : {}) } };
    if (window.ShapeCoachPlans?.create) { try { const row = await window.ShapeCoachPlans.create(payload); if (row) setServerPlans(list => [row, ...(list || [])]); } catch (e) {} }
    flash(tr('coach:plans.published', { defaultValue: '{type} published', type: `${typeName.charAt(0).toUpperCase()}${typeName.slice(1)}` }));
    setEditDraft(null); setDrafting(false);
  };
  const libBuild = ({ plans: 'mealplan', programs: 'program', diet: 'diet' })[libTab] || 'mealplan';
  // Diet-specific meals / plans (the "Diet" sub-tab) — demo (signed-OUT only; §5 CodeRabbit).
  const diets = signedIn ? [] : [
    { n: 'Keto · 7-day', meta: '20g net carbs · high fat · $90' },
    { n: 'Mediterranean', meta: 'whole-food · heart-healthy · $90' },
    { n: 'High-protein cut', meta: '180g+ protein · lean · $100' },
    { n: 'Plant-based week', meta: 'vegan · balanced macros · $90' },
    { n: 'Low-FODMAP', meta: 'gut-friendly · gentle · $110' },
  ];
  // Owner directive — individual dishes shown under a MEALS station on the Diet
  // sub-tab (no ASSIGN, no price; open = the same openDraft the diet rows use).
  const singleMeals = signedIn ? [] : [
    { n: 'Salmon dinner plate', meta: '630 kcal · 42P · dinner' },
    { n: 'High-protein breakfast bowl', meta: '420 kcal · 32P · breakfast' },
    { n: 'Chicken + rice lunch', meta: '620 kcal · 48P · lunch' },
    { n: 'Recovery smoothie', meta: '310 kcal · 30P · snack' },
  ];
  // Clients enrolled per paid plan (shown under the Plans sub-tab) — demo facepiles
  // carry fabricated "N on it" counts, so signed-OUT preview only (§5 CodeRabbit).
  const enrolled = signedIn ? [] : [
    { prog: 'Lean Cut', n: 12, who: [['A', t.RUST], ['J', '#3b7de0']] },
    { prog: 'Performance', n: 8, who: [['R', t.AMBER]] },
    { prog: 'Vegetarian Base', n: 6, who: [['S', '#2f7d4f'], ['P', '#8a5cf6']] },
    { prog: 'Maintenance', n: 14, who: [['C', t.AMBER], ['D', t.RUST]] },
  ];

  if (showSoundtracks) return <BSProSoundtracks role="nutritionist" onBack={() => setShowSoundtracks(false)} />;

  // ── Assign a catalogue meal plan to a linked client ──
  if (assignPlan) return <BSProAssignPage role="nutritionist" plan={assignPlan} onBack={() => setAssignPlan(null)} onDone={() => { setAssignPlan(null); flash(tr('coach:diet.assignedEat', { defaultValue: "Assigned — it's on their Eat tab" })); }} />;

  // ── Customize the generated/blank draft before publishing ──
  // perDayAuthoring is capability-gated to the build types that produce a MENU
  // this contract governs. Never `program`: those blocks are week ARCS (C0), so
  // day tabs there would invite authoring food into a shape that cannot deliver
  // it. Never the trainer paths, which share this component.
  if (editDraft) return <BSCoachDraftEditor t={t} accent={gold} accentInk="#241c08" typeName={BUILD_LABEL[buildType]} blockLabel={editDraft.blockLabel} initialName={editDraft.name} initialBlocks={editDraft.blocks} initialNote={editDraft.note} initialMedia={editDraft.media} initialDays={editDraft.days} stepAuthoring perDayAuthoring={buildType === 'mealplan' || buildType === 'diet'} onPublish={publishDraft} onCancel={() => { setEditDraft(null); setDrafting(false); }} />;

  // ── AI draft sheet (meal-plan builder) ──
  if (drafting) {
    const chips = (label, value, set, opts) => (
      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 9 }}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map(o => {
            const on = value === o;
            return <button key={o} onClick={() => set(o)} style={{ borderRadius: 999, padding: '9px 15px', cursor: 'pointer', border: `1px solid ${on ? gold : t.RULE}`, background: on ? `${gold}1c` : 'transparent', color: on ? gold : t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em' }}>{o}</button>;
          })}
        </div>
      </div>
    );
    const generate = async () => {
      setDraftStatus(blankMode ? tr('coach:plans.openingEditor', { defaultValue: 'Opening editor…' }) : tr('coach:plans.generating', { defaultValue: 'Generating…' }));
      if (!blankMode) { try { await window.ShapeAI?.generatePlanDraft?.({ kind: buildType, goal, client: '', level: diet, duration: '7 days', calories: cals.replace('~', ''), preferences: desc, protein: '' }); } catch (e) {} }
      const mk = (arr) => arr.map((s, i) => ({ id: 'b' + i, text: s }));
      const outline = blankMode ? mk(['', '', '']) : (buildType === 'program'
        ? mk(['Week 1 — Reset & habits', 'Week 2 — Build routine', 'Week 3 — Dial macros', 'Week 4 — Lock it in', 'Grocery + prep guide'])
        : buildType === 'diet'
        ? mk(['Breakfast options', 'Lunch options', 'Dinner options', 'Snacks', 'Foods to favour', 'Foods to avoid'])
        : mk(['Breakfast · ~500 kcal', 'Lunch · ~600 kcal', 'Snack · ~250 kcal', 'Dinner · ~650 kcal', 'Evening · ~150 kcal']));
      const blockLabel = buildType === 'program' ? tr('coach:plans.blockWeeks', { defaultValue: 'Weeks' }) : buildType === 'diet' ? tr('coach:diet.blockMealOptions', { defaultValue: 'Meal options' }) : tr('coach:diet.blockDailyMeals', { defaultValue: 'Daily meals' });
      setDrafting(false);
      setEditDraft({ name: `${goal} ${BUILD_LABEL[buildType]}`, blocks: outline, note: '', blockLabel });
    };
    return (
      <BSPage>
        {/* Masthead row at the standard inset — the AI-draft eyebrow + CANCEL
            sit BELOW it (every page opens on the same row). corners: false —
            this view holds an unsaved draft the self avatar would discard. */}
        <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow({ corners: false })}</div>
        <div style={{ padding: `12px ${t.padX}px 28px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: gold }}>{blankMode ? tr('coach:plans.buildEyebrow', { defaultValue: 'BUILD' }) : tr('coach:plans.aiDraftEyebrow', { defaultValue: '✦ AI DRAFT' })} · {BUILD_LABEL[buildType].toUpperCase()}</div>
            <button onClick={() => setDrafting(false)} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.cancelUpper', { defaultValue: 'CANCEL' })}</button>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{blankMode ? tr('coach:plans.buildA', { defaultValue: 'Build a' }) : tr('coach:plans.describeThe', { defaultValue: 'Describe the' })} <span style={{ fontStyle: 'italic', color: gold }}>{BUILD_LABEL[buildType]}.</span></div>
          {/* What are you building? */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 8 }}>{tr('coach:plans.building', { defaultValue: 'BUILDING' })}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['mealplan', tr('coach:diet.kindMealPlan', { defaultValue: 'Meal plan' })], ['program', tr('coach:plans.kindProgram', { defaultValue: 'Program' })], ['diet', tr('coach:diet.kindDiet', { defaultValue: 'Diet' })]].map(([k, l]) => {
                const on = buildType === k;
                return <button key={k} onClick={() => setBuildType(k)} style={{ flex: 1, borderRadius: 999, padding: '10px 6px', cursor: 'pointer', border: `1px solid ${on ? gold : t.RULE}`, background: on ? `${gold}1c` : 'transparent', color: on ? gold : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{l}</button>;
              })}
            </div>
            <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: t.INK50 }}>{buildType === 'mealplan' ? tr('coach:diet.descMealPlan', { defaultValue: 'A multi-week paid plan clients enroll in.' }) : buildType === 'program' ? tr('coach:diet.descProgram', { defaultValue: 'A lifestyle meal program a client can buy.' }) : tr('coach:diet.descDiet', { defaultValue: 'A diet-specific set of meals / plans.' })}</div>
          </div>
          {!blankMode && <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder={tr('coach:diet.descPlaceholder', { defaultValue: 'e.g. high-protein cut, vegetarian, around 2,000 kcal, hates seafood, loves oats' })} style={{ width: '100%', boxSizing: 'border-box', marginTop: 18, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: 14, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />}
          {chips(tr('coach:diet.goalLabel', { defaultValue: 'GOAL' }), goal, setGoal, ['Cut', 'Maintain', 'Lean bulk', 'Performance'])}
          {chips(tr('coach:diet.dietLabel', { defaultValue: 'DIET' }), diet, setDiet, ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian'])}
          {chips(tr('coach:diet.dailyCaloriesLabel', { defaultValue: 'DAILY CALORIES' }), cals, setCals, ['~1800', '~2100', '~2600', '~3000'])}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 9 }}>{tr('coach:diet.mealsPerDay', { defaultValue: 'MEALS / DAY' })}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[3, 4, 5, 6].map(n => { const on = mealsDay === n; return <button key={n} onClick={() => setMealsDay(n)} style={{ width: 40, height: 40, borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? gold : t.RULE}`, background: on ? gold : 'transparent', color: on ? '#241c08' : t.INK, fontFamily: t.MONO, fontSize: 12, fontWeight: 800 }}>{n}</button>; })}
            </div>
          </div>
          <button onClick={generate} style={{ width: '100%', marginTop: 24, borderRadius: 14, border: 0, background: gold, color: '#241c08', padding: '16px', fontFamily: t.MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>{draftStatus || (blankMode ? tr('coach:plans.createType', { defaultValue: 'Create {type}', type: BUILD_LABEL[buildType] }) : tr('coach:plans.generateDraft', { defaultValue: '✦ Generate draft' }))}</button>
          <div style={{ marginTop: 12, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:plans.editBeforePublish', { defaultValue: 'You can edit everything before publishing' })}</div>
        </div>
        <BSFooter left={tr('coach:plans.footerAiDraft', { defaultValue: 'AI draft' })} right={tr('coach:diet.footerAiMealPlan', { defaultValue: 'Meal plan' })} />
      </BSPage>
    );
  }

  // ── Ledger furniture (spec §1) — shared bsPro* helpers (above bsProMastRow),
  // bound to this component's t/heat/flash so trainer + nutri can't drift. ──
  const Redact = typeof window !== 'undefined' ? window.BSTRedact : null;
  const stationHead = (label, trailing) => bsProStationHead(t, heat, label, trailing);
  const monoTrail = (label, onClick) => bsProMonoTrail(t, label, onClick);
  const featureLead = (eyebrow, headA, headB, meta, actions) => bsProFeatureLead(t, heat, eyebrow, headA, headB, meta, actions);
  const enrolledRow = (e, i) => bsProEnrolledRow(t, flash, e, i);

  // §2 (CodeRabbit) — catalogue stat: signed-out keeps the demo string; signed-in
  // shows the live PUBLISHED count once loaded, else "—" (no fabricated on-it count).
  const catalogueStat = !signedIn
    ? tr('coach:diet.catalogueDemoNutri', { defaultValue: '· 4 PUBLISHED · 40 ON IT' })
    : (serverPlans === null ? '· —' : tr('coach:plans.publishedCount', { defaultValue: '· {count} PUBLISHED', count: serverPlans.length }));

  return (
    <BSPage>
      {/* §1.1 Header — mast row (the standard inset) + THE CATALOGUE eyebrow
          + serif "Your plans." (heat italic). */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow()}</div>
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
          {tr('coach:plans.theCatalogue', { defaultValue: 'THE CATALOGUE' })} <span style={{ color: `${t.INK}80` }}>{catalogueStat}</span>
        </div>
        <div data-tour="hero-plans" style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK, lineHeight: 1.05 }}>
          {tr('coach:plans.yourWord', { defaultValue: 'Your' })} <i style={{ color: heat, fontStyle: 'italic' }}>{tr('coach:diet.plansAccent', { defaultValue: 'plans.' })}</i>
        </div>
      </div>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        {note && <div style={{ marginTop: 12, borderRadius: 999, border: `1px solid ${teal}`, background: `${teal}1c`, color: teal, padding: '9px 14px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em' }}>✓ {note}</div>}

        {/* §1.2 LIBRARY / SOUNDTRACKS — typographic index */}
        <div style={{ marginTop: 14 }}>{bsProTypoIndex(t, TABS, tab, setTab, { ariaLabel: tr('coach:plans.libraryOrSoundtracks', { defaultValue: 'Library or soundtracks' }) })}</div>

        {tab === 'library' && (<>
        {/* §1.3 Create actions — draft with AI · build from scratch */}
        <div style={{ marginTop: 6 }}>
          <BSProTextAction heat={heat} t={t} label={tr('coach:plans.draftInSeconds', { defaultValue: '✦ Draft a {type} in seconds →', type: BUILD_LABEL[libBuild] })} onClick={() => openDraft(libBuild)} />
          <BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.buildFromScratch', { defaultValue: '＋ Build from scratch' })} onClick={() => openDraft(libBuild, true)} />
        </div>

        {/* §1.4 Kind sub-tabs — Plans / Programs / Diet */}
        <div style={{ marginTop: 8 }}>{bsProTypoIndex(t, LIB_TABS, libTab, setLibTab, { ariaLabel: tr('coach:plans.catalogueKind', { defaultValue: 'Catalogue kind' }) })}</div>

        {libTab === 'plans' && (<>
        {/* §1.5 THE CATALOGUE — paid meal plans as dot-leader rows */}
        {stationHead(tr('coach:plans.paidPlans', { defaultValue: 'PAID PLANS' }))}
        {plans.length === 0 ? (
          <div style={{ marginTop: 2 }}>
            {Redact ? <Redact INK={t.INK} label={tr('coach:plans.noPublishedPlans', { defaultValue: 'NO PUBLISHED PLANS' })} /> : null}
            <BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.buildFromScratch', { defaultValue: '＋ Build from scratch' })} onClick={() => openDraft('mealplan', true)} />
          </div>
        ) : (
          <div style={{ marginTop: 2 }}>
            {plans.map((p, i) => (
              <BSProCatRow key={p.id || p.n} index={i} name={p.n} meta={p.meta} price={p.price} heat={heat} t={t}
                onOpen={() => openDraft('mealplan')}
                onAssign={() => setAssignPlan({ id: p.id || null, name: p.n, meta: p.meta, detail: p.detail || null })} />
            ))}
          </div>
        )}
        {/* §1.6 ENROLLED — clients on plans */}
        {stationHead(tr('coach:plans.enrolled', { defaultValue: 'ENROLLED' }))}
        {enrolled.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:plans.noEnrolled', { defaultValue: 'NO ENROLLED CLIENTS' })} /> : null
        ) : (
          <div style={{ marginTop: 2 }}>{enrolled.map(enrolledRow)}</div>
        )}
        </>)}

        {libTab === 'programs' && (<>
        {/* Top program — unboxed verdict lead. §5 (CodeRabbit) — fabricated
            "24 on it · 4.8 ★" so signed-OUT preview only. */}
        {!signedIn && featureLead('TOP PROGRAM · $130', 'Busy', 'professional.', '4 wks · fast & balanced · 24 on it · 4.8 ★', <>
          <span style={{ display: 'inline-flex' }}><BSProTextAction heat={heat} t={t} label={tr('coach:plans.edit', { defaultValue: 'EDIT' })} onClick={() => openDraft('program')} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.duplicate', { defaultValue: 'DUPLICATE' })} onClick={() => duplicate({ n: 'Busy professional', meta: '4 wks · 24 on it · 4.8 ★', price: '$130' })} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.shareAction', { defaultValue: 'SHARE →' })} onClick={() => share('Busy professional')} /></span>
        </>)}
        {/* Lifestyle meal programs for sale — demo signed-out, redaction signed-in-with-none. */}
        {stationHead(tr('coach:diet.lifestyle', { defaultValue: 'LIFESTYLE' }), monoTrail(tr('coach:plans.newAction', { defaultValue: 'NEW →' }), () => openDraft('program')))}
        {nutriPrograms.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:plans.noPrograms', { defaultValue: 'NO PROGRAMS YET' })} /> : null
        ) : (
        <div style={{ marginTop: 2 }}>
          {nutriPrograms.map((r, i) => (
            <BSProCatRow key={r.n} index={i} name={r.n} meta={r.meta} heat={heat} t={t}
              onOpen={() => openDraft('program')}
              onAssign={() => setAssignPlan({ id: r.id || null, name: r.n, meta: r.meta, detail: r.detail || null })} />
          ))}
        </div>
        )}
        </>)}

        {libTab === 'diet' && (<>
        {/* Top diet — unboxed verdict lead. §5 (CodeRabbit) — fabricated
            "31 on it · 4.7 ★" so signed-OUT preview only. */}
        {!signedIn && featureLead('TOP DIET · $90', 'Keto ·', '7-day.', '20g net carbs · high fat · 31 on it · 4.7 ★', <>
          <span style={{ display: 'inline-flex' }}><BSProTextAction heat={heat} t={t} label={tr('coach:plans.edit', { defaultValue: 'EDIT' })} onClick={() => openDraft('diet')} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.duplicate', { defaultValue: 'DUPLICATE' })} onClick={() => duplicate({ n: 'Keto · 7-day', meta: '20g net carbs · 31 on it · 4.7 ★', price: '$90' })} /></span>
          <span style={{ display: 'inline-flex' }}><BSProTextAction mono heat={heat} t={t} label={tr('coach:plans.shareAction', { defaultValue: 'SHARE →' })} onClick={() => share('Keto 7-day')} /></span>
        </>)}
        {/* Diet-specific meals / plans — demo signed-out, redaction signed-in-with-none. */}
        {stationHead(tr('coach:diet.dietSpecific', { defaultValue: 'DIET-SPECIFIC' }), monoTrail(tr('coach:plans.newAction', { defaultValue: 'NEW →' }), () => openDraft('diet')))}
        {diets.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:diet.noDiets', { defaultValue: 'NO DIETS YET' })} /> : null
        ) : (
        <div style={{ marginTop: 2 }}>
          {diets.map((r, i) => (
            <BSProCatRow key={r.n} index={i} name={r.n} meta={r.meta} heat={heat} t={t}
              onOpen={() => openDraft('diet')}
              onAssign={() => setAssignPlan({ id: r.id || null, name: r.n, meta: r.meta, detail: r.detail || null })} />
          ))}
        </div>
        )}

        {/* Owner directive — MEALS · SINGLE DISHES: individual meals (no price / no
            ASSIGN) — demo signed-out, redaction signed-in-with-none. */}
        {stationHead(tr('coach:diet.singleDishes', { defaultValue: 'MEALS · SINGLE DISHES' }))}
        {singleMeals.length === 0 ? (
          Redact ? <Redact INK={t.INK} label={tr('coach:diet.noMeals', { defaultValue: 'NO MEALS YET' })} /> : null
        ) : (
        <div style={{ marginTop: 2 }}>
          {singleMeals.map((m, i) => (
            <BSProCatRow key={m.n} index={i} name={m.n} meta={m.meta} heat={heat} t={t} onOpen={() => openDraft(libBuild)} />
          ))}
        </div>
        )}
        </>)}
        </>)}

        {tab === 'soundtracks' && (
        <BSProSoundtracks role="nutritionist" embedded onBack={() => setTab('library')} />
        )}
      </div>
      <BSFooter left={tr('coach:common.nutriEdition', { defaultValue: 'The Nutri Edition' })} right={tr('coach:nav.plans', { defaultValue: 'Plans' })} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED PRO ME
// ═══════════════════════════════════════════════════════════
// Coach soundtrack library — save Spotify/Apple playlists once and assign them
// to workouts / meal plans. Imports + assignments sync via ShapeSoundtracks
// (coach_soundtracks, web↔mobile), with a localStorage fallback when signed out;
// demo playlists seed the list before the coach saves their own.
function bsReadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
function bsWriteJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const BS_SOUNDTRACKS_DEMO = [
  { id: 'heavy', name: 'Heavy Lifts', provider: 'spotify', tag: 'High energy', tracks: 18, dur: '1h 12m', bpm: '138-150', used: 31, c: '#c0533b' },
  { id: 'tempo', name: 'Tempo Run', provider: 'apple', tag: 'Cardio surge', tracks: 24, dur: '1h 48m', bpm: '160-172', used: 22, c: '#2c7fb8' },
  { id: 'pull', name: 'Pull Day Pulse', provider: 'spotify', tag: 'Steady push', tracks: 14, dur: '52m', bpm: '95-130', used: 14, c: '#7a5cc0' },
  { id: 'hiit', name: 'HIIT Inferno', provider: 'spotify', tag: 'High energy', tracks: 16, dur: '44m', bpm: '150-175', used: 19, c: '#d8743b' },
  { id: 'cool', name: 'Cooldown & Stretch', provider: 'spotify', tag: 'Cooldown', tracks: 10, dur: '32m', bpm: '60-80', used: 17, c: '#2bb0a0' },
  { id: 'sunday', name: 'Sunday Meal Prep', provider: 'apple', tag: 'Calm prep', tracks: 16, dur: '1h 05m', bpm: '85-100', used: 12, c: '#b9a13e' },
  { id: 'morning', name: 'Morning Flow', provider: 'apple', tag: 'Calm prep', tracks: 12, dur: '38m', bpm: '70-90', used: 9, c: '#8a9a4e' },
  { id: 'focus', name: 'Deep Focus', provider: 'apple', tag: 'Focus', tracks: 20, dur: '1h 14m', bpm: 'Low', used: 8, c: '#5566c0' },
  { id: 'power', name: 'Power Hour', provider: 'spotify', tag: 'Steady push', tracks: 22, dur: '1h 22m', bpm: '120-140', used: 27, c: '#4a6fb0' },
];
const BS_SOUNDTRACK_TARGETS = [
  { id: 'w1', kind: 'Workout', name: 'Upper Push — Peak' },
  { id: 'w2', kind: 'Workout', name: 'Lower Pull — Build' },
  { id: 'w3', kind: 'Workout', name: 'Conditioning — HIIT' },
  { id: 'p1', kind: 'Program', name: 'Cut Block 6' },
  { id: 'm1', kind: 'Meal plan', name: 'Lean Cut · 1900 kcal' },
  { id: 'm2', kind: 'Meal plan', name: 'Performance · 2600 kcal' },
];
// Per-client workouts — the Assign page's "By client" tab attaches a soundtrack
// straight to a client's assigned workouts.
const BS_SOUNDTRACK_CLIENTS = [
  { id: 'sofia', name: 'Sofia Martinez', workouts: ['Upper Push — Peak', 'Lower Pull — Build', 'Conditioning — HIIT'] },
  { id: 'alex', name: 'Alex Rivera', workouts: ['Push / Pull / Legs', 'Tempo Run'] },
  { id: 'priya', name: 'Priya Singh', workouts: ['Fat Loss Circuit', 'Core & Mobility'] },
  { id: 'marcus', name: 'Marcus Lee', workouts: ['Intro Full Body'] },
  { id: 'jamal', name: 'Jamal Green', workouts: ['Strength A', 'Strength B', 'Deadlift Focus'] },
];
function bsEqGlyph(color) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="3.4" height="10" rx="1.2" fill={color} /><rect x="8.3" y="6" width="3.4" height="15" rx="1.2" fill={color} /><rect x="13.6" y="9" width="3.4" height="12" rx="1.2" fill={color} /><rect x="18.9" y="4" width="2.6" height="17" rx="1.2" fill={color} /></svg>
  );
}
// Soundtracks page shell — a full BSPage normally, or an inline fragment when
// embedded inside the Plans page's Soundtracks tab (module-level so it's a
// stable component type and inputs don't remount/lose focus on re-render).
// topPad is a CSS length STRING and defaults to the one masthead inset — every
// soundtracks page opens on the same row, so no caller overrides it.
//
// The shell RENDERS that row (rather than each branch doing it) because this
// page has five of them — a library, two pickers, an import form and an assign
// view — and only the library used to draw one, so the other four reserved the
// masthead inset and then opened on a blank gap.
//
// ⚠ corners: false is structural here, not a preference. Both coach shells
// early-return <BSProSoundtracks> ABOVE the `showSettings` return AND above the
// main return that hosts the search overlay, so from this page the avatar's
// shape:openProSettings can never render and ⌕ has nothing to paint into —
// both would be dead controls that still push a nav entry.
function BSStShell({ embedded, t, children, footerL, footerR, topPad = BS_MAST_TOP_CSS }) {
  if (embedded) return <div style={{ padding: '4px 0 24px' }}>{children}</div>;
  return <BSPage><div style={{ padding: `${topPad} ${t.padX}px 28px` }}>{bsProMastRow({ corners: false })}<div style={{ marginTop: 12 }}>{children}</div></div><BSFooter left={footerL} right={footerR} /></BSPage>;
}
// "Pick from your Spotify library" needs per-user OAuth, which is capped at 25
// manually-allowlisted accounts until the Spotify app is approved for Extended
// Quota Mode. Until then, set VITE_SPOTIFY_LIBRARY_PICKER=off to hide the picker
// fleet-wide (paste-a-link still works for everyone). Default: shown.
const SPOTIFY_PICKER_ENABLED = String(import.meta.env.VITE_SPOTIFY_LIBRARY_PICKER ?? '').toLowerCase() !== 'off';
// Apple Music "pick from your library" uses client-side MusicKit (no per-user
// allowlist), but the developer-token route needs the APPLE_MUSIC_* env set.
// Until then tapping it degrades to a friendly "paste a link" message. Set
// VITE_APPLE_LIBRARY_PICKER=off to hide the picker fleet-wide. Default: shown.
const APPLE_PICKER_ENABLED = String(import.meta.env.VITE_APPLE_LIBRARY_PICKER ?? '').toLowerCase() !== 'off';
function BSProSoundtracks({ role = 'trainer', onBack, embedded = false }) {
  const t = useBS();
  const tr = useShapeTr();
  const gold = '#d8b25a', teal = t.isLight ? '#0a8f87' : '#34d6c5', purple = '#8a5cf6';
  const [extra, setExtra] = useStateBSP(() => bsReadJSON('bs_coach_soundtracks', []));
  const [serverList, setServerList] = useStateBSP(null); // array once synced from the API
  const [assign, setAssign] = useStateBSP(() => bsReadJSON('bs_coach_soundtrack_assign', {}));
  const [query, setQuery] = useStateBSP('');
  const [filter, setFilter] = useStateBSP('all');
  const [importing, setImporting] = useStateBSP(false);
  const [assignFor, setAssignFor] = useStateBSP(null);
  const [assignTab, setAssignTab] = useStateBSP('plans'); // 'plans' | 'clients'
  const [clientQuery, setClientQuery] = useStateBSP('');
  // import form
  const [iName, setIName] = useStateBSP('');
  const [iProvider, setIProvider] = useStateBSP('spotify');
  const [iTag, setITag] = useStateBSP('');
  const [iUrl, setIUrl] = useStateBSP('');
  // Spotify "pick from your library" importer
  const [spotConnected, setSpotConnected] = useStateBSP(null); // null = checking
  const [spotPlaylists, setSpotPlaylists] = useStateBSP(null);
  const [spotBusy, setSpotBusy] = useStateBSP(false);
  const [spotErr, setSpotErr] = useStateBSP('');
  const [picking, setPicking] = useStateBSP(false);
  // Apple Music "pick from your library" importer (client-side MusicKit authorize;
  // no server connect-status — listAppleMusicPlaylists() configures + authorizes)
  const [applePlaylists, setApplePlaylists] = useStateBSP(null);
  const [appleBusy, setAppleBusy] = useStateBSP(false);
  const [appleErr, setAppleErr] = useStateBSP('');
  const [pickingApple, setPickingApple] = useStateBSP(false);

  const hydrate = (r) => ({ ...r, c: r.provider === 'apple' ? '#b9a13e' : '#4a6fb0', dur: r.duration || '—', bpm: r.bpm || '—', used: 0 });
  useEffectBSP(() => {
    if (!window.ShapeSoundtracks?.list) return;
    window.ShapeSoundtracks.list().then(rows => { if (Array.isArray(rows)) setServerList(rows.map(hydrate)); }).catch(() => {});
  }, []);
  // Resolve whether this coach has Spotify connected (drives the importer CTA).
  useEffectBSP(() => {
    let alive = true;
    if (!window.ShapeIntegrations?.getStatus) { setSpotConnected(false); return undefined; }
    window.ShapeIntegrations.getStatus()
      .then(s => { if (alive) setSpotConnected(!!(s?.providers || []).find(p => p.id === 'spotify')?.connected); })
      .catch(() => { if (alive) setSpotConnected(false); });
    return () => { alive = false; };
  }, []);
  const loadSpotifyPlaylists = async () => {
    if (!window.ShapeIntegrations?.listSpotifyPlaylists) { setSpotConnected(false); return; }
    setSpotBusy(true); setSpotErr('');
    try {
      const r = await window.ShapeIntegrations.listSpotifyPlaylists();
      setSpotPlaylists(Array.isArray(r?.playlists) ? r.playlists : []);
      setSpotConnected(true);
      setPicking(true);
    } catch (e) {
      // Not connected / token gone → flip back to the connect prompt (no scary error).
      if (e && e.connected === false) { setSpotConnected(false); setSpotErr(''); }
      // Otherwise it's almost always the Spotify dev-mode allowlist (account not
      // approved yet) — keep it friendly and point them at the manual link path.
      else setSpotErr(tr('coach:sound.spotifyRollout', { defaultValue: 'Library import is still rolling out for your account — paste a playlist link below for now.' }));
    } finally { setSpotBusy(false); }
  };
  const pickSpotifyPlaylist = (pl) => {
    setIName(pl.name || ''); setIUrl(pl.url || ''); setIProvider('spotify');
    if (!iTag.trim()) setITag(tr('coach:sound.fromSpotifyTag', { defaultValue: 'From Spotify' }));
    setPicking(false);
  };
  const loadAppleMusicPlaylists = async () => {
    if (!window.ShapeIntegrations?.listAppleMusicPlaylists) { setAppleErr(tr('coach:sound.appleUnavailable', { defaultValue: 'Apple Music isn’t available here.' })); return; }
    setAppleBusy(true); setAppleErr('');
    try {
      const rows = await window.ShapeIntegrations.listAppleMusicPlaylists();
      setApplePlaylists(Array.isArray(rows) ? rows : []);
      setPickingApple(true);
    } catch (e) {
      // Not authorized / not configured yet → friendly nudge to the paste-a-link path.
      if (e && e.connected === false) setAppleErr(tr('coach:sound.appleAuthorize', { defaultValue: 'Authorize Apple Music to pick from your library — it may not be enabled for your account yet.' }));
      else setAppleErr(tr('coach:sound.appleLoadFail', { defaultValue: 'Couldn’t load your Apple Music library — paste a playlist link below for now.' }));
    } finally { setAppleBusy(false); }
  };
  const pickAppleMusicPlaylist = (pl) => {
    setIName(pl.name || ''); setIUrl(pl.url || ''); setIProvider('apple');
    if (!iTag.trim()) setITag(tr('coach:sound.fromAppleTag', { defaultValue: 'From Apple Music' }));
    setPickingApple(false);
  };

  // Custom playlists are server-backed when signed in (synced with the website),
  // else local. Server rows carry an `attached` array; demo rows use localStorage.
  const customList = serverList || extra;
  const all = [...customList, ...BS_SOUNDTRACKS_DEMO];
  const isServerRow = (p) => Array.isArray(p.attached);
  const providerLabel = (p) => p === 'apple' ? 'APPLE MUSIC' : 'SPOTIFY';
  const providerDot = (p) => p === 'apple' ? '#fa243c' : '#1DB954';
  const attachedFor = (p) => (p ? (isServerRow(p) ? p.attached : (assign[p.id] || [])) : []);
  const assignedCount = (p) => attachedFor(p).length;
  const shown = all
    .filter(p => filter === 'all' ? true : p.provider === filter)
    .filter(p => { const q = query.trim().toLowerCase(); return !q || p.name.toLowerCase().includes(q) || (p.tag || '').toLowerCase().includes(q); });
  const totalAttached = all.reduce((s, p) => s + (p.used || 0) + assignedCount(p), 0);

  const saveImport = async () => {
    const name = iName.trim();
    if (!name) return;
    const payload = { name, provider: iProvider, tag: iTag.trim() || 'Custom', url: iUrl.trim(), tracks: 0, duration: '—', bpm: '—' };
    if (window.ShapeSoundtracks?.create) {
      try {
        const row = await window.ShapeSoundtracks.create(payload);
        if (row) { setServerList(list => [hydrate(row), ...(list || [])]); setIName(''); setITag(''); setIUrl(''); setIProvider('spotify'); setImporting(false); return; }
      } catch (e) {}
    }
    const pl = { id: 'c' + Date.now(), name, provider: iProvider, tag: payload.tag, tracks: 0, dur: '—', bpm: '—', used: 0, url: payload.url, c: iProvider === 'apple' ? '#b9a13e' : '#4a6fb0', custom: true };
    const next = [pl, ...extra];
    setExtra(next); bsWriteJSON('bs_coach_soundtracks', next);
    setIName(''); setITag(''); setIUrl(''); setIProvider('spotify'); setImporting(false);
  };
  const toggleAttach = (p, target) => {
    const cur = attachedFor(p);
    const exists = cur.some(a => a && a.id === target.id);
    const nextArr = exists ? cur.filter(a => a && a.id !== target.id) : [...cur, target];
    if (isServerRow(p)) {
      setServerList(list => (list || []).map(x => x.id === p.id ? { ...x, attached: nextArr } : x));
      if (window.ShapeSoundtracks?.update) window.ShapeSoundtracks.update({ id: p.id, attached: nextArr }).catch(() => {});
    } else {
      const next = { ...assign, [p.id]: nextArr };
      setAssign(next); bsWriteJSON('bs_coach_soundtrack_assign', next);
    }
  };

  // ── Import sub-view ──
  // ── Spotify playlist picker (pick from the coach's own library) ──
  if (importing && picking) {
    const list = spotPlaylists || [];
    return (
      <BSStShell embedded={embedded} t={t} footerL={tr('coach:sound.yourSpotifyFooter', { defaultValue: 'Your Spotify' })} footerR={tr('coach:sound.libraryFooter', { defaultValue: 'Library' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: gold }}>{tr('coach:sound.fromYourSpotify', { defaultValue: 'FROM YOUR SPOTIFY' })}</div>
            <button onClick={() => setPicking(false)} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.backArrow', { defaultValue: '← BACK' })}</button>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>{tr('coach:sound.yourWord', { defaultValue: 'Your' })} <span style={{ fontStyle: 'italic', color: gold }}>{tr('coach:sound.playlistsAccent', { defaultValue: 'playlists.' })}</span></div>
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:sound.tapToImport', { defaultValue: '{count, plural, one {# playlist} other {# playlists}} · tap one to import', count: list.length })}</div>
          <div style={{ marginTop: 16 }}>
            {list.length === 0 ? (
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontStyle: 'italic', color: t.INK50 }}>{tr('coach:sound.noSpotifyPlaylists', { defaultValue: 'No playlists found in your Spotify library.' })}</div>
            ) : list.map((pl) => (
              <button key={pl.id} onClick={() => pickSpotifyPlaylist(pl)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: `1px solid ${t.HAIR}`, background: 'transparent', border: 0 }}>
                <div style={{ width: 46, height: 46, borderRadius: 8, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pl.image ? <img src={pl.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : bsEqGlyph(gold)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
                  <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:sound.tracksCount', { defaultValue: '{count} tracks', count: pl.tracks })}{pl.owner ? ` · ${pl.owner}` : ''}</div>
                </div>
                <span style={{ fontFamily: t.MONO, fontSize: 16, color: gold, fontWeight: 700 }}>+</span>
              </button>
            ))}
          </div>
      </BSStShell>
    );
  }

  // ── Apple Music playlist picker (pick from the coach's own library) ──
  if (importing && pickingApple) {
    const list = applePlaylists || [];
    return (
      <BSStShell embedded={embedded} t={t} footerL={tr('coach:sound.yourAppleFooter', { defaultValue: 'Your Apple Music' })} footerR={tr('coach:sound.libraryFooter', { defaultValue: 'Library' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: gold }}>{tr('coach:sound.fromYourApple', { defaultValue: 'FROM YOUR APPLE MUSIC' })}</div>
            <button onClick={() => setPickingApple(false)} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.backArrow', { defaultValue: '← BACK' })}</button>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>{tr('coach:sound.yourWord', { defaultValue: 'Your' })} <span style={{ fontStyle: 'italic', color: gold }}>{tr('coach:sound.playlistsAccent', { defaultValue: 'playlists.' })}</span></div>
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:sound.tapToImport', { defaultValue: '{count, plural, one {# playlist} other {# playlists}} · tap one to import', count: list.length })}</div>
          <div style={{ marginTop: 16 }}>
            {list.length === 0 ? (
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontStyle: 'italic', color: t.INK50 }}>{tr('coach:sound.noApplePlaylists', { defaultValue: 'No playlists found in your Apple Music library.' })}</div>
            ) : list.map((pl) => (
              <button key={pl.id} onClick={() => pickAppleMusicPlaylist(pl)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: `1px solid ${t.HAIR}`, background: 'transparent', border: 0 }}>
                <div style={{ width: 46, height: 46, borderRadius: 8, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pl.image ? <img src={pl.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : bsEqGlyph(gold)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
                  <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:sound.tracksCount', { defaultValue: '{count} tracks', count: pl.tracks })}{pl.owner ? ` · ${pl.owner}` : ''}</div>
                </div>
                <span style={{ fontFamily: t.MONO, fontSize: 16, color: gold, fontWeight: 700 }}>+</span>
              </button>
            ))}
          </div>
      </BSStShell>
    );
  }

  if (importing) {
    const field = (label, value, set, placeholder) => (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: gold, marginBottom: 7 }}>{label}</div>
        <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '12px 13px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' }} />
      </div>
    );
    return (
      <BSStShell embedded={embedded} t={t} footerL={tr('coach:sound.newSoundtrackFooter', { defaultValue: 'New soundtrack' })} footerR={tr('coach:sound.libraryFooter', { defaultValue: 'Library' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: gold }}>{tr('coach:sound.newSoundtrack', { defaultValue: 'NEW SOUNDTRACK' })}</div>
            <button onClick={() => setImporting(false)} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.backArrow', { defaultValue: '← BACK' })}</button>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>{tr('coach:sound.importA', { defaultValue: 'Import a' })} <span style={{ fontStyle: 'italic', color: gold }}>{tr('coach:sound.playlistAccent', { defaultValue: 'playlist.' })}</span></div>
          <div style={{ marginTop: 22 }}>
            {/* Pick straight from the coach's connected Spotify — no link to paste.
                Hidden when VITE_SPOTIFY_LIBRARY_PICKER=off (pre Extended Quota). */}
            {SPOTIFY_PICKER_ENABLED && (
            <div style={{ marginBottom: 16, borderRadius: 14, border: `1px solid ${gold}44`, background: `linear-gradient(150deg, ${gold}14, ${t.PAPER2} 72%)`, padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#1DB954' }} />
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: gold }}>{tr('coach:sound.fromYourSpotify', { defaultValue: 'FROM YOUR SPOTIFY' })}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: '2px 6px' }}>{tr('coach:sound.beta', { defaultValue: 'BETA' })}</span>
              </div>
              <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.4 }}>
                {spotConnected === false ? tr('coach:sound.spotifyConnectBlurb', { defaultValue: 'Connect Spotify to pick from your library — rolling out, so it may not be enabled for your account yet.' }) : spotConnected === null ? tr('coach:sound.spotifyChecking', { defaultValue: 'Checking your Spotify connection…' }) : tr('coach:sound.pickStraight', { defaultValue: 'Pick a playlist straight from your library — we’ll fill in the rest.' })}
              </div>
              {spotConnected === false ? (
                <button onClick={() => window.ShapeIntegrations?.connectSpotify?.()} style={{ width: '100%', marginTop: 11, borderRadius: 12, border: `1px solid ${gold}`, background: 'transparent', color: gold, padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:sound.connectSpotify', { defaultValue: 'Connect Spotify →' })}</button>
              ) : (
                <button onClick={loadSpotifyPlaylists} disabled={spotBusy || spotConnected === null} style={{ width: '100%', marginTop: 11, borderRadius: 12, border: 0, background: gold, color: '#241c08', padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', opacity: (spotBusy || spotConnected === null) ? 0.6 : 1 }}>{spotBusy ? tr('coach:sound.loading', { defaultValue: 'Loading…' }) : tr('coach:sound.pickSpotify', { defaultValue: 'Pick from your Spotify →' })}</button>
              )}
              {spotErr ? <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 12.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.4 }}>{spotErr}</div> : null}
              <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:sound.orPasteLink', { defaultValue: 'Or paste a link below — works for everyone' })}</div>
            </div>
            )}
            {/* Pick straight from the coach's Apple Music library (client-side MusicKit
                authorize). Hidden when VITE_APPLE_LIBRARY_PICKER=off. */}
            {APPLE_PICKER_ENABLED && (
            <div style={{ marginBottom: 16, borderRadius: 14, border: `1px solid ${gold}44`, background: `linear-gradient(150deg, ${gold}14, ${t.PAPER2} 72%)`, padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#fa243c' }} />
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: gold }}>{tr('coach:sound.fromYourApple', { defaultValue: 'FROM YOUR APPLE MUSIC' })}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: '2px 6px' }}>{tr('coach:sound.beta', { defaultValue: 'BETA' })}</span>
              </div>
              <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.4 }}>{tr('coach:sound.pickStraightApple', { defaultValue: 'Pick a playlist straight from your Apple Music library — we’ll fill in the rest.' })}</div>
              <button onClick={loadAppleMusicPlaylists} disabled={appleBusy} style={{ width: '100%', marginTop: 11, borderRadius: 12, border: 0, background: gold, color: '#241c08', padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', opacity: appleBusy ? 0.6 : 1 }}>{appleBusy ? tr('coach:sound.loading', { defaultValue: 'Loading…' }) : tr('coach:sound.pickApple', { defaultValue: 'Pick from your Apple Music →' })}</button>
              {appleErr ? <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 12.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.4 }}>{appleErr}</div> : null}
              <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:sound.orPasteLink', { defaultValue: 'Or paste a link below — works for everyone' })}</div>
            </div>
            )}
            {field(tr('coach:sound.fieldName', { defaultValue: 'NAME' }), iName, setIName, 'Heavy Lifts')}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: gold, marginBottom: 7 }}>{tr('coach:sound.fieldSource', { defaultValue: 'SOURCE' })}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['spotify', 'Spotify'], ['apple', 'Apple Music']].map(([k, l]) => {
                  const on = iProvider === k;
                  return <button key={k} onClick={() => setIProvider(k)} style={{ flex: 1, borderRadius: 999, padding: '11px 6px', cursor: 'pointer', border: `1px solid ${on ? gold : t.RULE}`, background: on ? `${gold}1c` : 'transparent', color: on ? gold : t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: providerDot(k) }} />{l}</button>;
                })}
              </div>
            </div>
            {field(tr('coach:sound.fieldTag', { defaultValue: 'TAG' }), iTag, setITag, 'High energy')}
            {field(tr('coach:sound.fieldLink', { defaultValue: 'PLAYLIST LINK' }), iUrl, setIUrl, 'https://open.spotify.com/playlist/…')}
            <button onClick={saveImport} disabled={!iName.trim()} style={{ width: '100%', marginTop: 6, borderRadius: 14, border: 0, background: gold, color: '#241c08', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: iName.trim() ? 1 : 0.5 }}>{tr('coach:sound.saveSoundtrack', { defaultValue: 'Save soundtrack →' })}</button>
            <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:sound.savedLibraryHint', { defaultValue: 'Saved to your library · assign it to any workout or plan' })}</div>
          </div>
      </BSStShell>
    );
  }

  // ── Assign sub-view (Plans / Clients tabs) ──
  if (assignFor) {
    const pl = all.find(p => p.id === assignFor) || {};
    const cur = attachedFor(pl);
    const isOn = (id) => cur.some(a => a && a.id === id);
    const row = (target, tone) => {
      const on = isOn(target.id);
      return (
        <button key={target.id} onClick={() => toggleAttach(pl, target)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', borderRadius: 14, border: `1px solid ${on ? gold : t.RULE}`, background: on ? `${gold}14` : t.PAPER2, padding: '14px 15px' }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: tone }}>{target.kind.toUpperCase()}</div>
            <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{target.name}</div>
          </div>
          <span style={{ width: 24, height: 24, borderRadius: 999, border: `1px solid ${on ? gold : t.RULE}`, background: on ? gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#241c08', fontSize: 13, fontWeight: 800 }}>{on ? '✓' : ''}</span>
        </button>
      );
    };
    const clients = BS_SOUNDTRACK_CLIENTS.filter(c => { const q = clientQuery.trim().toLowerCase(); return !q || c.name.toLowerCase().includes(q); });
    return (
      <BSStShell embedded={embedded} t={t} footerL={tr('coach:sound.assignFooter', { defaultValue: 'Assign' })} footerR={pl.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: gold }}>{tr('coach:sound.assignSoundtrack', { defaultValue: 'ASSIGN SOUNDTRACK' })}</div>
            <button onClick={() => setAssignFor(null)} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>{tr('coach:common.backArrow', { defaultValue: '← BACK' })}</button>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 32, fontWeight: 600, color: t.INK, lineHeight: 1.02, letterSpacing: '-0.02em' }}>{pl.name} <span style={{ fontStyle: 'italic', color: gold }}>→</span></div>
          <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:sound.attachTo', { defaultValue: "{provider} · attach to plans or a client's workouts", provider: providerLabel(pl.provider) })}</div>
          {/* Tabs */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['plans', tr('coach:sound.plansWorkouts', { defaultValue: 'Plans & workouts' })], ['clients', tr('coach:sound.byClient', { defaultValue: 'By client' })]].map(([k, l]) => {
              const on = assignTab === k;
              return <button key={k} onClick={() => setAssignTab(k)} style={{ borderRadius: 999, padding: '9px 6px', cursor: 'pointer', border: `1px solid ${on ? gold : t.RULE}`, background: on ? `${gold}1c` : 'transparent', color: on ? gold : t.INK70, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</button>;
            })}
          </div>
          {assignTab === 'plans' ? (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BS_SOUNDTRACK_TARGETS.map(tg => row(tg, tg.kind === 'Meal plan' ? teal : t.RUST))}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${t.RULE}`, padding: '8px 2px', marginBottom: 14 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
                <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder={tr('coach:sound.searchClients', { defaultValue: 'Search clients…' })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 15 }} />
              </div>
              {clients.length === 0 && <div style={{ padding: '18px 4px', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>{tr('coach:sound.noClientsMatch', { defaultValue: 'No clients match.' })}</div>}
              {clients.map(c => (
                <div key={c.id} style={{ marginBottom: 18 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: t.INK50, marginBottom: 8 }}>{tr('coach:sound.clientWorkouts', { defaultValue: '{name} · {count} WORKOUTS', name: c.name.toUpperCase(), count: c.workouts.length })}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {c.workouts.map((w, i) => row({ id: `cli:${c.id}:${i}`, kind: tr('coach:sound.clientWorkoutKind', { defaultValue: 'Client workout' }), name: `${w} · ${c.name.split(' ')[0]}` }, t.RUST))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setAssignFor(null)} style={{ width: '100%', marginTop: 18, borderRadius: 14, border: 0, background: gold, color: '#241c08', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:sound.doneAttached', { defaultValue: 'Done · {count} attached', count: cur.length })}</button>
      </BSStShell>
    );
  }

  // ── Library (main) ──
  const stat = (label, value, sub, color) => (
    <div style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '13px 14px' }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color }}>{label}</div>
      <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 600, color: t.INK, lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{sub}</div>
    </div>
  );
  return (
    <BSStShell embedded={embedded} t={t} footerL={tr('coach:sound.footerLeft', { defaultValue: 'Soundtracks' })} footerR={tr('coach:sound.playlistsCountLower', { defaultValue: '{count} playlists', count: all.length })}>
        {!embedded && (<>
        {/* The masthead row is BSStShell's — every branch of this page opens on
            it, so drawing a second one here would double the row. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BSBackButton onClick={onBack} />
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: gold }}>{tr('coach:sound.playlistsCountUpper', { defaultValue: '{count} PLAYLISTS', count: all.length })}</span>
        </div>
        <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: gold }}>{tr('coach:sound.libraryHead', { defaultValue: 'SOUNDTRACK LIBRARY' })}</div>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>{tr('coach:sound.yourWord', { defaultValue: 'Your' })} <span style={{ fontStyle: 'italic', color: gold }}>{tr('coach:sound.soundtracksAccent', { defaultValue: 'soundtracks.' })}</span></div>
        <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 14.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.5 }}>{tr('coach:sound.libraryBlurb', { defaultValue: 'Premade playlists you can attach to any workout or meal plan — no need to build a new one each time.' })}</div>
        </>)}

        {/* New soundtrack */}
        <button onClick={() => setImporting(true)} style={{ width: '100%', marginTop: 20, textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center', borderRadius: 16, border: `1px solid ${gold}44`, background: `linear-gradient(150deg, ${gold}1c, ${t.PAPER2} 75%), ${t.PAPER2}`, padding: 16 }}>
          <span style={{ width: 48, height: 48, borderRadius: 12, background: gold, color: '#241c08', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 300, lineHeight: 1 }}>+</span>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: gold }}>{tr('coach:sound.newSoundtrack', { defaultValue: 'NEW SOUNDTRACK' })}</div>
            <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, color: t.INK, lineHeight: 1.15 }}>{tr('coach:sound.importFrom', { defaultValue: 'Import from Spotify or Apple Music' })}</div>
          </div>
          <span style={{ color: gold, fontSize: 16 }}>→</span>
        </button>

        {/* Stats */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {stat(tr('coach:sound.statPlaylists', { defaultValue: 'PLAYLISTS' }), String(all.length), '', gold)}
          {stat(tr('coach:sound.statAttached', { defaultValue: 'ATTACHED' }), String(totalAttached), tr('coach:sound.toPlans', { defaultValue: 'to plans' }), teal)}
          {stat(tr('coach:sound.statSources', { defaultValue: 'SOURCES' }), '2', tr('coach:sound.connected', { defaultValue: 'connected' }), purple)}
        </div>

        {/* Search */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${t.RULE}`, padding: '8px 2px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('coach:sound.searchSoundtracks', { defaultValue: 'Search soundtracks…' })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 15 }} />
        </div>

        {/* Filter pills */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['all', tr('coach:sound.filterAll', { defaultValue: 'All · {count}', count: all.length })], ['spotify', 'Spotify'], ['apple', 'Apple Music']].map(([k, l]) => {
            const on = filter === k;
            return <button key={k} onClick={() => setFilter(k)} style={{ borderRadius: 999, padding: '8px 15px', cursor: 'pointer', border: `1px solid ${on ? gold : t.RULE}`, background: on ? `${gold}1c` : 'transparent', color: on ? gold : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</button>;
          })}
        </div>

        {/* Playlist cards */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.length === 0 && (
            <div style={{ padding: '22px 16px', borderRadius: 16, border: `1px dashed ${t.RULE}`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>{tr('coach:sound.noMatch', { defaultValue: 'No soundtracks match.' })}</div>
          )}
          {shown.map((p) => {
            const att = assignedCount(p);
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 13, alignItems: 'center', borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 13 }}>
                <div style={{ position: 'relative', width: 58, height: 58, borderRadius: 12, background: `linear-gradient(150deg, ${p.c}, ${p.c}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {bsEqGlyph('#ffffffd0')}
                  <span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 999, background: providerDot(p.provider), border: '1.5px solid rgba(0,0,0,0.25)' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: providerDot(p.provider) }} />
                    {providerLabel(p.provider)} · {(p.tag || '').toUpperCase()}
                  </div>
                  <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{p.name}</div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.02em', lineHeight: 1.4 }}>{tr('coach:sound.tracksCount', { defaultValue: '{count} tracks', count: p.tracks })} · {p.dur} · {p.bpm} BPM · {att > 0 ? tr('coach:sound.assignedCount', { defaultValue: 'assigned {count}', count: att }) : tr('coach:sound.usedBy', { defaultValue: 'used by {count}', count: p.used })}</div>
                </div>
                <button onClick={() => setAssignFor(p.id)} style={{ alignSelf: 'stretch', minWidth: 64, borderRadius: 12, border: `1px solid ${att > 0 ? gold : `${gold}77`}`, background: att > 0 ? `${gold}1c` : 'transparent', color: gold, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer', padding: '0 10px' }}>{tr('coach:plans.assign', { defaultValue: 'ASSIGN' })}</button>
              </div>
            );
          })}
        </div>
      </BSStShell>
  );
}


// Monthly offer editor — the coach writes what their monthly coaching includes
// (blurb + up to 8 inclusion rows); shown to members on the marketplace Listing's
// WHAT'S INCLUDED sheet + the standing-offer coupon. Quiet form (two-tier rule);
// saves owner-scoped onto the provider row via window.ShapeCoachOffer.
function BSProMonthlyOfferSheet({ role, accent, onClose }) {
  const t = useBS();
  const [blurb, setBlurb] = React.useState('');
  const [rows, setRows] = React.useState([]); // [{ id, value }] — stable keys survive mid-list deletes
  const nextId = React.useRef(0);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  React.useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await window.ShapeCoachOffer?.get?.(role);
        if (on && r && r.offer) { setBlurb(r.offer.blurb || ''); setRows((Array.isArray(r.offer.includes) ? r.offer.includes : []).map((v) => ({ id: nextId.current++, value: v }))); }
      } catch (e) {}
      if (on) setLoaded(true);
    })();
    return () => { on = false; };
  }, [role]);
  const setRow = (id, v) => setRows((prev) => prev.map((x) => (x.id === id ? { ...x, value: v } : x)));
  const save = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await window.ShapeCoachOffer.save(role, { blurb, includes: rows.map((r) => r.value) });
      window.__bsToast?.('Monthly offer saved', 'ok');
      onClose();
    } catch (e) { setErr(String((e && e.message) || 'Could not save — are you signed in as an approved coach?')); }
    setBusy(false);
  };
  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit your monthly offer" style={{ width: '100%', boxSizing: 'border-box', maxHeight: '82%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))` }} className="bs-hide-scroll">
      <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent }}>Monthly offer · what's included</div>
      <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.15 }}>Tell members what monthly coaching gets them.</div>
      <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>Shown on your marketplace listing's coupon · plain text</div>
      {!loaded ? (
        <div style={{ padding: '18px 0', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>
      ) : (<>
        <label style={{ display: 'block', marginTop: 14 }}>
          <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>The pitch · up to 600 chars</span>
          <textarea value={blurb} onChange={(e) => setBlurb(e.target.value.slice(0, 600))} rows={4} placeholder="What working with you monthly actually looks like…"
            style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '10px 12px', fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
        </label>
        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Included · up to 8 lines</div>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input value={r.value} onChange={(e) => setRow(r.id, e.target.value.slice(0, 80))} placeholder="e.g. 4 sessions · weekly check-ins"
              style={{ flex: 1, boxSizing: 'border-box', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '9px 11px', fontFamily: t.DISPLAY, fontSize: 13.5, outline: 'none' }} />
            <button onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))} aria-label="Remove line" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontSize: 15, lineHeight: 1, padding: '6px 4px' }}>×</button>
          </div>
        ))}
        {rows.length < 8 && (
          <button onClick={() => setRows((prev) => [...prev, { id: nextId.current++, value: '' }])} style={{ marginTop: 10, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '12px 12px', border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>＋ Add a line</button>
        )}
        {err && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST }}>{err}</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => !busy && onClose()} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, padding: 14, border: 0, background: accent, color: t.isLight ? '#fff' : '#0c0a08', cursor: busy ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save offer'}</button>
        </div>
      </>)}
      </div>
    </div>
  );
}

// Listing-media editor — the coach dresses their marketplace box: a portrait of
// themselves, a cover (the box's background picture), and a studio gallery of
// their space. Saves owner-scoped onto the provider row via
// window.ShapeListingMedia (role-explicit — this app's own role names the table,
// so a dual-role coach customizes each listing separately). Uploads go to the
// coach's own <uid>/listing/ folder in the coach-media bucket; images only,
// ≤10 MB, enforced here before any bytes move (the bucket also allows video for
// plan clips, so the listing contract is client-enforced). The render-side
// normalizer (listingMedia.mjs) re-validates every URL — this is the write half.
function BSProListingMediaSheet({ role, accent, onClose }) {
  const t = useBS();
  const tr = useShapeTr();
  const [portrait, setPortrait] = React.useState(null);
  const [cover, setCover] = React.useState(null);
  const [gallery, setGallery] = React.useState([]); // [{ id, url, caption }] — stable keys survive mid-list deletes
  const nextId = React.useRef(0);
  const [meta, setMeta] = React.useState({ loaded: false, signedIn: true, hasRow: true, loadError: false });
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const portraitRef = React.useRef(null);
  const coverRef = React.useRef(null);
  const galleryRef = React.useRef(null);
  React.useEffect(() => {
    let on = true;
    setMeta((m) => ({ ...m, loaded: false, loadError: false }));
    (async () => {
      try {
        const r = await window.ShapeListingMedia?.mine?.(role);
        if (!on) return;
        if (r) {
          const m = r.media || {};
          setPortrait(m.portrait || null);
          setCover(m.cover || null);
          setGallery((Array.isArray(m.gallery) ? m.gallery : []).map((g) => ({ id: nextId.current++, url: g.url, caption: g.caption || '' })));
          setMeta({ loaded: true, signedIn: r.signedIn !== false, hasRow: !!r.hasRow, loadError: false });
        } else setMeta({ loaded: true, signedIn: false, hasRow: false, loadError: false });
      } catch (e) {
        // A transient fetch failure must NOT read as "no media" — that would let
        // Save persist an empty doc over the coach's real photos. Flag the error
        // so the render blocks the editor and offers a retry.
        if (on) setMeta({ loaded: true, signedIn: true, hasRow: true, loadError: true });
      }
    })();
    return () => { on = false; };
  }, [role, reloadKey]);
  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
  const MAX_BYTES = 10 * 1024 * 1024;
  // Accept an image by MIME, OR — when the picker omits the type (camera-roll
  // HEIC, content-provider selections) — by an allowlisted filename extension,
  // so those devices aren't hard-failed before upload's own ext fallback runs.
  const isImageFile = (file) => {
    const type = (file.type || '').toLowerCase();
    if (type) return IMAGE_MIMES.includes(type);
    const ext = (file.name || '').toLowerCase().split('.').pop();
    return IMAGE_EXTS.includes(ext);
  };
  const flashErr = (msg) => { setErr(msg); setTimeout(() => setErr(''), 2600); };
  // Returns the uploaded { url } or null (having surfaced an honest message).
  const uploadImage = async (file) => {
    if (!file) return null;
    if (!window.ShapeCoachMedia?.upload) { flashErr(tr('coach:editor.signInUpload', { defaultValue: 'Sign in to upload media.' })); return null; }
    // Images only, ≤10 MB — rejected before any bytes move (the bucket allows video).
    if (!isImageFile(file) || file.size > MAX_BYTES) {
      flashErr(tr('coach:editor.uploadFailed', { defaultValue: 'Upload failed' }));
      return null;
    }
    setUploading(true);
    try {
      const m = await window.ShapeCoachMedia.upload(file, { prefix: 'listing' });
      return m && m.url ? m : null;
    } catch (e) { flashErr(String((e && e.message) || tr('coach:editor.uploadFailed', { defaultValue: 'Upload failed' }))); return null; }
    finally { setUploading(false); }
  };
  const pickSlot = (setter) => async (e) => {
    const file = (e.target.files || [])[0];
    if (e.target) e.target.value = '';
    const m = await uploadImage(file);
    if (m) setter(m.url);
  };
  const pickGallery = async (e) => {
    const file = (e.target.files || [])[0];
    if (e.target) e.target.value = '';
    if (gallery.length >= BS_LISTING_GALLERY_MAX) return;
    const m = await uploadImage(file);
    if (m) setGallery((prev) => (prev.length >= BS_LISTING_GALLERY_MAX ? prev : [...prev, { id: nextId.current++, url: m.url, caption: '' }]));
  };
  const setCaption = (id, v) => setGallery((prev) => prev.map((g) => (g.id === id ? { ...g, caption: v.slice(0, BS_LISTING_CAPTION_MAX) } : g)));
  const rmGallery = (id) => setGallery((prev) => prev.filter((g) => g.id !== id));
  const save = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await window.ShapeListingMedia.set(role, { portrait, cover, gallery: gallery.map((g) => ({ url: g.url, caption: g.caption })) });
      window.__bsToast?.(tr('coach:listing.saved', { defaultValue: 'Listing saved' }), 'ok');
      onClose();
    } catch (e) {
      if (e && e.code === 'LISTING_MEDIA_UNAVAILABLE') setErr(tr('coach:listing.unavailable', { defaultValue: "Listing photos aren't available yet — try again after the next update." }));
      else setErr(String((e && e.message) || tr('coach:listing.saveError', { defaultValue: 'Could not save — are you signed in as an approved coach?' })));
    }
    setBusy(false);
  };
  const labelStyle = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 };
  const chip = (label, onClick) => (
    <button onClick={onClick} disabled={uploading || busy} style={{ border: `1px solid ${accent}`, background: `${accent}14`, color: accent, borderRadius: 999, padding: '6px 12px', cursor: uploading || busy ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: uploading || busy ? 0.6 : 1 }}>{label}</button>
  );
  // A single-image slot (portrait / cover): preview or empty ground, plus
  // replace/remove controls. `aspect` shapes the preview to its use.
  const slot = (label, url, inputRef, onRemove, aspect) => (
    <div style={{ marginTop: 16 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: aspect === 'wide' ? 108 : 60, height: 60, flexShrink: 0, borderRadius: 12, border: `1px solid ${t.RULE}`, background: url ? `center/cover no-repeat url("${url}")` : t.PAPER2, backgroundColor: t.PAPER2 }} aria-hidden="true" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chip(url ? `↻ ${tr('coach:listing.replace', { defaultValue: 'Replace' })}` : tr('coach:listing.addPhoto', { defaultValue: '＋ Add photo' }), () => inputRef.current && inputRef.current.click())}
          {url && chip(`× ${tr('coach:common.remove', { defaultValue: 'Remove' })}`, onRemove)}
        </div>
      </div>
    </div>
  );
  const sheet = (
    <div onClick={() => !busy && !uploading && onClose()} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr('coach:listing.editAria', { defaultValue: 'Edit your listing photos' })} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '86%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))` }} className="bs-hide-scroll">
        <input ref={portraitRef} type="file" accept="image/*" onChange={pickSlot(setPortrait)} style={{ display: 'none' }} />
        <input ref={coverRef} type="file" accept="image/*" onChange={pickSlot(setCover)} style={{ display: 'none' }} />
        <input ref={galleryRef} type="file" accept="image/*" onChange={pickGallery} style={{ display: 'none' }} />
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent }}>{tr('coach:listing.title', { defaultValue: 'Listing photos' })}</div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>{tr('coach:listing.rowSub', { defaultValue: 'Your box on the marketplace — portrait, cover, studio' })}</div>
        {!meta.loaded ? (
          <div style={{ padding: '18px 0', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('coach:common.loading', { defaultValue: 'Loading…' })}</div>
        ) : meta.loadError ? (
          <div style={{ padding: '18px 0' }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, color: t.INK70 }}>{tr('coach:listing.loadError', { defaultValue: "Couldn't load your listing photos — your saved photos are untouched. Try again." })}</div>
            <button onClick={() => setReloadKey((k) => k + 1)} style={{ marginTop: 12, border: `1px solid ${accent}`, background: `${accent}14`, color: accent, borderRadius: 999, padding: '8px 16px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('coach:listing.retry', { defaultValue: 'Retry' })}</button>
          </div>
        ) : !meta.signedIn ? (
          <div style={{ padding: '18px 0', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.04em', color: t.INK50 }}>{tr('coach:editor.signInUpload', { defaultValue: 'Sign in to upload media.' })}</div>
        ) : !meta.hasRow ? (
          <div style={{ padding: '18px 0', fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, color: t.INK70 }}>{tr('coach:listing.pending', { defaultValue: 'Your listing box appears once your coach application is approved.' })}</div>
        ) : (<>
          {slot(tr('coach:listing.portrait', { defaultValue: 'Portrait · you' }), portrait, portraitRef, () => setPortrait(null), 'square')}
          {slot(tr('coach:listing.cover', { defaultValue: 'Cover · your background' }), cover, coverRef, () => setCover(null), 'wide')}
          <div style={{ marginTop: 18 }}>
            <span style={labelStyle}>{tr('coach:listing.gallery', { defaultValue: 'Studio gallery · up to {max}', max: BS_LISTING_GALLERY_MAX })}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gallery.map((g) => (
                <div key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 10, border: `1px solid ${t.RULE}`, background: `center/cover no-repeat url("${g.url}")` }} aria-hidden="true" />
                  <input value={g.caption} onChange={(e) => setCaption(g.id, e.target.value)} maxLength={BS_LISTING_CAPTION_MAX} placeholder={tr('coach:listing.caption', { defaultValue: 'Caption' })}
                    style={{ flex: 1, boxSizing: 'border-box', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '9px 11px', fontFamily: t.DISPLAY, fontSize: 13.5, outline: 'none' }} />
                  <button onClick={() => rmGallery(g.id)} aria-label={tr('coach:common.remove', { defaultValue: 'Remove' })} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontSize: 15, lineHeight: 1, padding: '6px 4px' }}>×</button>
                </div>
              ))}
            </div>
            {gallery.length < BS_LISTING_GALLERY_MAX && (
              <button onClick={() => galleryRef.current && galleryRef.current.click()} disabled={uploading || busy} style={{ marginTop: 10, width: '100%', textAlign: 'left', cursor: uploading || busy ? 'default' : 'pointer', padding: '12px 12px', border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: uploading || busy ? 0.6 : 1 }}>{tr('coach:listing.addPhoto', { defaultValue: '＋ Add photo' })}</button>
            )}
          </div>
          {err && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST }}>{err}</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <button onClick={() => !busy && !uploading && onClose()} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}>{tr('coach:common.cancelUpper', { defaultValue: 'CANCEL' })}</button>
            <button onClick={save} disabled={busy || uploading} style={{ flex: 1, padding: 14, border: 0, background: accent, color: t.isLight ? '#fff' : '#0c0a08', cursor: busy || uploading ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', opacity: busy || uploading ? 0.6 : 1 }}>{busy ? tr('coach:common.saving', { defaultValue: 'Saving…' }) : tr('coach:listing.save', { defaultValue: 'Save listing' })}</button>
          </div>
        </>)}
      </div>
    </div>
  );
  // Portal to the phone surface so the fixed overlay anchors to the frame, not
  // BSPage's scroll content (a sheet opened after scrolling would render offset).
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

function BSProMe({ role, name, onLogout, onSettings = () => {}, onRadio = () => {}, onBack = null, onAppearance = () => {} }) {
  const t = useBS();
  const tr = useShapeTr();
  const isCoach = role === 'trainer';
  const accent = isCoach ? t.RUST : '#a07a2e';   // trainer rust · nutritionist gold
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [revHidden, setRevHidden] = useStateBSP(() => { try { return localStorage.getItem('bs_pro_rev_hidden') === '1'; } catch (e) { return false; } });
  const toggleRev = () => setRevHidden(v => { const nv = !v; try { localStorage.setItem('bs_pro_rev_hidden', nv ? '1' : '0'); } catch (e) {} return nv; });
  // Use the signed-in account's real name (same source as Settings) so the Me
  // header matches; fall back to the demo prop when signed out.
  const authProfile = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.().profile) || {};
  const displayName = (authProfile.full_name && String(authProfile.full_name).trim()) || name;
  // Custom avatar initials (edit-profile) win; else full (2-letter) initials.
  const [showScore, setShowScore] = useStateBSP(false);
  const [showStore, setShowStore] = useStateBSP(false);
  const [showOfferEditor, setShowOfferEditor] = useStateBSP(false);
  const [showListingMedia, setShowListingMedia] = useStateBSP(false);
  const [showContact, setShowContact] = useStateBSP(false);
  const [showTerms, setShowTerms] = useStateBSP(false);
  const [showGoals, setShowGoals] = useStateBSP(false);
  const [showPublicProfile, setShowPublicProfile] = useStateBSP(false);
  const [showBookingCalendar, setShowBookingCalendar] = useStateBSP(false);
  const [showNotifications, setShowNotifications] = useStateBSP(false);
  const [showSoundtracks, setShowSoundtracks] = useStateBSP(false);
  const scoreProfile = _bsUseLiveScore(SHAPE_SCORE_PROFILES?.[role] || SHAPE_SCORE_PROFILES?.client); // live points/tier when signed in
  const startPayoutSetup = async () => {
    try {
      await window.ShapeConnect?.startOnboarding?.({ role });
    } catch (error) {
      alert(error?.message || 'Unable to start Stripe payout setup.');
    }
  };

  if (showScore) {
    return <BSShapeScorePage profile={scoreProfile} onBack={() => setShowScore(false)} onOpenStore={() => { setShowScore(false); setShowStore(true); }} />;
  }
  if (showStore) {
    return <BSShapeStorePage profile={scoreProfile} onBack={() => setShowStore(false)} onOpenScore={() => { setShowStore(false); setShowScore(true); }} />;
  }
  if (showContact) {
    return <BSContactPage onBack={() => setShowContact(false)} />;
  }
  if (showTerms) {
    return <BSTermsPage onBack={() => setShowTerms(false)} onContact={() => { setShowTerms(false); setShowContact(true); }} />;
  }
  if (showGoals) {
    return <BSCoachGoalPlanPage role={role} onBack={() => setShowGoals(false)} />;
  }
  if (showPublicProfile) {
    return <BSPublicProfile person={{ who: displayName, kind: role === 'nutritionist' ? 'NUTRI' : 'TRAINER', init: bsMyInitials() }} isSelf onBack={() => setShowPublicProfile(false)} onEdit={() => { setShowPublicProfile(false); try { window.dispatchEvent(new Event('shape:openProSettings')); } catch (e) {} }} />;
  }
  if (showBookingCalendar) {
    return <BSCalendarScreen role={role} onProfile={() => setShowPublicProfile(true)} onBack={() => setShowBookingCalendar(false)} />;
  }
  if (showSoundtracks) {
    return <BSProSoundtracks role={role} onBack={() => setShowSoundtracks(false)} />;
  }
  if (showNotifications) {
    return <BSProNotificationsPage onBack={() => setShowNotifications(false)} />;
  }

  return (
    <BSPage>
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        {/* The standing masthead row — the corners carry the self avatar, so the
            name row below no longer repeats it. */}
        <div style={{ marginBottom: 14 }}>{bsProMastRow()}</div>
        {onBack && (
          <BSBackButton onClick={onBack} label="Profile" style={{ marginBottom: 14 }} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{isCoach ? 'TRAINER · HYPERTROPHY · SF' : 'REGISTERED DIETITIAN · REMOTE'}</div>
            {(() => { const w = (displayName || '').trim().split(/\s+/); const lastW = w.length > 1 ? w.pop() : ''; const firstL = w.join(' '); return (
              <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: "-0.03em" }}>{firstL || displayName} <span style={{ fontStyle: 'italic', color: accent }}>{lastW ? `${lastW}.` : '.'}</span></div>
            ); })()}
          </div>
        </div>
      </div>

      {(() => {
        const total = scoreProfile.total || 0;
        const goal = scoreProfile.goal || 5000;
        const pct = goal ? Math.min(1, total / goal) : 0;
        const RAD = 26, CIRC = 2 * Math.PI * RAD;
        const tierC = bsTierColor(scoreProfile.tier);
        const bars = [
          { k: 'WEEK',   v: scoreProfile.weekRatio, n: scoreProfile.week, c: t.AMBER },
          { k: 'STREAK', v: scoreProfile.streakRatio, n: `${scoreProfile.streak}D`, c: t.GREEN },
          { k: 'TIER',   v: scoreProfile.tierRatio, n: scoreProfile.tierShort, c: tierC },
          { k: 'SPEND',  v: scoreProfile.spendRatio, n: (scoreProfile.available || 0).toLocaleString(), c: t.BLUE },
        ];
        return (
          <div style={{ padding: `16px ${t.padX}px 6px` }}>
            <button type="button" data-tour="hero-me" onClick={() => setShowScore(true)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', color: t.INK,
              border: `1px solid ${accent}33`, borderRadius: 16,
              background: `linear-gradient(155deg, ${accent}10, ${t.PAPER2} 75%), ${t.PAPER2}`,
              padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Shape Score</div>
                  <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: tierC, lineHeight: 1 }}>{scoreProfile.tier}<span style={{ marginLeft: 7, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', verticalAlign: '2px' }}>tier</span></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 7 }}>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{total.toLocaleString()}</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50, marginBottom: 4 }}>of {goal.toLocaleString()}</span>
                  </div>
                  <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: tierC, fontWeight: 700 }}>{scoreProfile.week} this week · {(scoreProfile.pointsToNext || 0).toLocaleString()} to {scoreProfile.nextTier}</div>
                </div>
                <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
                  <circle cx="32" cy="32" r={RAD} fill="none" stroke={t.HAIR} strokeWidth="5" />
                  <circle cx="32" cy="32" r={RAD} fill="none" stroke={tierC} strokeWidth="5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} transform="rotate(-90 32 32)" />
                  <text x="32" y="33" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: t.DISPLAY, fontSize: '14px', fontWeight: 700, fill: t.INK }}>{Math.round(pct * 100)}%</text>
                </svg>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {bars.map(r => (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 70, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>{r.k}</div>
                    <div style={{ flex: 1, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
                      <div style={{ width: `${(r.v || 0) * 100}%`, height: '100%', background: r.c, borderRadius: 999 }} />
                    </div>
                    <div style={{ width: 38, textAlign: 'right', fontFamily: t.MONO, fontSize: 10, color: t.INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.n}</div>
                  </div>
                ))}
              </div>
            </button>
          </div>
        );
      })()}

      <div style={{ padding: `12px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Practice goal */}
        <button onClick={() => setShowGoals(true)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: t.INK, border: `1px solid ${accent}33`, borderRadius: 16, background: `linear-gradient(155deg, ${accent}14, ${t.PAPER2} 70%), ${t.PAPER2}`, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: accent }}>PRACTICE GOAL · Q3 ›</span>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: t.INK50 }}>{isCoach ? '62% THERE' : '47% THERE'}</span>
          </div>
          <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{isCoach ? 'Twenty by ' : 'Six-K by '}<span style={{ fontStyle: 'italic', color: accent }}>September.</span></div>
          <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(isCoach ? 0.62 : 0.47) * 100}%`, background: accent, borderRadius: 999 }} /></div>
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: accent }}>{isCoach ? '17 / 20 clients · $6.2k MRR · on track' : '$4.1k / $6k MRR · 11 clients · on track'}</div>
        </button>
        {/* This month — toggling HIDDEN collapses the whole box to a slim
            "show" control so the revenue isn't on screen at all. */}
        {revHidden ? (
          <button onClick={toggleRev} aria-label="Show this month" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 14, border: `1px dashed ${t.RULE}`, background: 'transparent', padding: '14px 16px', cursor: 'pointer' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: t.INK50 }}>THIS MONTH · HIDDEN</span>
            </span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: accent, border: `1px solid ${accent}`, borderRadius: 999, padding: '5px 11px' }}>SHOW</span>
          </button>
        ) : (
          <div style={{ border: `1px solid ${accent}33`, borderRadius: 16, background: `linear-gradient(155deg, ${accent}14, ${t.PAPER2} 70%), ${t.PAPER2}`, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>THIS MONTH</span>
              <button onClick={toggleRev} aria-label="Hide this month" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999, border: `1px solid ${accent}`, background: `${accent}1c`, color: accent, padding: '5px 11px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                <span>VISIBLE</span>
              </button>
            </div>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 42, fontWeight: 600, color: t.INK, lineHeight: 0.95, letterSpacing: '-0.02em' }}>{isCoach ? '$6,240' : '$4,120'}</div>
            <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: accent }}>{isCoach ? '17 active · 94% retention · +3 mo' : '11 active · 92% retention · +3 mo'}</div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-end', height: 24 }}>
              {(isCoach ? [0.5, 0.58, 0.52, 0.66, 0.7, 0.82, 0.95] : [0.55, 0.5, 0.6, 0.58, 0.7, 0.78, 0.9]).map((h, i, a) => (
                <div key={i} style={{ flex: 1, height: `${Math.max(0.2, h) * 100}%`, borderRadius: 5, background: i === a.length - 1 ? accent : `${accent}2e` }} />
              ))}
            </div>
            <div style={{ marginTop: 7, display: 'flex', gap: 8 }}>
              {['NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY'].map(m => <div key={m} style={{ flex: 1, textAlign: 'center', fontFamily: t.MONO, fontSize: 8, color: t.INK50, letterSpacing: '0.04em' }}>{m}</div>)}
            </div>
          </div>
        )}
      </div>

      {(() => {
        const numRow = (it, i, subCol) => (
          <div key={i} onClick={it.onClick} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'center', padding: '15px 0', borderTop: `1px solid ${t.HAIR}`, cursor: it.onClick ? 'pointer' : 'default' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, color: it.danger ? t.RUST : t.INK }}>{it.l}</div>
              {it.sub && <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.04em', color: it.danger ? t.RUST : subCol }}>{it.sub}</div>}
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.06em', color: t.INK50, whiteSpace: 'nowrap' }}>{it.r}</span>
          </div>
        );
        const shortcuts = [
          { l: 'Marketplace listing', sub: isCoach ? 'Ranked #12 in Hypertrophy · SF' : 'Ranked #4 in Sports Nutrition · Remote', r: 'View', onClick: () => setShowPublicProfile(true) },
          { l: 'Public profile', sub: isCoach ? 'shape.app/@jordan' : 'shape.app/@maya', r: 'Edit', onClick: () => setShowPublicProfile(true) },
          { l: 'Payouts', sub: 'Weekly · Stripe · Fri', r: '$4,820', onClick: startPayoutSetup },
          { l: 'Availability', sub: 'Mon-Fri · 9 am - 6 pm', r: 'Edit', onClick: () => setShowBookingCalendar(true) },
          { l: 'Rates', sub: isCoach ? '$95/session · $120/mo' : '$140/plan · $80/consult', r: 'Edit', onClick: () => setShowPublicProfile(true) },
          { l: 'Monthly offer', sub: "What's included — shown on your marketplace listing", r: 'Edit', onClick: () => setShowOfferEditor(true) },
          { l: tr('coach:listing.row', { defaultValue: 'Listing photos' }), sub: tr('coach:listing.rowSub', { defaultValue: 'Your box on the marketplace — portrait, cover, studio' }), r: 'Edit', onClick: () => setShowListingMedia(true) },
          { l: 'Soundtracks', sub: 'Saved playlists · assign to plans', r: '→', onClick: () => setShowSoundtracks(true) },
          { l: 'Shape Radio', sub: 'Live stations · coach mixes', r: '→', onClick: () => onRadio() },
          { l: 'Shape Store', sub: `${(scoreProfile.available || 0).toLocaleString()} pts available`, r: '→', onClick: () => setShowStore(true) },
        ];
        const settings = [
          { l: 'Appearance & display', sub: 'Paper · accent · units · text weight', r: '→', onClick: onAppearance },
          { l: 'Notifications', sub: 'Sessions · messages · plans', r: '→', onClick: () => setShowNotifications(true) },
          { l: 'Certifications', sub: isCoach ? 'NASM · FMS · CSCS' : 'RDN · CSSD', r: '→', onClick: onSettings },
          { l: 'App tour', sub: 'Replay the quick walkthrough', r: '→', onClick: () => { try { window.dispatchEvent(new Event('shape:startTour')); } catch (e) {} } },
          { l: 'Help & support', sub: 'Docs · email · community', r: '→', onClick: () => setShowContact(true) },
        ];
        const head = (eyebrow, title, mt) => (
          <div style={{ marginTop: mt }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: teal }}>{eyebrow}</div>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{title}</div>
          </div>
        );
        const footLink = { background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: 0 };
        return (
          <div style={{ padding: `4px ${t.padX}px 8px` }}>
            {head('YOUR PRACTICE', 'Shortcuts', 22)}
            {showOfferEditor && <BSProMonthlyOfferSheet role={isCoach ? 'trainer' : 'nutritionist'} accent={accent} onClose={() => setShowOfferEditor(false)} />}
            {showListingMedia && <BSProListingMediaSheet role={isCoach ? 'trainer' : 'nutritionist'} accent={accent} onClose={() => setShowListingMedia(false)} />}
            <div style={{ marginTop: 8 }}>{shortcuts.map((it, i) => numRow(it, i, accent))}</div>
            {head('ACCOUNT', 'Settings', 26)}
            <div style={{ marginTop: 8 }}>{settings.map((it, i) => numRow(it, i, t.INK50))}</div>
            {/* Utility footer — Terms + Sign out. */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <button onClick={() => setShowTerms(true)} style={footLink}>Terms</button>
              <button onClick={onLogout} style={{ borderRadius: 999, border: `1px solid ${t.RUST}`, background: `${t.RUST}1c`, color: t.RUST, padding: '8px 16px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Sign out</button>
            </div>
          </div>
        );
      })()}

      <BSFooter left={isCoach ? 'The Coach Edition' : 'The Nutri Edition'} right="Pg 4 of 4" />
    </BSPage>
  );
}

function BSProPublicProfilePage({ role = 'trainer', name = 'Profile', onBack }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;
  const [headline, setHeadline] = useStateBSP(isNutri ? 'Nutrition systems for high performers.' : 'Strength coaching with clean progression and clear feedback.');
  const [city, setCity] = useStateBSP(isNutri ? 'Brooklyn, NY' : 'Austin, TX');
  const [accepting, setAccepting] = useStateBSP(true);
  return (
    <BSPage>
      <BSPageHeader
        kicker="Profile settings"
        title={<>Public<br/>profile.</>}
        onBack={onBack}
      />
      <BSSection title="Profile live" meta="Visible on marketplace" />
      <div style={{ padding: `0 ${t.padX}px 16px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ padding: '12px 0', borderBottom: `1px solid ${t.HAIR}` }}>
          <BSEyebrow color={accent}>Display name</BSEyebrow>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{name}</div>
        </div>
        <div style={{ padding: '12px 0', borderBottom: `1px solid ${t.HAIR}` }}>
          <BSEyebrow color={accent}>City</BSEyebrow>
          <input value={city} onChange={(e) => setCity(e.target.value)} style={{ marginTop: 7, width: '100%', border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, padding: '10px 11px', fontFamily: t.DISPLAY, fontSize: 14, borderRadius: 0 }} />
        </div>
        <div style={{ padding: '12px 0', borderBottom: `1px solid ${t.HAIR}` }}>
          <BSEyebrow color={accent}>Headline</BSEyebrow>
          <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={3} style={{ marginTop: 7, width: '100%', border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, padding: '10px 11px', fontFamily: t.DISPLAY, fontSize: 14, borderRadius: 0, resize: 'vertical' }} />
        </div>
        <button onClick={() => setAccepting((v) => !v)} style={{ width: '100%', marginTop: 14, border: `1px solid ${accepting ? accent : t.RULE}`, background: accepting ? `${accent}14` : t.PAPER2, color: t.INK, padding: '11px 12px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 0 }}>
          {accepting ? 'Accepting new clients' : 'Intake paused'}
        </button>
      </div>
      <BSFooter left="Public profile" right={accepting ? 'Live' : 'Paused'} />
    </BSPage>
  );
}

function BSProNotificationsPage({ onBack }) {
  const t = useBS();
  const [rules, setRules] = useStateBSP({
    sessions: true,
    messages: true,
    payments: true,
    weekly: false,
  });
  const row = (label, key) => (
    <button onClick={() => setRules((prev) => ({ ...prev, [key]: !prev[key] }))} style={{ width: '100%', border: 0, background: 'transparent', padding: `${t.rowY + 4}px 0`, borderBottom: `1px solid ${t.HAIR}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: t.INK, cursor: 'pointer' }}>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 14, letterSpacing: '-0.01em' }}>{label}</span>
      <BSEyebrow>{rules[key] ? 'On' : 'Off'}</BSEyebrow>
    </button>
  );
  return (
    <BSPage>
      <BSPageHeader
        kicker="Settings"
        title={<>Notifications.</>}
        onBack={onBack}
        trailing={bsProCorner()}
      />
      <BSSection title="Push + email" meta="Delivery rules" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {row('Session reminders', 'sessions')}
        {row('Messages + mentions', 'messages')}
        {row('Payments + payouts', 'payments')}
        {row('Weekly summary', 'weekly')}
      </div>
      <BSFooter left="Notifications" right="Saved locally" />
    </BSPage>
  );
}

// ─── Coach Goal Plan ────────────────────────────────────────
// Broadsheet-style goal-plan section — paper, ink, serif headings,
// rule-lines and mono kickers. Lives at the bottom of the Me page.
// Edit sheet for the coach practice goal — module-level (stable) so inputs
// keep focus. Edits the headline, target, vision, milestones, stat cards,
// "what's growing it" rows and the weekly targets; persists.
function BSGoalEditSheet({ t, accent, accentInk = '#241c08', goal, onSave, onCancel }) {
  const [g, setG] = useStateBSP(() => ({
    ...goal,
    milestones: (goal.milestones || []).map(m => ({ ...m })),
    stats: (goal.stats || []).map(s => ({ ...s })),
    growing: (goal.growing || []).map(s => ({ ...s })),
    targets: (goal.targets || []).map(s => ({ ...s })),
  }));
  const set = (k, v) => setG(s => ({ ...s, [k]: v }));
  const setM = (i, k, v) => setG(s => ({ ...s, milestones: s.milestones.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));
  const toggleM = (i) => setG(s => ({ ...s, milestones: s.milestones.map((m, j) => (j === i ? { ...m, done: !m.done } : m)) }));
  const rmM = (i) => setG(s => ({ ...s, milestones: s.milestones.filter((_, j) => j !== i) }));
  const addM = () => setG(s => ({ ...s, milestones: [...s.milestones, { t: '', sub: '', when: '', done: false }] }));
  const setList = (key, i, k, v) => setG(s => ({ ...s, [key]: (s[key] || []).map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const rmList = (key, i) => setG(s => ({ ...s, [key]: (s[key] || []).filter((_, j) => j !== i) }));
  const addList = (key, blank) => setG(s => ({ ...s, [key]: [...(s[key] || []), blank] }));
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const rust = t.RUST || '#c0533b';
  const purple = '#8a5cf6';
  const green = t.GREEN || '#3f9a5c';
  const PALETTE = [['accent', accent], ['teal', teal], ['rust', rust], ['purple', purple], ['green', green]];
  const lbl = (x) => <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent, marginBottom: 7 }}>{x}</div>;
  const inputStyle = { width: '100%', boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '11px 12px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' };
  const addBtn = { border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: accent };
  const rmBtn = { border: 0, background: 'transparent', color: t.INK50, fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 2px' };
  const cardBox = { borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 11 };
  const field = (label, key, ph) => <div style={{ marginTop: 14 }}>{lbl(label)}<input value={g[key] || ''} onChange={(e) => set(key, e.target.value)} placeholder={ph} style={inputStyle} /></div>;
  const swatchRow = (key, i, val) => (
    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
      {PALETTE.map(([ck, cc]) => (
        <button key={ck} onClick={() => setList(key, i, 'c', ck)} aria-label={ck} style={{ width: 22, height: 22, borderRadius: 999, background: cc, border: val === ck ? `2px solid ${t.INK}` : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
      ))}
    </div>
  );
  const cardListEditor = (key, label, addBlank) => (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        {lbl(label)}
        <button onClick={() => addList(key, addBlank)} style={addBtn}>+ ADD</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(g[key] || []).map((it, i) => (
          <div key={i} style={cardBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input value={it.l || ''} onChange={(e) => setList(key, i, 'l', e.target.value)} placeholder="Label" style={{ ...inputStyle, padding: '9px 11px' }} />
              <button onClick={() => rmList(key, i)} aria-label="Remove" style={rmBtn}>×</button>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={it.v || ''} onChange={(e) => setList(key, i, 'v', e.target.value)} placeholder="Value" style={{ ...inputStyle, padding: '9px 11px' }} />
              <input value={it.s || ''} onChange={(e) => setList(key, i, 's', e.target.value)} placeholder="Sub" style={{ ...inputStyle, padding: '9px 11px', fontSize: 12 }} />
            </div>
            {swatchRow(key, i, it.c)}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <BSPage>
      {/* corners: false — an edit sheet holding unsaved fields; CANCEL is the exit. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>{bsProMastRow({ corners: false })}</div>
      <div style={{ padding: `12px ${t.padX}px 28px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>EDIT PRACTICE GOAL</div>
          <button onClick={onCancel} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>CANCEL</button>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>Edit your <span style={{ fontStyle: 'italic', color: accent }}>goal.</span></div>

        {field('GOAL HEADLINE', 'head', 'Six-K by')}
        {field('ACCENT WORD', 'accentWord', 'September.')}
        {field('SUBTITLE', 'sub', 'A full, sustainable practice — no burnout.')}
        {field('METRIC LABEL', 'featLabel', 'MONTHLY REVENUE')}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{lbl('NOW')}<input value={g.featVal || ''} onChange={(e) => set('featVal', e.target.value)} placeholder="$4.1k" style={inputStyle} /></div>
          <div>{lbl('% THERE')}<input value={g.featPct == null ? '' : String(g.featPct)} onChange={(e) => set('featPct', e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="47" inputMode="numeric" style={inputStyle} /></div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{lbl('START')}<input value={g.start || ''} onChange={(e) => set('start', e.target.value)} placeholder="$2.4k" style={inputStyle} /></div>
          <div>{lbl('TARGET')}<input value={g.target || ''} onChange={(e) => set('target', e.target.value)} placeholder="$6k" style={inputStyle} /></div>
        </div>
        {field('TARGET DATE', 'targetL', 'TARGET · SEP 30')}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {lbl('MILESTONES')}
            <button onClick={addM} style={addBtn}>+ ADD</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {g.milestones.map((m, i) => (
              <div key={i} style={cardBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => toggleM(i)} aria-label="Toggle done" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: `1.5px solid ${m.done ? accent : t.RULE}`, background: m.done ? accent : 'transparent', color: accentInk, cursor: 'pointer', fontSize: 12, fontWeight: 800, lineHeight: 1 }}>{m.done ? '✓' : ''}</button>
                  <input value={m.t || ''} onChange={(e) => setM(i, 't', e.target.value)} placeholder="Milestone" style={{ ...inputStyle, padding: '9px 11px' }} />
                  <button onClick={() => rmM(i)} aria-label="Remove" style={rmBtn}>×</button>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
                  <input value={m.sub || ''} onChange={(e) => setM(i, 'sub', e.target.value)} placeholder="detail" style={{ ...inputStyle, padding: '9px 11px', fontSize: 12 }} />
                  <input value={m.when || ''} onChange={(e) => setM(i, 'when', e.target.value)} placeholder="When" style={{ ...inputStyle, padding: '9px 11px', fontSize: 12, textAlign: 'center' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {cardListEditor('stats', 'METRICS · STAT CARDS', { l: '', v: '', s: '', c: 'accent' })}
        {cardListEditor('targets', 'THIS WEEK · TARGETS', { l: '', v: '', s: '', c: 'teal' })}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {lbl("WHAT'S GROWING IT")}
            <button onClick={() => addList('growing', { t: '', sub: '', r: '' })} style={addBtn}>+ ADD</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(g.growing || []).map((it, i) => (
              <div key={i} style={cardBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={it.t || ''} onChange={(e) => setList('growing', i, 't', e.target.value)} placeholder="Title" style={{ ...inputStyle, padding: '9px 11px' }} />
                  <button onClick={() => rmList('growing', i)} aria-label="Remove" style={rmBtn}>×</button>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
                  <input value={it.sub || ''} onChange={(e) => setList('growing', i, 'sub', e.target.value)} placeholder="detail" style={{ ...inputStyle, padding: '9px 11px', fontSize: 12 }} />
                  <input value={it.r || ''} onChange={(e) => setList('growing', i, 'r', e.target.value)} placeholder="$ / link" style={{ ...inputStyle, padding: '9px 11px', fontSize: 12, textAlign: 'center' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>{lbl('THE VISION · YOUR WHY')}<textarea value={g.vision || ''} onChange={(e) => set('vision', e.target.value)} rows={4} placeholder="Why this goal matters…" style={{ ...inputStyle, lineHeight: 1.5, resize: 'vertical' }} /></div>

        <button onClick={() => onSave({ ...g, featPct: Number(g.featPct) || 0 })} style={{ width: '100%', marginTop: 24, borderRadius: 14, border: 0, background: accent, color: accentInk, padding: '16px', fontFamily: t.MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Save goal →</button>
      </div>
      <BSFooter left="Edit goal" right="Practice goal" />
    </BSPage>
  );
}

function BSCoachGoalPlanPage({ role = 'trainer', onBack }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const accent = isNutri ? '#d8b25a' : '#d98a3c';
  const accentInk = isNutri ? '#241c08' : '#2a1606';
  const rust = t.RUST || '#c0533b';
  const purple = '#8a5cf6';
  const green = t.GREEN || '#3f9a5c';
  const muted = t.INK50;
  const colorFor = (k) => ({ accent, teal, rust, purple, green }[k]) || k || accent;
  const DEMO = isNutri ? {
    who: 'Dr. Maya Patel', whoRole: 'Registered Dietitian',
    eyebrow: 'PRACTICE GOAL · DR. MAYA PATEL',
    head: 'Six-K by', accentWord: 'September.',
    sub: 'A full, sustainable practice — no burnout.',
    featLabel: 'MONTHLY REVENUE', featVal: '$4.1k', featPct: 47,
    start: '$2.4k', now: '$4.1k', target: '$6k', startL: 'START · JAN', targetL: 'TARGET · SEP 30',
    trendVal: '$4.1k', trendMeta: 'MRR · 7 months', newTotal: 10,
    milestones: [
      { done: true, t: 'First 8 clients', sub: 'referrals + marketplace', when: 'Dec' },
      { done: true, t: '$3k month', sub: 'crossed in February', when: 'Feb' },
      { t: '12 active clients', sub: 'two consults pending', when: 'Next' },
      { t: '3rd plan published', sub: 'PCOS-focused', when: 'Jun' },
      { t: '$6k MRR · 15 clients', sub: 'sustainable roster', when: 'Sep 30' },
    ],
    stats: [
      { l: 'MRR', v: '$4.1k', s: 'this month', c: 'accent' },
      { l: 'Active', v: '11', s: 'clients', c: 'teal' },
      { l: 'Retention', v: '92', s: '%', c: 'rust' },
      { l: 'Plans', v: '4', s: 'published', c: 'purple' },
    ],
    growing: [
      { t: 'Lean Cut', sub: '12 on it · $1,680 MRR', r: '$140' },
      { t: 'Marketplace · #4', sub: 'Sports Nutrition · 1,120 views', r: 'View' },
      { t: 'Shape RDs community', sub: '142 online · your posts', r: 'Open' },
    ],
    targets: [
      { l: 'Consults', v: '8/14', s: 'booked this wk', c: 'rust' },
      { l: 'Plans', v: '3/5', s: 'delivered', c: 'purple' },
      { l: 'Reviews', v: '47', s: '+3 this month', c: 'teal' },
      { l: 'Retention', v: '92%', s: 'goal 95%', c: 'green' },
    ],
    vision: 'Enough clients to do this full-time and well — but capped so every plan still gets my full attention. Six grand a month, fifteen people I actually help. That’s the practice I want.',
  } : {
    who: 'Jordan Chen', whoRole: 'Strength Coach',
    eyebrow: 'PRACTICE GOAL · JORDAN CHEN',
    head: 'Twenty by', accentWord: 'September.',
    sub: 'Full roster, going full-time by fall.',
    featLabel: 'ACTIVE CLIENTS', featVal: '17', featPct: 63,
    start: '12', now: '17', target: '20', startL: 'START · JAN', targetL: 'TARGET · SEP 30',
    trendVal: '$6.2k', trendMeta: 'MRR · 7 months', newTotal: 13,
    milestones: [
      { done: true, t: 'First 10 clients', sub: 'all word-of-mouth', when: 'Dec' },
      { done: true, t: 'First $5k month', sub: 'crossed in March', when: 'Mar' },
      { t: '18 active clients', sub: 'one signup away', when: 'Next' },
      { t: '2nd program live', sub: 'fat-loss block', when: 'Jun' },
      { t: '20 clients · $8k MRR', sub: 'full-time leap', when: 'Sep 30' },
    ],
    stats: [
      { l: 'Active', v: '17', s: 'clients', c: 'accent' },
      { l: 'MRR', v: '$6.2k', s: 'this month', c: 'teal' },
      { l: 'Retention', v: '94', s: '%', c: 'rust' },
      { l: 'New', v: '+3', s: 'this month', c: 'purple' },
    ],
    growing: [
      { t: 'Push / Pull / Legs', sub: '48 on it · $5,760 MRR', r: '$120/mo' },
      { t: 'Marketplace · #12', sub: 'Hypertrophy · SF · 1,842 views', r: 'View' },
      { t: 'Shape Pros community', sub: '318 online · your posts', r: 'Open' },
    ],
    targets: [
      { l: 'New intros', v: '3/4', s: 'booked this wk', c: 'rust' },
      { l: 'Content', v: '2/3', s: 'posts shipped', c: 'purple' },
      { l: 'Reviews', v: '86', s: '+4 this month', c: 'teal' },
      { l: 'Retention', v: '94%', s: 'goal 95%', c: 'green' },
    ],
    vision: 'I want this to be the whole thing — quit the gym floor shifts, coach who I choose, and still be home for dinner. Twenty good clients is the number that makes it real.',
  };

  const KEY = `coach_practice_goal_${role}`;
  const [goal, setGoal] = useStateBSP(DEMO);
  const [editing, setEditing] = useStateBSP(false);
  useEffectBSP(() => {
    let alive = true;
    if (window.shapeDb && window.shapeDb.getUserGoals) {
      window.shapeDb.getUserGoals(KEY).then(d => {
        if (alive && d && typeof d === 'object') setGoal(g => ({
          ...DEMO, ...d,
          milestones: (Array.isArray(d.milestones) && d.milestones.length) ? d.milestones : DEMO.milestones,
          stats: Array.isArray(d.stats) ? d.stats : DEMO.stats,
          growing: Array.isArray(d.growing) ? d.growing : DEMO.growing,
          targets: Array.isArray(d.targets) ? d.targets : DEMO.targets,
        }));
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [role]);
  const persist = (next) => { setGoal(next); try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals(KEY, next); } catch (e) {} };
  const toast = (m) => { try { window.__bsToast && window.__bsToast(m, 'info'); } catch (e) {} };
  const toggleMilestone = (i) => persist({ ...goal, milestones: goal.milestones.map((m, j) => (j === i ? { ...m, done: !m.done } : m)) });
  const openPayouts = async () => {
    const loggedIn = !!(window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState() && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id);
    if (!loggedIn) { toast('Sign in to view payouts'); return; }
    try {
      const res = await fetch('/api/stripe/billing-portal', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (data && data.url) { window.location.href = data.url; return; }
    } catch (e) {}
    toast('Payouts open in your Stripe dashboard');
  };

  if (editing) return <BSGoalEditSheet t={t} accent={accent} accentInk={accentInk} goal={goal} onSave={(g) => { persist(g); setEditing(false); }} onCancel={() => setEditing(false)} />;

  const D = goal;
  const init = (D.who || 'S').replace(/^Dr\.?\s+/i, '').charAt(0).toUpperCase();
  const firstPending = (D.milestones || []).findIndex(m => !m.done);
  const SecHead = ({ eyebrow, title, action, onAction }) => (
    <div style={{ padding: `22px ${t.padX}px 0`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>{eyebrow}</div>
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{title}</div>
      </div>
      {action && <button onClick={onAction} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: teal, paddingBottom: 4 }}>{action}</button>}
    </div>
  );
  const statCard = (s, i) => (
    <div key={i} style={{ borderRadius: 13, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 11 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: colorFor(s.c) }}>{s.l}</div>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.v}</div>
      <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>{s.s}</div>
    </div>
  );
  return (
    <BSPage>
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        {/* The standing masthead row, then the universal back row — ← BACK left,
            Edit right (owner call 2026-07-14); the eyebrow gets its own line. */}
        <div style={{ marginBottom: 12 }}>{bsProMastRow()}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <BSBackButton onClick={onBack} />
          <button onClick={() => setEditing(true)} style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>Edit</button>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, lineHeight: 1.5 }}>{D.eyebrow}</div>
        <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, color: t.INK, lineHeight: 1.0, letterSpacing: '-0.03em' }}>{D.head} <span style={{ fontStyle: 'italic', color: accent }}>{D.accentWord}</span></div>
        <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 15, fontStyle: 'italic', color: t.INK70, lineHeight: 1.4 }}>{D.sub}</div>
      </div>

      <div style={{ margin: `14px ${t.padX}px 0`, borderRadius: 16, border: `1px solid ${accent}44`, background: `linear-gradient(160deg, ${accent}22, ${accent}08 55%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>{D.featLabel}</div>
            <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, color: t.INK, lineHeight: 1, letterSpacing: '-0.03em' }}>{D.featVal}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}>{D.featPct}%</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', color: muted }}>THERE</div>
          </div>
        </div>
        <div style={{ marginTop: 13, position: 'relative', height: 5 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: t.HAIR }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${D.featPct}%`, borderRadius: 999, background: accent }} />
          <div style={{ position: 'absolute', left: `${D.featPct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: accent, boxShadow: `0 0 0 3px ${t.PAPER2}` }} />
        </div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'baseline' }}>
          <div style={{ textAlign: 'left' }}><div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: t.INK }}>{D.start}</div><div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', color: muted }}>{D.startL}</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: accent }}>{D.now}</div><div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', color: accent }}>NOW</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: t.INK }}>{D.target}</div><div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', color: muted }}>{D.targetL}</div></div>
        </div>
      </div>

      <div style={{ margin: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(D.stats || []).map(statCard)}
      </div>

      <SecHead eyebrow="Trend" title="Revenue" action="Payouts →" onAction={openPayouts} />
      <div style={{ margin: `10px ${t.padX}px 0`, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, color: t.INK }}>{D.trendVal}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>{D.trendMeta}</div>
        </div>
        <svg viewBox="0 0 300 52" preserveAspectRatio="none" style={{ width: '100%', height: 52, marginTop: 10, display: 'block' }}>
          <polygon points="0,44 50,40 100,42 150,30 200,24 250,16 300,8 300,52 0,52" fill={`${accent}14`} />
          <polyline points="0,44 50,40 100,42 150,30 200,24 250,16 300,8" fill="none" stroke={accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx="300" cy="8" r="3.5" fill={accent} />
        </svg>
      </div>

      <div style={{ margin: `10px ${t.padX}px 0`, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: accent }}>NEW CLIENTS · LAST 7 MONTHS</div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', color: muted }}>{D.newTotal} TOTAL</div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 8, height: 42 }}>
          {[42, 38, 66, 46, 72, 50, 100].map((h, i, a) => <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: i === a.length - 1 ? accent : `${accent}40` }} />)}
        </div>
      </div>

      <SecHead eyebrow="The path" title="Milestones" action="Edit →" onAction={() => setEditing(true)} />
      <div style={{ marginTop: 6 }}>
        {(D.milestones || []).map((m, i) => {
          const isNext = i === firstPending;
          return (
            <button key={i} onClick={() => toggleMilestone(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', padding: `13px ${t.padX}px`, borderTop: i ? `1px solid ${t.HAIR}` : 0, display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: isNext ? accent : muted }}>{m.done ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: m.done ? muted : t.INK, letterSpacing: '-0.01em', textDecoration: m.done ? 'line-through' : 'none' }}>{m.t}</div>
                <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: isNext ? accent : muted }}>{m.sub}</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: isNext ? accent : muted }}>{m.when}</span>
            </button>
          );
        })}
      </div>

      <SecHead eyebrow="Driving it" title="What's growing it" action="Edit →" onAction={() => setEditing(true)} />
      <div style={{ marginTop: 6 }}>
        {(D.growing || []).map((g, i) => (
          <button key={i} onClick={() => toast(`${g.t} · ${g.sub}`)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', padding: `14px ${t.padX}px`, borderTop: i ? `1px solid ${t.HAIR}` : 0, display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: muted }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{g.t}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', color: muted }}>{g.sub}</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: (g.r || '').charAt(0) === '$' ? muted : teal }}>{g.r}</span>
          </button>
        ))}
      </div>

      <SecHead eyebrow="This week" title="Targets that move it" action="Edit →" onAction={() => setEditing(true)} />
      <div style={{ margin: `10px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(D.targets || []).map(statCard)}
      </div>

      <SecHead eyebrow="Your why" title="The vision" action="Edit →" onAction={() => setEditing(true)} />
      <div style={{ margin: `10px ${t.padX}px 0`, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontStyle: 'italic', color: t.INK, lineHeight: 1.55 }}>{'“'}{D.vision}{'”'}</div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: accent, color: accentInk, display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 800 }}>{init}</span>
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK }}>{D.who}</div>
            <div style={{ marginTop: 1, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{D.whoRole}</div>
          </div>
        </div>
      </div>

      <BSFooter left={isNutri ? 'The Nutri Edition' : 'The Coach Edition'} right="Practice goal" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// PRO CONSOLE SCREEN (shared by trainer + nutritionist)
// ═══════════════════════════════════════════════════════════
// Sample data shown when no backend / no real clients yet — keeps the
// Console tab populated in the /m/ preview and demo Android build.
function BS_CONSOLE_SAMPLE(role) {
  const isNutri = role === 'nutritionist';
  const clients = isNutri ? [
    { id: 'c1', name: 'Alex Rivera',  block: 'Cut · 1900 kcal',    streak: 18 },
    { id: 'c2', name: 'Jamie Wong',   block: 'Cut · 1700 kcal',    streak: 24 },
    { id: 'c3', name: 'Riley Kim',    block: 'Cut · 1850 kcal',    streak: 9 },
    { id: 'c4', name: 'Casey Lee',    block: 'Build · 2400 kcal',  streak: 6 },
    { id: 'c5', name: 'Drew Park',    block: 'Build · 2200 kcal',  streak: 14 },
  ] : [
    { id: 'c1', name: 'Casey Morgan', block: 'Block 3 · Wk 3',     streak: 21 },
    { id: 'c2', name: 'Drew Park',    block: 'Peak · Wk 11',       streak: 14 },
    { id: 'c3', name: 'Maya Reyes',   block: 'Build · Wk 6',       streak: 7 },
    { id: 'c4', name: 'Sam Patel',    block: 'Build · Wk 3',       streak: 12 },
    { id: 'c5', name: 'Tomás Reyes',  block: 'Peak · Wk 8',        streak: 19 },
  ];
  const focusByClient = isNutri ? {
    c1: 'Stay above 160g protein on training days. Add a midday snack.',
    c2: 'Front-load carbs around the long run. Track sleep this week.',
    c3: 'Veggies at lunch + dinner. Stop drinking calories.',
    c4: 'Test +200 kcal — adherence dipped. Check digestion.',
    c5: 'Pre-workout banana + whey 30 min before lift.',
  } : {
    c1: 'Squat top set RPE 8.5 → hold. Add a back-off triple at 80%.',
    c2: 'Deload next week. Pull bench to 75%, 3×5 only.',
    c3: 'Mobility 10 min before pulls. Right hip is grumpy.',
    c4: 'Conditioning Tue + Fri. Keep zone 2 ≤ 145 bpm.',
    c5: 'Push for deadlift PR Saturday. Belt + chalk + caffeine.',
  };
  const itemsByClient = isNutri ? {
    c1: [
      { id: 'i1', name: 'Push protein +20g',   note: 'On lift days',         done: false },
      { id: 'i2', name: 'Macros review call',  note: 'Thu 9:00 AM',          done: false },
    ],
    c2: [
      { id: 'i1', name: 'Send marathon fueling plan', note: 'By Friday',     done: true },
      { id: 'i2', name: 'Set up post-run shake',      note: 'Auto-template', done: false },
    ],
    c3: [{ id: 'i1', name: 'Veggie reset', note: '5 days, log photos', done: false }],
    c4: [{ id: 'i1', name: 'Trial +200 kcal', note: '2 weeks → reassess', done: false }],
    c5: [{ id: 'i1', name: 'Lab panel reminder', note: 'Iron + B12', done: false }],
  } : {
    c1: [
      { id: 'i1', name: 'Build squat block',  note: 'Wk 4-6 plan',          done: true },
      { id: 'i2', name: 'Form check video',   note: 'Bench, request sent',  done: false },
    ],
    c2: [
      { id: 'i1', name: 'Schedule deload',    note: 'Next Mon',             done: false },
    ],
    c3: [{ id: 'i1', name: 'Mobility homework', note: '10 min/day', done: false }],
    c4: [{ id: 'i1', name: 'Conditioning template', note: 'Zone 2 30 min', done: false }],
    c5: [
      { id: 'i1', name: 'PR attempt — Saturday', note: '405 lbs target',    done: false },
      { id: 'i2', name: 'Send opener strategy',  note: 'Email + video',     done: true },
    ],
  };
  const snapshotByClient = isNutri ? {
    c1: { adherence: '92%', protein: '178g', water: '2.4L', weight: '178 → 174' },
    c2: { adherence: '88%', protein: '142g', water: '3.1L', weight: '162 (stable)' },
    c3: { adherence: '71%', protein: '124g', water: '1.8L', weight: '188 → 184' },
    c4: { adherence: '64%', protein: '156g', water: '2.0L', weight: '195 → 198' },
    c5: { adherence: '83%', protein: '186g', water: '2.6L', weight: '210 → 212' },
  } : {
    c1: { sessions: '14/14', rpe: '8.2', volume: '48,720 lbs', deload: 'in 2 wks' },
    c2: { sessions: '11/12', rpe: '7.8', volume: '52,140 lbs', deload: 'this week' },
    c3: { sessions: '12/14', rpe: '8.5', volume: '34,580 lbs', deload: 'in 4 wks' },
    c4: { sessions: '10/12', rpe: '7.6', volume: '28,910 lbs', deload: 'in 3 wks' },
    c5: { sessions: '16/16', rpe: '8.4', volume: '61,200 lbs', deload: 'after PR' },
  };
  const profileByClient = Object.fromEntries(clients.map(c => [c.id, { name: c.name, block: c.block, streak: c.streak }]));
  return { clients, focusByClient, itemsByClient, snapshotByClient, profileByClient };
}


window.BSTrainerApp = BSTrainerApp;
window.BSNutritionistApp = BSNutritionistApp;


Object.assign(window, { BSTrainerApp, BSNutritionistApp });


