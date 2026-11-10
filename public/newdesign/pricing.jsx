// Pricing — a free account and one $5/mo membership. Spatial Cinema language. Trainers & nutritionists price themselves.

// Kicks off the Shape Platform $5/mo checkout through the site's one membership door
// (pageShell.jsx, window.ShapeMembership): a signed-out visitor goes to sign-up, a member
// who joined comes back to their dashboard, and one who is already a member goes straight
// there instead of buying a second membership. `plan` is "monthly" or "annual" ($48 a year, owner
// 2026-11-10); none sends none, and the server's default is monthly.
async function startPlatformCheckout(e, plan) {
  e.preventDefault();
  const home = "/newdesign/ClientApp.html#today";
  if (!window.ShapeMembership) { alert("Could not start checkout. Reload the page and try again."); return; }
  const r = await window.ShapeMembership.start(home, { plan: plan || null, cancelTo: "/newdesign/Pricing.html" });
  if (r && r.code === "already_member") { window.location.href = home; return; }
  if (r && r.error) alert(r.error);
}

// ⚠ A FREE ACCOUNT, AND A MEMBERSHIP FOR THE PAID FEATURES (owner, 2026-11-10). The page sold
// $5 as "the whole app" (owner, 2026-10-09: market it as the app's features, not a coach fee).
// Now an account is free and keeps the app, the marketplace and a place on the leaderboards'
// top 10; the membership, $5 a month or $48 a year, adds assistant Nora, Shape Radio, the points
// Store, and the full leaderboard with your exact rank. No billing trials, and the membership is
// included while a member is coached on Shape. The two lists say which is which, so nothing free is
// sold and nothing paid is promised free.
const MEMBER_FEATURES = [
  "Nora as your assistant: she makes the change you ask for, and you confirm or undo it",
  "Talk to Nora by voice, and her weekly read of your training and food",
  "Shape Radio: one live channel, ad-free",
  "Spend your Shape Score points in the Store",
  "The full leaderboard and your exact rank",
  "AI program drafts, and Cook Mode by voice",
];
const FREE_FEATURES = [
  "Build and log your own workouts and programs",
  "Meal logging & macro tracking",
  "Shape Kitchen — recipes & guided cooking",
  "Your dashboard, progress and Shape Score",
  "A place on the leaderboards, and their top 10",
  "Your week, recapped and ready to share",
  "Community forum access",
  "Browse, book and hire any trainer or nutritionist",
  "Direct messaging with your pros, and their reviews",
  "Community channels: join, start and post in them",
  "Nora's help with the app",
];
const COACH_INCLUDED_LINE = "Membership is included while you’re coached on Shape.";

const EXAMPLE_COACHES = [
  { role: "Trainer", name: "Maya Okafor", city: "Brooklyn", price: 120, cadence: "/mo", note: "Strength · hypertrophy", avg: "$60–$150 / session average", hue: ["#0ac5a8", "#0ac5a8"] },
  { role: "Nutritionist", name: "Rae Lindqvist", city: "Lisbon", price: 180, cadence: "/mo", note: "Endurance · plant-based", avg: "$120–$250 / consult average", hue: ["#d2693f", "#e79a52"] },
  { role: "Trainer", name: "Diego Alvarez", city: "Mexico City", price: 95, cadence: "/mo", note: "Run coaching · mobility", avg: "$60–$150 / session average", hue: ["#1f6f62", "#0ac5a8"] },
];

const PRICING_FAQ = [
  { q: "What do I get for $5/month?", a: "Nora as your assistant (she makes changes for you to confirm or undo, talks by voice, and writes your weekly read), Shape Radio ad-free, spending your Shape Score points in the Store, the full leaderboard and your exact rank, AI program drafts and Cook Mode by voice. Everything else is free with your account: building and logging workouts, logging meals, Shape Kitchen, your progress, the community, and hiring and messaging coaches. Anything you buy from an individual coach (a subscription, a plan, a one-off session) is separate and goes directly to them." },
  // Shown only once the plans say a yearly price is set up (PricingFAQ).
  { q: "Is there a yearly plan?", a: "Yes: $48/year, the same membership for less than ten months of the monthly price. Monthly is $5/month. Both cancel any time from your settings.", yearly: true },
  { q: "Is there a free plan?", a: "Yes: a Shape account is free, with no card. It keeps your training, meals, progress, coaches and a place on the leaderboards. The $5/mo membership adds Nora as your assistant, Shape Radio, the points Store and the full leaderboard with your exact rank, and you can start or cancel it any time." },
  { q: "Is membership included with a coach?", a: "Yes. Membership is included while you’re coached on Shape: while you pay a trainer or nutritionist through Shape, Nora as your assistant, Shape Radio, the Store and the full leaderboard are yours, at no extra cost. If you also have your own plan, you can cancel it." },
  { q: "Do I have to subscribe to a coach?", a: "No. With a free account you can browse, message intro calls, buy one-off plans, build your own workouts right in the app, and use the community. A lot of members train on self-built weeks or à-la-carte plans. Others subscribe to one or more coaches for ongoing programming." },
  { q: "How much do trainers and nutritionists cost?", a: "Each pro sets their own price. Trainers typically run $60–$150 per session or $80–$250/month for full programming. Nutritionists typically run $120–$250 per consult or $120–$300/month for plans + reviews. You see each coach's rate on their profile before you subscribe." },
  { q: "Can I cancel any time?", a: "Yes — the $5/mo cancels instantly from your settings, and your account carries on free. Coach subscriptions cancel on the same screen. No penalties, no lock-in. Your data and training history stay with you." },
  { q: "Do trainers and nutritionists pay to be on Shape?", a: "No monthly dues, no setup fees. Shape takes a 15% platform fee when a client who found them on Shape pays them, nothing on a client who subscribes through their own invite or referral link. Stripe's card-processing fee comes out of their share. They only pay when they earn." },
  { q: "Is Shape Radio really included?", a: "Yes, in the membership — one live channel, coach playlists and live DJ sets from residents, all ad-free. Part of the $5/mo. Offline downloads included. No upsell." },
];

const REDUCED_PR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function Reveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(REDUCED_PR);
  React.useEffect(() => {
    if (REDUCED_PR || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(34px)", transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`, ...style }}>{children}</div>
  );
}

function PricingHero() {
  // ⚠ The yearly price only once the plans say it is set up (Codex P2 on #2675): with
  // STRIPE_PLATFORM_ANNUAL_PRICE_ID unset the checkout refuses a year, so the page never promises one.
  const plans = window.useShapePlans ? window.useShapePlans() : null;
  const M = window.ShapeMembership;
  const yearly = plans && plans.annual && M && M.money ? ` or ${M.money(plans.annual.priceCents)} a year` : "";
  return (
    <section style={{ position: "relative", padding: "40px 72px 70px", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(80px)", opacity: 0.32, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", textAlign: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 24 }}>Pricing</div>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(42px, 6vw, 84px)", letterSpacing: "-0.045em", fontWeight: 300, margin: 0, lineHeight: 0.88 }}>
          Free to join.<br />Five dollars <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>a&nbsp;month</em> for more.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(242,237,228,0.66)", margin: "32px auto 0", maxWidth: 720, lineHeight: 1.6 }}>A free account trains, logs meals, cooks from Shape Kitchen, hires coaches and is ranked on the leaderboards. The membership, $5 a month{yearly}, adds Nora as your assistant, Shape Radio, the points Store, and the full leaderboard with your exact rank. Coaches are optional: they set their own rates, you pay them directly, and you can cancel any time.</p>
      </div>
    </section>
  );
}

function PricingCard() {
  // The real prices (/api/membership/plans) once they answer; the page's own words until then. The
  // yearly plan is offered only once the plans say it is set up: never while they are read or when
  // they did not answer, since a checkout for a year with none set is refused (Codex P2 on #2675).
  const plans = window.useShapePlans ? window.useShapePlans() : null;
  const M = window.ShapeMembership;
  const money = (c) => (M && M.money ? M.money(c) : "$" + c / 100);
  const annual = plans ? plans.annual : null;
  const saving = plans && M && M.annualSaving ? M.annualSaving(plans) : null;
  return (
    <section style={{ padding: "30px 72px 70px" }}>
      <Reveal>
        <div className="pr-card" style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 1fr", border: `1px solid ${"rgba(242,237,228,0.14)"}`, borderRadius: 6, overflow: "hidden", position: "relative" }}>
          <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7, zIndex: 2 }} />
          <div style={{ background: INK, color: PAPER, padding: "52px 46px 70px", position: "relative" }}>
            <div style={{ position: "absolute", top: 30, right: 34, background: TEAL, color: PAPER, fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", padding: "6px 12px", borderRadius: 3 }}>INCLUDES SHAPE RADIO</div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(26,22,18,0.55)", marginBottom: 16 }}>Shape Membership</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontFamily: serif, fontSize: 128, fontWeight: 300, letterSpacing: "-0.05em", lineHeight: 0.85 }}>$5</div>
              <div style={{ fontSize: 16, color: "rgba(26,22,18,0.55)" }}>/month</div>
            </div>
            {annual && <div data-plan-annual style={{ fontFamily: sans, fontSize: 15, color: "rgba(26,22,18,0.75)", marginTop: 12 }}>or {money(annual.priceCents)}/year{saving ? " — save " + saving + "%" : ""}</div>}
            <div style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(26,22,18,0.62)", marginTop: 16, lineHeight: 1.55, maxWidth: 360 }}>What a member adds to a free Shape account. A coach's rate is separate and paid directly to them. {COACH_INCLUDED_LINE}</div>
            <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.015em", fontWeight: 400, marginTop: 26, lineHeight: 1.3, maxWidth: 360 }}>No bundles. No upsell. No seat math.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 38 }}>
              <a href="#" onClick={(e) => startPlatformCheckout(e, annual ? "monthly" : null)} style={{ padding: "16px 30px", borderRadius: 2, background: TEAL, color: PAPER, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>{annual ? "Monthly · " + (plans ? money(plans.monthly.priceCents) : "$5") + "/mo →" : "Get started →"}</a>
              {annual && <a href="#" data-plan="annual" onClick={(e) => startPlatformCheckout(e, "annual")} style={{ padding: "15px 26px", borderRadius: 2, background: "transparent", color: PAPER, border: "1px solid rgba(26,22,18,0.35)", fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Annual · {money(annual.priceCents)}/yr →</a>}
            </div>
            <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(26,22,18,0.5)", marginTop: 18 }}>Cancel any time, and your account carries on free.</div>
          </div>
          <div style={{ background: "rgba(242,237,228,0.03)", padding: "52px 46px 70px" }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", color: TEAL, marginBottom: 24 }}>WHAT MEMBERSHIP ADDS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              {MEMBER_FEATURES.map((f, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 12, fontSize: 14, lineHeight: 1.45, color: INK }}>
                  <span style={{ color: TEAL, fontSize: 13 }}>✓</span><span>{f}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", color: "rgba(242,237,228,0.55)", margin: "34px 0 18px" }}>FREE WITH YOUR ACCOUNT</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {FREE_FEATURES.map((f, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 12, fontSize: 13.5, lineHeight: 1.45, color: "rgba(242,237,228,0.78)" }}>
                  <span style={{ color: "rgba(242,237,228,0.5)", fontSize: 13 }}>✓</span><span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function CoachCard({ c }) {
  const ref = React.useRef(null);
  const onMove = (e) => {
    if (REDUCED_PR || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(1200px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateZ(6px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ padding: 30, background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 4, transition: "transform .12s ease-out", willChange: "transform" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 999, background: `linear-gradient(135deg, ${c.hue[0]}, ${c.hue[1]})` }} />
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: TEAL, marginBottom: 3 }}>{c.role.toUpperCase()}</div>
          <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em" }}>{c.name}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(242,237,228,0.6)" }}>{c.city} · {c.note}</div>
      <div style={{ borderTop: "1px solid rgba(242,237,228,0.1)", margin: "20px 0" }} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontFamily: serif, fontSize: 42, letterSpacing: "-0.025em", lineHeight: 1 }}>${c.price}</div>
        <div style={{ fontSize: 13, color: "rgba(242,237,228,0.5)" }}>{c.cadence}</div>
      </div>
      <div style={{ fontSize: 12, color: "rgba(242,237,228,0.45)", marginTop: 6 }}>{c.avg}</div>
    </div>
  );
}

function PricingCoaches() {
  return (
    <section style={{ padding: "100px 72px", background: INK_DEEP }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 52 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Coaches price themselves</div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(38px, 5.4vw, 68px)", letterSpacing: "-0.035em", fontWeight: 300, margin: 0, lineHeight: 0.96 }}>Your coach sets the rate. <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>You pay them directly.</em></h2>
          </div>
          <p style={{ fontFamily: sans, fontSize: 15.5, color: "rgba(242,237,228,0.62)", lineHeight: 1.62, maxWidth: 440, margin: 0 }}>Subscribe monthly for ongoing programming, or buy one-off plans and sessions à la carte. Every rate is visible on the coach's profile before you commit. Typical ranges below — the coach is always the source of truth.</p>
        </div>
        <div className="pr-coaches" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, perspective: "1400px" }}>
          {EXAMPLE_COACHES.map((c, i) => <CoachCard key={i} c={c} />)}
        </div>
        <div style={{ textAlign: "center", marginTop: 42 }}>
          <a href="Coaches.html" style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Browse all coaches →</a>
        </div>
      </div>
    </section>
  );
}

function PricingFAQ() {
  const [open, setOpen] = React.useState(0);
  // The yearly plan's answer only once the plans say it is set up, as the hero and the card.
  const plans = window.useShapePlans ? window.useShapePlans() : null;
  const faq = PRICING_FAQ.filter((f) => !f.yearly || !!(plans && plans.annual));
  return (
    <section style={{ padding: "120px 72px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>FAQ</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(36px, 5vw, 60px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "0 0 44px", lineHeight: 1 }}>Things people <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>actually ask.</em></h2>
        {faq.map((f, i) => (
          <div key={i} style={{ borderTop: "1px solid rgba(242,237,228,0.1)", padding: "26px 0" }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, color: INK, cursor: "pointer", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
              <span style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", fontWeight: 400 }}>{f.q}</span>
              <span style={{ fontSize: 22, color: TEAL, transition: "transform .2s", transform: open === i ? "rotate(45deg)" : "none" }}>+</span>
            </button>
            {open === i && <div style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.72)", lineHeight: 1.65, marginTop: 16, maxWidth: 780 }}>{f.a}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingCTA() {
  return (
    <section style={{ padding: "60px 72px 120px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px", background: "rgba(10,197,168,0.07)", border: "1px solid rgba(10,197,168,0.28)", borderRadius: 6, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, alignItems: "center", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />
        <div>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 16 }}>A free account · one membership</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(36px, 5vw, 60px)", letterSpacing: "-0.035em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>$5 a month. <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>Cancel any time.</em></h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="#" onClick={startPlatformCheckout} style={{ padding: "16px 26px", borderRadius: 2, background: INK, color: PAPER, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>Get started →</a>
          <a href="Coaches.html" style={{ padding: "16px 26px", borderRadius: 2, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>Browse the marketplace</a>
        </div>
      </div>
    </section>
  );
}

function PricingPage() {
  return (
    <div style={{ background: INK_DEEP, color: INK, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Pricing.webp')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Pricing" />
        <PricingHero />
        <PricingCard />
        <PricingCoaches />
        <PricingFAQ />
        <Footer />
      </div>
      <style>{`
        @media (max-width: 900px) {
          .pr-card { grid-template-columns: 1fr !important; }
          .pr-coaches { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PricingPage />);
