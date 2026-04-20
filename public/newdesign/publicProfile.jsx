// Public-facing coach/nutritionist profile — used by TrainerPublic.html + NutritionistPublic.html
const PROFILE = {
  trainer: {
    name: "Maya Okafor",
    portrait: "Maya · portrait",
    cover: "Gym · training floor",
    socials: [["IG", "@mayalifts", "#"], ["TikTok", "@mayalifts", "#"], ["YouTube", "Maya Okafor Strength", "#"], ["Web", "mayaokafor.co", "#"]],
    eyebrow: "Trainer · Brooklyn, NY · NASM-CPT",
    city: "Brooklyn, NY",
    rating: 4.97,
    reviews: 284,
    sessions: 1284,
    years: 9,
    tagline: "Strength & hypertrophy specialist",
    bio: "Strength & hypertrophy specialist. 9 years coaching private and hybrid. I write 12-week blocks that read like music — simple on the surface, complete underneath. Most of my clients are lifters in their 30s and 40s who want to get strong without breaking themselves.",
    philosophy: "Get strong, stay strong. I believe in boring programming, excellent technique, and full recovery. No fads, no 75-day anything, no shame. We show up, we lift well, we track it, and we go home.",
    specialties: ["Strength", "Hypertrophy", "Powerlifting", "Form audits", "Post-partum return", "Women 30+"],
    credentials: [
      ["NASM-CPT", "Certified Personal Trainer · 2016"],
      ["PN-L1", "Precision Nutrition Level 1 · 2019"],
      ["USAW-L1", "USA Weightlifting Sports Performance · 2020"],
      ["FMS-L2", "Functional Movement Screen · 2021"],
    ],
    packages: [
      {
        kind: "one-time",
        name: "Single workout",
        price: "$32",
        altPrice: "$55",
        altLabel: "In-person",
        priceLabel: "Remote",
        unit: "one-time",
        sub: "Buy one workout. Yours forever.",
        perks: ["Pre-built workout with video", "Full sets, reps & cues", "Swap-in alternates for equipment", "Log & track inside Shape"],
        secondary: "Or $55 / session for live 1:1 at the Gowanus studio",
      },
      {
        kind: "one-time",
        name: "Program",
        price: "$180",
        unit: "one-time",
        sub: "6-week pre-built training block.",
        perks: ["6 weeks of pre-built workouts", "Progressive loading built-in", "Weekly video walkthroughs", "Swap-in alternates for equipment", "Keeps access after you finish"],
      },
      {
        kind: "subscription",
        name: "Monthly — custom",
        price: "$280",
        unit: "/ month",
        sub: "I build your plan every month.",
        featured: true,
        perks: ["Custom workouts written for you", "Updated weekly based on your logs", "Unlimited async form checks", "Monthly 1:1 check-in call", "Cancel anytime"],
      },
    ],
    samples: [
      {
        title: "Lower push — Week 6",
        tag: "Strength · 60 min",
        meta: "RPE 7–8 · 2'30\" rest",
        blocks: [
          { label: "A", name: "Back squat", detail: "4 × 5 @ 225 lb", note: "Last set AMRAP, stop at RPE 9" },
          { label: "B1", name: "Romanian deadlift", detail: "3 × 8 @ 185 lb", note: "Hinge, soft knees" },
          { label: "B2", name: "Walking lunge", detail: "3 × 20 steps @ 40 lb DB", note: "Control the lowering" },
          { label: "C", name: "Leg curl", detail: "3 × 12", note: "Full range, pause at top" },
          { label: "D", name: "Calf raise", detail: "3 × 15", note: "3s eccentric" },
        ],
      },
      {
        title: "Upper pull — Week 6",
        tag: "Hypertrophy · 45 min",
        meta: "RPE 7–9 · 90s rest",
        blocks: [
          { label: "A", name: "Pull-up", detail: "4 × AMRAP", note: "Dead hang, full ROM" },
          { label: "B1", name: "Chest-supported row", detail: "4 × 10", note: "Squeeze at top" },
          { label: "B2", name: "Face pull", detail: "4 × 15", note: "External rotation cue" },
          { label: "C", name: "Incline DB curl", detail: "3 × 10", note: "Supinated, slow" },
          { label: "D", name: "Hammer curl", detail: "3 × 12", note: "Neutral grip" },
        ],
      },
    ],
    slots: [
      { day: "Mon", date: "Apr 22", times: ["07:00", "17:30"] },
      { day: "Tue", date: "Apr 23", times: ["06:30", "18:00"] },
      { day: "Wed", date: "Apr 24", times: ["—"] },
      { day: "Thu", date: "Apr 25", times: ["07:00", "12:00", "17:30"] },
      { day: "Fri", date: "Apr 26", times: ["14:00"] },
      { day: "Sat", date: "Apr 27", times: ["09:00", "10:30"] },
      { day: "Sun", date: "Apr 28", times: ["—"] },
    ],
    reviewList: [
      { name: "Priya S.", time: "3 weeks ago", rating: 5, body: "Maya's programming finally clicked for me. I added 60 lb to my deadlift in 14 weeks without a single bad back day. The form checks are worth the price alone.", tags: ["Strength", "14 weeks in"] },
      { name: "Jonah W.", time: "2 months ago", rating: 5, body: "I came in scared of barbells. Now I squat 2× bodyweight. Maya never rushed me and never coddled me — she just showed up every week with the right thing.", tags: ["Foundations", "8 months in"] },
      { name: "Ana P.", time: "4 months ago", rating: 5, body: "She held the line when I wanted to chase shiny new programs. Boring worked. My numbers are at lifetime highs at 38.", tags: ["Hypertrophy", "1 year in"] },
      { name: "Marcus L.", time: "5 months ago", rating: 4, body: "Excellent coach. I took one star off for scheduling — she books up fast, so plan ahead. Programming itself is world-class.", tags: ["Powerlifting", "2 years in"] },
    ],
    faq: [
      ["How are sessions run?", "Live 1:1 — in-person at a private studio in Gowanus, or virtual on Zoom with both cameras angled for form checks. Hybrid clients mix both."],
      ["Do you write remote programs?", "Yes. The 'Program only' tier is fully async: custom 12-week block delivered week-by-week with bi-weekly video review of your lifts."],
      ["What equipment do I need?", "For in-studio, nothing. For virtual, a barbell + rack covers 90% of my programming. I can adapt to dumbbell-only or home gym setups."],
      ["Cancellation policy?", "24-hour notice for full credit. Inside 24h, half credit — unless you're sick, in which case don't come."],
      ["Can I try before committing?", "Yes — the intro call is $0 and 30 minutes. We talk through your history, goals, and whether we're a fit. Zero pressure."],
    ],
  },
  nutritionist: {
    name: "Rae Lindqvist",
    portrait: "Rae · portrait",
    cover: "Kitchen · fresh produce",
    socials: [["IG", "@raeats.rd", "#"], ["Substack", "fuel-notes.rae", "#"], ["Podcast", "The Fuel Notes", "#"], ["Web", "raelindqvist.co", "#"]],
    eyebrow: "Nutritionist · Brooklyn, NY · RD, CSSD",
    city: "Brooklyn, NY",
    rating: 4.95,
    reviews: 198,
    sessions: 842,
    years: 7,
    tagline: "Performance nutrition for lifters & endurance athletes",
    bio: "Registered dietitian with a sports nutrition specialty. 7 years working with everyone from beginning lifters to ultramarathoners. I keep it simple: eat enough, eat real, and fuel the work you're actually doing — not the work you wish you were doing.",
    philosophy: "Food is fuel, not a moral test. I'm not here to police what's on your plate. I'm here to help you eat in a way that supports your training, your sleep, your mood, and your life — and that you can keep doing in five years.",
    specialties: ["Performance fueling", "Sports nutrition", "Gut health", "Iron & ferritin", "Women's endurance", "Recovery protocols"],
    credentials: [
      ["RD", "Registered Dietitian · 2018"],
      ["CSSD", "Board-Certified Specialist in Sports Dietetics · 2020"],
      ["ISAK-L1", "Anthropometry certification · 2021"],
      ["FODMAP", "Monash FODMAP-trained · 2022"],
    ],
    packages: [
      {
        kind: "one-time",
        name: "Single meal plan",
        price: "$28",
        unit: "one-time",
        sub: "Buy one day-of meal plan.",
        perks: ["Pre-built 1-day plan with macros", "Shopping list + prep notes", "Swap-in alternates", "Keeps access forever"],
      },
      {
        kind: "one-time",
        name: "Program",
        price: "$240",
        unit: "one-time",
        sub: "6-week pre-built fueling program.",
        perks: ["6 weeks of meal frameworks", "Macro targets by training day", "Grocery templates", "Supplement guide", "Keeps access after you finish"],
      },
      {
        kind: "subscription",
        name: "Monthly — custom",
        price: "$320",
        unit: "/ month",
        sub: "I build your plan every month.",
        featured: true,
        perks: ["Custom fueling plan for your goals", "Lab results reviewed quarterly", "Unlimited async check-ins", "Monthly 1:1 video call", "Cancel anytime"],
      },
    ],
    samples: [
      {
        title: "Performance day — Lifting",
        tag: "~2,650 kcal · 180g P",
        meta: "Training day, pre & post lift",
        blocks: [
          { label: "07:00", name: "Pre-lift", detail: "Oatmeal + berries + whey", note: "55g C · 30g P" },
          { label: "09:30", name: "Post-lift shake", detail: "2 scoops whey + banana", note: "50g P · 30g C" },
          { label: "12:30", name: "Lunch", detail: "Chicken + rice + greens + olive oil", note: "55g P · 80g C · 20g F" },
          { label: "16:00", name: "Snack", detail: "Greek yogurt + almonds", note: "20g P · 15g F" },
          { label: "19:30", name: "Dinner", detail: "Salmon + sweet potato + asparagus", note: "45g P · 60g C · 25g F" },
        ],
      },
      {
        title: "Rest day — Lower carb",
        tag: "~2,200 kcal · 170g P",
        meta: "Off day, higher protein + fat",
        blocks: [
          { label: "08:00", name: "Breakfast", detail: "3 eggs + avocado + berries", note: "25g P · 25g F" },
          { label: "12:30", name: "Lunch", detail: "Tuna salad + mixed greens", note: "40g P · 20g F" },
          { label: "16:00", name: "Snack", detail: "Cottage cheese + walnuts", note: "25g P · 15g F" },
          { label: "19:30", name: "Dinner", detail: "Ribeye + roasted broccoli + butter", note: "55g P · 35g F" },
          { label: "21:00", name: "Evening", detail: "Casein + almond butter", note: "30g P · 12g F" },
        ],
      },
    ],
    slots: [
      { day: "Mon", date: "Apr 22", times: ["10:00", "16:00"] },
      { day: "Tue", date: "Apr 23", times: ["09:00", "13:00", "17:00"] },
      { day: "Wed", date: "Apr 24", times: ["11:00"] },
      { day: "Thu", date: "Apr 25", times: ["—"] },
      { day: "Fri", date: "Apr 26", times: ["09:00", "15:00"] },
      { day: "Sat", date: "Apr 27", times: ["—"] },
      { day: "Sun", date: "Apr 28", times: ["—"] },
    ],
    reviewList: [
      { name: "Sofia M.", time: "2 weeks ago", rating: 5, body: "Rae figured out my low ferritin before any doctor did. Ran my labs, told me exactly what to eat and what to supplement, and six weeks later my energy is back. I train 50% more volume now.", tags: ["Endurance", "Ferritin"] },
      { name: "Diego R.", time: "1 month ago", rating: 5, body: "I'd been eating too little forever without realizing. Rae walked me through what actually fueling a lifting block looks like. My lifts went up and I stopped waking up at 3 AM.", tags: ["Strength", "Fueling"] },
      { name: "Amira K.", time: "3 months ago", rating: 5, body: "Practical, kind, never preachy. She helped me build a plan I can keep doing when I'm tired and traveling. That matters more than any macro spreadsheet.", tags: ["Sustainable", "6 months in"] },
      { name: "Tom B.", time: "4 months ago", rating: 5, body: "Runs a tight practice. Shows up prepared, follows up, and her written plans are the clearest I've ever seen.", tags: ["Gut health", "FODMAP"] },
    ],
    faq: [
      ["How do sessions work?", "Video calls on Zoom. First intake is 75 minutes, follow-ups are 45. I send a written summary with action items after every session."],
      ["Do you review labs?", "Yes — bring any recent bloodwork (CBC, iron panel, vitamin D, hormones) and I'll walk through what's worth watching. I coordinate with your doctor when needed."],
      ["Will you count calories for me?", "Only if you ask. Most of my clients do better with structured meal patterns than daily calorie tracking. Both work."],
      ["Do you work with eating disorder recovery?", "I work with disordered-eating recovery alongside a therapist and physician. I'm not a primary ED specialist — happy to refer if that's the right fit."],
      ["Insurance / HSA?", "I provide superbills you can submit to insurance. HSA/FSA cards work directly."],
    ],
  },
};

function Pill({ children, tone = "default" }) {
  const styles = {
    default: { background: "rgba(30,192,168,0.1)", color: TEAL },
    muted: { background: "rgba(242,237,228,0.06)", color: "rgba(242,237,228,0.7)" },
  };
  return <span style={{ fontFamily: sans, fontSize: 11.5, padding: "5px 11px", borderRadius: 999, letterSpacing: "0.02em", ...styles[tone] }}>{children}</span>;
}

function PublicHero({ p, kind }) {
  return (
    <section style={{ position: "relative", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      {/* Cover photo band */}
      <div style={{ position: "relative", height: 320, overflow: "hidden" }}>
        <Ph label={p.cover} ratio="" tone="dark" style={{ position: "absolute", inset: 0, aspectRatio: "auto", borderRadius: 0, width: "100%", height: "100%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.35) 0%, rgba(26,22,18,0.55) 60%, rgba(26,22,18,0.95) 100%)" }} />
        <div style={{ position: "absolute", top: 20, left: 0, right: 0 }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
            <a href="Marketplace.html" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.85)", display: "inline-block", padding: "8px 14px", background: "rgba(26,22,18,0.6)", backdropFilter: "blur(8px)", borderRadius: 999, border: "1px solid rgba(242,237,228,0.15)" }}>← Back to marketplace</a>
          </div>
        </div>
      </div>

      {/* Hero body */}
      <div style={{ padding: "0 40px 56px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 20% 30%, rgba(30,192,168,0.08) 0%, transparent 50%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 48, alignItems: "start", marginTop: -110 }}>
          <div>
            <div style={{ borderRadius: 999, padding: 6, background: PAPER, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
              <Ph label={p.portrait} ratio="1/1" tone="light" style={{ borderRadius: 999 }} />
            </div>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: TEAL_BRIGHT, boxShadow: `0 0 10px ${TEAL_BRIGHT}` }} /> Available this week
            </div>
          </div>
          <div style={{ paddingTop: 120 }}>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>{p.eyebrow}</div>
            <h1 style={{ fontFamily: serif, fontSize: 96, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.92 }}>{p.name}</h1>
            <p style={{ fontFamily: serif, fontSize: 22, color: "rgba(242,237,228,0.75)", margin: "20px 0 0", fontStyle: "italic", maxWidth: 640, lineHeight: 1.4 }}>{p.tagline}.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 28, flexWrap: "wrap" }}>
              {p.specialties.slice(0, 5).map(s => <Pill key={s}>{s}</Pill>)}
            </div>
            {/* Social links */}
            <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
              {p.socials.map(([platform, handle, href]) => (
                <a key={platform} href={href} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 6, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.85)", textDecoration: "none" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL }}>{platform}</span>
                  <span style={{ color: "rgba(242,237,228,0.6)" }}>{handle}</span>
                  <span style={{ color: "rgba(242,237,228,0.4)", fontSize: 10 }}>↗</span>
                </a>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 12, padding: 24, marginTop: 120 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontFamily: serif, fontSize: 56, color: INK, letterSpacing: "-0.03em", lineHeight: 1 }}>{p.rating}</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>★ {p.reviews} reviews</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
              <div>
                <div style={{ fontFamily: serif, fontSize: 28, color: INK, letterSpacing: "-0.02em" }}>{p.sessions.toLocaleString()}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>Sessions delivered</div>
              </div>
              <div>
                <div style={{ fontFamily: serif, fontSize: 28, color: INK, letterSpacing: "-0.02em" }}>{p.years} y</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>Coaching experience</div>
              </div>
            </div>
            <button onClick={() => window.__openBookIntro && window.__openBookIntro()} style={{ marginTop: 24, width: "100%", padding: "14px 20px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Book intro — $0</button>
            <a href={kind === "trainer" ? "TrainerMessages.html" : "NutritionistMessages.html"} style={{ marginTop: 8, width: "100%", padding: "12px 20px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 13, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block", boxSizing: "border-box" }}>Message {p.name.split(" ")[0]}</a>
            <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.45)", marginTop: 14, textAlign: "center" }}>Usually replies within 2 hours</div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

function SectionHead({ label, title, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 32 }}>
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>{label}</div>
        <h2 style={{ fontFamily: serif, fontSize: 52, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

function AboutSection({ p }) {
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 80 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>About</div>
          <h2 style={{ fontFamily: serif, fontSize: 52, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>The approach.</h2>
        </div>
        <div>
          <p style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.55, color: "rgba(242,237,228,0.85)", margin: "0 0 28px", textWrap: "pretty" }}>{p.bio}</p>
          <div style={{ paddingTop: 28, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 12 }}>Philosophy</div>
            <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.65, color: "rgba(242,237,228,0.75)", margin: 0 }}>{p.philosophy}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpecialtiesSection({ p }) {
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <SectionHead label="Specialties & credentials" title="What I work on." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 18 }}>Specialties</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {p.specialties.map(s => (
                <div key={s} style={{ padding: "14px 18px", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, fontFamily: sans, fontSize: 14, color: INK }}>
                  {s}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 18 }}>Credentials</div>
            {p.credentials.map(([abbr, desc], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 20, padding: "18px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "1px solid rgba(242,237,228,0.12)" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TEAL, letterSpacing: "0.04em" }}>{abbr}</div>
                <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.8)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SamplesSection({ p, kind }) {
  const [tab, setTab] = React.useState(0);
  const s = p.samples[tab];
  const label = kind === "trainer" ? "Sample workouts" : "Sample meal plans";
  const title = kind === "trainer" ? "A week in the block." : "A day on the plan.";
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <SectionHead
          label={label}
          title={title}
          right={
            <div style={{ display: "flex", gap: 6, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 999, padding: 4 }}>
              {p.samples.map((x, i) => (
                <button key={i} onClick={() => setTab(i)} style={{ padding: "8px 16px", borderRadius: 999, background: tab === i ? INK : "transparent", color: tab === i ? PAPER : "rgba(242,237,228,0.7)", border: 0, fontFamily: sans, fontSize: 12, cursor: "pointer", fontWeight: tab === i ? 500 : 400 }}>{x.title.split(" — ")[0]}</button>
              ))}
            </div>
          }
        />
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "28px 32px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", color: INK, lineHeight: 1.1 }}>{s.title}</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 6 }}>{s.meta}</div>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: "6px 12px", background: "rgba(30,192,168,0.1)", color: TEAL, borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.tag}</span>
          </div>
          <div>
            {s.blocks.map((b, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1.2fr 1.5fr", gap: 20, padding: "18px 32px", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none", alignItems: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEAL, letterSpacing: "0.06em" }}>{b.label}</div>
                <div style={{ fontFamily: sans, fontSize: 15, color: INK, fontWeight: 500 }}>{b.name}</div>
                <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.85)" }}>{b.detail}</div>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)", fontStyle: "italic" }}>{b.note}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "18px 32px", borderTop: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.02)", fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>
            This is a preview \u2014 actual {kind === "trainer" ? "programs" : "plans"} are custom-written for your goals, schedule, and equipment.
          </div>
        </div>
      </div>
    </section>
  );
}

function PackageCard({ pk, kind }) {
  const [inPerson, setInPerson] = React.useState(false);
  const hasAlt = pk.altPrice && pk.altLabel;
  const displayPrice = inPerson && hasAlt ? pk.altPrice : pk.price;
  const role = kind === "trainer" ? "trainer" : "nutritionist";
  const providerId = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("id")) || "1";
  const buyHref = pk.kind === "subscription"
    ? `/subscribe?role=${role}&id=${encodeURIComponent(providerId)}`
    : `/purchase?role=${role}&kind=booking&id=${encodeURIComponent(providerId)}`;
  return (
    <div style={{
      background: pk.featured ? INK : "rgba(242,237,228,0.04)",
      color: pk.featured ? PAPER : INK,
      border: pk.featured ? `1px solid ${TEAL}` : "1px solid rgba(242,237,228,0.1)",
      borderRadius: 12,
      padding: "32px 28px 28px",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
      {pk.featured && <span style={{ position: "absolute", top: -12, left: 28, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK, background: TEAL, padding: "5px 10px", borderRadius: 4, fontWeight: 600 }}>Most popular</span>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: pk.featured ? "#0a7d6b" : TEAL }}>{pk.name}</div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 3, background: pk.kind === "subscription" ? (pk.featured ? "rgba(30,192,168,0.18)" : "rgba(30,192,168,0.12)") : (pk.featured ? "rgba(26,22,18,0.08)" : "rgba(242,237,228,0.06)"), color: pk.kind === "subscription" ? (pk.featured ? "#0a7d6b" : TEAL) : (pk.featured ? "rgba(26,22,18,0.6)" : "rgba(242,237,228,0.55)") }}>
          {pk.kind === "subscription" ? "Subscription" : "One-time"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, lineHeight: 1 }}>{displayPrice}</div>
        <div style={{ fontFamily: sans, fontSize: 14, color: pk.featured ? "rgba(26,22,18,0.55)" : "rgba(242,237,228,0.55)" }}>{pk.unit}</div>
      </div>
      <div style={{ fontFamily: sans, fontSize: 13, color: pk.featured ? "rgba(26,22,18,0.65)" : "rgba(242,237,228,0.6)", marginTop: 8 }}>{pk.sub}</div>

      {hasAlt && (
        <div style={{ marginTop: 16, display: "inline-flex", background: pk.featured ? "rgba(26,22,18,0.06)" : "rgba(242,237,228,0.06)", border: pk.featured ? "1px solid rgba(26,22,18,0.1)" : "1px solid rgba(242,237,228,0.1)", borderRadius: 999, padding: 3, width: "fit-content" }}>
          {[[false, pk.priceLabel], [true, pk.altLabel]].map(([val, label]) => (
            <button key={label} onClick={() => setInPerson(val)} style={{ padding: "6px 12px", borderRadius: 999, background: inPerson === val ? (pk.featured ? PAPER : INK) : "transparent", color: inPerson === val ? INK : (pk.featured ? "rgba(26,22,18,0.65)" : "rgba(242,237,228,0.6)"), border: 0, fontFamily: sans, fontSize: 11.5, cursor: "pointer", fontWeight: inPerson === val ? 500 : 400 }}>{label}</button>
          ))}
        </div>
      )}

      <div style={{ margin: "22px 0", height: 1, background: pk.featured ? "rgba(26,22,18,0.12)" : "rgba(242,237,228,0.08)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {pk.perks.map((perk, j) => (
          <div key={j} style={{ display: "flex", gap: 10, alignItems: "start" }}>
            <span style={{ color: pk.featured ? "#0a7d6b" : TEAL, fontFamily: sans, fontSize: 14, lineHeight: 1.5 }}>→</span>
            <span style={{ fontFamily: sans, fontSize: 14, color: pk.featured ? "rgba(26,22,18,0.85)" : "rgba(242,237,228,0.8)", lineHeight: 1.5 }}>{perk}</span>
          </div>
        ))}
      </div>
      <a href={buyHref} style={{
        marginTop: 24,
        padding: "12px 20px",
        borderRadius: 8,
        background: pk.featured ? TEAL : "transparent",
        color: pk.featured ? INK : INK,
        border: pk.featured ? 0 : "1px solid rgba(242,237,228,0.25)",
        fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer",
        textAlign: "center", textDecoration: "none", display: "inline-block",
      }}>{pk.kind === "subscription" ? "Subscribe" : "Buy now"}</a>
    </div>
  );
}

function PackagesSection({ p, kind }) {
  const oneTime = p.packages.filter(pk => pk.kind === "one-time");
  const subs = p.packages.filter(pk => pk.kind === "subscription");
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.015)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <SectionHead label="Packages & pricing" title="Pick what fits." />

        {oneTime.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 20 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>One-time purchase</div>
              <div style={{ flex: 1, height: 1, background: "rgba(242,237,228,0.08)" }} />
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>Buy once, keep access forever.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${oneTime.length}, 1fr)`, gap: 16, marginBottom: 48 }}>
              {oneTime.map((pk, i) => <PackageCard key={i} pk={pk} kind={kind} />)}
            </div>
          </>
        )}

        {subs.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 20 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Monthly subscription</div>
              <div style={{ flex: 1, height: 1, background: "rgba(242,237,228,0.08)" }} />
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>Custom-built for you each month.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${subs.length}, minmax(280px, 420px))`, gap: 16, justifyContent: "start" }}>
              {subs.map((pk, i) => <PackageCard key={i} pk={pk} kind={kind} />)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function AvailabilitySection({ p }) {
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <SectionHead
          label="Availability"
          title="Next 7 days."
          right={<div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>All times ET · <span style={{ color: TEAL }}>●</span> open · <span style={{ color: "rgba(242,237,228,0.3)" }}>—</span> booked</div>}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, overflow: "hidden", background: "rgba(242,237,228,0.02)" }}>
          {p.slots.map((s, i) => (
            <div key={i} style={{ padding: "22px 16px", borderRight: i < 6 ? "1px solid rgba(242,237,228,0.06)" : "none", minHeight: 200 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>{s.day}</div>
              <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", color: INK, marginTop: 4 }}>{s.date.split(" ")[1]}</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.45)", marginBottom: 14 }}>{s.date.split(" ")[0]}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {s.times.map((t, j) => (
                  t === "—"
                    ? <div key={j} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.25)" }}>—</div>
                    : <button key={j} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(30,192,168,0.1)", color: TEAL, border: "1px solid rgba(30,192,168,0.25)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, cursor: "pointer", textAlign: "center", letterSpacing: "0.04em" }}>{t}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewsSection({ p }) {
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.015)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <SectionHead
          label="Reviews"
          title={`${p.reviews} reviews · ${p.rating} avg.`}
          right={<button style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: INK, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Read all →</button>}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {p.reviewList.map((r, i) => (
            <article key={i} style={{ padding: "28px 28px 24px", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(242,237,228,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serif, fontSize: 16, color: INK }}>{r.name.split(" ").map(x => x[0]).join("")}</div>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 500, color: INK }}>{r.name}</div>
                    <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)" }}>{r.time}</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEAL }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
              </div>
              <p style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.85)", margin: "0 0 16px", fontStyle: "italic", textWrap: "pretty" }}>"{r.body}"</p>
              <div style={{ display: "flex", gap: 6 }}>
                {r.tags.map(t => <Pill key={t} tone="muted">{t}</Pill>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection({ p }) {
  const [open, setOpen] = React.useState(0);
  return (
    <section style={{ padding: "80px 40px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 80 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>FAQ</div>
          <h2 style={{ fontFamily: serif, fontSize: 52, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>Good questions.</h2>
          <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.6)", marginTop: 20, lineHeight: 1.6 }}>Don't see yours? Message {p.name.split(" ")[0]} directly — responses typically within 2 hours.</p>
        </div>
        <div>
          {p.faq.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ borderTop: "1px solid rgba(242,237,228,0.1)" }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 0", background: "transparent", border: 0, color: INK, cursor: "pointer", textAlign: "left", gap: 20 }}>
                  <span style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.01em", fontWeight: 400 }}>{q}</span>
                  <span style={{ fontFamily: sans, fontSize: 22, color: TEAL, width: 24, textAlign: "center", flexShrink: 0 }}>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div style={{ paddingBottom: 24, paddingRight: 40 }}>
                    <p style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.75)", lineHeight: 1.65, margin: 0 }}>{a}</p>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid rgba(242,237,228,0.1)" }} />
        </div>
      </div>
    </section>
  );
}

function FinalCTA({ p, kind }) {
  return (
    <section style={{ padding: "100px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 60, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>Ready when you are</div>
          <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.95, color: PAPER }}>Start with a free intro.</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", marginTop: 20, maxWidth: 520, lineHeight: 1.6 }}>30 minutes. Zero pressure. We talk through your history, goals, and whether we're the right fit. If not, {p.name.split(" ")[0]}'ll point you to someone who is.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => window.__openBookIntro && window.__openBookIntro()} style={{ padding: "18px 28px", borderRadius: 8, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 15, fontWeight: 500, cursor: "pointer" }}>Book intro — $0</button>
          <a href={kind === "trainer" ? "TrainerMessages.html" : "NutritionistMessages.html"} style={{ padding: "16px 28px", borderRadius: 8, background: "transparent", color: PAPER, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block", boxSizing: "border-box" }}>Message {p.name.split(" ")[0]}</a>
          <a href="Marketplace.html" style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)", marginTop: 12, textAlign: "center", textDecoration: "underline", textUnderlineOffset: 3 }}>or browse other {kind === "trainer" ? "trainers" : "nutritionists"}</a>
        </div>
      </div>
    </section>
  );
}

function BookIntroModal({ p, kind, onClose }) {
  const [slot, setSlot] = React.useState(null);
  const [step, setStep] = React.useState("pick"); // pick | confirm | done
  const messagesHref = kind === "trainer" ? "TrainerMessages.html" : "NutritionistMessages.html";
  const slots = [
    { day: "Tue", date: "Dec 10", time: "9:00 AM" },
    { day: "Tue", date: "Dec 10", time: "2:30 PM" },
    { day: "Wed", date: "Dec 11", time: "11:00 AM" },
    { day: "Wed", date: "Dec 11", time: "4:00 PM" },
    { day: "Thu", date: "Dec 12", time: "8:30 AM" },
    { day: "Fri", date: "Dec 13", time: "10:00 AM" },
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.75)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: INK, color: PAPER, borderRadius: 14, maxWidth: 560, width: "100%", padding: "36px 36px 30px", position: "relative", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "transparent", border: 0, color: "rgba(26,22,18,0.5)", fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button>

        {step === "pick" && (<>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0a7d6b", marginBottom: 12 }}>Free intro · 30 min · $0</div>
          <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 6px" }}>Book with {p.name.split(" ")[0]}</h3>
          <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(26,22,18,0.65)", margin: "0 0 24px", lineHeight: 1.55 }}>A no-pressure call to talk through your goals and see if you'd work well together.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {slots.map((s, i) => (
              <button key={i} onClick={() => { setSlot(s); setStep("confirm"); }} style={{ padding: "14px 14px", borderRadius: 8, background: "rgba(26,22,18,0.04)", border: "1px solid rgba(26,22,18,0.1)", textAlign: "left", cursor: "pointer", fontFamily: sans, color: PAPER }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(26,22,18,0.55)", marginBottom: 3 }}>{s.day} · {s.date}</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{s.time}</div>
              </button>
            ))}
          </div>
          <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(26,22,18,0.5)", marginTop: 20, textAlign: "center" }}>All times in your timezone · Reschedule anytime</div>
        </>)}

        {step === "confirm" && slot && (<>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0a7d6b", marginBottom: 12 }}>Confirm booking</div>
          <h3 style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 20px" }}>{slot.day}, {slot.date} at {slot.time}</h3>
          <div style={{ background: "rgba(26,22,18,0.04)", border: "1px solid rgba(26,22,18,0.08)", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
            <Row k="With" v={p.name} />
            <Row k="Duration" v="30 minutes" />
            <Row k="Format" v="Video call (link sent after)" />
            <Row k="Cost" v="Free" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("pick")} style={{ flex: "0 0 auto", padding: "13px 18px", borderRadius: 8, background: "transparent", border: "1px solid rgba(26,22,18,0.2)", fontFamily: sans, fontSize: 13, cursor: "pointer", color: PAPER }}>Back</button>
            <button onClick={() => setStep("done")} style={{ flex: 1, padding: "13px 18px", borderRadius: 8, background: PAPER, color: INK, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Confirm booking</button>
          </div>
        </>)}

        {step === "done" && slot && (<>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M5 13.5l5 5 11-11" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 8px" }}>You're booked.</h3>
          <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(26,22,18,0.65)", margin: "0 0 22px", lineHeight: 1.55 }}>{slot.day}, {slot.date} at {slot.time}. We sent the call link to your email and added it to your calendar.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={messagesHref} style={{ flex: 1, padding: "13px 18px", borderRadius: 8, background: "transparent", border: "1px solid rgba(26,22,18,0.2)", fontFamily: sans, fontSize: 13, cursor: "pointer", color: PAPER, textAlign: "center", textDecoration: "none" }}>Message {p.name.split(" ")[0]}</a>
            <button onClick={onClose} style={{ flex: 1, padding: "13px 18px", borderRadius: 8, background: PAPER, color: INK, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Done</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: sans, fontSize: 13 }}>
      <span style={{ color: "rgba(26,22,18,0.55)" }}>{k}</span>
      <span style={{ color: PAPER, fontWeight: 500 }}>{v}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Theme customization — lets coaches brand their public page.
// Persisted to localStorage; live-previewed; exposed via Tweaks.
// ═══════════════════════════════════════════════════════════════

const COVER_PRESETS = {
  "gym-floor":    { label: "Gym floor",      url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1920&q=70" },
  "kitchen":      { label: "Bright kitchen", url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&q=70" },
  "barbell":      { label: "Barbell",        url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1920&q=70" },
  "track":        { label: "Running track",  url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1920&q=70" },
  "yoga":         { label: "Soft light",     url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1920&q=70" },
  "produce":      { label: "Market produce", url: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&q=70" },
};

const ACCENT_PRESETS = [
  { label: "Shape teal",   value: "#1ec0a8" },
  { label: "Ember",        value: "#e86b3a" },
  { label: "Electric",     value: "#7ab8ff" },
  { label: "Bloom",        value: "#e06bb0" },
  { label: "Sun",          value: "#f2b84e" },
  { label: "Forest",       value: "#5a9a6a" },
  { label: "Violet",       value: "#9a7adf" },
  { label: "Paper",        value: "#f2ede4" },
];

const FONT_PAIRS = {
  "fraunces-space":   { label: "Fraunces · Space Grotesk",  serif: "'Fraunces', serif",            sans: "'Space Grotesk', sans-serif" },
  "playfair-inter":   { label: "Playfair · Inter",           serif: "'Playfair Display', serif",    sans: "'Inter', sans-serif" },
  "dm-dm":            { label: "DM Serif · DM Sans",         serif: "'DM Serif Display', serif",    sans: "'DM Sans', sans-serif" },
  "cormorant-mono":   { label: "Cormorant · JetBrains",      serif: "'Cormorant Garamond', serif",  sans: "'JetBrains Mono', monospace" },
  "ibm-ibm":          { label: "IBM Plex Serif · Sans",      serif: "'IBM Plex Serif', serif",      sans: "'IBM Plex Sans', sans-serif" },
  "rozha-manrope":    { label: "Rozha · Manrope",            serif: "'Rozha One', serif",           sans: "'Manrope', sans-serif" },
};

const THEME_DEFAULTS = /*EDITMODE-BEGIN*/{
  "coverKey": "gym-floor",
  "coverUrl": "",
  "accent": "#1ec0a8",
  "mode": "dark",
  "paperShade": 12,
  "widgetOpacity": 4,
  "fontPair": "fraunces-space",
  "fontScale": 100,
  "brandName": "",
  "brandTagline": "",
  "bgScope": "cover"
}/*EDITMODE-END*/;

function readStoredTheme(kind) {
  try {
    const raw = localStorage.getItem(`shape.profileTheme.${kind}`);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function useProfileTheme(kind) {
  const [theme, setTheme] = React.useState(() => ({ ...THEME_DEFAULTS, ...readStoredTheme(kind) }));
  React.useEffect(() => {
    try { localStorage.setItem(`shape.profileTheme.${kind}`, JSON.stringify(theme)); } catch {}
  }, [theme, kind]);
  const patch = (changes) => setTheme(t => ({ ...t, ...changes }));
  return [theme, patch];
}

function ThemedShell({ theme, children }) {
  const pair = FONT_PAIRS[theme.fontPair] || FONT_PAIRS["fraunces-space"];
  const dark = theme.mode === "dark";
  const paperBg = dark
    ? `hsl(30, 20%, ${Math.max(3, 16 - theme.paperShade)}%)`
    : `hsl(36, 30%, ${Math.min(99, 92 + (20 - theme.paperShade) / 3)}%)`;
  const paperInk = dark ? "#f2ede4" : "#1a1612";
  const widgetBg = dark
    ? `rgba(242,237,228,${theme.widgetOpacity / 100})`
    : `rgba(26,22,18,${theme.widgetOpacity / 100})`;
  const widgetBorder = dark
    ? `rgba(242,237,228,${Math.min(1, theme.widgetOpacity / 100 + 0.06)})`
    : `rgba(26,22,18,${Math.min(1, theme.widgetOpacity / 100 + 0.06)})`;
  const accent = theme.accent;

  const fullBleed = theme.bgScope === "full";
  const cover = theme.coverUrl || (COVER_PRESETS[theme.coverKey] && COVER_PRESETS[theme.coverKey].url);
  const fullBleedStyle = fullBleed && cover ? {
    backgroundImage: `linear-gradient(180deg, ${dark ? "rgba(10,8,6,0.55)" : "rgba(255,253,248,0.45)"} 0%, ${dark ? "rgba(10,8,6,0.85)" : "rgba(255,253,248,0.82)"} 100%), url(${cover})`,
    backgroundSize: "cover",
    backgroundAttachment: "fixed",
    backgroundPosition: "center",
  } : { background: paperBg };

  return (
    <div style={{
      "--p-paper": paperBg,
      "--p-ink": paperInk,
      "--p-accent": accent,
      "--p-accent-soft": accent + "1a",
      "--p-widget-bg": widgetBg,
      "--p-widget-border": widgetBorder,
      "--p-serif": pair.serif,
      "--p-sans": pair.sans,
      "--p-scale": theme.fontScale / 100,
      color: paperInk,
      fontFamily: pair.sans,
      minHeight: "100vh",
      fontSize: `${16 * (theme.fontScale / 100)}px`,
      ...fullBleedStyle,
    }}>
      <style>{`
        [data-themed] { font-family: var(--p-sans); }
        [data-themed] h1, [data-themed] h2, [data-themed] h3, [data-themed] .themed-serif { font-family: var(--p-serif) !important; }
      `}</style>
      {children}
    </div>
  );
}

function BrandOverlay({ theme, fallback }) {
  if (!theme.brandName && !theme.brandTagline) return null;
  return (
    <div style={{
      position: "absolute", top: 20, right: 40, zIndex: 3,
      padding: "10px 16px",
      background: "rgba(26,22,18,0.6)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(242,237,228,0.18)",
      borderRadius: 6,
      maxWidth: 280,
    }}>
      {theme.brandName && <div style={{ fontFamily: "var(--p-serif)", fontSize: 20, letterSpacing: "-0.01em", color: "#f2ede4", lineHeight: 1.1 }}>{theme.brandName}</div>}
      {theme.brandTagline && <div style={{ fontFamily: "var(--p-sans)", fontSize: 11, color: theme.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>{theme.brandTagline}</div>}
    </div>
  );
}

function ThemedHero({ p, kind, theme, onUploadCover }) {
  const cover = theme.coverUrl || (COVER_PRESETS[theme.coverKey] && COVER_PRESETS[theme.coverKey].url);
  const fullBleed = theme.bgScope === "full";
  const bannerHeight = fullBleed ? 180 : 380;
  return (
    <section style={{ position: "relative", borderBottom: "1px solid rgba(127,127,127,0.15)" }}>
      <div style={{ position: "relative", height: bannerHeight, overflow: "hidden" }}>
        {!fullBleed && (cover
          ? <img src={cover} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>
          : <Ph label={p.cover} ratio="" tone="dark" style={{ position: "absolute", inset: 0, aspectRatio: "auto", borderRadius: 0, width: "100%", height: "100%" }} />
        )}
        {!fullBleed && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 65%, var(--p-paper) 100%)` }}/>}
        <div style={{ position: "absolute", top: 20, left: 0, right: 0 }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
            <a href="Marketplace.html" style={{ fontFamily: "var(--p-sans)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f2ede4", display: "inline-block", padding: "8px 14px", background: "rgba(26,22,18,0.6)", backdropFilter: "blur(8px)", borderRadius: 999, border: "1px solid rgba(242,237,228,0.15)" }}>← Back to marketplace</a>
          </div>
        </div>
        <BrandOverlay theme={theme} />
      </div>

      <div style={{ padding: "0 40px 56px", position: "relative" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 48, alignItems: "start", marginTop: -110 }}>
            <div>
              <div style={{ borderRadius: 999, padding: 6, background: "var(--p-paper)", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
                <Ph label={p.portrait} ratio="1/1" tone="light" style={{ borderRadius: 999 }} />
              </div>
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--p-sans)", fontSize: 12, color: "color-mix(in srgb, var(--p-ink) 55%, transparent)" }}>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: "var(--p-accent)", boxShadow: `0 0 10px var(--p-accent)` }}/> Available this week
              </div>
            </div>
            <div style={{ paddingTop: 120 }}>
              <div style={{ fontFamily: "var(--p-sans)", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--p-accent)", marginBottom: 14 }}>{p.eyebrow}</div>
              <h1 className="themed-serif" style={{ fontSize: 96, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.92, color: "var(--p-ink)" }}>{p.name}</h1>
              <p className="themed-serif" style={{ fontSize: 22, color: "color-mix(in srgb, var(--p-ink) 75%, transparent)", margin: "20px 0 0", fontStyle: "italic", maxWidth: 640, lineHeight: 1.4 }}>{p.tagline}.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 28, flexWrap: "wrap" }}>
                {p.specialties.slice(0, 5).map(s => (
                  <span key={s} style={{ fontFamily: "var(--p-sans)", fontSize: 11.5, padding: "5px 11px", borderRadius: 999, background: "var(--p-accent-soft)", color: "var(--p-accent)" }}>{s}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
                {p.socials.map(([platform, handle, href]) => (
                  <a key={platform} href={href} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 6, background: "var(--p-widget-bg)", border: "1px solid var(--p-widget-border)", fontFamily: "var(--p-sans)", fontSize: 12, color: "color-mix(in srgb, var(--p-ink) 85%, transparent)", textDecoration: "none" }}>
                    <span style={{ fontFamily: "var(--p-sans)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--p-accent)" }}>{platform}</span>
                    <span style={{ color: "color-mix(in srgb, var(--p-ink) 60%, transparent)" }}>{handle}</span>
                  </a>
                ))}
              </div>
            </div>
            <div style={{ background: "var(--p-widget-bg)", border: "1px solid var(--p-widget-border)", borderRadius: 12, padding: 24, marginTop: 120, backdropFilter: "blur(8px)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div className="themed-serif" style={{ fontSize: 56, color: "var(--p-ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>{p.rating}</div>
                <div style={{ fontFamily: "var(--p-sans)", fontSize: 13, color: "color-mix(in srgb, var(--p-ink) 55%, transparent)" }}>★ {p.reviews} reviews</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--p-widget-border)" }}>
                <div>
                  <div className="themed-serif" style={{ fontSize: 28, color: "var(--p-ink)", letterSpacing: "-0.02em" }}>{p.sessions.toLocaleString()}</div>
                  <div style={{ fontFamily: "var(--p-sans)", fontSize: 11, color: "color-mix(in srgb, var(--p-ink) 50%, transparent)", marginTop: 2 }}>Sessions delivered</div>
                </div>
                <div>
                  <div className="themed-serif" style={{ fontSize: 28, color: "var(--p-ink)", letterSpacing: "-0.02em" }}>{p.years} y</div>
                  <div style={{ fontFamily: "var(--p-sans)", fontSize: 11, color: "color-mix(in srgb, var(--p-ink) 50%, transparent)", marginTop: 2 }}>Coaching experience</div>
                </div>
              </div>
              <button onClick={() => window.__openBookIntro && window.__openBookIntro()} style={{ marginTop: 24, width: "100%", padding: "14px 20px", borderRadius: 8, background: "var(--p-accent)", color: "#1a1612", border: 0, fontFamily: "var(--p-sans)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Book intro — $0</button>
              <a href={kind === "trainer" ? "TrainerMessages.html" : "NutritionistMessages.html"} style={{ marginTop: 8, width: "100%", padding: "12px 20px", borderRadius: 8, background: "transparent", color: "var(--p-ink)", border: "1px solid var(--p-widget-border)", fontFamily: "var(--p-sans)", fontSize: 13, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block", boxSizing: "border-box" }}>Message {p.name.split(" ")[0]}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Tweaks panel — the live theme customizer
function ThemeTweaksPanel({ theme, onChange, onUploadCover, onReset, hostVisible }) {
  const [collapsed, setCollapsed] = React.useState(false);
  if (!hostVisible) return null;
  const setKey = (k, v) => {
    onChange({ [k]: v });
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*"); } catch {}
  };
  const fileRef = React.useRef(null);

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 50,
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 18px", borderRadius: 999,
        background: "#1a1612", color: "#f2ede4",
        border: "1px solid rgba(242,237,228,0.15)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
        fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, cursor: "pointer",
      }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: theme.accent }}/>
        Customize page
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 50,
      width: 340, maxHeight: "calc(100vh - 48px)", overflowY: "auto",
      background: "#1a1612", color: "#f2ede4",
      border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14,
      padding: "18px 18px 16px",
      fontFamily: "'Space Grotesk', sans-serif", fontSize: 13,
      boxShadow: "0 30px 70px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: theme.accent, textTransform: "uppercase" }}>Customize</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, letterSpacing: "-0.01em" }}>Brand your page</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onReset} style={{ fontSize: 11, background: "transparent", color: "rgba(242,237,228,0.5)", border: "1px solid rgba(242,237,228,0.15)", borderRadius: 6, padding: "5px 9px", cursor: "pointer" }}>Reset</button>
          <button onClick={() => setCollapsed(true)} title="Collapse" style={{ fontSize: 14, width: 28, background: "transparent", color: "rgba(242,237,228,0.5)", border: "1px solid rgba(242,237,228,0.15)", borderRadius: 6, padding: "4px 0", cursor: "pointer", lineHeight: 1 }}>−</button>
        </div>
      </div>

      <TweakGroup label="Cover photo">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {Object.entries(COVER_PRESETS).map(([key, p]) => (
            <button key={key} onClick={() => { setKey("coverKey", key); setKey("coverUrl", ""); }} style={{
              position: "relative", aspectRatio: "1/1", borderRadius: 6, overflow: "hidden", padding: 0,
              border: theme.coverKey === key && !theme.coverUrl ? `2px solid ${theme.accent}` : "1px solid rgba(242,237,228,0.15)",
              cursor: "pointer", background: "#2a2520",
            }}>
              <img src={p.url} alt={p.label} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}/>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 9, padding: "3px 4px", background: "rgba(0,0,0,0.6)", textAlign: "center" }}>{p.label}</div>
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
          const f = e.target.files && e.target.files[0]; if (!f) return;
          const r = new FileReader(); r.onload = () => setKey("coverUrl", r.result); r.readAsDataURL(f);
        }}/>
        <button onClick={() => fileRef.current && fileRef.current.click()} style={{ marginTop: 8, width: "100%", padding: "9px 12px", borderRadius: 6, background: "rgba(242,237,228,0.05)", color: "#f2ede4", border: "1px dashed rgba(242,237,228,0.25)", cursor: "pointer", fontSize: 12 }}>
          {theme.coverUrl ? "Replace uploaded photo" : "+ Upload your own"}
        </button>
        {theme.coverUrl && <button onClick={() => setKey("coverUrl", "")} style={{ marginTop: 4, width: "100%", padding: "6px 12px", background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, cursor: "pointer", fontSize: 11 }}>Remove upload</button>}
      </TweakGroup>

      <TweakGroup label="Background scope">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "rgba(242,237,228,0.05)", borderRadius: 8, padding: 3 }}>
          {[
            ["cover", "Cover only", "Photo sits at top of page"],
            ["full",  "Full page",  "Photo takes over everything"],
          ].map(([v, label, hint]) => (
            <button key={v} onClick={() => setKey("bgScope", v)} title={hint} style={{
              padding: "9px 8px", borderRadius: 6,
              background: theme.bgScope === v ? theme.accent : "transparent",
              color: theme.bgScope === v ? "#1a1612" : "#f2ede4",
              border: 0, cursor: "pointer", fontSize: 12,
              fontWeight: theme.bgScope === v ? 500 : 400,
            }}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "rgba(242,237,228,0.45)", marginTop: 6, lineHeight: 1.4 }}>
          {theme.bgScope === "full" ? "Photo scrolls with the page. Widgets dim for contrast." : "Photo appears in the hero banner only."}
        </div>
      </TweakGroup>

      <TweakGroup label="Accent color">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
          {ACCENT_PRESETS.map(a => (
            <button key={a.value} onClick={() => setKey("accent", a.value)} title={a.label} style={{
              width: "100%", aspectRatio: "1/1", borderRadius: 999, background: a.value,
              border: theme.accent === a.value ? `2px solid #f2ede4` : "1px solid rgba(242,237,228,0.15)",
              cursor: "pointer", padding: 0,
            }}/>
          ))}
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color" value={theme.accent} onChange={(e) => setKey("accent", e.target.value)} style={{ width: 40, height: 30, border: 0, background: "transparent", padding: 0, cursor: "pointer" }}/>
          <input type="text" value={theme.accent} onChange={(e) => setKey("accent", e.target.value)} style={{ flex: 1, background: "rgba(242,237,228,0.05)", color: "#f2ede4", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 4, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}/>
        </div>
      </TweakGroup>

      <TweakGroup label="Mode">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "rgba(242,237,228,0.05)", borderRadius: 999, padding: 3 }}>
          {["dark", "light"].map(m => (
            <button key={m} onClick={() => setKey("mode", m)} style={{ padding: "7px 10px", borderRadius: 999, background: theme.mode === m ? theme.accent : "transparent", color: theme.mode === m ? "#1a1612" : "#f2ede4", border: 0, cursor: "pointer", fontSize: 12, textTransform: "capitalize", fontWeight: theme.mode === m ? 500 : 400 }}>{m}</button>
          ))}
        </div>
      </TweakGroup>

      <TweakSlider label="Background darkness" value={theme.paperShade} min={0} max={20} onChange={(v) => setKey("paperShade", v)} suffix=""/>
      <TweakSlider label="Widget opacity" value={theme.widgetOpacity} min={0} max={30} onChange={(v) => setKey("widgetOpacity", v)} suffix="%"/>
      <TweakSlider label="Font scale" value={theme.fontScale} min={85} max={120} onChange={(v) => setKey("fontScale", v)} suffix="%"/>

      <TweakGroup label="Typography">
        <select value={theme.fontPair} onChange={(e) => setKey("fontPair", e.target.value)} style={{ width: "100%", padding: "9px 10px", background: "rgba(242,237,228,0.05)", color: "#f2ede4", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}>
          {Object.entries(FONT_PAIRS).map(([k, p]) => <option key={k} value={k} style={{ background: "#1a1612" }}>{p.label}</option>)}
        </select>
      </TweakGroup>

      <TweakGroup label="Brand / business name">
        <input type="text" value={theme.brandName} onChange={(e) => setKey("brandName", e.target.value)} placeholder="e.g. Okafor Strength Co." style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", background: "rgba(242,237,228,0.05)", color: "#f2ede4", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}/>
        <input type="text" value={theme.brandTagline} onChange={(e) => setKey("brandTagline", e.target.value)} placeholder="Short tagline (optional)" style={{ marginTop: 6, width: "100%", boxSizing: "border-box", padding: "9px 10px", background: "rgba(242,237,228,0.05)", color: "#f2ede4", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}/>
      </TweakGroup>

      <div style={{ fontSize: 10, color: "rgba(242,237,228,0.4)", marginTop: 12, lineHeight: 1.4 }}>Changes save automatically to this browser. Your clients see the final look.</div>
    </div>
  );
}

function TweakGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}
function TweakSlider({ label, value, min, max, onChange, suffix }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase", marginBottom: 6 }}>
        <span>{label}</span><span>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: "100%", accentColor: "#1ec0a8" }}/>
    </div>
  );
}

function PublicProfilePage({ kind }) {
  const p = PROFILE[kind];
  const [bookOpen, setBookOpen] = React.useState(false);
  const [theme, patchTheme] = useProfileTheme(kind);
  const [tweaksVisible, setTweaksVisible] = React.useState(true);

  React.useEffect(() => {
    window.__openBookIntro = () => setBookOpen(true);
    return () => { delete window.__openBookIntro; };
  }, []);

  // Tweaks host integration
  React.useEffect(() => {
    const handler = (e) => {
      if (!e || !e.data) return;
      if (e.data.type === "__activate_edit_mode") setTweaksVisible(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksVisible(false);
    };
    window.addEventListener("message", handler);
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch {}
    return () => window.removeEventListener("message", handler);
  }, []);

  const resetTheme = () => patchTheme(THEME_DEFAULTS);

  return (
    <ThemedShell theme={theme}>
      <div data-themed>
        {bookOpen && <BookIntroModal p={p} kind={kind} onClose={() => setBookOpen(false)} />}
        <Header active="Marketplace" />
        <ThemedHero p={p} kind={kind} theme={theme} />
        <AboutSection p={p} />
        <SpecialtiesSection p={p} />
        <PackagesSection p={p} kind={kind} />
        <SamplesSection p={p} kind={kind} />
        <AvailabilitySection p={p} />
        <ReviewsSection p={p} />
        <FAQSection p={p} />
        <FinalCTA p={p} kind={kind} />
        <Footer />
        <ThemeTweaksPanel theme={theme} onChange={patchTheme} onReset={resetTheme} hostVisible={tweaksVisible}/>
      </div>
    </ThemedShell>
  );
}
