(function () {
  if (window.__shapeGlobalChatButtonLoaded) return;
  window.__shapeGlobalChatButtonLoaded = true;

  var ID = "shape-global-chat-button";
  var HIDDEN_CLASS = "shape-global-chat-hidden";

  function currentPage() {
    return (window.location.pathname || "").split("/").pop() || "";
  }

  function appHref(file) {
    return window.location.pathname.indexOf("/newdesign/") >= 0 ? file : "/newdesign/" + file;
  }

  function chatHref() {
    var page = currentPage().toLowerCase();
    if (page.indexOf("trainer") === 0) return appHref("TrainerMessages.html");
    if (page.indexOf("nutritionist") === 0) return appHref("NutritionistMessages.html");
    if (page.indexOf("client") === 0) return appHref("ClientCommunity.html");
    return appHref("ClientCommunity.html");
  }

  function unreadCount() {
    try {
      if (!window.clientChatTabs) return 24;
      return window.clientChatTabs.reduce(function (total, tab) {
        return total + (tab.threads || []).reduce(function (sum, thread) {
          return sum + (Number(thread.unread) || 0);
        }, 0);
      }, 0);
    } catch (err) {
      return 24;
    }
  }

  function nativeWidgetExists() {
    return Boolean(document.querySelector(".chw-bubble, [data-chat-panel], #shape-support-bubble"));
  }

  function injectStyles() {
    if (document.getElementById("shape-global-chat-style")) return;
    var style = document.createElement("style");
    style.id = "shape-global-chat-style";
    style.textContent = [
      "#shape-global-chat-button{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:inline-flex;align-items:center;gap:12px;padding:17px 24px 17px 21px;border:0;border-radius:999px;background:#1ec0a8;color:#1a1612;font-family:'Space Grotesk',Inter,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:.01em;text-decoration:none;box-shadow:0 18px 44px rgba(0,0,0,.38),0 4px 14px rgba(30,192,168,.35);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .16s ease,box-shadow .16s ease,opacity .16s ease}",
      "#shape-global-chat-button:hover{transform:translateY(-2px);box-shadow:0 22px 52px rgba(0,0,0,.44),0 5px 18px rgba(30,192,168,.42)}",
      "#shape-global-chat-button:focus-visible{outline:3px solid rgba(242,237,228,.8);outline-offset:4px}",
      "#shape-global-chat-button svg{width:19px;height:19px;flex:none}",
      "#shape-global-chat-button .shape-global-chat-count{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:24px;padding:0 8px;border-radius:999px;background:#1a1612;color:#1ec0a8;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;font-weight:700;line-height:1}",
      "#shape-global-chat-button." + HIDDEN_CLASS + "{opacity:0;pointer-events:none;transform:translateY(8px)}",
      "@media (max-width:640px){#shape-global-chat-button{right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));padding:14px 19px 14px 16px;font-size:14px;gap:10px}#shape-global-chat-button .shape-global-chat-count{min-width:25px;height:22px;font-size:11px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function syncVisibility(button) {
    if (!button) return;
    button.classList.toggle(HIDDEN_CLASS, nativeWidgetExists());
  }

  function mount() {
    if (document.getElementById(ID)) return;
    injectStyles();

    var button = document.createElement("button");
    button.id = ID;
    button.type = "button";
    button.setAttribute("aria-label", "Open Shape chat");
    button.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">',
      '<path d="M2 6.5a4 4 0 0 1 4-4h4a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6.5L3.5 14V8.5a3.5 3.5 0 0 1-1.5-2Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>',
      "</svg>",
      "<span>Chat</span>",
      '<span class="shape-global-chat-count">' + unreadCount() + "</span>"
    ].join("");

    button.addEventListener("click", function () {
      if (typeof window.__openChat === "function") {
        window.__openChat();
        return;
      }
      window.location.href = chatHref();
    });

    document.body.appendChild(button);
    syncVisibility(button);

    var observer = new MutationObserver(function () {
      syncVisibility(button);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("pageshow", function () { syncVisibility(button); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
