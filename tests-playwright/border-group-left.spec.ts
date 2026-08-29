import { test, expect } from "@playwright/test";
import { findPath, waitForBox } from "./helpers";

const borderGroupLayout = {
    global: {},
    borders: [
        {
            type: "border",
            location: "left",
            size: 200,
            children: [
                {
                    type: "tabgroup",
                    id: "bg1",
                    name: "BGroup",
                    color: "#ccff90",
                    children: [
                        { type: "tab", id: "bt1", name: "B1", component: "text" },
                        { type: "tab", id: "bt2", name: "B2", component: "text" },
                    ],
                },
                { type: "tab", id: "bt3", name: "B3", component: "text" },
            ],
        },
        {
            type: "border",
            location: "right",
            size: 200,
            children: [
                {
                    type: "tabgroup",
                    id: "bg2",
                    name: "RGroup",
                    color: "#ccff90",
                    children: [
                        { type: "tab", id: "bt4", name: "B4", component: "text" },
                        { type: "tab", id: "bt5", name: "B5", component: "text" },
                    ],
                },
                { type: "tab", id: "bt6", name: "B6", component: "text" },
            ],
        },
    ],
    layout: {
        type: "row",
        children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "Main", component: "text" }] }],
    },
};

test.describe("left border group tab drag", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript((json) => localStorage.setItem("test_border_group_left", json), JSON.stringify(borderGroupLayout));
        await page.goto("/demo?layout=test_border_group_left");
        await expect(page).toHaveTitle(/FlexLayout Demo/);
        await expect(findPath(page, "/border/left/g0")).toBeVisible();
        await expect(findPath(page, "/border/right/g0")).toBeVisible();
        await waitForBox(findPath(page, "/ts0"), "main tabset");
    });

    test("dragging a tab into left border group inserts at correct index (reversed visual order)", async ({ page }) => {
        // left border reading up: visual top->bottom: bt2 (tb1), bt1 (tb0), pill, bt3
        // drag Main (t0) between bt2 and bt1 (middle gap) -> should land at logical index 1 => [B1, Main, B2]
        const mainTab = findPath(page, "/ts0/tb0");
        const bt1 = findPath(page, "/border/left/g0/tb0"); // B1 at y ~40
        const bt2 = findPath(page, "/border/left/g0/tb1"); // B2 at y ~20
        const bt1Box = await bt1.boundingBox();
        const bt2Box = await bt2.boundingBox();
        expect(bt1Box).not.toBeNull();
        expect(bt2Box).not.toBeNull();
        // gap between bt2 and bt1
        const gapY = (bt2Box!.y + bt2Box!.height + bt1Box!.y) / 2;
        const gapX = bt1Box!.x + bt1Box!.width / 2;

        const mainBox = await mainTab.boundingBox();
        const from = { x: mainBox!.x + mainBox!.width / 2, y: mainBox!.y + mainBox!.height / 2 };

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(gapX, gapY, { steps: 10 });
        // wait for the drop outline to settle: it animates to its final geometry via a css
        // transition, so a fixed sleep can sample it mid-flight (firefox engages the native
        // drag later within the stepped move, shifting the transition start)
        const outline = await waitForBox(page.locator(".flexlayout__outline_rect"), "drop outline");
        expect(outline.height).toBeLessThan(10);
        expect(outline.width).toBeGreaterThan(20);

        await page.mouse.up();

        const order = await page.evaluate(() => {
            const m = (window as any).__flexModel();
            const b = m.getNodeById("bg1");
            return b.getChildren().map((c: any) => c.getId());
        });
        // middle gap => logical 1
        expect(order).toEqual(["bt1", "t0", "bt2"]);
    });

    test("right border group drag still works (pill top)", async ({ page }) => {
        const mainTab = findPath(page, "/ts0/tb0");
        const bt4 = findPath(page, "/border/right/g0/tb0"); // B4 at y ~20
        const bt5 = findPath(page, "/border/right/g0/tb1"); // B5 at y ~40
        const bt4Box = await bt4.boundingBox();
        const bt5Box = await bt5.boundingBox();
        const gapY = (bt4Box!.y + bt4Box!.height + bt5Box!.y) / 2;
        const gapX = bt4Box!.x + bt4Box!.width / 2;
        const mainBox = await mainTab.boundingBox();
        const from = { x: mainBox!.x + mainBox!.width / 2, y: mainBox!.y + mainBox!.height / 2 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(gapX, gapY, { steps: 10 });
        await waitForBox(page.locator(".flexlayout__outline_rect"), "drop outline");
        await page.mouse.up();
        const order = await page.evaluate(() => {
            const m = (window as any).__flexModel();
            return m
                .getNodeById("bg2")
                .getChildren()
                .map((c: any) => c.getId());
        });
        expect(order).toEqual(["bt4", "t0", "bt5"]);
    });

    test("dragging left border group pill reorders correctly", async ({ page }) => {
        // left border has group + B3, dragging group pill below B3 should move it after B3
        const pill = findPath(page, "/border/left/g0");
        const b3 = findPath(page, "/border/left/tb1"); // B3 (direct child after the group)
        const pillBox = await pill.boundingBox();
        const b3Box = await b3.boundingBox();
        const from = { x: pillBox!.x + pillBox!.width / 2, y: pillBox!.y + pillBox!.height / 2 };
        // target below B3
        const to = { x: b3Box!.x + b3Box!.width / 2, y: b3Box!.y + b3Box!.height + 10 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(to.x, to.y, { steps: 10 });
        await waitForBox(page.locator(".flexlayout__outline_rect"), "drop outline");
        await page.mouse.up();
        const children = await page.evaluate(() => {
            const m = (window as any).__flexModel();
            const b = m
                .getBorderSet()
                .getBorders()
                .find((x: any) => x.getLocation().getName() === "left");
            return b.getChildren().map((c: any) => c.getId());
        });
        // group should now be after B3
        expect(children).toEqual(["bt3", "bg1"]);
    });
});
