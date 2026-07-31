// @vitest-environment node
import { Actions, IJsonModel, Model, Rect, TabNode, TabSetNode } from "../src";
import { BorderNode } from "../src/model/BorderNode";

const base: IJsonModel = {
    global: {},
    layout: {
        type: "row",
        children: [
            {
                type: "tabset",
                id: "ts0",
                children: [
                    { type: "tab", id: "t0", name: "A" },
                    { type: "tab", id: "t1", name: "B" },
                ],
            },
        ],
    },
};

const nonMainLayouts = (model: Model) => Array.from(model.getLayouts().values()).filter((l) => !l.isMainLayout());

describe("popout actions", () => {
    let model: Model;

    beforeEach(() => {
        model = Model.fromJson(base);
    });

    it("popoutTab moves the tab into a new window layout", () => {
        model.doAction(Actions.popoutTab("t1", "window"));

        const layout = nonMainLayouts(model)[0];
        expect(layout.getType()).equal("window");
        expect((model.getNodeById("t1") as TabNode).getLayoutId()).equal(layout.getLayoutId());
        // the tab no longer lives in the main layout's tabset
        expect((model.getNodeById("ts0") as TabSetNode).getChildren().map((c) => c.getId())).not.toContain("t1");
    });

    it("popoutTab with float type creates a float layout", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        expect(nonMainLayouts(model)[0].getType()).equal("float");
    });

    it("popoutTabset moves the whole tabset into a window layout", () => {
        model.doAction(Actions.popoutTabset("ts0"));

        const layout = nonMainLayouts(model)[0];
        expect(layout.getType()).equal("window");
        expect((model.getNodeById("ts0") as TabSetNode).getLayoutId()).equal(layout.getLayoutId());
        expect((model.getNodeById("ts0") as TabSetNode).getChildren().length).equal(2);
    });

    it("createSubLayout builds a layout from json and returns its id", () => {
        const layoutId = model.doAction(
            Actions.createSubLayout({ type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "x" }] }] }, { x: 0, y: 0, width: 200, height: 150 }, "window"),
        ) as string;

        const layout = model.getLayouts().get(layoutId)!;
        expect(layout.getType()).equal("window");
        expect(layout.getRect()).toEqual(new Rect(0, 0, 200, 150));
        expect(layout.getRootRow()!.getChildren().length).equal(1);
    });

    it("moveFloat repositions a float layout", () => {
        model.doAction(Actions.popoutTab("t1", "float"));
        const layout = nonMainLayouts(model)[0];

        model.doAction(Actions.moveFloat(layout.getLayoutId(), new Rect(10, 20, 300, 200)));
        expect(layout.getRect()).toEqual(new Rect(10, 20, 300, 200));
    });

    it("movePopoutToFront moves the layout to the end of the layouts map", () => {
        model.doAction(Actions.popoutTab("t0", "window"));
        model.doAction(Actions.popoutTab("t1", "window"));

        const ids = () => Array.from(model.getLayouts().keys());
        const firstNonMain = ids()[1];
        model.doAction(Actions.movePopoutToFront(firstNonMain));
        expect(ids()[ids().length - 1]).equal(firstNonMain);
    });

    it("closePopout converts the window into a float centered over the main layout", () => {
        model.doAction(Actions.popoutTab("t1", "window"));
        const layout = nonMainLayouts(model)[0];

        // closePopout reads the main layout's dom rect through its controller
        model.getMainLayout().setController({ getDomRect: () => ({ width: 800, height: 600 }) } as any);
        model.doAction(Actions.closePopout(layout.getLayoutId()));

        expect(layout.getType()).equal("float");
        expect(layout.getRect()).toEqual(new Rect(200, 150, 400, 300));
    });

    it("adjustBorderSplit sets the border size", () => {
        const withBorder = Model.fromJson({
            global: {},
            borders: [{ type: "border", location: "left", children: [{ type: "tab", name: "x" }] }],
            layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", name: "y" }] }] },
        });
        const border = withBorder.getBorderSet().getBorders()[0] as BorderNode;

        withBorder.doAction(Actions.adjustBorderSplit(border.getId(), 123));
        expect(border.getSize()).equal(123);
    });
});
