import { Rect } from "./Rect";
import { IJsonSubLayout, ISubLayoutAttributes } from "./IJsonModel";
import { Model } from "./Model";
import { RowNode } from "./RowNode";
import { Node } from "./Node";
import { TabNode } from "./TabNode";
import { TabSetNode } from "./TabSetNode";
import { ILayoutType } from "./IJsonModel";
import { Attribute } from "./Attributes";
import { Attributes } from "./Attributes";
import { ILayoutController } from "./ILayoutController";

/**
 * A layout within the model: the main layout, a sublayout hosted in a tab, or a popout
 * (a native window or floating panel) layout. Layouts are passed to the popout props
 * ({@link ILayoutProps.renderPopoutContent}, {@link ILayoutProps.onPopoutOpen},
 * {@link ILayoutProps.onPopoutClose}) and are also reachable from the model's layout map
 * (see {@link Model}).
 */
export class ModelLayout {
    /** @internal */
    private layoutId: string;
    /** @internal */
    private type: ILayoutType;
    /** @internal */
    private rect: Rect;
    /** @internal */
    private path: string;
    /** @internal */
    private attributes: Record<string, any>;

    private controller: ILayoutController | undefined;
    /** @internal */
    private rootRow?: RowNode | undefined;
    /** @internal */
    private maximizedTabSet?: TabSetNode | undefined;
    /** @internal */
    private activeTabSet?: TabSetNode | undefined;
    /** @internal */
    private toExportRectFunction: (rect: Rect, type: ILayoutType) => Rect;

    /** @internal */
    private static attributeDefinitions: Attributes = ModelLayout.createAttributeDefinitions();

    constructor(layoutId: string, subLayoutId: number, type: ILayoutType, rect: Rect, json?: IJsonSubLayout) {
        this.attributes = {};
        ModelLayout.attributeDefinitions.fromJson(json ?? {}, this.attributes);
        this.layoutId = layoutId;
        this.type = type;
        this.rect = rect;
        this.toExportRectFunction = (r, _type) => r;
        if (layoutId === Model.MAIN_LAYOUT_ID) {
            this.path = "";
        } else {
            this.path = "/sublayout" + subLayoutId;
        }
    }

    /** the path of this layout within the model, e.g. `/sublayout1` */
    getPath() {
        return this.path;
    }

    /** visit every node in this layout's tree */
    visitNodes(fn: (node: Node, level: number) => void) {
        this.getRootRow()?.forEachNode(fn, 0);
    }

    /** whether this is the main layout */
    isMainLayout() {
        return this.layoutId === Model.MAIN_LAYOUT_ID;
    }

    /** @internal */
    findParentLayout(): ModelLayout | undefined {
        let parentLayout: ModelLayout | undefined = undefined;
        const model = this.getController()!.getModel();
        model.visitNodes((node) => {
            if (node instanceof TabNode && node.getSubLayoutId() === this.getLayoutId()) {
                parentLayout = node.getLayout();
            }
        });
        return parentLayout;
    }

    /** @internal */
    canDockTo(node: Node): boolean {
        const type = this.getType();
        if (type === "window") {
            return node.isAllowedInWindow();
        } else if (type === "float") {
            return true;
        } else if (type === "tab") {
            const parentLayout = this.findParentLayout();
            if (parentLayout && parentLayout.getType() === "window" && !parentLayout.isMainLayout() && !node.isAllowedInWindow()) {
                return false;
            }
            // a tab sublayout cannot host tabs (or rows of tabs) that carry their own sublayout
            if (containsTabSublayout(node)) {
                return false;
            }
            return true;
        }
        return false;
    }

    /** the id of this layout */
    getLayoutId(): string {
        return this.layoutId;
    }

    /** the type of this layout: `window`, `float` or `tab` */
    getType(): ILayoutType {
        return this.type;
    }

    /** the name of this layout, e.g. as shown in the model explorer; undefined if not set */
    getName(): string | undefined {
        return this.getAttr("name") as string | undefined;
    }

    /** @internal */
    getAttr(name: string) {
        return this.attributes[name];
    }

    /** @internal */
    getAttributeDefinitions() {
        return ModelLayout.attributeDefinitions;
    }

    /** @internal */
    updateAttrs(json: ISubLayoutAttributes) {
        ModelLayout.attributeDefinitions.update(json, this.attributes);
    }

    /** the rectangle of this layout (popout windows/floating panels) */
    getRect(): Rect {
        return this.rect;
    }

    /** the browser window this layout is rendered in (the popout window for a popout layout) */
    getWindow(): Window | undefined {
        return this.controller?.getCurrentWindow();
    }

    /** @internal */
    setType(value: ILayoutType) {
        this.type = value;
    }

    /** @internal */
    getController(): ILayoutController | undefined {
        return this.controller;
    }

    /** @internal */
    getRootRow(): RowNode | undefined {
        return this.rootRow;
    }

    /** @internal */
    getMaximizedTabSet(): TabSetNode | undefined {
        return this.maximizedTabSet;
    }

    /** @internal */
    getActiveTabSet(): TabSetNode | undefined {
        return this.activeTabSet;
    }

    /** @internal */
    setRect(value: Rect) {
        this.rect = value;
    }

    /** @internal */
    setController(value: ILayoutController | undefined) {
        this.controller = value;
    }

    /** @internal */
    getWindowId(): string | undefined {
        return this.controller?.getWindowId();
    }

    /** @internal */
    setRootRow(rowNode: RowNode | undefined) {
        rowNode?.setLayout(this);
        this.rootRow = rowNode;
    }

    /** @internal */
    setMaximizedTabSet(value: TabSetNode | undefined) {
        this.maximizedTabSet = value;
    }

    /** @internal */
    setActiveTabSet(value: TabSetNode | undefined) {
        this.activeTabSet = value;
    }

    /** @internal */
    getToExportRectFunction(): (rect: Rect, type: ILayoutType) => Rect {
        return this.toExportRectFunction!;
    }

    /** @internal */
    setToExportRectFunction(value: (rect: Rect, type: ILayoutType) => Rect) {
        this.toExportRectFunction = value;
    }

    /** @internal */
    static getAttributeDefinitions() {
        return ModelLayout.attributeDefinitions;
    }

    /** @internal */
    private static createAttributeDefinitions(): Attributes {
        const attributeDefinitions = new Attributes();
        attributeDefinitions.add("name", undefined).setType(Attribute.STRING).setDescription(`the name of the sub layout, e.g. as shown in the model explorer`);
        return attributeDefinitions;
    }

    /** @internal */
    toJson(): IJsonSubLayout {
        // chrome sets top,left to large -ve values when minimized, dont save in this case
        if (this.getType() === "window" && this.getWindow() && this.getWindow()!.screenTop > -10000) {
            this.setRect(new Rect(this.getWindow()!.screenLeft, this.getWindow()!.screenTop, this.getWindow()!.outerWidth, this.getWindow()!.outerHeight));
        }

        const json: IJsonSubLayout = {
            type: this.getType(),
            layout: this.getRootRow()!.toJson(),
            rect: this.getType() === "tab" ? undefined : this.getRect().toJson(),
        };
        ModelLayout.attributeDefinitions.toJson(json, this.attributes);
        return json;
    }

    /** @internal */
    static fromJson(layoutJson: IJsonSubLayout, model: Model, layoutId: string): ModelLayout {
        const count = model.getLayouts().size;
        const rect = layoutJson.rect ? Rect.fromJson(layoutJson.rect) : new Rect(50 + 50 * count, 50 + 50 * count, 600, 400);
        // round to whole pixels; drift across save/restore cycles is prevented by the popout window
        // converging on its saved metrics after opening (see PopoutWindow)
        rect.snap(1);
        const subLayoutId = layoutId === Model.MAIN_LAYOUT_ID ? 0 : model.getNextSubLayoutId();

        const layout = new ModelLayout(layoutId, subLayoutId, layoutJson.type || "window", rect, layoutJson);
        layout.setRootRow(RowNode.fromJson(layoutJson.layout, model, layout));

        return layout;
    }
}

function containsTabSublayout(node: Node): boolean {
    if (node instanceof TabNode) {
        return node.getSubLayoutId() !== undefined;
    }
    return node.getChildren().some((child) => containsTabSublayout(child));
}
