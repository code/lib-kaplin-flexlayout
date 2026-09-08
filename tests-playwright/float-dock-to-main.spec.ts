import { test, expect } from "@playwright/test";
import { dragAcrossWindows, Location, waitForBox } from "./helpers";

// the floating panel header's checkerboard handle docks the whole floating layout into the main
// layout or a tab sublayout: it can split a tabset, dock to a layout edge, or dock into a
// sublayout (never dock to the center, and never into another floating window or popout), and it
// preserves the float's structure by creating new rows as needed.
const createFloat = (page: import("@playwright/test").Page, name: string) =>
    page.evaluate((tabName) => {
        (window as any).__flexDispatch(
            (window as any).__flexActions.createSubLayout(
                { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: tabName, component: "testing" }] }] },
                { x: 200, y: 150, width: 320, height: 240 },
                "float",
            ),
        );
    }, name);

const startDockDrag = (page: import("@playwright/test").Page) =>
    page.locator('[data-layout-path="/floatwindow/drag-handle"]').evaluate((el) => {
        const dt = new DataTransfer();
        el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 220, clientY: 170 }));
    });

// dispatch dragenter/dragover/drop/dragend on the given layout root at the given page coordinates
const dropOnLayout = (page: import("@playwright/test").Page, locator: import("@playwright/test").Locator, x: number, y: number) =>
    locator.evaluate(
        (el, { x, y }: { x: number; y: number }) => {
            const dt = new DataTransfer();
            const opts = (xx: number, yy: number) => ({ bubbles: true, cancelable: true, dataTransfer: dt, clientX: xx, clientY: yy });
            el.dispatchEvent(new DragEvent("dragenter", opts(x, y)));
            el.dispatchEvent(new DragEvent("dragover", opts(x, y)));
            el.dispatchEvent(new DragEvent("drop", opts(x, y)));
            el.dispatchEvent(new DragEvent("dragend", opts(x, y)));
        },
        { x, y },
    );

const dropOnMainLayout = (page: import("@playwright/test").Page, x: number, y: number) => dropOnLayout(page, page.locator(".flexlayout__layout").first(), x, y);

test.beforeEach(async ({ page }) => {
    await page.goto("/demo?layout=test_three_tabs");
    await page.waitForSelector(".flexlayout__tabset");
    await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");
});

test("docks a floating panel into the main layout by splitting a tabset", async ({ page }) => {
    await createFloat(page, "Dock Me");
    await waitForBox(page.locator(".flexlayout__float_window"), "float window");

    const mainTabSets = page.locator('.flexlayout__tabset:not([data-layout-path^="/sub"])');
    const before = await mainTabSets.count();
    expect(before).toEqual(3);

    await startDockDrag(page);
    const mainBox = await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    // drop near the right edge of a tabset's content (splitting the rightmost tabset)
    await dropOnMainLayout(page, mainBox.x + mainBox.width - 10, mainBox.y + mainBox.height * 0.4);

    // the float window is gone and its tab now lives in the main layout
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    await expect(mainTabSets).toHaveCount(before + 1);
    await expect(page.locator('[data-layout-path^="/ts"] .flexlayout__tab_button_content').filter({ hasText: "Dock Me" })).toHaveCount(1);
    await expect(page.locator('[data-layout-path^="/ts"] .flexlayout__tab_button_content').filter({ hasText: "Dock Me" })).toBeVisible();
});

test("docks a floating panel onto the main layout edge", async ({ page }) => {
    await createFloat(page, "Dock Me");
    await waitForBox(page.locator(".flexlayout__float_window"), "float window");

    const mainTabSets = page.locator('.flexlayout__tabset:not([data-layout-path^="/sub"])');
    const before = await mainTabSets.count();
    expect(before).toEqual(3);

    await startDockDrag(page);
    const mainBox = await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    // drop on the right edge of the main layout (edge dock to the root row)
    await dropOnMainLayout(page, mainBox.x + mainBox.width - 5, mainBox.y + mainBox.height / 2);

    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    await expect(mainTabSets).toHaveCount(before + 1);
    await expect(page.locator('[data-layout-path^="/ts"] .flexlayout__tab_button_content').filter({ hasText: "Dock Me" })).toHaveCount(1);
});

test("docks a floating panel into a sublayout hosted in a main tab", async ({ page }) => {
    // activate a tabset, then host a sublayout tab in it
    await page.locator('[role="tab"]').first().click();
    await page.evaluate(() => {
        const w = window as any;
        const subId = w.__flexDispatch(
            w.__flexActions.createSubLayout(
                { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "Inner", component: "testing" }] }] },
                { x: 0, y: 0, width: 200, height: 200 },
                "tab",
            ),
        );
        w.__flexLayout().addTabToActiveTabSet({ type: "tab", name: "Host", component: "user sublayout", subLayoutId: subId });
    });
    const subRoot = page.locator(".flexlayout__tab_layout_container_user .flexlayout__layout");
    await expect(subRoot).toHaveCount(1);

    await createFloat(page, "Dock Me");
    await waitForBox(page.locator(".flexlayout__float_window"), "float window");

    await startDockDrag(page);
    const subBox = await waitForBox(subRoot, "sublayout");

    // drop on the sublayout's own content area
    await dropOnLayout(page, subRoot, subBox.x + subBox.width - 10, subBox.y + subBox.height * 0.4);

    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    // the float's tab now lives inside the sublayout
    await expect(subRoot.locator(".flexlayout__tab_button_content").filter({ hasText: "Dock Me" })).toHaveCount(1);
});

test("docks a floating panel into a popout window", async ({ page, context }) => {
    // popouts need popoutable tabs, so use the test_popout layout rather than the beforeEach's
    await page.goto("/demo?layout=test_popout");
    await page.waitForSelector(".flexlayout__tabset");
    await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    // open a popout window from the main layout
    await page.locator('[data-layout-path="/r1/ts1/button/popout"]').click();
    await expect.poll(async () => context.pages().filter((p) => p !== page && !p.isClosed()).length).toBe(1);
    const popout = context.pages().filter((p) => p !== page && !p.isClosed())[0];
    await popout.waitForLoadState();
    await popout.waitForSelector('[role="tab"]');

    // create a float whose tab can live in a window
    await page.evaluate(() => {
        (window as any).__flexDispatch(
            (window as any).__flexActions.createSubLayout(
                { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "Dock Me", component: "testing", enablePopout: true }] }] },
                { x: 200, y: 150, width: 320, height: 240 },
                "float",
            ),
        );
    });
    await waitForBox(page.locator(".flexlayout__float_window"), "float window");

    // drag the float's checkerboard handle into the popout's layout
    await dragAcrossWindows(page.locator('[data-layout-path="/floatwindow/drag-handle"]'), popout, popout.locator(".flexlayout__layout").first(), Location.RIGHT);

    // the float is gone and its tab now lives in the popout window
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    await expect(popout.locator(".flexlayout__tab_button_content").filter({ hasText: "Dock Me" })).toHaveCount(1);
});

test("docks a floating panel into another floating panel", async ({ page }) => {
    await createFloat(page, "Receiver");
    await waitForBox(page.locator(".flexlayout__float_window"), "float window");
    await page.evaluate(() => {
        (window as any).__flexDispatch(
            (window as any).__flexActions.createSubLayout(
                { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "Dock Me", component: "testing" }] }] },
                { x: 600, y: 150, width: 320, height: 240 },
                "float",
            ),
        );
    });
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(2);

    // drag the "Dock Me" float's checkerboard handle into the "Receiver" float
    const sourceHandle = page.locator(".flexlayout__float_window").nth(1).locator('[data-layout-path="/floatwindow/drag-handle"]');
    await sourceHandle.evaluate((el) => {
        const dt = new DataTransfer();
        el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 640, clientY: 170 }));
    });
    const receiverLayout = page.locator(".flexlayout__float_window").nth(0).locator(".flexlayout__layout");
    const receiverBox = await waitForBox(receiverLayout, "receiver float");
    await dropOnLayout(page, receiverLayout, receiverBox.x + receiverBox.width - 10, receiverBox.y + receiverBox.height * 0.4);

    // the "Dock Me" float is gone; its tab now lives in the receiver float
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(1);
    await expect(receiverLayout.locator(".flexlayout__tab_button_content").filter({ hasText: "Dock Me" })).toHaveCount(1);
});

test("splits the tabset when dropped near its center (a float dock never merges)", async ({ page }) => {
    await createFloat(page, "Dock Me");
    await waitForBox(page.locator(".flexlayout__float_window"), "float window");

    const mainTabSets = page.locator('.flexlayout__tabset:not([data-layout-path^="/sub"])');
    const before = await mainTabSets.count();
    expect(before).toEqual(3);

    await startDockDrag(page);
    const mainBox = await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    // dropping in the middle of a tabset can never merge (center dock), so it resolves to a split
    await dropOnMainLayout(page, mainBox.x + mainBox.width / 2, mainBox.y + mainBox.height * 0.4);

    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    await expect(mainTabSets).toHaveCount(before + 1);
    // the tab now lives in the main layout (the offscreen drag stamp is aria-hidden, so the tab
    // role matches only the real tab button)
    await expect(page.getByRole("tab", { name: "Dock Me" })).toHaveCount(1);
});
