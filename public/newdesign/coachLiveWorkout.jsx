// One read-only workout monitor for the desktop client page and both consoles.
// The shared transport rechecks RLS, recovers missed events and reports freshness.
async function coachLiveRuntime() {
  const [transport, validate] = await Promise.all([
    import('/newdesign/liveWatch.mjs'),
    import('/newdesign/liveProgress.mjs'),
  ]);
  return { ...transport, ...validate };
}

function CoachLiveWorkoutPanel(props) {
  // Remount before rendering another client's readings or sending state.
  return <CoachLiveWorkoutSession key={`${props.clientId}:${props.role}`} {...props} />;
}

function CoachLiveWorkoutSession({ clientId, clientName = 'client', role = 'trainer', accent = 'var(--sh-accent, #2ee0c4)', loadRuntime = coachLiveRuntime }) {
  const [snapshot, setSnapshot] = React.useState({ status: 'connecting', publicRow: null, coachRow: null, lastSyncedAt: null });
  const [runtime, setRuntime] = React.useState(null);
  const [retry, setRetry] = React.useState(0);
  const [cue, setCue] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [cueResult, setCueResult] = React.useState('');
  const [cueError, setCueError] = React.useState('');
  const active = React.useRef(true);
  const request = React.useRef(null);
  const cueGeneration = React.useRef(0);
  const [identityValid, setIdentityValid] = React.useState(true);
  const inputId = React.useId();
  React.useEffect(() => {
    active.current = true;
    let owner; let hadOwner = false;
    const subscription = window.shapeDb?.client?.auth?.onAuthStateChange?.((eventName, session) => {
      const nextOwner = session?.user?.id || null;
      if (owner === undefined && eventName !== 'SIGNED_OUT') { owner = nextOwner; hadOwner = !!nextOwner; return; }
      // A cookie-only session first registers as anonymous, then getSession()
      // bridges it into Supabase. That first sign-in is not an account switch.
      if (owner === null && !hadOwner && nextOwner) { owner = nextOwner; hadOwner = true; return; }
      if (eventName !== 'SIGNED_OUT' && owner === nextOwner) return;
      owner = nextOwner;
      cueGeneration.current++;
      const pending = request.current; request.current = null; pending?.abort();
      setCue(''); setCueResult(''); setCueError(''); setSending(false);
      setIdentityValid(false);
      setSnapshot({ status: 'idle', publicRow: null, coachRow: null, lastSyncedAt: null });
    })?.data?.subscription;
    return () => {
      active.current = false; cueGeneration.current++;
      const pending = request.current; request.current = null; pending?.abort();
      subscription?.unsubscribe();
    };
  }, []);
  React.useEffect(() => {
    let on = true; let stop;
    const generation = cueGeneration.current;
    setSnapshot({ status: 'connecting', publicRow: null, coachRow: null, lastSyncedAt: null });
    (async () => {
      try {
        const sdb = window.shapeDb;
        if (!sdb?.client) throw new Error('Connection unavailable');
        if (sdb.getSession) await sdb.getSession();
        const api = await loadRuntime();
        if (!on || generation !== cueGeneration.current) return;
        setRuntime(api);
        stop = api.watchLiveWorkout({ db: sdb.client, clientId, onChange: next => { if (on && generation === cueGeneration.current) setSnapshot(next); } });
      } catch {
        if (on && generation === cueGeneration.current) setSnapshot({ status: 'reconnecting', publicRow: null, coachRow: null, lastSyncedAt: null });
      }
    })();
    return () => { on = false; stop?.(); };
  }, [clientId, retry, loadRuntime]);
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const validRow = row => row && Date.parse(row.expires_at) > Date.now();
  const cp = runtime && validRow(snapshot.coachRow) ? runtime.bsValidLiveCoachPayload(snapshot.coachRow.payload) : null;
  const publicPayload = runtime && validRow(snapshot.publicRow) ? runtime.bsValidLivePayload(snapshot.publicRow.payload) : null;
  const lp = cp || (publicPayload?.kind !== 'cooking' ? publicPayload : null);
  const source = cp ? snapshot.coachRow : snapshot.publicRow;
  const started = Date.parse(source?.started_at);
  const elapsed = Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : null;
  const clock = elapsed == null ? '' : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const status = snapshot.status === 'live' && !lp ? 'idle' : snapshot.status;
  const canSend = identityValid && !!cp && status === 'live';
  const statusText = { connecting: 'Connecting to workout…', live: 'Live', idle: 'No active workout available', reconnecting: 'Reconnecting — updates may be delayed', stale: 'Updates paused — showing the last received workout' }[status] || 'Connecting to workout…';
  const updated = source?.updated_at ? new Date(source.updated_at) : null;
  const mono = { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.04em' };
  const button = { minHeight: 44, borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.3)', color: 'var(--sh-ink, #f2ede4)', background: 'transparent', fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13, cursor: 'pointer' };
  const cell = { padding: '10px 6px', textAlign: 'left', borderBottom: '1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)', overflowWrap: 'anywhere' };
  async function sendCue(event) {
    event?.preventDefault();
    const text = cue.trim();
    if (!text || request.current || !canSend) return;
    const controller = new AbortController();
    const generation = cueGeneration.current;
    request.current = controller;
    setSending(true); setCueResult(''); setCueError('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`/api/${role === 'nutritionist' ? 'nutritionist' : 'trainer'}/console`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, action: 'focus', text }), signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Could not save cue. Try again.');
      if (!active.current || generation !== cueGeneration.current || request.current !== controller) return;
      setCue(''); setCueResult(`Cue saved for ${clientName}: “${text}”`);
    } catch (error) {
      if (active.current && generation === cueGeneration.current && request.current === controller) setCueError(error?.name === 'AbortError' ? 'Connection timed out. Your cue is still here; try again.' : (error.message || 'Could not save cue. Try again.'));
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (active.current && generation === cueGeneration.current) setSending(false);
      }
    }
  }
  return (
    <Card style={{ marginBottom: 20, borderColor: clwAlpha(accent, 0.4), minWidth: 0 }}>
      <section aria-label={`Live workout for ${clientName}`} className="coach-live-workout" style={{ color: 'var(--sh-ink, #f2ede4)', minWidth: 0 }}>
        <style>{`.coach-live-workout button:focus-visible,.coach-live-workout input:focus-visible,.coach-live-workout summary:focus-visible{outline:2px solid ${accent};outline-offset:3px}.coach-live-workout button:disabled{opacity:.6;cursor:default}.coach-live-workout summary{min-height:44px;cursor:pointer}.coach-live-workout table{width:100%;table-layout:fixed;border-collapse:collapse}`}</style>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 style={{ ...mono, margin: 0, fontSize: 13, textTransform: 'uppercase', color: accent }}>Watching workout</h2>
          <span role="status" style={{ ...mono, color: status === 'live' ? accent : '#e1d5bb', lineHeight: 1.6 }}>{statusText}</span>
        </div>
        {!lp && identityValid && <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(var(--sh-ink-rgb, 242,237,228),0.8)', marginBottom: 0 }}>{status === 'connecting' ? 'Checking for an active workout.' : status === 'idle' ? 'This view updates automatically when workout progress is available.' : 'Checking the connection. You can retry while automatic recovery continues.'}</p>}
        {!identityValid && <p role="status" style={{ fontSize: 14 }}>Your account changed. Reload this page to continue watching.</p>}
        {(status === 'reconnecting' || status === 'stale') && <button type="button" style={{ ...button, marginTop: 12 }} onClick={() => setRetry(n => n + 1)}>Retry connection</button>}
        {lp && <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 18, ...mono, lineHeight: 1.8 }}>
            <span>{lp.resting ? 'Resting' : 'Working'}{clock ? ` · ${clock} elapsed` : ''}</span>
            <span>{lp.setsDone} / {lp.setsTotal} sets completed</span>
          </div>
          <progress aria-label="Workout sets completed" value={lp.setsDone} max={lp.setsTotal} style={{ width: '100%', height: 7, accentColor: accent, margin: '8px 0 14px' }} />
          {updated && Number.isFinite(updated.getTime()) && <p style={{ ...mono, fontSize: 11, color: 'rgba(var(--sh-ink-rgb, 242,237,228),0.75)', margin: '0 0 14px' }}>Last workout update {updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · Read only</p>}
          {lp.curIdx < 0 && <p style={{ fontSize: 14 }}>No exercise selected.</p>}
          {lp.exercises.map((exercise, i) => <details key={i} open={i === lp.curIdx} style={{ borderTop: '1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)', padding: '8px 0' }}>
            <summary style={{ lineHeight: 1.6, padding: '7px 0', overflowWrap: 'anywhere' }}>
              <span style={{ ...mono, color: i === lp.curIdx ? accent : 'rgba(var(--sh-ink-rgb, 242,237,228),0.8)', marginRight: 10 }}>{i === lp.curIdx ? 'NOW' : exercise.done === exercise.total ? 'DONE' : String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontFamily: 'Fraunces, serif', fontSize: 20 }}>{exercise.n}</span>
              <span style={{ ...mono, marginLeft: 12 }}>{exercise.done}/{exercise.total} sets</span>
            </summary>
            {cp && Array.isArray(exercise.sets) ? <>
              <table aria-label={`${exercise.n} logged sets`} style={{ ...mono, fontSize: 12 }}>
                <thead><tr>{['Set', cp.loadUnit ? `Load (${cp.loadUnit})` : 'Load', 'Reps', 'RPE', 'Status'].map(label => <th scope="col" key={label} style={{ ...cell, fontSize: 11, color: 'rgba(var(--sh-ink-rgb, 242,237,228),0.8)' }}>{label}</th>)}</tr></thead>
                <tbody>{exercise.sets.map((set, j) => <tr key={j}><th scope="row" style={cell}>{j + 1}</th><td style={cell}>{set.done && set.load ? set.load : '—'}</td><td style={cell}>{set.done && set.reps ? set.reps : '—'}</td><td style={cell}>{set.done && set.rpe ? set.rpe : '—'}</td><td style={{ ...cell, color: set.done ? accent : 'rgba(var(--sh-ink-rgb, 242,237,228),0.75)' }}>{set.done ? 'Done' : 'Pending'}</td></tr>)}</tbody>
              </table>
              {exercise.sets.length < exercise.total && <p style={{ fontSize: 12, lineHeight: 1.5 }}>Detailed readings are available for the first {exercise.sets.length} sets; the completed count includes all sets.</p>}
            </> : <p style={{ fontSize: 14, color: 'rgba(var(--sh-ink-rgb, 242,237,228),0.8)' }}>Set counts available. No load, reps or RPE readings available.</p>}
          </details>)}
          <form onSubmit={sendCue} style={{ borderTop: '1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)', marginTop: 12, paddingTop: 20 }}>
            <label htmlFor={inputId} style={{ ...mono, display: 'block', marginBottom: 10 }}>Send a cue</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input id={inputId} value={cue} disabled={sending || !canSend} onChange={event => setCue(event.target.value)} maxLength={500} placeholder="Type a quick cue…" style={{ flex: '1 1 220px', minWidth: 0, width: '100%', boxSizing: 'border-box', border: '1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.35)', borderRadius: 8, padding: '12px 14px', background: 'rgba(var(--sh-ink-rgb, 242,237,228),0.04)', color: 'var(--sh-ink, #f2ede4)', fontSize: 16 }} />
              <button type="submit" disabled={sending || !cue.trim() || !canSend} style={{ ...button, background: accent, borderColor: accent, color: '#1a1612', fontWeight: 600 }}>{sending ? 'Saving…' : 'Send cue'}</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{['Slow the eccentric', 'Hold this weight', 'One more set', 'Lengthen your rest'].map(text => <button type="button" key={text} disabled={sending || !canSend} onClick={() => { setCue(text); setCueResult(''); setCueError(''); }} style={button}>{text}</button>)}</div>
            {!canSend && <p role="status" style={{ fontSize: 13, color: '#e1d5bb' }}>Cues are available when your client's coach connection is live.</p>}
            <p style={{ fontSize: 12, color: 'rgba(var(--sh-ink-rgb, 242,237,228),0.75)', lineHeight: 1.5 }}>Cues also update your coaching focus note.</p>
            {cueError && <p role="alert" style={{ fontSize: 14, color: '#ffb6a2' }}>{cueError}</p>}
            {cueResult && <p role="status" style={{ fontSize: 14, color: accent, overflowWrap: 'anywhere' }}>{cueResult}</p>}
          </form>
        </>}
      </section>
    </Card>
  );
}// ⚠ NEVER `${colour}66`: a hex alpha appended to a var() token drops the whole CSS
// declaration. This composes rgba() instead and keeps a paper token as
// rgba(var(--x-rgb, r,g,b), a) — pageShell.jsx's ssAlpha, restated locally because
// this module is mounted by test harnesses that load it without pageShell.
function clwAlpha(hex, a) {
  const s = String(hex || "");
  const m = /#([0-9a-f]{6})/i.exec(s);
  if (!m) return s;
  const n = parseInt(m[1], 16);
  const t = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  const tok = s.match(/var\(\s*(--[\w-]+)\s*,/);
  return tok ? `rgba(var(${tok[1]}-rgb, ${t}), ${a})` : `rgba(${t},${a})`;
}

