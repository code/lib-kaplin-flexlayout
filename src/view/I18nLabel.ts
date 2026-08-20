export enum I18nLabel {
    /** the close button tooltip on a tab */
    Close_Tab = "Close",
    /** the pin indicator tooltip on a pinned tab, and the "(Pinned)" suffix added to its accessible name */
    Pinned_Tab = "Pinned",
    /** the aria-label of the inline tab rename textbox */
    Rename_Tab = "Rename tab",
    /** the tabset close button tooltip */
    Close_Tabset = "Close tab set",
    /** the active tabset indicator icon tooltip */
    Active_Tabset = "Active tab set",
    /** the drag image text shown while dragging a tabset */
    Move_Tabset = "Move tab set",
    /** the drag image text shown while dragging multiple tabs ("?" is replaced with the tab count) */
    Move_Tabs = "Move tabs (?)",
    /** the drag image text shown while dragging a group ("?" is replaced with the tab count) */
    Move_Group = "Move group (?)",
    /** the tabset maximize button tooltip */
    Maximize = "Maximize tab set",
    /** the tabset restore button tooltip */
    Restore = "Restore tab set",
    /** the toolbar button tooltip that pops the selected tab out into a native window */
    Popout_Tab = "Popout selected tab",
    /** the toolbar button tooltip that pops the selected tab out into a floating panel */
    Popout_Tab_Float = "Float selected tab",
    /** the floating panel header button tooltip that pops the panel out into a native window */
    Popout_Float_To_Window = "Popout panel",
    /** the floating panel header drag handle tooltip and its drag image text */
    Dock_Float_To_Layout = "Drag into another layout",
    /** the drag image text shown while docking a floating panel ("?" is replaced with the number of tabs) */
    Dock_Float_Tabs = "Dock tabs (?)",
    /** the overflow button tooltip and the overflow menu's accessible name */
    Overflow_Menu_Tooltip = "Hidden tabs",
    /** the splitter's aria-label */
    Splitter = "Resize",
    /** the error boundary message shown when a tab's component fails to render */
    Error_rendering_component = "Error rendering component",
    /** the error boundary retry button label */
    Error_rendering_component_retry = "Retry",
    /** the context menu item that starts renaming a tab */
    Menu_Rename = "Rename",
    /** the context menu item that pins a tab */
    Menu_Pin = "Pin",
    /** the context menu item that unpins a tab */
    Menu_Unpin = "Unpin",
    /** the context menu item that pops a tab out into a native window */
    Menu_Popout = "Popout",
    /** the context menu item that pops a tab out into a floating panel */
    Menu_Float = "Float",
    /** the tabset context menu item that pops the whole tabset out into a native window */
    Menu_Popout_Tabset = "Pop out tabset",
    /** the tabset context menu item that pops the whole tabset out into a floating panel */
    Menu_Float_Tabset = "Float tabset",
    /** the tabset context menu item that maximizes the tabset */
    Menu_Maximize = "Maximize",
    /** the tabset context menu item that restores a maximized tabset */
    Menu_Restore = "Restore",
    /** the border context menu item that switches the border to overlay type */
    Menu_Overlay = "Overlay",
    /** the border context menu item that switches the border to split type */
    Menu_Split = "Split",
    /** the context menu item that closes every closeable tab in the parent */
    Menu_Close_All = "Close All",
    /** the context menu item that closes the closeable tabs to the right of the tab */
    Menu_Close_Right = "Close to the Right",
    /** the context menu item that closes every closeable tab but the tab itself */
    Menu_Close_Others = "Close Others",
    /** the context menu item that adds the tab to a new group */
    Menu_Add_To_New_Group = "Add to new group",
    /** the context menu item that adds the tab to an existing group */
    Menu_Add_To_Group = "Add to group",
    /** the context menu item that moves a tab out of its group */
    Menu_Remove_From_Group = "Remove from group",
    /** the context menu item that ungroups a group, moving all its tabs back into the tabset */
    Menu_Ungroup = "Ungroup",
    /** the context menu item that expands a collapsed group */
    Menu_Expand = "Expand",
    /** the context menu item that collapses an expanded group */
    Menu_Collapse = "Collapse",
    /** the aria-label of the inline group rename textbox */
    Rename_Group = "Rename group",
    /** the accessible name of the group color chooser */
    Group_Color = "Group color",
    /** the group pill tooltip */
    Group_Pill_Tooltip = "Tab Group, click or press Enter to expand/collapse",
}
