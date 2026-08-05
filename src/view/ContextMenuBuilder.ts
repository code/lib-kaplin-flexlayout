import * as React from "react";
import { Action, Actions } from "../model/Actions";
import { BorderNode } from "../model/BorderNode";
import { Node } from "../model/Node";
import { TabNode } from "../model/TabNode";
import { TabSetNode } from "../model/TabSetNode";
import { I18nLabel } from "./I18nLabel";
import { IPopupMenuItem, PopupMenuEntry } from "./PopupMenu";

/** Standard context menu actions, each mapped to a prebuilt menu item. */
export type NodeContextAction = "pin" | "float" | "popout" | "rename" | "maximize" | "closeAll" | "closeRight" | "closeOthers" | "close" | "borderType";

/** The canonical list of all {@link NodeContextAction}s, in a sensible menu order. */
export const NODE_CONTEXT_ACTIONS: readonly NodeContextAction[] = ["pin", "float", "popout", "rename", "maximize", "closeAll", "closeRight", "closeOthers", "close", "borderType"];

/**
 * The bulk close actions: `closeAll` closes every closeable tab in the tab, `closeRight` the
 * closeable tabs to its right (tabset tabs only), and `closeOthers` every closeable tab but
 * itself. They are not part of the standard menu (see {@link ContextMenuBuilder.addStandard}),
 * which keeps a single `close` item; add them explicitly to build a menu with them. They are only
 * enabled when the tab has siblings (there is nothing else to close in a single-tab tabset).
 */
export const BULK_CLOSE_ACTIONS: readonly NodeContextAction[] = ["closeAll", "closeRight", "closeOthers"];

/**
 * Options for {@link getNodeContextMenuItems}.
 * @category Components
 * @group Context Menu
 */
export interface INodeContextMenuOptions {
    /** dispatch actions through this instead of the node's model; useful to intercept/undo actions */
    onAction?: (action: Action) => void;
    /** include actions that are not allowed on the node as disabled items (default false).
     *  Set true to show the full set with not-allowed actions greyed out instead of omitted. */
    includeDisabled?: boolean;
    /** the actions to build, in the order to show them (defaults to all actions for the node
     *  type). Actions that do not apply to the node type are skipped. */
    actions?: NodeContextAction[];
    /** override the default label of an item (takes precedence over the i18n labels) */
    getLabel?: (action: NodeContextAction, node: TabNode | TabSetNode | BorderNode) => string;
    /** provide an icon for an item */
    getIcon?: (action: NodeContextAction, node: TabNode | TabSetNode | BorderNode) => React.ReactNode;
}

/** @internal the actions offered for each node type, in menu order */
function orderedActions(node: Node): NodeContextAction[] {
    if (node instanceof TabNode) {
        return ["pin", "float", "popout", "rename", "close"];
    }
    if (node instanceof TabSetNode) {
        return ["maximize", "close"];
    }
    if (node instanceof BorderNode) {
        return ["borderType"];
    }
    return [];
}

/** @internal whether the action can apply to the node type (may still be disabled at runtime) */
function appliesTo(action: NodeContextAction, node: Node): boolean {
    switch (action) {
        case "closeAll":
        case "closeOthers":
            // any tab whose parent can hold tabs (tabsets and borders)
            return node instanceof TabNode && (node.getParent() instanceof TabSetNode || node.getParent() instanceof BorderNode);
        case "closeRight":
            // "right" is only meaningful in a left-to-right tabstrip
            return node instanceof TabNode && node.getParent() instanceof TabSetNode;
        default:
            return orderedActions(node).includes(action);
    }
}

/** @internal the closeable tabs of the given tab's parent, in strip order */
function closeableSiblings(tab: TabNode): TabNode[] {
    const parent = tab.getParent() as TabSetNode | BorderNode;
    return (parent.getChildren() as TabNode[]).filter((t) => t.isCloseable());
}

/** @internal dispatch a single {@link Actions.group} deleting the given tabs, in reverse strip
 *  order (deleting right-to-left keeps the remaining indices stable while the batch runs) */
function deleteTabs(tab: TabNode, targets: TabNode[], dispatch: (action: Action) => void): void {
    const parent = tab.getParent() as TabSetNode | BorderNode;
    const ids = new Set(targets.map((t) => t.getId()));
    const deletes: Action[] = [];
    for (let i = parent.getChildren().length - 1; i >= 0; i--) {
        const child = parent.getChildren()[i] as TabNode;
        if (ids.has(child.getId())) {
            deletes.push(Actions.deleteTab(child.getId()));
        }
    }
    if (deletes.length > 0) {
        dispatch(Actions.group(deletes));
    }
}

/** @internal whether the action is currently allowed on the node */
function isActionEnabled(action: NodeContextAction, node: Node): boolean {
    switch (action) {
        case "rename":
            // renaming only applies to tabs in tabsets (border tabs are not renameable)
            return node instanceof TabNode && node.getParent() instanceof TabSetNode && node.isEnableRename();
        case "pin":
            // pinning only applies to tabs in tabsets (the action is ignored for border tabs),
            // and can be disabled via the tab's enablePin attribute
            return node instanceof TabNode && node.getParent() instanceof TabSetNode && node.isEnablePin();
        case "popout":
            // popout positions from the parent's content rect: always available in tabsets; for
            // border tabs it needs the selected tab's measured rect
            return (
                node instanceof TabNode &&
                !node.isPoppedOut() &&
                !node.isPinned() &&
                (node.getParent() instanceof TabSetNode || node.isSelected()) &&
                node.isAllowedInWindow() &&
                (node.getLayout().getController()?.isSupportsPopout() ?? true)
            );
        case "float":
            // float positions from the parent's content rect: always available in tabsets; for
            // border tabs it needs the selected tab's measured rect
            return node instanceof TabNode && !node.isPoppedOut() && !node.isPinned() && (node.getParent() instanceof TabSetNode || node.isSelected()) && node.isAllowedInWindow();
        case "maximize":
            return node instanceof TabSetNode && node.canMaximize();
        case "close":
            return node instanceof TabNode ? node.isCloseable() : node instanceof TabSetNode && node.isCloseable() && !node.isMaximized();
        case "closeAll": {
            // bulk close actions only make sense when the tab has siblings
            if (!(node instanceof TabNode)) {
                return false;
            }
            const parent = node.getParent() as TabSetNode | BorderNode;
            return parent.getChildren().length > 1 && closeableSiblings(node).length > 0;
        }
        case "closeRight": {
            if (!(node instanceof TabNode) || !(node.getParent() instanceof TabSetNode)) {
                return false;
            }
            const parent = node.getParent() as TabSetNode;
            const index = parent.getChildren().indexOf(node);
            return closeableSiblings(node).some((t) => parent.getChildren().indexOf(t) > index);
        }
        case "closeOthers":
            // enabled when at least one other closeable tab exists
            return node instanceof TabNode && closeableSiblings(node).some((t) => t !== node);
        case "borderType":
            return node instanceof BorderNode;
    }
}

/** @internal the i18n label for each action, state-dependent for pin/maximize/borderType */
function labelFor(action: NodeContextAction, node: Node): I18nLabel {
    switch (action) {
        case "rename":
            return I18nLabel.Menu_Rename;
        case "pin":
            return node instanceof TabNode && node.isPinned() ? I18nLabel.Menu_Unpin : I18nLabel.Menu_Pin;
        case "popout":
            return I18nLabel.Menu_Popout;
        case "float":
            return I18nLabel.Menu_Float;
        case "maximize":
            return node instanceof TabSetNode && node.isMaximized() ? I18nLabel.Menu_Restore : I18nLabel.Menu_Maximize;
        case "close":
            return node instanceof TabSetNode ? I18nLabel.Close_Tabset : I18nLabel.Close_Tab;
        case "closeAll":
            return I18nLabel.Menu_Close_All;
        case "closeRight":
            return I18nLabel.Menu_Close_Right;
        case "closeOthers":
            return I18nLabel.Menu_Close_Others;
        case "borderType":
            return node instanceof BorderNode && node.isOverlay() ? I18nLabel.Menu_Split : I18nLabel.Menu_Overlay;
    }
}

/** @internal resolve the item label: getLabel override, else the i18n label through the
 *  layout controller's i18nMapper (the enum value is the English fallback) */
function resolveLabel(node: Node, action: NodeContextAction, getLabel: INodeContextMenuOptions["getLabel"]): string {
    if (getLabel) {
        return getLabel(action, node as TabNode | TabSetNode | BorderNode);
    }
    const label = labelFor(action, node);
    return node.getLayout().getController()?.i18nName(label) ?? label;
}

/** @internal perform the action for the given node, dispatching through `dispatch` */
function performAction(action: NodeContextAction, node: Node, dispatch: (action: Action) => void) {
    switch (action) {
        case "rename":
            // renaming is driven by the layout controller (inline edit), not an action
            node.getLayout()
                .getController()
                ?.setEditingTab(node as TabNode);
            break;
        case "pin": {
            const tab = node as TabNode;
            dispatch(Actions.setTabPinned(tab.getId(), !tab.isPinned()));
            break;
        }
        case "popout":
            dispatch(Actions.popoutTab(node.getId(), "window"));
            break;
        case "float":
            dispatch(Actions.popoutTab(node.getId(), "float"));
            break;
        case "maximize":
            dispatch(Actions.maximizeToggle(node.getId(), node.getLayoutId()));
            break;
        case "close":
            dispatch(node instanceof TabNode ? Actions.deleteTab(node.getId()) : Actions.deleteTabset(node.getId()));
            break;
        case "closeAll":
            deleteTabs(node as TabNode, closeableSiblings(node as TabNode), dispatch);
            break;
        case "closeRight": {
            const tab = node as TabNode;
            const parent = tab.getParent() as TabSetNode;
            const index = parent.getChildren().indexOf(tab);
            deleteTabs(tab, closeableSiblings(tab).filter((t) => parent.getChildren().indexOf(t) > index), dispatch);
            break;
        }
        case "closeOthers":
            deleteTabs(node as TabNode, closeableSiblings(node as TabNode).filter((t) => t !== node), dispatch);
            break;
        case "borderType":
            dispatch(Actions.setBorderType(node.getId(), (node as BorderNode).isOverlay() ? "split" : "overlay"));
            break;
    }
}

/** Returns the standard menu actions currently allowed on the node (the `addStandard` set; the
 *  bulk close actions are opt-in and built explicitly via {@link getNodeContextMenuItem} or the
 *  {@link ContextMenuBuilder}). */
export function getNodeContextActions(node: Node): NodeContextAction[] {
    return orderedActions(node).filter((action) => isActionEnabled(action, node));
}

/** Builds a single menu item for one action, or undefined if not applicable. */
export function getNodeContextMenuItem(node: TabNode | TabSetNode | BorderNode, action: NodeContextAction, options: INodeContextMenuOptions = {}): IPopupMenuItem | undefined {
    if (!appliesTo(action, node)) {
        return undefined; // not applicable to this node type
    }
    const { onAction, includeDisabled = false, getLabel, getIcon } = options;
    const dispatch = onAction ?? ((action: Action) => node.getModel().doAction(action));
    const enabled = isActionEnabled(action, node);
    if (!includeDisabled && !enabled) {
        return undefined;
    }
    return {
        key: action,
        label: resolveLabel(node, action, getLabel),
        icon: getIcon ? getIcon(action, node) : undefined,
        disabled: !enabled,
        onSelect: () => performAction(action, node, dispatch),
    };
}

/**
 * A fluent builder for prebuilt node context menu entries: choose which actions to show (in your
 * own order), interleave your own items, and place dividers between groups, then call
 * {@link ContextMenuBuilder.build} to get the {@link PopupMenuEntry}s for {@link showPopupMenu}.
 *
 * @example
 * const items = new ContextMenuBuilder(node)
 *     .add("pin")
 *     .add("float")
 *     .add("popout")
 *     .add("rename")
 *     .addDivider()
 *     .add("closeAll")
 *     .add("closeRight")
 *     .add("closeOthers")
 *     .addDivider()
 *     .add("close")
 *     .build();
 * @category Components
 * @group Context Menu
 */
export class ContextMenuBuilder {
    private readonly entries: PopupMenuEntry[] = [];
    private dividerId = 0;

    constructor(
        private readonly node: TabNode | TabSetNode | BorderNode,
        private readonly options: INodeContextMenuOptions = {},
    ) {}

    /** add the prebuilt item for the given action (omitted, or included disabled, per `includeDisabled`) */
    add(action: NodeContextAction): this {
        const item = getNodeContextMenuItem(this.node, action, this.options);
        if (item) {
            this.entries.push(item);
        }
        return this;
    }

    /** add all the standard actions for this node type, in their default order and without dividers */
    addStandard(): this {
        for (const action of orderedActions(this.node)) {
            this.add(action);
        }
        return this;
    }

    /** add a divider between groups. Unnamed dividers get a unique key (e.g. "divider-1") so
     *  several can be added to one menu without React key collisions. */
    addDivider(key?: string): this {
        const dividerKey = key ?? "divider-" + (++this.dividerId);
        this.entries.push({ type: "divider", key: dividerKey });
        return this;
    }

    /** interleave your own item into the menu */
    addCustom(entry: IPopupMenuItem): this {
        this.entries.push(entry);
        return this;
    }

    /**
     * Returns entries with consecutive dividers collapsed to one and any divider that ends up
     * leading or trailing removed (a divider is only kept when it separates two other entries).
     */
    build(): PopupMenuEntry[] {
        let items = this.entries.filter((entry, i) => {
            if (entry.type !== "divider") {
                return true;
            }
            const prev = this.entries[i - 1];
            const next = this.entries[i + 1];
            // keep the divider that separates two non-dividers (the last of a consecutive run)
            return prev !== undefined && next !== undefined && next.type !== "divider";
        });
        // a divider between two raw entries can still end up leading if the entries before it were
        // themselves dropped (e.g. all the standard items for a tab), so trim the result
        while (items.length > 0 && items[0].type === "divider") {
            items = items.slice(1);
        }
        while (items.length > 0 && items[items.length - 1].type === "divider") {
            items = items.slice(0, -1);
        }
        return items;
    }
}

/** Builds menu entries for the standard node actions. Use includeDisabled to show not-allowed actions as greyed-out items. */
export function getNodeContextMenuItems(node: TabNode | TabSetNode | BorderNode, options: INodeContextMenuOptions = {}): PopupMenuEntry[] {
    const actions = options.actions ?? orderedActions(node);
    const builder = new ContextMenuBuilder(node, options);
    for (const action of actions) {
        builder.add(action);
    }
    return builder.build();
}
