/**
 * A part of the app that loads on demand, like `React.lazy`, and that can start loading early with `preload()`.
 * Once its module has loaded, the part renders at once instead of suspending. That matters because React holds
 * back each Suspense boundary's content for up to 300 ms after it showed a fallback, so a chain of lazy parts that
 * each suspend costs a visitor that much per link, even with every module cached.
 *
 * ```tsx
 * export const PlayShellPart = lazyPart(() => import('./PlayShell').then((module) => module.PlayShell));
 * PlayShellPart.preload(); // as soon as the page knows it will need it
 * <Suspense fallback={<LoadingScreen />}><PlayShellPart /></Suspense>
 * ```
 */
import { createElement, lazy, type ComponentType, type ReactElement } from 'react';

export interface LazyPart<P extends object> {
  (props: P): ReactElement;
  /** Starts loading the part's module, once, and resolves when it has loaded. */
  preload: () => Promise<ComponentType<P>>;
}

/**
 * Wraps a component that loads on demand.
 *
 * @param load - Imports the module and returns the component, such as
 *   `() => import('./PlayShell').then((module) => module.PlayShell)`.
 */
export function lazyPart<P extends object>(load: () => Promise<ComponentType<P>>): LazyPart<P> {
  let loaded: ComponentType<P> | null = null;
  let loading: Promise<ComponentType<P>> | null = null;
  const preload = () => {
    loading ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        // A later render tries again, and its error boundary shows a failure that repeats.
        loading = null;
        throw error;
      },
    );
    return loading;
  };
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));
  const Part = (props: P) => createElement((loaded ?? Lazy) as ComponentType<P>, props);
  Part.preload = preload;
  return Part;
}
