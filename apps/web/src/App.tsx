import { useSyncExternalStore } from 'react';
import { KitProvider } from './ui';
import { KitGallery, KitTableMock } from './ui/gallery';

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

// Until the app router lands, the root shows the kit gallery. `#/kit/table` shows the table
// layout mock at full size.
export function App() {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => '',
  );
  return <KitProvider>{hash === '#/kit/table' ? <KitTableMock fullscreen /> : <KitGallery />}</KitProvider>;
}
