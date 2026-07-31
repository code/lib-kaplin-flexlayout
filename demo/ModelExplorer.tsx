import * as React from "react";
import { Action, IJsonModel, Layout, Model, TabNode } from "../src/index";
import { AttributeEditor } from "./AttributeEditor";
import { ModelTree } from "./ModelTree";

export function ModelExplorer({ node }: { node: TabNode }) {
    const model = node.getModel();
    const [selectedId, setSelectedId] = React.useState<string>("global");

    // keep the panel in sync when the model is changed externally (tabs dragged, etc.); skip
    // adjusting actions (e.g. while dragging a splitter) to avoid churn during those
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const listener = (action: Action) => {
            if (!action.isAdjusting()) {
                setTick((t) => t + 1);
            }
        };
        model.addChangeListener(listener);
        return () => {
            model.removeChangeListener(listener);
        };
    }, [model]);

    const nestedModel = React.useMemo<Model>(() => {
        const json: IJsonModel = {
            global: { rootOrientationVertical: true, tabSetEnableTabStrip: true, tabSetEnableSingleTabStretch: true, tabEnableClose: false },
            borders: [],
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "attrs-tree-tabset",
                        weight: 50,
                        children: [{ type: "tab", id: "attrs-tree-tab", name: "Model", component: "modelTree", enableScrollbars: false }],
                        active: true,
                    },
                    {
                        type: "tabset",
                        id: "attrs-editor-tabset",
                        weight: 50,
                        children: [{ type: "tab", id: "attrs-editor-tab", name: "Attributes", component: "attributeEditor", enableScrollbars: false }],
                    },
                ],
            },
        };
        return Model.fromJson(json);
    }, []);

    const factory = React.useCallback(
        (tabNode: TabNode) => {
            const component = tabNode.getComponent();
            if (component === "modelTree") {
                return <ModelTree model={model} selectedId={selectedId} onSelect={setSelectedId} />;
            } else if (component === "attributeEditor") {
                return <AttributeEditor model={model} selectedId={selectedId} />;
            }
            return null;
        },
        [model, selectedId],
    );

    return <Layout model={nestedModel} factory={factory} realtimeResize={true} />;
}
