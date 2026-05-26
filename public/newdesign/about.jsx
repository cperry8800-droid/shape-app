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
          for <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>shaping</em> a lifestyle.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.74)", margin: "36px auto 0", maxWidth: 720, lineHeight: 1.65 }}>
          Shape isn't just a fitness app or platform. It's where your trainer loads tomorrow's workout tonight, your nutritionist's meal plan turns into a grocery list, and the playlist attached to leg day starts playing the moment you open the card. Every workout you complete, every habit you build or stop, every day you show up — your Shape Score is keeping track. The more consistent you are, the higher your status climbs. The community isn't a forum — it's the people in your loop. Shape is where your lifestyle actually takes shape.
        </p>
      </div>
    </section>
  );
}

// Scroll-scrubbed sticky stage — same pattern as the index "Loop" section.
// One pinned stage holds N beats absolutely-positioned over each other. As
// the user scrolls past the outer wrapper, an rAF loop calculates progress
// and toggles which beat is "on" (opacity 1). The wrapper height = N * 100vh
// so the visitor scrolls through one full screen per beat while the stage
// stays pinned to the top.
const ABOUT_BEATS = [
  {
    ix: "01 — Start",
    h: <>Shape is about exactly what its name <b>suggests.</b></>,
    p: "Shaping your life into what you want it to be. Your routines, your sleep, your music, your meals, your mindset, your people. We built Shape so you can work on all of it — on your own terms.",
  },
  {
    ix: "02 — Coach",
    h: <>Real coaches. <b>Real rates.</b></>,
    p: "Personal coaching shouldn't be a luxury. We opened the door for trainers, nutritionists, and dietitians who actually care — and made that level of guidance affordable for the rest of us. The platform fee is flat. The coach is real. The rates are theirs.",
  },
  {
    ix: "03 — Train",
    h: <>Written <b>before</b> you arrive.</>,
    p: "Your trainer programs your week the night before — every set, every tempo, every cue. No deciding at the rack. No guesswork. Just open the card and move.",
  },
  {
    ix: "04 — Eat",
    h: <>The plan, <b>on your plate.</b></>,
    p: "Your nutritionist builds a meal plan around your specific goals — macros, restrictions, a health condition, or just eating better. It turns into a grocery list you can actually shop from. Your dietitian adjusts as your body changes.",
  },
  {
    ix: "05 — Score",
    h: <>Not a vanity metric. <b>A mirror.</b></>,
    p: "Every workout you complete, every habit you build, every day you show up — your Shape Score keeps track. The more consistent you are, the higher your status climbs. It reflects the work you've actually done.",
  },
  {
    ix: "06 — Community",
    h: <>The people <b>in your loop.</b></>,
    p: "Keep your journey private — or share it. What you cooked, what your nutritionist recommended, what you lifted, what your coach said. The community isn't a forum. It's the people figuring out the same things you are.",
  },
  {
    ix: "07 — Show up",
    h: <>The rest is just <b>showing up.</b></>,
    p: "Find the coach. Build the habits. Hear the music. Meet the people. Shape is where your lifestyle actually takes shape.",
  },
];

function AboutLetter() {
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    let raf;
    const compute = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Clamp before / within / after the pinned stage.
      let idx;
      if (r.top > 0) {
        idx = 0; // not reached yet — show the first beat
      } else if (r.bottom < window.innerHeight) {
        idx = ABOUT_BEATS.length - 1; // scrolled past — hold the last
      } else {
        const prog = -r.top / Math.max(1, el.offsetHeight - window.innerHeight);
        idx = Math.min(
          ABOUT_BEATS.length - 1,
          Math.max(0, Math.floor(prog * ABOUT_BEATS.length))
        );
      }
      setActive((cur) => (cur !== idx ? idx : cur));
    };
    const tick = () => { compute(); raf = requestAnimationFrame(tick); };
    compute(); // initial pass so beat 0 is correctly chosen on first paint
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section style={{ background: INK, color: PAPER, position: "relative" }}>
      <div ref={wrapRef} style={{ height: `${ABOUT_BEATS.length * 100}vh`, position: "relative" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", display: "grid", placeItems: "center", overflow: "hidden", padding: "0 72px" }}>
          {/* Persistent eyebrow + chapter counter */}
          <div style={{ position: "absolute", top: 120, left: 72, right: 72, display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1240, margin: "0 auto", width: "calc(100% - 144px)" }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL }}>Why Shape exists</div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", color: "rgba(26,22,18,0.5)" }}>{String(active + 1).padStart(2, "0")} / {String(ABOUT_BEATS.length).padStart(2, "0")}</div>
          </div>

          {/* All beats stacked; only the active one is opaque */}
          {ABOUT_BEATS.map((b, i) => (
            <div key={i} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "0 72px", opacity: i === active ? 1 : 0, transition: "opacity .55s ease, transform .55s ease", transform: i === active ? "translateY(0)" : "translateY(20px)", pointerEvents: i === active ? "auto" : "none" }}>
              <div style={{ maxWidth: 880, textAlign: "left" }}>
                <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.28em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 16 }}>{b.ix}</div>
                <h2 className="about-beat-h" style={{ fontFamily: serif, fontSize: "clamp(40px, 6.4vw, 88px)", letterSpacing: "-0.035em", fontWeight: 300, margin: 0, lineHeight: 0.98, color: PAPER }}>
                  {b.h}
                </h2>
                <p style={{ marginTop: 26, maxWidth: 560, color: "rgba(26,22,18,0.78)", fontSize: 17, lineHeight: 1.65, fontFamily: sans }}>{b.p}</p>
              </div>
            </div>
          ))}

          {/* Progress dots */}
          <div style={{ position: "absolute", bottom: 64, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8 }}>
            {ABOUT_BEATS.map((_, i) => (
              <span key={i} style={{ width: i === active ? 22 : 8, height: 4, borderRadius: 4, background: i === active ? TEAL_BRIGHT : "rgba(26,22,18,0.25)", transition: "width .25s ease, background .25s ease" }} />
            ))}
          </div>
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
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.6)", maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6 }}>
          Find your coach, set your goals, hear the music, meet the people. The rest is just showing up.
        </p>
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh" }}>
      <Header active="About" />
      <AboutLetter />
      <AboutCTA />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
