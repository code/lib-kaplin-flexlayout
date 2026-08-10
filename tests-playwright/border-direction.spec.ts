import { test, expect, Page } from "@playwright/test";
import { findPath } from "./helpers";

// layout test_border_direction: left border has 3 tabs (left1..3), right border has 2 (right1..2);
// the reading direction of the left border tabs can be flipped with global.borderLeftTabDirection.

const baseURL = "/demo";

const tabContainer = (page: Page, border: string) => findPath(page, "/border/" + border).locator(".flexlayout__border_inner_tab_container");

// CSS transform of a container rotated by +90deg (reads down) / -90deg (reads up)
const ROTATE_DOWN = "matrix(0, 1, -1, 0";
const ROTATE_UP = "matrix(0, -1, 1, 0";

const getTransform = (page: Page, border: string) => tabContainer(page, border).evaluate((el) => getComputedStyle(el).transform.split(",").slice(0, 4).join(","));

const setDirection = (page: Page, direction: "up" | "down") =>
    page.evaluate((d) => (window as any).__flexDispatch((window as any).__flexActions.updateModelAttributes({ borderLeftTabDirection: d })), direction);

test.describe("left border tab direction", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(baseURL + "?layout=test_border_direction");
        await expect(findPath(page, "/border/left/tb0")).toBeVisible();
        await expect(findPath(page, "/border/left/tb2")).toBeVisible();
    });

    test("left border tabs read up by default, right border reads down", async ({ page }) => {
        await expect.poll(() => getTransform(page, "left")).toContain(ROTATE_UP);
        await expect.poll(() => getTransform(page, "right")).toContain(ROTATE_DOWN);

        await expect(tabContainer(page, "left")).not.toHaveClass(/flexlayout__border_inner_tab_container_left_down/);
    });

    test("borderLeftTabDirection 'down' makes the left border tabs read down like the right", async ({ page }) => {
        await setDirection(page, "down");

        await expect(tabContainer(page, "left")).toHaveClass(/flexlayout__border_inner_tab_container_left_down/);
        // the left tabs now use the same rotation as the right border tabs
        await expect.poll(() => getTransform(page, "left")).toContain(ROTATE_DOWN);
        await expect.poll(() => getTransform(page, "right")).toContain(ROTATE_DOWN);

        // the first tab button stays at the top, sitting inside the (narrow) left border strip
        // rather than over the layout content, mirroring the right border
        const leftStrip = (await findPath(page, "/border/left").boundingBox())!;
        const leftFirst = (await findPath(page, "/border/left/tb0").boundingBox())!;
        const leftLast = (await findPath(page, "/border/left/tb2").boundingBox())!;
        const rightFirst = (await findPath(page, "/border/right/tb0").boundingBox())!;

        expect(leftFirst.y).toBeLessThan(leftLast.y); // reads top to bottom
        expect(leftFirst.y).toBeLessThan(leftStrip.y + 40); // first tab at the top of the strip
        expect(leftFirst.x).toBeGreaterThanOrEqual(leftStrip.x - 5); // inside the strip area
        expect(leftFirst.x).toBeLessThan(leftStrip.x + leftStrip.width + 5);
        // mirror image of the right border: both put their first tab at the top
        expect(Math.abs(leftFirst.y - rightFirst.y)).toBeLessThan(5);
    });

    test("toggling back to 'up' restores the default reading direction", async ({ page }) => {
        await setDirection(page, "down");
        await expect.poll(() => getTransform(page, "left")).toContain(ROTATE_DOWN);

        await setDirection(page, "up");
        await expect(tabContainer(page, "left")).not.toHaveClass(/flexlayout__border_inner_tab_container_left_down/);
        await expect.poll(() => getTransform(page, "left")).toContain(ROTATE_UP);
    });
});
