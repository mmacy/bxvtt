import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const serverUrl = process.env.BXVTT_SERVER_URL ?? 'http://127.0.0.1:8660';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
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
