import { test, expect, Page } from "@playwright/test";
import { dragSplitter, waitForBox } from "./helpers";

// Realtime splitter drag regression tests. With realtimeResize on (the demo default), a drag
// dispatches an ADJUST_WEIGHTS / ADJUST_BORDER_SPLIT action per pointermove; the optimized path in
// LayoutInternal mutates the row/tabset DOM flex-grow directly and re-measures without re-rendering
// the layout tree, falling back to a full re-render when the affected row is not measured by the
// main controller (float/popout windows). These tests assert the invariants that path must preserve:
// finite weights, a row that still fills its parent (weight conservation), cleanup of the drag
// outline, and a correct split when dragged inside a float window.

interface IJsonTabset {
    type: "tabset";
    weight: number;
    children: { type: "tab"; name: string; component: string; config?: { text: string } }[];
}

const ts = (name: string): IJsonTabset => ({
    type: "tabset",
    weight: 1,
    children: [{ type: "tab", name, component: "text", config: { text: name } }],
});

const bigLayout = () => ({
    global: {},
    borders: [],
    layout: {
        type: "row",
        children: [
            { type: "row", weight: 1, children: [ts("A"), ts("B"), ts("C"), ts("D")] },
            { type: "row", weight: 1, children: [ts("E"), ts("F"), ts("G"), ts("H")] },
        ],
    },
});

const floatLayout = () => ({
    global: {},
    borders: [],
    layout: { type: "row", children: [ts("A"), ts("B")] },
    subLayouts: {
        float1: {
            type: "float",
            layout: { type: "row", children: [ts("F1"), ts("F2")] },
            rect: { x: 300, y: 150, width: 400, height: 300 },
        },
    },
});

const gotoLayout = async (page: Page, name: string, json: unknown) => {
    await page.addInitScript(
        ({ name, json }) => {
            localStorage.setItem(name, JSON.stringify(json));
        },
        { name, json },
    );
    await page.goto("/demo?layout=" + name);
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(300); // settle
};

test("realtime row drag keeps weights finite and removes the drag outline", async ({ page }) => {
    await gotoLayout(page, "rt_small", bigLayout());
    const splitter = page.locator('[data-layout-path="/s0"]');
    await splitter.waitFor();
    const sr = await waitForBox(splitter, "/s0");

    const result = await page.evaluate(
        ({ cx, cy }) => {
            const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
            const splitter = document.querySelector('[data-layout-path="/s0"]') as HTMLElement;
            splitter.dispatchEvent(new PointerEvent("pointerdown", opts(cx, cy)));
            for (let i = 0; i < 30; i++) {
                document.dispatchEvent(new PointerEvent("pointermove", opts(cx, cy + (i % 10) * 6)));
            }
            document.dispatchEvent(new PointerEvent("pointerup", opts(cx, cy)));

            const bad: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>(".flexlayout__row, .flexlayout__tabset")) {
                const fg = getComputedStyle(el).flexGrow;
                const n = Number(fg);
                if (!Number.isFinite(n) || n <= 0) {
                    bad.push(el.className + ": " + fg);
                }
            }
            return { bad, outlineLeft: !!document.querySelector(".flexlayout__splitter_drag") };
        },
        { cx: sr.x + sr.width / 2, cy: sr.y + sr.height / 2 },
    );

    expect(result.bad).toEqual([]);
    expect(result.outlineLeft).toBe(false);
});

test("realtime row drag to the edge still fills the row (weight conservation)", async ({ page }) => {
    await gotoLayout(page, "rt_edge", bigLayout());
    const splitter = page.locator('[data-layout-path="/s0"]');
    await splitter.waitFor();
    const sr = await waitForBox(splitter, "/s0");

    // drag far past the min-size bound; the splitter must clamp and the weights must stay finite
    await page.evaluate(
        ({ cx, cy }) => {
            const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
            const splitter = document.querySelector('[data-layout-path="/s0"]') as HTMLElement;
            splitter.dispatchEvent(new PointerEvent("pointerdown", opts(cx, cy)));
            for (let i = 0; i < 20; i++) {
                document.dispatchEvent(new PointerEvent("pointermove", opts(cx, cy + 1000)));
            }
            document.dispatchEvent(new PointerEvent("pointerup", opts(cx, cy + 1000)));
        },
        { cx: sr.x + sr.width / 2, cy: sr.y + sr.height / 2 },
    );

    const fills = await page.evaluate(() => {
        const root = document.querySelector(".flexlayout__row") as HTMLElement;
        const rootW = root.getBoundingClientRect().width;
        let childrenW = 0;
        const bad: string[] = [];
        for (const el of root.children) {
            childrenW += el.getBoundingClientRect().width;
            if (el instanceof HTMLElement) {
                const fg = getComputedStyle(el).flexGrow;
                if (!Number.isFinite(Number(fg))) {
                    bad.push(el.className + ": " + fg);
                }
            }
        }
        return { fills: Math.abs(rootW - childrenW) < 2, rootW, childrenW, bad };
    });

    // a splitter drag that loses weight would leave the row under/over-filled
    expect(fills.bad).toEqual([]);
    expect(fills.fills).toBe(true);
});

test("realtime drag inside a float window stays correct (fallback path)", async ({ page }) => {
    await gotoLayout(page, "rt_float", floatLayout());
    const splitter = page.locator('[data-layout-path="/sublayout1/s0"]');
    await splitter.waitFor();

    const widths = () =>
        page.evaluate(() => {
            const a = document.querySelector('[data-layout-path="/sublayout1/ts0"]') as HTMLElement;
            const b = document.querySelector('[data-layout-path="/sublayout1/ts1"]') as HTMLElement;
            return { a: a.getBoundingClientRect().width, b: b.getBoundingClientRect().width };
        });

    const before = await widths();
    // the float's row is not registered with the main controller, so this exercises the fallback
    // that re-renders the main tree per move instead of mutating the DOM directly
    await dragSplitter(page, splitter, false, 120);
    const after = await widths();

    expect(after.a).toBeGreaterThan(before.a);
    expect(after.b).toBeLessThan(before.b);

    const finite = await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>(".flexlayout__row, .flexlayout__tabset")) {
            if (!Number.isFinite(Number(getComputedStyle(el).flexGrow))) {
                return false;
            }
        }
        return true;
    });
    expect(finite).toBe(true);
});
