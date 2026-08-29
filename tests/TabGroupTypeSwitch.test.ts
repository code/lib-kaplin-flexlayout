// @vitest-environment node
import { Actions, Model, TabGroupNode, TabNode, TabSetNode, Rect } from "../src";

const tab = (id: string, name: string) => ({ type: "tab", id, name });
const group = (id: string, name: string, children: any[]) => ({ type: "tabgroup", id, name, children });

describe("tabGroupType switch stale endMarkerRect (TabGroupNode.ts:105 hasEndMarker)", () => {
    const setupSplitPill = () => {
        const model = Model.fromJson({
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

    it("splitpill: end marker participates in geometry", () => {
        const { g } = setupSplitPill();
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 436, height: 31 });
        expect(g.contains(484, 17)).toBe(true);
        expect(g.getDropRegion().toJson()).toEqual({ x: 55, y: 2, width: 436, height: 31 });
    });

    it("underline: stale marker excluded from line geometry and containment", () => {
        const { model, g } = setupSplitPill();
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 410, height: 31 });
        expect(g.contains(484, 17)).toBe(false);
        expect(g.getDropRegion().toJson()).toEqual({ x: 55, y: 2, width: 410, height: 31 });
        expect(g.getReorderBoundary(false).toJson()).toEqual({ x: 382, y: 2, width: 83, height: 31 });
    });

    it("underline: drop at stale marker lands on strip, not group", () => {
        const { model, ts0 } = setupSplitPill();
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        const drag = model.getNodeById("t6") as TabNode;
        const di = target(ts0, drag, 484, 17);
        expect(di).toBeDefined();
        expect(di!.node).toBe(ts0);
        expect(di!.index).toBe(1);
        expect(di!.rect.toJson()).toEqual({ x: 503, y: 2, width: 3, height: 31 });
    });

    it("switch back to splitpill re-enables stale marker", () => {
        const { model, g } = setupSplitPill();
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "splitpill" }));
        expect(g.contains(484, 17)).toBe(true);
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 436, height: 31 });
    });

    it("pure underline without prior marker never includes it (no stale rect)", () => {
        const model = Model.fromJson({
            global: { tabGroupType: "underline" },
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Type")]), tab("t6", "Settings")] }],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setRect(new Rect(0, 0, 600, 100));
        ts0.setTabStripRect(new Rect(0, 0, 600, 40));
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(55, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(136, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(239, 2, 131, 31));
        // simulate a stale rect that was set before switch but should be ignored in underline
        g.setEndMarkerRect(new Rect(400, 4, 14, 27));
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 315, height: 31 });
        expect(g.contains(405, 17)).toBe(false);
        (model.getNodeById("t6") as TabNode).setTabRect(new Rect(505, 2, 83, 31));
        const di = target(ts0, model.getNodeById("t6") as TabNode, 405, 17);
        expect(di!.node).toBe(ts0);
    });
});
