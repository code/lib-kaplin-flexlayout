import { test, expect } from "@playwright/test";
import { findPath } from "./helpers";

// Regression: --color-tabgroup-pill-text, --color-tabgroup-default and
// --color-tabgroup-menu-palette CSS variables should control group appearance.
// Mirrors the theme-float.spec.ts pattern: write overrides to the layout root via
// __flexLayout().getRootDiv().style.setProperty().

const layout = "?layout=groups";

test.describe("tab group CSS variables", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/demo" + layout);
        await page.waitForSelector(".flexlayout__tabset");
        await page.waitForTimeout(600);
    });

    test("palette override changes swatch count and color", async ({ page }) => {
        // override palette to 2 custom colors
        await page.evaluate(() => {
            (window as any).__flexLayout().getRootDiv().style.setProperty("--flexlayout-color-tabgroup-menu-palette", "#ff0000, #00ff00");
        });

        // right-click the Design pill to open its context menu
        await findPath(page, "/ts0/g0").click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();

        const swatches = page.locator(".flexlayout__group_color_picker_swatch");
        await expect(swatches).toHaveCount(2);
        await expect(swatches.nth(0)).toHaveCSS("background-color", "rgb(255, 0, 0)");
        await expect(swatches.nth(1)).toHaveCSS("background-color", "rgb(0, 255, 0)");

        // cleanup
        await page.evaluate(() => {
            (window as any).__flexLayout().getRootDiv().style.removeProperty("--flexlayout-color-tabgroup-menu-palette");
        });
    });

    test("default color override applies to new groups", async ({ page }) => {
        // override default color to a known value
        await page.evaluate(() => {
            (window as any).__flexLayout().getRootDiv().style.setProperty("--flexlayout-color-tabgroup-default", "#123456");
        });

        // right-click ungrouped Settings tab -> Add to new group
        await findPath(page, "/ts0/tb3").click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await page.getByRole("menuitem", { name: "Add to new group", exact: true }).click();

        // the new group pill should have the override color as background
        const newPill = findPath(page, "/ts0/g3");
        await expect(newPill).toBeVisible();
        await expect(newPill).toHaveCSS("background-color", "rgb(18, 52, 86)");

        // cleanup
        await page.evaluate(() => {
            (window as any).__flexLayout().getRootDiv().style.removeProperty("--flexlayout-color-tabgroup-default");
        });
    });

    test("pill text color override applies", async ({ page }) => {
        // override pill text color
        await page.evaluate(() => {
            (window as any).__flexLayout().getRootDiv().style.setProperty("--flexlayout-color-tabgroup-pill-text", "rgb(255, 0, 0)");
        });

        const pillName = findPath(page, "/ts0/g0").locator(".flexlayout__group_pill_name");
        await expect(pillName).toHaveCSS("color", "rgb(255, 0, 0)");

        // cleanup
        await page.evaluate(() => {
            (window as any).__flexLayout().getRootDiv().style.removeProperty("--flexlayout-color-tabgroup-pill-text");
        });
    });
});
