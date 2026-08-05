// @vitest-environment jsdom
import * as React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TabNode, TabSetNode } from "../../src";
import { PopupMenu, PopupMenuEntry, showOverflowMenu, showPopupMenu } from "../../src/view/PopupMenu";
import { createController, makeModel } from "./testUtils";

const items: PopupMenuEntry[] = [
    { key: "one", label: "One" },
    { key: "two", label: "Two", icon: <span data-testid="menu-icon" aria-hidden="true" /> },
    { type: "divider", key: "div" },
    { key: "three", label: "Three", disabled: true },
    { key: "custom", content: <em>Custom Body</em> },
];

const renderMenu = (overrides: Partial<React.ComponentProps<typeof PopupMenu>> = {}) => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const result = render(<PopupMenu anchor={{ x: 10, y: 20 }} items={items} onSelect={onSelect} onClose={onClose} title="test menu" {...overrides} />);
    return { onSelect, onClose, ...result };
};

describe("PopupMenu", () => {
    it("renders the menu with items, a divider and a custom body", () => {
        renderMenu();
        const menu = screen.getByRole("menu", { name: "test menu" });
        expect(menu).not.toBeNull();
        expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
        expect(within(menu).getByRole("separator")).not.toBeNull();
        expect(within(menu).getByText("Custom Body")).not.toBeNull();
        expect(screen.getByTestId("menu-icon")).not.toBeNull();
        expect(within(menu).getByText("One")).not.toBeNull();
    });

    it("focuses the first enabled item on mount", () => {
        renderMenu();
        const itemsEls = screen.getAllByRole("menuitem");
        expect(document.activeElement).equal(itemsEls[0]);
    });

    it("selects an item, calling onSelect and onClose", () => {
        const { onSelect, onClose } = renderMenu();
        fireEvent.click(screen.getByText("One"));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "one" }));
        expect(onClose).toHaveBeenCalled();
    });

    it("calls the item's own onSelect instead of the menu onSelect", () => {
        const itemOnSelect = vi.fn();
        const { onSelect, onClose } = renderMenu({
            items: [{ key: "own", label: "Own", onSelect: itemOnSelect }],
        });
        fireEvent.click(screen.getByText("Own"));
        expect(itemOnSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "own" }));
        expect(onSelect).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("does not select a disabled item", () => {
        const { onSelect, onClose } = renderMenu();
        fireEvent.click(screen.getByText("Three"));
        expect(onSelect).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("marks disabled items with aria-disabled and a disabled class", () => {
        renderMenu();
        const item = screen.getByText("Three").closest('[role="menuitem"]')!;
        expect(item).toHaveAttribute("aria-disabled", "true");
        expect(item.className).toContain("flexlayout__popup_menu_item--disabled");
        const enabled = screen.getByText("One").closest('[role="menuitem"]')!;
        expect(enabled.className).not.toContain("flexlayout__popup_menu_item--disabled");
    });

    it("closes on Escape", () => {
        const { onClose } = renderMenu();
        fireEvent.keyDown(screen.getByRole("menu", { name: "test menu" }), { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });

    it("moves focus with arrow keys and selects with Enter", () => {
        const { onSelect } = renderMenu();
        const menuitems = screen.getAllByRole("menuitem");
        // keydown arrives on the currently focused menuitem (as in real usage)
        fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
        expect(document.activeElement).equal(menuitems[1]);
        fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
        expect(document.activeElement).equal(menuitems[0]);
        fireEvent.keyDown(document.activeElement!, { key: "End" });
        expect(document.activeElement).equal(menuitems[3]);
        fireEvent.keyDown(document.activeElement!, { key: "Home" });
        expect(document.activeElement).equal(menuitems[0]);

        fireEvent.keyDown(document.activeElement!, { key: "Enter" });
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "one" }));
    });

    it("supports type-ahead navigation", () => {
        renderMenu();
        const menuitems = screen.getAllByRole("menuitem");
        fireEvent.keyDown(document.activeElement!, { key: "t" });
        expect(document.activeElement).equal(menuitems[1]); // "Two" starts with t
    });

    it("closes when a pointer is pressed outside the menu", () => {
        const { onClose } = renderMenu();
        const outside = document.body.appendChild(document.createElement("div"));
        fireEvent.pointerDown(outside);
        expect(onClose).toHaveBeenCalled();
        outside.remove();
    });

    it("uses a custom renderItem with the item api", () => {
        const onSelect = vi.fn();
        const onClose = vi.fn();
        render(
            <PopupMenu
                anchor={{ x: 0, y: 0 }}
                title="custom"
                items={[{ key: "a", label: "A" }]}
                onSelect={onSelect}
                onClose={onClose}
                renderItem={(item, _i, api) => (
                    <div role="menuitem" tabIndex={-1} onClick={api.select}>
                        custom-{item.key}
                    </div>
                )}
            />,
        );
        const item = screen.getByText("custom-a");
        fireEvent.click(item);
        expect(onSelect).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("returns focus to the anchor element on close", () => {
        const anchor = document.body.appendChild(document.createElement("button"));
        const { unmount } = render(<PopupMenu anchor={anchor} title="x" items={[{ key: "a", label: "A" }]} onSelect={() => {}} onClose={() => {}} />);
        expect(document.activeElement).not.toEqual(anchor);
        unmount();
        expect(document.activeElement).equal(anchor);
        anchor.remove();
    });
});

describe("showPopupMenu", () => {
    it("mounts an imperative menu and returns an idempotent hide handle", () => {
        const host = document.body.appendChild(document.createElement("div"));
        const onSelect = vi.fn();
        const onClose = vi.fn();
        let hide: () => void = () => {};
        act(() => {
            hide = showPopupMenu({ anchor: { x: 0, y: 0 }, items: [{ key: "a", label: "A" }], onSelect, onClose });
        });

        expect(screen.getByText("A")).not.toBeNull();
        fireEvent.click(screen.getByText("A"));
        expect(onSelect).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
        expect(screen.queryByText("A")).toBeNull();

        // selecting already closed it; hide is a no-op
        hide();
        expect(screen.queryByText("A")).toBeNull();
        host.remove();
    });
});

describe("showOverflowMenu", () => {
    it("renders the hidden tabs as stamps and selects on click", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "Alpha" }] }] },
        });
        const controller = createController(model);
        const tabset = model.getNodeById("ts0") as TabSetNode;
        const trigger = document.body.appendChild(document.createElement("button"));
        const onSelect = vi.fn();
        const onHidden = vi.fn();

        act(() => {
            showOverflowMenu(trigger, tabset, [{ index: 0, node: model.getNodeById("t0") as TabNode }], onSelect, controller, onHidden);
        });

        expect(document.body.querySelector('[data-layout-path="/popup-menu/tb0"]')).not.toBeNull();
        fireEvent.click(document.body.querySelector('[data-layout-path="/popup-menu/tb0"]')!);
        expect(onSelect).toHaveBeenCalled();
        expect(onHidden).toHaveBeenCalled();
        expect(document.body.querySelector('[data-layout-path="/popup-menu/tb0"]')).toBeNull();
        trigger.remove();
    });
});
