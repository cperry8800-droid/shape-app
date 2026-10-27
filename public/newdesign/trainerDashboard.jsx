// Dashboard layout — shared between Trainer, Client, Nutritionist variants.
// See: Shape Community live spec. Direction B visual system (PAPER/INK/TEAL).

// ── The sidebar's live figures ───────────────────────────────────────────────
// The money card and the Clients count used to be LITERALS in coachNav.jsx /
// clientNav.jsx ("PAYOUT APR 30 · $18,420 · Month to date · +22%", 34 clients,
// "SHAPE SCORE · 1,284"), passed by every route and therefore shown to
// signed-in accounts on the tabs that never fetched anything (review
// 2026-09-09, R11). The sidebar now resolves them itself from the same feeds
// Today uses — one fetch per page load, cached 60s — so every tab agrees:
//   signed out (401)         → the demo literal the route passed (under the band)
//   signed in, feed live     → MONTHLY · NET + clients, or SHAPE SCORE
//   signed in, feed unknown  → "—" (a number nobody measured is never shown)
//   still resolving          → "—" (never a flash of demo money on a real account)
// A route that computed its own live card (Business shows the Stripe balance)
// keeps it: only the three known demo literals are ever replaced.
const _dsbCache = new Map(); // url -> { at, ok, signedOut, data }
async function dsbFetch(url) {
  const hit = _dsbCache.get(url);
  if (hit && Date.now() - hit.at < 60000) return hit;
  let out;
  try {
    // Prefer dashData.jsx's shared 60s cache when it is on the page: the route
    // hook asks for this same endpoint, and two fetches of one payload per page
    // load is a round trip nobody needs. It resolves at CALL time, not at
    // definition time — this module loads before dashData.jsx.
    const shared = typeof window !== "undefined" && window.dashJson;
    if (shared) {
      out = { ok: true, signedOut: false, data: await shared(url) };
    } else {
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.status === 401) out = { ok: false, signedOut: true, data: null };
      else if (!res.ok) out = { ok: false, signedOut: false, data: null };
      else out = { ok: true, signedOut: false, data: await res.json() };
    }
  } catch (e) {
    // dashJson throws "HTTP 401" for the signed-out case; everything else is an
    // unknown, which renders "—" rather than a demo figure.
    const signedOut = /\b401\b/.test(String((e && e.message) || ""));
    out = { ok: false, signedOut, data: null };
  }
  out.at = Date.now();
  _dsbCache.set(url, out);
  return out;
}
function dsbMoney(cents) {
  const n = Math.round(Number(cents) || 0) / 100;
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function dsbRoleFromNav(navItems) {
  const href = (navItems && navItems[0] && navItems[0].href) || "";
  if (/NutritionistApp/i.test(href)) return "nutritionist";
  if (/TrainerApp/i.test(href)) return "trainer";
  if (/ClientApp/i.test(href)) return "client";
  return null;
}
function useDashSidebarLive(role) {
  const [state, setState] = React.useState(null); // null = still resolving
  React.useEffect(() => {
    let on = true;
    if (!role) { setState({ kind: "none" }); return undefined; }
    (async () => {
      if (role === "client") {
        const r = await dsbFetch("/api/client/score");
        if (!on) return;
        if (r.signedOut) return setState({ kind: "demo" });
        const d = r.ok ? r.data : null;
        if (!d || typeof d.points_total !== "number") return setState({ kind: "unknown" });
        const cur = d.current_tier, next = d.next_tier;
        setState({ kind: "live", card: {
          label: "SHAPE SCORE",
          amount: d.points_total.toLocaleString(),
          sub: (cur && cur.name ? cur.name : "") + (next && next.name ? " · " + (d.points_to_next != null ? d.points_to_next + " to " : "") + next.name : ""),
        } });
        return;
      }
      const r = await dsbFetch("/api/" + role + "/dashboard");
      if (!on) return;
      if (r.signedOut) return setState({ kind: "demo" });
      const d = r.ok ? r.data : null;
      const okKey = role === "trainer" ? "isTrainer" : "isNutritionist";
      if (!d || !d[okKey] || !d.kpis) return setState({ kind: "unknown" });
      const k = d.kpis;
      setState({ kind: "live", count: k.activeClients, card: {
        label: "MONTHLY · NET",
        amount: k.monthlyNetCents != null ? dsbMoney(k.monthlyNetCents) : "—",
        // Clients, not subscriptions: the dashboards count today's practice by the Business page's
        // rule, people with a client whose payment is retrying among them (the sweep after #2394 round 10).
        // ⚠ A COUNT THE ROUTE COULDN'T READ IS SAID, NOT PRINTED AS "0 clients" (the dashboards after
        // #2395): the route sends null for a failed read, and this printed null as 0. Today's own card
        // (dashToday.jsx dashLivePayoutCard) says the same words.
        sub: k.activeClients == null ? "clients couldn't be read just now" : (k.activeClients === 1 ? "1 client" : k.activeClients + " clients") + " · payouts connect soon",
      } });
    })();
    return () => { on = false; };
  }, [role]);
  return state;
}

// ── The app frame (owner, 2026-10-14) ───────────────────────────────────────
// "can we make it feel more like its own portal … more like a software or application",
// then, choosing between three previews: "i like option B. Have that nav bar collapse to
// just that [icon] view, and then when you hover over, the full name of each page appears,
// like how A looks … I like the coaching and practice seperation on nav".
//
// So every dashboard tab sits in ONE frame: a 64px icon rail that widens over the page on
// hover (or keyboard focus) to show the labels, the section names and the money card, and
// a sticky app bar where the marketing header used to be. ⚠ THE APP BAR IS THE SITE
// HEADER, RESTYLED BY dash.css, NOT A SECOND HEADER. Sign out, the profile switch, the
// staff Admin link, the bell and search all live in Header, with rules this file must not
// grow a second copy of (pageShell.jsx explains the sign-out ordering); the frame hides
// the marketing tabs, the logo and the Dashboard button, which only make sense outside it.
// There is no footer: an app has no site map at the bottom of every screen.
//
// Below 900px the rail turns into a horizontal tab bar under the app bar (dash.css), the
// same job pageShell's old 240px-sidebar rule did, so a phone keeps every tab.

// One stroke icon per tab slug, drawn on a 24px grid at 1.8 stroke. Monochrome by rule
// (no coloured emoji for new additions), so each takes the link's own colour.
const DASH_RAIL_ICONS = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  week: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M7 14h10" /></>,
  schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c1.9.7 3.1 2.5 3.5 5.2" /></>,
  programs: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  plans: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h4" /></>,
  playlists: <><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  business: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  goal: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  score: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  progress: <><path d="M4 20V4M4 20h16" /><path d="M8 15l3-4 3 2 4-6" /></>,
  workouts: <><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" /></>,
  nutrition: <><path d="M12 7c-3.5-2.5-8-1-8 4 0 4.5 3.5 9 6 9 1 0 1.3-.5 2-.5s1 .5 2 .5c2.5 0 6-4.5 6-9 0-5-4.5-6.5-8-4z" /><path d="M12 7c0-2 1-3.5 3-4" /></>,
  library: <><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="M16.5 4.5l3.5 1-3.5 14.5-3.5-1z" /></>,
  team: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  habits: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  profile: <><circle cx="12" cy="9" r="4" /><path d="M4 21c1-4 4.3-6 8-6s7 2 8 6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  website: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>,
};
function dashRailIcon(slug) {
  const body = DASH_RAIL_ICONS[slug] || <circle cx="12" cy="12" r="3" />;
  return <svg className="dash-rail-icon" aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{body}</svg>;
}

// The rail's two groups per audience, and the account pair pinned to its foot. A slug
// none of them names joins the last group rather than disappearing — a tab added to a
// nav table must never be unreachable because this list was not updated.
const DASH_RAIL_GROUPS = {
  coach: [["Coaching", ["today", "week", "schedule", "clients", "programs", "plans", "playlists"]], ["Practice", ["business", "goal", "score"]]],
  client: [["Training", ["today", "workouts", "nutrition", "library", "team"]], ["Progress", ["progress", "habits", "score", "goal"]]],
};
const DASH_RAIL_FOOT = ["profile", "settings"];
function dashRailGroups(items, role) {
  const plan = DASH_RAIL_GROUPS[role === "client" ? "client" : "coach"];
  const slugOf = (n) => n.slug || String(n.label || "").toLowerCase();
  const groups = plan.map(([label, slugs]) => ({ label, items: items.filter((n) => slugs.indexOf(slugOf(n)) !== -1) }));
  const placed = new Set(plan.flatMap(([, slugs]) => slugs).concat(DASH_RAIL_FOOT));
  const rest = items.filter((n) => !placed.has(slugOf(n)));
  if (rest.length) groups[groups.length - 1].items.push(...rest);
  return { groups: groups.filter((g) => g.items.length), foot: items.filter((n) => DASH_RAIL_FOOT.indexOf(slugOf(n)) !== -1) };
}

// The rail. navItems items: { label, slug, count, active, href }.
function DashSidebar({ navItems, payoutCard, homeHref = "index.html" }) {
  const role = dsbRoleFromNav(navItems);
  const live = useDashSidebarLive(role);
  // ⚠ THE DEMO CARD IS RECOGNISED BY A MARK ON THE DATA, not by object identity.
  // The three literals carry `demo: true` (coachNav.jsx / clientNav.jsx); a
  // clone, a spread, or a page that loads neither nav module would all miss an
  // identity check and put "$18,420 · +22%" back in front of a live coach —
  // which is the defect this exists to fix. Identity stays as a fallback for a
  // literal that has not been marked.
  const demoLiterals = [window.trainerPayoutCard, window.nutriPayoutCard, window.clientPayoutCard].filter(Boolean);
  const passedIsDemo = !!payoutCard && (payoutCard.demo === true || demoLiterals.indexOf(payoutCard) !== -1);
  let card = payoutCard;
  if (passedIsDemo && !(live && (live.kind === "demo" || live.kind === "none"))) {
    card = live && live.kind === "live"
      ? live.card
      : role === "client"
        ? { label: "SHAPE SCORE", amount: "—", sub: live ? "loads when your score syncs" : "loading…" }
        : { label: "PAYOUTS", amount: "—", sub: live ? "connects when payouts go live" : "loading…" };
  }
  const liveCount = live && live.kind === "live" && live.count != null ? live.count : null;
  const items = (navItems || []).map((n) => (liveCount != null && (n.slug === "clients" || n.label === "Clients")) ? { ...n, count: liveCount } : n);
  const { groups, foot } = dashRailGroups(items, role);
  const roleName = role === "trainer" ? "Trainer" : role === "nutritionist" ? "Nutritionist" : role === "client" ? "Member" : null;
  const link = (n) => (
    <a key={n.slug || n.label} href={n.href || "#"} data-tour={'webtab-' + (n.slug || '')} className="shape-dash-navlink dash-rail-link"
      aria-current={n.active ? "page" : undefined} data-active={n.active ? "" : undefined}>
      {dashRailIcon(n.slug || String(n.label || "").toLowerCase())}
      <span className="dash-rail-label">{n.label}</span>
      {n.count != null && <span className="dash-rail-count dash-rail-label">{n.count}</span>}
    </a>
  );
  return (
    <aside className="dash-rail">
      <div className="dash-rail-panel">
        <a href={homeHref} className="dash-rail-brand" aria-label="Shape home">
          <svg aria-hidden viewBox="8 8 79 98" width="20" height="24" style={{ flex: "0 0 auto", display: "block" }}>
            <polygon points="14,47 14,100 51,73" fill={TEAL_BRIGHT} />
            <polygon points="81,14 81,65 44,39" fill={INK} />
          </svg>
          <span className="dash-rail-label dash-rail-wordmark">SHAPE</span>
          {roleName && <span className="dash-rail-label dash-rail-role">{roleName}</span>}
        </a>
        <nav aria-label="Dashboard" className="dash-rail-nav">
          {groups.map((g) => (
            <div key={g.label} className="dash-rail-group">
              <div className="dash-rail-heading"><span className="dash-rail-label">{g.label}</span></div>
              {g.items.map(link)}
            </div>
          ))}
          <div className="dash-rail-group dash-rail-foot">
            {card && (
              <div className="shape-dash-payout dash-rail-wide">
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>{card.label}</div>
                <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 5, letterSpacing: "-0.01em", fontVariationSettings: "'wdth' 112" }}>{card.amount}</div>
                <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 2 }}>{card.sub}</div>
              </div>
            )}
            {foot.map(link)}
            <a href={homeHref} className="dash-rail-link dash-rail-site">
              {dashRailIcon("website")}
              <span className="dash-rail-label">Shape website</span>
            </a>
          </div>
        </nav>
      </div>
    </aside>
  );
}

// The frame every dashboard tab renders inside: the rail, then a column holding the app
// bar and the page's own <main>. `title` defaults to the active tab's label.
function DashFrame({ navItems, payoutCard, title, children }) {
  const active = (navItems || []).find((n) => n && n.active);
  const heading = title || (active && active.label) || "";
  return (
    <div className="dash-app" style={{ background: PAPER, color: INK, fontFamily: sans }}>
      <DashSidebar navItems={navItems} payoutCard={payoutCard} />
      <div className="dash-app-main">
        <div className="dash-appbar">
          {heading && <div className="dash-appbar-title" aria-hidden>{heading}</div>}
          <Header />
        </div>
        {children}
      </div>
    </div>
  );
}

// Inner-page shell: the frame + main w/ title bar + freeform children.
function DashPage({ navItems, payoutCard, eyebrow, title, subtitle, actions, children, tourHero }) {
  // The paper switch follows the account on every shell page. dashData.jsx loads
  // AFTER this file on every dashboard page and not at all on the print page, so
  // the read is a constant for the life of the page — never a hook called
  // conditionally between renders.
  if (typeof useDashPaper === "function") useDashPaper();
  return (
    <DashFrame navItems={navItems} payoutCard={payoutCard}>
      <main style={{ padding: "22px 32px 64px", minWidth: 0, overflowX: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 26 }}>
          <div data-tour={tourHero}>
            {eyebrow && <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--sh-ink3, #75706a)", marginBottom: 10 }}>{eyebrow}</div>}
            <h1 style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", fontWeight: 600, margin: 0, lineHeight: 1.08, fontVariationSettings: "'wdth' 112" }}>{title}</h1>
            {subtitle && <div style={{ fontSize: 14, color: "var(--sh-ink2, #a09b94)", marginTop: 10, maxWidth: 640, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          {/* flexWrap: a nowrap row of action pills opposite a 52px title is
              clipped by main's overflowX:hidden at narrow widths (and on a
              phone, which gets the 980px desktop layout) — the buttons wrap
              under the title instead of disappearing. */}
          {actions && <div style={{ display: "flex", gap: 10, paddingTop: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</div>}
        </div>
        {children}
      </main>
    </DashFrame>
  );
}

// Small helpers available to every inner page
function Card({ children, style }) {
  // The builder's card: white, one hairline, a 12px radius, no glass and no
  // 48px shadow — on the light paper a blurred cream gradient reads as a smudge.
  return <div style={{
    background: "var(--sh-card, #25211d)",
    border: "1px solid var(--sh-line, #302c27)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    ...style
  }}>{children}</div>;
}
// ⚠ THE GAP IS LOAD-BEARING, and `space-between` alone did not supply it.
// space-between only separates items while there is slack; once the title fills
// the row the two children TOUCH, and a 14px title against an 11px mono eyebrow
// reads as one word — "Revenue calculatorSET YOUR TARGET" on the Goal tab
// (review 2026-09-09, V3). A real `gap` cannot be consumed, `flexWrap` drops the
// eyebrow to its own line when even that will not fit, and `marginLeft: auto`
// keeps it right-aligned in both cases (which is what space-between was for).
// Shared by 48 call sites, so this is the one place to fix it.
// ⚠ THE QUARTER IS COMPUTED, NOT TYPED (review 2026-09-09, V3). This eyebrow read
// "YOUR GOALS · Q2 2026" in September — a page about the current quarter naming a
// quarter that had ended, on the same screen as goals dated from today.
function goalQuarterLabel(now) {
  const at = now instanceof Date ? now : new Date();
  return "YOUR GOALS · Q" + (Math.floor(at.getMonth() / 3) + 1) + " " + at.getFullYear();
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>{children}</div>
      {right && <div style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11, color: "var(--sh-ink3, #75706a)", letterSpacing: "0.08em" }}>{right}</div>}
    </div>
  );
}
// The dashboard's skin picker (owner, 2026-10-27: "create different dashboard skins for
// website you can choose from, like on app"), on both Settings pages. A tile per skin in
// the app's own grammar — the skin's ground with an "Aa" card on it — so each tile shows
// its skin whichever one is on. The skins are dashData.jsx's DASH_PAPER_OPTS, read at
// render because dashData.jsx loads after this file; without it there is nothing to
// choose, and with no setter (signed out of a store that cannot write) the tiles are off.
function DashPaperPicker({ value, onChoose }) {
  const opts = typeof DASH_PAPER_OPTS !== "undefined" && Array.isArray(DASH_PAPER_OPTS) ? DASH_PAPER_OPTS : [];
  return (
    <div role="radiogroup" aria-label="Dashboard skin" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10 }}>
      {opts.map(([key, label, hint, ground, card, ink, accent]) => {
        const on = value === key;
        const glow = key === "glass" ? "radial-gradient(90% 120% at 0% 0%, rgba(46,224,196,0.35), transparent 60%), radial-gradient(80% 110% at 100% 20%, rgba(138,92,246,0.4), transparent 60%), " : "";
        return (
          <button key={key} type="button" role="radio" aria-checked={on} aria-label={label + " — " + hint} disabled={!onChoose}
            onClick={() => onChoose && onChoose(key)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: 0, font: "inherit", borderRadius: 10, overflow: "hidden", cursor: onChoose ? "pointer" : "default", opacity: onChoose ? 1 : 0.45,
              background: "var(--sh-card, #25211d)", color: "var(--sh-ink, #f2ede4)", border: "1px solid var(--sh-line2, #413d38)",
              boxShadow: on ? "0 0 0 2px var(--sh-accent, #2ee0c4)" : "none" }}>
            <span aria-hidden style={{ display: "block", position: "relative", height: 62, background: glow + ground, borderBottom: "1px solid var(--sh-line, #302c27)" }}>
              <span style={{ position: "absolute", left: 12, top: 12, width: "58%", bottom: 12, borderRadius: 6, background: card, border: "1px solid rgba(128,128,128,0.22)", color: ink, display: "flex", alignItems: "center", gap: 7, padding: "0 9px", fontFamily: serif, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                Aa<span style={{ flex: 1, height: 3, borderRadius: 2, background: accent }} />
              </span>
              {on && <span style={{ position: "absolute", right: 9, top: 7, fontSize: 14, fontWeight: 700, color: accent }}>✓</span>}
            </span>
            <span style={{ display: "block", padding: "8px 11px 10px" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{label}</span>
              <span style={{ display: "block", fontSize: 11.5, lineHeight: 1.35, color: "var(--sh-ink2, #a09b94)", marginTop: 2 }}>{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// The fixed coach pages' section switch (owner, 2026-10-15: Clients, Business, Goal and
// Score lose the widget builder, "like Programs"). The same segmented control as Today's
// Needs you card, so one control means one thing across the dashboard.
// items: [{ key, label, count? }]
function DashSegmented({ label, items, value, onChange }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--sh-rest, #221e19)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, flexWrap: "wrap", maxWidth: "100%" }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button key={it.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.key)}
            style={{ minHeight: 34, padding: "0 14px", borderRadius: 7, border: 0, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: on ? 600 : 500,
              background: on ? "var(--sh-card, #25211d)" : "transparent", color: on ? "var(--sh-ink, #f2ede4)" : "var(--sh-ink2, #a09b94)",
              boxShadow: on ? "0 1px 2px rgba(0,0,0,0.18)" : "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
            {it.label}
            {it.count != null && <span style={{ fontFamily: mono, fontSize: 10.5, color: on ? "var(--sh-accent-ink, #2ee0c4)" : "var(--sh-ink3, #75706a)" }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
function Pill({ children, tone = "mute" }) {
  // The builder's chip: a tinted box with a 7px radius, the teal one on its own tint.
  const bg = tone === "teal" ? "var(--sh-accent-tint, #182d26)" : "var(--sh-rest, #221e19)";
  const col = tone === "teal" ? "var(--sh-accent, #2ee0c4)" : "var(--sh-ink2, #a09b94)";
  const bd = tone === "teal" ? "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.3)" : "1px solid var(--sh-line, #302c27)";
  return <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 7, background: bg, color: col, border: bd }}>{children}</span>;
}

// Row renderer for DashShell.todayItems. Supports t.playlist = { name, provider, bpm, accent, cover, note, author, tracks }
function DashTodayItemRow({ t }) {
  const [open, setOpen] = React.useState(false);
  const p = t.playlist;
  const spotMark = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="10" fill="#1DB954"/>
      <path d="M7.2 10.4c3.2-.9 7.4-.7 10.3 1.1.4.2.5.8.2 1.2-.2.4-.8.5-1.2.2-2.5-1.5-6.2-1.7-9-.9-.5.2-1-.2-1.1-.6-.1-.5.2-.9.8-1zM7.5 13c2.7-.8 6.3-.5 8.6 1 .3.2.4.7.2 1-.2.3-.7.4-1 .2-2-1.2-5.1-1.5-7.4-.8-.4.1-.8-.2-.9-.5 0-.4.2-.8.5-.9zM7.8 15.4c2.2-.6 4.9-.5 6.9.7.3.2.3.5.2.8-.2.3-.5.3-.8.2-1.7-1-4-1.1-5.9-.6-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7z" fill="#000"/>
    </svg>
  );
  const appleMark = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fa243c" style={{ flex: "none" }}>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm3 13.3c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.4 0 .7.1 1 .2V7l4-1v9.3z"/>
    </svg>
  );
  return (
    <div style={{ borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto auto", gap: 16, alignItems: "center", padding: "18px 4px" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", letterSpacing: "0.04em" }}>{t.time}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 6 }}>{t.kind}</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
          {t.sub && <div style={{ fontSize: 12.5, color: "var(--sh-ink2, #a09b94)" }}>{t.sub}</div>}
        </div>
        {p ? (
          <button onClick={() => setOpen(!open)}
            title={`${p.author || "Coach"}'s playlist: ${p.name}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 6px", borderRadius: 999, border: `1px solid ${p.accent}55`, background: `${p.accent}1a`, color: PAPER, fontFamily: sans, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: p.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="#1a1612"><path d="M4 2.5v11l10-5.5z"/></svg>
            </span>
            {p.provider === "apple" ? appleMark : spotMark}
            <span style={{ opacity: 0.9 }}>Coach's mix</span>
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.6 }}><path d="M2 3.5l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>
          </button>
        ) : <div />}
        {t.cta ? (() => {
          const primaryStyle = { background: TEAL, color: PAPER, border: 0, padding: "10px 18px", borderRadius: 4, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap" };
          const ghostStyle = { background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "9px 18px", borderRadius: 4, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap" };
          const style = t.cta.primary ? primaryStyle : ghostStyle;
          const inner = t.cta.primary ? <>{t.cta.label} <span style={{ marginLeft: 4 }}>→</span></> : t.cta.label;
          if (t.cta.href) return <a href={t.cta.href} style={{ ...style, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>{inner}</a>;
          if (typeof t.cta.onClick === "function") return <button onClick={t.cta.onClick} style={style}>{inner}</button>;
          return <button style={style}>{inner}</button>;
        })() : <div />}
      </div>

      {open && p && (
        <div style={{ marginBottom: 14, marginLeft: 96, marginRight: 4, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
          <div style={{ padding: "14px 18px", background: p.cover, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "4px 10px", borderRadius: 999, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 7, color: "#f2ede4" }}>
                {p.provider === "apple" ? appleMark : spotMark}
                {p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"} · {(p.author || "COACH").toUpperCase()}'S PICK
              </div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 400, letterSpacing: "-0.01em", color: PAPER }}>{p.name}</div>
              <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", letterSpacing: "0.06em", marginTop: 4 }}>
                {p.bpm} BPM · {p.tracks || "—"} tracks · optional, always skippable
              </div>
            </div>
            {(() => {
              const playStyle = { background: p.accent, color: "#1a1612", border: 0, padding: "9px 16px", borderRadius: 999, fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
              return p.href
                ? <a href={p.href} style={{ ...playStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>▶ Play</a>
                : <button style={playStyle}>▶ Play</button>;
            })()}
          </div>
          {p.note && (
            <div style={{ padding: "12px 18px", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", fontStyle: "italic", flex: 1 }}>"{p.note}" — {p.author || "Coach"}</span>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", color: "var(--sh-ink2, #a09b94)", border: 0, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", cursor: "pointer" }}>HIDE PLAYLIST</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DashShell({
  tourHero,     // optional data-tour key for the spotlight tour masthead anchor
  role,         // "trainer" | "client" | "nutritionist"
  userName,
  date,         // "WEDNESDAY APR 18"
  greeting,     // "Good morning, Maya."
  primaryCta,   // ["+ Program", onClick]
  secondaryCta, // ["New session", onClick]
  navItems,     // [{ label, count, active }]
  payoutCard,   // { label, amount, sub } or null
  kpis,         // [{ k, l, sub }]
  kpis2,        // optional SECOND KPI strip, rendered under the first (coach Today shows both)
  topSection,   // optional { title, render } — rendered immediately after KPI strip, before todayItems
  todayItems,   // optional [{ time, kind, title, sub, cta }]
  scheduleTitle,
  schedule,     // [{ time, who, sub, status }]
  scheduleRender, // optional () => node — replaces the default schedule rows (panel + title kept)
  pulseTitle,
  pulse,        // [{ who, sub, trend }]  trend = array of numbers 0-1
  pulseRender,  // optional () => node — replaces the default pulse rows (panel + title kept)
  extraSections, // optional [{ title, render }]
  calendarEvents, // optional [{date,time,kind,title,sub}] — enables "Open calendar →"
  gridWidgets, // optional [{ key, title, size, render }] — when present, the body sections render
               // through DashGrid (draggable/resizable, like the client tabs) instead of the fixed
               // layout. Only the coach Today pages pass this; everything else keeps the old layout.
  nowColumn,   // optional (openCalendar) => node — the day column B's layout puts beside the grid
}) {
  // The paper switch follows the account on every shell page. dashData.jsx loads
  // AFTER this file on every dashboard page and not at all on the print page, so
  // the read is a constant for the life of the page — never a hook called
  // conditionally between renders.
  if (typeof useDashPaper === "function") useDashPaper();
  const cal = (typeof useCalendarOverlay === "function") ? useCalendarOverlay() : null;
  return (
    <DashFrame navItems={navItems} payoutCard={payoutCard}>
      {calendarEvents && cal && <CalendarOverlay {...cal.props} role={role} events={calendarEvents} />}

      {/* Main — overflowX hidden matches DashPage; without it the Today pages
          scroll horizontally at 375px (nowrap pulse metas widen the document) */}
      <main style={{ padding: "20px 32px 64px", minWidth: 0, overflowX: "hidden" }}>
        {/* Greeting + the page's two actions */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 22 }}>
          <div data-tour={tourHero} style={{ minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--sh-ink3, #75706a)", marginBottom: 8 }}>{date}</div>
            <h1 style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", fontWeight: 600, margin: 0, lineHeight: 1.08, fontVariationSettings: "'wdth' 112" }}>{greeting}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            {primaryCta && (() => {
              const style = { background: "var(--sh-card, #25211d)", color: INK, border: "1px solid var(--sh-line2, #413d38)", height: 40, padding: "0 16px", borderRadius: 9, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxSizing: "border-box" };
              if (typeof primaryCta[1] === "string") return <a href={primaryCta[1]} style={{ ...style, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>{primaryCta[0]}</a>;
              if (typeof primaryCta[1] === "function") return <button onClick={primaryCta[1]} style={style}>{primaryCta[0]}</button>;
              return <button style={style}>{primaryCta[0]}</button>;
            })()}
            {secondaryCta && (() => {
              const style = { background: TEAL_BRIGHT, color: "var(--sh-deep, #06231f)", border: "1px solid " + TEAL_BRIGHT, height: 40, padding: "0 16px", borderRadius: 9, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxSizing: "border-box" };
              if (typeof secondaryCta[1] === "string") return <a href={secondaryCta[1]} style={{ ...style, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>{secondaryCta[0]}</a>;
              if (typeof secondaryCta[1] === "function") return <button onClick={secondaryCta[1]} style={style}>{secondaryCta[0]}</button>;
              return <button style={style}>{secondaryCta[0]}</button>;
            })()}
          </div>
        </div>

        {gridWidgets ? (() => {
          // ONE <DashGrid> call site: two with the same role+tab would share a stored layout.
          const grid = <DashGrid role={role} tab="today" widgets={gridWidgets} />;
          return nowColumn ? (
            <div className="dash-today-split">
              <div className="dash-today-now">{nowColumn(calendarEvents && cal ? cal.open : null)}</div>
              <div className="dash-today-work">{grid}</div>
            </div>
          ) : grid;
        })() : (
        <React.Fragment>
        {/* KPI strip(s) — single card w/ dividers; coach Today shows two
            (financial summary + practice). */}
        {[kpis, kpis2].map((row, ri) => (Array.isArray(row) && row.length > 0) ? (
          <div key={ri} style={{
            display: "grid", gridTemplateColumns: `repeat(${row.length},1fr)`,
            background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)",
            borderRadius: 12, marginBottom: (ri === 0 && Array.isArray(kpis2) && kpis2.length) ? 12 : 20, overflow: "hidden",
          }}>
            {row.map((k, i) => (
              <div key={i} style={{
                padding: "20px 20px",
                borderLeft: i ? "1px solid var(--sh-line, #302c27)" : "none",
                minWidth: 0,
              }}>
                <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", color: "var(--sh-ink3, #75706a)", marginBottom: 10, textTransform: "uppercase" }}>{k.l}</div>
                <div style={{
                  fontFamily: serif, fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1, fontVariationSettings: "'wdth' 112",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}>{k.k}</div>
                {k.sub && <div style={{ fontSize: 11, color: "var(--sh-ink3, #75706a)", marginTop: 6 }}>{k.sub}</div>}
              </div>
            ))}
          </div>
        ) : null)}

        {topSection && (
          <div style={{
            background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)",
            borderRadius: 12, padding: "14px 16px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{topSection.title}</div>
            {topSection.render()}
          </div>
        )}

        {/* Today */}
        {todayItems && todayItems.length > 0 && (
          <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--sh-ink2, #a09b94)" }}>TODAY</div>
              {calendarEvents && cal && (
                <a href="#" onClick={cal.open} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>OPEN CALENDAR <span style={{ fontSize: 12 }}>→</span></a>
              )}
            </div>
            {todayItems.map((t, i) => (
              <DashTodayItemRow key={i} t={t} />
            ))}
          </div>
        )}

        {/* Schedule + Pulse */}
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{scheduleTitle}</div>
              {calendarEvents && cal && (
                <a href="#" onClick={cal.open} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>OPEN CALENDAR <span style={{ fontSize: 12 }}>→</span></a>
              )}
            </div>
            {scheduleRender ? scheduleRender() : schedule.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "14px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--sh-ink2, #a09b94)" }}>{s.time}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.who}</div>
                  <div style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)", marginTop: 2 }}>{s.sub}</div>
                </div>
                {s.status && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 4,
                    background: s.status === "DONE" ? "rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : s.status === "NEXT" ? TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)",
                    color: s.status === "NEXT" ? PAPER : "var(--sh-ink2, #a09b94)",
                    border: s.status === "DONE" ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)" : "none",
                  }}>{s.status}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{pulseTitle}</div>
            {pulseRender ? pulseRender() : pulse.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 1fr 60px", gap: 12, alignItems: "center", padding: "12px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--sh-ink-soft, #efece6)" }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.who}</div>
                  <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 1 }}>{p.sub}</div>
                </div>
                <Sparkline data={p.trend} />
              </div>
            ))}
          </div>
        </div>

        {extraSections && extraSections.map((x, i) => (
          <div key={i} style={{ marginTop: 20, background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{x.title}</div>
            {x.render()}
          </div>
        ))}
        </React.Fragment>
        )}
      </main>
    </DashFrame>
  );
}

function Sparkline({ data, width = 60, height = 22, color = TEAL }) {  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

// ProfileHero — shared hero for all profile pages. Cover photo + avatar overlap + identity + score.
// Uses existing Card padding/typographic system. `stats` is [[k, l], ...] shown in the KPI strip.
function ProfileHero({ eyebrow, name, headline, pills, score, scoreLabel = "COACH SCORE", scoreCaption, stats, cover, avatar }) {
  // Gradient fallback for cover if no image is supplied. Teal→deep-brown diagonal, subtle noise via layered gradients.
  const coverBg = cover
    ? `url(${cover}) center/cover no-repeat`
    : `linear-gradient(135deg, rgba(var(--sh-accent2-rgb, 10,197,168),0.45) 0%, rgba(var(--sh-accent2-rgb, 10,197,168),0.08) 40%, rgba(var(--sh-ground-rgb, 26,22,18),0.9) 100%), radial-gradient(1200px 400px at 20% 20%, rgba(var(--sh-ink-rgb, 242,237,228),0.12), transparent 60%), #221d18`;
  const avatarBg = avatar ? `url(${avatar}) center/cover no-repeat` : "var(--sh-ink-soft, #efece6)";
  return (
    <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, marginBottom: 20, overflow: "hidden" }}>
      {/* Cover */}
      <div style={{ position: "relative", height: 200, background: coverBg }}>
        <button style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(var(--sh-ground-rgb, 26,22,18),0.72)", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)",
          padding: "8px 14px", borderRadius: 999, fontFamily: sans, fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(8px)",
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 9V3.5a1 1 0 0 1 1-1h1l.8-1h3.4l.8 1h1a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.1"/><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.1"/></svg>
          Change cover
        </button>
      </div>

      {/* Identity row — avatar overlaps cover; name/pills/score sit fully below */}
      <div style={{ padding: "0 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 28, alignItems: "flex-start" }}>
          <div style={{ position: "relative", marginTop: -80 }}>
            <div style={{ width: 160, height: 160, borderRadius: 999, background: avatarBg, border: "4px solid var(--sh-ground, #1a1612)", boxShadow: "0 12px 72px -8px rgba(0,0,0,0.5)" }} />
            <button style={{
              position: "absolute", bottom: 4, right: 4,
              width: 36, height: 36, borderRadius: 999,
              background: INK, color: PAPER, border: "2px solid var(--sh-ground, #1a1612)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }} title="Change photo">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10.5V11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-.5M7 9V2M7 2 4.5 4.5M7 2l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div style={{ paddingTop: 20, minWidth: 0 }}>
            {eyebrow && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>{eyebrow}</div>}
            <div style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.03em", lineHeight: 1.1, fontWeight: 400, color: INK, wordBreak: "break-word" }}>{name}</div>
            {pills && pills.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", gap: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", flexWrap: "wrap" }}>
                {pills.map((p, i) => <Pill key={i} tone={p.tone}>{p.label}</Pill>)}
              </div>
            )}
          </div>
          {score != null && (
            <div style={{ textAlign: "right", paddingTop: 20 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sh-ink2, #a09b94)", letterSpacing: "0.14em" }}>{scoreLabel}</div>
              <div style={{ fontFamily: serif, fontSize: 56, color: TEAL_BRIGHT, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{score}</div>
              {scoreCaption && <div style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)", marginTop: 4 }}>{scoreCaption}</div>}
            </div>
          )}
        </div>

        {stats && stats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length},1fr)`, marginTop: 28, paddingTop: 24, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)" }}>
            {stats.map(([k, l], i) => (
              <div key={i} style={{ borderLeft: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : "none", padding: i ? "0 0 0 24px" : "0 24px 0 0" }}>
                <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}>{k}</div>
                <div style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)", marginTop: 8 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// BioCard — editable-feeling bio block. Label eyebrow, long-form body, char counter, edit CTA.
function BioCard({ body, charLimit = 500 }) {
  const chars = body ? body.length : 0;
  return (
    <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, padding: 28, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Bio</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--sh-ink2, #a09b94)", letterSpacing: "0.08em" }}>{chars} / {charLimit}</div>
          <span style={{ fontSize: 12, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", cursor: "pointer" }}>EDIT</span>
        </div>
      </div>
      <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.88)", letterSpacing: "-0.005em", textWrap: "pretty" }}>{body}</div>
    </div>
  );
}

// SubscriptionCard — full-width profile card for the coach's monthly subscription offer.
// Editable price placeholder ($-- /mo) + muted explainer + check-listed perks.
function SubscriptionCard({ price = "--", cadence = "mo", caption = "Set your own monthly subscription price", includes = [] }) {
  return (
    <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, padding: 28, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Subscription</div>
        <span style={{ fontSize: 11, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", cursor: "pointer", border: `1px solid ${TEAL}`, padding: "4px 10px", borderRadius: 4 }}>EDIT</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.03em", fontWeight: 400, lineHeight: 1 }}>${price}</div>
        <div style={{ fontSize: 14, color: "var(--sh-ink2, #a09b94)" }}>/{cadence}</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", marginTop: 8 }}>{caption}</div>
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "var(--sh-ink2, #a09b94)", marginBottom: 14 }}>WHAT'S INCLUDED</div>
        <div style={{ display: "grid", gap: 10 }}>
          {includes.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2.5 7.2 5.5 10l6-6.5" stroke={TEAL_BRIGHT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Recent payouts — 3-col table (date · middle meta · amount). Matches schedule/pulse row rhythm.
function RecentPayouts({ rows }) {
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "center",
          padding: "16px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{r.date}</div>
          <div style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", textAlign: "center" }}>{r.mid}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>{r.amount}</div>
        </div>
      ))}
    </div>
  );
}

// ── CSV EXPORT (review 2026-09-09, R12) ───────────────────────────────────
// One button for both exports, here rather than on either page, because the
// download mechanics (Blob · object URL · revoke) are the part that is easy to get
// subtly wrong and there is no reason to have two of them.
//
// ⚠ IT IS DISABLED IN THE SIGNED-OUT PREVIEW, AND THAT IS AN HONEST-DATA CALL RATHER
// THAN A STYLE ONE. Everything else in the preview is labelled demo by the band above
// it; a CSV leaves the page and loses every label it had. A file called
// `roster-2026-09-10.csv` full of Marcus T. and Priya S., opened in a spreadsheet three
// weeks later, has nothing left on it that says the people are invented — and CSVs have
// no comment syntax to put it back. The control still renders, so the feature is
// discoverable, and it says why it is off.
function DashExportButton({ kind, build, live, label }) {
  const [err, setErr] = React.useState("");
  const on = !!live;
  const go = () => {
    setErr("");
    try {
      const text = build();
      if (typeof text !== "string" || !text) { setErr("Nothing to export yet."); return; }
      const E = window.DashExport;
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = E ? E.fileName(kind, new Date()) : kind + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoked on the next tick, not immediately: Safari has not started the
      // download when click() returns, and revoking under it cancels the save.
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
    } catch (e) {
      // ⚠ SAID OUT LOUD RATHER THAN SWALLOWED. A button that does nothing when
      // tapped is the worst of the three outcomes; a coach who is told the export
      // failed can try again or say so.
      setErr("Export failed — nothing was saved.");
    }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={on ? go : undefined}
        disabled={!on}
        title={on ? "Download a CSV of " + (label || kind) : "Export is live-only — this preview's people are invented"}
        style={{
          background: "transparent", color: on ? "rgba(var(--sh-ink-rgb, 242,237,228),0.75)" : "var(--sh-ink3, #75706a)",
          border: "1px solid " + (on ? "rgba(var(--sh-ink-rgb, 242,237,228),0.18)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)"),
          padding: "7px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
          cursor: on ? "pointer" : "not-allowed", minHeight: 30,
        }}
      >↓ Export CSV</button>
      {!on && <span style={{ fontSize: 10.5, color: "var(--sh-ink3, #75706a)" }}>live only</span>}
      {err && <span style={{ fontSize: 10.5, color: "var(--sh-gold, #d8a23a)" }}>{err}</span>}
    </span>
  );
}

Object.assign(window, { goalQuarterLabel, DashShell, DashPage, DashFrame, DashSidebar, Sparkline, Card, SectionTitle, DashSegmented, DashPaperPicker, Pill, RecentPayouts, ProfileHero, BioCard, SubscriptionCard, DashExportButton });
