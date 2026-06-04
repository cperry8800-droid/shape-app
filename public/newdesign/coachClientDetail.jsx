// Per-client overview page for a coach.
// Used by TrainerClient.html and NutritionistClient.html. Reads the client id
// from ?id=... and renders care team + combined schedule. Counterpart card
// has a Message button that opens the existing chat widget on a coach↔coach
// thread (created via /api/me/shared-clients/:clientId/thread).

function CoachClientDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("id");
  const [data, setData] = React.useState(null);
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

  if (err) {
    return (
      <DashPage navItems={trainerNavItems("clients")} payoutCard={trainerPayoutCard} eyebrow="CLIENT" title="Couldn't load" subtitle={err}>
        <Card><div style={{ padding: 24, color: "rgba(242,237,228,0.65)" }}>Try refreshing or go back to the clients list.</div></Card>
      </DashPage>
    );
  }
  if (!data) {
    return (
      <DashPage navItems={trainerNavItems("clients")} payoutCard={trainerPayoutCard} eyebrow="CLIENT" title="Loading…" subtitle="">
        <Card><div style={{ padding: 24, color: "rgba(242,237,228,0.55)" }}>Loading client overview…</div></Card>
      </DashPage>
    );
  }

  const myRole = data.me.trainerId ? "trainer" : (data.me.nutritionistId ? "nutritionist" : null);
  const navItems = myRole === "nutritionist" ? nutriNavItems("clients") : trainerNavItems("clients");
  const payout = myRole === "nutritionist" ? nutriPayoutCard : trainerPayoutCard;

  const counterparts = data.careTeam.filter(c => !c.isMe);
  const me = data.careTeam.find(c => c.isMe);

  const upcoming = data.sessions.filter(s => new Date(s.at).getTime() >= Date.now() && s.status !== "completed");
  const past = data.sessions.filter(s => new Date(s.at).getTime() < Date.now() || s.status === "completed").slice(-12).reverse();

  return (
    <DashPage
      navItems={navItems}
      payoutCard={payout}
      eyebrow="CLIENT"
      title={data.client.name}
      subtitle={counterparts.length ? `Care team of ${data.careTeam.length}` : `You are this client's only coach right now.`}
    >
      {counterparts.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>CARE TEAM</div>
          <div style={{ display: "grid", gap: 12 }}>
            {counterparts.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", padding: "12px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 999, background: "rgba(46,224,196,0.18)", border: "1px solid rgba(46,224,196,0.35)", overflow: "hidden" }}>
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", color: "rgba(242,237,228,0.55)", textTransform: "uppercase" }}>{c.role}</div>
                </div>
                {c.userId ? (
                  <button onClick={() => openMessage(c)} disabled={busy}
                    style={{ background: "#0ac5a8", color: "#1a1612", border: 0, padding: "8px 16px", borderRadius: 999, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 500, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>
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
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>CURRENT PLANS</div>
          <div style={{ display: "grid", gridTemplateColumns: data.plans.length > 1 ? "1fr 1fr" : "1fr", gap: 14 }}>
            {data.plans.map((p) => {
              const tone = p.providerRole === "trainer" ? "#2ee0c4" : "#d2693f";
              const tpl = p.template;
              return (
                <div key={p.assignmentId} style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 6, height: 18, borderRadius: 3, background: tone }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(242,237,228,0.55)", textTransform: "uppercase" }}>
                      {p.providerRole} · {p.coachName}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: tone, marginLeft: "auto", textTransform: "uppercase" }}>{p.status}</span>
                  </div>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, letterSpacing: "-0.01em", marginBottom: 6 }}>
                    {tpl ? tpl.title : "Custom plan"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(242,237,228,0.65)", lineHeight: 1.6 }}>
                    {tpl ? [
                      tpl.goal,
                      tpl.level,
                      tpl.durationWeeks ? `${tpl.durationWeeks} wks` : null,
                      tpl.daysPerWeek ? `${tpl.daysPerWeek}×/wk` : null,
                    ].filter(Boolean).join(" · ") : "Details visible to the assigning coach."}
                  </div>
                  {p.notes && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)", fontSize: 12, color: "rgba(242,237,228,0.55)", fontStyle: "italic" }}>
                      "{p.notes}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.goals && (() => {
        const G = data.goals;
        const ov = G.overall, trM = G.trainingMeta, nuM = G.nutritionMeta;
        const subHead = (txt) => <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)", marginTop: 16 }}>{txt}</div>;
        const metaRow = (title, subtitle, c) => (
          <div style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: "12px 14px", marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 5, height: 18, borderRadius: 3, background: c, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 16, letterSpacing: "-0.01em" }}>{title}</div>
              {subtitle && <div style={{ marginTop: 3, fontSize: 12, fontStyle: "italic", color: "rgba(242,237,228,0.55)", lineHeight: 1.4 }}>{subtitle}</div>}
            </div>
          </div>
        );
        const hasAny = ov || (trM && trM.title) || (nuM && nuM.title);
        return (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", marginBottom: 6 }}>GOALS</div>
            {G.share === false ? (
              <div style={{ padding: "12px 0", color: "rgba(242,237,228,0.6)", fontSize: 13 }}>{data.client.name.split(/\s+/)[0]} keeps their goals private.</div>
            ) : !hasAny ? (
              <div style={{ padding: "12px 0", color: "rgba(242,237,228,0.6)", fontSize: 13 }}>No goals shared yet.</div>
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
                    <div style={{ border: "1px solid rgba(10,197,168,0.3)", borderRadius: 10, padding: 14, marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "#2ee0c4" }}>OVERALL{byLabel ? ` · BY ${byLabel}` : ""}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{Math.round(pct * 100)}% there</span>
                      </div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, letterSpacing: "-0.01em", margin: "6px 0 8px" }}>{ov.title}</div>
                      <div style={{ height: 6, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct * 100}%`, background: "#0ac5a8" }} /></div>
                      <div style={{ marginTop: 7, fontSize: 11.5, color: "rgba(242,237,228,0.55)" }}>{down} {unit} so far · {Math.abs(toGo)} {unit} to go · now {now}{unit} · target {target}{unit}</div>
                      {Array.isArray(ov.weighIns) && ov.weighIns.length >= 2 && (() => {
                        const vals = ov.weighIns.map(x => Number(x.kg)).filter(Number.isFinite);
                        if (vals.length < 2) return null;
                        const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1, n = vals.length, W = 300, H = 50;
                        const pts = vals.map((v, i) => [(i / (n - 1)) * W, H - 4 - ((v - mn) / span) * (H - 10)]);
                        const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
                        return (
                          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", marginTop: 10 }}>
                            <path d={`${line} L${W},${H} L0,${H} Z`} fill="rgba(10,197,168,0.12)" />
                            <path d={line} fill="none" stroke="#0ac5a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                          </svg>
                        );
                      })()}
                    </div>
                  );
                })()}
                {trM && trM.title && <>{subHead("TRAINING")}{metaRow(trM.title, trM.subtitle, "#d2693f")}</>}
                {nuM && nuM.title && <>{subHead("NUTRITION")}{metaRow(nuM.title, nuM.subtitle, "#d8b25a")}</>}
              </div>
            )}
          </Card>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>UPCOMING</div>
          {upcoming.length === 0 ? (
            <div style={{ padding: "18px 0", color: "rgba(242,237,228,0.55)", fontSize: 13 }}>Nothing on the books.</div>
          ) : upcoming.slice(0, 12).map((s, i) => (
            <SessionRow key={s.id} s={s} first={i === 0} mine={isMine(s, data.me)} />
          ))}
        </Card>
        <Card>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>RECENT</div>
          {past.length === 0 ? (
            <div style={{ padding: "18px 0", color: "rgba(242,237,228,0.55)", fontSize: 13 }}>No history yet.</div>
          ) : past.map((s, i) => (
            <SessionRow key={s.id} s={s} first={i === 0} mine={isMine(s, data.me)} />
          ))}
        </Card>
      </div>
    </DashPage>
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
  const tone = s.providerRole === "trainer" ? "#2ee0c4" : "#d2693f";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", padding: "12px 0", borderTop: first ? "none" : "1px solid rgba(242,237,228,0.05)" }}>
      <div style={{ width: 6, height: 36, borderRadius: 3, background: tone, opacity: mine ? 1 : 0.45 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{dateLabel} · {timeLabel}</div>
        <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.6)", marginTop: 2 }}>
          {s.coachName} · {s.providerRole} · {s.durationMin}min · {s.type}{s.topic ? ` · ${s.topic}` : ""}
        </div>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.55)", textTransform: "uppercase" }}>{s.status}</div>
    </div>
  );
}
