// The coach Messages pages, live (TrainerMessages.html, NutritionistMessages.html; P7, owner 2026-11-05:
// "the website and app need to fully communicate").
//
// The two pages read the inbox once at mount and never again, showed no unread, never marked a thread
// read (so a client's message read here kept its badge in the app), and treated a failed send as sent:
// the message stayed on screen with no res.ok check and `.catch(() => {})`. Now:
//   · coachInboxSend: a send is sent only when the route says so; the page takes the message back and
//     says so otherwise, keeping the words to try again;
//   · useCoachInboxLive: the unread counts from dm_unread() (the app's), new messages over realtime
//     (a thread the inbox doesn't have yet reloads it), and the open thread read by the app's own rule
//     (chatRead.mjs, the same one the chat bubble and the app use).
// Classic script (the pages' babel scripts share globals); the read rule is imported at run time.

// The read rule, loaded once (the chat bubble's loader when it is on the page, else its own import).
function ciChatRead() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!window.__shapeChatRead) window.__shapeChatRead = import("/newdesign/chatRead.mjs").catch(() => null);
  return window.__shapeChatRead;
}

// Send one message through the coach's Messages route. Resolves { ok: true, message } only when it was
// stored; { ok: false, error } otherwise (the route's words when it gave any).
async function coachInboxSend(role, conversationId, text) {
  try {
    const res = await fetch("/api/" + role + "/messages", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: text }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d && d.ok && d.message) return { ok: true, message: d.message };
    return { ok: false, error: (d && (d.message || d.error)) || null };
  } catch (e) {
    return { ok: false, error: null };
  }
}

// The live layer over a page's threads. `live` is true once the route answered for this coach;
// `threads` and `setThreads` the page's state; `selectedId` the open thread; `reload()` reads the inbox
// again. Each thread gets `unread`. Answers nothing; it works through setThreads.
function useCoachInboxLive({ live, threads, setThreads, selectedId, reload }) {
  const readRef = React.useRef(null);
  const meRef = React.useRef(null);
  const selRef = React.useRef(selectedId);
  selRef.current = selectedId;
  // The threads as last drawn: whether a message is for a thread the inbox has is read here, not inside
  // a state update React may run later.
  const threadsRef = React.useRef(threads || []);
  threadsRef.current = threads || [];
  const reloadRef = React.useRef(reload);
  reloadRef.current = reload;
  const [ready, setReady] = React.useState(0);
  React.useEffect(() => {
    if (!live) return undefined;
    let on = true;
    let ch = null;
    let db = null;
    (async () => {
      const sdb = (window.shapeEnsureDb ? await window.shapeEnsureDb().catch(() => null) : null) || window.shapeDb;
      db = sdb && sdb.client;
      if (!on || !db) return;
      try { if (sdb.getSession) await sdb.getSession(); } catch (e) { /* read the user anyway */ }
      let me = null;
      try { const { data } = await db.auth.getUser(); me = data && data.user && data.user.id; } catch (e) {}
      const CR = await ciChatRead();
      if (!on || !me || !CR) return;
      meRef.current = me;
      // The counts the app shows. A failed read leaves them unset (no badge), never invented.
      try {
        const ur = await db.rpc("dm_unread");
        if (on && ur && !ur.error) {
          const counts = CR.unreadByConversation(ur.data);
          setThreads((prev) => prev.map((t) => ({ ...t, unread: t.id === selRef.current ? 0 : (counts[t.id] || 0) })));
        }
      } catch (e) {}
      if (!on) return;
      readRef.current = CR.createReadTracker({
        isHidden: () => document.visibilityState === "hidden",
        mark: (id) => {
          setThreads((prev) => prev.map((t) => (t.id === id && t.unread ? { ...t, unread: 0 } : t)));
          return Promise.resolve(db.rpc("mark_conversation_read", { p_conversation_id: id })).catch(() => null);
        },
      });
      setReady((n) => n + 1);
      try {
        ch = db.channel("coach-inbox:" + me + ":" + Math.random().toString(36).slice(2, 8))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
            const row = payload && payload.new;
            if (!row || typeof row.conversation_id !== "string") return;
            const mine = row.sender_id === me;
            const openId = selRef.current;
            const hidden = document.visibilityState === "hidden";
            const known = threadsRef.current.some((t) => t.id === row.conversation_id);
            // A thread the inbox doesn't have (a new client wrote first): read the inbox again.
            if (!known) { if (!mine && reloadRef.current) reloadRef.current(); return; }
            setThreads((prev) => {
              return prev.map((t) => {
                if (t.id !== row.conversation_id) return t;
                const has = (t.messages || []).some((m) => m.id === row.id);
                // A message this page sent is already on screen under the id the route answered.
                const messages = has ? t.messages : [...(t.messages || []), {
                  id: row.id, body: String(row.body || ""), mine, createdAt: row.created_at,
                  ...(!row.sender_id && row.metadata && row.metadata.shape === "welcome" ? { shape: true } : {}),
                }];
                const counts = CR.unreadAfterInsert({ [t.id]: t.unread || 0 }, row, { myId: me, openId, hidden });
                return { ...t, messages, lastMessage: String(row.body || ""), lastMessageAt: row.created_at, unread: counts[t.id] || 0 };
              }).sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
            });
            if (readRef.current) readRef.current.arrived(row, me);
          })
          .subscribe();
      } catch (e) { ch = null; }
    })();
    return () => {
      on = false;
      if (ch && db) { try { db.removeChannel(ch); } catch (e) {} }
    };
  }, [live]);
  // The open thread is read while it is open and in view, and once it is back in view.
  React.useEffect(() => {
    const tr = readRef.current;
    if (!tr) return;
    if (selectedId) tr.open(selectedId); else tr.close();
  }, [selectedId, ready]);
  React.useEffect(() => {
    const onVis = () => { const tr = readRef.current; if (tr && document.visibilityState !== "hidden") tr.shown(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
}

Object.assign(window, { coachInboxSend, useCoachInboxLive });
