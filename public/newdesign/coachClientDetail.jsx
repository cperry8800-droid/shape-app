// Per-client overview page for a coach — brought in line with the mobile
// broadsheet client-profile redesign (Overview / Analysis tabs, KPI dashboard).
// Used by TrainerClient.html and NutritionistClient.html. Reads ?id=… and the
// share-gated rollups from /api/clients/:id/shared-overview (goals/stats/lifts).
// Counterpart card's Message button opens the coach↔coach thread.

function ckNum(v) { return (v == null || v === "" || isNaN(Number(v))) ? null : Number(v); }

function CKStat({ label, value, small, sub, color }) {
  return (
    <div style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 12, padding: "14px 16px", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.02)" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 30, letterSpacing: "-0.01em", marginTop: 6 }}>{value}{small ? <span style={{ fontSize: 15, color: "var(--sh-ink2, #a09b94)" }}>{small}</span> : null}</div>
      {sub ? <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{sub}</div> : null}
    </div>
  );
}

function CKTrend({ vals, color, h }) {
  const H = h || 72;
  const v = (vals || []).map(Number).filter(x => !isNaN(x));
  if (v.length < 2) return null;
  const mn = Math.min(...v), mx = Math.max(...v), span = (mx - mn) || 1, n = v.length, W = 320;
  const pts = v.map((x, i) => [(i / (n - 1)) * W, H - 6 - ((x - mn) / span) * (H - 16)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const lp = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      {/* The colour is a paper token, so the area's alpha composes through ssAlpha
          (rgba(var(--x-rgb, …), a)) — `color + "22"` on a var() is not a colour and the
          fill silently disappears. Painted through style rather than presentation
          attributes, where var() support is the part that varies by engine. */}
      <path d={`${line} L${W},${H} L0,${H} Z`} style={{ fill: ssAlpha(color, 0x22 / 255) }} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lp[0]} cy={lp[1]} r="3.5" style={{ fill: color }} />
    </svg>
  );
}

function CKSecHead({ children }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", marginBottom: 14 }}>{children}</div>;
}

// THE CYCLE — coach station (spec 2026-07-19, web parity of the mobile Case File
// station). Cycle predicted-window dates are date-only ISO strings; format short,
// pinned to UTC so the calendar date never drifts. English-only (web isn't localized).
function ckCycleShortDate(isoStr) {
  try {
    const d = new Date(`${String(isoStr).slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) return String(isoStr);
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  } catch (e) { return String(isoStr); }
}
// Pure: the current month as a tick row — logged period starts as taller filled
// marks, today a faint ring. `today` is the MEMBER's local date (from the RPC),
// read as calendar-date PARTS (no timezone reinterpretation) so month/today are
// in her frame, not the coach's. Heat-only coloring reads on the fixed-dark card.
function CkCycleMonthStrip({ starts, today, heat }) {
  let y, mo, todayDay;
  if (typeof today === "string" && /^\d{4}-\d{2}-\d{2}/.test(today)) {
    const p = today.slice(0, 10).split("-").map(Number); y = p[0]; mo = p[1]; todayDay = p[2];
  } else { const n = new Date(); y = n.getFullYear(); mo = n.getMonth() + 1; todayDay = n.getDate(); }
  const days = new Date(y, mo, 0).getDate();
  const startDays = new Set((Array.isArray(starts) ? starts : [])
    .map((s) => String(s).slice(0, 10).split("-").map(Number))
    .filter((p) => p.length === 3 && p[0] === y && p[1] === mo)
    .map((p) => p[2]));
  return (
    <div style={{ display: "flex", gap: 2, marginTop: 12, alignItems: "flex-end" }}>
      {Array.from({ length: days }, (_, i) => {
        const day = i + 1; const isStart = startDays.has(day);
        return <div key={day} style={{ flex: 1, height: isStart ? 9 : 3, borderRadius: isStart ? 5 : 2, background: isStart ? heat : ssAlpha(heat, 0x2a / 255), boxShadow: day === todayDay ? `0 0 0 1px ${heat}` : "none" }} />;
      })}
    </div>
  );
}
// Absence, never a padlock: renders ONLY for { share:true } with an array of
// starts. null / { share:false } / pre-migration all render NOTHING — a coach
// can't tell never-opted-in from not-shared. Phase + timing only.
function CKCycleStation({ cycle, accent }) {
  if (!cycle || cycle.share !== true || !Array.isArray(cycle.starts)) return null;
  const lib = typeof window !== "undefined" ? window.ShapeCycleLib : null;
  if (!lib || !lib.bsDeriveCycle) return null;
  const c = lib.bsDeriveCycle(cycle.starts, cycle.today || new Date());
  if (!c || c.phase === null) return null;
  const PHASE = { menstrual: "Menstrual", follicular: "Follicular", ovulatory: "Ovulatory", luteal: "Luteal", paused: "Predictions paused", late: "Awaiting next log" };
  const phaseLabel = PHASE[c.phase];
  if (!phaseLabel) return null;
  const timing = (c.phase === "paused" || c.phase === "late") ? phaseLabel : `${phaseLabel} · day ${c.day}`;
  return (
    <Card style={{ marginBottom: 16 }}>
      <CKSecHead>CYCLE · SHARED BY THE MEMBER</CKSecHead>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, marginTop: 6 }}>{timing}</div>
      {c.predictedStart && (
        <div style={{ marginTop: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: "var(--sh-ink2, #a09b94)" }}>
          Next period window · {ckCycleShortDate(c.predictedStart.from)} – {ckCycleShortDate(c.predictedStart.to)}
        </div>
      )}
      <CkCycleMonthStrip starts={cycle.starts} today={cycle.today} heat={accent} />
      {c.phase === "luteal" && c.predictedStart && (
        <div style={{ marginTop: 8, fontFamily: "Fraunces, serif", fontSize: 13, fontStyle: "italic", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)" }}>
          Week of the {ckCycleShortDate(c.predictedStart.from)} is a natural deload window.
        </div>
      )}
    </Card>
  );
}

// Shared live monitor: used here and in the dedicated desktop consoles.
function CKLiveStation(props) { return <CoachLiveWorkoutPanel {...props} />; }

// An honest empty for a station whose source is absent — the redaction the
// roster drawer and the mobile Case File already use. Never a demo number.
function CKEmpty({ children }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.04em", color: "var(--sh-ink2, #a09b94)", fontStyle: "italic", lineHeight: 1.6, padding: "6px 0" }}>{children}</div>;
}

// The coach's private note on a client — one whole-doc store per coach
// (user_goals 'coach_client_notes': { [clientId]: { text, updatedAt } }), read
// before every write so a note on client A never clobbers the note on B, and
// declined when the read cannot be trusted (getUserGoals resolves null for
// "not signed in" AND "the read failed", so a null doc is never written over).
const _ckNotesLane = { p: Promise.resolve() };
function ckNotesSerial(fn) { const run = _ckNotesLane.p.then(fn, fn); _ckNotesLane.p = run.catch(() => {}); return run; }
function ckNoteDate(iso) { try { return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return ""; } }
// ⚠ getSession() BEFORE getUserGoals. getUserGoals resolves the user through
// client.auth.getUser(), which does NOT bootstrap the Next.js cookie-session
// bridge — a coach signed in through that path reads as ANON, the note panel
// says "sign in", and nothing ever saves. The variance effect below this one
// already carries the same guard for the same reason (#1769).
async function ckBridge() {
  try { if (window.shapeDb && window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* fall through as anon */ }
}
async function ckUid() {
  try { const u = await window.shapeDb.getUser(); return u && u.id ? u.id : null; } catch (e) { return null; }
}
function ckNoteDraftKey(uid, clientId) {
  return uid && clientId ? "shape:coach-note-draft:v1:" + encodeURIComponent(uid) + ":" + encodeURIComponent(clientId) : null;
}
function ckReadNoteDraft(uid, clientId) {
  try {
    const key = ckNoteDraftKey(uid, clientId);
    const value = key ? JSON.parse(window.localStorage.getItem(key)) : null;
    return value && typeof value.text === "string" && typeof value.baseText === "string" ? value : null;
  } catch (e) { return null; }
}
function ckWriteNoteDraft(uid, clientId, value) {
  try {
    const key = ckNoteDraftKey(uid, clientId);
    if (!key) return false;
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}
async function ckSaveNoteDocument(db, uid, base, next) {
  // Bind the write itself to the account that authored it. The general writer
  // resolves the current account again; a switch during its await could put A's
  // text into B's document. JSON equality also protects other clients' notes
  // when another tab saves between our read and write. Existing RLS applies.
  if (!uid || !db || !db.client || !db.client.from) return { error: true };
  const result = await db.client.from("user_goals").update({ data: next })
    .eq("user_id", uid).eq("kind", "coach_client_notes").eq("data", JSON.stringify(base)).select("user_id");
  if (result.error) return { error: result.error };
  if (Array.isArray(result.data) && result.data.length === 1) return { ok: true };
  // getUserGoals returns {} for both an absent row and an existing empty one.
  // Try an INSERT only for that case; a concurrent row is a conflict, not an upsert.
  if (Object.keys(base).length) return { conflict: true };
  const inserted = await db.client.from("user_goals").insert({ user_id: uid, kind: "coach_client_notes", data: next });
  if (inserted.error && inserted.error.code === "23505") return { conflict: true };
  return inserted.error ? { error: inserted.error } : { ok: true };
}
function CKCoachNote({ clientId, accent }) {
  const [state, setState] = React.useState({ kind: "loading", text: "", savedAt: null });
  const [draft, setDraft] = React.useState("");
  const [deviceReady, setDeviceReady] = React.useState(true);
  const [reload, setReload] = React.useState(0);
  const uidRef = React.useRef(null);
  const generation = React.useRef(0);
  React.useEffect(() => {
    let on = true;
    const load = async () => {
      const gen = ++generation.current;
      uidRef.current = null;
      setState({ kind: "loading", text: "", savedAt: null }); setDraft("");
      const current = () => on && gen === generation.current;
      const db = window.shapeDb;
      if (!db || !db.getUserGoals) { if (current()) setState({ kind: "unavailable", text: "", savedAt: null }); return; }
      await ckBridge();
      const uid = await ckUid();
      if (!current()) return;
      if (!uid) { setState({ kind: "signedout", text: "", savedAt: null }); return; }
      uidRef.current = uid;
      const local = ckReadNoteDraft(uid, clientId);
      let doc = null;
      try { doc = await db.getUserGoals("coach_client_notes"); } catch (e) { doc = null; }
      const confirmedUid = await ckUid();
      if (!current() || confirmedUid !== uid) return;
      if (doc == null) {
        setState({ kind: local ? "error" : "unavailable", text: local ? local.baseText : "", savedAt: null, message: "Couldn't load the saved note. Retry when connected." });
        if (local) setDraft(local.text);
        return;
      }
      const n = doc[clientId];
      const text = n && typeof n.text === "string" ? n.text : "";
      const conflict = local && local.baseText !== text && local.text !== text;
      setState({ kind: conflict ? "conflict" : "ready", text, savedAt: n && n.updatedAt ? n.updatedAt : null, recovered: !!local, ...(conflict ? { message: "Your recovered draft differs from a note saved elsewhere. Review both before replacing it.", latestText: text } : {}) });
      setDraft(local ? local.text : text);
      if (local && local.text === text) ckWriteNoteDraft(uid, clientId, null);
    };
    load();
    let subscription = null;
    try {
      const auth = window.shapeDb && window.shapeDb.client && window.shapeDb.client.auth;
      if (auth && auth.onAuthStateChange) subscription = auth.onAuthStateChange((_event, session) => {
        const next = session && session.user ? session.user.id : null;
        if (next !== uidRef.current) load();
      });
    } catch (e) { /* write-time identity is checked too */ }
    return () => { on = false; generation.current++; try { subscription && subscription.data.subscription.unsubscribe(); } catch (e) {} };
  }, [clientId, reload]);
  const editable = state.kind === "ready" || state.kind === "error" || state.kind === "conflict" || state.kind === "saving";
  const dirty = editable && draft !== state.text;
  React.useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    const beforeLink = (e) => {
      const link = e.target.closest && e.target.closest("a[href]");
      if (!link || link.href === window.location.href || link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (!window.confirm(deviceReady ? "This note has not been saved to your account. Leave and keep the draft on this device?" : "This note has not been saved. Leave and lose these edits?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeLink, true); };
  }, [dirty, deviceReady]);
  const changeDraft = (text) => {
    setDraft(text);
    setDeviceReady(ckWriteNoteDraft(uidRef.current, clientId, text === state.text ? null : { text, baseText: state.text, updatedAt: new Date().toISOString() }));
  };
  const save = (replaceLatest = false) => {
    if (state.kind === "saving" || !dirty) return;
    const startUid = uidRef.current, gen = generation.current, text = draft;
    const current = () => gen === generation.current && uidRef.current === startUid;
    const fail = (message, extra) => { if (current()) setState((s) => ({ ...s, kind: "error", message, ...extra })); };
    setState((s) => ({ ...s, kind: "saving", message: null }));
    return ckNotesSerial(async () => {
      const db = window.shapeDb;
      if (!startUid || !current() || await ckUid() !== startUid) { fail("Your account changed. Reload before saving."); return; }
      let doc = null;
      try { doc = await db.getUserGoals("coach_client_notes"); } catch (e) { doc = null; }
      if (doc == null) { fail("Couldn't read your saved notes." + (deviceReady ? " Your draft is still on this device." : " Device recovery is unavailable; keep this page open.")); return; }
      const nowUid = await ckUid();
      if (!current() || nowUid !== startUid) { fail("Your account changed. Reload before saving."); return; }
      const latest = doc[clientId] && typeof doc[clientId].text === "string" ? doc[clientId].text : "";
      const expected = replaceLatest && state.latestText != null ? state.latestText : state.text;
      if (latest !== expected && latest !== text) {
        fail("This note changed elsewhere. Review the saved version before replacing it.", { kind: "conflict", latestText: latest }); return;
      }
      const now = new Date().toISOString();
      const next = { ...doc };
      if (text.trim()) next[clientId] = { ...(doc[clientId] || {}), text, updatedAt: now }; else delete next[clientId];
      let res = null;
      try { res = await ckSaveNoteDocument(db, startUid, doc, next); } catch (e) { res = null; }
      if (res && res.conflict) { fail("Your notes changed while saving. Retry to review the latest version; your draft is retained."); return; }
      if (!res || res.error) { fail("Couldn't save to your account — retry." + (deviceReady ? " Your draft is kept on this device." : " Device recovery is unavailable; keep this page open.")); return; }
      const savedUid = await ckUid();
      if (!current() || savedUid !== startUid) return;
      ckWriteNoteDraft(startUid, clientId, null);
      setState({ kind: "ready", text, savedAt: text.trim() ? now : null });
      window.dispatchEvent(new CustomEvent("shape:coach-progress-refresh", { detail: { clientId } }));
    });
  };
  const mono = { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.04em", color: "var(--sh-ink2, #a09b94)" };
  const secondaryButton = { ...mono, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", background: "transparent", color: "var(--sh-ink, #f2ede4)", borderRadius: 5, padding: "10px 14px", minHeight: 44, cursor: "pointer" };
  const status = state.kind === "saving" ? "Saving to your account…"
    : state.message ? state.message
    : dirty ? deviceReady ? (state.recovered ? "Draft recovered · not yet saved to your account" : "Draft kept on this device · not yet saved to your account") : "Unsaved · device recovery unavailable"
    : state.savedAt ? "Saved · " + ckNoteDate(state.savedAt)
    : state.kind === "ready" ? "Nothing written yet" : "";
  return (
    <Card style={{ marginBottom: 16 }}>
      <CKSecHead>COACH NOTE · ONLY YOU SEE THIS</CKSecHead>
      <div role="status" style={{ ...mono, marginBottom: 12, lineHeight: 1.5, color: state.kind === "error" || state.kind === "conflict" ? "var(--sh-rust, #e0644b)" : mono.color }}>{status}</div>
      {state.kind === "loading" ? <CKEmpty>Loading your note…</CKEmpty>
        : state.kind === "signedout" ? <CKEmpty>Sign in to keep a private note on this client.</CKEmpty>
        : state.kind === "unavailable" ? <div><CKEmpty>Couldn't load your saved note.</CKEmpty><button style={secondaryButton} onClick={() => setReload((v) => v + 1)}>Retry note</button></div>
        : <React.Fragment>
            <textarea aria-label="Private coach note" value={draft} disabled={state.kind === "saving"} onChange={(e) => changeDraft(e.target.value)} rows={4}
              placeholder="What you're watching, what you told them, what to check next week."
              style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 8, padding: 12, color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 14, lineHeight: 1.5 }} />
            {state.kind === "conflict" && <div style={{ marginTop: 12 }}><CKEmpty>Saved version: {state.latestText || "Empty note"}</CKEmpty><button style={secondaryButton} onClick={() => save(true)}>Replace saved note with my draft</button></div>}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <button onClick={() => save()} disabled={!dirty || state.kind === "saving" || state.kind === "conflict"} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#06231f", background: accent, border: 0, borderRadius: 4, padding: "12px 16px", minHeight: 44, cursor: dirty ? "pointer" : "default", opacity: dirty && state.kind !== "saving" ? 1 : 0.5 }}>{state.kind === "saving" ? "Saving…" : "Save note"}</button>
              <span style={mono}>Private to you — never shown to the client or a co-coach.</span>
            </div>
          </React.Fragment>}
    </Card>
  );
}

// Standalone (TrainerClient.html?id=…) reads the id from the query string; inside a
// coach shell the `#client/<id>` route passes it as a prop, with the shell's role
// and inShell so the back / Schedule / Assign links stay same-document hashes.
function CoachClientDetailPage({ clientId: clientIdProp, role: roleProp, inShell } = {}) {
  const params = new URLSearchParams(window.location.search);
  const clientId = clientIdProp || params.get("id");
  const navForRole = (r) => (r === "nutritionist" ? nutriNavItems : trainerNavItems)("clients");
  const cardForRole = (r) => (r === "nutritionist" ? nutriPayoutCard : trainerPayoutCard);
  const appFor = (r) => (r === "nutritionist" ? "NutritionistApp.html" : "TrainerApp.html");
  const hrefTo = (r, slug) => (inShell ? "#" + slug : appFor(r) + "#" + slug);
  const [data, setData] = React.useState(null);
  // Week-to-week variance line (spec 2026-07-19). No route: the definer RPC is
  // called straight from the browser, and bsVarianceCopy is the ONE copy source
  // shared with the mobile Case File, so the two surfaces cannot drift.
  const [varRead, setVarRead] = React.useState(null);
  // The client's AGE (never their birthdate). A coach always sees it for their
  // own clients, and that is the SERVER's judgement: member_dobs_for_viewer
  // answers on the active-subscription link, so the member's public/private
  // toggle does not enter into it. A route rather than the definer RPC beside
  // it, because the RPC returns DATES and this page must never hold one.
  const [memberAge, setMemberAge] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!clientId) { setErr("Missing client id."); return; }
    let cancelled = false;
    fetch(`/api/clients/${encodeURIComponent(clientId)}/shared-overview`, { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j)))
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr((e && e.error) || "Could not load."); });
    return () => { cancelled = true; };
  }, [clientId]);

  React.useEffect(() => {
    setMemberAge(null);  // reset FIRST — one client's age must never land on another
    if (!clientId) return undefined;
    let on = true;
    fetch("/api/members/ages", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [clientId] }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const n = d && d.ages && d.ages[clientId];
        // ⚠ typeof, not truthiness — 0 is a real age.
        if (on && typeof n === "number") setMemberAge(n);
      })
      .catch(() => {});
    return () => { on = false; };
  }, [clientId]);

  React.useEffect(() => {
    setVarRead(null);   // SYNCHRONOUS reset: client A's line must never sit under
                        // client B while B's fetch is in flight, and missing
                        // prereqs must clear any held line too.
    const db = window.shapeDb && window.shapeDb.client;
    const VB = window.ShapeVariance;
    if (!db || !VB || !clientId) return undefined;
    let on = true;
    (async () => {
      // Bootstrap the cookie-session bridge before the definer RPC — a session
      // that lives only in Next.js HTTP cookies leaves this client ANON, the RPC
      // then sees no auth.uid(), every client fails the subscription gate, and
      // the line would silently never appear (the live-station lesson, #1769).
      try { if (window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* fall through as anon */ }
      if (!on) return;
      try {
        const res = await db.rpc("get_roster_weekly_adherence", { p_client_ids: [clientId] });
        if (!on) return;
        if (res && res.error) { console.warn("[shape] variance: read failed", res.error.message || res.error); return; }
        const rows = Array.isArray(res && res.data) ? res.data : null;
        if (rows) setVarRead(VB.bsVarianceCopy(VB.bsVarianceBand(rows)));
      } catch (e) { console.warn("[shape] variance: read threw", e); }
    })();
    return () => { on = false; };
  }, [clientId]);

  async function openMessage(counterpart) {
    if (!data || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/shared-clients/${encodeURIComponent(clientId)}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ counterpartUserId: counterpart.userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error || "Could not open chat."); return; }
      try {
        window.__openChat && window.__openChat({
          who: counterpart.name,
          role: `${counterpart.role === "trainer" ? "Trainer" : "Nutritionist"} · re: ${data.client.name}`,
          conversationId: j.conversationId,
        });
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  const backLink = (r) => <a href={hrefTo(r, "clients")} style={{ color: "var(--sh-accent, #2ee0c4)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>← Back to clients</a>;
  if (err) {
    return (
      <DashPage navItems={navForRole(roleProp)} payoutCard={cardForRole(roleProp)} eyebrow="CLIENT" title="Couldn't load" subtitle={err}>
        <Card><div style={{ padding: 24, color: "var(--sh-ink2, #a09b94)", display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap" }}><span>Try refreshing or go back to the clients list.</span>{backLink(roleProp)}</div></Card>
      </DashPage>
    );
  }
  if (!data) {
    return (
      <DashPage navItems={navForRole(roleProp)} payoutCard={cardForRole(roleProp)} eyebrow="CLIENT" title="Loading…" subtitle="">
        <Card><div style={{ padding: 24, color: "var(--sh-ink2, #a09b94)" }}>Loading client overview…</div></Card>
      </DashPage>
    );
  }

  const myRole = roleProp || (data.me.trainerId ? "trainer" : (data.me.nutritionistId ? "nutritionist" : null));
  const isNutri = myRole === "nutritionist";
  const navItems = isNutri ? nutriNavItems("clients") : trainerNavItems("clients");
  const payout = isNutri ? nutriPayoutCard : trainerPayoutCard;
  // These follow the paper. They were literals because CKTrend and the cycle strip
  // composed their alphas by APPENDING a hex suffix (`color + "22"`), and a var() with
  // a suffix is not a colour; both compose through ssAlpha now. As literals they were
  // dark-paper colours on the light card — the teal read 1.8:1 as text. Each fallback
  // is the literal it replaces, so the dark paper does not move.
  const teal = "var(--sh-accent, #2ee0c4)", rust = "var(--sh-ember, #d2693f)", gold = "var(--sh-gold2, #d8b25a)";
  const accent = isNutri ? gold : teal;
  const firstName = data.client.name.split(/\s+/)[0];

  // The action line — the Case File's verbs, on the website. Message rides the
  // existing chat bubble (the drawer's helper when dashToday.jsx is loaded, the
  // bubble's own deep-link otherwise); Schedule and Assign are the shell's own
  // tabs, same-document inside a coach shell.
  const messageClient = () => {
    if (typeof dashMessageClient === "function") { dashMessageClient(data.client.name, myRole); return; }
    const opts = { who: data.client.name };
    try { if (typeof window.__openChat === "function") { window.__openChat(opts); return; } } catch (e) {}
    const b = document.getElementById("shape-global-chat-button");
    if (b) { window.__openChatRequest = opts; b.click(); }
  };
  const actGhost = { background: "transparent", color: "var(--sh-ink, #f2ede4)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 18px", borderRadius: 999, fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", cursor: "pointer", whiteSpace: "nowrap" };
  const actPrimary = { ...actGhost, background: "var(--sh-ink, #f2ede4)", color: "var(--sh-ground, #1a1612)", border: 0, fontWeight: 500 };
  const actions = (
    <React.Fragment>
      <a href={hrefTo(myRole, "clients")} style={actGhost}>← Clients</a>
      <a href={hrefTo(myRole, "schedule")} style={actGhost}>Schedule</a>
      <a href={hrefTo(myRole, isNutri ? "plans" : "programs")} style={actGhost}>{isNutri ? "Assign a plan" : "Assign a program"}</a>
      <button onClick={messageClient} style={actPrimary}>Message {firstName}</button>
    </React.Fragment>
  );

  const counterparts = data.careTeam.filter(c => !c.isMe);
  // A FAILED care-team read must never render as "you are the only coach". When
  // get_my_shared_clients errors (code deployed ahead of its migration, a revoked grant) the route
  // still answers 200 and flags careTeamPartial. Note WHAT goes empty: careTeam is
  // [...trainers, ...nutritionists, ...counterparts], and only the counterparts leg comes from that
  // RPC — the caller's own provider row still rides along, so `data.careTeam` is NOT empty and only
  // `counterparts` collapses. That is why this is checked BEFORE counterparts.length below;
  // otherwise the subtitle asserts sole coverage of a client who may well have a nutritionist the
  // caller should be coordinating with.
  const careTeamPartial = data.careTeamPartial === true;
  const upcoming = data.sessions.filter(s => new Date(s.at).getTime() >= Date.now() && s.status !== "completed");
  const past = data.sessions.filter(s => new Date(s.at).getTime() < Date.now() || s.status === "completed").slice(-12).reverse();

  // ── live rollups — HONEST EMPTIES, never a per-field demo fallback ──
  // A field the client has not shared, or not logged yet, renders as a
  // redaction (CKEmpty / "—"), the way the roster drawer and the mobile Case
  // File already do. The fallbacks that lived here painted a plausible athlete
  // under a real client's name — "Back Squat 82.5 kg", a 96% attendance, a
  // 79.2 kg trend, 170 g of protein against a target nobody set (review
  // 2026-09-09, R7). A coach reading a new client's file must see what is
  // missing, not a stand-in.
  const S = data.stats || {}, L = data.lifts || {};
  const G = data.goals || {};
  const ov = (G && G.share !== false && G.overall) ? G.overall : null;
  const liveW = ov && Array.isArray(ov.weighIns) ? ov.weighIns.map(x => Number(x.kg)).filter(x => !isNaN(x)) : [];
  const bwSeries = liveW.length >= 2 ? liveW : null;
  const bwUnit = (ov && ov.unit) || "kg";
  const bwNow = bwSeries ? bwSeries[bwSeries.length - 1] : null;
  const bwDelta = bwSeries ? +(bwNow - bwSeries[0]).toFixed(1) : null;
  const bwWeeks = bwSeries ? bwSeries.length : 0;

  const sDone = ckNum(S.sessionsCompleted), sPlan = ckNum(S.sessionsPlanned);
  const attendancePct = (sPlan && sPlan > 0) ? Math.round((sDone / sPlan) * 100) : null;
  const days7 = ckNum(S.daysLogged7d), days30 = ckNum(S.daysLogged30d);
  const adherencePct = days7 != null ? Math.round((days7 / 7) * 100) : null;
  const avgKcal = ckNum(S.avgCalories), avgP = ckNum(S.avgProtein), avgC = ckNum(S.avgCarbs), avgF = ckNum(S.avgFat);
  const avgRpe = ckNum(L.avgRpe), prs = ckNum(L.prs);
  const kcalStr = avgKcal != null ? avgKcal.toLocaleString() : null;
  const liftRows = (Array.isArray(L.keyLifts) && L.keyLifts.length) ? (() => {
    const best = L.keyLifts.map(x => ckNum(x.best)).filter(v => v != null);
    const mx = best.length ? Math.max(...best) : 1;
    // ⚠ THE UNIT COMES FROM THE ROW, NEVER FROM THIS SENTENCE. This hardcoded
    // "kg" while get_client_lifts sent a bare number, so it was always a guess —
    // and once 2026-09-10-coach-lift-units.sql normalised that RPC to canonical
    // POUNDS the guess became wrong by a factor of 2.2: a client's 100 kg lift
    // arrives as 220.5 and this row would have read "220.5 kg". The RPC states
    // its unit now; where it does not, the figure is UNLABELLED rather than
    // guessed. ⚠ "lb" was the same mistake as the "kg" above one step on: the
    // RPC only states a unit once that migration is APPLIED, and until then it
    // returns a bare max taken ACROSS mixed units — a number whose unit is
    // genuinely unknown. Stamping one on it turns that into a claim.
    const liftUnit = (typeof L.unit === "string" && L.unit.trim()) ? L.unit.trim() : "";
    return L.keyLifts.map(x => { const b = ckNum(x.best), dl = ckNum(x.delta), e1 = ckNum(x.e1rm); const u = (typeof x.unit === "string" && x.unit.trim()) ? x.unit.trim() : liftUnit; const v = b != null ? (e1 != null ? `${b}${u ? " " + u : ""} · ${Math.round(e1)} e1RM` : `${b}${u ? " " + u : ""}`) : "—"; return { n: x.name || "Lift", v, d: dl != null ? `${dl >= 0 ? "+" : ""}${dl}` : "—", p: b != null && mx ? Math.max(0.2, b / mx) : 0.5 }; });
  })() : [];
  // Targets are not in the overview yet — the drawer says "no target set" for
  // the same reason — so the row shows the average the client actually logged
  // and names the missing target instead of inventing one.
  const macros = [
    { n: "Protein", cur: avgP, tgt: null, c: teal },
    { n: "Carbs", cur: avgC, tgt: null, c: gold },
    { n: "Fat", cur: avgF, tgt: null, c: rust },
  ];

  const dash = "—";
  const statGrid = isNutri ? [
    { label: "ADHERENCE", value: adherencePct != null ? adherencePct : dash, small: adherencePct != null ? "%" : null, sub: adherencePct != null ? "this week" : "no logs shared yet", color: gold },
    { label: "AVG INTAKE", value: kcalStr || dash, sub: kcalStr ? "kcal / day" : "no logs shared yet", color: gold },
    { label: "WEIGHT Δ", value: bwDelta != null ? bwDelta : dash, small: bwDelta != null ? bwUnit : null, sub: bwDelta != null ? "vs start" : "no weigh-ins shared", color: rust },
    { label: "LOGGED", value: days7 != null ? days7 : dash, small: days7 != null ? "/7" : null, sub: days7 != null ? "this week" : "no logs shared yet", color: gold },
  ] : [
    { label: "ATTENDANCE", value: attendancePct != null ? attendancePct : dash, small: attendancePct != null ? "%" : null, sub: attendancePct != null ? "this block" : "no sessions planned yet", color: teal },
    { label: "SESSIONS", value: sDone != null ? sDone : dash, sub: sPlan != null ? `of ${sPlan} planned` : "none planned yet", color: teal },
    { label: "AVG RPE", value: avgRpe != null ? avgRpe.toFixed(1) : dash, sub: avgRpe != null ? "effort logged" : "no RPE logged yet", color: rust },
    { label: "PRS", value: prs != null ? prs : dash, sub: prs != null ? "this block" : "none logged yet", color: gold },
  ];

  return (
    <DashPage
      navItems={navItems}
      payoutCard={payout}
      actions={actions}
      eyebrow={typeof memberAge === "number" ? `CLIENT · AGE ${memberAge}` : "CLIENT"}
      title={data.client.name}
      subtitle={careTeamPartial
        ? `Couldn't load this client's care team — that's a loading problem, not an empty one. Refresh to try again.`
        : counterparts.length ? `Care team of ${data.careTeam.length}` : `You are this client's only coach right now.`}
    >
      <React.Fragment>
          {/* key={clientId} REMOUNTS the station per client. Without it React
              renders B's clientId with A's still-committed `row` for one frame
              before the effect's reset runs — the in-effect setRow(null) lands
              after commit, so it cannot prevent that frame (review: CodeRabbit). */}
          <CKLiveStation key={clientId} clientId={clientId} clientName={data.client.name} role={myRole} accent={accent} />
          <Card style={{ marginBottom: 16 }}>
            <CKSecHead>{isNutri ? "ADHERENCE · THIS WEEK" : "TRAINING · THIS BLOCK"}</CKSecHead>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              {statGrid.map((s, i) => <CKStat key={i} {...s} />)}
            </div>
            {/* Week-to-week variance — bare, from the ONE canonical copy source
                (bsVarianceCopy), identical to the mobile Case File line. */}
            {varRead && (
              <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: varRead.chip ? "#e8b14a" : "var(--sh-ink2, #a09b94)" }}>
                {varRead.line}
              </div>
            )}
          </Card>

          <CKCoachNote key={clientId} clientId={clientId} accent={accent} />

          {!isNutri && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>KEY LIFTS</CKSecHead>
              {liftRows.length ? liftRows.map((l, i) => (
                <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{l.n}</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{l.v} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: accent }}>▲ {l.d}</span></span>
                  </div>
                  <div style={{ marginTop: 8, height: 3, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(1, l.p) * 100}%`, background: accent }} /></div>
                </div>
              )) : <CKEmpty>No logged lifts yet — key lifts fill in from the sets they log.</CKEmpty>}
            </Card>
          )}

          {isNutri && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>MACROS · DAILY AVERAGE VS TARGET</CKSecHead>
              {macros.map((m, i) => (
                <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{m.n}</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{m.cur != null ? m.cur + " g" : "—"} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: m.tgt != null ? m.c : "var(--sh-ink3, #75706a)" }}>{m.tgt != null ? "▲ " + m.tgt + " g" : m.cur != null ? "no target set" : "not shared"}</span></span>
                  </div>
                  {m.cur != null && m.tgt ? <div style={{ marginTop: 8, height: 3, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(1, m.cur / m.tgt) * 100}%`, background: m.c }} /></div> : null}
                </div>
              ))}
            </Card>
          )}

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <CKSecHead>{isNutri ? "BODY · WEIGHT TREND" : "BODY · BODYWEIGHT"}</CKSecHead>
              {bwSeries && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: accent }}>{bwNow} {bwUnit} · {bwDelta >= 0 ? "+" : ""}{bwDelta} over {bwWeeks}</span>}
            </div>
            {bwSeries ? <CKTrend vals={bwSeries} color={accent} /> : <CKEmpty>No shared weigh-ins yet — two weigh-ins draw the trend.</CKEmpty>}
          </Card>

          {counterparts.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>CARE TEAM</CKSecHead>
              <div style={{ display: "grid", gap: 12 }}>
                {counterparts.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", padding: "12px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 999, background: "rgba(var(--sh-accent-rgb, 46,224,196),0.18)", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)", overflow: "hidden" }}>
                      {c.avatarUrl ? <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{c.role}</div>
                    </div>
                    {c.userId ? (
                      <button onClick={() => openMessage(c)} disabled={busy}
                        style={{ background: "var(--sh-accent2, #0ac5a8)", color: "var(--sh-ground, #1a1612)", border: 0, padding: "8px 16px", borderRadius: 999, fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 12, fontWeight: 500, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>
                        {busy ? "Opening…" : `Message ${c.name.split(/\s+/)[0]}`}
                      </button>
                    ) : <span />}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {Array.isArray(data.plans) && data.plans.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>CURRENT PLANS</CKSecHead>
              <div style={{ display: "grid", gridTemplateColumns: data.plans.length > 1 ? "1fr 1fr" : "1fr", gap: 14 }}>
                {data.plans.map((p) => {
                  const tone = p.providerRole === "trainer" ? teal : rust;
                  const tpl = p.template;
                  return (
                    <div key={p.assignmentId} style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 10, padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 6, height: 18, borderRadius: 3, background: tone }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{p.providerRole} · {p.coachName}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: tone, marginLeft: "auto", textTransform: "uppercase" }}>{p.status}</span>
                      </div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, letterSpacing: "-0.01em", marginBottom: 6 }}>{tpl ? tpl.title : "Custom plan"}</div>
                      <div style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)", lineHeight: 1.6 }}>
                        {tpl ? [tpl.goal, tpl.level, tpl.durationWeeks ? `${tpl.durationWeeks} wks` : null, tpl.daysPerWeek ? `${tpl.daysPerWeek}×/wk` : null].filter(Boolean).join(" · ") : "Details visible to the assigning coach."}
                      </div>
                      {p.notes && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)", fontSize: 12, color: "var(--sh-ink2, #a09b94)", fontStyle: "italic" }}>"{p.notes}"</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {data.goals && <GoalsCard data={data} teal={teal} rust={rust} gold={gold} />}

          {Array.isArray(data.checkins) && data.checkins.length > 0 && (() => {
            const ck = data.checkins[0];
            const R = ck.ratings || {};
            const items = [["trainingAdherence", "Training"], ["nutritionAdherence", "Nutrition"], ["sleep", "Sleep"], ["energy", "Energy"], ["stress", "Stress"], ["hunger", "Hunger"]];
            return (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <CKSecHead>LATEST CHECK-IN</CKSecHead>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: accent, textTransform: "uppercase" }}>Week of {String(ck.week_of)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
                  {items.map(([k, l]) => (
                    <div key={k} style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{l}</div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, marginTop: 4 }}>{R[k] != null ? `${R[k]}/10` : "—"}</div>
                    </div>
                  ))}
                </div>
                {(ck.wins || ck.struggles || ck.question) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)", display: "grid", gap: 10 }}>
                    {[["WINS", ck.wins, teal], ["STRUGGLES", ck.struggles, rust], ["ASKED YOU", ck.question, accent]].map(([l, v, c]) => v ? (
                      <div key={l}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: c }}>{l}</div>
                        <div style={{ marginTop: 3, fontSize: 13, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", lineHeight: 1.55 }}>{v}</div>
                      </div>
                    ) : null)}
                  </div>
                )}
              </Card>
            );
          })()}

          {(() => {
            const s = data.sleep;
            // DAILY check-in vitals (spec §3B) — the member's own daily gauges
            // (daily_health_snapshot energy/hunger/hydration_l) off the
            // overview's `vitals` leg. Per-metric honesty: a leg renders ONLY
            // when it carries a real finite average — null/'' are ABSENCE (the
            // Number(null)→0 fabrication class), never a 0/10 gauge. Labeled
            // "DAILY … · 7D" so they can never be confused with the weekly
            // LATEST CHECK-IN card's Energy/Hunger above, which read a
            // different table (client_checkins.ratings).
            const vLeg = (o, key) => {
              if (!o || typeof o !== "object" || o[key] == null || o[key] === "") return null;
              const avg = Number(o[key]);
              if (!Number.isFinite(avg)) return null;
              const n = Number(o.n);
              return { avg, n: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 };
            };
            // How many of the seven days actually carried a reading. A single
            // observation and a full week both averaged to one number, so the
            // cell read identically either way; the payload has always carried
            // `n` and the render simply dropped it. Numeric-only suffix — it
            // needs no translation and reads the same in every locale.
            const days = (n) => (n > 0 ? ` · ${n}/7` : "");
            const vv = data.vitals && typeof data.vitals === "object" ? data.vitals : null;
            const vEnergy = vv ? vLeg(vv.energy, "avg7") : null;
            const vHunger = vv ? vLeg(vv.hunger, "avg7") : null;
            const vHyd = vv ? vLeg(vv.hydration, "avg7L") : null;
            const hasVitals = vEnergy != null || vHunger != null || vHyd != null;
            // DEVICE data is what earns the "Objective · device-synced" badge —
            // never the `sleep` object merely existing. It can now exist for a
            // member who only rated how rested they felt, and that rating is
            // ENTERED, not measured; badging it "device-synced" would state
            // something false about where the number came from.
            // ⚠ Sleep HOURS are not device evidence: /api/client/checkin writes
            // sleep_hours from the member's own hour chips, so latest/avg7 are
            // ENTERED-or-measured. readiness is out too — it scores from
            // sleepHours alone, so a typed figure yields a non-null score.
            // Including them made this badge state exactly the false thing the
            // comment above warns against. Device-only fields only.
            const hasDevice = !!(s && (s.efficiency != null
              || s.rhr != null || s.hrv != null || s.latency != null
              || s.respiratory != null || s.stages));
            // No device data, no rating AND no daily vitals → the card does not
            // exist (absence, never a padlock) — the pre-§3B render.
            // Hours are their own state: their SOURCE is unknowable here (a
            // wearable and the member's hour chips both land in sleep_hours), so
            // they may not gate the device CLAIM, but they must still RENDER —
            // otherwise fixing that claim would delete a hand-logging member's
            // real sleep, which is worse than the mislabel.
            const hasHours = !!(s && (s.latest != null || s.avg7 != null));
            const hasRested = !!(s && s.rested != null);
            // ENTERED data is the only thing that may name this card a
            // check-in. Hours are excluded for exactly the reason they cannot
            // prove a device (see `hasHours` above): their source is unknowable
            // here, so they may gate NEITHER claim. An hours-only card heads
            // SLEEP · RECOVERY, which names the subject without claiming a
            // source.
            // ⚠ Derived HERE, beside the other flags, so every consumer reads a
            // pre-derived value and none recombines the booleans into a fresh
            // claim. Recombining at the render site is what made this heading
            // disagree with the mobile Case File about the same client — the
            // second time the two twins drifted on this one card.
            const hasEntered = hasRested || hasVitals;
            const checkinHeading = !hasDevice && hasEntered;
            if (!hasDevice && !hasHours && !hasRested && !hasVitals) return null;
            const fmtH = (v) => (v == null ? "—" : `${Number(v)}h`);
            const rc = !s || s.readiness == null ? "rgba(var(--sh-ink-rgb, 242,237,228),0.5)" : s.readiness >= 80 ? accent : s.readiness >= 60 ? "var(--sh-sky, #7ed4ff)" : s.readiness >= 40 ? "var(--sh-gold, #d8a23a)" : "var(--sh-rust2, #c0533b)";
            // Measured cells render only when a device actually reported. For a
            // rating-only member they would otherwise be eight dashes framing a
            // single filled cell, which reads as a device that failed rather
            // than a member who owns none.
            const cells = [];
            if (hasHours) {
              cells.push(["LAST NIGHT", fmtH(s.latest)]);
              cells.push(["7-DAY AVG", s.avg7 == null ? "—" : `${Number(s.avg7)}h`]);
            }
            if (hasDevice) {
              cells.push(["EFFICIENCY", s.efficiency == null ? "—" : `${s.efficiency}%`]);
              cells.push(["RESTING HR", s.rhr == null ? "—" : `${s.rhr}`]);
              cells.push(["HRV", s.hrv == null ? "—" : `${s.hrv}`]);
              cells.push(["LATENCY", s.latency == null ? "—" : `${s.latency}m`]);
              cells.push(["RESPIRATORY", s.respiratory == null ? "—" : `${s.respiratory}/min`]);
            }
            // RESTED is member-ENTERED, so it follows the entered-gauge rule the
            // vitals cells below use: present only when real, never a dash. A
            // dash on a gauge the member fills in reads as "logged nothing",
            // which is a different claim from "did not log".
            if (hasRested) cells.push(["RESTED", `${s.rested}/10`]);
            // Present legs only — an absent metric adds NO cell (never a "—",
            // which on a member-entered gauge would read as a logged nothing).
            if (vEnergy != null) cells.push(["DAILY ENERGY · 7D", `${vEnergy.avg}/10${days(vEnergy.n)}`]);
            if (vHunger != null) cells.push(["DAILY HUNGER · 7D", `${vHunger.avg}/10${days(vHunger.n)}`]);
            if (vHyd != null) cells.push(["DAILY HYDRATION · 7D", `${vHyd.avg}L${days(vHyd.n)}`]);
            const st = s ? s.stages : null;
            return (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  {/* The heading names the card's SUBJECT, and only ENTERED
                      data may name it a check-in: "Objective · device-synced"
                      must never sit over member-entered gauges alone, and
                      "DAILY CHECK-IN" must never sit over hours whose source
                      is unknowable. Reads the pre-derived flag. */}
                  <CKSecHead>{checkinHeading ? "DAILY CHECK-IN" : "SLEEP · RECOVERY"}</CKSecHead>
                  {hasDevice && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: accent, textTransform: "uppercase" }}>Objective · device-synced</span>}
                </div>
                {s && s.readiness != null && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>READINESS</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 30, color: rc, lineHeight: 1 }}>{s.readiness}</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 13, color: "var(--sh-ink2, #a09b94)" }}>/100</span>
                    {s.readinessLabel && <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: rc }}>{s.readinessLabel}</span>}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {cells.map(([l, v]) => (
                    <div key={l} style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{l}</div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, marginTop: 4 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {st && (
                  <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.04em", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)" }}>
                    STAGES · {[st.deep != null ? `Deep ${st.deep}m` : null, st.rem != null ? `REM ${st.rem}m` : null, st.light != null ? `Light ${st.light}m` : null].filter(Boolean).join(" · ") || "—"}
                  </div>
                )}
                {s && Array.isArray(s.series7) && s.series7.filter((p) => p && p.value != null).length >= 2 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--sh-ink2, #a09b94)", marginBottom: 6 }}>7-DAY TREND</div>
                    <CKTrend vals={s.series7.map((p) => p.value)} color={accent} h={56} />
                  </div>
                )}
              </Card>
            );
          })()}

          <CKCycleStation cycle={data.cycle} accent={accent} />

          {data.healthProfile && (() => {
            const h = data.healthProfile;
            const yesCount = Array.isArray(h.parq) ? h.parq.filter((a) => a === true).length : 0;
            const rxLine = h.rxMeds === "yes" ? (h.medications || "Yes — not listed") : h.rxMeds === "no" ? "None" : (h.medications || null);
            const condLine = [(Array.isArray(h.conditionTags) ? h.conditionTags.join(" · ") : ""), (h.conditions || "")].filter(Boolean).join(" — ") || null;
            const allergyLine = h.allergies === "yes" ? (h.allergyDetails || "Yes — not listed") : h.allergies === "no" ? "None reported" : null;
            const pregLine = h.pregnancy === "yes" ? "Yes — pregnant or ≤6 months postpartum" : null;
            const rows = [
              ["PRESCRIPTION MEDICATION", rxLine],
              ["ALLERGIES", allergyLine],
              ["PREGNANCY / POSTPARTUM", pregLine],
              ["MEDICAL CONDITIONS", condLine],
              ["INJURIES & SURGERIES", h.injuries],
              ["EMERGENCY CONTACT", h.emergency && (h.emergency.name || h.emergency.phone) ? `${h.emergency.name || ""} ${h.emergency.phone || ""}`.trim() : null],
            ].filter(([l, v]) => v);
            return (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <CKSecHead>HEALTH PROFILE · SCREENING</CKSecHead>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: h.flagged ? rust : teal, textTransform: "uppercase" }}>{h.flagged ? `PAR-Q · ${yesCount || "review"} flagged` : "PAR-Q · all clear"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  {rows.map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--sh-ink2, #a09b94)" }}>{l}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", lineHeight: 1.55 }}>{v || "— none noted"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--sh-ink3, #75706a)", textTransform: "uppercase" }}>Shared with linked coaches for safety & liability{h.consentAt ? ` · completed ${new Date(h.consentAt).toLocaleDateString()}` : ""}</div>
              </Card>
            );
          })()}

          {((Array.isArray(data.measurements) && data.measurements.length > 0) || (Array.isArray(data.progressPhotos) && data.progressPhotos.length > 0)) && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>BODY · MEASUREMENTS & PHOTOS</CKSecHead>
              {Array.isArray(data.measurements) && data.measurements.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: data.progressPhotos.length ? 14 : 0 }}>
                  {data.measurements.map((m) => (
                    <div key={m.site} style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{m.site}</div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, marginTop: 4 }}>{Number(m.value)} <span style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)" }}>{m.unit}</span></div>
                      <div style={{ marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "var(--sh-ink3, #75706a)" }}>{String(m.measured_on)}</div>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(data.progressPhotos) && data.progressPhotos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                  {data.progressPhotos.slice(0, 6).map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                      <div style={{ height: 110, borderRadius: 8, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", background: `url(${p.url}) center/cover` }} />
                      <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.06em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{p.pose} · {String(p.taken_on).slice(5)}</div>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <CKSecHead>UPCOMING</CKSecHead>
              {upcoming.length === 0 ? (
                <div style={{ padding: "18px 0", color: "var(--sh-ink2, #a09b94)", fontSize: 13 }}>Nothing on the books.</div>
              ) : upcoming.slice(0, 12).map((s, i) => <SessionRow key={s.id} s={s} first={i === 0} mine={isMine(s, data.me)} />)}
            </Card>
            <Card>
              <CKSecHead>RECENT</CKSecHead>
              {past.length === 0 ? (
                <div style={{ padding: "18px 0", color: "var(--sh-ink2, #a09b94)", fontSize: 13 }}>No history yet.</div>
              ) : past.map((s, i) => <SessionRow key={s.id} s={s} first={i === 0} mine={isMine(s, data.me)} />)}
            </Card>
          </div>
      </React.Fragment>
    </DashPage>
  );
}

function GoalsCard({ data, teal, rust, gold }) {
  const G = data.goals;
  // Work-domain headline (spec 2026-07-13) — shared goals include THE WORK station.
  const ov = G.overall, trM = G.trainingMeta, nuM = G.nutritionMeta, wkM = G.workMeta;
  const subHead = (txt) => <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--sh-ink2, #a09b94)", marginTop: 16 }}>{txt}</div>;
  const metaRow = (title, subtitle, c) => (
    <div style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 10, padding: "12px 14px", marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ width: 5, height: 18, borderRadius: 3, background: c, flexShrink: 0 }} />
      <div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 16, letterSpacing: "-0.01em" }}>{title}</div>
        {subtitle && <div style={{ marginTop: 3, fontSize: 12, fontStyle: "italic", color: "var(--sh-ink2, #a09b94)", lineHeight: 1.4 }}>{subtitle}</div>}
      </div>
    </div>
  );
  const hasAny = ov || (trM && trM.title) || (nuM && nuM.title) || (wkM && wkM.title);
  return (
    <Card style={{ marginBottom: 16 }}>
      <CKSecHead>GOALS</CKSecHead>
      {G.share === false ? (
        <div style={{ padding: "12px 0", color: "var(--sh-ink2, #a09b94)", fontSize: 13 }}>{data.client.name.split(/\s+/)[0]} keeps their goals private.</div>
      ) : !hasAny ? (
        <div style={{ padding: "12px 0", color: "var(--sh-ink2, #a09b94)", fontSize: 13 }}>No goals shared yet.</div>
      ) : (
        <div>
          {ov && (() => {
            const start = Number(ov.start) || 0, now = Number(ov.now) || 0, target = Number(ov.target) || 0, unit = ov.unit || "kg";
            const range = start - target;
            const pct = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : 0;
            const down = +(now - start).toFixed(1), toGo = +(now - target).toFixed(1);
            const byD = ov.by ? new Date(ov.by) : null;
            const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase() : "";
            return (
              <div style={{ border: "1px solid rgba(var(--sh-accent2-rgb, 10,197,168),0.3)", borderRadius: 10, padding: 14, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--sh-accent, #2ee0c4)" }}>OVERALL{byLabel ? ` · BY ${byLabel}` : ""}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--sh-ink2, #a09b94)" }}>{Math.round(pct * 100)}% there</span>
                </div>
                <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, letterSpacing: "-0.01em", margin: "6px 0 8px" }}>{ov.title}</div>
                <div style={{ height: 6, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct * 100}%`, background: "var(--sh-accent2, #0ac5a8)" }} /></div>
                <div style={{ marginTop: 7, fontSize: 11.5, color: "var(--sh-ink2, #a09b94)" }}>{down} {unit} so far · {Math.abs(toGo)} {unit} to go · now {now}{unit} · target {target}{unit}</div>
              </div>
            );
          })()}
          {trM && trM.title && <React.Fragment>{subHead("TRAINING")}{metaRow(trM.title, trM.subtitle, rust)}</React.Fragment>}
          {nuM && nuM.title && <React.Fragment>{subHead("NUTRITION")}{metaRow(nuM.title, nuM.subtitle, gold)}</React.Fragment>}
          {wkM && wkM.title && <React.Fragment>{subHead("WORK")}{metaRow(wkM.title, wkM.subtitle, "#7aa7dc")}</React.Fragment>}
        </div>
      )}
    </Card>
  );
}

function isMine(s, me) {
  if (s.providerRole === "trainer") return me && s.providerRole === "trainer" && me.trainerId != null;
  if (s.providerRole === "nutritionist") return me && me.nutritionistId != null;
  return false;
}

function SessionRow({ s, first, mine }) {
  const d = new Date(s.at);
  const dateLabel = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tone = s.providerRole === "trainer" ? "var(--sh-accent, #2ee0c4)" : "var(--sh-ember, #d2693f)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", padding: "12px 0", borderTop: first ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
      <div style={{ width: 6, height: 36, borderRadius: 3, background: tone, opacity: mine ? 1 : 0.45 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{dateLabel} · {timeLabel}</div>
        <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 2 }}>
          {s.coachName} · {s.providerRole} · {s.durationMin}min · {s.type}{s.topic ? ` · ${s.topic}` : ""}
        </div>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "var(--sh-ink2, #a09b94)", textTransform: "uppercase" }}>{s.status}</div>
    </div>
  );
}
