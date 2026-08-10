// @vitest-environment node
import { Actions, DockLocation, IJsonModel, Model, Orientation, RowNode, TabNode, TabSetNode } from "../src";

const base: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "A" },
                    { type: "tab", id: "t1", name: "B" },
                ],
            },
        ],
    },
};

const nonMainLayouts = (model: Model) => Array.from(model.getLayouts().values()).filter((l) => !l.isMainLayout());

describe("dockFloatToLayout", () => {
    let model: Model;

    beforeEach(() => {
        model = Model.fromJson(base);
    });

    it("docks a float layout into the main layout by splitting a tabset", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model)[0];
        const movedTab = model.getNodeById("t1") as TabNode;
        expect(floatLayout.getType()).equal("float");

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), "ts0", DockLocation.RIGHT, -1));

        // the float layout is removed entirely
        expect(nonMainLayouts(model)).toHaveLength(0);

        // the tab is the same live instance, now owned by the main layout
        expect(model.getNodeById("t1")).toBe(movedTab);
        expect(movedTab.getLayoutId()).equal(Model.MAIN_LAYOUT_ID);

        // the float's tabset sits alongside ts0 in the main root row
        const rootChildren = model.getRootRow()!.getChildren();
        expect(rootChildren).toHaveLength(2);
        expect(rootChildren[0]).toBe(model.getNodeById("ts0"));
        expect((rootChildren[1] as TabSetNode).getChildren().map((c) => c.getId())).toEqual(["t1"]);
    });

    it("preserves a multi-tabset structure by creating a new row when needed", () => {
        const floatId = model.doAction(
            Actions.createSubLayout(
                {
                    type: "row",
                    children: [
                        { type: "tabset", id: "fts0", children: [{ type: "tab", id: "ft0", name: "X" }] },
                        { type: "tabset", id: "fts1", children: [{ type: "tab", id: "ft1", name: "Y" }] },
                    ],
                },
                { x: 0, y: 0, width: 200, height: 150 },
                "float",
            ),
        ) as string;

        model.doAction(Actions.dockFloatToLayout(floatId, "ts0", DockLocation.BOTTOM, -1));

        expect(nonMainLayouts(model)).toHaveLength(0);

        // a new (opposite orientation) row is created hosting ts0 and the float's original row,
        // which still holds both tabsets - the float's structure is preserved
        const rootChildren = model.getRootRow()!.getChildren();
        expect(rootChildren).toHaveLength(1);
        const outerRow = rootChildren[0] as RowNode;
        expect(outerRow.getChildren()).toHaveLength(2);
        expect(outerRow.getChildren()[0]).toBe(model.getNodeById("ts0"));
        const dockedRow = outerRow.getChildren()[1] as RowNode;
        expect(dockedRow.getType()).equal("row");
        expect(dockedRow.getChildren().map((c) => c.getId())).toEqual(["fts0", "fts1"]);
        expect((model.getNodeById("ft0") as TabNode).getLayoutId()).equal(Model.MAIN_LAYOUT_ID);
        expect((model.getNodeById("ft1") as TabNode).getLayoutId()).equal(Model.MAIN_LAYOUT_ID);
    });

    it("docks onto the main layout edge via the root row", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model)[0];
        const rootRow = model.getRootRow()!;

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), rootRow.getId(), DockLocation.RIGHT, -1));

        expect(nonMainLayouts(model)).toHaveLength(0);
        // the float's tabset is now the last child of the main root row
        const rootChildren = model.getRootRow()!.getChildren();
        expect((rootChildren[rootChildren.length - 1] as TabSetNode).getChildren().map((c) => c.getId())).toEqual(["t1"]);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(Model.MAIN_LAYOUT_ID);
    });

    it("docks a float layout into a tab sublayout", () => {
        const subId = model.doAction(
            Actions.createSubLayout({ type: "row", children: [{ type: "tabset", id: "sts0", children: [{ type: "tab", id: "st0" }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "tab"),
        ) as string;
        const subLayout = model.getLayouts().get(subId)!;
        const subTabset = subLayout.getRootRow()!.getChildren()[0] as TabSetNode;

        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model).find((l) => l.getType() === "float")!;

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), subTabset.getId(), DockLocation.RIGHT, -1));

        // the float is removed; the tab sublayout remains and now hosts the moved tab
        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(subId);
        const subRootChildren = subLayout.getRootRow()!.getChildren();
        expect(subRootChildren).toHaveLength(2);
        expect(subRootChildren[0]).toBe(subTabset);
        expect((subRootChildren[1] as TabSetNode).getChildren().map((c) => c.getId())).toEqual(["t1"]);
    });

    it("keeps the docked row's orientation when splitting a tabset in a perpendicular parent row", () => {
        const model2 = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "row",
                        children: [
                            { type: "tabset", id: "tsA", children: [{ type: "tab", id: "ta" }] },
                            { type: "tabset", id: "tsB", children: [{ type: "tab", id: "tb" }] },
                        ],
                    },
                ],
            },
        });
        const floatId = model2.doAction(
            Actions.createSubLayout(
                {
                    type: "row",
                    children: [
                        { type: "tabset", id: "fts0", children: [{ type: "tab", id: "ft0" }] },
                        { type: "tabset", id: "fts1", children: [{ type: "tab", id: "ft1" }] },
                    ],
                },
                { x: 0, y: 0, width: 200, height: 150 },
                "float",
            ),
        ) as string;
        const floatLayout = model2.getLayouts().get(floatId)!;

        model2.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), "tsA", DockLocation.LEFT, -1));

        expect(Array.from(model2.getLayouts().values()).filter((l) => !l.isMainLayout())).toHaveLength(0);
        // the float's two tabsets are flattened side-by-side with tsA in a new horizontal row
        const vrow = model2.getRootRow()!.getChildren()[0] as RowNode;
        expect(vrow.getChildren()).toHaveLength(2);
        const newRow = vrow.getChildren()[0] as RowNode;
        expect(newRow.getChildren().map((c) => c.getId())).toEqual(["fts0", "fts1", "tsA"]);
        // the flattened row stays horizontal, so the float's panels keep their orientation
        expect(newRow.getOrientation()).equal(Orientation.HORZ);
    });

    it("docks a float layout into a popout window layout", () => {
        model.doAction(Actions.popoutTab("t1", "window"));
        const windowLayout = nonMainLayouts(model)[0];
        const windowTabset = windowLayout.getRootRow()!.getChildren()[0] as TabSetNode;

        model.doAction(Actions.popoutTab("t0", "float"));
        const floatLayout = nonMainLayouts(model).find((l) => l.getType() === "float")!;

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), windowTabset.getId(), DockLocation.RIGHT, -1));

        // the float is removed; t0 now lives in the popout window layout
        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t0") as TabNode).getLayoutId()).equal(windowLayout.getLayoutId());
        const windowChildren = windowLayout.getRootRow()!.getChildren();
        expect(windowChildren).toHaveLength(2);
        expect(windowChildren[0]).toBe(windowTabset);
        expect((windowChildren[1] as TabSetNode).getChildren().map((c) => c.getId())).toEqual(["t0"]);
    });

    it("docks a float layout into another floating panel", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        model.doAction(Actions.popoutTab("t0", "float"));
        const floats = nonMainLayouts(model).filter((l) => l.getType() === "float");
        const floatA = floats.find((l) => (model.getNodeById("t1") as TabNode).getLayoutId() === l.getLayoutId())!;
        const floatB = floats.find((l) => (model.getNodeById("t0") as TabNode).getLayoutId() === l.getLayoutId())!;
        const floatBTabset = floatB.getRootRow()!.getChildren()[0] as TabSetNode;

        model.doAction(Actions.dockFloatToLayout(floatA.getLayoutId(), floatBTabset.getId(), DockLocation.RIGHT, -1));

        // floatA is removed; t1 now lives in floatB
        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(floatB.getLayoutId());
        const floatBChildren = floatB.getRootRow()!.getChildren();
        expect(floatBChildren).toHaveLength(2);
        expect(floatBChildren[0]).toBe(floatBTabset);
        expect((floatBChildren[1] as TabSetNode).getChildren().map((c) => c.getId())).toEqual(["t1"]);
    });

    it("rejects docking a float layout back into itself", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model)[0];
        const floatTabset = floatLayout.getRootRow()!.getChildren()[0] as TabSetNode;

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), floatTabset.getId(), DockLocation.RIGHT, -1));

        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(floatLayout.getLayoutId());
    });

    it("rejects docking a float containing a tab sublayout into another tab sublayout", () => {
        // a tab sublayout hosted inside the float
        const l1Id = model.doAction(
            Actions.createSubLayout({ type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "inner0" }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "tab"),
        ) as string;
        // the target tab sublayout to dock into
        const l2Id = model.doAction(
            Actions.createSubLayout({ type: "row", children: [{ type: "tabset", id: "l2ts", children: [{ type: "tab", id: "target0" }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "tab"),
        ) as string;
        const l2Layout = model.getLayouts().get(l2Id)!;
        const l2Tabset = l2Layout.getRootRow()!.getChildren()[0] as TabSetNode;
        // the float itself hosts a tab sublayout
        const floatId = model.doAction(
            Actions.createSubLayout({ type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "ft0", subLayoutId: l1Id }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "float"),
        ) as string;

        model.doAction(Actions.dockFloatToLayout(floatId, l2Tabset.getId(), DockLocation.RIGHT, -1));

        // the float is untouched; the target sublayout hosts nothing new
        expect(nonMainLayouts(model)).toHaveLength(3);
        expect((model.getNodeById("ft0") as TabNode).getLayoutId()).equal(floatId);
        expect(l2Layout.getRootRow()!.getChildren()).toHaveLength(1);
    });

    it("still docks a float containing a tab sublayout into the main layout", () => {
        const l1Id = model.doAction(Actions.createSubLayout({ type: "row", children: [{ type: "tabset", children: [{ type: "tab" }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "tab")) as string;
        const floatId = model.doAction(
            Actions.createSubLayout({ type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "ft0", subLayoutId: l1Id }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "float"),
        ) as string;

        model.doAction(Actions.dockFloatToLayout(floatId, "ts0", DockLocation.RIGHT, -1));

        // the float's tab (hosting the sublayout) moves into the main layout
        expect(nonMainLayouts(model)).toHaveLength(1); // only the hosted sublayout remains
        expect((model.getNodeById("ft0") as TabNode).getLayoutId()).equal(Model.MAIN_LAYOUT_ID);
    });

    it("serializes without the removed float layout", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model)[0];

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), "ts0", DockLocation.LEFT, -1));

        const json = model.toJson();
        expect(Object.keys(json.subLayouts ?? {})).toHaveLength(0);
        expect(JSON.stringify(json)).toContain("t1");
    });

    it("ignores a center drop location", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model)[0];

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), "ts0", DockLocation.CENTER, -1));

        // nothing moved: the float still exists and owns the tab
        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(floatLayout.getLayoutId());
        expect((model.getNodeById("ts0") as TabSetNode).getChildren().map((c) => c.getId())).toEqual(["t0"]);
    });

    it("ignores a target that is not a tabset in the main layout", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const floatLayout = nonMainLayouts(model)[0];
        // the float layout's own tabset is not in the main layout
        const floatTabset = floatLayout.getRootRow()!.getChildren()[0] as TabSetNode;

        model.doAction(Actions.dockFloatToLayout(floatLayout.getLayoutId(), floatTabset.getId(), DockLocation.RIGHT, -1));

        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(floatLayout.getLayoutId());
    });

    it("ignores a dock when the source layout is not a float", () => {
        model.doAction(Actions.popoutTab("t1", "window"));
        const windowLayout = nonMainLayouts(model)[0];

        model.doAction(Actions.dockFloatToLayout(windowLayout.getLayoutId(), "ts0", DockLocation.RIGHT, -1));

        expect(nonMainLayouts(model)).toHaveLength(1);
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(windowLayout.getLayoutId());
    });
});
