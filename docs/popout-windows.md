# Popout Windows

Tabs can be rendered into external browser windows (useful for multi-monitor setups) by using the `enablePopout` and `enablePopoutIcon` attributes. When enabled, a popout icon appears in the tab header. See [Popout](https://caplin.github.io/FlexLayout/demos/v0.11/examples/popout/) — `examples/popout/Popout.tsx`.

Popout windows require an additional HTML page, `popout.html`, hosted at the same location as the main page (you can copy this from the demo app). The `popout.html` acts as the host for the popped-out tab, and the main page's styles are copied into it at runtime.

Because popout windows render into a different document, any code using global `document` or `window` objects (e.g., for event listeners) will not function correctly. Instead, you must use the `document` or `window` of the popout. The simplest way to obtain them is from the tab node, which knows which window it is currently rendered in (the main window or a popout window):

```javascript
// inside the factory, node is the TabNode being rendered
const currentDocument = node.getDocument();
const currentWindow = node.getWindow();
```

Alternatively, from an element rendered within the popout (such as a ref), use the element's `ownerDocument`:

```javascript
const currentDocument = selfRef.current.ownerDocument;
const currentWindow = currentDocument.defaultView!;
```

In this example, `selfRef` is a React ref to the top-level element in the tab being rendered.

Note: Libraries may support popout windows by allowing you to specify the document to use; for example, see the `getDocument()` callback in ag-Grid at https://www.ag-grid.com/javascript-grid-callbacks/

## Rebuilding components that move between windows

Some controls (monaco, ag-Grid, charts, maps, ...) bind their listeners, popups and tooltips to the document (or window) they were created in. When a tab is popped out or docked back, its React component instance survives but the document it renders into changes, so such a control can end up bound to the wrong document.

The reliable fix is to rebuild the component when the document it is rendered in changes, carrying any state over in a ref. The demo's monaco tab shows the pattern: the editor is re-keyed (remounted) whenever the wrapper element's `ownerDocument` changes, and the edited text is carried across rebuilds via a ref:

```javascript
function MyComponent() {
    const containerRef = React.useRef(null); // the tab's wrapper element
    const editorDocument = React.useRef(null); // document captured at last mount
    const valueRef = React.useRef(initialValue); // state to carry across rebuilds
    const [seed, setSeed] = React.useState(0); // key for the current instance

    React.useEffect(() => {
        const target = containerRef.current;
        if (!target) return;
        if (editorDocument.current !== target.ownerDocument) {
            if (editorDocument.current !== null) {
                setSeed((n) => n + 1); // remount into the new document
            }
            editorDocument.current = target.ownerDocument;
        }
    });

    return (
        <div ref={containerRef} style={{ height: "100%", width: "100%" }}>
            <MyControl key={seed} defaultValue={valueRef.current} />
        </div>
    );
}
```

The initial `ownerDocument` capture is skipped so the component is not needlessly rebuilt on first mount. If the component cannot be rebuilt (for example it holds state that is expensive to recreate), the `enableWindowReMount` attribute forces the whole tab to remount when it is popped out or docked back; use `onRenderTab`/`onAction` or a save/visibility listener to persist state.

## Limitations of Popout Windows

Note this section only applies to window based popouts, not floating panels.

* **React Portals**: FlexLayout uses React Portals for popout content. Code runs in the main window's JS context, effectively extending the rendering area.
* **Event Listeners**: You must use the popout's window/document when adding listeners (e.g., `popoutDocument.addEventListener(...)`).
* **Timer Throttling**: Timers may throttle when the main window is in the background. Use web workers for high-precision timing if needed.
* **Third-Party Libraries**: Controls that rely on the global `document` for event listeners or visibility tracking may require modification.
* **Browser Zoom**: Popouts may not size or position correctly when the browser is zoomed (e.g., at 50% zoom).
* **States**: Popouts cannot reload in maximized or minimized states.
* **State Preservation**: While FlexLayout maintains React state when moving tabs between windows, you can use the `enableWindowReMount` attribute to force a component to re-mount.

See this article about using React portals in this way: https://dev.to/noriste/the-challenges-of-rendering-an-openlayers-map-in-a-popup-through-react-2elh

## Styling Popout Windows with CSS-in-JS

The main page's `<style>`/`<link>` elements are copied into the popout document at runtime. This works for CSS files and for css-in-js libraries that write their rules as text (e.g. Emotion in development), but **not** for rules inserted through the CSSOM `sheet.insertRule()` API — which is what Emotion ("speedy" mode) and styled-components use in production builds. Those rules leave the `<style>` element's `textContent` empty, so a cloned `<style>` would be blank.

Two mechanisms are provided to get css-in-js styles into popouts:

1. **Runtime CSSOM copy (default, works for all css-in-js).** The style copy reads `sheet.cssRules` and rebuilds them in the popout, so rules that were inserted via `insertRule` are captured too. The copied css-in-js tags are then re-synced whenever their rules change while a popout is open (a short poll covers insertions that the MutationObserver cannot see). This is what makes MUI/Emotion tabs style correctly in popouts in production builds with no extra code.

2. **`renderPopoutContent` prop.** Wraps the content rendered into a popout window, giving access to the popout's `window`/`document` so you can provide css-in-js providers that inject directly into the popout document:

```tsx
<Layout
    model={model}
    factory={factory}
    renderPopoutContent={({ children, popoutDocument }) => (
        <StyleSheetManager target={popoutDocument.head}>{children}</StyleSheetManager>
    )}
/>
```

The demo's `PopoutStyleProvider` shows this pattern for styled-components (Emotion's `CacheProvider` cannot target a separate window: tabs keep their React fiber when they move to a popout, so components never re-render under a new cache, and Emotion creates its `<style>` tags with the global document). The `onPopoutOpen`/`onPopoutClose` props are also available if you need to run styling-specific setup or teardown when a popout window opens or closes.

## Popout Windows in Secure Environments

Deployments with strict security headers need the following for popout windows to work:

* **Same origin**: `popout.html` must be served from the same origin as the main page. The popout document runs no scripts of its own; it is driven entirely by the main window's JavaScript, which requires script access to the popout document.
* **Content Security Policy (style-src)**: the main page's stylesheets are copied into the popout document at runtime. `<link rel="stylesheet">` elements work provided their URLs are allowed by the `style-src` of the response serving `popout.html`. Inline `<style>` elements (as injected by CSS-in-JS libraries such as Emotion or styled-components, or by Vite in dev mode) are blocked by a nonce/hash based `style-src`, since the copied elements cannot carry a valid nonce for the popout document — the runtime CSSOM copy described in [Styling Popout Windows with CSS-in-JS](#styling-popout-windows-with-css-in-js) makes css-in-js work in popouts when the policy allows it; under a nonce/hash based `style-src`, prefer real CSS files for anything rendered in popouts.
* **Cross-origin isolation (COOP/COEP)**: if the main page is served with `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers (e.g. for `SharedArrayBuffer`), `popout.html` must be served with compatible headers, otherwise the browser severs the connection between the windows and popouts cannot function. Set the `supportsPopout` prop to `false` to disable popouts explicitly where they cannot be supported.
* **Popup blockers and sandboxed frames**: if `window.open` is blocked (popup blocker, or a sandboxed iframe without `allow-popups`) the popout degrades gracefully to a floating panel. Note that when a saved layout containing popouts is restored on page load, the `window.open` happens without a user gesture and is typically blocked — the popouts become floating panels unless the user has allowed popups for the site.
* **Trusted Types**: the library uses no HTML string injection sinks and is compatible with `require-trusted-types-for 'script'`.
* **Multi-monitor placement**: without the Window Management permission, browsers clamp popup window coordinates to the display of the main window, so a popout saved on a second monitor will restore on the main window's display. Popout positions are saved in the main window's CSS pixels and will scale if the browser zoom changes between sessions.
