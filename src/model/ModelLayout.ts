import { Rect } from "./Rect";
import { IJsonSubLayout, ISubLayoutAttributes } from "./IJsonModel";
import { Model } from "./Model";
import { RowNode } from "./RowNode";
import { Node } from "./Node";
import { TabSetNode } from "./TabSetNode";
import { LayoutController } from "../view/layout/LayoutInternal";
import { ILayoutType } from "./IJsonModel";
import { Attribute } from "./Attributes";
import { Attributes } from "./Attributes";

/**
 * A layout within the model: the main layout, a sublayout hosted in a tab, or a popout
 * (a native window or floating panel) layout. Layouts are passed to the popout props
 * ({@link ILayoutProps.renderPopoutContent}, {@link ILayoutProps.onPopoutOpen},
 * {@link ILayoutProps.onPopoutClose}) and are also reachable from the model's layout map
 * (see {@link Model}).
 */
export class ModelLayout {
    private _layoutId: string;
    private _type: ILayoutType;
    private _rect: Rect;
    private _path: string;
    /** @internal */
    private attributes: Record<string, any>;

    private _controller: LayoutController | undefined;
    private _rootRow?: RowNode | undefined;
    private _maximizedTabSet?: TabSetNode | undefined;
    private _activeTabSet?: TabSetNode | undefined;
    private _toExportRectFunction: (rect: Rect, type: ILayoutType) => Rect;

    /** @internal */
    private static attributeDefinitions: Attributes = ModelLayout.createAttributeDefinitions();

    constructor(layoutId: string, subLayoutId: number, type: ILayoutType, rect: Rect, json?: IJsonSubLayout) {
        this.attributes = {};
        ModelLayout.attributeDefinitions.fromJson(json ?? {}, this.attributes);
        this._layoutId = layoutId;
        this._type = type;
        this._rect = rect;
        this._toExportRectFunction = (r, _type) => r;
        if (layoutId === Model.MAIN_LAYOUT_ID) {
            this._path = "";
        } else {
            this._path = "/sublayout" + subLayoutId;
        }
    }

    /** the path of this layout within the model, e.g. `/sublayout1` */
    getPath() {
        return this._path;
    }

    /** visit every node in this layout's tree */
    visitNodes(fn: (node: Node, level: number) => void) {
        this.getRootRow()?.forEachNode(fn, 0);
    }

    /** whether this is the main layout */
    isMainLayout() {
        return this._layoutId === Model.MAIN_LAYOUT_ID;
    }

    /** the id of this layout */
    getLayoutId(): string {
        return this._layoutId;
    }

    /** the type of this layout: `window`, `float` or `tab` */
    getType(): ILayoutType {
        return this._type;
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
        return this._rect;
    }

    /** the browser window this layout is rendered in (the popout window for a popout layout) */
    getWindow(): Window | undefined {
        return this._controller?.getCurrentWindow();
    }

    /** @internal */
    setType(value: ILayoutType) {
        this._type = value;
    }

    /** @internal */
    getController(): LayoutController | undefined {
        return this._controller;
    }

    /** @internal */
    getRootRow(): RowNode | undefined {
        return this._rootRow;
    }

    /** @internal */
    getMaximizedTabSet(): TabSetNode | undefined {
        return this._maximizedTabSet;
    }

    /** @internal */
    getActiveTabSet(): TabSetNode | undefined {
        return this._activeTabSet;
    }

    /** @internal */
    setRect(value: Rect) {
        this._rect = value;
    }

    /** @internal */
    setController(value: LayoutController | undefined) {
        this._controller = value;
    }

    /** @internal */
    getWindowId(): string | undefined {
        return this._controller?.getWindowId();
    }

    /** @internal */
    setRootRow(rowNode: RowNode | undefined) {
        rowNode?.setLayout(this);
        this._rootRow = rowNode;
    }

    /** @internal */
    setMaximizedTabSet(value: TabSetNode | undefined) {
        this._maximizedTabSet = value;
    }

    /** @internal */
    setActiveTabSet(value: TabSetNode | undefined) {
        this._activeTabSet = value;
    }

    /** @internal */
    getToExportRectFunction(): (rect: Rect, type: ILayoutType) => Rect {
        return this._toExportRectFunction!;
    }

    /** @internal */
    setToExportRectFunction(value: (rect: Rect, type: ILayoutType) => Rect) {
        this._toExportRectFunction = value;
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
