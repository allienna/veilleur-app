// Vitest global setup: jest-dom matchers + jsdom polyfills the PWA touches.
import "@testing-library/jest-dom/vitest";

// matchMedia is used by reduced-motion / dark-mode checks and is absent in jsdom.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
