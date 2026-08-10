import { test, expect } from "@playwright/test";

// the floating panel header's right button pops the whole floating layout out into a native
// browser window. It is only available when every tab in the float layout can live in a window.
const createFloat = (page: import("@playwright/test").Page, name: string, enablePopout: boolean) =>
    page.evaluate(
        ({ tabName, popout }: { tabName: string; popout: boolean }) => {
            (window as any).__flexDispatch(
                (window as any).__flexActions.createSubLayout(
                    { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: tabName, component: "testing", enablePopout: popout }] }] },
                    { x: 200, y: 150, width: 320, height: 240 },
                    "float",
                ),
            );
        },
        { tabName: name, popout: enablePopout },
    );

test.beforeEach(async ({ page }) => {
    await page.goto("/demo?layout=test_three_tabs");
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(500);
});

test("pops the floating panel out into a native window", async ({ page, context }) => {
    await createFloat(page, "Dock Me", true);
    await page.waitForSelector(".flexlayout__float_window");
    await expect(page.locator('[data-layout-path="/floatwindow/button/popout"]')).toBeVisible();

    const popoutPromise = context.waitForEvent("page");
    await page.locator('[data-layout-path="/floatwindow/button/popout"]').click();
    await popoutPromise;
    // strict mode double-mounts the popout component (open, close, reopen), so pick the live window
    const popout = context.pages().filter((p) => p !== page && !p.isClosed())[0];
    expect(popout).toBeDefined();
    await popout.waitForSelector('[role="tab"]');
    await popout.waitForTimeout(500);

    // the float window is gone and the tab now lives in the native popout window
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    await expect(popout.locator(".flexlayout__tab_button_content").filter({ hasText: "Dock Me" })).toHaveCount(1);
});

test("hides the popout button when a tab in the float is not popoutable", async ({ page }) => {
    await createFloat(page, "No Popout", false);
    await page.waitForSelector(".flexlayout__float_window");

    await expect(page.locator('[data-layout-path="/floatwindow/button/popout"]')).toHaveCount(0);
    // the float stays put
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(1);
});
