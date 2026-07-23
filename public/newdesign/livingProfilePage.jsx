// LivingProfilePage — the live Terrain (member) / Signal (coach) profile page,
// fed by get_public_profile + the follow graph. Extracted from MemberProfile.html
// so the dashboard Profile pages (TrainerProfile / NutritionistProfile) render the
// SAME living profile. Pass `extras` to append page-specific content (e.g. the
// dashboard Danger zone) below the profile, above the footer.
//
// `demoRole` ("client" | "trainer" | "nutritionist"): when set, a signed-out
// visitor gets DEMO MODE — the LV_PEOPLE demo persona rendered on the same
// living layout under a "Preview · demo profile" band — instead of a sign-in
// wall. Same concept as the app's signed-out preview.
function liveTier(points, coach) {
  const member = [[0, "Raw", "#5fa96e", "I"], [750, "Tempo", "#d8a23a", "II"], [2000, "Form", "#e0463c", "III"], [5000, "Peak", "#8fe3e6", "IV"], [15000, "Legend", "#34d6c5", "V"]];
  const coachL = [[0, "Certified", "#5fa96e", "I"], [750, "Pro", "#d8a23a", "II"], [2000, "Elite", "#e0463c", "III"], [5000, "Master", "#8fe3e6", "IV"], [15000, "Icon", "#34d6c5", "V"]];
  const T = coach ? coachL : member;
  let t = T[0]; for (const x of T) if (points >= x[0]) t = x;
  return { name: t[1], color: t[2], rank: t[3] };
}

// `shell` ({ navItems, payoutCard }): renders the profile INSIDE the dashboard
// chrome — site Header + DashSidebar (pageShell/trainerDashboard globals, only
// referenced when the prop is passed) — so the side nav stays present on the
// dashboard Profile/Me pages. The living page then drops its own header/footer.
function LiveProfilePage({ extras = null, demoRole = null, shell = null }) {
  const [st, setSt] = React.useState({ loading: true, status: "", row: null, isSelf: false, uid: null });
  const [follow, setFollow] = React.useState({ followers: 0, following: 0, isFollowing: false });
  const [busy, setBusy] = React.useState(false);
  const [sheet, setSheet] = React.useState(null);
  const [list, setList] = React.useState(null);
  const [avatars, setAvatars] = React.useState({}); // userId -> profile photo
  const [posts, setPosts] = React.useState(null); // visible activity-post count (Posts stat)
  const [group, setGroup] = React.useState("all"); // all | coaches | members
  const [query, setQuery] = React.useState(""); // search people
  const [reqs, setReqs] = React.useState(null); // pending follow requests, inline on my own followers list
  const [followingSet, setFollowingSet] = React.useState(null); // userIds I follow (follow-back)
  const [backState, setBackState] = React.useState({}); // userId -> 'following' (follow-back)
  const [reqCount, setReqCount] = React.useState(0);
  const [liveSelf, setLiveSelf] = React.useState(null); // real self metrics (streak/weekly delta/trajectory/program) — own client profile only

  const cl = () => (window.shapeDb && window.shapeDb.client) || null;
  const applyStats = (d) => { if (d) setFollow({ followers: +d.followers || 0, following: +d.following || 0, isFollowing: !!d.is_following, isPending: !!d.is_pending }); };
  React.useEffect(() => {
    let on = true;
    (async () => {
      const c = cl();
      if (!c || !c.rpc) { if (on) setSt({ loading: false, status: "unavailable" }); return; }
      const params = new URLSearchParams(window.location.search);
      const qid = params.get("u");
      const qname = params.get("name");
      // A named person without a real account (e.g. a demo chat contact) → render
      // a derived public profile (same idea as the mobile app), not a redirect.
      if (qname && !qid) {
        if (on) {
          setSt({ loading: false, status: "derived", derived: { name: qname, role: params.get("role") || "client", pts: Number(params.get("pts")) || null, avatar: params.get("avatar") || "" } });
          // Stable name-derived demo posts count (mirrors mobile preview).
          let h = 0; for (let i = 0; i < qname.length; i++) h = (h * 29 + qname.charCodeAt(i)) >>> 0;
          setPosts(6 + (h % 120));
        }
        return;
      }
      let me = null; try { const r = await c.auth.getUser(); me = r && r.data ? r.data.user : null; } catch (e) {}
      const uid = qid || (me && me.id);
      if (!uid) { if (on) setSt({ loading: false, status: "signin" }); return; }
      let row = null; try { const res = await c.rpc("get_public_profile", { p_user_id: uid }); row = Array.isArray(res && res.data) ? res.data[0] : (res && res.data); } catch (e) {}
      if (!on) return;
      const isSelf = !!(me && me.id === uid);
      // Coach credential-verified badge — read the public `verified` flag the admin
      // review queue mirrors onto the marketplace coach row.
      let verified = false;
      let coachCerts = [];
      if (row && (row.role === "trainer" || row.role === "nutritionist")) {
        const vtable = row.role === "nutritionist" ? "nutritionists" : "trainers";
        try { const vr = await c.from(vtable).select("verified").eq("owner_id", uid).maybeSingle(); verified = !!(vr && vr.data && vr.data.verified); } catch (e) {}
        // A verified coach's REAL submitted cert types (paths withheld; verified-only).
        if (verified) {
          try {
            const cr = await c.rpc("get_coach_certs", { p_user_id: uid });
            const rows = (cr && !cr.error && Array.isArray(cr.data)) ? cr.data : [];
            coachCerts = rows.map((x) => ({ abbr: x.cert_type, body: x.cert_type, year: x.cert_number ? ("ID " + x.cert_number) : "Shape-verified", verified: true }));
          } catch (e) {}
        }
      }
      if (!on) return;
      setSt({ loading: false, status: row ? "ok" : "notfound", row: row || null, isSelf, uid, verified, coachCerts });
      c.rpc("get_follow_stats", { p_user_id: uid }).then((r) => { if (!on || !r || r.error) return; applyStats(Array.isArray(r.data) ? r.data[0] : r.data); }).catch(() => {});
      if (isSelf) c.rpc("list_follow_requests").then((r) => { if (on && r && !r.error) setReqCount((r.data || []).length); }).catch(() => {});
      // Posts stat — visible activity-post count (RLS-scoped to the viewer).
      try { c.from("community_posts").select("id", { count: "exact", head: true }).eq("author_id", uid).then((r) => { if (on && r && !r.error && r.count != null) setPosts(r.count); }); } catch (e) {}
    })();
    return () => { on = false; };
  }, []);

  // Own client profile, signed in → replace the demo persona's performance
  // fields (day streak, weekly Shape Score delta, body-comp trajectory, current
  // program) with the SAME real metrics the dashboards show. Demo fallback per
  // field, so signed-out / public / data-less views still render the example.
  React.useEffect(() => {
    if (!st.isSelf || !st.uid) return undefined;
    if (st.row && (st.row.role === "trainer" || st.row.role === "nutritionist")) return undefined; // coach metrics are client-shaped
    let on = true;
    (async () => {
      const j = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [dash, score, plan, stats] = await Promise.all([j("/api/client/dashboard"), j("/api/client/score"), j("/api/client/plan"), j("/api/client/profile-stats")]);
      if (!on) return;
      const out = {};
      if (dash && dash.kpis && typeof dash.kpis.streak === "number") out.streak = dash.kpis.streak;
      if (score && typeof score.week_gain === "number") out.scoreWk = score.week_gain;
      // Real key lifts + discipline bars (self-scoped get_my_lifts via the route).
      if (stats && Array.isArray(stats.lifts) && stats.lifts.length) out.lifts = stats.lifts;
      if (stats && Array.isArray(stats.disciplines) && stats.disciplines.length) out.disciplines = stats.disciplines;
      const wi = (dash && dash.goals && Array.isArray(dash.goals.weighIns)) ? dash.goals.weighIns.filter((w) => w && w.weight != null) : [];
      if (wi.length >= 2) {
        out.traj = wi.slice(-7).map((w) => Number(w.weight));
        const d = out.traj[out.traj.length - 1] - out.traj[0];
        out.trajDelta = (d > 0 ? "+" : d < 0 ? "−" : "±") + (Math.round(Math.abs(d) * 10) / 10) + " " + (wi[wi.length - 1].unit || "lb");
      }
      if (plan && plan.training && plan.training.hasPlan && Array.isArray(plan.training.workouts)) {
        const tpl = plan.training.workouts.map((w) => w.template).filter(Boolean);
        const named = tpl.find((t) => t && t.name);
        const wk = tpl.reduce((m, t) => Math.max(m, (t && t.week) || 0), 0);
        out.hasProgram = true;
        if (named && named.name) out.program = named.name;
        out.block = wk ? "Week " + wk : "";
      } else {
        out.hasProgram = false;
      }
      setLiveSelf(out);
    })();
    return () => { on = false; };
  }, [st.isSelf, st.uid]);

  const onMessage = () => {
    if (st.isSelf) {
      // "Edit profile" on your own profile → wherever your account controls live.
      // A CLIENT's moved to the Settings tab (ClientMeSettings — details, billing,
      // privacy, export/delete). A COACH's ride their dashboard profile (the
      // customizer + settings extras) and the coach apps have no #settings route,
      // so a coach goes to #profile — ClientApp's role guard forwards them to
      // their OWN app's profile with the hash preserved. Both branches hit
      // ClientApp.html directly (not the ClientMe.html alias), so no route can
      // land a coach on a #settings hash their app doesn't define.
      const role = st.row && st.row.role;
      const isCoach = role === "trainer" || role === "nutritionist";
      window.location.href = "/newdesign/ClientApp.html" + (isCoach ? "#profile" : "#settings");
      return;
    }
    const nm = (st.row && st.row.full_name) || (st.derived && st.derived.name);
    try { if (window.__openChat) { window.__openChat({ who: nm }); return; } } catch (e) {}
    const b = document.getElementById("shape-global-chat-button"); if (b) { b.click(); return; }
    window.location.href = "/newdesign/ClientCommunity.html";
  };
  const onFollow = async () => {
    const c = cl(); if (!c || busy || !st.uid) return;
    setBusy(true); const prev = follow;
    if (follow.isFollowing) setFollow((x) => ({ ...x, isFollowing: false, followers: Math.max(0, x.followers - 1) }));
    else if (follow.isPending) setFollow((x) => ({ ...x, isPending: false }));
    try { const r = await c.rpc("toggle_follow", { p_user_id: st.uid }); if (r && r.error) throw r.error; applyStats(Array.isArray(r.data) ? r.data[0] : r.data); }
    catch (e) { setFollow(prev); alert((e && e.message) || "Sign in to follow."); }
    finally { setBusy(false); }
  };
  // Batch profile photos for a follower/following list (visibility-gated via
  // get_public_profile.avatar) so the rows show real pictures, not just initials.
  const loadAvatars = (rows) => {
    const c = cl(); if (!c || !c.rpc) return;
    rows.map((u) => u.userId).filter(Boolean).forEach((id) => {
      c.rpc("get_public_profile", { p_user_id: id }).then((res) => {
        const row = Array.isArray(res && res.data) ? res.data[0] : (res && res.data);
        if (row && row.avatar) setAvatars((m) => ({ ...m, [id]: row.avatar }));
      }).catch(() => {});
    });
  };
  const openList = (kind) => {
    const c = cl(); setSheet(kind); setList(null); setAvatars({}); setGroup("all"); setQuery(""); setReqs(null); setBackState({}); setFollowingSet(null);
    if (!c || !c.rpc) { setList([]); return; }
    if (kind === "requests") {
      c.rpc("list_follow_requests").then((r) => { const rows = (r && !r.error && Array.isArray(r.data)) ? r.data : []; const m = rows.map((x) => ({ userId: x.user_id, name: x.full_name || "Shape member", role: x.role || "client" })); setList(m); loadAvatars(m); }).catch(() => setList([]));
      return;
    }
    if (!st.uid) { setList([]); return; }
    c.rpc("get_follow_list", { p_user_id: st.uid, p_kind: kind }).then((r) => { const rows = (r && !r.error && Array.isArray(r.data)) ? r.data : []; const m = rows.map((x) => ({ userId: x.user_id, name: x.full_name || "Shape member", role: x.role || "client" })); setList(m); loadAvatars(m); }).catch(() => setList([]));
    // Follow-back + inline pending requests: only on MY OWN followers list.
    if (kind === "followers" && st.isSelf) {
      c.rpc("get_follow_list", { p_user_id: st.uid, p_kind: "following" }).then((r) => { const rows = (r && !r.error && Array.isArray(r.data)) ? r.data : []; setFollowingSet(new Set(rows.map((x) => x.user_id).filter(Boolean))); }).catch(() => setFollowingSet(new Set()));
      c.rpc("list_follow_requests").then((r) => { const rows = (r && !r.error && Array.isArray(r.data)) ? r.data : []; const m = rows.map((x) => ({ userId: x.user_id, name: x.full_name || "Shape member", role: x.role || "client" })); setReqs(m); loadAvatars(m); }).catch(() => setReqs([]));
    }
  };
  const followBack = async (u) => {
    const c = cl(); if (!c || !c.rpc || !u.userId) return;
    const cur = (u.userId in backState) ? backState[u.userId] : ((followingSet && followingSet.has(u.userId)) ? "following" : "");
    if (cur === "following" || cur === "requested") { // unfollow / cancel request
      setBackState((m) => Object.assign({}, m, { [u.userId]: "" }));
      try { await c.rpc("toggle_follow", { p_user_id: u.userId }); } catch (e) { setBackState((m) => Object.assign({}, m, { [u.userId]: cur })); }
      return;
    }
    // New follow — their privacy decides accepted (following) vs pending (requested).
    try { const r = await c.rpc("toggle_follow", { p_user_id: u.userId }); const d = Array.isArray(r && r.data) ? r.data[0] : (r && r.data); setBackState((m) => Object.assign({}, m, { [u.userId]: (d && d.is_pending) ? "requested" : "following" })); }
    catch (e) {}
  };
  const respondReq = async (followerId, accept) => {
    const c = cl(); setList((cur) => (cur || []).filter((u) => u.userId !== followerId)); setReqs((cur) => (cur || []).filter((u) => u.userId !== followerId));
    try { await c.rpc("respond_follow_request", { p_follower_id: followerId, p_accept: !!accept }); } catch (e) {}
    try { const r = await c.rpc("list_follow_requests"); if (r && !r.error) setReqCount((r.data || []).length); } catch (e) {}
    if (st.uid) c.rpc("get_follow_stats", { p_user_id: st.uid }).then((r) => { if (r && !r.error) applyStats(Array.isArray(r.data) ? r.data[0] : r.data); }).catch(() => {});
  };

  // Dashboard embedding — keep the side nav present on the Profile/Me pages.
  const wrapShell = (node) => !shell ? node : (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: sans, display: "flex", flexDirection: "column" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1 }}>
        <DashSidebar navItems={shell.navItems} payoutCard={shell.payoutCard} />
        <main style={{ minWidth: 0, overflowX: "hidden" }}>{node}</main>
      </div>
      <Footer />
    </div>
  );

  const center = (msg, cta) => (
    <div style={{ minHeight: shell ? "60vh" : "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 40, textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 30 }}>Profile</div>
      <div style={{ color: "rgba(242,237,228,0.6)", fontSize: 15 }}>{msg}</div>
      {cta}
    </div>
  );
  if (st.loading) return wrapShell(center("Loading profile…"));
  if (st.status === "signin" || (st.status === "unavailable" && demoRole)) {
    // Demo mode — signed out renders the demo persona on the real living
    // layout (the app's preview concept), never a bare sign-in wall.
    if (demoRole) {
      const dDir = demoRole === "client" ? "terrain" : "signal";
      const demoFollow = { followers: 214, following: 167, posts: 24, canFollow: false };
      return wrapShell(
        <React.Fragment>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "9px 16px", background: "rgba(30,192,168,0.1)", borderBottom: "1px solid rgba(30,192,168,0.3)", fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", textAlign: "center" }}>
            <span>Preview · demo profile — an example of a live account</span>
            <a href="/login" style={{ flexShrink: 0, color: "#06110e", background: "#1ec0a8", borderRadius: 999, padding: "5px 13px", textDecoration: "none" }}>Sign in →</a>
          </div>
          <div data-tour="hero-profile"><DesktopProfile direction={dDir} persona={demoRole} variant="public" follow={demoFollow} onMessage={() => { try { if (window.__openChat) { window.__openChat(); return; } } catch (e) {} const b = document.getElementById("shape-global-chat-button"); if (b) b.click(); }} onFollow={() => { window.location.href = "/login"; }} coachingHref="/newdesign/Marketplace.html" belowContent={extras} chrome={!shell} /></div>
        </React.Fragment>
      );
    }
    return wrapShell(center("Sign in to view your public profile.", <a href="/login" style={{ background: "#1ec0a8", color: "#06110e", borderRadius: 999, padding: "12px 24px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14 }}>Sign in →</a>));
  }
  if (st.status !== "ok" && st.status !== "derived") return wrapShell(center(st.status === "notfound" ? "This profile isn't available." : "Profiles aren't available right now."));

  // Derived profile (a named person with no real account) — synthesize a row so
  // the same DesktopProfile layout renders, with a stable name-hashed tier.
  const row = st.status === "derived"
    ? (() => {
        const d = st.derived; const nm = String(d.name || "Shape member");
        let h = 0; for (let i = 0; i < nm.length; i++) h = (h + nm.charCodeAt(i) * (i + 1)) % 9973;
        const isCoachD = d.role === "trainer" || d.role === "nutritionist";
        // Use the points + avatar passed from the chat card so the full profile
        // matches what was shown there (same tier + photo); else derive.
        const pts = (d.pts && d.pts > 0) ? d.pts : (isCoachD ? [900, 2400, 5200] : [200, 1284, 3200])[h % 3];
        return { role: d.role, points: pts, full_name: nm, is_public: true, can_view: true, bio: null, pronouns: null, goal: null, link: null, avatar: d.avatar || "" };
      })()
    : st.row;
  const role = row.role === "trainer" ? "trainer" : row.role === "nutritionist" ? "nutritionist" : "client";
  const coach = role !== "client";
  const direction = coach ? "signal" : "terrain";
  const points = Number.isFinite(row.points) ? row.points : 0;
  const tk = liveTier(points, coach);
  LV_TIERS.__live = { name: tk.name, color: tk.color, rank: tk.rank };
  const name = row.full_name || "Shape member";
  const first = String(name).trim().split(/\s+/)[0] || "Member";
  const initials = String(name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const isPrivate = row.is_public === false || row.can_view === false;
  const base = LV_PEOPLE[role] || LV_PEOPLE.client;
  const isDerived = st.status === "derived";
  const person = Object.assign({}, base, {
    uid: st.uid || null,
    name, first, initials, tier: "__live", score: points,
    roleLabel: coach ? (role === "nutritionist" ? "Nutritionist" : "Trainer") : "Member",
    role, verified: !!(coach && st.verified),
    // Live coach profiles show only verified, real submitted certs (else none) —
    // never the demo persona's fabricated credentials. The demo certs stay only
    // for a derived (no-account, example) profile.
    certs: (coach && st.coachCerts && st.coachCerts.length) ? st.coachCerts : (isDerived ? base.certs : []),
    handle: row.handle || ("@" + first.toLowerCase().replace(/[^a-z0-9]/g, "")),
    pronouns: (!isPrivate && row.pronouns) || base.pronouns,
    goal: (!isPrivate && row.goal) || base.goal,
    portrait: row.avatar || "",
    link: (!isPrivate && row.link) ? ["Link", String(row.link).replace(/^https?:\/\//, "")] : base.link,
    custom: (!isPrivate && row.custom) || null,
  });
  // Overlay the real self metrics over the demo persona (own client profile
  // only). Per-field: a live value wins; a missing one keeps the example.
  if (liveSelf && st.isSelf && !coach) {
    if (liveSelf.streak != null) person.streak = liveSelf.streak;
    if (liveSelf.scoreWk != null) person.scoreWk = liveSelf.scoreWk;
    if (liveSelf.traj) { person.traj = liveSelf.traj; person.trajDelta = liveSelf.trajDelta || person.trajDelta; }
    // Real key lifts replace the example; disciplines merge by label so all
    // four bars stay, with a live value where there's a signal, demo otherwise.
    if (liveSelf.lifts && liveSelf.lifts.length) person.lifts = liveSelf.lifts;
    if (liveSelf.disciplines && liveSelf.disciplines.length) {
      const live = {}; liveSelf.disciplines.forEach((d) => { if (Array.isArray(d)) live[d[0]] = d[1]; });
      person.disciplines = (base.disciplines || []).map((d) => [d[0], live[d[0]] != null ? live[d[0]] : d[1]]);
    }
    // Current program: show the real assigned program/phase; if there's no live
    // plan, drop the demo program (don't invent one for a real account).
    if (liveSelf.hasProgram === true) {
      person.program = liveSelf.program || person.program;
      person.block = liveSelf.block || "";
    } else if (liveSelf.hasProgram === false) {
      person.program = ""; person.block = "";
    }
  }
  const variant = (isPrivate && !st.isSelf) ? "locked" : (st.isSelf ? "own" : "public");
  const followProps = Object.assign({}, follow, { posts: posts != null ? posts : 0, openList, requests: reqCount, openRequests: () => openList("requests"), canFollow: !!(st.uid && !st.isSelf) });

  // Followers / following sheet helpers — Coaches / Clients-or-Members tabs +
  // the follow-back box on my own followers list.
  const memberTabLabel = coach ? "Clients" : "Members";
  const isCoachRow = (u) => u.role === "trainer" || u.role === "nutritionist";
  const sheetQ = query.trim().toLowerCase();
  const matchesQ = (u) => !sheetQ || String(u.name || "").toLowerCase().includes(sheetQ);
  const groupMatch = (u) => group === "all" ? true : group === "coaches" ? isCoachRow(u) : !isCoachRow(u);
  const sheetVisible = (list || []).filter((u) => groupMatch(u) && matchesQ(u));
  const visibleReqs = (reqs || []).filter((u) => groupMatch(u) && matchesQ(u));
  const showFollowBack = sheet === "followers" && st.isSelf;
  const backStatus = (u) => (u.userId in backState) ? backState[u.userId] : ((followingSet && u.userId && followingSet.has(u.userId)) ? "following" : "");
  const sheetTab = (key, label) => {
    const on = group === key;
    return (<button key={key} onClick={() => setGroup(key)} style={{ flex: 1, borderRadius: 999, border: 0, cursor: "pointer", padding: "7px 6px", background: on ? "rgba(46,224,196,0.16)" : "transparent", color: on ? "#2ee0c4" : "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: on ? 700 : 500, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</button>);
  };

  return wrapShell(
    <React.Fragment>
      <div data-tour="hero-profile">
      <DesktopProfile direction={direction} persona={role} person={person} variant={variant} onMessage={onMessage} onFollow={onFollow} follow={followProps} coachingHref="/newdesign/Marketplace.html" belowContent={extras} chrome={!shell} />
      </div>
      {sheet && (
        <div onClick={() => setSheet(null)} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(10,10,8,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px,100%)", maxHeight: "76vh", overflowY: "auto", background: "#1b1714", color: "#f2ede4", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: 22, fontFamily: "'Space Grotesk',sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#2ee0c4" }}>{sheet === "requests" ? "Follow requests" : sheet === "following" ? "Following" : "Followers"}</span>
              <button onClick={() => setSheet(null)} aria-label="Close" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.6)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            {sheet !== "requests" && (
              <div style={{ display: "flex", gap: 6, background: "rgba(242,237,228,0.05)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 999, padding: 4, marginBottom: 12 }}>
                {sheetTab("all", "All")}{sheetTab("coaches", "Coaches")}{sheetTab("members", memberTabLabel)}
              </div>
            )}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" style={{ width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 10, border: "1px solid rgba(242,237,228,0.14)", background: "rgba(242,237,228,0.05)", color: "#f2ede4", fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, outline: "none", marginBottom: 14 }} />
            {showFollowBack && visibleReqs.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#2ee0c4", paddingBottom: 4 }}>{visibleReqs.length} request{visibleReqs.length === 1 ? "" : "s"}</div>
                {visibleReqs.map((u, i) => (
                  <div key={"req-" + (u.userId || i)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
                    {u.userId && avatars[u.userId]
                      ? <img src={avatars[u.userId]} alt="" style={{ width: 36, height: 36, flex: "none", borderRadius: 999, objectFit: "cover", background: "#3a322a" }} />
                      : <span style={{ width: 36, height: 36, flex: "none", borderRadius: 999, background: "#3a322a", display: "grid", placeItems: "center", fontFamily: "Fraunces,serif", fontSize: 14 }}>{String(u.name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginTop: 2 }}>{u.role === "trainer" ? "Trainer" : u.role === "nutritionist" ? "Nutritionist" : "Member"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => respondReq(u.userId, true)} style={{ borderRadius: 8, border: 0, background: "#1ec0a8", color: "#06110e", padding: "7px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Accept</button>
                      <button onClick={() => respondReq(u.userId, false)} style={{ borderRadius: 8, border: "1px solid rgba(242,237,228,0.25)", background: "transparent", color: "#f2ede4", padding: "7px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Decline</button>
                    </div>
                  </div>
                ))}
                <div style={{ borderBottom: "1px solid rgba(242,237,228,0.14)", margin: "12px 0 2px" }} />
              </div>
            )}
            {list == null ? <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", padding: "8px 0" }}>Loading…</div>
            : sheet === "requests" ? (list.length === 0 ? <div style={{ fontFamily: "Fraunces,serif", fontSize: 16, fontStyle: "italic", color: "rgba(242,237,228,0.6)", padding: "8px 0 14px" }}>No pending requests.</div> : list.map((u, i) => (
              <div key={u.userId || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
                {u.userId && avatars[u.userId]
                  ? <img src={avatars[u.userId]} alt="" style={{ width: 36, height: 36, flex: "none", borderRadius: 999, objectFit: "cover", background: "#3a322a" }} />
                  : <span style={{ width: 36, height: 36, flex: "none", borderRadius: 999, background: "#3a322a", display: "grid", placeItems: "center", fontFamily: "Fraunces,serif", fontSize: 14 }}>{String(u.name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginTop: 2 }}>{u.role === "trainer" ? "Trainer" : u.role === "nutritionist" ? "Nutritionist" : "Member"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => respondReq(u.userId, true)} style={{ borderRadius: 999, border: 0, background: "#1ec0a8", color: "#06110e", padding: "7px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Accept</button>
                  <button onClick={() => respondReq(u.userId, false)} style={{ borderRadius: 999, border: "1px solid rgba(242,237,228,0.25)", background: "transparent", color: "#f2ede4", padding: "7px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Decline</button>
                </div>
              </div>
            ))) : (sheetVisible.length === 0 ? <div style={{ fontFamily: "Fraunces,serif", fontSize: 16, fontStyle: "italic", color: "rgba(242,237,228,0.6)", padding: "8px 0 14px" }}>{sheetQ ? ("No one matches “" + query.trim() + "”.") : group === "coaches" ? "No coaches here yet." : group === "members" ? ("No " + memberTabLabel.toLowerCase() + " here yet.") : sheet === "following" ? "Not following anyone yet." : "No followers yet."}</div> : sheetVisible.map((u, i) => {
              const bst = backStatus(u);
              return (
              <div key={u.userId || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
                <a href={u.userId ? `MemberProfile.html?u=${u.userId}` : undefined} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "#f2ede4" }}>
                  {u.userId && avatars[u.userId]
                    ? <img src={avatars[u.userId]} alt="" style={{ width: 36, height: 36, flex: "none", borderRadius: 999, objectFit: "cover", background: "#3a322a" }} />
                    : <span style={{ width: 36, height: 36, flex: "none", borderRadius: 999, background: "#3a322a", display: "grid", placeItems: "center", fontFamily: "Fraunces,serif", fontSize: 14 }}>{String(u.name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginTop: 2 }}>{u.role === "trainer" ? "Trainer" : u.role === "nutritionist" ? "Nutritionist" : "Member"}</div>
                  </div>
                </a>
                {showFollowBack && u.userId && (
                  <button onClick={(e) => { e.preventDefault(); followBack(u); }} style={{ flexShrink: 0, borderRadius: 8, cursor: "pointer", padding: "7px 13px", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: bst ? "transparent" : "#1ec0a8", color: bst ? "rgba(242,237,228,0.55)" : "#06110e", border: bst ? "1px solid rgba(242,237,228,0.25)" : "1px solid #1ec0a8" }}>{bst === "following" ? "Following ✓" : bst === "requested" ? "Requested" : "Follow back"}</button>
                )}
              </div>
              );
            }))}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}


Object.assign(window, { LiveProfilePage });
