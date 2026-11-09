// The example dashboard for a signed-in coach (owner, 2026-11-09: "See the example", option 1).
//
// A coach with no clients yet sees their own empty pages, and the sample dashboard was shown only
// to a signed-out visitor, whom the shell sends to sign in. So a coach could never see what the
// dashboard does. "See the example" opens it: the same sample, under the band, for this tab only.
//
// ⚠ THE EXAMPLE IS THE SIGNED-OUT PREVIEW, MADE BY SIGNING THIS TAB OUT, NEVER BY A BRANCH IN EACH
// PAGE. Every coach page already draws its sample when its reads say "signed out" (a 401, or
// /api/me's { user: null }), and keeps a write in the preview when it is one. So while the example
// is on, this tab's own requests answer as a signed-out visitor's would, before they leave it:
//   • /api/me says { user: null };
//   • any other /api/ request, a write included, is answered 401 here and never sent;
//   • a request to the Supabase project is answered 401 here and never sent;
//   • signing out goes through (POST /api/auth/signout, DELETE /api/auth/session), so Sign out
//     still signs the coach out.
// And supabase.js gives this tab a client with no stored session (`ShapeDashExample.on`), so a
// page that asks the Supabase client who is signed in hears "nobody" too. The coach's own session
// is untouched: no cookie, token or setting is read, written or removed.
//
// ⚠ THIS FILE LOADS FIRST, before supabase.js, portalSession.js and every page script, so nothing
// can fetch, or keep a reference to `fetch`, before the example is in place.
//
// The switch is per tab (sessionStorage): `?example=1` turns it on, `?example=0` or "Back to my
// dashboard" (ShapeDashExample.leave) turns it off. A new visit starts on the coach's own data.
(function () {
  if (typeof window === "undefined") return;
  var KEY = "shape.dashExample";
  var on = false;
  try {
    var asked = new URLSearchParams(window.location.search).get("example");
    if (asked === "1") window.sessionStorage.setItem(KEY, "1");
    else if (asked === "0") window.sessionStorage.removeItem(KEY);
    on = window.sessionStorage.getItem(KEY) === "1";
  } catch (e) {
    // No storage: the example can still be asked for by the URL, for this load.
    try { on = new URLSearchParams(window.location.search).get("example") === "1"; } catch (e2) { on = false; }
  }

  // This page's own address with `example` set to `value` (or removed), keeping the rest of the
  // query and the #tab.
  function here(value) {
    var params = new URLSearchParams(window.location.search);
    if (value == null) params.delete("example"); else params.set("example", value);
    var q = params.toString();
    return window.location.pathname + (q ? "?" + q : "") + window.location.hash;
  }
  function enter() {
    try { window.sessionStorage.setItem(KEY, "1"); } catch (e) {}
    window.location.assign(here("1"));
  }
  function leave() {
    try { window.sessionStorage.removeItem(KEY); } catch (e) {}
    window.location.replace(here(null));
  }

  window.ShapeDashExample = { on: on, enter: enter, leave: leave, href: here };
  if (!on || typeof window.fetch !== "function") return;

  var realFetch = window.fetch;
  // ⚠ ONLY SIGNING OUT GOES THROUGH, NOT /api/auth/ AS A WHOLE. `GET /api/auth/session` is the
  // cookie bridge: shapeDb.getSession() asks it when its client holds no session, and its answer
  // would sign this tab's client back in as the coach. Sign out is the header's POST
  // /api/auth/signout and shapeDb.signOut's DELETE /api/auth/session; both only end the session.
  function isSignOut(path, method) {
    return path === "/api/auth/signout" || (path === "/api/auth/session" && method === "DELETE");
  }
  function answer(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    }));
  }
  window.fetch = function (input, init) {
    var url = null;
    try {
      var raw = typeof input === "string" ? input : input && typeof input.url === "string" ? input.url : String(input);
      url = new URL(raw, window.location.href);
    } catch (e) {
      // An address this can't read isn't one of the account's: let the browser answer it.
      return realFetch.apply(this, arguments);
    }
    var own = url.origin === window.location.origin;
    var method = String((init && init.method) || (input && typeof input === "object" && input.method) || "GET").toUpperCase();
    if (own && url.pathname === "/api/me") return answer(200, { user: null });
    if (own && isSignOut(url.pathname, method)) return realFetch.apply(this, arguments);
    if (own && url.pathname.indexOf("/api/") === 0) return answer(401, { error: "Authentication required." });
    if (/(^|\.)supabase\.co$/i.test(url.hostname)) return answer(401, { message: "Authentication required." });
    return realFetch.apply(this, arguments);
  };
})();
