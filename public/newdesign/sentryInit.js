// public/newdesign/sentryInit.js
//
// Error-tracking loader for the static website (public/newdesign/*.html — the
// marketing + dashboard pages, served as plain files and compiled in-browser
// by Babel, no bundler). This is Task 4 of the error-tracking plan; Tasks 2
// and 3 wired @sentry/nextjs and @sentry/capacitor+@sentry/react into the
// Next.js app and the mobile bundle respectively — this surface has neither
// npm nor a build step that could install an SDK, so it loads Sentry's
// browser CDN bundle instead (https://docs.sentry.io/platforms/javascript/install/cdn/).
//
// Loaded once from public/newdesign/pageShell.jsx (the one shared file across
// all 69 newdesign pages) — see the comment there for why. This file also
// re-checks the DSN itself, so it stays a genuine no-op even if something
// ever loads it directly instead of through that hook.
//
// ⚠ NO DSN EXISTS YET. window.SHAPE_SENTRY_DSN mirrors the
// window.SHAPE_TURNSTILE_SITEKEY precedent in public/supabase.js (a window
// global gates behavior on its presence) but carries no fallback value — see
// pageShell.jsx, the only place that assigns it. With no DSN configured, the
// guard below is the LAST thing this file does: no <script> element is ever
// created, nothing is ever fetched, and nothing here ever talks to Sentry.
(function () {
  if (typeof window === "undefined") return;

  var dsn = window.SHAPE_SENTRY_DSN;
  if (!dsn) return; // inert — no DSN, no network request of any kind

  if (document.querySelector('script[data-shape-sentry-cdn]')) return; // already loading/loaded

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
      if (!window.Sentry || typeof window.Sentry.init !== "function") return;

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
      });

      // No user context is attached on this surface, deliberately. The
      // shared, PII-free derivation the rest of this repo uses for that
      // (src/lib/sentry-context.mjs — id/roles/is_coach only, never
      // email/name/phone/stripe_customer_id) is a Node ESM module meant to
      // be imported by a bundler (Next.js, Vite); this no-bundler,
      // in-browser-Babel surface has no way to reach it at runtime without
      // either copying its rules into a third file or wiring a runtime
      // module import — both out of scope for the two-file limit on this
      // task. Skipping user context here is the documented fallback, not an
      // oversight.
    } catch (e) {
      // A Sentry init failure must never surface as a page-breaking error —
      // that would make the error-tracking layer itself a source of errors.
    }
  };
  s.onerror = function () {};
  document.head.appendChild(s);
})();
