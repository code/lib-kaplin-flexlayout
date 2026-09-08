import { Attribute, Attributes } from "./Attributes";
import { DockLocation } from "./DockLocation";
import { DropInfo } from "./DropInfo";
import { Rect } from "./Rect";
import { CLASSES } from "../CSSClassNames";
import { IDraggable } from "./IDraggable";
import { IDropTarget } from "./IDropTarget";
import { ITabGroupAttributes, IJsonTabGroupNode } from "./IJsonModel";
import { Model } from "./Model";
import { Node } from "./Node";
import { TabNode } from "./TabNode";
import { TabSetNode } from "./TabSetNode";
import { BorderNode } from "./BorderNode";

/** @internal the default group color, matching --fl-color-tabgroup-default in the themes */
const DEFAULT_TAB_GROUP_COLOR = "#9e9e9e";

/**
 * A group of tabs rendered as a colored pill in a tab strip (Chrome style). A group is a child of
 * a {@link TabSetNode} or {@link BorderNode} and holds {@link TabNode} children; it has a name, a
 * color and an opened/closed (collapsed) state. When closed only the pill is shown.
 */
export class TabGroupNode extends Node implements IDraggable, IDropTarget {
    static readonly TYPE = "tabgroup";

    /** @internal */
    static fromJson(json: IJsonTabGroupNode, model: Model) {
        const newLayoutNode = new TabGroupNode(model, json);
        if (json.children != null) {
            for (const jsonChild of json.children) {
                const child = TabNode.fromJson(jsonChild, model);
                newLayoutNode.addChild(child);
            }
        }
        return newLayoutNode;
    }

    /** @internal */
    private static attributeDefinitions: Attributes = TabGroupNode.createAttributeDefinitions();

    /** @internal */
    private pillRect: Rect = Rect.empty();
    /** @internal */
    private endMarkerRect: Rect = Rect.empty();

    /** @internal
     *  The group's base `rect` (inherited from Node) is set by the layout engine to the *drop
     *  region* — the union of pill + tabs + end marker — not the pill alone. The pill and end
     *  marker have their own measured rects (`pillRect`, `endMarkerRect`) which are reconciled
     *  into `rect` via {@link getDropRegion} after all child rects are current. */

    /** @internal */
    constructor(model: Model, json: IJsonTabGroupNode) {
        super(model);
        TabGroupNode.attributeDefinitions.fromJson(json, this.attributes);
        model.addNode(this);
    }

    getName() {
        return this.model.translate(this.getAttr("name") as string) as string;
    }

    getColor() {
        return this.getAttr("color") as string;
    }

    isOpened() {
        return this.getAttr("opened") as boolean;
    }

    /** @internal */
    setOpened(opened: boolean) {
        this.attributes.opened = opened;
    }

    isEnableDrag() {
        return this.getAttr("enableDrag") as boolean;
    }

    /** @internal */
    getPillRect() {
        return this.pillRect;
    }

    /** @internal */
    setPillRect(rect: Rect) {
        this.pillRect = rect;
    }

    /** @internal */
    getEndMarkerRect() {
        return this.endMarkerRect;
    }

    /** @internal */
    setEndMarkerRect(rect: Rect) {
        this.endMarkerRect = rect;
    }

    /** @internal */
    getTabContainer(): TabSetNode | BorderNode {
        return this.getParent() as TabSetNode | BorderNode;
    }

    /** @internal whether an end-marker rect participates in the group's geometry: the end marker is
     *  only rendered (and measured) in splitpill mode, so its rect must be ignored in underline mode
     *  even if a stale measurement from before a tabGroupType switch is still stored. */
    private hasEndMarker(): boolean {
        return this.model.getTabGroupType() === "splitpill" && this.endMarkerRect.width > 0;
    }

    /** @internal the drop region of this group in the strip: the pill plus (when open) its tab
     *  buttons plus the end marker. The result is written to the group's base `rect` (Node.getRect)
     *  by the layout reconciliation pass and is used for the drop *outline* (a bounding shape).
     *  Point-containment is NOT based on this rect (it is a union that spans the gaps between
     *  wrapped lines) but on {@link contains}. */
    getDropRegion(): Rect {
        let r = this.pillRect.clone();
        if (this.isOpened()) {
            for (const child of this.children) {
                const t = (child as TabNode).getTabRect();
                if (t !== undefined) {
                    r = union(r, t);
                }
            }
            if (this.hasEndMarker()) {
                r = union(r, this.endMarkerRect);
            }
        }
        return r;
    }

    /** @internal the group's elements (pill, opened tab buttons, end marker) in flow order. */
    private getFlowRects(): Rect[] {
        const rects: Rect[] = [this.pillRect];
        if (this.isOpened()) {
            for (const child of this.children) {
                const t = (child as TabNode).getTabRect();
                if (t !== undefined) {
                    rects.push(t);
                }
            }
            if (this.hasEndMarker()) {
                rects.push(this.endMarkerRect);
            }
        }
        return rects;
    }

    /** @internal the rect anchoring the group-reorder outline: the pill for a drop before the group,
     *  the group's last element (its end) for a drop after it. Using the group's true start/end rather
     *  than an arbitrary wrapped line's edge keeps the outline unambiguous when the group spans several
     *  lines (an outline at a mid-group line end reads as "into the group" while the drop reorders after
     *  the whole group). */
    getReorderBoundary(before: boolean): Rect {
        const container = this.getTabContainer();
        const isLeftUp = container instanceof BorderNode && container.getLocation() === DockLocation.LEFT && this.model.getBorderLeftTabDirection() !== "down";
        if (isLeftUp) {
            if (before) {
                if (this.hasEndMarker()) {
                    return this.endMarkerRect;
                }
                const tabs = this.getChildren() as TabNode[];
                if (tabs.length > 0) {
                    const lastTab = tabs[tabs.length - 1].getTabRect();
                    if (lastTab) {
                        return lastTab;
                    }
                }
                return this.pillRect;
            } else {
                return this.pillRect;
            }
        }
        if (before) {
            return this.pillRect;
        }
        const rects = this.getFlowRects();
        return rects.length > 0 ? rects[rects.length - 1] : this.pillRect;
    }

    /** @internal the group's elements partitioned into visual lines, in flow order. A line is the set
     *  of elements whose bands overlap: the pill, tab buttons and end marker can sit at slightly
     *  different y offsets on the same row, and a wrapped line starts below the previous line's
     *  bottom. This is the single source of truth for the group's line geometry. */
    getLines(): Rect[][] {
        const container = this.getTabContainer();
        const vertical = container instanceof BorderNode && container.isHorizontal();
        const lines: Rect[][] = [];
        let bandStart: number | undefined;
        let bandEnd: number | undefined;
        for (const r of this.getFlowRects()) {
            const start = vertical ? r.x : r.y;
            const end = vertical ? r.getRight() : r.getBottom();
            if (bandStart !== undefined && start < bandEnd! + 0.5) {
                lines[lines.length - 1].push(r);
                bandEnd = Math.max(bandEnd!, end);
            } else {
                lines.push([r]);
                bandStart = start;
                bandEnd = end;
            }
        }
        return lines;
    }

    /** @internal the union rect of each line (for a single line this is the same as
     *  {@link getDropRegion}). The union spans the gaps/dividers between the group's own elements on
     *  the line, but not the inter-line gaps. Used for hit testing ({@link contains}) and for placing
     *  the drop indicator. */
    getLineRects(): Rect[] {
        return this.getLines().map((line) => line.reduce((a, b) => union(a, b)));
    }

    /** @internal point-containment test for this group in the tab strip. A point is inside the group
     *  when it falls within any of its line rects ({@link getLineRects}), i.e. on an element or in the
     *  gap between two of the group's own elements on the same line (the gap covers the dividers). This
     *  correctly handles tabs that wrap onto multiple lines, unlike a single bounding union which spans
     *  the gaps between lines and over adjacent groups. */
    contains(x: number, y: number): boolean {
        return this.getLineRects().some((r) => r.contains(x, y));
    }

    /** @internal the bounding rect of the group's elements on the strip line that contains the given
     *  point, or undefined when the point is not within any of the group's lines (an inter-line gap).
     *  For a horizontal strip a line is the set of elements sharing a y-band; for a vertical strip the
     *  set sharing an x-band. The tabset/border reorder logic uses this instead of {@link getDropRegion}
     *  so the before/after-group indicator stays on the correct line when tabs wrap (a wrapped group's
     *  bounding union spans every line, which pins the indicator to the strip's start or end). */
    getLineRectAt(x: number, y: number): Rect | undefined {
        const container = this.getTabContainer();
        const vertical = container instanceof BorderNode && container.isHorizontal();
        return this.getLineRects().find((r) => (vertical ? r.x <= x && x <= r.getRight() : r.y <= y && y <= r.getBottom()));
    }

    /** @internal override hit-testing so a wrapped group's containment uses {@link contains} (line
     *  aware) instead of the bounding-union rect inherited from Node. */
    findDropTargetNode(layoutId: string, dragNode: Node & IDraggable, x: number, y: number, excludeCenter: boolean = false): DropInfo | undefined {
        if (!this.contains(x, y)) {
            return undefined;
        }
        if (this.model.getMaximizedTabset(layoutId) !== undefined) {
            return this.model.getMaximizedTabset(layoutId)!.canDrop(dragNode, x, y, excludeCenter);
        }
        const rtn = this.canDrop(dragNode, x, y, excludeCenter);
        if (rtn !== undefined) {
            return rtn;
        }
        for (const child of this.children) {
            const rtnChild = child.findDropTargetNode(layoutId, dragNode, x, y, excludeCenter);
            if (rtnChild !== undefined) {
                return rtnChild;
            }
        }
        return undefined;
    }

    toJson(): IJsonTabGroupNode {
        const json: any = {};
        TabGroupNode.attributeDefinitions.toJson(json, this.attributes);
        json.children = this.children.map((child) => child.toJson());
        return json;
    }

    /** @internal remove a child tab; auto-deletes the group when the last tab leaves */
    remove(tab: TabNode) {
        this.removeChild(tab);
        const tabset = this.getTabContainer();
        if (this.getChildren().length === 0) {
            tabset.removeChild(this);
        }
        tabset.repairSelected();
        this.model.tidy();
    }

    /** @internal */
    canDrop(dragNode: Node & IDraggable, x: number, y: number, _excludeCenter: boolean = false): DropInfo | undefined {
        if (!(dragNode instanceof TabNode) || dragNode.isPinned()) {
            return undefined;
        }

        let dropInfo;
        const tabs = this.getChildren() as TabNode[];
        if (this.pillRect.contains(x, y)) {
            // dropping on the pill adds the tab to the group (at the start)
            dropInfo = new DropInfo(this, this.pillRect.clone(), DockLocation.CENTER, 0, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
        } else if (tabs.length > 0) {
            // tabs flow left-to-right (tabset / top / bottom border) or top-to-bottom (left / right border)
            const container = this.getTabContainer();
            if (container instanceof BorderNode && container.isHorizontal()) {
                // left/right border: tabs flow top-to-bottom, the drop outline is a horizontal bar
                if (this.isOpened()) {
                    const isLeftUp = container.getLocation() === DockLocation.LEFT && this.model.getBorderLeftTabDirection() !== "down";
                    if (isLeftUp) {
                        // left border reading up: visual order is reversed (endMarker top, tabs reversed, pill bottom)
                        const revTabs = [...tabs].reverse();
                        let r: Rect | undefined;
                        let xx = 0;
                        let w = 0;
                        let p: number;
                        if (this.hasEndMarker()) {
                            p = this.endMarkerRect.getBottom();
                        } else if (revTabs.length > 0) {
                            const first = revTabs[0].getTabRect();
                            p = first ? first.y : this.pillRect.y;
                        } else {
                            p = this.pillRect.y;
                        }
                        for (let vi = 0; vi < revTabs.length; vi++) {
                            r = revTabs[vi].getTabRect();
                            if (vi === 0) {
                                xx = r.x;
                                w = r.width;
                            }
                            const childCenter = r.y + r.height / 2;
                            if (p <= y && y < childCenter && r.x < x && x < r.getRight()) {
                                const logicalIndex = tabs.length - vi;
                                const outlineRect = new Rect(r.x, r.y - 2, r.width, 3);
                                dropInfo = new DropInfo(this, outlineRect, DockLocation.CENTER, logicalIndex, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                                break;
                            }
                            p = childCenter;
                        }
                        if (dropInfo === undefined && r !== undefined && y >= p && y < this.pillRect.y && x >= r.x && x < r.getRight()) {
                            const outlineRect = new Rect(xx, r.getBottom() - 2, w, 3);
                            dropInfo = new DropInfo(this, outlineRect, DockLocation.CENTER, 0, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                        }
                    } else {
                        let r: Rect | undefined;
                        let xx = 0;
                        let w = 0;
                        let p = this.pillRect.getBottom();
                        for (let i = 0; i < tabs.length; i++) {
                            r = tabs[i].getTabRect();
                            if (i === 0) {
                                xx = r.x;
                                w = r.width;
                            }
                            const childCenter = r.y + r.height / 2;
                            if (p <= y && y < childCenter && r.x < x && x < r.getRight()) {
                                const outlineRect = new Rect(r.x, r.y - 2, r.width, 3);
                                dropInfo = new DropInfo(this, outlineRect, DockLocation.CENTER, i, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                                break;
                            }
                            p = childCenter;
                        }
                        if (dropInfo === undefined && r !== undefined && y >= p && y <= r.getBottom() && x >= r.x && x < r.getRight()) {
                            const outlineRect = new Rect(xx, r.getBottom() - 2, w, 3);
                            dropInfo = new DropInfo(this, outlineRect, DockLocation.CENTER, tabs.length, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                        }
                    }
                }
            } else {
                // tabset or top/bottom border: tabs flow left-to-right, the drop outline is a
                // vertical bar. The group's elements are partitioned into lines ({@link getLines});
                // only the line under the cursor is walked, so wrapped tabs and the space just after
                // the start pill behave exactly like a single-line strip.
                const lines = this.getLines();
                const lineIndex = lines.findIndex((line) => line.some((r) => r.y <= y && y <= r.getBottom()));
                if (lineIndex !== -1) {
                    const line = lines[lineIndex];
                    const lineRect = line.reduce((a, b) => union(a, b));
                    const hasPill = line.indexOf(this.pillRect) !== -1;
                    const lineTabs = line.filter((r) => r !== this.pillRect && r !== this.endMarkerRect);
                    if (this.isOpened()) {
                        if (lineTabs.length === 0) {
                            // the pill is the only group element on its line (its tabs wrapped onto
                            // the next line): dropping past the pill still adds the tab to the group
                            if (hasPill && x >= this.pillRect.getRight()) {
                                dropInfo = new DropInfo(this, this.pillRect.clone(), DockLocation.CENTER, 0, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                            }
                        } else {
                            // flat index of the first tab on this line = the number of tabs on earlier lines
                            let lineStartIndex = 0;
                            for (let li = 0; li < lineIndex; li++) {
                                lineStartIndex += lines[li].filter((r) => r !== this.pillRect && r !== this.endMarkerRect).length;
                            }
                            let p = hasPill ? this.pillRect.getRight() : lineRect.x;
                            for (let j = 0; j < lineTabs.length; j++) {
                                const tr = lineTabs[j];
                                const childCenter = tr.x + tr.width / 2;
                                if (p <= x && x < childCenter) {
                                    const outlineRect = new Rect(tr.x - 2, lineRect.y, 3, lineRect.height);
                                    dropInfo = new DropInfo(this, outlineRect, DockLocation.CENTER, lineStartIndex + j, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                                    break;
                                }
                                if (j === lineTabs.length - 1 && x >= childCenter) {
                                    // after the last tab on this line: insert before the next line's
                                    // first tab (or append to the group)
                                    const outlineRect = new Rect(tr.getRight() - 2, lineRect.y, 3, lineRect.height);
                                    dropInfo = new DropInfo(this, outlineRect, DockLocation.CENTER, lineStartIndex + j + 1, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                                }
                                p = childCenter;
                            }
                        }
                    } else {
                        // closed group: only the pill is shown; dropping past it on its line still
                        // adds the tab to the group (at the start)
                        if (x >= this.pillRect.getRight()) {
                            dropInfo = new DropInfo(this, this.pillRect.clone(), DockLocation.CENTER, 0, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
                        }
                    }
                }
            }
        }

        if (dropInfo !== undefined && !this.canDockInto(dragNode, dropInfo)) {
            return undefined;
        }

        return dropInfo;
    }

    /** @internal */
    drop(dragNode: Node, location: DockLocation, index: number, select?: boolean) {
        if (!(dragNode instanceof TabNode) || dragNode.isPinned()) {
            return; // groups only accept unpinned tabs (as in canDrop)
        }

        const dragParent = dragNode.getParent() as TabSetNode | BorderNode | TabGroupNode | undefined;
        const tabset = this.getTabContainer();
        const selectedTab = tabset.getSelectedNode();
        let fromIndex = 0;
        if (dragParent !== undefined) {
            if (dragParent instanceof TabGroupNode) {
                fromIndex = dragParent.getChildren().indexOf(dragNode);
                if (dragParent === this) {
                    // intra-group reorder: avoid auto-deleting the group when the last tab is
                    // temporarily removed (single-tab self-drop would orphan the group)
                    dragParent.removeChild(dragNode);
                } else {
                    dragParent.remove(dragNode);
                }
            } else if (dragParent instanceof TabSetNode || dragParent instanceof BorderNode) {
                dragParent.removeChild(dragNode);
                dragParent.repairSelected();
            }
        }

        // dropping a tab back into the same group at a forward position: the removal above shifted
        // the indices, so the insertion index is one less than the drop slot it was computed against
        if (dragParent === this && fromIndex < index && index > 0) {
            index--;
        }

        let insertPos = index;
        if (insertPos === -1) {
            insertPos = this.children.length;
        }
        insertPos = Math.max(0, Math.min(insertPos, this.children.length));

        this.addChild(dragNode, insertPos);
        if (!this.isOpened()) {
            this.setOpened(true);
        }

        if (select || (select !== false && tabset.isAutoSelectTab())) {
            tabset.setSelected(tabset.getTabNodes().indexOf(dragNode));
        } else if (selectedTab !== undefined) {
            const newIndex = tabset.getTabNodes().indexOf(selectedTab);
            if (newIndex === -1) {
                tabset.repairSelected(); // selected tab moved into a closed group
            } else {
                tabset.setSelected(newIndex);
            }
        } else {
            tabset.repairSelected();
        }
        if (tabset instanceof TabSetNode) {
            this.model.setActiveTabset(tabset, tabset.getLayoutId());
        }

        this.model.tidy();
    }

    /** @internal */
    isEnableDrop() {
        return true;
    }

    /** @internal */
    updateAttrs(json: ITabGroupAttributes) {
        TabGroupNode.attributeDefinitions.update(json, this.attributes);
    }

    /** @internal */
    getAttributeDefinitions() {
        return TabGroupNode.attributeDefinitions;
    }

    /** @internal */
    static getAttributeDefinitions() {
        Model.ensureAttributePairing();
        return TabGroupNode.attributeDefinitions;
    }

    /** @internal */
    private static createAttributeDefinitions(): Attributes {
        const attributeDefinitions = new Attributes();
        attributeDefinitions.add("type", TabGroupNode.TYPE, true).setType(Attribute.STRING).setFixed();
        attributeDefinitions.add("id", undefined).setType(Attribute.STRING).setDescription(`the unique id of the group, if left undefined a uuid will be assigned`);
        attributeDefinitions.add("name", "flexlayout.ui.group.default.name").setType(Attribute.STRING).setDescription(`the name of the group shown in its pill`);
        attributeDefinitions.add("color", DEFAULT_TAB_GROUP_COLOR).setType(Attribute.STRING).setDescription(`the color of the group pill and the underline of its tabs (a css color)`);
        attributeDefinitions.add("opened", true).setType(Attribute.BOOLEAN).setDescription(`whether the group is expanded to show its tabs; when false only the pill is shown`);
        attributeDefinitions.add("enableDrag", true).setType(Attribute.BOOLEAN).setDescription(`whether the user can drag the group pill to a new location`);
        attributeDefinitions.add("config", undefined).setType("any").setDescription(`a place to hold json config used in your own code`);

        return attributeDefinitions;
    }
}

/** @internal */
function union(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.getRight(), b.getRight());
    const bottom = Math.max(a.getBottom(), b.getBottom());
    return new Rect(x, y, right - x, bottom - y);
}
