// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { IJsonModel, Layout, Model, TabNode } from "../src";

const factory = (node: TabNode) => <div data-testid="tab-content">{node.getName()}</div>;

const json: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                children: [
                    { type: "tab", id: "t0", name: "Tab One" },
                    { type: "tab", id: "t1", name: "Tab Two" },
                ],
            },
        ],
    },
};

describe("Node window access", () => {
    it("getWindow returns the window the node is rendered in", () => {
        const model = Model.fromJson(json);
        render(<Layout model={model} factory={factory} />);
        const tab = model.getNodeById("t0") as TabNode;
        // in jsdom the layout is mounted into the jsdom window
        expect(tab.getWindow()).toBe(window);
    });

    it("getDocument returns the document the node is rendered in", () => {
        const model = Model.fromJson(json);
        render(<Layout model={model} factory={factory} />);
        const tab = model.getNodeById("t0") as TabNode;
        expect(tab.getDocument()).toBe(document);
    });

    it("returns undefined before the layout is mounted", () => {
        const model = Model.fromJson(json);
        const tab = model.getNodeById("t0") as TabNode;
        expect(tab.getWindow()).toBeUndefined();
        expect(tab.getDocument()).toBeUndefined();
    });
});
