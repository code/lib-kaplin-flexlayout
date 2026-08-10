// @vitest-environment node
import { Actions, DockLocation, DropInfo, IJsonModel, Model, Rect, RowNode, TabNode, TabSetNode } from "../src";
import { BorderNode } from "../src/model/BorderNode";

// unit tests for the drop-target coordinate logic (TabSetNode.canDrop, BorderNode.canDrop,
// RowNode.canDrop). The geometry (content rect, tab strip rect, tab rects) is normally populated
// by the layout measure pass, so the tests set it up directly.

describe("TabSetNode.canDrop", () => {
    const json: IJsonModel = {
        global: {},
        layout: {
            type: "row",
            children: [
                {
                    type: "tabset",
                    id: "ts0",
                    children: [
                        { type: "tab", id: "tA", name: "A" },
                        { type: "tab", id: "tB", name: "B" },
                    ],
                },
                {
                    type: "tabset",
                    id: "ts1",
                    children: [
                        { type: "tab", id: "tC", name: "C" },
                        { type: "tab", id: "tPin", name: "Pin", pinned: true },
                    ],
                },
                { type: "tabset", id: "ts2", enableDeleteWhenEmpty: false, children: [] },
            ],
        },
    };

    let model: Model;
    let ts0: TabSetNode;
    let ts1: TabSetNode;
    let ts2: TabSetNode;

    const setupGeometry = () => {
        // ts0: 200x100 with a 20px tab strip on top and two 60px tabs (inset so the guard
        // this.rect.x < tabRect.x holds, as in a real layout)
        ts0.setRect(new Rect(0, 0, 200, 100));
        ts0.setContentRect(new Rect(0, 20, 200, 80));
        ts0.setTabStripRect(new Rect(0, 0, 200, 20));
        (model.getNodeById("tA") as TabNode).setTabRect(new Rect(10, 0, 60, 20));
        (model.getNodeById("tB") as TabNode).setTabRect(new Rect(70, 0, 60, 20));
    };

    beforeEach(() => {
        model = Model.fromJson(json);
        ts0 = model.getNodeById("ts0") as TabSetNode;
        ts1 = model.getNodeById("ts1") as TabSetNode;
        ts2 = model.getNodeById("ts2") as TabSetNode;
        setupGeometry();
    });

    const dragTab = (id: string) => model.getNodeById(id) as TabNode;

    it("drops into the center of the content area", () => {
        const drop = ts0.canDrop(dragTab("tC"), 100, 60) as DropInfo;
        expect(drop.location).equal(DockLocation.CENTER);
        expect(drop.index).equal(-1);
    });

    it("resolves the dock region from the content point", () => {
        expect((ts0.canDrop(dragTab("tC"), 5, 60) as DropInfo).location).equal(DockLocation.LEFT);
        expect((ts0.canDrop(dragTab("tC"), 195, 60) as DropInfo).location).equal(DockLocation.RIGHT);
        expect((ts0.canDrop(dragTab("tC"), 100, 25) as DropInfo).location).equal(DockLocation.TOP);
        expect((ts0.canDrop(dragTab("tC"), 100, 90) as DropInfo).location).equal(DockLocation.BOTTOM);
    });

    it("drops into the tab strip at the computed tab index", () => {
        expect((ts0.canDrop(dragTab("tC"), 20, 10) as DropInfo).index).equal(0);
        expect((ts0.canDrop(dragTab("tC"), 40, 10) as DropInfo).index).equal(1);
        // past the last tab appends
        expect((ts0.canDrop(dragTab("tC"), 150, 10) as DropInfo).index).equal(2);
    });

    it("accepts a drop into an empty tabset at index 0", () => {
        ts2.setRect(new Rect(0, 0, 200, 100));
        ts2.setContentRect(new Rect(0, 20, 200, 80));
        ts2.setTabStripRect(new Rect(0, 0, 200, 20));
        const drop = ts2.canDrop(dragTab("tC"), 20, 10) as DropInfo;
        expect(drop.location).equal(DockLocation.CENTER);
        expect(drop.index).equal(0);
    });

    it("docking a tabset into itself keeps its tab strip", () => {
        const drop = ts0.canDrop(ts0, 100, 60) as DropInfo;
        expect(drop.location).equal(DockLocation.CENTER);
        expect(drop.node).equal(ts0);
    });

    it("a pinned tab cannot dock into another tabset but can reorder in its own", () => {
        expect(ts0.canDrop(dragTab("tPin"), 100, 60)).equal(undefined);

        // within its own tabset it is allowed to reorder in the tab strip
        ts1.setRect(new Rect(300, 0, 200, 100));
        ts1.setContentRect(new Rect(300, 20, 200, 80));
        ts1.setTabStripRect(new Rect(300, 0, 200, 20));
        (model.getNodeById("tC") as TabNode).setTabRect(new Rect(310, 0, 60, 20));
        (model.getNodeById("tPin") as TabNode).setTabRect(new Rect(370, 0, 60, 20));
        const drop = ts1.canDrop(dragTab("tPin"), 320, 10) as DropInfo;
        expect(drop.location).equal(DockLocation.CENTER);
    });

    it("a tabset that disables drops is offered split regions instead of a dead center", () => {
        model.doAction(Actions.updateNodeAttributes("ts0", { enableDrop: false }));
        expect((ts0.canDrop(dragTab("tC"), 100, 60) as DropInfo).location).equal(DockLocation.BOTTOM);
        expect((ts0.canDrop(dragTab("tC"), 5, 60) as DropInfo).location).equal(DockLocation.LEFT);
        expect((ts0.canDrop(dragTab("tC"), 195, 60) as DropInfo).location).equal(DockLocation.RIGHT);
    });

    it("excludes the center region when the drag cannot merge, extending the edges to the center", () => {
        expect((ts0.canDrop(dragTab("tC"), 100, 60, true) as DropInfo).location).not.equal(DockLocation.CENTER);
        expect((ts0.canDrop(dragTab("tC"), 100, 60, true) as DropInfo).location).equal(DockLocation.BOTTOM);
        expect((ts0.canDrop(dragTab("tC"), 100, 25, true) as DropInfo).location).equal(DockLocation.TOP);
        expect((ts0.canDrop(dragTab("tC"), 5, 60, true) as DropInfo).location).equal(DockLocation.LEFT);
        expect((ts0.canDrop(dragTab("tC"), 195, 60, true) as DropInfo).location).equal(DockLocation.RIGHT);
    });

    it("a tabset that cannot be split is entirely a center drop", () => {
        model.doAction(Actions.updateNodeAttributes("ts0", { enableDivide: false }));
        expect((ts0.canDrop(dragTab("tC"), 5, 60) as DropInfo).location).equal(DockLocation.CENTER);
        expect((ts0.canDrop(dragTab("tC"), 100, 60) as DropInfo).location).equal(DockLocation.CENTER);
        expect((ts0.canDrop(dragTab("tC"), 195, 60) as DropInfo).location).equal(DockLocation.CENTER);
    });

    it("a tabset that can neither merge (center excluded) nor split rejects the content", () => {
        model.doAction(Actions.updateNodeAttributes("ts0", { enableDivide: false }));
        expect(ts0.canDrop(dragTab("tC"), 100, 60, true)).equal(undefined);
        expect(ts0.canDrop(dragTab("tC"), 5, 60, true)).equal(undefined);
    });

    it("a tabset that cannot merge is offered split regions instead of a dead center", () => {
        // ts1 holds a pinned tab, so it can never merge into another tabset's center
        expect(ts0.canDrop(ts1, 100, 60)).equal(undefined); // dead without excludeCenter
        // with excludeCenter (as the drag manager sets for such a drag) the center resolves to a split
        expect((ts0.canDrop(ts1, 100, 60, true) as DropInfo).location).not.equal(DockLocation.CENTER);
        expect((ts0.canDrop(ts1, 5, 60, true) as DropInfo).location).equal(DockLocation.LEFT);
        expect((ts0.canDrop(ts1, 195, 60, true) as DropInfo).location).equal(DockLocation.RIGHT);
    });

    it("a tabset that is not closable also gets split regions instead of a dead center", () => {
        const model2 = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    { type: "tabset", id: "tsA", children: [{ type: "tab", id: "a0" }] },
                    { type: "tabset", id: "tsB", children: [{ type: "tab", id: "b0" }] },
                ],
            },
        });
        const tsA = model2.getNodeById("tsA") as TabSetNode;
        const tsB = model2.getNodeById("tsB") as TabSetNode;
        tsA.setRect(new Rect(0, 0, 200, 100));
        tsA.setContentRect(new Rect(0, 20, 200, 80));
        tsA.setTabStripRect(new Rect(0, 0, 200, 20));

        // a closable tabset can merge into the center
        expect((tsA.canDrop(tsB, 100, 60) as DropInfo).location).equal(DockLocation.CENTER);
        // once it cannot be closed it can no longer merge, so the drag manager passes excludeCenter
        model2.doAction(Actions.updateNodeAttributes("tsB", { enableClose: false }));
        expect(tsA.canDrop(tsB, 100, 60)).equal(undefined);
        expect((tsA.canDrop(tsB, 100, 60, true) as DropInfo).location).not.equal(DockLocation.CENTER);
    });
});

describe("BorderNode.canDrop", () => {
    const json: IJsonModel = {
        global: {},
        borders: [
            {
                type: "border",
                location: "top",
                children: [
                    { type: "tab", id: "c1", name: "c1" },
                    { type: "tab", id: "c2", name: "c2" },
                ],
            },
            { type: "border", location: "bottom", children: [] },
        ],
        layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "tC", name: "C" }] }] },
    };

    let model: Model;
    let top: BorderNode;
    let bottom: BorderNode;

    beforeEach(() => {
        model = Model.fromJson(json);
        top = model.getNodeById("border_top") as BorderNode;
        bottom = model.getNodeById("border_bottom") as BorderNode;

        // a horizontal tab header (top border) with two 60px tabs
        top.setTabHeaderRect(new Rect(0, 0, 200, 30));
        (model.getNodeById("c1") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        (model.getNodeById("c2") as TabNode).setTabRect(new Rect(60, 0, 60, 30));
    });

    const dragTab = () => model.getNodeById("tC") as TabNode;

    it("drops into the tab header at the computed tab index", () => {
        expect((top.canDrop(dragTab(), 20, 5) as DropInfo).index).equal(0);
        expect((top.canDrop(dragTab(), 40, 5) as DropInfo).index).equal(1);
        expect((top.canDrop(dragTab(), 150, 5) as DropInfo).index).equal(2);
    });

    it("an empty border accepts a drop at index 0", () => {
        bottom.setTabHeaderRect(new Rect(0, 0, 200, 30));
        expect((bottom.canDrop(dragTab(), 20, 5) as DropInfo).index).equal(0);
    });

    it("rejects non-tab drag nodes", () => {
        expect(top.canDrop(model.getNodeById("ts0") as unknown as TabNode, 20, 5)).equal(undefined);
    });
});

describe("RowNode.canDrop", () => {
    let model: Model;
    let root: RowNode;

    beforeEach(() => {
        model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "A" }] }],
            },
        });
        root = model.getRootRow()!;
        root.setRect(new Rect(0, 0, 400, 300));
    });

    const dragTab = () => model.getNodeById("t0") as TabNode;

    it("resolves edge dock regions on the root row", () => {
        expect((root.canDrop(dragTab(), 5, 150) as DropInfo).location).equal(DockLocation.LEFT);
        expect((root.canDrop(dragTab(), 395, 150) as DropInfo).location).equal(DockLocation.RIGHT);
        expect((root.canDrop(dragTab(), 200, 5) as DropInfo).location).equal(DockLocation.TOP);
        expect((root.canDrop(dragTab(), 200, 295) as DropInfo).location).equal(DockLocation.BOTTOM);
    });

    it("returns no drop region away from the edges", () => {
        expect(root.canDrop(dragTab(), 200, 150)).equal(undefined);
    });
});
