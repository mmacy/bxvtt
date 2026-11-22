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
  server: {
    port: Number(process.env.BXVTT_WEB_PORT ?? 5180),
    strictPort: true,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: false },
      '/ws': { target: serverUrl, ws: true },
    },
  },
});
