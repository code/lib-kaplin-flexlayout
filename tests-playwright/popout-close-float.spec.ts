import { test, expect } from "@playwright/test";

// regression: closing a popout window turns the layout into a float; any sublayout hosted inside
// (a JSON subLayoutId tab or a nested <Layout> component tab) must re-measure against the float's
// size. Previously the inner panels kept the popout-window dimensions until a manual redraw.
const assertFloatFits = async (page: import("@playwright/test").Page) => {
    const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const fw of Array.from(document.querySelectorAll(".flexlayout__float_window")) as HTMLElement[]) {
            const c = fw.querySelector(".flexlayout__float_window_content")!.getBoundingClientRect();
            for (const el of Array.from(fw.querySelectorAll('[role="tabpanel"], .flexlayout__tabstrip, .flexlayout__tabset, .flexlayout__row')) as HTMLElement[]) {
                const r = el.getBoundingClientRect();
                const where = el.getAttribute("data-layout-path") || el.tagName || el.className;
                if (r.width > c.width + 2) out.push(`${where} w=${Math.round(r.width)} > float content ${Math.round(c.width)}`);
                if (r.height > c.height + 2) out.push(`${where} h=${Math.round(r.height)} > float content h ${Math.round(c.height)}`);
            }
        }
        return out;
    });
    expect(bad).toEqual([]);
};

const popoutAndClose = async (page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext, tabId: string) => {
    await page.evaluate((id) => {
        (window as any).__flexDispatch((window as any).__flexActions.popoutTab(id, "window"));
    }, tabId);
    await page.waitForTimeout(1500);

    const popoutPage = context.pages().filter((p) => p !== page && !p.isClosed())[0];
    expect(popoutPage).toBeDefined();
    await popoutPage.waitForSelector('[role="tab"]');
    await popoutPage.close({ runBeforeUnload: true }); // triggers beforeunload -> closePopout
    await page.waitForTimeout(2000);
};

for (const [name, tabId] of [
    ["JSON sublayout", "sublayout_1"],
    ["nested <Layout> component", "model_explorer"],
] as const) {
    test(`${name} resizes after its popout window is closed into a float`, async ({ page, context }) => {
        await page.goto("/demo?layout=default");
        await page.waitForSelector(".flexlayout__tabset");
        await page.waitForTimeout(600);

        await popoutAndClose(page, context, tabId);
        await assertFloatFits(page);
    });
}
