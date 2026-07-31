// shared vitest setup. Runs once per test file, in that file's environment.
import "@testing-library/jest-dom/vitest";

// jsdom does not implement these browser APIs. Install minimal stand-ins so the view
// components that touch them (LayoutInternal, TabOverflowHook, Splitter, ...) can render
// under the jsdom environment. The stubs are guarded so the node-environment tests (the
// majority) are unaffected.
if (typeof window !== "undefined") {
    if (window.matchMedia === undefined) {
        window.matchMedia = (query: string): MediaQueryList =>
            ({
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

    if (window.ResizeObserver === undefined) {
        window.ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof ResizeObserver;
    }

    if (window.requestAnimationFrame === undefined) {
        window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
        window.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
    }

    // jsdom measures everything as 0x0, which starves the layout of any geometry: the tab
    // content portals only mount once a tabset's content rect has a nonzero size, and the
    // measure pass would overwrite any preset geometry with zeros. Report a small fixed size
    // for every element so the render pipeline has geometry to work with.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", { configurable: true, get: () => 0 });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true, get: () => 0 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: function getBoundingClientRect() {
            return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => {} };
        },
    });
}
