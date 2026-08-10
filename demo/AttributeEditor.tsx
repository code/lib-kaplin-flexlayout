import * as React from "react";
import { Actions, IJsonModel, Model, ModelLayout, Node } from "../src/index";
import { Attribute } from "../src/model/Attributes";
import { getLayoutLabel, getNodeLabel } from "./ModelTree";

// a global attribute without its own description picks up the description of the node attribute
// it is paired with, e.g. tabEnableClose <-> enableClose (the pairing is done by the Model)
const getAttrDescription = (attr: Attribute): string | undefined => {
    return attr.description || attr.pairedAttr?.description;
};

// attributes that must not be defaulted or cleared by the editor: a tab's name (which falls back to
// "unnamed tab" when unset) and component (which is required for the factory to render the tab)
const isProtectedAttr = (attrName: string): boolean => attrName === "name" || attrName === "component";

interface IEditorTarget {
    label: string;
    node?: Node;
    layout?: ModelLayout;
    attributes: Attribute[];
}

interface IAttrRow {
    attr: Attribute;
    value: any;
    hasOverride: boolean;
    inherited: boolean;
    readOnly: boolean;
    // whether the built-in "Default" action makes sense for this attribute; a tab's name and
    // component are required for it to render sensibly, so defaulting them would break the tab
    canDefault: boolean;
}

const resolveTarget = (model: Model, selectedId: string): IEditorTarget | undefined => {
    if (selectedId === "global") {
        return { label: "Global", attributes: Model.getGlobalAttributeDefinitions().getAttributes() };
    }
    if (selectedId.startsWith("sublayout:")) {
        const layout = model.getLayouts().get(selectedId.slice("sublayout:".length));
        if (layout) {
            return { label: getLayoutLabel(layout), layout, attributes: layout.getAttributeDefinitions().getAttributes() };
        }
        return undefined;
    }
    const node = model.getNodeById(selectedId);
    if (node) {
        return { label: getNodeLabel(node), node, attributes: node.getAttributeDefinitions().getAttributes() };
    }
    return undefined;
};

const getAttrRows = (model: Model, target: IEditorTarget): IAttrRow[] => {
    return target.attributes
        .filter((attr) => !attr.fixed)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((attr) => {
            const readOnly = attr.name === "id";
            // a sublayout's attributes are plain metadata (no id/component) so they can always be
            // defaulted/cleared
            const canDefault = target.layout !== undefined ? true : !isProtectedAttr(attr.name);
            if (target.layout !== undefined) {
                const layout = target.layout;
                const value = layout.getAttr(attr.name);
                return { attr, value, hasOverride: value !== attr.defaultValue, inherited: false, readOnly, canDefault };
            }
            if (target.node === undefined) {
                const value = model.getAttribute(attr.name);
                return { attr, value, hasOverride: value !== attr.defaultValue, inherited: false, readOnly, canDefault };
            }
            const node = target.node;
            const value = node.getAttr(attr.name);
            if (attr.modelName !== undefined) {
                // an inherited attribute is overridden only if the node has its own value
                const hasOverride = node.getAttributeOwn(attr.name) !== undefined;
                return { attr, value, hasOverride, inherited: true, readOnly, canDefault };
            }
            return { attr, value, hasOverride: value !== attr.defaultValue, inherited: false, readOnly, canDefault };
        });
};

// finds the json of a node (or border/tab) within a serialized layout subtree, matching by id
const findNodeJson = (json: any, id: string): any => {
    if (json == null || typeof json !== "object") {
        return undefined;
    }
    if (json.id === id) {
        return json;
    }
    const children = json.children;
    if (Array.isArray(children)) {
        for (const child of children) {
            const found = findNodeJson(child, id);
            if (found !== undefined) {
                return found;
            }
        }
    }
    return undefined;
};

// finds the serialized json of the given node within the snapshot of the loaded layout
const findBaselineNode = (baseline: IJsonModel, node: Node): any => {
    for (const border of baseline.borders ?? []) {
        const found = findNodeJson(border, node.getId());
        if (found !== undefined) {
            return found;
        }
    }
    const main = findNodeJson(baseline.layout, node.getId());
    if (main !== undefined) {
        return main;
    }
    const subLayouts = baseline.subLayouts ?? baseline.popouts;
    if (subLayouts !== undefined) {
        for (const layoutId in subLayouts) {
            const found = findNodeJson(subLayouts[layoutId]?.layout, node.getId());
            if (found !== undefined) {
                return found;
            }
        }
    }
    return undefined;
};

// builds the json that resets a node to its built-in defaults: own attributes use their default
// value, inherited attributes are cleared (an explicit undefined) so they fall back to the global
// value. A tab's id/name/component are left untouched - clearing them would break the tab.
const buildDefaultNodeJson = (node: Node): Record<string, any> => {
    const json: Record<string, any> = {};
    for (const attr of node.getAttributeDefinitions().getAttributes()) {
        if (attr.fixed || attr.name === "id" || isProtectedAttr(attr.name)) {
            continue;
        }
        json[attr.name] = attr.modelName !== undefined ? undefined : attr.defaultValue;
    }
    return json;
};

const buildDefaultGlobalJson = (): Record<string, any> => {
    const json: Record<string, any> = {};
    for (const attr of Model.getGlobalAttributeDefinitions().getAttributes()) {
        if (attr.fixed) {
            continue;
        }
        json[attr.name] = attr.defaultValue;
    }
    return json;
};

// builds the json that restores a node to the values it had in the loaded layout: attributes that
// were set in the layout are restored, attributes that were left at their default are cleared (so
// inherited attributes fall back to the global value and own attributes use their built-in default).
// A tab's name/component are only ever set to a value present in the loaded layout - they are never
// cleared by a reset.
const buildResetNodeJson = (node: Node, baselineJson: any): Record<string, any> => {
    const json: Record<string, any> = {};
    for (const attr of node.getAttributeDefinitions().getAttributes()) {
        if (attr.fixed || attr.name === "id") {
            continue;
        }
        const baselineHasValue = baselineJson !== undefined && Object.prototype.hasOwnProperty.call(baselineJson, attr.name) && baselineJson[attr.name] !== undefined;
        if (isProtectedAttr(attr.name)) {
            if (baselineHasValue) {
                json[attr.name] = baselineJson[attr.name];
            }
            continue;
        }
        if (baselineHasValue) {
            json[attr.name] = baselineJson[attr.name];
        } else if (attr.modelName !== undefined) {
            // an explicit undefined removes an override so the global/inherited value is used again
            json[attr.name] = undefined;
        } else {
            json[attr.name] = attr.defaultValue;
        }
    }
    return json;
};

const buildResetGlobalJson = (baselineGlobal: any): Record<string, any> => {
    const json: Record<string, any> = {};
    for (const attr of Model.getGlobalAttributeDefinitions().getAttributes()) {
        if (attr.fixed) {
            continue;
        }
        if (baselineGlobal !== undefined && Object.prototype.hasOwnProperty.call(baselineGlobal, attr.name) && baselineGlobal[attr.name] !== undefined) {
            json[attr.name] = baselineGlobal[attr.name];
        } else {
            json[attr.name] = attr.defaultValue;
        }
    }
    return json;
};

// builds the json that resets a sublayout to its built-in defaults: each attribute is cleared to an
// explicit undefined so an explicitly stored value is removed and the built-in default applies
const buildDefaultLayoutJson = (layout: ModelLayout): Record<string, any> => {
    const json: Record<string, any> = {};
    for (const attr of layout.getAttributeDefinitions().getAttributes()) {
        if (attr.fixed) {
            continue;
        }
        json[attr.name] = attr.defaultValue;
    }
    return json;
};

// builds the json that restores a sublayout to the values it had in the loaded layout: attributes
// that were set in the layout are restored, attributes that were left at their default are cleared
const buildResetLayoutJson = (layout: ModelLayout, baselineJson: any): Record<string, any> => {
    const json: Record<string, any> = {};
    for (const attr of layout.getAttributeDefinitions().getAttributes()) {
        if (attr.fixed) {
            continue;
        }
        if (baselineJson !== undefined && Object.prototype.hasOwnProperty.call(baselineJson, attr.name) && baselineJson[attr.name] !== undefined) {
            json[attr.name] = baselineJson[attr.name];
        } else {
            json[attr.name] = attr.defaultValue;
        }
    }
    return json;
};

// deep-compares two values by their serialized form, so object-valued attributes (e.g. config)
// are compared structurally rather than by reference
const valuesEqual = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

// the value an attribute had when the panel opened: the baseline json entry of the target if it was
// set there, otherwise no override (inherited) or the built-in default (own). Used both to restore
// a single attribute to its original layout value and to detect session changes
const getBaselineValue = (baselineJson: any, attr: Attribute): any => {
    if (baselineJson !== undefined && Object.prototype.hasOwnProperty.call(baselineJson, attr.name) && baselineJson[attr.name] !== undefined) {
        return baselineJson[attr.name];
    }
    if (attr.modelName !== undefined) {
        return undefined; // inherited: no override in the loaded layout
    }
    return attr.defaultValue;
};

// finds the serialized json of the selected item within the snapshot of the loaded layout: a
// sublayout target is the subLayouts entry itself, the global target the global entry
const getBaselineJson = (baseline: IJsonModel | null, target: IEditorTarget): any => {
    if (target.layout !== undefined) {
        const subLayouts = baseline?.subLayouts ?? baseline?.popouts;
        return subLayouts?.[target.layout.getLayoutId()];
    }
    if (target.node === undefined) {
        return baseline?.global;
    }
    return baseline ? findBaselineNode(baseline, target.node) : undefined;
};

// the attribute's own value now (no inheritance resolution), so changes to the selected item are
// reported independently of the global attributes it inherits from
const getCurrentOwnValue = (model: Model, target: IEditorTarget, attr: Attribute): any => {
    if (target.layout !== undefined) {
        return target.layout.getAttr(attr.name);
    }
    if (target.node === undefined) {
        return model.getAttribute(attr.name);
    }
    return target.node.getAttributeOwn(attr.name);
};

type ControlKind = "boolean" | "number" | "string" | "select" | "json";

// the control is driven by the attribute's effective type (its own type, or for an inherited
// attribute without a type the type of the global model attribute it is paired with); an attribute
// that declares its possible values renders as a dropdown
const getControlKind = (attr: Attribute): ControlKind => {
    if (attr.getValues() !== undefined) {
        return "select";
    }
    const type = attr.getEffectiveType();
    if (type === Attribute.BOOLEAN) {
        return "boolean";
    }
    if (type === Attribute.NUMBER) {
        return "number";
    }
    if (type === Attribute.STRING) {
        return "string";
    }
    return "json";
};

const getSelectOptions = (attr: Attribute): { value: any; label: string }[] => {
    return (attr.getValues() ?? []).map((v) => ({ value: v.value, label: v.label }));
};

const formatJsonValue = (value: any): string => {
    if (value === undefined) {
        return "{}";
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const JsonControl = ({ value, onChange }: { value: any; onChange: (value: any) => void }) => {
    const [draft, setDraft] = React.useState<string>(() => formatJsonValue(value));
    const [error, setError] = React.useState<string | null>(null);

    const commit = () => {
        try {
            onChange(JSON.parse(draft));
            setError(null);
        } catch (e) {
            setError(String(e));
        }
    };

    return (
        <div className="attrs-json-control">
            <textarea
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        commit();
                    }
                }}
            />
            {error && <div className="attrs-json-error">{error}</div>}
        </div>
    );
};

interface IAttrControlProps {
    attr: Attribute;
    value: any;
    onChange: (value: any) => void;
}

const AttrControl = ({ attr, value, onChange }: IAttrControlProps) => {
    const kind = getControlKind(attr);

    switch (kind) {
        case "boolean":
            return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
        case "number":
            return (
                <input
                    type="number"
                    step="any"
                    value={value ?? ""}
                    onChange={(e) => {
                        const v = e.currentTarget.valueAsNumber;
                        if (!Number.isNaN(v)) {
                            onChange(v);
                        }
                    }}
                />
            );
        case "string":
            return <input type="text" value={value ?? ""} readOnly={attr.name === "id"} onChange={(e) => onChange(e.target.value)} />;
        case "select": {
            const options = getSelectOptions(attr);
            return (
                <select
                    value={String(value)}
                    onChange={(e) => {
                        const option = options.find((o) => String(o.value) === e.currentTarget.value);
                        if (option) {
                            onChange(option.value);
                        }
                    }}
                >
                    {options.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                            {o.label}
                        </option>
                    ))}
                </select>
            );
        }
        case "json":
            // keyed by the serialized value so the draft state resets whenever the value changes
            return <JsonControl key={formatJsonValue(value)} value={value} onChange={onChange} />;
    }
};

interface IAttrRowProps {
    row: IAttrRow;
    canResetDefault: boolean;
    canResetReset: boolean;
    onCommit: (attr: Attribute, value: any) => void;
    onResetDefault: (row: IAttrRow) => void;
    onResetReset: (row: IAttrRow) => void;
}

const AttrRow = ({ row, canResetDefault, canResetReset, onCommit, onResetDefault, onResetReset }: IAttrRowProps) => {
    return (
        <div className="attrs-editor-row">
            <label className="attrs-editor-label" title={getAttrDescription(row.attr)}>
                {row.attr.name}
            </label>
            <div className="attrs-editor-control">
                <AttrControl attr={row.attr} value={row.value} onChange={(v) => onCommit(row.attr, v)} />
            </div>
            {row.inherited && (
                <span
                    className={"attrs-editor-inherited" + (row.hasOverride ? "" : " active")}
                    title={row.hasOverride ? "Overrides the global attribute " + row.attr.modelName : "Inherited from the global attribute " + row.attr.modelName}
                >
                    {row.hasOverride ? "override" : "inherited"}
                </span>
            )}
            <button
                className="attrs-editor-default"
                title={"Restore " + row.attr.name + " to the value it had in the loaded layout"}
                onClick={() => onResetReset(row)}
                disabled={!canResetReset || row.readOnly}
            >
                Reset
            </button>
            <button
                className="attrs-editor-default"
                title={"Set " + row.attr.name + " to its default value"}
                onClick={() => onResetDefault(row)}
                disabled={!canResetDefault || row.readOnly || !row.canDefault}
            >
                Default
            </button>
        </div>
    );
};

export interface IAttributeEditorProps {
    model: Model;
    selectedId: string;
}

export function AttributeEditor({ model, selectedId }: IAttributeEditorProps) {
    const target = resolveTarget(model, selectedId);
    const rows = target ? getAttrRows(model, target) : [];

    // snapshot of the loaded layout, taken when the panel is opened, so a per-attribute reset can
    // restore the value the layout was loaded with and the session changes can be detected. Memoised
    // on the model so it is captured once per model and re-captured only when a new model is passed.
    const baseline = React.useMemo<IJsonModel | null>(() => model.toJson(), [model]);

    const baselineJson = target ? getBaselineJson(baseline, target) : undefined;

    // how many attributes are not at their built-in default (top-level Default button count)
    const defaultCount = rows.filter((r) => r.hasOverride && !r.readOnly && r.canDefault).length;

    // whether the attribute's own value differs from the value it had in the loaded layout
    const isChangedSinceLoad = (row: IAttrRow): boolean => !valuesEqual(getCurrentOwnValue(model, target!, row.attr), getBaselineValue(baselineJson, row.attr));

    // how many attributes differ from the value they had in the loaded layout (top-level Reset button count)
    const resetCount = rows.filter((r) => !r.readOnly && isChangedSinceLoad(r)).length;

    const commit = (attr: Attribute, value: any) => {
        if (!target) {
            return;
        }
        if (target.layout !== undefined) {
            model.doAction(Actions.updateSubLayoutAttributes(target.layout.getLayoutId(), { [attr.name]: value } as any));
        } else if (target.node === undefined) {
            model.doAction(Actions.updateModelAttributes({ [attr.name]: value } as any));
        } else {
            model.doAction(Actions.updateNodeAttributes(target.node.getId(), { [attr.name]: value } as any));
        }
    };

    // restores a single attribute to its built-in default
    const resetRowToDefault = (row: IAttrRow) => {
        if (!target) {
            return;
        }
        if (target.layout !== undefined) {
            model.doAction(Actions.updateSubLayoutAttributes(target.layout.getLayoutId(), { [row.attr.name]: row.attr.defaultValue } as any));
        } else if (target.node === undefined) {
            model.doAction(Actions.updateModelAttributes({ [row.attr.name]: row.attr.defaultValue } as any));
        } else if (isProtectedAttr(row.attr.name)) {
            return;
        } else if (row.inherited) {
            model.doAction(Actions.updateNodeAttributes(target.node.getId(), { [row.attr.name]: undefined } as any));
        } else {
            model.doAction(Actions.updateNodeAttributes(target.node.getId(), { [row.attr.name]: row.attr.defaultValue } as any));
        }
    };

    // restores a single attribute to the value it had in the loaded layout
    const resetRowToBaseline = (row: IAttrRow) => {
        if (!target) {
            return;
        }
        const baselineValue = getBaselineValue(baselineJson, row.attr);
        if (target.layout !== undefined) {
            model.doAction(Actions.updateSubLayoutAttributes(target.layout.getLayoutId(), { [row.attr.name]: baselineValue } as any));
        } else if (target.node === undefined) {
            model.doAction(Actions.updateModelAttributes({ [row.attr.name]: baselineValue } as any));
        } else {
            if (isProtectedAttr(row.attr.name) && baselineValue === undefined) {
                return; // never clear a tab's name/component
            }
            model.doAction(Actions.updateNodeAttributes(target.node.getId(), { [row.attr.name]: baselineValue } as any));
        }
    };

    // sets every attribute of the selected item to its built-in default
    const resetAllToDefaults = () => {
        if (!target) {
            return;
        }
        if (target.layout !== undefined) {
            model.doAction(Actions.updateSubLayoutAttributes(target.layout.getLayoutId(), buildDefaultLayoutJson(target.layout) as any));
        } else if (target.node === undefined) {
            model.doAction(Actions.updateModelAttributes(buildDefaultGlobalJson() as any));
        } else {
            model.doAction(Actions.updateNodeAttributes(target.node.getId(), buildDefaultNodeJson(target.node) as any));
        }
    };

    // restores every attribute of the selected item to the value it had in the loaded layout
    const resetAllToBaseline = () => {
        if (!target) {
            return;
        }
        if (target.layout !== undefined) {
            model.doAction(Actions.updateSubLayoutAttributes(target.layout.getLayoutId(), buildResetLayoutJson(target.layout, getBaselineJson(baseline, target)) as any));
        } else if (target.node === undefined) {
            model.doAction(Actions.updateModelAttributes(buildResetGlobalJson(baseline?.global) as any));
        } else {
            const baselineNodeJson = baseline ? findBaselineNode(baseline, target.node) : undefined;
            model.doAction(Actions.updateNodeAttributes(target.node.getId(), buildResetNodeJson(target.node, baselineNodeJson) as any));
        }
    };

    return (
        <div className="attrs-editor">
            <div className="attrs-editor-header">
                <span className="attrs-editor-title">{target ? target.label : "No selection"}</span>
                <button
                    className="attrs-editor-btn"
                    title="Restore every attribute of the selected item to the value it had in the loaded layout"
                    onClick={resetAllToBaseline}
                    disabled={!target || resetCount === 0}
                >
                    Reset ({resetCount})
                </button>
                <button className="attrs-editor-btn" title="Set every attribute of the selected item to its default value" onClick={resetAllToDefaults} disabled={!target || defaultCount === 0}>
                    Default ({defaultCount})
                </button>
            </div>
            {target ? (
                <div className="attrs-editor-body">
                    {rows.map((row) => (
                        <AttrRow
                            key={row.attr.name}
                            row={row}
                            canResetDefault={row.hasOverride}
                            canResetReset={isChangedSinceLoad(row)}
                            onCommit={commit}
                            onResetDefault={resetRowToDefault}
                            onResetReset={resetRowToBaseline}
                        />
                    ))}
                </div>
            ) : (
                <div className="attrs-editor-empty">Select an item in the tree above to edit its attributes.</div>
            )}
        </div>
    );
}
