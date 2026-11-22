import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  resolve: {
    // `@/app` names the app layer's barrel. Spelled out, because on a case-insensitive disk `src/app` would
    // otherwise resolve to `src/App.tsx`.
    alias: [
      { find: /^@\/app$/, replacement: fileURLToPath(new URL('./src/app/index.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
