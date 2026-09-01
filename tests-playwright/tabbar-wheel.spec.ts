import { test, expect } from "@playwright/test";
import { findPath } from "./helpers";

const baseURL = "/demo";

type HMetrics = { scrollLeft: number; scrollWidth: number; clientWidth: number } | null;
type VMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number } | null;

const getHorizontalMetrics = (hPath: string) =>
    `(function(){ const outer=document.querySelector('[data-layout-path="${hPath}/tabstrip"]'); const inner=outer?.querySelector('.flexlayout__tabset_tabbar_inner'); return inner?{scrollLeft:inner.scrollLeft, scrollWidth:inner.scrollWidth, clientWidth:inner.clientWidth}:null; })()`;

// border left is vertical overflow (scrollTop on .flexlayout__border_inner)
const getVerticalMetrics = () =>
    `(function(){ const outer=document.querySelector('[data-layout-path="/border/left"]'); const inner=outer?.querySelector('.flexlayout__border_inner'); return inner?{scrollTop:inner.scrollTop, scrollHeight:inner.scrollHeight, clientHeight:inner.clientHeight}:null; })()`;

// dispatch a wheel event on the outer element that owns the wheel listeners
const dispatchWheel = (selector: string, deltaX: number, deltaY: number) =>
    `(() => { const el=document.querySelector('${selector}'); if(!el) throw new Error('missing '+ '${selector}'); const ev=new WheelEvent('wheel',{deltaX:${deltaX},deltaY:${deltaY},deltaMode:0,bubbles:true,cancelable:true}); el.dispatchEvent(ev); })()`;

test.describe("tabbar wheel scrolling", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(baseURL + "?layout=test_tabbar_wheel");
        await expect(page).toHaveTitle(/FlexLayout Demo/);
        // wait for model hook (demo exposes __flexModel after first render)
        await page.waitForFunction(() => !!(window as any).__flexModel?.(), undefined, { timeout: 15000 });
    });

    test("horizontal tabset scrolls with vertical wheel (deltaY)", async ({ page }) => {
        const hPath: string = await page.evaluate(() => (window as any).__flexModel().getNodeById("h_overflow").getPath());
        const tabstrip = findPath(page, `${hPath}/tabstrip`);
        await expect(tabstrip).toBeVisible();

        // ensure overflow exists (narrow h_overflow with 15 long tabs)
        await expect
            .poll(async () => {
                const m = (await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics;
                return m ? m.scrollWidth > m.clientWidth : false;
            })
            .toBe(true);

        // ensure starting at 0
        await page.evaluate((path) => {
            const outer = document.querySelector(`[data-layout-path="${path}/tabstrip"]`);
            const inner = outer?.querySelector(".flexlayout__tabset_tabbar_inner") as HTMLElement;
            if (inner) inner.scrollLeft = 0;
        }, hPath);
        const before = (await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics;
        expect(before!.scrollLeft).toBe(0);

        // vertical wheel (mouse wheel) should scroll the horizontal tabbar
        await page.evaluate(`${dispatchWheel(`[data-layout-path="${hPath}/tabstrip"]`, 0, 50)}`);
        await expect.poll(async () => ((await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics)!.scrollLeft).toBeGreaterThan(10);
        const afterY = ((await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics)!.scrollLeft;
        expect(afterY).toBeGreaterThan(30);
        expect(afterY).toBeLessThan(70);
    });

    test("horizontal tabset scrolls with horizontal wheel (deltaX) - trackpad", async ({ page }) => {
        const hPath: string = await page.evaluate(() => (window as any).__flexModel().getNodeById("h_overflow").getPath());
        await expect(findPath(page, `${hPath}/tabstrip`)).toBeVisible();
        await expect
            .poll(async () => {
                const m = (await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics;
                return m ? m.scrollWidth > m.clientWidth : false;
            })
            .toBe(true);

        await page.evaluate((path) => {
            const outer = document.querySelector(`[data-layout-path="${path}/tabstrip"]`);
            const inner = outer?.querySelector(".flexlayout__tabset_tabbar_inner") as HTMLElement;
            if (inner) inner.scrollLeft = 0;
        }, hPath);

        // horizontal trackpad swipe should also scroll the horizontal tabbar (deltaX)
        await page.evaluate(`${dispatchWheel(`[data-layout-path="${hPath}/tabstrip"]`, 50, 0)}`);
        await expect.poll(async () => ((await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics)!.scrollLeft).toBeGreaterThan(10);
        const afterX = ((await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics)!.scrollLeft;
        expect(afterX).toBeGreaterThan(30);
    });

    test("horizontal tabset prefers dominant axis (prevents jerky diagonal)", async ({ page }) => {
        const hPath: string = await page.evaluate(() => (window as any).__flexModel().getNodeById("h_overflow").getPath());
        await expect(findPath(page, `${hPath}/tabstrip`)).toBeVisible();
        await expect
            .poll(async () => {
                const m = (await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics;
                return m ? m.scrollWidth > m.clientWidth : false;
            })
            .toBe(true);

        await page.evaluate((path) => {
            const outer = document.querySelector(`[data-layout-path="${path}/tabstrip"]`);
            const inner = outer?.querySelector(".flexlayout__tabset_tabbar_inner") as HTMLElement;
            if (inner) inner.scrollLeft = 0;
        }, hPath);

        // trackpad horizontal swipe often carries a tiny diagonal deltaY (~0.2). The fix must use
        // the dominant deltaX (50) not the tiny deltaY (5), otherwise the scroll is jerky/small.
        await page.evaluate(`${dispatchWheel(`[data-layout-path="${hPath}/tabstrip"]`, 50, 5)}`);
        await expect.poll(async () => ((await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics)!.scrollLeft).toBeGreaterThan(30);
        const after = ((await page.evaluate(`(${getHorizontalMetrics(hPath)})`)) as HMetrics)!.scrollLeft;
        // should be ~50, not ~5
        expect(after).toBeGreaterThan(40);
        expect(after).toBeLessThan(70);
    });

    test("vertical border scrolls with vertical wheel (deltaY)", async ({ page }) => {
        const border = findPath(page, "/border/left");
        await expect(border).toBeVisible();
        await expect
            .poll(async () => {
                const m = (await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics;
                return m ? m.scrollHeight > m.clientHeight : false;
            })
            .toBe(true);

        await page.evaluate(() => {
            const outer = document.querySelector('[data-layout-path="/border/left"]');
            const inner = outer?.querySelector(".flexlayout__border_inner") as HTMLElement;
            if (inner) inner.scrollTop = 0;
        });
        const before = (await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics;
        expect(before!.scrollTop).toBe(0);

        await page.evaluate(`${dispatchWheel('[data-layout-path="/border/left"]', 0, 50)}`);
        await expect.poll(async () => ((await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics)!.scrollTop).toBeGreaterThan(10);
        const after = ((await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics)!.scrollTop;
        expect(after).toBeGreaterThan(30);
    });

    test("vertical border scrolls with horizontal wheel (deltaX)", async ({ page }) => {
        const border = findPath(page, "/border/left");
        await expect(border).toBeVisible();
        await expect
            .poll(async () => {
                const m = (await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics;
                return m ? m.scrollHeight > m.clientHeight : false;
            })
            .toBe(true);

        await page.evaluate(() => {
            const outer = document.querySelector('[data-layout-path="/border/left"]');
            const inner = outer?.querySelector(".flexlayout__border_inner") as HTMLElement;
            if (inner) inner.scrollTop = 0;
        });

        // horizontal wheel on a vertical strip should also scroll vertically (dominant axis is Y, but X falls back)
        await page.evaluate(`${dispatchWheel('[data-layout-path="/border/left"]', 50, 0)}`);
        await expect.poll(async () => ((await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics)!.scrollTop).toBeGreaterThan(10);
        const after = ((await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics)!.scrollTop;
        expect(after).toBeGreaterThan(30);
    });

    test("vertical border prefers dominant axis", async ({ page }) => {
        const border = findPath(page, "/border/left");
        await expect(border).toBeVisible();
        await expect
            .poll(async () => {
                const m = (await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics;
                return m ? m.scrollHeight > m.clientHeight : false;
            })
            .toBe(true);

        await page.evaluate(() => {
            const outer = document.querySelector('[data-layout-path="/border/left"]');
            const inner = outer?.querySelector(".flexlayout__border_inner") as HTMLElement;
            if (inner) inner.scrollTop = 0;
        });

        // dominant vertical delta should win over small horizontal
        await page.evaluate(`${dispatchWheel('[data-layout-path="/border/left"]', 5, 50)}`);
        await expect.poll(async () => ((await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics)!.scrollTop).toBeGreaterThan(30);
        const after = ((await page.evaluate(`(${getVerticalMetrics()})`)) as VMetrics)!.scrollTop;
        expect(after).toBeGreaterThan(40);
    });
});
