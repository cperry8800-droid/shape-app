import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // When the bundle is hosted at /m/ on the Next.js site (browser preview),
  // override with VITE_BASE=/m/ — see scripts in package.json.
  base: process.env.VITE_BASE || './',
  resolve: {
    // noraStage.mjs (in ../public/newdesign) uses bare 'three' and '@pixiv/three-vrm'
    // specifiers. When Vite bundles it from outside node_modules it can't find them,
    // so we pin both to this mobile-app's own node_modules copies (same versions as
    // the web import-map — three@0.169.0 + @pixiv/three-vrm@3.1.6).
    alias: [
      // noraStage.mjs (cross-root, in ../public/newdesign/) uses bare 'three',
      // 'three/addons/*', and '@pixiv/three-vrm'. Pin them to this mobile-app's
      // node_modules so Vite/rolldown can bundle them even from outside the app root.
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
    sourcemap: true,
    target: 'esnext',
  },
});
