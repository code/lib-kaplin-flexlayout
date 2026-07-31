import * as React from "react";
import { BorderNode, Model, Node, RowNode, TabNode, TabSetNode } from "../src/index";

export interface ITreeItem {
    id: string;
    label: string;
    selectable: boolean;
    node?: Node;
    children?: ITreeItem[];
}

export const getNodeLabel = (node: Node): string => {
    if (node instanceof TabNode) {
        return node.getName() ?? "[Unnamed Tab]";
    }
    if (node instanceof TabSetNode) {
        return node.getName() ?? "TabSet";
    }
    if (node instanceof RowNode) {
        return "Row";
    }
    if (node instanceof BorderNode) {
        return "Border: " + node.getLocation().getName();
    }
    return node.getType();
};

const toTreeItem = (node: Node): ITreeItem => {
    return {
        id: node.getId(),
        label: getNodeLabel(node),
        selectable: true,
        node,
        children: node.getChildren().map((child) => toTreeItem(child)),
    };
};

// builds the tree of editable items: global model attributes, borders (and their tabs), the main
// layout tree and the sublayouts (each with its own root row / tabsets / tabs)
export const buildTreeItems = (model: Model): ITreeItem[] => {
    const items: ITreeItem[] = [];

    items.push({ id: "global", label: "Global", selectable: true });

    const borderItems: ITreeItem[] = model
        .getBorderSet()
        .getBorders()
        .map((border) => toTreeItem(border));
    items.push({ id: "borders", label: "Borders", selectable: false, children: borderItems });

    const root = model.getRootRow();
    if (root) {
        items.push({ id: "layout", label: "Layout", selectable: false, children: [toTreeItem(root)] });
    }

    const subLayoutItems: ITreeItem[] = [];
    for (const [layoutId, layout] of model.getLayouts()) {
        if (layoutId === Model.MAIN_LAYOUT_ID) {
            continue;
        }
        const subRoot = layout.getRootRow();
        if (subRoot) {
            subLayoutItems.push({ id: "sublayout:" + layoutId, label: "Sublayout: " + layoutId, selectable: false, children: [toTreeItem(subRoot)] });
        }
    }
    if (subLayoutItems.length > 0) {
        items.push({ id: "sublayouts", label: "Sublayouts", selectable: false, children: subLayoutItems });
    }
    return items;
};

export interface IModelTreeProps {
    model: Model;
    selectedId: string;
    onSelect: (id: string) => void;
}

export function ModelTree({ model, selectedId, onSelect }: IModelTreeProps) {
    const items = buildTreeItems(model);

    const [expanded, setExpanded] = React.useState<Set<string>>(() => {
        const set = new Set<string>(["borders", "layout", "sublayouts"]);
        for (const border of model.getBorderSet().getBorders()) {
            set.add(border.getId());
        }
        const root = model.getRootRow();
        if (root) {
            set.add(root.getId());
        }
        return set;
    });

    const toggle = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <div className="attrs-tree">
            {items.map((item) => (
                <TreeRow key={item.id} item={item} depth={0} selectedId={selectedId} expanded={expanded} onToggle={toggle} onSelect={onSelect} />
            ))}
        </div>
    );
}

interface ITreeRowProps {
    item: ITreeItem;
    depth: number;
    selectedId: string;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onSelect: (id: string) => void;
}

const TreeRow = ({ item, depth, selectedId, expanded, onToggle, onSelect }: ITreeRowProps) => {
    const hasChildren = item.children !== undefined && item.children.length > 0;
    const isExpanded = expanded.has(item.id);
    const isSelected = item.selectable && selectedId === item.id;

    return (
        <div>
            <div
                className={"attrs-tree-row" + (isSelected ? " selected" : "") + (item.selectable ? " selectable" : "")}
                style={{ paddingLeft: 6 + depth * 14 }}
                title={item.node ? item.node.getType() + ": " + item.node.getPath() : undefined}
                onClick={() => {
                    if (hasChildren) {
                        onToggle(item.id);
                    }
                    if (item.selectable) {
                        onSelect(item.id);
                    }
                }}
            >
                <span className={"attrs-tree-caret" + (hasChildren ? "" : " empty")}>{hasChildren ? (isExpanded ? "\u25BE" : "\u25B8") : ""}</span>
                <span className="attrs-tree-label">{item.label}</span>
            </div>
            {hasChildren &&
                isExpanded &&
                item.children!.map((child) => <TreeRow key={child.id} item={child} depth={depth + 1} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />)}
        </div>
    );
};
