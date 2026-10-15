// The leaderboards (owner, 2026-10-15: "we should have a members and coaches leaderboard", then
// "looks good, build it" on the preview). Two boards, one look:
//
//   MemberLeaderboard  the member's Score page → Leaderboard. Everyone, the people they follow,
//                      or their coach's team; the last 7 days, this month or all time.
//   CoachLeaderboard   the trainer and nutritionist Score pages → Leaderboard. Every live listing
//                      of a role by Coach Score, or by points gained over 30 days.
//
// The routes do the ranking and the privacy rules (/api/leaderboard, /api/coach/leaderboard,
// supabase-migrations/2026-10-15-leaderboards.sql); this file draws what they send and the two
// switches (/api/me/leaderboard-privacy). Styles are the `.lb` block in dash.css. The board is a
// CSS container, so a narrow column or a phone gets the compact board from its own width.
//
// ⚠ EVERY STATE SAYS WHAT IT IS. Signed out, not a member, not a coach, not switched on yet and
// could not read are five sentences, and none of them is drawn as an empty board.

const LB_MEMBER_TIERS = { Raw: 1, Tempo: 2, Form: 3, Peak: 4, Legend: 5 };
const LB_COACH_TIERS = { Certified: 1, Pro: 2, Elite: 3, Master: 4, Icon: 5 };
const LB_SCOPES = [
  { key: "everyone", long: "Everyone" },
  { key: "following", long: "Following" },
  { key: "team", long: "Your coach’s team", short: "My team" },
];
// ⚠ "week" IS THE LAST 7 DAYS, NOT A CALENDAR WEEK: the database ranks now() − 7 days.
const LB_PERIODS = [
  { key: "week", long: "Last 7 days", short: "7 days" },
  { key: "month", long: "This month", short: "Month" },
  { key: "all", long: "All time" },
];
const LB_SCOPE_NAME = { everyone: "everyone on Shape", following: "the people you follow", team: "your coach’s team" };
const LB_PERIOD_NAME = { week: "the last 7 days", month: "this month", all: "all time" };

function lbNum(n) { return (Number(n) || 0).toLocaleString(); }
function lbLabel(long, short) {
  return short
    ? <React.Fragment><span className="lb-hs">{long}</span><span className="lb-sh">{short}</span></React.Fragment>
    : long;
}
function lbInitials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").replace(/\./g, "").slice(0, 2).toUpperCase() || "?";
}

// One reader for the three routes. 401 signed out · 402 not a member · 403 not a coach ·
// 503 not switched on yet · anything else that is not a 2xx, or a 2xx that is not the route's
// payload, could not be read.
function lbRead(url, shaped) {
  return fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (r) {
    if (r.status === 401) return { kind: "anon" };
    if (r.status === 402) return { kind: "gated" };
    if (r.status === 403) return { kind: "forbidden" };
    if (r.status === 503) return { kind: "not_ready" };
    if (!r.ok) return { kind: "error" };
    return r.json().then(function (d) {
      return shaped(d) ? { kind: "ready", data: d } : { kind: "error" };
    }, function () { return { kind: "error" }; });
  }, function () { return { kind: "error" }; });
}
function lbMemberShaped(d) {
  return !!d && typeof d === "object" && Array.isArray(d.entries) && "me" in d && typeof d.total === "number";
}
function lbCoachShaped(d) {
  return !!d && typeof d === "object" && Array.isArray(d.entries) && "me" in d && typeof d.total === "number" && "since" in d;
}
function lbStateNote(kind, coach) {
  if (kind === "loading") return "Reading the board…";
  if (kind === "anon") return "Sign in to see the leaderboard.";
  if (kind === "gated") return "The leaderboard is part of Shape membership.";
  if (kind === "forbidden") return coach ? "The coach leaderboard is for coaches with a Shape listing." : "You can’t see this board.";
  if (kind === "not_ready") return "This leaderboard isn’t switched on yet. Check back soon.";
  if (kind === "error") return "We couldn’t read the leaderboard just now. Nothing has changed; reload to try again.";
  return null;
}

function LbAvatar({ name, url, me }) {
  const [broken, setBroken] = React.useState(false);
  return (
    <span className={"lb-av" + (me ? " lb-av--me" : "")} aria-hidden="true">
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : (me ? "YOU" : lbInitials(name))}
    </span>
  );
}
function LbTier({ name, ladder }) {
  if (!name) return null;
  return <span className={"lb-tier lb-tier--t" + (ladder[name] || 1)}>{name}</span>;
}
function LbMove({ moved }) {
  if (moved === null || moved === undefined) return <span className="lb-mv" aria-label="no change recorded">{"·"}</span>;
  if (moved > 0) return <span className="lb-mv lb-mv--up" aria-label={"up " + moved}>{"▲" + moved}</span>;
  if (moved < 0) return <span className="lb-mv lb-mv--down" aria-label={"down " + -moved}>{"▼" + -moved}</span>;
  return <span className="lb-mv" aria-label="no change">{"—"}</span>;
}
function LbSwitch({ on, label, onChange, busy }) {
  return (
    <button type="button" role="switch" aria-checked={on ? "true" : "false"} className="lb-toggle" disabled={busy} onClick={() => onChange(!on)}>
      <span className="lb-sw" aria-hidden="true"></span>{label}
    </button>
  );
}

// The one above you: the nearest row with more of what the board ranks by (points, or points
// gained on Climbers). A tie is not someone to pass.
function lbAbove(entries, me, value) {
  const v = value || ((e) => e.points);
  if (!me || me.rank === null || me.rank === undefined) return null;
  let best = null;
  for (const e of entries) {
    if (e.isMe || !(v(e) > v(me))) continue;
    if (!best || v(e) < v(best) || (v(e) === v(best) && e.rank > best.rank)) best = e;
  }
  return best;
}

// "Your place": rank, the gap to the next person up, and your points. Member and coach.
function LbYou({ me, entries, value, valueLabel, ofText, metaText, leadText, nameOf, gapUnit, sideLabel }) {
  const above = lbAbove(entries, me, value);
  const gap = above ? value(above) - value(me) : 0;
  const pct = above && value(above) > 0 ? Math.max(6, Math.min(96, Math.round((value(me) / value(above)) * 100))) : 100;
  return (
    <div className="lb-card lb-you">
      <div className="lb-rank">#{lbNum(me.rank)}<small className="lb-of">{ofText}</small></div>
      <div style={{ minWidth: 0 }}>
        {above
          ? <React.Fragment>
              <div className="lb-gap"><b>{lbNum(gap)} {gap === 1 ? gapUnit.replace(/^points/, "point") : gapUnit}</b> to pass {nameOf(above)}{above.rank !== me.rank - 1 ? " at #" + lbNum(above.rank) : ""}</div>
              <div className="lb-bar"><i style={{ width: pct + "%" }}></i></div>
            </React.Fragment>
          : <div className="lb-gap"><b>You lead</b> {leadText}.</div>}
        <div className="lb-meta">{metaText}</div>
        <div className="lb-of-m">{ofText}</div>
      </div>
      <div className="lb-side"><div className="lb-pts">{valueLabel(me)}</div><div className="lb-eyebrow">{sideLabel}</div></div>
    </div>
  );
}

// The rows below the podium, with a "· · ·" (null) where someone ranked above a row is not in
// the list: the caller far down the board, after the top of it. Rank, not position, decides:
// rank() skips numbers after a tie (two at #4, then #6), and that is not a hole.
function lbWithGaps(all, skip) {
  const out = [];
  all.forEach((r, i) => {
    if (r.rank === null || r.rank === undefined) return;
    const missingAhead = r.rank - 1 > i;
    const prev = all[i - 1];
    const prevMissing = prev && prev.rank !== null && prev.rank !== undefined && prev.rank - 1 > i - 1;
    if (missingAhead && !prevMissing && i > 0) out.push(null);
    if (skip.indexOf(r) < 0) out.push(r);
  });
  return out;
}

// ── Members ─────────────────────────────────────────────────────────────────────────────────
function MemberLeaderboard() {
  const [scope, setScope] = React.useState("everyone");
  const [period, setPeriod] = React.useState("week");
  const [state, setState] = React.useState({ kind: "loading" });
  const [privacy, setPrivacy] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    setState({ kind: "loading" });
    lbRead("/api/leaderboard?scope=" + encodeURIComponent(scope) + "&period=" + encodeURIComponent(period) + "&limit=50", lbMemberShaped)
      .then((r) => {
        if (!on) return;
        setState(r);
        if (r.kind === "ready" && r.data.privacy) setPrivacy(r.data.privacy);
      });
    return () => { on = false; };
  }, [scope, period, reload]);

  function save(change) {
    setSaving(true);
    setSaveError(null);
    fetch("/api/me/leaderboard-privacy", { method: "PUT", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d }), () => ({ ok: false, d: null })))
      .then(({ ok, d }) => {
        setSaving(false);
        if (ok && d && typeof d.leaderboard === "boolean") { setPrivacy(d); setReload((n) => n + 1); }
        else setSaveError("That didn’t save. Your setting is unchanged; try again.");
      }, () => { setSaving(false); setSaveError("That didn’t save. Your setting is unchanged; try again."); });
  }

  const controls = (
    <div className="lb-controls">
      <DashSegmented label="Who you are ranked against" value={scope} onChange={setScope}
        items={LB_SCOPES.map((s) => ({ key: s.key, label: lbLabel(s.long, s.short) }))} />
      <span className="lb-push">
        <DashSegmented label="Window" value={period} onChange={setPeriod}
          items={LB_PERIODS.map((p) => ({ key: p.key, label: lbLabel(p.long, p.short) }))} />
      </span>
    </div>
  );
  const switches = privacy ? (
    <div className="lb-privacy">
      <LbSwitch on={privacy.leaderboard} busy={saving} label="Show me on leaderboards" onChange={(v) => save({ leaderboard: v })} />
      <LbSwitch on={privacy.teamBoard === true} busy={saving} label={"Show me to my coach’s team"} onChange={(v) => save({ teamBoard: v })} />
      <span className="lb-where">Also in Settings → Privacy</span>
      {saveError ? <span className="lb-where" role="alert" style={{ color: "var(--sh-danger, #e07856)" }}>{saveError}</span> : null}
    </div>
  ) : null;
  const foot = (
    <div className="lb-foot">
      <span><b>First name and last initial only.</b> Members with a private profile never appear.</span>
      <span>Points from workouts, meals, habits and check-ins; store spending and tier bonuses don’t count.</span>
      <span><b>{"▲▼"}</b> places moved since a week ago.</span>
    </div>
  );

  const note = lbStateNote(state.kind, false);
  if (note) return <div className="lb">{controls}<div className="lb-card lb-empty">{note}</div>{switches}</div>;

  const d = state.data;
  const entries = d.entries;
  const me = d.me;
  const nameOf = (e) => (e.isMe ? "You" : e.name);
  const periodWord = LB_PERIODS.find((p) => p.key === period).long.toLowerCase();

  let hiddenNote = null;
  if (d.hidden === "off") hiddenNote = <div className="lb-note"><b>Only you see your place.</b> “Show me on leaderboards” is off, so other members don’t see you on any board.</div>;
  else if (d.hidden === "private") hiddenNote = <div className="lb-note"><b>Only you see your place.</b> Your profile is private, so other members don’t see you here. Your coach’s team board has its own switch.</div>;
  else if (d.hidden === "team_off") hiddenNote = <div className="lb-note"><b>Only you see your place.</b> “Show me to my coach’s team” is off, so your teammates don’t see you here.</div>;

  // The team board asks once: a member's teammates learn they share a coach, so it is never on
  // until the member says so.
  const ask = scope === "team" && d.hasCoach !== false && d.hidden === "team_unasked" ? (
    <div className="lb-card lb-ask">
      <h3>Show yourself to your coach’s team?</h3>
      <p>Members who share your coach would see your first name, last initial, points and streak, so they’d know you train with the same coach. Nobody else sees this board, and it never names your coach. You can change this any time.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="lb-btn lb-btn--on" disabled={saving} onClick={() => save({ teamBoard: true })}>Show me</button>
        <button type="button" className="lb-btn" disabled={saving} onClick={() => save({ teamBoard: false })}>Not now</button>
      </div>
      {saveError ? <p role="alert" style={{ margin: "10px 0 0", color: "var(--sh-danger, #e07856)" }}>{saveError}</p> : null}
    </div>
  ) : null;

  let body;
  if (scope === "team" && d.hasCoach === false) {
    body = <div className="lb-card lb-empty">The team board is for members with a coach. Once you hire a trainer or nutritionist, you’ll see their other members here, if they’ve chosen to show themselves.</div>;
  } else if (scope === "following" && d.following === 0) {
    body = <div className="lb-card lb-empty">You don’t follow anyone yet. Follow members from the community and race them here.</div>;
  } else if (!entries.length) {
    body = <div className="lb-card lb-empty">Nobody has earned points in {LB_PERIOD_NAME[period]} yet{scope === "everyone" ? "" : " on this board"}.</div>;
  } else {
    const podium = entries.filter((e) => e.rank !== null && e.rank <= 3).slice(0, 3);
    const rest = lbWithGaps(entries, podium);
    body = (
      <React.Fragment>
        <div className="lb-podium">
          {podium.map((e, i) => (
            <div key={e.userId} className={"lb-card lb-pod lb-p" + (i + 1)}>
              <div className="lb-place">{["1ST", "2ND", "3RD"][i]}</div>
              <div className="lb-who"><LbAvatar name={e.name} url={e.avatarUrl} me={e.isMe} /><div><div className="lb-name">{nameOf(e)}</div><div className="lb-where">{e.streak ? e.streak + "-day streak" : "No streak running"}</div></div></div>
              <div className="lb-score">{lbNum(e.points)}<small>points</small></div>
              <div className="lb-facts"><LbTier name={e.tier} ladder={LB_MEMBER_TIERS} /></div>
            </div>
          ))}
        </div>
        {rest.length ? (
          <div className="lb-card lb-board" role="table" aria-label="Leaderboard">
            <div className="lb-row lb-row--head" role="row"><span className="lb-rk">Rank</span><span className="lb-mv">Wk</span><span>Member</span><span className="lb-c-tier">Tier</span><span className="lb-num lb-x1">Streak</span><span className="lb-num">Points</span></div>
            {rest.map((e, i) => e === null
              ? <div key={"gap" + i} className="lb-row lb-row--gap" aria-hidden="true">{"· · ·"}</div>
              : (
                <div key={e.userId} className={"lb-row" + (e.isMe ? " lb-row--me" : "")} role="row">
                  <span className="lb-rk">#{lbNum(e.rank)}</span>
                  <LbMove moved={e.moved} />
                  <span className="lb-who"><LbAvatar name={e.name} url={e.avatarUrl} me={e.isMe} /><div><div className="lb-nm">{nameOf(e)}</div><div className="lb-ds">{lbActivity(e)}</div></div></span>
                  <span className="lb-c-tier"><LbTier name={e.tier} ladder={LB_MEMBER_TIERS} /></span>
                  <span className="lb-num lb-x1">{e.streak ? e.streak + "d" : "—"}</span>
                  <span className="lb-num lb-num--main">{lbNum(e.points)}</span>
                </div>
              ))}
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  const ofText = me ? "of " + lbNum(d.total) + " · " + periodWord : "";
  return (
    <div className="lb">
      {controls}
      {ask}
      {me && me.rank !== null
        ? <LbYou me={me} entries={entries} gapUnit="points" sideLabel={lbLabel("points \u00b7 " + periodWord, "pts")}
            value={(e) => e.points} valueLabel={(e) => lbNum(e.points)} nameOf={nameOf}
            ofText={ofText} leadText={LB_SCOPE_NAME[scope]}
            metaText={LB_SCOPES.find((s) => s.key === scope).long + " · " + LB_PERIODS.find((p) => p.key === period).long} />
        : (scope === "team" && d.hasCoach === false) || (scope === "following" && d.following === 0) ? null
        : <div className="lb-note">You’re not ranked for {LB_PERIOD_NAME[period]} yet. The board counts points earned inside the window; log a workout, a meal or a habit and you’ll place.</div>}
      {hiddenNote}
      {body}
      {switches}
      {foot}
    </div>
  );
}
function lbActivity(e) {
  if (e.trainingDays === null || e.trainingDays === undefined) return "";
  const t = e.trainingDays, m = e.mealDays;
  if (!t && !m) return "Points from habits and check-ins";
  return [t ? "Trained " + t + " day" + (t === 1 ? "" : "s") : null, m ? "logged meals " + m + " day" + (m === 1 ? "" : "s") : null]
    .filter(Boolean).join(" · ").replace(/^logged/, "Logged");
}

// ── Coaches ─────────────────────────────────────────────────────────────────────────────────
function lbSinceText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString([], { month: "short", day: "numeric" });
}

function CoachLeaderboard({ role: initialRole }) {
  const [role, setRole] = React.useState(initialRole === "nutritionist" ? "nutritionist" : "trainer");
  const [view, setView] = React.useState("standing");
  const [state, setState] = React.useState({ kind: "loading" });

  React.useEffect(() => {
    let on = true;
    setState({ kind: "loading" });
    lbRead("/api/coach/leaderboard?role=" + role + "&view=" + view + "&limit=50", lbCoachShaped)
      .then((r) => { if (on) setState(r); });
    return () => { on = false; };
  }, [role, view]);

  const climb = view === "climb";
  const noun = role === "trainer" ? "trainers" : "nutritionists";
  const controls = (
    <div className="lb-controls">
      <DashSegmented label="Role" value={role} onChange={setRole}
        items={[{ key: "trainer", label: "Trainers" }, { key: "nutritionist", label: "Nutritionists" }]} />
      <span className="lb-push">
        <DashSegmented label="Ranking" value={view} onChange={setView}
          items={[{ key: "standing", label: "Standing" }, { key: "climb", label: lbLabel("Climbers · 30 days", "Climbers") }]} />
      </span>
    </div>
  );
  const foot = (
    <div className="lb-foot">
      <span><b>Coaches are public on the marketplace,</b> so names show as they do there.</span>
      <span>Coach Score counts active clients, sessions kept over 90 days{role === "trainer" ? " and programs published" : ""}; it is the score on your Score page.</span>
      <span>{climb ? "Climbers compares tonight’s reading with the one from 30 days earlier." : <React.Fragment><b>{"▲▼"}</b> places moved since a week ago.</React.Fragment>}</span>
    </div>
  );

  const note = lbStateNote(state.kind, true);
  if (note) return <div className="lb">{controls}<div className="lb-card lb-empty">{note}</div></div>;

  const d = state.data;
  const me = d.me;
  const ranked = d.entries.filter((e) => e.rank !== null);
  const nameOf = (e) => (e.isMe ? "You" : e.name);
  const value = (e) => (climb ? e.gained || 0 : e.points);
  const show = (e) => (climb ? (e.gained >= 0 ? "+" : "−") + lbNum(Math.abs(e.gained || 0)) : lbNum(e.points));
  const sinceText = d.since ? lbSinceText(d.since) : "";

  if (climb && !d.since) {
    return (
      <div className="lb">
        {controls}
        <div className="lb-card lb-empty">Climbers needs a reading to compare against. Shape records every coach’s score each night; the first comparison appears the day after the first reading, and the full 30-day view a month later.</div>
        {foot}
      </div>
    );
  }

  let you = null;
  if (!me) {
    you = <div className="lb-note">You don’t have a {role} listing, so you aren’t on this board.</div>;
  } else if (me.rank === null) {
    you = <div className="lb-note">You’ll be ranked here once there’s a reading of your score from {sinceText || "the start of the window"}; Shape takes one every night.</div>;
  } else {
    const pctTop = Math.max(1, Math.round((me.rank / Math.max(1, d.total)) * 100));
    you = (
      <React.Fragment>
        <LbYou me={me} entries={d.entries} gapUnit={climb ? "points of climb" : "points"}
          sideLabel={climb ? lbLabel("gained since " + sinceText, "gained") : lbLabel("your score", "score")}
          value={value} valueLabel={show} nameOf={nameOf}
          ofText={"of " + lbNum(d.total) + " " + noun}
          leadText={(climb ? "the climb among " : "") + noun + " on Shape"}
          metaText={(climb ? "Points gained since " + sinceText : "Top " + pctTop + "% of " + noun + " on Shape") + " · updated nightly"} />
        {!me.listed ? <div className="lb-note"><b>Your listing isn’t live yet,</b> so other coaches don’t see you here. This is where you’d stand.</div> : null}
      </React.Fragment>
    );
  }

  const podium = ranked.filter((e) => e.rank <= 3).slice(0, 3);
  const rest = lbWithGaps(ranked, podium);
  return (
    <div className="lb">
      {controls}
      {you}
      {!ranked.length ? <div className="lb-card lb-empty">No {noun} are on the board yet.</div> : (
        <React.Fragment>
          <div className="lb-podium">
            {podium.map((e, i) => (
              <div key={e.providerId} className={"lb-card lb-pod lb-p" + (i + 1)}>
                <div className="lb-place">{["1ST", "2ND", "3RD"][i]}</div>
                <div className="lb-who"><LbAvatar name={e.name} url={e.avatarUrl} me={e.isMe} /><div><div className="lb-name">{nameOf(e)}</div><div className="lb-where">{e.specialty || (role === "trainer" ? "Trainer" : "Nutritionist")}</div></div></div>
                <div className="lb-score">{show(e)}<small>{climb ? "since " + sinceText : "score"}</small></div>
                <div className="lb-facts"><LbTier name={e.tier} ladder={LB_COACH_TIERS} /><span>{e.activeClients} client{e.activeClients === 1 ? "" : "s"}</span><span>{e.completionPct}% kept</span></div>
              </div>
            ))}
          </div>
          {rest.length ? (
            <div className="lb-card lb-board lb-board--coach" role="table" aria-label="Coach leaderboard">
              <div className="lb-row lb-row--head" role="row"><span className="lb-rk">Rank</span><span className="lb-mv">{climb ? "" : "Wk"}</span><span>Coach</span><span className="lb-c-tier">Tier</span><span className="lb-num lb-x1">Clients</span><span className="lb-num lb-x2">Sessions kept</span><span className="lb-num">{climb ? "Gained" : "Score"}</span></div>
              {rest.map((e, i) => e === null
                ? <div key={"gap" + i} className="lb-row lb-row--gap" aria-hidden="true">{"· · ·"}</div>
                : (
                  <div key={e.providerId} className={"lb-row" + (e.isMe ? " lb-row--me" : "")} role="row">
                    <span className="lb-rk">#{lbNum(e.rank)}</span>
                    {climb ? <span className="lb-mv"></span> : <LbMove moved={e.moved} />}
                    <span className="lb-who"><LbAvatar name={e.name} url={e.avatarUrl} me={e.isMe} /><div><div className="lb-nm">{nameOf(e)}</div><div className="lb-ds">{e.specialty || (role === "trainer" ? "Trainer" : "Nutritionist")}</div></div></span>
                    <span className="lb-c-tier"><LbTier name={e.tier} ladder={LB_COACH_TIERS} /></span>
                    <span className="lb-num lb-x1">{e.activeClients}</span>
                    <span className="lb-num lb-x2">{e.completionPct}%</span>
                    <span className="lb-num lb-num--main">{show(e)}</span>
                  </div>
                ))}
            </div>
          ) : null}
        </React.Fragment>
      )}
      {foot}
    </div>
  );
}

// The coach Score page's three buttons. "How it works" goes back to the score and scrolls to the
// points table once it has rendered.
function CoachScoreActions({ view, onView }) {
  const pill = (on) => ({
    background: on ? "var(--sh-ink, #f2ede4)" : "transparent",
    color: on ? "var(--sh-ground, #1a1612)" : "var(--sh-ink, #f2ede4)",
    border: "1px solid " + (on ? "var(--sh-ink, #f2ede4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.25)"),
    padding: "10px 20px", minHeight: 40, borderRadius: 999, font: "inherit", fontSize: 13, fontWeight: on ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap",
  });
  function howItWorks() {
    onView("score");
    setTimeout(() => { const el = document.getElementById("score-earn"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 0);
  }
  return (
    <React.Fragment>
      <button type="button" aria-pressed={view === "score"} onClick={() => onView("score")} style={pill(view === "score")}>Your score</button>
      <button type="button" onClick={howItWorks} style={pill(false)}>How it works</button>
      <button type="button" aria-pressed={view === "board"} onClick={() => onView("board")} style={pill(view === "board")}>Leaderboard</button>
    </React.Fragment>
  );
}

// The coach Score page's subtitle, from the board itself: "#14 of 212 trainers on Shape." It
// replaces a fixed "Top 4% of trainers on Shape" that no data stood behind. Until the board
// answers (or when it cannot), the line names no rank at all.
function coachStandingLine(role, standing) {
  const tail = "Your coach score drives marketplace ranking, verified badge, and payout tier.";
  if (!standing || !standing.me || standing.me.rank === null) return tail;
  const noun = role === "nutritionist" ? "nutritionists" : "trainers";
  const where = "#" + lbNum(standing.me.rank) + " of " + lbNum(standing.total) + " " + noun + " on Shape";
  return (standing.me.listed ? where + ". " : where + " once your listing is live. ") + tail;
}
function useCoachStanding(role) {
  const [standing, setStanding] = React.useState(null);
  React.useEffect(() => {
    let on = true;
    lbRead("/api/coach/leaderboard?role=" + role + "&view=standing&limit=1", lbCoachShaped)
      .then((r) => { if (on && r.kind === "ready") setStanding(r.data); });
    return () => { on = false; };
  }, [role]);
  return standing;
}

// "Show me on leaderboards" and "Show me to my coach's team" for Settings → Privacy: the same two
// switches as the board, as setting rows. Reads and writes /api/me/leaderboard-privacy.
function useLeaderboardPrivacy() {
  const [state, setState] = React.useState({ kind: "loading" });
  React.useEffect(() => {
    let on = true;
    fetch("/api/me/leaderboard-privacy", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setState(d && typeof d.leaderboard === "boolean" ? { kind: "ready", value: d } : { kind: "error" }); },
            () => { if (on) setState({ kind: "error" }); });
    return () => { on = false; };
  }, []);
  function save(change) {
    return fetch("/api/me/leaderboard-privacy", { method: "PUT", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d }), () => ({ ok: false, d: null })))
      .then(({ ok, d }) => {
        if (ok && d && typeof d.leaderboard === "boolean") { setState({ kind: "ready", value: d }); return true; }
        return false;
      }, () => false);
  }
  return [state, save];
}

Object.assign(window, { MemberLeaderboard, CoachLeaderboard, CoachScoreActions, coachStandingLine, useCoachStanding, useLeaderboardPrivacy, lbRead, lbMemberShaped, lbCoachShaped, lbStateNote, lbAbove, lbWithGaps, lbActivity });
