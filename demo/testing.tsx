import * as React from "react";
import { Actions, BorderNode, ILayoutApi, ITabRenderValues, ITabSetRenderValues, IPopupMenuItem, Model, PopupMenuEntry, TabNode, TabSetNode } from "../src/index";

// Everything in this module exists only to support the e2e/playwright test suite (tests-playwright/).
// It is kept out of App.tsx so the demo stays a clean showcase. None of it is active for the
// demo's own layouts - it only does anything when a `test_*` layout is loaded or a test drives
// the exposed window hooks.

/** the test-only layouts in demo/public/layouts/ */
export const TEST_LAYOUT_NAMES = ["test_two_tabs", "test_three_tabs", "test_with_borders", "test_with_onRenderTab", "test_with_min_size", "test_pinned", "test_overlay", "test_close_actions"];

/** whether the loaded layout is a test layout */
export const isTestLayout = (layoutFile: string | null | undefined): boolean => layoutFile?.startsWith("test_") === true;

/** dom ids/attributes the e2e tests select on */
export const TEST_IDS = {
    addActive: "add-active",
    addDrag: "add-drag",
    rerender: "rerender",
    stateIframe: "state-iframe",
};

export interface ITestHooksRefs {
    getModel: () => Model | null;
    getLayout: () => ILayoutApi | null;
}

/**
 * Expose the live model and layout to the e2e tests (popout-leak, popup-position, iframe-state,
 * overlay-borders) so they can drive the app the way application code would, without pointer
 * interactions. Re-assigned on every render; the getters always read the latest values.
 */
export const installTestHooks = (refs: ITestHooksRefs): void => {
    const w = window as any;
    w.__flexDispatch = (action: any) => refs.getModel()?.doAction(action);
    w.__flexActions = Actions;
    w.__flexModel = () => refs.getModel();
    w.__flexLayout = () => refs.getLayout();
};

/** sequential names for tabs added by the tests, e.g. "Text1", "Text2" */
let nextTestTabIndex = 1;
const nextTestTabName = () => "Text" + nextTestTabIndex++;

/** the add-active button on a test layout: add a `testing` tab (see view.spec "Add methods") */
export const handleTestAddTab = (layout: ILayoutApi | null): void => {
    layout?.addTabToActiveTabSet({ component: "testing", name: nextTestTabName() });
};

/** the add-drag button on a test layout: drag a new `testing` tab into the layout */
export const handleTestDragStart = (event: React.DragEvent<HTMLElement>, layout: ILayoutApi | null): void => {
    const gridName = nextTestTabName();
    event.dataTransfer.setData("text/plain", "FlexLayoutTab:" + JSON.stringify({ name: gridName }));
    layout!.setDragComponent(event.nativeEvent, gridName, 10, 10);
    layout!.addTabWithDragAndDrop(event.nativeEvent, { name: gridName, component: "testing", icon: "images/article.svg" });
};

/** wrap each menu item's onSelect so the e2e tests can read which item was chosen */
export const wrapContextMenuItems = (items: PopupMenuEntry[]): PopupMenuEntry[] => {
    for (const entry of items) {
        if (entry.type === "divider") {
            continue;
        }
        const item = entry as IPopupMenuItem;
        const original = item.onSelect;
        item.onSelect = (selected) => {
            (window as any).__lastContextSelect = selected.key;
            original?.(selected);
        };
    }
    return items;
};

/** factory components used only by the test layouts and the tests that create tabs imperatively */
export const TEST_FACTORY: Record<string, (node: TabNode) => React.ReactNode> = {
    testing: (node) => <div className="tab_content">{node.getName()}</div>,
    iframe: (node) => {
        // used by the iframe state-preservation e2e test: the srcDoc stamps a unique id on each
        // (re)load onto document.body, so a test can tell whether the iframe was reloaded when
        // its tab moved (preserved in-layout, reloaded when moved to a popout window)
        const srcDoc = "<!doctype html><body><input id='field'>" + "<script>document.body.dataset.loadId=Math.random().toString(36).slice(2)</script>";
        return <iframe title={node.getId()} data-testid={TEST_IDS.stateIframe} srcDoc={srcDoc} style={{ display: "block", border: "none", boxSizing: "border-box" }} width="100%" height="100%" />;
    },
};

/** onRenderTab additions asserted by view.spec "Extended App" (onRenderTab1/onRenderTab2) */
export const testOnRenderTab = (node: TabNode, renderValues: ITabRenderValues): void => {
    if (node.getId() === "onRenderTab1") {
        renderValues.leading = <img src="images/settings.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />;
        renderValues.content = "onRenderTab1";
        renderValues.buttons.push(<img src="images/folder.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />);
    } else if (node.getId() === "onRenderTab2") {
        renderValues.leading = <img src="images/settings.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />;
        renderValues.content = "onRenderTab2";
        renderValues.buttons.push(<img src="images/folder.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />);
    }
};

/** onRenderTabSet additions asserted by view.spec "Extended App" (onRenderTabSet1/2/3 + borders) */
export const testOnRenderTabSet = (node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues): void => {
    // note: the imgs must be given a size - unsized imgs of svgs without intrinsic dimensions
    // get the 300x150 default in webkit, blowing the toolbar up over the tabs
    if (node.getId() === "onRenderTabSet1") {
        renderValues.buttons.push(<img src="images/folder.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />);
        renderValues.buttons.push(<img src="images/settings.svg" key="2" alt="" style={{ width: "1em", height: "1em" }} />);
    } else if (node.getId() === "onRenderTabSet2") {
        renderValues.buttons.push(<img src="images/folder.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />);
        renderValues.buttons.push(<img src="images/settings.svg" key="2" alt="" style={{ width: "1em", height: "1em" }} />);
    } else if (node.getId() === "onRenderTabSet3") {
        renderValues.stickyButtons.push(
            <img src="images/add.svg" alt="Add" key="Add button" title="Add Tab (using onRenderTabSet callback, see Demo)" style={{ marginLeft: 5, width: 24, height: 24 }} />,
        );
    } else if (node instanceof BorderNode) {
        renderValues.buttons.push(<img src="images/folder.svg" key="1" alt="" style={{ width: "1em", height: "1em" }} />);
        renderValues.buttons.push(<img src="images/settings.svg" key="2" alt="" style={{ width: "1em", height: "1em" }} />);
    }
};
