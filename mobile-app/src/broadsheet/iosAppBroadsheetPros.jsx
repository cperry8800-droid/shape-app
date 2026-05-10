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
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.15em', textTransform: 'uppercase', color: w.c, fontWeight: 900 }}>{w.k}</span>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: w.c, boxShadow: `0 0 0 3px ${w.c}22`, flexShrink: 0 }} />
            </div>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 27, fontWeight: t.W.display, letterSpacing: '-0.052em', lineHeight: 0.95, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{w.v}</div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.25 }}>{w.sub}</div>
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
  BSClientChat, BSSettings, BSShapeScorePage, BSShapeStorePage, BSContactPage, BSTermsPage, SHAPE_SCORE_PROFILES,
} = window;

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
      started_at: '2026-04-21T13:05:00Z',
      ended_at: '2026-04-21T13:57:00Z',
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
        { id: 'n1', body: isNutri ? 'Good adherence. Ask about late-day hunger before changing macros.' : 'Rest timing is solid. Cue slower eccentric on set 2 next week.', visibility: 'client', created_at: '2026-04-21T16:05:00Z' },
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
      <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{label}</div>
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
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
                {session.status || 'completed'} - {formatReviewSeconds(session.duration_seconds)}
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <>
          <BSSection title="Session detail" meta={selected.status || 'completed'} />
          <div style={{ margin: `0 ${t.padX}px 14px`, border: `1px solid ${t.RULE}`, borderTop: `2px solid ${t.INK}`, borderRadius: 14, background: t.PAPER2, overflow: 'hidden' }}>
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

            <div style={{ borderTop: `1px solid ${t.RULE}` }}>
              {setLogs.map((entry, index) => (
                <div key={entry.id || index} style={{ padding: '11px 14px', borderTop: index ? `1px solid ${t.RULE}` : 0, display: 'grid', gridTemplateColumns: '1.25fr 0.7fr 0.7fr', gap: 9, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 750, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.movement_name || entry.moveName || 'Movement'} #{entry.set_number || entry.setNumber || index + 1}
                    </div>
                    <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
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
                  {sample.value ?? '--'} <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.INK50, textTransform: 'uppercase' }}>{sample.unit || ''}</span>
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
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent, fontWeight: 900 }}>
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
              fontSize: 8,
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

function BSProWeekStrip({ goCalendar, dots, label = 'This week', selDay: selDayProp, onSelectDay }) {
  const t = useBS();
  const [internalSel, setInternalSel] = useStateBSP(21);
  const selDay = selDayProp != null ? selDayProp : internalSel;
  const setSelDay = onSelectDay || setInternalSel;
  const days = [
    { d: 20, l: 'M' }, { d: 21, l: 'T', isToday: true }, { d: 22, l: 'W' },
    { d: 23, l: 'T' }, { d: 24, l: 'F' }, { d: 25, l: 'S' }, { d: 26, l: 'S' },
  ];
  return (
    <>
      <BSSection
        title={label}
        kicker={`Wk 17 · Apr 20–26 · Apr ${selDay}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', fontWeight: 800, color: t.INK, marginLeft: 'auto' }}>Month view →</span>}
      />
      <div style={{ padding: `0 ${t.padX}px 14px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderTop: `2px solid ${t.INK}`, paddingTop: 10 }}>
          {days.map((day) => {
            const on    = day.d === selDay;
            const today = day.isToday;
            const dd    = (dots && dots[day.d]) || [];
            return (
              <button key={day.d} onClick={() => setSelDay(day.d)} style={{
                borderRadius: t.RADIUS_SM,
                border: `1px solid ${on ? t.INK : t.HAIR}`,
                background: on ? t.INK : (today ? t.PAPER2 : 'transparent'),
                color: on ? t.PAPER : t.INK,
                padding: '8px 0 6px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', fontWeight: 600, opacity: today && !on ? 1 : 0.7 }}>{day.l}</span>
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
  const [tab, setTab] = useStateBSP('today');
  const [showSettings, setShowSettings] = useStateBSP(false);
  const [showCalendar, setShowCalendar] = useStateBSP(false);
  const [showReviews, setShowReviews] = useStateBSP(false);
  const [showHabits, setShowHabits] = useStateBSP(false);
  const [storeView, setStoreView] = useStateBSP('store');
  const [programInitialTab, setProgramInitialTab] = useStateBSP('programs');
  const [queueView, setQueueView] = useStateBSP(null);
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
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="trainer" onProfile={goSettings} onBack={() => setShowCalendar(false)} />;
  if (showReviews) return <BSWorkoutReviewPage role="trainer" onBack={() => setShowReviews(false)} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setShowHabits(false)} onOpenScore={() => { setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="trainer" type={queueView} onBack={() => setQueueView(null)} />;
  const screens = {
    today:    <BSTrainerToday onProfile={goSettings} sheet={sheet} goCalendar={() => setShowCalendar(true)} goRadio={goRadio} onOpenReviews={() => setShowReviews(true)} onWidgetOpen={openHomeWidget} onOpenHabits={() => setShowHabits(true)} onOpenScore={() => { setStoreView('score'); setTab('store'); }} tweaks={tweaks} setTweak={setTweak} />,
    clients:  <BSTrainerClients sheet={sheet} />,
    programs: <BSTrainerPrograms sheet={sheet} initialTab={programInitialTab} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="trainer" />,
    radio:    <BSRadioScreen onBack={() => setTab('today')} />,
    store:    storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => setTab('today')} onOpenScore={() => setStoreView('score')} />,
    me:       <BSProMe role="trainer" name="Jordan Chen" onLogout={onLogout} onSettings={goSettings} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
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

function _BSTrainerApp_old({ onLogout }) {
  const [tab, setTab] = useStateBSP('today');
  const screens = {
    today:    <BSTrainerToday onProfile={onLogout} />,
    clients:  <BSTrainerClients />,
    programs: <BSTrainerPrograms />,
    me:       <BSProMe role="trainer" name="Jordan Chen" onLogout={onLogout} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'clients',  label: 'Clients' },
        { key: 'programs', label: 'Plans' },
        { key: 'me',       label: 'Me' },
      ]} />
    </div>
  );
}

function BSTrainerToday({ onProfile, sheet, goCalendar, goRadio, onOpenReviews, onWidgetOpen = () => {}, onOpenHabits = () => {}, onOpenScore = () => {}, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const [selDay, setSelDay] = useStateBSP(21);

  // Per-day bookings dataset. Apr 21 (today) is the full roster; other days lighter.
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
  const bookings = TRAINER_BOOKINGS[selDay] || [];

  // Per-day lead. selDay 21 = today's narrative.
  const TRAINER_LEAD = {
    20: { count: '3', kicker: 'Mon · Apr 20',  copy: 'Light Monday — catch-up day for async reviews.' },
    21: { count: '8', kicker: "Lead · Today's roster", copy: "First at 7am. Two free hours at noon to write Maya's program." },
    22: { count: '2', kicker: 'Wed · Apr 22',  copy: 'Quiet day. Block out the morning for Maya.' },
    23: { count: '2', kicker: 'Thu · Apr 23',  copy: 'One live, one async. Easy build-up to Friday.' },
    24: { count: '2', kicker: 'Fri · Apr 24',  copy: 'Two heavy sessions — Casey & Quinn back-to-back area.' },
    25: { count: '0', kicker: 'Sat · Apr 25',  copy: 'Off day. Programming refresh on the docket.' },
    26: { count: '1', kicker: 'Sun · Apr 26',  copy: 'Open hours — drop-in consults only.' },
  };
  const lead = TRAINER_LEAD[selDay] || TRAINER_LEAD[21];
  return (
    <BSPage>
      <BSMasthead
        title={<span className="bs-daily-title" style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span className="bs-daily-the" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>The</span>
          <span className="bs-daily-shape" style={{ display: 'inline-block', marginLeft: 8, marginRight: 10, fontFamily: "'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif", fontWeight: 300, fontStyle: 'normal', fontSize: 37, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)' }}>SHAPE</span>
          <span className="bs-daily-daily" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>Daily.</span>
        </span>}
        leftKicker="Tue · Apr 21 · 2026"
        rightKicker="14 active clients"
        trailing={<BSAvatar init="J" size={32} fill={t.AMBER} ink={t.PAPER} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.AMBER }}>
          Coaches Edition · No. 21
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. VI
        </span>
      </div>

      <BSTicker items={[
        { label: 'BOOKED',  value: '8 SESN',  note: '6 LIVE · 2 ASYNC' },
        { label: 'REVENUE', value: '$1.2K',   note: 'TODAY' },
        { label: 'AVG RPE', value: '7.4',     color: '#a3e09a' },
        { label: 'PRGRM',   value: '12',      note: '4 EDITED THIS WEEK' },
        { label: 'CLIENTS', value: '14',      note: '+2 NEW' },
      ]} />

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
                fontSize: 8,
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
        dots={{
          20: [t.RUST, t.RUST, t.BLUE],
          21: [t.RUST, t.RUST, t.RUST],
          22: [t.AMBER, t.GREEN],
          23: [t.RUST, t.BLUE],
          24: [t.RUST, t.RUST],
          25: [],
          26: [t.GREEN],
        }}
      />

      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.AMBER}>{lead.kicker}</BSEyebrow>
          <BSEyebrow>{selDay === 21 ? '09:42' : `Apr ${selDay}`}</BSEyebrow>
        </div>
        <BSHeadlineNumber value={lead.count} unit="SESSIONS" />
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: t.body + 1, color: t.INK70, lineHeight: 1.3, fontWeight: 500 }}>
          {lead.copy}
        </div>
      </div>

      <BSSection
        title={selDay === 21 ? "Today's bookings" : `Bookings · Apr ${selDay}`}
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

      {/* ── HABIT TRACKER ─────────────────────────────────────────── */}

      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Editorial · Cohort 6 review
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          11 of 14 hit RPE targets last week. Casey and Drew need a deload — pull them off Block 3 if RPE creeps.
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

function BSTrainerClients() {
  const t = useBS();
  const [previewClient, setPreviewClient] = useStateBSP(null);
  const [fullClient, setFullClient] = useStateBSP(null);
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
    <BSPage>
      <BSPageHeader kicker="Section · Roster" title={<>14<br/>clients.</>} />
      <BSSection title="By status" meta="Sorted by last seen" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { i: 'A', c: t.RUST,  n: 'Alex Rivera',    r: 'CUT · W6 · D38',   d: 'JUST NOW',   s: 'on track' },
          { i: 'S', c: t.BLUE,  n: 'Sam Patel',      r: 'BUILD · W3',       d: '2H AGO',     s: 'on track' },
          { i: 'R', c: t.AMBER, n: 'Riley Kim',      r: 'CUT · W8',         d: '1D AGO',     s: 'review form' },
          { i: 'C', c: t.AMBER, n: 'Casey Lee',      r: 'PEAK · W11',       d: '1D AGO',     s: 'deload soon' },
          { i: 'D', c: t.GREEN, n: 'Drew Park',      r: 'PEAK · W11',       d: '2D AGO',     s: 'deload soon' },
          { i: 'M', c: t.RUST,  n: 'Morgan Liu',     r: 'INTAKE',           d: 'NEW',        s: 'onboard' },
          { i: 'Q', c: t.BLUE,  n: 'Quinn Choi',     r: 'BUILD · W2',       d: '3D AGO',     s: 'on track' },
        ].map((c, i, arr) => (
          <button key={i} onClick={() => setPreviewClient(c)} style={{ width: '100%', border: 0, background: 'transparent',
            display: 'grid', gridTemplateColumns: '40px 1fr 90px',
            gap: 12, padding: `${t.rowY + 4}px 0`, alignItems: 'center',
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            cursor: 'pointer',
          }}>
            <BSAvatar init={c.i} fill={c.c} size={36} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{c.n}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em' }}>{c.r}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <BSEyebrow color={c.s === 'deload soon' ? t.RUST : t.INK50}>{c.d}</BSEyebrow>
            </div>
          </button>
        ))}
      </div>
      <BSFooter left="The Coach Edition" right="Pg 2 of 4" />
    </BSPage>
  );
}

function BSProClientPreviewPage({ client, onBack, onViewFullProfile }) {
  const t = useBS();
  if (!client) return null;
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Roster" title={<>Client<br/>preview.</>} trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>} />
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

function BSProClientFullProfilePage({ client, onBack }) {
  const t = useBS();
  if (!client) return null;
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Client" title={<>Full<br/>profile.</>} trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, alignItems: 'center', padding: `${t.rowY + 6}px 0`, borderBottom: `1px solid ${t.HAIR}` }}>
          <BSAvatar init={client.i} fill={client.c} size={36} />
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK }}>{client.n}</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase' }}>{client.r}</div>
          </div>
        </div>
        <div style={{ padding: `${t.rowY + 8}px 0`, borderBottom: `1px solid ${t.HAIR}` }}>
          <BSEyebrow>Coach notes</BSEyebrow>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.4, color: t.INK70 }}>
            Client profile drill-down page for {client.n}. Training history, compliance, habits, nutrition logs, and messaging context can be expanded here.
          </div>
        </div>
      </div>
      <BSFooter left="Full profile" right={client.n} />
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

  const label = isNutri ? 'Meal-plan generator' : kind === 'program' ? 'Program generator' : 'Workout generator';
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
            <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800, marginBottom: 4 }}>{labelText}</span>
            <input value={value} onChange={(e) => setter(e.target.value)} style={{ width: '100%', border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10, background: t.PAPER2, color: t.INK, padding: '9px 10px', fontFamily: t.DISPLAY, fontSize: 13, outline: 'none' }} />
          </label>
        ))}
        <label style={{ display: 'block', gridColumn: '1 / -1' }}>
          <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800, marginBottom: 4 }}>{isNutri ? 'Food preferences' : 'Equipment / constraints'}</span>
          <input value={preferences} onChange={(e) => setPreferences(e.target.value)} style={{ width: '100%', border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10, background: t.PAPER2, color: t.INK, padding: '9px 10px', fontFamily: t.DISPLAY, fontSize: 13, outline: 'none' }} />
        </label>
        <button onClick={generate} style={{ gridColumn: '1 / -1', borderRadius: 12, border: `1px solid ${t.SURFACE_BORDER}`, background: t.PAPER2, color: t.INK, padding: '12px 14px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 900 }}>
          Generate draft
        </button>
        {status && <div style={{ gridColumn: '1 / -1', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.07em', color: t.INK50, lineHeight: 1.45 }}>{status}</div>}
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
                  <input value={block.note || ''} onChange={(e) => updateBlock(i, { note: e.target.value })} style={{ border: 0, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 8.5, outline: 'none' }} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setStatus('Draft saved locally. Next step is connecting this to the publish/send workflow.')} style={{ marginTop: 10, width: '100%', borderRadius: 12, border: `1px solid ${t.SURFACE_BORDER}`, background: `${accent}24`, color: t.INK, padding: '11px 14px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 900 }}>
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
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800, flexShrink: 0 }}>{item.price}</span>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.v} - {item.meta}</div>
      </div>
      <span style={{ borderRadius: 999, border: `1px solid ${t.SURFACE_BORDER}`, padding: '6px 8px', background: t.PAPER2, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 900 }}>
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
              fontSize: 8,
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
      <div style={{ margin: `16px ${t.padX}px 0`, padding: 14, border: `1px solid ${t.RULE}`, borderRadius: 14, background: 'rgba(255,255,255,0.42)', boxShadow: '0 8px 18px rgba(10,13,12,0.035)' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800 }}>
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
    fontSize: 8.5,
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
    fontSize: 8.5,
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
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>
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
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', color: t.INK50, textTransform: 'uppercase' }}>
                    {platformName(p)} - {p.bpm} BPM - {p.tracks} tracks
                  </div>
                </div>
                <span style={{ borderRadius: 999, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.PAPER, background: p.service === 'spotify' ? t.GREEN : t.BLUE, padding: '5px 8px', fontWeight: 800 }}>
                  {p.service === 'spotify' ? 'SPOT' : 'APPLE'}
                </span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${accent}`, color: accent, background: `${accent}12`, padding: '5px 8px', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800 }}>{p.targetType}</span>
                <span style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, color: t.INK, background: t.PAPER2, padding: '5px 8px', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{p.attached}</span>
                <span style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.SURFACE_BORDER || t.RULE}`, color: t.INK50, background: t.PAPER2, padding: '5px 8px', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{isSent ? 'Sent to clients' : p.clients}</span>
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
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="nutritionist" onProfile={goSettings} onBack={() => setShowCalendar(false)} />;
  if (showReviews) return <BSWorkoutReviewPage role="nutritionist" onBack={() => setShowReviews(false)} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setShowHabits(false)} onOpenScore={() => { setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="nutritionist" type={queueView} onBack={() => setQueueView(null)} />;
  const screens = {
    today:    <BSNutriToday onProfile={goSettings} sheet={sheet} goCalendar={() => setShowCalendar(true)} goRadio={goRadio} onOpenReviews={() => setShowReviews(true)} onWidgetOpen={openHomeWidget} onOpenHabits={() => setShowHabits(true)} onOpenScore={() => { setStoreView('score'); setTab('store'); }} tweaks={tweaks} setTweak={setTweak} />,
    clients:  <BSNutriClients sheet={sheet} />,
    plans:    <BSNutriPlans sheet={sheet} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="nutritionist" />,
    radio:    <BSRadioScreen onBack={() => setTab('today')} />,
    store:    storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => setTab('today')} onOpenScore={() => setStoreView('score')} />,
    me:       <BSProMe role="nutritionist" name="Dr. Maya Patel" onLogout={onLogout} onSettings={goSettings} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
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

function _BSNutritionistApp_old({ onLogout }) {
  const [tab, setTab] = useStateBSP('today');
  const screens = {
    today:    <BSNutriToday onProfile={onLogout} />,
    clients:  <BSNutriClients />,
    plans:    <BSNutriPlans />,
    me:       <BSProMe role="nutritionist" name="Dr. Maya Patel" onLogout={onLogout} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'clients',  label: 'Clients' },
        { key: 'plans',    label: 'Plans' },
        { key: 'me',       label: 'Me' },
      ]} />
    </div>
  );
}

function BSNutriToday({ onProfile, sheet, goCalendar, goRadio, onOpenReviews, onWidgetOpen = () => {}, onOpenHabits = () => {}, onOpenScore = () => {}, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  return (
    <BSPage>
      <BSMasthead
        title={<span className="bs-daily-title" style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span className="bs-daily-the" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>The</span>
          <span className="bs-daily-shape" style={{ display: 'inline-block', marginLeft: 8, marginRight: 10, fontFamily: "'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif", fontWeight: 300, fontStyle: 'normal', fontSize: 37, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)' }}>SHAPE</span>
          <span className="bs-daily-daily" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>Daily.</span>
        </span>}
        leftKicker="Tue · Apr 21 · 2026"
        rightKicker="22 plans · 5 consults"
        trailing={<BSAvatar init="M" size={32} fill={t.RUST} ink={t.PAPER} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.RUST }}>
          Coaches Edition · No. 21
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. VI
        </span>
      </div>

      <BSTicker items={[
        { label: 'CONSLT', value: '5 BOOKED', note: '2 INTAKE' },
        { label: 'PLANS',  value: '22 ACTV',  note: '6 EDITED 7D' },
        { label: 'AVG ADHR', value: '78%',    color: '#a3e09a' },
        { label: 'NEW',    value: '+3 7D',    color: '#7ed4ff' },
      ]} />

      <div style={{
        padding: `10px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            { label: 'Today', meta: '5 consults', active: true, onClick: () => {} },
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
                fontSize: 8,
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
        dots={{
          20: [t.BLUE, t.BLUE],
          21: [t.GREEN, t.BLUE, t.BLUE],
          22: [t.BLUE],
          23: [t.GREEN, t.BLUE],
          24: [t.BLUE, t.BLUE],
          25: [],
          26: [t.AMBER],
        }}
      />

      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.RUST}>Lead · Consults today</BSEyebrow>
          <BSEyebrow>09:42</BSEyebrow>
        </div>
        <BSHeadlineNumber value="5" unit="CONSULTS" />
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: t.body + 1, color: t.INK70, lineHeight: 1.3, fontWeight: 500 }}>
          Two intakes, three follow-ups. First at 11am.
        </div>
      </div>

      <BSSection title="Today's consults" meta={<span onClick={goCalendar} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Open calendar →</span>} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { time: '11:00', tag: 'INTK', tagColor: t.GREEN, title: 'Sara Mendez',  sub: 'Initial · 60m' },
          { time: '13:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Jamie Wong',    sub: 'Cut adjustment · 30m' },
          { time: '15:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Alex Rivera',  sub: 'Macro check · 30m', state: 'next' },
          { time: '16:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Riley Kim',     sub: 'Refeed plan · 30m' },
          { time: '17:30', tag: 'INTK', tagColor: t.GREEN, title: 'Pat Doan',      sub: 'Initial · 60m', last: true },
        ].map((r, i) => <BSRow key={i} {...r} />)}
      </div>

      {/* ── HABIT TRACKER ─────────────────────────────────────────── */}

      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Field notes
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          Adherence is up 11% on the simplified macro template. Push it to the next 4 intakes.
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
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
    <BSPage>
      <BSPageHeader kicker="Section · Roster" title={<>22<br/>plans.</>} />
      <BSSection title="By adherence" meta="Past 7d" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { i: 'A', c: t.RUST,  n: 'Alex Rivera',  r: 'CUT · 1900 KCAL',  d: '94%', good: true },
          { i: 'J', c: t.BLUE,  n: 'Jamie Wong',   r: 'CUT · 1700 KCAL',  d: '88%', good: true },
          { i: 'R', c: t.AMBER, n: 'Riley Kim',    r: 'CUT · 1850 KCAL',  d: '72%' },
          { i: 'S', c: t.GREEN, n: 'Sara Mendez',  r: 'INTAKE',           d: 'NEW' },
          { i: 'P', c: t.BLUE,  n: 'Pat Doan',     r: 'INTAKE',           d: 'NEW' },
          { i: 'C', c: t.AMBER, n: 'Casey Lee',    r: 'BUILD · 2400',     d: '64%', warn: true },
          { i: 'D', c: t.RUST,  n: 'Drew Park',    r: 'BUILD · 2200',     d: '58%', warn: true },
        ].map((c, i, arr) => (
          <button key={i} onClick={() => setPreviewClient(c)} style={{ width: '100%', border: 0, background: 'transparent',
            display: 'grid', gridTemplateColumns: '40px 1fr 80px',
            gap: 12, padding: `${t.rowY + 4}px 0`, alignItems: 'center',
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            cursor: 'pointer',
          }}>
            <BSAvatar init={c.i} fill={c.c} size={36} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{c.n}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em' }}>{c.r}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <BSEyebrow color={c.warn ? t.RUST : (c.good ? t.GREEN : t.INK50)}>{c.d}</BSEyebrow>
            </div>
          </button>
        ))}
      </div>
      <BSFooter left="The Nutri Edition" right="Pg 2 of 4" />
    </BSPage>
  );
}

function BSNutriPlans() {
  const t = useBS();
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
      border: `1px solid ${t.RULE}`,
      borderRadius: 12,
      background: 'rgba(255,255,255,0.42)',
      boxShadow: '0 8px 18px rgba(10,13,12,0.035)',
      display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 12, alignItems: 'center',
    }}>
      <div style={{ width: 9, height: 9, borderRadius: 99, background: item.c, boxShadow: `0 0 0 4px ${item.c}22` }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.n}</div>
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800, flexShrink: 0 }}>{item.price}</span>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.v} - {item.meta}</div>
      </div>
      <span style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, padding: '6px 8px', background: t.PAPER, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 900 }}>
        {action}
      </span>
    </div>
  );
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Plans" title={<>Meals<br/>& templates.</>} />
      <BSPlanGeneratorCard role="nutritionist" kind="meal_plan" />
      <BSSection title="Meal plans" meta="Recurring subscriptions" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {mealPlans.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="EDIT" />)}
      </div>

      <BSSection title="Templates" meta="Reusable meal frameworks" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {templates.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="EDIT" />)}
      </div>

      <BSSection title="One-time purchases" meta="Not meal plans - not subscriptions" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {oneTime.map((p, i, arr) => <ProductRow key={p.n} item={p} i={i} arr={arr} action="SELL" />)}
      </div>

      <BSCoachPlaylistStudio
        role="nutritionist"
        targets={musicTargets}
        title="Playlist studio"
        meta="Spotify + Apple Music"
        copy="Create custom playlists, attach them to meal plans, templates, or one-time nutrition assets, and send playable Spotify or Apple Music links to clients."
      />

      <div style={{ margin: `16px ${t.padX}px 0`, padding: 14, border: `1px solid ${t.RULE}`, borderRadius: 14, background: 'rgba(255,255,255,0.42)', boxShadow: '0 8px 18px rgba(10,13,12,0.035)' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 800 }}>
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
function BSProMe({ role, name, onLogout }) {
  const t = useBS();
  const isCoach = role === 'trainer';
  const accent = isCoach ? t.AMBER : t.RUST;
  const init = name[0];
  const [showScore, setShowScore] = useStateBSP(false);
  const [showStore, setShowStore] = useStateBSP(false);
  const [showContact, setShowContact] = useStateBSP(false);
  const [showTerms, setShowTerms] = useStateBSP(false);
  const [showGoals, setShowGoals] = useStateBSP(false);
  const [showPublicProfile, setShowPublicProfile] = useStateBSP(false);
  const [showBookingCalendar, setShowBookingCalendar] = useStateBSP(false);
  const [showNotifications, setShowNotifications] = useStateBSP(false);
  const scoreProfile = SHAPE_SCORE_PROFILES?.[role] || SHAPE_SCORE_PROFILES?.client;
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
    return <BSProPublicProfilePage role={role} name={name} onBack={() => setShowPublicProfile(false)} />;
  }
  if (showBookingCalendar) {
    return <BSCalendarScreen role={role} onProfile={() => setShowPublicProfile(true)} onBack={() => setShowBookingCalendar(false)} />;
  }
  if (showNotifications) {
    return <BSProNotificationsPage onBack={() => setShowNotifications(false)} />;
  }

  return (
    <BSPage>
      <BSPageHeader kicker={isCoach ? 'Coach · 4.9 ★' : 'Nutritionist · 4.9 ★'} title={<>{name.split(' ')[0]}<br/>{name.split(' ').slice(1).join(' ')}.</>} trailing={<BSAvatar init={init} size={32} fill={accent} ink={t.PAPER} />} />

      <button onClick={() => setShowScore(true)} style={{ borderRadius: 0,
        width: '100%', textAlign: 'left', padding: `16px ${t.padX}px 18px`,
        border: 0, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2,
        color: t.INK, cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <BSEyebrow color={t.ACCENT}>Shape Score</BSEyebrow>
          <BSEyebrow>{scoreProfile.week} this wk - details</BSEyebrow>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 62, fontWeight: 700, color: t.INK, letterSpacing: '-0.05em', lineHeight: 0.95 }}>{scoreProfile.total.toLocaleString()}</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 500, color: t.INK50, letterSpacing: '-0.04em', marginBottom: 8 }}>/{scoreProfile.goal.toLocaleString()}</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { k: 'WEEK',   v: scoreProfile.weekRatio, n: scoreProfile.week, c: t.AMBER },
            { k: 'STREAK', v: scoreProfile.streakRatio, n: `${scoreProfile.streak}D`, c: t.GREEN },
            { k: 'TIER',   v: scoreProfile.tierRatio, n: scoreProfile.tierShort, c: t.ACCENT },
            { k: 'SPEND',  v: scoreProfile.spendRatio, n: scoreProfile.available.toLocaleString(), c: t.BLUE },
          ].map(r => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 86, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', color: t.INK70, fontWeight: 600 }}>{r.k}</div>
              <div style={{ flex: 1, height: 4, background: t.HAIR, position: 'relative' }}>
                <div style={{ width: `${r.v * 100}%`, height: '100%', background: r.c }} />
              </div>
              <div style={{ width: 34, textAlign: 'right', fontFamily: t.MONO, fontSize: 10, color: t.INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.n}</div>
            </div>
          ))}
        </div>
      </button>

      <div style={{ padding: `22px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
        <BSEyebrow color={t.ACCENT}>This month</BSEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12, gap: 0 }}>
          {[
            { l: 'CLIENTS', v: isCoach ? '14' : '22' },
            { l: 'REV',     v: isCoach ? '$8.4K' : '$11.2K' },
            { l: 'RATING',  v: '4.9' },
          ].map((m, i) => (
            <div key={m.l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 12 : 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50 }}>{m.l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, color: t.INK, marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      <BSSection title="Settings" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { l: 'Public profile',          r: 'Live', action: () => setShowPublicProfile(true) },
          { l: 'Booking calendar',        r: 'Synced', action: () => setShowBookingCalendar(true) },
          { l: 'Goal plan',               r: 'Q2 targets', action: () => setShowGoals(true) },
          { l: 'Shape Store',             r: `${scoreProfile.available.toLocaleString()} pts`, action: () => setShowStore(true) },
          { l: 'Payouts',                 r: 'Stripe', action: startPayoutSetup },
          { l: 'Contact support',         r: '24h reply', action: () => setShowContact(true) },
          { l: 'Terms of service',        r: 'Legal', action: () => setShowTerms(true) },
          { l: 'Notifications',           r: 'On', action: () => setShowNotifications(true) },
          { l: 'Sign out', alert: true },
        ].map((s, i, arr) => (
          <div key={i} onClick={s.alert ? onLogout : s.action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `${t.rowY + 4}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            cursor: (s.alert || s.action) ? 'pointer' : 'default',
          }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: s.alert ? t.RUST : t.INK, letterSpacing: '-0.01em' }}>{s.l}</span>
            {s.r && <BSEyebrow>{s.r}</BSEyebrow>}
          </div>
        ))}
      </div>

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
        trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>}
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
        trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>}
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
        trailing={<button onClick={onBack} style={{ borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '8px 10px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Back</button>}
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

window.BSTrainerApp = BSTrainerApp;
window.BSNutritionistApp = BSNutritionistApp;


Object.assign(window, { BSTrainerApp, BSNutritionistApp });
