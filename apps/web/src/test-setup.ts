import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals here, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
});

// jsdom lacks a few browser APIs that Radix components call when they open: popper content measures itself with
// `ResizeObserver`, Select and Slider capture the pointer, menus and lists scroll the active item into view, and
// the kit's hooks read media queries. These stand-ins do nothing, so any kit component can open in a test.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;

const elementProto = Element.prototype;
elementProto.hasPointerCapture ??= () => false;
elementProto.setPointerCapture ??= () => {};
elementProto.releasePointerCapture ??= () => {};
elementProto.scrollIntoView ??= () => {};

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
