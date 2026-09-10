// The Week — the coach's end-of-week review (review 2026-09-09, R3).
//
// One row per client for the selected ISO week: their check-in (ratings ·
// wins · struggles · the question they asked you · weight), the week's
// adherence against the week before (the roster's weekly-adherence RPC — closed
// weeks only, so the current week reads "closes Sunday"), food-log days, the
// weigh-in move, the engine's flags, a Reviewed ✓ you can set per client per
// week, a private note, Message with a drafted opener, and the client file.
// "Mark all reviewed" closes the week in one write.
//
// Reviews persist per coach in ONE whole-doc store —
// user_goals 'coach_week_reviews': { [weekOf]: { [clientId]: { reviewedAt, note } } }
// — read before every write (a tick on one client never clobbers a note on
// another) and declined when the read cannot be trusted (getUserGoals resolves
// null for "not signed in" and "the read failed" alike). Signed out, the
// demo rows tick locally under the band and say so.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals.js →
// dashData.jsx → dashToday.jsx (DashPill · DASH_SEV_COLORS · dashMessageClient ·
// dashMessageDraft · dashClientHref · DashDemoBand) → this.

const DWK_MONO = "'JetBrains Mono', monospace";
const DWK_INK50 = "rgba(242,237,228,0.55)";
const DWK_INK = "#f2ede4";
const DWK_TEAL = "#2ee0c4";
const DWK_AMBER = "#d8a23a";
const DWK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// What /api/clients/[id]/shared-overview asks get_client_checkins for. Keep in
// step with that route: it decides how far back this page can claim an absence.
const DWK_CHECKIN_LIMIT = 4;

// Local-calendar ISO weeks (the check-in's week_of is the member's Monday; the
// coach reviews in their own week).
function dwkIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dwkMonday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
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
const _dwkLane = { p: Promise.resolve() };
function dwkSerial(fn) { const run = _dwkLane.p.then(fn, fn); _dwkLane.p = run.catch(() => {}); return run; }
function useWeekReviews(live) {
  const [state, setState] = React.useState({ kind: "loading", doc: {} });
  // The write path must read the CURRENT kind, not the one captured when the
  // handler was created: a tick during the load would otherwise take the stale
  // "loading" branch, skip the write, and then be erased by the load's setState.
  const kindRef = React.useRef("loading");
  kindRef.current = state.kind;
  const uidRef = React.useRef(null);
  React.useEffect(() => {
    let on = true;
    kindRef.current = "loading";
    if (!live) { setState({ kind: "demo", doc: {} }); return undefined; }
    setState({ kind: "loading", doc: {} });
    (async () => {
      const db = window.shapeDb;
      if (!db || !db.getUserGoals) { if (on) setState({ kind: "unavailable", doc: {} }); return; }
      await dwkBridge();
      if (!on) return;
      uidRef.current = await dwkUid();
      let doc = null;
      try { doc = await db.getUserGoals("coach_week_reviews"); } catch (e) { doc = null; }
      if (!on) return;
      setState(doc == null ? { kind: "signedout", doc: {} } : { kind: "ready", doc: doc || {} });
    })();
    return () => { on = false; };
  }, [live]);
  // patches: [{ weekOf, clientId, patch: { reviewedAt?, note? } }] — one read-merge-write.
  const apply = (patches) => {
    if (kindRef.current !== "ready" && kindRef.current !== "error") return Promise.resolve(false);
    setState((s) => {
      const doc = { ...s.doc };
      for (const { weekOf, clientId, patch } of patches) {
        const wk = { ...(doc[weekOf] || {}) };
        wk[clientId] = { ...(wk[clientId] || {}), ...patch };
        doc[weekOf] = wk;
      }
      return { ...s, doc, kind: s.kind === "error" ? "ready" : s.kind };
    });
    return dwkSerial(async () => {
      const db = window.shapeDb;
      // ⚠ BOUND TO THE ACCOUNT THAT TICKED. getUserGoals and saveUserGoals each
      // resolve the user independently at their own call time, so an account
      // switch between them would upsert coach A's whole reviews blob into B's
      // row. A changed or unresolvable identity discards the write instead.
      const startUid = uidRef.current;
      let doc = null;
      try { doc = await db.getUserGoals("coach_week_reviews"); } catch (e) { doc = null; }
      if (doc == null) { setState((s) => ({ ...s, kind: "error" })); return false; }
      const nowUid = await dwkUid();
      if (!nowUid || (startUid && nowUid !== startUid)) { setState((s) => ({ ...s, kind: "error" })); return false; }
      const next = { ...doc };
      for (const { weekOf, clientId, patch } of patches) {
        const wk = { ...(next[weekOf] || {}) };
        wk[clientId] = { ...(wk[clientId] || {}), ...patch };
        next[weekOf] = wk;
      }
      let res = null;
      try { res = await db.saveUserGoals("coach_week_reviews", next); } catch (e) { res = null; }
      if (!res || res.error) { setState((s) => ({ ...s, kind: "error" })); return false; }
      return true;
    });
  };
  return { ...state, apply };
}

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
  React.useEffect(() => {
    let on = true;
    setMap(null);
    const db = window.shapeDb && window.shapeDb.client;
    if (!live || !db || !ids.length) return undefined;
    // ⚠ THE ROUTE'S KEY, NOT THIS PAGE'S. See readoutWeekKey in dashData.jsx: the
    // row is stamped with the Monday of the **UTC** date, so querying a LOCAL
    // Monday misses a row on the week it belongs to and finds it on the week
    // before — a readout attributed to a week it was not run in.
    const weekKey = readoutWeekKey(weeksBack);
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
  }, [key, weeksBack, live]);
  return map;
}

// ── Demo check-ins + adherence for the mock roster — ONLY under the band ─────
function dwkDemoCheckin(rec, weekOf, thisMonday) {
  const name = rec.profile.name || "";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  const weeksBack = Math.round((new Date(thisMonday + "T00:00:00") - new Date(weekOf + "T00:00:00")) / (7 * 86400000));
  if (weeksBack < 0 || (h + weeksBack) % 5 === 0) return null;  // a few skipped weeks, like real rosters
  const r = (k) => 2 + ((h >> k) % 4);
  const wins = ["Hit every session", "Protein on target six days", "Best sleep week in a month", "Walked every morning", "Two PRs on the trap bar"];
  const strug = ["Late nights killed two sessions", "Travel — ate out most days", "Knee twinge on lunges", "Stress at work all week", null];
  const asks = ["Can we swap Friday to a shorter session?", null, "Should I add creatine?", null, "Is 1,900 kcal too low on rest days?"];
  return { week_of: weekOf, ratings: { trainingAdherence: r(1), nutritionAdherence: r(2), sleep: r(3), energy: r(4), stress: r(5), hunger: r(6) }, wins: wins[h % 5], struggles: strug[(h >> 2) % 5], question: asks[(h >> 3) % 5], weight: 70 + (h % 25) - weeksBack * 0.3, unit: "kg" };
}
function dwkDemoAdherence(rec, weekOf) {
  const name = rec.profile.name || "";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 17 + name.charCodeAt(i)) % 7919;
  const d = Number(weekOf.slice(8, 10));
  return { pct: 55 + ((h + d * 7) % 41), prev: 55 + ((h + d * 3) % 41) };
}

// ── Row pieces ───────────────────────────────────────────────────────────────
const DWK_RATINGS = [["trainingAdherence", "Training", "hi"], ["nutritionAdherence", "Nutrition", "hi"], ["sleep", "Sleep", "hi"], ["energy", "Energy", "hi"], ["stress", "Stress", "lo"], ["hunger", "Hunger", "lo"]];
function DwkRatings({ ratings }) {
  const R = ratings || {};
  const items = DWK_RATINGS.filter(([k]) => R[k] != null);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {items.map(([k, label, good]) => {
        const v = Number(R[k]);
        const flag = good === "hi" ? v <= 2 : v >= 4;
        return <span key={k} style={{ fontFamily: DWK_MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: flag ? DWK_AMBER : DWK_INK50 }}>{label} <b style={{ color: flag ? DWK_AMBER : DWK_INK, fontWeight: 700 }}>{v}</b><span style={{ opacity: 0.6 }}>/5</span></span>;
      })}
    </div>
  );
}
function DwkStat({ label, value, sub, tone }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_INK50 }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, marginTop: 3, color: tone || DWK_INK, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, color: DWK_INK50, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function DwkRow({ row, role, weekOf, thisMonday, live, review, adherence, readout, onReview, onNote, canPersist, editable }) {
  const rec = row.client;
  const id = rec.profile.id;
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(review && review.note ? review.note : "");
  React.useEffect(() => { setDraft(review && review.note ? review.note : ""); }, [review && review.note, id, weekOf]);
  const fetched = live && Array.isArray(rec.checkins) ? rec.checkins : null;
  const ck = live
    ? (fetched ? fetched.find((c) => dwkWeekOfRow(c) === weekOf) : null)
    : dwkDemoCheckin(rec, weekOf, thisMonday);
  const lastCk = fetched && fetched.length ? dwkWeekOfRow(fetched[0]) : null;
  // ⚠ "NO CHECK-IN" IS A CLAIM, AND WE ONLY HOLD THE LAST FEW. shared-overview
  // asks get_client_checkins for DWK_CHECKIN_LIMIT rows, so a week older than
  // the oldest one we fetched may well have a check-in we simply never asked
  // for — say that, rather than asserting an absence.
  const oldestCk = fetched && fetched.length ? dwkWeekOfRow(fetched[fetched.length - 1]) : null;
  const beyondFetch = !ck && live && fetched && fetched.length >= DWK_CHECKIN_LIMIT && oldestCk && weekOf < oldestCk;
  const sevColor = row.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[row.severity];
  const reviewed = !!(review && review.reviewedAt);
  const isCurrent = weekOf === thisMonday;
  // Adherence: closed weeks only. The current week has no number yet.
  let adh = null, adhPrev = null, adhNote = null;
  if (isCurrent) adhNote = "closes Sunday";
  else if (!live) { const d = dwkDemoAdherence(rec, weekOf); adh = d.pct; adhPrev = d.prev; }
  else if (adherence && adherence[id]) { const a = adherence[id][weekOf], p = adherence[id][dwkAddDays(weekOf, -7)]; adh = a ? a.pct : null; adhPrev = p ? p.pct : null; if (a && a.pct == null) adhNote = "too few units to rate"; else if (!a) adhNote = "not in the window"; }
  else adhNote = adherence ? "not shared" : "—";
  const adhDelta = adh != null && adhPrev != null ? adh - adhPrev : null;
  const logs = rec.foodLogs && rec.foodLogs.daysLogged7d != null ? rec.foodLogs.daysLogged7d : null;
  // ⚠ SORTED BEFORE INDEXING. The coach JSONB path (overall.weighIns) carries no
  // order guarantee — dashSignals ships its own sortedWeighIns for exactly this —
  // and a newest-first array read positionally shows the client's FIRST weight as
  // current and inverts the gained/lost sign.
  const w = (Array.isArray(rec.weighIns) ? rec.weighIns.filter((x) => x && x.weight != null) : [])
    .slice()
    .sort((a, b) => new Date(a.on || 0).getTime() - new Date(b.on || 0).getTime());
  const wLast = w.length ? w[w.length - 1] : null, wPrev = w.length > 1 ? w[w.length - 2] : null;
  const wDelta = wLast && wPrev ? Math.round((wLast.weight - wPrev.weight) * 10) / 10 : null;
  const href = typeof dashClientHref === "function" ? dashClientHref(rec, role) : null;
  const btn = { fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 4, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", color: "rgba(242,237,228,0.75)", cursor: "pointer", textDecoration: "none", display: "inline-block" };
  return (
    <div style={{ borderTop: "1px solid rgba(242,237,228,0.07)", padding: "16px 0 14px", opacity: reviewed ? 0.72 : 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: sevColor, flexShrink: 0 }} />
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 19, letterSpacing: "-0.01em" }}>{rec.profile.name}</span>
            {row.flags.map((f, i) => <DashPill key={i} c={sevColor}>{f.label}</DashPill>)}
            {reviewed && <span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_SEV_COLORS.green }}>Reviewed ✓</span>}
          </div>
          {/* The check-in */}
          <div style={{ marginTop: 10 }}>
            {ck ? (
              <div style={{ display: "grid", gap: 6 }}>
                <DwkRatings ratings={ck.ratings} />
                {ck.wins && <div style={{ fontSize: 13, color: "rgba(242,237,228,0.85)" }}><span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_SEV_COLORS.green, marginRight: 8 }}>Win</span>{ck.wins}</div>}
                {ck.struggles && <div style={{ fontSize: 13, color: "rgba(242,237,228,0.85)" }}><span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_AMBER, marginRight: 8 }}>Struggle</span>{ck.struggles}</div>}
                {ck.question && <div style={{ fontSize: 13.5, color: DWK_INK, padding: "8px 12px", borderLeft: "2px solid " + DWK_TEAL, background: "rgba(46,224,196,0.06)" }}><span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_TEAL, marginRight: 8 }}>Asked you</span>{ck.question}</div>}
              </div>
            ) : (
              <div style={{ fontFamily: DWK_MONO, fontSize: 10, letterSpacing: "0.04em", color: DWK_INK50, fontStyle: "italic" }}>
                {beyondFetch
                  ? "Check-in not loaded for this week — the client file holds the full history"
                  : (isCurrent ? "No check-in yet this week" : "No check-in for this week") + (lastCk ? " — last one " + dwkFmt(lastCk) : "")}
              </div>
            )}
          </div>
          {/* THE READ — the member's own weekly readout, from the cache.
              ⚠ SHOWN ONLY WHERE IT EXISTS, AND SILENT OTHERWISE. Nothing here
              generates one: this page reads `ai_weekly_readouts` under the coach
              SELECT policy, so a coach scrolling their Week never spends a
              member's one weekly AI call.
              ⚠ AND AN ABSENCE IS NOT REPORTED, because this page cannot tell the
              two reasons apart. `is_coach_on_client` requires an active/trialing
              subscription, while the roster also carries session-only clients — so
              a member whose readout the coach simply may not SELECT arrives
              identically to one who never ran it. "No read on record" would tell a
              coach that a member has not done something they may be looking at on
              their own Progress page. The mobile card's rule, for the same reason:
              there is no readout, so there is nothing. */}
          {live && readout && readout.summary && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
              <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DWK_INK50, marginBottom: 5 }}>
                {"The read" + (readoutStamp(readout, true) ? " · " + readoutStamp(readout, true) : "")}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(242,237,228,0.85)" }}>{readout.summary}</div>
            </div>
          )}
          {/* The numbers */}
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 12 }}>
            <DwkStat label={isCurrent ? "Adherence · this week" : "Adherence · week"} value={adh != null ? adh + "%" : "—"} sub={adhDelta != null ? (adhDelta >= 0 ? "▲ +" : "▼ −") + Math.abs(adhDelta) + " vs week before" : adhNote} tone={adh != null && adh < 70 ? DWK_AMBER : null} />
            <DwkStat label="Food logs · 7d" value={logs != null ? logs + "/7" : "—"} sub={logs == null ? "not shared" : logs <= 3 ? "thin week" : null} tone={logs != null && logs <= 3 ? DWK_AMBER : null} />
            <DwkStat label="Weigh-in" value={wLast ? wLast.weight + " " + (wLast.unit || "lb") : (ck && ck.weight != null ? ck.weight + " " + (ck.unit || "kg") : "—")} sub={wDelta != null ? (wDelta > 0 ? "+" : "") + wDelta + " since the one before" : wLast ? "first shared weigh-in" : "none shared"} />
          </div>
          {/* Note */}
          {(noteOpen || (review && review.note)) && (
            <div style={{ marginTop: 12 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="What you saw this week, what you'll change, what to ask next week."
                style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 6, padding: 10, color: DWK_INK, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                {(() => {
                  const unchanged = draft === ((review && review.note) || "");
                  const off = unchanged || !editable;
                  return <button type="button" onClick={() => { onNote(draft); setNoteOpen(false); }} disabled={off} style={{ ...btn, color: "#06231f", background: DWK_TEAL, border: 0, opacity: off ? 0.5 : 1, cursor: off ? "default" : "pointer" }}>Save note</button>;
                })()}
                <span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DWK_INK50 }}>{!editable ? "Loading your notes…" : canPersist ? "Private to you" : "Sign in to keep notes"}</span>
              </div>
            </div>
          )}
          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" onClick={() => dashMessageClient(rec.profile.name, role, row.flags.length ? dashMessageDraft(row) : null)} style={{ ...btn, color: DWK_TEAL, borderColor: "rgba(46,224,196,0.35)", background: "rgba(46,224,196,0.08)" }}>Message</button>
            {!(noteOpen || (review && review.note)) && <button type="button" onClick={() => setNoteOpen(true)} style={btn}>＋ Note</button>}
            {href && <a href={href} style={btn}>Client file →</a>}
          </div>
        </div>
        {/* Disabled until the reviews doc has resolved: a tick taken while the
            read is in flight would paint, never write, and then be erased when
            the read lands — the UI would have promised a save that never was. */}
        <label title={editable ? undefined : "Loading your reviews…"} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: editable ? "pointer" : "default", opacity: editable ? 1 : 0.5, fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: reviewed ? DASH_SEV_COLORS.green : DWK_INK50, padding: "6px 10px", border: "1px solid " + (reviewed ? "rgba(123,191,90,0.4)" : "rgba(242,237,228,0.18)"), borderRadius: 4, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={reviewed} disabled={!editable} onChange={(e) => onReview(e.target.checked)} style={{ accentColor: "#7bbf5a", margin: 0 }} />
          {reviewed ? "Reviewed" : "Mark reviewed"}
        </label>
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
function CoachWeekPage({ role }) {
  const nav = role === "nutritionist" ? nutriNavItems : trainerNavItems;
  const card = role === "nutritionist" ? nutriPayoutCard : trainerPayoutCard;
  const { loading, triage, source } = useDashboard(role);
  const live = source === "live";
  const thisMonday = dwkIso(dwkMonday(new Date()));
  const [weekOf, setWeekOf] = React.useState(thisMonday);
  const [onlyOpen, setOnlyOpen] = React.useState(false);
  const reviews = useWeekReviews(live);
  const rows = (triage || []).filter((r) => r && r.client && r.client.profile);
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
  // in DwkRow for why a tick during the load is the one case that must not paint.
  const editable = !live || reviews.kind !== "loading";
  const reviewedCount = rows.filter((r) => weekDoc[r.client.profile.id] && weekDoc[r.client.profile.id].reviewedAt).length;
  const shown = onlyOpen ? rows.filter((r) => !(weekDoc[r.client.profile.id] && weekDoc[r.client.profile.id].reviewedAt)) : rows;
  const patch = (patches) => {
    if (persisting) return reviews.apply(patches);
    setLocalDemo((d) => { const wk = { ...(d[weekOf] || {}) }; for (const p of patches) wk[p.clientId] = { ...(wk[p.clientId] || {}), ...p.patch }; return { ...d, [weekOf]: wk }; });
    return Promise.resolve(false);
  };
  const rel = weekOf === thisMonday ? "this week" : weekOf === dwkAddDays(thisMonday, -7) ? "last week" : weekOf > thisMonday ? "ahead" : Math.round((new Date(thisMonday + "T00:00:00") - new Date(weekOf + "T00:00:00")) / (7 * 86400000)) + " weeks ago";
  const chip = (on) => ({ fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 4, border: "1px solid " + (on ? DWK_TEAL : "rgba(242,237,228,0.18)"), background: on ? "rgba(46,224,196,0.10)" : "transparent", color: on ? DWK_TEAL : "rgba(242,237,228,0.75)", cursor: "pointer" });
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
  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        navItems={nav("week")}
        payoutCard={card}
        actions={actions}
        eyebrow={"END OF WEEK · REVIEW · " + rel.toUpperCase()}
        title={"Week of " + dwkFmt(weekOf)}
        subtitle="Every client, one row: their check-in, the week's adherence against the week before, what moved, and your note. Tick each one as you go, or close the week in one go."
      >
        <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DWK_TEAL, paddingLeft: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <span className="dash-eyebrow">The roster · {rows.length} client{rows.length === 1 ? "" : "s"}</span>
              <div style={{ fontFamily: DWK_MONO, fontSize: 9.5, color: DWK_INK50, marginTop: 6 }}>
                <span style={{ color: reviewedCount === rows.length && rows.length ? DASH_SEV_COLORS.green : DWK_INK }}>{reviewedCount} of {rows.length} reviewed</span> · {storeLine}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setOnlyOpen(!onlyOpen)} style={chip(onlyOpen)}>{onlyOpen ? "Showing unreviewed" : "Unreviewed only"}</button>
              {(() => {
                const off = !rows.length || reviewedCount === rows.length || !editable;
                return <button type="button" disabled={off} onClick={() => { const now = new Date().toISOString(); patch(rows.filter((r) => !(weekDoc[r.client.profile.id] && weekDoc[r.client.profile.id].reviewedAt)).map((r) => ({ weekOf, clientId: r.client.profile.id, patch: { reviewedAt: now } }))); }} style={{ ...chip(false), color: "#06231f", background: DWK_TEAL, border: 0, opacity: off ? 0.5 : 1, cursor: off ? "default" : "pointer" }}>Mark all reviewed</button>;
              })()}
            </div>
          </div>
          <div className="dash-ledger" style={{ marginTop: 9, marginBottom: 4 }} />
          {loading && !rows.length ? (
            <div style={{ fontSize: 12.5, color: DWK_INK50, padding: "14px 0" }}>Loading your roster…</div>
          ) : !rows.length ? (
            <div style={{ fontSize: 12.5, color: DWK_INK50, padding: "14px 0", lineHeight: 1.55 }}>No clients on the roster yet — the week fills in with your first subscriber.</div>
          ) : !shown.length ? (
            <div style={{ fontSize: 12.5, color: DASH_SEV_COLORS.green, padding: "14px 0" }}>Every client reviewed for this week ✓</div>
          ) : shown.map((row) => {
            const id = row.client.profile.id;
            return (
              <DwkRow key={id + weekOf} row={row} role={role} weekOf={weekOf} thisMonday={thisMonday} live={live}
                review={weekDoc[id] || null} adherence={adherence} canPersist={live ? canPersist : false} editable={editable}
                readout={readouts ? readouts[id] || null : null}
                onReview={(on) => patch([{ weekOf, clientId: id, patch: { reviewedAt: on ? new Date().toISOString() : null } }])}
                onNote={(text) => patch([{ weekOf, clientId: id, patch: { note: text } }])} />
            );
          })}
        </div>
        <div style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DWK_INK50, marginTop: 12, lineHeight: 1.7 }}>
          Adherence is the roster's weekly rate (habits · sessions · logging) for closed weeks, the same figure the client file's variance line reads; the current week has no rate until it closes. Check-ins are the member's own weekly form; a week without one says so.
        </div>
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { CoachWeekPage });
