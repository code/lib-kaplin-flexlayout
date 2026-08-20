// @vitest-environment node
import { Actions, DockLocation, IJsonModel, Model, TabNode, TabSetNode } from "../src";

const pinnedJson: IJsonModel = {
    global: {},
    borders: [{ type: "border", location: "top", children: [{ type: "tab", id: "bt0", name: "BorderTab" }] }],
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "PinOne", pinned: true },
                    { type: "tab", id: "t1", name: "PinTwo", pinned: true },
                    { type: "tab", id: "t2", name: "Three" },
                    { type: "tab", id: "t3", name: "Four" },
                ],
            },
            {
                type: "tabset",
                id: "ts1",
                children: [{ type: "tab", id: "t4", name: "Five" }],
            },
        ],
    },
};

let model: Model;

const names = (tabsetId: string) => (model.getNodeById(tabsetId) as TabSetNode).getChildren().map((c) => (c as TabNode).getName());
const selectedName = (tabsetId: string) => ((model.getNodeById(tabsetId) as TabSetNode).getSelectedNode() as TabNode | undefined)?.getName();

beforeEach(() => {
    model = Model.fromJson(pinnedJson);
});

describe("setTabPinned action", () => {
    it("pins a tab, moving it to the end of the pinned group", () => {
        model.doAction(Actions.setTabPinned("t3", true));
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "Four", "Three"]);
        expect((model.getNodeById("t3") as TabNode).isPinned()).equal(true);
    });

    it("unpins a tab, moving it to the start of the unpinned group", () => {
        model.doAction(Actions.setTabPinned("t0", false));
        expect(names("ts0")).toEqual(["PinTwo", "PinOne", "Three", "Four"]);
        expect((model.getNodeById("t0") as TabNode).isPinned()).equal(false);
    });

    it("keeps the pinned tab selected when it is the selected tab", () => {
        model.doAction(Actions.selectTab("t3"));
        expect(selectedName("ts0")).equal("Four");
        model.doAction(Actions.setTabPinned("t3", true));
        expect(selectedName("ts0")).equal("Four");
    });

    it("keeps another tab selected when a different tab is pinned", () => {
        model.doAction(Actions.selectTab("t2"));
        expect(selectedName("ts0")).equal("Three");
        model.doAction(Actions.setTabPinned("t3", true));
        expect(selectedName("ts0")).equal("Three");
    });

    it("is a no-op when the pinned state is unchanged", () => {
        model.doAction(Actions.setTabPinned("t0", true));
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "Three", "Four"]);
    });

    it("is a no-op for border tabs", () => {
        model.doAction(Actions.setTabPinned("bt0", true));
        expect((model.getNodeById("bt0") as TabNode).isPinned()).equal(false);
    });

    it("is a no-op when the tab has enablePin disabled", () => {
        model.doAction(Actions.updateNodeAttributes("t3", { enablePin: false }));
        model.doAction(Actions.setTabPinned("t3", true));
        expect((model.getNodeById("t3") as TabNode).isPinned()).equal(false);
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "Three", "Four"]);
    });

    it("still allows unpinning a tab that has enablePin disabled", () => {
        model.doAction(Actions.updateNodeAttributes("t0", { enablePin: false }));
        model.doAction(Actions.setTabPinned("t0", false));
        expect((model.getNodeById("t0") as TabNode).isPinned()).equal(false);
        expect(names("ts0")).toEqual(["PinTwo", "PinOne", "Three", "Four"]);
    });

    it("respects the global tabEnablePin setting", () => {
        const model2 = Model.fromJson({ ...pinnedJson, global: { tabEnablePin: false } });
        model2.doAction(Actions.setTabPinned("t3", true));
        expect((model2.getNodeById("t3") as TabNode).isPinned()).equal(false);
    });

    it("preserves selection on a grouped tab when a different tab is pinned", () => {
        // tabset with a group containing t1 and t2, plus an ungrouped t3
        const groupedJson: IJsonModel = {
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts0",
                        children: [
                            {
                                type: "tabgroup",
                                id: "g1",
                                name: "Design",
                                children: [
                                    { type: "tab", id: "t0", name: "Tab0" },
                                    { type: "tab", id: "t1", name: "Tab1" },
                                ],
                            },
                            { type: "tab", id: "t2", name: "Tab2" },
                        ],
                    },
                ],
            },
        };
        const m = Model.fromJson(groupedJson);
        const ts0 = m.getNodeById("ts0") as TabSetNode;
        // select t0 (inside group), visible flat index 0
        m.doAction(Actions.selectTab("t0"));
        expect(ts0.getSelectedNode()?.getId()).toBe("t0");
        // pin t2 (ungrouped) — moves it to the front, shifting flat indices
        m.doAction(Actions.setTabPinned("t2", true));
        // t0 should still be selected (flat index shifted from 0 to 1)
        expect(ts0.getSelectedNode()?.getId()).toBe("t0");
    });
});

describe("closability", () => {
    it("is not closeable while pinned, closeable after unpin", () => {
        const tab = model.getNodeById("t0") as TabNode;
        expect(tab.isCloseable()).equal(false);
        model.doAction(Actions.setTabPinned("t0", false));
        expect(tab.isCloseable()).equal(true);
    });

    it("can still be deleted programmatically while pinned", () => {
        model.doAction(Actions.deleteTab("t0"));
        expect(names("ts0")).toEqual(["PinTwo", "Three", "Four"]);
    });
});

describe("ordering clamps", () => {
    it("clamps a moved unpinned tab to after the pinned group", () => {
        model.doAction(Actions.moveNode("t3", "ts0", DockLocation.CENTER, 0));
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "Four", "Three"]);
    });

    it("clamps a moved pinned tab to within the pinned group", () => {
        model.doAction(Actions.moveNode("t0", "ts0", DockLocation.CENTER, 4));
        expect(names("ts0")).toEqual(["PinTwo", "PinOne", "Three", "Four"]);
        expect(names("ts0").length).equal(4);
    });

    it("allows reordering within the pinned group", () => {
        model.doAction(Actions.moveNode("t1", "ts0", DockLocation.CENTER, 0));
        expect(names("ts0")).toEqual(["PinTwo", "PinOne", "Three", "Four"]);
    });

    it("clamps a tab moved from another tabset to after the pinned group", () => {
        model.doAction(Actions.moveNode("t4", "ts0", DockLocation.CENTER, 0));
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "Five", "Three", "Four"]);
    });

    it("adds a new pinned tab at the end of the pinned group", () => {
        model.doAction(Actions.addTab({ type: "tab", id: "t5", name: "PinThree", pinned: true }, "ts0", DockLocation.CENTER, -1));
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "PinThree", "Three", "Four"]);
    });

    it("adds a new unpinned tab at the requested position after the pinned group", () => {
        model.doAction(Actions.addTab({ type: "tab", id: "t5", name: "New" }, "ts0", DockLocation.CENTER, 0));
        expect(names("ts0")).toEqual(["PinOne", "PinTwo", "New", "Three", "Four"]);
    });
});

describe("serialization", () => {
    it("round-trips the pinned attribute", () => {
        const json = model.toJson();
        const children = (json.layout.children![0] as any).children;
        expect(children[0].pinned).equal(true);
        expect(children[1].pinned).equal(true);
        expect(children[2].pinned).equal(undefined); // default false is not written
        const model2 = Model.fromJson(json);
        expect((model2.getNodeById("t0") as TabNode).isPinned()).equal(true);
        expect((model2.getNodeById("t2") as TabNode).isPinned()).equal(false);
    });
});
