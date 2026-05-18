// Community page — editorial feed of events, stories, challenges. Spatial Cinema language.
const { useState: useSC } = React;

const CM_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function CmReveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(CM_RPR);
  React.useEffect(() => {
    if (CM_RPR || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.08 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(32px)", transition: `opacity .72s ease ${delay}ms, transform .72s ease ${delay}ms`, ...style }}>{children}</div>;
}

const EVENTS = [
  { when: "Apr 22", city: "Brooklyn", title: "Saturday long run", host: "Diego Alvarez", rsvp: 42, cap: 60, tag: "Endurance" },
  { when: "Apr 24", city: "London", title: "Strength cinema — deadlift night", host: "Leo Martins", rsvp: 28, cap: 40, tag: "Strength" },
  { when: "Apr 27", city: "LA", title: "Mobility + mat pilates", host: "Jordan Park", rsvp: 51, cap: 55, tag: "Mobility" },
  { when: "May 02", city: "Austin", title: "Sunrise tempo run · 6k", host: "Diego Alvarez", rsvp: 36, cap: 80, tag: "Endurance" },
  { when: "May 04", city: "Stockholm", title: "Nutrition Q&A · sports fueling", host: "Rae Lindqvist", rsvp: 94, cap: 120, tag: "Nutrition" },
  { when: "May 08", city: "Miami", title: "Open-gym benchmark Saturday", host: "Tomás Reyes", rsvp: 67, cap: 90, tag: "Strength" },
];

const CHALLENGES = [
  { title: "21 Days of Protein", people: 12800, days: "Apr 15 → May 5", tag: "Nutrition", color: TEAL },
  { title: "Marathon Block — Spring", people: 3400, days: "Apr 01 → Jun 10", tag: "Endurance", color: TEAL },
  { title: "Mobility Minutes", people: 9200, days: "Rolling · weekly", tag: "Recovery", color: TEAL },
  { title: "PR or ER · Strength Month", people: 5600, days: "May 01 → May 31", tag: "Strength", color: TEAL_BRIGHT },
];

const STORIES = [
  { who: "Priya S.", line: "Maya read my lifts in the intro. Had a 12-week block by Tuesday.", metric: "+22 lb squat PR", city: "Brooklyn" },
  { who: "Elena R.", line: "Having a real nutritionist in my pocket changed how I eat on the road.", metric: "−14% body fat", city: "London" },
  { who: "Marcus T.", line: "Picked up eleven new clients last quarter — Shape handled billing and scheduling.", metric: "11 new clients / Q", city: "Chicago" },
  { who: "Yuki A.", line: "The community runs kept me honest for six months straight.", metric: "First marathon · 3:54", city: "Austin" },
];

function HeroC() {
  return (
    <section style={{ padding: "150px 72px 80px", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", width: 660, height: 660, top: "-22%", right: "-6%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>The community</div>
        <div className="cm-hero" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "end" }}>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(56px, 8.5vw, 124px)", lineHeight: 0.86, letterSpacing: "-0.045em", fontWeight: 300, margin: 0 }}>
            Train <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>together</em>.<br />Show up <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>alone.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 18, lineHeight: 1.55, color: "rgba(242,237,228,0.62)", margin: 0, maxWidth: 440 }}>
            Member events, challenges, and stories — the social layer that makes the hard stuff repeatable. Run with people in your city; stay accountable to the ones you don't see.
          </p>
        </div>
      </div>
    </section>
  );
}

// Live activity feed — Strava-style vertical feed of what members are doing
// across the network right now. Read-only marketing view of the same activity
// kinds that ClientCommunity renders for signed-in members.
const LIVE_ACTIVITY = [
  {
    kind: "pr", who: "Marcus J.", city: "Brooklyn, NY", tier: "Tempo", ago: "2m",
    avatarHue: 160,
    body: "Eight months in. First time the bar moved this clean.",
    lift: "Bench Press", load: "225 lb", delta: "+10 lb", sets: [["1", "5 × 5 @ 185"], ["2", "3 × 3 @ 205"], ["TOP", "1 × 5 @ 225 ✓"]],
    kudos: 142, replies: 18, coach: "Maya Okafor",
  },
  {
    kind: "run", who: "Diego A.", city: "Austin, TX", tier: "Form", ago: "6m",
    avatarHue: 184,
    body: "Easy long. Brooklyn Half is Sunday — taper feels good.",
    distance: "8.4 mi", pace: "7:42 / mi", duration: "1h 04m", elev: "+412 ft", hr: "152 avg",
    splits: [7.8, 7.6, 7.7, 7.4, 7.5, 7.8, 7.6, 7.9],
    coach: "Diego solo",
  },
  {
    kind: "workout", who: "Elena R.", city: "London, UK", tier: "Peak", ago: "11m",
    avatarHue: 120,
    body: "Squats felt locked in today. RPE 8 across the board, no missed reps.",
    title: "Lower strength · Block 3", duration: "52 min", exercises: 6, rpe: 8.5,
    moves: [["Back squat", "5 × 5 @ 185 lb"], ["RDL", "4 × 8 @ 155 lb"], ["Lunge", "3 × 12 ea"], ["Leg curl", "3 × 12"]],
    coach: "Maya Okafor",
  },
  {
    kind: "tier", who: "Ana P.", city: "Miami, FL", tier: "Tempo", ago: "18m",
    avatarHue: 14,
    body: "Three weeks in. Tempo unlocked — 2× redemption value at the store, here we come.",
    from: "Raw", to: "Tempo", earnedThisMonth: 752,
  },
  {
    kind: "streak", who: "Yuki A.", city: "Tokyo, JP", tier: "Form", ago: "24m",
    avatarHue: 280,
    body: "Three weeks straight. Sunday-night protein prep is the unlock.",
    days: 21,
  },
  {
    kind: "pr", who: "Tomás R.", city: "Miami, FL", tier: "Peak", ago: "31m",
    avatarHue: 200,
    body: "Conventional, no belt. Felt like nothing.",
    lift: "Deadlift", load: "405 lb", delta: "+15 lb", sets: [["WARM", "5 × 5 @ 245"], ["BUILD", "3 × 3 @ 335"], ["TOP", "1 × 1 @ 405 ✓"]],
    coach: "Tomás Reyes",
  },
];

function Avatar({ name, hue = 180, size = 38 }) {
  const initial = (name || "?").trim()[0].toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue},45%,38%), hsl(${(hue+30)%360},55%,22%))`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: serif, fontSize: size * 0.42, color: "rgba(242,237,228,0.92)", letterSpacing: "-0.02em" }}>
      {initial}
    </div>
  );
}

function ActivityHeader({ a }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <Avatar name={a.who} hue={a.avatarHue} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{a.who}</div>
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", color: TEAL_BRIGHT }}>{a.tier.toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>
          {a.city} · {a.ago} ago{a.coach ? ` · with ${a.coach}` : ""}
        </div>
      </div>
    </div>
  );
}

function PRCard({ a }) {
  return (
    <>
      <div style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.025em", lineHeight: 1.05, color: INK, marginBottom: 12 }}>
        {a.lift} · <span style={{ color: TEAL_BRIGHT }}>{a.load}</span>
      </div>
      {a.body && <div style={{ fontSize: 14.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, marginBottom: 18 }}>{a.body}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "stretch", padding: "16px 18px", background: "rgba(46,224,196,0.06)", border: "1px solid rgba(46,224,196,0.2)", borderRadius: 6 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, fontWeight: 600 }}>NEW PR</div>
          <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, color: INK }}>{a.delta}</div>
        </div>
        <div style={{ paddingLeft: 18, borderLeft: "1px solid rgba(46,224,196,0.18)" }}>
          {a.sets && a.sets.map(([label, line], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10, padding: "4px 0", fontFamily: mono, fontSize: 11.5, letterSpacing: "0.04em" }}>
              <span style={{ color: "rgba(242,237,228,0.5)" }}>{label}</span>
              <span style={{ color: "rgba(242,237,228,0.85)" }}>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RunCard({ a }) {
  // Build an SVG "splits" sparkline from per-mile paces (lower = faster, draw inverted).
  const max = Math.max(...a.splits), min = Math.min(...a.splits);
  const W = 600, H = 90;
  const pts = a.splits.map((p, i) => {
    const x = (i / (a.splits.length - 1)) * W;
    const y = H - ((max - p) / (max - min || 1)) * (H - 12) - 6;
    return [x, y];
  });
  const path = pts.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(" ");
  return (
    <>
      {a.body && <div style={{ fontSize: 14.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, marginBottom: 16 }}>{a.body}</div>}
      <div style={{ padding: "16px 18px 14px", background: "linear-gradient(100deg, rgba(106,140,255,0.10) 0%, rgba(242,237,228,0.04) 70%)", border: "1px solid rgba(106,140,255,0.22)", borderRadius: 6 }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.16em", color: "#9ab2ff", fontWeight: 600, marginBottom: 10 }}>RUN</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 14 }}>
          {[["DIST", a.distance], ["PACE", a.pace], ["TIME", a.duration], ["ELEV", a.elev], ["HR", a.hr]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>{l}</div>
              <div style={{ fontFamily: serif, fontSize: 18, letterSpacing: "-0.015em", color: INK, marginTop: 2, lineHeight: 1 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontFamily: mono, fontSize: 9, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>
            <span>SPLITS · MIN/MI</span>
            <span>{a.splits.length} miles</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="60" preserveAspectRatio="none">
            <path d={path} stroke="#9ab2ff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#9ab2ff"/>)}
          </svg>
        </div>
      </div>
    </>
  );
}

function WorkoutCard({ a }) {
  return (
    <>
      {a.body && <div style={{ fontSize: 14.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, marginBottom: 16 }}>{a.body}</div>}
      <div style={{ padding: "16px 18px", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, fontWeight: 600, marginBottom: 4 }}>WORKOUT LOGGED</div>
            <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK }}>{a.title}</div>
          </div>
          <div style={{ display: "flex", gap: 14, fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.6)", letterSpacing: "0.06em", flexShrink: 0 }}>
            <span>{a.duration.toUpperCase()}</span><span>{a.exercises} EX</span><span>RPE {a.rpe}</span>
          </div>
        </div>
        <div>
          {a.moves && a.moves.map(([name, line], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)", fontSize: 13.5 }}>
              <span style={{ color: "rgba(242,237,228,0.85)" }}>{name}</span>
              <span style={{ fontFamily: mono, fontSize: 11.5, color: "rgba(242,237,228,0.6)", letterSpacing: "0.04em" }}>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TierCard({ a }) {
  return (
    <>
      {a.body && <div style={{ fontSize: 14.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, marginBottom: 16 }}>{a.body}</div>}
      <div style={{ padding: "20px 22px", background: "rgba(193,100,31,0.08)", border: "1px solid rgba(193,100,31,0.28)", borderRadius: 6 }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.18em", color: "#e89740", fontWeight: 600, marginBottom: 10 }}>TIER UP</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.015em", color: "rgba(242,237,228,0.5)" }}>{a.from}</span>
          <span style={{ fontFamily: mono, fontSize: 18, color: "#e89740" }}>→</span>
          <span style={{ fontFamily: serif, fontSize: 38, letterSpacing: "-0.025em", color: INK }}>{a.to}</span>
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11.5, color: "rgba(242,237,228,0.6)", letterSpacing: "0.06em" }}>{a.earnedThisMonth.toLocaleString()} PTS THIS MONTH</span>
        </div>
      </div>
    </>
  );
}

function StreakCard({ a }) {
  return (
    <>
      {a.body && <div style={{ fontSize: 14.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, marginBottom: 16 }}>{a.body}</div>}
      <div style={{ padding: "16px 18px", background: "rgba(46,224,196,0.07)", border: "1px solid rgba(46,224,196,0.2)", borderRadius: 6, display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, fontWeight: 600 }}>STREAK</div>
          <div style={{ fontFamily: serif, fontSize: 38, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, color: INK }}>{a.days}d</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 36, borderRadius: 3, background: i < a.days ? TEAL : "rgba(242,237,228,0.06)" }} />
          ))}
        </div>
      </div>
    </>
  );
}

function ActivityFooter() {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.06)", display: "flex", gap: 22, alignItems: "center", fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 10.2S1.5 7.5 1.5 4.5a2.5 2.5 0 0 1 4.5-1.5 2.5 2.5 0 0 1 4.5 1.5c0 3-4.5 5.7-4.5 5.7Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
        KUDOS
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 5.5a3 3 0 0 1 3-3h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5l-2.5 2V7a2.5 2.5 0 0 1-.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
        REPLY
      </span>
      <span style={{ marginLeft: "auto", color: TEAL }}>SIGN IN TO ENGAGE →</span>
    </div>
  );
}

function LiveActivity() {
  return (
    <section style={{ padding: "70px 72px 40px", borderTop: "1px solid rgba(242,237,228,0.12)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: TEAL_BRIGHT, boxShadow: `0 0 8px ${TEAL_BRIGHT}` }}/> Live · across the network
            </div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 6vw, 64px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
              Today on <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>Shape</em>.
            </h2>
          </div>
          <a href="/newdesign/Login.html" style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.16em", color: TEAL_BRIGHT, textDecoration: "none", whiteSpace: "nowrap" }}>JOIN THE FEED →</a>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {LIVE_ACTIVITY.map((a, i) => (
            <CmReveal key={i} delay={Math.min(i * 50, 200)}>
              <article style={{ padding: "24px 26px", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6 }}>
                <ActivityHeader a={a} />
                {a.kind === "pr"      && <PRCard a={a} />}
                {a.kind === "run"     && <RunCard a={a} />}
                {a.kind === "workout" && <WorkoutCard a={a} />}
                {a.kind === "tier"    && <TierCard a={a} />}
                {a.kind === "streak"  && <StreakCard a={a} />}
                <ActivityFooter />
              </article>
            </CmReveal>
          ))}
        </div>

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <a href="/newdesign/Login.html" style={{ display: "inline-block", padding: "15px 30px", borderRadius: 2, background: TEAL, color: PAPER, fontFamily: sans, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.04em", textDecoration: "none" }}>Join the feed</a>
          <div style={{ marginTop: 12, fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.45)" }}>FREE WITH ANY SHAPE MEMBERSHIP</div>
        </div>
      </div>
    </section>
  );
}

function Events() {
  const [city, setCity] = useSC("All cities");
  const cities = ["All cities", ...new Set(EVENTS.map(e => e.city))];
  const list = city === "All cities" ? EVENTS : EVENTS.filter(e => e.city === city);
  return (
    <section id="events" style={{ padding: "90px 72px", borderTop: "1px solid rgba(242,237,228,0.12)", scrollMarginTop: 100 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 44, flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Events · this month</div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 6vw, 64px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
              Find your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>people</em>.
            </h2>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 500 }}>
            {cities.map(c => (
              <button key={c} onClick={() => setCity(c)} style={{ padding: "7px 15px", borderRadius: 2, border: city === c ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.18)", background: city === c ? INK : "transparent", color: city === c ? PAPER : INK, fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>{c}</button>
            ))}
          </div>
        </div>
        <div className="cm-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {list.map((e, i) => (
            <CmReveal key={i} delay={Math.min(i * 50, 200)}>
              <article style={{ padding: 30, background: "rgba(242,237,228,0.03)", borderRadius: 6, border: "1px solid rgba(242,237,228,0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
                  <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", color: INK, lineHeight: 1, fontWeight: 300 }}>{e.when}</div>
                  <span style={{ fontFamily: mono, fontSize: 10, padding: "4px 10px", borderRadius: 999, background: "rgba(19,194,168,0.1)", color: TEAL, letterSpacing: "0.08em", textTransform: "uppercase" }}>{e.tag}</span>
                </div>
                <h3 style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", fontWeight: 400, color: INK, margin: "0 0 8px", lineHeight: 1.15 }}>{e.title}</h3>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginBottom: 18 }}>{e.city} · hosted by {e.host}</div>
                <div style={{ height: 6, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: `${(e.rsvp/e.cap)*100}%`, height: "100%", background: `linear-gradient(90deg, ${TEAL}, ${TEAL_BRIGHT})` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
                  <span>{e.rsvp} / {e.cap} spots</span>
                  <a style={{ color: INK, borderBottom: `1px solid ${TEAL}`, cursor: "pointer" }}>RSVP →</a>
                </div>
              </article>
            </CmReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Challenges() {
  return (
    <section style={{ padding: "110px 72px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 52 }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Challenges · live</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(46px, 6.4vw, 72px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
            Do it with <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>everyone</em>.
          </h2>
        </div>
        <div className="cm-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {CHALLENGES.map((c, i) => (
            <CmReveal key={i} delay={Math.min(i * 60, 180)}>
              <article style={{ padding: 38, background: "rgba(26,22,18,0.04)", borderRadius: 6, border: "1px solid rgba(26,22,18,0.1)", position: "relative", overflow: "hidden" }}>
                <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.color}, ${RUST})`, opacity: 0.7 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: c.color }}>{c.tag}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(26,22,18,0.55)" }}>{c.days}</div>
                </div>
                <h3 style={{ fontFamily: serif, fontSize: 38, letterSpacing: "-0.025em", fontWeight: 300, margin: "0 0 16px", lineHeight: 1 }}>{c.title}</h3>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(26,22,18,0.12)" }}>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(26,22,18,0.75)" }}><b style={{ color: PAPER, fontWeight: 600 }}>{c.people.toLocaleString()}</b> members in</div>
                  <button style={{ background: c.color, color: PAPER, border: 0, padding: "11px 20px", borderRadius: 2, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Join →</button>
                </div>
              </article>
            </CmReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stories() {
  return (
    <section style={{ padding: "110px 72px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Stories</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(46px, 6.4vw, 72px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 56px", lineHeight: 0.95 }}>
          From the <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>field</em>.
        </h2>
        <div className="cm-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
          {STORIES.map((s, i) => (
            <article key={i} style={{ padding: 42, background: "rgba(242,237,228,0.03)", borderRadius: 6, borderTop: `3px solid ${TEAL}` }}>
              <p style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.35, fontStyle: "italic", color: INK, margin: 0 }}>"{s.line}"</p>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.1)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: INK }}>{s.who}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{s.city}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: TEAL, letterSpacing: "0.04em" }}>{s.metric}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section style={{ padding: "130px 72px", background: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(56px, 9vw, 120px)", letterSpacing: "-0.045em", fontWeight: 300, lineHeight: 0.9, margin: "0 0 40px" }}>
          Join the <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>community</em>.
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="Marketplace.html" style={{ background: TEAL, color: PAPER, border: 0, padding: "16px 30px", borderRadius: 2, fontFamily: sans, fontWeight: 600, fontSize: 15, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Find your coach →</a>
          <a href="#events" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "16px 30px", borderRadius: 2, fontFamily: sans, fontWeight: 600, fontSize: 15, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Browse events</a>
        </div>
      </div>
    </section>
  );
}

function Chat() {
  const [tab, setTab] = useSC("community");
  const ROOMS = {
    trainer: {
      label: "Trainer chat",
      sub: "Your trainer · direct",
      header: "Maya Okafor · Strength & Hypertrophy",
      context: "DM · just the two of you · active 2m ago",
      channels: [
        { name: "Maya Okafor", sub: "Coach · 2m", active: true, dm: true },
        { name: "Back-up coverage", sub: "When Maya's out", dm: true },
        { name: "#strength-club", members: 1280 },
        { name: "#form-check", members: 620 },
      ],
      right: "YOUR COACH",
      roster: [["Maya Okafor", "Coach · online", true], ["You", "Member", false]],
      messages: [
        { who: "Maya O.", role: "Coach", init: "MO", time: "8:45", msg: "Video from yesterday's bench looked clean. Elbows tucked, bar path straight up the sternum.", pin: true },
        { who: "You", role: "Member", init: "YO", time: "8:58", msg: "Felt heavier than the number said. Set 3 was a grind." },
        { who: "Maya O.", role: "Coach", init: "MO", time: "9:02", msg: "Expected — this is the overreach week. Push 185 today, deload next week. Ice shoulder tonight.", highlight: true },
        { who: "You", role: "Member", init: "YO", time: "9:04", msg: "Got it. Anything on diet? Been low on sleep." },
        { who: "Maya O.", role: "Coach", init: "MO", time: "9:08", msg: "Looping Rae in on the sleep piece — she'll message you today. Stick to macros, hit bed by 10:30." },
      ],
      placeholder: "Message Maya",
    },
    nutritionist: {
      label: "Nutritionist chat",
      sub: "Your nutritionist · direct",
      header: "Rae Lindqvist · Sports Nutrition",
      context: "DM · weekly review Sunday · active 14m ago",
      channels: [
        { name: "Rae Lindqvist", sub: "Coach · 14m", active: true, dm: true },
        { name: "#plant-based", members: 860 },
        { name: "#gut-health", members: 310 },
        { name: "#race-fueling", members: 540 },
      ],
      right: "YOUR NUTRITIONIST",
      roster: [["Rae Lindqvist", "Coach · online", true], ["You", "Member", false]],
      messages: [
        { who: "Rae L.", role: "Coach", init: "RL", time: "Mon", msg: "Logged week looks solid. Protein average 168g · carbs came in short on long-run day.", pin: true },
        { who: "You", role: "Member", init: "YO", time: "Tue", msg: "Thanks — I keep forgetting to refuel right after the run. What should I reach for?" },
        { who: "Rae L.", role: "Coach", init: "RL", time: "Tue", msg: "30g whey + 60g carbs within 45 min. If no appetite: chocolate milk + banana works. I added a post-run template in your plan.", highlight: true },
        { who: "You", role: "Member", init: "YO", time: "Wed", msg: "Maya mentioned sleep is low — she looped you in." },
        { who: "Rae L.", role: "Coach", init: "RL", time: "9:16", msg: "Saw it. Let's add magnesium glycinate 300mg at night and cut caffeine after 1pm for 2 weeks. Logging a note on your plan." },
      ],
      placeholder: "Message Rae",
    },
    client: {
      label: "Client chat",
      sub: "Your practice · members",
      header: "Clients — 34 active",
      context: "Coach view · all your members · 6 new today",
      channels: [
        { name: "Priya S.", sub: "Member · 2m · on track", active: true, dm: true },
        { name: "Jonah W.", sub: "Member · 1h · needs check-in", dm: true, warn: true },
        { name: "Ana P.", sub: "Member · 3h", dm: true },
        { name: "Marcus L.", sub: "Member · 5h", dm: true },
        { name: "Jen K.", sub: "New intake · today", dm: true, warn: true },
      ],
      right: "CONTEXT",
      roster: [["Priya S.", "Hypertrophy · wk 6/12", false], ["Streak", "14 days", false], ["Last session", "Mon · bench 4×6 @ 185", false], ["Next", "Today 17:30", false]],
      messages: [
        { who: "Priya S.", role: "Member", init: "PS", time: "8:58", msg: "Felt heavier than the number said. Set 3 was a grind." },
        { who: "You", role: "Coach", init: "MO", time: "9:02", msg: "Expected — this is the overreach week. Push 185 today, deload next week. Ice shoulder tonight.", highlight: true },
        { who: "Priya S.", role: "Member", init: "PS", time: "9:04", msg: "Got it. Anything on diet? Been low on sleep." },
        { who: "You", role: "Coach", init: "MO", time: "9:08", msg: "Looping Rae in on the sleep piece — she'll message you today.", pin: true },
        { who: "Rae L.", role: "Coach", init: "RL", time: "9:10", msg: "On it. Sending protocol this afternoon." },
      ],
      placeholder: "Message Priya",
    },
    community: {
      label: "Community chat",
      sub: "#brooklyn-runs",
      header: "#brooklyn-runs",
      context: "420 members · 3 coaches online · pinned: Saturday long run",
      channels: [
        { name: "#brooklyn-runs", members: 420, active: true },
        { name: "#strength-club", members: 1280 },
        { name: "#plant-based", members: 860 },
        { name: "#marathon-block", members: 540 },
        { name: "#mobility-minutes", members: 720 },
      ],
      right: "IN THIS ROOM",
      roster: [["Diego Alvarez", "Coach · online", true], ["Maya Okafor", "Coach · online", true], ["Priya S.", "Member", false], ["Yuki A.", "Member", false], ["Marcus L.", "Member · typing…", false], ["+ 415 more", "", false]],
      messages: [
        { who: "Diego A.", role: "Coach", init: "DA", time: "9:02", msg: "Saturday long run moved to 7:30 start — cooler temps. Meet at the Prospect entrance.", pin: true },
        { who: "Priya S.", role: "Member", init: "PS", time: "9:14", msg: "Gonna try the 10k loop this week — first time past 8. Anyone pacing ~9:30?" },
        { who: "Yuki A.", role: "Member", init: "YA", time: "9:16", msg: "I'm at 9:20 flat — happy to drop back. See you there." },
        { who: "Maya O.", role: "Coach", init: "MO", time: "9:21", msg: "Priya — if it feels fine, do the last 2k at marathon pace. If not, ride it in easy. Either answer is the right answer.", highlight: true },
        { who: "Diego A.", role: "Coach", init: "DA", time: "9:24", msg: "Weather says 52° and overcast — race-day conditions. Good day to test the kit." },
      ],
      placeholder: "Message #brooklyn-runs",
    },
  };
  const r = ROOMS[tab];
  return (
    <section style={{ padding: "110px 72px", background: PAPER, color: INK }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 44 }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Rooms · live</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(46px, 6.4vw, 72px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
            Talk to your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>coach</em>.<br />Talk to your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>people</em>.
          </h2>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.62)", maxWidth: 560, marginTop: 24 }}>
            Members and coaches, one thread. Direct lines to your trainer and nutritionist, plus rooms by city, specialty, and challenge. No algorithm, no ads.
          </p>
        </div>

        {/* tab switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[["trainer", "Trainer"], ["nutritionist", "Nutritionist"], ["client", "Client (coach view)"], ["community", "Community"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 18px", borderRadius: 2, border: tab === k ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.2)", background: tab === k ? INK : "transparent", color: tab === k ? PAPER : INK, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        <div className="cm-chat" style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, display: "grid", gridTemplateColumns: "260px 1fr 260px", minHeight: 540, overflow: "hidden" }}>
          <aside className="cm-chat-aside" style={{ borderRight: "1px solid rgba(242,237,228,0.08)", padding: "24px 0", background: "rgba(242,237,228,0.02)" }}>
            <div style={{ padding: "0 20px", fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>{r.sub.toUpperCase()}</div>
            {r.channels.map((c, i) => (
              <div key={i} style={{ padding: "10px 20px", background: c.active ? "rgba(19,194,168,0.08)" : "transparent", borderLeft: c.active ? `2px solid ${TEAL}` : "2px solid transparent", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                {c.dm && <div style={{ width: 26, height: 26, borderRadius: 999, background: c.warn ? "rgba(237,106,94,0.25)" : "rgba(242,237,228,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: INK, flexShrink: 0 }}>{c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: sans, fontSize: 13, color: INK, fontWeight: c.active ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  {(c.sub || c.members) && <div style={{ fontFamily: sans, fontSize: 10.5, color: c.warn ? "#b54d40" : "rgba(242,237,228,0.5)", marginTop: 2 }}>{c.sub || `${c.members} members`}</div>}
                </div>
              </div>
            ))}
          </aside>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
              <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: INK }}>{r.header}</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{r.context}</div>
            </div>
            <div style={{ padding: 24, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              {r.messages.map((m, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 12, alignItems: "start", padding: m.highlight ? "12px 14px" : 0, background: m.highlight ? "rgba(19,194,168,0.07)" : "transparent", borderRadius: 6, border: m.highlight ? `1px solid rgba(19,194,168,0.25)` : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: m.role === "Coach" ? TEAL : "rgba(242,237,228,0.12)", color: m.role === "Coach" ? PAPER : INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 12, fontWeight: 600 }}>{m.init}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: INK }}>{m.who}</span>
                      {m.role === "Coach" && <span style={{ fontFamily: sans, fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(19,194,168,0.12)", color: TEAL, letterSpacing: "0.06em" }}>COACH</span>}
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: "rgba(242,237,228,0.45)" }}>{m.time}</span>
                      {m.pin && <span style={{ fontFamily: mono, fontSize: 10, color: TEAL }}>📌 PINNED</span>}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.5, color: "rgba(242,237,228,0.85)", marginTop: 4 }}>{m.msg}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 18, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", gap: 10, alignItems: "center", background: "rgba(242,237,228,0.02)" }}>
              <input placeholder={r.placeholder} style={{ flex: 1, background: INK_DEEP, border: "1px solid rgba(242,237,228,0.12)", padding: "12px 16px", borderRadius: 2, color: INK, fontFamily: sans, fontSize: 13.5, outline: "none" }} />
              <button style={{ background: TEAL, color: PAPER, border: 0, padding: "12px 22px", borderRadius: 2, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Send</button>
            </div>
          </div>

          <aside className="cm-chat-aside" style={{ borderLeft: "1px solid rgba(242,237,228,0.08)", padding: 24, background: "rgba(242,237,228,0.02)" }}>
            <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>{r.right}</div>
            {r.roster.map(([n, s, coach], i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", alignItems: "center" }}>
                <div style={{ width: 26, height: 26, borderRadius: 999, background: coach ? TEAL : "rgba(242,237,228,0.12)", fontFamily: sans, fontSize: 10, fontWeight: 600, color: coach ? PAPER : INK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 12.5, color: INK }}>{n}</div>
                  {s && <div style={{ fontFamily: sans, fontSize: 10.5, color: "rgba(242,237,228,0.5)" }}>{s}</div>}
                </div>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Community() {
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/intro/community%203.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Community" />
        <HeroC />
        <LiveActivity />
        <Events />
        <Chat />
        <Challenges />
        <CTA />
        <Footer />
      </div>
      <style>{`
        @media (max-width: 980px) {
          .cm-hero { grid-template-columns: 1fr !important; gap: 28px !important; }
          .cm-3 { grid-template-columns: 1fr 1fr !important; }
          .cm-2 { grid-template-columns: 1fr !important; }
          .cm-chat { grid-template-columns: 1fr !important; }
          .cm-chat-aside { display: none !important; }
        }
        @media (max-width: 620px) {
          .cm-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Community />);
