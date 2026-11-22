import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppKitProvider, ShortcutLayer, useIdentity } from '@/app';
import { HomePage, JoinPage, NotFoundPage } from '@/features/home';
// A direct import, because the shell's barrel also exports the play screen, which loads on demand.
import { LoadingScreen } from '@/features/table/LoadingScreen';
import { TablePagePart } from '@/features/table/parts';
import { ErrorBoundary } from '@/ui';

// A table page loads on demand, and its lobby, play screen, and map load alongside it (`features/table/parts`).
// The design system gallery is a development page, so it loads only when someone opens it.
const TablePage = TablePagePart;
const KitGallery = lazy(() => import('@/ui/gallery').then((module) => ({ default: module.KitGallery })));
const KitTableMock = lazy(() => import('@/ui/gallery').then((module) => ({ default: module.KitTableMock })));

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
            <Route
              path="/tables/:tableId"
              element={
                <Suspense fallback={<LoadingScreen label="Opening the table" />}>
                  <TablePage />
                </Suspense>
              }
            />
            <Route
              path="/kit"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <KitGallery />
                </Suspense>
              }
            />
            <Route
              path="/kit/table"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <KitTableMock fullscreen />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ErrorBoundary>
        <ShortcutLayer />
      </BrowserRouter>
    </AppKitProvider>
  );
}
