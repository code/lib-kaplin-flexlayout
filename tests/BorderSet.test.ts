// @vitest-environment node
import { Actions, IJsonModel, Model, Rect, TabGroupNode, TabNode } from "../src";

const json: IJsonModel = {
    global: {},
    borders: [
        {
            type: "border",
            location: "top",
            children: [
                { type: "tab", id: "t1", name: "T1" },
                { type: "tab", id: "t2", name: "T2" },
            ],
        },
        { type: "border", location: "left", show: false, children: [{ type: "tab", id: "t3", name: "T3" }] },
    ],
    layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "drag", name: "D" }] }] },
};

let model: Model;

beforeEach(() => {
    model = Model.fromJson(json);
});

const border = (location: string) =>
    model
        .getBorderSet()
        .getBorders()
        .find((b) => b.getLocation().getName() === location)!;

describe("BorderSet", () => {
    it("fromJson and toJson round-trip borders and their tabs", () => {
        expect(model.getBorderSet().getBorders().length).equal(2);
        const out = model.getBorderSet().toJson();
        expect(out.map((b) => b.location)).toEqual(["top", "left"]);

        const again = Model.fromJson(model.toJson());
        expect(again.getBorderSet().getBorders().length).equal(2);
    });

    it("forEachNode visits each border then its tabs with levels", () => {
        const seen: string[] = [];
        model.getBorderSet().forEachNode((node, level) => seen.push(level + ":" + node.getType() + ":" + node.getId()));
        expect(seen).toEqual(["0:border:border_top", "1:tab:t1", "1:tab:t2", "0:border:border_left", "1:tab:t3"]);
    });

    it("setPaths assigns border and tab paths", () => {
        model.getBorderSet().setPaths();
        expect(border("top").getPath()).equal("/border/top");
        expect((model.getNodeById("t1") as TabNode).getPath()).equal("/border/top/t0");
        expect((model.getNodeById("t2") as TabNode).getPath()).equal("/border/top/t1");
    });

    it("setPaths recurses into border groups so grouped tabs get unique paths", () => {
        model = Model.fromJson({
            global: {},
            borders: [
                {
                    type: "border",
                    location: "left",
                    children: [
                        { type: "tab", id: "bt0", name: "B0" },
                        {
                            type: "tabgroup",
                            id: "bg1",
                            name: "BGroup",
                            children: [
                                { type: "tab", id: "bt1", name: "B1" },
                                { type: "tab", id: "bt2", name: "B2" },
                            ],
                        },
                    ],
                },
            ],
            layout: { type: "row", children: [{ type: "tabset", id: "ts0", children: [{ type: "tab", id: "t0", name: "T" }] }] },
        } as IJsonModel);

        model.getBorderSet().setPaths();
        expect((model.getNodeById("bt0") as TabNode).getPath()).equal("/border/left/t0");
        expect((model.getNodeById("bg1") as TabGroupNode).getPath()).equal("/border/left/g1");
        // previously these stayed "" and collided on data-layout-path
        expect((model.getNodeById("bt1") as TabNode).getPath()).equal("/border/left/g1/t0");
        expect((model.getNodeById("bt2") as TabNode).getPath()).equal("/border/left/g1/t1");
    });

    it("getBorderMap indexes borders by their location", () => {
        const map = model.getBorderSet().getBorderMap();
        expect(map.get(border("top").getLocation())).equal(border("top"));
        expect(map.get(border("left").getLocation())).equal(border("left"));
    });

    it("findDropTargetNode only considers showing borders", () => {
        const top = border("top");
        top.setTabHeaderRect(new Rect(0, 0, 200, 30));
        (model.getNodeById("t1") as TabNode).setTabRect(new Rect(0, 0, 60, 30));
        (model.getNodeById("t2") as TabNode).setTabRect(new Rect(60, 0, 60, 30));

        // the top border (showing) offers a drop; the hidden left border is skipped
        expect(model.getBorderSet().findDropTargetNode(model.getNodeById("drag") as TabNode, 20, 5)).toBeDefined();

        // hide the top border too: no drop targets remain
        model.doAction(Actions.updateNodeAttributes("border_top", { show: false } as any));
        expect(model.getBorderSet().findDropTargetNode(model.getNodeById("drag") as TabNode, 20, 5)).equal(undefined);
    });
});

describe("BorderNode size and visibility", () => {
    it("isShowing reflects the show attribute (default true)", () => {
        expect(border("top").isShowing()).equal(true);
        expect(border("left").isShowing()).equal(false);
    });

    it("getSize defaults to the inherited border size and updates via setSize", () => {
        expect(border("top").getSize()).equal(200); // global borderSize default
        border("top").setSize(123);
        expect(border("top").getSize()).equal(123);
    });

    it("getSize honours a selected tab's borderHeight (top border)", () => {
        const top = border("top");
        top.setSelected(1); // t2 selected
        const t2 = model.getNodeById("t2") as TabNode;
        t2.setBorderHeight(75);
        expect(top.getSize()).equal(75);
        t2.setBorderHeight(-1); // -1 defers to the border size
        top.setSize(50);
        expect(top.getSize()).equal(50);
    });

    it("getSize honours a selected tab's borderWidth (left border)", () => {
        const left = border("left");
        left.setSelected(0);
        const t3 = model.getNodeById("t3") as TabNode;
        t3.setBorderWidth(90);
        expect(left.getSize()).equal(90);
    });

    it("getMinSize and getMaxSize clamp to the selected tab's min/max", () => {
        const top = border("top");
        top.setSelected(0);
        model.doAction(Actions.updateNodeAttributes("t1", { minHeight: 60, maxHeight: 200 }));
        expect(top.getMinSize()).equal(60); // max(borderMinSize=1, tab min 60)
        expect(top.getMaxSize()).equal(200); // min(borderMaxSize=99999, tab max 200)
    });
});
