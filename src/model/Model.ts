import { Attribute } from "./Attributes";
import { Attributes } from "./Attributes";
import { DockLocation } from "./DockLocation";
import { DropInfo } from "./DropInfo";
import { Rect } from "./Rect";
import { Action } from "./Actions";
import { Actions } from "./Actions";
import { GroupAction } from "./Actions";
import { BorderNode } from "./BorderNode";
import { BorderSet } from "./BorderSet";
import { TabGroupNode } from "./TabGroupNode";
import { IDraggable } from "./IDraggable";
import { IDropTarget } from "./IDropTarget";
import { ICloseType } from "./ICloseType";
import { IBorderTabDirection, IGlobalAttributes, IJsonTabGroupNode, IJsonModel, IJsonSubLayout, IJsonRowNode, ITabGroupType, ITabSetAttributes } from "./IJsonModel";
import { Node } from "./Node";
import { RowNode } from "./RowNode";
import { TabNode } from "./TabNode";
import { TabSetNode } from "./TabSetNode";
import { randomUUID } from "./Utils";
import { ModelLayout } from "./ModelLayout";

/** @internal */
export const DefaultMin = 1;
/** @internal */
export const DefaultMax = 99999;

/**
 * A change listener that observes the model around each action. Register it with
 * `Model.addChangeListener`. Both callbacks are optional; `onBeforeAction` is called with the
 * action before the model applies it (useful for cheap snapshots), `onAfterAction` after it
 * has been applied.
 */
export interface ModelChangeListener {
    /** called with the action before the model applies it */
    onBeforeAction?: (action: Action) => void;
    /** called with the action after the model has applied it */
    onAfterAction?: (action: Action) => void;
}

/**
 * Class containing the Tree of Nodes used by the FlexLayout component
 */
export class Model {
    static MAIN_LAYOUT_ID = "__main_layout_id__";

    /** @internal */
    private static attributeDefinitions: Attributes = Model.createAttributeDefinitions();
    /** @internal */
    private static attributePairingDone: boolean = false;

    /**
     * Pairs the global attribute definitions with the node attribute definitions so that an
     * inherited node attribute can resolve its type/description/default from the global
     * attribute it maps to (and vice versa), e.g. tabEnableClose <-> enableClose. Idempotent;
     * called automatically when the definitions are accessed.
     */
    static ensureAttributePairing() {
        if (Model.attributePairingDone) {
            return;
        }
        Model.attributePairingDone = true;
        Model.attributeDefinitions.pairAttributes("RowNode", RowNode.getAttributeDefinitions());
        Model.attributeDefinitions.pairAttributes("TabSetNode", TabSetNode.getAttributeDefinitions());
        Model.attributeDefinitions.pairAttributes("TabNode", TabNode.getAttributeDefinitions());
        Model.attributeDefinitions.pairAttributes("BorderNode", BorderNode.getAttributeDefinitions());
        Model.attributeDefinitions.pairAttributes("TabGroupNode", TabGroupNode.getAttributeDefinitions());
    }

    /** @internal */
    private attributes: Record<string, any>;
    /** @internal */
    private layouts: Map<string, ModelLayout>;
    /** @internal */
    private borders: BorderSet;
    /** @internal */
    private changeListeners: (ModelChangeListener | ((action: Action) => void))[];
    /** @internal */
    private idMap: Map<string, Node>;
    /** @internal */
    private mainLayout: ModelLayout;
    /** @internal */
    private adoptedFromModel?: Model;
    /** @internal */
    private splitterSize?: number;
    /** @internal */
    private onAllowDrop?: (dragNode: Node, dropInfo: DropInfo) => boolean;
    /** @internal */
    private onCreateTabSet?: (tabNode?: TabNode) => ITabSetAttributes;
    /** @internal */
    private nextSubLayoutId: number;

    /**
     * 'private' constructor. Use the static method Model.fromJson(json) to create a model
     *  @internal
     */
    protected constructor() {
        this.attributes = {};
        this.layouts = new Map<string, ModelLayout>();
        this.borders = new BorderSet(this);
        this.idMap = new Map();
        this.changeListeners = [];
        this.nextSubLayoutId = 1;
        this.mainLayout = new ModelLayout(Model.MAIN_LAYOUT_ID, 0, "window", Rect.empty());
        this.layouts.set(Model.MAIN_LAYOUT_ID, this.mainLayout);
        this.splitterSize = 8;
    }

    /**
     * Update the node tree by performing the given action,
     * Actions should be generated via static methods on the Actions class
     * @param action the action to perform
     * @returns added Node for Actions.addTab, layoutId for createPopout
     */
    doAction(action: Action): any {
        // notify onBeforeAction listeners (legacy function-form listeners have no before phase)
        for (const listener of [...this.changeListeners]) {
            if (typeof listener !== "function") {
                listener.onBeforeAction?.(action);
            }
        }
        const returnVal = this.applyAction(action);

        this.updateIdMap();
        // iterate a copy: listeners may remove themselves during dispatch (e.g. React unmount)
        for (const listener of [...this.changeListeners]) {
            if (typeof listener === "function") {
                listener(action);
            } else {
                listener.onAfterAction?.(action);
            }
        }

        return returnVal;
    }

    /** @internal apply a single action to the node tree without notifying change listeners.
     *  A {@link GroupAction} applies its contained actions in a loop here, between the single
     *  onBeforeAction/onAfterAction listener pair dispatched by {@link doAction}. */
    private applyAction(action: Action): any {
        let returnVal = undefined;
        switch (action.type) {
            case Actions.ADD_TAB: {
                const newNode = new TabNode(this, action.data.json, true);
                const toNode = this.idMap.get(action.data.toNode) as Node & IDraggable;
                if (toNode instanceof TabSetNode || toNode instanceof BorderNode || toNode instanceof RowNode || toNode instanceof TabGroupNode) {
                    toNode.drop(newNode, DockLocation.getByName(action.data.location), action.data.index, action.data.select);
                    returnVal = newNode;
                }
                break;
            }
            case Actions.MOVE_NODE: {
                const fromNode = this.idMap.get(action.data.fromNode) as Node & IDraggable;

                if (fromNode instanceof TabNode || fromNode instanceof TabSetNode || fromNode instanceof RowNode || fromNode instanceof TabGroupNode) {
                    if (fromNode === this.getMaximizedTabset(fromNode.getLayoutId())) {
                        const fromLayout = this.layouts.get(fromNode.getLayoutId())!;
                        fromLayout.setMaximizedTabSet(undefined);
                    }
                    const toNode = this.idMap.get(action.data.toNode) as Node & IDropTarget;
                    if (toNode instanceof TabSetNode || toNode instanceof BorderNode || toNode instanceof RowNode || toNode instanceof TabGroupNode) {
                        toNode.drop(fromNode, DockLocation.getByName(action.data.location), action.data.index, action.data.select);
                    }
                }
                break;
            }
            case Actions.DELETE_TAB: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof TabNode) {
                    node.delete();
                }
                break;
            }
            case Actions.DELETE_TABSET: {
                const node = this.idMap.get(action.data.node);

                if (node instanceof TabSetNode) {
                    // first delete all child tabs that are closeable. isCloseable (not isEnableClose)
                    // so a tab hosting a non-closeable sublayout is not force-closed - matching the
                    // deleteTab / drag close paths
                    const children = [...node.getChildren()];
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if ((child as TabNode).isCloseable()) {
                            (child as TabNode).delete();
                        }
                    }

                    if (node.getChildren().length === 0) {
                        node.delete();
                    }
                    this.tidy();
                }
                break;
            }
            case Actions.POPOUT_TABSET: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof TabSetNode) {
                    const isMaximized = node.isMaximized();
                    const oldLayout = node.getLayout()!;
                    const layoutId = randomUUID();
                    const type = action.data.type || "window";

                    const layout = new ModelLayout(layoutId, this.getNextSubLayoutId(), type, oldLayout.getToExportRectFunction()(node.getRect(), type));
                    const json = {
                        type: "row",
                    };
                    const row = RowNode.fromJson(json, this, layout);
                    layout.setRootRow(row);
                    this.layouts.set(layoutId, layout);
                    row.drop(node, DockLocation.CENTER, 0);

                    if (isMaximized) {
                        oldLayout.setMaximizedTabSet(undefined);
                    }
                }
                break;
            }
            case Actions.POPOUT_TAB: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof TabNode) {
                    const layoutId = randomUUID();

                    const parent = node.getTabContainer();
                    const popoutRect = parent.getContentRect();
                    const oldLayout = node.getLayout()!;
                    const type = action.data.type || "window";
                    const layout = new ModelLayout(layoutId, this.getNextSubLayoutId(), type, oldLayout.getToExportRectFunction()(popoutRect, type));
                    const tabsetId = randomUUID();
                    const json: IJsonRowNode = {
                        type: "row",
                        children: [{ type: "tabset", id: tabsetId }],
                    };
                    const row = RowNode.fromJson(json, this, layout);
                    layout.setRootRow(row);
                    this.layouts.set(layoutId, layout);

                    const tabset = this.idMap.get(tabsetId) as TabSetNode & IDropTarget;
                    tabset.drop(node, DockLocation.CENTER, 0, true);
                }
                break;
            }

            case Actions.SELECT_TAB: {
                const tabNode = this.idMap.get(action.data.tabNode);
                if (tabNode instanceof TabNode) {
                    const parent = tabNode.getTabContainer();
                    const pos = parent.getTabNodes().indexOf(tabNode);

                    if (parent instanceof BorderNode) {
                        if (parent.getSelected() === pos) {
                            parent.setSelected(-1);
                        } else {
                            parent.setSelected(pos);
                        }
                    } else if (parent instanceof TabSetNode) {
                        if (parent.getSelected() !== pos) {
                            parent.setSelected(pos);
                        }
                        const layout = tabNode.getLayout()!;
                        layout.setActiveTabSet(parent);
                    }
                }
                break;
            }
            case Actions.SET_ACTIVE_TABSET: {
                const layoutId = action.data.layoutId ? action.data.layoutId : Model.MAIN_LAYOUT_ID;
                const layout = this.layouts.get(layoutId);
                if (layout !== undefined) {
                    // ignore unknown layout ids rather than throwing
                    if (action.data.tabsetNode === undefined) {
                        layout.setActiveTabSet(undefined);
                    } else {
                        const tabsetNode = this.idMap.get(action.data.tabsetNode);
                        if (tabsetNode instanceof TabSetNode) {
                            layout.setActiveTabSet(tabsetNode);
                        }
                    }
                }
                break;
            }
            case Actions.ADJUST_WEIGHTS: {
                const row = this.idMap.get(action.data.nodeId);
                if (row instanceof RowNode) {
                    const weights = action.data.weights as number[] | undefined;
                    const c = row.getChildren();
                    for (let i = 0; i < c.length; i++) {
                        const n = c[i] as TabSetNode | RowNode;
                        if (typeof weights?.[i] === "number" && Number.isFinite(weights[i])) {
                            // ignore missing/non-finite weights rather than poisoning the layout with
                            // undefined/Infinity/NaN weights
                            n.setWeight(weights[i]);
                        }
                    }
                }
                break;
            }
            case Actions.ADJUST_BORDER_SPLIT: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof BorderNode) {
                    node.setSize(action.data.size);
                }
                break;
            }
            case Actions.MAXIMIZE_TOGGLE: {
                const layoutId = action.data.layoutId ? action.data.layoutId : Model.MAIN_LAYOUT_ID;
                const layout = this.layouts.get(layoutId);
                const node = this.idMap.get(action.data.node);
                if (layout !== undefined && node instanceof TabSetNode) {
                    if (node === layout.getMaximizedTabSet()) {
                        layout.setMaximizedTabSet(undefined);
                    } else {
                        layout.setMaximizedTabSet(node);
                        layout.setActiveTabSet(node);
                    }
                }

                break;
            }
            case Actions.UPDATE_MODEL_ATTRIBUTES: {
                this.updateAttrs(action.data.json);
                break;
            }

            case Actions.UPDATE_NODE_ATTRIBUTES: {
                const node = this.idMap.get(action.data.node);
                if (node !== undefined) {
                    // ignore unknown node ids rather than throwing
                    const wasOpened = node instanceof TabGroupNode && node.isOpened();
                    // capture the selected tab and group flat-range before the toggle
                    let selectedTab: TabNode | undefined;
                    let groupStart = -1;
                    if (node instanceof TabGroupNode) {
                        const tabset = node.getTabContainer();
                        selectedTab = tabset.getSelectedNode();
                        if (wasOpened) {
                            const groupTabs = node.getChildren() as TabNode[];
                            if (groupTabs.length > 0) {
                                groupStart = tabset.getTabNodes().indexOf(groupTabs[0]);
                            }
                        }
                    }
                    node.updateAttrs(action.data.json);
                    if (node instanceof TabGroupNode && wasOpened !== node.isOpened()) {
                        // collapsing/expanding a group changes the set of visible tabs;
                        // keep the same tab selected when possible, otherwise move to the
                        // next visible tab after the collapsed group (or previous if none)
                        const tabset = node.getTabContainer();
                        const tabs = tabset.getTabNodes();
                        if (selectedTab !== undefined) {
                            const idx = tabs.indexOf(selectedTab);
                            if (idx !== -1) {
                                tabset.setSelected(idx);
                            } else if (wasOpened && groupStart !== -1) {
                                // the selected tab was inside the collapsed group
                                if (groupStart < tabs.length) {
                                    tabset.setSelected(groupStart);
                                } else if (groupStart > 0) {
                                    tabset.setSelected(groupStart - 1);
                                } else {
                                    tabset.setSelected(-1);
                                }
                            }
                        } else if (!wasOpened && node.getChildren().length > 0 && tabset instanceof TabSetNode) {
                            // expanding a group into an empty tabset selection activates its first
                            // tab, so the content area isn't left showing nothing (borders keep
                            // their no-selection state: they only show a panel when selected)
                            const firstGroupTab = node.getChildren()[0] as TabNode;
                            tabset.setSelected(tabset.getTabNodes().indexOf(firstGroupTab));
                        } else {
                            tabset.repairSelected();
                        }
                    }
                }
                break;
            }

            case Actions.ADD_TAB_TO_NEW_GROUP: {
                const tab = this.idMap.get(action.data.node);
                if (tab instanceof TabNode && !tab.isPinned()) {
                    const tabset = tab.getTabContainer();
                    if (tabset instanceof TabSetNode || tabset instanceof BorderNode) {
                        const parent = tab.getParent() as TabSetNode | BorderNode | TabGroupNode;
                        let insertPos;
                        if (parent instanceof TabGroupNode) {
                            // a grouped tab leaves its group: put the new group right after it
                            insertPos = tabset.getChildren().indexOf(parent) + 1;
                            parent.removeChild(tab);
                            if (parent.getChildren().length === 0) {
                                tabset.removeChild(parent);
                                insertPos--;
                            }
                        } else {
                            insertPos = tabset.getChildren().indexOf(tab);
                            if (insertPos === -1) {
                                insertPos = tabset.getChildren().length;
                            }
                            tabset.removeChild(tab);
                        }
                        const json: IJsonTabGroupNode = {
                            name: action.data.name,
                            color: action.data.color,
                        };
                        const group = new TabGroupNode(this, json);
                        tabset.addChild(group, insertPos);
                        group.addChild(tab);
                        const flatIndex = tabset.getTabNodes().indexOf(tab);
                        tabset.setSelected(flatIndex);
                        if (tabset instanceof TabSetNode) {
                            this.setActiveTabset(tabset, tabset.getLayoutId());
                        }
                        returnVal = group.getId();
                    }
                }
                break;
            }

            case Actions.UNGROUP: {
                const group = this.idMap.get(action.data.node);
                if (group instanceof TabGroupNode) {
                    const tabset = group.getTabContainer();
                    const index = tabset.getChildren().indexOf(group);
                    const children = [...group.getChildren()];
                    tabset.removeChild(group);
                    for (let i = 0; i < children.length; i++) {
                        tabset.addChild(children[i], index + i);
                    }
                    tabset.repairSelected();
                    if (tabset instanceof TabSetNode) {
                        this.setActiveTabset(tabset, tabset.getLayoutId());
                    }
                }
                break;
            }

            case Actions.REMOVE_TAB_FROM_GROUP: {
                const tab = this.idMap.get(action.data.node);
                if (tab instanceof TabNode && tab.getParent() instanceof TabGroupNode) {
                    const group = tab.getParent() as TabGroupNode;
                    const tabset = group.getTabContainer();
                    const groupIndex = tabset.getChildren().indexOf(group);
                    group.remove(tab);
                    // insert the tab where the group was (if group was deleted) or right after it
                    const insertPos = tabset.getChildren().indexOf(group);
                    tabset.addChild(tab, insertPos === -1 ? groupIndex : insertPos + 1);
                    tabset.setSelected(tabset.getTabNodes().indexOf(tab));
                    if (tabset instanceof TabSetNode) {
                        this.setActiveTabset(tabset, tabset.getLayoutId());
                    }
                }
                break;
            }

            case Actions.UPDATE_SUBLAYOUT_ATTRIBUTES: {
                const layout = this.layouts.get(action.data.layoutId);
                if (layout !== undefined) {
                    // ignore unknown layout ids rather than throwing
                    layout.updateAttrs(action.data.json);
                }
                break;
            }

            case Actions.RENAME_TAB: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof TabNode) {
                    node.setName(action.data.text);
                }
                break;
            }

            case Actions.SET_TAB_PINNED: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof TabNode && (node.getParent() instanceof TabSetNode || node.getParent() instanceof TabGroupNode)) {
                    const tabset = node.getTabContainer() as TabSetNode;
                    const pinned = action.data.pinned === true;
                    // a tab with enablePin disabled cannot be pinned via the action (unpinning is always allowed)
                    if (pinned && !node.isEnablePin()) {
                        break;
                    }
                    if (node.isPinned() !== pinned) {
                        const selectedNode = tabset.getSelectedNode(); // restore by identity after the move
                        node.setPinned(pinned);
                        // if the tab is inside a group, remove it from the group first
                        const groupParent = node.getParent() instanceof TabGroupNode ? (node.getParent() as TabGroupNode) : undefined;
                        if (groupParent !== undefined) {
                            groupParent.removeChild(node);
                            if (groupParent.getChildren().length === 0) {
                                tabset.removeChild(groupParent);
                            }
                            tabset.repairSelected();
                        } else {
                            tabset.removeChild(node);
                        }
                        // with the node removed, the leading pinned run length is both the "end of pinned
                        // group" (pin) and the "start of unpinned group" (unpin) insertion point
                        tabset.addChild(node, tabset.getPinnedRunLength());
                        if (selectedNode !== undefined) {
                            tabset.setSelected(tabset.getTabNodes().indexOf(selectedNode));
                        }
                    }
                }
                break;
            }

            case Actions.SET_BORDER_TYPE: {
                const node = this.idMap.get(action.data.node);
                if (node instanceof BorderNode && (action.data.borderType === "split" || action.data.borderType === "overlay")) {
                    node.setBorderType(action.data.borderType);
                }
                break;
            }

            case Actions.CREATE_SUBLAYOUT: {
                const layoutId = randomUUID();
                const layout = new ModelLayout(layoutId, this.getNextSubLayoutId(), action.data.type || "window", Rect.fromJson(action.data.rect));
                const row = RowNode.fromJson(action.data.layout, this, layout);
                layout.setRootRow(row);
                this.layouts.set(layoutId, layout);
                returnVal = layoutId;
                break;
            }

            case Actions.CLOSE_POPOUT: {
                const oldLayout = this.layouts.get(action.data.layoutId);
                if (oldLayout) {
                    oldLayout.setType("float");
                    const r = this.mainLayout.getController()!.getDomRect()!;
                    oldLayout.setRect(new Rect(r.width / 4, r.height / 4, r.width / 2, r.height / 2));
                }
                break;
            }

            case Actions.MOVE_POPOUT_TO_FRONT: {
                const layoutId = action.data.layoutId;
                const layout = this.layouts.get(layoutId);
                if (layout) {
                    this.layouts.delete(layoutId);
                    this.layouts.set(layoutId, layout);
                }
                break;
            }

            case Actions.MOVE_FLOAT: {
                const layoutId = action.data.layoutId;
                const layout = this.layouts.get(layoutId);
                if (layout) {
                    layout.setRect(action.data.rect);
                }
                break;
            }

            case Actions.POPOUT_FLOAT: {
                const layout = this.layouts.get(action.data.layoutId);
                if (layout && !layout.isMainLayout() && layout.getType() === "float") {
                    layout.setType("window");
                    if (action.data.rect) {
                        layout.setRect(Rect.fromJson(action.data.rect));
                    }
                }
                break;
            }

            case Actions.DOCK_FLOAT_TO_LAYOUT: {
                const layout = this.layouts.get(action.data.layoutId);
                const toNode = this.idMap.get(action.data.toNode);
                const location = DockLocation.getByName(action.data.location);
                if (layout && !layout.isMainLayout() && layout.getType() === "float" && (toNode instanceof TabSetNode || toNode instanceof RowNode) && location !== DockLocation.CENTER) {
                    const toLayout = toNode.getLayout();
                    // the target can be any layout except the floating panel being dragged itself
                    if (toLayout.getLayoutId() !== layout.getLayoutId()) {
                        const row = layout.getRootRow();
                        if (row) {
                            // a tab sublayout cannot host a floating panel containing a tab sublayout
                            let containsSublayout = false;
                            if (toLayout.getType() === "tab") {
                                row.forEachNode((node) => {
                                    if (node instanceof TabNode && node.getSubLayoutId() !== undefined) {
                                        containsSublayout = true;
                                    }
                                }, 0);
                            }
                            if (!containsSublayout) {
                                // detach the float layout first so tidy (called inside drop) never visits it
                                this.layouts.delete(layout.getLayoutId());
                                layout.setRootRow(undefined);
                                // the moved row inherits the target layout via its new parent chain
                                row.setLayout(undefined);
                                toNode.drop(row, location, action.data.index);
                            }
                        }
                    }
                }
                break;
            }

            case Actions.GROUP: {
                const group = action as GroupAction;
                for (const sub of group.actions) {
                    this.applyAction(sub);
                }
                break;
            }

            default:
                break;
        }

        return returnVal;
    }

    /**
     * Get the currently active tabset node
     */
    getActiveTabset(layoutId: string = Model.MAIN_LAYOUT_ID) {
        const layout = this.layouts.get(layoutId);
        if (layout && layout.getActiveTabSet() && this.getNodeById(layout.getActiveTabSet()!.getId())) {
            return layout.getActiveTabSet();
        } else {
            return undefined;
        }
    }

    /**
     * Get the currently maximized tabset node
     */
    getMaximizedTabset(layoutId: string = Model.MAIN_LAYOUT_ID) {
        return this.layouts.get(layoutId)?.getMaximizedTabSet();
    }

    /**
     * Gets the root RowNode of the model
     * @returns {RowNode}
     */
    getRootRow(layoutId: string = Model.MAIN_LAYOUT_ID) {
        return this.layouts.get(layoutId)?.getRootRow();
    }

    isRootOrientationVertical() {
        return this.attributes.rootOrientationVertical as boolean;
    }

    isEnableRotateBorderIcons() {
        return this.attributes.enableRotateBorderIcons as boolean;
    }

    getBorderLeftTabDirection() {
        return this.attributes.borderLeftTabDirection as IBorderTabDirection;
    }

    getTabGroupType() {
        return this.attributes.tabGroupType as ITabGroupType;
    }

    /**
     * Gets the
     * @returns {BorderSet|*}
     */
    getBorderSet() {
        return this.borders;
    }

    /**
     * Visits all the nodes in the model and calls the given function for each
     * @param fn a function that takes visited node and a integer level as parameters
     */
    visitNodes(fn: (node: Node, level: number) => void) {
        this.borders.forEachNode(fn);
        for (const [_, w] of this.layouts) {
            w.getRootRow()!.forEachNode(fn, 0);
        }
    }

    visitLayoutNodes(layoutId: string, fn: (node: Node, level: number) => void) {
        if (this.layouts.has(layoutId)) {
            if (layoutId === Model.MAIN_LAYOUT_ID) {
                this.borders.forEachNode(fn);
            }
            this.layouts.get(layoutId)!.visitNodes(fn);
        }
    }

    /**
     * Gets a node by its id
     * @param id the id to find
     */
    getNodeById(id: string): Node | undefined {
        return this.idMap.get(id);
    }

    /**
     * Finds the first/top left tab set of the given node.
     * @param node The top node you want to begin searching from, deafults to the root node
     * @returns The first Tab Set
     */
    getFirstTabSet(node = this.layouts.get(Model.MAIN_LAYOUT_ID)!.getRootRow() as Node): TabSetNode | undefined {
        const child = node.getChildren()[0];
        if (child instanceof TabSetNode) {
            return child;
        } else if (child instanceof RowNode) {
            return this.getFirstTabSet(child);
        }
        // degenerate/empty row (e.g. hand edited json or a fresh empty sublayout): no tabset to
        // find - return undefined rather than recursing into undefined and throwing
        return undefined;
    }

    /**
     * Load a model from JSON.
     * @param previousModel optional; when given, matching tabs adopt its view state (no remount).
     */
    static fromJson(json: IJsonModel, previousModel?: Model) {
        Model.ensureAttributePairing();
        const model = new Model();
        Model.attributeDefinitions.fromJson(json.global ?? {}, model.attributes);

        if (json.borders) {
            model.borders = BorderSet.fromJson(json.borders, model);
        }

        const subLayouts = json.subLayouts || json.popouts;

        if (subLayouts) {
            for (const layoutId in subLayouts) {
                const layoutJson = subLayouts[layoutId];
                const layout = ModelLayout.fromJson(layoutJson, model, layoutId);
                model.layouts.set(layoutId, layout);
            }
        }
        model.mainLayout.setRootRow(RowNode.fromJson(json.layout, model, model.mainLayout));
        model.tidy(); // initial tidy of node tree

        if (previousModel) {
            model.adoptedFromModel = previousModel;
            previousModel.adoptedFromModel = undefined; // only retain the immediately previous model
            model.visitNodes((node) => {
                if (node instanceof TabNode) {
                    const oldNode = previousModel.getNodeById(node.getId());
                    if (oldNode instanceof TabNode) {
                        node.adoptViewState(oldNode);
                    }
                }
            });
        }

        return model;
    }

    /** @internal */
    getAdoptedFromModel() {
        return this.adoptedFromModel;
    }

    /**
     * Converts the model to a json object
     * @returns {IJsonModel} json object that represents this model
     */
    toJson(): IJsonModel {
        const global: any = {};
        Model.attributeDefinitions.toJson(global, this.attributes);

        // save state of nodes
        this.visitNodes((node) => {
            node.fireEvent("save", {});
        });

        const subLayouts: Record<string, IJsonSubLayout> = {};
        for (const [id, layout] of this.layouts) {
            if (id !== Model.MAIN_LAYOUT_ID) {
                subLayouts[id] = layout.toJson();
            }
        }

        return {
            global,
            borders: this.borders.toJson(),
            layout: this.mainLayout.getRootRow()!.toJson(),
            subLayouts: subLayouts,
        };
    }

    getSplitterSize() {
        return this.splitterSize;
    }

    setSplitterSize(size?: number) {
        this.splitterSize = size;
    }

    isEnableEdgeDock() {
        return this.attributes.enableEdgeDock as boolean;
    }

    isEnableEdgeDockIndicators() {
        return this.attributes.enableEdgeDockIndicators as boolean;
    }

    /**
     * Sets a function to allow/deny dropping a node
     * @param onAllowDrop function that takes the drag node and DropInfo and returns true if the drop is allowed
     */
    setOnAllowDrop(onAllowDrop: (dragNode: Node, dropInfo: DropInfo) => boolean) {
        this.onAllowDrop = onAllowDrop;
    }

    /**
     * set callback called when a new TabSet is created.
     * The tabNode can be undefined if it's the auto created first tabset in the root row (when the last
     * tab is deleted, the root tabset can be recreated)
     * @param onCreateTabSet
     */
    setOnCreateTabSet(onCreateTabSet: (tabNode?: TabNode) => ITabSetAttributes) {
        this.onCreateTabSet = onCreateTabSet;
    }

    /**
     * Register a change listener (ModelChangeListener or legacy function).
     * Fires for every action, including direct `model.doAction` calls.
     */
    addChangeListener(listener: ModelChangeListener | ((action: Action) => void)) {
        this.changeListeners.push(listener);
    }

    /**
     * Removes a listener previously registered with `addChangeListener` (either a function or a
     * `ModelChangeListener` object)
     * @param listener the listener to remove
     */
    removeChangeListener(listener: ModelChangeListener | ((action: Action) => void)) {
        const pos = this.changeListeners.findIndex((l) => l === listener);
        if (pos !== -1) {
            this.changeListeners.splice(pos, 1);
        }
    }

    toString() {
        return JSON.stringify(this.toJson());
    }

    /***********************internal ********************************/

    /** @internal */
    getMainLayout() {
        return this.mainLayout;
    }

    /** @internal */
    getLayouts() {
        return this.layouts;
    }

    /** @internal */
    sortLayouts() {
        const priority: any = { window: 1, tab: 2, float: 3 };

        const sorted = Array.from(this.getLayouts().values()).sort((a, b) => {
            return priority[a.getType()] - priority[b.getType()];
        });
        this.layouts.clear();
        sorted.forEach((layout) => this.layouts.set(layout.getLayoutId(), layout));
    }

    /** @internal */
    setActiveTabset(tabsetNode: TabSetNode | undefined, layoutId: string) {
        const layout = this.layouts.get(layoutId);
        if (layout) {
            if (tabsetNode) {
                layout.setActiveTabSet(tabsetNode);
            } else {
                layout.setActiveTabSet(undefined);
            }
        }
    }

    /** @internal */
    setMaximizedTabset(tabsetNode: TabSetNode | undefined, layoutId: string) {
        const layout = this.layouts.get(layoutId);
        if (layout) {
            if (tabsetNode) {
                layout.setMaximizedTabSet(tabsetNode);
            } else {
                layout.setMaximizedTabSet(undefined);
            }
        }
    }

    /** @internal */
    updateIdMap() {
        // regenerate idMap to stop it building up
        this.idMap.clear();
        this.visitNodes((node) => {
            this.idMap.set(node.getId(), node);
        });
    }

    /** @internal */
    addNode(node: Node) {
        const id = node.getId();
        if (this.idMap.has(id)) {
            throw new Error(`Error: each node must have a unique id, duplicate id:${node.getId()}`);
        }

        this.idMap.set(id, node);
    }

    /** @internal */
    findDropTargetNode(layoutId: string, dragNode: Node & IDraggable, x: number, y: number, excludeCenter: boolean = false) {
        // an open overlay border panel overlays the main layout, so it must take drop
        // precedence over the tabsets underneath it
        if (layoutId === Model.MAIN_LAYOUT_ID) {
            for (const border of this.borders.getBorders()) {
                if (border.isShowing() && border.isOverlay() && border.getSelected() !== -1 && border.getContentRect()?.contains(x, y)) {
                    const dropInfo = border.canDrop(dragNode, x, y, excludeCenter);
                    if (dropInfo !== undefined) {
                        return dropInfo;
                    }
                }
            }
        }
        let node = (this.layouts.get(layoutId)!.getRootRow() as RowNode).findDropTargetNode(layoutId, dragNode, x, y, excludeCenter);
        if (node === undefined && layoutId === Model.MAIN_LAYOUT_ID) {
            node = this.borders.findDropTargetNode(dragNode, x, y, excludeCenter);
        }
        return node;
    }

    /** @internal */
    tidy() {
        for (const [_, layout] of this.layouts) {
            layout.getRootRow()!.tidy();
        }
    }

    /** @internal */
    updateAttrs(json: IGlobalAttributes) {
        Model.attributeDefinitions.update(json, this.attributes);
    }

    /** @internal */
    nextUniqueId() {
        return "#" + randomUUID();
    }

    /** @internal */
    getAttribute(name: string): any {
        return this.attributes[name];
    }

    /** @internal */
    getOnAllowDrop() {
        return this.onAllowDrop;
    }

    /** @internal */
    getOnCreateTabSet() {
        return this.onCreateTabSet;
    }

    /** @internal */
    getNextSubLayoutId() {
        return this.nextSubLayoutId++;
    }

    /** @internal */
    static getGlobalAttributeDefinitions(): Attributes {
        Model.ensureAttributePairing();
        return Model.attributeDefinitions;
    }

    /** @internal */
    static toTypescriptInterfaces(): string {
        Model.ensureAttributePairing();

        const sb = [];
        sb.push(Model.attributeDefinitions.toTypescriptInterface("Global", undefined));
        sb.push(RowNode.getAttributeDefinitions().toTypescriptInterface("Row", Model.attributeDefinitions));
        sb.push(TabSetNode.getAttributeDefinitions().toTypescriptInterface("TabSet", Model.attributeDefinitions));
        sb.push(TabNode.getAttributeDefinitions().toTypescriptInterface("Tab", Model.attributeDefinitions));
        sb.push(BorderNode.getAttributeDefinitions().toTypescriptInterface("Border", Model.attributeDefinitions));
        sb.push(TabGroupNode.getAttributeDefinitions().toTypescriptInterface("TabGroup", Model.attributeDefinitions));
        sb.push(ModelLayout.getAttributeDefinitions().toTypescriptInterface("SubLayout", undefined));
        return sb.join("\n");
    }

    /** @internal */
    private static createAttributeDefinitions(): Attributes {
        const attributeDefinitions = new Attributes();

        attributeDefinitions.add("enableEdgeDock", true).setType(Attribute.BOOLEAN).setDescription(`enable docking to the edges of the layout`);
        attributeDefinitions.add("enableEdgeDockIndicators", true).setType(Attribute.BOOLEAN).setDescription(`show the edge indicators when dragging`);
        attributeDefinitions
            .add("rootOrientationVertical", false)
            .setType(Attribute.BOOLEAN)
            .setDescription(`the top level 'row' will layout horizontally by default, set this option true to make it layout vertically`);
        attributeDefinitions
            .add("enableRotateBorderIcons", true)
            .setType(Attribute.BOOLEAN)
            .setDescription(`boolean indicating if tab icons should rotate with the text in the left and right borders`);

        // tab
        attributeDefinitions.add("tabEnableClose", true).setType(Attribute.BOOLEAN);
        attributeDefinitions
            .add("tabCloseType", 1)
            .setType("ICloseType")
            .setValues([
                { value: ICloseType.Visible, label: "Visible" },
                { value: ICloseType.Always, label: "Always" },
                { value: ICloseType.Selected, label: "Selected" },
            ]);
        attributeDefinitions.add("tabEnablePopout", false).setType(Attribute.BOOLEAN).setAlias("tabEnableFloat");
        attributeDefinitions.add("tabEnablePopoutIcon", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabEnablePopoutFloatIcon", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabEnablePopoutOverlay", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabEnableDrag", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabEnableRename", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabEnablePin", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabContentClassName", undefined).setType(Attribute.STRING);
        attributeDefinitions.add("tabClassName", undefined).setType(Attribute.STRING);
        attributeDefinitions.add("tabIcon", undefined).setType(Attribute.STRING);
        attributeDefinitions.add("tabEnableRenderOnDemand", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabBorderWidth", -1).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabBorderHeight", -1).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabEnableScrollbars", true).setType(Attribute.BOOLEAN);

        // tabset
        attributeDefinitions.add("tabSetEnableDeleteWhenEmpty", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableDrop", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableDrag", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableDivide", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableMaximize", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableClose", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableCloseButton", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableSingleTabStretch", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetAutoSelectTab", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableActiveIcon", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetClassNameTabStrip", undefined).setType(Attribute.STRING);
        attributeDefinitions.add("tabSetEnableTabStrip", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetEnableTabWrap", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("tabSetTabLocation", "top").setType("ITabLocation").setValues(["top", "bottom"]);
        attributeDefinitions.add("tabMinWidth", DefaultMin).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabMinHeight", DefaultMin).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabSetMinWidth", DefaultMin).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabSetMinHeight", DefaultMin).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabMaxWidth", DefaultMax).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabMaxHeight", DefaultMax).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabSetMaxWidth", DefaultMax).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabSetMaxHeight", DefaultMax).setType(Attribute.NUMBER);
        attributeDefinitions.add("tabSetEnableTabScrollbar", false).setType(Attribute.BOOLEAN);

        // tab group
        attributeDefinitions
            .add("tabGroupType", "splitpill")
            .setType("ITabGroupType")
            .setValues([
                { value: "splitpill", label: "Split Pill" },
                { value: "underline", label: "Underline" },
            ])
            .setDescription(`how a tab group is visually indicated: 'splitpill' encloses the group's tabs in a pill (left/right caps), 'underline' draws a colored underline under each grouped tab`);

        // border
        attributeDefinitions.add("borderSize", 200).setType(Attribute.NUMBER);
        attributeDefinitions.add("borderMinSize", DefaultMin).setType(Attribute.NUMBER);
        attributeDefinitions.add("borderMaxSize", DefaultMax).setType(Attribute.NUMBER);
        attributeDefinitions.add("borderEnableDrop", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("borderAutoSelectTabWhenOpen", true).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("borderAutoSelectTabWhenClosed", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("borderClassName", undefined).setType(Attribute.STRING);
        attributeDefinitions.add("borderEnableAutoHide", false).setType(Attribute.BOOLEAN);
        attributeDefinitions.add("borderEnableTabScrollbar", false).setType(Attribute.BOOLEAN);
        attributeDefinitions
            .add("borderLeftTabDirection", "up")
            .setType("IBorderTabDirection")
            .setValues(["up", "down"])
            .setDescription(`the direction the left border tabs read: 'up' (default, text reads bottom to top) or 'down' (text reads top to bottom like the right border)`);

        return attributeDefinitions;
    }
}
