// About page — personal, mission-driven story page.
// Standard marketing shell (Header + Footer from pageShell.jsx).

function AboutHero() {
  return (
    <section style={{ padding: "40px 72px 30px", position: "relative", overflow: "hidden", minHeight: "62vh", display: "flex", alignItems: "center" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", width: "100%", textAlign: "center" }}>
        <h1 style={{
          fontFamily: serif,
          fontSize: "clamp(52px, 7.4vw, 112px)",
          letterSpacing: "-0.045em",
          fontWeight: 300,
          fontVariationSettings: "'opsz' 144",
          margin: 0,
          lineHeight: 0.92,
          color: INK,
          textRendering: "geometricPrecision",
        }}>
          A&nbsp;place<br />
          for helping <em style={{ fontStyle: "italic", fontWeight: 400, color: "transparent", WebkitTextStroke: `1.4px ${TEAL}` }}>shape</em> a&nbsp;lifestyle
        </h1>
        <p style={{ fontFamily: serif, fontSize: 22, fontStyle: "italic", fontWeight: 300, letterSpacing: "-0.005em", color: "rgba(242,237,228,0.82)", margin: "44px auto 0", maxWidth: 760, lineHeight: 1.55 }}>
          Your trainer already mapped out the next few weeks. Your nutritionist's plan became a grocery list before you thought to ask. When you open the workout card, the music starts — your coach picked it for that session. Shape Score watches all of it. Miss a day, it knows. Build a streak, it shows. The community isn't moderated positivity — it's people who are also mid-loop, figuring it out in real time. Nobody here is finished. That's the point.
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
    <section style={{ color: INK, position: "relative", padding: "80px 24px 36px" }}>
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

        <p style={{ ...para, marginBottom: 0 }}>
          Shape is the place where you find the coach, build the habits, earn your score, hear the music, and meet the people. The rest is just showing up.
        </p>
      </div>
    </section>
  );
}

// Closing sign-off — the very last thing on the page (under the positioning).
// The letter is FROM someone: the founder portrait + name replace the old
// anonymous "— The Shape team" line (trust signal — a platform asking for
// money + health data signs its letter).
function AboutSignoff() {
  return (
    <section style={{ padding: "8px 72px 120px", textAlign: "center" }}>
      <img
        src="/newdesign/founder.webp"
        alt="Chris Perry, founder of Shape"
        width="112" height="112"
        loading="lazy"
        style={{ width: 112, height: 112, borderRadius: 18, objectFit: "cover", display: "block", margin: "0 auto 18px", border: "1px solid rgba(242,237,228,0.22)", boxShadow: `0 0 0 3px rgba(46,224,196,0.12)` }}
      />
      <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 600, fontSize: 21, color: "rgba(242,237,228,0.92)", lineHeight: 1.2 }}>— Chris Perry</div>
      <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL_BRIGHT, marginTop: 8 }}>Founder · The Shape Community</div>
    </section>
  );
}

function AboutVision() {
  const colHead = { fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 14 };
  const colTitle = { fontFamily: serif, fontSize: 26, fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.02em", color: INK, lineHeight: 1.12, marginBottom: 16 };
  const colBody = { fontFamily: serif, fontSize: 17, fontStyle: "italic", fontWeight: 300, color: "rgba(242,237,228,0.8)", lineHeight: 1.62, margin: 0 };
  return (
    <section style={{ padding: "26px 72px 60px", position: "relative" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <span style={{ width: 24, height: 1, background: "rgba(242,237,228,0.25)" }} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: serif, fontSize: "clamp(26px, 3.6vw, 42px)", fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.02em", color: TEAL, marginBottom: 18, lineHeight: 1.05 }}>The idea.</div>
          <h3 style={{ fontFamily: serif, fontSize: "clamp(30px, 4.4vw, 56px)", letterSpacing: "-0.03em", fontWeight: 300, fontStyle: "italic", margin: 0, lineHeight: 1.04 }}>
            The platform coaches build their <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>business</em> on.
            <br />The <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>social network</em> for coaching, training and nutrition.
          </h3>
        </div>
        <div className="about-vision-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
          {/* Coach-first: the wedge. Shape is the business + the social media for coaches. */}
          <div style={{ borderTop: `2px solid ${TEAL}`, paddingTop: 24 }}>
            <div style={colHead}>For coaches</div>
            <div style={colTitle}>Your business and your audience — one home.</div>
            <p style={colBody}>Run your whole practice — clients, programs, payments — and build your following on the social platform made for coaching, training, and nutrition. Your content, your clients, your income, in one place: not five apps and the wrong crowd. Here, everyone's already training — so your audience is the right one. This is where a coaching business is built and seen.</p>
          </div>
          {/* Members: the retention engine. The social loop keeps people here. */}
          <div style={{ borderTop: `2px solid ${TEAL}`, paddingTop: 24 }}>
            <div style={colHead}>For members</div>
            <div style={colTitle}>A training life that's actually social.</div>
            <p style={colBody}>Real coaches, plans that are yours, and people training alongside you who are mid-loop too. Not a highlight reel — the day-to-day of getting better, shared with the ones in your corner. The coach gets you started; the community keeps you here.</p>
          </div>
        </div>
        <p style={{ fontFamily: serif, fontSize: 19, fontStyle: "italic", color: "rgba(242,237,228,0.72)", textAlign: "center", maxWidth: 720, margin: "56px auto 0", lineHeight: 1.6 }}>
          Coaches bring the people. The people build the place. <em style={{ color: TEAL_BRIGHT }}>That's the whole idea.</em>
        </p>
      </div>
    </section>
  );
}

function AboutCTA() {
  return (
    <section style={{ padding: "40px 72px 140px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <h3 style={{ fontFamily: serif, fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.035em", fontWeight: 300, fontStyle: "italic", margin: 0, lineHeight: 1.0 }}>
          Join the <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>community.</em>
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
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Spotlight gradient — soft cream glow that fades in as the visitor
          scrolls past the hero, so the letter section reads as "lit". */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: `radial-gradient(ellipse 140% 160% at 50% 45%, rgba(242,237,228,0.12) 0%, rgba(242,237,228,0.10) 30%, rgba(242,237,228,0.07) 60%, rgba(242,237,228,0.04) 85%, rgba(242,237,228,0.02) 100%)`,
        opacity: scrollFade,
        transition: "opacity .2s ease-out",
        pointerEvents: "none",
      }} />
      {/* Paper-stock tone gradient — warm cream tint top-left, cooler shadow bottom-right.
          Layered above the spotlight so the page feels like printed stock, not flat black. */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: `linear-gradient(135deg, rgba(242,237,228,0.11) 0%, rgba(242,237,228,0.05) 30%, transparent 55%, rgba(11,14,12,0.42) 100%)`,
      }} />
      {/* Horizontal masthead + footer rules — frame the page like a print spread. */}
      <div aria-hidden style={{
        position: "fixed",
        top: 96,
        left: 0,
        right: 0,
        height: 1,
        zIndex: 0,
        pointerEvents: "none",
        background: "linear-gradient(to right, transparent 0%, rgba(242,237,228,0.28) 18%, rgba(242,237,228,0.28) 82%, transparent 100%)",
      }} />
      <div aria-hidden style={{
        position: "fixed",
        bottom: 24,
        left: 0,
        right: 0,
        height: 1,
        zIndex: 0,
        pointerEvents: "none",
        background: "linear-gradient(to right, transparent 0%, rgba(242,237,228,0.28) 18%, rgba(242,237,228,0.28) 82%, transparent 100%)",
      }} />
      {/* Film grain — fine SVG noise. Dominant texture for the editorial feel. */}
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        width: "100%",
        height: "100%",
        opacity: 0.22,
        pointerEvents: "none",
        mixBlendMode: "overlay",
      }}>
        <filter id="aboutNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.75 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#aboutNoise)" />
      </svg>
      {/* Hairline column rules — faint editorial column guides. */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "repeating-linear-gradient(to right, transparent 0, transparent calc(50% - 380px), rgba(242,237,228,0.06) calc(50% - 380px), rgba(242,237,228,0.06) calc(50% - 379px), transparent calc(50% - 379px), transparent calc(50% + 379px), rgba(242,237,228,0.06) calc(50% + 379px), rgba(242,237,228,0.06) calc(50% + 380px), transparent calc(50% + 380px))",
      }} />
      {/* Printer's crop marks — small L-shaped ticks at the four corners,
          like a magazine spread proof. Quiet but unmistakably editorial. */}
      {[
        { pos: { top: 112, left: 40 },   lines: [[0,0,0,18],[0,0,18,0]] },
        { pos: { top: 112, right: 40 },  lines: [[18,0,18,18],[18,0,0,0]] },
        { pos: { bottom: 40, left: 40 }, lines: [[0,18,0,0],[0,18,18,18]] },
        { pos: { bottom: 40, right: 40 },lines: [[18,18,18,0],[18,18,0,18]] },
      ].map((c, i) => (
        <svg key={i} aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" style={{ position: "fixed", width: 18, height: 18, zIndex: 0, pointerEvents: "none", opacity: 0.55, ...c.pos }}>
          {c.lines.map((l, j) => (
            <line key={j} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke={TEAL_BRIGHT} strokeWidth="1" />
          ))}
        </svg>
      ))}
      {/* Side rail with periodic tick marks — like a typeset measuring rule. */}
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" style={{ position: "fixed", left: 22, top: 160, bottom: 60, width: 12, zIndex: 0, pointerEvents: "none", opacity: 0.35 }}>
        <line x1="6" y1="0" x2="6" y2="100%" stroke="rgba(242,237,228,0.45)" strokeWidth="0.6" />
        <g stroke="rgba(242,237,228,0.55)" strokeWidth="0.8">
          <line x1="0" y1="0%" x2="12" y2="0%" />
          <line x1="2" y1="20%" x2="10" y2="20%" />
          <line x1="2" y1="40%" x2="10" y2="40%" />
          <line x1="2" y1="60%" x2="10" y2="60%" />
          <line x1="2" y1="80%" x2="10" y2="80%" />
          <line x1="0" y1="100%" x2="12" y2="100%" />
        </g>
      </svg>
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" style={{ position: "fixed", right: 22, top: 160, bottom: 60, width: 12, zIndex: 0, pointerEvents: "none", opacity: 0.35 }}>
        <line x1="6" y1="0" x2="6" y2="100%" stroke="rgba(242,237,228,0.45)" strokeWidth="0.6" />
        <g stroke="rgba(242,237,228,0.55)" strokeWidth="0.8">
          <line x1="0" y1="0%" x2="12" y2="0%" />
          <line x1="2" y1="20%" x2="10" y2="20%" />
          <line x1="2" y1="40%" x2="10" y2="40%" />
          <line x1="2" y1="60%" x2="10" y2="60%" />
          <line x1="2" y1="80%" x2="10" y2="80%" />
          <line x1="0" y1="100%" x2="12" y2="100%" />
        </g>
      </svg>
      <div style={{ position: "relative", zIndex: 1 }}>
        <style>{`@media (max-width: 720px) { .about-vision-grid { grid-template-columns: 1fr !important; gap: 36px !important; } }`}</style>
        <Header active="About" />
        <AboutHero />
        <AboutVision />
        <AboutLetter />
        <AboutSignoff />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
