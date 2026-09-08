// @vitest-environment jsdom
import { Actions, BorderNode, GroupAction, I18nLabel, IJsonModel, IJsonTabNode, TabNode, TabSetNode } from "../../src";
import { IPopupMenuItem } from "../../src/view/PopupMenu";
import { getNodeContextActions, getNodeContextMenuItem, getNodeContextMenuItems, ContextMenuBuilder } from "../../src/view/ContextMenuBuilder";
import { createController, makeModel } from "./testUtils";

const tab = (id: string, name: string, extra: Partial<IJsonTabNode> = {}): IJsonTabNode => ({ type: "tab", id, name, ...extra });

const twoTabsets = (tabs: IJsonTabNode[]): IJsonModel => ({
    global: { tabEnablePopout: true, tabEnableFloat: true, tabEnablePin: true, tabEnableRename: true },
    layout: {
        type: "row",
        children: [
            { type: "tabset", id: "ts0", children: tabs },
            { type: "tabset", id: "ts1", children: [tab("t1", "Beta")] },
        ],
    },
});

const borderJson: IJsonModel = {
    global: { tabEnablePopout: true, tabEnableFloat: true, tabEnablePin: true, tabEnableRename: true },
    borders: [{ type: "border", location: "left", children: [tab("bt0", "Border")] }],
    layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] },
};

const itemsOf = (items: ReturnType<typeof getNodeContextMenuItems>) => items.map((item) => item as IPopupMenuItem);

const select = (item: IPopupMenuItem) => item.onSelect?.({ key: item.key } as IPopupMenuItem);

describe("getNodeContextActions", () => {
    it("returns all available actions for a tab in a tabset", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).toEqual(["pin", "float", "popout", "rename", "close"]);
    });

    it("excludes actions that are not allowed on the node", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableRename: false, enableClose: false, enablePopout: false, enableFloat: false })]));
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).toEqual(["pin"]);
    });

    it("does not offer pin or rename for border tabs (popout/float while the border tab is not selected)", () => {
        const model = makeModel(borderJson);
        const node = model.getNodeById("bt0") as TabNode;
        expect(getNodeContextActions(node)).toEqual(["close"]);
        // once the border tab is selected its popout/float become available (rename/pin never do)
        model.doAction(Actions.selectTab("bt0"));
        expect(getNodeContextActions(node)).toEqual(["float", "popout", "close"]);
    });

    it("offers popout and float for a tabset tab that is not active", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha"), tab("t2", "Gamma")]));
        const active = model.getNodeById("t0") as TabNode;
        const inactive = model.getNodeById("t2") as TabNode;
        expect(active.isSelected()).toBe(true);
        expect(inactive.isSelected()).toBe(false);
        expect(getNodeContextActions(inactive)).toEqual(["pin", "float", "popout", "rename", "close"]);
    });

    it("offers maximize only when the tabset can be maximized", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        expect(getNodeContextActions(model.getNodeById("ts0") as TabSetNode)).toEqual(["maximize", "float", "popout", "close"]);

        const single = makeModel({ global: {}, layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] } });
        expect(getNodeContextActions(single.getNodeById("ts0") as TabSetNode)).toEqual(["close"]);
    });

    it("omits popout and float for a tabset whose tabs are not popoutable", () => {
        const model = makeModel({ global: {}, layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] } });
        const node = model.getNodeById("ts0") as TabSetNode;
        expect(getNodeContextActions(node)).not.toContain("popout");
        expect(getNodeContextActions(node)).not.toContain("float");
    });

    it("offers the border type action for borders", () => {
        const model = makeModel(borderJson);
        const border = model.getNodeById("border_left") as BorderNode;
        expect(getNodeContextActions(border)).toEqual(["borderType"]);
    });
});

describe("getNodeContextMenuItems", () => {
    it("builds a menu entry per action with labels and disabled states", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const items = itemsOf(getNodeContextMenuItems(model.getNodeById("t0") as TabNode));
        expect(items.map((i) => i.key)).toEqual(["pin", "float", "popout", "rename", "close"]);
        expect(items.map((i) => i.disabled)).toEqual([false, false, false, false, false]);
        expect(items.map((i) => i.label)).toEqual(["Pin", "Float", "Popout", "Rename", "Close"]);
    });

    it("shows not-allowed actions as disabled items when includeDisabled is true", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableRename: false, enableClose: false, enablePopout: false, enableFloat: false })]));
        const items = itemsOf(getNodeContextMenuItems(model.getNodeById("t0") as TabNode, { includeDisabled: true }));
        expect(items.map((i) => i.key)).toEqual(["pin", "float", "popout", "rename", "close"]);
        expect(items.map((i) => i.disabled)).toEqual([false, true, true, true, true]);
    });

    it("disables rename and pin for border tabs (popout/float while the border tab is not selected)", () => {
        const model = makeModel(borderJson);
        const items = itemsOf(getNodeContextMenuItems(model.getNodeById("bt0") as TabNode, { includeDisabled: true }));
        expect(items.map((i) => i.key)).toEqual(["pin", "float", "popout", "rename", "close"]);
        expect(items.map((i) => i.disabled)).toEqual([true, true, true, true, false]);
    });

    it("keeps popout and float enabled for a tabset tab that is not active", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha"), tab("t2", "Gamma")]));
        const items = itemsOf(getNodeContextMenuItems(model.getNodeById("t2") as TabNode, { includeDisabled: true }));
        expect(items.map((i) => i.key)).toEqual(["pin", "float", "popout", "rename", "close"]);
        expect(items.map((i) => i.disabled)).toEqual([false, false, false, false, false]);
    });

    it("omits disabled items by default", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableRename: false, enableClose: false })]));
        const items = itemsOf(getNodeContextMenuItems(model.getNodeById("t0") as TabNode));
        expect(items.map((i) => i.key)).toEqual(["pin", "float", "popout"]);
    });

    it("toggles the pin label with the pinned state", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        const label = () => itemsOf(getNodeContextMenuItems(node)).find((i) => i.key === "pin")!.label;
        expect(label()).toBe("Pin");
        model.doAction(Actions.setTabPinned("t0", true));
        expect(label()).toBe("Unpin");
    });

    it("dispatches the right actions via onAction", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const onAction = vi.fn();
        const items = itemsOf(getNodeContextMenuItems(model.getNodeById("t0") as TabNode, { onAction }));

        select(items.find((i) => i.key === "pin")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.SET_TAB_PINNED }));

        select(items.find((i) => i.key === "popout")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.POPOUT_TAB, data: expect.objectContaining({ type: "window" }) }));

        select(items.find((i) => i.key === "float")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.POPOUT_TAB, data: expect.objectContaining({ type: "float" }) }));

        select(items.find((i) => i.key === "close")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.DELETE_TAB }));
    });

    it("labels tabset popout/float items distinctly from the tab items", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const tabsetItems = itemsOf(getNodeContextMenuItems(model.getNodeById("ts0") as TabSetNode));
        expect(tabsetItems.find((i) => i.key === "popout")!.label).toBe("Pop out tabset");
        expect(tabsetItems.find((i) => i.key === "float")!.label).toBe("Float tabset");

        const tabItems = itemsOf(getNodeContextMenuItems(model.getNodeById("t0") as TabNode));
        expect(tabItems.find((i) => i.key === "popout")!.label).toBe("Popout");
        expect(tabItems.find((i) => i.key === "float")!.label).toBe("Float");
    });

    it("dispatches popoutTabset, deleteTabset and maximizeToggle for a tabset", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const onAction = vi.fn();
        const node = model.getNodeById("ts0") as TabSetNode;
        const items = itemsOf(getNodeContextMenuItems(node, { onAction }));
        expect(items.map((i) => i.key)).toEqual(["maximize", "float", "popout", "close"]);

        select(items.find((i) => i.key === "popout")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.POPOUT_TABSET, data: expect.objectContaining({ type: "window" }) }));

        select(items.find((i) => i.key === "float")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.POPOUT_TABSET, data: expect.objectContaining({ type: "float" }) }));

        select(items.find((i) => i.key === "maximize")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.MAXIMIZE_TOGGLE, data: expect.objectContaining({ node: "ts0" }) }));

        select(items.find((i) => i.key === "close")!);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.DELETE_TABSET }));
    });

    it("labels maximize as restore when the tabset is maximized", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("ts0") as TabSetNode;
        model.doAction(Actions.maximizeToggle("ts0"));
        const label = itemsOf(getNodeContextMenuItems(node)).find((i) => i.key === "maximize")!.label;
        expect(label).toBe("Restore");
    });

    it("starts the inline rename edit via the layout controller", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const controller = createController(model, { supportsPopout: true });
        const node = model.getNodeById("t0") as TabNode;
        const spy = vi.spyOn(controller, "setEditingTab");
        const rename = itemsOf(getNodeContextMenuItems(node)).find((i) => i.key === "rename")!;
        select(rename);
        expect(spy).toHaveBeenCalledWith(node);
    });

    it("builds the border type item toggling split/overlay", () => {
        const model = makeModel(borderJson);
        const border = model.getNodeById("border_left") as BorderNode;
        const label = () => itemsOf(getNodeContextMenuItems(border))[0];
        expect(label().key).toBe("borderType");
        expect(label().label).toBe("Overlay");

        const onAction = vi.fn();
        select(itemsOf(getNodeContextMenuItems(border, { onAction }))[0]);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.SET_BORDER_TYPE, data: expect.objectContaining({ borderType: "overlay" }) }));

        model.doAction(Actions.setBorderType("border_left", "overlay"));
        expect(label().label).toBe("Split");
    });

    it("respects getLabel and getIcon overrides", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const items = getNodeContextMenuItems(model.getNodeById("t0") as TabNode, {
            getLabel: (action) => "LBL-" + action,
            getIcon: () => <span>icon</span>,
        });
        const first = items[0] as IPopupMenuItem;
        expect(first.label).toBe("LBL-pin");
        expect(first.icon).toEqual(<span>icon</span>);
    });
});

describe("getNodeContextMenuItem", () => {
    it("returns a single wired item for an action", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const onAction = vi.fn();
        const item = getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "close", { onAction })!;
        expect(item.key).toBe("close");
        expect(item.label).toBe("Close");
        expect(item.disabled).toBe(false);
        select(item);
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: Actions.DELETE_TAB }));
    });

    it("returns undefined for an action that does not apply to the node type", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        expect(getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "maximize")).toBeUndefined();
        expect(getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "borderType")).toBeUndefined();
        expect(getNodeContextMenuItem(model.getNodeById("ts0") as TabSetNode, "rename")).toBeUndefined();
    });

    it("returns undefined for a not-allowed action by default, and a disabled item when includeDisabled is true", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableRename: false })]));
        expect(getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "rename")).toBeUndefined();
        expect(getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "rename", { includeDisabled: true })).toEqual(expect.objectContaining({ disabled: true }));
    });

    it("supports composing a custom menu with interleaved own entries", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        const customOnSelect = vi.fn();
        const entries = [getNodeContextMenuItem(node, "rename"), { key: "my-command", label: "My Command", onSelect: customOnSelect }, getNodeContextMenuItem(node, "close")].filter(
            (entry): entry is IPopupMenuItem => entry !== undefined,
        );
        expect(entries.map((e) => e.key)).toEqual(["rename", "my-command", "close"]);
        select(entries[1]);
        expect(customOnSelect).toHaveBeenCalled();
    });

    it("restricts the plural builder with the actions option", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        const items = itemsOf(getNodeContextMenuItems(node, { actions: ["close", "rename"] }));
        expect(items.map((i) => i.key)).toEqual(["close", "rename"]);
        // inapplicable actions in the requested list are skipped
        expect(itemsOf(getNodeContextMenuItems(node, { actions: ["rename", "maximize"] })).map((i) => i.key)).toEqual(["rename"]);
    });

    it("resolves labels through the controller's i18nTranslator", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const translations: Record<string, string> = {
            [I18nLabel.Menu_Rename]: "Umbenennen",
            [I18nLabel.Close_Tab]: "Schlie\u00dfen",
        };
        model.setI18nTranslator((key) => translations[key] ?? key);
        createController(model, {
            supportsPopout: true,
        });
        const node = model.getNodeById("t0") as TabNode;
        const items = itemsOf(getNodeContextMenuItems(node));
        expect(items.find((i) => i.key === "rename")!.label).toBe("Umbenennen");
        expect(items.find((i) => i.key === "close")!.label).toBe("Schlie\u00dfen");
        // untranslated labels fall back to English
        expect(items.find((i) => i.key === "pin")!.label).toBe("Pin");
    });
});

describe("ContextMenuBuilder", () => {
    it("chains additions in order and places a divider between groups", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const entries = new ContextMenuBuilder(model.getNodeById("t0") as TabNode).add("rename").add("pin").addDivider("sep1").add("close").build();
        expect(entries.map((e) => e.key)).toEqual(["rename", "pin", "sep1", "close"]);
        expect(entries[2]).toEqual({ key: "sep1", type: "divider" });
    });

    it("drops leading and trailing dividers and collapses consecutive ones", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        const entries = new ContextMenuBuilder(node).addDivider().add("rename").addDivider().addDivider().add("close").addDivider().build();
        expect(entries.map((e) => e.key)).toEqual(["rename", expect.stringMatching(/^divider-\d+$/), "close"]);
    });

    it("gives unnamed dividers unique keys so multiple groups do not collide", () => {
        const model = makeModel({
            global: { tabEnablePopout: true, tabEnableRename: true },
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha"), tab("t1", "Beta")] }] },
        });
        const node = model.getNodeById("t0") as TabNode;
        const entries = new ContextMenuBuilder(node).add("rename").addDivider().add("closeAll").addDivider().add("close").build();
        const dividerKeys = entries.filter((e) => e.type === "divider").map((e) => e.key);
        expect(dividerKeys).toHaveLength(2);
        expect(dividerKeys[0]).not.toBe(dividerKeys[1]);
        expect(dividerKeys).toEqual([expect.stringMatching(/^divider-\d+$/), expect.stringMatching(/^divider-\d+$/)]);
    });

    it("drops a divider that would otherwise lead the menu when the items before it are all omitted", () => {
        // a border tab with no other closeable tabs: only the custom entry survives, so the
        // divider before it must not be left leading the menu
        const model = makeModel({
            global: {},
            borders: [{ type: "border", location: "left", children: [tab("bt0", "B1", { enableClose: false })] }],
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] },
        });
        const node = model.getNodeById("bt0") as TabNode;
        const entries = new ContextMenuBuilder(node).add("closeAll").add("closeOthers").addDivider().add("close").addDivider().addCustom({ key: "custom", label: "Custom" }).build();
        expect(entries.map((e) => e.key)).toEqual(["custom"]);
    });

    it("drops a trailing divider when the following action is omitted", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        model.doAction(Actions.setTabPinned("t0", true)); // pinned: close/popout/float are not allowed
        const entries = new ContextMenuBuilder(model.getNodeById("t0") as TabNode).add("rename").add("pin").addDivider().add("close").build();
        expect(entries.map((e) => e.key)).toEqual(["rename", "pin"]);
    });

    it("addStandard matches getNodeContextMenuItems (no dividers)", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha"), tab("t2", "Gamma")]));
        const node = model.getNodeById("t2") as TabNode;
        const entries = new ContextMenuBuilder(node).addStandard().build();
        expect(entries.map((e) => e.key)).toEqual(getNodeContextMenuItems(node).map((e) => e.key));
        expect(entries.map((e) => (e as IPopupMenuItem).disabled)).toEqual([false, false, false, false, false]);
    });

    it("interleaves custom items with working onSelect", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const customOnSelect = vi.fn();
        const entries = new ContextMenuBuilder(model.getNodeById("t0") as TabNode)
            .add("rename")
            .addCustom({ key: "my-command", label: "My Command", onSelect: customOnSelect })
            .add("close")
            .build() as IPopupMenuItem[];
        expect(entries.map((e) => e.key)).toEqual(["rename", "my-command", "close"]);
        select(entries[1]);
        expect(customOnSelect).toHaveBeenCalled();
    });

    it("includes disabled items when includeDisabled is set on the builder", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableRename: false })]));
        const node = model.getNodeById("t0") as TabNode;
        const entries = new ContextMenuBuilder(node, { includeDisabled: true }).addStandard().build() as IPopupMenuItem[];
        expect(entries.map((e) => e.key)).toEqual(["pin", "float", "popout", "rename", "close"]);
        expect(entries.find((e) => e.key === "rename")!.disabled).toBe(true);
    });

    it("build returns a fresh array (later mutation is safe)", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const builder = new ContextMenuBuilder(model.getNodeById("t0") as TabNode).add("rename");
        const first = builder.build();
        builder.add("close");
        expect(first.map((e) => e.key)).toEqual(["rename"]);
        expect(builder.build().map((e) => e.key)).toEqual(["rename", "close"]);
    });
});

describe("bulk close actions", () => {
    const oneTabset = (tabs: IJsonTabNode[]): IJsonModel => ({
        global: { tabEnablePopout: true },
        layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: tabs }] },
    });

    // a bulk close dispatches a single GroupAction; returns the deleted tab ids in dispatch order
    const groupDeleteNodes = (onAction: ReturnType<typeof vi.fn>): string[] => {
        expect(onAction).toHaveBeenCalledTimes(1);
        const group = onAction.mock.calls[0][0];
        expect(group).toBeInstanceOf(GroupAction);
        return (group as GroupAction).actions.map((a) => a.data.node);
    };

    it("closeAll closes every closeable tab including the current one", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta", { enableClose: false }), tab("t2", "Gamma")]));
        const onAction = vi.fn();
        const item = getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "closeAll", { onAction })!;
        expect(item.label).toBe("Close All");
        select(item);
        expect(groupDeleteNodes(onAction)).toEqual(["t2", "t0"]);
    });

    it("closeAll from a non-closeable tab closes only the other closeable tabs", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha", { enableClose: false }), tab("t1", "Beta"), tab("t2", "Gamma")]));
        const onAction = vi.fn();
        const item = getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "closeAll", { onAction })!;
        select(item);
        expect(groupDeleteNodes(onAction)).toEqual(["t2", "t1"]);
    });

    it("closeRight closes only the closeable tabs to the right, keeping the current tab", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta"), tab("t2", "Gamma", { enableClose: false }), tab("t3", "Delta")]));
        const onAction = vi.fn();
        const item = getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "closeRight", { onAction })!;
        expect(item.label).toBe("Close to the Right");
        select(item);
        expect(groupDeleteNodes(onAction)).toEqual(["t3", "t1"]);
    });

    it("closeOthers keeps the current tab open and closes the other closeable tabs", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta", { enableClose: false }), tab("t2", "Gamma"), tab("t3", "Delta")]));
        const onAction = vi.fn();
        const item = getNodeContextMenuItem(model.getNodeById("t2") as TabNode, "closeOthers", { onAction })!;
        expect(item.label).toBe("Close Others");
        select(item);
        expect(groupDeleteNodes(onAction)).toEqual(["t3", "t0"]);
    });

    it("applies the deletions to the model via the default dispatch", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta"), tab("t2", "Gamma")]));
        select(getNodeContextMenuItem(model.getNodeById("t1") as TabNode, "closeOthers")!);
        expect(model.getNodeById("t0")).toBeUndefined();
        expect(model.getNodeById("t2")).toBeUndefined();
        expect(model.getNodeById("t1")).toBeDefined();
    });

    it("never closes pinned tabs (not closeable)", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha", { pinned: true }), tab("t1", "Beta"), tab("t2", "Gamma")]));
        const onAction = vi.fn();
        const item = getNodeContextMenuItem(model.getNodeById("t0") as TabNode, "closeOthers", { onAction })!;
        select(item);
        expect(groupDeleteNodes(onAction)).toEqual(["t2", "t1"]);
    });

    it("omits the bulk actions when there is nothing to close, unless includeDisabled", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        // a single-tab tabset has no siblings, so none of the bulk actions are offered
        expect(getNodeContextMenuItem(node, "closeAll")).toBeUndefined();
        expect(getNodeContextMenuItem(node, "closeOthers")).toBeUndefined();
        expect(getNodeContextMenuItem(node, "closeRight")).toBeUndefined();

        expect(getNodeContextMenuItem(node, "closeAll", { includeDisabled: true })!.disabled).toBe(true);
        expect(getNodeContextMenuItem(node, "closeOthers", { includeDisabled: true })!.disabled).toBe(true);
        expect(getNodeContextMenuItem(node, "closeRight", { includeDisabled: true })!.disabled).toBe(true);
    });

    it("is not applicable to tabset nodes", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta")]));
        const tabset = model.getNodeById("ts0") as TabSetNode;
        expect(getNodeContextMenuItem(tabset, "closeAll")).toBeUndefined();
        expect(getNodeContextMenuItem(tabset, "closeRight")).toBeUndefined();
        expect(getNodeContextMenuItem(tabset, "closeOthers")).toBeUndefined();
    });

    it("applies to border tabs for closeAll/closeOthers but not closeRight", () => {
        const model = makeModel({
            global: { tabEnablePopout: true },
            borders: [{ type: "border", location: "left", children: [tab("bt0", "B1"), tab("bt1", "B2", { enableClose: false }), tab("bt2", "B3")] }],
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] },
        });
        const borderTab = model.getNodeById("bt0") as TabNode;
        expect(getNodeContextMenuItem(borderTab, "closeAll")).toBeDefined();
        expect(getNodeContextMenuItem(borderTab, "closeOthers")).toBeDefined();
        expect(getNodeContextMenuItem(borderTab, "closeRight")).toBeUndefined();

        const onAction = vi.fn();
        select(getNodeContextMenuItem(borderTab, "closeAll", { onAction })!);
        // bt1 is not closeable; bt0 and bt2 are
        expect(groupDeleteNodes(onAction)).toEqual(["bt2", "bt0"]);
    });

    it("addStandard still only offers the single close action", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta")]));
        const keys = itemsOf(getNodeContextMenuItems(model.getNodeById("t0") as TabNode)).map((i) => i.key);
        expect(keys).toContain("close");
        expect(keys).not.toContain("closeAll");
        expect(keys).not.toContain("closeRight");
        expect(keys).not.toContain("closeOthers");
    });

    it("resolves bulk close labels through the controller's i18nTranslator", () => {
        const model = makeModel(oneTabset([tab("t0", "Alpha"), tab("t1", "Beta")]));
        const translations: Record<string, string> = {
            [I18nLabel.Menu_Close_All]: "Alle schlie\u00dfen",
            [I18nLabel.Menu_Close_Right]: "Alle rechts schlie\u00dfen",
        };
        model.setI18nTranslator((key) => translations[key] ?? key);
        createController(model, {
            supportsPopout: true,
        });
        const node = model.getNodeById("t0") as TabNode;
        const items = itemsOf(getNodeContextMenuItems(node, { actions: ["closeAll", "closeRight"] }));
        expect(items.map((i) => i.label)).toEqual(["Alle schließen", "Alle rechts schließen"]);
    });
});

describe("enablePin", () => {
    it("offers pin by default", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha")]));
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).toContain("pin");
        expect(getNodeContextMenuItem(node, "pin")).toBeDefined();
    });

    it("omits pin when the tab has enablePin disabled", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enablePin: false })]));
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).not.toContain("pin");
        expect(getNodeContextMenuItem(node, "pin")).toBeUndefined();
        expect(getNodeContextMenuItem(node, "pin", { includeDisabled: true })!.disabled).toBe(true);
    });

    it("omits pin when the global tabEnablePin is disabled", () => {
        const model = makeModel({
            global: { tabEnablePin: false },
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] },
        });
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).not.toContain("pin");
        expect(getNodeContextMenuItem(node, "pin")).toBeUndefined();
    });

    it("keeps pin enabled after re-enabling the attribute", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enablePin: false })]));
        const node = model.getNodeById("t0") as TabNode;
        model.doAction(Actions.updateNodeAttributes("t0", { enablePin: true }));
        expect(getNodeContextMenuItem(node, "pin")).toBeDefined();
    });
});

describe("enableFloat", () => {
    it("omits float when the tab is not floatable", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableFloat: false })]));
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).not.toContain("float");
        expect(getNodeContextMenuItem(node, "float")).toBeUndefined();
        expect(getNodeContextMenuItem(node, "float", { includeDisabled: true })!.disabled).toBe(true);
    });

    it("omits float when the global tabEnableFloat is disabled", () => {
        const model = makeModel({
            global: { tabEnableFloat: false },
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] },
        });
        const node = model.getNodeById("t0") as TabNode;
        expect(getNodeContextActions(node)).not.toContain("float");
    });

    it("offers float for a floatable tab but not for popout alone", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha", { enableFloat: false })]));
        const node = model.getNodeById("t0") as TabNode;
        // popout still allowed via the global, float suppressed by the per-tab override
        expect(getNodeContextActions(node)).toContain("popout");
        expect(getNodeContextActions(node)).not.toContain("float");
    });

    it("offers float even when popout is disabled", () => {
        const model = makeModel({
            global: { tabEnableFloat: true, tabEnablePin: true, tabEnableRename: true },
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha")] }] },
        });
        const node = model.getNodeById("t0") as TabNode;
        expect(node.isEnablePopout()).toBe(false);
        expect(getNodeContextActions(node)).toContain("float");
        expect(getNodeContextActions(node)).not.toContain("popout");
    });

    it("offers tabset float when every tab is floatable even if none are popoutable", () => {
        const model = makeModel({
            global: { tabEnableFloat: true, tabEnablePin: true, tabEnableRename: true },
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [tab("t0", "Alpha"), tab("t2", "Gamma")] }] },
        });
        const node = model.getNodeById("ts0") as TabSetNode;
        expect(getNodeContextActions(node)).toContain("float");
        expect(getNodeContextActions(node)).not.toContain("popout");
    });

    it("offers tabset float only when every tab is floatable", () => {
        const model = makeModel(twoTabsets([tab("t0", "Alpha"), tab("t2", "Gamma", { enableFloat: false })]));
        expect(getNodeContextActions(model.getNodeById("ts0") as TabSetNode)).not.toContain("float");
        // popout is unaffected by the float attribute
        expect(getNodeContextActions(model.getNodeById("ts0") as TabSetNode)).toContain("popout");
        model.doAction(Actions.updateNodeAttributes("t2", { enableFloat: true }));
        expect(getNodeContextActions(model.getNodeById("ts0") as TabSetNode)).toContain("float");
    });

    it("gates float for selected border tabs", () => {
        const model = makeModel(borderJson);
        model.doAction(Actions.selectTab("bt0"));
        expect(getNodeContextActions(model.getNodeById("bt0") as TabNode)).toContain("float");
        model.doAction(Actions.updateNodeAttributes("bt0", { enableFloat: false }));
        expect(getNodeContextActions(model.getNodeById("bt0") as TabNode)).not.toContain("float");
    });
});
