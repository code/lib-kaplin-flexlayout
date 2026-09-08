import * as React from "react";
import { createRoot } from "react-dom/client";
import { IJsonModel, Layout, Model, TabNode } from "../../src/index";
import "../../style/combined.scss";
import { ExampleHeader } from "../Header";
import sourceCode from "./Theme.tsx?raw";

const json: IJsonModel = {
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "Alpha", component: "content" },
                    { type: "tab", id: "t1", name: "Beta", component: "content" },
                ],
            },
        ],
    },
};

const model = Model.fromJson(json);

const factory = (node: TabNode) => {
    if (node.getComponent() === "content") {
        return <div style={{ padding: 20 }}>Pick a theme above to restyle this layout.</div>;
    }
    return undefined;
};

function Theme() {
    const [theme, setTheme] = React.useState("alpha_light");
    return (
        <div className={"flexlayout__theme_" + theme} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ExampleHeader title="Theme" path="examples/theme/Theme.tsx" source={sourceCode} />
            <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <label>Theme:</label>
                <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                    <option value="alpha_light">alpha_light</option>
                    <option value="alpha_dark">alpha_dark</option>
                    <option value="alpha_rounded">alpha_rounded</option>
                    <option value="light">light</option>
                    <option value="dark">dark</option>
                    <option value="rounded">rounded</option>
                    <option value="gray">gray</option>
                    <option value="underline">underline</option>
                </select>
            </div>
            <div style={{ position: "relative", flexGrow: 1, border: "1px solid #ddd" }}>
                <Layout model={model} factory={factory} />
            </div>
        </div>
    );
}

const container = document.getElementById("container");
if (container) {
    createRoot(container).render(<Theme />);
}
