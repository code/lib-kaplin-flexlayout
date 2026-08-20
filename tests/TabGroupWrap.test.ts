// @vitest-environment node
import { Actions, DockLocation, Model, TabGroupNode, TabNode, TabSetNode, Rect, IJsonModel, IJsonTabNode } from "../src";

const tab = (id: string, name: string): IJsonTabNode => ({ type: "tab", id, name });

const group = (id: string, name: string, children: IJsonTabNode[], extra: Record<string, any> = {}) => ({ type: "tabgroup", id, name, children, ...extra });

const makeModel = (json: IJsonModel) => Model.fromJson(json);

describe("TabGroupNode wrapped containment", () => {
    // a group whose tabs wrap onto two lines in a horizontal (tabset) strip:
    //   line 1 (y=0): pill [0..100], t1 [105..165], t2 [170..230]
    //   line 2 (y=40): t3 [0..60], t4 [65..125]
    const setup = () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type"), tab("t3", "Icons"), tab("t4", "Fonts")])] }] },
        });
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(0, 0, 100, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(105, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(170, 0, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t4") as TabNode).setTabRect(new Rect(65, 40, 60, 30));
        return { model, g };
    };

    it("getLineRects returns one rect per wrapped line", () => {
        const { g } = setup();
        const lines = g.getLineRects();
        expect(lines).toHaveLength(2);
        expect(lines[0].toJson()).toEqual({ x: 0, y: 0, width: 230, height: 30 });
        expect(lines[1].toJson()).toEqual({ x: 0, y: 40, width: 125, height: 30 });
    });

    it("getLines keeps the elements in flow order within each line", () => {
        const { g } = setup();
        const lines = g.getLines();
        expect(lines).toHaveLength(2);
        // line 1: pill, t1, t2; line 2: t3, t4
        expect(lines[0].map((r) => r.toJson())).toEqual([
            { x: 0, y: 0, width: 100, height: 30 },
            { x: 105, y: 0, width: 60, height: 30 },
            { x: 170, y: 0, width: 60, height: 30 },
        ]);
        expect(lines[1].map((r) => r.toJson())).toEqual([
            { x: 0, y: 40, width: 60, height: 30 },
            { x: 65, y: 40, width: 60, height: 30 },
        ]);
    });

    it("getLineRectAt returns the line containing the point", () => {
        const { g } = setup();
        expect(g.getLineRectAt(50, 10)?.toJson()).toEqual({ x: 0, y: 0, width: 230, height: 30 });
        expect(g.getLineRectAt(100, 50)?.toJson()).toEqual({ x: 0, y: 40, width: 125, height: 30 });
        // inter-line gap: not within any line band
        expect(g.getLineRectAt(120, 35)).toBeUndefined();
    });

    it("contains points inside each wrapped element", () => {
        const { g } = setup();
        expect(g.contains(10, 10)).toBe(true); // pill
        expect(g.contains(120, 10)).toBe(true); // t1 (line 1)
        expect(g.contains(200, 10)).toBe(true); // t2 (line 1)
        expect(g.contains(20, 50)).toBe(true); // t3 (line 2)
        expect(g.contains(90, 50)).toBe(true); // t4 (line 2)
    });

    it("contains points in the gap between two of its own tabs on the same line (dividers)", () => {
        const { g } = setup();
        // between t1 and t2 on line 1
        expect(g.contains(168, 10)).toBe(true);
        // between t3 and t4 on line 2
        expect(g.contains(63, 50)).toBe(true);
    });

    it("does NOT contain points in the inter-line gap or outside the group", () => {
        const { g } = setup();
        // inter-line gap (y=15..40 is empty between line 1 at y=0..30 and line 2 at y=40..70)
        expect(g.contains(120, 35)).toBe(false);
        // the old bounding union would wrongly include this; line-aware must exclude it
        expect(g.contains(30, 35)).toBe(false);
        // right of line 1 (no element there)
        expect(g.contains(300, 10)).toBe(false);
        // below everything
        expect(g.contains(20, 75)).toBe(false);
    });
});

describe("wrapped group drag indicators", () => {
    // tabset with a leading tab, a group wrapping onto two lines and a trailing tab:
    //   line 1 (y=0): t0 [0..60], pill [100..160], t1 [165..225], t2 [230..290], t6 [300..360]
    //   line 2 (y=40): t3 [0..60], t4 [65..125]
    const setup = () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [
                    { type: "tabset", id: "ts0", children: [tab("t0", "Home"), group("g1", "Design", [tab("t1", "C"), tab("t2", "T"), tab("t3", "I"), tab("t4", "F")]), tab("t6", "Settings")] },
                ],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 120));
        ts0.setTabStripRect(new Rect(0, 0, 400, 80));
        const g = model.getNodeById("g1") as TabGroupNode;
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        g.setPillRect(new Rect(100, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(165, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(230, 0, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t4") as TabNode).setTabRect(new Rect(65, 40, 60, 30));
        (model.getNodeById("t6") as TabNode).setTabRect(new Rect(300, 0, 60, 30));
        const drag = model.getNodeById("t6") as TabNode;
        return { model, g, drag };
    };

    const target = (ts0: TabSetNode, drag: TabNode, x: number, y: number) => ts0.findDropTargetNode(Model.MAIN_LAYOUT_ID, drag, x, y);

    it("the gap before the pill on line 1 drops before the group (not strip start/end)", () => {
        const { g, drag } = setup();
        const ts0 = g.getParent() as TabSetNode;
        const di = target(ts0, drag, 80, 10);
        expect(di).toBeDefined();
        expect(di!.node).toBe(ts0);
        expect(di!.index).toBe(1);
        // the outline sits at the pill's left edge on line 1, not at the strip start (x=0)
        expect(di!.rect.toJson()).toEqual({ x: 98, y: 0, width: 3, height: 30 });
    });

    it("the space just after a start pill keeps the group drop (does not become no-drop)", () => {
        // g1's pill is alone on line 1 (its tabs and the trailing tab t6 wrapped onto line 2), so
        // the whole of line 1 after the pill is the group's leading strip space. g1 is NOT the
        // last child, so this space still defers into the group rather than appending after it.
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Home"), group("g1", "Design", [tab("t1", "C"), tab("t2", "T")]), tab("t6", "Settings")] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 120));
        ts0.setTabStripRect(new Rect(0, 0, 400, 80));
        const g = model.getNodeById("g1") as TabGroupNode;
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        g.setPillRect(new Rect(100, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(65, 40, 60, 30));
        (model.getNodeById("t6") as TabNode).setTabRect(new Rect(130, 40, 60, 30));
        const drag = model.getNodeById("t1") as TabNode;
        // on the pill -> group drop
        const onPill = target(ts0, drag, 120, 10);
        expect(onPill!.node).toBe(g);
        expect(onPill!.index).toBe(0);
        // just after the pill (line 1 empty space) -> still the group drop (index 0)
        const afterPill = target(ts0, drag, 200, 10);
        expect(afterPill).toBeDefined();
        expect(afterPill!.node).toBe(g);
        expect(afterPill!.index).toBe(0);
    });

    it("a tab can be placed after the last group in a tabset (strip append)", () => {
        // g1 is the LAST child, so the trailing space after it appends the tab after the group
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Home"), group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type")])] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 100));
        ts0.setTabStripRect(new Rect(0, 0, 400, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        g.setPillRect(new Rect(100, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(165, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(230, 0, 60, 30));
        const drag = model.getNodeById("t0") as TabNode;
        // trailing space after the last group -> the tab is placed AFTER the group (tabset append),
        // not appended into the group
        const di = target(ts0, drag, 300, 10);
        expect(di).toBeDefined();
        expect(di!.node).toBe(ts0);
        expect(di!.index).toBe(2);
        // the outline sits at the group's true end (after its last tab)
        expect(di!.rect.toJson()).toEqual({ x: 288, y: 0, width: 3, height: 30 });
        // performing the drop places the tab after the group (not inside it)
        model.doAction(Actions.moveNode("t0", "ts0", DockLocation.CENTER, di!.index));
        expect(ts0.getChildren().map((c) => c.getId())).toEqual(["g1", "t0"]);
    });

    it("the tabset append indicator is a single-line bar when tabs wrap", () => {
        // a tabset with only regular tabs wrapping: appending at the end must be single-line high
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "A"), tab("t1", "B"), tab("t2", "C"), tab("t3", "D")] }] },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 300, 140));
        ts0.setTabStripRect(new Rect(0, 0, 300, 110));
        // line 1: A[0..60] B[70..130]; line 2: C[0..60] D[70..130]
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(70, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(70, 40, 60, 30));
        // after D on line 2: append indicator must be one line high (not the full strip height)
        const di = target(ts0, model.getNodeById("t3") as TabNode, 150, 50);
        expect(di).toBeDefined();
        expect(di!.index).toBe(4);
        expect(di!.rect.toJson()).toEqual({ x: 128, y: 40, width: 3, height: 30 });
    });

    it("drops on a wrapped line-2 tab defer to the group with the right index", () => {
        const { g, drag } = setup();
        const ts0 = g.getParent() as TabSetNode;
        // on t3 (line 2): insert before it (group index 2)
        const onT3 = target(ts0, drag, 20, 50);
        expect(onT3).toBeDefined();
        expect(onT3!.node).toBe(g);
        expect(onT3!.index).toBe(2);
        // on t4 (line 2): insert before it (group index 3)
        const onT4 = target(ts0, drag, 90, 50);
        expect(onT4!.node).toBe(g);
        expect(onT4!.index).toBe(3);
    });

    it("the right half of the last tab on line 1 inserts after it", () => {
        const { g, drag } = setup();
        const ts0 = g.getParent() as TabSetNode;
        const di = target(ts0, drag, 280, 10);
        expect(di).toBeDefined();
        expect(di!.node).toBe(g);
        expect(di!.index).toBe(2);
    });

    it("the gap before a closed group's pill drops before that group", () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Home"), group("g1", "Design", [tab("t1", "C")], { opened: false }), tab("t4", "Settings")] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 100));
        ts0.setTabStripRect(new Rect(0, 0, 400, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        g.setPillRect(new Rect(100, 0, 60, 30));
        (model.getNodeById("t4") as TabNode).setTabRect(new Rect(170, 0, 60, 30));
        const di = target(ts0, model.getNodeById("t4") as TabNode, 80, 10);
        expect(di).toBeDefined();
        expect(di!.node).toBe(ts0);
        expect(di!.index).toBe(1);
        expect(di!.rect.toJson()).toEqual({ x: 98, y: 0, width: 3, height: 30 });
    });

    it("inter-line gaps do not resolve to the group", () => {
        const { g, drag } = setup();
        const ts0 = g.getParent() as TabSetNode;
        const di = target(ts0, drag, 120, 35);
        expect(di === undefined || (di!.node as any) !== g).toBe(true);
    });

    it("empty space on a wrapped line after the group's last tab appends into the group", () => {
        const { g, drag } = setup();
        const ts0 = g.getParent() as TabSetNode;
        // line 2 (y=40) holds t3 [0..60] and t4 [65..125]; (150,50) is empty space on line 2 after
        // the group's last tab. It must resolve to the group (append) rather than jump to the end of
        // line 1 (t6's line) or render as a full-strip-height bar.
        const di = target(ts0, drag, 150, 50);
        expect(di).toBeDefined();
        expect(di!.node).toBe(g);
        expect(di!.index).toBe(4);
        // single-line bar on line 2 (not a several-lines-high outline)
        expect(di!.rect.toJson()).toEqual({ x: 123, y: 40, width: 3, height: 30 });
    });

    it("inter-line gaps do not produce a full-strip-height append bar", () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "C")], { opened: false }), group("g2", "Reports", [tab("t2", "W")], { opened: false })] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 120));
        ts0.setTabStripRect(new Rect(0, 0, 400, 80));
        const g1 = model.getNodeById("g1") as TabGroupNode;
        const g2 = model.getNodeById("g2") as TabGroupNode;
        g1.setPillRect(new Rect(0, 0, 60, 30));
        g2.setPillRect(new Rect(70, 40, 60, 30));
        const di = target(ts0, model.getNodeById("t1") as TabNode, 300, 35);
        expect(di === undefined || (di!.rect as any).height < 40).toBe(true);
    });

    it("dragging a group to a wrapped group's line end reorders after the whole group (outline at its end)", () => {
        // g1 wraps onto two lines; the dragged group g3 is a child of the same tabset
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts0",
                        children: [
                            group("g1", "Design", [tab("t1", "C"), tab("t2", "T"), tab("t3", "I"), tab("t4", "F")]),
                            group("g2", "Reports", [tab("t5", "W")], { opened: false }),
                            group("g3", "Personal", [tab("t6", "S")], { opened: false }),
                        ],
                    },
                ],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 500, 120));
        ts0.setTabStripRect(new Rect(0, 0, 500, 80));
        const g1 = model.getNodeById("g1") as TabGroupNode;
        const g2 = model.getNodeById("g2") as TabGroupNode;
        const g3 = model.getNodeById("g3") as TabGroupNode;
        // line 1 (y=2..33): pill [0..67] t1 [80..171] t2 [180..311]; line 2 (y=42..73): t3 [0..83] t4 [100..183]
        g1.setPillRect(new Rect(0, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(80, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(180, 2, 131, 31));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(0, 42, 83, 31));
        (model.getNodeById("t4") as TabNode).setTabRect(new Rect(100, 42, 83, 31));
        g2.setPillRect(new Rect(400, 4, 67, 27));
        g3.setPillRect(new Rect(0, 80, 60, 30));
        const drag = g3 as any;
        // over the right half of line 1's last tab: "after the group" - the outline must sit at the
        // group's true end (t4's right edge on line 2), not at line 1's end where it reads as "into
        // the group"
        const atLine1End = target(ts0, drag, 300, 10);
        expect(atLine1End).toBeDefined();
        expect(atLine1End!.node).toBe(ts0);
        expect(atLine1End!.index).toBe(1);
        expect(atLine1End!.rect.toJson()).toEqual({ x: 181, y: 42, width: 3, height: 31 });
        // over the pill's left half: "before the group" - the outline sits at the pill
        const atLine2Start = target(ts0, drag, 40, 50);
        expect(atLine2Start).toBeDefined();
        expect(atLine2Start!.node).toBe(ts0);
        expect(atLine2Start!.index).toBe(0);
        expect(atLine2Start!.rect.toJson()).toEqual({ x: -2, y: 4, width: 3, height: 27 });
    });
});

describe("unwrapped group with offset pill and tabs on the same row", () => {
    // mirrors the real rendered geometry where the pill sits at a slightly different y than the
    // tab buttons even though they share one visual row (regression: line grouping must join by
    // overlapping bands, not an exact y match)
    const setup = () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type"), tab("t3", "Icons")])] }] },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 600, 100));
        ts0.setTabStripRect(new Rect(0, 0, 600, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(55, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(136, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(239, 2, 131, 31));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(382, 2, 83, 31));
        return { model, g };
    };

    const target = (ts0: TabSetNode, drag: TabNode, x: number, y: number) => ts0.findDropTargetNode(Model.MAIN_LAYOUT_ID, drag, x, y);

    it("treats the pill and tabs as a single line despite the y offset", () => {
        const { g } = setup();
        const lines = g.getLineRects();
        expect(lines).toHaveLength(1);
        // the single line spans the whole row (pill + tabs)
        expect(lines[0].toJson()).toEqual({ x: 55, y: 2, width: 410, height: 31 });
        expect(g.contains(230, 17)).toBe(true); // between Colors and Typography
    });

    it("drops in the gap between the group's tabs resolve to the correct index", () => {
        const { model, g } = setup();
        const ts0 = g.getParent() as TabSetNode;
        // between Colors (ends 227) and Typography (starts 239): before Typography (index 1)
        const between = target(ts0, model.getNodeById("t2") as TabNode, 230, 17);
        expect(between).toBeDefined();
        expect(between!.node).toBe(g);
        expect(between!.index).toBe(1);
        expect(between!.rect.toJson()).toEqual({ x: 237, y: 2, width: 3, height: 31 });
        // on the pill: add to group at the start (index 0)
        const onPill = target(ts0, model.getNodeById("t2") as TabNode, 100, 17);
        expect(onPill!.node).toBe(g);
        expect(onPill!.index).toBe(0);
    });
});

describe("stale end marker after switching to the underline tab group type", () => {
    // mirrors the real rendered splitpill geometry (offset pill y, end marker after the last tab):
    //   pill [55..122], t1 [136..227], t2 [239..370], t3 [382..465], marker [477..491], t6 [505..588]
    // switching tabGroupType to "underline" unmounts the end marker; its stored rect must stop
    // participating in the group's line geometry (regression: the ghost rect made drops near the
    // group's end resolve into the group or anchor outlines at the stale position)
    const setup = () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type"), tab("t3", "Icons")]), tab("t6", "Settings")] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 600, 100));
        ts0.setTabStripRect(new Rect(0, 0, 600, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(55, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(136, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(239, 2, 131, 31));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(382, 2, 83, 31));
        g.setEndMarkerRect(new Rect(477, 4, 14, 27));
        (model.getNodeById("t6") as TabNode).setTabRect(new Rect(505, 2, 83, 31));
        return { model, ts0, g };
    };

    const target = (ts0: TabSetNode, drag: TabNode, x: number, y: number) => ts0.findDropTargetNode(Model.MAIN_LAYOUT_ID, drag, x, y);

    it("in splitpill mode the end marker joins the group's line", () => {
        const { g } = setup();
        expect(g.getLineRects()).toHaveLength(1);
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 436, height: 31 });
        expect(g.contains(484, 17)).toBe(true); // on the marker
    });

    it("after switching to underline the ghost marker is excluded from the geometry", () => {
        const { model, g } = setup();
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 410, height: 31 });
        expect(g.contains(484, 17)).toBe(false); // the old marker position
        // the group's true end is now its last tab
        expect(g.getReorderBoundary(false).toJson()).toEqual({ x: 382, y: 2, width: 83, height: 31 });
        expect(g.getDropRegion().toJson()).toEqual({ x: 55, y: 2, width: 410, height: 31 });
    });

    it("after switching to underline a drop at the old marker position lands on the strip", () => {
        const { model, ts0 } = setup();
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        const drag = model.getNodeById("t6") as TabNode;
        // between the group and Settings: before Settings (strip slot 1), not a group drop
        const di = target(ts0, drag, 484, 17);
        expect(di).toBeDefined();
        expect(di!.node).toBe(ts0);
        expect(di!.index).toBe(1);
        expect(di!.rect.toJson()).toEqual({ x: 503, y: 2, width: 3, height: 31 });
    });

    it("after switching back to splitpill the marker participates again once measured", () => {
        const { model, g } = setup();
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "splitpill" }));
        // the stored rect is used again (in the real DOM it is remounted and remeasured)
        expect(g.contains(484, 17)).toBe(true);
    });
});

describe("pure underline tab group type (no prior splitpill measurement)", () => {
    const target = (ts0: TabSetNode, drag: TabNode, x: number, y: number) => ts0.findDropTargetNode(Model.MAIN_LAYOUT_ID, drag, x, y);

    it("resolves basic strip and group drops without any end marker rect", () => {
        const model = makeModel({
            global: { tabGroupType: "underline" },
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type"), tab("t3", "Icons")]), tab("t6", "Settings")] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 600, 100));
        ts0.setTabStripRect(new Rect(0, 0, 600, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(55, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(136, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(239, 2, 131, 31));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(382, 2, 83, 31));
        (model.getNodeById("t6") as TabNode).setTabRect(new Rect(505, 2, 83, 31));

        // on the pill -> add to the group at the start
        const onPill = target(ts0, model.getNodeById("t6") as TabNode, 100, 17);
        expect(onPill!.node).toBe(g);
        expect(onPill!.index).toBe(0);
        // between two of the group's tabs -> before Type (group index 1)
        const between = target(ts0, model.getNodeById("t6") as TabNode, 230, 17);
        expect(between!.node).toBe(g);
        expect(between!.index).toBe(1);
        // just past the group's last tab (no marker): before Settings
        const afterGroup = target(ts0, model.getNodeById("t6") as TabNode, 480, 17);
        expect(afterGroup!.node).toBe(ts0);
        expect(afterGroup!.index).toBe(1);
        expect(afterGroup!.rect.toJson()).toEqual({ x: 503, y: 2, width: 3, height: 31 });
    });

    it("the trailing space after a final group appends to the strip anchored at the group's end", () => {
        const model = makeModel({
            global: { tabGroupType: "underline" },
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Home"), group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type")])] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 100));
        ts0.setTabStripRect(new Rect(0, 0, 400, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 2, 60, 31));
        g.setPillRect(new Rect(75, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(156, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(259, 2, 131, 31));

        const di = target(ts0, model.getNodeById("t0") as TabNode, 395, 17);
        expect(di).toBeDefined();
        expect(di!.node).toBe(ts0);
        expect(di!.index).toBe(2); // append after Home + group
        // the outline anchors at the group's true end (its last tab), not the line edge
        expect(di!.rect.toJson()).toEqual({ x: 388, y: 2, width: 3, height: 31 });
    });
});
