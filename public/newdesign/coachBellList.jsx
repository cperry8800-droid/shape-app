// The coach's bell panel, grouped (owner, 2026-11-05): Needs you · Good news · For your information,
// one action per notice, how each reached the coach, and a footer with the day's pushes against the
// limit and the quiet hours. The rules are pure (coachBell.js); pageShell.jsx's DashInbox keeps the
// header (Mark all read, Clear all), the states and each row's own link, and hands its row renderer in,
// so a row opens exactly what it opened before.
//
// Actions, each in place:
//   Accept           a session request: POST /api/sessions/manage { action: 'confirm' } (the Schedule's
//                    own accept), with "Other time" opening the Schedule.
//   Review check-in  opens the client's page, where the week's check-in is.
//   Message          Nora's draft (/api/ai/draft-message, which sends nothing), editable, then sent in
//                    the coach's thread with the client (/api/conversations/[id]/messages) and recorded
//                    as sent (/api/ai/draft-message/sent). Without a draft, an empty box.
//
// Window globals, read at render time (no module system on the website).

const CBL_MONO = "'JetBrains Mono', monospace";
const CBL_INK50 = "rgba(var(--sh-ink-rgb, 242,237,228),0.5)";
const CBL_HAIR = "rgba(var(--sh-ink-rgb, 242,237,228),0.08)";
const CBL_TEAL = "var(--sh-accent, #2ee0c4)";

let _cblDelivery = null; // { at, promise }
function cblDelivery() {
  const now = Date.now();
  if (_cblDelivery && now - _cblDelivery.at < 60000) return _cblDelivery.promise;
  const promise = fetch("/api/notifications/delivery", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  _cblDelivery = { at: now, promise };
  return promise;
}

function CoachBellAction({ n, action, role, onDone }) {
  const [state, setState] = React.useState("");
  const [draft, setDraft] = React.useState(null); // null = closed · { text, conversationId, auditId, source }
  const [err, setErr] = React.useState("");
  const btn = (primary) => ({ fontFamily: CBL_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 10px", borderRadius: 4, cursor: state === "busy" ? "wait" : "pointer",
    border: primary ? 0 : "1px solid " + CBL_HAIR, background: primary ? CBL_TEAL : "transparent", color: primary ? "var(--sh-deep, #06231f)" : "var(--sh-ink, #f2ede4)" });
  const scheduleHref = typeof dashCoachHref === "function" && (role === "trainer" || role === "nutritionist") ? dashCoachHref(role, "schedule") : null;
  const clientHref = action.clientId ? "#client/" + encodeURIComponent(action.clientId) : null;

  if (action.kind === "accept") {
    if (state === "done") return <span style={{ fontFamily: CBL_MONO, fontSize: 9, color: CBL_TEAL, letterSpacing: "0.1em", textTransform: "uppercase" }}>✓ Accepted</span>;
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" disabled={state === "busy"} style={btn(true)} onClick={async () => {
          setState("busy"); setErr("");
          try {
            const r = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", sessionId: action.sessionId }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || "Not accepted.");
            setState("done"); onDone && onDone();
          } catch (e) { setErr(e.message || "Not accepted."); setState(""); }
        }}>✓ Accept</button>
        {scheduleHref && <a href={scheduleHref} style={{ ...btn(false), textDecoration: "none" }}>Other time</a>}
        {err && <span role="status" style={{ fontSize: 11.5, color: CBL_INK50 }}>{err}</span>}
      </span>
    );
  }
  if (action.kind === "review") {
    return clientHref ? <a href={clientHref} onClick={() => onDone && onDone()} style={{ ...btn(true), textDecoration: "none" }}>Review check-in</a> : null;
  }
  if (action.kind === "message") {
    const open = async () => {
      setState("busy"); setErr("");
      try {
        const r = await fetch("/api/ai/draft-message", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: action.clientId, role, ...(action.draftKind === "win" ? { kind: "note on a recent win" } : {}) }) });
        const j = await r.json().catch(() => ({}));
        setDraft({ text: r.ok && typeof j.draft === "string" ? j.draft : "", conversationId: j.conversationId || null, auditId: j.draftAuditId || null, source: r.ok ? j.source : null });
      } catch (e) {
        setDraft({ text: "", conversationId: null, auditId: null, source: null });
      } finally { setState(""); }
    };
    const send = async () => {
      const body = (draft && draft.text || "").trim();
      if (!body || !draft.conversationId) { setErr(draft && !draft.conversationId ? "Couldn't open your thread with this client." : ""); return; }
      setState("busy"); setErr("");
      try {
        const r = await fetch("/api/conversations/" + encodeURIComponent(draft.conversationId) + "/messages", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
        if (!r.ok) throw new Error("send");
        if (draft.auditId) fetch("/api/ai/draft-message/sent", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: action.clientId, sentText: body, draftAuditId: draft.auditId, conversationId: draft.conversationId }) }).catch(() => {});
        setState("done"); setDraft(null); onDone && onDone();
      } catch (e) { setErr("Not sent. Try again."); setState(""); }
    };
    if (state === "done") return <span style={{ fontFamily: CBL_MONO, fontSize: 9, color: CBL_TEAL, letterSpacing: "0.1em", textTransform: "uppercase" }}>✓ Sent</span>;
    if (!draft) return <button type="button" disabled={state === "busy"} style={btn(true)} onClick={open}>{state === "busy" ? "Drafting…" : "Message"}</button>;
    return (
      <div style={{ width: "100%" }}>
        <div style={{ fontFamily: CBL_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: CBL_INK50, marginBottom: 4 }}>{draft.text ? (draft.source === "nora" ? "Nora's draft · edit before you send" : "A draft · edit before you send") : "Your message"}</div>
        <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={4} aria-label="Message to your client"
          style={{ width: "100%", boxSizing: "border-box", background: "transparent", color: "var(--sh-ink, #f2ede4)", border: "1px solid " + CBL_HAIR, borderRadius: 6, padding: 8, fontFamily: "inherit", fontSize: 12.5, resize: "vertical" }} />
        <span style={{ display: "inline-flex", gap: 6, marginTop: 6 }}>
          <button type="button" disabled={state === "busy" || !draft.text.trim()} style={btn(true)} onClick={send}>{state === "busy" ? "Sending…" : "Send"}</button>
          <button type="button" style={btn(false)} onClick={() => setDraft(null)}>Cancel</button>
        </span>
        {err && <div role="status" style={{ fontSize: 11.5, color: CBL_INK50, marginTop: 4 }}>{err}</div>}
      </div>
    );
  }
  return null;
}

function CoachBellList({ rows, role, renderRow, markOne }) {
  const CB = window.CoachBell;
  const [delivery, setDelivery] = React.useState(undefined);
  const [filter, setFilter] = React.useState("all");
  React.useEffect(() => { let live = true; cblDelivery().then((d) => { if (live) setDelivery(d); }); return () => { live = false; }; }, []);
  if (!CB) return rows.map(renderRow);
  const groups = CB.groupRows(rows);
  const summary = CB.summaryOf(groups);
  const footer = CB.footerOf(delivery || null);
  const chip = (k, label, count) => (
    <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
      style={{ fontFamily: CBL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 8px", borderRadius: 999, cursor: "pointer",
        border: "1px solid " + (filter === k ? CBL_TEAL : CBL_HAIR), background: filter === k ? "rgba(var(--sh-accent-rgb, 46,224,196),0.12)" : "transparent", color: filter === k ? "var(--sh-ink, #f2ede4)" : CBL_INK50 }}>{label} {count}</button>
  );
  return (
    <div data-coach-bell>
      <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid " + CBL_HAIR }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chip("all", "All", rows.length)}
          {CB.GROUPS.map(([k, label]) => chip(k, label.split(" ")[0] === "For" ? "FYI" : label, groups[k].length))}
        </div>
        {summary && <div style={{ fontSize: 11.5, color: CBL_INK50, marginTop: 6, lineHeight: 1.45 }}>{summary}</div>}
      </div>
      {CB.GROUPS.filter(([k]) => (filter === "all" || filter === k) && groups[k].length).map(([k, label]) => (
        <div key={k}>
          <div style={{ padding: "8px 14px 4px", fontFamily: CBL_MONO, fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", color: k === "needs" ? CBL_TEAL : CBL_INK50 }}>{label}</div>
          {groups[k].map((n) => {
            const action = CB.actionOf(n);
            const via = CB.deliveryText(CB.deliveryOf(n, delivery || null));
            return (
              <div key={n.id}>
                {renderRow(n)}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "0 14px 10px", marginTop: -4, borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
                  {action && <CoachBellAction n={n} action={action} role={n.data && (n.data.providerRole === "trainer" || n.data.providerRole === "nutritionist") ? n.data.providerRole : role} onDone={() => { if (!n.read && markOne) markOne(n.id); }} />}
                  <span style={{ marginLeft: "auto", fontFamily: CBL_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.38)" }} title="How this reached you">{via}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {footer && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 14px", fontFamily: CBL_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: CBL_INK50, borderTop: "1px solid " + CBL_HAIR }}>
          <span>{footer}</span>
          {typeof dashCoachHref === "function" && (role === "trainer" || role === "nutritionist") && <a href={dashCoachHref(role, "settings")} style={{ color: CBL_TEAL, textDecoration: "none" }}>Settings →</a>}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CoachBellList, CoachBellAction });
