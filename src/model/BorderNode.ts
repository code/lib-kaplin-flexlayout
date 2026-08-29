import { Attribute } from "./Attributes";
import { Attributes } from "./Attributes";
import { DockLocation } from "./DockLocation";
import { DropInfo } from "./DropInfo";
import { Orientation } from "./Orientation";
import { Rect } from "./Rect";
import { CLASSES } from "../CSSClassNames";
import { TabGroupNode } from "./TabGroupNode";
import { IDraggable } from "./IDraggable";
import { IDropTarget } from "./IDropTarget";
import { IBorderAttributes, IBorderLocation, IJsonBorderNode, IJsonTabGroupNode, IJsonTabNode } from "./IJsonModel";
import { Model } from "./Model";
import { Node } from "./Node";
import { findStripDrop } from "./StripDrop";
import { TabNode } from "./TabNode";
import { detachDragNode, restoreSelectionAfterInsert } from "./Utils";

export class BorderNode extends Node implements IDropTarget {
    static readonly TYPE = "border";

    /** @internal */
    static fromJson(json: IJsonBorderNode, model: Model) {
        const location = DockLocation.getByName(json.location);
        const border = new BorderNode(location, json, model);
        if (json.children) {
            border.children = json.children.map((jsonChild: any) => {
                let child: TabNode | TabGroupNode;
                if (jsonChild.type === TabGroupNode.TYPE) {
                    child = TabGroupNode.fromJson(jsonChild as IJsonTabGroupNode, model);
                } else if (jsonChild.type === TabNode.TYPE || jsonChild.type === undefined) {
                    // a missing type defaults to tab for backwards compatibility with hand built json
                    child = TabNode.fromJson(jsonChild, model);
                } else {
                    // reject rather than silently dropping malformed json content
                    throw new Error(`Error: invalid border child type "${jsonChild.type}" (expected "tab" or "tabgroup")`);
                }
                child.setParent(border);
                return child;
            });
        }

        if (border.getSelected() >= border.getTabNodes().length) {
            // clamp out-of-range selected index from json to prevent children[selected] crash
            border.setSelected(border.getTabNodes().length - 1);
        } else if (border.getSelected() < -1) {
            border.setSelected(-1);
        }

        return border;
    }
    /** @internal */
    private static attributeDefinitions: Attributes = BorderNode.createAttributeDefinitions();

    /** @internal */
    private contentRect: Rect = Rect.empty();
    /** @internal */
    private tabHeaderRect: Rect = Rect.empty();
    /** @internal */
    private location: DockLocation;

    /** @internal */
    constructor(location: DockLocation, json: IJsonBorderNode, model: Model) {
        super(model);

        this.location = location;
        this.attributes.id = `border_${location.getName()}`;
        BorderNode.attributeDefinitions.fromJson(json, this.attributes);
        model.addNode(this);
    }

    getLocation() {
        return this.location;
    }

    getClassName() {
        return this.getAttr("className") as string | undefined;
    }

    isHorizontal() {
        return this.location.orientation === Orientation.HORZ;
    }

    getSize() {
        const defaultSize = this.getAttr("size") as number;
        const selectedNode = this.getSelectedNode();
        if (selectedNode === undefined) {
            return defaultSize;
        } else {
            const tabBorderSize = this.isHorizontal() ? selectedNode.getAttr("borderWidth") : selectedNode.getAttr("borderHeight");
            if (tabBorderSize === -1) {
                return defaultSize;
            } else {
                return tabBorderSize;
            }
        }
    }

    getMinSize() {
        const selectedNode = this.getSelectedNode();
        let min = this.getAttr("minSize") as number;
        if (selectedNode) {
            const nodeMin = this.isHorizontal() ? selectedNode.getMinWidth() : selectedNode.getMinHeight();
            min = Math.max(min, nodeMin);
        }
        return min;
    }

    getMaxSize() {
        const selectedNode = this.getSelectedNode();
        let max = this.getAttr("maxSize") as number;
        if (selectedNode) {
            const nodeMax = this.isHorizontal() ? selectedNode.getMaxWidth() : selectedNode.getMaxHeight();
            max = Math.min(max, nodeMax);
        }
        return max;
    }

    getSelected(): number {
        return this.attributes.selected as number;
    }

    /**
     * Returns the tabs of this border in strip order. Tabs inside a closed (collapsed) group are
     * not included. The `selected` index is an index into this list.
     */
    getTabNodes(): TabNode[] {
        const tabs: TabNode[] = [];
        for (const child of this.children) {
            if (child instanceof TabNode) {
                tabs.push(child);
            } else if (child instanceof TabGroupNode && child.isOpened()) {
                tabs.push(...(child.getChildren() as TabNode[]));
            }
        }
        return tabs;
    }

    isAutoHide() {
        return this.getAttr("enableAutoHide") as boolean;
    }

    getBorderType() {
        return this.getAttr("borderType") as "split" | "overlay";
    }

    isOverlay() {
        return this.getAttr("borderType") === "overlay";
    }

    /** @internal */
    setBorderType(borderType: "split" | "overlay") {
        this.attributes.borderType = borderType;
    }

    getSelectedNode(): TabNode | undefined {
        if (this.getSelected() !== -1) {
            return this.getTabNodes()[this.getSelected()];
        }
        return undefined;
    }

    /** @internal clamps the flat selected index so it always refers to a visible tab */
    repairSelected() {
        const tabs = this.getTabNodes();
        if (tabs.length === 0) {
            this.setSelected(-1);
        } else {
            const selected = this.getSelected();
            if (selected !== -1 && selected >= tabs.length) {
                this.setSelected(tabs.length - 1);
            }
        }
    }

    getOrientation() {
        return this.location.getOrientation();
    }

    /**
     * Returns the config attribute that can be used to store node specific data that
     * WILL be saved to the json. The config attribute should be changed via the action Actions.updateNodeAttributes rather
     * than directly, for example:
     * this.state.model.doAction(
     *   FlexLayout.Actions.updateNodeAttributes(node.getId(), {config:myConfigObject}));
     */
    getConfig() {
        return this.attributes.config;
    }

    isMaximized() {
        return false;
    }

    isShowing() {
        return this.attributes.show as boolean;
    }

    toJson(): IJsonBorderNode {
        const json: IJsonBorderNode = { location: "bottom" };
        BorderNode.attributeDefinitions.toJson(json, this.attributes);
        json.location = this.location.getName() as IBorderLocation;
        json.children = this.children.map((child) => child.toJson() as IJsonTabNode | IJsonTabGroupNode);
        return json;
    }

    isAutoSelectTabWhenOpen() {
        return this.getAttr("autoSelectTabWhenOpen") as boolean;
    }

    isAutoSelectTabWhenClosed() {
        return this.getAttr("autoSelectTabWhenClosed") as boolean;
    }

    /** @internal */
    isAutoSelectTab(whenOpen?: boolean) {
        if (whenOpen == null) {
            whenOpen = this.getSelected() !== -1;
        }
        if (whenOpen) {
            return this.isAutoSelectTabWhenOpen();
        } else {
            return this.isAutoSelectTabWhenClosed();
        }
    }

    isEnableTabScrollbar() {
        return this.getAttr("enableTabScrollbar") as boolean;
    }

    /** @internal */
    setSelected(index: number) {
        this.attributes.selected = index;
    }

    /** @internal */
    setTabHeaderRect(r: Rect) {
        this.tabHeaderRect = r;
    }

    /** @internal */
    getRect() {
        return this.tabHeaderRect!;
    }

    /** @internal */
    getContentRect() {
        return this.contentRect;
    }

    /** @internal */
    setContentRect(r: Rect) {
        this.contentRect = r;
    }

    isEnableDrop() {
        return this.getAttr("enableDrop") as boolean;
    }

    /** @internal */
    setSize(pos: number) {
        const selected = this.getSelected();
        if (selected === -1) {
            this.attributes.size = pos;
        } else {
            const tabNode = this.getSelectedNode();
            if (tabNode === undefined) {
                this.attributes.size = pos;
                return;
            }
            const tabBorderSize = this.isHorizontal() ? tabNode.getAttr("borderWidth") : tabNode.getAttr("borderHeight");
            if (tabBorderSize === -1) {
                this.attributes.size = pos;
            } else {
                if (this.isHorizontal()) {
                    tabNode.setBorderWidth(pos);
                } else {
                    tabNode.setBorderHeight(pos);
                }
            }
        }
    }

    /** @internal */
    updateAttrs(json: IBorderAttributes) {
        BorderNode.attributeDefinitions.update(json, this.attributes);
    }

    /** @internal */
    remove(node: TabNode) {
        this.removeChild(node);
        this.repairSelected();
    }

    /** @internal */
    canDrop(dragNode: Node & IDraggable, x: number, y: number, _excludeCenter: boolean = false): DropInfo | undefined {
        if (!(dragNode instanceof TabNode) && !(dragNode instanceof TabGroupNode)) {
            return undefined;
        }

        let dropInfo;
        const dockLocation = DockLocation.CENTER;

        if (this.tabHeaderRect!.contains(x, y)) {
            dropInfo = findStripDrop(this, this.tabHeaderRect!, this.children as (TabNode | TabGroupNode)[], dragNode, x, y, this.isHorizontal(), false);
            // a drop resolved into a group (its trailing line space) is already a complete drop; the
            // group ran its own canDockInto
            if (dropInfo !== undefined && dropInfo.node !== this) {
                return dropInfo;
            }
            if (!this.canDockInto(dragNode, dropInfo)) {
                return undefined;
            }
        } else if (this.getSelected() !== -1 && this.contentRect!.contains(x, y)) {
            const outlineRect = this.contentRect;
            dropInfo = new DropInfo(this, outlineRect!, dockLocation, -1, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
            if (!this.canDockInto(dragNode, dropInfo)) {
                return undefined;
            }
        }

        return dropInfo;
    }

    /** @internal */
    drop(dragNode: Node & IDraggable, location: DockLocation, index: number, select?: boolean): void {
        if (!(dragNode instanceof TabNode) && !(dragNode instanceof TabGroupNode)) {
            return; // borders can only contain tabs and groups (as in canDrop)
        }

        const selectedTab = this.getSelectedNode();
        const { dragParent, fromIndex } = detachDragNode(dragNode, this);

        // if dropping a tab back to the same border and moving to a forward position then reduce insertion index
        if (dragParent === this && fromIndex < index && index > 0) {
            index--;
        }

        // simple_bundled dock to existing tabset
        let insertPos = index;
        if (insertPos === -1) {
            insertPos = this.children.length;
        }

        this.addChild(dragNode, insertPos);

        if (dragNode instanceof TabGroupNode) {
            // move the whole group (with its tabs): keep the previously selected tab selected
            restoreSelectionAfterInsert(this, selectedTab);
        } else {
            restoreSelectionAfterInsert(this, selectedTab, select, dragNode);
        }

        this.model.tidy();
    }

    /** @internal */
    getSplitterBounds(useMinSize: boolean = false) {
        const pBounds = [0, 0];
        const rootRow = this.model.getRootRow(Model.MAIN_LAYOUT_ID)!;
        const innerRect = rootRow.getRect();
        // return locked bound when rect is empty (before first measure pass)
        if (innerRect.width === 0 && innerRect.height === 0) {
            return pBounds;
        }
        const minSize = useMinSize ? this.getMinSize() : 0;
        const maxSize = useMinSize ? this.getMaxSize() : 99999;
        const splitterSize = this.model.getSplitterSize()!;
        if (this.location === DockLocation.TOP) {
            pBounds[0] = this.tabHeaderRect!.getBottom() + minSize;
            const maxPos = this.tabHeaderRect!.getBottom() + maxSize;
            pBounds[1] = Math.max(pBounds[0], innerRect.getBottom() - rootRow.getMinHeight() - splitterSize);
            pBounds[1] = Math.min(pBounds[1], maxPos);
        } else if (this.location === DockLocation.LEFT) {
            pBounds[0] = this.tabHeaderRect!.getRight() + minSize;
            const maxPos = this.tabHeaderRect!.getRight() + maxSize;
            pBounds[1] = Math.max(pBounds[0], innerRect.getRight() - rootRow.getMinWidth() - splitterSize);
            pBounds[1] = Math.min(pBounds[1], maxPos);
        } else if (this.location === DockLocation.BOTTOM) {
            pBounds[1] = this.tabHeaderRect!.y - minSize - splitterSize;
            const maxPos = this.tabHeaderRect!.y - maxSize - splitterSize;
            pBounds[0] = Math.min(pBounds[1], innerRect.y + rootRow.getMinHeight());
            pBounds[0] = Math.max(pBounds[0], maxPos);
        } else if (this.location === DockLocation.RIGHT) {
            pBounds[1] = this.tabHeaderRect!.x - minSize - splitterSize;
            const maxPos = this.tabHeaderRect!.x - maxSize - splitterSize;
            pBounds[0] = Math.min(pBounds[1], innerRect.x + rootRow.getMinWidth());
            pBounds[0] = Math.max(pBounds[0], maxPos);
        }
        return pBounds;
    }

    /** @internal */
    calculateSplit(splitter: BorderNode, splitterPos: number) {
        const pBounds = this.getSplitterBounds();
        if (this.location === DockLocation.BOTTOM || this.location === DockLocation.RIGHT) {
            return Math.max(0, pBounds[1] - splitterPos);
        } else {
            return Math.max(0, splitterPos - pBounds[0]);
        }
    }

    /** @internal */
    getAttributeDefinitions() {
        return BorderNode.attributeDefinitions;
    }

    /** @internal */
    static getAttributeDefinitions() {
        Model.ensureAttributePairing();
        return BorderNode.attributeDefinitions;
    }

    /** @internal */
    private static createAttributeDefinitions(): Attributes {
        const attributeDefinitions = new Attributes();
        attributeDefinitions.add("type", BorderNode.TYPE, true).setType(Attribute.STRING).setFixed();

        attributeDefinitions.add("selected", -1).setType(Attribute.NUMBER).setDescription(`index of selected/visible tab in border; -1 means no tab selected`);
        attributeDefinitions
            .add("borderType", "split")
            .setType(Attribute.STRING)
            .setValues(["split", "overlay"])
            .setDescription(
                `the border display type: 'split' splits the main layout to make room when a tab is selected; 'overlay' shows
            the selected tab's panel as an overlay on top of the main layout area, and the tab is deselected
            by a pointer-down in the main layout area (Visual Studio style auto hide). Set via
            Actions.setBorderType. Not related to enableAutoHide (which hides the border strip when it has
            zero tabs)`,
            );
        attributeDefinitions.add("show", true).setType(Attribute.BOOLEAN).setDescription(`show/hide this border`);
        attributeDefinitions.add("config", undefined).setType("any").setDescription(`a place to hold json config used in your own code`);

        attributeDefinitions.addInherited("enableDrop", "borderEnableDrop").setDescription(`whether tabs can be dropped into this border`);
        attributeDefinitions.addInherited("className", "borderClassName").setDescription(`class applied to the border container`);
        attributeDefinitions.addInherited("autoSelectTabWhenOpen", "borderAutoSelectTabWhenOpen").setDescription(`whether to select new/moved tabs in border when the border is already open`);
        attributeDefinitions.addInherited("autoSelectTabWhenClosed", "borderAutoSelectTabWhenClosed").setDescription(`whether to select new/moved tabs in border when the border is currently closed`);
        attributeDefinitions.addInherited("size", "borderSize").setDescription(`size of the tab area when selected`);
        attributeDefinitions.addInherited("minSize", "borderMinSize").setDescription(`the minimum size of the tab area`);
        attributeDefinitions.addInherited("maxSize", "borderMaxSize").setDescription(`the maximum size of the tab area`);
        attributeDefinitions.addInherited("enableAutoHide", "borderEnableAutoHide").setDescription(
            `hide border if it has zero tabs; not related to the borderType 'overlay' mode (Visual Studio
            style auto hide), see the borderType attribute`,
        );
        attributeDefinitions.addInherited("enableTabScrollbar", "borderEnableTabScrollbar").setDescription(`whether to show a mini scrollbar for the tabs`);
        return attributeDefinitions;
    }
}
