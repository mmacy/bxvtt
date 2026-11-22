import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Harness } from './Harness';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
}
