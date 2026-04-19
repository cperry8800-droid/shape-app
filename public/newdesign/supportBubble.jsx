// Site-wide floating support chat bubble with tabs.
// Self-mounts into its own DOM node so it can drop onto any page.
// Skips itself if the full in-app ChatWidget is already mounted (dashboards).

(function () {
  if (window.__supportBubbleMounted) return;

  const SB_TEAL = "#1ec0a8";
  const SB_TEAL_BRIGHT = "#2ee0c4";
  const SB_PAPER = "#1a1612";
  const SB_INK = "#f2ede4";
  const SB_SANS = "'Space Grotesk', 'Inter Tight', sans-serif";
  const SB_SERIF = "'Fraunces', 'Instrument Serif', serif";
  const SB_MONO = "'JetBrains Mono', monospace";

  const SUPPORT_TABS = [
    {
      id: "support",
      label: "Support",
      eyebrow: "GENERAL SUPPORT",
      title: "How can we help?",
      threads: [
        { who: "Shape Team", role: "Replies in ~2 min", last: "Hi — what can we help you with?", time: "now", unread: 0, messages: [
          { who: "Shape Team", t: "Hi — welcome to Shape. Got a question about coaches, pricing, or your account? Drop it here and a human will reply.", time: "now", me: false },
        ]},
      ],
      quick: ["Find a coach", "How does matching work?", "Account help"],
    },
    {
      id: "pricing",
      label: "Pricing",
      eyebrow: "PLANS + BILLING",
      title: "Pricing questions",
      threads: [
        { who: "Shape Sales", role: "Pricing + plans", last: "Happy to walk you through the options.", time: "now", unread: 0, messages: [
          { who: "Shape Sales", t: "Clients browse free. A $5/mo platform fee kicks in when you book a session or subscribe. Session rates are set by each coach. Want a breakdown for a specific plan?", time: "now", me: false },
        ]},
      ],
      quick: ["Compare plans", "Trainer fees", "Refunds"],
    },
    {
      id: "coaches",
      label: "Coaches",
      eyebrow: "JOIN AS A COACH",
      title: "For trainers + nutritionists",
      threads: [
        { who: "Coach Onboarding", role: "Apps reviewed in 48h", last: "Tell us about your practice.", time: "now", unread: 0, messages: [
          { who: "Coach Onboarding", t: "Interested in coaching on Shape? We verify certifications (NASM/ACE/NSCA/RD) and you'll hear back in 48h. What's your specialty?", time: "now", me: false },
        ]},
      ],
      quick: ["Apply now", "Certifications", "Trainer payout"],
    },
  ];

  function SupportBubble() {
    const [open, setOpen] = React.useState(false);
    const [tabIdx, setTabIdx] = React.useState(0);
    const [threadsByTab, setThreadsByTab] = React.useState(() => SUPPORT_TABS.map(t => t.threads));
    const [draftByTab, setDraftByTab] = React.useState(() => SUPPORT_TABS.map(() => ""));
    const [typing, setTyping] = React.useState(false);
    const scrollRef = React.useRef(null);

    const tab = SUPPORT_TABS[tabIdx];
    const thread = threadsByTab[tabIdx][0];
    const draft = draftByTab[tabIdx];
    const totalUnread = threadsByTab.reduce((s, ts) => s + ts.reduce((a, t) => a + (t.unread || 0), 0), 0);

    React.useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [tabIdx, thread?.messages?.length, typing, open]);

    const setDraft = (v) => setDraftByTab(prev => prev.map((d, i) => i === tabIdx ? v : d));

    const send = (text) => {
      const body = (text || draft).trim();
      if (!body) return;
      const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setThreadsByTab(prev => prev.map((ts, ti) => {
        if (ti !== tabIdx) return ts;
        return ts.map((t, i) => i !== 0 ? t : {
          ...t, last: `You: ${body}`, time: "now", unread: 0,
          messages: [...t.messages, { who: "You", t: body, time: stamp, me: true }],
        });
      }));
      setDraft("");
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const reply = pickReply(tab.id, body);
        const stamp2 = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        setThreadsByTab(prev => prev.map((ts, ti) => {
          if (ti !== tabIdx) return ts;
          return ts.map((t, i) => i !== 0 ? t : {
            ...t, last: `${t.who}: ${reply}`, time: "now",
            messages: [...t.messages, { who: t.who, t: reply, time: stamp2, me: false }],
          });
        }));
      }, 1200 + Math.random() * 700);
    };

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
            {totalUnread > 0 && (
              <span style={{ background: SB_PAPER, color: SB_TEAL, fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999, fontFamily: SB_MONO }}>{totalUnread}</span>
            )}
          </button>
        )}

        {open && (
          <div
            role="dialog"
            aria-label="Support chat"
            style={{
              position: "fixed", right: 24, bottom: 24, zIndex: 2147483000,
              width: 380, maxWidth: "calc(100vw - 32px)",
              height: 560, maxHeight: "calc(100vh - 40px)",
              background: SB_PAPER, color: SB_INK,
              border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14,
              boxShadow: "0 28px 80px rgba(0,0,0,0.6)",
              display: "flex", flexDirection: "column",
              fontFamily: SB_SANS, overflow: "hidden",
            }}>
            {/* Header */}
            <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(242,237,228,0.06)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: SB_MONO, fontSize: 10, letterSpacing: "0.14em", color: SB_TEAL_BRIGHT, marginBottom: 3 }}>{tab.eyebrow}</div>
                <div style={{ fontFamily: SB_SERIF, fontSize: 18, letterSpacing: "-0.015em" }}>{tab.title}</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 22, padding: "0 4px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
              {SUPPORT_TABS.map((t, i) => {
                const active = i === tabIdx;
                const unread = threadsByTab[i].reduce((a, x) => a + (x.unread || 0), 0);
                return (
                  <button key={t.id} onClick={() => setTabIdx(i)}
                    style={{
                      flex: 1, padding: "10px 8px", border: 0, background: "transparent",
                      color: active ? SB_INK : "rgba(242,237,228,0.55)",
                      fontFamily: SB_SANS, fontSize: 12, fontWeight: active ? 500 : 400,
                      cursor: "pointer",
                      borderBottom: active ? `2px solid ${SB_TEAL}` : "2px solid transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}>
                    {t.label}
                    {unread > 0 && <span style={{ background: SB_TEAL, color: SB_PAPER, fontSize: 9.5, fontFamily: SB_MONO, padding: "1px 5px", borderRadius: 999 }}>{unread}</span>}
                  </button>
                );
              })}
            </div>

            {/* Thread header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(242,237,228,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: "rgba(30,192,168,0.18)", color: SB_TEAL_BRIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SB_MONO, fontSize: 11, fontWeight: 600 }}>
                {thread.who.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{thread.who}</div>
                <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 1 }}>{thread.role}</div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {thread.messages.map((m, i) => (
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
                  <SBTypingDots />{thread.who} is typing…
                </div>
              )}
              {thread.messages.length === 1 && !typing && tab.quick && (
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tab.quick.map(q => (
                    <button key={q} onClick={() => send(q)} style={{ background: "transparent", border: "1px solid rgba(30,192,168,0.4)", color: SB_TEAL_BRIGHT, padding: "7px 11px", borderRadius: 999, fontFamily: SB_SANS, fontSize: 12, cursor: "pointer" }}>{q}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message ${thread.who}…`}
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

  function pickReply(tabId, text) {
    const low = text.toLowerCase();
    if (tabId === "pricing") {
      if (low.match(/compare|plan/)) return "Members: $5/mo platform fee once you book. Trainers: 10% of session revenue, no monthly. Full breakdown on the Pricing page.";
      if (low.match(/refund|cancel/)) return "Cancel anytime in Settings → Billing. Full refund within 14 days of your first subscription charge.";
      if (low.match(/trainer|coach|fee/)) return "Trainers keep 90% of their session rate. No monthly fee. Payouts weekly via Stripe.";
      return "I'll pull up a detailed quote — what role (member or coach) and which plan are you considering?";
    }
    if (tabId === "coaches") {
      if (low.match(/apply|signup|start/)) return "Great — head to /get-started and pick the Trainer or Nutritionist path. Most apps reviewed in 48h.";
      if (low.match(/cert|nasm|ace|rd|credential/)) return "Trainers: NASM / ACE / NSCA / ACSM. Nutritionists: RD / RDN or country-equivalent license. We verify at application and re-check annually.";
      if (low.match(/payout|pay|rate|earn/)) return "You set your rate. Shape takes 10%. Payouts land weekly via Stripe Connect.";
      return "Happy to help — are you applying as a trainer or nutritionist? And where are you based?";
    }
    // support
    if (low.match(/coach|match|find/)) return "Head to the marketplace — filter by specialty, city, or budget. Every coach offers a free 15-min intro call.";
    if (low.match(/match|how does|work/)) return "Six questions: goals, schedule, injuries, diet, budget, vibe. We rank a shortlist of vetted coaches — book a free intro, pick one, done.";
    if (low.match(/account|login|password|reset/)) return "For account help drop your email here — we'll send a reset link and a human follow-up within a business day.";
    if (low.match(/\?|hi|hello|hey/)) return "Happy to help — give me a sentence of context and I'll route you to the right person.";
    return "Got it — a teammate will follow up here and over email shortly. Anything else you want us to know?";
  }

  function mount() {
    if (window.__supportBubbleMounted) return;
    // Avoid double chat UI on pages that already ship the rich in-app ChatWidget.
    if (window.__openChat) return;
    const host = document.createElement("div");
    host.id = "shape-support-bubble";
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(<SupportBubble />);
    window.__supportBubbleMounted = true;
  }

  // Wait a tick so chatWidget.jsx has a chance to register window.__openChat on dashboard pages.
  const run = () => setTimeout(mount, 50);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
