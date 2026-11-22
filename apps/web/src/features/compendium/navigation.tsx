import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { HOME, routesEqual, type Route } from './model';

interface History {
  stack: Route[];
  index: number;
}

type Action =
  | { type: 'go'; route: Route }
  | { type: 'replace'; route: Route }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reset'; route: Route };

function reduce(state: History, action: Action): History {
  switch (action.type) {
    case 'go': {
      const current = state.stack[state.index];
      if (current && routesEqual(current, action.route)) return state;
      const stack = [...state.stack.slice(0, state.index + 1), action.route];
      return { stack, index: stack.length - 1 };
    }
    case 'replace': {
      const stack = [...state.stack];
      stack[state.index] = action.route;
      return { stack, index: state.index };
    }
    case 'back':
      return state.index > 0 ? { ...state, index: state.index - 1 } : state;
    case 'forward':
      return state.index < state.stack.length - 1 ? { ...state, index: state.index + 1 } : state;
    case 'reset':
      return { stack: [action.route], index: 0 };
  }
}

export interface Navigation {
  route: Route;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Opens a page and adds it to the history. */
  go: (route: Route) => void;
  back: () => void;
  forward: () => void;
  /** Starts a new history at a page, as when the book opens. */
  reset: (route: Route) => void;
}

/** The history of pages in the open book: back, forward, and opening a page. */
export function useNavigationState(initial: Route = HOME): Navigation {
  const [state, dispatch] = useReducer(reduce, { stack: [initial], index: 0 });
  const go = useCallback((route: Route) => dispatch({ type: 'go', route }), []);
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const forward = useCallback(() => dispatch({ type: 'forward' }), []);
  const reset = useCallback((route: Route) => dispatch({ type: 'reset', route }), []);
  return useMemo(
    () => ({
      route: state.stack[state.index] ?? HOME,
      canGoBack: state.index > 0,
      canGoForward: state.index < state.stack.length - 1,
      go,
      back,
      forward,
      reset,
    }),
    [state, go, back, forward, reset],
  );
}

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({ value, children }: { value: Navigation; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

/** The book's navigation. Entry views use it to link to one another. */
export function useNavigation(): Navigation {
  const value = useContext(NavigationContext);
  if (value === null) throw new Error('useNavigation needs a NavigationProvider.');
  return value;
}
