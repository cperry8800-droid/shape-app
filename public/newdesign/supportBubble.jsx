// Site-wide floating support chat bubble.
// Self-mounts into its own DOM node so it can drop onto any page.
// Skips itself if the full in-app ChatWidget is already present (dashboards).

(function () {
  if (window.__supportBubbleMounted) return;

  const SB_TEAL = "#1ec0a8";
  const SB_TEAL_BRIGHT = "#2ee0c4";
  const SB_PAPER = "#1a1612";
  const SB_INK = "#f2ede4";
  const SB_SANS = "'Space Grotesk', 'Inter Tight', sans-serif";
  const SB_MONO = "'JetBrains Mono', monospace";

  function SupportBubble() {
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState("");
    const [messages, setMessages] = React.useState([
      { who: "Shape Support", t: "Hi — got a question about coaches, pricing, or your account? Tell us what's up and a human will reply here or by email.", me: false, time: "now" },
    ]);
    const [typing, setTyping] = React.useState(false);
    const scrollRef = React.useRef(null);

    React.useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, typing, open]);

    const send = (text) => {
      const body = (text || draft).trim();
      if (!body) return;
      const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setMessages(prev => [...prev, { who: "You", t: body, me: true, time: stamp }]);
      setDraft("");
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const reply = pickReply(body);
        const stamp2 = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        setMessages(prev => [...prev, { who: "Shape Support", t: reply, me: false, time: stamp2 }]);
      }, 1200 + Math.random() * 700);
    };

    const quick = (label) => () => send(label);

    return (
      <React.Fragment>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Open support chat"
            style={{
              position: "fixed", right: 24, bottom: 24, zIndex: 2147483000,
              background: SB_TEAL, color: SB_PAPER, border: 0,
              padding: "14px 20px 14px 18px", borderRadius: 999,
              fontFamily: SB_SANS, fontSize: 13.5, fontWeight: 500, letterSpacing: "0.01em",
              cursor: "pointer",
              boxShadow: "0 12px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(30,192,168,0.35)",
              display: "inline-flex", alignItems: "center", gap: 10,
            }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 6.5a4 4 0 0 1 4-4h4a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6.5L3.5 14V8.5a3.5 3.5 0 0 1-1.5-2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            Chat
          </button>
        )}

        {open && (
          <div
            role="dialog"
            aria-label="Support chat"
            style={{
              position: "fixed", right: 24, bottom: 24, zIndex: 2147483000,
              width: 360, maxWidth: "calc(100vw - 32px)",
              height: 520, maxHeight: "calc(100vh - 40px)",
              background: SB_PAPER, color: SB_INK,
              border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14,
              boxShadow: "0 28px 80px rgba(0,0,0,0.6)",
              display: "flex", flexDirection: "column",
              fontFamily: SB_SANS, overflow: "hidden",
            }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: SB_MONO, fontSize: 10, letterSpacing: "0.14em", color: SB_TEAL_BRIGHT }}>SHAPE · SUPPORT</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>How can we help?</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 22, padding: "0 4px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "85%", padding: "9px 13px", borderRadius: 12,
                    background: m.me ? SB_TEAL : "rgba(242,237,228,0.06)",
                    color: m.me ? SB_PAPER : SB_INK,
                    borderTopRightRadius: m.me ? 3 : 12,
                    borderTopLeftRadius: m.me ? 12 : 3,
                    fontSize: 13.5, lineHeight: 1.45,
                  }}>{m.t}</div>
                  <div style={{ fontSize: 10, color: "rgba(242,237,228,0.4)", fontFamily: SB_MONO, marginTop: 4, padding: "0 4px" }}>{m.time}</div>
                </div>
              ))}
              {typing && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(242,237,228,0.5)", fontSize: 12, fontStyle: "italic" }}>
                  <SBTypingDots />typing…
                </div>
              )}
              {messages.length === 1 && !typing && (
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Find a coach", "Pricing", "I'm a trainer", "Account help"].map(q => (
                    <button key={q} onClick={quick(q)} style={{ background: "transparent", border: "1px solid rgba(30,192,168,0.4)", color: SB_TEAL_BRIGHT, padding: "7px 11px", borderRadius: 999, fontFamily: SB_SANS, fontSize: 12, cursor: "pointer" }}>{q}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Message Shape support…"
                rows={1}
                style={{
                  flex: 1, resize: "none", background: "rgba(242,237,228,0.04)", color: SB_INK,
                  border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8,
                  padding: "10px 12px", fontFamily: SB_SANS, fontSize: 13.5, lineHeight: 1.4,
                  outline: "none", minHeight: 38, maxHeight: 100,
                }}
              />
              <button onClick={() => send()} disabled={!draft.trim()}
                style={{
                  background: draft.trim() ? SB_TEAL : "rgba(242,237,228,0.08)",
                  color: draft.trim() ? SB_PAPER : "rgba(242,237,228,0.4)",
                  border: 0, padding: "10px 14px", borderRadius: 8,
                  fontFamily: SB_SANS, fontSize: 13, fontWeight: 500,
                  cursor: draft.trim() ? "pointer" : "not-allowed",
                }}>Send</button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  function SBTypingDots() {
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
      const id = setInterval(() => setN(x => (x + 1) % 3), 350);
      return () => clearInterval(id);
    }, []);
    return (
      <span style={{ display: "inline-flex", gap: 3 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor", opacity: n === i ? 1 : 0.3, transition: "opacity 200ms" }} />
        ))}
      </span>
    );
  }

  function pickReply(text) {
    const low = text.toLowerCase();
    if (low.match(/price|pric|cost|fee|\$|subscri/)) return "Clients browse free. A $5/mo platform fee kicks in when you book a session or subscribe. Coach session rates are set by each coach.";
    if (low.match(/coach|trainer|nutrition|match/)) return "Head to the marketplace to filter by specialty, city, or budget — every coach has a free 15-minute intro call.";
    if (low.match(/refund|cancel|billing/)) return "You can cancel anytime in Settings → Billing. Drop your email and our team will follow up within a business day.";
    if (low.match(/trainer apply|i'?m a trainer|coach apply|join as/)) return "Love that. Apply at /get-started → Trainer. Most approvals come back within 48h after we verify credentials.";
    if (low.match(/account|login|password|sign in/)) return "For account help, share your email here and we'll send a reset link plus a human follow-up.";
    if (low.match(/\?|hi|hello|hey/)) return "Happy to help — give me a sentence or two of context and I'll route you to the right person.";
    return "Got it — a teammate will follow up here and over email shortly. Anything else you want us to know?";
  }

  function mount() {
    if (window.__supportBubbleMounted) return;
    // Avoid double chat UI on pages that already ship the rich in-app ChatWidget.
    if (typeof window.ChatWidget === "function") return;
    const host = document.createElement("div");
    host.id = "shape-support-bubble";
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(<SupportBubble />);
    window.__supportBubbleMounted = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
