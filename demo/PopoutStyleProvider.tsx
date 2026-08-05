import * as React from "react";
import { StyleSheetManager } from "styled-components";

// Injects css-in-js styles into the popout document. Two mechanisms are needed because the css-in-js
// libraries behave differently when their styles are rendered into a separate window:
//
//  * styled-components: <StyleSheetManager target> makes it inject its <style> tags (and CSSOM
//    rules) directly into the popout document's head.
//
//  * emotion (used by MUI): a CacheProvider targeting the popout document does NOT work here - tabs
//    keep their React fiber when they move to a popout (so they never re-render under a new cache),
//    and emotion's sheet creates its <style> tags with the global document, so cross-window
//    containers cannot be targeted. emotion/MUI styles are instead covered by the runtime CSSOM
//    style copy in PopoutWindow (which reads sheet.cssRules that a plain clone would miss).
//
// For the main document the default sheets already target the main head, so children pass through.

export const PopoutStyleProvider = ({ popoutDocument, children }: { popoutDocument: Document; children: React.ReactNode }) => {
    if (popoutDocument === document) {
        return children;
    }
    return <StyleSheetManager target={popoutDocument.head}>{children}</StyleSheetManager>;
};
