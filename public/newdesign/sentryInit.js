// public/newdesign/sentryInit.js
//
// Error-tracking loader for the static website (public/newdesign/*.html —
// mostly signed-in dashboard SPAs — ClientApp/TrainerApp/NutritionistApp and
// their sub-pages — plus the marketing pages, all served as plain files and
// compiled in-browser by Babel, no bundler). This is Task 4 of the
// error-tracking plan; Tasks 2 and 3 wired @sentry/nextjs and
// @sentry/capacitor+@sentry/react into the Next.js app and the mobile
// bundle respectively — this surface has neither npm nor a build step that
// could install an SDK, so it loads Sentry's browser CDN bundle instead
// (https://docs.sentry.io/platforms/javascript/install/cdn/).
//
// Loaded by scripts/build-newdesign.mjs, the deploy precompile, which injects
// `window.SHAPE_SENTRY_DSN = "<SHAPE_SITE_SENTRY_DSN>"` plus a deferred tag for
// this file into every page it rewrites. That is the only place the DSN is set
// — deliberately, because this surface has no bundler and therefore no
// `process.env` a runtime file like this one could read. This file re-checks
// the DSN itself regardless, so it stays a genuine no-op if it is ever loaded
// some other way.
//
// ⚠ NO DSN EXISTS YET, and with none configured the precompile injects NOTHING
// — neither the assignment nor the tag below it — so this file is not even
// fetched. If it somehow is, the guard below is the LAST thing it does: no
// <script> element is created, nothing is fetched, nothing talks to Sentry.
// (window.SHAPE_SENTRY_DSN mirrors the window.SHAPE_TURNSTILE_SITEKEY
// precedent in public/supabase.js — a window global gating behavior on its
// presence — but carries no fallback value: a placeholder would make an
// unconfigured site read as configured.)
(function () {
  if (typeof window === "undefined") return;

  var dsn = window.SHAPE_SENTRY_DSN;
  if (!dsn) return; // inert — no DSN, no network request of any kind

  if (document.querySelector('script[data-shape-sentry-cdn]')) return; // already loading/loaded

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

  // Errors-only CDN bundle (no tracing/replay/feedback — Layer 1 is capture
  // only, and this static surface stays simple per the plan). Pinned to the
  // exact version + SRI hash Sentry publishes for that bundle, matching the
  // @sentry/nextjs major version already pinned in package.json (Task 2).
  var SENTRY_CDN_URL = "https://browser.sentry-cdn.com/10.69.0/bundle.min.js";
  var SENTRY_CDN_SRI = "sha384-3CEt/dsT99DjKC3MgiUAiordZm0hoZjYMn6ioBvRKm+9A98CLWAUsQsk5XaPpjfU";

  var s = document.createElement("script");
  s.src = SENTRY_CDN_URL;
  s.crossOrigin = "anonymous";
  s.integrity = SENTRY_CDN_SRI;
  s.setAttribute("data-shape-sentry-cdn", "1");
  s.onload = function () {
    try {
      if (!window.Sentry || typeof window.Sentry.init !== "function") {
        // The bundle loaded (200 OK, SRI matched) but didn't attach the
        // expected global — a CDN response shape change, a future version
        // bump that renames the export, etc. Silent here would be
        // indistinguishable from "no DSN configured, working as intended."
        console.warn("[shape] Sentry CDN bundle loaded but window.Sentry.init is missing — error tracking stays inert on this page.");
        return;
      }

      // release: only ever a real, non-empty string, never the literal word
      // "undefined" — a fabricated or missing release silently merges every
      // unversioned deploy into one bucket in the Sentry UI. Nothing on this
      // static surface currently stamps a commit SHA into
      // window.SHAPE_RELEASE (unlike the Next.js app and the mobile bundle,
      // which both bake in VERCEL_GIT_COMMIT_SHA at build time), so this
      // degrades to "no release" today. Wiring one in later — a build-time
      // stamp read here — needs no change to this file.
      var release = window.SHAPE_RELEASE;
      window.Sentry.init({
        dsn: dsn,
        release: (typeof release === "string" && release) ? release : undefined,
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
  };
  s.onerror = function () {
    // Bundle failed to load: network blip, SRI mismatch after a future
    // version bump, or the CDN itself down. Never breaks the page, but a
    // human in devtools should be able to tell this apart from "no DSN."
    console.warn("[shape] Failed to load the Sentry CDN bundle (network, CDN, or SRI-integrity issue) — error tracking is inert on this page.");
  };
  document.head.appendChild(s);
})();
