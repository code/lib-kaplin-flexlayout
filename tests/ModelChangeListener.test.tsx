// @vitest-environment jsdom
import { Action, Actions, IJsonModel, Model } from "../src";

const json: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "Tab One" },
                    { type: "tab", id: "t1", name: "Tab Two" },
                ],
            },
        ],
    },
};

describe("ModelChangeListener", () => {
    it("the legacy function form fires after the mutation (backwards compatibility)", () => {
        const model = Model.fromJson(json);
        const seen: string[] = [];
        model.addChangeListener(() => {
            seen.push(model.getNodeById("t0") ? "exists" : "gone");
        });
        model.doAction(Actions.deleteTab("t0"));
        expect(seen).toEqual(["gone"]);
    });

    it("onBeforeAction fires before the mutation and onAfterAction after", () => {
        const model = Model.fromJson(json);
        const seen: string[] = [];
        model.addChangeListener({
            onBeforeAction: () => seen.push(`before:${model.getNodeById("t0") ? "exists" : "gone"}`),
            onAfterAction: () => seen.push(`after:${model.getNodeById("t0") ? "exists" : "gone"}`),
        });
        model.doAction(Actions.deleteTab("t0"));
        expect(seen).toEqual(["before:exists", "after:gone"]);
    });

    it("both callbacks are optional", () => {
        const model = Model.fromJson(json);
        const before: string[] = [];
        const after: string[] = [];
        model.addChangeListener({ onBeforeAction: (a) => before.push(a.type) });
        model.addChangeListener({ onAfterAction: (a) => after.push(a.type) });
        model.doAction(Actions.renameTab("t0", "renamed"));
        expect(before).toEqual([Actions.RENAME_TAB]);
        expect(after).toEqual([Actions.RENAME_TAB]);
    });

    it("removeChangeListener removes both the function and object forms", () => {
        const model = Model.fromJson(json);
        const calls: string[] = [];
        const fnListener = (a: Action) => calls.push(`fn:${a.type}`);
        const objListener = { onAfterAction: (a: Action) => calls.push(`obj:${a.type}`) };
        model.addChangeListener(fnListener);
        model.addChangeListener(objListener);
        model.doAction(Actions.renameTab("t0", "a"));
        model.removeChangeListener(fnListener);
        model.removeChangeListener(objListener);
        model.doAction(Actions.renameTab("t0", "b"));
        expect(calls).toEqual([`fn:${Actions.RENAME_TAB}`, `obj:${Actions.RENAME_TAB}`]);
    });
});
