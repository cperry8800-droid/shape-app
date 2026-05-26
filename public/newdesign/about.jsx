// About page — personal, mission-driven story page.
// Standard marketing shell (Header + Footer from pageShell.jsx).

function AboutHero() {
  return (
    <section style={{ padding: "40px 72px 100px", position: "relative", overflow: "hidden", minHeight: "72vh", display: "flex", alignItems: "center" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", width: "100%", textAlign: "center" }}>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(48px, 7vw, 104px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.94, color: INK }}>
          A community<br />
          for <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${TEAL}` }}>shaping</em> a lifestyle.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.74)", margin: "36px auto 0", maxWidth: 720, lineHeight: 1.65 }}>
          Shape isn't just a fitness app or platform. It's where your trainer loads tomorrow's workout tonight, your nutritionist's meal plan turns into a grocery list, and the playlist attached to leg day starts playing the moment you open the card. Every workout you complete, every habit you build or stop, every day you show up — your Shape Score is keeping track. The more consistent you are, the higher your status climbs. The community isn't a forum — it's the people in your loop. Shape is where your lifestyle actually takes shape.
        </p>
      </div>
    </section>
  );
}

function AboutLetter() {
  const dropStyle = {
    float: "left",
    fontFamily: serif,
    fontSize: 96,
    lineHeight: 0.85,
    fontWeight: 400,
    color: TEAL,
    padding: "6px 14px 0 0",
    marginTop: 8,
  };
  const para = {
    fontFamily: serif,
    fontSize: 20,
    lineHeight: 1.75,
    color: "rgba(242,237,228,0.86)",
    margin: "0 0 28px",
  };
  const pullBase = {
    fontFamily: serif,
    fontStyle: "italic",
    fontSize: "clamp(32px, 4.4vw, 54px)",
    lineHeight: 1.12,
    letterSpacing: "-0.02em",
    fontWeight: 400,
    color: INK,
    margin: "44px 0",
    padding: "10px 0",
  };
  return (
    <section style={{ background: PAPER, color: INK, position: "relative", padding: "120px 24px 140px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 18, textAlign: "center" }}>Why Shape exists</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(38px, 5.6vw, 76px)", letterSpacing: "-0.03em", fontWeight: 300, margin: "0 0 8px", lineHeight: 1.0, color: INK, textAlign: "center" }}>
          Not just fitness — a way to <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>shape</em> a <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>lifestyle</em> you want.
        </h2>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 56 }}>
          <span style={{ width: 36, height: 2, background: TEAL, opacity: 0.7 }} />
        </div>

        <p style={para}>
          <span style={dropStyle}>S</span>hape is about exactly what its name suggests — shaping your life into what you want it to be. Your routines, your sleep, what you cook, the music that moves you, how you talk to yourself on hard days, the people you spend Saturday with. We built Shape to be the place where you can work on all of it, on your own terms.
        </p>

        <p style={para}>
          It starts with a coach — and the nutritionist. Having great ones shouldn't be a luxury. Most apps replace them with chatbots; most gyms gate the good ones behind packages. We thought there was a better way: open the door for trainers, nutritionists, and registered dietitians who actually care, and make that level of guidance affordable for the rest of us.
        </p>

        <aside style={{ ...pullBase, marginLeft: "-80px", paddingLeft: 24, borderLeft: `3px solid ${TEAL}` }}>
          The platform fee is flat. The coach is real. The rates are theirs.
        </aside>

        <p style={para}>
          Shape builds the loop around all of it. Your trainer programs your week before you arrive — every set, every tempo, every cue loaded the night before so you're never standing at the rack wondering what's next. Your nutritionist builds a meal plan around your specific goals — whether that's hitting a macro target, managing a dietary restriction, building around a health condition, or just eating better — and that plan turns into a grocery list you can actually shop from.
        </p>

        <p style={para}>
          As you show up — day after day, workout after workout, habit after habit — your Shape Score rises with you. It tracks your consistency, rewards your effort, and reflects the status you've actually earned.
        </p>

        <aside style={{ ...pullBase, marginRight: "-80px", paddingRight: 24, borderRight: `3px solid ${TEAL}`, textAlign: "right" }}>
          Not a vanity metric. <em style={{ color: TEAL_BRIGHT }}>A mirror.</em>
        </aside>

        <p style={para}>
          There's also a place to write down what you're shaping toward — strength, sleep, calm, confidence, a marathon, a specific body composition goal, just feeling like yourself again. Structure when you need it. Discipline you build, not something handed down.
        </p>

        <p style={para}>
          And then there's the part no app gets right: <em style={{ fontStyle: "italic", color: TEAL_BRIGHT, fontWeight: 500 }}>the community</em>. You can keep your journey private — or share it. What you cooked, what your nutritionist recommended this week, what you lifted, what your coach said. Tips, recipes, nutrition advice, coaches and dietitians worth trying. A whole feed of people figuring out the same things you are.
        </p>

        <aside style={{ ...pullBase, marginLeft: "-80px", paddingLeft: 24, borderLeft: `3px solid ${TEAL}` }}>
          The community isn't a forum. It's the people in your loop.
        </aside>

        <p style={{ ...para, marginBottom: 48 }}>
          Shape is the place where you find the coach, work with the nutritionist, build the habits, earn your score, hear the music, and meet the people. The rest is just showing up.
        </p>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <span style={{ width: 24, height: 2, background: "rgba(242,237,228,0.25)" }} />
        </div>
        <div style={{ textAlign: "center", fontFamily: serif, fontStyle: "italic", fontSize: 16, color: "rgba(242,237,228,0.6)" }}>
          — The Shape team
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
            One place for the <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>whole loop</em>.
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

function AboutCTA() {
  return (
    <section style={{ padding: "40px 72px 140px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <h3 style={{ fontFamily: serif, fontSize: "clamp(32px, 4.4vw, 54px)", letterSpacing: "-0.03em", fontWeight: 300, margin: 0, lineHeight: 1.05 }}>
          Come <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>shape</em> with us.
        </h3>
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
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
