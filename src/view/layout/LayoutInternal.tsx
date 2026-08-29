import * as React from "react";
import { DockLocation } from "../../model/DockLocation";
import { Rect } from "../../model/Rect";
import { CLASSES } from "../../CSSClassNames";
import { copyInlineStyles } from "../Utils";
import { ILayoutType } from "../../model/IJsonModel";
import { Overlay } from "../Overlay";
import { FloatingWindowContainer } from "./FloatingWindowContainer";
import { BorderContainer } from "./BorderContainer";
import { LayoutController, ILayoutInternalProps, ILayoutInternalState } from "./LayoutController";

// Re-export controller and helpers for backward compatibility (existing imports from "./LayoutInternal" keep working)
export { LayoutController, getViewController, edgeRectLength, edgeRectWidth } from "./LayoutController";
export type { MeasurableKind, ILayoutInternalProps, ILayoutInternalState } from "./LayoutController";

/** @internal */
export const LayoutInternal = React.forwardRef<LayoutController, ILayoutInternalProps>((props, ref) => {
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
                const layout = modelLayout.getController() as LayoutController | undefined;
                if (layout) {
                    layout.redrawLayout();
                }
            }
        };

        if (controller.isMainLayout()) {
            currentDocument.addEventListener("visibilitychange", visibilityChange);
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
            currentDocument.removeEventListener("visibilitychange", visibilityChange);
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
    // Recompute cached paths/sizes for this render
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
LayoutInternal.displayName = "LayoutInternal"; // name in react dev tools
