import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles';
import { App } from './App';
import { isTablePath, preloadTableScreens } from './features/table/parts';

const container = document.getElementById('root');
if (!container) throw new Error('The page has no #root element.');

const root = createRoot(container);
const render = () =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
// A table's address fetches every part of the table page in parallel, and renders once the table page itself has
// loaded, so the first render doesn't suspend.
if (isTablePath(window.location.pathname)) void preloadTableScreens().then(render);
else render();
