import { test, expect } from "@playwright/test";
import { dragSplitter, findPath, findAllTabSets, waitForBox } from "./helpers";
import { CLASSES } from "../src/CSSClassNames";

const baseURL = "/demo";

test.describe("Sticky buttons overflow - #517", () => {
    test("wide sticky button does not cause Maximum update depth exceeded", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (err) => {
            const msg = err.message ?? String(err);
            errors.push(msg);
        });
        page.on("console", (msg) => {
            if (msg.type() === "error") {
                const text = msg.text();
                if (text.includes("Maximum update depth exceeded")) {
                    errors.push(text);
                }
            }
        });

        await page.goto(baseURL + "?layout=test_sticky_overflow");
        await expect(page).toHaveTitle(/FlexLayout Demo/);
        await expect(findAllTabSets(page)).toHaveCount(2);

        // ensure the wide sticky button is rendered (120px wide, >10px hysteresis)
        const sticky = page.locator('[data-testid="wide-sticky"]');
        await expect(sticky).toBeVisible();
        const stickyBox = await waitForBox(sticky, "wide sticky");
        expect(stickyBox.width).toBeGreaterThan(50);

        const splitter = findPath(page, "/s0");

        // 1. drag to left edge so the sticky_test tabset is narrow - sticky should dock (moves to toolbar)
        await dragSplitter(page, splitter, false, -1000);
        await page.waitForTimeout(300);
        expect(errors, "no error after dragging to left edge").toEqual([]);

        // sticky is docked: the sticky container inside the tabstrip should be hidden,
        // the HELLO element should still be visible but inside the toolbar
        const stickyContainer = findPath(page, "/ts0/tabstrip").locator(`.${CLASSES.FLEXLAYOUT__TAB_TOOLBAR_STICKY_BUTTONS_CONTAINER}`);
        // when docked, the sticky container is not rendered inside the scroll area
        await expect(stickyContainer).toBeHidden();
        await expect(sticky).toBeVisible();

        // 2. sweep the splitter back and forth across the overflow boundary many times.
        // Before the fix this oscillated infinitely when width was within (T+10, T+S]
        for (let i = 0; i < 6; i++) {
            await dragSplitter(page, splitter, false, 80);
            await page.waitForTimeout(200);
            expect(errors, `no error after sweep step ${i} (+80)`).toEqual([]);
            await dragSplitter(page, splitter, false, -40);
            await page.waitForTimeout(200);
            expect(errors, `no error after sweep step ${i} (-40)`).toEqual([]);
        }

        // 3. explicitly hunt the boundary: find a position where the tabstrip is near overflow
        // by dragging to a middle position and doing small increments
        await dragSplitter(page, splitter, false, 1000); // go to right edge first
        await page.waitForTimeout(300);
        // now slowly shrink to trigger the exact threshold
        for (let d = 0; d < 12; d++) {
            await dragSplitter(page, splitter, false, -15);
            await page.waitForTimeout(150);
            expect(errors, `no error during boundary hunt step ${d}`).toEqual([]);
        }
        for (let d = 0; d < 12; d++) {
            await dragSplitter(page, splitter, false, 15);
            await page.waitForTimeout(150);
            expect(errors, `no error during boundary expand step ${d}`).toEqual([]);
        }

        // final assertion: no Maximum update depth exceeded was thrown at any point
        expect(errors).toEqual([]);

        // layout should still be functional: tabs are still visible and interactive
        await expect(findPath(page, "/ts0/tb0")).toBeVisible();
        await findPath(page, "/ts0/tb0").click();
        await expect(findPath(page, "/ts0/t0")).toBeVisible();
    });

    test("hysteresis equals sticky width not 10px", async ({ page }) => {
        // verify the measured hysteresis: after docking, the tabset must stay docked
        // until it has grown by sticky width, not just 10px
        await page.goto(baseURL + "?layout=test_sticky_overflow");
        await expect(findAllTabSets(page)).toHaveCount(2);

        const sticky = page.locator('[data-testid="wide-sticky"]');
        await expect(sticky).toBeVisible();

        const splitter = findPath(page, "/s0");
        const tabset = findPath(page, "/ts0");
        const stickyContainer = findPath(page, "/ts0/tabstrip").locator(`.${CLASSES.FLEXLAYOUT__TAB_TOOLBAR_STICKY_BUTTONS_CONTAINER}`);

        // drag to a width where sticky is docked (narrow)
        await dragSplitter(page, splitter, false, -1000);
        await page.waitForTimeout(300);
        await expect(stickyContainer).toBeHidden();

        await waitForBox(tabset, "narrow tabset");

        // grow by only 20px - less than sticky width (120) - should remain docked
        await dragSplitter(page, splitter, false, 20);
        await page.waitForTimeout(300);
        await expect(stickyContainer).toBeHidden();

        // grow to wide - should undock (sticky container visible again)
        await dragSplitter(page, splitter, false, 1000);
        await page.waitForTimeout(300);
        await expect(stickyContainer).toBeVisible();

        // narrow again by only 10px - should remain undocked (hysteresis prevents immediate re-dock)
        await waitForBox(tabset, "undocked tabset");
        await dragSplitter(page, splitter, false, -10);
        await page.waitForTimeout(300);
        await expect(stickyContainer).toBeVisible();

        // shrink enough to force re-dock (drag to left edge)
        await dragSplitter(page, splitter, false, -1000);
        await page.waitForTimeout(300);
        await expect(stickyContainer).toBeHidden();

        // sanity: no crash throughout
        expect(await page.evaluate(() => (window as any).__flexModel?.() != null)).toBe(true);
    });
});
