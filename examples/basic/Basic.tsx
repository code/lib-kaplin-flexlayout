import * as React from "react";
import { createRoot } from "react-dom/client";
import { IJsonModel, Layout, Model, TabNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./Basic.tsx?raw";

const json: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                weight: 50,
                children: [
                    { type: "tab", id: "t0", name: "Welcome", component: "welcome" },
                    { type: "tab", id: "t1", name: "Custom", component: "custom" },
                ],
            },
            {
                type: "tabset",
                id: "ts1",
                weight: 50,
                children: [{ type: "tab", id: "t2", name: "Another", component: "welcome" }],
            },
        ],
    },
};

const Welcome = () => (
    <div style={{ padding: 20 }}>
        <h2>Welcome</h2>
        <p>This is a minimal FlexLayout example. Drag the tabs between the two tabsets, resize the splitters, and maximize a tabset with its header button.</p>
    </div>
);

const Custom = () => {
    const [count, setCount] = React.useState(0);
    return (
        <div style={{ padding: 20 }}>
            <h2>Custom component</h2>
            <p>The factory maps the tab&apos;s component name to this React component.</p>
            <button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</button>
        </div>
    );
};

const model = Model.fromJson(json);

const factory = (node: TabNode) => {
    switch (node.getComponent()) {
        case "welcome":
            return <Welcome />;
        case "custom":
            return <Custom />;
    }
    return undefined;
};

function Basic() {
    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Basic" path="examples/basic/Basic.tsx" source={sourceCode} />

            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<Basic />);
}
