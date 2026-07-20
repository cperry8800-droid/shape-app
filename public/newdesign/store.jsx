// Shape Store — spend points for rewards
const { useState: useSStore, useMemo: useMStore, useEffect: useEStore } = React;

const BALANCE = 940;
const LIFETIME = 3420;
const REDEEMED_COUNT = 7;

const CATEGORIES = ["All", "Shape Merch", "Training", "Nutrition", "Shape Perks", "Coach Tools"];

const PRODUCTS = [
  // Shape Merch
  { id: 1, cat: "Shape Merch", name: "Shape Training Tee", brand: "Shape Merch", cost: 450, retail: 48, img: "tee · midnight", tag: "New", stock: "In stock" },
  { id: 2, cat: "Shape Merch", name: "Shape Crewneck", brand: "Shape Merch", cost: 720, retail: 72, img: "crewneck · bone", tag: "Members", stock: "In stock" },
  { id: 17, cat: "Shape Merch", name: "Shape Cap · Black", brand: "Shape Merch", cost: 700, retail: 35, img: "cap · black", tag: "Limited drop", stock: "Limited · 30" },
  { id: 18, cat: "Shape Merch", name: "Shape Cap · White", brand: "Shape Merch", cost: 700, retail: 35, img: "cap · white", tag: "Limited drop", stock: "Limited · 30" },
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
  { id: 16, cat: "Shape Perks", name: "Annual membership credit", brand: "$60 toward next year — a full year of Shape", cost: 1200, retail: 60, img: "annual · 60", tag: "Peak tier", stock: "Unlimited", locked: true },
];

const COACH_LEAD_BOOST_PRODUCTS = [
  { id: 101, cat: "Coach Tools", name: "Lead Boost · 7 days", brand: "Marketplace featured placement", cost: 900, retail: 79, img: "boost · 7d", stock: "Activate now", kind: "lead_boost", days: 7 },
  { id: 102, cat: "Coach Tools", name: "Lead Boost · 14 days", brand: "Marketplace featured placement", cost: 1600, retail: 139, img: "boost · 14d", stock: "Activate now", kind: "lead_boost", days: 14, tag: "Popular" },
  { id: 103, cat: "Coach Tools", name: "Lead Boost · 30 days", brand: "Marketplace featured placement", cost: 3000, retail: 249, img: "boost · 30d", stock: "Activate now", kind: "lead_boost", days: 30 },
];

// Uniform store value: 150 points = $1 (repriced from 20 — 2026-07-20 owner call: the old rate minted ~12x the subscription price in monthly redemption value) — clients + coaches.
const SHAPE_PTS_PER_USD = 150;
// Stable item ids matching the server catalogue (src/lib/store-catalogue.ts) so
// the redemption endpoint can charge the authoritative cost by id.
const STORE_ITEM_IDS = {
  "Shape Training Tee": "merch_training_tee",
  "Shape Crewneck": "merch_crewneck",
  "Shape Cap · Black": "merch_cap_black",
  "Shape Cap · White": "merch_cap_white",
  "Shape Training Bottle": "merch_bottle",
  "Shape Gym Towel": "merch_towel",
  "Shape Training Duffel": "merch_duffel",
  "$25 session credit": "train_credit_25",
  "$50 session credit": "train_credit_50",
  "Coach 2nd-opinion": "train_second_opinion",
  "Program review credit": "train_program_review",
  "Meal-plan Refresh": "nutri_meal_plan_refresh",
  "$25 nutrition credit": "nutri_credit_25",
  "Grocery list buildout": "nutri_grocery_buildout",
  "Recipe archive pack": "nutri_recipe_pack",
  "Annual membership credit": "perk_annual_credit",
  "Lead Boost · 7 days": "lead_boost_7",
  "Lead Boost · 14 days": "lead_boost_14",
  "Lead Boost · 30 days": "lead_boost_30",
};
[...PRODUCTS, ...COACH_LEAD_BOOST_PRODUCTS].forEach((p) => {
  // Dollar-credits at 2x base (owner call 2026-07-20 — real cash vs merch margin).
  const _cid = STORE_ITEM_IDS[p.name] || '';
  const _isCredit = /credit/.test(_cid);
  if (p.retail) p.cost = Math.round(p.retail * (_isCredit ? SHAPE_PTS_PER_USD * 2 : SHAPE_PTS_PER_USD));
  p.itemId = STORE_ITEM_IDS[p.name] || "";
});

function getRoleHint() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromQuery = (qs.get("role") || "").toLowerCase();
    if (fromQuery === "trainer" || fromQuery === "nutritionist") return fromQuery;
    const fromSession = (window.sessionStorage.getItem("shapeStoreContext") || "").toLowerCase();
    if (fromSession === "trainer" || fromSession === "nutritionist") return fromSession;
  } catch (_) {}
  return "trainer";
}

async function getShapeAccessToken() {
  try {
    if (!window.shapeDb || !window.shapeDb.client || !window.shapeDb.client.auth) return "";
    const sessionRes = await window.shapeDb.client.auth.getSession();
    return sessionRes?.data?.session?.access_token || "";
  } catch (_) {
    return "";
  }
}

async function redeemLeadBoostRemote({ role, days }) {
  const token = await getShapeAccessToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch("/api/lead-boosts", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ role, days }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Lead Boost redemption failed.");
  return json?.boost || null;
}

const UNLOCKED = [
  { code: "SHAPE-TEE-48F2", name: "Shape Training Tee", expires: "Jun 30", cost: 450, redeemed: "Apr 12" },
  { code: "NUTRI-PLAN-04F1", name: "Grocery list buildout", expires: "May 20", cost: 420, redeemed: "Apr 04" },
];

function StoreHero({ balance = BALANCE, credit = { session: 0, nutrition: 0 } }) {
  const hasCredit = (credit.session > 0 || credit.nutrition > 0);
  return (
    <section style={{ padding: "80px 72px 60px", position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 24 }}>Shape Store</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 80, alignItems: "end" }}>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(56px, 7.5vw, 108px)", lineHeight: 0.9, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, color: INK }}>
            Spend<br />the <em style={{ fontStyle: "italic", fontWeight: 500, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>points</em> you earned.
          </h1>
          <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.65)", margin: 0, maxWidth: 420 }}>
            Trade Shape Score for Shape merch, training credits, nutrition services, and membership perks. No expiry on points.
            <span style={{ display: "block", marginTop: 14, fontSize: 13, color: TEAL, fontWeight: 600 }}>150 points = $1 · earned by showing up.</span>
          </p>
        </div>

        <div style={{ marginTop: 64, display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 0, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          <div style={{ padding: "28px 28px 28px 0" }}>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Available balance</div>
            <div style={{ fontFamily: serif, fontSize: 76, letterSpacing: "-0.035em", color: INK, lineHeight: 1, marginTop: 12 }}>
              {balance.toLocaleString()}
              <span style={{ fontSize: 18, color: "rgba(242,237,228,0.55)", fontFamily: sans, marginLeft: 10 }}>pts</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: TEAL, marginTop: 8 }}>≈ ${(balance / SHAPE_PTS_PER_USD).toFixed(2)} value</div>
            {hasCredit && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, border: `1px solid ${TEAL}55`, background: "rgba(10,197,168,0.08)" }}>
                <div style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Coach credit wallet</div>
                <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
                  {credit.session > 0 && <div><div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>${(credit.session / 100).toFixed(0)}</div><div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.6)", marginTop: 2 }}>Session</div></div>}
                  {credit.nutrition > 0 && <div><div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>${(credit.nutrition / 100).toFixed(0)}</div><div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.6)", marginTop: 2 }}>Nutrition</div></div>}
                </div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 6 }}>Applies automatically at your next coach checkout.</div>
              </div>
            )}
            <a href="Score.html" style={{ fontFamily: sans, fontSize: 12, color: TEAL, marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
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

function StoreFilters({ cat, setCat, sort, setSort, query, setQuery, affordable, setAffordable, categories = CATEGORIES }) {
  const pill = (on) => ({ padding: "9px 16px", borderRadius: 999, border: on ? `1px solid ${INK}` : "1px solid rgba(242,237,228,0.18)", background: on ? INK : "transparent", color: on ? PAPER : INK, fontFamily: sans, fontSize: 13, cursor: "pointer", fontWeight: on ? 500 : 400 });
  return (
    <section style={{ padding: "28px 72px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.02)", position: "sticky", top: 76, zIndex: 40, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {categories.map((c) => <button key={c} style={pill(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
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

function ProductCard({ p, balance, onRedeem, locked = false, busy = false, inCart = 0, onAdd, onQty }) {
  const canAfford = !p.locked && p.cost <= balance;
  const membersOnly = locked && !p.locked; // browsing is open; redeeming is members-only
  const merch = p.cat === "Shape Merch"; // merch bundles into the cart; the rest redeem 1-tap
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
          {p.locked ? (
            <button disabled style={{ padding: "9px 14px", borderRadius: 6, background: "rgba(242,237,228,0.08)", color: "rgba(242,237,228,0.45)", border: 0, fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: "not-allowed" }}>Tier locked</button>
          ) : membersOnly ? (
            <button onClick={() => onRedeem && onRedeem(p)} style={{ padding: "9px 14px", borderRadius: 6, background: "rgba(232,177,74,0.16)", color: "#e8b14a", border: "1px solid rgba(232,177,74,0.4)", fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Members only</button>
          ) : merch ? (
            inCart > 0 ? (
              <div style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${TEAL}`, borderRadius: 999, overflow: "hidden" }}>
                <button onClick={() => onQty && onQty(p.itemId, inCart - 1)} aria-label="Remove one" style={{ width: 32, height: 32, border: 0, background: "transparent", color: TEAL, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>−</button>
                <span style={{ minWidth: 24, textAlign: "center", fontFamily: sans, fontSize: 14, fontWeight: 700, color: INK }}>{inCart}</span>
                <button onClick={() => onAdd && onAdd(p)} aria-label="Add one" disabled={inCart >= 9} style={{ width: 32, height: 32, border: 0, background: "transparent", color: inCart >= 9 ? "rgba(242,237,228,0.4)" : TEAL, fontSize: 18, fontWeight: 700, cursor: inCart >= 9 ? "default" : "pointer", lineHeight: 1 }}>+</button>
              </div>
            ) : (
              <button onClick={() => { if (canAfford) onAdd && onAdd(p); }} disabled={!canAfford} style={{ padding: "9px 16px", borderRadius: 999, background: canAfford ? "rgba(10,197,168,0.14)" : "rgba(242,237,228,0.08)", color: canAfford ? TEAL : "rgba(242,237,228,0.45)", border: canAfford ? `1px solid ${TEAL}` : 0, fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: canAfford ? "pointer" : "not-allowed" }}>{canAfford ? "+ Add to cart" : `+${(p.cost - balance).toLocaleString()} to go`}</button>
            )
          ) : (
            <button disabled={busy ? true : !canAfford} onClick={() => { if (busy) return; if (canAfford && onRedeem) onRedeem(p); }} style={{ padding: "9px 14px", borderRadius: 6, background: canAfford ? INK : "rgba(242,237,228,0.08)", color: canAfford ? PAPER : "rgba(242,237,228,0.45)", border: 0, fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: canAfford ? "pointer" : "not-allowed" }}>{busy ? "Redeeming…" : p.kind === "lead_boost" ? "Activate →" : canAfford ? "Redeem →" : `+${(p.cost - balance).toLocaleString()} to go`}</button>
          )}
        </div>
      </div>
    </article>
  );
}

function StoreGrid({ locked = false, signedIn = false, balance = BALANCE, onRedeemed }) {
  const [cat, setCat] = useSStore("All");
  const [sort, setSort] = useSStore("Featured");
  const [query, setQuery] = useSStore("");
  const [affordable, setAffordable] = useSStore(false);
  const [notice, setNotice] = useSStore("");
  const [busy, setBusy] = useSStore("");
  const [confirmFor, setConfirmFor] = useSStore(null);   // non-merch item awaiting confirm (a)
  const [cart, setCart] = useSStore({});                 // merch cart { itemId: qty } (b)
  const [checkoutOpen, setCheckoutOpen] = useSStore(false);
  const [checkoutBusy, setCheckoutBusy] = useSStore(false);
  const roleHint = useMStore(() => getRoleHint(), []);
  const allProducts = useMStore(() => [...PRODUCTS, ...COACH_LEAD_BOOST_PRODUCTS], []);
  // Role-correct catalogue: coaches redeem Coach Tools (Lead Boost) + merch; clients
  // redeem session/meal/perk rewards + merch. Resolve the real role from profiles.role.
  const [isCoach, setIsCoach] = useSStore(false);
  useEStore(() => {
    let cancelled = false;
    (async () => {
      try {
        const cl = window.shapeDb && window.shapeDb.client;
        const userRes = cl && cl.auth ? await cl.auth.getUser() : null;
        const user = userRes && userRes.data ? userRes.data.user : null;
        if (!user) return;
        const r = await cl.from("profiles").select("role").eq("id", user.id).maybeSingle();
        const role = r && r.data ? r.data.role : null;
        if (!cancelled) setIsCoach(role === "trainer" || role === "nutritionist");
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);
  const roleCats = isCoach ? ["Shape Merch", "Coach Tools"] : ["Shape Merch", "Training", "Nutrition", "Shape Perks"];

  // Merch cart (one shipment) — persisted across visits.
  useEStore(() => { try { const r = JSON.parse(localStorage.getItem("shape.storeCart") || "{}"); if (r && typeof r === "object") { const clean = {}; Object.entries(r).forEach(([id, q]) => { const p = allProducts.find((x) => x.itemId === id); const n = Math.floor(Number(q)); if (p && p.cat === "Shape Merch" && n > 0) clean[id] = Math.min(9, n); }); setCart(clean); } } catch (_) {} }, []);
  useEStore(() => { try { localStorage.setItem("shape.storeCart", JSON.stringify(cart)); } catch (_) {} }, [cart]);
  const cartLines = Object.entries(cart).map(([id, qty]) => ({ p: allProducts.find((x) => x.itemId === id), qty: Number(qty) || 0 })).filter((l) => l.p && l.qty > 0);
  const cartCount = cartLines.reduce((a, l) => a + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.p.cost * l.qty, 0);
  const addToCart = (p) => { if (locked) { window.location.href = "Pricing.html"; return; } setCart((c) => ({ ...c, [p.itemId]: Math.min(9, (c[p.itemId] || 0) + 1) })); };
  const setQty = (id, qty) => setCart((c) => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = Math.min(9, qty); return n; });

  // Single-item redemption (credit / service) — confirmed first (a).
  async function doRedeem(product) {
    if (busy) return;
    setBusy(product.itemId || product.name);
    setNotice("");
    try {
      const res = await fetch("/api/store/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: product.itemId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.error === "insufficient_points") setNotice("Not enough points for that yet — keep earning!");
        else if (d.error === "membership_required") setNotice("Become a Shape member to redeem your points.");
        else setNotice((d && d.error) || "Redemption failed. Please try again.");
        return;
      }
      const extra = d.credit ? ` $${(d.credit.cents / 100).toFixed(0)} ${d.credit.kind} credit is in your wallet.` : "";
      setNotice(`${product.name} redeemed! Code ${d.code}.${extra}`);
      if (onRedeemed) onRedeemed();
    } catch (err) {
      setNotice((err && err.message) || "Redemption failed. Please try again.");
    } finally {
      setBusy("");
    }
  }

  // Non-merch redeem opens a confirm step; merch adds to the cart.
  function handleRedeem(product) {
    if (locked) { window.location.href = "Pricing.html"; return; }
    if (busy) return;
    setConfirmFor(product);
  }

  async function confirmRedeem(product) {
    if (product.kind === "lead_boost") {
      setBusy(product.itemId || product.name); setNotice("");
      try {
        const boost = await redeemLeadBoostRemote({ role: roleHint, days: product.days });
        const duration = Number(boost?.days || product.days || 0);
        setNotice(`Lead Boost is live for ${duration} days (${roleHint}). Marketplace ranking has been updated.`);
        if (onRedeemed) onRedeemed(); // refresh balance/affordability after the spend
      } catch (err) {
        setNotice((err && err.message) || "Lead Boost redemption failed. Please try again.");
      } finally { setBusy(""); setConfirmFor(null); }
      return;
    }
    await doRedeem(product);
    setConfirmFor(null);
  }

  // Checkout the whole merch cart as one order (atomic, one shipment).
  async function doCheckout(shipping) {
    if (checkoutBusy) return;
    if (locked) { window.location.href = "Pricing.html"; return; }
    setCheckoutBusy(true); setNotice("");
    try {
      const items = cartLines.map((l) => ({ itemId: l.p.itemId, qty: l.qty }));
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, shipping }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.error === "insufficient_points") setNotice("Not enough points to cover the cart — remove an item or earn more.");
        else if (d.error === "membership_required") setNotice("Become a Shape member to redeem your points.");
        else setNotice((d && d.error) || "Checkout failed. Please try again.");
        return;
      }
      const n = Array.isArray(d.items) ? d.items.length : items.length;
      setNotice(`Order placed — ${n} item${n !== 1 ? "s" : ""} on the way. Codes are in your locker + email.`);
      setCart({}); setCheckoutOpen(false);
      if (onRedeemed) onRedeemed();
    } catch (err) {
      setNotice((err && err.message) || "Checkout failed. Please try again.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  const list = useMStore(() => {
    let arr = allProducts.filter(p => {
      if (!roleCats.includes(p.cat)) return false;            // role-correct: hide other-role items
      if (cat !== "All" && p.cat !== cat) return false;
      if (affordable && (p.locked || p.cost > balance)) return false;
      if (query && !`${p.name} ${p.brand} ${p.cat}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    if (sort === "Low to high") arr = [...arr].sort((a, b) => a.cost - b.cost);
    else if (sort === "High to low") arr = [...arr].sort((a, b) => b.cost - a.cost);
    else if (sort === "New") arr = [...arr].sort((a, b) => (b.tag === "New" ? 1 : 0) - (a.tag === "New" ? 1 : 0));
    return arr;
  }, [allProducts, cat, sort, query, affordable, isCoach, balance]);

  return (
    <>
      <StoreFilters {...{ cat, setCat, sort, setSort, query, setQuery, affordable, setAffordable }} categories={["All", ...roleCats]} />
      <section style={{ padding: "48px 72px 40px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          {locked && (
            <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(232,177,74,0.4)", background: "rgba(232,177,74,0.08)" }}>
              <span style={{ fontSize: 20, filter: "grayscale(1)" }}>🔒</span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontFamily: serif, fontSize: 18, letterSpacing: "-0.015em", color: INK }}>Browse freely — join to redeem</div>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 2 }}>You still earn points. Become a member to spend them on gear, training credits & rewards.</div>
              </div>
              <a href="Pricing.html" style={{ flex: "none", fontFamily: sans, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#04201d", background: TEAL, borderRadius: 999, padding: "11px 20px", textDecoration: "none" }}>{signedIn ? "Activate · $5/mo →" : "Join Shape · $5/mo →"}</a>
            </div>
          )}
          {!!notice && (
            <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(10,197,168,0.35)", background: "rgba(10,197,168,0.08)", color: INK, fontFamily: sans, fontSize: 13 }}>
              {notice}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
            <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.65)" }}>
              {list.length} {list.length === 1 ? "item" : "items"}{cat !== "All" ? ` in ${cat}` : ""}
              {affordable ? ` · within your ${balance.toLocaleString()} balance` : ""}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Points refresh nightly · 00:00 UTC
            </div>
          </div>
          {list.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {list.map(p => <ProductCard key={p.id} p={p} balance={balance} onRedeem={handleRedeem} locked={locked} busy={busy === (p.itemId || p.name)} inCart={cart[p.itemId] || 0} onAdd={addToCart} onQty={setQty} />)}
            </div>
          ) : (
            <div style={{ padding: 80, textAlign: "center", fontFamily: sans, color: "rgba(242,237,228,0.5)", border: "1px dashed rgba(242,237,228,0.1)", borderRadius: 12 }}>
              Nothing matches. Try widening filters or clearing search.
            </div>
          )}
        </div>
      </section>
      {cartCount > 0 && (
        <button onClick={() => { setNotice(""); setCheckoutOpen(true); }} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 120, display: "inline-flex", alignItems: "center", gap: 14, padding: "14px 22px", borderRadius: 999, border: 0, background: TEAL, color: "#04201d", fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}>
          <span>Cart · {cartCount} item{cartCount !== 1 ? "s" : ""}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{cartTotal.toLocaleString()} pts · Review →</span>
        </button>
      )}
      {confirmFor && <ConfirmModal item={confirmFor} balance={balance} busy={busy === (confirmFor.itemId || confirmFor.name)} onCancel={() => { if (!busy) setConfirmFor(null); }} onConfirm={() => confirmRedeem(confirmFor)} />}
      {checkoutOpen && <CheckoutModal lines={cartLines} total={cartTotal} balance={balance} busy={checkoutBusy} notice={notice} onQty={setQty} onClose={() => { if (!checkoutBusy) setCheckoutOpen(false); }} onPlace={doCheckout} />}
    </>
  );
}

// (a) One-tap confirm before a single-item redemption (credit / service / lead
// boost) — shows the cost + the balance it leaves so the spend is deliberate.
function ConfirmModal({ item, balance, busy, onCancel, onConfirm }) {
  const after = Math.max(0, (balance || 0) - item.cost);
  const row = (label, value, accent) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0" }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>{label}</span>
      <span style={{ fontFamily: serif, fontSize: 18, color: accent ? TEAL : INK }}>{value}</span>
    </div>
  );
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(10,8,6,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "#1a1612", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: 26 }}>
        <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL }}>Confirm redemption</div>
        <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", color: INK, margin: "6px 0 14px" }}>{item.name}</div>
        <div style={{ border: "1px solid rgba(242,237,228,0.12)", borderRadius: 12, padding: "6px 16px", background: "rgba(242,237,228,0.03)" }}>
          {row("Cost", `${item.cost.toLocaleString()} pts`, true)}
          <div style={{ borderTop: "1px solid rgba(242,237,228,0.1)" }} />
          {row("Balance after", `${after.toLocaleString()} pts`)}
        </div>
        <div style={{ marginTop: 12, fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.5 }}>{item.kind === "lead_boost" ? "Activates your marketplace boost immediately." : "A confirmation code lands in your locker and email — the spend is final."}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={onCancel} disabled={busy} style={{ padding: "12px 22px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.25)", background: "transparent", color: INK, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>Cancel</button>
          <button onClick={() => !busy && onConfirm()} disabled={busy} style={{ flex: 1, padding: "12px 20px", borderRadius: 999, border: 0, background: TEAL, color: "#04201d", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>{busy ? "Redeeming…" : `Redeem · ${item.cost.toLocaleString()} pts`}</button>
        </div>
      </div>
    </div>
  );
}

// (b) Cart checkout — review lines + qty, enter ONE shipping address, see the
// points total + the balance it leaves, place the order (one shipment).
function CheckoutModal({ lines, total, balance, busy, notice, onQty, onClose, onPlace }) {
  const [f, setF] = useSStore({ name: "", line1: "", line2: "", city: "", region: "", postal: "", country: "US" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const validShip = f.name.trim() && f.line1.trim() && f.city.trim() && f.postal.trim() && f.country.trim();
  const after = (balance || 0) - total;
  const short = after < 0;
  const canPlace = lines.length > 0 && validShip && !short && !busy;
  const field = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 9, border: "1px solid rgba(242,237,228,0.18)", background: "rgba(242,237,228,0.04)", color: INK, fontFamily: sans, fontSize: 14, outline: "none" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(10,8,6,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "#1a1612", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: 26 }}>
        <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL }}>Your cart</div>
        <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: INK, margin: "6px 0 16px" }}>Checkout.</div>
        {lines.length === 0 ? (
          <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.6)", padding: "20px 0" }}>Your cart is empty.</div>
        ) : (
          <React.Fragment>
            <div style={{ border: "1px solid rgba(242,237,228,0.1)", borderRadius: 12, padding: "4px 16px", marginBottom: 16 }}>
              {lines.map((l, i) => (
                <div key={l.p.itemId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i === lines.length - 1 ? 0 : "1px solid rgba(242,237,228,0.08)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontSize: 17, color: INK, letterSpacing: "-0.01em" }}>{l.p.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{l.p.cost.toLocaleString()} pts each</div>
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid rgba(242,237,228,0.25)", borderRadius: 999, overflow: "hidden" }}>
                    <button onClick={() => onQty(l.p.itemId, l.qty - 1)} aria-label="Remove one" style={{ width: 32, height: 32, border: 0, background: "transparent", color: INK, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>−</button>
                    <span style={{ minWidth: 24, textAlign: "center", fontFamily: sans, fontSize: 14, fontWeight: 700, color: INK }}>{l.qty}</span>
                    <button onClick={() => onQty(l.p.itemId, l.qty + 1)} aria-label="Add one" disabled={l.qty >= 9} style={{ width: 32, height: 32, border: 0, background: "transparent", color: l.qty >= 9 ? "rgba(242,237,228,0.4)" : INK, fontSize: 18, fontWeight: 700, cursor: l.qty >= 9 ? "default" : "pointer", lineHeight: 1 }}>+</button>
                  </div>
                  <div style={{ minWidth: 72, textAlign: "right", fontFamily: serif, fontSize: 18, color: INK }}>{(l.p.cost * l.qty).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 2px 8px" }}>
              <span style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.7)" }}>Order total</span>
              <span style={{ fontFamily: serif, fontSize: 26, color: INK }}>{total.toLocaleString()} <span style={{ fontSize: 13, color: "rgba(242,237,228,0.5)" }}>pts</span></span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontSize: 12.5, color: short ? "#e8775a" : "rgba(242,237,228,0.55)", paddingBottom: 16 }}>
              <span>{short ? "Short by" : "Balance after"}</span>
              <span style={{ fontWeight: 700 }}>{short ? (-after).toLocaleString() : after.toLocaleString()} pts</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: "rgba(242,237,228,0.6)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "4px 0 12px" }}>Ship to</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={f.name} onChange={set("name")} placeholder="Full name" aria-label="Full name" maxLength={120} style={field} />
              <input value={f.line1} onChange={set("line1")} placeholder="Address" aria-label="Street address" maxLength={200} style={field} />
              <input value={f.line2} onChange={set("line2")} placeholder="Apt, suite (optional)" aria-label="Apartment or suite (optional)" maxLength={200} style={field} />
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
                <input value={f.city} onChange={set("city")} placeholder="City" aria-label="City" maxLength={100} style={field} />
                <input value={f.region} onChange={set("region")} placeholder="State" aria-label="State or region" maxLength={100} style={field} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={f.postal} onChange={set("postal")} placeholder="ZIP" aria-label="ZIP or postal code" maxLength={20} style={field} />
                <input value={f.country} onChange={set("country")} placeholder="Country" aria-label="Country" maxLength={60} style={field} />
              </div>
            </div>
            <div style={{ marginTop: 8, fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.5)" }}>Free shipping · points only.</div>
            {!!notice && (
              <div style={{ marginTop: 14, borderRadius: 10, border: "1px solid rgba(232,119,90,0.45)", background: "rgba(232,119,90,0.12)", padding: "11px 14px", fontFamily: sans, fontSize: 13, fontWeight: 600, color: INK }}>{notice}</div>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
              <button onClick={onClose} disabled={busy} style={{ padding: "13px 22px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.25)", background: "transparent", color: INK, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>Keep shopping</button>
              <button onClick={() => canPlace && onPlace(f)} disabled={!canPlace} style={{ flex: 1, padding: "13px 20px", borderRadius: 999, border: 0, background: canPlace ? TEAL : "rgba(242,237,228,0.1)", color: canPlace ? "#04201d" : "rgba(242,237,228,0.45)", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: canPlace ? "pointer" : "not-allowed" }}>{busy ? "Placing order…" : short ? "Not enough points" : `Place order · ${total.toLocaleString()} pts`}</button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function UnlockedCoupons({ redemptions }) {
  // Real redemptions when present; demo locker otherwise (signed-out / preview).
  const live = Array.isArray(redemptions) && redemptions.length > 0;
  const items = live
    ? redemptions.map((r) => ({
        code: r.code,
        name: r.item_name,
        redeemed: r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
        expires: "—",
      }))
    : UNLOCKED;
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
          {items.map((u, i) => (
            <div key={i} style={{ border: "1px dashed rgba(10,197,168,0.35)", borderRadius: 10, padding: "22px 24px", background: "rgba(10,197,168,0.04)", display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TEAL, letterSpacing: "0.14em" }}>{u.code}</div>
                <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginTop: 6 }}>{u.name}</div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 6 }}>Redeemed {u.redeemed}{u.expires && u.expires !== "—" ? ` · expires ${u.expires}` : ""}</div>
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
    ["Can I mix points + card?", "Not yet — the store is points-only today. Add merch to your cart and check out with points; cash top-up (points + card) is on the roadmap."],
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

// The Shape Store is a member perk — same rule as the mobile app. Coaches
// (providers) and accounts with an active subscription get in; everyone else
// sees an upgrade prompt instead of the catalogue.
function StoreMembersOnly({ signedIn }) {
  return (
    <section style={{ padding: "70px 24px 110px", position: "relative" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", background: "rgba(26,22,18,0.55)", border: "1px solid rgba(242,237,228,0.16)", borderRadius: 22, padding: "48px 40px" }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>🔒</div>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, margin: "20px 0 14px" }}>Members only</div>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(34px,5vw,56px)", lineHeight: 0.98, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, color: INK }}>The Shape Store is a <em style={{ fontStyle: "italic", color: TEAL }}>member perk.</em></h1>
        <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.55, color: "rgba(242,237,228,0.7)", margin: "18px auto 0", maxWidth: 480 }}>Become a Shape member to redeem your points for gear, training credits and rewards — plus Shape Radio, the community, and the marketplace. You still earn points; redeem them once you’re a member.</p>
        <a href="Pricing.html" style={{ display: "inline-block", marginTop: 28, fontFamily: sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#04201d", background: TEAL, borderRadius: 999, padding: "14px 28px", textDecoration: "none" }}>{signedIn ? "Activate membership · $5/mo →" : "Join Shape · $5/mo →"}</a>
      </div>
    </section>
  );
}

function StorePage() {
  const [gate, setGate] = useSStore({ loading: true, allowed: false, signedIn: false });
  // Live points balance + redemption locker (members only; falls back to the
  // seed values for signed-out / preview).
  const [store, setStore] = useSStore({ balance: null, redemptions: null, credit: null });
  const reloadStore = useMStore(() => async () => {
    try {
      const res = await fetch("/api/store/redeem", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setStore({
        balance: typeof d.balance === "number" ? d.balance : null,
        redemptions: Array.isArray(d.redemptions) ? d.redemptions : [],
        credit: (d.credit && typeof d.credit === "object") ? d.credit : { session: 0, nutrition: 0 },
      });
    } catch (_) {}
  }, []);
  useEStore(() => { if (gate.allowed) reloadStore(); }, [gate.allowed]);
  const liveBalance = store.balance == null ? BALANCE : store.balance;
  const liveCredit = store.credit || { session: 0, nutrition: 0 };
  useEStore(() => {
    let cancelled = false;
    (async () => {
      try {
        const cl = window.shapeDb && window.shapeDb.client;
        const userRes = cl && cl.auth ? await cl.auth.getUser() : null;
        const user = userRes && userRes.data ? userRes.data.user : null;
        if (!user) { if (!cancelled) setGate({ loading: false, allowed: false, signedIn: false }); return; }
        // Coaches (providers) are allowed, matching the mobile store.
        let isCoach = false;
        try {
          const r = await cl.from("profiles").select("role").eq("id", user.id).maybeSingle();
          const role = r && r.data ? r.data.role : null;
          isCoach = role === "trainer" || role === "nutritionist";
        } catch (_) {}
        if (isCoach) { if (!cancelled) setGate({ loading: false, allowed: true, signedIn: true }); return; }
        const res = await fetch("/api/stripe/subscription", { credentials: "include", cache: "no-store" });
        const d = res.ok ? await res.json() : null;
        if (!cancelled) setGate({ loading: false, allowed: !!(d && d.active === true), signedIn: true });
      } catch (_) {
        if (!cancelled) setGate({ loading: false, allowed: false, signedIn: true });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/intro/Shape%20store.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(26,22,18,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Store" />
        {gate.loading ? (
          <section style={{ padding: "120px 24px", textAlign: "center", fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.6)" }}>Loading…</section>
        ) : (
          <React.Fragment>
            <StoreHero balance={liveBalance} credit={liveCredit} />
            <StoreGrid locked={!gate.allowed} signedIn={gate.signedIn} balance={liveBalance} onRedeemed={reloadStore} />
            <UnlockedCoupons redemptions={store.redemptions} />
            <StoreFAQ />
          </React.Fragment>
        )}
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<StorePage />);
