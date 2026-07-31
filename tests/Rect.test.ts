import { Rect } from "../src";

describe("Rect", () => {
    it("centerInRect accounts for the outer rect origin", () => {
        const inner = new Rect(0, 0, 100, 50);
        inner.centerInRect(new Rect(200, 300, 400, 250));
        expect(inner.x).equal(200 + (400 - 100) / 2);
        expect(inner.y).equal(300 + (250 - 50) / 2);
    });

    it("exposes right and bottom edges", () => {
        const r = new Rect(10, 20, 100, 50);
        expect(r.getRight()).equal(110);
        expect(r.getBottom()).equal(70);
        expect(r.right).equal(110);
        expect(r.bottom).equal(70);
    });

    it("computes the center", () => {
        expect(new Rect(10, 20, 100, 50).getCenter()).toEqual({ x: 60, y: 45 });
    });

    it("contains a point inclusive of the edges", () => {
        const r = new Rect(0, 0, 100, 100);
        expect(r.contains(0, 0)).equal(true);
        expect(r.contains(100, 100)).equal(true);
        expect(r.contains(50, 50)).equal(true);
        expect(r.contains(101, 50)).equal(false);
        expect(r.contains(50, -1)).equal(false);
    });

    it("clones without sharing the underlying values", () => {
        const r = new Rect(1, 2, 3, 4);
        const c = r.clone();
        expect(c.equals(r)).equal(true);
        c.x = 99;
        expect(r.x).equal(1);
    });

    it("equals compares all fields and handles null/undefined", () => {
        const r = new Rect(1, 2, 3, 4);
        expect(r.equals(new Rect(1, 2, 3, 4))).equal(true);
        expect(r.equals(new Rect(1, 2, 3, 5))).equal(false);
        expect(r.equals(null)).equal(false);
        expect(r.equals(undefined)).equal(false);
    });

    it("equalsWhenRounded tolerates sub-pixel differences", () => {
        const r = new Rect(1.2, 2.4, 3.6, 4.8);
        expect(r.equalsWhenRounded(new Rect(1.6, 2.7, 3.9, 4.9))).equal(true);
        expect(r.equalsWhenRounded(new Rect(5, 2.4, 3.6, 4.8))).equal(false);
        expect(r.equalsWhenRounded(null)).equal(false);
    });

    it("snaps all fields to the nearest multiple", () => {
        const r = new Rect(3, 7, 11, 13);
        r.snap(4);
        expect(r.x).equal(4);
        expect(r.y).equal(8);
        expect(r.width).equal(12);
        expect(r.height).equal(12);
    });

    it("relativeTo offsets the origin, keeping the size", () => {
        const rel = new Rect(10, 10, 50, 50).relativeTo(new Rect(5, 5, 100, 100));
        expect(rel).toEqual(new Rect(5, 5, 50, 50));
    });

    it("clamps size and position to an outer rect", () => {
        const outer = new Rect(0, 0, 100, 100);

        // too big -> shrunk to fit
        const big = new Rect(10, 10, 200, 200);
        big.clamp(outer);
        expect(big.width).equal(100);
        expect(big.height).equal(100);

        // off to the top-left -> pushed in
        const tl = new Rect(-20, -20, 50, 50);
        tl.clamp(outer);
        expect(tl.x).equal(0);
        expect(tl.y).equal(0);

        // off to the bottom-right -> pulled back
        const br = new Rect(80, 80, 50, 50);
        br.clamp(outer);
        expect(br.x).equal(50);
        expect(br.y).equal(50);
    });

    it("serializes to json and back", () => {
        const json = new Rect(1, 2, 3, 4).toJson();
        expect(json).toEqual({ x: 1, y: 2, width: 3, height: 4 });
        const restored = Rect.fromJson(json);
        expect(restored).toEqual(new Rect(1, 2, 3, 4));
    });

    it("empty is a zero rect", () => {
        expect(Rect.empty()).toEqual(new Rect(0, 0, 0, 0));
    });

    it("styleWithPosition writes px values and clamps negative sizes", () => {
        const style: Record<string, string> = {};
        new Rect(10, 20, -5, 30).styleWithPosition(style as any);
        expect(style.left).equal("10px");
        expect(style.top).equal("20px");
        expect(style.width).equal("0px"); // negative size clamped
        expect(style.height).equal("30px");
        expect(style.position).equal("absolute");
    });

    it("builds from an element's getBoundingClientRect", () => {
        const element = { getBoundingClientRect: () => ({ x: 1, y: 2, width: 3, height: 4 }) } as unknown as Element;
        expect(Rect.getBoundingClientRect(element)).toEqual(new Rect(1, 2, 3, 4));
    });

    it("builds from a DOMRect", () => {
        const domRect = { x: 5, y: 6, width: 7, height: 8 } as unknown as DOMRect;
        expect(Rect.fromDomRect(domRect)).toEqual(new Rect(5, 6, 7, 8));
    });

    it("has a readable string form", () => {
        expect(new Rect(1, 2, 3, 4).toString()).equal("(Rect: x=1, y=2, width=3, height=4)");
    });
});
