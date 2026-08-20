import * as React from "react";
import { createRoot } from "react-dom/client";
import {
    Action,
    Actions,
    BorderNode,
    TabGroupNode,
    IJsonTabNode,
    ITabRenderValues,
    ITabSetRenderValues,
    Layout,
    Model,
    Node,
    TabNode,
    TabSetNode,
    AddIcon,
    MenuIcon,
    SettingsIcon,
    ILayoutApi,
    showPopupMenu,
    showGroupMenu,
    PopupMenuEntry,
    ContextMenuBuilder,
    useUndo,
} from "../src/index";
import { NewFeatures } from "./NewFeatures";
import { SimpleForm } from "./SimpleForm";
import { Utils } from "./Utils";
import { AGGridExample } from "./aggrid";
import { JsonView } from "./JsonView";
import { ActionLog } from "./ActionLog";
import MapComponent from "./openlayer";
import MonacoComponent from "./monaco";
import TerminalComponent from "./terminal";
import MUIComponent from "./MUIComponent";
import MUIDataGrid from "./MUIDataGrid";
import BarChart from "./chart";
import * as testing from "./testing";
import { PopoutStyleProvider } from "./PopoutStyleProvider";
import { StyledComponentsDemo } from "./StyledComponentsDemo";

import "prismjs/themes/prism-coy.css"; // styles the JSON rendered by the JsonView tab
import "../style/combined.scss";
import "./styles.css";
import { TabProperties } from "./TabProperties";
import { ModelExplorer } from "./ModelExplorer";
import { ThemePanel } from "./ThemePanel";
import { TabLayout } from "../src/view/TabLayout";

function App() {
    // ---------------------------------------------------------------------------
    // State & refs
    // ---------------------------------------------------------------------------

    // the name of the current layout, from the URL ?layout=<name> query param
    const [layoutName, setLayoutName] = React.useState<string | null>(() => {
        if (typeof window === "undefined") return "default";
        const params = new URLSearchParams(window.location.search);
        return params.get("layout") || "default";
    });
    // undo/redo: the hook owns the model and records an undo snapshot before each mutation
    const { model, setModel, undo, redo, canUndo, canRedo, undoCount, redoCount } = useUndo(() => {
        if (typeof window === "undefined" || !layoutName) return null;
        const json = localStorage.getItem(layoutName);
        if (json != null) {
            try {
                return Model.fromJson(JSON.parse(json));
            } catch (e) {
                console.error("Error parsing layout from localStorage", e);
            }
        }
        return null;
    });
    const [realtimeResize, setRealtimeResize] = React.useState<boolean>(true);
    const [showLayoutStructure, setShowLayoutStructure] = React.useState<boolean>(false);
    const [renderMode, setRenderMode] = React.useState<"examples" | "properties" | "blank">("examples");

    const [popoutClassName, setPopoutClassName] = React.useState<string>("flexlayout__theme_alpha_light");

    const loadingLayoutName = React.useRef<string | null>(null);
    const nextGridIndex = React.useRef<number>(1);

    const contextMenuHideRef = React.useRef<(() => void) | null>(null);
    const layoutRef = React.useRef<ILayoutApi | null>(null);

    // current values kept in refs to prevent closure problems
    const currentModel = React.useRef<Model | null>(model);
    const currentLayoutName = React.useRef<string | null>(layoutName);
    const loadLayoutRef = React.useRef<(name: string, reload?: boolean) => void>(() => {});
    const loadFromJsonRef = React.useRef<(jsonText: string) => void>(() => {});

    React.useEffect(() => {
        currentModel.current = model;
        currentLayoutName.current = layoutName;
        // expose the live model/layout to the e2e tests (inert otherwise)
        testing.installTestHooks({ getModel: () => currentModel.current, getLayout: () => layoutRef.current });
    });

    const saveLayout = () => {
        if (currentModel.current && currentLayoutName.current) {
            const jsonStr = JSON.stringify(currentModel.current.toJson(), null, "\t");
            localStorage.setItem(currentLayoutName.current, jsonStr);
        }
    };

    // load a layout from its JSON text (from localStorage or the .layout file)
    const loadLayoutFromJson = (jsonText: string) => {
        setModel(Model.fromJson(JSON.parse(jsonText)));
        setLayoutName(loadingLayoutName.current!);
    };

    const onLoadError = (reason: string) => {
        alert("Error loading json config file: " + loadingLayoutName.current + "\n" + reason);
    };

    const loadLayout = (name: string, reload?: boolean) => {
        if (layoutName !== null) {
            saveLayout();
        }

        loadingLayoutName.current = name;
        let loaded = false;
        if (!reload) {
            const json = localStorage.getItem(name);
            if (json != null) {
                loadLayoutFromJson(json);
                loaded = true;
            }
        }

        if (!loaded) {
            Utils.downloadFile("layouts/" + name + ".layout", loadLayoutFromJson, onLoadError);
        }
    };

    // keep the latest loadLayout/loadLayoutFromJson functions in refs so effects registered once can call them
    React.useEffect(() => {
        loadLayoutRef.current = loadLayout;
        loadFromJsonRef.current = loadLayoutFromJson;
    });

    React.useEffect(() => {
        // save layout when unloading page
        const handleBeforeUnload = () => {
            saveLayout();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);

        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        const layout = params.get("layout") || "default";

        // Only download layout from file if not already present in localStorage
        const hasSavedLayout = localStorage.getItem(layout) !== null;
        if (!hasSavedLayout) {
            loadingLayoutName.current = layout;
            Utils.downloadFile("layouts/" + layout + ".layout", (jsonText: string) => loadFromJsonRef.current(jsonText), onLoadError);
        }

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, []);

    React.useEffect(() => {
        // Ctrl+Alt+R restores the current layout from the file, so a layout that has been
        // broken by attribute edits (e.g. via the model explorer) can always be recovered
        const handleReset = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "r") {
                event.preventDefault();
                const name = currentLayoutName.current;
                if (name != null) {
                    loadLayoutRef.current(name, true);
                }
            }
        };
        window.addEventListener("keydown", handleReset);

        return () => {
            window.removeEventListener("keydown", handleReset);
        };
    }, []);

    // ---------------------------------------------------------------------------
    // Drag & drop: move tabs, drag a tab from the toolbar, drop external content
    // ---------------------------------------------------------------------------

    const onTableDragStart = (event: React.DragEvent<HTMLDivElement>, node: Node) => {
        layoutRef.current!.moveTabWithDragAndDrop(event.nativeEvent, node as TabNode);
    };

    const onAddDragStart = (event: React.DragEvent<HTMLElement>) => {
        event.stopPropagation();
        if (testing.isTestLayout(layoutName)) {
            testing.handleTestDragStart(event, layoutRef.current);
        } else {
            const gridName = "Grid " + nextGridIndex.current++;
            event.dataTransfer.setData("text/plain", "FlexLayoutTab:" + JSON.stringify({ name: gridName }));
            layoutRef.current!.setDragComponent(event.nativeEvent, gridName, 10, 10);
            layoutRef.current!.addTabWithDragAndDrop(event.nativeEvent, { name: gridName, component: "grid", icon: "images/article.svg" });
        }
    };

    const onExternalDrag = (e: React.DragEvent<HTMLElement>) => {
        // accept only supported content types, then set the drop effect (icon)
        const validTypes = ["text/uri-list", "text/html", "text/plain"];
        if (e.dataTransfer.types.find((t) => validTypes.indexOf(t) !== -1) === undefined) return;
        e.dataTransfer.dropEffect = "link";
        return {
            json: {
                type: "tab",
                component: "multitype",
            },
            onDrop: (node?: Node, event?: React.DragEvent<HTMLElement>) => {
                if (!node || !event) return; // aborted drag

                if (node instanceof TabNode) {
                    if (event.dataTransfer) {
                        if (event.dataTransfer.types.indexOf("text/uri-list") !== -1) {
                            const data = event.dataTransfer!.getData("text/uri-list");
                            model!.doAction(Actions.updateNodeAttributes(node.getId(), { name: "Url", config: { data, type: "url" } }));
                        } else if (event.dataTransfer.types.indexOf("text/html") !== -1) {
                            const data = event.dataTransfer!.getData("text/html");
                            model!.doAction(Actions.updateNodeAttributes(node.getId(), { name: "Html", config: { data, type: "html" } }));
                        } else if (event.dataTransfer.types.indexOf("text/plain") !== -1) {
                            const data = event.dataTransfer!.getData("text/plain");
                            model!.doAction(Actions.updateNodeAttributes(node.getId(), { name: "Text", config: { data, type: "text" } }));
                        }
                    }
                }
            },
        };
    };

    // ---------------------------------------------------------------------------
    // The factory: maps each tab's "component" name to the element it renders
    // ---------------------------------------------------------------------------

    const factory = (node: TabNode) => {
        if (renderMode !== "examples") {
            if (!node.getConfig()?.alwaysShowInDemo) {
                if (renderMode === "properties") {
                    return <TabProperties node={node} />;
                } else {
                    return <div style={{ width: "100%", height: "100%" }} />;
                }
            }
        }

        const component = node.getComponent();

        const testFactory = component ? testing.TEST_FACTORY[component] : undefined;
        if (testFactory) {
            return testFactory(node);
        }

        if (component === "json") {
            return <JsonView model={currentModel.current!} />;
        } else if (component === "user sublayout") {
            /*
                If you define both a component and a subLayoutId in the tab then you must
                render the sublayout here by wrapping the <TabLayout> component.
            */
            return (
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div
                        title="Header rendered in factory method"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--color-tab-unselected)",
                            backgroundColor: "var(--color-tabset-background)",
                            marginBottom: 5,
                            fontWeight: 500,
                        }}
                    >
                        User Defined Header
                    </div>
                    <TabLayout tabNode={node} />
                </div>
            );
        } else if (component === "simpleform") {
            return <SimpleForm />;
        } else if (component === "mui") {
            return <MUIComponent />;
        } else if (component === "styledcomp") {
            return <StyledComponentsDemo />;
        } else if (component === "muigrid") {
            return <MUIDataGrid theme={popoutClassName} />;
        } else if (component === "aggrid") {
            return <AGGridExample theme={popoutClassName} node={node} />;
        } else if (component === "chart") {
            return <BarChart />;
        } else if (component === "actionlog") {
            return <ActionLog model={model!} />;
        } else if (component === "map") {
            return <MapComponent />;
        } else if (component === "monaco") {
            return <MonacoComponent />;
        } else if (component === "xterm") {
            return <TerminalComponent getModel={() => currentModel.current} layoutApi={layoutRef} />;
        } else if (component === "grid") {
            if (node.getExtraData().data == null) {
                // create data in node extra data first time accessed
                node.getExtraData().data = makeFakeData();
            }

            return <SimpleTable fields={tableFields} data={node.getExtraData().data} node={node} onDragStart={onTableDragStart} />;
        } else if (component === "sub") {
            let subModel = node.getExtraData().model;
            if (subModel == null) {
                node.getExtraData().model = Model.fromJson(node.getConfig().model);
                subModel = node.getExtraData().model;
                // save submodel on save event
                node.setEventListener("save", (_p: any) => {
                    node.getConfig().model = node.getExtraData().model.toJson();
                });
            }

            return <Layout model={subModel} factory={factory} />;
        } else if (component === "label") {
            return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontSize: 24, fontWeight: 600, color: "gray" }}>{node.getName()}</div>;
        } else if (component === "text") {
            // the Groups demo layout renders text tabs without a config; the content is generated
            // from the tab node and its parent so it reflects the live tree
            const parent = node.getParent();
            const parentName = parent instanceof TabNode || parent instanceof TabSetNode || parent instanceof TabGroupNode ? parent.getName() : undefined;
            const html =
                `<p><b>${node.getName()}</b></p>` +
                `<p>type: ${node.getType()}</p>` +
                `<p>parent: ${parent ? parent.getType() : "none"}${parentName !== undefined ? ` &quot;${parentName}&quot;` : ""}</p>` +
                `<p>path: ${node.getPath()}</p>`;
            return <div dangerouslySetInnerHTML={{ __html: html }} />;
        } else if (component === "otherfeatures") {
            return <NewFeatures />;
        } else if (component === "multitype") {
            try {
                const config = node.getConfig();
                if (config.type === "url") {
                    return <iframe title={node.getId()} src={config.data} style={{ display: "block", border: "none", boxSizing: "border-box" }} width="100%" height="100%" />;
                } else if (config.type === "html") {
                    return <div dangerouslySetInnerHTML={{ __html: config.data }} />;
                } else if (config.type === "text") {
                    return <textarea style={{ position: "absolute", width: "100%", height: "100%", resize: "none", boxSizing: "border-box", border: "none" }} defaultValue={config.data} />;
                }
            } catch (e) {
                return <div>{String(e)}</div>;
            }
        } else if (component === "theme") {
            return <ThemePanel layoutApi={layoutRef} />;
        } else if (component === "model_explorer") {
            return <ModelExplorer node={node} />;
        }

        return null;
    };

    // ---------------------------------------------------------------------------
    // Layout rendering callbacks (passed to the <Layout> component)
    // ---------------------------------------------------------------------------

    const createButton = (title: string, key: string, handler: React.MouseEventHandler | undefined, content: React.ReactNode) => {
        return (
            <button
                className="flexlayout__tab_toolbar_button"
                title={title}
                key={key}
                tabIndex={0} // Safari only tabs to elements with an explicit tabindex
                style={{ display: "flex", alignItems: "center" }}
                onClick={handler}
            >
                {content}
            </button>
        );
    };

    // the Model Explorer tab is located by its fixed id in the layout files
    const findModelExplorerTab = (model: Model): TabNode | undefined => {
        const explorer = model.getNodeById("model_explorer");
        return explorer instanceof TabNode ? explorer : undefined;
    };

    // brings the Model Explorer tab to front (if not already showing) and selects the node in it
    const showNodeInExplorer = (node: TabNode | TabSetNode | BorderNode) => {
        const model = node.getModel();
        const explorer = findModelExplorerTab(model);
        if (explorer === undefined) {
            return;
        }
        const parent = explorer.getParent();
        if (parent instanceof BorderNode) {
            const pos = parent.getChildren().indexOf(explorer);
            if (parent.getSelected() !== pos) {
                model.doAction(Actions.selectTab(explorer.getId()));
            }
        } else if (parent instanceof TabSetNode) {
            if (parent.getSelectedNode() !== explorer) {
                model.doAction(Actions.selectTab(explorer.getId()));
            }
        }
        const extra = explorer.getExtraData();
        const select = extra.modelExplorerSelect as ((id: string) => void) | undefined;
        if (select) {
            // panel is mounted: apply now and clear the pending request
            select(node.getId());
            delete extra.pendingSelectId;
        } else {
            // panel not mounted: applied by its state initializers on mount
            extra.pendingSelectId = node.getId();
        }
    };

    const onContextMenu = (node: TabNode | TabSetNode | BorderNode | TabGroupNode, event: React.MouseEvent<HTMLElement, MouseEvent>) => {
        event.preventDefault();
        event.stopPropagation();

        let items: PopupMenuEntry[] = [];
        if (testing.isTestLayout(layoutName) || layoutName === "default" || layoutName === "simple" || layoutName === "groups") {
            // show menu on the default/simple/test layouts for all node types
            if (node instanceof TabGroupNode) {
                contextMenuHideRef.current?.(); // close any menu already open
                contextMenuHideRef.current = showGroupMenu(node, { x: event.clientX, y: event.clientY }, {});
                return;
            }
            const menu = new ContextMenuBuilder(node, { closeMenu: () => contextMenuHideRef.current?.() });
            if (node instanceof TabNode) {
                menu.add("pin").add("float").add("popout").add("rename");
                if (layoutName === "groups") {
                    menu.addDivider().add("addToNewGroup").add("addToGroup").add("removeFromGroup");
                    menu.addDivider().add("close");
                } else {
                    menu.addDivider().add("closeAll").add("closeRight").add("closeOthers").addDivider().add("close");
                }
            } else if (node instanceof TabSetNode) {
                menu.add("maximize").add("float").add("popout").addDivider().add("close");
            } else {
                menu.add("borderType");
            }
            if (findModelExplorerTab(node.getModel()) !== undefined) {
                menu.addDivider().addCustom({ key: "show-in-explorer", label: "Show in Explorer", onSelect: () => showNodeInExplorer(node) });
            }
            items = menu.build();
            items = testing.wrapContextMenuItems(items);

            if (items.length === 0) {
                return;
            }

            contextMenuHideRef.current?.(); // close any menu already open
            contextMenuHideRef.current = showPopupMenu({
                anchor: { x: event.clientX, y: event.clientY },
                container: node.getLayoutRef()!,
                title: "Menu for " + (node instanceof BorderNode ? node.getType() : node.getName()),
                items,
                onClose: () => {
                    contextMenuHideRef.current = null;
                },
            });
        } else if (layoutName === "otherfeatures") {
            items.push({ key: "option1", label: "Option 1" });
            items.push({ key: "option2", label: "Option 2" });
            contextMenuHideRef.current?.(); // close any menu already open
            contextMenuHideRef.current = showPopupMenu({
                anchor: { x: event.clientX, y: event.clientY },
                container: node.getLayoutRef()!,
                title: "Menu for " + node.getType(),
                items,
                onClose: () => {
                    contextMenuHideRef.current = null;
                },
            });
        }
    };

    const onRenderTab = (node: TabNode, renderValues: ITabRenderValues) => {
        if (layoutName === "otherfeatures" && node.getComponent() === "otherfeatures") {
            renderValues.buttons.push(createButton("Tab settings", "settingbtn", undefined, <SettingsIcon />));
        }

        if (testing.isTestLayout(layoutName)) {
            testing.testOnRenderTab(node, renderValues);
        }
    };

    const onRenderTabSet = (node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) => {
        if (node instanceof TabSetNode) {
            if (layoutName === "otherfeatures") {
                const button = createButton(
                    "Menu for selected tab",
                    "menubtn",
                    (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
                        const selected = node.getSelectedNode();
                        if (selected instanceof TabNode) {
                            onContextMenu(selected, e);
                        }
                    },
                    <MenuIcon />,
                );
                renderValues.leading = <div style={{ display: "flex", alignItems: "center", alignContent: "center", padding: 3 }}>{button}</div>;
            }

            if (layoutName === "otherfeatures") {
                renderValues.buttons.push(createButton("Tabset settings", "settingbtn", undefined, <SettingsIcon />));
            }

            if (layoutName === "default" || layoutName === "groups") {
                const button = createButton("Add tab", "addtab", (_e: React.MouseEvent<HTMLElement, MouseEvent>) => onAddFromTabSetButton(node), <AddIcon />);

                renderValues.stickyButtons.push(button);
            }
        }

        if (
            node instanceof BorderNode &&
            node.getSelected() !== -1 && // only when the border panel is showing
            (layoutName === "default" || layoutName === "otherfeatures" || layoutName === "test_overlay")
        ) {
            // toggle between the split and overlay border types; the icon shows the current
            // mode: the panel splitting the layout, or floating over it
            const overlay = node.isOverlay();
            renderValues.buttons.push(
                createButton(
                    overlay ? "Overlay border (toggle to split)" : "Split border (toggle to overlay)",
                    "bordertype",
                    () => model?.doAction(Actions.setBorderType(node.getId(), overlay ? "split" : "overlay")),
                    overlay ? <OverlayBorderIcon /> : <SplitBorderIcon />,
                ),
            );
        }

        // playwright testing
        if (testing.isTestLayout(layoutName)) {
            testing.testOnRenderTabSet(node, renderValues);
        }
    };

    const onRenderDragRect = (content: React.ReactNode | undefined, _node?: Node, _json?: IJsonTabNode) => {
        if (layoutName === "otherfeatures") {
            return (
                <>
                    {content}
                    <div style={{ whiteSpace: "pre" }}>
                        <br />
                        This is a customized
                        <br />
                        drag rectangle
                    </div>
                </>
            );
        } else {
            return undefined; // use default rendering
        }
    };

    const onAuxMouseClick = (_node: TabNode | TabSetNode | BorderNode | TabGroupNode, _event: React.MouseEvent<HTMLElement, MouseEvent>) => {};

    const onTabSetPlaceHolder = (_node: TabSetNode) => {
        return (
            <div
                key="placeholder"
                style={{
                    display: "flex",
                    flexGrow: 1,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                Drag tabs to this area
            </div>
        );
    };

    const onAction = (action: Action) => {
        return action;
    };

    // ---------------------------------------------------------------------------
    // Toolbar event handlers
    // ---------------------------------------------------------------------------

    const onLayoutChange = (event: React.FormEvent) => {
        const target = event.target as HTMLSelectElement;
        loadLayout(target.value);
    };

    const onReloadFromFile = (_event: React.MouseEvent) => {
        loadLayout(layoutName!, true);
    };

    const onThemeChange = (event: React.FormEvent) => {
        const target = event.target as HTMLSelectElement;
        const themeClassName = "flexlayout__theme_" + target.value;
        document.documentElement.className = themeClassName;
        // need to set popout top level class name to new theme
        setPopoutClassName(themeClassName);
    };

    const onFontSizeChange = (event: React.FormEvent) => {
        const target = event.target as HTMLSelectElement;
        const flexLayoutElement = document.querySelector(".flexlayout__layout") as HTMLElement | null;
        flexLayoutElement!.style.setProperty("--font-size", target.value);
    };

    const onRealtimeResizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRealtimeResize(event.target.checked);
    };

    const onShowLayoutChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setShowLayoutStructure(event.target.checked);
    };

    const onRenderModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setRenderMode(event.target.value as "examples" | "properties" | "blank");
    };

    const onAddActiveClick = (_event: React.MouseEvent) => {
        if (!layoutRef.current) return;
        if (testing.isTestLayout(layoutName)) {
            testing.handleTestAddTab(layoutRef.current);
        } else {
            layoutRef.current.addTabToActiveTabSet({
                component: "grid",
                icon: "images/article.svg",
                name: "Grid " + nextGridIndex.current++,
            });
        }
    };

    const onAddFromTabSetButton = (node: TabSetNode | BorderNode) => {
        const addedTab = layoutRef!.current!.addTabToTabSet(node.getId(), {
            component: "grid",
            name: "Grid " + nextGridIndex.current++,
        });
        console.log("Added tab", addedTab);
    };

    const onAddPopoutClick = (_event: React.MouseEvent) => {
        const rootDiv = layoutRef.current?.getRootDiv();
        if (rootDiv && model) {
            const rootRect = rootDiv.getBoundingClientRect();
            const width = Math.round(rootRect.width / 3);
            const height = Math.round(rootRect.height / 3);
            const x = Math.round((rootRect.width - width) / 2);
            const y = Math.round((rootRect.height - height) / 2);

            model.doAction(
                Actions.createPopout(
                    {
                        type: "row",
                        children: [
                            {
                                type: "tabset",
                                children: [
                                    {
                                        component: "grid",
                                        name: "Grid " + nextGridIndex.current++,
                                    },
                                ],
                            },
                        ],
                    },
                    { x, y, width, height },
                    "float",
                ),
            );
        }
    };

    const onToFromJsonClick = (_event: React.MouseEvent) => {
        if (currentModel.current) {
            // round trip the model: swapping in a new model keeps the tab contents mounted (no
            // flash), and keeping the history means undo/redo continues to work
            setModel(Model.fromJson(currentModel.current.toJson(), currentModel.current), false);
        }
    };

    const onPrintLayoutClick = (_event: React.MouseEvent) => {
        if (model) {
            console.log(JSON.stringify(model.toJson(), null, "\t"));
        }
    };

    let layoutElement: React.ReactNode = "loading ...";
    if (model !== null) {
        layoutElement = (
            <Layout
                ref={layoutRef}
                model={model}
                popoutClassName={popoutClassName}
                popoutWindowName="Demo Popout"
                factory={factory}
                onAction={onAction}
                onRenderTab={onRenderTab}
                onRenderTabSet={onRenderTabSet}
                onRenderDragRect={onRenderDragRect}
                onExternalDrag={onExternalDrag}
                realtimeResize={realtimeResize}
                keyMap={{ focusTabToggle: "F6", focusNextTabset: "Ctrl+]", focusPreviousTabset: "Ctrl+[" }}
                onContextMenu={
                    testing.isTestLayout(layoutName) || layoutName === "default" || layoutName === "simple" || layoutName === "groups" || layoutName === "otherfeatures" ? onContextMenu : undefined
                }
                onAuxMouseClick={layoutName === "otherfeatures" ? onAuxMouseClick : undefined}
                onTabSetPlaceHolder={onTabSetPlaceHolder}
                renderPopoutContent={({ children, popoutDocument }) => <PopoutStyleProvider popoutDocument={popoutDocument}>{children}</PopoutStyleProvider>}
            />
        );
    }

    return (
        <React.StrictMode>
            <div className="app">
                <div className="toolbar" dir="ltr">
                    <select className="toolbar_control" aria-label="Layout" title="Choose the layout to render" onChange={onLayoutChange}>
                        <option value="default">Default</option>
                        <option value="simple">Simple</option>
                        <option value="mosaic">Mosaic Style</option>
                        <option value="sub">SubLayout</option>
                        <option value="complex">Complex</option>
                        <option value="groups">Tab Groups</option>
                        <option value="otherfeatures">Other Features</option>
                    </select>
                    <button key="reloadbutton" className="toolbar_control " onClick={onReloadFromFile} title="Reload layout from file (Ctrl+Alt+R)" style={{ marginLeft: 5 }}>
                        Reload
                    </button>
                    <button key="undobutton" title={"undo (" + undoCount + ")"} className="toolbar_control reset-btn" onClick={undo} disabled={!canUndo} style={{ marginLeft: 5 }}>
                        <img src="images/undo.svg" alt="" style={{ width: "1.5em", height: "1.5em" }} />
                    </button>
                    <button key="redobutton" title={"redo (" + redoCount + ")"} className="toolbar_control reset-btn" onClick={redo} disabled={!canRedo} style={{ marginLeft: 5 }}>
                        <img src="images/redo.svg" alt="" style={{ width: "1.5em", height: "1.5em" }} />
                    </button>
                    <div style={{ flexGrow: 1 }}></div>
                    <button
                        className="toolbar_control"
                        data-id={testing.TEST_IDS.rerender}
                        style={{ marginRight: 5 }}
                        title="Round trip the model through toJson/fromJson and set the new model"
                        onClick={onToFromJsonClick}
                    >
                        To-From JSON
                    </button>
                    <label style={{ marginLeft: 10 }} title="Redraw the layout as splitters are dragged">
                        Realtime resize
                        <input name="realtimeResize" type="checkbox" checked={realtimeResize} onChange={onRealtimeResizeChange} />
                    </label>
                    <label style={{ marginLeft: 10 }} title="Show the structure of the layout, blue for rows, orange for tabsets">
                        Structure
                        <input name="show layout" type="checkbox" checked={showLayoutStructure} onChange={onShowLayoutChange} />
                    </label>
                    <label style={{ marginLeft: 10 }} title="Choose which type of component the factory returns for each tab">
                        Render
                        <select className="toolbar_control" aria-label="Attributes" style={{ marginLeft: 5 }} defaultValue="examples" onChange={onRenderModeChange}>
                            <option value="examples">Examples</option>
                            <option value="properties">Properties</option>
                            <option value="blank">Blank</option>
                        </select>
                    </label>
                    <select className="toolbar_control" aria-label="Font size" title="Font Size" style={{ marginLeft: 5 }} onChange={onFontSizeChange} defaultValue="medium">
                        <option value="xx-small">Size xx-small</option>
                        <option value="x-small">Size x-small</option>
                        <option value="small">Size small</option>
                        <option value="medium">Size medium</option>
                        <option value="large">Size large</option>
                        <option value="8px">Size 8px</option>
                        <option value="10px">Size 10px</option>
                        <option value="12px">Size 12px</option>
                        <option value="14px">Size 14px</option>
                        <option value="16px">Size 16px</option>
                        <option value="18px">Size 18px</option>
                        <option value="20px">Size 20px</option>
                        <option value="25px">Size 25px</option>
                        <option value="30px">Size 30px</option>
                    </select>
                    <select className="toolbar_control" aria-label="Theme" title="Theme" style={{ marginLeft: 5 }} defaultValue="alpha_light" onChange={onThemeChange}>
                        <option value="alpha_light">Alpha Light</option>
                        <option value="alpha_dark">Alpha Dark</option>
                        <option value="alpha_rounded">Alpha Rounded</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="rounded">Rounded</option>
                        <option value="underline">Underline</option>
                        <option value="gray">Gray</option>
                        <option value="aria">Aria</option>
                    </select>
                    <button className="toolbar_control" style={{ marginLeft: 5 }} title="print layout json to the developer console" onClick={onPrintLayoutClick}>
                        {"Print"}
                    </button>
                    <button
                        className="toolbar_control drag-from"
                        data-id={testing.TEST_IDS.addDrag}
                        draggable={true}
                        style={{ height: "30px", marginLeft: 5, border: "none", outline: "none" }}
                        title="Drag from here to add a tab"
                        onDragStart={onAddDragStart}
                    >
                        Add Drag
                    </button>
                    <button className="toolbar_control" data-id={testing.TEST_IDS.addActive} style={{ marginLeft: 5 }} title="Add using Layout.addTabToActiveTabSet" onClick={onAddActiveClick}>
                        Add Active
                    </button>
                    <button className="toolbar_control" style={{ marginLeft: 5 }} title="Add using Actions.createPopout" onClick={onAddPopoutClick}>
                        Add Float
                    </button>
                </div>
                <div className={"contents" + (showLayoutStructure ? " showLayout" : "")}>{layoutElement}</div>
            </div>
        </React.StrictMode>
    );
}

function SimpleTable(props: { fields: any; node: Node; data: any; onDragStart: (event: React.DragEvent<HTMLDivElement>, node: Node) => void }) {
    const headercells = props.fields.map(function (field: any) {
        return <th key={field}>{field}</th>;
    });

    const rows = [];
    for (let i = 0; i < props.data.length; i++) {
        const row = props.fields.map((field: any) => <td key={field}>{props.data[i][field]}</td>);
        rows.push(<tr key={i}>{row}</tr>);
    }

    return (
        <table className="simple_table">
            <tbody>
                <tr>{headercells}</tr>
                {rows}
            </tbody>
        </table>
    );
}

const borderIconStyle = { width: "1em", height: "1em", display: "flex", alignItems: "center" };

// a side panel splitting the layout (side by side)
const SplitBorderIcon = () => (
    <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" style={borderIconStyle} viewBox="0 0 24 24">
        <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="1" fill="none" stroke="var(--color-icon)" strokeWidth="1.5" />
        <rect x="6.75" y="7.75" width="6" height="8.5" rx="1" fill="var(--color-icon)" stroke="var(--color-icon)" />
    </svg>
);

// a side panel floating over the layout (protrudes beyond the frame, knocked out where it crosses it)
const OverlayBorderIcon = () => (
    <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" style={borderIconStyle} viewBox="0 0 24 24">
        <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="1" fill="none" stroke="var(--color-icon)" strokeWidth="1.5" />
        <rect x="3.75" y="4.75" width="8" height="14.5" rx="1" fill="var(--color-icon)" stroke="var(--color-icon)" />
    </svg>
);

const tableFields = ["Name", "Field1", "Field2", "Field3", "Field4", "Field5"];

const randomString = (len: number, chars: string) => {
    const a = [];
    for (let i = 0; i < len; i++) {
        a.push(chars[Math.floor(Math.random() * chars.length)]);
    }

    return a.join("");
};

const makeFakeData = () => {
    const data = [];
    const r = Math.random() * 50;
    for (let i = 0; i < r; i++) {
        const rec: { [key: string]: any } = {};
        rec.Name = randomString(5, "BCDFGHJKLMNPQRSTVWXYZ");
        for (let j = 1; j < tableFields.length; j++) {
            rec[tableFields[j]] = (1.5 + Math.random() * 2).toFixed(2);
        }
        data.push(rec);
    }
    return data;
};

const root = createRoot(document.getElementById("container")!);
root.render(<App />);
