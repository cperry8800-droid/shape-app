// About page — personal, mission-driven story page.
// Standard marketing shell (Header + Footer from pageShell.jsx).

function AboutHero() {
  return (
    <section style={{ padding: "40px 72px 100px", position: "relative", overflow: "hidden", minHeight: "72vh", display: "flex", alignItems: "center" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 14px", borderRadius: 999, background: "rgba(10,197,168,0.12)", border: "1px solid rgba(10,197,168,0.35)", fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 32 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL }}></span>
          About Shape
        </div>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(48px, 7vw, 104px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.94, color: INK }}>
          A community<br />
          for <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>shaping</em> your life.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.74)", margin: "36px auto 0", maxWidth: 720, lineHeight: 1.65 }}>
          Shape isn't a fitness app. It's a place to shape your whole life — your routines, your meals, your music, your mindset, your community. The workouts are part of it. So are the people you cook beside, the playlists that get you out the door, the habits you finally make stick, and the coach who picks up the phone when you need one.
        </p>
      </div>
    </section>
  );
}

function AboutLetter() {
  return (
    <section style={{ padding: "100px 72px 120px", background: INK, color: PAPER, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Why Shape exists</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(34px, 4.4vw, 56px)", letterSpacing: "-0.03em", fontWeight: 300, margin: 0, lineHeight: 1.05, color: PAPER }}>
          Not just fitness — a way to <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>shape your life</em>.
        </h2>
        <div style={{ marginTop: 36, fontFamily: serif, fontSize: 19, lineHeight: 1.75, color: "rgba(26,22,18,0.86)" }}>
          <p style={{ margin: "0 0 22px" }}>
            {`"Getting in shape" has been reduced to a workout plan and a calorie count for too long. Real life is bigger than that. It's how you sleep, what you cook, the music that moves you, the way you talk to yourself on hard days, the people you spend Saturday with. Shape is a place to work on all of it — not a fitness app pretending to be more.`}
          </p>
          <p style={{ margin: "0 0 22px" }}>
            That starts with the coach. Having a great one shouldn't be a luxury. Most apps replace the coach with a chatbot; most gyms gate the good ones behind packages. We thought there was a better way: open the door for coaches who actually care, and make personal coaching affordable for the rest of us. The platform fee is flat. The coach is real. The rate is theirs.
          </p>
          <p style={{ margin: "0 0 22px" }}>
            Then we built the rest of the loop around it: meal plans you actually follow, habits you actually stick to, a soundtrack that gets you out the door (that's Shape Radio), and a place to write down what you're shaping toward — strength, sleep, calm, confidence, a marathon, just feeling like yourself again. Structure when you need it. Discipline you build, not something handed down.
          </p>
          <p style={{ margin: "0 0 22px" }}>
            And then there's the part no app gets right: <em style={{ fontStyle: "italic", color: TEAL_BRIGHT, fontWeight: 500 }}>the community</em>. You can keep your journey private. Or you can share it — what you cooked, what you lifted, what your coach said this week — and have a community that actually shows up for you. Tips, recipes, recommendations, coaches worth trying. A whole feed of people figuring out the same things you are.
          </p>
          <p style={{ margin: 0 }}>
            That's it. Shape is the place where you find the coach, build the habits, hear the music, and meet the people. The rest is just showing up.
          </p>
        </div>
      </div>
    </section>
  );
}

function AboutPillars() {
  const items = [
    {
      h: "Personal coaching, lower cost",
      p: "Browse, message, and hire vetted trainers and nutritionists before you pay anything. $5/mo flat to the platform. Your coach sets their own rate and gets paid directly.",
    },
    {
      h: "A real community",
      p: "Share your week if you want to — or don't. Either way, you can find tips, recipes, recommended coaches, and people who get what you're trying to do.",
    },
    {
      h: "Shape Radio + the soundtrack",
      p: "Ad-free mixes built for movement, included with every membership. Your coach can drop a playlist onto a workout and it plays right on the card.",
    },
    {
      h: "Lifestyle, structured",
      p: "Habit tracking, grocery lists that build themselves, meal plans you actually follow, Shape Score that reads the truth at the end of the week. Build the good ones. Break the bad ones.",
    },
    {
      h: "Goals that are yours",
      p: "Tell us what you're shaping toward — strength, weight, sleep, calm, a marathon, just feeling like yourself again. We help you plan around it and your coach holds the line.",
    },
    {
      h: "Public if you want, private always",
      p: "Your data is yours. Share your progress with the community when you feel like it. Keep it locked when you don't. There's no algorithm pushing you to overshare.",
    },
  ];
  return (
    <section style={{ padding: "120px 72px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>What you get</div>
          <h3 style={{ fontFamily: serif, fontSize: "clamp(30px, 4vw, 48px)", letterSpacing: "-0.025em", fontWeight: 300, margin: 0, lineHeight: 1.05 }}>
            One app for the <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>whole loop</em>.
          </h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36, rowGap: 48 }}>
          {items.map((it, i) => (
            <div key={i} style={{ borderTop: `1px solid rgba(242,237,228,0.12)`, paddingTop: 22 }}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: TEAL_BRIGHT, marginBottom: 14 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.01em", fontWeight: 400, color: INK, lineHeight: 1.22, marginBottom: 12 }}>{it.h}</div>
              <p style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.66)", lineHeight: 1.65, margin: 0 }}>{it.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutStats() {
  const stats = [
    { k: "$5", l: "flat platform fee — that's it" },
    { k: "100%", l: "vetted before going live" },
    { k: "0", l: "lock-in. Cancel anytime." },
  ];
  return (
    <section style={{ padding: "30px 72px 100px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, justifyItems: "center", textAlign: "center" }}>
        {stats.map((s) => (
          <div key={s.k} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.035em", fontWeight: 300, lineHeight: 1, color: INK }}>{s.k}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 12, lineHeight: 1.55, maxWidth: 220 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AboutCTA() {
  return (
    <section style={{ padding: "40px 72px 140px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <h3 style={{ fontFamily: serif, fontSize: "clamp(32px, 4.4vw, 54px)", letterSpacing: "-0.03em", fontWeight: 300, margin: 0, lineHeight: 1.05 }}>
          Come <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>shape</em> with us.
        </h3>
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.6)", maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6 }}>
          Find your coach, set your goals, hear the music, meet the people. The rest is just showing up.
        </p>
        <div style={{ marginTop: 36, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="Marketplace.html" style={{ padding: "16px 30px", borderRadius: 2, background: TEAL, color: PAPER, fontFamily: sans, fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}>Find your coach →</a>
          <a href="SignupTrainer.html" style={{ padding: "16px 30px", borderRadius: 2, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}>Apply as a coach</a>
        </div>
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh" }}>
      <Header active="About" />
      <AboutHero />
      <AboutLetter />
      <AboutPillars />
      <AboutStats />
      <AboutCTA />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
