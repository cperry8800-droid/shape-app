
function NutritionistScorePage() {
  // Coach ladder (scheme J) — coaches climb their own named rungs.
  const COACH_NAME = { Raw:"Certified", Base:"Certified", Tempo:"Pro", Form:"Elite", Peak:"Master", Legend:"Icon", Certified:"Certified", Pro:"Pro", Elite:"Elite", Master:"Master", Icon:"Icon" };
  const cn = (n) => COACH_NAME[n] || n;
  const STATIC_TIERS = [["Certified","0–750","Verified Shape coach",false],["Pro","750–2,000","Consistent nutritionist",false],["Elite","2,000–5,000","Top performer",false],["Master","5,000–15,000","Top tier",true],["Icon","15,000+","Top 1%",false]];
  const STATIC_BREAKDOWN = [
    ["Active clients",        1320, "28 clients · +7 this Q"],
    ["Log adherence",          990, "89% 30d avg"],
    ["Client body-comp wins",  880, "18 clients hit targets"],
    ["Plans published",        390, "5 live · 1 trending"],
    ["Reviews",                550, "4.94 · 612 reviews"],
    ["Radio hosted",           280, "2 rooms last month"],
    ["Coach collaborations",   390, "24 trainer co-signs"],
    ["Referrals in",           540, "14 clients from trainers"],
  ];
  const [tiers, setTiers] = React.useState(STATIC_TIERS);
  const [breakdown, setBreakdown] = React.useState(STATIC_BREAKDOWN);
  const [headline, setHeadline] = React.useState({ title: "5,340", eyebrow: "COACH SCORE · MASTER" });
  const [tierLabel, setTierLabel] = React.useState("MASTER");

  React.useEffect(() => {
    let alive = true;
    fetch('/api/coach/score?role=nutritionist', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d || typeof d.total !== 'number') return;
        if (!d.breakdown || !d.breakdown.length) return;
        setBreakdown(d.breakdown.map(b => [b.label, b.points, b.sub]));
        setHeadline({
          title: d.total.toLocaleString(),
          eyebrow: `COACH SCORE · ${String(cn(d.current_tier)).toUpperCase()}`,
        });
        setTierLabel(String(cn(d.current_tier)).toUpperCase());
        setTiers(STATIC_TIERS.map(([t,r,desc]) => [t, r, desc, t === cn(d.current_tier)]));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Each top-level card becomes a draggable/resizable DashGrid widget (role=nutritionist,
  // tab=score), mirroring the client Score tab. The DashPage hero stays the page header.
  const widgets = [
    { key: "tiers", title: "Tiers", size: "full", render: () => (
      <Card>
        <SectionTitle right={tierLabel}>Tiers</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", marginTop: 8 }}>
          {tiers.map(([t,r,d,cur],i)=>(
            <div key={t} style={{ padding: "18px 16px", borderLeft: i === 0 ? "none" : "1px solid rgba(242,237,228,0.08)", background: cur ? "rgba(10,197,168,0.08)" : "transparent" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: cur ? TEAL_BRIGHT : "rgba(242,237,228,0.45)", marginBottom: 6 }}>{r}</div>
              <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", color: cur ? INK : "rgba(242,237,228,0.6)" }}>{t}</div>
              <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
      </Card>
    ) },

    { key: "breakdown", title: "Score breakdown", size: "half", render: () => (
      <Card>
        <SectionTitle right={`TOTAL ${breakdown.reduce((a, b) => a + b[1], 0).toLocaleString()}`}>Score breakdown</SectionTitle>
        {(() => { const bdMax = Math.max(...breakdown.map(b=>b[1])); return breakdown.map(([l,v,sub],i)=>{
          const w = bdMax > 0 ? (v / bdMax) * 100 : 0;
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
        }); })()}
      </Card>
    ) },

    { key: "unlocks", title: "What Master unlocks", size: "half", render: () => (
      <Card>
        <SectionTitle>What Master unlocks</SectionTitle>
        <div style={{ display: "grid", gap: 12, fontSize: 13, color: "rgba(242,237,228,0.75)" }}>
          <div>• Verified badge on marketplace</div>
          <div>• Top-3 rank in Nutrition category</div>
          <div>• Higher payout tier</div>
          <div>• Host Shape Radio rooms</div>
          <div>• Early access to new features</div>
        </div>
      </Card>
    ) },

    { key: "path", title: "Path to Icon", size: "half", render: () => (
      <Card style={{ background: "rgba(10,197,168,0.06)", border: "1px solid rgba(10,197,168,0.25)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>PATH TO ICON</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(242,237,228,0.85)" }}>9,660 more points. Top levers: add 10 clients (+500), hit 95% log adherence (+330), publish 2 plans (+390).</div>
      </Card>
    ) },

    { key: "earn", title: "How you earn", size: "full", render: () => (
      <Card>
        <SectionTitle right="12 WAYS">How you earn · points by action</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 36px" }}>
          {[
            ["Consult completed", "Per booking · initial or follow-up consult", "+18–28"],
            ["Meal plan delivered", "Per client · new or adjusted nutrition plan", "+24"],
            ["Grocery list sent", "Per plan · built from the plan", "+8"],
            ["Macro review returned", "Per review · food log analysis within 24h", "+8–12"],
            ["Adherence check-in", "Daily · useful client follow-up", "+5"],
            ["Fast message reply", "Per reply · within the hour", "+2"],
            ["Biomarker note logged", "Per update · labs, weight trend, or recovery", "+10"],
            ["Client hit macros", "Per client · weekly adherence credit", "+6"],
            ["Plan adherence streak", "Weekly · client hit targets for the week", "+20"],
            ["5-star review earned", "Per review · verified client rating", "+15"],
            ["Plan sold", "Per sale · marketplace plan purchase", "+30"],
            ["New nutrition client onboarded", "Per intake · completed intake and first plan", "+40"],
          ].map(([name, sub, pts], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "13px 0", borderTop: i > 1 ? "1px solid rgba(242,237,228,0.06)" : "none", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 3, letterSpacing: "0.03em" }}>{sub}</div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: TEAL_BRIGHT, alignSelf: "center" }}>{pts}</div>
            </div>
          ))}
        </div>
      </Card>
    ) },
  ].filter(Boolean);

  return (
    <DashPage
      navItems={nutriNavItems("score")}
      payoutCard={nutriPayoutCard}
      eyebrow={headline.eyebrow}
      title={headline.title}
      subtitle="Your coach score drives marketplace ranking, verified badge, and payout tier."
      actions={<>
        <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>How it works</button>
        <button style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Leaderboard</button>
      </>}
    >
      <DashGrid role="nutritionist" tab="score" widgets={widgets} />
    </DashPage>
  );
}
