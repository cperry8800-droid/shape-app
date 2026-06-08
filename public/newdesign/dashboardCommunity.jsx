// Shared dashboard Community page used by client, trainer, and nutritionist
// dashboards. Each role's *Community.html shell loads this and renders
// <CommunityPage navItems={...} payoutCard={...} chatTabs={...} /> so the
// feed, channels, meetups, "My posts" filter, and "New post" composer stay
// identical across roles. Only the sidebar nav and (optional) chat widget
// vary per role.

function CommunityPage({ navItems, payoutCard, chatTabs }) {
  const ME = { who: "Priya M.", role: "Hypertrophy · 2,140" };
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [myPostsOnly, setMyPostsOnly] = React.useState(false);
  const [filter, setFilter] = React.useState("ALL");

  const DEMO_FEED = [
    { kind: "pr", who: "Marcus J.", role: "Tempo · 1,412", time: "8m", lift: "Bench Press", load: "225 lb", delta: "+10 lb", reps: "5 × 5", body: "First time hitting 225 on bench after 8 months. Maya's programming is unreal.", likes: 47, comments: 12, tag: "STRENGTH" },
    { kind: "workout", who: "Elena R.", role: "Peak · 6,108", time: "32m", title: "Lower strength · Block 3", duration: "52 min", exercises: 6, rpe: 8.5, coach: "Maya Okafor", note: "Squats felt locked in today.", likes: 18, comments: 3, tag: "STRENGTH" },
    { kind: "run", who: "Jonah W.", role: "Tempo · 980", time: "1h", distance: "8.4 mi", pace: "7:42 / mi", duration: "1h 04m", elev: "+412 ft", body: "Easy long. Brooklyn Half is Sunday — taper feels good.", likes: 24, comments: 6, tag: "RACING" },
    { kind: "tier", who: "Ana P.", role: "Tempo · 752", time: "2h", from: "Raw", to: "Tempo", earned: 752, body: "Three weeks in. Tempo unlocked — 2× redemption value on the store, here we come.", likes: 56, comments: 14, tag: "GENERAL" },
    { kind: "meal", who: "Priya S.", role: "Tempo · 1,284", time: "3h", title: "Sheet-pan salmon, sweet potato & broccoli", kcal: 620, p: 44, c: 58, f: 22, source: "From Rae · cook-along", likes: 12, comments: 2, tag: "NUTRITION" },
    { kind: "streak", who: "Diego R.", role: "Form · 2,540", time: "4h", days: 21, body: "Three weeks straight. Sunday-night protein prep is the unlock.", likes: 41, comments: 9, tag: "GENERAL" },
    { kind: "post", who: "Elena R.", role: "Peak · 6,108", time: "5h", body: "Down 14 lb and running negative splits for the first time ever. Rae's post-run fueling protocol changed everything.", likes: 82, comments: 24, tag: "NUTRITION" },
    { kind: "post", who: "Jonah W.", role: "Tempo · 980", time: "7h", body: "Race day Sunday — Brooklyn Half. Meet by the start corral at 6:45 if you're running. Coffee on me after.", likes: 19, comments: 8, tag: "RACING" },
  ];
  const [feed, setFeed] = React.useState(DEMO_FEED);

  // Hydrate the live posts on top of the demo content. The /api/community/feed
  // endpoint returns rows from community_posts (newest first); we map each row
  // to the local feed shape and prepend so a real post lands above the demos.
  React.useEffect(() => {
    let alive = true;
    const tagFor = (a) => {
      const t = String(a || '').toLowerCase();
      if (t === 'pr' || t === 'strength' || t === 'workout') return 'STRENGTH';
      if (t === 'run' || t === 'race' || t === 'racing') return 'RACING';
      if (t === 'meal' || t === 'nutrition') return 'NUTRITION';
      return 'GENERAL';
    };
    const since = (iso) => {
      const ms = Date.now() - new Date(iso).getTime();
      if (ms < 60_000) return 'now';
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
      return `${Math.floor(ms / 86_400_000)}d`;
    };
    fetch('/api/community/feed', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d || !Array.isArray(d.posts) || !d.posts.length) return;
        const live = d.posts.map(p => ({
          // Always render live posts with the text-only 'post' renderer. The
          // stat renderers (pr/run/workout/meal) require fields the feed API
          // doesn't return (load, distance, duration, coach, kcal…) and would
          // throw on .toUpperCase()/.split() of undefined. The activity_type
          // still drives the section tag below.
          kind: 'post',
          who: p.author_name || 'Shape member',
          role: p.author_role ? p.author_role[0].toUpperCase() + p.author_role.slice(1) : 'Member',
          time: since(p.created_at),
          title: p.title,
          body: p.photo_url ? (p.note || (p.title && p.title !== 'Photo' ? p.title : '')) : (p.note || p.title),
          photo: p.photo_url || null,
          likes: Array.isArray(p.likes) ? p.likes.length : 0,
          comments: Array.isArray(p.comments) ? p.comments.length : 0,
          tag: tagFor(p.activity_type),
          isLive: true,
        }));
        setFeed([...live, ...DEMO_FEED]);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── Inline renderers per feed kind ────────────────────────────────────
  function PRStat({ p }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "center", padding: "16px 18px", marginBottom: 14, background: "rgba(46,224,196,0.07)", border: "1px solid rgba(46,224,196,0.22)", borderRadius: 10 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, fontWeight: 600 }}>NEW PR</div>
          <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, color: INK }}>{p.load}</div>
          <div style={{ fontSize: 11.5, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", marginTop: 4 }}>{p.delta} · {p.reps}</div>
        </div>
        <div style={{ paddingLeft: 18, borderLeft: "1px solid rgba(46,224,196,0.18)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)" }}>LIFT</div>
          <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", marginTop: 4, color: INK }}>{p.lift}</div>
        </div>
      </div>
    );
  }
  function WorkoutStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, fontWeight: 600, marginBottom: 6 }}>WORKOUT LOGGED</div>
        <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK, marginBottom: 8 }}>{p.title}</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.6)", letterSpacing: "0.06em" }}>
          <span>{p.duration.toUpperCase()}</span>
          <span>{p.exercises} EXERCISES</span>
          <span>RPE {p.rpe}</span>
          <span>WITH {p.coach.split(" ")[0].toUpperCase()}</span>
        </div>
      </div>
    );
  }
  function RunStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "linear-gradient(100deg, rgba(106,140,255,0.10) 0%, rgba(242,237,228,0.04) 70%)", border: "1px solid rgba(106,140,255,0.22)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: "#9ab2ff", fontWeight: 600, marginBottom: 8 }}>RUN LOGGED</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[["DIST", p.distance], ["PACE", p.pace], ["TIME", p.duration], ["ELEV", p.elev]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>{l}</div>
              <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginTop: 2, lineHeight: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  function TierStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(193,100,31,0.08)", border: "1px solid rgba(193,100,31,0.28)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "#e89740", fontWeight: 600, marginBottom: 6 }}>TIER UP</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.015em", color: "rgba(242,237,228,0.55)" }}>{p.from}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#e89740" }}>→</span>
          <span style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: INK }}>{p.to}</span>
          <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.6)", letterSpacing: "0.06em" }}>{p.earned.toLocaleString()} PTS</span>
        </div>
      </div>
    );
  }
  function MealStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(232,151,64,0.06)", border: "1px solid rgba(232,151,64,0.22)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: "#e89740", fontWeight: 600, marginBottom: 6 }}>MEAL LOGGED</div>
        <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginBottom: 10, lineHeight: 1.15 }}>{p.title}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "rgba(242,237,228,0.7)", letterSpacing: "0.04em" }}>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>KCAL</span> {p.kcal}</span>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>P</span> {p.p}g</span>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>C</span> {p.c}g</span>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>F</span> {p.f}g</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: "rgba(242,237,228,0.5)" }}>{p.source}</div>
      </div>
    );
  }
  function StreakStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(46,224,196,0.07)", border: "1px solid rgba(46,224,196,0.2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 18 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, fontWeight: 600 }}>STREAK</div>
          <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, color: INK }}>{p.days}d</div>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 4 }}>
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 32, borderRadius: 3, background: i < p.days ? TEAL : "rgba(242,237,228,0.06)" }} />
          ))}
        </div>
      </div>
    );
  }

  function FeedItem({ p }) {
    const [liked, setLiked] = React.useState(false);
    const [likeCount, setLikeCount] = React.useState(p.likes);
    const [showReplies, setShowReplies] = React.useState(false);
    const [draft, setDraft] = React.useState("");
    const [replies, setReplies] = React.useState([]);
    const totalReplies = p.comments + replies.length;

    const toggleLike = () => {
      setLikeCount(c => liked ? c - 1 : c + 1);
      setLiked(v => !v);
    };
    const submitReply = () => {
      const t = draft.trim();
      if (!t) return;
      setReplies(rs => [...rs, { who: "You", t, time: "now" }]);
      setDraft("");
    };
    const onShare = () => {
      const url = window.location.href + "#post-" + (p.who || "").replace(/[^a-z0-9]/gi, "-").toLowerCase();
      try {
        if (navigator.share) navigator.share({ title: "Shape Community", text: p.body || p.title || "Check this out", url });
        else if (navigator.clipboard) { navigator.clipboard.writeText(url); alert("Link copied to clipboard"); }
      } catch (e) {}
    };

    return (
      <Card style={{ padding: 22 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, background: "#efece6", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.who}</div>
              <div style={{ fontSize: 11, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>{p.role}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: "rgba(242,237,228,0.45)" }}>{p.time}</span>
              <span style={{ width: 3, height: 3, borderRadius: 999, background: "rgba(242,237,228,0.25)" }} />
              <Pill>{p.tag}</Pill>
            </div>
          </div>
        </div>
        {p.kind === "pr"      && <PRStat p={p} />}
        {p.kind === "workout" && <WorkoutStat p={p} />}
        {p.kind === "run"     && <RunStat p={p} />}
        {p.kind === "tier"    && <TierStat p={p} />}
        {p.kind === "meal"    && <MealStat p={p} />}
        {p.kind === "streak"  && <StreakStat p={p} />}
        {p.body && <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "rgba(242,237,228,0.9)" }}>{p.body}</div>}
        {p.photo && <img src={p.photo} alt="" loading="lazy" style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 12, marginTop: p.body ? 12 : 2, border: "1px solid rgba(242,237,228,0.08)" }} />}
        {p.note && !p.photo && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(242,237,228,0.55)", fontStyle: "italic", marginTop: 6 }}>"{p.note}"</div>}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(242,237,228,0.06)", display: "flex", gap: 20, alignItems: "center", fontSize: 12, color: "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
          <button onClick={toggleLike} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: liked ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", transition: "color 0.15s, transform 0.15s", transform: liked ? "scale(1.05)" : "scale(1)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill={liked ? "currentColor" : "none"}>
              <path d="M6 10.2S1.5 7.5 1.5 4.5a2.5 2.5 0 0 1 4.5-1.5 2.5 2.5 0 0 1 4.5 1.5c0 3-4.5 5.7-4.5 5.7Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            {likeCount}
          </button>
          <button onClick={() => setShowReplies(v => !v)} aria-expanded={showReplies} aria-label={showReplies ? "Hide replies" : "Show replies"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: showReplies ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 5.5a3 3 0 0 1 3-3h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5l-2.5 2V7a2.5 2.5 0 0 1-.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
            {totalReplies} replies
          </button>
          <button onClick={onShare} aria-label="Share"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9 4.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V7.5M6.5 4.5H10m0 0L8 2.5M10 4.5 8 6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            SHARE
          </button>
        </div>

        {showReplies && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
            {replies.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {replies.map((r, i) => (
                  <div key={i} style={{ padding: "10px 12px", background: "rgba(10,197,168,0.06)", borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em", marginBottom: 4 }}>{r.who} · {r.time}</div>
                    <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.9)", lineHeight: 1.5 }}>{r.t}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitReply(); }}
                placeholder="Reply…"
                style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 13.5, outline: "none" }}
              />
              <button onClick={submitReply} disabled={!draft.trim()}
                style={{ padding: "10px 18px", borderRadius: 8, background: draft.trim() ? TEAL : "rgba(242,237,228,0.08)", color: draft.trim() ? PAPER : "rgba(242,237,228,0.4)", border: 0, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: draft.trim() ? "pointer" : "default" }}>
                Send
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  function ChannelsCard({ channels, meetups }) {
    const [tab, setTab] = React.useState("channels"); // 'channels' | 'meetups'
    const [query, setQuery] = React.useState("");
    const [chFilter, setChFilter] = React.useState("all");
    const [joinedMap, setJoinedMap] = React.useState(() => {
      const m = {};
      channels.forEach(c => { m[c.name] = c.joined; });
      return m;
    });
    const toggle = (name) => setJoinedMap(prev => ({ ...prev, [name]: !prev[name] }));

    const q = query.trim().toLowerCase();
    const filtered = channels.filter(c => {
      if (q && !(c.name.toLowerCase().includes(q) || c.lastMsg.toLowerCase().includes(q))) return false;
      if (chFilter === "joined" && !joinedMap[c.name]) return false;
      if (chFilter === "trending" && !c.trending) return false;
      return true;
    });
    const joinedCount = channels.filter(c => joinedMap[c.name]).length;
    const FilterPill = ({ k, label, count }) => {
      const active = chFilter === k;
      return (
        <button onClick={() => setChFilter(k)} style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em",
          padding: "5px 10px", borderRadius: 999,
          background: active ? INK : "rgba(242,237,228,0.04)",
          color: active ? PAPER : "rgba(242,237,228,0.7)",
          border: active ? "none" : "1px solid rgba(242,237,228,0.12)",
          cursor: "pointer",
        }}>{label}{count != null ? ` · ${count}` : ""}</button>
      );
    };

    const meetupList = meetups || [];
    const TabBtn = ({ k, label, count }) => {
      const on = tab === k;
      return (
        <button onClick={() => setTab(k)} style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: 999,
          background: on ? INK : "transparent",
          color: on ? PAPER : "rgba(242,237,228,0.72)",
          border: on ? "none" : "1px solid rgba(242,237,228,0.14)",
          fontFamily: sans, fontSize: 12.5, fontWeight: 500,
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span>{label}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em",
            background: on ? "rgba(242,237,228,0.18)" : "rgba(242,237,228,0.06)",
            color: on ? PAPER : "rgba(242,237,228,0.65)",
            padding: "2px 7px", borderRadius: 999,
          }}>{count}</span>
        </button>
      );
    };

    return (
      <Card>
        <SectionTitle right={tab === "channels"
          ? `${channels.length} CHANNELS`
          : `${meetupList.length} SCHEDULED`}>{tab === "channels" ? "Channels" : "Meetups"}</SectionTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <TabBtn k="channels" label="Channels" count={channels.length} />
          <TabBtn k="meetups" label="Meetups" count={meetupList.length} />
        </div>

        {tab === "channels" && <>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search channels…"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 13, outline: "none", marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <FilterPill k="all" label="ALL" count={channels.length} />
            <FilterPill k="joined" label="JOINED" count={joinedCount} />
            <FilterPill k="trending" label="TRENDING" />
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: "26px 4px", color: "rgba(242,237,228,0.5)", fontSize: 13, textAlign: "center" }}>
              No channels match.
            </div>
          )}
          {filtered.map((c, i) => {
            const joined = !!joinedMap[c.name];
            return (
              <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <a href={`Community.html?channel=${encodeURIComponent(c.name)}`} style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: TEAL_BRIGHT, fontSize: 13, fontWeight: 500 }}>#</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{c.name}</span>
                    {c.trending && <Pill tone="teal">TRENDING</Pill>}
                    {c.unread > 0 && joined && (
                      <span style={{ background: TEAL, color: PAPER, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999 }}>{c.unread}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastMsg}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.4)", letterSpacing: "0.08em", marginTop: 3 }}>{c.members.toLocaleString()} members · {c.at}</div>
                </a>
                <button onClick={() => toggle(c.name)} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em",
                  padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                  background: joined ? "rgba(242,237,228,0.04)" : TEAL,
                  color: joined ? "rgba(242,237,228,0.7)" : PAPER,
                  border: joined ? "1px solid rgba(242,237,228,0.18)" : "none",
                  whiteSpace: "nowrap",
                }}>{joined ? "JOINED" : "JOIN"}</button>
              </div>
            );
          })}

          <div style={{ paddingTop: 14, marginTop: 6, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
            <a href="Community.html?new-channel=1" style={{ display: "block", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>+ NEW CHANNEL</a>
          </div>
        </>}

        {tab === "meetups" && <>
          {meetupList.length === 0 ? (
            <div style={{ padding: "26px 4px", color: "rgba(242,237,228,0.5)", fontSize: 13, textAlign: "center" }}>
              No meetups scheduled.
            </div>
          ) : (
            meetupList.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", color: TEAL_BRIGHT, marginBottom: 3 }}>{m.when}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{m.sub}</div>
                </div>
                <button style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em",
                  padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                  background: m.rsvp ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)",
                  color: m.rsvp ? TEAL_BRIGHT : "rgba(242,237,228,0.7)",
                  border: "1px solid " + (m.rsvp ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.12)"),
                  whiteSpace: "nowrap",
                }}>{m.rsvp ? "GOING" : "RSVP"}</button>
              </div>
            ))
          )}
          <div style={{ paddingTop: 14, marginTop: 6, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", gap: 14 }}>
            <a href="Community.html?new-meetup=1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>+ NEW MEETUP</a>
            <a href="Community.html?meetups=1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>VIEW ALL →</a>
          </div>
        </>}
      </Card>
    );
  }

  const channels = [
    { name: "running",          members: 842, lastMsg: "anyone hitting the half this weekend?",       at: "2m",   joined: true,  unread: 4,  trending: true  },
    { name: "powerlifting",     members: 526, lastMsg: "265 squat PR today — programming worked",     at: "14m",  joined: true,  unread: 1                  },
    { name: "form-check",       members: 1304, lastMsg: "video posted — RDL hip hinge",               at: "1h",   joined: true,  unread: 0                  },
    { name: "nutrition-talk",   members: 678, lastMsg: "best protein bars under 200 cal?",            at: "2h",   joined: true,  unread: 12                 },
    { name: "marathon-training",members: 412, lastMsg: "week 8 of Pfitz 18/55 — heel strike fix",     at: "3h",   joined: false, unread: 0,  trending: true  },
    { name: "hypertrophy",      members: 891, lastMsg: "high-frequency chest split, worth it?",      at: "5h",   joined: false, unread: 0                  },
    { name: "recovery",         members: 384, lastMsg: "sauna + cold plunge protocol",                at: "6h",   joined: false, unread: 0                  },
    { name: "newbie",           members: 1567, lastMsg: "first squat day — terrified",                at: "8h",   joined: false, unread: 0                  },
    { name: "meal-prep",        members: 920, lastMsg: "sunday batch cook → 12 meals",                at: "yest", joined: false, unread: 0                  },
    { name: "shape-radio",      members: 234, lastMsg: "live show in 20: deload weeks explained",     at: "9h",   joined: false, unread: 0                  },
  ];
  const meetups = [
    { when: "SAT 6:30AM", title: "Prospect Park Long Run",      sub: "24 going · 12 from your borough",  rsvp: true  },
    { when: "TUE 7:00PM", title: "Form check drop-in (Zoom)",   sub: "with Maya Okafor",                  rsvp: false },
    { when: "APR 27",     title: "Brooklyn Half",               sub: "8 Shape runners confirmed",         rsvp: false },
  ];

  return (
    <DashPage
      navItems={navItems}
      payoutCard={payoutCard}
      eyebrow="4,218 MEMBERS · 128 ACTIVE NOW"
      title="Community"
      subtitle="What the Shape community is working on this week. Posts, meetups, and PRs from people training alongside you."
      actions={<>
        <button onClick={() => setMyPostsOnly(v => !v)} style={{ background: myPostsOnly ? "rgba(10,197,168,0.16)" : "transparent", color: myPostsOnly ? TEAL_BRIGHT : INK, border: `1px solid ${myPostsOnly ? "rgba(10,197,168,0.4)" : "rgba(242,237,228,0.25)"}`, padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{myPostsOnly ? "All posts" : "My posts"}</button>
        <button onClick={() => setComposerOpen(true)} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>New post</button>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(() => {
            const filters = [
              { label: "ALL",      kinds: null },
              { label: "WORKOUTS", kinds: ["workout"] },
              { label: "PRs",      kinds: ["pr"] },
              { label: "RUNS",     kinds: ["run"] },
              { label: "MEALS",    kinds: ["meal"] },
              { label: "MILESTONES", kinds: ["streak", "tier"] },
              { label: "POSTS",    kinds: ["post"] },
            ];
            const visible = feed.filter(p => {
              if (myPostsOnly && !p.isMe) return false;
              const f = filters.find(x => x.label === filter);
              return !f || !f.kinds || f.kinds.includes(p.kind);
            });
            return (
              <>
                <div style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", flexWrap: "wrap", alignItems: "center" }}>
                  {filters.map((f) => {
                    const on = f.label === filter;
                    return (
                      <button key={f.label} onClick={() => setFilter(f.label)}
                        style={{ padding: "6px 12px", borderRadius: 999, background: on ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)", color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.6)", border: "1px solid " + (on ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.08)"), cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
                        {f.label}
                      </button>
                    );
                  })}
                  {myPostsOnly && (
                    <span style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 999, background: "rgba(10,197,168,0.12)", color: TEAL_BRIGHT, border: "1px solid rgba(10,197,168,0.3)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em" }}>
                      MY POSTS ONLY · {feed.filter(p => p.isMe).length}
                    </span>
                  )}
                </div>
                {visible.length === 0
                  ? (
                    <div style={{ padding: "32px 4px", color: "rgba(242,237,228,0.55)", fontSize: 13, textAlign: "center" }}>
                      {myPostsOnly ? "You haven't posted yet. Tap New post to share something." : "Nothing in this filter yet."}
                    </div>
                  )
                  : visible.map((p, i) => <FeedItem key={p.id || i} p={p} />)}
              </>
            );
          })()}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChannelsCard channels={channels} meetups={meetups} />
        </div>
      </div>
      {chatTabs && <ChatWidget tabs={chatTabs} />}
      {composerOpen && (
        <PostComposer
          me={ME}
          onCancel={() => setComposerOpen(false)}
          onSubmit={(post) => {
            setFeed(prev => [{ id: "me-" + Date.now(), isMe: true, who: ME.who, role: ME.role, time: "now", likes: 0, comments: 0, ...post }, ...prev]);
            setComposerOpen(false);
            // Persist to the live feed (best-effort; the optimistic post already shows).
            const tag = post.tag ? { tags: [String(post.tag).toUpperCase()] } : undefined;
            fetch('/api/community/feed', {
              method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: (post.body || '').trim() || 'Photo',
                note: post.body || '',
                activityType: post.kind || 'workout',
                privacy: 'community',
                photoUrl: post.photo || '',
                metrics: tag,
              }),
            }).catch(() => {});
          }}
        />
      )}
    </DashPage>
  );
}

function PostComposer({ me, onCancel, onSubmit }) {
  const KINDS = [
    { value: "post", label: "Post", tag: "" },
    { value: "pr", label: "PR", tag: "STRENGTH" },
    { value: "workout", label: "Workout", tag: "STRENGTH" },
    { value: "run", label: "Run", tag: "RUNNING" },
    { value: "meal", label: "Meal", tag: "NUTRITION" },
  ];
  const [kind, setKind] = React.useState("post");
  const [body, setBody] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const canSubmit = (body.trim().length > 0 || !!photoUrl) && !photoBusy;
  const uploadPhoto = async (file) => {
    const client = window.shapeDb && window.shapeDb.client;
    if (!client) throw new Error("Not connected.");
    const { data: ures } = await client.auth.getUser();
    const user = ures && ures.user;
    if (!user) throw new Error("Sign in to add a photo.");
    const ext = (((file.type || "").split("/")[1]) || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    const path = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
    const { error } = await client.storage.from("community-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (error) throw error;
    const { data } = client.storage.from("community-photos").getPublicUrl(path);
    return (data && data.publicUrl) || null;
  };
  const onPhotoFile = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try { const url = await uploadPhoto(file); if (url) setPhotoUrl(url); }
    catch (err) { alert((err && err.message) || "Could not upload photo."); }
    finally { setPhotoBusy(false); }
  };
  const submit = () => {
    if (!canSubmit) return;
    const k = KINDS.find(x => x.value === kind) || KINDS[0];
    onSubmit({ kind, body: body.trim(), tag: tag.trim() || k.tag || undefined, photo: photoUrl || undefined });
  };
  return (
    <div onClick={onCancel}
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(10,10,8,0.78)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", background: "#1f1a16", color: INK, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: 28, boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>NEW POST</div>
            <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", marginTop: 4 }}>{me.who}</div>
            <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{me.role}</div>
          </div>
          <button onClick={onCancel} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 24, padding: "0 6px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {KINDS.map(k => {
            const on = k.value === kind;
            return (
              <button key={k.value} onClick={() => setKind(k.value)} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em",
                padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                background: on ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)",
                color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.7)",
                border: "1px solid " + (on ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.08)"),
              }}>{k.label.toUpperCase()}</button>
            );
          })}
        </div>

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          autoFocus
          rows={5}
          placeholder="What's on your mind? Share a PR, a workout, a meal, or a thought."
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 14, lineHeight: 1.5, outline: "none", resize: "vertical" }}
        />

        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="Tag (optional) e.g. STRENGTH, RUNNING, NUTRITION"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.08em", outline: "none" }}
          />
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display: "none" }} />
        {photoUrl ? (
          <div style={{ marginTop: 12, position: "relative", display: "inline-block" }}>
            <img src={photoUrl} alt="" style={{ display: "block", maxHeight: 180, maxWidth: "100%", borderRadius: 10, border: "1px solid rgba(242,237,228,0.14)" }} />
            <button onClick={() => setPhotoUrl("")} aria-label="Remove photo" style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 999, background: "rgba(10,10,8,0.7)", color: INK, border: "1px solid rgba(242,237,228,0.2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={photoBusy} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(242,237,228,0.04)", color: photoBusy ? "rgba(242,237,228,0.45)" : INK, border: "1px solid rgba(242,237,228,0.14)", padding: "9px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", cursor: photoBusy ? "default" : "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5L5 19"/></svg>
            {photoBusy ? "UPLOADING…" : "ADD PHOTO"}
          </button>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em" }}>{body.length} CHARS</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.18)", padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={!canSubmit} style={{ background: canSubmit ? TEAL : "rgba(242,237,228,0.06)", color: canSubmit ? PAPER : "rgba(242,237,228,0.4)", border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: canSubmit ? "pointer" : "default" }}>Post</button>
          </div>
        </div>
      </div>
    </div>
  );
}

if (typeof window !== "undefined") {
  window.CommunityPage = CommunityPage;
  window.PostComposer = PostComposer;
}
