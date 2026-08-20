import * as React from "react";
import { Action, Actions } from "../model/Actions";
import { BorderNode } from "../model/BorderNode";
import { DockLocation } from "../model/DockLocation";
import { TabGroupNode } from "../model/TabGroupNode";
import { Node } from "../model/Node";
import { TabNode } from "../model/TabNode";
import { TabSetNode } from "../model/TabSetNode";
import { I18nLabel } from "./I18nLabel";
import { CLASSES } from "./CSSClassNames";
import { IPopupMenuItem, PopupMenuEntry, showPopupMenu } from "./PopupMenu";

/** Standard context menu actions, each mapped to a prebuilt menu item. */
export type NodeContextAction =
    | "pin"
    | "float"
    | "popout"
    | "rename"
    | "maximize"
    | "closeAll"
    | "closeRight"
    | "closeOthers"
    | "close"
    | "borderType"
    | "addToNewGroup"
    | "addToGroup"
    | "removeFromGroup"
    | "ungroup"
    | "toggleOpen";

/** The canonical list of all {@link NodeContextAction}s, in a sensible menu order. */
export const NODE_CONTEXT_ACTIONS: readonly NodeContextAction[] = [
    "pin",
    "float",
    "popout",
    "rename",
    "maximize",
    "closeAll",
    "closeRight",
    "closeOthers",
    "close",
    "borderType",
    "addToNewGroup",
    "addToGroup",
    "removeFromGroup",
    "ungroup",
    "toggleOpen",
];

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
    /** close the open context menu (used by the group picker / pill rename / color controls) */
    closeMenu?: () => void;
    /** include actions that are not allowed on the node as disabled items (default false).
     *  Set true to show the full set with not-allowed actions greyed out instead of omitted. */
    includeDisabled?: boolean;
    /** the actions to build, in the order to show them (defaults to all actions for the node
     *  type). Actions that do not apply to the node type are skipped. */
    actions?: NodeContextAction[];
    /** override the default label of an item (takes precedence over the i18n labels) */
    getLabel?: (action: NodeContextAction, node: TabNode | TabSetNode | BorderNode | TabGroupNode) => string;
    /** provide an icon for an item */
    getIcon?: (action: NodeContextAction, node: TabNode | TabSetNode | BorderNode | TabGroupNode) => React.ReactNode;
}

/** @internal the actions offered for each node type, in menu order */
function orderedActions(node: Node): NodeContextAction[] {
    if (node instanceof TabNode) {
        return ["pin", "float", "popout", "rename", "close"];
    }
    if (node instanceof TabSetNode) {
        return ["maximize", "float", "popout", "close"];
    }
    if (node instanceof BorderNode) {
        return ["borderType"];
    }
    if (node instanceof TabGroupNode) {
        return ["toggleOpen", "ungroup"];
    }
    return [];
}

/** @internal whether the action can apply to the node type (may still be disabled at runtime) */
function appliesTo(action: NodeContextAction, node: Node): boolean {
    switch (action) {
        case "closeAll":
        case "closeOthers":
            // any tab whose parent can hold tabs (tabsets, borders and groups)
            return node instanceof TabNode && (node.isInsideTabSet() || node.isInsideBorder());
        case "closeRight":
            // "right" is only meaningful in a left-to-right tabstrip (tabsets, not borders)
            return node instanceof TabNode && node.isInsideTabSet();
        case "addToNewGroup":
        case "addToGroup":
            return node instanceof TabNode && !node.isPinned();
        case "removeFromGroup":
            return node instanceof TabNode ? node.getParent() instanceof TabGroupNode : node instanceof TabGroupNode;
        case "ungroup":
            // ungroup is a group-level operation, offered on the group pill (not on its tabs)
            return node instanceof TabGroupNode;
        case "toggleOpen":
            return node instanceof TabGroupNode;
        default:
            return orderedActions(node).includes(action);
    }
}

/** @internal the closeable tabs of the given tab's tabset/border, in strip order */
function closeableSiblings(tab: TabNode): TabNode[] {
    const tabset = tab.getTabContainer();
    return tabset.getTabNodes().filter((t) => t.isCloseable());
}

/** @internal dispatch a single {@link Actions.group} deleting the given tabs, in reverse strip
 *  order (deleting right-to-left keeps the remaining indices stable while the batch runs) */
function deleteTabs(tab: TabNode, targets: TabNode[], dispatch: (action: Action) => void): void {
    const tabset = tab.getTabContainer();
    const ids = new Set(targets.map((t) => t.getId()));
    const deletes: Action[] = [];
    const tabs = tabset.getTabNodes();
    for (let i = tabs.length - 1; i >= 0; i--) {
        if (ids.has(tabs[i].getId())) {
            deletes.push(Actions.deleteTab(tabs[i].getId()));
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
            // renaming applies to tabs in tabsets (border tabs are not renameable)
            return node instanceof TabNode && node.isInsideTabSet() && node.isEnableRename();
        case "pin":
            // pinning applies to tabs in tabsets (the action is ignored for border tabs),
            // and can be disabled via the tab's enablePin attribute
            return node instanceof TabNode && node.isInsideTabSet() && node.isEnablePin();
        case "popout":
            // popout positions from the parent's content rect: always available in tabsets; for
            // border tabs it needs the selected tab's measured rect. A tabset pops out as a whole.
            return node instanceof TabSetNode
                ? node.isAllowedInWindow() && (node.getLayout().getController()?.isSupportsPopout() ?? true)
                : node instanceof TabNode &&
                      !node.isPoppedOut() &&
                      !node.isPinned() &&
                      (node.isInsideTabSet() || node.isSelected()) &&
                      node.isAllowedInWindow() &&
                      (node.getLayout().getController()?.isSupportsPopout() ?? true);
        case "float":
            // float positions from the parent's content rect: always available in tabsets; for
            // border tabs it needs the selected tab's measured rect. A tabset floats as a whole.
            return node instanceof TabSetNode
                ? node.isAllowedInWindow()
                : node instanceof TabNode && !node.isPoppedOut() && !node.isPinned() && (node.isInsideTabSet() || node.isSelected()) && node.isAllowedInWindow();
        case "maximize":
            return node instanceof TabSetNode && node.canMaximize();
        case "close":
            return node instanceof TabNode ? node.isCloseable() : node instanceof TabSetNode && node.isCloseable() && !node.isMaximized();
        case "closeAll": {
            // bulk close actions only make sense when the tab has siblings
            if (!(node instanceof TabNode)) {
                return false;
            }
            const tabset = node.getTabContainer();
            return tabset.getTabNodes().length > 1 && closeableSiblings(node).length > 0;
        }
        case "closeRight": {
            if (!(node instanceof TabNode) || !node.isInsideTabSet()) {
                return false;
            }
            const tabset = node.getTabContainer() as TabSetNode;
            const tabs = tabset.getTabNodes();
            const index = tabs.indexOf(node);
            return closeableSiblings(node).some((t) => tabs.indexOf(t) > index);
        }
        case "closeOthers":
            // enabled when at least one other closeable tab exists
            return node instanceof TabNode && closeableSiblings(node).some((t) => t !== node);
        case "borderType":
            return node instanceof BorderNode;
        case "addToNewGroup":
            // any unpinned tab can start a new group
            return node instanceof TabNode && !node.isPinned() && node.getTabContainer() !== undefined;
        case "addToGroup": {
            // enabled when the tab's tabset/border has a group it is not already in
            if (!(node instanceof TabNode) || node.isPinned()) {
                return false;
            }
            const tabset = node.getTabContainer();
            const ownGroup = node.getParent() instanceof TabGroupNode ? (node.getParent() as TabGroupNode) : undefined;
            return tabset.getChildren().some((c) => c instanceof TabGroupNode && c !== ownGroup);
        }
        case "removeFromGroup":
            return node instanceof TabNode && node.getParent() instanceof TabGroupNode;
        case "ungroup":
            return node instanceof TabGroupNode;
        case "toggleOpen":
            return node instanceof TabGroupNode;
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
            return node instanceof TabSetNode ? I18nLabel.Menu_Popout_Tabset : I18nLabel.Menu_Popout;
        case "float":
            return node instanceof TabSetNode ? I18nLabel.Menu_Float_Tabset : I18nLabel.Menu_Float;
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
        case "addToNewGroup":
            return I18nLabel.Menu_Add_To_New_Group;
        case "addToGroup":
            return I18nLabel.Menu_Add_To_Group;
        case "removeFromGroup":
            return I18nLabel.Menu_Remove_From_Group;
        case "ungroup":
            return I18nLabel.Menu_Ungroup;
        case "toggleOpen":
            return node instanceof TabGroupNode && node.isOpened() ? I18nLabel.Menu_Collapse : I18nLabel.Menu_Expand;
    }
}

/** @internal resolve the item label: getLabel override, else the i18n label through the
 *  layout controller's i18nMapper (the enum value is the English fallback) */
function resolveLabel(node: Node, action: NodeContextAction, getLabel: INodeContextMenuOptions["getLabel"]): string {
    if (getLabel) {
        return getLabel(action, node as TabNode | TabSetNode | BorderNode | TabGroupNode);
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
            dispatch(node instanceof TabSetNode ? Actions.popoutTabset(node.getId(), "window") : Actions.popoutTab(node.getId(), "window"));
            break;
        case "float":
            dispatch(node instanceof TabSetNode ? Actions.popoutTabset(node.getId(), "float") : Actions.popoutTab(node.getId(), "float"));
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
            const tabset = tab.getTabContainer();
            const tabs = tabset.getTabNodes();
            const index = tabs.indexOf(tab);
            deleteTabs(
                tab,
                closeableSiblings(tab).filter((t) => tabs.indexOf(t) > index),
                dispatch,
            );
            break;
        }
        case "closeOthers":
            deleteTabs(
                node as TabNode,
                closeableSiblings(node as TabNode).filter((t) => t !== node),
                dispatch,
            );
            break;
        case "borderType":
            dispatch(Actions.setBorderType(node.getId(), (node as BorderNode).isOverlay() ? "split" : "overlay"));
            break;
        case "addToNewGroup":
            dispatch(Actions.addTabToNewGroup(node.getId(), undefined, getGroupDefaultColor(node)));
            break;
        case "addToGroup":
            // handled by the group picker item (custom content), not a plain action
            break;
        case "removeFromGroup":
            dispatch(Actions.removeTabFromGroup(node.getId()));
            break;
        case "ungroup":
            dispatch(Actions.ungroup((node as TabGroupNode).getId()));
            break;
        case "toggleOpen": {
            const group = node as TabGroupNode;
            dispatch(Actions.updateNodeAttributes(group.getId(), { opened: !group.isOpened() } as any));
            break;
        }
    }
}

/** Returns the standard menu actions currently allowed on the node (the `addStandard` set; the
 *  bulk close actions are opt-in and built explicitly via {@link getNodeContextMenuItem} or the
 *  {@link ContextMenuBuilder}). */
export function getNodeContextActions(node: Node): NodeContextAction[] {
    return orderedActions(node).filter((action) => isActionEnabled(action, node));
}

/** @internal fallback group palette when the CSS variable is unavailable (model-only tests, SSR) */
const DEFAULT_GROUP_COLOR_PALETTE = ["#d97a7a", "#dd8a4a", "#cbc688", "#94b870", "#7ab0b2", "#7db6c6", "#7895c4", "#a394cf", "#d187b2", "#bf9e81"];

/** @internal read a CSS custom property from the layout root, or undefined if unavailable */
function readLayoutCssVar(node: Node, name: string): string | undefined {
    const root = node.getLayout().getController()?.getRootDiv();
    if (!root) return undefined;
    const value = root.ownerDocument.defaultView?.getComputedStyle(root).getPropertyValue(name).trim();
    return value && value.length > 0 ? value : undefined;
}

/** @internal split a CSS color list string on commas not inside parentheses (handles rgb(), hsl()) */
function parseCssColorList(raw: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of raw) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
            const item = current.trim();
            if (item) result.push(item);
            current = "";
        } else {
            current += ch;
        }
    }
    const last = current.trim();
    if (last) result.push(last);
    return result;
}

/** @internal the color palette offered by the pill's single-line color chooser, read from the
 *  --color-tabgroup-menu-palette CSS variable (falls back to the hardcoded default list). */
function getGroupColorPalette(node: Node): string[] {
    const raw = readLayoutCssVar(node, "--color-tabgroup-menu-palette");
    if (!raw) return DEFAULT_GROUP_COLOR_PALETTE;
    const parsed = parseCssColorList(raw).filter((s) => s.length > 0);
    return parsed.length > 0 ? parsed : DEFAULT_GROUP_COLOR_PALETTE;
}

/** @internal the default color for a newly created group, read from --color-tabgroup-default. */
function getGroupDefaultColor(node: Node): string | undefined {
    return readLayoutCssVar(node, "--color-tabgroup-default");
}

/** @internal the "Add to group" picker item: a row of chips, one per other group in the tabset.
 *  Clicking a chip moves the tab into that group and closes the menu. */
function getGroupPickerItem(tab: TabNode, options: INodeContextMenuOptions): IPopupMenuItem {
    const dispatch = options.onAction ?? ((action: Action) => tab.getModel().doAction(action));
    const tabset = tab.getTabContainer();
    const ownGroup = tab.getParent() instanceof TabGroupNode ? (tab.getParent() as TabGroupNode) : undefined;
    const groups = (tabset.getChildren() as (TabNode | TabGroupNode)[]).filter((c): c is TabGroupNode => c instanceof TabGroupNode && c !== ownGroup);
    const pickGroup = (groupId: string) => {
        dispatch(Actions.moveNode(tab.getId(), groupId, DockLocation.CENTER, -1));
        options.closeMenu?.();
    };
    const content = (
        <div className="flexlayout__group_picker" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {groups.map((g) => (
                <button
                    key={g.getId()}
                    type="button"
                    className="flexlayout__group_picker_item"
                    style={{ backgroundColor: g.getColor() }}
                    onClick={(e) => {
                        e.stopPropagation();
                        pickGroup(g.getId());
                    }}
                >
                    {g.getName()}
                </button>
            ))}
        </div>
    );
    return { key: "addToGroup", content, disabled: groups.length === 0, onSelect: () => options.closeMenu?.() };
}

/** @internal the pill menu's inline rename control (commits on Enter or blur) */
function getGroupRenameItem(group: TabGroupNode, options: INodeContextMenuOptions): IPopupMenuItem {
    const dispatch = options.onAction ?? ((action: Action) => group.getModel().doAction(action));
    const commit = (value: string) => {
        dispatch(Actions.updateNodeAttributes(group.getId(), { name: value } as any));
        options.closeMenu?.();
    };
    const content = (
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <label className={CLASSES.FLEXLAYOUT__GROUP_RENAME}>
                Name
                <input
                    type="text"
                    className={CLASSES.FLEXLAYOUT__GROUP_RENAME_INPUT}
                    placeholder="Group Name"
                    defaultValue={group.getName()}
                    autoFocus={true}
                    aria-label={group.getLayout().getController()?.i18nName(I18nLabel.Rename_Group) ?? I18nLabel.Rename_Group}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                            commit((e.target as HTMLInputElement).value);
                        } else if (e.key === "Escape") {
                            options.closeMenu?.();
                        }
                    }}
                    onBlur={(e) => {
                        // only commit when focus leaves the menu entirely; clicking another control in
                        // the menu (color swatch, collapse/expand, ungroup) must not trigger a commit
                        const next = e.relatedTarget as HTMLElement | null;
                        const menu = e.currentTarget.closest(".flexlayout__popup_menu");
                        if (next && menu && menu.contains(next)) {
                            return;
                        }
                        commit(e.currentTarget.value);
                    }}
                />
            </label>
        </div>
    );
    return { key: "rename", content };
}

/** @internal the pill menu's single-line color chooser: preset swatches plus a custom picker */
function getGroupColorItem(group: TabGroupNode, options: INodeContextMenuOptions): IPopupMenuItem {
    const dispatch = options.onAction ?? ((action: Action) => group.getModel().doAction(action));
    const pick = (color: string) => {
        dispatch(Actions.updateNodeAttributes(group.getId(), { color } as any));
    };
    const palette = getGroupColorPalette(group);
    const content = (
        <div className="flexlayout__group_color_picker" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {palette.map((c, i) => (
                <button
                    key={c}
                    type="button"
                    className="flexlayout__group_color_picker_swatch"
                    style={{ backgroundColor: c }}
                    aria-label={`Group color ${i + 1}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        pick(c);
                    }}
                />
            ))}
            <label className="flexlayout__group_color_picker_custom" title={group.getLayout().getController()?.i18nName(I18nLabel.Group_Color) ?? I18nLabel.Group_Color}>
                <input type="color" defaultValue={group.getColor()} onChange={(e) => pick(e.currentTarget.value)} />
            </label>
        </div>
    );
    return { key: "color", content };
}

/** Builds a single menu item for one action, or undefined if not applicable. */
export function getNodeContextMenuItem(node: TabNode | TabSetNode | BorderNode | TabGroupNode, action: NodeContextAction, options: INodeContextMenuOptions = {}): IPopupMenuItem | undefined {
    if (!appliesTo(action, node)) {
        return undefined; // not applicable to this node type
    }
    const { onAction, includeDisabled = false, getLabel, getIcon } = options;
    const dispatch = onAction ?? ((action: Action) => node.getModel().doAction(action));
    const enabled = isActionEnabled(action, node);
    if (!includeDisabled && !enabled) {
        return undefined;
    }
    if (action === "addToGroup" && node instanceof TabNode) {
        return getGroupPickerItem(node, options);
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
        private readonly node: TabNode | TabSetNode | BorderNode | TabGroupNode,
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
        const dividerKey = key ?? "divider-" + ++this.dividerId;
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
export function getNodeContextMenuItems(node: TabNode | TabSetNode | BorderNode | TabGroupNode, options: INodeContextMenuOptions = {}): PopupMenuEntry[] {
    const actions = options.actions ?? orderedActions(node);
    const builder = new ContextMenuBuilder(node, options);
    for (const action of actions) {
        builder.add(action);
    }
    return builder.build();
}

/**
 * Builds the context menu entries for a group pill: an inline rename control, a single-line color
 * chooser, then the standard group actions (collapse/expand and ungroup). Pass a `closeMenu`
 * callback in the options so the rename/color controls can dismiss the menu after committing.
 */
export function getTabGroupMenuItems(group: TabGroupNode, options: INodeContextMenuOptions = {}): PopupMenuEntry[] {
    const builder = new ContextMenuBuilder(group, options);
    builder.addCustom(getGroupRenameItem(group, options));
    builder.addCustom(getGroupColorItem(group, options));
    builder.addDivider();
    builder.add("toggleOpen");
    builder.add("ungroup");
    return builder.build();
}

/**
 * Shows the group pill context menu (rename, color, collapse/expand, ungroup) using the reusable
 * {@link showPopupMenu}. Returns an idempotent hide handle. Pass `onAction` in the options to
 * intercept/undo the dispatched actions, and `closeMenu` is wired automatically.
 */
export function showGroupMenu(group: TabGroupNode, anchor: { x: number; y: number } | DOMRect | HTMLElement, options: INodeContextMenuOptions = {}): () => void {
    const controller = group.getLayout().getController()!;
    let hide = () => {};
    hide = showPopupMenu({
        anchor,
        // anchor within the layout root (like the other context menus) so the menu positions
        // relative to the layout, including in popout windows whose root sits at the viewport origin
        container: controller.getLayoutRef() ?? undefined,
        classNameMapper: controller.getClassName,
        title: group.getName(),
        items: getTabGroupMenuItems(group, { ...options, closeMenu: () => hide() }),
        onClose: () => {
            // nothing to clean up; the caller may supply its own onClose via options
        },
    });
    return hide;
}
