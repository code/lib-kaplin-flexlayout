import * as React from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import type { TabNode } from "../src/index";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

// Row Data Interface
interface IRow {
    make: string;
    model: string;
    price: number;
    electric: boolean;
}

export const AGGridExample = (props: { theme?: string; node?: TabNode }) => {
    // ag-grid binds to the global document by default; when the tab is popped out into a
    // separate window this would attach its listeners to the wrong document, so point it at
    // the document this tab is actually rendered in (see the "Popout Windows" section of the
    // README for the node.getWindow()/getDocument() methods used here).
    const getDocument = () => props.node?.getWindow()?.document ?? document;

    // Row Data: The data to be displayed.
    const [rowData] = React.useState<IRow[]>([
        { make: "Tesla", model: "Model Y", price: 64950, electric: true },
        { make: "Ford", model: "F-Series", price: 33850, electric: false },
        { make: "Toyota", model: "Corolla", price: 29600, electric: false },
        { make: "Mercedes", model: "EQA", price: 48890, electric: true },
        { make: "Fiat", model: "500", price: 15774, electric: false },
        { make: "Nissan", model: "Juke", price: 20675, electric: false },
    ]);

    // Column Definitions: Defines & controls grid columns.
    const [colDefs] = React.useState<ColDef<IRow>[]>([{ field: "make" }, { field: "model" }, { field: "price" }, { field: "electric" }]);

    const isDark = props.theme?.includes("dark") || props.theme?.includes("gray");
    const gridTheme = isDark ? "ag-theme-alpine-dark" : "ag-theme-alpine";

    return (
        <div className={gridTheme} style={{ height: "100%" }}>
            <AgGridReact getDocument={getDocument} rowData={rowData} columnDefs={colDefs} />
        </div>
    );
};
