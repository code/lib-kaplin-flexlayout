// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { Actions, TabNode } from "../../src";
import { TabButton } from "../../src/view/TabButton";
import { createController, makeModel } from "./testUtils";

const make = (json: Record<string, unknown> = {}, props: Record<string, unknown> = {}, stateOverrides: Record<string, unknown> = {}) => {
    const model = makeModel({
        global: {},
        layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "Alpha", ...json }] }] },
    });
    const tab = model.getNodeById("t0") as TabNode;
    const controller = createController(model, props as never, undefined, stateOverrides as never);
    const selected = (model.getNodeById("ts0") as never as { getSelectedNode: () => TabNode | undefined }).getSelectedNode() === tab;
    const view = render(<TabButton controller={controller} tabNode={tab} selected={selected} path="/ts0/t0" />);
    return { model, controller, tab, view };
};

const getTab = () => screen.getByRole("tab");

describe("TabButton", () => {
    it("renders the tab with its name and role attributes", () => {
        make();
        const tab = getTab();
        expect(tab).not.toBeNull();
        expect(tab.getAttribute("aria-selected")).equal("true");
        expect(tab.getAttribute("tabindex")).equal("0");
        expect(tab.getAttribute("data-layout-path")).equal("/ts0/t0");
    });

    it("renders an unselected tab as not tabbable", () => {
        const model = makeModel({
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
        });
        const controller = createController(model);
        const tab = model.getNodeById("t1") as TabNode;
        render(<TabButton controller={controller} tabNode={tab} selected={false} path="/ts0/t1" />);
        const button = screen.getByRole("tab");
        expect(button.getAttribute("aria-selected")).equal("false");
        expect(button.getAttribute("tabindex")).equal("-1");
    });

    it("selects the tab on click", () => {
        const model = makeModel({
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
        });
        const controller = createController(model);
        const tab = model.getNodeById("t1") as TabNode;
        render(<TabButton controller={controller} tabNode={tab} selected={false} path="/ts0/t1" />);
        fireEvent.click(screen.getByRole("tab"));
        expect((model.getNodeById("ts0") as never as { getSelectedNode: () => TabNode }).getSelectedNode().getId()).equal("t1");
    });

    it("closes the tab via the close adornment", () => {
        const { model } = make();
        const close = document.body.querySelector('[data-layout-path="/ts0/t0/button/close"]')!;
        expect(close).not.toBeNull();
        fireEvent.click(close);
        expect(model.getNodeById("t0")).toBeUndefined();
    });

    it("does not render a close adornment for a pinned tab", () => {
        make({ pinned: true });
        expect(document.body.querySelector('[data-layout-path="/ts0/t0/button/close"]')).toBeNull();
        expect(document.body.querySelector('[data-layout-path="/ts0/t0/button/pin"]')).not.toBeNull();
    });

    it("starts a rename edit on double click and commits with Enter", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "Alpha", enableRename: true }] }] },
        });
        const controller = createController(model);
        const tab = model.getNodeById("t0") as TabNode;
        const view = render(<TabButton controller={controller} tabNode={tab} selected={true} path="/ts0/t0" />);

        fireEvent.doubleClick(getTab());
        expect(controller.getEditingTab()).equal(tab); // the double click requested the edit

        // rendering in edit mode commits the rename on Enter
        view.unmount();
        const editingController = createController(model, {}, undefined, { editingTab: tab });
        render(<TabButton controller={editingController} tabNode={tab} selected={true} path="/ts0/t0" />);
        const textbox = document.body.querySelector("input.flexlayout__tab_button_textbox") as HTMLInputElement;
        expect(textbox).not.toBeNull();
        expect(textbox.value).equal("Alpha");

        textbox.value = "Renamed";
        fireEvent.keyDown(textbox, { code: "Enter" });
        expect((model.getNodeById("t0") as TabNode).getName()).equal("Renamed");
    });

    it("cancels a rename edit with Escape", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "Alpha", enableRename: true }] }] },
        });
        const tab = model.getNodeById("t0") as TabNode;
        const controller = createController(model, {}, undefined, { editingTab: tab });
        render(<TabButton controller={controller} tabNode={tab} selected={true} path="/ts0/t0" />);
        const textbox = document.body.querySelector("input.flexlayout__tab_button_textbox") as HTMLInputElement;
        expect(textbox).not.toBeNull();
        fireEvent.keyDown(textbox, { code: "Escape" });
        expect(controller.getEditingTab()).toBeUndefined();
        expect(document.activeElement).equal(document.getElementById("flexlayout-tabbutton-t0"));
    });

    it("invokes the context menu callback", () => {
        const onContextMenu = vi.fn();
        const { tab } = make({}, { onContextMenu });
        fireEvent.contextMenu(getTab());
        expect(onContextMenu).toHaveBeenCalledWith(tab, expect.anything());
    });

    it("invokes the aux mouse click callback for a middle click", () => {
        const onAuxMouseClick = vi.fn();
        const { tab } = make({}, { onAuxMouseClick });
        const el = getTab();
        fireEvent(el, new MouseEvent("auxclick", { button: 1, bubbles: true }));
        expect(onAuxMouseClick).toHaveBeenCalledWith(tab, expect.anything());
    });

    it("does not invoke the aux mouse click callback for a plain click", () => {
        const onAuxMouseClick = vi.fn();
        make({}, { onAuxMouseClick });
        fireEvent.click(getTab());
        expect(onAuxMouseClick).not.toHaveBeenCalled();
    });

    it("closes a selected closeable tab with the close shortcut", () => {
        const { model } = make();
        model.doAction(Actions.selectTab("t0"));
        fireEvent.keyDown(getTab(), { key: "Delete", ctrlKey: true });
        expect(model.getNodeById("t0")).toBeUndefined();
    });
});
