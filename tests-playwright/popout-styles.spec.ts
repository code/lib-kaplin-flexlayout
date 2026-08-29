import { test, expect } from "@playwright/test";
import { waitForPopout, waitForBox } from "./helpers";

// css-in-js styles must reach popout windows. In production, emotion/styled-components insert rules
// through the CSSOM sheet.insertRule API (invisible to the runtime style copy), so the copy rebuilds
// them from sheet.cssRules and the demo wraps popout content in a StyleSheetManager targeting the
// popout document (renderPopoutContent). These tests drive the demo's MUI and styled-components tabs.
test("MUI component is styled in a popout and reacts to dynamic style changes", async ({ page, context }) => {
    await page.goto("/demo?layout=default");
    await page.waitForSelector(".flexlayout__tabset");
    await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    await page.evaluate(() => {
        (window as any).__flexDispatch((window as any).__flexActions.popoutTab("mui", "window"));
    });
    const popout = await waitForPopout(context, page);
    await popout.waitForSelector(".MuiSlider-root", { state: "attached", timeout: 8000 });

    await expect.poll(async () => popout.evaluate(() => getComputedStyle(document.querySelector(".MuiSlider-root")!).color), { timeout: 10000 }).toBe("rgb(25, 118, 210)"); // MUI primary blue

    // dynamic style change while popped out (styled slider switches to the success colour)
    await popout.locator('input[type="checkbox"]').first().check();
    await expect.poll(async () => popout.evaluate(() => getComputedStyle(document.querySelector(".MuiSlider-root")!).color), { timeout: 10000 }).toBe("rgb(46, 125, 50)"); // MUI success green
});

test("styled-components component is styled in a popout", async ({ page, context }) => {
    await page.goto("/demo?layout=default");
    await page.waitForSelector(".flexlayout__tabset");
    await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    await page.evaluate(() => {
        (window as any).__flexDispatch((window as any).__flexActions.popoutTab("styledcomp", "window"));
    });
    const popout = await waitForPopout(context, page);
    await popout.waitForSelector("text=Styled Components Box", { state: "attached", timeout: 8000 });

    await expect
        .poll(
            async () =>
                popout.evaluate(() => {
                    const box = Array.from(document.querySelectorAll("div")).find((d) => String(d.className).includes("sc-")) as HTMLElement | undefined;
                    return box ? getComputedStyle(box).backgroundColor : null;
                }),
            { timeout: 10000 },
        )
        .toBe("rgb(25, 118, 210)"); // the styled Box background
});
