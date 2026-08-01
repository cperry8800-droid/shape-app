import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

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
          // build-m.sh deletes every .map from public/m as its final step; the
          // plugin must NOT also delete them from dist/ before that copy, or the
          // two cleanup paths race over the same files.
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
    // never reachable. Without hidden maps every mobile stack trace is unreadable;
    // with them alone (no deletion) this would publish ~5 MB of source at a public
    // URL — see build-m.sh for the other half of this contract.
    //
    // (The old build-path-divergence rationale for `sourcemap: false` no longer
    // applies: public/m is built fresh on Vercel's Linux host by build-m.sh, never
    // committed from a local Windows checkout, so there is no cross-platform byte-diff
    // to protect against.)
    sourcemap: 'hidden',
    target: 'esnext',
  },
});
