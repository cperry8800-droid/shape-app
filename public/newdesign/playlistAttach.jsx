// The Playlists page's Attach view on the coach's real data (owner, 2026-11-05). The rules are pure
// (playlistAttach.js). Every click is saved:
//   · "Send to clients": all your clients, or one client, as the playlist's `attached` entries with this
//     page's role (PATCH /api/coach/soundtracks) — what members already read on Train (a trainer's) or
//     Eat (a nutritionist's cooking playlists).
//   · "Program days" (trainers): the day's playlist in the program template (PATCH /api/coach/plans,
//     revision-checked), carried with its link into every workout assigned from it.
// A failed save puts the cell back and says so.
//
// LiveAttachMatrix({ role, rows, onRow })   rows: the coach's coach_soundtracks rows; onRow(row) after a save.
// Window globals, read at render time (no module system on the website).

const PLA_MONO = "'JetBrains Mono', monospace";
const PLA_INK50 = "var(--sh-ink2, #a09b94)";
const PLA_HAIR = "rgba(var(--sh-ink-rgb, 242,237,228),0.08)";

function plaCell(on, busy, color, onClick, label) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} disabled={busy} onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: 10, border: on ? "1.5px solid " + color : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", background: on ? color : "transparent", cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", opacity: busy ? 0.5 : 1 }}>
      {on && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#1a1612" strokeWidth="2.5"><path d="M3 8.5l3 3 7-7" /></svg>}
    </button>
  );
}

function LiveAttachMatrix({ role, rows, onRow }) {
  const PA = window.PlaylistAttach;
  const dash = typeof useDashboard === "function" ? useDashboard(role) : { clients: [] };
  const clients = (dash.clients || []).filter((c) => c && c.profile && c.profile.id && !/^demo-/.test(String(c.profile.id)));
  const [plans, setPlans] = React.useState(role === "trainer" ? undefined : []);
  const [usage, setUsage] = React.useState({});
  const [busy, setBusy] = React.useState({});
  const [err, setErr] = React.useState("");
  const loadPlans = React.useCallback(() => {
    if (role !== "trainer") return;
    fetch("/api/coach/plans?kind=program", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlans(d && Array.isArray(d.plans) ? d.plans.map((p) => (window.ShapeWorkoutDocument ? window.ShapeWorkoutDocument.normalizeWorkoutPlan(p) : p)) : null))
      .catch(() => setPlans(null));
    const today = new Date();
    const ymd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    fetch("/api/coach/plans/usage?today=" + ymd, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null)).then((d) => setUsage(d && d.usage ? d.usage : {})).catch(() => {});
  }, [role]);
  React.useEffect(() => { loadPlans(); }, [loadPlans]);
  if (!PA) return null;
  const color = (row) => (row.provider === "apple" ? "#b9a13e" : "#4a6fb0");

  const send = async (row, target, name) => {
    const key = row.id + "::" + target;
    setBusy((b) => ({ ...b, [key]: true })); setErr("");
    try {
      const attached = PA.toggleSend(row.attached, target, name);
      const r = await fetch("/api/coach/soundtracks", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, attached, role }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.soundtrack) throw new Error(d.error || "Not saved.");
      onRow && onRow(d.soundtrack);
    } catch (e) { setErr((e && e.message) || "Not saved. Try again."); }
    finally { setBusy((b) => { const n = { ...b }; delete n[key]; return n; }); }
  };

  const onDay = async (row, dayRow) => {
    const key = row.id + "::" + dayRow.planId + ":" + dayRow.w + ":" + dayRow.d;
    const plan = (plans || []).find((p) => p.id === dayRow.planId);
    if (!plan) return;
    setBusy((b) => ({ ...b, [key]: true })); setErr("");
    try {
      const detail = PA.setDayPlaylist(plan.detail, dayRow.w, dayRow.d, PA.dayHas(dayRow.day, row) ? null : row);
      if (!detail) throw new Error("That day is gone. Reload.");
      const r = await fetch("/api/coach/plans", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, kind: "program", name: plan.name, expectedRevision: plan.detail && plan.detail.revision != null ? plan.detail.revision : null, detail }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.plan) throw new Error(d.error || "Not saved.");
      const saved = window.ShapeWorkoutDocument ? window.ShapeWorkoutDocument.normalizeWorkoutPlan(d.plan) : d.plan;
      setPlans((list) => (list || []).map((p) => (p.id === saved.id ? saved : p)));
    } catch (e) { setErr((e && e.message) || "Not saved. Try again."); }
    finally { setBusy((b) => { const n = { ...b }; delete n[key]; return n; }); }
  };

  const th = { padding: "12px 8px", textAlign: "center", fontFamily: PLA_MONO, fontSize: 10, letterSpacing: "0.1em", color: PLA_INK50, borderBottom: "1px solid " + PLA_HAIR, verticalAlign: "bottom", minWidth: 110 };
  const thFirst = { ...th, textAlign: "left", minWidth: 220, paddingLeft: 20 };
  const td = { padding: "8px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", textAlign: "center" };
  const tdFirst = { ...td, textAlign: "left", paddingLeft: 20 };
  const head = (
    <tr>
      <th style={thFirst}>{" "}</th>
      {rows.map((p) => (
        <th key={p.id} style={th}>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--sh-ink, #f2ede4)", textTransform: "none", letterSpacing: 0, whiteSpace: "normal" }}>{p.name}</div>
          <div style={{ fontSize: 9.5 }}>{p.provider === "apple" ? "Apple Music" : "Spotify"}</div>
        </th>
      ))}
    </tr>
  );
  if (!rows.length) return <div style={{ padding: 20, color: PLA_INK50, fontSize: 13 }}>Add a playlist in the Library first; then send it to clients here{role === "trainer" ? " or put it on a program day" : ""}.</div>;
  const days = PA.programDays(plans || [], usage);
  return (
    <div data-live-attach>
      {err && <div role="status" style={{ marginBottom: 10, fontSize: 12.5, color: PLA_INK50 }}>{err}</div>}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + PLA_HAIR }}>
          <div style={{ fontFamily: PLA_MONO, fontSize: 10, letterSpacing: "0.14em", color: "var(--sh-accent, #2ee0c4)" }}>SEND TO CLIENTS</div>
          <div style={{ fontSize: 12.5, color: PLA_INK50, marginTop: 4 }}>{role === "nutritionist" ? "A cooking playlist shows on the client's Eat page." : "A playlist shows on the client's Train page."} It opens in their own Spotify or Apple Music; Shape never streams it.</div>
        </div>
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>{head}</thead>
            <tbody>
              <tr>
                <td style={tdFirst}><div style={{ fontWeight: 500 }}>All your clients</div><div style={{ fontSize: 10.5, color: PLA_INK50, fontFamily: PLA_MONO }}>Now and anyone who joins</div></td>
                {rows.map((p) => <td key={p.id} style={td}>{plaCell(PA.sendState(p.attached).all, !!busy[p.id + "::all"], color(p), () => send(p, "all"), "Send " + p.name + " to all your clients")}</td>)}
              </tr>
              {clients.map((c) => (
                <tr key={c.profile.id}>
                  <td style={tdFirst}>{c.profile.name}</td>
                  {rows.map((p) => {
                    const st = PA.sendState(p.attached);
                    return <td key={p.id} style={td}>{plaCell(st.clients.has(String(c.profile.id).toLowerCase()), !!busy[p.id + "::" + c.profile.id], color(p), () => send(p, c.profile.id, c.profile.name), "Send " + p.name + " to " + c.profile.name)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {role === "trainer" && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid " + PLA_HAIR }}>
            <div style={{ fontFamily: PLA_MONO, fontSize: 10, letterSpacing: "0.14em", color: "var(--sh-accent, #2ee0c4)" }}>PROGRAM DAYS</div>
            <div style={{ fontSize: 12.5, color: PLA_INK50, marginTop: 4 }}>The playlist rides on that day's workout card, with a button that opens it. Clients already on the program get it when you use Update future assignments.</div>
          </div>
          {plans === undefined ? <div style={{ padding: 20, color: PLA_INK50 }}>Reading your programs…</div>
            : plans === null ? <div role="status" style={{ padding: 20, color: PLA_INK50 }}>Couldn't read your programs. <button type="button" onClick={loadPlans} style={{ background: "transparent", border: 0, color: "var(--sh-accent, #2ee0c4)", cursor: "pointer" }}>Retry</button></div>
            : !days.length ? <div style={{ padding: 20, color: PLA_INK50 }}>No programs yet. Build one under Workouts &amp; programs.</div>
            : (
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>{head}</thead>
                  <tbody>
                    {days.map((dr) => (
                      <tr key={dr.planId + ":" + dr.w + ":" + dr.d}>
                        <td style={tdFirst}>
                          <div style={{ fontWeight: 500 }}>{dr.name}</div>
                          <div style={{ fontSize: 10.5, color: PLA_INK50, fontFamily: PLA_MONO }}>{dr.program} · {dr.clients} client{dr.clients === 1 ? "" : "s"}</div>
                        </td>
                        {rows.map((p) => <td key={p.id} style={td}>{plaCell(PA.dayHas(dr.day, p), !!busy[p.id + "::" + dr.planId + ":" + dr.w + ":" + dr.d], color(p), () => onDay(p, dr), "Play " + p.name + " on " + dr.name)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}
    </div>
  );
}

Object.assign(window, { LiveAttachMatrix });
