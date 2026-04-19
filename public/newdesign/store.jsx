// Shape Store — spend points for rewards
const { useState: useSStore, useMemo: useMStore } = React;

const BALANCE = 940;
const LIFETIME = 3420;
const REDEEMED_COUNT = 7;

const CATEGORIES = ["All", "Workout Gear", "Nutrition", "Shape Perks", "Experiences"];

const PRODUCTS = [
  // Workout Gear
  { id: 1, cat: "Workout Gear", name: "Shape Training Tee", brand: "Shape Atelier", cost: 450, retail: 48, img: "tee · midnight", tag: "New", stock: "In stock" },
  { id: 2, cat: "Workout Gear", name: "Weighted Jump Rope", brand: "Rogue · co-branded", cost: 380, retail: 42, img: "rope · steel", stock: "In stock" },
  { id: 3, cat: "Workout Gear", name: "Liforme Yoga Mat", brand: "Liforme", cost: 1250, retail: 140, img: "mat · terracotta", tag: "Members", stock: "Low stock" },
  { id: 4, cat: "Workout Gear", name: "Recovery Roller Set", brand: "Theragun", cost: 920, retail: 110, img: "roller · carbon", stock: "In stock" },
  { id: 5, cat: "Workout Gear", name: "Resistance Band Kit", brand: "Shape Atelier", cost: 280, retail: 32, img: "bands · neutrals", stock: "In stock" },
  { id: 6, cat: "Workout Gear", name: "Training Duffel", brand: "Shape × Away", cost: 1640, retail: 195, img: "duffel · canvas", tag: "Gold tier", stock: "In stock", locked: true },

  // Nutrition
  { id: 7, cat: "Nutrition", name: "Protein Blend · 2 lb", brand: "Thorne", cost: 520, retail: 58, img: "whey · vanilla", stock: "In stock" },
  { id: 8, cat: "Nutrition", name: "Electrolyte 30-pack", brand: "LMNT", cost: 340, retail: 45, img: "electrolytes", stock: "In stock" },
  { id: 9, cat: "Nutrition", name: "Creatine + Beta-Alanine", brand: "Thorne", cost: 420, retail: 52, img: "creatine", stock: "In stock" },
  { id: 10, cat: "Nutrition", name: "Meal-plan Refresh", brand: "With your RD", cost: 1200, retail: 140, img: "meal · plan", tag: "Popular", stock: "Unlimited" },
  { id: 11, cat: "Nutrition", name: "Sleep Stack", brand: "Momentous", cost: 680, retail: 75, img: "sleep · stack", stock: "In stock" },

  // Shape Perks
  { id: 12, cat: "Shape Perks", name: "$25 session credit", brand: "Any coach", cost: 500, retail: 25, img: "credit · 25", stock: "Unlimited" },
  { id: 13, cat: "Shape Perks", name: "$50 session credit", brand: "Any coach", cost: 950, retail: 50, img: "credit · 50", stock: "Unlimited" },
  { id: 14, cat: "Shape Perks", name: "Shape Radio · Studio", brand: "3 months ad-free", cost: 750, retail: 36, img: "radio · studio", stock: "Unlimited" },
  { id: 15, cat: "Shape Perks", name: "Coach 2nd-opinion", brand: "Free 30-min intro", cost: 900, retail: 95, img: "intro · call", stock: "Monthly" },
  { id: 16, cat: "Shape Perks", name: "Annual membership credit", brand: "$200 toward next year", cost: 3500, retail: 200, img: "annual · 200", tag: "Peak tier", stock: "Unlimited", locked: true },

  // Experiences
  { id: 17, cat: "Experiences", name: "Brooklyn retreat weekend", brand: "Shape × Outbound", cost: 4800, retail: 680, img: "retreat · BK", tag: "Limited", stock: "6 spots", locked: true },
  { id: 18, cat: "Experiences", name: "Studio class bundle · 10", brand: "Partner studios", cost: 1450, retail: 180, img: "studio · 10", stock: "In stock" },
  { id: 19, cat: "Experiences", name: "DEXA + VO2 test", brand: "Partner clinic", cost: 2200, retail: 295, img: "clinic · dexa", tag: "Longevity", stock: "Bookable" },
];

const UNLOCKED = [
  { code: "SHAPE-TEE-48F2", name: "Shape Training Tee", expires: "Jun 30", cost: 450, redeemed: "Apr 12" },
  { code: "LMNT-E9C1", name: "Electrolyte 30-pack", expires: "May 20", cost: 340, redeemed: "Apr 04" },
  { code: "RADIO-3MO-BB7A", name: "Shape Radio · Studio · 3 mo", expires: "Jul 15", cost: 750, redeemed: "Mar 28" },
];

function StoreHeroBg() { return null; }

function StoreHero() {
  return (
    <section style={{ padding: "80px 40px 60px", position: "relative", overflow: "hidden" }}>
      <StoreHeroBg />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 24 }}>Shape Store</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 80, alignItems: "end" }}>
          <h1 style={{ fontFamily: serif, fontSize: 120, lineHeight: 0.88, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, color: INK }}>
            Spend<br />the <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>points</em> you earned.
          </h1>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.65)", margin: 0, maxWidth: 420 }}>
            Trade Shape Score for real things — gear, nutrition, subscriptions, experiences. No expiry on points. No markups on items.
          </p>
        </div>

        <div style={{ marginTop: 64, display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 0, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          <div style={{ padding: "28px 28px 28px 0" }}>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Available balance</div>
            <div style={{ fontFamily: serif, fontSize: 76, letterSpacing: "-0.035em", color: INK, lineHeight: 1, marginTop: 12 }}>
              {BALANCE.toLocaleString()}
              <span style={{ fontSize: 18, color: "rgba(242,237,228,0.55)", fontFamily: sans, marginLeft: 10 }}>pts</span>
            </div>
            <a href="Score.html" style={{ fontFamily: sans, fontSize: 12, color: TEAL, marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
              View Rewards page →
            </a>
          </div>
          {[
            [`${LIFETIME.toLocaleString()}`, "Lifetime earned", "since Jan 2025"],
            [`${REDEEMED_COUNT}`, "Items redeemed", "4 this quarter"],
            ["Tempo", "Current tier", "216 to Peak"],
          ].map(([k, l, s], i) => (
            <div key={i} style={{ padding: "28px 28px", borderLeft: "1px solid rgba(242,237,228,0.08)" }}>
              <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 500, color: INK, marginTop: 10 }}>{l}</div>
              <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StoreFilters({ cat, setCat, sort, setSort, query, setQuery, affordable, setAffordable }) {
  const pill = (on) => ({ padding: "9px 16px", borderRadius: 999, border: on ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.18)", background: on ? INK : "transparent", color: on ? PAPER : INK, fontFamily: sans, fontSize: 13, cursor: "pointer", fontWeight: on ? 500 : 400 });
  return (
    <section style={{ padding: "28px 40px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.02)", position: "sticky", top: 76, zIndex: 40, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map((c) => <button key={c} style={pill(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
          <span style={{ width: 1, background: "rgba(242,237,228,0.15)", height: 20, margin: "0 8px" }} />
          <button style={pill(affordable)} onClick={() => setAffordable(!affordable)}>Within my balance</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search gear, brand…" style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", fontFamily: sans, fontSize: 13, color: INK, minWidth: 220, outline: "none" }} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.18)", background: PAPER, fontFamily: sans, fontSize: 13, color: INK, cursor: "pointer" }}>
            <option>Featured</option>
            <option>Low to high</option>
            <option>High to low</option>
            <option>New</option>
          </select>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ p, balance }) {
  const canAfford = !p.locked && p.cost <= balance;
  const dollar = p.retail ? `~$${p.retail} retail` : null;
  return (
    <article style={{ background: "rgba(242,237,228,0.035)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, overflow: "hidden", opacity: p.locked ? 0.65 : 1, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative" }}>
        <Ph label={p.img} ratio="4/3" tone="light" style={{ borderRadius: 0 }} />
        {p.tag && (
          <span style={{ position: "absolute", top: 12, left: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "4px 8px", background: p.locked ? "rgba(26,22,18,0.85)" : TEAL, color: p.locked ? INK : PAPER, borderRadius: 4, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>{p.tag}</span>
        )}
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{p.brand}</div>
        <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, lineHeight: 1.15 }}>{p.name}</div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: "auto", paddingTop: 8 }}>
          {p.stock}{dollar ? ` · ${dollar}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", color: canAfford ? INK : "rgba(242,237,228,0.55)", lineHeight: 1 }}>
            {p.cost.toLocaleString()}
            <span style={{ fontSize: 12, color: "rgba(242,237,228,0.5)", fontFamily: sans, marginLeft: 6 }}>pts</span>
          </div>
          <button disabled={!canAfford} style={{ padding: "9px 14px", borderRadius: 6, background: canAfford ? INK : "rgba(242,237,228,0.08)", color: canAfford ? PAPER : "rgba(242,237,228,0.45)", border: 0, fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: canAfford ? "pointer" : "not-allowed" }}>
            {p.locked ? "Tier locked" : canAfford ? "Redeem →" : `+${(p.cost - balance).toLocaleString()} to go`}
          </button>
        </div>
      </div>
    </article>
  );
}

function StoreGrid() {
  const [cat, setCat] = useSStore("All");
  const [sort, setSort] = useSStore("Featured");
  const [query, setQuery] = useSStore("");
  const [affordable, setAffordable] = useSStore(false);

  const list = useMStore(() => {
    let arr = PRODUCTS.filter(p => {
      if (cat !== "All" && p.cat !== cat) return false;
      if (affordable && (p.locked || p.cost > BALANCE)) return false;
      if (query && !`${p.name} ${p.brand} ${p.cat}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    if (sort === "Low to high") arr = [...arr].sort((a, b) => a.cost - b.cost);
    else if (sort === "High to low") arr = [...arr].sort((a, b) => b.cost - a.cost);
    else if (sort === "New") arr = [...arr].sort((a, b) => (b.tag === "New" ? 1 : 0) - (a.tag === "New" ? 1 : 0));
    return arr;
  }, [cat, sort, query, affordable]);

  return (
    <>
      <StoreFilters {...{ cat, setCat, sort, setSort, query, setQuery, affordable, setAffordable }} />
      <section style={{ padding: "48px 40px 40px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
            <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.65)" }}>
              {list.length} {list.length === 1 ? "item" : "items"}{cat !== "All" ? ` in ${cat}` : ""}
              {affordable ? " · within your 940 balance" : ""}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Points refresh nightly · 00:00 UTC
            </div>
          </div>
          {list.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {list.map(p => <ProductCard key={p.id} p={p} balance={BALANCE} />)}
            </div>
          ) : (
            <div style={{ padding: 80, textAlign: "center", fontFamily: sans, color: "rgba(242,237,228,0.5)", border: "1px dashed rgba(242,237,228,0.1)", borderRadius: 12 }}>
              Nothing matches. Try widening filters or clearing search.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function UnlockedCoupons() {
  return (
    <section style={{ padding: "60px 40px", background: "rgba(242,237,228,0.02)", borderTop: "1px solid rgba(242,237,228,0.06)", borderBottom: "1px solid rgba(242,237,228,0.06)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Your locker</div>
            <h2 style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", fontWeight: 400, margin: "10px 0 0", lineHeight: 1 }}>Unlocked coupons.</h2>
          </div>
          <a href="#" style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)", borderBottom: "1px solid rgba(242,237,228,0.3)", paddingBottom: 2 }}>Redemption history →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {UNLOCKED.map((u, i) => (
            <div key={i} style={{ border: "1px dashed rgba(30,192,168,0.35)", borderRadius: 10, padding: "22px 24px", background: "rgba(30,192,168,0.04)", display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TEAL, letterSpacing: "0.14em" }}>{u.code}</div>
                <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginTop: 6 }}>{u.name}</div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 6 }}>Redeemed {u.redeemed} · expires {u.expires}</div>
              </div>
              <button style={{ padding: "10px 14px", borderRadius: 6, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>Use code</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StoreFeatured() {
  return (
    <section style={{ padding: "100px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Members-only drop</div>
          <h2 style={{ fontFamily: serif, fontSize: 76, letterSpacing: "-0.035em", fontWeight: 400, margin: "0 0 20px", lineHeight: 0.95, color: PAPER }}>
            Shape × <em style={{ fontStyle: "italic", color: TEAL }}>Away</em><br/>training duffel.
          </h2>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(26,22,18,0.7)", maxWidth: 460 }}>
            Gold-tier exclusive. Water-resistant canvas, separated shoe compartment, laptop sleeve. Keep earning — 280 points to unlock.
          </p>
          <div style={{ display: "flex", gap: 28, marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(26,22,18,0.12)", fontFamily: sans }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.02em", color: PAPER, lineHeight: 1 }}>1,640 pts</div>
              <div style={{ fontSize: 12, color: "rgba(26,22,18,0.55)", marginTop: 6 }}>Or $195 retail</div>
            </div>
            <div>
              <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.02em", color: PAPER, lineHeight: 1 }}>84 left</div>
              <div style={{ fontSize: 12, color: "rgba(26,22,18,0.55)", marginTop: 6 }}>Of 250 produced</div>
            </div>
          </div>
          <button style={{ marginTop: 28, padding: "14px 24px", borderRadius: 6, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>See full collection →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, aspectRatio: "5/4" }}>
          <Ph label="Duffel · hero" ratio="auto" tone="dark" style={{ borderRadius: 6, height: "100%" }} />
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 12 }}>
            <Ph label="Detail · 01" ratio="auto" tone="dark" style={{ borderRadius: 6 }} />
            <Ph label="Detail · 02" ratio="auto" tone="dark" style={{ borderRadius: 6 }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function StoreFAQ() {
  const faqs = [
    ["Do points expire?", "No. Points earned in Shape Score never expire. Redemption codes, once unlocked, carry the expiry you see on the coupon."],
    ["Can I mix points + card?", "Yes — choose \"Pay with points + card\" at checkout. Every 100 points covers $10 on eligible items."],
    ["Who ships the gear?", "Our partners handle fulfilment directly. Shape Atelier is our in-house label; everything else ships from the brand you see on the card."],
    ["What if I don't love it?", "30-day returns, points refunded in full. Perishables (nutrition) and digital codes are final sale."],
  ];
  return (
    <section style={{ padding: "80px 40px 100px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 80 }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>How the store works</div>
          <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>
            Earn in the app.<br/>
            <em style={{ fontStyle: "italic", color: TEAL }}>Spend anywhere.</em>
          </h2>
          <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: "rgba(242,237,228,0.6)", marginTop: 20, maxWidth: 360 }}>
            Points are Shape's currency for doing the work. The store is where they become stuff.
          </p>
        </div>
        <div>
          {faqs.map(([q, a], i) => (
            <div key={i} style={{ padding: "28px 0", borderTop: i ? "1px solid rgba(242,237,228,0.1)" : "1px solid rgba(242,237,228,0.1)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 20 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL, paddingTop: 4 }}>0{i + 1}</div>
                <div>
                  <h3 style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.015em", fontWeight: 400, margin: 0, color: INK }}>{q}</h3>
                  <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: "rgba(242,237,228,0.65)", margin: "10px 0 0", maxWidth: 640 }}>{a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StorePage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Rewards.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.55) 0%, rgba(26,22,18,0.7) 100%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Store" />
        <StoreHero />
        <StoreGrid />
        <UnlockedCoupons />
        <StoreFeatured />
        <StoreFAQ />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<StorePage />);
