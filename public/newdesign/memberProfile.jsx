// Member public profile page.
//
// Loads get_public_profile(?u=<userId>) — or the signed-in user when `u` is
// omitted (your own profile). Mirrors the chat profile card + the coach page
// aesthetic: tier hero, 3-up stats, about, details, and the privacy state. The
// owner sees an Edit action; everyone else gets Message. Public fields
// (bio/pronouns/goal/link) only come back when the member is set to Public.

const MP_TIER_COLORS = { raw: "#5fa96e", base: "#5fa96e", tempo: "#d8a23a", form: "#e0463c", peak: "#8fe3e6", legend: "#34d6c5" };
function mpTierColor(tier) { return MP_TIER_COLORS[String(tier || "").toLowerCase().trim()] || "#d8a23a"; }
function mpInitials(name) { return String(name || "").replace(/^#\s*/, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?"; }
function mpTierForPoints(pts) { const p = Number(pts) || 0; if (p >= 15000) return "Legend"; if (p >= 5000) return "Peak"; if (p >= 2000) return "Form"; if (p >= 750) return "Tempo"; return "Base"; }

function MPStat(p) {
  return (
    <div style={{ flex: 1, minWidth: 0, borderRadius: 14, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: "14px 16px" }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>{p.label}</div>
      <div style={{ marginTop: 5, fontFamily: serif, fontSize: 26, fontWeight: 500, color: p.color || INK, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1 }}>{p.value}</div>
    </div>
  );
}
function MPRow(p) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 14, padding: "12px 0", borderTop: p.top ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", paddingTop: 2 }}>{p.label}</div>
      <div style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, wordBreak: "break-word" }}>{p.value}</div>
    </div>
  );
}

// Follower / following — counts + a Follow/Following toggle (when not yourself).
function MPFollow({ uid, isSelf }) {
  const [s, setS] = React.useState({ followers: 0, following: 0, isFollowing: false });
  const [busy, setBusy] = React.useState(false);
  const [sheet, setSheet] = React.useState(null); // 'followers' | 'following'
  const [list, setList] = React.useState(null);
  const [avatars, setAvatars] = React.useState({}); // userId -> profile photo url
  const openList = (kind) => {
    const cl = window.shapeDb && window.shapeDb.client;
    setSheet(kind); setList(null); setAvatars({});
    if (!cl || !cl.rpc || !uid) { setList([]); return; }
    cl.rpc("get_follow_list", { p_user_id: uid, p_kind: kind }).then((r) => {
      const rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
      const mapped = rows.map((x) => ({ userId: x.user_id, name: x.full_name || "Shape member", role: x.role || "client" }));
      setList(mapped);
      // Batch profile photos (visibility-gated via get_public_profile.avatar).
      const ids = mapped.map((u) => u.userId).filter(Boolean);
      ids.forEach((id) => {
        cl.rpc("get_public_profile", { p_user_id: id }).then((res) => {
          const row = Array.isArray(res && res.data) ? res.data[0] : (res && res.data);
          if (row && row.avatar) setAvatars((m) => ({ ...m, [id]: row.avatar }));
        }).catch(() => {});
      });
    }).catch(() => setList([]));
  };
  React.useEffect(() => {
    let on = true;
    const cl = window.shapeDb && window.shapeDb.client;
    if (!cl || !cl.rpc || !uid) return;
    cl.rpc("get_follow_stats", { p_user_id: uid }).then((r) => {
      if (!on || !r || r.error) return;
      const d = Array.isArray(r.data) ? r.data[0] : r.data;
      if (d) setS({ followers: +d.followers || 0, following: +d.following || 0, isFollowing: !!d.is_following });
    }).catch(() => {});
    return () => { on = false; };
  }, [uid]);
  const toggle = async () => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!cl || busy || !uid) return;
    setBusy(true);
    const prev = s;
    setS((x) => ({ ...x, isFollowing: !x.isFollowing, followers: Math.max(0, x.followers + (x.isFollowing ? -1 : 1)) }));
    try {
      const r = await cl.rpc("toggle_follow", { p_user_id: uid });
      if (r && r.error) throw r.error;
      const d = Array.isArray(r.data) ? r.data[0] : r.data;
      if (d) setS({ followers: +d.followers || 0, following: +d.following || 0, isFollowing: !!d.is_following });
    } catch (e) { setS(prev); alert((e && e.message) || "Sign in to follow."); }
    finally { setBusy(false); }
  };
  const stat = (n, label, kind) => (
    <button onClick={() => openList(kind)} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
      <span style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, color: INK, letterSpacing: "-0.02em" }}>{n}</span>
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginLeft: 7 }}>{label}</span>
    </button>
  );
  const cwInit = (nm) => String(nm || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderRadius: 16, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: "14px 20px" }}>
      <div style={{ display: "flex", gap: 26 }}>{stat(s.followers, "Followers", "followers")}{stat(s.following, "Following", "following")}</div>
      {!isSelf && (
        <button onClick={toggle} disabled={busy} style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 999, padding: "10px 22px", cursor: busy ? "default" : "pointer", background: s.isFollowing ? "transparent" : TEAL, color: s.isFollowing ? INK : "#04201d", border: s.isFollowing ? "1px solid rgba(242,237,228,0.3)" : 0 }}>{s.isFollowing ? "Following ✓" : "Follow"}</button>
      )}
      {sheet && (
        <div onClick={() => setSheet(null)} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(10,10,8,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", maxHeight: "76vh", overflowY: "auto", background: "#1b1714", color: INK, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL_BRIGHT }}>{sheet === "following" ? "Following" : "Followers"}</span>
              <button onClick={() => setSheet(null)} aria-label="Close" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.6)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            {list == null ? (
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", padding: "8px 0" }}>Loading…</div>
            ) : list.length === 0 ? (
              <div style={{ fontFamily: serif, fontSize: 16, fontStyle: "italic", color: "rgba(242,237,228,0.6)", padding: "8px 0 14px" }}>{sheet === "following" ? "Not following anyone yet." : "No followers yet."}</div>
            ) : list.map((u, i) => (
              <a key={u.userId || i} href={u.userId ? `MemberProfile.html?u=${u.userId}` : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none", textDecoration: "none", color: INK }}>
                {u.userId && avatars[u.userId]
                  ? <img src={avatars[u.userId]} alt="" style={{ width: 36, height: 36, flex: "none", borderRadius: 999, objectFit: "cover", background: "#3a322a" }} />
                  : <span style={{ width: 36, height: 36, flex: "none", borderRadius: 999, background: "#3a322a", color: INK, display: "grid", placeItems: "center", fontFamily: serif, fontSize: 14 }}>{cwInit(u.name)}</span>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginTop: 2 }}>{u.role === "trainer" ? "Trainer" : u.role === "nutritionist" ? "Nutritionist" : "Member"}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberProfilePage() {
  const [st, setSt] = React.useState({ loading: true, status: "", row: null, isSelf: false, uid: null });
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cl = window.shapeDb && window.shapeDb.client;
        if (!cl || !cl.rpc) { if (!cancelled) setSt({ loading: false, status: "unavailable", row: null, isSelf: false }); return; }
        const qid = new URLSearchParams(window.location.search).get("u");
        let me = null;
        try { const r = await cl.auth.getUser(); me = r && r.data ? r.data.user : null; } catch (_) {}
        const uid = qid || (me && me.id);
        if (!uid) { if (!cancelled) setSt({ loading: false, status: "signin", row: null, isSelf: false }); return; }
        const res = await cl.rpc("get_public_profile", { p_user_id: uid });
        const row = Array.isArray(res && res.data) ? res.data[0] : (res && res.data);
        if (!cancelled) setSt({ loading: false, status: row ? "ok" : "notfound", row: row || null, isSelf: !!(me && me.id === uid), uid });
      } catch (e) {
        if (!cancelled) setSt({ loading: false, status: "error", row: null, isSelf: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const wrap = (children) => (
    <div style={{ background: INK_DEEP, color: INK, minHeight: "100vh", fontFamily: sans }}>
      <Header active="" />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 80px" }}>{children}</main>
      <Footer />
    </div>
  );

  if (st.loading) return wrap(<div style={{ padding: "80px 0", textAlign: "center", fontFamily: mono, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>Loading profile…</div>);

  if (st.status !== "ok") {
    const msg = st.status === "signin" ? "Sign in to view your public profile."
      : st.status === "notfound" ? "This profile isn't available."
      : st.status === "unavailable" ? "Profiles aren't available right now."
      : "Couldn't load this profile.";
    return wrap(
      <div style={{ padding: "60px 24px", textAlign: "center", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 18, background: "rgba(242,237,228,0.02)" }}>
        <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, marginBottom: 10 }}>Profile</div>
        <div style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.6)" }}>{msg}</div>
        {st.status === "signin" && <a href="/login" style={{ display: "inline-block", marginTop: 22, fontFamily: sans, fontSize: 13, fontWeight: 600, background: TEAL, color: "#04201d", borderRadius: 999, padding: "12px 24px", textDecoration: "none" }}>Sign in →</a>}
      </div>
    );
  }

  const row = st.row;
  const name = row.full_name || "Shape member";
  const isPrivate = row.is_public === false;
  const avatar = row.avatar || null; // profile photo (visibility-gated by the RPC)
  const points = Number.isFinite(row.points) ? row.points : null;
  const tier = points != null ? mpTierForPoints(points) : "Base";
  const tc = mpTierColor(tier);
  const isCoach = row.role === "trainer" || row.role === "nutritionist";
  const roleLabel = isCoach ? (row.role === "nutritionist" ? "Nutritionist" : "Trainer") : "Client";
  const first = String(name).split(" ")[0] || "Member";
  const goal = !isPrivate && row.goal;
  const pronouns = !isPrivate && row.pronouns;
  const link = !isPrivate && row.link;
  const bio = isPrivate ? null : (row.bio || `${name} is part of the Shape community${isCoach ? " as a coach" : ""}. ${isCoach ? "Browse their coaching profile to see packages and book a session." : "Say hi or cheer them on."}`);
  const message = () => {
    try { if (window.__openChat) { window.__openChat({ who: name, role: roleLabel }); return; } } catch (_) {}
    const btn = document.getElementById("shape-global-chat-button");
    if (btn) { btn.click(); return; }
    window.location.href = "/newdesign/ClientCommunity.html";
  };

  return wrap(
    <React.Fragment>
      <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>{st.isSelf ? "Your public profile" : "Public profile"}</div>

      {/* Hero */}
      <div style={{ borderRadius: 22, border: "1px solid rgba(242,237,228,0.1)", overflow: "hidden", background: `linear-gradient(150deg, ${tc}22, rgba(242,237,228,0.02) 60%)` }}>
        <div style={{ padding: 22, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, flex: "none", background: tc, color: "#fff", display: "grid", placeItems: "center", fontFamily: serif, fontWeight: 600, fontSize: 32, boxShadow: `0 0 0 4px ${tc}33`, overflow: "hidden" }}>{avatar ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : mpInitials(name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${tc}66`, background: `${tc}1f` }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: tc }} />
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: tc }}>{tier} tier</span>
            </span>
            <h1 style={{ fontFamily: serif, fontSize: "clamp(34px, 6vw, 52px)", fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 0.98, margin: "12px 0 0", color: INK }}>{name}</h1>
            <div style={{ marginTop: 9, fontFamily: mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>● {roleLabel} · Member of the Shape community</div>
          </div>
        </div>
        <div style={{ display: "flex", borderTop: "1px solid rgba(242,237,228,0.08)", padding: 14, gap: 10 }}>
          <MPStat label="Shape Score" value={points != null ? points.toLocaleString() : "—"} />
          <MPStat label="Tier" value={tier} color={tc} />
          <MPStat label="Role" value={roleLabel} />
        </div>
      </div>

      {/* Followers / following */}
      <MPFollow uid={st.uid} isSelf={st.isSelf} />

      {/* CTA */}
      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {st.isSelf ? (
          <a href="/newdesign/ClientMe.html" style={{ flex: 1, minWidth: 160, textAlign: "center", fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", background: TEAL, color: "#04201d", borderRadius: 999, padding: "14px", textDecoration: "none" }}>Edit profile →</a>
        ) : (
          <button onClick={message} style={{ flex: 1, minWidth: 160, fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", background: TEAL, color: "#04201d", border: 0, borderRadius: 999, padding: "14px", cursor: "pointer" }}>Message →</button>
        )}
        {isCoach && <a href="/Marketplace.html" style={{ flex: "none", fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK, border: "1px solid rgba(242,237,228,0.18)", borderRadius: 999, padding: "14px 22px", textDecoration: "none" }}>Coaching →</a>}
      </div>

      {/* About */}
      <div style={{ marginTop: 26, fontFamily: mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginBottom: 12 }}>About</div>
      {isPrivate ? (
        <div style={{ borderRadius: 18, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.03)", padding: 22, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }} aria-hidden>🔒</span>
          <div style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.7)", lineHeight: 1.55 }}>{first} keeps their profile private — only their name and tier are shown.</div>
        </div>
      ) : (
        <React.Fragment>
          <div style={{ borderRadius: 18, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: 22 }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>{isCoach ? "Philosophy" : "Their why"}</div>
            <div style={{ fontFamily: serif, fontSize: 19, lineHeight: 1.5, color: INK, fontWeight: 400 }}>{bio}</div>
          </div>
          {(goal || pronouns || link) && (
            <div style={{ marginTop: 14, borderRadius: 18, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: "8px 22px 16px" }}>
              {goal && <MPRow label="Goal" value={goal} />}
              {pronouns && <MPRow label="Pronouns" value={pronouns} top={!!goal} />}
              {link && <MPRow label="Link" value={<a href={/^https?:/i.test(link) ? link : "https://" + link} target="_blank" rel="noopener noreferrer" style={{ color: TEAL_BRIGHT, textDecoration: "none" }}>{String(link).replace(/^https?:\/\//, "")}</a>} top={!!(goal || pronouns)} />}
            </div>
          )}
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// Mounted by MemberProfile.html (alongside <ChatWidget/>) so the Message CTA's
// window.__openChat is ready. Exposed on window for the inline render script.
window.MemberProfilePage = MemberProfilePage;
