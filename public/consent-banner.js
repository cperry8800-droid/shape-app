// The EEA/UK consent banner (Reject non-essential / Accept), for every page that runs anything the
// choice gates: the remembered first link (/signup-source.js), the tap counts (/click-capture.js),
// the page views (/consent-insights.js, and ConsentAnalytics.tsx in the Next app).
// ⚠ ONE BANNER, LOADED BY EVERY GATED PAGE (Codex on #2530). It lived inside pageShell.jsx, so a
// page without the shell (404, contact, help, reset-password, consultation, ClientPlaylists) and
// every Next page held their stats for a choice they gave no way to make: an EEA or UK visitor
// who landed there was never asked. The shell loads this file (shapeConsentLoader), those pages
// load it directly, and the Next layout loads it through ConsentAnalytics.tsx;
// tests/consent-banner-pages.test.mjs holds every gated page to it. Loaded twice, it runs once.
(function shapeConsent() {
  if (typeof document === "undefined" || window.__shapeConsentBanner) return;
  window.__shapeConsentBanner = true;
  var POLICY_VERSION = "2026-06-22";
  var GPC_TEXT = "Global Privacy Control honored as an opt-out of sale/sharing.";
  // Resolves true only when a consent_log row was actually written (so callers
  // can gate a "logged" flag on a confirmed insert, not an attempt).
  function logConsent(kind, granted, text) {
    try {
      var db = window.shapeDb;
      if (!(db && db.client && db.client.auth)) return logByRoute(kind, granted, text);
      return db.client.auth.getUser().then(function (r) {
        var uid = r && r.data && r.data.user && r.data.user.id;
        if (!uid) return false;
        return db.client.from("consent_log").insert({ user_id: uid, kind: kind, granted: granted, policy_version: POLICY_VERSION, source: "banner", consent_text: text }).then(function () { return true; }).catch(function () { return false; });
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  // A page without the browser database client (every Next page, and the website's pages without
  // /supabase.js) asks /api/consent/banner, which writes the row with the request's own session
  // (Codex on #2530). A visitor who isn't signed in gets a 401, and nothing is logged, as above.
  function logByRoute(kind, granted, text) {
    try {
      if (typeof fetch !== "function") return Promise.resolve(false);
      return fetch("/api/consent/banner", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind, granted: granted, policy_version: POLICY_VERSION, consent_text: text })
      }).then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function start() {
    try {
      var KEY = "shape.consent.v1";
      var gpc = (typeof navigator !== "undefined" && navigator.globalPrivacyControl === true);
      if (gpc) {
        window.__shapeGPC = true;
        // Log the GPC opt-out once PER USER (not once per browser), and only after
        // the insert is confirmed — so a signed-out visit (or a failed insert)
        // doesn't permanently suppress logging for a later signed-in user here.
        try {
          var gdb = window.shapeDb;
          if (gdb && gdb.client && gdb.client.auth) {
            gdb.client.auth.getUser().then(function (r) {
              var uid = r && r.data && r.data.user && r.data.user.id;
              if (!uid) return;                                  // anon: nothing to log yet; their next signed-in visit logs it
              var gkey = "shape.gpc.logged." + uid;
              if (localStorage.getItem(gkey)) return;
              logConsent("gpc_optout", true, GPC_TEXT).then(function (ok) {
                if (ok) { try { localStorage.setItem(gkey, "1"); } catch (e) {} }
              });
            }).catch(function () {});
          } else {
            // Without the browser client, the route logs the opt-out once per account itself. It is
            // asked once per tab, so a visitor sending GPC isn't a request on every page.
            var asked = false;
            try { asked = !!sessionStorage.getItem("shape.gpc.asked"); sessionStorage.setItem("shape.gpc.asked", "1"); } catch (e) {}
            if (!asked) logByRoute("gpc_optout", true, GPC_TEXT);
          }
        } catch (e) {}
      }
      if (localStorage.getItem(KEY)) return;                 // already chose
      if (gpc) { try { localStorage.setItem(KEY, "reject"); } catch (e) {} return; } // GPC = opt out, no banner
      var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
      // The EEA and the UK by device time zone: every Europe/* zone (slightly over-inclusive, which
      // fails safe), plus the EEA's zones outside Europe/* (the Canaries, Madeira, the Azores, Ceuta,
      // Cyprus, Iceland, Svalbard, and France's outermost regions; Codex on #2334). One list, written
      // out in six files; tests/consent-region.test.mjs holds them equal.
      var CONSENT_REGION_RE = /^(?:Europe\/|(?:Atlantic\/(?:Canary|Madeira|Azores|Reykjavik|Jan_Mayen)|Africa\/Ceuta|Asia\/(?:Nicosia|Famagusta)|Arctic\/Longyearbyen|America\/(?:Guadeloupe|Martinique|Cayenne|Marigot)|Indian\/(?:Reunion|Mayotte))$)/;
      if (!CONSENT_REGION_RE.test(tz)) return;               // region-aware: show only for EEA/UK
      // ONE copy string, rendered AND recorded — the consent_log row must carry
      // the exact text the visitor was shown (house rule from the cycle wave).
      var BANNER_COPY = "We use essential cookies and on-device storage to run Shape — no ad tracking, nothing cross-site. Your choice here also controls whether we remember which link brought you to Shape, and Shape's first-party usage stats on this site and in the app. See our Privacy Policy.";
      function record(choice) {
        try { localStorage.setItem(KEY, choice); } catch (e) {}
        // The choice decides whether the link that brought this visitor is remembered: run the
        // capture again now, on this same page, so an Accept keeps it (its tags and referrer
        // are gone after the next click) and a Reject drops it (Codex, #2325).
        try { if (window.shapeSignupSource) window.shapeSignupSource.capture(); } catch (e) {}
        // And whether this page's own page views start now (/consent-insights.js waits for it).
        try { window.dispatchEvent(new CustomEvent("shape:consent", { detail: choice })); } catch (e) {}
        // consent_text is the VERBATIM copy shown — nothing appended; the
        // `granted` column already records which button was pressed.
        logConsent("cookies", choice === "accept", BANNER_COPY);
      }
      var bar = document.createElement("div");
      bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookie consent");
      // ⚠ THE BANNER'S COLOURS ARE NAMESPACED, AND THE COMMENT THIS REPLACES IS
      // WHY. It said to use the design-system tokens "since this banner is
      // injected outside any page stylesheet and must stay legible everywhere"
      // — and borrowing generic names is exactly what made it illegible. The
      // Climb homepage is the FIRST page in this directory to define `--ink`,
      // and it defines it as its BACKGROUND (#06090f); the banner then drew
      // #06090f text on its own #1a1612 fallback at **1.11:1**, against the
      // 4.5:1 floor. Worse than uniformly broken: the Accept button takes its
      // colour from `--paper`, which no page defines, so it stayed at 8.19:1 —
      // a first-time EEA/UK visitor saw a consent choice in which only ACCEPT
      // was legible. That is a dark pattern arrived at by accident, on the one
      // dialog where it matters most.
      // A generic token name is a shared namespace with every page's private
      // palette; `--consent-*` is not. Nothing defines these today, so every
      // page renders the literal fallbacks — byte-identical to what it rendered
      // before this change — while a page that wants to theme the banner still
      // can, deliberately. (Codex, #2045.)
      bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:var(--consent-bg,#1a1612);color:var(--consent-fg,#f2ede4);border-top:1px solid rgba(242,237,228,0.15);padding:15px 20px;font-family:'Space Grotesk',sans-serif;font-size:13.5px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;box-shadow:0 -10px 40px rgba(0,0,0,0.5)";
      var txt = document.createElement("span");
      txt.style.cssText = "flex:1;min-width:240px;line-height:1.5";
      // Copy must describe what we actually do. The website's consent-gated
      // uses are remembering the first link a visitor came from, for sign-up
      // attribution (/signup-source.js, 2026-10-13), and counting taps on its
      // buttons and links as daily totals (/click-capture.js, 2026-10-28), and its page views
      // (Vercel Web Analytics, which /consent-insights.js and ConsentAnalytics.tsx load only as
      // this choice allows, 2026-10-31). The
      // Shape app on this same origin gates its first-party usage stats on the
      // same choice (mobile-app analytics.js reads shape.consent.v1). Never promise
      // analytics a surface doesn't run, and never run one the copy leaves out.
      // KEEP IN SYNC with BANNER_COPY above (rendered text == recorded text).
      txt.appendChild(document.createTextNode("We use essential cookies and on-device storage to run Shape — no ad tracking, nothing cross-site. Your choice here also controls whether we remember which link brought you to Shape, and Shape's first-party usage stats on this site and in the app. See our "));
      var pl = document.createElement("a"); pl.href = "/privacy.html"; pl.textContent = "Privacy Policy"; pl.style.color = "var(--consent-link,#2ee0c4)";
      txt.appendChild(pl); txt.appendChild(document.createTextNode("."));
      bar.appendChild(txt);
      function btn(label, choice, primary) {
        var b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "border:1px solid " + (primary ? "var(--consent-accent,#0ac5a8)" : "rgba(242,237,228,0.25)") + ";background:" + (primary ? "var(--consent-accent,#0ac5a8)" : "transparent") + ";color:" + (primary ? "var(--consent-bg,#1a1612)" : "var(--consent-fg,#f2ede4)") + ";padding:9px 16px;border-radius:7px;font-family:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap";
        b.onclick = function () { record(choice); if (bar.parentNode) bar.parentNode.removeChild(bar); unlift(); };
        return b;
      }
      bar.appendChild(btn("Reject non-essential", "reject", false));
      bar.appendChild(btn("Accept", "accept", true));
      document.body.appendChild(bar);
      // ⚠ THE CHAT LAUNCHER COVERED BOTH ANSWERS. It sits bottom-right at z-index 2147483000, over
      // this bar's 99999, and on a desktop its pill lay across Reject non-essential and Accept
      // alike (measured at 1280 and 1440 wide on Community, Pricing and the homepage): a click on
      // either reached the chat, so an EEA or UK visitor at a computer could not answer at all.
      // While the bar is up, the launcher and its panel stand on top of it instead, at the bar's
      // own measured height; answering puts them back. A panel the visitor dragged carries an
      // inline top (globalChatButton.js setPanelPosition), which would win over the bottom, so the
      // top is let go too while the bar is up (Codex on #2530); the rich widget's own panel sits
      // at z-index 180, under the bar.
      var html = document.documentElement;
      var liftCss = document.createElement("style");
      liftCss.id = "shape-consent-lift";
      liftCss.textContent = "html.shape-consent-open #shape-global-chat-button{bottom:calc(var(--shape-consent-h,0px) + 16px) !important}"
        + "html.shape-consent-open #shape-global-chat-panel{top:auto !important;bottom:calc(var(--shape-consent-h,0px) + 70px) !important;max-height:calc(100vh - var(--shape-consent-h,0px) - 94px) !important}";
      document.head.appendChild(liftCss);
      function lift() { try { html.style.setProperty("--shape-consent-h", bar.offsetHeight + "px"); } catch (e) {} }
      function unlift() {
        try { html.classList.remove("shape-consent-open"); html.style.removeProperty("--shape-consent-h"); window.removeEventListener("resize", lift); if (sizeWatch) sizeWatch.disconnect(); } catch (e) {}
        if (liftCss.parentNode) liftCss.parentNode.removeChild(liftCss);
      }
      html.classList.add("shape-consent-open");
      lift();
      window.addEventListener("resize", lift);
      // The bar's own height changes too (its font arriving rewraps the text), so it is watched.
      var sizeWatch = null;
      try { if (window.ResizeObserver) { sizeWatch = new ResizeObserver(lift); sizeWatch.observe(bar); } } catch (e) {}
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
