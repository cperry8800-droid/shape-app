// About page — personal, mission-driven story page.
// Standard marketing shell (Header + Footer from pageShell.jsx).

function AboutHero() {
  return (
    <section style={{ padding: "40px 72px 30px", position: "relative", overflow: "hidden", minHeight: "62vh", display: "flex", alignItems: "center" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", width: "100%", textAlign: "center" }}>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(48px, 7vw, 104px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.94, color: INK }}>
          A place<br />
          for helping <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${TEAL}` }}>shape</em> a lifestyle
        </h1>
        <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.74)", margin: "36px auto 0", maxWidth: 720, lineHeight: 1.65 }}>
          Your trainer already mapped out the next few weeks. Your nutritionist's plan became a grocery list before you thought to ask. When you open the workout card, the music starts — your coach picked it for that session. Shape Score watches all of it. Miss a day, it knows. Build a streak, it shows. The community isn't moderated positivity — it's people who are also mid-loop, figuring it out in real time. Nobody here is finished. That's the point.
        </p>
        {/* Connector cue down to the letter section. */}
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }} aria-hidden="true">
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>A letter</span>
          <span style={{ width: 1, height: 56, background: `linear-gradient(to bottom, transparent, ${TEAL})`, display: "block" }} />
        </div>
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
    <section style={{ color: INK, position: "relative", padding: "80px 24px 140px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(26px, 3vw, 38px)", letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 8px", lineHeight: 1.15, color: INK, textAlign: "center", fontStyle: "italic" }}>
          <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>Fitness</em> is the entry point. Your <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>lifestyle</em> is the goal.
        </h2>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18, marginBottom: 48 }}>
          <span style={{ width: 24, height: 1, background: "rgba(242,237,228,0.25)" }} />
        </div>

        <p style={para}>
          <span style={dropStyle}>S</span>hape is about exactly what its name suggests — shaping your life into what you want it to be. Your routines, your sleep, what you cook, the music that moves you, how you talk to yourself on hard days, the people you spend Saturday with. We built Shape to be the place where you can work on all of it, on your own terms.
        </p>

        <p style={para}>
          It starts with a coach. Having great ones shouldn't be a luxury. Most apps replace them with chatbots; most gyms gate the good ones behind packages. We thought there was a better way: open the door for trainers, nutritionists, and registered dietitians who actually care, and make that level of guidance affordable for the rest of us.
        </p>

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
          Shape is the place where you find the coach, build the habits, earn your score, hear the music, and meet the people. The rest is just showing up.
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
  const [scrollFade, setScrollFade] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // Fade the spotlight in over the first 700px of scroll, then hold full.
        const t = Math.min(1, Math.max(0, window.scrollY / 700));
        setScrollFade(t);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const stars = React.useMemo(() => {
    const rand = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };
    const out = [];
    for (let i = 0; i < 220; i++) {
      out.push(<circle key={`s${i}`} cx={`${rand(i * 1.3) * 100}%`} cy={`${rand(i * 2.7 + 1) * 100}%`} r={rand(i * 3.1 + 2) * 0.7 + 0.3} fill="#e8eeff" opacity={0.35 + rand(i * 4.1) * 0.35} />);
    }
    for (let i = 0; i < 60; i++) {
      out.push(<circle key={`m${i}`} cx={`${rand(i * 5.7 + 90) * 100}%`} cy={`${rand(i * 6.3 + 17) * 100}%`} r={rand(i * 7.1) * 0.8 + 0.9} fill="#ffffff" opacity={0.65 + rand(i * 8.3) * 0.3} />);
    }
    for (let i = 0; i < 14; i++) {
      const cx = `${rand(i * 11.7 + 5) * 100}%`;
      const cy = `${rand(i * 13.3 + 9) * 100}%`;
      const dur = 2.5 + rand(i * 17) * 2.5;
      out.push(
        <circle key={`b${i}`} cx={cx} cy={cy} r={1.6 + rand(i * 19) * 0.8} fill="#ffffff">
          <animate attributeName="opacity" values="0.6;1;0.6" dur={`${dur}s`} repeatCount="indefinite" />
        </circle>
      );
    }
    return out;
  }, []);
  return (
    <div style={{ background: "#05070d", color: INK, fontFamily: sans, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Night-sky base — deep navy fading to near-black at the horizon. */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "radial-gradient(ellipse 120% 90% at 50% 0%, #142036 0%, #0a1020 35%, #050810 70%, #02030a 100%)",
      }} />
      {/* Moon glow — soft luminous halo top-center, fades in on scroll. */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.55 + scrollFade * 0.35,
        transition: "opacity .2s ease-out",
        background: "radial-gradient(circle 480px at 78% 14%, rgba(232,238,255,0.22) 0%, rgba(232,238,255,0.10) 30%, rgba(232,238,255,0.04) 55%, transparent 75%)",
      }} />
      {/* Distant nebula — faint teal/violet wash for depth. */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 50% at 18% 70%, rgba(10,197,168,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 45% at 82% 80%, rgba(120,90,200,0.10) 0%, transparent 60%)",
      }} />
      {/* Starfield — three layers (small/medium/bright) for parallax depth. */}
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" style={{ position: "fixed", inset: 0, zIndex: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {stars}
      </svg>
      {/* Shooting star — slow diagonal sweep. */}
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" style={{ position: "fixed", inset: 0, zIndex: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          <linearGradient id="shootTrail" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0.5)" />
            <stop offset="100%" stopColor="rgba(255,255,255,1)" />
          </linearGradient>
        </defs>
        <g opacity="0">
          <line x1="0" y1="0" x2="120" y2="0" stroke="url(#shootTrail)" strokeWidth="1.4" strokeLinecap="round" />
          <animateTransform attributeName="transform" type="translate" values="-200,80; 1600,520" dur="8s" begin="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.05;0.1;0.85;1" dur="8s" begin="3s" repeatCount="indefinite" />
        </g>
      </svg>
      {/* Subtle star-grain — faint twinkle texture using fractal noise. */}
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        width: "100%",
        height: "100%",
        opacity: 0.08,
        pointerEvents: "none",
      }}>
        <filter id="aboutNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#aboutNoise)" />
      </svg>
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="About" />
        <AboutHero />
        <AboutLetter />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
