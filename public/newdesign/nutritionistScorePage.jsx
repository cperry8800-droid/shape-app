
function NutritionistScorePage() {
  // Coach ladder (scheme J) — coaches climb their own named rungs.
  const COACH_NAME = { Raw:"Certified", Base:"Certified", Tempo:"Pro", Form:"Elite", Peak:"Master", Legend:"Icon", Certified:"Certified", Pro:"Pro", Elite:"Elite", Master:"Master", Icon:"Icon" };
  const cn = (n) => COACH_NAME[n] || n;
  // [name, range, description]: the ranges are /api/coach/score's TIERS.
  const LADDER = [["Certified","0–750","Verified Shape coach"],["Pro","750–2,000","Consistent nutritionist"],["Elite","2,000–5,000","Top performer"],["Master","5,000–15,000","Top tier"],["Icon","15,000+","Top 1%"]];
  // ⚠ HOW A COACH EARNS POINTS IS /api/coach/score's FORMULA, AND NOTHING ELSE: 50 for each active
  // client and 10 for each point of the session completion rate over the last 90 days (up to 1,000);
  // the programs term is a trainer's only (src/app/api/coach/score/route.ts, kept in sync with
  // get_coach_scores). This page listed twelve "points by action" (a consult +18–28, a plan sold
  // +30, a 5-star review +15 …) and a sample breakdown with reviews, Radio, referrals and body-comp
  // wins: scoring that never existed. The app's coach Score page prints the same terms
  // (BS_COACH_SCORE_FORMULA in iosAppBroadsheetClient.jsx).
  const COACH_FORMULA = [
    ["Active clients", "Per client · each client subscribed to you now", "+50"],
    ["Session completion", "Per 1% completed · your sessions in the last 90 days, up to 1,000", "+10"],
  ];
  // The signed-out sample, on the same formula: 28 × 50 + 94 × 10 = 2,340, an Elite.
  const SAMPLE = {
    total: 2340, current_tier: "Elite", next_tier: "Master", points_to_next: 2660,
    breakdown: [
      { label: "Active clients", points: 1400, sub: "28 clients" },
      { label: "Session completion", points: 940, sub: "94% · last 90d" },
    ],
  };
  // How the read ended: "pending"; "ok" (the coach's own score); "sample" (signed out: a 401, so the
  // labelled sample above); or "failed" (a 503 when the sign-in couldn't be checked, a 5xx, a 404 for
  // an account with no nutritionist listing, a thrown fetch, an answer that isn't a score).
  // ⚠ A FAILED READ IS NOT THE SAMPLE. The page started from static figures (5,340, Master, 28
  // clients) and kept them when the read failed, so a signed-in coach whose read failed was shown
  // the sample as their own score. Only a 401 shows the sample, and it says it is one.
  const [read, setRead] = React.useState({ state: "pending", score: null });

  // Your score · Leaderboard (owner, 2026-10-15: "we should have a members and coaches
  // leaderboard"). The board is leaderboards.jsx's; the subtitle reads your rank off it.
  const [view, setView] = React.useState("score");
  const standing = useCoachStanding("nutritionist");

  React.useEffect(() => {
    let alive = true;
    const signedOut = { signedOut: true };
    fetch('/api/coach/score?role=nutritionist', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.status === 401 ? signedOut : r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        if (d === signedOut) setRead({ state: "sample", score: SAMPLE });
        else if (d && typeof d.total === 'number' && Number.isFinite(d.total) && typeof d.current_tier === 'string' && Array.isArray(d.breakdown)) setRead({ state: "ok", score: d });
        else setRead({ state: "failed", score: null });
      })
      .catch(() => { if (alive) setRead({ state: "failed", score: null }); });
    return () => { alive = false; };
  }, []);

  const score = read.score;
  const tierName = score ? String(cn(score.current_tier)) : null;
  const tierLabel = tierName ? tierName.toUpperCase() : "—";
  const tiers = LADDER.map(([t, r, desc]) => [t, r, desc, t === tierName]);
  const breakdown = score ? score.breakdown.map(b => [b.label, Number(b.points) || 0, b.sub]) : [];
  const headline = score
    ? { title: score.total.toLocaleString(), eyebrow: `COACH SCORE · ${tierLabel}${read.state === "sample" ? " · SAMPLE" : ""}` }
    : { title: "—", eyebrow: read.state === "failed" ? "COACH SCORE · COULDN'T READ" : "COACH SCORE" };
  const unreadNote = read.state === "failed"
    ? "Couldn't read your score just now. Nothing is shown in its place: reload the page to try again."
    : "Reading your score…";

  // ── A FIXED PAGE, NOT A BOARD (owner, 2026-10-15: "least overwhelming as possible, easy
  // to navigate", the builder removed "like Programs"). The ladder on top; the breakdown of
  // your score beside the next rung (Path to Icon) and what this one unlocks; then how
  // points are earned, which the header's "How it works" scrolls to.
  const tiersCard = (
      <Card>
        <SectionTitle right={tierLabel}>Tiers</SectionTitle>
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
        <SectionTitle right={score ? `${read.state === "sample" ? "SAMPLE · " : ""}TOTAL ${breakdown.reduce((a, b) => a + b[1], 0).toLocaleString()}` : null}>Score breakdown</SectionTitle>
        {!score && <div role="status" style={{ padding: "14px 0", fontSize: 13.5, lineHeight: 1.5, color: "var(--sh-ink2, #a09b94)" }}>{unreadNote}</div>}
        {(() => { const bdMax = Math.max(...breakdown.map(b=>b[1])); return breakdown.map(([l,v,sub],i)=>{
          const w = bdMax > 0 ? (v / bdMax) * 100 : 0;
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
          <div>• Top-3 rank in Nutrition category</div>
          <div>• Higher payout tier</div>
          <div>• Host Shape Radio rooms</div>
          <div>• Early access to new features</div>
        </div>
      </Card>
  );

  // The next rung, from the read (it printed "9,660 more points" to Icon whatever the coach's score).
  const pathCard = score && (
      <Card style={{ background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.06)", border: "1px solid rgba(var(--sh-accent2-rgb, 10,197,168),0.25)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "var(--sh-accent-ink, #2ee0c4)", marginBottom: 10 }}>{score.next_tier ? `PATH TO ${String(cn(score.next_tier)).toUpperCase()}` : "THE TOP OF THE LADDER"}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}>{score.next_tier
          ? `${Math.max(0, Number(score.points_to_next) || 0).toLocaleString()} more points. Each new client adds 50, and each point of session completion 10.`
          : "Icon is the highest rung on the coach ladder."}</div>
      </Card>
  );

  const earnCard = (
      <Card>
        <SectionTitle right={`${COACH_FORMULA.length} TERMS`}>How you earn · points by term</SectionTitle>
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 36px" }}>
          {COACH_FORMULA.map(([name, sub, pts], i) => (
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
      navItems={nutriNavItems("score")}
      payoutCard={nutriPayoutCard}
      eyebrow={headline.eyebrow}
      title={headline.title}
      subtitle={coachStandingLine("nutritionist", standing)}
      actions={<CoachScoreActions view={view} onView={setView} />}
    >
      {view === "board" ? <CoachLeaderboard role="nutritionist" /> : (
      <div style={{ display: "grid", gap: 16 }}>
        {tiersCard}
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
          {breakdownCard}
          <div style={{ display: "grid", gap: 16 }}>{pathCard}{unlocksCard}</div>
        </div>
        <div id="score-earn" style={{ scrollMarginTop: 80 }}>{earnCard}</div>
      </div>
      )}
      {read.state === "sample" && typeof DashDemoBand === "function" && <DashDemoBand />}
    </DashPage>
  );
}
