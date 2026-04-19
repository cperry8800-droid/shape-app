// Site-wide support chat bubble — reuses the in-app ChatWidget (sidebar + tabs).
// Self-mounts on every page; skips if a real ChatWidget instance is already mounted.

(function () {
  if (window.__supportBubbleMounted) return;

  function mount() {
    if (window.__supportBubbleMounted) return;
    if (window.__openChat) return; // dashboard ChatWidget already mounted
    if (typeof window.ChatWidget !== "function") return;
    if (!window.clientChatTabs) return;
    const host = document.createElement("div");
    host.id = "shape-support-bubble";
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(<ChatWidget tabs={window.clientChatTabs} />);
    window.__supportBubbleMounted = true;
  }

  // Babel-standalone compiles script tags in document order but mount timing
  // varies; poll briefly for ChatWidget to register, then give up.
  const run = () => {
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if (window.__supportBubbleMounted || window.__openChat) { clearInterval(id); return; }
      if (typeof window.ChatWidget === "function" && window.clientChatTabs) { clearInterval(id); mount(); return; }
      if (tries > 40) clearInterval(id); // ~4s
    }, 100);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
