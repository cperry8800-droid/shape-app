(function () {
  if (window.__shapeGlobalChatButtonLoaded) return;
  window.__shapeGlobalChatButtonLoaded = true;

  var ID = "shape-global-chat-button";
  var PANEL_ID = "shape-global-chat-panel";
  var HIDDEN_CLASS = "shape-global-chat-hidden";

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
      "#shape-global-chat-panel{position:fixed;right:24px;bottom:92px;z-index:2147483000;width:390px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 116px);display:none;flex-direction:column;overflow:hidden;border-radius:18px;border:1px solid rgba(242,237,228,.14);background:#1a1612;color:#f2ede4;box-shadow:0 28px 80px rgba(0,0,0,.62);font-family:'Space Grotesk',Inter,Arial,sans-serif}",
      "#shape-global-chat-panel.open{display:flex}",
      "#shape-global-chat-panel .sgc-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid rgba(242,237,228,.09);background:linear-gradient(180deg,rgba(30,192,168,.08),rgba(30,192,168,0))}",
      "#shape-global-chat-panel .sgc-kicker{font-family:'JetBrains Mono',Consolas,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#2ee0c4;margin-bottom:3px}",
      "#shape-global-chat-panel .sgc-title{font-size:18px;font-weight:700;line-height:1.1}",
      "#shape-global-chat-panel .sgc-close{border:0;background:transparent;color:rgba(242,237,228,.64);font-size:24px;line-height:1;cursor:pointer;padding:2px 6px}",
      "#shape-global-chat-panel .sgc-body{flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}",
      "#shape-global-chat-panel .sgc-msg{max-width:84%;padding:10px 13px;border-radius:14px;background:rgba(242,237,228,.07);font-size:13.5px;line-height:1.42}",
      "#shape-global-chat-panel .sgc-msg.me{align-self:flex-end;background:#1ec0a8;color:#1a1612;border-top-right-radius:4px}",
      "#shape-global-chat-panel .sgc-msg.them{align-self:flex-start;border-top-left-radius:4px}",
      "#shape-global-chat-panel .sgc-time{font-family:'JetBrains Mono',Consolas,monospace;font-size:9px;letter-spacing:.1em;color:rgba(242,237,228,.36);margin-top:-5px}",
      "#shape-global-chat-panel .sgc-quick{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}",
      "#shape-global-chat-panel .sgc-quick button{border:1px solid rgba(30,192,168,.42);background:transparent;color:#2ee0c4;border-radius:999px;padding:7px 11px;font:600 12px 'Space Grotesk',Inter,Arial,sans-serif;cursor:pointer}",
      "#shape-global-chat-panel .sgc-compose{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(242,237,228,.09)}",
      "#shape-global-chat-panel textarea{flex:1;min-height:40px;max-height:110px;resize:none;border:1px solid rgba(242,237,228,.12);border-radius:12px;background:rgba(242,237,228,.045);color:#f2ede4;padding:11px 12px;font:13.5px 'Space Grotesk',Inter,Arial,sans-serif;outline:none}",
      "#shape-global-chat-panel .sgc-send{border:0;border-radius:999px;background:#f2ede4;color:#1a1612;padding:0 16px;font:700 13px 'Space Grotesk',Inter,Arial,sans-serif;cursor:pointer}",
      "#shape-global-chat-panel .sgc-send:disabled{opacity:.45;cursor:not-allowed}",
      "@media (max-width:640px){#shape-global-chat-button{right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));padding:14px 19px 14px 16px;font-size:14px;gap:10px}#shape-global-chat-button .shape-global-chat-count{min-width:25px;height:22px;font-size:11px}#shape-global-chat-panel{right:16px;bottom:82px;width:calc(100vw - 32px);height:min(560px,calc(100vh - 104px));max-height:calc(100vh - 104px)}}"
    ].join("");
    document.head.appendChild(style);
  }

  function panel() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) return existing;

    var node = document.createElement("section");
    node.id = PANEL_ID;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-label", "Shape chat");
    node.innerHTML = [
      '<div class="sgc-head">',
      '<div><div class="sgc-kicker">Shape chat</div><div class="sgc-title">How can we help?</div></div>',
      '<button class="sgc-close" type="button" aria-label="Close chat">&times;</button>',
      "</div>",
      '<div class="sgc-body">',
      '<div class="sgc-msg them">Welcome to Shape. Send a question about coaches, billing, the app, or your account.</div>',
      '<div class="sgc-time">SHAPE · NOW</div>',
      '<div class="sgc-quick">',
      '<button type="button" data-sgc-quick="Find a coach">Find a coach</button>',
      '<button type="button" data-sgc-quick="Billing help">Billing help</button>',
      '<button type="button" data-sgc-quick="App support">App support</button>',
      "</div>",
      "</div>",
      '<div class="sgc-compose">',
      '<textarea rows="1" placeholder="Message Shape..."></textarea>',
      '<button class="sgc-send" type="button" disabled>Send</button>',
      "</div>"
    ].join("");

    var body = node.querySelector(".sgc-body");
    var input = node.querySelector("textarea");
    var send = node.querySelector(".sgc-send");

    function stamp() {
      return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    function append(text, mine) {
      var msg = document.createElement("div");
      msg.className = "sgc-msg " + (mine ? "me" : "them");
      msg.textContent = text;
      var time = document.createElement("div");
      time.className = "sgc-time";
      time.textContent = (mine ? "YOU" : "SHAPE") + " · " + stamp();
      body.appendChild(msg);
      body.appendChild(time);
      body.scrollTop = body.scrollHeight;
    }

    function reply(text) {
      var low = String(text || "").toLowerCase();
      if (/billing|price|cost|refund|stripe/.test(low)) return "Got it. Send the email on the account and we will route this to billing.";
      if (/coach|trainer|nutrition|marketplace/.test(low)) return "Send what you are looking for and we can point you to the right coach or nutritionist.";
      if (/app|bug|android|iphone|login|account/.test(low)) return "Send the device and issue. Support can use that to troubleshoot the app.";
      return "Received. A Shape teammate can follow up here or by email.";
    }

    function submit(text) {
      var value = String(text || input.value || "").trim();
      if (!value) return;
      append(value, true);
      input.value = "";
      send.disabled = true;
      window.setTimeout(function () {
        append(reply(value), false);
      }, 450);
    }

    node.querySelector(".sgc-close").addEventListener("click", function () {
      node.classList.remove("open");
    });
    input.addEventListener("input", function () {
      send.disabled = !input.value.trim();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
    send.addEventListener("click", function () { submit(); });
    node.querySelectorAll("[data-sgc-quick]").forEach(function (quick) {
      quick.addEventListener("click", function () {
        submit(quick.getAttribute("data-sgc-quick"));
      });
    });

    document.body.appendChild(node);
    return node;
  }

  function openFallbackPanel() {
    panel().classList.add("open");
    var input = document.querySelector("#" + PANEL_ID + " textarea");
    if (input) window.setTimeout(function () { input.focus(); }, 0);
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
      openFallbackPanel();
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
