import { test, expect } from "@playwright/test";

test("demo undo/redo still works via the onBeforeAction snapshot", async ({ page }) => {
    await page.goto("/demo?layout=default");
    await expect(page.locator(".flexlayout__tabset").first()).toBeVisible();

    const undoButton = page.locator('button[title^="undo"]');
    const redoButton = page.locator('button[title^="redo"]');
    await expect(undoButton).toBeDisabled();

    // close the first closeable tab: an undo snapshot should be recorded
    const closeBtn = page.locator('[data-layout-path$="/button/close"]').first();
    await closeBtn.click();
    await expect(undoButton).toBeEnabled();

    // undo restores the tab
    await undoButton.click();
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeEnabled();

    // redo re-applies the close
    await redoButton.click();
    await expect(undoButton).toBeEnabled();
    await expect(redoButton).toBeDisabled();
});
