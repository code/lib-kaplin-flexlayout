import { Model } from "./Model";
import { Rect } from "./Rect";

/**
 * Minimal view-side contract required by the model layer. Implemented by
 * LayoutController; declared here so src/model has no dependency on src/view.
 *
 * @internal
 */
export interface ILayoutController {
    getCurrentWindow(): Window | undefined;
    getWindowId(): string | undefined;
    getModel(): Model;
    getDomRect(): Rect;
    getLayoutRef(): HTMLElement | null;
}
