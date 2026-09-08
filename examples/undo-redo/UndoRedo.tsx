import { createRoot } from "react-dom/client";
import { Actions, BorderNode, DockLocation, IJsonModel, ITabSetRenderValues, Layout, Model, TabNode, TabSetNode, useUndo } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./UndoRedo.tsx?raw";

const json: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "One", component: "panel" },
                    { type: "tab", id: "t1", name: "Two", component: "panel" },
                    { type: "tab", id: "t2", name: "Three", component: "panel" },
                    { type: "tab", id: "t3", name: "Four", component: "panel" },
                    { type: "tab", id: "t4", name: "Five", component: "panel" },
                ],
            },
        ],
    },
};

let nextIndex = 5;

const factory = (node: TabNode) => {
    if (node.getComponent() === "panel") {
        return <div style={{ padding: 20 }}>{node.getName()}</div>;
    }
    return undefined;
};

function UndoRedo() {
    // useUndo owns the model state and snapshots before every mutation; undo/redo restore the model
    const { model, undo, redo, canUndo, canRedo, undoCount, redoCount } = useUndo(() => Model.fromJson(json));

    const addTab = (tabsetId: string) => {
        model?.doAction(Actions.addTab({ type: "tab", id: "t" + nextIndex, name: "Tab " + nextIndex++, component: "panel" }, tabsetId, DockLocation.CENTER, -1));
    };

    // a sticky "+" button stays pinned at the start of the tabstrip and adds a tab to that tabset
    const onRenderTabSet = (node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) => {
        if (node instanceof TabSetNode) {
            renderValues.stickyButtons.push(
                <button key="add" title="Add a tab" onClick={() => addTab(node.getId())} style={{ marginRight: 4 }}>
                    +
                </button>,
            );
        }
    };

    if (!model) {
        return null;
    }
    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Undo / Redo" path="examples/undo-redo/UndoRedo.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={undo} disabled={!canUndo}>
                    Undo ({undoCount})
                </button>
                <button onClick={redo} disabled={!canRedo}>
                    Redo ({redoCount})
                </button>
                <span style={{ color: "gray" }}>Use the + button in the tabstrip to add tabs, move tabs around and close them, then undo/redo.</span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} onRenderTabSet={onRenderTabSet} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<UndoRedo />);
}
