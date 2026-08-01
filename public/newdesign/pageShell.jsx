// Shared Direction-B primitives for Marketplace + Community pages
// Spatial Cinema design language — shared tokens
const PAPER = "#1a1612";        // warm dark base (legacy name, kept: used site-wide)
const INK = "#f2ede4";          // warm cream text
const INK_DEEP = "#0b0e0c";     // true cinema base (footer / deep surfaces)
const TEAL = "#0ac5a8";         // refined cinema teal accent
const TEAL_BRIGHT = "#2ee0c4";
const RUST = "#d2693f";         // warm secondary accent
const serif = "'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif";
const sans = "'Space Grotesk', 'Space Grotesk Fallback', sans-serif";
const mono = "'JetBrains Mono', 'JetBrains Mono Fallback', monospace";

function Ph({ label, ratio = "1/1", tone = "dark", style = {} }) {
  const bg = tone === "dark" ? "#0f1513" : "#efece6";
  const fg = tone === "dark" ? "rgba(255,255,255,0.4)" : "rgba(242,237,228,0.4)";
  const stripe = tone === "dark"
    ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px)"
    : "repeating-linear-gradient(135deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 10px)";
  return (
    <div style={{ aspectRatio: ratio, background: bg, backgroundImage: stripe, borderRadius: 4, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: fg, textTransform: "uppercase", ...style }}>
      <span style={{ position: "absolute", top: 10, left: 12 }}>{label}</span>
    </div>
  );
}

function Logo({ variant = "black", size = 28 }) {
  const src = variant === "white" ? "/shape-logo-nav-white.png"
    : variant === "black" ? "/shape-logo-nav-black.png"
    : variant === "teal" ? "/shape-logo-nav-teal-white.png"
    : "/shape-logo-nav-white.png";
  // New logo has the play-icon stacked above the SHAPE wordmark (aspect ~1.87:1), not inline like the old one.
  // Scale so the overall mark reads at a comparable visual weight to the previous inline logo.
  const h = Math.round(size * 1.8);
  // Size inline (not just via the external .shape-brand-logo rule) so standalone
  // pages that don't load pageShell's stylesheet (login, landing) still constrain
  // the logo — otherwise the high-res source renders at its full intrinsic size.
  return <img className="shape-brand-logo" src={src} alt="Shape" style={{ "--shape-logo-h": `${h}px`, height: `${h}px`, width: "auto", maxWidth: "none", maxHeight: "none", objectFit: "contain", display: "block" }} />;
}

// Typeset Shape Radio wordmark for the nav — replaces the washed-out PNG
// (near-invisible over the dark mast). The real SHAPE two-triangle mark
// (logo-triangles-only.svg geometry, inline so there's no image request) sits
// between SHAPE and RADIO in the brand's own two-tone — bottom-left triangle
// teal, top-right white, per that asset's own annotation. The ON AIR tag
// states the live signal the old pulsing dot only implied.
function RadioWordmark() {
  const cream = "rgba(245,239,225,0.92)";
  return (
    <a href="/newdesign/Radio.html" aria-label="Shape Radio"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", whiteSpace: "nowrap", padding: "6px 0", lineHeight: 1 }}>
      <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: cream }}>Shape</span>
        <svg aria-hidden viewBox="8 8 79 98" style={{ height: 15, width: "auto", flex: "0 0 auto", display: "block" }}>
          <polygon points="14,47 14,100 51,73" fill={TEAL_BRIGHT} />
          <polygon points="81,14 81,65 44,39" fill={cream} />
        </svg>
        <span style={{ color: TEAL_BRIGHT }}>Radio</span>
      </span>
      <span aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 8.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, border: `1px solid ${TEAL_BRIGHT}59`, borderRadius: 3, padding: "3px 5px", lineHeight: 1, boxShadow: `0 0 10px ${TEAL_BRIGHT}26` }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: RUST, boxShadow: `0 0 6px ${RUST}`, flex: "0 0 auto" }} />
        ON AIR
      </span>
    </a>
  );
}

function NavDropdown({ label, items, active, activeMatch }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef(null);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 150); };
  const isActive = activeMatch.includes(active);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", height: "100%" }} onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
      <a onClick={() => setOpen(o => !o)} style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "lowercase", color: isActive ? "#f5efe1" : "rgba(245,239,225,0.78)", fontFamily: sans, fontWeight: 400, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, lineHeight: 1 }}>
        {label}<span style={{ fontSize: 9, opacity: 0.5, lineHeight: 1 }}>▾</span>
      </a>
      {/* Invisible hover bridge — fills the gap between trigger and panel so the
          cursor never crosses dead space that could trigger mouseLeave. */}
      {open && <div onMouseEnter={cancelClose} style={{ position: "absolute", top: "100%", left: 0, right: 0, height: 20 }} />}
      {open && (
        <div onMouseEnter={cancelClose} onMouseLeave={scheduleClose} style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", minWidth: 220 }}>
          <div style={{ background: "rgba(26,22,18,0.98)", backdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: 10, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
          {items.map(([n, href]) => (
            <a key={n} href={href} style={{ display: "block", padding: "10px 14px", fontSize: 13, color: "rgba(242,237,228,0.85)", fontFamily: sans, borderRadius: 4, whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(10,197,168,0.12)"; e.currentTarget.style.color = INK; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(242,237,228,0.85)"; }}
            >{n}</a>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SHAPE_NAV_GROUPS = [
  { kind: "link", label: "About", href: "About.html" },
  { kind: "drop", label: "Clients", match: ["Clients", "My Profile", "Overview", "Dashboard", "Client Overview", "Client Dashboard"], items: [["Overview", "Client.html"], ["Dashboard", "ClientDashboard.html"]] },
  { kind: "drop", label: "Trainers", match: ["Trainers", "Trainer Profile", "Trainer Overview", "Trainer Dashboard"], items: [["Overview", "Coach.html"], ["Dashboard", "TrainerDashboard.html"]] },
  { kind: "drop", label: "Nutritionists", match: ["Nutritionists", "Nutritionist Profile", "Nutritionist Overview", "Nutritionist Dashboard", "Recipes"], items: [["Overview", "Nutritionist.html"], ["Dashboard", "NutritionistDashboard.html"], ["Recipes", "Recipes.html"]] },
  { kind: "link", label: "Marketplace", href: "Marketplace.html" },
  { kind: "link", label: "Community", href: "Community.html" },
  { kind: "drop", label: "Rewards", match: ["Rewards", "Shape Score", "Store"], items: [["Shape Score", "Score.html"], ["Shape Store", "Store.html"]] },
  { kind: "link", label: "App", href: "GetApp.html" },
  { kind: "link", label: "Pricing", href: "Pricing.html" },
];

// Role-scoped portal nav — shown instead of the marketing nav once a user
// is signed in, so each profile only sees tabs relevant to it.
const PORTAL_NAV = {
  client: [
    { kind: "link", label: "Dashboard", href: "ClientDashboard.html" },
    { kind: "link", label: "Workouts", href: "ClientTrain.html" },
    { kind: "link", label: "Nutrition", href: "ClientNutri.html" },
    { kind: "link", label: "Progress", href: "ClientProgress.html" },
    { kind: "link", label: "Community", href: "ClientCommunity.html" },
  ],
  trainer: [
    { kind: "link", label: "Dashboard", href: "TrainerDashboard.html" },
    { kind: "link", label: "Schedule", href: "TrainerSchedule.html" },
    { kind: "link", label: "Clients", href: "TrainerClients.html" },
    { kind: "link", label: "Programs", href: "TrainerPrograms.html" },
    { kind: "link", label: "Messages", href: "TrainerMessages.html" },
    { kind: "link", label: "Business", href: "TrainerAnalytics.html" },
  ],
  nutritionist: [
    { kind: "link", label: "Dashboard", href: "NutritionistDashboard.html" },
    { kind: "link", label: "Schedule", href: "NutritionistSchedule.html" },
    { kind: "link", label: "Clients", href: "NutritionistClients.html" },
    { kind: "link", label: "Plans", href: "NutritionistPlans.html" },
    { kind: "link", label: "Messages", href: "NutritionistMessages.html" },
    { kind: "link", label: "Business", href: "NutritionistAnalytics.html" },
  ],
};

// The nav groups to show: role-scoped portal nav when signed in, else marketing.
function navGroupsFor(authUser) {
  if (authUser && authUser.role && PORTAL_NAV[authUser.role]) return PORTAL_NAV[authUser.role];
  if (authUser) return PORTAL_NAV.client;
  return SHAPE_NAV_GROUPS;
}

// ── Universal search — site-wide ⌕ in the header ─────────────────────────────
// Same search_shape_people RPC the app uses: every account by name / @handle /
// goal keywords (role + photo + points → tier color). Nora (Shape's concierge)
// matches help/support queries and opens the chat widget's Help tab. Rows link
// to the person's public profile page.
const SS_TIERS = [[15000, "#e879a6"], [5000, "#a78bfa"], [2000, "#34d6c5"], [750, "#d8a23a"], [0, "#5fa96e"]];
function ssTierColor(points) { const p = Number(points) || 0; for (const [min, c] of SS_TIERS) { if (p >= min) return c; } return "#5fa96e"; }
function ssShade(hex, f) { const h = String(hex || "#888").replace("#", ""); const s = h.length === 3 ? h.split("").map(x => x + x).join("") : h; const n = parseInt(s, 16); return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`; }
// Facet gem avatar (rotated rounded-square, tier gradient, counter-rotated
// content) — matches the marketplace / living-profile / app avatar.
function SsFacet({ photo, ini, color, size = 38 }) {
  const inset = Math.max(2, Math.round(size * 0.055));
  return (
    <span style={{ width: size, height: size, flexShrink: 0, position: "relative", display: "inline-grid", placeItems: "center" }}>
      <span style={{ position: "absolute", inset: 0, transform: "rotate(45deg)", borderRadius: "27%", background: `linear-gradient(135deg, ${color}, ${ssShade(color, 0.5)})`, boxShadow: `0 5px 16px ${color}55, inset 1px 1px 2px rgba(255,255,255,0.35)` }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: "27%", background: "linear-gradient(135deg, rgba(255,255,255,0.28), transparent 42%)" }} />
        <span style={{ position: "absolute", inset, borderRadius: "23%", overflow: "hidden", background: "#0f0c0a", display: "grid", placeItems: "center" }}>
          {photo
            ? <img src={photo} alt="" style={{ position: "absolute", width: "152%", height: "152%", left: "50%", top: "50%", transform: "translate(-50%,-50%) rotate(-45deg)", objectFit: "cover" }} />
            : <span style={{ transform: "rotate(-45deg)", fontFamily: serif, fontWeight: 500, fontSize: size * 0.4, color: "#f2ede4", lineHeight: 1 }}>{ini}</span>}
        </span>
      </span>
    </span>
  );
}
// Not every page includes supabase.js, so the search lazy-loads the Supabase
// client (window.shapeDb) on first use — CDN first, then /supabase.js.
let _ssDbPromise = null;
function ssEnsureDb() {
  if (window.shapeDb && window.shapeDb.client) return Promise.resolve(window.shapeDb);
  if (_ssDbPromise) return _ssDbPromise;
  const load = (src) => new Promise((res, rej) => {
    const existing = document.querySelector('script[data-ssdb="' + src + '"]');
    if (existing) { existing.addEventListener("load", () => res()); existing.addEventListener("error", rej); return; }
    const s = document.createElement("script"); s.src = src; s.async = true; s.setAttribute("data-ssdb", src);
    // SRI on the pinned, immutable supabase-js vendor bundle (matches the static
    // <script integrity> tags); /supabase.js is our own mutable same-origin wrapper.
    if (src.indexOf("/vendor/supabase-js-") === 0) { s.integrity = "sha384-nD3dwv4+ZqdYnmZKe/249ImlV04om7xTCcsoSeQYI+RO+XlKPoqAWaJR1M5SJH9p"; s.crossOrigin = "anonymous"; }
    s.onload = () => res(); s.onerror = rej; document.head.appendChild(s);
  });
  _ssDbPromise = (window.supabase && window.supabase.createClient ? Promise.resolve() : load("/vendor/supabase-js-2.108.2.umd.js"))
    .then(() => (window.shapeDb && window.shapeDb.client) ? null : load("/supabase.js"))
    .then(() => (window.shapeDb && window.shapeDb.client) ? window.shapeDb : null)
    .catch((e) => { try { console.error("[shape] Supabase bundle failed to load", e); } catch (_) {} return null; });
  return _ssDbPromise;
}
function SiteSearch({ signedIn = false }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(null); // null = idle · [] = none
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (open) { ssEnsureDb(); const id = setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch (e) {} }, 60); return () => clearTimeout(id); } }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  React.useEffect(() => {
    const query = q.trim().replace(/^@/, "");
    if (!open || !query) { setRows(null); return undefined; }
    let dead = false;
    const id = setTimeout(() => {
      ssEnsureDb().then(db => {
        if (dead) return;
        const sb = db && db.client;
        if (!sb) { setRows([]); return; }
        sb.rpc("search_shape_people", { p_q: query, p_limit: 12 })
          .then(r => { if (!dead) setRows(Array.isArray(r.data) ? r.data : []); })
          .catch(() => { if (!dead) setRows([]); });
      });
    }, 250);
    return () => { dead = true; clearTimeout(id); };
  }, [q, open]);
  const needle = q.trim().replace(/^@/, "").toLowerCase();
  const noraHit = !!needle && ("nora".includes(needle) || ["concierge", "support", "help", "assistant"].some(w => w.startsWith(needle)));
  const roleLabelOf = (r) => r === "trainer" ? "Trainer" : r === "nutritionist" ? "Nutritionist" : "Member";
  const roleColorOf = (r) => r === "trainer" ? "#c0533b" : r === "nutritionist" ? "#a07a2e" : TEAL;
  const openNora = () => { setOpen(false); try { if (window.__openChat) window.__openChat("Nora", "support"); else window.location.href = "/newdesign/Community.html"; } catch (e) {} };
  const rowStyle = { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, textDecoration: "none", cursor: "pointer", background: "transparent", border: 0, width: "100%", textAlign: "left" };
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search Shape" title="Search Shape" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, border: "1px solid rgba(245,239,225,0.25)", background: "transparent", color: "rgba(245,239,225,0.75)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.2" /><path d="m15.3 15.3 5.2 5.2" /></svg>
      </button>
      {/* Portaled to <body>: the header's backdrop-filter makes it the
          containing block for fixed descendants, which would trap + clip the
          overlay inside the 60px nav bar. */}
      {open && ReactDOM.createPortal(
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", overflowY: "auto", padding: "12vh 18px 40px" }}>
          <div style={{ maxWidth: 540, margin: "0 auto", background: "#16130f", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, boxShadow: "0 30px 80px rgba(0,0,0,0.55)", padding: "18px 18px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: sans, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", color: "#f2ede4" }}>Search Shape<span style={{ color: TEAL }}>.</span></div>
              <button onClick={() => setOpen(false)} aria-label="Close search" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", cursor: "pointer", fontFamily: mono, fontSize: 14, fontWeight: 700, padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, @handles, goals…"
              style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: "11px 2px", border: 0, borderBottom: "1px solid rgba(242,237,228,0.2)", borderRadius: 0, background: "transparent", color: "#f2ede4", fontFamily: sans, fontSize: 16, outline: "none" }} />
            <div style={{ padding: "10px 0 6px" }}>
              {noraHit && (
                <button onClick={openNora} style={rowStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(242,237,228,0.05)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <SsFacet photo="/nora-avatar.png" ini="N" color={TEAL} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Shape's Concierge · always online</span>
                    <span style={{ display: "block", marginTop: 2, fontFamily: sans, fontSize: 15, fontWeight: 600, color: "#f2ede4" }}>Nora</span>
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(242,237,228,0.4)" }}>›</span>
                </button>
              )}
              {q.trim() ? (
                rows === null ? (
                  <div style={{ padding: "12px 12px 8px", fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>Searching…</div>
                ) : rows.length === 0 && !noraHit ? (
                  <div style={{ padding: "12px 12px 8px", fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.55)" }}>
                    {signedIn ? <>Nothing on Shape matches “{q.trim()}”. <a href="/newdesign/Marketplace.html" style={{ color: TEAL, textDecoration: "none" }}>Browse coaches →</a></> : <>Sign in to search every member & coach on Shape. <a href="/newdesign/Login.html" style={{ color: TEAL, textDecoration: "none" }}>Log in →</a></>}
                  </div>
                ) : rows.map((p) => (
                  <a key={p.id} href={`/newdesign/MemberProfile.html?u=${encodeURIComponent(p.id)}`} style={rowStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(242,237,228,0.05)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <SsFacet photo={p.avatar || ""} ini={String(p.full_name || "?").split(" ").map(w => w.charAt(0)).join("").slice(0, 2).toUpperCase()} color={ssTierColor(p.points)} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: roleColorOf(p.role) }}>{roleLabelOf(p.role)}</span>
                      <span style={{ display: "block", marginTop: 2, fontFamily: sans, fontSize: 15, fontWeight: 600, color: "#f2ede4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.full_name}</span>
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(242,237,228,0.4)" }}>›</span>
                  </a>
                ))
              ) : (
                <div style={{ padding: "12px 12px 8px", fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.5)" }}>Find anyone on Shape — members, coaches, or Nora for help.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function MobileDrawer({ open, onClose, active, authUser, onLogout }) {
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  const groups = navGroupsFor(authUser);
  const linkBase = { display: "block", padding: "18px 0", fontFamily: sans, fontSize: 22, letterSpacing: "0.02em", borderBottom: "1px solid rgba(242,237,228,0.08)", textDecoration: "none" };
  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,22,18,0.98)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", flexDirection: "column", padding: "20px 24px 32px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <a href="index.html" style={{ display: "inline-flex", alignItems: "center" }}><Logo variant="white" size={44} /></a>
        <button onClick={onClose} aria-label="Close menu"
          style={{ background: "transparent", color: INK, border: 0, fontSize: 30, lineHeight: 1, padding: 8, cursor: "pointer", fontFamily: sans }}>×</button>
      </div>
      <nav style={{ flex: 1 }}>
        {groups.map(g => g.kind === "drop" ? (
          <div key={g.label}>
            <div style={{ ...linkBase, color: g.match.includes(active) ? TEAL : INK, fontWeight: 500, borderBottom: "1px solid rgba(242,237,228,0.12)", paddingBottom: 10 }}>{g.label}</div>
            <div style={{ paddingLeft: 14, paddingBottom: 14, borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
              {g.items.map(([n, h]) => (
                <a key={n} href={h} style={{ display: "block", padding: "10px 0", fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.72)", textDecoration: "none" }}>{n}</a>
              ))}
            </div>
          </div>
        ) : (
          <a key={g.label} href={g.href} style={{ ...linkBase, color: active === g.label ? TEAL : INK, fontWeight: active === g.label ? 500 : 400 }}>{g.label}</a>
        ))}
      </nav>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        {authUser ? (
          <a href="#" onClick={onLogout} style={{ flex: 1, textAlign: "center", padding: "14px 18px", borderRadius: 6, border: "1px solid rgba(242,237,228,0.2)", color: INK, fontFamily: sans, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none" }}>Sign out</a>
        ) : (
          <>
            <a href="Login.html" style={{ flex: 1, textAlign: "center", padding: "14px 18px", borderRadius: 6, border: "1px solid rgba(242,237,228,0.2)", color: INK, fontFamily: sans, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none" }}>Log in</a>
            <a href="Landing.html" style={{ flex: 1, textAlign: "center", padding: "14px 18px", borderRadius: 6, background: INK, color: PAPER, fontFamily: sans, fontSize: 14, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none" }}>Get started</a>
          </>
        )}
      </div>
    </div>
  );
}

function Header({ active }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [authUser, setAuthUser] = React.useState(null);
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : { user: null })
      .then(d => { if (!cancelled) setAuthUser(d && d.user ? d.user : null); })
      .catch(() => { if (!cancelled) setAuthUser(null); });
    return () => { cancelled = true; };
  }, []);
  async function handleLogout(e) {
    e.preventDefault();
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    window.location.href = '/';
  }
  async function switchRole(nextRole) {
    setRoleMenuOpen(false);
    if (!authUser || nextRole === authUser.role) return;
    try {
      const res = await fetch('/api/me/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dashboard) {
        window.location.href = data.dashboard;
      } else {
        alert(data.error || 'Could not switch role.');
      }
    } catch (err) {
      console.error('[header] switchRole failed', err);
    }
  }
  const roleLabel = (r) => r === 'trainer' ? 'Trainer' : r === 'nutritionist' ? 'Nutritionist' : 'Client';
  const dashboardHref = (r) => r === 'trainer'
    ? '/newdesign/TrainerDashboard.html'
    : r === 'nutritionist'
      ? '/newdesign/NutritionistDashboard.html'
      : '/newdesign/ClientDashboard.html';
  // Wrap plain-link nav items in the same outer container shape NavDropdown
  // uses, so they share vertical-centering and any future container styles.
  const link = (name, href) => (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", height: "100%" }}>
      <a href={href} className="shape-nav-link" style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "lowercase", color: active === name ? "#f5efe1" : "rgba(245,239,225,0.78)", fontFamily: sans, fontWeight: 400, whiteSpace: "nowrap", lineHeight: 1, display: "inline-flex", alignItems: "center" }}>{name}</a>
    </div>
  );
  return (
    <>
    <header className="shape-header" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, background: "rgba(11,14,12,0.55)", backdropFilter: "blur(20px) saturate(1.05)", WebkitBackdropFilter: "blur(20px) saturate(1.05)", borderBottom: "1px solid rgba(245,239,225,0.06)" }}>
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent 0%, ${TEAL} 30%, ${RUST} 70%, transparent 100%)`, opacity: 0.5 }} />
      <ShapeMobileStyles />
      <div className="shape-header-inner" style={{ maxWidth: 1480, margin: "0 auto", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "10px 44px", gap: 20 }}>
        <a href="index.html" style={{ flex: "none", display: "inline-flex", alignItems: "center", lineHeight: 0, marginLeft: 16 }}>
          <img src="/shape-logo-nav-teal-white.png" alt="Shape" style={{ height: 60, width: "auto", display: "block", objectFit: "contain" }} />
        </a>
        <nav className="shape-nav-tabs" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "nowrap", whiteSpace: "nowrap", justifyContent: "center", minWidth: 0 }}>
          {navGroupsFor(authUser).map(g => g.kind === "drop"
            ? <NavDropdown key={g.label} label={g.label} active={active} activeMatch={g.match} items={g.items} />
            : <React.Fragment key={g.label}>{link(g.label, g.href)}</React.Fragment>
          )}
        </nav>
        <div className="shape-nav-auth" style={{ display: "flex", alignItems: "center", gap: 13, flexShrink: 0 }}>
          <SiteSearch signedIn={!!authUser} />
          {authUser ? (
            <>
              <span style={{ fontSize: 12.5, color: INK, fontFamily: sans, fontWeight: 500, whiteSpace: "nowrap", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.005em" }}>Hi, {authUser.firstName || authUser.email}</span>
              {authUser.roles && authUser.roles.length > 1 ? (
                <div style={{ position: "relative" }} onMouseEnter={() => setRoleMenuOpen(true)} onMouseLeave={() => setRoleMenuOpen(false)}>
                  <button onClick={() => setRoleMenuOpen(v => !v)} style={{ background: "rgba(10,197,168,0.1)", border: `1px solid ${TEAL}`, color: TEAL, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", padding: "6px 12px", borderRadius: 999, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, lineHeight: 1, whiteSpace: "nowrap" }}>
                    {roleLabel(authUser.role)} <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
                  </button>
                  {roleMenuOpen && (
                    <div style={{ position: "absolute", top: "100%", right: 0, paddingTop: 8, minWidth: 180, zIndex: 60 }}>
                      <div style={{ background: "rgba(26,22,18,0.98)", backdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: 6, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", padding: "8px 12px 4px" }}>Switch profile</div>
                        {authUser.roles.map(r => (
                          <button key={r} onClick={() => switchRole(r)} disabled={r === authUser.role} style={{ width: "100%", textAlign: "left", background: r === authUser.role ? "rgba(10,197,168,0.12)" : "transparent", border: 0, padding: "9px 12px", fontFamily: sans, fontSize: 13, color: r === authUser.role ? TEAL : "rgba(242,237,228,0.85)", cursor: r === authUser.role ? "default" : "pointer", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "space-between", lineHeight: 1 }}
                            onMouseEnter={e => { if (r !== authUser.role) { e.currentTarget.style.background = "rgba(10,197,168,0.08)"; e.currentTarget.style.color = INK; } }}
                            onMouseLeave={e => { if (r !== authUser.role) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(242,237,228,0.85)"; } }}
                          >
                            <span>{roleLabel(r)}</span>
                            {r === authUser.role && <span style={{ fontSize: 10, color: TEAL }}>● active</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <a href={dashboardHref(authUser.role)} style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,239,225,0.66)", fontFamily: mono, whiteSpace: "nowrap", lineHeight: 1, textDecoration: "none" }}>Dashboard</a>
              <a href="#" onClick={handleLogout} style={{ background: "transparent", color: "#f5efe1", border: "1px solid #f5efe1", padding: "8px 15px", borderRadius: 999, fontSize: 11.5, fontWeight: 400, letterSpacing: "0.04em", textTransform: "lowercase", fontFamily: sans, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-flex", alignItems: "center", lineHeight: 1, transition: "background .2s ease, color .2s ease" }}>Sign out</a>
              <RadioWordmark />
            </>
          ) : (
            <>
              <a href="/newdesign/Login.html" style={{ fontSize: 13, fontWeight: 300, letterSpacing: "0.04em", textTransform: "lowercase", color: "rgba(245,239,225,0.78)", fontFamily: sans, whiteSpace: "nowrap", lineHeight: 1 }}>Log in</a>
              <a href="/newdesign/Landing.html" style={{ background: "transparent", color: "#f5efe1", border: "1px solid #f5efe1", padding: "8px 15px", borderRadius: 999, fontSize: 11.5, fontWeight: 400, letterSpacing: "0.04em", textTransform: "lowercase", fontFamily: sans, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-flex", alignItems: "center", lineHeight: 1, transition: "background .2s ease, color .2s ease" }}>Get started</a>
              <RadioWordmark />
            </>
          )}
        </div>
        <button className="shape-nav-burger" aria-label="Open menu" onClick={() => setDrawerOpen(true)}
          style={{ display: "none", background: "transparent", border: 0, color: INK, width: 40, height: 40, padding: 0, cursor: "pointer", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} active={active} authUser={authUser} onLogout={handleLogout} />
    </header>
    <div aria-hidden className="shape-header-spacer" style={{ height: 82 }} />
    </>
  );
}

function HeroBg() {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url('/get%20started.png')", backgroundSize: "cover", backgroundPosition: "center 40%", pointerEvents: "none" }} />
      {/* Lighter gradient — let the road image breathe */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.55) 0%, rgba(26,22,18,0.1) 35%, rgba(26,22,18,0.1) 55%, rgba(26,22,18,0.85) 92%, rgba(26,22,18,1) 100%)", pointerEvents: "none" }} />
    </>
  );
}

function Footer({ logoHeight = 64 } = {}) {
  return (
    <footer className="shape-footer" style={{ position: "relative", padding: "56px 72px 36px", background: INK_DEEP, color: INK }}>
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent 0%, ${TEAL} 30%, ${RUST} 70%, transparent 100%)`, opacity: 0.55 }} />
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div className="shape-footer-cta" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 36, textAlign: "center" }}>
          <img src="/shape-logo-nav-white.png" alt="Shape" style={{ height: logoHeight, width: "auto", display: "block", margin: "0 auto", objectFit: "contain" }} />
          <div style={{ fontFamily: serif, fontSize: 20, fontStyle: "italic", letterSpacing: "-0.02em", color: INK }}>Join the community</div>
        </div>
        <div className="shape-footer-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28, paddingTop: 30, borderTop: "1px solid rgba(242,237,228,0.1)", justifyItems: "center", textAlign: "center" }}>
          {[
            ["Product",      [["Marketplace", "Marketplace.html"], ["Shape Score", "Score.html"], ["Radio", "Radio.html"], ["Dashboard", "ClientDashboard.html"]]],
            ["For trainers", [["Apply", "SignupTrainer.html"], ["Payouts", "TrainerDashboard.html"], ["Programs", "TrainerPrograms.html"]]],
            ["Company",      [["About", "About.html"], ["Press", "Team.html#press"], ["Privacy", "/privacy.html"], ["Terms", "/terms.html"], ["Code of conduct", "/code-of-conduct.html"], ["Data & compliance", "/data-compliance.html"], ["Consumer health data", "/health-data-privacy.html"], ["Subprocessors", "/subprocessors.html"]]],
            ["Support",      [["Help", "/help.html"], ["Contact", "/contact.html"]]],
          ].map(([h, items]) => (
            <div key={h}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>{h}</div>
              {items.map(([label, href]) => <div key={label} style={{ marginBottom: 8 }}><a href={href} className="shape-foot-link" style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.72)", textDecoration: "none", transition: "color .15s ease" }}>{label}</a></div>)}
            </div>
          ))}
        </div>
        <div className="shape-footer-base" style={{ marginTop: 36, paddingTop: 18, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, letterSpacing: "0.16em", color: "rgba(242,237,228,0.42)" }}>
          <span>© 2026 SHAPE</span>
          <span>BROOKLYN · LISBON · MELBOURNE</span>
        </div>
      </div>
    </footer>
  );
}

function ShapeMobileStyles() {
  return (
    <style>{`
      /* Metrics-matched fallback fonts — the local fallback is scaled (size-adjust +
         ascent/descent overrides) to occupy the SAME space as the web font, so the swap
         on load doesn't reflow headers (Fraunces), sub-heads (JetBrains Mono) or body
         (Space Grotesk). Metrics from @capsizecss (next/font formula). CLS guard. */
      @font-face{font-family:'Fraunces Fallback';src:local('Times New Roman');size-adjust:115.45%;ascent-override:84.71%;descent-override:22.09%;line-gap-override:0%}
      @font-face{font-family:'Space Grotesk Fallback';src:local('Arial');size-adjust:109.69%;ascent-override:89.71%;descent-override:26.62%;line-gap-override:0%}
      @font-face{font-family:'JetBrains Mono Fallback';src:local('Courier New');size-adjust:99.98%;ascent-override:102.02%;descent-override:30%;line-gap-override:0%}
      html, body { overflow-x: hidden; }
      /* Spatial Cinema chrome micro-interactions */
      .shape-nav-link, .shape-foot-link { transition: color .16s ease, border-color .16s ease; }
      .shape-foot-link:hover { color: ${TEAL_BRIGHT} !important; }
      .shape-nav-link:hover { color: ${INK} !important; }
      .shape-header { transition: background .25s ease; }
      /* Nudge the centered nav toward true page-center (the right cluster is
         heavier than the logo, so it sits left-of-center). Condensed auth pills +
         smaller radio logo free the room; zero below 1300 so it never crowds. */
      .shape-nav-tabs { transform: translateX(clamp(0px, (100vw - 1300px) * 0.5, 72px)); }
      .shape-brand-logo {
        height: var(--shape-logo-h) !important;
        width: auto !important;
        max-width: none !important;
        max-height: none !important;
        object-fit: contain !important;
        display: block !important;
        flex: 0 0 auto;
      }
      /* Header-only: the authed coach/portal nav + auth cluster is too wide to
         sit on one row below ~1200px — collapse to the burger there (without
         triggering the marketing typography/section scaling at 900). */
      @media (max-width: 1200px) {
        .shape-header-inner { padding: 12px 28px !important; gap: 14px !important; }
        .shape-nav-tabs { display: none !important; }
        .shape-nav-auth { display: none !important; }
        .shape-nav-burger { display: inline-flex !important; }
      }
      @media (max-width: 900px) {
        /* Header */
        .shape-header-inner { padding: 12px 18px !important; gap: 12px !important; }
        .shape-header-spacer { height: 86px !important; }



        .shape-nav-tabs { display: none !important; }
        .shape-nav-auth { display: none !important; }
        .shape-nav-burger { display: inline-flex !important; }

        /* Dashboard layout (240px sidebar + main): collapse to one column and
           turn the sidebar into a horizontal scrolling nav bar so signed-in
           members still see + reach their tabs on mobile. */
        [style*="grid-template-columns: 240px 1fr"] { grid-template-columns: 1fr !important; }
        .shape-dash-aside { flex-direction: row !important; flex-wrap: nowrap !important; overflow-x: auto !important; gap: 8px !important; padding: 10px 16px !important; border-right: none !important; border-bottom: 1px solid rgba(242,237,228,0.08) !important; top: 96px !important; }
        .shape-dash-navlink { flex: 0 0 auto !important; white-space: nowrap !important; padding: 9px 13px !important; }
        .shape-dash-payout { display: none !important; }

        /* Footer */
        .shape-footer { padding: 32px 22px 24px !important; }
        .shape-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 28px !important; padding-top: 28px !important; }
        .shape-footer-base { flex-direction: column; gap: 10px; align-items: flex-start !important; }

        /* Typography — scale down the huge serif headlines used across the marketing pages.
           Inline font-size on h1/h2/h3 is overridden by these !important rules. */
        h1 { font-size: clamp(40px, 10.5vw, 72px) !important; line-height: 0.96 !important; letter-spacing: -0.03em !important; }
        h2 { font-size: clamp(30px, 8vw, 52px) !important; line-height: 1 !important; letter-spacing: -0.025em !important; }
        h3 { font-size: clamp(22px, 5.2vw, 34px) !important; line-height: 1.1 !important; }

        /* Section padding — every marketing section uses inline "padding: Ypx 72px" (or similar).
           Force horizontal padding down on mobile so content doesn't hug the edge or overflow. */
        section { padding-left: 22px !important; padding-right: 22px !important; }
        footer { padding-left: 22px !important; padding-right: 22px !important; }

        /* Collapse multi-column grids. Attribute selectors match the inline style
           that React serializes (e.g. "grid-template-columns: repeat(4, 1fr)"). */
        [style*="grid-template-columns: 1fr 1fr"],
        [style*="grid-template-columns:1fr 1fr"],
        [style*="grid-template-columns: 1.4fr 1fr"],
        [style*="grid-template-columns: 1.3fr 1fr"],
        [style*="grid-template-columns: 2fr 1fr"],
        [style*="grid-template-columns: repeat(2"],
        [style*="grid-template-columns: repeat(3"],
        [style*="grid-template-columns: repeat(4"],
        [style*="grid-template-columns: repeat(5"] {
          grid-template-columns: 1fr !important;
          gap: 20px !important;
        }
        /* Footer grid is special-cased above (keeps 2 cols) */
        .shape-footer-grid[style*="grid-template-columns"] { grid-template-columns: 1fr 1fr !important; }

        /* Explicit opt-in hooks for pages that want different behaviors */
        [data-mobile="scale"] h1 { font-size: clamp(40px, 11vw, 68px) !important; }
        [data-mobile="scale"] h2 { font-size: clamp(30px, 8vw, 52px) !important; }
        [data-mobile="stack-2"] { grid-template-columns: 1fr 1fr !important; gap: 16px !important; }
      }
      @media (max-width: 520px) {
        .shape-footer-grid { grid-template-columns: 1fr !important; }
        h1 { font-size: clamp(36px, 11vw, 56px) !important; }
        section { padding-left: 18px !important; padding-right: 18px !important; }
      }
    `}</style>
  );
}

Object.assign(window, { PAPER, INK, TEAL, TEAL_BRIGHT, serif, sans, Ph, Logo, Header, Footer, HeroBg, SiteSearch });

// ── Error tracking bootstrap (Sentry, static website) ─────────────────────────
// Loads public/newdesign/sentryInit.js once — pageShell.jsx is the one file
// every newdesign page shares (69 of them), so this is the single hook that
// reaches all of them without editing any page directly.
//
// window.SHAPE_SENTRY_DSN mirrors the window.SHAPE_TURNSTILE_SITEKEY shape in
// public/supabase.js (`window.X = window.X || <value>`) — but, unlike that
// precedent, carries NO fallback value below: there is no DSN yet, and
// inventing a placeholder here would make an unconfigured site read as
// configured.
//
// ⚠ With no DSN set this whole block is a genuine no-op: sentryInit.js is
// never fetched, so nothing here ever reaches Sentry — not even a script
// request — until a real DSN string is assigned on the line below.
//
// ⚠ THIS IS THE ONLY PLACE window.SHAPE_SENTRY_DSN CAN BE SET, and that is
// load-bearing, not incidental. Babel-standalone compiles every
// `type="text/babel"` tag on a page and runs them together at
// DOMContentLoaded, IN DOCUMENT ORDER — and every one of the 69 pages loads
// pageShell.jsx BEFORE its own page-specific script runs. So if a later
// change ever tries to set the DSN from a page-specific script (to canary
// one page, split staging vs prod, etc.), that assignment executes AFTER
// this guard has already read the still-falsy global and returned —
// sentryInit.js is never fetched, and there is NO console output and NO
// network difference from the intended inert state. That is the exact
// "looks healthy, isn't" failure this whole project exists to catch,
// reproduced inside its own bootstrap. The corollary: because all 69 pages
// share this ONE assignment, the day a real DSN lands here, Sentry turns on
// EVERYWHERE AT ONCE — there is no way to canary a subset of pages from
// this file alone.
(function () {
  if (typeof window === "undefined") return;
  window.SHAPE_SENTRY_DSN = window.SHAPE_SENTRY_DSN || "";
  if (!window.SHAPE_SENTRY_DSN) return;
  if (document.querySelector('script[data-shape-sentry-init]')) return;
  var s = document.createElement("script");
  s.src = "/newdesign/sentryInit.js";
  s.setAttribute("data-shape-sentry-init", "1");
  document.head.appendChild(s);
})();

// ── ShapeConfirm — shared destructive-action confirm modal (web) ─────────────
// Imperative + promise-based: window.ShapeConfirm.open({ title, name, message,
// confirmLabel, danger=true, requireType, cancelLabel }) -> Promise<boolean>.
// One styled confirm for every newdesign page (replaces ad-hoc window.confirm):
// names the specific item, states the consequence, action-labeled button, and a
// distinct RUST danger style. requireType adds a type-to-confirm text gate.
function shapeConfirmOpen(opts) {
  const o = opts || {};
  const danger = o.danger !== false;
  const accent = danger ? "#e07856" : TEAL;
  return new Promise((resolve) => {
    if (typeof document === "undefined") { resolve(true); return; }
    const need = o.requireType ? String(o.requireType) : "";
    let done = false;
    const overlay = document.createElement("div");
    // Escape cancels. Enter deliberately does NOT confirm — a destructive action
    // must be an explicit click on the action button (Enter while Cancel/the type
    // field is focused must never trigger it).
    const onKey = (e) => { if (e.key === "Escape") finish(false); };
    const finish = (val) => { if (done) return; done = true; try { document.removeEventListener("keydown", onKey); } catch (e) {} overlay.remove(); resolve(val); };
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(7,8,7,0.66);display:flex;align-items:center;justify-content:center;padding:20px;";
    const card = document.createElement("div");
    card.style.cssText = "width:100%;max-width:420px;background:#171310;border:1px solid rgba(242,237,228,0.14);border-left:3px solid " + accent + ";border-radius:12px;padding:22px 22px 18px;box-shadow:0 30px 80px rgba(0,0,0,0.5);font-family:" + sans + ";color:" + INK + ";";
    const eyebrow = document.createElement("div");
    eyebrow.textContent = danger ? "Confirm · this can’t be undone" : "Confirm";
    eyebrow.style.cssText = "font-family:" + mono + ";font-size:10px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:" + accent + ";";
    card.appendChild(eyebrow);
    const title = document.createElement("div");
    title.textContent = o.title || "Are you sure?";
    title.style.cssText = "font-family:" + serif + ";font-size:22px;font-weight:600;letter-spacing:-0.01em;margin-top:6px;color:" + INK + ";";
    card.appendChild(title);
    if (o.name) { const nm = document.createElement("div"); nm.textContent = o.name; nm.style.cssText = "font-size:15px;font-weight:600;color:" + accent + ";margin-top:3px;"; card.appendChild(nm); }
    if (o.message) { const msg = document.createElement("div"); msg.textContent = o.message; msg.style.cssText = "font-size:13.5px;line-height:1.5;color:rgba(242,237,228,0.72);margin-top:11px;"; card.appendChild(msg); }
    let input = null;
    if (need) {
      input = document.createElement("input");
      input.type = "text"; input.placeholder = "Type " + need + " to confirm";
      input.style.cssText = "width:100%;box-sizing:border-box;margin-top:14px;padding:12px 14px;border-radius:8px;border:1px solid rgba(242,237,228,0.18);background:rgba(0,0,0,0.25);color:" + INK + ";font-family:" + serif + ";font-size:16px;outline:none;";
      card.appendChild(input);
    }
    const gateOk = () => !need || (input.value || "").trim().toUpperCase() === need.toUpperCase();
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:9px;margin-top:18px;";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = o.cancelLabel || "Cancel";
    cancel.style.cssText = "flex:0 0 auto;padding:12px 22px;border-radius:999px;border:1px solid rgba(242,237,228,0.2);background:transparent;color:rgba(242,237,228,0.7);font-family:" + sans + ";font-size:14px;font-weight:600;cursor:pointer;";
    const ok = document.createElement("button");
    ok.type = "button"; ok.textContent = o.confirmLabel || "Confirm";
    const setOk = () => { const e = gateOk(); ok.style.cssText = "flex:1;min-height:46px;border-radius:999px;border:0;background:" + (e ? accent : "rgba(224,120,86,0.35)") + ";color:#fff;font-family:" + sans + ";font-size:14px;font-weight:700;cursor:" + (e ? "pointer" : "default") + ";opacity:" + (e ? 1 : 0.7) + ";"; };
    setOk();
    if (need) input.addEventListener("input", setOk);
    cancel.addEventListener("click", () => finish(false));
    ok.addEventListener("click", () => { if (gateOk()) finish(true); });
    row.appendChild(cancel); row.appendChild(ok); card.appendChild(row);
    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(false); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    if (input) input.focus(); else ok.focus();
  });
}
Object.assign(window, { ShapeConfirm: { open: shapeConfirmOpen } });

// Auto-mount the shared site footer on any page that opts in with a
// <div id="site-footer"></div> (the marketing pages). It renders in its own
// root — separate from the page's #root — and carries its own styles, so it
// looks right wherever it's dropped. Dashboard/app pages omit the div and are
// unaffected.
(function mountSiteFooter() {
  try {
    var el = document.getElementById('site-footer');
    if (el && !el.getAttribute('data-mounted') && window.ReactDOM && window.ReactDOM.createRoot) {
      // The footer mounts from the FIRST page script, long before the page's
      // own app fills #root — on slow connections it painted alone at the top
      // of the viewport, then got shoved thousands of px down when the app
      // mounted (a 0.71 layout shift, the site's whole CLS). Reserve the first
      // viewport for the app so the footer always starts below the fold.
      var appRoot = document.getElementById('root');
      if (appRoot && !appRoot.style.minHeight) appRoot.style.minHeight = '100vh';
      el.setAttribute('data-mounted', '1');
      window.ReactDOM.createRoot(el).render(<React.Fragment><ShapeMobileStyles /><Footer /></React.Fragment>);
    }
  } catch (e) {}
})();

// -----------------------------------------------------------------------------
// Calendar overlay — shared across Client / Trainer / Nutritionist pages.
// Week + Month views. Filters by role-relevant event types.
// Usage:
//   const cal = useCalendarOverlay();
//   ...
//   <a onClick={cal.open}>Open calendar →</a>
//   <CalendarOverlay {...cal.props} role="client" events={EVENTS} />
// Event shape: { date: "2026-04-18", time: "09:00" | null, kind, title, sub, with? }
// kind ∈ WORKOUT | MEAL | CHECKIN | SESSION | CONSULT | REVIEW | PLAN | ADMIN
// -----------------------------------------------------------------------------

function useCalendarOverlay() {
  const [open, setOpen] = React.useState(false);
  return {
    open: (e) => { if (e) e.preventDefault(); setOpen(true); },
    close: () => setOpen(false),
    props: { open, onClose: () => setOpen(false) },
  };
}

const KIND_COLORS = {
  WORKOUT:  "#0ac5a8",
  SESSION:  "#0ac5a8",
  MEAL:     "#e8b54a",
  PLAN:     "#e8b54a",
  CONSULT:  "#c084e8",
  CHECKIN:  "#6fb5ff",
  REVIEW:   "#6fb5ff",
  ADMIN:    "rgba(242,237,228,0.5)",
};
const KIND_LABEL = { WORKOUT:"Workout", MEAL:"Meal", CHECKIN:"Check-in", SESSION:"Session", CONSULT:"Consult", REVIEW:"Review", PLAN:"Plan", ADMIN:"Admin" };

function ymd(d) { return d.toISOString().slice(0,10); }
function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon-start
  x.setDate(x.getDate() - day); x.setHours(0,0,0,0);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtMonth(d) { return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
function fmtWeekRange(s) {
  const e = addDays(s, 6);
  const sm = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const em = e.toLocaleDateString("en-US", { month: s.getMonth()===e.getMonth() ? undefined : "short", day: "numeric" });
  return `${sm} – ${em}, ${e.getFullYear()}`;
}

function CalendarOverlay({ open, onClose, role = "client", events = [], anchorDate = null }) {
  // Anchor to the real today unless an explicit anchorDate is passed (kept for
  // demos/tests). Normalize to local midnight so the "today" highlight is exact.
  const today = React.useMemo(() => {
    const d = anchorDate ? new Date(anchorDate + "T00:00:00") : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchorDate]);
  const [view, setView] = React.useState("week"); // "week" | "month"
  const [cursor, setCursor] = React.useState(() => { const d = anchorDate ? new Date(anchorDate + "T00:00:00") : new Date(); d.setHours(0,0,0,0); return d; });
  const [selected, setSelected] = React.useState(null); // { event, anchor: {x,y,w,h} }
  const [serverEvents, setServerEvents] = React.useState(null); // live events from /api/calendar
  const [adding, setAdding] = React.useState(false);

  // Load live events for a wide window around the cursor whenever the calendar
  // is open. Falls back silently (keeps prop `events`) if the user is signed
  // out or the API is unavailable. Keyed to the cursor's month so paging refetches.
  const monthKey = `${cursor.getFullYear()}-${cursor.getMonth()}`;
  const reload = React.useCallback(() => {
    if (!open) return;
    const from = ymd(addDays(cursor, -45));
    const to = ymd(addDays(cursor, 45));
    fetch(`/api/calendar?from=${from}&to=${to}`, { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && Array.isArray(d.events)) setServerEvents(d.events); })
      .catch(() => {});
  }, [open, monthKey]);
  React.useEffect(() => { reload(); }, [reload]);

  // Server events win when present; otherwise the static prop events show.
  const allEvents = serverEvents != null ? serverEvents : events;
  const live = serverEvents != null;

  const byDate = React.useMemo(() => {
    const m = {};
    allEvents.forEach(e => { (m[e.date] = m[e.date] || []).push(e); });
    Object.values(m).forEach(list => list.sort((a,b) => (a.time||"00:00").localeCompare(b.time||"00:00")));
    return m;
  }, [allEvents]);

  if (!open) return null;

  const shift = (dir) => {
    setSelected(null);
    if (view === "week") setCursor(addDays(cursor, 7*dir));
    else { const x = new Date(cursor); x.setMonth(x.getMonth()+dir); setCursor(x); }
  };
  const setViewAndClose = (v) => { setSelected(null); setView(v); };
  const goToday = () => { setSelected(null); setCursor(today); };

  const roleLabel = { client: "My calendar", trainer: "Coaching calendar", nutritionist: "Nutrition calendar" }[role] || "Calendar";

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(10,10,8,0.92)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px", overflow: "auto" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "min(1200px, 100%)", background: PAPER, color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, boxShadow: "0 40px 120px rgba(0,0,0,0.6)", fontFamily: sans, overflow: "hidden", margin: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 28px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.18em", color: TEAL_BRIGHT }}>{roleLabel.toUpperCase()}</div>
            <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em" }}>{view === "week" ? fmtWeekRange(startOfWeek(cursor)) : fmtMonth(cursor)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "inline-flex", border: "1px solid rgba(242,237,228,0.15)", borderRadius: 999, padding: 3 }}>
              {["week","month"].map(v => (
                <button key={v} onClick={() => setViewAndClose(v)}
                  style={{ background: view===v ? INK : "transparent", color: view===v ? PAPER : INK, border: 0, padding: "6px 16px", borderRadius: 999, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
              ))}
            </div>
            <button onClick={goToday} style={{ background: "transparent", color: "rgba(242,237,228,0.8)", border: "1px solid rgba(242,237,228,0.15)", padding: "7px 14px", borderRadius: 999, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Today</button>
            <input
              type="date"
              value={ymd(cursor)}
              onChange={(e) => {
                if (!e.target.value) return;
                setSelected(null);
                setCursor(new Date(e.target.value + "T00:00:00"));
              }}
              aria-label="Jump to date"
              style={{ background: "transparent", color: "rgba(242,237,228,0.8)", border: "1px solid rgba(242,237,228,0.15)", padding: "6px 12px", borderRadius: 999, fontFamily: sans, fontSize: 12, cursor: "pointer", colorScheme: "dark" }}
            />
            <div style={{ display: "inline-flex", gap: 2 }}>
              <button onClick={() => shift(-1)} style={navArrowStyle}>‹</button>
              <button onClick={() => shift(1)} style={navArrowStyle}>›</button>
            </div>
            {live && (
              <button onClick={() => setAdding(true)} style={{ background: TEAL, color: "#031f1c", border: 0, padding: "7px 16px", borderRadius: 999, fontFamily: sans, fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>+ Add</button>
            )}
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 22, padding: "2px 10px", cursor: "pointer", marginLeft: 6 }}>×</button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 18, padding: "12px 28px", borderBottom: "1px solid rgba(242,237,228,0.06)", flexWrap: "wrap" }}>
          {legendForRole(role).map(k => (
            <div key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontFamily: sans, color: "rgba(242,237,228,0.65)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: KIND_COLORS[k] }} />
              {KIND_LABEL[k]}
            </div>
          ))}
        </div>

        {/* Body */}
        {view === "week" ? <WeekView start={startOfWeek(cursor)} byDate={byDate} today={today} onSelect={setSelected} /> : <MonthView cursor={cursor} byDate={byDate} today={today} onSelect={setSelected} />}

        {selected && <EventPopover selection={selected} role={role} onClose={() => setSelected(null)} onChanged={reload} />}
        {adding && <CalAddForm defaultDate={ymd(cursor)} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      </div>
    </div>
  );
}

// Add-event modal — writes to /api/calendar (shared with the mobile app).
function CalAddForm({ defaultDate, onClose, onSaved }) {
  const KINDS = ["WORKOUT","MEAL","CHECKIN","CONSULT","REVIEW","PLAN","REST","ADMIN"];
  const KIND_ICON = { WORKOUT: "🏋", MEAL: "🍽", CHECKIN: "✅", CONSULT: "💬", REVIEW: "📋", PLAN: "🗺", REST: "😴", ADMIN: "✦" };
  const [kind, setKind] = React.useState("WORKOUT");
  const [title, setTitle] = React.useState("");
  const [sub, setSub] = React.useState("");
  const [date, setDate] = React.useState(defaultDate);
  const [time, setTime] = React.useState("");
  const [dur, setDur] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const save = () => {
    if (!title.trim()) { setErr("Add a title."); return; }
    setBusy(true); setErr("");
    fetch("/api/calendar", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title: title.trim(), sub: sub.trim() || undefined, date, time: /^\d{1,2}:\d{2}$/.test(time) ? time : undefined, durationMin: dur ? Number(dur) : undefined }),
    })
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(() => onSaved())
      .catch(e => { setErr((e && e.error) || "Could not save."); setBusy(false); });
  };

  const field = { width: "100%", background: "rgba(242,237,228,0.06)", color: INK, border: "1px solid rgba(242,237,228,0.15)", borderRadius: 10, padding: "11px 12px", fontFamily: sans, fontSize: 14, outline: "none", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 10 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(440px, 100%)", background: PAPER, color: INK, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14, padding: 22, fontFamily: sans }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em" }}>Add to calendar</div>
          <button onClick={onClose} style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 9, fontWeight: 700 }}>Type</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7, marginBottom: 18 }}>
          {KINDS.map(k => {
            const on = kind === k;
            return (
              <button key={k} onClick={() => setKind(k)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 2px 7px", borderRadius: 12, cursor: "pointer", border: `1px solid ${on ? TEAL : "rgba(242,237,228,0.15)"}`, background: on ? "rgba(10,197,168,0.13)" : "transparent" }}>
                <span style={{ fontSize: 17, lineHeight: 1, filter: on ? "none" : "grayscale(0.4)" }}>{KIND_ICON[k] || "✦"}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", color: on ? INK : "rgba(242,237,228,0.55)" }}>{k}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={field} />
          <input value={sub} onChange={e => setSub(e.target.value)} placeholder="Details (optional)" style={field} />
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr", gap: 10 }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...field, colorScheme: "dark" }} />
            <input value={time} onChange={e => setTime(e.target.value)} placeholder="HH:MM" style={field} />
            <input value={dur} onChange={e => setDur(e.target.value)} placeholder="min" type="number" style={field} />
          </div>
        </div>
        {err && <div style={{ color: "#ff8b7f", fontSize: 12, marginTop: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>{err}</div>}
        <button onClick={save} disabled={busy} style={{ width: "100%", marginTop: 18, padding: "15px 0", borderRadius: 999, background: TEAL, color: "#031f1c", border: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.65 : 1 }}>{busy ? "Saving…" : "Add to calendar →"}</button>
      </div>
    </div>
  );
}

const navArrowStyle = { background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.15)", width: 32, height: 32, borderRadius: 999, fontFamily: sans, fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 };

function legendForRole(role) {
  if (role === "trainer") return ["SESSION","CHECKIN","REVIEW","ADMIN"];
  if (role === "nutritionist") return ["CONSULT","PLAN","REVIEW","ADMIN"];
  return ["WORKOUT","MEAL","CHECKIN"];
}

function WeekView({ start, byDate, today, onSelect }) {
  const days = Array.from({length: 7}, (_, i) => addDays(start, i));
  const hours = Array.from({length: 14}, (_, i) => i + 7); // 7am – 8pm
  return (
    <div style={{ padding: "0 28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderTop: "1px solid rgba(242,237,228,0.08)", borderLeft: "1px solid rgba(242,237,228,0.08)" }}>
        <div />
        {days.map(d => {
          const isToday = ymd(d) === ymd(today);
          return (
            <div key={d.toString()} style={{ padding: "14px 12px", borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: isToday ? "rgba(10,197,168,0.06)" : "transparent" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: isToday ? TEAL_BRIGHT : "rgba(242,237,228,0.55)" }}>{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</div>
              <div style={{ fontFamily: serif, fontSize: 22, marginTop: 4, color: isToday ? INK : "rgba(242,237,228,0.8)" }}>{d.getDate()}</div>
            </div>
          );
        })}

        {hours.map(h => (
          <React.Fragment key={h}>
            <div style={{ padding: "8px 8px 0", borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.05)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.4)", minHeight: 54 }}>
              {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}
            </div>
            {days.map(d => {
              const list = (byDate[ymd(d)] || []).filter(e => e.time && Number(e.time.slice(0,2)) === h);
              return (
                <div key={d.toString()+h} style={{ position: "relative", borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.05)", minHeight: 54, padding: 4 }}>
                  {list.map((e, i) => (
                    <EventChip key={i} e={e} onSelect={onSelect} />
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function EventChip({ e, compact, onSelect }) {
  const color = KIND_COLORS[e.kind] || TEAL;
  const handle = (ev) => {
    ev.stopPropagation();
    if (!onSelect) return;
    const r = ev.currentTarget.getBoundingClientRect();
    onSelect({ event: e, anchor: { x: r.left, y: r.top, w: r.width, h: r.height } });
  };
  return (
    <button type="button" onClick={handle} title={`${e.title}${e.sub ? " — " + e.sub : ""}`}
      style={{ display: "block", width: "100%", textAlign: "left", background: "rgba(242,237,228,0.04)", borderLeft: `3px solid ${color}`, borderTop: 0, borderRight: 0, borderBottom: 0, padding: compact ? "3px 6px" : "6px 8px", borderRadius: 3, marginBottom: 3, cursor: "pointer", overflow: "hidden", fontFamily: "inherit", color: "inherit" }}
      onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(242,237,228,0.08)"; }}
      onMouseLeave={(ev) => { ev.currentTarget.style.background = "rgba(242,237,228,0.04)"; }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        {e.time && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "rgba(242,237,228,0.55)" }}>{e.time}</span>}
        <span style={{ fontSize: compact ? 10.5 : 12, fontWeight: 500, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
      </div>
      {!compact && e.sub && <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.5)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.sub}</div>}
    </button>
  );
}

function MonthView({ cursor, byDate, today, onSelect }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = 6;
  const cells = Array.from({length: weeks*7}, (_, i) => addDays(gridStart, i));
  const weekdays = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  return (
    <div style={{ padding: "0 28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        {weekdays.map(w => <div key={w} style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)" }}>{w}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderLeft: "1px solid rgba(242,237,228,0.08)" }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = ymd(d) === ymd(today);
          const list = byDate[ymd(d)] || [];
          return (
            <div key={i} style={{ minHeight: 112, borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", padding: 8, background: isToday ? "rgba(10,197,168,0.06)" : "transparent", opacity: inMonth ? 1 : 0.35 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: isToday ? TEAL_BRIGHT : "rgba(242,237,228,0.7)", marginBottom: 4 }}>{d.getDate()}</div>
              {list.slice(0,3).map((e, j) => <EventChip key={j} e={e} compact onSelect={onSelect} />)}
              {list.length > 3 && <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.5)", paddingLeft: 4, marginTop: 2 }}>+{list.length-3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function actionsForEvent(role, kind) {
  // Returns [{ label, primary? }]
  if (role === "client") {
    if (kind === "WORKOUT") return [{ label: "Start workout", primary: true }, { label: "View plan" }, { label: "Reschedule" }];
    if (kind === "MEAL")    return [{ label: "Log meal", primary: true }, { label: "Swap meal" }, { label: "See macros" }];
    if (kind === "CHECKIN") return [{ label: "Join call", primary: true }, { label: "Message coach" }, { label: "Reschedule" }];
  }
  if (role === "trainer") {
    if (kind === "SESSION") return [{ label: "Join session", primary: true }, { label: "Open client" }, { label: "Reschedule" }];
    if (kind === "CHECKIN") return [{ label: "Join check-in", primary: true }, { label: "Open notes" }, { label: "Reschedule" }];
    if (kind === "REVIEW")  return [{ label: "Open review", primary: true }, { label: "Message client" }];
    if (kind === "ADMIN")   return [{ label: "Mark done", primary: true }, { label: "Edit" }];
  }
  if (role === "nutritionist") {
    if (kind === "CONSULT") return [{ label: "Join consult", primary: true }, { label: "Open client" }, { label: "Reschedule" }];
    if (kind === "PLAN")    return [{ label: "Open plan", primary: true }, { label: "Send to client" }];
    if (kind === "REVIEW")  return [{ label: "Open review", primary: true }, { label: "Message client" }];
    if (kind === "ADMIN")   return [{ label: "Mark done", primary: true }, { label: "Edit" }];
  }
  return [{ label: "View details", primary: true }];
}

function fmtTimeRange(time, duration) {
  if (!time) return "All day";
  const [h, m] = time.split(":").map(Number);
  const start = new Date(2026, 0, 1, h, m);
  const end = new Date(start.getTime() + (duration || 60) * 60000);
  const fmt = (d) => {
    const hh = d.getHours();
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ap = hh >= 12 ? "PM" : "AM";
    const hh12 = ((hh + 11) % 12) + 1;
    return `${hh12}:${mm} ${ap}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function fmtLongDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function EventPopover({ selection, role, onClose, onChanged }) {
  const { event: e, anchor } = selection;
  const canDelete = e && e.editable && e.source === "event";
  const removeEvent = async () => {
    if (!(await window.ShapeConfirm.open({ title: "Delete this event?", name: e.title || e.name, message: "This permanently removes it from the calendar. This can’t be undone.", confirmLabel: "Delete event" }))) return;
    fetch("/api/calendar", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id }) })
      .then(() => { onClose(); if (onChanged) onChanged(); })
      .catch(() => {});
  };
  const popRef = React.useRef(null);
  const [pos, setPos] = React.useState(() => {
    // Initial guess — useLayoutEffect will refine once we know size
    return { left: anchor.x + anchor.w + 10, top: anchor.y - 4 };
  });

  React.useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    const onClick = (ev) => { if (popRef.current && !popRef.current.contains(ev.target)) onClose(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); window.removeEventListener("mousedown", onClick); };
  }, [onClose]);

  React.useLayoutEffect(() => {
    if (!popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.x + anchor.w + 10;
    let top = anchor.y - 4;
    if (left + r.width > vw - 16) left = Math.max(16, anchor.x - r.width - 10);
    if (left < 16) left = 16;
    if (top + r.height > vh - 16) top = Math.max(16, vh - r.height - 16);
    if (top < 16) top = 16;
    setPos({ left, top });
  }, [anchor.x, anchor.y, anchor.w, anchor.h]);

  const color = KIND_COLORS[e.kind] || TEAL;
  const actions = actionsForEvent(role, e.kind);

  const node = (
    <div ref={popRef}
      onClick={(ev) => ev.stopPropagation()}
      onMouseDown={(ev) => ev.stopPropagation()}
      style={{
        position: "fixed", left: pos.left, top: pos.top,
        width: 320, background: "#1a1612", color: INK,
        border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10,
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        zIndex: 300, overflow: "hidden", fontFamily: sans,
      }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: "16px 18px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {(KIND_LABEL[e.kind] || e.kind || "").toUpperCase()}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, fontSize: 18, padding: "0 4px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 8 }}>{e.title}</div>
        <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.65)", marginBottom: 4 }}>{fmtLongDate(e.date)}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{fmtTimeRange(e.time, e.duration != null ? e.duration : e.durationMin)}</div>
      </div>

      {(e.sub || e.with || e.location) && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "grid", gap: 6 }}>
          {e.with && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: "rgba(242,237,228,0.5)", width: 56, flexShrink: 0 }}>With</span>
              <span>{e.with}</span>
            </div>
          )}
          {e.location && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: "rgba(242,237,228,0.5)", width: 56, flexShrink: 0 }}>Where</span>
              <span>{e.location}</span>
            </div>
          )}
          {e.sub && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: "rgba(242,237,228,0.5)", width: 56, flexShrink: 0 }}>Details</span>
              <span style={{ color: "rgba(242,237,228,0.85)" }}>{e.sub}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "12px 14px 14px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {canDelete && (
          <button onClick={removeEvent}
            style={{ background: "transparent", color: "#ff8b7f", border: "1px solid rgba(255,139,127,0.4)", padding: "9px 14px", borderRadius: 4, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>
            Delete
          </button>
        )}
        {actions.map((a, i) => (
          a.primary ? (
            <button key={i} onClick={onClose}
              style={{ background: TEAL, color: PAPER, border: 0, padding: "9px 14px", borderRadius: 4, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.03em", cursor: "pointer" }}>
              {a.label} <span style={{ marginLeft: 4 }}>→</span>
            </button>
          ) : (
            <button key={i} onClick={onClose}
              style={{ background: "transparent", color: "rgba(242,237,228,0.85)", border: "1px solid rgba(242,237,228,0.18)", padding: "9px 14px", borderRadius: 4, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>
              {a.label}
            </button>
          )
        ))}
      </div>
    </div>
  );
  return ReactDOM.createPortal(node, document.body);
}

Object.assign(window, { CalendarOverlay, useCalendarOverlay });

// ═══════════════════════════════════════════════════════════
// HOME CARD STACK — customizable, live (mirrors the mobile app)
// Six card types from /api/client/analytics, each KICKER · HERO · meta ·
// caption. Pin locks to top; drag reorders; a "Cards ▾" menu toggles
// visibility; unpinned cards auto-order by "most alive today". Layout persists
// to client_home_cards (same store the app uses) so web ↔ mobile stay in sync.
// ═══════════════════════════════════════════════════════════
const SHAPE_CARD_TYPES = ["training", "recovery", "energy", "consistency", "protein", "mood"];
const SHAPE_CARD_LABEL = { training: "Training", recovery: "Recovery", energy: "Energy", consistency: "Consistency", protein: "Protein", mood: "Mood" };
const SHAPE_CARD_DEFAULTS = ["training", "recovery", "energy"];
const SHAPE_CARD_ACCENT = { training: "#e3a544", recovery: "#5b8df9", energy: TEAL, consistency: "#5fb16e", protein: "#e06547", mood: TEAL_BRIGHT };

function shapeBuildCard(type, ticker) {
  const tk = ticker || {};
  const dash = "—";
  const num = (v) => (typeof v === "number" ? v : null);
  const goal = tk.goal_kind || "maintain";
  switch (type) {
    case "training": {
      const dist = num(tk.today_distance_km), mins = num(tk.today_activity_min), at = tk.today_activity_type;
      const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
      if (dist && dist > 0) { const mi = Math.round((dist / 1.609) * 10) / 10; return { kicker: "Training", hero: String(mi), unit: `mi · ${cap(at) || "logged"}`, meta: [cap(at) || "Activity", mins ? `${mins} min` : "today", "in the bank"], caption: "Distance in the bank today. Nice work.", alive: 85 }; }
      if (mins && mins > 0) return { kicker: "Training", hero: String(mins), unit: `min · ${cap(at) || "trained"}`, meta: [cap(at) || "Trained", "today", "logged"], caption: "Session logged today. Stay on the program.", alive: 82 };
      const wk = num(tk.workouts_this_week);
      return { kicker: "Training", hero: wk != null ? String(wk) : dash, unit: wk != null ? (wk === 1 ? "workout this wk" : "workouts this wk") : "this week", meta: ["This week", wk != null ? "logged" : "log a workout", "keep moving"], caption: wk ? "Sessions in the bank. Get today in too." : "Nothing logged yet — get one in today.", alive: wk ? 60 : 38 };
    }
    case "recovery": {
      const sleep = num(tk.sleep_hours), hrv = num(tk.hrv_ms), rec = num(tk.recovery_score);
      const ready = rec != null ? rec >= 66 : (sleep == null ? null : sleep >= 7);
      const mid = rec != null && rec >= 40 && rec < 66;
      const sl = sleep != null ? `${Math.floor(sleep)}h ${Math.round((sleep % 1) * 60)}m` : dash;
      return { kicker: "Recovery", hero: (rec == null && sleep == null) ? dash : (ready ? "Ready" : mid ? "Steady" : "Low"), unit: rec != null ? `${Math.round(rec)}%` : "", meta: ["Sleep", sl, hrv != null ? `HRV ${Math.round(hrv)}` : "HRV —"], caption: (rec == null && sleep == null) ? "Connect a wearable or log sleep to see readiness." : ready ? "Recovered. Body's good to push tomorrow." : mid ? "Middling — train, but listen to the body." : "Under-recovered — keep today easy.", alive: (rec == null && sleep == null) ? 30 : (ready ? 52 : mid ? 72 : 92) };
    }
    case "energy": {
      const cal = num(tk.cal), target = num(tk.cal_target);
      const has = cal != null && target != null;
      const bal = has ? cal - target : null;
      const est = has ? `~${bal < 0 ? "−" : "+"}${Math.abs(bal)} kcal` : "— kcal";
      const map = {
        cut: { kicker: "Energy · On target", hero: has ? (bal < 0 ? "Under" : "Over") : "Open", meta: ["Fat loss", est, "within range"], caption: has ? (bal < 0 ? "You're tracking where you want to be." : "A little over — ease back tomorrow.") : "Log a meal to see where today lands.", accent: "#5fb16e" },
        maintain: { kicker: "Energy · Balanced", hero: has ? "Even" : "Open", meta: ["Maintain", est, "steady"], caption: has ? "Right in the pocket for holding steady." : "Log a meal to see where today lands.", accent: "#5b8df9" },
        build: { kicker: "Energy · Fuel up", hero: has ? (bal < 0 ? "Short" : "Built") : "Open", meta: ["Build", est, bal < 0 ? "under surplus" : "on surplus"], caption: has ? (bal < 0 ? "A build day wants more — add a meal." : "Surplus in. That's the fuel for growth.") : "Log a meal to see where today lands.", accent: "#e3a544" },
      };
      const m = map[goal] || map.maintain;
      return { ...m, unit: "", alive: has ? 60 : 40, accentOverride: m.accent };
    }
    case "consistency": {
      const pts = num(tk.weekly_points);
      return { kicker: "Consistency", hero: pts != null ? `+${pts}` : dash, unit: pts != null ? "pts this wk" : "this week", meta: ["Shape Score", pts != null ? "this week" : "log to earn", "streaks compound"], caption: pts ? "Showing up. Every log adds to the score." : "Log a habit or workout to start the week.", alive: pts ? 50 : 25 };
    }
    case "protein": {
      const p = num(tk.protein_g), target = num(tk.protein_target) || 150;
      const hit = p != null && p >= target * 0.9;
      return { kicker: "Protein", hero: p != null ? String(p) : dash, unit: p != null ? `/ ${target} g` : "g today", meta: ["Today", p != null ? `${Math.round((p / target) * 100)}% of target` : "not logged", "muscle fuel"], caption: p == null ? "Log meals to track protein." : hit ? "On target — protein locked in." : `Behind on protein — ${target - p}g to go.`, alive: p == null ? 35 : (hit ? 45 : 75) };
    }
    case "mood": {
      const m = num(tk.mood);
      const word = m == null ? dash : m >= 8 ? "Great" : m >= 6 ? "Good" : m >= 4 ? "Okay" : "Low";
      return { kicker: "Mood", hero: word, unit: m != null ? `${m}/10` : "check in", meta: ["Today", m != null ? "logged" : "tap to log", "1–10"], caption: m == null ? "How are you feeling? A quick check-in keeps your coach in the loop." : m >= 6 ? "Feeling good today — keep the momentum." : "Off day — be kind to yourself.", alive: m == null ? 30 : (m < 4 ? 80 : 22) };
    }
    default:
      return { kicker: SHAPE_CARD_LABEL[type] || type, hero: dash, unit: "", meta: [], caption: "", alive: 0 };
  }
}

function ShapeHomeCards() {
  const [ticker, setTicker] = React.useState({});
  const [layout, setLayout] = React.useState({ order: SHAPE_CARD_DEFAULTS.slice(), pinned: [], manual: false });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [dragType, setDragType] = React.useState(null);
  const [overType, setOverType] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/client/analytics", { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.ticker) setTicker({ ...d.ticker, workouts_this_week: d.workouts_this_week, weekly_points: d.kpis && d.kpis.weekly_points }); })
      .catch(() => {});
    if (window.shapeDb && window.shapeDb.getUserGoals) {
      window.shapeDb.getUserGoals("client_home_cards").then((s) => {
        if (s && Array.isArray(s.order)) setLayout({ order: s.order.filter(x => SHAPE_CARD_TYPES.includes(x)), pinned: (s.pinned || []).filter(x => s.order.includes(x)), manual: !!s.manual });
      }).catch(() => {});
    }
  }, []);
  const persist = (next) => {
    setLayout(next);
    try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals("client_home_cards", next); } catch (e) {}
  };

  const models = {};
  layout.order.forEach(type => { models[type] = shapeBuildCard(type, ticker); });
  const pinnedOrder = layout.pinned.filter(x => layout.order.includes(x));
  const unpinned = layout.order.filter(x => !layout.pinned.includes(x));
  if (!layout.manual) unpinned.sort((a, b) => (models[b].alive - models[a].alive) || (layout.order.indexOf(a) - layout.order.indexOf(b)));
  const ordered = [...pinnedOrder, ...unpinned];

  const togglePin = (type) => persist({ ...layout, pinned: layout.pinned.includes(type) ? layout.pinned.filter(x => x !== type) : [...layout.pinned, type] });
  const hideCard = (type) => persist({ ...layout, order: layout.order.filter(x => x !== type), pinned: layout.pinned.filter(x => x !== type) });
  const toggleVisible = (type) => { if (layout.order.includes(type)) return hideCard(type); persist({ ...layout, order: SHAPE_CARD_TYPES.filter(x => layout.order.includes(x) || x === type) }); };
  const onDrop = (target) => { if (!dragType || dragType === target) { setDragType(null); setOverType(null); return; } const next = layout.order.filter(x => x !== dragType); const idx = next.indexOf(target); next.splice(idx < 0 ? next.length : idx, 0, dragType); persist({ ...layout, order: next, manual: true }); setDragType(null); setOverType(null); };

  const card = (type) => {
    const m = models[type];
    const accent = m.accentOverride || SHAPE_CARD_ACCENT[type];
    const pinned = layout.pinned.includes(type);
    const draggable = !pinned;
    return (
      <div key={type}
        draggable={draggable}
        onDragStart={draggable ? () => setDragType(type) : undefined}
        onDragEnd={draggable ? () => { setDragType(null); setOverType(null); } : undefined}
        onDragOver={draggable ? (e) => { e.preventDefault(); if (overType !== type) setOverType(type); } : undefined}
        onDrop={draggable ? (e) => { e.preventDefault(); onDrop(type); } : undefined}
        style={{ borderRadius: 14, marginBottom: 16, background: "rgba(242,237,228,0.04)", overflow: "hidden",
          border: (overType === type && dragType && dragType !== type) ? `1.5px dashed ${accent}` : (pinned ? `1.5px solid ${accent}` : "1px solid rgba(242,237,228,0.1)"),
          opacity: dragType === type ? 0.5 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px 0" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: accent, display: "inline-flex", alignItems: "center", gap: 10 }}>
            {draggable && <span title="Drag to reorder" style={{ cursor: "grab", color: "rgba(242,237,228,0.4)" }}>⠿</span>}
            {m.kicker}{pinned ? " · pinned" : ""}
          </span>
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button onClick={() => togglePin(type)} title={pinned ? "Unpin" : "Pin"} style={shapeCardBtn(pinned ? accent : "rgba(242,237,228,0.5)")}>⌃</button>
            <button onClick={() => hideCard(type)} title="Hide" style={shapeCardBtn("rgba(242,237,228,0.5)")}>×</button>
          </span>
        </div>
        <div style={{ padding: "8px 22px 22px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: serif, fontSize: 64, letterSpacing: "-0.035em", color: INK, lineHeight: 0.9 }}>{m.hero}</span>
            {m.unit ? <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>{m.unit}</span> : null}
          </div>
          {m.meta && m.meta.length ? (
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>
              {m.meta.filter(Boolean).map((s, i) => <React.Fragment key={i}>{i > 0 && <span style={{ opacity: 0.5 }}>·</span>}<span>{s}</span></React.Fragment>)}
            </div>
          ) : null}
          {m.caption ? <div style={{ marginTop: 14, fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.72)", lineHeight: 1.35 }}>{m.caption}</div> : null}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", fontWeight: 400, margin: 0 }}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]}.</h2>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginTop: 6 }}>Your stack · pin, drag, or choose cards</div>
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setMenuOpen(v => !v)} style={{ padding: "9px 16px", borderRadius: 999, border: `1px solid ${menuOpen ? TEAL : "rgba(242,237,228,0.2)"}`, background: menuOpen ? TEAL : "transparent", color: menuOpen ? "#0a0f0d" : INK, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer" }}>CARDS ▾</button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 51, width: 240, background: "#1a1612", border: "1px solid rgba(242,237,228,0.15)", borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(242,237,228,0.08)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>Show on home</div>
                {SHAPE_CARD_TYPES.map(type => {
                  const on = layout.order.includes(type);
                  return (
                    <button key={type} onClick={() => toggleVisible(type)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", border: 0, borderTop: "1px solid rgba(242,237,228,0.06)", background: "transparent", cursor: "pointer" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: SHAPE_CARD_ACCENT[type] }} />
                        <span style={{ fontFamily: sans, fontSize: 14, color: INK }}>{SHAPE_CARD_LABEL[type]}</span>
                      </span>
                      <span style={{ width: 36, height: 20, borderRadius: 999, padding: 2, border: `1px solid ${on ? SHAPE_CARD_ACCENT[type] : "rgba(242,237,228,0.2)"}`, background: on ? SHAPE_CARD_ACCENT[type] : "transparent", display: "inline-flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 999, background: on ? "#0a0f0d" : "rgba(242,237,228,0.5)", display: "block" }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {ordered.length === 0 && <div style={{ padding: "24px", borderRadius: 14, border: "1px dashed rgba(242,237,228,0.15)", fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.5)" }}>No cards. Tap <b style={{ color: INK }}>Cards ▾</b> to choose what to show.</div>}
      {ordered.map(card)}
      <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.45)", lineHeight: 1.5 }}>
        <b style={{ color: "rgba(242,237,228,0.7)" }}>Three defaults, then it's yours.</b> Drag ⠿ to reorder, pin to lock to top, or choose cards from Cards ▾.
        {layout.manual ? <> Order is yours — <a href="#" onClick={(e) => { e.preventDefault(); persist({ ...layout, manual: false }); }} style={{ color: TEAL_BRIGHT }}>switch to auto</a>.</> : " Unpinned cards reorder by what's most alive that day."}
      </div>
    </div>
  );
}
function shapeCardBtn(color) { return { width: 28, height: 28, borderRadius: 7, border: 0, background: "transparent", color, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 800, cursor: "pointer", lineHeight: 1 }; }

Object.assign(window, { ShapeHomeCards });

// Region-aware cookie/analytics consent + Global Privacy Control. EEA/UK visitors
// see a banner; GPC is honored everywhere; the choice is recorded (and, when
// signed in, logged to consent_log). No-ops once a choice exists. Loaded via
// pageShell, so it covers every page that renders the shared shell.
(function shapeConsent() {
  if (typeof document === "undefined") return;
  // Resolves true only when a consent_log row was actually written (so callers
  // can gate a "logged" flag on a confirmed insert, not an attempt).
  function logConsent(kind, granted, text) {
    try {
      var db = window.shapeDb;
      if (!(db && db.client && db.client.auth)) return Promise.resolve(false);
      return db.client.auth.getUser().then(function (r) {
        var uid = r && r.data && r.data.user && r.data.user.id;
        if (!uid) return false;
        return db.client.from("consent_log").insert({ user_id: uid, kind: kind, granted: granted, policy_version: "2026-06-22", source: "banner", consent_text: text }).then(function () { return true; }).catch(function () { return false; });
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function start() {
    try {
      var KEY = "shape.consent.v1";
      var gpc = (typeof navigator !== "undefined" && navigator.globalPrivacyControl === true);
      if (gpc) {
        window.__shapeGPC = true;
        // Log the GPC opt-out once PER USER (not once per browser), and only after
        // the insert is confirmed — so a signed-out visit (or a failed insert)
        // doesn't permanently suppress logging for a later signed-in user here.
        try {
          var gdb = window.shapeDb;
          if (gdb && gdb.client && gdb.client.auth) {
            gdb.client.auth.getUser().then(function (r) {
              var uid = r && r.data && r.data.user && r.data.user.id;
              if (!uid) return;                                  // anon: nothing to log yet; their next signed-in visit logs it
              var gkey = "shape.gpc.logged." + uid;
              if (localStorage.getItem(gkey)) return;
              logConsent("gpc_optout", true, "Global Privacy Control honored as an opt-out of sale/sharing.").then(function (ok) {
                if (ok) { try { localStorage.setItem(gkey, "1"); } catch (e) {} }
              });
            }).catch(function () {});
          }
        } catch (e) {}
      }
      if (localStorage.getItem(KEY)) return;                 // already chose
      if (gpc) { try { localStorage.setItem(KEY, "reject"); } catch (e) {} return; } // GPC = opt out, no banner
      var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
      if (!/^Europe\//.test(tz)) return;                     // region-aware: show only for EEA/UK
      function record(choice) {
        try { localStorage.setItem(KEY, choice); } catch (e) {}
        logConsent("cookies", choice === "accept", "Cookie/analytics consent banner choice: " + choice);
      }
      var bar = document.createElement("div");
      bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookie consent");
      // Use the design-system theme tokens (with the canonical palette as fallback,
      // since this banner is injected outside any page stylesheet and must stay
      // legible everywhere).
      bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:var(--paper,#1a1612);color:var(--ink,#f2ede4);border-top:1px solid rgba(242,237,228,0.15);padding:15px 20px;font-family:'Space Grotesk',sans-serif;font-size:13.5px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;box-shadow:0 -10px 40px rgba(0,0,0,0.5)";
      var txt = document.createElement("span");
      txt.style.cssText = "flex:1;min-width:240px;line-height:1.5";
      txt.appendChild(document.createTextNode("We use essential cookies to run Shape, and — only with your consent — privacy-friendly analytics. See our "));
      var pl = document.createElement("a"); pl.href = "/privacy.html"; pl.textContent = "Privacy Policy"; pl.style.color = "var(--teal-bright,#2ee0c4)";
      txt.appendChild(pl); txt.appendChild(document.createTextNode("."));
      bar.appendChild(txt);
      function btn(label, choice, primary) {
        var b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "border:1px solid " + (primary ? "var(--teal,#0ac5a8)" : "rgba(242,237,228,0.25)") + ";background:" + (primary ? "var(--teal,#0ac5a8)" : "transparent") + ";color:" + (primary ? "var(--paper,#1a1612)" : "var(--ink,#f2ede4)") + ";padding:9px 16px;border-radius:7px;font-family:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap";
        b.onclick = function () { record(choice); if (bar.parentNode) bar.parentNode.removeChild(bar); };
        return b;
      }
      bar.appendChild(btn("Reject non-essential", "reject", false));
      bar.appendChild(btn("Accept", "accept", true));
      document.body.appendChild(bar);
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

// ── Hover prefetch ────────────────────────────────────────────────────────────
// The site is an MPA: each nav is a full page load. Prefetch the destination
// document on first hover/touch of an internal link so the HTML is already in
// the cache by the click (the shared compiled scripts are cache-hits anyway).
(function () {
  try {
    if (navigator.connection && navigator.connection.saveData) return;
    var seen = {};
    document.addEventListener("mouseover", function (e) {
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (a.origin !== location.origin) return;
      if (href.charAt(0) === "#" || href.indexOf("javascript:") === 0 || !/\.html(\?|#|$)/.test(a.pathname || href)) return;
      var key = a.pathname;
      if (seen[key]) return;
      seen[key] = 1;
      var l = document.createElement("link");
      l.rel = "prefetch";
      l.as = "document";
      l.href = a.href;
      document.head.appendChild(l);
    }, { passive: true, capture: true });
  } catch (e) {}
})();
