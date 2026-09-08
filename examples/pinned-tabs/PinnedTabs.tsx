import * as React from "react";
import { createRoot } from "react-dom/client";
import { Actions, BorderNode, ContextMenuBuilder, IJsonModel, Layout, Model, PopupMenuEntry, TabGroupNode, TabNode, TabSetNode, showPopupMenu } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./PinnedTabs.tsx?raw";

// tabEnablePin enables pinning. Pinned tabs are grouped at the start of the tabstrip, cannot be
// closed via the ui and cannot be dragged out of their tabset (they can be reordered within the
// pinned group). The first two tabs below start pinned.
const json: IJsonModel = {
    global: {
        tabEnablePin: true,
    },
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "PinOne", pinned: true, component: "panel" },
                    { type: "tab", id: "t1", name: "PinTwo", pinned: true, component: "panel" },
                    { type: "tab", id: "t2", name: "Three", component: "panel" },
                    { type: "tab", id: "t3", name: "Four", component: "panel" },
                ],
            },
        ],
    },
};

const model = Model.fromJson(json);

const Panel = ({ node }: { node: TabNode }) => {
    // re-render when the pinned state (or any model change) updates, so the content
    // reflects the current pinned state, not just the initial one captured by the factory
    const [, tick] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
        const listener = () => tick();
        node.getModel().addChangeListener(listener);
        return () => node.getModel().removeChangeListener(listener);
    }, [node]);
    return (
        <div style={{ padding: 20 }}>
            <h2>{node.getName()}</h2>
            <p>This tab is {node.isPinned() ? "pinned" : "not pinned"}. Pinned tabs stay at the start of the tabstrip.</p>
        </div>
    );
};

const factory = (node: TabNode) => {
    if (node.getComponent() === "panel") {
        return <Panel node={node} />;
    }
    return undefined;
};

function PinnedTabs() {
    const selectedTab = () => {
        const tabset = model.getNodeById("ts0");
        const node = tabset instanceof TabSetNode ? tabset.getSelectedNode() : undefined;
        return node instanceof TabNode ? node : undefined;
    };

    const togglePin = () => {
        const tab = selectedTab();
        if (tab) {
            model.doAction(Actions.setTabPinned(tab.getId(), !tab.isPinned()));
        }
    };

    // the standard context menu includes the Pin/Unpin action, so pinning can also be done there
    const onContextMenu = (node: TabNode | TabSetNode | BorderNode | TabGroupNode, event: React.MouseEvent<HTMLElement, MouseEvent>) => {
        event.preventDefault();
        event.stopPropagation();
        const nodeName = node instanceof BorderNode ? node.getType() : node.getName();
        const items: PopupMenuEntry[] = new ContextMenuBuilder(node).addStandard().build();
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

    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Pinned Tabs" path="examples/pinned-tabs/PinnedTabs.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={togglePin}>Toggle pin</button>
                <span style={{ color: "gray" }}>Pinned tabs have a pin icon and cannot be closed or dragged out. Right-click a tab to pin/unpin via the context menu.</span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} onContextMenu={onContextMenu} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<PinnedTabs />);
}
