import * as React from "react";
import { createRoot } from "react-dom/client";
import { Actions, BorderNode, DockLocation, IJsonModel, ITabSetRenderValues, Layout, Model, TabNode, TabSetNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./LocalStorage.tsx?raw";

const STORAGE_KEY = "flexlayout-example-layout";

let nextIndex = 2;

const defaultJson: IJsonModel = {
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
                ],
            },
        ],
    },
};

const factory = (node: TabNode) => {
    if (node.getComponent() === "panel") {
        return <div style={{ padding: 20 }}>{node.getName()}</div>;
    }
    return undefined;
};

function LocalStorage() {
    const [model, setModel] = React.useState<Model>(() => {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return Model.fromJson(JSON.parse(saved));
            } catch {
                // fall through to the default if the saved json is corrupt
            }
        }
        return Model.fromJson(defaultJson);
    });

    const save = () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model.toJson()));
    };
    const load = () => {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                setModel(Model.fromJson(JSON.parse(saved)));
            } catch {
                window.alert("Nothing saved or the saved layout was corrupt");
            }
        } else {
            window.alert("Nothing saved");
        }
    };
    const reset = () => {
        setModel(Model.fromJson(defaultJson));
    };

    // a sticky "+" button stays pinned at the start of the tabstrip and adds a tab to that tabset
    const addTab = (tabset: TabSetNode) => {
        model.doAction(Actions.addTab({ type: "tab", id: "t" + nextIndex, name: "Tab " + nextIndex++, component: "panel" }, tabset.getId(), DockLocation.CENTER, -1));
    };
    const onRenderTabSet = (node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) => {
        if (node instanceof TabSetNode) {
            renderValues.stickyButtons.push(
                <button key="add" title="Add a tab" onClick={() => addTab(node)} style={{ marginRight: 4 }}>
                    +
                </button>,
            );
        }
    };

    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Load / Save" path="examples/localstorage/LocalStorage.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={save}>Save to localStorage</button>
                <button onClick={load}>Load from localStorage</button>
                <button onClick={reset}>Reset</button>
                <span style={{ color: "gray" }}>Use the + button in the tabstrip to add tabs; move tabs around, save, reload the page and load again.</span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} onRenderTabSet={onRenderTabSet} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<LocalStorage />);
}
