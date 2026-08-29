/**
 * Fuzz test — exercises the layout with a long sequence of random UI and model
 * actions (drag/drop, splitter, clicks, add/move/delete/rename tabs, etc.) and
 * checks invariants after each step. Not part of the regular suite, run with FUZZ=1.
 *
 * How to run:
 *   pnpm fuzz                                                      # 50 iterations (default)
 *   pnpm fuzz:200                                                  # 200 iterations
 *
 * Parametrization via CLI (env vars are forwarded to workers; argv after -- is not):
 *   FUZZ_ITERATIONS=200 FUZZ=1 npx playwright test --project=chromium fuzz
 *   FUZZ_SEED=12345 FUZZ=1 npx playwright test --project=chromium fuzz
 *   FUZZ_ITERATIONS=10 FUZZ_SEED=1 FUZZ=1 npx playwright test --project=chromium fuzz
 *   (legacy: FUZZ=1 npx playwright test --project=chromium fuzz -- --fuzz-iterations=200 also works when argv is available)
 *
 * On failure the test dumps seed, layout, action log and last model JSON to stdout.
 */
import { test, expect, Page } from "@playwright/test";
import { drag, dragSplitter, findPath, Location, waitForBox } from "./helpers";

// fuzz harness: not part of the regular suite, run with FUZZ=1
// FUZZ=1 npx playwright test --project=chromium fuzz
test.skip(!process.env.FUZZ, "fuzz harness, run with FUZZ=1");

test.describe.configure({ mode: "serial" });

const FUZZ_LAYOUTS = ["test_two_tabs", "test_three_tabs", "test_with_borders", "groups", "default"] as const;
function parseFuzzArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    if (hit) return hit.slice(prefix.length);
    // also support bare name=value after -- separator (e.g. -- --fuzz-iterations=200)
    for (const a of process.argv) {
        const m = a.match(new RegExp(`^${name}=(.+)$`));
        if (m) return m[1];
    }
    return undefined;
}
const FUZZ_ITERATIONS = Number(process.env.FUZZ_ITERATIONS ?? parseFuzzArg("fuzz-iterations") ?? parseFuzzArg("FUZZ_ITERATIONS") ?? 50);
const DOCK_LOCATIONS = ["center", "top", "bottom", "left", "right"] as const;

function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng: () => number, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
}

async function getLiveCounts(page: Page) {
    return page.evaluate(() => {
        const m = (window as any).__flexModel?.();
        if (!m) return { tabs: 0, tabsets: 0, borders: 0, groups: 0 };
        let tabs = 0;
        let tabsets = 0;
        let groups = 0;
        m.visitNodes((n: any) => {
            const t = n.getType();
            if (t === "tab") tabs++;
            if (t === "tabset") tabsets++;
            if (t === "tabgroup") groups++;
        });
        const borders = m.getBorderSet().getBorders().length;
        return { tabs, tabsets, borders, groups };
    });
}

async function checkInvariants(page: Page): Promise<string | null> {
    const result = await page.evaluate(() => {
        const w = window as any;
        const m = w.__flexModel?.();
        if (!m) return { ok: false, err: "no model" };
        try {
            const json = m.toJson();
            JSON.stringify(json);
            if (!json.layout) return { ok: false, err: "missing layout" };
            const seen = new Set<string>();
            let dup: string | null = null;
            let tabs = 0;
            let tabsets = 0;
            m.visitNodes((n: any) => {
                const id = n.getId();
                if (seen.has(id)) dup = id;
                seen.add(id);
                const t = n.getType();
                if (t === "tab") tabs++;
                if (t === "tabset") tabsets++;
            });
            if (dup) return { ok: false, err: `duplicate id ${dup}` };
            if (tabs === 0 && tabsets === 0) return { ok: false, err: "empty model" };
            return { ok: true, err: null };
        } catch (e) {
            return { ok: false, err: String(e) };
        }
    });
    if (!result.ok) return result.err as string;
    return null;
}

test("fuzz — random UI+model actions (collect-and-continue)", async ({ page }) => {
    const iterations = FUZZ_ITERATIONS;
    // ~2s per iteration + 60s overhead, minimum 120s — must cover worst-case 15s waitForBox timeouts
    test.setTimeout(Math.max(120000, iterations * 2000 + 60000));
    const seed = Number(process.env.FUZZ_SEED ?? parseFuzzArg("fuzz-seed") ?? parseFuzzArg("FUZZ_SEED") ?? Date.now());
    const rng = mulberry32(seed);
    const layoutName = pick(rng, FUZZ_LAYOUTS);

    const failures: Array<{ iter: number; action: string; error: string }> = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => {
        const msg = String(err.message ?? err);
        // vite HMR noise during rapid model invalidation — not a model bug
        if (msg.includes("SendBeforeConnectError") || msg.includes("[vite]") || msg.includes("createRoot()")) {
            return;
        }
        pageErrors.push(msg);
    });
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            const text = msg.text();
            if (
                text.includes("Download the React DevTools") ||
                text.includes("flushSync was called from inside a lifecycle method") ||
                text.includes("SendBeforeConnectError") ||
                text.includes("[vite]") ||
                text.includes("createRoot()")
            ) {
                return;
            }
            consoleErrors.push(text);
        }
    });
    page.on("crash", () => {
        failures.push({ iter: -1, action: "page", error: "page crashed" });
    });
    page.on("close", () => {
        // will be detected at top of loop; avoid noisy after-close errors
    });

    await page.addInitScript(() => {
        try {
            localStorage.clear();
        } catch (_e) {
            // ignore
        }
    });
    await page.goto(`/demo?layout=${layoutName}`, { waitUntil: "commit" });
    await expect(page).toHaveTitle(/FlexLayout Demo/, { timeout: 15000 });
    // fail fast if navigation landed on about:blank (dev server not ready / crash)
    if (page.url() === "about:blank" || page.isClosed()) {
        throw new Error(`fuzz setup: page is ${page.isClosed() ? "closed" : page.url()} after goto /demo?layout=${layoutName} — is dev server running?`);
    }
    await page.waitForFunction(() => !!(window as any).__flexModel?.(), undefined, { timeout: 15000 });
    await waitForBox(page.locator(".flexlayout__layout").first(), "main layout");

    const actions: Array<{ name: string; weight: number; fn: (iter: number) => Promise<string> }> = [
        {
            name: "ui:dragTabToTab",
            weight: 18,
            fn: async () => {
                const tabs = page.locator('[role="tab"]:visible');
                const count = await tabs.count();
                if (count < 2) return "skip: <2 visible tabs";
                const fromIdx = randInt(rng, 0, count - 1);
                let toIdx = randInt(rng, 0, count - 1);
                if (toIdx === fromIdx) toIdx = (toIdx + 1) % count;
                const from = tabs.nth(fromIdx);
                const to = tabs.nth(toIdx);
                const loc = pick(rng, [Location.CENTER, Location.TOP, Location.BOTTOM, Location.LEFT, Location.RIGHT]);
                try {
                    await drag(page, from, to, loc);
                } catch (e) {
                    const msg = String((e as Error)?.message ?? e);
                    if (msg.includes("bounding box") || msg.includes("edge rect")) return `skip: drag no box ${msg.slice(0, 80)}`;
                    throw e;
                }
                return `drag tab ${fromIdx} -> tab ${toIdx} loc=${loc}`;
            },
        },
        {
            name: "ui:dragTabToEdge",
            weight: 6,
            fn: async () => {
                const tabs = page.locator('[role="tab"]:visible');
                const count = await tabs.count();
                if (count === 0) return "skip: no visible tabs";
                const from = tabs.nth(randInt(rng, 0, count - 1));
                const edge = randInt(rng, 0, 3);
                const { dragToEdge } = await import("./helpers");
                try {
                    await dragToEdge(page, from, edge);
                } catch (e) {
                    const msg = String((e as Error)?.message ?? e);
                    if (msg.includes("bounding box") || msg.includes("edge rect")) return `skip: dragToEdge no box ${msg.slice(0, 80)}`;
                    throw e;
                }
                return `drag tab -> edge ${edge}`;
            },
        },
        {
            name: "ui:dragTabToTabstrip",
            weight: 6,
            fn: async () => {
                const tabs = page.locator('[role="tab"]:visible');
                const tabsets = page.locator(".flexlayout__tabset:visible");
                const tc = await tabs.count();
                const sc = await tabsets.count();
                if (tc === 0 || sc === 0) return "skip: no visible tabs/tabsets";
                const from = tabs.nth(randInt(rng, 0, tc - 1));
                const to = tabsets.nth(randInt(rng, 0, sc - 1));
                try {
                    await drag(page, from, to, Location.CENTER);
                } catch (e) {
                    const msg = String((e as Error)?.message ?? e);
                    if (msg.includes("bounding box") || msg.includes("edge rect")) return `skip: drag tabstrip no box ${msg.slice(0, 80)}`;
                    throw e;
                }
                return "drag tab -> tabset center";
            },
        },
        {
            name: "ui:dragSplitter",
            weight: 8,
            fn: async () => {
                const splitters = page.locator(".flexlayout__splitter:visible");
                const count = await splitters.count();
                if (count === 0) return "skip: no visible splitters";
                const idx = randInt(rng, 0, count - 1);
                const splitter = splitters.nth(idx);
                const box = await splitter.boundingBox().catch(() => null);
                if (!box) return "skip: splitter no box";
                const horizontal = box.height > box.width;
                const dist = randInt(rng, -120, 120);
                try {
                    await dragSplitter(page, splitter, horizontal, dist);
                } catch (e) {
                    const msg = String((e as Error)?.message ?? e);
                    if (msg.includes("bounding box")) return `skip: splitter no box ${msg.slice(0, 80)}`;
                    throw e;
                }
                return `drag splitter ${idx} ${horizontal ? "v" : "h"} ${dist}`;
            },
        },
        {
            name: "ui:clickTab",
            weight: 6,
            fn: async () => {
                const tabs = page.locator('[role="tab"]:visible');
                const count = await tabs.count();
                if (count === 0) return "skip: no visible tabs";
                const idx = randInt(rng, 0, count - 1);
                await tabs
                    .nth(idx)
                    .click({ timeout: 5000 })
                    .catch(() => {});
                return `click tab ${idx}`;
            },
        },
        {
            name: "ui:clickBorderTab",
            weight: 4,
            fn: async () => {
                const borderTabs = page.locator('[data-layout-path^="/border"] [role="tab"]:visible');
                const count = await borderTabs.count();
                if (count === 0) return "skip: no visible border tabs";
                const idx = randInt(rng, 0, count - 1);
                await borderTabs
                    .nth(idx)
                    .click({ timeout: 5000 })
                    .catch(() => {});
                return `click border tab ${idx}`;
            },
        },
        {
            name: "ui:maximizeToggle",
            weight: 3,
            fn: async () => {
                const btns = page.locator('[data-layout-path$="/button/max"]:visible');
                const count = await btns.count();
                if (count === 0) return "skip: no maximize buttons";
                const idx = randInt(rng, 0, count - 1);
                await btns
                    .nth(idx)
                    .click({ timeout: 5000 })
                    .catch(() => {});
                return `maximize toggle ${idx}`;
            },
        },
        {
            name: "ui:closeTab",
            weight: 5,
            fn: async () => {
                const closeBtns = page.locator('[data-layout-path*="/tb"][data-layout-path*="/button/close"]:visible');
                const count = await closeBtns.count();
                if (count === 0) {
                    const alt = page.locator(".flexlayout__tab_button_trailing .flexlayout__tab_button_button--close:visible");
                    const c2 = await alt.count();
                    if (c2 === 0) return "skip: no close buttons";
                    const idx = randInt(rng, 0, c2 - 1);
                    await alt
                        .nth(idx)
                        .click({ timeout: 5000 })
                        .catch(() => {});
                    return `close tab alt ${idx}`;
                }
                const idx = randInt(rng, 0, count - 1);
                await closeBtns
                    .nth(idx)
                    .click({ timeout: 5000 })
                    .catch(() => {});
                return `close tab ${idx}`;
            },
        },
        {
            name: "model:addTab",
            weight: 8,
            fn: async () => {
                const info = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return null;
                    const tabsets: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "tabset") tabsets.push(n.getId());
                    });
                    return { tabsets };
                });
                if (!info || info.tabsets.length === 0) return "skip: no tabsets";
                const toId = pick(rng, info.tabsets);
                const loc = pick(rng, DOCK_LOCATIONS);
                const idx = rng() < 0.5 ? -1 : randInt(rng, 0, 3);
                const name = `Fuzz${randInt(rng, 1, 9999)}`;
                await page.evaluate(
                    ({ toNode, location, index, tabName }) => {
                        const w = window as any;
                        w.__flexDispatch(w.__flexActions.addTab({ name: tabName, component: "testing" }, toNode, { getName: () => location } as any, index));
                    },
                    { toNode: toId, location: loc, index: idx, tabName: name },
                );
                return `model addTab -> ${toId} loc=${loc} idx=${idx} name=${name}`;
            },
        },
        {
            name: "model:moveNode",
            weight: 7,
            fn: async () => {
                const info = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return null;
                    const tabs: string[] = [];
                    const tabsets: string[] = [];
                    const borders: string[] = [];
                    m.visitNodes((n: any) => {
                        const t = n.getType();
                        if (t === "tab") tabs.push(n.getId());
                        if (t === "tabset") tabsets.push(n.getId());
                        if (t === "border") borders.push(n.getId());
                    });
                    return { tabs, tabsets, borders };
                });
                if (!info || info.tabs.length === 0) return "skip: no tabs";
                const fromId = pick(rng, info.tabs);
                const candidates = [...info.tabsets, ...info.borders];
                if (candidates.length === 0) return "skip: no drop targets";
                const toId = pick(rng, candidates);
                if (fromId === toId) return "skip: same id";
                const loc = pick(rng, DOCK_LOCATIONS);
                const idx = rng() < 0.5 ? -1 : randInt(rng, 0, 2);
                await page.evaluate(
                    ({ fromNode, toNode, location, index }) => {
                        const w = window as any;
                        w.__flexDispatch(w.__flexActions.moveNode(fromNode, toNode, { getName: () => location } as any, index));
                    },
                    { fromNode: fromId, toNode: toId, location: loc, index: idx },
                );
                return `model moveNode ${fromId} -> ${toId} loc=${loc} idx=${idx}`;
            },
        },
        {
            name: "model:deleteTab",
            weight: 4,
            fn: async () => {
                const tabs: string[] = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "tab") out.push(n.getId());
                    });
                    return out;
                });
                if (tabs.length === 0) return "skip: no tabs";
                const id = pick(rng, tabs);
                await page.evaluate((nodeId) => {
                    const w = window as any;
                    w.__flexDispatch(w.__flexActions.deleteTab(nodeId));
                }, id);
                return `model deleteTab ${id}`;
            },
        },
        {
            name: "model:renameTab",
            weight: 3,
            fn: async () => {
                const tabs: string[] = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "tab") out.push(n.getId());
                    });
                    return out;
                });
                if (tabs.length === 0) return "skip: no tabs";
                const id = pick(rng, tabs);
                const name = `R${randInt(rng, 1, 9999)}`;
                await page.evaluate(
                    ({ nodeId, text }) => {
                        const w = window as any;
                        w.__flexDispatch(w.__flexActions.renameTab(nodeId, text));
                    },
                    { nodeId: id, text: name },
                );
                return `model renameTab ${id} -> ${name}`;
            },
        },
        {
            name: "model:selectTab",
            weight: 4,
            fn: async () => {
                const tabs: string[] = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "tab") out.push(n.getId());
                    });
                    return out;
                });
                if (tabs.length === 0) return "skip: no tabs";
                const id = pick(rng, tabs);
                await page.evaluate((nodeId) => {
                    const w = window as any;
                    w.__flexDispatch(w.__flexActions.selectTab(nodeId));
                }, id);
                return `model selectTab ${id}`;
            },
        },
        {
            name: "model:setTabPinned",
            weight: 3,
            fn: async () => {
                const tabs: string[] = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "tab") out.push(n.getId());
                    });
                    return out;
                });
                if (tabs.length === 0) return "skip: no tabs";
                const id = pick(rng, tabs);
                const pinned = rng() < 0.5;
                await page.evaluate(
                    ({ nodeId, p }) => {
                        const w = window as any;
                        w.__flexDispatch(w.__flexActions.setTabPinned(nodeId, p));
                    },
                    { nodeId: id, p: pinned },
                );
                return `model setTabPinned ${id} ${pinned}`;
            },
        },
        {
            name: "model:adjustWeights",
            weight: 4,
            fn: async () => {
                const rows: string[] = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "row") {
                            const kids = n.getChildren();
                            if (kids.length >= 2) out.push(n.getId());
                        }
                    });
                    return out;
                });
                if (rows.length === 0) return "skip: no multi-child rows";
                const rowId = pick(rng, rows);
                const weights: number[] = await page.evaluate((rId) => {
                    const m = (window as any).__flexModel?.();
                    const row = m.getNodeById(rId);
                    const n = row.getChildren().length;
                    return Array.from({ length: n }, () => 0);
                }, rowId);
                for (let i = 0; i < weights.length; i++) {
                    const r = rng();
                    if (r < 0.05) weights[i] = 0;
                    else if (r < 0.08) weights[i] = -10;
                    else if (r < 0.1) weights[i] = Number.NaN;
                    else weights[i] = randInt(rng, 20, 300);
                }
                await page.evaluate(
                    ({ nodeId, w }) => {
                        const win = window as any;
                        win.__flexDispatch(win.__flexActions.adjustWeights(nodeId, w));
                    },
                    { nodeId: rowId, w: weights },
                );
                return `model adjustWeights ${rowId} [${weights.join(",")}]`;
            },
        },
        {
            name: "model:updateNodeAttributes",
            weight: 3,
            fn: async () => {
                const nodes: Array<{ id: string; type: string }> = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: Array<{ id: string; type: string }> = [];
                    m.visitNodes((n: any) => {
                        const t = n.getType();
                        if (t === "tab" || t === "tabset" || t === "border") out.push({ id: n.getId(), type: t });
                    });
                    return out;
                });
                if (nodes.length === 0) return "skip: no nodes";
                const target = pick(rng, nodes);
                const attrs =
                    target.type === "tab"
                        ? { enableClose: rng() < 0.5, enableDrag: rng() < 0.5 }
                        : target.type === "tabset"
                          ? { enableDeleteWhenEmpty: rng() < 0.5, enableMaximize: rng() < 0.5 }
                          : { enableDrop: rng() < 0.5 };
                await page.evaluate(
                    ({ nodeId, json }) => {
                        const w = window as any;
                        w.__flexDispatch(w.__flexActions.updateNodeAttributes(nodeId, json));
                    },
                    { nodeId: target.id, json: attrs },
                );
                return `model updateNodeAttributes ${target.id} ${JSON.stringify(attrs)}`;
            },
        },
        {
            name: "model:createFloat",
            weight: 2,
            fn: async () => {
                const rect = { x: randInt(rng, 50, 300), y: randInt(rng, 50, 300), width: randInt(rng, 200, 400), height: randInt(rng, 150, 300) };
                const name = `Float${randInt(rng, 1, 9999)}`;
                await page.evaluate(
                    ({ r, tabName }) => {
                        const w = window as any;
                        w.__flexDispatch(
                            w.__flexActions.createSubLayout({ type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: tabName, component: "testing" }] }] }, r, "float"),
                        );
                    },
                    { r: rect, tabName: name },
                );
                return `model createFloat ${name} ${JSON.stringify(rect)}`;
            },
        },
        {
            name: "model:groupActions",
            weight: 2,
            fn: async () => {
                const tabs: string[] = await page.evaluate(() => {
                    const m = (window as any).__flexModel?.();
                    if (!m) return [];
                    const out: string[] = [];
                    m.visitNodes((n: any) => {
                        if (n.getType() === "tab") out.push(n.getId());
                    });
                    return out;
                });
                if (tabs.length < 2) return "skip: <2 tabs for group";
                const a = pick(rng, tabs);
                let b = pick(rng, tabs);
                if (a === b) b = tabs[(tabs.indexOf(a) + 1) % tabs.length];
                await page.evaluate(
                    ({ idA, idB }) => {
                        const w = window as any;
                        const g = w.__flexActions.group([w.__flexActions.renameTab(idA, "G1"), w.__flexActions.renameTab(idB, "G2")]);
                        w.__flexDispatch(g);
                    },
                    { idA: a, idB: b },
                );
                return `model group rename ${a},${b}`;
            },
        },
    ];

    const totalWeight = actions.reduce((s, a) => s + a.weight, 0);

    function pickAction(r: () => number) {
        let roll = r() * totalWeight;
        for (const a of actions) {
            if (roll < a.weight) return a;
            roll -= a.weight;
        }
        return actions[actions.length - 1];
    }

    const actionLog: Array<{ iter: number; action: string; detail: string }> = [];

    for (let iter = 0; iter < iterations; iter++) {
        // fail fast if page crashed or navigated to about:blank — otherwise the
        // remaining iterations just spin on 15s waitForBox timeouts and hit the
        // outer test timeout with a blank screenshot and no console errors.
        if (page.isClosed() || page.url() === "about:blank") {
            failures.push({ iter, action: "page", error: `page ${page.isClosed() ? "closed" : "about:blank"} at iter ${iter} — aborting remaining iterations` });
            break;
        }
        const chosen = pickAction(rng);
        let detail = "";
        try {
            detail = await chosen.fn(iter);
            actionLog.push({ iter, action: chosen.name, detail });
        } catch (e) {
            const msg = String((e as Error)?.message ?? e);
            // browser/page closed is unrecoverable — abort instead of queuing
            // 50+ follow-on "Target page, context or browser has been closed" failures
            if (msg.includes("Target page, context or browser has been closed") || msg.includes("Test timeout") || msg.includes("page is closed")) {
                failures.push({ iter, action: chosen.name, error: `action-throw: ${msg} detail=${detail} — aborting` });
                actionLog.push({ iter, action: chosen.name, detail: `throw: ${msg}` });
                break;
            }
            failures.push({ iter, action: chosen.name, error: `action-throw: ${msg} detail=${detail}` });
            actionLog.push({ iter, action: chosen.name, detail: `throw: ${msg}` });
            continue;
        }

        await page.waitForTimeout(60);

        try {
            const inv = await checkInvariants(page);
            if (inv) {
                failures.push({ iter, action: chosen.name, error: `invariant: ${inv} detail=${detail}` });
            }
        } catch (e) {
            failures.push({ iter, action: chosen.name, error: `invariant-throw: ${String((e as Error)?.message ?? e)} detail=${detail}` });
        }

        if (pageErrors.length > 0 || consoleErrors.length > 0) {
            const err = [...pageErrors, ...consoleErrors].join(" | ");
            failures.push({ iter, action: chosen.name, error: `pageerror/console: ${err} detail=${detail}` });
            pageErrors.length = 0;
            consoleErrors.length = 0;
        }

        const counts = await getLiveCounts(page).catch(() => ({ tabs: -1, tabsets: -1, borders: -1, groups: -1 }));
        if (counts.tabs === 0 && counts.tabsets === 0) {
            failures.push({ iter, action: chosen.name, error: `empty model tabs=0 tabsets=0 detail=${detail}` });
        }

        if (detail.startsWith("skip:")) {
            continue;
        }

        await expect(page.locator(".flexlayout__layout").first())
            .toBeVisible({ timeout: 5000 })
            .catch((e) => {
                failures.push({ iter, action: chosen.name, error: `layout not visible: ${String((e as Error)?.message ?? e)} detail=${detail}` });
            });
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
        failures.push({ iter: iterations, action: "final", error: `pageerror/console: ${[...pageErrors, ...consoleErrors].join(" | ")}` });
    }

    const finalInvariant = await checkInvariants(page).catch((e) => String((e as Error)?.message ?? e));
    if (finalInvariant) {
        failures.push({ iter: iterations, action: "final", error: `final invariant: ${finalInvariant}` });
    }

    if (failures.length > 0) {
        const lastModel = await page
            .evaluate(() => {
                try {
                    return (window as any).__flexModel?.().toJson() ?? null;
                } catch (e) {
                    return { error: String(e) };
                }
            })
            .catch((e) => ({ error: String(e) }));
        console.log(
            JSON.stringify(
                {
                    seed,
                    layout: layoutName,
                    iterations,
                    failures,
                    actionLog,
                    lastModel,
                },
                null,
                2,
            ),
        );
    } else {
        console.log(JSON.stringify({ seed, layout: layoutName, iterations, status: "ok" }));
    }

    expect(failures, `fuzz seed ${seed} layout ${layoutName} — ${failures.length} failure(s), see stdout for actionLog`).toEqual([]);

    // keep references to avoid unused warnings
    void findPath;
    void waitForBox;
    void Location;
    void dragSplitter;
});
