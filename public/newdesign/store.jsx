// Shape Store — spend points for rewards
const { useState: useSStore, useMemo: useMStore } = React;

const BALANCE = 940;
const LIFETIME = 3420;
const REDEEMED_COUNT = 7;

const CATEGORIES = ["All", "Shape Merch", "Training", "Nutrition", "Shape Perks"];

const PRODUCTS = [
  // Shape Merch
  { id: 1, cat: "Shape Merch", name: "Shape Training Tee", brand: "Shape Merch", cost: 450, retail: 48, img: "tee · midnight", tag: "New", stock: "In stock" },
  { id: 2, cat: "Shape Merch", name: "Shape Crewneck", brand: "Shape Merch", cost: 720, retail: 72, img: "crewneck · bone", tag: "Members", stock: "In stock" },
  { id: 3, cat: "Shape Merch", name: "Shape Training Bottle", brand: "Shape Merch", cost: 280, retail: 28, img: "bottle · steel", stock: "In stock" },
  { id: 4, cat: "Shape Merch", name: "Shape Gym Towel", brand: "Shape Merch", cost: 220, retail: 22, img: "towel · cream", stock: "In stock" },
  { id: 5, cat: "Shape Merch", name: "Shape Training Duffel", brand: "Shape Merch", cost: 1640, retail: 165, img: "duffel · canvas", tag: "Peak tier", stock: "In stock", locked: true },

  // Training
  { id: 6, cat: "Training", name: "$25 session credit", brand: "Any Shape coach", cost: 500, retail: 25, img: "credit · 25", stock: "Unlimited" },
  { id: 7, cat: "Training", name: "$50 session credit", brand: "Any Shape coach", cost: 950, retail: 50, img: "credit · 50", stock: "Unlimited" },
  { id: 8, cat: "Training", name: "Coach 2nd-opinion", brand: "Free 30-min trainer intro", cost: 900, retail: 95, img: "intro · call", stock: "Monthly" },
  { id: 9, cat: "Training", name: "Program review credit", brand: "Shape trainer review", cost: 780, retail: 85, img: "program · review", stock: "Unlimited" },

  // Nutrition
  { id: 10, cat: "Nutrition", name: "Meal-plan Refresh", brand: "With your Shape RD", cost: 1200, retail: 140, img: "meal · plan", tag: "Popular", stock: "Unlimited" },
  { id: 11, cat: "Nutrition", name: "$25 nutrition credit", brand: "Any Shape nutritionist", cost: 500, retail: 25, img: "nutrition · credit", stock: "Unlimited" },
  { id: 12, cat: "Nutrition", name: "Grocery list buildout", brand: "Shape nutrition service", cost: 420, retail: 45, img: "grocery · list", stock: "Unlimited" },
  { id: 13, cat: "Nutrition", name: "Recipe archive pack", brand: "Shape nutrition templates", cost: 340, retail: 35, img: "recipes · pack", stock: "Unlimited" },

  // Shape Perks
  { id: 14, cat: "Shape Perks", name: "Shape Radio · Studio", brand: "3 months ad-free", cost: 750, retail: 36, img: "radio · studio", stock: "Unlimited" },
  { id: 16, cat: "Shape Perks", name: "Annual membership credit", brand: "$200 toward next year", cost: 3500, retail: 200, img: "annual · 200", tag: "Peak tier", stock: "Unlimited", locked: true },
];

const UNLOCKED = [
  { code: "SHAPE-TEE-48F2", name: "Shape Training Tee", expires: "Jun 30", cost: 450, redeemed: "Apr 12" },
  { code: "NUTRI-PLAN-04F1", name: "Grocery list buildout", expires: "May 20", cost: 420, redeemed: "Apr 04" },
  { code: "RADIO-3MO-BB7A", name: "Shape Radio · Studio · 3 mo", expires: "Jul 15", cost: 750, redeemed: "Mar 28" },
];

function StoreHero() {
  return (
    <section style={{ padding: "80px 72px 60px", position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 24 }}>Shape Store</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 80, alignItems: "end" }}>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(56px, 7.5vw, 108px)", lineHeight: 0.9, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, color: INK }}>
            Spend<br />the <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>points</em> you earned.
          </h1>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.65)", margin: 0, maxWidth: 420 }}>
            Trade Shape Score for Shape merch, training credits, nutrition services, and membership perks. No expiry on points. No third-party merchandise discounts.
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
    <section style={{ padding: "28px 72px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.02)", position: "sticky", top: 76, zIndex: 40, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map((c) => <button key={c} style={pill(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
          <span style={{ width: 1, background: "rgba(242,237,228,0.15)", height: 20, margin: "0 8px" }} />
          <button style={pill(affordable)} onClick={() => setAffordable(!affordable)}>Within my balance</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merch or rewards…" style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", fontFamily: sans, fontSize: 13, color: INK, minWidth: 220, outline: "none" }} />
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
      <section style={{ padding: "48px 72px 40px" }}>
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
    <section style={{ padding: "60px 72px", background: "rgba(242,237,228,0.02)", borderTop: "1px solid rgba(242,237,228,0.06)", borderBottom: "1px solid rgba(242,237,228,0.06)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Your locker</div>
            <h2 style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", fontWeight: 400, margin: "10px 0 0", lineHeight: 1 }}>Unlocked coupons.</h2>
          </div>
          <a href="Store.html" style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)", borderBottom: "1px solid rgba(242,237,228,0.3)", paddingBottom: 2 }}>Redemption history →</a>
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

function StoreFAQ() {
  const faqs = [
    ["Do points expire?", "No. Points earned in Shape Score never expire. Redemption codes, once unlocked, carry the expiry you see on the coupon."],
    ["Can I mix points + card?", "Yes — choose \"Pay with points + card\" at checkout. Every 100 points covers $10 on eligible items."],
    ["Who ships Shape merch?", "Shape merch ships through Shape fulfillment. Training and nutrition rewards are delivered inside your account."],
    ["What if I don't love it?", "30-day returns, points refunded in full. Perishables (nutrition) and digital codes are final sale."],
  ];
  return (
    <section style={{ padding: "80px 72px 100px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 80 }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>How the store works</div>
          <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>
            Earn in the app.<br/>
            <em style={{ fontStyle: "italic", color: TEAL }}>Spend inside Shape.</em>
          </h2>
          <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: "rgba(242,237,228,0.6)", marginTop: 20, maxWidth: 360 }}>
            Points are Shape's currency for doing the work. The store turns them into Shape merch, training credits, nutrition services, and membership perks.
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
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/intro/Shape%20store.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(26,22,18,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Store" />
        <StoreHero />
        <StoreGrid />
        <UnlockedCoupons />
        <StoreFAQ />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<StorePage />);
