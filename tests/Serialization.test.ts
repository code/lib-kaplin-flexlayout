// @vitest-environment node
import { Actions, IJsonModel, Model, TabNode, TabSetNode } from "../src";

// serialization behaviour: toJson only writes attributes that differ from their default, and
// updateNodeAttributes with an explicit undefined removes an override.

describe("toJson default omission", () => {
    let model: Model;

    beforeEach(() => {
        model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "A" }] }],
            },
        });
    });

    const tabJson = () => (model.toJson().layout.children![0] as any).children[0];
    const tab = () => model.getNodeById("t0") as TabNode;

    it("does not write attributes at their default value", () => {
        // enableRenderOnDemand defaults to true and is not written until it changes
        expect(tabJson().enableRenderOnDemand).equal(undefined);
        expect(tab().isEnableRenderOnDemand()).equal(true);
    });

    it("writes non-default attributes and round-trips them", () => {
        model.doAction(Actions.updateNodeAttributes("t0", { enableRenderOnDemand: false }));
        expect(tabJson().enableRenderOnDemand).equal(false);
        expect(tab().isEnableRenderOnDemand()).equal(false);
    });

    it("updateNodeAttributes with undefined removes the override", () => {
        model.doAction(Actions.updateNodeAttributes("t0", { enableRenderOnDemand: false }));
        model.doAction(Actions.updateNodeAttributes("t0", { enableRenderOnDemand: undefined }));
        expect(tabJson().enableRenderOnDemand).equal(undefined);
        expect(tab().isEnableRenderOnDemand()).equal(true);
    });

    it("round-trips a non-default enableClose and tabset name", () => {
        model.doAction(Actions.updateNodeAttributes("t0", { enableClose: false }));
        model.doAction(Actions.updateNodeAttributes("ts0", { name: "Header" }));

        const json = model.toJson();
        const round = Model.fromJson(json);
        expect((round.getNodeById("t0") as TabNode).isEnableClose()).equal(false);
        expect((round.getNodeById("ts0") as TabSetNode).getName()).equal("Header");
    });

    it("round-trips global attribute changes", () => {
        model.doAction(Actions.updateModelAttributes({ borderSize: 10, tabSetEnableTabStrip: false }));
        const round = Model.fromJson(model.toJson());
        expect(round.getAttribute("borderSize")).equal(10);
        expect(round.getAttribute("tabSetEnableTabStrip")).equal(false);
    });

    it("round-trips the left border tab direction", () => {
        expect(model.getBorderLeftTabDirection()).equal("up"); // default
        model.doAction(Actions.updateModelAttributes({ borderLeftTabDirection: "down" }));
        const round = Model.fromJson(model.toJson());
        expect(round.getBorderLeftTabDirection()).equal("down");
    });

    it("defaults tabGroupType to splitpill and round-trips an override", () => {
        expect(model.getTabGroupType()).equal("splitpill");
        expect(model.toJson().global!.tabGroupType).equal(undefined); // default not serialized
        model.doAction(Actions.updateModelAttributes({ tabGroupType: "underline" }));
        const round = Model.fromJson(model.toJson());
        expect(round.getTabGroupType()).equal("underline");
    });

    it("preserves tab order and selection across a round trip", () => {
        model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts0",
                        selected: 1,
                        children: [
                            { type: "tab", name: "A" },
                            { type: "tab", name: "B" },
                        ],
                    },
                ],
            },
        });
        const round = Model.fromJson(model.toJson());
        const ts = round.getNodeById("ts0") as TabSetNode;
        expect(ts.getChildren().map((c) => (c as TabNode).getName())).toEqual(["A", "B"]);
        expect(ts.getSelected()).equal(1);
    });
});

describe("preserveIfExplicit", () => {
    it("keeps explicit false for tabEnableRename (now the default) across round-trip", () => {
        const model = Model.fromJson({
            global: { tabEnableRename: false },
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0" }] }] },
        });
        expect(model.toJson().global!.tabEnableRename).equal(false);
        const round = Model.fromJson(model.toJson());
        expect(round.getAttribute("tabEnableRename")).equal(false);
    });

    it("keeps explicit false for tabEnablePin across round-trip", () => {
        const model = Model.fromJson({
            global: { tabEnablePin: false },
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0" }] }] },
        });
        expect(model.toJson().global!.tabEnablePin).equal(false);
        const round = Model.fromJson(model.toJson());
        expect(round.getAttribute("tabEnablePin")).equal(false);
    });

    it("keeps explicit false for tabEnablePopoutIcon across round-trip", () => {
        const model = Model.fromJson({
            global: { tabEnablePopoutIcon: false },
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0" }] }] },
        });
        expect(model.toJson().global!.tabEnablePopoutIcon).equal(false);
        const round = Model.fromJson(model.toJson());
        expect(round.getAttribute("tabEnablePopoutIcon")).equal(false);
    });

    it("does not write attrs without preserveIfExplicit when at default", () => {
        const model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0" }] }] },
        });
        // enableRenderOnDemand defaults to true, no preserveIfExplicit
        expect(model.toJson().global!.tabEnableRenderOnDemand).equal(undefined);
    });

    it("updateModelAttributes with undefined clears preserveIfExplicit stickiness", () => {
        const model = Model.fromJson({
            global: { tabEnableRename: false },
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0" }] }] },
        });
        expect(model.toJson().global!.tabEnableRename).equal(false);
        model.doAction(Actions.updateModelAttributes({ tabEnableRename: undefined }));
        // after clearing, value reverts to default (false) and is no longer explicit
        expect(model.toJson().global!.tabEnableRename).equal(undefined);
    });

    it("internal mutations (weight, selected, rename, pinned) round-trip", () => {
        const model = Model.fromJson({
            global: { tabEnablePin: true },
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

        // mutate weight via splitter-like path (direct attribute set, not updateAttrs)
        const ts = model.getNodeById("ts0") as TabSetNode;
        (ts as any).setWeight(75);

        // rename
        model.doAction(Actions.renameTab("t0", "Renamed"));

        // pin
        model.doAction(Actions.setTabPinned("t0", true));

        // select second tab
        model.doAction(Actions.selectTab("t1"));

        const round = Model.fromJson(model.toJson());
        const tsRound = round.getNodeById("ts0") as TabSetNode;
        expect(tsRound.getWeight()).equal(75);
        expect(tsRound.getSelected()).equal(1);
        expect((round.getNodeById("t0") as TabNode).getName()).equal("Renamed");
        expect((round.getNodeById("t0") as TabNode).isPinned()).equal(true);
    });
});

describe("subLayouts serialization", () => {
    it("round-trips a tab sublayout and its host tab", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", children: [{ type: "tab", id: "tHost", name: "Host", subLayoutId: "L1" }] }],
            },
            subLayouts: {
                L1: { type: "tab", layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "tIn", name: "inner" }] }] } },
            },
        } as IJsonModel);

        const json = model.toJson();
        expect(json.subLayouts!["L1"]).toBeDefined();

        const round = Model.fromJson(json);
        expect(round.getLayouts().has("L1")).equal(true);
        expect(round.getNodeById("tIn")).toBeDefined();
        expect((round.getNodeById("tHost") as TabNode).getSubLayoutId()).equal("L1");
    });
});
