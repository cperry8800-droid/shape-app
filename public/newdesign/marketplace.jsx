// Marketplace page — editorial coach directory. Spatial Cinema language.
const { useState: useS, useMemo: useM, useEffect: useE } = React;

const MK_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function MkReveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(MK_RPR);
  React.useEffect(() => {
    if (MK_RPR || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.1 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(30px)", transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`, ...style }}>{children}</div>;
}

function useActiveLeadBoost(role) {
  const [active, setActive] = useS(null);

  useE(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/lead-boosts?role=${encodeURIComponent(role)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        setActive(res.ok ? (json?.active || null) : null);
      } catch (_) {
        if (!cancelled) setActive(null);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [role]);

  return active;
}

const COACHES_FULL = [
  // Trainers
  { name: "Maya Okafor", role: "Strength & Hypertrophy", city: "Brooklyn, NY", rate: 120, rating: 4.97, sessions: 1284, tag: "Trainer", specialties: ["Strength", "Hypertrophy"], cert: "NASM-CPT", years: 9, format: "In-person", category: "Strength & Resistance" },
  { name: "Leo Martins", role: "Powerlifting", city: "Lisbon", rate: 105, rating: 4.86, sessions: 1120, tag: "Trainer", specialties: ["Powerlifting", "Strength"], cert: "NSCA-CSCS", years: 8, format: "In-person", category: "Strength & Resistance" },
  { name: "Anya Volkov", role: "Barbell Foundations", city: "Berlin", rate: 98, rating: 4.91, sessions: 680, tag: "Trainer", specialties: ["Strength", "Technique"], cert: "NSCA-CSCS", years: 6, format: "Hybrid", category: "Strength & Resistance" },

  { name: "Diego Alvarez", role: "Endurance · Marathon", city: "Austin, TX", rate: 95, rating: 4.92, sessions: 912, tag: "Trainer", specialties: ["Running", "VO2"], cert: "ACE-CPT", years: 7, format: "Hybrid", category: "Cardio & Endurance" },
  { name: "Kenji Watanabe", role: "Triathlon Coaching", city: "San Francisco", rate: 150, rating: 4.91, sessions: 590, tag: "Trainer", specialties: ["Triathlon", "Swimming"], cert: "USAT-L2", years: 14, format: "Hybrid", category: "Cardio & Endurance" },
  { name: "Hana Reyes", role: "Cycling & VO2", city: "Girona", rate: 110, rating: 4.88, sessions: 720, tag: "Trainer", specialties: ["Cycling", "Endurance"], cert: "USA-C-L2", years: 9, format: "Remote", category: "Cardio & Endurance" },

  { name: "Jordan Park", role: "Mobility · PT Recovery", city: "Los Angeles", rate: 110, rating: 4.89, sessions: 1510, tag: "Trainer", specialties: ["Mobility", "Post-op"], cert: "NSCA-CSCS", years: 8, format: "In-person", category: "Mobility, Recovery & Rehab" },
  { name: "Priya Natarajan", role: "Yoga & Mobility", city: "Brooklyn, NY", rate: 90, rating: 4.93, sessions: 1680, tag: "Trainer", specialties: ["Yoga", "Breath"], cert: "RYT-500", years: 9, format: "In-person", category: "Mobility, Recovery & Rehab" },
  { name: "Sam Oduya", role: "Rehab & Return-to-Sport", city: "Atlanta", rate: 125, rating: 4.94, sessions: 540, tag: "Trainer", specialties: ["Rehab", "PT"], cert: "DPT · CSCS", years: 11, format: "In-person", category: "Mobility, Recovery & Rehab" },

  { name: "Tomás Reyes", role: "CrossFit · Olympic Lifts", city: "Miami", rate: 130, rating: 4.88, sessions: 2010, tag: "Trainer", specialties: ["CrossFit", "Olympic"], cert: "CF-L3", years: 12, format: "In-person", category: "Functional & Hybrid" },
  { name: "Isla Park", role: "Hybrid Athlete", city: "Austin, TX", rate: 115, rating: 4.90, sessions: 640, tag: "Trainer", specialties: ["Hybrid", "Hyrox"], cert: "NSCA-CSCS", years: 7, format: "Hybrid", category: "Functional & Hybrid" },

  { name: "Marcus Hale", role: "Classic Bodybuilding", city: "Las Vegas", rate: 140, rating: 4.87, sessions: 980, tag: "Trainer", specialties: ["Hypertrophy", "Prep"], cert: "NASM · PN-1", years: 13, format: "In-person", category: "Bodybuilding" },
  { name: "Yuki Tanaka", role: "Physique & Posing", city: "Tokyo", rate: 125, rating: 4.92, sessions: 460, tag: "Trainer", specialties: ["Physique", "Cutting"], cert: "IFBB-PT", years: 10, format: "Remote", category: "Bodybuilding" },

  { name: "Malik Freeman", role: "HIIT Athletic Performance", city: "Chicago", rate: 135, rating: 4.90, sessions: 770, tag: "Trainer", specialties: ["HIIT", "Plyo"], cert: "NSCA-CSCS", years: 11, format: "In-person", category: "HIIT" },
  { name: "Zoë Carter", role: "Metabolic Conditioning", city: "Denver", rate: 95, rating: 4.89, sessions: 820, tag: "Trainer", specialties: ["HIIT", "MetCon"], cert: "NASM-CPT", years: 6, format: "Hybrid", category: "HIIT" },

  { name: "Priscilla Adams", role: "Fat-loss & Nutrition-tied", city: "Miami", rate: 100, rating: 4.85, sessions: 1240, tag: "Trainer", specialties: ["Fat loss", "Conditioning"], cert: "NASM · PN-1", years: 8, format: "Remote", category: "Fat Burn" },
  { name: "Omar Haddad", role: "Lean & Cut Programs", city: "Dubai", rate: 120, rating: 4.91, sessions: 560, tag: "Trainer", specialties: ["Fat loss", "Cutting"], cert: "NASM-CPT", years: 9, format: "Hybrid", category: "Fat Burn" },

  { name: "Amara Johnson", role: "At-home Full Body", city: "Denver", rate: 85, rating: 4.94, sessions: 840, tag: "Trainer", specialties: ["At-home", "Prenatal"], cert: "NASM · PPES", years: 10, format: "Remote", category: "At Home" },
  { name: "Rhea Kapoor", role: "Minimal-Equipment Strength", city: "Mumbai", rate: 70, rating: 4.88, sessions: 910, tag: "Trainer", specialties: ["At-home", "Bands"], cert: "NASM-CPT", years: 5, format: "Remote", category: "At Home" },

  { name: "Nora Kessler", role: "Women's Strength & Cycle-Synced", city: "Berlin", rate: 115, rating: 4.94, sessions: 720, tag: "Trainer", specialties: ["Women-only", "Hormonal"], cert: "NSCA-CSCS · PN-2", years: 10, format: "Hybrid", category: "Just for Women" },
  { name: "Amelia Finch", role: "Postpartum & Core Rebuild", city: "Portland, OR", rate: 105, rating: 4.96, sessions: 540, tag: "Trainer", specialties: ["Postpartum", "Pelvic floor"], cert: "NASM · PCES", years: 8, format: "In-person", category: "Just for Women" },
  { name: "Sana Khoury", role: "Women-only Strength Studio", city: "Toronto", rate: 95, rating: 4.90, sessions: 880, tag: "Trainer", specialties: ["Strength", "Beginner-friendly"], cert: "NASM-CPT", years: 6, format: "In-person", category: "Just for Women" },

  { name: "Cal Redmond", role: "5K to Marathon Coaching", city: "Boulder, CO", rate: 90, rating: 4.96, sessions: 1040, tag: "Trainer", specialties: ["Marathon", "Tempo"], cert: "RRCA · UESCA", years: 11, format: "Remote", category: "Pure Running" },
  { name: "Fiona Walsh", role: "Trail & Ultra Running", city: "Chamonix", rate: 120, rating: 4.93, sessions: 410, tag: "Trainer", specialties: ["Trail", "Ultra"], cert: "UESCA-UEC", years: 9, format: "Hybrid", category: "Pure Running" },
  { name: "Jamal Brooks", role: "Track & Speed Work", city: "Eugene, OR", rate: 105, rating: 4.91, sessions: 620, tag: "Trainer", specialties: ["Track", "Speed"], cert: "USATF-L2", years: 12, format: "In-person", category: "Pure Running" },

  { name: "Dax Whitaker", role: "Hyrox Elite & Mixed Ergs", city: "London", rate: 125, rating: 4.94, sessions: 680, tag: "Trainer", specialties: ["Hyrox", "SkiErg"], cert: "NSCA-CSCS · Hyrox-CT", years: 9, format: "Hybrid", category: "Hyrox" },
  { name: "Greta Lindqvist", role: "Hyrox Pro Doubles", city: "Stockholm", rate: 115, rating: 4.92, sessions: 520, tag: "Trainer", specialties: ["Hyrox", "Doubles"], cert: "Hyrox-CT · NASM", years: 7, format: "In-person", category: "Hyrox" },
  { name: "Rafa Moreno", role: "Hyrox Strength & Run Carry-over", city: "Madrid", rate: 105, rating: 4.89, sessions: 440, tag: "Trainer", specialties: ["Hyrox", "Conditioning"], cert: "Hyrox-CT", years: 6, format: "In-person", category: "Hyrox" },

  // Nutritionists
  { name: "Rae Lindqvist", role: "Sports Performance & Hydration", city: "Stockholm", rate: 140, rating: 5.00, sessions: 640, tag: "Nutritionist", specialties: ["Hydration", "Metabolic"], cert: "RD · RDN", years: 11, format: "Remote", category: "Sports Performance & Hydration" },
  { name: "Claire Donovan", role: "Performance Nutrition", city: "London", rate: 130, rating: 4.93, sessions: 520, tag: "Nutritionist", specialties: ["Athlete fueling"], cert: "AfN-RNutr", years: 9, format: "Remote", category: "Performance Nutrition" },
  { name: "Sofia Marchetti", role: "Clinical Nutrition", city: "London", rate: 160, rating: 4.98, sessions: 420, tag: "Nutritionist", specialties: ["Auto-immune", "Gut"], cert: "AfN-RNutr", years: 13, format: "Remote", category: "Medical & Condition-Specific" },
  { name: "David Mehta", role: "Medical Nutrition Therapy", city: "Toronto", rate: 150, rating: 4.95, sessions: 380, tag: "Nutritionist", specialties: ["Diabetes", "Cardiac"], cert: "RD", years: 14, format: "Remote", category: "Medical & Condition-Specific" },
  { name: "Ben Caldwell", role: "Muscle Gain & Bulking", city: "Sydney", rate: 110, rating: 4.87, sessions: 690, tag: "Nutritionist", specialties: ["Bulking", "Recomp"], cert: "APD", years: 7, format: "Remote", category: "Muscle Gain / Bulking" },
  { name: "Nadia Chen", role: "Gut Health & Functional", city: "Toronto", rate: 125, rating: 4.95, sessions: 730, tag: "Nutritionist", specialties: ["GI health", "Functional"], cert: "RDN", years: 6, format: "Remote", category: "Gut Health & Functional Nutrition" },
  { name: "Ingrid Olsen", role: "Longevity & Healthspan", city: "Copenhagen", rate: 145, rating: 4.96, sessions: 310, tag: "Nutritionist", specialties: ["Longevity", "Metabolic"], cert: "RD", years: 12, format: "Remote", category: "Longevity & Healthspan" },
  { name: "Ayo Adeyemi", role: "Weight Management", city: "Lagos", rate: 95, rating: 4.89, sessions: 820, tag: "Nutritionist", specialties: ["Weight", "Habits"], cert: "RD", years: 8, format: "Remote", category: "Weight Mgmt" },
  { name: "Liana Torres", role: "Plant-based Nutrition", city: "Madrid", rate: 105, rating: 4.92, sessions: 490, tag: "Nutritionist", specialties: ["Plant-based", "Athlete"], cert: "RD", years: 7, format: "Remote", category: "Plant-Based" },
  { name: "Hana Matsuda", role: "Prenatal Nutrition", city: "Osaka", rate: 120, rating: 4.94, sessions: 340, tag: "Nutritionist", specialties: ["Prenatal", "Postnatal"], cert: "RD · CLC", years: 9, format: "Remote", category: "Prenatal" },
  { name: "Marco Bellini", role: "Meal Prep & Habits", city: "Milan", rate: 90, rating: 4.88, sessions: 760, tag: "Nutritionist", specialties: ["Meal prep", "Habits"], cert: "RD", years: 6, format: "Remote", category: "Meal Prep" },
];

const CATEGORIES = {
  Trainer: ["All Categories", "Strength & Resistance", "Cardio & Endurance", "Pure Running", "Hyrox", "Mobility, Recovery & Rehab", "Functional & Hybrid", "Bodybuilding", "HIIT", "Fat Burn", "At Home", "Just for Women"],
  Nutritionist: ["All Categories", "Sports Performance & Hydration", "Performance Nutrition", "Medical & Condition-Specific", "Muscle Gain / Bulking", "Gut Health & Functional Nutrition", "Longevity & Healthspan", "Weight Mgmt", "Plant-Based", "Prenatal", "Meal Prep"],
};

const SORT_OPTS = ["Most Popular", "Highest Rated", "Lowest Price", "Most Experience"];

const LOCATIONS = {
  Trainer: ["Anywhere", "Remote-friendly", "Brooklyn, NY", "Los Angeles", "Austin, TX", "Miami", "Chicago", "Denver", "San Francisco", "Las Vegas", "Atlanta", "Portland, OR", "Boulder, CO", "Eugene, OR", "Toronto", "London", "Berlin", "Lisbon", "Madrid", "Stockholm", "Tokyo", "Mumbai", "Dubai", "Girona", "Chamonix"],
  Nutritionist: ["Anywhere", "Remote only", "London", "Toronto", "Stockholm", "Copenhagen", "Madrid", "Milan", "Sydney", "Osaka", "Lagos"],
};

const SPOTLIGHT = {
  Trainer: {
    kicker: "Spotlight · this week",
    lead: { name: "Maya Okafor", role: "Strength & Hypertrophy", city: "Brooklyn, NY", rating: 4.97, sessions: 1284, years: 9, rate: 120, tag: "Top 1% strength", note: "Rebuilt her programming around tempo work — clients hitting PRs 30% faster on average. Books the last Friday of the month free for 2nd-opinion intros." },
    side: [
      { name: "Tomás Reyes", role: "CrossFit · Olympic", city: "Miami", rating: 4.88, rate: 130, note: "Olympic lifts with clean fundamentals." },
      { name: "Priya Natarajan", role: "Yoga & Mobility", city: "Brooklyn", rating: 4.93, rate: 90, note: "Rehab-adjacent mobility. Waitlist open." },
      { name: "Diego Alvarez", role: "Endurance · Marathon", city: "Austin", rating: 4.92, rate: 95, note: "Took 4 clients to sub-3 last season." },
    ],
  },
  Nutritionist: {
    kicker: "Spotlight · this week",
    lead: { name: "Rae Lindqvist", role: "Sports Performance & Hydration", city: "Stockholm", rating: 5.00, sessions: 640, years: 11, rate: 140, tag: "5-star, 640+ sessions", note: "Built fueling plans for 3 Olympic endurance athletes. Specializes in plans that survive real life — travel, kids, shift work." },
    side: [
      { name: "Sofia Marchetti", role: "Clinical Nutrition", city: "London", rating: 4.98, rate: 160, note: "Auto-immune & gut specialist." },
      { name: "Nadia Chen", role: "Gut Health & Functional", city: "Toronto", rating: 4.95, rate: 125, note: "Plant-forward GI protocols." },
      { name: "Ben Caldwell", role: "Muscle Gain & Bulking", city: "Sydney", rating: 4.87, rate: 110, note: "Lean recomp for natural lifters." },
    ],
  },
};

function Spotlight({ tab }) {
  const s = SPOTLIGHT[tab];
  const activeBoost = useActiveLeadBoost(tab === "Trainer" ? "trainer" : "nutritionist");
  return (
    <section style={{ padding: "80px 72px 24px" }}>
      <MkReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 30, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL }}>{s.kicker}</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(34px, 4.4vw, 52px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "12px 0 0", lineHeight: 1 }}>
                Four to know in <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>{tab === "Trainer" ? "training" : "nutrition"}</em>.
              </h2>
            </div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", textAlign: "right", maxWidth: 320 }}>
              Editorial + active Lead Boost placements. Boosted profiles are tagged in-grid.
              {activeBoost ? ` ${activeBoost.days}-day boost active.` : ""}
            </div>
          </div>

          <div className="mk-spot" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
            {/* Lead feature */}
            <article style={{ background: INK, color: PAPER, borderRadius: 6, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", position: "relative" }}>
              <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.75, zIndex: 2 }} />
              <Ph label={`${s.lead.name.split(" ")[0]} · feature`} ratio="auto" tone="dark" style={{ borderRadius: 0, height: "100%", minHeight: 380 }} />
              <div style={{ padding: "34px 34px", display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontFamily: mono, fontSize: 10, padding: "3px 8px", background: TEAL, color: PAPER, borderRadius: 3, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, alignSelf: "start" }}>{s.lead.tag}</span>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(26,22,18,0.5)" }}>{s.lead.city} · {s.lead.years} yrs</div>
                <h3 style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.03em", fontWeight: 300, margin: 0, color: PAPER, lineHeight: 1 }}>{s.lead.name}</h3>
                <div style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(26,22,18,0.65)" }}>{s.lead.role}</div>
                <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: "rgba(26,22,18,0.7)", margin: "6px 0 0" }}>{s.lead.note}</p>
                <div style={{ display: "flex", gap: 16, marginTop: "auto", paddingTop: 18, borderTop: "1px solid rgba(26,22,18,0.1)", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.025em", color: PAPER, lineHeight: 1 }}>${s.lead.rate}<span style={{ fontSize: 11, color: "rgba(26,22,18,0.55)", fontFamily: sans, marginLeft: 4 }}>/session</span></div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(26,22,18,0.55)", marginTop: 4 }}>★ {s.lead.rating.toFixed(2)} · {s.lead.sessions.toLocaleString()} sessions</div>
                  </div>
                  <button style={{ marginLeft: "auto", padding: "11px 18px", borderRadius: 2, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>View profile →</button>
                </div>
              </div>
            </article>

            {/* 3 side picks */}
            <div style={{ display: "grid", gridTemplateRows: "repeat(3, 1fr)", gap: 10 }}>
              {s.side.map((p, i) => (
                <article key={i} style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 4, padding: 16, display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 14, alignItems: "center" }}>
                  <Ph label={p.name.split(" ")[0]} ratio="1/1" tone="light" style={{ borderRadius: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL }}>{p.city}</div>
                    <div style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.015em", color: INK, margin: "3px 0 2px", lineHeight: 1.1 }}>{p.name}</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.65)" }}>{p.role}</div>
                    <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 4, fontStyle: "italic" }}>"{p.note}"</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: serif, fontSize: 20, color: INK, letterSpacing: "-0.01em", lineHeight: 1 }}>${p.rate}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: TEAL, marginTop: 4 }}>★ {p.rating.toFixed(2)}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </MkReveal>
    </section>);
}

function MarketplaceHero({ tab, setTab }) {
  return (
    <section style={{ padding: "150px 72px 60px", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-18%", right: "-6%", borderRadius: "50%", filter: "blur(82px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 24 }}>The marketplace</div>
        <div className="mk-head" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 80, alignItems: "end" }}>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(52px, 7.6vw, 112px)", lineHeight: 0.86, letterSpacing: "-0.045em", fontWeight: 300, margin: 0, color: INK }}>
            Find the <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>{tab === "Trainer" ? "trainer" : "nutritionist"}</em><br />who fits.
          </h1>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.62)", margin: 0, maxWidth: 420 }}>
            Certified {tab === "Trainer" ? "trainers" : "nutritionists"} filtered by specialty, goal, location, and fit — not by who paid for placement.
          </p>
        </div>

        {/* Big tab switch */}
        <div style={{ marginTop: 56, display: "flex", gap: 0, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {["Trainer", "Nutritionist"].map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "28px 0", background: "transparent", border: 0, cursor: "pointer",
                  fontFamily: serif, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", fontWeight: 300, textAlign: "left",
                  color: active ? INK : "rgba(242,237,228,0.32)",
                  position: "relative",
                }}>
                <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: active ? TEAL : "rgba(242,237,228,0.3)", display: "block", marginBottom: 8 }}>
                  {t === "Trainer" ? "01" : "02"} · {t === "Trainer" ? "Training" : "Nutrition"}
                </span>
                {t === "Trainer" ? "Trainers" : "Nutritionists"}
                {active && <span style={{ position: "absolute", left: 0, bottom: -1, height: 2, width: 64, background: TEAL }} />}
              </button>
            );
          })}
        </div>
      </div>
    </section>);
}

function Filters({ tab, cat, setCat, sort, setSort, format, setFormat, loc, setLoc, query, setQuery }) {
  const pill = (on) => ({ padding: "8px 14px", borderRadius: 2, border: on ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.18)", background: on ? INK : "transparent", color: on ? PAPER : INK, fontFamily: sans, fontSize: 12.5, cursor: "pointer", fontWeight: on ? 600 : 400, whiteSpace: "nowrap" });
  const small = (on) => ({ padding: "7px 11px", borderRadius: 2, border: on ? `1px solid ${TEAL}` : "1px solid rgba(242,237,228,0.18)", background: on ? "rgba(19,194,168,0.12)" : "transparent", color: on ? TEAL : "rgba(242,237,228,0.75)", fontFamily: sans, fontSize: 11.5, cursor: "pointer", fontWeight: on ? 600 : 400, whiteSpace: "nowrap", letterSpacing: "0.02em" });
  const cats = CATEGORIES[tab];
  const formats = ["All formats", "In-person", "Remote", "Hybrid"];
  const locations = LOCATIONS[tab];
  return (
    <section style={{ padding: "24px 72px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(11,14,12,0.55)", position: "sticky", top: 76, zIndex: 40, backdropFilter: "blur(14px)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {cats.map((c) => <button key={c} style={pill(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {tab === "Trainer" && (
              <>
                <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginRight: 2, marginTop: 10 }}>Format</span>
                {formats.map((f) => <button key={f} style={small(format === f)} onClick={() => setFormat(f)}>{f}</button>)}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <select value={loc} onChange={(e) => setLoc(e.target.value)} style={{ padding: "9px 14px", borderRadius: 2, border: "1px solid rgba(242,237,228,0.18)", background: INK_DEEP, fontFamily: sans, fontSize: 12.5, color: INK, cursor: "pointer", minWidth: 140 }}>
              {locations.map((l) => <option key={l} style={{ background: INK_DEEP }}>{l}</option>)}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or specialty…" style={{ padding: "9px 14px", borderRadius: 2, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", fontFamily: sans, fontSize: 12.5, color: INK, minWidth: 220, outline: "none" }} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "9px 14px", borderRadius: 2, border: "1px solid rgba(242,237,228,0.18)", background: INK_DEEP, fontFamily: sans, fontSize: 12.5, color: INK, cursor: "pointer" }}>
              {SORT_OPTS.map((s) => <option key={s} style={{ background: INK_DEEP }}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>
    </section>);
}

function CoachCard({ c }) {
  const ref = React.useRef(null);
  const onMove = (e) => {
    if (MK_RPR || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    ref.current.style.transform = `perspective(1100px) rotateY(${px * 4}deg) rotateX(${-py * 4}deg) translateZ(3px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <article ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", transition: "transform .12s ease-out, border-color .15s", willChange: "transform" }}>
      <div style={{ position: "relative" }}>
        <Ph label={`${c.name.split(' ')[0]}`} ratio="4/3" tone="light" style={{ borderRadius: 0 }} />
        <span style={{ position: "absolute", top: 10, left: 10, fontFamily: mono, fontSize: 9, padding: "3px 7px", background: "rgba(11,14,12,0.85)", color: TEAL, borderRadius: 3, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>{c.format}</span>
        <span style={{ position: "absolute", top: 10, right: 10, fontFamily: mono, fontSize: 10, padding: "3px 7px", background: "rgba(11,14,12,0.85)", color: INK, borderRadius: 3 }}>★ {c.rating.toFixed(2)}</span>
        {c.isLeadBoosted && (
          <span style={{ position: "absolute", left: 10, bottom: 10, fontFamily: mono, fontSize: 9, padding: "4px 8px", background: "rgba(19,194,168,0.95)", color: PAPER, borderRadius: 3, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
            Lead Boost · {c.boostDays}d
          </span>
        )}
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL }}>{c.city}</div>
        <h3 style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", fontWeight: 400, margin: 0, color: INK, lineHeight: 1.1 }}>{c.name}</h3>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.65)", margin: 0 }}>{c.role}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          {c.specialties.slice(0, 2).map((s) =>
            <span key={s} style={{ fontFamily: sans, fontSize: 10.5, padding: "3px 8px", borderRadius: 999, background: "rgba(19,194,168,0.1)", color: TEAL }}>{s}</span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", color: INK, lineHeight: 1 }}>
              ${c.rate}<span style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", fontFamily: sans, marginLeft: 4 }}>/session</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{c.sessions.toLocaleString()} sessions</div>
          </div>
          <a href={c.tag === "Trainer" ? "TrainerPublic.html" : "NutritionistPublic.html"} style={{ padding: "9px 14px", borderRadius: 2, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", textAlign: "center" }}>View →</a>
        </div>
      </div>
    </article>);
}

function Grid({ tab }) {
  const [cat, setCat] = useS("All Categories");
  const [format, setFormat] = useS("All formats");
  const [loc, setLoc] = useS("Anywhere");
  const [query, setQuery] = useS("");
  const [sort, setSort] = useS("Most Popular");
  const activeBoost = useActiveLeadBoost(tab === "Trainer" ? "trainer" : "nutritionist");

  // Reset category when tab switches
  React.useEffect(() => { setCat("All Categories"); setFormat("All formats"); setLoc("Anywhere"); setQuery(""); }, [tab]);

  const list = useM(() => {
    let arr = COACHES_FULL.filter((c) => {
      if (c.tag !== tab) return false;
      if (cat !== "All Categories" && c.category !== cat) return false;
      if (tab === "Trainer" && format !== "All formats" && c.format !== format) return false;
      if (loc !== "Anywhere") {
        if (loc === "Remote-friendly" || loc === "Remote only") {
          if (c.format !== "Remote" && c.format !== "Hybrid") return false;
        } else if (c.city !== loc) return false;
      }
      if (query && !`${c.name} ${c.role} ${c.specialties.join(" ")} ${c.city}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    if (sort === "Highest Rated") arr = [...arr].sort((a, b) => b.rating - a.rating);
    else if (sort === "Lowest Price") arr = [...arr].sort((a, b) => a.rate - b.rate);
    else if (sort === "Most Experience") arr = [...arr].sort((a, b) => b.years - a.years);
    else arr = [...arr].sort((a, b) => b.sessions - a.sessions);
    if (activeBoost) {
      const featuredPool = tab === "Trainer"
        ? ["Maya Okafor", "Diego Alvarez", "Priya Natarajan"]
        : ["Rae Lindqvist", "Claire Donovan", "Sofia Marchetti"];
      const featuredCount = activeBoost.days >= 30 ? 3 : activeBoost.days >= 14 ? 2 : 1;
      const featuredNames = new Set(featuredPool.slice(0, featuredCount));
      arr = arr.map((row) => (
        featuredNames.has(row.name)
          ? { ...row, isLeadBoosted: true, boostDays: activeBoost.days }
          : row
      ));
      arr.sort((a, b) => {
        const aBoost = a.isLeadBoosted ? 1 : 0;
        const bBoost = b.isLeadBoosted ? 1 : 0;
        if (aBoost !== bBoost) return bBoost - aBoost;
        return 0;
      });
    }
    return arr;
  }, [tab, cat, format, loc, query, sort, activeBoost]);

  return (
    <>
      <Filters {...{ tab, cat, setCat, sort, setSort, format, setFormat, loc, setLoc, query, setQuery }} />
      <section style={{ padding: "48px 72px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.65)" }}>
              {list.length} {list.length === 1 ? (tab === "Trainer" ? "trainer" : "nutritionist") : (tab === "Trainer" ? "trainers" : "nutritionists")}
              {cat !== "All Categories" ? ` · ${cat}` : ""}
              {tab === "Trainer" && format !== "All formats" ? ` · ${format}` : ""}
              {loc !== "Anywhere" ? ` · ${loc}` : ""}
              {" · sorted by "}<b style={{ color: INK, fontWeight: 600 }}>{sort.toLowerCase()}</b>
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Updated hourly
            </div>
          </div>
          {list.length > 0 ? (
            <div className="mk-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, perspective: "1600px" }}>
              {list.map((c, i) => <CoachCard key={i} c={c} />)}
            </div>
          ) : (
            <div style={{ padding: 80, textAlign: "center", fontFamily: sans, color: "rgba(242,237,228,0.5)", border: "1px dashed rgba(242,237,228,0.1)", borderRadius: 6 }}>
              No matches in this category. Try "All Categories" or widen filters.
            </div>
          )}
        </div>
      </section>
    </>);
}

function FeaturedCity() {
  return (
    <section style={{ padding: "120px 72px", background: INK, color: PAPER }}>
      <div className="mk-city" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>This week</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.4vw, 76px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 20px", lineHeight: 0.95 }}>
            Featured in <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>Brooklyn</em>.
          </h2>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(26,22,18,0.7)", maxWidth: 460 }}>
            Six new coaches live in Brooklyn this month — across strength, yoga, and sports nutrition. Book an intro; they have the hours, you bring the goals.
          </p>
          <button style={{ marginTop: 28, padding: "15px 26px", borderRadius: 2, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Browse Brooklyn →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map((i) =>
          <Ph key={i} label={`BK · 0${i + 1}`} ratio="3/4" tone="dark" style={{ borderRadius: 4 }} />
          )}
        </div>
      </div>
    </section>);
}

function Marketplace() {
  const [tab, setTab] = useS("Trainer");
  const bgSrc = tab === "Trainer" ? "/Training%202.png" : "/Nutrition%203.png";
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `url('${bgSrc}')`, backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9, transition: "background-image 0.4s ease" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Marketplace" />
        <MarketplaceHero tab={tab} setTab={setTab} />
        <Spotlight tab={tab} />
        <Grid tab={tab} />
        <FeaturedCity />
        <Footer />
      </div>
      <style>{`
        @media (max-width: 980px) {
          .mk-head { grid-template-columns: 1fr !important; gap: 24px !important; }
          .mk-spot { grid-template-columns: 1fr !important; }
          .mk-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .mk-city { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
        @media (max-width: 560px) {
          .mk-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>);
}

ReactDOM.createRoot(document.getElementById("root")).render(<Marketplace />);
