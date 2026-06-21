function ClientLibraryPage() {
  const [signedIn, setSignedIn] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    (async () => { try { const u = window.shapeDb && await window.shapeDb.getUser(); if (alive && u) setSignedIn(true); } catch (e) {} })();
    return () => { alive = false; };
  }, []);
  // The collections + recent below are a signed-out PREVIEW only. A signed-in
  // member sees their own shared library — empty here until web library-sync lands.
  const demoCollections = [
    { title: "Exercise form library", sub: "124 videos · Maya", tag: "TRAINING", items: 124 },
    { title: "Post-run fueling shakes", sub: "3 templates · Rae", tag: "NUTRITION", items: 3 },
    { title: "Sleep + recovery protocol", sub: "8 articles · Rae", tag: "RECOVERY", items: 8 },
    { title: "Mobility flows", sub: "12 videos · Maya", tag: "TRAINING", items: 12 },
    { title: "Meal-prep sundays", sub: "6 recipes · Rae", tag: "NUTRITION", items: 6 },
    { title: "Race-day checklists", sub: "2 docs · Diego", tag: "RACING", items: 2 },
  ];
  const demoRecent = [
    { kind: "VIDEO",  title: "Bench press setup — 4 cues",   meta: "Maya · 3:12",      date: "Apr 16", tag: "TRAINING" },
    { kind: "DOC",    title: "Sleep protocol v2",            meta: "Rae · 4 min read", date: "Apr 14", tag: "RECOVERY" },
    { kind: "RECIPE", title: "Salmon + sweet potato bowl",   meta: "Rae",              date: "Apr 12", tag: "NUTRITION" },
    { kind: "VIDEO",  title: "RDL — hip hinge breakdown",    meta: "Maya · 2:40",      date: "Apr 10", tag: "TRAINING" },
    { kind: "DOC",    title: "Deload week — how I program",  meta: "Maya · 6 min read",date: "Apr 8",  tag: "TRAINING" },
  ];
  const collections = signedIn ? [] : demoCollections;
  const recent = signedIn ? [] : demoRecent;
  const tags = ["ALL","TRAINING","NUTRITION","RECOVERY","RACING"];
  const [active, setActive] = React.useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("tag") || params.get("filter") || "").toUpperCase();
    return tags.includes(requested) ? requested : "ALL";
  });
  const visibleCollections = active === "ALL" ? collections : collections.filter(c => c.tag === active);
  const visibleRecent = active === "ALL" ? recent : recent.filter(r => r.tag === active);
  return (
    <DashPage
      navItems={clientNavItems("library")}
      payoutCard={clientPayoutCard}
      eyebrow="FROM YOUR TEAM"
      title="Library"
      subtitle="Videos, protocols, recipes and checklists your coaches have shared. New additions appear at the top."
      actions={<>
        <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Search</button>
        <button style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Saved ({signedIn ? 0 : 14})</button>
      </>}
    >
      <div style={{ marginBottom: 24, display: "flex", gap: 8, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>
        {tags.map((t) => {
          const isActive = active === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActive(t)}
              style={{
                padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                background: isActive ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)",
                color: isActive ? TEAL_BRIGHT : "rgba(242,237,228,0.6)",
                border: "1px solid " + (isActive ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.08)"),
                fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        {visibleCollections.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", padding: 24, color: "rgba(242,237,228,0.45)", fontSize: 13, textAlign: "center" }}>
            No collections in {active.toLowerCase()} yet.
          </div>
        ) : visibleCollections.map((c, i) => (
          <Card key={i} style={{ padding: 22, cursor: "pointer" }}>
            <div style={{ height: 120, borderRadius: 6, background: `linear-gradient(135deg, rgba(10,197,168,0.15), rgba(242,237,228,0.06))`, marginBottom: 14, display: "flex", alignItems: "flex-end", padding: 12 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: TEAL_BRIGHT }}>{c.tag}</div>
            </div>
            <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", marginBottom: 4 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{c.sub}</div>
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle right="LAST 30 DAYS">Recently added</SectionTitle>
        {visibleRecent.length === 0 ? (
          <div style={{ padding: "20px 4px", color: "rgba(242,237,228,0.45)", fontSize: 13 }}>
            Nothing recent in {active.toLowerCase()}.
          </div>
        ) : visibleRecent.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 140px 80px", gap: 14, alignItems: "center", padding: "14px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
            <Pill>{r.kind}</Pill>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{r.meta}</div>
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.45)", textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{r.date}</div>
          </div>
        ))}
      </Card>
    </DashPage>
  );
}
