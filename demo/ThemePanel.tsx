import * as React from "react";
import { ILayoutApi } from "../src/index";

interface IThemePanelProps {
    layoutApi: React.RefObject<ILayoutApi | null>;
}

interface IColorDef {
    label: string;
    group: string;
    varName: string;
}

interface IMetricDef {
    label: string;
    varName: string;
    min: number;
    max: number;
    step: number;
    unit: string;
}

const COLOR_VARS: IColorDef[] = [
    { group: "Core", label: "Text", varName: "--color-text" },
    { group: "Core", label: "Background", varName: "--color-background" },
    { group: "Core", label: "Base", varName: "--color-base" },
    { group: "Core", label: "Color 1", varName: "--color-1" },
    { group: "Core", label: "Color 2", varName: "--color-2" },
    { group: "Core", label: "Color 3", varName: "--color-3" },
    { group: "Core", label: "Color 4", varName: "--color-4" },
    { group: "Core", label: "Color 5", varName: "--color-5" },
    { group: "Core", label: "Color 6", varName: "--color-6" },
    { group: "Core", label: "Drag 1", varName: "--color-drag1" },
    { group: "Core", label: "Drag 2", varName: "--color-drag2" },
    { group: "Core", label: "Drag 1 background", varName: "--color-drag1-background" },
    { group: "Core", label: "Drag 2 background", varName: "--color-drag2-background" },
    { group: "Tabs", label: "Selected", varName: "--color-tab-selected" },
    { group: "Tabs", label: "Selected background", varName: "--color-tab-selected-background" },
    { group: "Tabs", label: "Unselected", varName: "--color-tab-unselected" },
    { group: "Tabs", label: "Unselected background", varName: "--color-tab-unselected-background" },
    { group: "Tabs", label: "Rename textbox text", varName: "--color-tab-textbox" },
    { group: "Tabs", label: "Rename textbox background", varName: "--color-tab-textbox-background" },
    { group: "Tabset", label: "Background", varName: "--color-tabset-background" },
    { group: "Tabset", label: "Selected background", varName: "--color-tabset-background-selected" },
    { group: "Tabset", label: "Maximized background", varName: "--color-tabset-background-maximized" },
    { group: "Tabset", label: "Divider line", varName: "--color-tabset-divider-line" },
    { group: "Border", label: "Selected", varName: "--color-border-tab-selected" },
    { group: "Border", label: "Selected background", varName: "--color-border-tab-selected-background" },
    { group: "Border", label: "Unselected", varName: "--color-border-tab-unselected" },
    { group: "Border", label: "Unselected background", varName: "--color-border-tab-unselected-background" },
    { group: "Border", label: "Background", varName: "--color-border-background" },
    { group: "Border", label: "Divider line", varName: "--color-border-divider-line" },
    { group: "Border", label: "Tab content", varName: "--color-border-tab-content" },
    { group: "Splitter", label: "Splitter", varName: "--color-splitter" },
    { group: "Splitter", label: "Hover", varName: "--color-splitter-hover" },
    { group: "Splitter", label: "Drag", varName: "--color-splitter-drag" },
    { group: "Splitter", label: "Handle", varName: "--color-splitter-handle" },
    { group: "Menu", label: "Border", varName: "--color-popup-border" },
    { group: "Menu", label: "Unselected", varName: "--color-popup-unselected" },
    { group: "Menu", label: "Unselected background", varName: "--color-popup-unselected-background" },
    { group: "Menu", label: "Selected", varName: "--color-popup-selected" },
    { group: "Menu", label: "Selected background", varName: "--color-popup-selected-background" },
    { group: "Drag Rect", label: "Border", varName: "--color-drag-rect-border" },
    { group: "Drag Rect", label: "Background", varName: "--color-drag-rect-background" },
    { group: "Drag Rect", label: "Text", varName: "--color-drag-rect" },
    { group: "Misc", label: "Icon", varName: "--color-icon" },
    { group: "Misc", label: "Overflow", varName: "--color-overflow" },
    { group: "Misc", label: "Focus", varName: "--color-focus" },
    { group: "Misc", label: "Toolbar button hover", varName: "--color-toolbar-button-hover" },
    { group: "Misc", label: "Edge marker", varName: "--color-edge-marker" },
    { group: "Misc", label: "Edge icon", varName: "--color-edge-icon" },
];

const METRIC_VARS: IMetricDef[] = [
    { label: "Splitter size", varName: "--splitter-size", min: 1, max: 20, step: 1, unit: "px" },
    { label: "Splitter active size", varName: "--splitter-active-size", min: 1, max: 20, step: 1, unit: "px" },
    { label: "Tab button radius", varName: "--tab-button-radius", min: 0, max: 30, step: 1, unit: "px" },
    { label: "Border button radius", varName: "--border-button-radius", min: 0, max: 30, step: 1, unit: "px" },
    { label: "Mini scroll indicator size", varName: "--size-mini-scroll-indicator", min: 2, max: 10, step: 1, unit: "px" },
];

const ALL_VARS = [...COLOR_VARS.map((c) => c.varName), ...METRIC_VARS.map((m) => m.varName)];

// overrides are written to the global --flexlayout-<name> variables (every theme variable is
// defined as `var(--flexlayout-<name>, <theme default>)`), which resolve at their point of use and
// so reach every nested layout (float windows, sublayouts) and, via the layout root's inline style
// sync, popout windows. The layout root is the target: it is an ancestor of all in-document layouts
// and is the element whose inline styles are copied into popout windows.
const toGlobalVar = (varName: string): string => "--flexlayout-" + varName.slice(2);

const getLayoutElement = (layoutApi: React.RefObject<ILayoutApi | null>): HTMLElement | null => layoutApi.current?.getRootDiv() ?? null;

// normalizes any css color (named colors, hex shorthands, rgb()/rgba(), etc.) to its canonical
// form using a canvas; a shared context is used to avoid creating one per call
let colorNormalizer: CanvasRenderingContext2D | null | undefined;
const normalizeColor = (cssColor: string): string => {
    if (colorNormalizer === undefined) {
        colorNormalizer = document.createElement("canvas").getContext("2d");
    }
    if (colorNormalizer) {
        colorNormalizer.fillStyle = cssColor;
        return colorNormalizer.fillStyle;
    }
    return cssColor;
};

// converts a css color to #rrggbb for use in <input type="color">
const toHex = (cssColor: string): string => {
    let normalized = cssColor.trim();
    if (!/^#([0-9a-f]{6})$/i.test(normalized)) {
        normalized = normalizeColor(normalized);
    }
    const match = normalized.match(/^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/);
    if (match) {
        return "#" + [1, 2, 3].map((i) => Math.round(Number(match[i])).toString(16).padStart(2, "0")).join("");
    }
    if (/^#([0-9a-f]{6})$/i.test(normalized)) {
        return normalized.toLowerCase();
    }
    return "#000000";
};

const groupColors = (): { group: string; defs: IColorDef[] }[] => {
    const groups: { group: string; defs: IColorDef[] }[] = [];
    for (const def of COLOR_VARS) {
        let g = groups.find((x) => x.group === def.group);
        if (!g) {
            g = { group: def.group, defs: [] };
            groups.push(g);
        }
        g.defs.push(def);
    }
    for (const g of groups) {
        g.defs.sort((a, b) => a.label.localeCompare(b.label));
    }
    return groups;
};

export const ThemePanel = ({ layoutApi }: IThemePanelProps) => {
    const [overrides, setOverrides] = React.useState<Record<string, string>>({});

    // keep the DOM element in sync with the override state (re-applies if the element is recreated)
    React.useEffect(() => {
        const el = getLayoutElement(layoutApi);
        if (!el) return;
        for (const [varName, value] of Object.entries(overrides)) {
            el.style.setProperty(toGlobalVar(varName), value);
        }
    }, [overrides, layoutApi]);

    const getComputedValue = (varName: string): string => {
        const el = getLayoutElement(layoutApi);
        if (!el) return "";
        return getComputedStyle(el).getPropertyValue(varName).trim();
    };

    const applyOverride = (varName: string, value: string) => {
        const el = getLayoutElement(layoutApi);
        if (!el) return;
        el.style.setProperty(toGlobalVar(varName), value);
        setOverrides((prev) => ({ ...prev, [varName]: value }));
    };

    const resetVar = (varName: string) => {
        const el = getLayoutElement(layoutApi);
        if (!el) return;
        el.style.removeProperty(toGlobalVar(varName));
        setOverrides((prev) => {
            const next = { ...prev };
            delete next[varName];
            return next;
        });
    };

    const resetAll = () => {
        const el = getLayoutElement(layoutApi);
        if (!el) return;
        for (const varName of ALL_VARS) {
            el.style.removeProperty(toGlobalVar(varName));
        }
        setOverrides({});
    };

    const printCss = () => {
        const lines = Object.entries(overrides).map(([varName, value]) => `    ${toGlobalVar(varName)}: ${value};`);
        const css = `/* FlexLayout theme overrides */\n.flexlayout__layout {\n${lines.join("\n")}\n}`;
        console.log(css);
    };

    const overrideCount = Object.keys(overrides).length;
    const ready = getLayoutElement(layoutApi) !== null;

    if (!ready) {
        return <div className="theme-panel">Layout not ready...</div>;
    }

    return (
        <div className="theme-panel">
            <div className="theme-panel-header">
                <span className="theme-panel-title">Theme Customization</span>
                <button className="theme-panel-reset-all" title="print the overridden css to the developer console" onClick={printCss} disabled={overrideCount === 0}>
                    Print CSS
                </button>
                <button className="theme-panel-reset-all" onClick={resetAll} disabled={overrideCount === 0}>
                    Reset all ({overrideCount})
                </button>
            </div>

            <h3>Color Palette</h3>
            <div className="theme-panel-note">Overrides the colors of the currently selected theme.</div>
            {groupColors().map((g) => (
                <div className="theme-panel-group" key={g.group}>
                    <h4>{g.group}</h4>
                    {g.defs.map((def) => (
                        <ColorRow
                            key={def.varName}
                            def={def}
                            value={toHex(overrides[def.varName] ?? getComputedValue(def.varName))}
                            overridden={def.varName in overrides}
                            onApply={applyOverride}
                            onReset={resetVar}
                        />
                    ))}
                </div>
            ))}

            <h3>Metrics</h3>
            <div className="theme-panel-note">Numeric layout values of the currently selected theme.</div>
            <div className="theme-panel-group">
                {METRIC_VARS.map((def) => {
                    const current = overrides[def.varName] ?? getComputedValue(def.varName);
                    const numeric = parseFloat(current) || def.min;
                    return <MetricRow key={def.varName} def={def} value={numeric} overridden={def.varName in overrides} onApply={(v) => applyOverride(def.varName, v + def.unit)} onReset={resetVar} />;
                })}
            </div>
        </div>
    );
};

interface IColorRowProps {
    def: IColorDef;
    value: string;
    overridden: boolean;
    onApply: (varName: string, value: string) => void;
    onReset: (varName: string) => void;
}

const ColorRow = ({ def, value, overridden, onApply, onReset }: IColorRowProps) => {
    return (
        <div className="theme-panel-row">
            <label className="theme-panel-label" title={def.varName}>
                {def.label}
            </label>
            <input type="color" title={def.label} aria-label={def.label} value={value} onChange={(e) => onApply(def.varName, e.target.value)} />
            <button className="theme-panel-default" title={"Set " + def.varName + " to the theme default"} onClick={() => onReset(def.varName)} disabled={!overridden}>
                Default
            </button>
        </div>
    );
};

interface IMetricRowProps {
    def: IMetricDef;
    value: number;
    overridden: boolean;
    onApply: (value: number) => void;
    onReset: (varName: string) => void;
}

const MetricRow = ({ def, value, overridden, onApply, onReset }: IMetricRowProps) => {
    return (
        <div className="theme-panel-row">
            <label className="theme-panel-label" title={def.varName}>
                {def.label}
            </label>
            <input type="range" title={def.label} aria-label={def.label} min={def.min} max={def.max} step={def.step} value={value} onChange={(e) => onApply(Number(e.target.value))} />
            <span className="theme-panel-value">
                {value}
                {def.unit}
            </span>
            <button className="theme-panel-default" title={"Set " + def.varName + " to the theme default"} onClick={() => onReset(def.varName)} disabled={!overridden}>
                Default
            </button>
        </div>
    );
};
