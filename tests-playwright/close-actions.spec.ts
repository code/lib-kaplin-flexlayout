import { test, expect, Page } from "@playwright/test";

// The demo's tab context menu demonstrates the bulk close actions (closeAll/closeRight/closeOthers)
// built with ContextMenuBuilder. test_close_actions has a single tabset with One, Two, Three
// (enableClose: false), Four, Five, so the tests can verify that only closeable tabs are closed.
test.describe("bulk close actions (demo context menu)", () => {
    // the tab button contents (a hidden stamp of each tab button is also rendered for drag
    // previews, so scope the content locator to inside a real tab button)
    const tabNames = (page: Page) => page.locator(".flexlayout__tab_button .flexlayout__tab_button_content");

    test.beforeEach(async ({ page }) => {
        await page.goto("/demo?layout=test_close_actions");
        await expect(page.locator(".flexlayout__tab_button")).toHaveCount(5);
    });

    const openMenu = async (page: Page, tabIndex: number) => {
        await page.locator('[data-layout-path="/ts0/tb' + tabIndex + '"]').click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
    };

    // a bulk close is dispatched as a single GroupAction, so it is one undo step
    const expectSingleUndoStep = async (page: Page) => {
        await expect(page.locator('button[title^="undo"]')).toHaveAttribute("title", "undo (1)");
    };

    test("Close Others closes every other closeable tab", async ({ page }) => {
        await openMenu(page, 1); // Two
        await page.getByRole("menuitem", { name: "Close Others", exact: true }).click();
        await expect(tabNames(page)).toHaveText(["Two", "Three"]);
        await expectSingleUndoStep(page);
    });

    test("Close to the Right closes only the closeable tabs to the right", async ({ page }) => {
        await openMenu(page, 0); // One
        await page.getByRole("menuitem", { name: "Close to the Right", exact: true }).click();
        await expect(tabNames(page)).toHaveText(["One", "Three"]);
        await expectSingleUndoStep(page);
    });

    test("Close All closes every closeable tab", async ({ page }) => {
        await openMenu(page, 0); // One
        await page.getByRole("menuitem", { name: "Close All", exact: true }).click();
        await expect(tabNames(page)).toHaveText(["Three"]);
        await expectSingleUndoStep(page);
    });

    test("a non-closeable tab offers the bulk actions but no Close item", async ({ page }) => {
        await openMenu(page, 2); // Three (enableClose: false)
        await expect(page.getByRole("menuitem", { name: "Close", exact: true })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Close Others", exact: true }).click();
        await expect(tabNames(page)).toHaveText(["Three"]);
        await expectSingleUndoStep(page);
    });
});
