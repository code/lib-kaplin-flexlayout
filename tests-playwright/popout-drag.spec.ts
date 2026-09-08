import { test, expect, Page, BrowserContext } from "@playwright/test";
import { findPath, findTabButton, dragAcrossWindows, Location } from "./helpers";

// cross-window drag and drop: tabs and tabsets can be dragged between the main layout and popout
// windows. HTML5 drag and drop cannot be driven across windows with the mouse, so the drags here
// use synthetic drag events (see dragAcrossWindows in helpers.ts).
//
// data-layout-path is positional (tab indices, and tabset/row paths, shift as nodes move), so the
// tests only rely on a path before any drag has happened, or where the path is guaranteed stable
// (the /r2 tabsets are untouched by the /r1 moves). Post-move assertions count or filter tabs
// within a data-layout-path-scoped tabset instead of assuming a fixed path.
//
// setup: the /r1/ts1 tabset (AGGrid + Editor) has AGGrid selected, so its popout button pops
// AGGrid out into a window, leaving Editor in the main layout.

async function setupPopout(page: Page, context: BrowserContext): Promise<Page> {
    await page.goto("/demo?layout=test_popout");
    await expect(page.locator(".flexlayout__tabset").first()).toBeVisible();

    await findPath(page, "/r1/ts1/button/popout").click();

    // under react strict mode (dev) the first popout window is closed and reopened, so wait for a
    // popout page that stays open
    await expect
        .poll(async () => {
            const open = context.pages().filter((p) => p !== page && !p.isClosed());
            return open.length;
        })
        .toBe(1);
    const popout = context.pages().filter((p) => p !== page && !p.isClosed())[0];
    await popout.waitForLoadState();
    await expect(popout.locator('[data-layout-path$="/tb0"]')).toHaveCount(1);

    return popout;
}

// tab buttons carry a data-layout-path ending in "/tb<n>"; the close adornments carry the
// same path with "/button/close" appended, so match text (which only the tab button itself has)
const mainTabButtons = (page: Page) => page.locator('[data-layout-path*="/tb"]');

test("drag a tab to a popout window and back", async ({ page, context }) => {
    const popout = await setupPopout(page, context);

    // drag Grid 2 (/r1/ts0) into the popout window: it must join AGGrid in the popout's tabset
    await dragAcrossWindows(findTabButton(page, "/r1/ts0", 2), popout, popout.locator(".flexlayout__layout"), Location.CENTER);

    // /r1/ts0 goes from 6 tabs to 5 and no longer contains Grid 2
    await expect(findPath(page, "/r1/ts0").locator('[role="tab"]')).toHaveCount(5);
    await expect(mainTabButtons(page).filter({ hasText: "Grid 2" })).toHaveCount(0);
    // the popout's tabset gained a second tab holding Grid 2
    await expect(popout.locator('[data-layout-path$="/tb1"]')).toHaveCount(1);
    await expect(popout.locator('[data-layout-path$="/tb1"] .flexlayout__tab_button_content')).toContainText("Grid 2");

    // drag it back from the popout into /r1/ts0
    await dragAcrossWindows(popout.locator('[data-layout-path$="/tb1"]'), page, findPath(page, "/r1/ts0"), Location.CENTER);

    // /r1/ts0 has Grid 2 again (back to 6 tabs) and the popout is down to its single AGGrid tab
    await expect(findPath(page, "/r1/ts0").locator('[role="tab"]')).toHaveCount(6);
    await expect(findPath(page, "/r1/ts0").locator('[role="tab"]').filter({ hasText: "Grid 2" })).toBeVisible();
    await expect(popout.locator('[data-layout-path$="/tb1"]')).toHaveCount(0);
});

test("drag a tabset to a popout window and back", async ({ page, context }) => {
    const popout = await setupPopout(page, context);

    // drag the whole /r1/ts1 tabset (its only tab is Editor, AGGrid was popped out) into the popout
    await dragAcrossWindows(findPath(page, "/r1/ts1/tabstrip"), popout, popout.locator(".flexlayout__layout"), Location.CENTER);

    // the tabset's tab (Editor) left the main layout and joined AGGrid in the popout's tabset
    await expect(mainTabButtons(page).filter({ hasText: "Editor" })).toHaveCount(0);
    await expect(popout.locator('[data-layout-path$="/tb1"]')).toHaveCount(1);
    await expect(popout.locator('[data-layout-path$="/tb1"] .flexlayout__tab_button_content')).toContainText("Editor");

    // drag the tabset out of the popout back into the /r2/ts0 tabset (its path is untouched by the
    // /r1 moves); emptying the popout closes its window
    await dragAcrossWindows(popout.locator('[data-layout-path$="/tabstrip"]'), page, findPath(page, "/r2/ts0"), Location.CENTER);

    await expect.poll(async () => context.pages().filter((p) => p !== page && !p.isClosed()).length).toBe(0); // popout closed
    await expect(findPath(page, "/r2/ts0").locator('[role="tab"]').filter({ hasText: "AGGrid" })).toBeVisible();
    await expect(findPath(page, "/r2/ts0").locator('[role="tab"]').filter({ hasText: "Editor" })).toBeVisible();
});
