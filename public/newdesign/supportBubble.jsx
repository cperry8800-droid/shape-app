// Site-wide support chat bubble — reuses the in-app ChatWidget (sidebar + tabs).
// Self-mounts on every page; skips if a real ChatWidget instance is already mounted.

(function () {
  if (window.__supportBubbleMounted) return;

  const SUPPORT_TABS = [
    {
      id: "help",
      label: "Help",
      eyebrow: "SHAPE SUPPORT",
      title: "How can we help?",
      threads: [
        { who: "Shape Team", role: "General support · replies ~2m", last: "Hi — what can we help you with?", time: "now", unread: 0, messages: [
          { who: "Shape", t: "Hi — welcome to Shape. Ask about matching, the app, anything. A human picks this up.", time: "now", me: false },
        ]},
        { who: "Billing", role: "Plans + refunds", last: "Happy to walk you through the fees.", time: "now", unread: 0, messages: [
          { who: "Billing", t: "Clients browse free. $5/mo platform fee kicks in when you book or subscribe. Session rates set by each coach.", time: "now", me: false },
        ]},
        { who: "Technical", role: "App + device sync", last: "Wearables sync issues? Send your device model.", time: "now", unread: 0, messages: [
          { who: "Technical", t: "Wearables sync issues? Tell me your device (Garmin/Whoop/Apple) and we'll fix it.", time: "now", me: false },
        ]},
      ],
    },
    {
      id: "coaches",
      label: "Coaches",
      eyebrow: "JOIN SHAPE",
      title: "For trainers + nutritionists",
      threads: [
        { who: "Coach Onboarding", role: "Apps reviewed in 48h", last: "Tell us about your practice.", time: "now", unread: 0, messages: [
          { who: "Onboarding", t: "Interested in coaching on Shape? We verify certs and reply in 48h. What's your specialty?", time: "now", me: false },
        ]},
        { who: "Trainer Success", role: "For active coaches", last: "Need help with payouts, programming, or clients?", time: "now", unread: 0, messages: [
          { who: "Success", t: "Already on Shape? Here for payout, programming, and client growth questions.", time: "now", me: false },
        ]},
      ],
    },
    {
      id: "community",
      label: "Community",
      eyebrow: "SHAPE COMMUNITY",
      title: "Public channels",
      threads: [
        { who: "# getting-started", group: true, role: "812 members · start here", last: "Nina O: welcome everyone — drop your goals below.", time: "4m", unread: 0, messages: [
          { who: "Nina O.", t: "Welcome everyone — drop your goals below.", time: "4m", me: false },
          { who: "Devon W.", t: "Cut to 180 by June. Let's go.", time: "3m", me: false },
          { who: "Priya S.", t: "Hybrid block starting Monday.", time: "2m", me: false },
        ]},
        { who: "# find-a-coach", group: true, role: "624 members · coach recs", last: "Ava K: looking for a marathon coach in NYC.", time: "22m", unread: 0, messages: [
          { who: "Ava K.", t: "Looking for a marathon coach in NYC — anyone used Diego?", time: "22m", me: false },
          { who: "Marcus J.", t: "Diego is great. Did his 16-week block last spring. DM me.", time: "18m", me: false },
        ]},
        { who: "# success-stories", group: true, role: "1.2k members · wins + PRs", last: "Tomás R: 225 for 3. Took me 18 months.", time: "1h", unread: 0, messages: [
          { who: "Tomás R.", t: "225 for 3. Took me 18 months on Shape. Maya's programming is unreal.", time: "1h", me: false },
        ]},
      ],
    },
  ];

  function mount() {
    if (window.__supportBubbleMounted) return;
    if (window.__openChat) return; // dashboard ChatWidget already mounted
    if (typeof window.ChatWidget !== "function") return; // chatWidget.jsx not loaded
    const host = document.createElement("div");
    host.id = "shape-support-bubble";
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(<ChatWidget tabs={SUPPORT_TABS} />);
    window.__supportBubbleMounted = true;
  }

  // Babel-standalone compiles script tags in document order but mount timing
  // varies; poll briefly for ChatWidget to register, then give up.
  const run = () => {
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if (window.__supportBubbleMounted || window.__openChat) { clearInterval(id); return; }
      if (typeof window.ChatWidget === "function") { clearInterval(id); mount(); return; }
      if (tries > 40) clearInterval(id); // ~4s
    }, 100);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
