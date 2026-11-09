// The Week — the coach's end-of-week review (review 2026-09-09, R3; coach review step 5b, 2026-11-09).
//
// ⚠ A TOOL PAGE, AND A FIXED LAYOUT, NOT A WIDGET BOARD (the owner's review). It was 2,700 pixels of
// one column: ten check-ins stacked, each repeating one line of six ratings, "0 of 10 reviewed" in
// small print, and no way to see a pattern across clients. One question a block now:
//   · the head (Lift 2): "N check-ins to review", a ring with one segment per client who checked in
//     (reviewed or waiting, said in words beside it), one line of facts, Start review (the first one
//     waiting) and Mark all reviewed, which closes the week in one write;
//   · what stands out: at most three lines worked out from the week's real check-ins (the weakest
//     rating across clients, the questions still waiting, thin food logging), each naming its count;
//   · one table for the roster (Lift 0): a row per client, their tier mark then their name, and the
//     six ratings as tiles in good, middling and low bands with the number printed;
//   · the selected client's check-in beside it (under it on a narrow screen), the row lifting (Lift 1)
//     to meet it: the ratings, win, struggle, the question they asked you, weight, the week's
//     adherence against the week before (the roster's weekly-adherence RPC — closed weeks only, so
//     the current week reads "closes Sunday"), food-log days, the weigh-in move, the engine's flags,
//     a Reviewed ✓ per client per week, a private note, Message with a drafted opener, the client
//     file, and "Reply & mark reviewed", which steps to the next client waiting. ↑ ↓ move through
//     the rows, as on Clients.
// ⚠ A CLIENT'S COLOUR IS THEIR SHAPE SCORE TIER'S, ON A MARK BESIDE THE NAME (#2630), hollow when the
// tier is unknown. The ring's colours are review states and the tiles' a rating scale, never a
// client's; each is said in words too.
//
// Reviews persist per coach in ONE whole-doc store —
// user_goals 'coach_week_reviews': { [weekOf]: { [clientId]: { reviewedAt, note } } }
// — read before every write (a tick on one client never clobbers a note on
// another) and declined when the read cannot be trusted (getUserGoals resolves
// null for "not signed in" and "the read failed" alike). Signed out, the
// demo rows tick locally under the band and say so.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals.js →
// clientColors.mjs (window.ShapeClientColors) → dashData.jsx → dashToday.jsx (DashPill ·
// DASH_SEV_COLORS · dashMessageClient · dashMessageHref · dashMessageDraft · dashClientHref ·
// DashDemoBand · DashClientGem · dashRecordTier · dashTierMark · dashRowKeyOpen) → this.

const DWK_MONO = "'JetBrains Mono', monospace";
const DWK_INK50 = "var(--sh-ink2, #a09b94)";
const DWK_INK = "var(--sh-ink, #f2ede4)";
const DWK_TEAL = "var(--sh-accent, #2ee0c4)";
const DWK_AMBER = "var(--sh-gold, #d8a23a)";
const DWK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// What /api/clients/[id]/shared-overview asks get_client_checkins for. Keep in
// step with that route: it decides how far back this page can claim an absence.
const DWK_CHECKIN_LIMIT = 4;

// Local-calendar ISO weeks (the check-in's week_of is the member's Monday; the
// coach reviews in their own week).
function dwkIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dwkMonday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
// Today on the viewer's own clock (P9: the account's zone, shapeZone.mjs's window.ShapeZone, read at
// call time), as a local Date at noon, so "this week" is the week on the coach's own calendar
// wherever this browser is. This browser's today without it.
function dwkToday() {
  try {
    const Z = window.ShapeZone;
    const p = Z && typeof Z.partsInZone === "function" ? Z.partsInZone(Date.now(), Z.viewerZone()) : null;
    if (p) return new Date(p.y, p.mo - 1, p.d, 12);
  } catch (e) { /* this browser's day */ }
  return new Date();
}
function dwkAddDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return dwkIso(d); }
function dwkFmt(iso) { const d = new Date(iso + "T00:00:00"); return DWK_MONTHS[d.getMonth()] + " " + d.getDate(); }
function dwkWeekOfRow(c) { return String((c && (c.week_of || c.weekOf)) || "").slice(0, 10); }

// ── The reviews store ────────────────────────────────────────────────────────
// ⚠ getSession() BEFORE getUserGoals, ALWAYS. getUserGoals resolves the user
// through client.auth.getUser(), which does NOT bootstrap the Next.js
// cookie-session bridge — a coach signed in through the cookie path with
// nothing in localStorage reads as ANON, getUserGoals returns null, and the
// page would tell a signed-in coach "sign in to keep your reviews" while
// silently discarding every tick. Same lesson as the live station (#1769) and
// the variance line one file over.
async function dwkBridge() {
  try { if (window.shapeDb && window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* fall through as anon */ }
}
async function dwkUid() {
  try { const u = await window.shapeDb.getUser(); return u && u.id ? u.id : null; } catch (e) { return null; }
}
function useWeekReviews(live) { return useCoachWeekReviews(live); }

// ── Weekly adherence, closed weeks only (the same RPC the client file reads) ──
// ⚠ BATCHED IN 100s. get_roster_weekly_adherence RAISES `too_many_clients` above
// 100 ids — deliberately fail-closed rather than truncating — so an unbatched
// call on a 101-client roster errors, the map stays null, and every row's
// adherence reads "—" as though nobody shared anything.
const DWK_RPC_BATCH = 100;
function useRosterAdherence(ids, live) {
  const [map, setMap] = React.useState(null); // null = not available; {} = loaded
  const key = ids.join(",");
  React.useEffect(() => {
    let on = true;
    setMap(null);
    const db = window.shapeDb && window.shapeDb.client;
    if (!live || !db || !ids.length) return undefined;
    (async () => {
      await dwkBridge();
      if (!on) return;
      const m = {};
      let any = false;
      for (let i = 0; i < ids.length; i += DWK_RPC_BATCH) {
        const batch = ids.slice(i, i + DWK_RPC_BATCH);
        try {
          const res = await db.rpc("get_roster_weekly_adherence", { p_client_ids: batch });
          if (!on) return;
          if (!res || res.error || !Array.isArray(res.data)) {
            if (res && res.error) console.warn("[shape] week: adherence read failed", res.error.message || res.error);
            continue;
          }
          any = true;
          for (const r of res.data) {
            const cid = String(r.client_id), wk = String(r.week_start).slice(0, 10);
            const sched = Number(r.scheduled) || 0, done = Number(r.completed) || 0;
            (m[cid] = m[cid] || {})[wk] = { scheduled: sched, completed: done, pct: sched >= 6 ? Math.round((done / sched) * 100) : null };
          }
        } catch (e) { /* honest "—" for this batch */ }
      }
      if (on && any) setMap(m);
    })();
    return () => { on = false; };
  }, [key, live]);
  return map;
}

// ── The weekly readout, READ FROM THE CACHE (review 2026-09-09, R5) ─────────
// ⚠ THIS NEVER POSTS, AND THAT IS THE WHOLE DESIGN. `/api/ai/weekly-readout` is
// POST-only and its first act is to CLAIM the week (`claim_weekly_readout`), which
// is the database's own enforcement of one model call per member per week. A coach
// opening the Week tab on a 30-client roster would therefore spend thirty members'
// weekly AI calls on their behalf, for a page they may only be scrolling past —
// and the member whose call was spent never asked for it.
//
// `ai_weekly_readouts` already carries `for select using (is_coach_on_client(user_id))`,
// so the browser reads the cache directly under RLS. A row that is not there means
// the member has not generated theirs yet; that is a real answer and the row says
// so, rather than the coach's tab quietly making one.
//
// ⚠ AND A `generating` ROW IS NOT A READOUT. The table's status starts at
// 'generating' with a null `readout` while a claim is in flight; rendering it would
// paint an empty finding. Only 'ready' rows with a body count.
//
// ⚠ `week_start` IS A **UTC**-DERIVED MONDAY (`weeklyReadoutWeekStart` takes
// `toISOString().slice(0,10)` and floors that to its Monday), while this page's
// `weekOf` is a LOCAL calendar Monday. For a few hours around the Sunday/Monday
// boundary those two labels can name different weeks, so an existing readout can
// fail to match the week a coach is looking at. That is inherited from the route
// rather than introduced here — the member's own card reads the same row the same
// way — and the cost is bounded to a MISS, never a mismatch: the query is exact,
// so a row for another week can never be shown under this one. The empty copy is
// therefore written about the RECORD ("no read on record for this week") and not
// about the member ("they haven't generated one"), because the second is a claim
// this page cannot make at that boundary.
function useWeekReadouts(ids, weeksBack, live) {
  // `read` is the set of ids whose batch actually came back; `map` the rows found.
  const [map, setMap] = React.useState(null); // null = not read yet
  const key = ids.join(",");
  // ⚠ THE ROUTE'S KEY, NOT THIS PAGE'S. See readoutWeekKey in dashData.jsx: the row
  // is stamped with the Monday of the **UTC** date, so querying a LOCAL Monday
  // misses a row on the week it belongs to and finds it on the week before — a
  // readout attributed to a week it was not run in.
  //
  // ⚠ AND IT IS ON A CLOCK, because the UTC week can turn while THIS page's own
  // week does not. A coach in Sydney opens the Week on their local Monday morning
  // — UTC is still Sunday — and UTC Monday arrives a couple of hours later: `key`,
  // `weeksBack` and `live` are all unchanged, so nothing re-runs and the page goes
  // on asking for the previous UTC week, missing every readout written after the
  // boundary. Los Angeles has the mirror of it on a Sunday afternoon.
  const weekKey = useWeekClock(React.useCallback(() => readoutWeekKey(weeksBack), [weeksBack]));
  React.useEffect(() => {
    let on = true;
    setMap(null);
    const db = window.shapeDb && window.shapeDb.client;
    if (!live || !db || !ids.length) return undefined;
    (async () => {
      await dwkBridge();
      if (!on) return;
      const m = {};
      for (let i = 0; i < ids.length; i += DWK_RPC_BATCH) {
        const batch = ids.slice(i, i + DWK_RPC_BATCH);
        try {
          const res = await db
            .from("ai_weekly_readouts")
            // ⚠ THE SUMMARY ONLY. The full `readout` JSONB carries 3–5 insights
            // with their headline, detail and recommendation — a member's private
            // reading of their own body, none of which this page renders. Pulling
            // it would put ~100 whole documents over the wire per week paged, and
            // put that text in a payload the coach's page has no use for.
            .select("user_id, source, window_days, sample_size, summary:readout->>summary")
            .in("user_id", batch)
            .eq("week_start", weekKey);
          if (!on) return;
          if (!res || res.error || !Array.isArray(res.data)) {
            if (res && res.error) console.warn("[shape] week: readout read failed", res.error.message || res.error);
            continue; // this batch stays UNREAD — and is recorded as such below
          }
          for (const r of res.data) {
            // A row still `generating` carries a null summary; rendering it paints
            // an empty finding. The projection returns null for those, so the same
            // check covers both.
            if (!r || !r.user_id || !r.summary) continue;
            m[String(r.user_id)] = r;
          }
        } catch (e) { /* this batch stays unread; the row says nothing about it */ }
      }
      // ⚠ NO PER-BATCH READ-TRACKING, AND ITS ABSENCE IS THE POINT. An earlier cut
      // carried one so a partially-read roster would not tell a coach "no read on
      // record" about members nobody had looked up. That bookkeeping stopped being
      // needed the moment the row stopped claiming an absence at all — which it
      // must, because `is_coach_on_client` also hides the readouts of session-only
      // clients, and this page cannot tell "not run" from "not mine to read".
      // A map that is simply missing an id renders nothing for it, which is true
      // under every one of those reasons.
      if (on) setMap(m);
    })();
    return () => { on = false; };
  }, [key, weekKey, live]);
  return map;
}

// ── Demo check-ins + adherence for the mock roster — ONLY under the band ─────
// On the form's own scale (1-10, and 10 is good on every question), so the preview's week reads the
// way a real one would: training and hunger control mostly good, calm running low for most of the
// roster, and a few skipped weeks, like real rosters.
function dwkDemoCheckin(rec, weekOf, thisMonday) {
  const name = rec.profile.name || "";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  const weeksBack = Math.round((new Date(thisMonday + "T00:00:00") - new Date(weekOf + "T00:00:00")) / (7 * 86400000));
  if (weeksBack < 0 || (h + weeksBack) % 5 === 0) return null;  // a few skipped weeks, like real rosters
  const r = (k, lo, hi) => lo + (((h >> k) + k * 7 + weeksBack * 3) % (hi - lo + 1));
  const wins = ["Hit every session", "Protein on target six days", "Best sleep week in a month", "Walked every morning", "Two PRs on the trap bar"];
  const strug = ["Late nights killed two sessions", "Travel — ate out most days", "Knee twinge on lunges", "Stress at work all week", null];
  const asks = ["Can we swap Friday to a shorter session?", null, "Should I add creatine?", null, "Is 1,900 kcal too low on rest days?"];
  return { week_of: weekOf, ratings: { trainingAdherence: r(1, 5, 9), nutritionAdherence: r(2, 4, 9), sleep: r(3, 4, 9), energy: r(4, 4, 9), stress: r(5, 2, 7), hunger: r(6, 5, 9) }, wins: wins[h % 5], struggles: strug[(h >> 2) % 5], question: asks[(h >> 3) % 5], weight: 70 + (h % 25) - weeksBack * 0.3, unit: "kg" };
}
function dwkDemoAdherence(rec, weekOf) {
  const name = rec.profile.name || "";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 17 + name.charCodeAt(i)) % 7919;
  const d = Number(weekOf.slice(8, 10));
  return { pct: 55 + ((h + d * 7) % 41), prev: 55 + ((h + d * 3) % 41) };
}

// ── Food logs and the weigh-in, for the week on screen (2026-11-05) ──────────
// ⚠ A PAST WEEK SHOWED THIS WEEK'S LOGGING. The row read `foodLogs.daysLogged7d`, the seven
// days ending today, on every week the coach paged back to. A past week now counts the logged
// days inside that week, from the overview's logged days (`foodLogDays`: the snapshot window's
// days, and `from`, the first day a full window holds). A week before `from` was not read, which
// is said, never counted as 0. This week keeps its seven days to today.
function dwkLoggedInWeek(logDays, weekOf) {
  if (!logDays || !Array.isArray(logDays.days) || !/^\d{4}-\d{2}-\d{2}$/.test(String(weekOf || ""))) return null;
  if (logDays.from && weekOf < logDays.from) return null;
  const end = dwkAddDays(weekOf, 6);
  return logDays.days.filter((d) => d >= weekOf && d <= end).length;
}
function dwkDemoLogs(rec, weekOf) {
  const name = (rec && rec.profile && rec.profile.name) || "";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 13 + name.charCodeAt(i)) % 6151;
  return 2 + ((h + Number(String(weekOf).slice(8, 10))) % 6);
}
// { n, label, note } for the row's food-log figure.
function dwkFoodLogs(rec, weekOf, isCurrent, live) {
  if (isCurrent) {
    const n = rec.foodLogs && rec.foodLogs.daysLogged7d != null ? rec.foodLogs.daysLogged7d : null;
    return { n, label: "Food logs · 7d", note: n == null ? "not shared" : null };
  }
  if (!live) return { n: dwkDemoLogs(rec, weekOf), label: "Food logs · week", note: null };
  if (!rec.foodLogDays) return { n: null, label: "Food logs · week", note: "not shared" };
  const n = dwkLoggedInWeek(rec.foodLogDays, weekOf);
  return { n, label: "Food logs · week", note: n == null ? "older than the logs read" : null };
}
// The weigh-ins to read for the week on screen: every one, this week; on a past week only those on
// or before its Sunday, so the row shows the weight the client had then, not today's.
function dwkWeighInsFor(weighIns, weekOf, isCurrent) {
  const list = Array.isArray(weighIns) ? weighIns.filter((x) => x && x.weight != null) : [];
  if (isCurrent) return list;
  const end = dwkAddDays(weekOf, 6);
  return list.filter((x) => x.on && String(x.on).slice(0, 10) <= end);
}

// ── The ratings, on the form's own scale (step 5b) ──────────────────────────
// ⚠ CHECKED, NEVER GUESSED. client_checkins.ratings holds 1-10 integers
// (supabase-migrations/2026-06-12-checkin-kit.sql), and both check-in forms (the app's
// BSWeeklyCheckin and the website's DprCheckinForm) ask every question so that 10 is good: "Stress ·
// 10 = calm", "Hunger control". So `stress` is read as calm, and a LOW number is the bad one on all
// six. Low is 4 or under, the engine's CHECKIN_RATING_LOW (dashSignals.js: Needs you's "rated calm
// 3/10"); good is 7 or over; 5 and 6 are middling. A value off the scale (0, 11, text, a boolean) is
// not a rating and reads as missing, as the engine's checkinLowRatings skips it.
const DWK_RATINGS = [["trainingAdherence", "Training", "hi"], ["nutritionAdherence", "Nutrition", "hi"], ["sleep", "Sleep", "hi"], ["energy", "Energy", "hi"], ["stress", "Calm", "hi"], ["hunger", "Hunger control", "hi"]];
const DWK_LOW_AT = 4;
const DWK_GOOD_AT = 7;
function dwkRating(v) {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}
function dwkBand(v) {
  const n = dwkRating(v);
  return n == null ? null : n <= DWK_LOW_AT ? "low" : n >= DWK_GOOD_AT ? "good" : "mid";
}
// The bands' colours are a RATING SCALE (good, middling, low), never a client's colour, and every
// tile says its band in words beside the number it prints.
const DWK_BANDS = {
  good: { label: "Good", ink: "var(--sh-green, #7bbf5a)", fill: "rgba(var(--sh-green-rgb, 123,191,90),0.16)", edge: "rgba(var(--sh-green-rgb, 123,191,90),0.45)" },
  mid: { label: "Middling", ink: "var(--sh-gold, #d8a23a)", fill: "rgba(var(--sh-gold-rgb, 216,162,58),0.15)", edge: "rgba(var(--sh-gold-rgb, 216,162,58),0.45)" },
  low: { label: "Low", ink: "var(--sh-rust, #e0644b)", fill: "rgba(var(--sh-rust-rgb, 224,100,75),0.16)", edge: "rgba(var(--sh-rust-rgb, 224,100,75),0.5)" },
};

// ── One client's week: their check-in, and what the page knows about it ─────
// `state`: "in" (this week's check-in), "none" (read, and none for this week), "beyond" (a week
// older than the few check-ins the overview fetched), "loading" (the overview is still on its way)
// or "unread" (the overview sent no check-ins: a failed read, or a client whose check-ins are not
// this coach's to read). Only "none" is a claim that they did not check in.
function dwkCheckinOf(rec, weekOf, thisMonday, live) {
  if (!live) {
    const ck = dwkDemoCheckin(rec, weekOf, thisMonday);
    return { ck, state: ck ? "in" : "none", last: null };
  }
  const fetched = Array.isArray(rec.checkins) ? rec.checkins : null;
  if (!fetched) return { ck: null, state: rec.progressRead && rec.progressRead.state === "loading" ? "loading" : "unread", last: null };
  const ck = fetched.find((c) => dwkWeekOfRow(c) === weekOf) || null;
  const last = fetched.length ? dwkWeekOfRow(fetched[0]) : null;
  if (ck) return { ck, state: "in", last };
  // ⚠ "NO CHECK-IN" IS A CLAIM, AND WE ONLY HOLD THE LAST FEW. shared-overview
  // asks get_client_checkins for DWK_CHECKIN_LIMIT rows, so a week older than
  // the oldest one we fetched may well have a check-in we simply never asked
  // for — say that, rather than asserting an absence.
  const oldest = fetched.length ? dwkWeekOfRow(fetched[fetched.length - 1]) : null;
  const beyond = fetched.length >= DWK_CHECKIN_LIMIT && oldest && weekOf < oldest;
  return { ck: null, state: beyond ? "beyond" : "none", last };
}
// Every row's week, once a render: the check-in, the review (dashCheckinReviewed: an edit after the
// review reopens it) and the food-log figure the patterns and the panel both read.
function dwkEntries(rows, ctx) {
  const isCurrent = ctx.weekOf === ctx.thisMonday;
  return rows.map((row) => {
    const rec = row.client;
    const id = rec.profile.id;
    const c = dwkCheckinOf(rec, ctx.weekOf, ctx.thisMonday, ctx.live);
    const review = ctx.weekDoc[id] || null;
    return { row, id, ck: c.ck, state: c.state, last: c.last, review, reviewed: dashCheckinReviewed(review, c.ck), food: dwkFoodLogs(rec, ctx.weekOf, isCurrent, ctx.live) };
  });
}
// The next client waiting after `fromId`, in the table's order, wrapping round; never `fromId`.
function dwkNextWaiting(list, fromId) {
  const at = list.findIndex((e) => String(e.id) === String(fromId));
  const order = at < 0 ? list : list.slice(at + 1).concat(list.slice(0, at));
  return order.find((e) => e.state === "in" && !e.reviewed && String(e.id) !== String(fromId)) || null;
}

// ── The head: how many check-ins wait on the coach ───────────────────────────
// ⚠ UNREAD IS NOT 0. `toReview` is null when the reviews could not be read (or are still loading),
// or when not one client's check-ins could be: the head then reads "—", never "0". A partial read
// counts what it read and says what it is missing ("2 couldn't be read").
function dwkHeadModel(entries, opts) {
  const reviewsRead = !!(opts && opts.reviewsRead);
  const total = entries.length;
  const ins = entries.filter((e) => e.state === "in");
  const none = entries.filter((e) => e.state === "none").length;
  const unread = entries.filter((e) => e.state === "unread" || e.state === "beyond").length;
  const pending = entries.filter((e) => e.state === "loading").length;
  const reviewed = ins.filter((e) => e.reviewed).length;
  const known = total - unread - pending;
  const toReview = !reviewsRead || (total > 0 && known === 0) ? null : ins.length - reviewed;
  // One segment a client who checked in: the reviewed first, then the waiting, so the ring fills
  // the way the week does. A review state that was not read is neither.
  const seg = (e) => ({ id: e.id, name: e.row.client.profile.name, state: !reviewsRead ? "unknown" : e.reviewed ? "reviewed" : "waiting" });
  const segments = ins.filter((e) => reviewsRead && e.reviewed).map(seg).concat(ins.filter((e) => !(reviewsRead && e.reviewed)).map(seg));
  const facts = [];
  if (total && known === 0) facts.push(pending ? "this week's check-ins are still loading" : "this week's check-ins couldn't be read");
  else if (total) {
    facts.push(ins.length + " of " + total + " checked in");
    if (none) facts.push(none + (opts && opts.isCurrent ? " haven't yet" : " didn't"));
    if (unread) facts.push(unread + " couldn't be read");
    if (pending) facts.push(pending + " still loading");
  } else facts.push("no clients on the roster yet");
  if (opts && opts.reviewsLoading) facts.push("loading your reviews");
  else if (!reviewsRead) facts.push("your reviews couldn't be read");
  else if (ins.length) facts.push(reviewed + " of " + ins.length + " reviewed");
  return { total, checkedIn: ins.length, none, unread, pending, reviewed, toReview, segments, facts };
}
// The head before there is a roster to count: still loading, or a signed-in coach whose roster
// could not be read (never the sample's people, never a 0).
function dwkHeadWithout(why) {
  return { total: 0, checkedIn: 0, none: 0, unread: 0, pending: 0, reviewed: 0, toReview: null, segments: [], facts: [why === "unread" ? "your roster couldn't be read just now · reload to try again" : "loading your roster"] };
}
function dwkHeadTitle(m) {
  if (m.toReview == null) return "— check-ins to review";
  if (m.toReview === 0) return m.checkedIn && !m.unread && !m.pending ? "Every check-in reviewed ✓" : "No check-ins to review";
  return m.toReview === 1 ? "1 check-in to review" : m.toReview + " check-ins to review";
}

// ── What stands out: patterns worked out from the week's real check-ins ─────
// At most three lines, each naming its count, and a line with nothing to say is left out.
//   1. The weakest rating across clients: the question the most clients rated low (4/10 or under,
//      on the form's own scale where 10 is good), the lower average breaking a tie. ⚠ Two clients
//      at least: one client's low rating is their own row's, not the roster's pattern.
//   2. The questions still waiting (a check-in not yet reviewed, with a question in it), grouped
//      by a topic only where two or more name the same thing in so many words (a fixed list:
//      "creatine", "protein", "kcal"…), never by a guess at what they meant; otherwise "N asked
//      you something".
//   3. Thin food logging: the clients who logged food on 3 days or fewer, out of those whose logs
//      were read (a client whose logs were not shared is in neither count).
const DWK_PATTERN_MIN = 2;
const DWK_THIN_LOGS = 3;
const DWK_TOPICS = [
  ["creatine", /\bcreatine\b/i],
  ["protein", /\bprotein\b/i],
  ["calories", /\b(calorie|calories|kcal)\b/i],
  ["carbs", /\b(carb|carbs|carbohydrate|carbohydrates)\b/i],
  ["supplements", /\bsupplements?\b/i],
  ["cardio", /\bcardio\b/i],
  ["alcohol", /\b(alcohol|beer|wine)\b/i],
  ["fasting", /\bfasting\b/i],
  ["macros", /\bmacros?\b/i],
];
function dwkPatterns(entries, isCurrent) {
  const out = [];
  const ins = entries.filter((e) => e.ck);
  let weak = null;
  for (const [k, label] of DWK_RATINGS) {
    let rated = 0, low = 0, sum = 0;
    for (const e of ins) {
      const n = dwkRating(e.ck.ratings && e.ck.ratings[k]);
      if (n == null) continue;
      rated += 1;
      sum += n;
      if (dwkBand(n) === "low") low += 1;
    }
    if (low < DWK_PATTERN_MIN) continue;
    const mean = sum / rated;
    if (!weak || low > weak.low || (low === weak.low && mean < weak.mean)) weak = { k, label, low, rated, mean };
  }
  if (weak) out.push({ key: "weak", rating: weak.k, n: weak.low, text: weak.label + " is the week's weak spot: " + weak.low + " of " + weak.rated + " rated it " + DWK_LOW_AT + "/10 or under" + (weak.k === "stress" ? " (10 = calm)" : "") });
  const asks = ins.filter((e) => !e.reviewed && typeof e.ck.question === "string" && e.ck.question.trim());
  if (asks.length) {
    let best = null;
    for (const [topic, re] of DWK_TOPICS) {
      const n = asks.filter((e) => re.test(e.ck.question)).length;
      if (n >= 2 && (!best || n > best.n)) best = { topic, n };
    }
    const rest = best ? asks.length - best.n : asks.length;
    const text = best
      ? best.n + " asked about " + best.topic + ", answer " + (best.n === 2 ? "both" : "all " + best.n) + (rest ? "; " + rest + " more asked you something" : "")
      : asks.length === 1 ? "1 client asked you something" : asks.length + " asked you something";
    out.push({ key: "asks", n: asks.length, text });
  }
  const known = entries.filter((e) => e.food && e.food.n != null);
  const thin = known.filter((e) => e.food.n <= DWK_THIN_LOGS).length;
  if (thin) out.push({ key: "food", n: thin, text: "Food logging is thin for " + thin + " of " + known.length + ": " + DWK_THIN_LOGS + " days or fewer logged " + (isCurrent ? "in the last 7" : "that week") });
  return out.slice(0, 3);
}

// ── Reply & mark reviewed ────────────────────────────────────────────────────
// ⚠ MARKED REVIEWED ONLY IF THE REPLY OPENED. A coach's reply goes to the thread the client sees
// (dashToday.jsx dashMessageHref, the page dashMessageClient opens for a real account id), opened in
// ONE reply tab that each reply re-targets: navigating this tab, as Message does, would leave the
// Week before the review is saved and leave no "next client" to step to. A blocked tab (window.open
// answers null) is a reply that did not open. Anything else (a preview client, or a member's own
// "me") goes through dashMessageClient to the chat bubble, which opens only where the bubble is on
// the page. False when nothing opened: the caller then marks nothing.
const DWK_REPLY_TAB = "shape-week-reply";
function dwkOpenReply(rec, role, draft) {
  const id = rec && rec.profile ? rec.profile.id : null;
  const href = typeof dashMessageHref === "function" ? dashMessageHref(role, id, draft) : null;
  if (href) {
    let w = null;
    try { w = window.open(href, DWK_REPLY_TAB); } catch (e) { w = null; }
    if (!w) return false;
    try { if (typeof w.focus === "function") w.focus(); } catch (e) { /* the tab opened all the same */ }
    return true;
  }
  const bubble = typeof window.__openChatTo === "function" || typeof window.__openChat === "function" || !!document.getElementById("shape-global-chat-button");
  if (!bubble || typeof dashMessageClient !== "function") return false;
  dashMessageClient(rec.profile.name, role, draft, id);
  return true;
}
// The panel's line about the last reply, in words (`notice.kind`).
function dwkNoticeText(n, live) {
  if (!n) return null;
  if (n.kind === "saving") return "Reply opened for " + n.name + " · marking it reviewed…";
  if (n.kind === "saved") return "Replied to " + n.name + " and marked reviewed ✓" + (n.last ? " · that was the last check-in waiting" : "");
  if (n.kind === "local") return "Replied to " + n.name + " · marked reviewed on this tab only, " + (live ? "sign in to keep your reviews" : "the preview doesn't save");
  if (n.kind === "failed") return "The reply to " + n.name + " opened, but marking it reviewed didn't save. Try Mark reviewed again.";
  if (n.kind === "noopen") return "The reply to " + n.name + " couldn't open (a blocked pop-up?), so the check-in isn't marked reviewed.";
  return null;
}

// ── The pieces ───────────────────────────────────────────────────────────────
const DWK_SERIF = "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)";
const DWK_CARD = { background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: "18px 20px", minWidth: 0, boxSizing: "border-box" };
const DWK_EYEBROW = { fontFamily: DWK_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DWK_INK50 };
const DWK_CHIP = { display: "inline-block", fontFamily: DWK_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid currentColor", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" };
const DWK_FILLED = { fontFamily: DWK_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-deep, #06231f)", background: DWK_TEAL, border: 0, borderRadius: 6, padding: "9px 14px", minHeight: 34, cursor: "pointer", boxShadow: "var(--lift-key-fill, 0 0 0 transparent)" };
const DWK_REVIEW_INK = { reviewed: "var(--sh-green, #7bbf5a)", waiting: DWK_AMBER, unknown: "rgba(var(--sh-ink-rgb, 242,237,228),0.22)" };
// The layout lives in classes, not inline grids: pageShell's phone rules collapse any inline
// `repeat(…)` or `1fr 1fr` grid to one column at 900px, which would stack the table's columns.
const DWK_CSS = [
  ".dwk-top{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:stretch;margin-bottom:16px}",
  ".dwk-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(330px,390px);gap:16px;align-items:start}",
  ".dwk-heat-scroll{overflow-x:auto;margin:0 -6px;padding:0 6px 6px}",
  ".dwk-heat{min-width:600px}",
  ".dwk-heat-row{display:grid;grid-template-columns:minmax(128px,1.5fr) repeat(6,minmax(50px,1fr)) minmax(86px,0.9fr);gap:6px;align-items:center}",
  ".dwk-heat-row[role=button]:focus-visible{outline:2px solid var(--sh-accent, #2ee0c4);outline-offset:1px}",
  ".dwk-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}",
  "@media (max-width:1180px){.dwk-split{grid-template-columns:minmax(0,1fr)}}",
  "@media (max-width:980px){.dwk-top{grid-template-columns:minmax(0,1fr)}}",
  "@media (max-width:480px){.dwk-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}",
].join("\n");

function DwkChip({ color, children }) { return <span style={{ ...DWK_CHIP, color }}>{children}</span>; }

// The ring: one segment a client who checked in, each the colour of its review state, with the
// states in words beside it (DwkRingKey) and on each segment's title.
function DwkRing({ segments, size = 96 }) {
  const n = segments.length;
  const r = 38, c = 2 * Math.PI * r;
  const len = n ? c / n : c;
  const gap = n > 1 ? Math.min(3.2, len / 3) : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" data-dwk-ring={String(n)} style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.08)" strokeWidth="11" />
      {segments.map((s, i) => (
        <circle key={String(s.id)} data-dwk-seg={s.state} cx="50" cy="50" r={r} fill="none" stroke={DWK_REVIEW_INK[s.state]} strokeWidth="11"
          strokeDasharray={(len - gap) + " " + (c - len + gap)} strokeDashoffset={-(i * len)} transform="rotate(-90 50 50)">
          <title>{s.name + " · " + (s.state === "unknown" ? "review not read" : s.state)}</title>
        </circle>
      ))}
    </svg>
  );
}
function DwkRingKey({ segments }) {
  const count = (k) => segments.filter((s) => s.state === k).length;
  const items = [["waiting", "waiting"], ["reviewed", "reviewed"], ["unknown", "review not read"]].map(([k, words]) => [k, count(k), words]).filter(([, n]) => n);
  if (!items.length) return null;
  return (
    <div data-dwk-ring-key="" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontFamily: DWK_MONO, fontSize: 9.5, letterSpacing: "0.06em", color: DWK_INK50 }}>
      {items.map(([k, n, words]) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: DWK_REVIEW_INK[k] }} />
          {n + " " + words}
        </span>
      ))}
    </div>
  );
}

// The head (Lift 2: the one thing to act on stands highest).
function DwkHead({ model, onStart, canStart, onMarkAll, canMarkAll }) {
  const count = (k) => model.segments.filter((s) => s.state === k).length;
  const label = model.segments.length
    ? "Check-ins this week: " + [["waiting", "waiting"], ["reviewed", "reviewed"], ["unknown", "review not read"]].filter(([k]) => count(k)).map(([k, words]) => count(k) + " " + words).join(", ")
    : "No check-ins to show";
  return (
    <section aria-label="To review" data-dash-lift="2" style={{ ...DWK_CARD, boxShadow: "var(--lift-2, 0 4px 14px rgba(0,0,0,0.14))" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div role="img" aria-label={label}><DwkRing segments={model.segments} /></div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={DWK_EYEBROW}>To review</div>
          <div data-dwk-head="" style={{ fontFamily: DWK_SERIF, fontSize: 28, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.1, marginTop: 6, color: DWK_INK }}>{dwkHeadTitle(model)}</div>
          <div data-dwk-facts="" style={{ fontSize: 13, color: DWK_INK50, marginTop: 6, lineHeight: 1.45 }}>{model.facts.join(" · ")}</div>
          <DwkRingKey segments={model.segments} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" data-dwk-start="" onClick={onStart} disabled={!canStart} style={{ ...DWK_FILLED, opacity: canStart ? 1 : 0.45, cursor: canStart ? "pointer" : "default" }}>Start review</button>
            <button type="button" onClick={onMarkAll} disabled={!canMarkAll} style={{ ...DWK_FILLED, color: "var(--sh-accent-ink, #2ee0c4)", background: "transparent", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)", boxShadow: "none", opacity: canMarkAll ? 1 : 0.45, cursor: canMarkAll ? "pointer" : "default" }}>Mark all reviewed</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// What stands out (Lift 1, a resting card).
function DwkPatterns({ lines, empty }) {
  return (
    <section aria-label="What stands out" data-dash-lift="1" style={{ ...DWK_CARD, boxShadow: "var(--lift-1, 0 1px 2px rgba(0,0,0,0.04))" }}>
      <div style={DWK_EYEBROW}>What stands out</div>
      {lines.length ? (
        <ul data-dwk-patterns={String(lines.length)} style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 10 }}>
          {lines.map((l) => (
            <li key={l.key} data-dwk-pattern={l.key} style={{ fontSize: 14, lineHeight: 1.45, color: DWK_INK, paddingLeft: 12, borderLeft: "2px solid " + (l.key === "weak" ? DWK_BANDS.low.ink : l.key === "asks" ? DWK_TEAL : DWK_AMBER) }}>{l.text}</li>
          ))}
        </ul>
      ) : (
        <div data-dwk-patterns="0" style={{ fontSize: 13, color: DWK_INK50, marginTop: 10, lineHeight: 1.5 }}>{empty}</div>
      )}
    </section>
  );
}

// One rating tile: the number printed and its band in words; a missing rating is an empty tile that
// says so, never a 0.
function DwkTile({ label, value, big }) {
  const n = dwkRating(value);
  const band = dwkBand(value);
  const box = { display: "flex", flexDirection: "column", alignItems: big ? "flex-start" : "center", justifyContent: "center", gap: 1, minHeight: big ? 54 : 38, padding: big ? "7px 9px" : "4px 2px", borderRadius: 6, boxSizing: "border-box", minWidth: 0 };
  if (!band) {
    return (
      <span data-dwk-band="none" title={label + ": not rated"} style={{ ...box, border: "1px dashed rgba(var(--sh-ink-rgb, 242,237,228),0.2)", color: DWK_INK50 }}>
        {big && <span style={{ fontFamily: DWK_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>}
        <span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.04em", fontStyle: "italic" }}>not rated</span>
      </span>
    );
  }
  const b = DWK_BANDS[band];
  return (
    <span data-dwk-band={band} title={label + " " + n + "/10 · " + b.label} style={{ ...box, background: b.fill, border: "1px solid " + b.edge }}>
      {big && <span style={{ fontFamily: DWK_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: DWK_INK50 }}>{label}</span>}
      <span style={{ fontFamily: DWK_SERIF, fontSize: big ? 19 : 16, fontWeight: 600, lineHeight: 1, color: DWK_INK, fontVariantNumeric: "tabular-nums" }}>{n}{big && <span style={{ fontSize: 11, opacity: 0.55 }}>/10</span>}</span>
      <span style={{ fontFamily: DWK_MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: b.ink }}>{b.label}</span>
    </span>
  );
}

// The row's state, as a labelled chip.
function DwkStatusChip({ entry, reviewsRead }) {
  if (entry.reviewed) return <DwkChip color={DASH_SEV_COLORS.green}>Reviewed ✓</DwkChip>;
  if (entry.state !== "in") return <span />;
  return reviewsRead ? <DwkChip color={DWK_AMBER}>Waiting</DwkChip> : <DwkChip color={DWK_INK50}>Checked in</DwkChip>;
}
function dwkNoCheckinText(entry, isCurrent) {
  if (entry.state === "beyond") return "Check-in not loaded for this week · the client file holds the full history";
  if (entry.state === "unread") return "Check-in couldn't be read";
  if (entry.state === "loading") return "Loading the check-in…";
  return (isCurrent ? "No check-in yet" : "No check-in") + (entry.last ? " · last one " + dwkFmt(entry.last) : "");
}

// One client's row: their tier mark, their name in the page's ink, the six tiles (or what stands in
// for a check-in that is not there), and their state. ⚠ The row is the button: nothing inside it is
// a control, and its own keys only (dashRowKeyOpen) open it.
function DwkHeatRow({ entry, picked, isCurrent, reviewsRead, onSelect, onStep }) {
  const rec = entry.row.client;
  const points = typeof dashRecordTier === "function" ? dashRecordTier(rec) : null;
  const tier = typeof dashTierMark === "function" ? dashTierMark(points) : null;
  const state = entry.reviewed ? "reviewed" : entry.state !== "in" ? (entry.state === "none" ? "no check-in" : "check-in not read") : reviewsRead ? "waiting" : "checked in";
  const open = () => onSelect(entry.id);
  return (
    <div className="dwk-heat-row" data-dwk-row={String(entry.id)} data-dwk-state={entry.state} role="button" tabIndex={0}
      aria-current={picked ? "true" : undefined}
      aria-label={"Open " + rec.profile.name + "'s check-in" + (tier ? ", " + tier.title : "") + ", " + state}
      data-dash-lift={picked ? "1" : undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") return onStep(e, 1);
        if (e.key === "ArrowUp") return onStep(e, -1);
        // Enter and Space are the row's own keys only (dashToday.jsx dashRowKeyOpen, #2628).
        if (typeof dashRowKeyOpen === "function") return dashRowKeyOpen(e, true, open);
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); }
      }}
      style={{ padding: "7px 8px", borderRadius: 8, cursor: "pointer", position: "relative", borderTop: "1px solid " + (picked ? "transparent" : "rgba(var(--sh-ink-rgb, 242,237,228),0.06)"), opacity: entry.reviewed && !picked ? 0.78 : 1,
        // ⚠ HEIGHT MEANS PRIORITY: the table rests, and the selected row lifts to its panel's height.
        ...(picked ? { zIndex: 1, background: "var(--sh-card, #25211d)", boxShadow: "var(--lift-1, 0 2px 8px rgba(0,0,0,0.12))" } : null) }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {typeof DashClientGem === "function" ? <DashClientGem points={points} decorative /> : null}
        <span style={{ fontSize: 13.5, fontWeight: 600, color: DWK_INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.profile.name}</span>
      </span>
      {entry.ck
        ? DWK_RATINGS.map(([k, label]) => <DwkTile key={k} label={label} value={entry.ck.ratings ? entry.ck.ratings[k] : null} />)
        : <span data-dwk-nockin="" style={{ gridColumn: "span 6", fontFamily: DWK_MONO, fontSize: 10, letterSpacing: "0.04em", color: DWK_INK50, fontStyle: "italic", padding: "0 6px" }}>{dwkNoCheckinText(entry, isCurrent)}</span>}
      <span style={{ textAlign: "right" }}><DwkStatusChip entry={entry} reviewsRead={reviewsRead} /></span>
    </div>
  );
}

function DwkStat({ label, value, sub, tone }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_INK50 }}>{label}</div>
      <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 18, marginTop: 3, color: tone || DWK_INK, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, color: DWK_INK50, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

// ── Read, reply, next: the selected client's check-in (Lift 1, meeting its row) ──
// The Week's own panel (not the Clients peek). `entry` is the page's reading of this client's week;
// without one (a caller that renders the panel on its own) it is worked out here the same way.
function DwkCheckinPanel({ row, role, weekOf, thisMonday, live, review, adherence, readout, onReview, onNote, canPersist, editable, entry, onReply, next, onNext, notice }) {
  const rec = row.client;
  const id = rec.profile.id;
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(review && review.note ? review.note : "");
  const units = useDashUnits();
  React.useEffect(() => { setDraft(review && review.note ? review.note : ""); }, [review && review.note, id, weekOf]);
  const week = entry || dwkCheckinOf(rec, weekOf, thisMonday, live);
  const ck = week.ck;
  const sevColor = row.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[row.severity] || DASH_SEV_COLORS.unknown;
  const reviewed = dashCheckinReviewed(review, ck);
  const isCurrent = weekOf === thisMonday;
  // Adherence: closed weeks only. The current week has no number yet.
  let adh = null, adhPrev = null, adhNote = null;
  if (isCurrent) adhNote = "closes Sunday";
  else if (!live) { const d = dwkDemoAdherence(rec, weekOf); adh = d.pct; adhPrev = d.prev; }
  else if (adherence && adherence[id]) { const a = adherence[id][weekOf], p = adherence[id][dwkAddDays(weekOf, -7)]; adh = a ? a.pct : null; adhPrev = p ? p.pct : null; if (a && a.pct == null) adhNote = "too few units to rate"; else if (!a) adhNote = "not in the window"; }
  else adhNote = adherence ? "not shared" : "—";
  const adhDelta = adh != null && adhPrev != null ? adh - adhPrev : null;
  const food = dwkFoodLogs(rec, weekOf, isCurrent, live);
  const logs = food.n;
  // ⚠ SORTED BEFORE INDEXING. The coach JSONB path (overall.weighIns) carries no
  // order guarantee — dashSignals ships its own sortedWeighIns for exactly this —
  // and a newest-first array read positionally shows the client's FIRST weight as
  // current and inverts the gained/lost sign.
  const w = dwkWeighInsFor(rec.weighIns, weekOf, isCurrent)
    .slice()
    .sort((a, b) => new Date(a.on || 0).getTime() - new Date(b.on || 0).getTime());
  const wLast = w.length ? w[w.length - 1] : null, wPrev = w.length > 1 ? w[w.length - 2] : null;
  const wDelta = wLast && wPrev ? dashWeighInDelta(wPrev, wLast, units) : null;
  const href = typeof dashClientHref === "function" ? dashClientHref(rec, role) : null;
  const btn = { fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 4, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", background: "transparent", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", cursor: "pointer", textDecoration: "none", display: "inline-block" };
  const replyDraft = row.flags.length ? dashMessageDraft(row) : null;
  const canReply = !!ck && !reviewed && editable && typeof onReply === "function";
  const said = dwkNoticeText(notice, live);
  const alarm = notice && (notice.kind === "failed" || notice.kind === "noopen");
  return (
    <section aria-label={rec.profile.name + "'s check-in"} data-dwk-panel={String(id)} data-dash-lift="1" style={{ ...DWK_CARD, boxShadow: "var(--lift-1, 0 2px 8px rgba(0,0,0,0.12))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={DWK_EYEBROW}>{isCurrent ? "This week's check-in" : "Check-in · week of " + dwkFmt(weekOf)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
            {typeof DashClientGem === "function" ? <DashClientGem points={typeof dashRecordTier === "function" ? dashRecordTier(rec) : null} /> : null}
            <span style={{ fontFamily: DWK_SERIF, fontSize: 21, letterSpacing: "-0.01em", color: DWK_INK }}>{rec.profile.name}</span>
            {reviewed ? <DwkChip color={DASH_SEV_COLORS.green}>Reviewed ✓</DwkChip> : ck ? <DwkChip color={DWK_AMBER}>Waiting</DwkChip> : null}
          </div>
          {row.flags.length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{row.flags.map((f, i) => <DashPill key={i} c={sevColor}>{f.label}</DashPill>)}</div> : null}
        </div>
        {/* Disabled until the reviews doc has resolved: a tick taken while the
            read is in flight would paint, never write, and then be erased when
            the read lands — the UI would have promised a save that never was. */}
        <label title={editable ? undefined : "Loading your reviews…"} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: editable ? "pointer" : "default", opacity: editable ? 1 : 0.5, fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: reviewed ? DASH_SEV_COLORS.green : DWK_INK50, padding: "6px 10px", border: "1px solid " + (reviewed ? "rgba(123,191,90,0.4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)"), borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0 }}>
          <input type="checkbox" checked={reviewed} disabled={!editable} onChange={(e) => onReview(e.target.checked)} style={{ accentColor: "var(--sh-green, #7bbf5a)", margin: 0 }} />
          {reviewed ? "Reviewed" : "Mark reviewed"}
        </label>
      </div>
      {/* The check-in */}
      <div style={{ marginTop: 14 }}>
        {ck ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div className="dwk-tiles">{DWK_RATINGS.map(([k, label]) => <DwkTile key={k} label={label} value={ck.ratings ? ck.ratings[k] : null} big />)}</div>
            {ck.wins && <div style={{ fontSize: 13, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", marginTop: 4 }}><span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_SEV_COLORS.green, marginRight: 8 }}>Win</span>{ck.wins}</div>}
            {ck.struggles && <div style={{ fontSize: 13, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}><span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_AMBER, marginRight: 8 }}>Struggle</span>{ck.struggles}</div>}
            {ck.question && <div style={{ fontSize: 13.5, color: DWK_INK, padding: "8px 12px", borderLeft: "2px solid " + DWK_TEAL, background: "rgba(var(--sh-accent-rgb, 46,224,196),0.06)" }}><span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_TEAL, marginRight: 8 }}>Asked you</span>{ck.question}</div>}
          </div>
        ) : (
          <div style={{ fontFamily: DWK_MONO, fontSize: 10, letterSpacing: "0.04em", color: DWK_INK50, fontStyle: "italic" }}>{dwkNoCheckinText(week, isCurrent)}</div>
        )}
      </div>
      {/* THE READ — the member's own weekly readout, from the cache.
          ⚠ SHOWN ONLY WHERE IT EXISTS, AND SILENT OTHERWISE. Nothing here
          generates one: this page reads `ai_weekly_readouts` under the coach
          SELECT policy, so a coach scrolling their Week never spends a
          member's one weekly AI call.
          ⚠ AND AN ABSENCE IS NOT REPORTED, because this page cannot tell the
          two reasons apart. `is_coach_on_client` requires an open (active, trialing
          or past_due) subscription, while the roster also carries session-only clients — so
          a member whose readout the coach simply may not SELECT arrives
          identically to one who never ran it. A line about a missing read would tell a
          coach that a member has not done something they may be looking at on
          their own Progress page. The mobile card's rule, for the same reason:
          there is no readout, so there is nothing. */}
      {live && readout && readout.summary && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
          <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_INK50, marginBottom: 5 }}>
            {"The read" + (readoutStamp(readout, true) ? " · " + readoutStamp(readout, true) : "")}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}>{readout.summary}</div>
        </div>
      )}
      {/* The numbers */}
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 14 }}>
        <DwkStat label={isCurrent ? "Adherence · this week" : "Adherence · week"} value={adh != null ? adh + "%" : "—"} sub={adhDelta != null ? (adhDelta >= 0 ? "▲ +" : "▼ −") + Math.abs(adhDelta) + " vs week before" : adhNote} tone={adh != null && adh < 70 ? DWK_AMBER : null} />
        <DwkStat label={food.label} value={logs != null ? logs + "/7" : "—"} sub={logs == null ? food.note : logs <= 3 ? "thin week" : null} tone={logs != null && logs <= 3 ? DWK_AMBER : null} />
        <DwkStat label="Weigh-in" value={wLast ? units.fmt(Number(wLast.weight), wLast.unit || "lb") : (ck && ck.weight != null ? units.fmt(Number(ck.weight), ck.unit || "kg") : "—")} sub={wDelta != null ? (wDelta > 0 ? "+" : "") + wDelta + " since the one before" : wLast ? "first shared weigh-in" : "none shared"} />
      </div>
      {/* Note */}
      {(noteOpen || (review && review.note)) && (
        <div style={{ marginTop: 12 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="What you saw this week, what you'll change, what to ask next week."
            style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 6, padding: 10, color: DWK_INK, fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13, lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            {(() => {
              const unchanged = draft === ((review && review.note) || "");
              const off = unchanged || !editable;
              return <button type="button" onClick={() => { onNote(draft); setNoteOpen(false); }} disabled={off} style={{ ...btn, color: "var(--sh-deep, #06231f)", background: DWK_TEAL, border: 0, opacity: off ? 0.5 : 1, cursor: off ? "default" : "pointer" }}>Save note</button>;
            })()}
            <span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DWK_INK50 }}>{!editable ? "Loading your notes…" : canPersist ? "Private to you" : "Sign in to keep notes"}</span>
          </div>
        </div>
      )}
      {said && <div data-dwk-notice={notice.kind} role={alarm ? "alert" : "status"} style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.45, color: alarm ? DASH_SEV_COLORS.red : notice.kind === "saved" ? DASH_SEV_COLORS.green : DWK_INK50 }}>{said}</div>}
      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
        {canReply && <button type="button" data-dwk-reply="" title="Opens the reply in its own tab, so the Week stays here for the next one" onClick={() => onReply(replyDraft)} style={DWK_FILLED}>Reply & mark reviewed</button>}
        <button type="button" onClick={() => dashMessageClient(rec.profile.name, role, row.flags.length ? dashMessageDraft(row) : null, rec.profile.id)} style={{ ...btn, color: "var(--sh-accent-ink, #2ee0c4)", borderColor: "rgba(var(--sh-accent-rgb, 46,224,196),0.35)", background: "rgba(var(--sh-accent-rgb, 46,224,196),0.08)" }}>Message</button>
        {!(noteOpen || (review && review.note)) && <button type="button" onClick={() => setNoteOpen(true)} style={btn}>＋ Note</button>}
        {href && <a href={href} style={btn}>Client file →</a>}
      </div>
      {next && typeof onNext === "function" && (
        <button type="button" data-dwk-next={String(next.id)} onClick={() => onNext(next.id)} style={{ ...btn, border: 0, padding: "10px 0 0", color: "var(--sh-accent-ink, #2ee0c4)" }}>{"Next waiting: " + next.row.client.profile.name + " →"}</button>
      )}
    </section>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
function CoachWeekPage({ role }) {
  const nav = role === "nutritionist" ? nutriNavItems : trainerNavItems;
  const card = role === "nutritionist" ? nutriPayoutCard : trainerPayoutCard;
  // Re-read when the coach comes back to the tab, so a check-in that arrived meanwhile shows.
  const { loading, triage, source } = useDashboard(role, { refreshOnFocus: true });
  const live = source === "live";
  // The viewer's zone landing or changing re-renders "this week" (shapeZone.mjs's event).
  const [, setZoneTick] = React.useState(0);
  React.useEffect(() => {
    const h = () => setZoneTick((n) => n + 1);
    window.addEventListener("shape:timezone", h);
    return () => window.removeEventListener("shape:timezone", h);
  }, []);
  const thisMonday = dwkIso(dwkMonday(dwkToday()));
  const [weekOf, setWeekOf] = React.useState(thisMonday);
  // ⚠ A ZONE THAT MOVES "THIS WEEK" MOVES THE WEEK ON SCREEN, if it was this week (Codex on #2624).
  // The account's zone can land after the first paint, across a Monday from this browser's, and
  // the page kept showing, and writing reviews for, last week. A week the coach chose stays.
  const shownMonday = React.useRef(thisMonday);
  React.useEffect(() => {
    const was = shownMonday.current;
    if (was === thisMonday) return;
    shownMonday.current = thisMonday;
    setWeekOf((w) => (w === was ? thisMonday : w));
  }, [thisMonday]);
  const [onlyOpen, setOnlyOpen] = React.useState(false);
  const reviews = useWeekReviews(live);
  // ⚠ LIVE OR SAMPLE: THE SAMPLE ROSTER IS THE SIGNED-OUT PREVIEW'S ONLY (#2628 to #2638).
  // useDashboard falls back to its demo whenever the roster read fails, signed out and outage alike,
  // so the demo's people are shown, under the band, only to a viewer the session says is signed out
  // (`accountId` null, the reviews store's own useSignedIn). A signed-in coach whose roster could not
  // be read is told so, never shown sample people; until the session has answered, the page loads.
  const preview = source === "demo" && reviews.accountId === null;
  const rosterUnread = source === "demo" && typeof reviews.accountId === "string";
  const pending = source == null || (source === "demo" && reviews.accountId === undefined) || (!!loading && !(triage || []).length);
  const rows = live || preview ? (triage || []).filter((r) => r && r.client && r.client.profile) : [];
  const ids = rows.map((r) => r.client.profile.id).filter((id) => id && !/^demo-/.test(String(id)));
  const adherence = useRosterAdherence(ids, live);
  // Read-only: the coach never generates a member's readout — see useWeekReadouts.
  // Whole weeks back from today, because that is the only part the local and UTC
  // calendars agree on (readoutWeekKey turns it into the route's own key).
  const weeksBack = Math.round((new Date(thisMonday + "T00:00:00") - new Date(weekOf + "T00:00:00")) / (7 * 86400000));
  const readouts = useWeekReadouts(ids, weeksBack, live);
  const [localDemo, setLocalDemo] = React.useState({}); // ticks that cannot be persisted — this tab only
  const canPersist = reviews.kind === "ready" || reviews.kind === "error";
  // Where a tick goes: the account's store when it resolved, otherwise a local
  // one so the control still responds (the header says it will not be kept).
  const persisting = live && canPersist;
  const weekDoc = persisting ? (reviews.doc[weekOf] || {}) : (localDemo[weekOf] || {});
  // Everything except the in-flight read is editable — see the checkbox comment
  // in DwkCheckinPanel for why a tick during the load is the one case that must not paint.
  const editable = !live || reviews.kind !== "loading";
  const isCurrent = weekOf === thisMonday;
  // The account's reviews were read (or this is the preview, whose ticks are this tab's): until then
  // nothing is "waiting" or "reviewed" in the head's count.
  const reviewsRead = !live || canPersist;
  const entries = dwkEntries(rows, { weekOf, thisMonday, live, weekDoc });
  const head = rosterUnread ? dwkHeadWithout("unread") : pending ? dwkHeadWithout("loading") : dwkHeadModel(entries, { reviewsRead, reviewsLoading: live && reviews.kind === "loading", isCurrent });
  const patterns = rosterUnread || pending ? [] : dwkPatterns(entries, isCurrent);
  const shown = onlyOpen ? entries.filter((e) => !e.reviewed) : entries;
  const patch = (patches) => {
    if (persisting) return reviews.apply(patches);
    setLocalDemo((d) => { const wk = { ...(d[weekOf] || {}) }; for (const p of patches) wk[p.clientId] = { ...(wk[p.clientId] || {}), ...p.patch }; return { ...d, [weekOf]: wk }; });
    return Promise.resolve(false);
  };
  const markReviewed = (e, on) => patch([{ weekOf, clientId: e.id, patch: { reviewedAt: on ? new Date().toISOString() : null, checkinSignature: on && e.ck ? JSON.stringify(e.ck) : null } }]);

  // ── Selection: one client open beside the table ──
  const [selId, setSelId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const selRef = React.useRef(null);
  selRef.current = selId;
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => { setNotice(null); }, [weekOf]);
  const tableRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const sel = selId != null ? entries.find((e) => String(e.id) === String(selId)) || null : null;
  // On a narrow screen the panel is under the table: a tap (not an arrow key) brings it into view.
  const reveal = () => {
    try {
      const narrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1180px)").matches;
      if (narrow && panelRef.current && typeof panelRef.current.scrollIntoView === "function") panelRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (e) { /* the panel is there all the same */ }
  };
  const select = (id, how) => { setSelId(id); setNotice(null); if (how !== "key") reveal(); };
  const focusRow = (id) => {
    try {
      const el = tableRef.current ? Array.from(tableRef.current.querySelectorAll("[data-dwk-row]")).find((x) => x.getAttribute("data-dwk-row") === String(id)) : null;
      if (el) el.focus({ preventScroll: true });
    } catch (e) { /* focus is a convenience */ }
  };
  // ↑ ↓ from a row: the next row as drawn, focused and opened. Only the row's own keys: an arrow in a
  // control is that control's.
  const step = (e, by) => {
    if (e.target !== e.currentTarget || !tableRef.current) return;
    const all = Array.from(tableRef.current.querySelectorAll("[data-dwk-row]"));
    const at = all.indexOf(e.currentTarget);
    if (at < 0) return;
    e.preventDefault();
    const nextEl = all[at + by];
    if (!nextEl) return;
    const ent = shown.find((x) => String(x.id) === nextEl.getAttribute("data-dwk-row"));
    if (ent) select(ent.id, "key");
    nextEl.focus();
  };
  const firstWaiting = shown.find((e) => e.state === "in" && !e.reviewed) || null;
  const startReview = () => { if (!firstWaiting) return; select(firstWaiting.id); focusRow(firstWaiting.id); };
  // Reply & mark reviewed: the reply first (dwkOpenReply), the review only if it opened, then the
  // next client waiting. A failed write stays on this client and says so.
  const reply = async (e, draft) => {
    const name = e.row.client.profile.name;
    if (!dwkOpenReply(e.row.client, role, draft)) { setNotice({ id: e.id, name, kind: "noopen" }); return; }
    const next = dwkNextWaiting(shown, e.id);
    const wasPersisting = persisting;
    setNotice({ id: e.id, name, kind: "saving" });
    let ok = false;
    try { ok = await markReviewed(e, true); } catch (err) { ok = false; }
    if (!alive.current) return;
    if (wasPersisting && !ok) { setNotice({ id: e.id, name, kind: "failed" }); return; }
    setNotice({ id: e.id, name, kind: ok ? "saved" : "local", last: !next });
    // A coach who opened another client while the save ran stays where they went.
    if (next && String(selRef.current) === String(e.id)) { setSelId(next.id); focusRow(next.id); }
  };

  const rel = weekOf === thisMonday ? "this week" : weekOf === dwkAddDays(thisMonday, -7) ? "last week" : weekOf > thisMonday ? "ahead" : Math.round((new Date(thisMonday + "T00:00:00") - new Date(weekOf + "T00:00:00")) / (7 * 86400000)) + " weeks ago";
  const chip = (on) => ({ fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 4, border: "1px solid " + (on ? DWK_TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)"), background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.10)" : "transparent", color: on ? "var(--sh-accent-ink, #2ee0c4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", cursor: "pointer" });
  const actions = (
    <React.Fragment>
      <button type="button" onClick={() => setWeekOf(dwkAddDays(weekOf, -7))} style={chip(false)} aria-label="Previous week">‹ Prev</button>
      <button type="button" onClick={() => setWeekOf(thisMonday)} style={chip(weekOf === thisMonday)}>This week</button>
      <button type="button" onClick={() => setWeekOf(dwkAddDays(weekOf, 7))} disabled={weekOf >= thisMonday} style={{ ...chip(false), opacity: weekOf >= thisMonday ? 0.4 : 1 }} aria-label="Next week">Next ›</button>
    </React.Fragment>
  );
  const storeLine = !live ? "Preview — ticks and notes stay on this tab"
    : reviews.kind === "error" ? "Couldn't save — your last change didn't stick, try again"
    : reviews.kind === "signedout" || reviews.kind === "unavailable" ? "Sign in to keep your reviews — ticks and notes live with your account"
    : reviews.kind === "loading" ? "Loading your reviews…"
    : "Ticks and notes are private to you, saved per client per week";
  const canMarkAll = !!rows.length && entries.some((e) => !e.reviewed) && editable;
  const markAll = () => { const now = new Date().toISOString(); patch(entries.filter((e) => !e.reviewed).map((e) => ({ weekOf, clientId: e.id, patch: { reviewedAt: now, checkinSignature: e.ck ? JSON.stringify(e.ck) : null } }))); };
  const anyIn = entries.some((e) => e.state === "in");
  const allUnread = rows.length > 0 && entries.every((e) => e.state === "unread" || e.state === "beyond" || e.state === "loading");
  const patternsEmpty = allUnread ? "This week's check-ins couldn't be read, so there is nothing to work out yet."
    : !anyIn ? (isCurrent ? "Nothing to work out yet: no check-ins this week so far." : "Nothing to work out: no check-ins that week.")
    : "Nothing stands out across this week's check-ins.";
  const next = sel ? dwkNextWaiting(shown, sel.id) : null;
  return (
    <React.Fragment>
      {preview && <DashDemoBand />}
      <DashPage
        navItems={nav("week")}
        payoutCard={card}
        actions={actions}
        eyebrow={"END OF WEEK · REVIEW · " + rel.toUpperCase()}
        title={"Week of " + dwkFmt(weekOf)}
        subtitle="Every client's check-in in one table, what stands out across them, and the one you are reading beside it. Reply, mark it reviewed, and go on to the next."
      >
        <style>{DWK_CSS}</style>
        <div className="dwk-top">
          <DwkHead model={head} onStart={startReview} canStart={!!firstWaiting && !rosterUnread && !pending} onMarkAll={markAll} canMarkAll={canMarkAll && !rosterUnread && !pending} />
          {!rosterUnread && !pending ? <DwkPatterns lines={patterns} empty={patternsEmpty} /> : <div />}
        </div>
        <div className="dwk-split">
          <section aria-label="The roster's check-ins" data-dash-lift="0" style={{ ...DWK_CARD, padding: "16px 16px 10px", boxShadow: "var(--lift-0, 0 1px 2px rgba(0,0,0,0.04))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <span className="dash-eyebrow" style={{ "--dac": DWK_TEAL }}>The roster · {rows.length} client{rows.length === 1 ? "" : "s"}</span>
                <div style={{ fontFamily: DWK_MONO, fontSize: 9.5, color: DWK_INK50, marginTop: 6 }}>{storeLine}</div>
              </div>
              <button type="button" onClick={() => setOnlyOpen(!onlyOpen)} style={chip(onlyOpen)}>{onlyOpen ? "Showing unreviewed" : "Unreviewed only"}</button>
            </div>
            {/* The scale, in words: what each band's colour means, on the form's own 1-10. */}
            <div data-dwk-legend="" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 10, fontFamily: DWK_MONO, fontSize: 9, letterSpacing: "0.06em", color: DWK_INK50 }}>
              {[["good", DWK_GOOD_AT + "–10"], ["mid", (DWK_LOW_AT + 1) + "–" + (DWK_GOOD_AT - 1)], ["low", "1–" + DWK_LOW_AT]].map(([k, range]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: DWK_BANDS[k].fill, border: "1px solid " + DWK_BANDS[k].edge }} />
                  {DWK_BANDS[k].label + " " + range}
                </span>
              ))}
              <span>· 10 is good on every question (Calm: 10 = calm)</span>
            </div>
            <div className="dash-ledger" style={{ marginTop: 10, marginBottom: 2 }} />
            {rosterUnread ? (
              <div data-dwk-roster="unread" style={{ fontSize: 12.5, color: DWK_INK50, padding: "14px 0", lineHeight: 1.55 }}>Your roster couldn't be read just now. Nothing is lost; reload to try again.</div>
            ) : pending && !rows.length ? (
              <div style={{ fontSize: 12.5, color: DWK_INK50, padding: "14px 0" }}>Loading your roster…</div>
            ) : !rows.length ? (
              <div style={{ fontSize: 12.5, color: DWK_INK50, padding: "14px 0", lineHeight: 1.55 }}>No clients on the roster yet — the week fills in with your first subscriber.</div>
            ) : !shown.length ? (
              <div style={{ fontSize: 12.5, color: DASH_SEV_COLORS.green, padding: "14px 0" }}>Every client reviewed for this week ✓</div>
            ) : (
              <div className="dwk-heat-scroll">
                <div className="dwk-heat" ref={tableRef}>
                  <div className="dwk-heat-row" aria-hidden="true" style={{ padding: "4px 8px 8px", fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DWK_INK50, lineHeight: 1.25 }}>
                    <span>Client</span>
                    {DWK_RATINGS.map(([k, label]) => <span key={k} style={{ textAlign: "center" }} title={k === "stress" ? "Stress · 10 = calm, as the member's form asks it" : undefined}>{label}</span>)}
                    <span style={{ textAlign: "right" }}>Status</span>
                  </div>
                  {shown.map((e) => (
                    <DwkHeatRow key={String(e.id)} entry={e} picked={!!sel && String(sel.id) === String(e.id)} isCurrent={isCurrent} reviewsRead={reviewsRead} onSelect={(id) => select(id)} onStep={step} />
                  ))}
                </div>
              </div>
            )}
          </section>
          <div ref={panelRef} style={{ minWidth: 0 }}>
            {sel && !rosterUnread ? (
              <DwkCheckinPanel key={String(sel.id) + weekOf} row={sel.row} entry={sel} role={role} weekOf={weekOf} thisMonday={thisMonday} live={live}
                review={sel.review} adherence={adherence} canPersist={live ? canPersist : false} editable={editable}
                readout={readouts ? readouts[sel.id] || null : null}
                onReview={(on) => markReviewed(sel, on)}
                onNote={(text) => patch([{ weekOf, clientId: sel.id, patch: { note: text } }])}
                onReply={(draft) => reply(sel, draft)}
                next={next} onNext={(id) => { select(id, "key"); focusRow(id); }}
                notice={notice} />
            ) : (
              <section aria-label="Check-in" data-dwk-panel="" style={{ ...DWK_CARD, boxShadow: "var(--lift-0, 0 1px 2px rgba(0,0,0,0.04))", borderStyle: "dashed" }}>
                <div style={DWK_EYEBROW}>Read · reply · next</div>
                <div style={{ fontSize: 13.5, color: DWK_INK50, marginTop: 10, lineHeight: 1.55 }}>{rows.length ? "Pick a client to read their check-in beside the table. Start review opens the first one waiting." : "A client's check-in opens here."}</div>
              </section>
            )}
          </div>
        </div>
        <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DWK_INK50, marginTop: 12, lineHeight: 1.7 }}>
          Ratings are the member's own weekly form, 1 to 10, and 10 is good on every question (Calm: 10 = calm; Hunger control: 10 = in control). Adherence is the roster's weekly rate (habits · sessions · logging) for closed weeks, the same figure the client file's variance line reads; the current week has no rate until it closes. A week without a check-in says so.
        </div>
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { CoachWeekPage });
