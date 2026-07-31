// @vitest-environment node
import { IJsonModel, Model, TabNode, TabSetNode } from "../src";
import { BorderNode } from "../src/model/BorderNode";
import { adjustSelectedIndex, adjustSelectedIndexAfterInsert, randomUUID } from "../src/model/Utils";

let model: Model;

const json: IJsonModel = {
    global: {},
    borders: [{ type: "border", location: "left", children: [{ type: "tab", id: "b0", name: "B0" }] }],
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "A" },
                    { type: "tab", id: "t1", name: "B" },
                    { type: "tab", id: "t2", name: "C" },
                ],
            },
        ],
    },
};

beforeEach(() => {
    model = Model.fromJson(json);
});

const tabset = () => model.getNodeById("ts0") as TabSetNode;
const border = () => model.getNodeById("border_left") as BorderNode;
const tab = (id: string) => model.getNodeById(id) as TabNode;

describe("adjustSelectedIndexAfterInsert", () => {
    it("shifts the selected index when inserting at or before the selected tab (tabset)", () => {
        const ts = tabset();
        ts.setSelected(1);
        adjustSelectedIndexAfterInsert(ts, 0);
        expect(ts.getSelected()).equal(2);
        adjustSelectedIndexAfterInsert(ts, 3); // after the selected tab -> unchanged
        expect(ts.getSelected()).equal(2);
        adjustSelectedIndexAfterInsert(ts, 2, 2); // inserting two at the selected index
        expect(ts.getSelected()).equal(4);
    });

    it("shifts the selected index when inserting at or before the selected tab (border)", () => {
        const b = border();
        b.setSelected(0);
        adjustSelectedIndexAfterInsert(b, 0);
        expect(b.getSelected()).equal(1);
    });

    it("does nothing when nothing is selected or the count is zero", () => {
        const ts = tabset();
        ts.setSelected(-1);
        adjustSelectedIndexAfterInsert(ts, 0);
        expect(ts.getSelected()).equal(-1);

        ts.setSelected(1);
        adjustSelectedIndexAfterInsert(ts, 0, 0);
        expect(ts.getSelected()).equal(1);
    });
});

describe("adjustSelectedIndex", () => {
    it("selects the previous tab when a tab before the selected one is removed", () => {
        const ts = tabset();
        ts.setSelected(2);
        ts.removeChild(tab("t0"));
        adjustSelectedIndex(ts, 0);
        expect(ts.getSelected()).equal(1);
    });

    it("leaves the selection when a tab after the selected one is removed", () => {
        const ts = tabset();
        ts.setSelected(0);
        ts.removeChild(tab("t2"));
        adjustSelectedIndex(ts, 2);
        expect(ts.getSelected()).equal(0);
    });

    it("selects the following tab when the selected tab is removed (not the last)", () => {
        const ts = tabset();
        ts.setSelected(1);
        ts.removeChild(tab("t1"));
        adjustSelectedIndex(ts, 1);
        // children are now [A, C]; the selection stays at index 1 pointing at C
        expect(ts.getSelected()).equal(1);
    });

    it("selects the new last tab when the last tab is removed", () => {
        const ts = tabset();
        ts.setSelected(2);
        ts.removeChild(tab("t2"));
        adjustSelectedIndex(ts, 2);
        expect(ts.getSelected()).equal(1);
    });

    it("clears the selection when the only tab is removed", () => {
        const ts = tabset();
        ts.setSelected(0);
        ts.removeChild(tab("t0"));
        ts.removeChild(tab("t1"));
        ts.removeChild(tab("t2"));
        adjustSelectedIndex(ts, 0);
        expect(ts.getSelected()).equal(-1);
    });

    it("is a no-op when nothing is selected", () => {
        const ts = tabset();
        ts.setSelected(-1);
        ts.removeChild(tab("t0"));
        adjustSelectedIndex(ts, 0);
        expect(ts.getSelected()).equal(-1);
    });

    it("applies the same rules to border tabs", () => {
        const b = border();
        b.setSelected(0);
        b.removeChild(tab("b0"));
        adjustSelectedIndex(b, 0);
        expect(b.getSelected()).equal(-1);
    });
});

describe("randomUUID", () => {
    it("returns unique well-formed uuids", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 100; i++) {
            const uuid = randomUUID();
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(seen.has(uuid)).equal(false);
            seen.add(uuid);
        }
    });
});
