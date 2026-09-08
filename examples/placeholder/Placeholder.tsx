import * as React from "react";
import { createRoot } from "react-dom/client";
import { ILayoutApi, IJsonModel, Layout, Model, TabNode, TabSetNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./Placeholder.tsx?raw";

const json: IJsonModel = {
    global: {
        tabSetEnableCloseButton: true,
    },
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

let nextIndex = 2;
const model = Model.fromJson(json);

const factory = (node: TabNode) => {
    if (node.getComponent() === "panel") {
        return <div style={{ padding: 20 }}>{node.getName()}</div>;
    }
    return undefined;
};

function Placeholder() {
    const layoutRef = React.useRef<ILayoutApi | null>(null);

    const onTabSetPlaceHolder = (node: TabSetNode) => {
        return (
            <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "gray" }}>
                <div>Empty tabset</div>
                <button
                    onClick={() => layoutRef.current?.addTabToTabSet(node.getId(), { name: "Tab " + nextIndex++, component: "panel" })}
                    style={{ marginTop: 8, padding: "4px 12px", cursor: "pointer" }}
                >
                    Add a tab
                </button>
            </div>
        );
    };

    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Placeholder" path="examples/placeholder/Placeholder.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "gray" }}>
                    A placeholder is content shown inside a tabset when it has no tabs. Enable it by passing the onTabSetPlaceHolder prop to &lt;Layout&gt;. Remove both tabs to see the placeholder.
                </span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout ref={layoutRef} model={model} factory={factory} onTabSetPlaceHolder={onTabSetPlaceHolder} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<Placeholder />);
}
