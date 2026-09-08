import { test, expect } from "@playwright/test";
import { waitForBox } from "./helpers";

// regression: the demo lets you change the layout font size via the --flexlayout-font-size CSS variable. The
// imperatively-positioned tab panels must re-measure when the tabstrip height changes (smaller font
// = shorter strip = taller panels), and the border bars must re-measure their thickness too.
test("tab panels and border bars re-measure when the font size changes", async ({ page }) => {
    await page.goto("/demo?layout=default");
    await page.waitForSelector(".flexlayout__tabset");
    await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    const measure = () =>
        page.evaluate(() => {
            const panel = Array.from(document.querySelectorAll('[role="tabpanel"]')).find((p) => getComputedStyle(p).display !== "none");
            const bottomBar = document.querySelector(".flexlayout__border_bottom");
            return {
                panelH: panel ? panel.getBoundingClientRect().height : 0,
                borderBarH: bottomBar ? bottomBar.getBoundingClientRect().height : 0,
            };
        });

    const before = await measure();
    await page.evaluate(() => {
        (document.querySelector(".flexlayout__layout") as HTMLElement).style.setProperty("--flexlayout-font-size", "xx-small");
    });
    await expect
        .poll(
            async () => {
                const after = await measure();
                return after.panelH > before.panelH + 5 && after.borderBarH < before.borderBarH - 5;
            },
            { timeout: 5000 },
        )
        .toBe(true);
});
