// Weekly commitment + stake (web parity of the mobile card). Reads/writes via
// /api/client/commitment (cookie session). States: none / proposed / active / settled.
function ClientCommitmentCard() {
  const [data, setData] = React.useState(undefined); // undefined = loading
  const [editing, setEditing] = React.useState(false);
  const [f, setF] = React.useState({ workouts: 4, checkin: true, habits: 5, stake: 20 });
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => {
    fetch("/api/client/commitment", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d || { commitment: null, progress: { workouts: 0, checkin: false, habits: 0 } }))
      .catch(() => setData({ commitment: null, progress: { workouts: 0, checkin: false, habits: 0 } }));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  if (data === undefined) return null;
  const c = data.commitment;
  const prog = data.progress || { workouts: 0, checkin: false, habits: 0 };
  const post = (payload, after) => {
    fetch("/api/client/commitment", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((r) => r.json()).then(() => { if (after) after(); load(); }).catch(() => setBusy(false));
  };
  const save = () => {
    if (busy) return; setBusy(true);
    const targets = {};
    if (f.workouts > 0) targets.workouts = f.workouts;
    if (f.checkin) targets.checkin = true;
    if (f.habits > 0) targets.habits = f.habits;
    post({ action: "set", targets, stake: f.stake }, () => { setBusy(false); setEditing(false); });
  };
  const tg = (c && c.targets) || {};
  const targetLine = [
    tg.workouts ? `${prog.workouts}/${tg.workouts} workouts` : null,
    tg.checkin ? `check-in ${prog.checkin ? "✓" : "◦"}` : null,
    tg.habits ? `${prog.habits}/${tg.habits} habits` : null,
  ].filter(Boolean).join(" · ");
  const btn = (bg, color, border) => ({ background: bg, color, border: border || 0, padding: "9px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" });
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>This week's commitment</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.45)", marginLeft: 12 }}>PUT POINTS ON IT</span>
        </div>
        {c && c.stake ? <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEAL_BRIGHT, fontWeight: 600 }}>{c.stake} pts staked</span> : null}
      </div>
      {!c && !editing && (
        <React.Fragment>
          <div style={{ fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 4 }}>Hit your target this week for a bonus; miss it and you forfeit the stake.</div>
          <button onClick={() => setEditing(true)} style={{ marginTop: 12, ...btn(TEAL, "#04201d") }}>Set a commitment</button>
        </React.Fragment>
      )}
      {c && !editing && (
        <React.Fragment>
          <div style={{ fontFamily: serif, fontSize: 22, color: INK, marginTop: 6 }}>{targetLine || "—"}</div>
          <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: c.status === "met" ? TEAL_BRIGHT : c.status === "missed" ? "#e0463c" : "rgba(242,237,228,0.55)" }}>
            {c.status === "met" ? `✓ Kept · +${c.stake} earned` : c.status === "missed" ? `Missed · −${c.stake}` : c.status === "proposed" ? "Proposed by your coach" : "Active · settles at week's end"}
          </div>
          {c.status === "proposed" && (
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button onClick={() => post({ action: "accept", id: c.id })} style={btn(TEAL, "#04201d")}>Accept</button>
              <button onClick={() => setEditing(true)} style={btn("transparent", INK, "1px solid rgba(242,237,228,0.25)")}>Change</button>
            </div>
          )}
        </React.Fragment>
      )}
      {editing && (
        <div style={{ marginTop: 10 }}>
          {[["Workouts", "workouts", 0, 14], ["Habit check-offs", "habits", 0, 21]].map(([label, key, lo, hi]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 14 }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setF((s) => ({ ...s, [key]: Math.max(lo, s[key] - 1) }))} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(242,237,228,0.25)", background: "transparent", color: INK, cursor: "pointer" }}>−</button>
                <span style={{ minWidth: 20, textAlign: "center", fontFamily: serif, fontSize: 16 }}>{f[key]}</span>
                <button onClick={() => setF((s) => ({ ...s, [key]: Math.min(hi, s[key] + 1) }))} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(242,237,228,0.25)", background: "transparent", color: INK, cursor: "pointer" }}>+</button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <span style={{ fontSize: 14 }}>Weekly check-in</span>
            <button onClick={() => setF((s) => ({ ...s, checkin: !s.checkin }))} style={{ padding: "6px 14px", borderRadius: 999, border: `1px solid ${f.checkin ? TEAL : "rgba(242,237,228,0.25)"}`, background: f.checkin ? "rgba(10,197,168,0.12)" : "transparent", color: INK, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>{f.checkin ? "Yes" : "No"}</button>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}><span>STAKE</span><span style={{ color: TEAL_BRIGHT }}>{f.stake} pts</span></div>
            <input type="range" aria-label="Stake points" min={5} max={50} step={5} value={f.stake} onChange={(e) => setF((s) => ({ ...s, stake: Number(e.target.value) }))} style={{ width: "100%", marginTop: 6, accentColor: TEAL }} />
            <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.6)", marginTop: 4 }}>Hit it → +{f.stake} · miss → −{f.stake} (never below 0).</div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button disabled={busy} onClick={save} style={{ ...btn(TEAL, "#04201d"), opacity: busy ? 0.6 : 1 }}>{busy ? "Setting…" : "Lock it in"}</button>
            <button onClick={() => setEditing(false)} style={btn("transparent", INK, "1px solid rgba(242,237,228,0.25)")}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ClientScorePage() {
  // 5-tier monthly-points reward structure.
  // [name, threshold (number), display "PTS / N+", benefit copy]
  const tiers = [
    ["Raw",    0,     "0+",      "Starting level"],
    ["Tempo",  750,   "750+",    "Free Shape cap"],
    ["Form",   2000,  "2,000+",  "Free coach workout or plan"],
    ["Peak",   5000,  "5,000+",  "A free month with a coach"],
    ["Legend", 15000, "15,000+", "A free year of Shape + a cap"],
  ];

  // Live score state. When signed in, the API hydrates this with the
  // user's own ledger totals. When signed out, we keep the static demo
  // numbers so the page still renders for marketing.
  const [live, setLive] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    fetch('/api/client/score', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && typeof d.points_total === 'number') setLive(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const myPoints = live ? live.points_total : 1284;
  const atRisk = !!(live && live.at_risk);
  // Displayed tier is high-water-marked: prefer the API's current_tier (the
  // highest the rank has ever reached) so penalties dent the number but never
  // demote the tier. Fall back to deriving from the rank when signed out.
  let currentIdx = 0;
  const apiIdx = live && live.current_tier && live.current_tier.name
    ? tiers.findIndex(t => t[0].toLowerCase() === String(live.current_tier.name).toLowerCase())
    : -1;
  if (apiIdx >= 0) {
    currentIdx = apiIdx;
  } else {
    for (let i = tiers.length - 1; i >= 0; i--) { if (myPoints >= tiers[i][1]) { currentIdx = i; break; } }
  }
  const currentTier = tiers[currentIdx];
  const nextTier = tiers[currentIdx + 1] || null;
  const ptsToNext = (live && typeof live.points_to_next === 'number') ? live.points_to_next : (nextTier ? nextTier[1] - myPoints : 0);
  const tierFloor = currentTier[1];
  const tierCeiling = nextTier ? nextTier[1] : tierFloor;
  const progressPct = nextTier ? Math.min(100, Math.max(0, ((myPoints - tierFloor) / (tierCeiling - tierFloor)) * 100)) : 100;

  const staticBreakdown = [
    ["Workouts logged",   420, "14d streak · +8 this week"],
    ["Plan adherence",    280, "92% · last 30d"],
    ["Habits",            120, <>78% adherence · 9 active · <a href="ClientHabits.html" style={{ color: TEAL_BRIGHT, textDecoration: "none" }}>open →</a></>],
    ["PRs hit",           180, "4 this quarter"],
    ["Community",          84, "12 posts, 38 reactions"],
    ["Coach endorsements",160, "Maya + Rae weekly"],
    ["Radio participation",60, "4 rooms joined"],
    ["Referrals",         100, "2 friends on Shape"],
  ];
  const breakdown = live && Array.isArray(live.breakdown_total) && live.breakdown_total.length
    ? live.breakdown_total.map(b => [b.label, b.points, ""])
    : staticBreakdown;
  const total = breakdown.reduce((a, b) => a + b[1], 0);

  // Recent ledger entries
  const fmtWhen = (iso) => {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0,0,0,0);
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const dd = new Date(d); dd.setHours(0,0,0,0);
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (dd.getTime() === today.getTime()) return `Today · ${t}`;
    if (dd.getTime() === y.getTime()) return `Yesterday · ${t}`;
    return `${d.toLocaleDateString([], { weekday: 'short' })} · ${t}`;
  };
  const staticLedger = [
    { when: "Today · 9:14 AM",     what: "Workout logged · Upper Pull",   delta: 8  },
    { when: "Today · 8:02 AM",     what: "Habits · 5 of 6 done",          delta: 18 },
    { when: "Yesterday · 7:48 PM", what: "Plan adherence · day complete", delta: 12 },
    { when: "Yesterday · 6:30 PM", what: "Coach endorsement · Maya",      delta: 24 },
    { when: "Tue · 9:00 AM",       what: "Workout logged · Lower power",  delta: 8  },
    { when: "Tue · 12:30 PM",      what: "Meal logged · on plan",         delta: 4  },
    { when: "Mon · 6:15 AM",       what: "Squat PR · +5 lb",              delta: 32 },
    { when: "Mon · 6:00 PM",       what: "Community reactions · 4 received",  delta: 4  },
  ];
  const ledger = live && Array.isArray(live.recent) && live.recent.length
    ? live.recent.slice(0, 8).map(r => ({
        when: fmtWhen(r.earned_at),
        what: r.note || (r.source_kind || 'Score event'),
        delta: r.delta,
      }))
    : staticLedger;

  const ORANGE = "#c1641f";
  // Momentum meter — real { value, bonusThisWeek } when signed in (null = pre-migration,
  // card hidden); a demo value drives the signed-out marketing preview.
  const momentum = live ? (live.momentum || null) : { value: 72, bonusThisWeek: false };

  // Each card below becomes a draggable/resizable DashGrid widget (role=client, tab=score),
  // mirroring the client Today rollout. The DashPage hero (title/subtitle/actions) stays as
  // the page header; only the card stack is gridded.
  const maxBreakdown = Math.max(...breakdown.map(b => b[1]), 1);
  const scoreWidgets = [
    momentum ? { key: "momentum", title: "Momentum", size: "full", render: () => {
      const mv = Math.max(0, Math.min(100, Math.round(Number(momentum.value) || 0)));
      const hit = mv >= 80;
      return (
        <Card>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Momentum</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.45)", marginLeft: 12 }}>DON'T BREAK THE STREAK</span>
            </div>
            <span style={{ fontFamily: serif, fontSize: 28, color: TEAL_BRIGHT, lineHeight: 1 }}>{mv}<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.45)" }}>/100</span></span>
          </div>
          <div style={{ height: 8, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
            <div style={{ height: "100%", width: `${mv}%`, background: TEAL, borderRadius: 999 }} />
          </div>
          <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: momentum.bonusThisWeek ? TEAL_BRIGHT : "rgba(242,237,228,0.55)" }}>
            {momentum.bonusThisWeek
              ? ((momentum.streakWeeks || 1) > 1
                  ? `🔥 ${momentum.streakWeeks}-week streak · +${momentum.points || 25} banked`
                  : `✓ +${momentum.points || 25} banked this week`)
              : hit ? "At the line · hold it to bank this week" : "Reach 80 for a weekly bonus — grows to +100"}
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "rgba(242,237,228,0.65)" }}>Stay active day to day — a missed day dips it a notch, not a reset.</div>
        </Card>
      );
    } } : null,

    { key: "commitment", title: "This week's commitment", size: "full", render: () => <ClientCommitmentCard /> },

    { key: "tiers", title: "Reward tiers", size: "full", render: () => (
      <div data-tour="hero-score">
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Reward tiers</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.45)", marginLeft: 12 }}>LIFETIME POINTS</span>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.45)" }}>{tiers.length} TIERS</span>
        </div>
        <div style={{ marginTop: 12 }}>
          {tiers.map(([t, , r, d], i) => {
            const isCurrent = i === currentIdx;
            return (
              <div key={t} style={{
                display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 24, alignItems: "center",
                padding: "18px 8px",
                borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.08)",
                background: isCurrent ? "rgba(10,197,168,0.06)" : "transparent",
                margin: i === 0 ? "0 -8px" : "0 -8px",
                borderRadius: 6,
              }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: ORANGE, fontWeight: 500 }}>PTS</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: INK, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{r}</div>
                </div>
                <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", color: isCurrent ? INK : "rgba(242,237,228,0.85)", lineHeight: 1 }}>
                  {t}
                  {isCurrent && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginLeft: 12, verticalAlign: "middle" }}>YOU ARE HERE</span>}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", textTransform: "uppercase", textAlign: "right", maxWidth: 280 }}>{d}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace" }}>
          <span>{myPoints.toLocaleString()}</span>
          {nextTier && <span>{nextTier[0].toUpperCase()} AT {nextTier[1].toLocaleString()}</span>}
        </div>
        <div style={{ height: 6, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: TEAL, borderRadius: 999 }} />
        </div>
      </Card>
      </div>
    ) },

    { key: "breakdown", title: "Score breakdown", size: "full", render: () => (
      <Card>
        <SectionTitle right={`TOTAL ${total.toLocaleString()}`}>Score breakdown</SectionTitle>
        {breakdown.map(([l, v, sub], i) => {
          const w = (v / maxBreakdown) * 100;
          return (
            <div key={i} style={{ padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{l}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TEAL_BRIGHT }}>+{v}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginBottom: 8 }}>{sub}</div>
              <div style={{ height: 3, background: "rgba(242,237,228,0.06)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${w}%`, background: TEAL }} />
              </div>
            </div>
          );
        })}
      </Card>
    ) },

    { key: "gains", title: "This week's gains", size: "half", render: () => (
      <Card>
        <SectionTitle>This week's gains</SectionTitle>
        <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.02em", lineHeight: 1 }}>+{live ? live.week_gain : 36}</div>
        <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 8 }}>{live ? "last 7 days" : "vs 28 last week"}</div>
        {!live && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)", display: "grid", gap: 8, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(242,237,228,0.55)" }}>4 workouts logged</span><span>+32</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(242,237,228,0.55)" }}>Squat PR</span><span>+12</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(242,237,228,0.55)" }}>Community reactions</span><span>+4</span></div>
          </div>
        )}
      </Card>
    ) },

    { key: "path", title: "Shortest path", size: "half", render: () => (
      <Card style={{ background: "rgba(10,197,168,0.06)", border: "1px solid rgba(10,197,168,0.25)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>SHORTEST PATH TO {nextTier ? nextTier[0].toUpperCase() : "—"}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(242,237,228,0.85)" }}>{nextTier ? `${ptsToNext.toLocaleString()} points stand between you and ${nextTier[0]}. Lock 4 workouts + the habit checklist this week and you're inside ${Math.ceil(ptsToNext / 36)} weeks.` : "You're at the top tier. Keep the streak alive."}</div>
      </Card>
    ) },

    { key: "ledger", title: "Recent points", size: "full", render: () => (
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Recent points</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.45)" }}>LEDGER</span>
        </div>
        <div style={{ marginTop: 12 }}>
          {ledger.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 16, alignItems: "center", padding: "12px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{row.when}</div>
              <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.85)" }}>{row.what}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TEAL_BRIGHT, fontVariantNumeric: "tabular-nums" }}>+{row.delta}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)" }}>
          <span>SHOWING LAST 8 ENTRIES</span>
          <a href="#" style={{ color: TEAL_BRIGHT, textDecoration: "none" }}>VIEW FULL LEDGER →</a>
        </div>
      </Card>
    ) },
  ].filter(Boolean);

  return (
    <DashPage
      navItems={clientNavItems("score")}
      payoutCard={clientPayoutCard}
      eyebrow="SHAPE SCORE · UPDATED NIGHTLY"
      title={myPoints.toLocaleString()}
      subtitle={atRisk
        ? `You're in ${currentTier[0]} — but your score has slipped ${(tierFloor - myPoints).toLocaleString()} below the line. Earn it back to stay clear of the cutoff.`
        : `You're in ${currentTier[0]}. ${ptsToNext.toLocaleString()} points to ${nextTier ? nextTier[0] : "the top"} — that's about ${nextTier ? Math.ceil(ptsToNext / 36) : 0} weeks at your current pace.`}
      actions={<>
        <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>How it works</button>
        <button style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Leaderboard</button>
      </>}
    >
      <DashGrid role="client" tab="score" widgets={scoreWidgets} />
    </DashPage>
  );
}
