// ═══════════════════════════════════════════════════════════════
// SHAPE · Living Identity Object — shared system
// Tier-as-atmosphere, member data, generative seed, phone chrome
// (always-visible name + Message + privacy), reduced-motion safe.
// Rendered inside ios-frame.jsx. No pageShell dependency.
// ═══════════════════════════════════════════════════════════════

const LV_BG = "#100d0a";
const LV_INK = "#f2ede4";
const LV_TEAL = "#1ec0a8";        // brand accent — live / now / Message
const LV_TEALB = "#2ee0c4";
const lvSerif = "'Fraunces', serif";
const lvSans = "'Space Grotesk', sans-serif";
const lvMono = "'JetBrains Mono', monospace";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
function lvRng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Shape momentum tiers — the member's tier is the screen's ATMOSPHERE.
const LV_TIERS = {
  spark: { name: "Spark", color: "#e8743a", rank: "I" },
  tempo: { name: "Tempo", color: "#5ec8e0", rank: "II" },
  surge: { name: "Surge", color: "#f0653f", rank: "III" },
  apex:  { name: "Apex",  color: "#f2b84e", rank: "IV" },
};

// Three Shape personas — same schema so every direction renders for each.
// role drives label swaps (member vs coach). lifts = "signature numbers".
const LV_PEOPLE = {
  client: {
    role: "client", roleLabel: "Member",
    name: "Priya Shah", first: "Priya", handle: "@priya.lifts", initials: "PS",
    city: "Brooklyn, NY", member: "1842", tier: "surge",
    score: 1284, scoreWk: 82, streak: 14, months: 16,
    statLabel: ["Shape Score", "Day streak", "Months in"],
    goal: "A 1.5× bodyweight squat.", goalShort: "1.5× BODYWEIGHT", goalKicker: "Chasing",
    disciplines: [["Strength", 0.82], ["Endurance", 0.64], ["Consistency", 0.91], ["Recovery", 0.73]],
    discLabel: "Disciplines",
    lifts: [["Squat", "245"], ["Deadlift", "285"], ["Bench", "135"]],
    liftsLabel: "Personal records",
    arc: [["FEB ’25", "Bar-only squat", "start"], ["NOW", "245 lb × 5", "now"], ["TARGET", "258 lb · 1.5×BW", "target"]],
    arcLabel: "The climb",
    relation: { kicker: "Coached by", name: "Maya Okafor", initials: "MO", hue: 168, note: "Push to 60 lb today if bar speed stays crisp." },
    statusLabel: "In training", block: "Week 6 of 12", program: "Hypertrophy Block II", goalPct: 0.84, coachedBy: "Maya Okafor",
    pronouns: "she/her", link: ["Strava", "strava.com/priya"], since: "FEB 2024", sinceLabel: "Member since",
    portrait: "1544005313-94ddf0286df2",
    traj: [176, 175, 174, 173, 172, 171, 171], trajLabel: "Body-comp trajectory", trajDelta: "−5 lb", trajNote: "16-wk recomp",
    prRecent: ["Back squat", "245 × 5", "+22 lb"],
    feedLabel: "Transmissions",
    feed: [
      { k: "workout", t: "Lower push · Week 6", b: "Squatted 245×5. Bar speed stayed crisp through the last rep — first time that’s happened at this weight.", metric: ["Squat", "245×5"], time: "2h", vis: "public" },
      { k: "note", t: "Why I stopped maxing out every week", b: "Spent a year chasing 1-rep maxes and stalling. Switched to leaving 2 in the tank. Everything started moving. Boring works.", time: "1d", vis: "public" },
      { k: "pr", t: "New PR — Back squat", b: "Six weeks ago this was a hard triple at 225.", metric: ["▲", "+22 lb"], time: "2d", vis: "public" },
      { k: "meal", t: "Closed the day at 168g protein", b: "Salmon, sweet potato, asparagus. Rae’s targets are finally automatic.", time: "2d", vis: "circle" },
      { k: "run", t: "Sunrise shakeout", b: "5.2 km easy. Legs felt springy after yesterday’s pulls, somehow.", metric: ["5K", "24:51"], time: "3d", vis: "public" },
      { k: "note", t: "Deload week, honest notes", b: "Sleep was rough, mood dipped. Writing it down so future me remembers deloads are not optional.", time: "5d", vis: "private" },
    ],
    week: [40, 72, 55, 88, 33, 90, 18], seed: 73199,
  },
  trainer: {
    role: "trainer", roleLabel: "Trainer · NASM-CPT", verified: true,
    name: "Maya Okafor", first: "Maya", handle: "@mayalifts", initials: "MO",
    city: "Gowanus, Brooklyn", member: "0042", tier: "apex",
    score: 4970, scoreWk: 41, streak: 96, months: 108,
    statLabel: ["Coach rating ·100", "Clients now", "Months coaching"],
    goal: "Get strong, stay strong.", goalShort: "STRENGTH, MADE SIMPLE", goalKicker: "Coaching philosophy",
    disciplines: [["Strength", 0.95], ["Hypertrophy", 0.88], ["Powerlifting", 0.8], ["Form audit", 0.92]],
    discLabel: "Coaching focus",
    lifts: [["Clients", "90+"], ["Rating", "9.94"], ["Years", "9"]],
    liftsLabel: "Track record",
    arc: [["2016", "First client", "start"], ["NOW", "90+ coached", "now"], ["NEXT", "Strength cohort", "target"]],
    arcLabel: "The practice",
    relation: { kicker: "Recent win", name: "Jonah W.", initials: "JW", hue: 200, note: "Pulled 2× bodyweight after 8 months — never touched a barbell before me." },
    pronouns: "she/her", link: ["Site", "mayaokafor.co"], since: "2016", sinceLabel: "Coaching since",
    portrait: "1438761681033-6461ffad8d80",
    rating: "9.94", reviewCount: 284, responds: "within 2 hours",
    certs: [
      { abbr: "NASM-CPT", body: "Certified Personal Trainer", year: "2016", verified: true },
      { abbr: "USAW-L1", body: "USA Weightlifting", year: "2020", verified: true },
      { abbr: "FMS-L2", body: "Functional Movement Screen", year: "2021", verified: true },
    ],
    offerLabel: "Train with Maya",
    offerings: [
      { kind: "Workout", name: "Single 1:1 session", sub: "60 min, in-person or remote", price: "$32" },
      { kind: "Program", name: "6-week strength block", sub: "Custom programming + weekly check-ins", price: "$240" },
      { kind: "Coaching", name: "Monthly coaching", sub: "Full programming, form reviews, daily chat", price: "$180", unit: "/mo" },
      { kind: "Consult", name: "Form audit", sub: "Send a lift, get a written breakdown", price: "$45" },
      { kind: "Consult", name: "Intro call", sub: "15 min — see if we’re a fit", price: "Free", free: true },
    ],
    reviews: [
      { name: "Priya S.", initials: "PS", hue: 168, stars: 5, time: "3 wks ago", body: "+60 lb on my deadlift in 14 weeks without a single bad-back day. Her programming finally clicked for me." },
      { name: "Marcus L.", initials: "ML", hue: 220, stars: 5, time: "5 mo ago", body: "World-class programming. She books up fast — plan ahead, it’s worth it." },
    ],
    traj: [20, 35, 48, 60, 72, 84, 90], trajLabel: "Roster trajectory", trajDelta: "+18", trajNote: "clients this year",
    prRecent: ["Client PR", "2× BW pull", "Jonah W."],
    feedLabel: "Field notes",
    feed: [
      { k: "tip", t: "The 3 cues that fix most squats", b: "Brace, spread the floor, own the bottom. Stop adding weight until these are automatic. Save this for leg day.", time: "2d", vis: "public" },
      { k: "win", t: "Jonah pulled 2× bodyweight today", b: "Came in scared of barbells 8 months ago. Showed up every week. That’s the whole secret.", metric: ["DL", "2×BW"], time: "4d", vis: "public" },
      { k: "note", t: "You don’t need a new program", b: "You need 8 more weeks on this one. Program-hopping is the #1 thing stalling the lifters in my DMs.", time: "6d", vis: "public" },
      { k: "workout", t: "My own session — heavy singles", b: "Still training hard at 4.97. Coaches who don’t lift age out fast.", metric: ["Squat", "315"], time: "1w", vis: "circle" },
    ],
    week: [88, 60, 92, 70, 95, 50, 80], seed: 41027,
  },
  nutritionist: {
    role: "nutritionist", roleLabel: "Dietitian · RD, CSSD", verified: true,
    name: "Rae Lindqvist", first: "Rae", handle: "@raeats.rd", initials: "RL",
    city: "Brooklyn, NY", member: "0118", tier: "tempo",
    score: 4950, scoreWk: 38, streak: 73, months: 84,
    statLabel: ["Coach rating ·100", "Clients now", "Months practicing"],
    goal: "Fuel the work you’re doing.", goalShort: "FOOD IS FUEL", goalKicker: "Practice philosophy",
    disciplines: [["Performance", 0.9], ["Gut health", 0.82], ["Iron & ferritin", 0.86], ["Recovery", 0.8]],
    discLabel: "Practice focus",
    lifts: [["Clients", "200+"], ["Rating", "9.9"], ["Years", "7"]],
    liftsLabel: "Track record",
    arc: [["2018", "Registered", "start"], ["NOW", "200+ fueled", "now"], ["NEXT", "Endurance panel", "target"]],
    arcLabel: "The practice",
    relation: { kicker: "Recent win", name: "Sofia M.", initials: "SM", hue: 300, note: "Found her low ferritin before any doctor did — training volume up 50%." },
    pronouns: "she/her", link: ["Substack", "fuel-notes.rae"], since: "2018", sinceLabel: "Practicing since",
    portrait: "1494790108377-be9c29b29330",
    rating: "9.9", reviewCount: 198, responds: "within 3 hours",
    certs: [
      { abbr: "RD", body: "Registered Dietitian", year: "2018", verified: true },
      { abbr: "CSSD", body: "Sports Dietetics Specialist", year: "2020", verified: true },
      { abbr: "FODMAP", body: "Monash FODMAP-trained", year: "2022", verified: true },
    ],
    offerLabel: "Work with Rae",
    offerings: [
      { kind: "Meal plan", name: "Custom meal plan", sub: "2 weeks, built to your macros & schedule", price: "$60" },
      { kind: "Program", name: "6-week nutrition program", sub: "Plan + weekly adjustments + chat", price: "$220" },
      { kind: "Coaching", name: "Monthly coaching", sub: "Ongoing plans, labs review, accountability", price: "$160", unit: "/mo" },
      { kind: "Consult", name: "Single consultation", sub: "60-min deep dive + written notes", price: "$40" },
      { kind: "Consult", name: "Intro call", sub: "15 min — see if we’re a fit", price: "Free", free: true },
    ],
    reviews: [
      { name: "Sofia M.", initials: "SM", hue: 300, stars: 5, time: "6 wks ago", body: "She found my low ferritin before any doctor did. I train 50% more volume now. Practical, never preachy." },
      { name: "Diego R.", initials: "DR", hue: 200, stars: 5, time: "4 mo ago", body: "Learned what fueling a lifting block actually looks like. Lifts up, sleep fixed. Clearest plans I’ve seen." },
    ],
    traj: [120, 140, 158, 172, 184, 194, 200], trajLabel: "Caseload trajectory", trajDelta: "+22", trajNote: "clients this year",
    prRecent: ["Client win", "Ferritin fixed", "Sofia M."],
    feedLabel: "Fuel notes",
    feed: [
      { k: "recipe", t: "The post-lift shake I give everyone", b: "Whey, banana, oats, milk, cinnamon. 50g protein, blends in 30 seconds. Recipe in the comments.", metric: ["Protein", "50g"], time: "1d", vis: "public" },
      { k: "tip", t: "Always tired? Check ferritin before macros", b: "Half the ‘low energy’ DMs I get are iron, not calories. Ask your doctor for a full iron panel.", time: "3d", vis: "public" },
      { k: "win", t: "Sofia’s training volume up 50%", b: "Found her low ferritin before any doctor did. Fix the input, the output follows.", time: "5d", vis: "public" },
      { k: "recipe", t: "Sheet-pan salmon for recovery nights", b: "Omega-3s + carbs for the next session. 20 minutes, one pan.", metric: ["Protein", "45g"], time: "1w", vis: "circle" },
    ],
    week: [70, 85, 55, 78, 90, 62, 75], seed: 90218,
  },
};
const LV = LV_PEOPLE.client; // default
function tierOf(d) { return LV_TIERS[d.tier]; }

// ── Atmosphere: tier-tinted glow + film grain ──
function LvGrain() {
  return (
    <svg aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06, pointerEvents: "none", mixBlendMode: "overlay" }}>
      <filter id="lvNoise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#lvNoise)" />
    </svg>
  );
}
function LvScreen({ d, light = false, children, contentRef, onScroll }) {
  const c = tierOf(d).color;
  const bg = light ? "#f1ece3" : LV_BG;
  return (
    <div style={{ position: "relative", height: "100%", background: bg, color: light ? "#1a1612" : LV_INK, overflow: "hidden", fontFamily: lvSans, "--lvc": c, "--lvc-soft": hexA(c, 0.16) }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(135% 70% at 72% 4%, ${hexA(c, light ? 0.22 : 0.34)}, transparent 56%), radial-gradient(120% 60% at 10% 100%, ${hexA(c, light ? 0.1 : 0.16)}, transparent 60%)` }} />
      <LvGrain />
      <div ref={contentRef} onScroll={onScroll} className="lv-scroll" style={{ position: "relative", height: "100%", overflowY: "auto", overflowX: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// ── Always-on phone chrome: status, sticky identity, action dock ──
function LvStatusBar({ light }) {
  const c = light ? "#1a1612" : LV_INK;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", zIndex: 30, pointerEvents: "none" }}>
      <span style={{ fontFamily: lvMono, fontSize: 12, fontWeight: 600, color: c }}>9:41</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center", opacity: 0.9 }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill={c}><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5" stroke={c} opacity="0.5"/><rect x="2" y="2" width="13.5" height="7" rx="1.2" fill={c}/><rect x="20" y="3.5" width="1.5" height="4" rx="0.75" fill={c} opacity="0.5"/></svg>
      </div>
    </div>
  );
}

// Sticky condensed identity bar — fades in as the hero scrolls away.
function LvStickyBar({ d, show, light, onMsg }) {
  const c = tierOf(d).color;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 25, paddingTop: 44,
      background: show ? (light ? "rgba(241,236,227,0.82)" : "rgba(16,13,10,0.82)") : "transparent",
      backdropFilter: show ? "blur(16px)" : "none", borderBottom: show ? `1px solid ${hexA(c, 0.22)}` : "1px solid transparent",
      transition: "background .35s, border-color .35s, backdrop-filter .35s", pointerEvents: show ? "auto" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px 10px", opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(-6px)", transition: "opacity .3s, transform .3s" }}>
        <LvCrest d={d} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: lvSerif, fontSize: 16, letterSpacing: "-0.02em", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
        </div>
        <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c, border: `1px solid ${hexA(c, 0.4)}`, borderRadius: 999, padding: "3px 8px" }}>{tierOf(d).name}</span>
        <button onClick={onMsg} aria-label="Message" style={{ width: 30, height: 30, borderRadius: 999, border: 0, background: LV_TEAL, color: "#06110e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4z" stroke="#06110e" strokeWidth="2.2" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}

// Tiny generative crest — concentric tier arcs from the member seed.
function LvCrest({ d, size = 40 }) {
  const c = tierOf(d).color;
  const r = lvRng(d.seed);
  const rings = 3, cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: "none" }} aria-hidden="true">
      {Array.from({ length: rings }).map((_, i) => {
        const rad = (size / 2) * (0.34 + i * 0.22);
        const start = r() * 360, sweep = 120 + r() * 180;
        const a0 = (start * Math.PI) / 180, a1 = ((start + sweep) * Math.PI) / 180;
        const large = sweep > 180 ? 1 : 0;
        return <path key={i} d={`M ${cx + rad * Math.cos(a0)} ${cx + rad * Math.sin(a0)} A ${rad} ${rad} 0 ${large} 1 ${cx + rad * Math.cos(a1)} ${cx + rad * Math.sin(a1)}`}
          fill="none" stroke={i === rings - 1 ? LV_TEAL : c} strokeWidth={size * 0.04} strokeLinecap="round" opacity={0.55 + i * 0.18} />;
      })}
      <circle cx={cx} cy={cx} r={size * 0.05} fill={LV_TEAL} />
    </svg>
  );
}

// Portrait helper — face-cropped Unsplash. Members add their own; falls
// back to the generative crest when absent or hidden.
const lvPortraitURL = (id, s = 360) => !id ? "" : (/^https?:|^data:|^\//.test(String(id)) ? String(id) : `https://images.unsplash.com/photo-${id}?w=${s}&h=${s}&fit=crop&crop=faces&q=72&auto=format`);

// Circular masked portrait with a tier-tinted duotone wash + ring.
// editable → shows an "add/replace" affordance for own-profile.
function lvShade(hex, f) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * f)}, ${Math.round(((n >> 8) & 255) * f)}, ${Math.round((n & 255) * f)})`;
}
// Facet avatar — a rounded-diamond gem with initials/photo inside, tier-coloured.
// Matches the mobile app's avatar so the facet look is the same everywhere.
function LvPortrait({ d, size = 96, duotone = false, editable = false, hide = false }) {
  const c = tierOf(d).color;
  const inset = Math.max(2, Math.round(size * 0.06));
  // A portrait only counts if it's a real, non-empty image ref — a blank/stale
  // stored value ('', 'null', a bodyless data: URI) is ignored so the avatar
  // falls back to initials instead of an invisible image over them.
  const portraitOk = (() => {
    const s = (d.portrait == null ? "" : String(d.portrait)).trim();
    if (!s || s === "null" || s === "undefined") return false;
    if (/^data:/i.test(s)) return /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{16,}/i.test(s);
    return true; // http(s)/path or an unsplash id token
  })();
  const hasPhoto = !hide && portraitOk;
  // The set rule: a profile avatar is ALWAYS a photo or initials — never a blank
  // gem. Use the explicit initials, else derive 2 letters from the name, so a
  // profile that only carries a name (most live accounts) still reads.
  const initials = (d.initials && String(d.initials).trim())
    || (d.name ? String(d.name).trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() : "");
  return (
    <div style={{ width: size, height: size, position: "relative", display: "grid", placeItems: "center", flex: "none" }}>
      <div style={{ position: "absolute", inset: 0, transform: "rotate(45deg)", borderRadius: "27%", background: `linear-gradient(135deg, ${c}, ${lvShade(c, 0.5)})`, boxShadow: `0 6px 18px ${hexA(c, 0.4)}, inset 1px 1px 2px rgba(255,255,255,0.3)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "27%", background: "linear-gradient(135deg, rgba(255,255,255,0.28), transparent 42%)" }} />
        <div style={{ position: "absolute", inset, borderRadius: "23%", overflow: "hidden", background: LV_BG, display: "grid", placeItems: "center" }}>
          {/* initials/crest underneath → a missing/broken photo falls back to them */}
          <div style={{ transform: "rotate(-45deg)", display: "grid", placeItems: "center" }}>
            {(!hide && initials)
              ? <span style={{ fontFamily: lvSerif, fontWeight: 500, fontSize: size * 0.4, color: LV_INK, letterSpacing: "-0.02em", lineHeight: 1 }}>{initials}</span>
              : <LvCrest d={d} size={size * 0.5} />}
          </div>
          {hasPhoto && (
            <React.Fragment>
              <img src={lvPortraitURL(d.portrait, Math.round(size * 2))} alt={d.name || ""} onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", width: "152%", height: "152%", left: "50%", top: "50%", transform: "translate(-50%,-50%) rotate(-45deg)", objectFit: "cover" }} />
              {duotone && <div style={{ position: "absolute", inset: 0, background: hexA(c, 0.42), mixBlendMode: "color" }} />}
            </React.Fragment>
          )}
        </div>
      </div>
      {editable && <LvAddBadge c={c} size={size} replace={hasPhoto} />}
    </div>
  );
}
function LvAddBadge({ c, size, replace }) {
  return (
    <div style={{ position: "absolute", right: -2, bottom: -2, width: Math.max(26, size * 0.3), height: Math.max(26, size * 0.3), borderRadius: 999, background: c, color: "#1a1210", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${LV_BG}`, cursor: "pointer" }} title={replace ? "Replace photo" : "Add photo"}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" stroke="#1a1210" strokeWidth="2" strokeLinejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="#1a1210" strokeWidth="2"/></svg>
    </div>
  );
}

// Weekly momentum — 7 bars, today highlighted in teal.
function LvWeekBars({ d, height = 38, light = false }) {
  const c = tierOf(d).color;
  const ink = light ? "#1a1612" : LV_INK;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height }} aria-hidden="true">
      {d.week.map((v, i) => {
        const today = i === d.week.length - 1;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${Math.max(8, v)}%`, borderRadius: 3, background: today ? LV_TEAL : hexA(c, 0.55) }} />
          </div>
        );
      })}
    </div>
  );
}

// Trajectory sparkline (body-comp / caseload) — area + line.
function LvSparkline({ data, color, w = 120, h = 38, light = false }) {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const id = "sp" + Math.round(color.charCodeAt(1) * data.length);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={hexA(color, 0.32)} /><stop offset="100%" stopColor={hexA(color, 0)} /></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.6} fill={LV_TEAL} />
    </svg>
  );
}

// Action dock — compact floating glass bar. One-thumb. Always shows
// Message + (coaches) View coaching / (members) Follow, or owner privacy.
function LvDock({ d, owner, light, privacy, onPrivacy, onMsg }) {
  const c = tierOf(d).color;
  const coach = d.role !== "client";
  const bg = light ? "#f1ece3" : LV_BG;
  // Fade strip (content dissolves into bg) above a fully-solid button base,
  // so nothing ever shows through or looks half-covered. Base clears the
  // iOS home indicator. Scrim ignores taps; buttons capture them.
  const wrap = { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 26, pointerEvents: "none" };
  const fade = { height: 56, background: `linear-gradient(180deg, ${hexA(bg, 0)}, ${bg})` };
  const base = { background: bg, padding: "2px 14px 34px", pointerEvents: "auto" };
  const row = { display: "flex", gap: 9 };
  const btn = (bgc, color, brd, flex) => ({ flex, height: 46, borderRadius: 14, border: brd || 0, background: bgc, color, fontFamily: lvSans, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" });
  const msgIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4z" stroke="#06110e" strokeWidth="2.4" strokeLinejoin="round"/></svg>;
  if (owner) {
    return (
      <div style={wrap}>
        <div style={fade} />
        <div style={base}>
          <div style={row}>
            <button onClick={onPrivacy} style={btn("transparent", light ? "#1a1612" : LV_INK, `1px solid ${hexA(light ? "#1a1612" : "#f2ede4", 0.22)}`, 1)}>
              {LV_PRIV[privacy].icon}&nbsp;{LV_PRIV[privacy].label}
            </button>
            <button style={btn(c, "#1a1210", 0, 1)}>Edit identity</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <div style={fade} />
      <div style={base}>
        <div style={row}>
          <button onClick={onMsg} style={btn(LV_TEAL, "#06110e", 0, 1)}>{msgIcon} Message</button>
          {coach
            ? <button style={btn(light ? "#1a1612" : LV_INK, light ? "#f1ece3" : LV_BG, 0, 1)}>View coaching</button>
            : <LvFollowBtn c={c} light={light} btn={btn} />}
        </div>
      </div>
    </div>
  );
}
function LvFollowBtn({ c, light, btn }) {
  const [f, setF] = React.useState(false);
  return (
    <button onClick={() => setF(v => !v)} style={f
      ? btn("transparent", light ? "#1a1612" : LV_INK, `1px solid ${hexA(light ? "#1a1612" : "#f2ede4", 0.22)}`, 1)
      : btn(light ? "#1a1612" : LV_INK, light ? "#f1ece3" : LV_BG, 0, 1)}>
      {f ? "Following" : "Follow"}
    </button>
  );
}

// Privacy model — visibility states for the whole identity object.
const LV_PRIV = {
  public:  { icon: "◍", label: "Public",  hint: "Anyone on Shape" },
  circle:  { icon: "◑", label: "Circle",  hint: "People you train with" },
  private: { icon: "●", label: "Private", hint: "Only you" },
};
const LV_PRIV_ORDER = ["public", "circle", "private"];

// Categorized services — distinctive filing-card tabs that physically
// connect into the panel below (a card-index, not a generic tab bar).
const LV_CAT = { Workout: "Workouts", Program: "Programs", Coaching: "Coaching", Consult: "Consults", "Meal plan": "Plans" };
function LvServices({ d, light, ink, c, owner, onReviews, stHead, ratingAvg, reviewCount }) {
  const isNutri = /nutritionist/i.test(String(d.role || "")); // d.role is lowercase (demo + live)
  // Real published catalogue (coach_plans) keyed by the coach's user id; falls
  // back to the demo offerings when the coach hasn't published any.
  const [real, setReal] = React.useState(null);
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!d.uid || !cl || !cl.rpc) { setReal([]); return; }
    let on = true;
    const kindOf = (cat, kind) => {
      const cc = String(cat || "").toLowerCase();
      // The mobile Listing's role-aware single-item shelf (spec #1632 §4) —
      // same category matchers, so app and site bucket identically.
      if (isNutri ? /meal/.test(cc) : /workout|single/.test(cc)) return "Single";
      if (kind === "meal_plan" || /meal/.test(cc)) return "Meal plan";
      if (/session|form/.test(cc)) return "Workout";
      if (/program|block|strength|hypertrophy|diet|cut|recomp|nutrition/.test(cc)) return "Program";
      return "Coaching";
    };
    cl.rpc("get_coach_sale_plans_by_user", { p_user_id: d.uid }).then((r) => {
      if (!on) return;
      const rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
      setReal(rows.map((pl) => ({
        kind: kindOf(pl.category, pl.kind), name: pl.name, sub: pl.meta || "",
        price: pl.price ? (/^\$|free/i.test(String(pl.price)) ? String(pl.price) : `$${pl.price}`) : "Listed",
        unit: "", free: /free/i.test(String(pl.price || "")),
        planId: pl.id, providerId: pl.provider_id, providerRole: pl.provider_role,
        media: (pl.detail && Array.isArray(pl.detail.media)) ? pl.detail.media.filter((m) => m && m.url) : [],
      })));
    }).catch(() => { if (on) setReal([]); });
    return () => { on = false; };
  }, [d.uid]);
  const offerings = (real && real.length) ? real : d.offerings;
  // Buy a real plan via the same Stripe Connect checkout as the marketplace.
  const buyPlan = async (o) => {
    if (!o || !o.planId || !o.providerId) return;
    try {
      const res = await fetch("/api/stripe/checkout-session", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: { type: "plan", name: o.name, price: o.price, planId: o.planId }, coach: { provider_id: o.providerId, provider_role: o.providerRole }, ref: (window.ShapeCoachRef && window.ShapeCoachRef.token()) || undefined, successPath: "/purchase/success", cancelPath: "/newdesign/MemberProfile.html" }) });
      const j = await res.json().catch(() => ({}));
      if (j.url) window.location.href = j.url; else alert(j.error === "membership_required" ? "Become a Shape member to buy plans." : (j.error || "Could not start checkout."));
    } catch (e) { alert("Could not start checkout."); }
  };
  // categories present, in stable order
  const order = ["Workout", "Meal plan", "Program", "Single", "Coaching", "Consult"];
  const kinds = order.filter(k => offerings.some(o => o.kind === k));
  const cats = ["All", ...kinds];
  const [cat, setCat] = React.useState("All");
  const list = cat === "All" ? offerings : offerings.filter(o => o.kind === cat);
  const label = (k) => k === "All" ? "All" : (k === "Single" ? (isNutri ? "Single meals" : "Single workouts") : (LV_CAT[k] || k));
  const count = (k) => k === "All" ? offerings.length : offerings.filter(o => o.kind === k).length;
  const idx = (on) => ({ background: "transparent", border: 0, cursor: "pointer", whiteSpace: "nowrap", flex: "none", position: "relative", padding: "6px 2px 9px", fontFamily: lvMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: on ? ink : hexA(ink, 0.45) });
  // Prefer the LIVE review avg/count (passed from LvCoachBlocks) so the rate-card
  // rating never drifts from what the Reviews tab actually shows.
  const shownRating = ratingAvg != null ? ratingAvg : d.rating;
  const shownReviewCount = reviewCount != null ? reviewCount : d.reviewCount;
  const reviewsBtn = { cursor: onReviews ? "pointer" : "default", textDecoration: onReviews ? "underline" : "none", textUnderlineOffset: 2, color: ink, background: "transparent", border: 0, padding: 0, font: "inherit" };
  const ratingMeta = <span style={{ fontFamily: lvMono, fontSize: 10, color: hexA(ink, 0.5) }}>★ {shownRating}/10 · {onReviews ? <button type="button" onClick={onReviews} style={reviewsBtn}>{shownReviewCount} reviews</button> : <span>{shownReviewCount} reviews</span>}</span>;
  return (
    <div style={{ marginTop: 30 }}>
      {stHead ? stHead(d.offerLabel, ratingMeta) : <div style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: hexA(ink, 0.5), marginBottom: 13 }}>{d.offerLabel}</div>}
      {/* category index — mono labels with a heat underline (was filing-card tabs) */}
      <div className="lv-tabrow" style={{ display: "flex", gap: 18, alignItems: "flex-end", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${hexA(ink, 0.08)}`, marginBottom: 4 }}>
        {cats.map((k) => {
          const on = cat === k;
          return (
            <button key={k} type="button" onClick={() => setCat(k)} style={idx(on)}>
              {label(k)}<span style={{ marginLeft: 5, color: hexA(ink, on ? 0.45 : 0.3) }}>{count(k)}</span>
              {on && <span aria-hidden="true" style={{ position: "absolute", left: 2, right: 2, bottom: -1, height: 2, background: c }} />}
            </button>
          );
        })}
      </div>
      {/* rate-card rows — zero-box dot-leader rows (name · leader · price) */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {list.map((o, i) => {
          const buyable = !owner && o.planId && o.providerId && !o.free && o.price !== "Listed";
          const buyProps = buyable ? { role: "button", tabIndex: 0, "aria-label": `Buy ${o.name} · ${o.price}`, onClick: () => buyPlan(o), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); buyPlan(o); } } } : {};
          return (
            <div key={o.planId || o.name || o.kind + i} {...buyProps} style={{ padding: "13px 0", borderTop: i ? `1px solid ${hexA(ink, 0.08)}` : "none", cursor: buyable ? "pointer" : "default" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: lvMono, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(ink, 0.45), marginBottom: 4 }}>{o.kind === "Single" ? (isNutri ? "Single meal" : "Single workout") : o.kind}</div>
                  <div style={{ fontFamily: lvSerif, fontSize: 17, letterSpacing: "-0.01em", color: ink }}>{o.name}</div>
                  <div style={{ fontFamily: lvSans, fontSize: 12, color: hexA(ink, 0.55), marginTop: 4 }}>{o.sub}</div>
                </div>
                <span aria-hidden="true" style={{ flex: 1, borderBottom: `1px dotted ${hexA(ink, 0.28)}`, transform: "translateY(-5px)", minWidth: 18, alignSelf: "center" }} />
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div style={{ fontFamily: lvSerif, fontSize: 20, letterSpacing: "-0.02em", color: o.free ? c : ink }}>{o.price}<span style={{ fontFamily: lvMono, fontSize: 10, color: hexA(ink, 0.45) }}>{o.unit || ""}</span></div>
                  <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: c, marginTop: 3 }}>{buyable ? "Buy →" : "Book →"}</div>
                </div>
              </div>
              {o.media && o.media.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
                  {o.media.slice(0, 8).map((m, j) => (
                    <div key={m.url || j} style={{ position: "relative", flex: "none", width: 66, height: 66, borderRadius: 9, overflow: "hidden", background: hexA(ink, 0.06), border: `1px solid ${hexA(ink, 0.08)}` }}>
                      {m.type === "video"
                        ? <video src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline preload="metadata" />
                        : <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      {m.type === "video" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="9" height="9" viewBox="0 0 10 10"><path d="M2 1l6 4-6 4z" fill="#fff" /></svg></div></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
      </div>
      <div style={{ fontFamily: lvSans, fontSize: 11.5, color: hexA(ink, 0.45), marginTop: 12, textAlign: "left" }}>Usually replies {d.responds}</div>
    </div>
  );
}

// ── Client signature elements (members only — sets them apart from
// coaches at a glance: live training status + goal progress + the
// program/coach they're working through). Teal-forward = "in motion".
function LvClientStatus({ light, reduced }) {
  const ink = light ? "#1a1612" : LV_INK;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: lvMono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: LV_TEAL, background: hexA(LV_TEAL, 0.12), border: `1px solid ${hexA(LV_TEAL, 0.4)}`, borderRadius: 999, padding: "5px 11px" }}>
      <span className={reduced ? "" : "lv-pulse"} style={{ width: 7, height: 7, borderRadius: 999, background: LV_TEAL }} /> In training
    </span>
  );
}
// Goal-progress bar — the member's % toward their target. Coaches never show this.
function LvGoalProgress({ d, light, height = 8 }) {
  const c = tierOf(d).color;
  const ink = light ? "#1a1612" : LV_INK;
  const pct = Math.round(d.goalPct * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ fontFamily: lvMono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: hexA(ink, 0.55) }}>Goal · {d.goalShort}</span>
        <span style={{ fontFamily: lvSerif, fontSize: 17, letterSpacing: "-0.02em", color: LV_TEAL }}>{pct}%</span>
      </div>
      <div style={{ height, borderRadius: height, background: hexA(ink, 0.1), overflow: "hidden", position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: height, background: `linear-gradient(90deg, ${hexA(c, 0.7)}, ${LV_TEAL})` }} />
        <div style={{ position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%,-50%)", width: height + 4, height: height + 4, borderRadius: 999, background: LV_TEAL, boxShadow: `0 0 8px ${hexA(LV_TEAL, 0.7)}` }} />
      </div>
    </div>
  );
}
// Program / coached-by band — the inverse of a coach (a member being coached).
function LvClientBand({ d, light }) {
  const c = tierOf(d).color;
  const ink = light ? "#1a1612" : LV_INK;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 13, background: hexA(LV_TEAL, 0.07), border: `1px solid ${hexA(LV_TEAL, 0.22)}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: LV_TEAL }}>{d.block}</div>
        <div style={{ fontFamily: lvSans, fontSize: 13.5, color: hexA(ink, 0.85), marginTop: 4 }}>{d.program}</div>
      </div>
      <div style={{ width: 1, alignSelf: "stretch", background: hexA(ink, 0.12) }} />
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, flex: "none", background: `linear-gradient(150deg, hsl(${d.relation.hue} 40% 34%), hsl(${d.relation.hue} 36% 20%))`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: lvSerif, fontSize: 12, color: "#f2ede4" }}>{d.relation.initials}</div>
        <div>
          <div style={{ fontFamily: lvMono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(ink, 0.45) }}>Coached by</div>
          <div style={{ fontFamily: lvSans, fontSize: 12.5, color: hexA(ink, 0.85), marginTop: 2 }}>{d.coachedBy}</div>
        </div>
      </div>
    </div>
  );
}

// ── Coach marketplace blocks (trainer/nutritionist only) ─────
// Certifications (verified), Services & prices, Reviews. Adapts to
// the host direction via `light` + the --lvc tier var.
function LvCoachBlocks({ d, light, owner, view, onReviews }) {
  const showCoaching = view !== "reviews";
  const showReviews = view !== "coaching";
  const c = tierOf(d).color;
  const ink = light ? "#1a1612" : LV_INK;
  // Ledger station head (zero-box): heat tick + mono eyebrow (+ meta) over a 2px
  // ink→heat rule. Self-contained here (livingShared loads before livingDesktop).
  const stHead = (label, meta) => (
    <div style={{ marginBottom: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span aria-hidden="true" style={{ flex: "none", width: 8, height: 2, background: c }} />
        <span style={{ fontFamily: lvMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: hexA(ink, 0.55) }}>{label}</span>
        {meta ? <span style={{ marginLeft: "auto" }}>{meta}</span> : null}
      </div>
      <div aria-hidden="true" style={{ height: 2, marginTop: 9, background: `linear-gradient(90deg, ${hexA(ink, 0.5)}, ${hexA(c, 0.7)} 55%, transparent)` }} />
    </div>
  );
  // Storefront: the profile is the listing. Resolve the coach's provider (for the
  // subscription checkout) + live reviews — the same data the marketplace used.
  const first = d.first || String(d.name || "").split(/\s+/)[0] || "Coach";
  const monthlyPrice = ((d.offerings || []).find((o) => /coaching/i.test(o.kind) || /month/i.test(o.unit || "")) || {}).price || (/nutritionist/i.test(String(d.role || "")) ? "$240" : "$200");
  const [provider, setProvider] = React.useState(null);
  const [liveReviews, setLiveReviews] = React.useState(null);
  // Coach-authored monthly offer (spec #1632 §5) — the same provider-row
  // monthly_offer the mobile Listing's WHAT'S INCLUDED sheet reads. The
  // provider tables are public-read; pre-migration the select just errors
  // quietly and the coupon renders without it (honest absence, no fallback).
  const [offer, setOffer] = React.useState(null);
  const [studio, setStudio] = React.useState([]);
  // Prefer the URL &role= (the clicked listing's role) over the profile's guessed
  // d.role — a dual-role coach holds both provider rows, and the offer/STUDIO must
  // read the row the visitor actually clicked, never the other listing's.
  const listingRole = (() => {
    let p = null;
    try { p = new URLSearchParams(window.location.search).get("role"); } catch (e) {}
    if (p === "trainer" || p === "nutritionist") return p;
    return /nutritionist/i.test(String(d.role || "")) ? "nutritionist" : "trainer";
  })();
  const providerTable = listingRole === "nutritionist" ? "nutritionists" : "trainers";
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!d.uid || !cl || !cl.from) return;
    let on = true;
    // Clear any prior coach's data first, so a same-mount profile swap can't
    // leave the previous coach's offer/studio showing until the new fetch lands.
    setOffer(null); setStudio([]);
    cl.from(providerTable).select("monthly_offer, listing_media").eq("owner_id", d.uid).maybeSingle()
      .then((r) => {
        if (!on || !r || r.error || !r.data) return;
        if (r.data.monthly_offer) setOffer(r.data.monthly_offer);
        const lib = window.ShapeListingLib;
        if (lib && lib.bsNormalizeListingMedia) {
          const m = lib.bsNormalizeListingMedia(r.data.listing_media, d.uid);
          if (m && Array.isArray(m.gallery) && m.gallery.length) setStudio(m.gallery);
        }
      })
      .catch(() => {});
    return () => { on = false; };
  }, [d.uid, providerTable]);
  const offerLines = offer && Array.isArray(offer.includes) ? offer.includes.filter((x) => typeof x === "string" && x.trim()).slice(0, 8) : [];
  const hasOffer = Boolean(offer && ((offer.blurb && String(offer.blurb).trim()) || offerLines.length));
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (d.uid && cl && cl.rpc) cl.rpc("get_coach_sale_plans_by_user", { p_user_id: d.uid }).then((r) => { const rows = (r && !r.error && r.data) || []; if (rows[0]) setProvider({ id: rows[0].provider_id, role: rows[0].provider_role }); }).catch(() => {});
    const slug = String(d.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    let on = true;
    fetch(`/api/coaches/reviews?coach=${encodeURIComponent(slug)}`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j && Array.isArray(j.reviews) && j.reviews.length) setLiveReviews(j.reviews); }).catch(() => {});
    return () => { on = false; };
  }, [d.uid, d.name]);
  const openChat = () => { try { if (window.__openChat) { window.__openChat({ who: d.name }); return; } const b = document.getElementById("shape-global-chat-button"); if (b) b.click(); } catch (e) {} };
  const subscribe = async () => {
    if (provider && provider.id) {
      try {
        const res = await fetch("/api/stripe/checkout-session", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: { type: "Subscription", name: "Monthly coaching", price: monthlyPrice, unit: "/ month" }, coach: { provider_id: provider.id, provider_role: provider.role, name: d.name }, ref: (window.ShapeCoachRef && window.ShapeCoachRef.token()) || undefined, successPath: "/purchase/success", cancelPath: "/newdesign/MemberProfile.html" }) });
        const j = await res.json().catch(() => ({}));
        if (j.url) { window.location.href = j.url; return; }
      } catch (e) {}
    }
    openChat();
  };
  const reviewsAvg = (liveReviews && liveReviews.length) ? Math.round((liveReviews.reduce((s, r) => s + (r.rating || 0), 0) / liveReviews.length) * 10) / 10 : null;
  const reviewItems = (liveReviews && liveReviews.length)
    ? liveReviews.map((r) => ({ name: r.author || "Member", initials: (r.author || "M").slice(0, 2).toUpperCase(), hue: 160, stars10: Math.round(r.rating || 0), body: r.text || "", time: "", authorId: r.authorId || null }))
    : d.reviews.map((r) => ({ ...r, stars10: 10, authorId: null }));
  // P4 · business card + P5 · wins wall (profile wave). d.custom = the coach's
  // profile_custom doc. The wall resolves pinned ids against the OWNER's OWN
  // reviews by id AND ownerId, so a cross-coach / hand-written id never resolves.
  const plib = (typeof window !== "undefined" && window.ShapeProfileLib) || null;
  const bizCard = plib && plib.bsProfileBizCard ? plib.bsProfileBizCard(d.custom && d.custom.bizCard) : null;
  // P5 wins wall — resolve pinned ids DIRECTLY by id (not from the 200-row slug
  // list), so a pinned review never vanishes once a coach passes 200 reviews; the
  // results are still filtered to ownerId === the profile owner.
  const pinnedKey = (plib && plib.bsProfilePinnedReviews ? plib.bsProfilePinnedReviews(d.custom && d.custom.pinnedReviews) : []).join(",");
  const [pinnedResolved, setPinnedResolved] = React.useState([]);
  React.useEffect(() => {
    setPinnedResolved([]); // clear the previous profile's / pins' data on any change
    if (!pinnedKey || !d.uid) return;
    let on = true;
    fetch(`/api/coaches/reviews?ids=${encodeURIComponent(pinnedKey)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      // Only a MEMBER's review counts (authorId !== ownerId) — a coach can't insert a
      // self-authored row (insert RLS forces user_id = their uid) and pin it.
      .then((j) => { if (on && j && Array.isArray(j.reviews)) setPinnedResolved(j.reviews.filter((r) => r && r.ownerId === d.uid && r.authorId !== r.ownerId)); })
      .catch(() => {});
    return () => { on = false; };
  }, [pinnedKey, d.uid]);
  const winsWall = pinnedKey ? pinnedKey.split(",").map((id) => pinnedResolved.find((r) => r && r.id === id && r.ownerId === d.uid && r.authorId !== r.ownerId)).filter(Boolean) : [];
  return (
    <div>
      {showCoaching && <React.Fragment>
      {/* Work with {first} — storefront CTA (zero-box; the Subscribe/Book buttons
          stay solid — the ledger bends for money) */}
      {!owner && (
        <div style={{ marginTop: 4 }}>
          {stHead(`Work with ${first}`)}
          {/* The standing-offer coupon — the mobile Listing's commerce centerpiece,
              in the site's grammar (dashed clip frame; the buttons stay solid). */}
          <div style={{ border: `1px dashed ${hexA(ink, 0.38)}`, padding: "15px 16px 16px", maxWidth: 520 }}>
          <div style={{ fontFamily: lvMono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: hexA(ink, 0.5) }}>✂ Standing offer</div>
          <div style={{ fontFamily: lvSerif, fontSize: 24, letterSpacing: "-0.01em", marginTop: 8 }}>Monthly coaching · <span style={{ color: c }}>{monthlyPrice}/mo</span></div>
          {hasOffer && (
            <div style={{ marginTop: 11 }}>
              {offer.blurb && String(offer.blurb).trim() ? <p style={{ fontFamily: lvSerif, fontSize: 13.5, fontStyle: "italic", lineHeight: 1.5, color: hexA(ink, 0.82), margin: 0, textWrap: "pretty" }}>{String(offer.blurb)}</p> : null}
              {offerLines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 7 }}>
                  <span aria-hidden="true" style={{ flex: "none", fontFamily: lvMono, fontSize: 11, color: LV_TEAL }}>✓</span>
                  <span style={{ fontFamily: lvSans, fontSize: 12.5, color: hexA(ink, 0.85) }}>{String(line)}</span>
                </div>
              ))}
              {offerLines.length > 0 && <div style={{ fontFamily: lvMono, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(ink, 0.4), marginTop: 9 }}>What's included · in {first}'s words</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16, maxWidth: 420 }}>
            <button onClick={subscribe} style={{ flex: 1, padding: "13px", borderRadius: 8, border: 0, background: c, color: "#0c0a08", cursor: "pointer", fontFamily: lvMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Subscribe</button>
            <button onClick={openChat} style={{ flex: 1, padding: "13px", borderRadius: 8, border: `1px solid ${hexA(ink, 0.4)}`, background: "transparent", color: ink, cursor: "pointer", fontFamily: lvMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Book intro · Free</button>
          </div>
          </div>
        </div>
      )}
      {/* THE STUDIO — the coach's studio gallery (listing_media), a captioned
          strip in the ledger grammar. Photos are normalized (own-bucket, image
          -only) by ShapeListingLib; absent → nothing. */}
      {studio.length > 0 && (
        <div style={{ marginTop: 30 }}>
          {stHead("The studio")}
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {studio.map((g, i) => (
              <figure key={i} style={{ flex: "none", width: 168, margin: 0 }}>
                <div style={{ width: 168, height: 112, borderRadius: 8, border: `1px solid ${hexA(ink, 0.14)}`, backgroundImage: `url("${g.url}")`, backgroundSize: "cover", backgroundPosition: "center" }} aria-hidden="true" />
                {g.caption ? <figcaption style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.04em", color: hexA(ink, 0.5), marginTop: 6, lineHeight: 1.3 }}>{String(g.caption)}</figcaption> : null}
              </figure>
            ))}
          </div>
        </div>
      )}
      {/* P4 · The Business card — a grounded contact station (name over dot-leader rows). */}
      {bizCard && (
        <div style={{ marginTop: 30 }}>
          {stHead("The practice")}
          <div style={{ borderLeft: `3px solid ${c}`, paddingLeft: 15, maxWidth: 460 }}>
            <div style={{ fontFamily: lvSerif, fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1.1, color: ink }}>{bizCard.name}</div>
            {[["Where", bizCard.where], ["Hours", bizCard.hours], ["Find", bizCard.handle]].filter(([, v]) => v).map(([lbl, v]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 11 }}>
                <span style={{ flex: "none", fontFamily: lvMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(ink, 0.5) }}>{lbl}</span>
                <span aria-hidden="true" style={{ flex: 1, borderBottom: `1px dotted ${hexA(ink, 0.28)}`, transform: "translateY(-3px)" }} />
                <span style={{ flex: "none", fontFamily: lvSans, fontSize: 14, color: hexA(ink, 0.85) }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* P5 · The Wins wall — up to 3 pinned REAL reviews (resolved by id + owner). */}
      {winsWall.length > 0 && (
        <div style={{ marginTop: 30 }}>
          {stHead("Wins wall")}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
            {winsWall.map((r) => (
              <div key={r.id} style={{ borderLeft: `3px solid ${c}`, paddingLeft: 15 }}>
                <div style={{ fontFamily: lvSerif, fontSize: 18, fontStyle: "italic", letterSpacing: "-0.01em", lineHeight: 1.4, color: hexA(ink, 0.9) }}>“{r.text}”</div>
                <div style={{ marginTop: 8, fontFamily: lvMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: c }}>★ {Math.round(r.rating || 0)}/10 · Real review · Pinned</div>
                <div style={{ marginTop: 3, fontFamily: lvSans, fontSize: 12, color: hexA(ink, 0.5) }}>— {r.author || "Member"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Certifications — zero-box ledger rows */}
      <div style={{ marginTop: 30 }}>
        {stHead("Certifications")}
        {(d.certs || []).length ? (d.certs || []).map((cert, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? `1px solid ${hexA(ink, 0.08)}` : "none" }}>
            <span style={{ fontFamily: lvMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", color: ink, minWidth: 92 }}>{cert.abbr}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: lvSans, fontSize: 13, color: hexA(ink, 0.85) }}>{cert.body}</div>
              <div style={{ fontFamily: lvMono, fontSize: 9.5, color: hexA(ink, 0.45), marginTop: 2 }}>{cert.year}</div>
            </div>
            {cert.verified
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: lvMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: LV_TEAL }}><SpVerifiedDot /> Verified</span>
              : <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: hexA(ink, 0.4) }}>Pending</span>}
          </div>
        )) : (
          <div style={{ display: "flex", alignItems: "center", margin: "6px 0" }} aria-label="Certifications · none listed"><span aria-hidden="true" style={{ flex: 1, borderTop: `1px dashed ${hexA(ink, 0.2)}` }} /><span style={{ fontFamily: lvMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: hexA(ink, 0.42), padding: "0 12px" }}>None listed</span><span aria-hidden="true" style={{ flex: 1, borderTop: `1px dashed ${hexA(ink, 0.2)}` }} /></div>
        )}
      </div>

      {/* Services & prices — categorized via filing-card tabs. Live review avg/count
          passed so the rate-card rating matches the Reviews tab (honest data). */}
      <LvServices d={d} light={light} ink={ink} c={c} stHead={stHead} owner={owner} onReviews={onReviews}
        ratingAvg={reviewsAvg != null ? reviewsAvg : d.rating}
        reviewCount={liveReviews && liveReviews.length ? liveReviews.length : d.reviewCount} />
      </React.Fragment>}

      {/* Reviews — its own tab; zero-box entries on hairlines (press clippings) */}
      {showReviews && <div style={{ marginTop: showCoaching ? 30 : 4 }}>
        {stHead("Reviews", (
          <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: lvSerif, fontSize: 20, letterSpacing: "-0.02em", color: ink }}>{reviewsAvg != null ? reviewsAvg : d.rating}</span>
            <span style={{ fontFamily: lvMono, fontSize: 10, color: hexA(ink, 0.5) }}>/10 · ★ {liveReviews && liveReviews.length ? liveReviews.length : d.reviewCount}</span>
          </span>
        ))}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {reviewItems.map((r, i) => (
            <div key={i} style={{ padding: "14px 0", borderTop: i ? `1px solid ${hexA(ink, 0.08)}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <a href={r.authorId ? ("MemberProfile.html?u=" + encodeURIComponent(r.authorId)) : ("MemberProfile.html?name=" + encodeURIComponent(r.name) + "&role=client")} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 999, flex: "none", background: `linear-gradient(150deg, hsl(${r.hue} 40% 34%), hsl(${r.hue} 36% 20%))`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: lvSerif, fontSize: 12, color: "#f2ede4" }}>{r.initials}</div>
                  <span style={{ fontFamily: lvMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: hexA(ink, 0.8), textDecoration: "underline", textUnderlineOffset: 3 }}>{r.name}</span>
                </a>
                <span style={{ marginLeft: "auto", fontFamily: lvMono, fontSize: 11, fontWeight: 700, color: ink }}>{r.stars10}/10</span>
              </div>
              <p style={{ fontFamily: lvSerif, fontSize: 14, fontStyle: "italic", lineHeight: 1.45, color: hexA(ink, 0.82), margin: "10px 0 0 40px", paddingLeft: 11, borderLeft: `1px solid ${hexA(ink, 0.18)}`, textWrap: "pretty" }}>“{r.body}”</p>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}
function SpVerifiedDot() {
  return <span style={{ display: "inline-flex", width: 13, height: 13, borderRadius: 999, background: LV_TEAL, alignItems: "center", justifyContent: "center" }}>
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5 11-12" stroke="#06110e" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </span>;
}
// Post types → short labels (shown per direction's own styling).
const LV_FEED = {
  workout: "Workout", run: "Run", pr: "PR", meal: "Meal", note: "Note",
  photo: "Photo", tip: "Tip", win: "Client win", recipe: "Recipe",
};
// Owner sees everything; a public viewer sees only public; circle viewer
// (not modeled separately here) would also see circle. variant drives it.
function lvFeedVisible(vis, owner) { return owner ? true : vis === "public"; }

// Owner-cycle hook: per-item visibility state with a cycle fn.
function useLvFeed(items) {
  const [vis, setVis] = React.useState(() => items.map(i => i.vis));
  const cycle = (i) => setVis(v => { const n = [...v]; n[i] = LV_PRIV_ORDER[(LV_PRIV_ORDER.indexOf(n[i]) + 1) % 3]; return n; });
  return [vis, cycle];
}
// Small per-item visibility pill (owner) / lock hint (viewer hidden count).
function LvVisPill({ vis, onCycle, light }) {
  const ink = light ? "#1a1612" : LV_INK;
  const priv = vis === "private";
  return (
    <button onClick={onCycle} title={`${LV_PRIV[vis].label} — ${LV_PRIV[vis].hint} · tap to change`} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, cursor: "pointer",
      background: priv ? hexA(ink, 0.07) : "var(--lvc-soft)", color: priv ? hexA(ink, 0.6) : "var(--lvc)",
      border: `1px solid ${priv ? hexA(ink, 0.14) : "transparent"}`,
      fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase" }}>
      {LV_PRIV[vis].icon} {LV_PRIV[vis].label}
    </button>
  );
}

// Locked variant — a beautiful minimal identity card. Some members
// share only name + tier; this surfaces exactly that, intentionally.
function LvLockedVeil({ d, privacy }) {
  const c = tierOf(d).color;
  const coach = d.role !== "client";
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 34px",
      background: `radial-gradient(120% 80% at 50% 28%, ${hexA(c, 0.2)}, ${hexA(LV_BG, 0.9)} 62%), ${hexA(LV_BG, 0.86)}`, backdropFilter: "blur(26px) saturate(1.1)" }}>
      {/* sealed crest in a tier ring */}
      <div style={{ width: 108, height: 108, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 50% 36%, ${hexA(c, 0.22)}, transparent)`, border: `1px solid ${hexA(c, 0.4)}`, position: "relative" }}>
        <LvCrest d={d} size={66} />
        <div style={{ position: "absolute", right: 4, bottom: 4, width: 30, height: 30, borderRadius: 999, background: LV_BG, border: `1px solid ${hexA(c, 0.4)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="14" viewBox="0 0 24 26" fill="none"><rect x="4" y="11" width="16" height="12" rx="2.5" stroke={c} strokeWidth="2"/><path d="M8 11V7a4 4 0 018 0v4" stroke={c} strokeWidth="2"/></svg>
        </div>
      </div>

      {/* name + tier — the only things shared */}
      <h2 style={{ fontFamily: lvSerif, fontSize: 34, fontWeight: 400, letterSpacing: "-0.025em", margin: "22px 0 0", lineHeight: 1 }}>{d.name}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c, border: `1px solid ${hexA(c, 0.45)}`, borderRadius: 999, padding: "5px 11px" }}>● {tierOf(d).name}</span>
        <span style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(LV_INK, 0.55) }}>{d.roleLabel}</span>
      </div>

      <div style={{ fontFamily: lvMono, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: hexA(LV_INK, 0.45), marginTop: 22 }}>{LV_PRIV[privacy].icon} {privacy === "private" ? "Identity sealed" : "Circle only"}</div>
      <p style={{ fontFamily: lvSans, fontSize: 13, lineHeight: 1.55, color: hexA(LV_INK, 0.55), maxWidth: 270, margin: "10px auto 0" }}>
        {privacy === "private"
          ? `${d.first} shares only their name and tier publicly. The full living profile stays private.`
          : `Train with ${d.first} on Shape to unlock the full artifact — rings, arc, and records.`}
      </p>

      <div style={{ display: "flex", gap: 9, marginTop: 24 }}>
        <button style={{ height: 46, padding: "0 22px", borderRadius: 14, border: 0, background: LV_TEAL, color: "#06110e", fontFamily: lvSans, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4z" stroke="#06110e" strokeWidth="2.4" strokeLinejoin="round"/></svg> Message
        </button>
        <button style={{ height: 46, padding: "0 22px", borderRadius: 14, border: `1px solid ${hexA(LV_INK, 0.22)}`, background: "transparent", color: LV_INK, fontFamily: lvSans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{coach ? "View coaching" : "Request"}</button>
      </div>
    </div>
  );
}

// Small shared label
function LvKicker({ children, c, style }) {
  return <div style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: c || hexA(LV_INK, 0.5), ...style }}>{children}</div>;
}

// Scroll-driven sticky-bar visibility hook
function useLvScroll(threshold = 150) {
  const ref = React.useRef(null);
  const [show, setShow] = React.useState(false);
  const onScroll = () => { const t = ref.current ? ref.current.scrollTop : 0; setShow(t > threshold); };
  return [ref, show, onScroll];
}

// Reduced-motion flag
function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const u = () => setR(m.matches); u(); m.addEventListener?.("change", u);
    return () => m.removeEventListener?.("change", u);
  }, []);
  return r;
}
