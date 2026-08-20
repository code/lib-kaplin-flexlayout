export function NewFeatures() {
    return (
        <ul>
            <li>
                New tab set attribute: <b>tabSetEnableTabWrap</b>
                <br />
                <small>All tab sets in this layout will wrap their tabs onto multiple lines when needed</small>
            </li>
            <li>
                New border attribute: <b>enableAutoHide</b>, to hide border if it has zero tabs:
                <br />
                <small>Try moving all tabs from any of the borders</small>
            </li>
            <li>
                Customized tabset rendering using the layout <b>onRenderTabSet</b> property
                <br />
                <small>All tab sets in this layout have an additional menu button before the tabs and a settings button after the tabs</small>
            </li>
            <li>
                Customized tab rendering using the layout <b>onRenderTab</b> property
                <br />
                <small>The &apos;New&apos; tab has an additional settings button</small>
            </li>
            <li>
                Help text (tooltip) option on tabs: <br />
                <small>Hover over this tab button</small>
            </li>
            <li>
                Action to close tab set:
                <br />
                <small>See added x button in this tab set</small>
            </li>
            <li>
                Tab attributes: borderWidth, borderHeight to allow tabs to have individual sizes in borders:
                <br />
                <small>Try the &apos;With border sizes&apos; tab</small>
            </li>
            <li>
                Customize the drag rectangle using the callback property: <b>onRenderDragRect</b> <br />
                <small>In this layout all drag rectangles are custom rendered</small>
            </li>

            <li>
                New <b>onContextMenu</b> prop:
                <br />
                <small>All tabs and tab sets in this layout have a custom context menu</small>
            </li>
        </ul>
    );
}
