// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { Actions, DockLocation, IJsonModel, Model } from "../src";
import { useUndo } from "../src";

const json: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            { type: "tabset", id: "ts1", children: [{ type: "tab", id: "t1", name: "Tab One" }] },
            { type: "tabset", id: "ts2", children: [{ type: "tab", id: "t2", name: "Tab Two" }] },
        ],
    },
};

describe("useUndo", () => {
    it("records a snapshot per action; undo restores and redo re-applies", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json)));

        act(() => {
            result.current.model!.doAction(Actions.deleteTab("t1"));
        });
        expect(result.current.undoCount).toBe(1);
        expect(result.current.canUndo).toBe(true);
        expect(result.current.model!.getNodeById("t1")).toBeUndefined();

        act(() => {
            result.current.undo();
        });
        expect(result.current.model!.getNodeById("t1")).not.toBeUndefined();
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(true);
        expect(result.current.redoCount).toBe(1);

        act(() => {
            result.current.redo();
        });
        expect(result.current.model!.getNodeById("t1")).toBeUndefined();
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);
    });

    it("ignores SET_ACTIVE_TABSET by default", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json)));

        act(() => {
            result.current.model!.doAction(Actions.setActiveTabset("ts2"));
        });
        expect(result.current.undoCount).toBe(0);
        expect(result.current.canUndo).toBe(false);
    });

    it("honors custom ignoreActionTypes", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json), { ignoreActionTypes: [Actions.RENAME_TAB] }));

        act(() => {
            result.current.model!.doAction(Actions.renameTab("t1", "renamed"));
        });
        expect(result.current.undoCount).toBe(0);

        act(() => {
            result.current.model!.doAction(Actions.deleteTab("t1"));
        });
        expect(result.current.undoCount).toBe(1);
    });

    it("collapses an entire drag gesture into a single undo step", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json)));

        act(() => {
            result.current.model!.doAction(Actions.moveNode("t1", "ts2", DockLocation.CENTER, -1).setAdjusting(true));
            result.current.model!.doAction(Actions.moveNode("t1", "ts2", DockLocation.CENTER, -1).setAdjusting(true));
            result.current.model!.doAction(Actions.moveNode("t1", "ts2", DockLocation.CENTER, -1));
        });
        expect(result.current.undoCount).toBe(1);

        act(() => {
            result.current.undo();
        });
        expect(result.current.model!.getNodeById("ts1")!.getChildren().length).toBe(1);
        expect(result.current.model!.getNodeById("ts2")!.getChildren().length).toBe(1);
    });

    it("collapses a GroupAction into a single undo step and restores all tabs on undo", () => {
        const groupJson: IJsonModel = {
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        id: "ts1",
                        children: [
                            { type: "tab", id: "t1", name: "One" },
                            { type: "tab", id: "t2", name: "Two" },
                            { type: "tab", id: "t3", name: "Three" },
                        ],
                    },
                ],
            },
        };
        const { result } = renderHook(() => useUndo(Model.fromJson(groupJson)));

        act(() => {
            result.current.model!.doAction(Actions.group([Actions.deleteTab("t1"), Actions.deleteTab("t2"), Actions.deleteTab("t3")]));
        });
        expect(result.current.undoCount).toBe(1);
        expect(result.current.model!.getNodeById("t1")).toBeUndefined();
        expect(result.current.model!.getNodeById("t2")).toBeUndefined();
        expect(result.current.model!.getNodeById("t3")).toBeUndefined();

        act(() => {
            result.current.undo();
        });
        expect(result.current.canUndo).toBe(false);
        expect(result.current.model!.getNodeById("t1")).not.toBeUndefined();
        expect(result.current.model!.getNodeById("t2")).not.toBeUndefined();
        expect(result.current.model!.getNodeById("t3")).not.toBeUndefined();
    });

    it("caps the undo buffer at maxBufferSize", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json), { maxBufferSize: 2 }));

        act(() => {
            result.current.model!.doAction(Actions.renameTab("t1", "a"));
            result.current.model!.doAction(Actions.renameTab("t1", "b"));
            result.current.model!.doAction(Actions.renameTab("t1", "c"));
        });
        expect(result.current.undoCount).toBe(2);
    });

    it("setModel replaces the model and resets the history by default", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json)));

        act(() => {
            result.current.model!.doAction(Actions.deleteTab("t1"));
        });
        expect(result.current.undoCount).toBe(1);

        const fresh = Model.fromJson(json);
        act(() => {
            result.current.setModel(fresh);
        });
        expect(result.current.model).toBe(fresh);
        expect(result.current.undoCount).toBe(0);
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
    });

    it("setModel keeps the history when resetHistory is false", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json)));

        act(() => {
            result.current.model!.doAction(Actions.deleteTab("t1"));
        });
        expect(result.current.undoCount).toBe(1);

        act(() => {
            result.current.setModel(Model.fromJson(json), false);
        });
        expect(result.current.undoCount).toBe(1);
        expect(result.current.canUndo).toBe(true);
    });

    it("reset clears the history without replacing the model", () => {
        const { result } = renderHook(() => useUndo(Model.fromJson(json)));

        act(() => {
            result.current.model!.doAction(Actions.deleteTab("t1"));
        });
        expect(result.current.undoCount).toBe(1);

        act(() => {
            result.current.reset();
        });
        expect(result.current.undoCount).toBe(0);
        expect(result.current.redoCount).toBe(0);
        expect(result.current.model!.getNodeById("t1")).toBeUndefined();
    });
});
