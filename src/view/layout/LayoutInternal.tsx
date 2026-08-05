import * as React from "react";
import { createPortal } from "react-dom";
import { DockLocation } from "../../model/DockLocation";
import { I18nLabel } from "../I18nLabel";
import { Rect } from "../../model/Rect";
import { CLASSES } from "../CSSClassNames";
import { Action } from "../../model/Actions";
import { Actions } from "../../model/Actions";
import { GroupAction } from "../../model/Actions";
import { BorderNode } from "../../model/BorderNode";
import { IJsonTabNode } from "../../model/IJsonModel";
import { Model } from "../../model/Model";
import { Node } from "../../model/Node";
import { RowNode } from "../../model/RowNode";
import { ILayoutType } from "../../model/IJsonModel";
import { TabNode } from "../../model/TabNode";
import { TabSetNode } from "../../model/TabSetNode";
import { AsterickIcon, CloseIcon, EdgeIcon, MaximizeIcon, OverflowIcon, PinIcon, PopoutIcon, PopoutFloatIcon, RestoreIcon } from "../Icons";
import { Overlay } from "../Overlay";
import { Row } from "../Row";
import { Tab } from "../Tab";
import { domId, enablePointerOnIFrames, isDesktop, copyInlineStyles, matchesKey, resolveKeyMap, Utils_dragging } from "../Utils";
import { ModelLayout } from "../../model/ModelLayout";
import { TabContentRenderer } from "../TabContentRenderer";
import { DragDropManager } from "./DragDropManager";
import { EdgeIndicators } from "./EdgeIndicators";
import { FloatingWindowContainer } from "./FloatingWindowContainer";
import { BorderContainer } from "./BorderContainer";
import { ITabSetRenderValues, ITabRenderValues, IIcons, IKeyMap } from "./LayoutTypes";
import { ILayoutProps } from "../Layout";
import { randomUUID } from "../../model/Utils";
import { DragTabButton } from "../DragTabButton";

/** @internal */
export type MeasurableKind = "row" | "tabset" | "tabstrip" | "tabsetcontent" | "tabbutton" | "borderheader" | "bordercontent";

/** @internal */
export interface ILayoutInternalProps extends ILayoutProps {
    parentRedrawRevision: object;

    // used only for sublayouts:
    layoutId?: string;
    path?: string;
    mainLayoutController?: LayoutController;
}

/** @internal */
export interface ILayoutInternalState {
    editingTab?: TabNode;
    showEdges: boolean;
    showOverlay: boolean;
    calculatedBorderBarSize: number;
    // trigger only - its value is never read; bumping it re-renders the layout structure
    // (memoized tab contents are NOT invalidated, unlike fullRedrawRevision, whose value is
    // compared in TabContentRenderer's memo)
    layoutRedrawRevision: number;
    fullRedrawRevision: number;
    showHiddenBorder: DockLocation;
}

/** @internal */
export const LayoutInternal = React.forwardRef<LayoutController, ILayoutInternalProps>((props, ref) => {
    LayoutInternal.displayName = "LayoutInternal"; // name in react dev tools

    const [state, setStateRaw] = React.useState<ILayoutInternalState>({
        editingTab: undefined,
        showEdges: false,
        showOverlay: false,
        calculatedBorderBarSize: 29,
        layoutRedrawRevision: 0,
        fullRedrawRevision: 0,
        showHiddenBorder: DockLocation.CENTER, // using center indicates no hidden border
    });

    const setState = React.useCallback(
        (update: Partial<ILayoutInternalState> | ((prevState: ILayoutInternalState, props: ILayoutInternalProps) => Partial<ILayoutInternalState>)) => {
            setStateRaw((prev) => ({
                ...prev,
                ...(typeof update === "function" ? update(prev, props) : update),
            }));
        },
        [props],
    );

    const layoutRef = React.useRef<HTMLDivElement>(null); // ref of layout container
    // bumped when this layout's element is adopted into a different document (tab moved between
    // windows), so the document-scoped listeners below re-run against the new document
    const [documentVersion, setDocumentVersion] = React.useState(0);
    const moveablesHomeRef = React.useRef<HTMLDivElement>(null);
    const findBorderBarSizeRef = React.useRef<HTMLDivElement>(null);
    const findSplitterSizeRef = React.useRef<HTMLDivElement>(null);
    const mainRef = React.useRef<HTMLDivElement>(null); // ref of border container

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const controller = React.useMemo(() => new LayoutController(props, state, setState), []);

    // keep controller in sync with latest props/state/refs
    controller.setProps(props);
    controller.setStateRaw(state);
    controller.setSetState(setState);
    controller.setLayoutRef(layoutRef);
    controller.setMoveablesHomeRef(moveablesHomeRef);
    controller.setFindBorderBarSizeRef(findBorderBarSizeRef);
    controller.setFindSplitterSizeRef(findSplitterSizeRef);
    controller.setMainRef(mainRef);

    // need to update layout controller incase model is
    const layout = props.model.getLayouts().get(controller.getLayoutId())!;
    layout.setController(controller);

    React.useImperativeHandle(ref, () => controller, [controller]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useLayoutEffect(() => {
        // measure all registered elements in one batched pass and write the rects into the model,
        // then position the tab panels imperatively (no re-render needed for geometry changes)
        const changed = controller.syncLayoutMetrics();
        controller.positionTabPanels();

        if (controller.isMainLayout()) {
            controller.updateLayoutMetrics();
        }

        // rerender only when a content area first gains a size (mounts the gated tab content)
        if (controller.isReLayout()) {
            controller.redrawLayout();
            controller.setReLayout(false);
        }

        // re-bind document-scoped listeners if the element moved to a different document
        if (layoutRef.current && controller.getCurrentDocument() !== undefined && controller.getCurrentDocument() !== layoutRef.current.ownerDocument) {
            setDocumentVersion((v) => v + 1);
        }

        // post-paint heal: re-measure after css settles (fonts, transitions) to fix jitter
        if (changed) {
            const win = layoutRef.current?.ownerDocument.defaultView ?? window;
            const raf = win.requestAnimationFrame(() => {
                controller.syncLayoutMetrics();
                controller.positionTabPanels();
                if (controller.isReLayout()) {
                    controller.redrawLayout();
                    controller.setReLayout(false);
                }
            });
            return () => win.cancelAnimationFrame(raf);
        }
        return undefined;
    });

    // add resize and visibility listeners
    React.useEffect(() => {
        const currentDocument = layoutRef.current!.ownerDocument;
        const currentWindow = currentDocument.defaultView!;

        controller.setCurrentDocument(currentDocument);
        controller.setCurrentWindow(currentWindow);

        // ResizeObserver: re-measure before paint to keep panels in sync with flex-resized rows
        const resizeObserver = new currentWindow.ResizeObserver(() => {
            controller.updateRect();
            controller.syncLayoutMetrics();
            controller.positionTabPanels();
            // css-driven changes (e.g. font size) also change the measured border bar size, which is
            // only re-measured here (updateLayoutMetrics is a no-op for non-main layouts)
            controller.updateLayoutMetrics();
            if (controller.isReLayout()) {
                controller.redrawLayout();
                controller.setReLayout(false);
            }
        });
        resizeObserver.observe(layoutRef.current!);
        // watch the measured elements too, so css-driven geometry changes (font size, theme metrics)
        // re-measure and re-position the imperatively laid-out panels
        controller.setGeometryResizeObserver(resizeObserver);
        // and the offscreen measurement probes themselves, so a splitter size / border bar size
        // change re-measures even if no tabset happens to resize around it (e.g. borders-only layout)
        if (findBorderBarSizeRef.current) {
            resizeObserver.observe(findBorderBarSizeRef.current);
        }
        if (findSplitterSizeRef.current) {
            resizeObserver.observe(findSplitterSizeRef.current);
        }

        // Resize Listener
        const resizeListener = () => {
            controller.updateRect();
        };

        currentWindow.addEventListener("resize", resizeListener);

        // visibility listener (main layout only, redraws all layouts)
        const visibilityChange = () => {
            for (const [_, modelLayout] of controller.getProps().model.getLayouts()) {
                const layout = modelLayout.getController();
                if (layout) {
                    layout.redrawLayout();
                }
            }
        };

        if (controller.isMainLayout()) {
            document.addEventListener("visibilitychange", visibilityChange);
            // capture-phase pointerdown to close open overlay borders
            currentDocument.addEventListener("pointerdown", controller.onOverlayBorderPointerDown, true);
            // Escape to close overlay borders (bubble phase)
            currentDocument.addEventListener("keydown", controller.onOverlayBorderKeyDown);
        }

        // tabset cycling keys (document-wide per layout window)
        if (controller.isMainLayout() || controller.getLayout()?.getType() === "window") {
            currentDocument.addEventListener("keydown", controller.onTabsetNavKeyDown);
        }

        return () => {
            controller.setGeometryResizeObserver(undefined);
            resizeObserver.disconnect();
            currentWindow.removeEventListener("resize", resizeListener);
            document.removeEventListener("visibilitychange", visibilityChange);
            currentDocument.removeEventListener("pointerdown", controller.onOverlayBorderPointerDown, true);
            currentDocument.removeEventListener("keydown", controller.onOverlayBorderKeyDown);
            currentDocument.removeEventListener("keydown", controller.onTabsetNavKeyDown);
        };
        // documentVersion re-runs when the element moves to another document
    }, [controller, documentVersion]);

    // keep window popouts styles updated
    React.useEffect(() => {
        let styleObserver: MutationObserver | undefined;

        if (!controller.isMainLayout() && controller.getLayout().getType() === "window") {
            // If it's a popout, synchronize styles from main root div
            const mainRootDiv = controller.getProps().mainLayoutController?.getRootDiv();
            if (mainRootDiv) {
                const sourceElement = mainRootDiv;
                const targetElement = layoutRef.current!;

                copyInlineStyles(sourceElement, targetElement);

                styleObserver = new MutationObserver(() => {
                    const changed = copyInlineStyles(sourceElement, targetElement);
                    if (changed) {
                        controller.redrawLayout();
                    }
                });

                styleObserver.observe(sourceElement, { attributeFilter: ["style"] });
            }
        }

        return () => {
            if (styleObserver) styleObserver.disconnect();
        };
    }, [controller]);

    // use model
    React.useEffect(() => {
        const currentModel = props.model;

        // const layout = currentModel.getLayouts().get(controller.getLayoutId())!;
        // layout.setController(controller);
        layout.setToExportRectFunction((r: Rect, type: ILayoutType) => {
            return type === "window" ? controller.getScreenRect(r) : controller.getRelativeRect(r);
        });

        controller.setLayout(layout);

        if (controller.isMainLayout()) {
            const changeListener = { onAfterAction: controller.onModelChange };
            currentModel.addChangeListener(changeListener);
            return () => {
                currentModel.removeChangeListener(changeListener);
            };
        }
        return;
    }, [props.model, controller, layout]);

    // offscreen probes for updateLayoutMetrics (main layout only)
    const metrics = controller.isMainLayout() ? (
        <div className={controller.getClassName(CLASSES.FLEXLAYOUT__LAYOUT_METRICS)}>
            <div key="findBorderBarSize" ref={findBorderBarSizeRef} className={controller.getClassName(CLASSES.FLEXLAYOUT__BORDER_SIZER)}>
                FindBorderBarSize
            </div>
            <div key="findSplitterSize" ref={findSplitterSizeRef} className={controller.getClassName(CLASSES.FLEXLAYOUT__SPLITTER_ + "horz")} />
        </div>
    ) : null;

    // first render just gets the metrics and layoutRef
    if (!layoutRef.current) {
        return (
            <div ref={layoutRef} className={controller.getClassName(CLASSES.FLEXLAYOUT__LAYOUT)}>
                {metrics}
            </div>
        );
    }

    const model = props.model;
    const layoutId = controller.getLayoutId();
    model.getRootRow(layoutId)!.calcMinMaxSize();
    model.getRootRow(layoutId)!.setPaths(props.path || "");

    if (controller.isMainLayout()) {
        model.getBorderSet().setPaths();
    }

    const overlay = <Overlay key="__overlay__" controller={controller} show={state.showOverlay} />;
    const inner = controller.renderLayout();
    const outer = <BorderContainer controller={controller} inner={inner} />;
    const tabs = controller.renderTabContainers();
    const reorderedTabs = controller.reorderComponents(tabs, controller.getOrderedTabIds());

    let floatingWindows = null;
    let reorderedTabContents = null;
    let dragTabButtons = null;
    let moveablesHome = null; // only contains moveable elements temporarily when moving from window to window

    // the main controller handles rendering the tab contents and floating windows
    if (controller.isMainLayout()) {
        floatingWindows = <FloatingWindowContainer controller={controller} />;
        reorderedTabContents = controller.reorderComponents(controller.renderTabContents(), controller.getOrderedTabMoveableIds());
        // aria-hidden: the offscreen stamps duplicate every tab's name (they exist only to
        // provide drag images), so they must not be exposed to assistive technology
        dragTabButtons = (
            <div key="__dragTabButtons__" aria-hidden="true" className={controller.getClassName(CLASSES.FLEXLAYOUT__LAYOUT_TAB_STAMPS)}>
                {controller.renderDragTabButtons()}
            </div>
        );
        moveablesHome = <div ref={moveablesHomeRef} key="__moveables_home__" className={controller.getClassName(CLASSES.FLEXLAYOUT__LAYOUT_MOVEABLES_HOME)}></div>;
    }

    return (
        <div
            ref={layoutRef}
            className={controller.getClassName(CLASSES.FLEXLAYOUT__LAYOUT)}
            onDragEnter={controller.getDragDropManager().onDragEnterRaw}
            onDragLeave={controller.getDragDropManager().onDragLeaveRaw}
            onDragOver={controller.getDragDropManager().onDragOver}
            onDrop={controller.getDragDropManager().onDrop}
        >
            {metrics}
            {moveablesHome}
            {overlay}
            {outer}
            {reorderedTabs}
            {reorderedTabContents}
            {floatingWindows}
            {dragTabButtons}
        </div>
    );
});

/** @internal */
export class LayoutController {
    // WeakMap so closed popout windows can be garbage collected
    private static Windows: WeakMap<Window, string> = new WeakMap();
    private _props: ILayoutInternalProps;
    private _state: ILayoutInternalState;
    private _setState: (update: Partial<ILayoutInternalState> | ((prevState: ILayoutInternalState, props: ILayoutInternalProps) => Partial<ILayoutInternalState>)) => void;

    private _layoutRef!: React.RefObject<HTMLDivElement | null>;
    private _moveablesHomeRef!: React.RefObject<HTMLDivElement | null>;
    private _findBorderBarSizeRef!: React.RefObject<HTMLDivElement | null>;
    private _findSplitterSizeRef!: React.RefObject<HTMLDivElement | null>;
    private _mainRef!: React.RefObject<HTMLDivElement | null>;
    private _orderedTabIds: string[];
    private _orderedTabMoveableIds: string[];
    private _currentDocument?: Document;
    private _currentWindow?: Window;
    private _showOverlay: boolean = false;
    private _supportsPopout: boolean;
    private _popoutURL: string;
    private _icons: IIcons;
    private _dragDropManager: DragDropManager;
    private _layoutId: string;
    private _layout: ModelLayout;
    private _mainController?: LayoutController;
    private _popoutWindowName: string;
    private _cachedLayoutDOMRect: Rect | undefined;
    private _reLayout: boolean;
    // _measurables: geometry measured into the model; _tabPanels: positioned from those rects
    private _measurables: Map<string, { kind: MeasurableKind; node: Node; element: HTMLElement }> = new Map();
    private _tabPanels: Map<string, { node: TabNode; element: HTMLElement }> = new Map();
    private _lastRect: Rect = Rect.empty();
    private _lastSplitterSize: number = 8;
    // watches the measured elements so css-driven geometry changes (e.g. a font-size or theme
    // change altering the tabstrip height without resizing the layout root) re-measure the layout
    private _geometryResizeObserver: ResizeObserver | undefined;

    constructor(
        props: ILayoutInternalProps,
        state: ILayoutInternalState,
        setState: (update: Partial<ILayoutInternalState> | ((prevState: ILayoutInternalState, props: ILayoutInternalProps) => Partial<ILayoutInternalState>)) => void,
    ) {
        this._props = props;
        this._state = state;
        this._setState = setState;
        this._orderedTabIds = [];
        this._orderedTabMoveableIds = [];
        this._supportsPopout = props.supportsPopout !== undefined ? props.supportsPopout : defaultSupportsPopout;
        this._popoutURL = props.popoutURL ? props.popoutURL : "popout.html";
        this._icons = { ...defaultIcons, ...props.icons };
        this._layoutId = props.layoutId ? props.layoutId : Model.MAIN_LAYOUT_ID;
        this._mainController = props.mainLayoutController ? props.mainLayoutController : this;
        this._dragDropManager = new DragDropManager(this);
        this._layout = props.model.getLayouts().get(this._layoutId)!;
        this._layout.setController(this);
        this._popoutWindowName = props.popoutWindowName || "Popout Window";
        this._reLayout = false;
    }

    // *********************************************************************************
    // Render Functions
    // *********************************************************************************

    renderLayout() {
        this._cachedLayoutDOMRect = undefined;
        return (
            <>
                <Row key="__row__" controller={this} rowNode={this._props.model.getRootRow(this._layoutId)!} />
                <EdgeIndicators controller={this} />
            </>
        );
    }

    renderTabContainers() {
        const tabs = new Map<string, React.ReactNode>();

        this._props.model.visitLayoutNodes(this._layoutId, (node) => {
            if (node instanceof TabNode) {
                const tabNode = node as TabNode;
                const isSelected = tabNode.isSelected();
                const isRendered = tabNode.isRendered();
                const isEnableRenderOnDemand = tabNode.isEnableRenderOnDemand();

                // Render tab container at correct position
                if (isRendered || isSelected || !isEnableRenderOnDemand) {
                    tabs.set(tabNode.getId(), <Tab key={tabNode.getId()} controller={this} tabNode={tabNode} selected={isSelected} />);
                }
            }
        });

        return tabs;
    }

    renderTabContents() {
        const tabContents = new Map<string, React.ReactNode>();

        for (const [layoutId, layout] of this._props.model.getLayouts()) {
            this._props.model.visitLayoutNodes(layoutId, (node) => {
                if (node instanceof TabNode) {
                    const tabNode = node as TabNode;
                    const isSelected = tabNode.isSelected();
                    const isRendered = tabNode.isRendered();
                    const isEnableRenderOnDemand = tabNode.isEnableRenderOnDemand();
                    const rect = (tabNode.getParent() as BorderNode | TabSetNode).getContentRect();
                    const visible = isSelected || !isEnableRenderOnDemand;
                    const renderTabContent = isRendered || (visible && rect.width > 0 && rect.height > 0);

                    if (renderTabContent) {
                        const element = tabNode.getMoveableElement();
                        element.style.overflow = tabNode.isEnableScrollbars() ? "auto" : "hidden";
                        const windowId = layout.getWindowId() || "";
                        const key = tabNode.getId() + (tabNode.isEnableWindowReMount() ? windowId : "");

                        // Render tab content into moveable element using portal
                        // Note: TabContentRenderer calls the factory to render the contents
                        tabContents.set(
                            tabNode.getId(),
                            createPortal(
                                <TabContentRenderer
                                    key={key}
                                    controller={this}
                                    tabNode={tabNode}
                                    windowId={windowId}
                                    visible={visible}
                                    fullRedrawRevision={this._state.fullRedrawRevision}
                                    parentRedrawRevision={this._props.parentRedrawRevision}
                                ></TabContentRenderer>,
                                element,
                                key,
                            ),
                        );

                        tabNode.setRendered(true);
                    }
                }
            });
        }

        return tabContents;
    }

    renderDragTabButtons() {
        const dragTabButtons: React.ReactNode[] = [];

        this._props.model.visitNodes((node) => {
            if (node instanceof TabNode) {
                const child = node as TabNode;

                // what the tab should look like when dragged (since images need to have been loaded before drag image can be taken)
                dragTabButtons.push(<DragTabButton key={child.getId()} controller={this} tabNode={child} dragging={Utils_dragging} />);
            }
        });

        return dragTabButtons;
    }

    // *********************************************************************************
    // Logic
    // *********************************************************************************

    redrawLayout() {
        this._mainController?.setState((state) => {
            return { layoutRedrawRevision: state.layoutRedrawRevision + 1 };
        });
    }

    redrawLayoutAndTabContent() {
        this._mainController?.setState((state) => {
            return { fullRedrawRevision: state.fullRedrawRevision + 1 };
        });
    }

    doAction(action: Action): Node | undefined {
        if (this._props.onAction !== undefined) {
            const outcome = this._props.onAction(action);
            if (outcome !== undefined) {
                return this._props.model.doAction(outcome);
            }
            return undefined;
        } else {
            return this._props.model.doAction(action);
        }
    }

    updateRect = () => {
        if (this._layoutRef.current) {
            let element = this._layoutRef.current;
            if (!this._layout.isMainLayout() && this._layout.getType() === "float") {
                const floatWindow = element.closest("." + this.getClassName(CLASSES.FLEXLAYOUT__FLOAT_WINDOW));
                if (floatWindow instanceof HTMLDivElement) {
                    element = floatWindow;
                }
            }

            let rect = Rect.fromDomRect(element.getBoundingClientRect());
            if (!this._layout.isMainLayout() && this._layout.getType() === "float") {
                const rootRect = this._mainController!.getDomRect();
                rect = rect.relativeTo(rootRect);
            }

            if (!rect.equalsWhenRounded(this._lastRect) && rect.width !== 0 && rect.height !== 0) {
                this._lastRect = rect;
                this._layout.setRect(rect);
                this.redrawLayout();
            }
        }
    };

    onModelChange = (action: Action) => {
        // a GroupAction applies its contained actions in one model pass, so check each sub-action
        // for the same state resets a bare action would trigger
        const subActions = action instanceof GroupAction ? action.actions : [action];
        for (const sub of subActions) {
            if (sub.type == Actions.DELETE_TAB && this._state.showHiddenBorder !== DockLocation.CENTER) {
                const borderNode = this._props.model.getBorderSet().getBorderMap().get(this._state.showHiddenBorder);
                if (borderNode!.getChildren().length === 0) {
                    this._setState({ showHiddenBorder: DockLocation.CENTER });
                    break;
                }
            }
        }

        if (action.isAdjusting() && (action.type === Actions.ADJUST_WEIGHTS || action.type === Actions.ADJUST_BORDER_SPLIT)) {
            if (action.type === Actions.ADJUST_WEIGHTS) {
                this.applyAdjustingWeights(action);
            } else {
                this.applyAdjustingBorderSplit(action);
            }
            if (this._props.onModelChange) {
                this._props.onModelChange(this._props.model, action);
            }
            return;
        }

        this.redrawLayout();
        if (this._props.onModelChange) {
            this._props.onModelChange(this._props.model, action);
        }
    };

    // re-measure, reposition panels, and mount any newly sized content areas
    private applyMeasuredGeometry() {
        this.syncLayoutMetrics();
        this.positionTabPanels();
        if (this.isReLayout()) {
            this.redrawLayout();
            this.setReLayout(false);
        }
    }

    applyAdjustingWeights(action: Action) {
        const row = this._props.model.getNodeById(action.data.nodeId);
        if (!(row instanceof RowNode)) {
            this.redrawLayout();
            return;
        }
        const weights = action.data.weights as number[] | undefined;
        const children = row.getChildren();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (typeof weights?.[i] !== "number" || !Number.isFinite(weights[i])) {
                continue;
            }
            const kind: MeasurableKind = child instanceof RowNode ? "row" : "tabset";
            const element = this._measurables.get(kind + ":" + child.getId())?.element;
            if (!element) {
                // not registered (e.g. row in a popout window): fall back to re-render path
                this.redrawLayout();
                return;
            }
            element.style.flexGrow = String(Math.max(1, weights[i] * 1000));
        }

        this.applyMeasuredGeometry();
    }

    applyAdjustingBorderSplit(action: Action) {
        const borderNode = this._props.model.getNodeById(action.data.node);
        if (!(borderNode instanceof BorderNode)) {
            this.redrawLayout();
            return;
        }

        // overlay borders need full re-render (their position depends on other open borders)
        if (borderNode.isOverlay()) {
            this.redrawLayout();
            return;
        }

        const element = this._measurables.get("bordercontent:" + borderNode.getId())?.element;
        if (!element) {
            // not registered: fall back to re-render path
            this.redrawLayout();
            return;
        }

        const size = borderNode.getSize();
        if (borderNode.isHorizontal()) {
            element.style.width = size + "px";
            element.style.minWidth = borderNode.getMinSize() + "px";
            element.style.maxWidth = borderNode.getMaxSize() + "px";
        } else {
            element.style.height = size + "px";
            element.style.minHeight = borderNode.getMinSize() + "px";
            element.style.maxHeight = borderNode.getMaxSize() + "px";
        }

        this.applyMeasuredGeometry();
    }

    reorderComponents(components: Map<string, React.ReactNode>, ids: string[]) {
        const nextIds = ids.filter((id) => components.has(id));
        const nextIdsSet = new Set(nextIds);

        for (const id of components.keys()) {
            if (!nextIdsSet.has(id)) {
                nextIds.push(id);
            }
        }

        ids.splice(0, ids.length, ...nextIds);
        return ids.map((id) => components.get(id));
    }

    checkForBorderToShow(x: number, y: number) {
        const r = this.getBoundingClientRect(this._mainRef.current!);
        const c = r.getCenter();
        const margin = edgeRectWidth;
        const offset = edgeRectLength / 2;

        let overEdge = false;
        if (this._props.model.isEnableEdgeDock() && this._state.showHiddenBorder === DockLocation.CENTER) {
            if ((y > c.y - offset && y < c.y + offset) || (x > c.x - offset && x < c.x + offset)) {
                overEdge = true;
            }
        }

        let location = DockLocation.CENTER;
        if (!overEdge) {
            if (x <= r.x + margin) {
                location = DockLocation.LEFT;
            } else if (x >= r.getRight() - margin) {
                location = DockLocation.RIGHT;
            } else if (y <= r.y + margin) {
                location = DockLocation.TOP;
            } else if (y >= r.getBottom() - margin) {
                location = DockLocation.BOTTOM;
            }
        }

        if (location !== this._state.showHiddenBorder) {
            this.setState({ showHiddenBorder: location });
        }
    }

    // closes any open overlay border panel on a pointer down in the main layout area (outside the
    // panel itself); registered on the current document by the main layout only. Registered in the
    // capture phase: splitters and toolbar buttons stop propagation in their own pointer down
    // handlers, which would prevent a bubble phase listener from ever seeing the event
    onOverlayBorderPointerDown = (event: PointerEvent) => {
        const openOverlays = this._props.model
            .getBorderSet()
            .getBorders()
            .filter((border) => border.isOverlay() && border.getSelected() !== -1);
        if (openOverlays.length === 0) {
            return;
        }

        // ignore interactions with popup menus, floating windows and the overlay panels
        // themselves (the overlay wrapper holds the panel host and its splitter - resizing a
        // overlay must not close it)
        const target = event.target as Element | null;
        if (
            target?.closest?.(
                "." +
                    this.getClassName(CLASSES.FLEXLAYOUT__POPUP_MENU_CONTAINER) +
                    "," +
                    "." +
                    this.getClassName(CLASSES.FLEXLAYOUT__FLOAT_WINDOW) +
                    "," +
                    "." +
                    this.getClassName(CLASSES.FLEXLAYOUT__FLOATING_WINDOW_CONTENT) +
                    "," +
                    "." +
                    this.getClassName(CLASSES.FLEXLAYOUT__BORDER_TAB_OVERLAY),
            )
        ) {
            return;
        }

        // geometric test: the main area tab panels are root level DOM siblings of layout_main
        // (not children), so a DOM contains() test on the main element would miss them
        const domRect = this.getDomRect();
        if (!domRect) {
            return;
        }
        const x = event.clientX - domRect.x;
        const y = event.clientY - domRect.y;
        const mainRect = this._props.model.getRootRow(Model.MAIN_LAYOUT_ID)?.getRect();
        if (!mainRect || !mainRect.contains(x, y)) {
            return; // border strips and toolbars are outside the root row rect
        }

        for (const border of openOverlays) {
            if (!border.getContentRect()?.contains(x, y)) {
                this.closeOverlayBorder(border);
            }
        }
    };

    // closes the given overlay border's panel (via the select toggle path: re-selecting the
    // selected border tab closes it), restoring focus to the border tab button if focus was
    // inside the panel (else it would be dropped to the body when the panel hides)
    closeOverlayBorder(border: BorderNode) {
        const selectedNode = border.getSelectedNode();
        if (selectedNode === undefined) {
            return;
        }
        const doc = this._currentDocument;
        const panelElement = doc?.getElementById(domId("flexlayout-tab-", selectedNode.getId()));
        const panelHadFocus = !!doc && !!panelElement && panelElement.contains(doc.activeElement);
        this.doAction(Actions.selectTab(selectedNode.getId()));
        if (panelHadFocus) {
            doc!.getElementById(domId("flexlayout-tabbutton-", selectedNode.getId()))?.focus();
        }
    }

    // the closeOverlayBorder key (Escape by default) closes an open overlay border panel when
    // focus is inside it (or on its tab button)
    onOverlayBorderKeyDown = (event: KeyboardEvent) => {
        if (!matchesKey(event, this.getKeyMap().closeOverlayBorder)) {
            return;
        }
        const active = this._currentDocument?.activeElement;
        if (!active) {
            return;
        }
        const openOverlays = this._props.model
            .getBorderSet()
            .getBorders()
            .filter((border) => border.isOverlay() && border.getSelected() !== -1);
        for (const border of openOverlays) {
            const selectedNode = border.getSelectedNode()!;
            const panelElement = this._currentDocument!.getElementById(domId("flexlayout-tab-", selectedNode.getId()));
            const buttonElement = this._currentDocument!.getElementById(domId("flexlayout-tabbutton-", selectedNode.getId()));
            if ((panelElement && panelElement.contains(active)) || active === buttonElement) {
                this.closeOverlayBorder(border);
                event.preventDefault();
                break;
            }
        }
    };

    // the focusNextTabset/focusPreviousTabset keys move focus between the tabsets of this layout
    onTabsetNavKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented) {
            return; // content that handled the key keeps it
        }
        const keyMap = this.getKeyMap();
        let delta: number;
        if (matchesKey(event, keyMap.focusNextTabset)) {
            delta = 1;
        } else if (matchesKey(event, keyMap.focusPreviousTabset)) {
            delta = -1;
        } else {
            return;
        }
        if (this.focusAdjacentTabset(delta)) {
            event.preventDefault();
        }
    };

    // moves focus to the selected tab button of the next/previous tabset in this layout
    // (wrapping), starting from the tabset containing focus (its strip or its selected tab's
    // panel) and falling back to the active tabset; the target also becomes the active tabset
    focusAdjacentTabset(delta: number): boolean {
        const doc = this._currentDocument;
        const active = doc?.activeElement;
        if (!doc || !active || !this.getRootDiv()?.contains(active)) {
            return false;
        }
        // leave text editing contexts alone (the rename textbox, inputs and editors in tab
        // content, where modified arrow keys typically navigate within the text)
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (active as HTMLElement).isContentEditable || active.closest('[role="menu"]')) {
            return false;
        }
        if (this._props.model.getMaximizedTabset(this._layoutId) !== undefined) {
            return false; // only the maximized tabset is visible
        }
        const tabsets: TabSetNode[] = [];
        this._props.model.visitLayoutNodes(this._layoutId, (node) => {
            if (node instanceof TabSetNode && node.getSelectedNode() !== undefined) {
                tabsets.push(node);
            }
        });
        if (tabsets.length < 2) {
            return false;
        }
        const containsFocus = (tabset: TabSetNode) => {
            if (this._measurables.get("tabset:" + tabset.getId())?.element.contains(active)) {
                return true; // focus in the tabstrip or on a toolbar button
            }
            const panelElement = doc.getElementById(domId("flexlayout-tab-", tabset.getSelectedNode()!.getId()));
            return !!panelElement?.contains(active); // focus inside the selected tab's content
        };
        let index = tabsets.findIndex(containsFocus);
        if (index === -1) {
            const activeTabset = this._props.model.getActiveTabset(this._layoutId);
            index = activeTabset !== undefined ? tabsets.indexOf(activeTabset) : 0;
            if (index === -1) {
                index = 0;
            }
        }
        const target = tabsets[(index + delta + tabsets.length) % tabsets.length];
        doc.getElementById(domId("flexlayout-tabbutton-", target.getSelectedNode()!.getId()))?.focus();
        this.doAction(Actions.setActiveTabset(target.getId(), this._layoutId));
        return true;
    }

    // components register the elements whose geometry feeds the model (measured centrally in syncLayoutMetrics)
    registerMeasurable(node: Node, kind: MeasurableKind, element: HTMLElement | null) {
        const key = kind + ":" + node.getId();
        const prev = this._measurables.get(key);
        if (element) {
            this._measurables.set(key, { kind, node, element });
        } else {
            this._measurables.delete(key);
        }
        // css-driven geometry changes (e.g. a font-size or theme change) do not resize the layout
        // root, so also watch the measured elements and re-measure when they resize; tab buttons are
        // excluded since their overflow is handled separately
        if (kind !== "tabbutton") {
            if (prev) {
                this._geometryResizeObserver?.unobserve(prev.element);
            }
            if (element) {
                this._geometryResizeObserver?.observe(element);
            }
        }
    }

    /** @internal sets the ResizeObserver that watches the measured elements; observes any already
     *  registered elements (e.g. those registered before this observer was created) */
    setGeometryResizeObserver(observer: ResizeObserver | undefined) {
        this._geometryResizeObserver = observer;
        if (observer) {
            for (const { kind, element } of this._measurables.values()) {
                if (kind !== "tabbutton") {
                    observer.observe(element);
                }
            }
        }
    }

    // batch-measure all registered elements and write rects into the model; returns true on change
    syncLayoutMetrics(): boolean {
        // invalidate cached origin (page may scroll between passes); per-pass caching is preserved
        this._cachedLayoutDOMRect = undefined;
        let changed = false;
        for (const { kind, node, element } of this._measurables.values()) {
            if (!element.isConnected) {
                continue;
            }
            const rect = this.getBoundingClientRect(element);
            switch (kind) {
                case "row":
                case "tabset":
                    if (!rect.equalsWhenRounded(node.getRect())) {
                        (node as RowNode | TabSetNode).setRect(rect);
                        changed = true;
                    }
                    break;
                case "tabstrip":
                    if (!rect.equalsWhenRounded((node as TabSetNode).getTabStripRect())) {
                        (node as TabSetNode).setTabStripRect(rect);
                        changed = true;
                    }
                    break;
                case "tabsetcontent": {
                    const tabsetNode = node as TabSetNode;
                    if (!isNaN(rect.x) && !tabsetNode.getContentRect().equalsWhenRounded(rect)) {
                        const hadSize = tabsetNode.getContentRect().width > 0 && tabsetNode.getContentRect().height > 0;
                        tabsetNode.setContentRect(rect);
                        changed = true;
                        if (!hadSize && rect.width > 0 && rect.height > 0) {
                            // the tab content render is gated on a non empty rect, so the first time a
                            // content area gains a size a re-render is needed to mount the content;
                            // recurring geometry changes are applied imperatively in positionTabPanels
                            this.setReLayout(true);
                        }
                    }
                    break;
                }
                case "tabbutton":
                    if (!rect.equalsWhenRounded((node as TabNode).getTabRect())) {
                        (node as TabNode).setTabRect(rect);
                        changed = true;
                    }
                    break;
                case "borderheader":
                    // note: BorderNode.getRect() returns the tab header rect
                    if (!rect.equalsWhenRounded((node as BorderNode).getRect())) {
                        (node as BorderNode).setTabHeaderRect(rect);
                        changed = true;
                    }
                    break;
                case "bordercontent": {
                    const borderNode = node as BorderNode;
                    if (!isNaN(rect.x) && rect.width > 0 && !borderNode.getContentRect().equalsWhenRounded(rect)) {
                        const hadSize = borderNode.getContentRect().width > 0 && borderNode.getContentRect().height > 0;
                        borderNode.setContentRect(rect);
                        changed = true;
                        if (!hadSize && rect.height > 0) {
                            this.setReLayout(true);
                        }
                    }
                    break;
                }
            }
        }
        return changed;
    }

    registerTabPanel(node: TabNode, element: HTMLElement | null) {
        if (element) {
            this._tabPanels.set(node.getId(), { node, element });
        } else {
            this._tabPanels.delete(node.getId());
        }
    }

    // position the tab panels over their parents content areas and set their visibility; runs after
    // syncLayoutMetrics in the layout effect, replacing the second render that previously applied the
    // measured rects to the panels
    positionTabPanels() {
        for (const { node, element } of this._tabPanels.values()) {
            const parent = node.getParent() as TabSetNode | BorderNode;
            const rect = parent.getContentRect();

            let visible = node.isSelected();
            if (parent instanceof TabSetNode) {
                if (this._props.model.getMaximizedTabset(this._layoutId) !== undefined && !parent.isMaximized()) {
                    visible = false;
                }
            } else if (parent instanceof BorderNode) {
                if (!parent.isShowing()) {
                    visible = false;
                }
            }

            rect.positionElement(element);
            element.style.display = visible ? "" : "none";

            node.setRect(rect); // fires the resize event to user code when changed
            node.setVisible(visible); // fires the visibility event to user code when changed
        }
    }

    updateLayoutMetrics = () => {
        if (this._findBorderBarSizeRef.current) {
            const borderBarSize = this._findBorderBarSizeRef.current.getBoundingClientRect().height;
            if (Math.abs(borderBarSize - this._state.calculatedBorderBarSize) > 0.5) {
                this.setState({ calculatedBorderBarSize: borderBarSize });
            }
        }
        if (this._findSplitterSizeRef.current) {
            const splitterBarSize = this._findSplitterSizeRef.current.getBoundingClientRect().width;
            if (Math.abs(splitterBarSize - this._lastSplitterSize) > 0.5) {
                this._lastSplitterSize = splitterBarSize;
                this._props.model.setSplitterSize(splitterBarSize);
                this.redrawLayout();
            }
        }
    };

    // *************************** Drag Drop Methods *************************************

    addTabWithDragAndDrop(event: DragEvent, json: IJsonTabNode, onDrop?: (node?: Node, event?: React.DragEvent<HTMLElement>) => void) {
        this._dragDropManager.addTabWithDragAndDrop(event, json, onDrop);
    }

    moveTabWithDragAndDrop(event: DragEvent, node: TabNode | TabSetNode) {
        this._dragDropManager.moveTabWithDragAndDrop(event, node);
    }

    setDragComponent(event: DragEvent, component: React.ReactNode, x: number, y: number) {
        this._dragDropManager.setDragComponent(event, component, x, y);
    }

    // *********************************************************************************
    // Getters, Setters, and Utilities
    // *********************************************************************************

    getMoveablesHome() {
        return this._moveablesHomeRef.current;
    }

    getProps() {
        return this._props;
    }

    // the keyboard bindings for the command shortcuts: the keyMap prop merged over the defaults
    getKeyMap(): IKeyMap {
        return resolveKeyMap(this._props.keyMap);
    }

    setProps(value: ILayoutInternalProps) {
        this._props = value;
    }

    getState() {
        return this._state;
    }
    setStateRaw(value: ILayoutInternalState) {
        this._state = value;
    }

    setState(update: Partial<ILayoutInternalState> | ((prevState: ILayoutInternalState, props: ILayoutInternalProps) => Partial<ILayoutInternalState>)) {
        this._setState(update);
    }
    setSetState(value: (update: Partial<ILayoutInternalState> | ((prevState: ILayoutInternalState, props: ILayoutInternalProps) => Partial<ILayoutInternalState>)) => void) {
        this._setState = value;
    }
    setLayoutRef(value: React.RefObject<HTMLDivElement | null>) {
        this._layoutRef = value;
    }

    setMoveablesHomeRef(value: React.RefObject<HTMLDivElement | null>) {
        this._moveablesHomeRef = value;
    }
    setFindBorderBarSizeRef(value: React.RefObject<HTMLDivElement | null>) {
        this._findBorderBarSizeRef = value;
    }
    setFindSplitterSizeRef(value: React.RefObject<HTMLDivElement | null>) {
        this._findSplitterSizeRef = value;
    }

    getMainRef() {
        return this._mainRef;
    }
    setMainRef(value: React.RefObject<HTMLDivElement | null>) {
        this._mainRef = value;
    }

    getOrderedTabIds() {
        return this._orderedTabIds;
    }
    getOrderedTabMoveableIds() {
        return this._orderedTabMoveableIds;
    }

    getCurrentDocument() {
        return this._currentDocument;
    }
    setCurrentDocument(value: Document | undefined) {
        this._currentDocument = value;
    }

    getCurrentWindow() {
        return this._currentWindow;
    }
    setCurrentWindow(value: Window | undefined) {
        this._currentWindow = value;
        if (value && !LayoutController.Windows.has(value)) {
            LayoutController.Windows.set(value, randomUUID());
        }
    }

    getWindowId(): string | undefined {
        if (this.getCurrentWindow()) {
            return LayoutController.Windows.get(this.getCurrentWindow()!);
        }
        return undefined;
    }

    isSupportsPopout() {
        return this._supportsPopout;
    }
    getPopoutURL() {
        return this._popoutURL;
    }
    getIcons() {
        return this._icons;
    }

    getDragDropManager() {
        return this._dragDropManager;
    }

    getLayoutId() {
        return this._layoutId;
    }
    getLayout() {
        return this._layout;
    }
    setLayout(value: ModelLayout) {
        this._layout = value;
    }

    getMainController() {
        return this._mainController;
    }
    isMainLayout() {
        return this._layout.isMainLayout();
    }

    getPopoutWindowName() {
        return this._popoutWindowName;
    }

    isReLayout() {
        return this._reLayout;
    }
    setReLayout(value: boolean) {
        this._reLayout = value;
    }

    getBoundingClientRect(div: HTMLElement): Rect {
        const layoutRect = this.getDomRect();
        if (layoutRect) {
            return Rect.getBoundingClientRect(div).relativeTo(layoutRect);
        }
        return Rect.empty();
    }

    getClassName = (defaultClassName: string) => {
        if (this._props.classNameMapper === undefined) {
            return defaultClassName;
        } else {
            return this._props.classNameMapper(defaultClassName);
        }
    };

    getLayoutRef() {
        return this._layoutRef.current;
    }

    getDomRect() {
        if (this._cachedLayoutDOMRect !== undefined) {
            return this._cachedLayoutDOMRect;
        }

        // get fresh rect on demand (page may have scrolled)
        if (this._layoutRef.current) {
            this._cachedLayoutDOMRect = Rect.fromDomRect(this._layoutRef.current.getBoundingClientRect());
            return this._cachedLayoutDOMRect;
        } else {
            return Rect.empty();
        }
    }

    getRootDiv() {
        return this._layoutRef.current;
    }

    getMainElement() {
        return this._mainRef.current;
    }

    getFactory() {
        return this._props.factory;
    }

    isRealtimeResize() {
        return this._props.realtimeResize ?? false;
    }

    setEditingTab(tabNode?: TabNode) {
        this.setState({ editingTab: tabNode });
    }

    getEditingTab() {
        return this._state.editingTab;
    }

    getModel() {
        return this._props.model;
    }

    getTabDragSpeed() {
        return this._props.tabDragSpeed ? this._props.tabDragSpeed : 0.3;
    }

    onCloseLayout = (layout: ModelLayout) => {
        this.doAction(Actions.closePopout(layout.getLayoutId()));
    };

    getScreenRect(inRect: Rect) {
        const rect = inRect.clone();
        const layoutRect = this.getDomRect();
        // measure window chrome; fall back to typical sizes under zoom
        const measuredNavHeight = this._currentWindow!.outerHeight - this._currentWindow!.innerHeight;
        const measuredNavWidth = this._currentWindow!.outerWidth - this._currentWindow!.innerWidth;
        const navHeight = measuredNavHeight >= 0 && measuredNavHeight <= 200 ? measuredNavHeight : 60;
        const navWidth = measuredNavWidth >= 0 && measuredNavWidth <= 100 ? measuredNavWidth : 2;
        rect.x = this._currentWindow!.screenX + this._currentWindow!.scrollX + navWidth / 2 + layoutRect.x + rect.x;
        rect.y = this._currentWindow!.screenY + this._currentWindow!.scrollY + (navHeight - navWidth / 2) + layoutRect.y + rect.y;
        rect.height += navHeight;
        rect.width += navWidth;
        return rect;
    }

    getRelativeRect(inRect: Rect) {
        const rect = inRect.clone();
        if (!this._layout.isMainLayout()) {
            const layoutRect = this._layout.getRect();
            rect.x += layoutRect.x;
            rect.y += layoutRect.y;
        }
        return rect;
    }

    moveWindowToFront(layoutId: string) {
        this.doAction(Actions.movePopoutToFront(layoutId));
    }

    addTabToTabSet(tabsetId: string, json: IJsonTabNode): TabNode | undefined {
        const tabsetNode = this._props.model.getNodeById(tabsetId);
        if (tabsetNode !== undefined) {
            const node = this.doAction(Actions.addTab(json, tabsetId, DockLocation.CENTER, -1));
            return node as TabNode;
        }
        return undefined;
    }

    addTabToActiveTabSet(json: IJsonTabNode): TabNode | undefined {
        const tabsetNode = this._props.model.getActiveTabset(this._layoutId);
        if (tabsetNode !== undefined) {
            const node = this.doAction(Actions.addTab(json, tabsetNode.getId(), DockLocation.CENTER, -1));
            return node as TabNode;
        }
        return undefined;
    }

    maximize(tabsetNode: TabSetNode) {
        this.doAction(Actions.maximizeToggle(tabsetNode.getId(), this.getLayoutId()));
    }

    customizeTab(tabNode: TabNode, renderValues: ITabRenderValues) {
        if (this._props.onRenderTab) {
            this._props.onRenderTab(tabNode, renderValues);
        }
    }

    customizeTabSet(tabSetNode: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) {
        if (this._props.onRenderTabSet) {
            this._props.onRenderTabSet(tabSetNode, renderValues);
        }
    }

    i18nName(id: I18nLabel, param?: string) {
        let message;
        if (this._props.i18nMapper) {
            message = this._props.i18nMapper(id, param);
        }
        if (message === undefined) {
            message = id + (param === undefined ? "" : param);
        }
        return message;
    }

    getShowOverflowMenu() {
        return this._props.onShowOverflowMenu;
    }

    getTabSetPlaceHolderCallback() {
        return this._props.onTabSetPlaceHolder;
    }

    showContextMenu(node: TabNode | TabSetNode | BorderNode, event: React.MouseEvent<HTMLElement, MouseEvent>) {
        if (this._props.onContextMenu) {
            this._props.onContextMenu(node, event);
        }
    }

    auxMouseClick(node: TabNode | TabSetNode | BorderNode, event: React.MouseEvent<HTMLElement, MouseEvent>) {
        if (this._props.onAuxMouseClick) {
            this._props.onAuxMouseClick(node, event);
        }
    }

    showOverlay(show: boolean) {
        if (this._showOverlay === show) {
            return; // avoid re-render and iframe sweep (called on every pointermove during drags)
        }
        this._showOverlay = show;
        this.setState({ showOverlay: show });
        enablePointerOnIFrames(!show, this._currentDocument!);
    }

    showOverlayOnAllWindows(show: boolean) {
        for (const [, layout] of this._props.model.getLayouts()) {
            if (layout.getController()) {
                layout.getController()!.showOverlay(show);
            }
        }
    }
}

const defaultIcons = {
    close: <CloseIcon />,
    pin: <PinIcon />,
    closeTabset: <CloseIcon />,
    closeFloatPopout: <CloseIcon />,
    popout: <PopoutIcon />,
    popoutFloat: <PopoutFloatIcon />,
    maximize: <MaximizeIcon />,
    restore: <RestoreIcon />,
    more: <OverflowIcon />,
    edgeArrow: <EdgeIcon />,
    activeTabset: <AsterickIcon />,
};

const defaultSupportsPopout: boolean = isDesktop();

/** @internal */
export const edgeRectLength = 100;

/** @internal */
export const edgeRectWidth = 10;
