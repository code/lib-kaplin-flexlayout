// @vitest-environment node
import { Actions, TabGroupNode, IJsonModel, IJsonTabNode, Model, TabNode, TabSetNode, BorderNode, DockLocation } from "../src";
import { I18nLabelDefaults } from "../src/view/I18nLabel";

const tab = (id: string, name: string, extra: Partial<IJsonTabNode> = {}): IJsonTabNode => ({ type: "tab", id, name, ...extra });

const group = (id: string, name: string, children: IJsonTabNode[], extra: Record<string, any> = {}) => ({ type: "tabgroup", id, name, children, ...extra });

const makeModel = (json: IJsonModel) => Model.fromJson(json);

// tabset with a Design group (Colors, Typography, Icons), a collapsed Reports group (Weekly, Monthly)
// and an ungrouped Settings tab
const groupsJson = (): IJsonModel => ({
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                active: true,
                children: [
                    group("g1", "Design", [tab("t1", "Colors"), tab("t2", "Typography"), tab("t3", "Icons")], { color: "#aecbfa" }),
                    group("g2", "Reports", [tab("t4", "Weekly"), tab("t5", "Monthly")], { opened: false, color: "#f28b82" }),
                    tab("t6", "Settings"),
                ],
            },
        ],
    },
});

const borderJson = (): IJsonModel => ({
    global: {},
    borders: [{ type: "border", location: "left", children: [group("bg1", "BGroup", [tab("bt1", "B1"), tab("bt2", "B2")], { color: "#ccff90" }), tab("bt3", "B3")] }],
    layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "A")] }] },
});

describe("TabGroupNode serialization", () => {
    it("round-trips groups in tabsets and borders", () => {
        const model = makeModel(groupsJson());
        const json = model.toJson();
        const round = makeModel(JSON.parse(JSON.stringify(json)));

        const g1 = round.getNodeById("g1") as TabGroupNode;
        expect(g1.getType()).toBe("tabgroup");
        expect(g1.getName()).toBe("Design");
        expect(g1.getColor()).toBe("#aecbfa");
        expect(g1.isOpened()).toBe(true);
        expect(g1.getChildren()).toHaveLength(3);

        const g2 = round.getNodeById("g2") as TabGroupNode;
        expect(g2.isOpened()).toBe(false);

        // border groups round-trip too
        const bmodel = makeModel(borderJson());
        const bjson = bmodel.toJson();
        const bround = makeModel(JSON.parse(JSON.stringify(bjson)));
        const bg = bround
            .getBorderSet()
            .getBorders()
            .find((b) => b.getLocation().getName() === "left")!
            .getChildren()[0] as TabGroupNode;
        expect(bg.getName()).toBe("BGroup");
        expect(bg.getChildren()).toHaveLength(2);

        // children retain their parents
        expect((round.getNodeById("t1") as TabNode).getParent()).toBe(g1);
        expect((bround.getNodeById("bt1") as TabNode).getParent()).toBe(bg);
    });

    it("flat selected index is clamped when a group is closed on load", () => {
        const json = groupsJson();
        // select the 4th visible tab (Settings), then close Design so only Settings remains visible
        const model = makeModel(json);
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t6"]);
        ts0.setSelected(3);
        model.doAction(Actions.updateNodeAttributes("g1", { opened: false }));
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t6"]);
        expect(ts0.getSelected()).toBe(0);
        expect(ts0.getSelectedNode()?.getId()).toBe("t6");
    });

    it("collapsing a group moves selection to next visible tab", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        // first expand Reports so there are tabs after Design
        model.doAction(Actions.updateNodeAttributes("g2", { opened: true }));
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
        ts0.setSelected(0); // Colors (1st tab of Design)
        model.doAction(Actions.updateNodeAttributes("g1", { opened: false }));
        // Design collapsed: Weekly (first tab of Reports) is the next visible tab
        expect(ts0.getSelectedNode()?.getId()).toBe("t4");
    });

    it("collapsing a group at the end selects the previous visible tab", () => {
        // model with a trailing group, no tabs after it
        const model = makeModel({
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Tab0"), group("g1", "Group", [tab("t1", "Tab1"), tab("t2", "Tab2")])] }] },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t0", "t1", "t2"]);
        ts0.setSelected(2); // Tab2 (last tab of Group)
        model.doAction(Actions.updateNodeAttributes("g1", { opened: false }));
        // no tabs after Group → select Tab0 (the tab before it)
        expect(ts0.getSelectedNode()?.getId()).toBe("t0");
    });

    it("collapsing a group preserves selection on a tab outside the group", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t6"]);
        ts0.setSelected(3); // Settings (outside Design)
        model.doAction(Actions.updateNodeAttributes("g1", { opened: false }));
        // Settings was outside Design → still selected
        expect(ts0.getSelectedNode()?.getId()).toBe("t6");
        // re-expand: Settings should still be selected
        model.doAction(Actions.updateNodeAttributes("g1", { opened: true }));
        expect(ts0.getSelectedNode()?.getId()).toBe("t6");
    });

    it("collapsing a group preserves selection on a tab after the group", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        // expand Reports first
        model.doAction(Actions.updateNodeAttributes("g2", { opened: true }));
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
        ts0.setSelected(5); // Settings (after Design)
        model.doAction(Actions.updateNodeAttributes("g1", { opened: false }));
        // Design collapsed: Settings shifts from index 5 to index 2 but is still selected
        expect(ts0.getSelectedNode()?.getId()).toBe("t6");
        expect(ts0.getSelected()).toBe(2);
    });

    it("expanding a group into an empty selection activates its first tab", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(-1);
        model.doAction(Actions.updateNodeAttributes("g2", { opened: true }));
        // nothing was visible-selected, so Reports' own first tab becomes active
        expect(ts0.getSelectedNode()?.getId()).toBe("t4");
    });

    it("expanding a group keeps the current selection when one exists", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(0); // Colors (in Design)
        model.doAction(Actions.updateNodeAttributes("g2", { opened: true }));
        expect(ts0.getSelectedNode()?.getId()).toBe("t1");
    });

    it("expanding a border group does not auto-select (borders keep no-selection state)", () => {
        const model = makeModel(borderJson());
        const left = model
            .getBorderSet()
            .getBorders()
            .find((b) => b.getLocation().getName() === "left")!;
        model.doAction(Actions.updateNodeAttributes("bg1", { opened: false }));
        left.setSelected(-1);
        model.doAction(Actions.updateNodeAttributes("bg1", { opened: true }));
        expect(left.getSelected()).toBe(-1);
        expect(left.getSelectedNode()).toBeUndefined();
    });
});

describe("TabGroupNode attributes", () => {
    it("defaults name, opened and enableDrag", () => {
        const model = makeModel({ global: {}, layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [] }] } });
        model.setI18nDefaults(I18nLabelDefaults);
        const g = new TabGroupNode(model, {});
        expect(g.getName()).toBe("Group");
        expect(g.isOpened()).toBe(true);
        expect(g.isEnableDrag()).toBe(true);
        expect(g.getColor()).toBe("#9e9e9e");
    });

    it("updateNodeAttributes changes name, color and opened", () => {
        const model = makeModel(groupsJson());
        const g = model.getNodeById("g1") as TabGroupNode;
        model.doAction(Actions.updateNodeAttributes("g1", { name: "UX" }));
        model.doAction(Actions.updateNodeAttributes("g1", { color: "#123456" }));
        model.doAction(Actions.updateNodeAttributes("g1", { opened: false }));
        expect(g.getName()).toBe("UX");
        expect(g.getColor()).toBe("#123456");
        expect(g.isOpened()).toBe(false);
    });
});

describe("selection adjustment with groups (flat vs direct-child index)", () => {
    const tsWithGroupThenTabs = (): IJsonModel => ({
        global: {},
        layout: {
            type: "row",
            children: [
                {
                    type: "tabset",
                    id: "ts0",
                    children: [group("g1", "G1", [tab("t1", "T1"), tab("t2", "T2")]), tab("t3", "T3"), tab("t4", "T4")],
                },
            ],
        },
    });

    it("deleting a direct tab after a group keeps a tab before it selected", () => {
        const model = makeModel(tsWithGroupThenTabs());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(2); // t3
        model.doAction(Actions.deleteTab("t4"));
        // tabNodes were [t1,t2,t3,t4]; the removed t4 had child index 2 == flat index 2 but lies
        // after t3, so t3 must stay selected
        expect(ts0.getSelectedNode()?.getId()).toBe("t3");
        expect(ts0.getSelected()).toBe(2);
    });

    it("deleting the selected last tab after a group selects the new last tab", () => {
        const model = makeModel(tsWithGroupThenTabs());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(3); // t4
        model.doAction(Actions.deleteTab("t4"));
        expect(ts0.getSelectedNode()?.getId()).toBe("t3");
        expect(ts0.getSelected()).toBe(2);
    });

    it("removing a tab before the selected one shifts the flat selection down", () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts0",
                        children: [tab("t0", "T0"), group("g1", "G1", [tab("t1", "T1"), tab("t2", "T2")]), tab("t3", "T3")],
                    },
                ],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(3); // t3
        model.doAction(Actions.deleteTab("t0"));
        // tabNodes now [t1,t2,t3] so t3 is flat 2
        expect(ts0.getSelectedNode()?.getId()).toBe("t3");
        expect(ts0.getSelected()).toBe(2);
    });

    it("moving a direct tab after a group out of the tabset keeps the flat selection correct", () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts0",
                        children: [group("g1", "G1", [tab("t1", "T1"), tab("t2", "T2")]), tab("t3", "T3"), tab("t4", "T4")],
                    },
                    { type: "tabset", id: "ts1", children: [tab("t9", "T9")] },
                ],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(2); // t3
        model.doAction(Actions.moveNode("t4", "ts1", DockLocation.CENTER, -1));
        expect(ts0.getSelectedNode()?.getId()).toBe("t3");
        expect(ts0.getSelected()).toBe(2);
    });

    it("merging a tabset after a group does not shift a selection inside the group", () => {
        const model = makeModel({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts0",
                        children: [group("g1", "G1", [tab("t1", "T1"), tab("t2", "T2"), tab("t3", "T3")]), tab("t4", "T4"), tab("t5", "T5")],
                    },
                    { type: "tabset", id: "ts1", children: [tab("b1", "B1"), tab("b2", "B2")] },
                ],
            },
        });
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        ts0.setSelected(2); // t3 (inside g1)
        model.doAction(Actions.moveNode("ts1", "ts0", DockLocation.CENTER, 2));
        // ts1 merges at child index 2: children [g1,t4,b1,b2,t5]; t3 stays flat 2
        expect(ts0.getSelectedNode()?.getId()).toBe("t3");
        expect(ts0.getSelected()).toBe(2);
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t4", "b1", "b2", "t5"]);
    });
});

describe("group actions", () => {
    it("addTabToNewGroup creates a group containing the tab", () => {
        const model = makeModel(groupsJson());
        const groupId = model.doAction(Actions.addTabToNewGroup("t6", "New Group", "#123456"));
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        const g = model.getNodeById(groupId) as TabGroupNode;
        expect(g.getType()).toBe("tabgroup");
        expect(g.getName()).toBe("New Group");
        expect(g.getColor()).toBe("#123456");
        expect(g.getParent()).toBe(ts0);
        expect(g.getChildren().map((t) => (t as TabNode).getId())).toEqual(["t6"]);
        // the new group replaces the tab's position and the tab is selected
        expect(ts0.getChildren()[2]).toBe(g);
        expect(ts0.getSelectedNode()?.getId()).toBe("t6");
    });

    it("addTabToNewGroup is ignored for a pinned tab", () => {
        const model = makeModel(groupsJson());
        model.doAction(Actions.updateNodeAttributes("t6", { pinned: true }));
        const result = model.doAction(Actions.addTabToNewGroup("t6"));
        expect(result).toBeUndefined();
        expect(model.getNodeById("t6")?.getParent()?.getType()).toBe("tabset");
    });

    it("moveNode moves a tab into an existing group", () => {
        const model = makeModel(groupsJson());
        const g1 = model.getNodeById("g1") as TabGroupNode;
        model.doAction(Actions.moveNode("t6", "g1", DockLocation.CENTER, -1));
        expect((g1.getChildren() as TabNode[]).map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t6"]);
        // tab's parent is the group
        expect((model.getNodeById("t6") as TabNode).getParent()).toBe(g1);
    });

    it("moveNode moves a tab out of a group into the tabset", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        model.doAction(Actions.moveNode("t1", "ts0", DockLocation.CENTER, 3));
        // t1 (Colors) leaves the Design group and is appended after the existing children
        expect((g1Children(model) as TabNode[]).map((t) => t.getId())).toEqual(["t2", "t3"]);
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t2", "t3", "t6", "t1"]);
    });

    it("moveNode reorders a tab to a forward position within the same group", () => {
        const model = makeModel(groupsJson());
        const g1 = model.getNodeById("g1") as TabGroupNode;
        // move Colors (index 0) to before Icons (index 2): it must land between Typography and
        // Icons, not after Icons (removing it first shifts the index)
        model.doAction(Actions.moveNode("t1", "g1", DockLocation.CENTER, 2));
        expect((g1.getChildren() as TabNode[]).map((t) => t.getId())).toEqual(["t2", "t1", "t3"]);
    });

    it("moveNode reorders a tab to a backward position within the same group", () => {
        const model = makeModel(groupsJson());
        const g1 = model.getNodeById("g1") as TabGroupNode;
        // move Icons (index 2) to before Colors (index 0): it must land at the start
        model.doAction(Actions.moveNode("t3", "g1", DockLocation.CENTER, 0));
        expect((g1.getChildren() as TabNode[]).map((t) => t.getId())).toEqual(["t3", "t1", "t2"]);
    });

    it("ungroup moves all tabs out and deletes the group", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        model.doAction(Actions.ungroup("g2"));
        expect(model.getNodeById("g2")).toBeUndefined();
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
        // tabs that were in the group are now direct children of the tabset
        expect((model.getNodeById("t4") as TabNode).getParent()).toBe(ts0);
    });

    it("removeTabFromGroup moves a tab out of its group", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        model.doAction(Actions.removeTabFromGroup("t1"));
        expect((g1Children(model) as TabNode[]).map((t) => t.getId())).toEqual(["t2", "t3"]);
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t2", "t3", "t1", "t6"]);
    });

    it("removeTabFromGroup places the tab at the group's former position when the group is emptied", () => {
        const model = makeModel(groupsJson());
        const ts0 = model.getNodeById("ts0") as TabSetNode;
        // remove all three tabs from g1 (Design) — g1 is deleted when the last tab leaves
        model.doAction(Actions.removeTabFromGroup("t1"));
        model.doAction(Actions.removeTabFromGroup("t2"));
        model.doAction(Actions.removeTabFromGroup("t3"));
        expect(model.getNodeById("g1")).toBeUndefined();
        // t3 (the last removed) should be at the group's former index (before g2), not after it
        expect(ts0.getTabNodes().map((t) => t.getId())).toEqual(["t3", "t2", "t1", "t6"]);
    });

    it("removeTabFromGroup deletes the group when it becomes empty", () => {
        const model = makeModel(groupsJson());
        model.doAction(Actions.removeTabFromGroup("t1"));
        model.doAction(Actions.removeTabFromGroup("t2"));
        model.doAction(Actions.removeTabFromGroup("t3"));
        expect(model.getNodeById("g1")).toBeUndefined();
    });

    it("deleting the last tab in a group deletes the group", () => {
        const model = makeModel(groupsJson());
        model.doAction(Actions.deleteTab("t4"));
        model.doAction(Actions.deleteTab("t5"));
        expect(model.getNodeById("g2")).toBeUndefined();
        expect(model.getNodeById("t4")).toBeUndefined();
        expect(model.getNodeById("t5")).toBeUndefined();
    });

    it("grouping works in borders too", () => {
        const model = makeModel(borderJson());
        const border = model.getNodeById("border_left") as BorderNode;
        const bg = model.getNodeById("bg1") as TabGroupNode;
        model.doAction(Actions.moveNode("bt3", "bg1", DockLocation.CENTER, -1));
        expect((bg.getChildren() as TabNode[]).map((t) => t.getId())).toEqual(["bt1", "bt2", "bt3"]);
        expect(border.getTabNodes().map((t) => t.getId())).toEqual(["bt1", "bt2", "bt3"]);
    });
});

function g1Children(model: Model) {
    return (model.getNodeById("g1") as TabGroupNode).getChildren() as TabNode[];
}
