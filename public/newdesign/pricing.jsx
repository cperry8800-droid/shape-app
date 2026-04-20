// Pricing — single $5/mo tier. Trainers & nutritionists price themselves.
const PLATFORM_FEATURES = [
"Browse all trainers & nutritionists",
"Subscribe to any trainer or nutritionist",
"Buy individual workout & meal plans",
"Direct messaging with your pros",
"Full progress tracking & analytics",
"Nutrition schedule & macro tracking",
"Community forum access",
"Shape Radio — ad-free workout music"];


const EXAMPLE_COACHES = [
{ role: "Trainer", name: "Maya Okafor", city: "Brooklyn", price: 120, cadence: "/mo", note: "Strength · hypertrophy", avg: "$60–$150 / session average" },
{ role: "Nutritionist", name: "Rae Lindqvist", city: "Lisbon", price: 180, cadence: "/mo", note: "Endurance · plant-based", avg: "$120–$250 / consult average" },
{ role: "Trainer", name: "Diego Alvarez", city: "Mexico City", price: 95, cadence: "/mo", note: "Run coaching · mobility", avg: "$60–$150 / session average" }];


const PRICING_FAQ = [
{ q: "What do I get for $5/month?", a: "Full platform access — browse trainers and nutritionists, message your pros, track your progress, log meals, listen to Shape Radio ad-free, and join the community. The $5 is the Shape Platform fee. Anything you buy from an individual coach (a subscription, a plan, a one-off session) is separate and goes directly to them." },
{ q: "Do I have to subscribe to a coach?", a: "No. For $5/mo you can browse, message intro calls, buy one-off plans, and use the community. A lot of members stay at the platform level and only buy workouts or meal plans à la carte. Others subscribe to one or more coaches for ongoing programming." },
{ q: "How much do trainers and nutritionists cost?", a: "Each pro sets their own price. Trainers typically run $60–$150 per session or $80–$250/month for full programming. Nutritionists typically run $120–$250 per consult or $120–$300/month for plans + reviews. You see each coach's rate on their profile before you subscribe." },
{ q: "Can I cancel any time?", a: "Yes — the $5/mo cancels instantly from your settings. Coach subscriptions cancel on the same screen. No penalties, no lock-in. Your data and training history stay with you." },
{ q: "Do trainers and nutritionists pay to be on Shape?", a: "Free for your first 60 days, then a flat $20/month platform fee — regardless of how many clients you have or how much you earn. No commissions, no per-booking cuts, no setup or listing fees." },
{ q: "Is Shape Radio really included?", a: "Yes — ad-free workout mixes, BPM-curated stations, live DJ sets from residents. Part of the $5/mo. Offline downloads included. No upsell." }];


function PricingHero() {
  return (
    <section style={{ padding: "100px 40px 40px", position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Pricing</div>
        <h1 style={{ fontFamily: serif, fontSize: 128, letterSpacing: "-0.04em", fontWeight: 400, margin: 0, lineHeight: 0.9 }}>
          Five dollars <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>a&nbsp;month</em>.<br />Pay your coach directly.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(242,237,228,0.7)", margin: "28px 0 0", maxWidth: 720, lineHeight: 1.55 }}>One flat platform fee. Browse every trainer and nutritionist before paying anything, message your pros, track progress, log meals, listen to Shape Radio. Trainers and nutritionists set their own rates — you pay them directly, cancel any time.

        </p>
      </div>
    </section>);

}

function PricingCard() {
  return (
    <section style={{ padding: "40px 40px 60px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 0, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, overflow: "hidden" }}>
        {/* Left — the $5 card (featured) */}
        <div style={{ background: INK, color: PAPER, padding: "48px 44px 40px", position: "relative" }}>
          <div style={{ position: "absolute", top: 28, right: 32, background: TEAL, color: PAPER, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", padding: "5px 12px", borderRadius: 4 }}>INCLUDES SHAPE RADIO</div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,22,18,0.55)", marginBottom: 14 }}>Shape Platform</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontFamily: serif, fontSize: 120, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 0.9 }}>$5</div>
            <div style={{ fontSize: 16, color: "rgba(26,22,18,0.55)" }}>/month</div>
          </div>
          <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.015em", fontWeight: 400, marginTop: 28, lineHeight: 1.3, maxWidth: 360 }}>Everything you need. No bundles. No upsell. No seat math.</div>
          <a href="/pricing" style={{ marginTop: 36, padding: "16px 28px", borderRadius: 8, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Get started →</a>
          <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(26,22,18,0.5)", marginTop: 16 }}>Cancel any time. No commitments.</div>
        </div>

        {/* Right — features */}
        <div style={{ background: "rgba(242,237,228,0.03)", padding: "48px 44px 40px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL, marginBottom: 20 }}>WHAT'S INCLUDED</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PLATFORM_FEATURES.map((f, i) =>
            <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 12, fontSize: 14, lineHeight: 1.45, color: INK }}>
                <span style={{ color: TEAL, fontSize: 13 }}>✓</span>
                <span>{f}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>);

}

function PricingCoaches() {
  return (
    <section style={{ padding: "80px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 48 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>Coaches price themselves</div>
            <h2 style={{ fontFamily: serif, fontSize: 64, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>Your coach sets the rate. <em style={{ fontStyle: "italic", color: TEAL }}>You pay them directly.</em></h2>
          </div>
          <p style={{ fontFamily: sans, fontSize: 15.5, color: "rgba(26,22,18,0.75)", lineHeight: 1.6, maxWidth: 440, margin: 0 }}>Subscribe monthly for ongoing programming, or buy one-off plans and sessions à la carte. Save each workout or program to your personal library you can access at any time. Every rate is visible on the coach's profile before you commit. Typical ranges below — but the coach is always the source of truth.

          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {EXAMPLE_COACHES.map((c, i) =>
          <div key={i} style={{ padding: 28, background: "rgba(26,22,18,0.03)", border: "1px solid rgba(26,22,18,0.1)", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, background: "rgba(26,22,18,0.08)" }} />
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: TEAL, marginBottom: 2 }}>{c.role.toUpperCase()}</div>
                  <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em" }}>{c.name}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "rgba(26,22,18,0.65)" }}>{c.city} · {c.note}</div>
              <div style={{ borderTop: "1px solid rgba(26,22,18,0.1)", margin: "20px 0" }} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1 }}>${c.price}</div>
                <div style={{ fontSize: 13, color: "rgba(26,22,18,0.55)" }}>{c.cadence}</div>
              </div>
              <div style={{ fontSize: 12, color: "rgba(26,22,18,0.5)", marginTop: 6 }}>{c.avg}</div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 36 }}>
          <a href="Marketplace.html" style={{ fontFamily: sans, fontSize: 14, color: TEAL, fontWeight: 500 }}>Browse all coaches →</a>
        </div>
      </div>
    </section>);

}

function PricingFAQ() {
  const [open, setOpen] = React.useState(0);
  return (
    <section style={{ padding: "100px 40px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>FAQ</div>
        <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 40px", lineHeight: 1 }}>Things people <em style={{ fontStyle: "italic", color: TEAL }}>actually ask.</em></h2>
        {PRICING_FAQ.map((f, i) =>
        <div key={i} style={{ borderTop: "1px solid rgba(242,237,228,0.1)", padding: "24px 0" }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, color: INK, cursor: "pointer", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", fontWeight: 400 }}>{f.q}</span>
              <span style={{ fontSize: 22, color: "rgba(242,237,228,0.5)" }}>{open === i ? "−" : "+"}</span>
            </button>
            {open === i &&
          <div style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.75)", lineHeight: 1.6, marginTop: 16, maxWidth: 780 }}>{f.a}</div>
          }
          </div>
        )}
      </div>
    </section>);

}

function PricingCTA() {
  return (
    <section style={{ padding: "60px 40px 100px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 56px", background: "rgba(30,192,168,0.08)", border: "1px solid rgba(30,192,168,0.25)", borderRadius: 14, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 14 }}>One platform fee. One marketplace.</div>
          <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>$5 a month. <em style={{ fontStyle: "italic", color: TEAL }}>Cancel any time.</em></h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/pricing" style={{ padding: "16px 26px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>Get started →</a>
          <a href="Marketplace.html" style={{ padding: "16px 26px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 14, fontWeight: 500, textAlign: "center", textDecoration: "none" }}>Browse the marketplace</a>
        </div>
      </div>
    </section>);

}

function PricingPage() {
  return (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Pricing.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(26,22,18,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Pricing" />
        <PricingHero />
        <PricingCard />
        <PricingCoaches />
        <PricingFAQ />
        <PricingCTA />
        <Footer />
      </div>
    </div>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<PricingPage />);