import * as React from "react";
import { createRoot } from "react-dom/client";
import { BorderNode, ILayoutApi, ITabSetRenderValues, IJsonModel, Layout, Model, TabNode, TabSetNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./StickyButton.tsx?raw";

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
                ],
            },
        ],
    },
};

let nextIndex = 3;
const model = Model.fromJson(json);

const factory = (node: TabNode) => {
    if (node.getComponent() === "panel") {
        return <div style={{ padding: 20 }}>{node.getName()}</div>;
    }
    return undefined;
};

function StickyButton() {
    const layoutRef = React.useRef<ILayoutApi | null>(null);

    const addTab = (node: TabSetNode | BorderNode) => {
        // add a tab to the active tabset via the layout api
        layoutRef.current?.addTabToTabSet(node.getId(), { name: "Tab " + nextIndex++, component: "panel" });
    };

    // a sticky button stays pinned at the start of the tabstrip even when the tabs scroll
    const onRenderTabSet = (_node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) => {
        renderValues.stickyButtons.push(
            <button key="add" title="Add tab" onClick={() => addTab(_node)} style={{ marginRight: 4 }}>
                +
            </button>,
        );
    };

    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Sticky Button" path="examples/sticky-button/StickyButton.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "gray" }}>The + button in the tabstrip is a sticky button added via onRenderTabSet.</span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout ref={layoutRef} model={model} factory={factory} onRenderTabSet={onRenderTabSet} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<StickyButton />);
}
