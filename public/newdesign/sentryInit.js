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

  try {
    // release: only ever a real, non-empty string, never the literal word
    // "undefined" — a fabricated or missing release silently merges every
    // unversioned deploy into one bucket in the Sentry UI. The precompile
    // stamps window.SHAPE_RELEASE from VERCEL_GIT_COMMIT_SHA, matching the
    // Next.js app and the mobile bundle; absent, this degrades to "no
    // release" rather than inventing one.
    var release = window.SHAPE_RELEASE;
    window.Sentry.init({
      dsn: dsn,
      release: (typeof release === "string" && release) ? release : undefined,
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

    // No user context is attached on this surface, deliberately. The
    // shared, PII-free derivation the rest of this repo uses for that
    // (src/lib/sentry-context.mjs — id/roles/is_coach only, never
    // email/name/phone/stripe_customer_id) is a Node ESM module meant to
    // be imported by a bundler (Next.js, Vite); this no-bundler,
    // in-browser-Babel surface has no way to reach it at runtime without
    // either copying its rules into a third file or wiring a runtime
    // module import — both out of scope for the two-file limit on this
    // task. The shape_surface tag above is NOT a substitute for that — it
    // is derived purely from the URL, carries no identity, and is safe to
    // set unconditionally. Skipping real user context here is the
    // documented fallback, not an oversight.
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
