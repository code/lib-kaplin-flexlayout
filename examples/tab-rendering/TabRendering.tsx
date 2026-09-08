import { createRoot } from "react-dom/client";
import { IJsonModel, ITabRenderValues, Layout, Model, TabNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./TabRendering.tsx?raw";

const json: IJsonModel = {
    global: {},
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

// onRenderTab lets you customize each tab button: leading icon, the content text and extra buttons
const onRenderTab = (node: TabNode, renderValues: ITabRenderValues) => {
    renderValues.leading = <span style={{ width: "0.8em", height: "0.8em", borderRadius: "50%", background: "#3b7de7", display: "inline-block", marginRight: 4 }} />;
    renderValues.content = (
        <>
            <span>{node.getName()}</span>
            <span style={{ color: "gray", marginLeft: 4 }}>(custom)</span>
        </>
    );
    renderValues.buttons.push(
        <span key="badge" title="custom button" style={{ color: "#3b7de7", fontWeight: 600 }}>
            ★
        </span>,
    );
};

function TabRendering() {
    return (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Tab Rendering" path="examples/tab-rendering/TabRendering.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "gray" }}>
                    The onRenderTab prop customizes each tab button. Look at the tabstrip: every tab has a blue dot (the leading icon), a &quot;(custom)&quot; suffix on its label, and a star badge (an
                    extra button).
                </span>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} onRenderTab={onRenderTab} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<TabRendering />);
}
