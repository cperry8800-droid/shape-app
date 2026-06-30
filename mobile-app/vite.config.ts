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
    // No sourcemaps in the published /m/ bundle. They embed absolute build paths
    // (Windows `C:\Users\…` vs CI's Linux `/home/runner/…`) into the .map files,
    // so a locally-built public/m never byte-matches CI's Linux build and the
    // "Mobile (build + public/m sync)" check fails. Only this branch is affected —
    // it's the one that bundles `three`/three-vrm (the Nora avatar) via the
    // absolute-path resolve.alias above. Dropping prod maps also stops shipping
    // ~5 MB of source to a public URL. (Dev server keeps its own sourcemaps.)
    sourcemap: false,
    target: 'esnext',
  },
});
