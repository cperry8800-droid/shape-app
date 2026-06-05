// Reusable floating chat widget with optional tabs.
// Drop into any dashboard page:
//   <ChatWidget tabs={[{id, label, eyebrow, title, threads}, ...]} />
//   or legacy:  <ChatWidget threads={[...]} title="..." eyebrow="..." />

// ── Avatar + tier helpers (mirror the mobile app's chat avatars) ─────────────
// Tier color system: Base=steel, Tempo=gold, Form=teal, Peak=violet, Legend=rose.
const CW_TIER_COLORS = { raw: "#8a93a0", base: "#8a93a0", tempo: "#d8a23a", form: "#34d6c5", peak: "#8a5cf6", legend: "#e0518a" };
function cwTierColor(tier) { return CW_TIER_COLORS[String(tier || "").toLowerCase().trim()] || "#d8a23a"; }
function cwInitials(name) {
  return String(name || "").replace(/^#\s*/, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}
const CW_FEED_TIERS = ["Tempo", "Form", "Peak", "Legend", "Base"];
// Stable per-name tier for people we have no live points for (demo/seeded
// threads) — same deterministic hash the mobile app uses as its fallback.
function cwHashTier(name) {
  const s = String(name || "");
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i) * (i + 1)) % 997;
  return CW_FEED_TIERS[n % CW_FEED_TIERS.length];
}
function cwTierForPoints(pts) {
  const p = Number(pts) || 0;
  if (p >= 15000) return "Legend";
  if (p >= 5000) return "Peak";
  if (p >= 2000) return "Form";
  if (p >= 750) return "Tempo";
  return "Base";
}

function ChatWidget(props) {
  // normalize to tabs[]
  const tabs = React.useMemo(() => {
    if (props.tabs && props.tabs.length) return props.tabs;
    return [{
      id: "default",
      label: props.title || "Messages",
      eyebrow: props.eyebrow || "DIRECT CHAT",
      title: props.title || "Messages",
      threads: props.threads || [],
    }];
  }, [props.tabs, props.threads, props.title, props.eyebrow]);

  // When `docked`, the widget runs inside its own popped-out OS window:
  // always open, fills the window, no bubble / drag / resize.
  const docked = !!props.docked;

  // Open state persists across full page navigations (the newdesign pages
  // are separate static HTML files, so React state resets on every load).
  const OPEN_KEY = "shape.chat.open";
  const [open, setOpen] = React.useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
  });
  React.useEffect(() => {
    try {
      if (open) localStorage.setItem(OPEN_KEY, "1");
      else localStorage.removeItem(OPEN_KEY);
    } catch {}
  }, [open]);
  const [tabIdx, setTabIdx] = React.useState(0);
  // threadsByTab: array of arrays of threads (mutable copy)
  const [threadsByTab, setThreadsByTab] = React.useState(() => tabs.map(t => t.threads));
  const [activeByTab, setActiveByTab] = React.useState(() => tabs.map(() => 0));
  const [draftByTab, setDraftByTab] = React.useState(() => tabs.map(() => ""));
  const [typing, setTyping] = React.useState(false);

  // ── Persistence ───────────────────────────────────────────────────────
  // Sent messages / created channels survive navigation + reload, scoped to
  // the authenticated Supabase user (falls back to "anon" when signed out).
  // localStorage is shared across every /newdesign/* page (same origin), so
  // the site-wide chat bubble stays in sync everywhere.
  const STORE_VER = "v2";
  const storeKeyRef = React.useRef(null);
  const hydratedRef = React.useRef(false);
  const dirtyRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let uid = "anon";
      try {
        const r = await fetch("/api/me", { credentials: "same-origin" });
        if (r.ok) {
          const j = await r.json();
          uid = (j && (j.user?.id || j.id || j.profile?.id)) || "anon";
        }
      } catch {}
      if (cancelled) return;
      const key = `shape.chat.${STORE_VER}.${uid}`;
      storeKeyRef.current = key;
      // Don't clobber a message the user typed before hydration finished.
      if (!dirtyRef.current) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved && Array.isArray(saved.threadsByTab) && saved.threadsByTab.length === tabs.length) {
              setThreadsByTab(saved.threadsByTab);
              if (Array.isArray(saved.activeByTab) && saved.activeByTab.length === tabs.length) {
                setActiveByTab(saved.activeByTab);
              }
            }
          }
        } catch {}
      }
      hydratedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [tabs.length]);

  React.useEffect(() => {
    if (!hydratedRef.current || !storeKeyRef.current) return;
    try {
      localStorage.setItem(storeKeyRef.current, JSON.stringify({ threadsByTab, activeByTab }));
    } catch {}
  }, [threadsByTab, activeByTab]);

  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  // iMessage-style reactions, keyed by `${tabIdx}:${threadIdx}:${msgIdx}` -> emoji string
  const [reactions, setReactions] = React.useState({});
  const [reactionPickerFor, setReactionPickerFor] = React.useState(null); // same key, or null
  const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "‼️", "❓"];
  const toggleReaction = (key, emoji) => {
    setReactions(prev => {
      const cur = prev[key] || null;
      const next = { ...prev };
      if (cur === emoji) delete next[key]; else next[key] = emoji;
      return next;
    });
    setReactionPickerFor(null);
  };
  const [searchQ, setSearchQ] = React.useState("");
  const scrollRef = React.useRef(null);

  const currentThreads = threadsByTab[tabIdx] || [];
  const activeIdx = activeByTab[tabIdx] || 0;
  const active = currentThreads[activeIdx];
  const draft = draftByTab[tabIdx] || "";

  // unread across ALL tabs
  const totalUnread = threadsByTab.reduce(
    (s, ts) => s + ts.reduce((a, t) => a + (t.unread || 0), 0), 0
  );
  const tabUnread = (i) => threadsByTab[i].reduce((a, t) => a + (t.unread || 0), 0);

  // Drag state ------------------------------------------------------------
  const POS_KEY = "shape.chatWidget.pos";
  const SIZE_KEY = "shape.chatWidget.size";
  const DEFAULT_SIZE = { w: 1180, h: 860 };
  const [pos, setPos] = React.useState(() => {
    try { const s = localStorage.getItem(POS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [size, setSize] = React.useState(() => {
    try { const s = localStorage.getItem(SIZE_KEY); return s ? JSON.parse(s) : DEFAULT_SIZE; } catch { return DEFAULT_SIZE; }
  });
  const dragRef = React.useRef(null);
  const resizeRef = React.useRef(null);
  const PANEL_VISIBLE_GRAB = 84;

  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const panel = e.currentTarget.closest("[data-chat-panel]");
    const rect = panel.getBoundingClientRect();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: rect.width, h: rect.height };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", endResize);
  };
  const onResize = (e) => {
    const d = resizeRef.current; if (!d) return;
    const w = Math.max(520, Math.min(window.innerWidth - 40, d.w + (e.clientX - d.startX)));
    const h = Math.max(420, Math.min(window.innerHeight - 40, d.h + (e.clientY - d.startY)));
    setSize({ w, h });
  };
  const endResize = () => {
    resizeRef.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", endResize);
    setSize(s => { try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch {} return s; });
  };
  const resetSize = () => { setSize(DEFAULT_SIZE); try { localStorage.removeItem(SIZE_KEY); } catch {} };

  const startDrag = (e) => {
    if (docked) return;
    if (e.target.closest("button, input, textarea")) return;
    e.preventDefault();
    const panel = e.currentTarget.closest("[data-chat-panel]");
    const rect = panel.getBoundingClientRect();
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, w: rect.width, h: rect.height };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  };
  const onDrag = (e) => {
    const d = dragRef.current; if (!d) return;
    // Free drag — panel may go fully off-screen; the RESET button
    // (resetPos) brings it back to the default position.
    setPos({ x: e.clientX - d.offX, y: e.clientY - d.offY });
  };
  const endDrag = () => {
    dragRef.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
    setPos(p => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} } return p; });
  };
  const resetPos = () => { setPos(null); try { localStorage.removeItem(POS_KEY); } catch {} };

  const isOpen = docked || open;
  const closePanel = () => {
    if (docked) { try { window.close(); } catch {} }
    else setOpen(false);
  };
  // Pop the chat out into its own OS window — drag it anywhere on the desktop,
  // onto a second monitor, etc. localStorage keeps the threads in sync.
  const popOut = () => {
    const w = window.open('/newdesign/chatPopout.html', 'shapeChatPopout', 'popup,width=960,height=720');
    if (w) { try { w.focus(); } catch {} setOpen(false); }
  };

  // Global opener.
  //   window.__openChat("Maya")                              ← legacy name lookup
  //   window.__openChat("Maya", "team")                       ← scoped to a tab
  //   window.__openChat({ who, role, eyebrow, conversationId }) ← inject if missing
  //
  // When called with an object descriptor, the widget will reuse the matching
  // local thread if one already exists, otherwise prepend a fresh one so the
  // user lands in a usable empty conversation with the right counterpart.
  React.useEffect(() => {
    window.__openChat = (arg, tabId) => {
      setOpen(true);
      const descriptor = (arg && typeof arg === "object") ? arg : null;
      const who = descriptor ? descriptor.who : (typeof arg === "string" ? arg : null);
      if (tabId) {
        const ti = tabs.findIndex(t => t.id === tabId);
        if (ti >= 0) setTabIdx(ti);
      }
      if (!who) return;

      const searchTabs = tabId ? [tabs.findIndex(t => t.id === tabId)] : threadsByTab.map((_, i) => i);
      for (const ti of searchTabs) {
        if (ti < 0) continue;
        const idx = threadsByTab[ti].findIndex(t => t.who.toLowerCase().includes(who.toLowerCase()));
        if (idx >= 0) {
          setTabIdx(ti);
          setActiveByTab(prev => prev.map((v, i) => i === ti ? idx : v));
          return;
        }
      }

      // No matching thread. If we got a descriptor (e.g. from the Shared
      // Clients tab), prepend a new empty thread on the current tab so the
      // user can start typing right away.
      if (descriptor) {
        const fresh = {
          who,
          role: descriptor.role || descriptor.eyebrow || "Direct message",
          last: "",
          time: "now",
          unread: 0,
          conversationId: descriptor.conversationId || null,
          messages: [],
        };
        const targetTab = tabId
          ? Math.max(0, tabs.findIndex(t => t.id === tabId))
          : tabIdx;
        dirtyRef.current = true;
        setThreadsByTab(prev => prev.map((ts, ti) => ti !== targetTab ? ts : [fresh, ...ts]));
        setActiveByTab(prev => prev.map((v, ti) => ti === targetTab ? 0 : v));
        setTabIdx(targetTab);
      }
    };
    return () => { delete window.__openChat; };
  }, [threadsByTab, tabs, tabIdx]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [tabIdx, activeIdx, active?.messages?.length, typing, open]);

  const setDraft = (v) => setDraftByTab(prev => prev.map((d, i) => i === tabIdx ? v : d));

  const isSupport = !!tabs[tabIdx]?.support;

  const send = (forceText) => {
    const text = (typeof forceText === "string" ? forceText : draft).trim();
    if (!text) return;
    dirtyRef.current = true;
    const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    // Snapshot the conversationId from the active thread BEFORE mutation, so
    // we know whether to round-trip through the API.
    const activeThread = (threadsByTab[tabIdx] || [])[activeIdx];
    const convId = activeThread && activeThread.conversationId;

    setThreadsByTab(prev => prev.map((ts, ti) => {
      if (ti !== tabIdx) return ts;
      return ts.map((t, i) => {
        if (i !== activeIdx) return t;
        return { ...t, last: `You: ${text}`, time: "now", unread: 0, messages: [...t.messages, { who: "You", t: text, time: stamp, me: true }] };
      });
    }));
    if (typeof forceText !== "string") setDraft("");

    // DB-backed thread: POST the message and skip the fake-reply timer. The
    // poll loop below will surface anything the other side sends back.
    if (convId) {
      fetch(`/api/conversations/${encodeURIComponent(convId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body: text }),
      }).catch(() => {});
      return;
    }

    const appendReply = (who, reply) => {
      const stamp2 = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setThreadsByTab(prev => prev.map((ts, ti) => {
        if (ti !== tabIdx) return ts;
        return ts.map((t, i) => {
          if (i !== activeIdx) return t;
          return { ...t, last: `${who}: ${reply}`, time: "now", messages: [...t.messages, { who, t: reply, time: stamp2, me: false }] };
        });
      }));
    };

    // Help tab → real AI support (Nora, OpenAI) via /api/support/chat — same
    // assistant the mobile app uses. The server gracefully falls back to a
    // rule-based reply if the model is down; this also falls back to the local
    // script on a network error. Other tabs keep their simulated peer replies.
    if (isSupport) {
      setTyping(true);
      const history = [...((activeThread && activeThread.messages) || []), { t: text, me: true }]
        .map(m => ({ role: m.me ? "user" : "assistant", content: String(m.t || "") }))
        .filter(m => m.content);
      (async () => {
        let reply = null;
        try {
          const res = await fetch("/api/support/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ messages: history }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data && data.reply) reply = data.reply;
        } catch (e) { /* fall back below */ }
        setTyping(false);
        appendReply("Nora", reply || supportReply(text));
      })();
      return;
    }

    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const { who, text: reply } = pickReply((threadsByTab[tabIdx] || [])[activeIdx] || {}, text);
      appendReply(who, reply);
    }, 1200 + Math.random() * 900);
  };

  // Poll new messages for the active DB-backed thread while the widget is
  // open. Cheap (≤500 row GET keyed by `since=`); only the active thread
  // polls so background threads stay quiet.
  const lastSeenRef = React.useRef({}); // { [conversationId]: ISOstring }
  const myUserIdRef = React.useRef(null);

  // Tap a message avatar/name → a public-profile view (mirrors the mobile app).
  // Derived tier/bio for demo people; live card via get_public_profile when the
  // message carries a real user id (i.e. an actual signed-in account).
  const [profileFor, setProfileFor] = React.useState(null);
  const [profLive, setProfLive] = React.useState(null);
  const openProfile = (m) => {
    // Prefer the fullest name we have so initials are 2 letters: in a 1:1 the
    // thread name is the counterpart's full name (the message sender is usually
    // just their first name); in a group, use the sender's name.
    const full = (active && active.who) || "";
    const sender = m && m.who && m.who !== "You" ? m.who : full;
    const who = (active && !active.group && full) ? full : sender;
    if (!who) return;
    const coach = !!(m && m.coach) || /trainer|coach|nutritionist/i.test((active && active.role) || "");
    setProfileFor({ who, role: (m && m.coach) ? "Coach" : ((active && active.role) || ""), coach, userId: (m && m.userId) || (active && active.userId) || null, tier: (m && m.tier) || null });
  };
  const profUid = profileFor && profileFor.userId;
  React.useEffect(() => {
    setProfLive(null);
    if (!profUid) return;
    try {
      const cl = window.shapeDb && window.shapeDb.client;
      if (cl && cl.rpc) cl.rpc("get_public_profile", { p_user_id: profUid }).then(function (r) { if (r && r.data) setProfLive(r.data); }).catch(function () {});
    } catch (e) {}
  }, [profUid]);

  // Shape is members-only — the chat bubble is where messages actually send, so
  // gate the composer: approved coaches + active subscribers can type; everyone
  // else (signed-out or free) sees a Join prompt. null = still resolving.
  const [member, setMember] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(async (d) => {
        const u = d && d.user;
        if (!cancelled) myUserIdRef.current = u ? u.id : null;
        if (!u) { if (!cancelled) setMember(false); return; }
        const roles = Array.isArray(u.roles) ? u.roles : [];
        const isCoach = u.role === "trainer" || u.role === "nutritionist" || roles.includes("trainer") || roles.includes("nutritionist");
        if (isCoach) { if (!cancelled) setMember(true); return; }
        try {
          const sres = await fetch("/api/stripe/subscription", { credentials: "same-origin", cache: "no-store" });
          const sd = sres.ok ? await sres.json() : null;
          if (!cancelled) setMember(!!(sd && sd.active === true));
        } catch { if (!cancelled) setMember(false); }
      })
      .catch(() => { if (!cancelled) setMember(false); });
    return () => { cancelled = true; };
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const activeThread = (threadsByTab[tabIdx] || [])[activeIdx];
    const convId = activeThread && activeThread.conversationId;
    if (!convId) return;
    let cancelled = false;
    const fetchOnce = async () => {
      const since = lastSeenRef.current[convId];
      const url = `/api/conversations/${encodeURIComponent(convId)}/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`;
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data && data.me && !myUserIdRef.current) myUserIdRef.current = data.me;
        const newRows = Array.isArray(data && data.messages) ? data.messages : [];
        if (!newRows.length) return;
        lastSeenRef.current[convId] = newRows[newRows.length - 1].created_at;
        setThreadsByTab(prev => prev.map((ts, ti) => {
          if (ti !== tabIdx) return ts;
          return ts.map((t, i) => {
            if (i !== activeIdx) return t;
            const me = myUserIdRef.current;
            const mapped = newRows.map(m => {
              const ts2 = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
              const mine = m.sender_id === me;
              return { who: mine ? "You" : t.who, t: m.body, time: ts2, me: mine };
            });
            const merged = since ? [...t.messages, ...mapped] : mapped;
            const last = mapped[mapped.length - 1];
            return { ...t, messages: merged, last: last ? `${last.me ? "You" : t.who}: ${last.t}` : t.last, time: "now" };
          });
        }));
      } catch {}
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, tabIdx, activeIdx, threadsByTab]);

  const selectThread = (i) => {
    setActiveByTab(prev => prev.map((v, ti) => ti === tabIdx ? i : v));
    setThreadsByTab(prev => prev.map((ts, ti) => ti !== tabIdx ? ts : ts.map((t, j) => j === i ? { ...t, unread: 0 } : t)));
  };

  const togglePin = (i, e) => {
    e && e.stopPropagation();
    setThreadsByTab(prev => prev.map((ts, ti) => ti !== tabIdx ? ts : ts.map((t, j) => j === i ? { ...t, pinned: !t.pinned } : t)));
  };

  const selectTab = (i) => {
    setTabIdx(i);
    setCreating(false);
    setSearchQ("");
  };

  const createChannel = () => {
    const slug = newName.trim().replace(/^#\s*/, "").replace(/\s+/g, "-").toLowerCase();
    if (!slug) return;
    dirtyRef.current = true;
    const newThread = {
      who: "# " + slug,
      role: newDesc.trim() ? "1 member · just now · " + newDesc.trim() : "1 member · just now",
      last: "You created this channel. Say hi 👋",
      time: "now",
      unread: 0,
      group: true,
      messages: [
        { who: "You", t: `Started #${slug}.${newDesc.trim() ? " " + newDesc.trim() : ""}`, time: "now", me: true },
      ],
    };
    setThreadsByTab(prev => prev.map((ts, ti) => ti !== tabIdx ? ts : [...ts, newThread]));
    setActiveByTab(prev => prev.map((v, ti) => ti === tabIdx ? (threadsByTab[tabIdx]?.length || 0) : v));
    setCreating(false);
    setNewName("");
    setNewDesc("");
  };

  const currentTab = tabs[tabIdx];

  return (
    <React.Fragment>
      <style>{`
        .chw-row:hover .chw-pin { opacity: 1 !important; }
        .chw-row:hover { background: rgba(242,237,228,0.03); }
        [data-chat-panel] *::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
        [data-chat-panel] * { scrollbar-width: none; }
        @media (max-width: 640px) {
          .chw-bubble { padding: 14px 20px 14px 16px !important; font-size: 14px !important; gap: 10px !important; right: 16px !important; bottom: 16px !important; }
          .chw-bubble svg { width: 18px !important; height: 18px !important; }
        }
      `}</style>
      {/* The floating launcher bubble is the site-wide globalChatButton.js (a
          single source on every page). ChatWidget renders only the open panel —
          opened via window.__openChat — so there's never a second stacked bubble
          and the launcher doesn't vanish when you open chat. */}

      {isOpen && (
        <div
          role="dialog"
          data-chat-panel
          style={docked ? {
            position: "fixed", inset: 0,
            background: "#1a1612", color: INK,
            display: "flex", flexDirection: "column",
            fontFamily: sans, overflow: "hidden",
          } : {
            position: "fixed",
            ...(pos ? { left: pos.x, top: pos.y } : { right: 28, bottom: 28 }),
            zIndex: 180,
            width: size.w, maxWidth: "calc(100vw - 40px)",
            height: size.h, maxHeight: "calc(100vh - 40px)",
            background: "#1a1612", color: INK,
            border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14,
            boxShadow: "0 28px 80px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column",
            fontFamily: sans, overflow: "hidden",
          }}>
          {/* Hero heading above tabs */}
          <div
            onMouseDown={startDrag}
            title="Drag to move"
            style={{
              padding: "16px 20px 14px",
              background: "linear-gradient(180deg, rgba(10,197,168,0.06), rgba(10,197,168,0))",
              borderBottom: "1px solid rgba(242,237,228,0.06)",
              cursor: "grab", userSelect: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ color: "rgba(242,237,228,0.35)", display: "inline-flex", alignItems: "center" }}><DragDots /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, marginBottom: 2 }}>SHAPE</div>
                <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.05, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Your community</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
              {!docked && pos && (
                <button onClick={resetPos} title="Reset position" style={{ background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>RESET</button>
              )}
              {!docked && (
                <button onClick={popOut} title="Pop out into its own window" aria-label="Pop out chat"
                  style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, padding: "4px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M9 3h4v4M13 3 7.4 8.6M11 9.6V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button onClick={closePanel} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 22, padding: "2px 10px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
          </div>

          {/* Top tab bar — full width */}
          {tabs.length > 1 && (
            <div
              onMouseDown={startDrag}
              title="Drag to move"
              style={{ display: "flex", borderBottom: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.02)", cursor: "grab", userSelect: "none" }}>
              {tabs.map((t, i) => {
                const unread = tabUnread(i);
                const isActive = i === tabIdx;
                return (
                  <button key={t.id} onClick={() => selectTab(i)}
                    style={{
                      flex: 1, padding: "12px 10px", border: 0, background: isActive ? "rgba(10,197,168,0.08)" : "transparent",
                      color: isActive ? INK : "rgba(242,237,228,0.6)",
                      fontFamily: sans, fontSize: 12, fontWeight: isActive ? 500 : 400,
                      cursor: "pointer",
                      borderBottom: isActive ? `2px solid ${TEAL}` : "2px solid transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      whiteSpace: "nowrap", minWidth: 0,
                    }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                    {unread > 0 && <span style={{ background: TEAL, color: PAPER, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", padding: "1px 5px", borderRadius: 999, flex: "0 0 auto" }}>{unread}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Body: threads + chat */}
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{ borderRight: "1px solid rgba(242,237,228,0.08)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(242,237,228,0.06)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 4 }}>
                {currentTab.eyebrow}
              </div>
              <div style={{ fontFamily: serif, fontSize: 17, letterSpacing: "-0.015em" }}>{currentTab.title}</div>
            </div>

            {/* (Sidebar tab bar removed — unified with top nav) */}

            {/* Thread list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {currentTab.canCreate && (
                <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(242,237,228,0.05)" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(242,237,228,0.4)", fontSize: 12, pointerEvents: "none" }}>⌕</span>
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder="Search channels"
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "rgba(242,237,228,0.04)", color: INK,
                        border: "1px solid rgba(242,237,228,0.08)", borderRadius: 6,
                        padding: "6px 10px 6px 26px", fontFamily: sans, fontSize: 12,
                        outline: "none",
                      }}
                    />
                    {searchQ && (
                      <button onClick={() => setSearchQ("")}
                        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>
                    )}
                  </div>
                </div>
              )}
              {(() => {
                const q = searchQ.trim().toLowerCase();
                const base = q
                  ? currentThreads.filter(t => (t.who || "").toLowerCase().includes(q) || (t.role || "").toLowerCase().includes(q) || (t.last || "").toLowerCase().includes(q))
                  : currentThreads;
                // Stable sort: pinned first
                const filtered = base.map((t, i) => ({ t, i })).sort((a, b) => (b.t.pinned ? 1 : 0) - (a.t.pinned ? 1 : 0) || a.i - b.i).map(x => x.t);
                const firstUnpinnedIdx = filtered.findIndex(t => !t.pinned);
                if (q && filtered.length === 0) {
                  return (
                    <div style={{ padding: "22px 18px", textAlign: "center", color: "rgba(242,237,228,0.45)", fontSize: 12 }}>
                      No channels match "<span style={{ color: INK }}>{searchQ}</span>"
                      {currentTab.canCreate && (
                        <div style={{ marginTop: 10 }}>
                          <button onClick={() => { setNewName(searchQ.toLowerCase().replace(/\s+/g, "-")); setCreating(true); setSearchQ(""); }}
                            style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "5px 10px", borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer" }}>
                            + CREATE #{searchQ.toLowerCase().replace(/\s+/g, "-")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return filtered.map((t, i) => {
                  const origIdx = currentThreads.indexOf(t);
                  const showDivider = !q && t.pinned && filtered[i + 1] && !filtered[i + 1].pinned;
                  return (
                  <React.Fragment key={origIdx}>
                <div onClick={() => selectThread(origIdx)}
                  className="chw-row"
                  style={{
                    position: "relative",
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 18px", border: 0, background: origIdx === activeIdx ? "rgba(10,197,168,0.10)" : "transparent",
                    borderLeft: origIdx === activeIdx ? `2px solid ${TEAL}` : "2px solid transparent",
                    borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.05)",
                    cursor: "pointer", color: "inherit", fontFamily: "inherit",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3, gap: 6 }}>
                    <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 500, fontFamily: t.group ? "'JetBrains Mono', monospace" : sans, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {t.online && <span style={{ flex: "none", width: 7, height: 7, borderRadius: 999, background: "#3ddc84", boxShadow: "0 0 0 2px rgba(61,220,132,0.2)" }} />}
                        {t.who}
                      </span>
                      {t.pinned && <span style={{ flex: "none", fontSize: 8.5, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", background: "rgba(10,197,168,0.12)", padding: "1px 5px", borderRadius: 3 }}>PINNED</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                      <button
                        className="chw-pin"
                        onClick={(e) => togglePin(origIdx, e)}
                        title={t.pinned ? "Unpin" : "Pin to top"}
                        aria-label={t.pinned ? "Unpin channel" : "Pin channel"}
                        style={{
                          opacity: t.pinned ? 1 : 0,
                          background: "transparent", border: 0, padding: "2px 4px",
                          cursor: "pointer", fontSize: 12, lineHeight: 1,
                          color: t.pinned ? TEAL_BRIGHT : "rgba(242,237,228,0.6)",
                          transition: "opacity 120ms",
                        }}>
                        {t.pinned ? "📌" : "📍"}
                      </button>
                      <div style={{ fontSize: 10, color: "rgba(242,237,228,0.45)", fontFamily: "'JetBrains Mono', monospace" }}>{t.time || ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "rgba(242,237,228,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.last}</div>
                    {t.unread > 0 && <span style={{ background: TEAL, color: PAPER, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", padding: "2px 6px", borderRadius: 999, minWidth: 16, textAlign: "center" }}>{t.unread}</span>}
                  </div>
                </div>
                {showDivider && (
                  <div style={{ padding: "6px 18px 2px", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: "rgba(242,237,228,0.35)", borderTop: "1px solid rgba(242,237,228,0.05)", background: "rgba(242,237,228,0.015)" }}>
                    ALL CHANNELS
                  </div>
                )}
                  </React.Fragment>
                  );
                });
              })()}

              {currentTab.canCreate && !creating && (
                <button onClick={() => setCreating(true)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    width: "100%", padding: "12px 18px", border: 0,
                    borderTop: "1px solid rgba(242,237,228,0.05)",
                    background: "transparent", color: TEAL_BRIGHT,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em",
                    cursor: "pointer",
                  }}>
                  + NEW CHANNEL
                </button>
              )}

              {currentTab.canCreate && creating && (
                <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(242,237,228,0.08)", background: "rgba(10,197,168,0.04)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: TEAL_BRIGHT, marginBottom: 8 }}>NEW CHANNEL</div>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.replace(/^#\s*/, "").replace(/\s+/g, "-").toLowerCase())}
                    placeholder="channel-name"
                    style={{
                      width: "100%", boxSizing: "border-box", background: "rgba(242,237,228,0.04)", color: INK,
                      border: "1px solid rgba(242,237,228,0.12)", borderRadius: 6,
                      padding: "7px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      outline: "none", marginBottom: 6,
                    }}
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="What's this channel about?"
                    style={{
                      width: "100%", boxSizing: "border-box", background: "rgba(242,237,228,0.04)", color: INK,
                      border: "1px solid rgba(242,237,228,0.12)", borderRadius: 6,
                      padding: "7px 10px", fontFamily: sans, fontSize: 12,
                      outline: "none", marginBottom: 10,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={createChannel} disabled={!newName.trim()}
                      style={{
                        flex: 1, background: newName.trim() ? TEAL : "rgba(242,237,228,0.08)",
                        color: newName.trim() ? PAPER : "rgba(242,237,228,0.4)",
                        border: 0, padding: "7px 10px", borderRadius: 6,
                        fontFamily: sans, fontSize: 12, fontWeight: 500,
                        cursor: newName.trim() ? "pointer" : "not-allowed",
                      }}>Create</button>
                    <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
                      style={{
                        background: "transparent", color: "rgba(242,237,228,0.55)",
                        border: "1px solid rgba(242,237,228,0.12)", padding: "7px 10px", borderRadius: 6,
                        fontFamily: sans, fontSize: 12, cursor: "pointer",
                      }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat pane */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
            {profileFor && (() => {
              const isPrivate = !!(profLive && profLive.is_public === false);
              const points = (profLive && Number.isFinite(profLive.points)) ? profLive.points : null;
              const tier = points != null ? cwTierForPoints(points) : (profileFor.tier || cwHashTier(profileFor.who));
              const tc = cwTierColor(tier);
              const isCoach = profileFor.coach;
              const roleLabel = isCoach ? (/nutrition/i.test(profileFor.role || "") ? "Nutritionist" : "Trainer") : "Client";
              const first = String(profileFor.who).split(" ")[0] || "This member";
              const pronouns = !isPrivate && profLive && profLive.pronouns;
              const goal = !isPrivate && profLive && profLive.goal;
              const link = !isPrivate && profLive && profLive.link;
              const bio = isPrivate ? null : ((profLive && profLive.bio) || `${profileFor.who} is part of the Shape community${isCoach ? " as a coach" : ""}. ${isCoach ? "Browse their coaching profile to see packages and book a session." : "Say hi or cheer them on."}`);
              const Stat = (st) => (
                <div style={{ flex: 1, minWidth: 0, borderRadius: 12, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: "10px 12px" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>{st.label}</div>
                  <div style={{ marginTop: 3, fontFamily: sans, fontSize: 15, fontWeight: 600, color: st.color || INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.value}</div>
                </div>
              );
              const Row = (rw) => (
                <div style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.07)" }}>
                  <div style={{ flex: "none", width: 84, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", paddingTop: 1 }}>{rw.label}</div>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.4, wordBreak: "break-word" }}>{rw.value}</div>
                </div>
              );
              return (
                <div style={{ position: "absolute", inset: 0, zIndex: 12, background: "#1a1612", display: "flex", flexDirection: "column", overflowY: "auto" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={() => setProfileFor(null)} style={{ background: "transparent", border: 0, color: TEAL_BRIGHT, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em" }}>← BACK</button>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Public profile</span>
                  </div>
                  <div style={{ padding: 18 }}>
                    <div style={{ borderRadius: 18, border: `1px solid ${tc}55`, background: `radial-gradient(130% 120% at 78% 14%, ${tc}26, transparent 55%), rgba(242,237,228,0.03)`, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 999, flex: "none", background: tc, color: "#fff", display: "grid", placeItems: "center", fontFamily: sans, fontWeight: 700, fontSize: 22, boxShadow: `0 0 0 3px ${tc}33` }}>{cwInitials(profileFor.who)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                          <span style={{ color: tc }}>{tier}</span><span style={{ color: "rgba(242,237,228,0.4)" }}>·</span><span style={{ color: "rgba(242,237,228,0.55)" }}>{roleLabel}</span>
                        </div>
                        <div style={{ marginTop: 5, fontFamily: sans, fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: INK }}>{profileFor.who}</div>
                        <div style={{ marginTop: 7, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>● Member of the Shape community</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                      <Stat label="Tier" value={tier} color={tc} />
                      <Stat label="Shape Score" value={points != null ? points.toLocaleString() + " pts" : "—"} />
                      <Stat label="Role" value={roleLabel} />
                    </div>
                    {isPrivate ? (
                      <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.03)", padding: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16 }} aria-hidden>🔒</span>
                        <div style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.7)", lineHeight: 1.5 }}>{first} keeps their profile private — only their name and tier are shown.</div>
                      </div>
                    ) : (
                      <React.Fragment>
                        <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: 16, fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.75)", lineHeight: 1.5 }}>{bio}</div>
                        {(pronouns || goal || link) && (
                          <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(242,237,228,0.1)", background: "rgba(242,237,228,0.03)", padding: "4px 16px 12px" }}>
                            {pronouns && <Row label="Pronouns" value={pronouns} />}
                            {goal && <Row label="Goal" value={goal} />}
                            {link && <Row label="Link" value={<a href={/^https?:/i.test(link) ? link : "https://" + link} target="_blank" rel="noopener noreferrer" style={{ color: TEAL_BRIGHT, textDecoration: "none" }}>{String(link).replace(/^https?:\/\//, "")}</a>} />}
                          </div>
                        )}
                      </React.Fragment>
                    )}
                    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                      <button onClick={() => setProfileFor(null)} style={{ flex: 1, padding: "12px", borderRadius: 999, border: 0, background: TEAL, color: PAPER, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>Message →</button>
                      {isCoach
                        ? <a href="/Marketplace.html" style={{ flex: "none", padding: "12px 18px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.16)", color: INK, textDecoration: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>View full profile →</a>
                        : (profileFor.userId && <a href={`/newdesign/MemberProfile.html?u=${encodeURIComponent(profileFor.userId)}`} style={{ flex: "none", padding: "12px 18px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.16)", color: INK, textDecoration: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>View full profile →</a>)}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div
              onMouseDown={startDrag}
              title="Drag to move"
              style={{ padding: "14px 18px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "grab", userSelect: "none" }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <DragDots />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, fontFamily: active?.group ? "'JetBrains Mono', monospace" : sans }}>{active?.who}</div>
                  {active?.role && <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{active.role}</div>}
                </div>
              </div>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {active?.messages?.map((m, i) => {
                const rKey = `${tabIdx}:${activeByTab[tabIdx]}:${i}`;
                const myReaction = reactions[rKey];
                const pickerOpen = reactionPickerFor === rKey;
                const longPressRef = { id: null };
                const startLongPress = (e) => {
                  e.preventDefault();
                  longPressRef.id = setTimeout(() => setReactionPickerFor(rKey), 380);
                };
                const cancelLongPress = () => { if (longPressRef.id) clearTimeout(longPressRef.id); };
                // Full name where possible (thread name in a 1:1) so initials are 2 letters.
                const avatarName = (active && active.group) ? (m.who || (active && active.who)) : ((active && active.who) || m.who);
                return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start", position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: m.me ? "row-reverse" : "row", maxWidth: "90%" }}>
                    {!m.me && (
                      <button onClick={() => openProfile(m)} title="View profile" style={{ flex: "none", width: 30, height: 30, borderRadius: 999, border: 0, cursor: "pointer", alignSelf: "flex-end", background: cwTierColor(m && m.tier ? String(m.tier) : cwHashTier(avatarName)), color: "#fff", fontFamily: sans, fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {cwInitials(avatarName)}
                      </button>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start", minWidth: 0 }}>
                      {!m.me && active?.group && (
                        <button onClick={() => openProfile(m)} style={{ background: "transparent", border: 0, padding: "0 4px", cursor: "pointer", textAlign: "left", fontSize: 10.5, color: m.coach ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em", marginBottom: 3 }}>
                          {m.who}{m.coach ? " · COACH" : ""}
                        </button>
                      )}
                      <div style={{ position: "relative" }}>
                    <div
                      onContextMenu={(e) => { e.preventDefault(); setReactionPickerFor(pickerOpen ? null : rKey); }}
                      onDoubleClick={(e) => { e.preventDefault(); toggleReaction(rKey, "❤️"); }}
                      onMouseDown={startLongPress}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={startLongPress}
                      onTouchEnd={cancelLongPress}
                      style={{
                        maxWidth: "78%", padding: "9px 13px", borderRadius: 12,
                        background: m.me ? TEAL : "rgba(242,237,228,0.06)",
                        color: m.me ? PAPER : INK,
                        borderTopRightRadius: m.me ? 3 : 12,
                        borderTopLeftRadius: m.me ? 12 : 3,
                        fontSize: 13.5, lineHeight: 1.45,
                        cursor: "pointer", userSelect: "none",
                      }}>{m.t}</div>
                    {pickerOpen && (
                      <div style={{
                        position: "absolute",
                        bottom: "calc(100% + 6px)",
                        [m.me ? "right" : "left"]: 0,
                        display: "flex", gap: 2, padding: "5px 7px",
                        background: "rgba(26,22,18,0.98)",
                        border: "1px solid rgba(242,237,228,0.12)",
                        borderRadius: 999,
                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                        zIndex: 5,
                      }}
                        onMouseLeave={() => setReactionPickerFor(null)}>
                        {REACTION_EMOJIS.map(em => (
                          <button key={em}
                            onClick={() => toggleReaction(rKey, em)}
                            style={{
                              background: myReaction === em ? "rgba(10,197,168,0.22)" : "transparent",
                              border: 0, borderRadius: 999, width: 30, height: 30,
                              cursor: "pointer", fontSize: 16, lineHeight: 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{em}</button>
                        ))}
                      </div>
                    )}
                    {myReaction && (
                      <div style={{
                        position: "absolute",
                        bottom: -10,
                        [m.me ? "left" : "right"]: -6,
                        background: "rgba(26,22,18,0.96)",
                        border: "1px solid rgba(242,237,228,0.14)",
                        borderRadius: 999,
                        padding: "2px 6px",
                        fontSize: 12,
                        lineHeight: 1,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                        cursor: "pointer",
                        zIndex: 2,
                      }}
                        onClick={() => toggleReaction(rKey, myReaction)}
                        title="Remove reaction">{myReaction}</div>
                    )}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(242,237,228,0.4)", fontFamily: "'JetBrains Mono', monospace", marginTop: myReaction ? 10 : 4, padding: "0 4px" }}>{m.time}</div>
                </div>
                );
              })}
              {typing && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(242,237,228,0.5)", fontSize: 12, fontStyle: "italic" }}>
                  <TypingDots />{isSupport ? "Nora is typing…" : "someone is typing…"}
                </div>
              )}
              {!typing && isSupport && active?.quick?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 2 }}>
                  {active.quick.map((label) => (
                    <button key={label} onClick={() => send(label)}
                      style={{
                        border: `1px solid ${TEAL}`, background: "transparent", color: TEAL_BRIGHT,
                        borderRadius: 999, padding: "7px 12px", fontFamily: sans, fontSize: 12,
                        fontWeight: 500, cursor: "pointer",
                      }}>{label}</button>
                  ))}
                </div>
              )}
            </div>

            {(member === false && !isSupport) ? (
              <div style={{ padding: "14px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16 }} aria-hidden>🔒</span>
                <div style={{ flex: 1, minWidth: 150, fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.72)", lineHeight: 1.4 }}>Become a Shape member to send messages.</div>
                <a href="/pricing" style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, background: TEAL, color: PAPER, borderRadius: 999, padding: "8px 14px", textDecoration: "none", whiteSpace: "nowrap" }}>Join · $5/mo</a>
              </div>
            ) : (
            <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={active?.group ? `Message ${active.who}…` : `Message ${active?.who?.split(" ")[0] || "…"}`}
                rows={1}
                style={{
                  flex: 1, resize: "none", background: "rgba(242,237,228,0.04)", color: INK,
                  border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8,
                  padding: "10px 12px", fontFamily: sans, fontSize: 13.5, lineHeight: 1.4,
                  outline: "none", minHeight: 38, maxHeight: 100,
                }}
              />
              <button onClick={send} disabled={!draft.trim()}
                style={{
                  background: draft.trim() ? TEAL : "rgba(242,237,228,0.08)",
                  color: draft.trim() ? PAPER : "rgba(242,237,228,0.4)",
                  border: 0, padding: "10px 16px", borderRadius: 8,
                  fontFamily: sans, fontSize: 13, fontWeight: 500,
                  cursor: draft.trim() ? "pointer" : "not-allowed",
                }}>Send</button>
            </div>
            )}
          </div>
          </div>
          {/* Resize handle (bottom-right corner) — not shown when popped out */}
          {!docked && (
            <div
              onMouseDown={startResize}
              onDoubleClick={resetSize}
              title="Drag to resize · double-click to reset"
              style={{
                position: "absolute", right: 0, bottom: 0, width: 18, height: 18,
                cursor: "nwse-resize",
                background: "linear-gradient(135deg, transparent 50%, rgba(10,197,168,0.55) 50%, rgba(10,197,168,0.55) 62%, transparent 62%, transparent 72%, rgba(10,197,168,0.35) 72%, rgba(10,197,168,0.35) 84%, transparent 84%)",
                borderBottomRightRadius: 14,
              }}
            />
          )}
        </div>
      )}
    </React.Fragment>
  );
}

function TypingDots() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setN(x => (x+1) % 3), 350);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor", opacity: n === i ? 1 : 0.3, transition: "opacity 200ms" }} />
      ))}
    </span>
  );
}

function DragDots() {
  return (
    <span aria-hidden style={{ display: "inline-grid", gridTemplateColumns: "repeat(2, 3px)", gap: 2, opacity: 0.45, flex: "0 0 auto" }}>
      {[0,1,2,3,4,5].map(i => (
        <span key={i} style={{ width: 3, height: 3, borderRadius: 999, background: "currentColor" }} />
      ))}
    </span>
  );
}

// Customer-support replies for the Help tab.
function supportReply(text) {
  const low = String(text || "").toLowerCase();
  if (/billing|price|cost|refund|charge|stripe|invoice|subscription/.test(low))
    return "Got it — I'll route this to billing. What's the email on the account so we can pull it up?";
  if (/coach|trainer|nutrition|marketplace|find a coach/.test(low))
    return "Tell me your goal and city and I'll point you to the right coach or nutritionist on Shape.";
  if (/app|bug|crash|android|iphone|ios|login|log in|password|account/.test(low))
    return "Sorry about that. Send the device + what's happening and our support team can troubleshoot from there.";
  if (/cancel|delete|close.*account/.test(low))
    return "I can help with that. Confirm the account email and a teammate will follow up to finish it.";
  return "Thanks — a Shape teammate will follow up here and by email shortly. Anything else I can help with?";
}

// Different replies for 1:1 vs group. For group chats, a random member responds.
function pickReply(thread, text) {
  const low = text.toLowerCase();
  if (thread.group) {
    // pull a member name from the thread, excluding "You"
    const members = [...new Set(thread.messages.filter(m => !m.me).map(m => m.who))];
    const who = members.length ? members[Math.floor(Math.random() * members.length)] : "Someone";
    const replies = [
      `Love that. Keep us posted.`,
      `Same here — week 2 and fired up.`,
      `@You big energy. Let's go.`,
      `Bookmarking this thread.`,
      `Respect. That takes consistency.`,
      `Did a similar block last year. Game changer.`,
    ];
    return { who, text: replies[Math.floor(Math.random() * replies.length)] };
  }
  const who = thread.who.split(" ")[0];
  if (low.includes("?")) return { who, text: `Good question — let me pull that up and get back to you in a bit.` };
  if (low.match(/thanks|thank you|appreciate/)) return { who, text: `Anytime. Keep it up.` };
  if (low.match(/sick|hurt|pain|injur/)) return { who, text: `Okay — let's back off today. I'll adjust the plan and message you a swap.` };
  if (low.match(/pr|crushed|nailed|done/)) return { who, text: `Huge. Proud of you. Logging it for the weekly review.` };
  if (low.match(/meal|food|eat|macro/)) return { who, text: `I'll push an updated meal template to your Nutri tab — check in an hour.` };
  if (low.match(/skip|cant|can't|miss/)) return { who, text: `No problem — I'll reshuffle the week. Rest is part of the plan.` };
  const generic = [ `Got it — noted.`, `Sounds good, keep me posted.`, `Copy that. I'll check in Thursday.`, `Nice. Stay with it.` ];
  return { who, text: generic[Math.floor(Math.random() * generic.length)] };
}

Object.assign(window, { ChatWidget });
