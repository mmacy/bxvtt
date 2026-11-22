import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const serverUrl = process.env.BXVTT_SERVER_URL ?? 'http://127.0.0.1:8660';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@/app` names the app layer's barrel. Spelled out, because on a case-insensitive disk `src/app` would
    // otherwise resolve to `src/App.tsx`.
    alias: [
      { find: /^@\/app$/, replacement: fileURLToPath(new URL('./src/app/index.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  build: {
    rollupOptions: {
      treeshake: {
        // The shared package's modules only define schemas, data, and functions, so a module whose exports
        // nothing uses can go. Without this, the home page would ship every zod schema and the whole text layer.
        // The web app's own modules say the same in its package.json `sideEffects`.
        moduleSideEffects: (id) => !id.includes('/packages/shared/src/'),
      },
    },
  },
  server: {
    port: Number(process.env.BXVTT_WEB_PORT ?? 5180),
    strictPort: true,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: false },
      '/ws': { target: serverUrl, ws: true },
    },
  },
});
