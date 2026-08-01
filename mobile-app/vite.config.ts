import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
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
