// @vitest-environment node
import { Actions, GroupAction, IJsonModel, Model } from "../src";

const json: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "One" },
                    { type: "tab", id: "t1", name: "Two" },
                    { type: "tab", id: "t2", name: "Three" },
                ],
            },
        ],
    },
};

let model: Model;

beforeEach(() => {
    model = Model.fromJson(json);
});

describe("Actions.group / GroupAction", () => {
    it("builds a GroupAction with type GROUP, the actions array and json data", () => {
        const a = Actions.deleteTab("t0");
        const b = Actions.deleteTab("t1");
        const group = Actions.group([a, b]);
        expect(group).toBeInstanceOf(GroupAction);
        expect(group.type).toBe(Actions.GROUP);
        expect(group.actions).toEqual([a, b]);
        // data is the same array, so an action log shows the batch as a json array of the
        // individual actions
        expect(group.data).toEqual([a, b]);
        expect(JSON.parse(JSON.stringify(group.data))).toEqual([
            { type: Actions.DELETE_TAB, data: { node: "t0" } },
            { type: Actions.DELETE_TAB, data: { node: "t1" } },
        ]);
    });

    it("applies all contained actions with a single doAction call", () => {
        model.doAction(Actions.group([Actions.deleteTab("t0"), Actions.deleteTab("t1"), Actions.deleteTab("t2")]));
        expect(model.getNodeById("t0")).toBeUndefined();
        expect(model.getNodeById("t1")).toBeUndefined();
        expect(model.getNodeById("t2")).toBeUndefined();
    });

    it("notifies onBeforeAction/onAfterAction once for the whole group", () => {
        const before = vi.fn();
        const after = vi.fn();
        model.addChangeListener({ onBeforeAction: before, onAfterAction: after });
        model.doAction(Actions.group([Actions.deleteTab("t0"), Actions.deleteTab("t1")]));
        expect(before).toHaveBeenCalledTimes(1);
        expect(after).toHaveBeenCalledTimes(1);
        expect(before.mock.calls[0][0]).toBeInstanceOf(GroupAction);
        expect(after.mock.calls[0][0]).toBeInstanceOf(GroupAction);
    });

    it("notifies legacy function-form listeners once with the group", () => {
        const listener = vi.fn();
        model.addChangeListener(listener);
        model.doAction(Actions.group([Actions.deleteTab("t0"), Actions.deleteTab("t1")]));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toBeInstanceOf(GroupAction);
    });

    it("applies nested groups", () => {
        model.doAction(
            Actions.group([Actions.group([Actions.deleteTab("t0"), Actions.deleteTab("t1")]), Actions.deleteTab("t2")]),
        );
        expect(model.getNodeById("t0")).toBeUndefined();
        expect(model.getNodeById("t1")).toBeUndefined();
        expect(model.getNodeById("t2")).toBeUndefined();
    });

    it("ignores contained actions whose nodes no longer exist", () => {
        model.doAction(Actions.deleteTab("t0"));
        model.doAction(Actions.group([Actions.deleteTab("t0"), Actions.deleteTab("t1")]));
        expect(model.getNodeById("t1")).toBeUndefined();
    });

    it("an empty group is a no-op but still notifies once", () => {
        const listener = vi.fn();
        model.addChangeListener(listener);
        model.doAction(Actions.group([]));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(model.toJson()).toBeDefined();
    });
});
