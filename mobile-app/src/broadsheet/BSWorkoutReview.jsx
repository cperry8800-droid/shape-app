import React from 'react';
import { bsHrChart } from '../services/workoutExperience.mjs';
import { knownWorkoutAverage } from '../services/coachWorkoutLibrary.mjs';
import { BS_CLEAN_HEAD as BS_PRO_HEAD, BS_CLEAN_SANS as BS_PRO_SANS, useBSClean as useBSProClean, BSCleanType as BSProCleanType } from './bsCleanType.jsx';
import { bsProDeckHeat, bsRaised, bsGlassFill, bsGlassBorder } from './BSProInstrument.jsx';
// ─── THE COACH'S REVIEW PAGE: CLIENT REVIEW (NUTRITIONIST) · WORKOUT REVIEW (TRAINER) ────────────
// Moved out of iosAppBroadsheetPros.jsx (2026-11-04) with its redesign: of three looks drawn for it, the
// owner picked B, glass and raised (2026-11-04, "option B", confirmed as Client review B).
//   · The queue on glass rows; the selected one carries a ring in the role's colour (gold for a
//     nutritionist, rust for a trainer) and aria-current, so it is never told by colour alone.
//   · The selected day or session as a raised hero card holding a pair board: a nutritionist reads
//     Kcal | Target over Protein | Logged, with slim progress bars against the coach's own targets; a
//     trainer reads Sets | Avg set over Avg rest | Elapsed.
//   · Meals or sets on glass rows; the watch samples in a glass card; heart rate as the page drew it.
//   · The note in a glass composer, Save inside it beside the text.
// A trainer's hero card ends on the client's own ratings of the session (owner, 2026-11-04: "show both
// ratings to coaches"), each shown only when the client gave it: see reviewRatings below.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx). This file is a
// static import of the coach module, so it evaluates before the chrome's and the client's bodies have
// published what it reads (BSPage, BSBackRow, BSMastRow, the data layer). It imports nothing back from
// iosAppBroadsheetPros.jsx or iosAppBroadsheetClient.jsx.

const { useState, useEffect } = React;

// The i18n translator for this module — the same self-contained copy every feature module carries (see
// BSIntegrationsPage.jsx), so this file does not depend on another module's copy or its load order.
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
// Active app locale for Intl date formatting.
function coachLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}

// The coach pages' clean grammar, as iosAppBroadsheetPros.jsx writes it (bsProHeat, bsProOverline,
// bsProH1, bsProH2, BSProCaseHead, BSProRedact): copied, not imported, because a feature module never
// imports back into the coach module.
const reviewHeat = (t, role) => (role === 'nutritionist' ? (t.isLight ? '#a07a2e' : '#d8b25a') : '#c0533b');
// The catalogs write these pages' labels in capitals in every locale, so a label stays in capitals (an
// overline in Inter Tight); recasing it in code would be wrong for German nouns and Turkish case rules.
const overline = (t, color) => ({ fontFamily: BS_PRO_SANS, fontSize: 11, fontWeight: 650, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.3, color: color || t.INK50 });
const pageTitle = (t) => ({ margin: 0, minWidth: 0, fontFamily: BS_PRO_HEAD, fontSize: 32, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.05, color: t.INK });
const sectionTitle = (t) => ({ margin: 0, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: BS_PRO_HEAD, fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, color: t.INK });
// A section: the catalog's capitals as an overline, with what it counts on the right, both in ink tones
// (the role colour, gold on cream, is under 4.5:1 at 11px).
function ReviewCaseHead({ t, label, meta }) {
  return (
    <div data-pro-case-head={typeof label === 'string' ? label : ''} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
      <h2 style={{ margin: 0, minWidth: 0, ...overline(t, t.INK70), fontSize: 12, fontWeight: 700 }}>{label}</h2>
      {meta ? <span style={{ marginLeft: 'auto', ...overline(t), whiteSpace: 'nowrap' }}>{meta}</span> : null}
    </div>
  );
}
// What the page can't show ("PER-MEAL DETAIL NOT STORED"): a quiet card in the page's type.
function ReviewRedact({ t, label }) {
  return <div data-pro-redact={typeof label === 'string' ? label : ''} style={{ margin: '4px 0 6px', padding: '12px 14px', borderRadius: 12, background: t.PAPER2, ...overline(t), textAlign: 'center' }}>{label}</div>;
}
const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const BS_MAST_TOP_FALLBACK = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

// A set's seconds: `42s` under a minute, `2:05` over it. The member's Session details print the same set
// through bsSetSeconds (iosAppBroadsheetClient.jsx); tests/session-set-rpe.test.mjs drives the two against
// each other so one duration never reads two ways.
export function formatReviewSeconds(value) {
  if (value == null || value === '') return '—';
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (!min) return `${sec}s`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// The client's two ratings of a session, as the session row stores them:
//   difficulty, `workout_sessions.session_rpe` (numeric(3,1), 0–10, null when skipped);
//   enjoyment, `workout_sessions.summary->'enjoyment'` (a whole number 1–5, or null).
// Both ride the `select('*')` of ShapeWorkoutLogs.listSessions(). A rating is shown only when the client
// gave it: null, missing, 0 or anything outside its scale is "not given", never a 0 and never a dash.
// The enjoyment rating is being added by the end-of-session pop-up in its own PR, so until it ships no row
// carries it and only the RPE shows.
const ratingNumber = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN));
export function reviewRatings(session) {
  const rpe = ratingNumber(session?.session_rpe);
  const summary = session?.summary && typeof session.summary === 'object' ? session.summary : null;
  const enjoyment = ratingNumber(summary?.enjoyment);
  return {
    rpe: Number.isFinite(rpe) && rpe > 0 && rpe <= 10 ? Math.round(rpe * 10) / 10 : null,
    enjoyment: Number.isInteger(enjoyment) && enjoyment >= 1 && enjoyment <= 5 ? enjoyment : null,
  };
}

export function demoWorkoutReviewSessions(role = 'trainer') {
  const isNutri = role === 'nutritionist';
  // Nutritionist review = meal-log days (kcal/protein/meals) — NOT relabeled
  // workout sets. Honest nutrition shape; the detail body branches on
  // `nutrition: true`.
  // Field names match the LIVE rows from ShapeNutritionLogs.listClientDays so
  // the render is one path, not two (kcalTarget / proteinG / proteinTargetG).
  // The demo keeps `logged`/`planned` + `meals` because a demo day is allowed
  // to show the shape we WANT; a live day has neither (see the redact line).
  if (isNutri) return [
    { id: 'demo-nutritionist-day-1', nutrition: true, title: 'Tue · 4 meals logged', status: 'complete day',
      kcal: 1980, kcalTarget: 2100, proteinG: 152, proteinTargetG: 170, logged: 4, planned: 4, flag: null,
      meals: [
        { slot: 'Breakfast', name: 'Greek yogurt bowl', kcal: 420, macros: '32P · 44C · 12F' },
        { slot: 'Lunch', name: 'Chicken + rice plate', kcal: 620, macros: '48P · 62C · 16F' },
        { slot: 'Snack', name: 'Protein shake + banana', kcal: 310, macros: '30P · 38C · 4F' },
        { slot: 'Dinner', name: 'Salmon, potatoes, greens', kcal: 630, macros: '42P · 48C · 24F' },
      ], coach_workout_review_notes: [] },
    { id: 'demo-nutritionist-day-2', nutrition: true, title: 'Mon · 3 of 4 meals logged', status: 'gap flagged',
      kcal: 1210, kcalTarget: 2100, proteinG: 82, proteinTargetG: 170, logged: 3, planned: 4,
      flag: 'PROTEIN 88G UNDER · DINNER UNLOGGED',
      meals: [
        { slot: 'Breakfast', name: 'Oats + berries', kcal: 390, macros: '18P · 62C · 9F' },
        { slot: 'Lunch', name: 'Turkey wrap', kcal: 540, macros: '38P · 48C · 18F' },
        { slot: 'Snack', name: 'Cottage cheese + fruit', kcal: 280, macros: '26P · 30C · 6F' },
      ], coach_workout_review_notes: [] },
  ];
  // The demo sessions carry the client's ratings as a live row would: the first both, the second its RPE
  // alone (enjoyment not given).
  return [
    {
      id: `demo-${role}-session-1`,
      title: 'Lower pull session',
      workout_name: 'Lower Pull - Peak',
      status: 'completed',
      started_at: '2026-05-14T13:05:00Z',
      ended_at: '2026-05-14T13:57:00Z',
      duration_seconds: 3120,
      session_rpe: 7,
      summary: { completedSets: 10, avgSetSeconds: 48, avgRestSeconds: 94, enjoyment: 4 },
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
      session_rpe: 6,
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

export default function BSWorkoutReviewPage({ role = 'trainer', onBack }) {
  const { BSPage, BSBackRow, BSMastRow, BS_MAST_TOP_CSS = BS_MAST_TOP_FALLBACK } = window;
  const t = useBSProClean();
  const tr = useShapeTr();
  const isNutri = role === 'nutritionist';
  const heat = reviewHeat(t, role);
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(tr('coach:review.statusLoading', { defaultValue: 'LOADING…' }));

  // The queue's SOURCE is role-specific. A nutritionist reads their clients'
  // meal-log days (daily_health_snapshot); a trainer reads workout sessions.
  // Serving workout_sessions to both is what made the nutritionist's whole
  // "Client review." feature show trainer data on a live account — the demo
  // rows were the only thing that ever looked like nutrition.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = isNutri
          ? await window.ShapeNutritionLogs?.listClientDays?.()
          : await window.ShapeWorkoutLogs?.listSessions?.();
        const rows = Array.isArray(result?.data) ? result.data : [];
        if (cancelled) return;
        const nextRows = rows.length ? rows : demoWorkoutReviewSessions(role);
        setSessions(nextRows);
        setSelectedId((current) => current || nextRows[0]?.id || null);
        setStatus(rows.length
          ? (isNutri
            ? tr('coach:review.statusLiveNutrition', { defaultValue: 'LIVE · CLIENT NUTRITION DAYS' })
            : tr('coach:review.statusLiveLogs', { defaultValue: 'LIVE · SUPABASE SESSION LOGS' }))
          : (isNutri
            ? tr('coach:review.statusDemoNutrition', { defaultValue: 'DEMO QUEUE · UNTIL CLIENTS LOG MEALS' })
            : tr('coach:review.statusDemoQueue', { defaultValue: 'DEMO QUEUE · UNTIL CLIENT SESSIONS APPEAR' })));
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
  const [hrDetail, setHrDetail] = useState({ id: null, state: 'idle', rows: [] });
  useEffect(() => {
    let cancelled = false;
    const id = selected?.id;
    if (isNutri || !id || String(id).startsWith('demo-')) return undefined;
    setHrDetail({ id, state: 'loading', rows: [] });
    Promise.resolve().then(() => {
      if (!window.ShapeWorkoutLogs?.listSensorSamples) throw new Error('Readings unavailable');
      return window.ShapeWorkoutLogs.listSensorSamples(id);
    }).then(result => {
      if (!cancelled) setHrDetail({ id, state: 'ready', rows: result?.data || [] });
    }).catch(() => { if (!cancelled) setHrDetail({ id, state: 'error', rows: [] }); });
    return () => { cancelled = true; };
  }, [selected?.id, isNutri]);
  const hrRows = hrDetail.id === selected?.id && hrDetail.state === 'ready' ? hrDetail.rows : [];
  const hrPaths = bsHrChart(hrRows, Date.parse(selected?.started_at), Date.parse(selected?.ended_at));
  const hrSummary = selected?.summary?.heartRate;
  const reviewNotes = selected?.coach_workout_review_notes || selected?.review_notes || [];
  const completedSets = selected?.summary?.completedSets || setLogs.filter((entry) => entry.completed !== false).length;
  const avgSet = setLogs.length ? knownWorkoutAverage(setLogs, 'set_duration_seconds', 'setDurationSeconds') : selected?.summary?.avgSetSeconds ?? null;
  const avgRest = setLogs.length ? knownWorkoutAverage(setLogs, 'rest_before_seconds', 'restBeforeSeconds') : selected?.summary?.avgRestSeconds ?? null;
  // Per-meal rows exist on the demo day only — a live day is totals-only.
  const hasMeals = Array.isArray(selected?.meals) && selected.meals.length > 0;
  // A real number, or not there: null, '' and non-numbers are absent (Number('') is a finite 0).
  const num = (x) => x != null && x !== '' && Number.isFinite(Number(x));
  // Unit abbreviations are per-locale (ru/uk write г / л / ккал) — never a
  // hardcoded Latin letter inside a Cyrillic line.
  const G = tr('coach:review.unitGram', { defaultValue: 'G' });
  // Everything else the day carries, each part dropped when absent so the line
  // never asserts a reading the client did not take.
  const nutriMeta = selected?.nutrition ? [
    num(selected.fatG) ? `${tr('coach:adjust.fat', { defaultValue: 'FAT' })} ${selected.fatG}${G}` : null,
    num(selected.hydrationL) ? `${tr('coach:review.metaHydration', { defaultValue: 'HYDRATION' })} ${selected.hydrationL}${tr('coach:review.unitLitre', { defaultValue: 'L' })}` : null,
    num(selected.energy) ? `${tr('coach:review.metaEnergy', { defaultValue: 'ENERGY' })} ${selected.energy}/10` : null,
    num(selected.hunger) ? `${tr('coach:review.metaHunger', { defaultValue: 'HUNGER' })} ${selected.hunger}/10` : null,
  ].filter(Boolean) : [];

  // The note's SUBJECT. A workout session is addressed by its id; a nutrition
  // day by (client_id, snapshot_date) — the NATURAL key, because
  // daily_health_snapshot is UPSERTed on (user_id, snapshot_date), so its row
  // id is a row identity and the member's own logging can replace it. Demo
  // rows resolve to null and never reach the writer: a demo day carries no
  // client or day, and a demo session's `demo-…` id is no session the
  // database holds (sent, the writer threw signed out, and signed in the
  // insert was refused or the note was filed locally against no session).
  const isDemo = (row) => String(row?.id || '').startsWith('demo-');
  const noteSubject = !selected || isDemo(selected) ? null : selected.nutrition
    ? (selected.clientId && selected.loggedOn
      ? { clientId: selected.clientId, snapshotDate: selected.loggedOn }
      : null)
    : (selected.id ? { sessionId: selected.id } : null);

  const appendNote = (saved) => {
    setSessions((rows) => rows.map((session) => session.id === selected.id
      ? { ...session, coach_workout_review_notes: [...(session.coach_workout_review_notes || []), saved] }
      : session));
    setNote('');
  };
  const localNote = (clean) => ({ id: `local-${Date.now()}`, body: clean, visibility: 'client', created_at: new Date().toISOString() });

  const saveNote = async () => {
    const clean = note.trim();
    if (!selected?.id || !clean) return;
    // The composer is hidden for these rows; refuse here too, so a caller that
    // reaches saveNote another way can never send a row the schema will reject.
    if (selected.notesBlocked) return;
    // A demo day has no live subject — keep it local rather than sending a row
    // the DB's subject CHECK would reject.
    if (!noteSubject) {
      appendNote(localNote(clean));
      setStatus(tr('coach:review.savedDemo', { defaultValue: 'Saved locally for this demo session' }));
      return;
    }
    setStatus(tr('coach:review.savingNote', { defaultValue: 'Saving review note...' }));
    try {
      const result = await window.ShapeWorkoutLogs?.addCoachReviewNote?.({
        ...noteSubject,
        providerRole: role,
        body: clean,
        visibility: 'client',
      });
      appendNote(result?.data || localNote(clean));
      setStatus(result?.stored === 'supabase' ? tr('coach:review.noteSavedRemote', { defaultValue: 'Review note saved to Supabase' }) : tr('coach:review.noteSavedLocal', { defaultValue: 'Review note saved locally' }));
    } catch {
      // ⚠ NOTHING WAS STORED — anywhere. addCoachReviewNote returns
      // {stored:'local'} when it genuinely persists to localStorage, so a THROW
      // is the one shape where the coach's words exist only in this textarea.
      // Appending a fabricated row here and clearing the composer is the
      // "saved locally" lie this whole wave exists to end: the note would
      // render in the list, vanish on the next load, and the coach would never
      // know. Keep the draft, append nothing, say so.
      setStatus(tr('coach:review.noteFailed', { defaultValue: "Couldn't save — your note is still here. Try again." }));
    }
  };

  // A LIVE nutrition day carries the client + the calendar day it covers; the
  // demo rows carry an authored title. `snapshot_date` is the member's OWN
  // 'YYYY-MM-DD', so it is parsed part-by-part — new Date('2026-08-31') is UTC
  // midnight and renders as the 30th anywhere west of UTC.
  const dayLabel = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d)) return '';
    try { return d.toLocaleDateString(coachLocale(), { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  };
  const rowTitle = (row) => row.workout_name || row.title
    || (row.nutrition
      ? [row.clientName || tr('coach:common.clientFallback', { defaultValue: 'Client' }), dayLabel(row.loggedOn)].filter(Boolean).join(' · ')
      : tr('coach:review.sessionFallback', { defaultValue: 'Workout session' }));
  // `workout_sessions.status` is a STORED TOKEN, not copy: the column is text
  // NOT NULL DEFAULT 'completed' with a CHECK pinning it to exactly
  // planned|active|completed|abandoned|reviewed. The token keeps being the
  // token; only the LABEL is translated, and an unrecognised value renders as
  // ITSELF — never a raw key, never blank (the aisle precedent). The demo rows'
  // free-text statuses fall through that passthrough and read as themselves,
  // which is what demo copy is supposed to do.
  const REVIEW_STATUS = {
    planned: ['coach:review.stPlanned', 'Planned'],
    active: ['coach:review.stActive', 'In progress'],
    completed: ['coach:review.stCompleted', 'Completed'],
    abandoned: ['coach:review.stAbandoned', 'Ended early'],
    reviewed: ['coach:review.stReviewed', 'Reviewed'],
  };
  const statusLabel = (raw) => {
    const s = String(raw == null ? '' : raw);
    // Exact first; the lowercase retry only ever sees ASCII tokens from our own
    // CHECK constraint, so it cannot hit the Turkish dotted-i class that bans a
    // locale-insensitive fold over TRANSLATED text.
    const hit = REVIEW_STATUS[s] || REVIEW_STATUS[s.toLowerCase()];
    if (!hit) return s;
    const v = tr(hit[0], { defaultValue: hit[1] });
    return (typeof v === 'string' && v && v !== hit[0]) ? v : hit[1];
  };
  // Never claim 'completed' for a nutrition day — that is a workout word, and
  // a logged day is not a finished anything. Absent a stored status the day
  // states WHEN it is, which is a fact.
  const rowStatus = (row) => statusLabel(row.status) || (row.nutrition ? dayLabel(row.loggedOn) : statusLabel('completed'));
  // A number that is not a real number renders as an em dash, never 0 — a
  // fabricated zero here reads as "this client ate nothing".
  const fig = (v, suffix = '') => (num(v) ? `${v}${suffix}` : '—');

  // ── The words and figures B draws ─────────────────────────────────────────────────────────────────
  const dark = !t.isLight;
  const padX = t.padX;
  const ink = (a) => `rgba(${t.inkRGB || (dark ? '245,240,230' : '15,14,12')},${a})`;
  const hair = ink(t.isLight ? 0.09 : 0.1);
  // The lit colour: the role's heat, brighter on a dark paper (where it glows); the print one on a light one.
  const lit = dark ? bsProDeckHeat(isNutri ? 'nutritionist' : 'trainer') : heat;
  const glassFill = bsGlassFill(t);
  const glass = (r = 16) => ({ ...glassFill, border: bsGlassBorder(t), borderRadius: r, boxSizing: 'border-box' });
  const over = (color, extra) => ({ ...overline(t, color), ...(extra || {}) });
  const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const tab = { fontVariantNumeric: 'tabular-nums' };
  const ratio = (a, b) => (num(a) && num(b) && Number(b) > 0 ? Math.max(0, Math.min(1, Number(a) / Number(b))) : null);
  const KCAL = tr('coach:review.unitKcal', { defaultValue: 'KCAL' });
  const SET = tr('coach:review.setLabel', { defaultValue: 'SET' });
  const REST = tr('coach:review.restLabel', { defaultValue: 'REST' });
  const dot = (c, size = 6, glowOn = false) => <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 999, flexShrink: 0, background: c, boxShadow: glowOn && dark ? `0 0 8px ${hexA(c, 0.85)}` : 'none' }} />;

  // What a queue row says. A live day has NO per-meal count (meal logging
  // accumulates day totals), so it leads with the figure it genuinely has; a
  // fabricated '0/0 MEALS' would read as a client who logged nothing.
  const qInfo = (session) => {
    const isNut = session.nutrition === true;
    const hasMealCount = num(session.logged) && num(session.planned);
    const count = isNut
      ? (hasMealCount ? `${session.logged}/${session.planned}` : fig(session.kcal))
      : (session.summary?.completedSets || (session.workout_set_logs || []).length || 0);
    const unit = isNut
      ? (hasMealCount ? tr('coach:review.unitMeals', { defaultValue: 'MEALS' }) : KCAL)
      : tr('coach:review.unitSets', { defaultValue: 'SETS' });
    const title = rowTitle(session);
    const sub = `${rowStatus(session)}${isNut ? '' : ` · ${formatReviewSeconds(session.duration_seconds)}`}`;
    return { count, unit, title, sub, aria: `${title}, ${count} ${unit.toLocaleLowerCase(coachLocale())}, ${rowStatus(session)}` };
  };

  const queueLine = `${tr('coach:review.queueEyebrow', { defaultValue: 'THE QUEUE' })} · ${tr('coach:review.itemsCount', { defaultValue: '{count, plural, one {# ITEM} other {# ITEMS}}', count: sessions.length })}`;
  const title = `${isNutri ? tr('coach:review.titleNutri', { defaultValue: 'Client' }) : tr('coach:review.titleTrainer', { defaultValue: 'Workout' })} ${String(tr('coach:review.titleAccent', { defaultValue: 'review.' }) || '').replace(/[.。]\s*$/, '')}`;
  const sectionLabel = !selected ? '' : selected.nutrition
    ? `${tr('coach:review.mealLog', { defaultValue: 'MEAL LOG' })} · ${rowStatus(selected)}`
    : `${tr('coach:review.sessionDetail', { defaultValue: 'SESSION DETAIL' })} · ${rowStatus(selected)}`;

  // The hero's pair board: `of` is what a figure reads against, `fill` how far along it is. A nutrition day
  // reads Kcal | Target over Protein | Logged; a live day has no meal count, so its fourth figure is the
  // other macro it holds. The target is the COACH'S OWN prescription and is null when they have not set
  // one — an em dash, never a default.
  const cells = !selected ? [] : selected.nutrition ? [
    { k: 'kcal', label: tr('coach:review.statKcal', { defaultValue: 'Kcal' }), value: fig(selected.kcal), of: null, fill: ratio(selected.kcal, selected.kcalTarget) },
    { k: 'target', label: tr('coach:review.statTarget', { defaultValue: 'Target' }), value: fig(selected.kcalTarget), of: null, fill: null },
    { k: 'protein', label: tr('coach:review.statProtein', { defaultValue: 'Protein' }), value: fig(selected.proteinG), of: num(selected.proteinTargetG) ? `${selected.proteinTargetG}${G}` : null, unit: !num(selected.proteinTargetG) && num(selected.proteinG) ? G : null, fill: ratio(selected.proteinG, selected.proteinTargetG) },
    hasMeals
      ? { k: 'logged', label: tr('coach:review.statLogged', { defaultValue: 'Logged' }), value: String(selected.logged), of: String(selected.planned), fill: ratio(selected.logged, selected.planned) }
      : { k: 'carbs', label: tr('coach:case.macroCarbs', { defaultValue: 'Carbs' }), value: fig(selected.carbsG), unit: num(selected.carbsG) ? G : null, of: null, fill: null },
  ] : [
    { k: 'sets', label: tr('coach:review.statSets', { defaultValue: 'Sets' }), value: String(completedSets), of: null, fill: null },
    { k: 'avgSet', label: tr('coach:review.statAvgSet', { defaultValue: 'Avg set' }), value: formatReviewSeconds(avgSet), of: null, fill: null },
    { k: 'avgRest', label: tr('coach:review.statAvgRest', { defaultValue: 'Avg rest' }), value: formatReviewSeconds(avgRest), of: null, fill: null },
    { k: 'elapsed', label: tr('coach:review.statElapsed', { defaultValue: 'Elapsed' }), value: formatReviewSeconds(selected.duration_seconds), of: null, fill: null },
  ];
  // The client's ratings at the hero's foot: difficulty as "RPE 7/10", enjoyment as "♡ 4/5". Only what
  // the client gave; a session with neither has no ratings row.
  const given = selected && !selected.nutrition ? reviewRatings(selected) : { rpe: null, enjoyment: null };
  const ratings = [
    given.rpe != null ? { key: 'rpe', label: tr('coach:common.rpe', { defaultValue: 'RPE' }), value: `${given.rpe}/10` } : null,
    given.enjoyment != null ? { key: 'enjoyment', label: '♡', value: `${given.enjoyment}/5` } : null,
  ].filter(Boolean);

  const meals = (selected?.meals || []).map((meal, index) => ({ key: index, lead: meal.slot, name: meal.name, sub: meal.macros, figure: String(meal.kcal) }));
  const sets = setLogs.map((entry, index) => ({
    key: entry.id || index,
    name: `${entry.movement_name || entry.moveName || tr('coach:review.movementFallback', { defaultValue: 'Movement' })} #${entry.set_number || entry.setNumber || index + 1}`,
    target: t.uText(`${entry.target_reps || entry.targetReps || tr('coach:review.targetFallback', { defaultValue: 'target' })} · ${entry.target_load || entry.targetLoad || tr('coach:review.loadFallback', { defaultValue: 'load' })}`),
    set: formatReviewSeconds(entry.set_duration_seconds ?? entry.setDurationSeconds),
    rest: formatReviewSeconds(entry.rest_before_seconds ?? entry.restBeforeSeconds),
  }));
  // A pending sample renders — in the faint ink, never a 0.
  const samples = (sensorSamples.length ? sensorSamples : [{ metric: tr('coach:review.watchDataFallback', { defaultValue: 'watch data' }), value: 'pending', unit: '' }]).slice(0, 4).map((sample, index) => {
    const pending = sample.value === 'pending' || sample.value == null;
    const m = pending ? null : t.uMeasure(sample.value, sample.unit);
    return {
      key: sample.id || index,
      label: String(sample.metric || sample.sample_type || sample.type || tr('coach:review.metricFallback', { defaultValue: 'metric' })).replace(/_/g, ' '),
      value: pending ? '—' : m.value, unit: !pending && sample.unit ? m.unit : '', pending,
    };
  });
  // The heart-rate trace as the page has always drawn it. A live session always shows the section, with its
  // loading, failed or none line; a demo session with no trace leaves it out rather than heading nothing.
  const showHr = !!selected && !selected.nutrition && (!!hrSummary || hrPaths.length > 0 || !isDemo(selected));

  return (
    <BSPage>
      {/* The masthead row without its corners: the review note is a textarea that only lands on Save, and
          the settings gear would unmount it. ← Back is the way out. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${padX}px 0` }}>{BSMastRow ? <BSMastRow trailing={null} /> : null}</div>
      <div style={{ padding: `0 ${padX}px 0` }}>
        <BSBackRow onBack={onBack} trailing={<BSProCleanType t={t}>
          <div style={{ ...overline(t), minWidth: 0, textAlign: 'right' }}>{queueLine}</div>
        </BSProCleanType>} />
      </div>
      <BSProCleanType t={t}>
        <div style={{ padding: `0 ${padX}px 0` }}>
          <h1 style={{ ...pageTitle(t), marginTop: 10 }}>{title}</h1>
          <p data-review-status="" aria-live="polite" style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 7, ...over() }}>{dot(heat, 6, true)}{status}</p>
        </div>

        {/* ── The queue on glass rows; the selected one ringed in the role's colour, with aria-current. ── */}
        {sessions.length ? (
          <div data-review-queue="" style={{ display: 'grid', gap: 8, padding: `14px ${padX}px 0` }}>
            {sessions.map((session) => {
              const q = qInfo(session);
              const on = session.id === selected?.id;
              return (
                <button key={session.id} type="button" onClick={() => setSelectedId(session.id)} aria-current={on ? 'true' : undefined} aria-label={q.aria} style={{
                  ...glass(16), display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '9px 12px 9px 14px', textAlign: 'left', cursor: 'pointer', color: t.INK,
                  ...(on ? { border: `1px solid ${hexA(heat, 0.65)}`, boxShadow: `${glassFill.boxShadow}, 0 0 0 3px ${hexA(heat, dark ? 0.16 : 0.12)}` } : null),
                }}>
                  {dot(on ? lit : ink(0.2), 8, on)}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: BS_PRO_SANS, fontSize: 15, fontWeight: 600, color: on ? t.INK : t.INK70, ...ellipsis }}>{q.title}</span>
                    <span style={{ display: 'block', marginTop: 2, ...over(), ...ellipsis }}>{q.sub}</span>
                  </span>
                  <span style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 999, background: on ? hexA(heat, dark ? 0.22 : 0.14) : ink(0.06), fontFamily: BS_PRO_SANS, fontSize: 12, fontWeight: 650, color: on && dark ? lit : (on ? t.INK : t.INK70), whiteSpace: 'nowrap', ...tab }}>{q.count} {q.unit}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {selected ? (<>
          {/* ── The selected day or session: a raised hero card holding the pair board, the day's other
              readings and its flag, and a session's ratings at its foot. ── */}
          <div style={{ padding: `14px ${padX}px 0` }}>
            <div data-review-hero="" style={{ ...bsRaised(t, heat), padding: '14px 16px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, ...over(t.INK70) }}>{dot(lit, 6, true)}{sectionLabel}</div>
              <div style={{ marginTop: 6, fontFamily: BS_PRO_HEAD, fontSize: 20, fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.15, color: t.INK }}>{rowTitle(selected)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 12, borderTop: `1px solid ${hair}` }}>
                {cells.map((c, i) => (
                  <div key={c.k} data-review-cell={c.k} style={{ minWidth: 0, padding: '10px 0', paddingLeft: i % 2 ? 14 : 0, borderLeft: i % 2 ? `1px solid ${hair}` : 0, borderBottom: i < cells.length - 2 || ratings.length ? `1px solid ${hair}` : 0 }}>
                    <div style={over()}>{c.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 4, whiteSpace: 'nowrap' }}>
                      <span data-review-figure="" style={{ fontFamily: BS_PRO_HEAD, fontSize: 24, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK, ...tab }}>{c.value}</span>
                      {c.unit ? <span style={{ marginLeft: 2, fontFamily: BS_PRO_SANS, fontSize: 11.5, fontWeight: 600, color: t.INK50 }}>{c.unit}</span> : null}
                      {c.of != null ? <span style={{ fontFamily: BS_PRO_SANS, fontSize: 12, fontWeight: 600, color: t.INK50, ...tab }}>/{c.of}</span> : null}
                    </div>
                    {c.fill != null ? (
                      <div aria-hidden="true" data-review-bar="" style={{ marginTop: 8, marginRight: 14, height: 4, borderRadius: 4, background: ink(0.1), overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(c.fill * 100)}%`, height: '100%', borderRadius: 4, background: heat }} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {ratings.length ? (
                <div data-review-ratings="" style={{ display: 'grid', gridTemplateColumns: ratings.length > 1 ? '1fr 1fr' : '1fr' }}>
                  {ratings.map((r, i) => (
                    <div key={r.key} data-review-rating={r.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 0', paddingLeft: i ? 14 : 0, borderLeft: i ? `1px solid ${hair}` : 0 }}>
                      <span style={over(null, { fontSize: 12 })}>{r.label}</span>{' '}
                      <span style={{ fontFamily: BS_PRO_HEAD, fontSize: 17, fontWeight: 600, color: t.INK, ...tab }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* The rest of the day, in the coach's own read order — each part omitted entirely when the
                  client did not log it — and the day's flag. */}
              {nutriMeta.length || selected.flag ? (
                <div style={{ padding: '4px 0 10px' }}>
                  {nutriMeta.length ? <div data-review-meta="" style={{ marginTop: 6, ...over() }}>{nutriMeta.join(' · ')}</div> : null}
                  {selected.flag ? <div data-review-flag="" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, ...over(t.RUST) }}>{dot(t.RUST, 6, true)}{selected.flag}</div> : null}
                </div>
              ) : <div style={{ height: 8 }} />}
            </div>
          </div>

          {/* ── Meals or sets on glass rows. A live day has NO per-meal rows to show: logging accumulates
              into the day's totals (add_meal_macros) and no per-meal record is kept. It says that, rather
              than rendering an empty list that reads as "logged nothing". ── */}
          <div data-review-rows="" style={{ display: 'grid', gap: 6, padding: `12px ${padX}px 0` }}>
            {selected.nutrition ? (<>
              {!hasMeals ? <ReviewRedact t={t} label={tr('coach:review.mealsNotStored', { defaultValue: 'PER-MEAL DETAIL NOT STORED · DAY TOTALS ONLY' })} /> : null}
              {meals.map((m) => (
                <div key={m.key} data-review-row="meal" style={{ ...glass(14), display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '9px 14px' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: BS_PRO_SANS, fontSize: 11.5, fontWeight: 600, color: t.INK50, ...ellipsis }}>{m.lead}</span>
                    <span style={{ display: 'block', marginTop: 2, fontFamily: BS_PRO_SANS, fontSize: 14.5, fontWeight: 600, color: t.INK, ...ellipsis }}>{m.name}</span>
                  </span>
                  <span style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ display: 'block', fontFamily: BS_PRO_HEAD, fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, whiteSpace: 'nowrap', ...tab }}>{m.figure}<span style={{ marginLeft: 3, fontFamily: BS_PRO_SANS, fontSize: 10.5, color: t.INK50 }}>{KCAL}</span></span>
                    <span style={{ display: 'block', marginTop: 2, fontFamily: BS_PRO_SANS, fontSize: 11, color: t.INK50, whiteSpace: 'nowrap', ...tab }}>{m.sub}</span>
                  </span>
                </div>
              ))}
            </>) : (sets.length ? sets.map((s) => (
              <div key={s.key} data-review-row="set" style={{ ...glass(14), display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '9px 14px' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: BS_PRO_SANS, fontSize: 14.5, fontWeight: 600, color: t.INK, ...ellipsis }}>{s.name}</span>
                  <span style={{ display: 'block', marginTop: 2, fontFamily: BS_PRO_SANS, fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.INK50 }}>{s.target}</span>
                </span>
                <span style={{ flexShrink: 0, textAlign: 'right', fontFamily: BS_PRO_SANS, fontSize: 11, fontWeight: 600, color: t.INK50, whiteSpace: 'nowrap', ...tab }}>
                  <span style={{ display: 'block' }}>{SET} <span style={{ fontFamily: BS_PRO_HEAD, fontSize: 16, color: t.INK }}>{s.set}</span></span>
                  <span style={{ display: 'block', marginTop: 1 }}>{REST} <span style={{ color: t.INK70 }}>{s.rest}</span></span>
                </span>
              </div>
            )) : <ReviewRedact t={t} label={tr('coach:review.noSetsLogged', { defaultValue: 'NO SETS LOGGED' })} />)}
          </div>

          {showHr ? (
            <section data-review-hr="" aria-label={tr('session:player.view.hrReview')} style={{ padding: `22px ${padX}px 0`, color: t.INK }}>
              <h2 style={sectionTitle(t)}>{tr('session:player.view.hrReview')}</h2>
              {hrSummary && <>
                <p style={{ margin: '8px 0 0', fontFamily: BS_PRO_SANS, fontSize: 13.5, ...tab }}>{tr('session:player.view.hrSummary', { avg: hrSummary.avg, max: hrSummary.max })}</p>
                <p style={{ margin: '2px 0 0', color: t.INK70, fontSize: 12 }}>{tr('session:player.view.hrCoverage', { pct: hrSummary.coveragePercent, count: hrSummary.samples })}</p>
              </>}
              {hrPaths.length > 0 && <svg role="img" aria-label={tr('session:player.view.hrChart')} viewBox="-2 0 304 80" style={{ width: '100%', height: 110, overflow: 'visible', marginTop: 8 }}>
                {hrPaths.map((points, i) => points.includes(' ')
                  ? <polyline key={i} points={points} fill="none" stroke={heat} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  : <circle key={i} cx={points.split(',')[0]} cy={points.split(',')[1]} r="2" fill={heat} />)}
              </svg>}
              {!isDemo(selected) && <p role="status" style={{ margin: '6px 0 0', fontSize: 12, color: t.INK70 }}>{hrDetail.id !== selected?.id || hrDetail.state === 'loading' ? tr('session:player.view.hrLoading') : hrDetail.state === 'error' ? tr('session:player.view.hrFailed') : !hrPaths.length ? tr('session:player.view.hrNone') : ''}</p>}
            </section>
          ) : null}

          {/* ── Watch samples in a glass card: a pending sample renders — in the faint ink. ── */}
          {!selected.nutrition ? (
            <div style={{ padding: `22px ${padX}px 0` }}>
              <ReviewCaseHead t={t} label={tr('coach:review.watchSamples', { defaultValue: 'WATCH SAMPLES' })} meta={tr('coach:review.samplesCount', { defaultValue: '{count, plural, one {# sample} other {# samples}}', count: sensorSamples.length })} />
              <div data-review-samples="" style={{ ...glass(16), display: 'grid', gridTemplateColumns: `repeat(${samples.length}, minmax(0, 1fr))`, padding: '12px 0' }}>
                {samples.map((s, i) => (
                  <div key={s.key} style={{ minWidth: 0, padding: '0 14px', borderLeft: i ? `1px solid ${hair}` : 0 }}>
                    <div style={{ ...over(), ...ellipsis }}>{s.label}</div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: BS_PRO_HEAD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.03em', color: s.pending ? t.INK50 : t.INK, ...tab }}>{s.value}</span>
                      {s.unit ? <span style={over()}>{s.unit}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Coach notes: each on glass with a heat spine, then the glass composer, Save inside it beside
              the text. A day note needs the schema half (2026-08-31-nutrition-day-review-notes.sql);
              `notesBlocked` is PROBED on read, so the composer is hidden exactly while an insert would
              fail — never as a standing claim about what the product can do. ── */}
          <div style={{ padding: `22px ${padX}px 26px` }}>
            <ReviewCaseHead t={t} label={tr('coach:review.coachNotes', { defaultValue: 'COACH NOTES' })} meta={tr('coach:review.notesCount', { defaultValue: '{count, plural, one {# note} other {# notes}}', count: reviewNotes.length })} />
            <div style={{ display: 'grid', gap: 8 }}>
              {reviewNotes.map((item) => (
                <div key={item.id} data-review-note="" style={{ ...glass(14), padding: '11px 14px', boxShadow: `${glassFill.boxShadow}, inset 3px 0 0 ${heat}`, fontFamily: BS_PRO_SANS, fontSize: 14, lineHeight: 1.45, color: t.INK }}>{item.body}</div>
              ))}
              {selected.notesBlocked ? (
                <ReviewRedact t={t} label={tr('coach:review.notesBlocked', { defaultValue: 'NOTES ATTACH TO A WORKOUT SESSION · NOT YET TO A NUTRITION DAY' })} />
              ) : (
                <div data-review-composer="" style={{ ...glass(18), display: 'flex', alignItems: 'flex-end', gap: 8, padding: 6 }}>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr('coach:review.notePlaceholder', { defaultValue: 'Write feedback for the client...' })} rows={3} style={{
                    display: 'block', flex: 1, minWidth: 0, minHeight: 92, boxSizing: 'border-box', resize: 'none', border: 0, background: 'transparent', padding: '9px 10px',
                    color: t.INK, fontFamily: BS_PRO_SANS, fontSize: 16, lineHeight: 1.4, outline: 'none',
                  }} />
                  <button type="button" onClick={saveNote} style={{ flexShrink: 0, maxWidth: 132, minHeight: 44, padding: '8px 14px', borderRadius: 13, border: 0, background: t.INK, color: t.PAPER, fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 650, lineHeight: 1.2, cursor: 'pointer' }}>
                    {tr('coach:review.saveNote', { defaultValue: 'Save review note' })}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>) : null}
      </BSProCleanType>
    </BSPage>
  );
}
