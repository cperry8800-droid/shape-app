import React from 'react';
function BSProHomeWidgets({ role = 'trainer', onOpen = () => {} }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;
  const widgets = isNutri ? [
    { k: 'ADHERENCE', v: '78%', sub: '+11 pts this week', c: t.GREEN, action: 'reviews' },
    { k: 'MEAL PLANS', v: '6', sub: 'edited in 7 days', c: t.RUST, action: 'plans' },
    { k: 'INTAKES', v: '2', sub: 'new clients today', c: t.BLUE, action: 'clients' },
    { k: 'GROCERY', v: '14', sub: 'lists generated', c: t.AMBER, action: 'grocery' },
  ] : [
    { k: 'FORM REVIEW', v: '4', sub: 'clips waiting', c: t.BLUE, action: 'reviews' },
    { k: 'PROGRAMS', v: '12', sub: 'active blocks', c: t.AMBER, action: 'programs' },
    { k: 'PR ALERTS', v: '7', sub: 'client lifts up', c: t.GREEN, action: 'pr' },
    { k: 'PLAYLISTS', v: '3', sub: 'attached today', c: t.RUST, action: 'playlists' },
  ];
  return (
    <>
      <BSSection title={isNutri ? 'Nutrition widgets' : 'Coach widgets'} meta="Live snapshot" />
      <div style={{ padding: `0 ${t.padX}px 12px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {widgets.map((w) => {
          const tileBackground = `linear-gradient(145deg, ${w.c}22 0%, ${w.c}10 52%, ${t.PAPER2} 100%)`;
          return (
          <button key={w.k} type="button" onClick={() => onOpen(w.action)} style={{
            minHeight: 78,
            padding: '10px 10px 9px',
            border: `1px solid ${w.c}55`,
            borderRadius: 12,
            background: tileBackground,
            boxShadow: `0 8px 18px rgba(10,13,12,0.04), inset 0 1px 0 ${w.c}22`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            textAlign: 'left',
            color: t.INK,
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: w.c, fontWeight: 900 }}>{w.k}</span>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: w.c, boxShadow: `0 0 0 3px ${w.c}22`, flexShrink: 0 }} />
            </div>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 27, fontWeight: t.W.display, letterSpacing: '-0.052em', lineHeight: 0.95, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{w.v}</div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.25 }}>{w.sub}</div>
            </div>
          </button>
          );
        })}
      </div>
      <div style={{ margin: `0 ${t.padX}px 14px`, padding: 13, border: `1px solid ${t.RULE}`, borderRadius: 14, background: `${accent}14`, boxShadow: '0 8px 18px rgba(10,13,12,0.035)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <BSEyebrow color={accent}>{isNutri ? 'Next best action' : 'Coach queue'}</BSEyebrow>
          <BSEyebrow>{isNutri ? '3 items' : '6 items'}</BSEyebrow>
        </div>
        <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.35, color: t.INK, fontWeight: 650 }}>
          {isNutri
            ? 'Review Riley macro compliance, send the grocery swap, then publish the carb-load template.'
            : 'Clear Riley form review, publish Block 3 edits, then send the Pull Day Tempo playlist.'}
        </div>
      </div>
    </>
  );
}
// iosAppBroadsheetPros.jsx — Trainer & Nutritionist roles in Broadsheet style.
// Lighter pass: 4 tabs each — Today, Clients, Plans/Pubs, Me.

const { useState: useStateBSP, useEffect: useEffectBSP } = React;
const {
  useBS, BSPage, BSMasthead, BSPageHeader, BSAvatar, BSEyebrow, BSSection,
  BSSlab, BSCell, BSTag, BSRow, BSHeadlineNumber, BSHalftone,
  BSTabBar, BSFooter,
  BSSheetProvider, useBSSheet, BSCalendarScreen,
  BSRadioPrompt, BSRadioScreen, BSNowPlaying,
  BSClientChat, BSSettings, BSShapeScorePage, BSShapeStorePage, BSContactPage, BSTermsPage, SHAPE_SCORE_PROFILES, _bsUseLiveScore, bsTierColor, bsMyInitials, bsMyTierColor,
} = window;

// Hydrate the coach's Shape Score tier into window.ShapeScore at app startup so
// every coach avatar (home header, Me) reflects the right tier color before the
// Me tab is opened. Mirrors the client shell's startup fetch.
function _bsHydrateProScore() {
  if (typeof window === 'undefined') return;
  fetch('/api/client/score', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && typeof d.points_total === 'number') { try { window.ShapeScore = { points: d.points_total || 0, tier: d.current_tier ? d.current_tier.name : 'Base' }; } catch (e) {} } })
    .catch(() => {});
}

function formatReviewSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (!min) return `${sec}s`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function demoWorkoutReviewSessions(role = 'trainer') {
  const isNutri = role === 'nutritionist';
  return [
    {
      id: `demo-${role}-session-1`,
      title: isNutri ? 'Macro compliance session' : 'Lower pull session',
      workout_name: isNutri ? 'Big plate day' : 'Lower Pull - Peak',
      status: 'completed',
      started_at: '2026-05-14T13:05:00Z',
      ended_at: '2026-05-14T13:57:00Z',
      duration_seconds: 3120,
      summary: { completedSets: 10, avgSetSeconds: 48, avgRestSeconds: 94 },
      workout_set_logs: [
        { id: 'd1', movement_name: isNutri ? 'Meal prep check' : 'Trap bar deadlift', set_number: 1, target_reps: '5', target_load: '245 lb', completed: true, set_duration_seconds: 42, rest_before_seconds: 0 },
        { id: 'd2', movement_name: isNutri ? 'Protein target' : 'Trap bar deadlift', set_number: 2, target_reps: '5', target_load: '265 lb', completed: true, set_duration_seconds: 47, rest_before_seconds: 118 },
        { id: 'd3', movement_name: isNutri ? 'Carb timing' : 'Bulgarian split squat', set_number: 1, target_reps: '8/side', target_load: '45 lb', completed: true, set_duration_seconds: 62, rest_before_seconds: 96 },
      ],
      workout_sensor_samples: [
        { id: 's1', source: 'watch', metric: 'avg_hr', value: 132, unit: 'bpm' },
        { id: 's2', source: 'watch', metric: 'max_hr', value: 166, unit: 'bpm' },
        { id: 's3', source: 'watch', metric: 'calories', value: 418, unit: 'kcal' },
      ],
      coach_workout_review_notes: [
        { id: 'n1', body: isNutri ? 'Good adherence. Ask about late-day hunger before changing macros.' : 'Rest timing is solid. Cue slower eccentric on set 2 next week.', visibility: 'client', created_at: '2026-05-14T16:05:00Z' },
      ],
    },
    {
      id: `demo-${role}-session-2`,
      title: isNutri ? 'Refeed follow-up' : 'Upper push session',
      workout_name: isNutri ? 'Refeed template' : 'Upper Push - Tempo',
      status: 'completed',
      started_at: '2026-04-20T18:30:00Z',
      ended_at: '2026-04-20T19:18:00Z',
      duration_seconds: 2880,
      summary: { completedSets: 8, avgSetSeconds: 41, avgRestSeconds: 86 },
      workout_set_logs: [
        { id: 'd4', movement_name: isNutri ? 'Dinner log' : 'Incline DB press', set_number: 1, target_reps: '10', target_load: '55 lb', completed: true, set_duration_seconds: 39, rest_before_seconds: 0 },
        { id: 'd5', movement_name: isNutri ? 'Fiber target' : 'Incline DB press', set_number: 2, target_reps: '10', target_load: '55 lb', completed: true, set_duration_seconds: 43, rest_before_seconds: 82 },
      ],
      workout_sensor_samples: [
        { id: 's4', source: 'watch', metric: 'avg_hr', value: 119, unit: 'bpm' },
      ],
      coach_workout_review_notes: [],
    },
  ];
}

function BSReviewQueueCard({ role = 'trainer', onOpen }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;
  return (
    <div style={{ padding: `0 ${t.padX}px 14px` }}>
      <button onClick={onOpen} style={{
        width: '100%',
        textAlign: 'left',
        border: `1px solid ${t.RULE}`,
        borderTop: `2px solid ${t.INK}`,
        borderRadius: 14,
        padding: 14,
        background: t.PAPER2,
        color: t.INK,
        cursor: 'pointer',
        boxShadow: '0 8px 18px rgba(10,13,12,0.035)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <BSEyebrow color={accent}>{isNutri ? 'Client review desk' : 'Workout review desk'}</BSEyebrow>
          <BSEyebrow>{isNutri ? '2 pending' : '3 pending'} -&gt;</BSEyebrow>
        </div>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, fontWeight: 750, letterSpacing: '-0.025em' }}>
          {isNutri ? 'Review adherence notes and send client feedback.' : 'Review set timing, rest windows, and watch data.'}
        </div>
        <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.35 }}>
          {isNutri ? 'Use this for nutrition check-ins tied to logged training days.' : 'Session logs show each set, rest before the set, and sensor samples when available.'}
        </div>
      </button>
    </div>
  );
}

// ─── Reusable week strip for trainer / nutritionist home ─────
// Compact 7-day calendar matching the one on Client home, with role-tinted
// dots showing what's on each day. Selecting a day is local-only — pros
// click "Open calendar →" to drill in.
function BSWorkoutReviewPage({ role = 'trainer', onBack }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;
  const [sessions, setSessions] = useStateBSP([]);
  const [selectedId, setSelectedId] = useStateBSP(null);
  const [note, setNote] = useStateBSP('');
  const [status, setStatus] = useStateBSP('Loading session logs...');

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
        setStatus(rows.length ? 'Live Supabase session logs' : 'Demo queue until assigned client sessions appear');
      } catch (error) {
        if (cancelled) return;
        const fallback = demoWorkoutReviewSessions(role);
        setSessions(fallback);
        setSelectedId(fallback[0]?.id || null);
        setStatus(error?.message || 'Showing demo review queue');
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
    setStatus('Saving review note...');
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
      setStatus(result?.stored === 'supabase' ? 'Review note saved to Supabase' : 'Review note saved locally');
    } catch (error) {
      const saved = { id: `local-${Date.now()}`, body: clean, visibility: 'client', created_at: new Date().toISOString() };
      setSessions((rows) => rows.map((session) => session.id === selected.id
        ? { ...session, coach_workout_review_notes: [...(session.coach_workout_review_notes || []), saved] }
        : session));
      setNote('');
      setStatus(error?.message || 'Saved locally for this demo session');
    }
  };

  const stat = (label, value) => (
    <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10, minWidth: 0 }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 27, lineHeight: 1, color: t.INK, fontWeight: t.W.display, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );

  return (
    <BSPage>
      <BSMasthead
        title={isNutri ? 'Client Review' : 'Workout Review'}
        leftKicker={isNutri ? 'Nutritionist queue' : 'Trainer queue'}
        rightKicker={status}
        trailing={<button onClick={onBack} style={{ border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, borderRadius: 10, padding: '8px 10px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Back</button>}
      />

      <BSSection title={isNutri ? 'Client sessions' : 'Logged workouts'} meta={`${sessions.length} items`} />
      <div style={{ padding: `0 ${t.padX}px 14px`, display: 'grid', gap: 8 }}>
        {sessions.map((session) => {
          const active = session.id === selected?.id;
          const count = session.summary?.completedSets || (session.workout_set_logs || []).length || 0;
          return (
            <button key={session.id} onClick={() => setSelectedId(session.id)} style={{
              width: '100%',
              border: `1px solid ${active ? accent : t.RULE}`,
              borderRadius: 14,
              padding: 12,
              background: active ? `${accent}16` : t.PAPER2,
              color: t.INK,
              textAlign: 'left',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 800, color: t.INK, letterSpacing: '-0.025em' }}>{session.workout_name || session.title || 'Workout session'}</div>
                <BSEyebrow color={active ? accent : t.INK50}>{count} sets</BSEyebrow>
              </div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
                {session.status || 'completed'} - {formatReviewSeconds(session.duration_seconds)}
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <>
          <BSSection title="Session detail" meta={selected.status || 'completed'} />
          <div style={{ margin: `0 ${t.padX}px 14px`, border: `1px solid ${t.RULE}`, borderRadius: 16, background: t.PAPER2, overflow: 'hidden' }}>
            <div style={{ padding: 14 }}>
              <BSEyebrow color={accent}>{selected.title || selected.workout_name || 'Workout session'}</BSEyebrow>
              <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 24, color: t.INK, fontWeight: 800, letterSpacing: '-0.04em' }}>
                {selected.workout_name || selected.title || 'Session log'}
              </div>
              <div style={{ marginTop: 11, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }}>
                {stat('Sets', completedSets)}
                {stat('Avg set', formatReviewSeconds(avgSet))}
                {stat('Avg rest', formatReviewSeconds(avgRest))}
                {stat('Elapsed', formatReviewSeconds(selected.duration_seconds))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${t.HAIR}` }}>
              {setLogs.map((entry, index) => (
                <div key={entry.id || index} style={{ padding: '11px 14px', borderTop: index ? `1px solid ${t.HAIR}` : 0, display: 'grid', gridTemplateColumns: '1.25fr 0.7fr 0.7fr', gap: 9, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 750, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.movement_name || entry.moveName || 'Movement'} #{entry.set_number || entry.setNumber || index + 1}
                    </div>
                    <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                      {(entry.target_reps || entry.targetReps || 'target')} - {(entry.target_load || entry.targetLoad || 'load')}
                    </div>
                  </div>
                  <div>
                    <BSEyebrow>Set</BSEyebrow>
                    <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{formatReviewSeconds(entry.set_duration_seconds ?? entry.setDurationSeconds)}</div>
                  </div>
                  <div>
                    <BSEyebrow>Rest</BSEyebrow>
                    <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{formatReviewSeconds(entry.rest_before_seconds ?? entry.restBeforeSeconds)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <BSSection title="Watch samples" meta={`${sensorSamples.length} samples`} />
          <div style={{ padding: `0 ${t.padX}px 14px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(sensorSamples.length ? sensorSamples : [{ metric: 'watch data', value: 'pending', unit: '' }]).slice(0, 4).map((sample, index) => (
              <div key={sample.id || index} style={{ border: `1px solid ${t.RULE}`, borderRadius: 14, padding: 12, background: sample.value === 'pending' ? 'transparent' : `${accent}12` }}>
                <BSEyebrow color={sample.value === 'pending' ? t.INK50 : accent}>{String(sample.metric || sample.type || 'metric').replace(/_/g, ' ')}</BSEyebrow>
                <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 26, color: t.INK, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                  {sample.value ?? '--'} <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', color: t.INK50, textTransform: 'uppercase' }}>{sample.unit || ''}</span>
                </div>
              </div>
            ))}
          </div>

          <BSSection title="Coach notes" meta={`${reviewNotes.length} notes`} />
          <div style={{ padding: `0 ${t.padX}px 22px`, display: 'grid', gap: 10 }}>
            {reviewNotes.map((item) => (
              <div key={item.id} style={{ borderLeft: `3px solid ${accent}`, padding: '8px 0 8px 11px', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, lineHeight: 1.4 }}>
                {item.body}
              </div>
            ))}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write feedback for the client..." style={{
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
              Save review note
            </button>
          </div>
        </>
      ) : null}
    </BSPage>
  );
}

// Coach "live now" — read-only mirror of the client's live session: running
// timer, sets as they land, current move, plus a quick-cue sender.
function BSProLiveWatch({ client = 'Alex Rivera', workout = 'Upper Pull — Peak', onBack = () => {} }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [now, setNow] = useStateBSP(Date.now());
  const [startedAt] = useStateBSP(Date.now() - (30 * 60 + 55) * 1000); // ~30:55 in
  const [cueDraft, setCueDraft] = useStateBSP('');
  const [sentCue, setSentCue] = useStateBSP(null);
  useEffectBSP(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const elapsed = Math.floor((now - startedAt) / 1000);

  const moves = [
    { name: 'Pull-up', scheme: '4 × 6-8', rest: '180s', load: '42 lb', sets: 4, done: 4 },
    { name: 'Barbell row', scheme: '4 × 8', rest: '2:00', load: '155 lb', sets: 4, done: 2, active: true, cue: 'Hinge 45°, pull to sternum.' },
    { name: 'Chest-sup. row', scheme: '3 × 10', rest: '90s', load: '60 lb', sets: 3, done: 0 },
    { name: 'Face pull', scheme: '3 × 15', rest: '60s', load: '35 lb', sets: 3, done: 0 },
    { name: 'Incline curl', scheme: '3 × 12', rest: '60s', load: '27.5 lb', sets: 3, done: 0 },
    { name: 'Farmer carry', scheme: '3 × 40m', rest: '60s', load: '80 lb', sets: 3, done: 0 },
  ];
  const curIdx = Math.max(0, moves.findIndex(m => m.active));
  const cur = moves[curIdx];
  const totalSets = moves.reduce((s, m) => s + m.sets, 0);
  const doneSets = moves.reduce((s, m) => s + m.done, 0);
  const pct = totalSets ? doneSets / totalSets : 0;
  const quickCues = ['Slow the eccentric', 'Hold this weight', 'One more set', 'Lengthen your rest'];
  const sendCue = (text) => { const m = String(text || cueDraft).trim(); if (!m) return; setSentCue(m); setCueDraft(''); };

  return (
    <BSPage>
      <div style={{ padding: `46px ${t.padX}px 6px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK }}>✕ Close</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.RUST }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: t.RUST, display: 'inline-block' }} /> Live · {fmt(elapsed)}
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{doneSets}/{totalSets}</span>
      </div>

      <div style={{ padding: `8px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.RUST, fontWeight: 800 }}>Watching live</div>
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 29, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{client}</div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{workout} · {Math.round(pct * 100)}% · set {cur.done + 1} of {cur.sets}</div>
        <div style={{ marginTop: 12, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: teal, borderRadius: 999 }} />
        </div>
      </div>

      <div style={{ padding: `20px ${t.padX}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, fontWeight: 800 }}>Exercise {curIdx + 1} of {moves.length}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 700 }}>{cur.scheme}</span>
      </div>
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{cur.name}<span style={{ color: t.RUST }}>.</span></div>
        {cur.cue && <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, color: t.INK50 }}>“{cur.cue}”</div>}
      </div>

      <div style={{ padding: `16px ${t.padX}px 0` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 30px', gap: 8, padding: '0 0 8px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
          <span>Set</span><span>Weight</span><span>Reps</span><span>RPE</span><span />
        </div>
        {Array.from({ length: cur.sets }).map((_, i) => {
          const done = i < cur.done;
          const active = i === cur.done;
          const cell = (val) => <div style={{ borderRadius: 10, border: `1px solid ${active ? teal : t.HAIR}`, background: done ? 'transparent' : (active ? `${teal}12` : t.PAPER2), color: val === '—' ? t.INK50 : t.INK, padding: '10px 8px', fontFamily: t.MONO, fontSize: 12, textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: done ? 0.7 : 1 }}>{val}</div>;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 30px', gap: 8, alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: (done || active) ? teal : t.INK50 }}>{done ? '✓' : String(i + 1).padStart(2, '0')}</span>
              {cell(cur.load.replace(/\s*lb/i, '') + ' lb')}
              {cell(done ? '8' : '—')}
              {cell(done ? '8.0' : '—')}
              <span style={{ justifySelf: 'end', width: 24, height: 24, borderRadius: 999, border: `1.5px solid ${(done || active) ? teal : t.RULE}`, background: done ? teal : 'transparent', color: done ? '#04201d' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>✓</span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <BSEyebrow color={t.RUST}>Send a cue</BSEyebrow>
        {sentCue && <div style={{ marginTop: 8, borderRadius: 14, border: `1px solid ${t.RUST}55`, background: `${t.RUST}12`, padding: '10px 12px', fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: t.INK70 }}>Sent to {client}: “{sentCue}”</div>}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <input value={cueDraft} onChange={e => setCueDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendCue(); }} placeholder="Type a quick cue…" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '11px 14px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' }} />
          <button onClick={() => sendCue()} style={{ borderRadius: 999, border: 0, background: t.RUST, color: t.PAPER, cursor: 'pointer', padding: '0 18px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Send</button>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {quickCues.map(q => <button key={q} onClick={() => sendCue(q)} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', padding: '7px 12px', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{q}</button>)}
        </div>
      </div>

      <div style={{ padding: `24px ${t.padX}px 4px` }}>
        <BSEyebrow color={teal}>Up next</BSEyebrow>
        <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Queue</div>
      </div>
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {moves.map((m, i) => {
          const mDone = m.done >= m.sets;
          const isCur = i === curIdx;
          return (
            <div key={i} style={{ background: isCur ? t.PAPER2 : 'transparent', borderRadius: 12, display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'center', padding: '12px 10px', borderBottom: `1px solid ${t.HAIR}`, opacity: mDone ? 0.5 : 1 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: mDone ? teal : t.INK50 }}>{mDone ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', textDecoration: mDone ? 'line-through' : 'none' }}>{m.name}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50, marginTop: 2 }}>{m.scheme} · {m.rest} rest · {m.done}/{m.sets} sets</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK70 }}>{m.load}</span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: `16px ${t.padX}px 24px` }}>
        <button onClick={onBack} style={{ width: '100%', padding: '14px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Stop watching</button>
      </div>
      <BSFooter right="Live" />
    </BSPage>
  );
}

function BSProWidgetQueuePage({ role = 'trainer', type = 'pr', onBack }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.GREEN;
  const configs = {
    pr: {
      title: 'PR Alerts',
      kicker: 'Client milestones',
      meta: '7 alerts',
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
      rows: [
        ['Riley Kim', 'Big plate day list', 'Chicken, rice, pineapple, chili base - ready to send'],
        ['Sara Mendez', 'Low-FODMAP cut', 'Grouped by produce, protein, pantry, and supplements'],
        ['Morgan Liu', 'Carb-load template', 'Race-week list generated from the meal plan'],
        ['Ava Brooks', 'Vegetarian prep', 'Batch-cook list waiting for final macro approval'],
      ],
    },
  };
  const cfg = configs[type] || configs.pr;
  return (
    <BSPage>
      <BSMasthead
        title={cfg.title}
        leftKicker={cfg.kicker}
        rightKicker={cfg.meta}
        trailing={<button onClick={onBack} style={{
          border: `1px solid ${t.RULE}`,
          background: t.PAPER2,
          color: t.INK,
          borderRadius: 10,
          padding: '8px 10px',
          fontFamily: t.MONO,
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}>Back</button>}
      />
      <BSSection title={cfg.title} meta="Action queue" />
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
            }}>Open</span>
          </button>
        ))}
      </div>
      <BSFooter left={isNutri ? 'Nutrition Queue' : 'Coach Queue'} right="Live widgets" />
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
function BSProWeekStrip({ goCalendar, dots, label = 'This week', selDay: selDayProp, onSelectDay }) {
  const t = useBS();
  const { todayIdx, dates } = bsProWeek();
  const [internalSel, setInternalSel] = useStateBSP(dates[todayIdx].getDate());
  const selDay = selDayProp != null ? selDayProp : internalSel;
  const setSelDay = onSelectDay || setInternalSel;
  const days = dates.map((d, i) => ({ d: d.getDate(), l: _BS_DOW_L[i], isToday: i === todayIdx, idx: i }));
  const selDate = dates.find(d => d.getDate() === selDay) || dates[todayIdx];
  const range = dates[0].getMonth() === dates[6].getMonth()
    ? `${_BS_MON[dates[0].getMonth()]} ${dates[0].getDate()}–${dates[6].getDate()}`
    : `${_BS_MON[dates[0].getMonth()]} ${dates[0].getDate()} – ${_BS_MON[dates[6].getMonth()]} ${dates[6].getDate()}`;
  return (
    <>
      <BSSection
        title={label}
        kicker={`${range} · ${_BS_MON[selDate.getMonth()]} ${selDate.getDate()}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', fontWeight: 800, color: t.INK, marginLeft: 'auto' }}>Month view →</span>}
      />
      <div style={{ padding: `0 ${t.padX}px 14px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderTop: `2px solid ${t.INK}`, paddingTop: 10 }}>
          {days.map((day) => {
            const on    = day.d === selDay;
            const today = day.isToday;
            const dd    = (dots && dots[day.idx]) || [];
            return (
              <button key={day.d} onClick={() => setSelDay(day.d)} style={{
                borderRadius: t.RADIUS_SM,
                border: `1px solid ${on ? t.INK : t.HAIR}`,
                background: on ? t.INK : (today ? t.PAPER2 : 'transparent'),
                color: on ? t.PAPER : t.INK,
                padding: '8px 0 6px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', fontWeight: 600, opacity: today && !on ? 1 : 0.7 }}>{day.l}</span>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{day.d}</span>
                <span style={{ display: 'flex', gap: 2, height: 4, marginTop: 2 }}>
                  {dd.slice(0, 3).map((c, k) => <span key={k} style={{ width: 3, height: 3, background: on ? t.PAPER : c }} />)}
                </span>
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
function BSTrainerApp({ onLogout, tweaks, setTweak }) {
  return <BSSheetProvider><BSTrainerAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} /></BSSheetProvider>;
}
function BSTrainerAppInner({ onLogout, tweaks, setTweak }) {
  const t = useBS();
  const sheet = useBSSheet();
  React.useEffect(() => { _bsHydrateProScore(); }, []);
  const [tab, setTab] = useStateBSP('today');
  const [showSettings, setShowSettings] = useStateBSP(false);
  const [showCalendar, setShowCalendar] = useStateBSP(false);
  const [showReviews, setShowReviews] = useStateBSP(false);
  const [showHabits, setShowHabits] = useStateBSP(false);
  const [storeView, setStoreView] = useStateBSP('store');
  const [programInitialTab, setProgramInitialTab] = useStateBSP('programs');
  const [queueView, setQueueView] = useStateBSP(null);
  const [liveWatch, setLiveWatch] = useStateBSP(null);
  const scoreProfile = SHAPE_SCORE_PROFILES?.trainer;
  const goRadio = () => setTab('radio');
  const goSettings = () => setShowSettings(true);
  const openHomeWidget = (action) => {
    if (action === 'reviews') { setShowReviews(true); return; }
    if (action === 'programs' || action === 'playlists') {
      setProgramInitialTab(action === 'playlists' ? 'playlists' : 'programs');
      setTab('programs');
      return;
    }
    if (action === 'pr') setQueueView('pr');
  };
  // MESSAGE button on a client profile → ensure the 1:1 conversation exists and
  // jump to the Chat tab, opening that exact thread.
  const [chatRequest, setChatRequest] = useStateBSP(null);
  React.useEffect(() => {
    const onMsg = async (e) => {
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
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="trainer" onProfile={goSettings} onBack={() => setShowCalendar(false)} />;
  if (showReviews) return <BSWorkoutReviewPage role="trainer" onBack={() => setShowReviews(false)} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setShowHabits(false)} onOpenScore={() => { setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="trainer" type={queueView} onBack={() => setQueueView(null)} />;
  if (liveWatch) return <BSProLiveWatch client={liveWatch.client} workout={liveWatch.workout} onBack={() => setLiveWatch(null)} />;
  const screens = {
    today:    <BSTrainerToday onProfile={goSettings} sheet={sheet} goCalendar={() => setShowCalendar(true)} goRadio={goRadio} onOpenReviews={() => setShowReviews(true)} onWidgetOpen={openHomeWidget} onOpenHabits={() => setShowHabits(true)} onOpenScore={() => { setStoreView('score'); setTab('store'); }} onWatchLive={(c) => setLiveWatch(c)} tweaks={tweaks} setTweak={setTweak} />,
    clients:  <BSTrainerClients sheet={sheet} />,
    console:  <BSProConsoleScreen role="trainer" />,
    programs: <BSTrainerPrograms sheet={sheet} initialTab={programInitialTab} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="trainer" openRequest={chatRequest} />,
    radio:    <BSRadioScreen onBack={() => setTab('today')} />,
    store:    storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => setTab('today')} onOpenScore={() => setStoreView('score')} />,
    me:       <BSProMe role="trainer" name="Jordan Chen" onLogout={onLogout} onSettings={goSettings} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      {/* Feed composer portals into this slot (see BSClientFeed). */}
      <div id="bs-composer-slot" style={{ position: 'absolute', left: 0, right: 0, bottom: 72, zIndex: 60, pointerEvents: 'none' }} />
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'clients',  label: 'Clients' },
        { key: 'programs', label: 'Plans' },
        { key: 'chat',     label: 'Chat' },
        { key: 'store',    label: 'Store' },
        { key: 'me',       label: 'Me' },
      ]} />
      <BSRadioPrompt />
    </div>
  );
}

function BSTrainerToday({ onProfile, sheet, goCalendar, goRadio, onOpenReviews, onWidgetOpen = () => {}, onOpenHabits = () => {}, onOpenScore = () => {}, onWatchLive = () => {}, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const [selDay, setSelDay] = useStateBSP(bsProWeek().dates[(new Date().getDay() + 6) % 7].getDate());
  const [ticker, setTicker] = useStateBSP(null);

  // Live ticker — pulled from /api/trainer/analytics so the masthead matches
  // the coach's actual roster, programs, and today's bookings.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/trainer/analytics', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d && d.isTrainer && d.ticker) setTicker(d.ticker); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Per-day bookings dataset. May 14 (today) is the full roster; other days lighter.
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
      { time: '10:00', tag: 'PRGM', tagColor: t.AMBER, title: 'Maya program',  sub: 'Final review · 1h block' },
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
  // Map each weekday to a demo dataset by its offset from today, so "today" is
  // always the busy roster (21) regardless of the real weekday.
  const { todayIdx, dates } = bsProWeek();
  const dataFor = (off) => off === 0 ? 21 : off > 0 ? [22, 23, 24][Math.min(off - 1, 2)] : [20, 25, 26][Math.min(-off - 1, 2)];
  const dataByIdx = dates.map((_, i) => dataFor(i - todayIdx));
  const selIdx = Math.max(0, dates.findIndex(d => d.getDate() === selDay));
  const selDate = dates[selIdx];
  const isToday = selIdx === todayIdx;
  const dataDay = dataByIdx[selIdx];
  const bookings = TRAINER_BOOKINGS[dataDay] || [];

  // Per-day lead. selDay 14 = today's narrative.
  const TRAINER_LEAD = {
    20: { count: '3', kicker: 'Mon · May 11',  copy: 'Light Monday — catch-up day for async reviews.' },
    21: { count: '8', kicker: "Lead · Today's roster", copy: "First at 7am. Two free hours at noon to write Maya's program." },
    22: { count: '2', kicker: 'Fri · May 15',  copy: 'Quiet day. Block out the morning for Maya.' },
    23: { count: '2', kicker: 'Sat · May 16',  copy: 'One live, one async. Easy build-up to Friday.' },
    24: { count: '2', kicker: 'Sun · May 17',  copy: 'Two heavy sessions — Casey & Quinn back-to-back area.' },
    25: { count: '0', kicker: 'Mon · May 18',  copy: 'Off day. Programming refresh on the docket.' },
    26: { count: '1', kicker: 'Tue · May 19',  copy: 'Open hours — drop-in consults only.' },
  };
  const lead = TRAINER_LEAD[dataDay] || TRAINER_LEAD[21];
  const leadKicker = isToday ? "Lead · Today's roster" : `${_BS_DOW[selIdx]} · ${_BS_MON[selDate.getMonth()]} ${selDate.getDate()}`;
  return (
    <BSPage>
      <BSMasthead
        title={<span className="bs-daily-title" style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span className="bs-daily-the" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>The</span>
          <span className="bs-daily-shape" style={{ display: 'inline-block', marginLeft: 8, marginRight: 10, fontFamily: "'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif", fontWeight: 300, fontStyle: 'normal', fontSize: 37, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)' }}>SHAPE</span>
          <span className="bs-daily-daily" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>Daily.</span>
        </span>}
        leftKicker={`${_BS_DOW[todayIdx]} · ${_BS_MON[dates[todayIdx].getMonth()]} ${dates[todayIdx].getDate()} · ${dates[todayIdx].getFullYear()}`}
        rightKicker="14 active clients"
        trailing={<BSAvatar init={bsMyInitials()} size={32} fill={bsMyTierColor()} ink={'#fff'} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.AMBER }}>
          Coaches Edition · No. {dates[todayIdx].getDate()}
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. I
        </span>
      </div>

      <BSTicker items={(() => {
        const tk = ticker || {};
        return [
          { label: 'BOOKED',  value: tk.bookedToday != null ? `${tk.bookedToday} SESN` : '8 SESN', note: 'TODAY' },
          { label: 'CLIENTS', value: tk.activeClients != null ? String(tk.activeClients) : '14', note: 'ACTIVE' },
          { label: 'ADHR',    value: tk.avgAdherencePct != null ? `${tk.avgAdherencePct}%` : '78%', color: '#a3e09a' },
          { label: 'PRGRM',   value: tk.programsCount != null ? String(tk.programsCount) : '12',  note: 'PUBLISHED' },
          { label: '7D LOG',  value: tk.workouts7d != null ? `${tk.workouts7d} WO` : '32 WO', note: 'ROSTER' },
        ];
      })()} />

      <div style={{
        padding: `10px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            { label: 'Today', meta: `${bookings.length} bookings`, active: true, onClick: () => {} },
            { label: 'Habits', meta: '1/3 done', accent: t.GREEN, onClick: () => onOpenHabits() },
            { label: 'Score', meta: '+8 pts', accent: t.ACCENT, onClick: () => onOpenScore() },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              style={{
                minWidth: 0,
                padding: '9px 8px 8px',
                borderRadius: t.RADIUS_SM,
                border: `1px solid ${item.active ? t.INK : (item.accent || t.RULE)}`,
                background: item.active ? t.INK : t.PAPER2,
                color: item.active ? t.PAPER : t.INK,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{
                display: 'block',
                fontFamily: t.MONO,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: item.active ? t.PAPER : (item.accent || t.INK),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.label}
              </span>
              <span style={{
                display: 'block',
                marginTop: 4,
                fontFamily: t.MONO,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: item.active ? t.PAPER : t.INK50,
                opacity: item.active ? 0.72 : 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.meta}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* NOW PLAYING — Shape Radio */}
      <BSNowPlaying onOpen={goRadio} />

      {/* THIS WEEK — trainer view, dots = booking density */}
      <BSProWeekStrip
        goCalendar={goCalendar}
        selDay={selDay}
        onSelectDay={setSelDay}
        dots={dataByIdx.map(dd => ({
          20: [t.RUST, t.RUST, t.BLUE],
          21: [t.RUST, t.RUST, t.RUST],
          22: [t.AMBER, t.GREEN],
          23: [t.RUST, t.BLUE],
          24: [t.RUST, t.RUST],
          25: [],
          26: [t.GREEN],
        }[dd] || []))}
      />

      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.AMBER}>{leadKicker}</BSEyebrow>
          <BSEyebrow>{isToday ? '09:42' : `${_BS_MON[selDate.getMonth()]} ${selDay}`}</BSEyebrow>
        </div>
        <BSHeadlineNumber value={lead.count} unit="SESSIONS" />
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: t.body + 1, color: t.INK70, lineHeight: 1.3, fontWeight: 500 }}>
          {lead.copy}
        </div>
      </div>

      {isToday && (
        <div style={{ padding: `4px ${t.padX}px 0` }}>
          <button onClick={() => onWatchLive({ client: 'Alex Rivera', workout: 'Upper Pull — Peak' })} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 16, border: `1px solid ${t.RUST}55`, background: `linear-gradient(150deg, ${t.RUST}24, ${t.RUST}08 50%, ${t.PAPER2} 90%), ${t.PAPER2}`, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <BSAvatar init="A" size={38} fill={t.RUST} ink={t.PAPER} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.RUST, fontWeight: 800 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: t.RUST, display: 'inline-block' }} /> Live now
              </div>
              <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>Alex Rivera is training</div>
              <div style={{ marginTop: 1, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>Upper Pull — Peak · set 3 of 4</div>
            </div>
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.RUST }}>Watch →</span>
          </button>
        </div>
      )}

      <BSSection
        title={isToday ? "Today's schedule" : `Schedule · ${_BS_MON[selDate.getMonth()]} ${selDay}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Open calendar →</span>}
      />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {bookings.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
            — Off day · nothing booked —
          </div>
        ) : (
          bookings.map((r, i) => <BSRow key={i} {...r} />)
        )}
      </div>

      {/* ── COACH'S LIFT CARD — today's flagship session preview ──── */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 18, background: t.PAPER2, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 10, borderBottom: `2px solid ${t.ACCENT}` }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.26em', color: t.ACCENT, textTransform: 'uppercase', fontWeight: 700 }}>Today · Block 3 / Wk 3</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, marginTop: 4, letterSpacing: '-0.01em' }}>Lower Push <span style={{ color: t.INK50, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em' }}>· 62 MIN · Casey M.</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50 }}>RPE</div>
            <div style={{ fontFamily: t.MONO, fontSize: 18, color: t.INK, fontWeight: 700 }}>8.0</div>
          </div>
        </div>
        <div style={{ padding: '10px 0 4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 30px 56px 42px 36px', gap: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, padding: '0 2px 4px', borderBottom: `1px dashed ${t.SURFACE_BORDER}` }}>
            <span>Lift</span><span style={{ textAlign: 'center' }}>SET</span><span style={{ textAlign: 'right' }}>LOAD</span><span style={{ textAlign: 'right' }}>REPS</span><span style={{ textAlign: 'right' }}>RPE</span>
          </div>
          {[
            { lift: 'Back Squat', set: '3', load: '255', reps: '5', rpe: '8.5' },
            { lift: 'Romanian DL', set: '3', load: '215', reps: '8', rpe: '8' },
            { lift: 'Split Squat', set: '2', load: '65',  reps: '10', rpe: '7.5' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 30px 56px 42px 36px', gap: 6, alignItems: 'center', padding: '7px 2px', borderBottom: i === 2 ? 'none' : `1px dotted ${t.SURFACE_BORDER}` }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK, letterSpacing: '-0.005em' }}>{r.lift}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.ACCENT, textAlign: 'center', fontWeight: 700 }}>{r.set}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK, textAlign: 'right' }}>{r.load}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, textAlign: 'right' }}>{r.reps}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.ACCENT, textAlign: 'right' }}>{r.rpe}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <BSProHomeWidgets role="trainer" onOpen={onWidgetOpen} />
      </div>
      <BSReviewQueueCard role="trainer" onOpen={onOpenReviews} />

      <BSFooter left="The Coach Edition" right="Pg 1 of 4" />
    </BSPage>
  );
}

function BSProClientsTabBar({ active, onChange, role = 'trainer' }) {
  const t = useBS();
  const tabs = [
    { k: 'roster',   l: 'Roster' },
    { k: 'console',  l: 'Console' },
    { k: 'analysis', l: 'Analysis' },
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
            borderRight: tb.k !== 'analysis' ? `1px solid ${t.RULE}` : 'none',
          }}>{tb.l}</button>
        );
      })}
    </div>
  );
}

function BSProAnalyticsScreen({ role = 'trainer' }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.ACCENT;
  const kpis = isNutri ? [
    { l: 'Active clients',    v: '14',     d: '+2 this mo' },
    { l: 'Adherence avg',     v: '78%',    d: '+4pt vs last mo' },
    { l: 'Plans delivered',   v: '52',     d: 'this month' },
    { l: 'Avg consult value', v: '$220',   d: '8 consults / wk' },
    { l: 'MRR',               v: '$4,180', d: '+9% w/w' },
    { l: 'Retention 90d',     v: '92%',    d: 'cohort May' },
  ] : [
    { l: 'Active clients',  v: '14',     d: '+2 this mo' },
    { l: 'Sessions kept',   v: '147',    d: 'this month' },
    { l: 'RPE on target',   v: '11/14',  d: 'last week' },
    { l: 'PRs logged',      v: '6',      d: 'this month' },
    { l: 'MRR',             v: '$3,520', d: '+6.4% w/w' },
    { l: 'Retention 90d',   v: '89%',    d: 'cohort May' },
  ];
  return (
    <>
      <BSSection title={`Analysis · last 30 days`} meta={isNutri ? 'Nutrition KPIs' : 'Training KPIs'} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: t.RULE, border: `1px solid ${t.RULE}`, marginTop: 14 }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ background: t.PAPER, padding: '14px 12px' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{k.l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 600, color: t.INK, letterSpacing: '-0.02em', marginTop: 6, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: accent, letterSpacing: '0.08em', marginTop: 6 }}>{k.d}</div>
            </div>
          ))}
        </div>
        <BSSection title="Trendline" meta="Weekly volume" />
        <svg viewBox="0 0 320 80" style={{ width: '100%', height: 80, marginTop: 8 }}>
          <polyline points="6,62 50,54 94,58 138,42 182,46 226,28 270,34 314,18" stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="6,62 50,54 94,58 138,42 182,46 226,28 270,34 314,18 314,80 6,80" fill={accent} fillOpacity="0.12" stroke="none" />
        </svg>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, display: 'flex', justifyContent: 'space-between' }}>
          <span>W{(new Date().getMonth()*4)-2}</span><span>W{(new Date().getMonth()*4)+5}</span>
        </div>
      </div>
    </>
  );
}

const BS_ROSTER_FILTERS = {
  trainer: [
    { k: 'all', label: 'ALL' }, { k: 'ontrack', label: 'ON TRACK' }, { k: 'eyes', label: 'NEEDS EYES' },
    { k: 'new', label: 'NEW' }, { k: 'cut', label: 'CUT' }, { k: 'build', label: 'BUILD' }, { k: 'peak', label: 'PEAK' },
  ],
  nutritionist: [
    { k: 'all', label: 'ALL' }, { k: 'ontrack', label: 'ON TRACK' }, { k: 'eyes', label: 'NEEDS EYES' },
    { k: 'new', label: 'NEW' }, { k: 'cut', label: 'CUT' }, { k: 'build', label: 'BUILD' },
  ],
};
function bsClientMatchesFilter(c, key, role) {
  if (key === 'all') return true;
  const r = (c.r || '').toUpperCase();
  if (key === 'new') return r.includes('INTAKE') || c.d === 'NEW' || c.s === 'onboard';
  if (key === 'cut') return r.startsWith('CUT');
  if (key === 'build') return r.startsWith('BUILD');
  if (key === 'peak') return r.startsWith('PEAK');
  if (role === 'nutritionist') {
    if (key === 'ontrack') return c.good === true || c.s === 'on track';
    if (key === 'eyes') return c.warn === true || c.s === 'review form' || c.s === 'missed';
  } else {
    if (key === 'ontrack') return c.s === 'on track';
    if (key === 'eyes') return c.s === 'review form' || c.s === 'deload soon' || c.s === 'missed';
  }
  return false;
}
function bsClientMatchesQuery(c, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (c.n || '').toLowerCase().includes(q) || (c.prog || '').toLowerCase().includes(q) || (c.r || '').toLowerCase().includes(q);
}
function BSProStatusPill({ s }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const gold = '#d8b25a';
  const map = {
    'on track': ['ON TRACK', teal],
    'review form': ['NEEDS EYES', gold],
    'deload soon': ['DELOAD', t.RUST],
    'onboard': ['NEW', gold],
    'missed': ['MISSED', t.RUST],
    'pr': ['PR', teal],
    'past': ['PAST', t.INK50],
  };
  const [label, color] = map[s] || ['ACTIVE', t.INK50];
  return <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', color, border: `1px solid ${color}`, borderRadius: 999, padding: '5px 9px', whiteSpace: 'nowrap' }}>{label}</span>;
}
// Card-based coach roster — header, search, scrollable filter pills (scrollbar
// hidden via .bs-hide-scroll), an Active/Past toggle, and tappable client cards.
function BSProRosterView({ role = 'trainer', clients, activeCount, pastCount, totalCount, newThisMonth = 3, roster, setRoster, query, setQuery, filter, setFilter, onOpen, footerLeft, footerRight }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const filters = BS_ROSTER_FILTERS[role] || BS_ROSTER_FILTERS.trainer;
  return (
    <BSPage>
      <div style={{ padding: `46px ${t.padX}px 24px` }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: teal }}>{activeCount} ACTIVE · +{newThisMonth} THIS MONTH</div>
            <div style={{ marginTop: 8, fontFamily: t.SERIF, fontSize: 40, fontWeight: 600, color: t.INK, lineHeight: 0.98, letterSpacing: '-0.02em' }}>Your<br /><span style={{ fontStyle: 'italic', color: teal }}>clients.</span></div>
          </div>
          <button onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:proAddClient', { detail: { role } })); } catch (e) {} }} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 18, fontWeight: 400, cursor: 'pointer', lineHeight: 1 }}>+</button>
        </div>
        {/* Search */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 9, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '12px 14px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${totalCount} clients`} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14 }} />
        </div>
        {/* Filter pills — wrap to fit the frame (no off-screen overflow) */}
        <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {filters.map(f => {
            const on = filter === f.k;
            return <button key={f.k} onClick={() => setFilter(f.k)} style={{ borderRadius: 999, padding: '8px 13px', cursor: 'pointer', border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}1c` : 'transparent', color: on ? teal : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{f.label}</button>;
          })}
        </div>
        {/* Active / Past toggle */}
        <div style={{ marginTop: 11, display: 'flex', gap: 6 }}>
          {[['active', `Active · ${activeCount}`], ['past', `Past · ${pastCount}`]].map(([k, label]) => {
            const on = roster === k;
            return <button key={k} onClick={() => setRoster(k)} style={{ flex: 1, borderRadius: 999, padding: '9px 6px', cursor: 'pointer', border: `1px solid ${on ? t.INK : t.RULE}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</button>;
          })}
        </div>
        {/* Client cards */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clients.length === 0 && (
            <div style={{ padding: '22px 16px', borderRadius: 16, border: `1px dashed ${t.RULE}`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>No matching clients.</div>
          )}
          {clients.map((c, i) => {
            const subtitle = `${c.prog || (c.r || '').split('·')[0].trim()}${c.streak != null ? ` · ${c.streak}d streak` : ''}`;
            return (
              <button key={i} onClick={() => onOpen(c)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 13, alignItems: 'center', borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '15px 15px' }}>
                <BSAvatar init={c.i} fill={c.c} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.SERIF, fontSize: 18, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{c.n}</div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: t.INK50, lineHeight: 1.35 }}>{subtitle}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BSProStatusPill s={c.s} />
                  <span style={{ color: t.INK50, fontSize: 16, lineHeight: 1 }}>›</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <BSFooter left={footerLeft} right={footerRight} />
    </BSPage>
  );
}
function BSTrainerClients() {
  const t = useBS();
  const [previewClient, setPreviewClient] = useStateBSP(null);
  const [fullClient, setFullClient] = useStateBSP(null);
  const [roster, setRoster] = useStateBSP('active'); // 'active' | 'past'
  const [cQuery, setCQuery] = useStateBSP('');
  const [cFilter, setCFilter] = useStateBSP('all');
  const COACH_CLIENTS = [
    { i: 'S', c: t.GREEN,  n: 'Sofia Martinez', prog: 'Hypertrophy',        streak: 14, r: 'BUILD · W6',  d: 'JUST NOW', s: 'on track',    active: true },
    { i: 'A', c: t.RUST,   n: 'Alex Rivera',    prog: 'Push / Pull / Legs', streak: 8,  r: 'CUT · W6',    d: '2H AGO',   s: 'on track',    active: true },
    { i: 'P', c: '#8a5cf6',n: 'Priya Singh',    prog: 'Fat Loss 101',       streak: 0,  r: 'CUT · W3',    d: '3D AGO',   s: 'missed',      active: true },
    { i: 'M', c: t.AMBER,  n: 'Marcus Lee',     prog: 'Intro Block',        streak: 3,  r: 'INTAKE',      d: 'NEW',      s: 'onboard',     active: true },
    { i: 'J', c: t.BLUE,   n: 'Jamal Green',    prog: 'Strength',           streak: 21, r: 'PEAK · W11',  d: '1D AGO',   s: 'pr',          active: true },
    { i: 'R', c: t.AMBER,  n: 'Riley Kim',      prog: 'Cut Block',          streak: 6,  r: 'CUT · W8',    d: '1D AGO',   s: 'review form', active: true },
    { i: 'Q', c: t.BLUE,   n: 'Quinn Choi',     prog: 'Build Phase',        streak: 11, r: 'BUILD · W2',  d: '3D AGO',   s: 'on track',    active: true },
    { i: 'B', c: t.INK50,  n: 'Bailey Cruz',    prog: 'Finished block',     streak: 0,  r: 'PAST · finished block', d: '6W AGO', s: 'past', active: false },
    { i: 'T', c: t.INK50,  n: 'Taylor Reed',    prog: 'Paused',             streak: 0,  r: 'PAST · paused', d: '3M AGO', s: 'past',        active: false },
  ];
  const shownClients = COACH_CLIENTS
    .filter(c => roster === 'active' ? c.active : !c.active)
    .filter(c => bsClientMatchesFilter(c, cFilter, 'trainer'))
    .filter(c => bsClientMatchesQuery(c, cQuery));
  const activeCount = COACH_CLIENTS.filter(c => c.active).length;
  const pastCount = COACH_CLIENTS.length - activeCount;
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
      newThisMonth={3}
      roster={roster}
      setRoster={setRoster}
      query={cQuery}
      setQuery={setCQuery}
      filter={cFilter}
      setFilter={setCFilter}
      onOpen={(c) => setFullClient(c)}
      footerLeft="The Coach Edition"
      footerRight="Clients"
    />
  );
}

function BSProClientPreviewPage({ client, onBack, onViewFullProfile }) {
  const t = useBS();
  if (!client) return null;
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Roster" title={<>Client<br/>preview.</>} trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, alignItems: 'center', padding: `${t.rowY + 6}px 0`, borderBottom: `1px solid ${t.HAIR}` }}>
          <BSAvatar init={client.i} fill={client.c} size={36} />
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK }}>{client.n}</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{client.r}</div>
          </div>
        </div>
        <div style={{ padding: `${t.rowY + 8}px 0`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10 }}>
            <BSEyebrow>Last seen</BSEyebrow>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{client.d || '—'}</div>
          </div>
          <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10 }}>
            <BSEyebrow>Status</BSEyebrow>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{client.s || 'On track'}</div>
          </div>
          <div style={{ borderLeft: `1px solid ${t.RULE}`, paddingLeft: 10 }}>
            <BSEyebrow>Tier</BSEyebrow>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, color: t.INK }}>{(client.r || '').split('·')[0]?.trim() || 'Build'}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: `12px ${t.padX}px 18px` }}>
        <button onClick={onViewFullProfile} style={{ width: '100%', border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '12px 14px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 900 }}>
          View full profile →
        </button>
      </div>
      <BSFooter left="Client preview" right={client.n} />
    </BSPage>
  );
}

// ── Shared chrome for the coach action pages (Adjust program / Schedule) ──────
function bsProAccent(t, role) { return role === 'nutritionist' ? '#d8b25a' : (t.isLight ? '#0a8f87' : '#34d6c5'); }
function BSProActionHead({ eyebrow, titleA, titleB, accent, onBack }) {
  const t = useBS();
  return (
    <div style={{ paddingTop: 50 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{eyebrow}</div>
        <button onClick={onBack} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>← BACK</button>
      </div>
      <div style={{ marginTop: 10, fontFamily: t.SERIF, fontSize: 40, fontWeight: 600, color: t.INK, lineHeight: 0.98, letterSpacing: '-0.02em' }}>{titleA}<br /><span style={{ fontStyle: 'italic', color: accent }}>{titleB}</span></div>
    </div>
  );
}
function BSProClientMini({ client }) {
  const t = useBS();
  if (!client) return null;
  const prog = client.prog || (client.r || '').split('·')[0].trim() || 'Program';
  return (
    <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '14px 15px' }}>
      <BSAvatar init={client.i} fill={client.c} size={40} />
      <div>
        <div style={{ fontFamily: t.SERIF, fontSize: 17, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{client.n}</div>
        <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: t.INK50 }}>{prog} · Week 6 of 12</div>
      </div>
    </div>
  );
}
function BSProActionSec({ eyebrow, title, trailing, accent }) {
  const t = useBS();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
      <div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{eyebrow}</div>
        <div style={{ marginTop: 5, fontFamily: t.SERIF, fontSize: 25, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1 }}>{title}</div>
      </div>
      {trailing && <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: accent, paddingBottom: 3, whiteSpace: 'nowrap' }}>{trailing}</div>}
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
        <span style={{ fontFamily: t.SERIF, fontSize: 26, fontWeight: 600, color: t.INK, minWidth: 24, textAlign: 'center' }}>{value}{unit}</span>
        {rnd('+', () => set(Math.min(max, value + step))) }
      </div>
    </div>
  );
}

function BSProAdjustProgram({ client, role = 'trainer', clientUid, onBack }) {
  const t = useBS();
  const accent = bsProAccent(t, role);
  const isNutri = role === 'nutritionist';
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const gold = '#d8b25a';
  const rust = t.RUST;
  const first = (client?.n || 'there').split(' ')[0];
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
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  // Trainer derived
  const intensityDesc = { deload: 'Pull volume back ~40% and cap intensity. Recover and resensitize.', maintain: 'Hold volume and loads — keep the engine ticking, no new stress.', progress: 'Add a set to main lifts and nudge top-set loads. Keep RPE ≤ 8.' }[intensity];
  const focusOpts = [{ k: 'strength', l: 'Strength' }, { k: 'hypertrophy', l: 'Hypertrophy' }, { k: 'conditioning', l: 'Conditioning' }, { k: 'mobility', l: 'Mobility' }, { k: 'power', l: 'Power' }];
  const toggleFocus = (k) => setFocus(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  const cycleDay = (i) => setDays(d => d.map((v, j) => j === i ? DAY_OPTS[(DAY_OPTS.indexOf(v) + 1) % DAY_OPTS.length] : v));
  const focusLabel = focus.map(k => focusOpts.find(o => o.k === k)?.l.toLowerCase()).filter(Boolean).join(' + ') || 'general fitness';
  const verb = intensity === 'progress' ? 'progressing top sets' : intensity === 'deload' ? 'deloading this week' : 'maintaining volume';
  // Nutritionist derived
  const restrictOpts = [{ k: 'vegetarian', l: 'Vegetarian' }, { k: 'dairy-light', l: 'Dairy-light' }, { k: 'gluten-free', l: 'Gluten-free' }, { k: 'egg-free', l: 'Egg-free' }, { k: 'nut-free', l: 'Nut-free' }, { k: 'halal', l: 'Halal' }];
  const toggleRestrict = (k) => setRestrictions(r => r.includes(k) ? r.filter(x => x !== k) : [...r, k]);
  const kcalFromMacros = protein * 4 + carbs * 4 + fat * 9;
  const kcalDiff = kcalFromMacros - calories;
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9, mTot = (pK + cK + fK) || 1;

  const autoNote = isNutri
    ? `Updated your plan to ${calories} kcal — ${protein}g protein, ${carbs}g carbs, ${fat}g fat across ${meals} meals.${refeed ? ' Keeping the weekend refeed to support training.' : ''} New targets are live in your Eat tab.`
    : `Adjusting your block: ${sessions}×/week, ${verb}. Focus stays on ${focusLabel}. Check the updated split in your Train tab.`;
  const body = noteText == null ? autoNote : noteText;
  const apply = async (notify) => {
    setStatus('saving');
    try {
      if (clientUid && window.ShapeMessages?.getOrCreateMemberConversation) {
        const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: clientUid });
        const cid = conv?.data;
        if (cid && window.ShapeMessages?.sendMessage) await window.ShapeMessages.sendMessage({ conversationId: cid, body, metadata: { kind: isNutri ? 'plan_update' : 'program_update', notify: !!notify } });
      }
      setStatus('done');
      setTimeout(onBack, 950);
    } catch (e) { setStatus('error'); }
  };
  const cta = (txt, onClick, mt) => (
    <button onClick={onClick} disabled={status === 'saving' || status === 'done'} style={{ width: '100%', marginTop: mt || 0, borderRadius: 14, border: 0, background: accent, color: '#06231f', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: status === 'saving' ? 0.6 : 1 }}>{txt}</button>
  );
  const sendLabel = status === 'saving' ? 'Sending…' : status === 'done' ? 'Sent ✓' : 'Apply & Send →';

  const trainerBody = (
    <>
      <div>
        <BSProActionSec eyebrow="THIS WEEK" title="Intensity" accent={accent} />
        <BSProSegment options={[{ k: 'deload', l: 'Deload' }, { k: 'maintain', l: 'Maintain' }, { k: 'progress', l: 'Progress' }]} value={intensity} onPick={setIntensity} accent={accent} />
        <div style={{ marginTop: 14, fontFamily: t.SERIF, fontSize: 14.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.5 }}>{intensityDesc}</div>
      </div>
      <div>
        <BSProActionSec eyebrow="STRUCTURE" title="Frequency & block" accent={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BSProStepper label="SESSIONS / WEEK" sub="Per microcycle" value={sessions} set={setSessions} min={1} max={7} accent={accent} />
          <BSProStepper label="WEEKS REMAINING" sub="Until next review" value={weeks} set={setWeeks} min={1} max={16} accent={accent} />
        </div>
      </div>
      <div>
        <BSProActionSec eyebrow="EMPHASIS" title="Focus" accent={accent} />
        <BSProChips options={focusOpts} value={focus} multi onPick={toggleFocus} accent={accent} />
      </div>
      <div>
        <BSProActionSec eyebrow="WEEKLY SPLIT" title="Training days" trailing="TAP TO CHANGE →" accent={accent} />
        {days.map((label, i) => {
          const rest = label === 'Rest';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 10, alignItems: 'center', padding: '13px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: rest ? t.INK50 : accent }}>{DOW[i]}</span>
              <span style={{ fontFamily: t.SERIF, fontSize: 16, fontWeight: 600, color: rest ? t.INK50 : t.INK }}>{label}</span>
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
        <BSProActionSec eyebrow="ENERGY" title="Calorie target" accent={accent} />
        <BSProStepper label="DAILY CALORIES" sub="kcal / day" value={calories} set={setCalories} min={1000} max={5000} step={50} accent={accent} />
      </div>
      <div>
        <BSProActionSec eyebrow="MACROS" title="Daily split" accent={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BSProStepper label="PROTEIN" sub="" value={protein} set={setProtein} min={0} max={400} step={5} unit="g" accent={teal} />
          <BSProStepper label="CARBS" sub="" value={carbs} set={setCarbs} min={0} max={600} step={5} unit="g" accent={gold} />
          <BSProStepper label="FAT" sub="" value={fat} set={setFat} min={0} max={250} step={2} unit="g" accent={rust} />
          <div style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '13px 15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: accent }}>FROM MACROS</span>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50 }}>{kcalFromMacros.toLocaleString()} kcal · <span style={{ color: kcalDiff < 0 ? rust : teal }}>{kcalDiff >= 0 ? '+' : ''}{kcalDiff} vs target</span></span>
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
        <BSProActionSec eyebrow="STRUCTURE" title="Meals & refeeds" accent={accent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BSProStepper label="MEALS / DAY" sub="" value={meals} set={setMeals} min={1} max={8} accent={accent} />
          <button onClick={() => setRefeed(r => !r)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '15px 16px', cursor: 'pointer', textAlign: 'left' }}>
            <div>
              <div style={{ fontFamily: t.SERIF, fontSize: 16, fontWeight: 600, color: t.INK }}>Weekend refeed</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>+40g carbs on training days</div>
            </div>
            <span style={{ width: 42, height: 24, borderRadius: 999, padding: 3, flexShrink: 0, border: `1px solid ${refeed ? accent : t.RULE}`, background: refeed ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: refeed ? 'flex-end' : 'flex-start' }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, background: refeed ? '#06231f' : t.INK50, display: 'block' }} />
            </span>
          </button>
        </div>
      </div>
      <div>
        <BSProActionSec eyebrow="CONSTRAINTS" title="Restrictions" accent={accent} />
        <BSProChips options={restrictOpts} value={restrictions} multi onPick={toggleRestrict} accent={accent} />
      </div>
    </>
  );

  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        <BSProActionHead eyebrow={isNutri ? 'ADJUST PLAN' : 'ADJUST PROGRAM'} titleA="Tune the" titleB={isNutri ? 'plan.' : 'program.'} accent={accent} onBack={onBack} />
        <BSProClientMini client={client} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 26 }}>
          {isNutri ? nutriBody : trainerBody}
          <div>
            <BSProActionSec eyebrow="MESSAGE" title={`Note to ${first}`} accent={accent} />
            <textarea value={body} onChange={(e) => setNoteText(e.target.value)} rows={4} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: 14, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
            <div style={{ marginTop: 14 }}>
              {cta(sendLabel, () => apply(false))}
              {cta('Apply & Notify →', () => apply(true), 10)}
            </div>
            {status === 'error' && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST, letterSpacing: '0.08em' }}>Couldn't send — try again.</div>}
            {!clientUid && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Demo client · sends once linked to a live member</div>}
          </div>
        </div>
      </div>
      <BSFooter left={isNutri ? 'Adjust plan' : 'Adjust program'} right={client?.n} />
    </BSPage>
  );
}

function BSProScheduleSession({ client, role = 'trainer', clientUid, onBack }) {
  const t = useBS();
  const accent = bsProAccent(t, role);
  const isNutri = role === 'nutritionist';
  const first = (client?.n || 'there').split(' ')[0];
  const TYPES = isNutri
    ? [{ k: 'consult', l: 'Consult' }, { k: 'plan', l: 'Plan delivery' }, { k: 'review', l: 'Food-log review' }, { k: 'intro', l: 'Intro call' }]
    : [{ k: 'session', l: 'Session' }, { k: 'checkin', l: 'Check-in' }, { k: 'review', l: 'Form review' }, { k: 'intro', l: 'Intro call' }];
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
    ? [{ k: 'zoom', l: 'Zoom' }, { k: 'call', l: 'Call' }, { k: 'inperson', l: 'In-person' }]
    : [{ k: 'zoom', l: 'Zoom' }, { k: 'gym', l: 'Gym' }, { k: 'call', l: 'Call' }, { k: 'inperson', l: 'In-person' }];
  const kindMap = { session: 'SESSION', consult: 'CONSULT', plan: 'PLAN', checkin: 'CHECKIN', review: 'REVIEW', intro: 'CONSULT' };
  const typeLabel = TYPES.find(x => x.k === type)?.l || 'Session';
  const modeLabel = modeOpts.find(m => m.k === mode)?.l || 'Zoom';
  const dateStr = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`;
  const summaryWhen = `${WD[sel.getDay()]} ${MON[sel.getMonth()]} ${sel.getDate()} · ${time} · ${duration} min · ${modeLabel}`;
  const add = async () => {
    setStatus('saving');
    try {
      if (clientUid && window.ShapeCalendar?.create) {
        await window.ShapeCalendar.create({ userId: clientUid, kind: kindMap[type] || 'SESSION', title: `${typeLabel} · ${first}`, sub: repeat ? `${modeLabel} · weekly` : modeLabel, date: dateStr, time, durationMin: duration, with: client?.n, location: modeLabel });
      }
      setStatus('done');
      setTimeout(onBack, 950);
    } catch (e) { setStatus('error'); }
  };
  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        <BSProActionHead eyebrow="SCHEDULE" titleA="Book a" titleB={isNutri ? 'consult.' : 'session.'} accent={accent} onBack={onBack} />
        <BSProClientMini client={client} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 26 }}>
          <div>
            <BSProActionSec eyebrow="WHAT" title="Session type" accent={accent} />
            <BSProChips options={TYPES} value={type} onPick={setType} accent={accent} />
          </div>
          <div>
            <BSProActionSec eyebrow="WHEN" title="Pick a day" accent={accent} />
            <div className="bs-hide-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {dayCells.map((d, i) => {
                const on = dayIdx === i;
                return (
                  <button key={i} onClick={() => setDayIdx(i)} style={{ flexShrink: 0, width: 52, borderRadius: 12, padding: '10px 0', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, textAlign: 'center' }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: on ? accent : t.INK50 }}>{WD[d.getDay()]}</div>
                    <div style={{ marginTop: 4, fontFamily: t.SERIF, fontSize: 20, fontWeight: 600, color: t.INK }}>{d.getDate()}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <BSProActionSec eyebrow="TIME" title="Open slots" accent={accent} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {times.map(tm => {
                const on = time === tm;
                return <button key={tm} onClick={() => setTime(tm)} style={{ borderRadius: 12, padding: '12px 0', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : t.PAPER2, color: on ? accent : t.INK, fontFamily: t.MONO, fontSize: 11, fontWeight: 700 }}>{tm}</button>;
              })}
            </div>
          </div>
          <div>
            <BSProActionSec eyebrow="HOW LONG" title="Duration" accent={accent} />
            <BSProSegment options={[{ k: 30, l: '30 min' }, { k: 45, l: '45 min' }, { k: 60, l: '60 min' }]} value={duration} onPick={setDuration} accent={accent} />
          </div>
          <div>
            <BSProActionSec eyebrow="WHERE" title="Mode" accent={accent} />
            <BSProChips options={modeOpts} value={mode} onPick={setMode} accent={accent} />
          </div>
          <button onClick={() => setRepeat(r => !r)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '15px 16px', cursor: 'pointer', textAlign: 'left' }}>
            <div>
              <div style={{ fontFamily: t.SERIF, fontSize: 16, fontWeight: 600, color: t.INK }}>Repeat weekly</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>Every {WD[sel.getDay()]} at {time}</div>
            </div>
            <span style={{ width: 42, height: 24, borderRadius: 999, padding: 3, flexShrink: 0, border: `1px solid ${repeat ? accent : t.RULE}`, background: repeat ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: repeat ? 'flex-end' : 'flex-start' }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, background: repeat ? '#06231f' : t.INK50, display: 'block' }} />
            </span>
          </button>
          <div>
            <BSProActionSec eyebrow="SUMMARY" title="The booking" accent={accent} />
            <div style={{ borderRadius: 16, border: `1px solid ${accent}44`, background: `linear-gradient(150deg, ${accent}16, ${t.PAPER2} 80%), ${t.PAPER2}`, padding: 16 }}>
              <div style={{ fontFamily: t.SERIF, fontSize: 19, fontWeight: 600, color: t.INK }}>{typeLabel} · <span style={{ fontStyle: 'italic', color: accent }}>{first}</span></div>
              <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: accent }}>{summaryWhen}</div>
            </div>
            <button onClick={add} disabled={status === 'saving' || status === 'done'} style={{ width: '100%', marginTop: 14, borderRadius: 14, border: 0, background: accent, color: '#06231f', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: status === 'saving' ? 0.6 : 1 }}>{status === 'saving' ? 'Adding…' : status === 'done' ? 'Added ✓' : 'Add to calendar →'}</button>
            {status === 'error' && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, color: t.RUST, letterSpacing: '0.08em' }}>Couldn't add — try again.</div>}
            {!clientUid && <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Demo client · books once linked to a live member</div>}
          </div>
        </div>
      </div>
      <BSFooter left="Schedule" right={client?.n} />
    </BSPage>
  );
}

function BSProClientFullProfilePage({ client, onBack, role = 'trainer' }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const isNutri = role === 'nutritionist';
  const [phase, setPhase] = useStateBSP({ trainingPhase: 'Build', nutritionPhase: 'Cut' });
  // Real per-client store when the row carries a user id (uuid); otherwise the
  // selector is local (demo roster has mock clients).
  const clientUid = client && (client.userId || client.user_id || (typeof client.id === 'string' && client.id.includes('-') ? client.id : null));
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
  const [view, setView] = useStateBSP('profile'); // 'profile' | 'analysis'
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
  const setPhaseKey = (key, val) => {
    setPhase(prev => ({ ...prev, [key]: val }));
    if (clientUid) { try { window.ShapeProgramApi?.set?.({ userId: clientUid, [key]: val }); } catch (e) {} }
  };
  const phaseRow = (key, label, opts) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {opts.map(o => {
          const on = phase[key] === o;
          return <button key={o} onClick={() => setPhaseKey(key, o)} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}1c` : 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{o}</button>;
        })}
      </div>
    </div>
  );
  if (!client) return null;
  if (showAdjustPage) return <BSProAdjustProgram client={client} role={role} clientUid={clientUid} onBack={() => setShowAdjustPage(false)} />;
  if (showSchedulePage) return <BSProScheduleSession client={client} role={role} clientUid={clientUid} onBack={() => setShowSchedulePage(false)} />;

  // ---- theme + derived facts ----
  const accent = isNutri ? '#d8b25a' : teal;   // gold for nutrition, teal for training
  const gold = '#d8b25a';
  const rust = t.RUST;
  const nm = (client.n || '').trim().split(/\s+/);
  const first = nm[0] || client.n || 'Client';
  const last = nm.slice(1).join(' ');
  const isPast = client.s === 'past' || client.active === false;
  const statusLabel = isPast ? 'PAST' : client.warn ? 'WATCH' : isNutri ? 'STRONG' : 'ON TRACK';
  const phaseUp = (isNutri ? (phase.nutritionPhase || 'Cut') : (phase.trainingPhase || 'Build')).toUpperCase();
  const headEyebrow = isNutri ? `${phaseUp} · 2100 KCAL` : `${phaseUp} · WEEK 6 OF 12`;
  const sinceLabel = isNutri ? 'Since Feb 2026 · 19d streak' : 'Since Jan 2026 · 14d streak';

  // Live weigh-ins (share-gated) drive the body chart; else illustrative demo.
  const liveW = (cGoals && cGoals.share !== false && cGoals.overall && Array.isArray(cGoals.overall.weighIns))
    ? cGoals.overall.weighIns.map(x => Number(x.kg)).filter(Number.isFinite) : [];
  const bwUnit = (cGoals && cGoals.overall && cGoals.overall.unit) || 'kg';
  const bwSeries = liveW.length >= 2 ? liveW : (isNutri
    ? [80.4, 80.1, 79.9, 79.7, 79.6, 79.4, 79.3, 79.2]
    : [64.4, 64.6, 65.0, 64.6, 64.3, 64.1, 63.9, 63.8]);
  const bwNow = bwSeries[bwSeries.length - 1];
  const bwDelta = +(bwNow - bwSeries[0]).toFixed(1);
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
    const when = d && !isNaN(d) ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
    const st = r.status === 'completed' ? 'Completed' : r.status === 'requested' ? 'Requested' : 'Confirmed';
    const mins = r.durationMin ? ` · ${r.durationMin} min` : '';
    return { n: r.title || 'Session', s: `${st}${mins}`, d: when };
  }) : null;
  // Strength rollup (key lifts, PRs, avg RPE) — best-effort, demo fallback.
  const L = cLifts || {};
  const avgRpe = lnum(L.avgRpe);
  const prs = lnum(L.prs);
  const liftRows = Array.isArray(L.keyLifts) && L.keyLifts.length ? (() => {
    const best = L.keyLifts.map(x => lnum(x.best)).filter(v => v != null);
    const mx = best.length ? Math.max(...best) : 1;
    return L.keyLifts.map(x => {
      const b = lnum(x.best), dl = lnum(x.delta);
      return { n: x.name || 'Lift', v: b != null ? `${b} kg` : '—', d: dl != null ? `${dl >= 0 ? '+' : ''}${dl}` : '—', p: b != null && mx ? Math.max(0.2, b / mx) : 0.5 };
    });
  })() : null;

  // ---- presentational helpers ----
  const Section = ({ eyebrow, title, trailing, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
      <div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: color || accent }}>{eyebrow}</div>
        <div style={{ marginTop: 5, fontFamily: t.SERIF, fontSize: 25, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1 }}>{title}</div>
      </div>
      {trailing && <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: accent, whiteSpace: 'nowrap', paddingBottom: 3 }}>{trailing}</div>}
    </div>
  );
  const lineChart = (series, color, h = 64) => {
    const vals = series.map(Number).filter(Number.isFinite);
    if (vals.length < 2) return null;
    const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1, n = vals.length, W = 320, H = h;
    const pts = vals.map((v, i) => [(i / (n - 1)) * W, H - 6 - ((v - mn) / span) * (H - 16)]);
    const ln = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const lp = pts[pts.length - 1];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <path d={`${ln} L${W},${H} L0,${H} Z`} fill={`${color}1f`} />
        <path d={ln} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={lp[0]} cy={lp[1]} r="3.5" fill={color} />
      </svg>
    );
  };
  const StatCard = ({ label, labelColor, big, small, sub }) => (
    <div style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '13px 14px' }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: labelColor || accent }}>{label}</div>
      <div style={{ marginTop: 6, fontFamily: t.SERIF, fontSize: 27, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1 }}>{big}{small && <span style={{ fontSize: 14, color: t.INK50, fontFamily: t.MONO, marginLeft: 1 }}>{small}</span>}</div>
      {sub && <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{sub}</div>}
    </div>
  );
  const numberedList = (items) => items.map((it, i) => (
    <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center', padding: '13px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
      <div>
        <div style={{ fontFamily: t.SERIF, fontSize: 15.5, fontWeight: 600, color: t.INK }}>{it.n}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.02em' }}>{it.s}</div>
      </div>
      <span style={{ fontFamily: t.MONO, fontSize: 9, color: it.cta ? accent : t.INK50, fontWeight: it.cta ? 800 : 400, letterSpacing: '0.06em' }}>{it.d}</span>
    </div>
  ));

  // ---- header (shared across tabs) ----
  const fireEvt = (name) => { try { window.dispatchEvent(new CustomEvent(name, { detail: { client } })); } catch (e) {} };
  const headerBlock = (
    <div style={{ paddingTop: 50 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{headEyebrow}</div>
        <button onClick={onBack} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>← BACK</button>
      </div>
      <div style={{ marginTop: 10, fontFamily: t.SERIF, fontSize: 40, fontWeight: 600, color: t.INK, lineHeight: 0.98, letterSpacing: '-0.02em' }}>
        {first}<br /><span style={{ fontStyle: 'italic', color: accent }}>{last ? `${last}.` : '.'}</span>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 11 }}>
        <BSAvatar init={client.i} fill={client.c} size={40} />
        <div style={{ flex: 1, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: t.INK50 }}>{sinceLabel}</div>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: isPast ? t.INK50 : teal, border: `1px solid ${isPast ? t.RULE : teal}`, borderRadius: 999, padding: '6px 11px' }}>{statusLabel}</span>
      </div>
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button onClick={() => fireEvt('shape:proMessageClient')} style={{ borderRadius: 999, border: `1px solid ${accent}`, background: `${accent}1f`, color: t.INK, padding: '10px 4px', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }}>MESSAGE</button>
        <button onClick={() => setShowAdjustPage(true)} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, padding: '10px 4px', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }}>ADJUST</button>
        <button onClick={() => setShowSchedulePage(true)} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, padding: '10px 4px', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }}>SCHEDULE</button>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[['profile', isNutri ? 'Plan' : 'Profile'], ['analysis', 'Analysis'], ['manage', 'Manage']].map(([k, label]) => {
          const on = view === k;
          return <button key={k} onClick={() => setView(k)} style={{ borderRadius: 999, padding: '9px 4px', cursor: 'pointer', border: `1px solid ${on ? accent : t.RULE}`, background: on ? `${accent}1c` : 'transparent', color: on ? t.INK : t.INK70, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</button>;
        })}
      </div>
    </div>
  );

  // ---- PROFILE tab ----
  const bigCard = isNutri
    ? { eyebrow: 'ADHERENCE · THIS WEEK', big: adherencePct != null ? String(adherencePct) : '92', small: '%', sub: `${days7 != null ? days7 : 6}/7 days logged · ${bwDelta} ${bwUnit}`, barsLabel: 'DAILY ADHERENCE', barsRight: 'MON — SUN', bars: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], barLetters: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], uniform: true }
    : { eyebrow: 'ATTENDANCE · THIS BLOCK', big: attendancePct != null ? String(attendancePct) : '96', small: '%', sub: `${sDone != null ? sDone : 38}/${sPlan != null ? sPlan : 41} sessions · 6 wks left`, barsLabel: 'SESSIONS / WEEK', barsRight: 'LAST 7 WEEKS', bars: [0.55, 0.72, 0.5, 0.86, 0.46, 0.7, 1], barLetters: null, uniform: false };
  const renderBigCard = () => (
    <div style={{ borderRadius: 18, border: `1px solid ${accent}33`, background: `linear-gradient(155deg, ${accent}12, ${t.PAPER2} 70%), ${t.PAPER2}`, padding: 18 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>{bigCard.eyebrow}</div>
      <div style={{ marginTop: 4, fontFamily: t.SERIF, fontSize: 64, fontWeight: 600, color: t.INK, lineHeight: 0.95, letterSpacing: '-0.02em' }}>{bigCard.big}<span style={{ fontSize: 26, color: t.INK50, fontFamily: t.MONO }}>{bigCard.small}</span></div>
      <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: accent }}>{bigCard.sub}</div>
      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: t.INK50 }}>{bigCard.barsLabel}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: t.INK50 }}>{bigCard.barsRight}</span>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end', height: 64 }}>
        {bigCard.bars.map((hgt, i) => {
          const hot = !bigCard.uniform && i === bigCard.bars.length - 1;
          const bg = bigCard.uniform ? accent : (hot ? accent : `${accent}2e`);
          return <div key={i} style={{ flex: 1, height: `${Math.max(0.18, hgt) * 100}%`, borderRadius: 7, background: bg }} />;
        })}
      </div>
      {bigCard.barLetters && (
        <div style={{ marginTop: 7, display: 'flex', gap: 8 }}>
          {bigCard.barLetters.map((l, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, color: t.INK50 }}>{l}</div>)}
        </div>
      )}
    </div>
  );
  const stats = isNutri ? [
    { label: 'AVG INTAKE', labelColor: gold, big: kcalStr || '2,040', sub: 'TARGET 2,180' },
    { label: 'PROTEIN HIT', labelColor: teal, big: '88', small: '%', sub: 'OF TARGET DAYS' },
    { label: 'WEIGHT Δ', labelColor: rust, big: String(bwDelta), small: bwUnit, sub: 'GOAL -4 KG' },
    { label: 'LOGGED', labelColor: gold, big: days7 != null ? String(days7) : '6', small: '/7', sub: 'THIS WEEK' },
  ] : [
    { label: 'SESSIONS', labelColor: teal, big: sDone != null ? String(sDone) : '38', sub: `OF ${sPlan != null ? sPlan : 41} PLANNED` },
    { label: 'STREAK', labelColor: teal, big: '14d', sub: 'CONSISTENCY' },
    { label: 'AVG RPE', labelColor: rust, big: avgRpe != null ? avgRpe.toFixed(1) : '8.0', sub: 'EFFORT LOGGED' },
    { label: 'PRS', labelColor: gold, big: prs != null ? String(prs) : '3', sub: 'THIS BLOCK' },
  ];
  const lifts = liftRows || [
    { n: 'Back Squat', v: '82.5 kg', d: '+7.5', p: 0.92 },
    { n: 'Bench Press', v: '52.5 kg', d: '+5.0', p: 0.55 },
    { n: 'Deadlift', v: '110 kg', d: '+10', p: 1.0 },
    { n: 'Overhead Press', v: '35 kg', d: '+2.5', p: 0.38 },
  ];
  const macros = [
    { n: 'Protein', cur: avgP != null ? avgP : 165, tgt: 170, c: teal },
    { n: 'Carbs', cur: avgC != null ? avgC : 190, tgt: 200, c: gold },
    { n: 'Fat', cur: avgF != null ? avgF : 60, tgt: 62, c: rust },
  ];
  const trackRow = (label, value, deltaColor, delta, pct, barColor) => (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${t.HAIR}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: t.SERIF, fontSize: 16, fontWeight: 600, color: t.INK }}>{label}</span>
        <span style={{ fontFamily: t.SERIF, fontSize: 16, fontWeight: 600, color: t.INK }}>{value} <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: deltaColor, fontWeight: 700 }}>▲ {delta}</span></span>
      </div>
      <div style={{ marginTop: 8, height: 3, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(1, pct) * 100}%`, background: barColor, borderRadius: 999 }} /></div>
    </div>
  );
  const recent = liveRecent || (isNutri ? [
    { n: 'Tue · 2,040 kcal', s: '162P / 188C / 58F · on target', d: 'Today' },
    { n: 'Mon · 2,110 kcal', s: '168P / 201C / 61F · +protein', d: 'Mon' },
    { n: 'Sun · 1,980 kcal', s: '155P / 176C / 64F · low carb', d: 'Sun' },
  ] : [
    { n: 'Push Day A', s: 'Completed · 52 min · RPE 8', d: 'Today' },
    { n: 'Squat form video', s: 'Uploaded · awaiting review', d: '2h' },
    { n: 'Pull Day B', s: 'Completed · 48 min · RPE 7', d: 'Mon' },
    { n: 'Leg Day', s: 'Completed · 61 min · RPE 9', d: 'Sat' },
  ]);
  const inbox = isNutri
    ? [{ n: 'Food log · this week', s: 'Submitted 4h ago · 18 entries', d: 'Review', cta: true }]
    : [{ n: 'Squat form video', s: 'Uploaded 2h ago · 1:42', d: 'Review', cta: true }];
  const note = isNutri
    ? 'Adherence excellent. Refeed Saturday to support training — bump carbs +40g.'
    : 'Knee valgus on heavy squats — cue knees out, film week 6 top set.';
  const profileView = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 22 }}>
      {renderBigCard()}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{stats.map((s, i) => <StatCard key={i} {...s} />)}</div>
      {!isNutri && (
        <div>
          <Section eyebrow="STRENGTH" title="Key lifts" trailing="HISTORY →" />
          {lifts.map((l, i) => <div key={i} style={i === 0 ? { } : null}>{trackRow(l.n, l.v, accent, l.d, l.p, accent)}</div>)}
        </div>
      )}
      <div>
        <Section eyebrow="BODY" title={isNutri ? 'Weight trend' : 'Bodyweight'} trailing={isNutri ? 'HISTORY →' : 'LOG →'} />
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: t.SERIF, fontSize: 30, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{bwNow}<span style={{ fontSize: 15, color: t.INK50, fontFamily: t.MONO }}> {bwUnit}</span></span>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: accent, letterSpacing: '0.04em', textAlign: 'right' }}>{bwDelta > 0 ? '+' : ''}{bwDelta} {bwUnit} · {bwWeeks} weeks{isNutri ? ' · goal -4 kg' : ''}</span>
          </div>
          <div style={{ marginTop: 14 }}>{lineChart(bwSeries, accent, 64)}</div>
        </div>
      </div>
      {isNutri && (
        <div>
          <Section eyebrow="MACROS" title="Daily average vs target" />
          {macros.map((m, i) => <div key={i}>{trackRow(m.n, `${m.cur} g`, m.c, `${m.tgt} g`, m.cur / m.tgt, m.c)}</div>)}
        </div>
      )}
      <div>
        <Section eyebrow="ACTIVITY" title={isNutri ? 'Recent logs' : 'Recent sessions'} />
        {numberedList(recent)}
      </div>
      <div>
        <Section eyebrow="INBOX" title="Needs your eyes" />
        {numberedList(inbox)}
      </div>
      <div>
        <Section eyebrow="PRIVATE" title={isNutri ? 'Clinical note' : 'Coach note'} />
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: `linear-gradient(150deg, ${accent}10, ${t.PAPER2} 75%), ${t.PAPER2}`, padding: 16 }}>
          <div style={{ fontFamily: t.SERIF, fontSize: 15, fontStyle: 'italic', fontWeight: 600, color: t.INK, lineHeight: 1.5 }}>{note}</div>
        </div>
      </div>
    </div>
  );

  // ---- ANALYSIS tab ----
  const aKpis = isNutri ? [
    { label: 'ADHERENCE', big: adherencePct != null ? String(adherencePct) : '92', small: '%', sub: '+6pt vs last mo', c: accent },
    { label: 'AVG INTAKE', big: kcalStr || '2,040', sub: 'target 2,180', c: accent },
    { label: 'PROTEIN HIT', big: avgP != null ? String(avgP) : '88', small: avgP != null ? 'g' : '%', sub: avgP != null ? 'avg / day' : 'of target days', c: teal },
    { label: 'WEIGHT Δ', big: String(bwDelta), small: bwUnit, sub: 'goal -4 kg', c: rust },
    { label: 'DAYS LOGGED', big: days30 != null ? String(days30) : '27', small: '/30', sub: 'last 30 days', c: accent },
    { label: 'CONSISTENCY', big: '90', small: '%', sub: 'cohort top 15%', c: teal },
  ] : [
    { label: 'ADHERENCE', big: attendancePct != null ? String(attendancePct) : '96', small: '%', sub: '+4pt vs last mo', c: accent },
    { label: 'SESSIONS', big: sDone != null ? String(sDone) : '38', sub: `of ${sPlan != null ? sPlan : 41} planned`, c: accent },
    { label: 'AVG RPE', big: avgRpe != null ? avgRpe.toFixed(1) : '8.0', sub: 'effort logged', c: rust },
    { label: 'TOTAL PRS', big: prs != null ? String(prs) : '3', sub: 'this block', c: gold },
    { label: 'VOLUME', big: '+12', small: '%', sub: 'week / week', c: teal },
    { label: 'BODYWEIGHT', big: String(bwNow), small: bwUnit, sub: `${bwDelta} · ${bwWeeks}w`, c: accent },
  ];
  const summaryLine = isNutri
    ? 'Adherence high and weight tracking to goal — refeed timing is the next lever.'
    : 'Strong block — attendance up, lifts trending, weight on plan.';
  const trendSeries = isNutri ? bwSeries : [0.4, 0.5, 0.45, 0.6, 0.55, 0.72, 0.68, 0.85];
  const analysisView = (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: `2px solid ${t.INK}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>▌ ANALYSIS · LAST 30 DAYS</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{isNutri ? 'NUTRITION KPIS' : 'TRAINING KPIS'}</div>
      </div>
      <div style={{ fontFamily: t.SERIF, fontSize: 19, fontWeight: 600, color: t.INK, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{summaryLine}</div>
      <div style={{ marginTop: 16, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        {aKpis.map((k, i) => (
          <div key={i} style={{ padding: 15, borderTop: i >= 2 ? `1px solid ${t.HAIR}` : 0, borderLeft: i % 2 ? `1px solid ${t.HAIR}` : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: k.c }}>{k.label}</div>
            <div style={{ marginTop: 6, fontFamily: t.SERIF, fontSize: 25, fontWeight: 600, color: t.INK, lineHeight: 1 }}>{k.big}{k.small && <span style={{ fontSize: 13, color: t.INK50, fontFamily: t.MONO }}>{k.small}</span>}</div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: k.c === rust ? rust : t.INK50 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>▌ TRENDLINE</span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{isNutri ? 'WEIGHT' : 'WEEKLY VOLUME'}</span>
      </div>
      <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>{lineChart(trendSeries, accent, 80)}</div>
    </div>
  );

  // ---- MANAGE tab (program phase + shared goals + coach notes) ----
  const goalsContent = !clientUid ? (
    <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Appears once linked to a live member</div>
  ) : !cGoalsLoaded ? (
    <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>
  ) : (cGoals && cGoals.share === false) ? (
    <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.4 }}>{first} keeps their goals private.</div>
  ) : (() => {
    const ov = cGoals && cGoals.overall;
    const trM = (cGoals && cGoals.trainingMeta) || null;
    const nuM = (cGoals && cGoals.nutritionMeta) || null;
    if (!ov && !(trM && trM.title) && !(nuM && nuM.title)) return <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.4 }}>No goals shared yet.</div>;
    const subH = (txt) => <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{txt}</div>;
    const metaRow = (title, subtitle, c) => (
      <div style={{ marginTop: 10, borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '12px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 5, height: 16, borderRadius: 3, background: c, flexShrink: 0 }} />
          <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{title}</span>
        </div>
        {subtitle && <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 12.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.4 }}>{subtitle}</div>}
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
          const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : '';
          return (
            <div style={{ borderRadius: 12, border: `1px solid ${teal}44`, background: `linear-gradient(150deg, ${teal}16, ${t.PAPER2} 80%), ${t.PAPER2}`, padding: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: teal }}>OVERALL{byLabel ? ` · BY ${byLabel}` : ''}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50 }}>{Math.round(pct * 100)}% there</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{ov.title}</div>
              <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct * 100}%`, background: teal, borderRadius: 999 }} /></div>
              <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.04em' }}>{down} {unit} so far · {Math.abs(toGo)} {unit} to go · now {now}{unit} · target {target}{unit}</div>
              {lineChart((ov.weighIns || []).map(x => Number(x.kg)).filter(Number.isFinite), teal, 46)}
            </div>
          );
        })()}
        {trM && trM.title && <>{subH('Training')}{metaRow(trM.title, trM.subtitle, t.RUST)}</>}
        {nuM && nuM.title && <>{subH('Nutrition')}{metaRow(nuM.title, nuM.subtitle, '#a07a2e')}</>}
      </div>
    );
  })();
  const manageView = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 22 }}>
      <div>
        <Section eyebrow="PROGRAM PHASE" title="Block & phase" />
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
          {phaseRow('trainingPhase', 'Training block', ['Build', 'Cut', 'Peak', 'Maintain', 'Deload', 'Base'])}
          {phaseRow('nutritionPhase', 'Nutrition phase', ['Cut', 'Bulk', 'Maintain', 'Recomp', 'Refeed'])}
          {!clientUid && <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Demo client · saves once linked to a live member</div>}
        </div>
      </div>
      <div>
        <Section eyebrow="CLIENT GOALS" title="Shared goals" />
        {goalsContent}
      </div>
      <div>
        <Section eyebrow="PRIVATE" title="Coach notes" />
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.5, color: t.INK70 }}>
          {isNutri ? 'Clinical notes' : 'Training notes'} for {client.n} — history, compliance, habits, and messaging context live here.
        </div>
      </div>
    </div>
  );

  return (
    <BSPage>
      <div style={{ padding: `0 ${t.padX}px 28px` }}>
        {headerBlock}
        {view === 'analysis' ? analysisView : view === 'manage' ? manageView : profileView}
      </div>
      <BSFooter left={isNutri ? 'Client plan' : 'Full profile'} right={client.n} />
    </BSPage>
  );
}

function BSPlanGeneratorCard({ role = 'trainer', kind = 'workout' }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;
  const [goal, setGoal] = useStateBSP(isNutri ? 'Protein-led cut' : kind === 'program' ? 'Marathon strength' : 'Upper push strength');
  const [client, setClient] = useStateBSP(isNutri ? 'Riley Kim' : 'Alex Rivera');
  const [level, setLevel] = useStateBSP('Intermediate');
  const [duration, setDuration] = useStateBSP(kind === 'workout' ? '60 minutes' : isNutri ? '7 days' : '4 weeks');
  const [preferences, setPreferences] = useStateBSP(isNutri ? 'high protein, simple prep, no shellfish' : 'standard gym, protect right knee');
  const [draft, setDraft] = useStateBSP(null);
  const [status, setStatus] = useStateBSP('');

  const updateBlock = (index, patch) => {
    setDraft((current) => ({
      ...current,
      blocks: (current?.blocks || []).map((block, i) => i === index ? { ...block, ...patch } : block),
    }));
  };

  const generate = async () => {
    setStatus('Generating draft...');
    try {
      const result = await window.ShapeAI?.generatePlanDraft?.({
        kind,
        goal,
        client,
        level,
        duration,
        preferences,
        equipment: isNutri ? '' : preferences,
        calories: isNutri ? '2100 kcal' : '',
        protein: isNutri ? '150g' : '',
      });
      setDraft(result?.draft || null);
      setStatus(result?.source === 'openai' ? 'AI draft ready. Review and edit before sending.' : 'Template draft ready. Add OpenAI key for AI output.');
    } catch (error) {
      setStatus(error?.message || 'Unable to generate draft.');
    }
  };

  const label = kind === 'meal_plan'  ? 'Meal-plan generator'
              : kind === 'meal_tmpl'  ? 'Template generator'
              : kind === 'meal_one'   ? 'One-time asset generator'
              : kind === 'program'    ? 'Program generator'
              :                         'Workout generator';
  return (
    <div style={{ margin: `0 ${t.padX}px 16px`, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 16, background: t.SURFACE, boxShadow: '0 8px 18px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
      <div style={{ padding: 14, borderBottom: `1px solid ${t.HAIR}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <BSEyebrow color={accent}>{label}</BSEyebrow>
          <BSEyebrow>{draft ? 'Editable draft' : 'Coach controlled'}</BSEyebrow>
        </div>
        <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.35, color: t.INK, fontWeight: 650 }}>
          Generate a starting point, then edit blocks, notes, portions, and cues before assigning it to a client.
        </div>
      </div>
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['Goal', goal, setGoal],
          ['Client', client, setClient],
          ['Level', level, setLevel],
          ['Length', duration, setDuration],
        ].map(([labelText, value, setter]) => (
          <label key={labelText} style={{ display: 'block' }}>
            <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800, marginBottom: 4 }}>{labelText}</span>
            <input value={value} onChange={(e) => setter(e.target.value)} style={{ width: '100%', border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10, background: t.PAPER2, color: t.INK, padding: '9px 10px', fontFamily: t.DISPLAY, fontSize: 13, outline: 'none' }} />
          </label>
        ))}
        <label style={{ display: 'block', gridColumn: '1 / -1' }}>
          <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800, marginBottom: 4 }}>{isNutri ? 'Food preferences' : 'Equipment / constraints'}</span>
          <input value={preferences} onChange={(e) => setPreferences(e.target.value)} style={{ width: '100%', border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10, background: t.PAPER2, color: t.INK, padding: '9px 10px', fontFamily: t.DISPLAY, fontSize: 13, outline: 'none' }} />
        </label>
        <button onClick={generate} style={{ gridColumn: '1 / -1', borderRadius: 12, border: `1px solid ${t.SURFACE_BORDER}`, background: t.PAPER2, color: t.INK, padding: '12px 14px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 900 }}>
          Generate draft
        </button>
        {status && <div style={{ gridColumn: '1 / -1', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.07em', color: t.INK50, lineHeight: 1.45 }}>{status}</div>}
      </div>
      {draft && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 10 }}>
            <input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ width: '100%', border: 0, background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', outline: 'none' }} />
            <textarea value={draft.summary || ''} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={2} style={{ width: '100%', marginTop: 6, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10, background: t.PAPER2, color: t.INK70, padding: 10, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.35, resize: 'vertical', outline: 'none' }} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(draft.blocks || []).map((block, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 8, padding: 10, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 12, background: t.PAPER2 }}>
                <input value={block.label || ''} onChange={(e) => updateBlock(i, { label: e.target.value })} style={{ border: 0, background: 'transparent', color: accent, fontFamily: t.MONO, fontSize: 10, fontWeight: 900, outline: 'none' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <input value={block.title || ''} onChange={(e) => updateBlock(i, { title: e.target.value })} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, outline: 'none' }} />
                  <input value={block.detail || ''} onChange={(e) => updateBlock(i, { detail: e.target.value })} style={{ border: 0, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 9.5, outline: 'none' }} />
                  <input value={block.note || ''} onChange={(e) => updateBlock(i, { note: e.target.value })} style={{ border: 0, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 9, outline: 'none' }} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setStatus('Draft saved locally. Next step is connecting this to the publish/send workflow.')} style={{ marginTop: 10, width: '100%', borderRadius: 12, border: `1px solid ${t.SURFACE_BORDER}`, background: `${accent}24`, color: t.INK, padding: '11px 14px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 900 }}>
            Save editable draft
          </button>
        </div>
      )}
    </div>
  );
}

function BSTrainerPrograms({ initialTab = 'programs' } = {}) {
  const t = useBS();
  const [planTab, setPlanTab] = useStateBSP(initialTab);
  useEffectBSP(() => {
    setPlanTab(initialTab);
  }, [initialTab]);
  const programs = [
    { n: 'Cut Block 6',         v: '12 wk program', meta: '14 clients - subscription', c: t.AMBER, price: '$149/mo' },
    { n: 'Build Hypertrophy',   v: '8 wk program',  meta: '9 clients - subscription',  c: t.BLUE,  price: '$129/mo' },
    { n: 'Peak Push/Pull',      v: '4 wk program',  meta: '6 clients - subscription',  c: t.RUST,  price: '$89/mo' },
    { n: 'Strength Foundation', v: '6 wk program',  meta: '4 clients - subscription',  c: t.GREEN, price: '$99/mo' },
  ];
  const workouts = [
    { n: 'Upper Push - Peak',       v: 'Single workout', meta: '60 min - dumbbell + bench',  c: t.RUST,  price: '$19' },
    { n: 'Marathon Strength Block', v: 'One-time plan',  meta: '45 min - runner-specific',   c: t.BLUE,  price: '$24' },
    { n: 'Tempo Run Prep',          v: 'Single workout', meta: '35 min - warmup + strides',   c: t.GREEN, price: '$15' },
    { n: 'Hotel Gym Full Body',     v: 'Single workout', meta: '40 min - minimal equipment',  c: t.AMBER, price: '$17' },
  ];
  const musicTargets = [
    ...programs.map((p) => ({ id: `program-${p.n}`, name: p.n, type: 'PROGRAM' })),
    ...workouts.map((w) => ({ id: `workout-${w.n}`, name: w.n, type: 'WORKOUT' })),
  ];
  const ProductRow = ({ item, i, arr, action }) => (
    <div style={{
      marginBottom: i === arr.length - 1 ? 0 : 10,
      padding: '13px 12px',
      border: `1px solid ${t.RULE}`,
      borderRadius: 12,
      background: t.SURFACE,
      boxShadow: '0 8px 18px rgba(0,0,0,0.24)',
      display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 12, alignItems: 'center',
    }}>
      <div style={{ width: 9, height: 9, borderRadius: 99, background: item.c, boxShadow: `0 0 0 4px ${item.c}22` }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.n}</div>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800, flexShrink: 0 }}>{item.price}</span>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.v} - {item.meta}</div>
      </div>
      <span style={{ borderRadius: 999, border: `1px solid ${t.SURFACE_BORDER}`, padding: '6px 8px', background: t.PAPER2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 900 }}>
        {action}
      </span>
    </div>
  );
  const PlanTabs = () => (
    <div style={{ padding: `0 ${t.padX}px 14px`, borderBottom: `1px solid ${t.HAIR}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 4, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 14, background: t.SURFACE, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 18px rgba(0,0,0,0.22)' }}>
        {[
          { key: 'programs', label: 'Programs' },
          { key: 'workouts', label: 'Workouts' },
          { key: 'playlists', label: 'Playlists' },
        ].map((tab, i) => {
          const active = planTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setPlanTab(tab.key)} style={{ borderRadius: 10,
              minHeight: 40,
              border: 0,
              background: active ? t.INK : 'transparent',
              color: active ? t.PAPER : t.INK,
              boxShadow: active ? '0 6px 12px rgba(10,13,12,0.16)' : 'none',
              fontFamily: t.MONO,
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
              cursor: 'pointer',
            }}>
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Plans" title={<>Programs<br/>& workouts.</>} />
      <PlanTabs />
      {planTab === 'programs' && <>
      <BSPlanGeneratorCard role="trainer" kind="program" />
      <BSSection title="Programs" meta="Recurring blocks - subscriptions" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {programs.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="EDIT" />)}
      </div>
      </>}

      {planTab === 'workouts' && <>
      <BSPlanGeneratorCard role="trainer" kind="workout" />
      <BSSection title="Workouts" meta="One-time purchases - single sessions" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {workouts.map((w, i, arr) => <ProductRow key={w.n} item={w} i={i} arr={arr} action="SELL" />)}
      </div>
      </>}

      {planTab === 'playlists' && (
      <BSCoachPlaylistStudio
        role="trainer"
        targets={musicTargets}
        title="Playlist studio"
        meta="Spotify + Apple Music"
        copy="Create custom playlists, attach them to programs or one-time workouts, and send playable Spotify or Apple Music links to clients."
      />
      )}

      {planTab !== 'playlists' && (
      <div style={{ margin: `16px ${t.padX}px 0`, padding: 14, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 14, background: t.PAPER2, boxShadow: t.ELEVATION_SOFT }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800 }}>
          Storefront setup
        </div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.35, color: t.INK, fontWeight: 600 }}>
          Programs are multi-week products. Workouts are single purchases clients can buy once, save, and run anytime.
        </div>
      </div>
      )}
      <BSFooter left="The Coach Edition" right="Pg 3 of 4" />
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
  return <BSSheetProvider><BSNutritionistAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} /></BSSheetProvider>;
}
function BSNutritionistAppInner({ onLogout, tweaks, setTweak }) {
  const t = useBS();
  const sheet = useBSSheet();
  React.useEffect(() => { _bsHydrateProScore(); }, []);
  const [tab, setTab] = useStateBSP('today');
  const [showSettings, setShowSettings] = useStateBSP(false);
  const [showCalendar, setShowCalendar] = useStateBSP(false);
  const [showReviews, setShowReviews] = useStateBSP(false);
  const [showHabits, setShowHabits] = useStateBSP(false);
  const [storeView, setStoreView] = useStateBSP('store');
  const [queueView, setQueueView] = useStateBSP(null);
  const scoreProfile = SHAPE_SCORE_PROFILES?.nutritionist;
  const goRadio = () => setTab('radio');
  const goSettings = () => setShowSettings(true);
  const openHomeWidget = (action) => {
    if (action === 'reviews') { setShowReviews(true); return; }
    if (action === 'plans') { setTab('plans'); return; }
    if (action === 'clients') { setTab('clients'); return; }
    if (action === 'grocery') setQueueView('grocery');
  };
  const [chatRequest, setChatRequest] = useStateBSP(null);
  React.useEffect(() => {
    const onMsg = async (e) => {
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
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="nutritionist" onProfile={goSettings} onBack={() => setShowCalendar(false)} />;
  if (showReviews) return <BSWorkoutReviewPage role="nutritionist" onBack={() => setShowReviews(false)} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setShowHabits(false)} onOpenScore={() => { setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="nutritionist" type={queueView} onBack={() => setQueueView(null)} />;
  const screens = {
    today:    <BSNutriToday onProfile={goSettings} sheet={sheet} goCalendar={() => setShowCalendar(true)} goRadio={goRadio} onOpenReviews={() => setShowReviews(true)} onWidgetOpen={openHomeWidget} onOpenHabits={() => setShowHabits(true)} onOpenScore={() => { setStoreView('score'); setTab('store'); }} tweaks={tweaks} setTweak={setTweak} />,
    clients:  <BSNutriClients sheet={sheet} />,
    console:  <BSProConsoleScreen role="nutritionist" />,
    plans:    <BSNutriPlans sheet={sheet} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="nutritionist" openRequest={chatRequest} />,
    radio:    <BSRadioScreen onBack={() => setTab('today')} />,
    store:    storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => setTab('today')} onOpenScore={() => setStoreView('score')} />,
    me:       <BSProMe role="nutritionist" name="Dr. Maya Patel" onLogout={onLogout} onSettings={goSettings} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      {/* Feed composer portals into this slot (see BSClientFeed). */}
      <div id="bs-composer-slot" style={{ position: 'absolute', left: 0, right: 0, bottom: 72, zIndex: 60, pointerEvents: 'none' }} />
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'clients',  label: 'Clients' },
        { key: 'plans',    label: 'Plans' },
        { key: 'chat',     label: 'Chat' },
        { key: 'store',    label: 'Store' },
        { key: 'me',       label: 'Me' },
      ]} />
      <BSRadioPrompt />
    </div>
  );
}

function BSNutriToday({ onProfile, sheet, goCalendar, goRadio, onOpenReviews, onWidgetOpen = () => {}, onOpenHabits = () => {}, onOpenScore = () => {}, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const [selDay, setSelDay] = useStateBSP(bsProWeek().dates[(new Date().getDay() + 6) % 7].getDate());
  const [ticker, setTicker] = useStateBSP(null);

  // Live ticker — pulled from /api/nutritionist/analytics so the masthead
  // reflects today's consults, active roster, protein adherence, and new
  // clients this week.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/nutritionist/analytics', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d && d.isNutritionist && d.ticker) setTicker(d.ticker); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Per-day schedule for the nutritionist. May 14 (today) is the full
  // roster; other days are lighter so the strip actually changes content
  // when the user taps a different day.
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
  const dataFor = (off) => off === 0 ? 22 : off > 0 ? [23, 24, 21][Math.min(off - 1, 2)] : [20, 25, 26][Math.min(-off - 1, 2)];
  const dataByIdx = dates.map((_, i) => dataFor(i - todayIdx));
  const selIdx = Math.max(0, dates.findIndex(d => d.getDate() === selDay));
  const selDate = dates[selIdx];
  const isToday = selIdx === todayIdx;
  const dataDay = dataByIdx[selIdx];
  const schedule = NUTRI_SCHEDULE[dataDay] || [];

  // Per-day lead narrative.
  const NUTRI_LEAD = {
    20: { count: '2', kicker: 'Mon · May 11', copy: 'Quiet Monday — one intake, one follow-up.' },
    21: { count: '4', kicker: 'Tue · May 12', copy: 'One intake, three follow-ups. First at 9am.' },
    22: { count: '5', kicker: "Lead · Today's schedule", copy: 'Two intakes, three follow-ups. First at 11am.' },
    23: { count: '2', kicker: 'Fri · May 15', copy: 'Light Friday — one intake, one macro check.' },
    24: { count: '2', kicker: 'Sat · May 16', copy: 'Two follow-ups. Easy weekend cadence.' },
    25: { count: '0', kicker: 'Sun · May 17', copy: 'Off day. No sessions scheduled.' },
    26: { count: '1', kicker: 'Mon · May 18', copy: 'Open hours — drop-in consults only.' },
  };
  const lead = NUTRI_LEAD[dataDay] || NUTRI_LEAD[22];
  const leadKicker = isToday ? "Lead · Today's schedule" : `${_BS_DOW[selIdx]} · ${_BS_MON[selDate.getMonth()]} ${selDate.getDate()}`;

  return (
    <BSPage>
      <BSMasthead
        title={<span className="bs-daily-title" style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span className="bs-daily-the" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>The</span>
          <span className="bs-daily-shape" style={{ display: 'inline-block', marginLeft: 8, marginRight: 10, fontFamily: "'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif", fontWeight: 300, fontStyle: 'normal', fontSize: 37, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)' }}>SHAPE</span>
          <span className="bs-daily-daily" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>Daily.</span>
        </span>}
        leftKicker={`${_BS_DOW[todayIdx]} · ${_BS_MON[dates[todayIdx].getMonth()]} ${dates[todayIdx].getDate()} · ${dates[todayIdx].getFullYear()}`}
        rightKicker="22 plans · 5 sessions"
        trailing={<BSAvatar init={bsMyInitials()} size={32} fill={bsMyTierColor()} ink={'#fff'} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.RUST }}>
          Coaches Edition · No. {dates[todayIdx].getDate()}
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. I
        </span>
      </div>

      <BSTicker items={(() => {
        const tk = ticker || {};
        return [
          { label: 'CONSLT', value: tk.consultsToday != null ? `${tk.consultsToday} TODAY` : '5 TODAY', note: tk.upcomingSessions != null ? `${tk.upcomingSessions} UPCOMING` : '12 UPCOMING' },
          { label: 'CLIENTS', value: tk.activeClients != null ? String(tk.activeClients) : '22', note: 'ACTIVE' },
          { label: 'ADHR',   value: tk.proteinAdherencePct != null ? `${tk.proteinAdherencePct}%` : '78%', color: '#a3e09a', note: 'PROTEIN' },
          { label: 'NEW',    value: tk.newClients7d != null ? `+${tk.newClients7d} 7D` : '+3 7D',    color: '#7ed4ff' },
          { label: 'LOGS',   value: tk.avgLogsPerClient != null ? `${tk.avgLogsPerClient} AVG` : '22 AVG', note: 'PER CLIENT' },
        ];
      })()} />

      <div style={{
        padding: `10px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            { label: 'Today', meta: '5 sessions', active: true, onClick: () => {} },
            { label: 'Habits', meta: '1/3 done', accent: t.GREEN, onClick: () => onOpenHabits() },
            { label: 'Score', meta: '+6 pts', accent: t.ACCENT, onClick: () => onOpenScore() },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              style={{
                minWidth: 0,
                padding: '9px 8px 8px',
                borderRadius: t.RADIUS_SM,
                border: `1px solid ${item.active ? t.INK : (item.accent || t.RULE)}`,
                background: item.active ? t.INK : t.PAPER2,
                color: item.active ? t.PAPER : t.INK,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{
                display: 'block',
                fontFamily: t.MONO,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: item.active ? t.PAPER : (item.accent || t.INK),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.label}
              </span>
              <span style={{
                display: 'block',
                marginTop: 4,
                fontFamily: t.MONO,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: item.active ? t.PAPER : t.INK50,
                opacity: item.active ? 0.72 : 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.meta}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* NOW PLAYING — Shape Radio */}
      <BSNowPlaying onOpen={goRadio} />

      {/* THIS WEEK — nutritionist view, dots = consult density */}
      <BSProWeekStrip
        goCalendar={goCalendar}
        selDay={selDay}
        onSelectDay={setSelDay}
        dots={dataByIdx.map(dd => ({
          20: [t.BLUE, t.BLUE],
          21: [t.GREEN, t.BLUE, t.BLUE],
          22: [t.BLUE],
          23: [t.GREEN, t.BLUE],
          24: [t.BLUE, t.BLUE],
          25: [],
          26: [t.AMBER],
        }[dd] || []))}
      />

      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.RUST}>{lead.kicker}</BSEyebrow>
          <BSEyebrow>{isToday ? '09:42' : `${_BS_MON[selDate.getMonth()]} ${selDay}`}</BSEyebrow>
        </div>
        <BSHeadlineNumber value={lead.count} unit="SESSIONS" />
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: t.body + 1, color: t.INK70, lineHeight: 1.3, fontWeight: 500 }}>
          {lead.copy}
        </div>
      </div>

      <BSSection
        title={isToday ? "Today's schedule" : `Schedule · ${_BS_MON[selDate.getMonth()]} ${selDay}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Open calendar →</span>}
      />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {schedule.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
            — Off day · nothing scheduled —
          </div>
        ) : (
          schedule.map((r, i) => <BSRow key={i} {...r} />)
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <BSProHomeWidgets role="nutritionist" onOpen={onWidgetOpen} />
      </div>
      <BSReviewQueueCard role="nutritionist" onOpen={onOpenReviews} />

      <BSFooter left="The Nutri Edition" right="Pg 1 of 4" />
    </BSPage>
  );
}

function BSNutriClients() {
  const t = useBS();
  const [previewClient, setPreviewClient] = useStateBSP(null);
  const [fullClient, setFullClient] = useStateBSP(null);
  const [roster, setRoster] = useStateBSP('active'); // 'active' | 'past'
  const [cQuery, setCQuery] = useStateBSP('');
  const [cFilter, setCFilter] = useStateBSP('all');
  const NUTRI_CLIENTS = [
    { i: 'A', c: t.RUST,  n: 'Alex Rivera',  prog: 'Cut · 1900 kcal', streak: 19, r: 'CUT · 1900 KCAL',  d: '94%', good: true, s: 'on track',    active: true },
    { i: 'J', c: t.BLUE,  n: 'Jamie Wong',   prog: 'Cut · 1700 kcal', streak: 12, r: 'CUT · 1700 KCAL',  d: '88%', good: true, s: 'on track',    active: true },
    { i: 'R', c: t.AMBER, n: 'Riley Kim',    prog: 'Cut · 1850 kcal', streak: 4,  r: 'CUT · 1850 KCAL',  d: '72%', s: 'review form', active: true },
    { i: 'S', c: t.GREEN, n: 'Sara Mendez',  prog: 'Intake',          streak: 0,  r: 'INTAKE',           d: 'NEW', s: 'onboard',     active: true },
    { i: 'P', c: t.BLUE,  n: 'Pat Doan',     prog: 'Intake',          streak: 0,  r: 'INTAKE',           d: 'NEW', s: 'onboard',     active: true },
    { i: 'C', c: t.AMBER, n: 'Casey Lee',    prog: 'Build · 2400',    streak: 9,  r: 'BUILD · 2400',     d: '64%', warn: true, s: 'missed', active: true },
    { i: 'D', c: t.RUST,  n: 'Drew Park',    prog: 'Build · 2200',    streak: 7,  r: 'BUILD · 2200',     d: '58%', warn: true, s: 'missed', active: true },
    { i: 'M', c: t.INK50, n: 'Morgan Liu',   prog: 'Ended Apr',       streak: 0,  r: 'PAST · ended Apr', d: '—', s: 'past', active: false },
    { i: 'T', c: t.INK50, n: 'Taylor Reed',  prog: 'Paused',          streak: 0,  r: 'PAST · paused',    d: '—', s: 'past', active: false },
    { i: 'N', c: t.INK50, n: 'Noah Bennett', prog: 'Completed',       streak: 0,  r: 'PAST · completed', d: '—', s: 'past', active: false },
  ];
  const shownClients = NUTRI_CLIENTS
    .filter(c => roster === 'active' ? c.active : !c.active)
    .filter(c => bsClientMatchesFilter(c, cFilter, 'nutritionist'))
    .filter(c => bsClientMatchesQuery(c, cQuery));
  const activeCount = NUTRI_CLIENTS.filter(c => c.active).length;
  const pastCount = NUTRI_CLIENTS.length - activeCount;
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
      newThisMonth={3}
      roster={roster}
      setRoster={setRoster}
      query={cQuery}
      setQuery={setCQuery}
      filter={cFilter}
      setFilter={setCFilter}
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
  const [subtab, setSubtab] = useStateBSP('meal');
  const mealPlans = [
    { n: 'Cut - 1700-1900 kcal',   v: 'Meal plan subscription', meta: '8 active clients', c: t.RUST, price: '$119/mo' },
    { n: 'Build - 2200-2600 kcal', v: 'Meal plan subscription', meta: '6 active clients', c: t.AMBER, price: '$129/mo' },
    { n: 'Maintenance',            v: 'Meal plan subscription', meta: '5 active clients', c: t.GREEN, price: '$99/mo' },
    { n: 'Recomp - macro-flex',    v: 'Meal plan subscription', meta: '3 active clients', c: t.BLUE, price: '$109/mo' },
  ];
  const templates = [
    { n: 'High-protein breakfast bank', v: 'Template', meta: '12 meals - reusable', c: t.GREEN, price: 'Template' },
    { n: 'Race week carb load',         v: 'Template', meta: '7-day protocol', c: t.BLUE, price: 'Template' },
    { n: 'Plant-based cut swap',        v: 'Template', meta: '8 substitutions', c: t.AMBER, price: 'Template' },
  ];
  const oneTime = [
    { n: 'Grocery audit',           v: 'One-time purchase', meta: 'Pantry list + swaps', c: t.RUST, price: '$29' },
    { n: 'Restaurant ordering kit', v: 'One-time guide', meta: 'Macro-safe orders', c: t.BLUE, price: '$17' },
    { n: 'Travel nutrition guide',  v: 'One-time guide', meta: 'Airport + hotel strategy', c: t.GREEN, price: '$21' },
    { n: 'Supplement stack review', v: 'One-time purchase', meta: 'Review + written feedback', c: t.AMBER, price: '$35' },
  ];
  const musicTargets = [
    ...mealPlans.map((p) => ({ id: `meal-${p.n}`, name: p.n, type: 'MEAL PLAN' })),
    ...templates.map((p) => ({ id: `template-${p.n}`, name: p.n, type: 'TEMPLATE' })),
    ...oneTime.map((p) => ({ id: `one-time-${p.n}`, name: p.n, type: 'ONE-TIME' })),
  ];
  const ProductRow = ({ item, i, arr, action }) => (
    <div style={{
      marginBottom: i === arr.length - 1 ? 0 : 10,
      padding: '13px 12px',
      border: `1px solid ${t.SURFACE_BORDER}`,
      borderRadius: 12,
      background: t.PAPER2,
      boxShadow: t.ELEVATION_SOFT,
      display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 12, alignItems: 'center',
    }}>
      <div style={{ width: 9, height: 9, borderRadius: 99, background: item.c, boxShadow: `0 0 0 4px ${item.c}22` }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.n}</div>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800, flexShrink: 0 }}>{item.price}</span>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.v} - {item.meta}</div>
      </div>
      <span style={{ borderRadius: 999, border: `1px solid ${t.SURFACE_BORDER}`, padding: '6px 8px', background: t.PAPER, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 900 }}>
        {action}
      </span>
    </div>
  );
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Plans" title={<>Meals<br/>& templates.</>} />
      <BSProPlansTabBar active={subtab} onChange={setSubtab} />
      <BSPlanGeneratorCard role="nutritionist" kind="meal_plan" />
      {subtab === 'meal' && (<>
        <BSSection title="Meal plans" meta="Recurring subscriptions" />
        <div style={{ padding: `0 ${t.padX}px` }}>
          {mealPlans.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="EDIT" />)}
        </div>
      </>)}
      {subtab === 'tmpl' && (<>
        <BSSection title="Templates" meta="Reusable meal frameworks" />
        <div style={{ padding: `0 ${t.padX}px` }}>
          {templates.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="EDIT" />)}
        </div>
      </>)}
      {subtab === 'onetime' && (<>
        <BSSection title="One-time purchases" meta="Not meal plans - not subscriptions" />
        <div style={{ padding: `0 ${t.padX}px` }}>
          {oneTime.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="SELL" />)}
        </div>
      </>)}

      <BSCoachPlaylistStudio
        role="nutritionist"
        targets={musicTargets}
        title="Playlist studio"
        meta="Spotify + Apple Music"
        copy="Create custom playlists, attach them to meal plans, templates, or one-time nutrition assets, and send playable Spotify or Apple Music links to clients."
      />

      <div style={{ margin: `16px ${t.padX}px 0`, padding: 14, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 14, background: t.PAPER2, boxShadow: t.ELEVATION_SOFT }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800 }}>
          Storefront setup
        </div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.35, color: t.INK, fontWeight: 600 }}>
          Meal plans are recurring products. Templates are reusable frameworks. One-time purchases are standalone nutrition assets clients buy once.
        </div>
      </div>
      <BSFooter left="The Nutri Edition" right="Pg 3 of 4" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED PRO ME
// ═══════════════════════════════════════════════════════════
function BSProMe({ role, name, onLogout, onSettings = () => {} }) {
  const t = useBS();
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
  const customInit = (typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.initials) ? String(window.ShapeIdentity.initials).trim().toUpperCase().slice(0, 2) : '';
  const init = customInit || (displayName || 'S').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'S';
  const [showScore, setShowScore] = useStateBSP(false);
  const [showStore, setShowStore] = useStateBSP(false);
  const [showContact, setShowContact] = useStateBSP(false);
  const [showTerms, setShowTerms] = useStateBSP(false);
  const [showGoals, setShowGoals] = useStateBSP(false);
  const [showPublicProfile, setShowPublicProfile] = useStateBSP(false);
  const [showBookingCalendar, setShowBookingCalendar] = useStateBSP(false);
  const [showNotifications, setShowNotifications] = useStateBSP(false);
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
    return <BSProPublicProfilePage role={role} name={displayName} onBack={() => setShowPublicProfile(false)} />;
  }
  if (showBookingCalendar) {
    return <BSCalendarScreen role={role} onProfile={() => setShowPublicProfile(true)} onBack={() => setShowBookingCalendar(false)} />;
  }
  if (showNotifications) {
    return <BSProNotificationsPage onBack={() => setShowNotifications(false)} />;
  }

  return (
    <BSPage>
      <div style={{ padding: `50px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{isCoach ? 'TRAINER · HYPERTROPHY · SF' : 'REGISTERED DIETITIAN · REMOTE'}</div>
            {(() => { const w = (displayName || '').trim().split(/\s+/); const lastW = w.length > 1 ? w.pop() : ''; const firstL = w.join(' '); return (
              <div style={{ marginTop: 8, fontFamily: t.SERIF, fontSize: 40, fontWeight: 600, color: t.INK, lineHeight: 0.98, letterSpacing: '-0.02em' }}>{firstL || displayName}<br /><span style={{ fontStyle: 'italic', color: accent }}>{lastW ? `${lastW}.` : '.'}</span></div>
            ); })()}
          </div>
          <button onClick={onSettings} aria-label="Settings" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.INK} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
          </button>
        </div>
      </div>

      {(() => {
        const total = scoreProfile.total || 0;
        const goal = scoreProfile.goal || 5000;
        const pct = goal ? Math.min(1, total / goal) : 0;
        const RAD = 34, CIRC = 2 * Math.PI * RAD;
        const tierC = bsTierColor(scoreProfile.tier);
        const bars = [
          { k: 'WEEK',   v: scoreProfile.weekRatio, n: scoreProfile.week, c: t.AMBER },
          { k: 'STREAK', v: scoreProfile.streakRatio, n: `${scoreProfile.streak}D`, c: t.GREEN },
          { k: 'TIER',   v: scoreProfile.tierRatio, n: scoreProfile.tierShort, c: tierC },
          { k: 'SPEND',  v: scoreProfile.spendRatio, n: (scoreProfile.available || 0).toLocaleString(), c: t.BLUE },
        ];
        return (
          <div style={{ padding: `16px ${t.padX}px 6px` }}>
            <button onClick={() => setShowScore(true)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', color: t.INK,
              border: `1px solid ${accent}33`, borderRadius: 18,
              background: `linear-gradient(155deg, ${accent}10, ${t.PAPER2} 75%), ${t.PAPER2}`,
              padding: 18,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Shape Score</div>
                  <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: tierC, lineHeight: 1 }}>{scoreProfile.tier}<span style={{ marginLeft: 8, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', verticalAlign: '2px' }}>tier</span></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 10 }}>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 46, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{total.toLocaleString()}</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK50, marginBottom: 5 }}>of {goal.toLocaleString()}</span>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: tierC, fontWeight: 700 }}>{scoreProfile.week} this week · {(scoreProfile.pointsToNext || 0).toLocaleString()} to {scoreProfile.nextTier}</div>
                </div>
                <svg width="84" height="84" viewBox="0 0 84 84" style={{ flexShrink: 0 }}>
                  <circle cx="42" cy="42" r={RAD} fill="none" stroke={t.HAIR} strokeWidth="6" />
                  <circle cx="42" cy="42" r={RAD} fill="none" stroke={tierC} strokeWidth="6" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} transform="rotate(-90 42 42)" />
                  <text x="42" y="43" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: t.DISPLAY, fontSize: '17px', fontWeight: 700, fill: t.INK }}>{Math.round(pct * 100)}%</text>
                </svg>
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {bars.map(r => (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 86, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>{r.k}</div>
                    <div style={{ flex: 1, height: 5, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
                      <div style={{ width: `${(r.v || 0) * 100}%`, height: '100%', background: r.c, borderRadius: 999 }} />
                    </div>
                    <div style={{ width: 40, textAlign: 'right', fontFamily: t.MONO, fontSize: 10.5, color: t.INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.n}</div>
                  </div>
                ))}
              </div>
            </button>
          </div>
        );
      })()}

      <div style={{ padding: `12px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Practice goal */}
        <button onClick={() => setShowGoals(true)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: t.INK, border: `1px solid ${accent}33`, borderRadius: 18, background: `linear-gradient(155deg, ${accent}14, ${t.PAPER2} 70%), ${t.PAPER2}`, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: accent }}>PRACTICE GOAL · Q3 ›</span>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: t.INK50 }}>{isCoach ? '62% THERE' : '47% THERE'}</span>
          </div>
          <div style={{ marginTop: 8, fontFamily: t.SERIF, fontSize: 26, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{isCoach ? 'Twenty by ' : 'Six-K by '}<span style={{ fontStyle: 'italic', color: accent }}>September.</span></div>
          <div style={{ marginTop: 12, height: 6, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(isCoach ? 0.62 : 0.47) * 100}%`, background: accent, borderRadius: 999 }} /></div>
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.04em', color: accent }}>{isCoach ? '17 / 20 clients · $6.2k MRR · on track' : '$4.1k / $6k MRR · 11 clients · on track'}</div>
        </button>
        {/* This month — with a visible/hidden toggle on the revenue */}
        <div style={{ border: `1px solid ${accent}33`, borderRadius: 18, background: `linear-gradient(155deg, ${accent}14, ${t.PAPER2} 70%), ${t.PAPER2}`, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', color: accent }}>THIS MONTH</span>
            <button onClick={toggleRev} aria-label="Toggle revenue visibility" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999, border: `1px solid ${revHidden ? t.RULE : accent}`, background: revHidden ? 'transparent' : `${accent}1c`, color: revHidden ? t.INK50 : accent, padding: '5px 11px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em' }}>
              {revHidden
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
              <span>{revHidden ? 'HIDDEN' : 'VISIBLE'}</span>
            </button>
          </div>
          <div style={{ marginTop: 6, fontFamily: t.SERIF, fontSize: 54, fontWeight: 600, color: t.INK, lineHeight: 0.95, letterSpacing: '-0.02em' }}>{revHidden ? '$••••' : (isCoach ? '$6,240' : '$4,120')}</div>
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: accent }}>{isCoach ? '17 active · 94% retention · +3 mo' : '11 active · 92% retention · +3 mo'}</div>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'flex-end', height: 30 }}>
            {(isCoach ? [0.5, 0.58, 0.52, 0.66, 0.7, 0.82, 0.95] : [0.55, 0.5, 0.6, 0.58, 0.7, 0.78, 0.9]).map((h, i, a) => (
              <div key={i} style={{ flex: 1, height: `${Math.max(0.2, h) * 100}%`, borderRadius: 5, background: i === a.length - 1 ? accent : `${accent}2e` }} />
            ))}
          </div>
          <div style={{ marginTop: 7, display: 'flex', gap: 8 }}>
            {['NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY'].map(m => <div key={m} style={{ flex: 1, textAlign: 'center', fontFamily: t.MONO, fontSize: 8, color: t.INK50, letterSpacing: '0.04em' }}>{m}</div>)}
          </div>
        </div>
      </div>

      {(() => {
        const numRow = (it, i, subCol) => (
          <div key={i} onClick={it.onClick} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'center', padding: '15px 0', borderTop: `1px solid ${t.HAIR}`, cursor: it.onClick ? 'pointer' : 'default' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.SERIF, fontSize: 17, fontWeight: 600, color: it.danger ? t.RUST : t.INK }}>{it.l}</div>
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
        ];
        const settings = [
          { l: 'Notifications', sub: 'Sessions · messages · plans', r: '→', onClick: () => setShowNotifications(true) },
          { l: 'Certifications', sub: isCoach ? 'NASM · FMS · CSCS' : 'RDN · CSSD', r: '→', onClick: onSettings },
          { l: 'Help & support', sub: 'Docs · email · community', r: '→', onClick: () => setShowContact(true) },
        ];
        const head = (eyebrow, title, mt) => (
          <div style={{ marginTop: mt }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: teal }}>{eyebrow}</div>
            <div style={{ marginTop: 5, fontFamily: t.SERIF, fontSize: 30, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{title}</div>
          </div>
        );
        const footLink = { background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: 0 };
        return (
          <div style={{ padding: `4px ${t.padX}px 8px` }}>
            {head('YOUR PRACTICE', 'Shortcuts', 22)}
            <div style={{ marginTop: 8 }}>{shortcuts.map((it, i) => numRow(it, i, accent))}</div>
            {head('ACCOUNT', 'Settings', 26)}
            <div style={{ marginTop: 8 }}>{settings.map((it, i) => numRow(it, i, t.INK50))}</div>
            {/* Utility footer — keeps Shape Store / Terms / Sign out reachable. */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 18 }}>
                <button onClick={() => setShowStore(true)} style={footLink}>Shape Store</button>
                <button onClick={() => setShowTerms(true)} style={footLink}>Terms</button>
              </div>
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
        trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>}
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
        trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>}
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
function BSCoachGoalPlanPage({ role = 'trainer', onBack }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  return (
    <BSPage>
      <BSPageHeader
        kicker={`${isNutri ? 'Nutritionist' : 'Coach'} settings`}
        title={<>Goal<br/>plan.</>}
        trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>}
      />
      <BSCoachGoalPlan role={role} />
      <BSFooter left={isNutri ? 'The Nutri Edition' : 'The Coach Edition'} right="Goal plan" />
    </BSPage>
  );
}

function BSCoachGoalPlan({ role = 'trainer' }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const ACC   = isNutri ? t.RUST : t.AMBER;
  const MONO  = t.MONO;
  const DISP  = t.DISPLAY;

  const goals = isNutri ? [
    { kicker: 'GOAL · 73%',  pct: 0.73, title: '30 active clients by July',     a: '22',     b: '30',     note: '8 to go · +2/wk intake gets there Jun 22' },
    { kicker: 'GOAL · 56%',  pct: 0.56, title: '$15k MRR by Q3',                a: '$8,420',  b: '$15,000', note: '$6.6k to go · 90% retention holds = Aug 30' },
    { kicker: 'GOAL · 50%',  pct: 0.50, title: 'Publish 2 meal-plan templates', a: '1',      b: '2',      note: 'Low-FODMAP cut shipping next week' },
    { kicker: 'GOAL · 89%',  pct: 0.89, title: '85% avg plan adherence',        a: '78%',    b: '85%',    note: '30d rolling · +7 pts needed' },
  ] : [
    { kicker: 'GOAL · 68%',  pct: 0.68, title: '50 active clients by July',     a: '34',     b: '50',     note: '16 to go · +3/wk pace gets there Jun 29' },
    { kicker: 'GOAL · 74%',  pct: 0.74, title: '$20k MRR by Q3',                a: '$14,829', b: '$20,000', note: '$5.2k to go · 92% retention holds = Aug 16' },
    { kicker: 'GOAL · 50%',  pct: 0.50, title: 'Publish 2 new programs',        a: '1',      b: '2',      note: 'Return-to-lifting shipping next week' },
    { kicker: 'GOAL · 97%',  pct: 0.97, title: '95% avg client adherence',      a: '92%',    b: '95%',    note: '30d rolling · +3 pts needed' },
  ];

  // Revenue calculator — live sliders. Different defaults for nutritionist vs trainer.
  const [rate,  setRate]  = useStateBSP(isNutri ? 120 : 85);   // $/consult or $/session
  const [sess,  setSess]  = useStateBSP(isNutri ? 14 : 22);    // consults or sessions / wk
  const [subs,  setSubs]  = useStateBSP(isNutri ? 540 : 486);  // $/wk meal-plan or program subs
  const [sales, setSales] = useStateBSP(isNutri ? 220 : 330);  // $/wk handouts or workout sales

  const grossWeek    = rate * sess + subs + sales;
  const takeWeek     = Math.round(grossWeek * 0.85);
  const grossMonth   = Math.round(grossWeek * 4.33);
  const takeMonth    = Math.round(takeWeek * 4.33);
  const grossQuarter = Math.round(grossWeek * 13);
  const takeQuarter  = Math.round(takeWeek * 13);
  const grossYear    = Math.round(grossWeek * 52);
  const takeYear     = Math.round(takeWeek * 52);
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const currentPaceWeek = 3897;
  const delta = takeWeek - currentPaceWeek;

  const eyebrow = (txt, color) => (
    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: color || t.INK50, fontWeight: 700 }}>{txt}</span>
  );

  const Slider = ({ label, value, set, min, max, step, fmtVal }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'baseline', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
        <span style={{ fontFamily: DISP, fontSize: 13, color: t.INK, letterSpacing: '-0.005em', flex: 1 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: t.INK, fontWeight: 700, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>{fmtVal(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="bs-coach-range"
        style={{ width: '100%', height: 4, accentColor: ACC, cursor: 'pointer', background: 'transparent' }}
      />
    </div>
  );

  const GoalRow = (g) => (
    <div style={{
      padding: `${t.rowY + 6}px 0`,
      borderBottom: `1px solid ${t.HAIR}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        {eyebrow(g.kicker, ACC)}
        {eyebrow('EDIT →', t.ACCENT)}
      </div>
      <div style={{ fontFamily: DISP, fontWeight: t.W.display, fontSize: 22, color: t.INK, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>{g.title}</div>
      <div style={{ height: 4, background: t.HAIR, position: 'relative', marginBottom: 6 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${g.pct * 100}%`, background: t.INK }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.06em', marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
        <span>{g.a}</span>
        <span>{g.b}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: t.INK70, letterSpacing: '0.04em' }}>{g.note}</div>
    </div>
  );

  const StatCell = ({ l, v, sub, accent, borderLeft, borderTop }) => (
    <div style={{
      padding: 14,
      borderLeft: borderLeft ? `1px solid ${t.RULE}` : 0,
      borderTop:  borderTop  ? `1px solid ${t.RULE}` : 0,
    }}>
      <div style={{ marginBottom: 6 }}>{eyebrow(l)}</div>
      <div style={{ fontFamily: DISP, fontWeight: t.W.display, fontSize: 28, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {sub && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: accent || t.INK50, letterSpacing: '0.04em', lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );

  return (
    <>
      {/* Range track styling — paper-and-ink */}
      <style>{`
        .bs-coach-range { -webkit-appearance: none; appearance: none; }
        .bs-coach-range::-webkit-slider-runnable-track { height: 2px; background: ${t.RULE}; border-radius: 0; }
        .bs-coach-range::-moz-range-track { height: 2px; background: ${t.RULE}; border-radius: 0; }
        .bs-coach-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; background: ${t.INK}; margin-top: -6px; cursor: pointer; border-radius: 0; }
        .bs-coach-range::-moz-range-thumb { width: 14px; height: 14px; background: ${t.INK}; border: 0; cursor: pointer; border-radius: 0; }
      `}</style>

      <BSSection title="Goal plan" meta="Q2 · 2026" />

      {/* Goals — stacked rows, broadsheet rule-line list */}
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {goals.map((g, i) => <GoalRow key={i} {...g} />)}
      </div>

      {/* Revenue calculator — paper card with hairline frame */}
      <BSSection title="Revenue calculator" kicker="Set your target" />
      <div style={{
        margin: `0 ${t.padX}px`,
        padding: `${t.rowY + 4}px 14px`,
        borderTop: `2px solid ${t.INK}`,
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER2,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Slider label={isNutri ? 'Consult rate' : 'Session rate'}                              value={rate}  set={setRate}  min={40} max={250}  step={5}  fmtVal={v => '$' + v} />
          <Slider label={isNutri ? 'Consults / week' : 'Sessions / week'}                        value={sess}  set={setSess}  min={0}  max={40}   step={1}  fmtVal={v => v} />
          <Slider label={isNutri ? 'Meal-plan subscriptions / week' : 'Program subscriptions / week'}     value={subs}  set={setSubs}  min={0}  max={2000} step={10} fmtVal={v => '$' + v} />
          <Slider label={isNutri ? 'One-time handouts & guides / week' : 'One-time workout sales / week'} value={sales} set={setSales} min={0}  max={1500} step={10} fmtVal={v => '$' + v} />
        </div>
      </div>

      {/* Take-home — 2×2, hairline-divided like the page-header stat block */}
      <div style={{ margin: `0 ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <StatCell l="Weekly take-home"    v={fmt(takeWeek)}    sub={`${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta)).slice(1)} vs $${currentPaceWeek.toLocaleString()} pace · ${fmt(grossWeek)} gross`} accent={delta >= 0 ? ACC : t.RUST} />
          <StatCell l="Monthly take-home"   v={fmt(takeMonth)}   sub={`${fmt(grossMonth)} gross · 4.33 wks`} borderLeft />
          <StatCell l="Quarterly take-home" v={fmt(takeQuarter)} sub={`${fmt(grossQuarter)} gross · 3 months`} borderTop />
          <StatCell l="Annual take-home"    v={fmt(takeYear)}    sub={`${fmt(grossYear)} gross · 12 months`} borderTop borderLeft />
        </div>
      </div>

      <div style={{ padding: `12px ${t.padX}px 18px`, fontFamily: t.SERIF || DISP, fontSize: 12, color: t.INK70, lineHeight: 1.5, fontStyle: 'italic' }}>
        {isNutri
          ? <>Based on consult earnings, meal-plan subscriptions, and one-time guides. Figures shown are <strong style={{ color: t.INK }}>take-home</strong> after Shape's 15% platform fee. Gross this week: {fmt(grossWeek)}.</>
          : <>Based on session earnings, program subscriptions, and one-time workout sales. Figures shown are <strong style={{ color: t.INK }}>take-home</strong> after Shape's 15% platform fee. Gross this week: {fmt(grossWeek)}.</>}
      </div>

      {/* Momentum */}
      <BSSection title="Momentum" meta="This quarter" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: `${t.rowY + 4}px 0` }}>
          {(isNutri ? [
            { v: '+8',     l: 'Net new clients',     sub: 'vs +4 last Q' },
            { v: '+$2.1k', l: 'MRR growth',          sub: 'vs +$0.9k last Q' },
            { v: '3',      l: 'Plans published',     sub: 'vs 1 last Q' },
            { v: '+5 pts', l: 'Adherence',           sub: 'vs +2 pts last Q' },
          ] : [
            { v: '+11',    l: 'Net new clients',     sub: 'vs +6 last Q' },
            { v: '+$3.4k', l: 'MRR growth',          sub: 'vs +$1.5k last Q' },
            { v: '2',      l: 'Programs shipped',    sub: 'vs 1 last Q' },
            { v: '+4 pts', l: 'Adherence',           sub: 'vs +1 pts last Q' },
          ]).map((m, i) => (
            <div key={i} style={{
              padding: `12px ${i % 2 === 1 ? 0 : 14}px 12px ${i % 2 === 0 ? 0 : 14}px`,
              borderLeft: i % 2 === 1 ? `1px solid ${t.RULE}` : 0,
              borderTop:  i >= 2      ? `1px solid ${t.RULE}` : 0,
            }}>
              <div style={{ fontFamily: DISP, fontWeight: t.W.display, fontSize: 28, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
              <div style={{ marginTop: 6, fontFamily: DISP, fontSize: 13, color: t.INK, letterSpacing: '-0.005em', fontWeight: 600 }}>{m.l}</div>
              <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.06em' }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </>
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

function BSProConsoleScreen({ role = 'trainer', embedded = false }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const accent = isNutri ? t.RUST : t.AMBER;

  const [loading, setLoading] = useStateBSP(true);
  const [clients, setClients] = useStateBSP([]);
  const [focusByClient, setFocusByClient] = useStateBSP({});
  const [itemsByClient, setItemsByClient] = useStateBSP({});
  const [snapshotByClient, setSnapshotByClient] = useStateBSP({});
  const [profileByClient, setProfileByClient] = useStateBSP({});
  const [selClientId, setSelClientId] = useStateBSP(null);
  const [dropdownOpen, setDropdownOpen] = useStateBSP(false);
  const [focusText, setFocusText] = useStateBSP('');
  const [itemName, setItemName] = useStateBSP('');
  const [itemNote, setItemNote] = useStateBSP('');
  const [busy, setBusy] = useStateBSP(false);
  const [err, setErr] = useStateBSP('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await window.ShapeProConsole?.fetch(role);
      const useData = data && (data.clients?.length) ? data : BS_CONSOLE_SAMPLE(role);
      const cl = useData.clients ?? [];
      setClients(cl);
      setFocusByClient(useData.focusByClient ?? {});
      setItemsByClient(useData.itemsByClient ?? {});
      setSnapshotByClient(useData.snapshotByClient ?? {});
      setProfileByClient(useData.profileByClient ?? {});
      if (cl.length && !selClientId) setSelClientId(cl[0].id);
    } catch (e) {
      // Backend not available — fall through to sample data so the console
      // is never empty in the preview/demo.
      const sample = BS_CONSOLE_SAMPLE(role);
      setClients(sample.clients);
      setFocusByClient(sample.focusByClient);
      setItemsByClient(sample.itemsByClient);
      setSnapshotByClient(sample.snapshotByClient);
      setProfileByClient(sample.profileByClient);
      if (!selClientId) setSelClientId(sample.clients[0]?.id);
    }
    setLoading(false);
  };

  useEffectBSP(() => { load(); }, [role]);

  useEffectBSP(() => {
    if (selClientId && focusByClient[selClientId] != null) {
      setFocusText(focusByClient[selClientId]);
    } else {
      setFocusText('');
    }
  }, [selClientId]);

  const currentGroup = clients.filter(c => c.status === 'current');
  const pastGroup = clients.filter(c => c.status === 'past');
  const client = clients.find(c => c.id === selClientId) ?? null;
  const snap = selClientId ? (snapshotByClient[selClientId] ?? null) : null;
  const items = selClientId ? (itemsByClient[selClientId] ?? []) : [];
  const profile = selClientId ? (profileByClient[selClientId] ?? null) : null;

  const sendFocus = async () => {
    if (!selClientId || !focusText.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await window.ShapeProConsole.post(role, { action: 'focus', clientId: selClientId, text: focusText.trim() });
      setFocusByClient(prev => ({ ...prev, [selClientId]: focusText.trim() }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const addItem = async () => {
    const name = itemName.trim();
    if (!selClientId || !name || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await window.ShapeProConsole.post(role, {
        action: 'addItem',
        clientId: selClientId,
        payload: { name, ...(itemNote.trim() ? { note: itemNote.trim() } : {}) },
      });
      const newItem = { id: res.id, name, ...(itemNote.trim() ? { note: itemNote.trim() } : {}) };
      setItemsByClient(prev => ({ ...prev, [selClientId]: [...(prev[selClientId] ?? []), newItem] }));
      setItemName(''); setItemNote('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const removeItem = async (itemId) => {
    if (!selClientId || busy) return;
    setBusy(true); setErr('');
    try {
      await window.ShapeProConsole.post(role, { action: 'removeItem', clientId: selClientId, itemId });
      setItemsByClient(prev => ({ ...prev, [selClientId]: (prev[selClientId] ?? []).filter(i => i.id !== itemId) }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: t.PAPER2, border: `1px solid ${t.RULE}`, borderRadius: 10,
    padding: '10px 12px', fontFamily: t.MONO, fontSize: 12, color: t.INK,
    outline: 'none', resize: 'none',
  };
  const btnStyle = (col = accent) => ({
    padding: '10px 16px', borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
    background: col, color: t.PAPER, fontFamily: t.MONO, fontWeight: 700,
    fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: busy ? 0.6 : 1,
  });

  const Wrapper = embedded ? React.Fragment : BSPage;
  return (
    <Wrapper>
      {/* Header — only when standalone, not when embedded inside another page */}
      {!embedded && (
        <div style={{ padding: `54px ${t.padX}px 14px`, borderBottom: `2px solid ${t.INK}` }}>
          <BSEyebrow color={accent}>{isNutri ? 'Nutritionist Console' : 'Trainer Console'}</BSEyebrow>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: t.W.display, letterSpacing: '-0.04em', color: t.INK, marginTop: 4, lineHeight: 1 }}>
            {isNutri ? 'Meal & Focus Hub' : 'Workout & Focus Hub'}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: `40px ${t.padX}px`, textAlign: 'center', fontFamily: t.MONO, fontSize: 11, color: t.INK50, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Loading…
        </div>
      ) : clients.length === 0 ? (
        <div style={{ padding: `40px ${t.padX}px` }}>
          <div style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>No clients yet</div>
          <div style={{ fontFamily: t.SERIF || t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.5 }}>
            Clients appear here once they book a session or subscribe.
          </div>
        </div>
      ) : (
        <>
          {/* Client selector */}
          <div style={{ padding: `14px ${t.padX}px 0` }}>
            <BSEyebrow>Select client</BSEyebrow>
            <button type="button" onClick={() => setDropdownOpen(o => !o)} style={{
              marginTop: 6, width: '100%', background: t.PAPER2, border: `1px solid ${t.RULE}`,
              borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', cursor: 'pointer', color: t.INK,
            }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {client?.name ?? 'Choose a client'}
              </span>
              <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.1em' }}>
                {dropdownOpen ? '▲' : '▼'}
              </span>
            </button>
            {dropdownOpen && (
              <div style={{ border: `1px solid ${t.RULE}`, borderRadius: 10, marginTop: 4, overflow: 'hidden', background: t.PAPER }}>
                {currentGroup.length > 0 && (
                  <>
                    <div style={{ padding: '6px 14px 4px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, borderBottom: `1px solid ${t.RULE}` }}>Current</div>
                    {currentGroup.map(c => (
                      <button key={c.id} type="button" onClick={() => { setSelClientId(c.id); setDropdownOpen(false); }} style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: `1px solid ${t.RULE}`,
                        background: c.id === selClientId ? `${accent}18` : t.PAPER, border: 'none', cursor: 'pointer',
                        fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK,
                      }}>{c.name}</button>
                    ))}
                  </>
                )}
                {pastGroup.length > 0 && (
                  <>
                    <div style={{ padding: '6px 14px 4px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, borderBottom: `1px solid ${t.RULE}`, borderTop: currentGroup.length ? `1px solid ${t.RULE}` : 'none' }}>Past</div>
                    {pastGroup.map(c => (
                      <button key={c.id} type="button" onClick={() => { setSelClientId(c.id); setDropdownOpen(false); }} style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: `1px solid ${t.RULE}`,
                        background: c.id === selClientId ? `${t.INK}12` : t.PAPER, border: 'none', cursor: 'pointer',
                        fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK70,
                      }}>{c.name}</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Snapshot stats */}
          {snap && (
            <div style={{ margin: `12px ${t.padX}px 0`, padding: 14, border: `1px solid ${t.RULE}`, borderRadius: 12, background: t.PAPER2 }}>
              <BSEyebrow color={accent}>Latest snapshot</BSEyebrow>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                {[
                  { l: 'Weight', v: snap.weight_lb != null ? `${Number(snap.weight_lb).toFixed(1)} lb` : '—' },
                  { l: 'Sleep', v: snap.sleep_hours != null ? `${Number(snap.sleep_hours).toFixed(1)} h` : '—' },
                  { l: isNutri ? 'Protein' : 'Calories', v: isNutri
                      ? (snap.protein_g != null ? `${Math.round(snap.protein_g)} g` : '—')
                      : (snap.calories != null ? `${Math.round(snap.calories)} kcal` : '—') },
                  { l: isNutri ? 'Calories' : 'Resting HR', v: isNutri
                      ? (snap.calories != null ? `${Math.round(snap.calories)} kcal` : '—')
                      : (snap.resting_hr != null ? `${snap.resting_hr} bpm` : '—') },
                  ...(profile?.age != null ? [{ l: 'Age', v: String(profile.age) }] : []),
                  ...(profile?.focus ? [{ l: 'Goal', v: String(profile.focus).slice(0, 24) }] : []),
                ].map(m => (
                  <div key={m.l}>
                    <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{m.l}</div>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: t.W.display, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Focus banner */}
          <div style={{ padding: `14px ${t.padX}px 0` }}>
            <BSEyebrow>Focus message</BSEyebrow>
            <textarea
              rows={3}
              value={focusText}
              onChange={e => setFocusText(e.target.value)}
              placeholder={isNutri ? 'e.g. Hit 140 g protein every day this week' : 'e.g. Focus on hip hinge pattern this week'}
              style={{ ...inputStyle, marginTop: 6 }}
            />
            <button type="button" onClick={sendFocus} disabled={busy || !focusText.trim()} style={{ ...btnStyle(), marginTop: 8 }}>
              Send focus
            </button>
          </div>

          {/* Pushed items */}
          <div style={{ padding: `14px ${t.padX}px 0` }}>
            <BSEyebrow>{isNutri ? 'Pushed meals' : 'Pushed exercises'}</BSEyebrow>
            {items.length === 0 ? (
              <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 11, color: t.INK50, letterSpacing: '0.08em' }}>
                {isNutri ? 'No meals pushed yet.' : 'No exercises pushed yet.'}
              </div>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '10px 12px', background: t.PAPER2, border: `1px solid ${t.RULE}`, borderRadius: 10,
                  }}>
                    <div>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{item.name}</div>
                      {item.note && <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.06em' }}>{item.note}</div>}
                    </div>
                    <button type="button" onClick={() => removeItem(item.id)} style={{
                      border: 'none', background: 'none', cursor: 'pointer', padding: 4,
                      fontFamily: t.MONO, fontSize: 10, color: t.RUST, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add item form */}
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                placeholder={isNutri ? 'Meal name…' : 'Exercise name…'}
                style={{ ...inputStyle }}
              />
              <input
                type="text"
                value={itemNote}
                onChange={e => setItemNote(e.target.value)}
                placeholder={isNutri ? 'Notes (optional)' : 'Sets / reps / cues (optional)'}
                style={{ ...inputStyle }}
              />
              <button type="button" onClick={addItem} disabled={busy || !itemName.trim()} style={btnStyle()}>
                {isNutri ? 'Push meal' : 'Push exercise'}
              </button>
            </div>
          </div>

          {err ? (
            <div style={{ margin: `10px ${t.padX}px 0`, padding: '10px 12px', background: `${t.RUST}18`, border: `1px solid ${t.RUST}55`, borderRadius: 10, fontFamily: t.MONO, fontSize: 11, color: t.RUST }}>
              {err}
            </div>
          ) : null}

          <div style={{ height: 100 }} />
        </>
      )}
    </Wrapper>
  );
}

window.BSTrainerApp = BSTrainerApp;
window.BSNutritionistApp = BSNutritionistApp;


Object.assign(window, { BSTrainerApp, BSNutritionistApp });
