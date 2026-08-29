// public/newdesign/sentryInit.js
//
// Error-tracking initializer for the static website (public/newdesign/*.html —
// mostly signed-in dashboard SPAs — ClientApp/TrainerApp/NutritionistApp and
// their sub-pages — plus the marketing pages, all served as plain files and
// compiled in-browser by Babel, no bundler). This is Task 4 of the
// error-tracking plan; Tasks 2 and 3 wired @sentry/nextjs and
// @sentry/capacitor+@sentry/react into the Next.js app and the mobile
// bundle respectively — this surface has neither npm nor a build step that
// could install an SDK, so it uses Sentry's browser CDN bundle instead
// (https://docs.sentry.io/platforms/javascript/install/cdn/).
//
// ⚠ THIS FILE DOES NOT LOAD THE SDK — it only initializes one that is already
// there. scripts/build-newdesign.mjs (the deploy precompile) injects THREE
// things into every page it rewrites, in this order:
//   1. an inline <script> setting window.SHAPE_SENTRY_DSN (+ SHAPE_RELEASE),
//   2. <script defer> for the pinned Sentry CDN bundle (URL + SRI live there),
//   3. <script defer> for this file.
// Deferred scripts execute in DOCUMENT ORDER, and every compiled `nd/*.js` on
// these pages sits after </head>, so the bundle is guaranteed to be parsed and
// this init is guaranteed to have run BEFORE any `nd/*.js` executes.
//
// ⚠ THAT IS THE WHOLE GUARANTEE — it is NOT "nothing runs before Sentry", which
// this comment used to imply. A DEFERRED script cannot precede a SYNCHRONOUS
// one regardless of tag position, so on these pages the following still run
// first: synchronous external `<script src>` in <head> (26 pages — the React /
// ReactDOM / Babel UMD tags, plus /vendor/supabase-js and /supabase.js on
// index, ClientProfile, Login and the three Signup pages), and classic inline
// `<script>` blocks (17 across 10 pages; index alone has 7). An uncaught throw
// in that window is outside Sentry's reach — a pre-existing gap that needs an
// early-error queue to close, not a change to this file. Do not restate the
// stronger claim.
//
// ⚠ It used to append the CDN <script> itself, and that was a real defect:
// a dynamically-inserted script is ASYNC, so it raced the page's own deferred
// scripts. The app could mount and throw while the bundle was still in flight,
// which meant page-startup crashes — the most valuable error this surface can
// report — were silently lost on every cold load. Do not re-introduce a
// runtime `document.head.appendChild` here.
//
// ⚠ NO DSN EXISTS YET, and with none configured the precompile injects NOTHING
// — not the assignment, not the CDN tag, not this file — so it is not even
// fetched. If it somehow is, the guard below is the LAST thing it does: nothing
// is fetched and nothing talks to Sentry.
// (window.SHAPE_SENTRY_DSN mirrors the window.SHAPE_TURNSTILE_SITEKEY
// precedent in public/supabase.js — a window global gating behavior on its
// presence — but carries no fallback value: a placeholder would make an
// unconfigured site read as configured.)
(function () {
  if (typeof window === "undefined") return;

  var dsn = window.SHAPE_SENTRY_DSN;
  if (!dsn) return; // inert — no DSN, no network request of any kind

  // The bundle is a separate <script> now, so it can genuinely be absent:
  // a network blip, an SRI mismatch after a future version bump, an ad
  // blocker, or the CDN itself being down. Never break the page over it, but
  // say so — silence here reads identically to "no DSN configured," which
  // would hide a real outage from anyone debugging in devtools.
  if (!window.Sentry || typeof window.Sentry.init !== "function") {
    console.warn("[shape] Sentry CDN bundle missing or blocked (network, SRI, or extension) — error tracking is inert on this page.");
    return;
  }

  // Coarse, PII-free surface/role hint — derived ONLY from the page's own
  // window.location.pathname, never from any user/session/auth object. Lets
  // a signed-in dashboard bug be told apart from a marketing-page bug in the
  // Sentry UI without attaching identity of any kind. `ClientApp.html` ->
  // 'client', `TrainerApp.html` -> 'trainer', `NutritionistApp.html` ->
  // 'nutritionist'; every other filename (marketing/legal pages, anything
  // unrecognized) falls to the safe 'marketing' default rather than guessing.
  function shapeSurfaceTag() {
    try {
      var path = (window.location && window.location.pathname) || "";
      var file = path.split("/").pop() || "";
      if (/^Trainer/i.test(file)) return "trainer";
      if (/^Nutritionist/i.test(file)) return "nutritionist";
      if (/^Client/i.test(file)) return "client";
      return "marketing";
    } catch (e) {
      return "marketing"; // never let the tag derivation itself throw
    }
  }

  // ── User context ──────────────────────────────────────────────────────
  // A MIRROR of src/lib/sentry-context.mjs. Two implementations of one rule
  // is a drift hazard, so tests/sentry-user-mirror.test.mjs evaluates THIS
  // file and runs both over a shared vector table plus a deterministic fuzz
  // sweep, failing on the first disagreement.
  //
  // ⚠ NO PII, and that is not a style preference — it is the same rule the
  // canonical module states: #1851 restricted profiles.email / phone /
  // date_of_birth / location / stripe_customer_id AT THE DATABASE because any
  // signed-in member could read them. Shipping those to a third party would
  // undo that at a different layer. Only id, roles and is_coach may ever
  // reach Sentry from this platform.

  var SHAPE_COACH_ROLES = ["trainer", "nutritionist", "dietitian"]; // = COACH_ROLES

  // ⚠ `roles` is an ARRAY and `role` is the legacy singular fallback. A
  // dual-role account is real, so this must not collapse to one value.
  function shapeRolesOf(profile) {
    var arr = Array.isArray(profile.roles) ? profile.roles : null;
    var list = (arr && arr.length) ? arr : (profile.role ? [profile.role] : []);
    return list.filter(function (r) { return typeof r === "string" && r; }).sort();
  }

  // ⚠ NEVER THROWS. This runs while Sentry is building a report for a
  // DIFFERENT crash — a throw here would replace that original error with a
  // stack pointing at this file, the exact failure the tracking layer exists
  // to avoid. Returns null rather than a partial object when there is no id:
  // a user context without an identifier groups unrelated people together,
  // which is worse than none.
  function shapeSentryUser(profile, fallbackId) {
    try {
      var p = (profile && typeof profile === "object" && !Array.isArray(profile)) ? profile : null;
      var id = (p && typeof p.id === "string" && p.id ? p.id : null)
        || (typeof fallbackId === "string" && fallbackId ? fallbackId : null);
      if (!id) return null;
      var roles = p ? shapeRolesOf(p) : [];
      return {
        id: id,
        roles: roles.join(","),
        is_coach: roles.some(function (r) { return SHAPE_COACH_ROLES.indexOf(String(r)) !== -1; })
      };
    } catch (e) {
      return null;
    }
  }

  // Exposed so the drift test can drive the real shipped derivation rather
  // than a re-typed copy of it — the same reason public/age-derive.js
  // registers window.ShapeAgeDerive.
  window.ShapeSentryUser = { bsSentryUser: shapeSentryUser };

  // Resolve the signed-in member and set (or CLEAR) the context.
  //
  // ⚠ VIA THE COOKIE SESSION, NOT window.shapeDb. Only 21 of 76 newdesign
  // pages load /supabase.js, so anything keyed on that global is dead code
  // across most of this surface — a lesson this repo has already paid for
  // once, on the DOB gate. /api/me reads the same cookie the Next pages use,
  // is not behind the membership gate, and answers { user: null } when
  // signed out, so one same-origin fetch works on all 76.
  //
  // ⚠ ONLY id/roles/role CROSS THE BOUNDARY. /api/me also returns email,
  // fullName, firstName and avatarUrl. shapeSentryUser hand-builds its
  // result and never spreads, so passing the whole object would already be
  // safe — but the PII is not copied into a local at all, so it cannot leak
  // through a future edit to the derivation either.
  //
  // ⚠ SIGNED OUT CLEARS. Leaving the previous account's tags standing is the
  // cross-account leak class this repo fixed once already (_followCache).
  // (Sign-out on this surface ends in a hard reload, so the next load re-runs
  // this and lands on the { user: null } branch.)
  //
  // ⚠ THE FETCH IS UNCONDITIONAL, AND THE CHEAP GUARD WAS REJECTED ON PURPOSE.
  // Skipping the request when localStorage['shape.auth'] is absent would spare
  // anonymous marketing traffic a round-trip — but that key is written by
  // public/supabase.js's client, while the Next /login server action sets the
  // COOKIE server-side. A member who arrived that way is signed in with no
  // such key, so the guard would report their errors anonymously: a false
  // negative in exactly the case this whole change exists to fix, and the same
  // "keyed on a client-side signal that is not universally present" mistake as
  // the 21-of-76 window.shapeDb trap. The cost is one request per page load
  // ONLY once a DSN exists (this file returns early without one), alongside the
  // dobGate's existing unconditional fetch on 73 of these pages.
  function attachShapeUser() {
    try {
      if (typeof window.fetch !== "function") return;
      window.fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
        .then(function (res) { return res && res.ok ? res.json() : null; })
        .then(function (data) {
          var u = data && data.user;
          if (!u || typeof u !== "object") {
            // Signed out, or a shape we do not recognise. Either way we have
            // no identity to assert, so clear rather than leave a stale one.
            try { window.Sentry.setUser(null); } catch (e) {}
            return;
          }
          var ctx = shapeSentryUser({ id: u.id, roles: u.roles, role: u.role }, u.id);
          try { window.Sentry.setUser(ctx); } catch (e) {}
        })
        .catch(function () {
          // A failed read is not evidence of anything — no network, a 5xx, an
          // HTML error page from a proxy. Stay anonymous; never guess, and
          // never let this reject unhandled on a page it does not own.
        });
    } catch (e) {
      // Total, same reasoning as shapeSentryUser above.
    }
  }

  try {
    // release: only ever a real, non-empty string, never the literal word
    // "undefined" — a fabricated or missing release silently merges every
    // unversioned deploy into one bucket in the Sentry UI. The precompile
    // stamps window.SHAPE_RELEASE from VERCEL_GIT_COMMIT_SHA, matching the
    // Next.js app and the mobile bundle; absent, this degrades to "no
    // release" rather than inventing one.
    var release = window.SHAPE_RELEASE;
    // production | preview | development, stamped by the precompile from
    // VERCEL_ENV. ⚠ LOAD-BEARING on this surface: Vercel previews in this repo
    // share the production environment variables, so SHAPE_SITE_SENTRY_DSN IS
    // set on a preview deploy — without an explicit environment the SDK files
    // those events as production, and a PR/staging failure becomes
    // indistinguishable from a live one. Absent => key omitted, SDK default.
    var env = window.SHAPE_ENV;
    window.Sentry.init({
      dsn: dsn,
      release: (typeof release === "string" && release) ? release : undefined,
      environment: (typeof env === "string" && env) ? env : undefined,
      // Layer 1 is capture-only: no tracing, no replay, no feedback.
      tracesSampleRate: 0,
      // ⚠ LOAD-BEARING. Left at its default this SDK can attach the visitor's
      // IP address and other request-derived identifiers. Only id, roles and
      // is_coach may ever reach Sentry from this platform, and this surface
      // sends none of the three (see below) — so the only PII it could
      // possibly leak is what the SDK adds on its own. Explicit false, on
      // every init, matches sentry.server.config.ts, instrumentation-client.ts
      // and mobile-app/src/sentry.mjs. Never flip this to true.
      sendDefaultPii: false,
      initialScope: {
        tags: { shape_surface: shapeSurfaceTag() }
      }
    });

    // User context. This block used to say none was attached, because
    // src/lib/sentry-context.mjs is a Node ESM module and this no-bundler
    // surface cannot import it — so the only options were "copy its rules
    // into a third file" or "wire a runtime module import", both out of
    // scope for that task's two-file limit. The first option is taken now,
    // as a MIRROR under a drift test, which is the shape this repo already
    // uses for exactly this problem: public/age-derive.js mirrors
    // src/lib/age-derive.mjs, and tests/age-derive-mirror.test.mjs runs BOTH
    // over a vector table plus a fuzz sweep and fails on the first
    // disagreement. tests/sentry-user-mirror.test.mjs does the same here.
    //
    // ⚠ MOST OF THIS SURFACE IS THE SIGNED-IN DASHBOARD, which is why the
    // omission mattered: pageShell.jsx's consumers are ClientApp /
    // TrainerApp / NutritionistApp and their sub-pages, so "no user context"
    // meant every dashboard error on the website arrived anonymous.
    attachShapeUser();
  } catch (e) {
    // A Sentry init failure must never surface as a page-breaking error —
    // that would make the error-tracking layer itself a source of errors.
    // Still worth a console line: silent here reads identically to "no
    // DSN configured," which would hide a real init-time bug (a bad
    // option shape, a future SDK breaking change) from anyone debugging
    // in devtools.
    console.warn("[shape] Sentry init threw — error tracking is inert on this page.", e);
  }
})();
