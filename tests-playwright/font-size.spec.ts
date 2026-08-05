import { test, expect } from "@playwright/test";

// regression: the demo lets you change the layout font size via the --font-size CSS variable. The
// imperatively-positioned tab panels must re-measure when the tabstrip height changes (smaller font
// = shorter strip = taller panels), and the border bars must re-measure their thickness too.
test("tab panels and border bars re-measure when the font size changes", async ({ page }) => {
    await page.goto("/demo?layout=default");
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(600);

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
        (document.querySelector(".flexlayout__layout") as HTMLElement).style.setProperty("--font-size", "xx-small");
    });
    await page.waitForTimeout(800);
    const after = await measure();

    expect(after.panelH).toBeGreaterThan(before.panelH + 5); // smaller strip leaves more room for panels
    expect(after.borderBarH).toBeLessThan(before.borderBarH - 5); // the bottom border bar shrinks
});
