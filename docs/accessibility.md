# Accessibility

FlexLayout has keyboard operability, ARIA semantics and visible focus styling built in.

## ARIA roles

* Tabs follow the [WAI-ARIA Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): the tab strip is a `tablist`, each tab button is a `tab` with `aria-selected`, and each tab's content area is a `tabpanel` labelled by its tab (`aria-labelledby`).
* Splitters are exposed as `separator` elements with `aria-orientation` and `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.
* The tab overflow menu (and the reusable popup menu below) use `role="menu"`/`role="menuitem"`; the button that opens the overflow menu advertises `aria-haspopup` and `aria-expanded`.
* Decorative icons are hidden from assistive technology with `aria-hidden`.
* Tabs carry explicit accessible names (including pinned state), advertise their keyboard shortcuts via `aria-keyshortcuts`, and toggle buttons expose their state via `aria-pressed`.
* Group pills are exposed as disclosure buttons (`role="button"` with `aria-expanded`) named after the group.

## Keyboard operation

| Context | Keys | Action                                                                         |
| --- | --- |--------------------------------------------------------------------------------|
| Tabs | Arrow keys | Move focus between tabs in a tabset                                            |
| Tabs | Enter / Space | Select the focused tab                                                         |
| Tabs | Ctrl+Delete (default, rebindable) | Close the focused tab (when it is closeable)                                   |
| Tabs | F2 (default, rebindable) | Rename the focused tab (when it is renameable)                                 |
| Tabs | `focusTabToggle` binding (off by default) | Toggle focus between the selected tab button and its content                   |
| Group pills | Enter / Space | Collapse or expand the focused group                                           |
| Group pills | ContextMenu / Shift+F10 | Open the group menu (rename, color, collapse/expand, ungroup)                  |
| Layout | `focusNextTabset` / `focusPreviousTabset` bindings (off by default) | Move focus to the next / previous tabset, mapped to Ctrl+[, Ctrl+] in the demo |
| Splitters | Arrow keys | Resize                                                                         |
| Overlay borders | Escape (default, rebindable) | Close the open overlay panel (focus returns to the border tab)                 |
| Menus | Arrow keys, Home / End, type a letter | Move between items                                                             |
| Menus | Enter / Space | Activate the focused item                                                      |
| Menus | Escape / Tab | Close and return focus to the trigger                                          |

## Configurable shortcuts (the `keyMap` prop)

The command shortcuts above are configured through the `keyMap` layout prop. Bindings are merged over the exported `defaultKeyMap`, and passing an explicit `undefined` for a binding disables that shortcut (WCAG 2.1.4 requires shortcuts to be remappable or off):

```tsx
<Layout
    model={model}
    factory={factory}
    keyMap={{ focusTabToggle: "F6", focusNextTabset: "Ctrl+]", focusPreviousTabset: "Ctrl+[" }}
/>
```

* A binding is a `KeyboardEvent.key` name, optionally prefixed with the modifiers Ctrl, Shift, Alt or Meta joined with `+` — e.g. `"F2"`, `"Escape"`, `"Ctrl+Delete"`, `"Ctrl+]"`. Prefer function keys or modifier combinations: WCAG 2.1.4 requires single printable-character shortcuts to be remappable or off by default.
* The configured bindings are advertised to assistive technology via `aria-keyshortcuts` (on the tab buttons, tab panels and tablists), so the advertised shortcuts always match the configured ones.
* `defaultKeyMap` is exported so an application can display the bindings (e.g. in a keyboard-help dialog) or register them with its own shortcut manager.
* The structural keys of the ARIA widget patterns (arrow keys within a tablist, Enter/Space activation, menu navigation, splitter arrows) are fixed and not remappable — assistive technology announces these from the widget roles themselves.
* Pressing Enter on an already selected tab also moves focus into its content (in addition to the optional `focusTabToggle` binding).

## Focus styling

The bundled themes draw a visible focus outline driven by the `--fl-color-focus` CSS variable (overridable globally via `--flexlayout-color-focus`). Override it (alongside the other theme CSS variables) to match your design system.

## Reusable menu for application context menus

The accessible menu control used for tab overflow is also exported for your own context menus, so they get the same keyboard and ARIA behaviour. It has no dependency on the layout model and can be used declaratively (`<PopupMenu>`) or imperatively (`showPopupMenu(...)`, e.g. from the `onContextMenu` layout prop).
