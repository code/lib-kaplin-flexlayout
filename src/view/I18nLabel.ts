export enum I18nLabel {
    /** the close button tooltip on a tab */
    Close_Tab = "flexlayout.ui.close.tab",
    /** the pin indicator tooltip on a pinned tab, and the "(Pinned)" suffix added to its accessible name */
    Pinned_Tab = "flexlayout.ui.pinned.tab",
    /** the aria-label of the inline tab rename textbox */
    Rename_Tab = "flexlayout.ui.rename.tab",
    /** the tabset close button tooltip */
    Close_Tabset = "flexlayout.ui.close.tabset",
    /** the active tabset indicator icon tooltip */
    Active_Tabset = "flexlayout.ui.active.tabset",
    /** the drag image text shown while dragging a tabset */
    Move_Tabset = "flexlayout.ui.move.tabset",
    /** the drag image text shown while dragging multiple tabs ("?" is replaced with the tab count) */
    Move_Tabs = "flexlayout.ui.move.tabs (?)",
    /** the drag image text shown while dragging a group ("?" is replaced with the tab count) */
    Move_Group = "flexlayout.ui.move.group (?)",
    /** the tabset maximize button tooltip */
    Maximize = "flexlayout.ui.maximize.tabset",
    /** the tabset restore button tooltip */
    Restore = "flexlayout.ui.restore.tabset",
    /** the toolbar button tooltip that pops the selected tab out into a native window */
    Popout_Tab = "flexlayout.ui.popout.tab",
    /** the toolbar button tooltip that pops the selected tab out into a floating panel */
    Popout_Tab_Float = "flexlayout.ui.popout.tab.float",
    /** the floating panel header button tooltip that pops the panel out into a native window */
    Popout_Float_To_Window = "flexlayout.ui.popout.float.to.window",
    /** the floating panel header drag handle tooltip and its drag image text */
    Dock_Float_To_Layout = "flexlayout.ui.dock.float.to.layout",
    /** the drag image text shown while docking a floating panel ("?" is replaced with the number of tabs) */
    Dock_Float_Tabs = "flexlayout.ui.dock.float.tabs (?)",
    /** the overflow button tooltip and the overflow menu's accessible name */
    Overflow_Menu_Tooltip = "flexlayout.ui.overflow.menu.tooltip",
    /** the splitter's aria-label */
    Splitter = "flexlayout.ui.splitter",
    /** the error boundary message shown when a tab's component fails to render */
    Error_rendering_component = "flexlayout.ui.error.rendering.component",
    /** the error boundary retry button label */
    Error_rendering_component_retry = "flexlayout.ui.error.rendering.component.retry",
    /** the default title for popout windows */
    Popout_Window_Name = "flexlayout.ui.popout.window.name",
    /** the context menu item that starts renaming a tab */
    Menu_Rename = "flexlayout.ui.menu.rename",
    /** the context menu item that pins a tab */
    Menu_Pin = "flexlayout.ui.menu.pin",
    /** the context menu item that unpins a tab */
    Menu_Unpin = "flexlayout.ui.menu.unpin",
    /** the context menu item that pops a tab out into a native window */
    Menu_Popout = "flexlayout.ui.menu.popout",
    /** the context menu item that pops a tab out into a floating panel */
    Menu_Float = "flexlayout.ui.menu.float",
    /** the tabset context menu item that pops the whole tabset out into a native window */
    Menu_Popout_Tabset = "flexlayout.ui.menu.popout.tabset",
    /** the tabset context menu item that pops the whole tabset out into a floating panel */
    Menu_Float_Tabset = "flexlayout.ui.menu.float.tabset",
    /** the tabset context menu item that maximizes the tabset */
    Menu_Maximize = "flexlayout.ui.menu.maximize",
    /** the tabset context menu item that restores a maximized tabset */
    Menu_Restore = "flexlayout.ui.menu.restore",
    /** the border context menu item that switches the border to overlay type */
    Menu_Overlay = "flexlayout.ui.menu.overlay",
    /** the border context menu item that switches the border to split type */
    Menu_Split = "flexlayout.ui.menu.split",
    /** the context menu item that closes every closeable tab in the parent */
    Menu_Close_All = "flexlayout.ui.menu.close.all",
    /** the context menu item that closes the closeable tabs to the right of the tab */
    Menu_Close_Right = "flexlayout.ui.menu.close.right",
    /** the context menu item that closes every closeable tab but the tab itself */
    Menu_Close_Others = "flexlayout.ui.menu.close.others",
    /** the context menu item that adds the tab to a new group */
    Menu_Add_To_New_Group = "flexlayout.ui.menu.add.to.new.group",
    /** the context menu item that adds the tab to an existing group */
    Menu_Add_To_Group = "flexlayout.ui.menu.add.to.group",
    /** the context menu item that moves a tab out of its group */
    Menu_Remove_From_Group = "flexlayout.ui.menu.remove.from.group",
    /** the context menu item that ungroups a group, moving all its tabs back into the tabset */
    Menu_Ungroup = "flexlayout.ui.menu.ungroup",
    /** the context menu item that expands a collapsed group */
    Menu_Expand = "flexlayout.ui.menu.expand",
    /** the context menu item that collapses an expanded group */
    Menu_Collapse = "flexlayout.ui.menu.collapse",
    /** the aria-label of the inline group rename textbox */
    Rename_Group = "flexlayout.ui.rename.group",
    /** the accessible name of the group color chooser */
    Group_Color = "flexlayout.ui.group.color",
    /** the group pill tooltip */
    Group_Pill_Tooltip = "flexlayout.ui.group.pill.tooltip",
    /** the label text next to the group rename input */
    Group_Name_Label = "flexlayout.ui.group.name.label",
    /** the placeholder shown in the group rename input */
    Group_Name_Placeholder = "flexlayout.ui.group.name.placeholder",
    /** the aria-label prefix for individual color swatches ("Group color 1", etc.) */
    Group_Color_N = "flexlayout.ui.group.color.n",
    /** the default name for a new tab group */
    Group_Default_Name = "flexlayout.ui.group.default.name",
}

/** Default English translations for all built-in UI labels. Used as fallback when no i18nTranslator is registered. */
export const I18nLabelDefaults: Record<string, string> = {
    [I18nLabel.Close_Tab]: "Close",
    [I18nLabel.Pinned_Tab]: "Pinned",
    [I18nLabel.Rename_Tab]: "Rename tab",
    [I18nLabel.Close_Tabset]: "Close tabset",
    [I18nLabel.Active_Tabset]: "Active tabset",
    [I18nLabel.Move_Tabset]: "Move tabset",
    [I18nLabel.Move_Tabs]: "Move tabs (?)",
    [I18nLabel.Move_Group]: "Move group (?)",
    [I18nLabel.Maximize]: "Maximize tabset",
    [I18nLabel.Restore]: "Restore tabset",
    [I18nLabel.Popout_Tab]: "Popout selected tab",
    [I18nLabel.Popout_Tab_Float]: "Float selected tab",
    [I18nLabel.Popout_Float_To_Window]: "Popout panel",
    [I18nLabel.Dock_Float_To_Layout]: "Drag into another layout",
    [I18nLabel.Dock_Float_Tabs]: "Dock tabs (?)",
    [I18nLabel.Overflow_Menu_Tooltip]: "Hidden tabs",
    [I18nLabel.Splitter]: "Resize",
    [I18nLabel.Error_rendering_component]: "Error rendering component",
    [I18nLabel.Error_rendering_component_retry]: "Retry",
    [I18nLabel.Popout_Window_Name]: "Popout Window",
    [I18nLabel.Menu_Rename]: "Rename",
    [I18nLabel.Menu_Pin]: "Pin",
    [I18nLabel.Menu_Unpin]: "Unpin",
    [I18nLabel.Menu_Popout]: "Popout",
    [I18nLabel.Menu_Float]: "Float",
    [I18nLabel.Menu_Popout_Tabset]: "Pop out tabset",
    [I18nLabel.Menu_Float_Tabset]: "Float tabset",
    [I18nLabel.Menu_Maximize]: "Maximize",
    [I18nLabel.Menu_Restore]: "Restore",
    [I18nLabel.Menu_Overlay]: "Overlay",
    [I18nLabel.Menu_Split]: "Split",
    [I18nLabel.Menu_Close_All]: "Close All",
    [I18nLabel.Menu_Close_Right]: "Close to the Right",
    [I18nLabel.Menu_Close_Others]: "Close Others",
    [I18nLabel.Menu_Add_To_New_Group]: "Add to new group",
    [I18nLabel.Menu_Add_To_Group]: "Add to group",
    [I18nLabel.Menu_Remove_From_Group]: "Remove from group",
    [I18nLabel.Menu_Ungroup]: "Ungroup",
    [I18nLabel.Menu_Expand]: "Expand",
    [I18nLabel.Menu_Collapse]: "Collapse",
    [I18nLabel.Rename_Group]: "Rename group",
    [I18nLabel.Group_Color]: "Group color",
    [I18nLabel.Group_Pill_Tooltip]: "Tab Group, click to expand/collapse",
    [I18nLabel.Group_Name_Label]: "Name",
    [I18nLabel.Group_Name_Placeholder]: "Group Name",
    [I18nLabel.Group_Color_N]: "Group color ?",
    [I18nLabel.Group_Default_Name]: "Group",
};
