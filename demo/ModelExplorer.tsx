import * as React from "react";
import { Action, IJsonModel, Layout, Model, TabNode } from "../src/index";
import { AttributeEditor } from "./AttributeEditor";
import { ModelTree } from "./ModelTree";

export function ModelExplorer({ node }: { node: TabNode }) {
    const model = node.getModel();
    // a selection requested by "Show in Explorer" while this panel was not mounted (its tab hidden)
    const pendingSelectId = () => node.getExtraData().pendingSelectId as string | undefined;
    const [selectedId, setSelectedId] = React.useState<string>(() => pendingSelectId() ?? "global");
    const [revealId, setRevealId] = React.useState<string | null>(() => pendingSelectId() ?? null);

    // selects a node in the tree, expanding its ancestors so it is visible; exposed on the host
    // tab's extra data so the demo's context menu ("Show in Explorer") can drive this panel
    const selectNode = React.useCallback((id: string) => {
        setSelectedId(id);
        setRevealId(id);
    }, []);

    React.useEffect(() => {
        const extra = node.getExtraData();
        delete extra.pendingSelectId; // consumed by the state initializers above
        extra.modelExplorerSelect = selectNode;
        return () => {
            delete extra.modelExplorerSelect;
        };
    }, [node, selectNode]);

    // keep the panel in sync when the model is changed externally (tabs dragged, etc.); skip
    // adjusting actions (e.g. while dragging a splitter) to avoid churn during those
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const listener = (action: Action) => {
            if (!action.isAdjusting()) {
                setTick((t) => t + 1);
            }
        };
        const changeListener = { onAfterAction: listener };
        model.addChangeListener(changeListener);
        return () => {
            model.removeChangeListener(changeListener);
        };
    }, [model]);

    const nestedModel = React.useMemo<Model>(() => {
        const json: IJsonModel = {
            global: { rootOrientationVertical: true, tabSetEnableTabStrip: true, tabSetEnableSingleTabStretch: true, tabEnableClose: false, tabEnableRename: false },
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
                return <ModelTree model={model} selectedId={selectedId} onSelect={setSelectedId} revealId={revealId} />;
            } else if (component === "attributeEditor") {
                return <AttributeEditor model={model} selectedId={selectedId} />;
            }
            return null;
        },
        [model, selectedId, revealId],
    );

    return <Layout model={nestedModel} factory={factory} realtimeResize={true} />;
}
