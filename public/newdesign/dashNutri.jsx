// Nutrition v2 — ClientNutri.html migrated into the FULL assigned meal plan
// (dashboard-v2 gap step). Today expanded with swap options visible (reuses
// the shared DashMealLedgerCard — swap chips, ledger ticks, red-when-over,
// the Today card deep-links here), a week view, an auto-built grocery list
// from the plan's ingredients, logging history STREAK-FRAMED (no bare
// percentages, per the client framing rule), and saved/favorited recipes.
//
// Data: /api/client/plan (meals.days — the meal-builder payload with per-meal
// swap groups + day targets + ingredients), /api/client/nutrition (logged
// snapshot today, 7-day logged history, real logging streak). Demo under the
// band when signed out.
//
// Load order: pageShell → trainerDashboard → clientNav → dashSignals →
// dashToday (DashDemoBand) → dashClient (DashMealLedgerCard) → this.

const DNU_INK50 = "var(--sh-ink2, #a09b94)";
const DNU_MONO = "'JetBrains Mono', monospace";
const DNU_TEAL = "var(--sh-accent, #2ee0c4)";
const DNU_GREEN = "var(--sh-green, #7bbf5a)";
const DNU_GOLD = "var(--sh-gold, #d8a23a)";
const DNU_RED = "var(--sh-rust, #e0644b)";
const DNU_DAY = 86400000;

const DNU_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dnuTodayDow() { return (new Date().getDay() + 6) % 7; }
function dnuIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dnuFmt12(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (isNaN(h)) return null;
  return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m || 0).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
}

// ── Plan day → DashMealLedgerCard meals (cal→kcal, swap groups preserved) ───
function dnuDayMeals(day) {
  if (!day || !Array.isArray(day.meals)) return [];
  return day.meals.map((m, i) => ({
    id: m.id || "pm-" + i,
    slot: m.slot || "Meal",
    time: dnuFmt12(m.time),
    title: m.title || "Meal",
    kcal: Number(m.kcal) || 0, p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0,
    alts: Array.isArray(m.alts) ? m.alts : [],
  }));
}
function dnuDayTargets(day) {
  const t = day && day.targets;
  return t && t.cal ? { kcal: Number(t.cal) || 0, p: Number(t.p) || 0, c: Number(t.c) || 0, f: Number(t.f) || 0 } : null;
}

// Auto-build the week's grocery from the plan's meal ingredients (real — the
// same data the mobile auto-grocery uses). qty arrives pre-formatted ("180 g")
// so we group by name and list the meals that need it.
function dnuBuildGrocery(days) {
  const byName = new Map();
  for (const day of days || []) {
    for (const m of (day.meals || [])) {
      for (const ing of (m.ingredients || [])) {
        if (!ing || !ing.name) continue;
        const key = ing.name.toLowerCase();
        if (!byName.has(key)) byName.set(key, { name: ing.name, qtys: [], meals: new Set() });
        const g = byName.get(key);
        if (ing.qty) g.qtys.push(String(ing.qty));
        g.meals.add(m.title || "Meal");
      }
    }
  }
  return [...byName.values()]
    .map((g) => ({ name: g.name, count: g.meals.size, qty: g.qtys[0] || null, meals: [...g.meals].slice(0, 3) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── Demo dataset (signed out / no plan — under the band) ────────────────────
const DNU_DEMO = (() => {
  const meal = (slot, time, title, kcal, p, c, f, alts, ings) => ({ slot, time, title, kcal, p, c, f, alts: alts || [], ingredients: ings || [] });
  const swaps = {
    lunch: [{ name: "Turkey & rice bowl", kcal: 610, p: 48, c: 66, f: 14 }, { name: "Tofu stir-fry + rice", kcal: 580, p: 34, c: 72, f: 16 }],
    dinner: [{ name: "Cod, potato & greens", kcal: 640, p: 46, c: 58, f: 18 }],
  };
  const dayA = {
    dow: 0, title: "Training day", tag: "TRAIN", targets: { cal: 2200, p: 175, c: 240, f: 70 },
    meals: [
      meal("Breakfast", "07:30", "Greek yogurt + berries + granola", 420, 28, 52, 12, [], [{ qty: "250 g", name: "Greek yogurt" }, { qty: "100 g", name: "Mixed berries" }, { qty: "40 g", name: "Granola" }]),
      meal("Lunch", "12:30", "Grilled chicken bowl", 620, 52, 68, 18, swaps.lunch, [{ qty: "200 g", name: "Chicken breast" }, { qty: "180 g", name: "Rice" }, { qty: "150 g", name: "Broccoli" }]),
      meal("Snack", "15:30", "Protein shake + banana", 290, 28, 38, 4, [], [{ qty: "35 g", name: "Whey protein" }, { qty: "1", name: "Banana" }]),
      meal("Dinner", "19:00", "Salmon, rice & asparagus", 720, 48, 72, 28, swaps.dinner, [{ qty: "180 g", name: "Salmon fillet" }, { qty: "180 g", name: "Rice" }, { qty: "120 g", name: "Asparagus" }]),
    ],
  };
  const dayB = {
    dow: 1, title: "Rest day", tag: "REST", targets: { cal: 2000, p: 175, c: 190, f: 65 },
    meals: [
      meal("Breakfast", "08:00", "Egg-white scramble + toast", 380, 32, 34, 12, [], [{ qty: "250 ml", name: "Egg whites" }, { qty: "2 slices", name: "Sourdough" }]),
      meal("Lunch", "12:30", "Turkey wrap + side salad", 540, 44, 48, 18, swaps.lunch, [{ qty: "150 g", name: "Turkey" }, { qty: "1", name: "Tortilla wrap" }]),
      meal("Dinner", "19:00", "Lean steak + sweet potato", 680, 50, 54, 22, [], [{ qty: "200 g", name: "Sirloin steak" }, { qty: "250 g", name: "Sweet potato" }]),
    ],
  };
  const days = [];
  for (let dow = 0; dow < 7; dow++) days.push(dow % 2 === 0 ? { ...dayA, dow } : { ...dayB, dow });
  const td = dnuTodayDow();
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const logged = i !== 2; // one gap mid-week
    week.push({ date: dnuIso(new Date(Date.now() - i * DNU_DAY)), calories: logged ? 2100 + ((i * 37) % 300) : null, logged });
  }
  return {
    coach: "Rae", title: "Lean recomp · Week 3", days,
    today: { calories: 1530, protein: 112, carbs: 158, fat: 42 },
    week, currentStreak: 4, longestStreak: 11, loggedDays7: 6,
    favorites: [
      { name: "Sheet-pan salmon + sweet potato", kcal: 620, p: 46, tag: "Dinner" },
      { name: "Overnight oats + whey", kcal: 480, p: 38, tag: "Breakfast" },
      { name: "Chicken caesar (lite)", kcal: 490, p: 42, tag: "Lunch" },
      { name: "Greek yogurt bark", kcal: 210, p: 18, tag: "Snack" },
    ],
    todayDow: td,
  };
})();

// ── Week strip ──────────────────────────────────────────────────────────────
function DnuWeekStrip({ days, week, todayDow, onPick, picked }) {
  // Overlay the logged calorie history (by ISO date) onto the plan's dows.
  const loggedByDow = new Map();
  for (const d of week || []) {
    const dd = (new Date(d.date + "T00:00:00").getDay() + 6) % 7;
    loggedByDow.set(dd, d.logged);
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {DNU_DOW.map((lbl, dow) => {
        const day = (days || []).find((d) => d.dow === dow) || (days && days[dow]) || null;
        const isToday = dow === todayDow;
        const on = picked === dow;
        const logged = loggedByDow.get(dow);
        const tgt = day && day.targets ? day.targets.cal : null;
        return (
          <button key={dow} onClick={() => onPick(dow)} style={{
            background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.12)" : "transparent",
            border: "1px solid " + (on ? DNU_TEAL : isToday ? "rgba(var(--sh-accent-rgb, 46,224,196),0.4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.12)"),
            borderRadius: 6, padding: "8px 4px", cursor: "pointer", textAlign: "center", color: "var(--sh-ink, #f2ede4)",
          }}>
            <div style={{ fontFamily: DNU_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: isToday ? "var(--sh-accent-ink, #2ee0c4)" : DNU_INK50 }}>{lbl}</div>
            <div style={{ fontFamily: serif, fontSize: 15, margin: "4px 0 3px" }}>{tgt ? Math.round(tgt / 100) / 10 + "k" : "—"}</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: logged ? DNU_GREEN : "transparent", border: "1px solid " + (logged ? DNU_GREEN : "rgba(var(--sh-ink-rgb, 242,237,228),0.25)") }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Logging history — STREAK-FRAMED (no bare adherence %) ───────────────────
function DnuLogHistory({ week, currentStreak, longestStreak, loggedDays7 }) {
  const cals = (week || []).map((d) => d.calories).filter((c) => c != null);
  const max = Math.max(...cals, 1);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        {[[currentStreak != null ? currentStreak + "d" : "—", "Logging streak", longestStreak ? "best " + longestStreak + "d" : ""],
          [loggedDays7 != null ? loggedDays7 + "/7" : "—", "Days this week", "logged"],
          [(week || []).filter((d) => d.logged).length, "Recent wins", "days tracked"]].map(([k, l, s], i) => (
          <div key={i}>
            <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1, color: i === 0 ? DNU_GREEN : "var(--sh-ink, #f2ede4)" }}>{k}</div>
            <div style={{ fontFamily: DNU_MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: DNU_INK50, marginTop: 5 }}>{l}</div>
            {s && <div style={{ fontSize: 10, color: DNU_INK50, marginTop: 2 }}>{s}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 50 }}>
        {(week || []).map((d, i) => (
          <div key={i} title={d.logged ? d.calories + " kcal" : "not logged"} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", height: d.logged ? Math.max(8, Math.round((d.calories / max) * 100)) + "%" : "4px", background: d.logged ? DNU_GREEN : "rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 2, opacity: d.logged ? 0.85 : 1 }} />
            <span style={{ fontFamily: DNU_MONO, fontSize: 7, color: DNU_INK50 }}>{(new Date(d.date + "T00:00:00").toLocaleDateString([], { weekday: "short" }) || "").slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: DNU_MONO, fontSize: 8, letterSpacing: "0.06em", color: DNU_INK50, marginTop: 8 }}>Logged-day calories — consistency over precision.</div>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
// Live or the demo: a published plan, a nutrition read with a day in it, or a nutritionist the
// member pays. ⚠ A COACHED MEMBER WITH NO PLAN AND NOTHING LOGGED READ THE DEMO MENU (Codex on
// #2378): /api/client/nutrition answers today: null for them, so the "preparing your meal plan"
// state never rendered. ⚠ AND A COACH IT COULD NOT READ IS NOT "NONE" (Codex on #2378): the route omits
// `coaching` when its subscriptions read fails, and the member got the demo menu as their own. Only a
// confirmed `coaching: null` (no nutritionist) with nothing logged is the preview.
// ⚠ AND A PLAN READ THAT FAILED IS NOT THE PREVIEW (owner, 2026-10-25: "fix the website Nutrition demo
// menu on a failed read"): a member with no coach known and nothing logged got the demo menu, under the
// demo band, when their plan read failed. A failure that is the member's own (dnuMemberReadFailed) makes
// the page live, where it says it could not load.
function dnuSourceOf(pl, nu, status, signedIn) {
  if (status !== undefined && dnuMemberReadFailed(pl, status, signedIn)) return "live";
  return (pl && pl.ok && pl.meals && (pl.meals.hasPlan || pl.meals.coaching !== null)) || (nu && nu.ok && nu.today) ? "live" : "demo";
}

// Whether the plan read failed: no answer, or one without its meals part (`read: false` when the
// route's meal plan read failed). ⚠ NOT "NO MEAL PLAN": the page said "No meal plan assigned yet" to a
// member whose nutritionist's plan did not load. It says so and can read again.
function dnuPlanFailed(pl) {
  return !(pl && pl.ok && pl.meals && pl.meals.read !== false);
}
// Whether a failed plan read is a member's. An answer whose meal plan read failed (`read: false`) is:
// the route answers only a signed-in member. With no answer, only a session (`signedIn`) makes it one,
// since the rate limiter (429) and a lost connection (0) reach visitors too (Codex P2 on #2453); and the
// gate's 401, 402 and 403 (src/lib/supabase/middleware.ts) keep the preview even then.
function dnuMemberReadFailed(pl, status, signedIn) {
  if (pl && pl.ok && pl.meals && pl.meals.read === false) return true;
  if (!signedIn || status === 401 || status === 402 || status === 403) return false;
  return dnuPlanFailed(pl);
}
// Whether the page has a signed-in member, for a plan request that got no answer. The dashboard's own
// account reading comes first (ShapePortalSession, from /api/me before the page drew): it needs no
// request, so a rate limit that refused the plan read can't refuse it too (Codex P2 on #2453). Then
// the Supabase session, whose cookie bridge is itself an /api request.
function dnuSignedIn() {
  const portal = window.ShapePortalSession && window.ShapePortalSession.peek ? window.ShapePortalSession.peek() : null;
  if (portal && portal.user) return Promise.resolve(true);
  return Promise.resolve(window.shapeDb && window.shapeDb.getSession ? window.shapeDb.getSession() : null).then((s) => !!s, () => false);
}

function ClientNutritionPage() {
  const [plan, setPlan] = React.useState(null);
  const [nutri, setNutri] = React.useState(null);
  const [source, setSource] = React.useState(null);
  const [planFailed, setPlanFailed] = React.useState(false);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [pickedDow, setPickedDow] = React.useState(dnuTodayDow());

  React.useEffect(() => {
    let on = true;
    const j = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    // The plan read keeps its status (0 with no network), so a member's failed read is told from a
    // visitor's 401 (dnuMemberReadFailed).
    const jStatus = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => ({ status: r.status, body: r.ok ? await r.json().catch(() => null) : null }))
      .catch(() => ({ status: 0, body: null }));
    (async () => {
      const [plRes, nu, signedIn] = await Promise.all([jStatus("/api/client/plan"), j("/api/client/nutrition"), dnuSignedIn()]);
      if (!on) return;
      const pl = plRes.body;
      if (pl && pl.ok) setPlan(pl);
      setPlanFailed(dnuMemberReadFailed(pl, plRes.status, signedIn));
      if (nu && nu.ok) setNutri(nu);
      setSource(dnuSourceOf(pl, nu, plRes.status, signedIn));
    })();
    return () => { on = false; };
  }, [reloadTick]);
  const live = source === "live";

  // PREPPED display (Cook Mode PR C — the web's ONLY prep surface, ruling
  // §13.6): fresh meal-prep records read under the member's own RLS, pruned +
  // matched by the CANONICAL module (window.ShapeMealPrepLib). Real records
  // only — signed-out / demo / pre-record renders nothing. getSession() bridges
  // the cookie login BEFORE getUser (the coachClientDetail/DprCycleCard
  // precedent — without it a cookie-session member reads as anon).
  const [prepEntries, setPrepEntries] = React.useState(null);
  React.useEffect(() => {
    let on = true;
    (async () => {
      try {
        const lib = window.ShapeMealPrepLib; const db = window.shapeDb;
        if (!lib || !db || !db.client) return;
        await db.getSession?.();
        const u = await db.client.auth.getUser();
        const uid = u && u.data && u.data.user && u.data.user.id;
        if (!uid) return;
        const res = await db.client.from("user_goals").select("data").eq("user_id", uid).eq("kind", "meal_prep").maybeSingle();
        if (res.error) return;
        const entries = lib.bsPrunePrep(res.data && res.data.data && res.data.data.entries, Date.now());
        if (on && entries.length) setPrepEntries(entries);
      } catch (e) {}
    })();
    return () => { on = false; };
  }, []);

  const coach = live ? ((plan && plan.meals && plan.meals.coach) || "your nutritionist") : DNU_DEMO.coach;
  const planTitle = live ? (plan && plan.meals && plan.meals.title) : DNU_DEMO.title;
  const days = live ? ((plan && plan.meals && plan.meals.days) || []) : DNU_DEMO.days;
  const hasPlan = days.length > 0;
  const todayDow = dnuTodayDow();

  // Resolve the picked day's meals + targets; fall back to demo today. The
  // nutritionist's live Adjust override (plan.meals.coachTargets — the same
  // detail.nutrition the mobile Eat hero reads) outranks the menu's authored
  // day targets: it is the CURRENT prescription (spec #1707 parity fix).
  const pickedDay = days.find((d) => d.dow === pickedDow) || days[pickedDow] || null;
  const meals = dnuDayMeals(pickedDay);
  const coachTargets = live && plan && plan.meals && plan.meals.coachTargets && plan.meals.coachTargets.kcal
    ? { kcal: Number(plan.meals.coachTargets.kcal) || 0, p: Number(plan.meals.coachTargets.p) || 0, c: Number(plan.meals.coachTargets.c) || 0, f: Number(plan.meals.coachTargets.f) || 0 }
    : null;
  const targets = coachTargets || dnuDayTargets(pickedDay) || { kcal: 2200, p: 175, c: 240, f: 70 };

  // Ledger from the logged snapshot (only meaningful for today).
  const todaySnap = live ? (nutri && nutri.today) : DNU_DEMO.today;
  const isToday = pickedDow === todayDow;
  const ledger = isToday && todaySnap
    ? { kcal: todaySnap.calories || 0, p: todaySnap.protein || 0, c: todaySnap.carbs || 0, f: todaySnap.fat || 0 }
    : { kcal: 0, p: 0, c: 0, f: 0 };

  const week = live ? ((nutri && nutri.week) || []) : DNU_DEMO.week;
  const grocery = React.useMemo(() => dnuBuildGrocery(days), [days]);
  const favorites = live ? [] : DNU_DEMO.favorites; // no web saved-recipe store yet

  // A plan read that failed takes the no-plan card's place (dnuPlanFailed): it says so and reads again.
  const failedPlate = live && planFailed ? (
    <div data-dnu-plan-failed className="dash-plate dash-plate--tick" style={{ "--dac": DNU_GOLD, paddingLeft: 24 }} role="status">
      <div className="dash-eyebrow" style={{ color: DNU_GOLD }}>Couldn’t load your meal plan</div>
      <div style={{ fontSize: 13, color: DNU_INK50, lineHeight: 1.55, marginTop: 8, maxWidth: 480 }}>
        If you have a meal plan, it’s still there. Check your connection and try again.
      </div>
      <button type="button" onClick={() => setReloadTick((n) => n + 1)} style={{ fontFamily: DNU_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: DNU_INK50, background: "transparent", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 4, padding: "9px 12px", minHeight: 36, marginTop: 12, cursor: "pointer" }}>Try again ↻</button>
    </div>
  ) : null;

  // Each top-level card becomes a draggable/resizable DashGrid widget (role=client,
  // tab=nutrition), mirroring the client Score rollout. The DashPage hero stays the
  // page header; only the card stack is gridded. The week strip + meal ledger are the
  // primary wide cards (full); grocery / logging history / saved recipes pair (half).
  const widgets = (!hasPlan
    ? [
        { key: "noplan", title: "No meal plan yet", size: "full", render: () => failedPlate || (
          <div className="dash-plate dash-plate--tick" style={{ "--dac": DNU_GOLD, paddingLeft: 24 }}>
            {/* A member with a nutritionist is waiting on them, not on the marketplace (client-onboarding
                review, M16; /api/client/plan meals.coaching). */}
            {plan && plan.meals && plan.meals.coaching ? <>
              <div className="dash-eyebrow" style={{ color: DNU_GOLD }}>{dashCoachingNames(plan.meals.coaching).length > 1 ? "Your coaches are on it" : "Your coach is on it"}</div>
              <div style={{ fontSize: 13, color: DNU_INK50, lineHeight: 1.55, marginTop: 8, maxWidth: 480 }}>
                {/* Every nutritionist they pay, by name (owner, 2026-10-16: a member may pay two). */}
                {(() => { const c = plan.meals.coaching; const who = dashNameList(dashCoachingNames(c), "Your nutritionist", "Your nutritionists"); return <>{who.text} {who.many ? "are" : "is"} preparing your meal plan. It shows up here the moment they publish it, with swaps and a grocery list{c.weekOne ? " (week-one target: log " + c.weekOne.count + (c.weekOne.count === 1 ? " day" : " days") + (who.many && c.weekOne.setBy ? ", set by " + c.weekOne.setBy : "") + ")" : ""}. Until then, tell them anything they should know. <a href="/newdesign/ClientApp.html#team" style={{ color: DNU_GOLD, textDecoration: "none" }}>{who.many ? "Message your coaches →" : "Message your coach →"}</a></>; })()}
              </div>
            </> : <>
              <div className="dash-eyebrow" style={{ color: DNU_GOLD }}>No meal plan assigned yet</div>
              <div style={{ fontSize: 13, color: DNU_INK50, lineHeight: 1.55, marginTop: 8, maxWidth: 480 }}>
                {/* The marketplace only for a member the plan read says has no nutritionist: the route omits
                    `coaching` when it could not tell (Codex on #2378). */}
                Your nutritionist builds the plan and it lands here, with swaps and a grocery list{plan && plan.meals && plan.meals.coaching === null ? " — ask in chat, or find a coach in the marketplace." : "."}
              </div>
            </>}
            {window.ShapeAskNoraLink && <window.ShapeAskNoraLink style={{ marginTop: 10 }} label="Ask Nora what to eat today" draft="What should I eat today?" />}
          </div>
        ) },
      ]
    : [
        // Week strip — pick a day
        { key: "week", title: "This week", size: "full", render: () => (
          <div className="dash-plate dash-plate--tick" style={{ "--dac": DNU_GOLD, paddingLeft: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <span className="dash-eyebrow" style={{ color: DNU_GOLD }}>This week · {DNU_DOW[pickedDow]}{isToday ? " · today" : ""}</span>
              {!isToday && <button onClick={() => setPickedDow(todayDow)} style={{ fontFamily: DNU_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: DNU_TEAL, background: "transparent", border: 0, cursor: "pointer" }}>Back to today →</button>}
            </div>
            <DnuWeekStrip days={days} week={week} todayDow={todayDow} onPick={setPickedDow} picked={pickedDow} />
          </div>
        ) },

        // Today (or the picked day) — meals + swaps + ledger
        { key: "meals", title: "Today's meals", size: "full", render: () => (
          <div data-tour="hero-nutrition" className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DNU_TEAL, paddingLeft: 24 }}>
            <DashMealLedgerCard
              meals={meals} targets={targets} ledger={ledger} logged={{}}
              onLog={() => { window.location.href = "ClientDashboard.html"; }}
              headerNote={pickedDay ? (pickedDay.title || (isToday ? "today" : DNU_DOW[pickedDow])) : null}
              swapStorageKey={"shape.dashNutriSwap." + dnuIso(new Date()) + "." + pickedDow}
              interactive={isToday}
            />
            {(() => {
              // PREPPED stamps for the picked day's meals — exact title/id
              // match against fresh records only; nothing matched → nothing.
              if (!prepEntries || !live || !window.ShapeMealPrepLib) return null;
              const hit = meals.filter((m) => window.ShapeMealPrepLib.bsPrepMatch(prepEntries, { mealId: m.id, title: m.title }, Date.now()));
              if (!hit.length) return null;
              return (
                <div style={{ fontFamily: DNU_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DNU_TEAL, marginTop: 8 }}>
                  Prepped ✓ · just plate it — {hit.map((m) => m.title).join(" · ")}
                </div>
              );
            })()}
            {!isToday && <div style={{ fontFamily: DNU_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DNU_INK50, marginTop: 8 }}>Viewing {DNU_DOW[pickedDow]} · logging happens on the day.</div>}
          </div>
        ) },

        // Grocery — auto-built from the plan's ingredients
        { key: "grocery", title: "Grocery", size: "half", render: () => (
          <div data-tour="hero-grocery" className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "var(--sh-violet, #8a5cf6)", paddingLeft: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span className="dash-eyebrow" style={{ color: "var(--sh-violet, #8a5cf6)" }}>Grocery · auto-built from your plan</span>
              <a href="ClientGrocery.html" style={{ fontFamily: DNU_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: DNU_INK50, textDecoration: "none" }}>Full list →</a>
            </div>
            <div className="dash-ledger" style={{ "--dac": "var(--sh-violet, #8a5cf6)", marginTop: 9 }} />
            {grocery.length ? grocery.slice(0, 10).map((g, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</div>
                  <div style={{ fontFamily: DNU_MONO, fontSize: 8, color: DNU_INK50, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.meals.join(" · ")}</div>
                </div>
                <span style={{ fontFamily: DNU_MONO, fontSize: 9, color: DNU_INK50 }}>{g.count}× wk</span>
              </div>
            )) : (
              <div style={{ fontSize: 12.5, color: DNU_INK50, padding: "10px 0" }}>The grocery list builds from your plan's ingredients — it fills in once your nutritionist's meals carry them.</div>
            )}
          </div>
        ) },

        // Logging history — streak-framed
        { key: "history", title: "Logging", size: "half", render: () => (
          <div className="dash-plate dash-plate--tick" style={{ "--dac": DNU_GREEN, paddingLeft: 24 }}>
            <div className="dash-eyebrow" style={{ color: DNU_GREEN }}>Logging · streaks &amp; wins</div>
            <div className="dash-ledger" style={{ "--dac": DNU_GREEN, marginTop: 9, marginBottom: 12 }} />
            <DnuLogHistory
              week={week}
              currentStreak={live ? (nutri && nutri.currentStreak) : DNU_DEMO.currentStreak}
              longestStreak={live ? (nutri && nutri.longestStreak) : DNU_DEMO.longestStreak}
              loggedDays7={live ? (nutri && nutri.loggedDays7) : DNU_DEMO.loggedDays7}
            />
          </div>
        ) },

        // Saved recipes
        { key: "recipes", title: "Saved recipes", size: "half", render: () => (
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DNU_GOLD, paddingLeft: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span className="dash-eyebrow" style={{ color: DNU_GOLD }}>Saved recipes</span>
              <a href={dashShellHref("ClientLibrary.html")} style={{ fontFamily: DNU_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: DNU_INK50, textDecoration: "none" }}>Library →</a>
            </div>
            <div className="dash-ledger" style={{ "--dac": DNU_GOLD, marginTop: 9 }} />
            {favorites.length ? favorites.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontFamily: DNU_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: DNU_INK50, marginTop: 2 }}>{r.tag} · {r.kcal} kcal · {r.p}P</div>
                </div>
                <span style={{ color: DNU_GOLD, fontSize: 13 }}>♥</span>
              </div>
            )) : (
              <div style={{ fontSize: 12.5, color: DNU_INK50, padding: "10px 0", lineHeight: 1.5 }}>
                No saved recipes yet — favorite one from the recipe box and it collects here for quick logging.
              </div>
            )}
          </div>
        ) },
      ]
  ).filter(Boolean);

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        navItems={clientNavItems("nutrition")}
        payoutCard={clientPayoutCard}
        eyebrow={(planTitle ? planTitle.toUpperCase() : "YOUR ASSIGNED PLAN") + (coach ? " · " + coach.toUpperCase() : "")}
        title="Nutrition"
        subtitle={"Your meal plan, day by day — swap any meal, see the week, and what " + coach + " has you eating. Log in the app; the ledger syncs here."}
      >
        <DashGrid role="client" tab="nutrition" widgets={widgets} />
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { ClientNutritionPage, dnuBuildGrocery, dnuDayMeals });
