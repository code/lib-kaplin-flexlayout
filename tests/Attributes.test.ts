// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ICloseType } from "../src";
import { Attribute } from "../src/model/Attributes";
import { BorderNode } from "../src/model/BorderNode";
import { Model } from "../src/model/Model";
import { TabNode } from "../src/model/TabNode";
import { TabSetNode } from "../src/model/TabSetNode";

const attrByName = (attrs: Attribute[], name: string) => attrs.find((a) => a.name === name)!;

describe("Attribute.setValues", () => {
    const global = Model.getGlobalAttributeDefinitions().getAttributes();

    it("declares the possible values for the enum-like global attributes", () => {
        const closeType = attrByName(global, "tabCloseType");
        expect(closeType.getValues()).toEqual([
            { value: ICloseType.Visible, label: "Visible" },
            { value: ICloseType.Always, label: "Always" },
            { value: ICloseType.Selected, label: "Selected" },
        ]);

        const tabLocation = attrByName(global, "tabSetTabLocation");
        expect(tabLocation.getValues()).toEqual([
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
        ]);
    });

    it("declares the possible values for the border type", () => {
        const borderType = attrByName(BorderNode.getAttributeDefinitions().getAttributes(), "borderType");
        expect(borderType.getValues()).toEqual([
            { value: "split", label: "Split" },
            { value: "overlay", label: "Overlay" },
        ]);
    });

    it("resolves inherited attributes to the paired global attribute's values", () => {
        const tab = TabNode.getAttributeDefinitions().getAttributes();
        const tabSet = TabSetNode.getAttributeDefinitions().getAttributes();
        expect(attrByName(tab, "closeType").getValues()).toEqual(attrByName(global, "tabCloseType").getValues());
        expect(attrByName(tabSet, "tabLocation").getValues()).toEqual(attrByName(global, "tabSetTabLocation").getValues());
    });

    it("returns undefined for attributes without declared values", () => {
        expect(attrByName(global, "tabEnableClose").getValues()).toBeUndefined();
        expect(attrByName(TabNode.getAttributeDefinitions().getAttributes(), "name").getValues()).toBeUndefined();
    });

    it("auto-labels plain values", () => {
        const attr = new Attribute("x", undefined, undefined);
        attr.setValues(["alpha", "beta-gamma", 42, true]);
        expect(attr.getValues()).toEqual([
            { value: "alpha", label: "Alpha" },
            { value: "beta-gamma", label: "Beta-gamma" },
            { value: 42, label: "42" },
            { value: true, label: "true" },
        ]);
    });

    it("honours explicit labels and defaults the label to the value for objects", () => {
        const attr = new Attribute("x", undefined, undefined);
        attr.setValues([{ value: 1, label: "One" }, { value: 2 }, { value: "top" }]);
        expect(attr.getValues()).toEqual([
            { value: 1, label: "One" },
            { value: 2, label: "2" },
            { value: "top", label: "top" },
        ]);
    });
});
