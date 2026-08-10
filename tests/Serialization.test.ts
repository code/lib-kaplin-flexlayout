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
