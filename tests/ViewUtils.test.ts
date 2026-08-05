// @vitest-environment node
import { Actions, IJsonModel, Model, TabNode } from "../src";
import { ModelLayout } from "../src/model/ModelLayout";
import { canDockToLayout, domId, findParentLayout, hasModifier, IKeyEventLike } from "../src/view/Utils";

describe("domId", () => {
    it("replaces whitespace so the id is usable as an aria reference", () => {
        expect(domId("flexlayout-tab-", "My Tab")).equal("flexlayout-tab-My_Tab");
        expect(domId("prefix-", "no-space")).equal("prefix-no-space");
    });
});

describe("hasModifier", () => {
    const ev = (mods: Partial<IKeyEventLike> = {}): IKeyEventLike => ({ key: "x", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

    it("is false when no modifier is held", () => {
        expect(hasModifier(ev())).equal(false);
    });

    it("is true when any modifier is held", () => {
        expect(hasModifier(ev({ ctrlKey: true }))).equal(true);
        expect(hasModifier(ev({ shiftKey: true }))).equal(true);
        expect(hasModifier(ev({ altKey: true }))).equal(true);
        expect(hasModifier(ev({ metaKey: true }))).equal(true);
        expect(hasModifier(ev({ ctrlKey: true, metaKey: true }))).equal(true);
    });
});

describe("canDockToLayout / findParentLayout", () => {
    // a "tab" sublayout L1 hosted by a tab, a window popout, a float popout and a plain tab that
    // is not allowed in a window
    const makeModel = (): Model => {
        const model = Model.fromJson({
            global: { tabEnablePopout: true },
            layout: {
                type: "row",
                children: [
                    {
                        type: "tabset",
                        children: [
                            { type: "tab", id: "tHost", name: "Host", subLayoutId: "L1" },
                            { type: "tab", id: "t0", name: "A", enablePopout: false },
                            { type: "tab", id: "t1", name: "B" },
                        ],
                    },
                ],
            },
            subLayouts: {
                L1: { type: "tab", layout: { type: "row", children: [{ type: "tabset", children: [{ type: "tab", id: "tIn", name: "in" }] }] } },
            },
        } as IJsonModel);
        model.doAction(Actions.popoutTab("t1", "window"));
        model.doAction(Actions.popoutTab("t0", "float"));
        return model;
    };

    let model: Model;
    let tab: (id: string) => TabNode;

    beforeEach(() => {
        model = makeModel();
        // findParentLayout and canDockToLayout read the model through the layout's controller,
        // which is normally only attached by the view layer
        for (const layout of model.getLayouts().values()) {
            layout.setController({ getModel: () => model } as any);
        }
        tab = (id) => model.getNodeById(id) as TabNode;
    });

    const layoutOfType = (type: string): ModelLayout => Array.from(model.getLayouts().values()).find((l) => l.getType() === type && !l.isMainLayout())!;

    it("findParentLayout locates the hosting layout of a tab sublayout", () => {
        const subLayout = model.getLayouts().get("L1")!;
        const parent = findParentLayout(subLayout);
        expect(parent?.isMainLayout()).equal(true);
        // no tab hosts the main or window/float layouts
        expect(findParentLayout(model.getLayouts().get(Model.MAIN_LAYOUT_ID)!)).equal(undefined);
        expect(findParentLayout(layoutOfType("window"))).equal(undefined);
        expect(findParentLayout(layoutOfType("float"))).equal(undefined);
    });

    it("a window layout only accepts nodes allowed in a window", () => {
        const windowLayout = layoutOfType("window");
        expect(canDockToLayout(tab("t1"), windowLayout)).equal(true);
        expect(canDockToLayout(tab("t0"), windowLayout)).equal(false); // enablePopout: false
    });

    it("a float layout accepts anything", () => {
        expect(canDockToLayout(tab("t0"), layoutOfType("float"))).equal(true);
        expect(canDockToLayout(tab("t1"), layoutOfType("float"))).equal(true);
    });

    it("a tab sublayout rejects hosting tabs that carry their own sublayout", () => {
        const subLayout = model.getLayouts().get("L1")!;
        // a tab with its own subLayoutId cannot be docked into another sublayout
        expect(canDockToLayout(tab("tHost"), subLayout)).equal(false);
        // but a plain tab can
        expect(canDockToLayout(tab("t1"), subLayout)).equal(true);
    });

    it("rejects unknown layout types", () => {
        const bogus = layoutOfType("float");
        bogus.setType("bogus" as any);
        expect(canDockToLayout(tab("t1"), bogus)).equal(false);
    });
});
