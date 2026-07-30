import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest.config.ts sets `globals: false`, so Testing Library's automatic
// afterEach(cleanup) detection doesn't fire — without this, each render()
// stays mounted and later tests see duplicate elements from prior tests.
afterEach(() => {
    cleanup();
});

// antd's responsive Grid observer calls window.matchMedia, which jsdom does not
// implement. Stubbed here (not app behavior) purely so components using antd
// <Table>/<Grid> can mount under jsdom.
if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
