import { DockLocation, Orientation, Rect } from "../src";

describe("DockLocation", () => {
    const square = new Rect(0, 0, 100, 100);

    describe("getLocation", () => {
        it("resolves the center region", () => {
            expect(DockLocation.getLocation(square, 25, 25)).equal(DockLocation.CENTER);
            expect(DockLocation.getLocation(square, 50, 50)).equal(DockLocation.CENTER);
            expect(DockLocation.getLocation(square, 74, 74)).equal(DockLocation.CENTER);
        });

        it("resolves the edges", () => {
            expect(DockLocation.getLocation(square, 50, 0)).equal(DockLocation.TOP);
            expect(DockLocation.getLocation(square, 50, 100)).equal(DockLocation.BOTTOM);
            expect(DockLocation.getLocation(square, 0, 50)).equal(DockLocation.LEFT);
            expect(DockLocation.getLocation(square, 100, 50)).equal(DockLocation.RIGHT);
        });

        it("resolves the corners", () => {
            expect(DockLocation.getLocation(square, 0, 0)).equal(DockLocation.LEFT);
            expect(DockLocation.getLocation(square, 100, 0)).equal(DockLocation.RIGHT);
            expect(DockLocation.getLocation(square, 0, 100)).equal(DockLocation.BOTTOM);
            expect(DockLocation.getLocation(square, 100, 100)).equal(DockLocation.BOTTOM);
        });
    });

    describe("getDockRect", () => {
        it("splits the rect for top and bottom", () => {
            expect(DockLocation.TOP.getDockRect(square)).toEqual(new Rect(0, 0, 100, 50));
            expect(DockLocation.BOTTOM.getDockRect(square)).toEqual(new Rect(0, 50, 100, 50));
        });

        it("splits the rect for left and right", () => {
            expect(DockLocation.LEFT.getDockRect(square)).toEqual(new Rect(0, 0, 50, 100));
            expect(DockLocation.RIGHT.getDockRect(square)).toEqual(new Rect(50, 0, 50, 100));
        });

        it("returns the whole rect for center", () => {
            expect(DockLocation.CENTER.getDockRect(square)).toEqual(square);
        });
    });

    describe("identity and geometry metadata", () => {
        it("getByName returns the matching singleton", () => {
            expect(DockLocation.getByName("top")).equal(DockLocation.TOP);
            expect(DockLocation.getByName("bottom")).equal(DockLocation.BOTTOM);
            expect(DockLocation.getByName("left")).equal(DockLocation.LEFT);
            expect(DockLocation.getByName("right")).equal(DockLocation.RIGHT);
            expect(DockLocation.getByName("center")).equal(DockLocation.CENTER);
        });

        it("exposes orientation and indexPlus", () => {
            expect(DockLocation.TOP.getOrientation()).equal(Orientation.VERT);
            expect(DockLocation.BOTTOM.getOrientation()).equal(Orientation.VERT);
            expect(DockLocation.LEFT.getOrientation()).equal(Orientation.HORZ);
            expect(DockLocation.RIGHT.getOrientation()).equal(Orientation.HORZ);

            expect(DockLocation.TOP.indexPlus).equal(0);
            expect(DockLocation.BOTTOM.indexPlus).equal(1);
            expect(DockLocation.LEFT.indexPlus).equal(0);
            expect(DockLocation.RIGHT.indexPlus).equal(1);
        });

        it("has a readable string form", () => {
            expect(DockLocation.TOP.toString()).equal("(DockLocation: name=top, orientation=vert)");
            expect(DockLocation.LEFT.toString()).equal("(DockLocation: name=left, orientation=horz)");
        });
    });
});
