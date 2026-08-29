import { expect, Page, Locator, BrowserContext } from "@playwright/test";

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Wait until `locator` has a real (non-null) bounding box and the box is stable (two consecutive
 * polls agree), then return it. boundingBox() returns null for an element that is attached but not
 * yet laid out (zero size or hidden), which happens transiently after a reload or a drag that
 * reshapes the layout. Requiring two stable measurements avoids catching a brief flicker during a
 * re-measure, so the returned box reflects the settled layout.
 */
export async function waitForBox(locator: Locator, label: string): Promise<Box> {
    let last: Box | null = null;
    let stable = false;
    await expect
        .poll(
            async () => {
                const box = await locator.boundingBox().catch(() => null);
                stable =
                    box !== null && last !== null && Math.abs(box.x - last.x) < 1 && Math.abs(box.y - last.y) < 1 && Math.abs(box.width - last.width) < 1 && Math.abs(box.height - last.height) < 1;
                last = box;
                return stable;
            },
            {
                timeout: 15000,
                message: `timed out waiting for a stable bounding box for ${label}`,
            },
        )
        .toBe(true);
    if (!last) throw new Error(`Could not get bounding box for ${label}`);
    return last;
}

export const findAllTabSets = (page: Page) => {
    return page.locator(".flexlayout__tabset");
};

/**
 * Wait for a popout window and return its page. Under react strict mode (dev) the popout component
 * double-mounts: the first window opens and immediately closes and the reopened one stays, so a
 * single sample of `context.pages()` can catch the doomed first window (or the gap between the
 * two windows, where no live popout exists at all). Requires the same live non-main page on two
 * consecutive samples 250ms apart, which the short-lived first window cannot satisfy.
 */
export async function waitForPopout(context: BrowserContext, mainPage: Page): Promise<Page> {
    let candidate: Page | null = null;
    await expect
        .poll(
            async () => {
                const live = context.pages().filter((p) => p !== mainPage && !p.isClosed());
                const next = live.length === 1 ? live[0] : null;
                const stable = next !== null && next === candidate;
                candidate = next;
                return stable;
            },
            { timeout: 15000, message: "timed out waiting for the popout window to stay open", intervals: [250] },
        )
        .toBe(true);
    return candidate!;
}

export const findPath = (page: Page, path: string) => {
    return page.locator(`[data-layout-path="${path}"]`);
};

export const findTabButton = (page: Page, path: string, index: number) => {
    return findPath(page, `${path}/tb${index}`);
};

export const checkTab = async (page: Page, path: string, index: number, selected: boolean, text: string) => {
    const tabButton = findTabButton(page, path, index);
    const tabContent = findPath(page, `${path}/t${index}`);

    await expect(tabButton).toBeVisible();
    await expect(tabButton).toHaveClass(new RegExp(selected ? "flexlayout__tab_button--selected" : "flexlayout__tab_button--unselected"));
    await expect(tabButton.locator(".flexlayout__tab_button_content")).toContainText(text);

    await expect(tabContent).toBeVisible({ visible: selected });
    await expect(tabContent).toContainText(text);
};

export const checkTabButton = async (page: Page, path: string, index: number, selected: boolean, text: string) => {
    const tabButton = findTabButton(page, path, index);

    await expect(tabButton).toBeVisible();
    await expect(tabButton).toHaveClass(new RegExp(selected ? "flexlayout__tab_button--selected" : "flexlayout__tab_button--unselected"));
    await expect(tabButton.locator(".flexlayout__tab_button_content")).toContainText(text);
};

export const checkBorderTab = async (page: Page, path: string, index: number, selected: boolean, text: string) => {
    const tabButton = findTabButton(page, path, index);
    const tabContent = findPath(page, `${path}/t${index}`);

    await expect(tabButton).toBeVisible();
    await expect(tabButton).toHaveClass(new RegExp(selected ? "flexlayout__border_button--selected" : "flexlayout__border_button--unselected"));
    await expect(tabButton.locator(".flexlayout__border_button_content")).toContainText(text);

    if (selected) {
        await expect(tabContent).toBeVisible();
        await expect(tabContent).toContainText(text);
    }
};

export enum Location {
    CENTER,
    TOP,
    BOTTOM,
    LEFT,
    RIGHT,
    LEFTEDGE,
}

function getLocation(rect: { x: number; y: number; width: number; height: number }, loc: Location) {
    switch (loc) {
        case Location.CENTER:
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        case Location.TOP:
            return { x: rect.x + rect.width / 2, y: rect.y + 5 };
        case Location.BOTTOM:
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height - 5 };
        case Location.LEFT:
            return { x: rect.x + 5, y: rect.y + rect.height / 2 };
        case Location.RIGHT:
            return { x: rect.x + rect.width - 5, y: rect.y + rect.height / 2 };
        case Location.LEFTEDGE:
            return { x: rect.x, y: rect.y + rect.height / 2 };
        default:
            throw new Error(`Unknown location: ${loc}`);
    }
}

export async function drag(page: Page, from: Locator, to: Locator, loc: Location) {
    const fr = await waitForBox(from, "drag source");
    const tr = await waitForBox(to, "drag target");

    const cf = getLocation(fr, Location.CENTER);
    const ct = getLocation(tr, loc);

    await page.mouse.move(cf.x, cf.y);
    await page.mouse.down();
    await page.waitForTimeout(50); // let the native drag start before moving
    // native HTML5 drag requires a minimum movement before dragstart fires; the fuzz
    // test picks random tab pairs that can be very close together, so move at least
    // ~10px first to guarantee the drag session starts even when the final target is nearby
    await page.mouse.move(cf.x + 10, cf.y + 10);
    await page.mouse.move(cf.x + 11, cf.y + 11);
    await page.mouse.move(ct.x, ct.y, { steps: 10 });
    await page.waitForTimeout(50); // let dragover register before the drop
    await page.mouse.up();
}

export async function dragWithOffset(page: Page, from: Locator, to: Locator, loc: Location, offsetX: number, offsetY: number) {
    const fr = await waitForBox(from, "drag source");
    const tr = await waitForBox(to, "drag target");

    const cf = getLocation(fr, Location.CENTER);
    const ct = getLocation(tr, loc);

    await page.mouse.move(cf.x, cf.y);
    await page.mouse.down();
    await page.waitForTimeout(50); // let the native drag start before moving
    // ensure native dragstart fires even for nearby targets (see drag() above)
    await page.mouse.move(cf.x + 10, cf.y + 10);
    await page.mouse.move(cf.x + 11, cf.y + 11);
    await page.mouse.move(ct.x + offsetX, ct.y + offsetY, { steps: 10 });
    await page.waitForTimeout(50); // let dragover register before the drop
    await page.mouse.up();
}

export async function dragToEdge(page: Page, from: Locator, edgeIndex: number) {
    const fr = await waitForBox(from, "drag source");

    const cf = { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 };

    await page.mouse.move(cf.x, cf.y);
    await page.mouse.down();
    await page.waitForTimeout(50); // let the native drag start before moving
    await page.mouse.move(cf.x + 10, cf.y + 10); // start move to make edges show
    // firefox needs a second movement before the native drag session engages (dragover/dragenter
    // only start firing after ~two discrete moves), without which the edge rects never appear
    await page.mouse.move(cf.x + 11, cf.y + 11);
    const edgeRects = page.locator(".flexlayout__edge_rect");
    const edge = edgeRects.nth(edgeIndex);
    // the edge rects appear asynchronously after the drag starts, so wait for one
    const tr = await waitForBox(edge, `edge rect ${edgeIndex}`);

    const ct = { x: tr.x + tr.width / 2, y: tr.y + tr.height / 2 };

    // await page.mouse.move((cf.x + ct.x) / 2, (cf.y + ct.y) / 2);
    await page.mouse.move(ct.x, ct.y, { steps: 10 });
    await page.waitForTimeout(50); // let dragover register before the drop
    await page.mouse.up();
}

// drags a draggable element from one page/window to a target in another page/window (e.g. from the
// main layout into a popout window, or back) using synthetic drag events: HTML5 drag and drop cannot
// be driven with the mouse across separate browser windows. dragstart is dispatched on the source
// element, then dragenter/dragover/drop on the target page's layout root.
export async function dragAcrossWindows(source: Locator, targetPage: Page, target: Locator, loc: Location) {
    const fr = await waitForBox(source, "cross-window drag source");
    const tr = await waitForBox(target, "cross-window drag target");

    const cf = getLocation(fr, Location.CENTER);
    const ct = getLocation(tr, loc);

    await source.evaluate(
        (el, { x, y }: { x: number; y: number }) => {
            const dt = new DataTransfer();
            el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
        },
        { x: cf.x, y: cf.y },
    );

    const targetLayout = targetPage.locator(".flexlayout__layout").first();
    await targetLayout.evaluate(
        (el, { x, y }: { x: number; y: number }) => {
            const dt = new DataTransfer();
            const opts = (xx: number, yy: number) => ({ bubbles: true, cancelable: true, dataTransfer: dt, clientX: xx, clientY: yy });
            el.dispatchEvent(new DragEvent("dragenter", opts(x, y)));
            el.dispatchEvent(new DragEvent("dragover", opts(x, y)));
            el.dispatchEvent(new DragEvent("drop", opts(x, y)));
        },
        { x: ct.x, y: ct.y },
    );
}

export async function dragSplitter(page: Page, from: Locator, upDown: boolean, distance: number) {
    const fr = await waitForBox(from, "splitter");

    const cf = { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 };
    const ct = { x: cf.x + (upDown ? 0 : distance), y: cf.y + (upDown ? distance : 0) };

    // firefox drops input events with coordinates outside the viewport; clamp the target to the
    // viewport edges. the splitter position is clamped to the layout bounds by the library itself,
    // so an oversized drag lands on the same bound either way
    const vp = page.viewportSize();
    if (vp) {
        ct.x = Math.max(0, Math.min(vp.width - 1, ct.x));
        ct.y = Math.max(0, Math.min(vp.height - 1, ct.y));
    }

    await page.mouse.move(cf.x, cf.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    // pointer-based splitter drag needs a minimum movement before the drag outline appears;
    // fuzz picks distances as small as 0-2px which never fire pointermove, so nudge first
    // along the drag axis then proceed to the final target (still via steps for smoothness)
    const nudge = 12;
    const dir = distance === 0 ? 1 : Math.sign(distance);
    const clamp = (p: { x: number; y: number }) => {
        if (!vp) return p;
        return { x: Math.max(0, Math.min(vp.width - 1, p.x)), y: Math.max(0, Math.min(vp.height - 1, p.y)) };
    };
    if (upDown) {
        const n1 = clamp({ x: cf.x, y: cf.y + dir * nudge });
        const n2 = clamp({ x: cf.x, y: cf.y + dir * (nudge + 1) });
        await page.mouse.move(n1.x, n1.y);
        await page.mouse.move(n2.x, n2.y);
    } else {
        const n1 = clamp({ x: cf.x + dir * nudge, y: cf.y });
        const n2 = clamp({ x: cf.x + dir * (nudge + 1), y: cf.y });
        await page.mouse.move(n1.x, n1.y);
        await page.mouse.move(n2.x, n2.y);
    }
    await page.mouse.move(ct.x, ct.y, { steps: 10 });
    await page.waitForTimeout(50);
    await page.mouse.up();
}
