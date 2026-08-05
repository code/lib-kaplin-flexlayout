import * as React from "react";
import { createPortal } from "react-dom";
import { CLASSES } from "./CSSClassNames";
import { LayoutController } from "./layout/LayoutInternal";
import { ModelLayout } from "../model/ModelLayout";

// fallback so a stylesheet that never fires load/error (blocked, hung) cannot permanently
// stall the popout from rendering its content
const STYLE_LOAD_TIMEOUT_MS = 2000;
// css-in-js rules added via the CSSOM sheet.insertRule api are invisible to the MutationObserver,
// so the copied style tags are polled for rule-count changes while the popout is open
const STYLE_POLL_INTERVAL_MS = 750;

/** @internal */
export interface IPopoutWindowProps {
    title: string;
    controller: LayoutController;
    layout: ModelLayout;
    url: string;
    onCloseLayout: (layout: ModelLayout) => void;
}

/** @internal */
export const PopoutWindow = (props: React.PropsWithChildren<IPopoutWindowProps>) => {
    const { title, controller, layout, url, onCloseLayout, children } = props;
    const popoutWindow = React.useRef<Window>(null);
    const [content, setContent] = React.useState<HTMLElement | undefined>(undefined);
    // the popout window/document, captured when the window loads (needed by renderPopoutContent)
    const [popoutWindowState, setPopoutWindowState] = React.useState<Window | undefined>(undefined);
    const [popoutDocument, setPopoutDocument] = React.useState<Document | undefined>(undefined);
    // map from main docs style -> this docs equivalent style
    const styleMap = React.useMemo(() => new Map<HTMLElement, HTMLElement>(), []);

    const initializedRef = React.useRef(false);
    const observerRef = React.useRef<MutationObserver | null>(null);
    const pollTimerRef = React.useRef<number | null>(null);
    // per-source css rule count, to only re-sync css-in-js tags whose rules actually changed
    const lastRuleCountRef = React.useRef<Map<HTMLElement, number>>(new Map());

    React.useLayoutEffect(() => {
        if (!initializedRef.current && content) {
            initializedRef.current = true;
            controller.redrawLayout();
            // the popout content just mounted, so css-in-js libraries have inserted their rules for
            // it (invisible to the MutationObserver); re-sync so those styles appear without waiting
            // for the next poll tick
            resyncStyles(styleMap);
        }
    }, [content, controller, styleMap]);

    React.useLayoutEffect(() => {
        // listen for parent unloading to remove all popouts
        const onMainWindowBeforeUnload = () => {
            if (popoutWindow.current) {
                const closedWindow = popoutWindow.current;
                popoutWindow.current = null; // need to set to null before close, since this will trigger popup window before unload...
                closedWindow.close();
            }
        };

        if (!popoutWindow.current) {
            // only create window once, even in strict mode
            const layoutId = layout.getLayoutId();
            const rect = layout.getRect();

            popoutWindow.current = window.open(url, layoutId, `left=${rect.x},top=${rect.y},width=${rect.width},height=${rect.height}`);

            if (popoutWindow.current) {
                window.addEventListener("beforeunload", onMainWindowBeforeUnload);

                popoutWindow.current.addEventListener("load", () => {
                    if (popoutWindow.current) {
                        popoutWindow.current.focus();

                        // note: resizeto must be before moveto in chrome otherwise the window will end up at 0,0
                        popoutWindow.current.resizeTo(rect.width, rect.height);
                        popoutWindow.current.moveTo(rect.x, rect.y);

                        // converge on the metrics used when saving (screenLeft/Top, outerWidth/Height):
                        // browsers disagree on the reference points of resizeTo/moveTo, so correct by the
                        // reported difference - save/restore cycles then cannot drift
                        const win = popoutWindow.current;
                        win.resizeBy(rect.width - win.outerWidth, rect.height - win.outerHeight);
                        win.moveBy(rect.x - win.screenLeft, rect.y - win.screenTop);

                        const popoutDocument = popoutWindow.current.document;
                        setPopoutWindowState(popoutWindow.current);
                        setPopoutDocument(popoutDocument);
                        popoutDocument.title = title;
                        // carry over the language/direction so assistive technology in the popout
                        // announces content correctly
                        if (document.documentElement.lang) {
                            popoutDocument.documentElement.lang = document.documentElement.lang;
                        }
                        if (document.documentElement.dir) {
                            popoutDocument.documentElement.dir = document.documentElement.dir;
                        }
                        const popoutContent = popoutDocument.createElement("div");
                        popoutContent.className = CLASSES.FLEXLAYOUT__FLOATING_WINDOW_CONTENT;
                        popoutDocument.body.appendChild(popoutContent);
                        // notify the app the popout document is ready, before its content renders,
                        // so styling-specific setup (e.g. an emotion cache targeting this document)
                        // can run in time
                        controller.getProps().onPopoutOpen?.(layout, popoutWindow.current, popoutDocument);
                        copyStyles(popoutDocument, styleMap).then(() => {
                            setContent(popoutContent); // re-render once link styles loaded
                        });

                        // listen for style mutations. subtree + characterData so we also catch
                        // css-in-js libraries (styled-components, emotion) mutating the text of an
                        // existing <style> in place - a childList-only observer would miss those and
                        // leave the popout with stale styles. (rules inserted purely via the CSSOM
                        // sheet.insertRule api are not observable by MutationObserver at all.)
                        observerRef.current = new MutationObserver((mutationsList: MutationRecord[]) => handleStyleMutations(mutationsList, popoutDocument, styleMap));
                        observerRef.current.observe(document.head, { childList: true, subtree: true, characterData: true });

                        // poll the copied css-in-js style tags for CSSOM rule changes (the observer
                        // cannot see them) and re-sync any that changed
                        pollTimerRef.current =
                            popoutDocument.defaultView?.setInterval(() => {
                                resyncChangedStyles(styleMap, lastRuleCountRef.current);
                            }, STYLE_POLL_INTERVAL_MS) ?? null;

                        // listen for popout unloading (needs to be after load for safari)
                        popoutWindow.current.addEventListener("beforeunload", () => {
                            if (popoutWindow.current) {
                                controller.getProps().onPopoutClose?.(layout, popoutWindow.current, popoutDocument);
                                onCloseLayout(layout); // remove the layout in the model
                                popoutWindow.current = null;
                                observerRef.current?.disconnect();
                                observerRef.current = null;
                                if (pollTimerRef.current != null) {
                                    popoutDocument.defaultView?.clearInterval(pollTimerRef.current);
                                    pollTimerRef.current = null;
                                }
                            }
                        });
                    }
                });
            } else {
                console.warn(`Unable to open window ${url}`);
                onCloseLayout(layout); // remove the layout in the model
            }
        }
        return () => {
            window.removeEventListener("beforeunload", onMainWindowBeforeUnload);
            popoutWindow.current?.close();
            popoutWindow.current = null;
            observerRef.current?.disconnect();
            observerRef.current = null;
            if (pollTimerRef.current != null) {
                pollTimerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (content !== undefined) {
        const renderPopoutContent = controller.getProps().renderPopoutContent;
        let rendered = children;
        if (renderPopoutContent && popoutDocument) {
            // allow the app to wrap popout content with css-in-js providers (e.g. a styled-components
            // StyleSheetManager) that inject styles into the popout document
            rendered = renderPopoutContent({ children, layout, popoutWindow: popoutWindowState ?? window, popoutDocument });
        }
        return createPortal(rendered, content);
    } else {
        return null;
    }
};

function handleStyleMutations(mutationsList: MutationRecord[], popoutDocument: Document, styleMap: Map<HTMLElement, HTMLElement>) {
    for (const mutation of mutationsList) {
        if (mutation.type === "childList" && mutation.target === document.head) {
            // style/link nodes added to or removed from the head
            for (const addition of mutation.addedNodes) {
                if (addition instanceof HTMLLinkElement || addition instanceof HTMLStyleElement) {
                    copyStyle(popoutDocument, addition, styleMap);
                }
            }
            for (const removal of mutation.removedNodes) {
                if (removal instanceof HTMLLinkElement || removal instanceof HTMLStyleElement) {
                    const popoutStyle = styleMap.get(removal);
                    if (popoutStyle) {
                        popoutStyle.remove();
                        styleMap.delete(removal);
                    }
                }
            }
        } else {
            // a mutation inside an existing <style> (css-in-js updating its text): re-sync the
            // owning style's current text (or css rules) into its clone in the popout
            const styleElement = findOwningStyle(mutation.target);
            const clone = styleElement && styleMap.get(styleElement);
            if (styleElement && clone) {
                syncStyleElement(styleElement, clone as HTMLStyleElement);
            }
        }
    }
}

/** @internal */
function findOwningStyle(node: Node): HTMLStyleElement | undefined {
    let el: Node | null = node instanceof HTMLElement ? node : node.parentNode;
    while (el && !(el instanceof HTMLStyleElement)) {
        el = el.parentNode;
    }
    return el instanceof HTMLStyleElement ? el : undefined;
}

/** @internal */
function copyStyles(popoutDoc: Document, styleMap: Map<HTMLElement, HTMLElement>): Promise<boolean[]> {
    const promises: Promise<boolean>[] = [];
    const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]') as NodeListOf<HTMLElement>;
    for (const element of styleElements) {
        copyStyle(popoutDoc, element, styleMap, promises);
    }
    return Promise.all(promises);
}

/** @internal */
function copyStyle(popoutDoc: Document, element: HTMLElement, styleMap: Map<HTMLElement, HTMLElement>, promises?: Promise<boolean>[]) {
    if (element instanceof HTMLLinkElement) {
        // prefer links since they will keep paths to images etc
        const linkElement = element.cloneNode(true) as HTMLLinkElement;
        popoutDoc.head.appendChild(linkElement);
        styleMap.set(element, linkElement);

        if (promises) {
            promises.push(
                new Promise((resolve) => {
                    // resolve on error and after a timeout as well as on load: if a stylesheet is
                    // blocked (CSP/adblock), 404s, or never fires load, the aggregate promise must
                    // still settle - otherwise setContent is never called and the popout stays blank
                    let settled = false;
                    const done = (loaded: boolean) => {
                        if (!settled) {
                            settled = true;
                            resolve(loaded);
                        }
                    };
                    linkElement.onload = () => done(true);
                    linkElement.onerror = () => done(false);
                    popoutDoc.defaultView?.setTimeout(() => done(false), STYLE_LOAD_TIMEOUT_MS);
                }),
            );
        }
    } else if (element instanceof HTMLStyleElement) {
        try {
            const styleElement = element.cloneNode(true) as HTMLStyleElement;
            popoutDoc.head.appendChild(styleElement);
            syncStyleElement(element, styleElement);
            styleMap.set(element, styleElement);
        } catch (e) {
            // can throw an exception
        }
    }
}

/** @internal sync the source <style>'s rules into the popout clone. css-in-js libraries (emotion,
 *  styled-components) insert rules through the CSSOM sheet.insertRule api in production ("speedy"
 *  mode), leaving textContent empty - a clone would be blank, so rebuild the clone from the sheet's
 *  css rules in that case */
function syncStyleElement(source: HTMLStyleElement, clone: HTMLStyleElement) {
    const text = source.textContent ?? "";
    if (text.trim() !== "") {
        clone.textContent = text;
    } else {
        try {
            clone.textContent = "";
            const rules = source.sheet?.cssRules;
            if (rules) {
                for (const rule of rules) {
                    clone.sheet!.insertRule(rule.cssText, clone.sheet!.cssRules.length);
                }
            }
        } catch (e) {
            // cross-origin sheets or unreadable rules are ignored
        }
    }
}

/** @internal re-sync every copied style tag (used after the popout content first mounts, when
 *  css-in-js rules for the newly rendered content were inserted invisibly to the observer) */
function resyncStyles(styleMap: Map<HTMLElement, HTMLElement>) {
    for (const [source, clone] of styleMap) {
        if (source instanceof HTMLStyleElement) {
            syncStyleElement(source, clone as HTMLStyleElement);
        }
    }
}

/** @internal poll the css-in-js (CSSOM-inserted) style tags and re-sync any whose rule count
 *  changed; text-based tags are already kept in sync by the MutationObserver */
function resyncChangedStyles(styleMap: Map<HTMLElement, HTMLElement>, lastRuleCount: Map<HTMLElement, number>) {
    for (const [source, clone] of styleMap) {
        if (!(source instanceof HTMLStyleElement) || (source.textContent ?? "").trim() !== "") {
            continue;
        }
        let count = 0;
        try {
            count = source.sheet?.cssRules.length ?? 0;
        } catch (e) {
            // unreadable sheet
        }
        if (count !== lastRuleCount.get(source)) {
            lastRuleCount.set(source, count);
            syncStyleElement(source, clone as HTMLStyleElement);
        }
    }
}

PopoutWindow.displayName = "PopoutWindow"; // name in react dev tools
