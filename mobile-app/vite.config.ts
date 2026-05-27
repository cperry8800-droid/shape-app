import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // When the bundle is hosted at /m/ on the Next.js site (browser preview),
  // override with VITE_BASE=/m/ — see scripts in package.json.
  base: process.env.VITE_BASE || './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
  },
});
