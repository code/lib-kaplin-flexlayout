// @vitest-environment node
import { Model, TabGroupNode, TabNode, TabSetNode, Rect } from "../src";

const tab = (id: string, name: string) => ({ type: "tab", id, name });
const group = (id: string, name: string, children: any[]) => ({ type: "tabgroup", id, name, children });

describe("StripDrop.findStripDrop wrap-line trailing space (StripDrop.ts:45)", () => {
    const target = (ts0: TabSetNode, drag: TabNode, x: number, y: number) => ts0.findDropTargetNode(Model.MAIN_LAYOUT_ID, drag, x, y);

    it("trailing space after last tab on wrapped line appends on correct line (single-line bar)", () => {
        const model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "A"), tab("t1", "B"), tab("t2", "C"), tab("t3", "D")] }] },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 300, 140));
        ts0.setTabStripRect(new Rect(0, 0, 300, 110));
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(70, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(70, 40, 60, 30));
        const di = target(ts0, model.getNodeById("t3") as TabNode, 150, 50);
        expect(di).toBeDefined();
        expect(di!.index).toBe(4);
        // single-line bar on line 2, not full strip height
        expect(di!.rect.toJson()).toEqual({ x: 128, y: 40, width: 3, height: 30 });
    });

    it("inter-line gap returns no strip drop (gap between wrapped lines)", () => {
        const model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "A"), tab("t1", "B"), tab("t2", "C"), tab("t3", "D")] }] },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 300, 140));
        ts0.setTabStripRect(new Rect(0, 0, 300, 110));
        (model.getNodeById("t0") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(70, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(70, 40, 60, 30));
        // y=35 is between line1 (0..30) and line2 (40..70)
        const di = target(ts0, model.getNodeById("t0") as TabNode, 120, 35);
        expect(di).toBeUndefined();
    });

    it("trailing space after a group that ends a wrapped line defers into group when group is not last child", () => {
        const model = Model.fromJson({
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
        // line1 has pill alone; trailing space on its line after pill should defer to group
        const drag = model.getNodeById("t1") as TabNode;
        const afterPill = target(ts0, drag, 200, 10);
        expect(afterPill).toBeDefined();
        expect(afterPill!.node).toBe(g);
        expect(afterPill!.index).toBe(0);
    });

    it("trailing space after group's last tab appends into group when space is on same line", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "C"), tab("t2", "T"), tab("t3", "I"), tab("t4", "F")]), tab("t6", "Settings")] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 400, 120));
        ts0.setTabStripRect(new Rect(0, 0, 400, 80));
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(100, 0, 60, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(165, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(230, 0, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t4") as TabNode).setTabRect(new Rect(65, 40, 60, 30));
        (model.getNodeById("t6") as TabNode).setTabRect(new Rect(300, 0, 60, 30));
        const drag = model.getNodeById("t6") as TabNode;
        // empty space on line2 after t4 (group's last tab) — should append into group (index 4) with single-line bar
        const di = target(ts0, drag, 150, 50);
        expect(di).toBeDefined();
        expect(di!.node).toBe(g);
        expect(di!.index).toBe(4);
        expect(di!.rect.toJson()).toEqual({ x: 123, y: 40, width: 3, height: 30 });
    });
});
