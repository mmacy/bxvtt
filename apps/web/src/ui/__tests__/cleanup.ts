// Vitest runs without globals here, so Testing Library cannot register its own cleanup.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
