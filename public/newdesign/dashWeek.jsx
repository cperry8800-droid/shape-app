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

// Local-calendar ISO weeks (the check-in's week_of is the member's Monday; the
// coach reviews in their own week).
function dwkIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dwkMonday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function dwkAddDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return dwkIso(d); }
function dwkFmt(iso) { const d = new Date(iso + "T00:00:00"); return DWK_MONTHS[d.getMonth()] + " " + d.getDate(); }
function dwkWeekOfRow(c) { return String((c && (c.week_of || c.weekOf)) || "").slice(0, 10); }

// ── The reviews store ────────────────────────────────────────────────────────
const _dwkLane = { p: Promise.resolve() };
function dwkSerial(fn) { const run = _dwkLane.p.then(fn, fn); _dwkLane.p = run.catch(() => {}); return run; }
function useWeekReviews(live) {
  const [state, setState] = React.useState({ kind: "loading", doc: {} });
  React.useEffect(() => {
    let on = true;
    if (!live) { setState({ kind: "demo", doc: {} }); return undefined; }
    (async () => {
      const db = window.shapeDb;
      if (!db || !db.getUserGoals) { if (on) setState({ kind: "unavailable", doc: {} }); return; }
      let doc = null;
      try { doc = await db.getUserGoals("coach_week_reviews"); } catch (e) { doc = null; }
      if (!on) return;
      setState(doc == null ? { kind: "signedout", doc: {} } : { kind: "ready", doc: doc || {} });
    })();
    return () => { on = false; };
  }, [live]);
  // patches: [{ weekOf, clientId, patch: { reviewedAt?, note? } }] — one read-merge-write.
  const apply = (patches) => {
    setState((s) => {
      const doc = { ...s.doc };
      for (const { weekOf, clientId, patch } of patches) {
        const wk = { ...(doc[weekOf] || {}) };
        wk[clientId] = { ...(wk[clientId] || {}), ...patch };
        doc[weekOf] = wk;
      }
      return { ...s, doc, kind: s.kind === "error" ? "ready" : s.kind };
    });
    if (state.kind !== "ready" && state.kind !== "error") return Promise.resolve(false);
    return dwkSerial(async () => {
      const db = window.shapeDb;
      let doc = null;
      try { doc = await db.getUserGoals("coach_week_reviews"); } catch (e) { doc = null; }
      if (doc == null) { setState((s) => ({ ...s, kind: "error" })); return false; }
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
function useRosterAdherence(ids, live) {
  const [map, setMap] = React.useState(null); // null = not available; {} = loaded
  const key = ids.join(",");
  React.useEffect(() => {
    let on = true;
    setMap(null);
    const db = window.shapeDb && window.shapeDb.client;
    if (!live || !db || !ids.length) return undefined;
    (async () => {
      try { if (window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) {}
      if (!on) return;
      try {
        const res = await db.rpc("get_roster_weekly_adherence", { p_client_ids: ids });
        if (!on || !res || res.error || !Array.isArray(res.data)) return;
        const m = {};
        for (const r of res.data) {
          const cid = String(r.client_id), wk = String(r.week_start).slice(0, 10);
          const sched = Number(r.scheduled) || 0, done = Number(r.completed) || 0;
          (m[cid] = m[cid] || {})[wk] = { scheduled: sched, completed: done, pct: sched >= 6 ? Math.round((done / sched) * 100) : null };
        }
        setMap(m);
      } catch (e) { /* honest "—" */ }
    })();
    return () => { on = false; };
  }, [key, live]);
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

function DwkRow({ row, role, weekOf, thisMonday, live, review, adherence, onReview, onNote, canPersist }) {
  const rec = row.client;
  const id = rec.profile.id;
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(review && review.note ? review.note : "");
  React.useEffect(() => { setDraft(review && review.note ? review.note : ""); }, [review && review.note, id, weekOf]);
  const ck = live
    ? (Array.isArray(rec.checkins) ? rec.checkins.find((c) => dwkWeekOfRow(c) === weekOf) : null)
    : dwkDemoCheckin(rec, weekOf, thisMonday);
  const lastCk = live && Array.isArray(rec.checkins) && rec.checkins.length ? dwkWeekOfRow(rec.checkins[0]) : null;
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
  const w = Array.isArray(rec.weighIns) ? rec.weighIns.filter((x) => x && x.weight != null) : [];
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
                {isCurrent ? "No check-in yet this week" : "No check-in for this week"}{lastCk ? " — last one " + dwkFmt(lastCk) : live ? "" : ""}
              </div>
            )}
          </div>
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
                <button type="button" onClick={() => { onNote(draft); setNoteOpen(false); }} disabled={draft === ((review && review.note) || "")} style={{ ...btn, color: "#06231f", background: DWK_TEAL, border: 0, opacity: draft === ((review && review.note) || "") ? 0.5 : 1 }}>Save note</button>
                <span style={{ fontFamily: DWK_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DWK_INK50 }}>{canPersist ? "Private to you" : "Sign in to keep notes"}</span>
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
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: DWK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: reviewed ? DASH_SEV_COLORS.green : DWK_INK50, padding: "6px 10px", border: "1px solid " + (reviewed ? "rgba(123,191,90,0.4)" : "rgba(242,237,228,0.18)"), borderRadius: 4, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={reviewed} onChange={(e) => onReview(e.target.checked)} style={{ accentColor: "#7bbf5a", margin: 0 }} />
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
  const [localDemo, setLocalDemo] = React.useState({}); // demo-mode ticks, this tab only
  const weekDoc = live ? (reviews.doc[weekOf] || {}) : (localDemo[weekOf] || {});
  const canPersist = reviews.kind === "ready" || reviews.kind === "error";
  const reviewedCount = rows.filter((r) => weekDoc[r.client.profile.id] && weekDoc[r.client.profile.id].reviewedAt).length;
  const shown = onlyOpen ? rows.filter((r) => !(weekDoc[r.client.profile.id] && weekDoc[r.client.profile.id].reviewedAt)) : rows;
  const patch = (patches) => {
    if (live) return reviews.apply(patches);
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
  const storeLine = reviews.kind === "error" ? "Couldn't save — your last change didn't stick, try again"
    : reviews.kind === "signedout" || reviews.kind === "unavailable" ? "Sign in to keep your reviews — ticks and notes live with your account"
    : !live ? "Preview — ticks and notes stay on this tab" : "Ticks and notes are private to you, saved per client per week";
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
              <button type="button" disabled={!rows.length || reviewedCount === rows.length} onClick={() => { const now = new Date().toISOString(); patch(rows.filter((r) => !(weekDoc[r.client.profile.id] && weekDoc[r.client.profile.id].reviewedAt)).map((r) => ({ weekOf, clientId: r.client.profile.id, patch: { reviewedAt: now } }))); }} style={{ ...chip(false), color: "#06231f", background: DWK_TEAL, border: 0, opacity: !rows.length || reviewedCount === rows.length ? 0.5 : 1 }}>Mark all reviewed</button>
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
                review={weekDoc[id] || null} adherence={adherence} canPersist={live ? canPersist : false}
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
