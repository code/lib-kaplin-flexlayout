import { createRoot } from "react-dom/client";
import { IJsonModel, Layout, Model, TabNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./Popout.tsx?raw";

// Both the popout-to-window (enablePopout) and popout-to-float (enableFloat) features are
// enabled globally, along with their header icons. Popouts open the popout.html host page that
// ships alongside this example (examples/popout/popout.html).
const json: IJsonModel = {
    global: {
        tabEnablePopout: true,
        tabEnablePopoutIcon: true,
        tabEnableFloat: true,
        tabEnableFloatIcon: true,
    },
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                weight: 50,
                children: [
                    { type: "tab", id: "t0", name: "One", component: "content" },
                    { type: "tab", id: "t1", name: "Two", component: "content" },
                ],
            },
            {
                type: "tabset",
                id: "ts1",
                weight: 50,
                children: [{ type: "tab", id: "t2", name: "Three", component: "content" }],
            },
        ],
    },
};

const Content = ({ title }: { title: string }) => (
    <div style={{ padding: 20 }}>
        <h2>{title}</h2>
        <p>Use the icons in the tabset header to pop this tab out into a floating panel or a native window, then drag it back in.</p>
    </div>
);

const model = Model.fromJson(json);

const factory = (node: TabNode) => {
    if (node.getComponent() === "content") {
        return <Content title={node.getName()} />;
    }
    return undefined;
};

function Popout() {
    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Popout" path="examples/popout/Popout.tsx" source={sourceCode} />

            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<Popout />);
}
