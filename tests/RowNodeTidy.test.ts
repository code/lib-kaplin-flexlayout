// @vitest-environment node
import { Model, TabSetNode } from "../src";

describe("RowNode.tidy hoist single-child row", () => {
    it("hoists a single TabSet child and preserves the outer row weight (RowNode.ts:324, 348)", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "row",
                        id: "r1",
                        weight: 70,
                        children: [{ type: "tabset", id: "ts0", weight: 100, children: [{ type: "tab", name: "A" }] }],
                    },
                    { type: "tabset", id: "ts1", weight: 30, children: [{ type: "tab", name: "B" }] },
                ],
            },
        });
        const root = model.getRootRow()!;
        // r1 had a single tabset child, so tidy hoists it to the root and removes r1
        expect(root.getChildren().map((c) => c.getId())).toEqual(["ts0", "ts1"]);
        expect((model.getNodeById("ts0") as TabSetNode).getWeight()).toBe(70);
        expect((model.getNodeById("ts1") as TabSetNode).getWeight()).toBe(30);
    });

    it("hoists a RowNode child and distributes its weight proportionally (RowNode.ts:332-345)", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "row",
                        id: "r1",
                        weight: 60,
                        children: [
                            {
                                type: "row",
                                id: "r2",
                                children: [
                                    { type: "tabset", id: "ts0", weight: 30, children: [{ type: "tab", name: "A" }] },
                                    { type: "tabset", id: "ts1", weight: 70, children: [{ type: "tab", name: "B" }] },
                                ],
                            },
                        ],
                    },
                    { type: "tabset", id: "ts2", weight: 40, children: [{ type: "tab", name: "C" }] },
                ],
            },
        });
        const root = model.getRootRow()!;
        expect(root.getChildren().map((c) => c.getId())).toEqual(["ts0", "ts1", "ts2"]);
        // ts0 and ts1 share r1's weight proportionally
        expect((model.getNodeById("ts0") as TabSetNode).getWeight()).toBeCloseTo((60 * 30) / 100);
        expect((model.getNodeById("ts1") as TabSetNode).getWeight()).toBeCloseTo((60 * 70) / 100);
        expect((model.getNodeById("ts2") as TabSetNode).getWeight()).toBe(40);
        // no NaN weights
        for (const id of ["ts0", "ts1", "ts2"]) {
            expect(Number.isFinite((model.getNodeById(id) as TabSetNode).getWeight())).toBe(true);
        }
    });

    it("distributes evenly when all inner weights are zero — NaN guard (RowNode.ts:349, 344)", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "row",
                        id: "r1",
                        weight: 80,
                        children: [
                            {
                                type: "row",
                                id: "r2",
                                children: [
                                    { type: "tabset", id: "ts0", weight: 0, children: [{ type: "tab", name: "A" }] },
                                    { type: "tabset", id: "ts1", weight: 0, children: [{ type: "tab", name: "B" }] },
                                    { type: "tabset", id: "ts2", weight: 0, children: [{ type: "tab", name: "C" }] },
                                ],
                            },
                        ],
                    },
                ],
            },
        });
        const root = model.getRootRow()!;
        expect(root.getChildren().map((c) => c.getId())).toEqual(["ts0", "ts1", "ts2"]);
        for (const id of ["ts0", "ts1", "ts2"]) {
            const w = (model.getNodeById(id) as TabSetNode).getWeight();
            expect(w).toBeCloseTo(80 / 3);
            expect(Number.isFinite(w)).toBe(true);
            expect(Number.isNaN(w)).toBe(false);
        }
    });

    it("removes an empty child row without hoisting (RowNode.ts:326)", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    { type: "row", id: "rEmpty", children: [] },
                    { type: "tabset", id: "ts0", children: [{ type: "tab", name: "A" }] },
                ],
            },
        });
        const root = model.getRootRow()!;
        expect(root.getChildren().map((c) => c.getId())).toEqual(["ts0"]);
        expect(root.getChildren().some((c) => c.getId() === "rEmpty")).toBe(false);
    });

    it("recursively tidies nested single-child rows", () => {
        const model = Model.fromJson({
            global: {},
            layout: {
                type: "row",
                children: [
                    {
                        type: "row",
                        id: "r1",
                        weight: 100,
                        children: [
                            {
                                type: "row",
                                id: "r2",
                                weight: 100,
                                children: [{ type: "tabset", id: "ts0", weight: 100, children: [{ type: "tab", name: "A" }] }],
                            },
                        ],
                    },
                ],
            },
        });
        const root = model.getRootRow()!;
        // both r1 and r2 are single-child wrappers and should collapse to a single tabset
        expect(root.getChildren().map((c) => c.getId())).toEqual(["ts0"]);
        expect((model.getNodeById("ts0") as TabSetNode).getWeight()).toBe(100);
    });
});
