// Public-facing coach/nutritionist profile — used by TrainerPublic.html + NutritionistPublic.html
const PROFILE = {
  trainer: {
    name: "Maya Okafor",
    portrait: "Maya · portrait",
    cover: "Gym · training floor",
    bgImage: "/Training%202.png",
    bgOverlay: 0.6,
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
    bgImage: "/Nutrition%203.png",
    bgOverlay: 0.6,
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
          <div style={{ paddingTop: 120, minWidth: 0 }}>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>{p.eyebrow}</div>
            <h1 style={{ fontFamily: serif, fontSize: "clamp(48px, 6.2vw, 88px)", letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.95, overflowWrap: "break-word", wordBreak: "break-word" }}>{p.name}</h1>
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
      <button style={{
        marginTop: 24,
        padding: "12px 20px",
        borderRadius: 8,
        background: pk.featured ? TEAL : "transparent",
        color: pk.featured ? INK : INK,
        border: pk.featured ? 0 : "1px solid rgba(242,237,228,0.25)",
        fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer",
      }}>{pk.kind === "subscription" ? "Subscribe" : "Buy now"}</button>
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

function PublicProfilePage({ kind }) {
  const p = PROFILE[kind];
  const [bookOpen, setBookOpen] = React.useState(false);
  const storageKey = `shape.profileBg.${kind}`;
  const [bg, setBg] = React.useState(() => {
    if (typeof window === "undefined") return { image: p.bgImage, overlay: p.bgOverlay };
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          image: parsed.image || p.bgImage,
          overlay: typeof parsed.overlay === "number" ? parsed.overlay : p.bgOverlay,
        };
      }
    } catch (e) {}
    return { image: p.bgImage, overlay: p.bgOverlay };
  });
  React.useEffect(() => {
    window.__openBookIntro = () => setBookOpen(true);
    const onStorage = (e) => {
      if (e.key === storageKey) {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : null;
          setBg({
            image: (parsed && parsed.image) || p.bgImage,
            overlay: parsed && typeof parsed.overlay === "number" ? parsed.overlay : p.bgOverlay,
          });
        } catch (_) {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => { delete window.__openBookIntro; window.removeEventListener("storage", onStorage); };
  }, [storageKey, p.bgImage, p.bgOverlay]);
  const bgCss = bg.image && bg.image.startsWith("data:") ? `url("${bg.image}")` : `url('${bg.image}')`;
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: bgCss, backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: `rgba(26,22,18,${bg.overlay})`, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {bookOpen && <BookIntroModal p={p} kind={kind} onClose={() => setBookOpen(false)} />}
        <Header active="Marketplace" />
        <PublicHero p={p} kind={kind} />
        <AboutSection p={p} />
        <SpecialtiesSection p={p} />
        <PackagesSection p={p} kind={kind} />
        <SamplesSection p={p} kind={kind} />
        <AvailabilitySection p={p} />
        <ReviewsSection p={p} />
        <FAQSection p={p} />
        <FinalCTA p={p} kind={kind} />
        <Footer />
      </div>
    </div>
  );
}
