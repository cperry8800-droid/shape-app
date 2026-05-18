// Landing — role selector, Spatial Cinema language. Four paths: Client, Trainer, Nutritionist, Radio.
// Uses shared tokens from pageShell.jsx (PAPER, INK, INK_DEEP, TEAL, TEAL_BRIGHT, RUST, serif, sans, mono).

const ROLES = [
  {
    key: "client",
    kicker: "For members",
    title: "Client",
    blurb: "Browse trainers and nutritionists, get workouts, subscribe to the pros who get you.",
    cta: "Get started",
    href: "SignupClient.html",
    meta: "$5 / month platform",
    perks: ["Every coach, one app", "Workouts + meals in one place", "Cancel any time"],
  },
  {
    key: "trainer",
    kicker: "For coaches",
    title: "Personal Trainer",
    blurb: "Build your brand, publish programs, manage clients, grow a recurring subscriber base.",
    cta: "Apply now",
    href: "SignupTrainer.html",
    meta: "15% platform fee",
    perks: ["Your storefront, your pricing", "Programs + sessions + subs", "Weekly payouts"],
  },
  {
    key: "nutritionist",
    kicker: "For coaches",
    title: "Nutritionist",
    blurb: "Create meal plans, coach clients on nutrition, earn recurring revenue on your terms.",
    cta: "Apply now",
    href: "SignupNutritionist.html",
    meta: "15% platform fee",
    perks: ["Plans + consults + subs", "Built-in macro tracking", "Weekly payouts"],
  },
  {
    key: "radio",
    kicker: "Here for the vibes",
    title: "Shape Radio",
    blurb: "Stream curated, BPM-tagged workout mixes. Ad-free. When your coach sends a playlist for a workout or meal prep — it plays right here. Free with membership.",
    cta: "Start listening",
    href: "SignupRadio.html",
    meta: "Free with membership",
    perks: ["Ad-free mixes", "BPM-tagged stations", "Offline downloads"],
  },
];

const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function useRaf(cb) {
  React.useEffect(() => {
    if (REDUCED) return;
    let id;
    const loop = () => { cb(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

function MinimalHeader() {
  return (
    <header style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "26px 72px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="index.html" aria-label="Shape home" style={{ flex: "none", display: "inline-flex" }}><Logo variant="white" size={50} /></a>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.5)" }}>Already have an account?</span>
          <a href="Login.html" className="shape-nav-link" style={{ fontFamily: mono, fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK, fontWeight: 500, borderBottom: `1.5px solid ${TEAL}`, paddingBottom: 4 }}>Log in</a>
        </div>
      </div>
    </header>
  );
}

function CinemaHero() {
  const wrap = React.useRef(null);
  const layers = React.useRef([]);
  const tilt = React.useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  React.useEffect(() => {
    if (REDUCED) return;
    const el = wrap.current;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      tilt.current.x = (e.clientX - r.left) / r.width - 0.5;
      tilt.current.y = (e.clientY - r.top) / r.height - 0.5;
    };
    const onLeave = () => { tilt.current.x = 0; tilt.current.y = 0; };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, []);

  useRaf(() => {
    const t = tilt.current;
    t.tx += (t.x - t.tx) * 0.07;
    t.ty += (t.y - t.ty) * 0.07;
    layers.current.forEach((node, i) => {
      if (!node) return;
      const k = (i + 1) * 14;
      node.style.transform = `translate3d(${-t.tx * k}px, ${-t.ty * k * 0.8}px, 0)`;
    });
  });

  const setLayer = (i) => (n) => { layers.current[i] = n; };

  return (
    <section ref={wrap} style={{ position: "relative", minHeight: "100vh", display: "grid", placeItems: "center", overflow: "hidden", padding: "120px 24px 90px" }}>
      <div ref={setLayer(0)} aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-6%", left: "-4%", borderRadius: "50%", filter: "blur(70px)", opacity: 0.5, background: `radial-gradient(circle, ${TEAL} 0%, transparent 70%)`, willChange: "transform" }} />
      <div ref={setLayer(1)} aria-hidden style={{ position: "absolute", width: 640, height: 640, bottom: "-12%", right: "-6%", borderRadius: "50%", filter: "blur(70px)", opacity: 0.42, background: `radial-gradient(circle, ${RUST} 0%, transparent 70%)`, willChange: "transform" }} />
      <div ref={setLayer(2)} style={{ position: "relative", zIndex: 3, textAlign: "center", maxWidth: 1100, willChange: "transform" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.34em", textTransform: "uppercase", color: TEAL }}>Welcome to Shape</div>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(52px, 9.4vw, 142px)", letterSpacing: "-0.045em", fontWeight: 300, margin: "26px 0 0", lineHeight: 0.9 }}>
          How will you<br /><em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>Shape</em> your move?
        </h1>
        <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(242,237,228,0.66)", margin: "32px auto 0", maxWidth: 560, lineHeight: 1.6 }}>
          Four doors. One Shape. Pick the path that fits who you are — the whole experience tailors to it.
        </p>
        <a href="#paths" style={{ display: "inline-flex", marginTop: 40, alignItems: "center", gap: 10, fontFamily: sans, fontWeight: 600, fontSize: 14, padding: "16px 28px", background: INK, color: PAPER, borderRadius: 2 }}>Choose your path ↓</a>
      </div>
      <div aria-hidden style={{ position: "absolute", bottom: 26, left: "50%", transform: "translateX(-50%)", fontFamily: mono, fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(242,237,228,0.4)", zIndex: 3 }}>Scroll</div>
    </section>
  );
}

function RoleCard({ role, index, total }) {
  const ref = React.useRef(null);
  const [hover, setHover] = React.useState(false);
  const [shown, setShown] = React.useState(REDUCED);
  const isRadio = role.key === "radio";

  React.useEffect(() => {
    if (REDUCED || !ref.current) return;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } });
    }, { threshold: 0.18 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const onMove = (e) => {
    if (REDUCED || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(1200px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-6px)`;
  };
  const onLeave = () => {
    setHover(false);
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <a
      ref={ref}
      href={role.href}
      onMouseEnter={() => setHover(true)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        display: "flex", flexDirection: "column",
        background: hover ? "rgba(242,237,228,0.055)" : "rgba(242,237,228,0.022)",
        border: `1px solid ${hover ? "rgba(19,194,168,0.5)" : "rgba(242,237,228,0.1)"}`,
        borderRadius: 4, padding: "34px 30px 28px", position: "relative", overflow: "hidden",
        transformStyle: "preserve-3d", minHeight: 440, textDecoration: "none",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(46px)",
        transition: "opacity .7s ease, transform .7s ease, background .25s ease, border-color .25s ease",
        transitionDelay: shown ? `${(index % 4) * 80}ms` : "0ms",
        willChange: "transform",
      }}>
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: isRadio ? `linear-gradient(90deg, ${RUST}, ${TEAL})` : `linear-gradient(90deg, ${TEAL}, ${TEAL_BRIGHT})`, opacity: hover ? 1 : 0.4, transition: "opacity .25s ease" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 30 }}>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>{role.kicker}</div>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(242,237,228,0.38)" }}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</div>
      </div>

      <h2 style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1.02 }}>
        {isRadio ? <><span>Shape</span><br /><em style={{ fontStyle: "italic", color: TEAL }}>Radio</em></> : role.title}
      </h2>

      <p style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.66)", margin: "18px 0 24px", lineHeight: 1.58 }}>{role.blurb}</p>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {role.perks.map((p) => (
          <li key={p} style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.8)", display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ color: TEAL, fontSize: 12 }}>→</span><span>{p}</span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.48)" }}>{role.meta}</div>
        <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: INK, display: "flex", alignItems: "center", gap: 8 }}>
          {role.cta}
          <span style={{ transition: "transform .25s ease", transform: hover ? "translateX(5px)" : "translateX(0)", color: TEAL }}>→</span>
        </div>
      </div>
    </a>
  );
}

function RoleGrid() {
  return (
    <section id="paths" style={{ padding: "30px 72px 90px", position: "relative", zIndex: 2 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div className="shape-roles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, perspective: "1400px" }}>
          {ROLES.map((r, i) => <RoleCard key={r.key} role={r} index={i} total={ROLES.length} />)}
        </div>
      </div>
    </section>
  );
}

function Reassurance() {
  const items = [
    { k: "$5/mo", v: "Flat platform fee for members" },
    { k: "Verified", v: "Every coach credential-checked" },
    { k: "Weekly", v: "Payouts to coaches — or instant" },
    { k: "No lock-in", v: "Cancel any time, take your clients" },
  ];
  return (
    <section style={{ padding: "20px 72px 130px", position: "relative", zIndex: 2 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", borderTop: "1px solid rgba(242,237,228,0.1)", paddingTop: 56 }}>
        <div className="shape-reassure-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40 }}>
          {items.map((it) => (
            <div key={it.k}>
              <div style={{ fontFamily: serif, fontSize: it.k.length > 8 ? 38 : 56, letterSpacing: "-0.035em", fontWeight: 300, lineHeight: 1 }}>{it.k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.56)", marginTop: 12, lineHeight: 1.5, maxWidth: 220 }}>{it.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProgressRail() {
  const bar = React.useRef(null);
  useRaf(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar.current) bar.current.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  });
  return (
    <div aria-hidden style={{ position: "fixed", top: 0, left: 0, height: 2, zIndex: 60, width: 0, background: `linear-gradient(90deg, ${TEAL}, ${RUST})` }} ref={bar} />
  );
}

function LandingPage() {
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/get%20started.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 8%, rgba(26,24,19,0.55) 0%, rgba(11,14,12,0.82) 55%, #0b0e0c 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <ProgressRail />
        <MinimalHeader />
        <CinemaHero />
        <RoleGrid />
        <Reassurance />
      </div>
      <Footer />
      <style>{`
        @media (max-width: 980px) {
          .shape-roles-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .shape-reassure-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .shape-roles-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LandingPage />);
