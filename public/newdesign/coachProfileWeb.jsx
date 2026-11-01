// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SHAPE · the website's coach profile, in the app profile's design
// ───────────────────────────────────────────────────────────────────────────────────────────────
// What a visitor sees at a trainer's or nutritionist's public page (MemberProfile.html?u=…, the
// marketplace's links, a coach's referral link), and the coach's own Profile page on their web
// dashboard. It is the app's coach profile (mobile-app/src/broadsheet/BSTrainerProfile.jsx, #2491 and
// its follow-ups) laid out for a web page: the same sections in the same order, the same words, the
// same type and the coach's own colours, on a wider page.
//
//   The wall     the coach's wall photo with their round avatar over its edge, their name, what they
//                do and where, their bio, the verified line, Message · Work with · Follow.
//   The tabs     {Name}'s day · About me · The studio · Replays · Activity (a nutritionist: … {Name}'s
//                kitchen · Plate notes · Activity). A visitor sees a tab only when there is something in
//                it; the coach sees them all. Activity is last and is the coach's own posts.
//   What clients say  the newest reviews (pinned ones first), All reviews, and the review form.
//   Work with    the storefront. On a phone it is the sheet the app opens; on a desktop it stands in a
//                column of its own beside the page, so Subscribe is never more than a glance away.
//
// The website stays a web page: the site's own header and footer, no phone frame, a two-column page
// from 1000px and one column below it. Dialogs stand in for the app's sheets.
//
// What it shares rather than copies: the storefront's state and actions (useLvCoachCommerce,
// useLvWinsWall, lvBuyPlan and the code box, livingShared.jsx), so Subscribe, the code before the
// redirect, the waiting list and the review form run through the one path the old page used; and the
// app's pure helpers through window.ShapeCoachKit (coachProfileKit.mjs): the studio kit, the coach's
// programs and workout videos, plate notes, the words for a coach, the sample pages, the profile
// doc's cleaners.
//
// A coach with no Shape account (a seeded marketplace listing opened by name, or a coach dashboard
// signed out) is a sample, as in the app: a sample studio or kitchen, replays, reviews and times, under
// a note that says so. Sample times are shown, never taken, and a sample sells nothing.
//
// Globals read at call time (Babel scripts): React, ReactDOM, useLvCoachCommerce, useLvWinsWall,
// lvBuyPlan, LvCodeBox, lvAccountHref, lvScreeningHref, lvFeedVisible, lvComposePost, lvTierFor,
// Header / Footer (pageShell.jsx), ProfileCustomizer (livingDesktop.jsx), BookingSlots
// (bookingSlots.js), ShapeListingLib (listingMedia.mjs).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const CPW_DISPLAY = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
const CPW_BODY = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const CPW_MONO = "'JetBrains Mono', ui-monospace, monospace";
const CPW_FOCUS = { top: "center 22%", center: "center 50%", bottom: "center 80%" };
const CPW_KIND = { private: "Private studio", garage: "Garage gym", gym: "Full gym", pilates: "Pilates studio", boxing: "Boxing gym", outdoor: "Outdoors", kitchen: "Kitchen", blank: "Their space" };
const CPW_LINK_NAMES = { instagram: "Instagram", x: "X", tiktok: "TikTok", youtube: "YouTube", substack: "Substack", website: "Website" };
// The anon grant's columns of a listing (the app's PUBLIC_PROVIDER_COLUMNS, shapeBackend.js): a `*`
// read fails the whole row for a visitor.
const CPW_LISTING_COLS = "id, name, specialty, category, price, credential, credential_full, specialty_type, owner_id, at_capacity, capacity_resume_at, verified, monthly_offer, listing_media, listing_ready";

// ── The kit ──────────────────────────────────────────────────────────────────────────────────
// Loaded once, as the page's scripts run, so it arrives while the profile is still being read.
function cpwLoadKit() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.ShapeCoachKit) return Promise.resolve(window.ShapeCoachKit);
  if (!window.__cpwKitLoad) {
    window.__cpwKitLoad = import("/newdesign/coachProfileKit.mjs")
      .then((K) => { window.ShapeCoachKit = K; return K; })
      .catch((e) => { window.__cpwKitLoad = null; throw e; });
  }
  return window.__cpwKitLoad;
}
try { cpwLoadKit().catch(() => {}); } catch (e) { /* a page without dynamic import keeps the old profile */ }
// The kit, or null while it loads, or false when it could not load (the caller then shows the old page).
function useCpwKit() {
  const [kit, setKit] = React.useState(() => (typeof window !== "undefined" && window.ShapeCoachKit) || null);
  React.useEffect(() => {
    if (kit) return undefined;
    let on = true;
    cpwLoadKit().then((K) => { if (on) setKit(K); }).catch(() => { if (on) setKit(false); });
    return () => { on = false; };
  }, []);
  return kit;
}
function useCpwWide(min = 1000) {
  const q = `(min-width: ${min}px)`;
  const read = () => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  const [wide, setWide] = React.useState(read);
  React.useEffect(() => {
    let m = null;
    try { m = window.matchMedia ? window.matchMedia(q) : null; } catch (e) { m = null; }
    if (!m) return undefined;
    const on = () => setWide(!!m.matches);
    on();
    if (m.addEventListener) m.addEventListener("change", on);
    return () => { if (m.removeEventListener) m.removeEventListener("change", on); };
  }, [q]);
  return wide;
}
// The site header is fixed; a sticky row sits under it.
function useCpwHeadH(chrome) {
  const [h, setH] = React.useState(chrome ? 72 : 0);
  React.useEffect(() => {
    if (!chrome) { setH(0); return undefined; }
    const read = () => { const el = document.querySelector(".shape-header"); setH(el ? el.getBoundingClientRect().height : 0); };
    read();
    window.addEventListener("resize", read);
    const t = setTimeout(read, 400);
    return () => { window.removeEventListener("resize", read); clearTimeout(t); };
  }, [chrome]);
  return h;
}
// The page's colours are the palette's hexes; a paper token (`var(--x, #hex)`) reads its fallback,
// as livingShared's hexA does (tests/newdesign-paper-tokens.test.mjs).
const cpwA = (hex, a) => {
  const m = /#([0-9a-f]{6})\b/i.exec(String(hex || ""));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const cpwIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cpwInitials = (name) => String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const cpwNum = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const cpwVideoFile = (u) => { try { return /\.(mp4|m4v|mov|webm)$/i.test(new URL(u).pathname); } catch (e) { return false; } };

// ── Small parts ──────────────────────────────────────────────────────────────────────────────
function CpwHint({ ink, children }) {
  return <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.5, color: ink(0.7) }}>{children}</p>;
}
const cpwLink = (ACC) => ({ marginTop: 6, minHeight: 40, padding: 0, border: 0, background: "transparent", color: ACC, fontFamily: CPW_DISPLAY, fontSize: 14.5, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" });
const cpwEyebrow = (ink, color) => ({ display: "block", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: color || ink(0.64) });
function CpwX({ onClose, color }) {
  return <button type="button" onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, margin: "-6px -6px -6px 0", border: 0, background: "transparent", color, fontSize: 26, lineHeight: 1, cursor: "pointer" }}>×</button>;
}
// A dialog for what the app opens as a sheet: a bottom sheet on a phone, a centred panel on a wider
// screen. Escape and the scrim close it, the page behind does not scroll, and focus returns to the
// control that opened it. `dark` is the app's dark sheet (programs, replays, plate notes).
function CpwSheet({ pal, label, onClose, dark = false, width = 560, children, data = {} }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const prev = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    try { if (ref.current) ref.current.focus(); } catch (e) {}
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      try { if (prev && prev.isConnected && prev.focus) prev.focus(); } catch (e) {}
    };
  }, []);
  const bg = dark ? "#0c0d0f" : pal.PAPER, fg = dark ? "#e8ebef" : pal.INK;
  // Above the site's floating chat button (globalChatButton.js, 2147483000), which would sit on the sheet.
  const el = (
    <div className="cpw-scrim" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="cpw-sheet" onClick={(e) => e.stopPropagation()} {...data}
        style={{ width: `min(${width}px, calc(100vw - 48px))`, maxHeight: "86vh", overflowY: "auto", overflowX: "hidden", background: bg, color: fg, fontFamily: CPW_BODY, WebkitFontSmoothing: "antialiased", padding: "14px 22px 26px", boxShadow: "0 24px 60px rgba(0,0,0,0.45)", outline: "none" }}>
        <div aria-hidden="true" className="cpw-grab" style={{ width: 40, height: 4, borderRadius: 99, background: dark ? "rgba(232,235,239,0.25)" : `rgba(${pal.inkRGB},0.2)`, margin: "0 auto 8px" }} />
        {children}
      </div>
    </div>
  );
  return (typeof ReactDOM !== "undefined" && ReactDOM.createPortal) ? ReactDOM.createPortal(el, document.body) : el;
}
function CpwSheetHead({ title, ACC, color, onClose, eyebrow = null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      {eyebrow ? <span style={{ fontFamily: CPW_MONO, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: ACC }}>{eyebrow}</span>
        : <h2 className="cpw-s22" style={{ margin: 0, fontFamily: CPW_DISPLAY, fontWeight: 500, fontSize: 22 }}>{title}<span style={{ color: ACC }}>.</span></h2>}
      <CpwX onClose={onClose} color={color} />
    </div>
  );
}
// A step track: dots to tap along a line, the steps done in the accent (the app's replay and plate
// note sheets).
function CpwSteps({ n, at, setAt, ACC, label }) {
  return (
    <div style={{ margin: "16px 22px 0" }}>
      <div style={{ position: "relative", height: 22 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 10, height: 2, background: "rgba(232,235,239,0.2)" }} />
        <span aria-hidden="true" style={{ position: "absolute", left: 0, width: n > 1 ? `${(at / (n - 1)) * 100}%` : "100%", top: 10, height: 2, background: ACC }} />
        {Array.from({ length: n }, (_, k) => (
          <button key={k} type="button" onClick={() => setAt(k)} aria-label={label(k)}
            style={{ position: "absolute", left: n > 1 ? `${(k / (n - 1)) * 100}%` : "50%", top: -11, width: 44, height: 44, marginLeft: -22, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}>
            <span style={{ position: "absolute", left: "50%", top: "50%", width: k === at ? 14 : 8, height: k === at ? 14 : 8, transform: "translate(-50%, -50%)", borderRadius: 99, background: k <= at ? ACC : "rgba(232,235,239,0.35)" }} />
          </button>
        ))}
      </div>
    </div>
  );
}
function CpwPrevNext({ at, n, setAt }) {
  const b = (on) => ({ flex: 1, minHeight: 46, border: "1px solid rgba(232,235,239,0.25)", background: "transparent", color: "#e8ebef", fontFamily: CPW_BODY, fontWeight: 600, cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.4 });
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
      <button type="button" onClick={() => setAt(Math.max(0, at - 1))} disabled={at === 0} style={b(at > 0)}>← Previous</button>
      <button type="button" onClick={() => setAt(Math.min(n - 1, at + 1))} disabled={at === n - 1} style={b(at < n - 1)}>Next →</button>
    </div>
  );
}
function CpwNote({ avatar, first, ACC, children }) {
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
      {avatar ? <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: 99, objectFit: "cover" }} /> : null}
      <div style={{ flex: 1, padding: "10px 12px", background: "#181a1e", borderRadius: "4px 14px 14px 14px", fontSize: 14.5, lineHeight: 1.45 }}>
        <span style={{ display: "block", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: ACC }}>{first}'s note</span>{children}
      </div>
    </div>
  );
}
function CpwVideo({ url, title }) {
  if (!url) return null;
  if (cpwVideoFile(url)) return <video src={url} controls playsInline preload="metadata" aria-label={title || "Video"} style={{ display: "block", width: "100%", maxHeight: 420, background: "#000" }} />;
  return <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, color: "#e8ebef", fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600 }}>▶ Watch the video ↗</a>;
}
// A video's still: the file's first frame where the link is a file, else a dark panel.
function CpwStill({ url, ACC }) {
  return (
    <span style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, #15171b, ${cpwA(ACC, 0.35)})` }}>
      {cpwVideoFile(url) ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : null}
    </span>
  );
}
const cpwPlay = (ACC) => <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 52, height: 52, margin: "-26px 0 0 -26px", borderRadius: 99, background: "rgba(0,0,0,0.55)", border: `2px solid ${ACC}`, display: "grid", placeItems: "center", color: "#fff", fontSize: 18, paddingLeft: 3, boxSizing: "border-box" }}>▶</span>;

// ── Data ─────────────────────────────────────────────────────────────────────────────────────
// The coach's listing, found by their account, and only while it is on the marketplace (the app's
// ShapeCoachListing.publicByOwner): an unfinished or suspended listing offers no times, photos or
// checkout here. 'loading' | 'ready' | 'none' | 'error'.
function useCpwListing(uid, role, epoch) {
  const [st, setSt] = React.useState({ state: uid ? "loading" : "none", row: null });
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!uid || !cl || !cl.from) { setSt({ state: "none", row: null }); return undefined; }
    let on = true;
    setSt({ state: "loading", row: null });
    Promise.resolve()
      .then(() => cl.from(role === "nutritionist" ? "nutritionists" : "trainers").select(CPW_LISTING_COLS).eq("owner_id", uid).eq("listing_ready", true).order("id", { ascending: true }).limit(1))
      .then((r) => {
        if (!on) return;
        if (!r || r.error) { setSt({ state: "error", row: null }); return; }
        const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
        if (!row) { setSt({ state: "none", row: null }); return; }
        const lib = window.ShapeListingLib;
        const media = lib && lib.bsNormalizeListingMedia ? lib.bsNormalizeListingMedia(row.listing_media || null, uid) : { cover: null, gallery: [] };
        setSt({ state: "ready", row: { ...row, listing_media: media || { cover: null, gallery: [] } } });
      })
      .catch(() => { if (on) setSt({ state: "error", row: null }); });
    return () => { on = false; };
  }, [uid, role, epoch]);
  return st;
}
// The week of open and busy times, from the same public read the booking page lays its times out
// from (/api/availability → BookingSlots.buildSlots, the coach's own intro length and rules). A
// sample's are its own week, shown and never taken.
function cpwWeekOf(d, sample) {
  if (!d || !Array.isArray(d.slots)) return null;
  const B = window.BookingSlots;
  const len = Number(d.rules && d.rules.consultMin);
  const introMin = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
  const zoneOk = !d.slots.length || !!(B && B.isZone && B.isZone(d.timezone));
  const open = zoneOk && B && B.buildSlots ? B.buildSlots({ slots: d.slots, booked: d.booked || [], zone: d.timezone, busy: d.busy || [], rules: d.rules || null, now: new Date(), days: 8, sessionMin: introMin }) : [];
  return { kind: "ready", open, busy: Array.isArray(d.busy) ? d.busy : [], introMin, hasHours: d.slots.length > 0, zoneOk, sample: !!sample, atCapacity: d.atCapacity === true, introsAtCap: !!(d.rules && d.rules.introsAtCapacity === true) };
}
function useCpwWeek({ providerId, role, listingState, sampleWeek, epoch }) {
  const [avail, setAvail] = React.useState({ kind: "loading" });
  React.useEffect(() => {
    if (sampleWeek) { setAvail(cpwWeekOf(sampleWeek, true) || { kind: "none" }); return undefined; }
    if (!providerId) { setAvail({ kind: listingState === "loading" ? "loading" : listingState === "error" ? "error" : "none" }); return undefined; }
    let on = true;
    setAvail({ kind: "loading" });
    fetch("/api/availability?role=" + encodeURIComponent(role) + "&id=" + encodeURIComponent(providerId), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setAvail(cpwWeekOf(d, false) || { kind: "error" }); })
      .catch(() => { if (on) setAvail({ kind: "error" }); });
    return () => { on = false; };
  }, [providerId, role, listingState, sampleWeek, epoch]);
  return avail;
}
// The coach's published plans, as anyone reads them (the public preview of each program).
function useCpwPlans(uid) {
  const [plans, setPlans] = React.useState(null);
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!uid || !cl || !cl.rpc) { setPlans([]); return undefined; }
    let on = true;
    Promise.resolve().then(() => cl.rpc("get_coach_sale_plans_by_user", { p_user_id: uid }))
      .then((r) => { if (on) setPlans(r && !r.error && Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (on) setPlans([]); });
    return () => { on = false; };
  }, [uid]);
  return plans;
}
// Their posts, newest first: a visitor's read keeps to the tiers a profile shows before the limit,
// so feed-only posts cannot crowd out the profile's (the living profile's rule).
function useCpwPosts(uid, isSelf) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!uid || !cl || !cl.from) { setRows([]); return undefined; }
    let on = true;
    Promise.resolve().then(() => {
      let q = cl.from("community_posts").select("id,title,note,activity_type,metrics,privacy,photo_url,source_provider,created_at").eq("author_id", uid);
      if (!isSelf) q = q.in("privacy", ["public", "profile", "followers", "friends"]);
      return q.order("created_at", { ascending: false }).limit(40);
    })
      .then((r) => { if (on) setRows(r && !r.error && Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (on) setRows([]); });
    return () => { on = false; };
  }, [uid, isSelf]);
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The page
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Props:
//   mode         'live' (a coach with a Shape account) | 'sample' (none: a listing opened by name, or a
//                coach dashboard signed out, `demo`)
//   role         'trainer' | 'nutritionist'
//   uid, row     the account and its get_public_profile row (live)
//   isSelf       the coach's own page
//   verified, certs   the living profile's reads: Shape's check of their credentials, their real certs
//   name, avatar, sampleKey   a sample's name, photo and seed
//   follow, onFollow, onMessage   the follow graph and Message, as the living profile hands them
//   chrome       the site's header and footer (false inside the dashboard frame); belowContent: the
//                dashboard's own extras under the page
//   fallback     what to show if the kit cannot load (the older living profile)
function WebCoachProfile(props) {
  const kit = useCpwKit();
  if (kit === false) return props.fallback || null;
  if (!kit) {
    return (
      <div style={{ minHeight: props.chrome === false ? "60vh" : "100vh", display: "grid", placeItems: "center", background: "#0f0e0c", color: "rgba(245,240,230,0.6)", fontFamily: CPW_BODY, fontSize: 15 }}>
        Loading profile…
      </div>
    );
  }
  return <CpwPage {...props} K={kit} />;
}

function CpwPage({ K, mode = "live", role: roleIn = "trainer", uid = null, row = null, isSelf = false, verified: verifiedIn = false, certs = [], name: nameIn = "", avatar: avatarIn = "",
  sampleKey = "", demo = false, follow = null, onFollow = () => {}, onMessage = () => {}, chrome = true, belowContent = null }) {
  const role = roleIn === "nutritionist" ? "nutritionist" : "trainer";
  const nutri = role === "nutritionist";
  const live = mode === "live" && !!uid;
  const wide = useCpwWide(1000);
  const headH = useCpwHeadH(chrome);

  // ── The sample (a coach with no Shape account) ──
  const sample = React.useMemo(() => {
    if (live) return null;
    const key = String(sampleKey || nameIn || "");
    if (nutri) return K.bsNutritionistDemo(demo ? {} : { ...K.bsNutritionistSampleOf({ key }), where: "", business: null });
    return K.bsTrainerDemo(demo ? { media: "/newdesign/demo/" } : { media: "/newdesign/demo/", ...K.bsTrainerSampleOf({ key }), where: "", business: null });
  }, [live, nutri, sampleKey, nameIn, demo]);

  // ── Who ──
  const isPrivate = !!(live && row && (row.can_view === false || (row.can_view == null && row.is_public === false)));
  const name = (live ? row && row.full_name : nameIn) || (nutri ? "Nutritionist" : "Coach");
  const first = K.bsCoachFirstName(name) || name;
  const pron = K.bsCoachPronoun(!isPrivate && live && row ? row.pronouns : "");
  const words = K.bsCoachWords(pron, first);
  const points = live ? (row && Number.isFinite(row.points) ? row.points : null) : (sample && sample.live ? sample.live.points : null);
  const tier = points != null && typeof lvTierFor === "function" ? lvTierFor(points, true).name : "";
  const [custom, setCustom] = React.useState(() => (live ? (row && row.custom) || null : (sample && sample.custom) || null));
  React.useEffect(() => { setCustom(live ? (row && row.custom) || null : (sample && sample.custom) || null); }, [live, uid, sample]);
  // A sample's photo comes in on the link (marketplace `&avatar=`): only https or this site's own paths.
  const avatar = live ? (row && row.avatar) || null : (/^(https:\/\/|\/[^/\\])/.test(String(avatarIn || "")) ? avatarIn : null);
  const [brokenAvatar, setBrokenAvatar] = React.useState(null);
  const avatarShown = avatar && avatar !== brokenAvatar ? avatar : null;
  const bio = isPrivate ? "" : String((live ? (row && (row.goal || row.bio)) : (sample && sample.live && sample.live.goal)) || "").trim();

  // ── Their colours: the look they set in Make it yours, else the web customizer's accent ──
  const look = K.bsProfileLook(custom && custom.look) || {};
  const pal0 = K.bsCoachPalette(look, role);
  const webAccent = !look.accent && custom && /^#[0-9a-f]{6}$/i.test(String(custom.accent || "")) ? custom.accent : null;
  const pal = webAccent ? { ...pal0, ACCENT: webAccent, ON_ACCENT: K.bsOnColor(webAccent) } : pal0;
  const ACC = pal.ACCENT, ON_ACC = pal.ON_ACCENT, INK = pal.INK;
  const ink = (a) => `rgba(${pal.inkRGB},${a})`;

  // ── Their listing ──
  const [listingEpoch, setListingEpoch] = React.useState(0);
  const listing = useCpwListing(live ? uid : null, role, listingEpoch);
  const listed = listing.state === "ready" && !!listing.row;
  const providerId = listed ? listing.row.id : null;
  const L = listed ? listing.row : (demo && sample ? sample.provider : null);
  const media = isPrivate ? { cover: null, gallery: [] } : (listed ? listing.row.listing_media : sample ? sample.provider.listing_media : { cover: null, gallery: [] }) || { cover: null, gallery: [] };
  const gallery = Array.isArray(media.gallery) ? media.gallery : [];
  const coverDoc = sample ? (custom && custom.cover && sample.photos.includes(custom.cover.image) ? { image: custom.cover.image } : null) : K.bsProfileCover(custom && custom.cover, uid);
  const wall = isPrivate ? null : ((coverDoc && coverDoc.image) || media.cover || null);
  const studio = nutri || isPrivate ? null : K.bsProfileStudio(custom && custom.studio);
  const kitchen = !nutri || isPrivate ? null : K.bsProfileKitchen(custom && custom.kitchen, live ? uid : null);
  const biz = isPrivate ? null : K.bsProfileBizCard(custom && custom.bizCard);
  const where = isPrivate ? "" : ((biz && biz.where) || (studio && studio.where) || (live && row && row.location) || "");
  const specialty = isPrivate || !L ? "" : String(L.specialty || L.specialty_type || L.category || "").trim();
  const roleLine = [specialty || (nutri ? "Nutritionist" : "Coach"), biz && biz.name].filter(Boolean).join(" · ");
  const verified = !isPrivate && !!((L && L.verified) || (live && verifiedIn));
  const monthly = listed && Number(listing.row.price) > 0 ? Number(listing.row.price) : null;
  const sells = monthly != null;

  // ── The storefront, the reviews and the review form: the one path (livingShared.jsx) ──
  const commerceD = React.useMemo(() => ({ uid: live ? uid : null, name, first, role, offerings: [], reviews: [], custom }), [live, uid, name, first, role, custom]);
  const cm = useLvCoachCommerce({ d: commerceD, monthly: sells ? `$${monthly}` : null });
  const wins = useLvWinsWall(commerceD);

  // ── Their week ──
  const [weekEpoch, setWeekEpoch] = React.useState(0);
  const avail = useCpwWeek({ providerId, role, listingState: live ? listing.state : "none", sampleWeek: sample ? sample.availability : null, epoch: weekEpoch });
  const atCapacity = !!cm.atCapacity || (avail.kind === "ready" && avail.atCapacity === true);
  const introClosed = atCapacity && !(avail.kind === "ready" && avail.introsAtCap) && !(cm.wl && cm.wl.status === "invited");

  // ── Their work ──
  const salePlans = useCpwPlans(live ? uid : null);
  const roleOf = (pl) => pl.provider_role || pl.providerRole || (pl.kind === "meal_plan" ? "nutritionist" : "trainer");
  const ownPlans = Array.isArray(salePlans) ? salePlans.filter((pl) => pl && roleOf(pl) === role) : [];
  const postRows = useCpwPosts(live ? uid : null, isSelf);
  const cards = React.useMemo(() => (postRows || []).map((r) => K.bsCoachCardFromRow(r)).filter((c) => c && (isSelf || (typeof lvFeedVisible === "function" ? lvFeedVisible(c.vis, false) : true))), [postRows, isSelf]);
  const programs = nutri ? [] : sample ? (sample.programs || []) : K.bsCoachPrograms(ownPlans);
  const workouts = nutri ? [] : sample ? (sample.workouts || []) : K.bsWorkoutVideos(cards);
  const replays = nutri ? [] : sample ? (sample.replays || []) : cards.filter((c) => c.breakdown && Array.isArray(c.breakdown.rows) && c.breakdown.rows.length && !c.video);
  const plates = !nutri ? [] : sample ? (sample.plates || []) : cards.filter((c) => c.meal);
  const plateDays = K.bsPlateNoteDays(plates);
  const shownKeys = new Set([...replays, ...workouts, ...plates].map((c) => c && c.key).filter(Boolean));
  const activity = sample ? (sample.activity || []) : cards.filter((c) => !shownKeys.has(c.key));
  const studioWork = studio ? K.bsStudioWork(studio, programs) : [];
  // What Work with lists: a coach's published plans, or the sample's own, as the app's sheet does
  // (BSTrainerProfile sheetPlans): a trainer's programs, or a nutritionist's meal plans (#2557).
  // Programs are empty for a nutritionist, so reading only them left the sample's sheet with no
  // plans and no prices (Codex P2 on #2560).
  const weeksSaid = (n) => `${n} ${n === 1 ? "week" : "weeks"}`;
  const plansForSale = !sample ? ownPlans
    : nutri ? (sample.plans || []).map((pl) => ({ ...pl, sample: true, meta: pl.weeks ? weeksSaid(pl.weeks) : "" }))
    : programs.filter((p) => p && p.plan).map((p) => ({ ...p.plan, sample: true, meta: p.weeks ? weeksSaid(p.weeks) : (p.plan.meta || "") }));
  // A plan with a price is bought here only from a listing on the marketplace: an unfinished or
  // suspended one sells nothing (the app's rule, Codex P1 on 196314b).
  const plansPaid = listed && ownPlans.some((pl) => K.bsWorkPaid(pl.price));

  // ── Reviews ──
  const reviews = sample
    ? { list: sample.reviews.list, avg: sample.reviews.avg, count: sample.reviews.count, locked: false }
    : (() => {
      const list = Array.isArray(cm.liveReviews) ? cm.liveReviews : [];
      const count = cm.revAgg ? cm.revAgg.count : list.length;
      const avg = cm.revAgg && cm.revAgg.count > 0 ? cm.revAgg.avg : (list.length ? list.reduce((s, r) => s + (Number(r.rating) || 0), 0) / list.length : 0);
      return { list, avg, count, locked: !!cm.revLocked, unread: live && cm.liveReviews === null };
    })();
  const revLocked = !!(reviews.locked && reviews.count > 0 && !reviews.list.length);
  // The coach's pinned reviews first (their Wins wall), then the newest.
  const quotes = (() => {
    const seen = new Set(), out = [];
    for (const r of [...(sample ? [] : wins.map((w) => ({ ...w, pinned: true }))), ...reviews.list]) {
      if (!r || !String(r.text || "").trim()) continue;
      const k = r.id || r.text;
      if (seen.has(k)) continue;
      seen.add(k); out.push(r);
      if (out.length >= 6) break;
    }
    return out;
  })();
  const ratingBit = reviews.count > 0 ? `${(Math.round(reviews.avg * 10) / 10).toFixed(1)}/10 from ${reviews.count} ${reviews.count === 1 ? "review" : "reviews"}` : "New on Shape";

  // The page's title and share card name the coach (the public page only; the dashboard keeps its own).
  React.useEffect(() => {
    if (!chrome) return;
    try {
      const title = `${name} · ${roleLine} · Shape`;
      const desc = String(bio || `${name}, ${roleLine.toLowerCase()} on Shape.`).replace(/\s+/g, " ").slice(0, 200);
      document.title = title;
      const meta = (attr, key, val) => {
        let m = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
        m.setAttribute("content", val);
      };
      meta("name", "description", desc);
      meta("property", "og:title", title);
      meta("property", "og:description", desc);
      meta("property", "og:type", "profile");
      if (wall || avatarShown) meta("property", "og:image", new URL(wall || avatarShown, window.location.href).href);
    } catch (e) { /* a title is a courtesy */ }
  }, [chrome, name, roleLine, bio, wall, avatarShown]);

  // ── Tabs ──
  const aboutDoc = isPrivate ? null : K.bsProfileAbout(custom && custom.about);
  const aboutPrompts = isPrivate ? [] : K.bsProfilePrompts(custom && custom.prompts);
  const aboutLinks = isPrivate || sample ? null : K.bsProfileLinkable(custom && custom.links);
  const credList = isPrivate ? [] : (Array.isArray(certs) ? certs : []);
  const hasAbout = !!(aboutDoc || aboutPrompts.length || aboutLinks || credList.length);
  const aboutTab = isSelf || hasAbout ? [["about", "About me"]] : [];
  const tabs = nutri ? [
    ["day", words.day], ...aboutTab,
    ...(isSelf || kitchen || gallery.length ? [["kitchen", words.kitchen]] : []),
    ...(isSelf || plateDays.length ? [["plates", "Plate notes"]] : []),
    ...(isSelf || activity.length ? [["activity", "Activity"]] : []),
  ] : [
    ["day", words.day], ...aboutTab,
    ...(isSelf || studio || gallery.length ? [["studio", "The studio"]] : []),
    ...(isSelf || replays.length || workouts.length || programs.length ? [["replays", "Replays"]] : []),
    ...(isSelf || activity.length ? [["activity", "Activity"]] : []),
  ];
  const [tab, setTab] = React.useState("day");
  const tabNow = tabs.some(([k]) => k === tab) ? tab : "day";

  // ── Overlays ──
  const [sheet, setSheet] = React.useState(null); // { kind: 'work'|'reviews'|'piece'|'program'|'replay'|'plateDay'|'recipe', … }
  const [editing, setEditing] = React.useState(false);
  const railRef = React.useRef(null);
  const tabsRef = React.useRef(null);
  // Work with: the sheet on a phone; on a desktop, the column beside the page, brought into view.
  const openWork = () => {
    if (wide && railRef.current) {
      try { railRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
      try { const h = railRef.current.querySelector("h2"); if (h && h.focus) h.focus({ preventScroll: true }); } catch (e) {}
      return;
    }
    setSheet({ kind: "work" });
  };
  // ⚠ A COACH'S REFERRAL LINK OPENS ON THE STOREFRONT (owner, 2026-10-18): the person it brings came
  // to hire this coach. On a phone that is the Work-with sheet; on a desktop it is already beside the page.
  React.useEffect(() => {
    let ref = null;
    try { ref = new URLSearchParams(window.location.search).get("ref"); } catch (e) {}
    if (ref && !isSelf && !isPrivate && !wide) setSheet({ kind: "work" });
  }, []);
  const toDay = () => { setSheet(null); setTab("day"); setTimeout(() => { try { if (tabsRef.current) tabsRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }, 40); };
  const message = () => { if (cm.provId) cm.openChat(); else onMessage(); };
  const canEdit = isSelf && typeof ProfileCustomizer !== "undefined";
  const hoursHref = nutri ? "/newdesign/NutritionistSchedule.html" : "/newdesign/TrainerSchedule.html";
  const scoreHref = nutri ? "/newdesign/NutritionistScore.html" : "/newdesign/TrainerScore.html";
  const followOn = !!(follow && (follow.isFollowing || follow.isPending));
  const canFollow = live && !isSelf && !!(follow && follow.canFollow !== false);
  const bookHref = (iso) => "/newdesign/consultation.html?type=" + role + "&id=" + encodeURIComponent(providerId) + "&name=" + encodeURIComponent(name) + "&at=" + encodeURIComponent(iso);
  const T = { pal, ACC, ON_ACC, INK, ink, first, name, words, nutri, isSelf, wide };


  const workWith = (
    <CpwWorkWith T={T} cm={cm} sells={sells} monthly={monthly} listed={listed} sample={!!sample} providerId={providerId}
      offer={listed ? listing.row.monthly_offer : null} plans={plansForSale} plansPaid={plansPaid} K={K}
      onPickIntro={providerId && !avail.sample ? toDay : null} onMessage={message} />
  );

  return (
    <div className="cpw" data-coach-profile="" data-role={role} data-mode={live ? "live" : "sample"} style={{ position: "relative", minHeight: chrome ? "100vh" : "auto", background: pal.PAPER_BG, color: INK, fontFamily: CPW_BODY, WebkitFontSmoothing: "antialiased", overflowX: "hidden" }}>
      <style>{`
    .cpw-wrap{max-width:1180px;margin:0 auto;padding:0 32px}
    .cpw-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:56px;align-items:start}
    .cpw-wall{height:300px}
    .cpw-av{width:132px;height:132px;top:-66px}
    .cpw-who-name{margin-left:154px;min-height:72px}
    .cpw-cards2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 20px}
    .cpw-quotes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .cpw-studio{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:28px;align-items:start}
    .cpw-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .cpw-gallery img{height:150px}
    .cpw-grab{display:none}
    .cpw-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
    .cpw-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .cpw-one{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
    /* The site's phone CSS (pageShell.jsx) sizes every h1-h3 and pads every main, section and
       footer with !important; on this page each keeps its own. */
    .cpw .cpw-h1{font-size:38px !important;line-height:1.05 !important;letter-spacing:normal !important}
    .cpw h2,.cpw-sheet h2,.cpw h3{letter-spacing:normal !important}
    .cpw h2.cpw-s22,.cpw-sheet h2.cpw-s22{font-size:22px !important;line-height:1.15 !important}
    .cpw h2.cpw-s21,.cpw-sheet h2.cpw-s21{font-size:21px !important;line-height:1.15 !important}
    .cpw-sheet h2.cpw-s26{font-size:26px !important;line-height:1.1 !important}
    .cpw h3.cpw-s10{font-size:10px !important;line-height:1.4 !important;letter-spacing:0.14em !important}
    .cpw-wrap main,.cpw-wrap section,.cpw-wrap footer{padding-left:0 !important;padding-right:0 !important}
    .cpw-tabs::-webkit-scrollbar,.cpw-sheet::-webkit-scrollbar,.cpw-quotes::-webkit-scrollbar{display:none;width:0;height:0}
    .cpw-tabs,.cpw-sheet,.cpw-quotes{scrollbar-width:none}
    .cpw button:focus-visible,.cpw a:focus-visible,.cpw-sheet button:focus-visible,.cpw-sheet a:focus-visible{outline:2px solid ${ACC};outline-offset:2px}
    @media (max-width:999px){
      .cpw-grid{grid-template-columns:minmax(0,1fr);gap:0}
      .cpw-rail{display:none}
      .cpw-studio{grid-template-columns:minmax(0,1fr)}
    }
    @media (max-width:640px){
      .cpw-wrap{padding:0 20px}
      .cpw-wall{height:200px}
      .cpw-av{width:104px;height:104px;top:-52px}
      .cpw-who-name{margin-left:118px;min-height:56px}
      .cpw .cpw-h1{font-size:26px !important}
      .cpw-days{gap:4px}
      .cpw-cta-row button{font-size:14px !important;padding:0 6px !important}
      .cpw-cards2{grid-template-columns:minmax(0,1fr)}
      .cpw-quotes{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:20px;margin:0 -20px;padding:0 20px 4px}
      .cpw-quotes > figure{flex:0 0 82%;scroll-snap-align:start}
      .cpw-gallery img{height:96px}
      .cpw-scrim{align-items:flex-end !important}
      .cpw-sheet{width:100% !important;max-height:88vh !important;border-radius:22px 22px 0 0}
      .cpw-grab{display:block}
    }
  `}</style>
      {chrome && typeof Header !== "undefined" ? <Header /> : null}

      {/* The wall: their photo, or their colour until they add one */}
      <div className="cpw-wall" data-wall="" style={{ position: "relative", overflow: "hidden", background: wall ? "#111" : `linear-gradient(135deg, ${cpwA(ACC, 0.42)}, ${pal.PAPER2} 70%)` }}>
        {wall ? <img src={wall} alt={`${first}'s wall photo`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: CPW_FOCUS[look.focus] || CPW_FOCUS.center }} /> : null}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.22) 100%)" }} />
        {isSelf && !wall && canEdit ? (
          <div className="cpw-wrap" style={{ position: "relative", height: "100%" }}>
            <button type="button" onClick={() => setEditing(true)} style={{ position: "absolute", right: 32, bottom: 16, minHeight: 38, padding: "0 14px", border: "1px solid rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.3)", color: "#fff", fontFamily: CPW_DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>＋ Add a wall photo</button>
          </div>
        ) : null}
      </div>

      <div className="cpw-wrap">
        <div className="cpw-grid">
          <main style={{ minWidth: 0 }}>
            {/* The avatar over the wall's edge, and who they are */}
            <section data-who="" style={{ position: "relative" }}>
              <div className="cpw-av" style={{ position: "absolute", left: 0 }}>
                <div style={{ width: "100%", height: "100%", borderRadius: 99, border: `4px solid ${pal.PAPER}`, background: pal.PAPER2, overflow: "hidden", display: "grid", placeItems: "center" }}>
                  {avatarShown ? <img src={avatarShown} alt="" onError={() => setBrokenAvatar(avatarShown)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%" }} /> : <span data-initials="" style={{ fontFamily: CPW_DISPLAY, fontSize: 34, fontWeight: 600, color: INK }}>{cpwInitials(name)}</span>}
                </div>
              </div>
              <div className="cpw-who-name" style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                <h1 className="cpw-h1" style={{ margin: 0, fontFamily: CPW_DISPLAY, fontWeight: 600, lineHeight: 1.05, color: INK, overflowWrap: "anywhere" }}>{name}<span style={{ color: ACC }}>.</span></h1>
                <span style={{ fontSize: 14, color: ink(0.74) }}>{roleLine}</span>
                {where ? <span style={{ fontSize: 13, color: ink(0.64) }}>{where}</span> : null}
              </div>
              {isPrivate ? (
                <p style={{ margin: "16px 0 0", fontSize: 15, color: ink(0.74) }}>{row && row.visibility === "friends" ? `${first} shares their profile with friends. Connect to see more.` : `${first} keeps their profile private. Only their name and tier are shown.`}</p>
              ) : (
                <React.Fragment>
                  {bio ? <p data-bio="" style={{ margin: "16px 0 0", fontSize: 16, lineHeight: 1.55, color: INK, maxWidth: 680, whiteSpace: "pre-line" }}>{bio}</p>
                    : isSelf ? <p style={{ margin: "16px 0 0", fontSize: 14, color: ink(0.6) }}>Add a line about how you coach in Settings → Edit profile.</p> : null}
                  <button type="button" data-verified-line="" onClick={() => setSheet({ kind: "reviews" })} style={{ display: "block", margin: "9px 0 0", padding: 0, border: 0, background: "transparent", textAlign: "left", fontFamily: CPW_BODY, fontSize: 13, color: ink(0.64), cursor: "pointer" }}>
                    {verified ? <span style={{ color: ACC }}>✓ </span> : null}
                    {[verified ? `Verified ${tier} coach` : tier, ratingBit].filter(Boolean).join(" · ")}
                  </button>
                  {sample && !demo ? <p data-sample-note="" style={{ margin: "12px 0 0", padding: "9px 12px", borderLeft: `2px solid ${ACC}`, background: pal.PAPER2, fontSize: 13, lineHeight: 1.45, color: ink(0.74), maxWidth: 680 }}>{nutri
                    ? `${first} hasn't set up a Shape account yet, so the kitchen, plate notes, reviews and times here are samples.`
                    : `${first} hasn't set up a Shape account yet, so the studio, replays, reviews and times here are samples.`}</p> : null}
                  {isSelf && points != null ? <a href={scoreHref} style={{ display: "inline-block", marginTop: 4, minHeight: 32, lineHeight: "32px", fontFamily: CPW_MONO, fontSize: 11, letterSpacing: "0.06em", color: ink(0.7), textDecoration: "none" }}>Shape Score {points.toLocaleString()} ›</a> : null}
                </React.Fragment>
              )}
              {/* Followers and following stay public, even on a private profile; each opens its list. */}
              {live && follow ? (
                <div data-follow-counts="" style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontFamily: CPW_MONO, fontSize: 11, letterSpacing: "0.06em", color: ink(0.6) }}>
                  {[["followers", follow.followers, "followers"], ["following", follow.following, "following"]].map(([k, n, label]) => (
                    <button key={k} type="button" onClick={() => follow.openList && follow.openList(k)} style={{ minHeight: 32, padding: 0, border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", cursor: "pointer" }}>
                      <span style={{ color: INK, fontWeight: 600 }}>{Number(n) || 0}</span> {label}
                    </button>
                  ))}
                  {isSelf && follow.requests > 0 ? <button type="button" onClick={() => follow.openRequests && follow.openRequests()} style={{ minHeight: 30, padding: "0 10px", border: 0, background: ACC, color: ON_ACC, fontFamily: CPW_MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>{follow.requests} request{follow.requests === 1 ? "" : "s"}</button> : null}
                </div>
              ) : null}
              <div className="cpw-cta-row" style={{ marginTop: 16, display: "flex", gap: 8, maxWidth: 560 }}>
                {isSelf ? (
                  <React.Fragment>
                    {canEdit ? <button type="button" data-edit-profile="" onClick={() => setEditing(true)} style={{ flex: 1.2, minHeight: 48, border: 0, background: ACC, color: ON_ACC, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Edit profile</button> : null}
                    <a href={hoursHref} style={{ flex: 1, minHeight: 48, border: `1px solid ${ink(0.22)}`, color: INK, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, display: "grid", placeItems: "center", textDecoration: "none" }}>Your hours</a>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <button type="button" data-message="" onClick={message} style={{ flex: 1.2, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: 48, border: 0, background: ACC, color: ON_ACC, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Message {first}</button>
                    {!isPrivate ? <button type="button" data-work-with="" onClick={openWork} style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: 48, border: `1px solid ${ink(0.22)}`, background: "transparent", color: INK, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{words.work}</button> : null}
                    {canFollow ? (
                      <button type="button" data-follow="" onClick={onFollow} aria-pressed={followOn} aria-label={follow.isFollowing ? "Following" : follow.isPending ? "Requested" : "Follow"} title={follow.isFollowing ? "Following" : follow.isPending ? "Requested" : "Follow"}
                        style={{ width: 48, minHeight: 48, border: `1px solid ${followOn ? ACC : ink(0.22)}`, background: follow.isFollowing ? cpwA(ACC, 0.16) : "transparent", color: followOn ? ACC : INK, fontSize: 18, cursor: "pointer" }}>{follow.isFollowing ? "✓" : follow.isPending ? "…" : "＋"}</button>
                    ) : null}
                  </React.Fragment>
                )}
              </div>
              {isSelf ? <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.45, color: ink(0.58), maxWidth: 560 }}>Your colours, wall photo, studio or kitchen and About me are set in the Shape app, in Make it yours. Members see them here.</p> : null}
            </section>

            {/* Tabs */}
            {!isPrivate ? (
              <React.Fragment>
                <nav ref={tabsRef} aria-label="Profile sections" className="cpw-tabs" style={{ position: "sticky", top: headH, zIndex: 20, marginTop: 24, background: pal.PAPER, borderBottom: `1px solid ${ink(0.18)}`, display: "flex", overflowX: "auto", scrollMarginTop: headH }}>
                  {tabs.map(([k, label]) => {
                    const on = k === tabNow;
                    return (
                      <button key={k} type="button" aria-pressed={on} data-profile-tab={k} title={label} onClick={(e) => { setTab(k); try { e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (err) {} }}
                        style={{ flex: wide ? "0 0 auto" : "1 0 auto", minHeight: 50, padding: wide ? "0 18px" : (tabs.length > 3 ? "0 6px" : "0 10px"), border: 0, borderBottom: `2px solid ${on ? ACC : "transparent"}`, marginBottom: -1, background: "transparent", color: on ? INK : ink(0.55), fontFamily: CPW_DISPLAY, fontWeight: on ? 600 : 400, fontSize: wide ? 15.5 : (tabs.length > 3 ? 13.5 : 15), whiteSpace: "nowrap", cursor: "pointer" }}>{label}</button>
                    );
                  })}
                </nav>
                <div data-tab-body={tabNow} style={{ paddingBottom: 30 }}>
                  {tabNow === "day" ? (
                    <CpwDayTab T={T} K={K} avail={avail} listingState={live ? listing.state : (sample ? "ready" : "none")} introClosed={introClosed} hoursHref={hoursHref}
                      onRetry={() => (listing.state === "error" ? setListingEpoch : setWeekEpoch)((n) => n + 1)} bookHref={providerId ? bookHref : null} onWork={openWork} />
                  ) : tabNow === "about" ? (
                    <CpwAboutTab T={T} K={K} about={aboutDoc} prompts={aboutPrompts} links={aboutLinks} certs={credList} onEdit={canEdit ? () => setEditing(true) : null} />
                  ) : tabNow === "studio" ? (
                    <CpwStudioTab T={T} K={K} studio={studio} gallery={gallery} work={studioWork} onPiece={(i) => setSheet({ kind: "piece", i })} />
                  ) : tabNow === "kitchen" ? (
                    <CpwKitchenTab T={T} kitchen={kitchen} gallery={gallery} onRecipe={(r) => setSheet({ kind: "recipe", r })} />
                  ) : tabNow === "plates" ? (
                    <CpwPlateNotesTab T={T} days={plateDays} onOpen={(day) => setSheet({ kind: "plateDay", day, i: 0 })} />
                  ) : tabNow === "replays" ? (
                    <CpwReplaysTab T={T} programs={programs} workouts={workouts} replays={replays} onProgram={(pr) => setSheet({ kind: "program", pr })} onOpen={(r) => setSheet({ kind: "replay", r, i: 0 })} />
                  ) : (
                    <CpwActivityTab T={T} cards={activity} />
                  )}
                </div>
              </React.Fragment>
            ) : null}

            {/* What clients say: the reviews on the page itself, shown on a private profile too (they
                are the readers', not the coach's to hide). A reader who isn't a member gets the rating
                and the way in. At the foot of the page, after the tabs (owner, 2026-10-30). */}
            <CpwReviewsStrip T={T} quotes={quotes} revLocked={revLocked} ratingBit={ratingBit} onAll={() => setSheet({ kind: "reviews" })} />

            <footer data-credential="" style={{ padding: "10px 0 40px", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: ink(0.5) }}>
              {[L && L.credential, verified ? "Checked by Shape" : null].filter(Boolean).join(" · ")}
            </footer>
          </main>

          {/* Work with, beside the page on a desktop */}
          {wide && !isPrivate ? (
            <aside className="cpw-rail" aria-label={words.work}>
              <div ref={railRef} data-work-rail="" style={{ position: "sticky", top: headH + 20, marginTop: 28, padding: "18px 22px 24px", background: pal.PAPER2, borderTop: `3px solid ${ACC}`, maxHeight: `calc(100vh - ${headH + 40}px)`, overflowY: "auto", scrollbarWidth: "none" }}>
                {workWith}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {belowContent}
      {chrome && typeof Footer !== "undefined" ? <Footer /> : null}

      {/* ── Sheets ── */}
      {sheet && sheet.kind === "work" ? (
        <CpwSheet pal={pal} label={words.work} onClose={() => setSheet(null)} data={{ "data-work-sheet": "" }}>
          {workWith}
        </CpwSheet>
      ) : null}
      {sheet && sheet.kind === "reviews" ? (
        <CpwReviewsSheet T={T} reviews={reviews} revLocked={revLocked} ratingBit={ratingBit} cm={cm} canReview={live && !isSelf} onClose={() => setSheet(null)} />
      ) : null}
      {sheet && sheet.kind === "piece" && studio && studio.items[sheet.i] ? (
        <CpwPieceSheet T={T} K={K} studio={studio} i={sheet.i} work={studioWork[sheet.i]} programs={programs} onClose={() => setSheet(null)} onWork={() => { setSheet(null); openWork(); }} onProgram={(pr) => setSheet({ kind: "program", pr })} />
      ) : null}
      {sheet && sheet.kind === "program" ? (
        <CpwProgramSheet T={T} K={K} pr={sheet.pr} studio={studio} work={studioWork} sells={listed} onClose={() => setSheet(null)} onWork={() => { setSheet(null); openWork(); }}
          onBuy={() => { const pl = sheet.pr.plan || {}; lvBuyPlan({ name: pl.name, price: sheet.pr.price, planId: pl.id, providerId: pl.provider_id || pl.providerId || providerId, providerRole: pl.provider_role || pl.providerRole || role }); }} />
      ) : null}
      {sheet && sheet.kind === "replay" ? (
        <CpwReplaySheet T={T} r={sheet.r} i={sheet.i} setI={(i) => setSheet({ ...sheet, i })} avatar={avatarShown} onClose={() => setSheet(null)} onWork={() => { setSheet(null); openWork(); }} />
      ) : null}
      {sheet && sheet.kind === "plateDay" ? (
        <CpwPlateSheet T={T} K={K} day={sheet.day} i={sheet.i} setI={(i) => setSheet({ ...sheet, i })} avatar={avatarShown} onClose={() => setSheet(null)} onWork={() => { setSheet(null); openWork(); }} />
      ) : null}
      {sheet && sheet.kind === "recipe" ? (
        <CpwRecipeSheet T={T} r={sheet.r} onClose={() => setSheet(null)} />
      ) : null}
      {editing && canEdit ? <ProfileCustomizer key={uid || "self"} initial={custom} c={ACC} coach ownerUid={uid} ownerName={name} onClose={() => setEditing(false)} onSave={(doc) => { setCustom(doc); setEditing(false); }} /> : null}
    </div>
  );
}

// ── Work with: the storefront ────────────────────────────────────────────────────────────────
// The app's Work-with sheet (BSCoachCoachingBlock): the monthly offer with Subscribe and the free
// intro, the waiting list when the coach is full, and the plans they sell, each with Buy. Subscribe
// and Buy go through livingShared.jsx's one path (useLvCoachCommerce's subscribe, lvBuyPlan), each
// sending the code typed in the code box (LvCodeBox) so the server checks it before the redirect to
// Stripe (coach direct charges, #2403).
function CpwWorkWith({ T, cm, K, sells, monthly, listed, sample, providerId, offer, plans, plansPaid, onPickIntro, onMessage }) {
  const { pal, ACC, ON_ACC, INK, ink, first, nutri, isSelf } = T;
  const [cat, setCat] = React.useState("All");
  const perks = offer && Array.isArray(offer.includes) ? offer.includes.filter((x) => typeof x === "string" && x.trim()).slice(0, 3) : [];
  const blurb = offer && typeof offer.blurb === "string" && offer.blurb.trim() ? offer.blurb.trim() : "";
  const cta = { minHeight: 46, border: 0, cursor: "pointer", fontFamily: CPW_MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", display: "grid", placeItems: "center", textDecoration: "none", boxSizing: "border-box" };
  const ctaInk = { ...cta, background: INK, color: pal.PAPER };
  const ctaLine = { ...cta, border: `1px solid ${INK}`, background: "transparent", color: INK };
  const block = { marginTop: 20, paddingTop: 12, borderTop: `3px solid ${INK}` };
  const Kick = ({ children, col }) => <span style={{ fontFamily: CPW_MONO, fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: col || ink(0.5), fontWeight: 600 }}>{children}</span>;
  const bodyText = { fontSize: 13.5, lineHeight: 1.5, color: ink(0.74), margin: "7px 0 12px" };
  const err = (m) => (m ? <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: pal.RUST }}>{m}</p> : null);
  const pkgName = nutri ? "Monthly nutrition coaching" : "Monthly coaching";
  const price = monthly != null ? `$${monthly}` : "";
  const wl = cm.wl;
  // The account and payment prompts the checkout can answer with, each bringing the member back here.
  const prompts = (
    <React.Fragment>
      {!cm.needsMember && cm.memberReturn === "joined" ? <p role="status" style={{ margin: "10px 0 0", fontSize: 13, color: INK }}>Your Shape membership is active. You can subscribe to {first} now.</p> : null}
      {!cm.needsMember && cm.memberReturn === "pending" ? <p role="status" style={{ margin: "10px 0 0", fontSize: 13, color: INK }}>Your membership payment is still clearing. Try Subscribe again in a minute.</p> : null}
      {cm.needsAccount ? (
        <div role="alert" data-needs-account="" style={{ marginTop: 12, padding: "12px 14px", border: `1px solid ${ink(0.25)}` }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: INK }}>{cm.needsAccount === "waitlist" ? `You need a Shape account to join ${first}'s waiting list.` : `You need a Shape account to subscribe to ${first}.`} Join Shape or log in, and you'll come back here.</p>
          <div className="cpw-pair" style={{ marginTop: 10 }}>
            <a href={lvAccountHref("SignupClient")} data-account-join="" style={ctaInk}>Join Shape</a>
            <a href={lvAccountHref("Login")} data-account-login="" style={ctaLine}>Log in</a>
          </div>
        </div>
      ) : null}
      {cm.needsScreening ? (
        <div role="alert" style={{ marginTop: 12, padding: "12px 14px", border: `1px solid ${ink(0.25)}` }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: INK }}>Before you hire a coach, complete your health screening. It takes a few minutes, it's shared with the coaches you hire so they can train you safely, and you'll come back here to subscribe to {first}.</p>
          <a href={lvScreeningHref()} style={{ ...ctaInk, marginTop: 10 }}>Complete the screening</a>
        </div>
      ) : null}
      {cm.needsMember ? (
        <div role="alert" style={{ marginTop: 12, padding: "12px 14px", border: `1px solid ${ink(0.25)}` }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: INK }}>Coaching is for Shape members. Start your $5/month membership first, and you'll come back here to subscribe to {first}.</p>
          <button type="button" onClick={async () => { cm.setJoinErr(""); const r = window.ShapeMembership ? await window.ShapeMembership.start() : { error: "Could not start checkout. Reload the page and try again." }; if (r && r.error) cm.setJoinErr(r.error); }} style={{ ...ctaInk, width: "100%", marginTop: 10 }}>Start membership · $5/month</button>
          {err(cm.joinErr)}
        </div>
      ) : null}
    </React.Fragment>
  );
  // The plans they sell, sub-tabbed by kind when there are three or more (the app's rule).
  const bucket = (cat) => {
    const c = String(cat || "").toLowerCase();
    if (nutri) return /meal/.test(c) ? "Meals" : /diet|cut|recomp|nutrition/.test(c) ? "Diets" : "Coaching";
    return /workout|single|session|form/.test(c) ? "Workouts" : /program|block|strength|hypertrophy|peak/.test(c) ? "Programs" : "Coaching";
  };
  const rows = (Array.isArray(plans) ? plans : []).filter(Boolean).map((pl) => ({ cat: bucket(pl.category || (pl.kind === "meal_plan" ? "meal" : "program")), kind: String(pl.category || (pl.kind === "meal_plan" ? "meal plan" : "program")).replace(/_/g, " "), pl, price: K.bsWorkPrice(pl.price) || "Listed" }));
  const cats = ["All", ...(nutri ? ["Meals", "Diets", "Coaching"] : ["Workouts", "Programs", "Coaching"]).filter((c) => rows.some((r) => r.cat === c))];
  const catNow = cats.length > 2 && cats.includes(cat) ? cat : "All";
  const shown = catNow === "All" ? rows : rows.filter((r) => r.cat === catNow);
  const buy = (pl) => lvBuyPlan({ name: pl.name, price: K.bsWorkPrice(pl.price), planId: pl.id, providerId: pl.provider_id || pl.providerId || providerId, providerRole: pl.provider_role || pl.providerRole || (nutri ? "nutritionist" : "trainer") });
  const canBuy = (r) => !isSelf && !sample && listed && r.pl.id != null && (r.pl.provider_id || r.pl.providerId || providerId) && K.bsWorkPaid(r.pl.price);
  const plansPart = rows.length || isSelf ? (
    <div data-plans="" style={{ marginTop: 26 }}>
      {/* The app's station head (BSTStationHead): the words in capitals over a rule of ink. */}
      <div style={{ fontFamily: CPW_DISPLAY, fontSize: 17, fontWeight: 500, letterSpacing: "0.03em", textTransform: "uppercase", paddingBottom: 6, borderBottom: `2px solid ${INK}` }}>{nutri ? `Work with ${first}` : `Train with ${first}`}</div>
      {cats.length > 2 ? (
        <div style={{ display: "flex", gap: 16, overflowX: "auto", marginTop: 4, scrollbarWidth: "none" }}>
          {cats.map((c) => { const on = c === catNow; return (
            <button key={c} type="button" data-offer-tab={c} aria-pressed={on} onClick={() => setCat(c)} style={{ flex: "none", minHeight: 36, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}>
              <span style={{ display: "inline-block", padding: "6px 0", boxShadow: on ? `inset 0 -2px 0 ${ACC}` : "none", color: on ? INK : ink(0.5), fontFamily: CPW_MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>{c}</span>
            </button>
          ); })}
        </div>
      ) : null}
      {shown.length ? shown.map((r, i) => (
        <div key={r.pl.id || i} data-offer-row="" style={{ borderTop: `1px solid ${ink(0.12)}`, padding: "13px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: CPW_MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ink(0.55), marginBottom: 4 }}>{r.kind}</div>
            <div style={{ fontFamily: CPW_DISPLAY, fontSize: 16.5, fontWeight: 600 }}>{r.pl.name}</div>
            {r.pl.meta ? <div style={{ fontSize: 12.5, color: ink(0.55), marginTop: 3 }}>{r.pl.meta}</div> : null}
          </div>
          {canBuy(r)
            ? <button type="button" data-plan-buy="" onClick={() => buy(r.pl)} style={{ ...ctaInk, flex: "none", padding: "0 14px", fontSize: 9.5, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Buy · {r.price}</button>
            : <div style={{ fontFamily: CPW_DISPLAY, fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums", flex: "none" }}>{r.price}</div>}
        </div>
      )) : (
        <div data-offer-empty="" style={{ padding: "13px 0", borderTop: `1px solid ${ink(0.12)}`, fontFamily: CPW_MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink(0.5) }}>{isSelf ? "Publish your first plan to list it here" : `${first} hasn't listed a plan yet`}</div>
      )}
    </div>
  ) : null;

  return (
    <div data-work-with-panel="">
      <h2 tabIndex={-1} className="cpw-s22" style={{ margin: 0, fontFamily: CPW_DISPLAY, fontWeight: 500, fontSize: 22, color: INK, outline: "none" }}>Work with {first}<span style={{ color: ACC }}>.</span></h2>
      <p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.45, color: ink(0.64) }}>{blurb || "Start with a free intro call. Everything runs in the Shape app."}</p>

      {isSelf ? (
        sells ? (
          <div style={block}>
            <Kick col={ACC}>What members see</Kick>
            <div style={{ fontFamily: CPW_DISPLAY, fontSize: 20, fontWeight: 600, lineHeight: 1.2, marginTop: 8 }}>{pkgName} · <span style={{ color: ACC }}>{price}/mo</span></div>
            {perks.length ? <div style={{ fontSize: 12.5, color: ink(0.6), marginTop: 5 }}>{perks.join(" · ")}</div> : null}
          </div>
        ) : <CpwHint ink={ink}>Members see your prices here once your listing has a monthly price.</CpwHint>
      ) : sells ? (
        <React.Fragment>
          {atCapacityBlock()}
          {!cm.atCapacity ? (
            <div data-storefront="" style={block}>
              <Kick col={ACC}>Work with {first}</Kick>
              <div style={{ fontFamily: CPW_DISPLAY, fontSize: 20, fontWeight: 600, lineHeight: 1.2, marginTop: 8 }}>{pkgName} · <span style={{ color: ACC }}>{price}/mo</span></div>
              {perks.length ? <div style={{ fontSize: 12.5, color: ink(0.6), marginTop: 5 }}>{perks.join(" · ")}</div> : null}
              {/* The code goes in before the redirect: the server checks it, then sends the member on to Stripe. */}
              {cm.provId ? <div data-code-box="" style={{ marginTop: 4 }}><LvCodeBox ink={INK} /></div> : null}
              <div className={cm.introHref ? "cpw-pair" : "cpw-one"} style={{ marginTop: 13 }}>
                <button type="button" data-subscribe="" onClick={cm.subscribe} style={ctaInk}>Subscribe</button>
                {cm.introHref ? <a href={cm.introHref} data-book-intro="" style={ctaLine}>Book intro · Free</a> : null}
              </div>
              {cm.provId ? <button type="button" onClick={cm.openChat} data-message-coach="" style={{ ...cpwLink(ACC), fontSize: 13.5 }}>Or message {first}</button> : null}
              {err(cm.buyErr)}
              {cm.buyErr && window.ShapeAskNoraLink ? <window.ShapeAskNoraLink label="Ask Nora what happened" draft="My checkout didn't go through. What happened?" problem={{ kind: "payment", message: cm.buyErr }} /> : null}
              {prompts}
            </div>
          ) : null}
        </React.Fragment>
      ) : (
        <div style={{ marginTop: 14 }}>
          {plansPaid ? null : <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: ink(0.74) }}>{sample
            ? `${first} hasn't set up a Shape account yet, so there is nothing to buy here. Send a message to ask about working together.`
            : `${first} hasn't listed prices on Shape yet. Book a free intro or send a message to ask.`}</p>}
          {plansPaid && cm.provId ? <div data-code-box="" style={{ marginTop: 4 }}><LvCodeBox ink={INK} /></div> : null}
          {onPickIntro && !sample ? <button type="button" onClick={onPickIntro} style={{ marginTop: 12, width: "100%", minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Pick an intro time</button> : null}
          <button type="button" onClick={onMessage} style={{ marginTop: 8, width: "100%", minHeight: 50, border: `1px solid ${ink(0.22)}`, background: "transparent", color: INK, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Message {first}</button>
        </div>
      )}
      {plansPart}
    </div>
  );

  // At capacity: the waiting list in the app's states (invited, waiting, already a client, full),
  // never a live Subscribe under "isn't taking new clients" (#1498).
  function atCapacityBlock() {
    if (!cm.atCapacity) return null;
    const intro = cm.introHref && (cm.introsOpen || (wl && wl.status === "invited"))
      ? <a href={cm.introHref} data-book-intro-at-capacity="" style={{ ...ctaLine, width: "100%", marginTop: 8 }}>Book intro · Free</a> : null;
    let inner;
    if (wl && wl.status === "invited") {
      inner = (
        <React.Fragment>
          <Kick col={pal.GREEN}>You're invited</Kick>
          <div style={{ fontFamily: CPW_DISPLAY, fontSize: 20, fontWeight: 600, lineHeight: 1.2, margin: "7px 0 4px" }}>{first} has room for you.</div>
          <p style={bodyText}>Book before {first} reopens to everyone.</p>
          {cm.provId ? <div data-code-box=""><LvCodeBox ink={INK} /></div> : null}
          <div className="cpw-pair" style={{ marginTop: 10 }}>
            <button type="button" data-subscribe="" onClick={cm.subscribe} style={ctaInk}>Subscribe · {price}/mo</button>
            <button type="button" onClick={cm.wlLeave} style={ctaLine}>Decline</button>
          </div>
        </React.Fragment>
      );
    } else if (wl) {
      inner = (
        <React.Fragment>
          <Kick col={pal.RUST}>On the waiting list</Kick>
          {/* A position we do not have is not position zero: a real place in line starts at 1. */}
          <div style={{ fontFamily: CPW_DISPLAY, fontSize: 20, fontWeight: 600, lineHeight: 1.2, margin: "7px 0 4px" }}>{typeof wl.position === "number" && isFinite(wl.position) && wl.position >= 1 ? `You're #${wl.position} in line.` : "You're on the list."}</div>
          <p style={bodyText}>{first} will invite you when a spot opens.</p>
          <button type="button" onClick={cm.wlLeave} style={{ ...ctaLine, width: "100%" }}>Leave the list</button>
        </React.Fragment>
      );
    } else if (cm.clientOf === true) {
      inner = (
        <div data-client-at-capacity="">
          <Kick col={pal.GREEN}>You're {first}'s client</Kick>
          <p style={bodyText}>{first} isn't taking new clients, and you're already one. Your coaching carries on, and anything {first} sells here is still yours to buy.</p>
          <button type="button" onClick={cm.openChat} style={{ ...ctaInk, width: "100%" }}>Message {first}</button>
        </div>
      );
    } else {
      inner = (
        <React.Fragment>
          <Kick col={pal.RUST}>At capacity</Kick>
          <p style={bodyText}>{first} isn't taking new clients right now. Join the waiting list to be first in line when a spot opens.</p>
          {!cm.provId ? <p style={{ margin: 0, fontSize: 13, color: ink(0.6) }}>We couldn't load the waiting list just now. Reload to try again.</p>
            : cm.acct === undefined ? null
              : cm.acct === null ? (
                <div data-waitlist-account="">
                  <p style={{ margin: 0, fontSize: 13, color: ink(0.7) }}>A Shape account holds your place on the list.</p>
                  <div className="cpw-pair" style={{ marginTop: 10 }}>
                    <a href={lvAccountHref("SignupClient")} data-account-join="" style={ctaInk}>Join Shape</a>
                    <a href={lvAccountHref("Login")} data-account-login="" style={ctaLine}>Sign in to join the list</a>
                  </div>
                </div>
              ) : cm.clientOf === undefined ? null
                : <button type="button" onClick={cm.wlJoin} style={{ ...ctaInk, width: "100%" }}>Join the waiting list</button>}
        </React.Fragment>
      );
    }
    return (
      <div data-at-capacity="" style={block}>
        {inner}
        {intro}
        {err(cm.wlErr)}
        {err(cm.buyErr)}
        {prompts}
      </div>
    );
  }
}

// ── {Name}'s day ─────────────────────────────────────────────────────────────────────────────
// The coach's week of open times and a day as it really is: open times you can take (a free intro
// call, booked on the booking page at that time) and busy time that says only that it is busy.
function CpwDayTab({ T, K, avail, listingState, introClosed, hoursHref, onRetry, bookHref, onWork }) {
  const { pal, ACC, INK, ink, first, words, nutri, isSelf, wide } = T;
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const [pick, setPick] = React.useState(cpwIso(today));
  const open = avail.kind === "ready" && !introClosed ? avail.open : [];
  const picked = days.find((d) => cpwIso(d) === pick) || days[0];
  const countOn = (d) => { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); return open.filter((x) => x.ms >= s && x.ms < e && x.ms > Date.now()).length; };
  const dayName = (d, o) => { try { return d.toLocaleDateString(undefined, o); } catch (e) { return ""; } };
  const isToday = cpwIso(picked) === cpwIso(today);
  const title = isToday ? `Today, ${dayName(picked, { weekday: "long" })}` : dayName(picked, { weekday: "long", month: "short", day: "numeric" });
  const fmt = (ms) => { try { return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
  const now = Date.now();
  const rows = avail.kind === "ready" ? K.bsCoachDayRows({ open, busy: avail.busy, day: picked, now }) : [];

  let body;
  if (listingState === "none") {
    body = <CpwHint ink={ink}>{isSelf ? "Your open times show here once your listing is set up." : `${first} has no open times on Shape yet. Send a message to ask.`}</CpwHint>;
  } else if (avail.kind === "loading" || listingState === "loading") {
    body = <CpwHint ink={ink}>Reading the week…</CpwHint>;
  } else if (avail.kind === "error" || listingState === "error") {
    body = <div><CpwHint ink={ink}>Couldn't read the open times just now.</CpwHint><button type="button" onClick={onRetry} style={cpwLink(ACC)}>Try again</button></div>;
  } else if (avail.kind !== "ready") {
    body = <CpwHint ink={ink}>{`${first} has no open times on Shape yet. Send a message to ask.`}</CpwHint>;
  } else if (!avail.hasHours) {
    body = isSelf
      ? <div><CpwHint ink={ink}>Members see no open times until you set your hours.</CpwHint><a href={hoursHref} style={cpwLink(ACC)}>Set your hours →</a></div>
      : <CpwHint ink={ink}>{`${first} hasn't set open hours yet. Send a message to find a time.`}</CpwHint>;
  } else if (!avail.zoneOk) {
    body = <CpwHint ink={ink}>{`${first}'s hours have no time zone yet, so no times can be booked.`}</CpwHint>;
  } else {
    body = (
      <React.Fragment>
        <h2 className="cpw-s21" style={{ margin: "24px 0 0", fontFamily: CPW_DISPLAY, fontWeight: 500, fontSize: 21, color: INK }}>{title}<span style={{ color: ACC }}>.</span></h2>
        <p data-day-sub="" style={{ margin: "2px 0 0", fontSize: 13.5, color: ink(0.64) }}>{avail.sample ? `Sample times: ${first} hasn't set open hours on Shape yet.` : `From ${first}'s Shape calendar. Busy time shows only as busy.`}</p>
        {introClosed ? <div style={{ marginTop: 12 }}><CpwHint ink={ink}>{`${first} is full right now. Join the waiting list to be first in line.`}</CpwHint><button type="button" onClick={onWork} style={cpwLink(ACC)}>{words.work} →</button></div> : null}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.length ? rows.map((r, i) => r.kind === "open" ? (
            // The coach's own page and a sample's show the times as members see them, but not to take.
            (bookHref && !isSelf && !avail.sample) ? (
              <a key={"o" + r.at} href={bookHref(r.slot.iso)} data-open-time="" style={{ minHeight: 58, padding: "8px 14px", border: `1.5px dashed ${ACC}`, color: INK, display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                <span style={{ width: 70, flex: "none", fontFamily: CPW_MONO, fontSize: 12, color: ink(0.7) }}>{fmt(r.at)}</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Open</span>
                  <span style={{ fontSize: 13, color: ink(0.74) }}>A free {avail.introMin}-minute intro call</span>
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: ACC, whiteSpace: "nowrap" }}>Take it →</span>
              </a>
            ) : (
              <div key={"o" + r.at} data-open-time="" style={{ minHeight: 58, padding: "8px 14px", border: `1.5px dashed ${ACC}`, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 70, flex: "none", fontFamily: CPW_MONO, fontSize: 12, color: ink(0.7) }}>{fmt(r.at)}</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Open</span>
                  <span style={{ fontSize: 13, color: ink(0.74) }}>A free {avail.introMin}-minute intro call</span>
                </span>
              </div>
            )
          ) : (
            <div key={"b" + i} data-busy-time="" style={{ minHeight: 50, padding: "8px 14px", background: pal.PAPER2, display: "flex", alignItems: "center", gap: 12, borderLeft: r.at <= now && (r.end || 0) > now ? `3px solid ${ACC}` : "3px solid transparent" }}>
              <span style={{ width: 70, flex: "none", fontFamily: CPW_MONO, fontSize: 12, color: ink(0.6) }}>{fmt(r.at)}</span>
              <span style={{ flex: 1, fontSize: 14.5, color: ink(0.78) }}>{r.kind === "away" ? "Away" : nutri ? "With a client" : "In a session"}</span>
              <span style={{ fontFamily: CPW_MONO, fontSize: 11, color: ink(0.5) }}>until {fmt(r.end)}</span>
            </div>
          )) : <CpwHint ink={ink}>{isToday && !introClosed ? "No open times left today. Pick another day above." : "No open times this day."}</CpwHint>}
        </div>
        {isSelf ? <a href={hoursHref} style={{ ...cpwLink(ACC), marginTop: 12 }}>Edit your hours →</a> : null}
      </React.Fragment>
    );
  }
  return (
    <section data-day-tab="" style={{ paddingTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={cpwEyebrow(ink)}>This week · open times</span>
        <span style={{ fontSize: 12, color: ink(0.6) }}>{wide ? "Pick a day" : "Tap a day"}</span>
      </div>
      <div role="group" aria-label="Days" className="cpw-days" style={{ marginTop: 8 }}>
        {days.map((d) => {
          const iso = cpwIso(d), on = iso === pick, n = avail.kind === "ready" ? countOn(d) : null;
          return (
            <button key={iso} type="button" aria-pressed={on} onClick={() => setPick(iso)} aria-label={`${dayName(d, { weekday: "short" })} ${d.getDate()}${n != null ? ", " + (n ? n + " open" : "none open") : ""}`}
              style={{ minHeight: wide ? 66 : 58, border: `1px solid ${on ? INK : ink(0.2)}`, background: on ? INK : "transparent", color: on ? pal.PAPER : INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, cursor: "pointer", padding: 0 }}>
              <span style={{ fontFamily: CPW_MONO, fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{dayName(d, { weekday: "short" })}</span>
              <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: wide ? 19 : 17, lineHeight: 1 }}>{d.getDate()}</span>
              <span style={{ fontSize: 9.5, color: on ? pal.PAPER : (n ? ACC : ink(0.4)) }}>{n == null ? " " : n ? `${n} open` : "off"}</span>
            </button>
          );
        })}
      </div>
      {body}
      {!isSelf ? (
        <button type="button" onClick={onWork} style={{ marginTop: 24, width: "100%", minHeight: 54, padding: "0 16px", border: `1px solid ${ink(0.22)}`, background: "transparent", color: INK, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: CPW_DISPLAY, fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
          Ways to work with {first}<span style={{ color: ACC }}>→</span>
        </button>
      ) : null}
    </section>
  );
}

// ── About me ─────────────────────────────────────────────────────────────────────────────────
function CpwAboutTab({ T, K, about, prompts, links, certs, onEdit }) {
  const { pal, ACC, INK, ink, first, isSelf } = T;
  const how = !about || !about.how ? null : about.how === "online" ? "Coaches online" : about.how === "in_person" ? "Coaches in person" : "Coaches online and in person";
  const facts = about ? [
    about.years ? `Coaching for ${about.years} ${about.years === 1 ? "year" : "years"}` : null,
    [how, about.where].filter(Boolean).join(" · ") || null,
    about.languages ? `Coaches in ${about.languages}` : null,
  ].filter(Boolean) : [];
  const socials = links ? K.BS_PROFILE_LINK_KEYS.map((k) => [k, links[k] ? K.bsProfileLinkHref(k, links[k]) : null]).filter(([, href]) => href) : [];
  const head = (text) => <h3 className="cpw-s10" style={{ margin: 0, fontFamily: CPW_MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ink(0.64) }}>{text}</h3>;
  const sections = [];
  if (about && about.story) sections.push(["story", 26, <React.Fragment>
    {head(`About ${first}`)}
    {about.story.split(/\n{2,}/).map((para, i) => <p key={i} style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.6, color: INK, whiteSpace: "pre-line", overflowWrap: "anywhere", maxWidth: 680 }}>{para}</p>)}
  </React.Fragment>]);
  if (facts.length) sections.push(["facts", sections.length ? 14 : 26, (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 680 }}>
      {facts.map((f, i) => <li key={i} style={{ padding: "11px 0", borderTop: `1px solid ${ink(0.14)}`, fontSize: 15, lineHeight: 1.4 }}>{f}</li>)}
    </ul>
  )]);
  if (prompts.length) sections.push(["qa", 26, <React.Fragment>
    {head(`In ${first}'s words`)}
    <div className="cpw-cards2" style={{ marginTop: 12, gap: 10 }}>
      {prompts.map((p, i) => (
        <div key={i} data-about-answer="" style={{ padding: "12px 14px", background: pal.PAPER2, borderLeft: `3px solid ${ACC}` }}>
          <div style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: ink(0.66) }}>{K.bsPromptLabel(p.q)}</div>
          <p style={{ margin: "6px 0 0", fontFamily: CPW_DISPLAY, fontSize: 16.5, lineHeight: 1.4, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{p.a}</p>
        </div>
      ))}
    </div>
  </React.Fragment>]);
  // Their credentials, as Shape checked them (the certificates they submitted, verified coaches only).
  if (certs.length) sections.push(["creds", 26, <React.Fragment>
    {head("Credentials")}
    <div style={{ marginTop: 8, maxWidth: 680 }}>
      {certs.map((c, i) => (
        <div key={i} data-cert="" style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, borderTop: `1px solid ${ink(0.14)}` }}>
          <span style={{ fontFamily: CPW_MONO, fontSize: 12, fontWeight: 700, minWidth: 92 }}>{c.abbr}</span>
          <span style={{ flex: 1, fontSize: 14, color: ink(0.78) }}>{c.year}</span>
          {c.verified ? <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: ACC }}>✓ Verified</span> : null}
        </div>
      ))}
    </div>
  </React.Fragment>]);
  if (socials.length) sections.push(["socials", 26, <React.Fragment>
    {head(`Find ${first} online`)}
    <div style={{ marginTop: 8, maxWidth: 680 }}>
      {socials.map(([k, href]) => (
        <a key={k} data-about-link={k} href={href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, borderTop: `1px solid ${ink(0.14)}`, color: INK, textDecoration: "none" }}>
          <span style={{ fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{CPW_LINK_NAMES[k] || k}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, color: ink(0.72) }}>{K.bsProfileLinkText(k, links[k])} <span aria-hidden="true" style={{ color: ACC }}>↗</span></span>
        </a>
      ))}
    </div>
  </React.Fragment>]);
  return (
    <section data-about-tab="" style={{ paddingTop: 20 }}>
      {sections.map(([k, gap, node], i) => <div key={k} data-about={k} style={{ marginTop: i ? gap : 0 }}>{node}</div>)}
      {isSelf ? (
        <React.Fragment>
          {!sections.length ? <CpwHint ink={ink}>Tell members who you are: your story, how you coach, and where to find you. Write About me in the Shape app, in Make it yours.</CpwHint> : null}
          {onEdit ? <button type="button" onClick={onEdit} style={{ ...cpwLink(ACC), marginTop: 16 }}>Edit your questions and links →</button> : null}
        </React.Fragment>
      ) : null}
    </section>
  );
}

// ── The studio ───────────────────────────────────────────────────────────────────────────────
// Their space as they drew it in the app (Make it yours → Your space): one SVG on the studio grid,
// its stations numbered and the pieces their programs use lit, each opening what they do there.
function CpwStudioPlan({ T, K, studio, work, onPiece }) {
  const { pal, ACC, ON_ACC, ink } = T;
  const [fx, fy, fw, fh] = [0, 0, K.BS_STUDIO_W, K.BS_STUDIO_H];
  const room = K.bsStudioRoom(studio.kind);
  const [rx, ry, rw, rh, style, radius] = room.room;
  const order = K.bsStudioDrawOrder(studio.items);
  const pieceName = (p) => (p.st && p.st.title) || p.label || p.tag || ((K.STUDIO_KIT[p.t] || [p.t])[0]);
  const door = (k) => (k === "entrance" ? "Entrance" : k === "garage" ? "Garage door" : "Door");
  let station = 0;
  const marks = studio.items.map((p, i) => {
    if (p.st) { station += 1; return { i, p, n: station }; }
    return work[i] && work[i].count && p.t !== "zone" ? { i, p, n: null, count: work[i].count } : null;
  }).filter(Boolean);
  return (
    <div data-studio-plan="" style={{ position: "relative", width: "100%", aspectRatio: `${fw} / ${fh}`, background: pal.PAPER2 }}>
      <svg viewBox={`${fx} ${fy} ${fw} ${fh}`} width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <rect x={rx} y={ry} width={rw} height={rh} rx={radius} fill="none" stroke={ink(0.26)} strokeWidth="1.5" strokeDasharray={style === "dashed" ? "5 5" : undefined} />
        {room.doors.map(([x, y, w, h, key, lx, ly], i) => (
          <g key={i}><rect x={x} y={y} width={w} height={h} fill={pal.PAPER2} /><text x={lx} y={ly + 9} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{door(key)}</text></g>
        ))}
        {order.map((i) => {
          const p = studio.items[i];
          const lit = !!p.st || !!(work[i] && work[i].count);
          return (
            <g key={i}>
              <image href={K.bsStudioSvg(p.t, p.w, p.h, { ink: pal.inkRGB, light: pal.isLight, accent: lit ? ACC : null })} x={p.x} y={p.y} width={p.w} height={p.h} />
              {p.tag ? <text x={p.x + 9} y={p.y + 17} fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="600" fill={ink(0.72)}>{p.tag}</text> : null}
              {p.label ? <text x={p.x} y={p.y + p.h + 12} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{p.label}</text> : null}
            </g>
          );
        })}
      </svg>
      {marks.filter((x) => !x.n).map(({ i, p, count }) => {
        const w = Math.max(p.w, 32 * fw / 344), h = Math.max(p.h, 32 * fw / 344);
        const x = p.x + p.w / 2 - w / 2, y = p.y + p.h / 2 - h / 2;
        return <button key={i} type="button" data-piece="" onClick={() => onPiece(i)} aria-label={`${pieceName(p)}: ${count} ${count === 1 ? "move" : "moves"} from the programs`}
          style={{ position: "absolute", left: `${((x - fx) / fw) * 100}%`, top: `${((y - fy) / fh) * 100}%`, width: `${(w / fw) * 100}%`, height: `${(h / fh) * 100}%`, padding: 0, border: 0, background: "transparent", cursor: "pointer" }} />;
      })}
      {marks.filter((x) => x.n).map(({ i, p, n }) => {
        const [sx, sy] = K.bsStudioSpot(p);
        return (
          <button key={i} type="button" data-station="" onClick={() => onPiece(i)} aria-label={`${n}. ${pieceName(p)}`}
            style={{ position: "absolute", left: `${((sx - fx) / fw) * 100}%`, top: `${((sy - fy) / fh) * 100}%`, width: 44, height: 44, margin: "-22px 0 0 -22px", padding: 0, border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <span style={{ width: 26, height: 26, borderRadius: 99, background: ACC, color: ON_ACC, display: "grid", placeItems: "center", fontFamily: CPW_MONO, fontSize: 12, fontWeight: 700, boxShadow: `0 0 0 4px ${cpwA(ACC, 0.22)}` }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}
function CpwGallery({ gallery }) {
  if (!gallery || !gallery.length) return null;
  return (
    <div className="cpw-gallery" data-gallery="" style={{ marginTop: 20 }}>
      {gallery.slice(0, 6).map((g, i) => <img key={i} src={g.url} alt={g.caption || ""} loading="lazy" style={{ width: "100%", objectFit: "cover", display: "block" }} />)}
    </div>
  );
}
function CpwStudioTab({ T, K, studio, gallery, work, onPiece }) {
  const { INK, ACC, ink, first, isSelf } = T;
  const stations = studio ? studio.items.map((p, i) => ({ p, i })).filter((x) => x.p.st) : [];
  const floor = [];
  if (studio) {
    const seen = new Map();
    studio.items.forEach((p, i) => {
      const w = work[i];
      if (p.st || p.t === "zone" || !w || !w.count) return;
      const key = `${p.t}|${p.label || ""}`;
      if (seen.has(key)) { seen.get(key).n += 1; return; }
      const row = { i, p, n: 1, w };
      seen.set(key, row); floor.push(row);
    });
    floor.sort((a, b) => b.w.count - a.w.count);
  }
  const moves = (w) => `${w ? w.count : 0} ${w && w.count === 1 ? "move" : "moves"}`;
  const pieceName = (p) => (p.st && p.st.title) || p.label || p.tag || ((K.STUDIO_KIT[p.t] || [p.t])[0]);
  return (
    <section data-studio-tab="" style={{ paddingTop: 20 }}>
      {studio ? (
        <React.Fragment>
          <span style={cpwEyebrow(ink, ACC)}>{CPW_KIND[studio.kind] || CPW_KIND.blank}</span>
          {studio.where ? <span style={{ display: "block", marginTop: 2, fontFamily: CPW_DISPLAY, fontWeight: 500, fontSize: 20 }}>{studio.where}<span style={{ color: ACC }}>.</span></span> : null}
          {stations.length || floor.length ? <p style={{ margin: "2px 0 0", fontSize: 14, color: ink(0.7) }}>{floor.length ? `Tap a number, or a lit piece, to see what ${first} does there.` : `Tap a number to see how ${first} coaches there.`}</p> : null}
          <div className="cpw-studio" style={{ marginTop: 14 }}>
            <CpwStudioPlan T={T} K={K} studio={studio} work={work} onPiece={onPiece} />
            <div>
              {stations.length ? (
                <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {stations.map(({ p, i }, n) => (
                    <li key={i}><button type="button" onClick={() => onPiece(i)} style={{ width: "100%", minHeight: 44, padding: 0, border: 0, borderBottom: `1px solid ${ink(0.11)}`, background: "transparent", color: INK, display: "flex", alignItems: "center", gap: 10, fontFamily: CPW_BODY, fontSize: 14.5, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ fontFamily: CPW_MONO, color: ACC }}>{n + 1}</span><span style={{ flex: 1, minWidth: 0 }}>{p.st.title}</span>
                      {work[i] && work[i].count ? <span style={{ flexShrink: 0, fontSize: 12, color: ink(0.55) }}>{moves(work[i])}</span> : null}
                    </button></li>
                  ))}
                </ol>
              ) : null}
              {floor.length ? (
                <div data-floor="" style={{ marginTop: 18 }}>
                  <span style={cpwEyebrow(ink)}>{first}'s workouts on the floor</span>
                  {floor.map(({ i, p, n, w }) => (
                    <button key={i} type="button" data-floor-row="" onClick={() => onPiece(i)} style={{ width: "100%", minHeight: 50, marginTop: 4, padding: "6px 0", border: 0, borderBottom: `1px solid ${ink(0.11)}`, background: "transparent", color: INK, display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: CPW_BODY }}>
                      <img src={K.bsStudioSvg(p.t, p.w, p.h, { ink: T.pal.inkRGB, light: T.pal.isLight, accent: ACC })} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                        <span style={{ fontSize: 14.5 }}>{pieceName(p)}{n > 1 ? <span style={{ color: ink(0.55) }}> ×{n}</span> : null}</span>
                        <span style={{ fontSize: 12.5, color: ink(0.6) }}>{moves(w)} · {w.programs.map((x) => x.name).join(", ")}</span>
                      </span>
                      <span aria-hidden="true" style={{ color: ACC }}>→</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </React.Fragment>
      ) : isSelf ? (
        <CpwHint ink={ink}>Draw where you coach in the Shape app (Make it yours → Your space): a private studio, a garage, a full gym or a park. Members tap your stations to see how you work.</CpwHint>
      ) : null}
      <CpwGallery gallery={gallery} />
    </section>
  );
}
function CpwPieceSheet({ T, K, studio, i, work, programs, onClose, onWork, onProgram }) {
  const { pal, ACC, INK, ink, first, words, isSelf } = T;
  const p = studio.items[i];
  const n = p.st ? studio.items.slice(0, i + 1).filter((q) => q.st).length : null;
  const kit = (K.STUDIO_KIT[p.t] || [p.t])[0];
  const name = (p.st && p.st.title) || p.label || p.tag || kit;
  const byId = new Map(programs.map((pr) => [pr.id, pr]));
  const pinned = work ? [...new Set(work.pinned)].map((id) => byId.get(id)).filter(Boolean) : [];
  const pinnedIds = new Set(pinned.map((pr) => pr.id));
  const movesOf = new Map(work ? work.programs.map((x) => [x.id, x.moves]) : []);
  const held = work ? work.programs.filter((x) => byId.has(x.id) && !pinnedIds.has(x.id)) : [];
  const progRow = (pr, moves, k) => (
    <button key={k} type="button" data-piece-program="" onClick={() => onProgram(pr)} style={{ width: "100%", minHeight: 48, padding: "9px 0", border: 0, borderTop: `1px solid ${ink(0.12)}`, background: "transparent", color: INK, display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: CPW_BODY }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
        <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 15 }}>{pr.name}{pr.video ? <span style={{ marginLeft: 6, fontFamily: CPW_MONO, fontSize: 10, color: ACC }}>▷</span> : null}</span>
        {moves && moves.length ? <span style={{ fontSize: 13, color: ink(0.68) }}>{moves.slice(0, 8).join(" · ")}{moves.length > 8 ? ` ＋${moves.length - 8}` : ""}</span> : null}
      </span>
      <span aria-hidden="true" style={{ color: ACC }}>→</span>
    </button>
  );
  return (
    <CpwSheet pal={pal} label={name} onClose={onClose}>
      <CpwSheetHead eyebrow={`${n ? n + " · " : ""}${kit}`} ACC={ACC} color={INK} onClose={onClose} />
      <div style={{ marginTop: 8, display: "grid", placeItems: "center", height: 130, background: pal.PAPER2 }}>
        <img src={K.bsStudioSvg(p.t, p.w, p.h, { ink: pal.inkRGB, light: pal.isLight, accent: ACC })} alt="" style={{ maxWidth: "70%", maxHeight: 104, width: p.w * 1.4, height: p.h * 1.4, objectFit: "contain" }} />
      </div>
      <h2 className="cpw-s21" style={{ margin: "12px 0 0", fontFamily: CPW_DISPLAY, fontWeight: 500, fontSize: 21, lineHeight: 1.15 }}>{name}</h2>
      {p.st && p.st.note ? <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.5, color: ink(0.86), whiteSpace: "pre-wrap" }}>{p.st.note}</p> : null}
      {pinned.length ? <div data-pinned="" style={{ marginTop: 16 }}><span style={cpwEyebrow(ink, ACC)}>Programs {first} runs here</span>{pinned.map((pr) => progRow(pr, movesOf.get(pr.id) || null, "pin-" + pr.id))}</div> : null}
      {held.length ? <div data-piece-moves="" style={{ marginTop: 16 }}><span style={cpwEyebrow(ink)}>In {first}'s programs, done here</span>{held.map((x) => progRow(byId.get(x.id), x.moves, "held-" + x.id))}</div> : null}
      {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: "100%", minHeight: 50, padding: "0 14px", border: `1px solid ${ink(0.22)}`, background: "transparent", color: INK, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{words.work}<span style={{ color: ACC }}>→</span></button> : null}
    </CpwSheet>
  );
}

// ── Her kitchen (a nutritionist's) ───────────────────────────────────────────────────────────
// Their own recipes, the plate they teach and their portion rules, and the staples always in their
// kitchen (profile_custom.kitchen, set in the app's Make it yours → Your kitchen), one part at a time.
const CPW_VEG = "#5fb16e", CPW_CARB = "#e3a544";
function cpwPlateColors(ACC, ink) {
  const same = (x) => String(ACC).toLowerCase() === x;
  return { veg: same(CPW_VEG) ? ink(0.4) : CPW_VEG, protein: ACC, carbs: same(CPW_CARB) || same("#c8881a") ? ink(0.4) : CPW_CARB };
}
const cpwRecipeMeta = (r) => [Number.isFinite(r.min) ? `${r.min} min` : null, Number.isFinite(r.kcal) ? `${r.kcal} kcal` : null, Number.isFinite(r.p) ? `${r.p} g protein` : null].filter(Boolean).join(" · ");
function CpwSwatch({ r, T, size = 76 }) {
  if (r.photo) return <img src={r.photo} alt="" style={{ flex: "none", width: size, height: size, objectFit: "cover" }} />;
  return <span aria-hidden="true" style={{ flex: "none", width: size, height: size, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${cpwA(T.ACC, 0.55)}, ${T.pal.PAPER2})`, color: T.INK, fontSize: size * 0.4, fontWeight: 600 }}>{String(r.t || "?").trim().charAt(0).toUpperCase()}</span>;
}
function CpwKitchenTab({ T, kitchen, gallery, onRecipe }) {
  const { pal, ACC, INK, ink, first, isSelf } = T;
  const plate = kitchen ? kitchen.plate : null;
  const rules = kitchen ? kitchen.rules : [];
  const staples = kitchen ? kitchen.staples : [];
  const recipes = kitchen ? kitchen.recipes : [];
  const count = { recipes: recipes.length, plate: plate || rules.length ? 1 : 0, staples: staples.length };
  const parts = [["recipes", "Recipes"], ["plate", "Plate"], ["staples", "Staples"]].filter(([k]) => isSelf || count[k] > 0);
  const [sec, setSec] = React.useState(null);
  const now = parts.some(([k]) => k === sec) ? sec : (parts[0] ? parts[0][0] : null);
  const colors = cpwPlateColors(ACC, ink);
  const part = { Veg: "Vegetables", Protein: "Protein", Carbs: "Carbs" };
  const inApp = (what) => <CpwHint ink={ink}>{what} Set it in the Shape app, in Make it yours → Your kitchen.</CpwHint>;
  const recipesPart = recipes.length ? (
    <div data-kitchen-recipes="" className="cpw-cards2" style={{ gap: 10 }}>
      {recipes.map((r) => (
        <button key={r.id} type="button" data-recipe={r.id} onClick={() => onRecipe(r)} style={{ width: "100%", padding: "10px 0 0", border: 0, borderTop: `1px solid ${ink(0.12)}`, background: "transparent", color: INK, display: "flex", gap: 12, alignItems: "stretch", textAlign: "left", cursor: "pointer", fontFamily: CPW_BODY }}>
          <CpwSwatch r={r} T={T} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, lineHeight: 1.35 }}>
            <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 16 }}>{r.t}</span>
            {cpwRecipeMeta(r) ? <span style={{ fontFamily: CPW_MONO, fontSize: 11, color: ink(0.62) }}>{cpwRecipeMeta(r)}</span> : null}
            {r.note ? <span style={{ fontSize: 14, color: ink(0.86) }}>{r.note}</span> : null}
            <span style={{ marginTop: 2, fontFamily: CPW_DISPLAY, fontSize: 13.5, fontWeight: 600, color: ACC }}>The recipe →</span>
          </span>
        </button>
      ))}
    </div>
  ) : isSelf ? inApp("Write the recipes you give clients.") : null;
  const platePart = plate || rules.length ? (
    <div data-kitchen-plate="">
      <span style={cpwEyebrow(ink, ACC)}>The plate {first} teaches</span>
      <div style={{ marginTop: 12, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
        {plate ? (
          <span aria-hidden="true" style={{ flex: "none", width: 150, height: 150, borderRadius: 99, background: `conic-gradient(${colors.veg} 0 ${plate.veg}%, ${colors.protein} ${plate.veg}% ${plate.veg + plate.protein}%, ${colors.carbs} ${plate.veg + plate.protein}% 100%)`, display: "grid", placeItems: "center", boxShadow: `0 0 0 6px ${pal.PAPER2}` }}>
            <span style={{ width: 54, height: 54, borderRadius: 99, background: pal.PAPER }} />
          </span>
        ) : null}
        <div style={{ flex: "1 1 200px", minWidth: 0, maxWidth: 320, display: "flex", flexDirection: "column", gap: 7 }}>
          {plate ? [["Veg", plate.veg, colors.veg], ["Protein", plate.protein, colors.protein], ["Carbs", plate.carbs, colors.carbs]].filter(([, v]) => v > 0).map(([k, v, c]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: c }} /><span style={{ flex: 1 }}>{part[k]}</span>
              <span style={{ fontFamily: CPW_MONO, fontSize: 12, color: ink(0.7) }}>{v}%</span>
            </span>
          )) : null}
        </div>
      </div>
      {rules.length ? <ul style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7, maxWidth: 680 }}>{rules.map((r, i) => <li key={i} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.45 }}><span aria-hidden="true" style={{ color: ACC, fontFamily: CPW_MONO }}>—</span>{r}</li>)}</ul> : null}
    </div>
  ) : isSelf ? inApp("Show members how you build a plate, and the portion rules you teach.") : null;
  const groups = { fridge: "Fridge", pantry: "Pantry", freezer: "Freezer" };
  const staplesPart = staples.length ? (
    <div data-kitchen-staples="">
      <span style={cpwEyebrow(ink)}>Always in the kitchen</span>
      <div className="cpw-cards2" style={{ marginTop: 12, gap: 10 }}>
        {Object.keys(groups).map((g) => {
          const inG = staples.filter((x) => x.g === g);
          if (!inG.length) return null;
          return (
            <div key={g} data-staple-group={g} style={{ padding: "12px 14px 14px", borderRadius: 14, background: pal.PAPER2 }}>
              <div style={{ fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600 }}>{groups[g]}<span style={{ marginLeft: 6, fontFamily: CPW_MONO, fontSize: 11, fontWeight: 400, color: ink(0.55) }}>{inG.length}</span></div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {inG.map((x) => <span key={x.n} data-staple="" style={{ minHeight: 34, padding: "0 13px", borderRadius: 999, display: "inline-flex", alignItems: "center", background: cpwA(ACC, 0.12), fontSize: 14 }}>{x.n}</span>)}
              </div>
            </div>
          );
        })}
      </div>
      {!isSelf ? <p style={{ margin: "10px 0 0", fontSize: 13, color: ink(0.62) }}>Add {first}'s staples to your grocery list in the Shape app.</p> : null}
    </div>
  ) : isSelf ? inApp("List what is always in your fridge, pantry and freezer.") : null;
  return (
    <section data-kitchen-tab="" style={{ paddingTop: 20 }}>
      {now ? (
        <React.Fragment>
          {parts.length > 1 ? (
            <div role="group" aria-label="In the kitchen" style={{ display: "flex", gap: 6, maxWidth: 520 }}>
              {parts.map(([k, label]) => { const on = k === now; return (
                <button key={k} type="button" data-kitchen-section={k} aria-pressed={on} onClick={() => setSec(k)} style={{ flex: 1, minHeight: 44, padding: "0 8px", border: `1px solid ${on ? ACC : ink(0.22)}`, background: on ? cpwA(ACC, 0.14) : "transparent", color: INK, fontFamily: CPW_DISPLAY, fontSize: 14, fontWeight: on ? 600 : 500, cursor: "pointer" }}>
                  {label}{k !== "plate" && count[k] ? <span style={{ marginLeft: 6, fontFamily: CPW_MONO, fontSize: 11, color: ink(0.6) }}>{count[k]}</span> : null}
                </button>
              ); })}
            </div>
          ) : now === "recipes" ? <span style={cpwEyebrow(ink, ACC)}>Recipes</span> : null}
          <div style={{ marginTop: parts.length > 1 || now === "recipes" ? 16 : 0 }}>{now === "recipes" ? recipesPart : now === "plate" ? platePart : staplesPart}</div>
        </React.Fragment>
      ) : null}
      <CpwGallery gallery={gallery} />
    </section>
  );
}
function CpwRecipeSheet({ T, r, onClose }) {
  const { pal, ACC, INK, ink, first } = T;
  return (
    <CpwSheet pal={pal} label={r.t} onClose={onClose} data={{ "data-recipe-sheet": "" }}>
      <CpwSheetHead eyebrow={`${first}'s kitchen`} ACC={ACC} color={INK} onClose={onClose} />
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
        <CpwSwatch r={r} T={T} size={84} />
        <div style={{ minWidth: 0 }}>
          <h2 className="cpw-s22" style={{ margin: 0, fontFamily: CPW_DISPLAY, fontWeight: 500, fontSize: 22, lineHeight: 1.15 }}>{r.t}<span style={{ color: ACC }}>.</span></h2>
          {cpwRecipeMeta(r) ? <div style={{ marginTop: 4, fontFamily: CPW_MONO, fontSize: 11, color: ink(0.62) }}>{cpwRecipeMeta(r)}{r.serves ? ` · serves ${r.serves}` : ""}</div> : null}
        </div>
      </div>
      {r.note ? <p style={{ margin: "14px 0 0", paddingLeft: 10, borderLeft: `3px solid ${ACC}`, fontSize: 15, lineHeight: 1.5 }}>{r.note}</p> : null}
      {Array.isArray(r.ing) && r.ing.length ? (
        <div style={{ marginTop: 16 }}>
          <span style={cpwEyebrow(ink)}>Ingredients</span>
          {r.ing.map((g, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${ink(0.12)}`, fontSize: 14.5 }}><span style={{ flex: 1 }}>{g.n}</span><span style={{ fontFamily: CPW_MONO, fontSize: 12, color: ink(0.7) }}>{g.m || g.q || ""}</span></div>)}
        </div>
      ) : null}
      {Array.isArray(r.steps) && r.steps.length ? (
        <ol style={{ margin: "16px 0 0", padding: 0, listStyle: "none" }}>
          <span style={cpwEyebrow(ink)}>Method</span>
          {r.steps.map((s, i) => <li key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${ink(0.12)}`, fontSize: 14.5, lineHeight: 1.5 }}><span style={{ fontFamily: CPW_MONO, color: ACC }}>{i + 1}</span><span>{s}</span></li>)}
        </ol>
      ) : null}
      <a href="/newdesign/GetApp.html" style={{ marginTop: 18, width: "100%", minHeight: 50, border: 0, background: ACC, color: T.ON_ACC, fontFamily: CPW_DISPLAY, fontSize: 15, fontWeight: 600, display: "grid", placeItems: "center", textDecoration: "none" }}>Cook it in the Shape app</a>
    </CpwSheet>
  );
}

// ── Plate notes ──────────────────────────────────────────────────────────────────────────────
function CpwPlateNotesTab({ T, days, onOpen }) {
  const { pal, ACC, INK, ink, first, isSelf } = T;
  const dayName = (day) => { if (!Number.isFinite(day.at)) return "A day of meals"; try { return new Date(day.at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); } catch (e) { return day.key; } };
  return (
    <section data-plates-tab="" style={{ paddingTop: 20 }}>
      <p style={{ margin: 0, fontSize: 14.5, color: ink(0.74) }}>Days of meals {first} logged and shared. Step through each one.</p>
      <div className="cpw-cards2" style={{ marginTop: 14, gap: 12 }}>
        {days.map((day) => (
          <button key={day.key} type="button" data-plate-day="" onClick={() => onOpen(day)} style={{ padding: "13px 15px", border: 0, borderTop: `2px solid ${ACC}`, background: pal.PAPER2, color: INK, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, fontFamily: CPW_BODY }}>
            <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: ink(0.64) }}>{day.meals.length} {day.meals.length === 1 ? "meal" : "meals"}</span>
            <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 18 }}>{dayName(day)}</span>
            <span style={{ fontSize: 13.5, color: ink(0.74) }}>{day.meals.map((m) => m.title).join(" · ")}</span>
            <span style={{ fontFamily: CPW_MONO, fontSize: 11, color: ink(0.62) }}>{[day.proteinAll ? `${day.protein} g protein` : null, day.kcal != null ? `${day.kcal} kcal` : null].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
      </div>
      {!days.length && isSelf ? <CpwHint ink={ink}>Share the meals you log, and each day you share becomes a plate note here.</CpwHint> : null}
    </section>
  );
}
function CpwPlateSheet({ T, K, day, i, setI, avatar, onClose, onWork }) {
  const { pal, ACC, first, isSelf } = T;
  const meals = day.meals;
  const at = Math.max(0, Math.min(meals.length - 1, i));
  const cur = meals[at] || {};
  const m = cur.meal || {};
  const muted = "rgba(232,235,239,0.6)";
  const fmt = (ms) => { try { return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
  let so = 0, known = true;
  for (const x of meals.slice(0, at + 1)) { const p = cpwNum(x.meal && x.meal.p); if (p == null) known = false; else so += p; }
  const split = K.energySplit(m);
  const amberAcc = ["#e3a544", "#c8881a"].includes(String(ACC).toLowerCase());
  const sc = { p: ACC, c: amberAcc ? "rgba(232,235,239,0.85)" : CPW_CARB, f: "rgba(232,235,239,0.4)" };
  const macros = [cpwNum(m.p) != null ? `${cpwNum(m.p)} g protein` : null, cpwNum(m.c) != null ? `${cpwNum(m.c)} g carbs` : null, cpwNum(m.f) != null ? `${cpwNum(m.f)} g fat` : null].filter(Boolean).join(" · ");
  return (
    <CpwSheet pal={pal} label="Plate notes" onClose={onClose} dark>
      <CpwSheetHead eyebrow={`Plate notes${Number.isFinite(day.at) ? " · " + new Date(day.at).toLocaleDateString(undefined, { weekday: "long" }) : ""}`} ACC={muted} color="#e8ebef" onClose={onClose} />
      <CpwSteps n={meals.length} at={at} setAt={setI} ACC={ACC} label={(k) => [meals[k].at ? fmt(meals[k].at) : "", meals[k].title].filter(Boolean).join(", ")} />
      <div data-plate-step="" style={{ marginTop: 14, padding: 14, background: "#181a1e", display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>{[cur.at ? fmt(cur.at) : "", cur.title].filter(Boolean).join(" · ")}</span>
          <span style={{ display: "block", marginTop: 6, fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 28 }}>{cpwNum(m.p) != null ? `${cpwNum(m.p)} g protein` : cpwNum(m.kcal) != null ? `${cpwNum(m.kcal)} kcal` : cur.title}</span>
          <span style={{ display: "block", marginTop: 4, fontFamily: CPW_MONO, fontSize: 11, color: muted }}>{[cpwNum(m.kcal) != null ? `${cpwNum(m.kcal)} kcal` : null, macros].filter(Boolean).join(" · ")}</span>
          {known ? <span data-protein-so-far="" style={{ display: "block", marginTop: 8, fontSize: 13 }}>Protein so far: {so} g</span> : null}
          {split ? <span aria-hidden="true" style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 11.5, color: muted }}>{[["p", "Protein"], ["c", "Carbs"], ["f", "Fat"]].map(([k, l]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: sc[k] }} />{l} {split[k]}%</span>)}</span> : null}
        </div>
        {split ? <span role="img" aria-label={`Energy: ${split.p}% protein, ${split.c}% carbs, ${split.f}% fat`} style={{ flex: "none", width: 74, height: 74, borderRadius: 99, background: `conic-gradient(${sc.p} 0 ${split.p}%, ${sc.c} ${split.p}% ${split.p + split.c}%, ${sc.f} ${split.p + split.c}% 100%)`, display: "grid", placeItems: "center" }}><span style={{ width: 30, height: 30, borderRadius: 99, background: "#181a1e" }} /></span> : null}
      </div>
      {cur.body ? <CpwNote avatar={avatar} first={first} ACC={ACC}>{cur.body}</CpwNote> : null}
      <CpwPrevNext at={at} n={meals.length} setAt={setI} />
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(232,235,239,0.15)" }}>
        <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>{meals.length} {meals.length === 1 ? "meal" : "meals"}</span>
        {meals.map((x, k) => (
          <button key={k} type="button" onClick={() => setI(k)} style={{ width: "100%", display: "flex", gap: 12, padding: "10px 0", border: 0, borderBottom: "1px solid rgba(232,235,239,0.1)", background: "transparent", color: k === at ? "#e8ebef" : "rgba(232,235,239,0.75)", fontFamily: CPW_BODY, fontSize: 14, textAlign: "left", cursor: "pointer" }}>
            <span style={{ width: 70, flex: "none", fontFamily: CPW_MONO, fontSize: 12 }}>{x.at ? fmt(x.at) : ""}</span><span style={{ flex: 1 }}>{x.title}</span><span style={{ fontFamily: CPW_MONO, fontSize: 12 }}>{cpwNum(x.meal && x.meal.p) != null ? `${cpwNum(x.meal.p)} g` : ""}</span>
          </button>
        ))}
        {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: "100%", minHeight: 50, border: 0, background: ACC, color: T.ON_ACC, fontFamily: CPW_BODY, fontWeight: 600, cursor: "pointer" }}>Get notes like these on your meals</button> : null}
      </div>
    </CpwSheet>
  );
}

// ── Replays ──────────────────────────────────────────────────────────────────────────────────
// Their work in three parts: the programs they sell (each with the one video its public preview
// gives free, its weeks, its first week and Buy), the workouts they posted on video, and the
// sessions they logged, stepped set by set with their note.
const cpwProgramMeta = (pr) => [pr.weeks ? `${pr.weeks} ${pr.weeks === 1 ? "week" : "weeks"}` : null, pr.perWeek ? `${pr.perWeek} ${pr.perWeek === 1 ? "day" : "days"} a week` : null].filter(Boolean).join(" · ");
const cpwProgramDays = (pr) => {
  const p = pr.preview;
  if (!p || !Array.isArray(p.units) || !(p.kind === "program" || p.kind === "split")) return "";
  return p.units.filter((u) => !u.rest).slice(0, 7).map((u) => [u.label, u.title].filter(Boolean).join(" ")).join(" · ");
};
function CpwReplaysTab({ T, programs, workouts, replays, onProgram, onOpen }) {
  const { pal, ACC, ON_ACC, INK, ink, first, isSelf } = T;
  const head = (label) => <span style={{ ...cpwEyebrow(ink), marginTop: 26, marginBottom: 12 }}>{label}</span>;
  const card = { padding: 0, border: 0, background: "transparent", color: INK, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, fontFamily: CPW_BODY };
  const badge = { position: "absolute", right: 10, top: 10, padding: "2px 8px", background: "rgba(0,0,0,0.55)", color: "#fff", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.08em" };
  return (
    <section data-replays-tab="" style={{ paddingTop: 20 }}>
      <p style={{ margin: 0, fontSize: 14.5, color: ink(0.74) }}>The programs {first} sells, workouts on video, and sessions stepped set by set.</p>
      {programs.length ? (
        <div data-programs="">
          {head("Programs")}
          <div className="cpw-cards2">
            {programs.map((pr) => (
              <button key={pr.id} type="button" data-program="" onClick={() => onProgram(pr)} style={card}>
                <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", background: `linear-gradient(135deg, ${pal.PAPER2}, ${cpwA(ACC, 0.22)})` }}>
                  {pr.poster ? <img src={pr.poster} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    : pr.video ? <CpwStill url={pr.video.url} ACC={ACC} />
                      : <span style={{ position: "absolute", left: 14, right: 14, bottom: 12, fontFamily: CPW_DISPLAY, fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>{pr.weeks ? `${pr.weeks} weeks` : `${pr.moves.length} moves`}</span>}
                  {pr.video ? cpwPlay(ACC) : null}
                  {pr.price ? <span style={{ position: "absolute", right: 10, top: 10, padding: "3px 9px", background: ACC, color: ON_ACC, fontFamily: CPW_MONO, fontSize: 11, fontWeight: 700 }}>{pr.price}</span> : null}
                </span>
                <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                  <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 17 }}>{pr.name}</span>
                  {cpwProgramMeta(pr) || pr.video ? <span style={{ fontSize: 13, color: ink(0.62) }}>{[cpwProgramMeta(pr), pr.video ? "Preview video" : null].filter(Boolean).join(" · ")}</span> : null}
                  {cpwProgramDays(pr) ? <span style={{ marginTop: 2, fontFamily: CPW_MONO, fontSize: 11, letterSpacing: "0.04em", color: ink(0.72) }}>{cpwProgramDays(pr)}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : isSelf ? <CpwHint ink={ink}>Publish a program and it shows here with its preview video, for members to buy.</CpwHint> : null}
      {workouts.length ? (
        <div data-workouts="">
          {head("Workouts")}
          <div className="cpw-cards2">
            {workouts.map((w) => (
              <button key={w.key} type="button" data-workout="" onClick={() => onOpen(w)} style={card}>
                <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", background: "#000" }}>
                  <CpwStill url={w.video.url} ACC={ACC} />{cpwPlay(ACC)}
                  {w.ago ? <span style={badge}>{w.ago}</span> : null}
                </span>
                <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                  <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 17 }}>{w.title || "Workout video"}</span>
                  {w.body ? <span style={{ fontSize: 13, color: ink(0.62), display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.body}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {replays.length ? (
        <div data-sessions="">
          {programs.length || workouts.length ? head("Sessions") : <div style={{ height: 14 }} />}
          <div className="cpw-cards2">
            {replays.map((r) => {
              const stats = (Array.isArray(r.stats) && r.stats.length ? r.stats : Array.isArray(r.statsRow) ? r.statsRow : []).slice(0, 2).map((s) => (Array.isArray(s) ? `${s[1]}` : "")).filter(Boolean);
              return (
                <button key={r.key} type="button" data-replay="" onClick={() => onOpen(r)} style={card}>
                  <span style={{ position: "relative", display: "block", width: "100%", height: r.photo ? 200 : 120, overflow: "hidden", background: r.photo ? "#000" : pal.PAPER2 }}>
                    {r.photo ? <img src={r.photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : (
                      <span style={{ position: "absolute", left: 14, bottom: 12, display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontFamily: CPW_DISPLAY, fontSize: 30, fontWeight: 600 }}>{r.breakdown.rows.length}</span>
                        <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: ink(0.6) }}>{r.breakdown.label}</span>
                      </span>
                    )}
                    {r.ago ? <span style={badge}>{r.ago}</span> : null}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                    <span style={{ fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 17 }}>{r.title}</span>
                    {stats.length ? <span style={{ fontSize: 13, color: ink(0.6) }}>{stats.join(" · ")}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {isSelf && !workouts.length && !replays.length ? <CpwHint ink={ink}>Log a session and share it, and it shows here with every set.</CpwHint> : null}
    </section>
  );
}
function CpwProgramSheet({ T, K, pr, studio, work, sells, onClose, onBuy, onWork }) {
  const { pal, ACC, ON_ACC, first, isSelf } = T;
  const muted = "rgba(232,235,239,0.6)";
  const p = pr.preview || { units: [], kind: null };
  const units = Array.isArray(p.units) ? p.units.filter((u) => u && !u.locked && !u.rest) : [];
  const pieceName = (q) => (q.st && q.st.title) || q.label || q.tag || ((K.STUDIO_KIT[q.t] || [q.t])[0]);
  const where = studio ? [...new Set(studio.items.map((q, k) => (q.t !== "zone" && work[k] && work[k].programs.some((x) => x.id === pr.id) ? pieceName(q) : null)).filter(Boolean))].slice(0, 8) : [];
  const meta = cpwProgramMeta(pr);
  const line = { width: "100%", minHeight: 50, border: "1px solid rgba(232,235,239,0.25)", background: "transparent", color: "#e8ebef", fontFamily: CPW_BODY, fontWeight: 600, cursor: "pointer" };
  return (
    <CpwSheet pal={pal} label={pr.name} onClose={onClose} dark width={640} data={{ "data-program-sheet": "" }}>
      <CpwSheetHead eyebrow={`Program${pr.price ? " · " + pr.price : ""}`} ACC={muted} color="#e8ebef" onClose={onClose} />
      <h2 className="cpw-s26" style={{ margin: 0, fontFamily: CPW_DISPLAY, fontWeight: 300, fontSize: 26, lineHeight: 1.1 }}>{pr.name}<span style={{ color: ACC }}>.</span></h2>
      {meta ? <p style={{ margin: "4px 0 0", fontSize: 13.5, color: muted }}>{meta}</p> : null}
      {pr.video ? <div data-program-video="" style={{ marginTop: 12 }}><CpwVideo url={pr.video.url} title={pr.name} /></div>
        : pr.poster ? <div style={{ marginTop: 12, aspectRatio: "16 / 9", overflow: "hidden", background: "#000" }}><img src={pr.poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div> : null}
      {units.length ? (
        <div style={{ marginTop: 14 }}>
          <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>{p.kind === "program" || p.kind === "split" ? "The first week" : "The moves"}</span>
          {units.slice(0, 14).map((u, k) => (
            <div key={k} data-program-day="" style={{ padding: "9px 0", borderBottom: "1px solid rgba(232,235,239,0.1)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                {u.label ? <span style={{ flexShrink: 0, minWidth: 40, fontFamily: CPW_MONO, fontSize: 10.5, letterSpacing: "0.08em", color: ACC }}>{u.label}</span> : null}
                <span style={{ fontSize: 15 }}>{u.title}</span>
              </div>
              {Array.isArray(u.moves) && u.moves.length ? <div style={{ marginTop: 3, paddingLeft: u.label ? 50 : 0, fontSize: 13, lineHeight: 1.45, color: "rgba(232,235,239,0.72)" }}>{u.moves.concat(u.more > 0 ? [`＋${u.more}`] : []).join(" · ")}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      {p.namesOnly ? <p style={{ margin: "10px 0 0", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: muted }}>Sets, loads, cues and exercise videos unlock when you buy</p> : null}
      {p.note ? <p style={{ margin: "12px 0 0", paddingLeft: 10, borderLeft: `3px solid ${ACC}`, fontSize: 14.5, lineHeight: 1.5 }}>{p.note}</p> : null}
      {where.length ? <div data-program-where="" style={{ marginTop: 14 }}><span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>On {first}'s floor</span><p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5 }}>{where.join(" · ")}</p></div> : null}
      <div style={{ marginTop: 20 }}>
        {isSelf ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: muted }}>This is what members see before they buy.</p>
          : pr.sample ? <button type="button" onClick={onWork} style={line}>Work with {first}</button>
            : pr.paid && sells ? <button type="button" data-program-buy="" onClick={onBuy} style={{ ...line, border: 0, background: ACC, color: ON_ACC, fontWeight: 700 }}>Buy · {pr.price} →</button>
              : <button type="button" onClick={onWork} style={line}>Work with {first}</button>}
        {!isSelf && !pr.sample && pr.paid && sells ? <div style={{ marginTop: 8 }}><LvCodeBox ink="#e8ebef" /></div> : null}
      </div>
    </CpwSheet>
  );
}
function CpwReplaySheet({ T, r, i, setI, avatar, onClose, onWork }) {
  const { pal, ACC, ON_ACC, first, isSelf } = T;
  const rows = r.breakdown && Array.isArray(r.breakdown.rows) ? r.breakdown.rows : [];
  const video = r.video && typeof r.video === "object" ? r.video.url : typeof r.video === "string" ? r.video : null;
  const at = Math.max(0, Math.min(rows.length - 1, i));
  const cur = rows[at] || [];
  const muted = "rgba(232,235,239,0.6)";
  return (
    <CpwSheet pal={pal} label={r.title} onClose={onClose} dark width={640} data={{ "data-replay-sheet": "" }}>
      <CpwSheetHead eyebrow={[rows.length ? "Replay" : "Workout", r.typeLabel, r.ago].filter(Boolean).join(" · ")} ACC={muted} color="#e8ebef" onClose={onClose} />
      <h2 className="cpw-s26" style={{ margin: 0, fontFamily: CPW_DISPLAY, fontWeight: 300, fontSize: 26, lineHeight: 1.1 }}>{r.title}<span style={{ color: ACC }}>.</span></h2>
      {video ? <div data-replay-video="" style={{ marginTop: 12 }}><CpwVideo url={video} title={r.title} /></div>
        : r.photo ? <div style={{ marginTop: 12, height: 240, overflow: "hidden", background: "#000" }}><img src={r.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div> : null}
      {rows.length ? <CpwSteps n={rows.length} at={at} setAt={setI} ACC={ACC} label={(k) => `${rows[k][0]}, ${rows[k][1]}`} /> : null}
      {rows.length ? (
        <div style={{ marginTop: 14, padding: 14, background: "#181a1e" }}>
          <span style={{ display: "block", fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: at === rows.length - 1 ? ACC : muted }}>{cur[0]}</span>
          <span style={{ display: "block", marginTop: 6, fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 32 }}>{cur[1]}</span>
          {cur[2] ? <span style={{ display: "block", marginTop: 4, fontFamily: CPW_MONO, fontSize: 11, color: muted }}>{cur[2]}</span> : null}
        </div>
      ) : null}
      {r.body ? <CpwNote avatar={avatar} first={first} ACC={ACC}>{r.body}</CpwNote> : null}
      {rows.length ? <CpwPrevNext at={at} n={rows.length} setAt={setI} /> : null}
      <div style={{ marginTop: 20, paddingTop: rows.length ? 14 : 0, borderTop: rows.length ? "1px solid rgba(232,235,239,0.15)" : 0 }}>
        {rows.length ? <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>{r.breakdown.label}</span> : null}
        {rows.map((row, k) => (
          <button key={k} type="button" onClick={() => setI(k)} style={{ width: "100%", display: "flex", gap: 12, padding: "10px 0", border: 0, borderBottom: "1px solid rgba(232,235,239,0.1)", background: "transparent", color: k === at ? "#e8ebef" : "rgba(232,235,239,0.75)", fontFamily: CPW_BODY, fontSize: 14, textAlign: "left", cursor: "pointer" }}>
            <span style={{ flex: 1 }}>{row[0]}</span><span style={{ fontFamily: CPW_MONO, fontSize: 12 }}>{row[1]}</span>
          </button>
        ))}
        {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: "100%", minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: CPW_BODY, fontWeight: 600, cursor: "pointer" }}>Get notes like these on your sessions</button> : null}
      </div>
    </CpwSheet>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────────────────────
// What they posted that the other tabs don't show (notes, photos, links, their own runs), newest
// first. On their own page, Log activity opens the composer.
function CpwActivityTab({ T, cards }) {
  const { pal, ACC, INK, ink, first, isSelf } = T;
  return (
    <section data-activity="" style={{ paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={cpwEyebrow(ink)}>{first}'s activity</span>
        {isSelf ? <button type="button" data-log-activity="" onClick={() => { if (typeof lvComposePost === "function") lvComposePost(); }} style={{ ...cpwLink(ACC), marginTop: 0, minHeight: 44 }}>＋ Log activity</button> : null}
      </div>
      {cards.length ? cards.slice(0, 30).map((a, i) => {
        const stats = (Array.isArray(a.stats) && a.stats.length ? a.stats : Array.isArray(a.statsRow) ? a.statsRow : []).slice(0, 3);
        return (
          <article key={a.key || i} data-activity-card="" style={{ padding: "16px 0", borderTop: `1px solid ${ink(0.12)}`, maxWidth: 720 }}>
            <span style={{ fontFamily: CPW_MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: ACC }}>{[a.typeLabel, a.ago].filter(Boolean).join(" · ")}</span>
            {a.title ? <span style={{ display: "block", marginTop: 4, fontFamily: CPW_DISPLAY, fontWeight: 600, fontSize: 18 }}>{a.title}</span> : null}
            {a.body ? <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.5, color: ink(0.8), whiteSpace: "pre-wrap" }}>{a.body}</p> : null}
            {a.photo ? <img src={a.photo} alt={a.title || "Post photo"} loading="lazy" style={{ display: "block", width: "100%", maxHeight: 420, aspectRatio: "4 / 3", objectFit: "cover", marginTop: 10, background: pal.PAPER2 }} /> : null}
            {a.video ? <a href={typeof a.video === "string" ? a.video : a.video.url} target="_blank" rel="noopener noreferrer" style={{ ...cpwLink(ACC), marginTop: 8 }}>▶ Watch</a> : null}
            {a.link && a.link.url ? <a href={a.link.url} target="_blank" rel="noopener noreferrer" style={{ ...cpwLink(ACC), marginTop: 8 }}>↗ {a.link.title || "Open link"}</a> : null}
            {stats.length ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 480 }}>
                {stats.map((s, k) => <div key={k} style={{ flex: 1, padding: "9px 6px", textAlign: "center", background: pal.PAPER2 }}><div style={{ fontFamily: CPW_DISPLAY, fontSize: 16, fontWeight: 600 }}>{s[1]}</div><div style={{ fontFamily: CPW_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ink(0.5), marginTop: 3 }}>{s[0]}</div></div>)}
              </div>
            ) : null}
          </article>
        );
      }) : <CpwHint ink={ink}>Nothing posted yet. Log a run, a note or a photo, and members see it here.</CpwHint>}
    </section>
  );
}

// ── What clients say ─────────────────────────────────────────────────────────────────────────
function CpwReviewsStrip({ T, quotes, revLocked, ratingBit, onAll }) {
  const { pal, ACC, INK, ink } = T;
  if (revLocked) {
    return (
      <section data-reviews-strip="" data-reviews-locked="" aria-label="Reviews" style={{ margin: "8px 0 20px" }}>
        <span style={cpwEyebrow(ink)}>What clients say</span>
        <div style={{ marginTop: 8, padding: "13px 15px", background: pal.PAPER2, borderTop: `2px solid ${ACC}`, display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
          <span style={{ fontFamily: CPW_MONO, fontSize: 11, color: ACC }}>★ {ratingBit}</span>
          <span style={{ fontSize: 15, lineHeight: 1.45 }}>Members read the reviews.</span>
          <button type="button" data-reviews-join="" onClick={() => { if (window.ShapeMembership && window.ShapeMembership.start) window.ShapeMembership.start(); else window.location.href = "/newdesign/Pricing.html"; }} style={{ alignSelf: "flex-start", minHeight: 40, padding: 0, border: 0, background: "transparent", color: ACC, fontFamily: CPW_DISPLAY, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Join to read them →</button>
        </div>
      </section>
    );
  }
  if (!quotes.length) return <div style={{ height: 8 }} />;
  return (
    <section data-reviews-strip="" aria-label="Reviews" style={{ margin: "8px 0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={cpwEyebrow(ink)}>What clients say</span>
        <button type="button" data-all-reviews="" onClick={onAll} style={{ minHeight: 36, padding: 0, border: 0, background: "transparent", color: ACC, fontFamily: CPW_DISPLAY, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>All reviews →</button>
      </div>
      <div className="cpw-quotes" style={{ marginTop: 8 }}>
        {quotes.map((r) => (
          <figure key={r.id || r.text} data-review-card="" style={{ margin: 0, boxSizing: "border-box", padding: "13px 15px", background: pal.PAPER2, borderTop: `2px solid ${ACC}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: CPW_MONO, fontSize: 11, color: ACC }}>★ {Math.round(Number(r.rating) || 0)}/10{r.pinned ? " · Pinned" : ""}</span>
            <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: INK, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.text}</blockquote>
            <figcaption style={{ fontSize: 12.5, color: ink(0.64) }}>{r.authorId ? <a href={"MemberProfile.html?u=" + encodeURIComponent(r.authorId)} style={{ color: "inherit" }}>{r.author || "Member"}</a> : (r.author || "Member")}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
// All reviews, and the form a member who subscribed or had a session leaves one with (1–10). The
// server decides who may, and says so; the form and its rules are useLvCoachCommerce's.
function CpwReviewsSheet({ T, reviews, revLocked, ratingBit, cm, canReview, onClose }) {
  const { pal, ACC, INK, ink } = T;
  return (
    <CpwSheet pal={pal} label="Reviews" onClose={onClose} data={{ "data-reviews-sheet": "" }}>
      <CpwSheetHead title="Reviews" ACC={ACC} color={INK} onClose={onClose} />
      {reviews.count > 0 ? <p style={{ margin: "2px 0 8px", fontSize: 13.5, color: ink(0.64) }}>{ratingBit}</p> : null}
      {canReview ? (
        <div data-review-form="" style={{ padding: "8px 0 14px", borderBottom: `1px solid ${ink(0.12)}` }}>
          <span style={cpwEyebrow(ink)}>Your rating</span>
          <div role="radiogroup" aria-label="Your rating, 1 to 10" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, margin: "6px 0 10px" }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={cm.revRating === n} aria-label={`${n} of 10`} onClick={() => { cm.setRevRating(n); cm.setRevMsg(""); }}
                style={{ background: "transparent", border: 0, cursor: "pointer", padding: "0 1px", minWidth: 28, minHeight: 36, fontSize: 21, lineHeight: 1, color: n <= cm.revRating ? ACC : ink(0.25) }}>★</button>
            ))}
            {cm.revRating ? <span style={{ marginLeft: 6, fontFamily: CPW_MONO, fontSize: 11 }}>{cm.revRating}/10</span> : null}
          </div>
          <textarea value={cm.revText} onChange={(e) => cm.setRevText(e.target.value)} maxLength={800} rows={3} placeholder="Share how it went…" aria-label="Your review"
            style={{ width: "100%", boxSizing: "border-box", background: "transparent", color: INK, border: `1px solid ${ink(0.22)}`, padding: 10, fontFamily: CPW_BODY, fontSize: 15, resize: "vertical", outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
            <span role="status" style={{ fontSize: 13, color: ink(0.68) }}>{cm.revMsg}</span>
            <button type="button" onClick={cm.postReview} disabled={!cm.revRating || cm.revBusy || !(cm.prow && cm.prow.name)}
              style={{ flex: "none", minHeight: 42, padding: "0 16px", background: cm.revRating ? INK : ink(0.08), color: cm.revRating ? pal.PAPER : ink(0.45), border: 0, cursor: cm.revRating && !cm.revBusy ? "pointer" : "default", fontFamily: CPW_MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {cm.revBusy ? "Posting…" : "Post review"}
            </button>
          </div>
        </div>
      ) : null}
      {revLocked ? (
        <div data-reviews-locked="" style={{ padding: "12px 0", borderTop: `1px solid ${ink(0.12)}` }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Members read the reviews.</p>
          <a href="/newdesign/Pricing.html" data-reviews-join="" style={{ ...cpwLink(ACC) }}>Join to read them →</a>
        </div>
      ) : reviews.list.length ? reviews.list.slice(0, 40).map((r) => (
        <div key={r.id || r.text} style={{ padding: "12px 0", borderTop: `1px solid ${ink(0.12)}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}><span style={{ fontWeight: 600 }}>{r.author || "Member"}</span><span style={{ fontFamily: CPW_MONO, fontSize: 11, color: ink(0.7) }}>★ {Math.round(Number(r.rating) || 0)}/10</span></div>
          {r.text ? <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.5 }}>{r.text}</p> : null}
        </div>
      )) : reviews.unread ? null : <p style={{ margin: "10px 0 0", fontSize: 14, color: ink(0.64) }}>No reviews yet</p>}
    </CpwSheet>
  );
}

Object.assign(window, { WebCoachProfile });
