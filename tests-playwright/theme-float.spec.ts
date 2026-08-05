import { test, expect } from "@playwright/test";

// regression: theme variables are defined as `var(--flexlayout-<name>, <default>)`. Overriding a
// global --flexlayout-* variable (on the layout root or :root) must reach every nested layout,
// including float windows — the demo's ThemePanel writes these to the main layout root.
test("global theme override reaches a floating panel", async ({ page }) => {
    await page.goto("/demo?layout=default");
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(600);

    await page.evaluate(() => {
        (window as any).__flexDispatch(
            (window as any).__flexActions.createPopout(
                { type: "row", children: [{ type: "tabset", children: [{ component: "grid", name: "Float Grid" }] }] },
                { x: 100, y: 100, width: 500, height: 300 },
                "float",
            ),
        );
    });
    await page.waitForSelector(".flexlayout__float_window .flexlayout__tabset", { state: "attached", timeout: 8000 });
    await page.waitForTimeout(500);

    const backgrounds = () =>
        page.evaluate(() => {
            // --color-tabset-background derives from --color-1 in the alpha themes
            const mainTabset = document.querySelector(".flexlayout__layout_border_container .flexlayout__tabset");
            const floatTabset = document.querySelector(".flexlayout__float_window .flexlayout__tabset");
            return {
                main: mainTabset ? getComputedStyle(mainTabset).backgroundColor : null,
                float: floatTabset ? getComputedStyle(floatTabset).backgroundColor : null,
            };
        });

    // as the demo ThemePanel does: write the override to the main layout root
    await page.evaluate(() => {
        (window as any).__flexLayout().getRootDiv().style.setProperty("--flexlayout-color-1", "rgb(0, 128, 0)");
    });
    await page.waitForTimeout(300);
    expect(await backgrounds()).toEqual({ main: "rgb(0, 128, 0)", float: "rgb(0, 128, 0)" });

    // a global override on :root reaches layouts too
    await page.evaluate(() => {
        (window as any).__flexLayout().getRootDiv().style.removeProperty("--flexlayout-color-1");
        document.documentElement.style.setProperty("--flexlayout-color-1", "rgb(0, 0, 255)");
    });
    await page.waitForTimeout(300);
    expect(await backgrounds()).toEqual({ main: "rgb(0, 0, 255)", float: "rgb(0, 0, 255)" });
});
