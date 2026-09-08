import * as React from "react";
import { createRoot } from "react-dom/client";
import { BorderNode, ContextMenuBuilder, IJsonModel, Layout, Model, PopupMenuEntry, TabGroupNode, TabNode, TabSetNode, showPopupMenu } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./ContextMenu.tsx?raw";

const json: IJsonModel = {
    global: {
        tabEnableRename: true,
        tabEnablePin: true,
        tabSetEnableCloseButton: true,
    },
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "Alpha", component: "panel" },
                    { type: "tab", id: "t1", name: "Beta", component: "panel" },
                    { type: "tab", id: "t2", name: "Gamma", component: "panel" },
                ],
            },
        ],
    },
};

const model = Model.fromJson(json);

const factory = (node: TabNode) => {
    if (node.getComponent() === "panel") {
        return <div style={{ padding: 20 }}>{node.getName()}</div>;
    }
    return undefined;
};

const makeOnContextMenu = (useDefaultMenu: boolean) => (node: TabNode | TabSetNode | BorderNode | TabGroupNode, event: React.MouseEvent<HTMLElement, MouseEvent>) => {
    event.preventDefault();
    event.stopPropagation();

    const nodeName = node instanceof BorderNode ? node.getType() : node.getName();
    let items: PopupMenuEntry[];
    if (useDefaultMenu) {
        // the standard menu: all the built-in actions for the node type, pre-labeled and enabled/disabled
        items = new ContextMenuBuilder(node).addStandard().build();
    } else {
        // a custom menu built by hand
        const builder = new ContextMenuBuilder(node);
        builder.addCustom({ key: "greet", label: "Hello", onSelect: () => window.alert("Hello from " + nodeName) });
        if (node instanceof TabNode) {
            builder.addDivider().add("rename").add("close");
        } else if (node instanceof TabSetNode) {
            builder.addDivider().add("close");
        }
        items = builder.build();
    }
    if (items.length === 0) {
        return;
    }
    showPopupMenu({
        anchor: { x: event.clientX, y: event.clientY },
        container: node.getLayoutRef()!,
        title: "Menu for " + nodeName,
        items,
        onClose: () => {},
    });
};

function ContextMenu() {
    const [useDefaultMenu, setUseDefaultMenu] = React.useState(true);
    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Context Menu" path="examples/context-menu/ContextMenu.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <label>Menu:</label>
                <label>
                    <input type="radio" checked={useDefaultMenu} onChange={() => setUseDefaultMenu(true)} /> Default
                </label>
                <label>
                    <input type="radio" checked={!useDefaultMenu} onChange={() => setUseDefaultMenu(false)} /> Custom
                </label>
                <span style={{ color: "gray" }}>Right-click a tab or tabset to see it.</span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} onContextMenu={makeOnContextMenu(useDefaultMenu)} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<ContextMenu />);
}
