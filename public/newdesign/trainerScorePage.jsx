
function TrainerScorePage() {
  // Coach ladder (scheme J) — coaches climb their own named rungs.
  const COACH_NAME = { Raw:"Certified", Base:"Certified", Tempo:"Pro", Form:"Elite", Peak:"Master", Legend:"Icon", Certified:"Certified", Pro:"Pro", Elite:"Elite", Master:"Master", Icon:"Icon" };
  const cn = (n) => COACH_NAME[n] || n;
  const STATIC_TIERS = [["Certified","0–750","Verified Shape coach",false],["Pro","750–2,000","Consistent coach",false],["Elite","2,000–5,000","Top performer",false],["Master","5,000–15,000","Top tier",true],["Icon","15,000+","Top 1% of coaches",false]];
  const STATIC_BREAKDOWN = [
    ["Active clients",        1760, "34 clients · +11 this Q"],
    ["Client adherence",      1200, "92% 30d avg"],
    ["Session completion",    1080, "96% 30d avg"],
    ["Client PRs attributed",  800, "42 in last 90d"],
    ["Programs published",     400, "5 live · 1 trending"],
    ["Reviews",                620, "4.97 · 1,284 reviews"],
    ["Radio hosted",           220, "3 rooms last month"],
    ["Community endorsements", 340, "38 coach co-signs"],
  ];
  const [tiers, setTiers] = React.useState(STATIC_TIERS);
  const [breakdown, setBreakdown] = React.useState(STATIC_BREAKDOWN);
  const [headline, setHeadline] = React.useState({ title: "6,420", eyebrow: "COACH SCORE · MASTER" });

  // Your score · Leaderboard (owner, 2026-10-15: "we should have a members and coaches
  // leaderboard"). The board is leaderboards.jsx's; the subtitle reads your rank off it.
  const [view, setView] = React.useState("score");
  const standing = useCoachStanding("trainer");

  React.useEffect(() => {
    let alive = true;
    fetch('/api/coach/score?role=trainer', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d || typeof d.total !== 'number') return;
        if (!d.breakdown || !d.breakdown.length) return;
        setBreakdown(d.breakdown.map(b => [b.label, b.points, b.sub]));
        setHeadline({
          title: d.total.toLocaleString(),
          eyebrow: `COACH SCORE · ${String(cn(d.current_tier)).toUpperCase()}`,
        });
        setTiers(STATIC_TIERS.map(([t,r,desc]) => [t, r, desc, t === cn(d.current_tier)]));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── A FIXED PAGE, NOT A BOARD (owner, 2026-10-15: "least overwhelming as possible, easy
  // to navigate", the builder removed "like Programs"). The ladder on top; the breakdown of
  // your score beside the next rung (Path to Icon) and what this one unlocks; then how
  // points are earned, which the header's "How it works" scrolls to.
  const tiersCard = (
      <Card>
        <SectionTitle right="MASTER · TOP 4%">Tiers</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: 8 }}>
          {tiers.map(([t,r,d,cur],i)=>(
            <div key={t} style={{ padding: "18px 16px", borderLeft: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", background: cur ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.08)" : "transparent" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: cur ? TEAL_BRIGHT : "var(--sh-ink3, #75706a)", marginBottom: 6 }}>{r}</div>
              <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", color: cur ? INK : "var(--sh-ink2, #a09b94)" }}>{t}</div>
              <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
      </Card>
  );

  const breakdownCard = (
      <Card>
        <SectionTitle right={`TOTAL ${breakdown.reduce((a, b) => a + b[1], 0).toLocaleString()}`}>Score breakdown</SectionTitle>
        {(() => { const maxV = Math.max(...breakdown.map(b=>b[1])); return breakdown.map(([l,v,sub],i)=>{
          const w = maxV > 0 ? (v / maxV) * 100 : 0;
          return (
            <div key={i} style={{ padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{l}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TEAL_BRIGHT }}>+{v}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginBottom: 8 }}>{sub}</div>
              <div style={{ height: 3, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.06)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${w}%`, background: TEAL }} />
              </div>
            </div>
          );
        }); })()}
      </Card>
  );

  const unlocksCard = (
      <Card>
        <SectionTitle>What Master unlocks</SectionTitle>
        <div style={{ display: "grid", gap: 12, fontSize: 13, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)" }}>
          <div>• Verified badge on marketplace</div>
          <div>• Top-3 rank in Strength category</div>
          <div>• Higher payout tier</div>
          <div>• Host Shape Radio rooms</div>
          <div>• Early access to new features</div>
        </div>
      </Card>
  );

  const pathCard = (
      <Card style={{ background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.06)", border: "1px solid rgba(var(--sh-accent2-rgb, 10,197,168),0.25)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "var(--sh-accent-ink, #2ee0c4)", marginBottom: 10 }}>PATH TO ICON</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}>8,580 more points. Top levers: add 10 clients (+450), hit 95% adherence (+220), publish 2 programs (+450).</div>
      </Card>
  );

  const earnCard = (
      <Card>
        <SectionTitle right="12 WAYS">How you earn · points by action</SectionTitle>
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 36px" }}>
          {[
            ["Live session completed", "Per booking · client attended", "+18–28"],
            ["Program block delivered", "Per client · new or refreshed block", "+24"],
            ["Workout assigned", "Per plan · new or adjusted session", "+8"],
            ["Form review returned", "Per review · video feedback within 24h", "+8–12"],
            ["Client check-in answered", "Daily · meaningful coaching reply", "+5"],
            ["Fast message reply", "Per reply · within the hour", "+2"],
            ["PR verified", "Per PR · client lift or performance milestone", "+10"],
            ["Client weekly target hit", "Per client · roster adherence credit", "+6"],
            ["Retention streak", "Weekly · active roster held 7 days", "+20"],
            ["5-star review earned", "Per review · verified client rating", "+15"],
            ["Plan sold", "Per sale · marketplace program purchase", "+30"],
            ["New client onboarded", "Per intake · completed intake and first plan", "+40"],
          ].map(([name, sub, pts], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "13px 0", borderTop: i > 1 ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "none", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--sh-ink2, #a09b94)", marginTop: 3, letterSpacing: "0.03em" }}>{sub}</div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: TEAL_BRIGHT, alignSelf: "center" }}>{pts}</div>
            </div>
          ))}
        </div>
      </Card>
  );

  return (
    <DashPage
      navItems={trainerNavItems("score")}
      payoutCard={trainerPayoutCard}
      eyebrow={headline.eyebrow}
      title={headline.title}
      subtitle={coachStandingLine("trainer", standing)}
      actions={<CoachScoreActions view={view} onView={setView} />}
    >
      {view === "board" ? <CoachLeaderboard role="trainer" /> : (
      <div style={{ display: "grid", gap: 16 }}>
        {tiersCard}
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
          {breakdownCard}
          <div style={{ display: "grid", gap: 16 }}>{pathCard}{unlocksCard}</div>
        </div>
        <div id="score-earn" style={{ scrollMarginTop: 80 }}>{earnCard}</div>
      </div>
      )}
    </DashPage>
  );
}
