// @vitest-environment jsdom
// Shared helpers for the jsdom view tests: build a model and a real LayoutController,
// which is what the components receive from LayoutInternal.
import * as React from "react";
import { DockLocation, IJsonModel, Model, TabNode } from "../../src";
import { ILayoutInternalProps, ILayoutInternalState, LayoutController } from "../../src/view/layout/LayoutInternal";

export const defaultFactory = (node: TabNode): React.ReactNode => <div>content for {node.getName()}</div>;

export function makeModel(json: IJsonModel): Model {
    return Model.fromJson(json);
}

export function controllerState(overrides: Partial<ILayoutInternalState> = {}): ILayoutInternalState {
    return {
        editingTab: undefined,
        showEdges: false,
        showOverlay: false,
        calculatedBorderBarSize: 29,
        layoutRedrawRevision: 0,
        fullRedrawRevision: 0,
        showHiddenBorder: DockLocation.CENTER,
        ...overrides,
    };
}

export function createController(model: Model, props: Partial<ILayoutInternalProps> = {}, layoutId?: string, stateOverrides: Partial<ILayoutInternalState> = {}): LayoutController {
    const state = controllerState(stateOverrides);
    const controller = new LayoutController(
        {
            model,
            factory: defaultFactory,
            ...props,
            layoutId,
        } as ILayoutInternalProps,
        state,
        (update) => {
            Object.assign(state, typeof update === "function" ? update(state, props as ILayoutInternalProps) : update);
        },
    );
    if (typeof document !== "undefined") {
        controller.setCurrentDocument(document);
        controller.setCurrentWindow(window);
        controller.setLayoutRef({ current: null });
    }
    return controller;
}
