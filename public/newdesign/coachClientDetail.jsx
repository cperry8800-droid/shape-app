// Per-client overview page for a coach — brought in line with the mobile
// broadsheet client-profile redesign (Overview / Analysis tabs, KPI dashboard).
// Used by TrainerClient.html and NutritionistClient.html. Reads ?id=… and the
// share-gated rollups from /api/clients/:id/shared-overview (goals/stats/lifts).
// Counterpart card's Message button opens the coach↔coach thread.

function ckNum(v) { return (v == null || v === "" || isNaN(Number(v))) ? null : Number(v); }

function CKStat({ label, value, small, sub, color }) {
  return (
    <div style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: "14px 16px", background: "rgba(242,237,228,0.02)" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 30, letterSpacing: "-0.01em", marginTop: 6 }}>{value}{small ? <span style={{ fontSize: 15, color: "rgba(242,237,228,0.5)" }}>{small}</span> : null}</div>
      {sub ? <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{sub}</div> : null}
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
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={color + "22"} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lp[0]} cy={lp[1]} r="3.5" fill={color} />
    </svg>
  );
}

function CKSecHead({ children }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>{children}</div>;
}

// THE LIVE STATION (spec 2026-07-19): a realtime view of the client's
// in-progress session. Consumer-side hygiene ported from the mobile console
// (iosAppBroadsheetPros.jsx BSProLiveWatch): the `evented` TOCTOU guard (a
// late initial fetch never overwrites a newer realtime event/DELETE) and the
// subscription-side expires_at timer (an open page drops the row at expiry).
// No readable row → null — THE STATION DOES NOT EXIST (absence; never a
// "private" label: RLS makes private / not-visible / expired indistinguishable).
function CKLiveStation({ clientId, accent }) {
  const [row, setRow] = React.useState(null);
  React.useEffect(() => {
    const sdb = window.shapeDb;
    const db = sdb && sdb.client;
    // clientId rides straight from the URL into a RAW postgres_changes filter
    // string — validate it as a UUID before interpolating (review: CodeRabbit).
    const okId = typeof clientId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId);
    // SYNCHRONOUS reset on client change — B must never render A's payload, even
    // for a frame (spec review). This runs BEFORE the bail-out guard on purpose:
    // switching to a malformed clientId (or a momentarily-missing db) must still
    // drop A's row, or the early return would leave A rendered under B's header —
    // the exact leak this reset exists to prevent (review: CodeRabbit).
    setRow(null);
    if (!db || !okId) return undefined;
    let on = true; let evented = false; let expTimer = null; let channel = null;
    const take = (r, fromEvent) => {
      if (!on) return;
      if (fromEvent) evented = true; else if (evented) return;   // TOCTOU guard
      // Expiry gates EVENTS too (review round): an already-expired realtime
      // INSERT/UPDATE would set no timer and pin the station forever.
      const expMs = r && r.expires_at ? new Date(r.expires_at).getTime() - Date.now() : 0;
      if (r && !(expMs > 0)) r = null;   // expired OR invalid/NaN expiry = absence (NaN fails > 0)
      setRow(r);
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      if (r && expMs > 0) expTimer = setTimeout(() => { if (on) setRow(null); }, expMs);
    };
    // Realtime does NOT apply postgres_changes filters to DELETE events, so a
    // DELETE for ANOTHER member's row can land here and would blank this card.
    // user_id is the table's PRIMARY KEY, so the default replica identity
    // carries it in `old` — only act on a real match (review: CodeRabbit).
    // Case-INSENSITIVE match: okId accepts any-case UUID, but Postgres emits
    // uuid lowercased. A strict === against an upper/mixed-case URL value would
    // drop EVERY event for this client, silently (review: CodeRabbit).
    const wantId = clientId.toLowerCase();
    const mine = (rec) => !!(rec && typeof rec.user_id === "string" && rec.user_id.toLowerCase() === wantId);
    (async () => {
      // The page's own /api/... fetch rides the Next.js cookie session, but this
      // DIRECT query does not: client.auth.getSession() is empty when the session
      // lives only in HTTP cookies, so the read would run as ANON, RLS would hide
      // every row, and the station would SILENTLY never appear for a cookie-session
      // coach (review: Codex P2). Bootstrap the session bridge first.
      try { if (sdb.getSession) await sdb.getSession(); } catch (e) { /* fall through as anon */ }
      if (!on) return;
      // Subscribe BEFORE the initial read so no event can slip through the gap;
      // the `evented` guard still lets a live event beat a slow first fetch.
      try {
        channel = db.channel(`ck-live-${clientId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "user_activity_live", filter: `user_id=eq.${clientId}` },
            (p) => {
              try {
                if (p.eventType === "DELETE") { if (mine(p.old)) take(null, true); return; }
                if (mine(p.new)) take(p.new, true);
              } catch (e) { console.warn("[shape] live station: bad realtime payload", e); }
            })
          .subscribe((status, err) => {
            // Don't fail silently: a dropped/erroring channel leaves the station
            // frozen with no clue why (review: CodeRabbit).
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              console.warn("[shape] live station: realtime channel " + status, err || "");
            }
          });
      } catch (e) { console.warn("[shape] live station: subscribe failed", e); }
      if (!on) return;
      try {
        const res = await db.from("user_activity_live")
          .select("payload, started_at, updated_at, expires_at")
          .eq("user_id", clientId).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (res && res.error) { console.warn("[shape] live station: initial read failed", res.error.message || res.error); return; }
        take((res && res.data) || null, false);
      } catch (e) { console.warn("[shape] live station: initial read threw", e); }
    })();
    return () => { on = false; if (expTimer) clearTimeout(expTimer); if (channel) { try { db.removeChannel(channel); } catch (e) {} } };
  }, [clientId]);
  const lp = row && window.ShapeLiveValidate ? window.ShapeLiveValidate.bsValidLivePayload(row.payload) : null;
  // Workout payloads only (review round): the cooking-detail PR later teaches
  // the validator a {kind:'cooking'} shape with NO exercises — this station
  // must gate on the discriminator or that row would crash the render.
  if (!lp || (lp.kind && lp.kind !== 'workout')) return null;   // absence — the station does not exist
  const started = row.started_at ? new Date(row.started_at).getTime() : null;
  const mins = started != null ? Math.max(0, Math.floor((Date.now() - started) / 60000)) : null;
  return (
    <Card style={{ marginBottom: 16, border: `1px solid ${accent}55` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <CKSecHead>LIVE · IN A SESSION NOW</CKSecHead>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: accent, textTransform: "uppercase" }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: accent, boxShadow: "0 0 8px " + accent, marginRight: 6 }} />
          {lp.resting ? "Resting" : "Working"}{mins != null ? ` · ${mins} min in` : ""} · Sets {lp.setsDone}/{lp.setsTotal}
        </span>
      </div>
      {lp.exercises.map((e, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
          <span style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: i === lp.curIdx ? "#f2ede4" : "rgba(242,237,228,0.7)" }}>
            {i === lp.curIdx ? <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: accent, marginRight: 8 }}>NOW ▸</span> : null}{e.n}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>—</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: e.done >= e.total ? accent : "rgba(242,237,228,0.75)" }}>{e.done}/{e.total}</span>
        </div>
      ))}
    </Card>
  );
}

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
  const isNutri = myRole === "nutritionist";
  const navItems = isNutri ? nutriNavItems("clients") : trainerNavItems("clients");
  const payout = isNutri ? nutriPayoutCard : trainerPayoutCard;
  const teal = "#2ee0c4", rust = "#d2693f", gold = "#d8b25a";
  const accent = isNutri ? gold : teal;
  const firstName = data.client.name.split(/\s+/)[0];

  const counterparts = data.careTeam.filter(c => !c.isMe);
  const upcoming = data.sessions.filter(s => new Date(s.at).getTime() >= Date.now() && s.status !== "completed");
  const past = data.sessions.filter(s => new Date(s.at).getTime() < Date.now() || s.status === "completed").slice(-12).reverse();

  // ── live rollups (with per-field demo fallback) ──
  const S = data.stats || {}, L = data.lifts || {};
  const G = data.goals || {};
  const ov = (G && G.share !== false && G.overall) ? G.overall : null;
  const liveW = ov && Array.isArray(ov.weighIns) ? ov.weighIns.map(x => Number(x.kg)).filter(x => !isNaN(x)) : [];
  const bwSeries = liveW.length >= 2 ? liveW : (isNutri ? [80.4, 80.1, 79.9, 79.7, 79.6, 79.4, 79.3, 79.2] : [64.4, 64.6, 65.0, 64.6, 64.3, 64.1, 63.9, 63.8]);
  const bwUnit = (ov && ov.unit) || "kg";
  const bwNow = bwSeries[bwSeries.length - 1];
  const bwDelta = +(bwNow - bwSeries[0]).toFixed(1);
  const bwWeeks = bwSeries.length;

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
    return L.keyLifts.map(x => { const b = ckNum(x.best), dl = ckNum(x.delta), e1 = ckNum(x.e1rm); const v = b != null ? (e1 != null ? `${b} kg · ${Math.round(e1)} e1RM` : `${b} kg`) : "—"; return { n: x.name || "Lift", v, d: dl != null ? `${dl >= 0 ? "+" : ""}${dl}` : "—", p: b != null && mx ? Math.max(0.2, b / mx) : 0.5 }; });
  })() : [
    { n: "Back Squat", v: "82.5 kg", d: "+7.5", p: 0.92 },
    { n: "Bench Press", v: "52.5 kg", d: "+5.0", p: 0.55 },
    { n: "Deadlift", v: "110 kg", d: "+10", p: 1.0 },
    { n: "Overhead Press", v: "35 kg", d: "+2.5", p: 0.38 },
  ];
  const macros = [
    { n: "Protein", cur: avgP != null ? avgP : 165, tgt: 170, c: teal },
    { n: "Carbs", cur: avgC != null ? avgC : 190, tgt: 200, c: gold },
    { n: "Fat", cur: avgF != null ? avgF : 60, tgt: 62, c: rust },
  ];

  const statGrid = isNutri ? [
    { label: "ADHERENCE", value: adherencePct != null ? adherencePct : 92, small: "%", sub: "this week", color: gold },
    { label: "AVG INTAKE", value: kcalStr || "2,040", sub: "kcal / day", color: gold },
    { label: "WEIGHT Δ", value: bwDelta, small: bwUnit, sub: "vs start", color: rust },
    { label: "LOGGED", value: days7 != null ? days7 : 6, small: "/7", sub: "this week", color: gold },
  ] : [
    { label: "ATTENDANCE", value: attendancePct != null ? attendancePct : 96, small: "%", sub: "this block", color: teal },
    { label: "SESSIONS", value: sDone != null ? sDone : 38, sub: `of ${sPlan != null ? sPlan : 41} planned`, color: teal },
    { label: "AVG RPE", value: avgRpe != null ? avgRpe.toFixed(1) : "8.0", sub: "effort logged", color: rust },
    { label: "PRS", value: prs != null ? prs : 3, sub: "this block", color: gold },
  ];

  return (
    <DashPage
      navItems={navItems}
      payoutCard={payout}
      eyebrow="CLIENT"
      title={data.client.name}
      subtitle={counterparts.length ? `Care team of ${data.careTeam.length}` : `You are this client's only coach right now.`}
    >
      <React.Fragment>
          <CKLiveStation clientId={clientId} accent={accent} />
          <Card style={{ marginBottom: 16 }}>
            <CKSecHead>{isNutri ? "ADHERENCE · THIS WEEK" : "TRAINING · THIS BLOCK"}</CKSecHead>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              {statGrid.map((s, i) => <CKStat key={i} {...s} />)}
            </div>
          </Card>

          {!isNutri && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>KEY LIFTS</CKSecHead>
              {liftRows.map((l, i) => (
                <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{l.n}</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{l.v} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: accent }}>▲ {l.d}</span></span>
                  </div>
                  <div style={{ marginTop: 8, height: 3, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(1, l.p) * 100}%`, background: accent }} /></div>
                </div>
              ))}
            </Card>
          )}

          {isNutri && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>MACROS · DAILY AVERAGE VS TARGET</CKSecHead>
              {macros.map((m, i) => (
                <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{m.n}</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 16 }}>{m.cur} g <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: m.c }}>▲ {m.tgt} g</span></span>
                  </div>
                  <div style={{ marginTop: 8, height: 3, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(1, m.cur / m.tgt) * 100}%`, background: m.c }} /></div>
                </div>
              ))}
            </Card>
          )}

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <CKSecHead>{isNutri ? "BODY · WEIGHT TREND" : "BODY · BODYWEIGHT"}</CKSecHead>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: accent }}>{bwNow} {bwUnit} · {bwDelta >= 0 ? "+" : ""}{bwDelta} over {bwWeeks}</span>
            </div>
            <CKTrend vals={bwSeries} color={accent} />
          </Card>

          {counterparts.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>CARE TEAM</CKSecHead>
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
              <CKSecHead>CURRENT PLANS</CKSecHead>
              <div style={{ display: "grid", gridTemplateColumns: data.plans.length > 1 ? "1fr 1fr" : "1fr", gap: 14 }}>
                {data.plans.map((p) => {
                  const tone = p.providerRole === "trainer" ? teal : rust;
                  const tpl = p.template;
                  return (
                    <div key={p.assignmentId} style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 6, height: 18, borderRadius: 3, background: tone }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(242,237,228,0.55)", textTransform: "uppercase" }}>{p.providerRole} · {p.coachName}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: tone, marginLeft: "auto", textTransform: "uppercase" }}>{p.status}</span>
                      </div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, letterSpacing: "-0.01em", marginBottom: 6 }}>{tpl ? tpl.title : "Custom plan"}</div>
                      <div style={{ fontSize: 12, color: "rgba(242,237,228,0.65)", lineHeight: 1.6 }}>
                        {tpl ? [tpl.goal, tpl.level, tpl.durationWeeks ? `${tpl.durationWeeks} wks` : null, tpl.daysPerWeek ? `${tpl.daysPerWeek}×/wk` : null].filter(Boolean).join(" · ") : "Details visible to the assigning coach."}
                      </div>
                      {p.notes && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)", fontSize: 12, color: "rgba(242,237,228,0.55)", fontStyle: "italic" }}>"{p.notes}"</div>}
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
                    <div key={k} style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{l}</div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, marginTop: 4 }}>{R[k] != null ? `${R[k]}/10` : "—"}</div>
                    </div>
                  ))}
                </div>
                {(ck.wins || ck.struggles || ck.question) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(242,237,228,0.06)", display: "grid", gap: 10 }}>
                    {[["WINS", ck.wins, teal], ["STRUGGLES", ck.struggles, rust], ["ASKED YOU", ck.question, accent]].map(([l, v, c]) => v ? (
                      <div key={l}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: c }}>{l}</div>
                        <div style={{ marginTop: 3, fontSize: 13, color: "rgba(242,237,228,0.75)", lineHeight: 1.55 }}>{v}</div>
                      </div>
                    ) : null)}
                  </div>
                )}
              </Card>
            );
          })()}

          {data.sleep && (() => {
            const s = data.sleep;
            const fmtH = (v) => (v == null ? "—" : `${Number(v)}h`);
            const rc = s.readiness == null ? "rgba(242,237,228,0.5)" : s.readiness >= 80 ? accent : s.readiness >= 60 ? "#5b9bd5" : s.readiness >= 40 ? "#e8b14a" : "#c0533b";
            const cells = [
              ["LAST NIGHT", fmtH(s.latest)],
              ["7-DAY AVG", s.avg7 == null ? "—" : `${Number(s.avg7)}h`],
              ["EFFICIENCY", s.efficiency == null ? "—" : `${s.efficiency}%`],
              ["RESTING HR", s.rhr == null ? "—" : `${s.rhr}`],
              ["HRV", s.hrv == null ? "—" : `${s.hrv}`],
              ["RESTED", s.rested == null ? "—" : `${s.rested}/10`],
              ["LATENCY", s.latency == null ? "—" : `${s.latency}m`],
              ["RESPIRATORY", s.respiratory == null ? "—" : `${s.respiratory}/min`],
            ];
            const st = s.stages;
            return (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <CKSecHead>SLEEP · RECOVERY</CKSecHead>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: accent, textTransform: "uppercase" }}>Objective · device-synced</span>
                </div>
                {s.readiness != null && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>READINESS</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 30, color: rc, lineHeight: 1 }}>{s.readiness}</span>
                    <span style={{ fontFamily: "Fraunces, serif", fontSize: 13, color: "rgba(242,237,228,0.5)" }}>/100</span>
                    {s.readinessLabel && <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: rc }}>{s.readinessLabel}</span>}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {cells.map(([l, v]) => (
                    <div key={l} style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{l}</div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, marginTop: 4 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {st && (
                  <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.04em", color: "rgba(242,237,228,0.7)" }}>
                    STAGES · {[st.deep != null ? `Deep ${st.deep}m` : null, st.rem != null ? `REM ${st.rem}m` : null, st.light != null ? `Light ${st.light}m` : null].filter(Boolean).join(" · ") || "—"}
                  </div>
                )}
                {Array.isArray(s.series7) && s.series7.filter((p) => p && p.value != null).length >= 2 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)", marginBottom: 6 }}>7-DAY TREND</div>
                    <CKTrend vals={s.series7.map((p) => p.value)} color={accent} h={56} />
                  </div>
                )}
              </Card>
            );
          })()}

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
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)" }}>{l}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: "rgba(242,237,228,0.75)", lineHeight: 1.55 }}>{v || "— none noted"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "rgba(242,237,228,0.4)", textTransform: "uppercase" }}>Shared with linked coaches for safety & liability{h.consentAt ? ` · completed ${new Date(h.consentAt).toLocaleDateString()}` : ""}</div>
              </Card>
            );
          })()}

          {((Array.isArray(data.measurements) && data.measurements.length > 0) || (Array.isArray(data.progressPhotos) && data.progressPhotos.length > 0)) && (
            <Card style={{ marginBottom: 16 }}>
              <CKSecHead>BODY · MEASUREMENTS & PHOTOS</CKSecHead>
              {Array.isArray(data.measurements) && data.measurements.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: data.progressPhotos.length ? 14 : 0 }}>
                  {data.measurements.map((m) => (
                    <div key={m.site} style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{m.site}</div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, marginTop: 4 }}>{Number(m.value)} <span style={{ fontSize: 12, color: "rgba(242,237,228,0.5)" }}>{m.unit}</span></div>
                      <div style={{ marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "rgba(242,237,228,0.4)" }}>{String(m.measured_on)}</div>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(data.progressPhotos) && data.progressPhotos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                  {data.progressPhotos.slice(0, 6).map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                      <div style={{ height: 110, borderRadius: 8, border: "1px solid rgba(242,237,228,0.1)", background: `url(${p.url}) center/cover` }} />
                      <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.06em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{p.pose} · {String(p.taken_on).slice(5)}</div>
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
                <div style={{ padding: "18px 0", color: "rgba(242,237,228,0.55)", fontSize: 13 }}>Nothing on the books.</div>
              ) : upcoming.slice(0, 12).map((s, i) => <SessionRow key={s.id} s={s} first={i === 0} mine={isMine(s, data.me)} />)}
            </Card>
            <Card>
              <CKSecHead>RECENT</CKSecHead>
              {past.length === 0 ? (
                <div style={{ padding: "18px 0", color: "rgba(242,237,228,0.55)", fontSize: 13 }}>No history yet.</div>
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
  const hasAny = ov || (trM && trM.title) || (nuM && nuM.title) || (wkM && wkM.title);
  return (
    <Card style={{ marginBottom: 16 }}>
      <CKSecHead>GOALS</CKSecHead>
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
