// @vitest-environment node
import { Model, TabGroupNode, TabNode, Rect } from "../src";

const tab = (id: string, name: string) => ({ type: "tab", id, name });
const group = (id: string, name: string, children: any[], extra: Record<string, any> = {}) => ({ type: "tabgroup", id, name, children, ...extra });

describe("TabGroupNode.getLines band-overlap wrap (TabGroupNode.ts:182)", () => {
    it("keeps pill and tabs on one line when y bands overlap with slight offset (+0.5 tolerance)", () => {
        const model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "A"), tab("t2", "B"), tab("t3", "C")])] }] },
        });
        const g = model.getNodeById("g1") as TabGroupNode;
        // pill at y=4, tabs at y=2 — bands overlap (2..33 vs 4..31) — must be one line
        g.setPillRect(new Rect(55, 4, 67, 27));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(136, 2, 91, 31));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(239, 2, 131, 31));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(382, 2, 83, 31));
        expect(g.getLines()).toHaveLength(1);
        expect(g.getLineRects()).toHaveLength(1);
        expect(g.getLineRects()[0].toJson()).toEqual({ x: 55, y: 2, width: 410, height: 31 });
    });

    it("splits into two lines when y gap exceeds 0.5px", () => {
        const model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [group("g1", "Design", [tab("t1", "A"), tab("t2", "B"), tab("t3", "C"), tab("t4", "D")])] }] },
        });
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(0, 0, 100, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(105, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(170, 0, 60, 30));
        (model.getNodeById("t3") as TabNode).setTabRect(new Rect(0, 40, 60, 30));
        (model.getNodeById("t4") as TabNode).setTabRect(new Rect(65, 40, 60, 30));
        const lines = g.getLines();
        expect(lines).toHaveLength(2);
        expect(lines[0].map((r) => r.toJson())).toEqual([
            { x: 0, y: 0, width: 100, height: 30 },
            { x: 105, y: 0, width: 60, height: 30 },
            { x: 170, y: 0, width: 60, height: 30 },
        ]);
        expect(lines[1].map((r) => r.toJson())).toEqual([
            { x: 0, y: 40, width: 60, height: 30 },
            { x: 65, y: 40, width: 60, height: 30 },
        ]);
    });

    it("respects 0.5px threshold — 30.4 stays same line, 30.6 starts new line", () => {
        const model = Model.fromJson({
            global: {},
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [group("g1", "G", [tab("t1", "A"), tab("t2", "B")])] }] },
        });
        const g = model.getNodeById("g1") as TabGroupNode;
        g.setPillRect(new Rect(0, 0, 100, 30)); // band 0..30
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(105, 0, 60, 30));
        // t2 at y=30.4 => start 30.4 < 30+0.5 (30.5) => same line
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(170, 30.4, 60, 30));
        expect(g.getLines()).toHaveLength(1);
        // move to 30.6 => start 30.6 < 30.5 false => new line
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(170, 30.6, 60, 30));
        expect(g.getLines()).toHaveLength(2);
    });

    it("groups by x-band for vertical left/right borders (BorderNode horizontal)", () => {
        const model = Model.fromJson({
            global: {},
            borders: [{ type: "border", location: "left", children: [group("g1", "G", [tab("t1", "A"), tab("t2", "B")])] }],
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "X" }] }] },
        });
        const g = model.getNodeById("g1") as TabGroupNode;
        // vertical = true means bands use x, not y — overlapping x bands stay together
        g.setPillRect(new Rect(0, 0, 30, 60));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(2, 70, 30, 60));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(2, 140, 30, 60));
        // pill x 0..30, t1 x 2..32 => start 2 <30+0.5 => same line, t2 x 2..32 but need to check grouping
        // t1 and t2 share same x band, but they are below pill — however vertical logic uses x bands,
        // so all three overlap in x and stay on one line (vertical stacking still one band)
        expect(g.getLines()).toHaveLength(1);
        // now move t2 far right: x=40 => start 40 < 32+0.5? false => new line
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(40, 140, 30, 60));
        expect(g.getLines()).toHaveLength(2);
    });
});
