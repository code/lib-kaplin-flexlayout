import { test } from "@playwright/test";

// performance harness: not part of the regular suite, run with PERF=1
// PERF=1 npx playwright test --project=chromium perf-harness
test.skip(!process.env.PERF, "perf harness, run with PERF=1");

function bigLayout(rows: number, tabsetsPerRow: number, tabsPerTabset: number) {
    let n = 0;
    return {
        global: {},
        borders: [],
        layout: {
            type: "row",
            children: Array.from({ length: rows }, () => ({
                type: "row",
                weight: 1,
                children: Array.from({ length: tabsetsPerRow }, () => ({
                    type: "tabset",
                    weight: 1,
                    children: Array.from({ length: tabsPerTabset }, () => ({
                        type: "tab",
                        name: "T" + n++,
                        component: "text",
                        config: { text: "content " + n },
                    })),
                })),
            })),
        },
    };
}

test("measure select and splitter drag", async ({ page }) => {
    const layout = bigLayout(6, 5, 3); // 30 tabsets, 90 tabs
    await page.addInitScript((json) => {
        localStorage.setItem("perf_big", json);
    }, JSON.stringify(layout));
    await page.goto("/demo?layout=perf_big");
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(500); // settle

    const results = await page.evaluate(async () => {
        const raf2 = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

        // --- tab select latency ---
        const buttons = Array.from(document.querySelectorAll('[data-layout-path="/r0/ts0/tb0"], [data-layout-path="/r0/ts0/tb1"]')) as HTMLElement[];
        const selectTimes: number[] = [];
        for (let i = 0; i < 30; i++) {
            const el = buttons[i % 2];
            const t0 = performance.now();
            el.click(); // react discrete events flush synchronously
            selectTimes.push(performance.now() - t0);
            await raf2();
        }

        // --- realtime splitter drag ---
        const splitter = document.querySelector('[data-layout-path="/s0"]') as HTMLElement;
        const sr = splitter.getBoundingClientRect();
        const cx = sr.x + sr.width / 2;
        const cy = sr.y + sr.height / 2;
        const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
        const moveTimes: number[] = [];
        splitter.dispatchEvent(new PointerEvent("pointerdown", opts(cx, cy)));
        for (let i = 0; i < 40; i++) {
            const y = cy + ((i % 20) - 10) * 4;
            const t0 = performance.now();
            document.dispatchEvent(new PointerEvent("pointermove", opts(cx, y)));
            moveTimes.push(performance.now() - t0);
            await raf2();
        }
        document.dispatchEvent(new PointerEvent("pointerup", opts(cx, cy)));

        return {
            selectMedianMs: median(selectTimes),
            dragMoveMedianMs: median(moveTimes),
        };
    });

    console.log("PERF", JSON.stringify(results));
});

test("measure splitter drag fps with realtime resize", async ({ page }) => {
    const layout = bigLayout(6, 5, 3); // 30 tabsets, 90 tabs
    await page.addInitScript((json) => {
        localStorage.setItem("perf_big", json);
    }, JSON.stringify(layout));
    await page.goto("/demo?layout=perf_big");
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(500); // settle

    const results = await page.evaluate(async () => {
        const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
        const p95 = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];

        // idle frame rate with no activity: the per-move render cost shows up as a deficit
        const measureIdleFps = async (ms: number) => {
            const t0 = performance.now();
            let frames = 0;
            while (performance.now() - t0 < ms) {
                await raf();
                frames++;
            }
            return (frames * 1000) / (performance.now() - t0);
        };

        // drag the first root splitter for `ms`, dispatching one pointermove per animation frame
        // (the worst-case input rate) and timing each move's dispatch-to-frame latency
        const measureDrag = async (ms: number) => {
            const splitter = document.querySelector('[data-layout-path="/s0"]') as HTMLElement;
            const sr = splitter.getBoundingClientRect();
            const cx = sr.x + sr.width / 2;
            const cy = sr.y + sr.height / 2;
            const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });

            const latencies: number[] = [];
            let i = 0;
            let frames = 0;
            splitter.dispatchEvent(new PointerEvent("pointerdown", opts(cx, cy)));
            const t0 = performance.now();
            while (performance.now() - t0 < ms) {
                const y = cy + ((i % 20) - 10) * 4;
                const d0 = performance.now();
                document.dispatchEvent(new PointerEvent("pointermove", opts(cx, y)));
                await raf();
                latencies.push(performance.now() - d0);
                i++;
                frames++;
            }
            document.dispatchEvent(new PointerEvent("pointerup", opts(cx, cy)));
            const dt = performance.now() - t0;
            return { fps: (frames * 1000) / dt, latencies };
        };

        const summarize = (r: { fps: number; latencies: number[] }, idleFps: number) => ({
            fps: Math.round(r.fps * 10) / 10,
            droppedFps: Math.round((idleFps - r.fps) * 10) / 10,
            medianMs: Math.round(median(r.latencies) * 10) / 10,
            p95Ms: Math.round(p95(r.latencies) * 10) / 10,
        });

        const idleFps = await measureIdleFps(1000);

        await measureDrag(500); // warmup so JIT/caches are hot before the real measurements

        // realtime resize ON (demo default): layout re-renders on every pointermove
        const realtimeOn = await measureDrag(3000);

        // realtime resize OFF: only the drag outline moves, layout updates once on pointerup
        const cb = document.querySelector('input[name="realtimeResize"]') as HTMLInputElement;
        cb.click();
        await raf();
        await raf();
        const realtimeOff = await measureDrag(3000);

        return {
            idleFps: Math.round(idleFps * 10) / 10,
            realtimeOn: summarize(realtimeOn, idleFps),
            realtimeOff: summarize(realtimeOff, idleFps),
        };
    });

    console.log("PERF", JSON.stringify(results));
});

test("measure per-frame render time with realtime resize", async ({ page }) => {
    const layout = bigLayout(25, 6, 10); // 150 tabsets, 1500 tabs
    await page.addInitScript((json) => {
        localStorage.setItem("perf_big", json);
    }, JSON.stringify(layout));
    await page.goto("/demo?layout=perf_big");
    await page.waitForSelector(".flexlayout__tabset");
    await page.waitForTimeout(500); // settle

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    const getMetrics = async () => {
        const { metrics } = await cdp.send("Performance.getMetrics");
        return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    };

    // run a rAF loop (optionally dragging the splitter) for `ms` and return the number of animation
    // frames produced plus the browser's own render-time counters accumulated over the window (diffs
    // in seconds); dividing by the frame count gives the fundamental main-thread cost per frame
    const sample = async (ms: number, drag: boolean) => {
        const before = await getMetrics();
        const frames = await page.evaluate(
            async ({ duration, drag }: { duration: number; drag: boolean }) => {
                const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
                const splitter = document.querySelector('[data-layout-path="/s0"]') as HTMLElement;
                const sr = splitter.getBoundingClientRect();
                const cx = sr.x + sr.width / 2;
                const cy = sr.y + sr.height / 2;
                const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
                let frames = 0;
                let i = 0;
                if (drag) {
                    splitter.dispatchEvent(new PointerEvent("pointerdown", opts(cx, cy)));
                }
                const t0 = performance.now();
                while (performance.now() - t0 < duration) {
                    if (drag) {
                        const y = cy + ((i % 20) - 10) * 4;
                        document.dispatchEvent(new PointerEvent("pointermove", opts(cx, y)));
                        i++;
                    }
                    await raf();
                    frames++;
                }
                if (drag) {
                    document.dispatchEvent(new PointerEvent("pointerup", opts(cx, cy)));
                }
                return frames;
            },
            { duration: ms, drag },
        );
        const after = await getMetrics();
        const diff: Record<string, number> = {};
        for (const key of Object.keys(after)) {
            diff[key] = after[key] - before[key];
        }
        return { frames, elapsedMs: ms, diff };
    };

    const summarize = (r: { frames: number; elapsedMs: number; diff: Record<string, number> }) => {
        const frames = r.frames;
        const toMs = (name: string) => (r.diff[name] / frames) * 1000;
        return {
            fps: Math.round((frames / r.elapsedMs) * 1000 * 10) / 10,
            mainThreadPerFrameMs: Math.round(toMs("TaskDuration") * 100) / 100,
            scriptPerFrameMs: Math.round(toMs("ScriptDuration") * 100) / 100,
            layoutPerFrameMs: Math.round(toMs("LayoutDuration") * 100) / 100,
        };
    };

    await sample(800, true); // warmup so JIT/caches are hot before the real measurements

    const idle = summarize(await sample(1000, false));
    const realtimeOn = summarize(await sample(3000, true));

    // realtime resize OFF: only the drag outline moves, layout updates once on pointerup
    await page.evaluate(async () => {
        const cb = document.querySelector('input[name="realtimeResize"]') as HTMLInputElement;
        cb.click();
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
    const realtimeOff = summarize(await sample(3000, true));

    await cdp.detach();

    console.log("PERF", JSON.stringify({ idle, realtimeOn, realtimeOff }));
});

function bigBorderLayout(rows: number, tabsetsPerRow: number, tabsPerTabset: number) {
    let n = 0;
    return {
        global: {},
        borders: [
            {
                type: "border",
                location: "left",
                size: 200,
                children: [{ type: "tab", name: "LB", component: "text", config: { text: "left border" } }],
            },
        ],
        layout: {
            type: "row",
            children: Array.from({ length: rows }, () => ({
                type: "row",
                weight: 1,
                children: Array.from({ length: tabsetsPerRow }, () => ({
                    type: "tabset",
                    weight: 1,
                    children: Array.from({ length: tabsPerTabset }, () => ({
                        type: "tab",
                        name: "T" + n++,
                        component: "text",
                        config: { text: "content " + n },
                    })),
                })),
            })),
        },
    };
}

test("measure border splitter drag fps with realtime resize", async ({ page }) => {
    const layout = bigBorderLayout(25, 6, 10); // 150 tabsets, 1500 tabs + left border
    await page.addInitScript((json) => {
        localStorage.setItem("perf_big", json);
    }, JSON.stringify(layout));
    await page.goto("/demo?layout=perf_big");
    await page.waitForSelector(".flexlayout__tabset");
    // show the border panel and its splitter by selecting the border tab. this must be a real
    // (hit-tested) click: the offscreen drag stamps used to overflow down into the layout at this
    // size and block it, so this doubles as a regression guard for that overflow bug
    await page.click('[data-layout-path="/border/left/tb0"]');
    await page.waitForSelector('[data-layout-path="/border/left/s-1"]');
    await page.waitForTimeout(500); // settle

    const results = await page.evaluate(async () => {
        const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
        const p95 = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];

        const measureIdleFps = async (ms: number) => {
            const t0 = performance.now();
            let frames = 0;
            while (performance.now() - t0 < ms) {
                await raf();
                frames++;
            }
            return (frames * 1000) / (performance.now() - t0);
        };

        const measureDrag = async (ms: number) => {
            const splitter = document.querySelector('[data-layout-path="/border/left/s-1"]') as HTMLElement;
            const sr = splitter.getBoundingClientRect();
            const cx = sr.x + sr.width / 2;
            const cy = sr.y + sr.height / 2;
            const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
            const latencies: number[] = [];
            let i = 0;
            let frames = 0;
            splitter.dispatchEvent(new PointerEvent("pointerdown", opts(cx, cy)));
            const t0 = performance.now();
            while (performance.now() - t0 < ms) {
                const x = cx + ((i % 20) - 10) * 4;
                const d0 = performance.now();
                document.dispatchEvent(new PointerEvent("pointermove", opts(x, cy)));
                await raf();
                latencies.push(performance.now() - d0);
                i++;
                frames++;
            }
            document.dispatchEvent(new PointerEvent("pointerup", opts(cx, cy)));
            const dt = performance.now() - t0;
            return { fps: (frames * 1000) / dt, latencies };
        };

        const summarize = (r: { fps: number; latencies: number[] }, idleFps: number) => ({
            fps: Math.round(r.fps * 10) / 10,
            droppedFps: Math.round((idleFps - r.fps) * 10) / 10,
            medianMs: Math.round(median(r.latencies) * 10) / 10,
            p95Ms: Math.round(p95(r.latencies) * 10) / 10,
        });

        const idleFps = await measureIdleFps(1000);
        await measureDrag(500); // warmup so JIT/caches are hot before the real measurements

        const realtimeOn = await measureDrag(3000);

        // realtime resize OFF: only the drag outline moves, layout updates once on pointerup
        const cb = document.querySelector('input[name="realtimeResize"]') as HTMLInputElement;
        cb.click();
        await raf();
        await raf();
        const realtimeOff = await measureDrag(3000);

        return {
            idleFps: Math.round(idleFps * 10) / 10,
            realtimeOn: summarize(realtimeOn, idleFps),
            realtimeOff: summarize(realtimeOff, idleFps),
        };
    });

    console.log("PERF", JSON.stringify(results));
});
