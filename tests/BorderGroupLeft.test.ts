// @vitest-environment node
import { Model, TabNode, BorderNode, TabGroupNode, Rect } from "../src";

const tab = (id: string, name: string) => ({ type: "tab", id, name }) as any;
const group = (id: string, name: string, children: any[], extra: any = {}) => ({ type: "tabgroup", id, name, children, ...extra }) as any;

function makeLeftModel() {
    return Model.fromJson({
        global: {},
        borders: [
            {
                type: "border",
                location: "left",
                children: [group("bg1", "BGroup", [tab("bt1", "B1"), tab("bt2", "B2")], { color: "#ccff90" }), tab("bt3", "B3")],
            },
        ],
        layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "A")] }] },
    });
}

function makeRightModel() {
    return Model.fromJson({
        global: {},
        borders: [
            {
                type: "border",
                location: "right",
                children: [group("bg1", "BGroup", [tab("bt1", "B1"), tab("bt2", "B2")], { color: "#ccff90" }), tab("bt3", "B3")],
            },
        ],
        layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "A")] }] },
    });
}

describe("left border group vertical drop", () => {
    it("drags a tab into left border group in correct positions (reversed visual order)", () => {
        const model = makeLeftModel();
        const border = model.getNodeById("border_left") as BorderNode;
        const group = model.getNodeById("bg1") as TabGroupNode;
        const bt1 = model.getNodeById("bt1") as TabNode;
        const bt2 = model.getNodeById("bt2") as TabNode;
        // left border reading up: visual top -> bottom: endMarker (0,0,100,10), bt2 (5,20,90,20), bt1 (5,40,90,20), pill (0,60,100,20)
        group.setPillRect(new Rect(0, 60, 100, 20));
        group.setEndMarkerRect(new Rect(0, 0, 100, 10));
        bt2.setTabRect(new Rect(5, 20, 90, 20)); // logical 1 at y20
        bt1.setTabRect(new Rect(5, 40, 90, 20)); // logical 0 at y40
        border.setTabHeaderRect(new Rect(0, 0, 100, 300));
        // drag a new tab from ts0 (t0) into the group
        const dragNode = model.getNodeById("t0") as TabNode;
        // before first visual tab (bt2) - should insert at logical append (2)
        let drop = group.canDrop(dragNode, 10, 15);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(2);
        // between bt2 and bt1 - should insert at logical 1 (between)
        drop = group.canDrop(dragNode, 10, 35);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(1);
        // after last visual tab before pill - should insert at logical 0
        drop = group.canDrop(dragNode, 10, 55);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(0);
        // on pill - should be 0
        drop = group.canDrop(dragNode, 10, 70);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(0);
    });

    it("right border group drop still works (pill top)", () => {
        const model = makeRightModel();
        const border = model.getNodeById("border_right") as BorderNode;
        const group = model.getNodeById("bg1") as TabGroupNode;
        const bt1 = model.getNodeById("bt1") as TabNode;
        const bt2 = model.getNodeById("bt2") as TabNode;
        // right border: pill top (0,0,100,20), bt1 (5,20,90,20), bt2 (5,40,90,20), endMarker (0,60,100,10)
        group.setPillRect(new Rect(0, 0, 100, 20));
        group.setEndMarkerRect(new Rect(0, 60, 100, 10));
        bt1.setTabRect(new Rect(5, 20, 90, 20));
        bt2.setTabRect(new Rect(5, 40, 90, 20));
        border.setTabHeaderRect(new Rect(0, 0, 100, 300));
        const dragNode = model.getNodeById("t0") as TabNode;
        // before bt1
        let drop = group.canDrop(dragNode, 10, 25);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(0);
        // between bt1 and bt2
        drop = group.canDrop(dragNode, 10, 35);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(1);
        // after bt2
        drop = group.canDrop(dragNode, 10, 55);
        expect(drop).toBeDefined();
        expect(drop!.index).toBe(2);
    });

    it("left border group reorder boundary is correct", () => {
        const model = makeLeftModel();
        const group = model.getNodeById("bg1") as TabGroupNode;
        group.setPillRect(new Rect(0, 60, 100, 20));
        group.setEndMarkerRect(new Rect(0, 0, 100, 10));
        // before should be endMarker (top), after should be pill (bottom)
        expect(group.getReorderBoundary(true).y).toBe(0);
        expect(group.getReorderBoundary(false).y).toBe(60);
        expect(group.getReorderBoundary(false).getBottom()).toBe(80);
    });
});
