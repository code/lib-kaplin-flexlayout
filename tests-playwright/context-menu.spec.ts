import { test, expect } from "@playwright/test";

// The demo wires its context menu (onContextMenu) to the library's reusable showPopupMenu control
// via the prebuilt node context items (getNodeContextMenuItems). These tests exercise the generic
// control: it appears on right click, is an accessible menu, and is fully keyboard operable.
//
// For tab "One" in test_with_borders (global tabEnablePopout defaults to false) the prebuilt menu
// omits the not-allowed options by default. Its tabset has a single tab, so no bulk close actions
// are offered: Pin, Rename, [divider], Close.
test.describe("reusable popup menu (demo context menu)", () => {
    const openMenu = async (page: import("@playwright/test").Page) => {
        await page.goto("/demo?layout=test_with_borders");
        const tab = page.locator(".flexlayout__tab_button").first();
        await expect(tab).toBeVisible();
        await tab.click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        return tab;
    };

    test("right click opens an accessible menu with the given items", async ({ page }) => {
        await openMenu(page);
        const menu = page.locator(".flexlayout__popup_menu");
        await expect(menu).toHaveAttribute("role", "menu");
        await expect(page.locator('[role="menuitem"]')).toHaveCount(3);
        await expect(page.locator('[role="menuitem"]').first()).toHaveText("Pin");
        // first item is focused on open
        await expect(page.locator('[role="menuitem"]').first()).toBeFocused();
    });

    test("renders a divider that keyboard navigation skips", async ({ page }) => {
        await openMenu(page);
        // the divider is a separator, not a menuitem, so it is not counted among the 3 items
        await expect(page.locator('.flexlayout__popup_menu [role="separator"]')).toHaveCount(1);
        await expect(page.locator('[role="menuitem"]')).toHaveCount(3);
        // ArrowDown twice from the first item skips the divider, landing on Close; Enter selects
        await expect(page.locator('[role="menuitem"]').first()).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.locator('[role="menuitem"]').nth(1)).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.locator('[role="menuitem"]').nth(2)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator(".flexlayout__popup_menu")).toHaveCount(0);
        // Enter selected the focused item ("Close"), not the skipped divider
        expect(await page.evaluate(() => (window as any).__lastContextSelect)).toBe("close");
    });

    test("arrow keys move focus, Enter selects and closes", async ({ page }) => {
        await openMenu(page);
        await page.keyboard.press("ArrowDown");
        await expect(page.locator('[role="menuitem"]').nth(1)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator(".flexlayout__popup_menu")).toHaveCount(0);
    });

    test("Home and End jump to the first and last item", async ({ page }) => {
        await openMenu(page);
        await page.keyboard.press("End");
        await expect(page.locator('[role="menuitem"]').nth(2)).toBeFocused();
        await page.keyboard.press("Home");
        await expect(page.locator('[role="menuitem"]').first()).toBeFocused();
    });

    test("type-ahead focuses the item matching the typed letter", async ({ page }) => {
        await openMenu(page);
        await page.keyboard.press("c"); // -> "Close"
        await expect(page.locator('[role="menuitem"]').nth(2)).toBeFocused();
        await page.waitForTimeout(600); // let the type-ahead buffer reset
        await page.keyboard.press("p"); // -> "Pin"
        await expect(page.locator('[role="menuitem"]').nth(0)).toBeFocused();
    });

    test("Rename opens the inline edit, Close removes the tab", async ({ page }) => {
        const tab = await openMenu(page);
        await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
        const textbox = page.locator(".flexlayout__tab_button_textbox");
        await expect(textbox).toBeVisible();
        await textbox.fill("Renamed");
        await textbox.press("Enter");
        await expect(tab).toContainText("Renamed");

        await tab.click({ button: "right" });
        await page.getByRole("menuitem", { name: "Close", exact: true }).click();
        await expect(page.locator(".flexlayout__tab_button", { hasText: "Renamed" })).toHaveCount(0);
    });

    test("Escape and outside click both close the menu", async ({ page }) => {
        const tab = await openMenu(page);
        await page.keyboard.press("Escape");
        await expect(page.locator(".flexlayout__popup_menu")).toHaveCount(0);

        // outside click
        await tab.click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await page.mouse.click(5, 5);
        await expect(page.locator(".flexlayout__popup_menu")).toHaveCount(0);
    });

    test("Show in Explorer is offered on other tabs and without a stray leading divider on the Model Explorer", async ({ page }) => {
        await page.goto("/demo?layout=default");
        await expect(page.locator(".flexlayout__tab_button").first()).toBeVisible();

        // a regular tab offers the Show in Explorer item
        await page.locator(".flexlayout__tab_button").first().click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Show in Explorer", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".flexlayout__popup_menu")).toHaveCount(0);

        // the Model Explorer tab has no other menu items, so its Show in Explorer entry appears
        // alone - without the stray leading divider that separated it from the omitted items
        await expect(page.locator(".flexlayout__border_button", { hasText: "Model Explorer" })).toBeVisible();
        await page.locator(".flexlayout__border_button", { hasText: "Model Explorer" }).click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Show in Explorer", exact: true })).toBeVisible();
        await expect(page.locator('[role="menuitem"]')).toHaveCount(1);
        await expect(page.locator('.flexlayout__popup_menu [role="separator"]')).toHaveCount(0);
    });
});

test.describe("tabset context menu", () => {
    test("floats the whole tabset from the tabset menu", async ({ page }) => {
        // test_pinned has popoutable tabs, so the tabset menu offers Float/Popout
        await page.goto("/demo?layout=test_pinned");
        await expect(page.locator(".flexlayout__tab_button").first()).toBeVisible();

        // right-click the trailing area of a tabstrip (away from the tab buttons)
        const tabstrip = page.locator(".flexlayout__tabset_tabbar_outer").first();
        const box = (await tabstrip.boundingBox())!;
        await page.mouse.click(box.x + box.width - 15, box.y + box.height / 2, { button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Float tabset", exact: true })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Pop out tabset", exact: true })).toBeVisible();

        await page.getByRole("menuitem", { name: "Float tabset", exact: true }).click();
        await expect(page.locator(".flexlayout__float_window")).toHaveCount(1);
    });
});
