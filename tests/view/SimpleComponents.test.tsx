// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { TabNode } from "../../src";
import { AddIcon, AsterickIcon, CloseIcon, EdgeIcon, MaximizeIcon, MenuIcon, OverflowIcon, PinIcon, PopoutFloatIcon, PopoutIcon, RestoreIcon, SettingsIcon } from "../../src/view/Icons";
import { Overlay } from "../../src/view/Overlay";
import { TabButtonStamp } from "../../src/view/TabButtonStamp";
import { DragTabButton } from "../../src/view/DragTabButton";
import { ErrorBoundary } from "../../src/view/ErrorBoundary";
import { TabContentRenderer } from "../../src/view/TabContentRenderer";
import { createController, makeModel } from "./testUtils";

describe("Icons", () => {
    const icons = [CloseIcon, PinIcon, MaximizeIcon, OverflowIcon, EdgeIcon, PopoutIcon, PopoutFloatIcon, RestoreIcon, AsterickIcon, AddIcon, MenuIcon, SettingsIcon];

    it.each(icons.map((ic) => [ic.displayName ?? ic.name]))("renders %s", (name) => {
        const Icon = icons.find((ic) => (ic.displayName ?? ic.name) === name)!;
        const { container } = render(<Icon />);
        expect(container.querySelector("svg")).not.toBeNull();
    });

    it("marks decorative icons as aria-hidden", () => {
        const { container } = render(<CloseIcon />);
        expect(container.querySelector("svg")!.getAttribute("aria-hidden")).equal("true");
    });

    it("SettingsIcon forwards svg props", () => {
        const { container } = render(<SettingsIcon width="32px" />);
        expect(container.querySelector("svg")!.getAttribute("width")).equal("32px");
    });
});

describe("Overlay", () => {
    const model = makeModel({
        global: {},
        layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "A" }] }] },
    });

    it("shows as flex when visible and hides when not", () => {
        const controller = createController(model);
        const { rerender } = render(<Overlay controller={controller} show={true} />);
        const div = document.body.querySelector(".flexlayout__layout_overlay")!;
        expect(div).not.toBeNull();
        expect((div as HTMLElement).style.display).equal("flex");

        rerender(<Overlay controller={controller} show={false} />);
        expect((div as HTMLElement).style.display).equal("none");
    });
});

describe("TabButtonStamp", () => {
    const make = (json: Record<string, unknown>) => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "Alpha", ...json }] }] },
        });
        const controller = createController(model);
        return { controller, tab: model.getNodeById("t0") as TabNode };
    };

    it("renders the tab name as its content", () => {
        const { controller, tab } = make({});
        render(<TabButtonStamp controller={controller} tabNode={tab} />);
        expect(screen.getByText("Alpha")).not.toBeNull();
    });

    it("renders a leading icon when the tab has one", () => {
        const { controller, tab } = make({ icon: "icon.png" });
        const { container } = render(<TabButtonStamp controller={controller} tabNode={tab} />);
        expect(container.querySelector("img")!.getAttribute("src")).equal("icon.png");
    });

    it("renders an empty stamp when the content is blank", () => {
        const { controller, tab } = make({ name: "" });
        const { container } = render(<TabButtonStamp controller={controller} tabNode={tab} />);
        expect(container.querySelector(".flexlayout__tab_button_content")).toBeNull();
    });
});

describe("DragTabButton", () => {
    it("renders a stamp and registers the tab stamp element", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "Alpha" }] }] },
        });
        const controller = createController(model);
        const tab = model.getNodeById("t0") as TabNode;

        render(<DragTabButton controller={controller} tabNode={tab} dragging={false} />);
        expect(screen.getByText("Alpha")).not.toBeNull();
        expect(tab.getTabStamp()).not.toBeNull();
        expect(tab.getTabStamp()).toHaveClass("flexlayout__drag_rect");
    });
});

describe("ErrorBoundary", () => {
    const Boom = () => {
        throw new Error("boom");
    };

    it("renders children when there is no error", () => {
        render(
            <ErrorBoundary message="failed" retryText="retry">
                <div>hello</div>
            </ErrorBoundary>,
        );
        expect(screen.getByText("hello")).not.toBeNull();
    });

    it("shows the message and retry button when a child throws", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {});
        render(
            <ErrorBoundary message="failed to render" retryText="try again">
                <Boom />
            </ErrorBoundary>,
        );
        expect(screen.getByRole("alert")).not.toBeNull();
        expect(screen.getByText("failed to render")).not.toBeNull();
        const button = screen.getByRole("button", { name: "try again" });
        consoleError.mockRestore();
        consoleDebug.mockRestore();
        expect(button).not.toBeNull();
    });

    it("recovers after clicking retry", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const { rerender } = render(
            <ErrorBoundary message="failed to render" retryText="try again">
                <Boom />
            </ErrorBoundary>,
        );
        const button = screen.getByRole("button", { name: "try again" });
        consoleError.mockRestore();
        consoleDebug.mockRestore();

        rerender(
            <ErrorBoundary message="failed to render" retryText="try again">
                <div>recovered</div>
            </ErrorBoundary>,
        );
        // the boundary keeps its error state until retry
        expect(screen.getByRole("alert")).not.toBeNull();
        fireEvent.click(button);
        expect(screen.getByText("recovered")).not.toBeNull();
    });
});

describe("TabContentRenderer", () => {
    const props = { windowId: "", visible: true, fullRedrawRevision: 0, parentRedrawRevision: {} };

    it("renders the tab component via the factory", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "Alpha", component: "comp" }] }] },
        });
        const controller = createController(model);
        const tab = model.getNodeById("t0") as TabNode;

        render(<TabContentRenderer controller={controller} tabNode={tab} {...props} />);
        expect(screen.getByText("content for Alpha")).not.toBeNull();
    });

    it("renders nothing for a tab without a component or sublayout", () => {
        const model = makeModel({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "t0", name: "Alpha" }] }] },
        });
        const controller = createController(model);
        const tab = model.getNodeById("t0") as TabNode;

        render(<TabContentRenderer controller={controller} tabNode={tab} {...props} />);
        expect(document.body.querySelector(".flexlayout__tab_align_stretch")).toBeNull();
    });
});
