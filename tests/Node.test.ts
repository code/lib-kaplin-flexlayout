// @vitest-environment node
import { Actions, DockLocation, Model, RowNode, TabNode, TabSetNode } from "../src";

describe("Node traversal", () => {
    let model: Model;

    beforeEach(() => {
        model = Model.fromJson({
            global: {},
            borders: [{ type: "border", location: "left", children: [{ type: "tab", id: "b0", name: "B0" }] }],
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
        });
    });

    it("visitNodes traverses borders then the main layout tree", () => {
        const seen: string[] = [];
        model.visitNodes((node) => seen.push(node.getType() + ":" + node.getId()));

        // borders come first, then the root row subtree
        expect(seen[0]).equal("border:border_left");
        expect(seen[1]).equal("tab:b0");
        expect(seen.slice(2)).toEqual(["row:" + model.getRootRow()!.getId(), "tabset:ts0", "tab:t0", "tab:t1"]);
    });

    it("forEachNode reports nesting levels", () => {
        const levels: Record<string, number> = {};
        model.getRootRow()!.forEachNode((node, level) => (levels[node.getType()] = level), 0);
        expect(levels["row"]).equal(0);
        expect(levels["tabset"]).equal(1);
        expect(levels["tab"]).equal(2);
    });

    it("getPath reflects the tree structure", () => {
        const root = model.getRootRow()!;
        root.setPaths(""); // paths are populated by the view layer's layout pass
        expect(root.getPath()).equal("");
        expect((root.getChildren()[0] as TabSetNode).getPath()).equal("/ts0");
        expect((model.getNodeById("t0") as TabNode).getPath()).equal("/ts0/t0");
        expect((model.getNodeById("t1") as TabNode).getPath()).equal("/ts0/t1");
    });

    it("setPaths sets the root row's own path (regression: sub-layout splitter paths)", () => {
        // a sub-layout's root row must carry its layout's path prefix (e.g. /sublayout1), otherwise
        // its splitter renders as /s0 and collides with the main layout's splitter path
        const subModel = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "A" }] }] },
            subLayouts: {
                float1: {
                    type: "float",
                    layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "F1" }] }] },
                    rect: { x: 10, y: 10, width: 300, height: 200 },
                },
            },
        });
        const subRoot = subModel.getRootRow("float1")!;
        subRoot.setPaths("/sublayout1");
        expect(subRoot.getPath()).equal("/sublayout1");
        expect((subRoot.getChildren()[0] as TabSetNode).getPath()).equal("/sublayout1/ts0");
    });

    it("paths are recomputed after a move", () => {
        model.doAction(Actions.moveNode("t1", "ts0", DockLocation.CENTER, 0));
        model.getRootRow()!.setPaths("");
        expect((model.getNodeById("t1") as TabNode).getPath()).equal("/ts0/t0");
        expect((model.getNodeById("t0") as TabNode).getPath()).equal("/ts0/t1");
    });

    it("isCloseable aggregates across children", () => {
        expect((model.getNodeById("ts0") as TabSetNode).isCloseable()).equal(true);
        model.doAction(Actions.updateNodeAttributes("t0", { enableClose: false }));
        expect((model.getNodeById("ts0") as TabSetNode).isCloseable()).equal(false);
    });
});

describe("Node events", () => {
    let model: Model;

    beforeEach(() => {
        model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "A" }] }] },
        });
    });

    it("listeners fire and can be removed", () => {
        const tab = model.getNodeById("t0") as TabNode;
        let closes = 0;
        const handler = () => closes++;
        tab.setEventListener("close", handler);
        model.doAction(Actions.deleteTab("t0"));
        expect(closes).equal(1);

        // re-add and remove the listener: the close event no longer fires
        tab.setEventListener("close", handler);
        tab.removeEventListener("close");
        tab.fireEvent("close", {});
        expect(closes).equal(1);
    });
});

describe("isAllowedInWindow", () => {
    it("respects enablePopout and the content of a hosted sublayout", () => {
        const model = Model.fromJson({
            global: { tabEnablePopout: true },
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        children: [
                            { type: "tab", id: "tHost", name: "Host", subLayoutId: "L1" },
                            { type: "tab", id: "tOk", name: "Ok" },
                            { type: "tab", id: "tNo", name: "No", enablePopout: false },
                        ],
                    },
                ],
            },
            subLayouts: {
                L1: { type: "tab", layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "inner", enablePopout: false }] }] } },
            },
        });

        expect((model.getNodeById("tOk") as TabNode).isAllowedInWindow()).equal(true);
        expect((model.getNodeById("tNo") as TabNode).isAllowedInWindow()).equal(false);
        // the host tab is only allowed if its sublayout content is allowed too
        expect((model.getNodeById("tHost") as TabNode).isAllowedInWindow()).equal(false);
    });
});

describe("calcMinMaxSize", () => {
    it("aggregates tab min/max sizes up the tree", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "A",
                        children: [{ type: "tab", name: "x", minWidth: 100, minHeight: 50, maxWidth: 300, maxHeight: 200 }],
                    },
                    { type: "tabset", id: "B", children: [{ type: "tab", name: "y" }] },
                ],
            },
        });

        const root = model.getRootRow() as RowNode;
        root.calcMinMaxSize();

        const a = model.getNodeById("A") as TabSetNode;
        expect(a.getMinWidth()).equal(100);
        expect(a.getMinHeight()).equal(50);
        expect(a.getMaxWidth()).equal(300);
        expect(a.getMaxHeight()).equal(200);

        // the row's bounds encompass its children's bounds
        expect(root.getMinWidth()).toBeGreaterThanOrEqual(a.getMinWidth());
        expect(root.getMaxWidth()).toBeGreaterThanOrEqual(a.getMaxWidth());
        expect(root.getMaxWidth()).toBeGreaterThanOrEqual(root.getMinWidth());
    });
});
