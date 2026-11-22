import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppKitProvider, ShortcutLayer, useIdentity } from '@/app';
import { HomePage, JoinPage, NotFoundPage } from '@/features/home';
import { TablePage } from '@/features/table';
import { ErrorBoundary } from '@/ui';
import { KitGallery, KitTableMock } from '@/ui/gallery';

/**
 * The app's routes:
 *
 * - `/`: home, with first-run name entry, the user's tables, and creating and joining a table.
 * - `/join/:code`: joins a table by its invite link, asking a new visitor for a name first.
 * - `/tables/:tableId`: the table's lobby before the game starts, and the play screen after.
 * - `/kit` and `/kit/table`: the design system gallery and the table layout mock, for development.
 */
export function App() {
  const load = useIdentity((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppKitProvider>
      <BrowserRouter>
        <ErrorBoundary area="This page">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/join/:code" element={<JoinPage />} />
            <Route path="/tables/:tableId" element={<TablePage />} />
            <Route path="/kit" element={<KitGallery />} />
            <Route path="/kit/table" element={<KitTableMock fullscreen />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ErrorBoundary>
        <ShortcutLayer />
      </BrowserRouter>
    </AppKitProvider>
  );
}
