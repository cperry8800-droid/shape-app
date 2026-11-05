// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SHAPE · the Coaches page: the coach marketplace
// ───────────────────────────────────────────────────────────────────────────────────────────────
// Owner, 2026-11-05: "The marketplace is awesome. Right now I have the website set up as coaches page
// marketing towards them, but what you designed makes much more sense. So lets change that whole
// concept and turn coaches page into what you built. The coach marketplace cards are also perfect."
// So Coaches.html is this page, and the coaches' own pitch moved to ForCoaches.html (coaches.jsx,
// unchanged). Marketplace.html forwards here and keeps its #trainers / #nutritionists hash.
//
//   The fold       "What are you training for?": six goals, and one matcher bar (goal · budget · how
//                  you meet · city · Find my coach) over the homepage's Climb terrain. The summit plate
//                  holds the number of coaches you can book right now.
//   Trust band     only what the product does: the vetting at sign-up, the Verified badge, coaches'
//                  own rates, a free intro first, the $5 membership that can be cancelled any time.
//   Editors' picks the featured listings, filled out with labelled example coaches.
//   The results    a filter rail with live counts (a bottom sheet on a phone), the cards in three
//                  groups (on Shape · example coaches · listed, not bookable yet), Compare (up to 3)
//                  with its tray, and the quick view: the coach's page, condensed.
//
// The card is a miniature of the coach's own page (the Climb profile): a cover with Shape's contour
// lines and a route climbing to a summit plate that holds the rating, the portrait in the prism frame
// in the role colour (trainer rust, nutritionist gold), Doto figures on chamfered instrument plates,
// and "Book a free intro". The quick view is the same object, larger.
//
// ⚠ THE HONESTY RULES (the 2026-11-04 audit of the old page, each one a defect it shipped):
//   · A listing is rated by its reviews or not at all. The old `rating || 4.8` fallback put 9.6/10 on
//     every seeded listing. An unrated coach reads "New · no reviews yet".
//   · Only a coach with a Shape account can take a booking. A seeded listing says "Not bookable yet"
//     and is left out of the match count; the sample coaches are labelled "Example coaches".
//   · Every listing goes through the same goals, specialties and filters as the sample coaches (the
//     old page let live rows skip every filter but search, so "Hyrox" showed 20 unrelated coaches).
//   · Tier, price unit and rating each come from ONE function here: mkCoachTier, mkPriceOf, mkRating10.
//     A nutritionist is priced per month.
//   · A boost is never ranked higher. /api/lead-boosts says a boost is active for a role but not whose
//     it is, so nothing on this page can label the right coach and nothing is labelled.
//   · Review words are for members (owner, 2026-10-28): the quick view shows the average and the count.
//   · No "Updated hourly", no performance claims, no Featured City.
//
// Globals read at call time (Babel scripts): React, ReactDOM, Header, Footer (pageShell.jsx),
// shapeEnsureDb (pageShell.jsx), ShapeListingLib (listingMedia.mjs), BookingSlots (bookingSlots.js),
// __openChat (chatWidget.jsx).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const { useState: useS, useMemo: useM, useEffect: useE, useRef: useR } = React;

const MK_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Drawing: the Climb's ridges, contours and routes, from one seeded generator ─────────────────
function mkRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mkHash(s) { let h = 2166136261; const str = String(s || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const mkF1 = (n) => Math.round(n * 10) / 10;
function mkRidge(W, step, base, waves, bump) {
  const pts = [];
  for (let x = -step; x <= W + step; x += step) {
    let y = base;
    for (const [a, per, ph] of waves) y += a * Math.sin((2 * Math.PI * x) / per + ph);
    if (bump) y -= bump.h * Math.exp(-(((x - bump.x) / bump.w) ** 2));
    pts.push([x, y]);
  }
  return pts;
}
function mkYAt(pts, x) {
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * ((x - x0) / (x1 - x0)); }
  return pts[pts.length - 1][1];
}
function mkThrough(pts, x, y) { const d = y - mkYAt(pts, x); return pts.map(([a, b]) => [a, b + d]); }
const mkD = (pts) => "M" + pts.map(([x, y]) => mkF1(x) + " " + mkF1(y)).join("L");
const mkFillD = (pts, H) => mkD(pts) + "L" + mkF1(pts[pts.length - 1][0]) + " " + (H + 4) + "L" + mkF1(pts[0][0]) + " " + (H + 4) + "Z";
function mkRoute(x0, y0, x1, y1, step, jag, seed) {
  const r = mkRng(seed); const pts = [];
  const n = Math.max(2, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n; const e = t * t * (3 - 2 * t) * 0.55 + t * 0.45;
    let y = y0 + (y1 - y0) * e;
    if (i > 0 && i < n) y += (r() - 0.5) * jag * 2 + Math.sin(t * 9 + seed) * jag * 0.6;
    pts.push([x0 + (x1 - x0) * t, y]);
  }
  return pts;
}

// The fold's terrain, drawn once: 1440 × 660, anchored bottom-right so the summit stays put.
const MK_HERO = (() => {
  const W = 1440, H = 660, SX = 1150, SY = 318;
  const back = [];
  for (let k = 0; k < 9; k++) back.push({ d: mkD(mkRidge(W, 12, 236 + k * 24, [[13, 560, 1.3 + k * 0.32], [6, 230, 0.4 + k * 0.6], [2.5, 96, k]], { x: SX, w: 300 - k * 6, h: 128 - k * 10 })), o: (0.06 + k * 0.022).toFixed(3) });
  const main = mkThrough(mkRidge(W, 10, 400, [[15, 610, 0.7], [7, 240, 2.1], [2.2, 80, 0.3]], { x: SX, w: 250, h: 96 }), SX, SY);
  const strata = [];
  for (let k = 1; k < 10; k++) strata.push({ d: mkD(main.map(([x, y]) => [x, y + k * 20 + Math.sin(x / (120 + k * 9) + k) * (2 + k * 0.8)])), o: Math.max(0.05, 0.32 - k * 0.028).toFixed(3) });
  const front = mkRidge(W, 12, 600, [[18, 520, 2.6], [8, 190, 1.1], [3, 70, 0.2]], { x: 420, w: 360, h: 40 });
  const route = mkRoute(860, 596, SX, SY, 11, 3.4, 11);
  return { W, H, SX, SY, back, mainFill: mkFillD(main, H), main: mkD(main), strata, frontFill: mkFillD(front, H), front: mkD(front), route: mkD(route), start: route[0] };
})();

// A cover's terrain: contours and a route to the summit (stretches with the cover; strokes do not).
const MK_TOPO_CACHE = new Map();
function mkTopo(W, H, sxp, syp, seed) {
  const key = [W, H, sxp, syp, seed].join(":");
  if (MK_TOPO_CACHE.has(key)) return MK_TOPO_CACHE.get(key);
  const SX = W * sxp, SY = H * syp; const r = mkRng(seed); const ph = r() * 6;
  const top = mkThrough(mkRidge(W, 6, H * 0.62, [[4.5, W * 0.48, ph], [2.2, W * 0.17, ph * 2]], { x: SX, w: W * 0.2, h: H * 0.28 }), SX, SY);
  const lines = [];
  for (let k = 1; k < 7; k++) lines.push({ d: mkD(top.map(([x, y]) => [x, y + k * H * 0.085 + Math.sin(x / (W * 0.09) + k * 1.7 + ph) * (1 + k * 0.5)])), o: Math.max(0.08, 0.4 - k * 0.05).toFixed(2), c: "#34d6c5" });
  for (let k = 1; k < 3; k++) lines.push({ d: mkD(top.map(([x, y]) => [x, y - k * H * 0.12 + Math.sin(x / (W * 0.12) + k) * 2])), o: (0.13 / k).toFixed(2), c: "#eef3f0" });
  const route = mkD(mkRoute(W * 0.03, H * 0.95, SX, SY, W / 42, H * 0.022, seed));
  const out = { fill: mkFillD(top, H), top: mkD(top), lines, route };
  MK_TOPO_CACHE.set(key, out);
  return out;
}
function MkTopo({ w, h, sx, sy, seed, gid }) {
  const t = mkTopo(w, h, sx, sy, seed);
  return (
    <svg className="mk-topo" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1622" stopOpacity=".25" /><stop offset="1" stopColor="#0e1a27" stopOpacity=".85" /></linearGradient></defs>
      <path d={t.fill} fill={`url(#${gid})`} />
      <path d={t.top} fill="none" stroke="#34d6c5" strokeOpacity=".62" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {t.lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.c} strokeOpacity={l.o} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      <path d={t.route} fill="none" stroke="#34d6c5" strokeOpacity=".3" strokeWidth="5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={t.route} fill="none" stroke="#effffc" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Icons: drawn, theme-tinted (no emoji) ─────────────────────────────────────────────────────
const MK_ICONS = {
  strength: <path d="M2.5 10v4M5.5 7v10M18.5 7v10M21.5 10v4M5.5 12h13" />,
  fatloss: <path d="M12 3c.8 2.6 4.5 4.6 4.5 9.2a4.5 4.5 0 0 1-9 0c0-2.1 1-3.4 2.1-4.3.1 1.9 1 3 2.2 3.1-.3-2.8-.6-5.2.2-8z" />,
  endurance: <path d="M2 13h3.5l2-5 4 10 2.5-6 1.5 2H22" />,
  mobility: <><path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" /><path d="M19.8 4v4.2h-4.2" /></>,
  nutrition: <><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" /><path d="M12 7.5c.2-2.4 1.7-3.9 4.3-4.3-.1 2.6-1.7 4.1-4.3 4.3z" /></>,
  general: <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  sort: <path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  ig: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".8" /></>,
  yt: <><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" /></>,
  web: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z" /></>,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10" />,
  chat: <path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z" />,
};
function MkIcon({ name, size = 18, sw = 1.8 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>{MK_ICONS[name]}</svg>;
}
function MkCaret({ up }) { return <span className={"mk-car" + (up ? " up" : "")} aria-hidden="true" />; }

// ── One source each: tier, rating, price ──────────────────────────────────────────────────────
// The coach ladder, by Shape Score points: the same thresholds and names the living profile draws
// (livingShared.jsx LV_LADDER.coach; tests/marketplace-page.test.mjs holds the two equal). A listing
// with no points behind it (no account) shows no tier.
const MK_COACH_LADDER = [[0, "Certified", "#5fa96e"], [750, "Pro", "#d8a23a"], [2000, "Elite", "#e0463c"], [5000, "Master", "#8fe3e6"], [15000, "Icon", "#34d6c5"]];
function mkCoachTier(c) {
  if (!c || c.points == null || !isFinite(Number(c.points))) return null;
  const p = Number(c.points);
  let t = MK_COACH_LADDER[0];
  for (const x of MK_COACH_LADDER) if (p >= x[0]) t = x;
  return { name: t[1], color: t[2] };
}

// A card's rating on the ten-point scale: a live coach's real average (null when nobody has
// reviewed them), a demo or seeded coach's five-point number doubled.
function mkRating10(c) {
  if (c && c.ratingLive) return c.rating10 == null ? 0 : Number(c.rating10);
  return Number(c && c.rating) * 2 || 0;
}
function mkRatingLabel(c) {
  if (c && c.ratingLive && c.rating10 == null) return "New";
  return `★ ${mkRating10(c).toFixed(1)}/10`;
}
function mkIsRated(c) { return mkRating10(c) > 0; }
function mkReviewCount(c) { return c && c.ratingLive ? Number(c.reviewCount || 0) : Number((c && c.reviews) || 0); }

// Every price on the page: the card, the quick view, Compare and the budget filter. A trainer's
// listing priced by the session reads per session; a monthly price (every nutritionist, and a
// trainer with no session price) reads per month.
function mkPriceOf(c) {
  const a = Number(c && c.rate);
  if (!a || !isFinite(a) || a <= 0) return null;
  return { amount: Math.round(a), per: c.per === "month" ? "month" : "session" };
}
function mkPriceText(c) { const p = mkPriceOf(c); return p ? `$${p.amount} per ${p.per}` : "Price on their page"; }

// ── The sample coaches (example data, labelled on the page) ───────────────────────────────────
// Self-hosted pictures only: the cards used to hot-link images.unsplash.com.
const mkFace = (slug) => `/newdesign/faces/${slug}.jpg`;
const MK_COVER = {
  studio: "/newdesign/demo/studio-03.webp", plates: "/newdesign/demo/studio-01.webp", box: "/newdesign/demo/box-cover.webp",
  bells: "/newdesign/demo/plan-01.webp", bar: "/newdesign/demo/wall-02.webp", street: "/newdesign/demo/wall-01.webp",
  summit: "/newdesign/demo/wall-03.webp", gym: "/Training-2.webp", food: "/Nutrition-3.webp",
};
// name, role, city, rate, rating (/5), sessions, tag, specialties, cert, years, format, category,
// photo, cover, why, and the flags. Points and review counts are examples too, sized to the sessions.
function mkEx(o) {
  return { verified: true, points: Math.round(o.sessions * 2.4), reviews: Math.round(o.sessions * 0.22), sample: true, per: o.tag === "Nutritionist" ? "month" : "session", ...o };
}
const COACHES_FULL = [
  mkEx({ name: "Maya Okafor", role: "Strength & Hypertrophy", city: "Brooklyn, NY", rate: 120, rating: 4.97, sessions: 1284, tag: "Trainer", specialties: ["Strength", "Hypertrophy"], cert: "NASM-CPT · USAW-L1 · FMS-L2", years: 9, format: "Hybrid", category: "Strength & Resistance", photo: mkFace("maya"), cover: MK_COVER.studio, reviews: 284, clients: 10, spots: 4,
    why: "Tempo-based strength blocks, and a written note waiting after every session.",
    bio: "I rebuilt my programming around tempo work. Every session gets a note after, so you always know why the program is the program.",
    programs: [{ name: "Strength Block 3", kind: "Strength", weeks: 2, price: 59, line: "2 days a week · barbells, machines, cables", img: "/newdesign/demo/studio-02.webp" }, { name: "Hypertrophy 8", kind: "Hypertrophy", weeks: 1, price: 49, line: "1 day a week · machines and cables", img: MK_COVER.bells }],
    packages: [["Monthly coaching", "A program written for your week, notes on every session", 180, "mo"], ["1:1 session", "60 min · in the Brooklyn studio or on video", 120, ""]],
    highlights: [["Client PRs", "/newdesign/demo/studio-02.webp"], ["Tempo week", MK_COVER.studio], ["Studio", MK_COVER.box], ["Runs", MK_COVER.street]],
    socials: [["web", "Website", "mayaokafor.com"], ["ig", "Instagram", "@maya.okafor"], ["yt", "YouTube", "@mayaokafor"]] }),
  mkEx({ name: "Leo Martins", role: "Powerlifting", city: "Lisbon", rate: 105, rating: 4.86, sessions: 1120, tag: "Trainer", specialties: ["Powerlifting", "Strength"], cert: "NSCA-CSCS", years: 8, format: "Hybrid", category: "Strength & Resistance", photo: mkFace("leo"), cover: MK_COVER.plates, why: "Meet-prep powerlifting blocks with a video form check every week." }),
  mkEx({ name: "Anya Volkov", role: "Barbell Foundations", city: "Berlin", rate: 98, rating: 4.91, sessions: 680, tag: "Trainer", specialties: ["Strength", "Barbell basics"], cert: "NSCA-CSCS", years: 6, format: "Hybrid", category: "Strength & Resistance", photo: mkFace("anya"), cover: MK_COVER.bar, why: "Barbell basics from the empty bar up. Patient with first-time lifters." }),
  mkEx({ name: "Diego Alvarez", role: "Endurance · Marathon", city: "Austin, TX", rate: 95, rating: 4.92, sessions: 912, tag: "Trainer", specialties: ["Running", "VO2"], cert: "ACE-CPT", years: 7, format: "Hybrid", category: "Cardio & Endurance", photo: mkFace("diego"), cover: MK_COVER.street, why: "Marathon and VO2 blocks for runners chasing a first sub-3." }),
  mkEx({ name: "Kenji Watanabe", role: "Triathlon Coaching", city: "San Francisco", rate: 150, rating: 4.91, sessions: 590, tag: "Trainer", specialties: ["Triathlon", "Swimming"], cert: "USAT-L2", years: 14, format: "Hybrid", category: "Cardio & Endurance", photo: mkFace("kenji"), cover: MK_COVER.summit, why: "Swim, bike and run in one plan, built around a full-time job." }),
  mkEx({ name: "Hana Reyes", role: "Cycling & VO2", city: "Girona", rate: 110, rating: 4.88, sessions: 720, tag: "Trainer", specialties: ["Cycling", "Endurance"], cert: "USA-C-L2", years: 9, format: "Remote", category: "Cardio & Endurance", photo: mkFace("hana"), why: "Power-based cycling plans read from your own ride files." }),
  mkEx({ name: "Jordan Park", role: "Mobility · Return-to-lift", city: "Los Angeles", rate: 110, rating: 4.89, sessions: 1510, tag: "Trainer", specialties: ["Mobility", "Post-op"], cert: "NSCA-CSCS", years: 8, format: "In-person", category: "Mobility, Recovery & Rehab", photo: mkFace("jordan"), cover: MK_COVER.bells, why: "Strength after surgery or injury, planned alongside your physio." }),
  mkEx({ name: "Priya Natarajan", role: "Yoga & Mobility", city: "Brooklyn, NY", rate: 90, rating: 4.93, sessions: 1680, tag: "Trainer", specialties: ["Yoga", "Mobility"], cert: "RYT-500", years: 9, format: "In-person", category: "Mobility, Recovery & Rehab", photo: mkFace("priya"), cover: MK_COVER.gym, atCapacity: true, why: "Mobility for lifters who sit all day. Full for now, with a waiting list." }),
  mkEx({ name: "Sam Oduya", role: "Rehab & Return-to-Sport", city: "Atlanta", rate: 125, rating: 4.94, sessions: 540, tag: "Trainer", specialties: ["Rehab", "Return to sport"], cert: "DPT · CSCS", years: 11, format: "In-person", category: "Mobility, Recovery & Rehab", why: "A physical therapist who rebuilds athletes after injury, one measured step at a time." }),
  mkEx({ name: "Tomás Reyes", role: "CrossFit · Olympic Lifts", city: "Miami", rate: 130, rating: 4.88, sessions: 2010, tag: "Trainer", specialties: ["CrossFit", "Olympic lifting"], cert: "CF-L3", years: 12, format: "In-person", category: "Functional & Hybrid", photo: mkFace("tomas"), cover: MK_COVER.box, why: "Olympic lifts with clean fundamentals, scaled to the lifter in front of him." }),
  mkEx({ name: "Isla Park", role: "Hybrid Athlete", city: "Austin, TX", rate: 115, rating: 4.90, sessions: 640, tag: "Trainer", specialties: ["Hybrid", "Hyrox"], cert: "NSCA-CSCS", years: 7, format: "Hybrid", category: "Functional & Hybrid", why: "Strength and running in one week, without either one stalling." }),
  mkEx({ name: "Marcus Hale", role: "Classic Bodybuilding", city: "Las Vegas", rate: 140, rating: 4.87, sessions: 980, tag: "Trainer", specialties: ["Hypertrophy", "Contest prep"], cert: "NASM · PN-1", years: 13, format: "In-person", category: "Bodybuilding", photo: mkFace("member-02"), cover: MK_COVER.plates, why: "Classic physique prep: the training, the posing and the off-season after." }),
  mkEx({ name: "Yuki Tanaka", role: "Physique & Posing", city: "Tokyo", rate: 125, rating: 4.92, sessions: 460, tag: "Trainer", specialties: ["Physique", "Cutting"], cert: "IFBB-PT", years: 10, format: "Remote", category: "Bodybuilding", photo: mkFace("member-03"), why: "Physique coaching on video, with posing reviewed frame by frame." }),
  mkEx({ name: "Malik Freeman", role: "HIIT Athletic Performance", city: "Chicago", rate: 135, rating: 4.90, sessions: 770, tag: "Trainer", specialties: ["HIIT", "Plyometrics"], cert: "NSCA-CSCS", years: 11, format: "In-person", category: "HIIT", why: "Speed and power for field-sport athletes in the off-season." }),
  mkEx({ name: "Zoë Carter", role: "Metabolic Conditioning", city: "Denver", rate: 95, rating: 4.89, sessions: 820, tag: "Trainer", specialties: ["HIIT", "MetCon"], cert: "NASM-CPT", years: 6, format: "Hybrid", category: "HIIT", cover: MK_COVER.gym, why: "Short, hard conditioning sessions that fit in a lunch break." }),
  mkEx({ name: "Priscilla Adams", role: "Fat Loss & Conditioning", city: "Miami", rate: 100, rating: 4.85, sessions: 1240, tag: "Trainer", specialties: ["Fat loss", "Conditioning"], cert: "NASM · PN-1", years: 8, format: "Remote", category: "Fat Burn", why: "Fat-loss training paired with simple food habits you can keep." }),
  mkEx({ name: "Omar Haddad", role: "Lean & Cut Programs", city: "Dubai", rate: 120, rating: 4.91, sessions: 560, tag: "Trainer", specialties: ["Fat loss", "Cutting"], cert: "NASM-CPT", years: 9, format: "Hybrid", category: "Fat Burn", photo: mkFace("member-05"), why: "Cut phases that keep your strength, planned week by week." }),
  mkEx({ name: "Amara Johnson", role: "At-home Full Body", city: "Denver", rate: 85, rating: 4.94, sessions: 840, tag: "Trainer", specialties: ["At home", "Prenatal"], cert: "NASM · PPES", years: 10, format: "Remote", category: "At Home", photo: mkFace("member-08"), why: "Full-body training at home with whatever you have, prenatal-safe." }),
  mkEx({ name: "Rhea Kapoor", role: "Minimal-Equipment Strength", city: "Mumbai", rate: 70, rating: 4.88, sessions: 910, tag: "Trainer", specialties: ["At home", "Bands"], cert: "NASM-CPT", years: 5, format: "Remote", category: "At Home", why: "Real strength with bands and a pair of dumbbells." }),
  mkEx({ name: "Nora Kessler", role: "Women's Strength · Cycle-synced", city: "Berlin", rate: 115, rating: 4.94, sessions: 720, tag: "Trainer", specialties: ["Women's strength", "Cycle-synced"], cert: "NSCA-CSCS · PN-2", years: 10, format: "Hybrid", category: "Just for Women", why: "Strength blocks planned around your cycle, not against it." }),
  mkEx({ name: "Amelia Finch", role: "Postpartum & Core Rebuild", city: "Portland, OR", rate: 105, rating: 4.96, sessions: 540, tag: "Trainer", specialties: ["Postpartum", "Pelvic floor"], cert: "NASM · PCES", years: 8, format: "In-person", category: "Just for Women", why: "Postpartum core and pelvic-floor rebuild, then back to lifting." }),
  mkEx({ name: "Sana Khoury", role: "Women-only Strength Studio", city: "Toronto", rate: 95, rating: 4.90, sessions: 880, tag: "Trainer", specialties: ["Strength", "Beginner-friendly"], cert: "NASM-CPT", years: 6, format: "In-person", category: "Just for Women", why: "A women-only studio for first-time lifters, beginner-friendly from day one." }),
  mkEx({ name: "Cal Redmond", role: "5K to Marathon Coaching", city: "Boulder, CO", rate: 90, rating: 4.96, sessions: 1040, tag: "Trainer", specialties: ["Marathon", "Tempo runs"], cert: "RRCA · UESCA", years: 11, format: "Remote", category: "Pure Running", photo: mkFace("member-01"), cover: MK_COVER.street, why: "From a first 5K to a marathon, with tempo work that builds." }),
  mkEx({ name: "Fiona Walsh", role: "Trail & Ultra Running", city: "Chamonix", rate: 120, rating: 4.93, sessions: 410, tag: "Trainer", specialties: ["Trail", "Ultra"], cert: "UESCA-UEC", years: 9, format: "Hybrid", category: "Pure Running", photo: mkFace("member-10"), cover: MK_COVER.summit, why: "Trail and ultra plans with the climbing built in." }),
  mkEx({ name: "Jamal Brooks", role: "Track & Speed Work", city: "Eugene, OR", rate: 105, rating: 4.91, sessions: 620, tag: "Trainer", specialties: ["Track", "Speed"], cert: "USATF-L2", years: 12, format: "In-person", category: "Pure Running", why: "Sprint mechanics and track sessions for sub-elite racers." }),
  mkEx({ name: "Dax Whitaker", role: "Hyrox Elite & Mixed Ergs", city: "London", rate: 125, rating: 4.94, sessions: 680, tag: "Trainer", specialties: ["Hyrox", "SkiErg"], cert: "NSCA-CSCS · Hyrox-CT", years: 9, format: "Hybrid", category: "Hyrox", why: "Hyrox race prep: the runs, the stations and the transitions." }),
  mkEx({ name: "Greta Lindqvist", role: "Hyrox Pro Doubles", city: "Stockholm", rate: 115, rating: 4.92, sessions: 520, tag: "Trainer", specialties: ["Hyrox", "Doubles"], cert: "Hyrox-CT · NASM", years: 7, format: "In-person", category: "Hyrox", photo: mkFace("member-12"), why: "Doubles strategy and partner pacing for Hyrox Pro." }),
  mkEx({ name: "Rafa Moreno", role: "Hyrox Strength & Run Carry-over", city: "Madrid", rate: 105, rating: 4.89, sessions: 440, tag: "Trainer", specialties: ["Hyrox", "Conditioning"], cert: "Hyrox-CT", years: 6, format: "In-person", category: "Hyrox", verified: false, why: "Strength that carries over to the run, for Hyrox first-timers." }),

  mkEx({ name: "Rae Lindqvist", role: "Sports Performance & Hydration", city: "Stockholm", rate: 140, rating: 5.00, sessions: 640, tag: "Nutritionist", specialties: ["Hydration", "Performance"], cert: "RD · CSSD", years: 11, format: "Remote", category: "Sports Performance & Hydration", photo: mkFace("rae"), cover: MK_COVER.food, why: "Fueling plans that survive travel, kids and shift work.",
    packages: [["Monthly coaching", "Ongoing plans, labs review, accountability", 140, "mo"], ["Custom meal plan", "Two weeks, built to your macros and schedule", 60, ""]] }),
  mkEx({ name: "Claire Donovan", role: "Performance Nutrition", city: "London", rate: 130, rating: 4.93, sessions: 520, tag: "Nutritionist", specialties: ["Athlete fueling", "Race week"], cert: "AfN-RNutr", years: 9, format: "Remote", category: "Performance Nutrition", photo: mkFace("claire"), why: "Race-week and training-day fueling for endurance athletes." }),
  mkEx({ name: "Sofia Marchetti", role: "Clinical Nutrition", city: "London", rate: 160, rating: 4.98, sessions: 420, tag: "Nutritionist", specialties: ["Auto-immune", "Gut health"], cert: "AfN-RNutr", years: 13, format: "Remote", category: "Medical & Condition-Specific", photo: mkFace("sofia"), cover: MK_COVER.food, why: "Clinical nutrition for auto-immune and gut conditions." }),
  mkEx({ name: "David Mehta", role: "Medical Nutrition Therapy", city: "Toronto", rate: 150, rating: 4.95, sessions: 380, tag: "Nutritionist", specialties: ["Diabetes", "Heart health"], cert: "RD", years: 14, format: "Remote", category: "Medical & Condition-Specific", photo: mkFace("member-07"), why: "Medical nutrition therapy for diabetes and heart health." }),
  mkEx({ name: "Ben Caldwell", role: "Muscle Gain & Bulking", city: "Sydney", rate: 110, rating: 4.87, sessions: 690, tag: "Nutritionist", specialties: ["Muscle gain", "Recomp"], cert: "APD", years: 7, format: "Remote", category: "Muscle Gain / Bulking", photo: mkFace("ben"), cover: MK_COVER.food, why: "Lean-gain meal plans built around your training days, not a template." }),
  mkEx({ name: "Nadia Chen", role: "Gut Health & Functional", city: "Toronto", rate: 125, rating: 4.95, sessions: 730, tag: "Nutritionist", specialties: ["Gut health", "Functional"], cert: "RDN", years: 6, format: "Remote", category: "Gut Health & Functional Nutrition", photo: mkFace("nadia"), why: "Plant-forward plans for a calmer gut." }),
  mkEx({ name: "Ingrid Olsen", role: "Longevity & Healthspan", city: "Copenhagen", rate: 145, rating: 4.96, sessions: 310, tag: "Nutritionist", specialties: ["Longevity", "Metabolic health"], cert: "RD", years: 12, format: "Remote", category: "Longevity & Healthspan", photo: mkFace("member-06"), why: "Eating for the long run: metabolic health and healthspan." }),
  mkEx({ name: "Ayo Adeyemi", role: "Weight Management", city: "Lagos", rate: 95, rating: 4.89, sessions: 820, tag: "Nutritionist", specialties: ["Weight management", "Habits"], cert: "RD", years: 8, format: "Remote", category: "Weight Mgmt", why: "Weight management built on habits, not restriction." }),
  mkEx({ name: "Liana Torres", role: "Plant-based Nutrition", city: "Madrid", rate: 105, rating: 4.92, sessions: 490, tag: "Nutritionist", specialties: ["Plant-based", "Athletes"], cert: "RD", years: 7, format: "Remote", category: "Plant-Based", photo: mkFace("member-04"), why: "Plant-based plans with enough protein for athletes." }),
  mkEx({ name: "Hana Matsuda", role: "Prenatal Nutrition", city: "Osaka", rate: 120, rating: 4.94, sessions: 340, tag: "Nutritionist", specialties: ["Prenatal", "Postnatal"], cert: "RD · CLC", years: 9, format: "Remote", category: "Prenatal", verified: false, why: "Prenatal and postnatal nutrition, trimester by trimester." }),
  mkEx({ name: "Marco Bellini", role: "Meal Prep & Habits", city: "Milan", rate: 90, rating: 4.88, sessions: 760, tag: "Nutritionist", specialties: ["Meal prep", "Habits"], cert: "RD", years: 6, format: "Remote", category: "Meal Prep", photo: mkFace("member-09"), why: "Sunday meal prep that lasts the week, and the habits around it." }),
];

// ── Goals: what a visitor asks for, read from what a listing says it does ─────────────────────
const MK_GOALS = [
  { id: "strength", label: "Strength", sub: "Lift heavier, build muscle", icon: "strength" },
  { id: "fatloss", label: "Fat loss", sub: "Lose fat, keep the muscle", icon: "fatloss" },
  { id: "endurance", label: "Endurance", sub: "Run, ride, Hyrox, triathlon", icon: "endurance" },
  { id: "mobility", label: "Mobility & rehab", sub: "Move well, recover", icon: "mobility" },
  { id: "nutrition", label: "Sports nutrition", sub: "Fuel the training you do", icon: "nutrition", nu: true },
  { id: "general", label: "General fitness", sub: "At home or in the gym", icon: "general" },
];
const MK_GOAL_RX = {
  strength: /strength|hypertroph|powerlift|bodybuild|barbell|olympic|weightlift|kettlebell|calisthen|physique|muscle|bulk|recomp|crossfit/i,
  fatloss: /fat|weight ?(loss|mgmt|management)|weightloss|lean|\bcut|hiit|metcon|keto|fasting|low-carb|conditioning/i,
  endurance: /endur|cardio|\brun|running|marathon|triathlon|cycling|vo2|hyrox|trail|ultra|track|obstacle|swim|5k|tempo|erg/i,
  mobility: /mobil|rehab|recover|yoga|pilates|post-op|physio|physical therap|senior|balance|posture|pelvic|postpartum|breath|flexib|return/i,
  nutrition: /sport|performance|athlete|hydration|fuel|supplement|contest/i,
  general: /home|functional|family|general|habit|meal prep|dance|boxing|combat|beginner|women|prenatal|wellness|longevity|healthspan|plant|gut|clinical|medical|cultural|budget|vegan|full body|fullbody|kids/i,
};
function mkGoalsOf(c) {
  const text = [c.role, c.category, ...(c.specialties || [])].join(" · ");
  const out = new Set();
  for (const g of MK_GOALS) {
    if (g.id === "nutrition" && c.tag !== "Nutritionist") continue;
    if (MK_GOAL_RX[g.id].test(text)) out.add(g.id);
  }
  if (!out.size) out.add("general");
  return out;
}

// ── Live listings (trainers / nutritionists, listing_ready) ───────────────────────────────────
function mkList(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  if (typeof v === "string" && v.trim().startsWith("[")) { try { return mkList(JSON.parse(v)); } catch (e) { return []; } }
  return [];
}
function mapLiveCoach(row, tab) {
  const isNutri = tab === "Nutritionist";
  // A trainer's session price reads per session; any other price on a listing is its monthly one.
  const session = !isNutri ? Number(row.session_price) : NaN;
  const monthly = Number(row.price);
  const per = session > 0 ? "session" : "month";
  const rate = per === "session" ? Math.round(session) : (monthly > 0 ? Math.round(monthly) : null);
  const yrs = parseInt(String(row.experience || "").replace(/[^0-9]/g, ""), 10) || null;
  const specs = [...mkList(row.tags), ...(isNutri ? mkList(row.services) : [])].slice(0, 6);
  const lib = (typeof window !== "undefined" && window.ShapeListingLib) || null;
  const media = (lib && lib.bsNormalizeListingMedia) ? lib.bsNormalizeListingMedia(row.listing_media, row.owner_id) : null;
  // At capacity, spelled as src/lib/capacity.ts spells it: paused, and no resume date or a future one.
  const resume = row.capacity_resume_at ? new Date(row.capacity_resume_at).getTime() : null;
  const atCapacity = !!row.at_capacity && (!resume || resume > Date.now());
  return {
    key: (isNutri ? "n" : "t") + row.id,
    providerId: row.id,
    name: row.name || (isNutri ? "Shape Nutritionist" : "Shape Trainer"),
    role: row.specialty || row.specialty_type || (isNutri ? "Nutrition coaching" : "Personal training"),
    // The listing tables carry no location or format a visitor can read: both stay unknown rather
    // than defaulting to "Remote", which the old card printed on every live listing.
    city: null, format: null,
    rate, per,
    // ⚠ A LISTING IS RATED BY ITS REVIEWS OR NOT AT ALL (owner, 2026-10-12: "make sure the review
    // system and star rating system is in place for live accounts. 1-10 stars"). `rating10` is the
    // account's real average, merged in by useLiveCoaches; a listing with no account has no reviews.
    // The row's own `rating` column is not read: the old `row.rating || 4.8` put 9.6 on every seeded row.
    rating: null, ratingLive: true, rating10: null, reviewCount: 0,
    tag: isNutri ? "Nutritionist" : "Trainer",
    specialties: specs,
    cert: row.credential || "", certFull: row.credential_full || "",
    years: yrs,
    category: row.category || "",
    why: String(row.bio || "").trim(),
    ownerId: row.owner_id || null,
    // Coach-authored listing media, through the canonical guard: an invalid or foreign URL is dropped,
    // and the profile's own cover is never read here.
    photo: (media && media.portrait) || "",
    cover: (media && media.cover) || "",
    live: true, verified: !!row.verified, atCapacity,
    featured: !!(row.featured || row.trainer_of_month || row.nutritionist_of_month),
    // A seeded listing's subscriber count is not a count of anyone: only an account's is shown.
    clients: row.owner_id ? Number(row.subscribers || 0) : 0,
    points: null,
  };
}
// The anon grant's columns, in the 2026-10-10 migration's order (a `*` read fails the whole row for
// a visitor); tests/security-review-lows.test.mjs holds them equal.
function mkReadListings(cl, tab) {
  const table = tab === "Nutritionist" ? "nutritionists" : "trainers";
  const columns = tab === "Nutritionist"
    ? "id, name, specialty, category, price, rating, subscribers, experience, credential, credential_full, specialty_type, bio, color, tags, services, nutritionist_of_month, notm_quote, featured, sort_order, created_at, updated_at, stripe_product_id, stripe_price_id, owner_id, stripe_account_status, meal_plan_price, at_capacity, capacity_resume_at, verified, verified_at, monthly_offer, listing_media, timezone"
    : "id, name, specialty, category, price, rating, subscribers, experience, credential, credential_full, specialty_type, bio, color, tags, trainer_of_month, totm_quote, featured, sort_order, created_at, updated_at, stripe_product_id, stripe_price_id, owner_id, stripe_account_status, session_price, at_capacity, capacity_resume_at, verified, verified_at, monthly_offer, listing_media, timezone";
  // Discoverable listings only: a real coach is listed once the listing has a price, active payouts
  // and a photo (2026-10-12-coach-listing-ready.sql); Shape's own listings always are.
  return cl.from(table).select(columns).eq("listing_ready", true)
    .then(({ data, error }) => (error || !Array.isArray(data) ? [] : data.map((row) => mapLiveCoach(row, tab))), () => []);
}
// Runs fn over every item, at most `limit` at once.
function mkEachLimited(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
// An account's open intro times, from the read the booking page lays its times out from, and its
// "Free intros while at capacity" rule: { times, introsAtCap }, or null when the read fails.
function mkReadOpenTimes(c) {
  const B = window.BookingSlots;
  const role = c.tag === "Nutritionist" ? "nutritionist" : "trainer";
  return fetch("/api/availability?role=" + role + "&id=" + encodeURIComponent(c.providerId), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !Array.isArray(d.slots) || !B || !B.buildSlots) return null;
      const introsAtCap = !!(d.rules && d.rules.introsAtCapacity === true);
      // Full, with intros at capacity off (the default): no intro times, as the coach's own booking
      // page shows none (coachProfileWeb's introsAtCap rule). Its hours stay, but none can be booked,
      // so the coach can't pass "Open this week" or rank as the soonest intro (Codex on #2619).
      if (d.atCapacity === true && !introsAtCap) return { times: [], introsAtCap };
      const len = Number(d.rules && d.rules.consultMin);
      const introMin = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
      if (d.slots.length && !(B.isZone && B.isZone(d.timezone))) return { times: [], introsAtCap };
      return { times: B.buildSlots({ slots: d.slots, booked: d.booked || [], zone: d.timezone, busy: d.busy || [], rules: d.rules || null, now: new Date(), days: 8, sessionMin: introMin }), introsAtCap };
    })
    .catch(() => null);
}
// Every listing, read once window.shapeDb is ready (not only when a tab switch re-runs the read,
// which is how the old page lost them on a first load), then each account's reviews, face, points
// and open times.
function useLiveCoaches() {
  const [st, setSt] = useS({ state: "loading", rows: [] });
  useE(() => {
    let on = true;
    const ready = typeof window.shapeEnsureDb === "function" ? window.shapeEnsureDb() : Promise.resolve(window.shapeDb || null);
    Promise.resolve(ready).then(async (db) => {
      const cl = (db && db.client) || (window.shapeDb && window.shapeDb.client) || null;
      if (!cl) { if (on) setSt({ state: "none", rows: [] }); return; }
      const [tr, nu] = await Promise.all([mkReadListings(cl, "Trainer"), mkReadListings(cl, "Nutritionist")]);
      const rows = [...tr, ...nu];
      if (on) setSt({ state: "ready", rows });
      const owned = rows.filter((c) => c.ownerId);
      if (!owned.length) return;
      // Every account's real average, by ACCOUNT (a slug is a name, and names can differ).
      try {
        const sum = await fetch("/api/coaches/reviews", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null));
        const owners = (sum && sum.owners) || {};
        owned.forEach((c) => { const o = owners[c.ownerId]; c.rating10 = o && Number(o.count) > 0 ? Number(o.avg) : null; c.reviewCount = o ? Number(o.count) || 0 : 0; });
      } catch (e) { /* no summary = unrated, never a made-up number */ }
      await Promise.all(owned.map(async (c) => {
        try {
          const r = await cl.rpc("get_public_profile", { p_user_id: c.ownerId });
          const row = Array.isArray(r && r.data) ? r.data[0] : (r && r.data);
          if (row && row.avatar && !c.photo) c.photo = row.avatar;
          if (row && Number.isFinite(Number(row.points)) && row.points != null) c.points = Number(row.points);
        } catch (e) { /* keep initials */ }
      }));
      // Every account's times, six reads at a time: a cap left the coaches past it with no times, so
      // they failed "Open this week" and sank in the sort (Codex on #2619).
      // The intros rule rides along: a full coach who takes intros keeps Book a free intro (Codex on #2619).
      await mkEachLimited(owned, 6, async (c) => { const r = await mkReadOpenTimes(c); c.openTimes = r ? r.times : null; c.introsAtCap = !!(r && r.introsAtCap); });
      if (on) setSt({ state: "ready", rows: [...rows] });
    }, () => { if (on) setSt({ state: "none", rows: [] }); });
    return () => { on = false; };
  }, []);
  return st;
}

// ── Who can be booked, and where each action goes ─────────────────────────────────────────────
function mkKind(c) { return c.sample ? "example" : (c.ownerId ? "live" : "listing"); }
// Full for new clients. With the coach's "Free intros while at capacity" on, intros stay open (the
// consultation flow takes them); off (the default), the coach is shut to intros: a waiting list only.
function mkIntroShut(c) { return !!c.atCapacity && c.introsAtCap !== true; }
function mkIntroAtCap(c) { return !!c.atCapacity && c.introsAtCap === true; }
function mkCanBook(c) { return mkKind(c) === "live" && !mkIntroShut(c); }
function mkIntroOpen(c) { return (mkKind(c) === "live" || mkKind(c) === "example") && !mkIntroShut(c); }
function mkRoleParam(c) { return c.tag === "Nutritionist" ? "nutritionist" : "trainer"; }
function mkProfileHref(c) {
  return c.ownerId
    ? ("MemberProfile.html?u=" + encodeURIComponent(c.ownerId) + "&role=" + mkRoleParam(c))
    : ("MemberProfile.html?name=" + encodeURIComponent(c.name) + "&role=" + mkRoleParam(c) + ((c.photo || c.avatar) ? "&avatar=" + encodeURIComponent(c.photo || c.avatar) : ""));
}
// "Book a free intro": the intro page the coach's own profile books from (consultation.html, the
// coach's open hours and intro length). With no such flow (a sample coach), the coach's page, whose
// Work-with column sits beside it on a desktop.
function mkIntroHref(c, iso) {
  if (mkKind(c) === "live" && c.providerId) return "/newdesign/consultation.html?type=" + mkRoleParam(c) + "&id=" + encodeURIComponent(c.providerId) + "&name=" + encodeURIComponent(c.name) + (iso ? "&at=" + encodeURIComponent(iso) : "");
  return mkProfileHref(c);
}
// The next open intro: a real one for an account, an example one for a sample (labelled so).
const MK_EX_TIMES = [[7, 0], [9, 0], [11, 30], [12, 0], [17, 30], [18, 0], [19, 0]];
function mkOpenTimes(c) {
  if (mkIntroShut(c)) return [];
  if (mkKind(c) === "live") return Array.isArray(c.openTimes) ? c.openTimes : null;
  if (mkKind(c) !== "example") return [];
  const h = mkHash(c.name); const out = []; const now = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((h >>> (i * 3)) % 3) + i * 2 + 1);
    const [hh, mm] = MK_EX_TIMES[(h >>> (i * 2 + 5)) % MK_EX_TIMES.length];
    d.setHours(hh, mm, 0, 0);
    out.push({ iso: d.toISOString(), ms: d.getTime() });
  }
  return out.sort((a, b) => a.ms - b.ms);
}
// ⚠ ON THE VIEWER'S OWN CLOCK (P9): the account's zone (shapeZone.mjs, window.ShapeZone, read at
// call time), "today" included; this browser's without it, as before.
function mkSlotText(s, withDay = true) {
  let Z = null;
  try { Z = window.ShapeZone && typeof window.ShapeZone.dayKey === "function" ? window.ShapeZone : null; } catch (e) { Z = null; }
  if (Z) {
    const key = Z.dayKey(s.ms), now = Z.partsInZone(Date.now());
    const u = now ? new Date(Date.UTC(now.y, now.mo - 1, now.d + 1)) : null;
    const tomKey = u ? u.toISOString().slice(0, 10) : "";
    const day = key === Z.dayKey(Date.now()) ? "Today" : key === tomKey ? "Tomorrow" : Z.formatDate(s.ms, { weekday: "short" });
    const time = Z.formatTime(s.ms);
    if (key && time) return withDay ? day + " · " + time : time;
  }
  const d = new Date(s.ms);
  const today = new Date(); const tom = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const day = same(d, today) ? "Today" : same(d, tom) ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return withDay ? day + " · " + time : time;
}
function mkWithinWeek(c) { const t = mkOpenTimes(c); return !!(t && t.length && t[0].ms - Date.now() < 7 * 86400000); }
function mkFirst(name) { return String(name || "").replace(/^Dr\.?\s+/i, "").split(/\s+/)[0] || "this coach"; }
function mkInitials(name) { const p = String(name || "").replace(/^Dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean); return (((p[0] || "")[0] || "") + ((p[1] || "")[0] || "")).toUpperCase() || "?"; }

// ── Filters ────────────────────────────────────────────────────────────────────────────────────
const MK_DEFAULTS = { role: "Both", goals: [], specs: [], maxSession: null, maxMonth: null, meet: "either", city: "Anywhere", openWeek: false, verified: false, intro: false, taking: false, q: "" };
function mkPass(c, f) {
  if (f.role !== "Both" && c.tag !== f.role) return false;
  if (f.goals.length && !f.goals.some((g) => c.goals.has(g))) return false;
  if (f.specs.length && !f.specs.some((s) => c.specialties.some((x) => x.toLowerCase() === s.toLowerCase()))) return false;
  const p = mkPriceOf(c);
  if (p && p.per === "session" && f.maxSession != null && p.amount > f.maxSession) return false;
  if (p && p.per === "month" && f.maxMonth != null && p.amount > f.maxMonth) return false;
  const inPerson = c.format === "In-person" || c.format === "Hybrid";
  const remote = c.format === "Remote" || c.format === "Hybrid";
  if (f.meet === "inperson" && !inPerson) return false;
  if (f.meet === "remote" && !remote) return false;
  // A city: coaches there, and, unless the visitor asked for in person, coaches who work remotely.
  if (f.city !== "Anywhere" && c.city !== f.city && !(f.meet !== "inperson" && remote)) return false;
  if (f.openWeek && !mkWithinWeek(c)) return false;
  if (f.verified && !c.verified) return false;
  if (f.intro && !mkIntroOpen(c)) return false;
  if (f.taking && !(mkIntroOpen(c) && !c.atCapacity)) return false;
  if (f.q) {
    const hay = [c.name, c.role, c.city, ...(c.specialties || [])].join(" ").toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}
const MK_SORTS = [["best", "Best match"], ["soon", "Soonest intro"], ["price", "Price, low to high"], ["rating", "Highest rated"], ["years", "Most experience"]];
// Best match is the goal fit, then an open time, then the rating. A boost plays no part (see the head).
function mkScore(c, f) {
  const fit = f.goals.length ? f.goals.filter((g) => c.goals.has(g)).length : 0;
  const t = mkOpenTimes(c);
  return fit * 100 + (t && t.length ? 20 : 0) + mkRating10(c) + Math.min(5, mkReviewCount(c) / 60);
}
function mkSort(list, sort, f) {
  const arr = [...list];
  const byPrice = (c) => { const p = mkPriceOf(c); return p ? (p.per === "session" ? p.amount : 10000 + p.amount) : 1e9; };
  const bySoon = (c) => { const t = mkOpenTimes(c); return t && t.length ? t[0].ms : 1e15; };
  if (sort === "price") arr.sort((a, b) => byPrice(a) - byPrice(b));
  else if (sort === "soon") arr.sort((a, b) => bySoon(a) - bySoon(b));
  else if (sort === "rating") arr.sort((a, b) => mkRating10(b) - mkRating10(a) || mkReviewCount(b) - mkReviewCount(a));
  else if (sort === "years") arr.sort((a, b) => (b.years || 0) - (a.years || 0));
  else arr.sort((a, b) => mkScore(b, f) - mkScore(a, f));
  return arr;
}
const MK_GROUPS = [
  ["live", "On Shape", "Coaches with a Shape account. Book a free intro, then coaching runs in the app."],
  ["example", "Example coaches", "Example profiles that show how the marketplace works. They can't be booked."],
  ["listing", "Listed · not bookable yet", "These listings have no Shape account behind them yet, so they can't take a booking. You can still view them."],
];

// ── The tab is addressable (2026-09-14), and Both is the default (2026-11-05) ──────────────────
// A `#trainers` / `#nutritionists` hash, or `?role=`, picks a side; the switch writes one back, so a
// copied URL lands where it was copied from. ⚠ AN UNKNOWN HASH KEEPS THE DEFAULT, never an empty
// page: the hash is read as a REQUEST for a side rather than as an assertion about it.
function mkTabFromHash(hash) {
  const h = String(hash || "").replace(/^#/, "").toLowerCase();
  if (h === "nutritionists" || h === "nutritionist") return "Nutritionist";
  if (h === "trainers" || h === "trainer") return "Trainer";
  return null;
}
function mkHashForTab(tab) { return tab === "Nutritionist" ? "#nutritionists" : tab === "Trainer" ? "#trainers" : ""; }

// ── Pieces ─────────────────────────────────────────────────────────────────────────────────────
// The portrait in the profile's prism frame (top-right and bottom-left cut), a teal-to-role frame
// and the split-glass glint; the initials when there is no photo or it fails to load.
function MkPrism({ c, size = 78 }) {
  const [broken, setBroken] = useS(false);
  const src = c.photo || c.avatar || "";
  const cut = Math.max(6, Math.round(size * 0.2));
  return (
    <span className="mk-prism" style={{ "--s": size + "px", "--c": cut + "px" }}>
      <span className="ring" />
      <span className="ph">{src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <b className="ini" style={{ fontSize: Math.round(size * 0.34) }}>{mkInitials(c.name)}</b>}</span>
      <span className="gl" />
    </span>
  );
}
function MkTierLine({ c }) {
  const tier = mkCoachTier(c);
  const bits = [];
  if (tier) bits.push(<span key="t"><i style={{ background: tier.color }} />{tier.name}</span>);
  if (c.verified) bits.push(<span key="v">Verified</span>);
  if (!bits.length) bits.push(<span key="n">{mkKind(c) === "listing" ? "No Shape account yet" : "Not verified yet"}</span>);
  return <div className="mk-tier">{bits.reduce((acc, b, i) => (i ? [...acc, <span key={"s" + i} className="sep">·</span>, b] : [b]), [])}</div>;
}
function MkSummit({ c, big }) {
  const rated = mkIsRated(c);
  return (
    <div className={"mk-summit" + (big ? " big" : "")} style={{ left: (c._sx || 77) + "%", top: (c._sy || 66) + "%" }}>
      <span className="plate">{rated ? <><span className="dig">{mkRating10(c).toFixed(1)}</span><small>/10</small></> : <span className="dig">NEW</span>}</span>
      <span className={"lb" + (rated ? "" : " ex")}>{rated ? (big ? "Rating · " : "") + mkReviewCount(c) + " reviews" : "No reviews yet"}</span>
    </div>
  );
}
function mkCoverPos(c) { const h = mkHash(c.name); return { sx: 72 + (h % 9), sy: 62 + ((h >>> 4) % 6) }; }

// ── The coach card: a miniature of the coach's own page ───────────────────────────────────────
function CoachCard({ c, comparing = false, canCompare = true, peek = false, onCompare, onQuick }) {
  const kind = mkKind(c);
  const { sx, sy } = mkCoverPos(c);
  const price = mkPriceOf(c);
  const times = mkOpenTimes(c);
  const first = times && times.length ? times[0] : null;
  const role = c.tag === "Nutritionist" ? "nu" : "tr";
  const seed = mkHash(c.name) % 997;
  const quick = (e) => { if (onQuick) { e.preventDefault(); onQuick(c); } };
  let badge = null;
  if (kind === "listing") badge = <span className="mk-badge muted">Not bookable yet</span>;
  else if (mkIntroShut(c)) badge = <span className="mk-badge full">Full · waiting list</span>;
  else if (mkIntroAtCap(c)) badge = <span className="mk-badge full">Full · free intro open</span>;
  else badge = <span className="mk-badge">✓ Free intro</span>;
  let next;
  if (kind === "listing") next = <><span className="mk-live off" /><span className="t">No open times: this listing can't take a booking</span></>;
  else if (mkIntroShut(c)) next = <><span className="mk-live warm" /><span className="t"><b>Full</b> · waiting list open</span></>;
  else if (first && mkIntroAtCap(c)) next = <><span className="mk-live warm" /><span className="t">Full · next intro <b>{mkSlotText(first)}</b></span></>;
  else if (first) next = <><span className="mk-live" /><span className="t">{kind === "example" ? "Example · " : ""}Next open <b>{mkSlotText(first)}</b></span></>;
  else if (times && !times.length) next = <><span className="mk-live off" /><span className="t">No open times this week</span></>;
  else next = <><span className="mk-live off" /><span className="t">Open times on their page</span></>;
  const where = [c.city, c.format === "Hybrid" ? "In person + remote" : c.format === "In-person" ? "In person" : c.format].filter(Boolean).join(" · ");
  return (
    <article className={"mk-cc " + role + (comparing ? " sel" : "") + (peek ? " peek" : "")} aria-label={c.name} data-kind={kind}>
      <div className="edge"><div className="in">
        <div className="mk-cover">
          {c.cover ? <img src={c.cover} alt="" loading="lazy" /> : null}
          <span className="shade" />
          <MkTopo w={360} h={142} sx={sx / 100} sy={sy / 100} seed={seed} gid={"cg" + c.key} />
          <span className="mk-sdot" style={{ left: sx + "%", top: sy + "%" }} />
          <MkSummit c={{ ...c, _sx: sx, _sy: sy }} />
          <button type="button" className="mk-quickhit" aria-label={"Quick view: " + c.name} onClick={quick}><span>Quick view</span></button>
          {canCompare || comparing ? (
            <button type="button" className={"mk-cmp" + (comparing ? " on" : "")} aria-pressed={comparing} onClick={() => onCompare && onCompare(c)}>
              <span className={"mk-cb" + (comparing ? " on" : "")}>{comparing ? "✓" : ""}</span>{comparing ? "Comparing" : "Compare"}
            </button>
          ) : <span className="mk-cmp off" title="Compare holds 3 coaches">Compare full</span>}
          {kind === "example" ? <span className="mk-badge ex">Example</span> : badge}
        </div>
        <div className="mk-idr">
          <MkPrism c={c} />
          <div className="who">
            <button type="button" className="mk-nm" onClick={quick}><span className="t">{c.name}<span className="dot">.</span></span>{c.verified ? <span className="mk-vf" title="Credentials and insurance checked by Shape">✓</span> : null}</button>
            <MkTierLine c={c} />
          </div>
        </div>
        <div className="mk-roleb">{c.tag} · {c.role}</div>
        <p className="mk-why">{c.why || (c.specialties || []).slice(0, 3).join(" · ") || c.role}</p>
        <div className="mk-plates">
          <div className="mk-pl role"><span className="dig">{price ? "$" + price.amount : "—"}</span><span>{price ? "per " + price.per : "price on page"}</span><span className="tk" style={{ "--v": price ? Math.min(1, price.amount / (price.per === "month" ? 250 : 180)) : 0 }} /></div>
          {c.sessions ? <div className="mk-pl"><span className="dig">{Number(c.sessions).toLocaleString("en-US")}</span><span>sessions</span><span className="tk" style={{ "--v": Math.min(1, c.sessions / 2000) }} /></div>
            : c.clients ? <div className="mk-pl"><span className="dig">{c.clients}</span><span>clients</span><span className="tk" style={{ "--v": Math.min(1, c.clients / 40) }} /></div>
            : <div className="mk-pl"><span className="dig">{mkReviewCount(c)}</span><span>reviews</span><span className="tk" style={{ "--v": 0 }} /></div>}
          <div className="mk-pl"><span className="dig">{c.years || "—"}</span><span>years</span><span className="tk" style={{ "--v": Math.min(1, (c.years || 0) / 20) }} /></div>
        </div>
        <div className="mk-meta">
          <div className="r"><MkIcon name="pin" size={14} /><span className="t">{where || "Location and format on their page"}</span></div>
          <div className="r">{next}</div>
        </div>
        <div className="mk-creds">{c.cert || "Credentials on their page"}</div>
        <div className="mk-acts">
          <a className="mk-key" href={mkProfileHref(c)}>View</a>
          {kind === "listing"
            ? <span className="mk-key off" aria-disabled="true">Not bookable yet</span>
            : mkIntroShut(c)
              ? <a className="mk-key wait" href={mkProfileHref(c)}>Join waiting list</a>
              : <a className="mk-key role" href={mkIntroHref(c, kind === "live" && first ? first.iso : null)} data-book-intro="">Book a free intro</a>}
        </div>
      </div></div>
    </article>
  );
}

// ── The fold ───────────────────────────────────────────────────────────────────────────────────
function MkHeroTerrain({ count }) {
  const T = MK_HERO;
  return (
    <svg className="mk-terrain" viewBox={`0 0 ${T.W} ${T.H}`} preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="mkWarm" gradientUnits="userSpaceOnUse" cx={T.SX} cy={T.SY - 40} r="460"><stop offset="0" stopColor="#ffb454" stopOpacity=".17" /><stop offset=".55" stopColor="#ffb454" stopOpacity=".04" /><stop offset="1" stopColor="#ffb454" stopOpacity="0" /></radialGradient>
        <radialGradient id="mkTeal" gradientUnits="userSpaceOnUse" cx={T.SX - 300} cy={T.H} r="760"><stop offset="0" stopColor="#34d6c5" stopOpacity=".07" /><stop offset="1" stopColor="#34d6c5" stopOpacity="0" /></radialGradient>
        <linearGradient id="mkR2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#11232f" /><stop offset="1" stopColor="#0a141d" /></linearGradient>
        <linearGradient id="mkR4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#183440" /><stop offset="1" stopColor="#0e1d28" /></linearGradient>
        <linearGradient id="mkShaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d6c5" stopOpacity=".3" /><stop offset="1" stopColor="#34d6c5" stopOpacity="0" /></linearGradient>
        <radialGradient id="mkDot"><stop offset="0" stopColor="#e9fffb" stopOpacity=".9" /><stop offset=".35" stopColor="#34d6c5" stopOpacity=".45" /><stop offset="1" stopColor="#34d6c5" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={T.W} height={T.H} fill="url(#mkWarm)" /><rect width={T.W} height={T.H} fill="url(#mkTeal)" />
      {T.back.map((l, i) => <path key={"b" + i} d={l.d} fill="none" stroke="#34d6c5" strokeOpacity={l.o} strokeWidth="1" />)}
      <path d={T.mainFill} fill="url(#mkR2)" />
      <path d={T.main} fill="none" stroke="#34d6c5" strokeOpacity=".6" strokeWidth="1.4" />
      {T.strata.map((l, i) => <path key={"s" + i} d={l.d} fill="none" stroke="#34d6c5" strokeOpacity={l.o} strokeWidth="1" />)}
      <path d={T.frontFill} fill="url(#mkR4)" fillOpacity=".92" /><path d={T.front} fill="none" stroke="#34d6c5" strokeOpacity=".42" strokeWidth="1.2" />
      <path d={T.route} fill="none" stroke="#34d6c5" strokeOpacity=".22" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d={T.route} fill="none" stroke="#e9fffb" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={T.start[0]} cy={mkF1(T.start[1])} r="3.2" fill="#34d6c5" />
      <rect x={T.SX - 5} y={T.SY} width="10" height={T.H - T.SY} fill="url(#mkShaft)" />
      <circle cx={T.SX} cy={T.SY} r="22" fill="url(#mkDot)" /><circle cx={T.SX} cy={T.SY} r="3.6" fill="#f2fffd" />
      <g className="mk-summit-g">
        <g transform={`translate(${T.SX - 11} ${T.SY - 166}) scale(.24)`}><polygon points="14,47 14,100 51,73" fill="#34d6c5" /><polygon points="81,14 81,65 44,39" fill="#eef3f0" /></g>
        <rect x={T.SX - 64} y={T.SY - 132} width="128" height="76" rx="8" fill="#06090f" fillOpacity=".74" stroke="#34d6c5" strokeOpacity=".38" />
        <text x={T.SX} y={T.SY - 72} textAnchor="middle" className="mk-svgdig" fontSize="58" fill="#ffffff">{count == null ? "—" : count}</text>
        <text x={T.SX} y={T.SY - 34} textAnchor="middle" className="mk-svglbl" fontSize="10.5" fill="#34d6c5">YOU CAN BOOK NOW</text>
      </g>
    </svg>
  );
}
function MkHero({ f, set, counts, bookable, budgetMax, cities, onFind }) {
  const goal = f.goals.length === 1 ? MK_GOALS.find((g) => g.id === f.goals[0]) : null;
  const perMonth = f.role === "Nutritionist";
  const bKey = perMonth ? "maxMonth" : "maxSession";
  const bMax = perMonth ? budgetMax.month : budgetMax.session;
  const bVal = f[bKey] == null ? bMax : f[bKey];
  const pickGoal = (id) => set({ goals: f.goals.length === 1 && f.goals[0] === id ? [] : [id] });
  return (
    <header className="mk-hero">
      <MkHeroTerrain count={bookable} />
      <div className="mk-wrap">
        <div className="mk-hero-copy">
          <div className="mk-hero-top">
            <span className="mk-eb">The marketplace</span>
            <div className="mk-role" role="group" aria-label="Coach type">
              {[["Trainer", "Trainers"], ["Nutritionist", "Nutritionists"], ["Both", "Both"]].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={f.role === v} className={f.role === v ? "on" : ""} onClick={() => set({ role: v })}>{l}<em>{counts.role[v]}</em></button>
              ))}
            </div>
          </div>
          <h1>What are you<br /><em>training for?</em></h1>
          <p className="mk-sub">Pick a goal and the marketplace narrows to the coaches who fit your budget, your week and how you want to meet. Each coach sets their own rate, and you book a free intro before you pay for anything.</p>
          <div className="mk-goals">
            {MK_GOALS.map((g) => {
              const on = f.goals.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} className={"mk-goal" + (on ? " on" : "") + (g.nu ? " nug" : "")} onClick={() => pickGoal(g.id)}>
                  <span className="gi"><MkIcon name={g.icon} size={22} sw={1.7} /></span><b>{g.label}</b><small>{g.sub}</small>
                  <span className="gc">{on ? "✓ " : ""}{counts.goal[g.id] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        <form className="mk-matcher" aria-label="Find a coach" onSubmit={(e) => { e.preventDefault(); onFind(); }}>
          <label className="mk-mf"><span className="lbl">Goal</span>
            <span className="v sel">{goal ? <MkIcon name={goal.icon} size={18} /> : null}
              <select value={goal ? goal.id : ""} onChange={(e) => set({ goals: e.target.value ? [e.target.value] : [] })} aria-label="Goal">
                <option value="">Any goal</option>{MK_GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select><MkCaret /></span></label>
          <label className="mk-mf"><span className="lbl">Budget</span>
            <span className="v">{f[bKey] == null ? "Any" : "Up to $" + bVal} <small>/ {perMonth ? "month" : "session"}</small></span>
            <input className="mk-range" type="range" min={Math.min(30, bMax)} max={bMax} step="5" value={bVal} aria-label={"Budget per " + (perMonth ? "month" : "session")}
              onChange={(e) => { const v = Number(e.target.value); set({ [bKey]: v >= bMax ? null : v }); }} style={{ "--p": ((bVal - Math.min(30, bMax)) / Math.max(1, bMax - Math.min(30, bMax))) * 100 + "%" }} /></label>
          <div className="mk-mf"><span className="lbl">How you meet</span>
            <div className="mk-seg" role="group" aria-label="How you meet">{[["inperson", "In person"], ["remote", "Remote"], ["either", "Either"]].map(([v, l]) => <button key={v} type="button" aria-pressed={f.meet === v} className={f.meet === v ? "on" : ""} onClick={() => set({ meet: v })}>{l}</button>)}</div></div>
          <label className="mk-mf"><span className="lbl">City</span>
            <span className="v sel"><MkIcon name="pin" size={17} />
              <select value={f.city} onChange={(e) => set({ city: e.target.value })} aria-label="City">{["Anywhere", ...cities].map((c) => <option key={c} value={c}>{c}</option>)}</select><MkCaret /></span></label>
          <button className="mk-find" type="submit">Find my coach <span className="n"><b className="dig">{bookable}</b><small>bookable</small></span></button>
        </form>
      </div>
    </header>
  );
}
function MkTrust() {
  const T = [
    ["✓", "Vetted at sign-up", "Credentials, insurance and Shape’s code of conduct before a listing goes live."],
    ["✓", "Verified badge", "Shape checked this coach’s certificate and liability insurance."],
    ["$", "Coaches set their own rates", "The price on a card is the coach’s, not a Shape markup."],
    ["→", "Free intro first", "Book a free call to see if you fit, before you pay anything."],
    ["×", "Cancel any time", "Coaching sits on the $5/mo membership. No lock-in."],
  ];
  return <section className="mk-trust" aria-label="How coaching on Shape works"><div className="mk-wrap row">{T.map(([g, b, s]) => <div className="ti" key={b}><i aria-hidden="true">{g}</i><div><b>{b}</b><span>{s}</span></div></div>)}</div></section>;
}

// Editors' picks: featured listings with an account first, filled out with example coaches, each
// labelled. `tab` narrows to a side; `picks` and `onOpen` come from the page.
function mkPicksFor(tab, live) {
  const want = (c) => tab === "Both" || !tab || c.tag === tab;
  const real = (live || []).filter((c) => mkKind(c) === "live" && c.featured && want(c)).slice(0, 4);
  const ex = ["Maya Okafor", "Diego Alvarez", "Priya Natarajan", "Rae Lindqvist", "Tomás Reyes", "Sofia Marchetti", "Ben Caldwell", "Cal Redmond", "Claire Donovan", "Nadia Chen"]
    .map((n) => COACHES_FULL.find((c) => c.name === n)).filter((c) => c && want(c));
  return [...real, ...ex].slice(0, 4);
}
function Spotlight({ tab = "Both", picks, onOpen }) {
  const list = (picks || mkPicksFor(tab, [])).map((c) => (c.goals ? c : { ...c, key: c.key || "s" + mkHash(c.name), goals: mkGoalsOf(c) }));
  if (!list.length) return null;
  return (
    <section className="mk-wrap mk-picks" aria-label="Editors' picks">
      <div className="mk-sec-h"><div><span className="mk-eb">Four to know · this week</span><h2>Editors’ picks across <em>Shape.</em></h2></div>
        <p>Chosen by Shape’s editors from the marketplace. A paid placement would say Boosted on its card, and is never ranked higher in your results.</p></div>
      <div className="grid">
        {list.map((c) => {
          const kind = mkKind(c); const { sx, sy } = mkCoverPos(c); const price = mkPriceOf(c);
          return (
            <button type="button" key={c.key} className={"mk-pick " + (c.tag === "Nutritionist" ? "nu" : "tr")} onClick={() => onOpen && onOpen(c)} aria-label={"Quick view: " + c.name}>
              <span className="edge"><span className="in">
                <span className="pc">{c.cover ? <img src={c.cover} alt="" loading="lazy" /> : null}<span className="shade" /><MkTopo w={300} h={56} sx={sx / 100} sy={0.5} seed={mkHash(c.name) % 997} gid={"pg" + c.key} /></span>
                <span className="body">
                  <MkPrism c={c} size={54} />
                  <span className="who"><b>{c.name}</b><span className="ro">{c.tag} · {c.role}</span></span>
                  <span className="wy">{c.why}</span>
                  <span className="ft"><span className="mini"><span className="dig">{mkIsRated(c) ? mkRating10(c).toFixed(1) : "NEW"}</span></span>{mkIsRated(c) ? "/10 · " : ""}<b>{price ? "$" + price.amount : ""}</b>{price ? " per " + price.per : ""}</span>
                  <span className={"tag" + (kind === "example" ? " ex" : "")}>{kind === "example" ? "Example" : "Editors’ pick"}</span>
                </span>
              </span></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── The filter rail (a bottom sheet on a phone) ─────────────────────────────────────────────────
function MkGroup({ title, k, open, onToggle, children }) {
  return (
    <div className={"mk-rg" + (open ? "" : " closed")}>
      <button type="button" className="mk-rg-h" aria-expanded={open} onClick={onToggle}><span>{title}{k ? <span className="k">{k}</span> : null}</span><MkCaret up={open} /></button>
      {open ? <div className="mk-rg-b">{children}</div> : null}
    </div>
  );
}
function MkOpt({ on, label, n, onClick, radio }) {
  return (
    <button type="button" role={radio ? "radio" : "checkbox"} aria-checked={on} className={"mk-opt" + (on ? " on" : "") + (!n && !on ? " zero" : "")} onClick={onClick}>
      <span className={"mk-cb" + (on ? " on" : "") + (radio ? " rd" : "")}>{on && !radio ? "✓" : ""}</span>
      <span>{label}</span><span className="n">{n}</span>
    </button>
  );
}
function MkToggle({ on, label, n, onClick }) {
  return <button type="button" role="switch" aria-checked={on} className={"mk-tg" + (on ? " on" : "")} onClick={onClick}><span>{label}{n != null ? <span className="n"> {n}</span> : null}</span><span className={"mk-toggle" + (on ? " on" : "")} /></button>;
}
function MkFilters({ f, set, counts, budgetMax, cities, specs, onReset }) {
  const [open, setOpen] = useS({ coach: true, goal: true, spec: true, budget: true, meet: true, city: true, avail: true, trust: true });
  const tog = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const flip = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });
  const hist = (vals, max) => { const bins = new Array(12).fill(0); vals.forEach((v) => { bins[Math.min(11, Math.floor((v / Math.max(1, max)) * 12))] += 1; }); const top = Math.max(1, ...bins); return bins.map((b) => b / top); };
  const range = (key, max, unit) => {
    const v = f[key] == null ? max : f[key];
    const bins = hist(counts.prices[unit], max);
    return (
      <div className="mk-budget">
        <div className="mk-sublbl">Per {unit} · {unit === "session" ? "trainers" : "monthly coaching"}</div>
        <div className="mk-hist" aria-hidden="true">{bins.map((b, i) => <i key={i} className={(i + 0.5) / 12 * max <= v ? "in" : ""} style={{ height: Math.max(6, b * 100) + "%" }} />)}</div>
        <input className="mk-range" type="range" min="0" max={max} step="5" value={v} aria-label={"Budget per " + unit} onChange={(e) => { const n = Number(e.target.value); set({ [key]: n >= max ? null : n }); }} style={{ "--p": (v / max) * 100 + "%" }} />
        <div className="mk-range-v"><span>$0</span><span>{f[key] == null ? "Any price" : <>up to <b className="dig">${v}</b></>}</span></div>
      </div>
    );
  };
  const nGoals = f.goals.length, nSpecs = f.specs.length;
  const nBudget = (f.maxSession != null ? 1 : 0) + (f.maxMonth != null ? 1 : 0);
  return (
    <div className="mk-filters">
      <label className="mk-field"><MkIcon name="search" size={15} /><input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name or specialty" aria-label="Search coaches by name or specialty" /></label>
      <MkGroup title="Coach" open={open.coach} onToggle={() => tog("coach")} k={f.role !== "Both" ? 1 : 0}>
        {[["Both", "Trainers and nutritionists"], ["Trainer", "Trainers"], ["Nutritionist", "Nutritionists"]].map(([v, l]) => <MkOpt key={v} radio on={f.role === v} label={l} n={counts.role[v]} onClick={() => set({ role: v })} />)}
      </MkGroup>
      <MkGroup title="Goal" open={open.goal} onToggle={() => tog("goal")} k={nGoals}>
        {MK_GOALS.map((g) => <MkOpt key={g.id} on={f.goals.includes(g.id)} label={g.label} n={counts.goal[g.id] || 0} onClick={() => flip("goals", g.id)} />)}
      </MkGroup>
      {specs.length ? (
        <MkGroup title="Specialty" open={open.spec} onToggle={() => tog("spec")} k={nSpecs}>
          {specs.map(([s, n]) => <MkOpt key={s} on={f.specs.includes(s)} label={s} n={n} onClick={() => flip("specs", s)} />)}
        </MkGroup>
      ) : null}
      <MkGroup title="Budget" open={open.budget} onToggle={() => tog("budget")} k={nBudget}>
        {f.role !== "Nutritionist" ? range("maxSession", budgetMax.session, "session") : null}
        {range("maxMonth", budgetMax.month, "month")}
      </MkGroup>
      <MkGroup title="How you meet" open={open.meet} onToggle={() => tog("meet")} k={f.meet !== "either" ? 1 : 0}>
        {[["either", "Either"], ["inperson", "In person"], ["remote", "Remote"]].map(([v, l]) => <MkOpt key={v} radio on={f.meet === v} label={l} n={counts.meet[v]} onClick={() => set({ meet: v })} />)}
        <p className="mk-note">Listings that don't say how they meet show under Either.</p>
      </MkGroup>
      <MkGroup title="City" open={open.city} onToggle={() => tog("city")} k={f.city !== "Anywhere" ? 1 : 0}>
        <label className="mk-field"><MkIcon name="pin" size={15} /><select value={f.city} onChange={(e) => set({ city: e.target.value })} aria-label="City">{["Anywhere", ...cities].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <p className="mk-note">A city keeps the coaches there, plus remote coaches unless you pick In person.</p>
      </MkGroup>
      <MkGroup title="Availability" open={open.avail} onToggle={() => tog("avail")} k={f.openWeek ? 1 : 0}>
        <MkToggle on={f.openWeek} label="Open intro this week" n={counts.openWeek} onClick={() => set({ openWeek: !f.openWeek })} />
      </MkGroup>
      <MkGroup title="Trust & offers" open={open.trust} onToggle={() => tog("trust")} k={(f.verified ? 1 : 0) + (f.intro ? 1 : 0) + (f.taking ? 1 : 0)}>
        <MkToggle on={f.verified} label="✓ Verified only" n={counts.verified} onClick={() => set({ verified: !f.verified })} />
        <MkToggle on={f.intro} label="Free intro open" n={counts.intro} onClick={() => set({ intro: !f.intro })} />
        <MkToggle on={f.taking} label="Taking new clients" n={counts.taking} onClick={() => set({ taking: !f.taking })} />
      </MkGroup>
      {onReset ? <button type="button" className="mk-reset" onClick={onReset}>Reset all filters</button> : null}
    </div>
  );
}

// ── The quick view: the coach's page, condensed ───────────────────────────────────────────────
function MkQuickView({ c, index, total, onPrev, onNext, onClose, signedIn, comparing, canCompare, onCompare }) {
  const closeRef = useR(null);
  const [ask, setAsk] = useS("");
  useE(() => { setAsk(""); }, [c && c.key]);
  useE(() => {
    const prev = document.activeElement;
    try { closeRef.current && closeRef.current.focus({ preventScroll: true }); } catch (e) {}
    const onKey = (e) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowRight" && onNext) onNext(); else if (e.key === "ArrowLeft" && onPrev) onPrev(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); try { prev && prev.focus && prev.focus({ preventScroll: true }); } catch (e) {} };
  }, [c && c.key]);
  if (!c) return null;
  const kind = mkKind(c);
  const first = mkFirst(c.name);
  const price = mkPriceOf(c);
  const times = mkOpenTimes(c) || [];
  const { sx, sy } = mkCoverPos(c);
  const role = c.tag === "Nutritionist" ? "nu" : "tr";
  const where = [c.city, c.format === "Hybrid" ? "in person + remote" : c.format === "In-person" ? "in person" : c.format ? "remote" : null].filter(Boolean).join(" · ");
  const status = kind === "listing" ? "Not bookable yet" : mkIntroShut(c) ? "Full · waiting list open" : mkIntroAtCap(c) ? "Full · free intros open" : kind === "example" ? "Example coach" : "Taking new clients";
  const packages = [];
  if (mkIntroOpen(c)) packages.push(["Start here", "Free intro", "15 min · see if you fit", "$0", "", true]);
  if (c.packages) c.packages.forEach(([n, s, p, u]) => packages.push([u ? "Ongoing" : "One-off", n, s, "$" + p, u ? "/" + u : ""]));
  else if (price) packages.push([price.per === "month" ? "Ongoing" : "One-off", price.per === "month" ? "Monthly coaching" : "1:1 session", price.per === "month" ? "Their monthly coaching, as listed" : "One session, as listed", "$" + price.amount, price.per === "month" ? "/mo" : ""]);
  const message = () => {
    if (signedIn !== true) { setAsk("signin"); return; }
    if (kind !== "live") { setAsk("nolive"); return; }
    try { if (window.__openChat) { window.__openChat({ who: c.name, providerRole: mkRoleParam(c), providerId: c.providerId, role: c.tag }); return; } } catch (e) {}
    setAsk("nochat");
  };
  const here = typeof window !== "undefined" ? window.location.pathname + window.location.search + window.location.hash : "/newdesign/Coaches.html";
  const statLine = [
    c.sessions ? [Number(c.sessions).toLocaleString("en-US"), "Sessions coached", Math.min(1, c.sessions / 2000)] : null,
    c.clients ? [String(c.clients), "Active clients", Math.min(1, c.clients / 14)] : null,
    [c.years ? String(c.years) : "—", "Years coaching", Math.min(1, (c.years || 0) / 20)],
    kind === "listing" ? ["0", "Can take bookings", 0] : c.spots != null ? [String(c.spots), "Spots open now", Math.min(1, c.spots / 10), true] : [mkReviewCount(c) ? String(mkReviewCount(c)) : "0", "Reviews", Math.min(1, mkReviewCount(c) / 300)],
  ].filter(Boolean).slice(0, 4);
  return (
    <>
      <div className="mk-scrim" onClick={onClose} aria-hidden="true" />
      <aside className={"mk-qv " + role} role="dialog" aria-modal="true" aria-label={"Quick view: " + c.name}>
        <div className="mk-qv-top">
          <div className="l"><span className="mk-eb">Quick view</span>{kind === "example" ? <span className="mk-exlabel">Example coach</span> : kind === "listing" ? <span className="mk-exlabel muted">Not bookable yet</span> : null}</div>
          <div className="r">
            {total > 1 ? <span className="mk-qnav"><button type="button" onClick={onPrev} aria-label="Previous coach">‹</button><span><b className="dig">{index + 1}</b> of {total}</span><button type="button" onClick={onNext} aria-label="Next coach">›</button></span> : null}
            <button type="button" ref={closeRef} className="mk-qx" onClick={onClose} aria-label="Close quick view">×</button>
          </div>
        </div>
        <div className="mk-qv-body">
          <div className="mk-qv-hero">
            {c.cover ? <img src={c.cover} alt="" /> : null}<span className="shade" />
            <MkTopo w={600} h={230} sx={0.8} sy={0.6} seed={(mkHash(c.name) % 997) + 33} gid={"qg" + c.key} />
            {c.years ? <span className="mk-camp" style={{ left: "32%", top: "86.5%" }}><i /><span className="mk-dtl">{new Date().getFullYear() - c.years} · first client</span></span> : null}
            {c.sessions >= 1000 ? <span className="mk-camp" style={{ left: "58%", top: "74%" }}><i /><span className="mk-dtl">1,000 sessions</span></span> : null}
            <span className="mk-sdot" style={{ left: "80%", top: "60%" }} />
            <MkSummit c={{ ...c, _sx: 80, _sy: 60 }} big />
            <span className={"mk-qchip" + (kind === "listing" || c.atCapacity ? " warm" : "")}><span className={"mk-live" + (kind === "listing" ? " off" : c.atCapacity ? " warm" : "")} />{status}</span>
          </div>
          <div className="mk-qv-id">
            <MkPrism c={c} size={104} />
            <div className="who">
              <div className="mk-dtl teal">{c.role}{c.city ? " · " + c.city : ""}</div>
              <div className="mk-qnm">{c.name}<span className="dot">.</span></div>
              <div className="mk-qchips">
                {c.verified ? <span className="v">✓ Verified by Shape</span> : null}
                {mkCoachTier(c) ? <span><i style={{ background: mkCoachTier(c).color }} />{mkCoachTier(c).name}</span> : null}
                {c.format ? <span>{c.format === "Hybrid" ? "In person + remote" : c.format === "In-person" ? "In person" : "Remote"}</span> : null}
              </div>
            </div>
          </div>
          {c.bio || c.why ? <p className="mk-qv-bio">{c.bio ? "“" + c.bio + "”" : c.why}</p> : null}
          <div className="mk-qv-loc"><MkIcon name="pin" size={14} />{where || "Location and format on their page"}<span className="sep" />{price ? mkPriceText(c) : "Price on their page"}</div>
          <div className="mk-qv-stats">{statLine.map(([v, l, p, on]) => <div key={l} className={"mk-ip" + (on ? " on" : "")}>{on ? <span className="mk-live" /> : null}<span className="dig">{v}</span><span className="mk-dtl">{l}</span><span className="tk" style={{ "--v": p }} /></div>)}</div>

          {c.highlights ? <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">Highlights</span></div>
            <div className="mk-hls">{c.highlights.map(([t, im]) => <span key={t} className="hl"><span className="pz"><img src={im} alt="" loading="lazy" /></span><small>{t}</small></span>)}</div></div> : null}

          {c.programs ? <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">The range · each peak a session</span><a href={mkProfileHref(c)}>All on their page →</a></div>
            <div className="mk-progs">{c.programs.map((p, i) => (
              <div key={p.name} className="prog"><div className="pim"><img src={p.img} alt="" loading="lazy" /><span className="pch mk-dtl">{p.kind}</span><MkPeaks n={p.weeks * 2} seed={i * 7 + 4} /><span className="ptop mk-dtl"><b className="dig">{p.weeks}</b> {p.weeks === 1 ? "week" : "weeks"} to the top</span></div>
                <div className="pbody"><b>{p.name}</b><span>{p.line}</span><div className="pf"><span className="dig">${p.price}</span><span className="mk-dtl">one-off</span></div></div></div>
            ))}</div></div> : null}

          {packages.length ? <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">Work with {first}</span><span className="note">{kind === "listing" ? "Opens when the coach joins Shape." : "Everything runs in the Shape app."}</span></div>
            <div className="mk-pk">{packages.map(([eb, n, s, p, u, hi]) => <div key={n} className={"pkr" + (hi ? " hi" : "")}><div><span className="mk-dtl">{eb}</span><b>{n}</b><span className="s">{s}</span></div><span className="pp"><span className="dig">{p}</span>{u ? <i>{u}</i> : null}</span></div>)}</div></div> : null}

          <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">Next open · free intro</span><span className="note">{kind === "example" ? "Example times" : "Your time"}</span></div>
            {kind === "listing" ? <p className="mk-empty">No open times: this listing has no Shape account yet.</p>
              : mkIntroShut(c) ? <p className="mk-empty">{first} is full right now. Join the waiting list on their page.</p>
              : times.length ? <div className="mk-slots">{times.slice(0, 4).map((s, i) => (
                <a key={s.iso} className={"slot" + (i === 0 ? " on" : "")} href={mkIntroHref(c, kind === "live" ? s.iso : null)}><span className="mk-dtl">{mkSlotText(s).split(" · ")[0]}</span><span className="dig">{mkSlotText(s, false).replace(/\s?(AM|PM|am|pm)$/, "")}</span><span className="mk-dtl">{(mkSlotText(s, false).match(/(AM|PM|am|pm)$/) || [""])[0]}</span></a>
              ))}<a className="slot more" href={mkIntroHref(c)}>All times →</a></div>
              : <p className="mk-empty">{Array.isArray(c.openTimes) ? "No open times in the next week." : "Open times are on their page."}</p>}
          </div>

          <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">In their words</span></div>
            <div className="mk-rev"><div className="n">{mkIsRated(c) ? <><span className="dig">{mkRating10(c).toFixed(1)}</span><small>/10 · {mkReviewCount(c)} reviews</small></> : <><span className="dig">NEW</span><small>No reviews yet</small></>}</div>
              <div className="mk-lock"><MkIcon name="lock" size={15} /><span>{mkIsRated(c) ? "Members read the reviews on " + first + "’s page." : first + " has no reviews yet."} Here you see the rating only.</span></div></div></div>

          <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">Credentials{c.verified ? " · checked by Shape" : ""}</span></div>
            <div className="mk-crs">{(c.cert ? c.cert.split(/\s·\s/) : []).map((x) => <span key={x}>{c.verified ? <b>✓</b> : null}{x}</span>)}{c.certFull ? <span className="full">{c.certFull}</span> : null}{c.verified ? <span><b>✓</b>Liability insurance <small>on file</small></span> : null}{!c.cert && !c.certFull ? <span className="none">On their page</span> : null}</div></div>

          {c.socials ? <div className="mk-qv-sec"><div className="mk-qv-h"><span className="mk-eb">Find me</span><span className="note">Example links</span></div>
            <div className="mk-socs">{c.socials.map(([ic, n, h]) => <span key={n} className="soc"><MkIcon name={ic} size={16} /><span>{n}<small>{h}</small></span></span>)}</div></div> : null}
          <div style={{ height: 22 }} />
        </div>
        <div className="mk-qv-foot">
          {ask ? (
            <div className="mk-ask" role="status">
              {ask === "signin" ? <><span>Sign in to message {first}.</span><a className="mk-key sm" href={"/newdesign/Login.html?next=" + encodeURIComponent(here)}>Log in</a><a className="mk-key sm teal" href={"/newdesign/SignupClient.html?next=" + encodeURIComponent(here)}>Join Shape</a></>
                : ask === "nolive" ? <span>{kind === "example" ? "Example coaches can't be messaged." : first + " has no Shape account yet, so there is no one to message."}</span>
                : <span>Messages open from your dashboard.</span>}
              <button type="button" className="mk-askx" onClick={() => setAsk("")} aria-label="Dismiss">×</button>
            </div>
          ) : null}
          <div className="acts">
            <a className="mk-key" href={mkProfileHref(c)}>View full profile ↗</a>
            <button type="button" className="mk-key" onClick={message}><MkIcon name="chat" size={16} />Message</button>
            {kind === "listing" ? <span className="mk-key off big" aria-disabled="true">Not bookable yet</span>
              : mkIntroShut(c) ? <a className="mk-key wait big" href={mkProfileHref(c)}>Join the waiting list</a>
              : <a className="mk-key role big" href={mkIntroHref(c, kind === "live" && times[0] ? times[0].iso : null)} data-book-intro="">Book a free intro{times[0] ? " · " + mkSlotText(times[0]) : ""}</a>}
          </div>
          <div className="fine">
            <button type="button" className={"mk-cmp-l" + (comparing ? " on" : "")} disabled={!comparing && !canCompare} onClick={() => onCompare(c)}>{comparing ? "✓ In compare" : canCompare ? "＋ Add to compare" : "Compare holds 3"}</button>
            <p>{kind === "listing" ? "Booking opens when this coach joins Shape." : "The intro is free. Coaching needs a Shape membership ($5/mo, cancel any time) and a short health screening."}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
function MkPeaks({ n, seed }) {
  const W = 260, H = 70, r = mkRng(seed); const pts = [[0, H]]; const dx = W / (n * 2);
  for (let i = 0; i < n * 2; i++) { const top = i % 2 === 0; const base = H - 8 - (i / (n * 2)) * (H - 26); pts.push([dx * (i + 1), top ? base - 10 - r() * 10 : base + 4]); }
  pts.push([W, 8]);
  const line = pts.slice(1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={mkD(pts) + `L${W} ${H}Z`} className="pkf" />
      <path d={mkD(line)} fill="none" stroke="#f2fffd" strokeOpacity=".85" strokeWidth="1.3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <circle cx={W - 2} cy="8" r="3" fill="#f2fffd" />
    </svg>
  );
}

// ── Compare: the tray, and the side-by-side ────────────────────────────────────────────────────
function MkTray({ list, onRemove, onOpen, onClear }) {
  if (!list.length) return null;
  return (
    <div className="mk-tray" role="region" aria-label="Compare">
      <div className="lbl"><b>Compare</b><small>{list.length} of 3 picked</small></div>
      {list.map((c) => <span key={c.key} className={"mk-tchip " + (c.tag === "Nutritionist" ? "nu" : "tr")}><MkPrism c={c} size={30} /><span className="t">{mkFirst(c.name)}</span><button type="button" onClick={() => onRemove(c)} aria-label={"Remove " + c.name + " from compare"}>×</button></span>)}
      {list.length < 3 ? <span className="mk-tslot">＋ Add {list.length === 1 ? "one or two" : "one"}</span> : null}
      <button type="button" className="mk-key teal" disabled={list.length < 2} onClick={onOpen}>{list.length < 2 ? "Pick one more" : "Compare side by side →"}</button>
      <button type="button" className="mk-trayx" onClick={onClear} aria-label="Clear compare">Clear</button>
    </div>
  );
}
function MkCompare({ list, onClose, onRemove }) {
  const closeRef = useR(null);
  useE(() => {
    try { closeRef.current && closeRef.current.focus({ preventScroll: true }); } catch (e) {}
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const rows = [
    ["Price", (c) => mkPriceText(c)],
    ["Rating", (c) => (mkIsRated(c) ? mkRating10(c).toFixed(1) + "/10 · " + mkReviewCount(c) + " reviews" : "New · no reviews yet")],
    ["Tier", (c) => (mkCoachTier(c) ? mkCoachTier(c).name : "—")],
    ["Experience", (c) => (c.years ? c.years + " years" : "—")],
    ["How you meet", (c) => (c.format === "Hybrid" ? "In person + remote" : c.format === "In-person" ? "In person" : c.format || "On their page")],
    ["City", (c) => c.city || "On their page"],
    ["Next open", (c) => { const t = mkOpenTimes(c); return mkKind(c) === "listing" ? "Not bookable yet" : mkIntroShut(c) ? "Full · waiting list" : t && t.length ? (mkKind(c) === "example" ? "Example · " : "") + mkSlotText(t[0]) : "On their page"; }],
    ["Free intro", (c) => (mkIntroOpen(c) ? "Yes" : "No")],
    ["Verified by Shape", (c) => (c.verified ? "✓ Yes" : "Not yet")],
    ["Credentials", (c) => c.cert || c.certFull || "—"],
  ];
  return (
    <>
      <div className="mk-scrim" onClick={onClose} aria-hidden="true" />
      <div className="mk-cmpdlg" role="dialog" aria-modal="true" aria-label="Compare coaches">
        <div className="mk-cmp-top"><span className="mk-eb">Compare · side by side</span><button type="button" ref={closeRef} className="mk-qx" onClick={onClose} aria-label="Close compare">×</button></div>
        <div className="mk-cmp-scroll">
          <table className="mk-cmp-t" style={{ "--n": list.length }}>
            <thead><tr><th scope="col"><span className="mk-sr">Coach</span></th>{list.map((c) => (
              <th key={c.key} scope="col" className={c.tag === "Nutritionist" ? "nu" : "tr"}><div className="hd"><MkPrism c={c} size={56} /><div><b>{c.name}</b><span>{c.tag} · {c.role}</span>{c.sample ? <span className="mk-exlabel">Example</span> : null}</div></div>
                <button type="button" className="rm" onClick={() => onRemove(c)}>Remove</button></th>
            ))}</tr></thead>
            <tbody>{rows.map(([label, fn]) => <tr key={label}><th scope="row">{label}</th>{list.map((c) => <td key={c.key}>{fn(c)}</td>)}</tr>)}
              <tr><th scope="row"><span className="mk-sr">Actions</span></th>{list.map((c) => <td key={c.key}><div className={"act " + (c.tag === "Nutritionist" ? "nu" : "tr")}>
                {mkKind(c) === "listing" ? <span className="mk-key off" aria-disabled="true">Not bookable yet</span> : mkIntroShut(c) ? <a className="mk-key wait" href={mkProfileHref(c)}>Join waiting list</a> : <a className="mk-key role" href={mkIntroHref(c)}>Book a free intro</a>}
                <a className="mk-key" href={mkProfileHref(c)}>View</a></div></td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── The page ───────────────────────────────────────────────────────────────────────────────────
const MK_PAGE = 12;
function Marketplace() {
  // Read at FIRST render, not in an effect: seeding a side and correcting it after mount shows the
  // wrong one for a frame. `?role=trainer|nutritionist` too: the website's own fallback links into
  // the marketplace (coach-profile-path.mjs) say which side to open that way.
  const [f, setF] = useS(() => ({ ...MK_DEFAULTS, role: (typeof window !== "undefined" && (mkTabFromHash(window.location.hash)
    || mkTabFromHash(new URLSearchParams(window.location.search).get("role")))) || "Both" }));
  const [sort, setSort] = useS("best");
  const [shown, setShown] = useS(MK_PAGE);
  const [cmp, setCmp] = useS([]);
  const [quick, setQuick] = useS(null);
  const [cmpOpen, setCmpOpen] = useS(false);
  const [sheet, setSheet] = useS(false);
  const [signedIn, setSignedIn] = useS(null);
  const resultsRef = useR(null);
  const live = useLiveCoaches();

  // Sticky needs a scrolling ancestor that is not `body`: pageShell's `html, body { overflow-x:
  // hidden }` makes body the scroll container, and the old filter bar never stuck. `clip` keeps the
  // sideways cut without making one, on this page only (the class scopes it; see the stylesheet).
  useE(() => { document.documentElement.classList.add("mk-root"); return () => document.documentElement.classList.remove("mk-root"); }, []);
  useE(() => {
    let on = true;
    fetch("/api/me", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on) setSignedIn(!!(j && j.user && j.user.id)); }, () => { if (on) setSignedIn(false); });
    return () => { on = false; };
  }, []);
  // Follow the hash while the page is open, so the nav works FROM the page as well as onto it.
  useE(() => {
    const onHash = () => { const t = mkTabFromHash(window.location.hash); if (t) setF((o) => ({ ...o, role: t })); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // ⚠ replaceState, NOT `location.hash = …`: assigning fires `hashchange` (re-entering the listener
  // above) and pushes a history entry per press, so Back would walk the switch instead of leaving.
  const firstRole = useR(true);
  useE(() => {
    if (firstRole.current) { firstRole.current = false; return; }
    // The switch is the side now: a `?role=` the page opened on would pick it again on a reload.
    try { const q = new URLSearchParams(window.location.search); q.delete("role"); const qs = q.toString(); window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + mkHashForTab(f.role)); } catch (e) {}
  }, [f.role]);
  useE(() => { setShown(MK_PAGE); }, [f, sort]);
  useE(() => {
    const lock = !!(quick || cmpOpen || sheet);
    document.body.style.overflow = lock ? "hidden" : "";
    // The site's floating chat launcher sits above everything; while a dialog is open it would cover
    // the dialog's own footer (its Book and Message), so it steps aside until the dialog closes.
    document.documentElement.classList.toggle("mk-modal", lock);
    return () => { document.body.style.overflow = ""; document.documentElement.classList.remove("mk-modal"); };
  }, [quick, cmpOpen, sheet]);

  const set = (patch) => setF((o) => ({ ...o, ...patch }));
  const all = useM(() => {
    // Live listings first; a sample coach whose name a real account already uses steps aside.
    const liveRows = live.rows || [];
    const names = new Set(liveRows.filter((c) => c.ownerId).map((c) => c.name.toLowerCase()));
    const samples = COACHES_FULL.filter((c) => !names.has(c.name.toLowerCase())).map((c) => ({ ...c, key: "s" + mkHash(c.name) }));
    return [...liveRows, ...samples].map((c) => ({ ...c, goals: mkGoalsOf(c) }));
  }, [live.rows]);
  const cities = useM(() => [...new Set(all.map((c) => c.city).filter(Boolean))].sort(), [all]);
  const budgetMax = useM(() => {
    const s = all.map(mkPriceOf).filter((p) => p && p.per === "session").map((p) => p.amount);
    const m = all.map(mkPriceOf).filter((p) => p && p.per === "month").map((p) => p.amount);
    const up = (v, d) => Math.ceil(Math.max(d, ...v) / 10) * 10;
    return { session: up(s, 150), month: up(m, 160) };
  }, [all]);

  const matched = useM(() => all.filter((c) => mkPass(c, f)), [all, f]);
  const counts = useM(() => {
    const n = (patch) => all.filter((c) => mkPass(c, { ...f, ...patch })).length;
    const goal = {}; MK_GOALS.forEach((g) => { goal[g.id] = n({ goals: [g.id] }); });
    const pool = all.filter((c) => mkPass(c, { ...f, maxSession: null, maxMonth: null }));
    return {
      role: { Both: n({ role: "Both" }), Trainer: n({ role: "Trainer" }), Nutritionist: n({ role: "Nutritionist" }) },
      goal,
      meet: { either: n({ meet: "either" }), inperson: n({ meet: "inperson" }), remote: n({ meet: "remote" }) },
      openWeek: n({ openWeek: true }), verified: n({ verified: true }), intro: n({ intro: true }), taking: n({ taking: true }),
      prices: { session: pool.map(mkPriceOf).filter((p) => p && p.per === "session").map((p) => p.amount), month: pool.map(mkPriceOf).filter((p) => p && p.per === "month").map((p) => p.amount) },
    };
  }, [all, f]);
  const specs = useM(() => {
    const pool = all.filter((c) => mkPass(c, { ...f, specs: [] }));
    const m = new Map();
    pool.forEach((c) => (c.specialties || []).forEach((s) => { const k = s.trim(); if (k) m.set(k, (m.get(k) || 0) + 1); }));
    const top = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
    f.specs.forEach((s) => { if (!top.some(([k]) => k === s)) top.push([s, m.get(s) || 0]); });
    return top;
  }, [all, f]);
  const bookable = matched.filter(mkCanBook).length;
  const groups = MK_GROUPS.map(([k, title, note]) => ({ k, title, note, list: mkSort(matched.filter((c) => mkKind(c) === k), sort, f) })).filter((g) => g.list.length);
  const ordered = groups.flatMap((g) => g.list);
  const visible = ordered.slice(0, shown);
  const quickIdx = quick ? ordered.findIndex((c) => c.key === quick) : -1;
  const quickCoach = quickIdx >= 0 ? ordered[quickIdx] : (quick ? all.find((c) => c.key === quick) || null : null);
  const cmpList = cmp.map((k) => all.find((c) => c.key === k)).filter(Boolean);
  const toggleCmp = (c) => setCmp((l) => (l.includes(c.key) ? l.filter((k) => k !== c.key) : l.length >= 3 ? l : [...l, c.key]));
  const picks = useM(() => mkPicksFor(f.role, all).map((c) => all.find((x) => x.name === c.name && x.tag === c.tag) || c), [f.role, all]);
  const goTo = () => { try { resultsRef.current && resultsRef.current.scrollIntoView({ behavior: MK_RPR ? "auto" : "smooth", block: "start" }); } catch (e) {} };
  const reset = () => setF({ ...MK_DEFAULTS, role: f.role });

  const pills = [];
  if (f.role !== "Both") pills.push([f.role === "Trainer" ? "Trainers" : "Nutritionists", { role: "Both" }]);
  f.goals.forEach((g) => pills.push([MK_GOALS.find((x) => x.id === g).label, { goals: f.goals.filter((x) => x !== g) }]));
  f.specs.forEach((s) => pills.push([s, { specs: f.specs.filter((x) => x !== s) }]));
  if (f.maxSession != null) pills.push(["Up to $" + f.maxSession + " / session", { maxSession: null }]);
  if (f.maxMonth != null) pills.push(["Up to $" + f.maxMonth + " / month", { maxMonth: null }]);
  if (f.meet !== "either") pills.push([f.meet === "inperson" ? "In person" : "Remote", { meet: "either" }]);
  if (f.city !== "Anywhere") pills.push([f.city + (f.meet !== "inperson" ? " or remote" : ""), { city: "Anywhere" }]);
  if (f.openWeek) pills.push(["Open this week", { openWeek: false }]);
  if (f.verified) pills.push(["Verified only", { verified: false }]);
  if (f.intro) pills.push(["Free intro open", { intro: false }]);
  if (f.taking) pills.push(["Taking new clients", { taking: false }]);
  if (f.q) pills.push(["“" + f.q + "”", { q: "" }]);
  const examples = matched.filter((c) => mkKind(c) === "example").length;
  const listings = matched.filter((c) => mkKind(c) === "listing").length;

  let lastGroup = null;
  return (
    <>
    <Header active="Coaches" />
    <div className="mk">
      <MkHero f={f} set={set} counts={counts} bookable={bookable} budgetMax={budgetMax} cities={cities} onFind={goTo} />
      <MkTrust />
      <Spotlight tab={f.role} picks={picks} onOpen={(c) => setQuick(c.key)} />
      <section className="mk-wrap mk-results" id="results" ref={resultsRef}>
        <aside className="mk-rail" aria-label="Filters">
          <div className="mk-rail-h"><b>Refine</b><button type="button" onClick={reset}>Reset all</button></div>
          <MkFilters f={f} set={set} counts={counts} budgetMax={budgetMax} cities={cities} specs={specs} />
        </aside>
        <div className="mk-res">
          <div className="mk-resbar">
            <div className="mk-res-head">
              <div>
                <h2><span className="mk-count dig" aria-live="polite">{bookable}</span>{bookable === 1 ? "coach" : "coaches"} you can book</h2>
                <p>{live.state === "loading" ? "Reading the live listings…" : [examples ? examples + " example coach" + (examples === 1 ? "" : "es") : null, listings ? listings + " listing" + (listings === 1 ? "" : "s") + " not bookable yet" : null].filter(Boolean).length ? "Also showing " + [examples ? examples + " example coach" + (examples === 1 ? "" : "es") : null, listings ? listings + " listing" + (listings === 1 ? "" : "s") + " not bookable yet" : null].filter(Boolean).join(" and ") + "." : "Showing every coach that fits."}</p>
              </div>
              <div className="mk-tools">
                <button type="button" className="mk-key mk-filters-btn" onClick={() => setSheet(true)}><MkIcon name="sliders" size={16} />Filters{pills.length ? <span className="k">{pills.length}</span> : null}</button>
                <label className="mk-sel"><MkIcon name="sort" size={15} /><span className="mk-sr">Sort</span><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{MK_SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><MkCaret /></label>
              </div>
            </div>
            {pills.length ? <div className="mk-pills">{pills.map(([l, patch]) => <button type="button" key={l} className="mk-pill" onClick={() => set(patch)} aria-label={"Remove filter " + l}>{l}<b aria-hidden="true">×</b></button>)}<button type="button" className="mk-clear" onClick={reset}>Clear all</button></div> : null}
          </div>
          {visible.length ? (
            <div className="mk-grid">
              {visible.map((c) => {
                const k = mkKind(c);
                const head = k !== lastGroup ? MK_GROUPS.find((g) => g[0] === k) : null;
                lastGroup = k;
                const n = groups.find((g) => g.k === k).list.length;
                return (
                  <React.Fragment key={c.key}>
                    {head ? <div className={"mk-gh" + (k === "example" ? " ex" : "")}><b>{head[1]}</b><span className="n">{n}</span><span className="note">{head[2]}</span></div> : null}
                    <CoachCard c={c} comparing={cmp.includes(c.key)} canCompare={cmp.length < 3} peek={quick === c.key} onCompare={toggleCmp} onQuick={(x) => setQuick(x.key)} />
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="mk-none"><b>No coach fits all of that.</b><span>Widen the budget, pick Either for how you meet, or clear a filter.</span><button type="button" className="mk-key teal" onClick={reset}>Clear all filters</button></div>
          )}
          {ordered.length > visible.length ? <div className="mk-more"><span>Showing {visible.length} of {ordered.length}</span><button type="button" className="mk-key" onClick={() => setShown((s) => s + MK_PAGE)}>Show {Math.min(MK_PAGE, ordered.length - visible.length)} more</button></div> : null}
          <p className="mk-fine"><span className="mk-exlabel">Example coaches</span> Coaches marked Example are example profiles. Their ratings, prices and open times are examples too. <b>Best match</b> weighs your goal, then an open intro, then the rating. A paid boost never ranks a coach higher.</p>
          {/* Inside the results column, so it sticks only while the results are on screen. */}
          <div className="mk-pbar-wrap"><nav className="mk-pbar" aria-label="Results tools">
        <button type="button" className="main" onClick={() => setSheet(true)}><MkIcon name="sliders" size={16} />Filters{pills.length ? <span className="k">{pills.length}</span> : null}</button>
        <label className="mk-pbar-sel"><MkIcon name="sort" size={16} /><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{MK_SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button type="button" onClick={() => cmpList.length >= 2 && setCmpOpen(true)} disabled={cmpList.length < 2}>Compare<span className="k dim">{cmpList.length}</span></button>
      </nav></div>
        </div>
      </section>
      {sheet ? (
        <>
          <div className="mk-scrim" onClick={() => setSheet(false)} aria-hidden="true" />
          <div className="mk-sheet" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="grab" />
            <div className="mk-sheet-top"><button type="button" onClick={() => setSheet(false)}>× Close</button><b>Filters</b><button type="button" className="teal" onClick={reset}>Reset</button></div>
            <div className="mk-sheet-body"><MkFilters f={f} set={set} counts={counts} budgetMax={budgetMax} cities={cities} specs={specs} /></div>
            <div className="mk-sheet-foot"><button type="button" className="mk-key" onClick={reset}>Clear</button><button type="button" className="mk-key teal" onClick={() => { setSheet(false); goTo(); }}>Show {matched.length} coach{matched.length === 1 ? "" : "es"}{bookable ? " · " + bookable + " bookable" : ""}</button></div>
          </div>
        </>
      ) : null}
      <MkTray list={cmpList} onRemove={toggleCmp} onOpen={() => setCmpOpen(true)} onClear={() => setCmp([])} />
      {cmpOpen && cmpList.length ? <MkCompare list={cmpList} onClose={() => setCmpOpen(false)} onRemove={(c) => { toggleCmp(c); if (cmpList.length <= 2) setCmpOpen(false); }} /> : null}
      {quickCoach ? <MkQuickView c={quickCoach} index={Math.max(0, quickIdx)} total={quickIdx >= 0 ? ordered.length : 1} signedIn={signedIn}
        onPrev={quickIdx >= 0 ? () => setQuick(ordered[(quickIdx - 1 + ordered.length) % ordered.length].key) : null}
        onNext={quickIdx >= 0 ? () => setQuick(ordered[(quickIdx + 1) % ordered.length].key) : null}
        onClose={() => setQuick(null)} comparing={cmp.includes(quickCoach.key)} canCompare={cmp.length < 3} onCompare={toggleCmp} /> : null}
      <style>{`
        /* The Coaches page in the homepage's system (index.html :root): teal-tinted darks, the Climb,
           one teal, Anybody display on its width axis, Doto for measured figures on a dark plate (never
           a blurred glow), Schibsted Grotesk body. Role colours: trainer rust, nutritionist gold; text
           in a role colour uses the lighter step so it clears AA on the dark card. */
        .mk{--ink:#06090f;--ink-2:#0a0f17;--ridge-2:#0e1d28;--fg:#eef3f0;--fg-2:rgba(238,243,240,.76);--fg-3:rgba(238,243,240,.64);
          --teal:#34d6c5;--teal-d:#0a8f87;--teal-rgb:52,214,197;--ex:#e6c373;--line:rgba(238,243,240,.11);--line-2:rgba(238,243,240,.06);
          --card:#0c131d;--card-2:#101926;--plate:#060a10;
          --disp:'Anybody','Anybody Fallback',system-ui,sans-serif;--num:'Doto','Courier New',ui-monospace,monospace;--sans:'Schibsted Grotesk','Schibsted Fallback',system-ui,sans-serif;
          --elev-1:inset 0 1px 0 rgba(255,255,255,.07),0 1px 2px rgba(0,0,0,.45),0 12px 26px -14px rgba(0,0,0,.75);
          --elev-2:inset 0 1px 0 rgba(255,255,255,.09),0 2px 4px rgba(0,0,0,.45),0 30px 60px -22px rgba(0,0,0,.85);
          --key:inset 0 1px 0 rgba(255,255,255,.09),inset 0 -2px 0 rgba(0,0,0,.35),0 1px 2px rgba(0,0,0,.5),0 6px 14px -6px rgba(0,0,0,.6);
          --key-teal:inset 0 1px 0 rgba(255,255,255,.4),inset 0 -2px 0 rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.45),0 12px 24px -10px rgba(52,214,197,.55);
          background:var(--ink);color:var(--fg);font-family:var(--sans);font-size:14px;line-height:1.45;min-height:100vh}
        .mk .tr,.mk-qv.tr,.mk-tchip.tr{--role:#c0533b;--role-hi:#e2795c;--role-lo:#7e2f1f;--role-text:#ec8a70;--role-rgb:192,83,59;--role-k1:#bb523c;--role-k2:#9e412c;--role-ink:#fff;--role-end:#ffd2b8}
        .mk .nu,.mk-qv.nu,.mk-tchip.nu{--role:#d8b25a;--role-hi:#f0d38a;--role-lo:#8a6a24;--role-text:#e6c373;--role-rgb:216,178,90;--role-k1:#e3bf68;--role-k2:#c79f47;--role-ink:#16110a;--role-end:#fff0c8}
        @supports (overflow-x:clip){html.mk-root,html.mk-root body{overflow-x:clip}}
        html.mk-modal #shape-global-chat-button{opacity:0;pointer-events:none}
        .mk *,.mk *::before,.mk *::after{box-sizing:border-box}
        :where(.mk) :where(button){font:inherit;color:inherit;cursor:pointer;background:none;border:0;padding:0;margin:0}
        :where(.mk) :where(a){color:inherit;text-decoration:none}
        :where(.mk) :where(img){display:block;max-width:100%}
        .mk :focus-visible{outline:2px solid var(--teal);outline-offset:2px}
        .mk-wrap{max-width:1440px;margin:0 auto;padding:0 32px}
        .mk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
        .mk .dig,.mk-svgdig{font-family:var(--num);font-weight:900;font-variation-settings:'ROND' 100;color:#fff;line-height:1}
        .mk-svglbl{font-family:var(--num);font-weight:700;letter-spacing:.1em;font-variation-settings:'ROND' 30}
        .mk-eb{font-family:var(--num);font-weight:700;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--teal);font-variation-settings:'ROND' 30}
        .mk-dtl{font-family:var(--num);font-weight:700;font-variation-settings:'ROND' 30;letter-spacing:.09em;text-transform:uppercase;font-size:9.5px;line-height:1.2}
        .mk-dtl.teal{color:var(--teal)}
        .mk-exlabel{display:inline-flex;align-items:center;gap:6px;font-family:var(--num);font-weight:700;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ex);font-variation-settings:'ROND' 30;white-space:nowrap}
        .mk-exlabel.muted{color:var(--fg-3)}
        .mk-car{display:inline-block;flex:0 0 auto;width:8px;height:5px;opacity:.7;background:currentColor;pointer-events:none;
          -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%23000' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/8px 5px no-repeat;
          mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%23000' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/8px 5px no-repeat}
        .mk-car.up{transform:rotate(180deg)}

        /* the fold */
        .mk-hero{position:relative;isolation:isolate;overflow:hidden;background:linear-gradient(180deg,var(--ink) 0%,var(--ink-2) 100%);border-bottom:1px solid var(--line-2)}
        .mk-terrain{position:absolute;inset:0;width:100%;height:100%;z-index:-1;display:block}
        .mk-hero-copy{max-width:780px;padding-top:44px}
        .mk-hero-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
        .mk-role{display:inline-flex;gap:4px;padding:4px;border-radius:11px;background:rgba(6,9,15,.62);border:1px solid var(--line);box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}
        .mk-role button{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 14px;border-radius:8px;font-size:13px;font-weight:600;color:var(--fg-2);white-space:nowrap}
        .mk-role button.on{background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.05));color:var(--fg);box-shadow:var(--key)}
        .mk-role em{font-style:normal;font-family:var(--num);font-weight:700;font-size:11px;color:var(--fg-3);font-variation-settings:'ROND' 30}
        .mk-hero h1{font-family:var(--disp);font-weight:500;font-variation-settings:'wdth' 90;font-size:clamp(40px,5vw,72px);line-height:.98;letter-spacing:-.01em;margin:20px 0 0;color:var(--fg)}
        .mk-hero h1 em{font-style:normal;color:var(--teal)}
        .mk-sub{margin:14px 0 0;max-width:58ch;font-size:16px;color:var(--fg-2);line-height:1.5}
        .mk-goals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:24px}
        .mk-goal{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:12px;align-items:center;text-align:left;min-height:74px;padding:12px 14px;border-radius:12px;
          background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid var(--line)!important;box-shadow:var(--elev-1);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:transform .18s,border-color .18s,box-shadow .18s}
        .mk-goal:hover{transform:translateY(-2px);border-color:rgba(52,214,197,.4)!important}
        .mk-goal .gi{grid-row:span 2;width:42px;height:42px;border-radius:10px;display:grid;place-items:center;color:var(--teal);background:linear-gradient(180deg,rgba(52,214,197,.12),rgba(52,214,197,.04));border:1px solid rgba(52,214,197,.25)}
        .mk-goal b{font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:16.5px;line-height:1.15;align-self:end}
        .mk-goal small{font-size:12.5px;color:var(--fg-3);align-self:start;line-height:1.35}
        .mk-goal .gc{position:absolute;top:10px;right:12px;font-family:var(--num);font-weight:700;font-size:11px;color:var(--fg-3);font-variation-settings:'ROND' 30}
        .mk-goal.on{border-color:rgba(52,214,197,.62)!important;background:linear-gradient(180deg,rgba(52,214,197,.17),rgba(52,214,197,.05));box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 0 0 1px rgba(52,214,197,.22),0 16px 34px -16px rgba(52,214,197,.5)}
        .mk-goal.on .gi{background:var(--teal);color:#04110f;border-color:var(--teal)}
        .mk-goal.on .gc{color:var(--teal)}
        .mk-goal.nug .gi{color:#e6c373;border-color:rgba(216,178,90,.3);background:linear-gradient(180deg,rgba(216,178,90,.14),rgba(216,178,90,.04))}
        .mk-goal.nug.on .gi{background:#d8b25a;color:#16110a}
        .mk-matcher{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1.25fr 1.45fr 1.25fr auto;align-items:stretch;margin:26px 0 34px;padding:7px;border-radius:16px;
          background:linear-gradient(180deg,rgba(18,28,41,.94),rgba(10,15,23,.96));border:1px solid rgba(255,255,255,.11);box-shadow:var(--elev-2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
        .mk-mf{position:relative;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:8px 16px;border-radius:10px;min-width:0}
        .mk-mf+.mk-mf::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:1px;background:var(--line)}
        .mk-mf:hover{background:rgba(255,255,255,.03)}
        .mk-mf .lbl{font-family:var(--num);font-weight:700;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--fg-3);font-variation-settings:'ROND' 30}
        .mk-mf .v{position:relative;display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;white-space:nowrap;min-width:0}
        .mk-mf .v svg{color:var(--teal)}
        .mk-mf .v small{font-weight:500;font-size:12.5px;color:var(--fg-3)}
        .mk-mf .v.sel select{appearance:none;-webkit-appearance:none;flex:1;min-width:0;background:transparent;border:0;color:var(--fg);font:600 15px var(--sans);padding:2px 18px 2px 0;cursor:pointer}
        .mk-mf .v.sel select option{background:#0c131d;color:#eef3f0}
        .mk-mf .v.sel .mk-car{position:absolute;right:0;top:50%;margin-top:-2px}
        .mk-range{-webkit-appearance:none;appearance:none;width:100%;height:18px;background:transparent;margin:2px 0 0;cursor:pointer}
        .mk-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--teal-d),var(--teal) var(--p,60%),rgba(255,255,255,.12) var(--p,60%))}
        .mk-range::-moz-range-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--teal-d),var(--teal) var(--p,60%),rgba(255,255,255,.12) var(--p,60%))}
        .mk-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-6px;border-radius:50%;background:#eef3f0;box-shadow:0 0 0 3px rgba(52,214,197,.35),0 2px 4px rgba(0,0,0,.5)}
        .mk-range::-moz-range-thumb{width:16px;height:16px;border:0;border-radius:50%;background:#eef3f0;box-shadow:0 0 0 3px rgba(52,214,197,.35),0 2px 4px rgba(0,0,0,.5)}
        .mk-seg{display:inline-flex;gap:4px}
        .mk-seg button{min-height:32px;padding:0 10px;border-radius:7px;font-size:13px;font-weight:600;color:var(--fg-2);border:1px solid var(--line)!important;white-space:nowrap}
        .mk-seg button.on{background:rgba(52,214,197,.15);border-color:rgba(52,214,197,.55)!important;color:var(--fg)}
        .mk-find{display:inline-flex;align-items:center;justify-content:center;gap:12px;min-height:60px;padding:0 20px 0 22px;border-radius:11px!important;
          background:linear-gradient(180deg,#4fe1d1,#2cc7b6)!important;color:#04110f!important;font-weight:800;font-size:15px;box-shadow:var(--key-teal);white-space:nowrap;transition:transform .18s}
        .mk-find:hover{transform:translateY(-1px)}
        .mk-find .n{display:inline-flex;align-items:center;gap:6px;padding:5px 8px 4px;border-radius:6px;background:#06110f;line-height:1}
        .mk-find .n .dig{font-size:15px}.mk-find .n small{font-weight:600;font-size:10.5px;color:rgba(238,243,240,.8)}

        /* trust band */
        .mk-trust{background:var(--ink-2);border-bottom:1px solid var(--line-2)}
        .mk-trust .row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding-top:18px;padding-bottom:18px}
        .mk-trust .ti{display:flex;gap:11px;align-items:flex-start;padding:2px 16px;border-left:1px solid var(--line-2)}
        .mk-trust .ti:first-child{border-left:0;padding-left:0}
        .mk-trust .ti i{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:12px;color:var(--teal);background:rgba(52,214,197,.1);border:1px solid rgba(52,214,197,.38)}
        .mk-trust .ti b{display:block;font-size:13.5px;font-weight:700;line-height:1.25}
        .mk-trust .ti span{display:block;font-size:12.5px;color:var(--fg-3);line-height:1.4;margin-top:2px}

        /* section heads + editors' picks */
        .mk-sec-h{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
        .mk-sec-h h2{font-family:var(--disp);font-weight:500;font-variation-settings:'wdth' 90;font-size:28px;line-height:1.05;margin:6px 0 0;color:var(--fg)}
        .mk-sec-h h2 em{font-style:normal;color:var(--teal)}
        .mk-sec-h p{margin:0;font-size:13px;color:var(--fg-3);max-width:48ch}
        .mk-picks{padding-top:34px;padding-bottom:6px}
        .mk-picks .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:16px}
        .mk-pick{display:block;text-align:left;filter:drop-shadow(0 14px 16px rgba(0,0,0,.45));transition:transform .18s}
        .mk-pick:hover{transform:translateY(-3px)}
        .mk-pick .edge{display:block;height:100%;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%);background:linear-gradient(180deg,rgba(255,255,255,.17),rgba(255,255,255,.05) 45%,rgba(255,255,255,.06));padding:1px}
        .mk-pick .in{position:relative;display:block;height:100%;clip-path:polygon(0 0,calc(100% - 13.6px) 0,100% 13.6px,100% 100%,0 100%);background:linear-gradient(180deg,var(--card-2),var(--card))}
        .mk-pick .in::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;z-index:3;background:linear-gradient(180deg,var(--role-hi),var(--role) 55%,transparent)}
        .mk-pick .pc{position:relative;display:block;height:56px;overflow:hidden;background:var(--ridge-2)}
        .mk-pick .pc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.7) brightness(.75)}
        .mk-pick .pc .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,9,15,.2),rgba(16,25,38,.95))}
        .mk-pick .body{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;padding:0 14px 13px 16px;margin-top:-22px;align-items:end}
        .mk-pick .who{display:block;min-width:0;padding-bottom:4px}
        .mk-pick .who b{display:block;font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:15.5px;line-height:1.15}
        .mk-pick .ro{display:block;font-family:var(--num);font-weight:700;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--role-text);font-variation-settings:'ROND' 30;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mk-pick .wy{grid-column:1 / -1;display:block;font-size:12.5px;color:var(--fg-2);line-height:1.4;margin-top:8px}
        .mk-pick .ft{grid-column:1 / -1;display:flex;align-items:center;gap:6px;margin-top:9px;font-size:11.5px;color:var(--fg-3)}
        .mk-pick .ft b{color:var(--fg);font-weight:600}
        .mk-pick .mini{padding:4px 6px 3px;background:var(--plate);border-radius:4px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
        .mk-pick .mini .dig{font-size:13px}
        .mk-pick .tag{position:absolute;top:-30px;right:20px;font-family:var(--num);font-weight:700;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-2);font-variation-settings:'ROND' 30;background:rgba(6,9,15,.78);padding:3px 6px 2px;border-radius:4px}
        .mk-pick .tag.ex{color:var(--ex)}

        /* results: rail + grid */
        .mk-results{display:grid;grid-template-columns:264px minmax(0,1fr);gap:28px;padding-top:30px;padding-bottom:48px;align-items:start}
        .mk-rail{position:sticky;top:88px;max-height:calc(100vh - 104px);overflow:auto;scrollbar-width:none;border-radius:14px;background:linear-gradient(180deg,#0e1622,#0a111a);border:1px solid var(--line);box-shadow:var(--elev-1)}
        .mk-rail::-webkit-scrollbar{display:none}
        .mk-rail-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;border-bottom:1px solid var(--line-2)}
        .mk-rail-h b{font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:16px}
        .mk-rail-h button{font-size:12.5px;color:var(--teal);font-weight:600;min-height:32px}
        .mk-filters .mk-field{margin:12px 16px 4px}
        .mk-field{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:rgba(0,0,0,.25);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,.4)}
        .mk-field svg{color:var(--teal)}
        .mk-field input,.mk-field select{flex:1;min-width:0;background:transparent;border:0;color:var(--fg);font:500 13.5px var(--sans);outline:none;min-height:38px}
        .mk-field input::placeholder{color:var(--fg-3)}
        .mk-field select option{background:#0c131d;color:#eef3f0}
        .mk-rg{padding:12px 16px;border-top:1px solid var(--line-2)}
        .mk-rg-h{display:flex!important;width:100%;align-items:center;justify-content:space-between;gap:8px;font-weight:700;font-size:13.5px;min-height:28px}
        .mk-rg-h>span{display:inline-flex;align-items:center;gap:8px}
        .mk-rg-h .k{font-family:var(--num);font-weight:700;font-size:10px;color:#04110f;background:var(--teal);border-radius:9px;padding:2px 6px 1px;font-variation-settings:'ROND' 30}
        .mk-rg-h .k:empty,.mk-rg-h .k[data-z]{display:none}
        .mk-rg-b{margin-top:6px}
        .mk-opt{display:grid!important;width:100%;grid-template-columns:18px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:32px;text-align:left;font-size:13px;color:var(--fg-2)}
        .mk-opt.on{color:var(--fg)}
        .mk-opt.zero{color:var(--fg-3)}
        .mk-cb{width:16px;height:16px;border-radius:4px;border:1px solid rgba(238,243,240,.36);background:rgba(255,255,255,.03);display:grid;place-items:center;font-size:11px;font-weight:800;color:#04110f;line-height:1}
        .mk-cb.on{background:var(--teal);border-color:var(--teal)}
        .mk-cb.rd{border-radius:50%}
        .mk-cb.rd.on{background:transparent;border:5px solid var(--teal)}
        .mk-opt .n,.mk-tg .n{font-family:var(--num);font-weight:700;font-size:11.5px;color:var(--fg-3);font-variation-settings:'ROND' 30}
        .mk-note{margin:6px 0 0;font-size:11.5px;color:var(--fg-3);line-height:1.4}
        .mk-tg{display:flex!important;width:100%;align-items:center;justify-content:space-between;gap:10px;min-height:34px;text-align:left;font-size:13px;color:var(--fg-2)}
        .mk-tg.on{color:var(--fg)}
        .mk-toggle{flex:none;position:relative;width:32px;height:19px;border-radius:10px;background:rgba(255,255,255,.16);box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}
        .mk-toggle::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#cfd8d5;box-shadow:0 1px 2px rgba(0,0,0,.5);transition:left .15s}
        .mk-toggle.on{background:var(--teal)}
        .mk-toggle.on::after{left:15px;background:#fff}
        .mk-budget+.mk-budget{margin-top:14px}
        .mk-sublbl{font-family:var(--num);font-weight:700;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-3);font-variation-settings:'ROND' 30;margin:4px 0 2px}
        .mk-hist{display:flex;align-items:flex-end;gap:2px;height:30px;margin:6px 0 2px}
        .mk-hist i{flex:1;background:rgba(238,243,240,.16);border-radius:1px 1px 0 0}
        .mk-hist i.in{background:rgba(52,214,197,.55)}
        .mk-range-v{display:flex;justify-content:space-between;margin-top:2px;font-size:12px;color:var(--fg-3)}
        .mk-range-v .dig{font-size:13px}
        .mk-reset{display:block;margin:6px 16px 14px;font-size:12.5px;font-weight:600;color:var(--teal)}
        .mk-resbar{position:sticky;top:72px;z-index:20;margin:0 -12px;padding:10px 12px 12px;background:rgba(6,9,15,.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line-2)}
        .mk-res-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
        .mk-res-head h2{display:flex;align-items:center;gap:12px;font-family:var(--disp);font-weight:500;font-variation-settings:'wdth' 90;font-size:28px;line-height:1;margin:0;color:var(--fg)}
        .mk-count{display:inline-block;padding:6px 9px 5px;border-radius:7px;background:var(--plate);border:1px solid rgba(52,214,197,.36);font-size:24px}
        .mk-res-head p{margin:6px 0 0;font-size:13px;color:var(--fg-3)}
        .mk-tools{display:flex;align-items:center;gap:10px}
        .mk-key.mk-filters-btn{display:none!important}
        .mk-sel{position:relative;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.03);box-shadow:var(--key);color:var(--fg-2)}
        .mk-sel select{appearance:none;-webkit-appearance:none;background:transparent;border:0;color:var(--fg);font:700 13px var(--sans);padding:0 16px 0 0;cursor:pointer;min-height:38px}
        .mk-sel select option{background:#0c131d;color:#eef3f0}
        .mk-sel .mk-car{position:absolute;right:12px}
        .mk-pills{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:10px}
        .mk-pill{display:inline-flex!important;align-items:center;gap:7px;min-height:32px;padding:0 5px 0 11px!important;border-radius:16px;background:rgba(52,214,197,.09)!important;border:1px solid rgba(52,214,197,.33)!important;font-size:12.5px;font-weight:600;white-space:nowrap}
        .mk-pill b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:12px;font-weight:600;color:var(--fg-2)}
        .mk-clear{font-size:12.5px;font-weight:600;color:var(--fg-3);margin-left:4px;text-decoration:underline;text-underline-offset:3px;min-height:32px}
        .mk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:18px}
        .mk-gh{grid-column:1 / -1;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:6px 0 0;border-top:1px solid var(--line-2)}
        .mk-gh:first-child{border-top:0;padding-top:0}
        .mk-gh b{font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:17px}
        .mk-gh.ex b{color:var(--ex)}
        .mk-gh .n{font-family:var(--num);font-weight:700;font-size:12px;color:var(--fg-3);font-variation-settings:'ROND' 30}
        .mk-gh .note{flex-basis:100%;font-size:12.5px;color:var(--fg-3)}
        .mk-none{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:18px;padding:28px;border:1px dashed var(--line);border-radius:12px}
        .mk-none b{font-size:16px}.mk-none span{color:var(--fg-3)}
        .mk-more{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line-2);font-size:13px;color:var(--fg-3)}
        .mk-fine{margin:18px 0 0;font-size:12px;color:var(--fg-3);line-height:1.5}
        .mk-fine b{color:var(--fg-2)}
        .mk-key{display:inline-flex!important;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px!important;border-radius:8px!important;font-weight:700;font-size:13.5px;white-space:nowrap;
          border:1px solid var(--line)!important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03))!important;color:var(--fg)!important;box-shadow:var(--key);transition:transform .16s}
        .mk-key:hover{transform:translateY(-1px)}
        .mk-key:disabled{opacity:.55;cursor:default;transform:none}
        .mk-key.sm{min-height:34px;padding:0 12px!important;font-size:12.5px}
        .mk-key.role{border:0!important;background:linear-gradient(180deg,var(--role-k1),var(--role-k2))!important;color:var(--role-ink)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 -2px 0 rgba(0,0,0,.2),0 1px 2px rgba(0,0,0,.5),0 10px 22px -10px rgba(var(--role-rgb),.7)}
        .mk-key.teal{border:0!important;background:linear-gradient(180deg,#4fe1d1,#2cc7b6)!important;color:#04110f!important;box-shadow:var(--key-teal)}
        .mk-key.wait{border:1px solid rgba(255,180,84,.45)!important;background:linear-gradient(180deg,rgba(255,180,84,.14),rgba(255,180,84,.06))!important;color:#ffd29a!important}
        .mk-key.off{border:1px dashed rgba(238,243,240,.24)!important;background:transparent!important;color:var(--fg-3)!important;box-shadow:none;cursor:default}
        .mk-key.off:hover{transform:none}

        /* the coach card: a miniature of the coach's page */
        .mk-cc{position:relative;filter:drop-shadow(0 16px 18px rgba(0,0,0,.5));transition:transform .2s ease}
        .mk-cc:hover{transform:translateY(-4px)}
        .mk-cc .edge{height:100%;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,0 100%);padding:1px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.06) 30%,rgba(255,255,255,.05) 70%,rgba(255,255,255,.1))}
        .mk-cc .in{position:relative;height:100%;display:flex;flex-direction:column;clip-path:polygon(0 0,calc(100% - 19.6px) 0,100% 19.6px,100% 100%,0 100%);background:linear-gradient(180deg,var(--card-2) 0%,var(--card) 40%)}
        .mk-cc .in::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;z-index:4;background:linear-gradient(180deg,var(--role-hi),var(--role) 40%,rgba(var(--role-rgb),.15))}
        .mk-cc.sel .edge{background:linear-gradient(180deg,rgba(52,214,197,.9),rgba(52,214,197,.45))}
        .mk-cc.peek .edge{background:linear-gradient(180deg,#34d6c5,rgba(52,214,197,.6))}
        .mk-cover{position:relative;height:142px;overflow:hidden;background:var(--ridge-2)}
        .mk-cover>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.75) brightness(.9)}
        .mk-cover .shade,.mk-qv-hero .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,9,15,.18) 0%,rgba(6,9,15,.5) 52%,rgba(16,25,38,.96) 100%),linear-gradient(100deg,rgba(10,143,135,.26),rgba(10,143,135,0) 55%)}
        .mk-topo{position:absolute;inset:0;width:100%;height:100%;display:block}
        .mk-sdot{position:absolute;z-index:2;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#f2fffd;box-shadow:0 0 0 3px rgba(52,214,197,.35),0 0 12px 3px rgba(52,214,197,.45)}
        .mk-summit{position:absolute;z-index:2;transform:translate(-50%,calc(-100% - 9px));text-align:center;pointer-events:none}
        .mk-summit .plate{display:inline-flex;align-items:baseline;gap:2px;padding:5px 7px 4px;border-radius:6px;background:rgba(6,9,15,.82);border:1px solid rgba(52,214,197,.42)}
        .mk-summit .plate .dig{font-size:19px}
        .mk-summit .plate small{font-size:10px;font-weight:600;color:var(--fg-2);white-space:nowrap;line-height:1}
        .mk-summit .lb{display:table;margin:3px auto 0;padding:3px 5px 2px;border-radius:4px;background:rgba(6,9,15,.84);color:var(--teal);white-space:nowrap;font-family:var(--num);font-weight:700;font-variation-settings:'ROND' 30;letter-spacing:.09em;text-transform:uppercase;font-size:9.5px;line-height:1.2}
        .mk-summit .lb.ex{color:var(--fg-2)}
        .mk-summit.big{transform:translate(-50%,calc(-100% - 12px))}
        .mk-summit.big .plate{padding:7px 10px 5px}.mk-summit.big .plate .dig{font-size:32px}.mk-summit.big .plate small{font-size:14px}
        .mk-quickhit{position:absolute!important;inset:0;z-index:1;display:grid!important;place-items:center}
        .mk-quickhit span{opacity:0;padding:6px 12px;border-radius:7px;background:rgba(6,9,15,.82);border:1px solid rgba(52,214,197,.5);font-size:12px;font-weight:700;transition:opacity .15s}
        .mk-cc:hover .mk-quickhit span,.mk-quickhit:focus-visible span{opacity:1}
        .mk-cmp{position:absolute!important;top:10px;left:12px;z-index:3;display:inline-flex!important;align-items:center;gap:6px;min-height:28px;padding:0 9px 0 7px!important;border-radius:7px;background:rgba(6,9,15,.78)!important;border:1px solid rgba(255,255,255,.2)!important;font-size:11.5px;font-weight:600;color:var(--fg);backdrop-filter:blur(4px)}
        .mk-cmp .mk-cb{width:14px;height:14px;font-size:10px}
        .mk-cmp.on{background:rgba(10,40,38,.88)!important;border-color:rgba(52,214,197,.7)!important}
        .mk-cmp.off{color:var(--fg-3);cursor:default}
        .mk-badge{position:absolute;top:12px;left:106px;z-index:3;display:inline-flex;align-items:center;gap:5px;min-height:24px;padding:0 7px;border-radius:5px;font-family:var(--num);font-weight:700;font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;font-variation-settings:'ROND' 30;background:rgba(6,9,15,.82);color:var(--teal);border:1px solid rgba(52,214,197,.45);white-space:nowrap}
        .mk-badge.full{color:#ffd29a;border-color:rgba(255,180,84,.5)}
        .mk-badge.muted{color:var(--fg-2);border-color:rgba(238,243,240,.28)}
        .mk-badge.ex{color:var(--ex);border-color:rgba(230,195,115,.5)}
        .mk-idr{position:relative;z-index:3;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;padding:0 16px 0 18px;margin-top:-46px}
        .mk-idr .who{padding-top:52px;min-width:0}
        .mk-nm{display:flex!important;align-items:center;gap:6px;max-width:100%;font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:18.5px;line-height:1.15;white-space:nowrap;text-align:left}
        .mk-nm .t{overflow:hidden;text-overflow:ellipsis}
        .mk-nm .dot,.mk-qnm .dot{color:var(--teal)}
        .mk-vf{flex:none;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:var(--teal);color:#04110f;font-family:var(--sans);font-size:10px;font-weight:800}
        .mk-tier{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:5px;font-family:var(--num);font-weight:700;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-2);font-variation-settings:'ROND' 30}
        .mk-tier span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .mk-tier i{width:7px;height:7px;border-radius:2px;transform:rotate(45deg);display:inline-block}
        .mk-tier .sep{color:var(--fg-3)}
        .mk-roleb{margin:12px 16px 0 18px;font-family:var(--num);font-weight:700;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--role-text);font-variation-settings:'ROND' 30;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mk-why{margin:6px 16px 0 18px;font-size:13px;line-height:1.45;color:var(--fg-2);min-height:38px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .mk-plates{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:6px;margin:12px 16px 0 18px}
        .mk-pl{position:relative;padding:7px 8px 11px;background:var(--plate);clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),inset 0 1px 0 rgba(255,255,255,.1);min-width:0}
        .mk-pl .dig{font-size:18px;white-space:nowrap}
        .mk-pl>span:nth-child(2){display:block;margin-top:5px;font-family:var(--num);font-weight:700;font-variation-settings:'ROND' 30;letter-spacing:.08em;text-transform:uppercase;font-size:9.5px;color:var(--fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1}
        .mk-pl::after,.mk-ip::after{content:"";position:absolute;left:8px;right:8px;bottom:4px;height:3px;background:repeating-linear-gradient(90deg,rgba(238,243,240,.22) 0 1px,transparent 1px 4px)}
        .mk-pl .tk,.mk-ip .tk{position:absolute;left:8px;bottom:4px;height:3px;width:calc((100% - 16px) * var(--v));z-index:1;background:repeating-linear-gradient(90deg,var(--teal) 0 1px,transparent 1px 4px)}
        .mk-pl.role .tk{background:repeating-linear-gradient(90deg,var(--role-text) 0 1px,transparent 1px 4px)}
        .mk-meta{display:grid;gap:5px;margin:12px 16px 0 18px;font-size:12.5px;color:var(--fg-2)}
        .mk-meta .r{display:flex;align-items:center;gap:8px;min-width:0;white-space:nowrap}
        .mk-meta .r svg{color:var(--fg-3)}
        .mk-meta .r b{color:var(--fg);font-weight:600}
        .mk-meta .r .t{overflow:hidden;text-overflow:ellipsis}
        .mk-live{flex:none;display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--teal);animation:mklivep 2.2s ease-out infinite;margin:0 2px 0 3px}
        .mk-live.warm{background:#ffb454;animation:none}
        .mk-live.off{background:rgba(238,243,240,.3);animation:none}
        @keyframes mklivep{0%{box-shadow:0 0 0 0 rgba(52,214,197,.55)}100%{box-shadow:0 0 0 8px rgba(52,214,197,0)}}
        @media (prefers-reduced-motion: reduce){.mk-live{animation:none}.mk-cc,.mk-goal,.mk-pick,.mk-key{transition:none}}
        .mk-creds{margin:8px 16px 0 18px;font-size:11.5px;color:var(--fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mk-acts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;margin-top:auto;padding:14px 16px 16px 18px;border-top:1px solid var(--line-2);margin-top:14px}
        .mk-acts .mk-key{min-height:44px}

        /* the prism portrait */
        .mk-prism{--s:78px;--c:16px;position:relative;display:block;width:var(--s);height:calc(var(--s) * 1.12);flex:none;filter:drop-shadow(0 10px 14px rgba(0,0,0,.6))}
        .mk-prism>*{position:absolute;--k:var(--c);clip-path:polygon(0 0,calc(100% - var(--k)) 0,100% var(--k),100% 100%,var(--k) 100%,0 calc(100% - var(--k)))}
        .mk-prism .ring{inset:0;background:linear-gradient(140deg,#bff5ee,var(--teal) 22%,rgba(52,214,197,.18) 46%,rgba(var(--role-rgb),.3) 58%,var(--role) 86%,var(--role-end))}
        .mk-prism .ph{inset:2px;--k:calc(var(--c) - 1px);overflow:hidden;background:linear-gradient(150deg,#1b2733,#0e1520);display:grid;place-items:center}
        .mk-prism .ph img{width:100%;height:100%;object-fit:cover;object-position:center 20%}
        .mk-prism .ini{font-family:var(--disp);font-weight:700;font-variation-settings:'wdth' 110;color:var(--role-text);line-height:1}
        .mk-prism .gl{inset:2px;--k:calc(var(--c) - 1px);pointer-events:none;background:linear-gradient(118deg,rgba(255,255,255,0) 0 7%,rgba(255,255,255,.32) 10%,rgba(255,255,255,0) 16%),linear-gradient(118deg,rgba(255,255,255,0) 0 17%,rgba(255,255,255,.14) 18.5%,rgba(255,255,255,0) 21%),linear-gradient(180deg,transparent 62%,rgba(6,9,15,.45))}

        /* scrim, quick view */
        .mk-scrim{position:fixed;inset:0;z-index:80;background:rgba(3,6,10,.56)}
        .mk-qv{position:fixed;top:0;right:0;bottom:0;z-index:90;width:min(600px,100vw);display:flex;flex-direction:column;background:#0a1018;color:var(--fg);font-family:var(--sans);font-size:14px;line-height:1.45;
          border-left:1px solid rgba(255,255,255,.12);box-shadow:inset 1px 0 0 rgba(255,255,255,.05),-40px 0 80px -20px rgba(0,0,0,.85)}
        .mk-qv::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;z-index:5;background:linear-gradient(180deg,var(--role-hi),var(--role) 30%,rgba(var(--role-rgb),.1))}
        .mk-qv-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:58px;padding:0 16px 0 22px;border-bottom:1px solid var(--line-2)}
        .mk-qv-top .l,.mk-qv-top .r{display:flex;align-items:center;gap:12px}
        .mk-qnav{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 4px;border-radius:8px;border:1px solid var(--line);font-size:12.5px;color:var(--fg-2);white-space:nowrap}
        .mk-qnav button{width:28px;height:28px;display:grid!important;place-items:center;border-radius:6px;background:rgba(255,255,255,.06)!important;color:var(--fg);font-size:16px}
        .mk-qnav .dig{font-size:13px}
        .mk-qx{width:40px;height:40px;border-radius:9px;display:grid!important;place-items:center;font-size:22px;color:var(--fg);border:1px solid var(--line)!important;background:rgba(255,255,255,.04)!important;box-shadow:var(--key)}
        .mk-qv-body{flex:1;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
        .mk-qv-body::-webkit-scrollbar{display:none}
        .mk-qv-hero{position:relative;height:230px;overflow:hidden;background:var(--ridge-2)}
        .mk-qv-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 40%;filter:grayscale(.55) brightness(.8)}
        .mk-camp{position:absolute;z-index:2;display:flex;align-items:center;gap:6px;transform:translate(-5px,-50%)}
        .mk-camp i{width:10px;height:10px;border-radius:50%;background:#0a1018;border:2px solid var(--teal);flex:none}
        .mk-camp .mk-dtl{padding:3px 6px 2px;border-radius:4px;background:rgba(6,9,15,.78);color:var(--fg-2);font-size:9px}
        .mk-qchip{position:absolute;left:22px;top:16px;display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0 11px 0 8px;border-radius:7px;background:rgba(6,9,15,.8);border:1px solid rgba(52,214,197,.4);font-family:var(--num);font-weight:700;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--fg);font-variation-settings:'ROND' 30}
        .mk-qchip.warm{border-color:rgba(255,180,84,.45)}
        .mk-qv-id{position:relative;z-index:3;display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:start;padding:0 22px;margin-top:-62px}
        .mk-qv-id .who{padding-top:66px;min-width:0}
        .mk-qnm{font-family:var(--disp);font-weight:800;font-variation-settings:'wdth' 140;font-size:29px;line-height:1.02;margin-top:6px;letter-spacing:-.01em;overflow-wrap:anywhere}
        .mk-qchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .mk-qchips span{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 9px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid var(--line);background:rgba(255,255,255,.04)}
        .mk-qchips span.v{color:var(--teal);border-color:rgba(52,214,197,.45);background:rgba(52,214,197,.08)}
        .mk-qchips i{width:7px;height:7px;border-radius:2px;transform:rotate(45deg)}
        .mk-qv-bio{margin:16px 22px 0;font-size:14.5px;line-height:1.5;color:var(--fg)}
        .mk-qv-loc{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 22px 0;font-size:12.5px;color:var(--fg-3)}
        .mk-qv-loc .sep{width:1px;height:12px;background:var(--line);margin:0 6px}
        .mk-qv-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;margin:16px 22px 0}
        .mk-ip{position:relative;padding:10px 10px 15px;background:var(--plate);clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.12);min-width:0}
        .mk-ip.on{box-shadow:inset 0 0 0 1px rgba(52,214,197,.5),inset 0 1px 0 rgba(255,255,255,.12)}
        .mk-ip .mk-live{position:absolute;top:10px;right:12px;margin:0}
        .mk-ip .dig{font-size:24px;display:block}
        .mk-ip .mk-dtl{display:block;margin-top:6px;color:var(--fg-3);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mk-ip::after,.mk-ip .tk{left:10px;bottom:5px;height:4px}
        .mk-ip::after{right:10px}
        .mk-ip .tk{width:calc((100% - 20px) * var(--v))}
        .mk-qv-sec{margin:20px 22px 0;padding-top:16px;border-top:1px solid var(--line-2)}
        .mk-qv-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        .mk-qv-h a{font-size:12.5px;font-weight:600;color:var(--teal)}
        .mk-qv-h .note{font-size:12px;color:var(--fg-3);text-align:right}
        .mk-hls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .mk-hls .hl{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
        .mk-hls .pz{--k:12px;position:relative;width:100%;aspect-ratio:4/5;filter:drop-shadow(0 8px 10px rgba(0,0,0,.5))}
        .mk-hls .pz::before{content:"";position:absolute;inset:0;clip-path:polygon(0 0,calc(100% - var(--k)) 0,100% var(--k),100% 100%,var(--k) 100%,0 calc(100% - var(--k)));background:linear-gradient(140deg,#ffffff,var(--teal) 35%,rgba(52,214,197,.2) 55%,var(--role))}
        .mk-hls .pz img{--k:11px;position:absolute;left:2px;top:2px;width:calc(100% - 4px);height:calc(100% - 4px);object-fit:cover;clip-path:polygon(0 0,calc(100% - var(--k)) 0,100% var(--k),100% 100%,var(--k) 100%,0 calc(100% - var(--k)))}
        .mk-hls small{font-size:11.5px;color:var(--fg-2);white-space:nowrap}
        .mk-progs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .mk-progs .prog{position:relative;overflow:hidden;background:linear-gradient(180deg,#0f1823,#0b121b);clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
        .mk-progs .prog::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;z-index:3;background:linear-gradient(180deg,var(--role-hi),var(--role))}
        .mk-progs .pim{position:relative;height:96px;overflow:hidden}
        .mk-progs .pim img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(.5) brightness(.55)}
        .mk-progs .pim svg{position:absolute;left:0;right:0;bottom:0;width:100%;height:70px}
        .mk-progs .pkf{fill:rgba(var(--role-rgb),.45)}
        .mk-progs .pch{position:absolute;left:10px;top:9px;padding:3px 6px 2px;border-radius:4px;background:rgba(6,9,15,.78);border:1px solid rgba(var(--role-rgb),.6);color:var(--role-text)}
        .mk-progs .ptop{position:absolute;right:10px;bottom:7px;color:#fff;display:flex;align-items:baseline;gap:5px;font-size:8.5px}
        .mk-progs .ptop .dig{font-size:16px}
        .mk-progs .pbody{padding:10px 12px 11px 14px}
        .mk-progs .pbody b{display:block;font-family:var(--disp);font-weight:700;font-variation-settings:'wdth' 110;font-size:15px}
        .mk-progs .pbody>span{display:block;font-size:11.5px;color:var(--fg-3);margin-top:2px}
        .mk-progs .pf{display:flex;align-items:baseline;justify-content:space-between;margin-top:8px}.mk-progs .pf .dig{font-size:20px}.mk-progs .pf .mk-dtl{color:var(--fg-3)}
        .mk-pk{display:grid;gap:6px}
        .mk-pk .pkr{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:9px;background:rgba(255,255,255,.03);border:1px solid var(--line-2)}
        .mk-pk .pkr .mk-dtl{color:var(--fg-3)}
        .mk-pk .pkr b{display:block;font-size:14px;margin-top:2px}
        .mk-pk .pkr .s{display:block;font-size:12px;color:var(--fg-3);margin-top:1px}
        .mk-pk .pkr.hi{border-color:rgba(52,214,197,.45);background:rgba(52,214,197,.07)}
        .mk-pk .pkr.hi .mk-dtl{color:var(--teal)}
        .mk-pk .pp{flex:none;padding:6px 9px 5px;border-radius:5px;background:var(--plate);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);white-space:nowrap}
        .mk-pk .pp .dig{font-size:18px}.mk-pk .pp i{font-style:normal;font-size:10.5px;color:var(--fg-3);margin-left:2px}
        .mk-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:6px}
        .mk-slots .slot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:64px;padding:8px 6px 7px;background:var(--plate);clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
        .mk-slots .slot .mk-dtl{color:var(--fg-3);font-size:9px}.mk-slots .slot .dig{font-size:18px}
        .mk-slots .slot.on{background:linear-gradient(180deg,var(--role-k1),var(--role-k2));box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
        .mk-slots .slot.on .mk-dtl{color:rgba(255,255,255,.88)}
        .mk-qv.nu .mk-slots .slot.on .dig,.mk-qv.nu .mk-slots .slot.on .mk-dtl{color:#16110a}
        .mk-slots .slot.more{flex-direction:row;padding:0 12px;font-size:12.5px;font-weight:700;color:var(--teal)}
        .mk-empty{margin:0;font-size:13px;color:var(--fg-3)}
        .mk-rev{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center}
        .mk-rev .n{padding:10px 12px;background:var(--plate);border-radius:8px;box-shadow:inset 0 0 0 1px rgba(52,214,197,.3);text-align:center}
        .mk-rev .n .dig{font-size:32px;display:block}.mk-rev .n small{display:block;margin-top:5px;font-size:10.5px;color:var(--fg-3);white-space:nowrap}
        .mk-lock{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:8px;border:1px dashed rgba(238,243,240,.22);font-size:12.5px;color:var(--fg-2)}
        .mk-lock svg{color:var(--teal)}
        .mk-crs{display:flex;flex-wrap:wrap;gap:6px}
        .mk-crs span{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 10px 0 6px;border-radius:7px;background:rgba(255,255,255,.03);border:1px solid var(--line);font-size:12.5px;font-weight:600}
        .mk-crs span.full,.mk-crs span.none{padding-left:10px;font-weight:500;color:var(--fg-2)}
        .mk-crs b{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:rgba(52,214,197,.15);color:var(--teal);font-size:10px}
        .mk-crs small{font-weight:500;color:var(--fg-3)}
        .mk-socs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .mk-socs .soc{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid var(--line);font-size:13px;font-weight:600;min-width:0}
        .mk-socs .soc>svg{color:var(--role-text)}
        .mk-socs .soc>span{min-width:0}
        .mk-socs small{display:block;font-weight:500;font-size:11px;color:var(--fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mk-qv-foot{flex:none;padding:12px 22px 14px;border-top:1px solid var(--line);background:linear-gradient(180deg,#0d1520,#0a1018);box-shadow:0 -14px 30px -18px rgba(0,0,0,.8)}
        .mk-qv-foot .acts{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px}
        .mk-qv-foot .mk-key{min-height:46px}
        .mk-qv-foot .big{font-size:14.5px;white-space:normal!important;text-align:center;line-height:1.2;padding:6px 14px!important}
        .mk-qv-foot .fine{display:flex;align-items:flex-start;gap:12px;margin-top:9px}
        .mk-qv-foot .fine p{margin:0;font-size:11.5px;color:var(--fg-3);line-height:1.4}
        .mk-cmp-l{flex:none;min-height:30px;padding:0 10px!important;border-radius:7px;border:1px solid var(--line)!important;font-size:12px;font-weight:700;color:var(--fg-2);white-space:nowrap}
        .mk-cmp-l.on{color:var(--teal);border-color:rgba(52,214,197,.5)!important}
        .mk-cmp-l:disabled{opacity:.5;cursor:default}
        .mk-ask{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;padding:10px 40px 10px 12px;position:relative;border-radius:9px;background:rgba(52,214,197,.08);border:1px solid rgba(52,214,197,.35);font-size:13px}
        .mk-ask>span{flex:1 1 180px}
        .mk-askx{position:absolute!important;right:6px;top:6px;width:30px;height:30px;font-size:18px;color:var(--fg-2)}

        /* compare */
        .mk-tray{position:fixed;left:24px;bottom:22px;z-index:70;display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:calc(100vw - 120px);padding:9px 9px 9px 16px;border-radius:14px;background:linear-gradient(180deg,#132030,#0c141e);border:1px solid rgba(255,255,255,.13);box-shadow:var(--elev-2);color:var(--fg);font-family:var(--sans)}
        .mk-tray .lbl{display:flex;flex-direction:column;gap:2px;margin-right:4px}
        .mk-tray .lbl b{font-size:13.5px}.mk-tray .lbl small{font-size:11.5px;color:var(--fg-3)}
        .mk-tchip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 4px 0 5px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid var(--line);font-size:12.5px;font-weight:600}
        .mk-tchip .mk-prism{filter:none}
        .mk-tchip button{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.07);font-size:13px;color:var(--fg-2);border:0;cursor:pointer}
        .mk-tslot{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:9px;border:1px dashed rgba(238,243,240,.25);font-size:12.5px;color:var(--fg-3)}
        .mk-trayx{min-height:36px;padding:0 8px;font-size:12px;font-weight:600;color:var(--fg-3);background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
        .mk-tray .mk-key{font-family:var(--sans)}
        .mk-cmpdlg{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:90;width:min(960px,calc(100vw - 32px));max-height:calc(100vh - 48px);display:flex;flex-direction:column;border-radius:16px;background:#0a1018;border:1px solid rgba(255,255,255,.12);box-shadow:var(--elev-2);color:var(--fg);font-family:var(--sans)}
        .mk-cmp-top{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 12px 22px;border-bottom:1px solid var(--line-2)}
        .mk-cmp-scroll{overflow:auto}
        .mk-cmp-t{width:100%;border-collapse:collapse;font-size:13px}
        .mk-cmp-t th,.mk-cmp-t td{padding:11px 14px;border-bottom:1px solid var(--line-2);text-align:left;vertical-align:top}
        .mk-cmp-t tbody th{width:150px;font-weight:600;color:var(--fg-3);font-size:12.5px}
        .mk-cmp-t thead th{border-bottom:1px solid var(--line)}
        .mk-cmp-t .hd{display:flex;align-items:center;gap:12px}
        .mk-cmp-t .hd b{display:block;font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:16px}
        .mk-cmp-t .hd span{display:block;font-size:12px;color:var(--fg-3);font-weight:500}
        .mk-cmp-t .rm{margin-top:8px;font-size:12px;color:var(--fg-3);text-decoration:underline;background:none;border:0;cursor:pointer;min-height:28px}
        .mk-cmp-t .act{display:flex;flex-wrap:wrap;gap:8px}

        /* the phone bar and the filter sheet */
        .mk-pbar-wrap{display:none}
        .mk-sheet{position:fixed;left:0;right:0;bottom:0;z-index:90;max-height:88vh;display:flex;flex-direction:column;border-radius:20px 20px 0 0;background:linear-gradient(180deg,#111b28,#0a1018);border-top:1px solid rgba(255,255,255,.16);box-shadow:0 -30px 60px -10px rgba(0,0,0,.8);color:var(--fg);font-family:var(--sans)}
        .mk-sheet .grab{width:44px;height:5px;border-radius:3px;background:rgba(238,243,240,.28);margin:9px auto 0}
        .mk-sheet-top{display:flex;align-items:center;justify-content:space-between;padding:6px 12px 8px;border-bottom:1px solid var(--line-2)}
        .mk-sheet-top b{font-family:var(--disp);font-weight:600;font-variation-settings:'wdth' 100;font-size:19px}
        .mk-sheet-top button{min-height:44px;padding:0 8px;font-size:13px;font-weight:600;color:var(--fg-2);background:none;border:0;cursor:pointer}
        .mk-sheet-top button.teal{color:var(--teal)}
        .mk-sheet-body{overflow:auto;padding-bottom:8px}
        .mk-sheet-body .mk-opt,.mk-sheet-body .mk-tg{min-height:44px}
        .mk-sheet-foot{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:12px 16px 18px;border-top:1px solid var(--line);background:#0b121b}
        .mk-sheet-foot .mk-key{min-height:50px;font-family:var(--sans)}

        /* widths */
        @media (max-width:1300px){.mk-goal small{font-size:12px}}
        @media (max-width:1180px){
          .mk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .mk-results{grid-template-columns:248px minmax(0,1fr);gap:22px}
          .mk-picks .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .mk-trust .row{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:14px}
          .mk-trust .ti:nth-child(4){border-left:0;padding-left:0}
          .mk-matcher{grid-template-columns:1fr 1fr;row-gap:4px}
          .mk-matcher .mk-mf:nth-child(3)::before{display:none}
          .mk-find{grid-column:1 / -1}
        }
        @media (max-width:900px){
          .mk-wrap{padding:0 16px}
          .mk-results{grid-template-columns:minmax(0,1fr)}
          .mk-rail{display:none}
          .mk-key.mk-filters-btn{display:inline-flex!important}
          .mk-resbar{position:static;margin:0;padding:0 0 4px;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;border:0}
          .mk-goals{grid-template-columns:1fr 1fr;gap:8px}
          .mk-pbar-wrap{display:block;position:sticky;bottom:16px;z-index:60;margin-top:18px;pointer-events:none}
          .mk-pbar{pointer-events:auto;display:flex;align-items:center;gap:4px;padding:5px;border-radius:14px;background:linear-gradient(180deg,#152232,#0d1520);border:1px solid rgba(255,255,255,.14);box-shadow:var(--elev-2);width:calc(100% - 64px);max-width:420px}
          .mk-pbar>*{flex:1;display:inline-flex!important;align-items:center;justify-content:center;gap:7px;min-height:46px;border-radius:10px;font-weight:700;font-size:13.5px;white-space:nowrap;color:var(--fg-2)}
          .mk-pbar .main{background:linear-gradient(180deg,#4fe1d1,#2cc7b6)!important;color:#04110f;box-shadow:var(--key-teal)}
          .mk-pbar button:disabled{opacity:.6;cursor:default}
          .mk-pbar .k{font-family:var(--num);font-weight:900;font-size:12px;background:#06110f;color:#fff;border-radius:6px;padding:3px 6px 2px;font-variation-settings:'ROND' 100}
          .mk-pbar .k.dim{background:rgba(255,255,255,.1)}
          .mk-pbar-sel{position:relative}
          .mk-pbar-sel select{appearance:none;-webkit-appearance:none;position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}
          .mk-pbar-sel::after{content:"Sort"}
          .mk-filters-btn .k{font-family:var(--num);font-weight:700;font-size:10.5px;color:#04110f;background:var(--teal);border-radius:9px;padding:2px 6px 1px;font-variation-settings:'ROND' 30}
          .mk-tray{left:16px;right:16px;bottom:84px;max-width:none}
          .mk-tray .lbl{display:none}
        }
        @media (max-width:760px){
          .mk-hero-copy{padding-top:22px}
          .mk-hero-top{flex-direction:column;align-items:stretch;gap:12px}
          .mk-role{display:flex}
          .mk-role button{flex:1;justify-content:center;padding:0 6px;font-size:12.5px;gap:6px}
          .mk-hero h1{font-size:38px;margin-top:18px}
          .mk-sub{font-size:14.5px;margin-top:10px}
          .mk-goal{grid-template-columns:34px minmax(0,1fr);column-gap:10px;min-height:62px;padding:10px 10px 10px 11px}
          .mk-goal .gi{width:34px;height:34px;border-radius:8px}
          .mk-goal .gi svg{width:18px;height:18px}
          .mk-goal b{font-size:14.5px}
          .mk-goal small{display:none}
          .mk-goal .gc{position:static;grid-column:2;font-size:10.5px}
          .mk-matcher{grid-template-columns:minmax(0,1fr);margin:14px 0 22px;padding:6px}
          .mk-matcher .mk-mf::before{left:12px!important;right:12px;top:0!important;bottom:auto!important;width:auto!important;height:1px;display:block!important}
          .mk-matcher .mk-mf:first-child::before{display:none!important}
          .mk-mf{padding:10px 12px}
          .mk-seg{display:flex}.mk-seg button{flex:1;min-height:40px}
          .mk-find{width:100%;margin-top:6px;min-height:54px}
          .mk-trust .row{grid-template-columns:1fr 1fr;gap:12px 14px;padding-top:16px;padding-bottom:16px}
          .mk-trust .ti{padding:0!important;border:0!important}
          .mk-trust .ti b{font-size:12.5px}.mk-trust .ti span{font-size:11.5px}
          .mk-trust .ti:nth-child(5){display:none}
          .mk-picks .grid{grid-template-columns:minmax(0,1fr)}
          .mk-sec-h h2{font-size:24px}
          .mk-res-head h2{font-size:23px}
          .mk-tools{width:100%}
          .mk-tools>*{flex:1;justify-content:center}
          .mk-grid{grid-template-columns:minmax(0,1fr);gap:16px}
          .mk-cover{height:134px}
          .mk-idr{margin-top:-40px}
          .mk-idr .who{padding-top:46px}
          .mk-qv{width:100vw;border-left:0}
          .mk-qv-stats{grid-template-columns:repeat(auto-fit,minmax(100px,1fr))}
          .mk-ip .dig{font-size:21px}
          .mk-hls{grid-template-columns:repeat(4,minmax(0,1fr))}
          .mk-progs{grid-template-columns:minmax(0,1fr)}
          .mk-slots{grid-template-columns:repeat(2,minmax(0,1fr))}
          .mk-slots .slot.more{grid-column:1 / -1;min-height:44px}
          .mk-socs{grid-template-columns:minmax(0,1fr)}
          .mk-qv-foot{padding:10px 14px 14px}
          .mk-qv-top{padding:0 10px 0 16px}
          .mk-qv-top .l .mk-eb{display:none}
          .mk-qv-foot .fine .mk-cmp-l{display:none}
          .mk-qv-foot .fine p{font-size:11px}
          .mk-qv-foot .acts{grid-template-columns:1fr 1fr}
          .mk-qv-foot .acts .big{grid-column:1 / -1;order:-1}
          .mk-qv-foot .fine{flex-direction:column;gap:6px}
          .mk-qnm{font-size:25px}
          .mk-qv-id{padding:0 16px}.mk-qv-bio,.mk-qv-loc,.mk-qv-stats,.mk-qv-sec{margin-left:16px;margin-right:16px}
          .mk-cmp-t tbody th{width:110px}
          .mk-cmp-t thead th:not(:first-child),.mk-cmp-t td{min-width:200px}
          .mk-cmp-t .hd{flex-direction:column;align-items:flex-start}
          .mk-summit-g{display:none}
        }
      `}</style>
    </div>
    <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Marketplace />);
