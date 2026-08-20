import { test, expect } from "@playwright/test";
import { drag, findAllTabSets, findPath, findTabButton, Location } from "./helpers";

// layout groups: ts0 has three groups: Design (Colors/Typography/Icons, open),
// Reports (Weekly/Monthly, collapsed), Personal (Shopping/Todo/Notes, collapsed)
// and an ungrouped Settings tab;
// a right border has a Helpers group (open) with Theme + Layout JSON tabs

const baseURL = "/demo";

const expectTabButtonCount = async (page: import("@playwright/test").Page, path: string, count: number) => {
    await expect(page.locator(`[data-layout-path^="${path}/tb"][role="tab"]`)).toHaveCount(count);
};

// switch the model's tab group type, retrying until applied (under load a single dispatch can run
// before the demo's model ref is ready, which makes __flexDispatch a silent no-op)
const setTabGroupType = (page: import("@playwright/test").Page, type: "splitpill" | "underline") =>
    page.waitForFunction(
        (t) => {
            const w = window as any;
            if (!w.__flexDispatch || !w.__flexActions || !w.__flexModel) return false;
            const model = w.__flexModel();
            if (!model) return false;
            if (model.getTabGroupType() !== t) {
                w.__flexDispatch(w.__flexActions.updateModelAttributes({ tabGroupType: t }));
                return false; // re-check on the next poll
            }
            return true;
        },
        type,
        { timeout: 10000 },
    );

test.describe("grouped tabs", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(baseURL + "?layout=groups");
        await expect(page).toHaveTitle(/FlexLayout Demo/);
        await expect(findAllTabSets(page)).toHaveCount(1);
    });

    test("renders group pills and their tab buttons", async ({ page }) => {
        // Design group is open: pill + 3 tab buttons
        await expect(findPath(page, "/ts0/g0")).toBeVisible();
        await expect(findPath(page, "/ts0/g0")).toHaveText(/Design/);
        await expect(findPath(page, "/ts0/tb0")).toContainText("Colors");
        await expect(findPath(page, "/ts0/tb1")).toContainText("Typography");
        await expect(findPath(page, "/ts0/tb2")).toContainText("Icons");

        // Reports group is collapsed: pill only, no tab buttons
        await expect(findPath(page, "/ts0/g1")).toHaveText(/Reports/);

        // Personal group is collapsed: pill only, no tab buttons
        await expect(findPath(page, "/ts0/g2")).toHaveText(/Personal/);

        // the ungrouped Settings tab is last
        await expectTabButtonCount(page, "/ts0", 4);
        await expect(findPath(page, "/ts0/tb3")).toContainText("Settings");

        // border group pill is present
        await expect(findPath(page, "/border/right/g0")).toBeVisible();
        await expect(findPath(page, "/border/right/g0")).toHaveText(/Helpers/);
        await expect(findPath(page, "/border/right/tb0")).toContainText("Theme");
        await expect(findPath(page, "/border/right/tb1")).toContainText("Layout JSON");
    });

    test("clicking a pill collapses and expands its group", async ({ page }) => {
        // collapse the open Design group: its 3 tabs hide, only Settings remains
        await findPath(page, "/ts0/g0").click();
        await expectTabButtonCount(page, "/ts0", 1);
        await expect(findPath(page, "/ts0/tb0")).toContainText("Settings");

        // expand it again
        await findPath(page, "/ts0/g0").click();
        await expectTabButtonCount(page, "/ts0", 4);
        await expect(findPath(page, "/ts0/tb0")).toContainText("Colors");
    });

    test("a group pill is keyboard operable (disclosure button)", async ({ page }) => {
        const pill = findPath(page, "/ts0/g0");
        await expect(pill).toHaveAttribute("role", "button");
        await expect(pill).toHaveAttribute("aria-expanded", "true");

        // Enter collapses the open Design group
        await pill.focus();
        await page.keyboard.press("Enter");
        await expectTabButtonCount(page, "/ts0", 1);
        await expect(pill).toHaveAttribute("aria-expanded", "false");
        // the collapsed pill shows its hidden tab count
        await expect(pill).toHaveText(/3/);

        // Space expands it again
        await page.keyboard.press(" ");
        await expectTabButtonCount(page, "/ts0", 4);
        await expect(pill).toHaveAttribute("aria-expanded", "true");
    });

    test("Shift+F10 on a focused pill opens the group menu at the pill", async ({ page }) => {
        const pill = findPath(page, "/ts0/g0");
        await pill.focus();
        await page.keyboard.press("Shift+F10");
        const menu = page.locator(".flexlayout__popup_menu");
        await expect(menu).toBeVisible();

        // the rename input is focused with its text selected on open
        const focused = await page.evaluate(() => document.activeElement?.tagName);
        expect(focused).toBe("INPUT");

        // Escape closes
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
    });

    test("a collapsed group shows only its pill and no tab buttons", async ({ page }) => {
        // expand Reports (collapsed by default)
        await findPath(page, "/ts0/g1").click();
        await expectTabButtonCount(page, "/ts0", 6); // Design(3) + Reports(2) + Settings
        await expect(findPath(page, "/ts0/g1")).toHaveText(/Reports/);
        // clicking again re-collapses it
        await findPath(page, "/ts0/g1").click();
        await expectTabButtonCount(page, "/ts0", 4);
    });

    test("pill context menu renames the group and changes its color", async ({ page }) => {
        await findPath(page, "/ts0/g0").click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();

        // rename
        const renameInput = page.locator('.flexlayout__popup_menu input[type="text"]');
        // the rename input is focused with its text selected on open
        const focused = await page.evaluate(() => {
            const active = document.activeElement as HTMLInputElement | null;
            return { isInput: active?.tagName === "INPUT", value: active?.value ?? "", start: active?.selectionStart ?? -1, end: active?.selectionEnd ?? -1 };
        });
        expect(focused.isInput).toBe(true);
        expect(focused.value).toBe("Design");
        expect(focused.start).toBe(0);
        expect(focused.end).toBe(focused.value.length);

        await renameInput.fill("UX");
        await renameInput.press("Enter");
        await expect(findPath(page, "/ts0/g0")).toHaveText(/UX/);

        // color
        await findPath(page, "/ts0/g0").click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        const swatches = page.locator(".flexlayout__popup_menu .flexlayout__group_color_picker_swatch");
        await expect(swatches).toHaveCount(10);
        await swatches.nth(3).click();
        await expect(findPath(page, "/ts0/g0")).toHaveCSS("background-color", "rgb(148, 184, 112)"); // #94b870
    });

    test("tab context menu can add a tab to a new group", async ({ page }) => {
        // Settings is ungrouped -> its menu offers Add to new group
        await findTabButton(page, "/ts0", 3).click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await page.getByRole("menuitem", { name: "Add to new group", exact: true }).click();

        await expect(findPath(page, "/ts0/g3")).toBeVisible();
        await expect(findPath(page, "/ts0/tb3")).toContainText("Settings");
    });

    test("add to new group moves a grouped tab out of its existing group", async ({ page }) => {
        // Colors (tb0) is inside the Design group; moving it to a new group must not duplicate it
        await findTabButton(page, "/ts0", 0).click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await page.getByRole("menuitem", { name: "Add to new group", exact: true }).click();

        // a fourth group now exists, the total tab count is unchanged, and Colors appears once
        await expect(page.locator('[data-layout-path^="/ts0/g"][role="button"]')).toHaveCount(4);
        await expectTabButtonCount(page, "/ts0", 4);
        await expect(page.locator('[role="tab"]', { hasText: "Colors" })).toHaveCount(1);
    });

    test("tab context menu can add a tab to an existing group", async ({ page }) => {
        // Settings is ungrouped; its picker lists the existing groups
        await findTabButton(page, "/ts0", 3).click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        const picker = page.locator(".flexlayout__group_picker");
        await expect(picker).toBeVisible();
        await picker.locator(".flexlayout__group_picker_item", { hasText: "Design" }).click();

        // Settings moved into Design: Design now shows 4 tabs, no more ungrouped tab
        await expectTabButtonCount(page, "/ts0", 4);
        await expect(findPath(page, "/ts0/tb3")).toContainText("Settings");
    });

    test("dragging a tab out of a group moves it to the tabset", async ({ page }) => {
        // drag Colors (tb0, inside Design) onto Settings (tb3) -> Colors leaves the Design group
        // and becomes an ungrouped tab
        const from = findTabButton(page, "/ts0", 0);
        const to = findTabButton(page, "/ts0", 3);
        await drag(page, from, to, Location.CENTER);
        await expectTabButtonCount(page, "/ts0", 4); // Design(2) + Reports collapsed + Personal collapsed + Colors + Settings
        // Colors is no longer inside the Design group (its tabs are Typography + Icons now)
        await expect(findPath(page, "/ts0/tb0")).toContainText("Typography");
        await expect(findPath(page, "/ts0/tb1")).toContainText("Icons");
        // Colors is an ungrouped tab somewhere in the strip (not grouped)
        await expect(page.locator('[role="tab"]', { hasText: "Colors" })).toHaveCount(1);
        await expect(page.locator('[role="tab"]', { hasText: "Colors" }).first()).not.toHaveClass(/flexlayout__tab_button_grouped/);
    });

    test("dragging a tab into a group adds it to the group", async ({ page }) => {
        // expand Reports first so Monthly is visible
        await findPath(page, "/ts0/g1").click();
        await page.waitForTimeout(200);
        // after expanding: tb0=Colors, tb1=Typography, tb2=Icons, tb3=Weekly, tb4=Monthly, tb5=Settings
        // drag Monthly (tb4) onto the Design pill -> Monthly joins Design at its start
        const from = findTabButton(page, "/ts0", 4);
        const to = findPath(page, "/ts0/g0");
        await drag(page, from, to, Location.CENTER);
        await expectTabButtonCount(page, "/ts0", 6); // Design(4) + Reports(1) + Settings
        await expect(findPath(page, "/ts0/tb0")).toContainText("Monthly");
        await expect(findPath(page, "/ts0/tb1")).toContainText("Colors");
    });

    test("ungrouping a group returns its tabs to the tabset", async ({ page }) => {
        await findPath(page, "/ts0/g1").click({ button: "right" });
        await expect(page.locator(".flexlayout__popup_menu")).toBeVisible();
        await page.getByRole("menuitem", { name: "Ungroup", exact: true }).click();

        await expect(findPath(page, "/ts0/g1")).toHaveCount(0);
        // Design(3) + Weekly + Monthly + Settings
        await expectTabButtonCount(page, "/ts0", 6);
        await expect(findPath(page, "/ts0/tb3")).toContainText("Weekly");
    });

    test("dragging a group pill reorders it within the tabset", async ({ page }) => {
        // drag the Personal pill (g2) before the Reports pill (g1)
        await drag(page, findPath(page, "/ts0/g2"), findPath(page, "/ts0/g1"), Location.LEFT);
        await page.waitForTimeout(200);
        // strip order is now Design, Personal, Reports
        const pills = page.locator(".flexlayout__group_pill");
        await expect(pills.nth(0)).toHaveText(/Design/);
        await expect(pills.nth(1)).toHaveText(/Personal/);
        await expect(pills.nth(2)).toHaveText(/Reports/);
    });

    test("dragging a tab into the right border group adds it", async ({ page }) => {
        // drag Settings (tb3, clear of the right border) onto the Helpers pill
        await drag(page, findTabButton(page, "/ts0", 3), findPath(page, "/border/right/g0"), Location.CENTER);
        await page.waitForTimeout(200);
        await expectTabButtonCount(page, "/border/right", 3);
        // dropped on the pill, so it joins the group at its start
        await expect(findPath(page, "/border/right/tb0")).toContainText("Settings");
    });

    test("dragging a group pill into the right border moves the whole group", async ({ page }) => {
        // drag the Personal pill (g2) into the right border, after the Helpers group
        await drag(page, findPath(page, "/ts0/g2"), findPath(page, "/border/right/g0"), Location.BOTTOM);
        await page.waitForTimeout(200);
        // Personal left the main tabset and joined the border alongside the Helpers group
        await expect(findPath(page, "/ts0/g2")).toHaveCount(0);
        await expect(page.locator('[data-layout-path^="/border/right/g"][role="button"]')).toHaveCount(2);
        await expectTabButtonCount(page, "/ts0", 4); // Design(3) + Reports collapsed + Settings
        // exactly one divider between consecutive items (no leading/trailing/double dividers)
        const seq = await page.evaluate(() => {
            const container = document.querySelector('[data-layout-path="/border/right"] .flexlayout__border_inner_tab_container');
            return container ? Array.from(container.children).map((el) => el.className.split(" ")[0]) : [];
        });
        expect(seq.length).toBeGreaterThan(0);
        expect(seq[0]).not.toContain("divider");
        expect(seq[seq.length - 1]).not.toContain("divider");
        for (let i = 1; i < seq.length; i++) {
            expect(seq[i].includes("divider") && seq[i - 1].includes("divider")).toBe(false);
        }
    });

    test("reordering border tabs shows a horizontal drop indicator", async ({ page }) => {
        const src = (await findPath(page, "/border/right/tb1").boundingBox())!; // Layout JSON
        const tgt = (await findPath(page, "/border/right/tb0").boundingBox())!; // Theme

        await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(50);
        // hover just below Theme (between it and Layout JSON in the vertical strip)
        await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height + 2, { steps: 10 });
        await page.waitForTimeout(100);

        const outline = await page.evaluate(() => {
            const el = document.querySelector(".flexlayout__outline_rect");
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
        });
        await page.mouse.up();

        expect(outline).not.toBeNull();
        expect(outline!.width).toBeGreaterThan(outline!.height);
    });

    test("dragging within a group works after switching to the underline type", async ({ page }) => {
        // pre-switch: the open Design group renders its split-pill end cap
        await expect(findPath(page, "/ts0/g0/end")).toHaveCount(1);

        await setTabGroupType(page, "underline");
        await expect(page.locator(".flexlayout__group_end_marker")).toHaveCount(0);
        await page.waitForTimeout(200);

        // drag Colors (tb0) onto the left edge of Icons (tb2)
        await drag(page, findTabButton(page, "/ts0", 0), findTabButton(page, "/ts0", 2), Location.LEFT);
        await page.waitForTimeout(200);

        const order = await page.evaluate(() =>
            (window as any)
                .__flexModel()
                .getNodeById("g1")
                .getChildren()
                .map((t: any) => t.getId()),
        );
        expect(order).toEqual(["t2", "t1", "t3"]);
    });

    test("a drop in the gap after the last group's tab lands on the strip after switching to underline", async ({ page }) => {
        // remove the trailing Settings tab so the drop target is a strip slot, not a tab; retry
        // until applied (a single dispatch can run before the demo's model ref is ready)
        await page.waitForFunction(
            () => {
                const w = window as any;
                if (!w.__flexDispatch || !w.__flexActions || !w.__flexModel) return false;
                const ts = w.__flexModel()?.getNodeById("ts0");
                if (!ts) return false;
                if (ts.getChildren().some((c: any) => c.getId() === "t9")) {
                    w.__flexDispatch(w.__flexActions.deleteTab("t9"));
                    return false; // re-check on the next poll
                }
                return true;
            },
            undefined,
            { timeout: 10000 },
        );
        await page.waitForTimeout(200);

        await setTabGroupType(page, "underline");
        await expect(page.locator(".flexlayout__group_end_marker")).toHaveCount(0);
        await page.waitForTimeout(200);

        // drag Colors (tb0) into the empty space between Design's last tab (Icons) and the Reports
        // pill; positions are measured after the switch because underline mode reflows the strip
        // (a stale end-marker rect would wrongly resolve this INTO the Design group)
        const colors = (await findTabButton(page, "/ts0", 0).boundingBox())!;
        const icons = (await findTabButton(page, "/ts0", 2).boundingBox())!;
        const reports = (await findPath(page, "/ts0/g1").boundingBox())!;
        const from = { x: colors.x + colors.width / 2, y: colors.y + colors.height / 2 };
        const gapX = (icons.x + icons.width + reports.x) / 2;
        expect(gapX).toBeGreaterThan(icons.x + icons.width);
        const to = { x: gapX, y: colors.y + colors.height / 2 };

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(to.x, to.y, { steps: 10 });
        await page.waitForTimeout(100);

        // a thin bar on the strip (before Reports), not the wide group/pill outline
        const outline = await page.evaluate(() => {
            const el = document.querySelector(".flexlayout__outline_rect");
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
        });
        expect(outline).not.toBeNull();
        expect(outline!.width).toBeLessThan(10);

        await page.mouse.up();
        await page.waitForTimeout(200);

        const children = await page.evaluate(() => {
            const model = (window as any).__flexModel();
            return model
                .getNodeById("ts0")
                .getChildren()
                .map((c: any) => ({ id: c.getId(), type: c.getType() }));
        });
        // Colors became an ungrouped tab between the Design group and Reports
        expect(children.map((c: any) => c.type)).toEqual(["tabgroup", "tab", "tabgroup", "tabgroup"]);
        expect(children[1].id).toBe("t1");
    });
});
