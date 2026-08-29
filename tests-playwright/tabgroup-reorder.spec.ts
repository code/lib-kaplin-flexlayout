import { test, expect } from "@playwright/test";
import { drag, findPath, Location, waitForBox } from "./helpers";

// Unwrapped Groups layout: dragging a tab inside the Design group must reorder within the group,
// landing exactly where the drop indicator points (not shifted by the removal of the dragged tab).
test.describe("unwrapped group tab reorder", () => {
    const groupOrder = (page: import("@playwright/test").Page) =>
        page.evaluate(() => {
            const model = (window as any).__flexModel();
            const g = model.getNodeById("g1");
            return g.getChildren().map((t: any) => t.getId());
        });

    test("dragging Colors into the slot right after it shows a thin bar and is a no-op", async ({ page }) => {
        await page.goto("/demo?layout=groups");
        await expect(page).toHaveTitle(/FlexLayout Demo/);

        const colors = await findPath(page, "/ts0/g0/tb0").boundingBox();
        expect(colors).not.toBeNull();

        // drag Colors to the gap between Colors and Typography (just after Colors, i.e. before
        // Typography - where Colors already is, so the drop must not shift it past Typography)
        const from = { x: colors!.x + colors!.width / 2, y: colors!.y + colors!.height / 2 };
        const to = { x: colors!.x + colors!.width + 4, y: colors!.y + colors!.height / 2 };

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(to.x, to.y, { steps: 10 });
        await waitForBox(page.locator(".flexlayout__outline_rect"), "drop outline");

        // the drop indicator is a thin vertical bar (not the wide pill outline)
        const outline = await page.evaluate(() => {
            const el = document.querySelector(".flexlayout__outline_rect");
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, visible: getComputedStyle(el).visibility };
        });
        expect(outline).not.toBeNull();
        expect(outline!.visible).toBe("visible");
        expect(outline!.width).toBeLessThan(10);

        await page.mouse.up();

        // Colors already precedes Typography, so the order is unchanged
        expect(await groupOrder(page)).toEqual(["t1", "t2", "t3"]);
    });

    test("dragging Colors before Icons lands before Icons (not after)", async ({ page }) => {
        await page.goto("/demo?layout=groups");
        await expect(page).toHaveTitle(/FlexLayout Demo/);

        // drag Colors onto the left edge of the Icons tab button (both in the Design group)
        await drag(page, findPath(page, "/ts0/g0/tb0"), findPath(page, "/ts0/g0/tb2"), Location.LEFT);

        // Colors ends up between Typography and Icons, exactly where the indicator pointed
        expect(await groupOrder(page)).toEqual(["t2", "t1", "t3"]);
    });

    test("a tab can be dropped after the last group in a tabset", async ({ page }) => {
        await page.goto("/demo?layout=groups");
        await expect(page).toHaveTitle(/FlexLayout Demo/);

        // remove the trailing Settings tab so the Personal group is the last item in the strip;
        // retry the dispatch until it is applied (under load the first attempt can run before the
        // demo's model ref is ready, which makes __flexDispatch a silent no-op)
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

        // the last child is now the (collapsed) Personal group
        const last = await page.evaluate(() => {
            const model = (window as any).__flexModel();
            const ts = model.getNodeById("ts0");
            const children = ts.getChildren();
            return { id: children[children.length - 1].getId(), count: children.length };
        });
        expect(last.id).toBe("g3");

        const pill = (await findPath(page, "/ts0/g2").boundingBox())!;
        // drag Colors (in the Design group) into the empty space just after the Personal pill (past its right edge)
        const colors = (await findPath(page, "/ts0/g0/tb0").boundingBox())!;
        const from = { x: colors.x + colors.width / 2, y: colors.y + colors.height / 2 };
        const to = { x: pill.x + pill.width + 20, y: pill.y + pill.height / 2 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(to.x, to.y, { steps: 10 });
        await page.mouse.up();

        const result = await page.evaluate(() => {
            const model = (window as any).__flexModel();
            const ts = model.getNodeById("ts0");
            const children = ts.getChildren();
            const lastId = children[children.length - 1].getId();
            const lastType = children[children.length - 1].getType();
            return { lastId, lastType };
        });
        // Colors is placed after the Personal group as an ungrouped tab
        expect(result.lastType).toBe("tab");
        expect(result.lastId).toBe("t1");
    });
});
