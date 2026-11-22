/**
 * The web client's own Vite config with a separate dependency cache, so the suite's Vite server never fights a
 * developer's Vite server over `node_modules/.vite`.
 */
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from '../../apps/web/vite.config';

export default mergeConfig(base, {
  root: fileURLToPath(new URL('../../apps/web', import.meta.url)),
  cacheDir: fileURLToPath(
    new URL(`../../.data/e2e/vite-cache-${process.env.BXVTT_WEB_PORT ?? 'default'}`, import.meta.url),
  ),
  clearScreen: false,
  // An edit to the source while the suite runs must not reload a page in the middle of a test.
  server: { hmr: false },
});
