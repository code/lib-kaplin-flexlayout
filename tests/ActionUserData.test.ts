// @vitest-environment node
import { Actions, Model } from "../src";

describe("Action.userData", () => {
    it("defaults to undefined", () => {
        expect(Actions.selectTab("t0").userData).toBeUndefined();
    });

    it("setUserData sets the value and returns the action for chaining", () => {
        const payload = { source: "test" };
        const action = Actions.selectTab("t0");
        expect(action.setUserData(payload)).toBe(action);
        expect(action.userData).toBe(payload);
    });

    it("is omitted from toJSON when undefined and included when set", () => {
        expect(Actions.selectTab("t0").toJSON()).toEqual({ type: Actions.SELECT_TAB, data: { tabNode: "t0" } });
        expect(Actions.selectTab("t0").setUserData({ source: "test" }).toJSON()).toEqual({
            type: Actions.SELECT_TAB,
            data: { tabNode: "t0" },
            userData: { source: "test" },
        });
    });

    it("is visible on the action received by change listeners", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "One" }] }],
            },
        });
        const seen: unknown[] = [];
        model.addChangeListener({
            onBeforeAction: (action) => seen.push(action.userData),
            onAfterAction: (action) => seen.push(action.userData),
        });
        model.doAction(Actions.selectTab("t0").setUserData({ source: "test" }));
        expect(seen).toEqual([{ source: "test" }, { source: "test" }]);
    });
});
