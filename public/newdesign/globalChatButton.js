(function () {
  if (window.__shapeGlobalChatButtonLoaded) return;
  window.__shapeGlobalChatButtonLoaded = true;

  var ID = "shape-global-chat-button";
  var PANEL_ID = "shape-global-chat-panel";
  var HIDDEN_CLASS = "shape-global-chat-hidden";
  var PANEL_POS_KEY = "shape.globalChatPanel.pos";
  var PANEL_VISIBLE_GRAB = 84;
  var panelDrag = null;

  // ── Role-aware chat ──────────────────────────────────────────────────────
  // The chat tabs depend on who's signed in: everyone keeps Circle (coaches),
  // Friends, Community, and Help, but the peer tab is filtered to the viewer's
  // OWN role — a client sees only "Clients", a trainer only "Trainers", a
  // nutritionist only "Nutri". Role is cached on window/localStorage and
  // refreshed from the Supabase profile on load; logged-out visitors (most
  // marketing pages) default to the client view.
  var ROLE_KEY = "shape.viewerRole";
  var PEER_TABS = ["clients", "trainers", "nutritionists"];
  var PEER_FOR = { client: "clients", trainer: "trainers", nutritionist: "nutritionists" };
  // Returns the signed-in role, or "" when logged out / unknown. An empty
  // role means "don't change the chat" — the full default tab set is shown.
  function viewerRoleSync() {
    try { return window.__shapeViewerRole || localStorage.getItem(ROLE_KEY) || ""; }
    catch (e) { return window.__shapeViewerRole || ""; }
  }
  window.shapeViewerRole = viewerRoleSync;
  function filterTabsForRole(tabs, role) {
    // Only filter once we know a signed-in role; otherwise leave chat as-is.
    if (!role || !PEER_FOR[role]) return tabs || [];
    var mine = PEER_FOR[role];
    return (tabs || []).filter(function (t) {
      return PEER_TABS.indexOf(t.id) === -1 || t.id === mine;
    });
  }
  window.__shapeFilterChatTabs = filterTabsForRole;
  function resolveViewerRole() {
    try {
      if (!window.shapeDb || !window.shapeDb.client || !window.shapeDb.getProfile) return;
      window.shapeDb.client.auth.getSession().then(function (res) {
        var u = res && res.data && res.data.session && res.data.session.user;
        if (!u) {
          // Logged out — clear any cached role so the chat reverts to default.
          window.__shapeViewerRole = "";
          try { localStorage.removeItem(ROLE_KEY); } catch (e) {}
          return null;
        }
        return window.shapeDb.getProfile(u.id);
      }).then(function (profile) {
        if (profile && profile.role) {
          window.__shapeViewerRole = profile.role;
          try { localStorage.setItem(ROLE_KEY, profile.role); } catch (e) {}
        }
      }).catch(function () {});
    } catch (e) {}
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
      "#shape-global-chat-panel{position:fixed;right:24px;bottom:92px;z-index:2147483000;width:390px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 116px);display:none;flex-direction:column;overflow:hidden;border-radius:18px;border:1px solid rgba(242,237,228,.14);background:#1a1612;color:#f2ede4;box-shadow:0 28px 80px rgba(0,0,0,.62);font-family:'Space Grotesk',Inter,Arial,sans-serif}",
      "#shape-global-chat-panel.open{display:flex}",
      "#shape-global-chat-panel .sgc-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid rgba(242,237,228,.09);background:linear-gradient(180deg,rgba(30,192,168,.08),rgba(30,192,168,0));cursor:grab;user-select:none}",
      "#shape-global-chat-panel.dragging .sgc-head{cursor:grabbing}",
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
      "#shape-global-chat-panel .sgc-tabs{display:flex;gap:4px;overflow-x:auto;padding:8px 10px;border-bottom:1px solid rgba(242,237,228,.09);-ms-overflow-style:none;scrollbar-width:none}",
      "#shape-global-chat-panel .sgc-tabs::-webkit-scrollbar{display:none}",
      "#shape-global-chat-panel .sgc-tab{flex:none;border:0;background:transparent;color:rgba(242,237,228,.6);font:600 12px 'Space Grotesk',Inter,Arial,sans-serif;padding:6px 10px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}",
      "#shape-global-chat-panel .sgc-tab.active{background:rgba(30,192,168,.16);color:#2ee0c4}",
      "#shape-global-chat-panel .sgc-bdg{min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:#1ec0a8;color:#1a1612;font:700 9px 'JetBrains Mono',Consolas,monospace;display:inline-flex;align-items:center;justify-content:center}",
      "#shape-global-chat-panel .sgc-list{flex:1;overflow:auto;display:flex;flex-direction:column}",
      "#shape-global-chat-panel .sgc-row{display:grid;grid-template-columns:1fr auto;gap:3px 10px;padding:13px 16px;border:0;border-bottom:1px solid rgba(242,237,228,.06);cursor:pointer;text-align:left;background:transparent;color:inherit;font:inherit;width:100%}",
      "#shape-global-chat-panel .sgc-row:hover{background:rgba(242,237,228,.04)}",
      "#shape-global-chat-panel .sgc-row .nm{font-size:13.5px;font-weight:600}",
      "#shape-global-chat-panel .sgc-row .rl{font-size:11px;color:rgba(242,237,228,.5);grid-column:1/2}",
      "#shape-global-chat-panel .sgc-row .tm{font-family:'JetBrains Mono',Consolas,monospace;font-size:9.5px;color:rgba(242,237,228,.4)}",
      "#shape-global-chat-panel .sgc-row .ls{font-size:12px;color:rgba(242,237,228,.6);grid-column:1/-1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#shape-global-chat-panel .sgc-back{border:0;background:transparent;color:#2ee0c4;font:600 12px 'Space Grotesk',Inter,Arial,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:0;margin-bottom:2px}",
      "#shape-global-chat-panel .sgc-from{font-family:'JetBrains Mono',Consolas,monospace;font-size:9px;letter-spacing:.08em;color:rgba(242,237,228,.42);margin:-3px 0 -2px}",
      "@media (max-width:640px){#shape-global-chat-button{right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));padding:14px 19px 14px 16px;font-size:14px;gap:10px}#shape-global-chat-button .shape-global-chat-count{min-width:25px;height:22px;font-size:11px}#shape-global-chat-panel{right:16px;bottom:82px;width:calc(100vw - 32px);height:min(560px,calc(100vh - 104px));max-height:calc(100vh - 104px)}}"
    ].join("");
    document.head.appendChild(style);
  }

  function clampPanelPosition(x, y, w, h) {
    var minX = Math.min(8, PANEL_VISIBLE_GRAB - w);
    var maxX = Math.max(8, window.innerWidth - PANEL_VISIBLE_GRAB);
    var minY = Math.min(8, PANEL_VISIBLE_GRAB - h);
    var maxY = Math.max(8, window.innerHeight - PANEL_VISIBLE_GRAB);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }

  function setPanelPosition(node, pos) {
    node.style.left = pos.x + "px";
    node.style.top = pos.y + "px";
    node.style.right = "auto";
    node.style.bottom = "auto";
  }

  function restorePanelPosition(node) {
    try {
      var saved = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || "null");
      if (!saved) return;
      var rect = node.getBoundingClientRect();
      setPanelPosition(node, clampPanelPosition(saved.x, saved.y, rect.width || 390, rect.height || 540));
    } catch (err) {}
  }

  function startPanelDrag(event, node) {
    if (event.target.closest("button, input, textarea")) return;
    var rect = node.getBoundingClientRect();
    panelDrag = {
      node: node,
      offX: event.clientX - rect.left,
      offY: event.clientY - rect.top,
      w: rect.width,
      h: rect.height
    };
    node.classList.add("dragging");
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onPanelDrag);
    window.addEventListener("mouseup", endPanelDrag);
  }

  function onPanelDrag(event) {
    if (!panelDrag) return;
    // Free drag — the panel may go fully off-screen. It's clamped back into
    // view on the next open (restorePanelPosition), so it can't get lost.
    setPanelPosition(panelDrag.node, {
      x: event.clientX - panelDrag.offX,
      y: event.clientY - panelDrag.offY
    });
  }

  function endPanelDrag() {
    if (!panelDrag) return;
    var node = panelDrag.node;
    var rect = node.getBoundingClientRect();
    var pos = { x: rect.left, y: rect.top };
    setPanelPosition(node, pos);
    try { localStorage.setItem(PANEL_POS_KEY, JSON.stringify(pos)); } catch (err) {}
    node.classList.remove("dragging");
    panelDrag = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onPanelDrag);
    window.removeEventListener("mouseup", endPanelDrag);
  }

  // Self-contained chat data — embedded so the panel is IDENTICAL on every
  // page (independent of whatever page scripts are or aren't loaded).
  function chatData() {
    return filterTabsForRole([
      { id:"circle", label:"Circle", eyebrow:"DIRECT CHAT", title:"Your coaches", threads:[
        { who:"Maya Okafor", role:"Head trainer · Tempo + hybrid", last:"Stick with 185 for top set. Drop backoffs to 165.", time:"2m", unread:0, messages:[
          { who:"Maya", t:"How'd the warmups feel this morning?", time:"8:48 AM", me:false },
          { who:"You", t:"Squat 185 felt heavy — knee a bit grumpy.", time:"8:54 AM", me:true },
          { who:"Maya", t:"Stick with 185 for top set. Drop backoffs to 165 — protect the knee.", time:"9:02 AM", me:false },
          { who:"Maya", t:"Ice tonight and log sleep before Friday's call.", time:"9:02 AM", me:false } ] },
        { who:"Rae Lindqvist", role:"Nutritionist", last:"30g whey + 60g carbs within 45 min.", time:"14m", unread:1, messages:[
          { who:"Rae", t:"Post-run fueling template is live in your Nutri tab.", time:"Tue 6:14 PM", me:false },
          { who:"You", t:"Saw it — trying the rice bowl tomorrow.", time:"Tue 7:02 PM", me:true },
          { who:"Rae", t:"30g whey + 60g carbs within 45 min. Recovery window matters.", time:"14m", me:false } ] } ] },
      { id:"clients", label:"Clients", eyebrow:"TRAINING PARTNERS", title:"Fellow clients", threads:[
        { who:"Marcus J.", role:"Strength block 3 · NYC", last:"Still on for 6am tomorrow? Bringing coffee.", time:"31m", unread:2, messages:[
          { who:"Marcus", t:"Hey — how's block 3 treating you?", time:"Yesterday 9:12 PM", me:false },
          { who:"You", t:"Brutal but I'm loving it. You?", time:"Yesterday 9:40 PM", me:true },
          { who:"Marcus", t:"Still on for 6am tomorrow? Bringing coffee.", time:"31m", me:false } ] },
        { who:"Priya S.", role:"Hybrid · Austin", last:"That rice bowl recipe is elite.", time:"2h", unread:0, messages:[
          { who:"Priya", t:"Did you try Rae's rice bowl?", time:"Mon 7:40 PM", me:false },
          { who:"You", t:"Yeah last night — macros were spot on.", time:"Mon 8:02 PM", me:true },
          { who:"Priya", t:"That rice bowl recipe is elite.", time:"2h", me:false } ] },
        { who:"Tomás R.", role:"Powerlifting · Chicago", last:"Form check on my squat?", time:"Yesterday", unread:1, messages:[
          { who:"Tomás", t:"Form check on my squat?", time:"Yesterday 4:18 PM", me:false } ] } ] },
      { id:"trainers", label:"Trainers", eyebrow:"OTHER TRAINERS", title:"Trainers on Shape", threads:[
        { who:"Jordan Reyes", role:"Olympic lifting specialist", last:"Happy to do a consult on your clean technique.", time:"3h", unread:0, messages:[
          { who:"You", t:"Hi — Maya suggested I reach out. Working on clean form.", time:"Tue 11:02 AM", me:true },
          { who:"Jordan", t:"Happy to do a consult on your clean technique. 30 min, no charge.", time:"3h", me:false } ] },
        { who:"Alex Chen", role:"Mobility + recovery", last:"Here's a hip flow for before squat days.", time:"Yesterday", unread:1, messages:[
          { who:"Alex", t:"Here's a hip flow for before squat days. 8 min.", time:"Yesterday 10:14 AM", me:false } ] } ] },
      { id:"nutritionists", label:"Nutri", eyebrow:"OTHER NUTRITIONISTS", title:"Nutritionists on Shape", threads:[
        { who:"Dr. Sam Huang", role:"Endurance fueling", last:"Pre-long-run intake should be ~80g carbs.", time:"5h", unread:0, messages:[
          { who:"You", t:"Question on long run fueling — Rae suggested I ask you.", time:"Tue 2:40 PM", me:true },
          { who:"Sam", t:"Pre-long-run intake should be ~80g carbs, 90 min out.", time:"5h", me:false } ] },
        { who:"Lena Torres", role:"Plant-based performance", last:"Happy to share a template if useful.", time:"2d", unread:0, messages:[
          { who:"Lena", t:"Happy to share a template if useful. Ping me.", time:"Sun 6:10 PM", me:false } ] } ] },
      { id:"friends", label:"Friends", eyebrow:"DIRECT MESSAGES", title:"Your friends", threads:[
        { who:"Jade Liu", role:"Active now · Brooklyn", last:"that sunrise run pic was unreal", time:"just now", unread:2, messages:[
          { who:"Jade", t:"ok we HAVE to do Prospect Park saturday", time:"8:42 AM", me:false },
          { who:"You", t:"down. bringing Priya too?", time:"8:45 AM", me:true },
          { who:"Jade", t:"yes yes — 6am corral", time:"8:46 AM", me:false } ] },
        { who:"Kenji Mori", role:"Active 12m ago · Queens", last:"thx for the squat cue!! pr tmrw", time:"12m", unread:0, messages:[
          { who:"You", t:"breathe in at the top, brace HARD before the descent.", time:"Yesterday 5:18 PM", me:true },
          { who:"Kenji", t:"thx for the squat cue!! pr tmrw", time:"12m", me:false } ] },
        { who:"Sofia Reyes", role:"Active 40m ago · Lisbon", last:"bro the nutri plan is CLEAN", time:"40m", unread:1, messages:[
          { who:"Sofia", t:"have you seen Rae's new recovery bowl?", time:"Tue 9:40 AM", me:false },
          { who:"You", t:"made it last night. 10/10.", time:"Tue 10:02 AM", me:true },
          { who:"Sofia", t:"bro the nutri plan is CLEAN", time:"40m", me:false } ] } ] },
      { id:"community", label:"Community", eyebrow:"SHAPE COMMUNITY", title:"Channels", threads:[
        { who:"# shape-community", role:"41,208 members · 2,104 online", last:"Nina O: drop your goal for the month", time:"4m", unread:12, messages:[
          { who:"Nina O.", t:"welcome everyone — drop your goal for the month", time:"4m", me:false },
          { who:"Marcus J.", t:"225 bench by end of month. locked in.", time:"3m", me:false },
          { who:"Rae Lindqvist", t:"consistency > intensity this month. pick one thing and nail it daily.", time:"2m", me:false } ] },
        { who:"# strength-block-3", role:"412 members · 34 online", last:"Marcus J: First time hitting 225 on bench.", time:"18m", unread:3, messages:[
          { who:"Marcus J.", t:"First time hitting 225 on bench after 8 months. Maya's programming is unreal.", time:"18m", me:false },
          { who:"You", t:"Starting tomorrow. Any tips on recovery?", time:"12m", me:true },
          { who:"Priya S.", t:"Double your protein target and sleep 8+. Seriously.", time:"10m", me:false } ] },
        { who:"# running-club", role:"1,204 members · 89 online", last:"Ava K: Long run Saturday 6am.", time:"31m", unread:1, messages:[
          { who:"Ava K.", t:"Long run Saturday 6am — Prospect Park loop. Who's in?", time:"31m", me:false } ] },
        { who:"# ask-a-coach", role:"5,214 members · 198 online", last:"Maya: Free live Q&A Thursday 7pm EST.", time:"2h", unread:0, messages:[
          { who:"Maya Okafor", t:"Free live Q&A Thursday 7pm EST — drop your questions below.", time:"2h", me:false } ] } ] },
      { id:"support", label:"Help", eyebrow:"CUSTOMER SUPPORT", title:"How can we help?", support:true, threads:[
        { who:"Nora", role:"Shape's Concierge · coaches · billing · the app · your account", last:"How can we help?", time:"now", unread:0,
          quick:["Find a coach","Billing help","App support"], messages:[
          { who:"Nora", t:"Hi, I'm Nora — Shape's concierge. Ask me anything: connecting integrations, your plan, billing, or your account. I'll bring in the Shape team if I can't sort it out.", time:"now", me:false } ] } ] }
    ], viewerRoleSync());
  }

  function panel() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) return existing;

    var DATA = chatData();
    var state = { tab: DATA[0].id, ti: null };

    function tabBy(id) { for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i]; return DATA[0]; }
    function unreadFor(tab) { return (tab.threads || []).reduce(function (s, th) { return s + (Number(th.unread) || 0); }, 0); }
    function stamp() { return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    function supportReply(text) {
      var low = String(text || "").toLowerCase();
      if (/billing|price|cost|refund|stripe/.test(low)) return "Got it — we'll route this to billing. What's the email on the account?";
      if (/coach|trainer|nutrition|marketplace|find a coach/.test(low)) return "Tell us your goal and location and we'll point you to the right coach or nutritionist.";
      if (/app|bug|android|iphone|login|account|app support/.test(low)) return "Send the device and what's happening — support can troubleshoot the app from there.";
      return "Thanks — a Shape teammate will follow up here or by email.";
    }

    var node = document.createElement("section");
    node.id = PANEL_ID;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-label", "Shape chat");
    node.innerHTML =
      '<div class="sgc-head"><div><div class="sgc-kicker"></div><div class="sgc-title"></div></div>' +
      '<button class="sgc-close" type="button" aria-label="Close chat">&times;</button></div>' +
      '<div class="sgc-tabs"></div>' +
      '<div class="sgc-main"></div>' +
      '<div class="sgc-compose"><textarea rows="1" placeholder="Message"></textarea>' +
      '<button class="sgc-send" type="button" disabled>Send</button></div>';

    var head = node.querySelector(".sgc-head");
    var kicker = node.querySelector(".sgc-kicker");
    var title = node.querySelector(".sgc-title");
    var tabsEl = node.querySelector(".sgc-tabs");
    var mainEl = node.querySelector(".sgc-main");
    var input = node.querySelector("textarea");
    var send = node.querySelector(".sgc-send");

    function activeThread() {
      var tab = tabBy(state.tab);
      return state.ti == null ? null : (tab.threads || [])[state.ti];
    }

    function renderTabs() {
      tabsEl.innerHTML = "";
      DATA.forEach(function (tab) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "sgc-tab" + (tab.id === state.tab ? " active" : "");
        b.appendChild(document.createTextNode(tab.label));
        var u = unreadFor(tab);
        if (u) { var bd = document.createElement("span"); bd.className = "sgc-bdg"; bd.textContent = u; b.appendChild(bd); }
        b.addEventListener("click", function () {
          state.tab = tab.id;
          state.ti = tab.support ? 0 : null;
          render();
        });
        tabsEl.appendChild(b);
      });
    }

    function renderMain() {
      var tab = tabBy(state.tab);
      kicker.textContent = tab.eyebrow || "Shape chat";
      mainEl.innerHTML = "";
      var th = activeThread();

      if (!th) {
        title.textContent = tab.title || "Chat";
        var list = document.createElement("div");
        list.className = "sgc-list";
        (tab.threads || []).forEach(function (thread, idx) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "sgc-row";
          var nm = document.createElement("div"); nm.className = "nm"; nm.textContent = thread.who;
          var tm = document.createElement("div"); tm.className = "tm"; tm.textContent = thread.time || "";
          var rl = document.createElement("div"); rl.className = "rl"; rl.textContent = thread.role || "";
          var ls = document.createElement("div"); ls.className = "ls"; ls.textContent = thread.last || "";
          row.appendChild(nm); row.appendChild(tm); row.appendChild(rl); row.appendChild(ls);
          row.addEventListener("click", function () { thread.unread = 0; state.ti = idx; render(); });
          list.appendChild(row);
        });
        mainEl.appendChild(list);
        send.disabled = true;
        return;
      }

      title.textContent = th.who;
      var body = document.createElement("div");
      body.className = "sgc-body";

      if (!tab.support) {
        var back = document.createElement("button");
        back.type = "button";
        back.className = "sgc-back";
        back.textContent = "‹ All " + (tab.label || "chats");
        back.addEventListener("click", function () { state.ti = null; render(); });
        body.appendChild(back);
      }

      (th.messages || []).forEach(function (m) {
        if (!m.me) {
          var from = document.createElement("div");
          from.className = "sgc-from";
          from.textContent = m.who || "";
          body.appendChild(from);
        }
        var msg = document.createElement("div");
        msg.className = "sgc-msg " + (m.me ? "me" : "them");
        msg.textContent = m.t;
        body.appendChild(msg);
        var time = document.createElement("div");
        time.className = "sgc-time";
        time.textContent = (m.me ? "YOU" : (m.who || "").toUpperCase()) + " · " + (m.time || stamp());
        body.appendChild(time);
      });

      if (th.quick && th.quick.length) {
        var q = document.createElement("div");
        q.className = "sgc-quick";
        th.quick.forEach(function (label) {
          var qb = document.createElement("button");
          qb.type = "button";
          qb.textContent = label;
          qb.addEventListener("click", function () { submit(label); });
          q.appendChild(qb);
        });
        body.appendChild(q);
      }

      mainEl.appendChild(body);
      body.scrollTop = body.scrollHeight;
      send.disabled = !input.value.trim();
      input.placeholder = "Message " + (th.who || "").split(" ")[0];
    }

    function render() { renderTabs(); renderMain(); }

    function submit(text) {
      var th = activeThread();
      if (!th) return;
      var value = String(text || input.value || "").trim();
      if (!value) return;
      th.messages.push({ who: "You", t: value, time: stamp(), me: true });
      input.value = "";
      send.disabled = true;
      var supportTab = tabBy(state.tab).support;
      render();
      if (supportTab) {
        window.setTimeout(function () {
          var cur = activeThread();
          if (cur) { cur.messages.push({ who: "Shape", t: supportReply(value), time: stamp(), me: false }); render(); }
        }, 480);
      }
    }

    node.querySelector(".sgc-close").addEventListener("click", function () {
      node.classList.remove("open");
      try { localStorage.removeItem("shape.chat.open"); } catch (e) {}
    });
    head.addEventListener("mousedown", function (event) { startPanelDrag(event, node); });
    input.addEventListener("input", function () { send.disabled = !input.value.trim() || state.ti == null; });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
    });
    send.addEventListener("click", function () { submit(); });

    render();
    document.body.appendChild(node);
    return node;
  }

  function openFallbackPanel() {
    var node = panel();
    node.classList.add("open");
    try { localStorage.setItem("shape.chat.open", "1"); } catch (e) {}
    restorePanelPosition(node);
    var input = document.querySelector("#" + PANEL_ID + " textarea");
    if (input) window.setTimeout(function () { input.focus(); }, 0);
  }

  // Open the full rich ChatWidget (big, all tabs, draggable). On pages
  // that don't already have it, lazily load + mount it; if anything
  // fails, gracefully fall back to the self-contained panel.
  var chatBootStarted = false;
  // Flush a stashed deep-link request (window.__openChatRequest) into the
  // widget once it exists — otherwise just open the panel.
  function flushOpen() {
    var req = window.__openChatRequest || undefined;
    try { delete window.__openChatRequest; } catch (e) {}
    window.__openChat(req, req && req.tab);
  }
  function waitAndOpen(tries) {
    if (typeof window.__openChat === "function") { flushOpen(); return; }
    if (tries > 60) { openFallbackPanel(); return; }
    window.setTimeout(function () { waitAndOpen(tries + 1); }, 80);
  }
  // On deployed pages the JSX is precompiled (scripts/build-newdesign.mjs) and
  // window.Babel does not exist — load the compiled files from the injected
  // window.__ndCompiled manifest instead. async=false keeps insertion order
  // (they share globals top-to-bottom, same as the babel path).
  function bootCompiledChat() {
    var map = window.__ndCompiled;
    var names = ["pageShell.jsx", "clientChatThreads.jsx", "chatWidget.jsx"];
    var pending = 0;
    function mountWhenReady() {
      try {
        var r = document.getElementById("shape-rich-chat-root");
        if (r && window.ChatWidget) ReactDOM.createRoot(r).render(React.createElement(window.ChatWidget, { tabs: window.clientChatTabs }));
      } catch (e) {}
    }
    names.forEach(function (name) {
      var stem = name.replace(/\.jsx$/, "");
      // Already on the page (as its compiled nd/<stem>.js or any src of the
      // same stem)? Re-evaling would redeclare shared top-level consts.
      var existing = document.querySelectorAll("script[src]");
      for (var i = 0; i < existing.length; i++) {
        var base = (existing[i].getAttribute("src") || "").split("?")[0].split("/").pop();
        if (base === stem + ".js" || base === name) return;
      }
      var sc = document.createElement("script");
      sc.src = map[name];
      sc.async = false;
      sc.setAttribute("data-shape-chat", name);
      pending++;
      sc.onload = function () { if (--pending === 0) mountWhenReady(); };
      // A 404'd bundle means the rich widget can never mount — surface the
      // fallback panel right away instead of waiting out waitAndOpen's poll.
      sc.onerror = function () { --pending; openFallbackPanel(); };
      document.body.appendChild(sc);
    });
    if (pending === 0) mountWhenReady();
    waitAndOpen(0);
  }
  function openRichChat() {
    if (typeof window.__openChat === "function") { flushOpen(); return; }
    if (chatBootStarted) { waitAndOpen(0); return; }
    chatBootStarted = true;
    if (window.__ndCompiled && window.React && window.ReactDOM) {
      if (!document.getElementById("shape-rich-chat-root")) {
        var ndRoot = document.createElement("div");
        ndRoot.id = "shape-rich-chat-root";
        document.body.appendChild(ndRoot);
      }
      try { bootCompiledChat(); } catch (e) { openFallbackPanel(); }
      return;
    }
    if (!(window.Babel && window.Babel.transformScriptTags && window.React && window.ReactDOM)) {
      openFallbackPanel();
      return;
    }
    try {
      if (!document.getElementById("shape-rich-chat-root")) {
        var root = document.createElement("div");
        root.id = "shape-rich-chat-root";
        document.body.appendChild(root);
      }
      ["/newdesign/pageShell.jsx", "/newdesign/clientChatThreads.jsx", "/newdesign/chatWidget.jsx"].forEach(function (s) {
        if (document.querySelector('script[data-shape-chat="' + s + '"]')) return;
        // Already loaded by the page itself (relative src, usually with a ?v
        // tag)? Re-injecting would re-eval its top-level consts in babel's
        // shared global scope and throw "already been declared", breaking the
        // whole boot — skip it.
        var base = s.split("/").pop();
        var existing = document.querySelectorAll('script[type="text/babel"][src]');
        for (var i = 0; i < existing.length; i++) {
          var src2 = existing[i].getAttribute("src") || "";
          if (src2.split("?")[0].split("/").pop() === base) return;
        }
        var sc = document.createElement("script");
        sc.type = "text/babel";
        sc.setAttribute("data-presets", "react");
        sc.setAttribute("data-shape-chat", s);
        sc.src = s;
        document.body.appendChild(sc);
      });
      if (!document.querySelector('script[data-shape-chat="mount"]')) {
        var mountSc = document.createElement("script");
        mountSc.type = "text/babel";
        mountSc.setAttribute("data-presets", "react");
        mountSc.setAttribute("data-shape-chat", "mount");
        mountSc.text = "(function(){try{var r=document.getElementById('shape-rich-chat-root');if(r&&window.ChatWidget)ReactDOM.createRoot(r).render(React.createElement(window.ChatWidget,{tabs:window.clientChatTabs}));}catch(e){}})();";
        document.body.appendChild(mountSc);
      }
      window.Babel.transformScriptTags();
    } catch (e) {
      openFallbackPanel();
      return;
    }
    waitAndOpen(0);
  }

  // Programmatic deep link for the rest of the site (dashboard Message
  // buttons, rosters, drawers): open the existing bubble ON a specific
  // person's thread, optionally with a pre-filled draft. There is no
  // standalone messages page — this is the messaging surface.
  //   window.__openChatTo({ who: "Marcus T.", draft: "Hey Marcus — …", tab: "team" })
  // Works before the widget mounts: the request is stashed and consumed when
  // the lazy boot finishes (chatWidget.jsx reads __openChatRequest on mount).
  window.__openChatTo = function (opts) {
    if (typeof window.__openChat === "function") {
      window.__openChat(opts || undefined, opts && opts.tab);
      return;
    }
    window.__openChatRequest = opts || null;
    openRichChat();
  };

  function syncVisibility(button) {
    if (!button) return;
    // This is now the single chat launcher on every page (ChatWidget no longer
    // renders its own floating bubble — it only shows the panel it opens). So the
    // button stays visible; opening chat shows the panel above it, and it doesn't
    // vanish on click the way the old hide-on-native-widget logic caused.
    button.classList.remove(HIDDEN_CLASS);
  }

  function isMobileViewport() {
    try { return window.matchMedia && window.matchMedia("(max-width: 760px)").matches; }
    catch (e) { return false; }
  }

  function mount() {
    if (document.getElementById(ID)) return;
    // No chat bubble on mobile — matches the mobile-redirect breakpoint.
    if (isMobileViewport()) return;
    injectStyles();

    // Resolve the signed-in role early so the chat tabs are filtered to it
    // by the time the user opens the panel. Waits briefly for shapeDb.
    (function waitRole(n) {
      if (window.shapeDb && window.shapeDb.client) { resolveViewerRole(); return; }
      if (n > 50) return;
      window.setTimeout(function () { waitRole(n + 1); }, 120);
    })(0);

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
      // Open the full rich ChatWidget (loads it if the page doesn't
      // have it yet); falls back to the self-contained panel on failure.
      openRichChat();
    });

    document.body.appendChild(button);
    syncVisibility(button);

    var observer = new MutationObserver(function () {
      syncVisibility(button);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("pageshow", function () { syncVisibility(button); });

    // The chat panel does NOT auto-reopen across navigation — it was staying open
    // and blocking the page. Each page starts with just the bubble; the panel
    // opens only on an explicit click / __openChat call. Clear any stale flag.
    try { localStorage.removeItem("shape.chat.open"); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  // Grant any one-time Shape Score tier bonuses for the signed-in member
  // (idempotent server-side; runs once per page load, cheap).
  try {
    var cl = window.shapeDb && window.shapeDb.client;
    if (cl && cl.auth && cl.rpc) {
      cl.auth.getUser().then(function (r) {
        if (r && r.data && r.data.user) { cl.rpc("award_tier_bonuses").catch(function () {}); }
      }).catch(function () {});
    }
  } catch (e) {}
})();

/* The persistent Shape Radio mini-player has been removed from the website. */
