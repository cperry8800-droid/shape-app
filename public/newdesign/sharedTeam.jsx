// The Team view of a shared client (owner, 2026-11-05: "a portal or area that shows the view and data if
// coaches are sharing a client"). A functional first version; the visual redesign comes later.
//
// SharedTeamPanel({ clientId, role, withUserId, compact })
//   Both coaches' week side by side (one lane per coach, one column per day), "Next, and whose", and
//   the care-team thread with a reply box. Reads /api/me/shared-clients/[clientId]/team; the thread is
//   opened through POST .../thread when it does not exist yet, and replies post to
//   /api/conversations/[id]/messages. The client never sees any of it (the care-team thread is
//   coach-only, 2026-10-15-keep-care-team-private.sql).
// useSharedClients()
//   The caller's shared clients (/api/me/shared-clients), read once a minute per page: the client
//   drawer shows its Team tab only for a client in it.
//
// Window globals, read at render time (no module system on the website).

const STM_MONO = "'JetBrains Mono', monospace";
const STM_INK50 = "var(--sh-ink2, #a09b94)";
const STM_HAIR = "rgba(var(--sh-ink-rgb, 242,237,228),0.10)";
const STM_TEAL = "var(--sh-accent, #2ee0c4)";
const STM_ROLE_C = { trainer: "#c0533b", nutritionist: "#a07a2e" };

let _stmSharedCache = null; // { at, promise }
function stmSharedClients() {
  const now = Date.now();
  if (_stmSharedCache && now - _stmSharedCache.at < 60000) return _stmSharedCache.promise;
  const promise = fetch("/api/me/shared-clients", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && Array.isArray(d.shared) ? d.shared : null))
    .catch(() => null);
  _stmSharedCache = { at: now, promise };
  return promise;
}
function useSharedClients() {
  const [rows, setRows] = React.useState(undefined); // undefined = loading · null = failed
  React.useEffect(() => {
    let live = true;
    stmSharedClients().then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, []);
  return rows;
}

function stmDayLabel(ymd) {
  try { return new Date(ymd + "T12:00:00Z").toLocaleDateString([], { weekday: "short", day: "numeric", timeZone: "UTC" }); } catch (e) { return ymd; }
}
function stmAddWeeks(ymd, n) { return new Date(Date.parse(ymd + "T12:00:00Z") + n * 7 * 86400000).toISOString().slice(0, 10); }

function SharedTeamPanel({ clientId, role, withUserId, compact }) {
  const [week, setWeek] = React.useState(null);
  const [data, setData] = React.useState(undefined); // undefined loading · null failed · object
  const [err, setErr] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendErr, setSendErr] = React.useState("");
  const gen = React.useRef(0);

  const load = React.useCallback((wk) => {
    const g = ++gen.current;
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    const q = new URLSearchParams();
    if (wk) q.set("week", wk);
    if (tz) q.set("tz", tz);
    if (withUserId) q.set("with", withUserId);
    return fetch("/api/me/shared-clients/" + encodeURIComponent(clientId) + "/team?" + q.toString(), { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })).catch(() => ({ ok: false, j: {} })))
      .then(({ ok, j }) => {
        if (g !== gen.current) return;
        if (!ok) { setErr(j && j.error ? j.error : "Couldn't read the care team."); setData(null); return; }
        setErr(""); setData(j);
      })
      .catch(() => { if (g === gen.current) { setErr("Couldn't read the care team."); setData(null); } });
  }, [clientId, withUserId]);
  React.useEffect(() => { load(week); }, [load, week]);

  const openThread = async () => {
    const other = data && data.team && data.team.find((t) => !t.me && (!withUserId || t.userId === withUserId));
    if (!other) return null;
    const r = await fetch("/api/me/shared-clients/" + encodeURIComponent(clientId) + "/thread", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartUserId: other.userId }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.conversationId ? j.conversationId : null;
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setSendErr("");
    try {
      const cid = (data && data.thread && data.thread.conversationId) || (await openThread());
      if (!cid) throw new Error("open");
      const r = await fetch("/api/conversations/" + encodeURIComponent(cid) + "/messages", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      if (!r.ok) throw new Error("send");
      setDraft("");
      await load(week);
    } catch (e) {
      setSendErr("Not sent. Try again.");
    } finally { setSending(false); }
  };

  if (data === undefined) return <div style={{ padding: 18, color: STM_INK50, fontSize: 13 }}>Reading the care team…</div>;
  if (data === null) return <div role="status" style={{ padding: 18, color: STM_INK50, fontSize: 13 }}>{err || "Couldn't read the care team."} Reload to try again.</div>;
  if (!data.shared) return <div style={{ padding: 18, color: STM_INK50, fontSize: 13, lineHeight: 1.5 }}>Nobody else coaches {data.client.name} right now, so there is no care team to show.</div>;

  const others = data.team.filter((t) => !t.me);
  const whoseColor = (w) => (w === "you" ? STM_TEAL : w === "both" ? "var(--sh-ink, #f2ede4)" : (STM_ROLE_C[(data.team.find((t) => t.name === w) || {}).role] || STM_INK50));
  const head = { fontFamily: STM_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: STM_INK50, margin: "18px 0 8px" };
  const btn = { fontFamily: STM_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid " + STM_HAIR, color: "var(--sh-ink, #f2ede4)", borderRadius: 4, padding: "6px 10px", cursor: "pointer" };

  return (
    <div data-shared-team={clientId} style={{ fontSize: 13 }}>
      {/* Team header: the client, and each coach with their role and since when. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        {data.team.map((t) => (
          <span key={t.userId + t.role} style={{ display: "inline-flex", gap: 6, alignItems: "baseline", border: "1px solid " + STM_HAIR, borderRadius: 999, padding: "4px 10px" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: STM_ROLE_C[t.role], alignSelf: "center" }} />
            <span style={{ fontWeight: 500 }}>{t.me ? "You" : t.name}</span>
            <span style={{ fontFamily: STM_MONO, fontSize: 9, color: STM_INK50, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t.role}{t.since ? " · since " + new Date(t.since).toLocaleDateString([], { month: "short", year: "numeric" }) : ""}</span>
          </span>
        ))}
      </div>
      {data.partial && data.partial.length > 0 && (
        <div role="status" style={{ marginTop: 8, fontSize: 12, color: STM_INK50 }}>Couldn't read {data.partial.join(", ")}; what is shown is incomplete.</div>
      )}

      {/* This week, both plans: one lane per coach. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={head}>This week · both plans</div>
        <span style={{ display: "inline-flex", gap: 6 }}>
          <button type="button" style={btn} onClick={() => setWeek(stmAddWeeks(data.week.start, -1))} aria-label="Previous week">←</button>
          <button type="button" style={btn} onClick={() => setWeek(null)}>This week</button>
          <button type="button" style={btn} onClick={() => setWeek(stmAddWeeks(data.week.start, 1))} aria-label="Next week">→</button>
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: (compact ? "88px" : "120px") + " repeat(7, minmax(" + (compact ? 92 : 110) + "px, 1fr))", gap: 1, background: STM_HAIR, border: "1px solid " + STM_HAIR, borderRadius: 6, minWidth: compact ? 760 : 900 }}>
          <div style={{ background: "var(--sh-ground2, #14110e)", padding: 6 }} />
          {data.week.days.map((d) => <div key={d} style={{ background: "var(--sh-ground2, #14110e)", padding: 6, fontFamily: STM_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: STM_INK50 }}>{stmDayLabel(d)}</div>)}
          {data.lanes.map((lane) => (
            <React.Fragment key={lane.userId + lane.role}>
              <div style={{ background: "var(--sh-ground2, #14110e)", padding: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 12.5 }}>{lane.me ? "You" : lane.name}</div>
                <div style={{ fontFamily: STM_MONO, fontSize: 8.5, color: STM_ROLE_C[lane.role], textTransform: "uppercase", letterSpacing: "0.1em" }}>{lane.role === "trainer" ? "Training" : "Nutrition"}</div>
              </div>
              {data.week.days.map((d) => (
                <div key={d} style={{ background: "var(--sh-ground2, #14110e)", padding: 6, minHeight: 54 }}>
                  {(lane.days[d] || []).map((it, i) => (
                    <div key={i} style={{ marginBottom: 6, borderLeft: "2px solid " + STM_ROLE_C[lane.role], paddingLeft: 6 }}>
                      <div style={{ fontSize: 11.5, lineHeight: 1.3 }}>{it.done ? "✓ " : ""}{it.title}</div>
                      {it.detail && <div style={{ fontSize: 10.5, color: STM_INK50, lineHeight: 1.3 }}>{it.detail}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Next, and whose. */}
      <div style={head}>Next, and whose</div>
      {data.next.length === 0 ? (
        <div style={{ color: STM_INK50, fontSize: 12.5 }}>Nothing waiting on either of you.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.next.map((n, i) => (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid " + STM_HAIR }}>
              <span style={{ flex: "none", minWidth: 74, fontFamily: STM_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: whoseColor(n.whose) }}>{n.whose === "you" ? "You" : n.whose === "both" ? "Either of you" : n.whose}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{n.label}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The care-team thread. */}
      <div style={head}>Care team{others.length ? " · with " + others.map((o) => o.name).join(", ") : ""}</div>
      <div style={{ border: "1px solid " + STM_HAIR, borderRadius: 6, padding: 10, maxHeight: compact ? 260 : 340, overflowY: "auto" }}>
        {!data.thread || !data.thread.messages.length ? (
          <div style={{ color: STM_INK50, fontSize: 12.5 }}>No messages yet. Plan changes either of you makes are posted here automatically.</div>
        ) : data.thread.messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 10, textAlign: m.mine ? "right" : "left" }}>
            <div style={{ fontFamily: STM_MONO, fontSize: 8.5, color: STM_INK50, letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.handoff ? "↻ Plan change · " : ""}{m.from} · {new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            <div style={{ display: "inline-block", marginTop: 3, padding: "7px 10px", borderRadius: 8, maxWidth: "85%", textAlign: "left", fontSize: 12.5, lineHeight: 1.45,
              background: m.handoff ? "rgba(var(--sh-accent-rgb, 46,224,196),0.08)" : m.mine ? "rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.04)",
              border: m.handoff ? "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)" : "1px solid transparent" }}>{m.body}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label="Message the care team" placeholder={"Write to " + (others[0] ? others[0].name.split(/\s+/)[0] : "the care team") + "…"}
          style={{ flex: 1, resize: "vertical", background: "transparent", color: "var(--sh-ink, #f2ede4)", border: "1px solid " + STM_HAIR, borderRadius: 6, padding: 8, fontFamily: "inherit", fontSize: 12.5 }} />
        <button type="button" onClick={send} disabled={sending || !draft.trim()} style={{ ...btn, alignSelf: "flex-end", background: draft.trim() ? STM_TEAL : "transparent", color: draft.trim() ? "var(--sh-deep, #06231f)" : STM_INK50, border: 0, padding: "9px 14px", cursor: sending ? "wait" : "pointer" }}>{sending ? "Sending…" : "Send"}</button>
      </div>
      {sendErr && <div role="status" style={{ fontSize: 12, color: STM_INK50, marginTop: 4 }}>{sendErr}</div>}
      <div style={{ marginTop: 14, fontSize: 11.5, color: STM_INK50, lineHeight: 1.55 }}>
        You both see: check-ins, workout and food logs, weigh-ins, sleep, Score, and each other's plan in outline. Only you: your private notes and your own thread with {data.client.name}. {data.client.name} never sees this care-team thread.
      </div>
    </div>
  );
}

// The "Shared" view on the Clients page: the shared clients, each opening its Team view.
function SharedClientsTeamView({ role, rows }) {
  const [open, setOpen] = React.useState(null);
  const list = Array.isArray(rows) ? rows : [];
  const byClient = [];
  for (const r of list) {
    const at = byClient.find((x) => x.clientId === r.clientId);
    if (at) at.others.push(r.counterpart); else byClient.push({ clientId: r.clientId, clientName: r.clientName, others: [r.counterpart] });
  }
  if (!byClient.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      {byClient.map((c) => (
        <div key={c.clientId} style={{ borderTop: "1px solid " + STM_HAIR, padding: "12px 4px" }}>
          <button type="button" aria-expanded={open === c.clientId} onClick={() => setOpen(open === c.clientId ? null : c.clientId)}
            style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "baseline", gap: 10, background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, textAlign: "left" }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{c.clientName}</span>
            <span style={{ fontFamily: STM_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: STM_INK50 }}>
              With {c.others.map((o) => o.name + " · " + o.role).join(", ")} · {open === c.clientId ? "Close" : "Team →"}
            </span>
          </button>
          {open === c.clientId && <div style={{ marginTop: 12 }}><SharedTeamPanel clientId={c.clientId} role={role} /></div>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { SharedTeamPanel, SharedClientsTeamView, useSharedClients, stmSharedClients });
