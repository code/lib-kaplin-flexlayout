// @vitest-environment jsdom
import * as React from "react";
import { ITabRenderValues, TabNode } from "../src";
import { createController, makeModel } from "./view/testUtils";
import {
    copyInlineStyles,
    enablePointerOnIFrames,
    focusFirstIn,
    getElementsByTagName,
    getPageMetrics,
    getRenderStateEx,
    isAuxMouseEvent,
    isDesktop,
    isSafari,
    startDrag,
    Utils_dragging,
} from "../src/view/Utils";

const originalMatchMedia = window.matchMedia;
const originalUserAgent = navigator.userAgent;

afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(navigator, "userAgent", { value: originalUserAgent, configurable: true });
    // avoid focus leaking between tests and clear appended elements
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.replaceChildren();
});

describe("isDesktop", () => {
    it("is false when the environment is not a fine pointer", () => {
        // setup.ts stubs matchMedia with matches:false
        expect(isDesktop()).equal(false);
    });

    it("is true when the environment is a fine pointer", () => {
        window.matchMedia = (query: string) =>
            ({
                matches: query === "(hover: hover) and (pointer: fine)",
                media: query,
            }) as unknown as MediaQueryList;
        expect(isDesktop()).equal(true);
    });
});

describe("isSafari", () => {
    it("is false for a generic browser", () => {
        expect(isSafari()).equal(false);
    });

    it("is true only for Safari and not Chrome/Chromium", () => {
        Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", configurable: true });
        expect(isSafari()).equal(true);

        Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 ... Chrome/120.0 Safari/605.1.15", configurable: true });
        expect(isSafari()).equal(false);

        Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 ... Chromium/120.0 Safari/605.1.15", configurable: true });
        expect(isSafari()).equal(false);
    });
});

describe("isAuxMouseEvent", () => {
    // the real callers pass React synthetic events, which expose the modifier flags directly
    // and the raw button on nativeEvent
    const reactEvent = (native: Event, mods: Partial<Pick<React.MouseEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">> = {}) =>
        ({
            nativeEvent: native,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            ...mods,
        }) as unknown as React.MouseEvent<HTMLElement, MouseEvent>;

    it("is false for a plain left click without modifiers", () => {
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click", { button: 0 })))).equal(false);
    });

    it("is true for non-left buttons", () => {
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click", { button: 1 })))).equal(true);
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click", { button: 2 })))).equal(true);
    });

    it("is true when any modifier key is held", () => {
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click"), { ctrlKey: true }))).equal(true);
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click"), { shiftKey: true }))).equal(true);
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click"), { altKey: true }))).equal(true);
        expect(isAuxMouseEvent(reactEvent(new MouseEvent("click"), { metaKey: true }))).equal(true);
    });

    it("is false for a non-mouse native event (e.g. touch)", () => {
        expect(isAuxMouseEvent(reactEvent(new TouchEvent("touchstart")))).equal(false);
    });
});

describe("startDrag", () => {
    it("tracks pointermove/pointerup and clears the dragging flag", () => {
        const drag = vi.fn();
        const dragEnd = vi.fn();
        const dragCancel = vi.fn();
        const preventDefault = vi.fn();
        const event = { preventDefault } as unknown as React.PointerEvent<HTMLElement>;

        startDrag(document, event, drag, dragEnd, dragCancel);

        expect(preventDefault).toHaveBeenCalled();
        expect(Utils_dragging).equal(true);

        document.dispatchEvent(new PointerEvent("pointermove", { clientX: 11, clientY: 22 }));
        expect(drag).toHaveBeenCalledWith(11, 22);

        document.dispatchEvent(new PointerEvent("pointerup"));
        expect(dragEnd).toHaveBeenCalledTimes(1);
        expect(Utils_dragging).equal(false);

        // listeners are removed, so a later move is ignored
        document.dispatchEvent(new PointerEvent("pointermove", { clientX: 1, clientY: 2 }));
        expect(drag).toHaveBeenCalledTimes(1);
    });

    it("cancels on pointercancel", () => {
        const drag = vi.fn();
        const dragEnd = vi.fn();
        const dragCancel = vi.fn();
        startDrag(document, { preventDefault: () => {} } as unknown as React.PointerEvent<HTMLElement>, drag, dragEnd, dragCancel);

        document.dispatchEvent(new PointerEvent("pointercancel"));
        expect(dragCancel).toHaveBeenCalledTimes(1);
        expect(dragEnd).not.toHaveBeenCalled();
        expect(Utils_dragging).equal(false);
    });
});

describe("copyInlineStyles", () => {
    it("returns false and changes nothing when styles are equal", () => {
        const source = document.createElement("div");
        const target = document.createElement("div");
        source.setAttribute("style", "color: red");
        target.setAttribute("style", "color: red");
        expect(copyInlineStyles(source, target)).equal(false);
        expect(target.getAttribute("style")).equal("color: red");
    });

    it("copies the source style onto the target", () => {
        const source = document.createElement("div");
        const target = document.createElement("div");
        source.setAttribute("style", "display: flex");
        target.setAttribute("style", "color: red");
        expect(copyInlineStyles(source, target)).equal(true);
        expect(target.getAttribute("style")).equal("display: flex");
    });

    it("clears the target style when the source has none", () => {
        const source = document.createElement("div");
        const target = document.createElement("div");
        target.setAttribute("style", "color: red");
        expect(copyInlineStyles(source, target)).equal(true);
        expect(target.hasAttribute("style")).equal(false);
    });
});

describe("enablePointerOnIFrames", () => {
    it("toggles pointer events on iframes and webviews", () => {
        const iframe = document.createElement("iframe");
        const webview = document.createElement("webview");
        document.body.append(iframe, webview);

        enablePointerOnIFrames(true, document);
        expect(iframe.style.pointerEvents).equal("auto");
        expect(webview.style.pointerEvents).equal("auto");

        enablePointerOnIFrames(false, document);
        expect(iframe.style.pointerEvents).equal("none");
        expect(webview.style.pointerEvents).equal("none");
    });

    it("getElementsByTagName returns matching elements", () => {
        document.body.append(document.createElement("iframe"));
        expect(getElementsByTagName("iframe", document)).toHaveLength(1);
        expect(getElementsByTagName("span", document)).toEqual([]);
    });
});

describe("focusFirstIn", () => {
    it("focuses the first focusable element", () => {
        const container = document.createElement("div");
        const button = document.createElement("button");
        const plain = document.createElement("div");
        container.append(button, plain);
        document.body.append(container);

        focusFirstIn(container);
        expect(document.activeElement).equal(button);
    });

    it("falls back to the container when nothing is focusable", () => {
        const container = document.createElement("div");
        container.tabIndex = -1; // the container is not a match for the selector, so this exercises the fallback
        container.append(document.createElement("div"));
        document.body.append(container);

        focusFirstIn(container);
        expect(document.activeElement).equal(container);
    });

    it("is a no-op for null", () => {
        expect(() => focusFirstIn(null)).not.toThrow();
    });
});

describe("getPageMetrics", () => {
    it("falls back through scroll/offset/client values", () => {
        const body = {
            scrollHeight: 100,
            scrollWidth: 120,
            offsetHeight: 50,
            offsetWidth: 60,
            clientHeight: 25,
            clientWidth: 30,
            scrollTop: 5,
            scrollLeft: 6,
        } as unknown as HTMLElement;
        const docEl = {
            scrollHeight: 200,
            scrollWidth: 220,
            offsetHeight: 150,
            offsetWidth: 170,
            clientHeight: 125,
            clientWidth: 140,
            scrollTop: 7,
            scrollLeft: 8,
        } as unknown as HTMLElement;
        const win = {
            pageYOffset: 10,
            pageXOffset: 20,
            innerHeight: 500,
            innerWidth: 800,
            document: { body, documentElement: docEl },
        } as unknown as Window;

        const metrics = getPageMetrics(win);
        expect(metrics.scrollTop).equal(10);
        expect(metrics.scrollLeft).equal(20);
        expect(metrics.fullHeight).equal(200);
        expect(metrics.fullWidth).equal(220); // max of the document scroll/offset/client widths
        expect(metrics.viewportHeight).equal(500);
        expect(metrics.viewportWidth).equal(800);
    });
});

describe("getRenderStateEx", () => {
    it("builds a render state with name content and no leading icon", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "A" }] }] },
        });
        const controller = createController(model);
        const tab = model.getNodeById("t0") as TabNode;

        const state = getRenderStateEx(controller, tab);
        expect(state.name).equal("A");
        expect(state.content).equal("A");
        expect(state.leading).equal(undefined);
        expect(state.buttons).toEqual([]);
        expect(tab.getNameForOverflowMenu()).equal("A");
    });

    it("renders the tab icon with and without a rotation", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "A", icon: "icon.png" }] }] },
        });
        const controller = createController(model);
        const tab = model.getNodeById("t0") as TabNode;

        const flat = getRenderStateEx(controller, tab) as { leading: React.ReactElement<{ src: string; style: React.CSSProperties }> };
        expect(flat.leading.props.src).equal("icon.png");
        expect(flat.leading.props.style.transform).equal(undefined);

        const rotated = getRenderStateEx(controller, tab, 45) as { leading: React.ReactElement<{ src: string; style: React.CSSProperties }> };
        expect(rotated.leading.props.style.transform).equal("rotate(45deg)");
    });

    it("lets customizeTab override the content and name", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "A" }] }] },
        });
        const customContent = React.createElement("span", null, "custom");
        const controller = createController(model, {
            onRenderTab: (_node, renderValues) => {
                // the runtime renderState supports a customized name (used for the tab's
                // aria-label and overflow-menu entry), even though ITabRenderValues omits it
                (renderValues as ITabRenderValues & { name: string }).name = "renamed";
                renderValues.content = customContent;
            },
        });
        const tab = model.getNodeById("t0") as TabNode;

        const state = getRenderStateEx(controller, tab);
        expect(state.name).equal("renamed");
        expect(state.content).equal(customContent);
        expect(tab.getNameForOverflowMenu()).equal("renamed");
    });
});
