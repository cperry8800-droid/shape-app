// Reusable floating chat widget with optional tabs.
// Drop into any dashboard page:
//   <ChatWidget tabs={[{id, label, eyebrow, title, threads}, ...]} />
//   or legacy:  <ChatWidget threads={[...]} title="..." eyebrow="..." />

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

  const [open, setOpen] = React.useState(false);
  const [tabIdx, setTabIdx] = React.useState(0);
  // threadsByTab: array of arrays of threads (mutable copy)
  const [threadsByTab, setThreadsByTab] = React.useState(() => tabs.map(t => t.threads));
  const [activeByTab, setActiveByTab] = React.useState(() => tabs.map(() => 0));
  const [draftByTab, setDraftByTab] = React.useState(() => tabs.map(() => ""));
  const [typing, setTyping] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
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
  const BUBBLE_POS_KEY = "shape.chatWidget.bubblePos";
  const SIZE_KEY = "shape.chatWidget.size";
  const DEFAULT_SIZE = { w: 960, h: 720 };
  const [pos, setPos] = React.useState(() => {
    try { const s = localStorage.getItem(POS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [bubblePos, setBubblePos] = React.useState(() => {
    try { const s = localStorage.getItem(BUBBLE_POS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [size, setSize] = React.useState(() => {
    try { const s = localStorage.getItem(SIZE_KEY); return s ? JSON.parse(s) : DEFAULT_SIZE; } catch { return DEFAULT_SIZE; }
  });
  const dragRef = React.useRef(null);
  const bubbleDragRef = React.useRef(null);
  const resizeRef = React.useRef(null);

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
    const x = Math.max(8, Math.min(window.innerWidth  - d.w - 8, e.clientX - d.offX));
    const y = Math.max(8, Math.min(window.innerHeight - d.h - 8, e.clientY - d.offY));
    setPos({ x, y });
  };
  const endDrag = () => {
    dragRef.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
    setPos(p => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} } return p; });
  };
  const resetPos = () => { setPos(null); try { localStorage.removeItem(POS_KEY); } catch {} };

  const startBubbleDrag = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    bubbleDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top,
      w: rect.width, h: rect.height, moved: false,
    };
    window.addEventListener("mousemove", onBubbleDrag);
    window.addEventListener("mouseup", endBubbleDrag);
  };
  const onBubbleDrag = (e) => {
    const d = bubbleDragRef.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
    if (!d.moved) return;
    document.body.style.userSelect = "none";
    const x = Math.max(8, Math.min(window.innerWidth  - d.w - 8, e.clientX - d.offX));
    const y = Math.max(8, Math.min(window.innerHeight - d.h - 8, e.clientY - d.offY));
    setBubblePos({ x, y });
  };
  const endBubbleDrag = (e) => {
    const d = bubbleDragRef.current;
    bubbleDragRef.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onBubbleDrag);
    window.removeEventListener("mouseup", endBubbleDrag);
    if (d && d.moved) {
      e.preventDefault(); e.stopPropagation();
      setBubblePos(p => { if (p) { try { localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(p)); } catch {} } return p; });
    }
  };

  // Global opener: window.__openChat(whoName, tabId?) ---------------------
  React.useEffect(() => {
    window.__openChat = (who, tabId) => {
      setOpen(true);
      if (tabId) {
        const ti = tabs.findIndex(t => t.id === tabId);
        if (ti >= 0) setTabIdx(ti);
      }
      if (who) {
        // search current tab first, then all tabs
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
      }
    };
    return () => { delete window.__openChat; };
  }, [threadsByTab, tabs]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [tabIdx, activeIdx, active?.messages?.length, typing, open]);

  const setDraft = (v) => setDraftByTab(prev => prev.map((d, i) => i === tabIdx ? v : d));

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setThreadsByTab(prev => prev.map((ts, ti) => {
      if (ti !== tabIdx) return ts;
      return ts.map((t, i) => {
        if (i !== activeIdx) return t;
        return { ...t, last: `You: ${text}`, time: "now", unread: 0, messages: [...t.messages, { who: "You", t: text, time: stamp, me: true }] };
      });
    }));
    setDraft("");
    setTyping(true);
    const replyDelay = 1200 + Math.random() * 900;
    setTimeout(() => {
      setTyping(false);
      setThreadsByTab(prev => prev.map((ts, ti) => {
        if (ti !== tabIdx) return ts;
        return ts.map((t, i) => {
          if (i !== activeIdx) return t;
          const { who, text: reply } = pickReply(t, text);
          const stamp2 = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          return { ...t, last: `${who}: ${reply}`, time: "now", messages: [...t.messages, { who, t: reply, time: stamp2, me: false }] };
        });
      }));
    }, replyDelay);
  };

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
      `}</style>
      {!open && (
        <button
          onMouseDown={startBubbleDrag}
          onClick={() => { if (bubbleDragRef.current && bubbleDragRef.current.moved) return; setOpen(true); }}
          style={{
            position: "fixed",
            ...(bubblePos ? { left: bubblePos.x, top: bubblePos.y } : { right: 28, bottom: 28 }),
            zIndex: 180,
            background: TEAL, color: PAPER, border: 0,
            padding: "14px 20px 14px 18px", borderRadius: 999,
            fontFamily: sans, fontSize: 13.5, fontWeight: 500, letterSpacing: "0.01em",
            cursor: "grab", boxShadow: "0 12px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(30,192,168,0.35)",
            display: "inline-flex", alignItems: "center", gap: 10,
          }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 6.5a4 4 0 0 1 4-4h4a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6.5L3.5 14V8.5a3.5 3.5 0 0 1-1.5-2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          Chat
          {totalUnread > 0 && (
            <span style={{ background: PAPER, color: TEAL, fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace" }}>{totalUnread}</span>
          )}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          data-chat-panel
          style={{
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
              background: "linear-gradient(180deg, rgba(30,192,168,0.06), rgba(30,192,168,0))",
              borderBottom: "1px solid rgba(242,237,228,0.06)",
              cursor: "grab", userSelect: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ color: "rgba(242,237,228,0.35)", display: "inline-flex", alignItems: "center" }}><DragDots /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, marginBottom: 2 }}>SHAPE</div>
                <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.05, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Shape chat</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
              {pos && (
                <button onClick={resetPos} title="Reset position" style={{ background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>RESET</button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 22, padding: "2px 10px", cursor: "pointer", lineHeight: 1 }}>×</button>
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
                      flex: 1, padding: "12px 10px", border: 0, background: isActive ? "rgba(30,192,168,0.08)" : "transparent",
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
                    padding: "12px 18px", border: 0, background: origIdx === activeIdx ? "rgba(30,192,168,0.10)" : "transparent",
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
                      {t.pinned && <span style={{ flex: "none", fontSize: 8.5, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", background: "rgba(30,192,168,0.12)", padding: "1px 5px", borderRadius: 3 }}>PINNED</span>}
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
                <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(242,237,228,0.08)", background: "rgba(30,192,168,0.04)" }}>
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
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {pos && (
                  <button onClick={resetPos} title="Reset position" style={{ background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>RESET</button>
                )}
                <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 20, padding: "2px 6px", cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {active?.messages?.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start" }}>
                  {!m.me && active?.group && (
                    <div style={{ fontSize: 10.5, color: m.coach ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em", marginBottom: 3, padding: "0 4px" }}>
                      {m.who}{m.coach ? " · COACH" : ""}
                    </div>
                  )}
                  <div style={{
                    maxWidth: "78%", padding: "9px 13px", borderRadius: 12,
                    background: m.me ? TEAL : "rgba(242,237,228,0.06)",
                    color: m.me ? PAPER : INK,
                    borderTopRightRadius: m.me ? 3 : 12,
                    borderTopLeftRadius: m.me ? 12 : 3,
                    fontSize: 13.5, lineHeight: 1.45,
                  }}>{m.t}</div>
                  <div style={{ fontSize: 10, color: "rgba(242,237,228,0.4)", fontFamily: "'JetBrains Mono', monospace", marginTop: 4, padding: "0 4px" }}>{m.time}</div>
                </div>
              ))}
              {typing && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(242,237,228,0.5)", fontSize: 12, fontStyle: "italic" }}>
                  <TypingDots />someone is typing…
                </div>
              )}
            </div>

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
          </div>
          </div>
          {/* Resize handle (bottom-right corner) */}
          <div
            onMouseDown={startResize}
            onDoubleClick={resetSize}
            title="Drag to resize · double-click to reset"
            style={{
              position: "absolute", right: 0, bottom: 0, width: 18, height: 18,
              cursor: "nwse-resize",
              background: "linear-gradient(135deg, transparent 50%, rgba(30,192,168,0.55) 50%, rgba(30,192,168,0.55) 62%, transparent 62%, transparent 72%, rgba(30,192,168,0.35) 72%, rgba(30,192,168,0.35) 84%, transparent 84%)",
              borderBottomRightRadius: 14,
            }}
          />
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
