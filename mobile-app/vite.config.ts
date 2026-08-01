import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';
import fs from 'node:fs';

// Sourcemap upload to Sentry. Without this the maps below are generated and then
// deleted by build-m.sh, so every mobile stack trace arrives MINIFIED and the
// runbook's own symbolication check ("confirm it arrives symbolicated, not a
// minified blob") could never pass — the maps existed but nothing ever shipped
// them anywhere they could be used.
//
// ⚠ ALL THREE vars required, and SENTRY_PROJECT_MOBILE is deliberately its own:
// SENTRY_PROJECT names the Next.js project (next.config.ts uses it), and the
// mobile app is a SEPARATE Sentry project with its own release stream. Pointing
// both at one slug would file mobile maps against web releases, where they match
// nothing. Any var missing => the plugin is not added at all, so a build with no
// Sentry configured behaves exactly as it does today (no upload, no warning, no
// failure) — which is the state of every build until the owner creates the org.
const sentryUpload =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT_MOBILE
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT_MOBILE,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          // Match the release string build-m.sh bakes into the bundle via
          // VITE_SHAPE_RELEASE, or uploaded maps associate with a release no
          // event ever reports and symbolication silently does nothing.
          release: { name: process.env.VITE_SHAPE_RELEASE || undefined },
          // Deletion is owned by the `stripSourcemaps` plugin below, NOT here.
          // That one runs for EVERY build (this plugin only exists when Sentry
          // is configured), so it is the only cleanup that covers an
          // unconfigured build too. `[]` is a no-op either way — this option
          // has no default (@sentry/bundler-plugins build-plugin-manager.js:
          // `if (filesToDelete !== void 0)`), so it behaves exactly as if
          // omitted; it is stated explicitly so nobody adds a deletion here
          // that would race the plugin below over the same files.
          sourcemaps: { filesToDeleteAfterUpload: [] },
          // Off by default in this repo: the plugin otherwise reports its own
          // issues/performance to Sentry from the build machine, which is an
          // outbound data flow nobody opted into by setting a DSN.
          telemetry: false,
          // ⚠ LOAD-BEARING, verified not assumed: with no errorHandler the
          // plugin THROWS and stops the bundle (its own docs say so), so a
          // Sentry outage or a stale token would break the deploy. Proven
          // locally with deliberately invalid credentials — the upload failed,
          // this warning printed, and the build still exited 0.
          errorHandler: (err) => {
            console.warn('[shape] Sentry sourcemap upload failed — mobile traces will be minified.', err?.message || err);
          },
        }),
      ]
    : [];

// Strip every .map from dist/ once the build is done.
//
// ⚠ dist/ IS THE ONE CHOKEPOINT, which is why the strip lives here and not in a
// CI step. `webDir: 'dist'` (capacitor.config.ts:6) means `npx cap sync android`
// copies it verbatim into android/app/src/main/assets/public, and `npx cap sync
// ios` into ios/App/App/public — which Xcode carries into the .app as a FOLDER
// REFERENCE (project.pbxproj: `lastKnownFileType = folder; path = public`),
// recursively and unfiltered. Nothing downstream filters maps out: Android's
// aaptOptions.ignoreAssetsPattern lists only dotfiles/VCS junk and has no
// `*.map` entry. scripts/build-m.sh separately `cp -r`s dist/ into public/m.
// If dist/ never retains maps, no consumer can ship them — one fix covers
// Android CI, Codemagic iOS, build-m.sh, and local Xcode/Android Studio builds.
//
// Why it matters: this branch flipped `sourcemap: false` -> 'hidden', which put
// 26 .map files / 13.85 MB into a 33.5 MB dist/ (41%). Those are dead weight in
// a shipping binary, NOT a disclosure — this repo is public, so the maps expose
// nothing that isn't already on github.com. Size is the whole defect.
//
// ⚠ ORDERING IS SAFE BY CONSTRUCTION, NOT BY LUCK: @sentry/vite-plugin does its
// upload inside `writeBundle` (@sentry/bundler-plugins build/cjs/rollup/index.js:186)
// and Rollup fires `closeBundle` only after every `writeBundle` has resolved, so
// the upload always reads the maps before this deletes them. If that ever
// inverted, the upload would send nothing and every mobile stack trace would
// arrive minified — with no error and an exit code of 0. Before trusting it,
// confirm the upload log line AND a real symbolicated event from an APK.
//
// KEEP_SOURCEMAPS=1 retains them for local inspection of a prod build.
//
// Deliberately NOT wrapped in try/catch: if a map cannot be deleted (permissions,
// a locked file) the build must FAIL rather than continue and ship it. Loud beats
// silent here — the Android jobs have a CI assertion behind this, but the iOS
// TestFlight path has none, so this is the only guard on the App Store build.
const stripSourcemaps = {
  name: 'shape-strip-sourcemaps',
  apply: 'build' as const,
  enforce: 'post' as const,
  closeBundle() {
    if (process.env.KEEP_SOURCEMAPS) return;
    const dir = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(dir)) return;
    let n = 0;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.map')) { fs.rmSync(p); n++; }
      }
    };
    walk(dir);
    console.log(`[shape] stripped ${n} sourcemap(s) from dist/`);
  },
};

export default defineConfig({
  plugins: [
    react(),
    ...sentryUpload,
    // Force LF in the emitted index.html. The source template has mixed CRLF/LF,
    // and the build preserves the OS's line endings — so a Windows-built index.html
    // (CRLF) never byte-matches CI's Linux build (LF), failing the public/m sync
    // check. Normalizing on emit makes the output identical on every platform.
    {
      name: 'normalize-index-html-eol',
      transformIndexHtml: {
        order: 'post' as const,
        handler: (html: string) => html.replace(/\r\n?/g, '\n'),
      },
    },
    // Last: deletes dist/**/*.map in closeBundle, after the Sentry upload's
    // writeBundle has resolved. See the block above it.
    stripSourcemaps,
  ],
  // When the bundle is hosted at /m/ on the Next.js site (browser preview),
  // override with VITE_BASE=/m/ — see scripts in package.json.
  base: process.env.VITE_BASE || './',
  resolve: {
    // noraStage.mjs (in ../public/newdesign) uses bare 'three' and '@pixiv/three-vrm'
    // specifiers. When Vite bundles it from outside node_modules it can't find them,
    // so we pin both to this mobile-app's own node_modules copies (same versions as
    // the web import-map — three@0.169.0 + @pixiv/three-vrm@3.1.6).
    alias: [
      {
        find: /^three\/addons\/(.*)/,
        replacement: path.resolve(__dirname, 'node_modules/three/examples/jsm/$1'),
      },
      {
        find: 'three',
        replacement: path.resolve(__dirname, 'node_modules/three/build/three.module.js'),
      },
      {
        find: '@pixiv/three-vrm',
        replacement: path.resolve(__dirname, 'node_modules/@pixiv/three-vrm'),
      },
    ],
  },
  server: {
    host: true,
    port: 5173,
    // shapeSignals.js imports the canonical engine from ../public/newdesign
    // (one source of truth shared with the website + Node tests).
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    // Hidden sourcemaps: generated (for eventual Sentry upload / local symbolication)
    // but NO `//# sourceMappingURL=` comment is emitted in the bundle, so a browser
    // never fetches them. That is NOT the same as "not served" — the .map files are
    // still written to dist/, and scripts/build-m.sh does a wholesale
    // `cp -r mobile-app/dist public/m`, so anything left in dist/ ships to the public
    // `/m/` URL. build-m.sh therefore deletes every .map from public/m as its final
    // step (after any future Sentry upload), so maps exist for symbolication but are
    // never reachable. Without hidden maps every mobile stack trace is unreadable.
    //
    // ⚠ build-m.sh IS NOT THE OTHER HALF OF THIS CONTRACT — that claim used to be
    // here and it was false. build-m.sh runs ONLY as the Vercel buildCommand
    // (vercel.json), so it covers the hosted /m/ bundle and nothing else. It never
    // runs in .github/workflows/android-build.yml, never in codemagic.yaml's iOS
    // TestFlight build, and never in a local Xcode/Android Studio build — all of
    // which copy dist/ straight into a native app. The `stripSourcemaps` plugin
    // above is what actually covers those paths; build-m.sh's own delete is now a
    // redundant backstop that finds nothing.
    //
    // ⚠ Do NOT "simplify" this to `sourcemap: true` or `false`. `true` emits a
    // `//# sourceMappingURL=` comment pointing at files the strip deletes (404s on
    // every load); `false` produces no maps at all, so the Sentry upload has
    // nothing to send and every mobile trace arrives minified. 'hidden' — generate,
    // upload, then strip — is the only combination that satisfies both.
    //
    // (The old build-path-divergence rationale for `sourcemap: false` no longer
    // applies: public/m is built fresh on Vercel's Linux host by build-m.sh, never
    // committed from a local Windows checkout, so there is no cross-platform byte-diff
    // to protect against.)
    sourcemap: 'hidden',
    target: 'esnext',
  },
});
